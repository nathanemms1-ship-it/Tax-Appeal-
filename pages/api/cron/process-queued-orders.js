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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

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
  // Security: only allow Vercel cron or internal calls
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
