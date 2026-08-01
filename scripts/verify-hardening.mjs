#!/usr/bin/env node
/**
 * BEHAVIOURAL TESTS for the security helpers.
 *
 * verify-security.mjs asserts a guard is PRESENT. This asserts it WORKS.
 * The two are complementary and both cheap, so both run on every build.
 *
 * The payloads below are the actual attacks, not stand-ins:
 *   - the escapeHtml case is a phishing link injected into an email body that
 *     leaves our domain SPF/DKIM-aligned, so the customer's mail client shows it as
 *     authentically from us;
 *   - the escapeLike case is `%`, which is how an unauthenticated caller could
 *     select a victim's order out of the table without knowing anything about them;
 *   - the input-limit cases are the ones that turn one HTTP request into ~$0.57 of
 *     Anthropic input.
 *
 * A regression here is silent in every other check: the build passes, the page
 * renders, the email sends. That is why this file exists.
 */

import { escapeHtml, escapeLike } from '../lib/escape.js';
import { validateVendorInput, cap, LIMITS } from '../lib/inputLimits.js';
import { DAILY_BUDGET, MONTHLY_BUDGET } from '../lib/spendGuard.js';

let pass = 0;
const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

// ── escapeHtml: the phishing payload ──────────────────────────────────────────
const evil = `Bob</div><a href="http://evil.example/pay">Verify your payment</a><div>`;
const esc = escapeHtml(evil);
t('escapeHtml neutralises the injected anchor', !esc.includes('<a href'));
t('escapeHtml neutralises the closing div', !esc.includes('</div>'));
t('escapeHtml keeps the name readable', esc.startsWith('Bob&lt;'));
t('escapeHtml escapes double quotes (attribute break-out)', escapeHtml('a"b').includes('&quot;'));
t('escapeHtml escapes single quotes', escapeHtml("a'b").includes('&#39;'));
t('escapeHtml handles null and undefined', escapeHtml(null) === '' && escapeHtml(undefined) === '');
// Two-word and hyphenated names broke an earlier signature-matching attempt in this
// codebase, so ordinary names are asserted to pass through untouched.
t('escapeHtml leaves an ordinary name untouched', escapeHtml('Mary Jo Van Dyke-Smith') === 'Mary Jo Van Dyke-Smith');

// ── escapeLike: the victim-selection payload ──────────────────────────────────
t('escapeLike neutralises the % wildcard', escapeLike('%') === '\\%');
t('escapeLike neutralises the _ wildcard', escapeLike('_') === '\\_');
t('escapeLike neutralises a backslash', escapeLike('\\') === '\\\\');
t('escapeLike leaves a real address alone', escapeLike('123 Main') === '123 Main');

// ── Input limits: the cost payloads ───────────────────────────────────────────
t('rejects oversize notes', validateVendorInput({ notes: 'x'.repeat(LIMITS.notes + 1) }).ok === false);
t('accepts notes at exactly the limit', validateVendorInput({ notes: 'x'.repeat(LIMITS.notes) }).ok === true);
t('rejects too many issues', validateVendorInput({ issues: Array(LIMITS.issueCount + 1).fill('x') }).ok === false);
t('rejects a single oversize issue', validateVendorInput({ issues: ['x'.repeat(LIMITS.issueItem + 1)] }).ok === false);
t('rejects a non-array issues field', validateVendorInput({ issues: 'not an array' }).ok === false);
t('names the offending field in the error', /notes/.test(validateVendorInput({ notes: 'x'.repeat(9999) }).error));

// Identifiers TRUNCATE rather than reject: anything past the cap there is malformed,
// not meaningful, and rejecting would fail a purchase over a stray paste.
t('truncates a long address rather than rejecting', validateVendorInput({ propertyAddress: 'x'.repeat(500) }).clean.propertyAddress.length === LIMITS.address);

t('passes real input through unchanged', (() => {
  const r = validateVendorInput({
    propertyAddress: '742 Evergreen Ter', county: 'Duval',
    notes: 'Roof leaks in two rooms.', issues: ['Cracked slab'],
  });
  return r.ok && r.clean.propertyAddress === '742 Evergreen Ter' && r.clean.county === 'Duval';
})());

