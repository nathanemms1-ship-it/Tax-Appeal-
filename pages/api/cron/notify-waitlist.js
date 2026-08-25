import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getFilingWindowStatus } from '../../../lib/filingWindows';
import { isStateServable, STATE_NAMES, servingFrom } from '../../../lib/stateService';
import { isFlCountySupported } from '../../../lib/flVabAddresses';
import { getFlVabFee } from '../../../lib/flCountyFees';

/**
 * The two gates that decide whether we can file in a Florida county, in one place.
 *
 * These MUST stay identical to pages/api/send-letter.js:148-169 and to
 * applyResolvedCounty in pages/apply.js. If this one drifts looser than send-letter,
 * this cron emails someone "your county is confirmed, go file" and the funnel then
 * refuses them — which is worse than never writing at all, because they acted on it.
 * scripts/verify-fl-dispatch.mjs asserts the three agree.
 */
function flCountyFilable(county) {
  if (!county) return false;
  const fee = getFlVabFee(county);
  return isFlCountySupported(county) && fee?.confidence === 'confirmed';
}

// Constructed lazily, INSIDE the handler, after the CRON_SECRET check.
//
// At module scope, createClient() throws "supabaseUrl is required" as soon as the env
// var is absent, and a module-scope throw returns 500 before the auth check runs. On
// THIS route that is the wrong order twice over: a misconfigured deployment reports
// "Internal Server Error" instead of naming the missing variable, and the one check
// standing between a caller and 8 real certified mailings is not the first thing to
// execute. Auth first, dependencies second.
let _supabase = null;
let _resend = null;
function clients() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return { supabase: _supabase, resend: _resend };
}

