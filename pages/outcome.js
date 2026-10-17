/**
 * /outcome?o=&t= — "What did the county decide?" 17 Oct 2026.
 * The private link comes from our follow-up emails (lib/kit/outcome.js).
 * "Not lowered" claims next year's free kit: the guarantee on every page. It is
 * confirmed by uploading the decision letter here (lib/kit/guarantee.js).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { C, FONTS } from '../lib/theme';

const wrap = { maxWidth: 560, margin: '0 auto', padding: '40px 18px 60px', fontFamily: FONTS.body, color: C.darkNavy };
const card = { background: C.white, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 22, margin: '16px 0' };
const input = { width: '100%', padding: '11px 12px', border: `1px solid ${C.cardLine}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' };
const btn = { width: '100%', padding: '14px 16px', borderRadius: 10, border: 0, background: C.navy, color: C.white, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 18 };
const p = { fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' };
const muted = { ...p, fontSize: 13.5, color: C.mutedGray };

const BODY = { GA: 'the county', TX: 'the appraisal district', FL: 'the Value Adjustment Board' };
const CHOICES = [
  ['lowered', 'They lowered it to what I asked for, or close to it'],
  ['partial', 'They lowered it, but by less than I asked'],
  ['not_lowered', 'They did not lower it'],
  ['waiting', 'I have not heard yet, or my hearing has not happened'],
  ['not_sent', 'I did not send it in the end'],
];

/** A phone photo is often 5-10 MB: shrink it to a readable JPEG before upload. PDFs go as they are. */
async function prepareFile(file) {
  const asBase64 = (blob) => new Promise((ok, bad) => { const r = new window.FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = bad; r.readAsDataURL(blob); });
  if (file.type === 'application/pdf') {
    if (file.size > 3 * 1024 * 1024) throw new Error('That PDF is too large. Please upload one under 3 MB, or a photo of the letter.');
    return { type: 'application/pdf', data: await asBase64(file) };
  }
  if (!/^image\//.test(file.type)) throw new Error('Please choose a photo or a PDF of the letter.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('We could not open that photo. Please try another, or a PDF.')); i.src = url; });
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    return { type: 'image/jpeg', data: await asBase64(blob) };
  } finally { URL.revokeObjectURL(url); }
}

export default function Outcome() {
  const router = useRouter();
  const { o, t } = router.query;
  const [view, setView] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [newValue, setNewValue] = useState('');
  const [proofMsg, setProofMsg] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    if (!o || !t) { setErr('Please use the link in your email.'); return; }
    fetch('/api/kit/outcome', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ o, t, action: 'load' }) })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok) setView(j); else setErr(j.error || 'This link is not valid.'); });
  }, [router.isReady, o, t]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/kit/outcome', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ o, t, answer, newValue }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'We could not save that. Please try again.');
      setView(j);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr(''); setProofMsg('');
    try {
      const prepared = await prepareFile(file);
      const r = await fetch('/api/kit/outcome', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ o, t, action: 'proof', file: prepared }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'We could not upload that. Please try again.');
      setView(j); setProofMsg(j.message || '');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const body = BODY[view?.state] || 'the county';
  const g = view?.guarantee;
  // Answered already (now, or on an earlier visit), or decided from a letter.
  // "Still waiting" can be answered again on a later visit.
  const done = view?.done || (Boolean(view?.answer) && view.answer !== 'waiting') || ['approved', 'partial', 'denied'].includes(view?.status);
  const lowered = answer === 'lowered' || answer === 'partial';

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <Head>
        <title>What did the county decide? | TaxAppeal USA</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={wrap}>
        <h1 style={{ fontFamily: FONTS.display, fontSize: 30, margin: '0 0 6px' }}>What did {body} decide?</h1>
        {err && <div style={card}><p style={{ ...p, color: C.red, margin: 0 }}>{err}</p></div>}

        {view && !done && (
          <div style={card}>
            <p style={p}>For <b>{view.address || 'your home'}</b>{view.taxYear ? `, tax year ${view.taxYear}` : ''}.</p>
            {CHOICES.map(([key, text]) => (
              <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', margin: '8px 0', borderRadius: 8, cursor: 'pointer', border: `2px solid ${answer === key ? C.darkNavy : C.cardLine}`, background: answer === key ? C.bg : C.white }}>
                <input type="radio" name="answer" checked={answer === key} onChange={() => setAnswer(key)} style={{ marginTop: 4 }} />
                <span style={{ fontSize: 15, lineHeight: 1.5 }}>{text}</span>
              </label>
            ))}
            {lowered && (<>
              <p style={{ ...p, marginTop: 12, marginBottom: 6, fontWeight: 600 }}>The new value on their letter (optional)</p>
              <input style={input} inputMode="numeric" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="$350,000" />
            </>)}
            <button style={btn} disabled={busy || !answer} onClick={submit}>{busy ? 'Saving…' : 'Send my answer'}</button>
          </div>
        )}

        {view && done && (
          <div style={card}>
            {g?.status === 'needs_proof' ? (<>
              <p style={{ ...p, fontWeight: 700, fontSize: 17 }}>One step to confirm your free {g.freeKitYear || 'next'} kit</p>
              <p style={p}>Upload the decision letter or notice {body} sent you. A phone photo is fine, or a PDF. It must show the decision on your {view.taxYear || ''} appeal.</p>
              <p style={muted}>The free kit applies when the value stayed the same or went up. It does not apply when an appeal was dismissed (for example, nobody attended the hearing) or withdrawn, or when the value was lowered by any amount.</p>
              <input type="file" accept="image/*,application/pdf" disabled={busy} onChange={(e) => upload(e.target.files && e.target.files[0])} style={{ marginTop: 8 }} />
              {busy && <p style={{ ...p, marginTop: 10 }}>Uploading and reading your letter&hellip;</p>}
            </>) : g?.status === 'verified' ? (<>
              <p style={{ ...p, fontWeight: 700, fontSize: 17 }}>Your free {g.freeKitYear || 'next'} kit is confirmed.</p>
              <p style={p}>{proofMsg || 'We have emailed you a one-time code. When you check this property for that tax year, the free kit applies by itself.'}</p>
            </>) : g?.status === 'needs_review' ? (
              <p style={p}>{proofMsg || 'Thank you. A person is checking your letter and will email you within two business days.'}</p>
            ) : g?.status === 'rejected' ? (
              <p style={p}>{proofMsg || 'We have checked your letter. The free kit does not apply to this decision. Questions: customerservice@taxappealusa.com.'}</p>
            ) : g?.status === 'redeemed' ? (
              <p style={p}>Your free kit has been used. Thank you.</p>
            ) : view.answer === 'waiting' ? (
              <p style={p}>Thank you. We will check back in about a month. Forward anything {body} sends to customerservice@taxappealusa.com and we will tell you your options.</p>
            ) : (
              <p style={{ ...p, fontWeight: 700 }}>Thank you, we have recorded it.</p>
            )}
            {proofMsg && g?.status === 'needs_proof' && <p style={{ ...p, color: C.red }}>{proofMsg}</p>}
          </div>
        )}
        <p style={muted}>Have their letter? Email a photo of it to customerservice@taxappealusa.com and we will read it for you.</p>
      </div>
    </div>
  );
}
