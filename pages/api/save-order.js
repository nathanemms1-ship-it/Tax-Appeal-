import { getSupabaseAdmin } from './supabase';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    customerName,
    customerEmail,
    customerPassword,  // raw password (if coming directly)
    passwordHash,      // pre-hashed password (if coming via Stripe metadata)
    propertyAddress,
    county,
    state,
    assessedValue,
    marketValue,
    targetReduction,
    reductionPct,
    estimatedSavings,
    stripeSessionId,
    amountPaid,
    lobLetterId,
    lobTrackingNumber,
    districtName,
    districtAddress,
    districtCity,
    districtState,
    districtZip,
  } = req.body;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({ error: 'Database unavailable' });
  }

  try {
    // Check if order already exists (prevent duplicates on page refresh)
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('stripe_session_id', stripeSessionId)
      .single();

    if (existing) {
      console.log('Order already exists for session:', stripeSessionId);
      return res.status(200).json({ success: true, orderId: existing.id, duplicate: true });
    }

    // Handle password:
    // - If passwordHash is provided (pre-hashed by checkout.js via Stripe metadata) → use directly
    // - If customerPassword is provided (raw) → hash it now
    // - If neither → null
    let password_hash = null;
    if (passwordHash) {
      password_hash = passwordHash;
    } else if (customerPassword) {
      password_hash = await bcrypt.hash(customerPassword, 10);
    }

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
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Order saved to database:', data.id);
    return res.status(200).json({ success: true, orderId: data.id });

  } catch (err) {
    console.error('Save order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
