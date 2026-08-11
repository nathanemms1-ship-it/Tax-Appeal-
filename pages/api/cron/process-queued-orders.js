// pages/api/cron/process-queued-orders.js
// Fires daily. Finds pre-orders (dispute_status = 'queued') whose state/county filing
// window has now opened, dispatches them oldest-first via /api/send-letter, marks them
// filed, and sends the "your protest has been filed" follow-up email. No same-day
// completion required — a capped batch per run is fine; leftovers pick up next run.
// Per-order dispatch logic lives in lib/processOrder.js — shared with the manual
// "Process Now" admin override in pages/api/process-order-now.js.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getFilingWindowStatus } from '../../../lib/filingWindows';
import { dispatchQueuedOrder } from '../../../lib/processOrder';
import { requireCronSecret } from '../../../lib/webhookAuth';
import { salesEnabled } from '../../../lib/salesGate';
// Records that this job COMPLETED. Read back by checkCronHeartbeat — see
// lib/heartbeat.js for why a green 200 from this route is not evidence it ran.
import { stampHeartbeat } from '../../../lib/heartbeat';
// A dispatch failure here is a paid order that is not filed. It has to reach a human
// on the day it happens, not on the day someone reads a Vercel log.
import { alertOps } from '../../../lib/alertOps';

// Constructed lazily, INSIDE the handler, after the CRON_SECRET check.
//
// At module scope, createClient() throws "supabaseUrl is required" as soon as the env
// var is absent, and a module-scope throw returns 500 before the auth check runs. On
// THIS route that is the wrong order twice over: a misconfigured deployment reports
// "Internal Server Error" instead of naming the missing variable, and the one check
// standing between a caller and 8 real certified mailings is not the first thing to
// execute. Auth first, dependencies second.
let _supabase = null;
let _resend = null;
function clients() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return { supabase: _supabase, resend: _resend };
}

// Cap per run so we never risk a Vercel function timeout — remaining queued
// orders simply get picked up on the next day's run (Nathan: no same-day
// completion required).
// Vercel Pro caps a serverless function at 300s. Each order now costs a full
// property re-lookup (BatchData) plus a DR-486 regeneration (Sonnet) plus the Lob
// call — roughly 25-35s. Eight per run leaves headroom; the cron runs HOURLY, so
// real throughput is ~192/day rather than the old 20/day. That matters: at 355
// pre-orders the old daily cap would have taken 18 days to clear, inside a 25-day
// window that also requires physical receipt.
export const config = { maxDuration: 300 };

const MAX_PER_RUN = 8;

