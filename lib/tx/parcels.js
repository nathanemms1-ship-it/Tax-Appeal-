/**
 * ============================================================================
 * TEXAS PARCEL LOOKUP — address in, one parcel or a NAMED failure out
 * ============================================================================
 *
 * Written 7 Sept 2026 against the checklist in
 * claude/Lookup_Defect_Catalogue_For_Texas_2026-08-26.md, which exists because
 * Florida spent about four weeks finding these one at a time, and paid for them
 * in homeowners told "we do not have a record for this address on the current
 * tax roll" about houses sitting in our own database.
 *
 * Every one of those defects was the same disease: **a confident answer that was
 * wrong, and a counter that made it look normal.** Not a crash. So the design
 * rule here is that no two causes may share a return value.
 *
 * ── THE SIX RETURNS. Never fewer, never null for two different reasons. ──────
 *
 *   lookup_failed        we could not ASK. Database error or timeout.
 *   not_covered          we hold no roll for this district. Not their problem.
 *   no_parcel            we asked, the roll returned NOTHING.
 *   no_parcel_near_miss  the roll returned rows and our matcher rejected all.
 *   ambiguous            several parcels matched. The customer must pick.
 *   matched              exactly one.
 *
 * Defect 1 was `null` for a Supabase timeout AND `null` for a genuine miss, so
 * the funnel counted OUR OUTAGES as houses that do not exist. Defect 2 was zero
 * rows retrieved and forty rows rejected sharing one outcome — opposite causes,
 * opposite fixes, one grey bar holding 26% of a week's checks.
 *
 * ── COUNTY IS REQUIRED, AND THAT IS THE POINT ───────────────────────────────
 *
 * Risk A. Florida has one DOR roll covering all 67 counties, so a coverage gap
 * was theoretical. Texas has 254 districts and we hold six. **Partial coverage
 * is the normal state here for a long time.**
 *
 * If this function ran without knowing the district, a Harris County address
 * would return zero rows and be reported as `no_parcel` — "your house is not on
 * the tax roll" about a house on a roll we simply never downloaded. So the
 * caller must resolve the county FIRST and pass it. With no district we cannot
 * tell "absent" from "uncovered", and inventing an answer between them is the
 * exact failure this file is written to prevent. No district => lookup_failed.
 *
 * ── THE NORMALIZER IS FLORIDA'S, DELIBERATELY ───────────────────────────────
 *
 * lib/dor/addressMatch.js carries four weeks of fixes — `stripTrailingLocality`,
 * the suffix tables, `anchoredPattern`, and the comma-free handling that defect 3
 * cost us. Street addresses are not state-specific and a fresh Texas normalizer
 * would rediscover every one of those. Reuse is the whole lesson.
 */

import { getSupabaseAdmin } from '../../pages/api/supabase';
import {
  normalizeAddr, addressVariants, rowMatches, orIlike, stripTrailingLocality,
} from '../dor/addressMatch';
import { isCovered, LOADED_CADS } from './coverage';

/** The certified roll year currently loaded. */
export const ROLL_YEAR = 2026;

export const TX_LOOKUP = Object.freeze({
  MATCHED: 'matched',
  AMBIGUOUS: 'ambiguous',
  NO_PARCEL: 'no_parcel',
  NO_PARCEL_NEAR_MISS: 'no_parcel_near_miss',
  NOT_COVERED: 'not_covered',
  LOOKUP_FAILED: 'lookup_failed',
});

/**
 * Columns every caller needs. Selected by name so a schema drift 400s here.
 *
 * `effective_year_built` and `condition_code` are read by NOTHING in this file,
 * and both are load-bearing anyway: lib/tx/comps.js reads them off the SUBJECT.
 * ageYear() prefers the district's own effective year over year_built, and
 * similarity() applies a condition penalty that it skips whenever either side
 * is null.
 *
 * ⚠️ CORRECTION, same day, after querying the roll: BOTH COLUMNS ARE EMPTY.
 *
 * They are declared in scripts/tx/schema.sql and never written --
 * scripts/tx/push.mjs's COLS does not include either -- because PACS export
 * layout 8.0.34 has no condition field and no effective-year field anywhere in
 * it. 100% of El Paso's 228,190 A1 parcels carry no condition_code.
 *
 * So selecting them here is correct-when-populated and inert today, and the
 * skew described above is NOT closed by adding them:
 *
 *   - similarity() penalises a quality OR condition mismatch and skips the term
 *     when either side is null, so the CONDITION half is dead for every Texas
 *     comparison, still. The quality half is live: quality_class IS loaded, from
 *     Imprv_det_class_cd (EPCAD publishes RES CLASS 003-013 with +/- grades), so
 *     the comp engine is not blind to build quality -- only to condition.
 *   - the age asymmetry originally claimed here does not occur: comps selects
 *     effective_year_built too and finds it null as well, so ageYear() falls
 *     back to year_built on BOTH sides. Consistent, not asymmetric. That claim
 *     assumed the candidates had a field the subject lacked; neither has it.
 *
 * Filling them needs a source the export does not carry. See
 * claude/TX_Condition_Data_Is_Not_In_The_Export_2026-09-07.md.
 */
