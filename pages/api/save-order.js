// pages/api/save-order.js
import { getSupabaseAdmin } from './supabase';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    customerName, customerEmail, customerPassword, passwordHash,
    propertyAddress, county, state, assessedValue, marketValue,
    targetReduction, reductionPct, estimatedSavings, stripeSessionId,
    amountPaid, lobLetterId, lobTrackingNumber,
    districtName, districtAddress, districtCity, districtState, districtZip,
    refCode,
  } = req.body;

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const { data: existing } = await supabase.from('orders').select('id').eq('stripe_session_id', stripeSessionId).single();
    if (existing) return res.status(200).json({ success: true, orderId: existing.id, duplicate: true });

    let password_hash = null;
    if (passwordHash) password_hash = passwordHash;
    else if (customerPassword) password_hash = await bcrypt.hash(customerPassword, 10);

    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName,
        customer_email: customerEmail,
        password_hash,
        property_address: propertyAddress,
        county, state,
        assessed_value: assessedValue ? Number(assessedValue) : null,
        market_value: marketValue ? Number(marketValue) : null,
        target_reduction: targetReduction ? Number(targetReduction) : null,
        reduction_pct: reductionPct ? Number(reductionPct) : null,
        estimated_savings: estimatedSavings ? Number(estimatedSavings) : null,
        stripe_session_id: stripeSessionId,
        amount_paid: amountPaid || 7900,
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

    console.log('Order saved:', data.id, refCode ? `(ref: ${refCode})` : '');

    // Increment referral total_referrals counter
    if (refCode) {
      try {
        await supabase.rpc('increment_referral_count', { referral_code: refCode });
      } catch (rpcErr) {
        console.error('Referral count increment failed:', rpcErr.message);
      }
    }

    // Auto-enroll in next year waitlist
    try {
      const nextYear = new Date().getFullYear() + 1;
      const { data: alreadyEnrolled } = await supabase.from('waitlist').select('id').eq('email', customerEmail.toLowerCase()).eq('state', state).eq('filing_year', nextYear).limit(1);
      if (!alreadyEnrolled?.length) {
        await supabase.from('waitlist').insert({
          email: customerEmail.toLowerCase(), name: customerName, state,
          county: county || null, property_address: propertyAddress || null,
          filing_year: nextYear, notified_count: 0, enrolled_from_order: true,
        });
        console.log(`Auto-enrolled ${customerEmail} in ${nextYear} waitlist`);
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
