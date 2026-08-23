#!/usr/bin/env node
/**
 * Florida data integrity check. Run with: npm run verify:fl
 *
 * WHY THIS EXISTS: county normalization silently broke Miami-Dade — Florida's
 * largest county. The title-case regex matched each whitespace-delimited token
 * rather than each alpha run, so the hyphen was swallowed and "Miami-Dade"
 * normalized to "Miami-dade" — which matched no key
 * in either lookup table. getFlVabAddress returned null, and the safety gate that
 * blocks unverified counties hard-blocked Miami-Dade at checkout.
 *
 * It failed CLOSED, so nothing crashed and no log line appeared. It surfaced only
 * because the endpoint was exercised directly against production. This script
 * makes that class of failure loud.
 */
import ADDR, { getFlVabAddress, getFlVabAddressRaw } from '../lib/flVabAddresses.js';
import { getFlVabFee } from '../lib/flCountyFees.js';

const FL_COUNTY_COUNT = 67;
const names = Object.keys(ADDR);
const errors = [];
const warnings = [];

if (names.length !== FL_COUNTY_COUNT) {
  errors.push(`Expected ${FL_COUNTY_COUNT} counties in flVabAddresses, found ${names.length}`);
}

for (const name of names) {
  const raw = getFlVabAddressRaw(name);
  const addr = getFlVabAddress(name);
  const fee = getFlVabFee(name);

  // A confirmed county that will not resolve is the Miami-Dade failure mode.
  if (raw?.confidence === 'confirmed' && !addr) {
    errors.push(`${name}: marked confirmed but getFlVabAddress() returns null — normalization bug`);
  }
  // Every county must have a fee entry, confirmed or not.
  if (!fee || !fee.vabFee || fee.vabFee <= 0) {
    errors.push(`${name}: no VAB fee`);
  }
  // Confirmed address + estimated fee => send-letter refuses. Sellable but blocked.
  if (raw?.confidence === 'confirmed' && fee.confidence !== 'confirmed') {
    warnings.push(`${name}: address confirmed but fee is ${fee.confidence} — orders will be refused at mail time`);
  }
  if (addr && (!addr.street || !addr.city || !addr.zip || !addr.vabName)) {
    errors.push(`${name}: confirmed address is incomplete`);
  }
}

// Case and format variants must all land on the same entry.
for (const [variant, expected] of [
  ['Miami-Dade', true], ['MIAMI-DADE', true], ['miami-dade County', true],
  ['Palm Beach', true], ['st. johns', true], ['ORANGE', true], ['Indian River', true],
  ['Nowhere', false],
]) {
  const resolved = !!getFlVabAddress(variant);
  if (resolved !== expected) {
    errors.push(`Normalization: "${variant}" ${resolved ? 'resolved' : 'did not resolve'}, expected the opposite`);
  }
}

