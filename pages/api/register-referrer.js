// pages/api/register-referrer.js
// Handles /partners form submission — creates a referral code and saves to Supabase
import { getSupabaseAdmin } from './supabase';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function generateCode(firstName, lastName) {
  const first = (firstName || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  const last = (lastName || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!first || !last) return Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${first}-${last}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { firstName, lastName, email, phone, role, statesActive, clientVolume } = req.body;
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: 'First name, last name, and email are required' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    // Check for duplicate email
    const { data: existing } = await supabase
      .from('referrals')
      .select('id, code')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      const referralLink = `${process.env.NEXT_PUBLIC_BASE_URL}/apply?ref=${existing.code}`;
      return res.status(200).json({ success: true, duplicate: true, code: existing.code, referralLink, message: 'You already have a referral code' });
    }

    // Generate unique code — check for conflicts
    let code = generateCode(firstName, lastName);
    let attempts = 0;
    while (attempts < 5) {
      const { data: conflict } = await supabase.from('referrals').select('id').eq('code', code).single();
      if (!conflict) break;
      code = `${generateCode(firstName, lastName)}-${attempts + 2}`;
      attempts++;
    }

    const { data, error } = await supabase
      .from('referrals')
      .insert({
        code,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        email: email.toLowerCase().trim(),
        phone: phone || null,
        role: role || null,
        states_active: statesActive || null,
        client_volume: clientVolume || null,
        active: true,
        total_referrals: 0,
        total_paid: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Referral insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    const referralLink = `${process.env.NEXT_PUBLIC_BASE_URL}/apply?ref=${code}`;

    // Send welcome email
    try {
      await resend.emails.send({
        from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
        reply_to: 'customerservice@taxappealusa.com',
        to: [email.toLowerCase().trim()],
        subject: `Your TaxAppeal referral link is ready — earn $15 per client`,
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:-apple-system,sans-serif;">
<div style="max-width:580px;margin:40px auto;padding:0 16px 40px;">
  <div style="text-align:center;padding:24px 0 16px;"><span style="font-size:20px;font-weight:700;color:#0F1F3D;">TaxAppeal <span style="color:#C9A84C;">USA</span></span></div>
  <div style="background:#fff;border-radius:16px;overflow:hidden;">
    <div style="background:#1B3A6B;padding:28px 36px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Your Referral Link is Ready</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Earn $15 for every client who files</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 20px;">Hi ${firstName}, welcome to the TaxAppeal partner program. Your unique referral link is below — share it with any homeowner whose property tax notice just arrived and you'll earn <strong>$15 for every completed order</strong>, paid monthly.</p>
      <div style="background:#EEF3FB;border:1px solid #B5D4F4;border-radius:10px;padding:20px 24px;margin-bottom:20px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#0C447C;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Your Referral Link</div>
        <div style="font-size:14px;color:#0C447C;font-weight:600;word-break:break-all;">${referralLink}</div>
        <div style="font-size:11px;color:#378ADD;margin-top:6px;">Your code: <strong>${code}</strong></div>
      </div>
      <div style="background:#EAF3DE;border:1px solid #97C459;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:13px;color:#27500A;line-height:1.6;"><strong>What to tell your clients:</strong><br>"I use TaxAppeal USA for my clients — they file your property tax protest via certified mail for $79 flat. No percentage of your savings. Here's the link: ${referralLink}"</div>
      </div>
      <p style="font-size:13px;color:#64748b;margin:0;">Questions? Reply to this email or contact <a href="mailto:customerservice@taxappealusa.com" style="color:#1B3A6B;">customerservice@taxappealusa.com</a></p>
    </div>
    <div style="background:#f0f2f7;padding:16px 36px;text-align:center;border-top:1px solid #e5e8ef;font-size:12px;color:#94a3b8;">TaxAppeal USA · taxappealusa.com</div>
  </div>
</div>
</body>
</html>`,
      });
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr.message);
    }

    console.log('Referral created:', data.id, code, email);
    return res.status(200).json({ success: true, code, referralLink, name: data.name });

  } catch (err) {
    console.error('Register referrer error:', err);
    return res.status(500).json({ error: err.message });
  }
}
