import crypto from 'crypto';
import Stripe from 'stripe';
import { enforceRateLimit } from '../../lib/rateLimit';
import { getSupabaseAdmin } from './supabase';
import { SERVICE_PRICE_CENTS } from '../../lib/pricing';

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

  /*
   * A FREE KIT (17 Oct 2026, lib/kit/freeKit.js) has no Stripe session: its id
   * is free_<uuid>, as unguessable as a Stripe one, and the order row is the
   * record. Same shape back, amountPaid 0 and free: true (no ad conversion).
   */
  if (/^free_[0-9a-f-]{36}$/.test(String(session_id))) {
    const supabase = getSupabaseAdmin();
    const { data: o } = supabase ? await supabase.from('orders').select('customer_name, customer_email, property_address, county, state_code, dispute_status, target_reduction, estimated_savings').eq('stripe_session_id', String(session_id)).maybeSingle() : { data: null };
    if (!o) return res.status(404).json({ error: 'Order not found' });
    return res.status(200).json({
      paid: true, free: true,
      customerName: o.customer_name || '', email: o.customer_email || '', address: o.property_address || '', county: o.county || '',
      targetReduction: o.target_reduction || null, savings: o.estimated_savings || null, amountPaid: 0,
      transactionId: crypto.createHash('sha256').update(`txn:${session_id}`).digest('hex').slice(0, 24),
      stateCode: String(o.state_code || '').toUpperCase(),
      isKit: true,
      kitPresale: false,
      kitPdfOnly: o.dispute_status === 'kit_emailed',
    });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const meta = session.metadata || {};
    const stateCode = (meta.stateCode || meta.ownerState || '').toUpperCase();
    const totalPaid = session.amount_total || SERVICE_PRICE_CENTS;
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
