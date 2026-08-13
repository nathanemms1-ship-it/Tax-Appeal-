// lib/partnerToken.js
/**
 * SIGNED PARTNER LINKS — SO A FORWARDED URL STOPS BEING A BEARER CREDENTIAL.
 *
 * ============================================================================
 * WHAT THIS REPLACES, AND WHY IT MATTERED
 * ============================================================================
 * Two partner links carried `?ref=CODE&email=EMAIL` and nothing else:
 *
 *   /partners/connect   — binds a Stripe payout destination to a referral code
 *   /partners/dashboard — shows a partner's earnings
 *
 * `create-connect-account.js` says plainly why the pair is not a secret: "codes are
 * FIRSTNAME-LASTNAME and appear in public links". A realtor's work email is on every
 * listing they have. So the pair is guessable without any leak at all.
 *
 * That endpoint refuses to REBIND once `stripe_account_id` is set, so a partner who
 * has finished onboarding is safe. A partner who has not is not: anyone holding the
 * pair can bind THEIR OWN bank account first, and then collect that partner's
 * referral fees while the partner sees an account that looks connected and no money
 * arriving. Every partner is in that state between signing up and finishing Stripe,
 * which is exactly the population a recruitment campaign creates.
 *
 * The rate limiter (5/min, 20/hour) slows guessing. It does nothing about someone
 * who legitimately holds the link — a forwarded email, a screenshot, browser history,
 * a Referer header.
 *
 * ============================================================================
 * DESIGN
 * ============================================================================
 * token = `${expiryMs}.${HMAC-SHA256(code|email|expiryMs)}` truncated to 32 hex.
 *
 * The expiry is INSIDE the signed payload, so it cannot be edited without breaking
 * the signature. Verification is constant-time — a token check that leaks timing
 * leaks the token one byte at a time.
 *
 * 30 days, because the connect link is emailed at signup and acted on whenever the
 * partner gets round to it. When it does lapse there is no new endpoint to build:
 * register-referrer.js already re-sends a partner's link on request, throttled, so
 * an expired link means "ask for it again" rather than "contact support".
 *
 * Same secret as the unsubscribe tokens (INTERNAL_API_SECRET) and the same
 * construction, deliberately — one convention to reason about.
 *
 * NOT a replacement for the (code, email) row match. This proves the link came from
 * us; the row match proves the partner exists. Both still run, in that order.
 */
import crypto from 'crypto';

export const PARTNER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const normalise = (code, email) =>
  `${String(code || '').trim().toUpperCase()}|${String(email || '').trim().toLowerCase()}`;

function sign(code, email, expiryMs) {
  const secret = process.env.INTERNAL_API_SECRET || '';
  return crypto
    .createHmac('sha256', secret)
    .update(`${normalise(code, email)}|${expiryMs}`)
    .digest('hex')
    .slice(0, 32);
}

/** Build a link token for (code, email), valid for PARTNER_TOKEN_TTL_MS. */
export function partnerToken(code, email, nowMs = Date.now()) {
  const expiryMs = nowMs + PARTNER_TOKEN_TTL_MS;
  return `${expiryMs}.${sign(code, email, expiryMs)}`;
}

/**
 * Verify a token against (code, email).
 * Returns { ok: true } or { ok: false, reason: 'malformed' | 'expired' | 'bad_signature' }.
 *
 * The reason is for OUR logs, never for the response body — telling a caller that a
 * signature was merely expired confirms the code and email were right, which is half
 * the thing the token exists to protect.
 */
export function verifyPartnerToken(code, email, token, nowMs = Date.now()) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };

  const dot = token.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };

  const expiryMs = Number(token.slice(0, dot));
  const supplied = token.slice(dot + 1);
  if (!Number.isFinite(expiryMs) || !supplied) return { ok: false, reason: 'malformed' };

  // Signature FIRST, expiry second. Checking expiry first would answer "is this a
  // real token that has lapsed?" for a value that was never signed at all.
  const expected = sign(code, email, expiryMs);
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  if (nowMs > expiryMs) return { ok: false, reason: 'expired' };
  return { ok: true };
}

export default partnerToken;
