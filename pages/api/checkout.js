import crypto from 'crypto';
import Stripe from 'stripe';
import { normalizeAttribution } from '../../lib/attribution';
import { getFlVabFee } from '../../lib/flCountyFees';
import { isFlCountySupported } from '../../lib/flVabAddresses';
import { enforceRateLimit } from '../../lib/rateLimit';
import { blockIfSalesPaused } from '../../lib/salesGate';
import { getFilingWindowStatus } from '../../lib/filingWindows';
import { getSupabaseAdmin } from './supabase';
import { normalizePerkCode, applyPerkToLineItems, RPC, PERK_AMOUNT_CENTS } from '../../lib/partnerPerk';
import { Redis } from '@upstash/redis';
import { gaSellability, gaPresaleSellability } from '../../lib/kit/gaQuote';
import { txSellability } from '../../lib/kit/txQuote';
import { txPresaleSellability } from '../../lib/kit/txPresale';
import { flPresaleSellability } from '../../lib/kit/flPresale';
import { flSellability } from '../../lib/kit/flQuote';
import { SERVICE_PRICE_CENTS } from '../../lib/pricing';
import { findFreeKit, claimFreeKit, releaseFreeKit } from '../../lib/kit/freeKit';
import { fulfillSession } from '../../lib/fulfillOrder';

let kitRedis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) kitRedis = new Redis({ url, token });
} catch (e) { console.log('Redis init failed:', e.message); }

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Global kill switch, checked BEFORE the rate limiter and before any Stripe
  // call. A paused service must not create a session, not take a card, and not
  // consume a rate-limit slot. See lib/salesGate.js — this fails closed.
  if (blockIfSalesPaused(res)) return;

  // Stripe session creation
  if (await enforceRateLimit(req, res, 'checkout', 10, 60)) return;

const {
email, firstName, lastName,
address, county, parcelId, assessedValue, targetReduction, savings,
// Georgia kit orders: the key of the server-held kit order written by
// /api/ga-kit-quote. Nothing printed on the kit comes from this request body.
kitKey,
// Which cautions the Texas review screen showed before this customer chose to
// go ahead. See the tx_cautions block below.
txCautions,
ownerStreet, ownerCity, ownerState, ownerZip,
  gclid, utm,
stateCode,
refCode,
perkCode,
// Next year's free kit (lib/kit/guarantee.js): optional; found by parcel without it.
freeCode,
} = req.body;

  // Trimmed and length-capped before it can reach Stripe. See lib/attribution.js.
  const attribution = normalizeAttribution({ gclid, utm });

/**
 * ==========================================================================
 * THE CUT-OFF /terms ALREADY PROMISES IS ENFORCED HERE
 * ==========================================================================
 * pages/terms.js §5 states, as a term of the agreement:
 *
 *   "That cut-off is earlier than the deadline itself and is enforced
 *    automatically at checkout: if it has passed for your county, we will
 *    not take your money."
 *
 * Until now no such check existed on this route. The funnel gates correctly,
 * but the funnel is a browser: a tab left open across the cut-off, a back
 * button, or a direct POST reached Stripe and took the card. The contract
 * described a control that was not there, which is worse than not promising
 * it — a customer who reads that paragraph has been told they cannot be
 * charged too late.
 *
 * Same call as the other six money gates. `county`, not bare stateCode:
 * Florida has no statewide deadline and Hillsborough closes eleven days
 * before Miami-Dade. `strict: true` so a missing county falls to the earliest
 * date we stand behind rather than the latest — this is the last gate before
 * a card is charged, so it must fail conservative.
 *
 * canFile OR canPreOrder, because both are legitimate sales. canFile is the
 * window minus the mail-time buffer; canPreOrder is the 60 days before it
 * opens (PRE_ORDER_DAYS). Refusing means the season is genuinely gone.
 *
 * A null status means the state is not in FILING_WINDOWS at all, which for a
 * SUPPORTED_STATES value cannot happen — so it is a malformed or hand-crafted
 * body, and refusing is the only safe answer on a route that charges a card.
 */
