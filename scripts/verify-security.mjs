#!/usr/bin/env node
/**
 * BUILD-TIME SECURITY AND COST ASSERTIONS ON THE API ROUTES.
 *
 * WHY THIS EXISTS
 * ---------------
 * The security audit found that /api/generate-pt311a was a completely open,
 * unmetered Anthropic proxy. It was not open because anyone decided it should be.
 * It was open because generate-letter and generate-dr486 got a rate limiter and
 * pt311a was simply forgotten — and nothing anywhere would ever have said so.
 *
 * `next build` passes on an unauthenticated route. The page renders. The funnel
 * works. The only signal is the invoice, and it arrives a month late.
 *
 * That is the same failure mode as the deleted heroes (see verify-pages.mjs): the
 * defect is an ABSENCE, and absences do not throw. So the absences get asserted
 * here, by source inspection, at build time.
 *
 * The rule this file encodes: if a route spends money or touches customer data, it
 * must say so in a way this script can see. Adding a new vendor call means adding
 * the guard, or the build fails.
 *
 * These are grep-level checks, so they prove a guard is PRESENT, not that it is
 * CORRECT. That is deliberate: the failures worth catching automatically have all
 * been omissions, and a cheap check that runs on every build beats an expensive one
 * that runs once.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_DIR = 'pages/api';
const failures = [];
const notes = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * Strip comments and template-literal HTML before inspecting.
 *
 * Without this, the checks match the very comments that DOCUMENT the bug they are
 * looking for — this script failed its own cron routes because the fix's comment
 * quotes the broken pattern verbatim. A checker that cannot tell code from prose
 * teaches people to delete explanatory comments, which is the opposite of useful.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/(^|[^:'"\`])\/\/[^\n]*/g, '$1'); // line comments (leaves http:// alone)
}

const files = walk(API_DIR).sort();
const sources = new Map(files.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]));

function fail(file, msg) {
  failures.push(`${relative('.', file)}: ${msg}`);
}

