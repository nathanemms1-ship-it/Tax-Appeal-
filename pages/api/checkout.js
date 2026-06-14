import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, firstName, lastName, address, county, assessedValue, targetReduction, savings, letter } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'TaxAppeal — Property Tax Dispute Filing',
            description: `Property dispute filing for ${address}. We draft and mail your certified protest letter to ${county}.`,
            images: [],
          },
          unit_amount: 7900, // $79.00 in cents
        },
        quantity: 1,
      }],
      metadata: {
        customerName: `${firstName} ${lastName}`,
        email,
        address,
        county,
        assessedValue: assessedValue ? String(assessedValue) : '',
        targetReduction: targetReduction ? String(targetReduction) : '',
        savings: savings ? String(savings) : '',
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
