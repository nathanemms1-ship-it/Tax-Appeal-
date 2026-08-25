#!/usr/bin/env node
/**
 * THE OTHER HALF OF THE ARKANSAS/ALABAMA CAPTURE: DOES THE EMAIL EVER ARRIVE,
 * AND DOES IT ARRIVE ON THE RIGHT DAY?
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * The /arkansas and /alabama pages now collect an email and a property address
 * against a season we open in 2027. Collecting that is worth nothing on its own —
 * the promise is "we will email you the day filing opens", and the only thing
 * that can keep it is pages/api/cron/notify-waitlist.js.
 *
 * Two defects in that file would have broken the promise, both found on 25 Aug
 * 2026 while wiring the capture up:
 *
 *   1. `const stateNames = { TX, GA, FL }` — a fifth hand-written copy of the
 *      five-state name map, missing the exact two states this feature is for. It
 *      degrades silently (`stateNames[state] || state`), so the email queued for
 *      an Arkansas homeowner read "Your AR filing window just opened" and headed
 *      itself "Benton County, AR".
 *
 *   2. The send is gated on the state's FILING WINDOW and nothing else. Rows are
 *      stamped `filing_year` by waitlistFilingYear() at write time, which is
 *      correct — but only at write time. If Arkansas is not ready in 2027 and
 *      SERVING_FROM.AR moves to 2028, every row already stamped 2027 stays
 *      stamped 2027, and on 1 June 2027 this cron would send "🎉 Your Arkansas
 *      filing window just opened — file today!" with a $89 button, to people
 *      pages/apply.js refuses at the state selector.
 *
 * That file argues the point itself, twice, about county-blocked rows: an email
 * somebody ACTS on and is then refused is worse than no email at all.
 *
 * ============================================================================
 * HOW IT IS TESTED, AND WHY NOT WITH A DATE
 * ============================================================================
 * The new gate sits AFTER the window check, so reaching it needs a state whose
 * window is open today. Arkansas's closed on 10 August, so an Arkansas row is
 * turned away by the window check and never exercises the thing under test — an
 * assertion on a case that cannot fail.
 *
 * getFilingWindowStatus() reads the real clock and takes no injection point, so
 * instead of faking the date this fakes the SERVABILITY: it puts FLORIDA — whose
 * window is open — into SERVING_FROM, and asserts the row is skipped. Then it
 * takes Florida back out and asserts the SAME row sends. Both directions, on the
 * real handler, with no case that passes vacuously.
 *
 * SERVING_FROM is a live module object and lib/stateService.js reads it per call,
 * which is what makes that possible. Mutating it here is deliberate; the process
 * exits immediately after.
 *
 * global.fetch is replaced, so the real Supabase client builds a real PostgREST
 * URL and the real Resend client builds a real send. The handler runs — real
 * auth, real branching, real stamping — and nothing leaves the process.
 */