const windowStatus = getFilingWindowStatus((stateCode || '').trim().toUpperCase(), county, { strict: true });
if (!windowStatus || (!windowStatus.canFile && !windowStatus.canPreOrder)) {
  const sc = (stateCode || '').trim().toUpperCase();
  const where = county ? `${county} County` : (stateCode || 'that state');
  const isReceiptState = sc === 'FL';
  console.warn('[checkout] refusing — filing window closed:', { stateCode, county, canFile: windowStatus?.canFile, canPreOrder: windowStatus?.canPreOrder });
  return res.status(409).json({
    // State-aware. The first version of this said "Florida counts a petition as
    // filed only when it is physically received" to a TEXAS customer, because the
    // receipt rule was written into a message used by every state. Texas and
    // Arkansas are postmark states; telling their customers otherwise is both wrong
    // and the kind of detail a homeowner would act on.
    error: isReceiptState
      ? `We are no longer accepting orders for ${where} this season. Florida counts a petition as filed only when it is physically received, not postmarked, and there is no longer enough mail time — so we will not take your money for a filing we cannot deliver.`
      : `We are no longer accepting orders for ${where} this season. The filing window has closed, so we will not take your money for a protest that cannot be filed.`,
    code: 'FILING_WINDOW_CLOSED',
  });
}

/*
 * ONLY KIT STATES ARE SOLD. GA, TX and FL are sold as kits mailed to the
 * customer (lib/kit/dispatchKit.js). Every other state is waitlist only, so
 * nothing else may reach Stripe.
 */
if (!['GA', 'TX', 'FL'].includes((stateCode || '').trim().toUpperCase())) {
  return res.status(409).json({
    error: `We are not taking orders for ${stateCode || 'that state'} yet. Leave your email and we will write when we open there.`,
    code: 'STATE_NOT_OPEN',
  });
}

/**
 * ==========================================================================
 * AND THE COUNTY MUST BE ONE WE CAN ACTUALLY FILE IN
 * ==========================================================================
 * Found 15 Aug 2026 while verifying the filing-window gate above, by POSTing a
 * Florida order for a county that does not exist. It returned 200 and created a
 * Stripe session.
 *
 * getFlVabFee() does not fail on an unknown county — it returns a DEFAULT
 * {vabFee: 5000, confidence: 'estimated'}. So checkout happily priced $89 plus a
 * guessed $50 for "Notarealcounty", and would do the same for the six counties
 * with no verified VAB address (Dixie, Franklin, Gadsden, Gilchrist, Madison,
 * Union) and for Levy, whose fee is still a guess.
 *
 * Both gates already existed — in the old mail route, which refused AFTER
 * the card had been charged, and in apply.js, which diverts to
 * FloridaCountyUnavailable before checkout. Same shape as the filing-window bug
 * directly above: the funnel gates, the browser can be bypassed, and the route
 * that takes the money did not check.
 *
 * /terms section 6 now states: "Where a county has not done so, we decline the
 * order rather than take your money. Nothing is charged." This is the code that
 * makes that sentence true.
 *
 * The kit's county address comes from the same tables, so if these ever drift
 * apart, checkout sells a kit addressed to a county we have not confirmed.
 */
if ((stateCode || '').trim().toUpperCase() === 'FL') {
  const feeCheck = getFlVabFee(county);
  const addressOk = isFlCountySupported(county);
  if (!addressOk || !feeCheck || feeCheck.confidence !== 'confirmed') {
    console.warn('[checkout] refusing — county not filable:', { county, addressOk, feeConfidence: feeCheck?.confidence });
    return res.status(409).json({
      error: `We have not yet confirmed the Value Adjustment Board mailing address and filing fee for ${county ? `${county} County` : 'that county'}. Florida counts a petition as filed only when it is physically received with the correct fee, so a guessed address or a short cheque is no filing at all — we decline the order rather than take your money. Leave your email and we will write the moment that county is confirmed.`,
      code: 'FL_COUNTY_UNCONFIRMED',
    });
  }
}

/**
 * ==========================================================================
 * GEORGIA AND TEXAS ARE SOLD AS KITS, AND ONLY WHEN THE KIT CAN BE BUILT.
 * ==========================================================================
 * Georgia 15 Oct 2026; Texas the same day (Nathan: "Yes, follow GA").
 * The kit is mailed to the customer by lib/kit/dispatchKit.js the moment the
 * webhook writes the order. Every rule the kit builder enforces at that moment
 * (confirmed county address, settled county form, county questions answered,
 * value never blank, a bill that drops by at least the price) is run HERE
 * first, on the stored order, so a card is never charged for a kit that would
 * be refused at mailing.
 */