// `email` is a parameter because the unsubscribe link needs it. It used to read
// `entry.email` from the caller's loop variable, which is not in scope here — so
// every call threw ReferenceError while building the footer, before Resend was
// ever reached. buildEmail() is called outside the per-entry try/catch, so the
// throw escaped to the handler's outer catch and returned 500 on the FIRST
// waitlist row: not one reminder had ever been sent, and the failure looked like
// a generic server error rather than a missing variable.
function buildEmail({ email, name, state, county, propertyAddress, daysLeft, isFirstDay, filingUrl }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  /**
   * THIS MAP WAS MISSING ARKANSAS AND ALABAMA — the two states whose signups are
   * the only reason a row sits here for a future season. `stateNames[state] ||
   * state` degrades silently to the CODE, so the email an Arkansas homeowner was
   * queued to receive read "Your AR filing window just opened" and headed itself
   * "Benton County, AR". It was the fifth hand-written copy of the same five-name
   * list in this repo. It now reads lib/stateService.js like everything else.
   */
  const stateName = STATE_NAMES[state] || state;
  // county and stateName land in an HTML email; escape at the point of assembly so
  // every downstream use (subject line, headline, body) inherits it.
  const location = county ? `${h(county)}, ${h(stateName)}` : h(stateName);

  const urgency = daysLeft <= 3 ? 'critical' : daysLeft <= 7 ? 'urgent' : daysLeft <= 14 ? 'warning' : 'normal';
  const urgencyColors = { critical: '#C0392B', urgent: '#E67E22', warning: '#F39C12', normal: '#1B3A6B' };
  const urgencyBg = { critical: '#FEE8E7', urgent: '#FEF9E7', warning: '#FFFDE7', normal: '#EEF3FB' };

  const subject = isFirstDay
    ? `🎉 Your ${stateName} filing window just opened — file today!`
    : daysLeft <= 3
    ? `🚨 URGENT: Only ${daysLeft} days left to file your property tax protest`
    : daysLeft <= 7
    ? `⏰ ${daysLeft} days left to file your ${stateName} property tax protest`
    : `📅 Reminder: ${daysLeft} days remaining to file your protest`;

  const headline = isFirstDay
    ? `Your Filing Window is Open!`
    : `${daysLeft} Days Left to File`;

  const message = isFirstDay
    ? `Great news, ${h(firstName)}! The property tax protest filing window for ${location} just opened. You can now file your dispute and potentially save hundreds or thousands on your tax bill this year.`
    : `Hi ${h(firstName)}, just a reminder that you have <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong> left to file your property tax protest in ${location}. Don't let the deadline pass — filing takes about 4 minutes and could save you significant money.`;

  return {
    subject,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:580px;margin:40px auto;padding:0 16px 40px;">

  <div style="text-align:center;padding:28px 0 20px;">
    <span style="font-size:20px;font-weight:700;color:#0F1F3D;">
      <span style="color:#22c55e;">Tax</span>Appeal USA
    </span>
  </div>

  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:${urgencyColors[urgency]};padding:28px 36px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">
        ${isFirstDay ? '🎉' : daysLeft <= 3 ? '🚨' : daysLeft <= 7 ? '⏰' : '📅'}
      </div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">${headline}</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">${location}</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 36px;">
      <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 24px;">${message}</p>

      ${propertyAddress ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Your Property</div>
        <div style="font-size:14px;color:#1e293b;font-weight:500;">📍 ${h(propertyAddress)}</div>
      </div>
      ` : ''}

      <!-- Deadline bar -->
      <div style="background:${urgencyBg[urgency]};border:1px solid ${urgencyColors[urgency]}40;border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:${urgencyColors[urgency]};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">
          Filing Window
        </div>
        <div style="font-size:28px;font-weight:800;color:${urgencyColors[urgency]};line-height:1;">
          ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${filingUrl}"
           style="display:inline-block;background:#1B3A6B;color:#fff;text-decoration:none;padding:16px 36px;border-radius:10px;font-size:16px;font-weight:600;letter-spacing:-0.2px;">
          File My Protest Now — $89 →
        </a>
        <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Takes about 4 minutes. You won't be charged until your letter is ready.</p>
      </div>

      <!-- Why file -->
      <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:12px;">Why file this year?</div>
        ${[
          ['💰', 'Flat $89 — we never take a percentage of your savings'],
          ['✅', 'Tracked USPS mail, so you have a record that you filed on time'],
          ['📬', 'You sign it, we mail it for you'],
          ['🔒', '$89 flat fee, no percentage cuts'],
        ].map(([icon, text]) => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;color:#475569;">
            <span>${icon}</span><span>${text}</span>
          </div>
        `).join('')}
      </div>

      <div style="border-top:1px solid #e2e8f0;padding-top:20px;margin-top:20px;text-align:center;">
        <p style="font-size:12px;color:#94a3b8;margin:0;">
          Questions? <a href="mailto:customerservice@taxappealusa.com" style="color:#1B3A6B;text-decoration:none;">customerservice@taxappealusa.com</a>
          <br><br>
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com'}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken(email)}" style="color:#cbd5e1;font-size:11px;text-decoration:none;">Unsubscribe from filing reminders</a>
        </p>
      </div>
    </div>
  </div>

  <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px;">
    TaxAppeal USA · taxappealusa.com
  </p>
</div>
</body>
</html>`
  };
}

/**
 * The two emails owed to someone we turned away because their county was not
 * confirmed. pages/apply.js FloridaCountyUnavailable makes exactly one promise —
 * "we'll write as soon as your county is confirmed, and only if there is still time
 * to file" — and these are the two ways that promise ends.
 *
 * Deliberately plain. These go to someone who tried to give us money and was told no;
 * the countdown-bar treatment the reminder emails use would read as marketing.
 */
function buildCountyConfirmedEmail({ name, county, propertyAddress, daysLeft, fee, payableTo }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  const feeLine = fee ? `$${(fee / 100).toFixed(0)}` : 'the county filing fee';
  return {
    subject: `${county} County is confirmed — you can file now`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:40px auto;padding:0 16px 40px;">
  <div style="text-align:center;padding:24px 0 18px;"><span style="font-size:20px;font-weight:700;color:#0F1F3D;"><span style="color:#22c55e;">Tax</span>Appeal USA</span></div>
  <div style="background:#fff;border-radius:16px;padding:32px 34px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <h1 style="margin:0 0 18px;font-size:21px;color:#0F1F3D;">${h(county)} County is confirmed</h1>
    <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 16px;">Hi ${h(firstName)} — when you came to us earlier we could not file in ${h(county)} County, because the county had not confirmed the details we need to get a petition delivered correctly. That has now come back to us.</p>
    <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 16px;">Their Value Adjustment Board filing fee is <strong>${h(feeLine)}</strong>${payableTo ? `, payable to ${h(payableTo)}` : ''}, and we have their petition mailing address confirmed. You can file.</p>
    ${propertyAddress ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin:0 0 18px;"><div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px;">Your property</div><div style="font-size:14px;color:#1e293b;">${h(propertyAddress)}</div></div>` : ''}
    <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 22px;"><strong>You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.</strong> Florida counts a petition as filed when it is physically received, so we stop accepting new filings while there is still enough time for yours to arrive.</p>
    <div style="text-align:center;margin:0 0 8px;"><a href="https://www.taxappealusa.com/apply" style="display:inline-block;background:#C9A84C;color:#0F1F3D;font-weight:700;font-size:16px;text-decoration:none;padding:14px 34px;border-radius:8px;">File my petition &rarr;</a></div>
  </div>
  <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:22px;line-height:1.6;">TaxAppeal USA · 3130 Sabine St, Ste B, Forest Hill, TX 76119<br/>You asked us to tell you when ${h(county)} County opened. This is that email.</p>
