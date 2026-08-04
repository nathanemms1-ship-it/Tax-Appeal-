import { useState, useEffect } from 'react';

/**
 * CONTACT MODAL — the "Need help? Contact us" button in the application header.
 *
 * That button used to be `mailto:support@taxappealusa.com`. Two things were wrong
 * with it: support@ does not exist in the GoDaddy account, and a mailto: link does
 * nothing at all on a phone or any machine without a mail client configured. A
 * customer stuck mid-funnel clicked it and got silence.
 *
 * Deliberately small: name, email, message. Nothing is stored anywhere — this
 * sends one email to customerservice@ and forgets. Capturing people who abandon
 * the funnel is a SEPARATE and better-targeted job, and it does not belong bolted
 * onto a help button.
 *
 * The plain address is shown inside the modal on purpose. If the API is down or
 * their JavaScript fails, the fallback has to be visible, or we have replaced one
 * dead end with another.
 */

const C = {
  navy: '#1B3A6B', darkNavy: '#0F1F3D', bodyGray: '#5A6B82', mutedGray: '#8596AF',
  border: '#E8EDF4', white: '#FFFFFF', green: '#2E7D52', red: '#C0392B',
};

const CONTACT_ADDRESS = 'customerservice@taxappealusa.com';

export default function ContactModal({ open, onClose, context }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot — see pages/api/contact.js
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [errorText, setErrorText] = useState('');

  // Prefill the email if the funnel already knows it, so someone who is stuck does
  // not have to retype something they entered two screens ago.
  useEffect(() => {
    if (open && context?.email && !email) setEmail(context.email);
  }, [open, context?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (!email.trim() || !message.trim()) {
      setErrorText('Please add your email address and a message.');
      setState('error');
      return;
    }
    setState('sending');
    setErrorText('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, company, context: context || {} }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorText(data.error || 'Something went wrong sending that.');
        setState('error');
        return;
      }
      setState('sent');
    } catch (e) {
      setErrorText('Could not reach our server.');
      setState('error');
    }
  };

  const inputStyle = {
    width: '100%', background: '#F8FAFD', border: '1.5px solid #DDE4EE', borderRadius: 7,
    padding: '10px 13px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    color: C.darkNavy, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = {
    display: 'block', fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase',
    color: C.bodyGray, fontWeight: 500, marginBottom: 6, fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: 12, padding: 28, width: '100%', maxWidth: 460,
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, margin: 0 }}>
            {state === 'sent' ? 'Message sent' : 'Need help?'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', fontSize: 22, lineHeight: 1, color: C.mutedGray, cursor: 'pointer', padding: 0 }}
          >
            &times;
          </button>
        </div>

        {state === 'sent' ? (
          <>
            <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, margin: '10px 0 20px' }}>
              Thanks — that came through. We&rsquo;ll reply to <strong style={{ color: C.darkNavy }}>{email}</strong> as
              soon as we can. You can close this and carry on where you left off.
            </p>
            <button
              onClick={onClose}
              style={{ background: C.navy, color: C.white, border: 'none', borderRadius: 8, padding: '13px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer', width: '100%' }}
            >
              Close
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13.5, color: C.bodyGray, lineHeight: 1.65, margin: '6px 0 20px' }}>
              Tell us what you&rsquo;re stuck on and we&rsquo;ll get back to you. Or email us directly at{' '}
              <a href={`mailto:${CONTACT_ADDRESS}`} style={{ color: C.navy }}>{CONTACT_ADDRESS}</a>.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Your name</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email address</label>
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={labelStyle}>How can we help?</label>
              <textarea
                style={{ ...inputStyle, minHeight: 110, resize: 'vertical', lineHeight: 1.6 }}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
              />
            </div>

            {/* Honeypot. Hidden from people, irresistible to bots. Not `display:none`
                — some bots skip those — but pushed off-screen and out of the tab order. */}
            <input
              type="text" name="company" value={company} onChange={(e) => setCompany(e.target.value)}
              tabIndex={-1} autoComplete="off" aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
            />

            {state === 'error' && (
              <div style={{ fontSize: 13, color: C.red, margin: '10px 0 0', lineHeight: 1.5 }}>
                {errorText} You can also email{' '}
                <a href={`mailto:${CONTACT_ADDRESS}`} style={{ color: C.red, fontWeight: 600 }}>{CONTACT_ADDRESS}</a>.
              </div>
            )}

            <button
              onClick={submit}
              disabled={state === 'sending'}
              style={{
                background: state === 'sending' ? '#C5D0E0' : C.navy, color: C.white, border: 'none',
                borderRadius: 8, padding: '13px 24px', fontSize: 14, fontWeight: 500,
                cursor: state === 'sending' ? 'not-allowed' : 'pointer', width: '100%', marginTop: 16,
              }}
            >
              {state === 'sending' ? 'Sending…' : 'Send message'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
