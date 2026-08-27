#!/usr/bin/env node
/**
 * verify-address-table.mjs — build guard for lib/appealAddresses.js
 *
 * Run:  node scripts/verify-address-table.mjs
 * Prove: node scripts/verify-address-table.mjs --selftest
 *
 * Add to the build chain BEFORE `next build`, alongside verify-fl-data:
 *   verify-fl-data → verify-address-table → verify-valuation → verify-security → ...
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * It proves every `confirmed` row is structurally complete, freshly verified,
 * CASS-validated, and backed by two independent official sources of different type.
 *
 * It does NOT prove the address is correct. Nothing can. That is what the phone
 * call is for. The guard's job is to make it impossible to mail to a row that
 * nobody actually checked — which is the failure that cost us Charlotte.
 *
 * Note the Florida lesson about guards themselves (START_HERE, 19 Aug): a guard
 * can prove a property about the wrong SET and look like it passed. This one
 * therefore reports coverage against TARGET_COUNTIES explicitly, so "0 failures"
 * can never be mistaken for "we can mail everywhere."
 */

import {
  APPEAL_ADDRESSES,
  TARGET_COUNTIES,
  BLOCKED_DOMAINS,
  SOURCE_TYPES,
  POSTAGE_RESTRICTIONS,
  MAX_VERIFIED_AGE_DAYS,
  isAcceptableSource,
  hostOf,
  verifiedAgeDays,
  coverage,
} from '../lib/appealAddresses.js';

const VALID_SOURCE_TYPES = new Set(Object.values(SOURCE_TYPES));
const VALID_RESTRICTIONS = new Set(Object.values(POSTAGE_RESTRICTIONS));
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const failures = [];
const warnings = [];

function fail(where, msg) { failures.push(`${where}: ${msg}`); }
function warn(where, msg) { warnings.push(`${where}: ${msg}`); }

/**
 * A declared officialDomains entry must be a bare hostname — not a URL, not a
 * wildcard, not a path. Anything looser turns the allowlist into a rubber stamp.
 */
const BARE_HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