const COLS = [
  'cad_id', 'account_number', 'tax_year',
  'market_value', 'appraised_value', 'homestead_cap_loss', 'nhs_cap_loss',
  'land_value', 'improvement_value',
  'living_area', 'year_built', 'effective_year_built', 'condition_code', 'quality_class',
  'land_size_acres', 'land_size_sqft',
  'neighborhood_code', 'abs_subdv_cd', 'state_class_code',
  'situs_street', 'situs_city', 'situs_zip',
  'has_homestead', 'arb_protest_flag',
].join(',');

/** Shape a roll row for the funnel. Tax Code vocabulary, never PACS's. */
function toParcel(r) {
  return {
    cadId: r.cad_id,
    county: LOADED_CADS[r.cad_id] || null,
    accountNumber: r.account_number,
    taxYear: r.tax_year,

    // market_value is PACS appraised_val (UNCAPPED) — what a protest moves.
    // appraised_value is PACS assessed_val (CAPPED) — the § 41.43(b)(3) number.
    // The schema header records why mapping these by name would have inverted
    // the cap gate and sold protests to the people who cannot benefit.
    marketValue: r.market_value,
    appraisedValue: r.appraised_value,
    homesteadCapLoss: r.homestead_cap_loss ?? 0,
    nhsCapLoss: r.nhs_cap_loss ?? 0,

    landValue: r.land_value,
    improvementValue: r.improvement_value,
    livingArea: r.living_area == null ? null : Number(r.living_area),
    yearBuilt: r.year_built,
    qualityClass: r.quality_class,
    landSizeAcres: r.land_size_acres == null ? null : Number(r.land_size_acres),
    landSizeSqft: r.land_size_sqft == null ? null : Number(r.land_size_sqft),

    neighborhoodCode: r.neighborhood_code,
    absSubdvCd: r.abs_subdv_cd,
    stateClassCode: r.state_class_code,

    situsStreet: r.situs_street,
    situsCity: r.situs_city,
    situsZip: r.situs_zip,
    hasHomestead: r.has_homestead,
    arbProtestFlag: r.arb_protest_flag,
  };
}

/** A candidate for the "did you mean" list. Every one is a parcel we hold. */
function toCandidate(r) {
  return {
    cadId: r.cad_id,
    county: LOADED_CADS[r.cad_id] || null,
    accountNumber: r.account_number,
    street: r.situs_street,
    city: r.situs_city,
    zip: r.situs_zip,
    full: [r.situs_street, r.situs_city, 'TX', r.situs_zip].filter(Boolean).join(', '),
  };
}

/**
 * Find one Texas parcel.
 *
 * @param {object}  a
 * @param {string}  a.street   as typed. Commas optional — see defect 3.
 * @param {number}  a.cadId    REQUIRED. Comptroller 3-digit county code.
 * @param {string} [a.zip]     narrows only. Never excludes.
 * @param {number} [a.taxYear]
 */
