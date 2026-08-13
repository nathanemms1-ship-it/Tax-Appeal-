#!/usr/bin/env node
/**
 * THE FLORIDA CHEQUE PAYLOAD, ASSERTED OFFLINE.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * checkout -> Stripe webhook -> order row -> signature -> Lob is the only path in
 * the system that has never run end to end. Everything downstream of `if (isFL)` in
 * pages/api/send-letter.js is therefore unexercised code that will first execute
 * against a real bank account, a real county, and a real 25-day receipt deadline.
 *
 * Three of the bugs already found in that block were not crashes. They were a
 * correctly-formed cheque with the wrong content:
 *   - payable to the PROPERTY APPRAISER rather than the Clerk of the VAB, so the
 *     county could not deposit it;
 *   - the PETITION addressed to the property appraiser too, which is not a filed
 *     petition — it bounces and the window closes;
 *   - a guessed filing fee for counties whose fee was never confirmed.
 *
 * None of those would fail a build, a type check, or a smoke test. They need
 * assertions about the VALUES in the payload, which is what this file is.
 *
 * ============================================================================
 * HOW
 * ============================================================================
 * global.fetch is replaced so the Lob call is intercepted rather than sent. That
 * means the real handler runs — the real gates, the real table lookups, the real
 * memo builder — and we inspect exactly what WOULD have gone to api.lob.com.
 * Nothing is mailed, no key is needed, and it costs nothing, so it can run on every
 * build forever.
 *
 * This does NOT replace the live test purchase. It cannot tell you whether Lob
 * ACCEPTS the payload — whether a 40-character memo is within its limit, or whether
 * a first-class cheque comes back with a tracking number. Those need Lob to answer.
 * What this does is make sure that when you spend an evening on the live test, you
 * are testing Lob's behaviour rather than rediscovering our own bugs.
 */

