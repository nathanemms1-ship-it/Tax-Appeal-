import Stripe from 'stripe';
import bcrypt from 'bcryptjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Florida VAB filing fee — $50 for all FL counties (HB 7031 effective July 2025)
const FL_VAB_FEE = 5000; // cents

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    email,
    firstName,
    lastName,
    password,
    address,
    county,
    assessedValue,
    targetReduction,
    savings,
    letter,
    letterKey,
    districtName,
    districtAddress,
    districtCity,
    districtState,
    districtZip,
    ownerStreet,
    ownerCity,
    ownerState,
    ownerZip,
    stateCode,
    countyFee,
    flAuthorizationGiven,
  } = req.body;

  try {
    let passwordHash = '';
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const isFL = (stateCode || '').toUpperCase() === 'FL';
    const vabFee = isFL ? (countyFee || FL_VAB_FEE) : 0;

    const lineItems = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'TaxAppeal USA — Property Tax Dispute Filing',
            description: `VAB petition preparation & USPS certified mail filing for ${address} — ${county}`,
          },
          unit_amount: 7900,
        },
        quantity: 1,
      },
    ];

    if (isFL && vabFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Florida County VAB Filing Fee',
            description: `Mandatory filing fee paid on your behalf to the ${county} Value Adjustment Board (required by Florida law HB 7031)`,
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
        countyFee: vabFee ? String(vabFee) : '0',
        flAuthorizationGiven: flAuthorizationGiven ? 'true' : 'false',
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
