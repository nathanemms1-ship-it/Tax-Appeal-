// pages/api/register-referrer.js
// Handles /partners form submission — creates a referral code and saves to Supabase
import { getSupabaseAdmin } from './supabase';
import { Resend } from 'resend';
import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { escapeHtml } from '../../lib/webhookAuth';
import { LIMITS, cap } from '../../lib/inputLimits';
import { BUSINESS_NAME, LEGAL_ENTITY, BUSINESS_ADDRESS, SUPPORT_EMAIL } from '../../lib/businessInfo';
import { coverageSentence } from '../../lib/serviceCoverage';
import { MIN_ORDER_AGE_DAYS } from '../../lib/referralSettlement';

const resend = new Resend(process.env.RESEND_API_KEY);

// Signed partner links. See lib/partnerToken.js — a forwarded URL must not be a
// credential, and the payout-binding link is the one that moves money.
import { partnerToken } from '../../lib/partnerToken';

/**
 * ============================================================================
 * THE SHARED BLOCKS BELOW EXIST BECAUSE THE SAME CLAIM WAS WRONG TWICE
 * ============================================================================
 * This file sends two emails — a welcome and a "you already have a code"
 * reminder — and they were near-identical copies. The partner script, the payout
 * setup box, the tax note and the footer were each written out twice, so every
 * defect below was present in duplicate and a fix applied to one would have
 * silently left the other wrong:
 *
 *   "they prepare and mail your property tax protest for $89 flat"
 *     Wrong in Florida, which is the season this program was built for. Florida
 *     adds a mandatory county VAB filing fee of $15–$50 set by statute per county
 *     (lib/flCountyFees.js), so the real total is $104–$139. And this is the
 *     sentence a partner pastes to their own client, in their own name — a price
 *     we overstate here is a price a real estate agent gets held to.
 *
 *   "Stripe will issue a 1099-NEC"
 *   "Stripe also handles your W-9 and any required 1099 tax forms automatically"
 *     Only true if Stripe tax reporting is enabled on the platform account. It is
 *     a setting, not a law of nature. If it is off, nobody files anything and the
 *     partner finds out in April. Stated as OUR obligation, which it is either way.
 *
 *   NO POSTAL ADDRESS ANYWHERE.
 *     CAN-SPAM (15 U.S.C. § 7704(a)(5)) requires a valid physical postal address
 *     in commercial email. The footer carried a name and a domain. These two are
 *     arguably transactional — the person just submitted a form asking for the
 *     link — but the partner program is a paid commercial relationship, the
 *     outreach campaign that drives people to that form is unambiguously
 *     commercial, and the address costs one line. It comes from lib/businessInfo.js
 *     so it is defined once for the site and the mail together.
 *
 * Written once here, used by both emails. Do not inline them again.
 */

/** The line a partner sends to their own client. The highest-risk string we ship. */
/**
 * THE ONLY WAY BACK INTO A DASHBOARD.
 *
 * Signing the dashboard link closed a real hole — anyone holding ?ref=CODE&email=EMAIL
 * could read a partner's earnings. It also removed the way partners got back in: they
 * used to be able to retype the URL from memory, which was precisely the problem.
 *
 * So the signed link has to live somewhere durable, and email is the only place a
 * partner reliably still has it weeks later. Without this, a partner who closes the
 * post-signup page can never see their dashboard again — and the campaign email tells
 * them to go and look at it.
 */
const dashboardBlock = (code, email) => `
<div style="background:#F4F7FC;border:1px solid #D7E3F4;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
<div style="font-size:13px;color:#0F1F3D;line-height:1.6;"><strong>Track your referrals.</strong><br>
<a href="${process.env.NEXT_PUBLIC_BASE_URL}/partners/dashboard?ref=${encodeURIComponent(code)}&amp;email=${encodeURIComponent(email)}&amp;token=${partnerToken(code, email)}" style="color:#1B3A6B;font-weight:600;">Open my partner dashboard &rarr;</a><br>
<span style="font-size:12px;color:#64748b;">This link is personal to you &mdash; it opens your earnings, so treat it like a password. It stays valid for 30 days; after that, request a fresh one from the partners page.</span></div>
</div>`;

/**
 * WHERE WE CAN ACTUALLY FILE — IN THE EMAIL, NOT ONLY ON THE PAGE.
 *
 * /partners has rendered coverageSentence() since 9 Aug. The partner EMAILS did
 * not, and the email is the artefact an agent keeps and refers back to weeks later
 * when they are deciding who to send.
 *
 * Eleven Florida counties are not sellable today — the VAB has not published the
 * mailing address or the filing fee we need, so apply.js refuses the order, takes
 * the homeowner's email and writes to them when the county confirms. That is the
 * right behaviour and it still reads as a broken product to an agent who was not
 * told. A realtor's FIRST referral bouncing is how you lose them permanently, and
 * they will not send a second one to find out whether it was a fluke.
 *
 * Derived, not written. It corrects itself the next time Nathan confirms a county
 * by phone, and collapses to "all 67" on its own when the last one lands — no copy
 * edit, and no chance of the email promising coverage the funnel refuses.
 */
