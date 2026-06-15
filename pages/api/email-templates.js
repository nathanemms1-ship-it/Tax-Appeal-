// ── EMAIL TEMPLATES ───────────────────────────────────────────────────────────

export function confirmationEmail({ customerName, address, county, districtName, assessedValue, targetReduction, savings, trackingNumber, lobPreviewUrl, reductionPct }) {
  const firstName = customerName ? customerName.split(' ')[0] : 'there';
  const isTest = !!lobPreviewUrl;

  return {
    subject: `Your property tax dispute has been filed — ${address}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TaxAppeal Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FC;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1B3A6B;border-radius:12px 12px 0 0;padding:28px 36px;text-align:center;">
          <div style="font-size:28px;margin-bottom:6px;">🏠</div>
          <div style="font-family:Georgia,serif;font-size:24px;color:#FFFFFF;margin-bottom:4px;">TaxAppeal</div>
          <div style="font-size:11px;color:#8596AF;letter-spacing:2px;text-transform:uppercase;">Property Tax Dispute</div>
        </td></tr>

        <!-- Success banner -->
        <tr><td style="background:#2E7D52;padding:16px 36px;text-align:center;">
          <div style="font-size:15px;font-weight:600;color:#FFFFFF;">✓ Your dispute has been filed!</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#FFFFFF;padding:36px;">
          <p style="font-size:16px;color:#0F1F3D;margin:0 0 16px;">Hi ${firstName},</p>
          <p style="font-size:14px;color:#5A6B82;line-height:1.7;margin:0 0 24px;">
            Your property tax protest has been filed and your certified dispute letter ${trackingNumber ? 'has been dispatched' : 'is being sent'} via <strong>USPS certified mail with return receipt</strong> to the ${districtName || county + ' Appraisal District'}.
          </p>

          <!-- Order summary box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FC;border-radius:8px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8596AF;font-weight:600;margin-bottom:14px;">DISPUTE SUMMARY</div>
              ${[
                ['Property', address],
                ['Filed with', districtName || (county + ' Appraisal District')],
                assessedValue ? ['Current assessed value', '$' + Number(assessedValue).toLocaleString()] : null,
                targetReduction ? ['Reduction requested', 'Down to $' + Number(targetReduction).toLocaleString()] : null,
                savings ? ['Potential annual savings', '$' + Number(savings).toLocaleString()] : null,
                trackingNumber ? ['USPS tracking number', trackingNumber] : null,
              ].filter(Boolean).map(([label, value]) => `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                <tr>
                  <td style="font-size:13px;color:#8596AF;width:50%;">${label}</td>
                  <td style="font-size:13px;color:#0F1F3D;font-weight:500;text-align:right;">${value}</td>
                </tr>
              </table>`).join('')}
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E8EDF4;padding-top:12px;margin-top:4px;">
                <tr>
                  <td style="font-size:14px;color:#0F1F3D;font-weight:600;">Amount paid</td>
                  <td style="font-size:14px;color:#0F1F3D;font-weight:700;text-align:right;">$79.00</td>
                </tr>
              </table>
            </td></tr>
          </table>

          ${isTest ? `
          <!-- Test mode preview -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FB;border-radius:8px;padding:16px;margin-bottom:24px;">
            <tr><td>
              <div style="font-size:13px;color:#1B3A6B;margin-bottom:8px;"><strong>🔍 Test Mode — Letter Preview</strong></div>
              <a href="${lobPreviewUrl}" style="font-size:13px;color:#1B3A6B;">View how your letter will appear when printed →</a>
            </td></tr>
          </table>` : ''}

          <!-- What happens next -->
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8596AF;font-weight:600;margin-bottom:16px;">WHAT HAPPENS NEXT</div>
          ${[
            ['📬', 'Certified mail dispatch', trackingNumber ? 'Your letter has been dispatched via USPS certified mail with return receipt.' : 'Your letter will be dispatched via USPS certified mail within 1 business day.'],
            ['🧾', 'Tracking receipt', trackingNumber ? `Your USPS tracking number is: ${trackingNumber}` : 'Your USPS tracking number will be emailed to you once dispatched.'],
            ['📮', 'District receives your protest', `${districtName || 'Your appraisal district'} will process your protest and schedule a review.`],
            ['⏳', 'Await the decision', 'Districts typically respond within 30–90 days. We\'ll be copied on all correspondence at disputes@taxappealusa.com.'],
          ].map(([icon, title, desc]) => `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="40" valign="top" style="padding-top:2px;">
                <div style="width:32px;height:32px;background:#EEF3FB;border-radius:50%;text-align:center;line-height:32px;font-size:14px;">${icon}</div>
              </td>
              <td style="padding-left:12px;">
                <div style="font-size:14px;font-weight:600;color:#0F1F3D;margin-bottom:3px;">${title}</div>
                <div style="font-size:13px;color:#5A6B82;line-height:1.5;">${desc}</div>
              </td>
            </tr>
          </table>`).join('')}

          <!-- Important note -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E6;border:1px solid #FFD97A;border-radius:8px;padding:16px;margin-top:8px;">
            <tr><td>
              <div style="font-size:13px;font-weight:700;color:#7A5C10;margin-bottom:6px;">⚖️ Important</div>
              <div style="font-size:13px;color:#7A5C10;line-height:1.6;">
                Your appraisal district will contact you directly with their decision. A copy of all correspondence will also be sent to <strong>disputes@taxappealusa.com</strong> as your filing agent on record.
              </div>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0F1F3D;border-radius:0 0 12px 12px;padding:24px 36px;text-align:center;">
          <div style="font-size:13px;color:#8596AF;margin-bottom:8px;">Questions? Reply to this email or contact us at</div>
          <a href="mailto:disputes@taxappealusa.com" style="font-size:13px;color:#FFC940;text-decoration:none;">disputes@taxappealusa.com</a>
          <div style="font-size:11px;color:#3A4E6A;margin-top:16px;">© 2026 TaxAppeal USA · taxappealusa.com</div>
          <div style="font-size:11px;color:#3A4E6A;margin-top:4px;">TX · GA · FL · Property Tax Dispute Service</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Hi ${firstName},

Your property tax dispute has been filed!

Property: ${address}
Filed with: ${districtName || county + ' Appraisal District'}
${assessedValue ? 'Current assessed value: $' + Number(assessedValue).toLocaleString() : ''}
${targetReduction ? 'Reduction requested: Down to $' + Number(targetReduction).toLocaleString() : ''}
${savings ? 'Potential annual savings: $' + Number(savings).toLocaleString() : ''}
${trackingNumber ? 'USPS Tracking: ' + trackingNumber : ''}
Amount paid: $79.00

Your certified dispute letter ${trackingNumber ? 'has been dispatched' : 'will be dispatched within 1 business day'} via USPS certified mail with return receipt.

What happens next:
1. Your letter is mailed to ${districtName || county + ' Appraisal District'}
2. You'll receive your USPS tracking number by email
3. The district will review your protest and respond within 30-90 days
4. All correspondence will be copied to disputes@taxappealusa.com

Questions? Email disputes@taxappealusa.com

© 2026 TaxAppeal USA · taxappealusa.com`
  };
}

