/**
 * UNIQUE DAILY VISITORS TO THE PUBLIC SITE.
 *
 * ============================================================================
 * WHY THIS IS SERVER-SIDE AND NOT A SCRIPT TAG
 * ============================================================================
 * gtag is already loaded in _app.js for the Ads conversion ID, so a second
 * client-side counter would have been the cheap option. It would also have been
 * blocked by the same ad blockers that block the first one, and it could not have
 * been joined to `orders` or `waitlist` without shipping the data back out of
 * Google. The question this is built to answer is "did that traffic become an
 * order", and only a first-party counter in our own database can answer it.
 *
 * It also sets no cookie and reads no storage. `/privacy` currently claims we use
 * no tracking cookies -- a claim that is already false because of gtag's _gcl_*,
 * and is tracked as an open item. This must not make that worse, so it does not
 * get to set one.
 *
 * ============================================================================
 * WHAT IS AND IS NOT STORED
 * ============================================================================
 * Stored:      a digest, the date, the first path seen, the referring HOST,
 *              a country code, and "mobile" or "desktop".
 * Not stored:  the IP address, the user agent, the full referring URL, the query
 *              string, or anything a visitor typed.
 *
 * The digest is sha256(date | ip | ua | secret). The DATE IS INSIDE THE HASH, so
 * the same visitor is a different digest tomorrow and the rows cannot be chained
 * into one person's history. That is the whole reason this is defensible as an
 * aggregate counter. See scripts/sql/site_visits.sql.
 *
 * ============================================================================
 * IF THE SALT IS MISSING WE RECORD NOTHING
 * ============================================================================
 * Hashing with an empty salt is worse than not hashing. The input space is one
 * IPv4 address crossed with a user agent string, which is small enough to brute
 * force offline -- so an unsalted digest column IS a column of IP addresses,
 * wearing a hat. If VISITOR_HASH_SECRET is unset, this records nothing at all and
 * says so once in the log. A missing number in /admin is a visible failure; a
 * table of reversible digests is an invisible one.
 *
 * ============================================================================
 * WHAT THE NUMBER UNDERCOUNTS -- READ BEFORE QUOTING IT
 * ============================================================================
 * The key is IP + user agent. So:
 *   - A whole brokerage office behind one NAT is ONE visitor.
 *   - One person moving from wifi to cellular is TWO.
 *   - Two identical iPhones on the same home wifi are ONE.
 * Good for trend and for before/after on a campaign. Not an audience size, and it
 * must not be put in front of anyone as one. /admin says this on the page.
 */

import { NextResponse } from 'next/server';

/**
 * Everything that is not a page a human reads.
 *
 * Getting this wrong is expensive in both directions: too broad and every image
 * request becomes an edge invocation and a database write, too narrow and the
 * count misses pages. API routes are excluded because a fetch from our own funnel
 * is not a visit, and /admin and /portal are excluded because we are not visitors
 * to our own site -- during a working session Nathan would otherwise BE the
 * traffic.
 */
export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|admin|portal|favicon|robots\\.txt|sitemap\\.xml|indexnow|.*\\.(?:png|jpe?g|gif|svg|webp|ico|css|js|mjs|txt|xml|json|pdf|woff2?|ttf|eot|map)$).*)',
  ],
};

/**
 * The bot filter, and it is not optional.
 *
 * Crawl closure went from 4 reachable pages to 955 on 14 Aug and the sitemap
 * advertises 1,081. Googlebot is going to work through all of it, repeatedly, and
 * Bing and the AI crawlers behind it. Without this, "visitors" is mostly crawlers
 * -- and the crawl of the newly-reachable pages will land in the same fortnight as
 * the ads switching on, so it would read as the ads working.
 *
 * UA matching only catches declared bots. It does not catch a scraper that lies,
 * and it is not trying to: this is about not drowning the signal, not security.
 */
