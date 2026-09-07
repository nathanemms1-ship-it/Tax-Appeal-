/**
 * ============================================================================
 * COST TO CURE, IN TEXAS — the adapter, and the double-count gate
 * ============================================================================
 *
 * 7 Sept 2026. `TX_Model_Decided_2026-09-04.md` says cost to cure "ports
 * unchanged". It does not, in two specific ways, and both fail silently.
 *
 * ── 1. lib/costToCure.js READS FLORIDA COLUMN NAMES ─────────────────────────
 *
 *   curePriceFor(label, parcel)  reads  parcel.jv, parcel.lnd_val, parcel.tot_lvg_area
 *
 * Note the two spellings inside lib/costToCure.js itself: finishMultiplier's
 * PARAMETER object is camelCase ({ jv, lndVal, totLvgArea }), but curePriceFor
 * builds that object from a snake_case ROLL ROW. The adapter has to match the
 * row, not the parameter — the first version of this file matched the parameter
 * and silently produced multiplier 1.00 on every property, which is the very
 * defect the file was written to prevent. Verified by running both.
 *
 * A Texas roll row has market_value, land_value and living_area. Hand one
 * straight to those functions and nothing throws — `Number(undefined || 0)` is
 * 0, so `improvement > 0` is false and finishMultiplier returns 1, and
 * areaMultiplier(undefined) returns 1. Measured on a real El Paso shape
 * ($312,500 market / $42,000 land / 2,040 sqft):
 *
 *     finishMultiplier   Texas row 1.00   same house, Florida names 0.75
 *     areaMultiplier     Texas row 1.00   same house, Florida names 1.02
 *
 * So every Texas defect would be priced as if the house were a 2,000 sqft
 * mid-market reference home. A 4,000 sqft custom build and a 1,200 sqft starter
 * would get the identical roof quote, and the number would look completely
 * plausible on the page. That is the failure mode this codebase keeps meeting:
 * not a crash, a confident wrong answer.
 *
 * The fix is a shape adapter, not a fork. lib/costToCure.js carries 33 priced
 * defects, each with a published source, and the rule that no entry may exist
 * without one. Forking it would double the maintenance and halve the sourcing.
 *
 * ── 2. TEXAS qualify() HAS NO cureDollars ───────────────────────────────────
 *
 * lib/dor/qualify.js takes `opts.cureDollars` and subtracts it. lib/tx/qualify.js
 * has no such parameter and never mentions issues. Condition currently changes
 * nothing about a Texas verdict. That is handled in lib/tx/protest.js, where the
 * cure adjusts the MARKET-value ground rather than the equity grid — see below.
 *
 * ── WHY CURE DOES NOT TOUCH THE § 41.43(b)(3) GRID ──────────────────────────
 *
 * The equity grid compares APPRAISED values against the median of comparables.
 * Condition is not part of that comparison; it is a market-value argument under
 * § 41.41(a)(1), which Box 1 also preserves. So the two grounds run in parallel
 * and the owner takes the lower, per Texas Disposal Systems Landfill v. Travis
 * CAD (Tex. 2024) — "the benefit of the calculation that results in the lowest
 * appraisal value."
 */

import { totalCostToCure } from '../costToCure';

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * A Texas roll row in the three fields lib/costToCure.js actually reads.
 *
 * `jv` is Florida's just value — the uncapped market number. Texas's equivalent
 * is market_value, NOT appraised_value: appraised_value is the capped figure,
 * and pricing a repair off a capped value would make the same house cheaper to
 * re-roof the longer its owner had lived there.
 */
export function toCureShape(parcel) {
  return {
    jv: n(parcel.market_value),
    lnd_val: n(parcel.land_value),
    tot_lvg_area: n(parcel.living_area),
  };
}

/** totalCostToCure against a Texas roll row. Same table, same sources. */
export function txCostToCure(issues, parcel, overrides = {}) {
  // Texas is West South Central. Entered 7 Sept 2026 from that region's own
  // 2025 report; the citation printed on the exhibit follows the number.
  return totalCostToCure(issues || [], toCureShape(parcel), overrides || {},
    { region: 'west-south-central' });
}

