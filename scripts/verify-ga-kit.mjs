/**
 * OFFLINE VERIFICATION for lib/kit/gaKit.js — the Georgia Mailed Kit.
 *
 * Builds real kits (no network) and reads them back. Where a line says
 * INJECTION, reintroducing that bug makes the named assertion fail.
 */
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { PDFDocument, PDFName, PDFArray } = await import('pdf-lib');
const kitMod = await import('../lib/kit/gaKit.js');
const { buildGaKit, validateGaOrder, pt311aFieldValues, gaDeadline, postageStep, KIT_LAYOUT, LOB_KIT_OPTIONS, WINDOW, KitError } = kitMod;
const { PT311A_BASE64, PT311A_SHA256 } = await import('../lib/kit/forms/pt311a.js');
const { POSTAGE_RESTRICTIONS, getAppealAddress } = await import('../lib/appealAddresses.js');
const { winAnsi, IN } = await import('../lib/kit/pdfText.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const NOW = new Date('2027-05-20T00:00:00Z');

const SAMPLE = JSON.parse(readFileSync(new URL('./kit/sample-order-GA.json', import.meta.url)));
// A row that passes isMailable, so the non-proof path can be exercised offline.
const MAILABLE_ROW = {
  addressee: 'Cobb County Board of Tax Assessors', attnLine: null, line1: 'PO BOX 649', line2: null,
  city: 'Marietta', stateAbbr: 'GA', zip: '30061-0649', confidence: 'confirmed', verifiedOn: '2027-02-01',
  cassValidated: true, postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
};
const order = (patch = {}) => ({ ...structuredClone(SAMPLE), countyAddress: MAILABLE_ROW, ...patch });
const code = async (fn) => { try { await fn(); return 'ok'; } catch (e) { return e instanceof KitError ? e.code : `other: ${e.message}`; } };

/**
 * Read back what a page prints. pdf-lib writes standard-font text as hex strings
 * after a "1 0 0 1 x y Tm" matrix. Returns the whole decoded text (page content
 * plus every form XObject it draws, which is where a flattened field lives) and
 * the positioned runs of the page content itself.
 */
function decode(doc, ref) {
  const s = doc.context.lookup(ref);
  if (!s || !s.contents) return '';
  const filter = s.dict.get(PDFName.of('Filter'));
  const body = filter && String(filter) === '/FlateDecode' ? inflateSync(Buffer.from(s.contents)) : Buffer.from(s.contents);
  return body.toString('latin1');
}
const unhex = (str) => str.replace(/<([0-9A-Fa-f]+)>/g, (_, h) => Buffer.from(h, 'hex').toString('latin1'));
async function readPage(pdfBytes, pageNo) {
  const doc = await PDFDocument.load(pdfBytes);
  const node = doc.getPage(pageNo - 1).node;
  const c = node.get(PDFName.of('Contents'));
  const refs = !c ? [] : c instanceof PDFArray ? c.asArray() : [c];
  const content = refs.map((r) => decode(doc, r)).join('\n');
  const runs = [];
  const re = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\s*<([0-9A-Fa-f]*)> Tj/g;
  for (let m; (m = re.exec(content));) runs.push({ x: +m[1], y: +m[2], text: Buffer.from(m[3], 'hex').toString('latin1') });
  const xo = node.Resources()?.lookup(PDFName.of('XObject'));
  const xtext = xo ? [...xo.entries()].map(([, r]) => decode(doc, r)).join('\n') : '';
  return { text: unhex(content) + '\n' + unhex(xtext).replace(/\(([^)]*)\)/g, '$1'), runs };
}
const pageText = async (pdf, n) => (await readPage(pdf, n)).text;

// ── 1. THE OFFICIAL FORM ────────────────────────────────────────────────────
const formBytes = Buffer.from(PT311A_BASE64, 'base64');
// INJECTION: change one byte of PT311A_BASE64 -> FAILS.
t('the embedded PT-311A is the DOR file byte for byte (sha256)', createHash('sha256').update(formBytes).digest('hex') === PT311A_SHA256);
const formDoc = await PDFDocument.load(formBytes);
const fieldNames = new Set(formDoc.getForm().getFields().map((f) => f.getName()));
const v = pt311aFieldValues(validateGaOrder(order(), { now: NOW }));
t('every field we fill exists on the DOR form', [...Object.keys(v.text), ...v.checks, v.radio[0]].every((n) => fieldNames.has(n)));
t('the BOE choice is the top radio button (Choice1)', v.radio[1] === 'Choice1' && formDoc.getForm().getRadioGroup('Group11').getOptions().includes('Choice1'));
t('grounds: Value; type: Real; class: Residential', ['Real', 'Value', 'Residential'].every((n) => v.checks.includes(n)));
t("the owner's value assertion is the requested value", v.text['Owners value assertion'][0] === '$401,000');
// The owner signs and dates in ink. A pre-filled date is a date they did not write.
t('signature date is never pre-filled', !('Date' in v.text));
t('no agent fields are filled (the owner files; we are not the agent)', !Object.keys(v.text).some((n) => /agent/i.test(n)));
t('nothing on the form names TaxAppeal', !Object.values(v.text).some(([s]) => /taxappeal/i.test(s)));

