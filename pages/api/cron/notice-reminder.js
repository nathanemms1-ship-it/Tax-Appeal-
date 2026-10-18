/**
 * GET /api/cron/notice-reminder — daily, both pre-sale states (16 Oct 2026).
 * Georgia: customers whose notice has not been entered yet (below). Texas: the
 * roll pass further down.
 *
 * From the day their county's season opens (lib/filingWindows.js), once a week:
 * "Has your notice arrived? Enter it here" with their private link
 * (lib/kit/noticeLink.js). Ten days before the county's season closes with no
 * notice entered, ops are paged once: a person decides (call them, or refund),
 * because a reservation must never silently run out the clock.
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { requireCronSecret } from '../../../lib/webhookAuth';
import { getFilingWindowStatus } from '../../../lib/filingWindows';
import { alertOps } from '../../../lib/alertOps';
import { KIT_STATUS, KIT_ROW_COLUMNS } from '../../../lib/kit/dispatchKit';
import { noticeUrl, trimUrl } from '../../../lib/kit/noticeLink';
import { processFlPresale, flRollPlan, flTrimAskEmail } from '../../../lib/kit/flPresale';
import { flPresaleRunDeps, rollChecker } from '../../../lib/kit/flPresaleRun';
import { processTxPresale } from '../../../lib/kit/txPresale';
import { presaleDeps } from '../../../lib/kit/presaleDeps';
import { findComps } from '../../../lib/tx/comps';
import { buildProtest } from '../../../lib/tx/protest';
import { reminderDue, reminderEmail as kitReminderEmail, sentUrl, OUT_WITH_CUSTOMER } from '../../../lib/kit/afterMailing';
import { askDue, askEmail, outcomeUrl, ASKABLE } from '../../../lib/kit/outcome';
import { G as GUARANTEE, seasonEmail } from '../../../lib/kit/guarantee';
import { hearingDue, hearingEmail, hearingSheetPdf } from '../../../lib/kit/hearing';

export const REMIND_EVERY_DAYS = 7;
export const LATE_ALERT_DAYS = 10;
const DAY = 86400000;

let _supabase = null;
let _resend = null;
function clients() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  if (!_resend && process.env.RESEND_API_KEY) _resend = new Resend(process.env.RESEND_API_KEY);
  return { supabase: _supabase, resend: _resend };
}

export function reminderEmail(row, link) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const k = row.kit_order || {};
  return {
    subject: `Has your ${k.taxYear || ''} assessment notice arrived?`.replace('  ', ' '),
    text: [
      `Hi ${first},`,
      '',
      `${k.property?.county || 'Your'} County is mailing assessment notices now. When yours arrives for ${k.property?.address || 'your home'}, enter the value and the date printed on it here:`,
      '',
      link,
      '',
      'It takes a minute. We check your case again on the notice value: if an appeal still lowers your bill, we mail you your completed kit and email you a PDF copy of the full kit the same day. If it no longer does, we refund you in full.',
      '',
      'Your appeal must be postmarked within 45 days of the date on the notice, so the sooner the better.',
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}

/** What to do for one row today. Pure, for scripts/verify-ga-presale.mjs. */
export function reminderPlan(row, ws, now = new Date()) {
  const k = row.kit_order || {};
  if (row.dispute_status !== KIT_STATUS.AWAITING_NOTICE || row.payment_status !== 'paid' || k.presale !== true) return { remind: false, alert: false };
  if (!ws || !ws.isOpen) return { remind: false, alert: false };
  const last = k.noticeRemindedAt ? new Date(k.noticeRemindedAt).getTime() : 0;
  const remind = !last || now.getTime() - last >= REMIND_EVERY_DAYS * DAY;
  const alert = !k.noticeLateAlertAt && Number.isFinite(ws.daysUntilClose) && ws.daysUntilClose <= LATE_ALERT_DAYS;
  return { remind, alert };
}

