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
 * FAILURE MODE: OPEN by default, CLOSED for vendors in FAIL_CLOSED below.
 * For most vendors, if Redis is down we allow the call. This ceiling bounds a
 * catastrophe; it is not the last line of defence. A Redis outage taking down the
 * funnel is a guaranteed loss, where the attack is a possible one.
 *
 * That trade inverts when there is no vendor-side cap to fall back on — see
 * FAIL_CLOSED.
 *
 * THIS DOES NOT REPLACE VENDOR-SIDE CAPS. Set those too — they are the only limits
 * that still hold when our own code is the thing that is wrong:
 *   - Anthropic Console -> Usage limits: monthly spend cap on the API key
 *   - Google Cloud -> APIs & Services -> Quotas: per-day quota on the Places and
 *     Geocoding APIs. Google does NOT cap these by default.
 *   - Lob: a spend cap. Certified mail is the most expensive call we make, and the
 *     only one that cannot be undone.
 *   - RentCast: THERE IS NONE. Confirmed against their billing documentation —
 *     overage cannot be capped or disabled, and there is no hard usage limit. You
 *     get an email at 85% and 100% of quota, and billing simply continues at the
 *     overage rate. This file is the ONLY thing between a bug and the invoice,
 *     which is why RentCast gets a monthly ceiling and fails closed.
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

/**
 * Page the operator, without ever letting the alert break the request it fired from.
 *
 * Imported lazily and deliberately NOT awaited. checkSpend() sits directly in the
 * customer's path, and a slow mail send must not add latency to a checkout — nor may
 * a failed one turn a spend warning into a 500. Fire and forget, log on failure.
 *
 * alertOps de-duplicates internally (lib/alertOps.js), so this cannot become a loop
 * even though checkSpend runs on every vendor call.
 */
function notify(subject, body) {
  import('./alertOps')
    .then(({ alertOps }) => alertOps(subject, body, { key: `spend:${subject}`, suppressSeconds: 6 * 60 * 60 }))
    .catch((e) => console.error('[spendGuard] alert failed:', e?.message));
}

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

  // RentCast, billed per API CALL rather than per record — one call returning 500
  // properties costs the same as one returning one.
  //
  // This daily number is only a BURST guard. The real control is MONTHLY_BUDGET
  // below, because RentCast bills monthly and a daily ceiling cannot bound a
  // monthly bill: 31 compliant days at any daily cap still overshoots the plan.
  // 100/day is ~3x the expected daily average against a 1,000/month plan.
  rentcast: Number(process.env.DAILY_CAP_RENTCAST || 100),

  // Lob certified letters and VAB checks — REAL MAIL, ~$8-12 each, irreversible.
  // 200/day is far above any plausible launch day and bounds the worst case at
  // ~$2,400 instead of unbounded.
  lob: Number(process.env.DAILY_CAP_LOB || 200),
};

/**
 * MONTHLY ceilings, for vendors billed by the month.
 *
 * WHY A SECOND DIMENSION EXISTS. A daily cap bounds a bad day. It cannot bound a
 * bad month, and a monthly-billed vendor sends a monthly invoice: 31 days at the
 * 100/day RentCast burst guard is 3,100 calls against a 1,000-call plan, i.e.
 * ~$126 of overage without a single day ever tripping a ceiling. The daily number
 * catches runaway loops; this one catches the slow bleed.
 *
 * RentCast: the Foundation plan includes 1,000 calls/month and bills $0.06 for
 * each one after that, with no vendor-side cap available. 1,500 is a deliberate
 * choice, not the plan limit — it buys ~500 calls (~$30) of headroom so a genuinely
 * good traffic month does not cut lookups off mid-funnel, while still bounding the
 * worst case at a number that fits on a credit card without a phone call.
 *
 * Set MONTHLY_CAP_RENTCAST=1000 to make overage impossible instead.
 */
export const MONTHLY_BUDGET = {
  rentcast: Number(process.env.MONTHLY_CAP_RENTCAST || 1500),
};

/**
 * Vendors that must be REFUSED when Redis is unreachable, inverting this module's
 * usual fail-open stance.
 *
 * Fail-open is correct when an unmetered outage is bounded by something else. For
 * RentCast nothing else exists: there is no vendor-side cap, so "Redis is down"
 * would mean "the ceiling is off" would mean "the bill is unbounded" — and the
 * only thing that ends it is somebody noticing.
 *
 * The cost of failing closed is genuinely small here, which is what makes the
 * trade different from Anthropic's. A refused RentCast call degrades /api/lookup
 * to the manual-entry path the funnel already has and already handles, and makes
 * /api/comps return 503. Nobody is blocked from filing; they type their assessed
 * value off their TRIM notice, which is a better source anyway.
 */
