import { useState } from 'react';
import Head from 'next/head';

/**
 * WAITLIST MODE.
 *
 * Rendered in place of the apply funnel whenever sales are paused
 * (NEXT_PUBLIC_SALES_ENABLED !== 'true'). See lib/salesGate.js for the reasoning
 * and for the server-side gate that is the one that actually stops a charge.
 *
 * WHY THIS LIVES AT /apply RATHER THAN A NEW /waitlist ROUTE
 * ---------------------------------------------------------
 * Every call to action on the site — the homepage, /florida, 131 Florida city
 * pages, 572 county pages, and the metro landing pages — already points at
 * /apply. Putting the waitlist here means all of them lead somewhere honest
 * without editing a single one of those files. A bulk edit across 200+ marketing
 * pages is exactly the change that deleted the hero from three landing pages in
 * round 6, and it is not a risk worth taking to save one redirect.
 *
 * The buttons still SAY "File My Appeal". That is imprecise rather than false —
 * they lead to a page that explains plainly that filing has not opened. The
 * banner in _app.js says so before the click.
 *
 * HONESTY CONSTRAINTS THIS PAGE HAS TO MEET
 * -----------------------------------------
 * - It must not imply a date we cannot commit to. "Soon" and "we will email you",
 *   never "filing opens August 24" — the county calls are not finished and
 *   Broward's fee is still unknown.
 * - It must state the price as what it WILL be, not as something being sold now.
 * - It must not collect payment details of any kind.
 */

const C = {
  navy: '#1B3A6B', darkNavy: '#0F1F3D', gold: '#FFC940', bg: '#F4F7FC',
  white: '#FFFFFF', border: '#E8EDF4', body: '#5A6B82', muted: '#8596AF', green: '#2E7D52',
};

// All five advertised states. The funnel only sells TX/GA/FL, but the waitlist
// should capture Arkansas and Alabama demand rather than turn it away — those
// pages are live and taking traffic.
const STATES = [
  { code: 'FL', name: 'Florida' },
  { code: 'TX', name: 'Texas' },
  { code: 'GA', name: 'Georgia' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'AL', name: 'Alabama' },
];

