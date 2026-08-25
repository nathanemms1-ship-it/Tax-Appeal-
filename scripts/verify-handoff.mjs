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

import { readFileSync, readdirSync } from 'node:fs';

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

const { stashVerdict, readVerdict, VERDICT_KEY, VERDICT_TTL_MS, PROPERTY_KEY } =
  await import('../lib/checkHandoff.js');

/**
 * pages/check.js writes the ADDRESS first and the verdict second, and stashVerdict
 * reads the address key back before it commits — the two writes are separate
 * try/catch blocks and a quota failure on the larger record can leave the verdict
 * standing alone. So every fixture below has to stage the address the way the page
 * does, and the divergence case is asserted explicitly further down.
 */
const withAddress = () => store.set(PROPERTY_KEY, JSON.stringify({ street: '1130 GLENWOOD CT' }));

const ELIGIBLE = {
  found: true, reason: 'clearable', eligible: true,
  parcel: { parcelId: '30-1234', situs: { street: '1130 GLENWOOD CT', city: 'WESTON', state: 'FL', zip: '33326' } },
};

store.clear(); withAddress();
stashVerdict(ELIGIBLE, 'Broward');
t('a written verdict round-trips with its county', readVerdict()?.county === 'Broward');

store.clear(); withAddress();
stashVerdict(ELIGIBLE, 'Broward');
readVerdict();
t('readVerdict CLEARS the key — a second property cannot inherit the first one\'s answer',
  readVerdict() === null && !store.has(VERDICT_KEY));

store.clear(); withAddress();
stashVerdict(ELIGIBLE, 'Broward');
t('a verdict older than the TTL is refused', readVerdict(Date.now() + VERDICT_TTL_MS + 1000) === null);

store.clear(); withAddress();
stashVerdict(ELIGIBLE, 'Broward');
t('a verdict inside the TTL is accepted', readVerdict(Date.now() + VERDICT_TTL_MS - 1000) !== null);

store.clear(); withAddress();
stashVerdict(ELIGIBLE, 'Broward');
t('a verdict timestamped in the FUTURE is refused — a hand-edited or clock-skewed record has unknown age',
  readVerdict(Date.now() - 60_000) === null);

store.clear();
store.set(VERDICT_KEY, JSON.stringify({ county: 'Broward', eligible: true }));
t('a record with no checkedAt is refused, not treated as fresh', readVerdict() === null);

store.clear();
store.set(VERDICT_KEY, '{not json');
t('a malformed record returns null instead of throwing', readVerdict() === null);

store.clear(); withAddress();
stashVerdict({ found: true, reason: 'cap_absorbs_everything', eligible: false, rescuable: false, parcel: {} }, 'Broward');
t('a REFUSED verdict is never handed forward — there is no screen to skip to', readVerdict() === null);

store.clear(); withAddress();
stashVerdict({ found: false, reason: 'no_parcel' }, '');
t('a check that found no parcel writes nothing', !store.has(VERDICT_KEY));

// BOTH KEYS OR NEITHER. stashProperty refuses without situs.street, and a verdict
// written without one would send the customer to the condition step with no
// address — pricing defects for a property the funnel cannot name, then onto a
// petition whose one unforgiving field is the address.
store.clear(); withAddress();
stashVerdict({ found: true, reason: 'clearable', eligible: true, parcel: { parcelId: '30-1234' } }, 'Broward');
t('a parcel with no situs street writes no verdict — the address prefill would have refused it too',
  !store.has(VERDICT_KEY));

// The other half of the same invariant: the situs was fine, but the ADDRESS WRITE
// FAILED — a full quota, a private-mode quirk. stashVerdict reads the key back and
// withdraws rather than leaving a verdict that would route the customer to
// `florida-check` with an empty street.
store.clear();  // deliberately no withAddress()
stashVerdict(ELIGIBLE, 'Broward');
t('a verdict withdraws itself when the address write did not land',
  !store.has(VERDICT_KEY));

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

