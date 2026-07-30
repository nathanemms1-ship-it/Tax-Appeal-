/**
 * OPERATOR ALERTING.
 *
 * ============================================================================
 * WHY THIS IS ITS OWN FILE NOW
 * ============================================================================
 * alertOps lived privately inside lib/fulfillOrder.js, so only the fulfillment
 * path could page anyone. Everything else — a tripped spend ceiling, a missing
 * env var, an invalid API key — was a console.error in a Vercel log nobody reads.
 *
 * That is the wrong split, because the failures that cost MONEY are not in the
 * fulfillment path. The one that stops revenue outright is the Anthropic ceiling:
 * /api/generate-dr486 returns 503, pages/apply.js throws, and the customer lands on
 * a "Lookup failed" screen and cannot buy. Retrying does not help while the ceiling
 * is tripped. Before this file, the only signal was a quiet day of ad spend with no
 * conversions.
 *
 * ============================================================================
 * DE-DUPLICATION IS THE POINT, NOT AN OPTIMISATION
 * ============================================================================
 * A monitor that emails every five minutes trains its owner to filter it, and then
 * it is worse than no monitor at all — it produces the FEELING of coverage while
 * guaranteeing the real alert is ignored. So each distinct alert key is sent at most
 * once per suppression window, and the window is long (6h default).
 *
 * The suppression state lives in Redis. If Redis is unreachable we SEND rather than
 * suppress: a duplicate alert is annoying, a dropped one defeats the purpose.
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const DEFAULT_SUPPRESS_SECONDS = 6 * 60 * 60;

/**
 * SET key with NX + EX. Returns true if WE claimed the key (i.e. no alert has been
 * sent for it inside the window), false if one already exists.
 *
 * NX makes this atomic, so two concurrent invocations cannot both decide to send.
 */
async function claimAlertSlot(key, seconds) {
  if (!REST_URL || !REST_TOKEN) return true; // no Redis -> always send
  try {
    const res = await fetch(`${REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['SET', `alert:${key}`, String(Date.now()), 'NX', 'EX', String(seconds)]]),
      signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined,
    });
    if (!res.ok) return true;
    const body = await res.json();
    // Upstash returns "OK" when NX succeeded, null when the key already existed.
    return body?.[0]?.result === 'OK';
  } catch (e) {
    console.warn('[alertOps] suppression check failed, sending anyway:', e?.message);
    return true;
  }
}

/**
 * Page the operator by email.
 *
 * @param {string} subject
 * @param {string} body                plain text; rendered inside <pre>
 * @param {object} [opts]
 * @param {string} [opts.key]          de-duplication key. Defaults to the subject.
 *                                     Pass a STABLE key for recurring conditions so
 *                                     the window actually suppresses them.
 * @param {number} [opts.suppressSeconds]
 * @param {boolean} [opts.force]       bypass suppression (use for state CHANGES)
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function alertOps(subject, body, opts = {}) {
  const { key = subject, suppressSeconds = DEFAULT_SUPPRESS_SECONDS, force = false } = opts;

  // Always log, even when the email is suppressed, so the Vercel log remains a
  // complete record of what fired and what got de-duplicated.
  console.error(`[OPS ALERT] ${subject} :: ${body}`);

  const to = process.env.OPS_ALERT_EMAIL;
  if (!to) {
    console.error('[alertOps] OPS_ALERT_EMAIL is not set — nobody is being paged.');
    return { sent: false, reason: 'no_recipient' };
  }

  if (!force) {
    const claimed = await claimAlertSlot(key, suppressSeconds);
    if (!claimed) return { sent: false, reason: 'suppressed' };
  }

  // Resend is called DIRECTLY, not via our own /api/send-email.
  //
  // Routing through that route created a circular dependency: it requires
  // INTERNAL_API_SECRET, and a missing INTERNAL_API_SECRET is one of the CRITICAL
  // conditions this alerting exists to report. So the single failure most likely to
  // break fulfillment was also the one guaranteed to silence the alarm about it.
  //
  // It also depended on NEXT_PUBLIC_BASE_URL being correct. During local testing that
  // variable was unset, so it defaulted to the production URL and a local test fired
  // real requests at production (correctly rejected 403). A serverless function
  // calling its own public HTTP endpoint to send mail is an unnecessary hop with two
  // ways to be wrong; the SDK has neither.
  if (!process.env.RESEND_API_KEY) {
    console.error('[alertOps] RESEND_API_KEY not set — cannot page anyone.');
    return { sent: false, reason: 'no_resend_key' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: 'TaxAppeal Monitor <disputes@taxappealusa.com>',
      to: [to],
      subject: `[TaxAppeal] ${subject}`,
      html: `<pre style="font:13px ui-monospace,Menlo,monospace;white-space:pre-wrap">${escapeForPre(body)}</pre>`,
      text: body,
    });
    if (error) {
      console.error('[alertOps] Resend rejected:', error.message || error);
      return { sent: false, reason: 'resend_error' };
    }
    return { sent: true };
  } catch (e) {
    console.error('[alertOps] failed:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

/** Minimal escaping — alert bodies are ours, but they interpolate vendor messages. */
function escapeForPre(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default alertOps;
