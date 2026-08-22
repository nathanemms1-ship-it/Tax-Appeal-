#!/usr/bin/env node
/**
 * verify-tx-seo — the guard for the 22 Aug 2026 Texas SEO batch.
 *
 * ============================================================================
 * WHAT WENT WRONG, AND WHY A GUARD RATHER THAN A FIX
 * ============================================================================
 * On 22 Aug 2026 every Texas page on the site advertised "May 15, 2026" — a deadline
 * that had passed three months earlier. Nothing said so, because nothing derived it
 * from anything. The literal was typed once, was correct once, and then quietly
 * stopped being correct.
 *
 * That is the same failure as the Charlotte VAB fee ($15 marked `confirmed` against a
 * county charging $50) and the FL_UNKNOWN_COUNTY_DEADLINE fallback that was
 * documented as conservative and was not. Fixing the literal fixes today. A guard
 * fixes next August.
 *
 * ============================================================================
 * HOW TO PROVE THIS GUARD WORKS
 * ============================================================================
 * Every check below is proven by reintroducing the bug it catches. Do this before
 * trusting any of them — a check that has stopped matching looks exactly like a check
 * that passes.
 *
 *   1  floor          in lib/tx/protestDeadline.js set RAW_FLOOR_MONTH_DAY='05-17'
 *                     expect: "floor 2027 is 2027-05-17 but 15 May + roll gives ..."
 *   2  stale literal  in pages/texas/[city].js put back `"May 15, 2026"` in the FAQ
 *                     expect: "pages/texas/[city].js:NN carries a dead deadline"
 *   3  breadcrumb     remove <Breadcrumb .../> from pages/houston.js
 *                     expect: "pages/houston.js renders no BreadcrumbList"
 *   4  robots mirror  change one character in public/robots.txt only
 *                     expect: "robots.txt and its API mirror differ at byte NN"
 *   5  sitemap        delete 'cities-tx' from SECTION_IDS in lib/sitemapUrls.js
 *                     expect: "69 URLs are in the flat sitemap but in no section"
 *   6  projection     in DISTRICT_MAILING give harris-county-tx anchor:'03-01'
 *                     expect: nothing — a March anchor is below the floor, and the
 *                     floor clamp is what makes that safe. Then set the clamp aside
 *                     by editing projectFor to drop the `> f.iso` comparison and it
 *                     fails with "projection for harris-county-tx is before the floor"
 *
 * Exits non-zero on any failure. Warnings are loud but do not fail the build —
 * they are work outstanding, not regressions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const load = (rel) => import(pathToFileURL(path.resolve(root, rel)).href);
const read = (rel) => fs.readFileSync(path.resolve(root, rel), 'utf8');

const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);

// ---------------------------------------------------------------------------
// Comment-stripping. A literal inside a comment is documentation, not a defect —
// several of the files below explain in prose what the old wrong string was, and a
// naive grep would flag exactly the comments that record the fix.
//
// Tracks block comments and string/template state so that `https://` inside a URL is
// not mistaken for a line comment. Tested by check 2.
// ---------------------------------------------------------------------------
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") state = 'sq';
      else if (c === '"') state = 'dq';
      else if (c === '`') state = 'tpl';
      out += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; } else out += ' ';
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
    // inside a string of some kind
    if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
      state = 'code';
    }
    out += c; i++;
  }
  return out;
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/**
 * DELIBERATE DATE QUOTATIONS.
 *
 * The dead-literal checks below exist to catch a past deadline presented as OUR
 * deadline. They are not meant to stop a page quoting one — and a page that explains
 * why the deadline is not 15 May has to be able to write "May 15", quote § 41.44's
 * own text, quote HCAD's wrong 2026 headline, and cite § 23.231's "expires December
 * 31, 2026". Blocking that would push the guard into making the content worse, which
 * is how guards get switched off.
 *
 * So an exemption exists, and it is deliberately noisy to use:
 *
 *   deadline-literal-ok: <reason>     exempts that one line
 *   deadline-quote:start / :end        exempts a region
 *
 * Read from the RAW source, before comments are stripped, so a marker is a comment
 * and never reaches the page. Line numbers survive stripping because stripComments
 * preserves newlines.
 *
 * Every marker must carry a reason. An unexplained exemption is how a real defect
 * gets waved through six months from now, so a bare marker fails the build.
 */
