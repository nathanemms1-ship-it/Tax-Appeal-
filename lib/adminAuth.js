/**
 * Shared-password authentication for the internal admin endpoints.
 *
 * WHY THE PASSWORD MUST NOT TRAVEL IN THE QUERY STRING
 * ----------------------------------------------------
 * /api/referral-stats accepted ?password=XXX. A query string is written in
 * plaintext to Vercel's request logs, to any CDN or proxy log in front of them, to
 * the browser's own history and session restore, and to the Referer header of every
 * outbound link from a page loaded with that URL. It is also the part of a URL most
 * likely to end up pasted into a chat window or a bug report.
 *
 * Accepted instead:
 *   POST body     { "password": "..." }
 *   Header        X-Admin-Password: ...
 *   Header        Authorization: Bearer ...
 *
 * NOTE: this is still ONE shared password with no rotation, no per-user identity,
 * and no audit trail. It is a stopgap, not an auth system. The rebuild is tracked
 * separately; this file only makes the stopgap stop leaking.
 */

import crypto from 'crypto';
import { enforceRateLimit } from './rateLimit';

function presented(req) {
  const fromHeader = req.headers?.['x-admin-password'];
  if (fromHeader) return String(fromHeader);

  const auth = req.headers?.authorization || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();

  if (req.body && typeof req.body === 'object' && req.body.password) {
    return String(req.body.password);
  }

  return '';
}

/** Constant-time compare so response timing does not reveal a correct prefix. */
export function adminPasswordMatches(supplied) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(supplied ?? '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Returns true if the request was REJECTED and a response already sent:
 *
 *   if (await requireAdmin(req, res)) return;
 */
export async function requireAdmin(req, res, name = 'admin') {
  // A single shared password with no lockout is online-guessable. Bound the rate.
  if (await enforceRateLimit(req, res, `${name}-auth`, 10, 60)) return true;
  if (await enforceRateLimit(req, res, `${name}-auth`, 60, 3600)) return true;

  // Checked BEFORE the config check: a password in the URL is wrong whether or not
  // ADMIN_PASSWORD is set, and the specific message is what stops the old habit
  // recurring. Refuse outright rather than quietly accepting it.
  if (req.query?.password) {
    res.status(400).json({
      error: 'Send the admin password in the X-Admin-Password header or a POST body, not the query string.',
      code: 'PASSWORD_IN_QUERY',
    });
    return true;
  }

  if (!process.env.ADMIN_PASSWORD) {
    console.error('[adminAuth] ADMIN_PASSWORD is not set. Refusing.');
    res.status(503).json({ error: 'Admin access not configured.' });
    return true;
  }

  if (!adminPasswordMatches(presented(req))) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }

  return false;
}

export default requireAdmin;
