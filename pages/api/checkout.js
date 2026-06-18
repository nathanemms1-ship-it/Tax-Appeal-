import Stripe from 'stripe';
import bcrypt from 'bcryptjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    // District info
    districtName,
    districtAddress,
    districtCity,
    districtState,
    districtZip,
    // Owner address
    ownerStreet,
    ownerCity,
    ownerState,
    ownerZip,
  } = req.body;

  try {
    // Hash the password before storing in Stripe metadata
    let passwordHash = '';
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'TaxAppeal — Property Tax Dispute Filing',
            description: `Certified mail protest filing for ${address} — ${county}`,
          },
          unit_amount: 7900,
        },
        quantity: 1,
      }],
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
