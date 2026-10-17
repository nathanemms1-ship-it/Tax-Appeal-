/**
 * scripts/verify-after-mailing.mjs — what happens once a kit has left us (17 Oct 2026).
 *
 *   1. dispatch records the deadline and how the kit went out, and every kit
 *      email carries the private "I've sent it" link
 *   2. the reminder schedule: at most three, never after the deadline, none once
 *      sent; Florida earlier because it counts receipt
 *   3. the Lob webhook verifies the RAW body (the bug that killed it since 31 Aug)
 *   4. /mailed exists (every printed checklist sends people there) and its routes
 *      can only mark one order, and cannot reveal who is a customer
 * Offline. Each check names its INJECTION where one is not obvious.
 */
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
register('./resolve-extensionless.mjs', import.meta.url);
process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'verify-after-mailing-secret';

const A = await import('../lib/kit/afterMailing.js');
const { dispatchKit } = await import('../lib/kit/dispatchKit.js');
const { noticeToken } = await import('../lib/kit/noticeLink.js');
const { verifyLobSignature, lobTimestampMs, STATUS_BY_EVENT } = await import('../pages/api/lob-webhook.js');
const { cleanSentOn } = await import('../pages/api/kit/sent.js');
const { flOrder, FL_NOW } = await import('./kit/fl-fixture.mjs');

let pass = 0; const fails = [];
const t = (name, ok) => { if (ok) pass++; else fails.push(name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const DAY = 86400000;

// ── 1. DISPATCH ─────────────────────────────────────────────────────────────
function fakeLob() {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, form: init.body }); return { ok: true, status: 200, json: async () => ({ id: `ltr_${calls.length}`, expected_delivery_date: '2027-08-21' }) }; };
  fn.calls = calls; return fn;
}
function fakeSupabase() {
  const updates = [];
  return { updates, from() { const q = { _p: null, update(p) { q._p = p; return q; }, eq(k, v) { if (q._p && k === 'id') { updates.push(q._p); return Promise.resolve({ error: null }); } return q; } }; return q; } };
}
function fakeResend() { const sent = []; return { sent, emails: { send: async (m) => { sent.push(m); return { id: 'e' }; } } }; }
const row = (patch = {}) => ({ id: 'ord_after_1', state_code: 'FL', county: 'Hillsborough', payment_status: 'paid', dispute_status: 'kit_queued', customer_name: 'Jordan Rivera', customer_email: 'jordan@example.com', owner_street: '1234 Sample Oak Dr', owner_city: 'Tampa', owner_state: 'FL', owner_zip: '33614', lob_letter_id: null, kit_order: flOrder(), ...patch });
{
  const db = fakeSupabase(); const rs = fakeResend(); const lob = fakeLob();
  const r = await dispatchKit(row(), { supabase: db, resend: rs, alertOps: async () => {}, now: FL_NOW, lobApiKey: 'test_x', lobFetch: lob, checkSpend: async () => ({ ok: true }) });
  const patch = db.updates.find((u) => u.dispute_status === 'kit_mailed');
  // INJECTION: drop kit_order from the mailed patch in dispatchKit -> FAILS (no reminders would ever run).
  t('a mailed kit records its deadline, how it went and when Lob expects it to arrive', r.status === 'kit_mailed' && patch?.kit_order?.after?.deadline === '2027-09-07' && patch.kit_order.after.mode === 'mail' && patch.kit_order.after.expectedDelivery === '2027-08-21');
  t('...without losing the kit order it was built from', patch?.kit_order?.parcel?.parcel_id === 'A1234567890' && patch.kit_order.requestedValue === 357000);
  t('the "on its way" email carries the private /mailed link for this order', rs.sent[0]?.text.includes(A.sentUrl('ord_after_1')));
}
{
  const db = fakeSupabase(); const rs = fakeResend(); const lob = fakeLob();
  await dispatchKit(row(), { supabase: db, resend: rs, alertOps: async () => {}, now: new Date('2027-08-28T15:00:00Z'), lobApiKey: 'test_x', lobFetch: lob, checkSpend: async () => ({ ok: true }) });
  const patch = db.updates.find((u) => u.dispute_status === 'kit_emailed');
  t('a PDF-only kit records mode pdf, and its email carries the link too', patch?.kit_order?.after?.mode === 'pdf' && patch.kit_order.after.deadline === '2027-09-07' && rs.sent[0]?.text.includes('/mailed?o=ord_after_1'));
}

