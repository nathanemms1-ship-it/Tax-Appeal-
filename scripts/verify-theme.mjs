#!/usr/bin/env node
/**
 * ============================================================================
 * ONE PALETTE, AND IT STAYS ONE.
 * ============================================================================
 * Written 2 Oct 2026, the day lib/theme.js was extracted.
 *
 * The palette used to be declared in 24 files and had already drifted in two
 * of them -- a different navy, gold and green, nobody's decision. The fix was
 * one definition; this is what stops the next 24 from appearing.
 *
 * It does NOT try to outlaw every hex literal today: 1,416 of them are still
 * written inline across pages/ and components/, and failing the build on all
 * of them would just mean the guard gets deleted. It fails on the thing that
 * actually caused the drift -- a second DEFINITION of the palette -- and it
 * RATCHETS the literal count downward so the tail shrinks and never grows.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) { if (e !== 'api') walk(f, out); }
    else if (e.endsWith('.js')) out.push(f);
  }
  return out;
};
const files = [...walk(path.join(root, 'pages')), ...walk(path.join(root, 'components'))];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── 1. The palette has exactly one home ─────────────────────────────────────
const theme = readFileSync(path.join(root, 'lib/theme.js'), 'utf8');
t('lib/theme.js exports C', /export const C = \{/.test(theme));
t('and exports CSS custom properties from the same object', /export const cssVars/.test(theme));

const redefiners = files.filter((f) => {
  const src = strip(readFileSync(f, 'utf8'));
  // `const C = { ...THEME, ... }` is allowed: it extends the shared palette.
  return /^const C = \{/m.test(src) && !/\.\.\.THEME/.test(src);
});
t(`no page redefines the palette${redefiners.length ? ' (' + redefiners.map((f) => path.relative(root, f)).join(', ') + ')' : ''}`,
  redefiners.length === 0);

const importers = files.filter((f) => /lib\/theme/.test(readFileSync(f, 'utf8')));
t(`every file that uses C imports it (${importers.length} files)`,
  files.every((f) => {
    const src = strip(readFileSync(f, 'utf8'));
    return !/\bC\.[a-zA-Z]/.test(src) || /lib\/theme/.test(src);
  }));

// ── 2. The brand colours appear in exactly one place ────────────────────────
// Re-typing #1B3A6B is how the drift happened. These three are the ones that
// drifted, so these three are the ones pinned.
for (const [name, hex] of [['navy', '#1B3A6B'], ['gold', '#FFC940'], ['green', '#2E7D52']]) {
  const offenders = files.filter((f) => strip(readFileSync(f, 'utf8')).toUpperCase().includes(hex));
  t(`${name} ${hex} is not retyped outside the palette${offenders.length ? ' (' + offenders.map((f) => path.relative(root, f)).join(', ') + ')' : ''}`,
    offenders.length === 0);
}

// ── 3. The literal tail only shrinks ────────────────────────────────────────
// A ratchet, not a ban. Lower this number as literals are migrated; the build
// fails if it ever climbs, so the tail cannot quietly grow back.
const LITERAL_BUDGET = 663;
let literals = 0;
for (const f of files) literals += (strip(readFileSync(f, 'utf8')).match(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g) || []).length;
t(`raw hex literals did not increase (${literals} vs budget ${LITERAL_BUDGET})`, literals <= LITERAL_BUDGET);
if (literals < LITERAL_BUDGET) {
  console.log(`  note: literals are down to ${literals} — lower LITERAL_BUDGET in this file to ${literals} to lock the gain in.`);
}

console.log(`\nverify-theme: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('\n  The palette was declared in 24 files once, and three of them had');
  console.log('  silently drifted to a different navy, gold and green.\n');
  process.exit(1);
}
console.log('One palette. Changing a theme is one file.\n');
