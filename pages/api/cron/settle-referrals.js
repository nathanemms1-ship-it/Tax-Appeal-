// pages/api/cron/settle-referrals.js
/**
 * THE MONTHLY RUN THAT ACTUALLY MOVES THE MONEY.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * Every partner-facing surface promised a monthly payout, and nothing paid.
 *
 *   pages/api/save-order.js  removed the instant transfer — correctly, it was
 *     paying twice and was exploitable — and left a comment pointing at "the
 *     monthly settlement run". That run did not exist.
 *   vercel.json              had four crons. None of them was this one.
 *   partners/dashboard.js    rendered "$X paid out" and "paid on the 1st" for
 *     money that had never left the platform balance.
 *
 * So the system told partners it had paid them, and had not. This route is the
 * thing those three files were describing.
 *
 * ============================================================================
 * HOW IT AVOIDS PAYING TWICE — THREE INDEPENDENT GUARDS
 * ============================================================================
 * Paying a partner twice is not a bug you find in the logs; you find it when the
 * bank balance is wrong. So there are three layers, and any one of them alone
 * would be enough on a good day:
 *
 *   1. THE UNIQUE CONSTRAINT on referral_payouts.order_id.
 *      The only guard that cannot race. Two overlapping runs both read an empty
 *      ledger; the database still lets exactly one of them insert.
 *
 *   2. THE STRIPE IDEMPOTENCY KEY, `refpayout_<orderId>`.
 *      Deterministic from the order id, so a retry replays rather than repeats.
 *      Covers the window between "transfer created" and "row updated".
 *
 *   3. THE transfer_group LOOKUP.
 *      Idempotency keys expire after 24 hours. A row left `pending` by a crash and
 *      retried next month would fall straight through guard 2. So before retrying
 *      any non-fresh order we ASK STRIPE whether a transfer already carries this
 *      order's transfer_group, and adopt it instead of creating another.
 *
 * Guard 3 is the one that is easy to leave out and expensive to leave out.
 *
 * ============================================================================
 * WRITE ORDER, AND WHY IT IS THIS WAY ROUND
 * ============================================================================
 *   claim (insert 'pending')  ->  transfer  ->  mark 'paid'
 *
 * Transferring first and recording second means a crash in between pays money we
 * have no record of — the next run sees an unsettled order and tries again.
 * Recording first and transferring second means a crash in between records money
 * we never sent. Neither is acceptable, so the row is inserted in a `pending`
 * state that claims the order without asserting payment, and is only promoted to
 * `paid` once Stripe has confirmed. `pending` and `failed` rows are retried on the
 * next run; `paid` rows never are.
 *
 * ============================================================================
 * RUNNING IT BY HAND
 * ============================================================================
 *   Dry run (no money moves, tells you exactly what it would do):
 *     curl -H "Authorization: Bearer $CRON_SECRET" \
 *       'https://www.taxappealusa.com/api/cron/settle-referrals?dryRun=1'
 *
 *   A specific month:
 *     ...&month=2026-08
 *
 *   For real: same URL without dryRun. There is no confirmation prompt.
 */
import Stripe from 'stripe';
import { getSupabaseAdmin } from '../supabase';
import { requireCronSecret } from '../../../lib/webhookAuth';
import { settle, REFERRAL_PAYOUT_CENTS, MIN_ORDER_AGE_DAYS } from '../../../lib/referralSettlement';

export const config = { maxDuration: 300 };

