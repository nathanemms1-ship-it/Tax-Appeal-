import { escapeHtml as h } from '../../lib/escape';
import { SERVICE_PRICE_CENTS } from '../../lib/pricing';
import { BUSINESS_NAME, LEGAL_ENTITY, BUSINESS_ADDRESS, BUSINESS_ADDRESS_LINES } from '../../lib/businessInfo';

/**
 * Every ${...} below that carries a customer-supplied or vendor-supplied value is
 * wrapped in h(). These bodies go out SPF/DKIM-aligned on taxappealusa.com, so an
 * unescaped value is arbitrary markup inside an email that mail clients will show
 * as authentically from us, delivered to our own customer. See lib/escape.js.
 */
// pages/api/email-templates.js

/**
 * WHAT THE RECEIPT IS ALLOWED TO CLAIM, GIVEN WHERE THE ORDER ACTUALLY IS.
 *
 * This fixes a false statement, not a wording preference. The template hardcoded
 * "Your Dispute Has Been Filed" and "your petition is on its way" for every receipt,
 * because lib/fulfillOrder.js passes `orderStatus` and pages/api/send-email.js never
 * destructured it — the same silent parameter drop that lost `stateCode` a day
 * earlier, in the same pair of files.
 *
 * Default case is deliberately conservative: an unrecognised status must never
 * render as "filed".
 */
function claimFor(status) {
  switch (String(status || '')) {
    /**
     * KIT ORDERS (GA, TX, FL; Kit model decided 10 Oct 2026). We mail the
     * CUSTOMER a ready-to-sign kit and email the PDF; we never file. These two
     * receipts must not say "filed", "certified" or "we mail it to the county".
     */
    case 'kit_queued':
      return {
        subject: '✅ Payment received — your appeal kit is being printed — TaxAppeal USA',
        banner: '#1B2A4A',
        heading: 'Your Appeal Kit Is Being Printed',
        subheading: 'We mail it to you and email you the PDF',
        intro: 'Thank you — your payment is in. We are printing your completed appeal kit and mailing it to you by first-class mail, and we will also email you a PDF copy of the full kit the moment it is sent. You sign the form, add postage and mail it to the county in the envelope we include. We prepare the documents; we do not file your appeal or represent you.',
      };

    case 'kit_pdf':
      return {
        subject: '✅ Payment received — your kit is on its way to your inbox — TaxAppeal USA',
        banner: '#1B2A4A',
        heading: 'Your Kit Is Coming By Email',
        subheading: 'Print it, sign it and mail it before your deadline',
        intro: 'Thank you — your payment is in. Your deadline is close, so instead of mailing a printed kit we are emailing you the completed kit as a PDF in the next few minutes. Print it, sign it in ink, and mail it in any envelope to the address shown in the kit, before the postmark deadline printed on it. We prepare the documents; we do not file it or represent you.',
      };

    case 'awaiting_notice':
      return {
        subject: '✅ Payment received — we build your kit when your notice arrives — TaxAppeal USA',
        banner: '#1B2A4A',
        heading: 'You Are Reserved',
        subheading: 'We build your kit when your assessment notice arrives',
        intro: 'Thank you — your payment is in. When your assessment notice arrives, tell us the value on it and we check your case again. If an appeal still lowers your bill, we print your completed kit and mail it to you. If it no longer does, we refund you in full before anything is mailed. Keep this email: the button below is your private link for entering your notice.',
        ctaLabel: 'Enter my notice when it arrives',
      };

    default:
      return {
        subject: '✅ We received your property tax order — TaxAppeal USA',
        banner: '#1B2A4A',
        heading: 'We Have Your Order',
        subheading: 'We will email you with the next step',
        intro: 'Your payment is received. We will email you with the next step. If anything needs your attention we will contact you directly.',
      };
  }
}

