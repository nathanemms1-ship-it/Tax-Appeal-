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

    return res.status(200).json({
      paid: true,
      customerName: session.metadata?.customerName || '',
      email: session.customer_email || '',
      address: session.metadata?.address || '',
      county: session.metadata?.county || '',
      assessedValue: session.metadata?.assessedValue || null,
      targetReduction: session.metadata?.targetReduction || null,
      savings: session.metadata?.savings || null,
      amountPaid: session.amount_total,
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    return res.status(500).json({ error: err.message });
  }
}
