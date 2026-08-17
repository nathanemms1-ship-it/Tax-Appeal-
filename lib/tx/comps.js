/**
 * ============================================================================
 * EQUAL AND UNIFORM — comparable selection under Tex. Tax Code § 41.43(b)(3)
 * ============================================================================
 *
 * "A protest on the ground of unequal appraisal of property shall be determined
 *  in favour of the protesting party unless the appraisal district establishes
 *  that ... the appraised value of the property is equal to or less than the
 *  MEDIAN APPRAISED VALUE of a REASONABLE NUMBER of COMPARABLE PROPERTIES
 *  APPROPRIATELY ADJUSTED."
 *
 * Four phrases, and this file is an answer to each:
 *
 *   median appraised value   -> the district's own roll values, not sale prices.
 *                               Texas is a non-disclosure state; every "Texas
 *                               sale price" on the market is modelled. See the
 *                               header of scripts/tx/schema.sql for why we store
 *                               none and why we do not need any.
 *   reasonable number        -> MIN_COMPS below, and a refusal when we cannot
 *                               reach it. Not a best effort with three.
 *   comparable properties    -> the district's OWN stratification, widened
 *                               through a recorded ladder when a stratum is thin.
 *   appropriately adjusted   -> per-square-foot normalisation plus size, age and
 *                               land-share banding, each one disclosed.
 *
 * The burden sits on the district (§ 41.43(a)). Our job is not to prove the
 * value; it is to put a comp set in front of the ARB that the district cannot
 * dismiss without disowning its own mass-appraisal work.
 *
 * ============================================================================
 * WHY THIS IS NOT A PORT OF lib/dor/comps.js
 * ============================================================================
 * Florida's engine finds comparable SALES and infers market value. That is a
 * different legal claim on a different evidentiary base, and three things change:
 *
 *   1. No sales, no dates, no qualification codes. The candidate pool is the
 *      whole neighbourhood, not the handful of houses that happened to trade.
 *      This is a much RICHER pool, not a poorer one — a thin Texas stratum is
 *      thin because the district drew a small polygon, not because nobody moved.
 *
 *   2. No subject-sale kill switch. lib/dor/comps.js refuses a case when the
 *      subject itself sold above the indicated value. Texas has no such record,
 *      so that guardrail simply does not exist here and its absence must not be
 *      mistaken for the case being safer. It is not; we are just blinder.
 *
 *   3. The comparison value is CAPPED, and caps are a fact about the OWNER, not
 *      about the house. See "THE CAP ARTIFACT" below. Florida has no equivalent
 *      and this is the trap unique to Texas.
 *
 * ============================================================================
 * THE CAP ARTIFACT — the failure mode that is specific to Texas
 * ============================================================================
 * Two identical houses side by side, same builder, same year, same square feet.
 * One owner bought in 2009 and has held a homestead exemption ever since, so
 * § 23.23 has held their appraised value 10%/yr behind a rising market and it now
 * sits at $210,000. The other bought last year and is uncapped at $340,000.
 *
 * Nothing about the second house is appraised unequally. The entire $130,000
 * difference is ownership tenure.
 *
 * The statute says "appraised value", and appraised value is post-cap
 * (§ 1.04(8) -> Chapter 23 -> § 23.23). So a literal reading lets a new owner
 * point at a street full of long-held homesteads and claim a reduction to their
 * median. Sometimes that argument wins. But the district rebuts it by putting
 * the same comps up at MARKET value, where the subject is perfectly uniform, and
 * a homeowner who signed a sworn document asserting inequality is left holding an
 * argument they cannot defend.
 *
 * So this module computes the comparison BOTH ways and reports which it survives:
 *
 *   appraised basis   the statutory test. What § 41.43(b)(3) literally asks.
 *   market basis      the district's pre-cap opinion of value. Whether the
 *                     district's APPRAISAL was actually non-uniform.
 *
 *   both              -> `clean`. Genuine inequality. File it.
 *   appraised only    -> `cap_artifact`. Legally arguable, evidentially weak.
 *                        Flagged, confidence downgraded, never sold as strong.
 *   market only       -> `cap_absorbed`. The district over-appraised the subject
 *                        but the subject's OWN cap already holds the taxable
 *                        value below the comps. Winning changes no dollars —
 *                        which is exactly the refusal lib/tx/qualify.js exists
 *                        to make. Deferred to it.
 *   neither           -> no case.
 *
 * I do not think the literal-appraised-value reading is wrong. I think selling
 * it to a homeowner without telling them which of the two bases their case rests
 * on is wrong, and that is a product decision this file encodes rather than a
 * legal opinion it asserts.
 *
 * ============================================================================
 * THE SET IS CHOSEN BEFORE ANY VALUE IS LOOKED AT
 * ============================================================================
 * This is the integrity guardrail of the whole module and it is enforced
 * structurally, not by good intentions: `selectComps()` ranks candidates on
 * physical similarity to the subject and never reads a value column except to
 * discard rows where the value is missing. `evaluateSet()` then computes the
 * median from whatever set similarity produced. The two functions are separate
 * so that no future edit can quietly slip a value predicate into selection.
 *
 * Sorting candidates by value and taking the cheapest N produces a lower median
 * every time. It is also the single most recognisable signature of a bad
 * protest, an ARB panel sees it constantly, and it converts a winnable case into
 * a credibility problem across every case we file in that county. See
 * Petition_Integrity_Guardrails.md.
 *
 * If the honestly-selected set does not support a reduction, the answer is that
 * there is no case. That answer is a feature.
 */

