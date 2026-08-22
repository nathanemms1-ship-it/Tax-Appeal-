import { buildSitemapSections, SECTION_IDS } from '../lib/sitemapUrls';

/**
 * /sitemap.xml — A SITEMAP INDEX, AT THE PATH CRAWLERS ACTUALLY LOOK.
 *
 * ============================================================================
 * WHY THIS EXISTS AND WHY IT IS AT THE ROOT
 * ============================================================================
 * The sitemap was served only from /api/sitemap.xml. robots.txt disallows /api/ and
 * then allows /api/sitemap.xml beneath it. Google resolves conflicting rules by
 * longest match, so that combination is legal — for Google. It is fragile for
 * everything else, because "most specific wins" is a convention rather than a
 * standard, and a crawler that reads the Disallow first sees the site's entire URL
 * list as off-limits.
 *
 * Worse, nothing was served at /sitemap.xml at all, which is the path every crawler
 * and every SEO tool probes before it reads robots.txt.
 *
 * /api/sitemap.xml is deliberately KEPT and unchanged. It is the URL already
 * submitted in Search Console, and withdrawing a submitted sitemap discards the
 * discovery history attached to it. The two are generated from the same module, so
 * they cannot disagree.
 *
 * ============================================================================
 * WHY AN INDEX RATHER THAN ONE FILE
 * ============================================================================
 * Search Console reports discovered-and-indexed counts PER SUBMITTED SITEMAP. One
 * flat file of 1,071 URLs yields one number — "879 discovered" — which cannot
 * distinguish a Texas county problem from a blog problem. Eleven section files yield
 * eleven numbers, and the Texas ones are the point of the exercise.
 *
 * Submit this URL in Search Console. Google will fetch every child listed here.
 */

const BASE = 'https://www.taxappealusa.com';

export async function getServerSideProps({ res }) {
  const sections = buildSitemapSections().filter((s) => s.urls.length > 0);

  // No <lastmod> on the index entries. The same rule applies here as inside the
  // section files: a date we cannot derive from real content change is worse than no
  // date, because Google treats lastmod trust as all-or-nothing across a file. See
  // the long note in lib/sitemapUrls.js.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sections
  .map((s) => `  <sitemap>
    <loc>${BASE}/sitemaps/${s.id}.xml</loc>
  </sitemap>`)
  .join('\n')}
</sitemapindex>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate');
  res.write(xml);
  res.end();
  return { props: {} };
}

// Never rendered — getServerSideProps ends the response. Next still requires the
// default export for the route to exist.
export default function SitemapIndex() {
  return null;
}

export { SECTION_IDS };