// A Georgia pre-sale (16 Oct 2026) is checked by its own gate: no notice value
// exists yet, so the full gate would refuse it. It is finished, or refunded,
// when the notice arrives (lib/kit/presale.js).
// Florida (18 Oct 2026): a reservation has its own gate too (lib/kit/flPresale.js).
const KIT_SELLABILITY = { GA: (o) => (o?.presale === true ? gaPresaleSellability(o) : gaSellability(o)), TX: (o) => (o?.presale === true ? txPresaleSellability(o) : txSellability(o)), FL: (o) => (o?.presale === true ? flPresaleSellability(o) : flSellability(o)) };
const kitState = (stateCode || '').trim().toUpperCase();
const isKitGA = kitState === 'GA';
const isKitTX = kitState === 'TX';
const isKitFL = kitState === 'FL';
const isKit = isKitGA || isKitTX || isKitFL;
const kitDoc = isKitTX ? 'protest' : isKitFL ? 'petition' : 'appeal';
let kitOrder = null;
// 'mail' or 'pdf' (lib/kit/delivery.js), from the STORED order, never the browser.
let kitDelivery = 'mail';
if (isKit) {
  if (!kitKey || !new RegExp(`^kit:${kitState}:[0-9a-f-]{36}$`).test(String(kitKey)) || !kitRedis) {
    return res.status(409).json({ error: `Please run the ${kitDoc} check for your home first.`, code: 'KIT_CHECK_REQUIRED' });
  }
  try {
    const raw = await kitRedis.get(kitKey);
    kitOrder = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  } catch (e) { kitOrder = null; }
  if (!kitOrder || kitOrder.state !== kitState) {
    return res.status(409).json({ error: 'Your check has expired. Please run it again.', code: 'KIT_CHECK_EXPIRED' });
  }
  const sell = KIT_SELLABILITY[kitState](kitOrder);
  if (!sell.ok) {
    console.warn(`[checkout] refusing ${kitState} kit:`, sell.reason);
    return res.status(409).json({
      error: sell.reason === 'season_moved'
        ? 'The season has moved on since your check. Please run it again.'
        : sell.reason === 'deadline_too_close'
        ? 'Your deadline is too close for us to get your kit to you in time, so we will not take your money for it.'
        : sell.needs
        ? 'Please answer the remaining question about your county\'s appeal form first.'
        : sell.reason === 'need_deadline'
        ? 'Please enter the petition deadline printed on your TRIM notice first.'
        : sell.noCase
          ? `Our check found a ${kitDoc} would not lower your tax bill by more than it costs, so we will not sell you one.`
          : `We cannot take orders for ${kitOrder.property?.county || 'that'} County yet. We will not take your money until we can send a kit we stand behind.`,
      code: sell.reason === 'season_moved' ? 'KIT_CHECK_EXPIRED' : sell.reason === 'deadline_too_close' ? 'KIT_TOO_LATE' : sell.needs ? 'KIT_NEEDS_ANSWER' : sell.noCase ? 'KIT_NO_CASE' : 'KIT_COUNTY_NOT_OPEN',
    });
  }
  kitDelivery = sell.delivery === 'pdf' ? 'pdf' : 'mail';
}

/**
 * ==========================================================================
 * NEXT YEAR'S FREE KIT (17 Oct 2026). No Stripe, no charge.
 * ==========================================================================
 * The guarantee: if the county did not lower the value, next year's kit is
 * free, once the decision letter proves it (lib/kit/guarantee.js). The same
 * property, the free tax year, a verified claim: claimed atomically, then the
 * order is fulfilled exactly as a paid one (lib/fulfillOrder.js fulfillSession)
 * with amount 0. A reservation (pre-sale) is not free yet: the guarantee
 * applies once this year's values exist, so it waits rather than being charged.
 */
