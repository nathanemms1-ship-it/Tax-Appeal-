/**
 * SERVICE HEALTH CHECKS — our account, not the vendors' global status.
 *
 * ============================================================================
 * WHY THE EXISTING DASHBOARD CANNOT DO THIS JOB
 * ============================================================================
 * taxappeal_service_health_dashboard.html polls each vendor's PUBLIC STATUS PAGE
 * (statuspage.io `status.indicator`) every 5 minutes. That is a genuinely useful
 * display, and it answers a different question than the one that matters here.
 *
 * A status page reports the VENDOR'S view of the VENDOR'S global health. It cannot
 * see our account. Every failure mode that has actually threatened this business is
 * invisible to it:
 *
 *   - Anthropic's status page says "Operational" while our credit balance is $0 and
 *     every customer sees "Lookup failed" at checkout.
 *   - Google Cloud says "Operational" while our Places API daily quota is exhausted.
 *   - Lob says "Operational" while our key is still a TEST key and no real mail has
 *     ever left the building.
 *   - Nothing on any status page knows that INBOUND_EMAIL_SECRET is unset, so our
 *     own webhook is returning 503 to every county.
 *
 * Two further limits: the dashboard only runs while its browser tab is open, and a
 * local HTML file cannot send email. So it can inform, but it cannot alert.
 *
 * These checks run server-side on a schedule and are deliberately CHEAP and
 * READ-ONLY. Nothing here writes, mails, charges, or generates. A monitor that costs
 * money to run is a monitor you eventually turn off.
 */

import { spendUsage, DAILY_BUDGET } from './spendGuard';
import { readHeartbeats, HEARTBEAT_LIMITS } from './heartbeat';
import { getFilingWindowStatus, PRE_ORDER_DAYS } from './filingWindows';
import { ORDER_WRITE_COLUMNS } from './orderColumns';
import { droppedOutcomesToday } from './recordCheck';

/** Severity ordering, worst first. */
export const SEVERITY = { critical: 3, warn: 2, ok: 1 };

const TIMEOUT_MS = 6000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

function result(name, status, detail, extra = {}) {
  return { name, status, detail, ...extra };
}

/**
 * ============================================================================
 * ONE RETRY, INSIDE THE SAME RUN. THIS IS NOT THE TWO-STRIKE RULE.
 * ============================================================================
 * On 22 Aug a rule was proposed that would treat a check as healthy until it had
 * failed on TWO CONSECUTIVE MONITOR RUNS. It was retracted, and it was right to
 * retract it: the database failed at :20 and recovered by :30, and that rule would
 * have sent NOTHING for a 40-minute degradation that was dropping funnel rows the
 * whole time. Cross-run suppression trades away the thing the monitor is for.
 *
 * This is the opposite trade, and the difference is the word SAME.
 *
 * On 24 Aug 19:20:52Z the monitor sent `CRITICAL: Database — unreachable: timeout
 * after 6000ms`. In the SAME report, seven other checks that also query Supabase —
 * Schema, Stuck orders, Filing deadlines, Lead capture, Visitor counter, Check
 * outcomes — all returned OK. runAllChecks fires everything through one
 * Promise.all, so Supabase answered seven concurrent requests in that instant and
 * one stalled. A poll 1m46s earlier and every poll after read ok in 0.4–1.5s for
 * the whole fifteen-check suite. Nothing was down; one request lost a race.
 *
 * So a single stalled connection pages a human at 3pm on a Sunday. The cost of that
 * is not the interruption — it is that the NEXT database alert gets a little less
 * attention, and the one after that a little less again. A monitor is only worth
 * having while its alerts are believed.
 *
 * WHAT THIS DOES: the probe is sent again, immediately, in the same invocation.
 *
 * WHAT IT PRESERVES: a real outage fails BOTH attempts and still alerts on the very
 * same run — no delay, no suppression, nothing carried to the next run. There is no
 * new persisted state, and scripts/verify-monitoring.mjs asserts there is none.
 *
 * WHAT IT MUST NOT DO: hide a flap. A probe that fails and then succeeds returns
 * `ok` — anything worse would email, because health-monitor.js alerts on ANY
 * worsening including ok → warn, which would defeat the entire point — but the
 * failed attempt is named in the detail. So an intermittently stalling database is
 * visible on /api/health and in the daily all-clear, without paging anyone.
 *
 * The delay is deliberately short. It is paid only on a failing probe; the healthy
 * path returns on the first attempt and is not slowed at all.
 */
export const DB_PROBE_ATTEMPTS = 2;
export const DB_PROBE_RETRY_DELAY_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Environment variables whose ABSENCE silently disables something, grouped by what
 * breaking actually costs. This list is the single most valuable check here, because
 * every one of these fails CLOSED and quietly.
 *
 * `alt` lists EQUIVALENT names — the variable is satisfied if ANY of them is set.
 *
 * This exists because the monitor's very first real report was wrong. It said
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN were missing, while the Redis
 * and Spend-ceilings checks in the same email both reported OK. Both cannot be true.
 *
 * Cause: every consumer in the codebase reads
 *   process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
 * because Vercel's Upstash integration provisions the KV_-prefixed names. This check
 * demanded only the UPSTASH_ ones, so a correctly-configured deployment was told to
 * go set two variables it did not need — and setting them wrongly would have been
 * worse than leaving them alone.
 *
 * A monitor that reports healthy things as broken gets ignored just as fast as one
 * that spams, so a false positive here is a real defect and not cosmetic.
 */
