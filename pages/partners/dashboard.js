// pages/partners/dashboard.js
// Partner-facing dashboard — auth via ?ref=CODE&email=EMAIL in URL
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { FILING_WINDOWS } from '../../lib/filingWindows';

/**
 * Florida's opening date, read from the one table that decides it.
 *
 * This page hardcoded "August 11" in two places. lib/filingWindows.js moved FL to
 * 24 August — and these two strings did not, so the dashboard was telling partners
 * to start calling clients thirteen days before we could file anything for them.
 * That is the exact drift lib/filingWindows.js was created to end; the fix is to
 * read from it rather than to correct the copy and wait for the next move.
 */
const FL_OPEN_LABEL = (() => {
  const fw = FILING_WINDOWS.FL;
  if (!fw) return '';
  return new Date(2000, fw.openMonth - 1, fw.openDay)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
})();

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

/**
 * Plain-English versions of the exclusion reasons from lib/referralSettlement.js.
 *
 * Written for the partner, not for us. "payment_refunded" means nothing to a real
 * estate agent looking at a number that is smaller than they expected, and a partner
 * who cannot see WHY has no option except to email and ask.
 *
 * `self_referral` is worded as a rule rather than an accusation — the common case is
 * a partner testing their own link, not someone gaming us.
 */
const NOT_COUNTED_LABELS = {
  // Not a rejection — a delay. Worded so nobody reads it as money lost.
  too_recent: 'too recent to pay out yet — held until the refund window closes, then paid in the next run',
  unknown_referral_code: 'used a referral code we could not match',
  partner_inactive: 'placed while your partner account was inactive',
  self_referral: 'placed from your own email address — the program pays for clients you refer, not your own filings',
  already_settled: 'already paid out in an earlier run',
  no_payout_account: 'waiting on your bank connection',
  payment_unknown: 'started but never completed payment',
  payment_pending: 'payment still processing',
  payment_refunded: 'refunded to the customer',
  payment_failed: 'payment failed',
};

