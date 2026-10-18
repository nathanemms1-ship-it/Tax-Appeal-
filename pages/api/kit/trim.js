/**
 * POST /api/kit/trim — a Florida reservation's petition deadline. 18 Oct 2026.
 *
 *   { o, t, action: 'load' }      what /kit/trim shows
 *   { o, t, trimDeadline }        the deadline printed on the TRIM notice
 *
 * Authenticated by the private link in the receipt and the reminders (the same
 * HMAC as the Georgia notice link, lib/kit/noticeLink.js). The date is checked
 * and stored, then lib/kit/flPresale.js takes the reservation as far as it can
 * go: if this year's roll has already confirmed the case, the kit is sent now.
 */
import { enforceRateLimit } from '../../../lib/rateLimit';
import { getSupabaseAdmin } from '../supabase';
import { alertOps } from '../../../lib/alertOps';
import { checkNoticeToken } from '../../../lib/kit/noticeLink';
import { KIT_ROW_COLUMNS } from '../../../lib/kit/dispatchKit';
import { processFlPresale, flTableDeadline } from '../../../lib/kit/flPresale';
import { flPresaleRunDeps } from '../../../lib/kit/flPresaleRun';
import { FL_QUOTE } from '../../../lib/kit/flQuote';

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
const COLUMNS = `${KIT_ROW_COLUMNS}, stripe_session_id, amount_paid`;

export function trimView(row) {
  const k = row.kit_order || {};
  return {
    status: row.dispute_status,
    address: k.property?.address || null,
    county: k.property?.county || row.county || null,
    taxYear: k.taxYear || null,
    confirmed: k.rollResult?.decision === FL_QUOTE.CASE,
    trimDeadline: k.trimDeadline || null,
    tableDeadline: k.presale ? flTableDeadline(k.property?.county, k.taxYear) : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'kit-trim', 10, 60)) return;
  if (await enforceRateLimit(req, res, 'kit-trim', 40, 3600)) return;

  const b = req.body || {};
  const orderId = typeof b.o === 'string' ? b.o.trim().slice(0, 64) : '';
  if (!orderId || !checkNoticeToken(orderId, b.t)) return res.status(403).json({ error: 'This link is not valid. Use the link in your email, or contact customerservice@taxappealusa.com.' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Please try again in a few minutes.' });
  const { data: row, error } = await supabase.from('orders').select(COLUMNS).eq('id', orderId).maybeSingle();
  if (error || !row) return res.status(404).json({ error: 'We could not find this order. Contact customerservice@taxappealusa.com.' });
  if (row.state_code !== 'FL' || row.kit_order?.presale !== true) return res.status(409).json({ error: 'This link is for a Florida reservation. Contact customerservice@taxappealusa.com.' });

  const view = trimView(row);
  if (b.action === 'load') return res.status(200).json(view);

  const trimDeadline = /^\d{4}-\d{2}-\d{2}$/.test(String(b.trimDeadline || '')) ? b.trimDeadline : null;
  if (!trimDeadline) return res.status(400).json({ error: 'Please enter the petition deadline printed on your TRIM notice.' });

  try {
    const r = await processFlPresale(row, { ...flPresaleRunDeps(row, { supabase, alertOps }), trimDeadline });
    if (r.reason === 'in_progress') return res.status(409).json({ ...view, error: 'We are checking your reservation right now. Please try again in a minute.' });
    if (r.reason === 'bad_deadline') return res.status(400).json({ ...view, error: `That date does not look like a ${view.taxYear || ''} petition deadline. Please check your TRIM notice: it falls between August and October.`.replace('  ', ' ') });
    return res.status(200).json({ ...view, ...r, trimDeadline });
  } catch (e) {
    await alertOps('FL pre-sale deadline step threw', `order=${row.id}\n${e?.message}`, { force: true });
    return res.status(500).json({ error: 'Something went wrong on our side. Your payment is safe and we have been alerted.' });
  }
}
