#!/usr/bin/env node
/**
 * OFFLINE VERIFICATION for lib/tx/comps.js — added 7 Sept 2026.
 *
 * ============================================================================
 * WHY THIS DID NOT EXIST AND SHOULD HAVE
 * ============================================================================
 * lib/tx/comps.js is the § 41.43(b)(3) engine: it picks the comparables and
 * computes the median that the entire Texas filing rests on. Its only test was
 * scripts/tx/comps-validate.mjs, which needs a live Postgres connection — so it
 * cannot run in `npm run build`, does not run in CI, and did not run at all
 * between 16 Aug and today.
 *
 * scripts/verify-comps.mjs sounds like it covers this. It does not: it guards
 * the FLORIDA RentCast provider. The most important file in the Texas product
 * had no build-time guard whatsoever.
 *
 * Everything here is a pure function of its inputs. No network, no database.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const {
  similarity, codeOrNull, PLACEHOLDER_CODES, selectComps, evaluateSet,
  median, ageYear, landShare, isUsableComp, MIN_COMPS, stratumCodeOrNull, STRATA,
  findComps,
} = await import('../lib/tx/comps.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

const BANDS = { size: 0.10, age: 15, land: 0.10 };
const base = { living_area: 2000, year_built: 2000, market_value: 300000,
  land_value: 40000, appraised_value: 300000 };
const q = (quality_class) => ({ ...base, quality_class });

// ── 1. A PLACEHOLDER CLASS CODE IS NOT A CLASS ───────────────────────────────
/**
 * PACS writes `*` into imprv_det_class_cd where nothing is assigned. Measured on
 * El Paso 2026: 21,779 A1 parcels — one in ten — carry it, and their median sits
 * within 3.4% of the district, which is where the unclassified sit.
 *
 * `'*'` is a truthy string, so before codeOrNull() the quality term fired at
 * full strength between an `*` subject and an R3 comp: 0.5, the same penalty as
 * a genuine R2-vs-R5 mismatch and half a size-band of distance. That demoted
 * properly-classed comps for 21,779 subjects and demoted those 21,779 for
 * everyone else. No error, no counter, just worse comp sets for 9.5% of a county.
 *
 * INJECTION: drop PLACEHOLDER_CODES from codeOrNull -> the third assertion FAILS.
 */
t('a genuine class mismatch is still penalised', similarity(q('R3'), q('R4'), BANDS) === 0.5);
t('matching classes cost nothing', similarity(q('R3'), q('R3'), BANDS) === 0);
t('an unassigned class is treated as unknown, not as a class that differs',
  similarity(q('*'), q('R3'), BANDS) === 0 && similarity(q('R3'), q('*'), BANDS) === 0);
t('a genuinely absent class is unknown too',
  similarity(q(null), q('R3'), BANDS) === 0 && similarity(q('   '), q('R3'), BANDS) === 0);
t('class comparison is case- and whitespace-insensitive',
  similarity(q(' r3 '), q('R3'), BANDS) === 0);
t('codeOrNull collapses the placeholder set', [...PLACEHOLDER_CODES].every((c) => codeOrNull(c) === null));
t('...and preserves a real code, normalised', codeOrNull(' r3 ') === 'R3');

// ── 1b. A LOCATIONAL KEY OF ALL ZEROS IS NOT A LOCATION ──────────────────────
/**
 * Tarrant writes "0" into abs_subdv_cd for 87,320 parcels — 14.6% of the district
 * and the most common value in the column. The column is `text`, so the driver
 * returns the STRING "0", which is truthy, so the old `!value` guard in
 * fetchStratum let it through and the subdivision tier grouped those 87,320
 * parcels as one subdivision at strength 'strong'.
 *
 * Found on 29 Sept 2026 by `push.mjs --explain` printing a plan for a real
 * subject. Nothing here would have caught it, which is the reason these
 * assertions exist rather than only the fix.
 */
for (const z of ['0', '00', '000', '0000', ' 0 ', '00000000']) {
  t(`a locational code of "${z.trim()}" is absence, not a stratum`, stratumCodeOrNull(z) === null);
}
t('the number 0 is absence too — some drivers return numeric columns unboxed',
  stratumCodeOrNull(0) === null);
t('null and undefined stay absent', stratumCodeOrNull(null) === null && stratumCodeOrNull(undefined) === null);
t('the class placeholders are absent here as well', [...PLACEHOLDER_CODES].every((c) => stratumCodeOrNull(c) === null));

