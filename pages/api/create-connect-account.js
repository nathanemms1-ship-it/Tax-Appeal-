// pages/api/create-connect-account.js
// Creates a Stripe Connect Express account for a partner and saves the account ID to Supabase
import Stripe from 'stripe';
import { getSupabaseAdmin } from './supabase';
import { enforceRateLimit } from '../../lib/rateLimit';
import { verifyPartnerToken } from '../../lib/partnerToken';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // The (code, email) pair below is the only thing gating this, and both halves are
  // guessable — codes are FIRSTNAME-LASTNAME and appear in public links. Without a
  // limiter the pair can be brute-forced offline-fast, and each success creates a
  // real Stripe Express account on our platform.
  if (await enforceRateLimit(req, res, 'connect-account', 5, 60)) return;
  if (await enforceRateLimit(req, res, 'connect-account', 20, 3600)) return;

  const { refCode, email, token } = req.body || {};

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

  /**
   * THE PAIR IS NOT A CREDENTIAL — THE SIGNATURE IS.
   *
   * The note above is right that (code, email) is guessable: codes are
   * FIRSTNAME-LASTNAME and a realtor's email is on every listing they have. The rate
   * limiter slows a stranger guessing; it does nothing about one who simply holds a
   * forwarded link. And the prize is real — while `stripe_account_id` is null, binding
   * succeeds and the attacker receives that partner's referral fees thereafter.
   *
   * So the caller must now present a token we signed. See lib/partnerToken.js.
   *
   * The row match below still runs. This proves the link came from us; that proves
   * the partner exists. Neither replaces the other.
   *
   * The response deliberately does not distinguish an expired token from a forged
   * one: saying "expired" confirms the code and email were correct, which is half of
   * what the token is protecting.
   */
  const tokenCheck = verifyPartnerToken(code, partnerEmail, token);
  if (!tokenCheck.ok) {
    console.warn(`[connect] rejected token for ${code}: ${tokenCheck.reason}`);
    return res.status(403).json({
      error: 'This payout setup link is not valid or has expired. Request a fresh link from the partners page.',
    });
  }

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
        /**
         * THE SCREEN WHERE PARTNERS GIVE UP.
         *
         * Stripe's Express onboarding asks every connected account for a business
         * website, because it has to establish what the account does before it will
         * move money to it — card-network and AML obligations. Our partners are
         * onboarded with merchant-grade requirements (the dashboard lists them as
         * "Merchant, recipient") even though all they ever do is RECEIVE $20.
         *
         * A realtor does not have a website that "shows the products or services you
         * sell". Stripe offers "Add product description instead" as an escape hatch,
         * but only after the question has already been asked — and a question someone
         * has no answer to is where a funnel loses them. On 12 Aug all three connected
         * accounts had been sitting Restricted since June, stopped at exactly this
         * point with the agreement never accepted.
         *
         * Supplying the description AT CREATION satisfies the requirement before the
         * partner ever sees it, removing the screen entirely. Verified live the same
         * day: entering this text was the single thing that moved an account from
         * Restricted to Enabled with transfers active.
         *
         * The wording is deliberately literal about the economics — a fixed fee per
         * completed filing, no advice given. Stripe is deciding whether this is a real
         * and permitted business, and the honest description is also the one most
         * likely to pass. It matches what /partners tells the partner they are.
         *
         * `url` is deliberately NOT set. Stripe is assessing THEIR business, not ours;
         * putting taxappealusa.com in their profile would misrepresent both.
         */
        business_profile: {
          product_description:
            'Referral partner for TaxAppeal USA. Refers property owners to a property tax appeal '
            + 'preparation and mailing service and receives a fixed $20 referral fee for each '
            + 'completed filing. Does not provide tax, legal, or appraisal advice.',
        },
        /**
         * A DEFAULT, AND A DELIBERATE ONE — Stripe shows it on the review screen with
         * an Edit button, so a partner trading through an LLC can correct it.
         *
         * 'individual' is right for most: the referral fee is paid to a person, and it
         * is that person's identity Stripe verifies and that person who receives the
         * 1099-NEC once they pass $600 in a year. A partner who wants the fee paid to
         * an entity must change this during onboarding, and if they do not, a mismatch
         * against their tax records will stall verification later rather than fail
         * loudly here.
         */
        business_type: 'individual',
        settings: {
          // WEEKLY, AND THE REASON IS CLAWBACK RECOVERY — NOT PARTNER CONVENIENCE.
          //
          // This was `monthly, monthly_anchor: 1` — the same day the settlement run
          // fires, which was the worst of both worlds. A transfer landing on the 1st
          // could arrive just after that month's payout had already gone, leaving the
          // partner's $20 in their Stripe balance until the 1st of the NEXT month:
          // up to thirty days late, for money the dashboard says was sent.
          //
          // The opposite extreme is worse. While the $20 is still in the connected
          // account's Stripe balance, a chargeback can be recovered with a transfer
          // reversal. Once it has reached the partner's own bank, a reversal only
          // drives their connected account negative — and an Express account with no
          // revenue of its own may never repay that.
          //
          // So the payout interval IS the recovery window. Weekly gives roughly seven
          // days to recover and makes a partner wait at most a week after settlement.
          // Daily would pay them sooner and leave almost nothing to recover from.
          //
          // Accounts created BEFORE this change keep their old monthly schedule —
          // Stripe does not retro-apply it. See scripts/sql/referral_payouts.sql notes
          // and the Open Items queue if any exist.
          payouts: { schedule: { interval: 'weekly', weekly_anchor: 'friday' } },
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
          error: 'Could not link your payout account. Please contact customerservice@taxappealusa.com.',
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
