/**
 * ============================================================================
 * TEXAS: ADDRESS IN, A VERDICT OUT — the /check counterpart of the FL path
 * ============================================================================
 *
 * lib/dor/parcels.js lookupAndQualify is the Florida shape this mirrors, and
 * the mirroring is deliberate: pages/check.js already renders that shape, so a
 * Texas answer that matches it needs no new branch in the UI and cannot drift
 * into a second, subtly different contract.
 *
 * WHY COMPS ARE NOT RUN HERE
 *
 * The § 41.43(b)(3) grid is the Texas argument, and it is expensive — up to 600
 * candidate rows per parcel across a widening ladder. Florida's check does not
 * price its comps either; /api/comps does that separately, and the packet does
 * it at document time in lib/tx/protest.js.
 *
 * qualify() answers the question /check actually asks — *can a protest lower
 * this bill at all* — from the parcel alone, because the cap gate is arithmetic
 * on the district's own published cap loss. That is a FACT, not an estimate,
 * and it is the one that refuses the people who cannot be helped.
 *
 * WHY THE SERVICE FEE IS 89 AND NOT 139
 *
 * Florida adds the county's VAB filing fee, which is $15-$50 and real money the
 * homeowner pays. Texas ARB protests are free — § 41.44 sets no fee — so there
 * is nothing to add. Getting this wrong would refuse Texans whose saving falls
 * between $89 and $139 for a cost they will never incur.
 */

import { findParcel, TX_LOOKUP, ROLL_YEAR } from './parcels';
import { qualify } from './qualify';
import { findComps } from './comps';
import { buildProtest } from './protest';
import { txCostToCure } from './costToCure';
import { LOADED_CADS } from './coverage';

const TX_SERVICE_FEE = 89;

/**
 * ============================================================================
 * ONE FUNNEL VOCABULARY, TWO STATES.
 * ============================================================================
 * lib/tx/qualify.js speaks Texas — `capped_beyond_reach`, `saving_below_fee`,
 * `uncapped`. lib/checkOutcomes.js is a CLOSED list and none of those are in
 * it, so recording them raw would send every Texas verdict through
 * `OUTCOMES[outcome]?.group || 'no_answer'` and colour the whole state grey on
 * /admin — the defect the outcome catalogue calls number 5.
 *
 * Adding six Texas-only outcomes would work and is the wrong shape: the
 * vocabulary describes what happened to a CUSTOMER, not which module answered.
 * "The cap absorbs everything" is the same event in both states — Save Our
 * Homes in Florida, § 23.23 in Texas — and splitting it would make the refusal
 * rate incomparable across states, which is the number the table exists for.
 *
 * So Texas maps onto the existing list. The customer-facing message stays the
 * Texas one; only the funnel label is shared.
 *
 * An unmapped reason throws rather than defaulting. A silent default here is
 * exactly how a new refusal branch would go uncounted, and this is the one
 * place that can still catch it — scripts/verify-check-events.mjs scans the
 * FLORIDA modules for reason literals, not this one.
 */
export const TX_REASON_TO_OUTCOME = Object.freeze({
  no_value_on_roll: 'no_just_value',
  no_taxable_value: 'no_taxable_value',
  capped_beyond_reach: 'cap_absorbs_everything',
  saving_below_fee: 'saving_below_cost',
  uncapped: 'no_cap_differential',
  capped_but_reachable: 'clearable',
  /**
   * The cap says a protest COULD move this bill; the comparables say we have
   * nothing to argue with. Added 1 Oct 2026 with the step-1 comp pass.
   *
   * It maps to `needs_condition_case` rather than a refusal because that is
   * exactly what it is: the § 41.43(b)(3) equity ground is empty, and the
   * condition questions in the next step can still build a § 41.41(a)(1)
   * market-value case on the same parcel. Counting it as a refusal would
   * record a no we have not actually reached.
   */
  no_evidence: 'needs_condition_case',
});

export function txOutcomeFor(reason) {
  const mapped = TX_REASON_TO_OUTCOME[reason];
  if (!mapped) throw new Error(`txOutcomeFor: unmapped Texas reason "${reason}" — add it to TX_REASON_TO_OUTCOME and to lib/checkOutcomes.js if it is genuinely a new event`);
  return mapped;
}

