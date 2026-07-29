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
 *        Events: checkout.session.completed, checkout.session.async_payment_succeeded
 *   2. Copy the signing secret (whsec_...) into STRIPE_WEBHOOK_SECRET in Vercel.
 *   3. Set INTERNAL_API_SECRET and OPS_ALERT_EMAIL in Vercel.
 */

import Stripe from 'stripe';
import { fulfillCheckoutSession } from '../../../lib/fulfillOrder';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe signature verification requires the RAW body, so Next's JSON parser
// must be disabled for this route.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
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
