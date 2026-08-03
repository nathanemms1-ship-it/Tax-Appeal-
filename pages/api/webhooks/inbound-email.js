/**
 * Inbound decision-letter parser.
 *
 * ============================================================================
 * THIS ROUTE WAS COMPLETELY UNAUTHENTICATED
 * ============================================================================
 * Any anonymous POST could:
 *   1. spend our Anthropic budget (a Sonnet call per request, no limiter),
 *   2. overwrite dispute_status / savings_amount / decision_detail on a real
 *      customer's order — the address match used ILIKE with the caller's own
 *      string interpolated into the pattern, so "%" matched the newest order in
 *      the table and let the caller pick a victim without knowing anything, and
 *   3. cause an email to be sent to that customer from customerservice@taxappealusa.com,
 *      DKIM-signed by us, with attacker-controlled text in the body.
 *
 * Fixed here: shared-secret auth that fails CLOSED, LIKE-wildcard escaping, a
 * minimum-specificity requirement on the address match, a column allowlist instead
 * of select('*') (which was pulling bcrypt password hashes into memory), and HTML
 * escaping on every value interpolated into the outbound email.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { requireWebhookSecret, escapeHtml, escapeLike } from '../../../lib/webhookAuth';
import { LIMITS, cap, PROMPT_ROUTE_CONFIG } from '../../../lib/inputLimits';
import { checkSpend } from '../../../lib/spendGuard';

export const config = PROMPT_ROUTE_CONFIG;

// Constructed lazily, INSIDE the handler, after authentication.
//
// At module scope, createClient() throws "supabaseUrl is required" the moment the env
// var is absent — and a module-scope throw makes the route return 500 before the auth
// check runs. That is the wrong failure: a misconfigured deployment then reports
// "Internal Server Error" instead of "webhook not configured", and no log line ever
// says which variable is missing. Auth first, dependencies second.
let _anthropic = null;
let _supabase = null;
let _resend = null;

function clients() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return { anthropic: _anthropic, supabase: _supabase, resend: _resend };
}

// Only the columns this route actually reads. select('*') shipped every column of
// the orders row, including the password hash, into this function's memory and
// into any log line that stringified it.
const ORDER_FIELDS = 'id, customer_name, customer_email, property_address, account_number, dispute_status';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (requireWebhookSecret(req, res, 'INBOUND_EMAIL_SECRET')) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[inbound-email] Supabase env vars missing. Refusing.');
    return res.status(503).json({ error: 'Not configured.' });
  }
  const { anthropic, supabase, resend } = clients();

  const { From, Subject, TextBody, HtmlBody } = req.body || {};
  const emailBody = TextBody || HtmlBody || '';

  if (!emailBody) {
    console.warn('[inbound-email] Empty body received, skipping.');
    return res.status(200).json({ received: true, skipped: 'empty_body' });
  }

  // ── Step 1: Use Claude to parse the appeal decision ──
  // Authenticated now, but still metered: a provider retry storm or a loop on their
  // side would otherwise spend without limit. See lib/spendGuard.js.
  if (!(await checkSpend('anthropic', 1)).ok) {
    console.error('[inbound-email] daily Anthropic ceiling reached; asking the sender to retry.');
    // 503 so the mail provider retries later rather than dropping the decision letter.
    return res.status(503).json({ error: 'Capacity reached, retry later.' });
  }

  let parsed;
  try {
    const parseResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are parsing a property tax appeal decision letter from a county assessor's office.

Return ONLY a valid JSON object — no preamble, no markdown:

{
  "decision": "approved" | "denied" | "partial",
  "savings_amount": <number — estimated annual dollar savings, 0 if denied>,
  "property_address": "<full street address if mentioned, or null>",
  "account_number": "<property account or parcel number if mentioned, or null>",
  "summary": "<2–3 sentence plain English summary written directly to the homeowner>",
  "confidence": "high" | "medium" | "low"
}

Email Subject: ${cap(Subject, 300)}
Email From: ${cap(From, LIMITS.email)}
Email Body:
${emailBody.substring(0, 4000)}`
      }]
    });

    const raw = parseResponse.content[0].text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(raw);
    console.log('[inbound-email] Claude parsed:', JSON.stringify(parsed));
  } catch (e) {
    console.error('[inbound-email] Claude parse failed:', e.message);
    return res.status(200).json({ received: true, error: 'parse_failed' });
  }

  // ── Step 2: Match email to a customer order ──
  // Uses customer_email and property_address (actual column names)
  let order = null;

  if (parsed.property_address) {
    const parts = String(parsed.property_address).trim().split(/\s+/);
    const streetNum = parts[0] || '';
    const streetWord = parts[1] || '';

    // Require a real street number AND a street word before matching. Without this,
    // a one-token address produced the pattern `%7%%` and matched the newest order
    // whose address contains a 7 — which is most of them.
    const specificEnough = /^\d{1,8}[A-Za-z]?$/.test(streetNum) && streetWord.length >= 2;

    if (specificEnough) {
      const { data } = await supabase
        .from('orders')
        .select(ORDER_FIELDS)
        .ilike('property_address', `%${escapeLike(streetNum)}%${escapeLike(streetWord)}%`)
        .order('created_at', { ascending: false })
        .limit(2);

      // Two matches means we cannot tell which customer this letter is about. Do
      // not guess: writing the wrong decision onto the wrong order and emailing
      // that customer about it is worse than not matching at all.
      if (data?.length === 1) order = data[0];
      else if (data?.length > 1) {
        console.error('[inbound-email] Ambiguous address match, refusing to guess.', {
          parsedAddress: parsed.property_address,
        });
        return res.status(200).json({ received: true, matched: false, reason: 'ambiguous' });
      }
    } else {
      console.warn('[inbound-email] Parsed address too vague to match:', parsed.property_address);
    }
  }

  if (!order && parsed.account_number) {
    const { data } = await supabase
      .from('orders')
      .select(ORDER_FIELDS)
      .eq('account_number', cap(parsed.account_number, LIMITS.parcelId))
      .limit(1);

    if (data?.length) order = data[0];
  }

  if (!order) {
    console.error('[inbound-email] No customer match found.', {
      subject: Subject,
      from: From,
      parsedAddress: parsed.property_address,
      parsedAccount: parsed.account_number
    });
    return res.status(200).json({ received: true, matched: false });
  }

  // ── Step 3: Update Supabase order ──
  // parsed.* is model output derived from an inbound email. Constrain it to the
  // three values the rest of the app switches on rather than writing whatever
  // string came back into dispute_status.
  const DECISIONS = ['approved', 'denied', 'partial'];
  if (!DECISIONS.includes(parsed.decision)) {
    console.error('[inbound-email] Unrecognised decision value, not writing:', parsed.decision);
    return res.status(200).json({ received: true, matched: true, error: 'bad_decision' });
  }

  const savings = Number(parsed.savings_amount);
  const safeSavings = Number.isFinite(savings) && savings > 0 ? Math.round(savings) : 0;
  const summary = cap(parsed.summary, 1200);

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      dispute_status: parsed.decision,
      decision_date: new Date().toISOString(),
      decision_detail: summary,
      savings_amount: safeSavings,
      actual_savings: safeSavings,
      raw_email_content: emailBody.substring(0, 10000)
    })
    .eq('id', order.id);

  if (updateError) {
    console.error('[inbound-email] Supabase update failed:', updateError.message);
    return res.status(200).json({ received: true, error: 'db_update_failed' });
  }

  // ── Step 4: Notify the customer via email ──
  // Use customer_name and customer_email (actual column names)
  const isGoodNews = parsed.decision === 'approved' || parsed.decision === 'partial';
  // Escaped: the name comes from our own DB but the summary is model output derived
  // from an inbound email, so it is untrusted text going into an HTML document that
  // we DKIM-sign. An unescaped </div><a href=...> in there is a phishing email
  // sent by us, to our own customer, from our own domain.
  const firstName = escapeHtml(order.customer_name?.split(' ')[0] || 'there');
  const safeSummary = escapeHtml(summary);
  const savingsDisplay = safeSavings > 0
    ? `$${safeSavings.toLocaleString()}`
    : null;

  try {
    await resend.emails.send({
      from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
      to: order.customer_email,
      subject: isGoodNews
        ? `🎉 Your appeal was ${parsed.decision === 'approved' ? 'approved' : 'partially approved'}!`
        : `Your property tax appeal decision has arrived`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif;">
<div style="max-width:580px;margin:40px auto;padding:0 16px 40px;">
  <div style="text-align:center;padding:32px 0 24px;">
    <span style="font-size:22px;font-weight:700;color:#0f172a;">
      <span style="color:#22c55e;">Tax</span>Appeal USA
    </span>
  </div>
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:${isGoodNews ? '#22c55e' : '#ef4444'};padding:32px 36px;text-align:center;">
      <div style="font-size:48px;line-height:1;margin-bottom:12px;">${isGoodNews ? '🎉' : '📋'}</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;">
        ${isGoodNews ? 'Great News!' : 'Decision Received'}
      </h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">
        Your appeal has been reviewed by the county
      </p>
    </div>
    <div style="padding:36px;">
      <p style="font-size:16px;color:#334155;margin:0 0 20px;">Hi ${firstName},</p>
      <p style="font-size:16px;color:#334155;line-height:1.7;margin:0 0 28px;">${safeSummary}</p>
      ${savingsDisplay ? `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:14px;padding:24px;text-align:center;margin:0 0 28px;">
        <div style="font-size:12px;font-weight:700;color:#15803d;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">
          Estimated Annual Savings
        </div>
        <div style="font-size:42px;font-weight:800;color:#16a34a;line-height:1;">${savingsDisplay}</div>
      </div>` : ''}
      <div style="text-align:center;margin:0 0 32px;">
        <a href="https://taxappealusa.com/portal"
           style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:15px 32px;border-radius:10px;font-size:16px;font-weight:600;">
          View Full Decision in Portal →
        </a>
      </div>
      <div style="border-top:1px solid #e2e8f0;padding-top:24px;text-align:center;">
        <p style="font-size:14px;color:#94a3b8;margin:0;">
          Questions? <a href="mailto:support@taxappealusa.com" style="color:#22c55e;text-decoration:none;">support@taxappealusa.com</a>
        </p>
      </div>
    </div>
  </div>
</div>
</body>
</html>`
    });
    console.log('[inbound-email] Notification sent to:', order.customer_email);
  } catch (emailErr) {
    console.error('[inbound-email] Resend failed:', emailErr.message);
  }

  return res.status(200).json({ success: true, matched: true, decision: parsed.decision, orderId: order.id });
}
