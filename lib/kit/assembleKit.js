/**
 * lib/kit/assembleKit.js — the kit LAYOUT, shared by every state.
 *
 * A state supplies what is particular to it (its cover wording, its checklist,
 * its filled official form and evidence pages, its record text); this file owns
 * everything that must be the same everywhere because Lob and the return
 * envelope depend on it:
 *
 *   p1        cover. Top 3.15" kept clear for Lob's address block.
 *   p2        checklist (back of p1).
 *   blocks    the county-bound pages: the filled official form, the evidence.
 *             Each block starts on the FRONT of a sheet and is padded to an
 *             even page count, so the pieces that go to the county are whole
 *             sheets the customer can pull out without tearing anything.
 *   record    the PERFORATED page: the customer's record above, the tear-off
 *             slip below whose address shows through the #9 window (Lob
 *             template: 4.25" x 1.125", 0.875" from the left, 0.5" from the
 *             bottom; slip = bottom 3.625").
 *   + blank   the back of the perforated sheet.
 *
 * Lob options are computed from the layout (perforated_page moves with the
 * number of county-bound pages), never retyped. At most 6 sheets (12 pages):
 * a 7th sheet changes the envelope and costs $2.495 more, so it is refused.
 */
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from 'pdf-lib';
import { Flow, IN, PAGE_W, PAGE_H, winAnsi } from './pdfText';
import { POSTAGE_RESTRICTIONS } from '../appealAddresses';

export const WINDOW = Object.freeze({ x: 0.875 * IN, y: 0.5 * IN, w: 4.25 * IN, h: 1.125 * IN });
export const SLIP_H = 3.625 * IN;
export const LOB_ADDRESS_CLEAR = 3.15 * IN;
export const MAX_KIT_PAGES = 12;
export const LOB_KIT_BASE = Object.freeze({
  color: false, double_sided: true, address_placement: 'top_first_page',
  mail_type: 'usps_first_class', return_envelope: true,
});

/** Every refusal to build a kit, in any state, carries a machine code. */
export class KitError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
/** Kept as a name for layout refusals; it IS a KitError. */
export const LayoutError = KitError;

/** How the customer must post it, per the county's published postage rule. Same in every state. */
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

function watermark(page, font) {
  page.drawText('SAMPLE - NOT FOR FILING', {
    x: 95, y: 230, size: 54, font, color: rgb(0.6, 0.6, 0.6), opacity: 0.35, rotate: degrees(45),
  });
}

/**
 * Copy one page of another document into the kit at Letter size. Forms that are
 * not Letter (Cobb's is 658 x 852 pt) are scaled to fit, centred, never cropped.
 * Embedding goes through saved bytes: embedPage on a live, freshly flattened
 * document dropped resources its fields point at.
 */
export async function addSourcePage(kit, srcDoc, index) {
  const src = srcDoc.getPage(index);
  // A kit is paper: no page in it keeps annotations. A flattened form's /Annots
  // still point at the widgets flattening removed, and copying them writes an
  // xref with holes that Poppler-based renderers report as a broken file
  // (found 15 Oct on the Texas Form 50-132: 30 dangling widget refs).
  src.node.delete(PDFName.of('Annots'));
  const { width, height } = src.getSize();
  if (Math.abs(width - PAGE_W) < 2 && Math.abs(height - PAGE_H) < 2) {
    const [p] = await kit.copyPages(srcDoc, [index]);
    kit.addPage(p);
    return;
  }
  const [emb] = await kit.embedPdf(await srcDoc.save({ useObjectStreams: false }), [index]);
  const k = Math.min(PAGE_W / width, PAGE_H / height);
  kit.addPage([PAGE_W, PAGE_H]).drawPage(emb, { x: (PAGE_W - width * k) / 2, y: (PAGE_H - height * k) / 2, xScale: k, yScale: k });
}

