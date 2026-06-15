import { deliveryConfirmationEmail } from './email-templates';

export default async function handler(req, res) {
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
    const deliveryEvents = [
      'letter.delivered',
      'letter.certified.mailed',
      'letter.certified.in_transit',
      'letter.certified.out_for_delivery',
      'letter.certified.delivered',
      'letter.certified.re_routed',
      'letter.certified.returned_to_sender',
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
        headers: { 'Content-Type': 'application/json' },
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
