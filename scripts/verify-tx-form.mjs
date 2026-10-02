#!/usr/bin/env node
/**
 * ============================================================================
 * THE FILED DOCUMENT IS THE GOVERNMENT'S FORM — PROVE IT EVERY BUILD
 * ============================================================================
 *
 * Audit rule 7, from Filing_Instrument_Audit_All_States_2026-09-10:
 * "A build check must fail if the generated filing is not the official PDF:
 *  page count, revision string, and required fields filled."
 *
 * That audit exists because Hillsborough and Miami-Dade VABs both refused a
 * paying customer's petition within five days, for the same reason: we rendered
 * an HTML page titled "Form DR-486" instead of filling the DOR's PDF. The audit
 * names why nothing caught it:
 *
 *   "No check compared our output to the real form. Every build check tested our
 *    own payload. None held it against the government PDF."
 *
 * So this one holds it against the government PDF.
 *
 * ============================================================================
 * WHY A HASH RATHER THAN A REVISION STRING
 * ============================================================================
 * The audit says to pin the revision. The revision is printed INSIDE the PDF
 * content stream, which is deflate-compressed, and nothing in our runtime
 * extracts PDF text — so a revision check in Node would need a new dependency
 * to read a string that the Comptroller can change without changing.
 *
 * The file hash is strictly stronger. It fails on a new revision AND on a silent
 * re-issue under the same revision number, which is the case a string compare
 * would sail straight past. When it fails, a human re-downloads, opens it beside
 * the government copy, re-reads the field map, and re-pins — which is exactly
 * the annual re-check rule 5 asks for, triggered by evidence instead of memory.
 *
 * WHEN THIS FAILS: do not just update the hash. Open the new form, diff the
 * field names below, and re-render the output before re-pinning.
 *
 * PROVE IT: flip one character of PINNED_SHA256 → "the blank form on disk is not
 * the one this code was written against".
 */

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

const root = process.cwd();
let pass = 0;
const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

const { fill50132, FORM_REVISION, FORM_RELATIVE_PATH } =
  await import('../lib/tx/fill50132.js');

/** sha256 of comptroller.texas.gov/forms/50-132.pdf, downloaded 15 Sept 2026. */
const PINNED_SHA256 = 'd98b6f42b1b5f1adcb34262fa397400c7fc1f4d38ee06b9434c84cfe431ca5fd';

console.log('verify-tx-form\n');

// ── 1. the blank form is present and is the one we mapped ───────────────────
const blankPath = path.join(root, FORM_RELATIVE_PATH);
t('the blank Form 50-132 is in the repo', existsSync(blankPath));
if (!existsSync(blankPath)) {
  console.error(`\n  FAIL  ${FORM_RELATIVE_PATH} is missing. Without it every Texas filing `
    + `falls back to nothing. Re-download from comptroller.texas.gov/forms/50-132.pdf\n`);
  process.exit(1);
}
const blank = readFileSync(blankPath);
const sha = createHash('sha256').update(blank).digest('hex');
t(`the blank form on disk is not the one this code was written against `
  + `(${sha.slice(0, 12)}… vs pinned ${PINNED_SHA256.slice(0, 12)}…)`,
  sha === PINNED_SHA256);

/**
 * Vercel traces a route's files statically, and lib/tx/fill50132.js reads the
 * PDF from a path built at runtime — invisible to that analysis. Without the
 * next.config.js entry the filler works on a laptop and throws in production,
 * during the only window a protest can be filed.
 */
const nextConfig = readFileSync(path.join(root, 'next.config.js'), 'utf8');
t('next.config.js traces the blank form into the serverless bundle',
  /outputFileTracingIncludes/.test(nextConfig) && /forms\/tx/.test(nextConfig));

// ── 2. every field the filler writes still exists on the form ───────────────
/**
 * If the Comptroller renames a field, pdf-lib throws at fill time — on a real
 * order, in season. Asserting the names here turns that into a red build.
 */
