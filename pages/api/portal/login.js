import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // Look up the most recent order for this email
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !orders?.length) {
    // Return generic error to avoid email enumeration
    return res.status(401).json({ error: 'No account found with that email address.' });
  }

  const order = orders[0];

  // Verify password against stored bcrypt hash
  const valid = await bcrypt.compare(password, order.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Sign a 7-day JWT
  const token = jwt.sign(
    { orderId: order.id, email: order.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Return token + sanitized order (strip password hash)
  const { password_hash, ...safeOrder } = order;

  return res.status(200).json({ token, order: safeOrder });
}
