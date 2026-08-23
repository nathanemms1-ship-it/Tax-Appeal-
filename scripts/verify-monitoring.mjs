#!/usr/bin/env node
/**
 * BEHAVIOURAL TESTS for the four monitoring gaps closed on 6 Aug 2026.
 *
 * Each of these guards a failure that is INVISIBLE by construction — the whole
 * point of the check is that nothing else in the system reports the condition. A
 * regression here therefore breaks nothing observable: the build passes, the
 * dashboard renders, the emails keep arriving, and the check silently stops
 * catching the thing it exists to catch. That is exactly the class of defect this
 * file has to cover, because no other test will.
 *
 * What is asserted:
 *   1. LOB_BANK_ACCOUNT_ID is in the required-env list at critical severity.
 *   2. checkSalesGate returns CRITICAL for the split-brain state specifically —
 *      public says open, server says closed — and not merely for "off".
 *   3. Heartbeat staleness thresholds exceed each job's schedule in vercel.json,
 *      so ordinary jitter cannot produce a false "cron is dead".
 *   4. The filing-deadline check treats `isOpen && !canFile` as the critical case,
 *      because that is the transition after which process-queued-orders stops
 *      selecting an order permanently and without logging anything.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

// healthChecks.js imports './spendGuard' without an extension, as the app does.
// Registered before any dynamic import below. See scripts/resolve-extensionless.mjs.
register('./resolve-extensionless.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0;
const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

// ── 1. LOB_BANK_ACCOUNT_ID is watched ─────────────────────────────────────────
// send-letter.js puts this straight into the Lob cheque payload. Unset, it becomes
// `bank_account: undefined`, Lob rejects, and no Florida petition mails.
const healthSrc = read('lib/healthChecks.js');
const sendLetterSrc = read('pages/api/send-letter.js');

t('send-letter still reads LOB_BANK_ACCOUNT_ID (if not, this check is stale)',
  sendLetterSrc.includes('process.env.LOB_BANK_ACCOUNT_ID'));
t('LOB_BANK_ACCOUNT_ID is in REQUIRED_ENV',
  healthSrc.includes("key: 'LOB_BANK_ACCOUNT_ID'"));
t('LOB_BANK_ACCOUNT_ID is critical, not warn',
  /LOB_BANK_ACCOUNT_ID'[^}]*sev: 'critical'/.test(healthSrc));

// ── 2. Sales gate, including split brain ──────────────────────────────────────
const { checkSalesGate } = await import('../lib/healthChecks.js');

const withEnv = (vals, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vals)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

const bothOn = withEnv({ SALES_ENABLED: 'true', NEXT_PUBLIC_SALES_ENABLED: 'true' }, checkSalesGate);
t('sales gate: both true -> ok', bothOn.status === 'ok');

// The dangerous one. Pages advertise, buttons say buy, checkout 503s, and
// process-queued-orders returns a green 200 while dispatching nothing.
const splitBrain = withEnv({ SALES_ENABLED: undefined, NEXT_PUBLIC_SALES_ENABLED: 'true' }, checkSalesGate);
t('sales gate: public on + server off -> CRITICAL', splitBrain.status === 'critical');
t('sales gate: split brain names the redeploy requirement',
  /REDEPLOY/i.test(splitBrain.detail));

// The loud one: banner is visible everywhere, so this costs sales, not filings.
const publicOff = withEnv({ SALES_ENABLED: 'true', NEXT_PUBLIC_SALES_ENABLED: undefined }, checkSalesGate);
t('sales gate: server on + public off -> warn', publicOff.status === 'warn');

const bothOff = withEnv({ SALES_ENABLED: undefined, NEXT_PUBLIC_SALES_ENABLED: undefined }, checkSalesGate);
t('sales gate: both off -> warn (deliberate pause is legitimate)', bothOff.status === 'warn');

// A literal 'true' is required — salesGate.js fails closed on anything else.
const typo = withEnv({ SALES_ENABLED: 'TRUE', NEXT_PUBLIC_SALES_ENABLED: 'TRUE' }, checkSalesGate);
t('sales gate: "TRUE" is not "true" — still reads as off', typo.status !== 'ok');

// ── 3. Heartbeat thresholds vs the real schedules ─────────────────────────────
const { HEARTBEAT_LIMITS } = await import('../lib/heartbeat.js');
const crons = JSON.parse(read('vercel.json')).crons;

const scheduleMinutes = (expr) => {
  // Only the two forms used here: "*/N * * * *" and "0 * * * *".
  const m = expr.match(/^\*\/(\d+) \* \* \* \*$/);
  if (m) return Number(m[1]);
  if (/^0 \* \* \* \*$/.test(expr)) return 60;
  return null;
};

