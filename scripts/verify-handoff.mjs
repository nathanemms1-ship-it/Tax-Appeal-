#!/usr/bin/env node
/**
 * THE /check -> /apply HANDOFF. Runs from `npm run build`.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * The handoff is two pages agreeing about a record neither of them owns, and the
 * last time this repo did that it shipped `stashProperty(...)` wired into the
 * "Get started" onClick without the function ever being written. Every click on
 * the highest-intent button on the site threw ReferenceError. Nothing looked
 * broken: the apply form simply opened blank and asked for an address the
 * customer had typed a screen earlier. verify-tdz was written for exactly that
 * and catches the undeclared-identifier half.
 *
 * What verify-tdz cannot catch is the half that is merely ABSENT — a CTA that
 * carries the address but not the verdict, or a consuming effect that skips a
 * gate because the step it used to live on is no longer in the path. Both are
 * silent. The first costs a duplicate check (9 of 12 customers, 21-23 Aug). The
 * second sells a filing into a closed county.
 *
 * ============================================================================
 * THE PART THAT MATTERS MOST IS THE GATES
 * ============================================================================
 * StepProperty owns three refusals. Entering the funnel at `issues` skips that
 * screen, so those three must be re-run in the effect that consumes the verdict.
 * Assertions 5-8 below are the ones worth having: they fail the build if the
 * effect stops calling any of them, or calls getFilingWindowStatus without
 * `strict: true` — which silently swaps the earliest Florida deadline we stand
 * behind for the latest, and is the exact defect that let a Hillsborough order be
 * measured against Miami-Dade's date.
 *
 * ============================================================================
 * EXECUTED WHERE IT CAN BE, READ WHERE IT CANNOT
 * ============================================================================
 * lib/checkHandoff.js has no imports, so its behaviour is PROVEN BY RUNNING IT
 * against a stub sessionStorage — the TTL, the clear-on-read, the rejection of a
 * record with no timestamp. The wiring inside the two pages cannot be executed
 * without a browser and a router, so those assertions read source. Each one says
 * which kind it is, because a guard that reads source cannot tell you what the
 * function does — and that is how the address-match bug survived.
 *
 * ============================================================================
 * PROVING EACH ASSERTION — reintroduce the bug and watch it fail
 * ============================================================================
 *   1  delete `sessionStorage.removeItem(VERDICT_KEY)` in readVerdict      -> 1 fail
 *   2  return the record regardless of `checkedAt`                          -> 2 fail
 *   3  drop the `!v.eligible && !v.rescuable` guard                         -> 1 fail
 *   4  remove `stashVerdict` from either CTA in pages/check.js             -> 1 fail
 *   5  drop `{ strict: true }` from the effect's window call                -> 1 fail
 *   6  delete the isFlCountySupported branch from the effect                -> 1 fail
 *   7  delete the fee-confidence branch from the effect                     -> 1 fail
 *   8  make the effect skip the `if (!county) return` bail                  -> 1 fail
 *   9  write 'ta_verdict' as a literal in a page instead of importing       -> 1 fail
 *
 * All nine were run. Number 5 is the one to keep: it passes `next build`, passes
 * every other verify script, and renders identically.
 */

import { readFileSync } from 'node:fs';

const failures = [];
let pass = 0;
const t = (name, cond) => (cond ? pass++ : failures.push(name));

// ── Executed: lib/checkHandoff.js against a stub sessionStorage ────────────────
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { stashVerdict, readVerdict, VERDICT_KEY, VERDICT_TTL_MS } =
  await import('../lib/checkHandoff.js');

const ELIGIBLE = { found: true, reason: 'clearable', eligible: true, parcel: { parcelId: '30-1234' } };

store.clear();
stashVerdict(ELIGIBLE, 'Broward');
t('a written verdict round-trips with its county', readVerdict()?.county === 'Broward');

store.clear();
stashVerdict(ELIGIBLE, 'Broward');
readVerdict();
t('readVerdict CLEARS the key — a second property cannot inherit the first one\'s answer',
  readVerdict() === null && !store.has(VERDICT_KEY));

store.clear();
stashVerdict(ELIGIBLE, 'Broward');
t('a verdict older than the TTL is refused', readVerdict(Date.now() + VERDICT_TTL_MS + 1000) === null);

store.clear();
stashVerdict(ELIGIBLE, 'Broward');
t('a verdict inside the TTL is accepted', readVerdict(Date.now() + VERDICT_TTL_MS - 1000) !== null);

store.clear();
stashVerdict(ELIGIBLE, 'Broward');
t('a verdict timestamped in the FUTURE is refused — a hand-edited or clock-skewed record has unknown age',
  readVerdict(Date.now() - 60_000) === null);

store.clear();
store.set(VERDICT_KEY, JSON.stringify({ county: 'Broward', eligible: true }));
t('a record with no checkedAt is refused, not treated as fresh', readVerdict() === null);

store.clear();
store.set(VERDICT_KEY, '{not json');
t('a malformed record returns null instead of throwing', readVerdict() === null);

