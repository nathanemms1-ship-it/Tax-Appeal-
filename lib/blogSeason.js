/**
 * lib/blogSeason.js — season tokens in blog posts. 18 Oct 2026.
 *
 * 196 of the 205 posts carried "2026" in their titles, and their bodies stated
 * 2026 deadlines as this season's ("May 15, 2026", "August 17, 2026"). Every
 * season had closed by 18 Sept. Rather than rewrite the year by hand every
 * autumn, a sentence that is about THE COMING SEASON carries a token, resolved
 * when the posts are loaded, from the same rule the county pages use
 * (lib/season.js). A sentence about a past event or a dataset keeps its
 * literal year: "the 2026 roll" stays the 2026 roll.
 *
 *   {{year:TX}} {{year:GA}} {{year:FL}} {{year:AR}} {{year:AL}}
 *                     the tax year of that state's coming (or current) season
 *   {{txDeadline}}    the Texas § 41.44 floor for that year, weekend-rolled
 *                     ("May 17, 2027")
 *   {{arDeadline}}    Arkansas: the third Monday in August of that year
 *
 * Slugs, hrefs and dates are never tokenised: a URL must not move with the
 * season. An unknown token throws, so a typo fails the build instead of
 * printing braces on a live page.
 */
import { seasonYear } from './season.js';
import { deadlineShort } from './tx/protestDeadline.js';

const STATES = new Set(['TX', 'GA', 'FL', 'AR', 'AL']);
const SKIP = new Set(['slug', 'href', 'publishDate', 'updated', 'citySlug', 'stateSlug', 'category']);

function thirdMondayInAugust(year) {
  const first = new Date(Date.UTC(year, 7, 1)).getUTCDay(); // 0 Sun .. 6 Sat
  const day = 1 + ((8 - first) % 7) + 14;
  return new Date(Date.UTC(year, 7, day));
}

export function tokenValues(now = new Date()) {
  const ar = seasonYear('AR', now);
  return {
    year: (st) => String(seasonYear(st, now)),
    txDeadline: deadlineShort(seasonYear('TX', now)),
    arDeadline: thirdMondayInAugust(ar).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
  };
}

export function resolveString(s, values, where = '') {
  return s.replace(/\{\{([^{}]+)\}\}/g, (m, body) => {
    const [name, arg] = body.split(':');
    if (name === 'year' && STATES.has(arg)) return values.year(arg);
    if (name === 'txDeadline' && !arg) return values.txDeadline;
    if (name === 'arDeadline' && !arg) return values.arDeadline;
    throw new Error(`blogSeason: unknown token ${m}${where ? ` in ${where}` : ''}`);
  });
}

/** A post with every season token resolved. Pure; the input is not modified. */
export function seasonalize(post, values = tokenValues()) {
  const walk = (v, key, where) => {
    if (typeof v === 'string') return SKIP.has(key) ? v : resolveString(v, values, where);
    if (Array.isArray(v)) return v.map((x, i) => walk(x, key, `${where}[${i}]`));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k, `${where}.${k}`)]));
    return v;
  };
  return walk(post, null, post?.slug || 'post');
}

export { thirdMondayInAugust };