for (const [name, limit] of Object.entries(HEARTBEAT_LIMITS)) {
  const cron = crons.find((c) => c.path.endsWith(`/${name}`));
  t(`heartbeat: ${name} still has a cron in vercel.json`, !!cron);
  if (!cron) continue;
  const every = scheduleMinutes(cron.schedule);
  t(`heartbeat: ${name} schedule is parseable`, every !== null);
  // Must exceed one interval, or ordinary jitter alarms. Must also exceed it by a
  // real margin — a full process-queued-orders run is capped at 300s by maxDuration.
  t(`heartbeat: ${name} warn threshold is beyond one interval`, limit.warnAfterMin > every);
  t(`heartbeat: ${name} critical threshold is beyond the warn threshold`,
    limit.criticalAfterMin > limit.warnAfterMin);
}

// A stamp must never be written when the run threw — a stale heartbeat IS the signal.
const pqoSrc = read('pages/api/cron/process-queued-orders.js');
const catchBlock = pqoSrc.slice(pqoSrc.lastIndexOf('} catch (err)'));
t('heartbeat: process-queued-orders does NOT stamp from its catch block',
  !catchBlock.includes('stampHeartbeat'));
t('heartbeat: process-queued-orders stamps on the sales-paused path',
  /sales_paused[\s\S]{0,400}stampHeartbeat|stampHeartbeat[\s\S]{0,200}sales_paused/.test(pqoSrc));

// ── 4. Filing deadlines: the permanent-skip transition ────────────────────────
// process-queued-orders gates on canFile === isOpen && !tooClose, and `continue`s
// without logging when it fails. Once tooClose flips, that order is never selected
// again — paid, queued, and in Florida unrecoverable because the deadline is receipt.
const cronSrc = read('pages/api/cron/process-queued-orders.js');
t('deadline check premise: the cron still gates on canFile',
  cronSrc.includes('windowStatus.canFile'));
// Pinned the literal `missed.length || urgent.length` at first, which broke the day a
// third bucket (stale — season closed) was ORed in between them, even though the thing
// being asserted was still true. Assert that `missed` reaches critical, not the exact
// shape of the expression around it.
t('deadline check treats window-open-but-not-fileable as critical',
  /!w\.canFile/.test(healthSrc) &&
  /if \([^)]*\bmissed\.length\b[^)]*\)\s*return result\('Filing deadlines', 'critical'/.test(healthSrc));
t('deadline check excludes reversed payments, matching the cron',
  /refunded[\s\S]{0,80}partially_refunded[\s\S]{0,80}disputed/.test(
    healthSrc.slice(healthSrc.indexOf('checkFilingDeadlines'))));

// All three new checks must actually be wired into runAllChecks, or they are inert.
const runAll = healthSrc.slice(healthSrc.indexOf('export async function runAllChecks'));
for (const fn of ['checkSalesGate', 'checkCronHeartbeat', 'checkFilingDeadlines']) {
  t(`runAllChecks includes ${fn}`, runAll.includes(fn));
}