const REQUIRED_ENV = [
  // Revenue path — absence stops orders or loses money.
  { key: 'ANTHROPIC_API_KEY', sev: 'critical', why: 'no petitions or letters can be generated; checkout dead-ends on "Lookup failed"' },
  { key: 'STRIPE_SECRET_KEY', sev: 'critical', why: 'no checkout at all' },
  { key: 'STRIPE_WEBHOOK_SECRET', sev: 'critical', why: 'webhook refuses everything; paid orders are never fulfilled' },
  { key: 'SUPABASE_URL', sev: 'critical', why: 'no orders can be read or written' },
  { key: 'SUPABASE_SERVICE_KEY', sev: 'critical', why: 'no orders can be read or written' },
  { key: 'INTERNAL_API_SECRET', sev: 'critical', why: 'send-letter and send-email refuse internal calls, so nothing mails' },
  { key: 'LOB_API_KEY', sev: 'critical', why: 'no certified mail and no VAB fee checks' },
  // Dereferenced at send-letter.js as `bank_account` on EVERY Florida cheque. Unset,
  // it sends `bank_account: undefined`, Lob rejects the cheque, and the petition never
  // mails. Missing from this list until 6 Aug 2026 — the one variable that breaks
  // Florida specifically was the one nothing watched.
  { key: 'LOB_BANK_ACCOUNT_ID', sev: 'critical', why: 'every Florida VAB fee cheque is rejected by Lob, so no Florida petition mails' },

  // Fulfillment and ops — absence loses information rather than money.
  { key: 'OPS_ALERT_EMAIL', sev: 'critical', why: 'no alert from this monitor or any other can reach anyone' },
  { key: 'CRON_SECRET', sev: 'warn', why: 'both cron routes return 503, so queued pre-orders never dispatch' },
  { key: 'LOB_WEBHOOK_SECRET', sev: 'warn', why: 'Lob delivery confirmations are rejected; tracking never updates' },
  { key: 'INBOUND_EMAIL_SECRET', sev: 'warn', why: 'the inbound county-decision webhook returns 503; no decision can be parsed in any state' },
  { key: 'ADMIN_PASSWORD', sev: 'warn', why: '/admin and the payout sheet are inaccessible' },
  { key: 'RESEND_API_KEY', sev: 'warn', why: 'no customer email: no receipts, no filing confirmations' },

  // Cost controls and caching — absence is a bill, not an outage.
  { key: 'UPSTASH_REDIS_REST_URL', alt: ['KV_REST_API_URL'], sev: 'warn', why: 'rate limiting and every cache are disabled; the spend ceilings stop counting' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', alt: ['KV_REST_API_TOKEN'], sev: 'warn', why: 'rate limiting and every cache are disabled; the spend ceilings stop counting' },
  { key: 'GOOGLE_PLACES_API_KEY', sev: 'warn', why: 'address autocomplete returns nothing; customers must type addresses by hand' },
  { key: 'RENTCAST_API_KEY', sev: 'warn', why: 'no property data and NO COMPARABLE SALES; every customer is pushed to manual entry and /api/comps returns 503' },
];

const isSet = (name) => {
  const v = process.env[name];
  return !!(v && String(v).trim());
};

export function checkEnv() {
  // Satisfied by the primary name OR any listed alternate.
  const missing = REQUIRED_ENV.filter((e) => ![e.key, ...(e.alt || [])].some(isSet));

  if (!missing.length) return result('Configuration', 'ok', `all ${REQUIRED_ENV.length} required variables set`);

  const crit = missing.filter((m) => m.sev === 'critical');
  const lines = missing.map((m) => {
    const names = m.alt?.length ? `${m.key} (or ${m.alt.join(' / ')})` : m.key;
    return `  ${m.sev === 'critical' ? '[CRITICAL]' : '[warn]'} ${names} — ${m.why}`;
  });
  return result(
    'Configuration',
    crit.length ? 'critical' : 'warn',
    `${missing.length} variable(s) missing:\n${lines.join('\n')}`,
    { missing: missing.map((m) => m.key) }
  );
}

/**
 * Spend ceilings. This is the check that protects revenue, because the Anthropic
 * ceiling is the one control in the system that can stop a customer buying.
 *
 * Warns at 80% so there is time to raise the ceiling before it bites.
 */
export async function checkSpendCeilings() {
  const usage = await spendUsage();
  if (!usage) return result('Spend ceilings', 'warn', 'cannot read usage — Redis unreachable, so the ceilings are not counting');

  const rows = Object.entries(usage).map(([vendor, u]) => {
    const pct = u.limit ? Math.round((u.used / u.limit) * 100) : 0;
    return { vendor, ...u, pct };
  });

  const tripped = rows.filter((r) => r.used >= r.limit);
  const near = rows.filter((r) => r.pct >= 80 && r.used < r.limit);

  const table = rows
    .map((r) => `  ${r.vendor.padEnd(10)} ${String(r.used).padStart(6)} / ${r.limit}  (${r.pct}%)`)
    .join('\n');

  if (tripped.length) {
    const anth = tripped.find((t) => t.vendor === 'anthropic');
    return result(
      'Spend ceilings',
      'critical',
      `${tripped.map((t) => t.vendor).join(', ')} AT DAILY CEILING.\n${table}` +
        (anth ? '\n\nANTHROPIC IS TRIPPED — customers cannot complete checkout. They see "Lookup failed".' : ''),
      { rows }
    );
  }
  if (near.length) {
    return result('Spend ceilings', 'warn', `${near.map((n) => `${n.vendor} at ${n.pct}%`).join(', ')}\n${table}`, { rows });
  }
  return result('Spend ceilings', 'ok', `all vendors under 80% of today's ceiling\n${table}`, { rows });
}

/**
 * Is our Anthropic key valid and our account in good standing?
 *
 * GET /v1/models is free and makes no completion, so this can run every 10 minutes
 * forever at zero cost. It is deliberately NOT a /v1/messages call: a monitor must
 * not be a line item.
 *
 * A 401 here means an invalid key; 400/402/429 with a credit message means the
 * balance is exhausted. Both look identical to the customer ("Lookup failed") and
 * neither appears on Anthropic's status page.
 */
export async function checkAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return result('Anthropic', 'critical', 'ANTHROPIC_API_KEY not set');
  try {
    const r = await withTimeout(
      fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      })
    );
    if (r.status === 401 || r.status === 403) {
      return result('Anthropic', 'critical', `key rejected (${r.status}) — checkout is dead: customers see "Lookup failed"`);
    }
    if (!r.ok) {
      const t = (await r.text()).slice(0, 300);
      const credit = /credit|balance|quota|billing/i.test(t);
      return result(
        'Anthropic',
        credit ? 'critical' : 'warn',
        `HTTP ${r.status}${credit ? ' — looks like a CREDIT/BILLING problem, which stops checkout' : ''}\n${t}`
      );
    }
    return result('Anthropic', 'ok', 'key valid, account reachable');
  } catch (e) {
    return result('Anthropic', 'warn', `unreachable: ${e.message}`);
  }
}

