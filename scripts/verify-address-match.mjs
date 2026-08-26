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

  let data = query(variants, zip);
  if (zip && !data.some((r) => rowMatches(r.phy_addr1, variants))) data = query(variants, null);

  let usedFallback = false;
  if (!data.length) {
    const trimmed = stripTrailingLocality(addr);
    if (trimmed && trimmed !== addr) {
      usedFallback = true;
      variants = addressVariants(trimmed);
      data = query(variants, zip);
      if (zip && !data.some((r) => rowMatches(r.phy_addr1, variants))) data = query(variants, null);
    }
  }
  const matched = data.filter((r) => rowMatches(r.phy_addr1, variants));
  return { retrieved: data.length, matched, usedFallback };
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
console.log(`\nverify-address-match: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('A Florida address typed without a comma reaches the parcel it names.');
