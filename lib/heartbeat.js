/**
 * CRON HEARTBEATS — a dead-man's switch for the scheduled jobs.
 *
 * ============================================================================
 * WHY SILENCE IS THE DANGEROUS STATE
 * ============================================================================
 * pages/api/cron/health-monitor.js alerts on TRANSITIONS. That is the right design
 * for noise, and it has one consequence its own header does not call out: the
 * monitor is itself a cron. If Vercel stops firing it, or CRON_SECRET is rotated
 * wrong, or the route starts 500ing, the result is no email at all — which looks
 * exactly like "everything is fine". You find out days later.
 *
 * The same hole sits under process-queued-orders, and there it costs filings rather
 * than information. That route returns 200 in several situations where it dispatches
 * nothing at all — sales paused, no queued orders, window not open — so Vercel's own
 * cron reporting shows a healthy green run either way. Nothing in the system
 * distinguishes "ran and correctly had nothing to do" from "has not run since Tuesday".
 *
 * So each cron stamps a timestamp when it COMPLETES, and checkCronHeartbeat reads
 * those stamps back. Absence of a recent stamp is the alarm.
 *
 * ============================================================================
 * WHY THIS FAILS SOFT
 * ============================================================================
 * The stamp lives in Redis, which is itself allowed to be down (checkRedis treats it
 * as a warning, not an outage). If we cannot READ a heartbeat we report 'warn' and
 * say so, never 'critical'. Reporting a healthy cron as dead because Upstash blipped
 * is precisely the false positive lib/healthChecks.js documents as a real defect:
 * a monitor that cries wolf gets filtered, and then the real alert is missed too.
 *
 * Stamping must also never break the job it is measuring. Every write here is
 * best-effort and swallows its own errors — a monitoring failure must not stop a
 * petition being mailed.
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const KEY = (name) => `cron:beat:${name}`;

/** Kept 7 days. Long enough that a stale stamp is still readable and reportable. */
const TTL_SECONDS = 7 * 24 * 60 * 60;

async function pipeline(cmds) {
  if (!REST_URL || !REST_TOKEN) return null;
  const r = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined,
  });
  if (!r.ok) return null;
  return r.json();
}

/**
 * Record that `name` finished a run. Best effort, never throws.
 *
 * Call this at the point of COMPLETION, not entry. A job that starts, hangs and is
 * killed by the function timeout has not run in any sense that matters, and stamping
 * on entry would hide exactly that.
 */
export async function stampHeartbeat(name, extra = {}) {
  try {
    const payload = JSON.stringify({ at: new Date().toISOString(), ...extra });
    await pipeline([['SET', KEY(name), payload, 'EX', String(TTL_SECONDS)]]);
  } catch (e) {
    console.log(`[heartbeat] could not stamp ${name}: ${e.message}`);
  }
}

/**
 * Read heartbeats for the given names.
 *
 * Returns { available, beats } where `available` is false when Redis could not be
 * reached at all. The caller MUST distinguish those: `available: false` means we know
 * nothing, and reporting "the cron is dead" from that is a false positive.
 */
export async function readHeartbeats(names) {
  try {
    const res = await pipeline(names.map((n) => ['GET', KEY(n)]));
    if (!res) return { available: false, beats: {} };
    const beats = {};
    names.forEach((n, i) => {
      const raw = res[i]?.result;
      if (!raw) { beats[n] = null; return; }
      try {
        beats[n] = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        beats[n] = null;
      }
    });
    return { available: true, beats };
  } catch (e) {
    return { available: false, beats: {} };
  }
}

/**
 * How stale a heartbeat may be before it is a problem.
 *
 * Set from each job's schedule in vercel.json plus generous slack for Vercel's own
 * scheduling jitter and a slow run:
 *   health-monitor         every 10 min  -> 45 min
 *   process-queued-orders  hourly        -> 150 min (a full run can take 300s)
 */
export const HEARTBEAT_LIMITS = {
  'health-monitor': { warnAfterMin: 45, criticalAfterMin: 180, why: 'no alert from this monitor can reach you; silence stops meaning "healthy"' },
  'process-queued-orders': { warnAfterMin: 150, criticalAfterMin: 300, why: 'queued petitions are not being dispatched, and no other check will notice' },
  // Runs every 10 minutes. Generous thresholds on purpose: a missed reminder is a
  // customer who paid and has not been nudged to sign, and checkStuckOrders still
  // catches that at 72h. Worth knowing about; not worth waking anyone for.
  'signature-reminder': { warnAfterMin: 60, criticalAfterMin: 240, why: 'paid customers who have not signed are not being reminded; checkStuckOrders still catches them at 72h' },
};
