/**
 * POST /api/kit/sent — the customer tells us their kit is signed and sent.
 * (17 Oct 2026. The kit's checklist has always said "Tell us it is mailed at
 * taxappealusa.com/mailed"; until today that page did not exist.)
 *
 *   { o, t, action: 'load' }      what /mailed shows
 *   { o, t, sentOn: 'YYYY-MM-DD' } mark it sent: status kit_sent, reminders stop
 *
 * Authenticated by the private link (lib/kit/afterMailing.js sentUrl): an HMAC
 * of the order id. It can only ever mark that one order sent.
 */
import { enforceRateLimit } from '../../../lib/rateLimit';
import { getSupabaseAdmin } from '../supabase';
import { checkSentToken, OUT_WITH_CUSTOMER, AFTER_STATUS } from '../../../lib/kit/afterMailing';

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };

/** The date the customer says they sent it: today or up to 60 days back, never in the future. */
export function cleanSentOn(v, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return today;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || v > today || now.getTime() - d.getTime() > 60 * 86400000) return today;
  return v;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'kit-sent', 10, 60)) return;
  const b = req.body || {};
  const orderId = typeof b.o === 'string' ? b.o.trim().slice(0, 64) : '';
  if (!orderId || !checkSentToken(orderId, b.t)) return res.status(403).json({ error: 'This link is not valid. Use the link in your email, or ask for a new one below.' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Please try again in a few minutes.' });
  const { data: row, error } = await supabase.from('orders').select('id, state_code, dispute_status, payment_status, kit_order').eq('id', orderId).maybeSingle();
  if (error || !row) return res.status(404).json({ error: 'We could not find this order. Contact customerservice@taxappealusa.com.' });

  const k = row.kit_order || {};
  const view = {
    state: row.state_code, status: row.dispute_status, address: k.property?.address || null,
    county: k.property?.county || null, deadline: k.after?.deadline || null, sentOn: k.after?.sentOn || null,
  };
  if (b.action === 'load') return res.status(200).json(view);
  if (row.dispute_status === AFTER_STATUS.SENT) return res.status(200).json({ ...view, done: true });
  if (!OUT_WITH_CUSTOMER.includes(row.dispute_status) || row.payment_status !== 'paid') {
    return res.status(409).json({ ...view, error: 'This kit is not out with you yet, so there is nothing to mark. Questions: customerservice@taxappealusa.com.' });
  }
  const now = new Date();
  const sentOn = cleanSentOn(b.sentOn, now);
  const after = { ...(k.after || {}), sentAt: now.toISOString(), sentOn };
  // Conditional on the status we read, so a concurrent change is never overwritten.
  const { error: upErr } = await supabase.from('orders').update({ dispute_status: AFTER_STATUS.SENT, kit_order: { ...k, after } })
    .eq('id', row.id).eq('dispute_status', row.dispute_status);
  if (upErr) return res.status(500).json({ error: 'We could not save that. Please try again.' });
  return res.status(200).json({ ...view, status: AFTER_STATUS.SENT, sentOn, done: true });
}
