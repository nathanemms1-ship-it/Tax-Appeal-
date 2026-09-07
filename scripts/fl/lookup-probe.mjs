#!/usr/bin/env node
/**
 * ============================================================================
 * ROUND-TRIP THE FLORIDA ROLL THROUGH THE MATCHER
 * ============================================================================
 *
 *   node scripts/fl/lookup-probe.mjs --sample 300
 *   node scripts/fl/lookup-probe.mjs --county 16 --sample 200
 *   node scripts/fl/lookup-probe.mjs --address "12612 SW 28 ST"
 *
 * THE TEST THIS EXISTS FOR
 *
 * The Texas twin (scripts/tx/lookup-probe.mjs) found two matcher bugs on
 * 7 Sept 2026 in one run. The first is in SHARED code:
 *
 *   normalizeAddr applies SUFFIXES to EVERY word, and SUFFIXES holds COURT,
 *   COVE, POINT, NORTH and WEST. "VOYAGER COVE DR" becomes "VOYAGER CV DR",
 *   the ILIKE runs against the roll's RAW text, and the query returns nothing.
 *   9 of 200 El Paso addresses -- houses in our own database -- came back as
 *   "we have no record of this address".
 *
 * lib/dor/addressMatch.js names that exact hazard in its own comments --
 * "KINGS LANDING DR would become KINGS LNDG DR and stop matching a roll that
 * spells the name out" -- as the reason TERMINAL_SUFFIXES exists. Those five
 * words are in the wrong table, and Florida uses the same function.
 *
 * SO FLORIDA MAY BE LOSING THE SAME ADDRESSES, TODAY, FOR PAYING CUSTOMERS.
 * It was not fixed on the strength of a Texas measurement, because changing
 * live matching on an inference is how the ZIP hard filter shipped. This
 * measures it instead.
 *
 * Every address sampled is a house the DOR roll HOLDS. The only correct answer
 * is a match. Anything else is our matcher failing on data we already own.
 */

import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('./../resolve-extensionless.mjs', import.meta.url);

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
} catch { /* checked below */ }

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('✗ SUPABASE_URL / SUPABASE_SERVICE_KEY not found in .env.local');
  process.exit(2);
}

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};

const { findParcel } = await import('../../lib/dor/parcels.js');
const { normalizeAddr } = await import('../../lib/dor/addressMatch.js');
const { getSupabaseAdmin } = await import('../../pages/api/supabase.js');

const one = arg('address');
if (one) {
  const r = await findParcel({ street: one, zip: arg('zip'), city: arg('city') });
  if (!r) console.log('\n  -> null (no database, or the address normalised to nothing)\n');
  else if (r.lookupFailed) console.log(`\n  -> lookup_failed: ${r.error}\n`);
  else if (r.noMatch) console.log(`\n  -> no match. nearMisses=${r.nearMisses}\n`);
  else if (r.ambiguous) {
    console.log(`\n  -> ambiguous, ${r.candidates.length} candidates`);
    r.candidates.forEach((c) => console.log(`     ${c.full}`));
    console.log('');
  } else {
    console.log(`\n  -> matched  parcel ${r.parcel_id}, county ${r.co_no}`);
    console.log(`     ${r.phy_addr1}, ${r.phy_city} ${r.phy_zipcd}\n`);
  }
  process.exit(0);
}

const n = Number(arg('sample', '300'));
const county = arg('county');
const db = getSupabaseAdmin();

let q = db.from('parcels')
  .select('co_no,parcel_id,phy_addr1,phy_city,phy_zipcd')
  .not('phy_addr1', 'is', null);
if (county) q = q.eq('co_no', Number(county));

const { data, error } = await q.limit(n * 4);
if (error) { console.error('✗ sample query failed:', error.message); process.exit(1); }

// Spread the sample rather than taking the first N, which would sit in one
// county and one alphabetical slice of one street list and prove nothing.
const rows = (data || []).filter((r) => (r.phy_addr1 || '').trim());
const step = Math.max(1, Math.floor(rows.length / n));
const sample = rows.filter((_, i) => i % step === 0).slice(0, n);

/** Same rule as the Texas probe: a roll row with nothing to match on is not a score against us. */
const isDegenerate = (street) => {
  const t = String(street || '').trim();
  if (!t) return true;
  const parts = t.split(/\s+/);
  if (parts.length < 2) return true;
  if (!/\d/.test(t)) return true;
  if (!parts.slice(1).some((w) => /[A-Z]/i.test(w))) return true;
  return false;
};

