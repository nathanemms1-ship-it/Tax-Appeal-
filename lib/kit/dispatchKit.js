/**
 * lib/kit/dispatchKit.js — the ONE path that turns a paid kit order into mail.
 *
 *   order row (orders.kit_order holds everything the kit builder needs)
 *     -> build the kit (lib/kit/gaKit.js, lib/kit/txKit.js: every refusal rule applies)
 *     -> Lob letter to the CUSTOMER (lib/kit/lobKit.js, idempotent per order)
 *     -> orders row: kit_mailed + lob_letter_id + mailed_at
 *     -> email the customer the same kit as a PDF (best effort, never blocks)
 *
 * Called from the Stripe webhook right after the order row is written
 * (lib/fulfillOrder.js), from the hourly cron for anything left `kit_queued`,
 * and from the admin "send now" route. All three are safe to repeat:
 *   - a row that already has lob_letter_id is never mailed again;
 *   - Lob's Idempotency-Key (kit-<order id>) returns the first letter if two
 *     calls race past the row check.
 *
 * Nothing is sent to a county. The customer signs, adds postage and mails.
 *
 * Dependencies are injected so scripts/verify-kit-dispatch.mjs runs offline.
 */
import { buildGaKit } from './gaKit';
import { buildTxKit } from './txKit';
import { buildFlKit } from './flKit';
import { KitError } from './assembleKit';
import { mailKit, lobRecipient, LobKitError } from './lobKit';
import { getAppealAddress } from '../appealAddresses';
import { deliveryMode, DELIVERY } from './delivery';
import { afterRecord, sentUrl } from './afterMailing';

export const KIT_STATUS = Object.freeze({
  QUEUED: 'kit_queued',           // paid, kit data present, not yet mailed
  AWAITING_NOTICE: 'awaiting_notice', // paid (pre-sale), no notice value yet: nothing to build
  MAILED: 'kit_mailed',           // Lob accepted the letter
  EMAILED: 'kit_emailed',         // last days before the deadline: PDF emailed, nothing mailed
  NEEDS_REVIEW: 'needs_review',   // a rule refused the kit, or Lob failed: a human looks
});

// States whose orders are fulfilled as kits. Georgia and Texas (15 Oct 2026),
// Florida (16 Oct 2026: the DOR's own DR-486, lib/kit/flKit.js).
export const KIT_BUILDERS = Object.freeze({ GA: buildGaKit, TX: buildTxKit, FL: buildFlKit });

/** The words each state's kit emails use. Florida counts RECEIPT, not postmark, and adds the county fee. */
const KIT_WORDS = {
  GA: { doc: 'appeal', Doc: 'Appeal', where: 'the county', sign: (p) => `Sign and date the appeal form${p ? ` (page ${p})` : ''} in ink.` },
  TX: { doc: 'protest', Doc: 'Protest', where: 'the appraisal district', sign: (p) => `Sign and date Section 8 of Form 50-132${p ? ` (page ${p})` : ''} in ink.` },
  FL: { doc: 'petition', Doc: 'Petition', where: 'the Value Adjustment Board', sign: (p) => `Sign and date Part 3 of the DR-486${p ? ` (page ${p})` : ''} in ink.` },
};
const kitWords = (state) => KIT_WORDS[String(state || '').toUpperCase()] || KIT_WORDS.GA;
const feeLine = (kit) => (kit.fee ? `Put in a $${Math.round(kit.fee.cents / 100)} check or money order payable to "${kit.fee.payableTo}" for the county's filing fee (it is not part of our fee).` : null);
function deadlineLine(order, kit) {
  const d = kit.deadline ? kit.deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
  if (order.state === 'FL') return d ? `It must be RECEIVED by the Value Adjustment Board by ${d}. Florida does not count postmarks: mail it as soon as you have signed it, or hand-deliver it.` : 'It must be RECEIVED by the date on your TRIM notice. Florida does not count postmarks.';
  if (order.state === 'TX') return d ? `It must be postmarked no later than ${d}, or 30 days after your notice was delivered if that is later.` : null;
  return d ? `It must be postmarked no later than ${d}.` : 'It must be postmarked within 45 days of the date on your assessment notice.';
}
export const isKitState = (stateCode) => Boolean(KIT_BUILDERS[String(stateCode || '').toUpperCase()]);

const REVERSED = ['refunded', 'partially_refunded', 'disputed'];

