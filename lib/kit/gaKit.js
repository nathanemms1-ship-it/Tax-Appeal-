/**
 * lib/kit/gaKit.js — build the Georgia Mailed Kit: one PDF that Lob prints and
 * mails to the CUSTOMER, who signs the appeal, adds postage and mails it to the
 * county in the return envelope. (Kit model, decided 10 Oct 2026.)
 *
 * THE KIT: 8 pages, 4 sheets, double-sided. Proven layout: Lob proof
 * ltr_83d855f226c09bce, 10 Oct.
 *   p1  Cover letter. Lob prints the customer's address in the top block.
 *   p2  Checklist (back of p1).
 *   p3  The official appeal form, filled in: the county's own version where it
 *       publishes one, else the DOR PT-311A (lib/kit/forms/gaForms.js).
 *       Signature and date left blank.
 *   p4  blank, so the form travels to the county as its own sheet.
 *   p5  Evidence: recorded sales of similar homes. Goes to the county.
 *   p6  blank, same reason.
 *   p7  PERFORATED. Top: the customer's record. Bottom 3.625": tear-off slip whose
 *       address box shows through the #9 return envelope window: the county
 *       Board of Tax Assessors.
 *   p8  blank.
 *
 * WHAT THE COUNTY RECEIVES: p3 (signed), p5, in an envelope addressed by p7.
 * Nothing that goes to the county names TaxAppeal USA as filer, agent or
 * representative. The owner is the appellant.
 *
 * HARD RULES (each throws a KitError, never prints a weaker kit):
 *   - The owner's value assertion is never blank (§ 48-5-311(e)(3)(A)
 *     consequences; § 48-5-299(c)(1) freeze needs written evidence of value).
 *   - It must be below the value on the notice.
 *   - At least 3 comparable sales, all BEFORE the 1 January valuation date.
 *   - The county appeal address must be mailable (confirmed, fresh, CASS) from
 *     lib/appealAddresses.js. `proof: true` relaxes this for test-mode proofs
 *     only, and then stamps SAMPLE on every page so it cannot be filed.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { GA_FORMS, formForCounty, fillForm, FormError } from './forms/gaForms';
import { Flow, IN, PAGE_W, PAGE_H, GREY, winAnsi, money, longDate } from './pdfText';
import { isMailable, formatEnvelope, POSTAGE_RESTRICTIONS } from '../appealAddresses';

export const GA_APPEAL_DAYS = 45;              // O.C.G.A. § 48-5-311(e)(1)(A)(i)
export const KIT_LAYOUT = Object.freeze({ pages: 8, sheets: 4, perforatedPage: 7, countyBoundPages: [3, 5], formPage: 3 });
// Lob letter options that this layout depends on. send code must use these.
export const LOB_KIT_OPTIONS = Object.freeze({
  color: false, double_sided: true, address_placement: 'top_first_page',
  mail_type: 'usps_first_class', return_envelope: true, perforated_page: KIT_LAYOUT.perforatedPage,
});
// Lob's perforated-page window (letter_perf_template.pdf): 4.25" x 1.125",
// 0.875" from the left, 0.5" from the bottom. Slip = bottom 3.625".
export const WINDOW = Object.freeze({ x: 0.875 * IN, y: 0.5 * IN, w: 4.25 * IN, h: 1.125 * IN });
const SLIP_H = 3.625 * IN;
const LOB_ADDRESS_CLEAR = 3.15 * IN;          // top of p1 kept clear for Lob's address block

export class KitError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const asKitError = (e) => (e instanceof FormError ? new KitError(e.code, e.message) : e);

const int = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : NaN; };
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

export function valuationDate(taxYear) { return new Date(Date.UTC(taxYear, 0, 1)); }

/** Postmark deadline: the 45th day after the date on the notice. Not extended for weekends (conservative). */
export function gaDeadline(noticeDate) {
  if (!noticeDate) return null;
  const d = new Date(`${String(noticeDate).slice(0, 10)}T00:00:00Z`);
  if (isNaN(d)) throw new KitError('bad_notice_date', `Notice date "${noticeDate}" is not a date`);
  return new Date(d.getTime() + GA_APPEAL_DAYS * 86400000);
}

/** How the customer must post it, per the county's published postage rule. */
export function postageStep(restriction) {
  switch (restriction) {
    case POSTAGE_RESTRICTIONS.REQUIRES_METER:
      return 'Take it to a post office COUNTER and have the clerk print the postage label. This county requires post office postage: a stamp in a mailbox is not accepted.';
    case POSTAGE_RESTRICTIONS.NO_METERED:
      return 'Put a regular first-class stamp on the envelope, or have a post office counter clerk postmark it. Do not use an office postage machine: this county accepts only a USPS postmark.';
    case POSTAGE_RESTRICTIONS.NO_THIRD_PARTY_METER:
      return 'Put a regular first-class stamp on the envelope, or have a post office counter clerk apply postage. Do not use an office or online postage label.';
    default:
      return 'Put a regular first-class stamp on the envelope, or have a post office counter clerk postmark it.';
  }
}

