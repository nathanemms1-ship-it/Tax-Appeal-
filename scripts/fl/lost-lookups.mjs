#!/usr/bin/env node
/**
 * ============================================================================
 * HOW MANY FLORIDA LOOKUPS DID THE SUFFIX BUG COST US?
 * ============================================================================
 *
 *   node scripts/fl/lost-lookups.mjs
 *   node scripts/fl/lost-lookups.mjs --since 2026-01-01
 *
 * WHY THIS IS COUNTABLE RATHER THAN GUESSABLE
 *
 * check_events records the outcome of every /check, and nothing purges it — the
 * 400-day delete in scripts/sql/check_events.sql is commented out. So the volume
 * of "we have no record of this address" answers is a fact we already hold.
 *
 * WHAT THE SAMPLE SAYS ABOUT WHAT SHARE WAS THE BUG
 *
 * scripts/fl/lookup-probe.mjs, 300 real roll addresses, BEFORE the fix:
 *
 *     281  matched
 *       9  no_parcel               \  all 13 of these were
 *       4  no_parcel_near_miss     /  interior-suffix failures
 *       6  ambiguous               (duplicates and unit buildings, not the bug)
 *
 * Every single no_parcel and no_parcel_near_miss in that sample was the suffix
 * bug. AFTER the fix, the same probe returned 299/300 matched and zero of
 * either. So for Florida this season, that pair of outcomes is a close proxy for
 * lookups the bug cost us.
 *
 * ⚠️ ONE 300-ROW SAMPLE. 13 of 13 is a strong signal, not a proven rate, and the
 * true share is certainly below 100% — some genuine misses exist (a house not on
 * the roll, a typo). Treat the count below as an UPPER BOUND on lookups lost to
 * this cause, and the ambiguous bucket as unaffected.
 *
 * WHAT IT IS NOT
 *
 * It is not a revenue number. We do not know what share of a successful lookup
 * converts to an $89 order, and multiplying by a made-up rate would turn a
 * measurement into a story. The count is what we know; the conversion is what
 * Nathan knows.
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

const { getSupabaseAdmin } = await import('../../pages/api/supabase.js');
const { OUTCOMES, outcomeLabel } = await import('../../lib/checkOutcomes.js');

const since = arg('since', '2026-01-01');
const db = getSupabaseAdmin();

const { data, error } = await db.from('check_events')
  .select('outcome,checked_on,county,source')
  .gte('checked_on', since)
  .limit(200000);

if (error) { console.error('✗ query failed:', error.message); process.exit(1); }
if (!data || !data.length) {
  console.error(`✗ no check_events on or after ${since}`);
  process.exit(1);
}

const LOST = new Set(['no_parcel', 'no_parcel_near_miss']);

const byOutcome = {};
const byMonth = {};
const byCounty = {};
for (const r of data) {
  byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
  if (!LOST.has(r.outcome)) continue;
  const mo = String(r.checked_on).slice(0, 7);
  byMonth[mo] = (byMonth[mo] || 0) + 1;
  const c = r.county || '(county not recorded)';
  byCounty[c] = (byCounty[c] || 0) + 1;
}

const total = data.length;
const lost = [...LOST].reduce((a, k) => a + (byOutcome[k] || 0), 0);
const pct = (v, d = total) => `${((v / d) * 100).toFixed(1)}%`;

console.log(`\nFlorida /check outcomes since ${since} — ${total.toLocaleString()} checks\n`);
Object.entries(byOutcome).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`  ${String(v).padStart(7)}  ${pct(v).padStart(6)}  ${k.padEnd(24)}${LOST.has(k) ? ' <- told them we have no record' : ''}`));

console.log(`\n  ${lost.toLocaleString()} lookups (${pct(lost)}) were answered "we have no record for this address".`);
console.log('  In a 300-row probe of the roll taken before the fix, EVERY result in those two');
console.log('  outcomes was the interior-suffix bug. Read this as an upper bound on what the');
console.log('  bug cost, not as a proven rate — one sample, and genuine misses do exist.\n');

if (Object.keys(byMonth).length) {
  console.log('  BY MONTH');
  Object.entries(byMonth).sort().forEach(([m, v]) =>
    console.log(`    ${m}  ${String(v).padStart(6)}  ${'█'.repeat(Math.min(50, Math.round(v / Math.max(1, Math.max(...Object.values(byMonth))) * 50)))}`));
}

const counties = Object.entries(byCounty).sort((a, b) => b[1] - a[1]).slice(0, 12);
if (counties.length) {
  console.log('\n  WHERE (top 12) — county is read off the roll rows retrieved, so it is only');
  console.log('  present for near misses; a true no_parcel has no rows to read it from.');
  counties.forEach(([c, v]) => console.log(`    ${String(v).padStart(6)}  ${c}`));
}

console.log('\n  This is a COUNT OF LOOKUPS, not revenue. What share of a successful lookup');
console.log('  becomes an $89 order is Nathan\'s number, not one this script should invent.\n');