/*
 * TEXAS RESERVATIONS (16 Oct 2026). No notice to enter: the trigger is THIS
 * year's roll for the district being loaded into tx_parcels. Then each
 * reservation is rebuilt on it (lib/kit/txPresale.js): kit mailed, or refunded.
 * If a district's roll is still missing from 20 April with reservations
 * waiting, ops are paged once per order: the 15 May deadline does not move.
 */
export const TX_ROLL_LATE = { month: 4, day: 20 };

/** What to do with one Texas reservation today. Pure, for scripts/verify-tx-presale.mjs. */
export function txRollPlan(row, rollLoaded, now = new Date()) {
  const k = row?.kit_order || {};
  if (row?.state_code !== 'TX' || k.presale !== true || row.payment_status !== 'paid' || row.dispute_status !== KIT_STATUS.AWAITING_NOTICE) return 'skip';
  if (rollLoaded) return 'process';
  const late = new Date(Date.UTC(Number(k.taxYear), TX_ROLL_LATE.month - 1, TX_ROLL_LATE.day));
  return now >= late && !k.rollLateAlertAt ? 'late_alert' : 'wait';
}

async function txRollPass(supabase, now) {
  const { data: rows, error } = await supabase.from('orders').select(`${KIT_ROW_COLUMNS}, stripe_session_id`)
    .eq('dispute_status', KIT_STATUS.AWAITING_NOTICE).eq('payment_status', 'paid').eq('state_code', 'TX').limit(500);
  if (error) return { error: error.message };
  const loaded = new Map();
  const rollLoaded = async (cad, year) => {
    const key = `${cad}:${year}`;
    if (!loaded.has(key)) {
      const { data } = await supabase.from('tx_parcels').select('account_number').eq('cad_id', cad).eq('tax_year', year).limit(1);
      loaded.set(key, Array.isArray(data) && data.length > 0);
    }
    return loaded.get(key);
  };
  let processed = 0; let lateAlerts = 0;
  for (const row of rows || []) {
    const k = row.kit_order || {};
    const plan = txRollPlan(row, k.presale ? await rollLoaded(k.cadId, k.taxYear) : false, now);
    if (plan === 'process') {
      try {
        await processTxPresale(row, {
          loadParcel: async (cad, account, year) => {
            const { data, error: e } = await supabase.from('tx_parcels').select('*').eq('cad_id', cad).eq('account_number', account).eq('tax_year', year).limit(1);
            if (e) throw new Error(e.message);
            return data?.[0] || null;
          },
          findComps: (parcel, year) => findComps(parcel, { rollYear: year, db: supabase }),
          buildProtest,
          ...presaleDeps(row, { supabase, alertOps }),
          now,
        });
        processed++;
      } catch (e) {
        await alertOps('TX pre-sale pass threw', `order=${row.id}\n${e?.message}`, { force: true });
      }
    } else if (plan === 'late_alert') {
      await alertOps('TX pre-sale: district roll not loaded yet', `order=${row.id} cad=${k.cadId} ${k.property?.county || ''} year=${k.taxYear}\nLoad this district's ${k.taxYear} roll, or refund.`, { force: true });
      await supabase.from('orders').update({ kit_order: { ...k, rollLateAlertAt: now.toISOString() } }).eq('id', row.id).eq('dispute_status', KIT_STATUS.AWAITING_NOTICE);
      lateAlerts++;
    }
  }
  return { checked: (rows || []).length, processed, lateAlerts };
}

/*
 * FLORIDA RESERVATIONS (18 Oct 2026, lib/kit/flPresale.js). Two things finish
 * one: this year's roll for the county (we load it; the case is rebuilt, or
 * refunded) and the petition deadline (our county table, or the customer at
 * /kit/trim). Once the case holds and TRIM notices are out we ask weekly for
 * the deadline; ops are paged once if the roll is not loaded by 1 August or no
 * deadline is in by 5 September.
 */
