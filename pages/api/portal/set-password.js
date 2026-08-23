// pages/api/portal/set-password.js
import crypto from 'crypto';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '../supabase';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { hasUsablePassword, hashPassword, MIN_PASSWORD_LENGTH, NO_PASSWORD_SENTINEL } from '../../../lib/noPassword';

/**
 * CLAIM THE PORTAL AFTER PAYING. Never a reset.
 *
 * ============================================================================
 * WHY THIS ROUTE EXISTS
 * ============================================================================
 * The funnel stopped asking for a password on 23 Aug 2026 — it was the first
 * thing a stranger was asked for, three screens before they were told anything
 * about their property. It is offered instead on /success, after the DR-486
 * signature, where the sale is closed and the friction costs nothing that matters.
 * See lib/noPassword.js.
 *
 * So there has to be somewhere for that password to go, and the customer is not
 * logged in — the thing they would log in with is what they are setting.
 *
 * ============================================================================
 * THE STRIPE SESSION IS THE CREDENTIAL, AND IT IS A WEAK ONE
 * ============================================================================
 * `session_id` proves the holder completed that payment: it is unguessable, it is
 * verified against Stripe rather than trusted, and the payment must actually have
 * settled. /api/verify-payment already treats it as a bearer token for the same
 * customer's name, email and address on the same page.
 *
 * But it is weaker than an emailed reset token, in a specific way: it arrives in
 * the URL of /success, so it reaches browser history, any Referer header the page
 * emits, and every log between here and Stripe. verify-security has a rule about
 * credentials in query strings for exactly this reason.
 *
 * THEREFORE THIS ROUTE ONLY EVER SETS A PASSWORD THAT IS NOT ALREADY SET. It
 * cannot change one. A customer who already has a working password and buys a
 * second property gets told to use "Forgot password?", which is verified by an
 * email they must be able to read.
 *
 * That asymmetry is the whole security argument. The worst case for a leaked
 * session_id is that somebody claims a portal account for an order that had no
 * password — the same reach they already had via /api/verify-payment, which hands
 * them the customer's details from that URL alone. The case this refuses is the
 * one that would be an escalation: taking over an account that was already held.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY DOES NOT DO
 * ============================================================================
 * It does not log the customer in. Setting a password and being handed a session
 * are two decisions, and /success has no need of the second — the customer is
 * already looking at their order. They sign in at /portal when they come back,
 * which is the moment the password is actually for.
 */

