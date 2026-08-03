/**
 * Shared-secret authentication for inbound webhooks.
 *
 * ============================================================================
 * WHY THIS FAILS CLOSED (unlike lib/rateLimit.js, which fails open)
 * ============================================================================
 * rateLimit protects against COST. This protects against a caller writing to the
 * orders table and sending mail from customerservice@taxappealusa.com. The header comment
 * in rateLimit.js already states the rule: "must never be the only thing between
 * an attacker and an irreversible action." Emailing a customer is irreversible.
 *
 * So if the secret is not configured, the route is CLOSED. An unconfigured webhook
 * that rejects everything is a bug someone notices. An unconfigured webhook that
 * accepts everything is the thing we are fixing.
 *
 * ACCEPTED FORMS, so this works with whatever the provider supports:
 *   1. HTTP Basic       Authorization: Basic base64("webhook:<secret>")
 *                       (Postmark/Resend/SendGrid all allow https://user:pass@host)
 *   2. Bearer           Authorization: Bearer <secret>
 *   3. Header           X-Webhook-Secret: <secret>
 *
 * A query-string token is deliberately NOT accepted. Query strings are logged by
 * every proxy and land in Vercel's request logs in plaintext.
 */

import crypto from 'crypto';

// Re-exported for the existing call sites; the definitions live in lib/escape.js,
// which is also what the email templates and petition builders import.
export { escapeHtml, escapeLike } from './escape';

/** Constant-time compare that does not leak length via early return. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  // timingSafeEqual throws on length mismatch, so hash first to equalise length.
  const ah = crypto.createHash('sha256').update(ab).digest();
  const bh = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ah, bh) && ab.length === bb.length;
}

function presentedSecret(req) {
  const auth = req.headers?.authorization || '';

  if (/^Basic\s+/i.test(auth)) {
    try {
      const decoded = Buffer.from(auth.replace(/^Basic\s+/i, ''), 'base64').toString('utf8');
      // "user:secret" — the username is ignored, the password is the secret.
      const idx = decoded.indexOf(':');
      return idx === -1 ? decoded : decoded.slice(idx + 1);
    } catch (e) {
      return '';
    }
  }

  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();

  return String(req.headers?.['x-webhook-secret'] || '').trim();
}

/**
 * Returns true if the request was REJECTED and the response already sent, so
 * callers read:
 *
 *   if (requireWebhookSecret(req, res, 'INBOUND_EMAIL_SECRET')) return;
 */
export function requireWebhookSecret(req, res, envName) {
  const expected = process.env[envName];

  if (!expected || String(expected).length < 16) {
    console.error(
      `[webhookAuth] ${envName} is missing or too short. Refusing the request. ` +
      `Set it in Vercel and configure the sender to present it.`
    );
    // 503, not 401: nothing the caller sends can succeed, and providers back off
    // and retry on 503 rather than treating it as a permanent auth failure.
    res.status(503).json({ error: 'Webhook not configured.', code: 'WEBHOOK_UNCONFIGURED' });
    return true;
  }

  if (!safeEqual(presentedSecret(req), expected)) {
    console.warn('[webhookAuth] Rejected unauthenticated webhook POST.');
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }

  return false;
}

/**
 * Vercel Cron authentication.
 *
 * ============================================================================
 * WHY THE INLINE CHECK WAS DANGEROUS
 * ============================================================================
 * Both cron routes did this:
 *
 *     if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
 *
 * If CRON_SECRET is unset, that template literal evaluates to the STRING
 * "Bearer undefined". So anyone sending `Authorization: Bearer undefined`
 * authenticated — and /api/cron/process-queued-orders then dispatches up to 8 real
 * Lob certified mailings per call, at roughly $8-12 each, irreversibly.
 *
 * An unset secret must mean "nobody gets in", never "one guessable value gets in".
 */
export function requireCronSecret(req, res) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.error('[cron] CRON_SECRET is not set. Refusing — an unset secret must not authenticate anyone.');
    res.status(503).json({ error: 'Cron not configured.', code: 'CRON_UNCONFIGURED' });
    return true;
  }

  const auth = String(req.headers?.authorization || '');
  const presented = /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : '';

  if (!safeEqual(presented, expected)) {
    console.warn('[cron] Rejected unauthenticated cron invocation.');
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }

  return false;
}



export default requireWebhookSecret;
