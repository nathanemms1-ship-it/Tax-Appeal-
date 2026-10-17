/**
 * components/NoticePhoto.js — "Take a photo of your notice instead". 17 Oct 2026.
 *
 * Sends the photo to /api/kit/read-notice and hands back what it read, to
 * PREFILL the fields below it. The customer always sees and can correct the
 * figures; nothing is submitted from here.
 */
import { useState } from 'react';
import { C } from '../lib/theme';
import { prepareUpload } from '../lib/uploadClient';

const WARN = {
  not_a_notice: "That doesn't look like your notice. You can try another photo, or type the figures below.",
  other_year: 'That notice looks like it is for a different year. Please check the figures below.',
  low_confidence: 'The photo was hard to read. Please check every figure below.',
  value_looks_assessed: 'We could read the 40% assessed value but not the 100% fair market value. Please type the 100% value below.',
  deadline_unreadable: 'We could not read the petition deadline. Please type it below.',
  nothing_read: "We couldn't read the figures from that photo. Please type them below, or try a sharper photo.",
  unavailable: "We can't read photos just now. Please type the figures below.",
};

export default function NoticePhoto({ state, taxYear, label = 'Take a photo of your notice instead', onRead }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [good, setGood] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true); setMsg(''); setGood(false);
    try {
      const prepared = await prepareUpload(file);
      const r = await fetch('/api/kit/read-notice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, taxYear, file: prepared }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'We could not read that photo. Please type the figures below.');
      if (j.ok && onRead) onRead(j.fields || {});
      const warn = (j.warnings || []).map((w) => WARN[w]).filter(Boolean);
      setGood(Boolean(j.ok) && !warn.length);
      setMsg(warn.length ? warn.join(' ') : j.ok ? 'We filled in what we read. Please check it against your notice before you continue.' : WARN.nothing_read);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ margin: '4px 0 12px', padding: '12px 14px', borderRadius: 8, border: `1px dashed ${C.border}`, background: C.white }}>
      <label style={{ display: 'inline-block', cursor: busy ? 'wait' : 'pointer', fontWeight: 600, color: C.navy, fontSize: 15 }}>
        <input type="file" accept="image/*,application/pdf" capture="environment" disabled={busy} style={{ display: 'none' }} onChange={(e) => { pick(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        {busy ? 'Reading your notice…' : `\u{1F4F7} ${label}`}
      </label>
      <div style={{ fontSize: 12.5, color: C.mutedGray, marginTop: 4 }}>We read the figures and fill them in for you to check. The photo is not stored.</div>
      {msg && <div style={{ fontSize: 13.5, marginTop: 8, color: good ? C.green : C.goldDim, lineHeight: 1.5 }}>{msg}</div>}
    </div>
  );
}