/**
 * ── The stratum ladder ──────────────────────────────────────────────────────
 *
 * Tried in order. The FIRST one that yields MIN_COMPS wins, and the level used
 * is reported so the petition can state its own basis rather than presenting
 * county-wide comps as though they were next door.
 *
 * WHY THIS ORDER. `neighborhood_code` leads because it is the district's own
 * valuation stratum — HCAD defines its neighbourhoods as "groups of comparable
 * properties whose boundaries were developed based on location and similarity of
 * property data characteristics". Their words. Arguing inside that boundary means
 * the district cannot call the comps non-comparable without contradicting the
 * methodology it used to set the value in the first place.
 *
 * `abs_subdv_cd` sits second rather than third because a subdivision is a
 * recorded plat: same developer, same build era, same lot geometry, filed in the
 * county records. That is an objective comparability argument even where it is
 * not the district's own.
 *
 * `market_area_code` is a genuinely coarse stratum and can span an entire side of
 * a county. It is here because the alternative for a thin neighbourhood is
 * nothing at all, not because it is good.
 *
 * WHY WE EXHAUST BANDS BEFORE WIDENING THE STRATUM. A ±20% size band inside the
 * district's own neighbourhood is more defensible than a ±10% band drawn from
 * across the county, because location dominates every other variable in
 * residential value and the district has already conceded the location grouping.
 * So the loop is: for each stratum, loosen bands until they work; only then
 * widen the stratum and start the bands tight again.
 */
/**
 * MEASURED, 16 Aug 2026, 1,250 sampled parcels across five loaded counties:
 *
 *   neighborhood_code   98.5%–100% populated       1,146 of 1,235 sets (92.8%)
 *   abs_subdv_cd        99.9%–100% populated          42 of 1,235 sets (3.4%)
 *   neighborhood_group  0.0% populated in ALL FIVE           0
 *   market_area_code    0.0% populated in ALL FIVE           0
 *
 * Tiers 3 and 4 are empty for PACS districts and that is NOT a parser gap.
 * The PACS 8.0.34 appraisal export carries 746 fields and exactly two locational
 * strata: `hood_cd` and `abs_subdv_cd` (plus `abs_subdv_desc`). There is no
 * neighbourhood group and no market area to extract. Verified by scanning the
 * published layout, not inferred from empty columns.
 *
 * They stay in the ladder because HCAD, Orion and ISW districts do publish
 * coarser strata and this list is shared across all of them. For a PACS county
 * the effective ladder is: neighbourhood -> subdivision -> county. Read the
 * `strata published` line in scripts/tx/comps-validate.mjs before assuming a
 * tier exists in a district you have not loaded yet.
 *
 * AND THE SUBDIVISION TIER IS WEAKER IN PRACTICE THAN ITS RANKING SUGGESTS.
 * It caught only 3.4% of sets while the county last-resort tier caught 3.8% —
 * meaning that when a neighbourhood is too thin, its subdivision is usually too
 * thin as well, and the ladder falls straight past it. The two strata are
 * correlated, so the second is a poor fallback for the first. See
 * `--diagnose` in the harness.
 */
