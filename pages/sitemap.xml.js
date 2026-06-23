// pages/sitemap.xml.js
// Serves sitemap at /sitemap.xml — proxies to /api/sitemap.xml
// This gives Google a clean URL without /api/ in the path

export default async function handler(req, res) {
  // Fetch the real sitemap from the API route
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';
  const sitemapRes = await fetch(`${baseUrl}/api/sitemap.xml`);
  const xml = await sitemapRes.text();

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate');
  res.status(200).send(xml);
}
