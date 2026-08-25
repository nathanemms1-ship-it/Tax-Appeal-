// pages/api/cron/signature-reminder.js
/**
 * ============================================================================
 * THE "PLEASE SIGN" EMAIL, SENT TEN MINUTES LATE AND ONLY IF IT IS TRUE.
 * ============================================================================
 * Until 25 Aug 2026 this email went out from lib/fulfillOrder.js at the moment
 * Stripe confirmed payment — in the same instant the customer was being
 * redirected to /success, which IS the signing page. So a person sitting on the
 * signing page received an email telling them to go to the signing page, worded
 * as though they had already failed to.
 *
 * The first paying customer hit the compound version of that on 25 Aug: she paid,
 * got "One Step Left — Your Signature", signed, and then had a stale email in her
 * inbox saying one step was left while her portal said the order needed
 * attention. She could not tell which was true and wrote in to ask.
 *
 * WHAT THIS DOES INSTEAD
 *
 * Every ten minutes, find orders that are still `awaiting_signature` at least ten
 * minutes after they were created, and email those people once.
 *
 * WHY A SWEEP RATHER THAN A DELAYED SEND
 *
 * Resend can schedule a message for later, and we could cancel it when the
 * customer signs. That requires storing the scheduled id, cancelling reliably,
 * and being right about a race between the cancel and the send. A sweep asks the
 * database what is true at the moment it runs, so a customer who signs during the
 * ten minutes is simply never selected. There is nothing to cancel and no race:
 * the signature IS the cancellation.
 *
 * IDEMPOTENCE
 *
 * `signature_reminder_sent_at` is stamped after a successful send and is part of
 * the selection filter, so a customer gets exactly one of these however many
 * times the cron runs. That column is the only thing this job writes.
 *
 * IF THE COLUMN IS MISSING the job logs it and returns 200 rather than throwing.
 * A deploy can land before the migration is run, and a hard failure here would
 * page an operator about an email nobody has missed yet — see the missing-column
 * branch below.
 */
import { createClient } from '@supabase/supabase-js';
import { requireCronSecret } from '../../../lib/webhookAuth';
import { stampHeartbeat } from '../../../lib/heartbeat';

let _supabase = null;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';

/**
 * Ten minutes. Long enough that anyone who is going to sign in the flow has, and
 * short enough that someone who closed the tab is reminded while they still
 * remember paying.
 */
const QUIET_MINUTES = 10;

/** Bounded so one run cannot fan out into a mail storm if a backlog ever forms. */
const MAX_PER_RUN = 25;

export default async function handler(req, res) {
  if (requireCronSecret(req, res)) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[signature-reminder] Supabase env vars missing. Refusing.');
    return res.status(503).json({ error: 'Not configured.' });
  }

  const supabase = db();
  const cutoff = new Date(Date.now() - QUIET_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_name, customer_email, property_address, county, state_code, amount_paid, vab_fee, stripe_session_id, created_at')
    .eq('dispute_status', 'awaiting_signature')
    .eq('payment_status', 'paid')
    .lt('created_at', cutoff)
    .is('signature_reminder_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    /**
     * PostgREST reports an unknown column as 42703. Treat that as "the migration
     * has not been run yet" and say so plainly, rather than failing the cron and
     * alerting a human about an email nobody is waiting for. Any other error is a
     * real one and is returned as such.
     */
    if (error.code === '42703' || /signature_reminder_sent_at/.test(error.message || '')) {
      console.warn(
        '[signature-reminder] orders.signature_reminder_sent_at does not exist — ' +
        'run scripts/migrations/2026-08-25-signature-reminder.sql in Supabase. ' +
        'Sending nothing until then.'
      );
      await stampHeartbeat('signature-reminder', { sent: 0, skipped: 'migration_pending' });
      return res.status(200).json({ ok: true, skipped: 'migration_pending' });
    }
    console.error('[signature-reminder] query failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  const pending = data || [];
  let sent = 0;
  const failures = [];

  for (const order of pending) {
    if (!order.customer_email) {
      console.warn(`[signature-reminder] order ${order.id} has no email — skipping`);
      continue;
    }
    if (!order.stripe_session_id) {
      // Without the session id there is no signing link, and a reminder with no
      // link is the exact failure this job exists to end. Leave it for a human;
      // checkStuckOrders reports it at 72h.
      console.warn(`[signature-reminder] order ${order.id} has no stripe_session_id — no signing link, skipping`);
      continue;
    }

    const name = String(order.customer_name || '').trim();
    try {
      const r = await fetch(`${BASE_URL}/api/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({
          to: order.customer_email,
          type: 'confirmation',
          firstName: name.split(' ')[0] || '',
          lastName: name.split(' ').slice(1).join(' ') || '',
          customerName: name,
          address: order.property_address || '',
          county: order.county || '',
          sessionId: order.stripe_session_id,
          amountPaid: order.amount_paid,
          stateCode: order.state_code || '',
          orderStatus: 'signature_reminder',
          vabFee: order.vab_fee ? Number(order.vab_fee) : null,
          signingUrl: `${BASE_URL}/success?session_id=${encodeURIComponent(order.stripe_session_id)}`,
        }),
      });
      if (!r.ok) throw new Error(`send-email HTTP ${r.status}`);

      /**
       * STAMP ONLY AFTER THE SEND SUCCEEDS. Stamping first would mean a transient
       * mail failure permanently suppresses the reminder for that customer — the
       * one outcome worse than sending it twice.
       */
      const { error: stampErr } = await supabase
        .from('orders')
        .update({ signature_reminder_sent_at: new Date().toISOString() })
        .eq('id', order.id);
      if (stampErr) {
        // Sent but not stamped: they may get a second one next run. Noisy, not
        // harmful, and far better than silence. Logged so it is explainable.
        console.error(`[signature-reminder] sent for ${order.id} but stamp failed: ${stampErr.message}`);
      }
      sent++;
    } catch (e) {
      console.error(`[signature-reminder] order ${order.id} failed: ${e.message}`);
      failures.push(order.id);
    }
  }

  await stampHeartbeat('signature-reminder', { sent, considered: pending.length, failures: failures.length });
  console.log(`[signature-reminder] considered ${pending.length}, sent ${sent}, failed ${failures.length}`);
  return res.status(200).json({ ok: true, considered: pending.length, sent, failures });
}