export const STRATA = [
  { level: 'neighborhood',    column: 'neighborhood_code', strength: 'strong' },
  { level: 'subdivision',     column: 'abs_subdv_cd',      strength: 'strong' },
  { level: 'neighborhood_group', column: 'neighborhood_group', strength: 'moderate' },
  { level: 'market_area',     column: 'market_area_code',  strength: 'weak' },
];

/**
 * The last resort: no locational stratum at all, county-wide, same state class.
 *
 * Held apart from STRATA because it is subject to a different rule — only the
 * TIGHTEST band set is permitted here (see bandsFor). Without a location
 * grouping, physical similarity is the only comparability argument left, so it
 * has to be much stronger to mean anything. A ±20% size band drawn county-wide
 * is not evidence of anything.
 *
 * Expect this tier to be rare and treat its appearance as a data problem to
 * investigate, not a result to file. It exists so the engine degrades visibly
 * instead of silently returning nothing.
 */
export const COUNTY_TIER = { level: 'county_class', column: null, strength: 'last_resort' };

/**
 * Band ladders, loosened together.
 *
 * SIZE. Ported from lib/dor/comps.js, where the reason was measured rather than
 * assumed: smaller homes carry a higher value per square foot, so taking a
 * whole-neighbourhood median $/sqft against a large subject overstates it. On the
 * Florida parcel that produced this constant the size confounder manufactured a
 * 19% error, in the direction that HURT the homeowner.
 *
 * AGE. Also ported, and also learned the hard way — a live Florida run pulled a
 * 1973 house as a comp for a 2018 subject: same neighbourhood, inside the size
 * band, and indefensible on sight. Construction era drives value independently of
 * size through wiring, roof, windows, insulation and layout. One struck comp
 * casts doubt on the entire set.
 *
 * Uses effective_year_built where the district publishes it, because a 1962 house
 * gutted and rebuilt in 2015 is a 2015 house for valuation purposes and the
 * district has already said so.
 *
 * LAND SHARE. land_value / market_value, compared as an absolute difference in
 * that share. This is the guardrail that caught 1600 SW 15 AVE in Fort
 * Lauderdale — 2,042 sq ft of house on a 198,718 sq ft waterfront lot, 71% of its
 * value in dirt against a neighbourhood median of 20%. Valuing it on living area
 * alone indicated $366/sqft against the county's $3,413. An absolute difference
 * rather than a ratio because the measure is already a ratio and because it
 * handles zero correctly: two condos at 0.00 match each other, a condo does not
 * match a house at 0.20.
 */
export const SIZE_BANDS = [0.10, 0.15, 0.20];
export const AGE_BANDS = [15, 25, 40];
export const LAND_BANDS = [0.10, 0.18, 0.25];

/**
 * "A reasonable number of comparable properties."
 *
 * FIVE, not the three lib/dor/comps.js uses. Two reasons, and they both point the
 * same way. A median of four is the mean of the middle two and moves sharply on
 * one outlier, and — more to the point — the district's own equal-and-uniform
 * analyses routinely run on five to ten properties, so arriving with three
 * invites the panel to say the sample is unreasonable before anyone looks at the
 * numbers.
 *
 * TARGET is what we take when the pool is rich. Beyond about ten the marginal
 * comp is, by construction, less similar than the ones already in the set, so it
 * dilutes comparability while adding nothing to the median's stability.
 */
