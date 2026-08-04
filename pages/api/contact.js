/**
 * CONTACT FORM ENDPOINT.
 *
 * ============================================================================
 * THIS IS A PUBLIC, UNAUTHENTICATED ROUTE THAT SENDS MAIL FROM OUR DOMAIN
 * ============================================================================
 * That combination is exactly what pages/api/send-email.js warns about in its own
 * header: anyone who can POST here can cause a message to leave taxappealusa.com
 * with full SPF/DKIM alignment. Unguarded, that is a free relay for phishing our
 * own customers, plus unlimited quota burn.
 *
 * send-email.js solved it by requiring a shared secret. That is not available here
 * — the whole point is that a stranger who is stuck in the funnel can reach us. So
 * the guards are different, and all four matter:
 *
 *   1. RECIPIENT IS HARDCODED. `to` is never read from the request. The worst a
 *      caller can do is send mail to us.
 *   2. RATE LIMITED per IP, twice: a burst limit and an hourly ceiling.
 *   3. EVERY FIELD IS LENGTH-CAPPED and HTML-ESCAPED before it enters the email
 *      body. The body is HTML we sign, so an unescaped </div><a href=...> in the
 *      message field is a phishing email sent by us.
 *   4. HONEYPOT field. Bots fill every input they find; humans never see it.
 *
 * `reply_to` is set to whatever the sender typed (snake_case — Resend v3; `replyTo`
 * is v4 syntax and would be silently ignored here), so answering is one click. That
 * value is NOT trusted for anything else — it never decides where mail goes.
 */

import { Resend } from 'resend';
import { enforceRateLimit } from '../../lib/rateLimit';
import { LIMITS, cap } from '../../lib/inputLimits';
import { escapeHtml } from '../../lib/escape';

// 16 KB. A contact message needs a fraction of this; Next's 1 MB default just
// gives an attacker somewhere to put a megabyte.
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

// Hardcoded on purpose. See guard 1 above — never read the recipient from a
// request body on a public route.
const TO_ADDRESS = 'customerservice@taxappealusa.com';
const FROM_ADDRESS = 'TaxAppeal USA <customerservice@taxappealusa.com>';

const MESSAGE_LIMIT = 2000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Two windows. The short one stops someone hammering the form; the long one
  // caps the damage a patient script can do over an hour.
  if (await enforceRateLimit(req, res, 'contact', 3, 600)) return;
  if (await enforceRateLimit(req, res, 'contact', 15, 3600)) return;

  const body = req.body || {};

  // Honeypot. The field is hidden from sight in the browser, so a real person
  // cannot fill it. Return 200 rather than an error — telling a bot it was
  // detected only teaches whoever wrote it to try again differently.
  if (body.company) return res.status(200).json({ success: true });

  const name = cap(String(body.name || '').trim(), LIMITS.name);
  const email = cap(String(body.email || '').trim(), LIMITS.email);
  const message = cap(String(body.message || '').trim(), MESSAGE_LIMIT);

  if (!email || !message) {
    return res.status(400).json({ error: 'Email address and message are both required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'That email address does not look right.' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[contact] RESEND_API_KEY missing. Cannot send.');
    // 503 so the form can honestly tell the customer to email us directly rather
    // than claiming their message was sent when it was not.
    return res.status(503).json({ error: 'Contact form unavailable.' });
  }

  // Where they were when they got stuck. This is SUPPORT CONTEXT, not tracking —
  // nothing is stored, it only rides along in the email so the reply can be useful
  // instead of starting with "which property are you asking about?".
  const ctx = body.context && typeof body.context === 'object' ? body.context : {};
  const contextRows = [
    ['Step', cap(String(ctx.step || ''), 60)],
    ['Property', cap(String(ctx.address || ''), LIMITS.address)],
    ['County', cap(String(ctx.county || ''), LIMITS.county)],
    ['State', cap(String(ctx.state || ''), 8)],
  ].filter(([, v]) => v);

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: [TO_ADDRESS],
      reply_to: email,
      subject: `Help request from ${name || email}`,
      html: `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0F1F3D;max-width:600px;">
  <h2 style="font-size:17px;margin:0 0 4px;">Help request from the application form</h2>
  <p style="margin:0 0 18px;color:#5A6B82;font-size:13px;">Reply to this email and it goes straight back to them.</p>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 12px 6px 0;color:#8596AF;width:90px;">Name</td><td style="padding:6px 0;">${escapeHtml(name) || '<em style="color:#8596AF;">not given</em>'}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#8596AF;">Email</td><td style="padding:6px 0;">${escapeHtml(email)}</td></tr>
    ${contextRows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#8596AF;">${escapeHtml(k)}</td><td style="padding:6px 0;">${escapeHtml(v)}</td></tr>`).join('')}
  </table>
  <div style="margin-top:18px;padding:16px;background:#F4F7FC;border-radius:8px;white-space:pre-wrap;line-height:1.6;">${escapeHtml(message)}</div>
</div>`,
      text: `Help request from the application form\n\nName: ${name || 'not given'}\nEmail: ${email}\n${contextRows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${message}\n`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[contact] Resend failed:', err?.message);
    return res.status(502).json({ error: 'Could not send your message.' });
  }
}
