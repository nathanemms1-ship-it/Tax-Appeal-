#!/usr/bin/env node
/**
 * ============================================================================
 * VALIDATE THE EQUAL-AND-UNIFORM COMP SELECTOR AGAINST THE REAL ROLL
 * ============================================================================
 *
 *   node scripts/tx/comps-validate.mjs --selftest        no database, pure logic
 *   node scripts/tx/comps-validate.mjs                   every loaded county
 *   node scripts/tx/comps-validate.mjs --cad=123 --sample=500
 *
 * WHAT THIS IS FOR
 *
 * The question the widening ladder exists to answer is not "does the code run".
 * It is: on the 348,453 parcels actually loaded, how often does a defensible
 * comp set exist, and WHERE does the evidence come from when it does? A ladder
 * that silently lands 60% of cases on the county-wide last-resort tier is worse
 * than no ladder, because it manufactures filings nobody can defend while
 * reporting success.
 *
 * So this reports the DISTRIBUTION OF TIERS, not a pass rate. The number to look
 * at is the share resolved at `neighborhood` and `subdivision`. Everything below
 * that is a case we can file but should be slower to sell.
 *
 * IT DRIVES THE PRODUCTION LADDER, NOT A COPY OF IT.
 *
 * lib/tx/comps.js takes an injectable `fetchFn`, and this harness supplies a
 * Postgres-backed one. The stratum order, the band loosening, the similarity
 * ranking and the basis classification exercised here are the exact functions
 * pages/api will call. A harness that reimplemented the loop would only ever
 * validate the reimplementation — which is precisely how the Florida living-area
 * bug survived: it was tuned on Nueces, tested on Nueces, and was 100% wrong on
 * all 42,249 Wichita parcels while exiting 0.
 */

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  findComps, selectComps, evaluateSet, similarity, landShare, bandsFor,
  STRATA, COUNTY_TIER, MIN_COMPS, TARGET_COMPS,
} from '../../lib/tx/comps.js';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);

// ────────────────────────────────────────────────────────────────────────────
// SELF TEST — no database, no network. Runs in CI, runs on a plane.
// ────────────────────────────────────────────────────────────────────────────

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failures++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

function house(over = {}) {
  return {
    account_number: over.account_number ?? 'X',
    living_area: 2000, year_built: 2000, effective_year_built: null,
    appraised_value: 300000, market_value: 300000,
    land_value: 60000, improvement_value: 240000,
    homestead_cap_loss: 0, nhs_cap_loss: 0,
    quality_class: 'B', condition_code: 'A', state_class_code: 'A1',
    ...over,
  };
}

