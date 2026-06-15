import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const meta = session.metadata || {};

    return res.status(200).json({
      paid: true,
      customerName: meta.customerName || '',
      email: session.customer_email || '',
      address: meta.address || '',
      county: meta.county || '',
      assessedValue: meta.assessedValue || null,
      targetReduction: meta.targetReduction || null,
      savings: meta.savings || null,
      amountPaid: session.amount_total,
      // District info for Lob mailing
      districtName: meta.districtName || null,
      districtAddress: meta.districtAddress || null,
      districtCity: meta.districtCity || null,
      districtState: meta.districtState || null,
      districtZip: meta.districtZip || null,
      // Owner address for return address on envelope
      ownerStreet: meta.ownerStreet || null,
      ownerCity: meta.ownerCity || null,
      ownerState: meta.ownerState || null,
      ownerZip: meta.ownerZip || null,
      // Letter content
      letter: meta.letter || null,
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    return res.status(500).json({ error: err.message });
  }
}
