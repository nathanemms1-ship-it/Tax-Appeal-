#!/usr/bin/env node
/**
 * THE ADDRESS THAT IS ON THE ROLL AND COULD NOT BE FOUND.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * In the week to 26 Aug 2026, 54 of 208 checks — 26% — ended in `no_parcel`,
 * the outcome whose customer-facing sentence is:
 *
 *     "We do not have a record for this address on the current tax roll."
 *
 * NOT ONE of those 54 was recorded as `no_parcel_near_miss`. That split exists
 * precisely to separate "our matcher rejected the rows" from "the SQL returned
 * nothing", and a clean sweep to the second bucket is not what a matcher problem
 * looks like — it is what a RETRIEVAL problem looks like. The pattern itself was
 * excluding the parcel before rowMatches ever saw a row.
 *
 * The cause: normalizeAddr strips everything from the first comma and then a
 * trailing FL/FLORIDA. When the customer types no comma — which browser autofill
 * and voice input both produce — the CITY survives:
 *
 *     "12612 SW 28TH ST MIRAMAR FLORIDA"  ->  "12612 SW 28TH ST MIRAMAR"
 *
 * Verified against the live 2026 roll on 26 Aug 2026:
 *     phy_addr1 ILIKE '12612%SW%28%ST%'          -> 1 row
 *     phy_addr1 ILIKE '12612%SW%28%ST%MIRAMAR%'  -> 0 rows
 *
 * ============================================================================
 * WHAT THIS FILE GUARDS, AND WHAT IT CANNOT
 * ============================================================================
 * The fix is a fallback that only fires when the roll returned ZERO ROWS. That
 * gate is the safety property: a shorter query returns MORE rows, and preferring
 * those over a real candidate set is how somebody gets handed a neighbour's
 * assessment. So the assertions below are in two halves —
 *
 *   1. stripTrailingLocality does the right thing, INCLUDING the addresses it
 *      must refuse to touch. Those matter more than the ones it fixes.
 *   2. A simulation of findParcel's three-stage retrieval against a small fake
 *      roll, using the REAL pattern and match functions. It cannot prove the
 *      Supabase call is shaped right — verify the wiring assertions at the end
 *      for that — but it does prove the algorithm finds the house.
 */
import { readFileSync } from 'node:fs';
import {
  normalizeAddr,
  normSpace,
  addressVariants,
  addressVariantTiers,
  anchoredPattern,
  rowMatches,
  stripTrailingLocality,
  LOCALITY_CUT_TYPES,
} from '../lib/dor/addressMatch.js';

let pass = 0;
const failures = [];
const t = (name, cond, got) =>
  cond ? pass++ : failures.push(got === undefined ? name : `${name} (got: ${JSON.stringify(got)})`);

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = (p) => strip(readFileSync(p, 'utf8'));

// ---------------------------------------------------------------------------
// 1. THE ADDRESSES IT MUST CUT.
// ---------------------------------------------------------------------------
{
  const cases = [
    // [what the customer typed, what should be queried]
    ['12612 SW 28TH ST MIRAMAR FLORIDA', '12612 SW 28TH ST'],
    ['12612 SW 28TH ST MIRAMAR',         '12612 SW 28TH ST'],
    ['8023 MARBELLA CREEK AVE DORAL',    '8023 MARBELLA CREEK AVE'],
    ['500 OCEAN DR MIAMI BEACH',         '500 OCEAN DR'],
    ['1234 PALM AVE HIALEAH GARDENS',    '1234 PALM AVE'],
    ['77 SUNSET BLVD SAINT PETERSBURG',  '77 SUNSET BLVD'],
  ];
  for (const [typed, want] of cases) {
    const got = stripTrailingLocality(normalizeAddr(typed));
    t(`cuts the city from "${typed}"`, got === want, got);
  }
}

// ---------------------------------------------------------------------------
// 2. THE ADDRESSES IT MUST LEAVE ALONE. This is the half that can do harm.
// ---------------------------------------------------------------------------
{
  const untouched = [
    // Street type is already final — there is no locality to remove.
    '8023 MARBELLA CREEK AVE',
    '1610 SEAGRAPE WAY',
    '1234 HOLLYWOOD BLVD',      // a city's name, used as a STREET name
    '900 ORLANDO AVE',
    '55 MIAMI GARDENS DR',
    // Saint, not Street. Cutting at the FIRST street type would yield "100 ST".
    '100 ST AUGUSTINE RD',
    // No street type at all: nothing to anchor a cut on, so do not guess.
    '1234 BROADWAY',
    '742 EVERGREEN',
    // Too short to be anything but a street.
    '12 MAIN ST',
  ];
  for (const a of untouched) {
    t(`leaves "${a}" alone`, stripTrailingLocality(a) === '', stripTrailingLocality(a));
  }

  t('a trailing directional is kept, not cut as a city',
    stripTrailingLocality('1234 PALM BAY RD NE') === '',
    'cutting at RD would drop the quadrant and could return the wrong side of town');

  t('a city AFTER a directional is still cut',
    stripTrailingLocality('1234 PALM BAY RD NE PALM BAY') === '1234 PALM BAY RD NE',
    stripTrailingLocality('1234 PALM BAY RD NE PALM BAY'));
}