/**
 * Stripe: is the key valid, and are we in LIVE mode?
 *
 * The live/test distinction is worth asserting rather than assuming. A test key
 * takes no money while the funnel looks completely healthy.
 */
export async function checkStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return result('Stripe', 'critical', 'STRIPE_SECRET_KEY not set — no checkout');
  const isTest = key.startsWith('sk_test');
  try {
    const r = await withTimeout(
      fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${key}` } })
    );
    if (r.status === 401) return result('Stripe', 'critical', 'key rejected — no checkout');
    if (!r.ok) return result('Stripe', 'warn', `HTTP ${r.status}`);
    return result(
      'Stripe',
      isTest ? 'critical' : 'ok',
      isTest ? 'LIVE SITE IS USING A TEST KEY — no real money is being taken' : 'live key valid'
    );
  } catch (e) {
    return result('Stripe', 'warn', `unreachable: ${e.message}`);
  }
}

/**
 * Lob: valid key, and is it a TEST key?
 *
 * Directly relevant to the Aug 4 plan upgrade on the billing tracker. A test key
 * means petitions are "mailed" and nothing physically leaves — the worst possible
 * silent failure, because the customer paid and the filing deadline still passes.
 */
export async function checkLob() {
  const key = process.env.LOB_API_KEY;
  if (!key) return result('Lob', 'critical', 'LOB_API_KEY not set — no mail, no VAB fee checks');
  const isTest = key.startsWith('test_');
  try {
    const r = await withTimeout(
      fetch('https://api.lob.com/v1/addresses?limit=1', {
        headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
      })
    );
    if (r.status === 401) return result('Lob', 'critical', 'key rejected — nothing can be mailed');
    if (!r.ok) return result('Lob', 'warn', `HTTP ${r.status}`);

    /**
     * THE KEY AND THE BANK ACCOUNT MUST BELONG TO THE SAME LOB ENVIRONMENT.
     *
     * Lob keeps separate bank accounts for test and live. A live key paired with a
     * test bank account ID fails at dispatch with "bank account not found" — and
     * this check could not see it, because it only ever proved the KEY worked.
     *
     * That was not hypothetical. On 12 Aug, LOB_BANK_ACCOUNT_ID was found holding a
     * TEST bank account in production, left there after an earlier test session. It
     * had never been noticed because nothing had ever exercised it: send-letter.js
     * passes bank_account only on the Florida path, which posts to /v1/checks. Texas
     * and Georgia post to /v1/letters and need no bank account at all. The only
     * order this system had ever mailed was Georgian, so the variable had never been
     * used in anger. On 24 August every Florida dispatch would have failed.
     *
     * verify-fl-dispatch asserts bank_account is SET. Only Lob can say whether it
     * EXISTS, and only in the environment the current key belongs to — so the answer
     * has to come from here.
     *
     * Verification matters as much as existence: Lob verifies live bank accounts by
     * micro-deposit, which takes several business days. An unverified account cannot
     * cut a cheque, and discovering that on opening morning leaves no time to fix it.
     */
    const bankId = process.env.LOB_BANK_ACCOUNT_ID;
    if (!bankId) {
      return result('Lob', 'critical', 'LOB_BANK_ACCOUNT_ID not set — no Florida VAB fee cheque can be cut');
    }

    const b = await withTimeout(
      fetch(`https://api.lob.com/v1/bank_accounts/${encodeURIComponent(bankId)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
      })
    );

    const mode = isTest ? 'test' : 'live';
    if (b.status === 404) {
      return result('Lob', 'critical',
        `LOB_BANK_ACCOUNT_ID (${bankId}) does not exist in Lob's ${mode} environment — the key is a ${mode} key, so they are mismatched. ` +
        'Every Florida dispatch will fail with "bank account not found". Point it at a bank account belonging to this environment.');
    }
    if (!b.ok) return result('Lob', 'warn', `bank account lookup returned HTTP ${b.status}`);

    const bank = await b.json().catch(() => ({}));
    if (bank && bank.verified === false) {
      return result('Lob', 'critical',
        `LOB_BANK_ACCOUNT_ID (${bankId}) exists but is NOT VERIFIED. Lob will refuse to cut a cheque. ` +
        'Live verification is by micro-deposit and takes several business days — start it now, not on filing day.');
    }

    return result(
      'Lob',
      isTest ? 'critical' : 'ok',
      isTest
        ? 'LOB IS IN TEST MODE — petitions are recorded as mailed but NOTHING physically ships. Filing deadlines will pass with nothing filed.'
        : `live key valid, bank account ${bankId} present and verified`,
      { mode, bankAccount: bankId }
    );
  } catch (e) {
    return result('Lob', 'warn', `unreachable: ${e.message}`);
  }
}

/**
 * Supabase reachable and the orders table readable.
 *
 * Retries once WITHIN THIS RUN before declaring critical — see the DB_PROBE_ATTEMPTS
 * header above for why that is not the cross-run two-strike rule rejected on 22 Aug.
 */
