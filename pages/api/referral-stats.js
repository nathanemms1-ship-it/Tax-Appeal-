// pages/api/referral-stats.js
// Monthly payout query — GET /api/referral-stats?password=XXX&month=2026-07
import { getSupabaseAdmin } from './supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { password, month } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

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
      .select('id, ref_code, amount_paid, created_at, property_address, customer_name, customer_email')
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
    for (const order of orders || []) {
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
      period: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
      summary: { totalPayoutDue: payouts.reduce((s,p)=>s+p.payoutDue,0), totalOrders: payouts.reduce((s,p)=>s+p.orderCount,0), activeReferrers: payouts.length },
      payouts,
    });
  } catch (err) {
    console.error('Referral stats error:', err);
    return res.status(500).json({ error: err.message });
  }
}
