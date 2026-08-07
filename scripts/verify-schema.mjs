#!/usr/bin/env node
/**
 * DOES THE CODE WRITE A COLUMN THAT NOBODY HAS DECLARED?
 *
 * ============================================================================
 * WHY
 * ============================================================================
 * lib/orderColumns.js is the list checkSchema() verifies against the live database
 * every ten minutes. A hardcoded list is only as good as the discipline that
 * maintains it — someone adds a write, forgets the list, and the runtime guard goes
 * on reporting OK about a column it has never heard of.
 *
 * So the list is not trusted. This parses the source for every column actually
 * written to `orders` and fails the build if it finds one that is not declared. The
 * list therefore cannot fall behind the code, and checkSchema cannot be lulled.
 *
 * ============================================================================
 * TWO SHAPES, AND WHY BOTH MATTER
 * ============================================================================
 * Columns reach an update in two forms:
 *
 *   .update({ lob_status: newStatus })        an object literal
 *   patch.delivered_at = event.date_created   a property assignment
 *
 * The first version of this extractor only understood object literals, and it missed
 * `delivered_at` — a column added the same afternoon, in pages/api/lob-webhook.js,
 * for exactly this table. Had that shipped, the guard would have had a hole in it on
 * day one, in the file most likely to grow new columns.
 *
 * Extra entries in the list are harmless (a column that exists but is not yet
 * written). A write that is NOT in the list is the failure this catches.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { ORDER_WRITE_COLUMNS } = await import('../lib/orderColumns.js');
const declared = new Set(ORDER_WRITE_COLUMNS);

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} — ${got}`));

/** Every .js file in the app, excluding dependencies and build output. */
function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const found = new Map();  // column -> file that writes it

for (const file of sourceFiles(root)) {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);

  // Look only at regions that touch the orders table.
  const regions = [...src.matchAll(/from\(['"]orders['"]\)([\s\S]{0,3000}?)(?:\.eq\(|\.select\(|;)/g)];
  for (const region of regions) {
    const block = region[1];
    const op = /\.(insert|update|upsert)\(\{([\s\S]*?)\n\s*\}\)/.exec(block);
    if (!op) continue;
    const body = op[2];

    // Shape 1: object literal keys, including keys inside a conditional spread
    // such as `...(flSignatureName ? { fl_signature_name: x } : {})`.
    for (const m of body.matchAll(/^\s*(?:\.\.\.\([^)]*\?\s*\{\s*)?([a-z_][a-z0-9_]*)\s*:/gm)) {
      if (!found.has(m[1])) found.set(m[1], rel);
    }
    for (const m of body.matchAll(/\{\s*([a-z_][a-z0-9_]*)\s*:/g)) {
      if (!found.has(m[1])) found.set(m[1], rel);
    }
  }

  // Shape 2: a patch object built by assignment, then passed to .update().
  // This is what missed delivered_at. Scoped to files that mention the table at all,
  // so an unrelated `foo.bar = 1` elsewhere cannot produce a phantom column.
  if (src.includes("from('orders')") || src.includes('from("orders")')) {
    for (const m of src.matchAll(/\bpatch\.([a-z_][a-z0-9_]*)\s*=/g)) {
      if (!found.has(m[1])) found.set(m[1], rel);
    }
  }
}

// ── The check itself ──────────────────────────────────────────────────────────
t('the extractor found a plausible number of columns', found.size >= 40, `found ${found.size}`);

// Sanity: the three that actually broke things must all be detected. If the
// extractor stops seeing these, it has regressed and is no longer protecting anything.
for (const col of ['account_number', 'evidence_text', 'delivered_at']) {
  t(`the extractor still detects ${col}`, found.has(col));
}

const undeclared = [...found.entries()].filter(([col]) => !declared.has(col));
t('every column the code writes is declared in lib/orderColumns.js',
  undeclared.length === 0,
  undeclared.length ? `undeclared: ${undeclared.map(([c, f]) => `${c} (${f})`).join(', ')}` : undefined);

// The runtime half has to actually use the list, or none of this reaches the database.
const health = readFileSync(join(root, 'lib/healthChecks.js'), 'utf8');
t('checkSchema exists', /export async function checkSchema/.test(health));
t('checkSchema uses the declared list', /ORDER_WRITE_COLUMNS/.test(health));
t('checkSchema is wired into runAllChecks',
  health.slice(health.indexOf('export async function runAllChecks')).includes('checkSchema'));

if (failures.length) {
  console.error(`verify-schema: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.error('\nIf a column is legitimately new: add it to lib/orderColumns.js AND run the');
  console.error('migration against the database BEFORE deploying. In that order the worst case');
  console.error('is an unused column; in the other order it is a customer paying for nothing.');
  process.exit(1);
}
console.log(`verify-schema: ${pass} passed — ${found.size} written columns, all declared`);
