/**
 * OFFLINE VERIFICATION for Florida reservations (18 Oct 2026):
 *   lib/kit/flPresale.js   season year, table deadline, the reservation quote and gate,
 *                          processFlPresale (roll step, deadline step), flRollPlan
 *   pages/api/kit/trim.js + pages/kit/trim.js   the deadline page
 *   and the wiring through the quote route, checkout, fulfilment, receipt, /success,
 *   the daily cron and the funnel step.
 *
 * No network. Where a line says INJECTION, reintroducing that bug makes the
 * named assertion fail.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const P = await import('../lib/kit/flPresale.js');
const { flPresaleSeasonYear, flTableDeadline, quoteFlPresale, flPresaleSellability, processFlPresale, flRollPlan, flRefundEmail, flTrimAskEmail, FL_ASK } = P;
const { FL_QUOTE } = await import('../lib/kit/flQuote.js');
const { PRESALE_STATUS } = await import('../lib/kit/presale.js');
const { KIT_STATUS } = await import('../lib/kit/dispatchKit.js');
const { trimUrl, checkNoticeToken } = await import('../lib/kit/noticeLink.js');
const { flParcelRow, flComps } = await import('./kit/fl-fixture.mjs');
const { confirmationEmailTemplate, confirmationSubject } = await import('../pages/api/email-templates.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const D = (s) => new Date(`${s}T15:00:00Z`);

// ── 1. WHICH SEASON ─────────────────────────────────────────────────────────
// Hillsborough mails TRIM 13 Aug in our table; an owner has it ten days later.
t('February: a reservation is for this year', flPresaleSeasonYear('Hillsborough', D('2027-02-10')) === 2027);
// INJECTION: drop TRIM_ARRIVED_DAYS (cut-off = the TRIM mailing date) -> FAILS.
t('the week TRIM notices go out: still this year', flPresaleSeasonYear('Hillsborough', D('2026-08-20')) === 2026);
t('once the owner has their notice, a reservation is for next year', flPresaleSeasonYear('Hillsborough', D('2026-08-24')) === 2027 && flPresaleSeasonYear('Hillsborough', D('2026-11-02')) === 2027);
t('a county with no date uses the statewide fallback (8 Aug + 10 days)', flPresaleSeasonYear('Nowhere', D('2026-08-17')) === 2026 && flPresaleSeasonYear('Nowhere', D('2026-08-19')) === 2027);
t("our table's deadline is used only for the table's own year", flTableDeadline('Hillsborough', 2026) === '2026-09-07' && flTableDeadline('Hillsborough', 2027) === null && flTableDeadline('Nowhere', 2026) === null);

// ── 2. THE RESERVATION QUOTE ────────────────────────────────────────────────
const OWNER = { name: 'Jordan Rivera', street: '1234 Sample Oak Dr', city: 'Tampa', state: 'FL', zip: '33614', email: 'jordan@example.com' };
const INPUT = { property: { street: '1234 Sample Oak Dr', city: 'Tampa', zip: '33614' }, owner: OWNER, taxYear: 2027, issues: [], costOverrides: {}, willNotAttend: false };
const qdeps = (over = {}) => ({
  findParcel: async () => flParcelRow({ asmnt_yr: 2026 }),
  findComps: async (row, { rollYear }) => ({ ...flComps(), comps: flComps().list, rollYearSeen: rollYear }),
  millageForCounty: () => ({ school: 5.4, nonSchool: 13.1 }),
  countyName: () => 'Hillsborough',
  totalCostToCure: () => ({ total: 0, priced: [] }),
  now: D('2027-02-10'),
  ...over,
});
let q = await quoteFlPresale(INPUT, qdeps());
// INJECTION: pass taxYear (2027) instead of screenYear into flCaseFromRow -> FAILS (roll_not_this_year).
t('in February the case is screened on the roll we hold, for this season', q.presale === true && q.decision === FL_QUOTE.CASE && q.taxYear === 2027 && q.screenYear === 2026 && q.sellable === true);
t('the stored reservation is not a buildable kit and has no deadline', q.kitOrder?.presale === true && q.kitOrder.trimDeadline === null && !q.kitOrder.parcel && !q.kitOrder.comps && q.kitOrder.prior.decision === FL_QUOTE.CASE && q.kitOrder.property.coNo === 39);
q = await quoteFlPresale(INPUT, qdeps({ findComps: async () => ({ ...flComps(), supportsReduction: false, comps: flComps().list }) }));
t('no case on the latest values: no reservation is offered', q.decision === FL_QUOTE.NO_CASE && q.sellable === false && !q.kitOrder);
q = await quoteFlPresale(INPUT, qdeps({ findParcel: async () => flParcelRow({ asmnt_yr: 2025 }) }));
t('a roll two years old is never screened for a reservation', q.reason === 'roll_out_of_date' && q.sellable === false);
q = await quoteFlPresale(INPUT, qdeps({ now: D('2026-09-01') }));
// INJECTION: drop the trim_already_out check -> FAILS (a 2027 reservation sold in September 2026).
t('after the notices are out no reservation is sold for next year', q.reason === 'trim_already_out' && q.sellable === false && !q.kitOrder);
q = await quoteFlPresale(INPUT, qdeps({ findParcel: async () => ({ lookupFailed: true }) })).catch((e) => e);
t('a lookup failure is an error, not "no case"', q instanceof Error && q.upstream === true);

const good = (await quoteFlPresale(INPUT, qdeps())).kitOrder;
const NOW = D('2027-02-10');
t('the gate passes the stored reservation', flPresaleSellability(good, { now: NOW }).ok === true);
// INJECTION: drop flOrderProblems from flPresaleSellability -> FAILS.
t('a county without a confirmed VAB address is not sold a reservation', flPresaleSellability({ ...good, property: { ...good.property, county: 'Nowhere' } }, { now: NOW }).reason === 'address_not_confirmed');
t('an incomplete owner address is refused before payment', flPresaleSellability({ ...good, owner: { ...good.owner, zip: '' } }, { now: NOW }).reason === 'owner_incomplete');
t('a screen without a case is refused as no-case', flPresaleSellability({ ...good, prior: { decision: 'no_case' } }, { now: NOW }).noCase === true);
t('a reservation two seasons ahead is not one', flPresaleSellability({ ...good, screenYear: 2025 }, { now: NOW }).reason === 'not_a_presale');
// INJECTION: drop the season check -> FAILS (a 2027 reservation sold after 2027's notices are out).
t('a reservation whose season has moved on is refused at checkout', flPresaleSellability(good, { now: D('2027-09-01') }).reason === 'season_moved');

// ── 3. FINISHING ────────────────────────────────────────────────────────────
const ROW = { id: 'ord_f1', state_code: 'FL', payment_status: 'paid', dispute_status: 'awaiting_notice', customer_name: 'Jordan Rivera', customer_email: 'jordan@example.com', stripe_session_id: 'cs_f1', kit_order: good };
function harness({ loaded = true, parcel = flParcelRow({ asmnt_yr: 2027 }), comps = flComps(), claimOk = true, refundThrows = false, now = D('2027-07-20') } = {}) {
  const h = { updates: [], refunds: 0, dispatched: [], emails: [], alerts: [], compsYear: null };
  h.deps = {
    rollLoaded: async (coNo, year) => loaded && coNo === 39 && year === 2027,
    loadParcel: async (coNo, id, year) => (coNo === 39 && id === 'A1234567890' && year === 2027 ? parcel : null),
    caseDeps: {
      findComps: async (row, { rollYear }) => { h.compsYear = rollYear; return { ...comps, comps: comps.list }; },
      millageForCounty: () => ({ school: 5.4, nonSchool: 13.1 }), countyName: () => 'Hillsborough', totalCostToCure: () => ({ total: 0, priced: [] }),
    },
    claim: async () => claimOk,
    update: async (p) => { h.updates.push(p); return { error: null }; },
    refund: async () => { h.refunds++; if (refundThrows) throw new Error('stripe down'); return { id: 're_f1' }; },
    dispatch: async (row) => { h.dispatched.push(row); return { status: KIT_STATUS.MAILED }; },
    sendEmail: async (m) => { h.emails.push(m); },
    alertOps: async (s) => { h.alerts.push(s); },
    now,
  };
  h.last = () => h.updates[h.updates.length - 1];
  return h;
}

let h = harness({ loaded: false, now: D('2027-03-01') });
let r = await processFlPresale(ROW, h.deps);
t('roll not loaded: released, nothing refunded or sent', r.status === KIT_STATUS.AWAITING_NOTICE && r.reason === 'roll_not_loaded' && h.refunds === 0 && h.dispatched.length === 0 && h.last().dispute_status === KIT_STATUS.AWAITING_NOTICE);

h = harness();
r = await processFlPresale(ROW, h.deps);
const confirmedK = h.last().kit_order;
// INJECTION: rebuild on screenYear -> FAILS (the kit would print last year's values).
t("roll loaded in July: the case is rebuilt on THIS year's roll and kept", r.status === KIT_STATUS.AWAITING_NOTICE && r.confirmed === true && r.reason === 'need_deadline' && confirmedK.rollResult.decision === FL_QUOTE.CASE && confirmedK.built.parcel.asmnt_yr === 2027 && h.compsYear === 2027 && confirmedK.built.taxYear === 2027);
t('...and nothing is sent without a deadline', h.dispatched.length === 0 && h.refunds === 0);

const CONFIRMED = { ...ROW, kit_order: confirmedK };
h = harness({ now: D('2027-08-16') });
r = await processFlPresale(CONFIRMED, { ...h.deps, trimDeadline: '2027-09-07' });
t('the deadline arrives three weeks out: the kit is mailed', r.status === KIT_STATUS.MAILED && r.delivery === 'mail' && h.dispatched.length === 1);
const sent = h.dispatched[0]?.kit_order || {};
t('...built on this year, with the deadline, remembering the reservation', sent.taxYear === 2027 && sent.parcel.asmnt_yr === 2027 && sent.trimDeadline === '2027-09-07' && !sent.presale && sent.fromPresale?.screenYear === 2026 && sent.fromPresale?.deadlineSource === 'customer');

h = harness({ now: D('2027-09-02') });
r = await processFlPresale(CONFIRMED, { ...h.deps, trimDeadline: '2027-09-07' });
t('five days out: the kit is emailed, not mailed', r.delivery === 'pdf' && h.dispatched.length === 1);
h = harness({ now: D('2027-09-05') });
r = await processFlPresale(CONFIRMED, { ...h.deps, trimDeadline: '2027-09-07' });
// INJECTION: dispatch whatever flSellability says -> FAILS.
t('two days out: a person decides, nothing sent, ops paged', r.status === KIT_STATUS.NEEDS_REVIEW && r.reason === 'deadline_too_close' && h.dispatched.length === 0 && h.alerts.length === 1);

h = harness({ now: D('2027-08-16') });
r = await processFlPresale(CONFIRMED, { ...h.deps, trimDeadline: '2027-03-01' });
t('a date that is not a petition deadline is refused and not stored', r.reason === 'bad_deadline' && !h.last().kit_order.trimDeadline && h.dispatched.length === 0);

h = harness({ loaded: false, now: D('2027-06-01') });
r = await processFlPresale(ROW, { ...h.deps, trimDeadline: '2027-09-07' });
const early = h.last().kit_order;
t('a deadline entered before the roll is kept for later', r.status === KIT_STATUS.AWAITING_NOTICE && early.trimDeadline === '2027-09-07' && h.dispatched.length === 0);
h = harness({ now: D('2027-07-20') });
r = await processFlPresale({ ...ROW, kit_order: early }, h.deps);
t('...and the day the roll loads the kit goes in one step', r.status === KIT_STATUS.MAILED && h.dispatched[0].kit_order.trimDeadline === '2027-09-07');

h = harness({ comps: flComps({ supportsReduction: false }) });
r = await processFlPresale(ROW, h.deps);
t("no case on this year's values: refunded in full, and told why", r.status === PRESALE_STATUS.REFUNDED && h.refunds === 1 && h.last().payment_status === 'refunded' && h.emails.length === 1 && /refunded your payment in full/.test(h.emails[0].text) && h.dispatched.length === 0);
h = harness({ comps: flComps({ supportsReduction: false }), refundThrows: true });
r = await processFlPresale(ROW, h.deps);
t('a failed refund goes to a person, never silently', r.status === KIT_STATUS.NEEDS_REVIEW && r.reason === 'refund_failed' && h.alerts.length === 1);
h = harness({ parcel: null });
r = await processFlPresale(ROW, h.deps);
t('a parcel gone from the new roll goes to a person', r.status === KIT_STATUS.NEEDS_REVIEW && r.reason === 'parcel_not_on_roll' && h.refunds === 0);
h = harness({ claimOk: false });
r = await processFlPresale(ROW, h.deps);
t('a row another run holds is left alone', r.reason === 'in_progress' && h.updates.length === 0);
t('a finished order is not processed again', (await processFlPresale({ ...ROW, dispute_status: 'kit_mailed' }, harness().deps)).reason === 'already_done');

// A reservation on the season's own roll (July, before TRIM) with a dated county.
const k26 = { ...good, taxYear: 2026, screenYear: 2026 };
const h26 = harness({ now: D('2026-08-01') });
h26.deps.rollLoaded = async () => true;
h26.deps.loadParcel = async () => flParcelRow({ asmnt_yr: 2026 });
r = await processFlPresale({ ...ROW, kit_order: k26 }, h26.deps);
// INJECTION: ignore flTableDeadline -> FAILS (the customer would be asked for a date we already hold).
t("a county in our table needs no date from the customer", r.status === KIT_STATUS.MAILED && h26.dispatched[0].kit_order.trimDeadline === '2026-09-07' && h26.dispatched[0].kit_order.fromPresale.deadlineSource === 'county_table');

// ── 4. THE DAILY PLAN ───────────────────────────────────────────────────────
t('roll not loaded in spring: wait', JSON.stringify(flRollPlan(ROW, false, D('2027-03-01'))) === JSON.stringify({ process: false, ask: false, alert: null }));
t('roll still missing on 1 August: ops paged, once', flRollPlan(ROW, false, D('2027-08-02')).alert === 'roll' && flRollPlan({ ...ROW, kit_order: { ...good, rollLateAlertAt: 'x' } }, false, D('2027-08-02')).alert === null);
t('roll loaded: process', flRollPlan(ROW, true, D('2027-07-20')).process === true);
t('confirmed, before TRIM notices: no ask yet', flRollPlan(CONFIRMED, true, D('2027-07-25')).ask === false);
t('confirmed, from 10 August: ask for the deadline', flRollPlan(CONFIRMED, true, D('2027-08-11')).ask === true);
const asked = (at, n = 1) => ({ ...CONFIRMED, kit_order: { ...confirmedK, trimAskedAt: D(at).toISOString(), trimAsks: n } });
t('...weekly, and at most six times', flRollPlan(asked('2027-08-11'), true, D('2027-08-14')).ask === false && flRollPlan(asked('2027-08-11'), true, D('2027-08-19')).ask === true && flRollPlan(asked('2027-08-11', FL_ASK.max), true, D('2027-08-30')).ask === false);
t('no deadline by 5 September: ops paged, once', flRollPlan(CONFIRMED, true, D('2027-09-06')).alert === 'deadline' && flRollPlan({ ...CONFIRMED, kit_order: { ...confirmedK, trimLateAlertAt: 'x' } }, true, D('2027-09-06')).alert === null);
t('confirmed with a deadline: process', flRollPlan({ ...CONFIRMED, kit_order: { ...confirmedK, trimDeadline: '2027-09-07' } }, true, D('2027-08-16')).process === true);
t('other states and finished orders are skipped', !flRollPlan({ ...ROW, state_code: 'GA' }, true, NOW).process && !flRollPlan({ ...ROW, dispute_status: 'kit_mailed' }, true, NOW).process);

// ── 5. EMAILS AND LINKS ─────────────────────────────────────────────────────
const link = trimUrl('ord_f1', 'sekret');
t('the deadline link is the order HMAC, on its own page', /\/kit\/trim\?o=ord_f1&t=[0-9a-f]{40}$/.test(link) && checkNoticeToken('ord_f1', new URL(link).searchParams.get('t'), 'sekret') && !checkNoticeToken('ord_f2', new URL(link).searchParams.get('t'), 'sekret'));
const ask = flTrimAskEmail(ROW, link);
t('the ask carries the link and says receipt, not postmark', ask.text.includes(link) && /receives it, not the postmark/.test(ask.text));
const refund = flRefundEmail(ROW, 'capped_beyond_reach');
t('the refund email explains the reason and never says we file', /Save Our Homes cap/.test(refund.text) && !/we (will )?file/i.test(refund.text));
const rec = confirmationEmailTemplate({ firstName: 'Jordan', lastName: 'Rivera', address: '1 A St', county: 'Hillsborough', stateCode: 'FL', orderStatus: 'awaiting_notice', noticeUrl: link });
t('the Florida reservation receipt has the deadline button and the refund promise', rec.includes(link.replace('&', '&amp;')) && /Enter my petition deadline/.test(rec) && /refund you in full before anything is mailed/.test(rec) && !/has been filed/i.test(rec));
t('...under its own subject', /petition kit is reserved/.test(confirmationSubject({ stateCode: 'FL', orderStatus: 'awaiting_notice' })));

// ── 6. WIRING ───────────────────────────────────────────────────────────────
const route = read('pages/api/fl-kit-quote.js');
t('the quote route offers a reservation only when asked, through the same store', /presale: b\.presale === true/.test(route) && /input\.presale \? await quoteFlPresale\(input, deps\) : await quoteFlKit\(input, deps\)/.test(route));
const checkout = read('pages/api/checkout.js');
t('checkout runs the reservation gate on the STORED Florida order', /FL: \(o\) => \(o\?\.presale === true \? flPresaleSellability\(o\) : flSellability\(o\)\)/.test(checkout));
t('the reservation line item promises the refund, the owner pays the county fee, and never says we file', /Florida petition kit, reserved/.test(checkout) && /we refund you in full before anything is mailed\. The county's filing fee is paid by you to the county/.test(checkout) && /we do not file your petition or represent you/.test(checkout));
t('a Florida reservation receipt gets the deadline link', /stateCode === 'FL' \? trimUrl\(order\.id\)/.test(read('lib/fulfillOrder.js')));
t('the page after payment explains the Florida reservation', /presale && isFL/.test(read('pages/success.js')) && /petition deadline/.test(read('pages/success.js')));
const cron = read('pages/api/cron/notice-reminder.js');
t('the daily cron runs the Florida pass with the shared side effects', /const fl = await flRollPass\(supabase, resend, now\)/.test(cron) && /flPresaleRunDeps\(row, \{ supabase, alertOps, rollLoaded \}\)/.test(cron));
t("the pass's own write cannot overwrite a finished order", /update\(\{ kit_order: kk \}\)\.eq\('id', current\.id\)\.eq\('dispute_status', KIT_STATUS\.AWAITING_NOTICE\)/.test(cron));
const run = read('lib/kit/flPresaleRun.js');
t('the real deps read this year\'s roll by county, parcel and year, and refuse a duplicate', /\.eq\('co_no', Number\(coNo\)\)\.eq\('parcel_id', String\(parcelId\)\)\.eq\('asmnt_yr', Number\(year\)\)/.test(run) && /data\.length === 1 \? data\[0\] : null/.test(run) && /\.\.\.presaleDeps\(row/.test(run));
const trimApi = read('pages/api/kit/trim.js');
t('the deadline route checks the link, is Florida-only and rate limited', /checkNoticeToken\(orderId, b\.t\)/.test(trimApi) && /row\.state_code !== 'FL' \|\| row\.kit_order\?\.presale !== true/.test(trimApi) && /enforceRateLimit\(req, res, 'kit-trim'/.test(trimApi));
t('...and finishes through processFlPresale with the entered date', /processFlPresale\(row, \{ \.\.\.flPresaleRunDeps\(row, \{ supabase, alertOps \}\), trimDeadline \}\)/.test(trimApi));
const page = read('pages/kit/trim.js');
t('the deadline page offers the TRIM photo and is not indexed', /<NoticePhoto state="FL"/.test(page) && /noindex/.test(page));
const ui = read('components/FlKitStep.js');
t('the funnel offers a reservation without a deadline, and after "values not out yet"', /presale: true/.test(ui) && /I don&rsquo;t have this year&rsquo;s TRIM notice yet/.test(ui) && /quote\.reason === 'roll_not_this_year' && !quote\.presale/.test(ui) && /Reserve my petition kit/.test(ui));
const resBox = ui.slice(ui.indexOf('quote.presale && quote.decision === \'case\' && quote.sellable'), ui.indexOf("quote && quote.decision === 'case' && !quote.sellable"));
t('...with the refund promise and the owner-pays-fee line, and no free-kit field (a reservation is never free yet)', /we refund you in full/.test(resBox) && /is paid by you/.test(resBox) && !/FreeKitField/.test(resBox));

console.log(`verify-fl-presale: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