/** Every orders column dispatchKit reads. */
export const KIT_ROW_COLUMNS = 'id, state_code, county, payment_status, dispute_status, customer_name, customer_email, owner_street, owner_city, owner_state, owner_zip, lob_letter_id, kit_order, created_at';

/** The kit builder's input, from the stored row. The county address is read from the table at send time, never stored. */
export function kitOrderFromRow(row, { addressLookup = getAppealAddress } = {}) {
  const k = row.kit_order;
  if (!k || typeof k !== 'object') return null;
  const state = String(row.state_code || k.state || '').toUpperCase();
  return {
    ...k,
    state,
    owner: {
      ...(k.owner || {}),
      name: row.customer_name || k.owner?.name,
      street: row.owner_street || k.owner?.street,
      city: row.owner_city || k.owner?.city,
      state: row.owner_state || k.owner?.state,
      zip: row.owner_zip || k.owner?.zip,
      email: row.customer_email || k.owner?.email,
    },
    countyAddress: addressLookup(state, k.property?.county || row.county),
  };
}

/**
 * @returns {Promise<{ status: string, letterId?: string, reason?: string, emailed?: boolean }>}
 */
export async function dispatchKit(row, { supabase, resend = null, alertOps = async () => {}, now = new Date(), lobFetch, lobApiKey, addressLookup, checkSpend } = {}) {
  const id = row?.id;
  const setStatus = (patch) => supabase.from('orders').update(patch).eq('id', id);

  if (row.lob_letter_id) return { status: KIT_STATUS.MAILED, letterId: row.lob_letter_id, already: true };
  if (row.payment_status !== 'paid' || REVERSED.includes(row.payment_status)) {
    return { status: row.dispute_status, reason: 'not_paid' };
  }
  const build = KIT_BUILDERS[String(row.state_code || '').toUpperCase()];
  if (!build) return { status: row.dispute_status, reason: 'not_a_kit_state' };

  const order = kitOrderFromRow(row, addressLookup ? { addressLookup } : {});
  if (!order || order.presale === true) {
    // A pre-sale order before the notice arrives. Not an error: it waits.
    if (row.dispute_status !== KIT_STATUS.AWAITING_NOTICE) await setStatus({ dispute_status: KIT_STATUS.AWAITING_NOTICE });
    return { status: KIT_STATUS.AWAITING_NOTICE, reason: 'no_kit_order' };
  }

  let kit;
  try {
    kit = await build(order, { proof: false, now });
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
    // A rule refused it (address not confirmed, county form unsettled, value
    // blank...). Never mail a weaker kit; a person decides.
    await setStatus({ dispute_status: KIT_STATUS.NEEDS_REVIEW });
    await alertOps('Kit refused at dispatch', `order=${id} code=${e.code}\n${e.message}`, { force: true });
    return { status: KIT_STATUS.NEEDS_REVIEW, reason: e.code };
  }

  /*
   * HOW IT REACHES THEM IN TIME (lib/kit/delivery.js), decided now, at send
   * time: a pre-sale finished late, or an order retried after a Lob outage,
   * must not be mailed to arrive after the deadline.
   */
  const mode = deliveryMode(kit.deadline, now, order.state);
  if (mode === DELIVERY.CLOSED) {
    await setStatus({ dispute_status: KIT_STATUS.NEEDS_REVIEW });
    await alertOps('Kit too close to its deadline to send', `order=${id} deadline=${kit.deadline?.toISOString?.().slice(0, 10)}\nCall the customer, or refund.`, { force: true });
    return { status: KIT_STATUS.NEEDS_REVIEW, reason: 'deadline_too_close' };
  }
  if (mode === DELIVERY.PDF) {
    if (!resend || !order.owner.email) {
      await alertOps('PDF-only kit could not be emailed', `order=${id} (no email client or address)`, { force: true });
      return { status: row.dispute_status, reason: 'no_email' };
    }
    try {
      await resend.emails.send({
        from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
        reply_to: 'customerservice@taxappealusa.com',
        to: [order.owner.email],
        subject: `Your ${kitWords(order.state).doc} kit (PDF): print, sign and mail it`,
        text: kitPdfOnlyText(order, kit, sentUrl(id)),
        attachments: [{ filename: kitFilename(order), content: Buffer.from(kit.pdf) }],
      });
    } catch (e) {
      // Stays kit_queued: the hourly cron retries the email.
      await alertOps('PDF-only kit email failed', `order=${id}\n${e?.message}`, { force: true });
      return { status: KIT_STATUS.QUEUED, reason: 'email_failed' };
    }
    // The reminders (lib/kit/afterMailing.js) time themselves off this record.
    const { error: upErr } = await setStatus({ dispute_status: KIT_STATUS.EMAILED, kit_order: { ...(row.kit_order || {}), after: afterRecord({ deadline: kit.deadline, mode: 'pdf', now }) } });
    if (upErr) await alertOps('Kit emailed but order row not updated', `order=${id}\n${upErr.message}`, { force: true });
    return { status: KIT_STATUS.EMAILED, emailed: true };
  }

  let letter;
  try {
    letter = await mailKit({
      pdf: kit.pdf,
      to: lobRecipient(order.owner),
      lob: kit.lob,
      idempotencyKey: `kit-${id}`,
      description: `Appeal kit ${order.state} ${order.property?.county || ''} order ${id}`,
      metadata: { order_id: id, kind: 'kit', state: order.state, county: String(order.property?.county || ''), form: kit.form?.id || '' },
      ...(lobApiKey ? { apiKey: lobApiKey } : {}),
      ...(lobFetch ? { fetchImpl: lobFetch } : {}),
      ...(checkSpend ? { checkSpend } : {}),
    });
  } catch (e) {
    // Transient trouble (network, timeout, Lob 5xx) stays queued for the hourly
    // cron; a refusal Lob will repeat (4xx: bad address, bad file) or one of our
    // own refusals goes to a human.
    const code = e instanceof LobKitError ? e.code : 'network';
    const status4xx = e?.detail?.error?.status_code >= 400 && e?.detail?.error?.status_code < 500;
    const retry = code === 'network' || code === 'mail_ceiling' || (code === 'lob_refused' && !status4xx);
    await setStatus({ dispute_status: retry ? KIT_STATUS.QUEUED : KIT_STATUS.NEEDS_REVIEW });
    await alertOps('Kit mailing failed', `order=${id} code=${code}\n${e?.message}`, { force: true });
    return { status: retry ? KIT_STATUS.QUEUED : KIT_STATUS.NEEDS_REVIEW, reason: code };
  }

  const { error: upErr } = await setStatus({
    dispute_status: KIT_STATUS.MAILED, lob_letter_id: letter.id, lob_status: 'created', mailed_at: now.toISOString(),
    kit_order: { ...(row.kit_order || {}), after: afterRecord({ deadline: kit.deadline, mode: 'mail', now, expectedDelivery: letter.expectedDeliveryDate || null }) },
  });
  if (upErr) {
    // Mailed, but the row does not know it. Idempotency-Key stops a second print;
    // a human must still fix the row.
    await alertOps('Kit mailed but order row not updated', `order=${id} letter=${letter.id}\n${upErr.message}`, { force: true });
  }

  let emailed = false;
  if (resend && order.owner.email) {
    try {
      await resend.emails.send({
        from: 'TaxAppeal USA <customerservice@taxappealusa.com>',
        reply_to: 'customerservice@taxappealusa.com',
        to: [order.owner.email],
        subject: `Your ${kitWords(order.state).doc} kit is on its way (PDF copy attached)`,
        text: kitEmailText(order, kit, letter, sentUrl(id)),
        attachments: [{ filename: kitFilename(order), content: Buffer.from(kit.pdf) }],
      });
      emailed = true;
    } catch (e) {
      console.error(`[dispatchKit] PDF email failed for order ${id}:`, e?.message);
    }
  }
  return { status: KIT_STATUS.MAILED, letterId: letter.id, emailed };
}

