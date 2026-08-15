/**
 * The single list of URLs the site publishes.
 *
 * Consumed by pages/api/sitemap.xml.js (which renders it as XML) and by
 * scripts/verify-sitemap.mjs (which asserts every entry resolves to a page the build
 * actually emitted). It lives in lib/ rather than in the API route so that plain Node
 * can import it during the build check without booting Next.
 *
 * NOTE ON IMPORT EXTENSIONS: the .js suffixes below are required, not stylistic.
 * Webpack resolves extensionless specifiers; Node's ESM loader does not, and the
 * verification script runs under plain Node. Dropping them breaks the build check.
 *
 * Everything with a [slug] template is derived from the same module that page calls in
 * getStaticPaths, so a page cannot exist without being listed and cannot be listed
 * without existing. Only genuinely one-off pages are hand-written in STATIC_PAGES.
 */

import { getAllFlCitySlugs } from './floridaCities.js';
import { getAllGaSuburbSlugs } from './georgiaSuburbs.js';
import { getAllArSuburbSlugs } from './arkansasSuburbs.js';
import { getAllTxCitySlugs } from './texasCities.js';
import { getAllCountySlugs } from './countyData.js';
import { getAllSlugs as getAllBlogSlugs, posts as blogPostList } from './blogPosts.js';
import { COUNTY_CONTENT_REVISED } from './contentRevised.js';

const STATIC_PAGES = [
  { url: '/', priority: '1.0', changefreq: 'weekly' },
  { url: '/apply', priority: '0.95', changefreq: 'weekly' },
  // /check is a public, indexable page — the free Florida property check, and a
  // top-of-funnel entry point in its own right. It was absent from this list until
  // 5 Aug 2026, so it was never advertised in the sitemap and was discoverable only
  // through internal links. verify-sitemap.mjs reported it under "N pages
  // intentionally unlisted", but that phrasing is applied to every orphan it finds —
  // it verifies nothing, so the omission read as a decision when it was not one.
  // The genuinely unlisted pages (/admin, /portal*, /success, /partners/connect,
  // /partners/dashboard) are authenticated or post-transaction. This one is not.
  { url: '/check', priority: '0.95', changefreq: 'weekly' },

  { url: '/texas', priority: '0.9', changefreq: 'monthly' },
  { url: '/georgia', priority: '0.9', changefreq: 'monthly' },
  { url: '/florida', priority: '0.9', changefreq: 'monthly' },
  { url: '/arkansas', priority: '0.9', changefreq: 'monthly' },
  { url: '/alabama', priority: '0.9', changefreq: 'monthly' },

  { url: '/houston', priority: '0.85', changefreq: 'monthly' },
  { url: '/dallas', priority: '0.85', changefreq: 'monthly' },
  { url: '/fort-worth', priority: '0.85', changefreq: 'monthly' },
  { url: '/austin', priority: '0.85', changefreq: 'monthly' },
  { url: '/san-antonio', priority: '0.85', changefreq: 'monthly' },
  { url: '/el-paso', priority: '0.85', changefreq: 'monthly' },
  { url: '/atlanta', priority: '0.85', changefreq: 'monthly' },
  { url: '/miami', priority: '0.85', changefreq: 'monthly' },
  { url: '/tampa', priority: '0.85', changefreq: 'monthly' },
  { url: '/bentonville', priority: '0.85', changefreq: 'monthly' },
  { url: '/little-rock', priority: '0.85', changefreq: 'monthly' },
  { url: '/fayetteville', priority: '0.85', changefreq: 'monthly' },
  { url: '/fort-smith', priority: '0.85', changefreq: 'monthly' },

  { url: '/augusta', priority: '0.8', changefreq: 'monthly' },
  { url: '/birmingham', priority: '0.8', changefreq: 'monthly' },
  { url: '/huntsville', priority: '0.8', changefreq: 'monthly' },
  { url: '/mobile', priority: '0.8', changefreq: 'monthly' },
  { url: '/montgomery', priority: '0.8', changefreq: 'monthly' },
  { url: '/tuscaloosa', priority: '0.8', changefreq: 'monthly' },
  { url: '/orlando', priority: '0.8', changefreq: 'monthly' },
  { url: '/jacksonville', priority: '0.8', changefreq: 'monthly' },
  { url: '/fort-lauderdale', priority: '0.8', changefreq: 'monthly' },

  { url: '/partners', priority: '0.7', changefreq: 'monthly' },
  { url: '/blog', priority: '0.7', changefreq: 'weekly' },
  { url: '/why-certified-mail-matters', priority: '0.6', changefreq: 'monthly' },
  { url: '/terms', priority: '0.3', changefreq: 'yearly' },
  { url: '/privacy', priority: '0.3', changefreq: 'yearly' },
];

