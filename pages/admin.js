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

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

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

/**
 * THE PARTNER OPERATOR VIEW.
 *
 * Ordered by what costs money if you do not see it, not by what is interesting:
 *
 *   1. THE NUDGE LIST first, above everything, and only when it is non-empty.
 *      These partners have earned money we physically cannot send because Stripe
 *      payouts are not enabled on their account. Every name is real money owed and
 *      one email away from being deliverable. Buried below a roster, it would be
 *      found in December.
 *   2. Totals, so the number about to leave the balance on the 1st is never a surprise.
 *   3. The roster, so "who signed up and did they connect" has an answer that is not
 *      the Supabase table editor.
 *
 * Every figure comes from /api/partner-roster, which derives them through the same
 * settle() the settlement cron uses. Nothing here reads referrals.total_referrals or
 * referrals.total_paid — those columns are written at signup and never maintained.
 */
function StripeBadge({ stripe }) {
  const map = {
    active:        { bg: "#E6F4ED", color: "#2E7D52", label: "Payouts on" },
    pending:       { bg: "#FFF8E6", color: "#7A5C10", label: "Setup incomplete" },
    not_connected: { bg: "#FEE8E7", color: "#C0392B", label: "No bank" },
    error:         { bg: "#FEE8E7", color: "#C0392B", label: "Stripe error" },
    unknown:       { bg: "#EEF3FB", color: "#1B3A6B", label: "Unknown" },
  };
  const st = map[stripe?.status] || map.unknown;
  return (
    <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {st.label}
    </span>
  );
}

const REASON_LABELS = {
  fl_county_unconfirmed: 'FL county not confirmed',
  fl_no_parcel_record: 'FL no parcel record',
  window_or_state_not_open: 'Window closed / state not open',
};

/**
 * CAPTURED LEADS — the people the funnel refused.
 *
 * The county demand table is the point of this whole view. The call sheet ranks
 * Florida counties by population, which is a guess at demand; this ranks them by
 * homeowners who actually reached checkout and were turned away, which is demand
 * itself. Confirming a county both opens it for sale AND fires the "your county is
 * confirmed" email to everyone listed against it, so the number in that column is
 * exactly what the phone call is worth.
 */
