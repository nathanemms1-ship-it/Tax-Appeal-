/**
 * A CONFIDENCE INTERVAL FOR A PROPORTION, SO A RATE CANNOT LIE ABOUT ITS OWN
 * PRECISION.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * The /admin Funnel panel shipped on 21 Aug 2026 rendering a verdict sentence
 * beneath the refusal rate -- "the traffic is better-qualified than a random
 * Florida homeowner, which is what good targeting looks like" -- and it fired at
 * ANY sample size. Its first appearance was computed from a single check, which
 * had been run by the session that built the feature. A panel that states a
 * conclusion about ad targeting off n=1 is the same defect as the verify script
 * whose "earliest is X" line kept printing Hillsborough after it stopped being
 * true: a report that has gone false while still looking like a report.
 *
 * The fix is not an arbitrary "hide it below N checks". It is to give the number
 * an error bar and let the error bar decide whether a claim is available.
 *
 * ============================================================================
 * WHY WILSON AND NOT THE OBVIOUS ONE
 * ============================================================================
 * The textbook normal-approximation interval, p ± z·sqrt(p(1-p)/n), is wrong in
 * exactly the situation this panel lives in for its first week:
 *
 *   - At p = 0 -- which is what 0 refusals out of 1 check gives -- the standard
 *     error collapses to zero and the interval becomes 0% ± 0%. It would report
 *     PERFECT CERTAINTY from a single observation, which is worse than printing
 *     nothing, because it looks like rigour.
 *   - At small n it routinely produces bounds below 0% or above 100%.
 *
 * Wilson has neither failure. It never leaves [0,1], and at p = 0 it still
 * returns a wide upper bound -- 0/1 gives an upper bound near 79%, which is the
 * honest statement that one check tells you almost nothing.
 *
 * No continuity correction: this is a decision aid for reading a dashboard, not
 * a paper, and the uncorrected form is what `statsmodels.proportion_confint(...,
 * method='wilson')` returns -- which is what the values in
 * scripts/verify-check-events.mjs were generated from, independently of this
 * file. That cross-check is the point: a numerical function asserted only
 * against its own output proves nothing.
 */

/** 95%. Two-sided normal quantile, z_{0.975}. */
export const Z95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion.
 *
 * @param   {number} successes  count of the thing being measured (refusals)
 * @param   {number} total      count of trials (checks that reached a finding)
 * @param   {number} [z]        normal quantile; defaults to 95% two-sided
 * @returns {{point:number, lower:number, upper:number, n:number}|null}
 *          Proportions in [0,1], or null when there is nothing to describe.
 *
 * Returns NULL rather than an interval of [0,1] when total is 0. An interval
 * spanning everything is still a number on a screen, and somebody will read it;
 * null forces the caller to say "no data" in words instead.
 */
export function wilsonInterval(successes, total, z = Z95) {
  const k = Number(successes);
  const n = Number(total);

  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0 || k < 0 || k > n) return null;

  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  return {
    point: p,
    // Clamped only against floating-point drift at the extremes. Wilson cannot
    // mathematically exceed [0,1]; this stops -1e-17 rendering as "-0.0%".
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
    n,
  };
}

/**
 * Is the observed rate distinguishable from a reference rate?
 *
 * This is the whole reason the interval is computed. The panel may only claim
 * "running above" or "running below" the county roll's prediction when the
 * interval EXCLUDES it. Any overlap and the honest answer is that the data does
 * not yet separate the two -- which is the state the panel will be in for its
 * first several days, and precisely when a confident sentence would do the most
 * damage.
 *
 * @returns {'above'|'below'|'indistinguishable'|'no_data'}
 */
export function compareToReference(interval, referenceProportion) {
  if (!interval) return 'no_data';
  const ref = Number(referenceProportion);
  if (!Number.isFinite(ref)) return 'no_data';
  if (interval.upper < ref) return 'below';
  if (interval.lower > ref) return 'above';
  return 'indistinguishable';
}

export default wilsonInterval;