/**
 * The getAll*Slugs helpers do not agree on a return shape: countyData, texasCities,
 * georgiaSuburbs and arkansasSuburbs return getStaticPaths objects
 * (`{ params: { city | slug } }`) because that is what their page feeds straight into
 * Next, while floridaCities and blogPosts return plain strings. Template-literalling
 * the former yields "/arkansas/[object Object]" — a URL that looks fine in the XML and
 * 404s for every crawler. Normalise here rather than at each call site.
 */
function toSlug(entry) {
  if (typeof entry === 'string') return entry;
  const p = entry?.params;
  const v = p?.slug ?? p?.city ?? entry?.slug ?? entry?.city;
  if (typeof v !== 'string' || !v) {
    throw new Error(`sitemapUrls: cannot derive a slug from ${JSON.stringify(entry)}`);
  }
  return v;
}

const section = (entries, prefix, priority) =>
  entries.map((e) => ({ url: `${prefix}/${toSlug(e)}`, priority, changefreq: 'monthly' }));

/**
 * lastmod, and why most URLs here deliberately have none.
 *
 * pages/api/sitemap.xml.js used to stamp EVERY url with `new Date()` at request
 * time, so all 1,071 entries claimed to have changed today, on every fetch. That is
 * the documented way to get lastmod ignored: Google treats the signal as binary —
 * it either trusts a sitemap's dates or discards them across the whole file — and
 * Gary Illyes' guidance is that a site with wrong dates is "probably better off
 * without the lastmods". An absent signal is neutral; a wrong one is corrosive.
 *
 * Symptom in Search Console on 5 Aug 2026: submitted 29 Jun, LAST READ 29 Jun,
 * 879 of 1,071 URLs discovered. Read once, never revisited.
 *
 * So: blog posts carry their real publishDate, because we actually know it. Every
 * other URL omits lastmod rather than inventing one. When county and city pages
 * gain a real content-changed date, add it here — never a build timestamp.
 *
 * 10 Aug 2026 — the county pages now have one. COUNTY_CONTENT_REVISED is declared by
 * hand in pages/counties/[slug].js and bumped when that template's copy or the
 * per-county data behind it changes. That is a real content-changed date in the sense
 * this comment meant, and specifically not the build clock the page's own `dateModified`
 * used to carry. It is imported rather than restated here so the sitemap cannot advertise
 * a revision date the page itself does not claim.
 *
 * City, hub and static pages still omit lastmod. Give them one when there is a real date
 * to give, and not before.
 */
const BLOG_LASTMOD = new Map(
  blogPostList
    .filter((p) => p.slug && p.publishDate)
    .map((p) => [`/blog/${p.slug}`, String(p.publishDate).slice(0, 10)])
);

export function buildSitemapUrls() {
  const derived = [
    ...section(getAllCountySlugs(), '/counties', '0.8'),
    ...section(getAllFlCitySlugs(), '/florida', '0.85'),
    ...section(getAllGaSuburbSlugs(), '/georgia', '0.85'),
    ...section(getAllArSuburbSlugs(), '/arkansas', '0.85'),
    // /texas/[city] was absent from the sitemap entirely — 70 built pages, none listed.
    ...section(getAllTxCitySlugs(), '/texas', '0.85'),
    ...section(getAllBlogSlugs(), '/blog', '0.75'),
  ];

  // De-duplicate on url. The previous hand-maintained lists contained /montgomery and
  // /tuscaloosa twice each and listed the Florida slug "tarpon-springs" twice.
  // Duplicate <loc> entries are a validation error in Search Console.
  const seen = new Set();
  const out = [];
  for (const p of [...STATIC_PAGES, ...derived]) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    const lastmod = BLOG_LASTMOD.get(p.url)
      || (p.url.startsWith('/counties/') ? COUNTY_CONTENT_REVISED : undefined);
    out.push(lastmod ? { ...p, lastmod } : p);
  }
  return out;
}

export default buildSitemapUrls;
