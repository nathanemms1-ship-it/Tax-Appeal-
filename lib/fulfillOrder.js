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
import { NO_PASSWORD_SENTINEL } from './noPassword';
import { alertOps as pageOps } from './alertOps';

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
 *
 * Now imported from lib/alertOps.js: this used to be a private copy here, which meant
 * only the fulfillment path could page anyone. Spend ceilings, invalid API keys and
 * missing env vars had no way to reach a human at all.
 *
 * Fulfillment alerts pass force:true — every one of them is about a specific order
 * that took money and did not mail, so none may be de-duplicated away.
 */

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
        // send-email destructures firstName/lastName, not customerName — sending
        // the wrong field name made every receipt read "Hi undefined,".
        firstName: (m.customerName || '').split(' ')[0] || '',
        lastName: (m.customerName || '').split(' ').slice(1).join(' ') || '',
        customerName: m.customerName || '',
        address: m.address || '',
        county: m.county || '',
        sessionId: session.id,
        // Real amount charged, from Stripe. The old emails hardcoded "$89.00"
        // even for Florida customers billed $104-$139 including the county fee.
        amountPaid: session.amount_total,
        stateCode,
        // orderStatus decides what the receipt is allowed to CLAIM. It was already
        // being sent here and was dropped in send-email.js, so every receipt said
        // "Has Been Filed" — including pre-orders that will not be mailed for weeks.
        orderStatus: status,
        /**
         * NO signingUrl. The receipt does not ask for a signature, so it has no
         * button, so it needs no link — see the 'awaiting_signature' case in
         * pages/api/email-templates.js. The customer signs on the confirmation page
         * they are already on; the only email that asks is the ten-minute reminder,
         * and pages/api/cron/signature-reminder.js builds its own link.
         *
         * Worth keeping out on its own merits: /success?session_id=... is a bearer
         * link to a page that signs a sworn attestation. It belongs in the one email
         * that needs it, not in every receipt.
         */
        // So the receipt can show the county filing fee separately from the $89
        // service fee, instead of labelling the whole charge "Filing Fee Paid".
        vabFee: m.vabFee ? Number(m.vabFee) : null,
        scheduledFileDate: m.scheduledFileDate || null,
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
    /**
     * DO NOT RE-ENTER attemptMail HERE. Removed 11 Aug 2026.
     *
     * This used to "still attempt mailing if it was created but never dispatched"
     * for any QUEUED order. Stripe retries checkout.session.completed on ANY non-2xx
     * response (see pages/api/webhooks/stripe.js), so a single transient failure
     * anywhere downstream brings us back through here for an order that is already
     * correctly queued and signed.
     *
     * Before 24 August that was invisible: attemptMail took the !canFile branch and
     * re-queued the row it had just read. From the moment the Florida window opens,
     * canFile is true and it POSTs to send-letter instead — and anything short of a
     * clean mail writes `needs_review`, which is NOT the status the dispatch cron
     * selects and NOT the status /admin renders. A retry would quietly take a good
     * order out of the queue it was waiting in.
     *
     * QUEUED orders already have an owner: cron/process-queued-orders.js, hourly,
     * which is the one path that checks the filing window and the county gates
     * before mailing. There is nothing for this branch to add.
     */
    return { alreadyFulfilled: true, orderId: existing.id };
  }

  const letterText = await loadLetter(m.letterKey);
  // The evidence section, cached beside the document by generate-dr486. Stored on
  // the order so /api/finalize-order can rebuild THIS petition with the signature
  // rather than generating a different one. It carries the owner's reported defects
  // and the verified comparable sales; losing it is how both went missing between
  // purchase and filing.
  const evidenceText = m.letterKey ? await loadLetter(`${m.letterKey}:evidence`) : null;

  // 3. Decide the starting state.
  //
  //    EVERY state now waits for the owner's signature, Florida included.
  //
  //    Florida used to sign Part 3 BEFORE payment, on the review screen - where
  //    the second half of the petition is deliberately blurred. That meant the
  //    owner attested, under penalties of perjury, that they had "read this
  //    petition and the facts stated in it are true", about a document the page
  //    was actively preventing them from reading, including comparable sales they
  //    could not see. If a comp were wrong, the homeowner had signed the false
  //    sworn statement.
  //
  //    Florida is the one state where the signature is a statutory sworn
  //    attestation (Fla. Stat. s. 194.011(3) + DR-486 Part 3), and it was the one
  //    state signing blind. It now uses the same post-payment flow the other four
  //    already used: the order is created, nothing mails, and the owner signs the
  //    complete unblurred petition on /success.
  const disputeStatus = ORDER_STATUS.AWAITING_SIGNATURE;

  /**
   * ==========================================================================
   * password_hash GETS THE SENTINEL, NOT A NULL — AND THIS IS THE INSERT THAT RUNS
   * ==========================================================================
   * lib/noPassword.js exists to keep an untested null out of that column now the
   * funnel no longer collects a password. The first version of that change put the
   * sentinel in pages/api/save-order.js — a file whose own header says it has had
   * no in-app caller since fulfillment moved here. So the guarded path was the dead
   * one, and this one went on writing `|| null` on 100% of orders where it had
   * previously written it on none.
   *
   * That is precisely the failure lib/noPassword.js was written to avoid, committed
   * in the act of describing it: a property proven about the wrong set. The build
   * was green throughout. scripts/verify-handoff.mjs now sweeps for every file that
   * writes the column rather than being told which file to look at.
   *
   * checkout.js initialises `passwordHash` to '' and fills it only when a password
   * was supplied, so `m.passwordHash` is falsy for every order this funnel produces.
   *
   * KEEP THIS NOTE OUT OF THE OBJECT LITERAL BELOW. scripts/verify-schema.mjs reads
   * 3000 characters after `from('orders')` to extract the columns being written; the
   * first draft put these twenty lines inside the insert and pushed account_number
   * and evidence_text past that window, so the extractor stopped seeing two columns
   * and its own canary assertions failed. A comment can break a guard by length
   * alone.
   */
  // 4. Write the order row FIRST. This is the step that must never be skipped —
  //    it is the difference between a recoverable problem and a silent loss.
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      customer_name: m.customerName || null,
      customer_email: (session.customer_email || m.email || '').toLowerCase() || null,
      // password_hash: the sentinel, not a null. See the note above this insert.
      password_hash: m.passwordHash || NO_PASSWORD_SENTINEL,
      property_address: m.address || null,
      county: m.county || null,
      // account_number is the parcel/folio number. It was READ by
      // pages/api/webhooks/inbound-email.js as its fallback way of matching a county
      // decision letter to an order, but nothing ever WROTE it — so that fallback
      // could never match and any letter naming the parcel rather than the address
      // fell through to "No customer match found". Written from 5 Aug 2026.
      account_number: m.parcelId || null,
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
      evidence_text: evidenceText || null,
      vab_fee: m.vabFee ? Number(m.vabFee) : null,
      vab_payable_to: m.vabPayableTo || null,
      fl_signature_name: m.flSignatureName || null,
      fl_auth_date: m.flAuthDate || null,
      owner_street: m.ownerStreet || null,
      owner_city: m.ownerCity || null,
      owner_state: m.ownerState || null,
      owner_zip: m.ownerZip || null,
      ref_code: m.refCode || null,

      // THE COUPON, STAMPED ON THE ORDER IN THE SAME INSERT.
      //
      // Not a follow-up UPDATE, because this column is what
      // lib/referralSettlement.js reads to refuse the $20 referral commission on
      // a discounted order. If the insert succeeded and a later UPDATE failed,
      // the order would pay BOTH the discount and the commission — $40 out on an
      // $89 fee — and nothing would report it. Written atomically with the row it
      // belongs to, it cannot end up missing.
      perk_code: m.perkCode || null,
      perk_discount_cents: m.perkDiscountCents ? Number(m.perkDiscountCents) : null,
    })
    .select().single();

  if (error) {
    // A unique-constraint violation means a concurrent webhook delivery won the
    // race — that's success, not failure.
    if (error.code === '23505') return { alreadyFulfilled: true, raced: true };
    await pageOps('Order insert FAILED after payment', `session=${sessionId}\n${error.message}`, { force: true });
    throw new Error(`Order insert failed: ${error.message}`);
  }

  console.log(`fulfill: created order ${order.id} (${stateCode}, ${disputeStatus})`);

  /**
   * Burn the coupon. AFTER the order row exists, never before.
   *
   * The order is the thing that must not be lost; the coupon is $20. If this
   * throws, the order still stands, the customer keeps their discount, and the
   * reservation continues to block reuse for its remaining hold — so the failure
   * window is minutes, not permanent.
   *
   * Deliberately NOT awaited into the critical path's error handling: a coupon
   * bookkeeping failure must never turn a captured payment into a 500 that Stripe
   * then retries.
   */
  if (m.perkCode && m.perkKey) {
    try {
      const { data: burned, error: burnErr } = await supabase.rpc('perk_confirm', {
        p_code: m.perkCode, p_session: m.perkKey, p_order_id: String(order.id),
      });
      if (burnErr) {
        await pageOps('Coupon confirm failed after payment',
          `order=${order.id} code=${m.perkCode}\n${burnErr.message}`, { force: true });
      } else if (!burned?.length) {
        // The order was discounted but the reservation is gone — expired during a
        // slow checkout, or already confirmed by a retried webhook delivery. The
        // second is normal and idempotent. Logged rather than paged because the
        // money already moved correctly and orders.perk_code is stamped, so
        // settlement will still refuse the commission.
        console.warn(`fulfill: coupon ${m.perkCode} had no live reservation for order ${order.id}`);
      } else {
        console.log(`fulfill: coupon ${m.perkCode} redeemed by order ${order.id}`);
      }
    } catch (e) {
      console.error('fulfill: coupon confirm threw:', e?.message);
    }
  }

  // Receipt first, mailing second. The payment is already captured; the customer
  // gets confirmation regardless of whether Lob is healthy.
  await sendReceipt({ session, m, stateCode, status: disputeStatus });

  /**
   * 5. NOTHING MAILS HERE. Removed 11 Aug 2026.
   *
   * This block read "mail now only for FL, where the signature already exists." That
   * comment was true once and had been false for some time: line 175 above creates
   * EVERY order as AWAITING_SIGNATURE, Florida included, because Florida moved to
   * signing after payment. pages/apply.js sends `flSignatureName: ''` into checkout,
   * so at this point in the flow there is no signature to mail with — attemptMail
   * resolved the signature fields to null and posted anyway.
   *
   * It looked harmless only because the filing window was shut. send-letter.js
   * rejects an unsigned petition ("Protest has not been signed by the owner"), and
   * from 24 August that rejection would have run on EVERY Florida order at the moment
   * of purchase — writing `needs_review` and paging ops with force:true, once per
   * order, with no de-duplication. checkStuckOrders has no age cutoff, so a
   * thirty-second-old order would have held the business-critical check at `critical`
   * all season and buried the real "paid but never mailed" signal underneath it.
   *
   * The correct path already exists and is the only one that checks the window and
   * the county gates first: the customer signs, /api/finalize-order calls
   * fulfillAfterSignature, and the order becomes `queued` for the hourly dispatch
   * cron. Every Florida order goes that way now, exactly like every other state.
   */
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
    await pageOps('Petition text missing at mail time', `order=${orderId} session=${sessionId} letterKey=${m.letterKey}`, { force: true });
    return { orderId, status: ORDER_STATUS.NEEDS_REVIEW, reason: 'letter_missing' };
  }

  // m.county, not bare stateCode. Florida has no statewide deadline: this call used
  // to measure every Florida order against 18 September, which is Miami-Dade's date.
  // Hillsborough closes on the 7th. strict:true means a missing county falls to the
  // earliest date we stand behind rather than the latest — this is the last gate
  // before an irreversible physical mailing, so it must fail conservative.
  const ws = getFilingWindowStatus(stateCode, m.county, { strict: true });
  // Gate on canFile, not isOpen. canFile respects the minDays receipt buffer —
  // Florida requires physical RECEIPT by the deadline, so mailing on day 22 of a
  // 25-day window produces a rejected petition and a customer with no recourse.
  if (ws && !ws.canFile) {
    // WRITE the status, do not merely return it.
    //
    // This branch used to `return { status: QUEUED }` and touch nothing. Its log
    // line said "leaving order queued", which was the assumption that hid the bug:
    // the order was never queued. fulfillCheckoutSession creates every order as
    // AWAITING_SIGNATURE, so an order that reached here — including one whose owner
    // had just signed — stayed in awaiting_signature forever.
    //
    // Everything downstream selects on dispute_status = 'queued':
    //   - pages/api/cron/process-queued-orders.js, which is what actually mails on
    //     opening day. It would never have seen these orders. Paid, signed, and
    //     silently unfiled through the whole window.
    //   - the Queued Pre-Orders panel on /admin, so there was no manual recovery
    //     either — the row simply was not there to act on.
    //   - checkFilingDeadlines, so the deadline monitor was blind to it too.
    // And checkStuckOrders would have reported it as "paid, never signed", which is
    // the wrong diagnosis and would have sent someone looking in the wrong place.
    //
    // Found 5 Aug 2026 by the first real end-to-end purchase. Nothing else could
    // have found it: every layer of the system agreed with itself and was wrong.
    //
    // The two filters are the safety. `.eq(AWAITING_SIGNATURE)` means we only ever
    // advance FORWARD from that one state — a row already in needs_review, filed or
    // queued is untouched. `.not('signed_at','is',null)` means an unsigned order is
    // left alone, because queueing a petition nobody has attested to would put it in
    // the path of the opening-day cron. Both must hold; neither is redundant.
    const { error: qErr } = await supabase
      .from('orders')
      .update({ dispute_status: ORDER_STATUS.QUEUED })
      .eq('id', orderId)
      .eq('dispute_status', ORDER_STATUS.AWAITING_SIGNATURE)
      .not('signed_at', 'is', null);

    if (qErr) {
      // The order is paid and signed but will not be picked up on opening day.
      // That is the silent-loss outcome, so it pages rather than logs.
      await pageOps(
        'Could not queue a signed order',
        `order=${orderId} session=${sessionId} state=${stateCode}\n${qErr.message}\n\n` +
        `This order is PAID and SIGNED but its dispute_status is not 'queued', so ` +
        `process-queued-orders will not mail it when the window opens.`,
        { force: true }
      );
    }

    console.log(`fulfill: ${stateCode} window not fileable yet/anymore, order ${orderId} queued for the window`);
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
        parcelId: m.parcelId || '',
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
      await pageOps('Mailing FAILED after payment', `order=${orderId} session=${sessionId}\n${mail.error || r.status}`, { force: true });
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
      await pageOps('CRITICAL: mailed but DB update failed', `order=${orderId} lob=${mail.letterId}\n${updErr.message}`, { force: true });
      return { orderId, status: 'mailed_unrecorded', critical: true, lobId: mail.letterId };
    }

    return { orderId, status: ORDER_STATUS.FILED, lobId: mail.letterId };
  } catch (err) {
    await supabase.from('orders').update({ dispute_status: ORDER_STATUS.NEEDS_REVIEW }).eq('id', orderId);
    await pageOps('Mailing threw after payment', `order=${orderId} session=${sessionId}\n${err.message}`, { force: true });
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
