/**
 * DOES THE ARKANSAS/ALABAMA GATE ACTUALLY GATE ANYTHING?
 *
 * ============================================================================
 * WHY THIS SCRIPT IS SHAPED THE WAY IT IS
 * ============================================================================
 * The obvious test — "grep the built /alabama page and assert it does not say
 * $89" — is the kind of test this project has been burned by twice this week.
 * It passes just as happily if somebody deleted the price by hand, if the page
 * failed to render, or if the file were empty. An assertion on a case that
 * cannot fail is not a test.
 *
 * So this runs in two modes and the SECOND one is the point:
 *
 *   node scripts/verify-state-service.mjs closed
 *     Asserts the pages built from the CURRENT tree (AR and AL in SERVING_FROM)
 *     carry no price, no Offer markup, no buy button and no passed deadline —
 *     and DO carry the notify CTA.
 *
 *   node scripts/verify-state-service.mjs open
 *     Run against a build made with SERVING_FROM emptied. Asserts every one of
 *     those findings FLIPS BACK: the price returns, the Offer returns, the buy
 *     buttons return, the notify CTA disappears. If the `closed` assertions pass
 *     but these fail, the copy was deleted rather than gated, and the day
 *     Arkansas opens the pages will be silently unsellable.
 *
 * scripts/verify-state-service.sh drives both halves, including the rebuild.
 *
 * ============================================================================
 * WHAT IT READS
 * ============================================================================
 * .next/server/pages/*.html — the PRERENDERED output, not the source. Source
 * assertions in this repo have repeatedly proved properties of comments rather
 * than of code, and a ternary that never takes the branch you think it does
 * looks perfect in the source. Only the emitted HTML settles it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MODE = process.argv[2];
if (MODE !== 'closed' && MODE !== 'open') {
  console.error('usage: verify-state-service.mjs <closed|open>');
  process.exit(2);
}

const ROOT = process.cwd();
const OUT = join(ROOT, '.next', 'server', 'pages');

// The eleven hand-written pages, plus one prerendered instance of each dynamic
// template. getStaticPaths yields 20 Arkansas suburb pages from one file; if the
// template is right they are all right, and asserting on one real prerendered
// instance beats asserting on twenty copies of the same output.
const AR_PAGES = [
  'arkansas.html', 'little-rock.html', 'fayetteville.html', 'fort-smith.html', 'bentonville.html',
];
const AL_PAGES = [
  'alabama.html', 'birmingham.html', 'huntsville.html', 'mobile.html', 'montgomery.html', 'tuscaloosa.html',
];

let pass = 0, fail = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function read(rel) {
  const p = join(OUT, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

/**
 * The site-wide Service JSON-LD in pages/_app.js legitimately carries an Offer
 * with a $89-$139 price specification — it describes the business, whose
 * areaServed was already corrected to Texas/Georgia/Florida only. It renders on
 * every page including these, so a bare "no Offer anywhere" assertion would fail
 * for the wrong reason and then get weakened until it proved nothing.
 *
 * SITE_WIDE_SERVICE is that block's `name`, and excluding it by name is
 * deliberate: the first version of this function excluded any block mentioning
 * Texas, which silently matched nothing (the site-wide block lists its states as
 * bare strings, not {"@type":"State"} objects) and reported all twelve pages as
 * failures. A discriminator that is wrong in the safe direction is still wrong.
 * If _app.js's Service is ever renamed, this reports failures rather than
 * quietly counting one extra offer per page — which is the direction an
 * assertion should break in.
 */
const SITE_WIDE_SERVICE = '"name":"Property Tax Dispute Filing"';

function pageLevelOfferCount(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1]);
  return blocks.filter((b) => b.includes('"@type":"Offer"') && !b.includes(SITE_WIDE_SERVICE)).length;
}

// ---------------------------------------------------------------------------
// Find the dynamic Arkansas suburb page that actually got prerendered.
// ---------------------------------------------------------------------------
let suburbFile = null;
{
  const { readdirSync } = await import('node:fs');
  const dir = join(OUT, 'arkansas');
  if (existsSync(dir)) {
    const html = readdirSync(dir).filter((f) => f.endsWith('.html'));
    if (html.length) suburbFile = join('arkansas', html[0]);
  }
}
check('a prerendered Arkansas suburb page exists', !!suburbFile,
  'getStaticPaths yields 20 of them; none was found in .next/server/pages/arkansas');

