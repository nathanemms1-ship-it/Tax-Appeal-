/**
 * scripts/verify-outcome.mjs — "What did the county decide?" (17 Oct 2026).
 *
 * The free-next-year-kit guarantee can only be kept if we learn the outcome,
 * and under the kit model the county writes to the customer, not to us.
 *   1. the ask: weeks after the deadline, monthly while waiting, at most four
 *   2. one record from either source (the customer, or a forwarded letter)
 *   3. "not lowered" records the free kit; nothing else does
 *   4. a recorded decision is never overwritten from a link
 */
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);
process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'verify-outcome-secret';

const O = await import('../lib/kit/outcome.js');
const { sentToken } = await import('../lib/kit/afterMailing.js');

let pass = 0; const fails = [];
const t = (name, ok) => { if (ok) pass++; else fails.push(name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const on = (iso) => new Date(`${iso}T15:00:00Z`);

// ── 1. THE LINK AND THE ASK ─────────────────────────────────────────────────
const tok = O.outcomeToken('ord_1');
t('the outcome link checks out for its own order only', O.checkOutcomeToken('ord_1', tok) && !O.checkOutcomeToken('ord_2', tok) && !O.checkOutcomeToken('ord_1', null));
// INJECTION: share the kit-sent prefix -> FAILS.
t('it is not the "I\'ve sent it" link', tok !== sentToken('ord_1'));

const row = (after = {}, patch = {}) => ({ state_code: 'GA', payment_status: 'paid', dispute_status: 'kit_sent', kit_order: { taxYear: 2027, property: { address: '1 Main St', parcelId: 'P1' }, after: { deadline: '2027-07-01', ...after } }, ...patch });
t('not before decisions usually exist (Georgia: 75 days after the deadline)', !O.askDue(row(), on('2027-09-10')) && O.askDue(row(), on('2027-09-15')));
t('Texas and Florida wait their own time', O.askDue(row({}, ), on('2027-08-30')) === false && O.askDue(row({}, { state_code: 'TX' }), on('2027-08-30')) && !O.askDue(row({}, { state_code: 'FL' }), on('2027-09-30')) && O.askDue(row({}, { state_code: 'FL' }), on('2027-10-29')));
t('monthly after an ask, and after a "still waiting" answer', !O.askDue(row({ outcomeAsks: ['2027-09-15T15:00:00Z'] }), on('2027-10-10')) && O.askDue(row({ outcomeAsks: ['2027-09-15T15:00:00Z'] }), on('2027-10-15'))
  && !O.askDue(row({ outcomeAsks: ['2027-09-15T15:00:00Z'], outcome: { answer: 'waiting', at: '2027-10-01T00:00:00Z' } }), on('2027-10-20')));
// INJECTION: drop the MAX_ASKS check -> FAILS.
t('at most four asks, and none once answered', !O.askDue(row({ outcomeAsks: ['a', 'b', 'c', 'd'].map(() => '2027-01-01T00:00:00Z') }), on('2028-01-01'))
  && !O.askDue(row({ outcome: { answer: 'not_lowered', at: '2027-09-01T00:00:00Z' } }), on('2027-12-01')));
t('only kits that went out and were paid for', !O.askDue(row({}, { dispute_status: 'denied' }), on('2027-12-01')) && !O.askDue(row({}, { payment_status: 'refunded' }), on('2027-12-01')) && !O.askDue(row({ deadline: null }), on('2027-12-01'))
  && O.askDue(row({}, { dispute_status: 'kit_mailed' }), on('2027-12-01')));

// ── 2-3. THE RECORD AND THE GUARANTEE ───────────────────────────────────────
const now = on('2027-10-01');
const denied = O.outcomePatch(row(), 'not_lowered', { now });
t('"not lowered" becomes a denied decision on the columns the portal and admin read', denied.dispute_status === 'denied' && denied.outcome === 'denied' && denied.decision_date && denied.outcome_reported_at);
// INJECTION: record the guarantee for any answer -> FAILS.
t('...and CLAIMS next year\'s free kit for this property: proof still needed, no code yet', denied.kit_order.after.guarantee?.freeKitYear === 2028 && denied.kit_order.after.guarantee.parcelId === 'P1' && denied.kit_order.after.guarantee.status === 'needs_proof' && !denied.kit_order.after.guarantee.code);
// INJECTION: let a forwarded letter verify the claim -> FAILS (it cannot tell a denial from a no-show dismissal).
t('a forwarded letter claims it for a person to review, never verifies it', O.outcomePatch(row(), 'not_lowered', { now, source: 'letter' }).kit_order.after.guarantee.status === 'needs_review');
t('an answer never overwrites a claim already decided', !O.outcomePatch(row({ guarantee: { status: 'verified', code: 'FREE-ABCDEFGH' } }), 'not_lowered', { now }).kit_order.after.guarantee.status.startsWith('needs'));
t('a lowered value records no free kit, and keeps the new value given', (() => { const p = O.outcomePatch(row(), 'lowered', { newValue: '$350,000', now }); return p.dispute_status === 'approved' && !p.kit_order.after.guarantee && p.kit_order.after.outcome.newValue === 350000; })());
t('"still waiting" and "did not send" change no status and free nothing', ['waiting', 'not_sent'].every((a) => { const p = O.outcomePatch(row(), a, { now }); return !('dispute_status' in p) && !p.kit_order.after.guarantee; }));
t('an unknown answer writes nothing', O.outcomePatch(row(), 'won_big', { now }) === null);
t('the record keeps the rest of the kit order', denied.kit_order.property.address === '1 Main St' && denied.kit_order.after.deadline === '2027-07-01');

const inbound = read('pages/api/webhooks/inbound-email.js');
// INJECTION: drop the kit branch from inbound-email -> FAILS (a denied letter would not record the free kit).
t('a forwarded decision letter writes the same record, mapped by decision', /outcomePatch\(order, \{ approved: 'lowered', partial: 'partial', denied: 'not_lowered' \}\[parsed\.decision\], \{ source: 'letter' \}\)/.test(inbound) && /\.\.\.kitOutcome,/.test(inbound) && /kit_order'/.test(inbound.match(/const ORDER_FIELDS = '[^']*'/)?.[0] + "'"));

// ── 4. THE ROUTE AND THE CRON ───────────────────────────────────────────────
const api = read('pages/api/kit/outcome.js');
t('the route needs this order\'s outcome token', /checkOutcomeToken\(orderId, b\.t\)/.test(api));
// INJECTION: remove the DECIDED check -> FAILS.
t('a decision already recorded is never overwritten from a link', /if \(DECIDED\.includes\(row\.dispute_status\)\) return res\.status\(200\)/.test(api) && /\.eq\('dispute_status', row\.dispute_status\)/.test(api));
t('"not lowered" emails the customer how to prove it, with their outcome link', /answer === 'not_lowered' && g\?\.status === G\.NEEDS_PROOF/.test(api) && /guaranteeEmail\(row, outcomeUrl\(row\.id\)\)/.test(api)
  && O.guaranteeEmail(row({}, { customer_name: 'Pat' }), 'https://x/o').text.includes('https://x/o') && /dismissed or withdrawn/.test(O.guaranteeEmail(row(), 'L').text));
t('/outcome exists and offers every answer the record knows', existsSync(new URL('../pages/outcome.js', import.meta.url)) && Object.keys(O.OUTCOMES).every((k) => read('pages/outcome.js').includes(`['${k}',`)));
const cron = read('pages/api/cron/notice-reminder.js');
t('the daily cron asks and records each ask', /outcomePass\(supabase, resend, now\)/.test(cron) && /outcomeAsks: \[\.\.\.\(k\.after\?\.outcomeAsks \|\| \[\]\), now\.toISOString\(\)\]/.test(cron));
t('the ask email carries the link and names the guarantee', (() => { const m = O.askEmail(row({}, { customer_name: 'Pat Lee' }), 'https://x/outcome?o=1&t=2'); return m.text.includes('https://x/outcome?o=1&t=2') && /next year's kit is free/.test(m.text) && /^What did the county decide\?$/.test(m.subject); })());

console.log(`verify-outcome: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL: ${f}`);
if (fails.length) process.exit(1);