function exemptLines(rawSrc) {
  const lines = rawSrc.split('\n');
  const exempt = new Set();
  const bad = [];
  let region = false;
  lines.forEach((line, i) => {
    const n = i + 1;
    if (line.includes('deadline-quote:start')) region = true;
    if (region) exempt.add(n);
    if (line.includes('deadline-quote:end')) region = false;
    if (line.includes('deadline-literal-ok')) {
      // Exempts its own line AND the next, so the marker can sit above the prose it
      // covers — the same convention as eslint-disable-next-line. A marker inline in
      // JSX text would otherwise have to interrupt a sentence.
      exempt.add(n);
      exempt.add(n + 1);
      if (!/deadline-literal-ok:\s*\S/.test(line)) bad.push(n);
    }
    if (line.includes('deadline-quote:start') && !/deadline-quote:start\s*[—:-]\s*\S/.test(line)) {
      bad.push(n);
    }
  });
  if (region) bad.push(0); // unterminated region
  return { exempt, bad };
}

// ---------------------------------------------------------------------------
// The Texas surface. Every page that can show a Texas homeowner a deadline.
// ---------------------------------------------------------------------------
const TX_PAGES = [
  'pages/texas.js',
  'pages/texas/protest-deadline.js',
  'pages/texas/[city].js',
  'pages/counties/[slug].js',
  'pages/houston.js',
  'pages/dallas.js',
  'pages/fort-worth.js',
  'pages/austin.js',
  'pages/san-antonio.js',
  'pages/el-paso.js',
];

const BREADCRUMB_PAGES = [
  ...TX_PAGES.filter((p) => p !== 'pages/counties/[slug].js'),
  'pages/blog/[slug].js',
];

// ===========================================================================
console.log('verify-tx-seo\n');

// --------------------------------------------------- 1. the floor is derivable
const pd = await load('lib/tx/protestDeadline.js');
{
  const sat = pd.weekdayOf('2027-05-15');
  if (sat !== 6) {
    fail(`15 May 2027 computes as weekday ${sat}, expected 6 (Saturday). Everything ` +
         `about the 2027 deadline rests on this.`);
  }
  const f = pd.floor(2027);
  if (f.iso !== '2027-05-17') {
    fail(`floor 2027 is ${f.iso}, expected 2027-05-17. § 41.44 gives 15 May; ` +
         `15 May 2027 is a Saturday; § 1.06 rolls to the next business day.`);
  }
  if (!f.rolled) {
    fail('floor 2027 reports rolled=false — the § 1.06 roll did not fire.');
  }
  // 2026 must still resolve to the real 2026 date, or the module is rewriting history
  if (pd.floor(2026).iso !== '2026-05-15') {
    fail(`floor 2026 is ${pd.floor(2026).iso}, expected 2026-05-15 (a Friday, no roll).`);
  }
  // rollForward must be idempotent, or a second call moves a good date
  if (pd.rollForward('2027-05-17') !== '2027-05-17') {
    fail('rollForward is not idempotent on a business day.');
  }
  console.log(`  floor ${pd.floor(2027).long}  ·  current tax year ${pd.currentTaxYear()}`);
}

// ------------------------------------- 2. no page carries a dead deadline literal
{
  const DEAD = [
    // a full date with a year that is not the live tax year
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(20\d\d)\b/g,
    // "2026 Protest Deadline" style labels
    /\b(20\d\d)\s+(?:Protest|Appeal|Filing)\s+Deadline\b/gi,
  ];
  const live = String(pd.currentTaxYear());
  let flagged = 0;
  for (const rel of TX_PAGES) {
    const raw = read(rel);
    const { exempt, bad } = exemptLines(raw);
    for (const n of bad) {
      fail(n === 0
        ? `${rel} opens a deadline-quote region and never closes it.`
        : `${rel}:${n} uses a date-literal exemption with no reason after it. Write ` +
          `"deadline-literal-ok: quoting § 41.44" — an unexplained exemption waves ` +
          `through the next real defect.`);
    }
    const src = stripComments(raw);
    for (const re of DEAD) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const year = m[1];
        if (year === live) continue;      // stating the live year is correct
        if (exempt.has(lineOf(src, m.index))) continue;
        // Florida's branch inside the county template is legitimately on 2026 while
        // its season runs. Only flag it once that season has closed.
        if (rel === 'pages/counties/[slug].js' && year === '2026') continue;
        flagged++;
        fail(`${rel}:${lineOf(src, m.index)} carries a dead deadline literal ` +
             `"${m[0].trim()}" — the live Texas tax year is ${live}. Derive it from ` +
             `lib/tx/protestDeadline.js instead of typing it.`);
      }
    }
  }
  if (!flagged) console.log(`  no dead deadline literals across ${TX_PAGES.length} Texas pages`);
}

