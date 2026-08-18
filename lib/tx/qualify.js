/**
 * ============================================================================
 * THE SAVINGS GATE — can a protest actually lower this owner's Texas tax bill?
 * ============================================================================
 *
 * WHY THIS EXISTS
 *
 * A Texas protest disputes MARKET value. Tax is levied on APPRAISED value, which
 * is market value as limited by the § 23.23 homestead cap (10%/yr) or the
 * § 23.231 circuit breaker (20%/yr, non-homestead, expiring 31 Dec 2026).
 *
 * When market value has outrun the capped appraised value there is a gap, and
 * inside that gap a protest is worth nothing. Winning a reduction that lands
 * anywhere above the cap ceiling changes the bill by ZERO DOLLARS.
 *
 * Worked example, a real Nueces parcel (prop_id 181619, hood G100):
 *
 *     market value                    $179,765
 *     § 23.23 cap adjustment           $30,955
 *     appraised (capped, taxed on)    $148,810
 *
 *     Win a reduction to $160,000  -> still above $148,810 -> saves $0
 *     Win a reduction to $140,000  -> saves tax on $8,810, not on $39,765
 *
 * Selling that owner an $89 filing without checking is taking money for an
 * outcome that may be arithmetically impossible.
 *
 * Measured across five counties and 348,453 residential parcels, the share that
 * cannot benefit ranges from 13.2% (Wichita) to 31.5% (Jefferson). It is not a
 * rounding error and it is not uniform, so it must be computed per parcel and
 * never assumed from a state average.
 *
 * ============================================================================
 * THE DISTRICT HAS ALREADY DONE THE ARITHMETIC FOR US
 * ============================================================================
 * Unlike Florida, where the differential is derived by comparing just value to
 * assessed value per levy, the Texas roll publishes the cap adjustment as its
 * own field. `homestead_cap_loss` (§ 23.23) and `nhs_cap_loss` (§ 23.231) ARE
 * the gap. Their sum is exactly how far market value must fall before the bill
 * moves at all. No inference, no estimate, no vendor.
 *
 * Verified: assessed = appraised − homestead_cap − nhs_cap held on every sampled
 * row of all five counties loaded.
 *
 * ============================================================================
 * FACT vs ESTIMATE — KEEP THESE APART
 * ============================================================================
 * This module returns two categorically different kinds of statement and the UI
 * must never blur them.
 *
 *   FACT      `requiredReduction` and `breakEvenMarketValue` are arithmetic on
 *             the district's own certified roll. They are as true as the roll is,
 *             and they can be quoted to a customer as a statement about their
 *             property.
 *
 *   ESTIMATE  anything involving a dollar SAVING, because that needs a tax rate
 *             and an exemption model, and this module has neither yet (see
 *             DEFAULT_TAX_RATE). These are projections and must be labelled as
 *             such wherever they are shown.
 *
 * Conflating them is how a document-preparation service starts making
 * representations it cannot support.
 */

/**
 * LAST-RESORT combined tax rate, used only when the real rate for the parcel's
 * taxing units is unavailable.
 *
 * REPLACE THIS with a rate table keyed on the taxing units in
 * tx_parcel_entities. Texas total rates run roughly 1.5%–2.8% depending on
 * county, city, ISD, MUD and hospital district. A MUD alone can add 1%, so a
 * single statewide number is wrong for any specific address and is here only so
 * the gate can rank parcels, never so it can quote a customer.
 */
export const DEFAULT_TAX_RATE = 0.022;

