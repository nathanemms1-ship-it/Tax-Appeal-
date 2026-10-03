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

// ── 2b. The logo is a component, not 39 copies ─────────────────────────────
/*
  Nathan, 2 Oct: "the logo on just the landing page is different."

  It was different because the mark was never a component -- it was inline
  markup repeated in 39 files in five spellings (34px and 32px, single and
  double quotes, one whitespace-free variant). Changing the homepage changed
  one of thirty-nine.

  Third duplication of the session, after 24 palettes and 37 font imports.
  Each one was invisible until something made the copies disagree.
*/
{
  const emojiLogos = files.filter((f) => />\s*\u{1F3E0}\s*<\/div>/u.test(readFileSync(f, 'utf8')));
  t(`no page draws the logo as an emoji${emojiLogos.length ? ' (' + emojiLogos.map((f) => path.relative(root, f)).join(', ') + ')' : ''}`,
    emojiLogos.length === 0);

  // A second inline mark would drift from the component the same way.
  const inlineMarks = files.filter((f) => {
    if (f.endsWith('LogoMark.js')) return false;
    return /className="logo-mark"/.test(strip(readFileSync(f, 'utf8')));
  });
  t(`no page hand-rolls the logo mark${inlineMarks.length ? ' (' + inlineMarks.map((f) => path.relative(root, f)).join(', ') + ')' : ''}`,
    inlineMarks.length === 0);

  // And every page that shows a logo reaches for the one component.
  const users = files.filter((f) => /<LogoMark[\s/>]/.test(readFileSync(f, 'utf8')));
  t(`the shared logo mark is used site-wide (${users.length} pages)`, users.length >= 35);
}

// ── 3. Nothing light-ground sits on a dark ground ───────────────────────────
/*
  The green theme shipped with ONE set of values, all assuming a light
  background. Every dark band then reused them, and the live page measured:

      "We prepare and mail property tax appeals..."   1.24 : 1
      "You won't be charged until..."                 1.56 : 1
      the <5% card's body text                        2.42 : 1
      "ONE-TIME FEE" on the amber card                2.73 : 1

  4.5 is the bar for body text. Those are not near-misses -- mutedGray on
  #0F6B57 is very nearly invisible, which is how it looked, and nothing in
  the build said a word.

  This computes real WCAG ratios rather than pattern-matching, so it catches
  a bad pair nobody anticipated. It checks the PALETTE's own promises: any
  token meant for a light ground must pass there, and every onDark* token
  must pass on the primary.
*/
const hex = (h) => {
  const v = h.replace('#', '');
  const f = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
};
const lum = (h) => {
  const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

{
  const { C: P } = await import('../lib/theme.js');
  // [name, foreground, background, minimum]. 3.0 where the token is only
  // ever used at 24px+ or as a ground itself.
  const pairs = [
    ['bodyGray on bg', P.bodyGray, P.bg, 4.5],
    ['bodyGray on white', P.bodyGray, P.white, 4.5],
    ['mutedGray on bg', P.mutedGray, P.bg, 4.5],
    ['mutedGray on white', P.mutedGray, P.white, 4.5],
    ['darkNavy on bg', P.darkNavy, P.bg, 4.5],
    ['navy on white', P.navy, P.white, 4.5],
    ['white on navy', P.white, P.navy, 4.5],
    ['red on bg', P.red, P.bg, 4.5],
    ['gold on white (large only)', P.gold, P.white, 3.0],
    // The on-dark set exists precisely because the above fail on green.
    ['onDarkHeading on navy', P.onDarkHeading, P.navy, 4.5],
    ['onDarkBody on navy', P.onDarkBody, P.navy, 4.5],
    ['onDarkAccent on navy', P.onDarkAccent, P.navy, 4.5],
  ];
  for (const [name, fg, bg, min] of pairs) {
    const r = ratio(fg, bg);
    t(`${name} is ${r.toFixed(2)}:1, needs ${min}`, r >= min);
  }

  // And the mistake itself: a light-ground token used as text on the primary.
  const onDarkOffenders = [];
  for (const f of files) {
    const src = strip(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/\.(ann-bar|footer-cta)[^{]*\{([^}]*)\}/g)) {
      // NO TRAILING \} HERE, DELIBERATELY. The block capture above is
      // `([^}]*)`, which stops at the first `}` -- and the first `}` inside a
      // rule body is the one closing `${C.token}`. So the captured body ends
      // mid-token and a pattern requiring the brace never matches.
      //
      // This assertion passed green while `.footer-cta-note` was set back to
      // mutedGray on purpose. Same shape as the Section W failure on 30 Sept:
      // an assertion that cannot fail is worse than no assertion, because it
      // reports success.
      if (/color:\s*\$\{C\.(mutedGray|bodyGray|gold|darkNavy)\b/.test(m[2])) {
        onDarkOffenders.push(`${path.relative(root, f)} .${m[1]}`);
      }
    }
  }
  t(`no light-ground token is used as text on a green band${onDarkOffenders.length ? ' (' + onDarkOffenders.join(', ') + ')' : ''}`,
    onDarkOffenders.length === 0);
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