import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} (got: ${JSON.stringify(got)})`));

process.env.CRON_SECRET = 'verify-waitlist-notify-secret';
process.env.INTERNAL_API_SECRET = 'verify-internal';
process.env.SUPABASE_URL = 'https://stub.supabase.invalid';
process.env.SUPABASE_SERVICE_KEY = 'stub-key';
process.env.RESEND_API_KEY = 're_stub';

const { SERVING_FROM, STATE_NAMES } = await import('../lib/stateService.js');
const { getFilingWindowStatus } = await import('../lib/filingWindows.js');
const { default: handler } = await import('../pages/api/cron/notify-waitlist.js');

function mockRes() {
  const r = { statusCode: null, payload: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.end = () => r;
  r.setHeader = () => r;
  return r;
}

const realFetch = global.fetch;
const realLog = console.log;

// supabase-js reads response.headers.get(...), so a bare object is not enough of
// a Response to fool it. Same helper as verify-signature-reminder.mjs, for the
// same reason.
const hdrs = () => ({ get: (k) => ({ 'content-type': 'application/json' }[String(k).toLowerCase()] ?? null) });

async function run(rows) {
  const calls = { emails: [], patches: [], inserts: [], deletes: [] };

  global.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();

    if (u.includes('resend')) {
      calls.emails.push(JSON.parse(init.body || '{}'));
      return new Response(JSON.stringify({ id: 'em_stub' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/rest/v1/waitlist')) {
      if (method === 'PATCH') { calls.patches.push({ url: u, body: JSON.parse(init.body || '{}') }); return { ok: true, status: 200, headers: hdrs(), text: async () => '[]' }; }
      if (method === 'POST') { calls.inserts.push(JSON.parse(init.body || '{}')); return { ok: true, status: 201, headers: hdrs(), text: async () => '[]' }; }
      if (method === 'DELETE') { calls.deletes.push(u); return { ok: true, status: 200, headers: hdrs(), text: async () => '[]' }; }
      return { ok: true, status: 200, headers: hdrs(), text: async () => JSON.stringify(rows) };
    }
    if (u.includes('/rest/v1/orders')) {
      return { ok: true, status: 200, headers: hdrs(), text: async () => '[]' };
    }
    return { ok: true, status: 200, headers: hdrs(), text: async () => '[]' };
  };

  const res = mockRes();
  console.log = () => {};
  try {
    await handler({ method: 'GET', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, query: {} }, res);
  } finally {
    console.log = realLog;
    global.fetch = realFetch;
  }
  return { res, calls };
}

const year = new Date().getFullYear();
const row = (over = {}) => ({
  id: 'wl_1',
  email: 'homeowner@example.com',
  name: 'Dana Reed',
  state: 'FL',
  county: 'Alachua',
  property_address: '412 NW 8th Ave, Gainesville, FL 32601',
  filing_year: year,
  notified_count: 0,
  notified: false,
  last_notified_at: null,
  blocked_reason: null,
  ...over,
});

// ---------------------------------------------------------------------------
// The premise this whole file rests on. If Florida's window is not open today,
// every assertion below is about a row the handler discards for an unrelated
// reason, and they would all "pass".
// ---------------------------------------------------------------------------
const flWindow = getFilingWindowStatus('FL', 'Alachua', { strict: true });
t('the control state\'s filing window is genuinely open today — otherwise nothing below is a test',
  !!flWindow?.isOpen, { isOpen: flWindow?.isOpen });
t('Florida is servable to begin with', !SERVING_FROM.FL, SERVING_FROM.FL);

// ---------------------------------------------------------------------------
// A. SERVABLE + WINDOW OPEN -> the email goes.
// ---------------------------------------------------------------------------
{
  const { res, calls } = await run([row()]);
  t('a servable state with an open window sends', calls.emails.length === 1, { sent: calls.emails.length, payload: res.payload });
  t('the send is stamped so it cannot repeat today', calls.patches.some((p) => p.body?.last_notified_at));
  const html = calls.emails[0]?.html || '';
  t('the email carries the property address it was given',
    html.includes('412 NW 8th Ave, Gainesville, FL 32601'),
    'cron/notify-waitlist renders a "Your Property" panel — the address captured on the state pages is what fills it');
  t('the email names the state in words, not its code',
    html.includes('Florida') && !/\bFL filing window\b/.test(html));
}

// ---------------------------------------------------------------------------
// B. THE SAME ROW, SAME OPEN WINDOW, STATE NOT SERVABLE -> silence.
//
// This is the assertion that did not exist before 25 Aug 2026. Without it the
// handler sends purely on the window, and a season we have not opened looks
// exactly like one we have.
// ---------------------------------------------------------------------------
{
  SERVING_FROM.FL = year + 1;
  const { calls } = await run([row()]);
  delete SERVING_FROM.FL;

  t('an open window in a state we do not file in sends NOTHING',
    calls.emails.length === 0,
    { sent: calls.emails.length });
  t('and does not stamp the row, so it is still there when we are ready',
    calls.patches.length === 0);
  t('and does not delete or re-enrol it either',
    calls.deletes.length === 0 && calls.inserts.length === 0);
}

// ---------------------------------------------------------------------------
// C. The gate restores itself. A test that leaves SERVING_FROM mutated would
//    make every later assertion in this process meaningless.
// ---------------------------------------------------------------------------
{
  t('Florida is servable again after the injection', !SERVING_FROM.FL, SERVING_FROM.FL);
  const { calls } = await run([row()]);
  t('and the same row sends again once it is', calls.emails.length === 1, { sent: calls.emails.length });
}

// ---------------------------------------------------------------------------
// D. The name map. `stateNames[state] || state` degraded to the raw code for the
//    two states the capture forms exist for, and did it silently.
// ---------------------------------------------------------------------------
{
  for (const code of Object.keys(SERVING_FROM)) {
    t(`STATE_NAMES has a real name for ${code} — the state the waitlist is FOR`,
      typeof STATE_NAMES[code] === 'string' && STATE_NAMES[code].length > 2 && STATE_NAMES[code] !== code,
      STATE_NAMES[code]);
  }
  const src = (await import('node:fs')).readFileSync('pages/api/cron/notify-waitlist.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  t('notify-waitlist keeps no local copy of the state-name map',
    !/stateNames\s*=\s*\{/.test(src),
    'it had one, and it was missing AR and AL');
  t('notify-waitlist reads STATE_NAMES from lib/stateService', /STATE_NAMES/.test(src));
  t('notify-waitlist gates the generic send on servability, not only the window',
    /isStateServable\(/.test(src));
}

// ---------------------------------------------------------------------------
// E. The capture form sends what the email needs. The address field is the whole
//    point of the change; a form that collects it and drops it on the floor
//    would pass every assertion above.
// ---------------------------------------------------------------------------
{
  const notice = (await import('node:fs')).readFileSync('components/SeasonNotice.js', 'utf8');
  t('SeasonNotice posts propertyAddress to /api/join-waitlist',
    /propertyAddress:\s*property/.test(notice));
  t('SeasonNotice omits the address rather than posting an empty one',
    /\.\.\.\(property \? \{ propertyAddress: property \} : \{\}\)/.test(notice),
    'an empty string would overwrite an address an earlier signup already gave us');
  t('SeasonNotice renders an address field', /id=\{`\$\{id\}-address`\}/.test(notice));
  t('the address field lets the browser autofill it', /autoComplete="street-address"/.test(notice));

  const wl = (await import('node:fs')).readFileSync('pages/api/join-waitlist.js', 'utf8');
  t('join-waitlist accepts propertyAddress', /propertyAddress/.test(wl));
  t('join-waitlist stores it on the row', /property_address:\s*propertyAddress/.test(wl));
}

// ---------------------------------------------------------------------------
console.log(`\nverify-waitlist-notify: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('The promise made on the state pages is one this cron can keep.');