/** Subject line for a confirmation receipt, so send-email.js need not duplicate the logic. */
export function confirmationSubject({ stateCode, orderStatus }) {
  const isFL = String(stateCode || '').toUpperCase() === 'FL';
  if (orderStatus === 'awaiting_notice' && String(stateCode || '').toUpperCase() === 'TX') {
    return '✅ Payment received — your protest kit is reserved — TaxAppeal USA';
  }
  if (isFL && orderStatus === 'kit_queued') return '✅ Payment received — your petition kit is being printed — TaxAppeal USA';
  if (isFL && orderStatus === 'kit_pdf') return '✅ Payment received — your petition kit is on its way to your inbox — TaxAppeal USA';
  return claimFor(orderStatus).subject;
}

export function confirmationEmailTemplate({ firstName, lastName, address, county, trackingNumber, lobId, amountPaid = SERVICE_PRICE_CENTS, stateCode, orderStatus, noticeUrl = null }) {
  const fullName = `${firstName} ${lastName}`;
  // The one button a receipt may carry: (pre-sale) the notice link.
  const ctaUrl = orderStatus === 'awaiting_notice' ? noticeUrl : null;
  const year = new Date().getFullYear();

  // stateCode decides the Texas and Florida wording below. It was once dropped
  // here (fixed 5 Aug 2026), so every receipt read as the default state.
  const isFL = String(stateCode || '').toUpperCase() === 'FL';

  const claimBase = claimFor(orderStatus);
  /*
   * A TEXAS reservation (16 Oct 2026) is finished by our roll load, not by the
   * customer: there is no notice to enter, so no button, and the wording says so.
   */
  const claim = orderStatus === 'awaiting_notice' && stateCode === 'TX'
    ? {
      ...claimBase,
      subject: '✅ Payment received — your protest kit is reserved — TaxAppeal USA',
      heading: 'You Are Reserved',
      subheading: 'We check again when your district publishes this year\'s values',
      intro: 'Thank you — your payment is in. When your appraisal district publishes this year\'s values (usually in April), we check your protest again on them, automatically; you do not need to do anything. If a protest still lowers your bill, we print your completed kit and mail it to you. If it no longer does, we refund you in full before anything is mailed.',
      ctaLabel: null,
    }
    : isFL && orderStatus === 'kit_queued'
    ? {
      ...claimBase,
      subject: '✅ Payment received — your petition kit is being printed — TaxAppeal USA',
      heading: 'Your Petition Kit Is Being Printed',
      intro: 'Thank you — your payment is in. We are printing your completed Value Adjustment Board petition kit (Form DR-486 filled in, your evidence and a return envelope addressed to the board) and mailing it to you by first-class mail. A PDF copy of the full kit is also emailed to you the moment it is sent. You sign the petition, add a check for the county\'s filing fee, and mail or hand-deliver it: Florida counts the date the board RECEIVES it. We prepare the documents; we do not file your petition or represent you.',
    }
    : isFL && orderStatus === 'kit_pdf'
    ? {
      ...claimBase,
      subject: '✅ Payment received — your petition kit is on its way to your inbox — TaxAppeal USA',
      intro: 'Thank you — your payment is in. Your deadline is close, so instead of mailing a printed kit we are emailing you the completed petition kit as a PDF in the next few minutes. Print it, sign it in ink, add a check for the county\'s filing fee, and hand-deliver or mail it to the Value Adjustment Board address shown in the kit. Florida counts the date the board RECEIVES it, not the postmark. We prepare the documents; we do not file it or represent you.',
    }
    : claimBase;

  const isKit = orderStatus === 'kit_queued' || orderStatus === 'awaiting_notice' || orderStatus === 'kit_pdf';
  const steps = isKit && isFL
    ? [
        orderStatus === 'kit_pdf'
          ? 'Your kit arrives by email in a few minutes as a PDF: print it on plain paper'
          : 'Your kit arrives by mail in a few days, and a PDF copy of the full kit is emailed to you today',
        'You sign Part 3 of the DR-486 in ink and add a check for the county\'s filing fee',
        'You mail it or hand-deliver it so the Value Adjustment Board RECEIVES it by the deadline',
        'If the board does not lower your value, next year\'s kit is free',
      ]
    : isKit
    ? [
        orderStatus === 'awaiting_notice' && stateCode === 'TX'
          ? 'Your district publishes this year\'s values and we re-check your protest automatically'
          : orderStatus === 'awaiting_notice'
          ? 'Your notice arrives: you tell us the value on it and we re-check your case'
          : orderStatus === 'kit_pdf'
          ? 'Your kit arrives by email in a few minutes as a PDF: print it on plain paper'
          : 'Your kit arrives by mail in a few days, and a PDF copy of the full kit is emailed to you today',
        orderStatus === 'kit_pdf'
          ? 'You sign the form in ink and mail it in any envelope to the address shown in the kit, before the postmark deadline'
          : 'You sign the appeal form in ink, add postage and mail it to the county in the envelope we include',
        'The county reviews your appeal and writes to you; forward us anything it sends',
        'If the county does not lower your value, next year\'s kit is free',
      ]
    : [
        'We review your order and email you with the next step',
        'If anything needs your attention we will contact you directly',
      ];

  // 0 is a real amount: a free kit (lib/kit/freeKit.js). Only a MISSING amount defaults.
  const totalCents = amountPaid === 0 || amountPaid === '0' ? 0 : Number(amountPaid) || SERVICE_PRICE_CENTS;
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
              <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:4px;">Property Tax Appeal Kits</div>
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

              ${claim.ctaLabel && ctaUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${h(ctaUrl)}" style="display:inline-block;background:#1B2A4A;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:15px 34px;border-radius:6px;">
                      ${h(claim.ctaLabel)}
                    </a>
                    <div style="margin-top:10px;font-size:12px;color:#8596AF;">
                      Or paste this into your browser:<br/>
                      <span style="color:#5A6B82;word-break:break-all;">${h(ctaUrl)}</span>
                    </div>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Order Summary Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fc;border:1px solid #e5e8ef;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#1B2A4A;margin-bottom:16px;">Order Summary</div>
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
                        <td style="font-size:13px;color:#666;padding:5px 0;">Kit mailing ID</td>
                        <td style="font-size:13px;color:#1B2A4A;font-weight:600;text-align:right;">${h(lobId)}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="font-size:13px;color:#666;padding:5px 0;">Total Paid</td>
                        <td style="font-size:13px;color:#1a7a4a;font-weight:700;text-align:right;">${money(totalCents)}</td>
                      </tr>
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
                      📦 Track Your Kit on USPS.com →
                    </a>
                  </td>
                </tr>
              </table>` : ''}

              <!-- The full petition used to be reproduced here, gated on the letter
                   parameter. Removed 6 Aug 2026 at Nathan's request: the owner has already
                   read the complete unblurred document and signed it on /success, so the
                   email was re-sending something they had just attested to. It also made
                   the message enormous - the measured petition is 17,005 characters of
                   HTML - and put a sworn filing carrying the owner's name, home address,
                   parcel number and signature into a message that gets forwarded and sits
                   in inboxes indefinitely.
                   NOTE: a backtick in a comment inside a template literal terminates the
                   string. This comment originally quoted the parameter name in backticks
                   and broke the build. -->

              <!-- Questions -->
              <div style="background:#fff8e7;border:1px solid #f0d98a;border-radius:6px;padding:16px 20px;margin-bottom:8px;">
                <div style="font-size:13px;color:#7a6010;line-height:1.6;">
                  <strong>Questions about your kit?</strong><br/>
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
                Order and billing disputes handled exclusively at <a href="mailto:customerservice@taxappealusa.com" style="color:#1B2A4A;">customerservice@taxappealusa.com</a><br/>
                ${LEGAL_ENTITY}, ${BUSINESS_ADDRESS_LINES[0]}, ${BUSINESS_ADDRESS_LINES[1]}
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
