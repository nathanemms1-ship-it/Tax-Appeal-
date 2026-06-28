// States that require agent authorization form mailed with protest
const REQUIRES_AGENT_AUTH = ['AR', 'AL'];

function generateAuthFormHtml(ownerName, propertyAddress, county, propertyState, boardName, authTimestamp) {
  const filedDate = authTimestamp ? new Date(authTimestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const stateBoards = { AR: 'County Board of Equalization', AL: 'County Board of Equalization' };
  const board = boardName || stateBoards[propertyState] || 'Board of Equalization';
  return `
<div style="page-break-before: always; font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.7; color: #000; padding: 0;">
  <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 24px;">
    <div style="font-size: 13pt; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Agent Authorization for Property Tax Appeal</div>
    <div style="font-size: 10pt; margin-top: 4px;">${propertyState} Board of Equalization Filing</div>
  </div>
  <p>I, <strong>${ownerName}</strong>, the owner of record of the property located at:</p>
  <p style="margin: 16px 0; padding: 12px 16px; border: 1px solid #000; font-weight: bold;">${propertyAddress}<br />${county}</p>
  <p>hereby authorize <strong>TaxAppeal USA</strong> (disputes@taxappealusa.com) to act as my agent in all matters pertaining to the review and appeal of the assessed value of the above-referenced property for the current tax year with the ${board}.</p>
  <p>This authorization permits TaxAppeal USA to:</p>
  <ul style="margin: 12px 0 16px 20px;">
    <li>File a formal protest or appeal on my behalf</li>
    <li>Submit evidence and comparable sales data to support my appeal</li>
    <li>Correspond with the county assessor and Board of Equalization on my behalf</li>
    <li>Receive and forward any notices or decisions from the Board</li>
  </ul>
  <p>This authorization is limited to the property and tax year identified above and does not constitute a general power of attorney.</p>
  <div style="margin-top: 40px; border-top: 1px solid #000; padding-top: 20px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="width: 55%; padding-right: 20px;">
          <div style="border-bottom: 1px solid #000; height: 24px; margin-bottom: 6px;"></div>
          <div style="font-size: 10pt;">Property Owner Signature</div>
        </td>
        <td style="width: 45%;">
          <div style="border-bottom: 1px solid #000; height: 24px; margin-bottom: 6px;">${filedDate}</div>
          <div style="font-size: 10pt;">Date</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top: 20px;">
          <div style="border-bottom: 1px solid #000; height: 24px; margin-bottom: 6px;">${ownerName}</div>
          <div style="font-size: 10pt;">Printed Name</div>
        </td>
      </tr>
    </table>
  </div>
  <div style="margin-top: 24px; font-size: 9pt; color: #444; border-top: 1px solid #ccc; padding-top: 12px;">
    <em>This authorization was electronically executed by the property owner on ${filedDate} and is submitted in accordance with county Board of Equalization filing requirements. Electronic authorization recorded by TaxAppeal USA (taxappealusa.com) via secure checkout.</em>
  </div>
  <div style="margin-top: 12px; font-size: 9pt; color: #444;">
    <strong>Agent:</strong> TaxAppeal USA | disputes@taxappealusa.com | taxappealusa.com
  </div>
</div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    districtName, districtAddress, districtCity, districtState, districtZip,
    ownerName, ownerStreet, ownerCity, ownerState, ownerZip, ownerEmail,
    letterContent, propertyAddress, county, sessionId,
    stateCode, isFL, vabFee, vabPayableTo, flSignatureName, flAuthDate,
  } = req.body;

  if (!districtName || !districtAddress || !letterContent || !ownerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const LOB_AUTH = `Basic ${Buffer.from(process.env.LOB_API_KEY + ':').toString('base64')}`;

  try {
    // DR-486A authorization page (FL only)
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

    const letterHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.6;color:#000;margin:0;padding:0;}.letter-body{white-space:pre-wrap;word-wrap:break-word;}</style>
</head>
<body>
  <div class="letter-body">{{letter_content}}</div>
  ${dr486aHtml}
</body>
</html>`;

    // FL path: Lob Checks API — check + petition + DR-486A in one envelope
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
          address_line1: ownerStreet,
          address_city: ownerCity,
          address_state: ownerState,
          address_zip: ownerZip,
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

    // Non-FL path: standard Lob certified letter
    const lobPayload = {
      description: `Property tax protest — ${propertyAddress}`,
      to: { name: districtName, address_line1: districtAddress, address_city: districtCity, address_state: districtState, address_zip: districtZip, address_country: 'US' },
      from: { name: ownerName, address_line1: ownerStreet, address_city: ownerCity, address_state: ownerState, address_zip: ownerZip, address_country: 'US' },
      file: needsAuthForm ? fullLetterHtml : letterHtml,
      merge_variables: { letter_content: letterContent },
      color: false,
      double_sided: true,
      address_placement: 'insert_blank_page',
      mail_type: 'usps_first_class',
      extra_service: 'certified',
      return_envelope: true,
      perforated_page: 1,
      metadata: { property_address: propertyAddress, county: county, owner_email: ownerEmail, stripe_session_id: sessionId || '', state_code: stateCode || '' },
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

    // Append agent authorization form page for states that require it
    const stateUpper = (propertyState || '').toUpperCase();
    const needsAuthForm = REQUIRES_AGENT_AUTH.includes(stateUpper) && agentAuthGranted;
    const authFormPage = needsAuthForm
      ? generateAuthFormHtml(ownerName, `${ownerStreet}, ${ownerCity}, ${ownerState} ${ownerZip}`, county, stateUpper, null, agentAuthTimestamp)
      : '';
    const fullLetterHtml = letterHtml.replace('</body>\n</html>', authFormPage + '</body>\n</html>');


