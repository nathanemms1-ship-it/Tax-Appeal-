#!/usr/bin/env node
/**
 * THE TEN-MINUTE SIGNATURE REMINDER, ASSERTED OFFLINE.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * Until 25 Aug 2026 the "please sign your petition" email was sent by
 * lib/fulfillOrder.js at the instant Stripe confirmed payment — while the
 * customer was being redirected to /success, which IS the signing page. It
 * therefore reached people who were already looking at the page it was telling
 * them to visit, worded as though they had failed to. The first paying customer
 * had it sitting in her inbox saying "one step left" after she had signed.
 *
 * It now goes out from pages/api/cron/signature-reminder.js, ten minutes later,
 * only to people who genuinely have not signed. The whole value of that change
 * lives in a WHERE clause, so the WHERE clause is what this file asserts.
 *
 * ============================================================================
 * HOW
 * ============================================================================
 * global.fetch is replaced, so the real @supabase/supabase-js client builds a
 * real PostgREST URL and we read the filters off it. The real handler runs — real
 * auth, real selection, real stamping — and nothing leaves the process.
 *
 * EXECUTED, NOT MATCHED. Asserting a query by grepping the source for '.eq(' is
 * how this codebase has repeatedly proven a property of its own documentation
 * rather than its code.
 */
import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} (got: ${JSON.stringify(got)})`));

process.env.CRON_SECRET = 'verify-signature-reminder-secret';
process.env.INTERNAL_API_SECRET = 'verify-internal';
process.env.SUPABASE_URL = 'https://stub.supabase.invalid';
process.env.SUPABASE_SERVICE_KEY = 'stub-key';
process.env.NEXT_PUBLIC_BASE_URL = 'https://www.taxappealusa.example';

const { default: handler } = await import('../pages/api/cron/signature-reminder.js');

function mockRes() {
  const r = { statusCode: null, payload: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.end = () => r;
  r.setHeader = () => r;
  return r;
}

const realFetch = global.fetch;

/**
 * @param rows      what the SELECT returns
 * @param opts.selectError  PostgREST error to return instead of rows
 * @param opts.emailStatus  HTTP status for the send-email call
 */
async function run(rows, opts = {}) {
  const calls = { selectUrls: [], emails: [], patches: [], heartbeats: 0 };

  // supabase-js reads response.headers.get(...), so a bare object is not enough of
  // a Response to fool it.
  const hdrs = (extra = {}) => ({ get: (k) => ({ 'content-type': 'application/json', ...extra }[String(k).toLowerCase()] ?? null) });

  global.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();

    if (u.includes('/api/send-email')) {
      calls.emails.push(JSON.parse(init.body || '{}'));
      return { ok: (opts.emailStatus || 200) < 400, status: opts.emailStatus || 200, headers: hdrs(), json: async () => ({ ok: true }), text: async () => '{}' };
    }
    if (u.includes('stub.supabase.invalid')) {
      if (method === 'PATCH') {
        calls.patches.push({ url: u, body: JSON.parse(init.body || '{}') });
        return { ok: true, status: 204, headers: hdrs(), text: async () => '', json: async () => [] };
      }
      if (u.includes('/rest/v1/orders')) {
        calls.selectUrls.push(u);
        if (opts.selectError) {
          return {
            ok: false, status: 400, headers: hdrs(),
            text: async () => JSON.stringify(opts.selectError),
            json: async () => opts.selectError,
          };
        }
        return { ok: true, status: 200, headers: hdrs(), text: async () => JSON.stringify(rows), json: async () => rows };
      }
      // heartbeat or anything else on Supabase
      calls.heartbeats++;
      return { ok: true, status: 200, headers: hdrs(), text: async () => '[]', json: async () => [] };
    }
    throw new Error(`unexpected outbound call: ${u}`);
  };

  const req = { method: 'GET', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, body: {}, query: {} };
  const res = mockRes();
  try {
    await handler(req, res);
  } finally {
    global.fetch = realFetch;
  }
  return { res, calls };
}

const unsigned = {
  id: 'ord_unsigned',
  customer_name: 'Raquel Zapata',
  customer_email: 'raquel@example.com',
  property_address: '4401 579 HWY, Seffner, FL 33584',
  county: 'Hillsborough County',
  state_code: 'FL',
  amount_paid: 13900,
  vab_fee: 5000,
  stripe_session_id: 'cs_live_abc',
  created_at: '2026-08-25T10:00:00Z',
};

// ── 1. Auth fails closed ─────────────────────────────────────────────────────
{
  global.fetch = async () => { throw new Error('must not reach the network'); };
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, body: {}, query: {} }, res);
  global.fetch = realFetch;
  t('an unauthenticated cron invocation is rejected', res.statusCode === 401, res.statusCode);
}

// ── 2. The WHERE clause is the product ───────────────────────────────────────
{
  const { calls } = await run([]);
  const url = decodeURIComponent(calls.selectUrls[0] || '');

  t('it selects orders', /\/rest\/v1\/orders/.test(url), url);
  t('only awaiting_signature', /dispute_status=eq\.awaiting_signature/.test(url), url);
  t('only paid orders', /payment_status=eq\.paid/.test(url), url);
  t('only ones created before a cutoff', /created_at=lt\./.test(url), url);
  t('only ones not already reminded', /signature_reminder_sent_at=is\.null/.test(url), url);
  /**
   * AND ONLY ONES WITH NO SIGNATURE ON FILE.
   *
   * dispute_status is a proxy for "has not signed" and it can lag the fact:
   * finalize-order writes signed_at, THEN calls attemptMail to advance the row.
   * If attemptMail throws — Lob down, DR-486 regeneration failed, the address bug
   * that hit the first paying customer this morning — the signature is saved and
   * the status is not, and the row sits in awaiting_signature. On the status
   * filter alone, that customer is told ten minutes later that they have not
   * signed, when they have, while their order is already in trouble.
   */
  t('only ones with no signature on file', /signed_at=is\.null/.test(url), url);

  // THE TEN MINUTES, read off the URL rather than trusted from the constant.
  const m = url.match(/created_at=lt\.([^&]+)/);
  const cutoff = m ? new Date(m[1]).getTime() : NaN;
  const ago = (Date.now() - cutoff) / 60000;
  t('the cutoff is ten minutes ago, not zero and not an hour', ago > 9.5 && ago < 10.5, ago);

  // A cap, so a backlog cannot become a mail storm.
  t('the run is bounded', /limit=\d+/.test(url), url);
}

// ── 3. An unsigned order is emailed, with a working link, and stamped ────────
{
  const { res, calls } = await run([unsigned]);
  t('the run succeeds', res.statusCode === 200, res.payload);
  t('exactly one email is sent', calls.emails.length === 1, calls.emails.length);

  const mail = calls.emails[0] || {};
  t('it goes to the customer', mail.to === 'raquel@example.com', mail.to);
  t('it uses the REMINDER copy, not the payment receipt', mail.orderStatus === 'signature_reminder', mail.orderStatus);
  /**
   * The link is the entire point. The email this replaces said "use the link from
   * your confirmation page, or reply to this email and we will resend it" — to a
   * person whose defining characteristic is that the page is gone.
   */
  t('it carries a signing link', typeof mail.signingUrl === 'string' && mail.signingUrl.includes('/success?session_id='), mail.signingUrl);
  t('the link points at THIS order\'s session', (mail.signingUrl || '').includes('cs_live_abc'), mail.signingUrl);

  t('the order is stamped after sending', calls.patches.length === 1, calls.patches.length);
  t('the stamp is the reminder column and nothing else',
    calls.patches[0] && Object.keys(calls.patches[0].body).join() === 'signature_reminder_sent_at',
    calls.patches[0] && calls.patches[0].body);
  t('the stamp targets that order', (calls.patches[0]?.url || '').includes('ord_unsigned'), calls.patches[0]?.url);
}

// ── 4. Exactly once ──────────────────────────────────────────────────────────
/**
 * The first version of this block called run([]) and asserted no email was sent.
 * That passes whatever the code does — an empty result set produces no email by
 * arithmetic, not by correctness. It is precisely the "assertion on a case that
 * cannot fail" that let the Lob address bug survive 48 checks on 25 Aug.
 *
 * Idempotence here is the WHERE clause, which §2 asserts is present, plus the
 * stamp, which §3 asserts is written. What is left to prove is that the stamp
 * the handler writes is the value that clause filters on — that the two halves
 * refer to the same column. A test that reads one and not the other would pass
 * with the handler stamping a column nothing selects on.
 */
{
  const { calls } = await run([unsigned]);
  const selectUrl = decodeURIComponent(calls.selectUrls[0] || '');
  const stampedColumn = Object.keys(calls.patches[0]?.body || {})[0];
  t('the column the handler stamps is the column the query filters on',
    !!stampedColumn && selectUrl.includes(`${stampedColumn}=is.null`),
    { stampedColumn, filtered: /signature_reminder_sent_at=is\.null/.test(selectUrl) });
}

// ── 5. A failed send must NOT stamp ──────────────────────────────────────────
// Stamping first would let one transient mail failure permanently suppress the
// reminder for that customer — worse than sending twice.
{
  const { res, calls } = await run([unsigned], { emailStatus: 500 });
  t('a failed send leaves the order unstamped', calls.patches.length === 0, calls.patches.length);
  t('and the run still returns 200 rather than failing the cron', res.statusCode === 200, res.statusCode);
  t('and it reports the failure', (res.payload?.failures || []).length === 1, res.payload);
}

// ── 6. Missing column: a deploy may land before the migration ────────────────
{
  const { res, calls } = await run([], { selectError: { code: '42703', message: 'column orders.signature_reminder_sent_at does not exist' } });
  t('a missing column does not fail the cron', res.statusCode === 200, res.statusCode);
  t('it reports the migration as pending', res.payload?.skipped === 'migration_pending', res.payload);
  t('and it sends nothing', calls.emails.length === 0, calls.emails.length);
}

// ── 6b. The PAYMENT receipt must not ask for a signature ─────────────────────
/**
 * Nathan, 25 Aug: "They sign the petition on the web page after purchase. They
 * don't need to sign again when they get the receipt."
 *
 * Right, and the first version of this fix got it wrong — it kept a "Sign my
 * petition" button on the receipt for the closed-tab case, which is the same
 * nudge at the same wrong moment and is redundant with the reminder below it.
 *
 * Asserted on the RENDERED email, because that is where a stray ctaLabel or a
 * leaked signingUrl would actually show up.
 */
{
  const { confirmationEmailTemplate, confirmationSubject } = await import('../pages/api/email-templates.js');
  const base = {
    firstName: 'Raquel', lastName: 'Zapata', address: '4401 579 HWY, Seffner, FL 33584',
    county: 'Hillsborough County', sessionId: 'cs_live_abc', amountPaid: 13900,
    stateCode: 'FL', vabFee: 5000,
  };

  // The receipt, rendered exactly as fulfillOrder sends it: no signingUrl.
  const receipt = confirmationEmailTemplate({ ...base, orderStatus: 'awaiting_signature' });
  t('the payment receipt has no signing button', !/Sign my/i.test(receipt), (receipt.match(/Sign my[^<]*/) || [])[0]);
  t('the payment receipt leaks no session link', !receipt.includes('session_id='), true);
  t('its subject does not ask for a signature', !/sign/i.test(confirmationSubject({ stateCode: 'FL', orderStatus: 'awaiting_signature' })),
    confirmationSubject({ stateCode: 'FL', orderStatus: 'awaiting_signature' }));

  // Even if a caller passes one, the receipt must not render a button — the
  // absence of ctaLabel is what governs, not the absence of a URL.
  const receiptWithUrl = confirmationEmailTemplate({ ...base, orderStatus: 'awaiting_signature', signingUrl: 'https://x.example/success?session_id=cs_live_abc' });
  t('and it stays button-free even if a signingUrl is handed to it', !/Sign my/i.test(receiptWithUrl));

  // The reminder is the one that asks, and it must have the button.
  const reminder = confirmationEmailTemplate({ ...base, orderStatus: 'signature_reminder', signingUrl: 'https://x.example/success?session_id=cs_live_abc' });
  t('the ten-minute reminder DOES carry a signing button', /Sign my/i.test(reminder));
  t('and its button points at the signing page', reminder.includes('success?session_id=cs_live_abc'));
}

// ── 7. Orders with nothing to link to are skipped, not half-mailed ───────────
{
  const { calls } = await run([{ ...unsigned, stripe_session_id: null }]);
  t('an order with no session id is skipped rather than emailed without a link', calls.emails.length === 0, calls.emails.length);
}
{
  const { calls } = await run([{ ...unsigned, customer_email: null }]);
  t('an order with no email address is skipped', calls.emails.length === 0, calls.emails.length);
}

if (failures.length) {
  console.error(`verify-signature-reminder: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-signature-reminder: ${pass} passed — the reminder goes only to people who really have not signed, once, with a link`);
