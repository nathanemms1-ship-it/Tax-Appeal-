/**
 * POST /api/kit/outcome — the customer tells us what the county decided.
 * (17 Oct 2026; lib/kit/outcome.js.)
 *
 *   { o, t, action: 'load' }                    what /outcome shows
 *   { o, t, answer, newValue? }                  record it
 *
 * Authenticated by the private outcome link (an HMAC of the order id). "Not
 * lowered" records next year's free kit, emails the customer, and tells ops.
 */
import { Resend } from 'resend';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { getSupabaseAdmin } from '../supabase';
import { alertOps } from '../../../lib/alertOps';
import { checkOutcomeToken, outcomePatch, guaranteeEmail, OUTCOMES, ASKABLE } from '../../../lib/kit/outcome';

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
const DECIDED = ['approved', 'partial', 'denied'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'kit-outcome', 10, 60)) return;
  const b = req.body || {};
  const orderId = typeof b.o === 'string' ? b.o.trim().slice(0, 64) : '';
  if (!orderId || !checkOutcomeToken(orderId, b.t)) return res.status(403).json({ error: 'This link is not valid. Use the link in your email, or contact customerservice@taxappealusa.com.' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Please try again in a few minutes.' });
  const { data: row, error } = await supabase.from('orders').select('id, state_code, customer_name, customer_email, dispute_status, payment_status, kit_order').eq('id', orderId).maybeSingle();
  if (error || !row) return res.status(404).json({ error: 'We could not find this order. Contact customerservice@taxappealusa.com.' });

  const k = row.kit_order || {};
  const view = { state: row.state_code, status: row.dispute_status, address: k.property?.address || null, taxYear: k.taxYear || null, answer: k.after?.outcome?.answer || null, freeKitYear: k.after?.guarantee?.freeKitYear || null };
  if (b.action === 'load') return res.status(200).json(view);

  const answer = typeof b.answer === 'string' ? b.answer : '';
  if (!OUTCOMES[answer]) return res.status(400).json({ error: 'Please choose one of the answers.' });
  // A decision already recorded (by them, or from the county's letter) is not
  // overwritten from a link: a person fixes a wrong one.
  if (DECIDED.includes(row.dispute_status)) return res.status(200).json({ ...view, done: true });
  if (!ASKABLE.includes(row.dispute_status) || row.payment_status !== 'paid') return res.status(409).json({ ...view, error: 'There is nothing to record for this order yet. Questions: customerservice@taxappealusa.com.' });

  const patch = outcomePatch(row, answer, { newValue: b.newValue, source: 'customer' });
  const { error: upErr } = await supabase.from('orders').update(patch).eq('id', row.id).eq('dispute_status', row.dispute_status);
  if (upErr) return res.status(500).json({ error: 'We could not save that. Please try again.' });

  const g = patch.kit_order.after.guarantee;
  if (answer === 'not_lowered' && g) {
    await alertOps('Free next-year kit recorded', `order=${row.id} ${g.property || ''} parcel=${g.parcelId || ''} free kit year=${g.freeKitYear}`, { key: `guarantee:${row.id}` });
    if (process.env.RESEND_API_KEY && row.customer_email) {
      try {
        const mail = guaranteeEmail(row);
        await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [row.customer_email], subject: mail.subject, text: mail.text });
      } catch (e) { console.error(`[kit/outcome] guarantee email failed for ${row.id}:`, e?.message); }
    }
  }
  return res.status(200).json({ ...view, answer, status: patch.dispute_status || row.dispute_status, freeKitYear: g?.freeKitYear || null, done: true });
}
