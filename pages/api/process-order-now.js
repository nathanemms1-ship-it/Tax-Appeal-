// pages/api/process-order-now.js
// Manual admin override — dispatches a single queued order immediately, bypassing the
// filing-window check the cron applies. Safety net for when the daily cron fails to
// fire (Vercel outage, bad deploy, missing env var, etc.). Called from the "Process Now"
// button in the Queued Pre-Orders panel on /admin.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { dispatchQueuedOrder } from '../../lib/processOrder';
import { requireAdmin } from '../../lib/adminAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  /**
   * This route was the only admin endpoint still authenticating inline, and it is
   * the one that spends money: every success mails a certified petition and cuts a
   * real county filing-fee cheque, and it deliberately bypasses the filing-window
   * check the cron applies. The line it replaces was:
   *
   *   if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD)
   *
   * Three defects in one comparison. No rate limit, so a single shared password
   * could be guessed as fast as requests could be sent — `get-orders` is capped at
   * 10/min, `admin-health` at 12/min, and this one, alone, was uncapped. `!==` is
   * not constant time, so it returns fractionally sooner on an early wrong
   * character and leaks the password one character at a time under measurement.
   * And a missing ADMIN_PASSWORD answered 401 "Unauthorized" — indistinguishable
   * from a wrong password, so a deployment with the variable absent looked like an
   * operator typo instead of a broken configuration.
   *
   * requireAdmin fixes all three and additionally refuses a password in the query
   * string, which would otherwise be written in plaintext to Vercel's request logs.
   *
   * What this does NOT fix: an authenticated endpoint necessarily behaves
   * differently once auth passes, so a correct password is still distinguishable
   * from a wrong one by the response. That is inherent, not a bug here. The rate
   * limit is what makes it unusable — 10 tries a minute against a shared password,
   * rather than as many as the attacker's connection allows.
   *
   * The admin UI (pages/admin.js:543) POSTs { password, orderId } as JSON, which
   * requireAdmin reads via presented(req). No client change is needed.
   */
  if (await requireAdmin(req, res, 'process-order-now')) return;

  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    /**
     * `needs_review` is dispatchable from here — widened 11 Aug 2026.
     *
     * Several paths write `needs_review` when a mail attempt fails (see attemptMail
     * in lib/fulfillOrder.js). Every one of them produced an order that the dispatch
     * cron no longer selects — it queries `dispute_status = 'queued'` — and that this
     * endpoint then refused, and that /admin did not even render. A paid order could
     * reach a state with NO route back into the system short of hand-editing the row
     * in Supabase, at the one time of year when nobody has an evening spare.
     *
     * Reviewing an order and re-dispatching it is exactly what an operator is for.
     * The guards that actually matter are below and unchanged: the reversal check,
     * and dispatchQueuedOrder's own signature and county gates. Anything not in this
     * list — `filed`, `mailed` — stays refused, because re-mailing a filed petition
     * cuts a second county check.
     */
    const DISPATCHABLE = ['queued', 'needs_review'];
    if (!DISPATCHABLE.includes(order.dispute_status)) {
      return res.status(400).json({ error: `Order is not dispatchable (current status: ${order.dispute_status})` });
    }

    // Same guard as the cron. This button bypasses the filing-window check, so
    // without it a refunded order could be mailed with one click — and the
    // person clicking would have no reason to suspect the payment came back.
    const REVERSED = ['refunded', 'partially_refunded', 'disputed'];
    if (REVERSED.includes(order.payment_status)) {
      return res.status(400).json({
        error: `Payment was reversed (payment_status: ${order.payment_status}). This order must not be mailed — a certified petition and a real county filing-fee check would go out for money that has been returned.`,
      });
    }

    const result = await dispatchQueuedOrder(order, { supabase, resend });

    if (!result.success) {
      console.error(`[process-order-now] Order ${orderId} failed:`, result.error);
      return res.status(500).json({ error: result.error, critical: result.critical || false });
    }

    console.log(`[process-order-now] Manually filed order ${orderId} — tracking ${result.trackingNumber || 'n/a'}`);
    return res.status(200).json({ success: true, letterId: result.letterId, trackingNumber: result.trackingNumber });

  } catch (err) {
    console.error('[process-order-now] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
