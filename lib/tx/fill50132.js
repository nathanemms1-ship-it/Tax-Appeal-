/**
 * ============================================================================
 * FILL THE COMPTROLLER'S OWN FORM 50-132. DO NOT RENDER A LOOK-ALIKE.
 * ============================================================================
 *
 * Written 15 Sept 2026, after Hillsborough and Miami-Dade VABs both refused a
 * paying customer's Florida petition within five days of each other. Root cause
 * in both: pages/api/generate-dr486.js renders an HTML page TITLED "Form DR-486"
 * instead of filling the Department of Revenue's PDF. The clerk saw it at the
 * front desk. See Filing_Instrument_Audit_All_States_2026-09-10.
 *
 * lib/tx/protestHtml.js does the identical thing for Texas, and this replaces it
 * as the filed instrument.
 *
 * ============================================================================
 * TEXAS IS LEGALLY LOOSER, AND THAT IS NOT THE POINT
 * ============================================================================
 * § 41.44(d) says a notice of protest "need not be on an official form", and the
 * Comptroller says so in its own words: "Property owners or their authorized
 * representatives are not required to use the notice of protest form... A notice
 * of protest is sufficient if it identifies the property, property owner and any
 * subject that indicates a level of dissatisfaction."
 *
 * So our HTML was a valid protest in Texas. Florida's statute says "substantially
 * the form prescribed" and a lawyer could have argued ours qualified there too.
 * The clerk refused it anyway, with the deadline two days out and no cure.
 *
 * DESIGN FOR THE STRICTEST CLERK. A clerk holding the Comptroller's own form has
 * nothing left to exercise judgement about. Being legally right is worth nothing
 * to a homeowner whose protest came back after 15 May.
 *
 * ============================================================================
 * FIVE DEFECTS THAT ONLY A RENDER REVEALED
 * ============================================================================
 * Every one of these passed a field-level check — the VALUES were correct and
 * read back correctly from the saved PDF. The PAGE was wrong. This is why the
 * build check renders rather than inspecting the data model.
 *
 *   1. "$ $611,000" — the form preprints its own dollar sign.
 *   2. The facts field auto-sized to ~28pt and swallowed the box. Every text
 *      field is now pinned to an explicit size.
 *   3. 'Appraisal districts value assigned to property' is NOT a general
 *      statement of the district's value. It lives inside SECTION 7, "Special
 *      Panel Request for Property Value of $62.9 Million or More". A residential
 *      value there is noise on a section we are not invoking. Left blank.
 *   4. 'Email Address' is the SECTION 6 electronic-reminder address, and the
 *      form states beneath it that including an email is "affirmatively
 *      consenting to its release under the Public Information Act" (Gov't Code
 *      § 552.137). We do not waive a customer's confidentiality for a reminder
 *      they did not request. Left blank; the owner may add it.
 *   5. The Reset and Print buttons are widgets that RENDER, and flatten() bakes
 *      them into the page. A mailed filing carried software controls. Removed
 *      before flattening.
 */

import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * PINNED, AND RE-CHECKED BEFORE EVERY SEASON — audit rule 5.
 *
 * lib/tx/protest.js carried '50-132 • 10-25/27' with a comment saying to
 * re-scrape annually. The live form on 15 Sept 2026 is 03-26/28: two revisions
 * stale, and nobody would have known because nothing compared them.
 */
export const FORM_REVISION = '50-132 • 03-26/28';
export const FORM_RELATIVE_PATH = path.join('forms', 'tx', '50-132.pdf');

/**
 * The form is titled "for Counties with Populations Greater than 120,000".
 * Counties below that use 50-132-A, which is a DIFFERENT form with different
 * fields. Every district we hold is comfortably above the line today, but
 * Wichita is the closest, so this is asserted rather than assumed.
 */
export const SMALL_COUNTY_FORM = '50-132-A';

let cachedBlank = null;

/**
 * Vercel traces files a route reads only when it can see the path statically.
 * next.config.js names this file in outputFileTracingIncludes so the blank form
 * ships inside the serverless bundle; without that, this throws in production
 * and works perfectly on a laptop.
 */
export function loadBlankForm() {
  if (cachedBlank) return cachedBlank;
  const full = path.join(process.cwd(), FORM_RELATIVE_PATH);
  try {
    cachedBlank = readFileSync(full);
  } catch (e) {
    throw new Error(
      `fill50132: the blank Form 50-132 is not in the bundle at ${FORM_RELATIVE_PATH}. `
      + `This works locally and fails on Vercel when next.config.js stops tracing it. `
      + `Do NOT fall back to rendering HTML — that is the defect this file exists to fix. (${e.message})`,
    );
  }
  return cachedBlank;
}

