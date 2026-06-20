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

  // Always return success immediately — never reveal if email exists
  res.status(200).json({ success: true });

  try {
    // Check if this email has any orders
    const { data: orders } = await supabase
      .from('orders')
      .select('id, customer_name, customer_email')
      .eq('customer_email', email.toLowerCase().trim())
      .order('created_at', { ascending: false })
      .limit(1);

    if (!orders || orders.length === 0) {
      console.log('Password reset requested for unknown email:', email);
      return;
    }

    const order = orders[0];

    // Generate secure token using built-in crypto (no extra packages)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Store token in Supabase
    const { error: upsertError } = await supabase
      .from('password_reset_tokens')
      .upsert({
        email: email.toLowerCase().trim(),
        token,
        expires_at: expires,
        used: false,
        created_at: new Date().toISOString()
      }, { onConflict: 'email' });

    if (upsertError) {
      console.error('Failed to store reset token:', upsertError);
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';
    const resetUrl = `${baseUrl}/portal/reset-password?token=${token}&email=${encodeURIComponent(email.toLowerCase().trim())}`;
    const firstName = order.customer_name ? order.customer_name.split(' ')[0] : 'there';
    const year = new Date().getFullYear();

    // Send reset email via Resend
    const { error: emailError } = await resend.emails.send({
      from: 'TaxAppeal USA <disputes@taxappealusa.com>',
      reply_to: 'customerservice@taxappealusa.com',
      to: [email],
      subject: 'Reset your TaxAppeal USA portal password',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1B2A4A;padding:28px 40px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#C9A84C;letter-spacing:0.05em;">TaxAppeal USA</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:3px;">Appeal Portal</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="font-size:16px;color:#1B2A4A;margin:0 0 16px;font-weight:600;">Hi ${firstName},</p>
            <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
              We received a request to reset your TaxAppeal USA portal password. Click the button below to set a new password.
            </p>
            <p style="font-size:13px;color:#888;margin:0 0 28px;">
              This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.
            </p>

            <!-- Reset Button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center" style="padding:18px;background:#1B2A4A;border-radius:8px;">
                  <a href="${resetUrl}"
                     style="color:#C9A84C;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">
                    Reset My Password →
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;color:#aaa;line-height:1.6;margin:0;word-break:break-all;">
              If the button doesn't work, copy and paste this URL into your browser:<br/>
              <span style="color:#1B2A4A;">${resetUrl}</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f0f2f7;padding:16px 40px;text-align:center;border-top:1px solid #e5e8ef;">
            <div style="font-size:12px;color:#999;">
              Questions? <a href="mailto:customerservice@taxappealusa.com" style="color:#1B2A4A;">customerservice@taxappealusa.com</a>
            </div>
            <div style="font-size:11px;color:#bbb;margin-top:6px;">© ${year} TaxAppeal USA · taxappealusa.com</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
    });

    if (emailError) {
      console.error('Failed to send reset email:', emailError);
    } else {
      console.log('Password reset email sent to:', email);
    }

  } catch (err) {
    console.error('Forgot password error:', err);
  }
}
