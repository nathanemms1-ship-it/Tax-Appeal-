import { escapeHtml as h } from '../../lib/escape';

/**
 * Every ${...} below that carries a customer-supplied or vendor-supplied value is
 * wrapped in h(). These bodies go out SPF/DKIM-aligned on taxappealusa.com, so an
 * unescaped value is arbitrary markup inside an email that mail clients will show
 * as authentically from us, delivered to our own customer. See lib/escape.js.
 */
// pages/api/email-templates.js

export function confirmationEmailTemplate({ firstName, lastName, address, county, trackingNumber, lobId, sessionId, letter, amountPaid = 8900 }) {
  const fullName = `${firstName} ${lastName}`;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Property Tax Dispute Has Been Filed</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1B2A4A;padding:32px 40px;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#C9A84C;letter-spacing:0.05em;">TaxAppeal USA</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:4px;">Property Tax Protest Service</div>
            </td>
          </tr>

          <!-- Success Banner -->
          <tr>
            <td style="background:#1a7a4a;padding:20px 40px;text-align:center;">
              <div style="font-size:18px;font-weight:700;color:#ffffff;">✅ Your Dispute Has Been Filed</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Your certified letter is on its way to the county appraisal district</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;font-size:16px;color:#1B2A4A;">Hi ${h(firstName)},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
                Your property tax dispute letter has been professionally prepared and dispatched via trackable USPS mail to the ${h(county)} Appraisal District. Here is a summary of your filing.
              </p>

              <!-- Order Summary Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fc;border:1px solid #e5e8ef;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#1B2A4A;margin-bottom:16px;">Filing Summary</div>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:13px;color:#666;padding:5px 0;">Property Owner</td>
                        <td style="font-size:13px;color:#1B2A4A;font-weight:600;text-align:right;">${h(fullName)}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#666;padding:5px 0;">Property Address</td>
                        <td style="font-size:13px;color:#1B2A4A;font-weight:600;text-align:right;">${h(address)}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#666;padding:5px 0;">County</td>
                        <td style="font-size:13px;color:#1B2A4A;font-weight:600;text-align:right;">${h(county)}</td>
                      </tr>
                      ${trackingNumber ? `
                      <tr>
                        <td style="font-size:13px;color:#666;padding:5px 0;">USPS Tracking</td>
                        <td style="font-size:13px;color:#1B2A4A;font-weight:600;text-align:right;">${h(trackingNumber)}</td>
                      </tr>` : ''}
                      ${lobId ? `
                      <tr>
                        <td style="font-size:13px;color:#666;padding:5px 0;">Letter ID</td>
                        <td style="font-size:13px;color:#1B2A4A;font-weight:600;text-align:right;">${h(lobId)}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="font-size:13px;color:#666;padding:5px 0;">Filing Fee Paid</td>
                        <td style="font-size:13px;color:#1a7a4a;font-weight:700;text-align:right;">$${((amountPaid || 8900)/100).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What Happens Next -->
              <div style="margin-bottom:28px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#1B2A4A;margin-bottom:14px;">What Happens Next</div>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;padding:0 0 14px 0;">
                      <span style="display:inline-block;width:24px;height:24px;background:#C9A84C;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#1B2A4A;margin-right:10px;">1</span>
                      <span style="font-size:14px;color:#444;">Your certified letter arrives at the appraisal district (3–7 business days)</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="vertical-align:top;padding:0 0 14px 0;">
                      <span style="display:inline-block;width:24px;height:24px;background:#C9A84C;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#1B2A4A;margin-right:10px;">2</span>
                      <span style="font-size:14px;color:#444;">The district reviews your protest (typically 30–90 days)</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="vertical-align:top;padding:0 0 14px 0;">
                      <span style="display:inline-block;width:24px;height:24px;background:#C9A84C;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#1B2A4A;margin-right:10px;">3</span>
                      <span style="font-size:14px;color:#444;">You may receive a written decision by mail or email — watch for it</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="vertical-align:top;">
                      <span style="display:inline-block;width:24px;height:24px;background:#C9A84C;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#1B2A4A;margin-right:10px;">4</span>
                      <span style="font-size:14px;color:#444;">Log in to your portal anytime to update your dispute outcome</span>
                    </td>
                  </tr>
                </table>
              </div>

              ${trackingNumber ? `
              <!-- Track Your Letter -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="padding:16px;background:#1B2A4A;border-radius:6px;">
                    <a href="https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}"
                       style="color:#C9A84C;font-size:14px;font-weight:700;text-decoration:none;">
                      📦 Track Your Letter on USPS.com →
                    </a>
                  </td>
                </tr>
              </table>` : ''}

              ${letter ? `
              <!-- Full Letter -->
              <div style="margin-bottom:28px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#1B2A4A;margin-bottom:14px;">Your Dispute Letter — For Your Records</div>
                <div style="background:#fafafa;border:1px solid #e0e0e0;border-radius:6px;padding:28px 32px;font-family:Georgia,serif;font-size:13px;color:#222;line-height:1.8;white-space:pre-wrap;">${h(letter)}</div>
                <div style="margin-top:10px;font-size:11px;color:#999;text-align:center;">Keep this email as your official record of the protest you filed.</div>
              </div>` : ''}

              <!-- Questions -->
              <div style="background:#fff8e7;border:1px solid #f0d98a;border-radius:6px;padding:16px 20px;margin-bottom:8px;">
                <div style="font-size:13px;color:#7a6010;line-height:1.6;">
                  <strong>Questions about your filing?</strong><br/>
                  Reply to this email or contact us at
                  <a href="mailto:customerservice@taxappealusa.com" style="color:#C9A84C;font-weight:600;">customerservice@taxappealusa.com</a>
                  — we're happy to help.
                </div>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f0f2f7;padding:20px 40px;text-align:center;border-top:1px solid #e5e8ef;">
              <div style="font-size:12px;color:#999;">
                TaxAppeal USA · taxappealusa.com<br/>
                Questions? <a href="mailto:customerservice@taxappealusa.com" style="color:#1B2A4A;">customerservice@taxappealusa.com</a><br/>
                Filing disputes handled exclusively at <a href="mailto:disputes@taxappealusa.com" style="color:#1B2A4A;">disputes@taxappealusa.com</a>
              </div>
              <div style="font-size:11px;color:#bbb;margin-top:8px;">© ${year} TaxAppeal USA. All rights reserved.</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function deliveryEmailTemplate({ firstName, trackingNumber, address, county }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Your Dispute Letter Has Been Delivered</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1B2A4A;padding:32px 40px;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#C9A84C;">TaxAppeal USA</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:4px;">Property Tax Protest Service</div>
            </td>
          </tr>
          <tr>
            <td style="background:#1a7a4a;padding:20px 40px;text-align:center;">
              <div style="font-size:18px;font-weight:700;color:#ffffff;">📬 Letter Delivered to the County</div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:15px;color:#444;line-height:1.6;">Hi ${h(firstName)},</p>
              <p style="font-size:15px;color:#444;line-height:1.6;">
                Your property tax protest letter for <strong>${h(address)}</strong> has been successfully delivered to the <strong>${h(county)}</strong> Appraisal District via trackable USPS mail.
              </p>
              <p style="font-size:15px;color:#444;line-height:1.6;">
                The district will review your protest and send their decision — typically within 30–90 days. Watch your mail and email for a notice from the appraisal district.
              </p>
              ${trackingNumber ? `<p style="font-size:13px;color:#888;">USPS Tracking: <strong>${h(trackingNumber)}</strong></p>` : ''}
              <p style="font-size:14px;color:#444;">
                Questions? Email us at <a href="mailto:customerservice@taxappealusa.com" style="color:#C9A84C;font-weight:600;">customerservice@taxappealusa.com</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f0f2f7;padding:20px 40px;text-align:center;border-top:1px solid #e5e8ef;">
              <div style="font-size:12px;color:#999;">
                TaxAppeal USA · <a href="https://taxappealusa.com" style="color:#1B2A4A;">taxappealusa.com</a><br/>
                <a href="mailto:customerservice@taxappealusa.com" style="color:#1B2A4A;">customerservice@taxappealusa.com</a>
              </div>
              <div style="font-size:11px;color:#bbb;margin-top:8px;">© ${year} TaxAppeal USA. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Called by pages/api/lob-webhook.js when Lob reports a certified-mail delivery.
// The webhook destructures { subject, html, text } from the return value, so this
// function MUST return an object with those three keys (not a raw HTML string like
// the two templates above). Field names here match the webhook's call exactly:
//   deliveryConfirmationEmail({ customerName, address, districtName, deliveredDate, trackingNumber })
export function deliveryConfirmationEmail({ customerName, address, districtName, deliveredDate, trackingNumber }) {
  const year = new Date().getFullYear();
  const name = customerName || 'there';
  const district = districtName || 'the County Appraisal District';
  const deliveredLine = deliveredDate ? ` on <strong>${deliveredDate}</strong>` : '';

  const subject = '📬 Your Dispute Letter Has Been Delivered';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Your Dispute Letter Has Been Delivered</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1B2A4A;padding:32px 40px;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#C9A84C;">TaxAppeal USA</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:4px;">Property Tax Protest Service</div>
            </td>
          </tr>
          <tr>
            <td style="background:#1a7a4a;padding:20px 40px;text-align:center;">
              <div style="font-size:18px;font-weight:700;color:#ffffff;">📬 Letter Delivered to the County</div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:15px;color:#444;line-height:1.6;">Hi ${name},</p>
              <p style="font-size:15px;color:#444;line-height:1.6;">
                Good news — your property tax protest letter${address ? ` for <strong>${h(address)}</strong>` : ''} has been successfully delivered to <strong>${h(district)}</strong> via trackable USPS mail${deliveredLine}.
              </p>
              <p style="font-size:15px;color:#444;line-height:1.6;">
                The district will review your protest and send their decision — typically within 30–90 days. Watch your mail and email for a notice from the appraisal district.
              </p>
              ${trackingNumber ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
                <tr>
                  <td align="center" style="padding:14px;background:#1B2A4A;border-radius:6px;">
                    <a href="https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}" style="color:#C9A84C;font-size:14px;font-weight:700;text-decoration:none;">
                      📦 View USPS Delivery Confirmation →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:13px;color:#888;">USPS Tracking: <strong>${h(trackingNumber)}</strong></p>` : ''}
              <p style="font-size:14px;color:#444;">
                Questions? Email us at <a href="mailto:customerservice@taxappealusa.com" style="color:#C9A84C;font-weight:600;">customerservice@taxappealusa.com</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f0f2f7;padding:20px 40px;text-align:center;border-top:1px solid #e5e8ef;">
              <div style="font-size:12px;color:#999;">
                TaxAppeal USA · <a href="https://taxappealusa.com" style="color:#1B2A4A;">taxappealusa.com</a><br/>
                <a href="mailto:customerservice@taxappealusa.com" style="color:#1B2A4A;">customerservice@taxappealusa.com</a>
              </div>
              <div style="font-size:11px;color:#bbb;margin-top:8px;">© ${year} TaxAppeal USA. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${name},

Good news — your property tax protest letter${address ? ` for ${address}` : ''} has been successfully delivered to ${district} via trackable USPS mail${deliveredDate ? ` on ${deliveredDate}` : ''}.

The district will review your protest and send their decision — typically within 30-90 days. Watch your mail and email for a notice from the appraisal district.
${trackingNumber ? `\nUSPS Tracking: ${trackingNumber}\nTrack: https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}\n` : ''}
Questions? Email us at customerservice@taxappealusa.com

© ${year} TaxAppeal USA`;

  return { subject, html, text };
}
