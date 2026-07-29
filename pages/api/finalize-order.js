/**
 * FINALIZE ORDER — the browser's only fulfillment-adjacent entry point.
 *
 * For TX/GA/AR/AL the owner signs AFTER payment, on /success. That signature is
 * the last thing standing between a paid order and a mailed protest, so the
 * browser needs *some* way to say "the customer just signed."
 *
 * This endpoint is that one door, and it is deliberately narrow:
 *   - It authenticates by Stripe session, re-read from Stripe server-side. You
 *     cannot act on an order you didn't pay for.
 *   - It accepts ONLY a signature. No amounts, no addresses, no payee, no
 *     district — all of that comes from Stripe metadata and our verified tables.
 *   - It delegates the actual mailing to lib/fulfillOrder, the same path the
 *     Stripe webhook uses, so there is exactly one fulfillment implementation.
 *
 * Contrast with what /success used to do: call /api/save-order with an arbitrary
 * body, then /api/send-letter with a client-supplied check amount, payee, and
 * mailing address. Those endpoints are now internal-only.
 */

import Stripe from 'stripe';
import { getSupabaseAdmin } from './supabase';
import { fulfillCheckoutSession, fulfillAfterSignature } from '../../lib/fulfillOrder';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// A generous cap that still stops someone pushing megabytes of base64 into
// Postgres. A drawn signature is comfortably under this.
const MAX_SIGNATURE_BYTES = 400_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Florida additionally carries the DR-486 Part 3 signature and the two elections
  // that belong to the OWNER, not to us: whether they will attend a hearing, and
  // whether the Property Appraiser may release their confidential information to us
  // (Fla. Stat. s. 194.011(3), second sentence). These used to be captured before
  // payment; willNotAttend was also hardcoded true at mail time, which silently made
  // an election on the owner's behalf.
  const {
    sessionId, signatureImage, typedName,
    flSignatureName, flWillNotAttend, flAuthorizeConfidential,
  } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  // Authenticate by proving the payment exists and is paid.
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    return res.status(404).json({ error: 'Unknown session' });
  }
  if (!session || session.payment_status !== 'paid') {
    return res.status(402).json({ error: 'Session is not paid' });
  }

  if (signatureImage && signatureImage.length > MAX_SIGNATURE_BYTES) {
    return res.status(413).json({ error: 'Signature image too large' });
  }
  if (!signatureImage && !typedName && !flSignatureName) {
    return res.status(400).json({ error: 'A signature is required' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    // The webhook may not have landed yet (Stripe usually delivers in seconds,
    // but it is not instantaneous). Make sure the order row exists before we
    // attach a signature to it.
    await fulfillCheckoutSession(sessionId);

    const forwarded = req.headers['x-forwarded-for'];
    const signerIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
      || req.socket?.remoteAddress || null;

    const { error: sigErr } = await supabase
      .from('orders')
      .update({
        signature_image: signatureImage || null,
        signature_typed_name: typedName || null,
        // fl_signature_name is what processOrder feeds into DR-486 Part 3 when it
        // rebuilds the petition immediately before mailing.
        ...(flSignatureName ? { fl_signature_name: String(flSignatureName).trim() } : {}),
        ...(flWillNotAttend === undefined ? {} : { fl_will_not_attend: !!flWillNotAttend }),
        ...(flAuthorizeConfidential === undefined ? {} : { fl_authorize_confidential: !!flAuthorizeConfidential }),
        owner_ack: true,
        signed_at: new Date().toISOString(),
        signer_ip: signerIp,
      })
      .eq('stripe_session_id', sessionId);

    if (sigErr) {
      console.error('finalize-order: signature save failed', sigErr);
      return res.status(500).json({ error: 'Could not record signature' });
    }

    // Now that the signature exists, mail it.
    const result = await fulfillAfterSignature(sessionId);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('finalize-order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