</div></body></html>`,
  };
}

function buildCountyMissedEmail({ name, county, propertyAddress }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  return {
    subject: `We could not get ${county} County confirmed in time`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:40px auto;padding:0 16px 40px;">
  <div style="text-align:center;padding:24px 0 18px;"><span style="font-size:20px;font-weight:700;color:#0F1F3D;"><span style="color:#22c55e;">Tax</span>Appeal USA</span></div>
  <div style="background:#fff;border-radius:16px;padding:32px 34px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <h1 style="margin:0 0 18px;font-size:21px;color:#0F1F3D;">We could not file in ${h(county)} County this year</h1>
    <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 16px;">Hi ${h(firstName)} — we said we would write to you either way, so here it is. ${h(county)} County did not confirm the details we need in time for us to get a petition delivered before this year's deadline, so we are not going to pretend otherwise or take your money at the last minute.</p>
    ${propertyAddress ? `<p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 16px;">This was for <strong>${h(propertyAddress)}</strong>.</p>` : ''}
    <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 16px;">You can still file the petition yourself directly with your county's Value Adjustment Board — you do not need us to do it, and the form (DR-486) is free from the Florida Department of Revenue. If you want to go that route, call your county clerk's VAB office and ask for the petition mailing address and the current filing fee. That is the same call we make.</p>
    <p style="font-size:15px;color:#334155;line-height:1.7;margin:0;">We have kept your details for next season and will write when the window opens, with ${h(county)} County confirmed by then. You were never charged.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:22px;line-height:1.6;">TaxAppeal USA · 3130 Sabine St, Ste B, Forest Hill, TX 76119</p>