// ── 2. NEVER BLANK, ALWAYS LOWER ────────────────────────────────────────────
// INJECTION: delete the value_blank check -> these FAIL (a $0 or blank form would print).
t('a blank value assertion refuses the kit', await code(() => buildGaKit(order({ requestedValue: null }), { now: NOW })) === 'value_blank');
t('a zero value assertion refuses the kit', await code(() => buildGaKit(order({ requestedValue: 0 }), { now: NOW })) === 'value_blank');
t('"abc" as the value refuses the kit', await code(() => buildGaKit(order({ requestedValue: 'abc' }), { now: NOW })) === 'value_blank');
t('a value not below the notice refuses the kit', await code(() => buildGaKit(order({ requestedValue: 452000 }), { now: NOW })) === 'value_not_lower');
t('no notice value refuses the kit', await code(() => buildGaKit(order({ noticeValue: null }), { now: NOW })) === 'need_notice_value');
t('no parcel ID refuses the kit', await code(() => buildGaKit(order({ property: { ...SAMPLE.property, parcelId: ' ' } }), { now: NOW })) === 'property_incomplete');
t('a Texas order is not built as a Georgia kit', await code(() => buildGaKit(order({ state: 'TX' }), { now: NOW })) === 'wrong_state');

// ── 3. EVIDENCE ─────────────────────────────────────────────────────────────
const ev = (comps) => order({ evidence: { ...SAMPLE.evidence, comps } });
t('fewer than 3 sales refuses the kit', await code(() => buildGaKit(ev(SAMPLE.evidence.comps.slice(0, 2)), { now: NOW })) === 'too_few_comps');
// INJECTION: drop the valuation-date check -> FAILS.
t('a sale on or after 1 January of the digest year refuses the kit', await code(() => buildGaKit(ev([...SAMPLE.evidence.comps.slice(0, 3), { ...SAMPLE.evidence.comps[0], saleDate: '2027-01-01' }]), { now: NOW })) === 'comp_after_valuation_date');

// ── 4. THE ADDRESS ON THE RETURN ENVELOPE ───────────────────────────────────
const cobb = getAppealAddress('GA', 'Cobb');
// INJECTION: skip isMailable when proof is false -> FAILS.
t('an unconfirmed county address refuses a real kit', await code(() => buildGaKit(order({ countyAddress: { ...MAILABLE_ROW, confidence: 'unverified' } }), { now: NOW })) === 'address_not_mailable');
t('a stale confirmation refuses a real kit', await code(() => buildGaKit(order({ countyAddress: { ...MAILABLE_ROW, verifiedOn: '2025-01-01' } }), { now: NOW })) === 'address_not_mailable');
t('no county address refuses the kit', await code(() => buildGaKit(order({ countyAddress: null }), { now: NOW })) === 'no_county_address');
t('the seeded Cobb row (unverified today) builds only as a PROOF', await code(() => buildGaKit(order({ countyAddress: cobb }), { now: NOW })) === 'address_not_mailable'
  && await code(() => buildGaKit(order({ countyAddress: cobb }), { now: NOW, proof: true })) === 'ok');

// ── 5. THE BUILT KIT ────────────────────────────────────────────────────────
const real = await buildGaKit(order({ savings: { ok: true, yearlySaving: 554, provisional: true } }), { now: NOW });
const back = await PDFDocument.load(real.pdf);
t('8 pages, 4 sheets', back.getPageCount() === 8 && KIT_LAYOUT.sheets === 4);
t('every page is US Letter', back.getPages().every((p) => Math.round(p.getWidth()) === 612 && Math.round(p.getHeight()) === 792));
t('the form is flattened: no fillable fields reach the printer', back.getForm().getFields().length === 0 && !back.getPage(2).node.get(PDFName.of('Annots')));
t('Lob options: double-sided, B&W, first class, return envelope, page 7 perforated, address on page 1',
  LOB_KIT_OPTIONS.double_sided === true && LOB_KIT_OPTIONS.color === false && LOB_KIT_OPTIONS.return_envelope === true
  && LOB_KIT_OPTIONS.perforated_page === 7 && LOB_KIT_OPTIONS.address_placement === 'top_first_page' && LOB_KIT_OPTIONS.mail_type === 'usps_first_class');
