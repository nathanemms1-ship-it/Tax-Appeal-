// pages/api/create-connect-account.js
// Creates a Stripe Connect Express account for a partner and saves the account ID to Supabase
import Stripe from 'stripe';
import { getSupabaseAdmin } from './supabase';
import { enforceRateLimit } from '../../lib/rateLimit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // The (code, email) pair below is the only thing gating this, and both halves are
  // guessable — codes are FIRSTNAME-LASTNAME and appear in public links. Without a
  // limiter the pair can be brute-forced offline-fast, and each success creates a
  // real Stripe Express account on our platform.
  if (await enforceRateLimit(req, res, 'connect-account', 5, 60)) return;
  if (await enforceRateLimit(req, res, 'connect-account', 20, 3600)) return;

  const { refCode, email } = req.body || {};

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

  // Normalise ONCE and use the normalised value everywhere below. The lookup used
  // to uppercase the code while the UPDATE used the raw `refCode`, so a caller
  // sending a lowercase code passed the lookup and then silently failed the write:
  // a real Stripe Express account was created and its id was never saved. Those
  // orphan accounts accumulate on the platform and are invisible to us.
  const code = String(refCode).trim().toUpperCase();
  const partnerEmail = String(email).trim().toLowerCase();

  try {
    // Check if this partner already has a Stripe account
    const { data: existing, error: lookupErr } = await supabase
      .from('referrals')
      .select('stripe_account_id, email, code')
      .eq('code', code)
      .eq('email', partnerEmail)
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
        email: partnerEmail,
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
        .eq('code', code);

      if (updateError) {
        // Do NOT hand out an onboarding link for an account id we failed to store.
        // The payout run reads stripe_account_id from this table, so an unsaved id
        // is an account that can never be paid — the partner would complete Stripe's
        // whole bank-verification flow and still never receive money, and we would
        // have no record that the account exists.
        console.error('Failed to save stripe_account_id:', accountId, code, updateError);
        return res.status(500).json({
          error: 'Could not link your payout account. Please contact support@taxappealusa.com.',
        });
      }
      console.log('Saved stripe_account_id', accountId, 'for', code);
    }

    // Generate onboarding link for the partner to connect their bank
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: process.env.NEXT_PUBLIC_BASE_URL + '/partners?onboarding=refresh&ref=' + encodeURIComponent(code),
      return_url: process.env.NEXT_PUBLIC_BASE_URL + '/partners?onboarding=complete&ref=' + encodeURIComponent(code),
      type: 'account_onboarding',
    });

    return res.status(200).json({ url: accountLink.url, accountId });

  } catch (err) {
    console.error('create-connect-account error:', err);
    return res.status(500).json({ error: err.message });
  }
}
