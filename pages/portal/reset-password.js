// pages/portal/reset-password.js
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function ResetPassword() {
  const router = useRouter();
  const { token, email } = router.query;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('form'); // form | loading | success | error
  const [error, setError] = useState('');

  const styles = {
    page: { minHeight: '100vh', background: '#0b1120', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#e2e8f0' },
    header: { borderBottom: '1px solid #1e293b', padding: '16px 28px', background: '#0f172a' },
    logo: { color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 20 },
    card: { background: '#162032', border: '1px solid #1e293b', borderRadius: 16, padding: '28px 32px', marginBottom: 20 },
    label: { color: '#64748b', fontSize: 13, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 8 },
    input: { width: '100%', padding: '13px 16px', background: '#0b1120', border: '1px solid #1e293b', borderRadius: 10, color: '#e2e8f0', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
    btn: { width: '100%', padding: '14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' },
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    if (!token || !email) return setError('Invalid reset link. Please request a new one.');

    setStatus('loading');
    try {
      const res = await fetch('/api/portal/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: decodeURIComponent(email), password })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
      } else {
        setError(data.error || 'This reset link has expired. Please request a new one.');
        setStatus('form');
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('form');
    }
  };

  return (
    <>
      <Head>
        <title>Reset Password | TaxAppeal USA</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={styles.page}>
        <header style={styles.header}>
          <a href="/" style={styles.logo}><span style={{ color: '#22c55e' }}>Tax</span>Appeal USA</a>
        </header>
        <main style={{ maxWidth: 480, margin: '0 auto', padding: '52px 20px 80px' }}>
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>Set New Password</h1>
            <p style={{ color: '#475569', margin: 0, fontSize: 15 }}>
              {email ? `Resetting password for ${decodeURIComponent(email)}` : 'Enter your new password below.'}
            </p>
          </div>

          {status === 'success' ? (
            <div style={styles.card}>
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ color: '#22c55e', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Password updated!</div>
                <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
                  Your password has been successfully reset. You can now log in to your appeal portal.
                </p>
                <a href="/portal" style={{ display: 'inline-block', padding: '13px 32px', background: '#22c55e', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
                  Go to Portal Login →
                </a>
              </div>
            </div>
          ) : (
            <div style={styles.card}>
              {error && (
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '13px 16px', borderRadius: 10, marginBottom: 24, fontSize: 14 }}>
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <label style={styles.label}>New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required style={styles.input} />
                </div>
                <div style={{ marginBottom: 28 }}>
                  <label style={styles.label}>Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat your new password" required style={styles.input} />
                </div>
                <button type="submit" disabled={status === 'loading'} style={{ ...styles.btn, opacity: status === 'loading' ? 0.6 : 1 }}>
                  {status === 'loading' ? 'Updating…' : 'Set New Password →'}
                </button>
              </form>
              <p style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                Need help? <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#22c55e', textDecoration: 'none' }}>customerservice@taxappealusa.com</a>
              </p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