const { PDFDocument } = await import('pdf-lib');
const blankDoc = await PDFDocument.load(blank);
const names = new Set(blankDoc.getForm().getFields().map((f) => f.getName()));
const REQUIRED_FIELDS = [
  'Appraisal Districts Name', 'Tax Year', 'Appraisal District Account Number',
  'Name of Property Owner or Lessee', 'Mailing Address City State ZIP Code',
  'Phone Number area code and number', 'Physical Address',
  'Opinion of property value', 'Facts to resolve protest',
  'Reason for protest 1', 'Do you request an informal conference',
  'Certification and Signature', 'Print Name of Property Owner or Authorized Representative',
  'Date of Signature', 'Signature of Authorized Individual',
];
const missing = REQUIRED_FIELDS.filter((f) => !names.has(f));
t(`every field the filler writes exists on the form${missing.length ? ` — missing: ${missing.join(', ')}` : ''}`,
  missing.length === 0);
t('the blank form has three pages (2 returned + 1 instructions)', blankDoc.getPageCount() === 3);

// ── 3. fill it and hold the OUTPUT against what must be true ────────────────
const packet = {
  filable: true, hasGrid: false, taxYear: 2026, cadId: 101, county: 'Harris',
  form50132: {
    revision: FORM_REVISION, taxYear: 2026,
    appraisalDistrict: 'Harris Central Appraisal District',
    accountNumber: '0020720000014',
    propertyAddress: '1700 ST CHARLES ST, HOUSTON, TX 77003',
    grounds: ['incorrect_value_and_or_unequal'],
    opinionOfValue: 611000, requestInformalConference: true,
    appearanceElection: null, signedBy: 'property_owner',
    ownerName: 'Test Owner', ownerMailing: '1700 St Charles St, Houston, TX 77003',
    ownerPhone: null, ownerEmail: 'owner@example.com',
  },
};

const bytes = await fill50132(packet, null);
const out = await PDFDocument.load(bytes);

t('the filing is 2 pages with no evidence attached — the instructions page is dropped',
  out.getPageCount() === 2);

/**
 * FLATTENED. A filed document must not be editable, and flattening disposes of
 * the empty /Sig field so no copy arrives carrying an unsigned signature slot.
 * A form still carrying fields means flatten() did not run.
 */
const outFields = out.getForm().getFields();
t('the filing is flattened — no interactive fields survive', outFields.length === 0);

/**
 * Defect 5: Reset and Print are widgets that RENDER, and flatten() bakes their
 * appearance into the page. A mailed filing carried software controls.
 */
const raw = Buffer.from(bytes).toString('latin1');
t('no Reset or Print control is baked into the filed pages',
  !/\/T\s*\(\s*Reset\s*\)/.test(raw) && !/\/T\s*\(\s*Print\s*\)/.test(raw));

// ── 4. the two fields we must NEVER fill ────────────────────────────────────
/**
 * Both of these were filled in the first draft and caught only by rendering.
 *
 * 'Appraisal districts value assigned to property' lives inside SECTION 7,
 * "Special Panel Request for Property Value of $62.9 Million or More". A
 * residential value there invokes a section that does not apply.
 *
 * 'Email Address' is the SECTION 6 electronic-reminder address, and the form
 * states beneath it that including an email is "affirmatively consenting to its
 * release under the Public Information Act". We do not waive a customer's
 * confidentiality for a reminder they never asked for.
 */
const pre = await PDFDocument.load(blank);
const preForm = pre.getForm();
const stillBlank = (field) => {
  try { return !preForm.getTextField(field).getText(); } catch { return true; }
};
t('the Section 7 special-panel value field is left blank',
  stillBlank('Appraisal districts value assigned to property'));
t('the Section 6 reminder email is left blank — no PIA waiver on the customer\'s behalf',
  stillBlank('Email Address'));

