/**
 * scripts/verify-fl-kit.mjs — the Florida petition kit (16 Oct 2026).
 *
 * What must stay true, each proven by putting its bug back (INJECTION notes):
 *   1. the DR-486 is the DOR's own file, filled for an owner representing
 *      themselves, unsigned, with its document JavaScript stripped
 *   2. a kit is sold only when the county's own qualified sales support a lower
 *      value AND the yearly bill drops by at least our $89 plus the county fee
 *   3. the deadline is the earlier of the owner's TRIM date and our table's
 *      date for that year, never a stale year's, and Florida's cut-offs are longer
 *   4. checkout sells the stored order at $89 only: the county fee is never charged
 *   5. the funnel buys through FlKitStep; nothing is signed online any more
 * Offline: no database, no Lob, no Stripe.
 */
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { fillDr486, countyOption, loadBlankDr486, FORM_SHA256 } = await import('../lib/fl/fillDr486.js');
const { flKitDecision, flKitDeadline, flSellability, quoteFlKit, flTotalCost, FL_QUOTE } = await import('../lib/kit/flQuote.js');
const { buildFlKit, flEnvelope } = await import('../lib/kit/flKit.js');
const { deliveryMode, cutoffsFor } = await import('../lib/kit/delivery.js');
const { cleanFlQuoteInput } = await import('../pages/api/fl-kit-quote.js');
const { flOrder, flParcelRow, flComps, FL_NOW } = await import('./kit/fl-fixture.mjs');
const { PDFDocument } = await import('pdf-lib');

let pass = 0; const fails = [];
const t = (name, ok) => { if (ok) pass++; else fails.push(name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || e.message; } };

// ── 1. THE FORM ─────────────────────────────────────────────────────────────
t('the blank DR-486 is the pinned DOR file', loadBlankDr486().length > 100000 && /^[0-9a-f]{64}$/.test(FORM_SHA256));
const owner = flOrder().owner;
const doc = await fillDr486({ county: 'Miami-Dade', taxYear: 2027, owner, parcelId: '01-4139-001-2340', propertyAddress: '1 Main St, Miami, FL 33131', willNotAttend: true }, { inspect: true });
const form = doc.getForm();
const txt = (n) => form.getTextField(n).getText() || '';
// INJECTION: drop the Miami-Dade -> "Dade" mapping in countyOption -> FAILS.
t('Miami-Dade selects the form\'s own "Dade" option', /^Dade\s*$/.test(form.getDropdown('County Combo Box4').getSelected()[0] || ''));
t('the tax year box takes two digits', txt('Tax year 20') === '27');
t('Part 1 carries the owner, the parcel and the mailing address', txt('Taxpayer name') === owner.name && /01-4139-001-2340/.test(txt('Parcel ID and physical address or TPP account')) && /Tampa, FL 33614/.test(txt('Mailing address for notices')));
t('residential, real property value, decrease', form.getCheckBox('Res 14 units').isChecked() && form.getCheckBox('Real property value check one').isChecked() && form.getCheckBox('decrease').isChecked() && !form.getCheckBox('increase').isChecked());
t('"will not attend" is ticked only when the owner chose it', form.getCheckBox('I will not attend the hearing but would like my evidence considered In this instance only you must submit duplicate copies of').isChecked());
// INJECTION: fill 'Representative' or Part 3's Date -> FAILS. Nobody represents them; they sign and date in ink.
t('no representative, Part 3 printed name only: signature and date left for the pen', txt('Representative') === '' && txt('Print name') === owner.name && txt('Date') === '' && txt('Print name_2') === '' && txt('Print name_3') === '');
const flat = await fillDr486({ county: 'Hillsborough', taxYear: 2027, owner, parcelId: 'A1', propertyAddress: '1 Main St, Tampa, FL 33614' });
const flatBytes = Buffer.from(await flat.save({ useObjectStreams: false })).toString('latin1');
t('the petition is two pages (page 3 is "do not return")', flat.getPageCount() === 2);
// INJECTION: return the filled original instead of the fresh two-page copy -> FAILS.
t('no document JavaScript and no live fields in the printed petition', !/\/JavaScript|\/OpenAction|\/AcroForm/.test(flatBytes));
t('an unknown county is refused, never guessed', (await code(() => fillDr486({ county: 'Notareal', taxYear: 2027, owner, parcelId: 'A', propertyAddress: 'x' }))) === 'county_not_on_form');
t('every county the VAB table confirms is on the form', ['Hillsborough', 'Pinellas', 'Broward', 'Palm Beach', 'St. Johns', 'DeSoto', 'Miami-Dade', 'Indian River'].every((c) => countyOption(form.getDropdown('County Combo Box4').getOptions(), c)));

