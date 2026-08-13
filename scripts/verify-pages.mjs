#!/usr/bin/env node
/**
 * Structural and content assertions on the BUILT HTML.
 *
 * WHY THIS EXISTS
 * ---------------
 * A bulk edit that removed the fabricated testimonials also deleted the entire
 * hero from /florida, /texas and /georgia. All three shipped to production with
 * no <h1>, no price and no call to action, and /florida is the page the Google
 * Ads campaign points at.
 *
 * Nothing caught it:
 *   - `next build` passed. The edit consumed a complete, well-formed JSX span,
 *     so the syntax stayed valid.
 *   - verify-sitemap passed. The routes still existed and still returned 200.
 *   - My own checks asked "is the forbidden phrase gone?" and "is the sourced
 *     figure present?". Both answer correctly on a page with no hero.
 *
 * The lesson is that "the text I targeted changed" is not the same as "the page
 * is still intact". This asserts the second thing. It reads the built HTML in
 * .next/server/pages, so it sees exactly what will be served.
 *
 * Add a page here whenever it becomes commercially important. Add a BANNED entry
 * whenever a claim is removed for a legal reason, so it cannot creep back.
 */

import fs from 'node:fs';
import path from 'node:path';

const DIR = '.next/server/pages';

// Pages that must be structurally complete. Landing pages carry paid traffic.
const REQUIRED = [
  'index', 'florida', 'texas', 'georgia', 'arkansas', 'alabama',
  'miami', 'tampa', 'orlando', 'jacksonville', 'fort-lauderdale',
  'houston', 'dallas', 'austin', 'san-antonio', 'fort-worth', 'atlanta',
  'bentonville', 'little-rock', 'fayetteville', 'fort-smith',
  'apply', 'terms', 'privacy',
];

