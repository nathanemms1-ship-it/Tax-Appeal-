/**
 * OFFLINE VERIFICATION for the kit mailing path (Kit model, 10 Oct 2026):
 *   lib/kit/lobKit.js       one Lob letter to the CUSTOMER, idempotent
 *   lib/kit/dispatchKit.js  order row -> kit -> Lob -> row -> PDF email
 *   lib/fulfillOrder.js     a paid Georgia order goes to the kit, not to a county
 *
 * No network: Lob, Supabase and Resend are fakes that record what they were
 * asked to do. Where a line says INJECTION, reintroducing that bug makes the
 * named assertion fail.
 */
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { mailKit, lobRecipient, LobKitError, KIT_FROM } = await import('../lib/kit/lobKit.js');
const { dispatchKit, dispatchQueuedKits, KIT_STATUS, isKitState } = await import('../lib/kit/dispatchKit.js');
const { LOB_KIT_OPTIONS } = await import('../lib/kit/gaKit.js');
const { POSTAGE_RESTRICTIONS } = await import('../lib/appealAddresses.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const code = async (fn) => { try { await fn(); return 'ok'; } catch (e) { return e.code || `other: ${e.message}`; } };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = new Date('2027-05-20T00:00:00Z');

// ── fakes ───────────────────────────────────────────────────────────────────
function fakeLob(status = 200, body = null, { throwNetwork = false } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, form: init.body });
    if (throwNetwork) throw new TypeError('fetch failed');
    const data = body ?? { id: `ltr_test_${calls.length}`, expected_delivery_date: '2027-05-26', url: 'https://lob/x.pdf' };
    return { ok: status >= 200 && status < 300, status, json: async () => data };
  };
  fn.calls = calls;
  return fn;
}
function fakeSupabase(rows = []) {
  const updates = [];
  return {
    updates,
    from() {
      const q = {
        _patch: null, _filters: {},
        update(p) { q._patch = p; return q; },
        select() { return q; },
        eq(k, v) {
          q._filters[k] = v;
          if (q._patch && k === 'id') { updates.push({ id: v, ...q._patch }); return Promise.resolve({ error: null }); }
          return q;
        },
        order() { return q; },
        limit() { return Promise.resolve({ data: rows.filter((r) => Object.entries(q._filters).every(([k, v]) => r[k] === v)), error: null }); },
      };
      return q;
    },
  };
}
function fakeResend({ fail = false } = {}) {
  const sent = [];
  return { sent, emails: { send: async (msg) => { if (fail) throw new Error('resend down'); sent.push(msg); return { id: 'em_1' }; } } };
}
const alerts = [];
const alertOps = async (title, body) => { alerts.push({ title, body }); };

// A Gwinnett (state-form county) order with a confirmed address, injected.
const SAMPLE = JSON.parse(read('scripts/kit/sample-order-GA.json'));
const GWINNETT_ROW = {
  addressee: "Gwinnett County Assessors' Office", attnLine: 'ATT: Appeals', line1: '75 LANGLEY DR', line2: null,
  city: 'Lawrenceville', stateAbbr: 'GA', zip: '30046-6935', confidence: 'confirmed', verifiedOn: '2027-02-01',
  cassValidated: true, postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
};
const kitOrder = { ...structuredClone(SAMPLE), property: { ...SAMPLE.property, county: 'Gwinnett' } };
delete kitOrder.countyAddress;
const row = (patch = {}) => ({
  id: 'ord_1', state_code: 'GA', county: 'Gwinnett', payment_status: 'paid', dispute_status: 'kit_queued',
  customer_name: 'Pat Owner', customer_email: 'pat@example.com',
  owner_street: '12 Home St', owner_city: 'Lawrenceville', owner_state: 'GA', owner_zip: '30044',
  lob_letter_id: null, kit_order: kitOrder, ...patch,
});
const addressLookup = () => GWINNETT_ROW;
const spendOk = async () => ({ ok: true });
const run = (r, opts = {}) => dispatchKit(r, { supabase: opts.supabase || fakeSupabase(), resend: opts.resend ?? fakeResend(), alertOps, now: NOW, lobApiKey: 'test_x', lobFetch: opts.lob || fakeLob(), addressLookup: opts.addressLookup || addressLookup, checkSpend: opts.checkSpend || spendOk });