async function flRollPass(supabase, resend, now) {
  const { data: rows, error } = await supabase.from('orders').select(`${KIT_ROW_COLUMNS}, stripe_session_id`)
    .eq('dispute_status', KIT_STATUS.AWAITING_NOTICE).eq('payment_status', 'paid').eq('state_code', 'FL').limit(500);
  if (error) return { error: error.message };
  const rollLoaded = rollChecker(supabase);
  let processed = 0; let asked = 0; let lateAlerts = 0;
  for (const row of rows || []) {
    const k = row.kit_order || {};
    if (k.presale !== true) continue;
    let loaded = false;
    try { loaded = k.rollResult?.decision === 'case' ? true : await rollLoaded(k.property?.coNo, k.taxYear); } catch (e) { continue; }
    let plan = flRollPlan(row, loaded, now);
    let current = row;
    if (plan.process) {
      try {
        const r = await processFlPresale(row, { ...flPresaleRunDeps(row, { supabase, alertOps, rollLoaded }), now });
        processed++;
        // Confirmed today but still no deadline: re-plan on the saved row, so the ask can go today.
        if (r.status !== KIT_STATUS.AWAITING_NOTICE) continue;
        const { data: fresh } = await supabase.from('orders').select(`${KIT_ROW_COLUMNS}, stripe_session_id`).eq('id', row.id).maybeSingle();
        if (!fresh) continue;
        current = fresh;
        plan = flRollPlan(fresh, true, now);
      } catch (e) {
        await alertOps('FL pre-sale pass threw', `order=${row.id}\n${e?.message}`, { force: true });
        continue;
      }
    }
    if (!plan.ask && !plan.alert) continue;
    const kk = { ...(current.kit_order || {}) };
    if (plan.ask && resend && current.customer_email) {
      const link = trimUrl(current.id);
      if (link) {
        try {
          const mail = flTrimAskEmail(current, link);
          await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [current.customer_email], subject: mail.subject, text: mail.text });
          kk.trimAskedAt = now.toISOString();
          kk.trimAsks = (Number(kk.trimAsks) || 0) + 1;
          asked++;
        } catch (e) { console.error(`[notice-reminder] FL ask failed for order ${current.id}:`, e?.message); }
      }
    }
    if (plan.alert === 'roll') {
      await alertOps('FL pre-sale: county roll not loaded yet', `order=${current.id} co_no=${kk.property?.coNo} ${kk.property?.county || ''} year=${kk.taxYear}\nLoad this county's ${kk.taxYear} DOR roll, or refund.`, { force: true });
      kk.rollLateAlertAt = now.toISOString();
      lateAlerts++;
    } else if (plan.alert === 'deadline') {
      await alertOps('FL pre-sale: no petition deadline entered yet', `order=${current.id} ${kk.property?.county || ''} year=${kk.taxYear}\nCall the customer for the date on their TRIM notice, or add the county to FL_COUNTY_DATES.`, { force: true });
      kk.trimLateAlertAt = now.toISOString();
      lateAlerts++;
    }
    await supabase.from('orders').update({ kit_order: kk }).eq('id', current.id).eq('dispute_status', KIT_STATUS.AWAITING_NOTICE);
  }
  return { checked: (rows || []).length, processed, asked, lateAlerts };
}

/*
 * KITS OUT WITH THE CUSTOMER (17 Oct 2026, lib/kit/afterMailing.js). At most
 * three reminders per kit (arrived, about a week out, the last safe days),
 * never after the deadline, none once they tell us it is sent. Each is
 * recorded in kit_order.after.reminders before the next run can repeat it.
 */