export default async function handler(req, res) {
  // Security: only allow Vercel cron or internal calls.
  // The old inline check compared against `Bearer ${process.env.CRON_SECRET}`, which
  // becomes the literal string "Bearer undefined" when the env var is missing — so an
  // unset secret authenticated anyone who guessed that. See lib/webhookAuth.js.
  if (requireCronSecret(req, res)) return;

  // Sales paused: dispatch nothing. This route mails REAL certified letters and
  // cuts REAL checks, and it is irreversible once Lob accepts the piece. If the
  // service is not open for business, an order that somehow reached the queue —
  // a pre-pause purchase, a replayed webhook, a manual row — must not be mailed
  // on a schedule while nobody is watching. Returns 200 so Vercel does not treat
  // a deliberate pause as a failing cron and start alerting on it daily.
  if (!salesEnabled()) {
    console.log('[cron] SALES_ENABLED is not true — dispatching nothing.');
    // Still a completed run. The pause itself is reported separately by
    // checkSalesGate; conflating "paused" with "not running" would hide one behind
    // the other, and it is the pause that is the emergency, not the quiet cron.
    await stampHeartbeat('process-queued-orders', { filed: 0, skipped: 'sales_paused' });
    return res.status(200).json({ ok: true, skipped: 'sales_paused' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[cron] Supabase env vars missing. Refusing.');
    return res.status(503).json({ error: 'Not configured.' });
  }
  const { supabase, resend } = clients();

  console.log(`[process-queued-orders] Running for ${new Date().toISOString()}`);

  let totalFiled = 0;
  let totalSkippedWindowClosed = 0;
  let totalErrored = 0;

  try {
    // A REFUNDED PRE-ORDER MUST NOT BE MAILED.
    //
    // This selected on dispute_status alone. Pre-orders are accepted up to 60
    // days before a county's window opens, so weeks can pass between payment and
    // mailing — and a refund inside that gap is an ordinary thing to happen.
    //
    // The Stripe webhook records a refund or chargeback by setting
    // payment_status ('refunded', 'partially_refunded', 'disputed') and leaves
    // dispute_status as 'queued', because the order really is still queued. So
    // when the window opened, this cron would have mailed a certified petition
    // AND cut a real county filing-fee check for someone whose money had already
    // been returned. Unrecoverable in both directions: the check is cashed by a
    // government office, and the customer has a filing they did not pay for.
    const REVERSED = ['refunded', 'partially_refunded', 'disputed'];
    const { data: allQueued, error } = await supabase
      .from('orders')
      .select('*')
      .eq('dispute_status', 'queued')
      .order('created_at', { ascending: true });

    const queuedOrders = (allQueued || []).filter((o) => {
      if (!REVERSED.includes(o.payment_status)) return true;
      console.log(`[process-queued-orders] order ${o.id} skipped — payment_status=${o.payment_status}`);
      return false;
    });

    if (error) throw error;
    if (!queuedOrders?.length) {
      await stampHeartbeat('process-queued-orders', { filed: 0 });
      return res.status(200).json({ message: 'No queued orders', filed: 0 });
    }

    console.log(`[process-queued-orders] Found ${queuedOrders.length} queued orders`);

    /**
     * A repeatedly-failing order must not sit at the head of the queue eating the run.
     *
     * The batch is ordered oldest-first and MAX_PER_RUN counts SUCCESSES only, so a
     * failure does not consume the cap — the loop simply walks on. That is the right
     * behaviour for one bad order and the wrong behaviour for twenty: each retry costs
     * a full preflight including a live /api/lookup round-trip, and with a 300-second
     * budget a wall of permanently-failing orders can burn the entire run before a
     * single healthy order is reached. Nobody notices, because the run still returns
     * 200 and stamps a heartbeat.
     *
     * Once an order has failed this many times the cause is not transient. It stays
     * queued, it stays visible in /admin with its error, ops has already been paged —
     * but it stops being retried ahead of orders that can actually file. RETRY_FLOOR
     * is deliberately low: at hourly cadence 12 attempts is half a day, which is long
     * enough for a Lob blip to clear and short enough not to waste a filing season.
     */
    const RETRY_FLOOR = 12;
    const deferred = queuedOrders.filter(o => (o.dispatch_attempts || 0) >= RETRY_FLOOR);
    const workable = queuedOrders.filter(o => (o.dispatch_attempts || 0) < RETRY_FLOOR);
    if (deferred.length) {
      // Never let a cap be silent. A run that quietly skips work reads exactly like a
      // run with nothing to do.
      console.warn(`[process-queued-orders] ${deferred.length} order(s) parked after ${RETRY_FLOOR}+ failed attempts and NOT retried this run: ${deferred.map(o => o.id).join(', ')}`);
    }

    for (const order of workable) {
      if (totalFiled >= MAX_PER_RUN) {
        console.log(`[process-queued-orders] Hit per-run cap of ${MAX_PER_RUN} — remaining orders will process next run`);
        break;
      }

      const stateCode = (order.state_code || '').toUpperCase().trim();
      if (!stateCode) {
        console.error(`[process-queued-orders] Order ${order.id} has no state_code — skipping (needs manual review)`);
        totalErrored++;
        continue;
      }

      const windowStatus = getFilingWindowStatus(stateCode, order.county);
      // Gate on canFile, not isOpen. canFile also honours the minDays receipt
      // buffer. Florida requires physical RECEIPT by the deadline, so dispatching
      // on Sept 17 produces a petition that arrives after Sept 18 — rejected as
      // untimely, customer loses the year, no refund path exists.
      if (!windowStatus || !windowStatus.canFile) {
        totalSkippedWindowClosed++;
        continue;
      }

      const result = await dispatchQueuedOrder(order, { supabase, resend });

      if (!result.success) {
        /**
         * ==============================================================
         * A DISPATCH FAILURE HAS TO LEAVE THE BUILDING. IT USED NOT TO.
         * ==============================================================
         * This was `console.error` and `continue`, with no alertOps call anywhere in
         * the file. Every way filing can fail passes through this one line — the
         * county gates in send-letter.js, a Lob outage, a wrong LOB_BANK_ACCOUNT_ID,
         * the daily Lob spend ceiling, and the assessed-value drift halt that is
         * GUARANTEED to start firing when TRIM notices land and replace the
         * pre-order's prior-year figure. All of them wrote a line to a Vercel log
         * nobody reads, left the order `queued`, and retried an hour later, forever.
         *
         * Nothing downstream covered it either. checkCronHeartbeat reads `filed` and
         * never `errored`, so a run that filed 0 and errored 200 stamped a healthy
         * heartbeat. checkFilingDeadlines is keyed on days-to-deadline, not on
         * failure, so an order failing hourly from 24 August still read `ok` until
         * 4 September — two days before the last date its petition could physically
         * arrive in time.
         *
         * So: persist the failure on the row so /admin can show it and this loop can
         * stop re-trying it at the head of the queue, and page a human. Persisting
         * first, because an alert we fail to send must not also lose the record.
         */
        const attempts = (order.dispatch_attempts || 0) + 1;
        const reason = String(result.error || 'unknown').slice(0, 500);
        await supabase
          .from('orders')
          .update({ dispatch_attempts: attempts, last_dispatch_error: reason })
          .eq('id', order.id);

        console.error(`[process-queued-orders] Order ${order.id} failed (attempt ${attempts}):`, reason);
        totalErrored++;

        /**
         * Alert on the FIRST failure and then back off hard.
         *
         * The first one is the one that matters — it is a working system becoming a
         * broken one. After that the same order failing sixty times in a row is the
         * same fact repeated, and an inbox with sixty copies of it is an inbox nobody
         * reads on the day the sixty-first thing is different. force:true because
         * alertOps otherwise de-duplicates by subject, and each order genuinely is a
         * separate customer who has paid.
         */
        if (attempts === 1 || attempts === 6 || attempts % 24 === 0) {
          await alertOps(
            `Order ${order.id} could not be filed (attempt ${attempts})`,
            [
              `Order:     ${order.id}`,
              `Customer:  ${order.customer_email || 'unknown'}`,
              `Property:  ${order.owner_street || 'unknown'}`,
              `County:    ${order.county || 'unknown'}, ${stateCode}`,
              `Deadline:  ${windowStatus.daysUntilHard} days away`,
              `Attempts:  ${attempts}`,
              ``,
              `Error: ${reason}`,
              ``,
              `This order is PAID and is not filed. It stays queued and retries hourly.`,
              `It will keep failing until the underlying cause is fixed — the retry is`,
              `not a fix. Florida is satisfied by physical RECEIPT, so the usable time`,
              `is ${windowStatus.daysUntilHard} days minus mail transit, not ${windowStatus.daysUntilHard} days.`,
            ].join('\n'),
            { force: true },
          );
        }
        continue;
      }

      /**
       * A success clears the failure record. Without this an order that failed once
       * on a transient Lob 500 and then filed cleanly keeps a `last_dispatch_error`
       * on the row forever, and /admin shows a scary string against a filed order.
       */
      if (order.dispatch_attempts) {
        await supabase
          .from('orders')
          .update({ last_dispatch_error: null })
          .eq('id', order.id);
      }

      totalFiled++;
      console.log(`[process-queued-orders] Filed order ${order.id} — tracking ${result.trackingNumber || 'n/a'}`);
    }

    console.log(`[process-queued-orders] Done. Filed: ${totalFiled}, Skipped (window not open): ${totalSkippedWindowClosed}, Errored: ${totalErrored}`);

    // Deliberately NOT stamped in the catch below: a run that threw did not do its
    // job, and letting the heartbeat go stale is the correct signal.
    await stampHeartbeat('process-queued-orders', {
      filed: totalFiled,
      skippedWindowClosed: totalSkippedWindowClosed,
      errored: totalErrored,
    });

    return res.status(200).json({
      success: true,
      filed: totalFiled,
      skippedWindowClosed: totalSkippedWindowClosed,
      errored: totalErrored,
    });

  } catch (err) {
    console.error('[process-queued-orders] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
