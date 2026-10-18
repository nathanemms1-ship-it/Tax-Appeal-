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
 *   - Because the browser had to drive it, the old save and mail routes had to
 *     be publicly callable, which is what made them exploitable.
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
import { NO_PASSWORD_SENTINEL } from './noPassword';
import { alertOps as pageOps } from './alertOps';
import { Resend } from 'resend';
import { dispatchKit, isKitState, KIT_STATUS } from './kit/dispatchKit';
import { noticeUrl, trimUrl } from './kit/noticeLink';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';

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

/** The kit builder's input, stored in Redis by the apply flow (kit states only). */
async function loadKitOrder(kitKey) {
  if (!kitKey || !redis) return null;
  try {
    const v = await redis.get(kitKey);
    if (!v) return null;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch (e) { return null; }
}


/**
 * Send the customer's receipt. This used to fire from the browser on /success,
 * which meant anyone who closed the tab got no receipt at all for a payment we
 * had already captured.
 */
async function sendReceipt({ session, m, stateCode, status, noticeUrl: noticeLink = null }) {
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
        // Pre-sale only: the private link to enter the notice (lib/kit/noticeLink.js).
        noticeUrl: noticeLink,
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
/**
 * ON tx_cautions, one line inside the insert below, which needs a paragraph.
 *
 * Texas packets are no longer refused on the merits: a weak case is shown to the
 * owner as named cautions and they choose whether to file. That only holds up if
 * there is a record of it — otherwise we warn someone that the cap makes their
 * protest pointless, take $89 when they proceed, and keep no evidence they were
 * told. The same job orders.owner_ack and fl_will_not_attend do for Florida.
 *
 * Stripe metadata is strings only, so it arrives comma-joined and is split back
 * into the text[] the column holds. Empty string -> null, so a clean packet
 * stores nothing rather than an array containing "".
 *
 * The paragraph lives HERE and not beside the field on purpose:
 * scripts/verify-schema.mjs reads a 3000-character window after `from('orders')`
 * to find written columns, and a comment inside the insert pushes later columns
 * out of that window. Writing it inline broke the extractor's detection of
 * account_number and evidence_text on the first attempt — the exact failure the
 * comment at `gclid` warns about, twenty lines further down.
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

  return fulfillSession(session, supabase);
}

/**
 * Everything after the payment is known to be good. Shared by Stripe sessions
 * and by a free kit (lib/kit/freeKit.js, 17 Oct 2026), whose "session" is built
 * by checkout: id `free_<uuid>`, amount_total 0, the same metadata.
 */
export async function fulfillSession(session, supabase = getSupabaseAdmin()) {
  if (!supabase) throw new Error('Database unavailable');
  const sessionId = session.id;
  const m = session.metadata || {};
  const stateCode = (m.stateCode || '').toUpperCase();

  // 2. Idempotency on the order row.
  const { data: existing } = await supabase
    .from('orders').select('id, dispute_status, lob_letter_id')
    .eq('stripe_session_id', sessionId).maybeSingle();

  if (existing) {
    console.log(`fulfill: order ${existing.id} already exists for ${sessionId}`);
    // Stripe retries checkout.session.completed on any non-2xx, so this runs more
    // than once. A kit left kit_queued is retried by cron/process-queued-orders.js.
    return { alreadyFulfilled: true, orderId: existing.id };
  }

  // 3. Decide the starting state. GA, TX and FL are sold only as kits: nothing is
  //    signed online and nothing goes to a county. The kit is built and mailed to
  //    the customer now. The kit builder's input was stored in Redis by the apply
  //    flow under m.kitKey; with it the order is `kit_queued`, without it (a
  //    pre-sale before the notice arrives) it is `awaiting_notice`. Any other
  //    state is not sold (checkout answers STATE_NOT_OPEN), so a paid one is
  //    `needs_review`.
  const isKit = isKitState(stateCode);
  const loaded = isKit ? await loadKitOrder(m.kitKey) : null;
  // A free kit records which proved guarantee paid for it.
  const kitOrder = loaded && m.freeFromOrder ? { ...loaded, freeKit: { fromOrderId: m.freeFromOrder } } : loaded;
  // A pre-sale (kitOrder.presale, 16 Oct 2026) is stored too, but waits for the
  // notice: lib/kit/presale.js finishes it, or refunds it.
  const disputeStatus = !isKit ? KIT_STATUS.NEEDS_REVIEW
    : kitOrder && kitOrder.presale !== true ? KIT_STATUS.QUEUED : KIT_STATUS.AWAITING_NOTICE;

  /**
   * ==========================================================================
   * password_hash GETS THE SENTINEL, NOT A NULL — AND THIS IS THE INSERT THAT RUNS
   * ==========================================================================
   * lib/noPassword.js exists to keep an untested null out of that column now the
   * funnel no longer collects a password. The first version of that change put the
   * sentinel in the old save-order route — a file whose own header said it had
   * no in-app caller since fulfillment moved here. So the guarded path was the dead
   * one, and this one went on writing `|| null` on 100% of orders where it had
   * previously written it on none.
   *
   * That is precisely the failure lib/noPassword.js was written to avoid, committed
   * in the act of describing it: a property proven about the wrong set. The build
   * was green throughout. scripts/verify-handoff.mjs now sweeps for every file that
   * writes the column rather than being told which file to look at.
   *
   * checkout.js no longer sends a passwordHash at all, so `m.passwordHash` is
   * undefined for every order this funnel produces and the sentinel is written.
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
      // Placed high in this insert on purpose: scripts/verify-schema.mjs reads
      // only the first 3000 characters after `from('orders')` to find the
      // columns being written, and the note above this insert records that two
      // columns were once pushed past that window by a long comment.
      gclid: m.gclid || null,
      utm: m.utm || null,
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
      tx_cautions: m.txCautions ? String(m.txCautions).split(',').filter(Boolean) : null, // note above fulfillCheckoutSession
      estimated_savings: m.savings ? Number(m.savings) : null,
      stripe_session_id: sessionId,
      amount_paid: session.amount_total,
      payment_status: 'paid',
      lob_status: 'pending',
      dispute_status: disputeStatus,
      kit_order: kitOrder || null,
      evidence_text: null, // old petition path, kept as verify-schema's canary column
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
  // A kit sold in the last days before its deadline is emailed, not mailed
  // (lib/kit/delivery.js): its receipt must not promise a printed kit.
  await sendReceipt({ session, m, stateCode, status: disputeStatus === KIT_STATUS.QUEUED && m.kitDelivery === 'pdf' ? 'kit_pdf' : disputeStatus, noticeUrl: disputeStatus === KIT_STATUS.AWAITING_NOTICE && stateCode === 'GA' ? noticeUrl(order.id) : disputeStatus === KIT_STATUS.AWAITING_NOTICE && stateCode === 'FL' ? trimUrl(order.id) : null });

  // KIT: mail it now. dispatchKit never throws for a refused or failed kit: it
  // sets kit_queued (retry) or needs_review (a person looks) and pages ops, so a
  // captured payment can never become a webhook 500 that Stripe replays.
  if (isKit && kitOrder && kitOrder.presale !== true) {
    try {
      const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
      const r = await dispatchKit(order, { supabase, resend, alertOps: pageOps });
      return { orderId: order.id, status: r.status, kit: true, letterId: r.letterId || null };
    } catch (e) {
      await pageOps('Kit dispatch threw after payment', `order=${order.id}\n${e?.message}`, { force: true });
      return { orderId: order.id, status: KIT_STATUS.QUEUED, kit: true };
    }
  }
  if (isKit) return { orderId: order.id, status: disputeStatus, kit: true };
  // A paid order for a state that is not sold as a kit. Checkout refuses these
  // (STATE_NOT_OPEN), so this should never run. If it does, a person looks.
  await pageOps('Paid order for a non-kit state', `order=${order.id} session=${sessionId} state=${stateCode}`, { force: true });
  return { orderId: order.id, status: disputeStatus };
}