const BOT_UA = /bot\b|bots?\/|crawl|spider|slurp|search|scrape|fetcher|archiver|monitor|uptime|pingdom|gtmetrix|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|curl\/|wget|python-|go-http|java\/|okhttp|axios\/|node-fetch|libwww|httpclient|semrush|ahrefs|mj12|dotbot|petal|bytespider|gptbot|claudebot|ccbot|perplexity|anthropic|openai|applebot|amazonbot|yandex|baidu|sogou|duckduck|facebookexternal|whatsapp|telegram|discord|slackbot|embedly|preview|validator|feed/i;

/**
 * THE PROBES BOT_UA CANNOT SEE — added 19 Aug 2026.
 *
 * The UA filter above is honest about its limit: it "only catches declared bots".
 * The first 30 days of real data showed exactly what walks past it. Ranked third
 * in "first page they landed on", above /florida:
 *
 *   /wp-admin/install.php          14      /.env                   2
 *   /.well-known/traffic-advice     5      /&                      4
 *
 * Vulnerability scanners send an ordinary Chrome user agent on purpose, so no UA
 * pattern will ever catch them. What gives them away is WHAT THEY ASK FOR: this
 * site has no WordPress, no PHP, no .env, and no /& — every one of those is a 404.
 * They looked like a fifth of the month's traffic and pushed real pages down the
 * table.
 *
 * Matching on the path instead of the agent. Middleware runs before the response
 * exists, so the status code is not available here; this is the closest honest
 * proxy for "that was a 404 nobody meant to visit".
 *
 * `/.well-known/traffic-advice` is different and worth its own note: it is
 * Chrome's private-prefetch-proxy probe, entirely legitimate, and still not a
 * person arriving at a page. The whole `/.well-known/` namespace is machine-facing
 * by definition (RFC 8615), so all of it is excluded.
 *
 * DELIBERATELY NOT AN ALLOWLIST. 1,081 pages, most of them dynamic routes, so an
 * allowlist would silently drop real pages the day someone adds a route — the
 * failure that cannot be seen. This can only ever be too narrow, which shows up as
 * a junk row in /admin that somebody notices, exactly as happened here.
 */
const PROBE_PATH = new RegExp(
  [
    '^/\\.',                                   // /.env, /.git/config, /.well-known/*
    '^/wp-|/wp-admin|/wp-includes|/wp-content|/xmlrpc\\.php',
    '^/(?:vendor|phpmyadmin|pma|administrator|cgi-bin|phpinfo|adminer)\\b',
    '\\.(?:php|asp|aspx|jsp|cgi|pl|sql|bak|old|swp|ini|yml|yaml|env|log)$',
    '^/&',                                     // malformed, seen 4x in the first 30 days
  ].join('|'),
  'i'
);

/** Requests a browser makes that are not someone arriving at a page. */
function isPageView(req) {
  if (req.method !== 'GET') return false;
  // Set by browsers on real navigations. Absent on older UAs, so absence is not
  // disqualifying -- but "cors" or "no-cors" positively means a subresource.
  const mode = req.headers.get('sec-fetch-mode');
  if (mode && mode !== 'navigate') return false;
  const dest = req.headers.get('sec-fetch-dest');
  if (dest && dest !== 'document') return false;
  // Next's client-side router prefetches. A prefetch is not a visit.
  if (req.headers.get('purpose') === 'prefetch') return false;
  if (req.headers.get('x-purpose') === 'preview') return false;
  if (req.headers.get('x-middleware-prefetch')) return false;
  if (req.headers.get('next-router-prefetch')) return false;
  return true;
}

/**
 * The day boundary is Central, not UTC.
 *
 * Nathan is America/Chicago. On UTC, everything after 7pm his time lands on
 * tomorrow's bar, so an evening ad test would split across two days and neither
 * would look like the number he remembers. This is the same class of confusion as
 * Instantly displaying Central while its schedule is set in Eastern -- worth one
 * line of code to not have to remember.
 */
function centralDate(now = new Date()) {
  // en-CA formats as YYYY-MM-DD, which is what Postgres wants for a date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || req.ip || '';
}