// ── The county gate on /check ─────────────────────────────────────────────────
/**
 * Eight counties have no confirmed VAB mailing address and three more have a fee
 * that is still a guess. send-letter.js refuses both — AFTER the card is charged,
 * which is why apply.js diverts before checkout. Until 23 Aug 2026 /check knew
 * about neither, so an owner in one of those eleven was told their property was
 * worth appealing, shown the gold button, and walked through three more screens
 * picking and pricing defects before the funnel said no.
 *
 * The answer has to come from the server: canFileInFlCounty reads the 67-entry VAB
 * address table, and importing that into the page would ship every street address,
 * phone note and source URL to the browser to render one boolean.
 *
 * Proven by reintroducing each:
 *   drop countyFilable from the /api/check response      -> 1 fail
 *   drop countyFilable from the page's canOrder          -> 1 fail
 *   import canFileInFlCounty into pages/check.js instead -> 1 fail
 *   send the blocked capture with a null reason          -> 1 fail
 */
const checkApi = readFileSync('pages/api/check.js', 'utf8');
t('/api/check answers whether we can file in the parcel\'s county (SOURCE READ)',
  /countyFilable:/.test(checkApi) && /canFileInFlCounty\(/.test(checkApi));
t('/api/check distinguishes an unconfirmed ADDRESS from an unconfirmed FEE (SOURCE READ)',
  /countyBlockedReason:/.test(checkApi) && /'fee'\s*:\s*'address'/.test(checkApi));
t('the county gate is part of what lets /check show a buy button (SOURCE READ)',
  /const canOrder = .*countyFilable/.test(check));
t('a county-blocked capture is tagged fl_county_unconfirmed, not left null (SOURCE READ)',
  /blockedReason = blockedBy === 'county' \? 'fl_county_unconfirmed'/.test(check) &&
  !/joinList\(e, null\)/.test(check));
/**
 * COMMENTS STRIPPED, AND THIS ASSERTION IS WHY THE RULE EXISTS.
 *
 * The claim is about what pages/check.js IMPORTS — pulling the 67-entry VAB
 * address table into a client bundle to render one boolean. It was matching the
 * raw file, so on 25 Aug 2026 it went red because a comment explaining that
 * lib/flCountyFees.js already documents the filing fee as non-refundable
 * mentioned that filename in prose.
 *
 * A guard that fails when someone writes a comment is a guard people learn to
 * satisfy by not writing comments. Test the code.
 */
const checkCode = check.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
t('pages/check.js does NOT pull the VAB address or fee tables into the browser bundle (SOURCE READ)',
  !/flVabAddresses/.test(checkCode) && !/serviceCoverage/.test(checkCode) && !/flCountyFees/.test(checkCode));

// Executed: the gate itself, against counties whose status is a published fact.
{
  const { canFileInFlCounty } = await import('../lib/serviceCoverage.js');
  t('a confirmed county is filable', canFileInFlCounty('Broward') === true);
  t('a county with no confirmed VAB address is not filable', canFileInFlCounty('Dixie') === false);
  t('a county whose fee is still a guess is not filable', canFileInFlCounty('Levy') === false);
  t('a county that does not exist is not filable', canFileInFlCounty('Notarealcounty') === false);
}

// ── What the handoff must not let a customer walk past ────────────────────────
/**
 * THE SALE REFUSAL EXISTS IN EXACTLY ONE PLACE IN THE PRODUCT.
 *
 * `subject_sold_above_indicated_value` — the property sold arms-length for more
 * than comparable sales support, so the Property Appraiser answers every comp we
 * cite with the owner's own closing figure — lives in lib/dor/comps.js,
 * pages/api/comps.js, and the refusal screen inside StepFloridaCheck. It is NOT
 * in /api/checkout and NOT in send-letter.js.
 *
 * The first version of the handoff routed eligible arrivals straight to `issues`,
 * so StepFloridaCheck never mounted and that refusal never ran — for the LARGEST
 * eligible cohort, and the one most likely to trip it: a Florida
 * `no_cap_differential` verdict usually means the homestead cap has just reset on
 * a sale, so those visitors are recent buyers.
 *
 * The fix is autoAdvance: mount the component, run both tests, skip only the
 * confirmation screen. These assertions are what stop that being quietly undone.
 *
 * Proven by reintroducing each:
 *   route eligible arrivals to 'issues' again          -> 1 fail
 *   let autoAdvance fire despite the sale refusal      -> 1 fail
 *   drop the autoAdvance prop from the JSX             -> 1 fail
 *   stop clearing the handoff on a Back button         -> 1 fail
 */
t('an ELIGIBLE /check arrival is routed THROUGH florida-check, never around it (SOURCE READ)',
  /setFlAutoAdvance\(true\);\s*\n\s*setStep\('florida-check'\)/.test(apply));
t('autoAdvance is passed to the component that owns the refusals (SOURCE READ)',
  /autoAdvance=\{flAutoAdvance\}/.test(apply));
t('autoAdvance refuses to skip past the sale refusal (SOURCE READ)',
  /if \(state\.comps\?\.reason === 'subject_sold_above_indicated_value'\) return;/.test(apply));
t('the sale refusal still renders — it is the only place in the product it exists (SOURCE READ)',
  /const sale = state\.comps\?\.reason === 'subject_sold_above_indicated_value'/.test(apply));

/**
 * THE SALE GATE IS FAIL-OPEN, SO THE SKIP MUST NOT BE.
 *
 * /api/comps is wrapped in `.catch(() => null)` and rate limited 10 per minute per
 * client IP, which a NAT'd office or a carrier can exhaust. A failed call yields no
 * `reason`, which is indistinguishable from a clean result — so autoAdvance would
 * have skipped the screen on the strength of a test that never ran, and left
 * nothing on the page to say the gate had declined to run.
 *
 * A comps failure still must not BLOCK anyone: a property with a failed roof has a
 * real case on condition, and a data gap is not evidence about a house. It simply
 * may not license the skip.
 */
t('the funnel records WHETHER the sale test ran, not only what it said (SOURCE READ)',
  /const saleTestRan = /.test(apply) && /data: j, comps, saleTestRan/.test(apply));
t('autoAdvance refuses to skip a screen on a sale test that never ran (SOURCE READ)',
  /if \(!state\.saleTestRan\) return;/.test(apply));

/**
 * THE RESCUE FLAG RECORDS A PROPERTY OF THE PARCEL, NOT A POSITION IN THE FUNNEL.
 *
 * Clearing it when the rescue pass succeeded let the customer walk the gate back in
 * two clicks: details screen -> Back -> untick every defect -> "Skip & generate my
 * dispute letter" -> straight on to account, fee and checkout, with the only pass
 * that could clear them never re-run against the list that no longer clears them.
 * Nothing downstream re-derives it: /api/checkout and /api/send-letter test the
 * filing window and the two county gates and contain no eligibility test at all.
 */
// The invariant is that the flag is NOT cleared when the rescue pass succeeds.
// `flIssuesDone` joined the same branch on 23 Aug for the summary pass, so the
// positive match moved; the negative is the one carrying the weight.
t('the rescue flag survives a successful rescue pass, so any return to `issues` re-checks (SOURCE READ)',
  /if \(flRescueReturn \|\| flIssuesDone\) \{ setStep\("account"\); \}/.test(apply) &&
  !/setFlRescueReturn\(false\)[^\n]*setStep\("account"\)/.test(apply));
t('the issues step routes a rescuable parcel back through florida-check (SOURCE READ)',
  /const wantsSummary = sc === 'FL' && \(flRescueReturn \|\|/.test(apply) &&
  /if \(wantsSummary\) \{[^}]*setStep\('florida-check'\)/.test(apply));

/**
 * The retry on the `unavailable` screen must re-run the request, not reload the
 * page. readVerdict and the ta_property reader both removeItem on first mount, so a
 * reload returns a customer who was just told their property is worth appealing to
 * a blank address form. Status alone is not enough either — the effect's other
 * dependency is the issues list, so without the nonce the spinner never resolves,
 * which is worse than the reload it replaced.
 */
t('the unavailable screen retries in place rather than reloading (SOURCE READ)',
  !/window\.location\.reload\(\)\}>Try again/.test(apply) &&
  /setRetryNonce\(\(n\) => n \+ 1\)/.test(apply) &&
  /retryNonce\]\);/.test(apply));

