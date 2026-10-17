import crypto from 'crypto';
import { getSupabaseAdmin } from './supabase';

/**
 * Lob signs every webhook. Without verification anyone could POST a forged
 * "delivered" event and rewrite an order's mailing status.
 */
function verifyLobSignature(req) {
  const secret = process.env.LOB_WEBHOOK_SECRET;
  if (!secret) return false; // fail closed
  const sig = req.headers['lob-signature'];
  const ts = req.headers['lob-signature-timestamp'];
  if (!sig || !ts) return false;
  // Reject anything older than 5 minutes to stop replay.
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${JSON.stringify(req.body)}`)
    .digest('hex');
  const a = Buffer.from(String(sig)), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (!verifyLobSignature(req)) {
    console.error('lob-webhook: signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const event = req.body;
    console.log('Lob webhook received:', JSON.stringify(event));

    const eventType = event?.event_type?.id || event?.event_type || '';
    const lobObject = event?.body || event?.object || {};
    const metadata = lobObject?.metadata || {};

    console.log('Event type:', eventType);
    console.log('Metadata:', JSON.stringify(metadata));

    // Kits are mailed to the CUSTOMER as ordinary Lob letters (lib/kit/lobKit.js),
    // so only letter.* tracking events can match an order.
    const STATUS_BY_EVENT = {
      'letter.mailed': 'mailed',
      'letter.in_transit': 'in_transit',
      'letter.in_local_area': 'in_transit',
      'letter.processed_for_delivery': 'out_for_delivery',
      'letter.delivered': 'delivered',
      'letter.re-routed': 'needs_review',
      'letter.returned_to_sender': 'needs_review',
    };

    if (!STATUS_BY_EVENT[eventType]) {
      console.log('Ignoring event type:', eventType);
      return res.status(200).json({ received: true, action: 'ignored' });
    }

    const trackingNumber = lobObject?.tracking_number || null;

    // ------------------------------------------------------------------
    // Persist the event.
    //
    // Nothing here ever wrote to the database. lob_status was set once at
    // fulfillment and mailed_at was written NOWHERE in the repo — while /portal
    // reads both to render the timeline and the USPS tracking link. So every
    // customer's status froze at "dispatched" forever and the tracking number Lob
    // hands us on each event was logged to Vercel and thrown away.
    // ------------------------------------------------------------------
    const lobId = lobObject?.id || null;
    const newStatus = STATUS_BY_EVENT[eventType];

    if (lobId && newStatus) {
      try {
        const supabase = getSupabaseAdmin();
        const patch = { lob_status: newStatus };
        // Lob only populates tracking_number once the piece is actually in the
        // mailstream, so take it whenever it appears rather than only at dispatch.
        if (trackingNumber) patch.lob_tracking_number = trackingNumber;
        if (newStatus === 'mailed') patch.mailed_at = event?.date_created || new Date().toISOString();
        // DELIVERED TIMESTAMP — added 6 Aug 2026 so transit time is measurable.
        //
        // Lob's own Expected Delivery Date Range for first-class mail is seven to
        // fourteen days, and lib/kit/delivery.js bets a buffer against that before
        // switching a kit to PDF-only. Without this column the row records that a
        // piece was mailed and that it is now delivered, but not WHEN, so the buffer
        // cannot be measured against reality.
        if (newStatus === 'delivered') patch.delivered_at = event?.date_created || new Date().toISOString();

        const { error } = await supabase
          .from('orders')
          .update(patch)
          .eq('lob_letter_id', lobId);

        if (error) {
          // Do not fail the webhook on a write error — Lob would retry the same
          // event forever. Log loudly instead.
          console.error(`lob-webhook: DB update failed for ${lobId}:`, error.message);
        } else {
          console.log(`lob-webhook: ${lobId} -> ${newStatus}${trackingNumber ? ` (tracking ${trackingNumber})` : ''}`);
        }
      } catch (dbErr) {
        console.error('lob-webhook: DB update threw:', dbErr.message);
      }
    } else if (!lobId) {
      console.error(`lob-webhook: ${eventType} arrived with no object id — cannot match an order`);
    }

    console.log(`Lob tracking event: ${eventType} for ${lobId || 'unknown'}`);

    return res.status(200).json({ received: true, eventType, action: 'processed' });
  } catch (err) {
    console.error('Lob webhook error:', err);
    // Always return 200 to Lob so it doesn't retry
    return res.status(200).json({ received: true, error: err.message });
  }
}