const money = (n) =>
  (n === null || n === undefined || !Number.isFinite(Number(n)))
    ? null
    // No leading "$": the form preprints one. Defect 1.
    : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

const usDate = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime())
    ? null
    : dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

/** Locate a widget's rectangle, so nothing is positioned by hardcoded guess. */
function widgetRect(doc, pages, fieldName) {
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i].node.Annots();
    if (!annots) continue;
    for (let j = 0; j < annots.size(); j++) {
      const a = annots.lookup(j);
      let t = a.get(PDFName.of('T'));
      if (!t) {
        const parent = a.get(PDFName.of('Parent'));
        if (parent) t = doc.context.lookup(parent)?.get(PDFName.of('T'));
      }
      const label = t && (t.decodeText ? t.decodeText() : String(t));
      if (label === fieldName) {
        const r = a.get(PDFName.of('Rect')).asArray().map((n) => n.asNumber());
        return { pageIndex: i, x: r[0], y: r[1], w: r[2] - r[0], h: r[3] - r[1] };
      }
    }
  }
  return null;
}

/**
 * Build the filed instrument.
 *
 * @param {object} packet  the object buildProtest() returns
 * @param {object} [sig]   { name, signedAt, imageDataUri } — the owner's
 *                         e-signature. Omit and Section 8's signature and date
 *                         stay blank for a wet signature.
 * @returns {Promise<Uint8Array>} pages 1-2 of the official form, plus evidence.
 */
