// pages/api/referral-stats.js
// Monthly payout query — GET /api/referral-stats?password=XXX&month=2026-07
import { getSupabaseAdmin } from './supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { password, month } = req.query;
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    let startDate, endDate;
    if (month) {
      startDate = new Date(`${month}-01T00:00:00Z`);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, ref_code, amount_paid, created_at, property_address, customer_name, customer_email, payment_status')
      .not('ref_code', 'is', null)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    const { data: referrers, error: refError } = await supabase
      .from('referrals')
      .select('code, name, email, phone, total_referrals, total_paid');

    if (refError) throw refError;

    const payoutMap = {};
    // Load every partner once so we can (a) reject codes that don't belong to a real
  // partner, (b) block self-referrals, and (c) skip deactivated partners.
  const { data: allPartners } = await supabase
    .from('referrals')
    .select('code, email, first_name, last_name, phone, stripe_account_id, active');
  const partnerByCode = {};
  for (const p of allPartners || []) partnerByCode[String(p.code).trim().toUpperCase()] = p;

  // Orders already settled in a previous payout run must never be paid again.
  const { data: settled } = await supabase
    .from('referral_payouts')
    .select('order_id');
  const settledOrderIds = new Set((settled || []).map(r => r.order_id));

  const excluded = [];

  for (const order of orders || []) {
    const code = String(order.ref_code || '').trim().toUpperCase();
    const partner = partnerByCode[code];

    // 1. Unknown code — an attacker can put any string in ?ref=, so a code that
    //    matches no partner must never appear on a payout sheet.
    if (!partner) { excluded.push({ order: order.id, code, reason: 'unknown_referral_code' }); continue; }

    // 2. Deactivated partner. `active` was previously written and never read, so
    //    suspending a partner you caught defrauding you had no effect.
    if (partner.active === false) { excluded.push({ order: order.id, code, reason: 'partner_inactive' }); continue; }

    // 3. SELF-REFERRAL. Nothing previously compared the buyer to the partner, so
    //    anyone could register, buy through their own link, and take $20 off their
    //    own $89 — repeatedly, at scale, with disposable emails.
    if (partner.email && order.customer_email &&
        String(partner.email).trim().toLowerCase() === String(order.customer_email).trim().toLowerCase()) {
      excluded.push({ order: order.id, code, reason: 'self_referral' }); continue;
    }

    // 4. Payment must still be good. Refunds and chargebacks previously had no
    //    effect on payouts at all.
    if (order.payment_status && order.payment_status !== 'paid') {
      excluded.push({ order: order.id, code, reason: `payment_${order.payment_status}` }); continue;
    }

    // 5. Never pay the same order twice across runs.
    if (settledOrderIds.has(order.id)) { excluded.push({ order: order.id, code, reason: 'already_settled' }); continue; }

      if (!order.ref_code) continue;
      if (!payoutMap[order.ref_code]) {
        payoutMap[order.ref_code] = { code: order.ref_code, orders: [], orderCount: 0, payoutDue: 0 };
      }
      payoutMap[order.ref_code].orders.push({ orderId: order.id, customerName: order.customer_name, address: order.property_address, date: order.created_at });
      payoutMap[order.ref_code].orderCount++;
      payoutMap[order.ref_code].payoutDue += 2000;
    }

    const referrerMap = {};
    for (const r of referrers || []) referrerMap[r.code] = r;

    const payouts = Object.values(payoutMap).map(p => ({
      ...p,
      payoutDue: p.payoutDue / 100,
      referrer: referrerMap[p.code] || { name: 'Unknown', email: null },
    })).sort((a, b) => b.payoutDue - a.payoutDue);

    return res.status(200).json({
      // Excluded orders are reported, not silently dropped — a payout sheet that
      // quietly shrinks is worse than one that explains itself.
      excluded,
      period: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
      summary: { totalPayoutDue: payouts.reduce((s,p)=>s+p.payoutDue,0), totalOrders: payouts.reduce((s,p)=>s+p.orderCount,0), activeReferrers: payouts.length },
      payouts,
    });
  } catch (err) {
    console.error('Referral stats error:', err);
    return res.status(500).json({ error: err.message });
  }
}
