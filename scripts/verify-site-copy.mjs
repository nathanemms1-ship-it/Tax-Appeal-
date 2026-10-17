#!/usr/bin/env node
/**
 * THE SITE SAYS WHAT THE PRODUCT IS. Added 16 Oct 2026 (site overhaul).
 *
 * The product is a kit (lib/copy/kit.js): we check first, mail the CUSTOMER a
 * ready-to-sign kit, and they sign and mail it. Every public page used to say
 * we file it, by certified mail, on the customer's behalf. Under the kit model
 * each of those sentences is false, and some are a legal problem: a document
 * preparer that says it files or represents is claiming something it doesn't do.
 *
 * This scans every public surface (pages outside api/ and admin, components,
 * the blog and copy modules) with comments stripped, and fails on any claim in
 * BANNED unless the words right before it negate it ("we do not file").
 *
 *   node scripts/verify-site-copy.mjs            enforce (build)
 *   node scripts/verify-site-copy.mjs --report   list every hit, never fail
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

export const BANNED = [
  ['certified mail', /certified[\s-]+mail/gi],
  ['return receipt', /return receipt/gi],
  ['we file', /\bwe(?:'ll| will| can| then)?\s+(?:file|submit|lodge)\b/gi],
  ['file it for you', /\b(?:file|submit|send|mail)s?\s+(?:it|them|your [\w-]+(?: [\w-]+)?)\s+(?:for you|on your behalf)/gi],
  ['on your behalf', /on your behalf/gi],
  ['we mail it to the county', /\bwe(?:'ll| will)?\s+(?:mail|send|deliver)\s+(?:it|them|your [\w-]+(?: [\w-]+)?)\s+(?:directly\s+)?to (?:the|your) (?:county|appraisal|district|vab|value adjustment|board|clerk)/gi],
  ['we pay the fee', /\bwe(?:'ll| will)?\s+pay\s+(?:the|your)\s+(?:county(?:'s)?\s+)?(?:vab\s+)?(?:filing\s+)?fee/gi],
  ['we represent you', /\bwe(?:'ll| will)?\s+represent\b/gi],
  ['done for you', /done[\s-]for[\s-]you/gi],
  ['filed by us', /\bfiled by (?:us|taxappeal)/gi],
  ['we handle the filing', /\bwe handle (?:the )?(?:filing|everything|the paperwork and filing)/gi],
  ['the only company', /\bthe only (?:company|service)\b/gi],
  ['mailing service', /\b(?:preparation and )?mailing service\b/gi],
  ['not filing yet', /\bnot filing (?:yet|in|\w+ appeals)\b/gi],
];
const NEGATION = /\b(?:not|never|don't|doesn't|won't|cannot|can't|no longer)\b[^.]{0,40}$/i;

const SKIP_DIRS = new Set(['api', 'admin', 'node_modules']);

/*
 * THE FLORIDA FUNNEL, NOT YET. These files describe what happens at purchase
 * for a Florida order TODAY (sign online, we mail the petition with the fee),
 * which is still how Florida checkout works until the Florida kit is built
 * (plan Phase F, before Florida opens in June 2027). Copy must match the
 * product actually sold, so they leave this list together with that change.
 * Georgia and Texas never reach these screens (they buy through
 * components/GaKitStep.js and components/TxKitCheckout.js).
 */
export const PENDING_FL_KIT = new Set([
  'pages/apply.js', 'pages/success.js', 'pages/portal.js',
  'components/SignatureStep.js', 'components/StepFloridaFee.js',
]);
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) { if (!SKIP_DIRS.has(e)) walk(f, out); }
    else if (/\.(js|jsx)$/.test(e) && e !== 'admin.js') out.push(f);
  }
  return out;
};
export const FILES = [
  ...walk(path.join(root, 'pages')),
  ...walk(path.join(root, 'components')),
  path.join(root, 'lib/blogPosts.js'),
  path.join(root, 'lib/copy/kit.js'),
  path.join(root, 'lib/stats.js'),
  path.join(root, 'lib/stateService.js'),
];
// The rewritten "how to make sure it arrives on time" page keeps its old URL
// (search history); the slug itself is not a claim.
const KEPT_SLUG = /\/why-certified-mail-matters/g;
const strip = (s) => s.replace(KEPT_SLUG, '/[kept-slug]').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const hits = [];
for (const f of FILES) {
  if (PENDING_FL_KIT.has(path.relative(root, f))) continue;
  let src; try { src = strip(readFileSync(f, 'utf8')); } catch { continue; }
  for (const [label, re] of BANNED) {
    for (const m of src.matchAll(re)) {
      const before = src.slice(Math.max(0, m.index - 60), m.index);
      if (NEGATION.test(before)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      hits.push({ file: path.relative(root, f), line, label, text: src.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ') });
    }
  }
}

const byFile = new Map();
for (const h of hits) byFile.set(h.file, (byFile.get(h.file) || 0) + 1);
if (REPORT) {
  for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), f);
  console.log(`verify-site-copy (report): ${hits.length} old-model claims in ${byFile.size} files`);
  process.exit(0);
}
if (hits.length) {
  console.log(`verify-site-copy: ${hits.length} old-model claims in ${byFile.size} files. The product is a kit the customer signs and mails (lib/copy/kit.js).`);
  for (const h of hits.slice(0, 40)) console.log(`  ✗ ${h.file}:${h.line} [${h.label}] …${h.text}…`);
  if (hits.length > 40) console.log(`  … and ${hits.length - 40} more (run with --report)`);
  process.exit(1);
}
console.log(`verify-site-copy: 0 old-model claims across ${FILES.length} public files`);
