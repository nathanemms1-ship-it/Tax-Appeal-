/**
 * GLOBAL DAILY SPEND CEILING.
 *
 * ============================================================================
 * WHY PER-IP RATE LIMITS ARE NOT ENOUGH
 * ============================================================================
 * lib/rateLimit.js bounds what ONE IP can spend. It does not bound what TEN
 * THOUSAND IPs can spend, and a residential-proxy pool costs an attacker a few
 * dollars an hour. Every per-IP limit in this codebase, multiplied by a large
 * enough IP pool, is still an unbounded bill.
 *
 * This is the control with a fixed worst case regardless of how many IPs are
 * involved: a hard daily count per vendor, shared across the whole deployment.
 *
 * WHY COUNTS, NOT DOLLARS
 * -----------------------
 * We cannot know the true cost of an Anthropic call before making it — output
 * tokens are unknown until the response arrives. Counting CALLS with a known
 * worst-case cost per call is something we can do accurately and cheaply, and the
 * worst case is exactly what a ceiling needs to bound. Each budget below is stated
 * with its arithmetic.
 *
 * FAILURE MODE: OPEN, like the rate limiter.
 * If Redis is down we allow the call. This ceiling bounds a catastrophe; it is not
 * the last line of defence. A Redis outage taking down the funnel is a guaranteed
 * loss, where the attack is a possible one.
 *
 * THIS DOES NOT REPLACE VENDOR-SIDE CAPS. Set those too — they are the only limits
 * that still hold when our own code is the thing that is wrong:
 *   - Anthropic Console -> Usage limits: monthly spend cap on the API key
 *   - Google Cloud -> APIs & Services -> Quotas: per-day quota on the Places and
 *     Geocoding APIs. Google does NOT cap these by default.
 *   - BatchData: a hard account cap
 *   - Lob: a spend cap. Certified mail is the most expensive call we make, and the
 *     only one that cannot be undone.
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

/**
 * Daily call ceilings, with the worst-case cost behind each number.
 *
 * Sized at roughly 20x expected Florida launch volume, so normal traffic — including
 * a good ad day — never touches them. Raise them deliberately as volume grows. An
 * alert firing is a signal to look, not to reflexively increase the number.
 */
export const DAILY_BUDGET = {
  // Sonnet, input capped at 64 KB (lib/inputLimits.js), max_tokens 4000.
  // Worst case ~$0.08/call. 4,000 calls ~= $320/day.
  anthropic: Number(process.env.DAILY_CAP_ANTHROPIC || 4000),

  // Places Autocomplete ~$2.83/1k, Geocoding ~$5/1k. Worst case ~$0.005/call.
  // 60,000 calls ~= $300/day.
  google: Number(process.env.DAILY_CAP_GOOGLE || 60000),

  // BatchData property lookups, per-record pricing. Assume ~$0.10 worst case.
  // 3,000 calls ~= $300/day.
  batchdata: Number(process.env.DAILY_CAP_BATCHDATA || 3000),

  // Lob certified letters and VAB checks — REAL MAIL, ~$8-12 each, irreversible.
  // 200/day is far above any plausible launch day and bounds the worst case at
  // ~$2,400 instead of unbounded.
  lob: Number(process.env.DAILY_CAP_LOB || 200),
};

function todayKey(vendor) {
  // UTC day, deliberately not local time: the counter must not reset twice a year
  // or shift under a timezone change on the runtime.
  const day = Math.floor(Date.now() / 86400000);
  return `spend:${vendor}:${day}`;
}

/**
 * Count `n` calls against today's ceiling for `vendor`.
 *
 * @returns {Promise<{ok: boolean, used: number, limit: number, vendor: string}>}
 *          ok:false means the caller MUST NOT make the vendor call.
 */
export async function checkSpend(vendor, n = 1) {
  const limit = DAILY_BUDGET[vendor];
  const allow = { ok: true, used: 0, limit: limit ?? Infinity, vendor };

  if (!limit || !REST_URL || !REST_TOKEN) return allow;

  const k = todayKey(vendor);

  try {
    const res = await fetch(`${REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCRBY', k, String(n)],
        // 48h rather than 24h, so a counter written just before midnight cannot
        // expire early and hand an attacker a fresh budget.
        ['EXPIRE', k, '172800'],
      ]),
      signal: AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined,
    });

    if (!res.ok) return allow;
    const body = await res.json();
    const used = Number(body?.[0]?.result ?? 0);
    if (!Number.isFinite(used) || used <= 0) return allow;

    // Warn on the way up, so the first signal is a log line rather than an invoice.
    if (used >= limit * 0.8 && used - n < limit * 0.8) {
      console.error(
        `[spendGuard] ${vendor} is at ${used}/${limit} of today's ceiling (80%). ` +
        `If this is not a traffic spike, it is abuse.`
      );
    }

    if (used > limit) {
      console.error(`[spendGuard] DAILY CEILING HIT for ${vendor}: ${used}/${limit}. Refusing calls.`);
      return { ok: false, used, limit, vendor };
    }

    return { ok: true, used, limit, vendor };
  } catch (e) {
    console.warn(`[spendGuard] unavailable for ${vendor}, allowing:`, e?.message);
    return allow;
  }
}

/** Read today's usage without incrementing. For an ops/health view. */
export async function spendUsage() {
  if (!REST_URL || !REST_TOKEN) return null;
  const vendors = Object.keys(DAILY_BUDGET);
  try {
    const res = await fetch(`${REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(vendors.map((v) => ['GET', todayKey(v)])),
      signal: AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const out = {};
    vendors.forEach((v, i) => {
      out[v] = { used: Number(body?.[i]?.result || 0), limit: DAILY_BUDGET[v] };
    });
    return out;
  } catch (e) {
    return null;
  }
}

export default checkSpend;