store.clear();
stashVerdict({ found: true, reason: 'cap_absorbs_everything', eligible: false, rescuable: false, parcel: {} }, 'Broward');
t('a REFUSED verdict is never handed forward — there is no screen to skip to', readVerdict() === null);

store.clear();
stashVerdict({ found: false, reason: 'no_parcel' }, '');
t('a check that found no parcel writes nothing', !store.has(VERDICT_KEY));

// ── Read: the wiring inside the two pages ─────────────────────────────────────
const check = readFileSync('pages/check.js', 'utf8');
const apply = readFileSync('pages/apply.js', 'utf8');

// Every CTA that carries the address must carry the verdict. These are the two
// buttons — eligible and rescuable — and they are the whole reason this exists.
//
// Scoped to the component body, not the file. The header of pages/check.js quotes
// `onClick={() => stashProperty(...)}` verbatim while explaining the ReferenceError
// that made this guard necessary, and counting that prose as a call site made the
// first draft of this assertion fail against correct code. A guard that matches its
// own documentation is measuring the wrong set.
const body = check.slice(check.indexOf('export default function CheckPage'));
const handlers = body.match(/onClick=\{[^}]*\}/g) || [];
const carryAddress = handlers.filter((h) => h.includes('stashProperty('));
t('at least one /apply CTA stashes the property — the handoff is wired at all (SOURCE READ)',
  carryAddress.length > 0);
t('every /apply CTA that stashes the property also stashes the verdict (SOURCE READ)',
  carryAddress.length > 0 && carryAddress.every((h) => h.includes('stashVerdict(')));

// The consuming effect. Sliced out by name so an assertion cannot be satisfied by
// the same call appearing somewhere else in a 3,300-line file — which is how a
// guard ends up proving a property about the wrong set.
const effect = apply.slice(apply.indexOf('const v = readVerdict();'));
const effectBody = effect.slice(0, effect.indexOf('  }, []);'));
t('the verdict effect exists at all (SOURCE READ)', effectBody.length > 0 && effectBody.length < 4000);

t('the verdict effect re-runs the filing-window gate with strict:true (SOURCE READ)',
  /getFilingWindowStatus\(\s*'FL'\s*,\s*county\s*,\s*\{\s*strict:\s*true\s*\}\s*\)/.test(effectBody));
t('the verdict effect refuses when neither canFile nor canPreOrder (SOURCE READ)',
  /!ws\.canFile\s*&&\s*!ws\.canPreOrder/.test(effectBody));
/**
 * BOTH COUNTY GATES MUST BE TESTED IN AN `if`, NOT MERELY MENTIONED.
 *
 * The first draft asserted `/isFlCountySupported\(county\)/` against the whole
 * effect. Deleting the gate did not fail it, because the line BELOW the gate
 * names the same function again to decide which sentence of copy to show:
 *
 *     setFlCountyBlocked({ county, reason: !isFlCountySupported(county) ? ... })
 *
 * So the assertion passed on an effect that no longer refused anything — it was
 * proving the identifier existed somewhere, which is the failure this repo has
 * now recorded four times under a different name each time. Caught only by
 * reintroducing the bug, which is why every guard here is proven that way.
 *
 * Conditions are extracted with a paren matcher rather than a regex because
 * `feeInfo?.confidence !== 'confirmed')` contains a bracket and a nested call.
 */
function ifConditions(src) {
  const out = [];
  for (const m of src.matchAll(/\bif\s*\(/g)) {
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    out.push(src.slice(m.index + m[0].length, i - 1));
  }
  return out;
}
const conditions = ifConditions(effectBody);
t('the verdict effect REFUSES on the VAB address gate — the 8 unconfirmed counties (SOURCE READ)',
  conditions.some((c) => /isFlCountySupported\(county\)/.test(c)));
t("the verdict effect REFUSES on the fee-confidence gate — Nassau, Columbia, Levy (SOURCE READ)",
  conditions.some((c) => /confidence\s*!==\s*'confirmed'/.test(c)));
t('the verdict effect bails when the record carries no county, so no gate is skipped unevaluated (SOURCE READ)',
  /if\s*\(!county\)\s*return;/.test(effectBody));

// The key name lives in one module. A literal in a page is how the writer and the
// reader drift apart, which is the failure lib/checkHandoff.js was created to end.
for (const [name, src] of [['pages/check.js', check], ['pages/apply.js', apply]]) {
  t(`${name} does not hand-write the 'ta_verdict' key (SOURCE READ)`, !src.includes("'ta_verdict'"));
}

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n  ${failures.length} handoff assertion(s) FAILED:`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error('\n  Each of these is an ABSENCE. next build passes without them, the pages');
  console.error('  render, and the funnel either asks for the check twice or skips a gate.');
  process.exit(1);
}

console.log(`Handoff check — ${pass} assertions passed`);
console.log('  the verdict round-trips, clears on read, ages out, and never carries a refusal');
console.log('  entering at `issues` still re-runs the window, VAB-address and fee gates');
