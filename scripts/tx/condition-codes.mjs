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
 * A1* only, matching scripts/tx/county-stats.mjs, because the whole product is
 * single-family residential and commercial rows would swamp the medians.
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
if (rawCad === null || !Number.isFinite(cad) || cad <= 0) {
  console.error('usage: node scripts/tx/condition-codes.mjs --cad <code> [--year 2026]');
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
      order by market_value::numeric / nullif(living_area, 0)
    ) as median_psf,
    percentile_cont(0.5) within group (order by market_value::numeric) as median_value,
    percentile_cont(0.5) within group (order by year_built::numeric) as median_year
  from tx_parcels
  where cad_id = $1 and tax_year = $2
    and state_class_code like 'A%'
    and living_area > 0 and market_value > 0
  group by 1
  order by 2 desc
`, [cad, year]);

await client.end();

if (!rows.length) {
  console.error(`✗ no A1 rows for cad ${cad}, tax year ${year}`);
  process.exit(1);
}

const total = rows.reduce((s, r) => s + r.parcels, 0);
const overall = rows.reduce((s, r) => s + Number(r.median_psf) * r.parcels, 0) / total;

console.log(`\n${LOADED_CADS[cad] || 'cad ' + cad} — condition_code on A1 parcels, tax year ${year}`);
console.log(`${total.toLocaleString()} parcels, weighted median $${overall.toFixed(2)}/sqft\n`);
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

console.log(`\n  Spread across codes: ${spreadPct.toFixed(1)}% of the district median.`);
console.log(spreadPct < 10
  ? '  -> FLAT. This district records condition without pricing it, so subtracting\n'
    + '     cost to cure does not double-count. Leave BELOW_AVERAGE_CONDITION empty\n'
    + '     for this cad and say so in lib/tx/costToCure.js.'
  : '  -> VALUES MOVE WITH THE CODE. The district is pricing condition. Add the\n'
    + '     codes below the district median to BELOW_AVERAGE_CONDITION for this cad\n'
    + '     so the packet discloses the overlap.');
console.log('\n  Age is printed because it is the confounder: if the low-$/sqft codes are\n'
  + '  also the oldest houses, some of that gap is age, not condition.\n');