/**
 * The other half, and the one that would do real damage if this were written as a
 * blanket "starts with 0" or a Number() coercion: these are all REAL codes from
 * districts we hold, and every one must survive.
 */
for (const real of ['1000', '40685', '6A00', 'M851', 'SJ1172A', '053400-000', 'S3720', 'C5611', '0100', '01']) {
  t(`"${real}" is a real code and must survive`, stratumCodeOrNull(real) !== null);
}
t('a surviving code keeps its own characters', stratumCodeOrNull('SJ1172A') === 'SJ1172A');

/**
 * Every locational stratum reads a column that can carry the placeholder, so the
 * rule has to be applied by fetchStratum rather than per column. This asserts the
 * shape the fix depends on: each STRATA entry names a column, and COUNTY_TIER —
 * the one with no column — is deliberately held outside STRATA.
 */
t('every stratum in the ladder names a column the guard can test',
  STRATA.length > 0 && STRATA.every((x) => typeof x.column === 'string' && x.column.length > 0));

/**
 * condition_code is null for every Texas parcel we hold — PACS export layout
 * 8.0.34 does not publish it, and scripts/tx/push.mjs never writes the column.
 * The term must stay inert rather than throwing or asserting a difference.
 */
t('the condition term is inert when the column is empty, as it is everywhere',
  similarity({ ...base, condition_code: null }, { ...base, condition_code: null }, BANDS) === 0);

// ── 2. SIMILARITY MUST NOT READ VALUE ────────────────────────────────────────
/**
 * The file's own rule: similarity "must never read appraised_value or
 * market_value except through landShare, which uses market_value as a
 * denominator only." Ranking comps by how close their VALUE is to the subject's
 * would select the answer we are trying to prove.
 *
 * Asserted behaviourally, not by reading source: two comps identical in every
 * physical respect and wildly different in value must rank identically.
 */
{
  const cheap = { ...base, appraised_value: 120000, market_value: 120000, land_value: 16000 };
  const dear = { ...base, appraised_value: 900000, market_value: 900000, land_value: 120000 };
  t('a comp is not ranked by how close its value is to the subject',
    similarity(base, cheap, BANDS) === similarity(base, dear, BANDS));
}

// ── 3. THE MEDIAN IS A MEDIAN ────────────────────────────────────────────────
t('odd counts take the middle value', median([3, 1, 2]) === 2);
t('even counts average the two middle values', median([1, 2, 3, 4]) === 2.5);
t('an empty set has no median, rather than zero', median([]) === null);

// ── 4. VALIDITY SCREENS DISCARD ROWS, NEVER VALUES ───────────────────────────
/**
 * A row is discarded for MISSING a value, never for having an inconvenient one.
 * Screening out high comps would manufacture the unequal-appraisal finding.
 */
t('a row with no living area is unusable', !isUsableComp({ ...base, living_area: 0 }));
t('a row with no value is unusable', !isUsableComp({ ...base, appraised_value: 0 }));
t('a very expensive row is perfectly usable',
  isUsableComp({ ...base, appraised_value: 5000000, market_value: 5000000 }));
t('land share is null when there is nothing to divide by, not zero',
  landShare({ ...base, market_value: 0 }) === null);
t('effective year is preferred over year built when the district publishes one',
  ageYear({ year_built: 1980, effective_year_built: 2005 }) === 2005
  && ageYear({ year_built: 1980, effective_year_built: null }) === 1980);

// ── 5. SELECTION REPORTS WHAT IT FOUND; MIN_COMPS DRIVES THE SEARCH ──────────
/**
 * REWRITTEN 7 Sept 2026. This used to assert `selectComps(...) === null` for a
 * short set, because MIN_COMPS was doing two jobs at once: deciding when the
 * ladder could stop widening, and deciding whether we would file at all.
 *
 * The second job was never ours — § 41.43(b)(3) asks for "a reasonable number of
 * comparable properties" and names no figure, so there is no statutory floor to
 * enforce. selectComps now returns whatever the band holds, findComps keeps
 * searching for something fuller, and a short set only survives if nothing
 * better exists anywhere on the ladder.
 *
 * INJECTION: restore `if (inBand.length < MIN_COMPS) return null;` -> FAILS.
 */
{
  const few = [1, 2].map((i) => ({ ...base, account_number: 'C' + i }));
  const short = selectComps(base, few, BANDS);
  t('a short band returns the comps it found rather than null',
    Array.isArray(short) && short.length === 2);
  t('and an empty band still returns null, because there is nothing to report',
    selectComps(base, [], BANDS) === null);
  const plenty = Array.from({ length: 12 }, (_, i) => ({
    ...base, account_number: 'C' + i, living_area: 1990 + i,
    appraised_value: 290000 + i * 1000, market_value: 290000 + i * 1000,
  }));
  const picked = selectComps(base, plenty, BANDS);
  t('a full band returns a set', Array.isArray(picked) && picked.length >= MIN_COMPS);
}