/**
 * How far BEFORE the period start to look for orders.
 *
 * The holdback (MIN_ORDER_AGE_DAYS) means an order from the last week of August is
 * not payable on 1 September. If the query were bounded strictly to August, the
 * October run — scoped to September — would never look at it again and that partner
 * would simply never be paid.
 *
 * So the lower bound reaches back a clear margin beyond the holdback. Re-examining
 * already-paid orders is free and safe: `already_settled` skips them, and the UNIQUE
 * constraint on referral_payouts.order_id is underneath that.
 *
 * IT ALSO SETS THE CLAWBACK DETECTION HORIZON, WHICH IS THE REASON IT CHANGED.
 *
 * A reversed order can only be clawed back if this run still looks at it, because
 * orderStatusById is built from this same query. So the window does double duty: it
 * decides who gets paid late, and it decides how long a refund or chargeback can
 * still be recovered.
 *
 * A run in month R covers  [ (R-1 month start) - CATCHUP_DAYS , R start ).
 * Solving that for the last run that still sees an order created on day D:
 *
 *   CATCHUP_DAYS =  45  ->  an order stays checkable for  47-62 days
 *   CATCHUP_DAYS = 150  ->                                152-170 days
 *
 * At 45 the file contradicted itself. The clawback comment below states that card
 * networks allow chargebacks "for roughly 120 days" — and detection stopped at 62.
 * A chargeback arriving on day 70 was never seen, the $20 was never recovered, and
 * nothing reported it: the order simply fell out of the window and the ledger row
 * stayed 'paid' forever.
 *
 * 150 clears 120 with a month of margin for a skipped or failed run. The cost is a
 * wider orders query, which is affordable now that every read is paged — before
 * that, widening this would have made a silent PostgREST truncation more likely,
 * not less.
 */
const CATCHUP_DAYS = 150;

// Constructed lazily, INSIDE the handler, after the CRON_SECRET check — same
// reasoning as pages/api/cron/notify-waitlist.js. A module-scope throw on a missing
// key returns 500 before the auth check runs, which hides the real problem and puts
// a dependency failure in front of the only gate protecting a money-moving route.
let _stripe = null;
function stripeClient() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

/** `refpayout_<orderId>` — used as BOTH the idempotency key and the transfer_group. */
const transferTag = (orderId) => `refpayout_${orderId}`;

/**
 * The period to settle. Default is LAST month, because this is scheduled for the
 * 1st: on 1 September we are paying out August, and August is closed.
 *
 * Boundaries are UTC. `created_at` is stored as UTC, so building them in server
 * local time would move the boundary by the server's offset and hand a 31st-of-the
 * month order to the wrong period — or, worse, to neither.
 */
function periodFor(month) {
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { start, end };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end };
}

const day = (d) => d.toISOString().split('T')[0];

/**
 * 'YYYY-MM' — the value stored in referral_payouts.payout_month.
 *
 * The ledger table was created by hand in Supabase before this run existed and
 * stamps a period with a single text month, not a start/end date pair. Adopting its
 * column rather than adding a second, differently-shaped notion of "period" — two
 * ways to express the same fact in one table is how they end up disagreeing.
 */
const monthKey = (d) => d.toISOString().slice(0, 7);

/**
 * Guard 3. Has Stripe already got a transfer for this order?
 *
 * Only called when a ledger row for the order already exists in a non-paid state,
 * i.e. a previous run got far enough to claim it and then did not finish. On the
 * normal path (no prior row) this costs nothing.
 */
async function existingTransferFor(stripe, orderId) {
  try {
    const found = await stripe.transfers.list({ transfer_group: transferTag(orderId), limit: 1 });
    return found?.data?.[0] || null;
  } catch (e) {
    // If we cannot ask, we must not guess. Returning null here would create a second
    // transfer; throwing marks this order failed and leaves it for next month, when
    // the answer is knowable. Unpaid-and-retryable beats paid-twice.
    throw new Error(`could not check for an existing transfer: ${e.message}`);
  }
}

