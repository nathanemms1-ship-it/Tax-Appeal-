/**
 * OFFLINE VERIFICATION for the Texas mailed kit (lib/kit/txKit.js) on the
 * shared kit layout (lib/kit/assembleKit.js). Added 15 Oct 2026.
 *
 * The Texas protest itself (buildProtest, Form 50-132's fields) is proven by
 * verify-tx-protest and verify-tx-form. This file proves what the KIT adds:
 * the layout Lob depends on, the blank signature, Section 1's mailing address,
 * the deadline wording, the refusals, and a clean PDF. Where a line says
 * INJECTION, reintroducing that bug makes the named assertion fail.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { PDFDocument, PDFName, PDFArray, decodePDFRawStream } = await import('pdf-lib');
const { buildTxKit, validateTxOrder } = await import('../lib/kit/txKit.js');
const { KitError, LOB_KIT_BASE, MAX_KIT_PAGES } = await import('../lib/kit/assembleKit.js');
const { getAppealAddress } = await import('../lib/appealAddresses.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = new Date('2027-04-20T00:00:00Z');

const { txPacket } = await import('./kit/tx-fixture.mjs');
const PACKET = txPacket();
const ROW = getAppealAddress('TX', 'El Paso');
const MAILABLE = { ...ROW, confidence: 'confirmed', verifiedOn: '2027-03-01' };
const order = (patch = {}) => ({
  state: 'TX', taxYear: 2027, packet: PACKET,
  property: { county: 'El Paso', address: '8023 Marbella Creek Ave, El Paso, TX 79907' },
  owner: { name: 'Jane Doe', street: '8023 Marbella Creek Ave', city: 'El Paso', state: 'TX', zip: '79907' },
  countyAddress: ROW, savings: { yearlySaving: 1100 }, ...patch,
});
const code = async (fn) => { try { await fn(); return 'ok'; } catch (e) { return e instanceof KitError ? e.code : `other: ${e.message}`; } };

function decode(doc, ref) {
  const s = doc.context.lookup(ref);
  if (!s || !s.contents) return '';
  try { return Buffer.from(decodePDFRawStream(s).decode()).toString('latin1'); } catch { return ''; }
}
/** Our own pages' text (cover, checklist, record): pdf-lib writes it as hex runs. */
async function pageText(pdf, n) {
  const doc = await PDFDocument.load(pdf);
  const c = doc.getPage(n - 1).node.get(PDFName.of('Contents'));
  const refs = !c ? [] : c instanceof PDFArray ? c.asArray() : [c];
  return refs.map((r) => decode(doc, r)).join('\n').replace(/<([0-9A-Fa-f]*)> Tj/g, (_, h) => Buffer.from(h, 'hex').toString('latin1'));
}

// ── 1. PREREQUISITES ────────────────────────────────────────────────────────
t('the fixture is a filable Texas packet with a comps grid', PACKET.filable === true && PACKET.hasGrid === true && PACKET.form50132);
t('El Paso has an address row (unverified today)', ROW && ROW.confidence !== 'confirmed');

// ── 2. THE LAYOUT LOB DEPENDS ON ────────────────────────────────────────────
const kit = await buildTxKit(order(), { proof: true, now: NOW });
const L = kit.layout;
t('8 pages, 4 sheets: cover, checklist, Form 50-132 (one sheet), evidence (own sheet), record + blank', L.pages === 8 && L.sheets === 4 && JSON.stringify(L.blockPages) === '[[3,4],[5]]');
// INJECTION: hardcode perforated_page in txKit -> FAILS on the no-grid kit below.
t('Lob options are the shared base plus the computed perforated page', JSON.stringify(kit.lob) === JSON.stringify({ ...LOB_KIT_BASE, perforated_page: 7 }) && L.perforatedPage === 7);
t('Lob never gets extra_service (certified mail is the owner\'s choice, not ours)', !('extra_service' in kit.lob));
const doc = await PDFDocument.load(kit.pdf);
t('the PDF has the page count the layout says', doc.getPageCount() === L.pages);

const noGrid = await buildTxKit(order({ packet: { ...PACKET, hasGrid: false, grid: null } }), { proof: true, now: NOW });
t('no evidence pages: the form alone, 6 pages, perforated page 5', noGrid.layout.pages === 6 && noGrid.lob.perforated_page === 5 && JSON.stringify(noGrid.layout.blockPages) === '[[3,4]]');
t('no evidence pages: the checklist does not mention evidence', !/evidence/i.test(await pageText(noGrid.pdf, 2)));

