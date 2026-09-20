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

  /**
   * The condition exhibit follows the grid deliberately: its own opening line
   * refers to "the comparable properties on the preceding page", and the
   * argument only works in that order — the comps establish what ordinary
   * condition is appraised at, and this page says this property is not in it.
   */
  if (packet.conditionExhibit) await appendConditionPage(doc, packet);

  return doc.save();
}

/**
 * Wrap a paragraph to a pixel width. pdf-lib draws a string exactly as given and
 * will happily run it off the page, so anything longer than a label has to be
 * broken here. Measured against the real font rather than a character count,
 * because Helvetica is proportional and a count is wrong by a third either way.
 */
function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && font.widthOfTextAtSize(next, size) > maxWidth) { out.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) out.push(cur);
  return out;
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
  line(`Account ${g.subject.accountNumber}  ·  ${g.subject.address || ''}`, { color: grey, dy: 14 });

  /**
   * THE TEST, IN THE WORDS A PANEL MEMBER WILL UNDERSTAND.
   *
   * lib/tx/protest.js has populated `grid.statute` since the packet was first
   * assembled, and this function never read it. The value sat on the object the
   * whole time; only the renderer was missing, so nothing failed and the page
   * simply came out without the one element the research called "probably the
   * single highest-leverage design decision available in the whole document".
   *
   * Why it matters: the Comptroller's own ARB Manual names unequal appraisal as
   * a ground and then gives boards almost no methodological guidance on it.
   * Panel members are not trained on § 41.43(b)(3) mechanics. The page has to
   * teach the test while making the argument.
   *
   * It sits ABOVE the table deliberately — the reader meets the standard before
   * the numbers that satisfy it.
   */
  if (g.statute) {
    y -= 4;
    for (const seg of wrapText(g.statute, font, 8.5, 504)) {
      line(seg, { size: 8.5, color: grey, dy: 10.5 });
    }
    y -= 10;
  }

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

/**
 * ============================================================================
 * THE CONDITION EXHIBIT. § 41.41(a)(1), and it nearly went missing twice.
 * ============================================================================
 *
 * First time: the exhibit existed only in scripts/tx/preview-protest.mjs and had
 * never once reached a real packet, because pages/api/generate-50132.js read
 * neither `issues` nor `costOverrides` from a body pages/apply.js had been
 * sending since the Texas branch was written. Fixed 15 Sept.
 *
 * Second time, and it was mine: on 20 Sept the route stopped rendering
 * lib/tx/protestHtml.js, which was right — it was an HTML look-alike of a
 * government form, the defect two Florida VABs refused. But renderConditionExhibit
 * lived in that file and nothing replaced it here. So a customer could report a
 * cracked foundation, have it priced by txCostToCure(), have qualify() count it
 * toward whether we advise filing at all — and it would not appear on the filed
 * document. Posted, received and dropped, by a different route.
 *
 * ============================================================================
 * WHAT THIS PAGE MAY NOT SAY
 * ============================================================================
 * Cost to cure is NOT value diminution, and this page must never imply it is.
 * Nathan's call, 7 Sept 2026: the subtraction `indicatedMarket - cureDollars`
 * was removed from opinionOfValue() because asserting that a $48,950 repair
 * lowers value by $48,950 is a valuation judgment, and Occupations Code
 * § 1103.003 defines an "appraisal" as exactly that — "an opinion of value; or
 * the act or process of developing an opinion of value". The prose never made
 * that claim; the arithmetic did, and the arithmetic was the number the owner
 * signed.
 *
 * So the closing note states the limit in the document's own words, and the
 * footer states that nobody inspected anything. Both are load-bearing and
 * neither is decoration.
 */
