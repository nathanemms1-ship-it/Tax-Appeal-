/**
 * THE SAVINGS GATE — can an appeal actually lower this owner's tax bill?
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * A Florida VAB petition disputes JUST value. Property tax is levied on TAXABLE
 * value, which derives from ASSESSED value. For a homesteaded property, assessed
 * value is capped by Save Our Homes (Fla. Stat. § 193.155) at 3%/yr growth, so on
 * a long-held homestead the assessed value sits far below just value.
 *
 * The consequence is not intuitive and it is the single most important fact in
 * this business: BELOW A CERTAIN POINT, WINNING CHANGES NOTHING. Reducing just
 * value only reaches the tax bill once it drops beneath the capped assessed
 * value. Above that line the cap is already binding and the bill does not move.
 *
 * Worked example, a real Hillsborough parcel (U-23-28-17-A4M-000000-00066.0):
 *
 *     Just value       $608,998
 *     Assessed value   $459,927   <- taxes flow from here
 *     Taxable value    $408,516
 *
 *     A VAB reduction saves NOTHING until just value falls below $459,927,
 *     i.e. a 24.5% cut. Comparable sales support roughly $475,000. So this
 *     owner could win a 22% reduction and save exactly zero dollars.
 *
 * Selling that owner a $89 filing is taking money for an outcome that cannot
 * occur. This module exists so the funnel can refuse that sale.
 *
 * ============================================================================
 * THE ASYMMETRY THAT MAKES NON-HOMESTEAD PROPERTY WORTH SELLING TO
 * ============================================================================
 * Non-homesteaded property has its own cap — 10%/yr under § 193.1554 and
 * § 193.1555 — but that cap applies ONLY to non-school levies. School district
 * millage, typically 35-40% of a Florida tax bill, is assessed on full just
 * value with no limitation at all.
 *
 * This is visible directly in the roll data rather than inferred: for a
 * non-homesteaded parcel, AV_SD (assessed value, school) equals JV, while
 * AV_NSD (assessed value, non-school) carries the 10% cap. So for those owners
 * ANY reduction in just value immediately reduces the school portion of the
 * bill. There is no threshold to clear.
 *
 * That is why the math below is done PER LEVY rather than against a single
 * assessed value. Collapsing school and non-school into one number would wrongly
 * disqualify the entire non-homestead market — roughly 30-35% of Florida
 * residential parcels and 64% of the state's property tax revenue.
 *
 * ============================================================================
 * FACT vs OPINION — KEEP THESE APART
 * ============================================================================
 * This module returns two categorically different kinds of statement and the UI
 * must not blur them:
 *
 *   - `breakEven` is ARITHMETIC on the county's own published roll. It is a
 *     fact, it can be stated flatly, and the owner can verify it against their
 *     TRIM notice.
 *   - Whether comparable sales support reaching that number is an OPINION drawn
 *     from evidence. It belongs to the comps engine, not here, and it must be
 *     worded as an opinion.
 *
 * Conflating them is how a document-preparation service starts making
 * unlicensed appraisal claims. See the counsel memo, question 3.
 */

/** Florida DOR land use codes for residential property we can serve. */
export const RESIDENTIAL_USE_CODES = new Set([
  1,  // single family
  2,  // mobile home
  3,  // multi-family fewer than 10 units
  4,  // condominium
  5,  // cooperative
  6,  // retirement home
  7,  // miscellaneous residential
  8,  // multi-family 10 units or more
]);

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/**
 * Compute the tax consequence of reducing just value to `requestedJv`.
 *
 * Exemptions are DERIVED as (assessed - taxable) rather than summed from the 44
 * EXMPT_* columns. Two reasons: the derived figure is what the county actually
 * applied, including any statutory caps or proration we would otherwise have to
 * reimplement; and it cannot drift out of step with the roll the way a
 * reconstructed sum can.
 *
 * Exemptions are dollar amounts, not percentages, so they do NOT scale down with
 * the assessment — which means the taxable value falls dollar-for-dollar with
 * assessed value until it hits zero.
 *
 * @param {object} parcel  a row from the NAL (jv, av_sd, av_nsd, tv_sd, tv_nsd)
 * @param {number} requestedJv  the just value being asked for
 * @param {{school: number, nonSchool: number}} [millage]  rates in mills
 */
