/**
 * ============================================================================
 * THE TEXAS FILING PACKET — roll row in, a signable protest out (or a refusal)
 * ============================================================================
 *
 * Written 7 Sept 2026 to the decisions in claude/TX_Model_Decided_2026-09-04.md.
 * Read that file before changing anything here; it is the decisions, so they are
 * not re-litigated in code review.
 *
 * WHAT WE MAIL, AND WHAT WE DO NOT
 *
 *   Form 50-132       the notice of protest. Owner-signed. The only instrument
 *                     required to file. §41.44(d) permits a plain letter, but
 *                     CADs push their own forms, so we use the state form.
 *   Evidence packet   the §41.43(b)(3) equity grid, computed from the district's
 *                     OWN certified roll. Page one carries the whole argument.
 *
 *   Form 50-283       NOT collected. Notarised affidavit, owner's decision if a
 *                     hearing is scheduled. Correspondence goes to them.
 *   HB 201 letter     DROPPED. Free discovery under §41.461, but the response
 *                     lands 14 days before a hearing we are not part of.
 *   Form 50-162       NOT filed. We are never the agent. Every licensing trigger
 *                     in Occupations Code ch. 1152 attaches to SIGNING.
 *
 * ── THE ARGUMENT THIS BUILDS ────────────────────────────────────────────────
 *
 * §41.43(b)(3): a protest on unequal appraisal "shall be determined in favor of
 * the protesting party unless the appraisal district establishes" that the
 * subject's appraised value "is equal to or less than the median appraised value
 * of a reasonable number of comparable properties appropriately adjusted."
 *
 * The burden is the district's. Our document's job is not to carry a burden — it
 * is to make the rebuttal expensive. And (b)(3) needs NO SALES DATA, which is the
 * only reason any of this is automatable in a non-disclosure state.
 *
 * ⚠️ NOTHING HERE HAS BEEN THROUGH TEXAS COUNSEL. The two places that most need
 * it are marked ⚠️ in the code below.
 */

import { qualify } from './qualify';
import { LOADED_CADS } from './coverage';
import { txCostToCure, conditionDiscountRisk, CONDITION_RISK, DOUBLE_COUNT_DISCLOSURE,
  sourceRegionMismatch } from './costToCure';

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Named refusals. No two causes may share a value — same rule as parcels.js. */
export const NOT_FILABLE = Object.freeze({
  NO_VALUE: 'no_value_on_roll',
  CAP_BEYOND_REACH: 'capped_beyond_reach',
  SAVING_BELOW_FEE: 'saving_below_fee',
  NO_COMPS: 'insufficient_comparables',
  NOT_UNEQUAL: 'not_over_appraised',
  CAP_ARTIFACT: 'cap_artifact_only',
  NOTHING_TO_ASK: 'nothing_to_ask_for',
});

/**
 * ⚠️ POLICY, NOT LAW. Confirm with Nathan before this ships.
 *
 * `basis: 'cap_artifact'` means the subject looks unequal ONLY on appraised
 * value — its market $/sqft is at or below the comp median, and the gap appears
 * because the COMPARABLES are capped and the subject is not (or less so).
 *
 * That is a real §41.43(b)(3) reading: the statute names appraised value and
 * says nothing about why a neighbour's is low. But the argument rests on other
 * owners' length of tenure rather than on the district appraising this house
 * unequally, and the district's rebuttal is one sentence long. evaluateSet()
 * already scores it `confidence: 'low'` for exactly this reason.
 *
 * We refuse it. Filing a case whose central premise collapses in one sentence
 * spends the owner's one protest per year and our name on it.
 */
export const REFUSE_ON_CAP_ARTIFACT = true;

/**
 * SECTION 5 IS LEFT BLANK FOR THE OWNER, DELIBERATELY.
 *
 * Every appearance option on the form commits the owner to something we cannot
 * supply. "On written affidavit only", "by telephone with written affidavit" and
 * "by videoconference with written affidavit" ALL require Form 50-283, notarised
 * — which the model decision says we do not collect. In person requires them to
 * show up, which we cannot promise on their behalf.
 *
 * Pre-ticking any of them would be us choosing a litigation posture for a person
 * we have gone to some trouble not to represent. So the form prints the options
 * with a plain-language note and the owner ticks one when they sign.
 *
 * The informal conference is different and IS requested: it costs the owner
 * nothing, it is where most residential protests actually resolve, and it is the
 * stage at which a mailed evidence packet does its work.
 */
export const REQUEST_INFORMAL_CONFERENCE = true;