/** Roll row -> the shape pages/check.js already knows how to render. */
function shapeParcel(row) {
  return {
    parcelId: row.account_number,
    cadId: row.cad_id,
    county: LOADED_CADS[row.cad_id] || null,
    rollYear: row.tax_year,
    address: [row.situs_street, row.situs_city, 'TX', row.situs_zip].filter(Boolean).join(', '),
    situs: {
      street: row.situs_street || '',
      city: row.situs_city || '',
      state: 'TX',
      zip: (row.situs_zip || '').toString().slice(0, 5),
    },
    // Tax Code vocabulary, not PACS's. market_value is what a protest moves;
    // appraised_value is the capped figure the bill is actually levied on. The
    // schema header records how mapping these by name inverted the cap gate.
    marketValue: row.market_value,
    appraisedValue: row.appraised_value,
    livingArea: row.living_area,
    yearBuilt: row.year_built,
    landValue: row.land_value,
    neighborhoodCode: row.neighborhood_code,
    homesteaded: row.has_homestead === true || row.has_homestead === 'true',
  };
}

/**
 * @param {object} args
 * @param {string} args.street         as typed
 * @param {number} args.cadId          REQUIRED — resolved from the county, see
 *                                     pages/api/check.js. Without a district we
 *                                     cannot tell "absent" from "uncovered".
 * @param {string} [args.zip]          a hint that narrows; never a gate
 * @param {string[]} [args.issues]     owner-reported defects, priced server-side
 */
