import crypto from 'crypto';

/**
 * INTERNAL ONLY. This endpoint has no in-app caller any more — fulfillment moved
 * to lib/fulfillOrder.js behind the signature-verified Stripe webhook. It survived
 * as a publicly reachable route that wrote order rows and moved money, with a
 * read-then-insert duplicate check that a burst of concurrent requests could race.
 * Fails CLOSED when the secret is unset.
 */
function authorized(req) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const provided = req.headers['x-internal-secret'];
  if (!provided || typeof provided !== 'string') return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// pages/api/save-order.js
import Stripe from 'stripe';
import { getSupabaseAdmin } from './supabase';
import bcrypt from 'bcryptjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const REFERRAL_PAYOUT_CENTS = 2000; // $20.00

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const {
    customerName, customerEmail, customerPassword, passwordHash,
    propertyAddress, county, state,
    assessedValue, marketValue, targetReduction, reductionPct, estimatedSavings,
    stripeSessionId, amountPaid,
    lobLetterId, lobTrackingNumber,
    districtName, districtAddress, districtCity, districtState, districtZip,
    refCode,
    disputeStatus, scheduledFileDate, letterText,
    vabFee, vabPayableTo, flSignatureName, flAuthDate, stateCode,
    ownerStreet, ownerCity, ownerState, ownerZip,
  } = req.body;

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  // VERIFY THE PAYMENT SERVER-SIDE.
  // This handler previously accepted an arbitrary JSON body, trusted amountPaid
  // verbatim, hardcoded payment_status:'paid', and — if refCode was present —
  // fired a real $20 stripe.transfers.create(). An attacker could register as a
  // partner and loop this endpoint with random session ids to drain the Stripe
  // balance $20 per HTTP request, with no payment ever received. It also allowed
  // injecting 'queued' rows with an attacker-chosen district_address, which the
  // cron would then mail real Lob checks to.
  if (!stripeSessionId) return res.status(400).json({ error: 'stripeSessionId is required' });
  let verifiedSession;
  try {
    verifiedSession = await stripe.checkout.sessions.retrieve(stripeSessionId);
  } catch (e) {
    return res.status(400).json({ error: 'Unknown Stripe session' });
  }
  if (!verifiedSession || verifiedSession.payment_status !== 'paid') {
    return res.status(402).json({ error: 'Session is not paid' });
  }
  // Trust Stripe for the amount, never the caller.
  const verifiedAmount = verifiedSession.amount_total;
  const verifiedRefCode = (verifiedSession.metadata && verifiedSession.metadata.refCode) || null;

  try {
    // Prevent duplicate orders
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('stripe_session_id', stripeSessionId)
      .single();

    if (existing) {
      return res.status(200).json({ success: true, orderId: existing.id, duplicate: true });
    }

    // Handle password hash
    let password_hash = null;
    if (passwordHash) {
      password_hash = passwordHash;
    } else if (customerPassword) {
      password_hash = await bcrypt.hash(customerPassword, 10);
    }

    // Save the order
    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName,
        customer_email: customerEmail,
        password_hash,
        property_address: propertyAddress,
        county,
        state,
        assessed_value: assessedValue ? Number(assessedValue) : null,
        market_value: marketValue ? Number(marketValue) : null,
        target_reduction: targetReduction ? Number(targetReduction) : null,
        reduction_pct: reductionPct ? Math.round(Number(reductionPct)) : null,
        estimated_savings: estimatedSavings ? Number(estimatedSavings) : null,
        stripe_session_id: stripeSessionId,
        amount_paid: verifiedAmount,
        payment_status: 'paid',
        lob_letter_id: lobLetterId || null,
        lob_tracking_number: lobTrackingNumber || null,
        lob_status: lobLetterId ? 'dispatched' : 'pending',
        district_name: districtName || null,
        district_address: districtAddress || null,
        district_city: districtCity || null,
        district_state: districtState || null,
        district_zip: districtZip || null,
        dispute_status: disputeStatus || 'filed',
        scheduled_file_date: scheduledFileDate || null,
        letter_text: letterText || null,
        vab_fee: vabFee ? Number(vabFee) : null,
        vab_payable_to: vabPayableTo || null,
        fl_signature_name: flSignatureName || null,
        state_code: stateCode || null,
        fl_auth_date: flAuthDate || null,
        owner_street: ownerStreet || null,
        owner_city: ownerCity || null,
        owner_state: ownerState || null,
        owner_zip: ownerZip || null,
        ref_code: verifiedRefCode,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Order saved:', data.id);

    // ────────────────────────────────────────────────────────────────────
    // REFERRAL PAYOUT DELIBERATELY REMOVED FROM THIS PATH.
    //
    // The stated business policy is $20 per referral paid MONTHLY via Stripe.
    // This handler used to fire an INSTANT stripe.transfers.create() while
    // /api/referral-stats separately computed a month-end payout sheet from the
    // orders table with no reference to what had already been transferred — so
    // every referred order was paid twice.
    //
    // It was also exploitable: the transfer `destination` was looked up with the
    // BODY-supplied refCode while the gate used the Stripe-metadata one, so an
    // attacker could redirect another partner's $20 to themselves while the books
    // recorded the innocent partner's code.
    //
    // Payouts now happen in exactly one place: the monthly settlement run, which
    // reads and writes the referral_payouts ledger. See /api/referral-stats.
    // ────────────────────────────────────────────────────────────────────

    return res.status(200).json({ success: true, orderId: data.id });

  } catch (err) {
    console.error('Save order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
