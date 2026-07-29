import Stripe from 'stripe';
import bcrypt from 'bcryptjs';
import { getFlVabFee } from '../../lib/flCountyFees';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

const {
email, firstName, lastName, password,
address, county, assessedValue, targetReduction, savings,
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
description: `VAB petition preparation & USPS certified mail filing for ${address} — ${county}`,
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
refCode: refCode || '',
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
