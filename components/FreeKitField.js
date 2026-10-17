/**
 * components/FreeKitField.js — next year's free kit, at the buy button. 17 Oct 2026.
 *
 * On a sellable kit it asks the server (/api/kit/free-check) whether a proved
 * free-kit claim exists for this property and tax year (lib/kit/guarantee.js).
 * If so it says so, and the parent's button reads "Get my free kit". Otherwise
 * it offers a small field for the one-time code from our email. The server
 * decides again at checkout; this only shows what will happen.
 */
import { useEffect, useState } from 'react';
import { C } from '../lib/theme';

export default function FreeKitField({ kitKey, code = '', onCode, onFree }) {
  const [state, setState] = useState({ free: false, checked: false, codeBad: false });
  const [open, setOpen] = useState(false);
  const check = async (c) => {
    if (!kitKey) return;
    try {
      const r = await fetch('/api/kit/free-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kitKey, code: c || '' }) });
      const j = await r.json().catch(() => ({}));
      const free = r.ok && j.free === true;
      setState({ free, checked: true, codeBad: Boolean(c) && !free });
      if (onFree) onFree(free);
    } catch (e) { setState({ free: false, checked: true, codeBad: false }); if (onFree) onFree(false); }
  };
  useEffect(() => { check(''); }, [kitKey]);

  if (state.free) {
    return (
      <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, background: C.greenBg, border: `1px solid ${C.green}`, fontSize: 14, lineHeight: 1.6, color: C.darkNavy }}>
        <strong>Your free kit applies.</strong> Last year&rsquo;s appeal did not lower this property&rsquo;s value, so this kit is on us: there is no charge.
      </div>
    );
  }
  if (!state.checked) return null;
  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={{ background: 'none', border: 0, padding: 0, color: C.mutedGray, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
          Have a free-kit code from us?
        </button>
      ) : (<>
        <label style={{ display: 'block', fontSize: 12, color: C.mutedGray, margin: '6px 0' }}>Free-kit code</label>
        <input type="text" value={code} onChange={(e) => onCode && onCode(e.target.value)} onBlur={() => code && check(code)}
          placeholder="FREE-XXXXXXXX" autoComplete="off" spellCheck={false} aria-label="Free-kit code"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: 14, textTransform: code ? 'uppercase' : 'none', border: `1px solid ${state.codeBad ? C.goldDim : C.border}`, borderRadius: 8 }} />
        {state.codeBad && <p style={{ fontSize: 12, color: C.goldDim, margin: '6px 0 0' }}>That code does not match this property and tax year, or it has been used. Questions: customerservice@taxappealusa.com.</p>}
      </>)}
    </div>
  );
}
