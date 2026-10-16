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
import { KitError } from './assembleKit';
import { mailKit, lobRecipient, LobKitError } from './lobKit';
import { getAppealAddress } from '../appealAddresses';

export const KIT_STATUS = Object.freeze({
  QUEUED: 'kit_queued',           // paid, kit data present, not yet mailed
  AWAITING_NOTICE: 'awaiting_notice', // paid (pre-sale), no notice value yet: nothing to build
  MAILED: 'kit_mailed',           // Lob accepted the letter
  NEEDS_REVIEW: 'needs_review',   // a rule refused the kit, or Lob failed: a human looks
});

// States whose orders are fulfilled as kits. Georgia and Texas (15 Oct 2026);
// Florida joins when its kit builder exists and keeps its current path until then.
export const KIT_BUILDERS = Object.freeze({ GA: buildGaKit, TX: buildTxKit });
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
        subject: `Your ${order.state === 'TX' ? 'protest' : 'appeal'} kit is on its way (PDF copy attached)`,
        text: kitEmailText(order, kit, letter),
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
  return `${order.state === 'TX' ? 'Protest' : 'Appeal'}-kit-${order.taxYear}-${parcel}.pdf`;
}

function kitEmailText(order, kit, letter) {
  const deadline = kit.deadline ? kit.deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
  const isTX = order.state === 'TX';
  const word = isTX ? 'protest' : 'appeal';
  // Page numbers come from the kit's own layout, never retyped: the form block
  // is 1 page in Georgia and 2 in Texas, so the signature page and the record
  // page move with it.
  const L = kit.layout || {};
  const formPages = (L.blockPages && L.blockPages[0]) || [];
  const signPage = formPages[formPages.length - 1];
  const where = isTX ? 'the appraisal district' : 'the county';
  return [
    `Hi ${String(order.owner.name || '').split(' ')[0] || 'there'},`,
    '',
    `Your completed ${word} kit for ${order.property?.address} is printed and on its way by first-class mail${letter.expectedDeliveryDate ? `, expected around ${letter.expectedDeliveryDate}` : ''}.`,
    '',
    'The same kit is attached as a PDF, so you can start now:',
    isTX
      ? `  1. Sign and date Section 8 of Form 50-132${signPage ? ` (page ${signPage})` : ''} in ink.`
      : `  1. Sign and date the appeal form${signPage ? ` (page ${signPage})` : ''} in ink.`,
    `  2. Put the signed form and the evidence in the envelope from the mailed kit (or any envelope addressed to ${where} as shown${L.perforatedPage ? ` on page ${L.perforatedPage}` : ''}).`,
    '  3. Add postage and mail it.',
    deadline
      ? (isTX ? `It must be postmarked no later than ${deadline}, or 30 days after your notice was delivered if that is later.` : `It must be postmarked no later than ${deadline}.`)
      : 'It must be postmarked within 45 days of the date on your assessment notice.',
    '',
    `If ${where} takes ${word}s online, you can use the attached PDF for that instead.`,
    '',
    `TaxAppeal USA prepares ${word} documents. We do not file your ${word} or represent you; you sign and mail it.`,
    '',
    'Questions: customerservice@taxappealusa.com',
  ].join('\n');
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