/**
 * ============================================================================
 * THE DOUBLE-COUNT GATE
 * ============================================================================
 *
 * The Texas roll publishes a condition_code per parcel. If the district has
 * ALREADY coded a house below average, its market value may already carry a
 * discount for the very defect we are about to subtract again. Doing so
 * overstates the ask, and an overstated ask is the thing a panel remembers.
 *
 * Decision (Nathan, 7 Sept): apply the cure anyway, and SAY SO on the evidence
 * page. Same posture as disclosing the capped share of the comp set — a panel
 * that spots our weakness before we name it has been handed it for free.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 *
 * A guessed list of condition codes. PACS districts publish their own code
 * vocabularies and lib/tx/pacs.js does not map this field — it is carried
 * through as raw text. Inventing {'P','F','BA'} and calling it "below average"
 * would produce a confident classification of a code we have never seen, which
 * is the same error as a guessed URL in scripts/tx/sources.json.
 *
 * So BELOW_AVERAGE_CONDITION is populated per district from observed data, and
 * anything unrecognised returns 'unknown' — which prints NOTHING on the
 * customer's document. We do not warn a homeowner about an inference we could
 * not actually make.
 *
 * TO POPULATE IT, run against a loaded district:
 *
 *   select condition_code, count(*) from tx_parcels
 *   where cad_id = 71 and tax_year = 2026 and state_class_code like 'A%'
 *   group by 1 order by 2 desc;
 */
export const BELOW_AVERAGE_CONDITION = Object.freeze({
  // 71: new Set([...]),   <- El Paso, pending the query above
});


/**
 * ============================================================================
 * ⚠️ THE COST BASES ARE FLORIDA'S. THIS MUST BE RE-BASED BEFORE TEXAS LAUNCHES.
 * ============================================================================
 *
 * lib/costToCure.js's strongest source is the JLC/Zonda Cost vs. Value Report,
 * and its own comment says why it is tier 1: "regional rather than national".
 * The region it is pinned to is **South Atlantic** — jlconline.com/cost-vs-value/
 * 2025/south-atlantic/ — which is Florida's. Texas is **West South Central**.
 *
 * So the `base` figures in COST_TO_CURE are South Atlantic job costs, and a
 * Texas filing built on them cites Florida-region contractor pricing to an El
 * Paso appraisal review board. The source label prints the region, so the board
 * can read it: the document is honest, but the number is from the wrong place,
 * and the one thing that made the source strong is the thing that is wrong.
 *
 * WHAT IS NOT DONE HERE, DELIBERATELY:
 *
 *   - Relabelling to "West South Central" while keeping South Atlantic numbers.
 *     That turns an accurate citation into a false one.
 *   - Applying a regional multiplier of our own invention. No published figure
 *     was available for it, and a made-up adjustment on a repair estimate is the
 *     fabricated-comparable defect in another costume.
 *
 * WHAT MUST HAPPEN: re-derive the CVV bases from the West South Central report
 * and add a region dimension to SOURCES keyed by state, so Florida keeps its
 * numbers and Texas gets its own. The filing window opens in April, so there is
 * time — but nothing should be mailed on a South Atlantic base.
 *
 * Until then `regionMismatch` is true on every Texas packet that prices a
 * CVV-sourced defect, it is asserted in scripts/verify-tx-protest.mjs so it
 * cannot be quietly forgotten, and it is recorded in the open items.
 */
export const REQUIRED_CVV_REGION = 'west-south-central';

/** True when a priced line leans on a Cost vs. Value figure from another region. */
export function sourceRegionMismatch(priced) {
  return (priced || []).some((x) => !x.ownerSupplied
    && typeof x.sourceUrl === 'string'
    && x.sourceUrl.includes('cost-vs-value')
    && !x.sourceUrl.includes(REQUIRED_CVV_REGION));
}

export const CONDITION_RISK = Object.freeze({
  BELOW_AVERAGE: 'below_average',
  NOT_BELOW_AVERAGE: 'not_below_average',
  UNKNOWN: 'unknown',
});

export function conditionDiscountRisk(parcel) {
  const code = parcel && parcel.condition_code;
  if (code === null || code === undefined || String(code).trim() === '') {
    // The district publishes no condition for this parcel, so it cannot have
    // discounted for one. That is a fact, not a gap.
    return CONDITION_RISK.NOT_BELOW_AVERAGE;
  }
  const known = BELOW_AVERAGE_CONDITION[n(parcel.cad_id)];
  if (!known) return CONDITION_RISK.UNKNOWN;
  return known.has(String(code).trim().toUpperCase())
    ? CONDITION_RISK.BELOW_AVERAGE
    : CONDITION_RISK.NOT_BELOW_AVERAGE;
}

/** Printed on the evidence page only when we can actually make the claim. */
export const DOUBLE_COUNT_DISCLOSURE =
  'The appraisal district already records this property in below-average condition. '
  + 'Part of the repair cost below may therefore be reflected in the district’s value '
  + 'already. It is set out in full so the board can decide how much of it is not.';

export default { txCostToCure, toCureShape, conditionDiscountRisk, CONDITION_RISK };
