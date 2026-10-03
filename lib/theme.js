/**
 * ============================================================================
 * THE PALETTE. ONE DEFINITION. Extracted 2 Oct 2026.
 * ============================================================================
 * Before this file existed, `const C = { ... }` was declared separately in
 * TWENTY-FOUR page and component files, and the copies had already drifted:
 *
 *     navy    #1B3A6B in 14 files,  #1B2A4A in one
 *     gold    #FFC940 in 14 files,  #C9A84C in one
 *     green   #2E7D52 in 13 files,  #1A7A4A in one
 *
 * Nobody decided that. It happened because the only way to use a brand colour
 * was to retype it, and a retyped colour is a colour that can be mistyped.
 *
 * Measured across pages/ and components/ the day this was written:
 *
 *     3,152  usages already routed through a `C.<token>`   <- re-themed here
 *     1,416  raw hex literals written inline               <- still to migrate
 *        91  rgb()/rgba() literals
 *       727  fontFamily declarations, in 12 different stacks
 *
 * So about 69% of every colour decision on the site now flows through this
 * object. Changing a value here changes it everywhere, which is the whole
 * point and is also why it deserves care.
 *
 * -- THIS EXTRACTION CHANGED NO COLOUR -------------------------------------
 * Every value below is the majority value already in use, so the site renders
 * identically to the commit before it. The three drifted files are corrected
 * ONTO the majority, which is the only visible difference and is a fix.
 *
 * A theme change is a separate, reviewable commit that edits only this file.
 *
 * -- 3 Oct, REVERTED TO NAVY ----------------------------------------------
 * The green theme shipped 2 Oct and came back off the next day: Nathan did
 * not like the colours. The new landing-page LAYOUT stays -- two-column hero,
 * heavy sans, no emoji, white cards, one band -- because layout and palette
 * are now separable, which is the entire return on extracting this file.
 * Reverting was editing the values below. Nothing else moved.
 *
 * The navy palette is measurably the stronger of the two:
 *
 *     navy on white  11.27      white on navy    11.27
 *     gold on navy    7.34      darkNavy on gold 10.66
 *     bodyGray on bg  5.07      darkNavy on bg   15.23
 *
 * TWO THINGS DID NOT GO BACK, both deliberate:
 *
 * 1. mutedGray is #636F87, not the original #8596AF. The original measured
 *    2.80 on the page ground and 3.01 on white, against a 4.5 bar, and it
 *    carries 377 captions and labels. It has been unreadable for as long as
 *    this site has existed and nobody had measured it. #636F87 is the same
 *    blue-grey, darkened until it passes (4.71 / 5.06).
 *
 * 2. The onDark* tokens stay. They were added for the green bands and they
 *    are just as necessary here -- a navy band needs them too, and gold at
 *    7.34 on navy is exactly the pairing the original brand was built on.
 *
 * -- TOKEN NAMES ARE HISTORICAL, NOT DESCRIPTIVE ---------------------------
 * `navy` means "the primary brand colour" and `gold` means "the accent", in
 * 431 and 311 places respectively. When the palette moves to a green theme
 * those names stop describing their values. Renaming them is a bigger and
 * riskier change than re-valuing them, so the names stay and this note is the
 * warning: read `navy` as PRIMARY and `gold` as ACCENT.
 */