// ── 2. THE CHECK ────────────────────────────────────────────────────────────
const base = { parcel: flParcelRow(), comps: flComps(), cure: { total: 0 }, millage: { school: 5.4, nonSchool: 13.1 }, taxYear: 2027, county: 'Hillsborough' };
const d = flKitDecision(base);
t('a non-homestead home over-valued against qualified sales is a case', d.decision === FL_QUOTE.CASE && d.requestedValue === 357000 && d.yearlySaving > 139);
t('the threshold is our $89 plus the county fee ($50 in Hillsborough)', flTotalCost('Hillsborough').dollars === 139 && flTotalCost('Miami-Dade').dollars === 104);
// INJECTION: ignore comps.supportsReduction -> FAILS.
t('sales that do not support a lower value: no sale', flKitDecision({ ...base, comps: flComps({ supportsReduction: false, indicatedValue: 430000 }) }).reason === 'comps_do_not_support_reduction'
  // the subject's own sale above the comps: findComps marks it, and the mark alone must stop the sale
  && flKitDecision({ ...base, comps: flComps({ supportsReduction: false }) }).reason === 'comps_do_not_support_reduction');
t('too few sales: no sale, and the comps engine\'s reason is kept', flKitDecision({ ...base, comps: flComps({ sufficient: false, reason: 'too_few_comparable_in_size', list: [] }) }).reason === 'too_few_comparable_in_size');
// A homestead whose Save Our Homes cap holds assessed value far below just value: the bill cannot move.
const capped = flParcelRow({ av_sd: 210000, av_nsd: 210000, tv_sd: 160000, tv_nsd: 135000, exmpt_01: 50000 });
// INJECTION: drop the taxEffect step -> FAILS (a capped home would be sold a petition that saves nothing).
t('a capped homestead the petition cannot reach: no sale', flKitDecision({ ...base, parcel: capped }).reason === 'capped_beyond_reach');
const nearly = flParcelRow({ jv: 360000, av_sd: 360000, av_nsd: 360000, tv_sd: 360000, tv_nsd: 360000 });
t('a saving under $89 + fee: no sale', flKitDecision({ ...base, parcel: nearly }).reason === 'bill_wont_drop_enough');
t('last year\'s roll is never sold as this year\'s', flKitDecision({ ...base, parcel: flParcelRow({ asmnt_yr: 2026 }) }).reason === 'roll_not_this_year');
t('a commercial parcel: no sale', flKitDecision({ ...base, parcel: flParcelRow({ dor_uc: 11 }) }).reason === 'not_residential');
t('cost to cure lowers the value asked for, never the test the sales must pass', flKitDecision({ ...base, cure: { total: 12000 } }).requestedValue === 345000
  && flKitDecision({ ...base, cure: { total: 90000 }, comps: flComps({ supportsReduction: false, indicatedValue: 430000 }) }).decision === FL_QUOTE.NO_CASE);