function describeNotCounted(reason) {
  if (String(reason).startsWith('payment_')) return 'not completed at checkout';
  return 'not eligible';
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
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
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

          {/* Stats grid
              EARNED, PAID and PENDING ARE THREE DIFFERENT NUMBERS. Keep them that way.

              This grid used to render `data.lastMonth.earnings` under the label
              "paid out" — a figure computed by multiplying a row count by 20, from a
              handler with no knowledge of whether any money had ever been sent. At
              the time there was no settlement run at all, so that caption was false
              for every partner who ever read it.

              /api/partner-stats now returns `paid` (rows in the payout ledger with a
              confirmed Stripe transfer) separately from `pending` (earned, not yet
              sent). Only `paid` may ever be captioned as paid. If you find yourself
              wanting a fallback like `data.paid?.amount ?? data.allTime.earnings`,
              that fallback is the original bug. */}
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            <StatCard
              label="All-time referrals"
              value={data.allTime.referrals}
              sub={`$${data.allTime.earnings.toLocaleString()} earned total`}
            />
            <StatCard
              label="Pending payout"
              value={`$${(data.pending?.amount ?? 0).toLocaleString()}`}
              sub={`${data.pending?.orders ?? 0} referral${(data.pending?.orders ?? 0) === 1 ? '' : 's'} awaiting the next run`}
              highlight
            />
            <StatCard
              label="Paid to date"
              value={`$${(data.paid?.amount ?? 0).toLocaleString()}`}
              sub={`${data.paid?.orders ?? 0} referral${(data.paid?.orders ?? 0) === 1 ? '' : 's'} sent to your bank`}
            />
            <StatCard
              label={`${data.thisMonth.month} referrals`}
              value={data.thisMonth.referrals}
              sub={`$${data.thisMonth.earnings} earned this month`}
            />
          </div>

          {/* Referrals withheld to offset an earlier one that was reversed. Shown
              explicitly: a pending total that quietly shrinks is the fastest way to
              lose a partner's trust, and this is the one number they are most likely
              to challenge. */}
          {(data.adjustments?.orders ?? 0) > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.red, marginBottom: 6 }}>
                ${data.adjustments.amount.toLocaleString()} adjustment
                {' '}({data.adjustments.orders} referral{data.adjustments.orders === 1 ? '' : 's'} withheld)
              </div>
              <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.7 }}>
                A referral you were already paid for was later refunded or charged back by the customer.
                Rather than ask you to send money back, we withheld the same amount from a later referral.
                Questions? Email <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.red }}>customerservice@taxappealusa.com</a>.
              </div>
            </div>
          )}

          {/* Why a referral they can see did not count. Without this the only person
              who can explain a gap between "orders I sent you" and "referrals shown"
              is us, by email, one partner at a time. */}
          {data.notCounted && Object.keys(data.notCounted).length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '14px 18px', marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#92400e', marginBottom: 6 }}>
                Some clicks on your link didn&apos;t become paid referrals
              </div>
              <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.7 }}>
                {Object.entries(data.notCounted).map(([reason, count]) => (
                  <div key={reason}>{count} × {NOT_COUNTED_LABELS[reason] || describeNotCounted(reason)}</div>
                ))}
                <div style={{ marginTop: 6 }}>
                  Questions about any of these? Email <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#92400e' }}>customerservice@taxappealusa.com</a>.
                </div>
              </div>
            </div>
          )}

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
                  Share this link via text, email, or your email signature. Every homeowner who clicks it and completes a paid filing earns you ${data.ratePerReferral ?? 20} — automatically tracked.
                </p>
              </div>

              {/* Stripe status */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.darkNavy, marginBottom: 12 }}>Payout account</div>
                <StripeStatusBadge stripe={data.stripe} refCode={data.partner.code} email={data.partner.email} />
                {data.stripe.status === 'active' && (
                  <p style={{ fontSize: 12, color: C.mutedGray, marginTop: 10, lineHeight: 1.6 }}>
                    Payouts run on the 1st of each month for the previous month&apos;s completed referrals.
                    {/* "Stripe will issue a 1099-NEC automatically" was stated as fact.
                        Whether it happens depends on Stripe tax reporting being
                        configured on the platform account, which is a setting, not a
                        law of nature — and if it is off, nobody files anything and the
                        partner finds out in April. Worded as what we will do, and the
                        partner is told to keep their own records either way. */}
                    {' '}Referral earnings are self-employment income and we do not withhold tax. If you receive $600 or more from us in a calendar year we will arrange the required 1099-NEC using the details you gave Stripe — keep your own record of what you receive regardless.
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
                      Share your referral link with homeowners in your network. Florida&apos;s filing season opens {FL_OPEN_LABEL} — a great time to reach out.
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
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: C.green }}>+${item.earnings}</div>
                          <div style={{ fontSize: 10, color: C.mutedGray, marginTop: 2 }}>{item.paid ? 'paid' : 'pending'}</div>
                        </div>
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
                            <span style={{ fontSize: 13, color: C.bodyGray }}>{count} · ${count * (data.ratePerReferral ?? 20)}</span>
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
                      Florida&apos;s filing window opens <strong style={{ color: C.white }}>{FL_OPEN_LABEL}</strong>. Now is a good time to reach out — homeowners are getting their TRIM notices.
                    </p>
                    <div style={{ background: '#0F1F3D', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#8596AF', lineHeight: 1.7, fontStyle: 'italic' }}>
                      {/* "$89 flat" is true in Texas and Georgia and FALSE in Florida,
                          where the county's mandatory VAB filing fee ($15–$50, set by
                          statute per county) is charged on top — see pages/florida.js
                          and lib/flCountyFees.js. This card appears during the Florida
                          season, so the flat-fee wording was wrong precisely when it
                          was shown most. */}
                      &ldquo;Your property tax notice just arrived — here&apos;s how to appeal it. $89 plus your county&apos;s filing fee, no percentage of your savings: {data.partner.referralLink}&rdquo;
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: '#8596AF', lineHeight: 1.7, marginBottom: 14 }}>
                      You&apos;ve referred <strong style={{ color: C.white }}>{data.thisMonth.referrals} homeowner{data.thisMonth.referrals !== 1 ? 's' : ''}</strong> this month, worth ${data.thisMonth.earnings}. It goes out in the settlement run on the 1st{data.stripe.status === 'active' ? '' : ' — once your bank account is connected'}.
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
                      // Templates a partner sends to THEIR clients under their own name.
                      // A price we overstate here is a price they get held to.
                      text: `Subject: Your property tax assessment\n\nHey,\n\nYour property tax assessment notice is arriving soon — if you haven't looked at it, you might be overpaying. I use TaxAppeal USA for my clients. They prepare a formal appeal with comparable sales data, you sign it, and they mail it for you. $89 plus your county's filing fee if there is one — no percentage of your savings.\n\nTakes about 4 minutes. Here's my link:\n${data.partner.referralLink}\n\nLet me know if you have questions.`,
                    },
                    {
                      label: '💬 Text message',
                      text: `Your property tax notice just arrived — worth appealing if you haven't. TaxAppeal USA prepares and mails it: $89 plus the county filing fee, no % taken. Here's my link: ${data.partner.referralLink}`,
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
