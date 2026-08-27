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
import { wilsonInterval, compareToReference } from '../../lib/wilson';

export const config = { maxDuration: 60 };

const CHART_DAYS = 45;
const BREAKDOWN_DAYS = 30;
const MAX_BREAKDOWN_DAYS = 365;

/**
 * THE BREAKDOWN WINDOW IS A PARAMETER BECAUSE ONE DAY IS THE QUESTION.
 *
 * `byOutcome` and `byCounty` were pinned at 30 days, and the daily chart could
 * only ever say how BIG each group was, never which outcomes were in it. So the
 * one question the Funnel tab gets opened to answer -- "the grey bar moved
 * today, which of the three was it" -- had no answer anywhere in /admin. A
 * trailing 30-day table cannot answer it: the 26 Aug city-strip fix took
 * no_parcel from 35% to 10% in a single day and the trailing window still read
 * 27%. Both numbers are true and only one of them is about today.
 *
 * `days` narrows the two TABLES only. The chart stays pinned at CHART_DAYS,
 * because a control that silently reshapes the chart underneath the table turns
 * one reading into two incomparable ones -- and the chart is the thing you look
 * at to decide which day is worth narrowing to.
 *
 * ============================================================================
 * WHY THIS IS A FUNCTION AND NOT `Number(req.query.days) || BREAKDOWN_DAYS`
 * ============================================================================
 * NaN is the failure this codebase has already been bitten by one layer down: a
 * non-numeric DOR_ROLL_YEAR reached SQL as NaN and produced a miss that was
 * "indistinguishable from a genuine miss, for every address in Florida"
 * (No_Finding_Three_Causes_2026-08-25.md). `?days=abc` must not reach Postgres.
 *
 * `||` alone would not be enough either. It folds 0 into the default, which is
 * harmless, but it PASSES -5, and `current_date - make_interval(days => -5)` is
 * a window five days in the FUTURE: an empty table that reads as "nothing was
 * recorded" rather than "you asked for a nonsense window". Every rejected value
 * falls back to the documented default rather than erroring, because this is a
 * query string on an internal dashboard and a 400 here helps nobody.
 *
 * WHOLE-STRING MATCH RATHER THAN parseInt. parseInt takes the longest numeric
 * PREFIX, so `?days=7abc` becomes 7 and `?days=1,90` becomes 1 -- it answers a
 * question nobody asked instead of falling back to a documented default. It also
 * made the array branch below unreachable in practice, which is how this was
 * found: the injection that deleted that branch could not be made to fail.
 * Untestable and dead turned out to be the same defect.
 */