async function appendConditionPage(doc, packet) {
  const c = packet.conditionExhibit;
  if (!c) return null;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.12, 0.24);
  const grey = rgb(0.42, 0.46, 0.55);

  const LEFT = 54, RIGHT = 558, WIDTH = RIGHT - LEFT, TOP = 748, FLOOR = 64;
  let page = doc.addPage([612, 792]);
  let y = TOP;

  /**
   * A defect list has no natural length. The comps grid is capped at ten rows and
   * fits by construction; an owner can report a dozen problems, each with a scope
   * line and a provenance line, and the page simply runs out. Text drawn below the
   * floor is not clipped by pdf-lib — it is drawn off the page and silently lost,
   * which on an evidence exhibit means an argument that exists in the data and not
   * on the paper.
   */
  const need = (h) => { if (y - h < FLOOR) { page = doc.addPage([612, 792]); y = TOP; } };

  const line = (text, { f = font, size = 9, color = ink, dy = 13, x = LEFT } = {}) => {
    need(dy);
    if (text) page.drawText(String(text), { x, y, size, font: f, color });
    y -= dy;
  };
  const para = (text, { size = 8.5, color = grey, dy = 10.5, gap = 9, f = font } = {}) => {
    for (const seg of wrapText(text, f, size, WIDTH)) line(seg, { size, color, dy, f });
    y -= gap;
  };
  const rightText = (text, { size = 9, f = font, color = ink } = {}) => {
    page.drawText(String(text), { x: RIGHT - f.widthOfTextAtSize(String(text), size), y, size, font: f, color });
  };
  const rule = () => { need(10); page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.7, color: grey }); y -= 12; };

  line('Property condition — Tax Code § 41.41(a)(1)', { f: bold, size: 13, dy: 19 });
  line(`Account ${packet.form50132?.accountNumber || ''}  ·  Tax year ${packet.form50132?.taxYear || ''}`,
    { color: grey, dy: 16 });

  para('The comparable properties on the preceding page are appraised in ordinary condition. '
    + 'This property is not. The cost of putting it into that condition is set out below, priced '
    + 'from published national repair cost data and adjusted for this property’s size and finish '
    + 'level, or taken from the owner’s own contractor estimate where one was supplied. A '
    + 'photograph shows that something is wrong; a figure shows how much.', { gap: 14 });

  // ── priced defects ────────────────────────────────────────────────────────
  if ((c.priced || []).length) {
    need(28);
    page.drawText('Defect', { x: LEFT, y, size: 8, font: bold, color: grey });
    page.drawText('Basis for the figure', { x: 268, y, size: 8, font: bold, color: grey });
    rightText('Cost to cure', { size: 8, f: bold, color: grey });
    y -= 4;
    rule();

    for (const x of c.priced) {
      need(24);
      page.drawText(String(x.issue || ''), { x: LEFT, y, size: 9, font, color: ink });
      const basis = x.ownerSupplied
        ? 'Owner’s own contractor estimate'
        : [x.source, x.sourceYear].filter(Boolean).join(', ');
      for (const [i, seg] of wrapText(basis, font, 8, 200).entries()) {
        page.drawText(seg, { x: 268, y: y - i * 9.5, size: 8, font, color: grey });
      }
      rightText(`$${money(x.asked)}`);
      y -= 12;
      if (x.scope) {
        for (const seg of wrapText(x.scope, font, 8, 200)) {
          need(10); page.drawText(seg, { x: LEFT, y, size: 8, font, color: grey }); y -= 9.5;
        }
      }
      y -= 3;
    }

    rule();
    need(16);
    page.drawText('TOTAL COST TO CURE', { x: LEFT, y, size: 9.5, font: bold, color: ink });
    rightText(`$${money(c.cureDollars)}`, { size: 9.5, f: bold });
    y -= 20;
  }

  // ── conditions that cannot be cured ───────────────────────────────────────
  if ((c.narrative || []).length) {
    line('Conditions that cannot be repaired, and are therefore not priced above',
      { f: bold, size: 9.5, dy: 15 });
    /**
     * The label goes on its own line rather than running the narrative in beside
     * it. The first version did the latter and the paragraph came out visibly
     * ragged: the text was wrapped to the width left of the bold label, then its
     * continuation lines were drawn at the full left margin, so every line after
     * the first under-filled by the width of the label. Two different widths for
     * one paragraph. Found by looking at the rendered page, which is the only way
     * any of the Section 5 defects were ever found.
     */
    for (const x of c.narrative) {
      need(26);
      line(x.issue || '', { f: bold, size: 9, dy: 12, x: LEFT + 8 });
      for (const seg of wrapText(x.narrative || '', font, 9, RIGHT - (LEFT + 8))) {
        need(12);
        page.drawText(seg, { x: LEFT + 8, y, size: 9, font, color: ink });
        y -= 12;
      }
      y -= 6;
    }
    y -= 4;
    para('No dollar figure is claimed for these. They cannot be cured by spending money, so pricing '
      + 'them would be inventing evidence. They are stated because they bear on what a buyer would pay.',
      { gap: 14 });
  }

  if (c.doubleCountDisclosure) {
    para(`Stated plainly: ${c.doubleCountDisclosure}`, { gap: 14 });
  }

  // ── the limit of the claim, in the document's own words ───────────────────
  line('What this exhibit is, and is not.', { f: bold, size: 9.5, dy: 13 });
  para('These figures are the cost of the repairs. They are NOT a claim that this property’s value '
    + 'falls by that same amount — what a repair costs and what a buyer deducts for it are different '
    + 'numbers, and no one has appraised this property. They are put before the board as evidence that '
    + 'this property is not in the ordinary condition the comparable properties are appraised in, and '
    + 'therefore belongs at or below the value requested on the notice of protest. What weight to give '
    + 'them is the board’s to decide.', { gap: 14 });

  para('Compiled at the property owner’s request from information the owner supplied about the '
    + 'property’s condition. No inspection of the property was performed by anyone in preparing this '
    + 'exhibit — the figures are published cost estimates, not an inspector’s or appraiser’s findings. '
    + 'It is submitted by the owner, who signed the notice of protest.', { size: 8, gap: 0 });

  return page;
}

export default { fill50132, FORM_REVISION, FORM_RELATIVE_PATH, loadBlankForm };
