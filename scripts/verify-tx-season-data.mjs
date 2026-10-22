/**
 * verify-tx-season-data — what a Texas customer is told, and what happens, when
 * the district's data is not out yet (19 Oct 2026).
 *   lib/tx/inSeason.js      which districts take reservations, the cut-off, the copy
 *   lib/kit/txPresale.js    the gate, the stored form, processTxCutoff
 *   cron + screens + emails the wiring
 * Offline. Where a line says INJECTION, reintroducing that bug fails the assertion.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const S = await import('../lib/tx/inSeason.js');
const { txPresaleOrder, txPresaleSellability, processTxCutoff, txCutoffEmail } = await import('../lib/kit/txPresale.js');
const { PRESALE_STATUS } = await import('../lib/kit/presale.js');
const { KIT_STATUS } = await import('../lib/kit/dispatchKit.js');
const { fill50132 } = await import('../lib/tx/fill50132.js');
const { txPacket, TX_OWNER } = await import('./kit/tx-fixture.mjs');
const { txRollPlan } = await import('../pages/api/cron/notice-reminder.js');
const { confirmationEmailTemplate } = await import('../pages/api/email-templates.js');
const { WAITLIST_BLOCKED_REASONS } = await import('../lib/waitlistReasons.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 1. THE TABLE MATCHES THE RESEARCH ──────────────────────────────────────
const sources = JSON.parse(read('scripts/tx/sources.json'));
const researched = sources.districts.filter((d) => d.in_season);
const mismatch = [];
for (const d of researched) {
  const row = S.TX_SEASON_DATA[d.cad_id];
  if (!row) { mismatch.push(`${d.county}: missing`); continue; }
  const i = d.in_season;
  const before = i.published_2026_before_deadline === 'yes' || !!i.load_with;
  // INJECTION: mark a district that published nothing in time as 'reserve' -> FAILS.
  const want = before && !row.tooLate ? 'reserve' : 'waitlist';
  if (row.tier !== want) mismatch.push(`${d.county}: ${row.tier}, research says ${want}`);
  if (row.tier === 'reserve' && row.lastYear !== (i.first_seen_2026 || null)) mismatch.push(`${d.county}: lastYear ${row.lastYear} vs ${i.first_seen_2026}`);
  if (row.tooLate && !(row.tooLate > `${row.tooLate.slice(0, 4)}-05-07`)) mismatch.push(`${d.county}: tooLate is not after the cut-off`);
}
t(`every researched district is in the table with the tier the research gives (${mismatch.join('; ') || 'ok'})`, mismatch.length === 0 && Object.keys(S.TX_SEASON_DATA).length === researched.length);
t('a district we hold no research for is waitlist, never reserve', S.seasonData(9999).tier === 'waitlist' && !S.canReserve(9999));
t('county names map to districts', S.cadForCounty('Dallas County') === 57 && S.cadForCounty('fort bend') === 79 && S.cadForCounty('Nowhere') === null);

// ── 2. THE CUT-OFF ──────────────────────────────────────────────────────────
t('the 2027 cut-off is 10 days before the May 17 deadline: May 7', S.dataCutoff(2027).toISOString() === '2027-05-07T00:00:00.000Z');
const tm = S.reservationTiming(126, 2027);
t("the reservation copy says the kit waits for the district's data, when it came last year, and the cut-off promise",
  /not from your notice, so it does not go out the day notices arrive/.test(tm.paragraph) && /Last year it published that file on March 31\./.test(tm.paragraph)
  && /not out by May 7, we refund you in full and email you the protest form filled in/.test(tm.paragraph) && /May 17, 2027 deadline/.test(tm.paragraph));
t('a district with only a pattern gets no invented date', !/Last year/.test(S.reservationTiming(220, 2027).paragraph) && /each spring/.test(S.reservationTiming(220, 2027).paragraph));

// ── 3. THE GATE ─────────────────────────────────────────────────────────────
const NOW = new Date('2027-02-10T00:00:00Z');
const mk = (cadId, county) => txPresaleOrder({ packet: txPacket({}, 2026), taxYear: 2027, screenYear: 2026, cadId, accountNumber: 'A1', county, owner: TX_OWNER, protestOwner: { firstName: 'Jane', lastName: 'Doe' } });
// INJECTION: drop the canReserve check -> FAILS (money taken where no data comes in time).
t('no reservation is sold where the district published nothing before the deadline last year', txPresaleSellability(mk(61, 'Denton'), { now: NOW }).reason === 'no_season_data' && txPresaleSellability(mk(227, 'Travis'), { now: NOW }).waitlist === true);
const harris = mk(101, 'Harris');
t('a reserve district gets past the data gate (on to the address check)', txPresaleSellability(harris, { now: NOW }).reason === 'address_not_confirmed');
// INJECTION: drop the cut-off check -> FAILS.
t('no reservation is sold on or after the cut-off', txPresaleSellability(harris, { now: new Date('2027-05-07T00:00:00Z') }).reason === 'past_data_cutoff');
t('the reservation stores the form for the season year, with no opinion of value', harris.form50132?.taxYear === 2027 && harris.form50132.opinionOfValue === null && !!harris.form50132.accountNumber);

// ── 4. THE DAILY PASS ───────────────────────────────────────────────────────
const ROW = { id: 'ord_c1', state_code: 'TX', payment_status: 'paid', dispute_status: 'awaiting_notice', customer_name: 'Jane Doe', customer_email: 'jane@example.com', stripe_session_id: 'cs_c1', kit_order: harris };
t('data still missing at the cut-off: cutoff', txRollPlan(ROW, false, new Date('2027-05-07T06:00:00Z')) === 'cutoff');
t('the day before: not yet', txRollPlan(ROW, false, new Date('2027-05-06T23:00:00Z')) !== 'cutoff');
t('data loaded, even late: build the kit, never refund it', txRollPlan(ROW, true, new Date('2027-05-08T00:00:00Z')) === 'process');

function harness({ refundThrows = false, claimOk = true, fillThrows = false } = {}) {
  const h = { updates: [], refunds: 0, emails: [], alerts: [] };
  h.deps = {
    claim: async () => claimOk,
    update: async (p) => { h.updates.push(p); return { error: null }; },
    refund: async () => { h.refunds++; if (refundThrows) throw new Error('stripe down'); return { id: 're_c1' }; },
    sendEmail: async (m) => { h.emails.push(m); },
    alertOps: async (s) => { h.alerts.push(s); },
    ...(fillThrows ? { fill: async () => { throw new Error('pdf broke'); } } : {}),
    appealAddress: { addressee: 'Harris Central Appraisal District', line1: 'PO BOX 922012', city: 'Houston', stateAbbr: 'TX', zip: '77292-2012' },
    now: new Date('2027-05-07T06:00:00Z'),
  };
  return h;
}
let h = harness();
let r = await processTxCutoff(ROW, h.deps);
const att = h.emails[0]?.attachments?.[0];
t('cut-off: refunded in full, once, status recorded', r.status === PRESALE_STATUS.REFUNDED_NO_DATA && h.refunds === 1 && h.updates.some((u) => u.dispute_status === 'refunded_no_data' && u.payment_status === 'refunded' && u.kit_order.cutoff.refundId === 're_c1'));
t('...and the customer is emailed the filled-in form as a PDF', h.emails.length === 1 && att && /Form-50-132-2027\.pdf/.test(att.filename) && att.content.length > 1000);
t('the attachment is a real PDF', att && Buffer.from(att.content).subarray(0, 5).toString() === '%PDF-');
// The filled form is flattened, so check what the real filler was given, and its guard.
let given = null;
h = harness(); h.deps.fill = async (p) => { given = p; return fill50132(p); };
await processTxCutoff(ROW, h.deps);
// INJECTION: drop noticeOnly in fill50132 -> FAILS (the form would point to a statement that is not attached).
t('the form is filled for the season year and account, with no opinion of value and no "see attached"',
  given?.noticeOnly === true && given.hasGrid === false && given.form50132.taxYear === 2027 && given.form50132.opinionOfValue === null && given.form50132.accountNumber === harris.form50132.accountNumber
  && /if \(!packet\.noticeOnly\) setText\(\s*'Facts to resolve protest'/.test(read('lib/tx/fill50132.js')));
const txt = h.emails[0]?.text || '';
t('the email says refunded, how to file, the postmark deadline and where to mail it', /refunded your payment in full/.test(txt) && /sign and date it, and mail it/.test(txt) && /postmarked by May 17, 2027/.test(txt) && /PO BOX 922012/.test(txt));
h = harness({ refundThrows: true });
r = await processTxCutoff(ROW, h.deps);
t('a refund that fails goes to a person, and no "you are refunded" email goes out', r.status === KIT_STATUS.NEEDS_REVIEW && h.emails.length === 0 && h.alerts.length === 1);
h = harness({ claimOk: false });
t('a second run while the first is working does nothing', (await processTxCutoff(ROW, h.deps)).reason === 'in_progress' && h.refunds === 0);
h = harness({ fillThrows: true });
r = await processTxCutoff(ROW, h.deps);
t('a form that fails to fill still refunds, emails the how-to, and tells ops', r.status === 'refunded_no_data' && h.emails.length === 1 && !h.emails[0].attachments && /Download the Comptroller's Form 50-132/.test(h.emails[0].text) && h.alerts.length === 1);
t('with no confirmed address the email says where to find it', /printed on your notice/.test(txCutoffEmail(ROW, { attached: true }).text));

// ── 5. WHAT THE CUSTOMER READS ──────────────────────────────────────────────
const ui = read('components/TxKitCheckout.js');
t('the reservation screen prints the timing paragraph', /review\?\.timing\?\.paragraph/.test(ui) && /When your kit goes out\./.test(ui));
t('a no-data district: no sale, the waitlist for "data published", and how to file alone', /notSellableReason === 'no_season_data'/.test(ui) && /noSeasonData \? 'tx_awaiting_data' : 'tx_county_not_open'/.test(ui) && /we won&rsquo;t take your money for one/.test(ui) && /50-132\.pdf/.test(ui));
t('past the cut-off: no sale, no waitlist, how to file alone', /notSellableReason === 'past_data_cutoff'/.test(ui) && /if \(!isCase \|\| review\?\.sellable \|\| pastCutoff/.test(ui) && /too late for us to build your kit/.test(ui));
t('the review response carries the timing', /timing: presale \? reservationTiming\(cadId, taxYear\) : null/.test(read('pages/api/generate-50132.js')));
const rec = confirmationEmailTemplate({ firstName: 'Jane', lastName: 'Doe', address: '1 A St', county: 'Johnson', stateCode: 'TX', orderStatus: 'awaiting_notice' });
t('the receipt email says the kit waits for the data, when it came last year, and the cut-off', /does not go out the day notices arrive/.test(rec) && /March 31/.test(rec) && /protest form filled in/.test(rec));
t('the page after payment says the same', /not the day notices arrive/.test(read('pages/success.js')) && /txCutoffText/.test(read('pages/success.js')));
t('the card-payment line says it too', /not the day notices arrive/.test(read('pages/api/checkout.js')) && /reservationTiming\(kitOrder\.cadId, kitOrder\.taxYear\)\.cutoffText/.test(read('pages/api/checkout.js')));
t('the terms state the rule', /published their data before the protest deadline last year/.test(read('pages/terms.js')) && /10 days before the protest deadline/.test(read('pages/terms.js')));
t('the portal explains a cut-off refund', /refunded_no_data:/.test(read('pages/portal.js')));

// ── 6. THE WAITLIST ─────────────────────────────────────────────────────────
t('the new waitlist reason is allowed in code and by the database migration', WAITLIST_BLOCKED_REASONS.includes('tx_awaiting_data') && /'tx_awaiting_data'\)\);/.test(read('scripts/sql/waitlist_blocked_reason_tx_awaiting_data.sql')));
const nw = read('pages/api/cron/notify-waitlist.js');
const branch = nw.slice(nw.indexOf("if (blocked_reason === 'tx_awaiting_data') {"), nw.indexOf("if (blocked_reason === 'fl_no_parcel_record'"));
// INJECTION: email without checking the data is loaded -> FAILS.
t("the waitlist is emailed only once that district's data for the season is loaded", /from\('tx_parcels'\)/.test(branch) && /eq\('tax_year', currentTaxYear\(\)\)/.test(branch) && /if \(loaded\)/.test(branch) && /continue;/.test(branch));

console.log(`verify-tx-season-data: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
