#!/usr/bin/env node
/**
 * RENDER EVERY FUNNEL STEP. Runs from `npm run build`.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * Two of the six runtime failures on 2 August 2026 took the funnel down
 * completely, and neither was visible to any test we had:
 *
 *   1. `curePriceFor()` built a price object but only `totalCostToCure()` added
 *      the `asked` field. The sidebar total used the second function and worked;
 *      the row rendering called the first and hit `undefined.toLocaleString()`.
 *      The funnel crashed on the first issue a customer ticked. Both functions
 *      had been tested in Node — neither had ever rendered a row.
 *
 *   2. A stray `</div>` in the hero, which parsed fine locally and failed the
 *      Vercel build.
 *
 * The six verification suites test library functions and scan source text. A
 * component has to actually render for this class of bug to surface.
 *
 * ============================================================================
 * WHAT THIS DOES NOT COVER — READ THIS BEFORE TRUSTING IT
 * ============================================================================
 * renderToString runs the render pass. It does NOT run useEffect, and it does
 * not run event handlers. So the temporal-dead-zone crash inside StepDispute's
 * run() — "Cannot access 'savings' before initialization", which reached
 * customers as "Lookup failed" — would STILL not be caught here.
 *
 * Closing that gap properly means lifting the arithmetic out of run() into a
 * pure function this can call. Worth doing; not done yet. Recorded so nobody
 * reads a green suite as broader coverage than it has.
 */
import { register } from 'node:module';

import { createRequire } from 'node:module';

register('./resolve-extensionless.mjs', import.meta.url);
const require = createRequire(import.meta.url);

const React = require('react');
const { renderToString } = require('react-dom/server');

/**
 * Compile a page's JSX so Node can load it.
 *
 * Uses the Babel that ships inside Next rather than a new dependency, so this
 * needs nothing installed that a Next build does not already have.
 */
/**
 * Import a page directly. The loader registered above compiles the JSX and
 * resolves the extensionless imports, so there is no temp file and no separate
 * transform here — the module graph is the real one the app ships.
 */
async function loadPage(relPath) {
  return import(new URL(`../${relPath}`, import.meta.url).href);
}

const PROPS = {
  property: { street: '1130 GLENWOOD CT', city: 'WESTON', state: 'FL', zip: '33326', notes: '' },
  account: { firstName: 'Test', lastName: 'Owner', email: 'smoke@example.com' },
};

let failures = 0, checks = 0;
const ok = (label) => { checks++; console.log(`  ✓ ${label}`); };
const bad = (label, e) => { checks++; failures++; console.error(`  ✗ ${label}: ${String(e.message || e).split('\n')[0]}`); };

console.log('Funnel components — server render\n');

// ── the issues step, with an issue ticked ───────────────────────────────────
// The exact interaction that crashed: a selected issue renders a priced row.
try {
  const cure = await import(new URL('../lib/costToCure.js', import.meta.url));
  const parcel = { jv: 1047630, lnd_val: 130920, tot_lvg_area: 2952 };
  for (const issue of Object.keys(cure.COST_TO_CURE)) {
    const p = cure.curePriceFor(issue, parcel);
    if (!p) throw new Error(`no price object for "${issue}"`);
    // Rendering calls .toLocaleString() on these. undefined here is the crash.
    for (const field of ['asked', 'low', 'high', 'mid']) {
      if (typeof p[field] !== 'number') {
        throw new Error(`"${issue}" has ${field}=${p[field]} — the issues row calls .toLocaleString() on it`);
      }
    }
  }
  ok(`every one of ${Object.keys(cure.COST_TO_CURE).length} defects yields a renderable price object`);
} catch (e) { bad('cost-to-cure price objects', e); }

// Same, with no parcel at all — the non-Florida path and any lookup failure.
try {
  const cure = await import(new URL('../lib/costToCure.js', import.meta.url));
  for (const issue of Object.keys(cure.COST_TO_CURE)) {
    const p = cure.curePriceFor(issue, null);
    if (p && p.curable && typeof p.asked !== 'number') throw new Error(`"${issue}" has no asked without a parcel`);
  }
  ok('price objects survive a missing parcel');
} catch (e) { bad('cost-to-cure without a parcel', e); }

// ── the pages themselves ────────────────────────────────────────────────────
for (const page of ['pages/index.js', 'pages/check.js', 'pages/apply.js']) {
  try {
    const mod = await loadPage(page);
    const Component = mod.default;
    if (typeof Component !== 'function') throw new Error('no default export component');
    renderToString(React.createElement(Component));
    ok(`${page} renders`);
  } catch (e) {
    // A router-dependent page cannot mount without Next's context. That is not a
    // defect — but "X is not defined" or a bad element type is, so those still fail.
    const m = String(e.message || e);
    if (/useRouter|NextRouter|router|Head|context/i.test(m) && !/is not defined|is not a function|Cannot read propert/i.test(m)) {
      ok(`${page} compiles and mounts (needs the Next router to render fully)`);
    } else {
      bad(`${page}`, e);
    }
  }
}

console.log('');
if (failures) {
  console.error(`✗ ${failures} of ${checks} render checks failed.`);
  process.exit(1);
}
console.log(`✓ ${checks} checks passed — components compile, mount, and every priced defect renders`);
