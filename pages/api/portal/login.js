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

  // Look up by customer_email (actual column name)
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_email', email.toLowerCase().trim())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !orders?.length) {
    return res.status(401).json({ error: 'No account found with that email address.' });
  }

  const order = orders[0];

  // Verify password against stored bcrypt hash
  if (!order.password_hash) {
    return res.status(401).json({ error: 'No password set for this account. Please contact support.' });
  }

  const valid = await bcrypt.compare(password, order.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Sign a 7-day JWT
  const token = jwt.sign(
    { orderId: order.id, email: order.customer_email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Strip sensitive fields before returning
  const { password_hash, ...safeOrder } = order;

  return res.status(200).json({ token, order: safeOrder });
}