/** Every check that must pass before a kit exists. Returns the normalised order. */
export function validateGaOrder(order, { proof = false, now = new Date() } = {}) {
  const o = order || {};
  if (o.state !== 'GA') throw new KitError('wrong_state', `gaKit builds Georgia kits only, got "${o.state}"`);
  const taxYear = int(o.taxYear);
  if (!(taxYear >= 2026 && taxYear <= 2100)) throw new KitError('bad_tax_year', `Tax year "${o.taxYear}" is not valid`);

  const ow = o.owner || {};
  for (const k of ['name', 'street', 'city', 'state', 'zip']) {
    if (!nonEmpty(ow[k])) throw new KitError('owner_incomplete', `Owner ${k} is missing`);
  }
  const pr = o.property || {};
  for (const k of ['address', 'county', 'parcelId']) {
    if (!nonEmpty(pr[k])) throw new KitError('property_incomplete', `Property ${k} is missing`);
  }

  const noticeValue = int(o.noticeValue);
  const requestedValue = int(o.requestedValue);
  if (!(noticeValue > 0)) throw new KitError('need_notice_value', 'The value on the notice is required');
  // NEVER BLANK. A blank or zero assertion is the one defect we can never cure.
  if (!(requestedValue > 0)) throw new KitError('value_blank', "The owner's value assertion is blank: refusing to build");
  if (requestedValue >= noticeValue) throw new KitError('value_not_lower', `Requested ${requestedValue} is not below the notice value ${noticeValue}`);

  const ev = o.evidence || {};
  const comps = Array.isArray(ev.comps) ? ev.comps : [];
  if (comps.length < 3) throw new KitError('too_few_comps', `${comps.length} comparable sales: at least 3 are required`);
  const vd = valuationDate(taxYear);
  for (const c of comps) {
    const sd = new Date(`${String(c.saleDate).slice(0, 10)}T00:00:00Z`);
    if (isNaN(sd)) throw new KitError('bad_comp', `Comparable "${c.address}" has no sale date`);
    if (sd >= vd) throw new KitError('comp_after_valuation_date', `Comparable "${c.address}" sold ${c.saleDate}, on or after the 1 Jan ${taxYear} valuation date`);
    if (!(int(c.price) > 0) || !(int(c.sqft) > 0)) throw new KitError('bad_comp', `Comparable "${c.address}" lacks price or sqft`);
  }
  if (!(int(ev.subjectSqft) > 0)) throw new KitError('need_sqft', "The home's heated square feet are required for the evidence page");
  if (!(int(ev.indicatedValue) > 0)) throw new KitError('need_indicated', 'The sales-indicated value is required');

  const row = o.countyAddress;
  if (!row) throw new KitError('no_county_address', `No appeal address for ${pr.county} County`);
  if (!proof && !isMailable(row, now)) {
    throw new KitError('address_not_mailable', `${pr.county} County appeal address is "${row.confidence}" (verifiedOn ${row.verifiedOn ?? 'null'}): refusing to print it on a return envelope`);
  }
  const envelope = formatEnvelope(row);
  if (!envelope || envelope.length < 2 || envelope.length > 5) throw new KitError('bad_county_address', 'County address does not fit the window');

  // Which form this county gets. A county whose form is not settled is not sold.
  let form;
  try { form = formForCounty(pr.county, { proof, taxYear }); } catch (e) { throw asKitError(e); }
  for (const k of form.needs || []) {
    if (typeof o[k] !== 'boolean') throw new KitError(`need_${k}`, `${form.label} needs "${k}" answered by the customer`);
  }

  return { ...o, taxYear, noticeValue, requestedValue, envelope, deadline: gaDeadline(o.noticeDate), comps, form };
}

/** What goes in each field of the state PT-311A (kept for the build check). */
export const pt311aFieldValues = (o) => GA_FORMS.STATE.fields(o);

function watermark(page, font) {
  page.drawText('SAMPLE - NOT FOR FILING', {
    x: 95, y: 230, size: 54, font, color: rgb(0.6, 0.6, 0.6), opacity: 0.35, rotate: degrees(45),
  });
}

/**
 * @param {object} order  see validateGaOrder; `savings` (lib/ga/savings.js result) is optional, customer pages only
 * @returns {Promise<{ pdf: Uint8Array, layout, lob, deadline: Date|null }>}
 */
