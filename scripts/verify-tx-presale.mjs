/**
 * OFFLINE VERIFICATION for Texas pre-sales (16 Oct 2026):
 *   lib/kit/txPresale.js   txPresaleOrder, txPresaleSellability, processTxPresale
 *   pages/api/generate-50132.js  screens on last year's roll, issues a reservation
 *   pages/api/cron/notice-reminder.js  the roll pass (txRollPlan)
 *   and the wiring through checkout, fulfilment, receipt, the review screen and /success.
 *
 * No network. Where a line says INJECTION, reintroducing that bug makes the
 * named assertion fail.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { txPresaleOrder, txPresaleSellability, processTxPresale, txRefundEmail } = await import('../lib/kit/txPresale.js');
const { TX_QUOTE } = await import('../lib/kit/txQuote.js');
const { PRESALE_STATUS } = await import('../lib/kit/presale.js');
const { KIT_STATUS } = await import('../lib/kit/dispatchKit.js');
const { buildProtest } = await import('../lib/tx/protest.js');
const { txPacket, TX_SUBJECT, TX_COMPS, TX_OWNER } = await import('./kit/tx-fixture.mjs');
const { txRollPlan } = await import('../pages/api/cron/notice-reminder.js');
const { confirmationEmailTemplate, confirmationSubject } = await import('../pages/api/email-templates.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = new Date('2027-02-10T00:00:00Z');

// ── 1. THE RESERVATION ──────────────────────────────────────────────────────
const SCREEN = txPacket({}, 2026); // last year's roll
const order = (patch = {}) => ({
  ...txPresaleOrder({ packet: SCREEN, taxYear: 2027, screenYear: 2026, cadId: 101, accountNumber: 'H0000001', county: 'Harris', owner: TX_OWNER, protestOwner: { firstName: 'Jane', lastName: 'Doe' } }),
  ...patch,
});
const o = order();
t('a reservation records the screen, not a buildable kit', o.presale === true && o.taxYear === 2027 && o.screenYear === 2026 && o.prior.decision === TX_QUOTE.CASE && !o.packet);
// INJECTION: drop the address check in txPresaleSellability -> FAILS.
t('a district with an unconfirmed address is not sold a reservation', txPresaleSellability(order({ cadId: 243, property: { ...o.property, county: 'Wichita' } }), { now: NOW }).reason === 'address_not_confirmed');
t('a district with a confirmed address is sold a reservation', txPresaleSellability(o, { now: NOW }).ok === true);
t('a screen with a caution is not sold a reservation', txPresaleSellability(txPresaleOrder({ packet: { ...SCREEN, cautions: [{ code: 'saving_below_fee' }] }, taxYear: 2027, screenYear: 2026, cadId: 71, accountNumber: 'E0000001', county: 'El Paso', owner: TX_OWNER }), { now: NOW }).noCase === true);
t('an incomplete owner address is refused before payment', txPresaleSellability(order({ owner: { ...TX_OWNER, zip: '' } }), { now: NOW }).reason === 'owner_incomplete');
t('a "reservation" for the roll we already hold is not one', txPresaleSellability(order({ screenYear: 2027 }), { now: NOW }).reason === 'not_a_presale');

const route = read('pages/api/generate-50132.js');
// INJECTION: query tax_year = taxYear instead of rollYear -> FAILS (Feb 2027 would find no parcel at all).
t('before the new roll loads, the route screens on the roll we hold', /taxYear: rollYear/.test(route) && /\.eq\('tax_year', rollYear\)/.test(route) && /findComps\(parcel, \{ rollYear, db \}\)/.test(route));
t('...per district: only a district with no rows for the year is a pre-sale', /const rollYearFor = async \(cad\)/.test(route) && /\? taxYear : ROLL_YEAR/.test(route));
t('a pre-sale stores the reservation and is gated by the pre-sale rules', /const stored = presale\s*\? txPresaleOrder\(/.test(route) && /presale \? txPresaleSellability\(stored\)/.test(route) && /JSON\.stringify\(stored\)/.test(route));
t('the review screen shows which year its values are from, and no form preview for a reservation', /txReview\.rollYear \|\| txReview\.taxYear/.test(read('pages/apply.js')) && /txReview\.presale\) return;/.test(read('pages/apply.js')));

// ── 2. THE NEW ROLL LOADS ───────────────────────────────────────────────────
const NEW_ROW = { ...TX_SUBJECT, tax_year: 2027 };
const ROW = { id: 'ord_t1', state_code: 'TX', payment_status: 'paid', dispute_status: 'awaiting_notice', customer_name: 'Jane Doe', customer_email: 'jane@example.com', stripe_session_id: 'cs_t1', kit_order: o };
function harness({ parcel = NEW_ROW, comps = TX_COMPS, sellOk = true, claimOk = true, refundThrows = false, build = buildProtest } = {}) {
  const h = { updates: [], refunds: 0, dispatched: [], emails: [], alerts: [] };
  h.deps = {
    loadParcel: async (cad, acct, year) => (cad === 101 && acct === 'H0000001' && year === 2027 ? parcel : null),
    findComps: async () => comps,
    buildProtest: build,
    sellability: () => (sellOk ? { ok: true } : { ok: false, reason: 'address_not_confirmed' }),
    claim: async () => claimOk,
    update: async (p) => { h.updates.push(p); return { error: null }; },
    refund: async () => { h.refunds++; if (refundThrows) throw new Error('stripe down'); return { id: 're_t1' }; },
    dispatch: async (row) => { h.dispatched.push(row); return { status: KIT_STATUS.MAILED }; },
    sendEmail: async (m) => { h.emails.push(m); },
    alertOps: async (s) => { h.alerts.push(s); },
    now: NOW,
  };
  return h;
}

let h = harness();
let r = await processTxPresale(ROW, h.deps);
// INJECTION: build on screenYear instead of taxYear -> FAILS (the kit would print last year's values).
t("a case on this year's roll: the kit is built on THIS year's roll and mailed", r.status === KIT_STATUS.MAILED && h.dispatched.length === 1 && h.dispatched[0].kit_order.packet.form50132.taxYear === 2027 && h.dispatched[0].kit_order.taxYear === 2027 && h.refunds === 0);
t('...and the order remembers it began as a reservation', h.updates.some((u) => u.dispute_status === KIT_STATUS.QUEUED && u.kit_order.fromPresale?.screenYear === 2026));

// This year the neighbours caught up: comps at the subject's own $/sqft.
const even = { ...TX_COMPS, medianAppraisedPerSqft: 150, medianMarketPerSqft: 150, indicatedAppraised: 300000, indicatedMarket: 300000 };
h = harness({ comps: even });
r = await processTxPresale(ROW, h.deps);
// INJECTION: skip the refund on no case -> FAILS.
t("no case on this year's roll: refunded in full, once, and told why", r.status === PRESALE_STATUS.REFUNDED && h.refunds === 1 && h.dispatched.length === 0 && h.emails.length === 1 && /refunded your payment in full/.test(h.emails[0].text));
t('the row records the refund', h.updates.some((u) => u.dispute_status === PRESALE_STATUS.REFUNDED && u.payment_status === 'refunded' && u.kit_order.rollResult.refundId === 're_t1'));

h = harness({ comps: even, refundThrows: true });
t('a refund that fails goes to a person', (await processTxPresale(ROW, h.deps)).status === KIT_STATUS.NEEDS_REVIEW && h.alerts.length === 1);
h = harness({ parcel: null });
t("an account that isn't on the new roll goes to a person (never a guessed account)", (await processTxPresale(ROW, h.deps)).reason === 'account_not_on_roll' && h.alerts.length === 1 && h.refunds === 0 && h.dispatched.length === 0);
h = harness({ sellOk: false });
t('a case in a district that stopped being sellable goes to a person', (await processTxPresale(ROW, h.deps)).status === KIT_STATUS.NEEDS_REVIEW && h.dispatched.length === 0 && h.refunds === 0);
h = harness({ claimOk: false });
// INJECTION: drop the claim -> FAILS.
t('a second run while the first is working does nothing', (await processTxPresale(ROW, h.deps)).reason === 'in_progress' && h.updates.length === 0 && h.refunds === 0);
h = harness();
t('a finished order is not processed again', (await processTxPresale({ ...ROW, dispute_status: 'kit_mailed' }, h.deps)).reason === 'already_done' && h.dispatched.length === 0);
h = harness({ build: () => { throw new Error('bad row'); } });
t('a rebuild that throws is released to wait, and ops told', (await processTxPresale(ROW, h.deps)).retry === true && h.updates.at(-1).dispute_status === KIT_STATUS.AWAITING_NOTICE && h.alerts.length === 1);
t('the refund email says why in plain words', /appraised at or below similar homes/.test(txRefundEmail(ROW, 'not_over_appraised').text));

// ── 3. THE DAILY PASS ───────────────────────────────────────────────────────
t('roll loaded: process', txRollPlan(ROW, true, NOW) === 'process');
t('roll not loaded in February: wait', txRollPlan(ROW, false, NOW) === 'wait');
t('roll still not loaded on 20 April: ops paged, once', txRollPlan(ROW, false, new Date('2027-04-21T00:00:00Z')) === 'late_alert'
  && txRollPlan({ ...ROW, kit_order: { ...o, rollLateAlertAt: 'x' } }, false, new Date('2027-04-21T00:00:00Z')) === 'wait');
t('a Georgia or finished order is skipped', txRollPlan({ ...ROW, state_code: 'GA' }, true, NOW) === 'skip' && txRollPlan({ ...ROW, dispute_status: 'kit_mailed' }, true, NOW) === 'skip');
const cron = read('pages/api/cron/notice-reminder.js');
t('the pass runs daily with the shared pre-sale side effects', /const tx = await txRollPass\(supabase, now\)/.test(cron) && /\.\.\.presaleDeps\(row, \{ supabase, alertOps \}\)/.test(cron));
t("the pass's own write cannot overwrite a finished order", /rollLateAlertAt: now\.toISOString\(\) \} \}\)\.eq\('id', row\.id\)\.eq\('dispute_status', KIT_STATUS\.AWAITING_NOTICE\)/.test(cron));
const deps = read('lib/kit/presaleDeps.js');
t('both states refund idempotently per order and claim conditionally (one implementation)', /idempotencyKey: `presale-refund-\$\{o\.id\}`/.test(deps) && /\.eq\('dispute_status', from\)/.test(deps) && /presaleDeps\(row/.test(read('pages/api/kit/notice.js')));

// ── 4. WIRING ───────────────────────────────────────────────────────────────
const checkout = read('pages/api/checkout.js');
t('checkout runs the pre-sale gate on a stored Texas reservation', /TX: \(o\) => \(o\?\.presale === true \? txPresaleSellability\(o\) : txSellability\(o\)\)/.test(checkout));
t('the reservation line item promises the refund and never says we file', /Texas protest kit, reserved/.test(checkout) && /we refund you in full before anything is mailed( \([^)]*\))?\. You sign and mail it; we do not file your protest/.test(checkout));
t('a Texas reservation gets no notice link (nothing for the customer to enter)', /AWAITING_NOTICE && stateCode === 'GA' \? noticeUrl\(order\.id\) : disputeStatus === KIT_STATUS\.AWAITING_NOTICE && stateCode === 'FL' \? trimUrl\(order\.id\) : null/.test(read('lib/fulfillOrder.js')));
const rec = confirmationEmailTemplate({ firstName: 'Jane', lastName: 'Doe', address: '1 A St', county: 'El Paso', stateCode: 'TX', orderStatus: 'awaiting_notice', noticeUrl: 'https://x/kit/notice?o=1&t=abc' });
t('the Texas reservation receipt says we re-check automatically, with no button', /we check your protest again on it automatically/.test(rec) && !/kit\/notice/.test(rec) && !/Enter my notice/.test(rec));
t('...under its own subject', /protest kit is reserved/.test(confirmationSubject({ stateCode: 'TX', orderStatus: 'awaiting_notice' })) && /notice arrives/.test(confirmationSubject({ stateCode: 'GA', orderStatus: 'awaiting_notice' })));
const ui = read('components/TxKitCheckout.js');
t('the review screen offers a reservation, with the refund in the acknowledgment', /if \(review\?\.presale\) \{/.test(ui) && /Reserve my protest kit/.test(ui) && /If this year&rsquo;s values no longer show a case, I am refunded in full/.test(ui));
t('the page after payment says Texas checks again automatically', /presale && isTX/.test(read('pages/success.js')) && /we check your protest again automatically/.test(read('pages/success.js')));

console.log(`verify-tx-presale: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