// ── 3. THE DEADLINE AND DELIVERY ────────────────────────────────────────────
t('the owner\'s TRIM date is used when we hold no date for that year', flKitDeadline({ county: 'Hillsborough', taxYear: 2027, trimDeadline: '2027-09-09' })?.iso === '2027-09-09');
// INJECTION: drop the FL_COUNTY_DATES_YEAR check -> FAILS (2026's 7 Sept would be printed as 2027's).
t('a 2026 table date is never applied to 2027', flKitDeadline({ county: 'Hillsborough', taxYear: 2027, trimDeadline: '2027-09-20' })?.source === 'notice');
t('for the table\'s own year, the earlier of the two wins', flKitDeadline({ county: 'Hillsborough', taxYear: 2026, trimDeadline: '2026-09-18' })?.iso === '2026-09-07');
t('a date outside August-October, or in another year, is not a deadline', flKitDeadline({ county: 'Hillsborough', taxYear: 2027, trimDeadline: '2027-03-01' }) === null && flKitDeadline({ county: 'Hillsborough', taxYear: 2027, trimDeadline: '2028-09-01' }) === null);
t('Florida\'s cut-offs are longer than Georgia\'s and Texas\'s', cutoffsFor('FL').mail > cutoffsFor('GA').mail && cutoffsFor('TX').mail === cutoffsFor('GA').mail);
const dl = new Date('2027-09-07T00:00:00Z');
t('12 days out: Georgia mails, Florida emails the PDF', deliveryMode(dl, new Date('2027-08-26T12:00:00Z'), 'GA') === 'mail' && deliveryMode(dl, new Date('2027-08-26T12:00:00Z'), 'FL') === 'pdf');
t('2 days out: Florida is closed', deliveryMode(dl, new Date('2027-09-05T12:00:00Z'), 'FL') === 'closed');

// ── 4. SELLABILITY ──────────────────────────────────────────────────────────
t('the fixture order is sellable by mail on 16 Aug', (() => { const s = flSellability(flOrder(), { now: FL_NOW }); return s.ok && s.delivery === 'mail' && s.deadline === '2027-09-07'; })());
t('no TRIM date: not sold', flSellability(flOrder({ trimDeadline: null }), { now: FL_NOW }).reason === 'need_deadline');
// INJECTION: drop the stored-value re-check -> FAILS (a tampered order would print a different value).
t('a stored value that the stored facts do not produce is refused', flSellability(flOrder({ requestedValue: 250000 }), { now: FL_NOW }).reason === 'stored_value_mismatch');
t('an unconfirmed county (Dixie) is not sold', !flSellability(flOrder({ property: { ...flOrder().property, county: 'Dixie' } }), { now: FL_NOW }).ok);
t('an incomplete owner is not sold', flSellability(flOrder({ owner: { ...flOrder().owner, zip: '' } }), { now: FL_NOW }).reason === 'owner_incomplete');

// quoteFlKit end to end on fakes.
const deps = (row = flParcelRow(), comps = { ...flComps(), comps: flComps().list }) => ({
  findParcel: async () => row, findComps: async () => comps,
  millageForCounty: () => ({ school: 5.4, nonSchool: 13.1 }), countyName: () => 'Hillsborough',
  totalCostToCure: () => ({ total: 0, priced: [] }), now: FL_NOW,
});
const qIn = { property: { street: '1234 Sample Oak Dr', city: 'Tampa', zip: '33614' }, owner: flOrder().owner, taxYear: 2027, trimDeadline: '2027-09-07', willNotAttend: false };
const q = await quoteFlKit(qIn, deps());
t('the quote issues a sellable kit order built from the roll, not the browser', q.decision === 'case' && q.sellable && q.kitOrder.property.parcelId === 'A1234567890' && q.kitOrder.property.address === '1234 SAMPLE OAK DR, TAMPA, FL 33614' && q.kitOrder.requestedValue === 357000);
t('a stored quote passes checkout\'s gate as stored', flSellability(JSON.parse(JSON.stringify(q.kitOrder)), { now: FL_NOW }).ok);
t('no parcel: no case, nothing stored', (await quoteFlKit(qIn, deps({ noMatch: true }))).sellable === false);
t('the route keeps only known fields', (() => { const c = cleanFlQuoteInput({ property: { street: ' 1 Main ', zip: '33614', evil: 1 }, willNotAttend: 'yes', trimDeadline: 'soon', taxYear: '2027' }); return c.property.street === '1 Main' && !('evil' in c.property) && c.willNotAttend === false && c.trimDeadline === null && c.taxYear === 2027; })());

