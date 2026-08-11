#!/usr/bin/env node
/**
 * WHAT THE DR-486 ACTUALLY SAYS.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * The 5 Aug 2026 test dispatch produced a real Lob proof of a real petition, and
 * reading it found nine defects that every existing suite passed straight over.
 * They were not crashes. The document rendered, the build was green, and the page
 * was wrong — on a filing sent to a government board over a homeowner's signature
 * sworn under penalty of perjury.
 *
 * The three that mattered most:
 *
 *   PROMISES OF EVIDENCE THAT WILL NEVER COME. Three separate sentences said the
 *   owner "will submit" or "will provide" comparable sales — while Part 2 declared
 *   the owner would not attend the hearing, and nothing further was ever going to be
 *   sent. A board reading that waits for a package that does not exist and rules on
 *   an apparently abandoned filing. The model was not hallucinating: the prompt
 *   instructed it to say exactly that.
 *
 *   RAW MARKDOWN ON A LEGAL FORM. "# EVIDENCE AND ARGUMENT", "## 1. BASIS OF
 *   PETITION", "**Florida Statutes**" printed literally, because evidenceText is
 *   rendered inside a white-space:pre-wrap block.
 *
 *   A SWORN ATTESTATION DATED A DAY LATE. Signed 22:09 US Central; the petition read
 *   the following day, because Vercel runs UTC and the date carried no timeZone.
 *
 * Every assertion below corresponds to something that was actually printed and
 * mailed in test. This suite reads the rendered document rather than trusting the
 * prompt, because "we told the model not to" is not a guarantee.
 */

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

