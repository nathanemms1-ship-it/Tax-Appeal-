/**
 * WHERE A CUSTOMER CAME FROM, KEPT LONG ENOUGH TO BE WORTH KNOWING.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * pages/apply.js:4197 and pages/florida.js:114 have captured `gclid` — Google's
 * click identifier, the one thing that says "this visit came from an ad" — into
 * sessionStorage since the ads launched. Nothing ever read it back out. It was
 * not sent to /api/checkout, it was not in the Stripe metadata, and there is no
 * column for it on `orders`.
 *
 * So on 25 Aug 2026, with $382.62 spent and 201 clicks bought, the question
 * "did either of today's two sales come from an ad?" had no answer available
 * anywhere — not in Google Ads, which recorded zero conversions, and not in our
 * own database. We had the instrument and threw away every reading.
 *
 * ============================================================================
 * WHAT THIS IS NOT
 * ============================================================================
 * NOT a replacement for the Google Ads conversion tag. That tag reports back to
 * Google so its bidding can learn; this is our own record so WE can decide
 * whether the spend is working. They answer different questions and neither
 * substitutes for the other.
 *
 * NOT personal data. A gclid identifies a CLICK, not a person: it is issued by
 * Google, it is already in the URL the visitor arrives on, and it cannot be
 * resolved back to an individual by us or by anyone reading our database. It is
 * stored beside an order that already carries the customer's name and address,
 * and it tells us strictly less about them than those do.
 *
 * ============================================================================
 * WHY sessionStorage AND NOT A COOKIE
 * ============================================================================
 * The existing capture already uses it and it is the right choice: it survives
 * the whole visit including the Stripe redirect back to /success, it is scoped
 * to the tab, and it disappears when the visit ends. A cookie would outlive the
 * visit and start attributing later organic returns to an old ad click, which
 * is the failure mode that makes attribution data untrustworthy.
 *
 * The consequence to remember: this measures LAST-CLICK WITHIN ONE SESSION. A
 * homeowner who clicks an ad on Tuesday, thinks about it, and returns directly
 * on Friday is recorded as having no gclid. That undercounts ads rather than
 * overcounting them, which is the safer direction for a spending decision.
 */

const GCLID_KEY = 'taxappeal_gclid';
const UTM_KEY = 'taxappeal_utm';

/** Google's click id, plus the paid-click ids from the other two networks. */
const CLICK_ID_PARAMS = ['gclid', 'gbraid', 'wbraid'];

export const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

// Long enough for any real click id (a gclid runs ~90-100 chars; gbraid/wbraid
// are shorter) and short enough that a crafted URL cannot use this to stuff
// Stripe metadata, which caps a value at 500 characters.
const MAX_CLICK_ID = 200;
const MAX_UTM = 300;

function safeGet(key) {
  try {
    return typeof window === 'undefined' ? '' : (window.sessionStorage.getItem(key) || '');
  } catch (e) {
    // Private browsing and some embedded webviews throw on storage access. An
    // attribution read must never be the thing that breaks a checkout.
    return '';
  }
}

function safeSet(key, value) {
  try {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value);
  } catch (e) { /* see safeGet */ }
}

/**
 * Record the click id and campaign params from the landing URL.
 *
 * FIRST WRITE WINS, deliberately. A visitor who arrives on an ad and then
 * navigates internally must keep the click that brought them, not be overwritten
 * by a later page load that has no parameters — and not be overwritten by a
 * second, cheaper click either. Call it on every page that can be a landing
 * page; calling it twice is harmless.
 */
export function captureAttribution(search) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(search === undefined ? window.location.search : search);

  if (!safeGet(GCLID_KEY)) {
    for (const name of CLICK_ID_PARAMS) {
      const v = (params.get(name) || '').trim();
      if (v) { safeSet(GCLID_KEY, v.slice(0, MAX_CLICK_ID)); break; }
    }
  }

  if (!safeGet(UTM_KEY)) {
    const pairs = UTM_PARAMS
      .map((k) => [k, (params.get(k) || '').trim()])
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`);
    if (pairs.length) safeSet(UTM_KEY, pairs.join('&').slice(0, MAX_UTM));
  }
}

/** The click id for this visit, or '' if the visitor did not arrive on an ad. */
export function getClickId() {
  return safeGet(GCLID_KEY).slice(0, MAX_CLICK_ID);
}

/** The raw utm string for this visit, or ''. */
export function getUtm() {
  return safeGet(UTM_KEY).slice(0, MAX_UTM);
}

/**
 * What the checkout call should send. Keys are omitted entirely when empty
 * rather than sent as '' — an absent key reads as "no ad" in every consumer,
 * whereas an empty string has to be special-cased in each of them.
 */
export function attributionPayload() {
  const gclid = getClickId();
  const utm = getUtm();
  return { ...(gclid ? { gclid } : {}), ...(utm ? { utm } : {}) };
}

/**
 * Server side: normalise whatever arrived in the request body.
 *
 * Trims, caps, and coerces anything that is not a string to ''. The cap is the
 * load-bearing part — these values travel into Stripe metadata, where a value
 * over 500 characters is rejected and would fail the whole checkout session.
 */
export function normalizeAttribution(body = {}) {
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    gclid: str(body.gclid, MAX_CLICK_ID),
    utm: str(body.utm, MAX_UTM),
  };
}