/**
 * The referring HOST, never the full URL.
 *
 * A full referrer can carry a search query, a session token, or the previous
 * page's path on someone else's site. The host is what answers "where is traffic
 * coming from". Our own host returns null so internal navigation does not show up
 * as a referrer to itself.
 */
function referrerHost(req) {
  const raw = req.headers.get('referer');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    /**
     * NORMALISE BOTH SIDES BEFORE COMPARING. This was the bug.
     *
     * The comparison was `url.host === self` with `www.` stripped only AFTERWARDS,
     * on the return line. So a visitor moving between `taxappealusa.com` and
     * `www.taxappealusa.com` — which happens on the apex-to-www redirect, on every
     * internal link that hardcodes one form, and on any bookmark of the other —
     * failed the equality, fell through, and was written down as an INBOUND
     * REFERRAL FROM OURSELVES.
     *
     * Measured: 25 such visitors on 20 Aug, 55 by 23 Aug. Growing, and 12-15% of
     * all traffic — in the only table that answers "where is traffic coming from",
     * during the season the ad spend is being judged on. Every "is this odd?"
     * question about the traffic numbers has had to be answered around it.
     *
     * Ports are stripped too: a host header can carry one and a Referer may not.
     */
    const bare = (h) => String(h || '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
    const self = bare(req.headers.get('host'));
    const from = bare(url.host);
    if (!from || from === self) return null;
    return from.slice(0, 120);
  } catch {
    return null;
  }
}

let warnedNoSalt = false;

async function record(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const salt = process.env.VISITOR_HASH_SECRET;

  // See the header comment. No salt, no rows -- this is the branch that keeps the
  // digest column from being a reversible list of IP addresses.
  if (!salt) {
    if (!warnedNoSalt) {
      warnedNoSalt = true;
      console.warn('[visits] VISITOR_HASH_SECRET is not set. Recording nothing.');
    }
    return;
  }
  if (!supabaseUrl || !serviceKey) return;

  if (!isPageView(req)) return;

  const ua = req.headers.get('user-agent') || '';
  if (!ua || BOT_UA.test(ua)) return;

  // Scanner probes announce themselves by what they ask for, not by who they say
  // they are. See PROBE_PATH.
  const pathname = new URL(req.url).pathname;
  if (PROBE_PATH.test(pathname)) return;

  const ip = clientIp(req);
  if (!ip) return;

  const visitDate = centralDate();
  const visitorHash = await sha256Hex(`${visitDate}|${ip}|${ua}|${salt}`);

  const row = {
    visit_date: visitDate,
    visitor_hash: visitorHash,
    // Path only. The query string can carry an address someone typed into /check.
    first_path: pathname.slice(0, 200),
    referrer_host: referrerHost(req),
    country: req.geo?.country || null,
    device: /mobile|android|iphone|ipad|ipod/i.test(ua) ? 'mobile' : 'desktop',
  };

  /**
   * resolution=ignore-duplicates is the second and later pageview of the day
   * being dropped by the unique index, which is the intended path and not an
   * error. It is also why first_path is genuinely FIRST: the insert that wins is
   * the first one of the day, and every later one is discarded.
   *
   * Raw fetch rather than @supabase/supabase-js because this runs in the edge
   * runtime on every page request and the SDK is not worth the bundle here.
   */
  await fetch(`${supabaseUrl}/rest/v1/site_visits`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
}

export default function middleware(req, event) {
  const res = NextResponse.next();

  /**
   * waitUntil, so the page is never waiting on the counter.
   *
   * The failure this avoids is the one that matters: if Supabase is slow or down,
   * an awaited write would add its latency to every page load on the site, and a
   * counter is not worth a single millisecond of the funnel. Errors are swallowed
   * for the same reason -- a broken counter must never be able to break a page.
   * That does mean silent failure, which is what lib/healthChecks.js
   * checkTrafficCapture is for.
   */
  if (event && typeof event.waitUntil === 'function') {
    event.waitUntil(record(req).catch(() => {}));
  }

  return res;
}
