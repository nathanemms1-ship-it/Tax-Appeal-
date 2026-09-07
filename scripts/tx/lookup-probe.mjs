#!/usr/bin/env node
/**
 * ============================================================================
 * ROUND-TRIP THE ROLL THROUGH THE MATCHER
 * ============================================================================
 *
 *   node scripts/tx/lookup-probe.mjs --cad 71 --sample 200
 *   node scripts/tx/lookup-probe.mjs --cad 71 --address "8023 MARBELLA CREEK AVE"
 *
 * THE TEST THIS EXISTS FOR
 *
 * Take addresses the roll ITSELF contains, feed them back through findParcel,
 * and count what comes out. Every one of them is a house we hold, so the only
 * correct answer is `matched`. Anything else is our matcher failing on data we
 * already own — which is precisely the failure Florida shipped for four weeks
 * and only found by noticing a number that felt wrong.
 *
 * Unit tests cannot find this. lib/dor/addressMatch.js passes its own suite and
 * still returned zero rows for "12612 SW 28TH ST MIRAMAR" because the roll
 * spells it "12612 SW 28 ST". Only real strings from a real district show that.
 *
 * It also exercises the comma-free path for free: situs_street on a PACS roll
 * carries no commas, no city and no state, which is exactly what browser
 * autofill and voice input produce.
 *
 * Reads Supabase credentials from .env.local the way scripts/tx/push.mjs does.
 * No secret passes through a terminal paste.
 */

import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('./../resolve-extensionless.mjs', import.meta.url);

// ── .env.local into process.env, because bare Node is not Next ──────────────
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
} catch { /* fall through to the check below */ }

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('✗ SUPABASE_URL / SUPABASE_SERVICE_KEY not found in .env.local');
  process.exit(2);
}

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
if (rawCad === null || !Number.isFinite(cad) || cad <= 0) {
  console.error('usage: node scripts/tx/lookup-probe.mjs --cad <code> [--sample N] [--address "..."]');
  process.exit(2);
}

const { findParcel, TX_LOOKUP, ROLL_YEAR } = await import('../../lib/tx/parcels.js');
const { LOADED_CADS, isCovered, COVERAGE_AS_OF } = await import('../../lib/tx/coverage.js');
const { getSupabaseAdmin } = await import('../../pages/api/supabase.js');

if (!isCovered(cad)) {
  console.error(`✗ cad ${cad} is not covered. Run: node scripts/tx/county-stats.mjs`);
  process.exit(2);
}
console.log(`\n${LOADED_CADS[cad]} County (cad ${cad}) — roll year ${ROLL_YEAR}, coverage as of ${COVERAGE_AS_OF}`);

// ── single address ──────────────────────────────────────────────────────────
const one = arg('address');
if (one) {
  const r = await findParcel({ street: one, cadId: cad, zip: arg('zip') });
  console.log(`\n  "${one}"\n  -> ${r.status}${r.reason ? ` (${r.reason})` : ''}  nearMisses=${r.nearMisses}`);
  if (r.parcel) {
    const p = r.parcel;
    console.log(`     ${p.situsStreet}, ${p.situsCity} ${p.situsZip}`);
    console.log(`     acct ${p.accountNumber}  ${p.livingArea} sqft  built ${p.yearBuilt}  hood ${p.neighborhoodCode}`);
    console.log(`     market $${(p.marketValue || 0).toLocaleString()}  capped appraised $${(p.appraisedValue || 0).toLocaleString()}`);
    console.log(`     cap loss $${(p.homesteadCapLoss + p.nhsCapLoss).toLocaleString()} <- a protest must clear this before the bill moves`);
  }
  if (r.candidates) r.candidates.forEach((c) => console.log(`     candidate: ${c.full}`));
  process.exit(0);
}

// ── sample round-trip ───────────────────────────────────────────────────────
const n = Number(arg('sample', '200'));
const db = getSupabaseAdmin();
const { data, error } = await db.from('tx_parcels')
  .select('account_number,situs_street,situs_city,situs_zip')
  .eq('cad_id', cad).eq('tax_year', ROLL_YEAR)
  .not('situs_street', 'is', null)
  .limit(n * 3);
if (error) { console.error('✗ sample query failed:', error.message); process.exit(1); }

// Spread the sample across the file rather than taking the first N, which would
// all sit in one neighbourhood and prove nothing about the rest of the county.
const rows = (data || []).filter((r) => (r.situs_street || '').trim());
const step = Math.max(1, Math.floor(rows.length / n));
const sample = rows.filter((_, i) => i % step === 0).slice(0, n);

console.log(`  round-tripping ${sample.length} real situs addresses back through findParcel\n`);
const tally = {}; const misses = [];
for (const r of sample) {
  const out = await findParcel({ street: r.situs_street, cadId: cad });
  tally[out.status] = (tally[out.status] || 0) + 1;
  if (out.status !== TX_LOOKUP.MATCHED) {
    misses.push({ street: r.situs_street, status: out.status, near: out.nearMisses, reason: out.reason });
  } else if (out.parcel.accountNumber !== r.account_number) {
    tally.WRONG_PARCEL = (tally.WRONG_PARCEL || 0) + 1;
    misses.push({ street: r.situs_street, status: 'WRONG_PARCEL', near: out.nearMisses });
  }
}

const pct = (v) => `${((v / sample.length) * 100).toFixed(1)}%`;
console.log('  RESULT');
Object.entries(tally).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`    ${String(v).padStart(5)}  ${pct(v).padStart(6)}  ${k}`));

if (misses.length) {
  console.log(`\n  first ${Math.min(12, misses.length)} non-matches — these are OUR failures on data we hold:`);
  misses.slice(0, 12).forEach((m) =>
    console.log(`    ${m.status}${m.reason ? '/' + m.reason : ''}  near=${m.near}  "${m.street}"`));
}
console.log(`\n  A roll address that does not round-trip is a matcher bug, not a missing house.\n`);
