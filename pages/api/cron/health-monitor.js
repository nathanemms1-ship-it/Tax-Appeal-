/**
 * HEALTH MONITOR — the part that actually pages someone.
 *
 * ============================================================================
 * WHY A CRON AND NOT THE DASHBOARD
 * ============================================================================
 * taxappeal_service_health_dashboard.html refreshes every 5 minutes via setInterval
 * in a local HTML file. That means it monitors only while a browser tab is open, and
 * a local file cannot send email. Outages do not wait for someone to open a tab, and
 * the whole request here was "send me an immediate email" — so the alerting has to
 * live server-side.
 *
 * ============================================================================
 * ALERT ON TRANSITIONS, NOT ON STATE
 * ============================================================================
 * Emailing whenever something is broken means a permanently-degraded item (say
 * INBOUND_EMAIL_SECRET unset for three weeks while a provider is chosen) mails every
 * run until the alerts get filtered — and then the real one is missed too. So this
 * compares against the LAST reported state and emails when a check CHANGES, plus a
 * suppressed reminder while a critical condition persists.
 *
 * Recoveries are emailed too. "It's fixed" is information, and its absence is what
 * makes people distrust a monitor and go check by hand.
 */

import { requireCronSecret } from '../../../lib/webhookAuth';
import { runAllChecks, SEVERITY } from '../../../lib/healthChecks';
import { alertOps } from '../../../lib/alertOps';

export const config = { maxDuration: 60 };

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const STATE_KEY = 'health:last-state';

/**
 * Returns { ok, value }.
 *
 * The ok/value split matters more than it looks. An earlier version returned a bare
 * null for both "the key does not exist" and "Redis is unreachable", which collapsed
 * two completely different situations into one:
 *
 *   key absent      -> genuine first run. Report what is already broken. Correct.
 *   Redis down      -> we have NO history, so every run looked like a first run and
 *                      re-reported all eight checks as newly broken, with force:true.
 *                      In production that is an email every 10 minutes, 144 a day —
 *                      exactly the "trains its owner to filter it" failure this file's
 *                      own header warns about.
 */
async function redisCmd(cmd) {
  if (!REST_URL || !REST_TOKEN) return { ok: false, value: null };
  try {
    const r = await fetch(`${REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([cmd]),
      signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined,
    });
    if (!r.ok) return { ok: false, value: null };
    return { ok: true, value: (await r.json())?.[0]?.result ?? null };
  } catch (e) {
    return { ok: false, value: null };
  }
}

export default async function handler(req, res) {
  // Vercel Cron presents CRON_SECRET. Fails closed when it is unset — see
  // lib/webhookAuth.js for why an unset secret must not authenticate anyone.
  if (requireCronSecret(req, res)) return;

  const report = await runAllChecks();

  // Previous per-check statuses, so we can diff. Absent on the first ever run, in
  // which case we report anything already broken rather than staying silent — a
  // monitor whose first run says nothing about an existing outage is not a monitor.
  let previous = {};
  const read = await redisCmd(['GET', STATE_KEY]);
  const stateAvailable = read.ok;
  if (read.value) {
    try { previous = typeof read.value === 'string' ? JSON.parse(read.value) : read.value; } catch (e) { previous = {}; }
  }
  const firstRun = read.ok && !read.value;

  // No state store means no memory between runs, so we cannot tell a new problem from
  // an ongoing one and cannot de-duplicate (alertOps' suppression is Redis-backed
  // too). Degrade to CRITICAL-only rather than guessing: a warn-level condition is
  // not worth an un-deduplicated email every ten minutes, and if Redis alone is down
  // the only non-ok check is Redis itself (a warn) — so this stays silent, which is
  // the right outcome.
  const degraded = !stateAvailable;

  const current = {};
  for (const c of report.checks) current[c.name] = c.status;

  const broke = [];
  const recovered = [];
  const stillCritical = [];

  for (const c of report.checks) {
    const before = previous[c.name];
    const worsened = before ? SEVERITY[c.status] > SEVERITY[before] : c.status !== 'ok';
    const improved = before && SEVERITY[c.status] < SEVERITY[before];

    if (degraded) {
      // Critical-only while we have no history. See `degraded` above.
      if (c.status === 'critical') broke.push(c);
      continue;
    }
    if (worsened) broke.push(c);
    else if (improved) recovered.push({ ...c, from: before });
    else if (c.status === 'critical') stillCritical.push(c);
  }

  await redisCmd(['SET', STATE_KEY, JSON.stringify(current), 'EX', String(14 * 24 * 60 * 60)]);

  const sent = [];

  // ── New or worsened problems: email immediately, bypassing suppression ────────
  if (broke.length) {
    const worst = broke.reduce((a, c) => (SEVERITY[c.status] > SEVERITY[a] ? c.status : a), 'ok');
    const subject =
      `${worst === 'critical' ? 'CRITICAL' : 'Warning'}: ` +
      broke.map((c) => c.name).join(', ') +
      (firstRun ? ' (first monitor run)' : degraded ? ' (monitor state unavailable)' : '');

    const body = [
      broke.map((c) => `[${c.status.toUpperCase()}] ${c.name}\n${indent(c.detail)}`).join('\n\n'),
      '',
      '─'.repeat(60),
      'Full picture:',
      report.checks.map((c) => `  ${statusMark(c.status)} ${c.name}`).join('\n'),
      '',
      `Detail: ${base()}/api/health  (send header X-Health-Token)`,
      `Checked: ${report.checkedAt}`,
    ].join('\n');

    // A transition is exactly what should never be suppressed — but in degraded mode
    // there is no transition, only a snapshot, so let suppression try to limit it.
    const r = await alertOps(subject, body, degraded ? { key: 'health:degraded-snapshot' } : { force: true });
    sent.push({ type: 'broke', subject, ...r });
  }

  // ── Recoveries ───────────────────────────────────────────────────────────────
  if (recovered.length) {
    const subject = `Recovered: ${recovered.map((c) => c.name).join(', ')}`;
    const body = recovered
      .map((c) => `${c.name}: ${c.from} → ${c.status}\n${indent(c.detail)}`)
      .join('\n\n');
    const r = await alertOps(subject, body, { force: true });
    sent.push({ type: 'recovered', subject, ...r });
  }

  // ── Still broken: a reminder, but suppressed to once per 12h per check ───────
  for (const c of stillCritical) {
    const r = await alertOps(`STILL CRITICAL: ${c.name}`, `${c.name} has not recovered.\n\n${indent(c.detail)}`, {
      key: `still:${c.name}`,
      suppressSeconds: 12 * 60 * 60,
    });
    if (r.sent) sent.push({ type: 'reminder', check: c.name, ...r });
  }

  console.log(`[health-monitor] overall=${report.overall} broke=${broke.length} recovered=${recovered.length} emails=${sent.filter((s) => s.sent).length}`);

  return res.status(200).json({
    overall: report.overall,
    firstRun,
    degraded,
    broke: broke.map((c) => c.name),
    recovered: recovered.map((c) => c.name),
    stillCritical: stillCritical.map((c) => c.name),
    emailsSent: sent.filter((s) => s.sent).length,
    checkedAt: report.checkedAt,
  });
}

function indent(s) {
  return String(s ?? '').split('\n').map((l) => `    ${l}`).join('\n');
}
function statusMark(s) {
  return s === 'ok' ? 'OK  ' : s === 'warn' ? 'WARN' : 'CRIT';
}
function base() {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';
}