/**
 * HOW EACH DISTRICT ACTUALLY RUNS ITS INFORMAL REVIEW.
 *
 * Printed in Section 5 so the owner knows what they are agreeing to when the
 * informal box is ticked for them. This is the most reassuring true thing we can
 * put in front of a homeowner who is worried about taking a morning off work —
 * and unlike a success rate, it is a fact about their district rather than a
 * claim about our results.
 *
 * Keyed by CAD, populated only where the district states it in its own words. An
 * unknown district prints nothing rather than a generalisation: informal
 * practice varies enormously (Harris runs iSettle, Tarrant an automated
 * valuation tool, El Paso email only) and guessing on a filed document is how
 * you tell a homeowner to expect a phone call that never comes.
 */
export const INFORMAL_CHANNEL = Object.freeze({
  // epcad.org/OnlineServices/ProtestPortal — "Cannot meet in person with an appraiser."
  71: 'In El Paso the informal review is handled entirely by email. The appraisal '
    + 'district’s own protest portal states that you cannot meet with an appraiser in person.',
});

/**
 * The §41.43(b)(3) test, in the words a panel member will understand.
 *
 * The Comptroller's own ARB Manual lists unequal appraisal as a ground and then
 * gives boards almost no methodological guidance on it — panel members are not
 * trained on (b)(3) mechanics. So the grid page has to teach the test while
 * making the argument. Per the research pass, this is probably the single
 * highest-leverage design decision available in the whole document.
 */
export const STATUTE_PLAIN_LANGUAGE =
  'Texas Tax Code § 41.43(b)(3) requires this protest to be determined in favor of the '
  + 'property owner unless the appraisal district establishes that the appraised value of '
  + 'this property is equal to or less than the median appraised value of a reasonable '
  + 'number of comparable properties, appropriately adjusted. The comparables below are '
  + 'drawn from the district’s own certified appraisal roll and grouped by the '
  + 'district’s own neighborhood code. The median is stated. The burden of establishing '
  + 'value is the district’s under § 41.43(a).';

/**
 * WHY THE OPINION OF VALUE IS THE LOWER OF TWO CALCULATIONS.
 *
 * Texas Disposal Systems Landfill v. Travis CAD, No. 22-0620 (Tex. 21 June 2024)
 * holds that market-value evidence IS admissible in an equal-and-uniform
 * proceeding — and that the owner gets "the benefit of the calculation that
 * results in the lowest appraisal value."
 *
 * So we run both grounds, which Box 1 preserves in a single tick, and Section 4
 * carries the lower indication. Never above what is already on the roll: a
 * protest cannot raise a value, and asking for a number above the current one is
 * a filing error rather than a conservative request.
 *
 * ⚠️ Counsel should confirm that a market-value opinion may be set from an
 * appraised-basis indication on the strength of TDS Landfill.
 */
export function opinionOfValue(parcel, comps) {
  const market = n(parcel.market_value);
  if (!market) return null;

  /**
   * TWO GROUNDS, RUN IN PARALLEL, AND THE LOWER IS CLAIMED.
   *
   * equity  § 41.43(b)(3) — the median APPRAISED value of comparables.
   * market  § 41.41(a)(1) — what the comparables indicate this house is worth,
   *         from the district's own market values.
   *
   * ── WHY THE COST TO CURE IS NOT SUBTRACTED HERE ─────────────────────────────
   *
   * It used to be: `indicatedMarket - cureDollars`, dollar for dollar. Nathan's
   * call, 7 Sept 2026, and it is the right one.
   *
   * Cost to cure is NOT value diminution. A $48,950 repair bundle may reduce
   * what a buyer pays by more (deferred-maintenance stigma) or by considerably
   * less (buyers discount partially, or the district already reflected it).
   * Asserting they are equal is a valuation judgment, not arithmetic — and
   * Occupations Code § 1103.003 defines an "appraisal" as exactly that: "an
   * opinion of value; or the act or process of developing an opinion of value."
   * Section 4 of Form 50-132 is headed *Property Owner's Opinion of Value*. The
   * prose on the page never asserted the equivalence; the subtraction did, and
   * the subtraction was the number the owner signed.
   *
   * The defects still go in the packet. They are EVIDENCE that this property
   * sits at or below the standard the comparables describe — which is an
   * argument for the value we ask, not a separate deduction from it. See
   * renderConditionExhibit in protestHtml.js.
   *
   * NOTE: qualify() still counts the cure when deciding whether a case clears
   * the fee. That is deliberate (Nathan, 7 Sept 2026) — the exhibit can still
   * win reduction at the board — but it means the quoted saving is more
   * optimistic than what Section 4 formally requests. Flagged in the counsel
   * brief; do not "fix" the two into agreement without asking.
   */
  const equity = n(comps.indicatedAppraised);
  const marketGround = n(comps.indicatedMarket);

  /**
   * THE FLOOR IS THE DISTRICT'S OWN LAND VALUE.
   *
   * Less load-bearing than it was — nothing now drives the ask below the bare
   * lot — but kept, because it is the district's own number rather than one of
   * ours, and it costs nothing to hold.
   */
  const floor = n(parcel.land_value);

  const candidates = [];
  if (equity > 0) candidates.push(equity);
  if (marketGround > 0) candidates.push(marketGround);
  if (market > 0) candidates.push(market);
  if (!candidates.length) return null;

  return Math.max(Math.min(...candidates), floor > 0 ? floor : 1);
}