export function taxEffect(parcel, requestedJv, millage = null) {
  const jv = n(parcel.jv);
  const avSd = n(parcel.av_sd);
  const avNsd = n(parcel.av_nsd);
  const tvSd = n(parcel.tv_sd);
  const tvNsd = n(parcel.tv_nsd);

  // What the county actually exempted, per levy.
  const exSd = Math.max(0, avSd - tvSd);
  const exNsd = Math.max(0, avNsd - tvNsd);

  // Assessed value can never exceed just value. A cap limits how fast assessed
  // value RISES; it never holds assessed value above the market. So a reduction
  // in just value pulls assessed down only once it crosses beneath it.
  const newAvSd = Math.min(requestedJv, avSd);
  const newAvNsd = Math.min(requestedJv, avNsd);

  const newTvSd = Math.max(0, newAvSd - exSd);
  const newTvNsd = Math.max(0, newAvNsd - exNsd);

  const droppedSd = Math.max(0, tvSd - newTvSd);
  const droppedNsd = Math.max(0, tvNsd - newTvNsd);

  const out = {
    jv,
    requestedJv,
    taxableBefore: { school: tvSd, nonSchool: tvNsd },
    taxableAfter: { school: newTvSd, nonSchool: newTvNsd },
    taxableReduction: { school: droppedSd, nonSchool: droppedNsd },
    // True when the requested value moves NOTHING — the case this module exists
    // to catch.
    noEffect: droppedSd === 0 && droppedNsd === 0,
    dollarsSaved: null,
  };

  // Millage is quoted in mills — dollars per $1,000 of taxable value.
  if (millage && (n(millage.school) || n(millage.nonSchool))) {
    out.dollarsSaved =
      Math.round(
        ((droppedSd * n(millage.school)) + (droppedNsd * n(millage.nonSchool))) / 1000
      );
  }

  return out;
}

/**
 * The break-even just value: the highest requested value that still produces a
 * dollar of savings on ANY levy.
 *
 * Savings begin the moment the requested value drops below EITHER assessed
 * value, so the threshold is the higher of the two. For a non-homesteaded parcel
 * av_sd equals jv, which makes the threshold jv itself — any reduction at all
 * saves money. That falls out of the data rather than being special-cased.
 *
 * Returns null when the parcel already has zero taxable value (fully exempt),
 * because there is nothing to save regardless.
 */
export function breakEvenJv(parcel) {
  const jv = n(parcel.jv);
  const avSd = n(parcel.av_sd);
  const avNsd = n(parcel.av_nsd);
  const tvSd = n(parcel.tv_sd);
  const tvNsd = n(parcel.tv_nsd);

  if (!jv) return null;
  if (tvSd === 0 && tvNsd === 0) return null; // fully exempt — nothing to win

  const threshold = Math.max(avSd, avNsd);
  // Cannot be above just value: you cannot "reduce" to more than the current
  // assessment and expect a saving.
  return Math.min(threshold, jv);
}

/**
 * Typical Florida total millage, used only when the real rate for the parcel's
 * taxing district is not loaded yet.
 *
 * REPLACE THIS with the DOR millage table keyed on TAX_AUTH_CD. Rates range
 * roughly 13-23 mills across Florida, so a default can be wrong by ±30% and the
 * dollar figures below inherit that error. It is good enough to decide whether an
 * appeal is worth filing; it is NOT good enough to quote a savings figure to a
 * customer as though it were computed for them.
 */
/**
 * LAST-RESORT millage, used only when the county's real rate is unavailable.
 *
 * lib/dor/millage.js now carries the actual DOR-published rate for all 67
 * counties, and lib/dor/parcels.js passes it in. This constant survives for
 * callers that have no county at all — and any dollar figure produced from it
 * must be presented as a rough scale, never as a computed saving.
 */
export const DEFAULT_MILLAGE = { school: 6.5, nonSchool: 11.5 };