// ── 1. THE LOB CALL ─────────────────────────────────────────────────────────
t('Georgia is a kit state; Texas and Florida are not (yet)', isKitState('GA') && isKitState('ga') && !isKitState('TX') && !isKitState('FL'));
t('a recipient without a street is refused', (await code(() => lobRecipient({ name: 'A', city: 'X', state: 'GA', zip: '30044' }))) === 'recipient_incomplete');
t('a bad ZIP or state is refused', (await code(() => lobRecipient({ name: 'A', street: '1 St', city: 'X', state: 'Georgia', zip: '30044' }))) === 'recipient_incomplete'
  && (await code(() => lobRecipient({ name: 'A', street: '1 St', city: 'X', state: 'GA', zip: '3004' }))) === 'recipient_incomplete');
const to = lobRecipient({ name: 'Pat Owner', street: '12 Home St', city: 'Lawrenceville', state: 'ga', zip: '30044' });
// INJECTION: drop the idempotency-key check in mailKit -> FAILS.
t('no Lob call without an idempotency key', (await code(() => mailKit({ pdf: new Uint8Array([1]), to, lob: LOB_KIT_OPTIONS, apiKey: 'test_x', fetchImpl: fakeLob(), checkSpend: spendOk }))) === 'no_idempotency_key');
// INJECTION: allow extra_service through -> FAILS (a kit must never go certified to anyone).
t('certified mail or a missing return envelope is refused', (await code(() => mailKit({ pdf: new Uint8Array([1]), to, lob: { ...LOB_KIT_OPTIONS, extra_service: 'certified' }, idempotencyKey: 'k', apiKey: 'test_x', fetchImpl: fakeLob(), checkSpend: spendOk }))) === 'bad_lob_options'
  && (await code(() => mailKit({ pdf: new Uint8Array([1]), to, lob: { ...LOB_KIT_OPTIONS, return_envelope: false }, idempotencyKey: 'k', apiKey: 'test_x', fetchImpl: fakeLob(), checkSpend: spendOk }))) === 'bad_lob_options');
t('no Lob call without a key', (await code(() => mailKit({ pdf: new Uint8Array([1]), to, lob: LOB_KIT_OPTIONS, idempotencyKey: 'k', apiKey: '', fetchImpl: fakeLob(), checkSpend: spendOk }))) === 'no_key');

// ── 2. THE HAPPY PATH ───────────────────────────────────────────────────────
let lob = fakeLob(); let db = fakeSupabase(); let rs = fakeResend();
let r = await run(row(), { lob, supabase: db, resend: rs });
const call = lob.calls[0];
const form = call?.form;
t('a paid Georgia kit order is mailed once', r.status === KIT_STATUS.MAILED && lob.calls.length === 1 && call.url === 'https://api.lob.com/v1/letters');
// INJECTION: address the letter to the county row instead of the owner -> FAILS.
t('the letter goes to the CUSTOMER, not the county', form.get('to[name]') === 'Pat Owner' && form.get('to[address_line1]') === '12 Home St' && form.get('to[address_city]') === 'Lawrenceville' && !/Assessor/i.test(form.get('to[name]')));
t('the return address is ours', form.get('from[name]') === KIT_FROM.name && form.get('from[address_zip]') === '76119');
t('kit layout options: return envelope, page 7 perforated, address on page 1, no certified',
  form.get('return_envelope') === 'true' && form.get('perforated_page') === '7' && form.get('address_placement') === 'top_first_page' && form.get('extra_service') === null);
