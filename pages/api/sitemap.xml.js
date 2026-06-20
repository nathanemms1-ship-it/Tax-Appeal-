export default function handler(req, res) {
  const baseUrl = 'https://www.taxappealusa.com';
  const today = new Date().toISOString().split('T')[0];

  const pages = [
    // Core
    { path: '/',           changefreq: 'weekly',  priority: '1.0' },
    { path: '/apply',      changefreq: 'monthly', priority: '0.9' },
    { path: '/blog',       changefreq: 'weekly',  priority: '0.8' },
    { path: '/terms',      changefreq: 'yearly',  priority: '0.3' },
    { path: '/privacy',    changefreq: 'yearly',  priority: '0.3' },
    // State pages
    { path: '/texas',      changefreq: 'weekly',  priority: '0.9' },
    { path: '/georgia',    changefreq: 'weekly',  priority: '0.9' },
    { path: '/florida',    changefreq: 'weekly',  priority: '0.9' },
    // Texas city pages
    { path: '/houston',    changefreq: 'weekly',  priority: '0.8' },
    { path: '/dallas',     changefreq: 'weekly',  priority: '0.8' },
    { path: '/fort-worth', changefreq: 'weekly',  priority: '0.8' },
    { path: '/austin',     changefreq: 'weekly',  priority: '0.8' },
    // Georgia city pages
    { path: '/atlanta',    changefreq: 'weekly',  priority: '0.8' },
    // Florida city pages
    { path: '/miami',      changefreq: 'weekly',  priority: '0.8' },
    { path: '/tampa',      changefreq: 'weekly',  priority: '0.8' },
    // Blog posts - Batch 1
    { path: '/blog/harris-county-property-tax-protest-guide-2026',  changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/tarrant-county-property-tax-protest-guide-2026', changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/dallas-county-property-tax-protest-guide-2026',  changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/texas-property-tax-protest-deadline-2026',       changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/flat-fee-vs-contingency-property-tax-protest',   changefreq: 'monthly', priority: '0.7' },
    // Blog posts - Batch 2
    { path: '/blog/travis-county-property-tax-protest-guide-2026',  changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/fulton-county-property-tax-appeal-guide-2026',   changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/miami-dade-property-tax-appeal-guide-2026',      changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/hillsborough-county-property-tax-appeal-2026',   changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/how-to-read-texas-notice-of-appraised-value',    changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/georgia-property-tax-appeal-deadline-2026',      changefreq: 'monthly', priority: '0.7' },
    { path: '/blog/florida-trim-notice-deadline-2026',              changefreq: 'monthly', priority: '0.7' },
  ];

  const urls = pages.map(({ path, changefreq, priority }) => `
  <url>
    <loc>${baseUrl}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=43200');
  res.status(200).send(xml);
}
