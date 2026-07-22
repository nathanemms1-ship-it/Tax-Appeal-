import Stripe from 'stripe';
import bcrypt from 'bcryptjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Florida VAB fees per county (cents) — sourced 2026-07-20 from official county web pages.
// 57 of 67 counties confirmed; 10 remain at the $50 default pending a phone call.
// Full source list + payees: lib/flCountyFees.js, fl_vab_fee_call_sheet.xlsx, TAXAPPEAL-CONTEXT.md §5 item 6.
// 🔴 Corrections vs the prior version of this table: Orange $15→$50, Palm Beach $50→$20, Hernando $50→$15.
const FL_COUNTY_VAB_FEES = {
"Alachua": { fee: 5000, payableTo: "Board of County Commissioners" },
"Baker": { fee: 1500, payableTo: "Board of County Commissioners" },
"Bay": { fee: 5000, payableTo: "Bay County Clerk of the VAB" },
"Bradford": { fee: 5000, payableTo: "Board of County Commissioners" },
"Brevard": { fee: 4500, payableTo: "Brevard Clerk of Courts" },
"Broward": { fee: 2500, payableTo: "Broward County VAB" },
"Calhoun": { fee: 1500, payableTo: "Board of County Commissioners" },
"Charlotte": { fee: 1500, payableTo: "Board of County Commissioners" },
"Citrus": { fee: 1500, payableTo: "Board of County Commissioners" },
"Clay": { fee: 3500, payableTo: "Board of County Commissioners" },
"Collier": { fee: 5000, payableTo: "Board of County Commissioners" },
"DeSoto": { fee: 1500, payableTo: "Board of County Commissioners" },
"Duval": { fee: 1500, payableTo: "Duval County Tax Collector" },
"Escambia": { fee: 5000, payableTo: "Board of County Commissioners" },
"Flagler": { fee: 5000, payableTo: "Flagler County Clerk of Court" },
"Glades": { fee: 5000, payableTo: "Board of County Commissioners" },
"Gulf": { fee: 5000, payableTo: "Board of County Commissioners" },
"Hamilton": { fee: 1500, payableTo: "Board of County Commissioners" },
"Hardee": { fee: 5000, payableTo: "Board of County Commissioners" },
"Hendry": { fee: 5000, payableTo: "Board of County Commissioners" },
"Hernando": { fee: 1500, payableTo: "Clerk of Circuit Court" },
"Highlands": { fee: 5000, payableTo: "Highlands County Clerk of Courts" },
"Hillsborough": { fee: 5000, payableTo: "Hillsborough County Clerk of Court" },
"Holmes": { fee: 5000, payableTo: "Holmes County Board of Commissioners" },
"Indian River": { fee: 1500, payableTo: "Indian River County VAB" },
"Jackson": { fee: 5000, payableTo: "Jackson County Clerk of Court" },
"Jefferson": { fee: 5000, payableTo: "Board of County Commissioners" },
"Lafayette": { fee: 1500, payableTo: "Board of County Commissioners" },
"Lake": { fee: 5000, payableTo: "Lake County Clerk of the Circuit Court" },
"Lee": { fee: 3000, payableTo: "Lee County Clerk of Court" },
"Leon": { fee: 1500, payableTo: "Leon County Clerk of Court" },
"Liberty": { fee: 5000, payableTo: "Board of County Commissioners" },
"Manatee": { fee: 5000, payableTo: "Manatee County Clerk of Court" },
"Marion": { fee: 5000, payableTo: "Marion County Clerk of Court and Comptroller" },
"Martin": { fee: 5000, payableTo: "Martin County Clerk of the Circuit Court" },
"Miami-Dade": { fee: 1500, payableTo: "Clerk of the Value Adjustment Board" },
"Monroe": { fee: 5000, payableTo: "Board of County Commissioners" },
"Okaloosa": { fee: 5000, payableTo: "Okaloosa County Board of County Commissioners" },
"Okeechobee": { fee: 1500, payableTo: "Board of County Commissioners" },
"Orange": { fee: 5000, payableTo: "Orange County BCC" },
"Osceola": { fee: 5000, payableTo: "Osceola County Clerk of Court" },
"Palm Beach": { fee: 2000, payableTo: "Board of County Commissioners" },
"Pasco": { fee: 5000, payableTo: "Board of County Commissioners" },
"Pinellas": { fee: 5000, payableTo: "Board of County Commissioners" },
"Polk": { fee: 5000, payableTo: "Polk County Value Adjustment Board" },
"Putnam": { fee: 1500, payableTo: "Putnam County Clerk of the Circuit Court" },
"St. Johns": { fee: 5000, payableTo: "Board of County Commissioners" },
"St. Lucie": { fee: 5000, payableTo: "Board of County Commissioners" },
"Santa Rosa": { fee: 1500, payableTo: "Board of County Commissioners" },
"Sarasota": { fee: 5000, payableTo: "Sarasota County Clerk of Court" },
"Seminole": { fee: 1500, payableTo: "Seminole County Clerk to the BCC" },
"Sumter": { fee: 3500, payableTo: "Sumter County Clerk" },
"Suwannee": { fee: 5000, payableTo: "Suwannee County Clerk of the Value Adjustment Board" },
"Taylor": { fee: 1500, payableTo: "Taylor County Clerk of Court" },
"Union": { fee: 5000, payableTo: "Board of County Commissioners" },
"Volusia": { fee: 4000, payableTo: "County of Volusia" },
"Wakulla": { fee: 5000, payableTo: "Board of County Commissioners" },
"Walton": { fee: 5000, payableTo: "Walton County Board of County Commissioners" },
"Washington": { fee: 5000, payableTo: "Washington County Board of County Commissioners" },
"Columbia": { fee: 5000, payableTo: "Board of County Commissioners" },
"Dixie": { fee: 5000, payableTo: "Board of County Commissioners" },
"Franklin": { fee: 5000, payableTo: "Board of County Commissioners" },
"Gadsden": { fee: 5000, payableTo: "Board of County Commissioners" },
"Gilchrist": { fee: 5000, payableTo: "Board of County Commissioners" },
"Levy": { fee: 5000, payableTo: "Board of County Commissioners" },
"Madison": { fee: 5000, payableTo: "Board of County Commissioners" },
"Nassau": { fee: 5000, payableTo: "Board of County Commissioners" },
};

function getFlVabFee(countyName) {
if (!countyName) return { fee: 5000, payableTo: "Board of County Commissioners" };
const clean = countyName.replace(/ County$/i, "").trim();
return FL_COUNTY_VAB_FEES[clean] || { fee: 5000, payableTo: "Board of County Commissioners" };
}

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
} = req.body;

try {
let passwordHash = '';
if (password) {
passwordHash = await bcrypt.hash(password, 10);
}

const isFL = (stateCode || '').toUpperCase() === 'FL';
const countyFeeInfo = isFL ? getFlVabFee(county) : null;
const vabFee = isFL ? countyFeeInfo.fee : 0;
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
