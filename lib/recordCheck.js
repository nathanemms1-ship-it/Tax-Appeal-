/**
 * RECORD WHAT /api/check ANSWERED. One row per check, no identifiers.
 *
 * ============================================================================
 * WHY THIS AWAITS INSTEAD OF FIRING AND FORGETTING
 * ============================================================================
 * middleware.js records visits with `event.waitUntil()` and never blocks the
 * page, which is correct there and is NOT available here. middleware runs in the
 * edge runtime; /api/check is a Node serverless function, and a Node serverless
 * function may be frozen the instant its response is flushed. A promise left
 * running past res.json() is not "fire and forget", it is "fire and probably
 * never happen" -- and it would fail exactly as this table is designed not to:
 * invisibly, producing a plausible-looking panel with a fraction of the rows.
 *
 * So the insert is awaited before the response, and the cost of that is capped
 * by TIMEOUT_MS. The endpoint already runs an indexed query against our own
 * database with no metered API behind it; one more small insert on the same
 * connection is tens of milliseconds. If Supabase is slow or down we abandon the
 * row rather than the answer -- the check must always be faster than the
 * customer's patience, and a lost row is cheaper than a lost customer.
 *
 * ============================================================================
 * IT MUST NOT BE ABLE TO BREAK THE CHECK
 * ============================================================================
 * Every failure path here returns a status string and throws nothing. A missing
 * table, a network error, a timeout, a malformed row -- all of them end with the
 * homeowner still getting their answer. The visible failure lives in
 * lib/healthChecks.js checkCheckOutcomeCapture instead, which is what stops
 * "recording nothing" from looking like "nobody checked today".
 */

import { isKnownOutcome } from './checkOutcomes';

/**
 * Long enough for an ordinary insert on a warm connection, short enough that a
 * degraded database cannot be felt by somebody typing their address. If this is
 * being hit routinely the answer is to look at the database, not to raise it.
 */
const TIMEOUT_MS = 1200;

/**
 * The day boundary is Central, matching site_visits and every date in /admin.
 *
 * On UTC everything after 7pm Nathan's time lands on tomorrow's row, so an
 * evening ad test splits across two days and neither matches the number he
 * remembers. Duplicated from middleware.js rather than shared because that file
 * runs in the edge runtime and is guarded against edits by name in
 * verify-monitoring.mjs; verify-check-events.mjs asserts the two agree.
 */
function centralDate(now = new Date()) {
  // en-CA formats as YYYY-MM-DD, which is what Postgres wants for a date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Whole percent, clamped to something a column can hold.
 *
 * requiredCutPct arrives as a fraction (0.42 for 42%). A parcel capped far below
 * market can produce a genuinely enormous required cut, and an int column plus a
 * median is a bad place to discover that -- so it is bounded rather than
 * rejected. 1000% is "hopeless" and everything past it is the same finding.
 */
function wholePercent(fraction) {
  if (fraction == null || !Number.isFinite(Number(fraction))) return null;
  const pct = Math.round(Number(fraction) * 100);
  if (!Number.isFinite(pct) || pct < 0) return null;
  return Math.min(pct, 1000);
}

/**
 * Only ever these three. An unrecognised source is stored as 'unknown' rather
 * than stored raw: `source` is a small closed set that /admin groups on, and a
 * caller passing a typo -- or a query string -- must not be able to invent a new
 * column value or write something a visitor typed into this table.
 */
function safeSource(source) {
  return source === 'check' || source === 'apply' ? source : 'unknown';
}

/**
 * @returns {Promise<'ok'|'skipped'|'timeout'|'rejected'|'failed'>} for tests and
 *          logs. The caller ignores it; nothing here is worth a branch on the
 *          customer's path.
 */
/**
 * ============================================================================
 * A DROPPED ROW MUST LEAVE A TRACE. THIS IS THAT TRACE.
 * ============================================================================
 * Added 24 Aug 2026, after a morning in which the database was slow for roughly
 * forty minutes — two health probes timed out on `orders` and the admin panel
 * crawled — and the day's funnel read "traffic arrived, nobody ran a check".
 *
 * There is no way to tell those two apart after the fact, and that is the defect.
 * This function abandons its insert after TIMEOUT_MS because a lost row is
 * cheaper than a lost customer, which is the right call and is not changing. But
 * the row leaves NOTHING behind, so a slow database and a quiet day produce
 * identical evidence.
 *
 * Worse, the two are asymmetric in exactly the direction that misleads:
 * middleware.js writes site_visits with `event.waitUntil()` on the edge runtime,
 * where the promise survives the response, so VISITS still land while CHECKS are
 * being dropped. Traffic with no funnel activity is precisely what a slow
 * database looks like — and it is also what a bot wave looks like.
 *
 * A counter in Redis costs nothing on the customer's path and turns "0 checks
 * today" into "0 recorded, 7 dropped", which is a different conversation.
 *
 * ============================================================================
 * IT MUST NOT BE ABLE TO MAKE THINGS WORSE
 * ============================================================================
 * This runs AFTER the insert has already failed, on a request whose response is
 * about to be flushed. So: 500ms budget (well under the insert's own), never
 * throws, never awaited for its result, and silent when Redis is absent. If the
 * counter itself fails we have lost a count of losses, which is the cheapest
 * thing in this file.
 *
 * Keyed by Central date to match check_events.checked_on, so the two numbers can
 * be read side by side without a timezone argument.
 */
const DROP_TIMEOUT_MS = 500;

async function countDrop(kind) {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!restUrl || !restToken) return;
  const day = centralDate();
  try {
    await fetch(`${restUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${restToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', `check-events:dropped:${day}`],
        // Expire well past the point anyone would still be asking about that day.
        ['EXPIRE', `check-events:dropped:${day}`, String(14 * 24 * 60 * 60)],
        ['INCR', `check-events:dropped:${day}:${kind}`],
        ['EXPIRE', `check-events:dropped:${day}:${kind}`, String(14 * 24 * 60 * 60)],
      ]),
      signal: AbortSignal.timeout ? AbortSignal.timeout(DROP_TIMEOUT_MS) : undefined,
    });
  } catch {
    // A lost count of losses. Nothing downstream depends on it being complete —
    // any non-zero value is the finding.
  }
}

/**
 * How many outcomes we failed to record today, for lib/healthChecks.js.
 *
 * Returns null when Redis is absent or unreachable, which the caller must report
 * as "unknown" rather than as zero — saying zero because we could not ask is the
 * same class of lie this whole counter exists to end.
 */
export async function droppedOutcomesToday() {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!restUrl || !restToken) return null;
  try {
    const r = await fetch(`${restUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${restToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['GET', `check-events:dropped:${centralDate()}`]]),
      signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined,
    });
    if (!r.ok) return null;
    const v = (await r.json())?.[0]?.result;
    return v == null ? 0 : Number(v);
  } catch {
    return null;
  }
}