async function afterMailingPass(supabase, resend, now) {
  const { data: rows, error } = await supabase.from('orders').select('id, state_code, customer_name, customer_email, dispute_status, payment_status, kit_order')
    .in('dispute_status', OUT_WITH_CUSTOMER).eq('payment_status', 'paid').limit(500);
  if (error) return { error: error.message };
  let sent = 0;
  for (const row of rows || []) {
    const stage = reminderDue(row, now);
    if (!stage || !resend || !row.customer_email) continue;
    const k = row.kit_order || {};
    try {
      const mail = kitReminderEmail(row, stage, sentUrl(row.id), now);
      await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [row.customer_email], subject: mail.subject, text: mail.text });
    } catch (e) { console.error(`[after-mailing] email failed for order ${row.id}:`, e?.message); continue; }
    const after = { ...(k.after || {}), reminders: { ...(k.after?.reminders || {}), [stage]: now.toISOString() } };
    // Conditional on the status: a kit marked sent meanwhile is never written back.
    await supabase.from('orders').update({ kit_order: { ...k, after } }).eq('id', row.id).eq('dispute_status', row.dispute_status);
    sent++;
  }
  return { checked: (rows || []).length, sent };
}

/*
 * "WHAT DID THE COUNTY DECIDE?" (17 Oct 2026, lib/kit/outcome.js). Weeks after
 * the deadline, then monthly while they are still waiting, at most four times.
 * Without the answer we cannot keep the free-next-year guarantee.
 */
async function outcomePass(supabase, resend, now) {
  const { data: rows, error } = await supabase.from('orders').select('id, state_code, customer_name, customer_email, dispute_status, payment_status, kit_order')
    .in('dispute_status', ASKABLE).eq('payment_status', 'paid').limit(500);
  if (error) return { error: error.message };
  let asked = 0;
  for (const row of rows || []) {
    if (!askDue(row, now) || !resend || !row.customer_email) continue;
    const link = outcomeUrl(row.id);
    if (!link) continue;
    const k = row.kit_order || {};
    try {
      const mail = askEmail(row, link);
      await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [row.customer_email], subject: mail.subject, text: mail.text });
    } catch (e) { console.error(`[outcome-ask] email failed for order ${row.id}:`, e?.message); continue; }
    const after = { ...(k.after || {}), outcomeAsks: [...(k.after?.outcomeAsks || []), now.toISOString()] };
    await supabase.from('orders').update({ kit_order: { ...k, after } }).eq('id', row.id).eq('dispute_status', row.dispute_status);
    asked++;
  }
  return { checked: (rows || []).length, asked };
}

/*
 * THE HEARING HELP PACK (17 Oct 2026, lib/kit/hearing.js): a reminder with the
 * sheet two days before, and "how did it go?" (the outcome link) the day after.
 */
async function hearingPass(supabase, resend, now) {
  const { data: rows, error } = await supabase.from('orders').select('id, state_code, customer_name, customer_email, dispute_status, payment_status, kit_order')
    .not('kit_order->after->hearing->>date', 'is', null).eq('payment_status', 'paid').limit(500);
  if (error) return { error: error.message };
  let sent = 0;
  for (const row of rows || []) {
    const stage = hearingDue(row, now);
    if (!stage || !resend || !row.customer_email) continue;
    const k = row.kit_order;
    try {
      const mail = hearingEmail(row, stage, outcomeUrl(row.id));
      const attachments = stage === 'reminder' ? [{ filename: 'Your-hearing.pdf', content: Buffer.from(await hearingSheetPdf(row)) }] : undefined;
      await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [row.customer_email], subject: mail.subject, text: mail.text, ...(attachments ? { attachments } : {}) });
    } catch (e) { console.error(`[hearing] email failed for order ${row.id}:`, e?.message); continue; }
    const hearing = { ...k.after.hearing, [stage === 'reminder' ? 'remindedAt' : 'followedAt']: now.toISOString() };
    await supabase.from('orders').update({ kit_order: { ...k, after: { ...k.after, hearing } } }).eq('id', row.id).eq('dispute_status', row.dispute_status);
    sent++;
  }
  return { checked: (rows || []).length, sent };
}

/** Pure: should this proved free kit get its "ready to use" email today? */
export function seasonEmailDue(row, ws, now = new Date()) {
  const g = row?.kit_order?.after?.guarantee;
  if (!g || g.status !== GUARANTEE.VERIFIED || g.seasonEmailedAt || !g.code) return false;
  if (Number(g.freeKitYear) !== now.getUTCFullYear()) return false;
  return Boolean(ws && (ws.canFile || ws.isOpen));
}