export function deliveryConfirmationEmail({ customerName, address, districtName, deliveredDate, trackingNumber }) {
  const firstName = customerName ? customerName.split(' ')[0] : 'there';

  return {
    subject: `✓ Your protest letter was delivered — ${address}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FC;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="background:#1B3A6B;border-radius:12px 12px 0 0;padding:28px 36px;text-align:center;">
          <div style="font-size:28px;margin-bottom:6px;">🏠</div>
          <div style="font-family:Georgia,serif;font-size:24px;color:#FFFFFF;margin-bottom:4px;">TaxAppeal</div>
          <div style="font-size:11px;color:#8596AF;letter-spacing:2px;text-transform:uppercase;">Property Tax Dispute</div>
        </td></tr>

        <tr><td style="background:#2E7D52;padding:16px 36px;text-align:center;">
          <div style="font-size:15px;font-weight:600;color:#FFFFFF;">📬 Your protest letter was delivered!</div>
        </td></tr>

        <tr><td style="background:#FFFFFF;padding:36px;">
          <p style="font-size:16px;color:#0F1F3D;margin:0 0 16px;">Hi ${firstName},</p>
          <p style="font-size:14px;color:#5A6B82;line-height:1.7;margin:0 0 24px;">
            Great news — your certified protest letter has been delivered to and signed for at <strong>${districtName}</strong>${deliveredDate ? ' on ' + deliveredDate : ''}.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#E6F4ED;border:1px solid #B7DEC8;border-radius:8px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <div style="font-size:14px;font-weight:700;color:#2E7D52;margin-bottom:10px;">✓ Delivery Confirmed</div>
              <div style="font-size:13px;color:#2E7D52;margin-bottom:6px;">Property: <strong>${address}</strong></div>
              <div style="font-size:13px;color:#2E7D52;margin-bottom:6px;">Delivered to: <strong>${districtName}</strong></div>
              ${deliveredDate ? `<div style="font-size:13px;color:#2E7D52;margin-bottom:6px;">Delivery date: <strong>${deliveredDate}</strong></div>` : ''}
              ${trackingNumber ? `<div style="font-size:13px;color:#2E7D52;">USPS Tracking: <strong>${trackingNumber}</strong></div>` : ''}
            </td></tr>
          </table>

          <p style="font-size:14px;color:#5A6B82;line-height:1.7;margin:0 0 16px;">
            The appraisal district will now review your protest. Most districts respond within <strong>30–90 days</strong>. Their decision will be mailed directly to you and a copy will be sent to <strong>disputes@taxappealusa.com</strong>.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E6;border:1px solid #FFD97A;border-radius:8px;padding:16px;">
            <tr><td>
              <div style="font-size:13px;font-weight:700;color:#7A5C10;margin-bottom:6px;">📋 Keep this email</div>
              <div style="font-size:13px;color:#7A5C10;line-height:1.6;">
                This serves as your proof of delivery. The certified mail return receipt is your legal documentation that the protest was received by the appraisal district before the filing deadline.
              </div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="background:#0F1F3D;border-radius:0 0 12px 12px;padding:24px 36px;text-align:center;">
          <div style="font-size:13px;color:#8596AF;margin-bottom:8px;">Questions? Contact us at</div>
          <a href="mailto:disputes@taxappealusa.com" style="font-size:13px;color:#FFC940;text-decoration:none;">disputes@taxappealusa.com</a>
          <div style="font-size:11px;color:#3A4E6A;margin-top:16px;">© 2026 TaxAppeal USA · taxappealusa.com</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Hi ${firstName},

Your certified protest letter has been delivered to ${districtName}${deliveredDate ? ' on ' + deliveredDate : ''}.

Property: ${address}
Delivered to: ${districtName}
${deliveredDate ? 'Delivery date: ' + deliveredDate : ''}
${trackingNumber ? 'USPS Tracking: ' + trackingNumber : ''}

The appraisal district will review your protest and respond within 30-90 days.

Keep this email as proof of delivery.

Questions? Email disputes@taxappealusa.com

© 2026 TaxAppeal USA`
  };
}
