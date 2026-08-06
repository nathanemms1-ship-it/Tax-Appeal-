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
import { alertOps as pageOps } from '../../lib/alertOps';

// Same constant the rest of the fulfillment path uses. NOT a hardcoded production
// host: on a preview deployment that would POST to production.
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';

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

    // ========================================================================
    // BUILD THE SWORN DOCUMENT, ONCE, HERE.
    // ========================================================================
    // orders.letter_text up to this point is the UNSIGNED preview — the petition as
    // the owner read it before attesting to it (see pages/apply.js, "propData
    // .letterKey holds the unsigned preview"). Part 3 is blank in it.
    //
    // The signature used to be applied nowhere. lib/processOrder.js regenerated the
    // entire petition at MAIL time and passed ownerSignatureName into that rebuild,
    // which is the only reason a signature ever appeared on a mailed DR-486. That
    // rebuild also dropped `comps`, `issues`, `notes` and the valuation basis, so the
    // filed petition lost the owner's reported defects and every verified comparable
    // sale — and, more seriously, was not the document the owner read and swore to.
    //
    // So the petition is now finalised at the moment of signature and frozen:
    //   - the evidence is REUSED verbatim from orders.evidence_text, so the argument,
    //     the defects and the comps are exactly what the owner read. No model call.
    //   - Part 3 is rendered with the signature actually captured above.
    //   - lib/processOrder.js mails this byte-for-byte and never rebuilds it.
    //
    // Failure here is non-fatal on purpose. The signature is already saved and the
    // payment is captured; refusing the whole request would leave a paid, signed
    // order the customer cannot re-submit. Dispatch still holds the unsigned document,
    // and dispatchQueuedOrder refuses to mail a Florida order without a Part 3
    // signature, so the failure mode is a held order and a page — not an unsigned
    // petition reaching a county.
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, customer_name, customer_email, county, state_code, property_address, account_number, assessed_value, target_reduction, owner_street, owner_city, owner_state, owner_zip, evidence_text, fl_signature_name, fl_will_not_attend, fl_authorize_confidential')
        .eq('stripe_session_id', sessionId)
        .maybeSingle();

      if (order && String(order.state_code || '').toUpperCase() === 'FL') {
        if (!order.evidence_text) {
          // Rebuilding without it would generate DIFFERENT evidence from what the
          // owner read — the exact defect this block exists to remove. Better to
          // leave the stored document alone and page.
          await pageOps(
            'Cannot finalise a signed petition — evidence_text missing',
            `order=${order.id} session=${sessionId}\n\n` +
            `The signed DR-486 cannot be rebuilt without the evidence the owner read, ` +
            `and regenerating it would produce a different document from the one they ` +
            `swore to. This order must not mail until it is resolved.`,
            { force: true }
          );
        } else {
          const name = String(order.customer_name || '').trim();
          const dr486Res = await fetch(`${BASE_URL}/api/generate-dr486`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ownerFirstName: name.split(' ')[0] || '',
              ownerLastName: name.split(' ').slice(1).join(' ') || '',
              ownerEmail: order.customer_email,
              ownerStreet: order.owner_street,
              ownerCity: order.owner_city,
              ownerState: order.owner_state,
              ownerZip: order.owner_zip,
              zip: order.owner_zip,
              propertyAddress: order.property_address,
              county: order.county,
              parcelId: order.account_number || '',
              assessedValue: order.assessed_value,
              requestedValue: order.target_reduction,
              taxYear: String(new Date().getFullYear()),
              // The signing pass: reuse, never regenerate. See generate-dr486.js.
              evidenceText: order.evidence_text,
              ownerSignatureName: flSignatureName || order.fl_signature_name || typedName || name,
              ownerSignatureDate: new Date().toISOString(),
              willNotAttend: order.fl_will_not_attend !== false,
              authorizeConfidential: !!order.fl_authorize_confidential,
              preview: false,
            }),
          });

          if (dr486Res.ok) {
            const dr486 = await dr486Res.json();
            if (dr486?.dr486Html) {
              const { error: docErr } = await supabase
                .from('orders')
                .update({ letter_text: dr486.dr486Html })
                .eq('id', order.id);
              if (docErr) throw new Error(`storing signed petition failed: ${docErr.message}`);
              console.log(`finalize-order: stored signed DR-486 for order ${order.id}`);
            }
          } else {
            throw new Error(`generate-dr486 ${dr486Res.status}`);
          }
        }
      }
    } catch (e) {
      await pageOps(
        'Signed petition not finalised',
        `session=${sessionId}\n${e.message}\n\n` +
        `The signature is saved and the payment is captured, but orders.letter_text ` +
        `still holds the UNSIGNED preview. Dispatch will refuse to mail it. Resolve ` +
        `before this order's filing window opens.`,
        { force: true }
      );
    }

    // Now that the signature exists, mail it.
    const result = await fulfillAfterSignature(sessionId);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('finalize-order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
