/**
 * OFFLINE VERIFICATION for the Georgia "should you appeal?" check and its gate
 * at checkout (Kit model):
 *   lib/kit/gaQuote.js        quoteGaKit, gaSellability
 *   pages/api/ga-kit-quote.js the route (cache, spend, kitKey, nothing printable returned)
 *   pages/api/checkout.js     Georgia sells only a stored, re-validated kit, at $89
 *   components/GaKitStep.js   the step the apply funnel shows for Georgia
 *
 * No network: the home record and the sales are fakes. Where a line says
 * INJECTION, reintroducing that bug makes the named assertion fail.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { quoteGaKit, gaSellability, QUOTE } = await import('../lib/kit/gaQuote.js');
const { SERVICE_PRICE_CENTS, SERVICE_PRICE_DOLLARS } = await import('../lib/pricing.js');
const { reviveSales, cleanQuoteInput } = await import('../pages/api/ga-kit-quote.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const NOW = new Date('2027-05-20T00:00:00Z');
const SUBJECT = { lat: 33.9, lon: -84.1, sqft: 2000, yearBuilt: 2000, parcelId: 'R1234 567', propertyType: 'Single Family' };
const at = (mi) => ({ lat: 33.9 + mi * 0.01449, lon: -84.1 });
const sale = (o = {}) => ({ address: `${Math.random()}`, parcelId: null, ...at(0.4), sqft: 2000, yearBuilt: 2000, price: 400000, saleDate: new Date('2026-08-01'), ...o });
const SALES = [sale({ price: 390000 }), sale({ price: 400000 }), sale({ price: 410000 }), sale({ price: 400000, saleDate: new Date('2027-03-01') })]; // the last is after 1 Jan 2027
const deps = (o = {}) => ({ lookupSubject: async () => (o.subject === undefined ? SUBJECT : o.subject), fetchSales: async () => o.sales || SALES, now: NOW });
const base = ({ property = {}, ...o } = {}) => ({
  owner: { name: 'Pat Owner', street: '1 Main St', city: 'Lawrenceville', state: 'GA', zip: '30044', email: 'pat@example.com' },
  taxYear: 2027, noticeValue: 480000, noticeDate: '2027-05-14', homestead: false, ...o,
  property: { street: '1 Main St', city: 'Lawrenceville', state: 'GA', zip: '30044', county: 'Gwinnett', ...property },
});

// ── 1. ASKS BEFORE IT ANSWERS ───────────────────────────────────────────────
t('a Texas address is not quoted as Georgia', (await quoteGaKit(base({ property: { state: 'TX' } }), deps())).reason === 'not_georgia');
t('no notice value: ask for it', (await quoteGaKit(base({ noticeValue: '' }), deps())).reason === 'need_notice_value');
// INJECTION: default homestead to false when missing -> FAILS (a homestead would be quoted as uncapped).
t('homestead must be answered, never assumed (asked before any RentCast call)', await (async () => { let called = 0; const r = await quoteGaKit(base({ homestead: undefined }), { lookupSubject: async () => { called++; return SUBJECT; }, fetchSales: async () => { called++; return SALES; }, now: NOW }); return r.decision === QUOTE.NEED_INFO && r.reason === 'need_homestead_answer' && called === 0; })());
t('no property record: no case, no guess', (await quoteGaKit(base(), deps({ subject: null }))).reason === 'no_property_record');

// ── 2. IS IT OVER-ASSESSED? ─────────────────────────────────────────────────
t('fewer than 3 recorded sales: no case', (await quoteGaKit(base(), deps({ sales: SALES.slice(0, 2) }))).reason === 'too_few_comps');
t('notice close to what sales show: not over-assessed, no sale', (await quoteGaKit(base({ noticeValue: 405000 }), deps())).reason === 'not_over_assessed');
let q = await quoteGaKit(base(), deps());
// INJECTION: drop asOf from the comps call -> FAILS (a March 2027 sale would be evidence for a 1 Jan 2027 value).
t('only sales before 1 January of the digest year are used', q.comps.length === 3 && q.comps.every((c) => c.saleDate < '2027-01-01'));
t('the requested value is the sales-indicated value', q.kitOrder?.requestedValue === 400000 && q.indicatedValue === 400000);

// ── 3. DOES THE BILL DROP BY AT LEAST THE PRICE? ────────────────────────────
// INJECTION: pass a price of 0 (or drop the bill check) -> FAILS (Fulton homesteads would be sold a kit that saves ~$5).
const fultonHome = await quoteGaKit(base({ property: { county: 'Fulton' }, homestead: true, fultonBilling100: false }), deps());
t('Fulton homestead (capped county, capped schools): bill barely moves, no sale', fultonHome.decision === QUOTE.NO_CASE && fultonHome.reason === 'bill_wont_drop_enough');
t('Muscogee homestead (Columbus freeze): no sale', (await quoteGaKit(base({ property: { county: 'Muscogee' }, homestead: true }), deps())).reason === 'bill_wont_drop_enough');
t('the bill check is measured against the $89 price', SERVICE_PRICE_CENTS === 8900 && SERVICE_PRICE_DOLLARS === 89 && /price: SERVICE_PRICE_DOLLARS/.test(read('lib/kit/gaQuote.js')));
t('Gwinnett, not a homestead, $80,000 over: a case, with the yearly saving', q.decision === QUOTE.CASE && q.savings.yearlySaving >= 89);

// ── 4. CAN THIS COUNTY BE SOLD TODAY? ───────────────────────────────────────
// Every GA appeal address is unverified today: a real case, not sellable.
// INJECTION: skip the address check in gaSellability -> FAILS.
t('a real case in a county whose address is unconfirmed is not sellable', q.decision === QUOTE.CASE && q.sellable === false && q.notSellableReason === 'address_not_confirmed');
const cham = await quoteGaKit(base({ property: { county: 'Chatham' } }), deps());
t("Chatham: its form's ownership question is asked before anything else", cham.decision === QUOTE.NEED_INFO && cham.reason === 'need_ownedOnJan1');
const ful = await quoteGaKit(base({ property: { county: 'Fulton' } }), deps());
t("Fulton: the 85%/100% billing choice is asked, never assumed", ful.decision === QUOTE.NEED_INFO && ful.reason === 'need_fultonBilling100');
t('Clayton (form unconfirmed): a case, not sellable', (await quoteGaKit(base({ property: { county: 'Clayton' } }), deps())).notSellableReason === 'county_form_unconfirmed');
t('Cobb for 2027 (its form says 2026): not sellable', (await quoteGaKit(base({ property: { county: 'Cobb' } }), deps())).notSellableReason === 'county_form_wrong_year');
t('gaSellability refuses a blank value outright', gaSellability({ ...q.kitOrder, requestedValue: 0 }, { now: NOW }).ok === false);

// ── 5. THE ROUTE ────────────────────────────────────────────────────────────
const route = read('pages/api/ga-kit-quote.js');
// INJECTION: return the whole quote (kitOrder included) -> FAILS.
t('the route never sends the kit order back to the browser', /const \{ kitOrder, \.\.\.publicQuote \} = quote/.test(route) && !/res\.status\(200\)\.json\(quote\)/.test(route));
t('a kitKey is issued only for a sellable case', /quote\.decision === QUOTE\.CASE && quote\.sellable && redis/.test(route));
t('every uncached RentCast call passes the spend ceiling', (route.match(/await spendOrThrow\(1\)/g) || []).length === 2);
t('the route is rate limited', /enforceRateLimit\(req, res, 'ga-kit-quote'/.test(route));
const revived = reviveSales(JSON.parse(JSON.stringify(SALES)));
// INJECTION: drop .then(reviveSales) -> cached sales compare strings to Dates and every comp silently disappears.
t('cached sales get their dates back as Dates', revived[0].saleDate instanceof Date && /\.then\(reviveSales\)/.test(route));
const cleaned = cleanQuoteInput({ property: { street: ' 1 Main ', state: 'ga' }, homestead: 'yes', noticeDate: 'tomorrow', evil: 1 });
t('the route keeps only known fields, and only real booleans and dates', cleaned.property.street === '1 Main' && cleaned.property.state === 'GA' && cleaned.homestead === undefined && cleaned.noticeDate === null && !('evil' in cleaned));

// ── 6. CHECKOUT ─────────────────────────────────────────────────────────────
const checkout = read('pages/api/checkout.js');
// INJECTION: remove the GA gate -> FAILS.
t('checkout refuses Georgia without a stored kit', /const isKit = isKitGA \|\| isKitTX/.test(checkout) && /if \(isKit\) \{[\s\S]{0,400}KIT_CHECK_REQUIRED/.test(checkout));
t('checkout re-validates the STORED kit order before Stripe', /KIT_SELLABILITY = \{ GA: \(o\) => \(o\?\.presale === true \? gaPresaleSellability\(o\) : gaSellability\(o\)\), TX: txSellability \}/.test(checkout) && /const sell = KIT_SELLABILITY\[kitState\]\(kitOrder\)/.test(checkout) && checkout.indexOf('KIT_SELLABILITY[kitState](kitOrder)') < checkout.indexOf('stripe.checkout.sessions.create'));
t('the Georgia line item is the kit at the $89 constant, and never says we file', /name: 'TaxAppeal USA — Georgia appeal kit, mailed to you'/.test(checkout) && /unit_amount: SERVICE_PRICE_CENTS/.test(checkout) && /we do not file your appeal or represent you/.test(checkout));
t('the kitKey rides in the Stripe metadata to the webhook', /kitKey: isKit \? kitKey : ''/.test(checkout));

// ── 7. THE FUNNEL ───────────────────────────────────────────────────────────
const step = read('components/GaKitStep.js');
const apply = read('pages/apply.js');
t('the apply funnel hands Georgia to the kit step', /setGaKit\(true\)/.test(apply) && /<GaKitStep/.test(apply));
t('the kit step checks out with the kitKey', /kitKey: quote\.kitKey/.test(step) && /fetch\('\/api\/checkout'/.test(step));
t('no checkout without the documents-only acknowledgment', /disabled=\{!agreed \|\| busy\}/.test(step) && /does not file it, represent me or appear for me/.test(step));
t('a no-case answer offers no purchase', !/no_case[\s\S]{0,600}Get my appeal kit/.test(step));
t("a case in a county that isn't open joins the waitlist instead of selling", /blockedReason: 'ga_county_not_open'/.test(step) && /'ga_county_not_open'/.test(read('lib/waitlistReasons.js')));

console.log(`verify-ga-quote: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