export const C = {
  // -- Brand ---------------------------------------------------------------
  navy: "#1B3A6B",  // PRIMARY  - buttons, links, headings            (431 uses)
  darkNavy: "#0F1F3D",  // the darkest text and dark panel grounds        (477 uses)
  gold: "#FFC940",  // ACCENT   - emphasis, money, highlights         (311 uses)

  // -- Grounds -------------------------------------------------------------
  white: "#FFFFFF",  //                                                (451 uses)
  bg: "#F4F7FC",  // page ground                                    (140 uses)
  lightBlue: "#EEF3FB",  // inset panels                                   ( 91 uses)
  border: "#E8EDF4",  // hairlines                                      (319 uses)

  // -- Text ----------------------------------------------------------------
  bodyGray: "#5A6B82",  // body copy - 5.07 on bg                         (326 uses)
  mutedGray: "#636F87",  // captions - CORRECTED, see the note below       (377 uses)

  // -- Status --------------------------------------------------------------
  green: "#2E7D52",  // a good outcome                                 ( 40 uses)
  /*
    The pale ground a positive block sits on. Added 3 Oct, because the green
    theme left #E3F0EA hardcoded in three places and those literals survived
    the revert and clashed with navy. A one-off literal that outlives its
    theme is the whole reason this file exists; the fix is a token, not
    another literal. green on it is 4.51, darkNavy 14.65, bodyGray 4.87.
  */
  greenBg: "#EAF5EF",
  red: "#C0392B",  // an error - 5.06 on bg                          ( 41 uses)
  amber: "#FFF8E6",  // CAUTION GROUND, not a text colour. Pairs with
                        // #6B5618 / #7A5C10. Used for cost-to-cure warnings
                        // and deadline notices - never for good news, which
                        // is the mistake found on the Texas saving box on
                        // 1 Oct: the best figure on the page was being drawn
                        // in the palette reserved for things going wrong.

  // -- Chart and category colours ------------------------------------------
  // One file each today. Kept so the extraction is lossless; they are the
  // first candidates to fold into a proper categorical ramp.
  violet: "#6B4FA8",
  orange: "#E67E22",
  blue: "#2980B9",
  teal: "#27AE60",
  purple: "#8E44AD",

  /*
    -- ON DARK ---------------------------------------------------------------
    Added 2 Oct 2026, after the green theme shipped and the bands went
    unreadable. Every token above assumes a LIGHT ground, so a dark band had
    nothing to reach for and reused them. Measured on the live page:

        "We prepare and mail property tax appeals..."   1.24 : 1
        "You won't be charged until..."                 1.56 : 1
        the <5% card's body text                        2.42 : 1
        "ONE-TIME FEE" on the amber card                2.73 : 1

    4.5 is the bar. Those are not near-misses -- mutedGray on #0F6B57 is very
    nearly invisible, which is exactly how it looked.

    The homepage now uses one green band (the closing call to action) so most
    of this is unused there. It is in the palette anyway, because the Texas
    verdict screens, the emails and the PDF cover all put text on a coloured
    ground, and the next one should not have to rediscover this.

    USE THESE ONLY ON `navy` OR DARKER. On the cream ground they are the ones
    that fail.
  */
  onDarkHeading: "#FFFFFF",  // 11.27 on navy
  onDarkBody:    "#C7D6EA",  //  7.64 on navy
  onDarkAccent:  "#FFC940",  //  7.34 on navy - gold IS the on-navy accent
  onDarkLine:    "#2A4D7F",  // hairlines inside a navy band

  // -- One-offs, each from a single file ------------------------------------
  navyLight: "#243454",
  goldDim: "#8B6F2E",
  offWhite: "#F8F7F4",
  text: "#1A1A2E",
  muted: "#666680",
};

/**
 * The same values as CSS custom properties, injected once in pages/_app.js.
 *
 * The site has ZERO CSS variables today - every colour is a JS value handed
 * to an inline `style` prop. That works for React but leaves nothing for
 * `<style jsx global>`, a `:hover`, a `::placeholder`, a media query or a
 * print stylesheet to reference, which is why those have all been hardcoded
 * separately. This gives them one source too.
 */
export const cssVars = Object.entries(C)
  .map(([k, v]) => `--c-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${v};`)
  .join(' ');

/**
 * ============================================================================
 * TYPE. Same story as colour, same fix.
 * ============================================================================
 * Added 2 Oct 2026, right after the palette, because the homepage did not look
 * like the approved mockup even once the colours were right -- and the reason
 * was type and layout, not colour. A token flip cannot change a typeface.
 *
 * 727 `fontFamily` declarations across 12 stacks were in the codebase, and the
 * Google Fonts URL was retyped in 37 files, 7 of them as their own
 * `const FONT_IMPORT`. Exactly the duplication the palette had.
 *
 * The green theme uses PLUS JAKARTA SANS at heavy weights for display, which
 * is what the approved sample used: a geometric sans at 800 reads confident
 * and modern where DM Serif Display reads formal and traditional. The serif
 * was right for the navy brand; it is not right for this one.
 */
export const FONTS = {
  display: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  body: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

/** One Google Fonts import, so 37 files stop each carrying their own. */
export const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');";

export default C;
