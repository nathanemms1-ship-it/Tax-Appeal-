/**
 * THE FLORIDA POSITIONING LINE.
 *
 * ============================================================================
 * WHY THREE, AND WHY CHOSEN BY HASH
 * ============================================================================
 * One line repeated across ~130 Florida pages reads as boilerplate to a reader
 * and as a duplicated block to a crawler. Three lines rotated by page gives the
 * site variety without giving it three different promises — all three say the
 * same thing, which is the only claim on this site a competitor cannot copy:
 * we run the arithmetic first and we refuse the sale when the answer is no.
 *
 * THE SELECTION IS DETERMINISTIC, NOT RANDOM. Math.random() would give a page a
 * different line on every static build, which breaks the Next.js build/runtime
 * HTML match, makes diffs unreadable, and would let the same URL show different
 * copy to Google than to a customer. A hash of the page slug means Sarasota gets
 * the same line forever, and a new county slots in without touching any other
 * page.
 *
 * ============================================================================
 * WHAT WAS REJECTED, AND WHY — DO NOT REINSTATE IT
 * ============================================================================
 * The line that started this was "the only property tax service that tells you
 * when not to hire it." It is a good line and it is NOT USABLE. "Only" is an
 * unqualified superiority claim, and it is the one part of the sentence we
 * cannot substantiate — a competitor need only point at a single screening tool
 * anywhere to make it false. Under FTC Act s 5 an unsubstantiated superiority
 * claim is deceptive on its own, and we had just finished removing 26 invented
 * figures from this codebase when it was proposed (8 Aug 2026).
 *
 * Every line below is first-person and describes something the product provably
 * does: lib/dor/qualify.js refuses the sale when the Save Our Homes cap absorbs
 * the reduction, and pages/apply.js renders that refusal before any charge.
 *
 * The 34% figure is measured, not estimated — 2,875,878 of 8,409,573 residential
 * parcels on the 2026 DOR roll need a cut of more than 30% before a single
 * dollar moves. See lib/dor/parcels.js for the full distribution.
 */

export const FL_TAGLINES = [
  // Plain, first-person, and the shortest. Works under a headline or in a badge.
  "We’ll tell you when not to hire us.",

  // The headline version. Says the same thing with more personality; still a
  // statement about us, not a ranking against competitors.
  "The property tax service that will talk you out of it.",

  // The version carrying the number, for pages where the figure does the work.
  "About 1 in 3 Florida homes can’t be helped by an appeal. We’ll tell you if yours is one — free, before you pay.",
];

/**
 * Stable 32-bit string hash (djb2). Small, dependency-free, and — the part that
 * matters — identical on the server and in the browser, so the line rendered
 * into the static HTML is the line React expects on hydration.
 */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < String(str).length; i++) {
    h = ((h << 5) + h + String(str).charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Pick a line for a page.
 *
 * @param {string} key  anything stable and unique to the page — a slug is ideal.
 *   An empty or missing key returns the first line rather than throwing, because
 *   a missing tagline is a worse outcome than a repeated one.
 */
export function taglineFor(key) {
  if (!key) return FL_TAGLINES[0];
  return FL_TAGLINES[hash(key) % FL_TAGLINES.length];
}

export default { FL_TAGLINES, taglineFor };
