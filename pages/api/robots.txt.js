// NOTE: this is NOT what serves /robots.txt - public/robots.txt does, and a static
// file in public/ always wins over an API route. This exists for historical reasons
// and is kept byte-identical so the two can never disagree about what is crawlable.
// If you edit one, edit both, or delete this file.
//
// scripts/verify-tx-seo.mjs now asserts the two are identical, so "edit one, edit
// both" is enforced rather than requested. public/robots.txt is deliberately kept
// free of backticks and ${ so it can be embedded here verbatim with no escaping —
// escaping is what would let the two drift while still looking identical.
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

# /sitemap.xml is the sitemap index and the one to submit in Search Console. It
# lists eleven per-section files under /sitemaps/, which is what makes coverage
# legible per section rather than as one number across 1,071 URLs.
#
# /api/sitemap.xml is the legacy flat file. It is kept, and kept advertised, only
# because it is the URL already submitted in Search Console — withdrawing a
# submitted sitemap discards its discovery history. Both are generated from
# lib/sitemapUrls.js so they cannot disagree. Retire the /api one once the index
# shows a read date.
#
# NOTE ON THE Allow ABOVE: it must stay. "Disallow: /api/" covers the legacy
# sitemap path, and Google only fetches it because the longer "Allow" wins on
# most-specific match. That is Google's rule, not a standard — which is the reason
# the real sitemap now lives at the root instead.
#
# No per-crawler blocks are declared, deliberately. GPTBot, ClaudeBot,
# PerplexityBot, OAI-SearchBot, Google-Extended and CCBot are all permitted by the
# wildcard above, which is the intent. Do not add a named User-agent block without
# repeating every Disallow inside it — a named block REPLACES the wildcard for that
# agent rather than adding to it, so a bare "User-agent: GPTBot / Allow: /" would
# hand that crawler /admin and /portal.

Sitemap: https://www.taxappealusa.com/sitemap.xml
Sitemap: https://www.taxappealusa.com/api/sitemap.xml`;

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(robots);
}
