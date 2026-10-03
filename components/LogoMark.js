import { C } from '../lib/theme';

/**
 * ============================================================================
 * THE LOGO MARK. ONE DEFINITION.
 * ============================================================================
 * Created 2 Oct 2026, after Nathan spotted that the homepage logo no longer
 * matched the rest of the site.
 *
 * It did not match because the mark was never a component. It was inline
 * markup repeated in THIRTY-NINE files, in at least five spellings:
 *
 *     width: 34, borderRadius: 6, fontSize: 18     x 34  (double quotes)
 *     width: 34, borderRadius: 6, fontSize: 18     x  2  (single quotes)
 *     width: 32, borderRadius: 6, fontSize: 16     x  2
 *     ...plus a compressed, whitespace-free variant
 *
 * So changing the homepage changed exactly one of thirty-nine copies. Third
 * time this session: the palette was duplicated 24 times, the Google Fonts
 * URL 37 times, and the logo 39. Same cause every time -- the only way to use
 * a shared thing was to retype it.
 *
 * ── WHY AN SVG AND NOT THE EMOJI ────────────────────────────────────────────
 * The hero's emoji trust row came out earlier the same day because emoji
 * render differently on every platform, cannot be coloured, and date a page
 * instantly. The logo is the one place that matters most: it is on every
 * page, and on Windows it rendered as a completely different house.
 */
export default function LogoMark({ size = 34, radius = 8 }) {
  const glyph = Math.round(size * 0.55);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: C.navy,
        borderRadius: radius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke={C.white}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 10.2 12 3l9 7.2" />
        <path d="M5.5 9.4V20h13V9.4" />
        <path d="M10 20v-5.2h4V20" />
      </svg>
    </div>
  );
}
