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
  .order('checked_on', { ascending: true })
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
const nearMiss = byOutcome.no_parcel_near_miss || 0;
const trueMiss = byOutcome.no_parcel || 0;
const pct = (v, d = total) => `${((v / d) * 100).toFixed(1)}%`;

/**
 * `--since` does not widen a window the table does not have. check_events was
 * added 21 Aug 2026, so asking for January silently returns three weeks and
 * prints a rate over the wrong denominator unless the real span is stated.
 */
const firstDay = String(data[0].checked_on);
const lastDay = String(data[data.length - 1].checked_on);

console.log(`\nFlorida /check outcomes — ${total.toLocaleString()} checks, ${firstDay} to ${lastDay}`);
if (firstDay > since) {
  console.log(`  (asked for ${since}; check_events only goes back to ${firstDay})`);
}
console.log('');
Object.entries(byOutcome).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`  ${String(v).padStart(7)}  ${pct(v).padStart(6)}  ${k.padEnd(24)}${LOST.has(k) ? ' <- told them we have no record' : ''}`));

console.log(`\n  ${lost.toLocaleString()} lookups (${pct(lost)}) were answered "we have no record for this address".`);
console.log('  THAT IS NOT ONE NUMBER. The two outcomes have different causes and different fixes:\n');

console.log(`    ${String(nearMiss).padStart(6)}  ${pct(nearMiss).padStart(6)}  no_parcel_near_miss  — the roll HELD the property and we`);
console.log('                            rejected it. This is a matcher failure and the');
console.log('                            interior-suffix bug is a strong candidate for it.');
console.log(`    ${String(trueMiss).padStart(6)}  ${pct(trueMiss).padStart(6)}  no_parcel            — ZERO rows retrieved. Mostly a property`);
console.log('                            that is not on the Florida roll at all.\n');

/**
 * ============================================================================
 * THE PROBE'S 13-of-13 DOES NOT TRANSFER TO REAL TRAFFIC. Corrected 7 Sept 2026.
 * ============================================================================
 * The first version of this script said "EVERY result in those two outcomes was
 * the interior-suffix bug". That was measured on addresses lifted OUT OF THE
 * ROLL — every one a house we hold, so every failure had to be ours.
 *
 * Real visitors are a different population. The mix proves it: the probe hit
 * 9 no_parcel to 4 near-miss, roughly 2:1. Production runs about 9.5:1. A true
 * no_parcel retrieves nothing at all, which is what an address NOT ON THIS ROLL
 * looks like — an out-of-state visitor, or a county we have not loaded.
 *
 * pages/api/check.js documents exactly that path: the out-of-state branch keys
 * off the ZIP, ZIP is optional, so a Texan who omits it falls through to the
 * Florida roll, misses, and is told we have no record of their property. It is
 * a stated trade-off, not an accident — and this is what it costs.
 *
 * So the near-miss count is the defensible matcher-failure figure. The
 * no_parcel count is mostly a ROUTING and CAPTURE problem, which is a bigger
 * number and a different fix: the state picker, and an email box instead of a
 * dead end.
 */
console.log('  The near-miss line is the defensible matcher-failure figure. The no_parcel line');
console.log('  is mostly routing: pages/api/check.js answers out-of-state on the ZIP, the ZIP is');
console.log('  optional, and a visitor who omits it falls through to the Florida roll and is told');
console.log('  their house does not exist. That is a capture problem, not a lookup problem.\n');

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
