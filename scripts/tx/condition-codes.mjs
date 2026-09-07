#!/usr/bin/env node
/**
 * ============================================================================
 * DOES A ROLL FIELD CARRY SIGNAL? — profile any code column against $/sqft
 * ============================================================================
 *
 *   node scripts/tx/condition-codes.mjs --cad 71
 *   node scripts/tx/condition-codes.mjs --cad 71 --field quality_class
 *
 * Started as a condition_code probe and generalised on the day it was written,
 * because the answer for condition_code turned out to be "the column is empty"
 * and the interesting question moved one column over.
 *
 * WHAT EL PASO ACTUALLY PUBLISHES, established 7 Sept 2026:
 *
 *   condition_code   NOT PUBLISHED. Absent from PACS export layout 8.0.34,
 *                    absent from 2026_Codes (no condition vocabulary at all),
 *                    and absent from the Improvements relational dump, whose
 *                    14 columns carry class and sub-class but no condition.
 *                    100% of 228,190 A1 parcels are null.
 *
 *   quality_class    PUBLISHED AND LOADED. It is `Imprv_det_class_cd` from
 *                    APPRAISAL_IMPROVEMENT_DETAIL, mapped in lib/tx/pacs.js at
 *                    F(76,85) and written by both loaders. EPCAD's own code
 *                    table defines RES CLASS 003 through 013, each with + and -
 *                    grade variants.
 *
 * That matters for lib/tx/comps.js: similarity() applies a flat penalty when
 * quality OR condition codes differ, and NONE when either side is null. Condition
 * is null everywhere, so that half is inert — but quality is populated, so the
 * comp engine is NOT blind to build quality. Whether the penalty does real work
 * depends on how quality_class is distributed, which is what --field answers.
 *
 * WHAT THIS IS FOR
 *
 * lib/tx/costToCure.js will not classify a condition code it has never seen —
 * BELOW_AVERAGE_CONDITION is deliberately empty, because inventing {'P','F'}
 * and calling it below-average is a confident classification of a vocabulary we
 * do not hold. This is how it gets populated: from the roll, not from a guess.
 *
 * BUT THE DISTRIBUTION IS THE LESSER HALF OF THE ANSWER.
 *
 * The gate exists because of a double-count risk: if the district has ALREADY
 * discounted a house for poor condition, subtracting cost to cure again
 * overstates the ask. Knowing which codes exist does not tell us whether the
 * district's VALUES move with them.
 *
 * So this prints median market value per square foot for each code, against the
 * district-wide median. If $/sqft is flat across codes, the district is not
 * pricing condition — it is recording it — and there is no double count to
 * disclose, whatever the codes are called. If it falls monotonically down the
 * codes, the district is pricing it and the low codes belong in the set.
 *
 * That is a measurement, and it beats reading a district's documentation about
 * what it intends to do.
 *
 * ── THE POPULATION MATCHES scripts/tx/county-stats.mjs, AND HAD TO BE FIXED ──
 *
 * `state_class_code like 'A1%'`, taken from that script's own CLASS_PREFIX and
 * overridable with --class for the same reason.
 *
 * The first version of this file filtered `like 'A%'` while its comment claimed
 * it matched county-stats. It did not. Texas PTAD class A covers more than
 * single-family: A2 is mobile homes and A4 is condominium/townhome interests,
 * and both carry $/sqft distributions nothing like A1's. Mixing them in would
 * have moved every median in the table and made the numbers incomparable to the
 * county statistics already published from the A1 population — while the header
 * said otherwise, which is worse than no comment.
 */

import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import pg from 'pg';

register('./../resolve-extensionless.mjs', import.meta.url);

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
} catch { /* checked below */ }

/**
 * Connection resolved exactly the way scripts/tx/push.mjs resolves it — same
 * key order, same .env.local fallback, same SSL rule. push.mjs already works on
 * this machine, so anything that diverges from it is a second way to fail.
 */