export function kitFilename(order) {
  const parcel = String(order.property?.parcelId || 'appeal').replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 40);
  return `${kitWords(order.state).Doc}-kit-${order.taxYear}-${parcel}.pdf`;
}

/** The PDF-only email: no envelope is coming, so it says where to send it. */
export function kitPdfOnlyText(order, kit, link = null) {
  const w = kitWords(order.state);
  const L = kit.layout || {};
  const formPages = (L.blockPages && L.blockPages[0]) || [];
  const signPage = formPages[formPages.length - 1];
  const sendPages = (L.countyBoundPages || []).join(', ');
  const fee = feeLine(kit);
  let n = 0;
  const step = (t) => `  ${++n}. ${t}`;
  return [
    `Hi ${String(order.owner.name || '').split(' ')[0] || 'there'},`,
    '',
    `Your deadline is close, so instead of mailing you a printed kit we have attached your completed ${w.doc} as a PDF. Nothing will come in the post.`,
    '',
    step('Print the attached PDF on plain paper.'),
    step(w.sign(signPage)),
    fee ? step(fee) : null,
    step(`Put ${fee ? 'the signed form, the evidence' : 'the signed form and the evidence'}${sendPages ? ` (pages ${sendPages})` : ''}${fee ? ' and the check' : ''} in any envelope addressed to:`),
    ...(kit.envelope || []).map((l) => `       ${l}`),
    order.state === 'FL'
      ? step('Hand-deliver it to that address, or mail it today with a stamp. If the deadline is only a few days away, hand delivery is the safe choice.')
      : step('Add a stamp and mail it. Better still, take it to a post office counter and ask for a postmark today.'),
    deadlineLine(order, kit) ? `${deadlineLine(order, kit)} Do not wait.` : null,
    '',
    `If ${w.where} takes ${w.doc}s online, you can use the PDF for that instead.`,
    '',
    `TaxAppeal USA prepares ${w.doc} documents. We do not file your ${w.doc} or represent you; you sign and send it.`,
    '',
    link ? 'When you have sent it, tell us here and we will stop the reminders:' : null,
    link ? `  ${link}` : null,
    link ? '' : null,
    'Questions: customerservice@taxappealusa.com',
  ].filter((l) => l !== null).join('\n');
}