export async function checkDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return result('Database', 'critical', 'Supabase env vars not set');

  const failures = [];
  for (let attempt = 1; attempt <= DB_PROBE_ATTEMPTS; attempt++) {
    try {
      const r = await withTimeout(
        fetch(`${url}/rest/v1/orders?select=id&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          /**
           * THE STALLED REQUEST IS CANCELLED, NOT ABANDONED.
           *
           * withTimeout is a Promise.race, which only stops us WAITING — the losing
           * fetch keeps its connection to Supabase open for its full natural life.
           * That matters specifically here: the incident this retry exists for was
           * eight concurrent requests where one lost the race, so retrying without
           * cancelling would add a NINTH while the stalled one is still held, making
           * a contention failure marginally more likely rather than less.
           *
           * Guarded because lib/spendGuard.js and lib/heartbeat.js both guard it,
           * and a monitor that throws on an old runtime reports nothing at all.
           */
          signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
        })
      );
      // A non-2xx is a failed ATTEMPT, not an immediate verdict. 500/502/503/504 from
      // PostgREST is the same transient shape as a stall and deserves the same second
      // look; 401/404 will simply fail twice and report identically to before.
      if (!r.ok) throw new Error(`orders table unreadable: HTTP ${r.status}`);
      return result(
        'Database',
        'ok',
        failures.length
          ? `orders table readable on attempt ${attempt} (earlier attempts failed: ${failures.join('; ')})`
          : 'orders table readable'
      );
    } catch (e) {
      // String(e?.message ?? e): a rejection that is not an Error would otherwise put
      // the word "undefined" in an alert body and tell the reader nothing.
      failures.push(String(e?.message ?? e));
      if (attempt < DB_PROBE_ATTEMPTS) await sleep(DB_PROBE_RETRY_DELAY_MS);
    }
  }
  // Every attempt failed, in this one run. That is an outage, and it alerts now.
  // The count comes from what actually happened, not from the constant — a detail
  // line that claims two attempts while listing one is a lie the reader cannot see.
  return result(
    'Database',
    'critical',
    `unreachable — ${failures.length} attempts in the same run: ${failures.join('; ')}`
  );
}

/**
 * Redis. Only a 'warn' because everything that depends on it fails OPEN — but the
 * consequences are all financial: no rate limiting, no caching, and the spend
 * ceilings silently stop counting, which removes the backstop under everything else.
 */
export async function checkRedis() {
  if (!REST_URL_OK()) return result('Redis', 'warn', 'Upstash env vars not set — no rate limiting, no caching, spend ceilings not counting');
  try {
    const r = await withTimeout(
      fetch(`${process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL}/ping`, {
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN}`,
        },
      })
    );
    if (!r.ok) return result('Redis', 'warn', `HTTP ${r.status} — rate limits and ceilings are not counting`);
    return result('Redis', 'ok', 'reachable');
  } catch (e) {
    return result('Redis', 'warn', `unreachable: ${e.message} — rate limits and ceilings are not counting`);
  }
}

function REST_URL_OK() {
  return !!(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
}

/**
 * STUCK ORDERS — the highest-value business check here.
 *
 * A customer who paid and whose petition never went out is the worst outcome this
 * system can produce: they believe it was filed, the statutory deadline passes, and
 * they have no appeal. Money moved and nothing happened.
 *
 * Two conditions:
 *   needs_review           fulfillment threw after payment; already alerted once, but
 *                          if it is STILL sitting there nobody acted on that alert.
 *   awaiting_signature     >72h: the customer paid and never signed. Not our bug, but
 *                          it is a refund or a nudge, and silence is not a decision.
 */
export async function checkStuckOrders() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return result('Stuck orders', 'warn', 'cannot check — Supabase env vars not set');

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  try {
    const [nr, aw] = await Promise.all([
      withTimeout(fetch(`${url}/rest/v1/orders?select=id,created_at&dispute_status=eq.needs_review`, { headers })),
      withTimeout(fetch(`${url}/rest/v1/orders?select=id,created_at&dispute_status=eq.awaiting_signature&created_at=lt.${cutoff}`, { headers })),
    ]);

    if (!nr.ok || !aw.ok) return result('Stuck orders', 'warn', `query failed (${nr.status}/${aw.status})`);

    const needsReview = await nr.json();
    const awaiting = await aw.json();

    const parts = [];
    if (needsReview.length) parts.push(`${needsReview.length} order(s) in needs_review — PAID BUT NOT MAILED: ${needsReview.map((o) => o.id).join(', ')}`);
    if (awaiting.length) parts.push(`${awaiting.length} order(s) awaiting_signature >72h — paid, never signed: ${awaiting.map((o) => o.id).join(', ')}`);

    if (needsReview.length) return result('Stuck orders', 'critical', parts.join('\n'), { needsReview: needsReview.length, awaiting: awaiting.length });
    if (awaiting.length) return result('Stuck orders', 'warn', parts.join('\n'), { needsReview: 0, awaiting: awaiting.length });
    return result('Stuck orders', 'ok', 'no paid order is stuck');
  } catch (e) {
    return result('Stuck orders', 'warn', `check failed: ${e.message}`);
  }
}

/**
 * THE SALES KILL SWITCH, AND WHETHER ITS TWO HALVES AGREE.
 *
 * There are two variables, not one:
 *   SALES_ENABLED             — server side. lib/salesGate.js. The one that decides.
 *   NEXT_PUBLIC_SALES_ENABLED — browser side. Only changes what the pages SAY.
 *
 * Neither was checked anywhere, and the failure is asymmetric.
 *
 * Losing the PUBLIC one is loud: components/WaitlistBanner.js reappears across all
 * 200+ marketing pages and you see it within a minute of loading any page.
 *
 * Losing the SERVER one is silent, and it is the dangerous one. Checkout starts
 * returning 503, and pages/api/cron/process-queued-orders.js hits its salesEnabled()
 * guard and returns `200 {skipped:'sales_paused'}` — deliberately a 200, so Vercel's
 * cron reporting stays green and the health monitor sees nothing change. Every queued
 * petition silently stops being dispatched while every other check on this page reads
 * OK. lib/salesGate.js's own header notes that an env var not surviving a redeploy
 * "has bitten this project before".
 *
 * So the split-brain state — public says open, server says closed — is CRITICAL:
 * the site is advertising a service it will refuse to sell and will not dispatch.
 */
