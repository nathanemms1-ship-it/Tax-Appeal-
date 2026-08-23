// pages/api/portal/login.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { hasUsablePassword } from '../../../lib/noPassword';

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

  // credential stuffing
  if (await enforceRateLimit(req, res, 'login', 8, 300)) return;

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // Look up most recent order by email.
  //
  // An explicit allowlist rather than select('*'). The row below is returned to the
  // browser, and select('*') meant the response carried every column that existed —
  // signature_image, signer_ip, stripe_session_id, the DR-486 elections — none of
  // which pages/portal.js renders. The old code stripped password_hash by name,
  // which protects exactly the one field somebody remembered, and nothing added
  // later. password_hash is still selected here because login has to verify it, and
  // it is still stripped before the response; the allowlist is what stops the NEXT
  // sensitive column from shipping automatically.
  const PORTAL_FIELDS = [
    'id', 'created_at', 'customer_name', 'customer_email',
    'property_address', 'county', 'state', 'state_code', 'assessed_value',
    'dispute_status', 'decision_date', 'decision_detail',
    'lob_letter_id', 'lob_tracking_number', 'mailed_at',
    'password_hash',
  ].join(', ');

  const { data: orders, error } = await supabase
    .from('orders')
    .select(PORTAL_FIELDS)
    .eq('customer_email', email.toLowerCase().trim())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !orders?.length) {
    return res.status(401).json({ error: 'No account found with that email address.' });
  }

  const order = orders[0];

  /**
   * NO USABLE PASSWORD — the ordinary case since 23 Aug 2026, not an edge one.
   *
   * The funnel stopped asking for a password before checkout; it is offered on
   * /success after the signature and plenty of people will skip it. Those orders
   * carry the `!` sentinel (lib/noPassword.js) rather than a null, so this test
   * must ask whether the hash is USABLE — `if (!order.password_hash)` was true only
   * for a null and would have sent every one of them into bcrypt.compare against
   * a one-character string.
   *
   * Answered before any comparison, so the sentinel is never a credential: there is
   * no code path where sending `!` as a password compares equal to anything.
   *
   * "Forgot password?" is the route out and it genuinely works for these customers
   * — forgot-password.js looks them up by their ORDER, not by their hash.
   */
  if (!hasUsablePassword(order.password_hash)) {
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