// ── The receipt deadline buffer vs what Lob actually promises ────────────────
// A live Lob cheque on 6 Aug 2026 reported its own Expected Delivery Date Range as
// 7-14 DAYS from creation. Florida is satisfied by physical RECEIPT, so minDays is
// the only thing standing between the last dispatch and a dismissal for untimeliness
// — with no recourse and no refund path.
{
  const fw = read('lib/filingWindows.js');
  const flLine = /FL: \{[^}]*\}/.exec(fw)?.[0] || '';

  t('Florida still requires receipt, not postmark', /receiptRequired: true/.test(flLine));
  const minDays = Number(/minDays:\s*(\d+)/.exec(flLine)?.[1] || 0);
  t('the Florida buffer is at least 12 days', minDays >= 12, minDays);
  t('the Florida buffer is the largest of any state',
    minDays >= Math.max(...[...fw.matchAll(/minDays:\s*(\d+)/g)].map((m) => Number(m[1]))), minDays);

  // A static buffer is a judgement call. Lob gives a real estimate per piece, so the
  // mailing path must compare against the actual deadline rather than trust the guess.
  t('getFilingWindowStatus exposes the hard deadline', /hardDeadline,/.test(fw));
  const sl = read('pages/api/send-letter.js');
  t('send-letter reads Lob per-piece expected delivery', /expected_delivery_date/.test(sl));
  t('it compares that against the hard deadline', /expectedDate > ws\.hardDeadline/.test(sl));
  t('a late-arriving petition pages a human', /may arrive AFTER the filing deadline/.test(sl));

  // The customer-facing delivery claim is asserted in verify-emails.mjs, which
  // RENDERS the template — grepping this source matches the explanatory comments
  // as well as the strings, which is how the first version of this check failed.
}