export function checkSalesGate() {
  const server = process.env.SALES_ENABLED === 'true';
  const client = process.env.NEXT_PUBLIC_SALES_ENABLED === 'true';

  if (server && client) {
    return result('Sales gate', 'ok', 'sales are ON — checkout accepts orders and queued petitions dispatch', { server, client });
  }

  if (!server && client) {
    return result(
      'Sales gate',
      'critical',
      'SPLIT BRAIN — the site is advertising as open but the SERVER is refusing.\n' +
        '  NEXT_PUBLIC_SALES_ENABLED=true  (pages show buy buttons, no waitlist banner)\n' +
        '  SALES_ENABLED is NOT true       (checkout returns 503, and process-queued-orders\n' +
        '                                   skips every queued petition while returning 200)\n' +
        'Set SALES_ENABLED=true in Vercel AND REDEPLOY — saving the variable alone does nothing.',
      { server, client }
    );
  }

  if (server && !client) {
    return result(
      'Sales gate',
      'warn',
      'The server accepts orders but the pages still show the "we are not filing yet" banner ' +
        'and waitlist wording. Set NEXT_PUBLIC_SALES_ENABLED=true and REDEPLOY. Lost sales, not lost filings.',
      { server, client }
    );
  }

  return result(
    'Sales gate',
    'warn',
    'Sales are OFF site-wide. Correct before launch and during a deliberate pause — but if this ' +
      'is unexpected, nothing is selling and nothing queued is being mailed. Set SALES_ENABLED and ' +
      'NEXT_PUBLIC_SALES_ENABLED to true in Vercel and REDEPLOY.',
    { server, client }
  );
}

/**
 * DID THE CRONS ACTUALLY RUN?
 *
 * See lib/heartbeat.js for why silence is the dangerous state. Short version: the
 * health monitor alerts on transitions and is itself a cron, so a stalled scheduler
 * produces no email — indistinguishable from healthy. And process-queued-orders
 * returns a green 200 in several cases where it dispatches nothing, so Vercel's cron
 * dashboard cannot tell you it has stopped working either.
 *
 * Fails SOFT when Redis is unreadable: 'warn' with an explicit "cannot tell", never
 * 'critical'. Calling a healthy cron dead because Upstash blipped is the false
 * positive this file's header treats as a real defect.
 */
export async function checkCronHeartbeat() {
  const names = Object.keys(HEARTBEAT_LIMITS);
  const { available, beats } = await readHeartbeats(names);

  if (!available) {
    return result('Cron heartbeats', 'warn', 'cannot tell — Redis unreachable, so the heartbeats cannot be read. This is not evidence the crons stopped.');
  }

  const now = Date.now();
  const lines = [];
  let worst = 'ok';

  for (const name of names) {
    const limit = HEARTBEAT_LIMITS[name];
    const beat = beats[name];

    if (!beat?.at) {
      // No stamp at all. Expected once, immediately after deploying this change —
      // the stamps only start existing when each job next completes a run.
      lines.push(`  ${name}: no heartbeat recorded yet (normal for up to ${limit.warnAfterMin} min after deploy)`);
      if (SEVERITY.warn > SEVERITY[worst]) worst = 'warn';
      continue;
    }

    const ageMin = Math.round((now - new Date(beat.at).getTime()) / 60000);
    const extra = beat.filed !== undefined ? ` — last run filed ${beat.filed}` : '';

    if (ageMin >= limit.criticalAfterMin) {
      lines.push(`  ${name}: LAST RAN ${ageMin} MIN AGO — ${limit.why}${extra}`);
      worst = 'critical';
    } else if (ageMin >= limit.warnAfterMin) {
      lines.push(`  ${name}: last ran ${ageMin} min ago, later than expected${extra}`);
      if (SEVERITY.warn > SEVERITY[worst]) worst = 'warn';
    } else {
      lines.push(`  ${name}: ran ${ageMin} min ago${extra}`);
    }

    /**
     * LIVENESS IS NOT HEALTH — added 11 Aug 2026.
     *
     * This check only ever asked whether a job ran recently. process-queued-orders
     * has stamped `errored` alongside `filed` all along and nothing read it, so a run
     * that filed 0 orders and failed 200 produced a fresh stamp, a line reading
     * "ran 3 min ago — last run filed 0", and a green overall. The job was alive and
     * doing nothing but fail, which is the exact state this check exists to surface.
     *
     * Every error here is a PAID order that is not filed, so warn on any of them, and
     * escalate when they outnumber successes — a run where more failed than filed has
     * a systemic cause (an expired Lob key, a tripped spend ceiling, a county gate),
     * not bad luck.
     */
    if (beat.errored) {
      const filed = beat.filed || 0;
      if (beat.errored > filed) {
        lines.push(`    ${beat.errored} order(s) FAILED to dispatch last run vs ${filed} filed — paid orders are not being mailed`);
        worst = 'critical';
      } else {
        lines.push(`    ${beat.errored} order(s) failed to dispatch last run — see last_dispatch_error in /admin`);
        if (SEVERITY.warn > SEVERITY[worst]) worst = 'warn';
      }
    }
  }

  return result('Cron heartbeats', worst, lines.join('\n'), { beats });
}

/**
 * QUEUED ORDERS AGAINST THEIR DEADLINE.
 *
 * checkStuckOrders catches needs_review and unsigned-after-72h. Neither covers the
 * outcome that actually ends a customer's year: an order sitting in `queued` while
 * its county's window runs out.
 *
 * The specific trap is `tooClose`. process-queued-orders gates on canFile, which is
 * `isOpen && !tooClose`, and tooClose becomes true once the hard deadline is nearer
 * than the state's minDays receipt buffer. At that moment the cron stops selecting
 * the order — permanently, and by `continue`, so nothing is logged as an error and
 * no status changes. The order stays `queued` forever, the customer has paid, and in
 * Florida the deadline is RECEIPT, so there is no recovery and no refund path built.
 *
 * That transition is therefore CRITICAL and is the reason this check exists.
 */
