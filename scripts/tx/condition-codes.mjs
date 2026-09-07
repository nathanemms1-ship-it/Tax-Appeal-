#!/usr/bin/env node
/**
 * ============================================================================
 * DOES THIS DISTRICT ACTUALLY DISCOUNT FOR CONDITION?
 * ============================================================================
 *
 *   node scripts/tx/condition-codes.mjs --cad 71
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
if (rawCad === null || !Number.isFinite(cad) || cad <= 0) {
  console.error('usage: node scripts/tx/condition-codes.mjs --cad <code> [--year 2026] [--class A1]');
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
    coalesce(nullif(trim(condition_code), ''), '(none)') as code,
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

console.log(`\n${LOADED_CADS[cad] || 'cad ' + cad} — condition_code on ${classPrefix} parcels, tax year ${year}`);
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

const spread = Math.max(...rows.map((r) => Number(r.median_psf)))
  - Math.min(...rows.map((r) => Number(r.median_psf)));
const spreadPct = (spread / overall) * 100;

/**
 * A JUDGEMENT THRESHOLD, NOT A FINDING. 10% of the district median is where a
 * per-code difference stops looking like noise and starts looking like a
 * pricing decision. Nothing published supports the exact number — it is here so
 * the script gives an opinion instead of a table, and so the opinion can be
 * argued with rather than inferred from formatting.
 */
const FLAT_THRESHOLD_PCT = 10;

/**
 * NO DATA IS NOT FLATNESS, AND SAYING SO WAS THE POINT OF RUNNING IT.
 *
 * El Paso came back as a single row: '(none)', 228,190 parcels, 100.0%. The
 * flat/not-flat branch below read that as "the district records condition
 * without pricing it" — a confident conclusion about a column that is entirely
 * empty. Of course the spread is 0.0%: there is one row.
 *
 * The cause is upstream of the district. PACS export layout 8.0.34 has no
 * condition field and no effective-year field anywhere in it —
 * APPRAISAL_IMPROVEMENT_DETAIL carries 12 fields and none of them is condition
 * — and scripts/tx/push.mjs's COLS never writes either column. The schema
 * declares them; nothing has ever populated them. Condition lives in the
 * district's internal PACS database, not in what it publishes.
 *
 * So this is a data-acquisition finding, not a valuation one, and it must not
 * be reported as the latter.
 */
const onlyNone = rows.length === 1 && rows[0].code === '(none)';
const noneShare = (rows.find((r) => r.code === '(none)')?.parcels || 0) / total;

if (onlyNone || noneShare > 0.98) {
  console.log(`\n  NO CONDITION DATA. ${(noneShare * 100).toFixed(1)}% of parcels carry no condition_code.`);
  console.log('  This is not a finding about how the district values condition — it is the');
  console.log('  absence of the field. PACS export layout 8.0.34 has no condition column, and');
  console.log('  scripts/tx/push.mjs never writes one.\n');
  console.log('  CONSEQUENCES, worth knowing before trusting a comp set:');
  console.log('   - lib/tx/comps.js similarity() adds a condition penalty only when BOTH sides');
  console.log('     are non-null, so it is inert for every Texas comparison.');
  console.log('   - ageYear() falls back to year_built for subject and comps alike. Consistent,');
  console.log('     so no asymmetry — but the district\'s own effective age is not being used.');
  console.log('   - the double-count gate in lib/tx/costToCure.js cannot fire, which is correct:');
  console.log('     BELOW_AVERAGE_CONDITION stays empty because there is nothing to classify.\n');
  console.log('  To change that you need a data source the export does not carry — the Mass');
  console.log('  Appraisal Report, or a direct request to the district.\n');
  process.exit(0);
}

console.log(`\n  Spread across codes: ${spreadPct.toFixed(1)}% of the district median.`);
console.log(spreadPct < FLAT_THRESHOLD_PCT
  ? '  -> FLAT. This district records condition without pricing it, so subtracting\n'
    + '     cost to cure does not double-count. Leave BELOW_AVERAGE_CONDITION empty\n'
    + '     for this cad and say so in lib/tx/costToCure.js.'
  : '  -> VALUES MOVE WITH THE CODE. The district is pricing condition.');

if (spreadPct >= FLAT_THRESHOLD_PCT) {
  /**
   * "Codes below the district median" was the first version of this advice and
   * it was wrong twice.
   *
   * It would have swept in '(none)' — but conditionDiscountRisk() treats an
   * absent condition_code as NOT_BELOW_AVERAGE on purpose: a district that
   * publishes no condition for a parcel cannot have discounted it for one.
   * Putting '(none)' in the set would contradict the module it is populating.
   *
   * And "below the median" includes codes a percent or two under it, which is
   * noise. The same threshold that decided the district prices condition at all
   * is the one that should decide which codes carry it.
   */
  const candidates = rows.filter((r) => r.code !== '(none)'
    && ((Number(r.median_psf) / overall - 1) * 100) <= -FLAT_THRESHOLD_PCT);
  if (candidates.length) {
    console.log('\n     Add to BELOW_AVERAGE_CONDITION in lib/tx/costToCure.js:\n');
    console.log(`       ${cad}: new Set([${candidates.map((r) => `'${r.code}'`).join(', ')}]),\n`);
    console.log('     Codes within ' + FLAT_THRESHOLD_PCT + '% of the median are left out as noise,');
    console.log("     and '(none)' is excluded by design — a parcel the district publishes no");
    console.log('     condition for cannot have been discounted for one.');
  } else {
    console.log('\n     ...but no single code sits more than ' + FLAT_THRESHOLD_PCT
      + '% below the median, so the spread is\n     coming from the tails. Leave the set empty and look again with --class.');
  }
}
console.log('\n  Age is printed because it is the confounder: if the low-$/sqft codes are\n'
  + '  also the oldest houses, some of that gap is age, not condition.\n');
