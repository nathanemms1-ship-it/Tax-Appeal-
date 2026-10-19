/**
 * /mailed — "I've sent my kit". 17 Oct 2026.
 *
 * Every kit's checklist ends "Tell us it is mailed at taxappealusa.com/mailed".
 * With the private link from our emails (?o=&t=) it is one button; typed from
 * the paper kit it asks for the email on the order and sends that link. Marking
 * it sent stops the deadline reminders (lib/kit/afterMailing.js).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { C, FONTS } from '../lib/theme';

const wrap = { maxWidth: 560, margin: '0 auto', padding: '40px 18px 60px', fontFamily: FONTS.body, color: C.darkNavy };
const card = { background: C.white, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 22, margin: '16px 0' };
const label = { display: 'block', fontWeight: 600, margin: '14px 0 6px' };
const input = { width: '100%', padding: '11px 12px', border: `1px solid ${C.cardLine}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' };
const btn = { width: '100%', padding: '14px 16px', borderRadius: 10, border: 0, background: C.navy, color: C.white, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 18 };
const p = { fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' };
const muted = { ...p, fontSize: 13.5, color: C.mutedGray };

const DOC = { GA: 'appeal', TX: 'protest', FL: 'petition' };
const BODY = { GA: 'the county', TX: 'the appraisal district', FL: 'the Value Adjustment Board' };
const longDay = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');

export default function Mailed() {
  const router = useRouter();
  const { o, t } = router.query;
  const hasLink = Boolean(o && t);
  const [view, setView] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentOn, setSentOn] = useState('');
  const [email, setEmail] = useState('');
  const [linkMsg, setLinkMsg] = useState('');

  useEffect(() => { setSentOn(new Date().toISOString().slice(0, 10)); }, []);
  useEffect(() => {
    if (!router.isReady || !hasLink) return;
    fetch('/api/kit/sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ o, t, action: 'load' }) })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok) setView(j); else setErr(j.error || 'This link is not valid.'); });
  }, [router.isReady, o, t]);

  const markSent = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/kit/sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ o, t, sentOn }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'We could not save that. Please try again.');
      setView(j);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const askLink = async () => {
    setBusy(true); setErr(''); setLinkMsg('');
    try {
      const r = await fetch('/api/kit/sent-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Please try again in a few minutes.');
      setLinkMsg(j.message);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const st = view?.state || 'GA';
  const doc = DOC[st] || 'appeal';
  const done = view?.done || view?.status === 'kit_sent';

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <Head>
        <title>Tell us your kit is sent | TaxAppeal USA</title>
        <meta name="robots" content="noindex" />
        {/* No browser-default 8px body margin: it framed these pages in a white border on phones. */}
        <style dangerouslySetInnerHTML={{ __html: "body{margin:0}" }} />
      </Head>
      <div style={wrap}>
        <h1 style={{ fontFamily: FONTS.display, fontSize: 30, margin: '0 0 6px' }}>Tell us your kit is sent</h1>
        <p style={muted}>Once you have signed your kit and mailed it (or handed it in), tell us here. We stop the deadline reminders and watch for what comes next.</p>

        {hasLink && !view && !err && <div style={card}><p style={p}>Loading your order&hellip;</p></div>}

        {hasLink && view && !done && (
          <div style={card}>
            <p style={p}>Your {doc} for <b>{view.address || 'your home'}</b>{view.deadline ? <> (deadline {longDay(view.deadline)})</> : null}.</p>
            <label style={label} htmlFor="sent-on">The day you {st === 'FL' ? 'mailed or hand-delivered' : 'mailed'} it</label>
            <input id="sent-on" type="date" style={input} value={sentOn} onChange={(e) => setSentOn(e.target.value)} />
            <button style={btn} disabled={busy} onClick={markSent}>{busy ? 'Saving…' : `I've sent my ${doc}`}</button>
          </div>
        )}

        {hasLink && view && done && (
          <div style={card}>
            <p style={{ ...p, fontWeight: 700, fontSize: 17 }}>Thank you. We have it as sent{view.sentOn ? ` on ${longDay(view.sentOn)}` : ''}.</p>
            <p style={p}>
              {BODY[st] ? `${BODY[st].charAt(0).toUpperCase()}${BODY[st].slice(1)}` : 'The county'} writes to you directly, usually within a few weeks
              {st === 'TX' ? ', with an informal conference or hearing date' : st === 'FL' ? ', first to confirm your petition and later with a hearing date' : ''}. Open their mail the day it arrives:
              some letters have short deadlines of their own.
            </p>
            {view.nextLink && <p style={p}><b>Got a hearing date?</b> <a href={view.nextLink}>Tell us here</a> and we will email you a one-page sheet for the day. The same page is where you tell us the decision.</p>}
            <p style={p}>Email a photo of anything they send to <a href="mailto:customerservice@taxappealusa.com">customerservice@taxappealusa.com</a> and we will tell you your options. If the value is not lowered, next year&rsquo;s kit is free.</p>
          </div>
        )}

        {(!hasLink || err) && (
          <div style={card}>
            {err && <p style={{ ...p, color: C.red }}>{err}</p>}
            <p style={p}>Enter the email you ordered with and we will send you a private link for your order.</p>
            <label style={label} htmlFor="sent-email">Email</label>
            <input id="sent-email" type="email" style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <button style={btn} disabled={busy || !email} onClick={askLink}>{busy ? 'Sending…' : 'Email me my link'}</button>
            {linkMsg && <p style={{ ...p, marginTop: 12 }}>{linkMsg}</p>}
          </div>
        )}
        <p style={muted}>TaxAppeal USA prepares the documents. We do not file your {doc} or represent you: you sign it and send it.</p>
      </div>
    </div>
  );
}
