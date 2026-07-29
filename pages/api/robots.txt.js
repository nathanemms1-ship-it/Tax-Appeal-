// NOTE: this is NOT what serves /robots.txt - public/robots.txt does, and a static
// file in public/ always wins over an API route. This exists for historical reasons
// and is kept byte-identical so the two can never disagree about what is crawlable.
// If you edit one, edit both, or delete this file.
export default function handler(req, res) {
  const robots = `User-agent: *
Allow: /
Allow: /api/sitemap.xml
Disallow: /admin
Disallow: /api/
Disallow: /success
Disallow: /portal
Disallow: /partners/dashboard
Disallow: /partners/connect

Sitemap: https://www.taxappealusa.com/api/sitemap.xml`;

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(robots);
}
