import Stripe from 'stripe';
import { Redis } from '@upstash/redis';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) {
    redis = new Redis({ url: redisUrl, token: redisToken });
  }
} catch (e) {
  console.log("Redis init failed:", e.message);
}

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

    // Retrieve full letter from Redis using the letterKey
    let letter = null;
    if (meta.letterKey && redis) {
      try {
        letter = await redis.get(meta.letterKey);
        console.log("Letter retrieved from Redis:", meta.letterKey, "length:", letter?.length);
      } catch (e) {
        console.log("Redis letter retrieval failed:", e.message);
      }
    }

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
      passwordHash: meta.passwordHash || null,
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
      // Full letter content retrieved from Redis
      letter,
    });

  } catch (err) {
    console.error('Verify payment error:', err);
    return res.status(500).json({ error: err.message });
  }
}
