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
];

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
  for (const f of all) {
    const text = visibleText(fs.readFileSync(f, 'utf8'));
    for (const b of BANNED) {
      if (b.re.test(text)) {
        if (!offenders.has(b.why)) offenders.set(b.why, []);
        offenders.get(b.why).push(path.relative(DIR, f));
      }
    }
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

if (failures) {
  console.error(`\nPage verification failed (${failures}).\n`);
  process.exit(1);
}
console.log(`\n✓ all pages structurally intact${warnings ? ` (${warnings} warnings)` : ''}`);