const many = Array.from({ length: 150 }, (_, i) => ({ issue: `Defect number ${i + 1} requiring remedial work to reach ordinary condition`, scope: 'A scope line long enough to wrap onto a second line beneath the defect name', source: 'RSMeans', sourceYear: 2027, asked: 3000 + i * 250 }));
const huge = await code(() => buildTxKit(order({ packet: { ...PACKET, conditionExhibit: { cureDollars: 1, priced: many, narrative: [], doubleCountDisclosure: 'x' } } }), { proof: true, now: NOW }));
t(`a kit over ${MAX_KIT_PAGES} pages is refused, never mailed in a bigger envelope`, huge === 'too_many_pages');

// ── 3. A CLEAN FILE ─────────────────────────────────────────────────────────
// INJECTION: remove the /Annots delete in addSourcePage -> both FAIL (30 dangling
// widget refs from the flattened 50-132; Poppler reports the file as broken).
const annotCount = (p) => { const a = p.node.lookup(PDFName.of('Annots')); return a instanceof PDFArray ? a.size() : 0; };
t('no page in the kit keeps annotations', doc.getPages().every((p) => annotCount(p) === 0));
const raw = Buffer.from(kit.pdf).toString('latin1');
const xref = raw.slice(raw.lastIndexOf('\nxref\n'));
t('the xref is one unbroken section (no holes from dangling refs)', (xref.match(/\n\d+ \d+\n/g) || []).length === 1);

// ── 4. WHAT THE OWNER SIGNS ─────────────────────────────────────────────────
// INJECTION: pass a signature to fill50132 -> FAILS (we never sign for the owner).
t('Form 50-132 is filled with NO signature: Section 8 stays blank for the pen', /fill50132\(o\.packet, null\)/.test(read('lib/kit/txKit.js')));
const v = validateTxOrder(order(), { proof: true, now: NOW });
// INJECTION: drop the ownerMailing fallback -> FAILS (Section 1 printed empty on the 15 Oct proof).
t("Section 1's mailing address comes from the order when the packet has none", v.packet.form50132.ownerMailing === '8023 Marbella Creek Ave, El Paso, TX 79907');
const own = validateTxOrder(order({ packet: { ...PACKET, form50132: { ...PACKET.form50132, ownerMailing: 'PO Box 1, El Paso, TX 79901' } } }), { proof: true, now: NOW });
t("a mailing address already on the packet is kept", own.packet.form50132.ownerMailing === 'PO Box 1, El Paso, TX 79901');
t('the order passed in is not mutated', PACKET.form50132.ownerMailing == null);

// ── 5. THE DEADLINE ─────────────────────────────────────────────────────────
const cover = await pageText(kit.pdf, 1);
t('the deadline is the statutory floor, rolled (2027: Monday 17 May)', kit.deadline.toISOString().slice(0, 10) === '2027-05-17' && /17 May 2027|May 17, 2027/.test(cover));
t('the cover says the later 30-day date may apply', /30 days after your notice was delivered/.test(cover));
t('the cover says we do not file or represent', /We do not file your protest, represent you or appear for you/.test(cover));
t('proof kits are stamped SAMPLE', /SAMPLE - NOT FOR FILING/.test(cover));
const prod = await buildTxKit(order({ countyAddress: MAILABLE }), { now: NOW });
t('production kits are not stamped', !/SAMPLE/.test(await pageText(prod.pdf, 1)));
t('the record page carries the district address for the window', /5801 TROWBRIDGE DR/.test(await pageText(kit.pdf, L.perforatedPage)));

// ── 6. REFUSALS ─────────────────────────────────────────────────────────────
t('a Georgia order is refused', await code(() => buildTxKit(order({ state: 'GA' }), { proof: true, now: NOW })) === 'wrong_state');
t('a tax year the deadline module has not checked is refused', await code(() => buildTxKit(order({ taxYear: 2031 }), { proof: true, now: NOW })) === 'bad_tax_year');
t('no packet, no kit', await code(() => buildTxKit(order({ packet: null }), { proof: true, now: NOW })) === 'no_packet');
t('no owner zip, no kit', await code(() => buildTxKit(order({ owner: { ...order().owner, zip: '' } }), { proof: true, now: NOW })) === 'owner_incomplete');
// INJECTION: skip isMailable in validateTxOrder -> FAILS.
t('an unverified district address is never printed on a real kit', await code(() => buildTxKit(order(), { now: NOW })) === 'address_not_mailable');

// ── 7. WIRING ───────────────────────────────────────────────────────────────
const cfg = read('next.config.js');
// INJECTION: drop the notice-reminder entry (the Texas roll pass dispatches kits) -> FAILS.
t('every route that dispatches kits bundles the blank Form 50-132', ['/api/webhooks/stripe', '/api/cron/process-queued-orders', '/api/process-order-now', '/api/cron/notice-reminder'].every((r) => new RegExp(`'${r}': \\[[^\\]]*'\\./forms/tx/\\*\\*'`).test(cfg)));
t('the Texas kit does not import the Georgia kit (keeps 2 MB of GA forms out of it)', !/from '\.\/gaKit'/.test(read('lib/kit/txKit.js')));

