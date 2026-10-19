/**
 * /kit/trim?o=<order>&t=<token> — a Florida reservation's petition deadline.
 * (18 Oct 2026.) The link comes from the receipt and the reminders; the server
 * (pages/api/kit/trim.js -> lib/kit/flPresale.js) checks the date and, once
 * this year's values have confirmed the case, sends the kit.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { C, FONTS } from '../../lib/theme';
import NoticePhoto from '../../components/NoticePhoto';

const wrap = { maxWidth: 560, margin: '0 auto', padding: '40px 18px 60px', fontFamily: FONTS.body, color: C.darkNavy };
const card = { background: C.white, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 22, margin: '16px 0' };
const label = { display: 'block', fontWeight: 600, margin: '14px 0 6px' };
const input = { width: '100%', padding: '11px 12px', border: `1px solid ${C.cardLine}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' };
const help = { fontSize: 13, color: C.mutedGray, marginTop: 4 };
const btn = { width: '100%', padding: '14px 16px', borderRadius: 10, border: 0, background: C.navy, color: C.white, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 18 };
const p = { fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' };
const longDay = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');

export default function KitTrim() {
  const router = useRouter();
  const { o, t } = router.query;
  const [view, setView] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [trimDeadline, setTrimDeadline] = useState('');

  const post = (body) => fetch('/api/kit/trim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ o, t, ...body }) })
    .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));

  useEffect(() => {
    if (!router.isReady) return;
    if (!o || !t) { setErr('Please use the link in your email.'); return; }
    post({ action: 'load' }).then(({ ok, j }) => (ok ? setView(j) : setErr(j.error || 'This link is not valid.')));
  }, [router.isReady, o, t]);

  const submit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimDeadline) || busy) return;
    setBusy(true); setErr('');
    const { ok, j } = await post({ trimDeadline });
    setBusy(false);
    if (!ok) { setErr(j.error || 'That did not go through. Please try again.'); return; }
    if (j.retry) { setErr('We could not finish just now. Your date is saved; we will try again shortly.'); }
    setView(j);
  };

  const status = view?.status;
  const sent = ['kit_queued', 'kit_mailed', 'kit_emailed'].includes(status);
  const waiting = status === 'awaiting_notice' || status === 'notice_checking';
  const haveDate = Boolean(view?.trimDeadline || view?.tableDeadline);

  return (
    <>
      <Head>
        <title>Your petition deadline — TaxAppeal USA</title>
        <meta name="robots" content="noindex, nofollow" />
        {/* No browser-default 8px body margin: it framed these pages in a white border on phones. */}
        <style dangerouslySetInnerHTML={{ __html: "body{margin:0}" }} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <div style={{ background: C.bg, minHeight: '100vh' }}>
        <div style={wrap}>
          <h1 style={{ fontFamily: FONTS.display, fontSize: 28, margin: '0 0 6px' }}>Your petition deadline</h1>
          {view?.address && <div style={{ color: C.bodyGray, fontSize: 14 }}>{view.address}</div>}
          {err && <div style={{ ...card, borderColor: C.red, color: C.red }}>{err}</div>}
          {!view && !err && <p style={p}>Loading&hellip;</p>}

          {view && sent && (
            <div style={card}>
              <p style={{ ...p, fontWeight: 700 }}>Your petition kit is on its way.</p>
              <p style={p}>{status === 'kit_emailed'
                ? 'Your deadline is close, so we have emailed you the completed kit as a PDF. Print it, sign it, add your check for the county\'s filing fee, and hand-deliver or mail it so the Value Adjustment Board receives it by the deadline.'
                : 'We are mailing you the completed, ready-to-sign kit and emailing you a PDF copy now. Sign it, add your check for the county\'s filing fee, and get it to the Value Adjustment Board so it is received by the deadline printed in the kit.'}</p>
            </div>
          )}
          {view && status === 'refunded_no_case' && (
            <div style={card}><p style={p}>We checked your petition on this year&rsquo;s values and it would not lower your bill, so we have refunded you in full. We have emailed you the details.</p></div>
          )}
          {view && status === 'needs_review' && (
            <div style={card}><p style={p}>Thank you. One thing needs a person to look at it before we send your kit. We will email you within one business day. Nothing more is charged.</p></div>
          )}

          {view && waiting && haveDate && (
            <div style={card}>
              <p style={{ ...p, fontWeight: 700 }}>We have your deadline{view.trimDeadline ? `: ${longDay(view.trimDeadline)}` : ''}.</p>
              <p style={p}>{view.confirmed
                ? 'We are preparing your kit now. You will get an email when it is on its way.'
                : `Your county's ${view.taxYear || 'new'} values are not out yet. When they are, we check your petition again and send your kit straight away, or refund you in full.`}</p>
            </div>
          )}

          {view && waiting && !view.tableDeadline && (
            <div style={card}>
              <p style={p}>Your TRIM notice (the &ldquo;Notice of Proposed Property Taxes&rdquo;) arrives in August and prints the last day to file a petition with the Value Adjustment Board. Enter that date{view.trimDeadline ? ' again if you need to correct it' : ''}.</p>
              <NoticePhoto state="FL" taxYear={Number(view.taxYear) || new Date().getFullYear()} label="Take a photo of your TRIM notice instead" onRead={(f) => { if (f.trimDeadline) setTrimDeadline(f.trimDeadline); }} />
              <label style={label} htmlFor="td">Petition deadline on your TRIM notice</label>
              <input id="td" style={input} type="date" value={trimDeadline} onChange={(e) => setTrimDeadline(e.target.value)} />
              <div style={help}>Florida counts a petition on the day the board receives it, so we use this date to decide whether to mail your kit or email it.</div>
              <button style={{ ...btn, ...(trimDeadline && !busy ? {} : { background: C.mutedGray, cursor: 'not-allowed' }) }} disabled={!trimDeadline || busy} onClick={submit}>
                {busy ? 'Saving…' : 'Save my deadline'}
              </button>
            </div>
          )}

          <p style={{ ...help, textAlign: 'center' }}>Questions? <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy }}>customerservice@taxappealusa.com</a></p>
        </div>
      </div>
    </>
  );
}
