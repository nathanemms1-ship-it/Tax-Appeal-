/**
 * ACCOUNT-LEVEL HEALTH, as JSON.
 *
 * This is the endpoint taxappeal_service_health_dashboard.html should fetch to gain
 * the half it structurally cannot see: our own account state. The dashboard's vendor
 * status cards answer "is Anthropic up?"; this answers "can a customer actually
 * check out right now?", which is the question that costs money.
 *
 * ============================================================================
 * WHY THIS NEEDS A TOKEN
 * ============================================================================
 * The response reveals which env vars are unset, how close each vendor is to its
 * daily ceiling, and how many paid orders are stuck. Every one of those is useful to
 * an attacker: knowing we are at 78% of the Anthropic ceiling tells them exactly how
 * much more traffic is needed to take checkout down.
 *
 * HEALTH_TOKEN, not ADMIN_PASSWORD, deliberately. The dashboard is a local HTML file
 * in ~/Downloads with the token embedded in it. That file gets copied, synced, and
 * emailed around, so whatever is in it must be low-value and read-only. This token
 * grants nothing but this endpoint.
 *
 * Unauthenticated callers get a bare {overall} — enough for an external uptime
 * monitor to page on, revealing nothing actionable.
 */

import { runAllChecks } from '../../lib/healthChecks';
import { enforceRateLimit } from '../../lib/rateLimit';

function tokenOk(req) {
  const expected = process.env.HEALTH_TOKEN;
  if (!expected || String(expected).length < 16) return false;
  const presented =
    req.headers['x-health-token'] ||
    (String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i) || [])[1] ||
    '';
  // Length-safe compare. Not constant-time — this token is read-only and the
  // endpoint is rate limited, so timing analysis buys nothing.
  return String(presented) === String(expected);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Each call makes several outbound vendor requests, so it must not be a free
  // amplifier. Generous enough for a 5-minute dashboard refresh (12/hour) plus an
  // external uptime monitor.
  if (await enforceRateLimit(req, res, 'health', 10, 60)) return;
  if (await enforceRateLimit(req, res, 'health', 120, 3600)) return;

  // The dashboard is opened from file://, which sends `Origin: null`, so it cannot be
  // allowlisted by origin. Access is controlled by the token instead; CORS is open
  // because a token-gated read-only endpoint gains nothing from origin restriction.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-health-token, authorization');
  res.setHeader('Cache-Control', 'no-store');

  const authed = tokenOk(req);

  try {
    const report = await runAllChecks();

    if (!authed) {
      // Deliberately minimal: a status word and nothing else.
      return res.status(200).json({ overall: report.overall, checkedAt: report.checkedAt });
    }

    return res.status(200).json(report);
  } catch (err) {
    console.error('[health] check run threw:', err);
    return res.status(500).json({ overall: 'critical', error: 'health check failed to run' });
  }
}