function selfTest() {
  console.log('\nSELF TEST — pure selection and evaluation logic\n');
  const bands = { size: 0.10, age: 15, land: 0.10 };

  // 1. The subject can never be its own comparable.
  {
    const subject = house({ account_number: 'SUBJ' });
    const pool = [subject, ...Array.from({ length: 8 }, (_, i) => house({ account_number: `C${i}` }))];
    const got = selectComps(subject, pool, bands);
    check('subject is excluded from its own comp set',
      got && !got.some((c) => c.account_number === 'SUBJ'));
  }

  // 2. Below MIN_COMPS the answer is null, not a short set.
  {
    const subject = house({ account_number: 'SUBJ' });
    const pool = Array.from({ length: MIN_COMPS - 1 }, (_, i) => house({ account_number: `C${i}` }));
    check(`fewer than ${MIN_COMPS} in band returns null`, selectComps(subject, pool, bands) === null);
  }

  // 3. THE INTEGRITY TEST. Selection must ignore value entirely.
  //
  // Eight cheap houses that are physically wrong for the subject, eight
  // expensive ones that match it exactly. A value-ranked selector takes the
  // cheap ones and produces a much lower median. A similarity-ranked selector
  // takes the matching ones. If this test ever fails, the module has started
  // cherry-picking and every petition built on it is compromised.
  {
    const subject = house({ account_number: 'SUBJ', living_area: 2000, year_built: 2000 });
    const cheapButWrong = Array.from({ length: 8 }, (_, i) => house({
      account_number: `CHEAP${i}`, living_area: 1810 + i, year_built: 1986,
      appraised_value: 90000, market_value: 90000, land_value: 18000,
    }));
    const dearButRight = Array.from({ length: 8 }, (_, i) => house({
      account_number: `MATCH${i}`, living_area: 1995 + i, year_built: 2000,
      appraised_value: 500000, market_value: 500000, land_value: 100000,
    }));
    const got = selectComps(subject, [...cheapButWrong, ...dearButRight], { size: 0.15, age: 20, land: 0.10 });
    const chosenCheap = got.filter((c) => c.account_number.startsWith('CHEAP')).length;
    check('comps are ranked by physical similarity, never by value',
      chosenCheap === 0, `${chosenCheap} of ${got.length} chosen were the cheap mismatched houses`);
  }

  // 4. Basis classification — the cap-artifact detector, all four outcomes.
  {
    const comps = Array.from({ length: 6 }, (_, i) => house({
      account_number: `C${i}`, appraised_value: 200000, market_value: 200000,
    }));

    const clean = evaluateSet(house({ appraised_value: 300000, market_value: 300000 }), comps);
    check('basis=clean when the subject is high on both bases', clean.basis === 'clean', clean.basis);

    // Neighbours capped low, subject uncapped: appraised looks unequal, market does not.
    const cappedComps = comps.map((c) => ({ ...c, appraised_value: 150000, market_value: 300000, homestead_cap_loss: 150000 }));
    const artifact = evaluateSet(house({ appraised_value: 290000, market_value: 290000 }), cappedComps);
    check('basis=cap_artifact when only the capped comparison is unequal',
      artifact.basis === 'cap_artifact', artifact.basis);
    check('cap artifact reports the capped share of the set', artifact.cappedCompShare === 1);

    // Subject capped below comps: over-appraised at market, no dollars available.
    const absorbed = evaluateSet(
      house({ appraised_value: 150000, market_value: 400000, homestead_cap_loss: 250000 }), comps);
    check('basis=cap_absorbed when the subject\'s own cap already holds it below',
      absorbed.basis === 'cap_absorbed', absorbed.basis);

    const none = evaluateSet(house({ appraised_value: 120000, market_value: 120000 }), comps);
    check('basis=none when the subject is at or below the median', none.basis === 'none', none.basis);
  }

  // 5. A protest cannot raise a value. The request is never above the roll.
  {
    const comps = Array.from({ length: 6 }, (_, i) => house({ account_number: `C${i}`, appraised_value: 900000, market_value: 900000 }));
    const r = evaluateSet(house({ appraised_value: 300000, market_value: 300000 }), comps);
    check('requestedValue never exceeds the value already on the roll', r.requestedValue <= 300000);
    check('reductionSought is zero when the comps are higher', r.reductionSought === 0);
  }

  // 6. landShare distinguishes "no land value" from "no value on file".
  {
    check('landShare is 0 for a condo with no land value', landShare(house({ land_value: 0 })) === 0);
    check('landShare is null when there is no market value to divide by',
      landShare(house({ market_value: 0 })) === null);
  }

  // 7. The county tier is allowed only the tightest band set.
  {
    check('county tier permits exactly one band set', bandsFor(COUNTY_TIER.level).length === 1);
    check('stratum tiers permit three band sets', bandsFor('neighborhood').length === 3);
  }

  // 8. Rows missing the fields the comparison needs are dropped, not defaulted.
  {
    const subject = house({ account_number: 'SUBJ' });
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => house({ account_number: `OK${i}` })),
      house({ account_number: 'NOAREA', living_area: 0 }),
      house({ account_number: 'NOVAL', appraised_value: 0 }),
    ];
    const got = selectComps(subject, pool, bands);
    check('rows with no living area or no value are excluded',
      got.length === 5 && !got.some((c) => c.account_number.startsWith('NO')));
  }

  return failures;
}