/**
 * Decide whether this parcel is worth appealing at all.
 *
 * ============================================================================
 * THE TEST IS DOLLARS, NOT PERCENTAGES
 * ============================================================================
 * An earlier version refused whenever the required cut exceeded some multiple of
 * a typical reduction. That is the wrong question, and it is wrong in the
 * direction that costs filings.
 *
 * A 24% required cut is hopeless on a $600k house and perfectly worthwhile on a
 * $2M one, because what the owner cares about is the cheque, not the percentage.
 * Same ratio, opposite answer. So the gate now asks the only question that
 * matters:
 *
 *     IF THIS GOES WELL, DOES THE OWNER COME OUT AHEAD?
 *
 * We refuse in exactly two cases:
 *   1. Even a strong outcome moves no tax at all — the cap absorbs everything.
 *   2. Even a strong outcome saves less than the appeal costs — they would pay
 *      us to win and still be down money.
 *
 * Everything else proceeds. A long shot with real money behind it is the owner's
 * call to make, not ours, and they get the arithmetic to make it with.
 *
 * ============================================================================
 * WHY THE REFUSAL IS NOW CONDITIONAL — COST TO CURE (added 7 Aug 2026)
 * ============================================================================
 * Both refusals above ran on `optimisticReductionPct`, which is a COMPARABLE
 * SALES assumption. Cost to cure was nowhere in the arithmetic, and this
 * function is called from /api/lookup — step 2 of the funnel — while the owner
 * does not describe their property's condition until step 3.
 *
 * So the gate decided whether an appeal could help BEFORE anyone asked about the
 * roof. Measured against the 2026 roll, all 8,409,573 residential parcels:
 *
 *   required cut   parcels     what actually happens
 *   25-30%         334,813     refused — a MODEST cure clears it
 *   30-35%         353,684     refused — a SUBSTANTIAL cure clears it
 *
 * 688,497 Florida homes, 8.2% of the state, told "an appeal would not lower your
 * tax bill this year" — stated as fact — when a documented condition case would
 * have carried them. For a house with a dead A/C and a 22-year-old roof that
 * statement is simply false.
 *
 * THE FIX IS NOT TO LOOSEN THE GATE. The guarantee that we never take a fee from
 * someone who cannot benefit is the entire brand, and trading it for volume would
 * be the same mistake as the invented 82% approval rate. Instead the refusal
 * became CONDITIONAL and RE-CHECKABLE:
 *
 *   PASS 1 (lookup, cureDollars = 0)
 *     If comps alone cannot clear the cap, but the required cut is within
 *     MAX_CURE_REACH_PCT of what comps reach, return `rescuable: true` rather
 *     than a flat refusal. The UI must then route the owner to the condition
 *     step instead of dead-ending them.
 *
 *   PASS 2 (after the issues step, cureDollars = totalCostToCure(...).asked)
 *     Same function, same arithmetic, with the cure subtracted from the target
 *     just value. If the cure does not materialise, it refuses exactly as before.
 *
 * Nobody buys who cannot benefit. The only thing that changed is that we now ask
 * the question before answering it.
 *
 * `rescuable` is never returned when cureDollars > 0 — by then we HAVE asked,
 * and a second invitation would be a loop.
 *
 * That division also sits better legally. Handing the owner the numbers and
 * letting them decide keeps us a preparer rather than someone issuing an opinion
 * on whether their property is worth appealing (counsel memo, questions 3 and 5).
 *
 * @param {object} parcel  NAL row
 * @param {object} [opts]
 * @param {number} [opts.plausibleReductionPct=0.15]  a typical, well-supported outcome
 * @param {number} [opts.optimisticReductionPct=0.25]  a strong outcome — the gate runs on THIS
 * @param {number} [opts.serviceFee=104]  our fee plus the county's filing fee
 * @param {{school:number, nonSchool:number}} [opts.millage]
 * @param {number} [opts.cureDollars=0]  documented cost to cure, in dollars, from
 *   lib/costToCure.js. Zero on the lookup pass. Subtracted from the requested just
 *   value in every scenario, because a cure argument reduces value on top of
 *   whatever comparable sales support — the two are additive, not alternatives.
 */
