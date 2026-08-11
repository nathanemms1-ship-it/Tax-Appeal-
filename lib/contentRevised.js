/**
 * WHEN A PAGE TEMPLATE'S CONTENT LAST ACTUALLY CHANGED.
 *
 * ============================================================================
 * WHY THIS IS A lib/ MODULE AND NOT A CONSTANT IN THE PAGE
 * ============================================================================
 * Two consumers need this date and they cannot both reach a page file:
 *
 *   1. pages/counties/[slug].js — renders it as `dateModified` in WebPage schema
 *      and as the visible "Reviewed …" line.
 *   2. lib/sitemapUrls.js — emits it as <lastmod> for every /counties/* URL.
 *
 * (2) is imported by scripts/verify-sitemap.mjs, which runs under plain Node during the
 * build. Plain Node cannot parse JSX, so sitemapUrls.js must never import a page file.
 * That is the same constraint the extension-suffix note at the top of sitemapUrls.js
 * describes, and it is why the constant lives here rather than in the page that reads it.
 *
 * ============================================================================
 * WHAT THIS DATE MEANS, AND WHAT IT MUST NOT BECOME
 * ============================================================================
 * Both consumers previously used a build timestamp: getStaticProps stamped
 * `new Date().toISOString()` on all 573 county pages, and the sitemap route stamped
 * `new Date()` on all 1,071 URLs at request time. Google treats a sitemap's freshness
 * signal as binary — it either trusts the dates or discards them across the whole file —
 * and Search Console showed the symptom on 5 Aug 2026: submitted 29 Jun, last read
 * 29 Jun, never revisited.
 *
 * So this is declared by hand, on purpose.
 *
 *   BUMP IT when the template's copy changes, or when the per-county data it renders
 *   (VAB fee table, VAB clerk addresses, millage) is re-verified.
 *
 *   DO NOT bump it for a styling change, a refactor, or a dependency upgrade.
 *   DO NOT wire it to the build clock, `new Date()`, git, or CI. Doing that recreates
 *   exactly the problem this replaced, while looking like an improvement.
 *
 * An absent freshness signal is neutral. A wrong one is corrosive.
 */

/** Format: YYYY-MM-DD. Valid as both schema.org dateModified and sitemap <lastmod>. */
export const COUNTY_CONTENT_REVISED = '2026-08-10';

export default COUNTY_CONTENT_REVISED;