export async function fill50132(packet, sig = null) {
  const f = packet?.form50132;
  if (!f) throw new Error('fill50132: packet has no form50132 block — pass the output of buildProtest().');

  const doc = await PDFDocument.load(loadBlankForm());
  const form = doc.getForm();
  const pages = doc.getPages();

  const setText = (name, value, size = 10) => {
    if (value === null || value === undefined || value === '') return;
    const fld = form.getTextField(name);
    fld.setText(String(value));
    // Auto-size (0) expands to fill the box. Defect 2.
    fld.setFontSize(size);
  };
  const choose = (name, state) => {
    const fld = form.getField(name);
    // The PDF stores export values as names ("/Yes"); pdf-lib takes them without
    // the slash and throws on the raw form.
    const opt = String(state).replace(/^\//, '');
    if (typeof fld.select === 'function') fld.select(opt);
    else if (typeof fld.check === 'function') fld.check();
  };

  // ── Page 1 · Sections 1-4 ────────────────────────────────────────────────
  setText('Appraisal Districts Name', f.appraisalDistrict);
  setText('Tax Year', f.taxYear == null ? null : String(f.taxYear));
  setText('Appraisal District Account Number', f.accountNumber);
  setText('Name of Property Owner or Lessee', f.ownerName);
  setText('Mailing Address City State ZIP Code', f.ownerMailing);
  setText('Phone Number area code and number', f.ownerPhone);
  setText('Physical Address', f.propertyAddress);

  /**
   * Section 3, box 1 ONLY: "Incorrect appraised (market) value and/or value is
   * unequal compared with other properties." Market value under § 41.41(a)(1)
   * and unequal appraisal under § 41.43(b)(3) share one box, so a single tick
   * preserves both grounds and the equity argument cannot be waived by accident.
   */
  if ((f.grounds || []).includes('incorrect_value_and_or_unequal')) {
    choose('Reason for protest 1', '/Yes');
  }

  setText('Opinion of property value', money(f.opinionOfValue));
  setText(
    'Facts to resolve protest',
    packet.hasGrid
      ? 'See attached analysis of comparable properties under Tax Code § 41.43(b)(3).'
      : 'See attached statement in support of this protest.',
    9,
  );

  // ── Page 2 · Sections 5-8 ────────────────────────────────────────────────
  // § 41.445: the appraisal office SHALL hold an informal conference with an
  // owner who files a protest and requests one. It costs the owner nothing, it
  // does not waive the ARB hearing, and it is where residential protests
  // actually resolve.
  if (f.requestInformalConference) choose('Do you request an informal conference', '/Yes');

  // The appearance election stays BLANK. Every option commits the owner to
  // something we do not supply — a notarised Form 50-283, or a day off work.
  // See the SECTION 5 note in lib/tx/protest.js.

  // Section 8. This field states the whole licensing posture in the state's own
  // words: the owner files, we are not the agent.
  choose('Certification and Signature', '/Property Owner');
  setText('Print Name of Property Owner or Authorized Representative', f.ownerName || sig?.name);

  if (sig?.signedAt) setText('Date of Signature', usDate(sig.signedAt));

  /**
   * "Signature of Authorized Individual" is a /Sig field — a digital-signature
   * slot, not a picture box, so the captured PNG is DRAWN at the widget's own
   * rectangle. Read from the PDF rather than hardcoded, so it survives the
   * Comptroller reflowing the form.
   */
  if (sig?.imageDataUri) {
    const spot = widgetRect(doc, pages, 'Signature of Authorized Individual');
    if (spot) {
      const b64 = String(sig.imageDataUri).split(',').pop();
      const png = await doc.embedPng(Buffer.from(b64, 'base64'));
      const maxH = Math.min(spot.h * 1.6, 26);
      const scale = Math.min(maxH / png.height, (spot.w * 0.8) / png.width);
      pages[spot.pageIndex].drawImage(png, {
        x: spot.x + 2, y: spot.y + 1,
        width: png.width * scale, height: png.height * scale,
      });
    }
  }

  // Defect 5 — software controls must not print on a filed document.
  for (const name of ['Reset', 'Print']) {
    try { form.removeField(form.getField(name)); } catch { /* absent in a future revision is fine */ }
  }

  // Flatten last: the filing must not be editable, and this disposes of the
  // empty /Sig field so no copy arrives carrying an unsigned signature slot.
  form.flatten();

  /**
   * PAGE 3 IS INSTRUCTIONS AND CARRIES NO FIELDS. It is not returned — the same
   * shape as the DR-486, whose page 3 says so explicitly. Dropping it keeps the
   * envelope to what the district asked for.
   */
  if (doc.getPageCount() >= 3) doc.removePage(2);

  if (packet.hasGrid && packet.grid) await appendCompsPage(doc, packet);

  return doc.save();
}

/**
 * EVIDENCE GOES ON ITS OWN PAGES — audit rule 2.
 *
 * Never merged into the form, never squeezed into 'Facts to resolve protest'.
 * The Hillsborough clerk listed "evidence narrative inline" among the things
 * that made ours not the form.
 */
async function appendCompsPage(doc, packet) {
  const g = packet.grid;
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.12, 0.24);
  const grey = rgb(0.42, 0.46, 0.55);

  let y = 748;
  const line = (text, { f = font, size = 9, color = ink, dy = 13, x = 54 } = {}) => {
    if (text) page.drawText(String(text), { x, y, size, font: f, color });
    y -= dy;
  };

  line('Comparable properties — Tax Code § 41.43(b)(3)', { f: bold, size: 13, dy: 20 });
  line(`Account ${g.subject.accountNumber}  ·  ${g.subject.address || ''}`, { color: grey, dy: 18 });

  const cols = [54, 168, 240, 312, 396, 480];
  const head = ['Account', 'Living area', 'Year', 'Appraised', 'Per sq ft', ''];
  head.forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 8, font: bold, color: grey }));
  y -= 4;
  page.drawLine({ start: { x: 54, y }, end: { x: 558, y }, thickness: 0.7, color: grey });
  y -= 12;

  const row = (cells, f2 = font) => {
    cells.forEach((c, i) => {
      if (c !== null && c !== undefined && c !== '') {
        page.drawText(String(c), { x: cols[i], y, size: 9, font: f2, color: ink });
      }
    });
    y -= 13;
  };

  row([
    g.subject.accountNumber, money(g.subject.livingArea), g.subject.yearBuilt,
    money(g.subject.appraisedValue) ? `$${money(g.subject.appraisedValue)}` : null,
    g.subject.appraisedPerSqft ? `$${g.subject.appraisedPerSqft}` : null,
    'this property',
  ], bold);
  y -= 3;

  for (const c of g.comps || []) {
    row([
      c.accountNumber, money(c.livingArea), c.yearBuilt,
      money(c.appraisedValue) ? `$${money(c.appraisedValue)}` : null,
      c.appraisedPerSqft ? `$${c.appraisedPerSqft}` : null,
      '',
    ]);
  }

  y -= 4;
  page.drawLine({ start: { x: 54, y }, end: { x: 558, y }, thickness: 0.7, color: grey });
  y -= 15;
  line(`Median appraised value per square foot of the ${g.compCount} comparables: `
    + `$${g.medianAppraisedPerSqft}`, { f: bold, dy: 15 });
  if (g.indicatedAppraised) {
    line(`Applied to this property's ${money(g.subject.livingArea)} sq ft, that median indicates `
      + `$${money(g.indicatedAppraised)}.`, { dy: 18 });
  }

  for (const s of Array.isArray(g.adjustments) ? g.adjustments : []) line(s, { size: 8, color: grey, dy: 11 });
  y -= 6;
  for (const s of Array.isArray(g.disclosure) ? g.disclosure : []) line(s, { size: 8, color: grey, dy: 11 });

  return page;
}

export default { fill50132, FORM_REVISION, FORM_RELATIVE_PATH, loadBlankForm };
