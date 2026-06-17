import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: verify the request came from Postmark
  // Postmark sends X-Postmark-Inbound-Token header matching your server token
  const postmarkToken = req.headers['x-postmark-inbound-token'];
  if (process.env.POSTMARK_INBOUND_TOKEN && postmarkToken !== process.env.POSTMARK_INBOUND_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { From, Subject, TextBody, HtmlBody } = req.body;
  const emailBody = TextBody || HtmlBody || '';

  if (!emailBody) {
    console.warn('[inbound-email] Empty body received, skipping.');
    return res.status(200).json({ received: true, skipped: 'empty_body' });
  }

  // ── Step 1: Use Claude to parse the appeal decision ──
  let parsed;
  try {
    const parseResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are parsing a property tax appeal decision letter received from a county assessor's office or appraisal district. 

Analyze this email and return ONLY a valid JSON object — no preamble, no markdown, no explanation:

{
  "decision": "approved" | "denied" | "partial",
  "savings_amount": <number — estimated annual property tax dollar savings, 0 if denied>,
  "property_address": "<full street address mentioned in the email, or null>",
  "account_number": "<property account or parcel number if mentioned, or null>",
  "summary": "<2–3 sentence plain English summary of the outcome written directly to the homeowner>",
  "confidence": "high" | "medium" | "low"
}

Rules:
- "approved" = assessed value reduced as requested
- "partial" = some reduction granted, less than requested  
- "denied" = no reduction, original assessment stands
- savings_amount: estimate from any reduced value × local tax rate if mentioned; otherwise 0 for denied
- summary: warm, clear tone — the homeowner may not understand legal/tax language

Email Subject: ${Subject}
Email From: ${From}
Email Body:
${emailBody.substring(0, 4000)}`
      }]
    });

    const raw = parseResponse.content[0].text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(raw);

    console.log('[inbound-email] Claude parsed:', JSON.stringify(parsed));
  } catch (e) {
    console.error('[inbound-email] Claude parse failed:', e.message);
    // Don't retry — log and move on so Postmark doesn't loop
    return res.status(200).json({ received: true, error: 'parse_failed' });
  }

  // ── Step 2: Match the email to a customer order ──
  let order = null;

  // Try matching on property address (street number + partial street name)
  if (parsed.property_address) {
    const parts = parsed.property_address.trim().split(/\s+/);
    const streetNum = parts[0];
    const streetWord = parts[1] || '';

    const { data } = await supabase
      .from('orders')
      .select('*')
      .ilike('property_address', `%${streetNum}%${streetWord}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data?.length) order = data[0];
  }

  // Fallback: try parcel/account number
  if (!order && parsed.account_number) {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('account_number', parsed.account_number)
      .limit(1);

    if (data?.length) order = data[0];
  }

  if (!order) {
    // Log for manual review — can be found in Vercel function logs
    console.error('[inbound-email] No customer match found.', {
      subject: Subject,
      from: From,
      parsedAddress: parsed.property_address,
      parsedAccount: parsed.account_number
    });
    // Return 200 so Postmark doesn't retry
    return res.status(200).json({ received: true, matched: false });
  }

  // ── Step 3: Update Supabase order record ──
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      dispute_status: parsed.decision,
      decision_date: new Date().toISOString(),
      decision_detail: parsed.summary,
      savings_amount: parsed.savings_amount || 0,
      raw_email_content: emailBody.substring(0, 10000)
    })
    .eq('id', order.id);

  if (updateError) {
    console.error('[inbound-email] Supabase update failed:', updateError.message);
    return res.status(200).json({ received: true, error: 'db_update_failed' });
  }

  // ── Step 4: Email the customer their result ──
  const isGoodNews = parsed.decision === 'approved' || parsed.decision === 'partial';
  const firstName = order.name?.split(' ')[0] || 'there';
  const savingsDisplay = parsed.savings_amount > 0
    ? `$${Number(parsed.savings_amount).toLocaleString()}`
    : null;

  try {
    await resend.emails.send({
      from: 'TaxAppeal USA <results@taxappealusa.com>',
      to: order.email,
      subject: isGoodNews
        ? `🎉 Your property tax appeal was ${parsed.decision === 'approved' ? 'approved' : 'partially approved'}!`
        : `Your property tax appeal decision has arrived`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:580px;margin:40px auto;padding:0 16px 40px;">

  <!-- Header -->
  <div style="text-align:center;padding:32px 0 24px;">
    <span style="font-size:22px;font-weight:700;color:#0f172a;">
      <span style="color:#22c55e;">Tax</span>Appeal USA
    </span>
  </div>

  <!-- Card -->
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <!-- Status Banner -->
    <div style="background:${isGoodNews ? '#22c55e' : '#ef4444'};padding:32px 36px;text-align:center;">
      <div style="font-size:48px;line-height:1;margin-bottom:12px;">
        ${isGoodNews ? '🎉' : '📋'}
      </div>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.3px;">
        ${isGoodNews ? 'Great News!' : 'Decision Received'}
      </h1>
      <p style="margin:8px 0 0;color:${isGoodNews ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.85)'};font-size:15px;">
        Your appeal has been reviewed by the county
      </p>
    </div>

    <!-- Body -->
    <div style="padding:36px;">
      <p style="font-size:16px;color:#334155;margin:0 0 20px;">Hi ${firstName},</p>
      <p style="font-size:16px;color:#334155;line-height:1.7;margin:0 0 28px;">
        ${parsed.summary}
      </p>

      ${savingsDisplay ? `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:14px;padding:24px;text-align:center;margin:0 0 28px;">
        <div style="font-size:12px;font-weight:700;color:#15803d;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">
          Estimated Annual Savings
        </div>
        <div style="font-size:42px;font-weight:800;color:#16a34a;line-height:1;">
          ${savingsDisplay}
        </div>
        <div style="font-size:14px;color:#4ade80;margin-top:6px;">per year on your property taxes</div>
      </div>
      ` : ''}

      <!-- CTA -->
      <div style="text-align:center;margin:0 0 32px;">
        <a href="https://taxappealusa.com/portal"
           style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:15px 32px;border-radius:10px;font-size:16px;font-weight:600;letter-spacing:-0.2px;">
          View Full Decision in Portal →
        </a>
      </div>

      <div style="border-top:1px solid #e2e8f0;padding-top:24px;text-align:center;">
        <p style="font-size:14px;color:#94a3b8;margin:0;">
          Questions? Reply to this email or reach us at
          <a href="mailto:support@taxappealusa.com" style="color:#22c55e;text-decoration:none;">
            support@taxappealusa.com
          </a>
        </p>
      </div>
    </div>
  </div>

  <p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:24px;">
    TaxAppeal USA · taxappealusa.com
  </p>
</div>
</body>
</html>`
    });

    console.log('[inbound-email] Notification sent to:', order.email);
  } catch (emailErr) {
    // Non-fatal — order is updated, email failure is recoverable
    console.error('[inbound-email] Resend failed:', emailErr.message);
  }

  return res.status(200).json({ success: true, matched: true, decision: parsed.decision, orderId: order.id });
}