/*
 * "YOUR FREE KIT IS READY" (17 Oct 2026, lib/kit/guarantee.js). Once, when the
 * free year's season opens for that county.
 */
async function freeKitSeasonPass(supabase, resend, now) {
  const { data: rows, error } = await supabase.from('orders').select('id, state_code, county, customer_name, customer_email, kit_order')
    .eq('kit_order->after->guarantee->>status', GUARANTEE.VERIFIED).limit(500);
  if (error) return { error: error.message };
  let sent = 0;
  for (const row of rows || []) {
    const ws = getFilingWindowStatus(String(row.state_code || '').toUpperCase(), row.kit_order?.property?.county || row.county, { strict: true });
    if (!seasonEmailDue(row, ws, now) || !resend || !row.customer_email) continue;
    const k = row.kit_order;
    try {
      const mail = seasonEmail(row);
      await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [row.customer_email], subject: mail.subject, text: mail.text });
    } catch (e) { console.error(`[free-kit-season] email failed for order ${row.id}:`, e?.message); continue; }
    const after = { ...k.after, guarantee: { ...k.after.guarantee, seasonEmailedAt: now.toISOString() } };
    await supabase.from('orders').update({ kit_order: { ...k, after } }).eq('id', row.id).eq('kit_order->after->guarantee->>status', GUARANTEE.VERIFIED);
    sent++;
  }
  return { checked: (rows || []).length, sent };
}

export default async function handler(req, res) {
  if (requireCronSecret(req, res)) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'Not configured.' });
  const { supabase, resend } = clients();
  const now = new Date();

  const { data: rows, error } = await supabase.from('orders').select(KIT_ROW_COLUMNS)
    .eq('dispute_status', KIT_STATUS.AWAITING_NOTICE).eq('payment_status', 'paid').eq('state_code', 'GA').limit(500);
  if (error) return res.status(500).json({ error: error.message });

  let reminded = 0; let alerted = 0;
  for (const row of rows || []) {
    const ws = getFilingWindowStatus('GA', row.kit_order?.property?.county || row.county, { strict: true });
    const plan = reminderPlan(row, ws, now);
    if (!plan.remind && !plan.alert) continue;
    const k = { ...(row.kit_order || {}) };
    if (plan.remind && resend && row.customer_email) {
      const link = noticeUrl(row.id);
      if (link) {
        try {
          const mail = reminderEmail(row, link);
          await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [row.customer_email], subject: mail.subject, text: mail.text });
          k.noticeRemindedAt = now.toISOString();
          reminded++;
        } catch (e) { console.error(`[notice-reminder] email failed for order ${row.id}:`, e?.message); }
      }
    }
    if (plan.alert) {
      await alertOps('Pre-sale notice not entered, county closing soon', `order=${row.id} county=${k.property?.county} closes in ${ws.daysUntilClose} days\nCall the customer, or refund.`, { force: true });
      k.noticeLateAlertAt = now.toISOString();
      alerted++;
    }
    // Conditional on the status still being awaiting_notice: the notice step
    // claims the row (notice_checking) before it rewrites kit_order, so this
    // can never write a pre-sale order back over a finished one.
    await supabase.from('orders').update({ kit_order: k }).eq('id', row.id).eq('dispute_status', KIT_STATUS.AWAITING_NOTICE);
  }
  const tx = await txRollPass(supabase, now);
  const fl = await flRollPass(supabase, resend, now);
  const afterMailing = await afterMailingPass(supabase, resend, now);
  const outcomes = await outcomePass(supabase, resend, now);
  const freeKits = await freeKitSeasonPass(supabase, resend, now);
  const hearings = await hearingPass(supabase, resend, now);
  return res.status(200).json({ checked: (rows || []).length, reminded, alerted, tx, fl, afterMailing, outcomes, freeKits, hearings });
}
