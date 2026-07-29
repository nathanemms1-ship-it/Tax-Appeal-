/**
 * STRIPE WEBHOOK — the authoritative fulfillment trigger.
 *
 * Before this existed, the ONLY thing that created an order row, mailed the
 * petition, and sent the receipt was a useEffect on pages/success.js. If the
 * customer closed the tab, lost signal, or got bounced by a bank 3DS redirect,
 * Stripe kept the money and nothing else happened anywhere — no row, no mail, no
 * email, no portal login, no alert, and no reconciliation job to catch it later.
 *
 * Stripe delivers checkout.session.completed server-to-server and retries on any
 * non-2xx for up to 3 days, so fulfillment no longer depends on a browser staying
 * open. fulfillCheckoutSession() is idempotent because those retries are certain,
 * not hypothetical.
 *
 * SETUP (required before this does anything):
 *   1. Stripe Dashboard -> Developers -> Webhooks -> Add endpoint
 *        URL:    https://www.taxappealusa.com/api/webhooks/stripe
 *        Events: checkout.session.completed
 *                checkout.session.async_payment_succeeded
 *                charge.refunded                  <-- ADD THIS
 *                charge.dispute.created           <-- AND THIS
 *   2. Copy the signing secret (whsec_...) into STRIPE_WEBHOOK_SECRET in Vercel.
 *   3. Set INTERNAL_API_SECRET and OPS_ALERT_EMAIL in Vercel.
 *
 * ============================================================================
 * WHY charge.refunded MATTERS: THE CHEAPEST FRAUD PATH IN THE APP
 * ============================================================================
 * orders.payment_status was written once, at fulfillment, and never updated again.
 * /api/referral-stats correctly refuses to pay out when payment_status !== 'paid'
 * (guard 4), but nothing ever set it to anything else. So the guard could not fire.
 *
 * The attack: register as a partner, buy through your own link, then refund. The
 * self-referral guard catches the naive version, but two disposable emails defeat
 * it. Net cost to the attacker after the refund: $0. Net cost to us: $20 cash out
 * the door per cycle, repeatable, plus Stripe fees, plus a real certified mailing.
 *
 * Handling these two events is what makes the existing payout guard real.
 */

import Stripe from 'stripe';
import { fulfillCheckoutSession } from '../../../lib/fulfillOrder';
import { getSupabaseAdmin } from '../supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe signature verification requires the RAW body, so Next's JSON parser
// must be disabled for this route.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/**
 * Flip orders.payment_status when a charge is refunded or disputed.
 *
 * Orders are keyed on stripe_session_id, and neither a Charge nor a Dispute carries
 * the session id — both carry payment_intent, so we resolve the session from that.
 * Never throws: a failure here must not stop us returning 200 for the refund itself,
 * but it DOES get logged as an error so an unmatched refund is visible.
 */
async function markPaymentReversed(object, status) {
  const paymentIntentId =
    typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;

  if (!paymentIntentId) {
    console.error('[stripe webhook] refund/dispute with no payment_intent, cannot match order.');
    return { matched: false, reason: 'no_payment_intent' };
  }

  try {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    const sessionId = sessions?.data?.[0]?.id;
    if (!sessionId) {
      console.error(`[stripe webhook] no checkout session for ${paymentIntentId}.`);
      return { matched: false, reason: 'no_session' };
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.error('[stripe webhook] Supabase unavailable, refund not recorded.');
      return { matched: false, reason: 'db_unavailable' };
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ payment_status: status })
      .eq('stripe_session_id', sessionId)
      .select('id');

    if (error) {
      console.error('[stripe webhook] failed to record reversal:', error.message);
      return { matched: false, reason: 'db_error' };
    }

    // An unmatched reversal is a real reconciliation problem: money went back out
    // for a payment we have no order for. Log it loudly rather than shrugging.
    if (!data?.length) {
      console.error(`[stripe webhook] reversal for session ${sessionId} matched no order row.`);
      return { matched: false, reason: 'no_order_row' };
    }

    return { matched: true, orderIds: data.map((r) => r.id), status };
  } catch (err) {
    console.error('[stripe webhook] markPaymentReversed threw:', err?.message);
    return { matched: false, reason: 'exception' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed and loudly. Processing unverified webhook bodies would let
    // anyone POST a fake "paid" event and trigger real mail and real checks.
    console.error('STRIPE_WEBHOOK_SECRET is not set — refusing to process webhook');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        console.log(`stripe webhook: ${event.type} for ${session.id}`);
        const result = await fulfillCheckoutSession(session.id);
        console.log('fulfillment result:', JSON.stringify(result));
        return res.status(200).json({ received: true, result });
      }

      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        console.log(`stripe webhook: ${event.type} for ${event.data.object.id} — no action`);
        return res.status(200).json({ received: true });

      // Money came back out. Mark the order so the referral payout guard can see it.
      case 'charge.refunded':
      case 'charge.dispute.created': {
        const charge = event.data.object;
        const status = event.type === 'charge.dispute.created'
          ? 'disputed'
          : (charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded');
        const marked = await markPaymentReversed(charge, status);
        console.log(`stripe webhook: ${event.type} -> payment_status=${status}`, JSON.stringify(marked));
        return res.status(200).json({ received: true, ...marked });
      }

      default:
        return res.status(200).json({ received: true, ignored: event.type });
    }
  } catch (err) {
    // Return 500 so Stripe RETRIES. A payment we failed to fulfill must not be
    // silently acknowledged — the retry is the safety net.
    console.error('Stripe webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
