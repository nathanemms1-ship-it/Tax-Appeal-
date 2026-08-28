import { Html, Head, Main, NextScript } from 'next/document';

/**
 * ============================================================================
 * WHAT THE VISITOR TYPES BEFORE REACT WAKES UP. 28 Aug 2026.
 * ============================================================================
 * /check server-renders its address field, so it is focusable and typeable the
 * moment the HTML parses. The field is CONTROLLED — `value={form.street}` with
 * `form.street` starting as '' — so when React hydrates it commits its props
 * onto the existing node, sets `value = ''`, and everything typed until then is
 * gone. That is ordinary React behaviour, not a bug in pages/check.js.
 *
 * MEASURED ON THE LIVE PAGE, warm cache, desktop, 27 Aug:
 *
 *     HTML parsed — field typeable      760 ms
 *     DOMContentLoaded                1,515 ms
 *     load                            2,218 ms
 *
 * Hydration lands between the last two, so the window is roughly three quarters
 * of a second to a second and a half AT BEST. Cold cache on a phone — 109 kB of
 * first-load JS to fetch, parse and execute — is several times that.
 *
 * It was found by typing an address immediately after navigating and watching
 * the field come back empty, twice. On /check specifically the odds are bad: it
 * is the ad landing page, the field is above the fold, and the page's whole
 * instruction is "Type your address."
 *
 * ============================================================================
 * WHY A RAW INLINE SCRIPT IN _document AND NOT next/script
 * ============================================================================
 * This has to run BEFORE hydration, and in the pages router `beforeInteractive`
 * is only honoured here. It also has to run before the field exists, which is
 * why it listens on `document` in the capture phase rather than binding to the
 * input: at the time <head> executes, <body> has not been parsed.
 *
 * Keyed by element id, so the consumer asks for the field it owns rather than
 * guessing. pages/check.js takes it on mount; see the note there for why only
 * the street field is restored.
 *
 * FAILS SILENT AND HARMLESS. If this script never runs the page behaves exactly
 * as it did before — the consumer's optional-chained `take()` finds nothing and
 * returns. Nothing on the page depends on it existing.
 *
 * ============================================================================
 * THIS FILE DID NOT EXIST BEFORE, AND IT IS DELIBERATELY THE DEFAULT DOCUMENT
 * ============================================================================
 * Everything else here is Next's stock shell. `lang="en"` is the one addition
 * beyond the capture script: without a custom Document, Next emits <html> with
 * no lang at all, which is an accessibility defect on all 1,081 pages. Nothing
 * else belongs in this file — the favicon, the canonicals and the structured
 * data all live in pages/_app.js and must not be duplicated here.
 */
const CAPTURE_PRE_HYDRATION_INPUT = `
(function () {
  var store = Object.create(null);
  var lastId = null;

  function onInput(e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') return;
    store[t.id] = t.value;
    lastId = t.id;
  }

  document.addEventListener('input', onInput, true);

  window.__taPreHydrationInput = {
    take: function () {
      document.removeEventListener('input', onInput, true);
      var taken = { values: store, lastId: lastId };
      // Resetting the store is what makes take() idempotent: a second caller
      // gets an empty object rather than a stale replay, so a client-side
      // navigation back to /check cannot refill the field with what somebody
      // typed on the first page view.
      //
      // This was briefly ALSO written as a reassignment of take() itself. The
      // injection that deleted that reassignment could not be made to fail,
      // because these two lines already did the whole job — dead code wearing a
      // guard's clothes, which is the shape scripts/verify-check-events.mjs has
      // now caught twice. Deleted; the assertion it looked like it served is
      // real and is served by these two lines.
      store = Object.create(null);
      lastId = null;
      return taken;
    }
  };
})();
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_PRE_HYDRATION_INPUT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