// ── 5b. THE LADDER DOES NOT QUERY A PLACEHOLDER STRATUM ──────────────────────
/**
 * The unit test above proves stratumCodeOrNull() classifies "0" as absence. This
 * proves fetchStratum ACTS on it — that the subdivision tier is never queried for
 * a Tarrant subject whose abs_subdv_cd is the placeholder, and still IS queried
 * when the code is real. Those are two different bugs and only this test separates
 * them.
 *
 * INJECTION: restore `if (stratum.column && !value) return null;` in
 * fetchStratum -> the first case FAILS, because "0" is a truthy string.
 */
{
  // Minimal stand-in for the Supabase query builder: chainable, thenable,
  // records every column it was filtered on, and finds nothing.
  const makeDb = (seen) => ({
    from() {
      const b = {
        select: () => b, gt: () => b, gte: () => b, lte: () => b, limit: () => b,
        eq(col, val) { seen.push([col, val]); return b; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return b;
    },
  });

  const subject = (abs_subdv_cd) => ({
    cad_id: 220, account_number: 'SUBJ', state_class_code: 'A',
    living_area: 2000, year_built: 2000, appraised_value: 300000, market_value: 300000,
    land_value: 40000, neighborhood_code: '1H070C', abs_subdv_cd,
    neighborhood_group: null, market_area_code: null,
  });

  for (const placeholder of ['0', '00', '0000']) {
    const seen = [];
    await findComps(subject(placeholder), { db: makeDb(seen), rollYear: 2026 });
    t(`the subdivision tier is skipped when abs_subdv_cd is "${placeholder}"`,
      !seen.some(([col]) => col === 'abs_subdv_cd'));
    t(`...while the neighbourhood tier is still tried for "${placeholder}"`,
      seen.some(([col, val]) => col === 'neighborhood_code' && val === '1H070C'));
  }

  {
    const seen = [];
    await findComps(subject('40685'), { db: makeDb(seen), rollYear: 2026 });
    t('a real subdivision code is still queried',
      seen.some(([col, val]) => col === 'abs_subdv_cd' && val === '40685'));
    t('and it is bound RAW, not upper-cased — an exact match against the roll',
      seen.filter(([col]) => col === 'abs_subdv_cd').every(([, val]) => val === '40685'));
  }

  {
    // The raw-binding rule matters most where a code could differ by case.
    const seen = [];
    await findComps(subject('sj1172a'), { db: makeDb(seen), rollYear: 2026 });
    t('a lower-case code is bound exactly as the roll stores it',
      seen.some(([col, val]) => col === 'abs_subdv_cd' && val === 'sj1172a'));
  }
}

// ── 6. THE ARITHMETIC THE FILING RESTS ON ────────────────────────────────────
{
  const subject = { ...base, living_area: 2000, appraised_value: 300000, market_value: 300000 };
  const comps = [100, 110, 120, 130, 140].map((psf, i) => ({
    account_number: 'C' + i, living_area: 2000,
    appraised_value: psf * 2000, market_value: psf * 2000,
    homestead_cap_loss: 0, nhs_cap_loss: 0, land_value: 40000, year_built: 2000,
  }));
  const r = evaluateSet(subject, comps);
  t('the median per-square-foot is the middle of the set', r.medianAppraisedPerSqft === 120);
  t('the indicated value is that median times the subject area', r.indicatedAppraised === 240000);
  t('an over-appraised subject is flagged unequal', r.unequalOnAppraised === true);
  t('the requested value never exceeds what is already on the roll',
    r.requestedValue <= subject.appraised_value);
  t('the reduction sought is the difference', r.reductionSought === 60000);
}

console.log(failures.length
  ? `verify-tx-comps: ${failures.length} FAILED, ${pass} passed\n  ✗ ` + failures.join('\n  ✗ ')
  : `verify-tx-comps: ${pass} passed — the (b)(3) engine holds without a database`);
process.exit(failures.length ? 1 : 0);
