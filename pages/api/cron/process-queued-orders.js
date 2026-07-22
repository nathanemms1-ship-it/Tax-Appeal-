// pages/api/cron/process-queued-orders.js
// Fires daily. Finds pre-orders (dispute_status = 'queued') whose state/county filing
// window has now opened, dispatches them oldest-first via /api/send-letter, marks them
// filed, and sends the "your protest has been filed" follow-up email. No same-day
// completion required — a capped batch per run is fine; leftovers pick up next run.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getFilingWindowStatus } from '../../../lib/filingWindows';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Cap per run so we never risk a Vercel function timeout — remaining queued
// orders simply get picked up on the next day's run (Nathan: no same-day
// completion required).
const MAX_PER_RUN = 20;

function buildJustFiledEmail({ customerName, address, county, districtName, trackingNumber, letter }) {
  const firstName = customerName ? customerName.split(' ')[0] : 'there';
  const subject = `Your protest has been filed — ${address}`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FC;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#1B3A6B;border-radius:12px 12px 0 0;padding:28px 36px;text-align:center;">
          <div style="font-family:Georgia,serif;font-size:24px;color:#FFFFFF;margin-bottom:4px;">🏠 TaxAppeal</div>
          <div style="font-size:11px;color:#8596AF;letter-spacing:2px;text-transform:uppercase;">Property Tax Dispute</div>
        </td></tr>
        <tr><td style="background:#2E7D52;padding:16px 36px;text-align:center;">
          <div style="font-size:15px;font-weight:600;color:#FFFFFF;">📬 Your reserved protest has been filed!</div>
        </td></tr>
        <tr><td style="background:#FFFFFF;padding:36px;">
          <p style="font-size:16px;color:#0F1F3D;margin:0 0 16px;">Hi ${firstName},</p>
          <p style="font-size:14px;color:#5A6B82;line-height:1.7;margin:0 0 24px;">
            Your filing window just opened, and your reserved property tax protest for <strong>${address}</strong> has been submitted via <strong>USPS certified mail with return receipt</strong> to the ${districtName || county + ' Appraisal District'} — exactly as promised, ahead of the opening-day rush.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FC;border-radius:8px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8596AF;font-weight:600;margin-bottom:14px;">FILING SUMMARY</div>
              <table width="100%"><tr><td style="font-size:13px;color:#8596AF;">Property</td><td style="font-size:13px;color:#0F1F3D;font-weight:500;text-align:right;">${address}</td></tr></table>
              <table width="100%"><tr><td style="font-size:13px;color:#8596AF;">Filed with</td><td style="font-size:13px;color:#0F1F3D;font-weight:500;text-align:right;">${districtName || county + ' Appraisal District'}</td></tr></table>
              ${trackingNumber ? `<table width="100%"><tr><td style="font-size:13px;color:#8596AF;">USPS Tracking</td><td style="font-size:13px;color:#1B3A6B;font-weight:700;text-align:right;">${trackingNumber}</td></tr></table>` : ''}
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E6;border:1px solid #FFD97A;border-radius:8px;padding:16px;margin-bottom:24px;">
            <tr><td>
              <div style="font-size:13px;font-weight:700;color:#7A5C10;margin-bottom:6px;">⚖️ What happens next</div>
              <div style="font-size:13px;color:#7A5C10;line-height:1.6;">The appraisal district will review your protest and respond directly to you within 30–90 days. If they schedule a hearing, you can attend yourself or hire a licensed representative.</div>
            </td></tr>
          </table>
          ${letter ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E8EDF4;border-radius:8px;overflow:hidden;margin-bottom:8px;">
            <tr><td style="background:#F4F7FC;padding:12px 20px;border-bottom:1px solid #E8EDF4;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8596AF;font-weight:600;">YOUR DISPUTE LETTER — FOR YOUR RECORDS</div>
            </td></tr>
            <tr><td style="background:#FFFFFF;padding:28px 32px;font-family:Georgia,serif;font-size:12px;line-height:1.85;color:#111;white-space:pre-wrap;">${letter}</td></tr>
          </table>
          <div style="font-size:11px;color:#8596AF;text-align:center;margin-bottom:8px;">Keep this email as your official record of the protest that was filed.</div>
          ` : ''}
        </td></tr>
        <tr><td style="background:#0F1F3D;border-radius:0 0 12px 12px;padding:24px 36px;text-align:center;">
          <div style="font-size:13px;color:#8596AF;margin-bottom:8px;">Questions? Reply to this email or contact us at</div>
          <a href="mailto:disputes@taxappealusa.com" style="font-size:13px;color:#FFC940;text-decoration:none;">disputes@taxappealusa.com</a>
          <div style="font-size:11px;color:#3A4E6A;margin-top:16px;">© 2026 TaxAppeal USA · taxappealusa.com</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Your property tax protest for ${address} has been filed. Tracking: ${trackingNumber || 'Pending'}`;
  return { subject, html, text };
}

export default async function handler(req, res) {
  // Security: only allow Vercel cron or internal calls
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log(`[process-queued-orders] Running for ${new Date().toISOString()}`);

  let totalFiled = 0;
  let totalSkippedWindowClosed = 0;
  let totalErrored = 0;

  try {
    const { data: queuedOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('dispute_status', 'queued')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!queuedOrders?.length) {
      return res.status(200).json({ message: 'No queued orders', filed: 0 });
    }

    console.log(`[process-queued-orders] Found ${queuedOrders.length} queued orders`);

    for (const order of queuedOrders) {
      if (totalFiled >= MAX_PER_RUN) {
        console.log(`[process-queued-orders] Hit per-run cap of ${MAX_PER_RUN} — remaining orders will process next run`);
        break;
      }

      const stateCode = (order.state_code || '').toUpperCase().trim();
      if (!stateCode) {
        console.error(`[process-queued-orders] Order ${order.id} has no state_code — skipping (needs manual review)`);
        totalErrored++;
        continue;
      }

      const windowStatus = getFilingWindowStatus(stateCode, order.county);
      if (!windowStatus || !windowStatus.isOpen) {
        totalSkippedWindowClosed++;
        continue;
      }

      // Sanity: required fields must be present before we attempt to mail
      if (!order.district_name || !order.district_address || !order.letter_text || !order.owner_street) {
        console.error(`[process-queued-orders] Order ${order.id} missing required district/letter/owner fields — skipping (needs manual review)`);
        totalErrored++;
        continue;
      }

      const isFL = stateCode === 'FL';
      if (!isFL && !order.signed_at) {
        console.error(`[process-queued-orders] Order ${order.id} (non-FL) has no owner signature on file — skipping (needs manual review)`);
        totalErrored++;
        continue;
      }
      if (isFL && !order.fl_signature_name) {
        console.error(`[process-queued-orders] Order ${order.id} (FL) has no DR-486A signature on file — skipping (needs manual review)`);
        totalErrored++;
        continue;
      }

      try {
        const mailRes = await fetch('https://taxappealusa.com/api/send-letter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            districtName: order.district_name,
            districtAddress: order.district_address,
            districtCity: order.district_city,
            districtState: order.district_state,
            districtZip: order.district_zip,
            ownerName: order.customer_name,
            ownerStreet: order.owner_street,
            ownerCity: order.owner_city,
            ownerState: order.owner_state,
            ownerZip: order.owner_zip,
            ownerEmail: order.customer_email,
            letterContent: order.letter_text,
            propertyAddress: order.property_address,
            county: order.county,
            sessionId: order.stripe_session_id,
            stateCode,
            isFL,
            vabFee: order.vab_fee || 0,
            vabPayableTo: order.vab_payable_to || '',
            flSignatureName: order.fl_signature_name || '',
            flAuthDate: order.fl_auth_date || '',
            signedName: order.signature_typed_name || order.customer_name,
            signedAt: order.signed_at || '',
            signatureImage: order.signature_image || '',
          }),
        });

        const mailData = await mailRes.json();

        if (!mailRes.ok || !mailData.success) {
          console.error(`[process-queued-orders] send-letter failed for order ${order.id}:`, mailData.error);
          totalErrored++;
          continue;
        }

        const { error: updateErr } = await supabase
          .from('orders')
          .update({
            dispute_status: 'filed',
            lob_letter_id: mailData.letterId || null,
            lob_tracking_number: mailData.trackingNumber || null,
            lob_status: 'dispatched',
          })
          .eq('id', order.id);

        if (updateErr) {
          // Mail was sent but we couldn't mark it filed — flag loudly so this
          // doesn't get re-dispatched, needs a manual DB fix.
          console.error(`[process-queued-orders] CRITICAL: order ${order.id} mailed (letterId ${mailData.letterId}) but dispute_status update failed:`, updateErr.message);
          totalErrored++;
          continue;
        }

        totalFiled++;

        try {
          const { subject, html, text } = buildJustFiledEmail({
            customerName: order.customer_name,
            address: order.property_address,
            county: order.county,
            districtName: order.district_name,
            trackingNumber: mailData.trackingNumber,
            letter: order.letter_text,
          });
          await resend.emails.send({
            from: 'TaxAppeal USA <disputes@taxappealusa.com>',
            reply_to: 'customerservice@taxappealusa.com',
            to: [order.customer_email],
            subject,
            html,
            text,
          });
        } catch (emailErr) {
          console.error(`[process-queued-orders] Confirmation email failed for order ${order.id}:`, emailErr.message);
        }

        console.log(`[process-queued-orders] Filed order ${order.id} — tracking ${mailData.trackingNumber || 'n/a'}`);
      } catch (dispatchErr) {
        console.error(`[process-queued-orders] Error processing order ${order.id}:`, dispatchErr.message);
        totalErrored++;
      }
    }

    console.log(`[process-queued-orders] Done. Filed: ${totalFiled}, Skipped (window not open): ${totalSkippedWindowClosed}, Errored: ${totalErrored}`);

    return res.status(200).json({
      success: true,
      filed: totalFiled,
      skippedWindowClosed: totalSkippedWindowClosed,
      errored: totalErrored,
    });

  } catch (err) {
    console.error('[process-queued-orders] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
