import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getFilingWindowStatus } from '../../../lib/filingWindows';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmail({ name, state, county, propertyAddress, daysLeft, isFirstDay, filingUrl }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  const stateNames = { TX: 'Texas', GA: 'Georgia', FL: 'Florida' };
  const stateName = stateNames[state] || state;
  const location = county ? `${county}, ${stateName}` : stateName;

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
    ? `Great news, ${firstName}! The property tax protest filing window for ${location} just opened. You can now file your dispute and potentially save hundreds or thousands on your tax bill this year.`
    : `Hi ${firstName}, just a reminder that you have <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong> left to file your property tax protest in ${location}. Don't let the deadline pass — filing takes about 4 minutes and could save you significant money.`;

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
        <div style="font-size:14px;color:#1e293b;font-weight:500;">📍 ${propertyAddress}</div>
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
          ['💰', '$1,840 average savings per homeowner'],
          ['✅', '82% of protests result in a reduction'],
          ['📬', 'We handle everything — certified mail filing'],
          ['🔒', '$89 flat fee, no percentage cuts'],
        ].map(([icon, text]) => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;color:#475569;">
            <span>${icon}</span><span>${text}</span>
          </div>
        `).join('')}
      </div>

      <div style="border-top:1px solid #e2e8f0;padding-top:20px;margin-top:20px;text-align:center;">
        <p style="font-size:12px;color:#94a3b8;margin:0;">
          Questions? <a href="mailto:support@taxappealusa.com" style="color:#1B3A6B;text-decoration:none;">support@taxappealusa.com</a>
          <br><br>
          <a href="${filingUrl}?unsubscribe=true" style="color:#cbd5e1;font-size:11px;text-decoration:none;">Unsubscribe from filing reminders</a>
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

export default async function handler(req, res) {
  // Security: only allow Vercel cron or internal calls
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
      const { id, email, name, state, county, property_address, last_notified_at } = entry;

      // Check if this state/county window is currently open
      const stateUpper = (state || '').toUpperCase().trim();
      const windowStatus = getFilingWindowStatus(stateUpper, county);

      console.log(`[notify-waitlist] Checking ${email}: state=${stateUpper} county=${county} windowOpen=${windowStatus?.isOpen} daysLeft=${windowStatus?.daysLeft}`);

      if (!windowStatus || !windowStatus.isOpen) {
        console.log(`[notify-waitlist] Skipping ${email} — window not open`);
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
        console.log(`[notify-waitlist] Sent to ${email} (day ${(entry.notified_count || 0) + 1}, ${windowStatus.daysLeft} days left)`);
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
