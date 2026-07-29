import crypto from 'crypto';
import Stripe from 'stripe';
import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';

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
    let letter = null;
    if (meta.letterKey && redis) {
      try {
        letter = await redis.get(meta.letterKey);
        console.log("Letter retrieved from Redis:", meta.letterKey, "length:", letter?.length);
      } catch (e) {
        console.log("Redis letter retrieval failed:", e.message);
      }
    }

    const stateCode = (meta.stateCode || meta.ownerState || '').toUpperCase();
    const isFL = stateCode === 'FL';
    const vabFee = meta.vabFee ? parseInt(meta.vabFee, 10) : 0;
    const vabPayableTo = meta.vabPayableTo || '';
    const flSignatureName = meta.flSignatureName || '';
    const flSignatureTimestamp = meta.flSignatureTimestamp || '';
    const flAuthDate = meta.flAuthDate || '';
    const isPreOrder = meta.isPreOrder === 'true';
    const scheduledFileDate = meta.scheduledFileDate || null;
    const totalPaid = session.amount_total || (8900 + vabFee);

    return res.status(200).json({
      paid: true,
      customerName: meta.customerName || '',
      email: session.customer_email || '',
      address: meta.address || '',
      county: meta.county || '',
      assessedValue: meta.assessedValue || null,
      targetReduction: meta.targetReduction || null,
      savings: meta.savings || null,
      amountPaid: totalPaid,
      // passwordHash was returned here and is NOT read by pages/success.js — the
      // hash is consumed server-side by lib/fulfillOrder.js straight off the Stripe
      // metadata. Returning it put a customer's password hash in a browser response
      // (and in any client-side error report) for no functional reason.
      //
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
      districtName: meta.districtName || null,
      districtAddress: meta.districtAddress || null,
      districtCity: meta.districtCity || null,
      districtState: meta.districtState || null,
      districtZip: meta.districtZip || null,
      ownerStreet: meta.ownerStreet || null,
      ownerCity: meta.ownerCity || null,
      ownerState: meta.ownerState || null,
      ownerZip: meta.ownerZip || null,
      letter,
      stateCode,
      isFL,
      vabFee,
      vabPayableTo,
      flSignatureName,
      flSignatureTimestamp,
      flAuthDate,
      isPreOrder,
      scheduledFileDate,
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    return res.status(500).json({ error: err.message });
  }
}
