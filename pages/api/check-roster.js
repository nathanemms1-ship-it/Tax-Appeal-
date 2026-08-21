// pages/api/check-roster.js
/**
 * WHAT THE FREE SAVINGS CHECK ACTUALLY TOLD PEOPLE.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * /api/traffic-roster answers "did anyone come". /api/waitlist-roster answers
 * "did anyone leave an email". /api/get-orders answers "did anyone pay". The
 * question with no endpoint was the one in the middle and the one that decides
 * the other two: OF THE PEOPLE WHO TYPED AN ADDRESS, WHAT DID WE TELL THEM?
 *
 * The suspicion this was built to test is that most visitors are being refused
 * because Save Our Homes has capped their assessed value below market, in which
 * case no amount of ad spend converts them and the product is working exactly as
 * designed. That is `cap_absorbs_everything`, and until check_events existed it
 * could be neither confirmed nor ruled out.
 *
 * ============================================================================
 * THE REFUSAL RATE IS COMPUTED OVER FINDINGS, NOT OVER CHECKS
 * ============================================================================
 * Read this before quoting the number. `refusalRate` divides refusals by checks
 * that reached a FINDING -- refused + rescuable + eligible. It deliberately
 * excludes the no_answer group: a Texan on a Florida page, an address we hold no
 * parcel for, an ambiguous match, a 500. Those are coverage and plumbing
 * failures, and folding them in would produce a number that rises when the roll
 * loader breaks and reads as "the market got worse".
 *
 * Both denominators are returned so the other number is one division away and
 * nobody has to guess which one a figure came from.
 *
 * ============================================================================
 * COUNTS ARE SQL AGGREGATES
 * ============================================================================
 * Same reasoning as traffic-roster: counting fetched rows starts understating
 * the day checks exceed the fetch cap, silently. The RPCs in
 * scripts/sql/check_events.sql cannot truncate. A missing RPC is reported as an
 * explicit error rather than rendered as zero -- a migration run on one
 * environment and not another must not look like a day when nobody checked,
 * because that is a conclusion Nathan could act on by changing the ads.
 *
 *   POST /api/check-roster   { "password": "..." }
 *   GET  /api/check-roster   with header  X-Admin-Password: ...
 */
import { getSupabaseAdmin } from './supabase';
import { requireAdmin } from '../../lib/adminAuth';
import { OUTCOMES, outcomeGroup, outcomeLabel } from '../../lib/checkOutcomes';

export const config = { maxDuration: 60 };

const CHART_DAYS = 45;
const BREAKDOWN_DAYS = 30;