const coverageBlock = () => `
<div style="background:#FFF8E6;border:1px solid #E5C76B;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
<div style="font-size:13px;color:#1B2A4A;line-height:1.7;"><strong>Before you send anyone:</strong> ${escapeHtml(coverageSentence())}</div>
</div>`;

const partnerScriptBlock = (referralLink) => `
<div style="background:#EAF3DE;border:1px solid #97C459;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
<div style="font-size:13px;color:#27500A;line-height:1.6;"><strong>What to tell your clients:</strong><br>"I use TaxAppeal USA for my clients — they prepare your property tax appeal, you sign it, and they mail it for you. $89 plus your county's filing fee, and no percentage of your savings. Here's the link: ${escapeHtml(referralLink)}"</div>
</div>`;

const payoutSetupBlock = (connectUrl) => `
<div style="background:#EEF3FB;border:1px solid #B5D4F4;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
<div style="font-size:12px;font-weight:700;color:#0C447C;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">Set up your payout account</div>
<p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 10px;">Connect your bank account through Stripe to receive monthly payouts. You'll provide your tax details to Stripe during setup — we never see your bank information. Payouts run on the 1st of each month for the previous month's completed referrals. Each order is held for ${MIN_ORDER_AGE_DAYS} days before it is paid, so a customer refund cannot land after you have been paid — a referral from the last few days of a month goes out in the following run. Until an account is connected your earnings keep accruing and go out in the first run after you connect.</p>
<a href="${connectUrl}" style="display:inline-block;background:#1B3A6B;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;">Connect Bank Account via Stripe →</a>
</div>`;

const taxNoteBlock = () => `
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
<p style="font-size:12px;color:#64748b;margin:0;line-height:1.7;"><strong style="color:#1e293b;">Tax note:</strong> Referral earnings are self-employment income. We do not withhold income taxes from your payouts — you are responsible for reporting and paying tax on them. If you receive $600 or more from us in a calendar year, we will arrange the required 1099-NEC using the details you provide to Stripe; keep your own record of what you receive either way. We suggest setting aside roughly 25–30% for tax. This is not tax advice — please ask your own accountant about your situation.</p>
</div>`;

/**
 * CAN-SPAM footer. The postal address is the legally required part; the opt-out
 * line is here because the partner programme is a commercial relationship and a
 * recipient needs a way out that does not depend on us reading their reply.
 */
const emailFooter = () => `
<div style="background:#f0f2f7;padding:16px 36px;text-align:center;border-top:1px solid #e5e8ef;font-size:12px;color:#94a3b8;line-height:1.7;">
${escapeHtml(BUSINESS_NAME)} · taxappealusa.com<br>
${escapeHtml(LEGAL_ENTITY)}<br>
${escapeHtml(BUSINESS_ADDRESS)}<br>
Don't want partner emails from us? Reply "unsubscribe" to <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}?subject=Unsubscribe" style="color:#64748b;">${escapeHtml(SUPPORT_EMAIL)}</a> and we'll remove you.
</div>`;

let redis = null;
try {
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (redisUrl && redisToken) {
redis = new Redis({ url: redisUrl, token: redisToken });
}
} catch (e) {
console.log('Redis init failed:', e.message);
}

const REMINDER_THROTTLE_SECONDS = 300; // don't resend the reminder more than once per 5 minutes per email

async function reminderRecentlySent(email) {
if (!redis) return false;
try {
const key = `referral-reminder:${email}`;
const val = await redis.get(key);
return !!val;
} catch (e) {
return false;
}
}

async function markReminderSent(email) {
if (!redis) return;
try {
const key = `referral-reminder:${email}`;
await redis.set(key, Date.now(), { ex: REMINDER_THROTTLE_SECONDS });
} catch (e) {}
}