/**
 * ── 4a-bis. THE LOB KEY AND THE BANK ACCOUNT MUST BE THE SAME ENVIRONMENT ─────
 *
 * Found live on 12 Aug: LOB_BANK_ACCOUNT_ID held a TEST bank account in production.
 * Nothing had ever exercised it — send-letter.js passes bank_account only on the
 * Florida path (/v1/checks); Texas and Georgia use /v1/letters and need none, and
 * the only order ever mailed was Georgian. On 24 August every Florida dispatch
 * would have failed with "bank account not found".
 *
 * checkLob proved the KEY worked and stopped there. Existence and verification of
 * the bank account can only be answered by Lob, per environment.
 *
 * Asserted behaviourally with a stubbed Lob, because the failure is a specific
 * status code producing a specific severity — not a string being present.
 */
{
  const { checkLob } = await import('../lib/healthChecks.js');

  const withLob = async ({ key, bankId, bankStatus = 200, bankBody = { verified: true } }, fn) => {
    const realFetch = globalThis.fetch;
    const realKey = process.env.LOB_API_KEY;
    const realBank = process.env.LOB_BANK_ACCOUNT_ID;
    process.env.LOB_API_KEY = key;
    if (bankId === undefined) delete process.env.LOB_BANK_ACCOUNT_ID;
    else process.env.LOB_BANK_ACCOUNT_ID = bankId;
    globalThis.fetch = async (url) => String(url).includes('/bank_accounts/')
      ? { ok: bankStatus === 200, status: bankStatus, json: async () => bankBody }
      : { ok: true, status: 200, json: async () => ({ data: [] }) };
    try { return await fn(); } finally {
      globalThis.fetch = realFetch;
      if (realKey === undefined) delete process.env.LOB_API_KEY; else process.env.LOB_API_KEY = realKey;
      if (realBank === undefined) delete process.env.LOB_BANK_ACCOUNT_ID; else process.env.LOB_BANK_ACCOUNT_ID = realBank;
    }
  };

  const mismatch = await withLob({ key: 'live_abc', bankId: 'bank_test_one', bankStatus: 404 }, () => checkLob());
  t('a bank account missing from the key\'s Lob environment is CRITICAL',
    mismatch.status === 'critical' && /does not exist in Lob's live environment/.test(mismatch.detail || ''));

  const unverified = await withLob({ key: 'live_abc', bankId: 'bank_x', bankBody: { verified: false } }, () => checkLob());
  t('an unverified bank account is CRITICAL, not OK',
    unverified.status === 'critical' && /NOT VERIFIED/.test(unverified.detail || ''));

  const missing = await withLob({ key: 'live_abc', bankId: undefined }, () => checkLob());
  t('an unset LOB_BANK_ACCOUNT_ID is CRITICAL',
    missing.status === 'critical' && /not set/.test(missing.detail || ''));

  const good = await withLob({ key: 'live_abc', bankId: 'bank_ok' }, () => checkLob());
  t('a live key with a present, verified bank account reads OK',
    good.status === 'ok' && /present and verified/.test(good.detail || ''));

  const testMode = await withLob({ key: 'test_abc', bankId: 'bank_ok' }, () => checkLob());
  t('a test key is still CRITICAL even when its bank account is fine',
    testMode.status === 'critical' && /TEST MODE/.test(testMode.detail || ''));
}

/**
 * ── 4c. "NOT OPEN YET" AND "CLOSED FOR THE SEASON" ARE NOT THE SAME THING ─────
 *
 * getFilingWindowStatus reports `isOpen: false` for both, and checkFilingDeadlines
 * counted both as `waiting` — printed to the operator as "waiting on a window that
 * has not opened yet (safe)". So a paid, signed, PERMANENTLY UNFILEABLE order was
 * reported as healthy by the one check written to catch that exact condition, while
 * process-queued-orders hit `!canFile` and did `continue` every hour in silence.
 *
 * Found on a real Cherokee County, GA order created 23 June 2026 — eight days after
 * Cherokee's 15 June close — which had been invisible for seven weeks.
 *
 * Asserted behaviourally, against the real numbers, because the string "waiting"
 * appearing in the file proves nothing about which bucket a row lands in.
 */
{
  /**
   * CALL THE REAL FUNCTION. The first version of this block reimplemented the
   * bucketing locally and asserted on its own copy — so neutering the actual branch
   * in healthChecks.js changed nothing and the test still passed. That is the same
   * tautology recorded against an earlier check in this project: comparing a value
   * against the helper that produces it proves only that arithmetic works.
   *
   * So: stub Supabase's response, invoke checkFilingDeadlines() itself, and assert on
   * what the operator would actually see.
   */
  const { checkFilingDeadlines } = await import('../lib/healthChecks.js');

  const withStubbedOrders = async (rows, fn) => {
    const realFetch = globalThis.fetch;
    const realUrl = process.env.SUPABASE_URL;
    const realKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_URL = 'https://stub.invalid';
    process.env.SUPABASE_SERVICE_KEY = 'stub';
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => rows });
    try { return await fn(); } finally {
      globalThis.fetch = realFetch;
      if (realUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = realUrl;
      if (realKey === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = realKey;
    }
  };

  // The real row: Cherokee County GA, bought 23 June 2026, eight days after Cherokee's
  // 15 June close. Its next window is ~295 days out and we sell 60 days ahead.
  const stale = await withStubbedOrders(
    [{ id: 'cherokee-fixture', county: 'Cherokee', state_code: 'GA', payment_status: 'paid', created_at: '2026-06-23T15:37:59Z' }],
    () => checkFilingDeadlines(),
  );
  t('an order whose season has closed is reported CRITICAL, not as safely waiting',
    stale.status === 'critical' && /SEASON THEY BOUGHT HAS CLOSED/.test(stale.detail || ''));
  t('a closed-season order is not counted in the safe waiting tally',
    !/1 waiting on a window that has not opened yet/.test(stale.detail || ''));

  // Only worth having if it stays quiet for a legitimate pre-order — otherwise it is
  // noise on every Florida order taken before 24 August.
  const fresh = await withStubbedOrders(
    [{ id: 'fl-preorder', county: 'Broward', state_code: 'FL', payment_status: 'paid', created_at: new Date().toISOString() }],
    () => checkFilingDeadlines(),
  );
  t('a genuine Florida pre-order still reads as safely waiting',
    fresh.status === 'ok' && /waiting on a window that has not opened yet/.test(fresh.detail || ''));

  const health = read('lib/healthChecks.js');
  t('the season-missed bucket is wired into the deadline check',
    /const stale = \[\]/.test(health) && /stale\.push\(/.test(health));
  t('a missed season is CRITICAL, not a warning',
    /if \(missed\.length \|\| stale\.length \|\| urgent\.length\) return result\('Filing deadlines', 'critical'/.test(health));
  t('the deadline check derives its threshold from PRE_ORDER_DAYS rather than a literal',
    /PRE_ORDER_DAYS \* 24 \* 60 \* 60 \* 1000/.test(health) &&
    /import \{ getFilingWindowStatus, PRE_ORDER_DAYS \}/.test(health));
}

/**
 * ── 4d. THE PETITION PREVIEW UNLOCKS FOR ONE OPERATOR, NOT FOR EVERYONE ───────
 *
 * The blur on /apply is the paywall AND the reason two real defects survived to a
 * mailed document on 12 Aug: reading our own petition required buying one. The old
 * lever, NEXT_PUBLIC_PREVIEW_UNBLURRED, lifts it for EVERY visitor and must be
 * remembered back off — the same shape as the Lob test key and the test bank
 * account that both nearly outlived their purpose the same evening.
 *
 * What must hold: it fails CLOSED, the route is admin-gated, and the global env
 * override cannot creep back into the render path.
 */
{
  const applySrc = read('pages/apply.js');
  const applyCode = applySrc
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const unlockApi = read('pages/api/preview-unlock.js');

  t('the unlock route is admin-gated, with the guard the right way round',
    /if \(await requireAdmin\(req, res, 'preview-unlock'\)\) return;/.test(unlockApi));

  t('the unlock expires on its own',
    /Max-Age=\$\{clearing \? 0 : UNLOCK_SECONDS\}/.test(unlockApi) &&
    /UNLOCK_SECONDS = 8 \* 60 \* 60/.test(unlockApi),
    'a lock with no expiry is the global flag again, wearing a cookie');

  // Not httpOnly is REQUIRED here, not an oversight — apply.js reads it in the
  // browser. Asserted so nobody "hardens" it into uselessness without reading why.
  // Strip BOTH comment forms. The first version stripped only /* */ and tripped on
  // the line comment that explains why HttpOnly is absent — a check reporting the
  // documentation of a decision as a violation of it.
  const unlockCode = unlockApi
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  t('the cookie stays readable by the page that needs it',
    !/HttpOnly/i.test(unlockCode));

  t('the preview starts blurred and can only be unblurred after mount',
    /useState\(false\);?\s*\n\s*useEffect\(\(\) => \{[\s\S]{0,400}ta_preview_unlocked=1/.test(applyCode),
    'reading the cookie during render both breaks hydration and risks an unblurred first paint');

  t('the blur is driven by the per-browser flag, not the global env var',
    /previewUnlocked \? \{\} : \{ filter: "blur\(4px\)"/.test(applyCode) &&
    !/NEXT_PUBLIC_PREVIEW_UNBLURRED[^\n]*\?\s*\{\}\s*:\s*\{ filter/.test(applyCode));

  t('the global override survives for local development only',
    /NEXT_PUBLIC_PREVIEW_UNBLURRED === 'true'/.test(applyCode),
    'removing it entirely leaves no way to review a petition with no admin to log in as');

  const adminSrc = read('pages/admin.js');
  t('an operator can reach it without curl',
    /preview-unlock/.test(adminSrc) && /Unlock petition preview/.test(adminSrc));
}

/**
 * ── 5. LEAD CAPTURE CANNOT CLAIM A SAVE IT DID NOT MAKE ───────────────────────
 *
 * Five refusal paths across four components save the homeowner instead of selling
 * to them. All four called
 * `fetch(...).catch(console.error)` — fire and forget — then rendered
 * "✓ Saved — we'll write to you at <email>" unconditionally. A failed save lost
 * the lead AND told them we had it, with the only trace a console line in a
 * browser we cannot read.
 *
 * This is the second time that defect has been in this file. The comment above
 * UnsupportedState records the first: a button that set `submitted = true` and
 * said "You're on the list!" with no network call at all. The fix then added the
 * call but did not bind the message to its RESULT, which left the lie intact for
 * every failure. FilingWindowClosed came closest — it tracked `submitted` — and
 * still failed twice over, because `.then()` fires on a 500 and because nothing
 * ever read the variable.
 *
 * So these assertions are about the WIRING, not the words:
 *   - the confirmation lives in one component, gated on status === 'saved'
 *   - no gate screen still does a bare fire-and-forget POST
 *   - the API pages a human when the insert fails
 *   - the health check would notice the table going quiet or losing its column
 */
{
  const applySrc = read('pages/apply.js');
  // The comments in that file quote the old broken strings at length, so strip them
  // before asserting on code — matching a quoted line inside an explanation is how
  // an earlier check in this project passed on a live defect.
  const applyCode = applySrc
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  t('the "Saved" confirmation exists in exactly one component',
    (applyCode.match(/&#10003; Saved/g) || []).length === 1);

  t('that confirmation is unreachable unless the save succeeded',
    /status === 'saved'[\s\S]{0,400}&#10003; Saved/.test(applyCode));

  t('a failed save tells the homeowner they are NOT on the list',
    /We could not save your details/.test(applyCode) &&
    /you are <strong[^>]*>not<\/strong> on the list yet/.test(applyCode));

  // `started` became a ref holding the EMAIL a save was started for, rather than a
  // boolean, on 23 Aug 2026. Three of these screens can now be reached before we
  // hold an address at all, so the hook must fire when one arrives later — a
  // boolean latch would swallow it and the customer would watch a dead form.
  // Retry clears it exactly as before; only the empty value changed.
  t('a failed save offers a retry that re-runs the request',
    /onClick=\{onRetry\}/.test(applyCode) &&
    /started\.current = null; setNonce/.test(applyCode));

  t('the hook stops retrying a 4xx that is not a rate limit',
    /res\.status >= 400 && res\.status < 500 && res\.status !== 429\) break/.test(applyCode));

  // The regression that matters: a gate screen added later that goes back to
  // fire-and-forget. Every join-waitlist reference in the funnel must be the hook's.
  t('every join-waitlist call in the funnel goes through useLeadCapture',
    (applyCode.match(/join-waitlist/g) || []).length === 1 && /useLeadCapture\(/.test(applyCode));

  t('no gate screen still swallows a failed capture',
    !/waitlist save failed/.test(applyCode));

  // FIVE refusal paths, FOUR components — UnsupportedState serves two of them (a
  // state we do not serve at all, and one we serve from 2027), which is why this
  // number is 3 and not 4. Three components promise an email and render the notice;
  // NoParcelRecord deliberately does not, because nothing ever contacts that bucket.
  // That exemption is asserted rather than assumed, so deleting the comment without
  // building the job breaks the build.
  // <LeadCapture> wraps the notice as of 23 Aug 2026. The three screens promise an
  // email; what changed is that they can no longer assume they already hold one,
  // because the account step moved below the property step and all three are
  // reached from the property step. The wrapper asks for the address when it is
  // missing and renders the same notice once there is a result to report.
  //
  // `\s` after the name is load-bearing: without it this also matches
  // <LeadCaptureNotice and the count silently means something else.
  t('every screen that promises an email renders the shared capture',
    (applyCode.match(/<LeadCapture\s/g) || []).length === 3);
  t('the "Saved" / "could not save" notice is rendered from exactly one place',
    (applyCode.match(/<LeadCaptureNotice/g) || []).length === 1);
  t('the no-parcel screen still promises no email it cannot send',
    /THE ONE SCREEN THAT DELIBERATELY DOES NOT RENDER LeadCaptureNotice/.test(applySrc));

  const waitlistApi = read('pages/api/join-waitlist.js');
  t('a failed capture pages a human instead of only logging',
    /alertOps\(/.test(waitlistApi) && /if \(error\) \{[\s\S]{0,400}alertOps\(/.test(waitlistApi));
  t('the capture alert is keyed per state so one outage cannot mask another',
    /key: `waitlist-insert-fail-\$\{stateUpper\}`/.test(waitlistApi));

  const health = read('lib/healthChecks.js');
  t('lead capture is a registered health check',
    /export async function checkWaitlistCapture/.test(health) && /checkWaitlistCapture\(\),/.test(health));
  t('the health check would catch a missing blocked_reason column',
    /select=id,created_at,blocked_reason/.test(health) && /res\.status === 400/.test(health));

  const roster = read('pages/api/waitlist-roster.js');
  t('the admin roster bounds its read rather than selecting everything',
    /limit\(ROW_CAP \+ 1\)/.test(roster) && /truncated/.test(roster));

  const adminSrc = read('pages/admin.js');
  t('the admin page surfaces captured leads',
    /WaitlistView/.test(adminSrc) && /waitlist-roster/.test(adminSrc));
  t('the admin page reports a truncated read instead of showing a short total',
    /These totals are understated/.test(adminSrc));

  // ── Visitor counter ─────────────────────────────────────────────────────────
  // Every one of these guards something that fails SILENTLY. middleware.js
  // swallows all errors by design so a counter can never break a page, which means
  // a regression here produces a plausible-looking chart and no error anywhere.
  const mw = read('middleware.js');

  // The one that actually matters. An unsalted sha256 of IP + user agent is
  // brute-forceable offline — the address space is small — so the digest column
  // would BE a column of IP addresses. The middleware must refuse to write at all
  // rather than write unsalted, and the refusal must come before the insert.
  t('the visitor counter refuses to record without a salt',
    /VISITOR_HASH_SECRET/.test(mw) &&
    /if \(!salt\)\s*\{[\s\S]{0,400}return;/.test(mw) &&
    mw.indexOf('if (!salt)') < mw.indexOf('rest/v1/site_visits'));

  // The date inside the hash is what stops the rows being joinable across days
  // into one person's browsing history. Remove it and this quietly becomes a
  // tracking system rather than an aggregate counter.
  t('the visitor hash is scoped to a single day',
    /sha256Hex\(`\$\{visitDate\}\|/.test(mw));

  // No raw identifier may reach the database. Asserted on the row literal itself
  // rather than the whole file, so a comment mentioning "ip" cannot satisfy it and
  // a real column called ip cannot hide behind one.
  const rowLiteral = /const row = \{([\s\S]*?)\n  \};/.exec(mw);
  t('the recorded row carries no IP address or user agent',
    !!rowLiteral &&
    !/^\s*(ip|ip_address|user_agent|ua|referrer|referer)\s*:/m.test(rowLiteral[1]) &&
    /visitor_hash:/.test(rowLiteral[1]));

  // Without a bot filter the count is mostly Googlebot working through 1,081
  // pages — and that crawl lands in the same fortnight as the ads switching on, so
  // it would read as the ads working.
  t('declared crawlers are excluded from the visitor count',
    /BOT_UA/.test(mw) && /BOT_UA\.test\(ua\)/.test(mw) && /googlebot|bot\\b/i.test(mw));

  // An awaited write puts Supabase latency in front of every page on the site.
  t('the counter never blocks the page render',
    /event\.waitUntil\(/.test(mw));

  // API routes, static assets and our own admin pages are not visits. /admin
  // especially: during a working session Nathan would otherwise be the traffic.
  t('the matcher excludes api, static assets and the admin pages',
    /matcher/.test(mw) && /api\//.test(mw) && /admin/.test(mw) && /_next\/static/.test(mw));

  t('the visitor counter is a registered health check',
    /export async function checkTrafficCapture/.test(health) && /checkTrafficCapture\(\),/.test(health));
  t('the health check would catch a missing site_visits table',
    /select=visit_date,visitor_hash/.test(health) && /res\.status === 400 \|\| res\.status === 404/.test(health));
  t('the health check explains a missing salt rather than reporting an empty chart',
    /VISITOR_HASH_SECRET/.test(health));

  // Counting rows in JS would start understating the day the site outgrows the
  // cap, with no error — the settle-referrals unbounded-read defect again.
  const traffic = read('pages/api/traffic-roster.js');
  t('daily visitor counts are aggregated in SQL, not by counting fetched rows',
    /rpc\('site_visits_daily'/.test(traffic) && !/from\('site_visits'\)/.test(traffic));
  t('a missing migration is reported as an error rather than rendered as zero',
    /daily\.error/.test(traffic) && /site_visits\.sql/.test(traffic));

  t('the admin page surfaces traffic',
    /TrafficView/.test(adminSrc) && /traffic-roster/.test(adminSrc));
  // The number is a proxy and gets quoted at people. It has to carry its own
  // caveat on the page, not in a doc nobody opens.
  t('the traffic view states what the number undercounts',
    /not<\/em> an audience size|is <em>not<\/em> an audience size/.test(adminSrc) &&
    /one IP and browser/.test(adminSrc));

  /**
   * THE PROBE FILTER, EXERCISED — not asserted to exist.
   *
   * Asserting that middleware.js contains the string PROBE_PATH would pass while
   * the regex matched nothing, which is the exact failure this file exists to
   * catch. So the pattern is lifted out of the real source and RUN against the
   * paths that actually appeared in /admin, plus real pages it must not eat.
   *
   * The first four are the ones observed in the first 30 days of live data.
   * /wp-admin/install.php was the third most common landing page on the site.
   */
  const mwSrc = read('middleware.js');
  const probeSrc = mwSrc.match(/const PROBE_PATH = new RegExp\(\s*\[([\s\S]*?)\]\.join\('\|'\),\s*'i'\s*\)/);
  t('middleware defines a PROBE_PATH pattern', !!probeSrc);
  if (probeSrc) {
    const parts = JSON.parse('[' + probeSrc[1].replace(/\/\/[^\n]*/g, '').replace(/'/g, '"').replace(/,\s*$/, '') + ']');
    const PROBE = new RegExp(parts.join('|'), 'i');
    /**
     * Each clause of PROBE_PATH needs a path ONLY it catches, or removing that
     * clause leaves the test green. Written the obvious way first and the
     * injection test proved it useless: every WordPress example ended in `.php`,
     * so deleting the whole `wp-` clause still passed on the extension rule.
     *
     *   /wp-json/wp/v2/users   only the wp- clause
     *   /.well-known/…, /.env  only the leading-dot clause
     *   /&                     only the /& clause
     *   /backup.sql            only the extension clause
     *   /phpmyadmin/           only the tool-name clause
     */
    const mustBlock = ['/wp-admin/install.php', '/.well-known/traffic-advice', '/&', '/.env',
                       '/wp-json/wp/v2/users', '/xmlrpc.php', '/.git/config', '/backup.sql',
                       '/phpmyadmin/'];
    const mustKeep = ['/', '/partners', '/florida', '/apply', '/check', '/terms',
                      '/blog/when-do-florida-trim-notices-arrive-2026',
                      '/counties/hillsborough-county-fl', '/florida/miami-beach', '/georgia/tucker-ga'];
    t('PROBE_PATH filters every scanner path seen in the first 30 days',
      mustBlock.every((p) => PROBE.test(p)));
    t('PROBE_PATH does not filter any real page',
      mustKeep.every((p) => !PROBE.test(p)));
    t('the probe filter runs before the row is built',
      mwSrc.includes("PROBE_PATH.test(pathname)") &&
      mwSrc.indexOf("PROBE_PATH.test(pathname)") < mwSrc.indexOf("const row = {"));
  }

  // The SQL cleanup and the middleware must agree on what a probe is, or /admin and
  // the write path disagree about what counts as a visitor.
  const purge = read('scripts/sql/site_visits_purge_probes.sql');
  t('the purge script covers the same shapes as PROBE_PATH',
    /wp-admin/.test(purge) && /xmlrpc/.test(purge) && /\^\/&/.test(purge));
  t('the purge script shows what it will delete before deleting it',
    purge.indexOf('rows_to_delete') < purge.indexOf('delete from site_visits'));
}

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`verify-monitoring: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-monitoring: ${pass} passed`);