export async function checkFilingDeadlines() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return result('Filing deadlines', 'warn', 'cannot check — Supabase env vars not set');

  // Mirrors the cron's own exclusion: a refunded or disputed pre-order must not be
  // mailed, so it is not at deadline risk and must not raise an alarm.
  const REVERSED = new Set(['refunded', 'partially_refunded', 'disputed']);

  try {
    const r = await withTimeout(
      fetch(
        `${url}/rest/v1/orders?select=id,county,state_code,payment_status,created_at&dispute_status=eq.queued`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      )
    );
    if (!r.ok) return result('Filing deadlines', 'warn', `query failed (HTTP ${r.status})`);

    const rows = (await r.json()).filter((o) => !REVERSED.has(o.payment_status));
    if (!rows.length) return result('Filing deadlines', 'ok', 'no queued orders');

    const missed = [];   // window open but no longer fileable — the cron will never pick these up
    const stale = [];    // window CLOSED for the season they bought — same outcome, different cause
    const urgent = [];   // fileable, 7 days or less
    const soon = [];     // fileable, 8-14 days
    const unknown = [];  // no state_code, or a state we have no window for
    let waiting = 0;     // window not open yet — correct and safe

    for (const o of rows) {
      const state = String(o.state_code || '').toUpperCase().trim();
      if (!state) { unknown.push(`${o.id} (no state_code)`); continue; }

      const w = getFilingWindowStatus(state, o.county, { strict: true });
      if (!w) { unknown.push(`${o.id} (${state}: no filing window defined)`); continue; }

      /**
       * `isOpen: false` MEANS TWO OPPOSITE THINGS AND THIS TREATED THEM AS ONE.
       *
       * A window that has not opened yet, and a window that closed months ago and
       * will not reopen until next year, both report `isOpen: false`. Everything
       * here counted both as `waiting` — reported to the operator as "waiting on a
       * window that has not opened yet (safe)".
       *
       * So an order that is paid, signed and PERMANENTLY UNFILEABLE was being
       * counted as healthy by the one check written to catch exactly that, while
       * process-queued-orders hit `!canFile` and did `continue` every hour without
       * logging. Found 12 Aug on a real Cherokee County, GA order created 23 June —
       * eight days after Cherokee's 15 June close. It had been invisible for seven
       * weeks and the customer's deadline had long passed.
       *
       * The discriminator is PRE_ORDER_DAYS, which is what makes it principled
       * rather than a guessed threshold: we only sell 60 days ahead of a window
       * opening. So if the NEXT open date is more than 60 days after the order was
       * taken, it cannot be the season that customer bought into — they have missed
       * it, and no amount of waiting fixes it.
       *
       * This matters for Florida on 19 September, when every unfiled FL pre-order
       * silently becomes this exact case.
       */
      if (!w.isOpen) {
        const created = o.created_at ? new Date(o.created_at) : null;
        const opens = w.openDate ? new Date(w.openDate) : null;
        const missedTheSeason = created && opens &&
          (opens.getTime() - created.getTime()) > PRE_ORDER_DAYS * 24 * 60 * 60 * 1000;
        if (missedTheSeason) {
          stale.push(`${o.id} — ${o.county} County, ${state}: bought ${created.toISOString().slice(0, 10)}, next window ${opens.toISOString().slice(0, 10)}`);
          continue;
        }
        waiting++;
        continue;
      }
      if (!w.canFile) { missed.push(`${o.id} — ${o.county} County, ${state}`); continue; }
      if (w.daysUntilHard <= 7) { urgent.push(`${o.id} — ${o.county} County, ${state}: ${w.daysUntilHard}d left`); continue; }
      if (w.daysUntilHard <= 14) soon.push(`${o.id} — ${o.county} County, ${state}: ${w.daysUntilHard}d left`);
    }

    const parts = [`${rows.length} queued order(s); ${waiting} waiting on a window that has not opened yet (safe)`];
    if (missed.length) parts.push(`\nPAID BUT NO LONGER FILEABLE — the cron has stopped selecting these and will not retry:\n  ${missed.join('\n  ')}`);
    if (stale.length) parts.push(`\nPAID, AND THE SEASON THEY BOUGHT HAS CLOSED — refund and tell them. The cron skips these silently every run and they will sit here until next year's window:\n  ${stale.join('\n  ')}`);
    if (urgent.length) parts.push(`\n7 DAYS OR LESS:\n  ${urgent.join('\n  ')}`);
    if (soon.length) parts.push(`\n8-14 days:\n  ${soon.join('\n  ')}`);
    if (unknown.length) parts.push(`\nCannot determine a deadline (manual review):\n  ${unknown.join('\n  ')}`);

    const detail = parts.join('\n');
    if (missed.length || stale.length || urgent.length) return result('Filing deadlines', 'critical', detail, { missed: missed.length, stale: stale.length, urgent: urgent.length });
    if (soon.length || unknown.length) return result('Filing deadlines', 'warn', detail, { soon: soon.length, unknown: unknown.length });
    return result('Filing deadlines', 'ok', detail);
  } catch (e) {
    return result('Filing deadlines', 'warn', `check failed: ${e.message}`);
  }
}

/**
 * DOES THE DATABASE HAVE EVERY COLUMN THE CODE WRITES?
 *
 * ============================================================================
 * THE FAILURE THIS EXISTS FOR
 * ============================================================================
 * On 5 Aug 2026 a paying customer's order INSERT threw with:
 *
 *   Could not find the 'account_number' column of 'orders' in the schema cache
 *
 * Money captured, no order row, customer left on a spinner. The column had been
 * added to the code the previous day and never to the database. On 6 Aug the same
 * thing nearly happened twice more, with evidence_text and delivered_at.
 *
 * Nothing could see it. The build passed. Every suite passed. checkDatabase reported
 * OK because it only asks whether Supabase is REACHABLE — and it was, perfectly,
 * while being unable to store an order.
 *
 * ============================================================================
 * HOW
 * ============================================================================
 * Ask PostgREST for all of the columns with limit=0. It returns no rows and does no
 * real work, but it validates every name — and on a missing one it replies 400 with
 * the offending column in the message. So a single cheap request both detects the
 * problem and names it.
 *
 * information_schema is not used deliberately: PostgREST does not expose it by
 * default, and requiring a bespoke view or RPC would make this check something that
 * can itself silently stop working.
 *
 * CRITICAL, not warn. A missing column does not degrade anything — it takes money
 * and stores nothing.
 */
