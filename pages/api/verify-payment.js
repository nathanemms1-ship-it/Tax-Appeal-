import crypto from 'crypto';
import Stripe from 'stripe';
import { enforceRateLimit } from '../../lib/rateLimit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // A valid session_id returns the customer's name, email, address and assessed
  // value. It is therefore a bearer token for one customer's PII, and brute-forcing
  // or replaying harvested ids should not be free.
  if (await enforceRateLimit(req, res, 'verify-payment', 20, 60)) return;
  if (await enforceRateLimit(req, res, 'verify-payment', 120, 3600)) return;

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const meta = session.metadata || {};
    const stateCode = (meta.stateCode || meta.ownerState || '').toUpperCase();
    const totalPaid = session.amount_total || 8900;
    // KIT ORDERS (GA, TX, FL) carry a kitKey in the metadata. The page
    // needs only to know it is one: nothing is signed online and nothing goes to
    // a county. The key itself points at the stored order and is not returned.
    const isKit = typeof meta.kitKey === 'string' && /^kit:[A-Z]{2}:/.test(meta.kitKey);

    return res.status(200).json({
      paid: true,
      customerName: meta.customerName || '',
      email: session.customer_email || '',
      address: meta.address || '',
      county: meta.county || '',
      targetReduction: meta.targetReduction || null,
      savings: meta.savings || null,
      amountPaid: totalPaid,
      // transactionId replaces session_id in the GA4 / Google Ads purchase event.
      // session_id is a bearer token for this endpoint, and this endpoint returns
      // the customer's name, email and property address — so it was being handed to
      // third-party ad infrastructure. This is a stable, opaque, non-reversible id:
      // same session always yields the same value, so conversion dedupe still works.
      transactionId: crypto
        .createHash('sha256')
        .update(`txn:${session_id}`)
        .digest('hex')
        .slice(0, 24),
      stateCode,
      isKit,
      // A Georgia pre-sale: reserved now, built when the notice arrives.
      kitPresale: isKit && meta.kitPresale === 'true',
      // Last days before the deadline: emailed as a PDF, nothing mailed.
      kitPdfOnly: isKit && meta.kitDelivery === 'pdf',
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    return res.status(500).json({ error: err.message });
  }
}