export function qualify(parcel, opts = {}) {
  const {
    plausibleReductionPct = 0.15,
    optimisticReductionPct = 0.25,
    serviceFee = 104,
    millage = DEFAULT_MILLAGE,
    cureDollars = 0,
  } = opts;

  const cure = n(cureDollars);

  const jv = n(parcel.jv);
  const useCode = Number(parcel.dor_uc);

  if (!jv) {
    return { eligible: false, reason: 'no_just_value', message: 'No just value on the current roll for this parcel.' };
  }
  if (Number.isFinite(useCode) && !RESIDENTIAL_USE_CODES.has(useCode)) {
    return { eligible: false, reason: 'not_residential', message: 'This is not a residential property. We only handle residential appeals.' };
  }

  const breakEven = breakEvenJv(parcel);
  if (breakEven === null) {
    return { eligible: false, reason: 'no_taxable_value', message: 'This parcel has no taxable value, so an appeal cannot reduce the tax owed.' };
  }

  const differential = jv - breakEven;
  const requiredCutPct = differential / jv;

  // The assessment cap benefit already in hand. Stating this is genuinely useful
  // even — especially — when we are declining the sale.
  const capBenefit = Math.max(0, jv - Math.min(n(parcel.av_sd) || jv, n(parcel.av_nsd) || jv));

  // Three scenarios, so the owner sees a range rather than one number dressed up
  // as a prediction. The gate runs on the optimistic one; the others are shown.
  // The reduction each scenario assumes. Kept here beside the arithmetic rather
  // than restated in the UI, so a change to plausibleReductionPct or
  // optimisticReductionPct cannot leave a screen labelling a 15% figure as 20%.
  const CONSERVATIVE_PCT = 0.10;
  const scenarioPcts = {
    conservative: CONSERVATIVE_PCT,
    likely: plausibleReductionPct,
    optimistic: optimisticReductionPct,
  };

  /**
   * The just value each scenario asks for.
   *
   * Comps take a percentage off; a documented cure takes DOLLARS off, on top.
   * Floored at zero — a cure larger than the property's value is arithmetic we
   * should never send to taxEffect, and it means the owner mis-entered something
   * rather than that the house is worthless.
   */
  const target = (pct) => Math.max(0, Math.round(jv * (1 - pct)) - cure);

  const scenarios = {
    conservative: taxEffect(parcel, target(CONSERVATIVE_PCT), millage),
    likely: taxEffect(parcel, target(plausibleReductionPct), millage),
    optimistic: taxEffect(parcel, target(optimisticReductionPct), millage),
  };
  const atPlausible = scenarios.likely;
  const bestCase = scenarios.optimistic.dollarsSaved ?? 0;

  const result = {
    jv,
    breakEven,
    differential,
    requiredCutPct,
    capBenefit,
    scenarios,
    scenarioPcts,
    bestCaseSaving: bestCase,
    serviceFee,
    // FACT. Arithmetic from the county's published roll, verifiable against the
    // owner's TRIM notice.
    breakEvenStatement:
      differential > 0
        ? `Your assessed value is capped $${differential.toLocaleString()} below market value. A petition must reduce the market value below $${breakEven.toLocaleString()} — a ${(requiredCutPct * 100).toFixed(1)}% reduction — before your tax bill changes at all.`
        : 'Your property is assessed at full market value, so any reduction lowers your tax bill directly.',
    atPlausibleReduction: atPlausible,
  };

  /**
   * ==========================================================================
   * NO CAP IN THE WAY — BUT "REACHES THE BILL" IS NOT "WORTH BUYING".
   * ==========================================================================
   * This branch returned `eligible: true` unconditionally until 23 Aug 2026,
   * and because it returns BEFORE the condition question and before both
   * refusals, it was the one verdict in this function that never met
   * `saving_below_cost`. There was no floor: a parcel whose best case saved $60
   * a year was told "an appeal can produce savings" at high confidence and shown
   * a $104+ checkout. The sentence was true — with no differential every dollar
   * of reduction does reach the bill — and it answered a question the homeowner
   * had not asked.
   *
   * IT WAS NOT A RARE PATH. Of the 17 visitors ever told they could be helped in
   * the first three days of funnel data, 15 came out of this line — 88% of the
   * sellable population, through the only gate with no break-even test.
   *
   * The fix is to stop returning early and let a thin result fall through to the
   * same treatment every other parcel gets. Note what that fall-through does:
   * with differential <= 0, requiredCutPct is <= 0, so `requiredCutPct <=
   * cureReachPct` holds and the condition question fires. Someone whose comps
   * case is worth less than the fee gets invited to document a failed roof
   * instead of being sold a filing — which is exactly what that branch is for,
   * and it could never reach these people before.
   *
   * `breakEvenStatement` already reads correctly for this group ("assessed at
   * full market value, so any reduction lowers your tax bill directly"), and
   * `cap_absorbs_everything` cannot fire because a reduction always has effect
   * when nothing is capped. So the fall-through needs no special-casing.
   */
  if (differential <= 0 && bestCase >= serviceFee) {
    /**
     * THIN_MARGIN_MULTIPLE is a judgement, not arithmetic, and is written here
     * rather than buried so it can be argued with.
     *
     * `bestCase` is the OPTIMISTIC scenario — a strong result, not a promised
     * one. At less than twice the cost of filing, a customer is paying for a
     * projection whose good outcome barely clears its own price, and they should
     * see that before they buy rather than after. Above it, the margin is wide
     * enough that the estimate missing does not make the purchase a mistake.
     *
     * Marking these `marginal` rather than `high` is what makes them visible:
     * pages/check.js scopes the cost-to-cure invitation to `disclosure`, which
     * only exists on marginal and long_shot. Before this, the thinnest results in
     * the largest group were the ones offered the least help.
     */
    const THIN_MARGIN_MULTIPLE = 2;
    const thin = bestCase < serviceFee * THIN_MARGIN_MULTIPLE;

    return {
      ...result,
      eligible: true,
      confidence: thin ? 'marginal' : 'high',
      reason: 'no_cap_differential',
      disclosure: thin
        ? `Your property is assessed at full market value, so any reduction lowers your bill directly. But the saving is modest: a strong ${(optimisticReductionPct * 100).toFixed(0)}% reduction would be worth about $${bestCase.toLocaleString()} a year against the $${serviceFee} it costs to file. That is an estimate, not a promise — if the reduction falls short, your bill will not change and the filing fee is not refundable.`
        : null,
    };
  }

  // ── THE CONDITION QUESTION, ASKED BEFORE EITHER REFUSAL ──────────────────
  //
  // Both refusals below run on comparable sales alone. Before either one fires,
  // check whether a documented cost to cure could plausibly carry this parcel —
  // and if it could, ASK rather than refuse.
  //
  // MAX_CURE_REACH_PCT is how far beyond a strong comps result a cure case can
  // realistically extend, as a share of just value. Ten points is deliberately
  // conservative: on a $600,000 home that is $60,000 of documented, sourced cure
  // — a roof, an HVAC system and a kitchen — which is a lot of defect but well
  // within what lib/costToCure.js prices from published cost data. Raising this
  // number widens who gets invited to the condition step; it does NOT widen who
  // can buy, because pass 2 re-runs the same arithmetic against the cure they
  // actually document.
  const MAX_CURE_REACH_PCT = 0.10;
  const cureReachPct = optimisticReductionPct + MAX_CURE_REACH_PCT;

  const comparablesAloneFail = scenarios.optimistic.noEffect || bestCase < serviceFee;

  if (cure === 0 && comparablesAloneFail && requiredCutPct <= cureReachPct) {
    const shortfall = scenarios.optimistic.noEffect
      ? `A strong ${(optimisticReductionPct * 100).toFixed(0)}% reduction on comparable sales alone would still change nothing, because your assessed value is capped below even that.`
      : `A strong ${(optimisticReductionPct * 100).toFixed(0)}% reduction on comparable sales alone would save about $${bestCase.toLocaleString()} a year, less than the $${serviceFee} it costs to file.`;

    return {
      ...result,
      eligible: false,
      // NOT a refusal. The UI must route this to the condition step, not to a
      // dead end. See the header note dated 7 Aug 2026.
      rescuable: true,
      reason: 'needs_condition_case',
      // SPLIT DELIBERATELY. `message` is the arithmetic — verifiable against the
      // owner's TRIM notice, and true whatever they tell us next. `conditionPrompt`
      // is the question, and the UI emphasises it because it is the one sentence on
      // this screen that can change the outcome. Keeping them apart means a caller
      // cannot render the question in the voice of a finding.
      message:
        `On comparable sales alone, an appeal would not lower your tax bill enough to be worth filing. ` +
        `${result.breakEvenStatement} ${shortfall}`,
      conditionPrompt:
        `That assumes your home is in average condition for its neighbourhood. If it is not — a roof at the ` +
        `end of its life, a failed air conditioner, an original kitchen, active damage — those reduce what ` +
        `your property is worth on top of what comparable sales show, and they can change this answer. ` +
        `Tell us what is wrong with it and we will run the numbers again before you pay anything.`,
    };
  }

  // ── REFUSAL 1: the cap absorbs everything ────────────────────────────────
  // Even a strong outcome moves no tax at all. There is no version of this where
  // the owner benefits, so there is no version where we should be paid.
  if (scenarios.optimistic.noEffect) {
    return {
      ...result,
      eligible: false,
      reason: 'cap_absorbs_everything',
      message: `An appeal would not lower your tax bill this year. ${result.breakEvenStatement} Even a ${(optimisticReductionPct * 100).toFixed(0)}% reduction — a strong result — would change nothing, because your assessed value is already capped below that. You are paying tax on $${differential.toLocaleString()} less than your property is worth.`,
    };
  }

  // ── REFUSAL 2: it cannot pay for itself ──────────────────────────────────
  // Some tax moves, but not enough to cover what we charge — so winning still
  // leaves them out of pocket. This is the case a percentage threshold misses
  // entirely: the ratio can look reachable while the cheque is $57.
  if (bestCase < serviceFee) {
    return {
      ...result,
      eligible: false,
      reason: 'saving_below_cost',
      message: `We do not think this appeal is worth filing. ${result.breakEvenStatement} Even a strong ${(optimisticReductionPct * 100).toFixed(0)}% reduction would save you about $${bestCase.toLocaleString()} a year, which is less than the $${serviceFee} it costs to file. We would rather tell you that than take the fee.`,
    };
  }

  // ── PROCEED, with the arithmetic disclosed ───────────────────────────────
  // From here the odds are the owner's to weigh. `confidence` describes how hard
  // the required cut is; it does NOT gate the sale.
  /**
   * ========================================================================
   * RATED ON WHAT COMPARABLE SALES STILL HAVE TO CARRY, NOT ON THE GROSS GAP.
   * ========================================================================
   * `requiredCutPct` is the whole distance to the cap and a documented cure does
   * not change it — the cure takes DOLLARS off the ask instead. So rating
   * confidence on it described the position an owner would be in if they had
   * answered no condition questions at all.
   *
   * Seen in the browser on 23 Aug, on one screen, contradicting itself: a parcel
   * needing 16.3% with $71,300 of documented repairs read "comparable sales have
   * to carry the remaining 7.0%" — comfortably inside a plausible result — and
   * directly underneath, "that is an ambitious reduction", plus an invitation to
   * go back and document more. Both sentences came from this function.
   *
   * The correction is the same exact arithmetic the delta block uses: qualify's
   * target is `jv * (1 - pct) - cure`, so a cure of C dollars reduces the
   * percentage comps must carry by exactly C / jv. No modelling, no estimate.
   *
   * ON PASS 1 THE CURE IS ZERO, so compsMustCarryPct === requiredCutPct and every
   * caller behaves precisely as before. /check is untouched. Only the pass that
   * runs AFTER the owner has answered can differ, which is the only pass where
   * the old rating was wrong.
   *
   * This does NOT gate the sale — that is `scenarios.optimistic.noEffect ||
   * bestCase < serviceFee` above, which already includes the cure. Nothing in
   * pages/ or lib/ reads `confidence` to decide whether an order may proceed.
   */
  const cureSharePct = jv > 0 ? cure / jv : 0;
  const compsMustCarryPct = Math.max(0, requiredCutPct - cureSharePct);

  const confidence =
    compsMustCarryPct <= plausibleReductionPct ? 'good'
      : compsMustCarryPct <= optimisticReductionPct ? 'marginal'
        : 'long_shot';

  return {
    ...result,
    eligible: true,
    confidence,
    reason: 'clearable',
    // Shown verbatim before checkout on anything not rated 'good'. The owner
    // should never be surprised by the shape of what they bought.
    disclosure:
      confidence === 'good'
        ? null
        : cure > 0
          // The owner HAS documented repairs, so the sentence has to be about the
          // part those repairs do not cover. Quoting the gross 16.3% here while the
          // screen above says comps need 7.0% is the contradiction this branch was
          // added to end.
          ? `Your assessment is capped $${differential.toLocaleString()} below market value, so a petition has to reduce it by ${(requiredCutPct * 100).toFixed(1)}% in total before your bill changes. Your documented repairs argue for $${Math.round(cure).toLocaleString()} of that, leaving comparable sales to carry ${(compsMustCarryPct * 100).toFixed(1)}% — an ambitious reduction to ask of them. If it succeeds, we estimate you would save around $${bestCase.toLocaleString()} a year. If it falls short, your bill will not change and the filing fee is not refundable.`
          : `Your assessment is capped $${differential.toLocaleString()} below market value, so a petition has to reduce the market value by more than ${(requiredCutPct * 100).toFixed(1)}% before your bill changes at all. That is an ambitious reduction. If it succeeds, we estimate you would save around $${bestCase.toLocaleString()} a year. If it falls short of ${(requiredCutPct * 100).toFixed(1)}%, your bill will not change and the filing fee is not refundable.`,
  };
}

export default { qualify, taxEffect, breakEvenJv, RESIDENTIAL_USE_CODES };