// The clean object must be a superset of the body — the routes destructure fields
// this helper has never heard of (preview, valuationBasis, flWillNotAttend, ...) and
// dropping them silently would break the petition flow without any error.
t('preserves body fields the helper does not know about', (() => {
  const r = validateVendorInput({ preview: true, taxYear: '2026', valuationBasis: 'market' });
  return r.clean.preview === true && r.clean.taxYear === '2026' && r.clean.valuationBasis === 'market';
})());

t('cap is a no-op under the limit', cap('abc', 10) === 'abc');
t('cap leaves null alone', cap(null, 10) === null);
t('cap coerces a number to a string', cap(12345, 3) === '123');

// ── Budgets ───────────────────────────────────────────────────────────────────
// A NaN or zero budget makes checkSpend() a no-op, which reads as "protected".
for (const [vendor, n] of Object.entries(DAILY_BUDGET)) {
  t(`daily budget for ${vendor} is a positive finite number`, Number.isFinite(n) && n > 0);
}
t('lob budget is the tightest — real mail, irreversible', DAILY_BUDGET.lob < DAILY_BUDGET.anthropic);

// ── Monthly ceilings ──────────────────────────────────────────────────────────
// RentCast has NO vendor-side spend cap — confirmed against their billing docs:
// overage cannot be disabled or limited, only alerted on. So these ceilings are
// the only bound on the bill, and a regression here is invisible until an invoice
// arrives. Assert the arithmetic, not just the presence of a number.
for (const [vendor, n] of Object.entries(MONTHLY_BUDGET)) {
  t(`monthly budget for ${vendor} is a positive finite number`, Number.isFinite(n) && n > 0);
  t(
    `monthly ceiling for ${vendor} actually binds (below 28x the daily burst guard)`,
    n < DAILY_BUDGET[vendor] * 28
  );
}
// The specific failure this catches: a daily cap raised for a traffic spike, with
// the monthly cap left alone, so the month silently overshoots while no single day
// ever trips. 28 days is the shortest month — if the monthly number is above what
// 28 compliant days can produce, the monthly ceiling is decorative.
t(
  'rentcast monthly ceiling is the binding constraint, not the daily one',
  MONTHLY_BUDGET.rentcast < DAILY_BUDGET.rentcast * 28
);
// $0.06/call past 1,000 included. 2,000 would be ~$60/mo of overage; anything at
// or above that is a number nobody chose on purpose.
t(
  'rentcast monthly ceiling keeps worst-case overage under $60/mo',
  MONTHLY_BUDGET.rentcast < 2000
);

// ── Sales gate ────────────────────────────────────────────────────────────────
// Two variables control one thing: SALES_ENABLED gates the server (runtime, in
// checkout and the mailing cron) and NEXT_PUBLIC_SALES_ENABLED gates the UI
// (inlined at build). If they ever disagree the site lies in one direction or
// the other — a funnel that walks a customer to a 503, or a waitlist page on a
// site that is quietly still charging cards. Neither is acceptable, and nothing
// else in the build would notice, so it is asserted here.
{
  const server = process.env.SALES_ENABLED === 'true';
  const client = process.env.NEXT_PUBLIC_SALES_ENABLED === 'true';
  t(
    `sales gate agrees across server (${server ? 'on' : 'off'}) and UI (${client ? 'on' : 'off'})`,
    server === client
  );
  if (server !== client) {
    console.error('    → set BOTH SALES_ENABLED and NEXT_PUBLIC_SALES_ENABLED to the same value,');
    console.error('      then REDEPLOY. Saving an env var in Vercel alone changes nothing.');
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`Hardening check — ${failures.length} of ${pass + failures.length} FAILED:`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  process.exit(1);
}
console.log(`Hardening check — ${pass} checks passed`);
console.log('✓ injection payloads neutralised, cost limits enforced, budgets sane');