// ── 5. THE KIT ──────────────────────────────────────────────────────────────
const kit = await buildFlKit(flOrder(), { now: FL_NOW });
t('the kit: cover, checklist, DR-486 sheet, evidence sheet, record sheet', kit.layout.pages === 8 && kit.layout.perforatedPage === 7 && JSON.stringify(kit.layout.blockPages) === '[[3,4],[5]]');
const wna = await buildFlKit(flOrder({ willNotAttend: true }), { now: FL_NOW });
// INJECTION: drop the second evidence block -> FAILS (the form tells the clerk duplicates are coming).
t('"will not attend" carries the duplicate evidence the form requires', wna.layout.blockPages.length === 3 && wna.layout.pages === 10);
t('the window shows the county VAB, from the confirmed table', flEnvelope('Hillsborough')[0] === 'Hillsborough County Value Adjustment Board' && flEnvelope('Dixie') === null && kit.envelope.join('|') === flEnvelope('Hillsborough').join('|'));
t('Pinellas keeps its routing line', flEnvelope('Pinellas').some((l) => /^c\/o /i.test(l)));
t('the kit reports the county fee for the emails, and Lob options from the layout', kit.fee.cents === 5000 && kit.lob.perforated_page === 7 && kit.form.id === 'FL-DR-486');
t('a real kit is refused in a county with no confirmed address', (await code(() => buildFlKit(flOrder({ property: { ...flOrder().property, county: 'Dixie' } }), { now: FL_NOW }))) !== null);

// ── 6. WIRING ───────────────────────────────────────────────────────────────
const checkout = read('pages/api/checkout.js');
t('checkout gates Florida on the stored kit order', /FL: \(o\) => \(o\?\.presale === true \? flPresaleSellability\(o\) : flSellability\(o\)\)/.test(checkout) && /const isKitFL = kitState === 'FL'/.test(checkout));
// INJECTION: restore the VAB fee line item -> FAILS. The owner pays the county, not us.
t('checkout never charges the county fee', !/VAB Filing Fee/.test(checkout) && !/unit_amount: vabFee/.test(checkout) && /const vabFee = 0;/.test(checkout));
t('the Florida line items are the kit at the $89 constant and say the fee is the owner\'s', /Florida petition kit, mailed to you/.test(checkout) && /Florida petition kit, PDF by email/.test(checkout) && /The county fee is paid by you to the county and is not part of this charge/.test(checkout));
const dispatch = read('lib/kit/dispatchKit.js');
t('Florida is dispatched by the DR-486 builder', /FL: buildFlKit/.test(dispatch) && /deliveryMode\(kit\.deadline, now, order\.state\)/.test(dispatch));
const cfg = read('next.config.js');
t('every route that dispatches kits bundles the blank DR-486', ['/api/webhooks/stripe', '/api/cron/process-queued-orders', '/api/process-order-now', '/api/cron/notice-reminder', '/api/kit/trim'].every((r) => new RegExp(`'${r}': \\[[^\\]]*'\\./forms/fl/\\*\\*'`).test(cfg)));
const apply = read('pages/apply.js');
t('the funnel buys Florida through FlKitStep', /import FlKitStep from '\.\.\/components\/FlKitStep'/.test(apply) && /toUpperCase\(\) === 'FL'\) \{ setFlKit\(true\)/.test(apply) && /<FlKitStep/.test(apply));
// INJECTION: send applyResolvedCounty back to 'florida-fee' -> FAILS (the online signature step is gone).
t('nothing is signed online: the county step goes straight to the kit check', !/setStep\('florida-fee'\)/.test(apply) && !/<StepFloridaFee/.test(apply) && !existsSync(new URL('../components/StepFloridaFee.js', import.meta.url)));
t('the kit step posts to the Florida quote route and checks out with the kitKey only', /\/api\/fl-kit-quote/.test(read('components/FlKitStep.js')) && /kitKey: quote\.kitKey/.test(read('components/FlKitStep.js')));
t('the old Florida guard against kit copy is gone', /PENDING_FL_KIT = new Set\(\[\]\)/.test(read('scripts/verify-site-copy.mjs')));

console.log(`verify-fl-kit: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL: ${f}`);
if (fails.length) process.exit(1);
