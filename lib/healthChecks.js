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
import { getFilingWindowStatus } from './filingWindows';

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
    return result(
      'Lob',
      isTest ? 'critical' : 'ok',
      isTest
        ? 'LOB IS IN TEST MODE — petitions are recorded as mailed but NOTHING physically ships. Filing deadlines will pass with nothing filed.'
        : 'live key valid'
    );
  } catch (e) {
    return result('Lob', 'warn', `unreachable: ${e.message}`);
  }
}

/** Supabase reachable and the orders table readable. */
export async function checkDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return result('Database', 'critical', 'Supabase env vars not set');
  try {
    const r = await withTimeout(
      fetch(`${url}/rest/v1/orders?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      })
    );
    if (!r.ok) return result('Database', 'critical', `orders table unreadable: HTTP ${r.status}`);
    return result('Database', 'ok', 'orders table readable');
  } catch (e) {
    return result('Database', 'critical', `unreachable: ${e.message}`);
  }
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
    const urgent = [];   // fileable, 7 days or less
    const soon = [];     // fileable, 8-14 days
    const unknown = [];  // no state_code, or a state we have no window for
    let waiting = 0;     // window not open yet — correct and safe

    for (const o of rows) {
      const state = String(o.state_code || '').toUpperCase().trim();
      if (!state) { unknown.push(`${o.id} (no state_code)`); continue; }

      const w = getFilingWindowStatus(state, o.county);
      if (!w) { unknown.push(`${o.id} (${state}: no filing window defined)`); continue; }

      if (!w.isOpen) { waiting++; continue; }
      if (!w.canFile) { missed.push(`${o.id} — ${o.county} County, ${state}`); continue; }
      if (w.daysUntilHard <= 7) { urgent.push(`${o.id} — ${o.county} County, ${state}: ${w.daysUntilHard}d left`); continue; }
      if (w.daysUntilHard <= 14) soon.push(`${o.id} — ${o.county} County, ${state}: ${w.daysUntilHard}d left`);
    }

    const parts = [`${rows.length} queued order(s); ${waiting} waiting on a window that has not opened yet (safe)`];
    if (missed.length) parts.push(`\nPAID BUT NO LONGER FILEABLE — the cron has stopped selecting these and will not retry:\n  ${missed.join('\n  ')}`);
    if (urgent.length) parts.push(`\n7 DAYS OR LESS:\n  ${urgent.join('\n  ')}`);
    if (soon.length) parts.push(`\n8-14 days:\n  ${soon.join('\n  ')}`);
    if (unknown.length) parts.push(`\nCannot determine a deadline (manual review):\n  ${unknown.join('\n  ')}`);

    const detail = parts.join('\n');
    if (missed.length || urgent.length) return result('Filing deadlines', 'critical', detail, { missed: missed.length, urgent: urgent.length });
    if (soon.length || unknown.length) return result('Filing deadlines', 'warn', detail, { soon: soon.length, unknown: unknown.length });
    return result('Filing deadlines', 'ok', detail);
  } catch (e) {
    return result('Filing deadlines', 'warn', `check failed: ${e.message}`);
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
    checkRedis(),
    checkCronHeartbeat(),
    checkStuckOrders(),
    checkFilingDeadlines(),
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