// ---------------------------------------------------------------------------
// 3. WORDS THAT ARE STREET TYPES *AND* NAME COMPONENTS ARE EXCLUDED ON PURPOSE.
//    CREEK and LOOP appear mid-name on real Florida streets; treating them as a
//    cut point would truncate "8023 MARBELLA CREEK AVE" to "8023 MARBELLA CREEK".
// ---------------------------------------------------------------------------
{
  t('CREEK is not a cut point', !LOCALITY_CUT_TYPES.has('CREEK'));
  t('LOOP is not a cut point', !LOCALITY_CUT_TYPES.has('LOOP'));
  t('ST is a cut point', LOCALITY_CUT_TYPES.has('ST'));
  t('AVE is a cut point', LOCALITY_CUT_TYPES.has('AVE'));
}

// ---------------------------------------------------------------------------
// 4. THE SIMULATION. A fake roll, the real functions, findParcel's real stages.
// ---------------------------------------------------------------------------
const ROLL = [
  { phy_addr1: '12612 SW 28 ST',        phy_zipcd: '33027', phy_city: 'MIRAMAR' },
  { phy_addr1: '8023 MARBELLA CREEK AVE', phy_zipcd: '33178', phy_city: 'DORAL' },
  { phy_addr1: '100 ST AUGUSTINE RD',   phy_zipcd: '32086', phy_city: 'ST AUGUSTINE' },
  { phy_addr1: '1234 HOLLYWOOD BLVD',   phy_zipcd: '33020', phy_city: 'HOLLYWOOD' },
  // The neighbour that must never be returned for a shortened query.
  { phy_addr1: '12612 SW 28 AVE',       phy_zipcd: '33027', phy_city: 'MIRAMAR' },
  /*
    A CONDO TOWER, LONGER THAN THE CANDIDATE LIMIT. 27 Aug 2026.

    The roll files these units in PHY_ADDR1. addressVariants offers both "1750 N
    BAYSHORE DR 3204" and, via stripUnit, "1750 N BAYSHORE DR" -- and the second
    matches every unit here. Under one query and one LIMIT 12, unit 3204 is the
    fourteenth row and never survives retrieval, so the `exact` rule in
    findParcel has nothing to select and a resolvable address returns
    `ambiguous`. Deliberately ordered with 3204 last, because an unordered SQL
    LIMIT gives no guarantee and the fix must not depend on one.
  */
  ...['1201','1401','1501','1601','1701','1801','1901','2001','2101','2201','2301','2401','2501']
    .map((u) => ({ phy_addr1: `1750 N BAYSHORE DR ${u}`, phy_zipcd: '33132', phy_city: 'MIAMI' })),
  { phy_addr1: '1750 N BAYSHORE DR 3204', phy_zipcd: '33132', phy_city: 'MIAMI' },
];

/** ILIKE, as Postgres would apply it to the patterns anchoredPattern builds. */
const ilike = (value, pattern) => {
  const rx = new RegExp(
    '^' + pattern.split('%').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    'i'
  );
  return rx.test(normSpace(value));
};

const query = (variants, zip) => {
  const pats = variants.map(anchoredPattern);
  return ROLL.filter((r) => pats.some((p) => ilike(r.phy_addr1, p)))
    .filter((r) => (zip ? r.phy_zipcd === zip : true))
    .slice(0, 12);
};

/** findParcel's retrieval, stage for stage. Mirrors lib/dor/parcels.js. */
function lookup(street, zip = null) {
  const addr = normalizeAddr(street);
  let variants = addressVariants(addr);

  /*
    TIERED RETRIEVAL, mirroring lib/dor/parcels.js as of 27 Aug. `variants` stays
    the full list because it is what rowMatches and the `exact` rule judge
    against; only the query narrows.
  */
  const tiers = addressVariantTiers(addr);
  let retrieval = tiers.specific;

  let data = query(retrieval, zip);
  if (zip && !data.some((r) => rowMatches(r.phy_addr1, variants))) data = query(retrieval, null);

  let usedBroad = false;
  if (!data.length && tiers.broad.length) {
    usedBroad = true;
    retrieval = tiers.broad;
    data = query(retrieval, zip);
    if (zip && !data.some((r) => rowMatches(r.phy_addr1, variants))) data = query(retrieval, null);
  }

  let usedFallback = false;
  if (!data.length) {
    const trimmed = stripTrailingLocality(addr);
    if (trimmed && trimmed !== addr) {
      usedFallback = true;
      variants = addressVariants(trimmed);
      retrieval = variants;
      data = query(retrieval, zip);
      if (zip && !data.some((r) => rowMatches(r.phy_addr1, variants))) data = query(retrieval, null);
    }
  }
  let matched = data.filter((r) => rowMatches(r.phy_addr1, variants));
  // findParcel: an exact match beats a prefix match. Ambiguity is whatever
  // survives BOTH filters, so the simulation has to apply this one too.
  const exact = matched.filter((r) => variants.some((v) => normSpace(r.phy_addr1) === normSpace(v)));
  if (exact.length) matched = exact;
  return { retrieved: data.length, matched, usedFallback, usedBroad };
}

