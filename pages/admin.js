import { useState, useEffect } from 'react';
import Head from 'next/head';

const C = {
  navy:     "#1B3A6B",
  gold:     "#FFC940",
  darkNavy: "#0F1F3D",
  bg:       "#F4F7FC",
  lightBlue:"#EEF3FB",
  bodyGray: "#5A6B82",
  mutedGray:"#8596AF",
  border:   "#E8EDF4",
  white:    "#FFFFFF",
  green:    "#2E7D52",
  red:      "#C0392B",
  amber:    "#FFF8E6",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatMoney(cents) {
  if (!cents && cents !== 0) return '—';
  return '$' + (cents / 100).toFixed(2);
}

function StatusBadge({ status }) {
  const styles = {
    filed:    { bg: "#EEF3FB", color: "#1B3A6B", label: "Filed" },
    approved: { bg: "#E6F4ED", color: "#2E7D52", label: "Approved" },
    denied:   { bg: "#FEE8E7", color: "#C0392B", label: "Denied" },
    pending:  { bg: "#FFF8E6", color: "#7A5C10", label: "Pending" },
  };
  const s = styles[status] || styles.pending;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function LobBadge({ status }) {
  const map = {
    dispatched: { bg: "#E6F4ED", color: "#2E7D52", label: "Dispatched" },
    pending:    { bg: "#FFF8E6", color: "#7A5C10", label: "Pending" },
    delivered:  { bg: "#E6F4ED", color: "#2E7D52", label: "Delivered" },
    failed:     { bg: "#FEE8E7", color: "#C0392B", label: "Failed" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

export default function Admin() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [processResults, setProcessResults] = useState({});

  const fetchOrders = async (pw) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/get-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw || password }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setAuthenticated(false);
      } else {
        setOrders(data.orders || []);
        setStats(data.stats || {});
        setAuthenticated(true);
      }
    } catch (e) {
      setError('Failed to connect');
    }
    setLoading(false);
  };

  const handleLogin = () => {
    if (!password) return;
    fetchOrders(password);
  };

  const filteredOrders = orders.filter(o => {
    if (filter === 'approved' && o.outcome !== 'approved') return false;
    if (filter === 'denied' && o.outcome !== 'denied') return false;
    if (filter === 'pending' && o.outcome && o.outcome !== 'pending') return false;
    if (filter === 'filed' && o.dispute_status !== 'filed') return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.customer_email || '').toLowerCase().includes(q) ||
        (o.property_address || '').toLowerCase().includes(q) ||
        (o.county || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const queuedOrders = [...orders]
    .filter(o => o.dispute_status === 'queued')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const handleProcessNow = async (orderId) => {
    if (!confirm('Dispatch this order now? This will mail the letter immediately.')) return;
    setProcessingId(orderId);
    setProcessResults(prev => ({ ...prev, [orderId]: null }));
    try {
      const res = await fetch('/api/process-order-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, orderId }),
      });
      const data = await res.json();
      if (data.success) {
        setProcessResults(prev => ({ ...prev, [orderId]: { success: true, trackingNumber: data.trackingNumber } }));
        fetchOrders();
      } else {
        setProcessResults(prev => ({ ...prev, [orderId]: { success: false, error: data.error } }));
      }
    } catch (e) {
      setProcessResults(prev => ({ ...prev, [orderId]: { success: false, error: 'Request failed' } }));
    }
    setProcessingId(null);
  };

  return (
    <>
      <Head>
        <title>TaxAppeal Admin Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: ${C.mutedGray}; font-weight: 500; padding: 10px 14px; border-bottom: 1.5px solid ${C.border}; white-space: nowrap; }
        td { font-size: 13px; color: ${C.darkNavy}; padding: 12px 14px; border-bottom: 1px solid ${C.border}; vertical-align: middle; }
        tr:hover td { background: ${C.lightBlue}; }
        tr { cursor: pointer; }
        input:focus { outline: none; border-color: ${C.navy} !important; }
      `}</style>

      {/* Nav */}
      <div style={{ background: C.darkNavy, padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🏠</div>
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: C.white }}>TaxAppeal</div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Admin Dashboard</div>
          </div>
        </div>
        {authenticated && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => fetchOrders()} style={{ background: "transparent", border: `1px solid #3A4E6A`, borderRadius: 6, padding: "7px 14px", fontSize: 12, color: C.mutedGray, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>↻ Refresh</button>
            <a href="/" style={{ fontSize: 12, color: C.mutedGray, textDecoration: "none" }}>← Back to site</a>
          </div>
        )}
      </div>

      {!authenticated ? (
        /* Login */
        <div style={{ maxWidth: 400, margin: "120px auto", padding: "0 24px" }}>
          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "40px 36px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 8 }}>Admin Dashboard</h1>
            <p style={{ fontSize: 14, color: C.bodyGray, marginBottom: 24 }}>Enter your admin password to view orders.</p>
            {error && <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 6, padding: "9px 13px", fontSize: 12, color: C.red, marginBottom: 16 }}>{error}</div>}
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Admin password"
              style={{ width: "100%", padding: "12px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}
            />
            <button onClick={handleLogin} disabled={loading} style={{ width: "100%", background: C.navy, color: C.white, border: "none", borderRadius: 8, padding: "14px", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              {loading ? 'Checking...' : 'Sign in'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
          {/* Stats cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 14, marginBottom: 28 }}>
            {[
              ["Total Orders", stats?.totalOrders || 0, "📦", C.navy],
              ["Revenue", formatMoney(stats?.totalRevenue || 0), "💰", C.green],
              ["Est. Savings", stats?.totalSavings ? '$' + Number(stats.totalSavings).toLocaleString() : '$0', "📊", C.gold],
              ["Queued", queuedOrders.length, "🎟️", C.navy],
              ["Filed", stats?.filed || 0, "📬", "#1B3A6B"],
              ["Approved", stats?.approved || 0, "✓", C.green],
              ["Denied", stats?.denied || 0, "✗", C.red],
            ].map(([label, value, icon, color]) => (
              <div key={label} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: C.mutedGray }}>{label}</span>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                </div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Queued Pre-Orders */}
          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 28 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1.5px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: C.darkNavy }}>🎟️ Queued Pre-Orders</div>
              <div style={{ fontSize: 12, color: C.mutedGray }}>{queuedOrders.length} waiting on a filing window</div>
            </div>
            <table>
              <thead>
                <tr style={{ background: C.bg }}>
                  <th>Reserved</th>
                  <th>Customer</th>
                  <th>Property</th>
                  <th>State / County</th>
                  <th>Scheduled File Date</th>
                  <th>Opens In</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queuedOrders.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px", color: C.mutedGray }}>No queued pre-orders</td></tr>
                ) : (
                  queuedOrders.map(order => {
                    const daysUntil = order.scheduled_file_date ? Math.ceil((new Date(order.scheduled_file_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                    const result = processResults[order.id];
                    return (
                      <tr key={order.id} style={{ cursor: "default" }}>
                        <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatDate(order.created_at)}</td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{order.customer_name || '—'}</div>
                          <div style={{ fontSize: 11, color: C.mutedGray }}>{order.customer_email || '—'}</div>
                        </td>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.property_address || '—'}</td>
                        <td>{[order.state_code, order.county].filter(Boolean).join(' / ') || '—'}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{order.scheduled_file_date ? formatDate(order.scheduled_file_date) : '—'}</td>
                        <td style={{ whiteSpace: "nowrap", color: daysUntil !== null && daysUntil <= 0 ? C.green : C.bodyGray, fontWeight: daysUntil !== null && daysUntil <= 0 ? 700 : 400 }}>
                          {daysUntil === null ? '—' : daysUntil <= 0 ? 'Window open' : `${daysUntil} days`}
                        </td>
                        <td>
                          <button
                            onClick={() => handleProcessNow(order.id)}
                            disabled={processingId === order.id}
                            style={{ background: C.navy, color: C.white, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: processingId === order.id ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: processingId === order.id ? 0.6 : 1 }}
                          >
                            {processingId === order.id ? 'Processing…' : 'Process Now'}
                          </button>
                          {result && (
                            <div style={{ fontSize: 11, marginTop: 4, color: result.success ? C.green : C.red, maxWidth: 160 }}>
                              {result.success ? `✓ Filed${result.trackingNumber ? ' · ' + result.trackingNumber : ''}` : `✗ ${result.error}`}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Search and filters */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 16 }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, address, or county..."
              style={{ flex: 1, padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: C.white }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {['all', 'filed', 'approved', 'denied', 'pending'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ background: filter === f ? C.navy : C.white, color: filter === f ? C.white : C.bodyGray, border: `1.5px solid ${filter === f ? C.navy : C.border}`, borderRadius: 6, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textTransform: "capitalize" }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Orders table */}
          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <table>
              <thead>
                <tr style={{ background: C.bg }}>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Property</th>
                  <th>County</th>
                  <th>Assessed</th>
                  <th>Savings</th>
                  <th>Mail</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", padding: "40px", color: C.mutedGray }}>
                    {orders.length === 0 ? 'No orders yet' : 'No orders match your filter'}
                  </td></tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}>
                      <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatDate(order.created_at)}</td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{order.customer_name || '—'}</div>
                        <div style={{ fontSize: 11, color: C.mutedGray }}>{order.customer_email || '—'}</div>
                      </td>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.property_address || '—'}</td>
                      <td>{order.county || '—'}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{order.assessed_value ? '$' + Number(order.assessed_value).toLocaleString() : '—'}</td>
                      <td style={{ whiteSpace: "nowrap", color: C.green, fontWeight: 600 }}>{order.estimated_savings ? '$' + Number(order.estimated_savings).toLocaleString() : '—'}</td>
                      <td><LobBadge status={order.lob_status || 'pending'} /></td>
                      <td><StatusBadge status={order.outcome || order.dispute_status || 'filed'} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Order detail panel */}
          {selectedOrder && (
            <div style={{ background: C.white, border: `1.5px solid ${C.navy}`, borderRadius: 12, padding: "28px 32px", marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, marginBottom: 6 }}>ORDER DETAILS</div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy }}>{selectedOrder.customer_name}</div>
                  <div style={{ fontSize: 13, color: C.bodyGray, marginTop: 4 }}>{selectedOrder.customer_email}</div>
                </div>
                <button onClick={() => setSelectedOrder(null)} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: C.mutedGray }}>✕</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                {/* Property */}
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: C.mutedGray, marginBottom: 10, fontWeight: 500 }}>Property</div>
                  {[
                    ["Address", selectedOrder.property_address],
                    ["County", selectedOrder.county],
                    ["State", selectedOrder.state],
                    ["Assessed Value", selectedOrder.assessed_value ? '$' + Number(selectedOrder.assessed_value).toLocaleString() : '—'],
                    ["Market Value", selectedOrder.market_value ? '$' + Number(selectedOrder.market_value).toLocaleString() : '—'],
                    ["Target Reduction", selectedOrder.target_reduction ? '$' + Number(selectedOrder.target_reduction).toLocaleString() : '—'],
                    ["Reduction %", selectedOrder.reduction_pct ? selectedOrder.reduction_pct + '%' : '—'],
                    ["Est. Savings", selectedOrder.estimated_savings ? '$' + Number(selectedOrder.estimated_savings).toLocaleString() : '—'],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                      <span style={{ color: C.mutedGray }}>{label}</span>
                      <span style={{ color: C.darkNavy, fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Filing */}
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: C.mutedGray, marginBottom: 10, fontWeight: 500 }}>Filing</div>
                  {[
                    ["District", selectedOrder.district_name],
                    ["District Address", selectedOrder.district_address],
                    ["City/State/Zip", [selectedOrder.district_city, selectedOrder.district_state, selectedOrder.district_zip].filter(Boolean).join(', ')],
                    ["Lob Letter ID", selectedOrder.lob_letter_id],
                    ["Tracking #", selectedOrder.lob_tracking_number],
                    ["Mail Status", selectedOrder.lob_status],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, gap: 10 }}>
                      <span style={{ color: C.mutedGray, flexShrink: 0 }}>{label}</span>
                      <span style={{ color: C.darkNavy, fontWeight: 500, textAlign: "right", wordBreak: "break-all" }}>{val || '—'}</span>
                    </div>
                  ))}
                </div>

                {/* Payment & Status */}
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: C.mutedGray, marginBottom: 10, fontWeight: 500 }}>Payment & Outcome</div>
                  {[
                    ["Amount Paid", formatMoney(selectedOrder.amount_paid)],
                    ["Payment Status", selectedOrder.payment_status],
                    ["Stripe Session", selectedOrder.stripe_session_id?.slice(0, 20) + '...'],
                    ["Dispute Status", selectedOrder.dispute_status],
                    ["Outcome", selectedOrder.outcome || 'Awaiting response'],
                    ["Outcome Date", selectedOrder.outcome_reported_at ? formatDate(selectedOrder.outcome_reported_at) : '—'],
                    ["Actual Savings", selectedOrder.actual_savings ? '$' + Number(selectedOrder.actual_savings).toLocaleString() : '—'],
                    ["Filed", formatDate(selectedOrder.created_at)],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, gap: 10 }}>
                      <span style={{ color: C.mutedGray, flexShrink: 0 }}>{label}</span>
                      <span style={{ color: C.darkNavy, fontWeight: 500, textAlign: "right", wordBreak: "break-all" }}>{val || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order ID */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.mutedGray }}>
                Order ID: {selectedOrder.id}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: 32, fontSize: 12, color: C.mutedGray }}>
            Showing {filteredOrders.length} of {orders.length} orders · TaxAppeal Admin
          </div>
        </div>
      )}
    </>
  );
}
