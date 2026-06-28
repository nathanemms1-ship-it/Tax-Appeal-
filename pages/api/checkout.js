import Stripe from 'stripe';
import bcrypt from 'bcryptjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Florida VAB fees per county (cents) — confirmed/estimated as of June 2026
// Review all "estimated" entries before August 15, 2026
const FL_COUNTY_VAB_FEES = {
  // CONFIRMED
  "Miami-Dade":   { fee: 1500, payableTo: "Clerk of the Value Adjustment Board" },
  "Orange":       { fee: 1500, payableTo: "Orange County BCC" },
  "Broward":      { fee: 2500, payableTo: "Broward County VAB" },
  "Lee":          { fee: 3000, payableTo: "Lee County Clerk of Court" },
  "Clay":         { fee: 3500, payableTo: "Board of County Commissioners" },
  "Hillsborough": { fee: 5000, payableTo: "Hillsborough County Clerk of Court" },
  "Manatee":      { fee: 5000, payableTo: "Manatee County Clerk of Court" },
  "Pasco":        { fee: 5000, payableTo: "Board of County Commissioners" },
  "Sarasota":     { fee: 5000, payableTo: "Sarasota County Clerk of Court" },
  "Okaloosa":     { fee: 5000, payableTo: "Okaloosa County Board of County Commissioners" },
  "Walton":       { fee: 5000, payableTo: "Walton County Board of County Commissioners" },
  // ESTIMATED ($50 default — verify before Aug 15, 2026)
  "Alachua":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Baker":        { fee: 5000, payableTo: "Board of County Commissioners" },
  "Bay":          { fee: 5000, payableTo: "Board of County Commissioners" },
  "Bradford":     { fee: 5000, payableTo: "Board of County Commissioners" },
  "Brevard":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Calhoun":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Charlotte":    { fee: 5000, payableTo: "Board of County Commissioners" },
  "Citrus":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Collier":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Columbia":     { fee: 5000, payableTo: "Board of County Commissioners" },
  "DeSoto":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Dixie":        { fee: 5000, payableTo: "Board of County Commissioners" },
  "Duval":        { fee: 5000, payableTo: "Board of County Commissioners" },
  "Escambia":     { fee: 5000, payableTo: "Board of County Commissioners" },
  "Flagler":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Franklin":     { fee: 5000, payableTo: "Board of County Commissioners" },
  "Gadsden":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Gilchrist":    { fee: 5000, payableTo: "Board of County Commissioners" },
  "Glades":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Gulf":         { fee: 5000, payableTo: "Board of County Commissioners" },
  "Hamilton":     { fee: 5000, payableTo: "Board of County Commissioners" },
  "Hardee":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Hendry":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Hernando":     { fee: 5000, payableTo: "Clerk of Circuit Court" },
  "Highlands":    { fee: 5000, payableTo: "Board of County Commissioners" },
  "Holmes":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Indian River": { fee: 5000, payableTo: "Board of County Commissioners" },
  "Jackson":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Jefferson":    { fee: 5000, payableTo: "Board of County Commissioners" },
  "Lafayette":    { fee: 5000, payableTo: "Board of County Commissioners" },
  "Lake":         { fee: 5000, payableTo: "Board of County Commissioners" },
  "Leon":         { fee: 5000, payableTo: "Board of County Commissioners" },
  "Levy":         { fee: 5000, payableTo: "Board of County Commissioners" },
  "Liberty":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Madison":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Marion":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Martin":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Monroe":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Nassau":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Okeechobee":   { fee: 5000, payableTo: "Board of County Commissioners" },
  "Osceola":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Palm Beach":   { fee: 5000, payableTo: "Board of County Commissioners" },
  "Pinellas":     { fee: 5000, payableTo: "Board of County Commissioners" },
  "Polk":         { fee: 5000, payableTo: "Board of County Commissioners" },
  "Putnam":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "St. Johns":    { fee: 5000, payableTo: "Board of County Commissioners" },
  "St. Lucie":    { fee: 5000, payableTo: "Board of County Commissioners" },
  "Santa Rosa":   { fee: 5000, payableTo: "Board of County Commissioners" },
  "Seminole":     { fee: 5000, payableTo: "Board of County Commissioners" },
  "Sumter":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Suwannee":     { fee: 5000, payableTo: "Board of County Commissioners" },
  "Taylor":       { fee: 5000, payableTo: "Board of County Commissioners" },
  "Union":        { fee: 5000, payableTo: "Board of County Commissioners" },
  "Volusia":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Wakulla":      { fee: 5000, payableTo: "Board of County Commissioners" },
  "Washington":   { fee: 5000, payableTo: "Board of County Commissioners" },
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