/**
 * BOTH CLIENTS ARE BUILT INSIDE THE HANDLER, NOT AT MODULE SCOPE.
 *
 * The first draft did `createClient(process.env.SUPABASE_URL, ...)` and
 * `new Stripe(process.env.STRIPE_SECRET_KEY)` at the top of the file, copying
 * login.js and reset-password.js. Both throw when the variable is absent — and
 * they throw at IMPORT time, so the module cannot even be loaded.
 *
 * scripts/verify-routes.mjs found it on the first run: `will not import —
 * supabaseUrl is required`. That script exists to prove every route can execute
 * on a clean checkout with no credentials, which is also what a misconfigured or
 * half-deployed environment looks like. pages/api/supabase.js has returned null
 * rather than throwing for exactly this reason; Stripe gets the same treatment
 * here.
 *
 * The two routes that still do it at module scope are not touched by this change
 * and are not in the smoke list. That is a real gap and it is not this commit's.
 */
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Brute-forcing or replaying harvested session ids should not be free. Matches
  // the two-window shape /api/verify-payment uses against the same identifier,
  // tighter because this one writes.
  if (await enforceRateLimit(req, res, 'set-password', 10, 60)) return;
  if (await enforceRateLimit(req, res, 'set-password', 40, 3600)) return;

  // FROM THE BODY, NOT THE QUERY STRING. A password in req.query is written in
  // plaintext to Vercel logs, proxy logs and browser history — see rule 5 in
  // scripts/verify-security.mjs, which fails the build for it.
  const { session_id, password } = req.body || {};
  if (!session_id || !password) return res.status(400).json({ error: 'Missing required fields' });
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  /**
   * ======================================================================
   * THE BUILD MUST NOT TALK TO STRIPE.
   * ======================================================================
   * scripts/verify-routes.mjs invokes every route in this list to prove the
   * module imports and the handler executes. On Vercel it runs inside `next
   * build` WITH PRODUCTION CREDENTIALS — which is why that file already sets
   * SUPPRESS_CHECK_EVENTS, so its smoke call cannot write a synthetic row into
   * check_events and flatter the refusal rate.
   *
   * This route had no equivalent, so every deployment made a real
   * `checkout.sessions.retrieve` against the live account with the fixture id
   * `cs_test_smoke`, and Stripe answered `resource_missing` — a genuine API call,
   * against the production key, from a build, logged as an error on every deploy.
   *
   * Same flag, same reason: an endpoint that reaches a vendor needs a way to be
   * executed without reaching it. Absent the variable it is always live, so
   * production behaviour is unchanged and the default cannot be got wrong.
   */
  if (process.env.SUPPRESS_EXTERNAL_CALLS === '1') {
    return res.status(503).json({ error: 'Password setup is temporarily unavailable.', code: 'SUPPRESSED' });
  }

  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  if (!stripe || !supabase) {
    // Not the customer's problem and not a 4xx. Say so plainly rather than
    // reporting a password failure for a deployment that is missing a key.
    console.error('set-password: missing Stripe or Supabase credentials');
    return res.status(503).json({ error: 'Password setup is temporarily unavailable. Your order is unaffected — please use "Forgot password?" later.' });
  }

  try {
    /**
     * A SESSION ID WE DO NOT RECOGNISE IS A CLIENT ERROR, NOT A SERVER ERROR.
     *
     * `retrieve` THROWS for an unknown id (`resource_missing`), and that throw used
     * to fall to the bottom catch and answer 500 "Something went wrong" — telling a
     * customer our server broke when what actually happened is they presented an id
     * we cannot match. It also buries a real outage in the same message, so neither
     * case can be read off the logs.
     *
     * Caught here and answered the same way an unpaid session is answered, because
     * they mean the same thing to this route: you have not shown us a completed
     * payment.
     */
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(String(session_id));
    } catch (stripeErr) {
      if (stripeErr?.type === 'StripeInvalidRequestError' || stripeErr?.raw?.code === 'resource_missing') {
        return res.status(403).json({ error: 'That checkout session is not a completed payment.', code: 'SESSION_NOT_FOUND' });
      }
      throw stripeErr;   // a real Stripe outage still reaches the 500 below
    }
    if (session?.payment_status !== 'paid') {
      return res.status(403).json({ error: 'That checkout session is not a completed payment.' });
    }

    // Stripe's copy of the address, not the caller's. Taking an email from the
    // body would let anyone holding any valid session_id set a password on any
    // account they could name.
    const email = (session.customer_email || '').toLowerCase().trim();
    if (!email) {
      return res.status(409).json({ error: 'That order has no email address on file. Please contact us.' });
    }

    /**
     * ======================================================================
     * READ EVERY ROW THIS WRITE WILL TOUCH. NOT THE NEWEST ONE.
     * ======================================================================
     * The first version of this read `.order('created_at', {ascending:false})
     * .limit(1)`, copying login.js — and then updated ALL rows for the address.
     * So the guard was evaluated against a row that had just been created by the
     * payment now being presented, which by definition has no password yet.
     * hasUsablePassword returned false, the refusal never fired, and the update
     * overwrote the customer's real hash on their earlier orders.
     *
     * That is the exact escalation the header of this file argues is impossible,
     * and it was reachable two ways: a leaked /success URL from a second purchase,
     * and — because the funnel never verifies that an email belongs to the person
     * typing it — anyone willing to spend $89 checking out under somebody else's
     * address.
     *
     * Found by adversarial review of the diff. The build was green: verify-handoff
     * asserted the `hasUsablePassword` line existed, not that it was reading the
     * rows the update would change. A guard proving a property about the wrong set,
     * again.
     *
     * An explicit field list, never select('*') — this table carries the signature
     * attestation, the signer IP and the DR-486 elections, and verify-security
     * fails the build for a wildcard read on it.
     */
    const { data: orders, error: readError } = await supabase
      .from('orders')
      .select('id, password_hash')
      .eq('customer_email', email);

    if (readError) {
      console.error('set-password: order lookup failed:', readError);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
    if (!orders?.length) {
      // The payment settled but no order row exists yet. lib/fulfillOrder.js runs
      // off the Stripe webhook and /success can render before it lands, so this is
      // a race rather than an error, and saying so is more useful than a 500.
      return res.status(409).json({ error: 'Your order is still being set up. Please try again in a moment.', code: 'ORDER_NOT_READY' });
    }

    // ANY row with a usable password refuses the whole write. One address is one
    // person here — the update below is deliberately unscoped for that reason —
    // so a password held on any of their orders is the password being protected.
    if (orders.some((o) => hasUsablePassword(o.password_hash))) {
      // NOT an error, and deliberately not phrased as one. The ordinary way to
      // reach this is a returning customer buying a second property.
      return res.status(409).json({
        error: 'This email already has a password. Use "Forgot password?" on the sign-in page to change it.',
        code: 'PASSWORD_ALREADY_SET',
      });
    }

    /**
     * ======================================================================
     * CONDITIONAL WRITES, SO THE READ ABOVE IS NOT THE ONLY THING PROTECTING US.
     * ======================================================================
     * The read-then-write above still has a window: two concurrent POSTs for the
     * same address both pass `orders.some(hasUsablePassword)` before either UPDATE
     * lands, and the later one wins. The rate limit is 10 a minute, so it is
     * raceable by anyone holding a valid paid session for that email.
     *
     * Narrower than the defect it replaced, and the same class — so the predicate
     * moves into the statement. Each UPDATE only touches rows that STILL have no
     * usable password when it executes, which the database evaluates atomically. A
     * real hash written in between is simply not matched.
     *
     * Two statements because "no usable password" is two stored values: the
     * sentinel on everything written since 23 Aug 2026, and a null on anything
     * older. supabase-js cannot express `eq OR is null` in one filter without
     * .or() string syntax, and `!` inside that syntax is a delimiter — a quoting
     * bug there would silently widen the predicate to every row, which is the
     * failure this whole block exists to prevent. Two explicit statements cannot
     * be misread.
     *
     * All orders for this email, like the reset route — one person, one password,
     * and login.js reads whichever order is most recent.
     */
    const newHash = hashPassword(password, crypto);
    const { error: sentinelError } = await supabase
      .from('orders')
      .update({ password_hash: newHash })
      .eq('customer_email', email)
      .eq('password_hash', NO_PASSWORD_SENTINEL);
    const { error: legacyError } = await supabase
      .from('orders')
      .update({ password_hash: newHash })
      .eq('customer_email', email)
      .is('password_hash', null);
    const updateError = sentinelError || legacyError;

    if (updateError) {
      console.error('set-password: update failed:', updateError);
      return res.status(500).json({ error: 'Failed to save your password. Please try again.' });
    }

    // No hash, no session, no order row in the response — see rule 6 in
    // verify-security. There is nothing the caller needs back but "yes".
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('set-password error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
