import { adminPasswordMatches } from '../../lib/adminAuth';
import { runAllChecks } from '../../lib/healthChecks';
import { enforceRateLimit } from '../../lib/rateLimit';

/**
 * ADMIN-AUTHENTICATED SERVICE HEALTH.
 *
 * ============================================================================
 * WHY THIS EXISTS ALONGSIDE /api/health
 * ============================================================================
 * /api/health is the MACHINE endpoint. It is GET, it is gated by HEALTH_TOKEN, and
 * it exists so an external uptime monitor and a local HTML file can poll it. Its
 * design note explains the token choice: the dashboard was a file in ~/Downloads
 * with the token baked into it, and that file gets copied, synced and emailed, so
 * whatever it carried had to be low-value.
 *
 * That whole arrangement is the problem. A local file opened over file:// breaks in
 * ways that have nothing to do with this system:
 *   - macOS revokes Chrome's access to ~/Downloads and it dies with ERR_ACCESS_DENIED
 *   - the file gets moved, cleaned up, or never re-downloaded on a new machine
 *   - it is unreachable from a phone, which is where you are when something breaks
 *   - a long-lived token sits in cleartext in a synced folder, forever
 *
 * This route is the HUMAN endpoint: POST, gated by ADMIN_PASSWORD, same as
 * /api/get-orders. It backs a real page at /admin/health that is a URL you can
 * bookmark. No token is stored anywhere on a client, so there is nothing to leak
 * and nothing to re-download.
 *
 * /api/health is deliberately NOT modified. External monitors point at it and its
 * unauthenticated {overall} response is the thing that pages on an outage.
 *
 * READ-ONLY, and cheap by construction — runAllChecks writes nothing, mails nothing,
 * charges nothing. See the header of lib/healthChecks.js.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Every call fans out to several vendor APIs, so this must not be a free
  // amplifier, and a single shared password with no lockout is online-guessable.
  // 12/minute is generous for a 60s auto-refresh plus manual reloads.
  if (await enforceRateLimit(req, res, 'admin-health', 12, 60)) return;
  if (await enforceRateLimit(req, res, 'admin-health', 120, 3600)) return;

  const { password } = req.body || {};
  if (!adminPasswordMatches(password)) return res.status(401).json({ error: 'Unauthorized' });

  res.setHeader('Cache-Control', 'no-store');

  try {
    const report = await runAllChecks();
    return res.status(200).json(report);
  } catch (err) {
    // runAllChecks is documented never to throw — a failed check reports itself.
    // If we are here, something structural broke, and saying so beats a blank page.
    console.error('[admin-health] check run threw:', err);
    return res.status(500).json({ error: 'health check failed to run', detail: err.message });
  }
}