const FAIL_CLOSED = new Set(['rentcast']);

function todayKey(vendor) {
  // UTC day, deliberately not local time: the counter must not reset twice a year
  // or shift under a timezone change on the runtime.
  const day = Math.floor(Date.now() / 86400000);
  return `spend:${vendor}:${day}`;
}

function monthKey(vendor) {
  // UTC calendar month. RentCast's billing period renews on the 1st, so the
  // calendar month and the billing month coincide. If a plan is ever migrated to a
  // mid-month anchor this key must move with it, or the ceiling will reset in the
  // middle of a billing period and permit roughly two months of spend in one.
  const d = new Date();
  const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `spend:${vendor}:month:${m}`;
}

/**
 * Count `n` calls against today's ceiling for `vendor`.
 *
 * @returns {Promise<{ok: boolean, used: number, limit: number, vendor: string}>}
 *          ok:false means the caller MUST NOT make the vendor call.
 */
export async function checkSpend(vendor, n = 1) {
  const limit = DAILY_BUDGET[vendor];
  const monthLimit = MONTHLY_BUDGET[vendor];
  const allow = { ok: true, used: 0, limit: limit ?? Infinity, vendor };

  if (!limit) return allow;

  // Redis not configured AT ALL is a development setup, not an outage, and it is
  // not a state an attacker can induce — they cannot unset your env vars. Allow,
  // even for fail-closed vendors, so `next dev` without Upstash still works.
  // healthChecks.js already warns that the ceilings are off in this state.
  if (!REST_URL || !REST_TOKEN) return allow;

  const k = todayKey(vendor);
  const mk = monthLimit ? monthKey(vendor) : null;

  try {
    const ops = [
      ['INCRBY', k, String(n)],
      // 48h rather than 24h, so a counter written just before midnight cannot
      // expire early and hand an attacker a fresh budget.
      ['EXPIRE', k, '172800'],
    ];
    if (mk) {
      ops.push(['INCRBY', mk, String(n)]);
      // 70 days: comfortably longer than any billing month, so the counter cannot
      // expire mid-period and silently reset the ceiling to zero.
      ops.push(['EXPIRE', mk, '6048000']);
    }

    const res = await fetch(`${REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(ops),
      signal: AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined,
    });

    if (!res.ok) throw new Error(`redis pipeline returned ${res.status}`);
    const body = await res.json();
    const used = Number(body?.[0]?.result ?? 0);

    // ── Monthly ceiling ───────────────────────────────────────────────────────
    // Checked BEFORE the daily one. The monthly cap is the one tied to real money
    // for a monthly-billed vendor; the daily cap is a burst guard that can be well
    // under its limit while the month is already over budget.
    if (mk) {
      const monthUsed = Number(body?.[2]?.result ?? 0);
      if (Number.isFinite(monthUsed) && monthUsed > 0) {
        if (monthUsed >= monthLimit * 0.8 && monthUsed - n < monthLimit * 0.8) {
          notify(
            `${vendor} at 80% of this MONTH's ceiling`,
            `${vendor}: ${monthUsed} / ${monthLimit} calls this billing month.\n\n` +
            (vendor === 'rentcast'
              ? 'The Foundation plan includes 1,000 calls; everything past that bills at\n' +
                '$0.06 each and RentCast offers no way to cap it. This ceiling is the only\n' +
                'thing that stops it.\n\n'
              : '') +
            'If this is not real traffic growth, it is a loop or a scraper.'
          );
        }
        if (monthUsed > monthLimit) {
          notify(
            `MONTHLY CEILING TRIPPED: ${vendor}`,
            `${vendor} has hit its monthly ceiling (${monthUsed} / ${monthLimit}).\n` +
            'Further calls are refused until the 1st of next month.\n\n' +
            (vendor === 'rentcast'
              ? 'IMPACT: degraded only — /api/lookup falls back to manual entry and\n' +
                '/api/comps returns 503. Customers can still file by entering their own\n' +
                'assessed value. Raise MONTHLY_CAP_RENTCAST in Vercel if this is real\n' +
                'traffic, but check the RentCast dashboard first: past 1,000 calls you are\n' +
                'paying $0.06 each with no vendor-side cap.\n'
              : '')
          );
          return { ok: false, used: monthUsed, limit: monthLimit, vendor, period: 'month' };
        }
      }
    }

    if (!Number.isFinite(used) || used <= 0) return allow;

    // Warn on the way up, so the first signal is an email rather than an invoice.
    // Crossing 80% is a one-shot edge (used-n was below it, used is not), so this
    // fires once per day per vendor rather than on every subsequent call.
    if (used >= limit * 0.8 && used - n < limit * 0.8) {
      notify(
        `${vendor} at 80% of today's spend ceiling`,
        `${vendor}: ${used} / ${limit} calls used today.\n\n` +
        (vendor === 'anthropic'
          ? 'If this ceiling trips, /api/generate-dr486 returns 503 and customers see\n' +
            '"Lookup failed" at checkout. They cannot buy, and retrying will not help.\n' +
            'Raise DAILY_CAP_ANTHROPIC in Vercel if this is real traffic.\n\n'
          : '') +
        'If this is not a traffic spike, it is abuse.'
      );
    }

    if (used > limit) {
      notify(
        `CEILING TRIPPED: ${vendor}`,
        `${vendor} has hit its daily ceiling (${used} / ${limit}) and further calls are\n` +
        'being refused.\n\n' +
        (vendor === 'anthropic'
          ? 'CUSTOMER IMPACT: checkout is DOWN. /api/generate-dr486 returns 503 and\n' +
            'pages/apply.js shows "Lookup failed". No orders can complete until the\n' +
            'ceiling resets at UTC midnight or DAILY_CAP_ANTHROPIC is raised.\n'
          : vendor === 'lob'
            ? 'IMPACT: no further mail or VAB fee checks. Paid orders will be parked as\n' +
              'needs_review and Stripe will retry the webhook.\n'
            : 'IMPACT: degraded only — the funnel falls back to manual entry.\n')
      );
      return { ok: false, used, limit, vendor };
    }

    return { ok: true, used, limit, vendor };
  } catch (e) {
    // FAIL CLOSED for vendors with no cap of their own. If we cannot count, we
    // cannot bound, and for RentCast nothing downstream will bound it either — so
    // the safe answer is no. See FAIL_CLOSED above for why the cost of this is
    // acceptable where it would not be for Anthropic.
    if (FAIL_CLOSED.has(vendor)) {
      console.error(`[spendGuard] unavailable for ${vendor}, REFUSING (fail-closed):`, e?.message);
      notify(
        `${vendor} calls refused — spend ceiling cannot be counted`,
        `Redis is unreachable, so the ${vendor} ceiling cannot be enforced, and ${vendor}\n` +
        'has no vendor-side spend cap to fall back on. Calls are being refused rather\n' +
        'than run uncounted.\n\n' +
        'IMPACT: degraded only — /api/lookup falls back to manual entry and\n' +
        '/api/comps returns 503. Fix Upstash and this clears itself.'
      );
      return { ok: false, used: 0, limit: limit ?? Infinity, vendor, reason: 'ceiling_unavailable' };
    }
    console.warn(`[spendGuard] unavailable for ${vendor}, allowing:`, e?.message);
    return allow;
  }
}

/**
 * Read today's usage without incrementing. For an ops/health view.
 *
 * Vendors with a monthly ceiling also report `month`, because for those the daily
 * number alone is misleading: RentCast can sit at 4/100 for the day while the
 * month is at 1,480/1,500 and about to cut off.
 */
export async function spendUsage() {
  if (!REST_URL || !REST_TOKEN) return null;
  const vendors = Object.keys(DAILY_BUDGET);
  const monthVendors = Object.keys(MONTHLY_BUDGET);
  try {
    const res = await fetch(`${REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ...vendors.map((v) => ['GET', todayKey(v)]),
        ...monthVendors.map((v) => ['GET', monthKey(v)]),
      ]),
      signal: AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const out = {};
    vendors.forEach((v, i) => {
      out[v] = { used: Number(body?.[i]?.result || 0), limit: DAILY_BUDGET[v] };
    });
    monthVendors.forEach((v, i) => {
      if (!out[v]) return;
      out[v].month = {
        used: Number(body?.[vendors.length + i]?.result || 0),
        limit: MONTHLY_BUDGET[v],
      };
    });
    return out;
  } catch (e) {
    return null;
  }
}

export default checkSpend;
