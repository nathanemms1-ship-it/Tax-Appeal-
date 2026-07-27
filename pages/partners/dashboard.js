// pages/partners/dashboard.js
// Partner-facing dashboard — auth via ?ref=CODE&email=EMAIL in URL
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const C = {
  navy: '#1B3A6B', gold: '#FFC940', darkNavy: '#0F1F3D', bg: '#F4F7FC',
  lightBlue: '#EEF3FB', bodyGray: '#5A6B82', mutedGray: '#8596AF',
  border: '#E8EDF4', white: '#FFFFFF', green: '#2E7D52', lightGreen: '#f0fdf4',
  red: '#C0392B',
};

const STATE_LABELS = { TX: 'Texas', FL: 'Florida', GA: 'Georgia', AR: 'Arkansas', AL: 'Alabama' };

function StatCard({ label, value, sub, highlight }) {
  return (
    <div style={{ background: highlight ? C.navy : C.white, border: `1px solid ${highlight ? C.navy : C.border}`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: highlight ? C.gold : C.mutedGray, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, color: highlight ? C.white : C.darkNavy, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: highlight ? '#8596AF' : C.mutedGray, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };
  return (
    <button onClick={copy} style={{ background: copied ? C.green : C.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', transition: 'background 0.2s' }}>
      {copied ? '✅ Copied!' : '📋 Copy link'}
    </button>
  );
}

function StripeStatusBadge({ stripe, refCode, email }) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/create-connect-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode, email }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else { alert('Could not start Stripe setup: ' + (data.error || 'Unknown error')); setLoading(false); }
    } catch (err) {
      alert('Connection error: ' + err.message);
      setLoading(false);
    }
  };

  if (stripe.status === 'active') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.lightGreen, border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px' }}>
        <span style={{ fontSize: 16 }}>✅</span>
        <span style={{ fontSize: 13, color: C.green, fontWeight: 500 }}>Bank account connected — payouts active</span>
      </div>
    );
  }

  if (stripe.status === 'pending') {
    return (
      <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '12px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#92400e', marginBottom: 6 }}>⏳ Stripe setup incomplete</div>
        <div style={{ fontSize: 12, color: '#78350f', marginBottom: 10 }}>Your Stripe account was created but bank details aren't verified yet. Complete setup to receive monthly payouts.</div>
        <button onClick={handleConnect} disabled={loading} style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
          {loading ? 'Redirecting...' : 'Complete Stripe Setup →'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.red, marginBottom: 6 }}>🏦 Connect your bank to get paid</div>
      <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 10 }}>You haven't connected a bank account yet. Without it, we can't send your monthly payouts. Takes about 2 minutes via Stripe.</div>
      <button onClick={handleConnect} disabled={loading} style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
        {loading ? 'Redirecting...' : 'Connect Bank Account via Stripe →'}
      </button>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonth(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function PartnerDashboard() {
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // loading | auth | ready | error
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [authForm, setAuthForm] = useState({ ref: '', email: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // On mount, try to load from URL params
  useEffect(() => {
    if (!router.isReady) return;
    const { ref, email } = router.query;
    if (ref && email) {
      loadStats(ref, email);
    } else {
      setStatus('auth');
    }
  }, [router.isReady, router.query]);

  async function loadStats(ref, email) {
    setStatus('loading');
    try {
      const res = await fetch(`/api/partner-stats?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`);
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'Could not load dashboard.');
        setStatus('auth');
        setAuthError(json.error || 'Invalid referral code or email address.');
        return;
      }
      setData(json);
      setStatus('ready');
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    if (!authForm.ref || !authForm.email) { setAuthError('Please enter both your referral code and email.'); return; }
    setAuthLoading(true);
    setAuthError('');
    await loadStats(authForm.ref.toUpperCase().trim(), authForm.email.trim());
    setAuthLoading(false);
  }

  return (
    <>
      <Head>
        <title>Partner Dashboard — TaxAppeal USA</title>
        <meta name="robots" content="noindex" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}
        @media(max-width:640px){.stats-grid{grid-template-columns:1fr 1fr!important;}.main-grid{grid-template-columns:1fr!important;}}
      `}</style>

      {/* Nav */}
      <div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: '14px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 32, height: 32, background: C.navy, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏠</div>
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: C.darkNavy }}>TaxAppeal USA</div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px', color: C.mutedGray }}>Partner Dashboard</div>
          </div>
        </a>
        {data && (
          <div style={{ fontSize: 13, color: C.bodyGray }}>
            👋 {data.partner.firstName || data.partner.name}
            <a href="/partners" style={{ marginLeft: 16, color: C.navy, textDecoration: 'none', fontSize: 12 }}>← Partners page</a>
          </div>
        )}
      </div>

      {/* Auth screen */}
      {status === 'auth' && (
        <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: '40px 36px', maxWidth: 420, width: '100%', border: `1px solid ${C.border}` }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔑</div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, marginBottom: 8 }}>Partner Dashboard</h1>
              <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.6 }}>Enter your referral code and email to view your stats.</p>
            </div>
            <form onSubmit={handleAuth}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: C.bodyGray, display: 'block', marginBottom: 6 }}>Referral Code</label>
                <input
                  value={authForm.ref}
                  onChange={e => setAuthForm(p => ({ ...p, ref: e.target.value }))}
                  placeholder="e.g. JANE-SMITH"
                  style={{ width: '100%', padding: '11px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', textTransform: 'uppercase' }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: C.bodyGray, display: 'block', marginBottom: 6 }}>Email Address</label>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="jane@smithrealty.com"
                  style={{ width: '100%', padding: '11px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                />
              </div>
              {authError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: C.red }}>{authError}</div>
              )}
              <button type="submit" disabled={authLoading} style={{ width: '100%', background: C.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '13px 24px', fontSize: 15, fontWeight: 500, cursor: authLoading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: authLoading ? 0.7 : 1 }}>
                {authLoading ? 'Loading...' : 'View My Dashboard →'}
              </button>
            </form>
            <p style={{ fontSize: 12, color: C.mutedGray, textAlign: 'center', marginTop: 16 }}>
              Not a partner yet? <a href="/partners" style={{ color: C.navy }}>Sign up here →</a>
            </p>
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {status === 'loading' && (
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: C.mutedGray, fontSize: 14 }}>Loading your dashboard…</div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={{ maxWidth: 500, margin: '80px auto', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: C.bodyGray, fontSize: 14, marginBottom: 20 }}>{errorMsg}</p>
          <button onClick={() => setStatus('auth')} style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 24px', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Try again</button>
        </div>
      )}

      {/* Dashboard */}
      {status === 'ready' && data && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 64px' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, marginBottom: 4 }}>
              Welcome back, {data.partner.firstName || data.partner.name} 👋
            </h1>
            <p style={{ fontSize: 14, color: C.bodyGray }}>Partner since {formatMonth(data.partner.memberSince)} · Code: <strong style={{ color: C.navy }}>{data.partner.code}</strong></p>
          </div>

          {/* Stats grid */}
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            <StatCard label="All-time referrals" value={data.allTime.referrals} sub={`$${data.allTime.earnings.toLocaleString()} earned total`} />
            <StatCard label={`${data.thisMonth.month} referrals`} value={data.thisMonth.referrals} sub={`$${data.thisMonth.earnings} pending payout`} highlight />
            <StatCard label={`${data.lastMonth.month}`} value={data.lastMonth.referrals} sub={`$${data.lastMonth.earnings} paid out`} />
            <StatCard label="Per referral" value="$20" sub="Paid 1st of each month" />
          </div>

          <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Referral link */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.darkNavy, marginBottom: 12 }}>Your referral link</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.bodyGray, wordBreak: 'break-all', minWidth: 0 }}>
                    {data.partner.referralLink}
                  </div>
                  <CopyButton text={data.partner.referralLink} />
                </div>
                <p style={{ fontSize: 12, color: C.mutedGray, marginTop: 10, lineHeight: 1.6 }}>
                  Share this link via text, email, or your email signature. Every homeowner who clicks it and completes their $89 filing earns you $20 — automatically tracked.
                </p>
              </div>

              {/* Stripe status */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.darkNavy, marginBottom: 12 }}>Payout account</div>
                <StripeStatusBadge stripe={data.stripe} refCode={data.partner.code} email={data.partner.email} />
                {data.stripe.status === 'active' && (
                  <p style={{ fontSize: 12, color: C.mutedGray, marginTop: 10, lineHeight: 1.6 }}>
                    Payouts are sent on the 1st of each month for the previous month's referrals. If you earn $600+ in a year, Stripe will issue a 1099-NEC automatically.
                  </p>
                )}
              </div>

              {/* Recent activity */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.darkNavy, marginBottom: 16 }}>Recent referrals</div>
                {data.recentActivity.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>📬</div>
                    <div style={{ fontSize: 14, color: C.bodyGray, marginBottom: 6 }}>No referrals yet</div>
                    <div style={{ fontSize: 12, color: C.mutedGray, lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
                      Share your referral link with homeowners in your network. Filing season opens August 11 for Florida — a great time to reach out.
                    </div>
                  </div>
                ) : (
                  <div>
                    {data.recentActivity.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < data.recentActivity.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <div>
                          <div style={{ fontSize: 13, color: C.darkNavy, fontWeight: 500 }}>
                            {STATE_LABELS[item.state] || item.state || 'Unknown'}{item.city ? ` — ${item.city}` : ''}
                          </div>
                          <div style={{ fontSize: 11, color: C.mutedGray, marginTop: 2 }}>{formatDate(item.date)}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.green }}>+${item.earnings}</div>
                      </div>
                    ))}
                    {data.allTime.referrals > 10 && (
                      <p style={{ fontSize: 12, color: C.mutedGray, marginTop: 12, textAlign: 'center' }}>Showing 10 most recent of {data.allTime.referrals} total referrals</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* State breakdown */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.darkNavy, marginBottom: 16 }}>Referrals by state</div>
                {Object.keys(data.byState).length === 0 ? (
                  <div style={{ fontSize: 13, color: C.mutedGray, textAlign: 'center', padding: '12px 0' }}>No referrals yet</div>
                ) : (
                  Object.entries(data.byState)
                    .sort((a, b) => b[1] - a[1])
                    .map(([state, count]) => {
                      const pct = data.allTime.referrals > 0 ? Math.round((count / data.allTime.referrals) * 100) : 0;
                      return (
                        <div key={state} style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: C.darkNavy }}>{STATE_LABELS[state] || state}</span>
                            <span style={{ fontSize: 13, color: C.bodyGray }}>{count} · ${count * 20}</span>
                          </div>
                          <div style={{ height: 6, background: C.bg, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: C.navy, borderRadius: 99 }} />
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Tip card */}
              <div style={{ background: C.navy, borderRadius: 14, padding: '24px 26px' }}>
                <div style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.gold, marginBottom: 10 }}>
                  {data.thisMonth.referrals === 0 ? '💡 Filing season tip' : '🔥 Keep the momentum'}
                </div>
                {data.thisMonth.referrals === 0 ? (
                  <>
                    <p style={{ fontSize: 13, color: '#8596AF', lineHeight: 1.7, marginBottom: 14 }}>
                      Florida's filing window opens <strong style={{ color: C.white }}>August 11</strong>. This week is the perfect time to reach out — homeowners are getting their TRIM notices right now.
                    </p>
                    <div style={{ background: '#0F1F3D', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#8596AF', lineHeight: 1.7, fontStyle: 'italic' }}>
                      "Your property tax notice just arrived — here's how to fight it for $89 flat: {data.partner.referralLink}"
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: '#8596AF', lineHeight: 1.7, marginBottom: 14 }}>
                      You've referred <strong style={{ color: C.white }}>{data.thisMonth.referrals} homeowner{data.thisMonth.referrals !== 1 ? 's' : ''}</strong> this month. Every referral you made earns $20 — paid on the 1st.
                    </p>
                    <p style={{ fontSize: 12, color: '#5A7A9F', lineHeight: 1.6 }}>
                      Remember: customers get a renewal reminder 11 months after filing. If they refile through your link, you earn another $20.
                    </p>
                  </>
                )}
              </div>

              {/* Share shortcuts */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.darkNavy, marginBottom: 12 }}>Quick share</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    {
                      label: '📧 Email template',
                      text: `Subject: Save money on your property taxes\n\nHey,\n\nYour property tax assessment notice is arriving soon — if you haven't looked at it, you might be overpaying. I use TaxAppeal USA for my clients. They prepare a formal protest letter with comparable sales data and file it via certified mail for $89 flat — no percentage of your savings.\n\nTakes about 4 minutes. Here's my link:\n${data.partner.referralLink}\n\nLet me know if you have questions.`,
                    },
                    {
                      label: '💬 Text message',
                      text: `Your property tax notice just arrived — worth protesting if you haven't. TaxAppeal USA files it for $89 flat, no % taken. Here's my link: ${data.partner.referralLink}`,
                    },
                  ].map(({ label, text }) => (
                    <button
                      key={label}
                      onClick={() => navigator.clipboard.writeText(text)}
                      style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.darkNavy, cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}
                    >
                      {label} <span style={{ color: C.mutedGray, fontWeight: 400 }}>— click to copy</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
        <div style={{ display: 'flex', gap: 16 }}>
          {[['Partners', '/partners'], ['File an appeal', '/apply'], ['Terms', '/terms']].map(([l, h]) => (
            <a key={h} href={h} style={{ color: C.mutedGray, fontSize: 12, textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
      </footer>
    </>
  );
}
