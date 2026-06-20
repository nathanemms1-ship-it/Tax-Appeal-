// pages/api/portal/forgot-password.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  // Always return success to avoid email enumeration
  res.status(200).json({ success: true });

  try {
    // Look up order by email
    const { data: orders } = await supabase
      .from('orders')
      .select('id, customer_name, customer_email')
      .eq('customer_email', email.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1);

    if (!orders || orders.length === 0) return; // Silent - don't reveal if email exists

    const order = orders[0];

    // Generate a secure reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Store token in Supabase
    await supabase
      .from('password_reset_tokens')
      .upsert({
        email: email.toLowerCase(),
        token,
        expires_at: expires,
        used: false
      }, { onConflict: 'email' });

    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/portal/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    const firstName = order.customer_name ? order.customer_name.split(' ')[0] : 'there';
    const year = new Date().getFullYear();

    // Send reset email
    await resend.emails.send({
      from: 'TaxAppeal USA <disputes@taxappealusa.com>',
      reply_to: 'customerservice@taxappealusa.com',
      to: [email],
      subject: 'Reset your TaxAppeal USA portal password',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1B2A4A;padding:28px 40px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#C9A84C;">TaxAppeal USA</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:3px;">Appeal Portal</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="font-size:16px;color:#1B2A4A;margin:0 0 16px;">Hi ${firstName},</p>
            <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 28px;">
              We received a request to reset your TaxAppeal USA portal password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center" style="padding:16px;background:#1B2A4A;border-radius:6px;">
                  <a href="${resetUrl}" style="color:#C9A84C;font-size:15px;font-weight:700;text-decoration:none;">
                    Reset My Password →
                  </a>
                </td>
              </tr>
            </table>
            <p style="font-size:13px;color:#888;line-height:1.6;margin:0 0 8px;">
              If you didn't request a password reset, you can safely ignore this email. Your password will not change.
            </p>
            <p style="font-size:13px;color:#888;line-height:1.6;margin:0;">
              If the button above doesn't work, copy and paste this link into your browser:<br/>
              <span style="color:#1B2A4A;word-break:break-all;">${resetUrl}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f0f2f7;padding:16px 40px;text-align:center;border-top:1px solid #e5e8ef;">
            <div style="font-size:12px;color:#999;">
              Questions? <a href="mailto:customerservice@taxappealusa.com" style="color:#1B2A4A;">customerservice@taxappealusa.com</a>
            </div>
            <div style="font-size:11px;color:#bbb;margin-top:6px;">© ${year} TaxAppeal USA</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    });
  } catch (err) {
    console.error('Password reset error:', err);
    // Don't expose errors to client
  }
}
