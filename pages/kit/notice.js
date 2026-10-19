/**
 * /kit/notice?o=<order>&t=<token> — a pre-sale customer enters their notice.
 * (16 Oct 2026.) The link comes from the receipt and the reminders; the server
 * (pages/api/kit/notice.js -> lib/kit/presale.js) re-runs the full check on the
 * notice value and either mails the kit or refunds in full.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { C, FONTS } from '../../lib/theme';
import { SERVICE_PRICE_DOLLARS } from '../../lib/pricing';
import NoticePhoto from '../../components/NoticePhoto';

const wrap = { maxWidth: 560, margin: '0 auto', padding: '40px 18px 60px', fontFamily: FONTS.body, color: C.darkNavy };
const card = { background: C.white, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 22, margin: '16px 0' };
const label = { display: 'block', fontWeight: 600, margin: '14px 0 6px' };
const input = { width: '100%', padding: '11px 12px', border: `1px solid ${C.cardLine}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' };
const help = { fontSize: 13, color: C.mutedGray, marginTop: 4 };
const btn = { width: '100%', padding: '14px 16px', borderRadius: 10, border: 0, background: C.navy, color: C.white, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 18 };
const p = { fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' };

const NEED_COPY = {
  need_notice_value: 'Please enter the value from your notice.',
  need_ownedOnJan1: 'Please answer the ownership question.',
  need_fultonBilling100: 'Please choose how Fulton should bill while your appeal is pending.',
};

function YesNo({ value, onChange, yes = 'Yes', no = 'No' }) {
  const o = (v, t) => (
    <button type="button" onClick={() => onChange(v)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 15, cursor: 'pointer', border: `2px solid ${value === v ? C.darkNavy : C.cardLine}`, background: value === v ? C.bg : C.white, fontWeight: value === v ? 700 : 400 }}>{t}</button>
  );
  return <div style={{ display: 'flex', gap: 10 }}>{o(true, yes)}{o(false, no)}</div>;
}

export default function KitNotice() {
  const router = useRouter();
  const { o, t } = router.query;
  const [view, setView] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [noticeValue, setNoticeValue] = useState('');
  const [noticeDate, setNoticeDate] = useState('');
  const [parcelId, setParcelId] = useState('');
  const [ownedOnJan1, setOwnedOnJan1] = useState(undefined);
  const [fultonBilling100, setFultonBilling100] = useState(undefined);
  const [virtualHearing, setVirtualHearing] = useState(undefined);

  const post = (body) => fetch('/api/kit/notice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ o, t, ...body }) })
    .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));

  useEffect(() => {
    if (!o || !t) return;
    post({ action: 'load' }).then(({ ok, j }) => (ok ? setView(j) : setErr(j.error || 'This link is not valid.')));
  }, [o, t]);

  const needs = view?.needs || [];
  const ready = Number(String(noticeValue).replace(/[^0-9]/g, '')) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(noticeDate)
    && (!needs.includes('ownedOnJan1') || typeof ownedOnJan1 === 'boolean')
    && (!needs.includes('fultonBilling100') || typeof fultonBilling100 === 'boolean');

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    const { ok, j } = await post({ noticeValue: Number(String(noticeValue).replace(/[^0-9]/g, '')), noticeDate, parcelId, ownedOnJan1, fultonBilling100, virtualHearing });
    setBusy(false);
    if (!ok) { setErr(j.error || 'That did not go through. Please try again.'); return; }
    if (j.needs) { setErr(NEED_COPY[j.needs] || 'Please check your answers.'); return; }
    if (j.retry) { setErr('We could not finish the check just now. Please try again in a few minutes.'); return; }
    setResult(j);
  };

  const status = result?.status || view?.status;
  const done = status && status !== 'awaiting_notice';

  return (
    <>
      <Head>
        <title>Enter your assessment notice — TaxAppeal USA</title>
        <meta name="robots" content="noindex, nofollow" />
        {/* No browser-default 8px body margin: it framed these pages in a white border on phones. */}
        <style dangerouslySetInnerHTML={{ __html: "body{margin:0}" }} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <div style={{ background: C.bg, minHeight: '100vh' }}>
        <div style={wrap}>
          <h1 style={{ fontFamily: FONTS.display, fontSize: 28, margin: '0 0 6px' }}>Your assessment notice</h1>
          {view?.address && <div style={{ color: C.bodyGray, fontSize: 14 }}>{view.address}</div>}
          {err && <div style={{ ...card, borderColor: C.red, color: C.red }}>{err}</div>}

          {!view && !err && <p style={p}>Loading&hellip;</p>}

          {view && done && (
            <div style={card}>
              {(status === 'kit_mailed' || status === 'kit_queued') && (<>
                <p style={{ ...p, fontWeight: 700 }}>Your appeal kit is on its way.</p>
                <p style={p}>Our check on your notice still shows a case{result?.yearlySaving ? `, worth about $${Number(result.yearlySaving).toLocaleString()} a year if the county agrees` : ''}. We are mailing you the completed, ready-to-sign kit and emailing the PDF so you can start now. You sign it, add a stamp and mail it to the county before the deadline printed in the kit.</p>
              </>)}
              {status === 'refunded_no_case' && (<>
                <p style={{ ...p, fontWeight: 700 }}>We have refunded you in full.</p>
                <p style={p}>On the value from your notice, an appeal would not lower your tax bill by more than our ${SERVICE_PRICE_DOLLARS} fee this year, so we are not sending you a kit. The refund usually shows on your statement within 5 to 10 business days. We have emailed you the details.</p>
              </>)}
              {(status === 'needs_review' || status === 'notice_checking') && (<>
                <p style={{ ...p, fontWeight: 700 }}>We have your notice.</p>
                <p style={p}>One thing needs a person to look at it before we mail your kit. We will email you within one business day. Nothing more is charged.</p>
              </>)}
            </div>
          )}

          {view && !done && (
            <div style={card}>
              <p style={p}>Enter what is printed on your {view.taxYear || ''} Notice of Assessment. We check your case again on these figures. If an appeal still lowers your bill, we mail your kit. If it doesn&rsquo;t, we refund you in full.</p>

              <NoticePhoto state="GA" taxYear={Number(view.taxYear) || new Date().getFullYear()} onRead={(f) => {
                if (f.noticeValue) setNoticeValue(Number(f.noticeValue).toLocaleString('en-US'));
                if (f.noticeDate) setNoticeDate(f.noticeDate);
                if (f.parcelId && !parcelId) setParcelId(f.parcelId);
              }} />
              <label style={label} htmlFor="nv">Current year fair market value</label>
              <input id="nv" style={input} inputMode="numeric" placeholder="e.g. 452,000" value={noticeValue} onChange={(e) => setNoticeValue(e.target.value)} />
              <div style={help}>The 100% value, not the 40% assessed value.</div>

              <label style={label} htmlFor="nd">Date printed on the notice</label>
              <input id="nd" style={input} type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
              <div style={help}>Your appeal must be postmarked within 45 days of this date.</div>

              <label style={label} htmlFor="pid">Parcel ID (optional)</label>
              <input id="pid" style={input} placeholder="As printed on the notice" value={parcelId} onChange={(e) => setParcelId(e.target.value)} />

              {needs.includes('ownedOnJan1') && (<>
                <label style={label}>Did you own this home on January 1, {view.taxYear}?</label>
                <YesNo value={ownedOnJan1} onChange={setOwnedOnJan1} />
              </>)}
              {needs.includes('fultonBilling100') && (<>
                <label style={label}>While your appeal is pending, Fulton bills you on</label>
                <YesNo value={fultonBilling100} onChange={setFultonBilling100} yes="100% of the new value" no="85% (the usual choice)" />
                <label style={label}>Would you like a virtual hearing if there is one? (optional)</label>
                <YesNo value={virtualHearing} onChange={setVirtualHearing} />
              </>)}

              <button style={{ ...btn, ...(ready && !busy ? {} : { background: C.mutedGray, cursor: 'not-allowed' }) }} disabled={!ready || busy} onClick={submit}>
                {busy ? 'Checking your notice…' : 'Check my notice'}
              </button>
            </div>
          )}

          <p style={{ ...help, textAlign: 'center' }}>Questions? <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy }}>customerservice@taxappealusa.com</a></p>
        </div>
      </div>
    </>
  );
}