/**
 * @param {object} spec
 * @param {string} spec.title
 * @param {boolean} [spec.proof]                     stamp SAMPLE on every page
 * @param {(f: Flow) => void} spec.drawCover          body of p1 (below the Lob block)
 * @param {(layout) => string[]} spec.checklist       steps, unnumbered; layout gives page numbers
 * @param {(layout) => string[]} [spec.checklistNotes]
 * @param {Array<(ctx) => Promise<void>>} spec.blocks each adds >= 1 page via ctx.kit / ctx.newPage
 * @param {(f: Flow, layout) => void} spec.drawRecord top of the perforated page
 * @param {string} spec.slipLabel                     one line above the window
 * @param {string[]} spec.envelope                    2–5 address lines for the window
 */
export async function assembleKit(spec) {
  if (!Array.isArray(spec.envelope) || spec.envelope.length < 2 || spec.envelope.length > 5) {
    throw new LayoutError('bad_county_address', 'County address does not fit the window');
  }
  const kit = await PDFDocument.create();
  kit.setTitle(spec.title || 'Appeal kit');
  kit.setProducer('TaxAppeal USA');
  const fonts = { regular: await kit.embedFont(StandardFonts.Helvetica), bold: await kit.embedFont(StandardFonts.HelveticaBold) };
  const newPage = () => kit.addPage([PAGE_W, PAGE_H]);

  // County-bound blocks first (pages are re-ordered after), each padded to even.
  const blockPages = [];
  for (const block of spec.blocks) {
    const start = kit.getPageCount();
    await block({ kit, newPage, fonts });
    const added = kit.getPageCount() - start;
    if (added < 1) throw new LayoutError('empty_block', 'A county-bound block added no pages');
    const pages = Array.from({ length: added }, (_, i) => start + i + 3); // +2 cover/checklist, 1-based
    if (added % 2) newPage();
    blockPages.push(pages);
  }
  const perforatedPage = 2 + kit.getPageCount() + 1;
  const layout = {
    pages: perforatedPage + 1,
    sheets: (perforatedPage + 1) / 2,
    perforatedPage,
    blockPages,
    countyBoundPages: blockPages.flat(),
  };
  if (layout.pages > MAX_KIT_PAGES) throw new LayoutError('too_many_pages', `Kit would be ${layout.pages} pages; the #10 envelope holds ${MAX_KIT_PAGES}`);

  // p1 cover, p2 checklist: inserted in front.
  {
    const f = new Flow(kit.insertPage(0, [PAGE_W, PAGE_H]), fonts, { top: PAGE_H - LOB_ADDRESS_CLEAR });
    spec.drawCover(f);
  }
  {
    const f = new Flow(kit.insertPage(1, [PAGE_W, PAGE_H]), fonts);
    f.h1('Checklist');
    spec.checklist(layout).forEach((s, i) => f.check(`${i + 1}. ${s}`));
    f.space(6);
    for (const n of (spec.checklistNotes ? spec.checklistNotes(layout) : [])) f.text(n, { size: 9.5 });
  }
  // The perforated page: record above, window slip below. Then its blank back.
  {
    const page = newPage();
    const f = new Flow(page, fonts);
    spec.drawRecord(f, layout);
    // No tear line (Lob perforates and prints its own) and no stamp box (10 Oct proof).
    page.drawText(winAnsi(spec.slipLabel), { x: WINDOW.x + 0.12 * IN, y: WINDOW.y + WINDOW.h + 0.28 * IN, size: 8, font: fonts.bold });
    const size = spec.envelope.length > 4 ? 10 : 11;
    spec.envelope.forEach((line, i) => {
      page.drawText(winAnsi(line), { x: WINDOW.x + 0.12 * IN, y: WINDOW.y + WINDOW.h - 0.1 * IN - (i + 1) * size * 1.2, size, font: fonts.regular });
    });
    if (f.y < SLIP_H + 0.2 * IN) throw new LayoutError('layout_overflow', 'The record text runs into the tear-off slip');
  }
  newPage();

  if (spec.proof) for (const p of kit.getPages()) watermark(p, fonts.bold);
  if (kit.getPageCount() !== layout.pages) throw new LayoutError('layout', `Kit has ${kit.getPageCount()} pages, expected ${layout.pages}`);
  const pdf = await kit.save({ useObjectStreams: false });
  return { pdf, layout, lob: { ...LOB_KIT_BASE, perforated_page: perforatedPage } };
}