/**
 * WHAT A GOOD PROTEST ACTUALLY ACHIEVES.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * NO LONGER A GUESS. MEASURED 16 AUGUST 2026.
 * ════════════════════════════════════════════════════════════════════════════
 * These began as placeholders — 0.15 and 0.08 — chosen conservatively and
 * deliberately NOT sourced from a competitor's marketing, with a note saying to
 * replace them with real data. That has now happened, by a route the original
 * note did not anticipate: not from ARB hearing outcomes, but from the evidence
 * itself. scripts/tx/sellable.mjs builds a real § 41.43(b)(3) comp set for each
 * of 2,000 sampled A1 parcels and computes the reduction those comparables
 * actually indicate. n = 947 filable cases across five counties.
 *
 *   plausible  = the MEDIAN indicated reduction
 *   optimistic = the 75th percentile
 *
 * The old guess survives contact with the data — 6.3% measured against 8%
 * assumed — which is worth stating plainly rather than quietly overwriting.
 *
 * A SINGLE STATEWIDE NUMBER IS STILL WRONG FOR ANY SPECIFIC PARCEL.
 * The county spread is nearly sevenfold and it is not noise. It tracks each
 * district's own valuation uniformity, measured as coefficient of dispersion:
 *
 *     cad  county      median   p75    COMP-SET COD   sellable
 *     123  Jefferson    9.3%   19.5%        9.9         37.8%
 *     221  Taylor       7.9%   17.1%       10.1         39.8%
 *     243  Wichita      6.7%   13.0%        8.0         36.0%
 *     178  Nueces       5.9%   12.3%        6.5         40.5%
 *     129  Kaufman      1.4%    3.6%        1.6         18.5%
 *
 * Read that table as ONE relationship: the reduction available IS the district's
 * own dispersion. Equal and uniform does not attack a value, it attacks
 * INCONSISTENCY — so a district that values uniformly leaves nothing to win.
 *
 * ── THE COD COLUMN ABOVE IS NOT THE IAAO COD. DO NOT QUOTE IT AS ONE. ───────
 * It is measured over each COMP SET, which scripts/tx/comps.js has already
 * filtered to a narrow size, age and land-share band around one subject. That
 * filtering is what makes it tight, so it is systematically lower than the real
 * thing and it cannot be compared against the IAAO residential benchmark of 15.
 * It is kept here only because it is the denominator of sellable.mjs's internal
 * consistency check — "is our indicated reduction tracking the district's spread
 * or a comp-selection bug" — and it was recorded alongside these reductions.
 *
 * The IAAO figure, measured across whole neighbourhoods per the Standard on
 * Ratio Studies, is produced by scripts/tx/county-stats.mjs and lives in
 * lib/tx/countyStats.json. It is the only one that may go on a public page:
 *
 *     cad  county      comp-set   IAAO (neighbourhood)
 *     123  Jefferson      9.9            12.8
 *     221  Taylor        10.1            15.5   <- OUTSIDE the standard
 *     243  Wichita        8.0            12.2
 *     178  Nueces         6.5            12.3
 *     129  Kaufman        1.6             9.3
 *
 * An earlier version of this comment said all five sat inside the IAAO standard.
 * That was read off the comp-set column and it was wrong: Taylor is outside it,
 * which is both the strongest publishable finding we have and consistent with
 * Taylor showing the second-highest measured reduction.
 *
 * Kaufman is still the tight-district case — 9.3 is genuinely uniform work,
 * almost certainly straight off a cost schedule, and 1.4% is what is left after
 * competence. That conclusion survives because 1.4% was measured directly by
 * running the comp selector, not inferred from the dispersion figure.
 *
 * RE-MEASURE AS COUNTIES LOAD. Five of 254 is not Texas.
 */
export const OPTIMISTIC_REDUCTION_PCT = 0.135;
export const PLAUSIBLE_REDUCTION_PCT = 0.063;

// `compSetCod`, not `cod`. The name is the guard: a caller reaching for a
// publishable uniformity figure will not find one here, which is correct — that
// number lives in lib/tx/countyStats.json.
export const REDUCTION_BY_CAD = {
  123: { plausible: 0.093, optimistic: 0.195, compSetCod: 9.9 },
  129: { plausible: 0.014, optimistic: 0.036, compSetCod: 1.6 },
  178: { plausible: 0.059, optimistic: 0.123, compSetCod: 6.5 },
  221: { plausible: 0.079, optimistic: 0.171, compSetCod: 10.1 },
  243: { plausible: 0.067, optimistic: 0.130, compSetCod: 8.0 },
};

/**
 * Reduction expectations for a parcel, preferring the measured county figure.
 *
 * `measured` is returned alongside the numbers because "we have not loaded this
 * county yet" and "we have measured this county" must never look identical to a
 * caller deciding whether it may quote a figure to a customer.
 */