export async function buildGaKit(order, { proof = false, now = new Date() } = {}) {
  const o = validateGaOrder(order, { proof, now });
  const kit = await PDFDocument.create();
  kit.setTitle(`Georgia appeal kit ${o.property.parcelId}`);
  kit.setProducer('TaxAppeal USA');
  const fonts = { regular: await kit.embedFont(StandardFonts.Helvetica), bold: await kit.embedFont(StandardFonts.HelveticaBold) };
  const newPage = () => kit.addPage([PAGE_W, PAGE_H]);
  const county = `${o.property.county} County`;
  const deadlineText = o.deadline
    ? `Postmarked no later than ${longDate(o.deadline)} (45 days from your notice date). Mail it as soon as you have signed it.`
    : 'Postmarked within 45 days of the date printed on your assessment notice. Mail it as soon as you have signed it.';

  // ── p1 cover ──────────────────────────────────────────────────────────────
  {
    const f = new Flow(newPage(), fonts, { top: PAGE_H - LOB_ADDRESS_CLEAR });
    f.h1('Your property tax appeal is ready to sign.');
    f.text(`Everything is filled in for ${winAnsi(o.property.address)}. You do three things: sign it, add postage, and mail it.`);
    f.h2('Your appeal goes to');
    f.box(o.envelope);
    f.h2('Deadline');
    f.text(deadlineText);
    f.h2('Your case');
    f.text(`Value on your notice: ${money(o.noticeValue)}.  Recent sales of similar homes indicate ${money(o.evidence.indicatedValue)}.  Your appeal asks for ${money(o.requestedValue)}.`);
    if (o.savings?.ok && o.savings.yearlySaving > 0) {
      f.text(`If the county agrees, we estimate your yearly tax bill drops by about ${money(o.savings.yearlySaving)}${o.savings.provisional ? ' (an estimate: some local tax caps are confirmed each spring)' : ''}. A value lowered on appeal is generally held for the next two years as well.`);
    }
    f.space(10);
    f.text('TaxAppeal USA prepares appeal documents. We do not file your appeal, represent you or appear for you. You sign and mail it, and you are the appellant.', { size: 8.5, color: GREY });
  }
  // ── p2 checklist ──────────────────────────────────────────────────────────
  {
    const f = new Flow(newPage(), fonts);
    f.h1('Checklist');
    f.check(`1. ${o.form.signStep}`);
    f.check('2. Take a photo of the signed form for your records.');
    f.check('3. TEAR OFF the bottom of page 7 along the perforation.');
    f.check('4. Put in the small window envelope: the signed form (page 3), the evidence page (page 5), and the tear-off with the address showing in the window. Seal it.');
    f.check(`5. POSTAGE: ${postageStep(o.countyAddress.postageRestriction)}`);
    f.check(`6. MAIL IT. ${deadlineText}`);
    f.check('7. Tell us it is mailed at taxappealusa.com/mailed so we can watch your dates.');
    f.space(6);
    f.text('Proof of mailing: the date that counts is the USPS postmark. For a receipt, ask the counter clerk for a Certificate of Mailing (PS Form 3817), about $2.', { size: 9.5 });
    f.text('Keep pages 1, 2 and the top of page 7. Do not send them to the county.', { size: 9.5 });
  }
  // ── p3 the county's appeal form, p4 blank ────────────────────────────────────────
  let formDoc;
  try { formDoc = await fillForm(o.form, o); } catch (e) { throw asKitError(e); }
  {
    // County forms are not always US Letter (Cobb's is 658 x 852 pt). Lob prints
    // Letter, so a form of any other size is scaled to fit, centred, never cropped.
    const src = formDoc.getPage(0);
    const { width, height } = src.getSize();
    if (Math.abs(width - PAGE_W) < 2 && Math.abs(height - PAGE_H) < 2) {
      const [formPage] = await kit.copyPages(formDoc, [0]);
      kit.addPage(formPage);
    } else {
      // Embed from saved bytes: embedPage on the live filled document dropped
      // resources the flattened fields point at (missing objects, no fonts).
      const [emb] = await kit.embedPdf(await formDoc.save({ useObjectStreams: false }), [0]);
      const k = Math.min(PAGE_W / width, PAGE_H / height);
      newPage().drawPage(emb, { x: (PAGE_W - width * k) / 2, y: (PAGE_H - height * k) / 2, xScale: k, yScale: k });
    }
  }
  newPage();
  // ── p5 evidence, p6 blank ─────────────────────────────────────────────────
  {
    const f = new Flow(newPage(), fonts);
    const ev = o.evidence;
    f.h1('Evidence of Fair Market Value');
    f.text(`Appeal of ${o.taxYear} assessment, ${county}, Georgia. Owner: ${o.owner.name}.`, { size: 10 });
    f.text(`Property: ${o.property.address}.  Parcel: ${o.property.parcelId}.`, { size: 10 });
    f.text(`Heated living area: ${Number(ev.subjectSqft).toLocaleString('en-US')} sq ft${ev.subjectYearBuilt ? `.  Year built: ${ev.subjectYearBuilt}` : ''}.`, { size: 10, gap: 8 });
    f.box([
      `Value on the ${o.taxYear} notice (fair market value): ${money(o.noticeValue)}`,
      `Value indicated by recorded sales of similar homes: ${money(ev.indicatedValue)}`,
      `Owner's opinion of value: ${money(o.requestedValue)}`,
    ], { size: 11, bold: true });
    f.h2('Recorded sales of similar homes');
    f.table([
      { head: 'Address', width: 0.34 }, { head: 'Sold', width: 0.11 }, { head: 'Price', width: 0.12, align: 'right' },
      { head: 'Sq ft', width: 0.09, align: 'right' }, { head: '$/sq ft', width: 0.1, align: 'right' },
      { head: 'Built', width: 0.09, align: 'right' }, { head: 'Miles', width: 0.08, align: 'right' },
    ], o.comps.map((c) => [
      c.address, String(c.saleDate).slice(0, 10), money(c.price), Number(c.sqft).toLocaleString('en-US'),
      '$' + Number(c.ppsf ?? c.price / c.sqft).toFixed(2), c.yearBuilt ? String(c.yearBuilt) : '-', Number(c.distanceMi).toFixed(2),
    ]));
    const window = ev.days >= 700 ? '24 months' : '12 months';
    f.h2('Method');
    f.text(`Sales of single-family homes within ${ev.radiusMi} mile${ev.radiusMi === 1 ? '' : 's'} that sold in the ${window} before January 1, ${o.taxYear}, the valuation date, with heated area within 20% and age within 15 years of this home. Sales far from the area's typical price per square foot (foreclosures, family transfers, land-only sales) are excluded. The median price per square foot of these sales, ${'$' + Number(ev.ppsf).toFixed(2)}, times this home's ${Number(ev.subjectSqft).toLocaleString('en-US')} sq ft gives ${money(ev.indicatedValue)}.`, { size: 9.5 });
    f.text('The owner submits these recorded sales as written evidence supporting the owner\'s opinion of value, under O.C.G.A. Sections 48-5-2(3) and 48-5-311. Sources: public property and sale records.', { size: 9.5 });
  }
  newPage();
  // ── p7 perforated: record (top) + window slip (bottom), p8 blank ──────────
  {
    const page = newPage();
    const f = new Flow(page, fonts);
    f.h1('Your record (keep this part)');
    f.text(`Property: ${o.property.address}.  Parcel ${o.property.parcelId}.  Tax year ${o.taxYear}.`, { size: 10 });
    f.text(`Sent to: ${o.envelope.join(', ')}.`, { size: 10 });
    f.text(`Deadline: ${deadlineText}`, { size: 10 });
    f.text('Date I mailed it: ____________________', { size: 10, gap: 8 });
    f.h2('What happens next');
    f.text('The Board of Tax Assessors reviews your appeal and writes to you. If it sends a CHANGED value and you do not accept it, you usually have 30 days to say so in writing, so open county mail the day it arrives. Email a photo of any county letter to customerservice@taxappealusa.com and we will tell you your options.', { size: 9.5 });
    // Slip: nothing but the address in the window and a one-line label above it.
    // No tear line (Lob perforates and prints its own) and no stamp box (10 Oct proof).
    page.drawText(winAnsi(`APPEAL OF ASSESSMENT ENCLOSED - ${county.toUpperCase()}`), {
      x: WINDOW.x + 0.12 * IN, y: WINDOW.y + WINDOW.h + 0.28 * IN, size: 8, font: fonts.bold,
    });
    const size = o.envelope.length > 4 ? 10 : 11;
    o.envelope.forEach((line, i) => {
      page.drawText(winAnsi(line), { x: WINDOW.x + 0.12 * IN, y: WINDOW.y + WINDOW.h - 0.1 * IN - (i + 1) * size * 1.2, size, font: fonts.regular });
    });
    if (f.y < SLIP_H + 0.2 * IN) throw new KitError('layout_overflow', 'The record text runs into the tear-off slip');
  }
  newPage();

  if (proof) for (const p of kit.getPages()) watermark(p, fonts.bold);
  if (kit.getPageCount() !== KIT_LAYOUT.pages) throw new KitError('layout', `Kit has ${kit.getPageCount()} pages, expected ${KIT_LAYOUT.pages}`);
  const pdf = await kit.save({ useObjectStreams: false });
  return { pdf, layout: KIT_LAYOUT, lob: LOB_KIT_OPTIONS, deadline: o.deadline, envelope: o.envelope, form: { id: o.form.id, label: o.form.label, revision: o.form.revision } };
}