export async function findParcel({ street, cadId, zip = null, taxYear = ROLL_YEAR }) {
  const cad = Number(cadId);

  // No district: we cannot tell "not on the roll" from "we never loaded it".
  // Saying either would be a confident wrong answer. See the header.
  if (!Number.isFinite(cad)) {
    return { status: TX_LOOKUP.LOOKUP_FAILED, reason: 'county_unresolved', nearMisses: 0 };
  }

  // Risk A. Decided BEFORE any query, so an uncovered district can never
  // produce zero rows and be reported as a missing house.
  if (!isCovered(cad)) {
    return { status: TX_LOOKUP.NOT_COVERED, cadId: cad, county: null, nearMisses: 0 };
  }

  const county = LOADED_CADS[cad];
  const typed = normalizeAddr(street);
  if (!typed || typed.length < 3) {
    return { status: TX_LOOKUP.LOOKUP_FAILED, reason: 'bad_input', cadId: cad, county, nearMisses: 0 };
  }

  const db = getSupabaseAdmin();
  if (!db) {
    // Defect 1: a failure to ASK is never an answer of NO.
    return { status: TX_LOOKUP.LOOKUP_FAILED, reason: 'no_database', cadId: cad, county, nearMisses: 0 };
  }

  const run = (variants, withZip) => {
    let sel = db.from('tx_parcels').select(COLS)
      .eq('cad_id', cad).eq('tax_year', taxYear)
      .or(orIlike('situs_street', variants.map((v) => `%${v}%`)))
      .limit(50);
    if (withZip && zip) sel = sel.eq('situs_zip', String(zip).trim().slice(0, 5));
    return sel;
  };

  /**
   * ZIP NARROWS, IT NEVER EXCLUDES — defect 4.
   *
   * The roll was once filtered on exact ZIP. A homeowner whose USPS ZIP differs
   * from the district's recorded one — common, and not their error — was told we
   * had no record of their property. Texas CADs cross ZIP boundaries the same
   * way, so the ZIP is tried and then dropped rather than the customer.
   */
  const retrieve = async (variants) => {
    let { data, error } = await run(variants, true);
    if (error) return { rows: null, error };
    if (zip && (!data || !data.length)) ({ data, error } = await run(variants, false));
    if (error) return { rows: null, error };
    return { rows: data || [], error: null };
  };

  /**
   * BOTH SPELLINGS ARE SEARCHED, AND THAT IS THE FIX FOR 4.5% OF EL PASO.
   *
   * normalizeAddr applies SUFFIXES to every word, so COVE becomes CV, POINT
   * becomes PT, NORTH becomes N. The ILIKE then runs against the roll's RAW
   * situs_street, which in El Paso spells them out — so the pattern cannot
   * match and the query returns zero rows.
   *
   * scripts/tx/lookup-probe.mjs, 200 addresses lifted straight out of the roll:
   * 9 came back no_parcel with nearMisses 0. Houses we hold, reported as not on
   * the roll. That is the Florida disease with a Texas accent.
   *
   * Retrieval is a union of ILIKE patterns, so adding the spelled-out variants
   * can only ever return MORE rows — never fewer, and never different ones for
   * an address that already worked. rowMatches still decides; only the net
   * widens. Precision is unchanged because the matcher runs afterwards.
   */
  const spelled = normalizeAddr(street, { interiorSuffixes: false });

  /**
   * Takes BOTH spellings of the same string, never a fixed pair. The first
   * version closed over the full `spelled` and unioned it into every call —
   * including the locality fallback below, which passes a locality-STRIPPED
   * address. That would have put the unstripped city back into the pattern list
   * and defeated the fallback for exactly the addresses it exists to rescue.
   */
  const searchVariants = (plain, alt) => {
    const v = addressVariants(plain);
    if (!alt || alt === plain) return v;
    return [...new Set([...v, ...addressVariants(alt)])];
  };

  /**
   * ONE VARIANT SET, USED FOR BOTH RETRIEVAL AND MATCHING.
   *
   * These were computed separately — retrieval from searchVariants(typed,
   * spelled), matching from addressVariants(typed) further down — and the two
   * disagreed the moment retrieval was widened on 7 Sept. The query found
   * "11137 VOYAGER COVE DR" and rowMatches then rejected it, because rowMatches
   * compares with normCompare (case and whitespace only, no suffix rewriting)
   * against a list that only held "11137 VOYAGER CV DR".
   *
   * The probe caught it as a status change rather than a fix: 9 no_parcel became
   * 9 no_parcel_near_miss. Retrieval was cured and the rejection moved one step
   * later — which is exactly what those two outcomes exist to tell apart.
   *
   * Two lists that must agree, with no natural alarm, is the drift shape this
   * codebase keeps meeting. So there is now ONE list: whatever set retrieved the
   * rows is the set they are matched against, by construction.
   */
  let usedVariants = searchVariants(typed, spelled);
  let attempt = await retrieve(usedVariants);
  if (attempt.error) {
    console.error('[tx/parcels] retrieval failed:', attempt.error.message);
    return { status: TX_LOOKUP.LOOKUP_FAILED, reason: 'query_error', cadId: cad, county, nearMisses: 0 };
  }

  /**
   * THE LOCALITY FALLBACK, GATED ON ZERO ROWS *RETRIEVED* — defect 3.
   *
   * With no comma (browser autofill and voice input both produce this) the city
   * survived normalisation and poisoned every pattern: "12612 SW 28TH ST MIRAMAR"
   * against a roll holding "12612 SW 28 ST". Zero rows — identical to a house
   * genuinely absent.
   *
   * The gate is the safety property, not a detail. A shorter query returns MORE
   * rows, and preferring those over a real candidate set is how someone gets
   * handed a neighbour's assessment. So it may only fire when the roll has
   * already said nothing at all.
   */
  let usedLocalityFallback = false;
  if (!attempt.rows.length) {
    const shorter = stripTrailingLocality(typed);
    const shorterSpelled = stripTrailingLocality(spelled);
    if (shorter && shorter !== typed) {
      const secondVariants = searchVariants(shorter, shorterSpelled);
      const second = await retrieve(secondVariants);
      if (second.error) {
        console.error('[tx/parcels] fallback retrieval failed:', second.error.message);
        return { status: TX_LOOKUP.LOOKUP_FAILED, reason: 'query_error', cadId: cad, county, nearMisses: 0 };
      }
      if (second.rows.length) {
        attempt = second;
        usedVariants = secondVariants;
        usedLocalityFallback = true;
      }
    }
  }

  const retrieved = attempt.rows;

  // Defect 2: count BEFORE the matcher filter. "Retrieved nothing" and
  // "retrieved forty and rejected them all" are opposite bugs.
  if (!retrieved.length) {
    return { status: TX_LOOKUP.NO_PARCEL, cadId: cad, county, nearMisses: 0, usedLocalityFallback };
  }

  // NOT recomputed. See the block above: the set that retrieved these rows is
  // the set they are judged by, or the two can drift apart silently.
  const variants = usedVariants;
  const matched = retrieved.filter((r) => rowMatches(r.situs_street, variants));

  if (!matched.length) {
    /**
     * Defect 6: record WHERE and HOW CLOSE, from the roll itself, at the moment
     * we hold it. "The matcher turned down 1 row" and "turned down 40" are
     * different bugs and were recording identically. County is read off the
     * retrieved rows — authoritative, no geocoder, no ZIP shortcut, no address
     * stored.
     */
    return {
      status: TX_LOOKUP.NO_PARCEL_NEAR_MISS,
      cadId: cad,
      county,
      nearMisses: retrieved.length,
      // Defect 7: a recovery path has to complete. These are parcels we hold,
      // so clicking one cannot lead anywhere we lack data.
      candidates: retrieved.slice(0, 8).map(toCandidate),
      usedLocalityFallback,
    };
  }

  if (matched.length > 1) {
    /**
     * Defect 7 again: ambiguity is NOT always a unit number. One street name
     * matching two towns is the other shape, and cutting the locality above
     * makes it MORE likely. Callers must ask "which one is yours?" and never
     * "add your unit number".
     */
    return {
      status: TX_LOOKUP.AMBIGUOUS,
      cadId: cad,
      county,
      nearMisses: retrieved.length,
      candidates: matched.slice(0, 8).map(toCandidate),
      usedLocalityFallback,
    };
  }

  return {
    status: TX_LOOKUP.MATCHED,
    cadId: cad,
    county,
    nearMisses: retrieved.length,
    parcel: toParcel(matched[0]),
    /**
     * THE UNTOUCHED ROLL ROW, AND WHY IT IS RETURNED ALONGSIDE THE SHAPED ONE.
     *
     * `parcel` above is camelCase in Tax Code vocabulary, deliberately, because
     * it is what the UI and the filing read. lib/tx/qualify.js and
     * lib/tx/comps.js are older than this file and read snake_case roll rows --
     * parcel.market_value, parcel.homestead_cap_loss, subject.living_area --
     * because they were written against the roll and validated against it:
     * comps-validate.mjs and sellable.mjs drive them over 348,453 real rows.
     *
     * Handing them `parcel` does not throw. n(undefined) is 0, so qualify()
     * falls into `if (!market || !appraised)` and returns no_value_on_roll --
     * "The appraisal district has no current value on file for this property"
     * -- for a house whose value is sitting in the object one line above. Every
     * Texas customer, a data-looking message, nothing in the logs. The Florida
     * disease exactly: a confident answer that is wrong.
     *
     * Rewriting the two validated modules to camelCase would invalidate the
     * harnesses that prove them. So the row rides along untouched and the
     * caller passes THIS to qualify() and findComps(), `parcel` to the view.
     */
    row: matched[0],
    usedLocalityFallback,
  };
}

