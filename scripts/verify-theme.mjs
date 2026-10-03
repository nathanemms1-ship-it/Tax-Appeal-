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
import { inflateSync } from 'node:zlib';
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
    ['green on greenBg', P.green, P.greenBg, 4.5],
    ['bodyGray on greenBg', P.bodyGray, P.greenBg, 4.5],
    /*
      NOT `gold on white`. That pair was in this list under the green theme
      and it fails at 1.54 under the navy one -- but it fails because the
      pair is wrong, not because the colour is. Gold is the ON-NAVY accent
      and a button ground; those are its two real roles and both are strong.

      UNVERIFIED, and worth saying so: there are 171 `color: C.gold` uses
      across 41 files. Spot checks all sat on navy grounds, but they have not
      each been traced to their background. If one is on white it is 1.54:1
      and this guard will not catch it. On the running list.
    */
    ['gold on navy', P.gold, P.navy, 4.5],
    ['darkNavy on gold (button)', P.darkNavy, P.gold, 4.5],
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

// ── 2c. No page asks for a typeface it does not load ───────────────────────
/*
  Written 3 Oct 2026. This is the guard for a bug nobody reported, found while
  chasing one Nathan DID report.

  He said twice that the logo looked wrong. The first time it was the mark,
  and that became components/LogoMark.js. The second time it was the WORDS --
  the homepage logotype was Plus Jakarta Sans and the other forty-six pages
  were DM Serif Display, because the logotype was reading ${FONTS.display} and
  the display face had changed under it.

  The thing nobody reported: when the shared FONT_IMPORT replaced the
  per-page Google Fonts URLs on 2 Oct, it dropped the DM families -- but four
  elements on pages/index.js still named 'DM Serif Display' and six named
  'DM Sans'. An unloaded family is not an error. The browser silently falls
  back, so the live homepage served "What the county records actually show"
  and the 70% / 69.7% / 49% figures in TIMES NEW ROMAN for a day, and the
  build was green the whole time.

  That is the same failure mode as the colour drift: a reference and its
  definition in different files, with nothing checking they agree. The palette
  got a guard; type did not.

  So: for every page, read the families it NAMES and the families its import
  LOADS, and require the first to be a subset of the second. System stacks
  (-apple-system, Georgia, serif, ...) are not webfonts and are skipped --
  they are exactly the fallbacks that make this failure silent.
*/
{
  const SYSTEM = new Set([
    'serif', 'sans-serif', 'monospace', 'system-ui', 'ui-monospace', 'ui-sans-serif',
    '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'Helvetica',
    'Arial', 'Georgia', 'Times New Roman', 'Times', 'Courier New', 'SFMono-Regular',
    'Menlo', 'Monaco', 'Consolas', 'Roboto', 'Liberation Mono', 'Apple Color Emoji',
    // components/SignatureStep.js renders the typed name in a script face.
    // Ships with Windows and macOS, falls back to `cursive`, never loaded.
    'Brush Script MT',
  ]);
  const themeImport = (theme.match(/family=([^&'")]+)/g) || []).map((m) => m.slice(7).split(':')[0].replace(/\+/g, ' '));

  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const body = strip(src);
    // What this file loads: its own Google Fonts URL, plus the shared one if
    // it imports FONT_IMPORT from the theme.
    const loaded = new Set((body.match(/family=([^&'")]+)/g) || []).map((m) => m.slice(7).split(':')[0].replace(/\+/g, ' ')));
    if (/FONT_IMPORT/.test(body)) for (const fam of themeImport) loaded.add(fam);

    /*
      A COMPONENT LOADS NOTHING AND RENDERS EVERYWHERE, so it is held to the
      strictest page it can appear on, not excused.

      The first version of this check skipped any file with no import of its
      own -- "a partial that inherits its page's <style>" -- and that excuse
      hid seven components still naming 'DM Sans'. On the forty-six pages
      that still load the DM families they were fine; on the rebuilt
      homepage, which does not, the disclaimer under the stat cards was
      rendering in Helvetica. Exactly the bug this guard was written for,
      sitting inside the exemption the guard granted itself.

      Components get the theme's import as their floor instead.
    */
    if (loaded.size === 0) for (const fam of themeImport) loaded.add(fam);

    /*
      What this file names. SCOPED TO FONT DECLARATIONS, and it has to be.

      The first version of this matched any quoted capitalised word followed
      by a comma -- which is every county name, every JSON-LD @type, every
      table header in admin.js. It reported 900 offenders including
      "pages/alabama.js wants Autauga". Fourth time this session a matcher
      has been written loose enough to match the wrong thing; the pattern is
      always the same, a regex tested only against what it should catch and
      never against what it should ignore.

      So: find the font declaration first, then read the stack inside it.
    */
    const decls = [
      ...body.matchAll(/fontFamily:\s*(["'])((?:(?!\1).)*)\1/g),
      ...body.matchAll(/font-family:\s*([^;}\n]+)/g),
    ].map((m) => (m.length > 2 ? m[2] : m[1]));

    for (const stack of decls) {
      // ${FONTS.x} resolves to the theme, which is checked against its own import.
      if (/\$\{/.test(stack)) continue;
      for (const q of stack.matchAll(/'([^']+)'|"([^"]+)"/g)) {
        const fam = (q[1] || q[2]).trim();
        if (SYSTEM.has(fam) || loaded.has(fam)) continue;
        offenders.push(`${path.relative(root, f)} wants ${fam}`);
      }
    }
  }
  const uniq = [...new Set(offenders)];
  t(`no page names a webfont it never loads${uniq.length ? ' (' + uniq.join('; ') + ')' : ''}`, uniq.length === 0);

  // The logotype is not the display face. It must not follow a theme change.
  t('the theme gives the logotype its own token', /wordmark:\s*"'DM Serif Display'/.test(theme));
  t('and the shared import actually loads it', /family=DM\+Serif\+Display/.test(theme));
  const idx = strip(readFileSync(path.join(root, 'pages/index.js'), 'utf8'));
  t('the homepage logotype uses it', /\.logo-name \{[^}]*FONTS\.wordmark/.test(idx));
  t('and reads "TaxAppeal USA", as the other 46 pages do', /className="logo-name">TaxAppeal USA</.test(idx));
}

// ── 2d. Gold still has somewhere to be ─────────────────────────────────────
/*
  Nathan, 3 Oct: "definitly missing some of the gold or yellow accent colors."

  He was right, and the cause was a revert that was not symmetrical. Gold had
  three jobs on the homepage: the top strip, the <5% figure, and the closing
  button. Going green took two of them away for good reasons -- gold on green
  is 2.13:1, and the stat card became white, where gold is 1.54:1. Coming back
  to navy restored the grounds but not the accents, because a revert undoes
  what it was told to undo and nobody told it about these.

  A colour that is in the palette but on no page is not a brand colour. Pin
  the three places it belongs so the next theme experiment has to put them
  back explicitly rather than by remembering.
*/
{
  const idx = strip(readFileSync(path.join(root, 'pages/index.js'), 'utf8'));
  t('the closing button is gold, not white',
    /\.footer-cta-btn \{[^}]*background: \$\{C\.gold\}/.test(idx));
  t('with darkNavy type on it (10.66:1)',
    /\.footer-cta-btn \{[\s\S]{0,120}?color: \$\{C\.darkNavy\}/.test(idx));
  t('the <5% card carries a gold edge', /\.stat-banner \{[\s\S]{0,160}?border-left: 5px solid \$\{C\.gold\}/.test(idx));
  t('the top strip still has its gold emphasis', /\.ann-bar strong \{ color: \$\{C\.onDarkAccent\}/.test(idx));
  t('and the mark carries the accent onto all 47 pages',
    /fill=\{C\.gold\}/.test(readFileSync(path.join(root, 'components/LogoMark.js'), 'utf8')));
}

// ── 2e. The icon in the browser tab is the same mark, in the same gold ─────
/*
  Nathan, 3 Oct, after being told twice that the logo was fixed: "Here is our
  old logo for reference" -- a screenshot of his own tab bar, showing a solid
  GOLD house on navy with the door knocked out.

  The brand had a mark the whole time, shipping since 1 Aug in public/. It got
  redrawn twice as a white stroked outline because nobody opened the file. Two
  complaints, one cause: the mark looked wrong because it was not the mark,
  and the gold was missing from the nav because the one element that is gold
  on every page had been drawn in white.

  The icons were cut before lib/theme.js existed, so their gold was #C9A84C
  against the palette's #FFC940. scripts/make_icons.py now generates them FROM
  the palette; this reads the pixels back OUT and checks. A PNG is the one
  kind of file where a stale brand colour cannot be caught by reading source,
  which is exactly why this one survived the palette consolidation.
*/
{
  const { C: P } = await import('../lib/theme.js');

  // Minimal 8-bit truecolour-alpha PNG reader: header, inflate, unfilter.
  const pixels = (file) => {
    const b = readFileSync(path.join(root, file));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    if (b[24] !== 8 || b[25] !== 6) throw new Error(`${file}: expected 8-bit RGBA`);
    const idat = [];
    for (let o = 8; o < b.length;) {
      const len = b.readUInt32BE(o), typ = b.toString('ascii', o + 4, o + 8);
      if (typ === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len));
      if (typ === 'IEND') break;
      o += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const bpp = 4, stride = w * bpp;
    const out = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
      const ft = raw[y * (stride + 1)];
      const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? out[y * stride + i - bpp] : 0;
        const bb = y > 0 ? out[(y - 1) * stride + i] : 0;
        const c = y > 0 && i >= bpp ? out[(y - 1) * stride + i - bpp] : 0;
        let v = line[i];
        if (ft === 1) v += a;
        else if (ft === 2) v += bb;
        else if (ft === 3) v += (a + bb) >> 1;
        else if (ft === 4) {
          const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
        }
        out[y * stride + i] = v & 0xff;
      }
    }
    const seen = new Map();
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] < 128) continue; // the rounded corners
      const hex = '#' + [out[i], out[i + 1], out[i + 2]]
        .map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
      seen.set(hex, (seen.get(hex) || 0) + 1);
    }
    return seen;
  };

  for (const f of ['public/apple-touch-icon.png', 'public/favicon-32x32.png', 'public/favicon-16x16.png']) {
    let seen;
    try { seen = pixels(f); } catch (e) { t(`${f} is readable (${e.message})`, false); continue; }
    const found = [...seen.keys()].sort();
    const want = [P.gold, P.navy].map((c) => c.toUpperCase()).sort();
    t(`${path.basename(f)} is drawn in exactly C.navy and C.gold (found ${found.join(' ')})`,
      found.length === 2 && found[0] === want[0] && found[1] === want[1]);
    // And the house is actually there -- a solid navy square would pass a
    // colour check that only looked for "no stale hex".
    const gold = seen.get(P.gold.toUpperCase()) || 0;
    const total = [...seen.values()].reduce((a, n) => a + n, 0);
    t(`${path.basename(f)} is roughly a third gold (${Math.round((gold / total) * 100)}%)`,
      gold / total > 0.25 && gold / total < 0.5);
  }

  // The generator is the only thing that should be writing those files.
  const gen = readFileSync(path.join(root, 'scripts/make_icons.py'), 'utf8');
  t('the icon generator reads its colours from the palette, not its own copy',
    /token\("navy"\)/.test(gen) && /token\("gold"\)/.test(gen) && !/#[0-9A-Fa-f]{6}"\s*$/m.test(gen));
}

// ── 2f. Every card on the homepage has a drawn edge ───────────────────────
/*
  Nathan, 3 Oct: "it all just blends together a little."

  It did, and the measurement says why. The cards are #FFFFFF on a #F4F7FC
  page -- a 1.06:1 edge -- held apart by nothing but a box-shadow at 4% and
  6% opacity. On a bright screen that is invisible, so the whole hero read as
  one grey field.

  Worse, the page ran TWO conventions at once: .step, .faq-item and the three
  outcome cards carried a 1.5px line (1.18:1, barely better), while
  .price-card, .stat-card, .stat-banner and .price-box carried a shadow and
  no line at all. Nobody chose that -- it accumulated.

  Option B: one hairline, C.cardLine, on all seven, and the shadows go. The
  point is not that a line is prettier than a shadow; it is that a 6% shadow
  cannot do a line's job, and the page was asking it to.

  This pins the outcome rather than the taste. A future theme is free to
  change what cardLine IS. It is not free to leave a card with no edge, or to
  go back to separating cards by shadow alone.
*/
{
  const idx = strip(readFileSync(path.join(root, 'pages/index.js'), 'utf8'));

  const CARDS = ['price-card', 'stat-card', 'stat-banner', 'price-box', 'step', 'faq-item'];
  const edgeless = CARDS.filter((c) => {
    // Anchored to the rule's own opening brace so a longer class name
    // (.stat-card vs .stat-banner) cannot satisfy a shorter one's check.
    const m = idx.match(new RegExp(`\\.${c} \\{([\\s\\S]*?)\\n        \\}`));
    return !m || !/border: 1px solid \$\{C\.cardLine\}/.test(m[1]);
  });
  t(`every homepage card has a drawn edge${edgeless.length ? ' (' + edgeless.join(', ') + ')' : ''}`,
    edgeless.length === 0);

  // The three outcome cards are inline markup, not a class.
  t('the outcome cards use the same edge, not their own literal',
    /border: `1px solid \$\{C\.cardLine\}`/.test(idx) && !/1\.5px solid #E8EDF4/.test(idx));

  t('no card is separated by a shadow instead', !/box-shadow/.test(idx));

  // The gold edge on the <5% card is one `border-left` away from being erased
  // by the shorthand that was just added above it. Order is load-bearing.
  const banner = idx.match(/\.stat-banner \{([\s\S]*?)\n        \}/);
  t('the stat-banner shorthand comes before its gold border-left',
    !!banner
    && banner[1].indexOf('border: 1px solid') !== -1
    && banner[1].indexOf('border: 1px solid') < banner[1].indexOf('border-left'));

  // And cardLine has to stay distinguishable from the structural line, or
  // this whole exercise silently undoes itself.
  const cardLine = (theme.match(/cardLine:\s*"(#[0-9A-Fa-f]{6})"/) || [])[1];
  const border = (theme.match(/^\s*border:\s*"(#[0-9A-Fa-f]{6})"/m) || [])[1];
  t(`the card edge is darker than the structural hairline (${cardLine} vs ${border})`,
    !!cardLine && !!border && lum(cardLine) < lum(border));
  t(`the card edge reads against white (${cardLine ? ratio(cardLine, '#FFFFFF').toFixed(2) : '?'}:1, wants 1.3+)`,
    !!cardLine && ratio(cardLine, '#FFFFFF') >= 1.3);
  // ...but not so dark that the boxes outrank the price. Option C was 11.27.
  t('and does not outrank the content inside it',
    !!cardLine && ratio(cardLine, '#FFFFFF') < 3.0);
}

// ── 3. The literal tail only shrinks ────────────────────────────────────────
// A ratchet, not a ban. Lower this number as literals are migrated; the build
// fails if it ever climbs, so the tail cannot quietly grow back.
const LITERAL_BUDGET = 642;
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
