// pages/api/send-email.js
import { Resend } from 'resend';
import { confirmationEmailTemplate } from './email-templates';

const resend = new Resend(process.env.RESEND_API_KEY);
const TRUSTPILOT_BCC = 'taxappealusa.com+73f5a040d9@invite.trustpilot.com';

export default async function handler(req, res) {
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
        from: 'TaxAppeal USA <disputes@taxappealusa.com>',
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
      html = deliveryEmailTemplate({ firstName, trackingNumber, address, county });
    } else {
      subject = '✅ Your Property Tax Dispute Has Been Filed — TaxAppeal USA';
      html = confirmationEmailTemplate({
        firstName,
        lastName,
        address,
        county,
        trackingNumber,
        lobId,
        sessionId,
        letter,
      });
    }

    const emailPayload = {
      from: 'TaxAppeal USA <disputes@taxappealusa.com>',
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
