import { escapeHtml as h } from '../../lib/escape';

/**
 * Every ${...} below that carries a customer-supplied or vendor-supplied value is
 * wrapped in h(). These bodies go out SPF/DKIM-aligned on taxappealusa.com, so an
 * unescaped value is arbitrary markup inside an email that mail clients will show
 * as authentically from us, delivered to our own customer. See lib/escape.js.
 */
// pages/api/email-templates.js

/**
 * Dates reach this file from two places with two shapes: Stripe metadata (a plain
 * ISO string) and Postgres timestamptz, which serialises its offset as "+00" rather
 * than "+00:00". `new Date('2026-08-24T05:00:00+00')` is Invalid Date in Node, and an
 * unguarded toLocaleDateString on that renders the words "Invalid Date" into a
 * customer's receipt where the filing date should be. Normalise, then verify.
 */
function formatDate(value) {
  if (!value) return null;
  const normalised = String(value).trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(normalised);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * "Broward County" + " County" = "Broward County County".
 *
 * orders.county is stored WITH the suffix, and this file appended another one, so
 * every Florida receipt read "the Broward County County Value Adjustment Board".
 * Cosmetic, but it is among the first things a paying customer reads.
 */
function cleanCounty(county) {
  return String(county || '').replace(/\s+County\s*$/i, '').trim();
}

/**
 * WHAT THE RECEIPT IS ALLOWED TO CLAIM, GIVEN WHERE THE ORDER ACTUALLY IS.
 *
 * This fixes a false statement, not a wording preference. The template hardcoded
 * "Your Dispute Has Been Filed" and "your petition is on its way" for every receipt,
 * because lib/fulfillOrder.js passes `orderStatus` and pages/api/send-email.js never
 * destructured it — the same silent parameter drop that lost `stateCode` a day
 * earlier, in the same pair of files.
 *
 * The consequence: a Florida pre-order is `queued` until the county window opens on
 * 24 August, and the buyer was told it had already been filed and was in the post.
 * Florida's deadline is satisfied by physical RECEIPT, so a customer who believes it
 * is filed has no reason to chase it — and if anything goes wrong, they find out
 * after the window has shut.
 *
 * Default case is deliberately conservative: an unrecognised status must never
 * render as "filed".
 */
function claimFor(status, { docWord, authority, mailClass, scheduledFileDate }) {
  const when = formatDate(scheduledFileDate);

  switch (String(status || '')) {
    case 'filed':
      return {
        subject: '✅ Your Property Tax Dispute Has Been Filed — TaxAppeal USA',
        banner: '#1a7a4a',
        heading: 'Your Dispute Has Been Filed',
        subheading: `Your ${docWord} is on its way to the ${authority}`,
        intro: `Your property tax ${docWord} has been prepared and dispatched via ${mailClass} to the ${authority}. Here is a summary of your filing.`,
      };

    case 'queued':
      return {
        subject: '✅ Your Property Tax Petition Is Reserved — TaxAppeal USA',
        banner: '#1B2A4A',
        heading: 'Your Petition Is Prepared and Reserved',
        subheading: when
          ? `It will be filed when the window opens on ${when}`
          : 'It will be filed as soon as the filing window opens',
        intro: `Your property tax ${docWord} is complete, signed, and held ready. The ${authority} does not accept filings yet${when ? ` — the window opens on ${when}` : ''}. We will send it by ${mailClass} on the first day we can, well ahead of your deadline, and email you the moment it goes out. There is nothing further for you to do.`,
      };

    case 'awaiting_signature':
      return {
        subject: '✍️ One step left — sign your property tax petition',
        banner: '#8a6d1f',
        heading: 'One Step Left — Your Signature',
        subheading: `Your ${docWord} is ready and needs your signature before we can file it`,
        intro: `Your payment is received and your ${docWord} is prepared. It cannot be filed until you sign it — you sign online, there is nothing to print. Use the link from your confirmation page, or reply to this email and we will resend it.`,
      };

    default:
      return {
        subject: '✅ We received your property tax order — TaxAppeal USA',
        banner: '#1B2A4A',
        heading: 'We Have Your Order',
        subheading: `We are preparing your ${docWord} for the ${authority}`,
        intro: `Your payment is received and your ${docWord} is being prepared for the ${authority}. We will email you as soon as it is filed. If anything needs your attention we will contact you directly.`,
      };
  }
}

/** Subject line for a confirmation receipt, so send-email.js need not duplicate the logic. */
export function confirmationSubject({ stateCode, orderStatus }) {
  const isFL = String(stateCode || '').toUpperCase() === 'FL';
  return claimFor(orderStatus, {
    docWord: isFL ? 'petition' : 'letter',
    authority: '',
    mailClass: '',
    scheduledFileDate: null,
  }).subject;
}

export function confirmationEmailTemplate({ firstName, lastName, address, county, trackingNumber, lobId, sessionId, letter, amountPaid = 8900, stateCode, orderStatus, vabFee, scheduledFileDate }) {
  const fullName = `${firstName} ${lastName}`;
  const year = new Date().getFullYear();

  /**
   * stateCode WAS BEING DROPPED HERE — fixed 5 Aug 2026.
   *
   * lib/fulfillOrder.js:101 passes stateCode and pages/api/send-email.js:79 forwards
   * it, but this signature never destructured it, so the parameter arrived and fell
   * on the floor. Every Florida buyer's receipt therefore said "your certified letter
   * is on its way to the county appraisal district" — wrong twice over. Florida mails
   * FIRST CLASS on a Lob cheque (usps_first_class, no extra_service — see
   * pages/api/send-letter.js), and Florida has no appraisal district: a petition goes
   * to the Clerk of the Value Adjustment Board.
   */
  const isFL = String(stateCode || '').toUpperCase() === 'FL';
  const mailClass = isFL ? 'tracked USPS First Class mail' : 'USPS certified mail';
  const co = cleanCounty(county);
  const authority = isFL ? `${co} County Value Adjustment Board` : `${co} Appraisal District`;
  const docWord  = isFL ? 'petition' : 'letter';

  const claim = claimFor(orderStatus, { docWord, authority, mailClass, scheduledFileDate });

  /**
   * "What happens next" has to follow the same truth as the banner. It previously
   * opened with "Your petition arrives at the ... (3-7 business days)" on every
   * receipt, including pre-orders that will not be mailed for weeks — and it said
   * "The district reviews your protest" to Florida customers, who have no appraisal
   * district; a Florida petition is heard by the Value Adjustment Board.
   */
  const reviewer = isFL ? 'The Value Adjustment Board' : 'The appraisal district';
  const filedOn = formatDate(scheduledFileDate);

  const steps = orderStatus === 'awaiting_signature'
    ? [
        `You sign your ${docWord} online — nothing to print`,
        `We mail it by ${mailClass} to the ${authority}`,
        `${reviewer} reviews your ${docWord} (typically 30-90 days)`,
        'Log in to your portal anytime to update your dispute outcome',
      ]
    : orderStatus === 'queued'
      ? [
          filedOn
            ? `We mail your ${docWord} on ${filedOn}, the first day it can be filed`
            : `We mail your ${docWord} on the first day it can be filed`,
          `It reaches the ${authority} within 3-7 business days of mailing, and we email you when it goes out`,
          `${reviewer} reviews your ${docWord} (typically 30-90 days)`,
          'Log in to your portal anytime to update your dispute outcome',
        ]
      : [
          `Your ${docWord} arrives at the ${authority} (3-7 business days)`,
          `${reviewer} reviews your ${docWord} (typically 30-90 days)`,
          'You may receive a written decision by mail or email — watch for it',
          'Log in to your portal anytime to update your dispute outcome',
        ];

  // Fee presentation. Labelling the whole charge "Filing Fee Paid" was wrong and
  // cut against the product's own promise: the $89 is our flat service fee and the
  // county filing fee is a separate amount we pay on the customer's behalf. Showing
  // $114.00 as "Filing Fee Paid" implies the county received all of it.
  const totalCents = Number(amountPaid) || 8900;
  const feeCents = Number(vabFee) || 0;
  const serviceCents = feeCents > 0 && feeCents < totalCents ? totalCents - feeCents : null;
  const money = (c) => `$${(c / 100).toFixed(2)}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${h(claim.heading)}</title>
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
            <td style="background:${claim.banner};padding:20px 40px;text-align:center;">
              <div style="font-size:18px;font-weight:700;color:#ffffff;">${h(claim.heading)}</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">${h(claim.subheading)}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;font-size:16px;color:#1B2A4A;">Hi ${h(firstName)},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
                ${h(claim.intro)}
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
                        <td style="font-size:13px;color:#666;padding:5px 0;">Total Paid</td>
                        <td style="font-size:13px;color:#1a7a4a;font-weight:700;text-align:right;">${money(totalCents)}</td>
                      </tr>${serviceCents ? `
                      <tr>
                        <td style="font-size:12px;color:#888;padding:2px 0 0 0;">&nbsp;&nbsp;TaxAppeal service fee</td>
                        <td style="font-size:12px;color:#888;text-align:right;padding:2px 0 0 0;">${money(serviceCents)}</td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;color:#888;padding:2px 0 0 0;">&nbsp;&nbsp;${h(co)} County filing fee (we pay this for you)</td>
                        <td style="font-size:12px;color:#888;text-align:right;padding:2px 0 0 0;">${money(feeCents)}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What Happens Next -->
              <div style="margin-bottom:28px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#1B2A4A;margin-bottom:14px;">What Happens Next</div>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${steps.map((step, i) => `
                  <tr>
                    <td style="vertical-align:top;padding:0 0 ${i === steps.length - 1 ? '0' : '14px'} 0;">
                      <span style="display:inline-block;width:24px;height:24px;background:#C9A84C;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#1B2A4A;margin-right:10px;">${i + 1}</span>
                      <span style="font-size:14px;color:#444;">${h(step)}</span>
                    </td>
                  </tr>`).join('')}
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
                Filing disputes handled exclusively at <a href="mailto:customerservice@taxappealusa.com" style="color:#1B2A4A;">customerservice@taxappealusa.com</a>
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

export function deliveryEmailTemplate({ firstName, trackingNumber, address, county, stateCode }) {
  const year = new Date().getFullYear();
  // Same Florida split as confirmationEmailTemplate — FL goes to the Value
  // Adjustment Board by tracked First Class mail, not to an appraisal district by
  // certified mail. Florida has no appraisal district to review anything.
  const isFL = String(stateCode || '').toUpperCase() === 'FL';
  const authority = isFL ? `${county} County Value Adjustment Board` : `${county} Appraisal District`;
  const reviewer  = isFL ? 'Value Adjustment Board' : 'district';
  const docWord   = isFL ? 'petition' : 'protest letter';
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
                Your property tax ${h(docWord)} for <strong>${h(address)}</strong> has been successfully delivered to the <strong>${h(authority)}</strong> via trackable USPS mail.
              </p>
              <p style="font-size:15px;color:#444;line-height:1.6;">
                The ${h(reviewer)} will review your ${h(docWord)} and send their decision — typically within 30–90 days. Watch your mail and email for a notice from them.
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