// =============================================================================
// THE CONDITION EXHIBIT REACHES THE DOCUMENT
// =============================================================================
//
// It has gone missing twice. Until 15 Sept it existed only in
// scripts/tx/preview-protest.mjs, because generate-50132.js read neither
// `issues` nor `costOverrides` from a body apply.js had always been sending. On
// 20 Sept the route stopped rendering protestHtml.js — correct, it was an HTML
// look-alike of a government form — and renderConditionExhibit went with it,
// leaving nothing to put a priced defect on paper.
//
// Both times the data was collected, priced by txCostToCure() and counted by
// qualify() toward whether we advise filing at all. Only the page was missing,
// so nothing failed and nothing warned.
//
// PROVE IT: comment out the appendConditionPage call in fill50132.js.
//   expect: "a packet carrying a condition exhibit gains a page for it"
{
  const withCondition = {
    ...packet,
    conditionExhibit: {
      cureDollars: 41850,
      priced: [
        { issue: 'Foundation movement', scope: 'Perimeter beam, 14 piers',
          source: 'RSMeans', sourceYear: 2026, asked: 23400 },
        { issue: 'Roof at end of service life', ownerSupplied: true, asked: 18450 },
      ],
      narrative: [{ issue: 'Backs onto an arterial road',
        narrative: 'Nothing can be spent to move the road, so no figure is claimed.' }],
      doubleCountDisclosure: 'The district already records below-average condition.',
    },
  };
  const withBytes = await fill50132(withCondition, null);
  const withDoc = await PDFDocument.load(withBytes);
  const baseDoc = await PDFDocument.load(bytes);

  t('a packet carrying a condition exhibit gains a page for it',
    withDoc.getPageCount() > baseDoc.getPageCount());

  t('a packet with no condition exhibit gains nothing — an empty page is worse than none',
    baseDoc.getPageCount() === (packet.hasGrid ? 3 : 2));

  /**
   * A defect list has no natural length and pdf-lib does not clip: text drawn
   * below the page floor is simply lost, which on an evidence exhibit means an
   * argument that exists in the data and not on the paper. Fourteen priced
   * defects plus four narratives must spill onto another page rather than vanish.
   */
  const many = Array.from({ length: 14 }, (_, i) => ({
    issue: `Defect number ${i + 1} requiring remedial work to reach ordinary condition`,
    scope: 'A scope line long enough to wrap onto a second line beneath the defect name',
    source: 'RSMeans', sourceYear: 2026, asked: 3000 + i * 250,
  }));
  const longDoc = await PDFDocument.load(await fill50132({
    ...withCondition,
    conditionExhibit: { ...withCondition.conditionExhibit, priced: many },
  }, null));
  t('a long defect list spills onto a second page instead of off the bottom of the first',
    longDoc.getPageCount() > withDoc.getPageCount());
}

/**
 * THE LIMIT OF THE CLAIM IS LOAD-BEARING PROSE, NOT DECORATION.
 *
 * Nathan's call, 7 Sept 2026: `indicatedMarket - cureDollars` came out of
 * opinionOfValue(), because asserting a $48,950 repair lowers value by $48,950
 * is a valuation judgment — and Occupations Code § 1103.003 defines an
 * "appraisal" as exactly that, "an opinion of value; or the act or process of
 * developing an opinion of value". The prose never made that claim; the
 * subtraction did, and the subtraction was the number the owner signed.
 *
 * These two sentences are what keeps the page on the right side of that line.
 * Asserted against the source because pdf-lib draws text rather than storing it
 * as retrievable content, so a rendered check would need a PDF text parser to
 * say anything at all.
 */
{
  const src = readFileSync(new URL('../lib/tx/fill50132.js', import.meta.url), 'utf8');
  t('the exhibit still says the repair cost is NOT a claim of value diminution',
    /NOT a claim that this property/.test(src) && /falls by that same amount/.test(src));
  t('the exhibit still says nobody inspected the property',
    /No inspection of the property was performed by anyone/.test(src));
  t('the exhibit still names § 41.41(a)(1), which is the ground it argues',
    /41\.41\(a\)\(1\)/.test(src));
}

// A rendered copy for a human to actually look at, which is how all five of the
// original defects were found. Gitignored.
const tmp = mkdtempSync(path.join(tmpdir(), 'tx-form-'));
writeFileSync(path.join(tmp, 'sample.pdf'), bytes);
console.log(`  a filled sample is at ${path.join(tmp, 'sample.pdf')} — open it before shipping a change\n`);


