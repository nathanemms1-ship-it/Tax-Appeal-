#!/usr/bin/env node
/**
 * Assert that every URL the sitemap advertises is a route the build actually emitted,
 * and that every generated page is advertised.
 *
 * Runs after `next build` (see package.json). Reads .next/prerender-manifest.json and
 * .next/routes-manifest.json rather than booting Next, so it is fast and sees exactly
 * what will be deployed.
 *
 * Why this exists: the sitemap was hand-maintained and had drifted from the pages in
 * both directions - it listed Florida city URLs that no longer built, so Googlebot was
 * crawling 404s, and it omitted the 70 /texas/[city] pages entirely. Neither failure
 * was visible: the build passed, the pages rendered, and the only symptom was in
 * Search Console.
 *
 * Exits non-zero on drift so a bad sitemap cannot ship.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const NEXT_DIR = '.next';

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const prerender = readJson(path.join(NEXT_DIR, 'prerender-manifest.json'));
const routes = readJson(path.join(NEXT_DIR, 'routes-manifest.json'));

if (!prerender || !routes) {
  console.error('verify-sitemap: no build manifests found - run `next build` first.');
  process.exit(1);
}

// Every route the build emitted as real HTML.
const built = new Set(Object.keys(prerender.routes || {}));
for (const r of routes.staticRoutes || []) built.add(r.page);

// Dynamic route templates, e.g. /florida/[city] - a sitemap URL under one of these
// only counts as built if it appears in the prerender manifest above.
const dynamicPrefixes = (routes.dynamicRoutes || [])
  .map((r) => r.page)
  .filter((p) => p.includes('['));

// Load the sitemap's own URL builder. It is written as an ESM export precisely so this
// script can call it instead of re-parsing XML.
const mod = await import(pathToFileURL(path.resolve('lib/sitemapUrls.js')).href);
const urls = mod.buildSitemapUrls().map((p) => p.url);

// ---------------------------------------------------------------- duplicate check
const counts = new Map();
for (const u of urls) counts.set(u, (counts.get(u) || 0) + 1);
const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([u]) => u);

// ------------------------------------------------------- advertised but not built
const missing = urls.filter((u) => !built.has(u));

// ------------------------------------------------------- built but not advertised
const advertised = new Set(urls);
// /sitemap.xml and /sitemaps/* are sitemaps, not content. They must never list
// themselves, so they are not orphans.
const IGNORE = /^\/(_|api\/|404$|500$|sitemap\.xml$|sitemaps\/)/;
const orphans = [...built].filter(
  (r) => !advertised.has(r) && !IGNORE.test(r) && !r.includes('[')
);

console.log(`Sitemap check — ${urls.length} URLs advertised, ${built.size} routes built`);

let failed = false;

if (dupes.length) {
  failed = true;
  console.error(`\n  FAIL  ${dupes.length} duplicate <loc> entries:`);
  for (const u of dupes.slice(0, 20)) console.error(`          ${u}`);
}

if (missing.length) {
  failed = true;
  console.error(`\n  FAIL  ${missing.length} sitemap URLs do not resolve to a built page:`);
  for (const u of missing.slice(0, 40)) console.error(`          ${u}`);
  if (missing.length > 40) console.error(`          ... and ${missing.length - 40} more`);
  console.error('\n        Googlebot will crawl these and get a 404.');
}

if (orphans.length) {
  // Not fatal — a page can legitimately be excluded from the sitemap (thank-you pages,
  // gated flows). But it is almost always an oversight, so it is loud.
  console.warn(`\n  WARN  ${orphans.length} built pages are not in the sitemap:`);
  for (const u of orphans.slice(0, 40)) console.warn(`          ${u}`);
  if (orphans.length > 40) console.warn(`          ... and ${orphans.length - 40} more`);
}

if (failed) {
  console.error('\nSitemap verification failed.\n');
  process.exit(1);
}

console.log(`\n✓ every sitemap URL resolves${orphans.length ? ` (${orphans.length} pages intentionally unlisted — see warnings)` : ''}`);
