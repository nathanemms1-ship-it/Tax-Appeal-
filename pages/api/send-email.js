import crypto from 'crypto';

/**
 * Internal-only guard. Fails CLOSED when INTERNAL_API_SECRET is unset —
 * `!== `Bearer ${undefined}`` style checks are an authentication bypass, not a
 * default. Constant-time compare so the secret can't be recovered by timing.
 */
function authorized(req) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const provided = req.headers['x-internal-secret'];
  if (!provided || typeof provided !== 'string') return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// pages/api/send-email.js
import { Resend } from 'resend';
import { confirmationEmailTemplate } from './email-templates';

const resend = new Resend(process.env.RESEND_API_KEY);
const TRUSTPILOT_BCC = 'taxappealusa.com+73f5a040d9@invite.trustpilot.com';

export default async function handler(req, res) {
  // Anyone could POST {to, subject, html} and send verbatim mail from
  // customerservice@taxappealusa.com with full SPF/DKIM alignment — perfect phishing of
  // your own customer list, plus unlimited quota burn.
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    to,
    firstName,
    lastName,
    address,
    county,
    trackingNumber,
    lobId,
    sessionId,
    letter,
    amountPaid,
    customerName,
    stateCode,
    type = 'confirmation',
    subject: prebuiltSubject,
    html: prebuiltHtml,
    text: prebuiltText,
  } = req.body;

  if (!to) return res.status(400).json({ error: 'Missing recipient email' });

  try {
    // If the caller already built the email (e.g. pages/api/lob-webhook.js passes
    // { subject, html, text }), send it exactly as provided instead of rebuilding
    // it from `type`. Without this, prebuilt delivery emails were discarded and a
    // default confirmation email was sent with empty fields.
    if (prebuiltHtml && prebuiltSubject) {
      const response = await resend.emails.send({
        from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
        reply_to: 'customerservice@taxappealusa.com',
        to: [to],
        subject: prebuiltSubject,
        html: prebuiltHtml,
        ...(prebuiltText ? { text: prebuiltText } : {}),
      });
      console.log('Resend response (prebuilt):', JSON.stringify(response));
      return res.status(200).json({ success: true, id: response?.data?.id || response?.id });
    }

    let subject, html;
    if (type === 'delivery') {
      const { deliveryEmailTemplate } = await import('./email-templates');
      subject = '📬 Your Dispute Letter Has Been Delivered';
      html = deliveryEmailTemplate({ firstName, trackingNumber, address, county, stateCode });
    } else {
      subject = '✅ Your Property Tax Dispute Has Been Filed — TaxAppeal USA';
      html = confirmationEmailTemplate({
        firstName: firstName || (customerName || '').split(' ')[0] || 'there',
        stateCode,
        lastName,
        address,
        county,
        trackingNumber,
        lobId,
        sessionId,
        letter, amountPaid });
    }

    const emailPayload = {
      from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
      reply_to: 'customerservice@taxappealusa.com',
      to: [to],
      subject,
      html,
    };

    // BCC Trustpilot on confirmation emails only (not delivery notifications)
    if (type === 'confirmation') {
      emailPayload.bcc = [TRUSTPILOT_BCC];
    }

    const response = await resend.emails.send(emailPayload);
    console.log('Resend response:', JSON.stringify(response));
    return res.status(200).json({ success: true, id: response?.data?.id || response?.id });
  } catch (err) {
    console.error('Send email error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send email' });
  }
}
