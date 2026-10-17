/**
 * lib/fl/fillDr486.js — fill the Florida Department of Revenue's own Form
 * DR-486 (Petition to the Value Adjustment Board), never a look-alike.
 *
 * Why this exists: Hillsborough and Miami-Dade VABs both refused a paying
 * customer's petition in 2026 because we rendered an HTML page titled "Form
 * DR-486" (scripts/verify-tx-form.mjs header; audit rule 7). The Florida kit
 * (16 Oct 2026) fills the DOR's fillable PDF instead, like Georgia's PT-311A
 * and Texas's 50-132.
 *
 * WHAT IS FILLED, as the owner representing themselves:
 *   county (the form's own dropdown), tax year, Part 1 (name, mailing address,
 *   parcel ID and address, phone, email), type of property (Res. 1-4 units),
 *   Part 2 real property value: decrease, the minutes needed (15), the
 *   "will not attend" box only if the owner chose it, and Part 3's print name.
 * NEVER FILLED: the clerk's boxes, Representative (nobody represents them),
 *   Parts 4 and 5, Part 3's signature and date (the owner signs in ink).
 *
 * Pages returned: 1 and 2 (the petition). Page 3 is "INFORMATION FOR THE
 * TAXPAYER — do not return this page to the VAB clerk", so it is not sent.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

export const FORM_REVISION = 'DR-486 R. 08/26 (Provisional)';
export const FORM_RELATIVE_PATH = path.join('forms', 'fl', 'dr486.pdf');
// floridarevenue.com/property/Documents/dr486.pdf, downloaded 16 Oct 2026.
export const FORM_SHA256 = '0e9def656a27772c30593b3aadb0ad6b6cb997b318538f5aa2efa3cd3e30039a';

export class Dr486Error extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

let cached = null;
export function loadBlankDr486() {
  if (cached) return cached;
  try { cached = readFileSync(path.join(process.cwd(), FORM_RELATIVE_PATH)); } catch (e) {
    throw new Dr486Error('form_missing', `The blank DR-486 is not in the bundle at ${FORM_RELATIVE_PATH} (next.config.js must trace forms/fl/**). Never fall back to an HTML look-alike. (${e.message})`);
  }
  const sha = createHash('sha256').update(cached).digest('hex');
  if (sha !== FORM_SHA256) { cached = null; throw new Dr486Error('form_changed', `forms/fl/dr486.pdf is not the pinned DOR file (sha ${sha.slice(0, 12)})`); }
  return cached;
}

const norm = (s) => String(s || '').replace(/\s+County$/i, '').replace(/[^a-z]/gi, '').toLowerCase();

/** The form's own county option for a county name ("Miami-Dade" is "Dade" on the form). */
export function countyOption(options, county) {
  const want = norm(county) === 'miamidade' ? 'dade' : norm(county);
  return options.find((o) => norm(o) === want) || null;
}

/**
 * @param {object} p
 * @param {string} p.county      e.g. "Hillsborough"
 * @param {number} p.taxYear     e.g. 2027
 * @param {object} p.owner       { name, street, street2?, city, state, zip, phone?, email? }
 * @param {string} p.parcelId
 * @param {string} p.propertyAddress
 * @param {boolean} [p.willNotAttend]  the owner's own choice; also means duplicate evidence copies
 * @returns {Promise<PDFDocument>} two flattened pages
 */
export async function fillDr486(p, { inspect = false } = {}) {
  const req = { county: p.county, taxYear: p.taxYear, name: p.owner?.name, street: p.owner?.street, city: p.owner?.city, zip: p.owner?.zip, parcelId: p.parcelId, propertyAddress: p.propertyAddress };
  for (const [k, v] of Object.entries(req)) if (!String(v ?? '').trim()) throw new Dr486Error('field_missing', `DR-486 needs ${k}`);

  const doc = await PDFDocument.load(loadBlankDr486());
  const form = doc.getForm();
  const helv = await doc.embedFont(StandardFonts.Helvetica);

  const dd = form.getDropdown('County Combo Box4');
  const opt = countyOption(dd.getOptions(), p.county);
  if (!opt) throw new Dr486Error('county_not_on_form', `"${p.county}" is not a county on the DR-486`);
  dd.select(opt);

  const text = (name, value, size = 9) => {
    const f = form.getTextField(name);
    f.setText(String(value ?? ''));
    f.setFontSize(size);
  };
  text('Tax year 20', String(p.taxYear).slice(-2));
  text('Taxpayer name', p.owner.name);
  const o = p.owner;
  text('Mailing address for notices', `${o.street}${o.street2 ? `, ${o.street2}` : ''}\n${o.city}, ${o.state || 'FL'} ${o.zip}`, 8);
  form.getTextField('Mailing address for notices').enableMultiline();
  text('Parcel ID and physical address or TPP account', `${p.parcelId}\n${p.propertyAddress}`, 7);
  form.getTextField('Parcel ID and physical address or TPP account').enableMultiline();
  if (o.phone) text('Phone', o.phone);
  if (o.email) text('Email', o.email);
  const checks = ['Res 14 units', 'Real property value check one', 'decrease'];
  text('Enter the time in minutes you think you need to present your case Most hearings take 15 minutes The VAB is not bound', '15', 8);
  if (p.willNotAttend === true) {
    checks.push('I will not attend the hearing but would like my evidence considered In this instance only you must submit duplicate copies of');
  }
  for (const name of checks) form.getCheckBox(name).check();
  text('Print name', o.name);

  form.updateFieldAppearances(helv);
  // The DOR's "on" appearances draw ZapfDingbats glyphs that are not embedded
  // (a hatched box in print). Redraw ours with pdf-lib's vector check, as GA does.
  for (const name of checks) form.getCheckBox(name).updateAppearances();
  // scripts/verify-fl-kit.mjs reads the filled fields before they are flattened.
  if (inspect) return doc;
  form.flatten();
  for (const pg of doc.getPages()) {
    const xobjects = pg.node.Resources()?.lookup(PDFName.of('XObject'));
    for (const [, ref] of xobjects ? xobjects.entries() : []) {
      const d = doc.context.lookup(ref)?.dict;
      if (!d) continue;
      if (!d.get(PDFName.of('Subtype'))) d.set(PDFName.of('Subtype'), PDFName.of('Form'));
      if (!d.get(PDFName.of('Type'))) d.set(PDFName.of('Type'), PDFName.of('XObject'));
    }
  }
  // The DOR's form carries document JavaScript (county/date helpers). A kit is
  // paper: strip it so no viewer runs it and no printer chokes on it.
  doc.catalog.delete(PDFName.of('OpenAction'));
  doc.catalog.delete(PDFName.of('AA'));
  const names = doc.catalog.lookup(PDFName.of('Names'));
  if (names?.delete) names.delete(PDFName.of('JavaScript'));

  // Pages 1 and 2 only: page 3 is the taxpayer's information sheet.
  const out = await PDFDocument.create();
  const pages = await out.copyPages(doc, [0, 1]);
  pages.forEach((pg) => { pg.node.delete(PDFName.of('Annots')); out.addPage(pg); });
  return out;
}