{
  // THE REPORTED FAILURE. This is the case that produced the 54 rows.
  const withCity = lookup('12612 SW 28TH ST MIRAMAR FLORIDA');
  t('the no-comma address now finds the parcel',
    withCity.matched.length === 1 && withCity.matched[0].phy_addr1 === '12612 SW 28 ST',
    withCity.matched.map((r) => r.phy_addr1));
  t('and it got there through the fallback', withCity.usedFallback === true);

  // The same house typed the way that always worked, to prove nothing moved.
  const clean = lookup('12612 SW 28th St');
  t('the comma-less-but-clean address still works',
    clean.matched.length === 1 && clean.matched[0].phy_addr1 === '12612 SW 28 ST',
    clean.matched.map((r) => r.phy_addr1));
  t('and it did NOT need the fallback', clean.usedFallback === false,
    'firing on an address that already worked would mean the gate is wrong');

  const comma = lookup('12612 SW 28th St, Miramar, FL 33027');
  t('the comma form still works', comma.matched.length === 1, comma.matched.length);
  t('the comma form does not touch the fallback', comma.usedFallback === false);

  // ST/SAINT. The case that breaks a first-match cut.
  const saint = lookup('100 St Augustine Rd Saint Augustine');
  t('a Saint street with the city appended is found',
    saint.matched.length === 1 && saint.matched[0].phy_addr1 === '100 ST AUGUSTINE RD',
    saint.matched.map((r) => r.phy_addr1));

  // A city used as a street name must not be truncated into a different street.
  const holly = lookup('1234 Hollywood Blvd');
  t('a street named after a city is untouched',
    holly.matched.length === 1 && holly.usedFallback === false,
    holly.matched.map((r) => r.phy_addr1));

  // THE NEIGHBOUR. A shortened query must not reach across street TYPES.
  const nbr = lookup('12612 SW 28TH ST MIRAMAR');
  t('the fallback does not return the AVE when the customer said ST',
    !nbr.matched.some((r) => r.phy_addr1 === '12612 SW 28 AVE'),
    nbr.matched.map((r) => r.phy_addr1));

  // An address genuinely absent must still miss, or the fallback is just noise.
  const absent = lookup('99999 NOWHERE RD MIRAMAR');
  t('an address that is really not on the roll still misses',
    absent.matched.length === 0, absent.matched.length);
}

