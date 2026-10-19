/**
 * verify-blog-season — blog posts talk about the coming season through tokens
 * (lib/blogSeason.js), never a typed season year. 18 Oct 2026.
 *
 * On 18 Oct 2026, 196 of 205 posts named 2026 in their titles and stated 2026
 * deadlines ("May 15, 2026", "August 17, 2026") as this season's, a month after
 * every season had closed. Each post was gone through and every SEASON year made
 * a token; years about past events and datasets kept their literal year.
 *
 * Where a line says INJECTION, reintroducing that bug makes the assertion fail.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { seasonalize, tokenValues, resolveString, thirdMondayInAugust } = await import('../lib/blogSeason.js');
const { posts, publishedPosts } = await import('../lib/blogPosts.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const D = (s) => new Date(`${s}T12:00:00Z`);

// ── 1. THE TOKENS ───────────────────────────────────────────────────────────
const oct = tokenValues(D('2026-10-18'));
const spring = tokenValues(D('2026-03-01'));
t('after the 2026 seasons closed, every token is about 2027', resolveString('{{year:TX}} {{year:GA}} {{year:FL}} {{year:AR}} {{year:AL}}', oct) === '2027 2027 2027 2027 2027');
t('in spring 2026 the same tokens were about 2026', resolveString('{{year:TX}} {{year:FL}}', spring) === '2026 2026');
t("Texas's deadline is the weekend-rolled floor (May 15, 2027 is a Saturday)", oct.txDeadline === 'May 17, 2027' && spring.txDeadline === 'May 15, 2026');
t("Arkansas's is the third Monday in August", oct.arDeadline === 'August 16, 2027' && spring.arDeadline === 'August 17, 2026' && thirdMondayInAugust(2028).getUTCDate() === 21);
let threw = false; try { resolveString('{{year:NY}}', oct); } catch (e) { threw = true; }
t('an unknown token fails the build instead of printing braces', threw);
const sample = seasonalize({ slug: 'x-2026', title: 'Guide {{year:TX}}', links: [{ text: 'Deadline {{year:TX}}', href: '/blog/x-2026' }], faqs: [['When in {{year:TX}}?', 'By {{txDeadline}}.']] }, oct);
t('titles, link text and FAQs resolve; slugs and hrefs never move', sample.title === 'Guide 2027' && sample.links[0].text === 'Deadline 2027' && sample.links[0].href === '/blog/x-2026' && sample.slug === 'x-2026' && sample.faqs[0][1] === 'By May 17, 2027.');

// ── 2. THE POSTS ────────────────────────────────────────────────────────────
const rendered = JSON.stringify(publishedPosts);
// INJECTION: export publishedPosts without seasonalize -> FAILS.
t('no post renders an unresolved token', !rendered.includes('{{'));
// A replace that ate the space after a year printed "The 2027Arkansas Appeal Deadline" in 64 places.
t('no year or date runs into the next word', !/\b20\d\d[A-Za-z]/.test(rendered));
const KEEP_2026_TITLES = new Set(['florida-vab-filing-fee-by-county-2026', 'can-a-florida-property-tax-appeal-save-you-money', 'florida-property-tax-appeal-deadline-missed-what-now']);
const seen = new Set(); const live = posts.filter((p) => (seen.has(p.slug) ? false : seen.add(p.slug)));
const typedTitle = live.filter((p) => /\b202[6-9]\b/.test(`${p.title} ${p.metaTitle || ''}`.replace(/\{\{[^}]*\}\}/g, '')) && !KEEP_2026_TITLES.has(p.slug));
// INJECTION: put "Guide 2026" back in a title -> FAILS.
t(`no title or meta title types a season year (${typedTitle.length})`, typedTitle.length === 0);
const strip = (p) => { const { slug, publishDate, updated, ...rest } = p; return JSON.stringify(rest).replace(/"href":"[^"]*"/g, ''); };
const staleDates = live.filter((p) => /May 15, 2026|August 17, 2026|August 16, 2027|May 17, 2027/.test(strip(p)));
t(`no post types a season deadline date (${staleDates.map((p) => p.slug).join(', ')})`, staleDates.length === 0);
const typed2027 = live.filter((p) => /\b2027\b/.test(strip(p)));
t(`no post types next season's year (${typed2027.map((p) => p.slug).join(', ')})`, typed2027.length === 0);
const noUpdated = live.filter((p) => /\{\{/.test(JSON.stringify(p)) && !p.updated);
t(`every post with season tokens says when it was updated (${noUpdated.length})`, noUpdated.length === 0);
t('the post page shows the update and dates the article by it', /dateModified": post\.updated \|\| post\.publishDate/.test(readFileSync(new URL('../pages/blog/[slug].js', import.meta.url), 'utf8')) && /String\(p\.updated \|\| p\.publishDate\)/.test(readFileSync(new URL('../lib/sitemapUrls.js', import.meta.url), 'utf8')));

console.log(`verify-blog-season: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
