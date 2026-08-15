import Stripe from 'stripe';
import bcrypt from 'bcryptjs';
import { getFlVabFee } from '../../lib/flCountyFees';
import { enforceRateLimit } from '../../lib/rateLimit';
import { blockIfSalesPaused } from '../../lib/salesGate';
import { getFilingWindowStatus } from '../../lib/filingWindows';

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
email, firstName, lastName, password,
address, county, parcelId, assessedValue, targetReduction, savings,
letter, letterKey,
districtName, districtAddress, districtCity, districtState, districtZip,
ownerStreet, ownerCity, ownerState, ownerZip,
stateCode,
flSignatureName,
flSignatureTimestamp,
flAuthDate,
agentAuthGranted,
agentAuthTimestamp,
isPreOrder,
scheduledFileDate,
refCode,
} = req.body;

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
  const where = county ? `${county} County` : (stateCode || 'that state');
  console.warn('[checkout] refusing — filing window closed:', { stateCode, county, canFile: windowStatus?.canFile, canPreOrder: windowStatus?.canPreOrder });
  return res.status(409).json({
    error: `We are no longer accepting orders for ${where} this season. A petition filed now would not arrive before the deadline, and Florida counts a petition as filed only when it is physically received — so we will not take your money for a filing we cannot deliver.`,
    code: 'FILING_WINDOW_CLOSED',
  });
}

try {
let passwordHash = '';
if (password) {
passwordHash = await bcrypt.hash(password, 10);
}

const isFL = (stateCode || '').toUpperCase() === 'FL';
const countyFeeInfo = isFL ? getFlVabFee(county) : null;
const vabFee = isFL ? countyFeeInfo.vabFee : 0;
const vabPayableTo = isFL ? countyFeeInfo.payableTo : '';

const lineItems = [
{
price_data: {
currency: 'usd',
product_data: {
name: 'TaxAppeal USA — Property Tax Dispute Filing',
description: `VAB petition preparation & Prepared and filed by mail for ${address} — ${county}`,
},
unit_amount: 8900,
},
quantity: 1,
},
];

if (isFL && vabFee > 0) {
lineItems.push({
price_data: {
currency: 'usd',
product_data: {
name: `${county} County VAB Filing Fee`,
description: `Mandatory filing fee paid on your behalf to the ${county} Value Adjustment Board (required by Florida law § 194.013)`,
},
unit_amount: vabFee,
},
quantity: 1,
});
}

const session = await stripe.checkout.sessions.create({
payment_method_types: ['card'],
mode: 'payment',
customer_email: email,
line_items: lineItems,
metadata: {
customerName: `${firstName} ${lastName}`,
email,
passwordHash,
address,
county,
// Carried through to the Lob cheque memo and to orders.account_number. 60 chars
// matches LIMITS.parcelId. Stripe allows 50 metadata keys and 500 chars per
// value; this is key 27, so there is room.
parcelId: String(parcelId || '').trim().slice(0, 60),
assessedValue: assessedValue ? String(assessedValue) : '',
targetReduction: targetReduction ? String(targetReduction) : '',
savings: savings ? String(savings) : '',
districtName: districtName || '',
districtAddress: districtAddress || '',
districtCity: districtCity || '',
districtState: districtState || '',
districtZip: districtZip || '',
ownerStreet: ownerStreet || '',
ownerCity: ownerCity || '',
ownerState: ownerState || '',
ownerZip: ownerZip || '',
letterKey: letterKey || '',
stateCode: stateCode || '',
vabFee: vabFee ? String(vabFee) : '0',
vabPayableTo: vabPayableTo || '',
flSignatureName: flSignatureName || '',
flSignatureTimestamp: flSignatureTimestamp || '',
flAuthDate: flAuthDate || '',
agentAuthGranted: agentAuthGranted ? 'true' : 'false',
agentAuthTimestamp: agentAuthTimestamp || '',
// refCode was sent by apply.js but never destructured or stored, so
// orders.ref_code was always NULL and the entire $20 payout block in
// save-order.js was dead code. No partner could ever be paid.
// Normalize to the canonical uppercase form. Previously `?ref=jane-smith` and
// `?ref=JANE-SMITH` produced different ref_code values: the lowercase one matched
// no partner, so Jane saw 0 referrals and was never paid, while the payout sheet
// listed an 'Unknown' referrer. Length-capped so it can't be used to stuff
// Stripe metadata or a Supabase filter.
refCode: String(refCode || '').trim().toUpperCase().slice(0, 64),
isPreOrder: isPreOrder ? 'true' : 'false',
scheduledFileDate: scheduledFileDate || '',
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