function urlFromEnvFile() {
  try {
    const txt = readFileSync('.env.local', 'utf8');
    for (const key of ['PGURL', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL']) {
      const m = txt.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]+)`, 'm'));
      if (m && /^postgres(ql)?:\/\//.test(m[1])) return m[1].trim();
    }
  } catch { /* no .env.local */ }
  return null;
}
const CONN = process.env.PGURL || process.env.DATABASE_URL || urlFromEnvFile();
if (!CONN || !/^postgres(ql)?:\/\//.test(CONN)) {
  console.error('✗ No Postgres connection string found.');
  console.error('  Set PGURL, or add one to .env.local — the same one scripts/tx/push.mjs uses.');
  process.exit(2);
}
const isLocal = /localhost|127\.0\.0\.1|host=\/|^postgres(ql)?:\/\/[^@]*@\//.test(CONN)
  || process.env.PGSSL === 'disable';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
/**
 * `Number(arg('cad'))` alone is not a guard: arg() returns null when the flag is
 * absent and Number(null) is 0, which Number.isFinite accepts. A missing --cad
 * therefore became district 0 and went to the database. Check the raw value.
 */
const rawCad = arg('cad');
const cad = Number(rawCad);
const year = Number(arg('year', '2026'));
const classPrefix = arg('class', 'A1');   // same default as county-stats.mjs

/**
 * Whitelisted, not interpolated freely: this value goes into SQL. Only columns
 * that are code-like are worth profiling this way, so the list is short and
 * explicit rather than a sanitiser someone has to trust.
 */
const PROFILABLE = ['condition_code', 'quality_class', 'state_class_code',
  'neighborhood_code', 'abs_subdv_cd', 'source_format'];
const field = arg('field', 'condition_code');
if (!PROFILABLE.includes(field)) {
  console.error(`✗ --field must be one of: ${PROFILABLE.join(', ')}`);
  process.exit(2);
}
if (rawCad === null || !Number.isFinite(cad) || cad <= 0) {
  console.error('usage: node scripts/tx/condition-codes.mjs --cad <code> [--year 2026] [--class A1] [--field condition_code]');
  process.exit(2);
}

const { LOADED_CADS } = await import('../../lib/tx/coverage.js');

const client = new pg.Client({
  connectionString: CONN,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(`
  select
    coalesce(nullif(trim(${field}), ''), '(none)') as code,
    count(*)::int as parcels,
    percentile_cont(0.5) within group (
      order by (market_value::numeric / nullif(living_area, 0))::double precision
    ) as median_psf,
    percentile_cont(0.5) within group (
      order by year_built::double precision) as median_year
  from tx_parcels
  where cad_id = $1 and tax_year = $2
    and state_class_code like $3
    and living_area > 0 and market_value > 0
  group by 1
  order by 2 desc
`, [cad, year, `${classPrefix}%`]);

if (!rows.length) {
  await client.end();
  console.error(`✗ no ${classPrefix} rows for cad ${cad}, tax year ${year}`);
  process.exit(1);
}

/**
 * THE DISTRICT MEDIAN IS QUERIED, NOT DERIVED FROM THE TABLE ABOVE.
 *
 * The first version computed it as a parcel-weighted mean of the per-code
 * medians and printed it as "weighted median". A weighted average of medians is
 * not a median of anything — it is a different statistic wearing the name — and
 * every "vs district" figure in the table hangs off it. On a distribution with
 * one dominant code it happens to land close, which is exactly what would have
 * kept it from being noticed.
 */
const { rows: [dist] } = await client.query(`
  select
    percentile_cont(0.5) within group (
      order by (market_value::numeric / nullif(living_area, 0))::double precision
    ) as median_psf,
    count(*)::int as parcels
  from tx_parcels
  where cad_id = $1 and tax_year = $2
    and state_class_code like $3
    and living_area > 0 and market_value > 0
`, [cad, year, `${classPrefix}%`]);

// Both queries are done. Without this the pg client keeps the event loop alive
// and the script prints its table and then hangs — it was lost when the two
// queries were merged onto one connection.
await client.end();

const total = dist.parcels;
const overall = Number(dist.median_psf);

console.log(`\n${LOADED_CADS[cad] || 'cad ' + cad} — ${field} on ${classPrefix} parcels, tax year ${year}`);
console.log(`${total.toLocaleString()} parcels, district median $${overall.toFixed(2)}/sqft\n`);
console.log('  code        parcels     share   median $/sqft   vs district   median built');
console.log('  ' + '-'.repeat(74));
for (const r of rows) {
  const psf = Number(r.median_psf);
  const rel = ((psf / overall - 1) * 100);
  console.log(
    '  ' + String(r.code).padEnd(10)
    + String(r.parcels).padStart(9)
    + (((r.parcels / total) * 100).toFixed(1) + '%').padStart(9)
    + ('$' + psf.toFixed(2)).padStart(16)
    + ((rel >= 0 ? '+' : '') + rel.toFixed(1) + '%').padStart(14)
    + String(Math.round(Number(r.median_year) || 0)).padStart(15));
}

/**
 * ============================================================================
 * A ONE-PARCEL CODE IS NOT A FINDING. Added 7 Sept 2026, after a real run.
 * ============================================================================
 *
 * --field quality_class on El Paso returned 67 codes. Six of them cover 99.3%
 * of the county; the other 61 have between 1 and 85 parcels each, and include a
 * single parcel at -94.9% of the district median.
 *
 * Computed over all 67, "spread" came out at 217.3% — a number driven entirely
 * by two rows with n=1. And the recommendation block emitted a 57-code set
 * built from that tail. Neither was a measurement; both were noise given a
 * percentage sign.
 */
const MIN_CODE_PARCELS = 500;
const strong = rows.filter((r) => r.parcels >= MIN_CODE_PARCELS);
const covered = strong.reduce((a, r) => a + r.parcels, 0) / total;

if (!strong.length) {
  console.log(`\n  No code reaches ${MIN_CODE_PARCELS} parcels. Nothing here is measurable.\n`);
  process.exit(0);
}

const spread = Math.max(...strong.map((r) => Number(r.median_psf)))
  - Math.min(...strong.map((r) => Number(r.median_psf)));
const spreadPct = (spread / overall) * 100;

/**
 * A JUDGEMENT THRESHOLD, NOT A FINDING. 10% of the district median is where a
 * per-code difference stops looking like noise and starts looking like a
 * pricing decision. Nothing published supports the exact number — it is here so
 * the script gives an opinion instead of a table, and so the opinion can be
 * argued with rather than inferred from formatting.
 */
const FLAT_THRESHOLD_PCT = 10;

console.log(`\n  ${strong.length} code(s) reach ${MIN_CODE_PARCELS} parcels, covering ${(covered * 100).toFixed(1)}% of the county.`);
console.log(`  Spread across those: ${spreadPct.toFixed(1)}% of the district median.`);

if (spreadPct < FLAT_THRESHOLD_PCT) {
  console.log(`  -> FLAT. ${field} does not track value in this district. Anything keyed on it`);
  console.log('     is recording a label rather than a valuation difference.\n');
} else {
  console.log(`  -> ${field} TRACKS VALUE. The district prices this difference.\n`);

  const placeholders = strong.filter((r) => ['*', '**', '-', '--', '(none)'].includes(r.code));
  for (const ph of placeholders) {
    console.log(`     ⚠️  '${ph.code}' holds ${ph.parcels.toLocaleString()} parcels `
      + `(${((ph.parcels / total) * 100).toFixed(1)}%) at ${(((Number(ph.median_psf) / overall) - 1) * 100).toFixed(1)}%.`);
    console.log('        PACS writes it where nothing is assigned, so it means "not recorded",');
    console.log('        not "this grade". lib/tx/comps.js codeOrNull() collapses it to null so');
    console.log('        similarity() skips the term instead of asserting a difference.\n');
  }

  /**
   * The paste-ready set is emitted for condition_code ONLY.
   *
   * The first version printed it for whatever --field was given, so profiling
   * quality_class produced a 57-code BELOW_AVERAGE_CONDITION suggestion — a
   * constant about condition, populated from a quality column, out of a tail of
   * one-parcel codes. Field-aware in the no-data branch and not in this one.
   */
  if (field === 'condition_code') {
    const candidates = strong.filter((r) => r.code !== '(none)'
      && ((Number(r.median_psf) / overall - 1) * 100) <= -FLAT_THRESHOLD_PCT);
    if (candidates.length) {
      console.log('     Add to BELOW_AVERAGE_CONDITION in lib/tx/costToCure.js:\n');
      console.log(`       ${cad}: new Set([${candidates.map((r) => `'${r.code}'`).join(', ')}]),\n`);
      console.log(`     Codes within ${FLAT_THRESHOLD_PCT}% of the median are left out as noise,`);
      console.log("     '(none)' is excluded by design, and so is any code under "
        + `${MIN_CODE_PARCELS} parcels.`);
    }
  } else {
    console.log(`     ${field} is an input to comp SELECTION, not to the cost-to-cure gate.`);
    console.log('     A real ladder here means lib/tx/comps.js similarity() is discriminating on');
    console.log('     something the district itself prices, which is what makes the penalty worth');
    console.log('     its weight. Nothing to paste — this is a health check, not a config source.');
  }
}

console.log('\n  Age is printed because it is the confounder: if the low-$/sqft codes are');
console.log('  also the oldest houses, some of that gap is age, not condition.\n');
