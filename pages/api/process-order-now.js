// pages/api/process-order-now.js
// Manual admin override — dispatches a single kit order immediately via
// lib/kit/dispatchKit.js (the same builder the Stripe webhook and the hourly cron
// use). Safety net for when the cron fails to fire (Vercel outage, bad deploy,
// missing env var, etc.) and the way back for an order an operator has reviewed.
// Called from the "Process Now" button in the kit dispatch panel on /admin.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { dispatchKit, isKitState, KIT_ROW_COLUMNS, KIT_STATUS } from '../../lib/kit/dispatchKit';
import { alertOps } from '../../lib/alertOps';
import { requireAdmin } from '../../lib/adminAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  /**
   * This route was the only admin endpoint still authenticating inline, and it is
   * the one that spends money: every success sends a real Lob mailing. The line it
   * replaced was:
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
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

  try {
    // Explicit columns, the same ones the cron reads: orders also holds
    // password_hash, which nothing here needs.
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select(KIT_ROW_COLUMNS)
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!isKitState(order.state_code)) {
      return res.status(400).json({ error: `Order ${orderId} is not a kit order (state ${order.state_code || 'unknown'}); there is nothing to dispatch.` });
    }

    /**
     * `needs_review` is dispatchable from here on purpose: dispatchKit writes it
     * when a rule refused the kit or Lob refused the piece, and the hourly cron
     * selects only `kit_queued`. Once an operator has fixed the cause, this button
     * is the way back. Anything else — kit_mailed, kit_emailed, awaiting_notice —
     * stays refused; dispatchKit also refuses a row that already has a Lob letter.
     */
    const DISPATCHABLE = [KIT_STATUS.QUEUED, KIT_STATUS.NEEDS_REVIEW];
    if (!DISPATCHABLE.includes(order.dispute_status)) {
      return res.status(400).json({ error: `Order is not dispatchable (current status: ${order.dispute_status})` });
    }

    // dispatchKit refuses an unpaid row, but say why: a refunded order must never
    // be mailed with one click.
    const REVERSED = ['refunded', 'partially_refunded', 'disputed'];
    if (REVERSED.includes(order.payment_status)) {
      return res.status(400).json({
        error: `Payment was reversed (payment_status: ${order.payment_status}). This kit must not be sent for money that has been returned.`,
      });
    }

    const result = await dispatchKit(order, { supabase, resend, alertOps });
    const ok = result.status === KIT_STATUS.MAILED || result.status === KIT_STATUS.EMAILED;
    if (!ok) {
      console.error(`[process-order-now] Order ${orderId} not sent:`, result.status, result.reason);
      return res.status(500).json({ error: `Kit not sent (status ${result.status}${result.reason ? `, ${result.reason}` : ''})`, ...result });
    }

    console.log(`[process-order-now] Manually dispatched kit ${orderId} — ${result.status} ${result.letterId || ''}`);
    return res.status(200).json({ success: true, ...result });

  } catch (err) {
    console.error('[process-order-now] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