/**
 * THE SUFFIX QUESTION, ANSWERED SEPARATELY FROM THE OVERALL SCORE.
 *
 * A row is flagged when the every-word rewrite changes its spelling — i.e. it
 * contains COURT, COVE, POINT, NORTH, WEST or another interior SUFFIXES key.
 * Those are the rows the Texas bug hit. Reporting them apart from the overall
 * rate is what turns "Florida is probably affected" into a number.
 */
const suffixAffected = (street) =>
  normalizeAddr(street) !== normalizeAddr(street, { interiorSuffixes: false });

console.log(`\nFlorida DOR roll${county ? ` — county ${county}` : ''}`);
console.log(`  round-tripping ${sample.length} real PHY_ADDR1 values back through findParcel\n`);

const tally = {}; const misses = []; const degenerate = []; const suffixRows = [];
const bump = (k) => { tally[k] = (tally[k] || 0) + 1; };

for (const r of sample) {
  const bad = isDegenerate(r.phy_addr1);
  const suffix = suffixAffected(r.phy_addr1);
  const out = await findParcel({ street: r.phy_addr1, zip: r.phy_zipcd });

  let status;
  if (!out) status = 'null_returned';
  else if (out.lookupFailed) status = 'lookup_failed';
  else if (out.noMatch) status = out.nearMisses > 0 ? 'no_parcel_near_miss' : 'no_parcel';
  else if (out.ambiguous) status = 'ambiguous';
  else if (out.parcel_id !== r.parcel_id) status = 'WRONG_PARCEL';
  else status = 'matched';

  bump(status);
  if (bad) degenerate.push({ street: r.phy_addr1, status });
  if (suffix) suffixRows.push({ street: r.phy_addr1, status });
  if (status !== 'matched' && !bad) {
    misses.push({ street: r.phy_addr1, zip: r.phy_zipcd, status,
      near: out && out.nearMisses != null ? out.nearMisses : '-' });
  }
}

const pct = (v, d = sample.length) => `${((v / d) * 100).toFixed(1)}%`;
console.log('  RESULT');
Object.entries(tally).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`    ${String(v).padStart(5)}  ${pct(v).padStart(6)}  ${k}`));

const scoreable = sample.length - degenerate.length;
const matched = tally.matched || 0;
if (degenerate.length) {
  console.log(`\n  ${degenerate.length} row(s) carry no usable address — a coverage gap in the roll,`);
  console.log('  not a matcher score. Nobody can find these by address, the owner included.');
  console.log(`  On the ${scoreable} rows that have one: ${matched}/${scoreable} (${pct(matched, scoreable)}) matched.`);
}

// ── THE QUESTION THIS SCRIPT WAS WRITTEN TO ANSWER ──────────────────────────
if (suffixRows.length) {
  const failed = suffixRows.filter((r) => r.status !== 'matched');
  console.log('\n  INTERIOR SUFFIX WORDS (COURT / COVE / POINT / NORTH / WEST ...)');
  console.log(`    ${suffixRows.length} of ${sample.length} sampled addresses contain one (${pct(suffixRows.length)}).`);
  console.log(`    ${failed.length} of those do not round-trip.`);
  if (failed.length) {
    console.log('\n    FLORIDA IS LOSING THIS CLASS OF ADDRESS. The fix is already written and');
    console.log('    opt-in: normalizeAddr(s, { interiorSuffixes: false }), the same one');
    console.log('    lib/tx/parcels.js uses. Failures:');
    failed.slice(0, 12).forEach((f) => console.log(`      ${f.status}  "${f.street}"`));
  } else {
    console.log('    All of them round-trip. Florida is NOT affected — the DOR roll must already');
    console.log('    store these abbreviated. Leave lib/dor/parcels.js alone.');
  }
} else {
  console.log('\n  No sampled address contained an interior suffix word — the sample is too');
  console.log('  small or too narrow to answer the question. Re-run with a larger --sample.');
}

if (misses.length) {
  console.log(`\n  first ${Math.min(12, misses.length)} real non-matches — OUR failures on data we hold:`);
  misses.slice(0, 12).forEach((m) =>
    console.log(`    ${m.status}  near=${m.near}  "${m.street}"  ${m.zip || ''}`));
} else {
  console.log('\n  No well-formed roll address failed to round-trip.');
}
console.log('');