// Claims removed for a legal reason. Each must never reappear in served HTML.
// Competitor descriptions are excluded by matching our own first-person framing.
const BANNED = [
  // (?<![\d.]) so a genuine effective tax rate like "0.82%" is not flagged.
  { re: /(?<![\d.])82%/, why: 'unsourceable approval rate — traces to no agency or study' },
  { re: /7,200\s*Homeowners/i, why: 'invented customer count' },
  { re: /\$3\.2\s*Million/i, why: 'invented savings total' },
  { re: /Michael R\.|Sandra T\.|James &amp; Lisa M\.|Real results from real/i, why: 'fabricated testimonial (16 CFR 465)' },
  { re: /Join thousands of/i, why: 'implies a customer base that does not exist' },
  { re: /\bwe handle everything\b/i, why: 'the owner signs the filing — see DisclaimerFooter' },
  { re: /Outside\s+Florida,\s*we are not/i, why: 'implied we ARE consultants in Florida' },
  { re: /prosecuting a petition/i, why: 'representation language — triggers DR-486POA' },
  { re: /Not with TaxAppeal USA/i, why: 'implied we attend hearings' },
  { re: /60[–-]80%/, why: 'uncited vendor figure' },
  { re: /\$\{totalChargeLabel\}/, why: 'un-interpolated template literal shipped to customers' },

  // ==========================================================================
  // ADDED 8 Aug 2026 — THE 82% RULE, GENERALISED
  // ==========================================================================
  // The entries above name specific lies we already found. That is why they did
  // not catch these, which sat live in the Florida blog for months:
  //
  //   "TaxAppeal USA's filing success rate runs consistently above 80%"
  //   "often 75-85% for residential properties with comparable sales support"
  //   "homeowners ... save an average of $1,100 per year"   (and $1,000, $1,320,
  //    $1,400, $1,450, $1,610, $1,660, $2,500 — eleven in total)
  //
  // TaxAppeal USA has never filed a petition, so every performance figure above
  // was invented. Same exposure as the original 82%: FTC Act s 5, 16 C.F.R. Part
  // 465, and Fla. Stat. s 501.2075 at up to $10,000 per violation counted per
  // dissemination — across 1,080 built pages.
  //
  // So the guard now bans the SHAPE of the claim, not the specific wording. A
  // number that survives these patterns has to come from lib/stats.js with a
  // source and a url, which is the rule that was supposed to apply all along.
  { re: /save[sd]?\s+an\s+average\s+of\s+\$/i, why: 'invented average-savings figure — no source publishes a per-customer average for us' },
  { re: /average\s+of\s+\$[\d,]+\s*(\/|per\s+)ye?a?r/i, why: 'invented average-savings figure' },
  { re: /\bour\s+(filing\s+)?success\s+rate\b/i, why: 'a first-person success rate — we have never filed a petition' },
  { re: /TaxAppeal\s+USA'?s?\s+(filing\s+)?success\s+rate/i, why: 'a first-person success rate — we have never filed a petition' },
  { re: /success\s+rate[^.]{0,40}(above|over|exceeds?)\s+\d{2}\s*%/i, why: 'unsourced success-rate claim' },
  { re: /\b\d{2}\s*-\s*\d{2}%\s+(of\s+)?(residential|petitions|appeals|protests|homeowners)/i, why: 'unsourced win-rate range — cite a DR-529 or nothing' },
  { re: /win\s+(partial\s+or\s+full\s+)?reductions?\s+in\s+the\s+majority/i, why: 'false — Florida ran 49% of petitions DECIDED, 22% of petitions filed, in TY2024' },
  // Negation-aware ON PURPOSE. The first version of this caught "TaxAppeal CANNOT
  // guarantee a reduction" on /texas — the disclaimer, not the claim. A guard that
  // flags its own safety language teaches people to delete safety language.
  { re: /(?<!cannot )(?<!can not )(?<!can't )(?<!do not )(?<!does not )(?<!don't )(?<!never )(?<!no )(?<!without a )\bguarantee[sd]?\s+(a\s+)?(reduction|savings?\b|win\b)/i,
    why: 'no outcome may be guaranteed — we are a preparer, not a representative' },

  // ==========================================================================
  // ADDED 13 Aug 2026 — COVERAGE IS COUNTED, NEVER ASSERTED
  // ==========================================================================
  // "All counties covered" sat in the CTA card of all 192 blog posts, directly
  // above the Start My Dispute button. The funnel accepts 56 of Florida's 67 and
  // refuses Arkansas and Alabama entirely, and /partners has published the honest
  // figure from lib/serviceCoverage.js since 11 Aug — so the site contradicted
  // itself, on the money card, on the pages paid traffic lands on.
  //
  // Unqualified is the whole problem. "All 254 Texas counties" is true and is what
  // the page renders now, because it is COUNTED. This bans the claim with no
  // number in it, which is the one nobody can check.
  { re: /All\s+counties\s+covered/i, why: 'unqualified coverage claim — render it from getServiceCoverage() so it counts both filing gates' },
];

/**
 * NOT in BANNED, deliberately. "All 67 Alabama counties covered" is live on
 * /alabama today, and /arkansas and index.js sell both states the same way —
 * that is the "Homepage sells Arkansas and Alabama" item already in the queue,
 * awaiting Nathan's decision on whether those pages go to waitlist copy or come
 * down. Putting it in BANNED makes the build red on a defect nobody has agreed
 * how to fix, and a red build people learn to ignore stops working entirely.
 *
 * So: a WARNING everywhere, matching how the AR/AL schema exposure is already
 * handled below — and a hard FAILURE on blog posts, where it was fixed today and
 * must not creep back.
 */
const AR_AL_COVERAGE = /\b(AR|AL|Arkansas|Alabama)\s+counties\s+covered/i;

function findHtml(name) {
  for (const p of [path.join(DIR, name + '.html'), path.join(DIR, name, 'index.html')]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Crude but dependency-free: strip script/style, then tags.
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

let failures = 0;
let warnings = 0;
console.log(`Page structure check — ${REQUIRED.length} pages`);

for (const name of REQUIRED) {
  const file = findHtml(name);
  if (!file) {
    console.error(`  FAIL  ${name}: no built HTML found in ${DIR}`);
    failures++;
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const text = visibleText(html);
  const problems = [];

  const h1s = html.match(/<h1[\s>]/gi) || [];
  if (h1s.length === 0) problems.push('no <h1> — page has no heading');
  if (h1s.length > 1) problems.push(`${h1s.length} <h1> elements (expected 1)`);

  // Legal/marketing pages legitimately have no price or CTA.
  const isContentPage = name === 'terms' || name === 'privacy';
  if (!isContentPage) {
    if (!/\$89/.test(text)) problems.push('no price ($89) anywhere on the page');
    if (!/<button[\s>]/i.test(html) && !/href="\/apply/.test(html)) {
      problems.push('no call to action (no <button>, no link to /apply)');
    }
  }

  // A landing page that collapses to almost nothing is the failure mode we hit.
  const words = text.trim().split(' ').length;
  if (words < 250) problems.push(`only ${words} words — page looks truncated`);

  for (const b of BANNED) {
    if (b.re.test(text)) problems.push(`banned claim present (${b.why})`);
  }

  if (problems.length) {
    failures++;
    console.error(`  FAIL  ${name}`);
    for (const p of problems) console.error(`          ${p}`);
  }
}

// Sweep every other built page for banned claims only.
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

if (fs.existsSync(DIR)) {
  const all = walk(DIR);
  const offenders = new Map();
  const brokenTitles = [];
  for (const f of all) {
    const html = fs.readFileSync(f, 'utf8');
    const text = visibleText(html);

    // A <title> holding an expression NEXT TO static text gets two children, and
    // React SSR separates adjacent children with an HTML comment. The result went
    // to Google as `Midland<!-- --> Property Tax Protest Service | ...` on 272 city
    // pages. next build passed, the page rendered, the title looked right in every
    // source file - it is only visible in the served HTML, which is what this reads.
    // Fix is always the same: one template literal instead of two children.
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title && title[1].includes('<!--')) brokenTitles.push(path.relative(DIR, f));

    for (const b of BANNED) {
      if (b.re.test(text)) {
        if (!offenders.has(b.why)) offenders.set(b.why, []);
        offenders.get(b.why).push(path.relative(DIR, f));
      }
    }
  }

  if (brokenTitles.length) {
    failures++;
    console.error(`\n  FAIL  ${brokenTitles.length} pages render an HTML comment inside <title>:`);
    console.error(`          ${brokenTitles.slice(0, 6).join(', ')}${brokenTitles.length > 6 ? ` … +${brokenTitles.length - 6} more` : ''}`);
    console.error(`          use a single template literal: <title>{\`\${x} rest of title\`}</title>`);
  } else {
    console.log(`  swept ${all.length} built pages for comment markers in <title> — none found`);
  }
  if (offenders.size) {
    failures++;
    console.error(`\n  FAIL  banned claims found across ${all.length} built pages:`);
    for (const [why, files] of offenders) {
      console.error(`          ${why}`);
      console.error(`            ${files.slice(0, 6).join(', ')}${files.length > 6 ? ` … +${files.length - 6} more` : ''}`);
    }
  } else {
    console.log(`  swept ${all.length} built pages for banned claims — none found`);
  }
}

// A city landing page that advertises a county VAB fee is quoting a number that lives in
// lib/flCountyFees.js, by hand, in prose. This has now broken twice: /orlando said $15 while
// checkout charged $50, and /jacksonville said $15 for a season after Duval adopted the $50
// cap. Both are pricing misrepresentations — Google Ads suspends accounts over the first one
// and FDUTPA covers the second — and both shipped green because no check connected the copy
// to the table. This asserts the built HTML quotes the fee we will actually charge.
const { getFlVabFee } = await import('../lib/flCountyFees.js');
const FEE_PAGES = [
  ['miami', 'Miami-Dade'], ['tampa', 'Hillsborough'], ['orlando', 'Orange'],
  ['jacksonville', 'Duval'], ['fort-lauderdale', 'Broward'],
];
for (const [page, county] of FEE_PAGES) {
  const file = findHtml(page);
  if (!file) continue;
  const html = fs.readFileSync(file, 'utf8');
  const dollars = getFlVabFee(county).vabFee / 100;
  /**
   * BOTH ORDERS. The amount can come before the keyword or after it.
   *
   * This pattern used to require the amount to PRECEDE the keyword, which made it
   * blind to the most natural way to write the sentence. On 11 Aug 2026 /orlando
   * carried a card headed "$50 County Fee Only" whose body read "Orange County's
   * VAB petition fee is just $15" — and this check passed green, because it matched
   * "$50 petition" in the heading and never saw the "$15" that came after "fee".
   * The build reported success on the third occurrence of the exact defect the
   * comment above says it exists to catch.
   *
   * A window rather than adjacency: any dollar amount within ~40 characters of a
   * fee keyword, in either direction. Wider nets more false positives in principle,
   * but every FL fee figure on these pages is either the county fee, the $89
   * service fee, or the all-in — and all three are already allowed below.
   */
  /**
   * A STATUTORY CEILING IS NOT A PRICE QUOTE. Exclusion added the moment the wider
   * window above was switched on, because it immediately failed a sentence that is
   * correct and worth keeping:
   *
   *   "Miami-Dade charges a $15 VAB filing fee (HB 7031 allows counties up to $50;
   *    Miami-Dade's own adopted rate is $15)."
   *
   * That is the fee explained properly — our figure, the statute's cap, and which
   * is which. A check that fails on it teaches people to delete the explanation,
   * which is the opposite of what this file is for. So cap phrasings are removed
   * before scanning; anything left near a fee keyword is a claim about what THIS
   * county charges.
   *
   * Deliberately narrow: only these three lead-ins, and only for the amount that
   * immediately follows one. "$50 petition fee" on a $15 county still fails.
   */
  const withoutCaps = html.replace(/\b(?:up to|as much as|maximum of|no more than|capped at)\s*\$\d{1,3}/gi, '');

  const NEAR = String.raw`[^<>$]{0,40}`;
  const quoted = [
    ...withoutCaps.matchAll(new RegExp(String.raw`\$(\d{1,3})${NEAR}(?:VAB|petition|filing)\s*fee`, 'gi')),
    ...withoutCaps.matchAll(new RegExp(String.raw`(?:VAB|petition|filing)\s*fee${NEAR}\$(\d{1,3})`, 'gi')),
    ...withoutCaps.matchAll(/\$(\d{1,3})\s*(?:per parcel\s*)?(?:county\s*)?(?:VAB|petition|filing)/gi),
  ].map((m) => Number(m[1]));
  const wrong = [...new Set(quoted.filter((n) => n !== dollars && n !== 89 && n !== 89 + dollars))];
  if (wrong.length) {
    failures++;
    console.error(`  FAIL  /${page} advertises a ${county} County fee of $${wrong.join(', $')} — the table says $${dollars}`);
    console.error(`          checkout charges from lib/flCountyFees.js, so the page is quoting a price we will not honour`);
  }
}
if (!failures) console.log(`  ${FEE_PAGES.length} FL city pages quote the same county fee checkout charges`);

// The 572 /counties/[slug] pages had no inbound link from anywhere on the site for
// most of this build's life - sitemap-only discovery. The state hubs are the only
// place that link them, so if a future edit turns that grid back into plain text
// the whole set silently goes orphan again, and nothing else in the build notices.
const { counties: ALL_COUNTIES } = await import('../lib/countyData.js');
for (const [hub, code] of [['florida', 'FL'], ['texas', 'TX'], ['georgia', 'GA']]) {
  const file = findHtml(hub);
  if (!file) continue; // already reported by the REQUIRED loop
  const html = fs.readFileSync(file, 'utf8');
  const expected = ALL_COUNTIES.filter((c) => c.code === code).length;
  const found = new Set([...html.matchAll(/href="\/counties\/([a-z0-9-]+)"/g)].map((m) => m[1])).size;
  if (found < expected) {
    failures++;
    console.error(`  FAIL  /${hub}: links ${found} of ${expected} ${code} county pages`);
    console.error(`          /counties/* is reachable from nowhere else — sitemap-only pages do not get indexed`);
  } else {
    console.log(`  /${hub} links all ${expected} ${code} county pages`);
  }
}

/**
 * ============================================================================
 * FLORIDA COUNTY PAGES: THE PETITION MUST BE ADDRESSED TO THE VAB CLERK
 * ============================================================================
 * Until 10 Aug 2026 every one of the 67 FL county pages told the homeowner we mail
 * the DR-486 "to the {county.district}" — the Property Appraiser. lib/flVabAddresses.js
 * opens with the reason that is wrong, in capitals: a petition mailed to the Property
 * Appraiser is never filed and the appeal year is lost. The filing pipeline was always
 * correct; only these pages described the wrong office, and nothing in the build noticed
 * because no check connected the page copy to the address table.
 *
 * This asserts the built HTML carries the county's actual VAB Clerk street address for
 * every county where we hold a confirmed one. It is the same shape as the FL city fee
 * check above, and for the same reason: the page and the operation must not be able to
 * drift apart silently.
 */
// getFlVabFee is already imported above for the FL city fee check.
const { getFlVabAddress } = await import('../lib/flVabAddresses.js');

const countyHtml = (slug) => findHtml(path.join('counties', slug));

/**
 * visibleText() strips tags but leaves HTML entities encoded, and these are government
 * office names: "Clerk of the Circuit Court & Comptroller" renders as `&amp;`, and
 * "Clerk's Finance Office" as `&#x27;`. Comparing a raw table value against that misses
 * 20 of the 59 counties — every one whose Clerk name contains an apostrophe or an
 * ampersand. Decode before matching rather than escaping the expectation, so the check
 * cannot be defeated by a different-but-equivalent encoding.
 */
const decodeEntities = (s) => s
  .replace(/&amp;/g, '&')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;|&#34;/g, '"')
  .replace(/&#x2F;/g, '/')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ');

let flChecked = 0, flSkipped = 0;
for (const c of ALL_COUNTIES.filter((c) => c.code === 'FL')) {
  const file = countyHtml(c.slug);
  if (!file) { flSkipped++; continue; }
  const html = fs.readFileSync(file, 'utf8');
  const vab = getFlVabAddress(c.name);

  // Counties without a CONFIRMED address deliberately render no address at all —
  // getFlVabAddress returns null and the page says so. Nothing to assert but the
  // absence of a fabricated one, which is what the null path guarantees.
  if (!vab) { flSkipped++; continue; }

  const text = decodeEntities(visibleText(html));
  if (!text.includes(vab.street)) {
    failures++;
    console.error(`  FAIL  /counties/${c.slug} does not carry the ${c.name} County VAB Clerk address`);
    console.error(`          expected "${vab.street}" — a DR-486 sent to the Property Appraiser instead is never filed`);
    continue;
  }

  /**
   * PRESENCE OF THE ADDRESS IS NOT ENOUGH — it must be named as the DESTINATION.
   *
   * The first version of this check only asserted the street address appeared somewhere
   * in the HTML. Reverting filingTargetFor() to `county.district` was then invisible to
   * it: the district card still printed the Clerk's address from the same table, while
   * the hero, the direct answer and the how-it-works step all went back to telling the
   * homeowner we mail to the Property Appraiser. The build stayed green on exactly the
   * bug this check exists to catch.
   *
   * So assert the preposition. "to the {Property Appraiser}" and "with the {Property
   * Appraiser}" are the phrasings of a mailing destination, and neither may appear on a
   * Florida county page. The negative lookbehind exempts "NOT to the {Property
   * Appraiser}", which is the page explicitly warning against the thing this checks for;
   * "Not the {Property Appraiser}" and the "Who Set Your Value" label never matched.
   */
  const misdirect = new RegExp(`(?<!\\bnot )\\b(?:to|with) the ${c.district.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (misdirect.test(text)) {
    failures++;
    console.error(`  FAIL  /counties/${c.slug} names the ${c.district} as the filing destination`);
    console.error(`          a DR-486 mailed to the Property Appraiser is never filed and the appeal year is lost`);
    console.error(`          the destination must be the VAB Clerk — see filingTargetFor() in pages/counties/[slug].js`);
    continue;
  }
  if (!text.includes(vab.vabName)) {
    failures++;
    console.error(`  FAIL  /counties/${c.slug} never names the ${c.name} County VAB Clerk in visible text`);
    continue;
  }

  // The fee must match the table checkout charges from, and the all-in must be $89 + it.
  const dollars = getFlVabFee(c.name).vabFee / 100;
  const quoted = [...html.matchAll(/\$(\d{1,3})\s*(?:per parcel\s*)?(?:county\s*)?(?:VAB|petition|filing)/gi)].map((m) => Number(m[1]));
  const wrong = [...new Set(quoted.filter((n) => n !== dollars && n !== 89 && n !== 89 + dollars))];
  if (wrong.length) {
    failures++;
    console.error(`  FAIL  /counties/${c.slug} advertises a ${c.name} County fee of $${wrong.join(', $')} — the table says $${dollars}`);
    continue;
  }
  flChecked++;
}
if (flChecked) {
  console.log(`  ${flChecked} FL county pages address the VAB Clerk and quote the fee checkout charges` +
    (flSkipped ? ` (${flSkipped} skipped — no confirmed address on file)` : ''));
}

/**
 * DEAD STRUCTURED DATA MUST NOT COME BACK.
 *
 * Google removed the HowTo rich result on 14 Sept 2023 and the FAQ rich result on
 * 7 May 2026 ("FAQ rich results are no longer appearing in Google Search"), withdrawing
 * both sets of documentation. Neither type produces anything in the SERP for a
 * commercial site today. They were shipping on all 573 county pages.
 *
 * BreadcrumbList is asserted positively because it is the one type on these pages that
 * still earns a rich result, and because the site went its whole life with visible
 * breadcrumb trails on /texas/[city] and /blog/[slug] and zero markup behind them —
 * which is exactly the sort of thing that gets quietly dropped in a refactor.
 */
{
  // The Florida surface, end to end: hub, metros, the city template and the county
  // template. Every one of these shipped FAQPage before 10 Aug 2026 and none of them
  // shipped BreadcrumbList. Sampled county pages cover one per state so a non-FL
  // regression is caught too.
  const FL_SURFACE = [
    'florida', 'miami', 'tampa', 'orlando', 'jacksonville', 'fort-lauderdale',
    path.join('florida', 'miami-beach'), path.join('florida', 'boca-raton'),
  ];
  const sampleCounties = ALL_COUNTIES
    .filter((c, i, a) => a.findIndex((x) => x.code === c.code) === i)
    .map((c) => path.join('counties', c.slug));

  let schemaChecked = 0;
  for (const name of [...FL_SURFACE, ...sampleCounties]) {
    const file = findHtml(name);
    if (!file) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const dead of ['FAQPage', 'HowTo']) {
      if (html.includes(`"@type":"${dead}"`) || html.includes(`"@type": "${dead}"`)) {
        failures++;
        console.error(`  FAIL  /${name} ships ${dead} structured data — Google stopped rendering it (HowTo Sept 2023, FAQ May 2026)`);
      }
    }
    if (!html.includes('BreadcrumbList')) {
      failures++;
      console.error(`  FAIL  /${name} has no BreadcrumbList — the only rich result these pages are still eligible for`);
    }
    schemaChecked++;
  }
  if (schemaChecked) console.log(`  ${schemaChecked} pages carry BreadcrumbList and no dead FAQ/HowTo markup`);
}

/**
 * FLORIDA CITY PAGES MUST LINK UP TO THEIR COUNTY.
 *
 * /texas/[city], /georgia/[city] and /arkansas/[city] have linked their county page
 * since the July 30 orphan fix. /florida/[city] never did — 131 pages, the largest city
 * set on the site, in the launch state, with no path to the page that carries the VAB
 * address, the filing fee and the millage.
 *
 * Also asserts the reverse edge: a county page with cities must link at least one of
 * them, so the two directions cannot silently come apart.
 */
{
  const { floridaCities } = await import('../lib/floridaCities.js');
  const flCounties = new Map(ALL_COUNTIES.filter((c) => c.code === 'FL').map((c) => [c.name, c.slug]));
  let up = 0, down = 0, missing = [];

  for (const city of floridaCities) {
    const file = findHtml(path.join('florida', city.slug));
    if (!file) continue;
    const wantSlug = flCounties.get(city.county);
    if (!wantSlug) { missing.push(`${city.slug} (no countyData match for "${city.county}")`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes(`/counties/${wantSlug}`)) missing.push(`/florida/${city.slug} → /counties/${wantSlug}`);
    else up++;
  }
  if (missing.length) {
    failures++;
    console.error(`  FAIL  ${missing.length} FL city pages do not link their county page`);
    console.error(`          ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` … +${missing.length - 5} more` : ''}`);
  } else if (up) {
    console.log(`  ${up} FL city pages link up to their county page`);
  }

  for (const [name, slug] of flCounties) {
    const kids = floridaCities.filter((c) => c.county === name);
    if (!kids.length) continue;
    const file = countyHtml(slug);
    if (!file) continue;
    const html = fs.readFileSync(file, 'utf8');
    if (!kids.some((k) => html.includes(`/florida/${k.slug}`))) {
      failures++;
      console.error(`  FAIL  /counties/${slug} links none of its ${kids.length} ${name} County city pages`);
    } else down++;
  }
  if (down) console.log(`  ${down} FL county pages link down to the cities they contain`);
}

/**
 * THE ADVERTISED FILING WINDOW MUST BE THE ONE THE FUNNEL HONOURS.
 *
 * /florida/[city] hardcoded `windowOpen = new Date('2026-08-11')` and "TRIM notices mail
 * around August 15" — both predating the correction in lib/filingWindows.js that moved
 * Florida's open date to 24 Aug. On 131 pages, from 11 Aug, the banner would have read
 * "Florida's filing window is open" for thirteen days while apply.js refused to file.
 *
 * Assert the built HTML does not contain a Florida open date other than the one
 * FILING_WINDOWS.FL declares.
 */
{
  const { FILING_WINDOWS } = await import('../lib/filingWindows.js');
  const w = FILING_WINDOWS.FL;
  const right = new Date(2026, w.openMonth - 1, w.openDay)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const stale = [];
  for (const slug of ['miami-beach', 'boca-raton', 'weston']) {
    const file = findHtml(path.join('florida', slug));
    if (!file) continue;
    const text = decodeEntities(visibleText(fs.readFileSync(file, 'utf8')));
    const dates = [...text.matchAll(/August \d{1,2}, 2026/g)].map((m) => m[0]);
    const wrong = [...new Set(dates.filter((d) => d !== right))];
    if (wrong.length) stale.push(`/florida/${slug}: ${wrong.join(', ')}`);
  }
  if (stale.length) {
    failures++;
    console.error(`  FAIL  FL city pages advertise an August date other than the ${right} open date in FILING_WINDOWS.FL`);
    stale.forEach((s) => console.error(`          ${s}`));
  } else {
    console.log(`  FL city pages quote the ${right} open date FILING_WINDOWS.FL declares`);
  }
}

/**
 * ============================================================================
 * THE FIVE HAND-WRITTEN METRO PAGES — DATES AND FILING DESTINATION
 * ============================================================================
 * Added 11 Aug 2026, after all five were found live and wrong on the same day.
 *
 * /orlando, /miami, /tampa, /jacksonville and /fort-lauderdale predate every
 * template on the site. They are in the sitemap at priority 0.8+ with ZERO inbound
 * internal links, so nothing points at them and nobody opens them. Two defects had
 * survived there for months:
 *
 *   1. `windowOpen = new Date('2026-08-11')`, so from 11 Aug they announced
 *      "Florida's filing window is open — file before your county's 25-day
 *      deadline" and linked to /apply, while apply.js refused anything but a
 *      pre-order until the 24th. The templated pages were fixed on 10 Aug; these
 *      were missed because the existing date check only sampled /florida/[city].
 *
 *   2. /miami and /tampa printed the PROPERTY APPRAISER's street address, phone
 *      and website under a heading about filing. lib/flVabAddresses.js opens with
 *      why that is not cosmetic: a DR-486 mailed there is never filed and the owner
 *      loses the year. The misdirect check that catches this already existed — it
 *      was scoped inside the /counties/* loop and never ran on these pages.
 *
 * Both checks below run on the metros specifically, because "it is covered by the
 * check for the templated pages" is exactly the assumption that let this ship.
 */
{
  const { FILING_WINDOWS } = await import('../lib/filingWindows.js');
  const { getFlVabAddress } = await import('../lib/flVabAddresses.js');
  const w = FILING_WINDOWS.FL;
  const rightOpen = new Date(2026, w.openMonth - 1, w.openDay)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const METROS = [
    ['orlando', 'Orange'], ['miami', 'Miami-Dade'], ['tampa', 'Hillsborough'],
    ['jacksonville', 'Duval'], ['fort-lauderdale', 'Broward'], ['florida', null],
  ];

  const staleDate = [], openClaim = [], misdirect = [];

  for (const [slug, county] of METROS) {
    const file = findHtml(slug);
    if (!file) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const text = decodeEntities(visibleText(raw));

    // (a) No August date other than the one FILING_WINDOWS.FL declares.
    const wrong = [...new Set([...text.matchAll(/August \d{1,2}, 2026/g)].map((m) => m[0]))]
      .filter((d) => d !== rightOpen);
    if (wrong.length) staleDate.push(`/${slug}: ${wrong.join(', ')}`);

    /**
     * (b) The banner itself. The date check alone would NOT have caught this —
     * `new Date('2026-08-11')` renders as "in N days" or as the open-window banner
     * and never prints a date string at all. So assert the claim directly: the page
     * may only say the window is open when FILING_WINDOWS.FL says it is.
     */
    const claimsOpen = /filing window is open/i.test(text);
    const actuallyOpen = (() => {
      const today = new Date();
      const open = new Date(2026, w.openMonth - 1, w.openDay);
      const close = new Date(2026, w.closeMonth - 1, w.closeDay);
      return today >= open && today <= close;
    })();
    if (claimsOpen && !actuallyOpen) openClaim.push(`/${slug}`);

    /**
     * (c) Where the petition goes.
     *
     * The rule is NOT "every metro page must print the VAB address" — my first
     * version asserted that and failed /orlando, /jacksonville and /fort-lauderdale,
     * which carry no filing address at all. That is a perfectly good page, and a
     * check that demands one invents a requirement instead of testing a defect.
     *
     * The real failure is a page that presents a filing destination which is not
     * the Value Adjustment Board. That has a recognisable shape: the words
     * "Property Appraiser" sitting next to a street address. Naming the office in
     * an explanatory FAQ ("What is the Miami-Dade Property Appraiser?") is correct
     * and must keep passing; printing its address under a heading about filing is
     * what sends a DIY homeowner's petition into a void.
     *
     * So: flag a Property Appraiser mention within 200 characters of something
     * shaped like a street address, unless the county's real VAB street is also on
     * the page.
     */
    if (county) {
      const vab = getFlVabAddress(county);
      const STREETISH = String.raw`\d{2,5}\s+[\w.\- ]{2,40}\b(?:St|Street|Ave|Avenue|Blvd|Boulevard|Way|Road|Rd|Drive|Dr)\b`;
      const near = new RegExp(String.raw`Property Appraiser[\s\S]{0,200}?${STREETISH}|${STREETISH}[\s\S]{0,200}?Property Appraiser`, 'i');
      if (near.test(text) && vab && !text.includes(vab.street)) {
        misdirect.push(`/${slug}: a street address sits beside "Property Appraiser" and the ${county} VAB address (${vab.street}) is absent`);
      }
    }
  }

  if (staleDate.length) {
    failures++;
    console.error(`  FAIL  metro pages advertise an August date other than the ${rightOpen} open date in FILING_WINDOWS.FL`);
    staleDate.forEach((x) => console.error(`          ${x}`));
  }
  if (openClaim.length) {
    failures++;
    console.error(`  FAIL  ${openClaim.join(', ')} claim the filing window is open while FILING_WINDOWS.FL says it is not`);
    console.error(`          this is the claim a hardcoded date produces WITHOUT printing a date, so the check above cannot see it`);
  }
  if (misdirect.length) {
    failures++;
    console.error(`  FAIL  a metro page sends petitions to the wrong office`);
    misdirect.forEach((x) => console.error(`          ${x}`));
  }
  /**
   * ==========================================================================
   * SOURCE SWEEP — because the HTML sweep above has two blind spots.
   * ==========================================================================
   * Found by injection-testing the checks above, which is the only reason I know:
   *
   *   - FAQ ANSWERS NEVER REACH THE BUILT HTML. They live in an accordion that
   *     renders on click, so a hardcoded "typically August 11, 2026" in a FAQ
   *     answer is invisible to visibleText(). Reintroducing exactly that string on
   *     /jacksonville passed every check above.
   *   - A WRONG ADDRESS PASSES IF THE RIGHT ONE IS ALSO PRESENT. The misdirect
   *     check excuses a page that carries the real VAB street somewhere, so
   *     swapping the contact card back to the Property Appraiser's address went
   *     green while the page displayed both.
   *
   * The fix is to stop sniffing rendered output for these two and read the source.
   * A hardcoded Florida date or a hardcoded street literal in one of these files is
   * wrong on its face, whether or not it happens to render today — that is the
   * whole reason they are derived.
   */
  const srcStale = [];
  for (const [slug, county] of METROS) {
    const file = path.join('pages', `${slug}.js`);
    if (!fs.existsSync(file)) continue;
    // Comments quote the strings they replaced, deliberately. Read code only.
    const code = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    /**
     * August and September only. `preOrderOpen = new Date('2026-06-12')` is a
     * legitimate literal — the pre-order date is 60 days ahead of the window and is
     * not a field in FILING_WINDOWS, so there is nothing to derive it from. My first
     * pattern covered June too and failed all five pages on a constant that is
     * correct. The defect is a hardcoded OPEN or CLOSE date, which is 08 or 09.
     */
    if (/new Date\('2026-0[89]-\d{2}'\)/.test(code)) {
      srcStale.push(`/${slug}: hardcoded window open/close date — derive it from FILING_WINDOWS.FL`);
    }
    const months = [...new Set([...code.matchAll(/(?:August|September) \d{1,2}, 2026/g)].map((m) => m[0]))];
    if (months.length) {
      srcStale.push(`/${slug}: hardcoded date literal ${months.join(', ')} — FAQ answers never reach the built HTML, so only this check sees them`);
    }
    if (county) {
      const vab = getFlVabAddress(county);
      const streets = [...new Set([...code.matchAll(/["'`]\s*\d{2,5}\s+[\w.\- ]{2,40}\b(?:St|Street|Ave|Avenue|Blvd|Boulevard)\b[^"'`]{0,40}["'`]/g)].map((m) => m[0].trim()))];
      const bad = streets.filter((t) => !vab || !t.includes(vab.street));
      if (bad.length) {
        srcStale.push(`/${slug}: hardcoded street literal ${bad.join(' | ')} — the filing address must come from getFlVabAddress('${county}')`);
      }
    }
  }
  if (srcStale.length) {
    failures++;
    console.error(`  FAIL  a metro page hardcodes a date or an address instead of deriving it`);
    srcStale.forEach((x) => console.error(`          ${x}`));
  }

  if (!staleDate.length && !openClaim.length && !misdirect.length && !srcStale.length) {
    console.log(`  ${METROS.length} metro pages derive the ${rightOpen} open date and name the VAB Clerk`);
  }
}

/**
 * ============================================================================
 * BLOG COUNTY GUIDES MUST QUOTE THE FEE CHECKOUT CHARGES
 * ============================================================================
 * Added 11 Aug 2026. Ten published Florida county guides carried
 * "<County> VAB filing fee: Approximately $15 per petition" while
 * lib/flCountyFees.js charged $40–$50 — Polk, St. Johns, Osceola, St. Lucie,
 * Alachua, Escambia and Bay were all $15 against $50. HB 7031 raised the cap from
 * $15 to $50 on 1 July 2025 and those counties adopted it; the posts were written
 * before that and nothing connected them to the table.
 *
 * This is the same defect class the FEE_PAGES check above exists for, one layer
 * out: the metro landing pages were checked and the 192 blog posts were not, even
 * though a county guide is the page most likely to be read by someone deciding
 * whether to file in that specific county.
 *
 * Two rules, because a county we cannot file in is a different failure from a
 * county whose price we have wrong:
 *   - sellable county  -> the post must quote the table fee, and no other amount
 *   - unsellable county -> the post must NOT quote a fee at all. Nassau's $50 is a
 *     GUESS; send-letter.js refuses to mail a guessed amount and the funnel
 *     declines the order, so advertising any figure there is a price we will not
 *     honour.
 */
{
  const { getFlVabFee } = await import('../lib/flCountyFees.js');
  const { isFlCountySupported, FL_COUNTY_NAMES } = await import('../lib/flVabAddresses.js');
  const src = fs.readFileSync(path.join('lib', 'blogPosts.js'), 'utf8');

  /**
   * SCAN THE WHOLE POST, NOT ONE PHRASING.
   *
   * The first version of this check matched only the bullet form
   * `"<County> VAB filing fee: $NN per petition"`. It went green while every one of
   * these guides ALSO carried a FAQ entry — `"What is the Polk County VAB filing
   * fee?", "Approximately $15 per petition"` — that it never looked at. Result:
   * /blog/polk-county-... shipped saying $50 in the fee breakdown and $15 in the
   * FAQ, contradicting itself on one page, while this check reported success. It
   * was caught by opening the live page, not by the build.
   *
   * So: split the file into posts, and for each post that names a Florida county,
   * check EVERY dollar amount sitting near fee language anywhere in that post.
   * A page states one price or it is wrong.
   */
  /**
   * SCAN EVERY STRING LITERAL, IN EVERY POST, FOR EVERY COUNTY.
   *
   * Third rewrite, and the reason is the same each time: the check keyed on ONE
   * shape of claim and declared the class clean.
   *
   *   v1  matched the bullet `"<County> VAB filing fee: $NN"` and missed the FAQ
   *       answers, so Polk shipped saying $50 in the bullet and $15 in the FAQ.
   *   v2  added FAQ pairs but still identified ONE county per post, so
   *       /blog/florida-vab-filing-fee-by-county-2026 — a post whose entire purpose
   *       is an eleven-county fee table — was skipped end to end. Clay sat there
   *       reading "$35-$50 per petition" against a $35 charge.
   *
   * So: no per-post county. Walk the string literals; any literal that names a
   * Florida county AND talks about a fee gets its amounts checked against that
   * county's row. A FAQ question pulls in the following literal (its answer), and
   * only then — a bullet must not borrow the next bullet's numbers.
   */
  const claims = [];
  const CAP_PHRASING = /\b(?:up to|as much as|maximum(?: of| to)?|no more than|capped at|range[sd]? from)\b[^.]{0,30}/gi;

  for (const chunk of src.split(/slug: "/).slice(1)) {
    const slug = (chunk.match(/^([^"]+)"/) || [])[1] || '(unknown)';
    /**
     * The leading quote is restored on purpose. `split(/slug: "/)` cuts AFTER the
     * opening quote of the slug, so the first quote in the chunk is a CLOSING one
     * and every quote pair from there on is offset by one — each "literal" I
     * extracted was the text BETWEEN two real literals. The check found zero fee
     * claims in a file full of them and reported success.
     */
    const literals = [...('"' + chunk).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);

    for (let i = 0; i < literals.length; i++) {
      const lit = literals[i];
      /**
       * EXACTLY ONE COUNTY, OR IT IS NOT A PER-COUNTY CLAIM.
       *
       * `.find()` returned whichever county sorted first, so the sentence "We pull
       * your Miami-Dade, Broward, or Palm Beach County assessment data" was
       * attributed to Broward and judged against Broward's $25. A literal naming
       * several counties is a general statement by definition; there is no single
       * fee it could be quoting.
       */
      const named = FL_COUNTY_NAMES.filter((n) => lit.includes(n));
      if (named.length !== 1) continue;
      const county = named[0];
      if (!/(?:VAB|petition|filing)\s*fee|per petition/i.test(lit)) continue;

      // A question borrows its answer. Nothing else borrows anything.
      const scan = (lit + (lit.trim().endsWith('?') ? ' ' + (literals[i + 1] || '') : ''))
        .replace(CAP_PHRASING, '');   // a statutory ceiling is not a price quote

      /**
       * PROXIMITY, NOT CO-PRESENCE. Within a sentence of the fee language.
       *
       * Taking every amount in the literal was too coarse: a body paragraph that
       * names the county, mentions a filing fee somewhere, and also quotes typical
       * savings produced "Manatee quotes $540, $660" against a $50 fee. Ten posts
       * failed on figures that were never fee claims.
       *
       * `[^.]{0,60}` keeps the match inside one sentence, which is the natural
       * boundary in prose and costs nothing in the bullets and FAQ answers, where
       * the amount sits directly beside the words.
       */
      const FEE = String.raw`(?:VAB|petition|filing)\s*fee|per petition`;
      const WIN = String.raw`[^.]{0,60}`;
      const amounts = [
        ...scan.matchAll(new RegExp(String.raw`\$(\d{1,3})(?![\d,.])${WIN}(?:${FEE})`, 'gi')),
        ...scan.matchAll(new RegExp(String.raw`(?:${FEE})${WIN}\$(\d{1,3})(?![\d,.])`, 'gi')),
      ].map((m) => Number(m[1]));
      const rangeTops = [
        ...scan.matchAll(new RegExp(String.raw`\$\d{1,3}\s*[-\u2013]\s*\$?(\d{1,3})(?![\d,.])${WIN}(?:${FEE})`, 'gi')),
        ...scan.matchAll(new RegExp(String.raw`(?:${FEE})${WIN}\$\d{1,3}\s*[-\u2013]\s*\$?(\d{1,3})(?![\d,.])`, 'gi')),
      ].map((m) => Number(m[1]));
      const all = [...new Set([...amounts, ...rangeTops])];
      if (all.length) claims.push([slug, county, all]);
    }
  }

  const bad = [];

  for (const [slug, county, amounts] of claims) {
    const fee = getFlVabFee(county);
    const sellable = isFlCountySupported(county) && fee.confidence === 'confirmed';
    const dollars = fee.vabFee / 100;

    if (!sellable) {
      // The all-in figure cannot appear either, since there is no order to price.
      if (amounts.length) {
        bad.push(`${slug}: quotes $${amounts.join(', $')} but the ${county} fee is ${fee.confidence} and checkout refuses those orders`);
      }
      continue;
    }
    const wrong = amounts.filter((n) => n !== dollars && n !== 89 && n !== 89 + dollars);
    if (wrong.length) {
      bad.push(`${slug}: quotes $${wrong.join(', $')} for ${county} — lib/flCountyFees.js charges $${dollars}`);
    }
  }

  if (bad.length) {
    failures++;
    console.error(`  FAIL  ${bad.length} blog county guide(s) quote a VAB fee that is not what checkout charges`);
    bad.forEach((b) => console.error(`          ${b}`));
  } else if (claims.length >= 15) {
    console.log(`  ${claims.length} blog fee claims match what checkout charges`);
  } else {
    /**
     * A CHECK THAT MATCHES NOTHING IS NOT A PASSING CHECK.
     *
     * The rewrite above shipped once with an off-by-one in the literal pairing. It
     * found zero claims, printed nothing, and let the suite go green over a file
     * with dozens of fee statements in it. Silence looked identical to success.
     *
     * There are at least 15 per-county fee claims in blogPosts.js today. If this
     * ever sees materially fewer, the extractor has broken — which is a louder
     * problem than any single wrong fee.
     */
    failures++;
    console.error(`  FAIL  the blog fee check found only ${claims.length} claims — it has stopped matching, not started passing`);
  }
}

const t2 = (label, ok, detail) => {
  if (ok) { console.log(`  ${label}`); return; }
  failures++;
  console.error(`  FAIL  ${label}`);
  if (detail) console.error(`          ${detail}`);
};

/**
 * ============================================================================
 * THE CONTRACT NAMES A LEGAL ENTITY, SPELLED THE WAY THE STATE SPELLS IT
 * ============================================================================
 * Added 11 Aug 2026, when the Texas certificate landed.
 *
 * Until today /terms identified the counterparty as "TaxAppeal USA" — a brand.
 * A brand cannot be a party to an agreement, and the reason it said that was
 * deliberate: the registered entity was still `TX Vape Vendor LLC` and naming it
 * on a property-tax contract was worse than naming nothing.
 *
 * Two things now have to stay true, and they pull in opposite directions:
 *   - the LEGAL name must appear on the contract and in the CAN-SPAM footers
 *   - it must be spelled EXACTLY as the certificate spells it, because Google
 *     advertiser verification, Stripe and the bank all compare it against the
 *     state record. "TaxAppeal USA LLC" (one word) is NOT the registered name.
 *   - and the former name must never come back onto a customer-facing page.
 */
{
  const { LEGAL_ENTITY, BUSINESS_NAME } = await import('../lib/businessInfo.js');

  t2('the registered name is spelled as the certificate spells it',
    LEGAL_ENTITY === 'Tax Appeal USA LLC',
    `businessInfo says "${LEGAL_ENTITY}" — Texas SOS file 806147096 says "Tax Appeal USA LLC"`);
  t2('the brand and the legal name are still different strings',
    BUSINESS_NAME !== LEGAL_ENTITY && !BUSINESS_NAME.includes('LLC'),
    'collapsing them puts "LLC" in page headers and a brand on the contract');

  const terms = fs.readFileSync(findHtml('terms') || '/dev/null', 'utf8');
  const termsText = decodeEntities(visibleText(terms));
  t2('/terms names the contracting entity',
    termsText.includes(LEGAL_ENTITY),
    'section 1 identified only the brand, which is not a party capable of contracting');
  t2('/terms states the entity type and home state',
    /limited liability company/i.test(termsText) && /Texas/i.test(termsText));

  // The old shell company must not reappear anywhere a customer can read it.
  const built = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else if (e.name.endsWith('.html')) built.push(f);
    }
  })(DIR);
  const vape = built.filter((f) => /TX Vape Vendor/i.test(fs.readFileSync(f, 'utf8')));
  t2('the former entity name appears on no page',
    vape.length === 0,
    `found on: ${vape.slice(0, 3).join(', ')}`);
}

/**
 * EVERY PUBLISHED PRICE MUST BE THE PRICE CHECKOUT CHARGES.
 *
 * $89 is our service fee. In Florida, checkout adds the county's VAB filing fee —
 * $15 to $50 across these 131 cities — so the real total is $104 to $139. Eleven
 * separate claims on this one template stated $89 as the whole price, and two were
 * worse than an omission: the meta description and the deadline FAQ both said "with
 * the county filing fee paid", which tells the homeowner we absorb it, and the
 * competitor table put a bare "$89" in a column headed "Cost" directly against
 * Ownwell's percentage.
 *
 * These are the pages Google Ads lands paid Florida traffic on from 24 Aug, so the
 * gap between the advertised number and the charged number is a refund request and
 * an Ads policy problem, not a bounce. This is the fourth time a wrong fee has
 * shipped, which is why the check reads the BUILT pages rather than the source.
 *
 * The assertion is deliberately the ARITHMETIC — "$104 in total" — not the presence
 * of the words "filing fee". A page can say "filing fee" and still quote the wrong
 * number; it can only carry the right total if it derived it from getFlVabFee(),
 * which is the table send-letter.js cuts the cheque from.
 *
 * A page whose county has no confirmed 2026 fee is the inverse case: checkout
 * REFUSES those orders, so quoting any total there would be inventing one. Those
 * pages must show no total and must carry the notice instead.
 */
{
  const { floridaCities } = await import('../lib/floridaCities.js');
  const { getFlVabFee, formatVabFee } = await import('../lib/flCountyFees.js');

  // Phrases that state $89 as the whole price, or say we cover the county's fee.
  // Every one of these was live on all 131 pages.
  const BANNED = [
    'county filing fee paid',
    'just $89 flat',
    'for a flat $89 fee',
    'all for a flat $89',
    'Flat $89 fee - no percentages',
  ];

  let checked = 0, confirmedPages = 0, unconfirmedPages = 0;
  const wrongTotal = [], banned = [], badTitle = [], bareCost = [], missingNotice = [], inventedTotal = [];

  for (const city of floridaCities) {
    const file = findHtml(path.join('florida', city.slug));
    if (!file) continue;
    checked++;
    const raw = fs.readFileSync(file, 'utf8');
    const text = decodeEntities(visibleText(raw));
    const head = decodeEntities(raw.slice(0, raw.indexOf('</head>') + 7));

    for (const p of BANNED) {
      if (text.includes(p) || head.includes(p)) banned.push(`/florida/${city.slug}: "${p}"`);
    }

    // The cost cell in the competitor table. A tag-delimited "$89" can only be a
    // standalone cell or button — never part of "$89 plus the county's fee".
    if (/>\s*\$89\s*</.test(raw)) bareCost.push(`/florida/${city.slug}`);

    const fee = getFlVabFee(city.county);
    if (fee.confidence === 'confirmed') {
      confirmedPages++;
      const total = formatVabFee(8900 + fee.vabFee);
      if (!text.includes(`${total} in total`)) {
        wrongTotal.push(`/florida/${city.slug} (${city.county}): expected "${total} in total"`);
      }
      // The title is the ad headline and the search snippet — the first price seen.
      const title = decodeEntities((raw.match(/<title[^>]*>(.*?)<\/title>/) || [])[1] || '');
      if (!title.includes(total)) badTitle.push(`/florida/${city.slug}: <title> omits ${total}`);
    } else {
      unconfirmedPages++;
      if (/\$\d+ in total/.test(text)) {
        inventedTotal.push(`/florida/${city.slug} (${city.county}) quotes a total for a county whose fee is unconfirmed`);
      }
      if (!text.includes('has not set its 2026 filing fee')) {
        missingNotice.push(`/florida/${city.slug} (${city.county})`);
      }
    }
  }

  // A check that stops matching must not look like a check that passes. The blog fee
  // check silently found ZERO claims and reported success; this floor is that lesson.
  if (checked < 120) {
    failures++;
    console.error(`  FAIL  FL city price check inspected only ${checked} pages — expected 120+. Did the build or the slug path change?`);
  }
  // The two branches are NOT symmetrical, and treating them as one assertion made this
  // fail for the best possible reason on 13 Aug 2026: Nathan got Nassau's and Columbia's
  // fees confirmed by phone, every remaining FL city landed in a confirmed-fee county,
  // and a green business outcome turned the build red.
  //
  // `confirmedPages` at zero is still a hard failure — that is the branch that prints a
  // price, and if it stops being exercised the price assertions are testing nothing.
  //
  // `unconfirmedPages` at zero means something different: no city page currently sits in
  // a county with a guessed fee, which is the state we are working towards. The branch is
  // untested because the case does not exist, not because the check broke. That is a
  // WARNING — it still needs saying out loud, because if a county ever regresses to
  // `estimated` this is the code that must catch it and nobody will have run it in months.
  if (!confirmedPages) {
    failures++;
    console.error(`  FAIL  FL city price check saw ${confirmedPages} confirmed-fee pages — the priced branch is not being exercised at all`);
  } else if (!unconfirmedPages) {
    warnings++;
    console.error(`  WARN  FL city price check found no unconfirmed-fee city pages — every FL city is now in a confirmed-fee county, so the "fee not set" branch is untested until one regresses`);
  }

  const report = (list, label) => {
    if (!list.length) return;
    failures++;
    console.error(`  FAIL  ${list.length} ${label}`);
    list.slice(0, 4).forEach((s) => console.error(`          ${s}`));
    if (list.length > 4) console.error(`          … +${list.length - 4} more`);
  };
  report(banned, 'FL city pages carry a phrase stating $89 as the total price');
  report(wrongTotal, 'FL city pages do not quote the total their county fee produces');
  report(badTitle, 'FL city page titles omit the total');
  report(bareCost, 'FL city pages put a bare $89 in the competitor cost table');
  report(inventedTotal, 'FL city pages quote a total for an unconfirmed county fee');
  report(missingNotice, 'FL city pages with an unconfirmed fee omit the notice saying so');

  if (!banned.length && !wrongTotal.length && !badTitle.length && !bareCost.length &&
      !inventedTotal.length && !missingNotice.length && checked >= 120) {
    console.log(`  ${confirmedPages} FL city pages quote their own county's total; ${unconfirmedPages} with an unconfirmed fee quote none`);
  }
}

/**
 * WE DO NOT SERVE ARKANSAS OR ALABAMA, AND THE STRUCTURED DATA SAID WE DID.
 *
 * SUPPORTED_STATES in pages/apply.js marks both `servingFrom: 2027`, so StepProperty
 * refuses them before checkout. The Organization and Service JSON-LD in pages/_app.js
 * named both — in areaServed and in the description — on EVERY page on the site,
 * including all 131 Florida city pages. The Organization block's own areaServed had
 * already been corrected to the three real states while the sentence beside it had
 * not, so one file disagreed with itself.
 *
 * Asserted over the built HTML's JSON-LD, site-wide, because that is where the claim
 * was and it is invisible to anyone reading the rendered page.
 */
{
  const built = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else if (e.name.endsWith('.html')) built.push(f);
    }
  })(DIR);

  /**
   * SCOPE, STATED PLAINLY: the /arkansas and /alabama page trees are EXCLUDED here.
   *
   * Those 181 pages describe themselves, so they name their own state by design.
   * They are also a live problem in their own right — they run "$89" buy CTAs
   * against an August 17 deadline for a state apply.js refuses — but removing or
   * converting them is a decision about 181 indexed SEO pages, not a copy fix, and
   * it is tracked separately in the open-items queue.
   *
   * What this check DOES cover is the leak: the site-wide Organization and Service
   * JSON-LD in pages/_app.js named both states on every page on the site, which is
   * how a Miami Beach page came to tell Google we serve Alabama.
   */
  // Bind the assertion to the statement it guards. The defect was the two SHARED
  // blocks in pages/_app.js, which render into every page's <head>. Fingerprinting
  // those blocks turned out to be unreliable — /arkansas/[city] emits a Service block
  // with the same serviceType — so assert instead over pages that have no legitimate
  // reason to name either state: the 131 Florida city pages and the 67 Florida county
  // pages. AR or AL appearing in JSON-LD there can only have come from a shared block.
  //
  // A page-wide grep is the wrong tool here: it sweeps in /arkansas describing itself
  // and blog posts naming the state in prose, neither of which this fix touched, and
  // the check stops meaning anything.
  // /counties/ holds every state's county pages — autauga-county-al lives there too —
  // so match Florida's by the -fl slug suffix, not by the directory.
  const flPages = built.filter((f) => /[\\/]florida[\\/]/.test(f) || /[\\/]counties[\\/][a-z0-9-]+-fl\.html$/.test(f));
  const claiming = flPages.filter((f) => {
    const ld = [...fs.readFileSync(f, 'utf8').matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]).join(' ');
    return /Arkansas|Alabama/i.test(ld);
  });
  t2('no Florida page carries Arkansas or Alabama in its structured data',
    claiming.length === 0,
    `${claiming.length} pages, e.g. ${claiming.slice(0, 3).join(', ')} — it can only come from the shared _app.js schema, and apply.js refuses both states`);
  if (flPages.length < 150) {
    failures++;
    console.error(`  FAIL  shared-schema check inspected only ${flPages.length} Florida pages — expected 150+; the path selector has drifted`);
  }

  // NOT a failure, but it must not be invisible: the /arkansas and /alabama pages,
  // the AR/AL metro pages and some blog posts still advertise those states in their
  // own right, with live $89 CTAs against deadlines apply.js will not file. That is a
  // decision about ~159 indexed pages — delete, or convert to waitlist — not a copy
  // fix, and it is tracked in the open-items queue.
  const stillAdvertising = built.filter((f) => {
    const ld = [...fs.readFileSync(f, 'utf8').matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]).join(' ');
    return /Arkansas|Alabama/i.test(ld);
  });
  if (stillAdvertising.length) {
    warnings++;
    console.warn(`  WARN  ${stillAdvertising.length} pages still name Arkansas or Alabama in their own schema — apply.js refuses both. Tracked as an open item, not fixed here.`);
  }

  /**
   * $89 as a whole price range is correct in Texas and Georgia, where there is no
   * filing fee, and wrong in Florida, where checkout adds the county's VAB fee. The
   * first version of this check asserted it site-wide and failed 141 Georgia city
   * pages that were telling the truth — a check has to know which claim it is
   * testing, not just which string.
   */
  const flBare = built.filter((f) => /[\\/]florida[\\/]/.test(f) && /"priceRange"\s*:\s*"\$89"/.test(fs.readFileSync(f, 'utf8')));
  t2('no Florida page publishes $89 as the whole price range',
    flBare.length === 0,
    `Florida checkout adds the county's VAB fee on top, so $89 is the floor, not the range (${flBare.length} pages)`);

  /**
   * The published range must be the one the fee table produces. It was typed as a
   * literal at first — which would have gone stale the first time a VAB changed a
   * fee, silently, on all 1081 pages.
   */
  const { default: FEES } = await import('../lib/flCountyFees.js');
  const dearest = Math.max(...Object.values(FEES).filter((f) => f.confidence === 'confirmed').map((f) => f.vabFee));
  const expected = `$89-$${((8900 + dearest) / 100).toFixed(0)}`;
  const home = fs.readFileSync(findHtml('index') || '/dev/null', 'utf8');
  t2('the published price range is derived from the county fee table',
    home.includes(`"priceRange":"${expected}"`),
    `expected ${expected} from the dearest confirmed county fee; a literal here goes stale unnoticed`);

  if (built.length < 900) {
    failures++;
    console.error(`  FAIL  site-wide schema sweep walked only ${built.length} built pages — expected 900+`);
  }
}

