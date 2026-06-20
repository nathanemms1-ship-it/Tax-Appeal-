// pages/api/portal/reset-password.js
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

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
    // Validate token
    const { data: resetRecord } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('email', email.toLowerCase())
      .eq('used', false)
      .single();

    if (!resetRecord) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });

    // Check expiry
    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password on orders (matching by email)
    const { error: updateError } = await supabase
      .from('orders')
      .update({ password_hash: hashedPassword })
      .eq('customer_email', email.toLowerCase());

    if (updateError) throw updateError;

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('token', token);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