function generateCode(firstName, lastName) {
const first = (firstName || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
const last = (lastName || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
if (!first || !last) return Math.random().toString(36).substring(2, 8).toUpperCase();
return `${first}-${last}`;
}

function referralLinkFor(code) {
return `${process.env.NEXT_PUBLIC_BASE_URL}/apply?ref=${code}`;
}

async function sendReminderEmail({ email, firstName, code, referralLink }) {
try {
await resend.emails.send({
from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
reply_to: 'customerservice@taxappealusa.com',
to: [email],
subject: `Your TaxAppeal referral link — here it is again`,
html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:-apple-system,sans-serif;">
<div style="max-width:580px;margin:40px auto;padding:0 16px 40px;">
<div style="text-align:center;padding:24px 0 16px;"><span style="font-size:20px;font-weight:700;color:#0F1F3D;">TaxAppeal <span style="color:#C9A84C;">USA</span></span></div>
<div style="background:#fff;border-radius:16px;overflow:hidden;">
<div style="background:#1B3A6B;padding:28px 36px;text-align:center;">
<h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Here's Your Referral Link</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Earn $20 for every client who files</p>
</div>
<div style="padding:32px 36px;">
<p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 20px;">Hi ${escapeHtml(firstName || 'there')}, looks like you already have a TaxAppeal referral link tied to this email address — here it is again. Share it with any homeowner whose property tax notice just arrived and you'll earn <strong>$20 for every completed order</strong>, paid monthly.</p>
<div style="background:#EEF3FB;border:1px solid #B5D4F4;border-radius:10px;padding:20px 24px;margin-bottom:20px;text-align:center;">
<div style="font-size:11px;font-weight:700;color:#0C447C;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Your Referral Link</div>
<div style="font-size:14px;color:#0C447C;font-weight:600;word-break:break-all;">${escapeHtml(referralLink)}</div>
<div style="font-size:11px;color:#378ADD;margin-top:6px;">Your code: <strong>${escapeHtml(code)}</strong></div>
</div>
${payoutSetupBlock(`${process.env.NEXT_PUBLIC_BASE_URL}/partners/connect?ref=${encodeURIComponent(code)}&amp;email=${encodeURIComponent(email)}&amp;name=${encodeURIComponent(firstName || '')}&amp;token=${partnerToken(code, email)}`)}
${dashboardBlock(code, email)}
${coverageBlock()}
${partnerScriptBlock(referralLink)}
${taxNoteBlock()}
<p style="font-size:13px;color:#64748b;margin:0;">Didn't request this? You can ignore this email, or reply to <a href="mailto:customerservice@taxappealusa.com" style="color:#1B3A6B;">customerservice@taxappealusa.com</a> with questions.</p>
</div>
${emailFooter()}
</div>
</div>
</body>
</html>`,
});
} catch (emailErr) {
console.error('Referral reminder email failed:', emailErr.message);
}
}

export default async function handler(req, res) {
if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // partner-program abuse surface. The per-minute cap alone still allowed 7,200
  // emails a day from customerservice@taxappealusa.com off a single IP, which is a
  // domain-reputation problem before it is a cost problem — mail we send that
  // nobody asked for is what gets a sending domain blocklisted.
  if (await enforceRateLimit(req, res, 'referrer', 5, 60)) return;
  if (await enforceRateLimit(req, res, 'referrer', 20, 3600)) return;

const body = req.body || {};
// These values are interpolated into the referral CODE, into a URL, and into an
// HTML email we DKIM-sign. Bound the length before any of that happens.
const firstName = cap(body.firstName, LIMITS.name);
const lastName = cap(body.lastName, LIMITS.name);
const email = cap(body.email, LIMITS.email);
const phone = cap(body.phone, LIMITS.phone);
const role = cap(body.role, 120);
const statesActive = cap(body.statesActive, 200);
const clientVolume = cap(body.clientVolume, 120);
if (!firstName || !lastName || !email) {
return res.status(400).json({ error: 'First name, last name, and email are required' });
}

const supabase = getSupabaseAdmin();
if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

const normalizedEmail = email.toLowerCase().trim();

try {
// Check for duplicate email — each email is tied to exactly one referral code
const { data: existing } = await supabase
.from('referrals')
.select('id, code, first_name')
.eq('email', normalizedEmail)
.single();

if (existing) {
const referralLink = referralLinkFor(existing.code);
const alreadySentRecently = await reminderRecentlySent(normalizedEmail);
if (!alreadySentRecently) {
await sendReminderEmail({
email: normalizedEmail,
firstName: existing.first_name || firstName,
code: existing.code,
referralLink,
});
await markReminderSent(normalizedEmail);
}
const message = alreadySentRecently ? 'You already have a referral code — here it is (we emailed it to you recently, check your inbox)' : 'You already have a referral code — we emailed it to you again';
// Do NOT return the code or link here. This endpoint is unauthenticated, so
// returning them turned "email in, referral code out" into an oracle — and the
// code alone was enough to hijack that partner's payout destination. We email it
// to the address on file instead, which is the only party entitled to it.
return res.status(200).json({ success: true, duplicate: true, message });
}

/**
 * THE CODE IS CLAIMED BY INSERTING IT, NOT BY ASKING FIRST.
 *
 * This was a read-then-insert: SELECT to see whether the code was taken, then INSERT
 * if it was not. Two people named John Smith registering in the same second both read
 * "free" and both inserted JSMITH, because nothing between the read and the write
 * stopped them — the same shape as the settlement claim fixed in b1475da.
 *
 * A duplicated code is not cosmetic. lib/referralSettlement.js keyed partners by code
 * and last writer won, so one of the two collected every order attributed to it and
 * the other silently got nothing. That function now refuses to pay a duplicated code
 * at all, and this makes the collision nearly impossible in the first place.
 *
 * Needs the UNIQUE index from scripts/sql/referrals_code_unique.sql. Without it 23505
 * never fires and this degrades to the old behaviour — which is why the retry loop
 * still generates a distinct candidate each pass rather than relying on the error.
 */
let code = null;
let data = null;
let error = null;

for (let attempt = 0; attempt < 5; attempt++) {
const candidate = attempt === 0
? generateCode(firstName, lastName)
: `${generateCode(firstName, lastName)}-${attempt + 1}`;

const inserted = await supabase
.from('referrals')
.insert({
code: candidate,
first_name: firstName.trim(),
last_name: lastName.trim(),
name: `${firstName.trim()} ${lastName.trim()}`,
email: normalizedEmail,
phone: phone || null,
role: role || null,
states_active: statesActive || null,
client_volume: clientVolume || null,
active: true,
total_referrals: 0,
total_paid: 0,
})
.select()
.single();

// 23505 is the UNIQUE index rejecting a code someone else already holds. That is
// the guard working — take the next candidate. Any other error is real.
if (inserted.error && inserted.error.code === '23505') { error = inserted.error; continue; }

data = inserted.data;
error = inserted.error;
code = candidate;
break;
}

if (!code && error) {
console.error('Referral insert error: could not allocate a unique code:', error);
return res.status(500).json({ error: 'Could not allocate a referral code. Please try again.' });
}

if (error) {
console.error('Referral insert error:', error);
return res.status(500).json({ error: error.message });
}

const referralLink = referralLinkFor(code);

// Send welcome email
try {
await resend.emails.send({
from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
reply_to: 'customerservice@taxappealusa.com',
to: [normalizedEmail],
subject: `Your TaxAppeal referral link is ready — earn $20 per client`,
html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:-apple-system,sans-serif;">
<div style="max-width:580px;margin:40px auto;padding:0 16px 40px;">
<div style="text-align:center;padding:24px 0 16px;"><span style="font-size:20px;font-weight:700;color:#0F1F3D;">TaxAppeal <span style="color:#C9A84C;">USA</span></span></div>
<div style="background:#fff;border-radius:16px;overflow:hidden;">
<div style="background:#1B3A6B;padding:28px 36px;text-align:center;">
<h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Your Referral Link is Ready</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Earn $20 for every client who files</p>
</div>
<div style="padding:32px 36px;">
<p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 20px;">Hi ${escapeHtml(firstName)}, welcome to the TaxAppeal partner program. Your unique referral link is below — share it with any homeowner whose property tax notice just arrived and you'll earn <strong>$20 for every completed order</strong>, paid monthly.</p>
<div style="background:#EEF3FB;border:1px solid #B5D4F4;border-radius:10px;padding:20px 24px;margin-bottom:20px;text-align:center;">
<div style="font-size:11px;font-weight:700;color:#0C447C;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Your Referral Link</div>
<div style="font-size:14px;color:#0C447C;font-weight:600;word-break:break-all;">${escapeHtml(referralLink)}</div>
<div style="font-size:11px;color:#378ADD;margin-top:6px;">Your code: <strong>${escapeHtml(code)}</strong></div>
</div>
${payoutSetupBlock(`${process.env.NEXT_PUBLIC_BASE_URL}/partners/connect?ref=${encodeURIComponent(code)}&amp;email=${encodeURIComponent(normalizedEmail)}&amp;name=${encodeURIComponent(firstName.trim() + ' ' + lastName.trim())}&amp;token=${partnerToken(code, normalizedEmail)}`)}
${dashboardBlock(code, normalizedEmail)}
${coverageBlock()}
${partnerScriptBlock(referralLink)}
${taxNoteBlock()}
<p style="font-size:13px;color:#64748b;margin:0;">Questions? Reply to this email or contact <a href="mailto:customerservice@taxappealusa.com" style="color:#1B3A6B;">customerservice@taxappealusa.com</a></p>
</div>
${emailFooter()}
</div>
</div>
</body>
</html>`,
});
} catch (emailErr) {
console.error('Welcome email failed:', emailErr.message);
}

console.log('Referral created:', data.id, code, email);
// dashboardToken lets /partners build a working dashboard link straight after
// signup. The dashboard now refuses an unsigned request — see lib/partnerToken.js.
// The sharing link (referralLink) carries NO token: it is public by design and is
// meant to be handed to strangers.
return res.status(200).json({
  success: true, code, referralLink, name: data.name,
  dashboardToken: partnerToken(code, normalizedEmail),
});

} catch (err) {
console.error('Register referrer error:', err);
return res.status(500).json({ error: err.message });
}
}
