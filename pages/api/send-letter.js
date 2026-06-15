export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    // Recipient (appraisal district)
    districtName,
    districtAddress,
    districtCity,
    districtState,
    districtZip,
    // Sender (property owner)
    ownerName,
    ownerStreet,
    ownerCity,
    ownerState,
    ownerZip,
    ownerEmail,
    // Letter content
    letterContent,
    // Metadata
    propertyAddress,
    county,
    sessionId,
  } = req.body;

  if (!districtName || !districtAddress || !letterContent || !ownerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Convert letter text to HTML for Lob
    const letterHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #000;
      margin: 0;
      padding: 0;
    }
    .letter-body {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="letter-body">{{letter_content}}</div>
</body>
</html>`;

    // Lob requires merge variables for template content
    const lobPayload = {
      description: `Property tax protest — ${propertyAddress}`,
      to: {
        name: districtName,
        address_line1: districtAddress,
        address_city: districtCity,
        address_state: districtState,
        address_zip: districtZip,
        address_country: 'US',
      },
      from: {
        name: ownerName,
        address_line1: ownerStreet,
        address_city: ownerCity,
        address_state: ownerState,
        address_zip: ownerZip,
        address_country: 'US',
      },
      file: letterHtml,
      merge_variables: {
        letter_content: letterContent,
      },
      color: false, // Black and white — cheaper and professional
      double_sided: true,
      address_placement: 'insert_blank_page',
      mail_type: 'usps_first_class', // We upgrade to certified below
      extra_service: 'certified', // USPS certified mail
      return_envelope: true, // Return receipt
      perforated_page: 1,
      metadata: {
        property_address: propertyAddress,
        county: county,
        owner_email: ownerEmail,
        stripe_session_id: sessionId || '',
      },
    };

    console.log('Sending to Lob:', JSON.stringify({
      to: lobPayload.to,
      from: lobPayload.from,
      extra_service: lobPayload.extra_service,
      description: lobPayload.description,
    }));

    const lobRes = await fetch('https://api.lob.com/v1/letters', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.LOB_API_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lobPayload),
    });

    const lobData = await lobRes.json();
    console.log('Lob response:', JSON.stringify(lobData));

    if (!lobRes.ok) {
      console.error('Lob error:', lobData);
      return res.status(500).json({
        error: lobData?.error?.message || 'Failed to send letter via Lob',
        details: lobData,
      });
    }

    return res.status(200).json({
      success: true,
      letterId: lobData.id,
      trackingNumber: lobData.tracking_number || null,
      expectedDelivery: lobData.expected_delivery_date || null,
      status: lobData.status,
      url: lobData.url, // Preview URL in test mode
    });

  } catch (err) {
    console.error('Send letter error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
