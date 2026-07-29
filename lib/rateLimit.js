/**
 * Fixed-window rate limiter backed by the Upstash Redis REST API.
 *
 * WHY NOT @upstash/ratelimit: this runs in Next middleware on the Edge runtime as
 * well as in Node API routes. The REST client we already depend on works in both,
 * and a counter is 20 lines. One fewer dependency in the request path.
 *
 * WHAT THIS PROTECTS
 * ------------------
 * /api/generate-dr486 and /api/generate-letter each make an Anthropic API call on
 * an unauthenticated POST. Before this, anyone could sit in a loop and bill us for
 * model calls indefinitely; a single script could run up a five-figure Anthropic
 * bill overnight and there was nothing in the path to stop it. That is the main
 * event. The referral endpoints are the second concern - they are the surface an
 * attacker probes to farm $20 partner payouts.
 *
 * FAILURE MODE: OPEN, deliberately.
 * If Redis is unreachable we allow the request. A rate limiter that fails closed
 * takes the whole site down when Upstash has a bad minute, and the thing it
 * protects against is a cost problem rather than a safety problem. Every endpoint
 * that moves money or mail has its own independent authentication that fails
 * CLOSED - see send-letter.js, save-order.js, finalize-order.js. This layer is
 * about cost and abuse volume, and must never be the only thing between an
 * attacker and an irreversible action.
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

/**
 * @param {string} key      caller-scoped identifier, e.g. "rl:dr486:203.0.113.9"
 * @param {number} limit    max requests allowed in the window
 * @param {number} windowSec window length in seconds
 * @returns {Promise<{ok: boolean, remaining: number, limit: number, reset: number}>}
 */
export async function rateLimit(key, limit, windowSec) {
  const allow = { ok: true, remaining: limit, limit, reset: windowSec };
  if (!REST_URL || !REST_TOKEN) return allow;

  // Bucket the window so every caller in the same window shares a key and the key
  // expires on its own. No cleanup job, no sorted sets, no read-modify-write race.
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `${key}:${bucket}`;

  try {
    // Pipeline INCR + EXPIRE so a burst cannot leave a key without a TTL.
    const res = await fetch(`${REST_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', k],
        ['EXPIRE', k, String(windowSec + 5)],
      ]),
      // Never let the limiter itself become the latency problem.
      signal: AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined,
    });

    if (!res.ok) return allow;
    const body = await res.json();
    const count = Number(body?.[0]?.result ?? 0);
    if (!Number.isFinite(count) || count <= 0) return allow;

    const resetIn = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      limit,
      reset: resetIn,
    };
  } catch (e) {
    // Fail open. Log once so a persistent outage is visible rather than silent.
    console.warn('rateLimit unavailable, allowing request:', e?.message);
    return allow;
  }
}

/**
 * Best-effort client IP.
 *
 * On Vercel, x-forwarded-for is set by the platform edge and the LEFTMOST entry is
 * the real client. It is still client-influenced upstream of us, so this is an
 * abuse-cost control, not an authentication boundary - never gate a money-moving
 * action on it.
 */
export function clientIp(req) {
  const h = (name) =>
    typeof req.headers?.get === 'function' ? req.headers.get(name) : req.headers?.[name];

  const xff = h('x-forwarded-for');
  if (xff) return String(xff).split(',')[0].trim();
  return h('x-real-ip') || req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Node API-route helper. Returns true if the request was rejected (and the
 * response has already been sent), so callers read:
 *
 *   if (await enforceRateLimit(req, res, 'dr486', 10, 60)) return;
 */
export async function enforceRateLimit(req, res, name, limit, windowSec) {
  const r = await rateLimit(`rl:${name}:${clientIp(req)}`, limit, windowSec);
  res.setHeader('X-RateLimit-Limit', String(r.limit));
  res.setHeader('X-RateLimit-Remaining', String(r.remaining));
  if (r.ok) return false;
  res.setHeader('Retry-After', String(r.reset));
  res.status(429).json({
    error: 'Too many requests. Please wait a moment and try again.',
    code: 'RATE_LIMITED',
  });
  return true;
}

export default rateLimit;
