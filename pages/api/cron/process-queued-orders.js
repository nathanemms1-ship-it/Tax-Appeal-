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
    const { data: queuedOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('dispute_status', 'queued')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!queuedOrders?.length) {
      return res.status(200).json({ message: 'No queued orders', filed: 0 });
    }

    console.log(`[process-queued-orders] Found ${queuedOrders.length} queued orders`);

    for (const order of queuedOrders) {
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
        console.error(`[process-queued-orders] Order ${order.id} failed:`, result.error);
        totalErrored++;
        continue;
      }

      totalFiled++;
      console.log(`[process-queued-orders] Filed order ${order.id} — tracking ${result.trackingNumber || 'n/a'}`);
    }

    console.log(`[process-queued-orders] Done. Filed: ${totalFiled}, Skipped (window not open): ${totalSkippedWindowClosed}, Errored: ${totalErrored}`);

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
