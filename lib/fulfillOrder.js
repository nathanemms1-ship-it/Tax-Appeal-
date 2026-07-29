/**
 * SERVER-SIDE ORDER FULFILLMENT
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * Fulfillment used to run entirely in the customer's browser, in a useEffect on
 * pages/success.js. That meant:
 *
 *   - Close the tab, lose mobile signal during the ~30s Lob round-trip, or get
 *     bounced by a bank 3DS redirect => Stripe captured the money and there was
 *     NO order row, no mail, no email, no portal account, and no record that it
 *     ever happened. There was no reconciliation job and no refund path.
 *   - Every reload of /success re-ran the whole chain, mailing a second petition
 *     and cutting a second real check.
 *   - The letter lived in Redis on a 2-hour TTL. Any customer who paused between
 *     generating and paying lost it, and the success page then skipped creating
 *     an order row entirely while telling them it was "queued for manual
 *     dispatch" -- it was queued nowhere.
 *   - Because the browser had to drive it, /api/save-order and /api/send-letter
 *     had to be publicly callable, which is what made them exploitable.
 *
 * This module is now the single fulfillment path, invoked from the
 * signature-verified Stripe webhook. The browser observes; it does not fulfill.
 *
 * ORDERING GUARANTEE: the order row is written FIRST, before any mailing. Even
 * if Lob is down, the customer's payment is recorded and recoverable.
 */

import Stripe from 'stripe';
import { Redis } from '@upstash/redis';
import { getSupabaseAdmin } from '../pages/api/supabase';
import { getFilingWindowStatus } from './filingWindows';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';

/** Order lifecycle states. `needs_review` is new — see alertOps below. */
export const ORDER_STATUS = {
  AWAITING_SIGNATURE: 'awaiting_signature',
  QUEUED: 'queued',
  FILED: 'filed',
  NEEDS_REVIEW: 'needs_review',
};

/**
 * Page an operator. Previously every failure was a console.error in a Vercel log
 * nobody reads, so a permanently-failing order retried silently forever while the
 * customer's portal said "filed".
 */
async function alertOps(subject, body) {
  console.error(`[OPS ALERT] ${subject} :: ${body}`);
  const to = process.env.OPS_ALERT_EMAIL;
  if (!to) return;
  try {
    await fetch(`${BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({ to, subject: `[TaxAppeal] ${subject}`, html: `<pre>${body}</pre>` }),
    });
  } catch (e) { console.error('alertOps failed:', e.message); }
}

/** Pull the generated petition/letter HTML back out of Redis. */
async function loadLetter(letterKey) {
  if (!letterKey || !redis) return null;
  try { return await redis.get(letterKey); } catch (e) { return null; }
}


/**
 * Send the customer's receipt. This used to fire from the browser on /success,
 * which meant anyone who closed the tab got no receipt at all for a payment we
 * had already captured.
 */
async function sendReceipt({ session, m, stateCode, status }) {
  const to = session.customer_email || m.email;
  if (!to) return;
  try {
    await fetch(`${BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({
        to,
        type: 'confirmation',
        customerName: m.customerName || '',
        address: m.address || '',
        county: m.county || '',
        sessionId: session.id,
        // Real amount charged, from Stripe. The old emails hardcoded "$89.00"
        // even for Florida customers billed $104-$139 including the county fee.
        amountPaid: session.amount_total,
        stateCode,
        orderStatus: status,
      }),
    });
  } catch (e) { console.error('sendReceipt failed:', e.message); }
}

/**
 * Fulfill a paid Stripe Checkout session.
 *
 * Idempotent: safe to call repeatedly for the same session. Stripe retries
 * webhooks on any non-2xx, so this WILL be called more than once in practice.
 */
