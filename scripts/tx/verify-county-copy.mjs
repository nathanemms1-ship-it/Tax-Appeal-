#!/usr/bin/env node
/**
 * ============================================================================
 * ARE THE COUNTY PAGES ACTUALLY DIFFERENT FROM ONE ANOTHER?
 * ============================================================================
 *   node scripts/tx/verify-county-copy.mjs
 *   node scripts/tx/verify-county-copy.mjs --show   print the prose per county
 *
 * Run this after every county-stats.mjs run, before committing.
 *
 * WHY THIS EXISTS
 *
 * The first version of components/CountyRollFacts.js banded one number into
 * three buckets and returned a sentence per bucket. Against the five loaded
 * counties, FOUR produced a word-for-word identical paragraph. The stat row
 * differed; everything under it was boilerplate.
 *
 * That is exactly the scaled-content pattern Google's spam policy describes, and
 * it is invisible in review — each page looks fine on its own. It only shows up
 * when you diff two of them, which nobody does by hand across 254 pages.
 *
 * So this asserts the property directly: strip the county name and every number
 * out of the generated prose, and no two counties may be left with the same
 * text. Names and numbers are removed precisely because they are the things that
 * disguise a template — "Nueces ... 12.3%" and "Wichita ... 12.2%" look different
 * to a human skimming and identical to a duplicate-content classifier.
 *
 * A collision is not automatically fatal. Two counties genuinely alike on every
 * measured axis SHOULD read alike, and at 254 counties some pairs will. What must
 * not happen is a collision the copy could have avoided — which is why this
 * prints the colliding pairs and the axes they matched on, rather than just a
 * count. If a pair collides, the fix is another axis, not another synonym.
 */

import { readFileSync } from 'node:fs';
import { COUNTY_CODES } from '../../lib/tx/counties.js';

const STATS = 'lib/tx/countyStats.json';
const COMPONENT = 'components/CountyRollFacts.js';

const nameFor = Object.fromEntries(Object.entries(COUNTY_CODES).map(([n, c]) => [String(c), n]));

let stats, src;
try { stats = JSON.parse(readFileSync(STATS, 'utf8')); }
catch { console.error(`✗ Could not read ${STATS}. Run scripts/tx/county-stats.mjs first.`); process.exit(2); }
try { src = readFileSync(COMPONENT, 'utf8'); }
catch { console.error(`✗ Could not read ${COMPONENT}.`); process.exit(2); }

// Lift the pure clause builders straight out of the component, so this tests the
// SHIPPING copy rather than a second copy of it that can drift.
const from = src.indexOf('function dispersionClause');
const to = src.indexOf('export default');
if (from < 0 || to < 0) {
  console.error('✗ Could not locate the clause builders in the component. Did they get renamed?');
  process.exit(2);
}
const build = new Function(
  src.slice(from, to) +
  '; return { dispersionClause, stockClause, capClause, granularityClause };')();

const counties = Object.entries(stats.counties || {});
if (!counties.length) {
  console.log('\nNo counties in countyStats.json — nothing renders, nothing to check.\n');
  process.exit(0);
}

const AXES = ['dispersion', 'stock', 'cap', 'grain'];
const rows = counties.map(([cad, s]) => {
  const n = nameFor[cad] || `CAD ${cad}`;
  const clauses = {
    dispersion: build.dispersionClause(s.valueDispersion, n),
    stock: build.stockClause(s.medianYearBuilt, n, s.taxYear),
    cap: build.capClause(s.cappedPct, n),
    grain: build.granularityClause(s.parcels, s.neighborhoods, n),
  };
  // Remove the county name and every numeral. What survives is the template.
  const skeleton = (t) => (t || '').split(n).join('«C»').replace(/[\d][\d.,]*/g, '#');
  return { cad, name: n, s, clauses, skeletons: Object.fromEntries(AXES.map((a) => [a, skeleton(clauses[a])])),
           signature: AXES.map((a) => skeleton(clauses[a])).join(' ¶ ') };
});

if (process.argv.includes('--show')) {
  for (const r of rows) {
    console.log(`\n${'═'.repeat(78)}\n  ${r.name.toUpperCase()} COUNTY (cad ${r.cad})\n${'═'.repeat(78)}`);
    for (const a of AXES) if (r.clauses[a]) console.log(`\n${r.clauses[a]}`);
  }
  console.log('');
}

const groups = new Map();
for (const r of rows) {
  if (!groups.has(r.signature)) groups.set(r.signature, []);
  groups.get(r.signature).push(r);
}
const collisions = [...groups.values()].filter((g) => g.length > 1);

console.log(`\nCOUNTY COPY UNIQUENESS — ${rows.length} counties with roll data\n`);

if (!collisions.length) {
  console.log(`  ✓ all ${rows.length} counties produce distinct copy\n`);
} else {
  const affected = collisions.reduce((a, g) => a + g.length, 0);
  console.log(`  ✗ ${affected} counties across ${collisions.length} group(s) share identical copy:\n`);
  for (const g of collisions) {
    console.log(`    ${g.map((r) => r.name).join(' = ')}`);
    console.log(`      matched on all of: ${AXES.join(', ')}`);
    for (const r of g) {
      console.log(`      ${r.name.padEnd(12)} dispersion ${String(r.s.valueDispersion).padStart(5)}  ` +
        `built ${r.s.medianYearBuilt}  capped ${String(r.s.cappedPct).padStart(5)}%  ` +
        `${(r.s.parcels / r.s.neighborhoods).toFixed(0).padStart(4)} homes/neighbourhood`);
    }
    console.log('');
  }
  console.log('  Add an axis that separates these counties, or narrow a band. Do not');
  console.log('  reword an existing clause — that hides the collision without fixing it.\n');
}

// A partial collision is the early warning: these pairs are one band-change away
// from being identical, and at 254 counties they are where the next failure comes
// from.
let near = 0;
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const shared = AXES.filter((a) => rows[i].skeletons[a] === rows[j].skeletons[a]);
    if (shared.length === AXES.length - 1) {
      if (near === 0) console.log('  Near-collisions — separated by a single axis:\n');
      near++;
      const differs = AXES.find((a) => rows[i].skeletons[a] !== rows[j].skeletons[a]);
      console.log(`    ${rows[i].name} / ${rows[j].name} — differ only on "${differs}"`);
    }
  }
}
if (near) console.log(`\n  ${near} pair(s). Not a failure. Worth knowing before 249 more counties load.\n`);

process.exit(collisions.length ? 1 : 0);
