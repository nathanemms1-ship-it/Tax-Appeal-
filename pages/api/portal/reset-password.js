// pages/api/portal/reset-password.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../../../lib/noPassword';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, email, password } = req.body;
  if (!token || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });

  try {
    // Tokens are stored as a SHA-256 digest — see pages/api/portal/forgot-password.js.
    // Hash what the caller presented and match on that; the raw token is never
    // written down anywhere except the customer's own email.
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');

    // Validate token exists and is not used/expired
    const { data: resetRecord, error: fetchError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token', tokenHash)
      .eq('email', email.toLowerCase().trim())
      .eq('used', false)
      .single();

    if (fetchError || !resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    // Hash via lib/noPassword.js — the same function /api/portal/set-password uses.
    // These two routes are the only places a customer chooses a password, and the
    // recipe was inline here until 23 Aug 2026. A second copy is how one of them
    // acquires a different iteration count and quietly stops matching, which reaches
    // the customer as "my password does not work" and is indistinguishable from them
    // misremembering it.
    const passwordHash = hashPassword(password, crypto);

    // Update password_hash on all orders for this email
    const { error: updateError } = await supabase
      .from('orders')
      .update({ password_hash: passwordHash })
      .eq('customer_email', email.toLowerCase().trim());

    if (updateError) {
      console.error('Failed to update password:', updateError);
      return res.status(500).json({ error: 'Failed to update password. Please try again.' });
    }

    // Mark token as used — match on the hash, same as the lookup above. Matching on
    // the raw token here would silently never match, leaving the token reusable
    // until it expired.
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('token', tokenHash);

    console.log('Password reset successful for:', email);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}