export const MIN_COMPS = 5;
export const TARGET_COMPS = 8;

/** Pool size pulled from the database per attempt. */
export const CANDIDATE_LIMIT = 600;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function median(xs) {
  if (!xs || !xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Effective age basis: the district's own effective year where it publishes one. */
export function ageYear(p) {
  return n(p.effective_year_built) || n(p.year_built) || null;
}

/**
 * Share of total value that is land. Null when there is no value to divide by —
 * NOT zero, because "no land value" and "no value on file" are different facts
 * and treating the second as the first silently matches broken rows to condos.
 */
export function landShare(p) {
  const mv = n(p.market_value);
  if (mv <= 0) return null;
  return n(p.land_value) / mv;
}

/**
 * Is this row usable as a comparable at all?
 *
 * Validity only. Note what is NOT here: nothing about whether the value is high
 * or low. A row is discarded for missing a value, never for having the wrong one.
 */
export function isUsableComp(p) {
  return n(p.living_area) > 0 && n(p.appraised_value) > 0 && n(p.market_value) > 0;
}

/**
 * Physical distance from the subject, in units of "fraction of the band".
 *
 * Each term is normalised by its own band width so that size, age and land share
 * contribute comparably instead of whichever happens to have the larger raw
 * numbers dominating. Quality and condition codes add a flat penalty when they
 * differ, and NONE when either side is null — a district that does not publish
 * the field should not thereby make every comp look worse.
 *
 * This function must never read appraised_value or market_value except through
 * landShare, which uses market_value as a denominator only.
 */
export function similarity(subject, comp, bands) {
  const { size, age, land } = bands;

  const sArea = n(subject.living_area);
  const dSize = sArea > 0 ? Math.abs(n(comp.living_area) - sArea) / sArea / size : 1;

  const sYear = ageYear(subject);
  const cYear = ageYear(comp);
  const dAge = sYear && cYear ? Math.abs(cYear - sYear) / age : 0.5;

  const sLand = landShare(subject);
  const cLand = landShare(comp);
  const dLand = sLand !== null && cLand !== null ? Math.abs(cLand - sLand) / land : 0.5;

  const q = subject.quality_class && comp.quality_class
    ? (String(subject.quality_class).trim().toUpperCase() === String(comp.quality_class).trim().toUpperCase() ? 0 : 0.5)
    : 0;
  const c = subject.condition_code && comp.condition_code
    ? (String(subject.condition_code).trim().toUpperCase() === String(comp.condition_code).trim().toUpperCase() ? 0 : 0.25)
    : 0;

  return dSize + dAge + dLand + q + c;
}

/** Band sets to try, tightest first. The county tier gets only the tightest. */
export function bandsFor(level) {
  const all = SIZE_BANDS.map((size, i) => ({ size, age: AGE_BANDS[i], land: LAND_BANDS[i] }));
  return level === COUNTY_TIER.level ? all.slice(0, 1) : all;
}

/**
 * Choose the comp set. PURE — no database, no values consulted.
 *
 * Candidates that fall inside the band are ranked by physical similarity and the
 * nearest TARGET_COMPS are taken. Returns null when the band does not hold
 * MIN_COMPS, so the caller can loosen and retry.
 */
export function selectComps(subject, candidates, bands) {
  const sArea = n(subject.living_area);
  const sYear = ageYear(subject);
  const sLand = landShare(subject);

  const inBand = candidates.filter((c) => {
    if (!isUsableComp(c)) return false;
    if (c.account_number === subject.account_number) return false;
    if (Math.abs(n(c.living_area) - sArea) / sArea > bands.size) return false;

    const cYear = ageYear(c);
    if (sYear && cYear && Math.abs(cYear - sYear) > bands.age) return false;

    const cLand = landShare(c);
    if (sLand !== null && cLand !== null && Math.abs(cLand - sLand) > bands.land) return false;

    return true;
  });

  if (inBand.length < MIN_COMPS) return null;

  return inBand
    .map((c) => ({ comp: c, distance: similarity(subject, c, bands) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, TARGET_COMPS)
    .map((x) => x.comp);
}

/**
 * Compute the § 41.43(b)(3) result from an already-chosen set.
 *
 * Both bases, always. See "THE CAP ARTIFACT" at the top of this file.
 */
export function evaluateSet(subject, comps) {
  const sArea = n(subject.living_area);

  const apprPsf = comps.map((c) => n(c.appraised_value) / n(c.living_area));
  const mktPsf = comps.map((c) => n(c.market_value) / n(c.living_area));

  const medAppr = median(apprPsf);
  const medMkt = median(mktPsf);

  const subjApprPsf = n(subject.appraised_value) / sArea;
  const subjMktPsf = n(subject.market_value) / sArea;

  const indicatedAppraised = Math.round(medAppr * sArea);
  const indicatedMarket = Math.round(medMkt * sArea);

  const unequalOnAppraised = subjApprPsf > medAppr;
  const unequalOnMarket = subjMktPsf > medMkt;

  let basis;
  if (unequalOnAppraised && unequalOnMarket) basis = 'clean';
  else if (unequalOnAppraised) basis = 'cap_artifact';
  else if (unequalOnMarket) basis = 'cap_absorbed';
  else basis = 'none';

  const capped = comps.filter((c) => n(c.homestead_cap_loss) + n(c.nhs_cap_loss) > 0);

  return {
    indicatedAppraised,
    indicatedMarket,
    medianAppraisedPerSqft: Math.round(medAppr * 100) / 100,
    medianMarketPerSqft: Math.round(medMkt * 100) / 100,
    subjectAppraisedPerSqft: Math.round(subjApprPsf * 100) / 100,
    subjectMarketPerSqft: Math.round(subjMktPsf * 100) / 100,
    unequalOnAppraised,
    unequalOnMarket,
    basis,

    // How much of the comp set is itself capped. A high number is the warning
    // sign that the median is being pulled down by ownership tenure rather than
    // by the district appraising the subject unequally.
    cappedCompCount: capped.length,
    cappedCompShare: comps.length ? capped.length / comps.length : 0,

    // What we would ask the ARB for. Never above what is already on the roll —
    // a protest cannot raise a value, and asking for a number above the current
    // one is a filing error, not a conservative request.
    requestedValue: Math.min(indicatedAppraised, n(subject.appraised_value)),
    reductionSought: Math.max(0, n(subject.appraised_value) - indicatedAppraised),
  };
}

/**
 * Pull candidates for one stratum. Kept small and separate so the validation
 * harness can substitute a fixture and exercise the selection logic offline.
 */
async function fetchStratum(db, subject, stratum, rollYear) {
  const value = stratum.column ? subject[stratum.column] : null;
  if (stratum.column && !value) return null;   // district does not populate it

  let q = db.from('tx_parcels')
    .select([
      'account_number', 'living_area', 'year_built', 'effective_year_built',
      'appraised_value', 'market_value', 'land_value', 'improvement_value',
      'homestead_cap_loss', 'nhs_cap_loss', 'has_homestead',
      'quality_class', 'condition_code', 'state_class_code',
      'neighborhood_code', 'abs_subdv_cd', 'market_area_code', 'neighborhood_group',
      'situs_street', 'situs_city', 'situs_zip', 'arb_protest_flag',
    ].join(','))
    .eq('cad_id', subject.cad_id)
    .eq('tax_year', rollYear)
    .eq('state_class_code', subject.state_class_code)
    .gt('living_area', 0)
    .gt('appraised_value', 0)
    .limit(CANDIDATE_LIMIT);

  if (stratum.column) {
    q = q.eq(stratum.column, value);
  } else {
    // COUNTY TIER. Without a locational predicate this would otherwise return
    // whichever CANDIDATE_LIMIT rows the planner reached first — an arbitrary
    // slice of the county, not the most similar properties in it. Pushing the
    // size range into SQL makes the truncation land on properties that are at
    // least the right size. Slightly wider than the tightest band (±10%) so the
    // band filter still has something to reject rather than being pre-applied.
    const a = n(subject.living_area);
    q = q.gte('living_area', a * 0.85).lte('living_area', a * 1.15);
  }

  const { data, error } = await q;
  if (error) {
    console.error(`[tx/comps] ${stratum.level} query failed:`, error.message);
    return null;
  }
  return data || [];
}

/**
 * Build a defensible equal-and-uniform comp set for a Texas subject parcel.
 *
 * Walks the stratum ladder, loosening bands within each stratum before widening
 * to the next, and reports exactly where it stopped. Returns `sufficient: false`
 * with NO indicated value when the evidence does not support one.
 *
 * That refusal is not a degraded result to paper over. A petition citing a thin
 * or stretched comp set invites the ARB to dismiss the whole filing, and the
 * customer paid us for a document that made their position worse.
 */
export async function findComps(subject, { rollYear = 2026, db, fetchFn } = {}) {
  // `fetchFn` exists so scripts/tx/comps-validate.mjs can drive this ladder over
  // a direct Postgres connection and exercise THE SAME widening logic the
  // product runs, rather than a re-implementation of it that can drift. If the
  // harness reimplemented the loop, it would only ever validate the
  // reimplementation.
  let fetchCandidates = fetchFn;
  if (!fetchCandidates) {
    const database = db || (await import('../../pages/api/supabase')).getSupabaseAdmin();
    if (!database) return { sufficient: false, reason: 'no_database' };
    fetchCandidates = (subj, stratum, year) => fetchStratum(database, subj, stratum, year);
  }

  if (!n(subject.living_area)) {
    // Not recoverable by widening. Without the subject's own square footage
    // there is no per-square-foot comparison to make, and substituting a
    // district average would be inventing the central fact of the filing.
    return { sufficient: false, reason: 'subject_missing_living_area',
      message: 'The appraisal district has not published a living area for this property, so we cannot build a square-foot comparison.' };
  }
  if (!n(subject.appraised_value)) {
    return { sufficient: false, reason: 'subject_missing_value' };
  }

  const attempts = [];

  for (const stratum of [...STRATA, COUNTY_TIER]) {
    const candidates = await fetchCandidates(subject, stratum, rollYear);
    if (candidates === null) {
      attempts.push({ level: stratum.level, skipped: 'not_populated' });
      continue;
    }

    // A stratum that returns the full limit was truncated, and a truncated pool
    // is a biased pool: it is whatever the planner happened to return first, not
    // the most similar. Record it — at CANDIDATE_LIMIT this only bites in very
    // large urban neighbourhoods, and the fix is to push the band filter into
    // SQL rather than to raise the limit.
    const truncated = candidates.length >= CANDIDATE_LIMIT;

    for (const bands of bandsFor(stratum.level)) {
      const comps = selectComps(subject, candidates, bands);
      attempts.push({
        level: stratum.level, bands, pool: candidates.length,
        found: comps ? comps.length : 0, truncated,
      });
      if (!comps) continue;

      const result = evaluateSet(subject, comps);

      return {
        sufficient: true,
        level: stratum.level,
        levelStrength: stratum.strength,
        bands,
        poolSize: candidates.length,
        poolTruncated: truncated,
        comps,
        attempts,
        ...result,
        confidence: confidenceFor(stratum, bands, result, comps.length),
        adjustments: describeAdjustments(stratum, bands, comps.length),
        disclosure: disclosureFor(stratum, bands, result, comps.length),
      };
    }
  }

  return {
    sufficient: false,
    reason: 'insufficient_comparables',
    attempts,
    message: `We could not assemble ${MIN_COMPS} comparable properties for this parcel from the appraisal district's own roll, so we will not file an unequal-appraisal protest on it. Filing a thin comparison would weaken the case rather than help it.`,
  };
}

/**
 * Confidence is driven by the WEAKEST link, not an average.
 *
 * A set of ten comps at the county tier is not "medium" because the count is
 * good; the locational basis is the thing the district will attack, and a large
 * set drawn from nowhere in particular is still drawn from nowhere in particular.
 */
export function confidenceFor(stratum, bands, result, count) {
  if (result.basis === 'cap_artifact') return 'low';
  if (stratum.strength === 'last_resort' || stratum.strength === 'weak') return 'low';
  if (stratum.strength === 'moderate') return 'medium';

  // ONLY THE DISTRICT'S OWN NEIGHBOURHOOD EARNS 'high'.
  //
  // The first version of this returned 'high' for the subdivision tier too,
  // because a recorded plat is a genuinely strong comparability argument and the
  // stratum is marked 'strong'. The ladder test caught it and the test was
  // right: reaching the subdivision tier means the district's OWN neighbourhood
  // could not produce five comparables, and that failure is itself information.
  // Either the stratum is unusually small or the subject is unusual within it,
  // and both are things the district will notice before we do.
  //
  // Intrinsic stratum strength and ladder position are different facts. This
  // function needs both, and only had one.
  if (stratum.level !== 'neighborhood') return 'medium';

  if (bands.size > 0.15) return 'medium';
  if (count < MIN_COMPS + 1) return 'medium';
  return 'high';
}

/** Plain-language statement of what was adjusted, for the petition narrative. */
export function describeAdjustments(stratum, bands, count) {
  const where = {
    neighborhood: "the appraisal district's own neighbourhood code for this property",
    subdivision: 'the same recorded subdivision',
    neighborhood_group: "the appraisal district's neighbourhood group",
    market_area: "the appraisal district's market area",
    county_class: 'the same state property classification county-wide',
  }[stratum.level];

  return [
    `${count} comparable properties were drawn from ${where}.`,
    `All comparables share the subject's state property classification.`,
    `Living area within ${Math.round(bands.size * 100)}% of the subject's.`,
    `Year built within ${bands.age} years of the subject's.`,
    `Land share of total value within ${Math.round(bands.land * 100)} percentage points of the subject's.`,
    `Values compared per square foot of living area, which is the adjustment for remaining size differences.`,
    `Comparables were ranked by physical similarity to the subject and the closest were taken. They were not ranked by value.`,
  ];
}

/**
 * What the customer must be told before signing.
 *
 * These are the sentences that keep a document-preparation service on the right
 * side of the line: the homeowner signs this, so the homeowner has to know what
 * it rests on. A weak basis is not a reason to hide the basis.
 */
export function disclosureFor(stratum, bands, result, count) {
  const out = [];

  if (stratum.strength === 'weak' || stratum.strength === 'last_resort') {
    out.push(`There were not enough similar properties in your immediate neighbourhood to build a comparison, so we widened to ${stratum.level === 'county_class' ? 'similar properties across the county' : "the district's broader market area"}. The appraisal district may argue these are not close enough comparisons.`);
  }
  if (result.basis === 'cap_artifact') {
    out.push('Your case rests on the capped values of your neighbours rather than on how the district appraised your home. Many of the comparable homes have long-standing homestead caps holding their taxable values below market. This argument is available to you under the statute, but the district is likely to answer it by pointing to market values, where your property is valued in line with theirs.');
  }
  if (result.cappedCompShare > 0.5) {
    out.push(`${Math.round(result.cappedCompShare * 100)}% of the comparable properties are themselves subject to a value cap.`);
  }
  if (bands.size > 0.15) {
    out.push(`The closest comparable homes differ from yours in size by up to ${Math.round(bands.size * 100)}%.`);
  }
  if (count === MIN_COMPS) {
    out.push(`This comparison uses the minimum of ${MIN_COMPS} comparable properties.`);
  }
  return out;
}

export default {
  findComps, selectComps, evaluateSet, similarity, median,
  landShare, ageYear, isUsableComp, bandsFor,
  STRATA, COUNTY_TIER, SIZE_BANDS, AGE_BANDS, LAND_BANDS,
  MIN_COMPS, TARGET_COMPS,
};