// -------------------------- 2b. no bare "May 15" presented as the Texas deadline
{
  const floorUS = pd.deadlineShort(pd.currentTaxYear());
  const bare = /\bMay 15\b(?!,\s*20)/g;
  let n = 0;
  for (const rel of TX_PAGES) {
    const raw = read(rel);
    const { exempt } = exemptLines(raw);
    const src = stripComments(raw);
    bare.lastIndex = 0;
    let m;
    while ((m = bare.exec(src))) {
      if (exempt.has(lineOf(src, m.index))) continue;
      n++;
      fail(`${rel}:${lineOf(src, m.index)} states a bare "May 15" as a Texas ` +
           `deadline. That was the § 41.44 floor through 2026 and is wrong now — ` +
           `the floor is ${floorUS}. Use deadlineShort(currentTaxYear()).`);
    }
  }
  if (!n) console.log('  no bare "May 15" left on the Texas surface');
}

// --------------------------------------------------- 3. BreadcrumbList coverage
{
  let missing = 0;
  for (const rel of BREADCRUMB_PAGES) {
    const src = read(rel);
    if (!/<Breadcrumb[\s/>]/.test(src)) {
      missing++;
      fail(`${rel} renders no BreadcrumbList. Google removed the FAQ rich result on ` +
           `7 May 2026, so breadcrumb is the only structured-data type left on these ` +
           `pages that produces anything in a search result. Import ` +
           `components/Breadcrumb and pass a trail.`);
    }
  }
  // the county template wires breadcrumbSchema directly rather than via the component
  if (!/breadcrumbSchema\(/.test(read('pages/counties/[slug].js'))) {
    fail('pages/counties/[slug].js no longer emits breadcrumbSchema().');
  }
  if (!missing) {
    console.log(`  BreadcrumbList on ${BREADCRUMB_PAGES.length} Texas pages + the county template`);
  }
}

// ------------------------------------------- 4. robots.txt and its mirror agree
{
  const pub = read('public/robots.txt').trim();
  const mod = read('pages/api/robots.txt.js');
  const a = mod.indexOf('`');
  const b = mod.lastIndexOf('`');
  const mirror = a === -1 || b <= a ? null : mod.slice(a + 1, b).trim();
  if (mirror === null) {
    fail('pages/api/robots.txt.js has no template literal to compare.');
  } else if (mirror !== pub) {
    let at = 0;
    while (at < Math.max(pub.length, mirror.length) && pub[at] === mirror[at]) at++;
    fail(`robots.txt and its API mirror differ at byte ${at}. Their own comments ` +
         `promise they are byte-identical, and a static file in public/ silently ` +
         `wins over the API route — so the copy that is wrong is the one nobody ` +
         `serves and nobody notices.\n` +
         `        public: ${JSON.stringify(pub.slice(at - 30, at + 30))}\n` +
         `        api   : ${JSON.stringify(mirror.slice(at - 30, at + 30))}`);
  } else {
    console.log('  robots.txt and its API mirror are byte-identical');
  }

  if (!/^Sitemap: https:\/\/www\.taxappealusa\.com\/sitemap\.xml$/m.test(pub)) {
    fail('robots.txt does not advertise the root /sitemap.xml. That is the path ' +
         'every crawler probes first, and serving nothing there is why the site ' +
         'was discoverable only through a sitemap under a Disallow-ed /api/ path.');
  }
  // A named User-agent block replaces the wildcard for that agent rather than adding
  // to it. A bare allow-block for a bot therefore hands it /admin.
  const namedBlocks = [...pub.matchAll(/^User-agent:\s*(?!\*)(\S+)/gim)].map((m) => m[1]);
  for (const agent of namedBlocks) {
    const block = pub.split(new RegExp(`^User-agent:\\s*${agent}`, 'im'))[1] || '';
    const upToNext = block.split(/^User-agent:/im)[0];
    if (!/Disallow:\s*\/admin/i.test(upToNext)) {
      fail(`robots.txt declares a named block for "${agent}" without repeating ` +
           `Disallow: /admin. A named block REPLACES the wildcard for that agent, so ` +
           `this grants it /admin, /portal and /partners/dashboard.`);
    }
  }
}

// --------------------------------------------------- 5. sitemap sections cover all
{
  const sm = await load('lib/sitemapUrls.js');
  const flat = sm.buildSitemapUrls();
  const flatUrls = new Set(flat.map((p) => p.url));

  const seen = new Map();
  let total = 0;
  for (const id of sm.SECTION_IDS) {
    const urls = sm.buildSectionUrls(id);
    if (!urls) { fail(`sitemap section "${id}" is in SECTION_IDS but builds nothing.`); continue; }
    total += urls.length;
    for (const u of urls) {
      if (seen.has(u.url)) {
        fail(`${u.url} appears in two sitemap sections (${seen.get(u.url)} and ${id}). ` +
             `Duplicate <loc> across an index is a Search Console validation error.`);
      }
      seen.set(u.url, id);
    }
  }

  const uncovered = [...flatUrls].filter((u) => !seen.has(u));
  if (uncovered.length) {
    fail(`${uncovered.length} URLs are in the flat sitemap but in no section — they ` +
         `would vanish from /sitemap.xml.\n        e.g. ${uncovered.slice(0, 5).join(', ')}`);
  }
  const extra = [...seen.keys()].filter((u) => !flatUrls.has(u));
  if (extra.length) {
    fail(`${extra.length} URLs are in a section but not in the flat sitemap: ` +
         `${extra.slice(0, 5).join(', ')}`);
  }
  if (!uncovered.length && !extra.length) {
    console.log(`  sitemap: ${sm.SECTION_IDS.length} sections cover all ${total} URLs, no overlap`);
  }
}

// ------------------------------------- 6. no projection undercuts the floor
{
  const year = pd.currentTaxYear();
  const f = pd.floor(year);
  let projected = 0;
  for (const slug of Object.keys(pd.DISTRICT_MAILING)) {
    const p = pd.projectFor(slug, year);
    if (!p) continue;
    projected++;
    if (p.iso < f.iso) {
      fail(`projection for ${slug} is ${p.iso}, before the ${year} floor ${f.iso}. ` +
           `§ 41.44 makes the statutory date a FLOOR — a district cannot move it ` +
           `earlier, only clear it.`);
    }
  }
  console.log(`  ${projected} district projections, none before the floor`);
}

// =========================================================================== warn
{
  // Districts we still cannot date. Not an error — an unfilled row is honest. But it
  // is the work that decides whether the 2027 deadline pages are authoritative.
  const undated = Object.entries(pd.DISTRICT_MAILING)
    .filter(([, d]) => !d.anchor)
    .map(([s]) => s);
  if (undated.length) {
    warn(`${undated.length} of ${Object.keys(pd.DISTRICT_MAILING).length} tracked ` +
         `districts have no mailing anchor and produce no projection:\n        ` +
         undated.join(', '));
  }
  if (pd.MAILING_DATA_GAPS.length) {
    warn(`${pd.MAILING_DATA_GAPS.length} districts have no mailing data at all ` +
         `(JS-only portals or 403 to fetching — these need a browser or a phone ` +
         `call):\n        ${pd.MAILING_DATA_GAPS.join(', ')}`);
  }

  // The states left on a literal year. Deliberate, scoped out, and not silent.
  const county = read('pages/counties/[slug].js');
  const stale = [...county.matchAll(/^\s{2}(GA|AR|AL):.*year:\s*"(20\d\d)"/gm)]
    .filter(([, , y]) => Number(y) < pd.currentTaxYear())
    .map(([, code, y]) => `${code} (${y})`);
  if (stale.length) {
    warn(`stateTerms still carries a literal past year for ${stale.join(', ')}. ` +
         `Those seasons have closed too. Texas was fixed in this batch; these need ` +
         `the same derivation once the Florida window is shut.`);
  }
}

// =========================================================================== out
console.log('');
for (const w of warnings) console.warn(`  WARN  ${w}`);
if (warnings.length) console.log('');

if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\nverify-tx-seo failed with ${failures.length} problem(s).\n`);
  process.exit(1);
}

console.log(`✓ Texas SEO checks passed${warnings.length ? ` (${warnings.length} warning(s) above)` : ''}\n`);
