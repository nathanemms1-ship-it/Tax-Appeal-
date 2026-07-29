// pages/api/create-connect-account.js
// Creates a Stripe Connect Express account for a partner and saves the account ID to Supabase
import Stripe from 'stripe';
import { getSupabaseAdmin } from './supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refCode, email } = req.body;

  // A referral code is a PUBLIC identifier — it is in every link a partner shares,
  // and codes are FIRSTNAME-LASTNAME. Treating it as a credential let anyone bind
  // their own bank account to another partner's payout record, or mint unlimited
  // orphan Stripe Express accounts on the platform.
  //
  // The caller must now prove they know the code AND the registered email, and the
  // pair must match a real partner row. Once stripe_account_id is set we refuse to
  // rebind it — a partner changing banks does that inside Stripe's own onboarding.
  if (!refCode || !email) return res.status(400).json({ error: 'Missing refCode or email' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    // Check if this partner already has a Stripe account
    const { data: existing, error: lookupErr } = await supabase
      .from('referrals')
      .select('stripe_account_id, email, code')
      .eq('code', String(refCode).trim().toUpperCase())
      .eq('email', String(email).trim().toLowerCase())
      .maybeSingle();

    // No matching (code, email) pair => not this partner. Generic message so the
    // endpoint can't be used to confirm which codes or emails exist.
    if (lookupErr || !existing) {
      return res.status(403).json({ error: 'Referral code and email do not match a partner account.' });
    }

    let accountId = existing?.stripe_account_id;

    // Only create a new Stripe account if one doesn't already exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        settings: {
          payouts: { schedule: { interval: 'monthly', monthly_anchor: 1 } },
        },
      });

      accountId = account.id;

      // Save the Stripe account ID to Supabase immediately
      const { error: updateError } = await supabase
        .from('referrals')
        .update({ stripe_account_id: accountId })
        .eq('code', refCode);

      if (updateError) {
        console.error('Failed to save stripe_account_id:', updateError);
        // Still continue — return the onboarding URL even if DB update fails
      } else {
        console.log('Saved stripe_account_id', accountId, 'for', refCode);
      }
    }

    // Generate onboarding link for the partner to connect their bank
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: process.env.NEXT_PUBLIC_BASE_URL + '/partners?onboarding=refresh&ref=' + refCode,
      return_url: process.env.NEXT_PUBLIC_BASE_URL + '/partners?onboarding=complete&ref=' + refCode,
      type: 'account_onboarding',
    });

    return res.status(200).json({ url: accountLink.url, accountId });

  } catch (err) {
    console.error('create-connect-account error:', err);
    return res.status(500).json({ error: err.message });
  }
}