const AR_ALL = suburbFile ? [...AR_PAGES, suburbFile] : AR_PAGES;
const ALL = [...AR_ALL, ...AL_PAGES];

// ---------------------------------------------------------------------------
// Every page has to exist and have rendered. A missing or stub file passing the
// "no price" assertions is exactly the false green this script exists to stop.
// ---------------------------------------------------------------------------
const docs = new Map();
for (const rel of ALL) {
  const html = read(rel);
  check(`${rel} was prerendered`, !!html);
  if (!html) continue;
  // A page that failed to render still writes a small shell. 8 KB is well under
  // the smallest of these pages (tuscaloosa, ~26 KB) and well over a shell.
  check(`${rel} rendered real content`, html.length > 8000, `only ${html.length} bytes`);
  docs.set(rel, html);
}

// ---------------------------------------------------------------------------
// THE ASSERTIONS. Each one states what must be true in THIS mode, and the same
// property must be false in the other — that is what makes the pair a test.
// ---------------------------------------------------------------------------
for (const [rel, html] of docs) {
  const isAR = AR_ALL.includes(rel);
  const state = isAR ? 'Arkansas' : 'Alabama';

  // 0. The discriminator itself. pageLevelOfferCount subtracts _app.js's
  //    site-wide Service block by name; if that block is renamed or dropped, the
  //    count silently changes meaning. Assert it is there so the exclusion is
  //    excluding something real, in both modes.
  check(`${rel}: the site-wide Service block is present`, html.includes(SITE_WIDE_SERVICE),
    'pageLevelOfferCount subtracts this by name — rename it and the counts stop meaning anything');

  // 1. The page-level schema.org Offer.
  const offers = pageLevelOfferCount(html);
  if (MODE === 'closed') {
    check(`${rel}: no page-level schema.org Offer`, offers === 0, `found ${offers}`);
  } else {
    // Only some of these pages ever carried one. Assert on the ones that did:
    // /alabama, /bentonville and the suburb template.
    const carried = rel === 'alabama.html' || rel === 'bentonville.html' || rel.startsWith('arkansas/');
    if (carried) check(`${rel}: schema.org Offer returns when selling`, offers >= 1, 'gated copy did not come back');
  }

  // 2. Buy buttons. These exact labels are what led into a funnel that refuses
  //    the state. Matching the label rather than "$89" keeps the site-wide
  //    footer/meta price out of it.
  const buyLabels = [
    'File My Appeal — $89', 'Start My Appeal — $89', 'Start my appeal →',
    `Start My ${state} Appeal — $89`, `Start my ${state} appeal — $89`,
    'File My Birmingham Appeal', 'File My Huntsville Appeal', 'File My Mobile Appeal',
    'File My Montgomery Appeal', 'File My Tuscaloosa Appeal',
  ];
  const found = buyLabels.filter((l) => html.includes(l.replace(/—/g, '—')));
  if (MODE === 'closed') {
    check(`${rel}: no buy button`, found.length === 0, `found ${JSON.stringify(found)}`);
  }

  // 3. The notify CTA — the thing that replaced them. In `open` mode it must be
  //    GONE, which is the assertion that proves SeasonNotice is gated on the
  //    same value the copy is and not just always-on.
  const hasNotify = html.includes(`Email me when ${state} opens`);
  if (MODE === 'closed') {
    check(`${rel}: offers a notify signup`, hasNotify);
  } else {
    check(`${rel}: notify signup withdrawn when selling`, !hasNotify);
  }

  // 4. Arkansas only — the passed deadline. On 25 Aug 2026 "August 17, 2026" is
  //    not a deadline, it is a date eight days gone, and these pages were still
  //    telling homeowners to beat it.
  if (isAR) {
    const stale = /August 17|Aug 17/.test(html);
    if (MODE === 'closed') {
      check(`${rel}: no passed August 17 deadline`, !stale);
    } else {
      check(`${rel}: the dated deadline copy returns when selling`, stale,
        'the date was deleted rather than gated');
    }
    // The rule is what a homeowner can act on in any year. It must be present
    // while we are closed; it is allowed either way when selling.
    if (MODE === 'closed') {
      check(`${rel}: states the statutory rule instead`, /third Monday in August/i.test(html));
    }
  }

  /**
   * 6. Doubled articles, on every page in both modes.
   *
   * STATE_DEADLINE_RULE.AR carries its own leading "the" so it reads correctly
   * after "due"/"by"/"at", which is the majority of its call sites. Six sentences
   * introduced it with another one, and "the the third Monday in August" shipped
   * to twenty-four prerendered pages before anyone read the output rather than
   * the source. It built cleanly and every other assertion passed.
   *
   * The lesson is not "proofread": it is that a phrase assembled from a shared
   * constant and per-page prose has a seam, and nothing else in this suite looks
   * at the seam. Cheap to check, and it catches the next one too.
   */
  const doubled = html.match(/\b(the|a|an|of|to|in|by) \1\b/i);
  check(`${rel}: no doubled article from template assembly`, !doubled,
    doubled ? `found "${doubled[0]}"` : '');

  // 5. Alabama only — the badge that claimed we were already serving.
  if (rel === 'alabama.html') {
    const badge = html.includes('Now Serving All 67 Alabama Counties');
    const claim = html.includes('Yes. TaxAppeal USA files appeals in all 67 Alabama counties');
    if (MODE === 'closed') {
      check('alabama.html: no "Now Serving" badge', !badge);
      check('alabama.html: no "we file in all 67 counties" FAQ answer', !claim);
    } else {
      check('alabama.html: "Now Serving" badge returns when selling', badge,
        'the badge was deleted rather than gated');
      check('alabama.html: the all-67-counties answer returns when selling', claim);
    }
  }
}

