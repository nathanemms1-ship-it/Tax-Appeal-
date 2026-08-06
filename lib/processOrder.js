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
 * PRE-FLIGHT CHECKS IMMEDIATELY BEFORE MAILING. THIS NO LONGER REBUILDS ANYTHING.
 *
 * ============================================================================
 * WHY THE PETITION IS NOW FROZEN AT SIGNATURE
 * ============================================================================
 * This function used to re-run the property lookup AND regenerate the whole DR-486
 * through /api/generate-dr486, overwriting orders.letter_text just before mailing.
 * The regeneration call passed the owner, the address, the figures and the signature
 * — and NOT `comps`, `issues`, `notes`, `askRestsOn`, `costToCureTotal`,
 * `valuationBasis`, `valuationGrounds` or `propertyDetails`.
 *
 * Two consequences, both found by the 6 Aug test dispatch:
 *
 * 1. Every mailed Florida petition silently lost its comparable sales and the
 *    owner's reported defects. The test petition read "No specific defects or
 *    condition issues were reported" for an order where defects HAD been reported at
 *    purchase, and argued methodology alone with no comps. Worse, `issues` is not
 *    stored on the order at all, so the regeneration could not have recovered them
 *    even in principle — the only record was inside the letter_text it overwrote.
 *
 * 2. More seriously: the owner signs DR-486 Part 3 attesting, under penalty of
 *    perjury, "that I have read this petition and the facts stated in it are true".
 *    Regenerating the evidence section up to 60 days later means the document filed
 *    with the county is NOT the document the owner read and swore to.
 *
 * Nathan's decision, 6 Aug 2026: mail the exact document that was signed.
 *
 * ============================================================================
 * WHAT WE STILL CHECK, AND WHY EACH HALTS RATHER THAN EDITS
 * ============================================================================
 * The lookup still runs, because two things can change between a pre-order and the
 * day it mails. Neither is now fixed by rewriting the petition — both stop it.
 *
 *   COUNTY DRIFT. A different county means a different filing fee, a different Clerk
 *   of the VAB, and a cheque made out to the wrong payee. Escalate, never mail.
 *
 *   ASSESSED VALUE DRIFT. This is the case the old refresh existed for: sales open
 *   PRE_ORDER_DAYS (60) before the window, so a July Florida pre-order is built from
 *   BatchData's PRIOR-year value because the 2026 TRIM notice does not exist yet.
 *   The old code silently rewrote the petition to the new figure. It cannot now, so
 *   it escalates instead — a petition contesting a figure the TRIM notice has since
 *   replaced needs the owner to see and re-sign it, not a machine to quietly amend a
 *   sworn statement on their behalf.
 *
 * TOLERANCE. A 0.5% band absorbs disagreement between data sources for what is
 * really the same figure. A genuine reassessment moves far more than that.
 *
 * FAILS OPEN. If the lookup itself errors we mail the stored, signed petition. A
 * slightly stale figure is arguable at the hearing; a missed 25-day deadline is not,
 * and there is no refund path.
 */
const ASSESSED_DRIFT_TOLERANCE = 0.005;

async function preflightBeforeFiling(order) {
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

    // Assessed value drift => the signed petition contests a superseded figure.
    const signedValue = Number(order.assessed_value) || 0;
    const currentValue = Number(fresh.assessedValue) || 0;
    if (signedValue > 0 && currentValue > 0) {
      const drift = Math.abs(currentValue - signedValue) / signedValue;
      if (drift > ASSESSED_DRIFT_TOLERANCE) {
        return {
          ok: false,
          halt: true,
          reason:
            `Assessed value changed since the owner signed ` +
            `($${signedValue.toLocaleString()} -> $${currentValue.toLocaleString()}, ` +
            `${(drift * 100).toFixed(1)}%). The signed petition contests the old figure. ` +
            `The owner must review and re-sign before this can be filed — do not amend a ` +
            `sworn petition on their behalf.`,
        };
      }
    }

    return { ok: true, currentValue };
  } catch (err) {
    // Fail open: mail the signed petition rather than miss the deadline.
    console.error(`preflightBeforeFiling failed for order ${order.id}:`, err.message);
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

  // Pre-flight only. The petition itself is NEVER rebuilt here — we mail the exact
  // document the owner read and signed under penalty of perjury. See
  // preflightBeforeFiling for what still halts a dispatch and why each case escalates
  // to a human rather than quietly amending a sworn filing.
  const preflight = await preflightBeforeFiling(order);
  if (preflight.halt) {
    return { success: false, error: preflight.reason, needsReview: true };
  }
  if (!preflight.ok) {
    console.warn(`[dispatch] order ${order.id}: preflight could not run (${preflight.reason}) — mailing the signed petition rather than missing the deadline`);
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
        parcelId: order.account_number || '',
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