// ── 1. Every Anthropic call site must be rate limited AND spend capped ─────────
// Requests are counted by lib/rateLimit.js; tokens are counted by nobody, so the
// body size cap and the global ceiling are both load-bearing.
for (const [file, src] of sources) {
  if (!src.includes('api.anthropic.com') && !src.includes('@anthropic-ai/sdk')) continue;

  const isWebhook = file.includes('webhooks/');
  const isCron = file.includes('/cron/');

  // Match a CALL, not an import. An earlier version of this script accepted the
  // mere presence of the identifier, so deleting every enforceRateLimit(...) call
  // while leaving the import line behind still passed — which is precisely the
  // half-finished edit this file exists to catch.
  const callsSpendGuard = /checkSpend\s*\(/.test(src);
  const callsRateLimit = /enforceRateLimit\s*\(\s*req/.test(src);
  const callsWebhookAuth = /requireWebhookSecret\s*\(\s*req/.test(src);

  if (!callsSpendGuard) {
    fail(file, 'calls Anthropic but never calls checkSpend() — no global daily ceiling. See lib/spendGuard.js');
  }

  // A webhook authenticates by shared secret and a cron by CRON_SECRET; neither
  // needs a per-IP limiter, but a public route absolutely does.
  if (!isCron && !callsRateLimit && !callsWebhookAuth) {
    fail(file, 'calls Anthropic on an unauthenticated route with no enforceRateLimit(). This is a free Sonnet proxy billed to us.');
  }

  // Next's default body limit is 1 MB ~= 190k input tokens ~= $0.57 of input per
  // request. Any route that interpolates a body into a prompt must cap the body.
  if (!isCron && !src.includes('PROMPT_ROUTE_CONFIG') && !src.includes('bodyParser')) {
    fail(file, 'builds a prompt from req.body but does not set PROMPT_ROUTE_CONFIG — the 1 MB default body limit applies. See lib/inputLimits.js');
  }
}

// ── 2. Every Lob call site must be spend capped ────────────────────────────────
// Lob is real mail: ~$8-12 per piece and it cannot be recalled.
for (const [file, src] of sources) {
  if (!src.includes('api.lob.com')) continue;
  if (!/checkSpend\s*\(\s*'lob'/.test(src)) {
    fail(file, "sends real mail via Lob but never calls checkSpend('lob') — an upstream retry loop could mail unbounded certified letters.");
  }
}

// ── 3. No select('*') on orders ────────────────────────────────────────────────
// The orders table holds password_hash and the signature attestation fields.
// get-orders.js shipped every one of them to the admin browser.
for (const [file, src] of sources) {
  // Pair from() and select() IN THE SAME CHAIN. Matching them independently flagged
  // portal/reset-password.js, which does select('*') on password_reset_tokens and a
  // narrow update() on orders — two different statements, no leak.
  if (!/\.from\(\s*['"]orders['"]\s*\)[\s\S]{0,120}?\.select\(\s*['"]\*['"]\s*\)/.test(src)) continue;

  // A whole row that stays on the server and is handed to fulfillment is tolerated:
  // narrowing it blind would break mailing. A row that can reach a browser must use
  // an explicit allowlist. `dispatchQueuedOrder(order)` is the server-side shape.
  const serverOnly =
    file.includes('/cron/') ||
    file.includes('webhooks/') ||
    /dispatchQueuedOrder\(/.test(src);
  if (serverOnly) {
    notes.push(`${relative('.', file)}: select('*') on orders, server-side only — narrow it when the field list is known.`);
  } else {
    fail(file, "select('*') on orders — this table contains password_hash. Use an explicit field allowlist.");
  }
}

// ── 4. No secret compared inside a template literal ───────────────────────────
// `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` becomes the literal string
// "Bearer undefined" when the env var is missing, so an UNSET secret authenticated
// anyone who guessed that value — on a route that dispatches 8 real mailings.
for (const [file, src] of sources) {
  // Only a COMPARISON is the bug. `Authorization: \`Bearer ${process.env.LOB_API_KEY}\``
  // is an outbound header and entirely correct.
  if (/[!=]==?\s*`Bearer \$\{process\.env\./.test(src)) {
    fail(file, 'compares an Authorization header against a template literal containing process.env — an unset variable becomes "Bearer undefined" and authenticates. Use requireCronSecret / requireWebhookSecret.');
  }
}

// ── 5. No credential read from the query string ───────────────────────────────
// Query strings are written in plaintext to Vercel logs, proxy logs, browser
// history, and the Referer header of every outbound link.
for (const [file, src] of sources) {
  if (/req\.query[^\n]*\bpassword\b/.test(src) && !src.includes('PASSWORD_IN_QUERY')) {
    fail(file, 'reads a password from req.query — it will be logged in plaintext. Use lib/adminAuth.js.');
  }
  if (/const\s*\{[^}]*\bpassword\b[^}]*\}\s*=\s*req\.query/.test(src)) {
    fail(file, 'destructures a password out of req.query — it will be logged in plaintext. Use lib/adminAuth.js.');
  }
}

// ── 6. No password hash in an API response ────────────────────────────────────
// verify-payment.js returned meta.passwordHash to the browser. Nothing read it.
for (const [file, src] of sources) {
  if (/(?:^|[^.\w])passwordHash\s*:/.test(src) && /res\.status\(\s*200\s*\)/.test(src)) {
    // checkout.js legitimately SENDS a hash to Stripe metadata; it does not return one.
    const inResponse = /res\.status\(\s*200\s*\)\.json\(\{[\s\S]{0,4000}?passwordHash/.test(src);
    if (inResponse) fail(file, 'returns passwordHash in an API response body.');
  }
}

// ── 7. Anything that sends mail must escape interpolated values ───────────────
// An unescaped value in an HTML email we DKIM-sign is a phishing email sent by us,
// from our own domain, to our own customer.
for (const [file, src] of sources) {
  if (!src.includes('resend.emails.send')) continue;

  // A route that sends HTML built ELSEWHERE and merely relays it is not the place to
  // escape — the template that assembled the markup is. send-email.js is exactly
  // this: internal-secret gated, and it forwards prebuiltHtml from lob-webhook and
  // friends. Double-escaping there would render &amp; in customers' inboxes.
  // The exemption is narrow on purpose: it requires BOTH the pass-through shape and
  // a fail-closed internal gate, so it cannot be claimed by a public route.
  const relaysPrebuilt = /prebuiltHtml|html:\s*html\b/.test(src);
  const internalGate = src.includes('INTERNAL_API_SECRET') || src.includes('timingSafeEqual');
  if (relaysPrebuilt && internalGate) {
    notes.push(`${relative('.', file)}: relays prebuilt HTML behind an internal gate — escaping belongs in the template that builds it.`);
    continue;
  }

  if (!src.includes('escapeHtml') && !src.includes('escape') && !src.includes('esc(') && !src.includes('h(')) {
    fail(file, 'sends an HTML email but never escapes an interpolated value. See escapeHtml in lib/webhookAuth.js.');
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`Security check — ${files.length} API routes`);

if (notes.length) {
  console.log('');
  for (const n of notes) console.log(`  NOTE  ${n}`);
}

if (failures.length) {
  console.error('');
  console.error(`  ${failures.length} security assertion(s) FAILED:`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error('');
  console.error('  Each of these is an ABSENCE. next build passes without them and the');
  console.error('  site works — the only other signal is the invoice or the incident.');
  process.exit(1);
}

console.log('');
console.log('✓ vendor calls metered, admin credentials off the query string, no hash leaks');
