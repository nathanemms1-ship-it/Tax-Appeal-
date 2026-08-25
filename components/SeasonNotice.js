import { useState } from 'react';
import { stateSaleStatus } from '../lib/stateService';

/**
 * WHAT A STATE PAGE SHOWS INSTEAD OF A PRICE, WHEN WE ARE NOT SELLING THAT STATE.
 *
 * Drops in wherever an "$89" button used to be on /arkansas, /alabama and their
 * city pages. Renders nothing at all for a state we DO sell — so a page can wrap
 * its real CTA in `{status.selling ? <button/> : <SeasonNotice/>}` and the day
 * SERVING_FROM loses that state's line, every one of those pages sells again with
 * no copy edit. See lib/stateService.js for why that indirection is the point.
 *
 * WHY IT CAPTURES HERE RATHER THAN SENDING THEM TO /apply.
 * /apply already tells the truth — UnsupportedState is honest, saves on mount and
 * promises only what it can keep. The problem was never that screen, it was the
 * distance to it: a homeowner had to create an account with a password and type
 * their full property address before anything mentioned that Alabama is closed
 * until 2027. Two forms, then the truth. One email field on the page they landed
 * on collects the same thing that screen would have, at the moment they are
 * actually interested, and costs them nothing if they walk away.
 *
 * It posts the same {email, state} to /api/join-waitlist, which stamps
 * filing_year from waitlistFilingYear() — so cron/notify-waitlist.js will not
 * email these people "your window is open" during a season we have declined to
 * file in. That was already true for AR and AL via a hardcoded branch in the
 * route; it is now true because both ends read the same map.
 */

const C = {
  navy: '#1B3A6B', darkNavy: '#0F1F3D', gold: '#FFC940', bg: '#F4F7FC',
  white: '#FFFFFF', border: '#E8EDF4', body: '#5A6B82', muted: '#8596AF',
  green: '#2E7D52', red: '#C0392B',
};