export async function fulfillCheckoutSession(sessionId) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Database unavailable');

  // 1. Re-read the session from Stripe. Never trust anything client-supplied.
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') {
    console.log(`fulfill: session ${sessionId} not paid (${session.payment_status}), skipping`);
    return { skipped: true, reason: 'not_paid' };
  }

  const m = session.metadata || {};
  const stateCode = (m.stateCode || '').toUpperCase();
  const isFL = stateCode === 'FL';

  // 2. Idempotency on the order row.
  const { data: existing } = await supabase
    .from('orders').select('id, dispute_status, lob_letter_id')
    .eq('stripe_session_id', sessionId).maybeSingle();

  if (existing) {
    console.log(`fulfill: order ${existing.id} already exists for ${sessionId}`);
    // Still attempt mailing if it was created but never dispatched.
    if (!existing.lob_letter_id && existing.dispute_status === ORDER_STATUS.QUEUED) {
      return await attemptMail({ supabase, orderId: existing.id, sessionId, m, stateCode, isFL });
    }
    return { alreadyFulfilled: true, orderId: existing.id };
  }

  const letterText = await loadLetter(m.letterKey);

  // 3. Decide the starting state.
  //    FL: the owner signs Part 3 BEFORE payment, so we can mail as soon as the
  //        filing window is open.
  //    TX/GA/AR/AL: the owner signs AFTER payment on /success, so the order waits.
  let disputeStatus;
  if (!isFL) {
    disputeStatus = ORDER_STATUS.AWAITING_SIGNATURE;
  } else {
    const ws = getFilingWindowStatus(stateCode);
    disputeStatus = ws && ws.canFile ? ORDER_STATUS.QUEUED : ORDER_STATUS.QUEUED;
  }

  // 4. Write the order row FIRST. This is the step that must never be skipped —
  //    it is the difference between a recoverable problem and a silent loss.
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      customer_name: m.customerName || null,
      customer_email: (session.customer_email || m.email || '').toLowerCase() || null,
      password_hash: m.passwordHash || null,
      property_address: m.address || null,
      county: m.county || null,
      state: m.ownerState || null,
      state_code: stateCode || null,
      assessed_value: m.assessedValue ? Number(m.assessedValue) : null,
      target_reduction: m.targetReduction ? Number(m.targetReduction) : null,
      estimated_savings: m.savings ? Number(m.savings) : null,
      stripe_session_id: sessionId,
      amount_paid: session.amount_total,
      payment_status: 'paid',
      lob_status: 'pending',
      dispute_status: disputeStatus,
      scheduled_file_date: m.scheduledFileDate || null,
      letter_text: letterText || null,
      vab_fee: m.vabFee ? Number(m.vabFee) : null,
      vab_payable_to: m.vabPayableTo || null,
      fl_signature_name: m.flSignatureName || null,
      fl_auth_date: m.flAuthDate || null,
      owner_street: m.ownerStreet || null,
      owner_city: m.ownerCity || null,
      owner_state: m.ownerState || null,
      owner_zip: m.ownerZip || null,
      ref_code: m.refCode || null,
    })
    .select().single();

  if (error) {
    // A unique-constraint violation means a concurrent webhook delivery won the
    // race — that's success, not failure.
    if (error.code === '23505') return { alreadyFulfilled: true, raced: true };
    await alertOps('Order insert FAILED after payment', `session=${sessionId}\n${error.message}`);
    throw new Error(`Order insert failed: ${error.message}`);
  }

  console.log(`fulfill: created order ${order.id} (${stateCode}, ${disputeStatus})`);

  // Receipt first, mailing second. The payment is already captured; the customer
  // gets confirmation regardless of whether Lob is healthy.
  await sendReceipt({ session, m, stateCode, status: disputeStatus });

  // 5. Mail now only for FL, where the signature already exists.
  if (isFL) {
    return await attemptMail({ supabase, orderId: order.id, sessionId, m, stateCode, isFL, letterText });
  }

  return { orderId: order.id, status: disputeStatus, awaitingSignature: true };
}

/**
 * Attempt the physical mailing. Failure here NEVER loses the order — it flips the
 * row to needs_review and pages ops, so a human can act inside the filing window.
 */