export default { findParcel, TX_LOOKUP, ROLL_YEAR };

/**
 * ============================================================================
 * ADDRESS AUTOCOMPLETE, AGAINST THE TEXAS ROLL — 10 Sept 2026
 * ============================================================================
 * Texas had none, and the consequences were visible on both pages that ask for
 * an address:
 *
 *   /check  — components/AddressAutocomplete.js calls /api/suggest, which was
 *             Florida-only, so a Texas homeowner got NO suggestions at all and
 *             every row it did render was labelled "FL".
 *   /apply  — its inline copy falls through to Google Places when our roll
 *             returns nothing, and that call forwarded neither the state nor the
 *             ZIP. Typing "3207 high ridge ct" returned High Ridge Court in
 *             Robinwood MD, Newark DE and Delaware Township PA. Adding ", TX" to
 *             the same query returns the right house first.
 *
 * The argument in pages/api/suggest.js's header is the one that matters here and
 * it was written for Florida: "Google will happily suggest an address that no
 * property-data source has a record for, and that customer then hits 'we have no
 * record of your property' through no fault of their own." We now hold 2.95 M
 * Texas parcels. Every suggestion this returns is a parcel we hold, so picking
 * one cannot fail to resolve.
 *
 * Runs on tx_parcels_situs_trgm, the pg_trgm GIN index over situs_street, which
 * has existed since the first load and until now had no reader on this path.
 *
 * BOTH SPELLINGS, for the same reason findParcel searches both: normalizeAddr
 * abbreviates COVE to CV and POINT to PT, while El Paso's roll spells them out.
 * A union of ILIKE patterns can only return MORE rows, never fewer.
 *
 * ZIP NARROWS, IT NEVER EXCLUDES — defect 4, and it applies FIRST here, because
 * an empty suggestion list is where the customer gives up.
 */
