#!/usr/bin/env node
/**
 * DID THIS ORDER COME FROM AN AD? THE QUESTION THAT HAD NO ANSWER.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * On 25 Aug 2026 the Google Ads account showed 201 clicks, $382.62 spent and
 * zero recorded conversions, while the business had taken two orders that day.
 * The obvious question — did the ads pay for either of them? — could not be
 * answered from Google (which records only what its own tag attributes) and
 * could not be answered from our database either.
 *
 * It could not be answered from our database because pages/apply.js:4197 and
 * pages/florida.js:114 had been capturing `gclid` into sessionStorage since the
 * ads launched and NOTHING EVER READ IT BACK. Not the checkout call, not the
 * Stripe metadata, not the orders table. The instrument was installed and every
 * reading was discarded.
 *
 * That is the specific failure this file guards: not "is attribution captured"
 * — it always was — but "does the captured value survive all the way to a row
 * somebody can query". Every assertion below is about one link in that chain,
 * because a chain that is four-fifths connected stores nothing.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} (got: ${JSON.stringify(got)})`));

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = (p) => strip(readFileSync(p, 'utf8'));

// ---------------------------------------------------------------------------
// A fake sessionStorage, so the real module runs rather than being described.
// ---------------------------------------------------------------------------
function withStorage(fn, { throwOnAccess = false } = {}) {
  const store = new Map();
  global.window = {
    location: { search: '' },
    sessionStorage: {
      getItem: (k) => { if (throwOnAccess) throw new Error('SecurityError'); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { if (throwOnAccess) throw new Error('SecurityError'); store.set(k, String(v)); },
    },
  };
  try { return fn(store); } finally { delete global.window; }
}

const A = await import('../lib/attribution.js');

// ---------------------------------------------------------------------------
// 1. CAPTURE
// ---------------------------------------------------------------------------
{
  withStorage((store) => {
    A.captureAttribution('?gclid=EAIaIQobChMI1234&utm_source=google&utm_campaign=fl-vab');
    t('a gclid is captured', A.getClickId() === 'EAIaIQobChMI1234', A.getClickId());
    t('utm params are captured separately from the click id',
      A.getUtm() === 'utm_source=google&utm_campaign=fl-vab', A.getUtm());
    t('the click id is NOT inside the utm blob',
      !A.getUtm().includes('gclid'),
      'the old code stored gclid inside the utm string, so it could not be read back on its own');
    t('storage keys are the ones the old code already used',
      store.has('taxappeal_gclid') && store.has('taxappeal_utm'),
      'changing the keys would silently drop the click of anyone mid-visit at deploy');
  });
}

// ---------------------------------------------------------------------------
// 2. iOS. Google sends gbraid/wbraid INSTEAD OF gclid on much of iOS traffic.
//    A capture that only knows `gclid` records nothing for those visitors, and
//    Florida homeowners are not a low-iOS audience.
// ---------------------------------------------------------------------------
{
  for (const param of ['gbraid', 'wbraid']) {
    withStorage(() => {
      A.captureAttribution(`?${param}=ABC123xyz`);
      t(`${param} is captured as a click id too`, A.getClickId() === 'ABC123xyz', A.getClickId());
    });
  }
}

// ---------------------------------------------------------------------------
// 3. FIRST WRITE WINS. A visitor who lands on an ad and then navigates must keep
//    the click that brought them.
// ---------------------------------------------------------------------------
{
  withStorage(() => {
    A.captureAttribution('?gclid=FIRST');
    A.captureAttribution('');                    // an internal page view
    A.captureAttribution('?gclid=SECOND');       // a second, later click
    t('a later page load does not erase the original click', A.getClickId() === 'FIRST', A.getClickId());
  });
}

// ---------------------------------------------------------------------------
// 4. NO AD. The common case: most visitors are organic and must produce no
//    keys at all, so a consumer can read absence as "not from an ad".
// ---------------------------------------------------------------------------
{
  withStorage(() => {
    A.captureAttribution('?state=FL');
    t('an organic visit captures no click id', A.getClickId() === '');
    t('an organic visit sends no attribution keys',
      Object.keys(A.attributionPayload()).length === 0, A.attributionPayload());
  });
}

// ---------------------------------------------------------------------------
// 5. IT MUST NOT BREAK A CHECKOUT. Private browsing and some webviews throw on
//    sessionStorage access; this runs inside doCheckout, so a throw is a lost sale.
// ---------------------------------------------------------------------------
{
  let threw = null;
  withStorage(() => {
    try { A.captureAttribution('?gclid=X'); A.attributionPayload(); }
    catch (e) { threw = e.message; }
  }, { throwOnAccess: true });
  t('storage that throws does not break the page', threw === null, threw);
}

// ---------------------------------------------------------------------------
// 6. THE CAP, which is load-bearing rather than tidy. Stripe rejects a metadata
//    value over 500 characters and fails the whole session — so an unbounded
//    ?gclid= in a crafted URL would have been a way to stop anyone buying.
// ---------------------------------------------------------------------------
{
  const huge = 'A'.repeat(10000);
  withStorage(() => {
    A.captureAttribution(`?gclid=${huge}&utm_source=${huge}`);
    t('a 10kb click id is capped well under the Stripe limit', A.getClickId().length <= 200, A.getClickId().length);
    t('a 10kb utm string is capped too', A.getUtm().length <= 300, A.getUtm().length);
  });
  const n = A.normalizeAttribution({ gclid: huge, utm: huge });
  t('the server caps it again rather than trusting the client', n.gclid.length <= 200 && n.utm.length <= 300);
  t('non-string input is coerced, not passed through',
    A.normalizeAttribution({ gclid: { toString: () => 'x'.repeat(9999) } }).gclid === '');
  t('whitespace is trimmed', A.normalizeAttribution({ gclid: '  abc  ' }).gclid === 'abc');
}

// ---------------------------------------------------------------------------
// 7. THE CHAIN. Each link, in the file that owns it. This is the part that was
//    broken: capture worked and everything after it did not exist.
// ---------------------------------------------------------------------------
{
  const apply = src('pages/apply.js');
  t('apply.js captures via the shared module', /captureAttribution\(/.test(apply));
  t('apply.js no longer writes sessionStorage attribution by hand',
    !/sessionStorage\.setItem\(['"]taxappeal_utm/.test(apply),
    'a second writer is how the click id ended up inside the utm blob');
  t('the checkout call carries the attribution',
    /\.\.\.attributionPayload\(\)/.test(apply),
    'THIS IS THE LINK THAT DID NOT EXIST — capture ran and nothing sent it');

  const florida = src('pages/florida.js');
  t('/florida uses the shared capture too', /captureAttribution\(/.test(florida));
  t('/florida no longer stores the whole query string as utm',
    !/setItem\(['"]taxappeal_utm['"],\s*src\.toString\(\)/.test(florida));

  const checkout = src('pages/api/checkout.js');
  t('checkout accepts gclid and utm from the body', /\bgclid,\s*utm,/.test(checkout));
  t('checkout normalises before use', /normalizeAttribution\(\{\s*gclid,\s*utm\s*\}\)/.test(checkout));
  t('checkout forwards both into Stripe metadata',
    /gclid:\s*attribution\.gclid/.test(checkout) && /utm:\s*attribution\.utm/.test(checkout));
  t('checkout does not put the RAW body value in metadata',
    !/gclid:\s*gclid\b/.test(checkout),
    'the cap only protects the session if the capped value is the one that is sent');

  const fulfill = src('lib/fulfillOrder.js');
  t('the order row records the click id', /gclid:\s*m\.gclid/.test(fulfill),
    'without this the value reaches Stripe and dies there');
  t('the order row records the utm', /utm:\s*m\.utm/.test(fulfill));

  // scripts/verify-schema.mjs reads only the first 3000 chars after
  // from('orders') to find written columns. fulfillOrder's own comments record
  // two columns having been pushed past that window by a long comment before.
  const insertAt = fulfill.indexOf("from('orders')\n    .insert(");
  const window3k = insertAt > -1 ? fulfill.slice(insertAt, insertAt + 3000) : '';
  t('gclid is written inside the window the schema guard can see',
    /gclid:/.test(window3k),
    'past 3000 chars the column becomes invisible to verify-schema and undeclared columns stop being caught');

  const cols = src('lib/orderColumns.js');
  t('gclid is a declared column', /'gclid'/.test(cols));
  t('utm is a declared column', /'utm'/.test(cols));

  const migration = readFileSync('scripts/migrations/2026-08-25-attribution.sql', 'utf8');
  t('the migration adds both columns',
    /add column if not exists gclid/i.test(migration) && /add column if not exists utm/i.test(migration));
  t('the migration is idempotent', /if not exists/i.test(migration));
}

// ---------------------------------------------------------------------------
console.log(`\nverify-attribution: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('A click id captured on the landing page reaches the order row.');