async function attemptMail({ supabase, orderId, sessionId, m, stateCode, isFL, letterText, signature }) {
  const letter = letterText || (await loadLetter(m.letterKey));

  if (!letter) {
    await supabase.from('orders').update({ dispute_status: ORDER_STATUS.NEEDS_REVIEW }).eq('id', orderId);
    await alertOps('Petition text missing at mail time', `order=${orderId} session=${sessionId} letterKey=${m.letterKey}`);
    return { orderId, status: ORDER_STATUS.NEEDS_REVIEW, reason: 'letter_missing' };
  }

  const ws = getFilingWindowStatus(stateCode);
  // Gate on canFile, not isOpen. canFile respects the minDays receipt buffer —
  // Florida requires physical RECEIPT by the deadline, so mailing on day 22 of a
  // 25-day window produces a rejected petition and a customer with no recourse.
  if (ws && !ws.canFile) {
    console.log(`fulfill: ${stateCode} window not fileable yet/anymore, leaving order ${orderId} queued`);
    return { orderId, status: ORDER_STATUS.QUEUED, reason: 'window' };
  }

  try {
    const r = await fetch(`${BASE_URL}/api/send-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({
        sessionId,
        isFL,
        stateCode,
        county: m.county,
        propertyAddress: m.address,
        ownerName: m.customerName,
        ownerEmail: m.email,
        ownerStreet: m.ownerStreet, ownerCity: m.ownerCity,
        ownerState: m.ownerState, ownerZip: m.ownerZip,
        letterContent: letter,
        // FL: the owner signed Part 3 pre-payment (carried in Stripe metadata).
        // Other states: the owner signs post-payment, so it comes from the row.
        ownerSignatureName: m.flSignatureName || signature?.typedName || null,
        ownerSignatureDate: m.flAuthDate || signature?.signedAt || null,
        signedName: signature?.typedName || null,
        signedAt: signature?.signedAt || null,
        signatureImage: signature?.image || null,
      }),
    });
    const mail = await r.json();

    if (!r.ok || !mail.success) {
      await supabase.from('orders').update({ dispute_status: ORDER_STATUS.NEEDS_REVIEW }).eq('id', orderId);
      await alertOps('Mailing FAILED after payment', `order=${orderId} session=${sessionId}\n${mail.error || r.status}`);
      return { orderId, status: ORDER_STATUS.NEEDS_REVIEW, reason: mail.error || 'mail_failed' };
    }

    const { error: updErr } = await supabase.from('orders').update({
      dispute_status: ORDER_STATUS.FILED,
      lob_letter_id: mail.letterId || null,
      lob_tracking_number: mail.trackingNumber || null,
      lob_status: 'dispatched',
      mailed_at: new Date().toISOString(),
    }).eq('id', orderId);

    if (updErr) {
      // Mail WENT OUT but we couldn't record it. This must not be retried — a
      // retry cuts a second real check. send-letter is idempotent per session so
      // a retry would be caught there too, but flag it regardless.
      await alertOps('CRITICAL: mailed but DB update failed', `order=${orderId} lob=${mail.letterId}\n${updErr.message}`);
      return { orderId, status: 'mailed_unrecorded', critical: true, lobId: mail.letterId };
    }

    return { orderId, status: ORDER_STATUS.FILED, lobId: mail.letterId };
  } catch (err) {
    await supabase.from('orders').update({ dispute_status: ORDER_STATUS.NEEDS_REVIEW }).eq('id', orderId);
    await alertOps('Mailing threw after payment', `order=${orderId} session=${sessionId}\n${err.message}`);
    return { orderId, status: ORDER_STATUS.NEEDS_REVIEW, reason: err.message };
  }
}


/**
 * Mail an order whose owner has just signed (TX/GA/AR/AL post-payment flow).
 *
 * fulfillCheckoutSession() intentionally leaves non-FL orders in
 * `awaiting_signature` and does NOT mail — mailing an unsigned protest is exactly
 * the bug that broke Florida. This is the second half of that flow.
 */
export async function fulfillAfterSignature(sessionId) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Database unavailable');

  const { data: order } = await supabase
    .from('orders')
    .select('id, dispute_status, lob_letter_id, signed_at, signature_typed_name, signature_image, state_code')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  if (!order) return { error: 'order_not_found' };
  if (order.lob_letter_id) return { orderId: order.id, alreadyMailed: true };
  if (!order.signed_at) return { orderId: order.id, error: 'not_signed' };

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const m = session.metadata || {};
  const stateCode = (m.stateCode || order.state_code || '').toUpperCase();

  return await attemptMail({
    supabase,
    orderId: order.id,
    sessionId,
    m,
    stateCode,
    isFL: stateCode === 'FL',
    signature: {
      typedName: order.signature_typed_name,
      image: order.signature_image,
      signedAt: order.signed_at,
    },
  });
}
