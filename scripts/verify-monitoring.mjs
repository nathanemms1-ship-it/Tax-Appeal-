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
t('deadline check treats window-open-but-not-fileable as critical',
  /!w\.canFile/.test(healthSrc) && /missed\.length \|\| urgent\.length[\s\S]{0,120}'critical'/.test(healthSrc));
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

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`verify-monitoring: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-monitoring: ${pass} passed`);