function checkRow(state, county, row, now) {
  const where = `${state}/${county}`;

  // --- fields required of EVERY row, confirmed or not -----------------------
  if (!row.addressee) fail(where, 'missing addressee');
  if (row.confidence !== 'confirmed' && row.confidence !== 'unverified') {
    fail(where, `confidence must be "confirmed" or "unverified", got "${row.confidence}"`);
  }
  if (!Array.isArray(row.sources) || row.sources.length === 0) {
    fail(where, 'no sources recorded');
  }
  if (row.postageRestriction && !VALID_RESTRICTIONS.has(row.postageRestriction)) {
    fail(where, `unknown postageRestriction "${row.postageRestriction}"`);
  }
  if (!['yes', 'no', 'unknown'].includes(row.collectsCertified)) {
    fail(where, `collectsCertified must be yes|no|unknown, got "${row.collectsCertified}"`);
  }

  // --- the declared allowlist itself must be well-formed --------------------
  for (const d of row.officialDomains ?? []) {
    if (!BARE_HOST_RE.test(d)) {
      fail(where, `officialDomains entry must be a bare hostname, got "${d}"`);
    }
    if (BLOCKED_DOMAINS.some((b) => d.toLowerCase() === b || d.toLowerCase().endsWith(`.${b}`))) {
      fail(where, `officialDomains declares a known lookalike: "${d}"`);
    }
  }

  // --- source hygiene, applied to every row --------------------------------
  for (const src of row.sources ?? []) {
    if (!VALID_SOURCE_TYPES.has(src.type)) {
      fail(where, `source has unknown type "${src.type}"`);
    }
    if (!ISO_DATE_RE.test(src.checkedOn ?? '')) {
      fail(where, `source missing or malformed checkedOn: ${src.checkedOn}`);
    }
    if (src.type === SOURCE_TYPES.PHONE && !src.staffName) {
      fail(where, 'phone source requires staffName — an unattributed call is not a source');
    }
    if (!isAcceptableSource(row, src)) {
      const host = hostOf(src.url ?? '') ?? '(unparseable)';
      fail(
        where,
        `source host "${host}" is neither globally trusted nor declared in officialDomains `
        + `[${(row.officialDomains ?? []).join(', ') || 'none'}] — or is a known lookalike. URL: ${src.url}`
      );
    }
  }

  // --- isPoBox must match reality ------------------------------------------
  const looksLikeBox = /\bP\.?\s?O\.?\s?BOX\b/i.test(`${row.line1 ?? ''} ${row.line2 ?? ''}`);
  if (looksLikeBox && !row.isPoBox) fail(where, 'address is a PO Box but isPoBox is false');
  if (row.isPoBox && !looksLikeBox && row.line1) {
    fail(where, 'isPoBox is true but no PO Box found in line1/line2');
  }

  // --- everything below applies only to rows claiming to be mailable --------
  if (row.confidence !== 'confirmed') return;

  if (!row.line1) fail(where, 'confirmed but no line1');
  if (!row.city) fail(where, 'confirmed but no city');
  if (!row.stateAbbr) fail(where, 'confirmed but no stateAbbr');
  if (!ZIP_RE.test(row.zip ?? '')) fail(where, `confirmed but zip is invalid: "${row.zip}"`);

  if (!ISO_DATE_RE.test(row.verifiedOn ?? '')) {
    fail(where, `confirmed but verifiedOn missing or malformed: ${row.verifiedOn}`);
  } else {
    const age = verifiedAgeDays(row, now);
    if (age > MAX_VERIFIED_AGE_DAYS) {
      fail(where, `confirmed but verifiedOn is ${age} days old (max ${MAX_VERIFIED_AGE_DAYS}). Re-verify before mailing.`);
    } else if (age > MAX_VERIFIED_AGE_DAYS - 60) {
      warn(where, `verifiedOn is ${age} days old — re-verify before the season opens.`);
    }
  }

  if (!row.cassValidated) {
    fail(where, 'confirmed but not CASS-validated. Run USPS address validation before mailing.');
  }

  // THE TWO-SOURCE RULE. Two sources of DIFFERENT type.
  // Two scraped mirrors agreeing is one source, not two — which is why type,
  // not count, is what is checked here.
  const types = new Set((row.sources ?? []).map((s) => s.type));
  if (types.size < 2) {
    fail(
      where,
      `confirmed but has ${types.size} distinct source type(s) [${[...types].join(', ')}]. `
      + 'Two independent sources of DIFFERENT type are required.'
    );
  }

  // A confirmed row should rest on the strongest available source class.
  const strong = [SOURCE_TYPES.APPEAL_FORM_PDF, SOURCE_TYPES.ASSESSMENT_NOTICE, SOURCE_TYPES.PHONE];
  if (![...types].some((t) => strong.includes(t))) {
    warn(where, 'confirmed on county_site/state_directory sources only — prefer the appeal form, the annual notice, or a phone call.');
  }
}

function run(table, now = new Date()) {
  failures.length = 0;
  warnings.length = 0;
  for (const [state, counties] of Object.entries(table)) {
    for (const [county, row] of Object.entries(counties)) {
      checkRow(state, county, row, now);
    }
  }
  return { failures: [...failures], warnings: [...warnings] };
}

/* ------------------------------------------------------------------------- */
/* SELF-TEST — prove the guard by reintroducing each bug it targets.          */
/* Standing rule: "Prove a guard by reintroducing the bug."                   */
/* ------------------------------------------------------------------------- */