/**
 * ============================================================================
 * EVERY LEDGER READ IS PAGED, BECAUSE A SHORT READ IS A SILENT LIE
 * ============================================================================
 * None of the three reads below had a .range() or a .limit(). PostgREST applies its
 * own db-max-rows ceiling — commonly 1000 — and returns the first N rows with a
 * 200 and no indication that anything was left behind.
 *
 * For the orders and partners reads that means missed payouts, which is annoying
 * and self-correcting: the next run picks them up.
 *
 * For referral_payouts it is the opposite of self-correcting. That table is read as
 * "every row ever written" and turned into settledOrderIds — the set of orders that
 * must NOT be paid again. A truncated read shrinks that set, and every order it
 * dropped looks unpaid. The guards that are supposed to prevent double payment all
 * read from the same short list, so they fail open together, and the failure grows
 * with the table: the more you have paid, the more you pay again.
 *
 * Paging with an explicit .order() is what makes this correct. Without a stable
 * sort PostgREST may return rows in any order between requests, so a page boundary
 * can drop a row and repeat another.
 *
 * The cap is a backstop against an infinite loop, not a size limit — it throws
 * rather than truncating, because throwing is recoverable and a short ledger is not.
 */
const PAGE_SIZE = 1000;
const MAX_ROWS = 500000;

async function fetchAllRows(buildQuery, label) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    // buildQuery() must return a FRESH builder each call — a PostgREST query builder
    // cannot be re-executed once awaited.
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    if (rows.length > MAX_ROWS) {
      throw new Error(`${label}: exceeded ${MAX_ROWS} rows while paging — refusing to settle on a partial read`);
    }
  }
}

