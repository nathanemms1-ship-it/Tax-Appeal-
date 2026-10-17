// pages/api/cron/process-queued-orders.js
// Fires hourly. Retries any kit left `kit_queued` (Lob down at purchase time, a
// network blip) via lib/kit/dispatchKit.js. Kits are mailed to the CUSTOMER, never
// to a county, so no filing window applies here; the kit builder re-checks every
// rule at send time. The manual "Process Now" admin override is
// pages/api/process-order-now.js.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { requireCronSecret } from '../../../lib/webhookAuth';
import { salesEnabled } from '../../../lib/salesGate';
// Records that this job COMPLETED. Read back by checkCronHeartbeat — see
// lib/heartbeat.js for why a green 200 from this route is not evidence it ran.
import { stampHeartbeat } from '../../../lib/heartbeat';
// A dispatch failure here is a paid order that is not mailed. It has to reach a
// human on the day it happens, not on the day someone reads a Vercel log.
import { alertOps } from '../../../lib/alertOps';
import { dispatchQueuedKits, KIT_STATUS } from '../../../lib/kit/dispatchKit';

// Constructed lazily, INSIDE the handler, after the CRON_SECRET check.
//
// At module scope, createClient() throws "supabaseUrl is required" as soon as the env
// var is absent, and a module-scope throw returns 500 before the auth check runs. On
// THIS route that is the wrong order twice over: a misconfigured deployment reports
// "Internal Server Error" instead of naming the missing variable, and the one check
// standing between a caller and real Lob mailings is not the first thing to
// execute. Auth first, dependencies second.
let _supabase = null;
let _resend = null;
function clients() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return { supabase: _supabase, resend: _resend };
}

// Each kit is a PDF build plus a Lob call. dispatchQueuedKits caps a run at 8.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  // Security: only allow Vercel cron or internal calls.
  // The old inline check compared against `Bearer ${process.env.CRON_SECRET}`, which
  // becomes the literal string "Bearer undefined" when the env var is missing — so an
  // unset secret authenticated anyone who guessed that. See lib/webhookAuth.js.
  if (requireCronSecret(req, res)) return;

  // Sales paused: dispatch nothing. This route mails real kits through Lob, and it
  // is irreversible once Lob accepts the piece. If the service is not open for
  // business, an order that somehow reached the queue — a pre-pause purchase, a
  // replayed webhook, a manual row — must not be mailed on a schedule while nobody
  // is watching. Returns 200 so Vercel does not treat a deliberate pause as a
  // failing cron and start alerting on it daily.
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

  try {
    // dispatchKit never throws for a refused or failed kit: it sets kit_queued
    // (retry next run) or needs_review (a person looks) and pages ops itself.
    const kits = await dispatchQueuedKits({ supabase, resend, alertOps });
    if (kits.length) console.log(`[process-queued-orders] kits: ${JSON.stringify(kits)}`);

    const sent = kits.filter((k) => k.status === KIT_STATUS.MAILED || k.status === KIT_STATUS.EMAILED).length;
    const errored = kits.filter((k) => k.status === 'error' || k.status === KIT_STATUS.NEEDS_REVIEW).length;
    const requeued = kits.filter((k) => k.status === KIT_STATUS.QUEUED).length;

    // Deliberately NOT stamped in the catch below: a run that threw did not do its
    // job, and letting the heartbeat go stale is the correct signal. `filed` is the
    // key checkCronHeartbeat reads; for kits it counts kits sent to customers.
    await stampHeartbeat('process-queued-orders', { filed: sent, errored, requeued });

    return res.status(200).json({ success: true, sent, errored, requeued });
  } catch (err) {
    console.error('[process-queued-orders] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