function WaitlistView({ data, loading, error, onRetry }) {
  if (loading) {
    return <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 40, textAlign: "center", color: C.mutedGray, fontSize: 14 }}>Loading captured leads…</div>;
  }
  if (error) {
    return (
      <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 12, padding: "20px 24px" }}>
        <div style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>{error}</div>
        <button onClick={() => onRetry()} style={{ background: C.navy, color: C.white, border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Try again</button>
      </div>
    );
  }
  if (!data) return null;

  const card = { background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 20 };
  const th = { textAlign: "left", padding: "9px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", color: C.mutedGray, fontWeight: 500 };
  const td = { padding: "9px 12px", fontSize: 13, borderTop: `1px solid ${C.border}` };

  return (
    <>
      {data.truncated && (
        <div style={{ background: "#FEE8E7", border: "1.5px solid #F5C6C0", borderRadius: 12, padding: "14px 20px", marginBottom: 20, fontSize: 13, color: "#7f1d1d", lineHeight: 1.7 }}>
          <strong>These totals are understated.</strong> The read hit its {data.rowCap.toLocaleString()}-row ceiling, so
          everything below counts only the most recent {data.rowCap.toLocaleString()} entries. Raise <code>ROW_CAP</code> in{' '}
          <code>/api/waitlist-roster</code> before reading any of it as a total.
        </div>
      )}

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        {[['Captured, all time', data.totals.all], ['Last 7 days', data.totals.last7], ['Last 30 days', data.totals.last30]].map(([label, n]) => (
          <div key={label} style={{ ...card, flex: "1 1 180px", marginBottom: 0 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", color: C.mutedGray, marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: C.darkNavy }}>{n.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.darkNavy, marginBottom: 4 }}>
          Florida counties by homeowners waiting
        </div>
        <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.7, marginBottom: 14 }}>
          Only counties blocked on an unconfirmed fee or address — the ones a phone call fixes. Confirming a county
          opens it for sale <em>and</em> emails everyone listed here. Ring them in this order, not by population.
        </div>
        {data.flDemand.length === 0 ? (
          <div style={{ fontSize: 13, color: C.mutedGray }}>Nobody has been turned away on an unconfirmed county yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>County</th><th style={th}>Waiting</th><th style={th}>Added last 7 days</th></tr></thead>
            <tbody>
              {data.flDemand.map((c) => (
                <tr key={c.name}>
                  <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                  <td style={{ ...td, fontWeight: 600, color: C.navy }}>{c.count}</td>
                  <td style={td}>{c.last7 > 0 ? `+${c.last7}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(data.deadEnds.noParcelRecord > 0 || data.deadEnds.orphanedStates > 0) && (
        <div style={{ ...card, background: "#FFF8E6", border: "1.5px solid #E5C76B" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: C.darkNavy, marginBottom: 6 }}>
            {(data.deadEnds.noParcelRecord + data.deadEnds.orphanedStates).toLocaleString()} captured that nothing will ever contact
          </div>
          <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.8 }}>
            <strong>{data.deadEnds.noParcelRecord}</strong> with no parcel record. The notify cron skips every blocked
            reason as a catch-all and, unlike the county case, no branch ever clears this one — so these sit forever.
            <br />
            <strong>{data.deadEnds.orphanedStates}</strong> outside Texas, Georgia, Florida, Arkansas and Alabama
            {data.deadEnds.orphanedList.length > 0 && ` (${data.deadEnds.orphanedList.map((s) => `${s.name} ${s.count}`).join(', ')})`}.
            They have no filing window on file, so the cron skips them every run, and they carry the current filing year
            with no rollover. Both need a decision, not a log line.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        {[['Why they were refused', data.byReason.map((r) => ({ ...r, name: REASON_LABELS[r.name] || r.name }))],
          ['By state', data.byState],
          ['By filing year', data.byYear]].map(([label, list]) => (
          <div key={label} style={{ ...card, flex: "1 1 260px", marginBottom: 0 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", color: C.mutedGray, marginBottom: 10 }}>{label}</div>
            {list.length === 0 ? <div style={{ fontSize: 13, color: C.mutedGray }}>None</div> : list.map((r) => (
              <div key={r.name} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                <span style={{ color: C.bodyGray }}>{r.name}</span>
                <span style={{ fontWeight: 600, color: C.darkNavy }}>{r.count}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.darkNavy, marginBottom: 14 }}>
          Most recent {data.recent.length}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>When</th><th style={th}>Email</th><th style={th}>Property</th><th style={th}>County</th><th style={th}>Reason</th><th style={th}>Year</th></tr></thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: "nowrap", color: C.mutedGray }}>{formatDate(r.createdAt)}</td>
                  <td style={td}><a href={`mailto:${r.email}`} style={{ color: C.navy }}>{r.email}</a></td>
                  <td style={{ ...td, fontSize: 12, color: C.bodyGray }}>{r.propertyAddress || '—'}</td>
                  <td style={td}>{r.county ? `${r.county}, ${r.state}` : r.state}</td>
                  <td style={{ ...td, fontSize: 12 }}>{REASON_LABELS[r.reason] || (r.reason ? r.reason : 'Window / state not open')}</td>
                  <td style={td}>{r.filingYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function PartnersView({ data, loading, error, onRetry }) {
  if (loading) {
    return <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 40, textAlign: "center", color: C.mutedGray, fontSize: 14 }}>Loading partners…</div>;
  }
  if (error) {
    return (
      <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 12, padding: "20px 24px" }}>
        <div style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>{error}</div>
        <button onClick={() => onRetry()} style={{ background: C.navy, color: C.white, border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Try again</button>
      </div>
    );
  }
  if (!data) return null;

  const s = data.summary;
  const nudge = data.awaitingPayoutAccount || [];

  return (
    <>
      {/* 1. THE NUDGE LIST — money owed that no automated process will ever deliver. */}
      {nudge.length > 0 && (
        <div style={{ background: "#FEE8E7", border: "1.5px solid #F5C6C0", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: C.red, marginBottom: 6 }}>
            ${s.owedButUnpayable.toLocaleString()} owed to {nudge.length} partner{nudge.length === 1 ? '' : 's'} we cannot pay
          </div>
          <div style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.7, marginBottom: 14 }}>
            They have earned money and Stripe payouts are not enabled on their account, so the settlement run
            holds their orders over every month. Nothing will resolve this on its own — they need an email.
          </div>
          <table style={{ background: C.white, borderRadius: 8, overflow: "hidden" }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th>Partner</th><th>Email</th><th>Owed</th><th>Referrals</th><th>Stripe</th>
              </tr>
            </thead>
            <tbody>
              {nudge.map(p => (
                <tr key={p.code} style={{ cursor: "default" }}>
                  <td><div style={{ fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 11, color: C.mutedGray }}>{p.code}</div></td>
                  <td style={{ fontSize: 12 }}><a href={`mailto:${p.email}`} style={{ color: C.navy }}>{p.email}</a></td>
                  <td style={{ fontWeight: 600, color: C.red, whiteSpace: "nowrap" }}>${p.pending.toLocaleString()}</td>
                  <td>{p.pendingOrders}</td>
                  <td><StripeBadge stripe={p.stripe} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. Totals. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          ["Partners", s.partners, "🤝", C.navy],
          ["Bank connected", `${s.connected}/${s.partners}`, "🏦", s.connected === s.partners ? C.green : C.gold],
          ["With earnings", s.withEarnings, "✨", C.navy],
          ["Earned all-time", `$${s.totalEarned.toLocaleString()}`, "📊", C.navy],
          ["Paid out", `$${s.totalPaid.toLocaleString()}`, "✓", C.green],
          ["Pending", `$${s.totalPending.toLocaleString()}`, "⏳", s.totalPending > 0 ? C.gold : C.mutedGray],
        ].map(([label, value, icon, color]) => (
          <div key={label} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: C.mutedGray }}>{label}</span>
              <span style={{ fontSize: 16 }}>{icon}</span>
            </div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 3. The roster. */}
      <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1.5px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: C.darkNavy }}>Partner roster</div>
          <div style={{ fontSize: 12, color: C.mutedGray }}>${data.ratePerReferral} per completed referral</div>
        </div>
        <table>
          <thead>
            <tr style={{ background: C.bg }}>
              <th>Joined</th><th>Partner</th><th>Role / States</th><th>Stripe</th>
              <th>Referrals</th><th>Earned</th><th>Paid</th><th>Pending</th><th>Last paid</th>
            </tr>
          </thead>
          <tbody>
            {data.roster.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: C.mutedGray }}>
                No partners have signed up yet.
              </td></tr>
            ) : data.roster.map(p => (
              <tr key={p.code} style={{ cursor: "default", opacity: p.active ? 1 : 0.55 }}>
                <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatDate(p.joined)}</td>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}{!p.active && <span style={{ fontSize: 11, color: C.red }}> · inactive</span>}</div>
                  <div style={{ fontSize: 11, color: C.mutedGray }}>{p.email}</div>
                  <div style={{ fontSize: 11, color: C.mutedGray }}>{p.code}</div>
                </td>
                <td style={{ fontSize: 12, color: C.bodyGray }}>
                  <div>{(p.role || '—').replace(/_/g, ' ')}</div>
                  <div style={{ color: C.mutedGray }}>{p.statesActive || '—'}</div>
                </td>
                <td><StripeBadge stripe={p.stripe} /></td>
                <td>{p.earnedOrders}</td>
                <td style={{ whiteSpace: "nowrap" }}>${p.earned.toLocaleString()}</td>
                <td style={{ whiteSpace: "nowrap", color: C.green, fontWeight: 600 }}>${p.paid.toLocaleString()}</td>
                <td style={{ whiteSpace: "nowrap", color: p.pending > 0 ? C.gold : C.mutedGray, fontWeight: p.pending > 0 ? 600 : 400 }}>
                  ${p.pending.toLocaleString()}
                  {p.clawedBackOrders > 0 && <div style={{ fontSize: 10, color: C.red }}>{p.clawedBackOrders} clawed back</div>}
                </td>
                <td style={{ fontSize: 12, whiteSpace: "nowrap", color: C.mutedGray }}>{p.lastPaidAt ? formatDate(p.lastPaidAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Referred orders that did not count, programme-wide. A spike in self_referral
          is the one worth watching — it is the exploit the eligibility rules exist for. */}
      {data.notCounted && Object.keys(data.notCounted).length > 0 && (
        <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", marginTop: 16 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px", color: C.mutedGray, marginBottom: 10 }}>Referred orders that did not count</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {Object.entries(data.notCounted).map(([reason, count]) => (
              <div key={reason} style={{ fontSize: 13, color: C.bodyGray }}>
                <strong style={{ color: reason === 'self_referral' ? C.red : C.darkNavy }}>{count}</strong> {reason.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 32, fontSize: 12, color: C.mutedGray }}>
        {data.roster.length} partner{data.roster.length === 1 ? '' : 's'} · TaxAppeal Admin
      </div>
    </>
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

  // PARTNERS. Kept in its own state and fetched separately from orders: the roster
  // endpoint makes a Stripe call per connected partner, and that must never be able
  // to slow down or break the orders view, which is the one used every day.
  const [view, setView] = useState('orders');
  const [partnerData, setPartnerData] = useState(null);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState('');
  const [waitlistData, setWaitlistData] = useState(null);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');

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

  const fetchPartners = async (pw) => {
    setPartnersLoading(true);
    setPartnersError('');
    try {
      const res = await fetch('/api/partner-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw || password }),
      });
      const data = await res.json();
      if (data.error) setPartnersError(data.error);
      else setPartnerData(data);
    } catch (e) {
      setPartnersError('Failed to connect');
    }
    setPartnersLoading(false);
  };

  // Loaded on first visit to the tab rather than at login, so signing in to check an
  // order does not pay for a Stripe round-trip per partner.
  const showPartners = () => {
    setView('partners');
    if (!partnerData && !partnersLoading) fetchPartners();
  };

  const fetchWaitlist = async (pw) => {
    setWaitlistLoading(true);
    setWaitlistError('');
    try {
      const res = await fetch('/api/waitlist-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw || password }),
      });
      const data = await res.json();
      if (data.error) setWaitlistError(data.error);
      else setWaitlistData(data);
    } catch (e) {
      setWaitlistError('Failed to connect');
    }
    setWaitlistLoading(false);
  };

  const showWaitlist = () => {
    setView('waitlist');
    if (!waitlistData && !waitlistLoading) fetchWaitlist();
  };

  /**
   * Read a full petition on /apply without buying one.
   *
   * The blur on the preview is the paywall, and it is also why two real defects
   * survived until a mailed PDF proof exposed them on 12 Aug. The old way to lift
   * it — NEXT_PUBLIC_PREVIEW_UNBLURRED — unblurs for every visitor and has to be
   * remembered back off. This unlocks THIS browser for 8 hours and then lapses on
   * its own. Works for every state, not just Florida.
   */
  const [previewMsg, setPreviewMsg] = useState('');
  const togglePreview = async (unlock) => {
    setPreviewMsg('');
    try {
      const res = await fetch('/api/preview-unlock', {
        method: unlock ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        body: unlock ? JSON.stringify({ password }) : undefined,
      });
      const data = await res.json();
      setPreviewMsg(data.error ? `✗ ${data.error}` : `✓ ${data.note}`);
    } catch (e) {
      setPreviewMsg('✗ Failed to reach the server');
    }
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

  /**
   * `needs_review` orders belong in this panel — widened 11 Aug 2026.
   *
   * This filter was `=== 'queued'`, which meant an order that failed a mail attempt
   * and was written to `needs_review` vanished from the only screen an operator
   * looks at. It was also refused by /api/process-order-now, so a paid order could
   * end up with no route back into the system short of editing the row by hand.
   *
   * They sort to the top rather than by date: an order the system has already given
   * up on is more urgent than one still waiting for its window to open.
   */
  const DISPATCHABLE_STATUSES = ['queued', 'needs_review'];
  const queuedOrders = [...orders]
    .filter(o => DISPATCHABLE_STATUSES.includes(o.dispute_status))
    .sort((a, b) => {
      const aBad = a.dispute_status === 'needs_review' ? 0 : 1;
      const bBad = b.dispute_status === 'needs_review' ? 0 : 1;
      if (aBad !== bBad) return aBad - bBad;
      // Then a failing order ahead of a healthy one, then oldest first.
      const aErr = a.last_dispatch_error ? 0 : 1;
      const bErr = b.last_dispatch_error ? 0 : 1;
      if (aErr !== bErr) return aErr - bErr;
      return new Date(a.created_at) - new Date(b.created_at);
    });

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
            <button onClick={() => (view === 'partners' ? fetchPartners() : view === 'waitlist' ? fetchWaitlist() : fetchOrders())} style={{ background: "transparent", border: `1px solid #3A4E6A`, borderRadius: 6, padding: "7px 14px", fontSize: 12, color: C.mutedGray, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>↻ Refresh</button>
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
          {/* View switch. Partners were previously visible only by curling
              /api/referral-stats or opening the Supabase table editor. */}
          <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
            {[['orders', '📦 Orders'], ['partners', '🤝 Partners'], ['waitlist', '📋 Captured leads']].map(([key, label]) => (
              <button key={key} onClick={() => (key === 'partners' ? showPartners() : key === 'waitlist' ? showWaitlist() : setView('orders'))}
                style={{ background: view === key ? C.navy : C.white, color: view === key ? C.white : C.bodyGray, border: `1.5px solid ${view === key ? C.navy : C.border}`, borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                {label}
              </button>
            ))}
          </div>

          {view === 'orders' && (<>
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
                  {/* Added 11 Aug 2026. Every dispatch failure used to be a console
                      line in Vercel; this table showed a normal-looking row with a
                      button that returned the same error every hour. */}
                  <th>Dispatch</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queuedOrders.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", padding: "32px", color: C.mutedGray }}>No queued pre-orders</td></tr>
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
                        <td style={{ maxWidth: 260 }}>
                          {order.dispute_status === 'needs_review' && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 3 }}>NEEDS REVIEW</div>
                          )}
                          {order.dispatch_attempts ? (
                            <div style={{ fontSize: 11, color: order.dispatch_attempts >= 12 ? C.red : '#B7791F', fontWeight: 600 }}>
                              {order.dispatch_attempts} failed attempt{order.dispatch_attempts === 1 ? '' : 's'}
                              {order.dispatch_attempts >= 12 ? ' · parked, not retrying' : ''}
                            </div>
                          ) : null}
                          {order.last_dispatch_error ? (
                            <div title={order.last_dispatch_error} style={{ fontSize: 11, color: C.mutedGray, lineHeight: 1.4, marginTop: 2, maxHeight: 34, overflow: 'hidden' }}>
                              {order.last_dispatch_error}
                            </div>
                          ) : (!order.dispatch_attempts && order.dispute_status === 'queued' ? <span style={{ fontSize: 11, color: C.mutedGray }}>—</span> : null)}
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
          </>)}

          {view === 'partners' && (
            <PartnersView data={partnerData} loading={partnersLoading} error={partnersError} onRetry={fetchPartners} />
          )}

          {view === 'waitlist' && (
            <WaitlistView data={waitlistData} loading={waitlistLoading} error={waitlistError} onRetry={fetchWaitlist} />
          )}

          {/* Operator tools. Deliberately at the bottom and visually quiet — used
              rarely, and nothing here should compete with the order list. */}
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", color: C.mutedGray, marginBottom: 8 }}>Operator tools</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => togglePreview(true)}
                style={{ background: C.white, color: C.darkNavy, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                🔓 Unlock petition preview (8h)
              </button>
              <button onClick={() => togglePreview(false)}
                style={{ background: "transparent", color: C.mutedGray, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Re-blur
              </button>
              <span style={{ fontSize: 12, color: C.bodyGray }}>{previewMsg}</span>
            </div>
            <div style={{ fontSize: 12, color: C.mutedGray, marginTop: 8, lineHeight: 1.6, maxWidth: 640 }}>
              Shows the complete petition on <code>/apply</code> in <strong>this browser only</strong>, for any state,
              so a document can be reviewed without buying one. Customers are unaffected and it expires by itself.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
