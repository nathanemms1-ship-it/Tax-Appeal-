import { useState, useEffect } from 'react';
import Head from 'next/head';

const STATUS_CONFIG = {
  pending: {
    label: 'Under Review',
    color: '#D97706', bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.3)',
    icon: '⏳',
    description: 'Your certified mail dispute letter has been filed. Counties typically take 4–12 weeks to respond.'
  },
  filed: {
    label: 'Under Review',
    color: '#D97706', bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.3)',
    icon: '⏳',
    description: 'Your certified mail dispute letter has been filed. Counties typically take 4–12 weeks to respond.'
  },
  approved: {
    label: 'Approved ✓',
    color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)',
    icon: '🎉',
    description: 'Great news — your appeal was approved and your assessed value has been reduced!'
  },
  partial: {
    label: 'Partially Approved',
    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)',
    icon: '✅',
    description: 'Your appeal received a partial reduction in assessed value.'
  },
  denied: {
    label: 'Denied',
    color: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)',
    icon: '❌',
    description: 'Your appeal was denied by the county. No further action is required.'
  }
};

export default function Portal() {
  const [view, setView] = useState('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('portal_token');
    if (token) {
      fetchStatus(token);
    } else {
      setView('login');
    }
  }, []);

  const fetchStatus = async (token) => {
    try {
      const res = await fetch('/api/portal/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
        setView('dashboard');
      } else {
        localStorage.removeItem('portal_token');
        setView('login');
      }
    } catch {
      localStorage.removeItem('portal_token');
      setView('login');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('portal_token', data.token);
        setOrder(data.order);
        setView('dashboard');
      } else {
        setError(data.error || 'Invalid email or password.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('portal_token');
    setOrder(null);
    setEmail('');
    setPassword('');
    setView('login');
  };

  // Use actual column names: customer_name, customer_email
  const status = order ? (STATUS_CONFIG[order.dispute_status] || STATUS_CONFIG.filed) : null;
  const displaySavings = order?.savings_amount || order?.actual_savings || order?.estimated_savings || 0;

  const timelineSteps = order ? [
    {
      label: 'Order Placed',
      sublabel: 'Payment processed, letter generated',
      done: true,
      date: order.created_at
    },
    {
      label: 'Letter Mailed',
      sublabel: 'Certified mail dispatched via USPS',
      done: !!order.lob_letter_id,
      date: order.mailed_at
    },
    {
      label: 'Appeal Filed',
      sublabel: 'Dispute on record with county assessor',
      done: !!order.lob_letter_id,
      date: order.mailed_at
    },
    {
      label: order.dispute_status && !['pending','filed'].includes(order.dispute_status)
        ? 'Decision Received'
        : 'Awaiting Decision',
      sublabel: order.dispute_status && !['pending','filed'].includes(order.dispute_status)
        ? `County ruled: ${STATUS_CONFIG[order.dispute_status]?.label}`
        : 'Typical wait: 4–12 weeks',
      done: order.dispute_status && !['pending','filed'].includes(order.dispute_status),
      date: order.decision_date
    }
  ] : [];

  const formatDate = (d) => d
    ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const styles = {
    page: { minHeight: '100vh', background: '#0b1120', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#e2e8f0' },
    header: { borderBottom: '1px solid #1e293b', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a' },
    logo: { color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px' },
    card: { background: '#162032', border: '1px solid #1e293b', borderRadius: 16, padding: '28px 32px', marginBottom: 20 },
    label: { color: '#64748b', fontSize: 13, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' },
    input: { width: '100%', padding: '13px 16px', background: '#0b1120', border: '1px solid #1e293b', borderRadius: 10, color: '#e2e8f0', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
    btn: { width: '100%', padding: '14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' },
    outlineBtn: { background: 'none', border: '1px solid #1e293b', color: '#64748b', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }
  };

  if (view === 'loading') {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#334155' }}>Loading…</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Appeal Portal | TaxAppeal USA</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={styles.page}>
        <header style={styles.header}>
          <a href="/" style={styles.logo}><span style={{ color: '#22c55e' }}>Tax</span>Appeal USA</a>
          {view === 'dashboard' && (
            <button onClick={handleLogout} style={styles.outlineBtn}>Sign Out</button>
          )}
        </header>

        <main style={{ maxWidth: 640, margin: '0 auto', padding: '52px 20px 80px' }}>

          {/* LOGIN */}
          {view === 'login' && (
            <>
              <div style={{ marginBottom: 36 }}>
                <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.5px' }}>My Appeal Portal</h1>
                <p style={{ color: '#475569', margin: 0, fontSize: 16 }}>Track the status of your property tax dispute.</p>
              </div>
              <div style={styles.card}>
                {error && (
                  <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '13px 16px', borderRadius: 10, marginBottom: 24, fontSize: 14 }}>
                    {error}
                  </div>
                )}
                <form onSubmit={handleLogin}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ ...styles.label, display: 'block', marginBottom: 8 }}>Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required style={styles.input} />
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <label style={{ ...styles.label, display: 'block', marginBottom: 8 }}>Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={styles.input} />
                  </div>
                  <button type="submit" disabled={loading} style={{ ...styles.btn, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                    {loading ? 'Signing In…' : 'View My Appeal Status →'}
                  </button>
                </form>
              </div>
              <p style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 16 }}>
                Use the email & password you created when you filed.{' '}
                <a href="mailto:support@taxappealusa.com" style={{ color: '#22c55e', textDecoration: 'none' }}>Need help?</a>
              </p>
            </>
          )}

          {/* DASHBOARD */}
          {view === 'dashboard' && order && (
            <>
              <div style={{ marginBottom: 36 }}>
                <p style={{ color: '#22c55e', fontSize: 13, fontWeight: 600, margin: '0 0 6px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Appeal Portal</p>
                <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.4px' }}>
                  {order.customer_name ? `Welcome, ${order.customer_name.split(' ')[0]}` : 'Your Dispute'}
                </h1>
              </div>

              {/* Status Banner */}
              <div style={{ background: status.bg, border: `1px solid ${status.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ fontSize: 36, lineHeight: 1 }}>{status.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: status.color, color: '#fff', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                      {status.label}
                    </span>
                    {order.decision_date && (
                      <span style={{ color: '#475569', fontSize: 13 }}>{formatDate(order.decision_date)}</span>
                    )}
                  </div>
                  <p style={{ color: '#94a3b8', margin: 0, fontSize: 14, lineHeight: 1.6 }}>{status.description}</p>
                </div>
                {displaySavings > 0 && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Savings</div>
                    <div style={{ color: '#22c55e', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>${Number(displaySavings).toLocaleString()}</div>
                    <div style={{ color: '#475569', fontSize: 12 }}>/year</div>
                  </div>
                )}
              </div>

              {/* Decision Detail */}
              {order.decision_detail && (
                <div style={{ ...styles.card, borderLeft: `3px solid ${status.color}` }}>
                  <div style={{ ...styles.label, marginBottom: 10 }}>County Decision Summary</div>
                  <p style={{ color: '#cbd5e1', margin: 0, fontSize: 15, lineHeight: 1.7 }}>{order.decision_detail}</p>
                </div>
              )}

              {/* Property Details */}
              <div style={styles.card}>
                <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: '0 0 20px' }}>Property Details</h3>
                <div style={{ display: 'grid', gap: 14 }}>
                  {[
                    { label: 'Property Address', value: order.property_address },
                    { label: 'State', value: order.state },
                    { label: 'County', value: order.county },
                    { label: 'Assessed Value', value: order.assessed_value ? `$${Number(order.assessed_value).toLocaleString()}` : null },
                    { label: 'Filed', value: formatDate(order.created_at) },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <span style={{ color: '#475569', fontSize: 14, flexShrink: 0 }}>{row.label}</span>
                      <span style={{ color: '#cbd5e1', fontSize: 14, fontWeight: 500, textAlign: 'right' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline */}
              <div style={styles.card}>
                <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: '0 0 28px' }}>Appeal Timeline</h3>
                {timelineSteps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, marginBottom: i < timelineSteps.length - 1 ? 28 : 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: step.done ? '#22c55e' : '#1e293b', border: step.done ? '2px solid #22c55e' : '2px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', color: step.done ? '#fff' : '#334155', fontSize: 13, fontWeight: 700 }}>
                        {step.done ? '✓' : (i + 1)}
                      </div>
                      {i < timelineSteps.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 20, background: step.done ? '#22c55e' : '#1e293b', margin: '4px 0' }} />
                      )}
                    </div>
                    <div style={{ paddingTop: 4, paddingBottom: i < timelineSteps.length - 1 ? 8 : 0 }}>
                      <div style={{ color: step.done ? '#fff' : '#334155', fontSize: 15, fontWeight: 600, marginBottom: 3 }}>{step.label}</div>
                      <div style={{ color: '#475569', fontSize: 13 }}>{step.sublabel}</div>
                      {step.date && <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>{formatDate(step.date)}</div>}
                    </div>
                  </div>
                ))}
              </div>

              <p style={{ color: '#1e293b', fontSize: 13, textAlign: 'center', marginTop: 28 }}>
                Questions?{' '}
                <a href="mailto:support@taxappealusa.com" style={{ color: '#22c55e', textDecoration: 'none' }}>support@taxappealusa.com</a>
              </p>
            </>
          )}
        </main>
      </div>
    </>
  );
}