export async function suggestAddresses(query, { limit = 8, zip = null, taxYear = ROLL_YEAR } = {}) {
  const typed = normalizeAddr(query);
  if (!typed || typed.length < 4) return [];

  /**
   * A BARE HOUSE NUMBER IS THE WORST QUERY WE COULD RUN, AND THE LEAST USEFUL.
   *
   * "3207" trigram-matches every street in 2.95 M rows that contains those
   * digits anywhere — tens of thousands of parcels across nine districts — and
   * the answer is useless, because a house number without a street name narrows
   * nothing. Florida's table is a quarter the size and never had to care.
   *
   * The customer loses nothing: one keystroke of the street name makes the query
   * both cheap and correct. This is here because it is a keystroke endpoint
   * pointed at the largest table we own.
   */
  if (!/[a-z]/i.test(typed)) return [];

  const db = getSupabaseAdmin();
  if (!db) return [];

  const spelled = normalizeAddr(query, { interiorSuffixes: false });
  const variants = [...new Set([typed, spelled].filter(Boolean))];

  const run = (withZip) => {
    let sel = db.from('tx_parcels')
      .select('situs_street, situs_city, situs_zip, cad_id')
      .eq('tax_year', taxYear)
      .or(orIlike('situs_street', variants.map((v) => `%${v}%`)))
      .limit(limit * 4);
    if (withZip && zip) sel = sel.eq('situs_zip', String(zip).trim().slice(0, 5));
    return sel;
  };

  let { data, error } = await run(true);
  if (error) return [];
  if (zip && (!data || !data.length)) ({ data, error } = await run(false));
  if (error) return [];

  /**
   * One row per ADDRESS, not per parcel. A duplex files two accounts at one
   * situs and the roll carries both; showing the same line twice reads as a bug
   * and costs a slot in a list of eight.
   */
  const seen = new Set();
  const out = [];
  for (const r of data || []) {
    const street = (r.situs_street || '').trim();
    if (!street) continue;
    const key = `${street}|${(r.situs_zip || '').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      street,
      city: (r.situs_city || '').trim() || null,
      zip: (r.situs_zip || '').trim() || null,
      state: 'TX',
      county: LOADED_CADS[Number(r.cad_id)] || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}