export default function WaitlistForm() {
  const [form, setForm] = useState({ name: '', email: '', state: '', county: '', propertyAddress: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | done | duplicate | error
  const [errorMsg, setErrorMsg] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const canSubmit = form.email.trim() && form.state && status !== 'sending';

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/join-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          name: form.name.trim(),
          state: form.state,
          county: form.county.trim(),
          propertyAddress: form.propertyAddress.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 429 from the rate limiter reads as a server error otherwise, which is
        // confusing for someone who just double-clicked the button.
        setErrorMsg(res.status === 429
          ? 'Too many attempts just now — give it a minute and try again.'
          : (data.error || 'Something went wrong. Please try again.'));
        setStatus('error');
        return;
      }
      setStatus(data.duplicate ? 'duplicate' : 'done');
    } catch (err) {
      setErrorMsg('Could not reach the server. Please try again.');
      setStatus('error');
    }
  };

  const input = {
    width: '100%', padding: '13px 14px', fontSize: 15, borderRadius: 8,
    border: `1.5px solid ${C.border}`, background: C.white, color: C.darkNavy,
    fontFamily: 'inherit', outline: 'none',
  };
  const label = { display: 'block', fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 6 };
  const field = { marginBottom: 18 };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: C.darkNavy }}>
      <Head>
        <title>Join the Waitlist | TaxAppeal USA</title>
        <meta name="description" content="TaxAppeal USA is not filing yet. Join the waitlist and we will email you the moment filing opens in your state. Flat $89 service fee plus your county's filing fee when we launch — no percentage of your savings, ever." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href="https://www.taxappealusa.com/apply" key="canonical" />
      </Head>

      {/* dangerouslySetInnerHTML, not a text child.
          React escapes text children, so the apostrophes in @import url('...')
          became &#x27; in the server HTML and stayed literal on the client. The
          two strings differ, React reports "Text content does not match
          server-rendered HTML", and the dev overlay covers the whole page. The
          CSS is a constant in this file, not user input. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');
        /* width:100% plus 14px of padding and a 1.5px border on content-box made every
           control 31px wider than the form, which pushed the AR and AL county pages
           into a horizontal scroll on a phone. Nothing here inherits a reset: this
           component ships its own stylesheet. */
        .wl-wrap input, .wl-wrap select, .wl-wrap button, .wl-wrap textarea { box-sizing: border-box; }
        input:focus, select:focus { border-color: ${C.navy} !important; }
        .wl-wrap { max-width: 640px; margin: 0 auto; padding: 48px 24px 80px; }
        @media (max-width: 640px) { .wl-wrap { padding: 32px 18px 64px; } }
      ` }} />

      <div className="wl-wrap">
        <a href="/" style={{ color: C.navy, fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>← TaxAppeal USA</a>

        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, lineHeight: 1.2, margin: '22px 0 14px' }}>
          We&apos;re not filing yet — join the waitlist
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: C.body, marginBottom: 14 }}>
          TaxAppeal USA will begin filing property tax appeals soon. We&apos;re finishing
          verification with county boards before we take a single order, because a petition
          that arrives at the wrong office, with the wrong fee, or after a deadline costs a
          homeowner their entire appeal year. We would rather be late than be the reason
          that happens.
        </p>
        <p style={{ fontSize: 17, lineHeight: 1.65, color: C.body, marginBottom: 28 }}>
          Leave your details and we&apos;ll email you the moment filing opens in your state —
          well before your deadline, with enough time to file comfortably.
        </p>

        {(status === 'done' || status === 'duplicate') ? (
          <div style={{ background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 12, padding: '28px 26px' }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>✓</div>
            <h2 style={{ fontSize: 21, marginBottom: 10, color: C.navy }}>
              {status === 'duplicate' ? 'You’re already on the list' : 'You’re on the list'}
            </h2>
            <p style={{ fontSize: 15.5, lineHeight: 1.65, color: C.body, marginBottom: 12 }}>
              We&apos;ll email <strong>{form.email.trim()}</strong> when TaxAppeal USA goes live
              in {STATES.find((s) => s.code === form.state)?.name || 'your state'}. Nothing to
              pay now, and nothing else to do — we&apos;ll come to you.
            </p>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted }}>
              We send at most a few emails per season and every one carries an unsubscribe link.
              We won&apos;t sell or share your address.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '28px 26px' }}>
            <div style={field}>
              <label style={label} htmlFor="wl-email">Email address <span style={{ color: '#C0392B' }}>*</span></label>
              <input id="wl-email" style={input} type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
            </div>

            <div style={field}>
              <label style={label} htmlFor="wl-state">State <span style={{ color: '#C0392B' }}>*</span></label>
              <select id="wl-state" style={input} required value={form.state} onChange={set('state')}>
                <option value="">Select your state</option>
                {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>

            <div style={field}>
              <label style={label} htmlFor="wl-name">Your name</label>
              <input id="wl-name" style={input} type="text" value={form.name} onChange={set('name')} placeholder="Optional" autoComplete="name" />
            </div>

            <div style={field}>
              <label style={label} htmlFor="wl-county">County</label>
              <input id="wl-county" style={input} type="text" value={form.county} onChange={set('county')} placeholder="Optional — helps us tell you your exact deadline" />
            </div>

            <div style={field}>
              <label style={label} htmlFor="wl-address">Property address</label>
              <input id="wl-address" style={input} type="text" value={form.propertyAddress} onChange={set('propertyAddress')} placeholder="Optional — so we can have your details ready" autoComplete="street-address" />
            </div>

            {status === 'error' && (
              <div style={{ background: '#FCEDEA', border: '1px solid #E9B5AB', borderRadius: 8, padding: '11px 13px', fontSize: 14, color: '#C0392B', marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '16px 24px', fontSize: 16.5, fontWeight: 600,
                borderRadius: 8, border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
                background: canSubmit ? C.gold : '#DCE3EE',
                color: canSubmit ? C.darkNavy : C.muted,
                fontFamily: 'inherit',
              }}
            >
              {status === 'sending' ? 'Adding you…' : 'Join the waitlist'}
            </button>

            <p style={{ fontSize: 13, color: C.muted, marginTop: 13, lineHeight: 1.6 }}>
              No payment now, and no card details are collected on this page.
            </p>
          </form>
        )}

        <div style={{ marginTop: 34, paddingTop: 26, borderTop: `1px solid ${C.border}` }}>
          <h2 style={{ fontSize: 18, color: C.navy, marginBottom: 12 }}>What it will cost when we launch</h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.65, color: C.body, marginBottom: 12 }}>
            A flat <strong>$89</strong> service fee, plus your county&apos;s own filing fee where
            one applies — in Florida that is set by each county and runs roughly $15 to $50, and
            we pay it to the board on your behalf rather than asking you to make a separate trip
            or write a second check.
          </p>
          <p style={{ fontSize: 15.5, lineHeight: 1.65, color: C.body, marginBottom: 12 }}>
            We never take a percentage of your savings. Every dollar a reduction saves you stays
            yours, that year and every year after it.
          </p>
          <p style={{ fontSize: 15.5, lineHeight: 1.65, color: C.body }}>
            You sign your own petition — we prepare the document, you read it and sign it, and we
            mail it to the right office before your deadline. TaxAppeal USA is not your
            representative, does not appear before the board, and cannot promise a result.
          </p>
        </div>
      </div>
    </div>
  );
}
