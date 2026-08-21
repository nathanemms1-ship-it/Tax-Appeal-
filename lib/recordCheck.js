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
export async function recordCheckOutcome({ outcome, source, county, requiredCutPct } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

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
      return 'rejected';
    }
    return 'ok';
  } catch (e) {
    if (e?.name === 'AbortError') {
      console.error(`[check-events] insert timed out after ${TIMEOUT_MS}ms — row abandoned, answer served.`);
      return 'timeout';
    }
    console.error(`[check-events] insert failed: ${e?.message || e}`);
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

export default recordCheckOutcome;
