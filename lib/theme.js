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
 * -- 2 Oct, THE GREEN THEME ------------------------------------------------
 * Chosen from four whole-site samples. Deep green primary (#0F6B57) on a warm
 * off-white ground (#F7F5F1), warm ochre accent, near-black warm text.
 *
 * This edit is the entire re-theme: 3,152 `C.<token>` usages and every CSS
 * custom property follow from it. The 663 hex literals still written inline
 * do NOT -- they are the visible tail, and verify-theme ratchets them down.
 *
 * -- CONTRAST, CHECKED RATHER THAN ASSUMED --------------------------------
 * Every pair below was measured against WCAG AA before shipping:
 *
 *     bodyGray on bg        6.67   darkNavy on bg       15.10
 *     mutedGray on bg        4.77   mutedGray on white    5.20
 *     navy on white          6.44   white on navy         6.44
 *     red on bg              5.45   #6B5618 on amber      6.41
 *
 * mutedGray was first set to #8A847B and FAILED at 3.40 -- it carries 377
 * captions and labels, so it was darkened to #726C63. Worth noting the old
 * navy palette failed the same pair at 2.80 and always had; the caption grey
 * on this site has never been readable until now.
 *
 * gold as TEXT on white is 3.02 -- below the 4.5 body threshold, above the
 * 3.0 large-text one. That is deliberate and is not a regression: it is the
 * ACCENT, used as a ground, on dark, or at 24px+, and the #FFC940 it replaces
 * scored 1.54 in the same position. Do not set it as small body text.
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
  navy: "#0F6B57",  // PRIMARY  - deep green. Buttons, links, headings   (431 uses)
  darkNavy: "#211F1C",  // near-black warm. The darkest text                 (477 uses)
  gold: "#C8872C",  // ACCENT   - warm ochre. Emphasis, money            (311 uses)

  // -- Grounds -------------------------------------------------------------
  white: "#FFFFFF",  //                                                   (451 uses)
  bg: "#F7F5F1",  // warm off-white page ground                        (140 uses)
  lightBlue: "#EFEDE7",  // inset panels. Name is historical, value is warm   ( 91 uses)
  border: "#E4E0D8",  // hairlines                                         (319 uses)

  // -- Text ----------------------------------------------------------------
  bodyGray: "#5C564D",  // body copy                                         (326 uses)
  mutedGray: "#726C63",  // captions, labels, disabled                    (377 uses)

  // -- Status --------------------------------------------------------------
  green: "#0F6B57",  // a good outcome - the primary, deliberately        ( 40 uses)
  red: "#B23A2E",  // an error                                          ( 41 uses)
  amber: "#FBF3E2",  // CAUTION GROUND, not a text colour. Pairs with
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
  teal: "#0F6B57",
  purple: "#8E44AD",

  // -- One-offs, each from a single file ------------------------------------
  navyLight: "#1C5A4A",
  goldDim: "#8A5E1E",
  offWhite: "#FBFAF7",
  text: "#211F1C",
  muted: "#7A746A",
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
