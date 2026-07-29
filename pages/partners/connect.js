// pages/partners/connect.js
// Auto-redirect page called from welcome email "Connect Bank Account" link
// URL: /partners/connect?ref=AGENT-CODE&email=agent@email.com
// Immediately calls /api/create-connect-account and redirects to Stripe

import { useEffect, useState } from 'react';
import Head from 'next/head';

export default function PartnersConnect() {
  const [status, setStatus] = useState('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || '';
    const email = params.get('email') || '';
    const name = params.get('name') || '';

    if (!ref) {
      setStatus('error');
      setErrorMsg('Missing referral code. Please return to the partners page and try again.');
      return;
    }

    fetch('/api/create-connect-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refCode: ref, email, name }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          setStatus('error');
          setErrorMsg(data.error || 'Could not start Stripe setup. Please try again.');
        }
      })
      .catch(err => {
        setStatus('error');
        setErrorMsg('Connection error: ' + err.message);
      });
  }, []);

  const navy = '#1B3A6B';

  return (
    <>
      <Head>
        <title>Setting Up Payouts — TaxAppeal USA</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#F4F7FC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '48px 40px', maxWidth: 420, width: '100%', textAlign: 'center', border: '0.5px solid #E8EDF4' }}>

          {status === 'connecting' && (
            <>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>
                🔗
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 500, color: navy, margin: '0 0 12px' }}>
                Connecting to Stripe
              </h1>
              <p style={{ fontSize: 15, color: '#5A6B82', lineHeight: 1.7, margin: '0 0 24px' }}>
                Setting up your payout account — you will be redirected to Stripe in a moment.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: navy, opacity: 0.5 }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: navy, opacity: 0.3 }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: navy, opacity: 0.2 }} />
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>
                ⚠️
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 500, color: navy, margin: '0 0 12px' }}>
                Something went wrong
              </h1>
              <p style={{ fontSize: 14, color: '#5A6B82', lineHeight: 1.7, margin: '0 0 24px' }}>
                {errorMsg}
              </p>
              <a href="/partners" style={{ display: 'inline-block', background: navy, color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 500 }}>
                Back to Partners Page
              </a>
            </>
          )}

        </div>
      </div>
    </>
  );
}