register('./resolve-extensionless.mjs', import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/**
 * Source with comments stripped.
 *
 * Needed for any assertion of the form "this bad line is GONE". The block comments
 * added on 11 Aug quote the exact lines they replaced — which is the most useful
 * text in those files for whoever reads them next — and a raw-text check matches
 * the quote and fails on correct code. A check that punishes writing down the
 * reason teaches people to delete the reason.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const readCode = (p) => stripComments(read(p));

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} — got: ${JSON.stringify(got)}`));

const { buildDR486Html, bareCounty, flDate, stripMarkdown } =
  await import('../pages/api/generate-dr486.js');

// ── The helpers, directly ─────────────────────────────────────────────────────
t('bareCounty strips a trailing suffix', bareCounty('Broward County') === 'Broward', bareCounty('Broward County'));
t('bareCounty leaves a bare name alone', bareCounty('Broward') === 'Broward');
t('bareCounty keeps hyphenated names intact', bareCounty('Miami-Dade County') === 'Miami-Dade');
t('bareCounty survives null', bareCounty(null) === '');
t('bareCounty does not eat an internal "County"', bareCounty('County Line') === 'County Line', bareCounty('County Line'));

// The exact timestamp from the 5 Aug order: signed 22:09 US Central, stored as UTC.
t('a signature at 22:09 Central renders as the SAME day in Florida',
  flDate('2026-08-06T03:09:59.829+00:00') === 'August 5, 2026',
  flDate('2026-08-06T03:09:59.829+00:00'));
t('flDate returns null for junk rather than "Invalid Date"', flDate('nonsense') === null);
t('flDate with no argument still produces a date', typeof flDate() === 'string');

{
  const md = '# EVIDENCE AND ARGUMENT\n\n## 1. BASIS OF PETITION\n\n**Florida Statutes § 193.011** applies.\n- a point\n* another\nThe `value` is wrong.';
  const out = stripMarkdown(md);
  t('headings lose their hashes', !/#/.test(out));
  t('bold markers are removed', !/\*\*/.test(out));
  t('backticks are removed', !/`/.test(out));
  t('bullets become real bullet characters', out.includes('• a point'));
  t('the WORDS survive stripping', out.includes('Florida Statutes § 193.011 applies.') && out.includes('EVIDENCE AND ARGUMENT'));
  t('a statutory § is untouched', out.includes('§ 193.011'));
  t('plain prose passes through unchanged',
    stripMarkdown('The assessed value exceeds just value.') === 'The assessed value exceeds just value.');
}

// ── The rendered petition ─────────────────────────────────────────────────────
// Deliberately hostile inputs: a county that already carries its suffix, and
// evidence full of the markdown the live document actually contained.
const HTML = buildDR486Html({
  ownerFirstName: 'Nathan',
  ownerLastName: 'Emms',
  ownerEmail: 'owner@example.com',
  ownerPhone: '',
  ownerStreet: '1130 GLENWOOD CT',
  ownerCity: 'WESTON',
  ownerState: 'FL',
  ownerZip: '33326',
  propertyAddress: '1130 GLENWOOD CT, WESTON, FL 33326',
  county: 'Broward County',
  parcelId: '504007071100',
  assessedValue: 1047630,
  requestedValue: 859057,
  taxYear: '2026',
  evidenceText: '# EVIDENCE AND ARGUMENT\n\n## 1. BASIS OF PETITION\n\n**The assessed value** exceeds just value.\n- point one',
  vabName: 'Broward County Value Adjustment Board',
  ownerSignatureName: 'Nathan Emms',
  ownerSignatureDate: '2026-08-06T03:09:59.829+00:00',
  filingDate: 'August 5, 2026',
  preview: false,
  willNotAttend: true,
  authorizeConfidential: true,
});

t('the county name is not doubled anywhere', !/County County/.test(HTML));
t('the VAB is still named in full', HTML.includes('Broward County Value Adjustment Board'));

t('no markdown headings survive to the page', !/(^|>)\s*#{1,6}\s/m.test(HTML));
t('no bold markers survive to the page', !/\*\*/.test(HTML));

t('the signature date is the Florida-local day', HTML.includes('August 5, 2026'));
t('the signature date is NOT the UTC day', !HTML.includes('August 6, 2026'));
t('no raw ISO timestamp is printed', !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(HTML));
t('no "Invalid Date" reaches the form', !/Invalid Date/.test(HTML));

// We enclose one petition with its evidence. We do not send duplicate copies, and
// on the 5 Aug document we sent no evidence at all while asserting we had.
t('does not claim duplicate copies were submitted', !/Duplicate copies submitted/i.test(HTML));
t('the non-attendance election is still stated', /will not attend the hearing/i.test(HTML));

// The footer used to declare the piece already mailed, on a document generated
// weeks before it is mailed — the same false tense as the email receipt.
t('the footer does not claim it has already been mailed', !/Prepared and mailed:/.test(HTML));
t('the footer still records when it was prepared', /Prepared:/.test(HTML));

// The parts that make the legal posture work must not be lost to any of this.
t('Part 3 carries the perjury attestation', /penalties of perjury/i.test(HTML));
t('Part 3 cites the signing statute', /194\.011\(3\)/.test(HTML));
t('Parts 4 and 5 remain not applicable', (HTML.match(/Not applicable/gi) || []).length >= 2);
t('the preparer is disclaimed as non-representative', /not the owner's representative/i.test(HTML));

// ── No empty labelled boxes on a sworn form ──────────────────────────────────
// The funnel does not collect a phone number, so Part 1 rendered an empty "Phone"
// field. On a document a VAB clerk reads, a blank labelled box looks like an
// oversight and invites a request for more information — friction nobody wants on a
// filing whose deadline is satisfied by physical receipt. The petition already
// states "Preferred Contact: Email" and the owner has elected not to attend, so the
// number adds nothing. Rendered only when we actually have one.
{
  t('no empty Phone box when no phone is held', !/Phone<\/div><div class="field-value"><\/div>/.test(HTML));
  t('no &nbsp; placeholder standing in for a phone', !/Phone<\/div><div class="field-value">&nbsp;/.test(HTML));
  t('the Phone label is absent entirely when unset', !/>Phone</.test(HTML));

  const withPhone = buildDR486Html({
    ownerFirstName: 'Nathan', ownerLastName: 'Emms', ownerEmail: 'owner@example.com',
    ownerPhone: '954-555-0142',
    ownerStreet: '1130 GLENWOOD CT', ownerCity: 'WESTON', ownerState: 'FL', ownerZip: '33326',
    propertyAddress: '1130 GLENWOOD CT, WESTON, FL 33326', county: 'Broward County',
    parcelId: '504007071100', assessedValue: 1047630, requestedValue: 859057, taxYear: '2026',
    evidenceText: 'Plain evidence.', vabName: 'Broward County Value Adjustment Board',
    ownerSignatureName: 'Nathan Emms', ownerSignatureDate: '2026-08-06T03:09:59.829+00:00',
    filingDate: 'August 5, 2026', preview: false, willNotAttend: true, authorizeConfidential: true,
  });
  t('a phone IS shown when one is held', /954-555-0142/.test(withPhone));
  t('the Phone label returns with it', />Phone</.test(withPhone));
}

// ── The prompt, since it is what generated the promises ──────────────────────
{
  const src = read('pages/api/generate-dr486.js');
  const prompt = src.slice(src.indexOf('const evidencePrompt'), src.indexOf('Professional, factual, first person'));

  t('the prompt no longer instructs the model to promise separate evidence',
    !/will submit comparable sales separately/i.test(prompt));
  t('the prompt forbids promising future evidence', /NEVER PROMISE FUTURE EVIDENCE/.test(prompt));
  t('the prompt names the phrases to avoid', /"I will submit"/.test(prompt));
  t('the prompt forbids markdown', /OUTPUT PLAIN PROSE ONLY/.test(prompt));
  t('the prompt forbids claiming unperformed analysis',
    /do not write that comparable sales were analysed/i.test(prompt));
  t('the anti-invention rule is still intact',
    /DO NOT invent, estimate, or state any specific comparable sale/.test(prompt));
  t('the cost-of-sale prohibition is still intact', /eighth criterion/.test(prompt));

  // Belt and braces: the render strips markdown even if the model ignores the rule.
  t('the renderer strips markdown regardless of the prompt',
    /stripMarkdown\(evidenceText\)/.test(src));
}

// ── A truncated petition must never reach a signature ────────────────────────
// The 6 Aug proof ended mid-word: "the amount a willing purch". max_tokens was 2000
// and nothing checked stop_reason, so the LEGAL BASIS section — including the
// s. 194.301 burden-of-proof argument — was simply absent from a document sworn to
// under penalty of perjury. The ceiling was survivable until real comparable sales
// started reaching the evidence; six sales with full detail is most of that budget.
{
  const src = read('pages/api/generate-dr486.js');

  t('the evidence token budget is a named constant', /EVIDENCE_MAX_TOKENS\s*=\s*(\d+)/.test(src));
  const budget = Number(/EVIDENCE_MAX_TOKENS\s*=\s*(\d+)/.exec(src)?.[1] || 0);
  t('the budget is well clear of the 2000 that truncated a real petition', budget >= 4000, budget);
  t('the hardcoded 2000 is gone', !/max_tokens:\s*2000/.test(src));

  t('truncation is detected via stop_reason, not hoped away', /stop_reason === 'max_tokens'/.test(src));
  t('a truncated response is retried with a larger budget', /EVIDENCE_MAX_TOKENS \* 2/.test(src));
  t('a twice-truncated petition throws rather than being built',
    /truncated twice/.test(src));

  // The whole point: no caller may receive a half-finished sworn document.
  const genBlock = src.slice(src.indexOf('const askClaude'), src.indexOf('const filingDate'));
  t('evidenceText is only assigned after the truncation check',
    genBlock.indexOf('throw new Error') < genBlock.indexOf('evidenceText = attempt.text'));
}

/**
 * ============================================================================
 * A PETITION MUST IDENTIFY THE PARCEL AND STATE THE VALUES IN DISPUTE
 * ============================================================================
 * Added 11 Aug 2026 after tracing an order with no county roll record end to end.
 *
 * What it produced: a DR-486 carrying the literal string "See county records" in
 * the folio box, the current-assessed-value box AND the requested-value box, under
 * a pre-checked assertion that the assessed value exceeds market value, above a
 * Part 3 declaration signed under penalty of perjury. Nothing in the funnel, the
 * generator or the dispatch preflight asked for a parcel.
 *
 * Three independent gates now stop it, and all three are asserted here. They are
 * deliberately redundant: the funnel one is the only one the customer ever sees,
 * and the other two exist for the day it regresses.
 */
{
  const dr486 = read('pages/api/generate-dr486.js');
  const apply = readCode('pages/apply.js');
  const proc  = read('lib/processOrder.js');

  // GATE 1 — the generator refuses.
  t('the petition generator refuses without a parcel and both values',
    /FL_MISSING_PARCEL_FACTS/.test(dr486),
    'without this a blank-parcel petition is generated rather than refused');
  t('the refusal tests the parcel, the assessed value and the requested value',
    /missingPetitionFacts/.test(dr486) &&
    /parcel\/folio number/.test(dr486) &&
    /current assessed value/.test(dr486) &&
    /requested value/.test(dr486));

  // The placeholder itself. This is the specific string that made a gap look like
  // content on a sworn form.
  t('"See county records" is gone from the DR-486 as a value fallback',
    !/:\s*'See county records'/.test(dr486) && !/\?\s*`\$\$\{[^}]*\}`\s*:\s*'See county records'/.test(dr486),
    'a blank is honest; a sentence in the value box reads as though a figure were supplied');
  t('parcelId is passed through rather than defaulted to a placeholder',
    !/parcelId:\s*parcelId\s*\|\|/.test(dr486));

  // GATE 2 — the funnel refuses, and does not confuse "missing" with "broken".
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
  const effectStart = apply.indexOf('function StepFloridaCheck');
  const effectBody = apply.slice(effectStart, apply.indexOf("}, [(issues || []).join('|')]);", effectStart));
  t('the eligibility effect was located for inspection', effectStart > -1 && effectBody.length > 200);

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

  // GATE 3 — dispatch refuses, after money has changed hands.
  t('FL dispatch preflight requires a parcel and an assessed value',
    /account_number/.test(proc) && /assessed_value/.test(proc) && /REFUND THIS ORDER/.test(proc),
    'missingCore required only letter_text and owner_street, so a blank-parcel order mailed');
  t('the FL preflight does not refuse Texas and Georgia orders',
    /if \(isFLOrder\) \{/.test(proc),
    'those states mail a district letter, not a fee-bearing petition keyed on a folio');
}

/**
 * ============================================================================
 * FLORIDA RUNS ON COUNTY DATA — AND CITES THE SOURCE IT ACTUALLY HAS
 * ============================================================================
 * Added 11 Aug 2026. Two separate defects, both live at the time, both invisible
 * to every existing check.
 *
 * ONE — misattribution. generate-dr486.js emitted a single hardcoded source line
 * ("qualified arms-length sales from the Florida Department of Revenue sale data
 * file … drawn from the same appraiser neighborhood") under whatever comps array
 * it was handed. pages/api/comps.js has two paths: county (basis.source ===
 * 'county') and a RentCast fallback with no basis and no supportsReduction key —
 * so `undefined !== false` admitted it. Vendor rows were printed under the DOR
 * attribution on a document signed under penalty of perjury, while the vendor
 * payload's own correct label was discarded.
 *
 * TWO — the value itself. RentCast normalises every state into one assessment
 * figure and cannot say whether Florida's is just value or the Save Our Homes
 * capped value. A DR-486 disputes JUST value. Measured: 26% below the county on a
 * real Hillsborough parcel. Three flags exist to catch this and none has a reader.
 */
{
  const dr486  = read('pages/api/generate-dr486.js');
  const apply  = readCode('pages/apply.js');
  const lookup = readCode('pages/api/lookup.js');
  const comps  = readCode('pages/api/comps.js');

  // Attribution
  t('the petition only uses comps whose provenance is known',
    /compsProvenanceOk/.test(dr486) && /compsSource === 'county'/.test(dr486),
    'the DOR source line is a factual assertion and was printed over any array supplied');
  t('compRows is gated on provenance, not just on being an array',
    /const compRows = \(compsProvenanceOk && Array\.isArray\(comps\)/.test(dr486),
    'gating the source line but not the rows would print the sales with no source at all');
  /**
   * Bound to the ASSIGNMENT, not to the variable.
   *
   * The first version tested that `compsAreCountySourced` appeared in the file.
   * Deleting it from the admission `if` left both its declaration and the `else if`
   * that logs the rejection, so the check passed on code that admitted vendor comps
   * again. Assert the guard sits immediately in front of the line it guards.
   */
  t('the funnel refuses to forward comps that are not county-sourced',
    /compsAreCountySourced\)\s*\{\s*flComps = cJson\.comps;/.test(apply),
    'the provenance test has to be in the admission branch, not merely declared nearby');
  t('the comps source travels with the comps',
    /compsSource: flCompsSource/.test(apply),
    'without it the generator has to assume, which is how the misattribution happened');

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
  console.error(`verify-petition: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-petition: ${pass} passed — the DR-486 promises nothing it will not deliver`);
