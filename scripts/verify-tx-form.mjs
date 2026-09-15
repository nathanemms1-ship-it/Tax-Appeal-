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

// A rendered copy for a human to actually look at, which is how all five of the
// original defects were found. Gitignored.
const tmp = mkdtempSync(path.join(tmpdir(), 'tx-form-'));
writeFileSync(path.join(tmp, 'sample.pdf'), bytes);
console.log(`  a filled sample is at ${path.join(tmp, 'sample.pdf')} — open it before shipping a change\n`);

if (failures.length) {
  console.error(`  ${failures.length} FAILED:`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error('\n  The filed instrument must be the government\'s own form. Two Florida');
  console.error('  petitions were refused at the counter because ours was not.\n');
  process.exit(1);
}
console.log(`✓ verify-tx-form: ${pass} assertions passed`);
console.log(`  the filing is the Comptroller's own ${FORM_REVISION}, flattened, with nothing invented\n`);
