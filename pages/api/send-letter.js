// pages/api/send-letter.js
// Delivery-only model: the property owner signs their own protest electronically and
// TaxAppeal prepares + mails it. The agent-authorization form (AR/AL) is retired — all
// states now route through the owner-signature path.
// Florida VAB fee / DR-486 / Lob-check path is preserved unchanged.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    districtName, districtAddress, districtCity, districtState, districtZip,
    ownerName, ownerStreet, ownerCity, ownerState, ownerZip, ownerEmail,
    letterContent, propertyAddress, county, sessionId,
    stateCode, isFL, vabFee, vabPayableTo, flSignatureName, flAuthDate,
    // Owner e-signature (all states)
    signedName, signedAt, signatureImage,
  } = req.body;

  if (!districtName || !districtAddress || !letterContent || !ownerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // The owner must sign their own protest before it is mailed.
  // FL captures the signature on the DR-486A (flSignatureName); other states use signedAt.
  if (!signedAt && !flSignatureName) {
    return res.status(400).json({ error: 'Protest has not been signed by the owner' });
  }

  const LOB_AUTH = `Basic ${Buffer.from(process.env.LOB_API_KEY + ':').toString('base64')}`;

  try {
    // DR-486A authorization page (FL only) — unchanged
    const dr486aHtml = isFL && flSignatureName ? `
<div style="page-break-before:always;font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.7;color:#000;padding:0 20px;">
  <div style="text-align:center;margin-bottom:24px;">
    <strong style="font-size:13pt;">WRITTEN AUTHORIZATION FOR REPRESENTATION</strong><br/>
    <strong>BEFORE THE VALUE ADJUSTMENT BOARD</strong><br/>
    <em style="font-size:10pt;">Florida Department of Revenue Form DR-486A</em>
  </div>
  <p><strong>Property Address:</strong> ${propertyAddress}</p>
  <p><strong>County:</strong> ${county} County, Florida</p>
  <p style="margin-top:16px;">I, the undersigned property owner, hereby authorize <strong>TaxAppeal USA</strong> to act as my authorized representative for the purpose of filing and prosecuting a petition before the ${county} County Value Adjustment Board regarding the above-referenced property, pursuant to Florida Statute &sect; 194.011(3)(h). I understand TaxAppeal USA is a compensated representative. This authorization includes the right to file Form DR-486, submit evidence, and receive VAB correspondence on my behalf.</p>
  <p style="margin-top:32px;"><strong>Electronically signed by:</strong></p>
  <p style="font-family:Georgia,serif;font-style:italic;font-size:14pt;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:8px;">${flSignatureName}</p>
  <p><strong>Date:</strong> ${flAuthDate}</p>
  <p style="font-size:9pt;color:#555;margin-top:16px;">This electronic signature is legally binding under the Florida Electronic Signature Act, &sect; 668.50, F.S.</p>
</div>` : '';

    // Owner signature block appended to non-FL protest letters (TX / GA / AR / AL)
    const sigDate = signedAt ? new Date(signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const signatureBlock = (!isFL && (signatureImage || signedName || signedAt)) ? `
<div style="margin-top:32px;font-family:Georgia,'Times New Roman',serif;font-size:11pt;color:#000;">
  <div style="border-top:1px solid #000;padding-top:12px;max-width:320px;">
    ${signatureImage
      ? `<img src="${signatureImage}" alt="Signature" style="max-height:60px;display:block;margin-bottom:4px;" />`
      : `<div style="font-style:italic;font-size:14pt;border-bottom:1px solid #000;padding-bottom:2px;">/s/ ${signedName || ownerName}</div>`}
    <div style="font-size:10pt;margin-top:4px;">${ownerName} — Property Owner${sigDate ? `, electronically signed ${sigDate}` : ''}</div>
  </div>
</div>` : '';

    const letterHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.6;color:#000;margin:0;padding:0;}.letter-body{white-space:pre-wrap;word-wrap:break-word;}</style>
</head>
<body>
  <div class="letter-body">{{letter_content}}</div>
  ${signatureBlock}
  ${dr486aHtml}
</body>
</html>`;

    // FL path: Lob Checks API — check + petition + DR-486A in one envelope (unchanged)
    if (isFL && vabFee && vabFee > 0 && vabPayableTo) {
      const checkAmountDollars = (vabFee / 100).toFixed(2);
      console.log(`FL order: Lob check $${checkAmountDollars} payable to "${vabPayableTo}" + petition`);

      const checkPayload = {
        description: `${county} County VAB Filing Fee — ${propertyAddress}`,
        to: {
          name: districtName,
          address_line1: districtAddress,
          address_city: districtCity,
          address_state: districtState,
          address_zip: districtZip,
          address_country: 'US',
        },
        from: {
          name: 'TaxAppeal USA',
          address_line1: '3130 Sabine St, STE B',
          address_city: 'Forest Hill',
          address_state: 'TX',
          address_zip: '76119',
          address_country: 'US',
        },
        bank_account: process.env.LOB_BANK_ACCOUNT_ID,
        amount: parseFloat(checkAmountDollars),
        memo: `${county} County VAB Filing Fee`,
        // For FL: letterContent IS the complete DR-486 HTML generated by generate-dr486.js
        // It already contains: DR-486 form (all 5 parts) + DR-486A + evidence
        // We use it directly — do not use the rebuilt letterHtml template
        attachment: letterContent,
        merge_variables: { letter_content: letterContent },
        mail_type: 'usps_first_class',
        metadata: {
          property_address: propertyAddress,
          county: county,
          owner_email: ownerEmail,
          stripe_session_id: sessionId || '',
          state_code: 'FL',
          vab_fee_cents: String(vabFee),
          fl_signer: flSignatureName || '',
        },
      };

      console.log('Sending FL Lob check:', JSON.stringify({ to: checkPayload.to, amount: checkPayload.amount, memo: checkPayload.memo }));

      const lobRes = await fetch('https://api.lob.com/v1/checks', {
        method: 'POST',
        headers: { 'Authorization': LOB_AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify(checkPayload),
      });

      const lobData = await lobRes.json();
      console.log('Lob check response:', JSON.stringify(lobData));

      if (!lobRes.ok) {
        console.error('Lob check error:', lobData);
        return res.status(500).json({ error: lobData?.error?.message || 'Failed to send FL check via Lob', details: lobData });
      }

      return res.status(200).json({
        success: true,
        type: 'fl-check',
        letterId: lobData.id,
        trackingNumber: lobData.tracking_number || null,
        expectedDelivery: lobData.expected_delivery_date || null,
        status: lobData.status,
        url: lobData.url || null,
        checkAmount: checkAmountDollars,
        checkPayableTo: vabPayableTo,
      });
    }

    // Non-FL path: standard Lob certified letter (owner-signed, no agent form)
    const lobPayload = {
      description: `Property tax protest — ${propertyAddress}`,
      to: { name: districtName, address_line1: districtAddress, address_city: districtCity, address_state: districtState, address_zip: districtZip, address_country: 'US' },
      from: { name: ownerName, address_line1: ownerStreet, address_city: ownerCity, address_state: ownerState, address_zip: ownerZip, address_country: 'US' },
      file: letterHtml,
      merge_variables: { letter_content: letterContent },
      color: false,
      double_sided: true,
      address_placement: 'insert_blank_page',
      mail_type: 'usps_first_class',
      extra_service: 'certified',
      return_envelope: true,
      perforated_page: 1,
      metadata: { property_address: propertyAddress, county: county, owner_email: ownerEmail, stripe_session_id: sessionId || '', state_code: stateCode || '', signed_at: signedAt || '' },
    };

    console.log('Sending Lob letter:', JSON.stringify({ to: lobPayload.to, from: lobPayload.from, extra_service: lobPayload.extra_service }));

    const lobRes = await fetch('https://api.lob.com/v1/letters', {
      method: 'POST',
      headers: { 'Authorization': LOB_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(lobPayload),
    });

    const lobData = await lobRes.json();
    console.log('Lob response:', JSON.stringify(lobData));

    if (!lobRes.ok) {
      console.error('Lob error:', lobData);
      return res.status(500).json({ error: lobData?.error?.message || 'Failed to send letter via Lob', details: lobData });
    }

    return res.status(200).json({
      success: true, type: 'letter',
      letterId: lobData.id,
      trackingNumber: lobData.tracking_number || null,
      expectedDelivery: lobData.expected_delivery_date || null,
      status: lobData.status,
      url: lobData.url,
    });

  } catch (err) {
    console.error('Send letter error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