export async function checkSchema() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return result('Schema', 'warn', 'cannot check — Supabase env vars not set');

  try {
    const select = ORDER_WRITE_COLUMNS.join(',');
    const r = await withTimeout(
      fetch(`${url}/rest/v1/orders?select=${encodeURIComponent(select)}&limit=0`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      })
    );

    if (r.ok) {
      return result('Schema', 'ok', `all ${ORDER_WRITE_COLUMNS.length} written columns exist on orders`);
    }

    const body = (await r.text()).slice(0, 500);
    // PostgREST names the column it could not find; surface it rather than making
    // someone bisect a 50-column select by hand at the worst possible moment.
    const named = /column\s+"?(?:orders\.)?([a-z_][a-z0-9_]*)"?\s+does not exist/i.exec(body)
      || /Could not find the '([a-z_][a-z0-9_]*)' column/i.exec(body);

    if (named) {
      return result(
        'Schema',
        'critical',
        `orders.${named[1]} IS MISSING. The code writes it, the table does not have it.\n` +
        `Any order path touching that column fails — on the insert path that means ` +
        `payment captured and NO ORDER ROW.\n\n` +
        `  alter table orders add column if not exists ${named[1]} <type>;\n` +
        `  notify pgrst, 'reload schema';\n\n` +
        `The notify matters: PostgREST caches the table shape and will keep reporting ` +
        `the column missing until it re-reads.`,
        { missingColumn: named[1] }
      );
    }

    return result('Schema', 'warn', `column check returned HTTP ${r.status}\n${body}`);
  } catch (e) {
    return result('Schema', 'warn', `check failed: ${e.message}`);
  }
}

/**
 * LEAD CAPTURE, AND WHETHER THE TABLE IS ACTUALLY RECEIVING ROWS.
 *
 * The funnel refuses a sale in five places and writes the homeowner to `waitlist`
 * instead. That table was checked by nothing: not here, not on /admin, not by any
 * cron. A capture failure surfaced as a console line in a browser we cannot read,
 * and the customer was told "Saved" regardless.
 *
 * The client now shows the truth and the API now pages on a failed insert. This is
 * the third leg: the case where nothing errors because nothing is arriving. If the
 * table is unreachable, or the column the Florida gates write has gone missing, no
 * alert fires — there is simply silence, which is indistinguishable from a quiet
 * week.
 *
 * So the check is on REACHABILITY and SHAPE, not on volume. Volume can legitimately
 * be zero for days out of season, and a check that cries wolf every quiet Sunday is
 * being ignored by August. What must never be true is that the table cannot be read,
 * or that `blocked_reason` — added 11 Aug, and what both Florida gates depend on —
 * is absent. That second one is the realistic failure: a migration run on one
 * environment and not another means every Florida capture 500s, and before this
 * check the only symptom was leads quietly not arriving.
 */
export async function checkWaitlistCapture() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return result('Lead capture', 'warn', 'cannot check — Supabase env vars not set');

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    // Selecting blocked_reason explicitly is the point: PostgREST 400s on an unknown
    // column, so this fails loudly if the migration is missing rather than returning
    // rows that silently lack it.
    const res = await withTimeout(fetch(
      `${url}/rest/v1/waitlist?select=id,created_at,blocked_reason&order=created_at.desc&limit=50`,
      { headers },
    ));

    if (res.status === 400) {
      const body = await res.text().catch(() => '');
      return result('Lead capture', 'critical',
        'waitlist query rejected — blocked_reason is probably missing on this environment, which means ' +
        'EVERY Florida refusal is failing to save. Run scripts/sql/waitlist_blocked_reason.sql. ' +
        `PostgREST said: ${body.slice(0, 200)}`);
    }
    if (!res.ok) {
      return result('Lead capture', 'critical',
        `waitlist is unreachable (${res.status}) — refused homeowners are not being saved anywhere`);
    }

    const rows = await res.json();
    const day = Date.now() - 24 * 60 * 60 * 1000;
    const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const last24h = rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= day).length;
    const last7d = rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= week).length;

    return result('Lead capture', 'ok',
      `waitlist reachable, blocked_reason present — ${last24h} captured in 24h, ${last7d} in 7d`,
      { last24h, last7d, sampled: rows.length });
  } catch (e) {
    return result('Lead capture', 'warn', `check failed: ${e.message}`);
  }
}


/**
 * IS THE VISITOR COUNTER ACTUALLY WRITING?
 *
 * Reachability and shape, not volume — the same rule as checkWaitlistCapture. Zero
 * visitors is legitimate on a quiet pre-launch day, and a check that cries wolf
 * every quiet Sunday is being ignored by the time it matters.
 *
 * The failure this exists for is specific and otherwise invisible: middleware.js
 * swallows every error so a broken counter can never break a page, which means a
 * counter that has stopped writing looks exactly like a day with no visitors.
 * Nothing else in the system would ever mention it.
 *
 * VISITOR_HASH_SECRET is checked first and reported as its own state, because a
 * missing salt is a deliberate no-op rather than a fault — the middleware refuses
 * to write unsalted digests. Without this line the symptom is an empty chart and
 * no explanation anywhere.
 */