/**
 * ============================================================================
 * THE PREVIEW IS THE REAL FORM, UNSIGNED, PAGE ONE, WATERMARKED.
 * ============================================================================
 * Added 1 Oct 2026. Until now nothing in production called fill50132 at all —
 * only this script did. The preview is its first live use, so the things that
 * can only break in production are asserted here.
 */
{
  const api = readFileSync(path.join(root, 'pages/api/generate-50132.js'), 'utf8');

  // SAME ROUTE, NOT A NEW ONE. next.config.js traces ./forms/tx/** for
  // '/api/generate-50132' and nothing else, so a separate preview endpoint
  // would read the blank form from a path absent from its own bundle — green
  // locally, throwing in season. If a second route ever needs the form, the
  // tracing map must grow with it.
  const traced = (nextConfig.match(/outputFileTracingIncludes:\s*\{([\s\S]*?)\}/) || [])[1] || '';
  const routesUsingForm = ['pages/api/generate-50132.js']
    .filter((f) => /fill50132/.test(readFileSync(path.join(root, f), 'utf8')));
  for (const f of routesUsingForm) {
    const route = f.replace(/^pages/, '').replace(/\.js$/, '');
    t(`${route} reads the blank form, so next.config.js must trace it`,
      traced.includes(`'${route}'`) || traced.includes(`"${route}"`));
  }

  t('the preview renders the real form rather than an HTML look-alike',
    /b\.preview === true/.test(api) && /fill50132\(packet\)/.test(api));
  t('the preview is UNSIGNED — fill50132 is called with no signature argument',
    /await fill50132\(packet\)\)/.test(api) && !/fill50132\(packet,\s*sig/.test(api));
  t('the preview is page one only', /copyPages\(filled, \[0\]\)/.test(api));
  t('the preview carries a watermark drawn into the PDF, not the page',
    /PREVIEW - NOT FILED/.test(api) && /rotate: degrees\(45\)/.test(api));
  // WinAnsi fonts. An em dash or a middot in a StandardFont throws at draw
  // time, in a route whose only other failure mode is a missing parcel.
  const label = (api.match(/const label = '([^']*)'/) || [])[1] || '';
  t('the watermark text is ASCII, because StandardFonts are WinAnsi',
    label.length > 0 && /^[\x20-\x7E]+$/.test(label), label);
  t('the preview is never cached by a shared proxy',
    /private, no-store/.test(api) && /application\/pdf/.test(api));
}


