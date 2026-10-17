/**
 * POST /api/kit/sent-link { email } — "email me my private link" on /mailed,
 * for a customer who typed taxappealusa.com/mailed from the printed kit.
 *
 * Always answers the same way, found or not, so the route cannot be used to
 * learn whether someone is a customer. At most three links per address.
 */
import { Resend } from 'resend';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { getSupabaseAdmin } from '../supabase';
import { sentUrl, linkEmail, OUT_WITH_CUSTOMER } from '../../../lib/kit/afterMailing';

export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };
export const SAME_ANSWER = 'If we have a kit order for that email, we have sent it a private link. Check your inbox (and spam) in a minute.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'kit-sent-link', 3, 600)) return;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 120) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter the email you ordered with.' });
  const supabase = getSupabaseAdmin();
  if (supabase && process.env.RESEND_API_KEY) {
    try {
      // ilike for case, with % and _ escaped so it is an exact match, never a pattern.
      const { data: rows } = await supabase.from('orders').select('id, state_code, customer_name, customer_email, dispute_status, kit_order')
        .ilike('customer_email', email.replace(/[%_\\]/g, '\\$&')).in('dispute_status', OUT_WITH_CUSTOMER).eq('payment_status', 'paid').limit(3);
      const resend = new Resend(process.env.RESEND_API_KEY);
      for (const row of rows || []) {
        const link = sentUrl(row.id);
        if (!link) continue;
        const mail = linkEmail(row, link);
        await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [row.customer_email], subject: mail.subject, text: mail.text });
      }
    } catch (e) { console.error('[kit/sent-link] failed:', e?.message); }
  }
  return res.status(200).json({ message: SAME_ANSWER });
}
