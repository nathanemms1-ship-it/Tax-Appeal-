// pages/api/process-order-now.js
// Manual admin override — dispatches a single queued order immediately, bypassing the
// filing-window check the cron applies. Safety net for when the daily cron fails to
// fire (Vercel outage, bad deploy, missing env var, etc.). Called from the "Process Now"
// button in the Queued Pre-Orders panel on /admin.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { dispatchQueuedOrder } from '../../lib/processOrder';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password, orderId } = req.body;

  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
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
    if (order.dispute_status !== 'queued') {
      return res.status(400).json({ error: `Order is not queued (current status: ${order.dispute_status})` });
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
