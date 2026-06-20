// pages/api/portal/login.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Verify a crypto pbkdf2 hash (format: "salt:hash")
function verifyCryptoPassword(password, storedHash) {
  try {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return verifyHash === hash;
  } catch {
    return false;
  }
}

// Detect which hash format is stored
function isCryptoHash(hash) {
  // crypto hashes are "salt:hash" — both parts are hex strings
  // bcrypt hashes start with "$2b$" or "$2a$"
  return hash && !hash.startsWith('$2');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // Look up most recent order by email
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

  if (!order.password_hash) {
    return res.status(401).json({ error: 'No password set for this account. Please use "Forgot password?" to set one.' });
  }

  // Verify password — support both crypto (new) and bcrypt (old) formats
  let valid = false;

  if (isCryptoHash(order.password_hash)) {
    // New format: salt:hash from crypto.pbkdf2Sync
    valid = verifyCryptoPassword(password, order.password_hash);
    console.log('Used crypto verification for:', email, '— valid:', valid);
  } else {
    // Old format: bcrypt hash — use dynamic import to avoid build errors if bcryptjs missing
    try {
      const bcrypt = await import('bcryptjs');
      valid = await bcrypt.compare(password, order.password_hash);
      console.log('Used bcrypt verification for:', email, '— valid:', valid);
    } catch (err) {
      console.error('bcryptjs not available, cannot verify old hash:', err.message);
      return res.status(401).json({ error: 'Password format outdated. Please use "Forgot password?" to reset.' });
    }
  }

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

  console.log('Login successful for:', email);
  return res.status(200).json({ token, order: safeOrder });
}