import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} (got: ${JSON.stringify(got)})`));

// send-letter fails CLOSED without this, which is correct and also means the
// handler would refuse every case below. A dummy value is enough — nothing leaves.
process.env.INTERNAL_API_SECRET = 'verify-fl-dispatch-internal-secret';
process.env.LOB_API_KEY = 'test_verify_fl_dispatch';
process.env.LOB_BANK_ACCOUNT_ID = 'bank_verifyfldispatch';

const { default: handler } = await import('../pages/api/send-letter.js');
const { getFlVabFee } = await import('../lib/flCountyFees.js');
const { getFlVabAddress } = await import('../lib/flVabAddresses.js');

// ── Lob interception ──────────────────────────────────────────────────────────
const realFetch = global.fetch;
let captured = null;

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.lob.com')) {
    captured = { url: u, body: JSON.parse(opts.body || '{}'), auth: opts.headers?.Authorization || '' };
    // Shaped like a real Lob check response so the handler's own read of
    // tracking_number / expected_delivery_date / url exercises its real branches.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chk_verify_fl_dispatch',
        status: 'processed',
        tracking_number: null,
        expected_delivery_date: '2026-09-02',
        url: 'https://lob-assets.example/chk_verify_fl_dispatch.pdf',
      }),
    };
  }
  // Redis, Supabase, anything else: refuse loudly rather than reach the network.
  throw new Error(`unexpected outbound call in verify-fl-dispatch: ${u}`);
};

function mockRes() {
  const r = { statusCode: null, payload: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.send = (p) => { r.payload = p; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  return r;
}

/**
 * A REALISTICALLY SIZED PETITION.
 *
 * The previous fixture was one line of HTML, and that is precisely why this suite
 * passed on 5 Aug while Lob rejected every real Florida cheque. It asserted the
 * payload was CORRECT and never that it was ACCEPTABLE. A measured DR-486 is 14,625
 * characters; Lob's inline-HTML ceiling is 10,000.
 *
 * Lesson worth keeping: a fixture must be the SIZE of real data, not merely the
 * SHAPE of it.
 */
const REAL_SIZE_PETITION =
  '<html><body><h1>DR-486 PETITION BODY</h1>' +
  '<p>Part 3 attestation and evidence paragraph, repeated to real length.</p>'.repeat(200) +
  '</body></html>';

/** A body shaped like what lib/processOrder.js actually posts for a FL order. */
function flBody(over = {}) {
  return {
    isFL: true,
    stateCode: 'FL',
    county: 'Broward',
    parcelId: '504128010340',
    ownerName: 'Maria Delgado',
    ownerStreet: '1130 Glenwood Ct',
    ownerCity: 'Weston',
    ownerState: 'FL',
    ownerZip: '33326',
    ownerEmail: 'owner@example.com',
    propertyAddress: '1130 Glenwood Ct, Weston, FL 33326',
    letterContent: REAL_SIZE_PETITION,
    ownerSignatureName: 'Maria Delgado',
    ownerSignatureDate: '2026-08-24',
    signedAt: '2026-08-24T14:02:00.000Z',
    // Deliberately wrong, and deliberately present: the handler must IGNORE
    // client-supplied payee/fee/address and derive all three server-side.
    districtName: 'Broward County Property Appraiser',
    districtAddress: '115 S Andrews Ave',
    vabFee: 999,
    vabPayableTo: 'Totally Wrong Payee',
    ...over,
  };
}

async function call(body, { authed = true } = {}) {
  captured = null;
  const req = {
    method: 'POST',
    body,
    query: {},
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
      ...(authed ? { 'x-internal-secret': process.env.INTERNAL_API_SECRET } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = mockRes();
  await handler(req, res);
  return { res, sent: captured };
}

// ── 1. Authentication fails closed ────────────────────────────────────────────
// This endpoint writes real cheques from a real bank account. It was once
// unauthenticated with payee and amount taken from the request body.
{
  const { res, sent } = await call(flBody(), { authed: false });
  t('unauthenticated request is rejected', res.statusCode === 401, res.statusCode);
  t('unauthenticated request reaches no cheque', sent === null);
}

// ── 2. The happy path: every value derived server-side ────────────────────────
{
  const { res, sent } = await call(flBody());
  t('Broward cheque is created', res.statusCode === 200 && sent !== null, res.payload);

  if (sent) {
    const fee = getFlVabFee('Broward');
    const addr = getFlVabAddress('Broward');

    t('posts to the Lob CHECKS endpoint, not letters', sent.url === 'https://api.lob.com/v1/checks', sent.url);

    // Payee. The bug was making it out to the property appraiser, whose name
    // arrives in the request body — so this asserts both halves.
    t('payee is the VAB from our table', sent.body.to?.name === fee.payableTo, sent.body.to?.name);
    t('payee is NOT the client-supplied districtName', sent.body.to?.name !== 'Broward County Property Appraiser');
    t('payee is NOT the client-supplied vabPayableTo', sent.body.to?.name !== 'Totally Wrong Payee');

    // Destination. A petition delivered to the property appraiser is not filed.
    t('street is the verified VAB street', sent.body.to?.address_line1 === addr.street, sent.body.to?.address_line1);
    t('city/state/zip come from the verified table',
      sent.body.to?.address_city === addr.city && sent.body.to?.address_state === addr.state && sent.body.to?.address_zip === addr.zip);

    // Amount. Client sent 999; the table says otherwise.
    t('amount is the table fee in dollars', sent.body.amount === fee.vabFee / 100, sent.body.amount);
    t('amount ignores the client-supplied vabFee', sent.body.amount !== 999);

    // Mail class. Lob's check product does not offer certified, and the site copy
    // is scoped to say "tracked first class" for FL and "certified" elsewhere.
    t('mail_type is usps_first_class', sent.body.mail_type === 'usps_first_class', sent.body.mail_type);
    t('no extra_service on a cheque (certified is not offered)', sent.body.extra_service === undefined);

    // ---- The inline-HTML ceiling. This is the assertion that was missing. ----
    // Lob: "HTML must be less than 10000 characters (to use longer HTML, pass a
    // remote URL)". The petition therefore cannot travel in `attachment`; it goes in
    // merge_variables, with a small placeholder wrapper in its place.
    t('the fixture petition is actually over the inline limit (or this test proves nothing)',
      REAL_SIZE_PETITION.length > 10000, REAL_SIZE_PETITION.length);
    t('attachment is under Lob\'s 10,000-character inline HTML limit',
      String(sent.body.attachment || '').length < 10000, String(sent.body.attachment || '').length);
    t('attachment carries the merge placeholder',
      String(sent.body.attachment || '').includes('{{letter_content}}'));
    t('the DR-486 rides in merge_variables',
      String(sent.body.merge_variables?.letter_content || '').includes('DR-486 PETITION BODY'));
    t('merge_variables carries the WHOLE petition, not a truncation',
      sent.body.merge_variables?.letter_content === REAL_SIZE_PETITION,
      String(sent.body.merge_variables?.letter_content || '').length);
    t('the full petition is NOT duplicated into attachment',
      !String(sent.body.attachment || '').includes('Part 3 attestation'));

    // Drawn on the right account. Undefined here is a silent Lob rejection.
    t('bank_account is set', !!sent.body.bank_account, sent.body.bank_account);

    // Memo carries the parcel so the county can match cheque to petition.
    t('memo contains the parcel number', String(sent.body.memo).includes('504128010340'), sent.body.memo);
    t('memo is within 40 characters', String(sent.body.memo).length <= 40, String(sent.body.memo).length);

    // Metadata is what lob-webhook.js keys delivery events off.
    t('metadata carries state_code FL', sent.body.metadata?.state_code === 'FL');
    t('metadata carries the county', sent.body.metadata?.county === 'Broward');
  }
}

// ── 3. Memo fallback when the county publishes no parcel number ───────────────
{
  const { sent } = await call(flBody({ parcelId: '' }));
  t('no parcel: memo still built', !!sent?.body?.memo, sent?.body?.memo);
  t('no parcel: memo falls back to the owner surname', String(sent?.body?.memo || '').includes('Delgado'), sent?.body?.memo);
  t('no parcel: memo still within 40 characters', String(sent?.body?.memo || '').length <= 40);
}

// ── 4. The two refusal gates ──────────────────────────────────────────────────
// Both must refuse BEFORE any cheque exists. A refusal that still writes a cheque
// is worse than no gate at all.
{
  // Fee estimated, address confirmed. Guessing costs either a rejected petition
  // (underpaid) or refund friction (overpaid).
  //
  // THE COUNTY IS CHOSEN AT RUN TIME, NOT TYPED. This was hardcoded to Nassau, and on
  // 13 Aug 2026 Nathan got Nassau's fee confirmed on the phone — which is the outcome
  // the whole call sheet exists to produce — and three tests went red for the best
  // possible reason. A fixture that breaks every time the business succeeds trains
  // people to edit the test, and the edit they reach for first is deleting it.
  //
  // If NO county is left in this state, the gate cannot be exercised at all. That must
  // fail loudly: a suite that quietly stops testing a refusal path looks identical to a
  // suite where the refusal path works.
  const { FL_COUNTY_NAMES } = await import('../lib/flVabAddresses.js');
  const feeUnconfirmed = FL_COUNTY_NAMES.find(
    (c) => getFlVabAddress(c) && getFlVabFee(c)?.confidence !== 'confirmed'
  );
  t('a county with a confirmed address and an unguessed fee still exists to test with',
    !!feeUnconfirmed,
    feeUnconfirmed || 'none — every county with an address now has a confirmed fee, so this gate is untested');

  if (feeUnconfirmed) {
    const { res, sent } = await call(flBody({ county: feeUnconfirmed, parcelId: '11223344' }));
    t(`${feeUnconfirmed} (fee unconfirmed) is refused`, res.statusCode === 400, res.statusCode);
    t(`${feeUnconfirmed} refusal names the fee gate`, res.payload?.code === 'FL_FEE_UNCONFIRMED', res.payload?.code);
    t(`${feeUnconfirmed} reaches no cheque`, sent === null);
  }
}
{
  // Address unconfirmed. getFlVabAddress returns null for these, which is the check
  // send-letter actually performs.
  //
  // The county is CHOSEN AT RUNTIME rather than hardcoded. This assertion originally
  // named Sarasota, and broke the moment Sarasota was confirmed by phone on 6 Aug —
  // a passing test failing because the business got better at its job. As the call
  // list is worked through, any hardcoded example here will rot the same way.
  const { getFlVabAddressRaw, FL_COUNTY_NAMES } = await import('../lib/flVabAddresses.js');
  const unconfirmed = FL_COUNTY_NAMES.find((c) => {
    const raw = getFlVabAddressRaw(c);
    return raw && raw.confidence !== 'confirmed';
  });

  if (!unconfirmed) {
    // All 67 confirmed — the goal. The gate still has to exist, so prove it with a
    // county that cannot be in the table at all.
    t('every county is confirmed; gate proven via an unknown county instead', true);
  } else {
    const { res, sent } = await call(flBody({ county: unconfirmed, parcelId: '99887766' }));
    t(`${unconfirmed} (address unconfirmed) is refused`, res.statusCode === 400, res.statusCode);
    t(`${unconfirmed} refusal names the county gate`, res.payload?.code === 'FL_COUNTY_UNSUPPORTED', res.payload?.code);
    t(`${unconfirmed} reaches no cheque`, sent === null);
  }
}
{
  const { res, sent } = await call(flBody({ county: 'Notarealcounty' }));
  t('unknown county is refused', res.statusCode === 400, res.statusCode);
  t('unknown county reaches no cheque', sent === null);
}

// ── 5. Nothing mails without the owner's signature ────────────────────────────
// The whole legal posture is that the owner signs personally under s. 194.011(3).
{
  const { res, sent } = await call(flBody({ signedAt: undefined, ownerSignatureName: undefined }));
  t('unsigned petition is refused', res.statusCode === 400, res.statusCode);
  t('unsigned petition reaches no cheque', sent === null);
}

// ── 6. Every sellable county resolves to a complete, mailable payload ─────────
// Not a sample — all of them. A missing zip or a blank payee in one county is a
// deadline lost for whoever lives there, and it would surface on the day.
{
  const { FL_COUNTY_NAMES } = await import('../lib/flVabAddresses.js');
  const names = Array.isArray(FL_COUNTY_NAMES) ? FL_COUNTY_NAMES : [];
  t('the 67-county list is available', names.length === 67, names.length);

  let sellable = 0;
  const broken = [];
  for (const county of names) {
    const addr = getFlVabAddress(county);
    const fee = getFlVabFee(county);
    if (!addr || !fee || fee.confidence !== 'confirmed') continue;
    sellable++;
    if (!fee.payableTo || !addr.street || !addr.city || !addr.state || !/^\d{5}(-\d{4})?$/.test(String(addr.zip))) {
      broken.push(county);
    }
    if (!(fee.vabFee > 0 && fee.vabFee <= 10000)) broken.push(`${county} (fee ${fee.vabFee})`);
  }
  t('every sellable county has a complete, plausible mailing target', broken.length === 0, broken);
  // Informational, and a tripwire: if this number moves, someone changed a
  // confidence flag, and that should be a deliberate act with a phone call behind it.
  console.log(`  ${sellable} of 67 counties currently sellable (confirmed fee AND confirmed address)`);
  t('at least 50 counties are sellable', sellable >= 50, sellable);
  t('the sellable count has not gone BACKWARDS since 6 Aug', sellable >= 56, sellable);
}

global.fetch = realFetch;

if (failures.length) {
  console.error(`verify-fl-dispatch: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-fl-dispatch: ${pass} passed — the Florida cheque payload is correct before Lob ever sees it`);
