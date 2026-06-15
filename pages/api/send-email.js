export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, html, text } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `TaxAppeal <${process.env.FROM_EMAIL || 'disputes@taxappealusa.com'}>`,
        to: [to],
        subject,
        html,
        text: text || '',
      }),
    });

    const data = await response.json();
    console.log('Resend response:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({ error: data?.message || 'Email send failed' });
    }

    return res.status(200).json({ success: true, emailId: data.id });
  } catch (err) {
    console.error('Send email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