export function reductionExpectation(cadId) {
  const hit = REDUCTION_BY_CAD[Number(cadId)];
  return hit
    ? { ...hit, measured: true }
    : { plausible: PLAUSIBLE_REDUCTION_PCT, optimistic: OPTIMISTIC_REDUCTION_PCT, compSetCod: null, measured: false };
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * FACT. How far market value must fall before the tax bill changes by one cent.
 * Zero means the property is uncapped and every dollar of reduction reaches the
 * bill immediately.
 */
export function requiredReduction(parcel) {
  return n(parcel.homestead_cap_loss) + n(parcel.nhs_cap_loss);
}

/**
 * FACT. The highest market value that still produces a saving. Below this, every
 * further dollar counts; at or above it, nothing happens.
 *
 * This is simply the capped appraised value — the number already being taxed.
 */
export function breakEvenMarketValue(parcel) {
  const appraised = n(parcel.appraised_value);
  return appraised > 0 ? appraised : null;
}

/**
 * The tax consequence of reducing market value to `requestedMarket`.
 * ESTIMATE — depends on a tax rate this module does not really know.
 *
 * ⚠️ EXEMPTIONS ARE NOT MODELLED, AND THAT ERROR RUNS THE DANGEROUS WAY.
 *
 * The $140,000 school homestead exemption means a modest homestead may have
 * little or no school M&O taxable value, so the true saving is SMALLER than this
 * returns. This figure is an upper bound.
 *
 * My first note here called that "the safe direction", which is wrong and worth
 * correcting rather than deleting. An upper bound means the gate never wrongly
 * REFUSES someone — true, and irrelevant. It means the gate wrongly ACCEPTS
 * people whose real saving is below the fee. For a service that takes $89 up
 * front, accepting someone who cannot benefit is the expensive error; refusing
 * someone who could have is merely a lost sale.
 *
 * Consequence, stated plainly: the FACT half of this module (requiredReduction,
 * breakEvenMarketValue, capStatement) is production-ready and quotable. The
 * SAVING half is not, and must not gate a checkout until tx_parcel_entities is
 * populated and exemptions are subtracted per taxing unit. Until then, treat
 * `saving_below_fee` as a soft warning and `capped_beyond_reach` as the only
 * hard refusal — that one is pure arithmetic and does not depend on a rate.
 */
export function taxEffect(parcel, requestedMarket, taxRate = DEFAULT_TAX_RATE) {
  const current = n(parcel.appraised_value);
  const breakEven = breakEvenMarketValue(parcel);
  if (breakEven === null) return { newAppraised: null, reduction: 0, annualSaving: 0 };

  // The cap ceiling does not move because a protest succeeded. The new appraised
  // value is the lower of the requested market value and what is already taxed.
  const newAppraised = Math.min(n(requestedMarket), current);
  const reduction = Math.max(0, current - newAppraised);
  return {
    newAppraised,
    reduction,
    annualSaving: Math.round(reduction * taxRate),
    taxRateUsed: taxRate,
    taxRateIsDefault: taxRate === DEFAULT_TAX_RATE,
  };
}

/**
 * Decide whether this parcel is worth protesting.
 *
 * THE TEST IS DOLLARS, NOT PERCENTAGES.
 *
 * An earlier instinct is to refuse whenever the required cut exceeds some
 * multiple of a typical reduction. That is the wrong shape, and the Florida gate
 * already learned it: a 20% required cut is hopeless on a $150,000 house and
 * perfectly winnable on a $900,000 one, because 20% of the second is a number a
 * real comp set can support. Same ratio, opposite answer.
 *
 * So we refuse in exactly two cases:
 *   1. Even an OPTIMISTIC reduction lands above the break-even — the bill cannot
 *      move, at any plausible outcome.
 *   2. A PLAUSIBLE reduction would save less than the fee — the customer would
 *      pay us more than we could win them.
 *
 * Everything else proceeds. A long shot with real money behind it is the owner's
 * call to make, not ours; our job is to be honest about the odds, not to decide
 * for them.
 */
export function qualify(parcel, opts = {}) {
  const {
    serviceFee = 89,
    // Until exemptions are modelled the saving estimate is an upper bound, so
    // refusing on it under-refuses (see taxEffect). Callers that gate money
    // should pass `hardRefuseOnSaving: false` and treat that outcome as a
    // warning shown to the customer, not as a door closed on them.
    hardRefuseOnSaving = true,
    taxRate = DEFAULT_TAX_RATE,
  } = opts;

  // Prefer the MEASURED reduction for this parcel's county over the statewide
  // constants. Passing them explicitly still wins, so callers running a
  // sensitivity analysis can override; absent that, a Kaufman parcel is now
  // judged on Kaufman's 1.4% rather than on a statewide 6.3% that would accept
  // customers there who cannot clear the fee.
  const expected = reductionExpectation(parcel.cad_id);
  const optimisticReductionPct = opts.optimisticReductionPct ?? expected.optimistic;
  const plausibleReductionPct = opts.plausibleReductionPct ?? expected.plausible;

  const market = n(parcel.market_value);
  const appraised = n(parcel.appraised_value);
  const gap = requiredReduction(parcel);
  const breakEven = breakEvenMarketValue(parcel);

  if (!market || !appraised) {
    return { eligible: false, reason: 'no_value_on_roll',
      message: 'The appraisal district has no current value on file for this property.' };
  }
  if (breakEven === null) {
    return { eligible: false, reason: 'no_taxable_value',
      message: 'This property has no appraised value, so a protest cannot reduce the tax owed.' };
  }

  // FACT — quotable to the customer.
  const facts = {
    marketValue: market,
    appraisedValue: appraised,
    requiredReduction: gap,
    breakEvenMarketValue: breakEven,
    isCapped: gap > 0,
    capStatement: gap > 0
      ? `The district values your property at $${market.toLocaleString()} but you are taxed on $${appraised.toLocaleString()}, because the ${parcel.has_homestead === true || parcel.has_homestead === 'true' ? '10% homestead' : '20%'} cap holds your appraised value $${gap.toLocaleString()} below market. A protest must bring the market value below $${breakEven.toLocaleString()} before your tax bill changes at all.`
      : `You are taxed on the district's full market value of $${market.toLocaleString()}. There is no cap in the way, so every dollar of reduction lowers your bill.`,
  };

  // Uncapped: the best case in Texas. Every dollar counts from the first dollar.
  if (gap === 0) {
    const best = taxEffect(parcel, market * (1 - plausibleReductionPct), taxRate);
    if (best.annualSaving < serviceFee) {
      return { ...facts, eligible: !hardRefuseOnSaving, savingWarning: true,
        reason: 'saving_below_fee', confidence: 'high',
        message: `We do not think this protest is worth filing. Even a solid ${(plausibleReductionPct * 100).toFixed(0)}% reduction would save you about $${best.annualSaving.toLocaleString()} a year, which is less than the $${serviceFee} it costs to file. We would rather tell you that than take the fee.` };
    }
    return { ...facts, eligible: true, confidence: 'high', reason: 'uncapped',
      estimatedSaving: best.annualSaving, estimateIsUpperBound: true };
  }

  // Capped. Can an optimistic outcome even reach the break-even?
  const optimistic = taxEffect(parcel, market * (1 - optimisticReductionPct), taxRate);
  if (optimistic.reduction <= 0) {
    return { ...facts, eligible: false, reason: 'capped_beyond_reach', confidence: 'high',
      message: `A protest would not lower your tax bill this year. ${facts.capStatement} Even a ${(optimisticReductionPct * 100).toFixed(0)}% reduction — a strong result — would change nothing, because your appraised value is already capped below that. You are paying tax on $${gap.toLocaleString()} less than the district says your property is worth.` };
  }

  const plausible = taxEffect(parcel, market * (1 - plausibleReductionPct), taxRate);
  if (plausible.annualSaving < serviceFee) {
    return { ...facts, eligible: !hardRefuseOnSaving, savingWarning: true,
      reason: 'saving_below_fee', confidence: 'medium',
      message: `We do not think this protest is worth filing. ${facts.capStatement} A typical ${(plausibleReductionPct * 100).toFixed(0)}% reduction would save you roughly $${plausible.annualSaving.toLocaleString()} a year, less than the $${serviceFee} filing fee.` };
  }

  return { ...facts, eligible: true, confidence: 'medium', reason: 'capped_but_reachable',
    estimatedSaving: plausible.annualSaving, estimateIsUpperBound: true };
}

export default { qualify, taxEffect, requiredReduction, breakEvenMarketValue, DEFAULT_TAX_RATE };