</div></body></html>`,
  };
}

// Season cap per person. Opening reminder, midpoint, and a final warning.
const MAX_NOTIFICATIONS_PER_SEASON = 3;

import crypto from 'crypto';
import { requireCronSecret } from '../../../lib/webhookAuth';
import { escapeHtml as h } from '../../../lib/escape';

// Signed, per-address unsubscribe token so the link can't be used to unsubscribe
// somebody else, and doesn't require a login.
function unsubToken(email) {
  const secret = process.env.INTERNAL_API_SECRET || '';
  return crypto.createHmac('sha256', secret).update(String(email).toLowerCase()).digest('hex').slice(0, 32);
}

export default async function handler(req, res) {
  // Security: only allow Vercel cron or internal calls.
  // The old inline check compared against `Bearer ${process.env.CRON_SECRET}`, which
  // becomes the literal string "Bearer undefined" when the env var is missing — so an
  // unset secret authenticated anyone who guessed that. See lib/webhookAuth.js.
  if (requireCronSecret(req, res)) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[cron] Supabase env vars missing. Refusing.');
    return res.status(503).json({ error: 'Not configured.' });
  }
  const { supabase, resend } = clients();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();

  console.log(`[notify-waitlist] Running for ${today.toISOString()}`);

  let totalSent = 0;
  let totalSkipped = 0;
  let totalEnrolledNextYear = 0;

  try {
    // Get all waitlist entries for the current filing year
    const { data: waitlistEntries, error } = await supabase
      .from('waitlist')
      .select('*')
      .eq('filing_year', currentYear);

    if (error) throw error;
    if (!waitlistEntries?.length) {
      return res.status(200).json({ message: 'No waitlist entries for current year', sent: 0 });
    }

    console.log(`[notify-waitlist] Found ${waitlistEntries.length} waitlist entries`);

    for (const entry of waitlistEntries) {
      const { id, email, name, state, county, property_address, last_notified_at, blocked_reason } = entry;

      // Check if this state/county window is currently open
      const stateUpper = (state || '').toUpperCase().trim();
      const windowStatus = getFilingWindowStatus(stateUpper, county, { strict: true });

      console.log(`[notify-waitlist] Checking ${email}: state=${stateUpper} county=${county} blocked=${blocked_reason || 'no'} windowOpen=${windowStatus?.isOpen} daysLeft=${windowStatus?.daysUntilClose}`);

      /**
       * ==================================================================
       * COUNTY-BLOCKED ROWS ARE A DIFFERENT PROMISE AND MUST NOT FALL THROUGH
       * ==================================================================
       * These people were REFUSED at the funnel because their county's VAB address
       * or fee was unconfirmed (pages/apply.js FloridaCountyUnavailable). They have
       * paid nothing and are owed exactly one email: "your county is confirmed, and
       * there is still time" — or, at the end of the season, "we could not."
       *
       * The normal branch below would send them "🎉 Your Florida filing window just
       * opened — file today!" on 24 August. For their county it did not, and the
       * funnel would refuse them the moment they clicked. That is worse than
       * silence, because they acted on it. Hence the early `continue` on every path
       * out of this block.
       */
      /**
       * ==================================================================
       * ROWS THE REMINDER TRACK MUST NEVER EMAIL
       * ==================================================================
       * Both of these were reachable by the normal branch until 14 Aug 2026, and
       * both would have received "🎉 Your Florida filing window just opened — file
       * today!" with a $89 buy button on 24 August.
       *
       * fl_no_parcel_record — refused at the funnel because their property is not
       *   on the current DOR roll. Clicking that button gets them refused again.
       *   It was an accepted reason in join-waitlist.js with no branch here, which
       *   is the whole argument for lib/waitlistReasons.js and the build guard on
       *   it: the file that WRITES a reason and the file that READS it disagreed,
       *   and nothing said so.
       *
       * fl_not_eligible — NOT refused. /check told them truthfully that an appeal
       *   would not lower their bill, because Save Our Homes has capped their
       *   assessment below market. They asked to hear when THAT changes, which is
       *   their just value falling toward the capped one — not the filing window
       *   opening, which is the only thing this track knows how to say. Emailing
       *   them "file today" sells a filing that saves them nothing, which is the
       *   outcome pages/check.js exists to prevent.
       *
       * Neither is dead. Both need a trigger nobody has written yet, and silence
       * keeps the promise that was actually made until someone does.
       */
      if (blocked_reason === 'fl_no_parcel_record' || blocked_reason === 'fl_not_eligible') {
        totalSkipped++;
        console.log(`[notify-waitlist] skipping ${email} — ${blocked_reason} is not on the reminder track`);
        continue;
      }

      /**
       * The same rows, before they carried a reason.
       *
       * pages/check.js posted `county: String(parcel.coNo)` — the DOR county
       * NUMBER, "29" rather than "Hillsborough" — and no blockedReason at all, so
       * every ineligible-homeowner signup landed as an ordinary null-reason row.
       * The tagging fix only marks rows created from now on; these are already in
       * the table and are indistinguishable except by that numeric county, which
       * no other writer produces. A Florida row whose county is all digits came
       * from /check, and /check only offers that box on the "an appeal would NOT
       * lower your bill" result.
       *
       * Deliberately narrow: FL only, digits only. A row that reaches this and is
       * genuinely something else loses one reminder; the alternative is telling
       * someone we already told "no" to go and pay $89.
       */
      if (stateUpper === 'FL' && /^\d+$/.test(String(county || '').trim())) {
        totalSkipped++;
        console.log(`[notify-waitlist] skipping ${email} — numeric county ${county} means a pre-fix /check signup`);
        continue;
      }

      if (blocked_reason === 'fl_county_unconfirmed') {
        // canFile, not isOpen: it goes false at minDays before the hard deadline,
        // which is the last date a petition can still physically arrive in time.
        // Past that there is nothing to tell them to do.
        const stillTime = !!windowStatus?.canFile;
        const seasonGone = !!windowStatus && !windowStatus.canFile && !windowStatus.canPreOrder;
        const filable = flCountyFilable(county);

        if (filable && stillTime) {
          const fee = getFlVabFee(county);
          const mail = buildCountyConfirmedEmail({
            name, county, propertyAddress: property_address,
            daysLeft: windowStatus.daysUntilHard,
            fee: fee?.vabFee, payableTo: fee?.payableTo,
          });
          try {
            await resend.emails.send({
              from: 'TaxAppeal USA <reminders@taxappealusa.com>',
              to: email, subject: mail.subject, html: mail.html,
            });
            // Clearing the reason hands the row back to the normal reminder track,
            // so they get the ordinary deadline nudges from here on.
            await supabase.from('waitlist').update({
              blocked_reason: null,
              last_notified_at: new Date().toISOString(),
              notified_count: (entry.notified_count || 0) + 1,
            }).eq('id', id);
            totalSent++;
            console.log(`[notify-waitlist] ${county} County confirmed — told ${email} (${windowStatus.daysUntilHard}d left)`);
          } catch (emailErr) {
            // Leave blocked_reason set so tomorrow's run tries again.
            console.error(`[notify-waitlist] county-confirmed email failed for ${email}:`, emailErr.message);
          }
          continue;
        }

        if (seasonGone) {
          const mail = buildCountyMissedEmail({ name, county, propertyAddress: property_address });
          try {
            await resend.emails.send({
              from: 'TaxAppeal USA <reminders@taxappealusa.com>',
              to: email, subject: mail.subject, html: mail.html,
            });
            // Roll them to next season and take the row out of this year's set, so
            // the "we could not" email can only ever be sent once.
            const nextYear = currentYear + 1;
            const { data: already } = await supabase.from('waitlist').select('id')
              .eq('email', email.toLowerCase()).eq('state', stateUpper)
              .eq('filing_year', nextYear).limit(1);
            if (!already?.length) {
              await supabase.from('waitlist').insert({
                email: email.toLowerCase(), name, state: stateUpper, county,
                property_address, filing_year: nextYear, notified_count: 0,
              });
              totalEnrolledNextYear++;
            }
            await supabase.from('waitlist').delete().eq('id', id);
            totalSent++;
            console.log(`[notify-waitlist] season closed with ${county} unconfirmed — told ${email}`);
          } catch (emailErr) {
            console.error(`[notify-waitlist] county-missed email failed for ${email}:`, emailErr.message);
          }
          continue;
        }

        // Still unconfirmed, still time. Say nothing — there is nothing to say yet.
        totalSkipped++;
        continue;
      }

      /**
       * ANY OTHER BLOCK: NEVER SEND THE GENERIC "YOUR WINDOW IS OPEN" EMAIL.
       *
       * `fl_no_parcel_record` is the live case — someone whose property we could
       * not find on the Florida roll. The window opening changes nothing for them:
       * we still cannot identify their parcel, so "file today!" would send them
       * back into a funnel that refuses them again. They were told to email us
       * their folio number and that a human would look; that is the open promise,
       * and it is not one a cron can keep.
       *
       * Written as a catch-all on purpose. The default for an unrecognised block
       * must be silence, not the marketing email — a new reason added above
       * without a branch here should send nothing rather than the wrong thing.
       */
      if (blocked_reason) {
        console.log(`[notify-waitlist] Skipping ${email} — blocked_reason=${blocked_reason}, no generic reminder`);
        totalSkipped++;
        continue;
      }

      if (!windowStatus || !windowStatus.isOpen) {
        console.log(`[notify-waitlist] Skipping ${email} — window not open`);
        totalSkipped++;
        continue;
      }

      /**
       * ==================================================================
       * AN OPEN WINDOW IS NOT THE SAME THING AS A STATE WE WILL SELL IN
       * ==================================================================
       * Added 25 Aug 2026 alongside the Arkansas/Alabama capture forms, and it is
       * the half of that feature that makes the promise keepable.
       *
       * These rows are stamped `filing_year` by waitlistFilingYear(), which reads
       * SERVING_FROM — so an Arkansas signup made today sits at 2027 and this loop
       * ignores it until then. But it only ever moves a row FORWARD at the moment
       * it is written. If Arkansas is not ready in 2027 and SERVING_FROM.AR is
       * pushed to 2028, every row already stamped 2027 stays stamped 2027, and on
       * 1 June 2027 — the day AR's window opens — this branch would send them
       * "🎉 Your Arkansas filing window just opened — file today!" with a $89
       * button, and pages/apply.js would refuse them at the state selector.
       *
       * This file already argues the point twice, about county-blocked rows: an
       * email somebody ACTS on and is then refused is worse than no email at all.
       * The same reasoning, one level up. The filing window is the state's fact;
       * whether we can post the envelope is ours, and only ours gates the send.
       *
       * Silence, not a substitute email. When we are genuinely ready the row is
       * still here and the next run sends the real thing.
       */
      if (!isStateServable(stateUpper)) {
        console.log(`[notify-waitlist] Skipping ${email} — ${stateUpper} window is open but we do not file there until ${servingFrom(stateUpper)}`);
        totalSkipped++;
        continue;
      }

      // Check if already notified today
      if (last_notified_at) {
        const lastNotified = new Date(last_notified_at);
        lastNotified.setHours(0, 0, 0, 0);
        if (lastNotified.getTime() === today.getTime()) {
          console.log(`[notify-waitlist] Already notified today: ${email}`);
          totalSkipped++;
          continue;
        }
      }

      // Check if they've already filed this year (exist in orders)
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, created_at')
        .eq('customer_email', email.toLowerCase())
        .eq('state', state)
        .gte('created_at', `${currentYear}-01-01`)
        .limit(1);

      if (existingOrder?.length) {
        // They filed! Enroll them in next year's waitlist
        console.log(`[notify-waitlist] ${email} already filed — enrolling in next year`);

        const nextYear = currentYear + 1;
        const { data: alreadyEnrolled } = await supabase
          .from('waitlist')
          .select('id')
          .eq('email', email.toLowerCase())
          .eq('state', state)
          .eq('filing_year', nextYear)
          .limit(1);

        if (!alreadyEnrolled?.length) {
          await supabase.from('waitlist').insert({
            email: email.toLowerCase(),
            name,
            state,
            county,
            property_address,
            filing_year: nextYear,
            notified_count: 0,
            enrolled_from_order: true,
          });
          totalEnrolledNextYear++;
          console.log(`[notify-waitlist] Enrolled ${email} for ${nextYear}`);
        }

        // Remove from current year waitlist since they filed
        await supabase.from('waitlist').delete().eq('id', id);
        continue;
      }

      // Window is open, not yet filed, not notified today — send email!
      const filingUrl = `https://taxappealusa.com/apply`;
      const emailContent = buildEmail({
        email,
        name,
        state,
        county,
        propertyAddress: property_address,
        daysLeft: windowStatus.daysUntilClose,
        isFirstDay: windowStatus.isFirstDay,
        filingUrl,
      });

      try {
        await resend.emails.send({
          from: 'TaxAppeal USA <reminders@taxappealusa.com>',
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        // Update last_notified_at and increment count
        await supabase
          .from('waitlist')
          .update({
            last_notified_at: new Date().toISOString(),
            notified_count: (entry.notified_count || 0) + 1,
          })
          .eq('id', id);

        totalSent++;
        console.log(`[notify-waitlist] Sent to ${email} (day ${(entry.notified_count || 0) + 1}, ${windowStatus.daysUntilClose} days left)`);
      } catch (emailErr) {
        console.error(`[notify-waitlist] Email failed for ${email}:`, emailErr.message);
      }
    }

    console.log(`[notify-waitlist] Done. Sent: ${totalSent}, Skipped: ${totalSkipped}, Next year enrollments: ${totalEnrolledNextYear}`);

    return res.status(200).json({
      success: true,
      sent: totalSent,
      skipped: totalSkipped,
      enrolledNextYear: totalEnrolledNextYear,
      date: today.toISOString(),
    });

  } catch (err) {
    console.error('[notify-waitlist] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