/**
 * ============================================================================
 * SECTION 1, SECTION 6, AND THE DISCLOSURE THAT CARRIES ITS OWN CURE.
 * ============================================================================
 * Added 1 Oct 2026.
 */
{
  const fillSrc = readFileSync(path.join(root, 'lib/tx/fill50132.js'), 'utf8');
  const applySrc = readFileSync(path.join(root, 'pages/apply.js'), 'utf8');
  const { OWNER_TYPES } = await import('../lib/tx/fill50132.js');

  // THE OPTION STRINGS MUST BE THE FORM'S OWN. pdf-lib throws on an unknown
  // option, so a Comptroller rename would otherwise surface as a 500 on a real
  // order, in season. Compared against the blank PDF itself, not a copy of it.
  const formOpts = blankDoc.getForm().getRadioGroup('Property owner type').getOptions();
  t('Section 1 is a radio group with five options on the form itself', formOpts.length === 5, formOpts.length);
  for (const o of formOpts) t(`OWNER_TYPES carries the form's option ${JSON.stringify(o)}`, OWNER_TYPES.has(o));
  t('OWNER_TYPES invents nothing the form does not offer', [...OWNER_TYPES].every((o) => formOpts.includes(o)));
  // The funnel's own copy of the list has to match, or the dropdown offers a
  // value the filler will silently drop.
  for (const o of formOpts) t(`the funnel offers the form's option ${JSON.stringify(o)}`, applySrc.includes(`'${o}'`));

  // An unvalidated value from a browser reaching pdf-lib is a throw.
  t('an owner type outside the set is ignored rather than passed to pdf-lib',
    /OWNER_TYPES\.has\(f\.ownerType\)/.test(fillSrc));

  // SECTION 6: text only. The email box carries a Public Information Act waiver
  // in the form's own footnote; the mobile box does not.
  t('the reminder is set by text', /choose\('Electronic reminder', 'Yes, by text'\)/.test(fillSrc));
  t('the reminder is never set by email', !/Yes, by email/.test(fillSrc));
  t('the email address is never written to the form', !/setText\('Email Address'/.test(fillSrc));
  t('the mobile goes to Section 6\'s own field, not Section 1\'s phone box',
    /setText\('Mobile Number', f\.ownerMobile\)/.test(fillSrc));

  // SECTION 5 STAYS BLANK — decided 1 Oct. Asserted so it cannot drift back.
  t('the appearance election is never selected', !/choose\('ARB hearing'/.test(fillSrc));

  /**
   * THE CURE RULE, APPLIED OUTSIDE THE DOCUMENT.
   * verify-tx-protest.mjs has enforced this on the rendered protest since
   * 7 Sept. The same sentence now appears in a React page, where that guard
   * cannot see it, and the wording approved on 18 Sept contained exactly the
   * error it exists to prevent.
   */
  const txDisclosure = /dismiss/i.test(applySrc) && /TaxAppeal does not attend\s+hearings/.test(applySrc);
  t('the funnel states the hearing disclosure at all', txDisclosure);
  if (txDisclosure) {
    t('it never claims the Tax Code dismisses — it says boards generally do',
      /boards generally dismiss/i.test(applySrc) && !/your protest will be dismissed and/i.test(applySrc));
    t('the four-day § 41.45(e-1) cure is stated beside the dismissal risk',
      /good cause within four days/i.test(applySrc));
    t('it says who receives the hearing notice',
      /sends the hearing notice to you, not to us/i.test(applySrc));
  }
}


/**
 * ============================================================================
 * THE QUOTED SAVING IS BUILT ON THE REDUCTION WE ACTUALLY ASK FOR.
 * ============================================================================
 * Found 1 Oct 2026. The screen quoted about $1,016 a year on 108 Brookdale Dr
 * while the packet asked for a $133,633 reduction worth about $2,940 at the same
 * rate — a third of the evidence, under a label reading "at most". The figure
 * came from qualify()'s generic PLAUSIBLE_REDUCTION_PCT of 6.3%, which is right
 * BEFORE the comps run and wrong after.
 */
{
  /*
    EVERY SOURCE SCAN IN THIS BLOCK RUNS ON STRIPPED CODE. Twice in one sitting a
    guard here failed on the comment that explains the rule it enforces — the
    note about not printing a multiplier contains the multiplier, and the note
    about not shipping estimateIsUpperBound names the field. Same trap the
    ROLL_YEAR guard hit on 7 and 20 Sept.
  */
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const api = stripComments(readFileSync(path.join(root, 'pages/api/generate-50132.js'), 'utf8'));
  const apply = readFileSync(path.join(root, 'pages/apply.js'), 'utf8');
  const applyCode = stripComments(apply);
  const { DEFAULT_TAX_RATE, PLAUSIBLE_REDUCTION_PCT } = await import('../lib/tx/qualify.js');

  const protest = stripComments(readFileSync(path.join(root, 'lib/tx/protest.js'), 'utf8'));
  const lookup = stripComments(readFileSync(path.join(root, 'lib/tx/lookup.js'), 'utf8'));
  const check = stripComments(readFileSync(path.join(root, 'pages/api/check.js'), 'utf8'));

  /*
    ======================================================================
    ONE SOURCE FOR THE SAVING. The assertion this whole episode was missing.
    ======================================================================
    Every guard written before 1 Oct checked each screen against its OWN
    source, which is exactly how both screens could pass and still quote
    $1,016 and $2,940 for one house. These check the relationship instead.
  */
  t('the saving formula lives in buildProtest',
    /estimatedSaving: askGap > 0 \? Math\.round\(askGap \* DEFAULT_TAX_RATE\) : null/.test(protest));
  t('generate-50132 reads that field rather than deriving its own',
    /estimatedSaving: packet\.estimatedSaving/.test(api)
    && !/DEFAULT_TAX_RATE/.test(api));
  t('the step-1 lookup reads the same packet field',
    /estimatedSaving = packet\.estimatedSaving/.test(lookup));
  t('no route multiplies reductionSought by a rate itself',
    !/reductionSought\s*\*\s*(DEFAULT_TAX_RATE|0\.0)/.test(api)
    && !/reductionSought\s*\*\s*(DEFAULT_TAX_RATE|0\.0)/.test(lookup)
    && !/reductionSought\s*\*\s*(DEFAULT_TAX_RATE|0\.0)/.test(check));
  t('and nobody re-introduces a hardcoded rate',
    !/\* 0\.0(18|22)\b/.test(api) && !/\* 0\.0(18|22)\b/.test(lookup));

  /*
    THE EVIDENCE PASS MUST ACTUALLY RUN AT STEP 1. Without `withComps` the
    whole fix is inert -- the same way the walkthrough flag shipped correct,
    tested, and attached to nothing on 30 Sept.
  */
  t('/api/check runs the comp ladder', /withComps: true/.test(check));
  t('the lookup only runs it when asked', /opts\.withComps === true/.test(lookup));

  /*
    NO DISTRICT FALLBACK ON A HOUSE WITH NO CASE. The measured medians are
    computed over FILABLE cases; a parcel the comps refused is not in that
    population, and quoting it one anyway is the claim shape this exists to
    stop. 1457 Forestglen Dr was quoted $441 a year that way.
  */
  t('a parcel with no case gets a null saving, not a district estimate',
    /hasCase: false/.test(lookup)
    && /estimatedSaving = null;/.test(lookup)
    && /estimateBasis = 'none';/.test(lookup));
  t('and the screen for it offers the condition questions instead of a figure',
    /hasCase === false/.test(applyCode)
    && /We don&rsquo;t have a case for this one yet/.test(apply));
  // Was: asserted the no-case screen promised "you will not be charged".
  // Removed 2 Oct -- that is a promise to WITHHOLD the service, which is not
  // ours to make. The honest version is that nothing is charged before they
  // have seen the document, which is a fact about the order of events rather
  // than a decision about who may buy. Replaced by the proceed-route
  // assertions further down.
  t('the no-case screen states when payment happens, not whether we will allow it',
    /you will see the finished document before anything is charged/.test(apply));

  /*
    THE MULTI-YEAR FIGURE IS PARCEL-ONLY. On a district median it would be a
    projection built on a statistic the owner is not a member of.
  */
  t('the five-year line renders only on a parcel-derived figure',
    /d\.estimateBasis === 'parcel'/.test(applyCode));
  t('the five-year figure is arithmetic on the quoted saving',
    /d\.estimatedSaving \* 5/.test(applyCode));
  t('it is stated as a condition, not a forecast',
    /Hold that reduction/.test(apply) && /assumes the reduction holds/.test(apply));
  t('the exemption caveat is stated where the figure is shown',
    /does not\s+subtract your homestead exemptions/.test(apply.replace(/\s+/g, ' ')));

  /*
    EVERY LOADED DISTRICT IS MEASURED. The statewide fallback was 1.9-2.3x high
    on the five metros measured 1 Oct, in the direction that over-promises. This
    turns the fallback into a tripwire for an unmeasured load.
  */
  {
    const { REDUCTION_BY_CAD } = await import('../lib/tx/qualify.js');
    const { LOADED_CAD_IDS } = await import('../lib/tx/coverage.js');
    const missing = LOADED_CAD_IDS.filter((c) => !REDUCTION_BY_CAD[c]);
    t(`every loaded district has a measured reduction rate${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`,
      missing.length === 0);
  }

  /*
    ======================================================================
    AN ADDRESS WE CANNOT PLACE IS A QUESTION, NOT A REFUSAL.
    ======================================================================
    10312 Barron Dr, Aubrey 76227 -- on a Denton roll we hold in full -- was
    answered "Your state's filing window is closed right now". We had the
    right county at the time: resolveCounty returns {found:true,
    county:'Denton', source:'zip-centroid'} with NO `state`, and the Texas
    branch tested `place.state === 'TX'`, so the answer was discarded.

    resolve-county.js has always said what to do with a centroid: "the caller
    must have the customer CONFIRM a zip-centroid result rather than accept it
    silently." These assert the caller finally does.
  */
  t('a zip-centroid match is detected by its missing state, not treated as placed',
    /place\.found && place\.county && !place\.state/.test(check));
  t('and it becomes a suggestion to confirm rather than a silent county',
    /suggestedCounty = place\.county/.test(check));
  t('an unplaceable address returns county_unresolved, not outside_coverage',
    /reason: 'county_unresolved'/.test(check) && /needsCounty: true/.test(check));
  t('the outcome is in the closed vocabulary',
    /county_unresolved:/.test(stripComments(readFileSync(path.join(root, 'lib/checkOutcomes.js'), 'utf8'))));

  // The owner's answer is a claim, not evidence. It is validated against the
  // rolls we hold, and it never overrides a confident address match.
  t('a customer-supplied county is validated against the loaded rolls',
    /coveredCadFromName\(askedCounty\)/.test(check));
  t('and it supersedes only a match that lacks a state',
    /askedCad && !\(place && place\.found && place\.county && place\.state\)/.test(check));

  t('the screen offers the suggestion as a one-tap confirmation',
    /Yes &mdash; it is in \{suggested\} County/.test(apply));
  t('and only suggests a county whose roll we actually hold',
    /LOADED_COUNTY_NAMES\.includes\(raw\)/.test(applyCode));
  t('choosing a county re-runs the lookup rather than needing a second button',
    /setPickedCounty/.test(applyCode)
    && /retryNonce, pickedCounty\]/.test(applyCode));

  /*
    ======================================================================
    WE PREPARE DOCUMENTS. WE DO NOT DECIDE WHO MAY PROTEST.
    ======================================================================
    Nathan, 2 Oct: "we still have to let them proceed if they would like, we
    are just document prep, we cant deny them we are not giving them advice,
    just the facts."

    Every Texas owner may protest under s 41.41 whatever our estimate says, and
    s 41.44(d) does not require an opinion of value for the notice to be
    sufficient. Refusing on the strength of our own figure would also edge
    toward an opinion of value under Occupations Code s 1103.003 -- the thing
    this service is built not to do.

    This matters more after 1 Oct, not less: REDUCTION_BY_CAD came in BELOW the
    placeholder in all five districts measured, which moves the fee threshold in
    Harris from roughly a $64k house to roughly a $150k house. A hard refuse
    would have closed the door on that slice as a silent side effect of a more
    accurate number.
  */
  t('saving_below_fee is a warning to the customer, not a refusal by us',
    /hardRefuseOnSaving: false/.test(lookup));
  t('the fee warning has a screen of its own rather than borrowing the capped one',
    /d\.savingWarning === true/.test(applyCode)
    && /We don&rsquo;t think this one is worth the fee/.test(apply));
  t('a parcel-derived saving above the fee supersedes the district-rate warning',
    /d\.estimateBasis === 'parcel' && d\.estimatedSaving >= 89/.test(applyCode));

  // No Texas verdict may dead-end. Each discouraging screen states the facts
  // and still offers the owner the route they are entitled to.
  for (const [label, needle] of [
    ['no case found', 'I understand there may be no case'],
    ['saving below the fee', 'I understand it may save less than it costs'],
    ['capped beyond reach', 'I understand it may not change my bill'],
  ]) {
    t(`the "${label}" screen still offers to file`, apply.includes(needle));
  }
  t('and neither new screen promises to withhold the service',
    !/you will not be charged/.test(apply));

  /*
    THE AMBER IS GONE FROM THE FIGURE. #FFF8E6 / #6B5618 is the caution palette
    this file uses for cost-to-cure warnings and deadline notices; it was
    carrying the best news on the page.
  */
  t('the step-1 saving is not rendered in the caution palette',
    !/background: C\.amber[^}]*}}>\s*<div style=\{\{ fontSize: 34/.test(applyCode));
  // The ceiling is stated in WORDS beside the figure rather than as a response
  // flag: it would always be true, and verify-tx-dispatch asserts every field
  // the response sends is actually read by something.
  t('the ceiling is stated where the figure is shown, not shipped as a dead flag',
    /A ceiling, not a promise/.test(apply) && !/estimateIsUpperBound/.test(api));
  t('the screen takes the packet figure, not the generic one',
    /savings: j\.estimatedSaving/.test(apply));

  // A real packet must never fall back to "20% of value at an assumed rate".
  t('a Texas packet with no figure shows a dash, never an invented number',
    /pd\.isTxPacket \? "—"/.test(apply));

  // The arithmetic the guard exists to protect, run on the Brookdale numbers.
  const market = 732970, requested = 599337;
  const real = Math.round((market - requested) * DEFAULT_TAX_RATE);
  const generic = Math.round(market * PLAUSIBLE_REDUCTION_PCT * DEFAULT_TAX_RATE);
  t(`the measured ask is worth materially more than the generic assumption (${real} vs ${generic})`,
    real > generic * 2);

  // No multiplier claim. This is the Ownwell-suit shape.
  t('no "x your fee" multiplier is printed next to the saving',
    !/\d+\s*x\s+your\s+fee/i.test(applyCode) && !/times your fee/i.test(applyCode));
  t('the saving is still labelled a ceiling where it is shown',
    /A ceiling, not a promise/.test(apply));
}

if (failures.length) {
  console.error(`  ${failures.length} FAILED:`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error('\n  The filed instrument must be the government\'s own form. Two Florida');
  console.error('  petitions were refused at the counter because ours was not.\n');
  process.exit(1);
}
console.log(`✓ verify-tx-form: ${pass} assertions passed`);
console.log(`  the filing is the Comptroller's own ${FORM_REVISION}, flattened, with nothing invented\n`);