/**
 * ============================================================================
 * NO STICKY SIDEBAR SURVIVES THE MOBILE BREAKPOINT
 * ============================================================================
 * Nathan, 13 Aug 2026, on a Florida blog post on his phone: "the text starts to
 * scroll behind boxes, the page is broken, you can[not] read the text."
 *
 * Cause, MEASURED in headless Chromium at 393px rather than reasoned about:
 * Chrome constrains a `position: sticky` GRID ITEM to the grid CONTAINER, not
 * to its own grid area. `.sidebar` carried `order: -1` below 768px, so it was
 * row 1 of a 6,100px single-column grid, and it tracked the scroll the entire
 * height of the article — three opaque cards dragged over the body text from
 * the first scroll to the last. Every post rendered by pages/blog/[slug].js was
 * affected, and those pages exist to receive mobile search traffic.
 *
 * Measured before: sidebar top moved 702 → 5991 as the page scrolled, and the
 * sidebar box intersected the article box at every scroll position past 900px,
 * at 320px, 393px and 768px wide. After: zero intersections at any of them, and
 * the 769/1024/1440 screenshots are pixel-identical to before, which is how the
 * desktop layout was shown to be untouched.
 *
 * WHAT THIS CHECK IS AND IS NOT. It reads the served HTML, so it sees the real
 * CSS the browser will get — but it does not run layout, so it cannot re-derive
 * the overlap. It asserts (a) the sidebar is still sticky somewhere, which is
 * the premise the fix exists for, and (b) the mobile block still neutralises it.
 * (a) is there so that this cannot quietly become a check that guards nothing:
 * if sticky is dropped from the desktop layout one day, this fails loudly and
 * tells whoever did it to delete the guard deliberately rather than inherit a
 * green check over an assertion that no longer means anything.
 */
{
  const blogDir = path.join(DIR, 'blog');
  const posts = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir).filter((f) => f.endsWith('.html'))
    : [];

  t2('the blog template built its posts',
    posts.length >= 30,
    `found ${posts.length} built blog posts in ${blogDir} — the sticky check below has nothing to read`);

  const broken = [];
  let stickyDeclared = 0;
  for (const f of posts) {
    const html = fs.readFileSync(path.join(blogDir, f), 'utf8');

    // The template's own <style> — identified by a rule only it defines.
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    const css = styles.find((s) => s.includes('.related-link')) || '';
    const mobile = css.slice(css.indexOf('@media (max-width: 768px)'));

    const isSticky = /class="sidebar"[^>]*style="[^"]*position:\s*sticky/.test(html)
      || /\.sidebar\s*\{[^}]*position:\s*sticky/.test(css);
    if (isSticky) stickyDeclared++;

    // display:contents removes the box entirely, which is what this template does;
    // position:static is the direct override. Either one ends the overlap.
    const neutralised = /\.sidebar\s*\{[^}]*(position:\s*static|display:\s*contents)/.test(mobile);

    if (!css || !mobile) broken.push(`${f}: no <=768px block found in the template stylesheet`);
    else if (isSticky && !neutralised) broken.push(`${f}: .sidebar is sticky and the <=768px block does not neutralise it`);
  }

  t2('the sidebar is still the sticky element this guard was written for',
    stickyDeclared === posts.length && posts.length > 0,
    `${stickyDeclared} of ${posts.length} posts declare a sticky sidebar — if sticky was removed on purpose, delete this guard on purpose too`);

  t2('no blog post carries a sticky sidebar into the mobile breakpoint',
    broken.length === 0,
    broken.slice(0, 4).join(' | ') + (broken.length > 4 ? ` … +${broken.length - 4} more` : ''));

  /**
   * The banned patterns above prove the false claim is GONE. They cannot prove the
   * true one arrived — a card rendering nothing at all passes every one of them.
   * This asserts the number the funnel would actually honour is on the page.
   */
  const { getServiceCoverage } = await import('../lib/serviceCoverage.js');
  const cov = getServiceCoverage();
  const flBullet = cov.florida.complete
    ? `All ${cov.florida.total} Florida counties`
    : `${cov.florida.served} of ${cov.florida.total} Florida counties`;

  const flPosts = posts.filter((f) => {
    const t = decodeEntities(visibleText(fs.readFileSync(path.join(blogDir, f), 'utf8')));
    return /View full state guide/.test(t) && /Florida/.test(t) && t.includes('FL counties covered');
  });
  const missing = flPosts.filter((f) => {
    const t = decodeEntities(visibleText(fs.readFileSync(path.join(blogDir, f), 'utf8')));
    return !t.includes(flBullet);
  });

  const arAlPosts = posts.filter((f) =>
    AR_AL_COVERAGE.test(decodeEntities(visibleText(fs.readFileSync(path.join(blogDir, f), 'utf8')))));
  t2('no blog post claims Arkansas or Alabama county coverage',
    arAlPosts.length === 0,
    `${arAlPosts.length} posts claim a state apply.js refuses: ${arAlPosts.slice(0, 3).join(', ')}`);

  t2(`${flPosts.length} Florida blog posts state the coverage the funnel actually honours`,
    flPosts.length >= 20 && missing.length === 0,
    flPosts.length < 20
      ? `only ${flPosts.length} Florida posts matched — this check has stopped finding pages, which is not the same as passing`
      : `${missing.length} posts do not carry "${flBullet}": ${missing.slice(0, 3).join(', ')}`);

  // The rest of the site, reported and not enforced — see the note on AR_AL_COVERAGE.
  const arAlPages = walk(DIR)
    .filter((f) => AR_AL_COVERAGE.test(decodeEntities(visibleText(fs.readFileSync(f, 'utf8')))))
    .map((f) => path.relative(DIR, f));
  if (arAlPages.length) {
    warnings++;
    console.error(`  WARN  ${arAlPages.length} page(s) claim county coverage in a state apply.js refuses: ${arAlPages.slice(0, 5).join(', ')}`);
    console.error(`          part of "Homepage sells Arkansas and Alabama" in the open items queue — not failed here`);
  }
}

if (failures) {
  console.error(`\nPage verification failed (${failures}).\n`);
  process.exit(1);
}
console.log(`\n✓ all pages structurally intact${warnings ? ` (${warnings} warnings)` : ''}`);
