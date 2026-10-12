/**
 * lib/kit/pdfText.js — the few drawing helpers the kit pages need, on pdf-lib.
 *
 * Why pdf-lib and not HTML: the kit must CONTAIN the official county form (a
 * PDF), and Lob takes one file per letter, either HTML or PDF, never both. So
 * the whole kit is one PDF. pdf-lib is pure JavaScript: no headless browser on
 * Vercel, and the same bytes in a test as in production.
 *
 * Coordinates are points from the bottom-left (72 pt = 1 inch). Letter size.
 */
import { rgb } from 'pdf-lib';

export const PAGE_W = 612;
export const PAGE_H = 792;
export const IN = 72;
export const BLACK = rgb(0, 0, 0);
export const GREY = rgb(0.35, 0.35, 0.35);

/**
 * The standard PDF fonts only encode WinAnsi. A customer's name with a curly
 * quote, an em dash or an accent outside Latin-1 would throw inside pdf-lib and
 * kill the kit. Map the common ones, drop the rest.
 */
export function winAnsi(s) {
  return String(s ?? '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .normalize('NFC')
    .replace(/[^\x20-\x7E¡-ÿ\n]/g, '');
}

export function wrap(text, font, size, width) {
  const out = [];
  for (const para of winAnsi(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

/** A cursor that flows text down a page. Returns the y after drawing. */
export class Flow {
  constructor(page, fonts, { x = 0.75 * IN, top = PAGE_H - 0.6 * IN, width = PAGE_W - 1.5 * IN } = {}) {
    this.page = page; this.f = fonts; this.x = x; this.y = top; this.width = width;
  }
  text(s, { size = 11, bold = false, gap = 4, color = BLACK, indent = 0, lead = 1.25 } = {}) {
    const font = bold ? this.f.bold : this.f.regular;
    for (const line of wrap(s, font, size, this.width - indent)) {
      this.y -= size * lead;
      this.page.drawText(line, { x: this.x + indent, y: this.y, size, font, color });
    }
    this.y -= gap;
    return this;
  }
  h1(s) { return this.text(s, { size: 17, bold: true, gap: 8 }); }
  h2(s) { this.y -= 4; return this.text(s, { size: 12.5, bold: true, gap: 4 }); }
  space(pt) { this.y -= pt; return this; }
  /** A bordered box of lines. */
  box(lines, { size = 11, bold = false, pad = 7 } = {}) {
    const font = bold ? this.f.bold : this.f.regular;
    const wrapped = lines.flatMap((l) => wrap(l, font, size, this.width - 2 * pad));
    const h = wrapped.length * size * 1.25 + 2 * pad;
    this.page.drawRectangle({ x: this.x, y: this.y - h, width: this.width, height: h, borderColor: BLACK, borderWidth: 1 });
    let y = this.y - pad;
    for (const l of wrapped) { y -= size * 1.25; this.page.drawText(l, { x: this.x + pad, y: y + 2, size, font }); }
    this.y -= h + 6;
    return this;
  }
  /** A checklist item: an empty square, then the text. */
  check(s, { size = 11 } = {}) {
    const lines = wrap(s, this.f.regular, size, this.width - 22);
    this.y -= size * 1.25;
    this.page.drawRectangle({ x: this.x, y: this.y - 1, width: 10, height: 10, borderColor: BLACK, borderWidth: 1 });
    lines.forEach((l, i) => {
      if (i) this.y -= size * 1.25;
      this.page.drawText(l, { x: this.x + 20, y: this.y, size, font: this.f.regular });
    });
    this.y -= 7;
    return this;
  }
  /** Simple table. cols: [{ head, width (fraction), align? }]. rows: arrays of strings. */
  table(cols, rows, { size = 9, pad = 3 } = {}) {
    const rowH = size * 1.25 + 2 * pad;
    const xs = []; let acc = this.x;
    for (const c of cols) { xs.push(acc); acc += c.width * this.width; }
    const drawRow = (cells, font) => {
      this.page.drawRectangle({ x: this.x, y: this.y - rowH, width: this.width, height: rowH, borderColor: BLACK, borderWidth: 0.75 });
      cells.forEach((cell, i) => {
        const w = cols[i].width * this.width;
        let t = winAnsi(cell);
        while (t.length > 1 && font.widthOfTextAtSize(t, size) > w - 2 * pad) t = t.slice(0, -2) + '.';
        const tw = font.widthOfTextAtSize(t, size);
        const x = cols[i].align === 'right' ? xs[i] + w - pad - tw : xs[i] + pad;
        this.page.drawText(t, { x, y: this.y - rowH + pad + 2, size, font });
        if (i) this.page.drawLine({ start: { x: xs[i], y: this.y }, end: { x: xs[i], y: this.y - rowH }, thickness: 0.75 });
      });
      this.y -= rowH;
    };
    drawRow(cols.map((c) => c.head), this.f.bold);
    for (const r of rows) drawRow(r, this.f.regular);
    this.y -= 8;
    return this;
  }
}

export const money = (n) => (n == null || !Number.isFinite(Number(n)) ? '-' : '$' + Math.round(Number(n)).toLocaleString('en-US'));
export const longDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