export function resolveBreakdownDays(raw) {
  // Array when the query string repeats the key (?days=1&days=90). Take the
  // first rather than letting "1,90" stringify into something unparseable.
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first == null) return BREAKDOWN_DAYS;
  const s = String(first).trim();
  // Digits only, end to end. Rejects '', 'abc', '7abc', '1,90', '1.5', '-5'.
  if (!/^\d+$/.test(s)) return BREAKDOWN_DAYS;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return BREAKDOWN_DAYS;
  return Math.min(n, MAX_BREAKDOWN_DAYS);
}

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

    const breakdownDays = resolveBreakdownDays(req.query?.days);

    const [daily, byOutcome, byCounty, dailyOutcomes] = await Promise.all([
      supabase.rpc('check_events_daily', { days: CHART_DAYS }),
      supabase.rpc('check_events_by_outcome', { days: breakdownDays, src: null }),
      supabase.rpc('check_events_by_county', { days: breakdownDays }),
      /**
       * THE NAMED SPLIT, PER DAY. scripts/sql/check_events_daily_outcomes.sql.
       *
       * Pinned to CHART_DAYS, not breakdownDays: this feeds the chart's tooltip,
       * and a tooltip that goes blank on the days outside the table's window
       * would be a chart that stops explaining itself the moment you narrow it.
       *
       * Its failure is handled below rather than here, on purpose -- a missing
       * migration must degrade the tooltip, never blank the tab.
       */
      supabase.rpc('check_events_daily_outcomes', { days: CHART_DAYS }),
    ]);

    if (daily.error) {
      console.error('check-roster daily read failed:', daily.error);
      return res.status(500).json({
        error: `Daily check read failed: ${daily.error.message}`,
        hint: 'If this says the function does not exist, scripts/sql/check_events.sql has not been run on this database.',
      });
    }

    /**
     * WHICH outcomes, per day -- the thing the tooltip was missing.
     *
     * The chart's five segments say how big each group was. They cannot say
     * whether today's grey was a condo owner picking a unit, a Texan, or a
     * retrieval bug producing a miss that looks exactly like a house that is not
     * on the roll. That last one is not hypothetical: it is what 25 Aug's 28
     * `no_parcel` rows turned out to be.
     *
     * Labelled and grouped HERE rather than in pages/admin.js, so lib/checkOutcomes.js
     * stays the single vocabulary and the panel never grows a second copy of it
     * that can drift -- the same reason `byOutcome` rows carry label and group.
     *
     * `unrecognised` rides along for the same reason it does on byOutcome rows:
     * outcomeGroup() defaults an unknown outcome to no_answer, so without this
     * flag a brand-new outcome would appear in the tooltip as a plausible grey
     * line and look like a diagnosis instead of a gap.
     */
    const outcomesByDate = new Map();
    if (!dailyOutcomes.error) {
      for (const r of dailyOutcomes.data || []) {
        if (!outcomesByDate.has(r.checked_on)) outcomesByDate.set(r.checked_on, []);
        outcomesByDate.get(r.checked_on).push({
          outcome: r.outcome,
          checks: Number(r.checks) || 0,
          group: outcomeGroup(r.outcome),
          label: outcomeLabel(r.outcome),
          unrecognised: !Object.prototype.hasOwnProperty.call(OUTCOMES, r.outcome),
        });
      }
    }

    const days = (daily.data || []).map((r) => ({
      date: r.checked_on,
      checks: Number(r.checks) || 0,
      refused: Number(r.refused) || 0,
      eligible: Number(r.eligible) || 0,
      rescuable: Number(r.rescuable) || 0,
      /*
        THE GREY BAR WAS A RESIDUAL, AND A RESIDUAL CANNOT BE ACTED ON. 26 Aug 2026.

        /admin computed "no finding" as checks minus the three findings, which merged
        an out-of-state visitor (never a customer) with a database outage (drop
        everything). These two columns are read from the RPC instead of subtracted,
        so the chart states what happened rather than inferring what did not.

        Defaulted to 0 rather than left undefined: until
        scripts/sql/check_events_daily_split.sql has been run the RPC returns the old
        five columns, and the chart must show two empty segments rather than NaN
        heights.
      */
      ourFailure: Number(r.our_failure) || 0,
      noAnswer: Number(r.no_answer) || 0,

      // Empty whenever check_events_daily_outcomes.sql has not been run. The
      // tooltip falls back to the group counts rather than rendering nothing.
      outcomes: outcomesByDate.get(r.checked_on) || [],
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

      /**
       * THE RATE TRAVELS WITH ITS ERROR BAR, AND THE VERDICT IS DERIVED FROM IT.
       *
       * Shipped first without this, and the panel's first render told Nathan his
       * ad targeting was working — off one check, which the session that built
       * the feature had run itself. A rate with no sample size attached invites
       * exactly that reading, and this panel exists to inform ad spend during a
       * three-week season.
       *
       * `verdict` is not a threshold on n. It is whether the interval EXCLUDES
       * the roll's prediction, so the claim is available precisely when the data
       * can support it and not one check sooner. See lib/wilson.js.
       */
      const ROLL_PREDICTED_RATE = 38.7;
      const interval = wilsonInterval(refused, findings);
      const verdict = compareToReference(interval, ROLL_PREDICTED_RATE / 100);

      const pct = (x) => (x == null ? null : Math.round(x * 1000) / 10);

      return {
        refused,
        rescuable,
        eligible,
        noAnswer,
        // The honest denominator. See the header.
        findings,
        checks: findings + noAnswer,
        refusalRate: findings > 0 ? Math.round((refused / findings) * 1000) / 10 : null,

        // 95% Wilson bounds, as percentages. Null when nothing reached a finding.
        // Wilson rather than the textbook interval because at 0 refusals the
        // normal approximation collapses to ±0 and would report certainty from a
        // single observation — which is the state this panel starts in.
        ciLow: interval ? pct(interval.lower) : null,
        ciHigh: interval ? pct(interval.upper) : null,

        // 'above' | 'below' | 'indistinguishable' | 'no_data'
        verdict,

        // What the county roll predicts, for comparison. pages/api/check.js:
        // 1,995,000 of 5,155,929 residential parcels across the 13 largest
        // counties cannot benefit -- 38.7%. If the observed rate tracks this,
        // the funnel is working and the market is the constraint. If it is far
        // higher, the ads are reaching the wrong homeowners.
        rollPredictedRate: ROLL_PREDICTED_RATE,
      };
    };

    const fromCheck = summarise('check');
    const fromApply = summarise('apply');
    const overall = summarise(null);

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      timezone: 'America/Chicago',
      chartDays: CHART_DAYS,
      // The RESOLVED window, not the constant. The panel prints this, so a
      // rejected ?days= must be visible as the default it fell back to rather
      // than as the value that was asked for.
      breakdownDays,
      breakdownDaysDefault: BREAKDOWN_DAYS,

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

      /**
       * Reported rather than swallowed. If this is set, every day's `outcomes`
       * is empty and the tooltip is showing group counts only -- which looks
       * identical to the tooltip working, and is exactly the class of silent
       * degradation the health check exists to make visible. Almost always means
       * scripts/sql/check_events_daily_outcomes.sql has not been run here.
       */
      seriesOutcomesError: dailyOutcomes.error ? dailyOutcomes.error.message : null,

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