export default function SeasonNotice({ stateCode, id = 'notify', variant = 'light', compact = false }) {
  const status = stateSaleStatus(stateCode);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | duplicate | error
  const [errorMsg, setErrorMsg] = useState('');

  // A state we sell renders nothing. Callers are expected to show their own CTA;
  // returning null rather than a fallback keeps this component from ever being
  // the thing that decides what a selling page looks like.
  if (status.selling) return null;

  const dark = variant === 'dark';
  const fg = dark ? C.white : C.darkNavy;
  const sub = dark ? 'rgba(255,255,255,0.72)' : C.body;
  const panelBg = dark ? 'rgba(255,255,255,0.07)' : C.white;
  const panelBorder = dark ? 'rgba(255,255,255,0.18)' : C.border;

  const submit = async (e) => {
    e.preventDefault();
    const mail = email.trim();
    const property = address.trim();
    if (!mail || state === 'sending') return;
    setState('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/join-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // propertyAddress is what makes the eventual email worth opening — see the
        // note above the address field. Omitted rather than sent empty, so a blank
        // never overwrites an address an earlier signup already gave us.
        body: JSON.stringify({ email: mail, state: status.code, ...(property ? { propertyAddress: property } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(res.status === 429
          ? 'Too many attempts just now — give it a minute and try again.'
          : (data.error || 'Something went wrong. Please try again.'));
        setState('error');
        return;
      }
      setState(data.duplicate ? 'duplicate' : 'done');
    } catch (err) {
      setErrorMsg('Could not reach the server. Please try again.');
      setState('error');
    }
  };

  const done = state === 'done' || state === 'duplicate';

  return (
    <div
      id={id}
      style={{
        background: panelBg,
        border: `1.5px solid ${panelBorder}`,
        borderRadius: 14,
        padding: compact ? '20px 20px' : '28px 26px',
        maxWidth: 520,
        margin: '0 auto',
        textAlign: 'left',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {!compact && (
        <>
          <div style={{ fontSize: 30, marginBottom: 10, lineHeight: 1 }}>📬</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 23, color: fg, marginBottom: 10, lineHeight: 1.25 }}>
            {status.heading}
          </h2>
        </>
      )}

      <p style={{ fontSize: 15, lineHeight: 1.65, color: sub, marginBottom: done ? 0 : 18 }}>
        {done
          ? <>We&rsquo;ll email <strong style={{ color: fg }}>{email.trim()}</strong> {status.promise}{address.trim() ? <> We have <strong style={{ color: fg }}>{address.trim()}</strong> on file and will check it before we write.</> : null} Nothing to pay now, and nothing else to do.</>
          : status.body}
      </p>

      {!done && (
        <form onSubmit={submit}>
          <label
            htmlFor={`${id}-email`}
            style={{ display: 'block', fontSize: 13, fontWeight: 600, color: dark ? 'rgba(255,255,255,0.85)' : C.navy, marginBottom: 6 }}
          >
            Your email address
          </label>
          <input
            id={`${id}-email`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            style={{
              width: '100%', padding: '13px 14px', fontSize: 16, borderRadius: 8,
              border: `1.5px solid ${dark ? 'rgba(255,255,255,0.25)' : C.border}`,
              background: dark ? 'rgba(255,255,255,0.06)' : C.white,
              color: fg, fontFamily: 'inherit', outline: 'none', marginBottom: 14,
            }}
          />

          {/**
            * THE ADDRESS IS THE POINT OF THE CAPTURE, NOT AN EXTRA.
            *
            * cron/notify-waitlist.js already renders a "Your Property 📍 …" panel in
            * the opening email when the row has one. Without an address the email we
            * eventually send is "your state is open, go and file" addressed to
            * nobody's house in particular; with one it names their property back to
            * them, and it is the thing that lets us check their assessment before we
            * write rather than after they click.
            *
            * OPTIONAL, DELIBERATELY. Requiring it puts a second field between a
            * stranger and the only thing they came here to do, on a page that is
            * asking them to wait a year. The email alone still keeps the promise;
            * the address makes the promise worth keeping. Anyone who leaves it blank
            * can add it when we write to them.
            *
            * A plain input rather than components/AddressAutocomplete: that
            * component is backed by our Florida parcels table and only ever suggests
            * a property we hold a roll for. We hold no roll for Arkansas or Alabama,
            * so it would suggest nothing here and quietly look broken.
            * autoComplete="street-address" hands the work to the browser's own saved
            * address, which is the larger lever anyway — see the note in that file.
            */}
          <label
            htmlFor={`${id}-address`}
            style={{ display: 'block', fontSize: 13, fontWeight: 600, color: dark ? 'rgba(255,255,255,0.85)' : C.navy, marginBottom: 6 }}
          >
            Your property address <span style={{ fontWeight: 400, color: dark ? 'rgba(255,255,255,0.5)' : C.muted }}>— optional</span>
          </label>
          <input
            id={`${id}-address`}
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={`123 Main St, ${status.name}`}
            autoComplete="street-address"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="go"
            style={{
              width: '100%', padding: '13px 14px', fontSize: 16, borderRadius: 8,
              border: `1.5px solid ${dark ? 'rgba(255,255,255,0.25)' : C.border}`,
              background: dark ? 'rgba(255,255,255,0.06)' : C.white,
              color: fg, fontFamily: 'inherit', outline: 'none', marginBottom: 6,
            }}
          />
          <p style={{ fontSize: 12.5, color: dark ? 'rgba(255,255,255,0.5)' : C.muted, margin: '0 0 12px', lineHeight: 1.55 }}>
            Give us this and we will have looked at your assessment before we write.
          </p>

          {state === 'error' && (
            <div style={{ background: '#FCEDEA', border: '1px solid #E9B5AB', borderRadius: 8, padding: '11px 13px', fontSize: 14, color: C.red, marginBottom: 12 }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={state === 'sending'}
            style={{
              width: '100%', padding: '15px 22px', fontSize: 16, fontWeight: 600,
              borderRadius: 8, border: 'none', cursor: state === 'sending' ? 'not-allowed' : 'pointer',
              background: C.gold, color: C.darkNavy, fontFamily: 'inherit',
            }}
          >
            {state === 'sending' ? 'Adding you…' : `Email me when ${status.name} opens`}
          </button>

          <p style={{ fontSize: 12.5, color: dark ? 'rgba(255,255,255,0.5)' : C.muted, marginTop: 11, lineHeight: 1.6 }}>
            No payment, and no card details are collected on this page. Every email we send carries an unsubscribe link.
          </p>
        </form>
      )}
    </div>
  );
}

/**
 * The one-line version for a sticky nav, where a form does not fit.
 * Renders nothing for a state we sell, same contract as the panel.
 */
export function SeasonNavCta({ stateCode, href = '#notify', style = {} }) {
  const status = stateSaleStatus(stateCode);
  if (status.selling) return null;
  return (
    <a
      href={href}
      style={{
        display: 'inline-block', background: C.gold, color: C.darkNavy,
        borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500,
        textDecoration: 'none', fontFamily: 'inherit', ...style,
      }}
    >
      {status.name} opens {status.servingFrom} — notify me
    </a>
  );
}