export async function recordCheckOutcome({ outcome, source, county, requiredCutPct, nearMisses } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  /**
   * THE BUILD MUST NOT WRITE INTO THE FUNNEL. Added 21 Aug 2026, after it did.
   *
   * scripts/verify-routes.mjs invokes this endpoint's handler for real during
   * `npm run build`, with the fixture 1130 GLENWOOD CT, WESTON 33326. On Vercel
   * the build environment carries SUPABASE_URL and SUPABASE_SERVICE_KEY -- which
   * is precisely why VISITOR_HASH_SECRET was deliberately kept out of
   * .env.local when the visitor counter was built. So the first deploy of this
   * feature wrote check_events id=1: a synthetic Broward `no_cap_differential`,
   * source `unknown`, three minutes before any human had touched the page.
   *
   * One fake row per deploy is not large in absolute terms and is badly placed:
   * the refusal rate is about to be read off single-digit daily counts, and a
   * guaranteed synthetic ELIGIBLE row biases it toward "the funnel is healthy",
   * which is the wrong direction to be wrong in.
   *
   * THE DEFAULT IS TO RECORD. Only an explicit value here suppresses, so a
   * misconfigured production cannot quietly stop recording -- the failure this
   * whole table exists to make visible. And because the flag is set on
   * process.env by the verify script itself rather than in Vercel, it cannot
   * leak into the serverless runtime, and no HTTP request can set it: a `source`
   * value in the request body would have been settable by anyone wanting to use
   * the free check without appearing in the funnel.
   */
  if (process.env.SUPPRESS_CHECK_EVENTS) return 'suppressed';

  // No credentials is the local-development case and is not an error. It is also
  // the reason this returns a status instead of logging: a warning on every
  // `npm run dev` request trains people to ignore warnings.
  if (!url || !key) return 'skipped';
  if (!outcome || typeof outcome !== 'string') return 'skipped';

  /**
   * AN UNRECOGNISED OUTCOME IS STILL WRITTEN.
   *
   * This is the whole lesson of the waitlist CHECK constraint, applied one layer
   * up. The build guard in verify-check-events.mjs is what keeps the vocabulary
   * honest; if something reaches production that the guard did not catch, the
   * row is the evidence and dropping it would destroy the only trace. Logged
   * once so it is findable, then written anyway.
   */
  if (!isKnownOutcome(outcome)) {
    console.warn(`[check-events] unrecognised outcome "${outcome}" — recording it anyway. Add it to lib/checkOutcomes.js.`);
  }

  const row = {
    checked_on: centralDate(),
    outcome: String(outcome).slice(0, 80),
    source: safeSource(source),
    // County NAME, never the DOR number. join-waitlist.js stored "29" instead of
    // "Hillsborough" and every lookup downstream missed and fell back to a
    // statewide default.
    county: county ? String(county).slice(0, 80) : null,
    required_cut_pct: wholePercent(requiredCutPct),
    // How many roll rows came back and were then rejected by the matcher. Only
    // ever set on no_parcel_near_miss; null everywhere else, including no_parcel,
    // where zero retrieved is what MAKES it no_parcel. Null rather than 0 so the
    // two cannot be confused in a sum.
    near_misses: Number.isFinite(Number(nearMisses)) && Number(nearMisses) > 0
      ? Math.min(Number(nearMisses), 100000)
      : null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/rest/v1/check_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      signal: controller.signal,
    });

    if (!res.ok) {
      /**
       * The loudest line in this file, deliberately.
       *
       * A 400 here almost always means scripts/sql/check_events.sql has not been
       * run on this environment. That produces an empty panel, and an empty
       * panel reads as "nobody is checking" -- which is a conclusion Nathan
       * could act on by changing the ads. The health check is the real answer;
       * this is so the cause is in the logs when somebody goes looking.
       */
      const body = await res.text().catch(() => '');
      console.error(`[check-events] insert rejected (${res.status}): ${body.slice(0, 200)}`);
      await countDrop('rejected');
      return 'rejected';
    }
    return 'ok';
  } catch (e) {
    if (e?.name === 'AbortError') {
      console.error(`[check-events] insert timed out after ${TIMEOUT_MS}ms — row abandoned, answer served.`);
      await countDrop('timeout');
      return 'timeout';
    }
    console.error(`[check-events] insert failed: ${e?.message || e}`);
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

export default recordCheckOutcome;