t('the file is the kit PDF', form.get('file') && (await form.get('file').arrayBuffer()).byteLength > 1000 && Buffer.from(await form.get('file').arrayBuffer()).subarray(0, 4).toString() === '%PDF');
// INJECTION: drop the Idempotency-Key header -> FAILS.
t('Lob gets an Idempotency-Key derived from the order', call.init.headers['Idempotency-Key'] === 'kit-ord_1');
t('the order row records kit_mailed, the Lob id and the mailing time', db.updates.some((u) => u.id === 'ord_1' && u.dispute_status === 'kit_mailed' && u.lob_letter_id === 'ltr_test_1' && u.mailed_at === NOW.toISOString()));
const em = rs.sent[0];
t('the customer is emailed the same kit as a PDF attachment', r.emailed === true && em && em.to[0] === 'pat@example.com' && em.attachments?.[0]?.filename.endsWith('.pdf') && Buffer.from(em.attachments[0].content).subarray(0, 4).toString() === '%PDF');
t('the email says we do not file or represent', /do not file your appeal or represent you/.test(em.text) && !/certified/i.test(em.text));

// ── 3. NEVER TWICE, NEVER WHEN IT SHOULD NOT ────────────────────────────────
lob = fakeLob();
r = await run(row({ lob_letter_id: 'ltr_already' }), { lob });
// INJECTION: drop the lob_letter_id check -> FAILS (a webhook retry would print a second kit).
t('an order that already has a letter is never mailed again', lob.calls.length === 0 && r.already === true);
for (const ps of ['refunded', 'partially_refunded', 'disputed', 'unpaid']) {
  lob = fakeLob(); r = await run(row({ payment_status: ps }), { lob });
  t(`a ${ps} order is never mailed`, lob.calls.length === 0 && r.reason === 'not_paid');
}
lob = fakeLob(); db = fakeSupabase(); r = await run(row({ kit_order: null }), { lob, supabase: db });
t('a pre-sale order with no notice data waits as awaiting_notice', lob.calls.length === 0 && r.status === 'awaiting_notice' && db.updates.some((u) => u.dispute_status === 'awaiting_notice'));
lob = fakeLob(); r = await run(row({ state_code: 'TX' }), { lob });
t('a Texas order is not sent down the kit path (no TX kit builder yet)', lob.calls.length === 0 && r.reason === 'not_a_kit_state');

// The real address table: every GA row is unverified today.
lob = fakeLob(); db = fakeSupabase(); alerts.length = 0;
r = await dispatchKit(row(), { supabase: db, resend: fakeResend(), alertOps, now: NOW, lobApiKey: 'test_x', lobFetch: lob, checkSpend: spendOk });
// INJECTION: build with proof:true in dispatchKit -> FAILS (an unconfirmed address would be printed on a real envelope).
t('an unconfirmed county address: no mail, needs_review, ops paged', lob.calls.length === 0 && r.status === 'needs_review' && r.reason === 'address_not_mailable' && alerts.length === 1);
lob = fakeLob();
r = await run(row({ kit_order: { ...kitOrder, requestedValue: 0 } }), { lob });
t('a blank value assertion: no mail, needs_review', lob.calls.length === 0 && r.reason === 'value_blank');
lob = fakeLob();
r = await run(row({ kit_order: { ...kitOrder, property: { ...kitOrder.property, county: 'Clayton' } } }), { lob });
t('a county whose form is unconfirmed: no mail', lob.calls.length === 0 && r.reason === 'county_form_unconfirmed');

// ── 4. FAILURES ─────────────────────────────────────────────────────────────
db = fakeSupabase(); r = await run(row(), { lob: fakeLob(500, { error: { message: 'down', status_code: 500 } }), supabase: db });
t('Lob 5xx: stays kit_queued for the hourly retry', r.status === 'kit_queued' && db.updates.some((u) => u.dispute_status === 'kit_queued'));
db = fakeSupabase(); r = await run(row(), { lob: fakeLob(0, null, { throwNetwork: true }), supabase: db });
t('network failure: stays kit_queued', r.status === 'kit_queued' && r.reason === 'network');
db = fakeSupabase(); r = await run(row(), { lob: fakeLob(422, { error: { message: 'address undeliverable', status_code: 422 } }), supabase: db });
t('Lob 4xx (bad address): needs_review, a person looks', r.status === 'needs_review');
r = await run(row(), { resend: fakeResend({ fail: true }) });
t('an email failure never un-mails a kit', r.status === 'kit_mailed' && r.emailed === false);

