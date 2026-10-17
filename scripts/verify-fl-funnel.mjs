#!/usr/bin/env node
/**
 * THE FLORIDA FUNNEL: NO PARCEL, NO SALE; COUNTY DATA ONLY.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * Moved here on 17 Oct 2026 from verify-petition.mjs, when the DR-486 letter
 * pipeline it was written for (pages/api/generate-dr486.js, lib/processOrder.js)
 * was deleted. Most of that file asserted on the generated petition and went
 * with it. These two blocks did not: they guard code that still runs in front
 * of every Florida customer before the FL kit is offered.
 *
 *   1. StepFloridaCheck in pages/apply.js — the refusal of an address with no
 *      roll record (NoParcelRecord), told apart from "our lookup broke". Added
 *      11 Aug 2026 after a petition carried "See county records" in the folio,
 *      assessed-value and requested-value boxes over a sworn Part 3.
 *   2. pages/api/lookup.js and pages/api/comps.js — Florida runs on the county
 *      roll only. RentCast cannot say whether a Florida figure is just value or
 *      the Save Our Homes capped value (measured 26% low on a real Hillsborough
 *      parcel), and a DR-486 disputes JUST value. The FL kit fills its DR-486
 *      from these routes' answers, so the rule is as live as it ever was.
 *
 * The other two gates of the original three-gate design (the generator and the
 * dispatch preflight) were deleted with the letter pipeline; the kit's own
 * equivalents are asserted in verify-fl-kit.mjs.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/**
 * Source with comments stripped. Needed for any assertion of the form "this bad
 * line is GONE": the block comments quote the exact lines they replaced, and a
 * raw-text check matches the quote and fails on correct code.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const readCode = (p) => stripComments(read(p));

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} — got: ${JSON.stringify(got)}`));

// ── 1. A Florida address with no roll record is refused, not waved through ────
{
  const apply = readCode('pages/apply.js');

  // The funnel refuses, and does not confuse "missing" with "broken".
  /**
   * THE EFFECT BODY IS THE THING UNDER TEST, NOT THE FILE.
   *
   * The first version of these assertions searched the whole of apply.js for the
   * tokens 'noparcel', 'unavailable' and NoParcelRecord. Two injection tests walked
   * straight through it: reverting the outage branch to onEligible() left every
   * token in place elsewhere in the file, and renaming the JSX usage still matched
   * the function DECLARATION. The checks were satisfied by code that no longer did
   * the job. So: slice out the lookup effect and assert on its control flow.
   */
  /**
   * THE TERMINATOR IS MATCHED LOOSELY, AND ITS ABSENCE IS AN ERROR.
   *
   * This used to search for the literal `}, [(issues || []).join('|')]);`. On
   * 23 Aug 2026 a retry counter was added to that dependency array, the literal
   * stopped matching, indexOf returned -1, and `slice(start, -1)` quietly widened
   * the body under test to the whole rest of the file — pulling in a DIFFERENT
   * effect that legitimately calls onEligible(). The assertion below failed, which
   * is the lucky direction: had the widening made a check pass instead of fail,
   * nothing would have said so.
   *
   * So the dependency list is matched with the issues key plus anything else, and
   * a slice that cannot find its end fails rather than defaulting to everything.
   * An upper bound on the length catches the same accident a second way.
   */
  const effectStart = apply.indexOf('function StepFloridaCheck');
  const terminator = /\}, \[\(issues \|\| \[\]\)\.join\('\|'\)[^\]]*\]\);/.exec(
    effectStart > -1 ? apply.slice(effectStart) : ''
  );
  t('the lookup effect terminator was found — the slice cannot silently run to EOF',
    effectStart > -1 && !!terminator,
    'without this an edit to the dependency array widens the body under test to the whole file');
  const effectBody = terminator ? apply.slice(effectStart, effectStart + terminator.index) : '';
  t('the eligibility effect was located for inspection',
    effectStart > -1 && effectBody.length > 200 && effectBody.length < 12000,
    'too short means the slice missed it; too long means the slice swallowed its neighbours');

  t('nothing in the lookup effect advances the customer',
    !/onEligible\s*\(/.test(effectBody),
    'every onEligible() inside this effect was a silent skip — one for a missing property, one for a failed request. Advancing is now the Continue button only');
  t('each outcome sets its own state',
    /'unavailable'/.test(effectBody) && /'noparcel'/.test(effectBody) && /'ambiguous'/.test(effectBody),
    'not-on-the-roll, shared-address and our-lookup-broke are three different answers to the customer');
  t('a non-ok response is treated as our failure, not as a finding',
    /!cRes\.ok/.test(effectBody) && !/!cRes\.ok\s*\)\s*\{\s*onEligible/.test(effectBody),
    'telling a customer we have no record of their home when Supabase is down is a false statement about their property');

  t('the refusal screen is both defined and rendered',
    /function NoParcelRecord/.test(apply) && /<NoParcelRecord/.test(apply),
    'a component that exists but is never mounted refuses nobody');
  t('each branch has a screen behind it',
    /state\.status === 'noparcel'/.test(apply) &&
    /state\.status === 'ambiguous'/.test(apply) &&
    /state\.status === 'unavailable'/.test(apply),
    'a status with no render branch falls through to the eligible screen with null data');
  t('the refused customer is recorded',
    /blockedReason: *["']fl_no_parcel_record["']/.test(apply));
}

// ── 2. Florida runs on county data, and cites the source it actually has ──────
{
  const lookup = readCode('pages/api/lookup.js');
  const comps  = readCode('pages/api/comps.js');

  // Florida requires the county roll
  t('Florida takes no vendor value fallback in lookup',
    /isFloridaLookup/.test(lookup) && /!isFloridaLookup && \(assessedValue === null/.test(lookup),
    'a vendor figure that may be the Save Our Homes capped value must not become the just value on a sworn petition');
  t('a Florida county-roll miss is named rather than papered over',
    /county_roll_miss/.test(lookup));
  t('the vendor merge fills nulls only — including the folio',
    /if \(parcelId === null\) parcelId = record\.parcelId;/.test(lookup) &&
    /if \(annualTax === null\) annualTax = record\.annualTax;/.test(lookup),
    'these two were unconditional, so a county parcel could ship with a vendor folio under a county valueSource');
  t('the cache version was bumped with the behaviour change',
    !/CACHE_VERSION = 'v4-millage'/.test(lookup),
    'FL payloads cached under the old key hold vendor-derived values for 30 days');
  t('Florida comps do not fall through to the vendor',
    /stateUpper === 'FL'/.test(comps) && /no vendor fallback is permitted/.test(comps),
    'paying for a result the petition is no longer allowed to cite');
  t('the FL comps refusal still states its own provenance',
    /basis: \{ source: 'county' \}/.test(comps),
    'a payload with no basis is exactly what got admitted before');

  // Texas and Georgia must be untouched — they have no county roll to fall back on.
  t('the vendor cut-off is Florida-scoped, not global',
    /stateUpper === 'FL'/.test(lookup) || /isFloridaLookup = stateUpper === 'FL'/.test(lookup),
    'TX and GA have no county roll here; cutting the vendor for them removes their only source');
}

if (failures.length) {
  console.error(`verify-fl-funnel: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-fl-funnel: ${pass} passed — no parcel means no sale, and Florida values come from the county roll`);