// ---------------------------------------------------------------------------
// THE COUNTY PAGES, WHICH ARE THE PART MOST AT RISK OF COLLATERAL DAMAGE.
//
// pages/counties/[slug].js renders 572 pages across five states from one file.
// 93 of them are Arkansas and Alabama counties that carried a schema.org Offer,
// two "$89" buy links and a "$89 — Flat fee" tile for a state apply.js refuses.
// The other 480 are Florida, Texas and Georgia — pages that sell, and that a
// careless edit to a shared template would break silently.
//
// So this asserts the gate BOTH WAYS on real prerendered output: the offer and
// the buy button are gone from AR/AL and still present on FL/TX/GA. A check that
// only looked at the Arkansas pages would pass just as happily if the change had
// stripped the price from every county page on the site.
// ---------------------------------------------------------------------------
{
  const { readdirSync } = await import('node:fs');
  const dir = join(OUT, 'counties');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.html')) : [];
  check('county pages were prerendered', files.length > 500, `found ${files.length}`);

  // The rendered label carries React's comment markers around the interpolated
  // word: `File My <!-- -->Appeal<!-- --> — $89 Flat`. Matching the literal
  // string without them silently matches nothing, which is how a "no buy button"
  // assertion passes on a page that has one.
  const BUY = /File My <!-- -->(Appeal|Protest)<!-- --> — \$89 Flat/;
  const NAV_BUY = /Start My <!-- -->(Appeal|Protest)<!-- --> — \$89/;

  const groups = { AR: [], AL: [], FL: [], TX: [], GA: [] };
  for (const f of files) {
    const m = f.match(/-([a-z]{2})\.html$/);
    if (m && groups[m[1].toUpperCase()]) groups[m[1].toUpperCase()].push(f);
  }
  for (const [code, list] of Object.entries(groups)) {
    check(`county pages found for ${code}`, list.length > 0, 'the filename selector has drifted');
  }

  // Sanity on the sample sizes, so a selector that stops finding pages reports a
  // failure rather than a vacuous pass.
  check('the AR/AL county sample is the ~93 pages this change touched',
    groups.AR.length + groups.AL.length >= 80,
    `found ${groups.AR.length + groups.AL.length}`);
  check('the selling-state county sample is the ~480 pages it must not touch',
    groups.FL.length + groups.TX.length + groups.GA.length >= 450,
    `found ${groups.FL.length + groups.TX.length + groups.GA.length}`);

  const sample = (list, k) => list.slice(0, k);
  const gatedCodes = MODE === 'closed' ? ['AR', 'AL'] : [];
  const sellingCodes = MODE === 'closed' ? ['FL', 'TX', 'GA'] : ['FL', 'TX', 'GA', 'AR', 'AL'];

  for (const code of gatedCodes) {
    for (const f of sample(groups[code], 6)) {
      const html = read(join('counties', f));
      check(`counties/${f}: no page-level Offer`, pageLevelOfferCount(html) === 0);
      check(`counties/${f}: no buy button`, !BUY.test(html) && !NAV_BUY.test(html));
      check(`counties/${f}: no "$89 flat fee" tile`, !html.includes('Flat fee — never a %'));
      check(`counties/${f}: offers a notify signup instead`, /Email me when (Arkansas|Alabama) opens/.test(html));
    }
  }

  for (const code of sellingCodes) {
    for (const f of sample(groups[code], 6)) {
      const html = read(join('counties', f));
      check(`counties/${f}: still carries its Offer`, pageLevelOfferCount(html) === 1,
        'a shared template edit must not strip the price from a state we sell');
      check(`counties/${f}: still carries its buy button`, BUY.test(html) && NAV_BUY.test(html));
      check(`counties/${f}: still carries the "$89 flat fee" tile`, html.includes('Flat fee — never a %'));
      check(`counties/${f}: shows no notify signup`, !/Email me when \w+ opens/.test(html));
    }
  }
}

