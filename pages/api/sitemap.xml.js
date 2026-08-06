// pages/api/sitemap.xml.js
//
// The sitemap is DERIVED, not hand-maintained.
//
// This file used to open with "Self-contained sitemap — do not import from external
// files" followed by ~700 lines of hand-copied slug arrays. That guaranteed drift, and
// it had drifted: the sitemap advertised Florida city URLs that no longer built (so
// Googlebot crawled 404s and learned to trust the sitemap less), while the 70 Texas
// city pages under /texas/[city] were not listed at all — they existed, ranked for
// nothing, and were reachable only by internal link.
//
// Every list below now comes from the same module the corresponding [slug].js page
// calls in getStaticPaths, so a page cannot exist without appearing here and cannot
// appear here without existing. Adding a city means editing one array, in lib/.
//
// scripts/verify-sitemap.mjs runs on every build and fails it if the two ever diverge.

import { buildSitemapUrls } from '../../lib/sitemapUrls';

export default function handler(req, res) {
  const base = 'https://www.taxappealusa.com';
  const pages = buildSitemapUrls();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    // lastmod is emitted ONLY where lib/sitemapUrls.js supplied a real one. It used
    // to be `new Date()` for every url on every request — see the comment there.
    (page) => `  <url>
    <loc>${base}${page.url}</loc>${page.lastmod ? `
    <lastmod>${page.lastmod}</lastmod>` : ''}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate');
  res.status(200).send(xml);
}