if (isKit) {
  let free = null;
  try { free = await findFreeKit(getSupabaseAdmin(), kitOrder?.presale === true ? { ...kitOrder, presale: false } : kitOrder, freeCode); } catch (e) { free = null; }
  if (free && kitOrder.presale === true) {
    return res.status(409).json({ error: 'Your free kit applies once this year\'s values are published. We will email you then, and there is nothing to pay.', code: 'FREE_KIT_WAITS_FOR_VALUES' });
  }
  if (free) {
    const freeSessionId = `free_${crypto.randomUUID()}`;
    const claimed = await claimFreeKit(getSupabaseAdmin(), free, freeSessionId);
    if (!claimed) return res.status(409).json({ error: 'That free kit has just been used. If that was not you, contact customerservice@taxappealusa.com.', code: 'FREE_KIT_USED' });
    try {
      await fulfillSession({
        id: freeSessionId, payment_status: 'paid', amount_total: 0, customer_email: email,
        metadata: {
          customerName: `${firstName} ${lastName}`, email, address, county,
          parcelId: String(parcelId || '').trim().slice(0, 60),
          assessedValue: assessedValue ? String(assessedValue) : '', targetReduction: targetReduction ? String(targetReduction) : '',
          savings: savings ? String(savings) : '',
          ownerStreet: ownerStreet || '', ownerCity: ownerCity || '', ownerState: ownerState || '', ownerZip: ownerZip || '',
          kitKey, kitDelivery, stateCode: stateCode || '',
          // No referral commission and no coupon on a free kit.
          refCode: '', perkCode: '', gclid: '', utm: '',
          freeFromOrder: String(free.id),
        },
      });
    } catch (e) {
      await releaseFreeKit(getSupabaseAdmin(), free);
      console.error('[checkout] free kit fulfilment failed:', e?.message);
      return res.status(500).json({ error: 'We could not create your free kit just now. Nothing has been charged; please try again.' });
    }
    return res.status(200).json({ url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id=${freeSessionId}`, free: true });
  }
  if (freeCode && String(freeCode).trim()) {
    return res.status(409).json({ error: 'That free-kit code does not match this property and tax year, or it has been used. Remove it to continue, or contact customerservice@taxappealusa.com.', code: 'FREE_KIT_CODE_INVALID' });
  }
}

try {
// Florida is a kit (16 Oct 2026): the county's filing fee is paid BY THE OWNER,
// to the county, with a check in the kit. It is never charged here.
const vabFee = 0;

/*
  MOVED UP from below `lineItems`, because the service line needs it too. 24 Aug.
  `county` arrives carrying its own suffix — apply.js sends bdJson.resolvedCounty,
  which is "Broward County" — so strip once here and re-add per line.
*/
const countyLabel = String(county || '').replace(/\s+County$/i, '').trim();
const countyPhrase = countyLabel ? `${countyLabel} County` : 'your county';

/*
  ==========================================================================
  THE DESCRIPTION READ "VAB petition preparation & Prepared and filed by mail".
  ==========================================================================
  Three faults in one string, and it is the only line item every state gets.

  (a) "VAB petition" is Florida vocabulary. A Texas customer's Stripe page — and
      the descriptor on their card statement — named a body that does not exist in
      Texas. The old mail route and success.js were both audited for exactly this
      class of error; the checkout line was missed.
  (b) "& Prepared and" is a broken concatenation: two fragments joined by an
      ampersand, in two different tenses.
  (c) "Prepared and filed by mail" is past tense on a payment page, before the
      customer has signed anything. Nothing has been prepared or filed yet.

  It is also the only sentence some customers read carefully, because it is the
  one on the page where they type a card number.
*/
const lineItems = isKitTX && kitOrder.presale === true ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Texas protest kit, reserved',
description: `Reserved for ${kitOrder.property.address}. When the appraisal district publishes ${kitOrder.taxYear} values, we check your protest again. If it still lowers your bill, we mail you Form 50-132 filled in, the evidence and a return envelope addressed to the district, and email you a PDF copy of the full kit. If it no longer does, we refund you in full before anything is mailed. You sign and mail it; we do not file your protest or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : isKitTX && kitDelivery === 'pdf' ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Texas protest kit, PDF by email',
description: `Your deadline is close, so your completed, ready-to-sign protest for ${kitOrder.property.address} (Form 50-132 filled in and the evidence) is emailed to you as a PDF as soon as you pay. You print it, sign it and mail it to the appraisal district yourself. We do not file your protest or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : isKitTX ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Texas protest kit, mailed to you',
description: `Your completed, ready-to-sign protest for ${kitOrder.property.address}: the Comptroller's Form 50-132 filled in, the comparable-properties evidence from the district's own roll, and a return envelope addressed to the ${countyLabel || kitOrder.property.county} appraisal district — mailed to you, with a PDF copy of the full kit emailed to you today. You sign and mail it; we do not file your protest or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : isKitFL && kitOrder.presale === true ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Florida petition kit, reserved',
description: `Reserved for ${kitOrder.property.address}, tax year ${kitOrder.taxYear}. When the county's ${kitOrder.taxYear} values are out, we check your petition again. If it still lowers your bill, we mail you Form DR-486 filled in, the evidence and a return envelope addressed to the Value Adjustment Board, and email you a PDF copy of the full kit. If it no longer does, we refund you in full before anything is mailed. The county's filing fee is paid by you to the county and is not part of this charge. You sign and send it; we do not file your petition or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : isKitFL && kitDelivery === 'pdf' ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Florida petition kit, PDF by email',
description: `Your deadline is close, so your completed, ready-to-sign petition for ${kitOrder.property.address} (Form DR-486 filled in and the evidence) is emailed to you as a PDF as soon as you pay. You print it, sign it, add the county's filing fee check, and mail or hand-deliver it to the Value Adjustment Board yourself. The county fee is paid by you to the county and is not part of this charge. We do not file your petition or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : isKitFL ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Florida petition kit, mailed to you',
description: `Your completed, ready-to-sign petition for ${kitOrder.property.address}: Form DR-486 filled in, the property appraiser's own qualified sales as evidence, and a return envelope addressed to the ${countyLabel || kitOrder.property.county} County Value Adjustment Board — mailed to you, with a PDF copy of the full kit emailed to you today. You sign it, add the county's filing fee check and send it. The county fee is paid by you to the county and is not part of this charge. We do not file your petition or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : isKitGA && kitOrder.presale === true ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Georgia appeal kit, reserved',
description: `Reserved for ${kitOrder.property.address}. When your ${kitOrder.taxYear} assessment notice arrives, you enter its value and we check your case again. If an appeal still lowers your bill, we mail you the completed, ready-to-sign kit with a return envelope addressed to the county and email you a PDF copy of the full kit. If it no longer does, we refund you in full before anything is mailed. You sign and mail it; we do not file your appeal or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : isKitGA && kitDelivery === 'pdf' ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Georgia appeal kit, PDF by email',
description: `Your deadline is close, so your completed, ready-to-sign appeal for ${kitOrder.property.address} (the ${countyPhrase} appeal form filled in and the evidence) is emailed to you as a PDF as soon as you pay. You print it, sign it and mail it to the county yourself. We do not file your appeal or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : isKitGA ? [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Georgia appeal kit, mailed to you',
description: `Your completed, ready-to-sign appeal for ${kitOrder.property.address}: the ${countyPhrase} appeal form filled in, evidence of recorded sales, and a return envelope addressed to the county — mailed to you, with a PDF copy of the full kit emailed to you today. You sign and mail it; we do not file your appeal or represent you.`,
},
unit_amount: SERVICE_PRICE_CENTS,
},
quantity: 1,
},
] : [];
// The Florida VAB fee line was removed with the kit (16 Oct 2026): the owner pays the county directly.

/**
 * ==========================================================================
 * THE PARTNER COUPON
 * ==========================================================================
 * Reserved BEFORE the Stripe session exists, because the reservation has to be
 * keyed to something and Stripe has not issued a session id yet. So we mint the
 * key ourselves, hold the coupon against it, and pass it through metadata for
 * lib/fulfillOrder.js to confirm against.
 *
 * EVERY FAILURE IS SILENT AND THE CUSTOMER PAYS FULL PRICE. Deliberate. A coupon
 * that cannot be reserved — unknown, spent, held by another checkout, database
 * unreachable — must never block a sale. $20 of goodwill is recoverable by a
 * human in two minutes; a lost order is not. Each branch logs, so a partner's
 * "my code didn't work" is answerable from a log line rather than by re-running
 * their checkout.
 */
const perkKey = `perk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
let perkApplied = null;
const normalizedPerk = normalizePerkCode(perkCode);

if (perkCode && !normalizedPerk) {
  console.warn('[checkout] coupon rejected — malformed:', String(perkCode).slice(0, 32));
} else if (normalizedPerk) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.error('[checkout] coupon skipped — Supabase unavailable');
    } else {
      const { data, error: perkErr } = await supabase.rpc(RPC.reserve, {
        p_code: normalizedPerk, p_session: perkKey,
      });
      if (perkErr) {
        console.error('[checkout] coupon reserve failed:', perkErr.message);
      } else if (!data || data.length === 0) {
        // Zero rows is the ONLY signal that the code was unavailable. Do not
        // follow this with a SELECT to find out why — that is the read-then-write
        // race the database function exists to eliminate, reintroduced.
        console.warn('[checkout] coupon unavailable (unknown, spent, or held):', normalizedPerk);
      } else {
        perkApplied = normalizedPerk;
        console.log(`[checkout] coupon ${normalizedPerk} reserved as ${perkKey}`);
      }
    }
  } catch (e) {
    console.error('[checkout] coupon reserve threw:', e?.message);
  }
}

// Applied ONLY off perkApplied, which is set nowhere but inside the successful
// reserve branch above. So the price the customer sees and the coupon we will
// burn can never disagree.
const finalLineItems = perkApplied ? applyPerkToLineItems(lineItems) : lineItems;

const session = await stripe.checkout.sessions.create({
payment_method_types: ['card'],
mode: 'payment',
customer_email: email,
line_items: finalLineItems,
metadata: {
customerName: `${firstName} ${lastName}`,
email,
address,
county,
// Carried through to orders.account_number. 60 chars
// matches LIMITS.parcelId. Stripe allows 50 metadata keys and 500 chars per
// value; this is key 27, so there is room.
parcelId: String(parcelId || '').trim().slice(0, 60),
assessedValue: assessedValue ? String(assessedValue) : '',
targetReduction: targetReduction ? String(targetReduction) : '',
/**
 * WHAT THE CUSTOMER WAS WARNED ABOUT BEFORE THEY PAID.
 *
 * Texas packets are never refused any more — a weak case is shown to the owner
 * as named cautions and they decide. That design only holds up if there is a
 * record of it: without this, we show someone "the cap means this will not lower
 * your bill", take $89 when they proceed, and keep no evidence that they were
 * told. It is the same job orders.owner_ack and fl_will_not_attend already do
 * for Florida.
 *
 * Codes only, comma-joined — short, stable, and far inside Stripe's 500-char
 * metadata limit even if every caution fires at once.
 */
txCautions: Array.isArray(txCautions) ? txCautions.join(',').slice(0, 400) : '',
savings: savings ? String(savings) : '',
ownerStreet: ownerStreet || '',
ownerCity: ownerCity || '',
ownerState: ownerState || '',
ownerZip: ownerZip || '',
kitKey: isKit ? kitKey : '',
kitPresale: isKit && kitOrder?.presale === true ? 'true' : '',
kitDelivery: isKit ? kitDelivery : '',
stateCode: stateCode || '',
vabFee: vabFee ? String(vabFee) : '0',
// refCode was sent by apply.js but never destructured or stored, so
// orders.ref_code was always NULL and the entire $20 payout block in
// referral code was dead code. No partner could ever be paid.
// Normalize to the canonical uppercase form. Previously `?ref=jane-smith` and
// `?ref=JANE-SMITH` produced different ref_code values: the lowercase one matched
// no partner, so Jane saw 0 referrals and was never paid, while the payout sheet
// listed an 'Unknown' referrer. Length-capped so it can't be used to stuff
// Stripe metadata or a Supabase filter.
refCode: String(refCode || '').trim().toUpperCase().slice(0, 64),
      // WHICH AD CLICK PAID FOR THIS ORDER, IF ANY.
      //
      // normalizeAttribution caps both values; that cap is load-bearing rather
      // than cosmetic, because Stripe rejects a metadata value over 500
      // characters and would fail the entire checkout session. A crafted
      // ?gclid=<10kb> would otherwise have been a way to stop anyone buying.
      gclid: attribution.gclid,
      utm: attribution.utm,
      // The coupon, and the key holding its reservation. lib/fulfillOrder.js
      // needs BOTH: the code to stamp on the order (which cancels the referral
      // commission) and the key to confirm the reservation against. Confirming
      // on the code alone would let one session consume another's hold.
      perkCode: perkApplied || '',
      perkKey: perkApplied ? perkKey : '',
      perkDiscountCents: perkApplied ? String(PERK_AMOUNT_CENTS) : '',
},
success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/apply`,
});

return res.status(200).json({ url: session.url });
} catch (err) {
console.error('Stripe checkout error:', err);
return res.status(500).json({ error: err.message });
}
}