// ---------------------------------------------------------------------------
// The funnel and the waitlist must read the SAME map as the pages. This is the
// half that stops the defect recurring: before this change the year lived as a
// literal in apply.js, a second literal in join-waitlist.js, and nowhere at all
// in the pages that sold the state.
// ---------------------------------------------------------------------------
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const apply = strip(readFileSync(join(ROOT, 'pages', 'apply.js'), 'utf8'));
  check('apply.js imports SERVING_FROM', /import\s*\{[^}]*SERVING_FROM[^}]*\}\s*from\s*['"]\.\.\/lib\/stateService['"]/.test(apply));
  check('apply.js has no hand-written servingFrom year',
    !/servingFrom:\s*\d{4}/.test(apply),
    'a literal year is still typed into SUPPORTED_STATES');
  check('apply.js reads AR/AL from the map',
    /servingFrom:\s*SERVING_FROM\.AR/.test(apply) && /servingFrom:\s*SERVING_FROM\.AL/.test(apply));

  const wl = strip(readFileSync(join(ROOT, 'pages', 'api', 'join-waitlist.js'), 'utf8'));
  check('join-waitlist.js imports waitlistFilingYear', /waitlistFilingYear/.test(wl));
  check('join-waitlist.js no longer hardcodes AR/AL',
    !/stateUpper\s*===\s*'AR'\s*\|\|\s*stateUpper\s*===\s*'AL'/.test(wl),
    'the hardcoded branch is still there');
  check('join-waitlist.js only ever moves the year forward',
    /Math\.max\(\s*filingYear\s*,\s*waitlistFilingYear/.test(wl),
    'assigning instead of maxing would undo the TX/GA past-window rule above it');
}

// ---------------------------------------------------------------------------
// waitlistFilingYear arithmetic, exercised against injected clocks rather than
// asserted about. `currentYear + 1` — what this replaced — is only right while
// today is 2026; the 2027 case below is the one it would have failed.
// ---------------------------------------------------------------------------
{
  const { waitlistFilingYear, SERVING_FROM, isStateServable, stateSaleStatus } =
    await import(join(ROOT, 'lib', 'stateService.js'));

  const d = (y, m, day) => new Date(y, m - 1, day);

  if (SERVING_FROM.AR) {
    check('AR signup in Aug 2026 is a 2027 filer', waitlistFilingYear('AR', d(2026, 8, 25)) === SERVING_FROM.AR);
    check('AR signup in Jan 2027 is still a 2027 filer — not 2028',
      waitlistFilingYear('AR', d(2027, 1, 4)) === SERVING_FROM.AR,
      `got ${waitlistFilingYear('AR', d(2027, 1, 4))}; the old currentYear+1 returned 2028`);
    check('AR is not servable', !isStateServable('AR'));
    check('AR sale status is not selling', stateSaleStatus('AR').selling === false);
    check('AR status names the year it opens', stateSaleStatus('AR').servingFrom === SERVING_FROM.AR);
  } else {
    check('AR is servable once removed from the map', isStateServable('AR'));
    check('AR sale status is selling', stateSaleStatus('ar').selling === true);
    check('a selling state signs up for the current year', waitlistFilingYear('AR', d(2026, 8, 25)) === 2026);
  }

  // Florida is in neither branch and must be unaffected by any of this.
  check('FL is servable regardless', isStateServable('FL'));
  check('FL signup takes the current year', waitlistFilingYear('FL', d(2026, 8, 25)) === 2026);
  check('stateSaleStatus is case-insensitive', stateSaleStatus('fl').selling === true);
}

// ---------------------------------------------------------------------------
console.log(`\n${MODE.toUpperCase()} mode: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('All assertions passed.');