/**
 * ============================================================================
 * FLORIDA'S PER-COUNTY PETITION DEADLINES
 * ============================================================================
 * Added 13 Aug 2026, when a sweep of all 67 Property Appraiser sites showed that
 * the single statewide 18 Sept this codebase had always used was Miami-Dade's
 * date, not Florida's — and was later than thirteen of the seventeen counties
 * whose 2026 date could be established. Hillsborough, which is Tampa, closes on
 * 7 Sept.
 *
 * These guard the three ways the new table can go quietly wrong.
 */
{
  const fl = await import('../lib/filingWindows.js');
  const { FL_COUNTY_DATES, FL_UNKNOWN_COUNTY_DEADLINE, PETITION_DAYS_AFTER_TRIM,
          flPetitionDeadline, getFilingWindowStatus } = fl;
  const Y = 2026;
  const iso = (d) => d.toISOString().slice(0, 10);

  // 1. A MISSPELLED KEY IS INVISIBLE. flPetitionDeadline falls back when it does
  //    not recognise a county, so "St Johns" without the full stop, or "Miami
  //    Dade" without the hyphen, silently gets the fallback and nothing complains.
  //    That is the same shape as the Miami-Dade normalisation bug this whole file
  //    was written for.
  for (const key of Object.keys(FL_COUNTY_DATES)) {
    if (!names.some((n) => n.toLowerCase() === key.toLowerCase())) {
      errors.push(`FL_COUNTY_DATES has "${key}", which is not one of the 67 county names — it will silently fall back`);
    }
  }

  // 2. THE +25 RULE IS THE REASON WE STORE MAILING DATES INSTEAD OF DEADLINES.
  //    Four counties publish both, and all four agree to the day. If that ever
  //    stops being true, every derived date in the table is suspect and the
  //    argument for deriving them collapses.
  for (const [county, published] of [['Osceola', '2026-09-08'], ['Pinellas', '2026-09-11'],
                                     ['Polk', '2026-09-11'], ['Clay', '2026-09-18']]) {
    const got = iso(flPetitionDeadline(county, Y));
    if (got !== published) {
      errors.push(`${county}: TRIM + ${PETITION_DAYS_AFTER_TRIM} gives ${got}, but the county publishes ${published} — the derivation rule no longer holds`);
    }
  }

  // 3. THE FALLBACK MUST NOT BE MORE GENEROUS THAN ANY DATE WE HAVE VERIFIED.
  //    Its entire job is to be the safe answer for a county nobody has checked.
  //    A fallback later than a known deadline is an optimistic guess wearing a
  //    conservative label.
  const fallback = flPetitionDeadline('Notarealcounty', Y);
  for (const county of Object.keys(FL_COUNTY_DATES)) {
    if (flPetitionDeadline(county, Y) < fallback) {
      errors.push(`${county} closes ${iso(flPetitionDeadline(county, Y))}, before the unknown-county fallback ${iso(fallback)} — lower FL_UNKNOWN_COUNTY_DEADLINE`);
    }
  }

  // 4. close AND hard MUST MOVE TOGETHER. The Georgia override moved close and
  //    left hardDeadline on the state value, which aimed send-letter's Lob
  //    delivery check and minDays/tooClose weeks past the real cliff. Assert the
  //    fix in both states rather than trusting it.
  for (const [state, county] of [['FL', 'Hillsborough'], ['FL', 'Levy'], ['GA', 'DeKalb'], ['GA', 'Fulton']]) {
    const w = getFilingWindowStatus(state, county);
    if (iso(w.closeDate) !== iso(w.hardDeadline)) {
      errors.push(`${state}/${county}: closeDate ${iso(w.closeDate)} and hardDeadline ${iso(w.hardDeadline)} disagree — send-letter would check Lob's delivery estimate against the wrong date`);
    }
  }

  // 5. A MONEY GATE MUST NEVER ASK WITHOUT A COUNTY.
  //    Florida has no statewide deadline. getFilingWindowStatus with no county
  //    returns the statewide 18 September, which is Miami-Dade's date and later than
  //    every other county we have dated. Two callers did exactly that and it was
  //    invisible: lib/fulfillOrder.js gated the physical mailing on bare stateCode,
  //    and pages/apply.js resolved the county for Georgia only. A Hillsborough order
  //    bought on 1 Sept was measured against 18 Sept when that board closes on the
  //    7th, and Florida is satisfied by RECEIPT.
  //
  //    The old defence was a comment asking callers to pass the county. This is the
  //    same request with a build behind it.
  // 5b. CHECKOUT MUST NOT SELL A COUNTY DISPATCH WILL REFUSE.
  //     getFlVabFee() does not fail on an unknown county — it returns a DEFAULT
  //     {vabFee: 5000, confidence: 'estimated'}. So checkout priced $89 + a guessed
  //     $50 for a county that does not exist, and for the six with no verified VAB
  //     address. Both gates already lived in send-letter.js, which refuses AFTER the
  //     card is charged. /terms section 6 says "we decline the order rather than take
  //     your money" — this is the check that makes that true.
  {
    const { readFileSync: rf } = await import('node:fs');
    let src = '';
    try { src = rf(new URL('../pages/api/checkout.js', import.meta.url), 'utf8'); }
    catch { errors.push('pages/api/checkout.js is missing'); }
    if (src) {
      if (!/isFlCountySupported\s*\(/.test(src)) {
        errors.push('pages/api/checkout.js no longer checks isFlCountySupported — it will sell a Florida county with no verified VAB address, and send-letter will refuse to mail it after the card is charged');
      }
      if (!/confidence\s*!==\s*'confirmed'/.test(src)) {
        errors.push("pages/api/checkout.js no longer checks the VAB fee confidence — getFlVabFee returns an ESTIMATED $50 default for any unknown county, so checkout would charge a guessed fee");
      }
    }
  }

  const MONEY_GATES = [
    // The route that charges the card. /terms section 5 states as a TERM of the
    // agreement that the cut-off "is enforced automatically at checkout: if it has
    // passed for your county, we will not take your money." Until 15 Aug 2026 this
    // file contained no filing-window check at all — the funnel gated correctly, but
    // the funnel is a browser, so a tab left open across the cut-off or a direct POST
    // reached Stripe. A contract describing a control that does not exist is worse
    // than one that promises nothing.
    'pages/api/checkout.js',
    'lib/fulfillOrder.js',
    'lib/healthChecks.js',
    'pages/api/send-letter.js',
    'pages/api/cron/process-queued-orders.js',
    'pages/api/cron/notify-waitlist.js',
  ];
  const { readFileSync } = await import('node:fs');
  const CALL = /getFilingWindowStatus\s*\(([^;]*?)\)\s*;/gs;
  for (const rel of MONEY_GATES) {
    let src;
    try { src = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'); }
    catch { errors.push(`${rel}: money-gating file is missing — update MONEY_GATES or restore the file`); continue; }

    const calls = [...src.matchAll(CALL)].filter(m => !m[1].includes('//'));
    if (!calls.length) {
      errors.push(`${rel}: no getFilingWindowStatus call found — this file is listed as a money gate, so either it stopped gating (drop it from MONEY_GATES) or the call was renamed`);
      continue;
    }
    for (const c of calls) {
      const args = c[1];
      if (!/strict\s*:\s*true/.test(args)) {
        errors.push(`${rel}: getFilingWindowStatus(${args.trim().slice(0, 60)}) gates money without { strict: true } — with no county Florida silently returns 18 Sept, the latest date in the state`);
      }
    }
  }

  // apply.js is split: one call drives "N days left" copy and is deliberately
  // loose; the ones that decide whether we take the money must be strict. Assert
  // the counts rather than the line numbers, which move.
  //
  // 3/2 -> 4/3 on 23 Aug 2026. The fourth is the verdict effect in ApplyFunnel,
  // which re-runs the window gate for a customer arriving from /check with their
  // county already resolved from the DOR roll. That customer does not pass through
  // StepProperty any more, so without this call they would pass NO window check
  // inside the funnel at all — /api/checkout would still refuse them, but only
  // after they had picked their defects, priced them, and reached the card.
  //
  // Raising these numbers is a decision, not maintenance. Anything that increments
  // them is a new place where the funnel decides whether Florida is open. The
  // question to answer before editing this line is which call it is and whether it
  // gates money; if it does, it is strict.
  //
  // NOTE ON THE MATCHER: CALL spans newlines and only skips a `//` line, so a call
  // written out in PROSE inside a block comment is counted as a real one. A comment
  // in the verdict effect describing this very gate did exactly that and failed the
  // build for a call that does not exist. If this assertion fires and the arithmetic
  // does not add up, check the comments before the code.
  {
    const src = readFileSync(new URL('../pages/apply.js', import.meta.url), 'utf8');
    const all = [...src.matchAll(CALL)].filter(m => !m[1].includes('//'));
    const strict = all.filter(c => /strict\s*:\s*true/.test(c[1]));
    if (all.length !== 4 || strict.length !== 3) {
      errors.push(`pages/apply.js: expected 4 getFilingWindowStatus calls of which 3 strict (the sale gate, the review screen, and the /check verdict effect), found ${all.length} of which ${strict.length} strict`);
    }
  }

  // 6. strict WITH NO COUNTY MUST BE THE CONSERVATIVE ANSWER, NOT THE GENEROUS ONE.
  //    This is the property the whole option exists for.
  {
    const loose  = getFilingWindowStatus('FL');
    const tight  = getFilingWindowStatus('FL', null, { strict: true });
    const fallbk = flPetitionDeadline('Notarealcounty', Y);
    if (iso(tight.hardDeadline) !== iso(fallbk)) {
      errors.push(`strict FL with no county gives ${iso(tight.hardDeadline)}, expected the unknown-county fallback ${iso(fallbk)}`);
    }
    if (tight.hardDeadline >= loose.hardDeadline) {
      errors.push(`strict (${iso(tight.hardDeadline)}) is not earlier than loose (${iso(loose.hardDeadline)}) — strict is not doing anything`);
    }
    // And it must not quietly change the copy path.
    if (iso(loose.hardDeadline) !== `${Y}-09-18`) {
      errors.push(`non-strict FL with no county moved to ${iso(loose.hardDeadline)}; apply.js:256 copy depends on the statewide 18 Sept`);
    }
    // A named county must win over both, in strict and loose alike.
    for (const mode of [undefined, { strict: true }]) {
      const w = getFilingWindowStatus('FL', 'Hillsborough', mode);
      if (iso(w.hardDeadline) !== `${Y}-09-07`) {
        errors.push(`Hillsborough (strict=${!!mode?.strict}) gives ${iso(w.hardDeadline)}, expected ${Y}-09-07`);
      }
    }
  }

  // 7. THE CAPPED-VALUE TRAP MUST STAY WIRED.
  //    Florida's TRIM notice prints Just, Assessed and Taxable. Only Just is what a
  //    DR-486 disputes; the line headed "Assessed Value" is the Save Our Homes capped
  //    figure. The manual-override field said "Assessed Value" in every state and
  //    told the owner to copy it off their bill, /api/lookup preferred it over the
  //    roll, and /api/check never saw it at all — so the screen that cleared the
  //    customer and the document they swore to ran on different numbers.
  //
  //    Three parts, and the defect returns if any one of them is removed.
  {
    const files = {
      'pages/api/lookup.js': [
        [/manualValueLooksCapped\s*=\s*\{/, 'lookup.js no longer SETS manualValueLooksCapped — the capped-value trap is not detected'],
        [/cappedAssessedValue, taxableValue, landValue, manualValueLooksCapped/, 'lookup.js no longer RETURNS manualValueLooksCapped — it is computed and thrown away'],
        [/typed <= cappedAssessedValue \* 1\.015/, 'the capped-value test is no longer at-or-below the cap. A band centred on this year\'s capped figure misses last year\'s Assessed column (~3% lower on a homestead), which is the misread a two-column TRIM notice invites most'],
      ],
      'pages/apply.js': [
        [/if \(bdJson\?\.manualValueLooksCapped\)/, 'apply.js no longer READS manualValueLooksCapped — the funnel proceeds on a capped figure'],
        [/setValueConflict\(v\)/, 'apply.js no longer BLOCKS on the conflict'],
        [/isFL \? "Just \(Market\) Value" : "Assessed Value"/, 'the FL manual-override field is labelled "Assessed Value" again — that label is what invites the wrong number'],
      ],
    };
    const { readFileSync: rf } = await import('node:fs');
    for (const [rel, checks] of Object.entries(files)) {
      let src = '';
      try { src = rf(new URL(`../${rel}`, import.meta.url), 'utf8'); }
      catch { errors.push(`${rel}: missing`); continue; }
      for (const [re, why] of checks) if (!re.test(src)) errors.push(why);
    }
  }

  const known = Object.keys(FL_COUNTY_DATES).length;
  console.log(`  FL deadlines:        ${known} counties dated; the other ${names.length - known} fall back to ${iso(fallback)}`);
  // DERIVED, NOT HARDCODED. This line named Hillsborough literally, because Hillsborough
  // was the earliest county on the day it was written. On 19 Aug 2026 Indian River was
  // confirmed at 4 Sept, and the line went on printing "Hillsborough" — stating something
  // that had become false while still looking like it had checked. Same shape as the fee
  // checker that once found zero claims and passed silently.
  {
    const earliest = Object.keys(FL_COUNTY_DATES)
      .map((c) => [c, flPetitionDeadline(c, Y)])
      .sort((a, b) => a[1] - b[1])[0];
    console.log(`                       earliest is ${iso(earliest[1])} (${earliest[0]}), not the 2026-09-18 we used to apply statewide`);
  }
  if (known < 10) {
    errors.push(`only ${known} FL counties carry a date — this table has been emptied, not merely left incomplete`);
  }
}

const blocked = names.filter(n => getFlVabAddressRaw(n)?.confidence !== 'confirmed');
console.log(`Florida data check — ${names.length} counties`);
console.log(`  sellable:            ${names.length - blocked.length - warnings.length}`);
console.log(`  blocked (unverified address): ${blocked.length}${blocked.length ? ' — ' + blocked.join(', ') : ''}`);
warnings.forEach(w => console.log(`  WARN  ${w}`));

if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):`);
  errors.forEach(e => console.error(`  ✗ ${e}`));
  process.exit(1);
}
console.log('\n✓ all confirmed counties resolve');