/**
 * EVERY ROUTE BACK TO THE ADDRESS FIELD DISCARDS THE HANDOFF.
 *
 * flRollCounty sets the fee, the cheque payee and which VAB office receives the
 * petition. flAutoAdvance would skip the verdict screen for a property never
 * checked. flRescueReturn and flConditionIntent would route a second property past
 * its own first pass. Going back from `florida-check`, typing a different address
 * and continuing could reach the fee screen disclosing the PREVIOUS county's fee
 * and payee, with the previous property's priced defects attached, and ask the
 * owner to confirm that county and sign an authorization naming it.
 */
t('clearHandoff discards all four handoff values (SOURCE READ)',
  /const clearHandoff = \(\) => \{[\s\S]{0,400}?setFlRollCounty\(''\);[\s\S]{0,200}?setFlAutoAdvance\(false\);[\s\S]{0,200}?setFlRescueReturn\(false\);[\s\S]{0,200}?setFlConditionIntent\(false\);/.test(apply));
{
  // Every onBack that lands on the property step must call it. Counting them
  // rather than naming them, so a fourth route added later is covered too.
  const backsToProperty = (apply.match(/onBack=\{\(\) => \{[^}]*setStep\(['"]property['"]\)/g) || []);
  t('every Back that reaches the address field clears the handoff first (SOURCE READ)',
    backsToProperty.length > 0 && backsToProperty.every((h) => h.includes('clearHandoff()')));
  t('restart() clears the handoff too (SOURCE READ)',
    /setStep\("property"\);[\s\S]{0,900}?clearHandoff\(\);/.test(apply));
}
t('the sign-in exit is offered on the first screen only, not above checkout (SOURCE READ)',
  /const isFirstStep = step === "property";/.test(apply) && !/\["account", "property"\]\.includes\(step\)/.test(apply));

// ── The cure summary, the invitation, and the county label ───────────────────
/**
 * Four things, all found or requested during the 23 Aug live test.
 *
 * Proven by reintroducing each:
 *   drop the strip from checkout's line-item name        -> 1 fail
 *   drop it from the cheque memo                          -> 1 fail
 *   stop returning the cure from /api/check               -> 1 fail
 *   recompute the cure in the browser instead             -> 1 fail
 *   route eligible+defects straight to `account`          -> 1 fail
 *   unscope the invitation from `disclosure`              -> 1 fail
 *   hardcode $89 on the details step again                -> 1 fail
 *   pass the click event to onAddIssues again             -> 1 fail
 */
const checkoutSrc = readFileSync('pages/api/checkout.js', 'utf8');
const sendLetter = readFileSync('pages/api/send-letter.js', 'utf8');
const parcels = readFileSync('lib/dor/parcels.js', 'utf8');

// A live test purchase was billed for a "Broward County County VAB Filing Fee".
// The county arrives carrying its own suffix, so anything appending " County"
// must strip it first — including the memo line printed on a real cheque.
t('checkout strips the county suffix before appending it (SOURCE READ)',
  /countyLabel = String\(county \|\| ''\)\.replace\(\/\\s\+County\$\/i, ''\)/.test(checkoutSrc) &&
  !/name: `\$\{county\} County VAB/.test(checkoutSrc));
t('the cheque memo strips it too (SOURCE READ)',
  !/return `\$\{county\} County VAB Filing Fee`/.test(sendLetter));

// The number shown must be the number the arithmetic used. The browser holds the
// issue labels but not the NAL row, so a second pricing there is a different sum.
t('/api/check returns the cure figure it actually used (SOURCE READ)',
  /cure: result\.cure \|\| null/.test(checkApi) && /cure: cureDollars > 0/.test(parcels));
t('the delta reads the server cure rather than recomputing it (SOURCE READ)',
  /d\.cure && d\.cure\.shareOfValue != null/.test(apply) &&
  !/totalCostToCure\([^)]*\)[^;]*;\s*\n\s*const curePts/.test(apply));
t('the delta handles the no-cap case, where there is no gap to close (SOURCE READ)',
  /const hasGap = requiredPts > 0;/.test(apply));

// The summary pass, and the flag that makes it distinguishable from the verdict.
t('an eligible parcel with defects ticked gets the summary pass (SOURCE READ)',
  /const wantsSummary = sc === 'FL' && \(flRescueReturn \|\| issues\.length > 0\);/.test(apply));
t('the summary pass renders — autoAdvance is cleared before it (SOURCE READ)',
  /if \(wantsSummary\) \{ setFlAutoAdvance\(false\); setStep\('florida-check'\)/.test(apply));
t('finishing the issues step is tracked separately from needing the cure to qualify (SOURCE READ)',
  /const \[flIssuesDone, setFlIssuesDone\] = useState\(false\);/.test(apply) &&
  /if \(flRescueReturn \|\| flIssuesDone\) \{ setStep\("account"\); \}/.test(apply));
t('starting over forgets that the question was asked (SOURCE READ)',
  /setFlIssuesDone\(false\);/.test(apply));

/**
 * THE INVITATION IS SCOPED, AND THIS IS THE ASSERTION THAT MATTERS MOST HERE.
 *
 * The issue list goes onto a DR-486 signed under penalty of perjury. "Your total
 * looks small, add more" is coaching somebody to inflate a sworn claim — against
 * their own interest, because a petition the Board rejects costs them the year.
 * So it appears only in the `disclosure` band, where the required cut is above
 * what comparable sales plausibly reach and a point or two genuinely decides
 * whether filing is worth it, and the copy says only real defects belong on it.
 */
t('the "did we miss anything" invitation is scoped to the disclosure band (SOURCE READ)',
  /\{d\.cure && d\.disclosure && onAddIssues && \(/.test(apply));
t('the invitation tells the owner only to add what is true (SOURCE READ)',
  /Only add what is actually true of/.test(apply));
/**
 * Scoped to StepFloridaCheck. StepDispute has its own `onAddIssues` prop that
 * takes no argument and legitimately reads `onClick={onAddIssues}`, so an
 * unanchored negative here failed against correct code — the same
 * measuring-the-wrong-set mistake, caught by running it.
 */
{
  const start = apply.indexOf('function StepFloridaCheck(');
  /*
   * COMMENTS STRIPPED — and this assertion needed it on its own first run, which
   * is the fifth time in this branch. The comment that now sits beside the fixed
   * button QUOTES the defect (`onClick={onAddIssues}`) while explaining why it was
   * wrong, and the negative match found its own documentation.
   *
   * The rule was already written down two guards ago. Writing it down is not the
   * same as applying it, so it is applied here too.
   */
  const flCheck = apply.slice(start, apply.indexOf('\nfunction ', start + 1))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  t('the rescue flag is raised explicitly, not from a click event (SOURCE READ)',
    /onAddIssues=\{\(isRescue\) => \{[^}]*if \(isRescue\) setFlRescueReturn\(true\)/.test(apply) &&
    !/onClick=\{onAddIssues\}/.test(flCheck) &&
    /onClick=\{\(\) => onAddIssues\(true\)\}/.test(flCheck) &&
    /onClick=\{\(\) => onAddIssues\(false\)\}/.test(flCheck));
}

// "Total today $89" is not the total for a Florida order, and this screen is now
// the one before checkout.
t('the details step shows the real total, not a hardcoded $89 (SOURCE READ)',
  /vabFeeCents \? `\$\$\{89 \+ vabFeeCents \/ 100\}` : "\$89"/.test(apply));
t('only a CONFIRMED county fee is printed beside the word Total (SOURCE READ)',
  /info\?\.confidence === 'confirmed' \? info\.vabFee : null/.test(apply));

// ── The funnel order, and the password that is no longer part of it ───────────
/**
 * These are assertions about a DECISION, not about correctness. Nothing breaks if
 * the account step goes back to the top — the funnel works, every gate still
 * fires, and the only symptom is the one measured on 21-23 Aug: 12 landings, 3
 * checks, 0 sales. That is precisely the kind of regression that survives review,
 * because the diff that causes it looks like a tidy-up.
 *
 * Proven by reintroducing each:
 *   restore "account" to the front of STEPS                    -> 1 fail
 *   restore the password Field to StepAccount                  -> 1 fail
 *   restore `password: account.password` to the checkout body  -> 1 fail
 *   set the initial step back to "account"                     -> 1 fail
 *   point restart() back at "account"                          -> 1 fail
 *   revert login.js to `if (!order.password_hash)`             -> 1 fail
 */
const STEPS_LINE = apply.match(/const STEPS = \[([^\]]*)\]/);
const stepOrder = STEPS_LINE ? STEPS_LINE[1].split(',').map((s) => s.trim().replace(/["']/g, '')) : [];
t('the funnel runs property -> issues -> account -> dispute (SOURCE READ)',
  stepOrder.join('|') === 'property|issues|account|dispute');
t('the funnel OPENS on the property, not on a form (SOURCE READ)',
  /useState\("property"\)/.test(apply));
t('restart() returns to the property step, not the details step (SOURCE READ)',
  /setStep\("property"\);\n\s*setAccount\(/.test(apply));
t('the Florida fee screen displays no earlier than the details step (SOURCE READ)',
  /'florida-fee':\s*'account'/.test(apply));

/**
 * ==========================================================================
 * THE FIRST SCREEN CARRIES THE PAGE'S <h1>. NOTHING LOCAL WOULD TELL YOU.
 * ==========================================================================
 * verify-pages asserts that every required page has exactly one <h1>. It reads
 * the BUILT HTML — and pages/apply.js returns <WaitlistForm /> unless
 * NEXT_PUBLIC_SALES_ENABLED is 'true'. That variable is unset on a developer
 * machine, so a local `npm run build` prerenders the waitlist page (which has its
 * own h1) and NEVER RENDERS THE FUNNEL. Production has it set, renders the funnel,
 * and gets whatever the first step happens to be.
 *
 * Reordering the funnel moved the h1 off the first screen. Every local build was
 * green; the deploy failed with `FAIL apply / no <h1> — page has no heading`.
 *
 * This is the blind spot restated: a build proves a property about the page THIS
 * MACHINE renders, which is not the page customers get. So the assertion is made
 * against SOURCE, where the environment cannot hide it.
 *
 * Proven by reintroducing it: demote StepProperty's h1 to an h2 -> 1 fail;
 * promote StepAccount's h2 back to an h1 -> 1 fail.
 */
{
  /**
   * COMMENTS STRIPPED, because both of these components now carry a comment
   * EXPLAINING which heading level they use and why — and `<h1>` written in prose
   * matched the test. That is the fourth time in this branch a guard has matched
   * its own documentation rather than the code (the stashProperty count,
   * verify-fl-data's call counter, login's negative test, and this). It is worth
   * naming as a rule: any assertion about the presence of a token in source must
   * strip comments first, or the act of documenting the rule breaks it.
   */
  const componentSrc = (name) => {
    const start = apply.indexOf(`function ${name}(`);
    if (start < 0) return null;
    const next = apply.indexOf('\nfunction ', start + 1);
    return apply.slice(start, next < 0 ? apply.length : next)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')   // JSX comments
      .replace(/\/\*[\s\S]*?\*\//g, ' ')         // block comments
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');      // line comments
  };
  const firstStep = stepOrder[0];                      // 'property'
  const STEP_COMPONENTS = {
    property: 'StepProperty', issues: 'StepIssues',
    account: 'StepAccount', dispute: 'StepDispute',
  };
  const firstSrc = componentSrc(STEP_COMPONENTS[firstStep]);
  t(`the component for the first step (${STEP_COMPONENTS[firstStep]}) was located (SOURCE READ)`, !!firstSrc);
  t(`${STEP_COMPONENTS[firstStep]} renders the page's <h1> — it is the screen /apply opens on (SOURCE READ)`,
    !!firstSrc && /<h1[\s>]/.test(firstSrc));

  for (const [step, comp] of Object.entries(STEP_COMPONENTS)) {
    if (step === firstStep) continue;
    const src = componentSrc(comp);
    t(`${comp} does not also claim an <h1> — one page, one heading (SOURCE READ)`,
      !!src && !/<h1[\s>]/.test(src));
  }
}


// The password. Two ends: it is not collected, and the absence is handled.
t('StepAccount renders no password field (SOURCE READ)',
  !/<Field[^>]*type="password"/.test(apply));
t('the checkout body carries no password (SOURCE READ)',
  !/^\s*password: account\.password,/m.test(apply));

const login = readFileSync('pages/api/portal/login.js', 'utf8');
/**
 * ANCHORED TO THE START OF A LINE, because login.js QUOTES the old test verbatim
 * while explaining why it was replaced. An unanchored negative match failed
 * against correct code — for the third time in this session's work, after the
 * stashProperty count and verify-fl-data's call counter.
 *
 * The pattern is worth naming: a guard written to catch a defect keeps matching
 * the sentence that describes the defect. Every one of them was caught by running
 * the guard against code that was already right, which is the cheap half of
 * proving a guard and the half that is easy to skip.
 *
 * A block comment's continuation lines begin `*`, so requiring `if` to be the
 * first non-whitespace on the line separates code from prose without a parser.
 */
t('portal login tests whether the hash is USABLE, not merely present — the `!` sentinel is not a null (SOURCE READ)',
  /hasUsablePassword\(order\.password_hash\)/.test(login) && !/^\s*if\s*\(!order\.password_hash\)/m.test(login));

/**
 * EVERY WRITER OF password_hash, NOT ONE FILE.
 *
 * The first version of this assertion named pages/api/save-order.js — which has
 * had no in-app caller since fulfillment moved to lib/fulfillOrder.js, as that
 * file's own header states. So it proved the sentinel was present on a path no
 * customer takes, while the live insert in fulfillOrder.js went on writing
 * `m.passwordHash || null` for 100% of orders. The build was green the whole time.
 *
 * That is the failure this repo keeps recording under different names: the
 * conservative fallback proven against counties already checked, the FAQ guard
 * that sampled Florida while Texas shipped the dead markup, the fee checker that
 * found zero claims and passed. A check can prove a property about a set that
 * does not contain the defect.
 *
 * So this one FINDS the writers rather than being told where they are. Any new
 * file that writes the column is covered the day it is written, and a writer that
 * defaults to null fails the build.
 */
{
  const writers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
      const p = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) {
        const src = readFileSync(p, 'utf8');
        /**
         * A WRITE, NOT A READ — AND BOTH SPELLINGS OF A WRITE.
         *
         * `.select('... password_hash ...')` and `order.password_hash` are reads.
         * A write is `password_hash:` inside an insert or update object, OR the
         * ES6 shorthand `password_hash,` — which is how pages/api/save-order.js
         * writes it, the very file whose dead-path assertion motivated this sweep.
         * The first version matched only the colon form, so that file was not in
         * `writers` and the sweep's own claim to find every writer was false on
         * the day it was written. Same shape as the defect it was added for.
         */
        const colonForm = /password_hash:\s*[^,\n}]+/.test(src);
        const shorthand = /^\s*password_hash,\s*$/m.test(src);
        if (colonForm || shorthand) writers.push([p, src]);
      }
    }
  };
  walk('pages'); walk('lib');

  t('at least two files write password_hash — the sweep found the writers rather than being told (SOURCE READ)',
    writers.length >= 2);
  for (const [p, src] of writers) {
    // Every way of spelling "and if we have nothing, write a null". The first
    // version tested `|| null` alone, so `?? null` and a bare `password_hash: null`
    // both passed.
    const bad = /password_hash:\s*[^,\n}]*(\|\||\?\?)\s*null/.test(src)
      || /password_hash:\s*null\b/.test(src);
    t(`${p.replace(/^.*?\//, '')} does not default password_hash to an untested null (SOURCE READ)`, !bad);
  }
  t('the sweep sees pages/api/save-order.js, which writes the column in shorthand (SOURCE READ)',
    writers.some(([p]) => p.endsWith('pages/api/save-order.js')));
  const live = writers.find(([p]) => p.endsWith('lib/fulfillOrder.js'));
  t('lib/fulfillOrder.js — the insert that actually runs — writes the sentinel (SOURCE READ)',
    !!live && /password_hash: m\.passwordHash \|\| NO_PASSWORD_SENTINEL/.test(live[1]));
}

const saveOrder = readFileSync('pages/api/save-order.js', 'utf8');
t('save-order writes the no-password sentinel rather than a null of unknown legality (SOURCE READ)',
  /let password_hash = NO_PASSWORD_SENTINEL;/.test(saveOrder));

/**
 * /api/portal/set-password — the only write a customer can reach without being
 * signed in, running after the money has been taken.
 *
 * The property that matters is that it CLAIMS and never RESETS. `session_id` is a
 * real credential — unguessable, checked against Stripe, and the payment must have
 * settled — but it travels in the URL of /success, so it reaches browser history,
 * Referer headers and every log in between. Letting it overwrite a password that
 * already exists would turn a leaked URL into an account takeover; letting it set
 * one that does not exist grants no more reach than /api/verify-payment already
 * gives the same holder on the same page.
 *
 * Proven by reintroducing each:
 *   delete the hasUsablePassword refusal          -> 1 fail
 *   take the email from req.body instead of Stripe -> 1 fail
 *   drop the payment_status check                 -> 1 fail
 *   remove enforceRateLimit                       -> 1 fail
 *   read the password from req.query              -> 1 fail (and verify-security too)
 *   select('*') on orders                         -> 1 fail (and verify-security too)
 */
const setPw = readFileSync('pages/api/portal/set-password.js', 'utf8');
const setPwCode = setPw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
t('set-password REFUSES when a usable password already exists — it claims, it never resets (SOURCE READ)',
  /if\s*\(orders\.some\([\s\S]{0,80}?hasUsablePassword\([\s\S]{0,40}?\)\)\)/.test(setPwCode) &&
  /PASSWORD_ALREADY_SET/.test(setPwCode));
t('set-password takes the email from the Stripe session, never from the request body (SOURCE READ)',
  /session\.customer_email/.test(setPwCode) && !/const\s*\{[^}]*\bemail\b[^}]*\}\s*=\s*req\.body/.test(setPwCode));
