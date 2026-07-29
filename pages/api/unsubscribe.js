/**
 * One-click unsubscribe for filing-reminder emails.
 *
 * The reminder emails previously linked to `/apply?unsubscribe=true`, which has no
 * unsubscribe handling at all — the link simply dumped the recipient back into the
 * sales funnel. Combined with a daily send cadence and no postal address in the
 * footer, that is a CAN-SPAM problem, and a blocklisting of the reminders@ sender
 * would drag the transactional receipts from disputes@ down with it (same root
 * domain, same reputation).
 *
 * The token is an HMAC of the address, so a link can only unsubscribe the person it
 * was sent to — no login, and no ability to unsubscribe someone else by editing the
 * query string.
 *
 * Accepts GET (the link in the email) and POST (RFC 8058 List-Unsubscribe-Post,
 * which Gmail and Outlook now expect from bulk senders).
 */

import crypto from 'crypto';
import { getSupabaseAdmin } from './supabase';

function expectedToken(email) {
  const secret = process.env.INTERNAL_API_SECRET || '';
  return crypto.createHmac('sha256', secret).update(String(email).toLowerCase()).digest('hex').slice(0, 32);
}

function page(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — TaxAppeal USA</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
       background:#F2F6FA;color:#0F1F3D;display:flex;align-items:center;justify-content:center;
       min-height:100vh;margin:0;padding:24px;}
  .card{background:#fff;border-radius:14px;padding:40px;max-width:520px;text-align:center;
        box-shadow:0 2px 20px rgba(15,31,61,.08);}
  h1{font-size:22px;margin:0 0 12px;}
  p{font-size:15px;line-height:1.65;color:#4A5568;margin:0 0 8px;}
  a{color:#0B7A4B;font-weight:600;}
</style></head>
<body><div class="card">${body}</div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = String(req.query.email || (req.body && req.body.email) || '').trim().toLowerCase();
  const token = String(req.query.token || (req.body && req.body.token) || '').trim();

  if (!email || !token) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(page('Invalid link',
      `<h1>That link looks incomplete</h1>
       <p>Please use the unsubscribe link exactly as it appears in the email, or write to
       <a href="mailto:customerservice@taxappealusa.com">customerservice@taxappealusa.com</a>
       and we will remove you.</p>`));
  }

  const expected = expectedToken(email);
  const a = Buffer.from(token), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(403).send(page('Invalid link',
      `<h1>This link isn’t valid</h1>
       <p>It may have been altered. Email
       <a href="mailto:customerservice@taxappealusa.com">customerservice@taxappealusa.com</a>
       and we will unsubscribe you right away.</p>`));
  }

  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from('waitlist').update({ unsubscribed: true, unsubscribed_at: new Date().toISOString() }).eq('email', email);
    }
  } catch (e) {
    // Never show a failure page for an unsubscribe — log it and honour the request
    // in the UI. A user who thinks unsubscribe is broken files a spam complaint.
    console.error('unsubscribe write failed:', e.message);
  }

  // RFC 8058 one-click POST expects a bare 200, not HTML.
  if (req.method === 'POST') return res.status(200).json({ unsubscribed: true });

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(page('Unsubscribed',
    `<h1>You’re unsubscribed</h1>
     <p><strong>${email}</strong> will no longer receive filing-deadline reminders.</p>
     <p style="margin-top:16px;">You will still get transactional email about any filing you have already paid for —
     receipts, tracking, and the county’s decision.</p>
     <p style="margin-top:20px;"><a href="https://www.taxappealusa.com">Return to TaxAppeal USA</a></p>`));
}
