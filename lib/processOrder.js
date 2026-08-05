import { flCountyRequiresReceipt } from './flVabAddresses';
// lib/processOrder.js
// Shared dispatch logic for a single queued (pre-order) order — sends the letter via
// /api/send-letter, marks the order filed, and emails the "just filed" confirmation.
// Used by both pages/api/cron/process-queued-orders.js (automatic, daily, gated on
// filing-window status) and pages/api/process-order-now.js (manual admin override,
// no window gate — the admin has already decided to fire it). Keeping this in one
// place avoids the two copies drifting apart, which has bitten this codebase before
// (see the comment at the top of lib/filingWindows.js).

export function buildJustFiledEmail({ customerName, address, county, districtName, trackingNumber, letter }) {
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
            Your filing window just opened, and your reserved property tax protest for <strong>${address}</strong> has been submitted via <strong>trackable USPS mail</strong> to the ${districtName || county + ' Appraisal District'} — exactly as promised, ahead of the opening-day rush.
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
          <a href="mailto:customerservice@taxappealusa.com" style="font-size:13px;color:#FFC940;text-decoration:none;">customerservice@taxappealusa.com</a>
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

// Dispatches one queued order. Does NOT check filing-window status — the caller
// (cron or manual admin trigger) decides when it's appropriate to call this.
// Returns { success, error?, critical?, letterId?, trackingNumber? }.

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';

/**
 * Re-run the full property lookup and rebuild the petition immediately before it
 * is mailed.
 *
 * WHY: sales open 60 days before a state's filing window (PRE_ORDER_DAYS), but the
 * petition is generated at order time. For Florida that means a pre-order taken in
 * July is built from BatchData's PRIOR-year assessed value, because the 2026 TRIM
 * notice does not exist yet. Mailing that on Aug 24 would contest a figure the TRIM
 * notice has since replaced -- on a document the owner signed under penalty of
 * perjury. Refreshing at dispatch gives the county the current roll.
 *
 * FAILS OPEN BY DESIGN. If the refresh errors we mail the stored petition anyway.
 * A slightly stale assessed value is recoverable at the hearing; a missed 25-day
 * deadline is not, and there is no refund path.
 *
 * The one thing we will NOT do is mail through a changed county: that would mean a
 * different filing fee, a different Clerk, and a check made out to the wrong payee.
 * That case is escalated for review instead.
 */
async function refreshPetitionBeforeFiling(order, { supabase }) {
  const stateCode = (order.state_code || '').toUpperCase().trim();
  const isFL = stateCode === 'FL';

  try {
    const lookupRes = await fetch(`${BASE}/api/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        street: order.owner_street,
        city: order.owner_city,
        state: order.owner_state || stateCode,
        zip: order.owner_zip,
      }),
    });
    if (!lookupRes.ok) throw new Error(`lookup ${lookupRes.status}`);
    const lookup = await lookupRes.json();
    const fresh = lookup?.extractedData || {};
    const freshCounty = lookup?.resolvedCounty || fresh.county || null;

    // County drift => wrong fee, wrong clerk, wrong payee. Stop.
    if (isFL && freshCounty && order.county &&
        String(freshCounty).replace(/ County$/i, '').trim().toLowerCase() !==
        String(order.county).replace(/ County$/i, '').trim().toLowerCase()) {
      return { ok: false, halt: true, reason: `County changed since order (${order.county} -> ${freshCounty})` };
    }

    const assessedValue = fresh.assessedValue || order.assessed_value || null;
    if (!assessedValue) return { ok: false, reason: 'no assessed value from refresh' };

    // Preserve the reduction percentage the customer was quoted so the ask stays
    // proportionate to the new assessed value rather than jumping around.
    const priorPct = (order.assessed_value && order.target_reduction)
      ? (1 - (Number(order.target_reduction) / Number(order.assessed_value)))
      : 0.20;
    const targetReduction = Math.round(Number(assessedValue) * (1 - priorPct));

    if (!isFL) {
      // Non-FL states keep their stored letter; only the figures are refreshed.
      await supabase.from('orders')
        .update({ assessed_value: assessedValue, target_reduction: targetReduction })
        .eq('id', order.id);
      return { ok: true, assessedValue, targetReduction, regenerated: false };
    }

    const dr486Res = await fetch(`${BASE}/api/generate-dr486`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerFirstName: (order.customer_name || '').split(' ')[0] || '',
        ownerLastName: (order.customer_name || '').split(' ').slice(1).join(' ') || '',
        ownerEmail: order.customer_email,
        ownerStreet: order.owner_street,
        ownerCity: order.owner_city,
        ownerState: order.owner_state,
        ownerZip: order.owner_zip,
        propertyAddress: order.property_address,
        county: order.county,
        parcelId: fresh.parcelId || order.parcel_id || '',
        assessedValue,
        requestedValue: targetReduction,
        taxYear: fresh.taxYear || String(new Date().getFullYear()),
        zip: order.owner_zip,
        ownerSignatureName: order.fl_signature_name,
        ownerSignatureDate: order.fl_auth_date,
        // The hearing election is the OWNER's to make - never defaulted silently.
        // Captured on /success alongside the Part 3 signature. Falls back to true
        // only for orders taken before that field existed.
        willNotAttend: order.fl_will_not_attend === null || order.fl_will_not_attend === undefined
          ? true
          : !!order.fl_will_not_attend,
        authorizeConfidential: !!order.fl_authorize_confidential,
        authorizeConfidential: true,
      }),
    });
    if (!dr486Res.ok) throw new Error(`generate-dr486 ${dr486Res.status}`);
    const dr486 = await dr486Res.json();
    if (!dr486?.dr486Html) throw new Error('generate-dr486 returned no document');

    await supabase.from('orders').update({
      letter_text: dr486.dr486Html,
      assessed_value: assessedValue,
      target_reduction: targetReduction,
    }).eq('id', order.id);

    return { ok: true, assessedValue, targetReduction, letterText: dr486.dr486Html, regenerated: true };
  } catch (err) {
    console.error(`refreshPetitionBeforeFiling failed for order ${order.id}:`, err.message);
    return { ok: false, reason: err.message };
  }
}

export async function dispatchQueuedOrder(order, { supabase, resend }) {
  const stateCode = (order.state_code || '').toUpperCase().trim();
  if (!stateCode) {
    return { success: false, error: 'Order has no state_code — needs manual review' };
  }

  // Florida does NOT use district_* at all: send-letter derives the payee and the
  // mailing address server-side from lib/flCountyFees + lib/flVabAddresses. Requiring
  // district_name/district_address here meant every FL order written by the Stripe
  // webhook (which correctly does not populate those columns) failed this guard
  // forever, once per day, silently — while the portal told the customer "filed".
  const isFLOrder = (order.state_code || '').toUpperCase() === 'FL';
  const missingCore = !order.letter_text || !order.owner_street;
  const missingDistrict = !isFLOrder && (!order.district_name || !order.district_address);
  if (missingCore || missingDistrict) {
    return { success: false, error: 'Missing required letter/owner fields — needs manual review' };
  }

  const isFL = stateCode === 'FL';
  if (!isFL && !order.signed_at) {
    return { success: false, error: 'Order (non-FL) has no owner signature on file — needs manual review' };
  }
  if (isFL && !order.fl_signature_name) {
    return { success: false, error: 'Order (FL) has no owner signature on file — needs manual review' };
  }

  // Refresh the property data and rebuild the petition with the current roll before
  // mailing. See refreshPetitionBeforeFiling for why this exists and why it fails
  // open. `order` is mutated so the mail payload below picks up the new document.
  const refreshed = await refreshPetitionBeforeFiling(order, { supabase });
  if (refreshed.halt) {
    return { success: false, error: refreshed.reason, needsReview: true };
  }
  if (refreshed.ok) {
    if (refreshed.letterText) order.letter_text = refreshed.letterText;
    order.assessed_value = refreshed.assessedValue;
    order.target_reduction = refreshed.targetReduction;
    console.log(`[dispatch] order ${order.id}: refreshed assessed value to ${refreshed.assessedValue}${refreshed.regenerated ? ' and regenerated petition' : ''}`);
  } else {
    console.warn(`[dispatch] order ${order.id}: refresh failed (${refreshed.reason}) — mailing stored petition rather than missing the deadline`);
  }

  let mailData;
  try {
    // BASE, not a hardcoded production host. This line used to read
    // 'https://taxappealusa.com/api/send-letter' — the bare apex, which 308-redirects
    // to www — and it ignored NEXT_PUBLIC_BASE_URL entirely. dispatchQueuedOrder is
    // called by BOTH the hourly cron and the admin "Process Now" button, so on a
    // preview deployment that POSTed to PRODUCTION: it inherited production's
    // INTERNAL_API_SECRET (preview does not scope it separately), reached
    // send-letter.js running with the LIVE LOB_API_KEY, and send-letter has no
    // filing-window gate. A test purchase would have cut a real cheque and mailed a
    // real petition to a county clerk before the window opened. See the BASE constant
    // above and lib/fulfillOrder.js:45, which had it right all along.
    const mailRes = await fetch(`${BASE}/api/send-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
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
        ownerSignatureName: order.fl_signature_name || '',
        ownerSignatureDate: order.fl_auth_date || '',
        signedName: order.signature_typed_name || order.customer_name,
        signedAt: order.signed_at || '',
        signatureImage: order.signature_image || '',
      }),
    });

    mailData = await mailRes.json();

    if (!mailRes.ok || !mailData.success) {
      return { success: false, error: mailData.error || 'send-letter failed' };
    }
  } catch (dispatchErr) {
    return { success: false, error: dispatchErr.message || 'send-letter request failed' };
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
    // Mail was sent but we couldn't mark it filed — flag as critical so this
    // doesn't get re-dispatched; needs a manual DB fix.
    return {
      success: false,
      critical: true,
      error: `Mailed (letterId ${mailData.letterId}) but dispute_status update failed: ${updateErr.message}`,
      letterId: mailData.letterId,
      trackingNumber: mailData.trackingNumber,
    };
  }

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
      from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
      reply_to: 'customerservice@taxappealusa.com',
      to: [order.customer_email],
      subject,
      html,
      text,
    });
  } catch (emailErr) {
    console.error(`[dispatchQueuedOrder] Confirmation email failed for order ${order.id}:`, emailErr.message);
  }

  return { success: true, letterId: mailData.letterId, trackingNumber: mailData.trackingNumber };
}
