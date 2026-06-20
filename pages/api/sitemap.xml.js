import { getAllSlugs } from '../../lib/blogPosts';

export default function handler(req, res) {
  const baseUrl = 'https://www.taxappealusa.com';
  const today = new Date().toISOString().split('T')[0];

  const staticPages = [
    { path: '/',           changefreq: 'weekly',  priority: '1.0' },
    { path: '/apply',      changefreq: 'monthly', priority: '0.9' },
    { path: '/blog',       changefreq: 'weekly',  priority: '0.8' },
    { path: '/terms',      changefreq: 'yearly',  priority: '0.3' },
    { path: '/privacy',    changefreq: 'yearly',  priority: '0.3' },
    { path: '/texas',      changefreq: 'weekly',  priority: '0.9' },
    { path: '/georgia',    changefreq: 'weekly',  priority: '0.9' },
    { path: '/florida',    changefreq: 'weekly',  priority: '0.9' },
    { path: '/houston',    changefreq: 'weekly',  priority: '0.8' },
    { path: '/dallas',     changefreq: 'weekly',  priority: '0.8' },
    { path: '/fort-worth', changefreq: 'weekly',  priority: '0.8' },
    { path: '/austin',     changefreq: 'weekly',  priority: '0.8' },
    { path: '/atlanta',    changefreq: 'weekly',  priority: '0.8' },
    { path: '/miami',      changefreq: 'weekly',  priority: '0.8' },
    { path: '/tampa',      changefreq: 'weekly',  priority: '0.8' },
  ];

  const blogPages = getAllSlugs().map(slug => ({
    path: `/blog/${slug}`,
    changefreq: 'monthly',
    priority: '0.7',
  }));

  const allPages = [...staticPages, ...blogPages];

  const urls = allPages.map(({ path, changefreq, priority }) => `
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