// ---------------------------------------------------------------------------
// 5. THE WIRING. The simulation above proves the algorithm; these prove the
//    real lookup runs it, and runs it behind the zero-rows gate.
// ---------------------------------------------------------------------------
{
  const parcels = src('lib/dor/parcels.js');

  t('parcels.js imports the helper', /stripTrailingLocality/.test(parcels));
  t('parcels.js calls it', /stripTrailingLocality\(addr\)/.test(parcels));

  t('variants is reassignable',
    /let variants = addressVariants\(addr\)/.test(parcels),
    'const would throw at the reassignment, and only on the fallback path — a crash nobody sees in testing');

  /**
   * THE GATE. `!(data || []).length` is zero rows RETRIEVED. If this is ever
   * relaxed to "zero rows MATCHED", a real candidate set gets thrown away for a
   * looser query, and the customer can be shown a different property.
   */
  t('the fallback is gated on zero rows RETRIEVED',
    /if \(!error && !\(data \|\| \[\]\)\.length\) \{/.test(parcels),
    'the gate is the safety property, not an optimisation');

  t('the fallback is not gated on rowMatches',
    !/if \(!error && !\(data \|\| \[\]\)\.some\(\(r\) => rowMatches[\s\S]{0,120}stripTrailingLocality/.test(parcels));

  t('the fallback runs after the existing zip retry',
    parcels.indexOf('stripTrailingLocality(addr)') > parcels.indexOf('({ data, error } = await run(false));'),
    'running it first would pre-empt the zip retry that already fixes a different miss');

  const am = src('lib/dor/addressMatch.js');
  t('stripTrailingLocality is exported', /export function stripTrailingLocality/.test(am));
  t('LOCALITY_CUT_TYPES is exported', /export const LOCALITY_CUT_TYPES/.test(am));
  t('it scans backwards for the LAST street type',
    /for \(let i = words\.length - 1; i >= 1; i--\)/.test(am),
    'a forward scan turns "100 ST AUGUSTINE RD" into "100 ST"');
}


// ---------------------------------------------------------------------------
// 5. THE CONDO UNIT THAT WAS EVICTED FROM ITS OWN RESULT SET. 27 Aug 2026.
// ---------------------------------------------------------------------------
/**
 * addressVariants returns the address as typed AND with its unit stripped, and
 * both went into one `.or()` under one `.limit(12)`. For a tower the stripped
 * spelling matches every unit in the building, so the customer's own unit is
 * very unlikely to be among the twelve rows that come back — and `findParcel`'s
 * "an exact match beats a prefix match" rule, whose own comment says it is what
 * "makes unit stripping safe", can only ever prefer a row that survived
 * retrieval. It never fired.
 *
 * The visible result was `ambiguous` — the largest no-finding outcome on the
 * site, 18 checks on 27 Aug — shown to somebody whose exact address we hold, on
 * a screen offering five units that were not theirs.
 *
 * These assertions are about RETRIEVAL, which is where the defect was. The
 * decision layer is unchanged and asserted to be: `addressVariants` must still
 * return both tiers, or rowMatches would start rejecting rows the broad query
 * legitimately returned.
 */
{
  const typed = '1750 N BAYSHORE DR 3204, Miami, FL';
  const tiers = addressVariantTiers(normalizeAddr(typed));

  t('the typed unit is in the specific tier',
    tiers.specific.some((v) => normSpace(v) === '1750 N BAYSHORE DR 3204'));
  t('the unit-stripped spelling is in the broad tier, not the specific one',
    tiers.broad.some((v) => normSpace(v) === '1750 N BAYSHORE DR') &&
    !tiers.specific.some((v) => normSpace(v) === '1750 N BAYSHORE DR'));
  t('a plain house address produces no broad tier, so it still runs one query',
    addressVariantTiers(normalizeAddr('8023 Marbella Creek Ave')).broad.length === 0);

  /**
   * THE DECISION LAYER MUST NOT NARROW WITH RETRIEVAL. Splitting the tiers and
   * then judging rows against the specific tier alone would reject every row the
   * broad query exists to find.
   *
   * INJECTION: `return addressVariants(addr) { return addressVariantTiers(addr).specific }` -> FAILS.
   */
  t('addressVariants is still the union of both tiers',
    [...tiers.specific, ...tiers.broad].sort().join('|') ===
    [...addressVariants(normalizeAddr(typed))].sort().join('|'));

  const unit = lookup(typed);
  t('the exact unit resolves to exactly one parcel, not an ambiguous list',
    unit.matched.length === 1, `${unit.matched.length} matched`);
  t('...and it is the unit that was typed',
    unit.matched[0]?.phy_addr1 === '1750 N BAYSHORE DR 3204', unit.matched[0]?.phy_addr1);
  t('...without ever widening to the unit-stripped query',
    unit.usedBroad === false);

  /**
   * The building typed WITHOUT a unit is still ambiguous, and must be. This is
   * the case the rewritten /check screen asks "Which one is yours?" about, and a
   * fix that resolved it by guessing would put a neighbour's assessment on a
   * petition.
   */
  const building = lookup('1750 N Bayshore Dr, Miami, FL');
  t('the building without a unit is still ambiguous', building.matched.length > 1);

  /**
   * And the broad tier still rescues the case stripUnit was added for: a unit
   * the roll does not carry in PHY_ADDR1 at all.
   *
   * INJECTION: delete the broad-tier widen in parcels.js -> FAILS here.
   */
  const notOnRoll = lookup('8023 Marbella Creek Ave Apt 7');
  t('a unit the roll does not file still finds the building via the broad tier',
    notOnRoll.matched.length === 1 && notOnRoll.usedBroad === true);

  const parcels = src('lib/dor/parcels.js');
  t('findParcel queries the specific tier first',
    /let retrieval = tiers\.specific/.test(parcels));
  t('and widens to the broad tier only when nothing was retrieved',
    /if \(!error && !\(data \|\| \[\]\)\.length && tiers\.broad\.length\) \{/.test(parcels),
    'gating on rowMatches instead would replace a real candidate set with a wider one');
  t('suggestAddresses tops up from the broad tier rather than querying both at once',
    /fetchTier\(tiers\.specific\)/.test(parcels) &&
    parcels.indexOf('fetchTier(tiers.specific)') < parcels.indexOf('fetchTier(tiers.broad)'));
}

// ---------------------------------------------------------------------------
console.log(`\nverify-address-match: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('A Florida address typed without a comma reaches the parcel it names.');
