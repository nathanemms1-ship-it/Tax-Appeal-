/**
 * POST /api/lob-webhook — Lob's tracking events for the kits we mail to customers.
 *
 * WHY IT WAS DEAD (found 17 Oct 2026). Lob signs `${timestamp}.${raw body}`,
 * and this route signed a copy of the body Next.js had
 * already parsed and re-serialised, which is not byte-for-byte what Lob sent.
 * Every event failed the check, got a 401, and was retried into the void. The
 * raw body is now read directly (bodyParser off) and signed as received.
 *
 * WHAT IT DOES NOW
 *   - keeps lob_status / lob_tracking_number / mailed_at / delivered_at current
 *   - processed_for_delivery or delivered: the kit reached the customer, so
 *     kit_order.after.arrivedAt starts the "sign it and send it" reminder
 *     (lib/kit/afterMailing.js)
 *   - returned_to_sender: ops are paged and the customer is told the PDF we
 *     emailed is the complete kit. Once per order.
 * Always 2xx once the signature is good: Lob retries anything else for days.
 */
import crypto from 'crypto';
import { Resend } from 'resend';
import { getSupabaseAdmin } from './supabase';
import { alertOps } from '../../lib/alertOps';
import { returnedEmail } from '../../lib/kit/afterMailing';

export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

/** Lob's timestamp header, in milliseconds whether Lob sends seconds or ms. */
export function lobTimestampMs(ts) {
  const n = Number(ts);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const d = Date.parse(String(ts || ''));
  return Number.isNaN(d) ? null : d;
}

/** Lob signs `${timestamp}.${raw body}` with HMAC-SHA256, hex. Exported for verify-after-mailing. */
export function verifyLobSignature({ raw, signature, timestamp, secret, now = Date.now() }) {
  if (!secret || !signature || !timestamp) return false; // fail closed
  const ms = lobTimestampMs(timestamp);
  if (ms === null || Math.abs(now - ms) > 5 * 60 * 1000) return false; // replay window
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const a = Buffer.from(String(signature)); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Kits are mailed as ordinary Lob letters (lib/kit/lobKit.js), so only letter.* events can match an order.
export const STATUS_BY_EVENT = Object.freeze({
  'letter.mailed': 'mailed',
  'letter.in_transit': 'in_transit',
  'letter.in_local_area': 'in_transit',
  'letter.processed_for_delivery': 'out_for_delivery',
  'letter.delivered': 'delivered',
  'letter.re-routed': 're_routed',
  'letter.returned_to_sender': 'returned',
});
const ARRIVED = new Set(['out_for_delivery', 'delivered']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const raw = await readRaw(req);
  if (!verifyLobSignature({ raw, signature: req.headers['lob-signature'], timestamp: req.headers['lob-signature-timestamp'], secret: process.env.LOB_WEBHOOK_SECRET })) {
    console.error('lob-webhook: signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const event = JSON.parse(raw || '{}');
    const eventType = event?.event_type?.id || event?.event_type || '';
    const lobObject = event?.body || event?.object || {};
    const newStatus = STATUS_BY_EVENT[eventType];
    if (!newStatus) return res.status(200).json({ received: true, action: 'ignored' });
    const lobId = lobObject?.id || null;
    if (!lobId) {
      console.error(`lob-webhook: ${eventType} arrived with no object id`);
      return res.status(200).json({ received: true, action: 'no_id' });
    }
    const at = event?.date_created || new Date().toISOString();
    const supabase = getSupabaseAdmin();
    const { data: row, error: readErr } = await supabase.from('orders')
      .select('id, state_code, customer_name, customer_email, dispute_status, kit_order')
      .eq('lob_letter_id', lobId).maybeSingle();
    if (readErr || !row) {
      console.error(`lob-webhook: no order for ${lobId}${readErr ? `: ${readErr.message}` : ''}`);
      return res.status(200).json({ received: true, action: 'no_order' });
    }

    const patch = { lob_status: newStatus };
    if (lobObject?.tracking_number) patch.lob_tracking_number = lobObject.tracking_number;
    if (newStatus === 'mailed') patch.mailed_at = at;
    if (newStatus === 'delivered') patch.delivered_at = at;

    const k = row.kit_order && typeof row.kit_order === 'object' ? row.kit_order : null;
    const after = k?.after ? { ...k.after } : null;
    let returnedNow = false;
    if (after) {
      if (ARRIVED.has(newStatus) && !after.arrivedAt) after.arrivedAt = at;
      if (newStatus === 'returned' && !after.returnedAt) { after.returnedAt = at; returnedNow = true; }
      patch.kit_order = { ...k, after };
    }
    const { error } = await supabase.from('orders').update(patch).eq('id', row.id);
    if (error) console.error(`lob-webhook: update failed for ${lobId}: ${error.message}`);

    if (returnedNow) {
      await alertOps('Kit returned to sender', `order=${row.id} letter=${lobId}\nUSPS returned the printed kit. The customer has been emailed that the PDF copy is the complete kit. Check their mailing address.`, { force: true });
      if (process.env.RESEND_API_KEY && row.customer_email) {
        try {
          const mail = returnedEmail(row);
          await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [row.customer_email], subject: mail.subject, text: mail.text });
        } catch (e) { console.error(`lob-webhook: returned email failed for ${row.id}:`, e?.message); }
      }
    }
    return res.status(200).json({ received: true, eventType, action: 'processed' });
  } catch (err) {
    console.error('lob-webhook error:', err?.message);
    return res.status(200).json({ received: true, error: 'processing_failed' });
  }
}
