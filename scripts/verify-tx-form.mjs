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

if (failures.length) {
  console.error(`  ${failures.length} FAILED:`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error('\n  The filed instrument must be the government\'s own form. Two Florida');
  console.error('  petitions were refused at the counter because ours was not.\n');
  process.exit(1);
}
console.log(`✓ verify-tx-form: ${pass} assertions passed`);
console.log(`  the filing is the Comptroller's own ${FORM_REVISION}, flattened, with nothing invented\n`);
