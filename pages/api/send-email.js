// pages/api/send-email.js
import { Resend } from 'resend';
import { confirmationEmailTemplate } from './email-templates';

const resend = new Resend(process.env.RESEND_API_KEY);

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
  } = req.body;

  if (!to) return res.status(400).json({ error: 'Missing recipient email' });

  try {
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

    const response = await resend.emails.send({
      from: 'TaxAppeal USA <disputes@taxappealusa.com>',
      reply_to: 'customerservice@taxappealusa.com',
      to: [to],
      subject,
      html,
    });

    console.log('Resend response:', JSON.stringify(response));
    return res.status(200).json({ success: true, id: response?.data?.id || response?.id });
  } catch (err) {
    console.error('Send email error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send email' });
  }
}
