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
 * -- WHY AN SVG AND NOT THE EMOJI ------------------------------------------
 * The hero's emoji trust row came out earlier the same day because emoji
 * render differently on every platform, cannot be coloured, and date a page
 * instantly. The logo is the one place that matters most: it is on every
 * page, and on Windows it rendered as a completely different house.
 *
 * ── REDRAWN 3 OCT 2026, FROM THE REAL MARK ────────────────────────────────
 * Nathan said the mark was still "off", and that the site was "definitly
 * missing some of the gold or yellow accent colors". Then he sent the answer
 * to both: a screenshot of his own browser tab.
 *
 * THE BRAND ALREADY HAS A MARK, and it has been shipping since 1 Aug 2026 in
 * public/apple-touch-icon.png: a SOLID GOLD HOUSE on a navy rounded square,
 * with the door knocked out in navy. Nobody had to design one. I drew a white
 * stroked outline instead, twice, because I never opened the favicon.
 *
 * Both complaints were the same mistake. The mark looked wrong because it was
 * not the mark; and the gold was missing from the nav because the one element
 * that is SUPPOSED to be gold on every page had been drawn in white.
 *
 * Three things the favicon got right that the outline did not:
 *
 *   1. IT IS A SILHOUETTE. A 2px stroke on a 24-unit viewBox, at the 19px the
 *      mark actually renders at, is 1.6 DEVICE PIXELS -- a grey smear on a 1x
 *      display, with the door closed up entirely. A filled shape has no
 *      minimum size.
 *
 *   2. THE HOUSE IS THE ACCENT. Not a detail on it. Gold on navy is 7.34:1
 *      and it is the whole glyph, so the brand colour appears in the nav of
 *      all forty-seven pages and in the browser tab, from one file.
 *
 *   3. IT FILLS ITS SQUARE. The eaves run to 1.9 and 22.1 of 24. The outline
 *      sat at 55% and read as a small grey thing floating in a navy box.
 *
 * Geometry below is measured off apple-touch-icon.png at 180px and divided
 * down to the 24-unit box, then nudged so the glyph spans y 3.2..20.8 --
 * centred on 12 exactly, where the old drawing sat half a unit low.
 *
 * ONE DELIBERATE DIFFERENCE FROM THE FILE: the gold. The icon was cut before
 * lib/theme.js existed and uses #C9A84C, the pre-consolidation gold. The
 * palette's gold is #FFC940. Taking the icon's value literally would have
 * re-created, in the one component on every page, exactly the drift the theme
 * file was written to end. So the SHAPE comes from the icon and the COLOUR
 * comes from the palette, and scripts/verify-theme.mjs now checks that the
 * icon files agree with C.gold rather than trusting that they do.
 */
export default function LogoMark({ size = 34, radius = 8 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: C.navy,
        borderRadius: radius,
        flexShrink: 0,
        lineHeight: 0,
      }}
    >
      {/* No glyph ratio. The drawing carries its own margins, as the icon does. */}
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        {/* Roof: apex on the centre line, eaves at the widest point of the mark. */}
        <path d="M12 3.2 1.9 11.6h20.2z" fill={C.gold} />
        {/* Body, meeting the roof under the eaves. */}
        <path d="M4.2 11.6h15.6v9.2H4.2z" fill={C.gold} />
        {/* The door is knocked OUT of the house -- navy, not a third colour. */}
        <path d="M9.6 20.8v-4.6h4.8v4.6z" fill={C.navy} />
      </svg>
    </div>
  );
}