export default async function handler(req, res) {
  // requireAdmin returns TRUE when it has REJECTED and already responded. This
  // was written inverted once in waitlist-roster, where it returned empty for a
  // valid admin and ran the query for an invalid one. Match the working form.
  if (await requireAdmin(req, res, 'check-roster')) return;

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase is not configured.' });
    }

    const [daily, byOutcome, byCounty] = await Promise.all([
      supabase.rpc('check_events_daily', { days: CHART_DAYS }),
      supabase.rpc('check_events_by_outcome', { days: BREAKDOWN_DAYS, src: null }),
      supabase.rpc('check_events_by_county', { days: BREAKDOWN_DAYS }),
    ]);

    if (daily.error) {
      console.error('check-roster daily read failed:', daily.error);
      return res.status(500).json({
        error: `Daily check read failed: ${daily.error.message}`,
        hint: 'If this says the function does not exist, scripts/sql/check_events.sql has not been run on this database.',
      });
    }

    const days = (daily.data || []).map((r) => ({
      date: r.checked_on,
      checks: Number(r.checks) || 0,
      refused: Number(r.refused) || 0,
      eligible: Number(r.eligible) || 0,
      rescuable: Number(r.rescuable) || 0,
    }));

    // Ordered newest-first by the RPC. The chart wants oldest-first.
    const series = [...days].reverse();

    const todayCentral = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const sum = (key, n) => days.slice(0, n).reduce((acc, d) => acc + d[key], 0);

    const rows = (byOutcome.data || []).map((r) => ({
      outcome: r.outcome,
      source: r.source,
      checks: Number(r.checks) || 0,
      // How far below the cap this group sat, in whole percent. Null wherever
      // the arithmetic never ran (every no_answer outcome).
      medianCutPct: r.median_cut_pct == null ? null : Math.round(Number(r.median_cut_pct)),
      group: outcomeGroup(r.outcome),
      label: outcomeLabel(r.outcome),
      // TRUE when this outcome is not in lib/checkOutcomes.js. The build guard
      // should make this impossible; surfaced anyway, because "impossible" is
      // what every silent failure in this codebase has been called first.
      unrecognised: !Object.prototype.hasOwnProperty.call(OUTCOMES, r.outcome),
    }));

    const totalIn = (group, src) => rows
      .filter((r) => r.group === group && (!src || r.source === src))
      .reduce((a, r) => a + r.checks, 0);

    /**
     * Split by source. `check` is the top of the funnel and the ad landing page;
     * `apply` is the same endpoint re-run for somebody already inside it. The
     * headline refusal rate uses `check` alone when there is anything there to
     * use, because that is the population the ads are buying.
     */
    const summarise = (src) => {
      const refused = totalIn('refused', src);
      const rescuable = totalIn('rescuable', src);
      const eligible = totalIn('eligible', src);
      const noAnswer = totalIn('no_answer', src);
      const findings = refused + rescuable + eligible;
      return {
        refused,
        rescuable,
        eligible,
        noAnswer,
        // The honest denominator. See the header.
        findings,
        checks: findings + noAnswer,
        refusalRate: findings > 0 ? Math.round((refused / findings) * 1000) / 10 : null,
        // What the county roll predicts, for comparison. pages/api/check.js:
        // 1,995,000 of 5,155,929 residential parcels across the 13 largest
        // counties cannot benefit -- 38.7%. If the observed rate tracks this,
        // the funnel is working and the market is the constraint. If it is far
        // higher, the ads are reaching the wrong homeowners.
        rollPredictedRate: 38.7,
      };
    };

    const fromCheck = summarise('check');
    const fromApply = summarise('apply');
    const overall = summarise(null);

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      timezone: 'America/Chicago',
      chartDays: CHART_DAYS,
      breakdownDays: BREAKDOWN_DAYS,

      todayDate: todayCentral,
      today: days.find((d) => d.date === todayCentral)?.checks || 0,

      totals: {
        last7: sum('checks', 7),
        last30: sum('checks', 30),
        refusedLast30: sum('refused', 30),
        note: 'One row per check. Nothing identifies the visitor, so somebody checking three addresses is three checks and a refresh is two — compare against /check visitors on the Traffic tab.',
      },

      // The headline. Falls back to the combined figure only when /check itself
      // has recorded nothing, so a day of internal testing on /apply cannot
      // masquerade as the top-of-funnel rate.
      headline: fromCheck.findings > 0 ? fromCheck : overall,
      headlineSource: fromCheck.findings > 0 ? 'check' : 'all',

      bySource: { check: fromCheck, apply: fromApply, all: overall },

      daysRecorded: days.filter((d) => d.checks > 0).length,
      series,

      byOutcome: rows,
      byOutcomeError: byOutcome.error ? byOutcome.error.message : null,

      byCounty: (byCounty.data || []).map((r) => ({
        county: r.county,
        checks: Number(r.checks) || 0,
        refused: Number(r.refused) || 0,
      })),
      byCountyError: byCounty.error ? byCounty.error.message : null,
    });
  } catch (e) {
    console.error('check-roster failed:', e);
    return res.status(500).json({ error: e.message || 'Check roster failed' });
  }
}