t('set-password requires the payment to have actually settled (SOURCE READ)',
  /payment_status\s*!==\s*'paid'/.test(setPwCode));
/**
 * THE GUARD MUST READ EVERY ROW THE WRITE WILL TOUCH.
 *
 * The first version read the NEWEST order and updated ALL of them. The newest
 * order is the one the presented payment just created, so it never has a password
 * — the refusal could not fire, and the write destroyed the customer's real hash
 * on their earlier orders. Reachable from a leaked /success URL, or by paying $89
 * under somebody else's email, which the funnel never verifies.
 *
 * So: no `.limit(` and no `.order(` in the lookup, and the test is `.some(...)`
 * across the rows rather than an index into one.
 */
/**
 * AND THE WRITE CARRIES ITS OWN CONDITION. The read-then-write above still has a
 * window: two concurrent POSTs both pass the `some` test before either UPDATE
 * lands. Each statement now only matches rows that STILL have no usable password,
 * which the database evaluates atomically.
 */
t('the set-password write is conditional, so a concurrent real password cannot be clobbered (SOURCE READ)',
  /\.eq\('password_hash', NO_PASSWORD_SENTINEL\)/.test(setPwCode) &&
  /\.is\('password_hash', null\)/.test(setPwCode));

t('set-password evaluates "already set" over EVERY row its write will change (SOURCE READ)',
  /orders\.some\(\([^)]*\)\s*=>\s*hasUsablePassword\(/.test(setPwCode) &&
  !/\.limit\(/.test(setPwCode) &&
  !/hasUsablePassword\(orders\[0\]/.test(setPwCode));
t('set-password is rate limited — a session id should not be free to brute-force (SOURCE READ)',
  /enforceRateLimit\(\s*req/.test(setPwCode));
t('set-password reads its password from the body, not the query string (SOURCE READ)',
  !/req\.query/.test(setPwCode));
t('set-password does not select(*) on orders (SOURCE READ)',
  !/\.select\(\s*['"]\*['"]\s*\)/.test(setPwCode));

const { hasUsablePassword, NO_PASSWORD_SENTINEL, hashPassword, MIN_PASSWORD_LENGTH } = await import('../lib/noPassword.js');

// The two routes where a customer chooses a password must produce a hash
// pages/api/portal/login.js can actually verify. It sniffs `salt:hash` for pbkdf2
// and falls through to bcrypt, so a format change here locks people out silently.
{
  const nodeCrypto = await import('node:crypto');
  const h = hashPassword('correct horse battery staple', nodeCrypto.default);
  const [salt, digest] = h.split(':');
  t('hashPassword produces the salt:hash pbkdf2 shape login.js verifies',
    !!salt && !!digest && /^[0-9a-f]{32}$/.test(salt) && /^[0-9a-f]{128}$/.test(digest));
  t('hashPassword salts — two hashes of the same password differ',
    hashPassword('same', nodeCrypto.default) !== hashPassword('same', nodeCrypto.default));
  t('a hash it produces is a usable password', hasUsablePassword(h));
  const reset = readFileSync('pages/api/portal/reset-password.js', 'utf8');
  t('both password-setting routes use the one hasher (SOURCE READ)',
    /hashPassword\(password, crypto\)/.test(reset) && /hashPassword\(password, crypto\)/.test(setPwCode));
  t('both enforce the same minimum length (SOURCE READ)',
    /MIN_PASSWORD_LENGTH/.test(reset) && /MIN_PASSWORD_LENGTH/.test(setPwCode) && MIN_PASSWORD_LENGTH === 6);
}
t('the sentinel is not a usable password', !hasUsablePassword(NO_PASSWORD_SENTINEL));
t('a null hash is not a usable password', !hasUsablePassword(null));
t('an empty hash is not a usable password', !hasUsablePassword(''));
t('a real bcrypt hash IS usable', hasUsablePassword('$2b$10$abcdefghijklmnopqrstuv'));
t('a real pbkdf2 salt:hash IS usable', hasUsablePassword('deadbeef:cafebabe'));

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
