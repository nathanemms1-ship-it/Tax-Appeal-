// pages/api/create-connect-account.js
// Creates a Stripe Connect Express account and returns an onboarding link
// Called when a partner clicks "Connect Bank Account via Stripe" on /partners
import Stripe from 'stripe';
import { getSupabaseAdmin } from './supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { referralCode, email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const supabase = getSupabaseAdmin();

  try {
    // Check if this referrer already has a Stripe Connect account ID stored
    let stripeAccountId = null;
    if (supabase && referralCode) {
      const { data: referrer } = await supabase
        .from('referrals')
        .select('id, stripe_account_id')
        .eq('code', referralCode)
        .single();

      if (referrer?.stripe_account_id) {
        // Already has an account — just generate a fresh onboarding link
        stripeAccountId = referrer.stripe_account_id;
      }
    }

    // Create a new Express account if we don't have one yet
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          referral_code: referralCode || '',
          name: name || '',
        },
      });
      stripeAccountId = account.id;

      // Save the Stripe account ID back to the referrals table
      if (supabase && referralCode) {
        await supabase
          .from('referrals')
          .update({ stripe_account_id: stripeAccountId })
          .eq('code', referralCode);
      }
    }

    // Generate the hosted onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${process.env.NEXT_PUBLIC_BASE_URL}/partners?ref=${referralCode}&setup=retry`,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/partners?ref=${referralCode}&setup=complete`,
      type: 'account_onboarding',
    });

    return res.status(200).json({ url: accountLink.url });

  } catch (err) {
    console.error('Create connect account error:', err);
    return res.status(500).json({ error: err.message });
  }
}