/**
 * THE LADDER ITSELF, over an in-memory district.
 *
 * The pure tests above cover selection and evaluation. They do not cover the
 * thing this work was commissioned to build — the widening. These do, using the
 * injectable fetcher, so the loop under test is the loop production runs.
 */
async function ladderTest() {
  console.log('\nLADDER TEST — stratum widening over a synthetic district\n');

  const mk = (over) => house({ neighborhood_code: 'N1', abs_subdv_cd: 'S1',
    neighborhood_group: 'G1', market_area_code: 'M1', ...over });

  const district = (counts) => async (subject, stratum) => {
    if (!stratum.column) return Array.from({ length: counts.county ?? 0 }, (_, i) => mk({ account_number: `CO${i}` }));
    if (!subject[stratum.column]) return null;
    const k = { neighborhood_code: 'nbhd', abs_subdv_cd: 'subdv',
      neighborhood_group: 'grp', market_area_code: 'mkt' }[stratum.column];
    return Array.from({ length: counts[k] ?? 0 }, (_, i) => mk({ account_number: `${k}${i}` }));
  };

  // Rich neighbourhood: must stop at tier 1 and never consult anything coarser.
  {
    const r = await findComps(mk({ account_number: 'SUBJ' }),
      { fetchFn: district({ nbhd: 20, subdv: 500 }) });
    check('a rich neighbourhood resolves at tier 1', r.sufficient && r.level === 'neighborhood', r.level);
    check('tier 1 success never queries a coarser stratum', r.attempts.every((a) => a.level === 'neighborhood'));
  }

  // THE JEFFERSON CASE. Neighbourhood too thin, subdivision healthy.
  {
    const r = await findComps(mk({ account_number: 'SUBJ' }),
      { fetchFn: district({ nbhd: 3, subdv: 14 }) });
    check('a thin neighbourhood widens to the subdivision',
      r.sufficient && r.level === 'subdivision', r.level);
    check('the widened result is not sold as high confidence', r.confidence !== 'high', r.confidence);
    check('the widening is disclosed in the attempt trail',
      r.attempts.some((a) => a.level === 'neighborhood' && a.found === 0));
  }

  // A stratum the district does not publish is skipped, not treated as empty.
  {
    const r = await findComps(mk({ account_number: 'SUBJ', neighborhood_code: null, abs_subdv_cd: null }),
      { fetchFn: district({ grp: 9 }) });
    check('unpopulated strata are skipped and recorded as such',
      r.sufficient && r.level === 'neighborhood_group'
      && r.attempts.some((a) => a.skipped === 'not_populated'), r.level);
  }

  // Nothing anywhere: refuse, with the trail intact. No indicated value.
  {
    const r = await findComps(mk({ account_number: 'SUBJ' }), { fetchFn: district({}) });
    check('an empty district refuses rather than degrading', !r.sufficient && r.reason === 'insufficient_comparables');
    check('a refusal carries no indicated value', r.indicatedAppraised === undefined);
  }

  // Subject with no living area cannot be rescued by widening.
  {
    const r = await findComps(mk({ account_number: 'SUBJ', living_area: 0 }),
      { fetchFn: district({ nbhd: 50 }) });
    check('a subject with no living area refuses immediately',
      !r.sufficient && r.reason === 'subject_missing_living_area');
  }

  console.log(`\n${failures === 0 ? '✓ all self tests passed' : `✗ ${failures} self test(s) failed`}\n`);
  return failures;
}

if (has('selftest')) {
  selfTest();
  process.exit((await ladderTest()) ? 1 : 0);
}

// ────────────────────────────────────────────────────────────────────────────
// LIVE RUN
// ────────────────────────────────────────────────────────────────────────────

