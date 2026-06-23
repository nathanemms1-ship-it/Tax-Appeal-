// pages/robots.txt.js
// Serves robots.txt at /robots.txt (Next.js Pages Router)
// Previously only available at /api/robots.txt — Google needs it at root

export default function handler(req, res) {
  const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /success

Sitemap: https://www.taxappealusa.com/api/sitemap.xml`;

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(robots);
}
