/**
 * OFFLINE VERIFICATION for Georgia pre-sales (16 Oct 2026; Nathan: "I want to
 * keep pre sale"):
 *   lib/kit/gaQuote.js   presaleGaKit, gaPresaleSellability, noticeQuoteInput
 *   lib/kit/presale.js   processGaNotice: case -> kit, no case -> refund
 *   lib/kit/noticeLink.js, pages/api/kit/notice.js, pages/api/cron/notice-reminder.js
 *   and the wiring through checkout, fulfilment, dispatch, receipt and the funnel.
 *
 * No network. Where a line says INJECTION, reintroducing that bug makes the
 * named assertion fail.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { presaleGaKit, gaPresaleSellability, noticeQuoteInput, QUOTE } = await import('../lib/kit/gaQuote.js');
const { processGaNotice, PRESALE_STATUS, refundEmail } = await import('../lib/kit/presale.js');
const { noticeToken, noticeUrl, checkNoticeToken } = await import('../lib/kit/noticeLink.js');
const { dispatchKit, KIT_STATUS } = await import('../lib/kit/dispatchKit.js');
const { reminderPlan, REMIND_EVERY_DAYS } = await import('../pages/api/cron/notice-reminder.js');
const { confirmationEmailTemplate } = await import('../pages/api/email-templates.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const NOW = new Date('2027-02-10T00:00:00Z');
const SUBJECT = { lat: 33.9, lon: -84.1, sqft: 2000, yearBuilt: 2000, parcelId: 'R1234 567', propertyType: 'Single Family' };
const at = (mi) => ({ lat: 33.9 + mi * 0.01449, lon: -84.1 });
const sale = (o = {}) => ({ address: `${Math.random()}`, parcelId: null, ...at(0.4), sqft: 2000, yearBuilt: 2000, price: 400000, saleDate: new Date('2026-08-01'), ...o });
const SALES = [sale({ price: 390000 }), sale({ price: 400000 }), sale({ price: 410000 })];
let calls = 0;
const deps = (o = {}) => ({ lookupSubject: async () => { calls++; return o.subject === undefined ? SUBJECT : o.subject; }, fetchSales: async () => { calls++; return SALES; }, now: NOW });
const input = ({ property = {}, ...o } = {}) => ({
  owner: { name: 'Pat Owner', street: '1 Main St', city: 'Lawrenceville', state: 'GA', zip: '30044', email: 'pat@example.com' },
  taxYear: 2027, priorValue: 480000, homestead: false, ...o,
  property: { street: '1 Main St', city: 'Lawrenceville', state: 'GA', zip: '30044', county: 'Gwinnett', ...property },
});

// ── 1. THE PRE-SALE SCREEN: A 2026 CASE BEFORE WE TAKE MONEY ────────────────
calls = 0;
t('homestead is asked before any RentCast call', (await presaleGaKit(input({ homestead: undefined }), deps())).reason === 'need_homestead_answer' && calls === 0);
t("last year's value is required", (await presaleGaKit(input({ priorValue: '' }), deps())).reason === 'need_prior_value');
const q = await presaleGaKit(input(), deps());
// INJECTION: drop the caseCheck in presaleGaKit -> FAILS (a fairly valued home would be pre-sold, then refunded).
t('2026 value above what sales support: a pre-sale case', q.decision === QUOTE.CASE && q.presale === true && q.savings.yearlySaving >= 89);
t('2026 value in line with sales: no pre-sale', (await presaleGaKit(input({ priorValue: 405000 }), deps())).reason === 'not_over_assessed');
// INJECTION: drop the 40% check -> FAILS (the customer is told "no case" for typing the assessed value).
t('a value near 40% of what sales support is questioned, not refused', (await presaleGaKit(input({ priorValue: 160000 }), deps())).reason === 'prior_value_looks_assessed');
t('...and once confirmed as the 100% value, it is judged on it', (await presaleGaKit(input({ priorValue: 160000, priorValueConfirmed: true }), deps())).reason === 'not_over_assessed');
t('a Fulton homestead (capped county and schools): the bill check refuses the pre-sale', (await presaleGaKit(input({ property: { county: 'Fulton' }, homestead: true }), deps())).reason === 'bill_wont_drop_enough');
t('too few recorded sales: no pre-sale', (await presaleGaKit(input(), { ...deps(), fetchSales: async () => SALES.slice(0, 2) })).reason === 'too_few_comps');
t('the pre-sale order carries no notice value (nothing can be built from it)', q.kitOrder && q.kitOrder.presale === true && q.kitOrder.noticeValue === undefined && q.kitOrder.requestedValue === undefined);
t('it carries what the notice step needs to re-run', q.kitOrder.quoteInput.property.county === 'Gwinnett' && q.kitOrder.quoteInput.homestead === false && q.kitOrder.prior.value === 480000);

// ── 2. THE PRE-SALE GATE ────────────────────────────────────────────────────
// INJECTION: skip the address check in gaPresaleSellability -> FAILS.
t('a county with an unconfirmed address is not sold a reservation', q.sellable === false && q.notSellableReason === 'address_not_confirmed');
t('a county whose form is unsettled (Clayton) is not sold a reservation', gaPresaleSellability({ ...q.kitOrder, property: { ...q.kitOrder.property, county: 'Clayton' } }, { now: NOW }).reason === 'county_form_unconfirmed');
t('a full order is not mistaken for a reservation', gaPresaleSellability({ ...q.kitOrder, presale: false }).reason === 'not_a_presale');
t('an incomplete owner address is refused before payment', gaPresaleSellability({ ...q.kitOrder, owner: { ...q.kitOrder.owner, zip: '' } }, { now: NOW }).reason === 'owner_incomplete');
const ni = noticeQuoteInput(q.kitOrder, { noticeValue: 470000, noticeDate: '2027-05-01', fultonBilling100: false });
t('the notice step re-runs on the reservation plus the notice', ni.noticeValue === 470000 && ni.noticeDate === '2027-05-01' && ni.property.county === 'Gwinnett' && ni.homestead === false && ni.fultonBilling100 === false && ni.owner.email === 'pat@example.com');

// ── 3. THE NOTICE ARRIVES ───────────────────────────────────────────────────
const ROW = { id: 'ord_p1', state_code: 'GA', payment_status: 'paid', dispute_status: 'awaiting_notice', customer_name: 'Pat Owner', customer_email: 'pat@example.com', kit_order: q.kitOrder, stripe_session_id: 'cs_1' };
function harness({ quote, claimOk = true, refundThrows = false } = {}) {
  const h = { updates: [], refunds: 0, dispatched: [], emails: [], alerts: [] };
  h.deps = {
    quoteDeps: deps(), now: NOW,
    ...(quote ? { quote: async () => quote } : {}),
    claim: async () => claimOk,
    update: async (patch) => { h.updates.push(patch); return { error: null }; },
    refund: async () => { h.refunds++; if (refundThrows) throw new Error('stripe down'); return { id: 're_1' }; },
    dispatch: async (row) => { h.dispatched.push(row); return { status: KIT_STATUS.MAILED }; },
    sendEmail: async (m) => { h.emails.push(m); },
    alertOps: async (s) => { h.alerts.push(s); },
  };
  return h;
}
const NOTICE = { noticeValue: 470000, noticeDate: '2027-05-01' };
const CASE_Q = { decision: QUOTE.CASE, sellable: true, noticeValue: 470000, savings: { yearlySaving: 700 }, kitOrder: { state: 'GA', taxYear: 2027, noticeValue: 470000, requestedValue: 400000, property: q.kitOrder.property, owner: q.kitOrder.owner } };

let h = harness({ quote: CASE_Q });
let r = await processGaNotice(ROW, NOTICE, h.deps);
t('a case on the notice: the real order replaces the reservation and the kit is mailed', r.status === KIT_STATUS.MAILED && h.dispatched.length === 1 && h.dispatched[0].kit_order.noticeValue === 470000 && !h.dispatched[0].kit_order.presale && h.refunds === 0);
t('...and the order remembers it began as a pre-sale', h.updates.some((u) => u.dispute_status === KIT_STATUS.QUEUED && u.kit_order.fromPresale?.prior?.value === 480000));

// The real quote on a notice value sales do not support: a real no-case, a real refund.
h = harness();
r = await processGaNotice(ROW, { noticeValue: 405000, noticeDate: '2027-05-01' }, h.deps);
// INJECTION: skip the refund call on no_case -> FAILS (the guarantee is broken).
t('no case on the notice: refunded in full, once, and told why', r.status === PRESALE_STATUS.REFUNDED && h.refunds === 1 && h.dispatched.length === 0 && h.emails.length === 1 && /refunded your payment in full/.test(h.emails[0].text));
t('the row records the refund and why', h.updates.some((u) => u.dispute_status === PRESALE_STATUS.REFUNDED && u.payment_status === 'refunded' && u.kit_order.noticeResult.reason === 'not_over_assessed' && u.kit_order.noticeResult.refundId === 're_1'));

h = harness({ quote: { decision: QUOTE.NO_CASE, reason: 'bill_wont_drop_enough' }, refundThrows: true });
r = await processGaNotice(ROW, NOTICE, h.deps);
t('a refund that fails goes to a person, never silently', r.status === KIT_STATUS.NEEDS_REVIEW && h.alerts.length === 1 && h.dispatched.length === 0);

h = harness({ quote: { ...CASE_Q, sellable: false, notSellableReason: 'address_not_confirmed' } });
r = await processGaNotice(ROW, NOTICE, h.deps);
t('a case in a county that stopped being sellable goes to a person', r.status === KIT_STATUS.NEEDS_REVIEW && h.alerts.length === 1 && h.dispatched.length === 0 && h.refunds === 0);

h = harness({ quote: { decision: QUOTE.NEED_INFO, reason: 'need_fultonBilling100' } });
r = await processGaNotice(ROW, NOTICE, h.deps);
t("a county question still to answer: back to waiting, and it's asked", r.needs === 'need_fultonBilling100' && h.updates.at(-1).dispute_status === KIT_STATUS.AWAITING_NOTICE && h.refunds === 0);

h = harness({ quote: CASE_Q, claimOk: false });
r = await processGaNotice(ROW, NOTICE, h.deps);
// INJECTION: drop the claim -> FAILS (a double submit could refund twice or mail twice).
t('a second submit while the first is running does nothing', r.reason === 'in_progress' && h.dispatched.length === 0 && h.refunds === 0 && h.updates.length === 0);
h = harness({ quote: CASE_Q });
t('an order already finished is not processed again', (await processGaNotice({ ...ROW, dispute_status: 'kit_mailed' }, NOTICE, h.deps)).reason === 'already_done' && h.dispatched.length === 0);
t('a refunded order is never processed', (await processGaNotice({ ...ROW, payment_status: 'refunded' }, NOTICE, h.deps)).reason === 'not_paid');
h = harness();
h.deps.quote = async () => { throw new Error('rentcast down'); };
r = await processGaNotice(ROW, NOTICE, h.deps);
t('trouble reaching the data: released to waiting, they can try again', r.retry === true && h.updates.at(-1).dispute_status === KIT_STATUS.AWAITING_NOTICE && h.refunds === 0);
t('the refund email names the reason in plain words', /not enough recent sales/.test(refundEmail(ROW, 'too_few_comps').text));

// ── 4. THE PRIVATE LINK ─────────────────────────────────────────────────────
const SECRET = 'test-secret';
const tok = noticeToken('ord_p1', SECRET);
t('the notice link checks out for its own order', checkNoticeToken('ord_p1', tok, SECRET));
t('...and not for another order, or a tampered token', !checkNoticeToken('ord_p2', tok, SECRET) && !checkNoticeToken('ord_p1', `${tok.slice(0, -1)}0`, SECRET) && !checkNoticeToken('ord_p1', undefined, SECRET));
t('no secret configured: no link at all, rather than an unsigned one', noticeToken('ord_p1', '') === null && noticeUrl('ord_p1', '') === null);
const api = read('pages/api/kit/notice.js');
// INJECTION: read the order before checking the token -> FAILS.
t('the notice route checks the link before it reads anything', api.indexOf('checkNoticeToken(orderId, b.t)') > 0 && api.indexOf('checkNoticeToken(orderId, b.t)') < api.indexOf(".from('orders')"));
t('the notice route refunds idempotently, per order', /idempotencyKey: `presale-refund-\$\{o\.id\}`/.test(api));
t('the notice route claims the row with a conditional update', /\.eq\('dispute_status', from\)/.test(api));

// ── 5. WIRING ───────────────────────────────────────────────────────────────
const checkout = read('pages/api/checkout.js');
t('checkout runs the pre-sale gate on a stored reservation, the full gate otherwise', /GA: \(o\) => \(o\?\.presale === true \? gaPresaleSellability\(o\) : gaSellability\(o\)\)/.test(checkout));
t('the reservation line item promises the refund and never says we file', /Georgia appeal kit, reserved/.test(checkout) && /we refund you in full before anything is mailed/.test(checkout) && /we do not file your appeal or represent you/.test(checkout));
const fulfil = read('lib/fulfillOrder.js');
// INJECTION: queue a pre-sale as kit_queued -> FAILS (dispatch would try to build a kit with no value).
t('a paid reservation waits as awaiting_notice and is not dispatched', /kitOrder && kitOrder\.presale !== true \? KIT_STATUS\.QUEUED : KIT_STATUS\.AWAITING_NOTICE/.test(fulfil) && /if \(isKit && kitOrder && kitOrder\.presale !== true\) \{/.test(fulfil));
t('its receipt carries the notice link, and only its receipt does', /noticeUrl: disputeStatus === KIT_STATUS\.AWAITING_NOTICE \? noticeUrl\(order\.id\) : null/.test(fulfil));
const fakeDb = { from() { const q2 = { update() { return q2; }, eq() { return Promise.resolve({ error: null }); } }; return q2; } };
r = await dispatchKit({ id: 'ord_p1', state_code: 'GA', payment_status: 'paid', dispute_status: 'awaiting_notice', kit_order: q.kitOrder, owner_street: '1 Main St', owner_city: 'Lawrenceville', owner_state: 'GA', owner_zip: '30044', customer_name: 'Pat Owner' }, { supabase: fakeDb, lobFetch: async () => { throw new Error('Lob must not be called'); } });
t('dispatch never builds a kit from a reservation', r.status === KIT_STATUS.AWAITING_NOTICE);
const rec = confirmationEmailTemplate({ firstName: 'Pat', lastName: 'Owner', address: '1 Main St', county: 'Gwinnett', stateCode: 'GA', orderStatus: 'awaiting_notice', noticeUrl: 'https://x/kit/notice?o=1&t=abc' });
const queued = confirmationEmailTemplate({ firstName: 'Pat', lastName: 'Owner', address: '1 Main St', county: 'Gwinnett', stateCode: 'GA', orderStatus: 'kit_queued', noticeUrl: 'https://x/kit/notice?o=1&t=abc' });
t('the reservation receipt has the "enter my notice" button', /Enter my notice when it arrives/.test(rec) && /kit\/notice\?o=1&amp;t=abc|kit\/notice\?o=1&t=abc/.test(rec));
t('a mailed-kit receipt never carries the notice link', !/kit\/notice/.test(queued));
t('send-email forwards the link rather than dropping it', /noticeUrl \}\);/.test(read('pages/api/send-email.js')));

// ── 6. REMINDERS ────────────────────────────────────────────────────────────
const res = { dispute_status: 'awaiting_notice', payment_status: 'paid', kit_order: { presale: true } };
const open = { isOpen: true, daysUntilClose: 40 };
t('no reminder before the county season opens', !reminderPlan(res, { isOpen: false }, NOW).remind);
t('a reminder once the season is open', reminderPlan(res, open, NOW).remind);
t(`no more than one a week (${REMIND_EVERY_DAYS} days)`, !reminderPlan({ ...res, kit_order: { presale: true, noticeRemindedAt: new Date(NOW - 3 * 86400000).toISOString() } }, open, NOW).remind
  && reminderPlan({ ...res, kit_order: { presale: true, noticeRemindedAt: new Date(NOW - 8 * 86400000).toISOString() } }, open, NOW).remind);
t('ten days before the county closes with no notice: ops paged, once', reminderPlan(res, { isOpen: true, daysUntilClose: 9 }, NOW).alert && !reminderPlan({ ...res, kit_order: { presale: true, noticeLateAlertAt: 'x' } }, { isOpen: true, daysUntilClose: 9 }, NOW).alert);
t('a finished or refunded order gets nothing', !reminderPlan({ ...res, dispute_status: 'kit_mailed' }, open, NOW).remind && !reminderPlan({ ...res, payment_status: 'refunded' }, open, NOW).remind);
const cron = read('pages/api/cron/notice-reminder.js');
t('the reminder cron is scheduled', JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/cron/notice-reminder'));
// INJECTION: drop the status condition on the cron's write -> FAILS (it could write a reservation back over a finished order).
t("the cron's write cannot overwrite a finished order", /\.update\(\{ kit_order: k \}\)\.eq\('id', row\.id\)\.eq\('dispute_status', KIT_STATUS\.AWAITING_NOTICE\)/.test(cron));

// ── 7. THE FUNNEL AND THE PAGE AFTER PAYMENT ────────────────────────────────
const step = read('components/GaKitStep.js');
t('the funnel asks whether the notice has arrived, and pre-sells on last year\'s value', /Has your \{taxYear\} Notice of Assessment arrived\?/.test(step) && /presale: true, priorValue/.test(step));
t('no reservation without the acknowledgment, which states the refund', /Reserve my appeal kit/.test(step) && /If my notice no longer shows a case, I am refunded in full/.test(step));
t('the 40% question offers a one-tap confirmation', /prior_value_looks_assessed/.test(step) && /is the 100% value/.test(step));
t('the order records the value asked for, as everywhere else', /targetReduction: quote\.requestedValue/.test(step));
const vp = read('pages/api/verify-payment.js');
const succ = read('pages/success.js');
t('the page after payment says "reserved", not "on its way", for a pre-sale', /kitPresale: isKit && meta\.kitPresale === 'true'/.test(vp) && /Your \$\{word\} kit is reserved/.test(succ));

console.log(`verify-ga-presale: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
