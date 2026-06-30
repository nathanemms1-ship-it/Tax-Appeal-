// pages/api/save-order.js
import Stripe from 'stripe';
import { getSupabaseAdmin } from './supabase';
import bcrypt from 'bcryptjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const REFERRAL_PAYOUT_CENTS = 2000; // $20.00

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    customerName, customerEmail, customerPassword, passwordHash,
    propertyAddress, county, state,
    assessedValue, marketValue, targetReduction, reductionPct, estimatedSavings,
    stripeSessionId, amountPaid,
    lobLetterId, lobTrackingNumber,
    districtName, districtAddress, districtCity, districtState, districtZip,
    refCode,
  } = req.body;

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

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
        amount_paid: amountPaid || 8900,
        payment_status: 'paid',
        lob_letter_id: lobLetterId || null,
        lob_tracking_number: lobTrackingNumber || null,
        lob_status: lobLetterId ? 'dispatched' : 'pending',
        district_name: districtName || null,
        district_address: districtAddress || null,
        district_city: districtCity || null,
        district_state: districtState || null,
        district_zip: districtZip || null,
        dispute_status: 'filed',
        ref_code: refCode || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Order saved:', data.id);

    // ── Referral payout: fire $20 transfer to partner's Stripe account ──
    if (refCode) {
      try {
        const { data: referral } = await supabase
          .from('referrals')
          .select('stripe_account_id, id')
          .eq('ref_code', refCode)
          .single();

        if (referral?.stripe_account_id) {
          // Create the $20 transfer to the partner's connected Stripe account
          const transfer = await stripe.transfers.create({
            amount: REFERRAL_PAYOUT_CENTS,
            currency: 'usd',
            destination: referral.stripe_account_id,
            description: 'TaxAppeal referral payout — order ' + data.id,
            metadata: {
              ref_code: refCode,
              order_id: data.id,
              customer_email: customerEmail || '',
            },
          });

          console.log('Referral transfer fired:', transfer.id, 'to', referral.stripe_account_id);

          // Log the payout in Supabase referrals table
          await supabase
            .from('referrals')
            .update({
              total_orders: supabase.rpc ? undefined : undefined, // use increment below
            })
            .eq('ref_code', refCode);

          // Insert payout record into referral_payouts table (if it exists)
          await supabase.from('referral_payouts').insert({
            ref_code: refCode,
            order_id: data.id,
            stripe_transfer_id: transfer.id,
            amount_cents: REFERRAL_PAYOUT_CENTS,
            status: 'paid',
          }).select(); // ignore error if table doesn't exist

        } else {
          console.log('Referral partner', refCode, 'has no stripe_account_id yet — payout skipped');
        }
      } catch (payoutErr) {
        // Non-fatal — order is saved, payout failure logged but doesn't block the customer
        console.error('Referral payout error for', refCode, ':', payoutErr.message);
      }
    }

    // ── Auto-enroll in next year waitlist ──
    try {
      const nextYear = new Date().getFullYear() + 1;
      const { data: alreadyEnrolled } = await supabase
        .from('waitlist')
        .select('id')
        .eq('email', (customerEmail || '').toLowerCase())
        .eq('state', state)
        .eq('filing_year', nextYear)
        .limit(1);

      if (!alreadyEnrolled?.length) {
        await supabase.from('waitlist').insert({
          email: (customerEmail || '').toLowerCase(),
          name: customerName,
          state,
          county: county || null,
          property_address: propertyAddress || null,
          filing_year: nextYear,
          notified_count: 0,
          enrolled_from_order: true,
        });
      }
    } catch (waitlistErr) {
      console.error('Waitlist enrollment failed:', waitlistErr.message);
    }

    return res.status(200).json({ success: true, orderId: data.id });

  } catch (err) {
    console.error('Save order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