// Same connection handling as scripts/tx/push.mjs, deliberately duplicated
// rather than refactored — push.mjs is working and loaded production, and this
// is not the moment to touch it.
async function promptSecret(question) {
  if (!process.stdin.isTTY) return null;
  process.stdout.write(question);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  try { return ((await new Promise((res) => rl.question('', res))) || '').trim(); }
  finally { rl.close(); process.stdout.write('\n'); }
}

function urlFromEnvFile() {
  try {
    const txt = readFileSync('.env.local', 'utf8');
    for (const key of ['PGURL', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL']) {
      const m = txt.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]+)`, 'm'));
      if (m && /^postgres(ql)?:\/\//.test(m[1])) return m[1].trim();
    }
  } catch { /* fine */ }
  return null;
}

let url = process.env.PGURL || process.env.DATABASE_URL || urlFromEnvFile();
if (url && !/^postgres(ql)?:\/\//.test(url)) url = null;
if (!url) url = await promptSecret('Paste the connection string (nothing will appear): ');
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('\n✗ No usable connection string. Nothing was sent anywhere.');
  process.exit(2);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url) || process.env.PGSSL === 'disable';
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
await client.connect();

const YEAR = Number(arg('year', 2026));
const SAMPLE = Number(arg('sample', 250));
const CLASS_PREFIX = arg('class', 'A1');

const COLS = `account_number, living_area, year_built, effective_year_built,
  appraised_value, market_value, land_value, improvement_value,
  homestead_cap_loss, nhs_cap_loss, has_homestead, quality_class, condition_code,
  state_class_code, neighborhood_code, abs_subdv_cd, market_area_code,
  neighborhood_group, situs_street, situs_city, situs_zip, arb_protest_flag`;

/** The Postgres-backed candidate fetcher handed to the production ladder. */
function makeFetcher(cadId) {
  return async (subject, stratum, year) => {
    if (stratum.column) {
      const v = subject[stratum.column];
      if (v === null || v === undefined || String(v).trim() === '') return null;
      const { rows } = await client.query(
        `select ${COLS} from tx_parcels
          where cad_id = $1 and tax_year = $2 and state_class_code = $3
            and ${stratum.column} = $4
            and living_area > 0 and appraised_value > 0
          limit 600`,
        [cadId, year, subject.state_class_code, v]);
      return rows;
    }
    const { rows } = await client.query(
      `select ${COLS} from tx_parcels
        where cad_id = $1 and tax_year = $2 and state_class_code = $3
          and living_area > 0 and appraised_value > 0
          and living_area between $4 and $5
        limit 600`,
      [cadId, year, subject.state_class_code,
       subject.living_area * 0.85, subject.living_area * 1.15]);
    return rows;
  };
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

/**
 * WHY DOES THE SUBDIVISION TIER BARELY FIRE?
 *
 * The first live run answered the question it was built to answer and raised a
 * new one: the subdivision fallback caught 3.4% of sets while the county-wide
 * LAST RESORT caught 3.8%. A fallback that is bypassed more often than it is
 * used is not a fallback.
 *
 * The hypothesis this tests: `hood_cd` and `abs_subdv_cd` are correlated, so a
 * parcel whose neighbourhood is too thin sits in a subdivision that is too thin
 * as well, and the ladder falls straight past it to the county.
 *
 * If that holds, the fix is not a better ordering — it is a stratum that is
 * genuinely COARSER than the neighbourhood rather than merely different. PACS
 * hood codes are often hierarchical (Nueces uses G100, G101 ... where the letter
 * is a region), so a truncated hood code may be exactly that stratum, derived
 * from the district's own coding scheme and therefore still defensible. This
 * measures whether that is true before any code is written to rely on it.
 */
async function diagnose(counties) {
  const cls = `${CLASS_PREFIX}%`;
  const base = `from tx_parcels where cad_id = $1 and tax_year = $2
                 and state_class_code like $3 and living_area > 0`;

  for (const { cad_id } of counties) {
    console.log(`\n── CAD ${String(cad_id).padStart(3, '0')}`);

    for (const col of ['neighborhood_code', 'abs_subdv_cd']) {
      const { rows: [r] } = await client.query(
        `with g as (select ${col} k, count(*)::int c ${base} and ${col} is not null group by 1)
         select count(*)::int groups,
                percentile_cont(0.5) within group (order by c) med,
                coalesce(sum(c) filter (where c <= $4), 0)::int thin,
                coalesce(sum(c), 0)::int total
           from g`, [cad_id, YEAR, cls, MIN_COMPS]);
      console.log(`   ${col.padEnd(18)} ${String(r.groups).padStart(6)} groups  median ${String(Math.round(r.med)).padStart(5)} parcels  ${pct(r.thin, r.total)} in a group of ${MIN_COMPS} or fewer`);
    }

    // Does the subdivision actually rescue a thin neighbourhood?
    const { rows: [x] } = await client.query(
      `with hc as (select neighborhood_code k, count(*)::int c ${base} and neighborhood_code is not null group by 1),
            sc as (select abs_subdv_cd k, count(*)::int c ${base} and abs_subdv_cd is not null group by 1)
       select count(*)::int thin_hood,
              count(*) filter (where sc.c > $4)::int rescued
         from tx_parcels p
         join hc on hc.k = p.neighborhood_code
         left join sc on sc.k = p.abs_subdv_cd
        where p.cad_id = $1 and p.tax_year = $2 and p.state_class_code like $3
          and p.living_area > 0 and hc.c <= $4`,
      [cad_id, YEAR, cls, MIN_COMPS]);
    console.log(`   thin-neighbourhood parcels rescued by their subdivision: ${x.rescued}/${x.thin_hood} (${pct(x.rescued, x.thin_hood)})`);

    // Is the hood code hierarchical? Truncate it and see whether the prefixes
    // form strata that are coarser but still local.
    for (const k of [1, 2, 3, 4]) {
      const { rows: [p] } = await client.query(
        `with hc as (select neighborhood_code kk, count(*)::int c ${base} and neighborhood_code is not null group by 1),
              g  as (select left(neighborhood_code, $5) gg, count(*)::int c ${base} and neighborhood_code is not null group by 1)
         select (select count(*) from g)::int groups,
                count(*)::int thin_hood,
                count(*) filter (where g.c > $4)::int rescued
           from tx_parcels p
           join hc on hc.kk = p.neighborhood_code
           join g  on g.gg  = left(p.neighborhood_code, $5)
          where p.cad_id = $1 and p.tax_year = $2 and p.state_class_code like $3
            and p.living_area > 0 and hc.c <= $4`,
        [cad_id, YEAR, cls, MIN_COMPS, k]);
      console.log(`   hood prefix ${k}: ${String(p.groups).padStart(5)} groups  rescues ${pct(p.rescued, p.thin_hood)} of thin-neighbourhood parcels`);
    }
  }

  console.log('\nREAD THIS AS: a prefix length that produces MANY groups and rescues MOST');
  console.log('thin parcels is a real intermediate stratum worth adding to the ladder.');
  console.log('One that collapses to a handful of groups is just the county with extra steps —');
  console.log('do not add it, and leave those parcels on the last-resort tier where the');
  console.log('disclosure tells the customer what they are getting.\n');
}

try {
  const { rows: counties } = await client.query(
    arg('cad')
      ? `select cad_id, count(*)::int n from tx_parcels where tax_year = $1 and cad_id = $2 group by 1`
      : `select cad_id, count(*)::int n from tx_parcels where tax_year = $1 group by 1 order by 1`,
    arg('cad') ? [YEAR, Number(arg('cad'))] : [YEAR]);

  if (!counties.length) {
    console.error(`No tx_parcels rows for tax_year ${YEAR}.`);
    process.exit(1);
  }

  if (has('diagnose')) {
    console.log(`\nSTRATUM DIAGNOSTIC — tax year ${YEAR}, class ${CLASS_PREFIX}*`);
    await diagnose(counties);
    await client.end();
    process.exit(0);
  }

  console.log(`\nEQUAL-AND-UNIFORM COMP VALIDATION — tax year ${YEAR}, class ${CLASS_PREFIX}*`);
  console.log(`Sampling up to ${SAMPLE} subjects per county.\n`);

  const grand = { total: 0, sufficient: 0, tiers: {}, bases: {}, conf: {} };

  for (const { cad_id, n: countyRows } of counties) {
    // How much of each stratum the district actually publishes. A tier that is
    // null for every row is not a fallback, it is a gap — and knowing which
    // districts have which strata is the difference between a ladder and a
    // guess. Wichita publishes no situs_zip at all; assume nothing.
    const { rows: [cov] } = await client.query(
      `select
         count(*)::int                                                 total,
         count(neighborhood_code)::int                                 nbhd,
         count(abs_subdv_cd)::int                                      subdv,
         count(neighborhood_group)::int                                grp,
         count(market_area_code)::int                                  mkt,
         count(*) filter (where living_area > 0)::int                  area
       from tx_parcels
       where cad_id = $1 and tax_year = $2 and state_class_code like $3`,
      [cad_id, YEAR, `${CLASS_PREFIX}%`]);

    // The problem the ladder exists to solve, measured directly: what share of
    // parcels sit in a neighbourhood that cannot yield MIN_COMPS of their own
    // class before any band filter is applied? This is the ceiling on tier 1,
    // and the Jefferson figure that started this work.
    const { rows: [thin] } = await client.query(
      `with sized as (
         select neighborhood_code, count(*)::int c
           from tx_parcels
          where cad_id = $1 and tax_year = $2 and state_class_code like $3
            and neighborhood_code is not null and living_area > 0
          group by 1)
       select coalesce(sum(c) filter (where c <= $4), 0)::int thin,
              coalesce(sum(c), 0)::int                        placed
         from sized`,
      [cad_id, YEAR, `${CLASS_PREFIX}%`, MIN_COMPS]);

    const { rows: subjects } = await client.query(
      `select ${COLS}, cad_id from tx_parcels
        where cad_id = $1 and tax_year = $2 and state_class_code like $3
          and living_area > 0 and appraised_value > 0
        order by md5(account_number)
        limit $4`,
      [cad_id, YEAR, `${CLASS_PREFIX}%`, SAMPLE]);

    const fetchFn = makeFetcher(cad_id);
    const tiers = {}, bases = {}, conf = {};
    let sufficient = 0, viable = 0;

    for (const s of subjects) {
      const r = await findComps(s, { rollYear: YEAR, fetchFn });
      if (!r.sufficient) { tiers[`NONE:${r.reason}`] = (tiers[`NONE:${r.reason}`] || 0) + 1; continue; }
      sufficient++;
      tiers[r.level] = (tiers[r.level] || 0) + 1;
      bases[r.basis] = (bases[r.basis] || 0) + 1;
      grand.tiers[r.level] = (grand.tiers[r.level] || 0) + 1;
      grand.bases[r.basis] = (grand.bases[r.basis] || 0) + 1;

      // CONFIDENCE IS ONLY REPORTED FOR CASES THAT EXIST.
      //
      // The first version of this harness counted confidence across every parcel
      // with a comp set, including the ~half that come out at or below their
      // neighbourhood median and therefore have no case at all. That produced a
      // cheerful "high 1028" which was mostly confidence in the finding that
      // there is nothing to file. Confidence in a non-case is not a meaningful
      // quantity, and reporting it inflated the only number a reader would
      // reach for.
      if (r.basis === 'clean' || r.basis === 'cap_artifact') {
        viable++;
        conf[r.confidence] = (conf[r.confidence] || 0) + 1;
        grand.conf[r.confidence] = (grand.conf[r.confidence] || 0) + 1;
        grand.viable = (grand.viable || 0) + 1;
      }
    }
    grand.total += subjects.length;
    grand.sufficient += sufficient;

    console.log(`── CAD ${String(cad_id).padStart(3, '0')} — ${countyRows.toLocaleString()} parcels, ${subjects.length} sampled`);
    console.log(`   strata published: nbhd ${pct(cov.nbhd, cov.total)}  subdv ${pct(cov.subdv, cov.total)}  group ${pct(cov.grp, cov.total)}  mkt_area ${pct(cov.mkt, cov.total)}`);
    console.log(`   in a neighbourhood too thin for ${MIN_COMPS} same-class parcels: ${pct(thin.thin, thin.placed)}`);
    console.log(`   comp set found: ${sufficient}/${subjects.length} (${pct(sufficient, subjects.length)})`);
    console.log(`   tier:  ${Object.entries(tiers).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  ')}`);
    console.log(`   basis: ${Object.entries(bases).map(([k, v]) => `${k} ${v}`).join('  ')}`);
    console.log(`   FILABLE (clean or cap_artifact): ${viable}/${subjects.length} (${pct(viable, subjects.length)})`);
    console.log(`   conf of those: ${Object.entries(conf).map(([k, v]) => `${k} ${v}`).join('  ')}\n`);
  }

  const strongTiers = (grand.tiers.neighborhood || 0) + (grand.tiers.subdivision || 0);
  console.log('── STATEWIDE (sampled)');
  console.log(`   comp set found: ${grand.sufficient}/${grand.total} (${pct(grand.sufficient, grand.total)})`);
  console.log(`   resolved at a STRONG tier (neighbourhood or subdivision): ${pct(strongTiers, grand.total)}`);
  console.log(`   tier:  ${Object.entries(grand.tiers).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  ')}`);
  console.log(`   basis: ${Object.entries(grand.bases).map(([k, v]) => `${k} ${v}`).join('  ')}`);
  console.log(`   FILABLE: ${grand.viable || 0}/${grand.total} (${pct(grand.viable || 0, grand.total)})`);
  console.log(`   conf of those: ${Object.entries(grand.conf).map(([k, v]) => `${k} ${v}`).join('  ')}`);

  // ~50% of parcels sitting at or below their own neighbourhood median is what
  // a correctly computed median LOOKS like. A large deviation from 50% is
  // evidence the median is wrong, not evidence of a market full of bargains.
  const above = (grand.bases.clean || 0) + (grand.bases.cap_artifact || 0);
  const halfCheck = above / Math.max(1, grand.sufficient);
  console.log(`\n   sanity: ${(halfCheck * 100).toFixed(1)}% of parcels sit ABOVE their comp median.`);
  console.log(`           A correct median puts this near 50%. ${Math.abs(halfCheck - 0.5) < 0.08 ? 'It does.' : '⚠️  IT DOES NOT — check the median before trusting anything above.'}`);

  // The judgement, stated by the script rather than left to the reader.
  const capArtifactShare = (grand.bases.cap_artifact || 0) / Math.max(1, grand.sufficient);
  console.log('');
  if (strongTiers / Math.max(1, grand.total) < 0.6) {
    console.log('⚠️  Fewer than 60% of cases resolve at a strong tier. The ladder is doing');
    console.log('    too much work — check whether abs_subdv_cd is being parsed for these');
    console.log('    districts before accepting the weaker tiers as normal.');
  }
  if (capArtifactShare > 0.25) {
    console.log(`⚠️  ${(capArtifactShare * 100).toFixed(0)}% of viable cases rest on the capped basis only.`);
    console.log('    These are the ones most likely to be rebutted. They must not be sold');
    console.log('    at the same confidence as clean cases.');
  }
} finally {
  await client.end();
}
