import { buildSectionUrls, SECTION_IDS } from '../../lib/sitemapUrls';

/**
 * /sitemaps/{section}.xml — one urlset per section, listed by /sitemap.xml.
 *
 * The route is a plain [section] rather than [section].xml because Next's pages
 * router does not reliably handle a dynamic segment with a literal suffix. The
 * ".xml" therefore arrives as part of the param and is stripped below, which keeps
 * the public URLs conventional (/sitemaps/counties-tx.xml) without fighting the
 * router. Both forms resolve, so a crawler that drops the extension still gets XML.
 *
 * An unknown section 404s rather than returning an empty urlset. An empty sitemap is
 * a valid document that says "this section has no pages", which is a lie a typo
 * should not be able to tell — the whole reason for splitting the file was to make
 * per-section coverage legible in Search Console, and a silently empty section would
 * read as 100% of nothing indexed.
 */

const BASE = 'https://www.taxappealusa.com';

export async function getServerSideProps({ params, res }) {
  const id = String(params.section || '').replace(/\.xml$/i, '');

  const pages = SECTION_IDS.includes(id) ? buildSectionUrls(id) : null;
  if (!pages || pages.length === 0) return { notFound: true };

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${BASE}${page.url}</loc>${page.lastmod ? `
    <lastmod>${page.lastmod}</lastmod>` : ''}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate');
  res.write(xml);
  res.end();
  return { props: {} };
}

export default function SectionSitemap() {
  return null;
}
