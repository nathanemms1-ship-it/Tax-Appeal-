import crypto from 'crypto';
import { deliveryConfirmationEmail } from './email-templates';
import { getSupabaseAdmin } from './supabase';

/**
 * Lob signs every webhook. Without verification anyone could POST a forged
 * "delivered" event with an arbitrary owner_email and make us email a delivery
 * confirmation, from our own domain, for a letter that was never mailed.
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

    // Only handle delivery events
    // Florida mails via the Lob CHECKS api (the VAB filing fee is a physical
    // check; checks cannot be sent certified). Those emit check.* events, so the
    // letter-only whitelist meant every single Florida webhook was discarded —
    // FL customers never got a delivery confirmation and lob_status never advanced.
    const deliveryEvents = [
      'letter.delivered',
      'letter.certified.mailed',
      'letter.certified.in_transit',
      'letter.certified.out_for_delivery',
      'letter.certified.delivered',
      'letter.certified.re_routed',
      'letter.certified.returned_to_sender',
      'check.mailed',
      'check.in_transit',
      'check.in_local_area',
      'check.processed_for_delivery',
      'check.delivered',
      'check.re_routed',
      'check.returned_to_sender',
    ];

    if (!deliveryEvents.includes(eventType)) {
      console.log('Ignoring event type:', eventType);
      return res.status(200).json({ received: true, action: 'ignored' });
    }

    const ownerEmail = metadata?.owner_email;
    const propertyAddress = metadata?.property_address;
    const county = metadata?.county;
    const trackingNumber = lobObject?.tracking_number || null;

    // Get district name from the letter's to address
    // metadata.state_code is set by send-letter.js on the FL cheque payload. The old
    // fallback appended "Appraisal District" unconditionally, which is the one thing
    // Florida does not have — petitions go to the Clerk of the Value Adjustment Board.
    const isFLMail = String(metadata?.state_code || '').toUpperCase() === 'FL';
    const districtName = lobObject?.to?.name
      || county + (isFLMail ? ' County Value Adjustment Board' : ' Appraisal District');

    // Format delivery date
    let deliveredDate = null;
    if (event?.date_created) {
      deliveredDate = new Date(event.date_created).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
    }

    // ------------------------------------------------------------------
    // Persist the event.
    //
    // Nothing here ever wrote to the database. save-order sets lob_status to
    // 'dispatched' once at fulfillment and mailed_at was written NOWHERE in the
    // repo — while /portal reads both to render the timeline and the USPS
    // tracking link. So every customer's status froze at "dispatched" forever
    // and the tracking number Lob hands us on each event was logged to Vercel
    // and thrown away.
    //
    // This matters more for Florida than anywhere else: FL mails a check
    // First-Class with no certified service and no return receipt, so these
    // check.* events are the ONLY delivery evidence that exists for a state
    // whose deadline is receipt, not postmark.
    // ------------------------------------------------------------------
    const STATUS_BY_EVENT = {
      'check.mailed': 'mailed',
      'letter.certified.mailed': 'mailed',
      'check.in_transit': 'in_transit',
      'letter.certified.in_transit': 'in_transit',
      'check.in_local_area': 'in_transit',
      'check.processed_for_delivery': 'out_for_delivery',
      'letter.certified.out_for_delivery': 'out_for_delivery',
      'check.delivered': 'delivered',
      'letter.delivered': 'delivered',
      'letter.certified.delivered': 'delivered',
      'check.re_routed': 'needs_review',
      'letter.certified.re_routed': 'needs_review',
      'check.returned_to_sender': 'needs_review',
      'letter.certified.returned_to_sender': 'needs_review',
    };

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

        const { error } = await supabase
          .from('orders')
          .update(patch)
          .eq('lob_letter_id', lobId);

        if (error) {
          // Do not fail the webhook on a write error — Lob would retry and we
          // would re-send the delivery email. Log loudly instead.
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

    // Send delivery confirmation email if we have the customer's email.
    // check.delivered was whitelisted above but was NOT in this condition, so a
    // Florida customer's petition could arrive and they would never be told.
    // Florida is the state where that email matters most: it is the only proof
    // of receipt they will ever get.
    if (ownerEmail && newStatus === 'delivered') {
      const { subject, html, text } = deliveryConfirmationEmail({
        customerName: metadata?.customer_name || '',
        address: propertyAddress || '',
        districtName,
        deliveredDate,
        trackingNumber,
      });

      const emailRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
        body: JSON.stringify({ to: ownerEmail, subject, html, text }),
      });

      const emailData = await emailRes.json();
      console.log('Delivery email sent:', emailData);
    }

    // Log all tracking events for visibility
    console.log(`Lob tracking event: ${eventType} for ${propertyAddress} — ${ownerEmail}`);

    return res.status(200).json({ received: true, eventType, action: 'processed' });
  } catch (err) {
    console.error('Lob webhook error:', err);
    // Always return 200 to Lob so it doesn't retry
    return res.status(200).json({ received: true, error: err.message });
  }
}