export async function checkTrafficCapture() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return result('Visitor counter', 'warn', 'cannot check — Supabase env vars not set');

  if (!process.env.VISITOR_HASH_SECRET) {
    return result('Visitor counter', 'warn',
      'VISITOR_HASH_SECRET is not set, so middleware.js is recording nothing. This is the intended ' +
      'refusal — an unsalted digest of IP + user agent is brute-forceable and would amount to storing ' +
      'IP addresses. Set the variable to start counting.');
  }

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    // visitor_hash is named explicitly so PostgREST 400s if the table or column is
    // missing on this environment, rather than the chart quietly reading empty.
    const res = await withTimeout(fetch(
      `${url}/rest/v1/site_visits?select=visit_date,visitor_hash&order=visit_date.desc&limit=200`,
      { headers },
    ));

    if (res.status === 400 || res.status === 404) {
      const body = await res.text().catch(() => '');
      return result('Visitor counter', 'critical',
        'site_visits query rejected — the table is probably missing on this environment, which means ' +
        'no visit has ever been recorded here. Run scripts/sql/site_visits.sql. ' +
        `PostgREST said: ${body.slice(0, 200)}`);
    }
    if (!res.ok) {
      return result('Visitor counter', 'critical',
        `site_visits is unreachable (${res.status}) — traffic is not being recorded`);
    }

    const rows = await res.json();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const todayRows = rows.filter((r) => r.visit_date === today).length;
    const days = new Set(rows.map((r) => r.visit_date)).size;

    return result('Visitor counter', 'ok',
      `site_visits reachable — ${todayRows} unique visitors today, ${days} days in the last 200 rows`,
      { todayRows, days, sampled: rows.length });
  } catch (e) {
    return result('Visitor counter', 'warn', `check failed: ${e.message}`);
  }
}

/**
 * IS /api/check RECORDING WHAT IT ANSWERS?
 *
 * The failure this exists to catch: scripts/sql/check_events.sql not having been
 * run on an environment. lib/recordCheck.js swallows every error by design — a
 * counter must never be able to break the most important endpoint in the product
 * — so a missing table produces an empty Funnel tab and nothing else. An empty
 * Funnel tab reads as "nobody is checking their address", which is a conclusion
 * somebody could act on by changing the ad campaign. This is what makes the two
 * distinguishable.
 *
 * Same shape as checkTrafficCapture, deliberately: `outcome` is named in the
 * select so PostgREST 400s on a missing table or column rather than returning an
 * empty array that looks like a quiet day.
 */
export async function checkCheckOutcomeCapture() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return result('Check outcomes', 'warn', 'cannot check — Supabase env vars not set');

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    const res = await withTimeout(fetch(
      `${url}/rest/v1/check_events?select=checked_on,outcome&order=checked_on.desc&limit=200`,
      { headers },
    ));

    if (res.status === 400 || res.status === 404) {
      const body = await res.text().catch(() => '');
      return result('Check outcomes', 'critical',
        'check_events query rejected — the table is probably missing on this environment, which means every ' +
        'answer /api/check has given here was discarded and the Funnel tab is empty for that reason rather ' +
        'than because nobody checked. Run scripts/sql/check_events.sql. ' +
        `PostgREST said: ${body.slice(0, 200)}`);
    }
    if (!res.ok) {
      return result('Check outcomes', 'critical',
        `check_events is unreachable (${res.status}) — funnel outcomes are not being recorded`);
    }

    const rows = await res.json();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const todayRows = rows.filter((r) => r.checked_on === today).length;
    const days = new Set(rows.map((r) => r.checked_on)).size;

    /**
     * REACHABLE AND EMPTY IS ITS OWN FINDING, not an ok.
     *
     * The table existing proves the migration ran. It does not prove anything is
     * writing to it — a deploy that dropped the recorder, or a build that
     * predates it, produces a reachable empty table indefinitely. Saying "ok" to
     * that is the same shape as the "earliest is X" line that kept printing
     * Hillsborough after it stopped being true.
     */
    if (rows.length === 0) {
      return result('Check outcomes', 'warn',
        'check_events is reachable but empty. Either nobody has run a savings check on this environment since ' +
        'the table was created, or the build deployed here predates lib/recordCheck.js. Load /check and submit ' +
        'an address to tell the two apart.');
    }

    /**
     * HOW MANY WE FAILED TO RECORD, ALONGSIDE HOW MANY WE DID.
     *
     * `todayRows` alone cannot distinguish a quiet day from a slow database. On
     * 24 Aug the database was slow for roughly forty minutes and the day read as
     * "traffic arrived, nobody checked" — recordCheckOutcome abandons its insert
     * after 1200ms to protect the answer, and the abandoned row left no trace.
     *
     * null means we could not ask (Redis absent or unreachable), and it is
     * reported as "unknown" rather than as zero. Saying zero because we could not
     * ask is the same lie in a smaller font.
     */
    const dropped = await droppedOutcomesToday();
    const dropNote =
      dropped == null ? ', drops unknown (no Redis)'
        : dropped > 0 ? `, ${dropped} DROPPED — the database was too slow to record them, so today's funnel is understated`
          : ', 0 dropped';

    if (dropped > 0) {
      return result('Check outcomes', 'warn',
        `check_events reachable — ${todayRows} recorded today${dropNote}. ` +
        'A dropped outcome is a check a real visitor ran that the funnel will never show.',
        { todayRows, dropped });
    }

    return result('Check outcomes', 'ok',
      `check_events reachable — ${todayRows} checks today${dropNote}, ${days} days in the last 200 rows`,
      { todayRows, days, sampled: rows.length });
  } catch (e) {
    return result('Check outcomes', 'warn', `check failed: ${e.message}`);
  }
}

/** Run everything concurrently. Never throws; a failed check reports itself. */
export async function runAllChecks() {
  const checks = await Promise.all([
    Promise.resolve(checkEnv()),
    Promise.resolve(checkSalesGate()),
    checkSpendCeilings(),
    checkAnthropic(),
    checkStripe(),
    checkLob(),
    checkDatabase(),
    checkSchema(),
    checkRedis(),
    checkCronHeartbeat(),
    checkStuckOrders(),
    checkFilingDeadlines(),
    checkWaitlistCapture(),
    checkTrafficCapture(),
    checkCheckOutcomeCapture(),
  ]);

  const worst = checks.reduce((acc, c) => (SEVERITY[c.status] > SEVERITY[acc] ? c.status : acc), 'ok');
  return {
    overall: worst,
    checkedAt: new Date().toISOString(),
    budgets: DAILY_BUDGET,
    checks,
  };
}

export default runAllChecks;