export default async function handler(req, res) {
  if (requireCronSecret(req, res)) return;

  const dryRun = String(req.query?.dryRun || '') === '1';
  const { start, end } = periodFor(req.query?.month);

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    // ── Load the three inputs ────────────────────────────────────────────────
    // The lower bound reaches back CATCHUP_DAYS before the period so orders held by
    // the age check last month are reconsidered this month. See CATCHUP_DAYS above.
    const catchupFrom = new Date(start.getTime() - CATCHUP_DAYS * 24 * 60 * 60 * 1000);

    const orders = await fetchAllRows(
      () => supabase
        .from('orders')
        .select('id, ref_code, customer_email, payment_status, amount_paid, created_at')
        .not('ref_code', 'is', null)
        .gte('created_at', catchupFrom.toISOString())
        .lt('created_at', end.toISOString())
        .order('id', { ascending: true }),
      'orders',
    );

    const partners = await fetchAllRows(
      () => supabase
        .from('referrals')
        .select('id, code, name, first_name, email, stripe_account_id, active')
        .order('id', { ascending: true }),
      'referrals',
    );

    // Every ledger row ever written, not just this period's. An order created in
    // August and paid in a September catch-up run must not be paid again by an
    // October run scoped to August. Period bounds the ORDERS; the ledger is global.
    let ledger;
    try {
      ledger = await fetchAllRows(
        () => supabase
          .from('referral_payouts')
          .select('order_id, ref_code, status, stripe_transfer_id')
          .order('order_id', { ascending: true }),
        'referral_payouts',
      );
    } catch (ledgerError) {
      // This is the one error we refuse to work around. An empty settledOrderIds set
      // means "nothing has ever been paid", and acting on that belief pays everyone
      // again from the beginning of time. A TRUNCATED ledger is the same lie told
      // quietly, which is why fetchAllRows throws rather than returning a short list.
      throw new Error(
        `referral_payouts is unreadable (${ledgerError.message}). Refusing to settle — ` +
        `without the ledger this run cannot tell paid orders from unpaid ones. ` +
        `If the table does not exist yet, run scripts/sql/referral_payouts.sql.`
      );
    }

    // Only `paid` counts as settled. `pending` and `failed` rows are unfinished work
    // and MUST come back round — a crash between claim and transfer would otherwise
    // strand that partner's $20 permanently.
    const paidRows = (ledger || []).filter(r => r.status === 'paid');
    const paidOrderIds = new Set(paidRows.map(r => r.order_id));
    const priorAttempt = new Set((ledger || []).map(r => r.order_id));

    // SETTLED means "this order is finished with", which is NOT the same as "paid".
    // A clawed_back row was discharged by offset — no money moved, and none ever
    // will. Leaving it out of this set would hand it straight back to settle() next
    // month and pay it, undoing the clawback and making the whole mechanism a
    // one-month deferral instead of a recovery.
    const settledOrderIds = new Set([
      ...paidOrderIds,
      ...(ledger || []).filter(r => r.status === 'clawed_back').map(r => r.order_id),
    ]);

    // ── CLAWBACK: orders we already paid for that have since been reversed ────
    //
    // The holdback stops us paying inside a refund window. It cannot stop a
    // chargeback, which card networks allow for roughly 120 days — long after the
    // $20 has reached the partner's bank, where a transfer reversal would only drive
    // their connected account negative and may never be recovered.
    //
    // So instead of reversing, we NET. A partner who was paid for an order that later
    // refunded or charged back has that $20 withheld from their next settlement.
    //
    // Netting is exact because payouts are always whole $20 units: owe five, claw back
    // one, transfer four. The withheld order is marked 'clawed_back' rather than
    // 'paid', which records that it was settled by offset and stops it being paid
    // again. If the debt exceeds what is payable this run, the excess is simply not
    // marked and comes round again next month.
    const orderStatusById = new Map((orders || []).map(o => [o.id, o.payment_status]));
    const reversedByCode = {};
    for (const row of paidRows) {
      const current = orderStatusById.get(row.order_id);
      // undefined = the order is outside the catch-up window, so we cannot judge it
      // here. Not an error; it will be judged the month it falls inside the window.
      if (current === undefined || current === 'paid') continue;
      const code = String(row.ref_code || '').trim().toUpperCase();
      (reversedByCode[code] ||= []).push({ orderId: row.order_id, nowStatus: current });
    }

    // ── Decide who gets paid ─────────────────────────────────────────────────
    // requirePayoutAccount: true — this is the one caller that is about to move
    // money, so a partner with no connected bank is held over, not paid and not
    // forgotten. The dashboard and the payout sheet pass false, so those partners
    // still SEE what they have earned.
    //
    // minAgeDays — the refund holdback, applied HERE and only here. The dashboard and
    // the payout sheet pass 0, so a partner sees a referral the moment it lands,
    // labelled pending, rather than a week later.
    const result = settle({
      orders: orders || [],
      partners: partners || [],
      settledOrderIds,
      requirePayoutAccount: true,
      minAgeDays: MIN_ORDER_AGE_DAYS,
    });

    const period = { start: day(start), end: day(end), month: monthKey(start) };

    /**
     * Split a partner's payable orders into what we transfer and what we withhold to
     * settle a clawback. Withholding comes off the END of the list, which settle()
     * sorted oldest-first — so the newest order is the one held, the one with the most
     * refund window still to run.
     */
    const applyClawback = (group) => {
      const debts = reversedByCode[group.code] || [];
      const offsetCount = Math.min(debts.length, group.orders.length);
      return {
        transfer: group.orders.slice(0, group.orders.length - offsetCount),
        withheld: group.orders.slice(group.orders.length - offsetCount),
        debts: debts.slice(0, offsetCount),
        unsettledDebt: debts.length - offsetCount,
      };
    };

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        period,
        holdbackDays: MIN_ORDER_AGE_DAYS,
        wouldPay: result.payable.map(g => {
          const { transfer, withheld, unsettledDebt } = applyClawback(g);
          return {
            code: g.code,
            partner: g.partner?.email || null,
            orders: transfer.length,
            amount: `$${((transfer.length * REFERRAL_PAYOUT_CENTS) / 100).toFixed(2)}`,
            stripeAccount: g.partner?.stripe_account_id || null,
            retries: g.orders.filter(o => priorAttempt.has(o.id)).length,
            withheldForClawback: withheld.length,
            clawbackCarriedToNextRun: unsettledDebt,
          };
        }),
        totalAmount: `$${(result.payable.reduce((s, g) => s + applyClawback(g).transfer.length, 0) * REFERRAL_PAYOUT_CENTS / 100).toFixed(2)}`,
        totalOrders: result.payable.reduce((s, g) => s + applyClawback(g).transfer.length, 0),
        // Reversed orders we already paid for, whether or not they net out this run.
        reversedSincePaid: Object.entries(reversedByCode).map(([code, rows]) => ({ code, count: rows.length, orders: rows })),
        excluded: result.excluded,
        heldForRefundWindow: result.excluded.filter(e => e.reason === 'too_recent'),
        heldForNoPayoutAccount: result.excluded.filter(e => e.reason === 'no_payout_account'),
      });
    }

    // ── Move the money, one order at a time ──────────────────────────────────
    // Per ORDER, not per partner. A five-order partner where one transfer fails
    // should end up with four paid orders and one retryable one, not a failed batch
    // that is ambiguous to replay. It also makes the ledger row and the Stripe
    // transfer a clean 1:1, which is what makes the books auditable.
    const stripe = stripeClient();
    const paid = [];
    const failed = [];
    const clawedBack = [];

    for (const group of result.payable) {
      const destination = group.partner.stripe_account_id;
      const { transfer, withheld, debts, unsettledDebt } = applyClawback(group);

      // Settle the clawback FIRST, and only in memory-safe pairs: each withheld order
      // is matched to exactly one reversed order. Both rows are marked 'clawed_back'
      // together, so the books show which order discharged which debt. Neither is
      // paid, and neither can be picked up again.
      for (let i = 0; i < withheld.length; i++) {
        const held = withheld[i];
        const debt = debts[i];
        /**
         * BOTH WRITES ARE CHECKED, AND THE ORDER OF THEM IS A DELIBERATE CHOICE.
         *
         * supabase-js does NOT throw on a query error — it resolves with
         * { data: null, error }. Neither of these two writes destructured `error`,
         * so the try/catch below could not fire for a database failure, and the
         * comment inside it ("Do not fall through to paying") described something
         * that could not happen. A failed clawback was silent, pushed onto
         * clawedBack as if it had worked, and the debt came back next month.
         *
         * There is no transaction across these two statements, so one can land
         * without the other. Which one goes first decides who absorbs that:
         *
         *   debt row first  — if the second write fails, the debt is discharged and
         *                     the withheld order is simply paid next month. We
         *                     recover nothing and absorb $20.
         *   withheld first  — if the second write fails, the withheld order is
         *                     marked clawed_back (never paid) AND the debt is still
         *                     outstanding, so next month withholds a SECOND order.
         *                     The partner is docked $40 for one $20 reversal, and
         *                     nothing in the output says so.
         *
         * Debt first. A partner silently docked twice for one reversal is a worse
         * failure than the company eating $20, and it is much harder to notice.
         */
        try {
          const { error: debtError } = await supabase
            .from('referral_payouts')
            .update({
              status: 'clawed_back',
              failure_reason: `order ${debt.nowStatus}; recovered by withholding order ${held.id}`,
            })
            .eq('order_id', debt.orderId);
          if (debtError) throw new Error(`could not mark reversed order ${debt.orderId}: ${debtError.message}`);

          const { error: heldError } = await supabase.from('referral_payouts').upsert({
            order_id: held.id,
            ref_code: group.code,
            partner_email: group.partner.email || null,
            amount_cents: REFERRAL_PAYOUT_CENTS,
            status: 'clawed_back',
            stripe_account_id: destination,
            payout_month: period.month,
            // Explicitly null, so "clawed_back with no transfer id" is a guarantee
            // rather than a coincidence. partner-stats and referral-stats use exactly
            // that to tell a WITHHELD order from the REVERSED one it offsets — one
            // clawback writes two rows, and counting both reports double.
            stripe_transfer_id: null,
            failure_reason: `withheld to offset reversed order ${debt.orderId} (${debt.nowStatus})`,
          }, { onConflict: 'order_id' });
          if (heldError) {
            // The debt IS discharged at this point. Say so plainly: the recovery did
            // not happen, and no later run will retry it, because the debt no longer
            // looks reversed. This is the $20 we chose to absorb above.
            throw new Error(
              `debt ${debt.orderId} was discharged but the offsetting withhold on ${held.id} was not recorded ` +
              `— $${REFERRAL_PAYOUT_CENTS / 100} will not be recovered: ${heldError.message}`
            );
          }

          clawedBack.push({ code: group.code, reversedOrder: debt.orderId, offsetByOrder: held.id, reason: debt.nowStatus });
        } catch (e) {
          // Do not fall through to paying. An unrecorded clawback that still transfers
          // is the failure this whole mechanism exists to prevent.
          console.error(`[settle-referrals] clawback bookkeeping failed for ${debt.orderId}: ${e.message}`);
          failed.push({ orderId: debt.orderId, code: group.code, reason: `clawback_failed: ${e.message}` });
        }
      }

      if (unsettledDebt > 0) {
        console.warn(
          `[settle-referrals] ${group.code} still owes ${unsettledDebt} x $${REFERRAL_PAYOUT_CENTS / 100} ` +
          `after netting — carried to the next run.`
        );
      }

      for (const order of transfer) {
        try {
          /**
           * 1. CLAIM — and this is now an actual claim.
           *
           * It used to be .upsert(..., { onConflict: 'order_id' }), described in the
           * comment here and in three other places as failing when a concurrent run
           * got there first. ON CONFLICT DO UPDATE does not fail. It overwrites. Two
           * overlapping runs both "claimed" the same order and both proceeded, and
           * the only thing that actually stopped a second $20 was the 24-hour Stripe
           * idempotency key — which is a backstop with an expiry, not a guard.
           *
           * The UNIQUE index on order_id (scripts/sql/referral_payouts.sql) is the
           * one guard that cannot race. Using it means splitting the two cases:
           *
           *   no prior row  — INSERT. A duplicate-key error (23505) means another run
           *                   claimed it in the gap. Skip; it is theirs.
           *   prior attempt — a pending or failed row from an earlier run, which must
           *                   stay retryable. Claim it with an UPDATE scoped to those
           *                   two statuses and ask for the affected rows back. Zero
           *                   rows means someone else finished it, or it is already
           *                   paid or clawed_back. Skip.
           *
           * Both branches leave the same outcome as before for the normal path, and
           * make the racing path deterministic instead of dependent on Stripe.
           */
          if (priorAttempt.has(order.id)) {
            const { data: reclaimed, error: reclaimError } = await supabase
              .from('referral_payouts')
              .update({
                ref_code: group.code,
                partner_email: group.partner.email || null,
                amount_cents: REFERRAL_PAYOUT_CENTS,
                status: 'pending',
                stripe_account_id: destination,
                payout_month: period.month,
                failure_reason: null,
              })
              .eq('order_id', order.id)
              .in('status', ['pending', 'failed'])
              .select('order_id');

            if (reclaimError) {
              failed.push({ orderId: order.id, code: group.code, reason: `claim_failed: ${reclaimError.message}` });
              continue;
            }
            if (!reclaimed || reclaimed.length === 0) {
              console.log(`[settle-referrals] order=${order.id} not claimable — already settled or claimed by a concurrent run`);
              continue;
            }
          } else {
            const { error: claimError } = await supabase
              .from('referral_payouts')
              .insert({
                order_id: order.id,
                ref_code: group.code,
                partner_email: group.partner.email || null,
                amount_cents: REFERRAL_PAYOUT_CENTS,
                status: 'pending',
                stripe_account_id: destination,
                payout_month: period.month,
                failure_reason: null,
              });

            if (claimError) {
              // 23505 is the UNIQUE index doing its job. That error IS the guard
              // working — see the header of scripts/sql/referral_payouts.sql.
              if (claimError.code === '23505') {
                console.log(`[settle-referrals] order=${order.id} claimed by a concurrent run — skipping`);
                continue;
              }
              failed.push({ orderId: order.id, code: group.code, reason: `claim_failed: ${claimError.message}` });
              continue;
            }
          }

          // 2. TRANSFER. Adopt an existing one if a previous run already created it.
          let transfer = priorAttempt.has(order.id)
            ? await existingTransferFor(stripe, order.id)
            : null;

          if (!transfer) {
            transfer = await stripe.transfers.create(
              {
                amount: REFERRAL_PAYOUT_CENTS,
                currency: 'usd',
                destination,
                transfer_group: transferTag(order.id),
                description: `Referral payout — order ${order.id} (${group.code})`,
                metadata: {
                  order_id: String(order.id),
                  ref_code: group.code,
                  payout_month: period.month,
                },
              },
              { idempotencyKey: transferTag(order.id) }
            );
          }

          // 3. CONFIRM.
          const { error: markError } = await supabase
            .from('referral_payouts')
            .update({
              status: 'paid',
              stripe_transfer_id: transfer.id,
              paid_at: new Date().toISOString(),
              failure_reason: null,
            })
            .eq('order_id', order.id);

          if (markError) {
            // The money HAS moved. Say so loudly — this row will be retried next
            // month and guard 3 is the only thing standing between that retry and a
            // second $20. It will hold, but a human should see this.
            console.error(
              `[settle-referrals] TRANSFER SENT BUT LEDGER NOT UPDATED. order=${order.id} ` +
              `transfer=${transfer.id} error=${markError.message}`
            );
            failed.push({ orderId: order.id, code: group.code, transferId: transfer.id, reason: `paid_but_unrecorded: ${markError.message}` });
            continue;
          }

          paid.push({ orderId: order.id, code: group.code, transferId: transfer.id, amountCents: REFERRAL_PAYOUT_CENTS });
        } catch (e) {
          const reason = e?.raw?.code || e?.code || e?.message || 'unknown_error';
          console.error(`[settle-referrals] order=${order.id} code=${group.code} failed: ${reason}`);

          // Checked too, though this one is already the failure path. Leaving the row
          // 'pending' instead of 'failed' is not dangerous — both are retryable and
          // the next run reclaims either — but a write that never lands means the
          // reason never reaches a human, and the row looks in-flight forever.
          const { error: markFailedError } = await supabase
            .from('referral_payouts')
            .update({ status: 'failed', failure_reason: String(reason).slice(0, 500) })
            .eq('order_id', order.id);
          if (markFailedError) {
            console.error(
              `[settle-referrals] could not even record the failure for order=${order.id}: ` +
              `${markFailedError.message} — the row stays 'pending' and will be retried`
            );
          }

          failed.push({ orderId: order.id, code: group.code, reason: String(reason) });
        }
      }
    }

    const totalPaidCents = paid.length * REFERRAL_PAYOUT_CENTS;
    const held = result.excluded.filter(e => e.reason === 'no_payout_account');
    const heldForRefundWindow = result.excluded.filter(e => e.reason === 'too_recent');

    console.log(
      `[settle-referrals] ${period.start}..${period.end} — ` +
      `paid ${paid.length} order(s) / $${(totalPaidCents / 100).toFixed(2)}, ` +
      `clawed back ${clawedBack.length}, failed ${failed.length}, ` +
      `held-for-refund-window ${heldForRefundWindow.length}, held-for-no-bank ${held.length}`
    );

    return res.status(200).json({
      period,
      holdbackDays: MIN_ORDER_AGE_DAYS,
      paidOrders: paid.length,
      totalPaid: `$${(totalPaidCents / 100).toFixed(2)}`,
      paid,
      failed,
      // Money recovered by withholding, not by reversing a transfer. Each entry names
      // the reversed order and the order withheld to discharge it.
      clawedBack,
      // Earned, but too new to pay without risking a refund landing after the money
      // has gone. These come round next run — they are not lost.
      heldForRefundWindow,
      // Not a failure and not a payment: these partners have earned money and have
      // not connected a bank account. They are the follow-up list.
      heldForNoPayoutAccount: held,
      excluded: result.excluded,
    });
  } catch (err) {
    console.error('[settle-referrals] run aborted:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