t("the window box matches Lob's perforated template (4.25 x 1.125 in, 0.875 in from left, 0.5 in from bottom)",
  WINDOW.w === 4.25 * IN && WINDOW.h === 1.125 * IN && WINDOW.x === 0.875 * IN && WINDOW.y === 0.5 * IN);

const p1 = await pageText(real.pdf, 1), p2 = await pageText(real.pdf, 2), p5 = await pageText(real.pdf, 5), p7 = await pageText(real.pdf, 7);
// INJECTION: print the customer's address in the window instead of the county's -> FAILS.
const inWindow = (await readPage(real.pdf, 7)).runs.filter((r) => r.x >= WINDOW.x && r.x <= WINDOW.x + WINDOW.w && r.y >= WINDOW.y && r.y <= WINDOW.y + WINDOW.h).map((r) => r.text);
t('the tear-off WINDOW carries exactly the county appeal address', JSON.stringify(inWindow) === JSON.stringify(['Cobb County Board of Tax Assessors', 'PO BOX 649', 'Marietta, GA 30061-0649']));
t('nothing else prints in the window area', inWindow.length === 3);
t('the cover states the 45-day postmark deadline (14 May + 45 = 28 June 2027)', p1.includes('June 28, 2027') && gaDeadline('2027-05-14').toISOString().startsWith('2027-06-28'));
t('the cover says we do not file or represent', /do not file your appeal, represent you or appear for you/.test(p1));
t('the savings estimate appears on the customer cover, marked as an estimate', p1.includes('$554') && /estimate/.test(p1));
t('the savings figure never reaches the county pages', !p5.includes('$554') && !/tax bill/i.test(p5));
t('the evidence page carries every sale and the three values', SAMPLE.evidence.comps.every((c) => p5.includes(c.address)) && ['$452,000', '$401,000'].every((s) => p5.includes(s)));
t('the evidence page names the 1 January valuation date', p5.includes('January 1, 2027'));
t('the county-bound evidence page does not name TaxAppeal', !/taxappeal/i.test(p5));
t('the checklist tells the owner to sign in ink and keep pages 1-2', /Use a pen/.test(p2) && /Do not send them to the county/.test(p2));
// INJECTION: skip form.flatten() -> FAILS (the copied page would carry no field values: a BLANK form).
const p3 = await pageText(real.pdf, 3);
t('the printed form shows the value assertion, parcel, owner and year', ['$401,000', '16-0123-0-045-0', 'Sample Homeowner', '2027'].every((s) => p3.includes(s)));
t('a real kit carries no SAMPLE watermark', !(await pageText(real.pdf, 3)).includes('SAMPLE'));
const proofKit = await buildGaKit(order({ countyAddress: cobb }), { now: NOW, proof: true });
// INJECTION: drop the watermark loop -> FAILS (a proof could be signed and mailed).
t('a proof kit is stamped SAMPLE - NOT FOR FILING on every page', (await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((n) => pageText(proofKit.pdf, n)))).every((s) => s.includes('SAMPLE - NOT FOR FILING')));

// ── 6. POSTAGE AND TEXT SAFETY ──────────────────────────────────────────────
t('Forsyth-style "requires meter": go to the counter, a stamp is not accepted', /COUNTER/.test(postageStep(POSTAGE_RESTRICTIONS.REQUIRES_METER)) && /not accepted/.test(postageStep(POSTAGE_RESTRICTIONS.REQUIRES_METER)));
t('Cobb-style "no metered": stamp or counter, no office postage machine', /stamp/.test(postageStep(POSTAGE_RESTRICTIONS.NO_METERED)) && /postage machine/.test(postageStep(POSTAGE_RESTRICTIONS.NO_METERED)));
t('winAnsi keeps accents and maps curly quotes and dashes', winAnsi('José’s “home” — ok') === 'José\'s "home" - ok');
t('a name with an emoji or CJK still builds a kit', await code(() => buildGaKit(order({ owner: { ...SAMPLE.owner, name: 'Ana 李 Smith 🏠' } }), { now: NOW })) === 'ok');

console.log(`verify-ga-kit: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