// ── 2. THE LINK AND THE SCHEDULE ────────────────────────────────────────────
const tok = A.sentToken('ord_1');
t('the link checks out for its own order only', A.checkSentToken('ord_1', tok) && !A.checkSentToken('ord_2', tok) && !A.checkSentToken('ord_1', 'x'.repeat(40)) && !A.checkSentToken('ord_1', undefined));
// INJECTION: reuse the notice prefix in sentToken -> FAILS (a notice link would mark a kit sent).
t('it is not the pre-sale notice link', tok !== noticeToken('ord_1'));

const mailed = (after, patch = {}) => ({ state_code: 'GA', payment_status: 'paid', dispute_status: 'kit_mailed', kit_order: { property: { address: '1 Main St' }, after: { deadline: '2027-07-01', mode: 'mail', sentOutAt: '2027-06-01T12:00:00Z', reminders: {}, ...after } }, ...patch });
const on = (iso) => new Date(`${iso}T15:00:00Z`);
t('no reminder before the kit can have arrived', A.reminderDue(mailed(), on('2027-06-04')) === null);
t('an arrival event starts the "sign it and send it" reminder', A.reminderDue(mailed({ arrivedAt: '2027-06-04T10:00:00Z' }), on('2027-06-04')) === 'arrived');
t('with no Lob event, Lob\'s expected date + 1 day, or a week after mailing', A.reminderDue(mailed({ expectedDelivery: '2027-06-05' }), on('2027-06-06')) === 'arrived' && A.reminderDue(mailed(), on('2027-06-08')) === 'arrived');
t('each reminder goes once', A.reminderDue(mailed({ arrivedAt: '2027-06-04', reminders: { arrived: 'x' } }), on('2027-06-10')) === null);
t('Georgia: the week reminder 6 days out, the final 2 days out, nothing after the deadline', A.reminderDue(mailed({ reminders: { arrived: 'x' } }), on('2027-06-25')) === 'week'
  && A.reminderDue(mailed({ reminders: { arrived: 'x', week: 'x' } }), on('2027-06-29')) === 'final'
  && A.reminderDue(mailed({ reminders: {} }), on('2027-07-01')) === 'final'
  && A.reminderDue(mailed({ reminders: {} }), on('2027-07-02')) === null);
// INJECTION: drop the sentAt check -> FAILS.
t('none once the customer says it is sent, or when it is not out with them', A.reminderDue(mailed({ sentAt: '2027-06-20' }), on('2027-06-29')) === null
  && A.reminderDue(mailed({}, { dispute_status: 'kit_sent' }), on('2027-06-29')) === null
  && A.reminderDue(mailed({}, { payment_status: 'refunded' }), on('2027-06-29')) === null);
t('a PDF-only kit gets no "should have arrived" email', A.reminderDue(mailed({ mode: 'pdf' }, { dispute_status: 'kit_emailed' }), on('2027-06-10')) === null
  && A.reminderDue(mailed({ mode: 'pdf' }, { dispute_status: 'kit_emailed' }), on('2027-06-29')) === 'final');
// INJECTION: give Florida the default schedule -> FAILS.
t('Florida counts receipt: earlier reminders, and none on the deadline day', A.reminderDue(mailed({ reminders: { arrived: 'x' } }, { state_code: 'FL' }), on('2027-06-22')) === 'week'
  && A.reminderDue(mailed({ reminders: { arrived: 'x', week: 'x' } }, { state_code: 'FL' }), on('2027-06-27')) === 'final'
  && A.reminderDue(mailed({ reminders: {} }, { state_code: 'FL' }), on('2027-07-01')) === null);
t('no deadline recorded: no reminder (never a guessed date)', A.reminderDue(mailed({ deadline: null }), on('2027-06-29')) === null);

const fl = A.reminderEmail(mailed({}, { state_code: 'FL', customer_name: 'Jo Ray' }), 'final', 'https://x/mailed?o=1&t=2', on('2027-06-28'));
t('Florida reminders say RECEIVE and push hand delivery at the end, never "postmarked by"', /must RECEIVE it by/.test(fl.text) && /hand-deliver/i.test(fl.text) && !/postmarked by/i.test(fl.text) && fl.text.includes('https://x/mailed?o=1&t=2'));
const ga = A.reminderEmail(mailed({}, { customer_name: 'Pat' }), 'week', 'L', on('2027-06-25'));
t('Georgia reminders say postmarked, count the days, and say we do not file', /postmarked by Thursday, July 1, 2027/.test(ga.text) && /^6 days left/.test(ga.subject) && /do not file your appeal/.test(ga.text));
t('the returned-kit email points them at the PDF they already have', /PDF we emailed you/.test(A.returnedEmail(mailed({}, { customer_name: 'Pat' })).text));

