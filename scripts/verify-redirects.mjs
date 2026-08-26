#!/usr/bin/env node
/**
 * scripts/verify-redirects.mjs
 *
 * Asserts the legacy redirect map against a running site, not against the
 * source. A redirect that is declared but shadowed by filesystem routing
 * looks perfect in next.config.js and 404s in production.
 *
 *   node scripts/verify-redirects.mjs                       # against prod
 *   node scripts/verify-redirects.mjs http://localhost:3000 # against a dev build
 *
 * Two assertions per entry:
 *   1. the source returns a permanent redirect (301 or 308), not 200 and not 404
 *   2. the destination it lands on returns 200
 *
 * (2) is the one that matters six months from now. A redirect pointing at a
 * county page that has since been renamed is worse than the 404 it replaced:
 * it is a 404 Search Console will not show you under "Not found".
 */

import legacyRedirects from '../lib/legacyRedirects.js'

const BASE = (process.argv[2] || 'https://www.taxappealusa.com').replace(/\/$/, '')
const PERMANENT = new Set([301, 308])

let failures = 0
let checked = 0

const fail = (source, msg) => {
  failures++
  console.error(`  FAIL  ${source}\n        ${msg}`)
}

console.log(`\nVerifying ${legacyRedirects.length} legacy redirects against ${BASE}\n`)

for (const { source, destination } of legacyRedirects) {
  checked++

  let hop
  try {
    hop = await fetch(BASE + source, { redirect: 'manual' })
  } catch (err) {
    fail(source, `request threw: ${err.message}`)
    continue
  }

  if (!PERMANENT.has(hop.status)) {
    fail(
      source,
      hop.status === 404
        ? 'still 404 — the redirect is not reaching the router'
        : hop.status === 200
          ? 'returns 200 — a page now exists here, so this entry is stale and should be removed'
          : `expected 301 or 308, got ${hop.status}`
    )
    continue
  }

  const landed = hop.headers.get('location')
  if (!landed) {
    fail(source, `${hop.status} with no Location header`)
    continue
  }

  const landedPath = landed.replace(/^https?:\/\/[^/]+/, '')
  if (landedPath !== destination) {
    fail(source, `redirects to ${landedPath}, expected ${destination}`)
    continue
  }

  let target
  try {
    target = await fetch(BASE + destination)
  } catch (err) {
    fail(source, `destination ${destination} threw: ${err.message}`)
    continue
  }

  if (target.status !== 200) {
    fail(source, `destination ${destination} returns ${target.status} — this redirect points at a dead page`)
  }
}

console.log(
  failures === 0
    ? `\n  ${checked} redirects OK — every source is permanent and every destination is 200\n`
    : `\n  ${failures} of ${checked} failed\n`
)

process.exit(failures === 0 ? 0 : 1)