/**
 * Assemble the packet, or say why we will not file.
 *
 * `parcel` is the UNTOUCHED roll row — snake_case — not the shaped object from
 * findParcel().parcel. qualify() and comps read the roll's own column names and
 * silently return no_value_on_roll for a camelCase object. findParcel returns
 * the row as `.row` for exactly this call.
 */
export function buildProtest({ parcel, comps, owner = {}, taxYear, filingDate = null,
  verdict = null, issues = [], costOverrides = {} }) {
  if (!parcel || typeof parcel !== 'object') throw new Error('buildProtest: parcel row required');
  if (!comps || typeof comps !== 'object') throw new Error('buildProtest: comps result required');

  const year = taxYear || parcel.tax_year;
  const v = verdict || qualify(parcel);

  // 1. Can a protest move this owner's bill at all? The cap gate runs first
  //    because a perfect equity case on a fully capped parcel saves zero dollars.
  if (!v.eligible) {
    return { filable: false, reason: v.reason || NOT_FILABLE.NO_VALUE, message: v.message, verdict: v };
  }

  // 2. Did the roll give us a defensible comparison?
  if (!comps.sufficient) {
    return { filable: false, reason: comps.reason || NOT_FILABLE.NO_COMPS, message: comps.message, verdict: v };
  }

  // 3. Is the subject actually appraised above its comparables? `basis: 'none'`
  //    means it is not, on either measure — there is no unequal appraisal to
  //    argue and filing would ask the ARB to lower a value that is already at or
  //    below the median of its neighbours.
  if (comps.basis === 'none') {
    return {
      filable: false, reason: NOT_FILABLE.NOT_UNEQUAL, verdict: v,
      message: 'Compared with similar properties in the appraisal district’s own '
        + 'neighborhood, this property is not appraised high. An unequal-appraisal protest '
        + 'would be asking the board to lower a value that is already at or below what its '
        + 'neighbours are carrying, and we will not file one.',
    };
  }

  if (REFUSE_ON_CAP_ARTIFACT && comps.basis === 'cap_artifact') {
    return {
      filable: false, reason: NOT_FILABLE.CAP_ARTIFACT, verdict: v,
      message: 'The only argument available here rests on neighbouring owners holding '
        + 'assessment caps rather than on this property being appraised unfairly, and the '
        + 'appraisal district can answer that in one sentence. You get one protest a year '
        + 'and we would rather not spend it on this.',
    };
  }

  /**
   * Condition. Empty issues -> cure is zero -> identical behaviour to a packet
   * built before this existed, which is the property that lets it be added to a
   * pipeline already carrying orders.
   */
  const cure = Array.isArray(issues) && issues.length
    ? txCostToCure(issues, parcel, costOverrides)
    : { total: 0, priced: [], narrative: [], conservative: 0 };
  const cureDollars = n(cure.total);
  const conditionRisk = conditionDiscountRisk(parcel);

  const opinion = opinionOfValue(parcel, comps);
  const appraised = n(parcel.appraised_value);

  // 4. Nothing left to ask for. Guards the arithmetic rather than trusting it:
  //    a requested value at or above what is on the roll is a filing error.
  if (!opinion || opinion >= n(parcel.market_value)) {
    return {
      filable: false, reason: NOT_FILABLE.NOTHING_TO_ASK, verdict: v,
      message: 'Our comparison does not produce a value below the one already on the roll, '
        + 'so there is nothing to ask the board for.',
    };
  }

  const cadId = n(parcel.cad_id);

  return {
    filable: true,
    verdict: v,
    taxYear: year,
    cadId,
    county: LOADED_CADS[cadId] || null,
    filingDate,

    /**
     * Form 50-132, field by field. Section numbering follows revision 10-25/27
     * (comptroller.texas.gov/forms/50-132.pdf). Two checkboxes were added between
     * 1-23/24 and 10-25/27 — pin to the Comptroller PDF and re-scrape annually.
     */
    form50132: {
      revision: '50-132 • 10-25/27',
      taxYear: year,
      appraisalDistrict: LOADED_CADS[cadId] ? `${LOADED_CADS[cadId]} Central Appraisal District` : null,

      // §2 — property description
      accountNumber: parcel.account_number,
      // "EL PASO, TX 79907", not "EL PASO, 79907". The roll carries no state
      // column because a county roll does not need one; a filed document does.
      propertyAddress: [
        parcel.situs_street,
        [parcel.situs_city, ['TX', parcel.situs_zip].filter(Boolean).join(' ')]
          .filter(Boolean).join(', '),
      ].filter(Boolean).join(', '),

      // §3 — grounds. Box 1 and only box 1: "Incorrect appraised (market) value
      // and/or value is unequal compared with other properties." Market value and
      // unequal appraisal are ONE combined box, so a single tick preserves both
      // grounds and there is no way to accidentally waive the equity argument.
      grounds: ['incorrect_value_and_or_unequal'],

      // §4 — opinion of value. Optional on the form; we always state it, because
      // an unstated number invites the panel to supply its own.
      opinionOfValue: opinion,

      // §5 — see REQUEST_INFORMAL_CONFERENCE and the comment above it.
      requestInformalConference: REQUEST_INFORMAL_CONFERENCE,
      informalChannel: INFORMAL_CHANNEL[cadId] || null,
      appearanceElection: null,   // the owner ticks this, not us

      // §8 — certification. The owner signs. This is the whole licensing posture.
      signedBy: 'property_owner',
      ownerName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || null,
      ownerMailing: owner.mailing || null,
      ownerPhone: owner.phone || null,
      ownerEmail: owner.email || null,
    },

    /** Page one of the packet. Everything else is appendix. */
    grid: {
      statute: STATUTE_PLAIN_LANGUAGE,
      neighborhoodCode: parcel.neighborhood_code || null,
      level: comps.level,
      levelStrength: comps.levelStrength,
      confidence: comps.confidence,
      adjustments: comps.adjustments,
      disclosure: comps.disclosure,
      basis: comps.basis,

      subject: {
        accountNumber: parcel.account_number,
        address: parcel.situs_street,
        livingArea: n(parcel.living_area),
        yearBuilt: parcel.effective_year_built || parcel.year_built || null,
        appraisedValue: appraised,
        marketValue: n(parcel.market_value),
        appraisedPerSqft: comps.subjectAppraisedPerSqft,
        marketPerSqft: comps.subjectMarketPerSqft,
      },

      comps: (comps.comps || []).map((c) => ({
        accountNumber: c.account_number,
        livingArea: n(c.living_area),
        yearBuilt: c.effective_year_built || c.year_built || null,
        appraisedValue: n(c.appraised_value),
        marketValue: n(c.market_value),
        appraisedPerSqft: Math.round((n(c.appraised_value) / n(c.living_area)) * 100) / 100,
      })),

      compCount: (comps.comps || []).length,
      medianAppraisedPerSqft: comps.medianAppraisedPerSqft,
      medianMarketPerSqft: comps.medianMarketPerSqft,
      indicatedAppraised: comps.indicatedAppraised,
      indicatedMarket: comps.indicatedMarket,

      // Stated on the page rather than hidden, because a panel that spots it
      // first has been handed our weakness for free.
      cappedCompCount: comps.cappedCompCount,
      cappedCompShare: comps.cappedCompShare,
    },

    /**
     * Exhibit C — the condition case. Its own page, after the grid, so the grid
     * stays a pure § 41.43(b)(3) equity argument and the two grounds are not
     * blended into one number the board cannot take apart.
     * Null when the owner reported nothing, so nothing empty is printed.
     */
    conditionExhibit: (cure.priced.length || cure.narrative.length) ? {
      cureDollars,
      conservativeTotal: n(cure.conservative),
      priced: cure.priced,
      narrative: cure.narrative,
      // False for Texas since 7 Sept 2026, when the West South Central bases were
      // entered. Kept because it is not dead: Alabama is East South Central and
      // has no figures, so an AL packet would still flag. See CVV_REGIONS.
      regionMismatch: sourceRegionMismatch(cure.priced),
      conditionCode: parcel.condition_code || null,
      conditionRisk,
      // Printed only where the claim can actually be made. UNKNOWN prints
      // nothing -- we do not warn a homeowner about an inference we could not
      // draw. See BELOW_AVERAGE_CONDITION in lib/tx/costToCure.js.
      doubleCountDisclosure: conditionRisk === CONDITION_RISK.BELOW_AVERAGE
        ? DOUBLE_COUNT_DISCLOSURE : null,
    } : null,

    requestedValue: opinion,
    reductionSought: Math.max(0, n(parcel.market_value) - opinion),
    estimatedSaving: v.estimatedSaving ?? null,
    estimateIsUpperBound: v.estimateIsUpperBound === true,
  };
}

export default { buildProtest, opinionOfValue, NOT_FILABLE, STATUTE_PLAIN_LANGUAGE };
