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
 *
 * ============================================================================
 * autoComplete WAS "off". IT NOW SAYS "street-address". 24 AUG.
 * ============================================================================
 * "off" suppresses the browser's own saved-address fill. Chrome's field data across
 * millions of page loads has autofill users abandoning forms ~75% less often and
 * filling ~35% faster; Zuko puts completion at 71% for autofill users against 59%
 * without. On a page whose single job is getting one address typed, on traffic that
 * is overwhelmingly mobile, that was the largest available lever and it was off.
 *
 * It was off for a real reason — the browser's dropdown fighting the roll-backed
 * listbox below. That collision mostly does not arise, because the two appear at
 * different moments: onFocus opens ours only when suggestions already exist, and
 * suggestions only exist once the debounced /api/suggest call has returned rows, by
 * which point the browser has filtered its own list away. The browser's list shows
 * at empty focus, which is exactly when ours is empty.
 *
 * And a browser-filled address is not the failure warned about above. That warning
 * is about SUGGESTING a street we hold no parcel for. Autofill types the visitor's
 * own real address, which then goes through the same /api/check matcher and the
 * same `candidates` near-miss fallback as anything typed by hand.
 *
 * IF `no_parcel` RISES AFTER THIS SHIPS, suspect this line first — reverting it is
 * a one-word change. It is currently 28% of all checks and the county split has
 * still never been queried. See Funnel_Read_2026-08-23.md.
 *
 * ============================================================================
 * WHY autoCorrect IS OFF
 * ============================================================================
 * iOS autocorrect rewrites street names — Cir, Pkwy, Vía, and essentially every
 * Florida street that is not a dictionary word. The address field already carries
 * the longest dwell time and the second-highest re-edit rate of any field type in
 * Zuko's benchmarks; autocorrect makes both worse and does it silently.
 * autoCapitalize="words" matches how the roll spells things.
 *
 * ============================================================================
 * `id` AND THE aria-label FALLBACK
 * ============================================================================
 * Pass `id` when the caller renders a visible <label htmlFor>. A visible label is
 * the better accessible name and aria-label would silently override it, so
 * aria-label is only applied when no id was given. /check now labels the field
 * "Your home address"; anything still calling this without an id keeps the old
 * behaviour unchanged.
 */
export default function AddressAutocomplete({
  id = null,
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

  /**
   * ==========================================================================
   * `click`, NOT `mousedown` — CLOSING EARLY ATE THE CLICK. 27 Aug 2026.
   * ==========================================================================
   * This listened on `mousedown` because the list used to be absolutely
   * positioned: closing it before the press completed was how a click into the
   * ZIP box stopped being swallowed by a list that covered the button.
   *
   * The list is now IN FLOW (see the listbox below), and that inverts the
   * reasoning. A `mousedown` on the submit button removes the list, the button
   * jumps up by the list's height, `mouseup` lands somewhere else — and the
   * browser fires `click` on the nearest common ancestor of the two, which is
   * no longer the button. The form never submits.
   *
   * Shipped that way for about twenty minutes and caught on the live site: with
   * the list open, the FIRST press of "Check my property" did nothing at all
   * and the second worked. Milder than the bug it was fixing, and on the same
   * main path — a dead button reads as a broken site.
   *
   * On `click` the press completes against the element the visitor aimed at,
   * React's onSubmit has already run by the time this bubbles to document, and
   * the list closes immediately after. Nothing can now reflow between mousedown
   * and mouseup, which is the property that actually matters here — not when
   * the list closes.
   */
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShow(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
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
        id={id || undefined}
        placeholder={placeholder}
        aria-label={id ? undefined : 'Street address'}
        autoComplete="street-address"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="search"
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

      {/*
        ==========================================================================
        THE LIST SAT ON TOP OF "CHECK MY PROPERTY", AND ATE THE CLICK. 27 Aug 2026.
        ==========================================================================
        It was `position: absolute; top: 100%; z-index: 60`, and the submit button
        is the very next thing in the form. So the list rendered directly over the
        button, and a visitor who typed their address and reached for the button
        pressed a SUGGESTION instead — `onMouseDown` below fires first, calls pick(),
        and replaces what they typed with whatever row happened to be under their
        finger.

        For a house that is invisible and harmless: the top suggestion is usually
        their own address, so the wrong target produced the right answer and nobody
        could see the difference. For a condo it silently swapped the unit. Typing
        "1750 N BAYSHORE DR 3204" and pressing the button produced unit 1201 —
        another household's parcel, its assessment, and the heading "Your property
        is assessed at full market value". Reproduced from a clean page load.

        IN FLOW, NOT OVERLAID. The list now takes its own space and pushes the
        button down, so what is under the pointer is always what is on screen.
        Reserving space under an absolute list would do the same thing with more
        machinery and one more way to be wrong by a few pixels; a dropdown that can
        cover a submit control is the bug, and not covering it is the fix.

        The visitor's own typing is no longer at risk from a mis-aimed tap, which
        also means the suggestion list is free to be as tall as it is useful.
      */}
      {show && suggestions.length > 0 && (
        <ul
          role="listbox"
          style={{
            margin: '4px 0 0',
            padding: 0, listStyle: 'none', background: C.white,
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
            boxShadow: '0 10px 28px rgba(11,26,51,0.14)',
          }}
        >
          {/*
            Was 6, while /api/suggest returns 8 — so two retrieved rows were
            dropped on the floor, which for a condo is two units the owner might
            have been looking for. Nothing is gained by hiding them now that the
            list no longer covers anything.
          */}
          {suggestions.slice(0, 8).map((s, i) => (
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
                borderBottom: i < Math.min(suggestions.length, 8) - 1 ? `1px solid ${C.border}` : 'none',
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
