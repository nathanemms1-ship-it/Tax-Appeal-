import crypto from 'crypto';
import { deliveryConfirmationEmail } from './email-templates';

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
    const districtName = lobObject?.to?.name || county + ' Appraisal District';

    // Format delivery date
    let deliveredDate = null;
    if (event?.date_created) {
      deliveredDate = new Date(event.date_created).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
    }

    // Send delivery confirmation email if we have the customer's email
    if (ownerEmail && (eventType === 'letter.certified.delivered' || eventType === 'letter.delivered')) {
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