// ── 3. THE LOB WEBHOOK ──────────────────────────────────────────────────────
const raw = '{ "id": "evt_1",  "event_type": { "id": "letter.delivered" }, "body": { "id": "ltr_1" } }';
const secret = 's3cret';
const now = Date.UTC(2027, 5, 1, 12);
const sign = (ts, body) => crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
// INJECTION: sign JSON.stringify(JSON.parse(raw)) instead of raw -> FAILS. That was the 31 Aug bug.
t('the signature is checked on the raw body as Lob sent it', verifyLobSignature({ raw, signature: sign(String(now), raw), timestamp: String(now), secret, now })
  && JSON.stringify(JSON.parse(raw)) !== raw && !verifyLobSignature({ raw: JSON.stringify(JSON.parse(raw)), signature: sign(String(now), raw), timestamp: String(now), secret, now }));
t('seconds or milliseconds, both read as one clock', lobTimestampMs(String(now / 1000)) === now && lobTimestampMs(String(now)) === now);
t('a seconds timestamp verifies too', verifyLobSignature({ raw, signature: sign(String(now / 1000), raw), timestamp: String(now / 1000), secret, now }));
t('stale, tampered, unsigned or secretless: refused', !verifyLobSignature({ raw, signature: sign(String(now - 6 * 60000), raw), timestamp: String(now - 6 * 60000), secret, now })
  && !verifyLobSignature({ raw: raw.replace('delivered', 'returned_to_sender'), signature: sign(String(now), raw), timestamp: String(now), secret, now })
  && !verifyLobSignature({ raw, signature: '', timestamp: String(now), secret, now }) && !verifyLobSignature({ raw, signature: sign(String(now), raw), timestamp: String(now), secret: '', now }));
const hook = read('pages/api/lob-webhook.js');
t('the route reads the raw body: Next.js body parsing is off', /bodyParser: false/.test(hook) && !/JSON\.stringify\(req\.body\)/.test(hook));
t('arrival and return are recorded on the kit, a return pages ops and tells the customer once', STATUS_BY_EVENT['letter.processed_for_delivery'] === 'out_for_delivery' && STATUS_BY_EVENT['letter.returned_to_sender'] === 'returned'
  && /after\.arrivedAt = at/.test(hook) && /!after\.returnedAt/.test(hook) && /alertOps\('Kit returned to sender'/.test(hook) && /returnedEmail\(row\)/.test(hook));

// ── 4. /mailed ──────────────────────────────────────────────────────────────
t('/mailed exists: every printed checklist sends customers there', existsSync(new URL('../pages/mailed.js', import.meta.url))
  && ['lib/kit/gaKit.js', 'lib/kit/txKit.js', 'lib/kit/flKit.js'].every((f) => /taxappealusa\.com\/mailed/.test(read(f))));
const sent = read('pages/api/kit/sent.js');
t('marking it sent needs this order\'s token, and never overwrites a status that changed', /checkSentToken\(orderId, b\.t\)/.test(sent) && /\.eq\('dispute_status', row\.dispute_status\)/.test(sent) && /dispute_status: AFTER_STATUS\.SENT/.test(sent));
t('the date sent is never in the future and never months back', cleanSentOn('2099-01-01', on('2027-06-20')) === '2027-06-20' && cleanSentOn('2027-06-18', on('2027-06-20')) === '2027-06-18' && cleanSentOn('2027-01-01', on('2027-06-20')) === '2027-06-20' && cleanSentOn('junk', on('2027-06-20')) === '2027-06-20');
const link = read('pages/api/kit/sent-link.js');
// INJECTION: answer "no order found" -> FAILS (the route would reveal who is a customer).
t('"email me my link" gives the same answer found or not, and matches the email exactly', /return res\.status\(200\)\.json\(\{ message: SAME_ANSWER \}\)/.test(link) && (link.match(/res\.status\(200\)/g) || []).length === 1 && /replace\(\/\[%_\\\\\]\/g/.test(link));
const cron = read('pages/api/cron/notice-reminder.js');
t('the daily cron sends the reminders and records each before the next run', /afterMailingPass\(supabase, resend, now\)/.test(cron) && /reminders: \{ \.\.\.\(k\.after\?\.reminders \|\| \{\}\), \[stage\]: now\.toISOString\(\) \}/.test(cron) && /\.eq\('dispute_status', row\.dispute_status\)/.test(cron));
t('the portal knows a kit the customer has sent', /kit_sent: \{ label: 'Sent by you'/.test(read('pages/portal.js')));

console.log(`verify-after-mailing: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL: ${f}`);
if (fails.length) process.exit(1);