// INJECTION: drop checkSpend from mailKit -> FAILS.
lob = fakeLob(); db = fakeSupabase(); r = await run(row(), { lob, supabase: db, checkSpend: async () => ({ ok: false }) });
t('daily Lob ceiling: nothing printed, stays kit_queued', lob.calls.length === 0 && r.status === 'kit_queued' && r.reason === 'mail_ceiling');

// ── 5. THE HOURLY RETRY ─────────────────────────────────────────────────────
const queue = [row({ id: 'a' }), row({ id: 'b', payment_status: 'refunded' }), row({ id: 'c', dispute_status: 'kit_mailed' })];
lob = fakeLob();
const origLookup = addressLookup;
const res = await (async () => {
  // dispatchQueuedKits selects kit_queued + paid only.
  const db2 = fakeSupabase(queue);
  const { dispatchQueuedKits: dq } = await import('../lib/kit/dispatchKit.js');
  return dq({ supabase: db2, resend: fakeResend(), alertOps, now: NOW });
})();
t('the hourly retry only picks paid kit_queued orders', res.length === 1 && res[0].id === 'a');
const { KIT_ROW_COLUMNS } = await import('../lib/kit/dispatchKit.js');
t('the retry never selects password_hash', !/password_hash|\*/.test(KIT_ROW_COLUMNS));

// ── 6. WIRING ───────────────────────────────────────────────────────────────
const fulfill = read('lib/fulfillOrder.js');
// INJECTION: remove the dispatchKit call from fulfillOrder -> FAILS.
t('a paid kit order is dispatched from the Stripe webhook path', /isKitState\(stateCode\)/.test(fulfill) && /await dispatchKit\(order,/.test(fulfill) && /kit_order: kitOrder/.test(fulfill));
t('kit orders never start as awaiting_signature', /!isKit \? ORDER_STATUS\.AWAITING_SIGNATURE/.test(fulfill));
t('the hourly cron retries kits', /dispatchQueuedKits\(/.test(read('pages/api/cron/process-queued-orders.js')));
t('kit_order is a listed orders column', /'kit_order'/.test(read('lib/orderColumns.js')) && existsSync(new URL('../scripts/migrations/2026-10-14-kit-order.sql', import.meta.url)));
// The look-alike Georgia form route is gone, and nothing may call it.
// INJECTION: restore pages/api/generate-pt311a.js or its fetch in apply.js -> FAILS.
t('the look-alike PT-311A route is deleted', !existsSync(new URL('../pages/api/generate-pt311a.js', import.meta.url)));
t('the apply flow no longer calls it', !/fetch\(\s*["']\/api\/generate-pt311a/.test(read('pages/apply.js')));
t('a Georgia order cannot fall through to the generic letter', /stateCode === 'GA'\) \{[\s\S]{0,1500}throw new Error\(/.test(read('pages/apply.js')));
const tpl = await import('../pages/api/email-templates.js');
const kitReceipt = tpl.confirmationEmailTemplate({ firstName: 'Pat', lastName: 'Owner', address: 'x', county: 'Gwinnett', stateCode: 'GA', orderStatus: 'kit_queued' });
const presaleReceipt = tpl.confirmationEmailTemplate({ firstName: 'Pat', lastName: 'Owner', address: 'x', county: 'Gwinnett', stateCode: 'GA', orderStatus: 'awaiting_notice' });
t('the kit receipt never claims filing or certified mail', !/has been filed|certified mail|we mail it to the|is on its way to the/i.test(kitReceipt) && /we do not file your appeal/i.test(kitReceipt));
t('the pre-sale receipt promises the refund if the case no longer holds', /refund you in full before anything is mailed/.test(presaleReceipt) && !/has been filed/i.test(presaleReceipt));

console.log(`verify-kit-dispatch: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
