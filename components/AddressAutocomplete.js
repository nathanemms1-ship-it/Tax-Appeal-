import { useEffect, useRef, useState } from 'react';

/**
 * ADDRESS AUTOCOMPLETE, BACKED BY OUR OWN TAX ROLL.
 *
 * ============================================================================
 * WHY THIS IS NOT GOOGLE PLACES
 * ============================================================================
 * /api/suggest queries the same `parcels` table that /api/check then reads. So
 * every suggestion offered is a property we hold, and picking one cannot lead to
 * "we found your address but not your property" — the failure that makes a free
 * check feel broken through no fault of the person using it.
 *
 * Google Places would happily suggest an address no data provider has a record
 * for. On a page whose entire promise is "we check your property against your
 * county's own tax roll", suggesting an address that is not on that roll is worse
 * than suggesting nothing. pages/apply.js states the same rule at its own
 * autocomplete and reaches for Google ONLY for states where we hold no roll.
 *
 * ============================================================================
 * WHY IT EXISTS SEPARATELY FROM THE ONE IN apply.js
 * ============================================================================
 * apply.js defines a multi-state AddressAutocomplete inline. This one is Florida
 * only, because /check is Florida only, which removes the state-detection branch
 * and the Google fallback entirely.
 *
 * That is a deliberate duplication and it should not outlive the season. apply.js
 * is the money path and was not worth touching during a live filing window to save
 * a file. AFTER THE SEASON, migrate apply.js onto this component and delete its
 * inline copy — two implementations of "which address did they mean" is exactly
 * the shape of drift this codebase keeps paying for.
 *
 * ============================================================================
 * WHY IT WRITES BACK THE ROLL'S OWN STRINGS
 * ============================================================================
 * onSelect hands up `street` and `zip` exactly as the roll spells them, not as the
 * customer typed them. Re-running the lookup with the roll's own values is the one
 * query guaranteed to resolve, and it sidesteps the ZIP disagreement that made
 * this page tell people we had no record of their house — the roll said 33064
 * where USPS said 33060.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  zip = null,
  placeholder = '8023 Marbella Creek Ave',
  colors,
  style = {},
}) {
  const C = colors;
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const debounce = useRef(null);
  const wrapRef = useRef(null);

  // Close on an outside click. Without this the list survives a click into the
  // ZIP box and covers the button underneath it.
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  function handleChange(e) {
    const val = e.target.value;
    onChange(val);
    setActive(-1);
    if (debounce.current) clearTimeout(debounce.current);
    // The roll query needs 4 characters; asking sooner spends a request on a
    // prefix that cannot match.
    if (val.trim().length < 4) { setSuggestions([]); setShow(false); return; }

    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const z = String(zip || '').trim().slice(0, 5);
        const r = await fetch('/api/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: val, zip: z || null }),
        });
        const j = await r.json();
        const list = Array.isArray(j.suggestions) ? j.suggestions : [];
        setSuggestions(list);
        setShow(list.length > 0);
      } catch {
        // A dead suggest endpoint must never block typing. The form still submits.
        setSuggestions([]);
        setShow(false);
      }
      setLoading(false);
    }, 250);
  }

  function pick(s) {
    onSelect(s);
    setShow(false);
    setSuggestions([]);
    setActive(-1);
  }

  // Keyboard support is not decoration here: a dropdown that swallows Enter and
  // does not offer arrow keys is worse than no dropdown for anyone typing fast.
  function handleKeyDown(e) {
    if (!show || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === 'Escape') { setShow(false); setActive(-1); }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length) setShow(true); }}
        placeholder={placeholder}
        aria-label="Street address"
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        style={{
          width: '100%', padding: '13px 14px', fontSize: 16, fontFamily: 'inherit',
          border: `1px solid ${C.border}`, borderRadius: 8, boxSizing: 'border-box',
        }}
      />

      {loading && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', right: 12, top: 22, width: 14, height: 14, borderRadius: '50%',
            border: `2px solid ${C.navy}`, borderTopColor: 'transparent',
            animation: 'ta-spin 0.7s linear infinite',
          }}
        />
      )}

      {show && suggestions.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, margin: '4px 0 0',
            padding: 0, listStyle: 'none', background: C.white,
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
            boxShadow: '0 10px 28px rgba(11,26,51,0.14)',
          }}
        >
          {suggestions.slice(0, 6).map((s, i) => (
            <li
              key={s.parcelId || i}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would otherwise close the
              // list before the click lands.
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '11px 14px', cursor: 'pointer',
                background: i === active ? C.bg : C.white,
                borderBottom: i < Math.min(suggestions.length, 6) - 1 ? `1px solid ${C.border}` : 'none',
              }}
            >
              <div style={{ fontSize: 14, color: C.darkNavy }}>{s.street}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {[s.city, 'FL', s.zip].filter(Boolean).join(', ')}
              </div>
            </li>
          ))}
        </ul>
      )}

      <style jsx global>{`
        @keyframes ta-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
