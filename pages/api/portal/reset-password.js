// pages/api/portal/reset-password.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, email, password } = req.body;
  if (!token || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    // Validate token exists and is not used/expired
    const { data: resetRecord, error: fetchError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('email', email.toLowerCase().trim())
      .eq('used', false)
      .single();

    if (fetchError || !resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    // Hash the new password using built-in crypto (no bcryptjs needed)
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const passwordHash = `${salt}:${hash}`;

    // Update password_hash on all orders for this email
    const { error: updateError } = await supabase
      .from('orders')
      .update({ password_hash: passwordHash })
      .eq('customer_email', email.toLowerCase().trim());

    if (updateError) {
      console.error('Failed to update password:', updateError);
      return res.status(500).json({ error: 'Failed to update password. Please try again.' });
    }

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('token', token);

    console.log('Password reset successful for:', email);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}