function selftest() {
  const base = {
    officialDomains: ['testcounty.ga.gov'],
    addressee: 'Test County Board of Tax Assessors',
    attnLine: null,
    line1: '1 Main St',
    line2: null,
    city: 'Testville',
    stateAbbr: 'GA',
    zip: '30303',
    isPoBox: false,
    postageRestriction: null,
    acceptsEmail: null,
    emailAddress: null,
    collectsCertified: 'unknown',
    confidence: 'confirmed',
    verifiedOn: '2026-08-01',
    sources: [
      { url: 'https://testcounty.ga.gov/appeals', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-01' },
      { phone: '555-0100', type: SOURCE_TYPES.PHONE, checkedOn: '2026-08-01', staffName: 'J. Smith' },
    ],
    cassValidated: true,
    cassValidatedOn: '2026-08-01',
    notes: null,
  };
  const now = new Date('2026-08-27T00:00:00Z');

  const cases = [
    ['clean row passes', base, false],
    ['single source type is rejected',
      { ...base, sources: [base.sources[0]] }, true],
    ['two sources of the SAME type is rejected',
      { ...base, sources: [base.sources[0], { url: 'https://other.ga.gov/x', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-01' }] }, true],
    ['lookalike domain is rejected',
      { ...base, sources: [{ url: 'https://fultoncountypropertyappraiser.org/contact-us/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-01' }, base.sources[1]] }, true],
    ['stale verifiedOn is rejected',
      { ...base, verifiedOn: '2025-01-01' }, true],
    ['missing verifiedOn is rejected',
      { ...base, verifiedOn: null }, true],
    ['not CASS-validated is rejected',
      { ...base, cassValidated: false }, true],
    ['missing city/ZIP is rejected (the Richmond case)',
      { ...base, city: null, zip: null }, true],
    ['malformed ZIP is rejected',
      { ...base, zip: 'GA 303' }, true],
    ['PO Box not flagged is rejected (the Chatham case)',
      { ...base, line1: 'PO Box 9786', isPoBox: false }, true],
    ['unattributed phone source is rejected',
      { ...base, sources: [base.sources[0], { phone: '555-0100', type: SOURCE_TYPES.PHONE, checkedOn: '2026-08-01' }] }, true],
    ['unverified row with one source passes (seeding is allowed)',
      { ...base, confidence: 'unverified', verifiedOn: null, cassValidated: false, sources: [base.sources[0]] }, false],

    // --- the per-county allowlist ------------------------------------------
    ['a real .com county domain passes ONCE declared (the Gwinnett case)',
      { ...base, officialDomains: ['gwinnettcounty.com'],
        sources: [{ url: 'https://www.gwinnettcounty.com/appeals', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-01' }, base.sources[1]] }, false],
    ['the same .com is rejected when NOT declared',
      { ...base, officialDomains: [],
        sources: [{ url: 'https://www.gwinnettcounty.com/appeals', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-01' }, base.sources[1]] }, true],
    ['a lookalike cannot be smuggled in by declaring it',
      { ...base, officialDomains: ['gwinnettcountypropertyappraiser.org'],
        sources: [{ url: 'https://gwinnettcountypropertyappraiser.org/x', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-01' }, base.sources[1]] }, true],
    ['a wildcard-ish allowlist entry is rejected',
      { ...base, officialDomains: ['*.com'] }, true],
    ['a URL in officialDomains (rather than a bare host) is rejected',
      { ...base, officialDomains: ['https://testcounty.ga.gov/appeals'] }, true],
    ['a subdomain of a declared host passes (county CDN, the Chatham case)',
      { ...base, officialDomains: ['chathamcountyga.gov'],
        sources: [{ url: 'https://boa.chathamcountyga.gov/form.pdf', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-01' }, base.sources[1]] }, false],
  ];

  let passed = 0;
  let broken = 0;
  for (const [label, row, shouldFail] of cases) {
    const res = run({ GA: { Test: row } }, now);
    const didFail = res.failures.length > 0;
    if (didFail === shouldFail) {
      passed += 1;
      console.log(`  ✓ ${label}`);
    } else {
      broken += 1;
      console.log(`  ✗ ${label} — expected ${shouldFail ? 'FAIL' : 'PASS'}, got ${didFail ? 'FAIL' : 'PASS'}`);
      res.failures.forEach((f) => console.log(`      ${f}`));
    }
  }

  console.log(`\nSelf-test: ${passed}/${cases.length} guard behaviours proven.`);
  if (broken > 0) {
    console.error('THE GUARD ITSELF IS BROKEN. Do not trust a passing build.');
    process.exit(1);
  }
  process.exit(0);
}

/* ------------------------------------------------------------------------- */

if (process.argv.includes('--selftest')) {
  console.log('Proving the guard by reintroducing each bug it targets:\n');
  selftest();
}

const { failures: f, warnings: w } = run(APPEAL_ADDRESSES);

// Coverage first, and always — a clean run must never read as "ready to mail".
for (const state of Object.keys(TARGET_COUNTIES)) {
  const c = coverage(state);
  console.log(
    `${state}: ${c.mailable}/${c.target} counties mailable `
    + `(${c.seeded} seeded, ${c.blocked.length} seeded-but-blocked, ${c.missing.length} absent)`
  );
  if (c.blocked.length) console.log(`  blocked: ${c.blocked.join(', ')}`);
  if (c.missing.length) console.log(`  absent:  ${c.missing.join(', ')}`);
}

if (w.length) {
  console.log(`\n${w.length} warning(s):`);
  w.forEach((x) => console.log(`  ! ${x}`));
}

if (f.length) {
  console.error(`\n${f.length} FAILURE(S):`);
  f.forEach((x) => console.error(`  ✗ ${x}`));
  process.exit(1);
}

console.log('\n✓ address table structurally valid');
console.log('  (structurally valid ≠ correct. Only a phone call makes a row confirmed.)');