function kitEmailText(order, kit, letter, link = null) {
  const w = kitWords(order.state);
  // Page numbers come from the kit's own layout, never retyped: the form block
  // is 1 page in Georgia and 2 in Texas and Florida, so the signature page and
  // the record page move with it.
  const L = kit.layout || {};
  const formPages = (L.blockPages && L.blockPages[0]) || [];
  const signPage = formPages[formPages.length - 1];
  const fee = feeLine(kit);
  let n = 0;
  const step = (t) => `  ${++n}. ${t}`;
  return [
    `Hi ${String(order.owner.name || '').split(' ')[0] || 'there'},`,
    '',
    `Your completed ${w.doc} kit for ${order.property?.address} is printed and on its way by first-class mail${letter.expectedDeliveryDate ? `, expected around ${letter.expectedDeliveryDate}` : ''}.`,
    '',
    'A PDF copy of the full kit is attached, so you can start now:',
    step(w.sign(signPage)),
    fee ? step(fee) : null,
    step(`Put ${fee ? 'the signed form, the evidence and the check' : 'the signed form and the evidence'} in the envelope from the mailed kit (or any envelope addressed to ${w.where} as shown${L.perforatedPage ? ` on page ${L.perforatedPage}` : ''}).`),
    step(order.state === 'FL' ? 'Add postage and mail it, or hand-deliver it.' : 'Add postage and mail it.'),
    deadlineLine(order, kit),
    '',
    `If ${w.where} takes ${w.doc}s online, you can use the attached PDF for that instead.`,
    '',
    `TaxAppeal USA prepares ${w.doc} documents. We do not file your ${w.doc} or represent you; you sign and send it.`,
    '',
    link ? 'When you have sent it, tell us here and we will stop the reminders:' : null,
    link ? `  ${link}` : null,
    link ? '' : null,
    'Questions: customerservice@taxappealusa.com',
  ].filter((l) => l !== null).join('\n');
}

/**
 * Hourly retry for kits left `kit_queued` (Lob down at purchase time, a network
 * blip). Called from pages/api/cron/process-queued-orders.js. Only paid rows;
 * a refunded or disputed order is never mailed. Capped per run.
 */
export async function dispatchQueuedKits({ supabase, resend = null, alertOps, now = new Date(), max = 8 } = {}) {
  // Explicit columns: orders also holds password_hash, which nothing here needs.
  const { data, error } = await supabase.from('orders').select(KIT_ROW_COLUMNS)
    .eq('dispute_status', KIT_STATUS.QUEUED).eq('payment_status', 'paid')
    .order('created_at', { ascending: true }).limit(max);
  if (error) throw error;
  const results = [];
  for (const row of data || []) {
    try { results.push({ id: row.id, ...(await dispatchKit(row, { supabase, resend, alertOps, now })) }); }
    catch (e) { results.push({ id: row.id, status: 'error', reason: e?.message }); }
  }
  return results;
}