export async function txLookupAndQualify({ street, cadId, zip = null, taxYear = ROLL_YEAR }, opts = {}) {
  const found = await findParcel({ street, cadId, zip, taxYear });

  // Every non-match carries its own reason. The vocabulary is shared with
  // Florida on purpose — lib/checkOutcomes.js is one closed list for both, and
  // scripts/verify-check-events.mjs fails the build on anything outside it.
  if (found.status !== TX_LOOKUP.MATCHED) {
    if (found.status === TX_LOOKUP.AMBIGUOUS) {
      return { found: false, reason: 'ambiguous', candidates: found.candidates, county: found.county };
    }
    if (found.status === TX_LOOKUP.NOT_COVERED) {
      return { found: false, reason: 'not_covered', county: found.county, cadId };
    }
    if (found.status === TX_LOOKUP.LOOKUP_FAILED) {
      return {
        found: false,
        reason: 'lookup_failed',
        county: found.county,
        message: 'We could not reach the appraisal roll just now. This is our problem, not a '
          + 'statement about your property — please try again in a moment.',
      };
    }
    const missMessage = 'We do not have a record for this address on the current appraisal roll.';
    if (found.status === TX_LOOKUP.NO_PARCEL_NEAR_MISS) {
      return { found: false, reason: 'no_parcel_near_miss', nearMisses: found.nearMisses,
        county: found.county, candidates: found.candidates, message: missMessage };
    }
    return { found: false, reason: 'no_parcel', nearMisses: 0, county: found.county, message: missMessage };
  }

  /**
   * The UNTOUCHED roll row goes to qualify(), not the shaped object. qualify
   * reads snake_case and n(undefined) is 0, so a camelCase parcel returns
   * no_value_on_roll — "the appraisal district has no current value on file" —
   * for a house whose value is in hand. See lib/tx/parcels.js `row`.
   */
  const row = found.row;

  let cureDollars = 0;
  if (Array.isArray(opts.issues) && opts.issues.length) {
    try {
      cureDollars = txCostToCure(opts.issues, row, opts.costOverrides || {}).total || 0;
    } catch (e) {
      // A pricing failure must never block a lookup. Zero cure is conservative:
      // it can only make the gate stricter, never looser.
      console.error('[tx] cost to cure failed, treating as zero:', e.message);
      cureDollars = 0;
    }
  }

  /**
   * `hardRefuseOnSaving: false` — WE ARE DOCUMENT PREPARATION, NOT ADVISERS.
   *
   * qualify()'s own header says it: "A long shot with real money behind it is
   * the owner's call to make, not ours; our job is to be honest about the odds,
   * not to decide for them." Its default is nonetheless a hard refuse, and the
   * parameter doc says callers that gate money should turn it off and treat
   * `saving_below_fee` as a WARNING rather than a door closed. This caller
   * never did, so /api/check has been returning eligible:false on it.
   *
   * Two reasons that has to change, and the second is new as of 1 Oct:
   *
   *   1. Refusing to prepare a document a property owner is entitled to file is
   *      not a document-preparation service's call. Every Texas owner may
   *      protest under s 41.41 whatever we think of their odds, and declining
   *      on the strength of our own estimate edges toward an opinion of value
   *      (Occupations Code s 1103.003) rather than away from one.
   *
   *   2. REDUCTION_BY_CAD was populated the same day with measured rates that
   *      are LOWER than the 6.3% placeholder in every one of the five districts
   *      measured. Harris went from 6.3% to 2.7%, which moves the fee threshold
   *      from roughly a $64k house to roughly a $150k house. Leaving the hard
   *      refuse in place would have closed that door on a much larger slice of
   *      owners on the same day, silently, as a side effect of a more accurate
   *      number. The estimate also remains an UPPER bound -- tx_parcel_entities
   *      is empty -- so it refuses on a figure already known to be generous.
   *
   * The warning still shows. The customer decides.
   */
  const verdict = qualify(row, {
    serviceFee: TX_SERVICE_FEE,
    cureDollars,
    hardRefuseOnSaving: false,
  });

  /**
   * ==========================================================================
   * THE EVIDENCE PASS — opt-in, because it is what makes the quote this house's
   * ==========================================================================
   * Added 1 Oct 2026. qualify() above answers "can a protest move this bill",
   * which is cap arithmetic and needs no comparables. It cannot answer "and is
   * there anything to argue", which needs the ladder.
   *
   * WHY IT IS SAFE TO RUN AT STEP 1. The objection was cost. Measured against
   * production on the same address, three runs each: /api/check 0.87 / 0.45 /
   * 0.42s, /api/generate-50132 — which already runs this exact ladder — 0.76 /
   * 0.47 / 0.61s. Indistinguishable. The neighbourhood index serves the comp
   * lookup in about 39ms. There was never a performance argument.
   *
   * WHY IT MATTERS MORE THAN PRECISION. The district rate is wrong in BOTH
   * directions and which one depends on the house. 108 Brookdale Dr asks 18.2%
   * against a Denton median of 3.4%, so the generic figure understated it by
   * 2.9x. 1457 Forestglen Dr has no case at all, and the generic figure quoted
   * that owner $441 a year for a petition whose opinion-of-value box we would
   * have left blank. Running the ladder here fixes both, and it fixes the
   * second one by saying so rather than by quoting a smaller number.
   *
   * `withComps` is opt-in so every existing caller keeps its current cost and
   * its current answer. /api/check sets it; nothing else does yet.
   *
   * A FAILURE HERE MUST NOT BREAK A LOOKUP, same rule as cureDollars above. On
   * a throw the verdict stands with its district estimate and `evidence` is
   * null, which the UI reads as "not asked" rather than as "no case".
   */
  let evidence = null;
  let estimatedSaving = verdict.estimatedSaving ?? null;
  let estimateBasis = estimatedSaving === null ? 'none' : 'district';

  if (opts.withComps === true) {
    try {
      const comps = await findComps(row, { rollYear: taxYear });
      const packet = buildProtest({
        parcel: row, comps, taxYear,
        issues: Array.isArray(opts.issues) ? opts.issues : [],
        costOverrides: opts.costOverrides || {},
      });

      const ask = Number(packet.reductionSought) || 0;
      if (ask > 0) {
        evidence = {
          hasCase: true,
          requestedValue: packet.requestedValue,
          reductionSought: ask,
          reductionPct: Number(row.market_value) > 0 ? ask / Number(row.market_value) : null,
          compCount: packet.grid?.compCount ?? null,
          confidence: packet.verdict?.confidence || verdict.confidence || null,
          code: null,
        };
        // THE SAME FIELD generate-50132 returns, off the same packet. Neither
        // route computes it -- see the note on estimatedSaving in protest.js.
        estimatedSaving = packet.estimatedSaving;
        estimateBasis = 'parcel';
      } else {
        evidence = {
          hasCase: false,
          requestedValue: null,
          reductionSought: null,
          reductionPct: null,
          compCount: packet.grid?.compCount ?? null,
          confidence: null,
          // NOTHING_TO_ASK or NOT_OVER_APPRAISED, whichever the ladder raised.
          code: (packet.cautions || []).map((c) => c.code)
            .find((c) => c === 'not_over_appraised' || c === 'nothing_to_ask_for') || 'no_case',
        };
        // NO FALLBACK. The district median is measured over FILABLE cases, and
        // this parcel is by definition not one of them. Quoting it here would
        // hand an owner a statistic from a population they are not in, which is
        // the claim shape this whole pass exists to stop.
        estimatedSaving = null;
        estimateBasis = 'none';
      }
    } catch (e) {
      console.error('[tx] evidence pass failed, keeping the district estimate:', e.message);
    }
  }

  return {
    found: true,
    state: 'TX',
    county: found.county,
    cadId: found.cadId,
    // The shared funnel label. `reason` below stays the Texas one, because it
    // is what selects the customer-facing copy.
    outcome: txOutcomeFor(verdict.reason),
    parcel: shapeParcel(row),
    cure: cureDollars > 0
      ? { dollars: cureDollars, shareOfValue: row.market_value > 0 ? cureDollars / Number(row.market_value) : null }
      : null,
    ...verdict,

    // AFTER the spread, deliberately: when the evidence pass ran it supersedes
    // qualify()'s district-rate figure, and spreading `verdict` last would put
    // the generic number back on top of the measured one.
    evidence,
    estimatedSaving,
    estimateBasis,
    outcomeOverride: evidence && evidence.hasCase === false ? 'no_evidence' : null,
  };
}

export default { txLookupAndQualify };
