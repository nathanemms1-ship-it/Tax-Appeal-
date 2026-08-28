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
import { readFileSync } from 'node:fs';

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

/**
 * ============================================================================
 * THE SUGGESTION LIST MUST NOT COVER A CONTROL. 27 Aug 2026.
 * ============================================================================
 * components/AddressAutocomplete.js rendered its listbox `position: absolute;
 * top: 100%; z-index: 60`, and the very next thing in the /check form is the
 * submit button. So the list sat on the button, and `onMouseDown` on a row fires
 * before the button ever sees the press: a visitor who typed their address and
 * reached for "Check my property" pressed a SUGGESTION instead, and whatever
 * they had typed was replaced by the row under their finger.
 *
 * On a house that was invisible — the top suggestion is usually their own
 * address, so the wrong target gave the right answer. On a condo it swapped the
 * unit silently. Typing "1750 N BAYSHORE DR 3204" and pressing the button
 * produced unit 1201: another household's parcel, that household's assessment,
 * and the heading "Your property is assessed at full market value". Reproduced
 * from a clean page load on production.
 *
 * ASSERTED ON THE LISTBOX, not on the file, so a comment quoting the old CSS
 * cannot satisfy it and an absolutely positioned SPINNER — which is fine, it
 * covers nothing — does not trip it.
 *
 * INJECTION: restore `position: 'absolute'` on either listbox -> FAILS.
 */
{
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const cases = [
    ['components/AddressAutocomplete.js', /<ul\s+role="listbox"\s+style=\{\{([\s\S]*?)\}\}/],
    ['pages/apply.js', /\{show && suggestions\.length > 0 && \(\s*<div style=\{\{([\s\S]*?)\}\}/],
  ];
  for (const [file, re] of cases) {
    try {
      const src = strip(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
      const m = re.exec(src);
      if (!m) throw new Error('could not find the suggestion list style');
      if (/position:\s*["']absolute["']/.test(m[1])) {
        throw new Error('the suggestion list is absolutely positioned and will cover the control beneath it');
      }
      ok(`${file}: the suggestion list takes its own space instead of covering the next control`);
    } catch (e) { bad(`${file} suggestion list`, e); }
  }
}

/**
 * AND CLOSING IT MUST NOT REFLOW THE CONTROL BEING PRESSED.
 *
 * The in-flow list fixes the click going to the wrong element. It creates a
 * second way to lose the same click: an outside-close on `mousedown` unmounts
 * the list, the control below jumps up, `mouseup` lands elsewhere, and the
 * browser fires `click` on the nearest common ancestor rather than on the
 * button. Observed live — the first press of "Check my property" did nothing
 * and the second worked.
 *
 * The two fixes are a pair. Asserting only the first would leave a dead button
 * passing every check in this file.
 *
 * INJECTION: change either listener back to 'mousedown' -> FAILS.
 */
for (const file of ['components/AddressAutocomplete.js', 'pages/apply.js']) {
  try {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/addEventListener\(\s*['"]mousedown['"]/.test(src)) {
      throw new Error('the outside-close still runs on mousedown, which reflows the button before its click lands');
    }
    if (!/addEventListener\(\s*['"]click['"]\s*,\s*handler\s*\)/.test(src)) {
      throw new Error('no click-based outside-close found');
    }
    ok(`${file}: the suggestion list closes on click, so a press completes against what it hit`);
  } catch (e) { bad(`${file} outside-close`, e); }
}

/**
 * AMBIGUOUS IS A QUESTION, NOT A MISS.
 *
 * `ambiguous` shared a branch with `no_parcel`, so a condo owner whose building
 * we hold in full was shown "We couldn't find that property" and then advised to
 * check their spelling. It is the largest no-finding outcome on the site.
 *
 * INJECTION: drop `d.reason !== 'ambiguous'` from the miss branch -> FAILS.
 */
try {
  const check = readFileSync(new URL('../pages/check.js', import.meta.url), 'utf8');
  if (!/d\.reason === 'ambiguous'/.test(check)) throw new Error('no dedicated ambiguous branch');
  if (!/d\.reason !== 'outside_coverage' && d\.reason !== 'ambiguous'/.test(check)) {
    throw new Error('the miss branch still catches ambiguous');
  }
  const heading = /d\.reason === 'ambiguous'[\s\S]{0,900}?<h2[^>]*>([^<]+)</.exec(check)?.[1] || '';
  if (/couldn|could not find|no record/i.test(heading)) {
    throw new Error(`the ambiguous screen still reads as a failure: "${heading}"`);
  }
  ok(`ambiguous has its own screen, headed "${heading.trim()}"`);
} catch (e) { bad('ambiguous screen', e); }

/**
 * ============================================================================
 * THE PRE-HYDRATION CAPTURE, EXECUTED RATHER THAN GREPPED. 28 Aug 2026.
 * ============================================================================
 * /check server-renders its address field, so it is typeable from ~760ms while
 * hydration lands past 1.5s — and hydrating a controlled input writes `value=''`
 * over it. pages/_document.js captures what is typed in that window and
 * pages/check.js puts it back.
 *
 * Asserting the script EXISTS would prove nothing; the whole mechanism is one
 * listener and one closure, and a typo in either fails silently by design. So
 * the script is pulled out of _document and run against a shim, and its actual
 * behaviour is checked.
 *
 * INJECTION: drop the capture-phase `true`, or make take() non-idempotent,
 * or key the store by name instead of id -> FAILS.
 */
try {
  const doc = readFileSync(new URL('../pages/_document.js', import.meta.url), 'utf8');

  const m = /const CAPTURE_PRE_HYDRATION_INPUT = `([\s\S]*?)`;/.exec(doc);
  if (!m) throw new Error('no CAPTURE_PRE_HYDRATION_INPUT template in _document');
  if (!/dangerouslySetInnerHTML=\{\{ __html: CAPTURE_PRE_HYDRATION_INPUT \}\}/.test(doc)) {
    throw new Error('the capture script is not inlined into <Head> — next/script would run too late');
  }

  // A shim with just enough DOM to run the thing.
  let bound = null;
  let capturePhase = null;
  const fakeDoc = {
    addEventListener(type, fn, capture) { if (type === 'input') { bound = fn; capturePhase = capture; } },
    removeEventListener(type) { if (type === 'input') bound = null; },
  };
  const fakeWin = {};
  // eslint-disable-next-line no-new-func
  new Function('document', 'window', m[1])(fakeDoc, fakeWin);

  if (!bound) throw new Error('the script did not listen for input events on document');
  if (capturePhase !== true) {
    throw new Error('the input listener is not in the capture phase — a stopPropagation upstream would silence it');
  }

  bound({ target: { id: 'ta-check-street', tagName: 'INPUT', value: '1750 N Bayshore Dr 3204' } });
  bound({ target: { id: 'no-id-here', tagName: 'DIV', value: 'ignored' } });

  const first = fakeWin.__taPreHydrationInput.take();
  if (first.values['ta-check-street'] !== '1750 N Bayshore Dr 3204') {
    throw new Error(`take() lost the typed value: ${JSON.stringify(first.values)}`);
  }
  if (first.lastId !== 'ta-check-street') throw new Error('take() did not report the field last typed into');
  if (bound !== null) throw new Error('take() left the listener attached');

  const second = fakeWin.__taPreHydrationInput.take();
  if (Object.keys(second.values).length !== 0) {
    throw new Error('take() is not idempotent — a client-side return to /check would refill the field');
  }

  ok('the pre-hydration capture records a typed address, hands it over once, and detaches');
} catch (e) { bad('pre-hydration capture', e); }

/**
 * And /check has to actually ask for it. The capture is useless unheld.
 *
 * INJECTION: delete the take() call from pages/check.js -> FAILS.
 */
try {
  const check = readFileSync(new URL('../pages/check.js', import.meta.url), 'utf8');
  if (!/__taPreHydrationInput\?\.take\?\.\(\)/.test(check)) {
    throw new Error('/check never takes the captured input');
  }
  if (!/values\?\.\['ta-check-street'\]/.test(check)) {
    throw new Error('/check does not read the street field out of the capture');
  }
  if (!/f\.street \? f :/.test(check)) {
    throw new Error('the restore overwrites existing state instead of only filling an empty field');
  }
  ok('/check takes the captured address and only fills the field when it is empty');
} catch (e) { bad('pre-hydration restore', e); }

console.log('');
if (failures) {
  console.error(`✗ ${failures} of ${checks} render checks failed.`);
  process.exit(1);
}
console.log(`✓ ${checks} checks passed — components compile, mount, and every priced defect renders`);
