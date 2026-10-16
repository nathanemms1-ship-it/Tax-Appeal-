/**
 * POST /api/kit/notice — a pre-sale customer enters their assessment notice.
 * (16 Oct 2026; Nathan: "I want to keep pre sale".)
 *
 *   { o, t, action: 'load' }              what the page needs to show
 *   { o, t, noticeValue, noticeDate, ... } the notice; lib/kit/presale.js decides
 *
 * Authenticated by the private link in the receipt and the reminders
 * (lib/kit/noticeLink.js): an HMAC of the order id, nothing else. It can only
 * ever enter a notice for that one order.
 */
import Stripe from 'stripe';
import { Resend } from 'resend';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { getSupabaseAdmin } from '../supabase';
import { alertOps } from '../../../lib/alertOps';
import { checkNoticeToken } from '../../../lib/kit/noticeLink';
import { processGaNotice } from '../../../lib/kit/presale';
import { dispatchKit, KIT_ROW_COLUMNS } from '../../../lib/kit/dispatchKit';
import { formForCounty, FormError } from '../../../lib/kit/forms/gaForms';
import { quoteDeps } from '../ga-kit-quote';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

const COLUMNS = `${KIT_ROW_COLUMNS}, stripe_session_id, amount_paid`;
const bool = (v) => (typeof v === 'boolean' ? v : undefined);

/** Questions the county's own form asks, asked here because the pre-sale did not. */
function countyNeeds(county, taxYear) {
  try { return formForCounty(county, { taxYear }).needs || []; } catch (e) { if (e instanceof FormError) return []; throw e; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'kit-notice', 10, 60)) return;
  if (await enforceRateLimit(req, res, 'kit-notice', 40, 3600)) return;

  const b = req.body || {};
  const orderId = typeof b.o === 'string' ? b.o.trim().slice(0, 64) : '';
  if (!orderId || !checkNoticeToken(orderId, b.t)) return res.status(403).json({ error: 'This link is not valid. Use the link in your email, or contact customerservice@taxappealusa.com.' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Please try again in a few minutes.' });
  const { data: row, error } = await supabase.from('orders').select(COLUMNS).eq('id', orderId).maybeSingle();
  if (error || !row) return res.status(404).json({ error: 'We could not find this order. Contact customerservice@taxappealusa.com.' });

  const k = row.kit_order || {};
  const view = {
    status: row.dispute_status,
    address: k.property?.address || null,
    county: k.property?.county || row.county || null,
    taxYear: k.taxYear || null,
    needs: k.presale ? countyNeeds(k.property?.county, k.taxYear) : [],
  };
  if (b.action === 'load') return res.status(200).json(view);

  const notice = {
    noticeValue: b.noticeValue,
    noticeDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.noticeDate || '')) ? b.noticeDate : null,
    parcelId: typeof b.parcelId === 'string' ? b.parcelId.trim().slice(0, 40) : '',
    ownedOnJan1: bool(b.ownedOnJan1), fultonBilling100: bool(b.fultonBilling100), virtualHearing: bool(b.virtualHearing),
  };
  if (!notice.noticeDate) return res.status(400).json({ error: 'Please enter the date printed on your notice.' });

  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  const update = (patch) => supabase.from('orders').update(patch).eq('id', row.id);

  try {
    const r = await processGaNotice(row, notice, {
      quoteDeps: quoteDeps({ ...k.quoteInput, taxYear: k.taxYear }),
      claim: async (from, to) => {
        const { data } = await supabase.from('orders').update({ dispute_status: to }).eq('id', row.id).eq('dispute_status', from).select('id');
        return Array.isArray(data) && data.length === 1;
      },
      update,
      refund: async (o) => {
        if (!stripe) throw new Error('Stripe is not configured');
        const session = await stripe.checkout.sessions.retrieve(o.stripe_session_id);
        const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (!pi) throw new Error('No payment intent on the session');
        return stripe.refunds.create({ payment_intent: pi, metadata: { order_id: o.id, reason: 'presale_no_case' } }, { idempotencyKey: `presale-refund-${o.id}` });
      },
      dispatch: (o) => dispatchKit(o, { supabase, resend, alertOps }),
      sendEmail: async ({ to, subject, text }) => {
        if (!resend || !to) return;
        await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [to], subject, text });
      },
      alertOps,
    });
    return res.status(200).json({ ...view, ...r });
  } catch (e) {
    await alertOps('Pre-sale notice step threw', `order=${row.id}\n${e?.message}`, { force: true });
    return res.status(500).json({ error: 'Something went wrong on our side. Your payment is safe and we have been alerted.' });
  }
}