// ── 8. SOLD ONLY WHEN THE BILL DROPS (lib/kit/txQuote.js) ──────────────────
// Nathan, 15 Oct 2026: Texas follows Georgia. Any caution is a no-sale.
{
  const { txKitDecision, txSellability, TX_QUOTE } = await import('../lib/kit/txQuote.js');
  const { txKitOrder } = await import('./kit/tx-fixture.mjs');
  const { SERVICE_PRICE_DOLLARS } = await import('../lib/pricing.js');
  t('the clean El Paso packet is a case (bill drops by more than the price)', txKitDecision(PACKET).decision === TX_QUOTE.CASE && PACKET.estimatedSaving >= SERVICE_PRICE_DOLLARS);
  // INJECTION: ignore cautions in txKitDecision -> FAILS (the 7 Sept "owner decides" rule would sell these).
  for (const code of ['saving_below_fee', 'capped_beyond_reach', 'not_over_appraised', 'insufficient_comparables', 'cap_artifact_only', 'nothing_to_ask_for', 'no_value_on_roll']) {
    const d = txKitDecision({ ...PACKET, cautions: [{ code, message: 'x' }] });
    t(`a ${code} caution is a no-sale`, d.decision === TX_QUOTE.NO_CASE && d.reason === code);
  }
  // INJECTION: compare against 0 instead of SERVICE_PRICE_DOLLARS -> FAILS.
  t('a clean packet saving less than the price is a no-sale', txKitDecision({ ...PACKET, estimatedSaving: SERVICE_PRICE_DOLLARS - 1 }).reason === 'bill_wont_drop_enough');
  t('no value to ask for is a no-sale', txKitDecision({ ...PACKET, form50132: { ...PACKET.form50132, opinionOfValue: null } }).reason === 'nothing_to_ask_for');
  t('no packet is a no-sale', txKitDecision(null).reason === 'no_packet');
  const s1 = txSellability(txKitOrder(), { now: NOW });
  // INJECTION: skip the address check in txSellability -> FAILS.
  t('a real case in a district whose address is unconfirmed is not sellable', s1.ok === false && s1.reason === 'address_not_confirmed' && !s1.noCase);
  const s2 = txSellability(txKitOrder({ packet: { ...PACKET, cautions: [{ code: 'saving_below_fee' }] } }), { now: NOW });
  t('txSellability says no-case before it looks at the county', s2.ok === false && s2.noCase === true && s2.reason === 'saving_below_fee');

  const route = read('pages/api/generate-50132.js');
  t('the route issues a kitKey only for a sellable case', /if \(sell\.ok && redis\) \{\s*kitKey = `kit:TX:\$\{crypto\.randomUUID\(\)\}`/.test(route));
  t('the route never sends the kit order or the packet back to the browser', !/kitOrder,|kitOrder:|packet,\n|\bpacket:/.test(route.slice(route.indexOf('success: true, filable: true'))));
  t('the preview path returns before any kitKey is issued', route.indexOf('b.preview === true') < route.indexOf('const decision = txKitDecision(packet)'));
  const checkout = read('pages/api/checkout.js');
  // INJECTION: drop TX from KIT_SELLABILITY -> FAILS.
  t('checkout runs txSellability on the STORED Texas order before Stripe', /TX: \(o\) => \(o\?\.presale === true \? txPresaleSellability\(o\) : txSellability\(o\)\)/.test(checkout) && checkout.indexOf('KIT_SELLABILITY[kitState](kitOrder)') < checkout.indexOf('stripe.checkout.sessions.create'));
  t('a stored order for another state is refused (no GA kitKey sold as TX)', /kitOrder\.state !== kitState/.test(checkout) && /\^kit:\$\{kitState\}:/.test(checkout));
  t('the Texas line item is the kit at the price constant, and never says we file', /Texas protest kit, mailed to you/.test(checkout) && /we do not file your protest or represent you/.test(checkout) && (checkout.match(/unit_amount: SERVICE_PRICE_CENTS/g) || []).length >= 2);
  const ui = read('components/TxKitCheckout.js');
  t('no checkout without the documents-only acknowledgment', /disabled=\{!agreed \|\| busy\}/.test(ui) && /does not file it, represent me or appear for me/.test(ui));
  t("a case in a district that isn't open joins the waitlist", /blockedReason: 'tx_county_not_open'/.test(ui) && /'tx_county_not_open'/.test(read('lib/waitlistReasons.js')));
  t('every no-sale reason has customer copy', ['saving_below_fee', 'capped_beyond_reach', 'not_over_appraised', 'insufficient_comparables', 'cap_artifact_only', 'nothing_to_ask_for', 'no_value_on_roll', 'bill_wont_drop_enough'].every((c) => new RegExp(`\\b${c}:`).test(ui)));
}

console.log(`verify-tx-kit: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
