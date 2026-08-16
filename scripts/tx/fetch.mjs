#!/usr/bin/env node
/**
 * Fetch Texas appraisal district roll exports listed in scripts/tx/sources.json.
 *
 *   node scripts/tx/fetch.mjs --list                 # what is available, nothing downloaded
 *   node scripts/tx/fetch.mjs --check                # probe every URL, download nothing
 *   node scripts/tx/fetch.mjs --county Hays          # one district
 *   node scripts/tx/fetch.mjs --county Hays --file certified_2026
 *   node scripts/tx/fetch.mjs --all --max-mb 500     # everything under a size cap
 *
 * Downloads land in ./tx-data/<County>/ unless --out says otherwise.
 * No dependencies. Node 18+ (uses global fetch).
 *
 * ============================================================================
 * WHY IT PROBES BEFORE DOWNLOADING
 * ============================================================================
 * Appraisal district filenames embed a certification date or a supplement
 * number, so they change every time a roll is re-certified. A dead link on a
 * WordPress site does not 404 — it 200s with an HTML "page not found" body. A
 * naive downloader saves that as a 40 KB .zip, unzip fails with a confusing
 * error, and the real cause (the URL moved three weeks ago) is two hours away.
 *
 * So every URL is probed before it is fetched, and the response is judged on its
 * MAGIC NUMBER rather than its content-type header. Content-type was the
 * first approach and it failed a test immediately: a JSON error body labelled
 * application/json sailed straight past a check written to catch exactly that
 * "you got a webpage, not a file" mistake. First four bytes do not lie.
 *
 * These servers also BLOCK under load — see the long note above probe(), which
 * records how a well-meaning retry strategy caused the very blocking it was
 * meant to diagnose. Probes are HEAD-first, never request a whole file, and are
 * paced per host. Tags: [head] = HEAD answered, no body needed; [retry N] = it
 * took N attempts.
 *
 * One bad link reports and the batch continues — it should not stop the rest.
 *
 * ============================================================================
 * WHY IT WILL NOT RUN IN THE CLOUD SANDBOX
 * ============================================================================
 * Every *.cad / appraisal district domain is outside the sandbox's egress
 * allowlist — they resolve to connection code 000 while npm resolves 200. This
 * script is meant to run on Nathan's own machine. That is not a limitation worth
 * engineering around; the files are large and belong on the machine that will
 * parse them.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES = join(HERE, 'sources.json');

// A county appraisal roll is never this small. Anything under it is an error
// page, a redirect stub, or a placeholder — not data.
const MIN_PLAUSIBLE_BYTES = 200 * 1024;

const UA = 'TaxAppealUSA-data-fetch/1.0 (+https://www.taxappealusa.com)';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const mb = (n) => (n == null ? '     ?' : `${(n / 1048576).toFixed(1).padStart(6)}`);

/**
 * Archive magic numbers. This is the check that actually works.
 *
 * Content-type was the first thing I reached for and it is not good enough:
 * a WordPress "page not found" can be served as text/html, but a misconfigured
 * host will label a JSON error body application/json, and some CDNs label
 * everything application/octet-stream. Meanwhile a genuine roll export is ALWAYS
 * a zip, 7z, rar or gzip, and those are identifiable from their first four bytes
 * regardless of what any header claims.
 *
 * Found by testing: the npm registry root returned application/json and sailed
 * past a content-type check that was supposed to catch exactly that class of
 * "you got a webpage, not a file" mistake.
 */
const MAGIC = [
  { sig: [0x50, 0x4b, 0x03, 0x04], name: 'zip' },
  { sig: [0x50, 0x4b, 0x05, 0x06], name: 'zip (empty)' },
  { sig: [0x50, 0x4b, 0x07, 0x08], name: 'zip (spanned)' },
  { sig: [0x37, 0x7a, 0xbc, 0xaf], name: '7z' },
  { sig: [0x52, 0x61, 0x72, 0x21], name: 'rar' },
  { sig: [0x1f, 0x8b], name: 'gzip' },
  { sig: [0xd0, 0xcf, 0x11, 0xe0], name: 'xls (OLE)' },
  { sig: [0x25, 0x50, 0x44, 0x46], name: 'pdf' },
];

export function identify(buf) {
  for (const m of MAGIC) {
    if (m.sig.every((b, i) => buf[i] === b)) return m.name;
  }

  // Plain text is legitimate for several districts — El Paso publishes
  // `~`-delimited flat files and a Schemas.txt — so unrecognised text is NOT a
  // failure. The job here is only to spot an error page wearing a data filename.
  const raw = Buffer.from(buf.subarray(0, 256)).toString('utf8').trimStart();
  const head = raw.toLowerCase();

  if (head.startsWith('<!doctype') || head.startsWith('<html')) return 'html';
  // Azure and S3 return XML error bodies. <?xml alone is not proof of an error —
  // but no district publishes a bare XML roll, so treating it as suspect is right.
  if (head.startsWith('<?xml') || head.startsWith('<error')) return 'markup';

  // JSON detection must be tight. An earlier version treated ANY leading '[' as
  // JSON, which failed a regression test against a Markdown file beginning
  // "[![Build status]" — and Markdown is exactly the shape of a README that a
  // misconfigured host might return. Require a leading brace, or a bracket
  // followed by something that can only start a JSON value.
  if (raw.startsWith('{')) return 'json';
  if (/^\[\s*[{"[\]]/.test(raw)) return 'json';

  return 'other';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A PROBE MUST NEVER ASK FOR A WHOLE FILE. This cost three rounds to learn.
 *
 * Round 1: all 46 probes fired back to back; four returned 403. Read as "those
 * files moved". Wrong.
 *
 * Round 2: the same sweep produced 403s on a DIFFERENT four. El Paso's 2026
 * export failed then returned 389 MB; its 2025 export did the reverse. Files do
 * not move and un-move in a minute, so the cause was on the server side. Correct
 * so far — but the fix was not.
 *
 * The fix added was "if a ranged request 403s, retry WITHOUT the Range header".
 * That means asking for the entire file — 388 MB — reading 512 bytes and
 * aborting the connection. Then doing it twice more on backoff. Across four
 * files that is a dozen abandoned large downloads against one host, which is
 * indistinguishable from abuse and is exactly what a WAF exists to stop.
 *
 * Round 3 proved it: EVERY El Paso file and every LARGE Hays file failed, while
 * the two small Hays files (0.1 MB, 0.3 MB) on the same host in the same run
 * passed. Size was the discriminator, not count. The retry strategy did not
 * reveal the block — it caused it.
 *
 * So the probe order is now HEAD, then a ranged GET, and never an unbounded one.
 * HEAD returns headers with no body at all: nothing to abort, nothing to look
 * like a download. The only cost is that HEAD gives no bytes to sniff, so
 * format identification falls back to the ranged GET, which is bounded to 512
 * bytes and safe to abandon.
 *
 * Retries are also cheaper now (2, not 3) because a HEAD that 403s twice really
 * is a signal rather than self-inflicted noise.
 */
const POLITE_DELAY_MS = Number(arg('delay', '400'));
const MAX_ATTEMPTS = 2;

// Per-host pacing. Two hosts throttled while forty other files sailed through,
// so a single global delay both over-waits on well-behaved hosts and under-waits
// on strict ones. Track the last request per hostname instead.
const lastHit = new Map();
async function paceFor(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return; }
  const prev = lastHit.get(host) || 0;
  const wait = POLITE_DELAY_MS - (Date.now() - prev);
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

const RETRYABLE = new Set([403, 429, 400, 503]);

async function probe(url, { attempt = 1 } = {}) {
  try {
    await paceFor(url);

    // ── 1. HEAD. No body, nothing to abandon. ──
    let r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA }, redirect: 'follow' });

    // ── 2. Ranged GET, only if HEAD is unsupported or gave us nothing useful. ──
    // Bounded to 512 bytes, so aborting it is not a half-finished download.
    let buf = Buffer.alloc(0);
    let bytes = Number(r.headers.get('content-length') || 0) || null;

    const headUnsupported = r.status === 405 || r.status === 501;
    if (headUnsupported || (r.ok && bytes === null)) {
      await paceFor(url);
      r = await fetch(url, {
        headers: { 'user-agent': UA, range: 'bytes=0-511' },
        redirect: 'follow',
      });
      const cr = r.headers.get('content-range');
      bytes = cr ? Number(cr.split('/')[1]) || null
                 : Number(r.headers.get('content-length') || 0) || null;
      if (r.ok || r.status === 206) {
        const reader = r.body.getReader();
        const { value } = await reader.read();
        reader.cancel().catch(() => {});
        buf = value ? Buffer.from(value) : Buffer.alloc(0);
      }
    }

    if (RETRYABLE.has(r.status)) {
      r.body?.cancel().catch(() => {});
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 1500);
        const again = await probe(url, { attempt: attempt + 1 });
        if (again.ok) return { ...again, retried: attempt + 1 };
        return again;
      }
      return { ok: false, status: r.status, bytes: null, kind: '', throttled: true };
    }

    if (!r.ok && r.status !== 206) {
      r.body?.cancel().catch(() => {});
      return { ok: false, status: r.status, bytes: null, kind: '' };
    }

    // A HEAD-only result has no bytes to identify. That is not a failure — the
    // download itself re-checks the magic number before keeping the file.
    if (!buf.length) {
      return { ok: true, status: r.status, bytes, kind: 'unsniffed', headOnly: true };
    }

    return { ok: true, status: r.status, bytes, kind: identify(buf), sniffed: buf.length };
  } catch (e) {
    return { ok: false, status: 0, bytes: null, kind: '', error: e.message };
  }
}

/**
 * Is this a real data file, or a webpage wearing a .zip filename?
 *
 * Three outcomes, not two. WARN exists because there is a genuine middle
 * ground — small plain text that could be a real auxiliary file or could be an
 * error body — and forcing it into FAIL produces the same cry-wolf problem the
 * size floor already caused once. A warning says "look at this"; a failure says
 * "this is broken", and only one of those is true here.
 */
function verdict(h) {
  if (!h.ok) {
    if (h.throttled) {
      return {
        level: 'fail',
        why: `HTTP ${h.status} after ${MAX_ATTEMPTS} attempts — likely rate limiting, not a dead link. Re-run in a few minutes or raise --delay`,
      };
    }
    return { level: 'fail', why: h.error ? `unreachable (${h.error})` : `HTTP ${h.status}` };
  }

  if (h.kind === 'html') {
    return { level: 'fail', why: 'served a webpage, not a file — the link has moved' };
  }
  if (h.kind === 'json' || h.kind === 'markup') {
    return { level: 'fail', why: `served ${h.kind === 'json' ? 'JSON' : 'XML'}, not a file — likely an error body` };
  }
  if (h.kind === 'pdf') {
    return { level: 'fail', why: 'this is a PDF, not a data export — check sources.json' };
  }

  // A VALID ARCHIVE MAGIC NUMBER IS SUFFICIENT. Do not second-guess it on size.
  //
  // The first version applied a blanket 200 KB floor on the theory that no county
  // roll is that small — which is true, and irrelevant, because not every file
  // here is a county roll. On the first live run it failed Hays's ARB decision
  // spreadsheet (127 KB) and Collin's code list (147 KB), both of which are real
  // files that are simply small. A guard that cries wolf on good data is worse
  // than no guard: it trains you to skim past the failure list, which is where
  // the real failures live.
  //
  // The floor was only ever standing in for "is this an error page", and the
  // magic number answers that question properly. It stays only for content we
  // could not identify at all.
  // HEAD answered and we never needed a body. Nothing to identify, and that is
  // fine: download() re-checks the magic number before keeping anything.
  if (h.kind === 'unsniffed') return { level: 'ok', why: '', kind: 'head only' };

  // Small plain text. El Paso's Schemas.txt is 3.3 KB of legitimate schema
  // description; an error body is also small plain text. We cannot tell them
  // apart from four bytes, so say so instead of guessing in either direction.
  if (h.kind === 'other' && h.bytes != null && h.bytes < MIN_PLAUSIBLE_BYTES) {
    return { level: 'warn', why: `${h.bytes} bytes of unidentified text — open it and check` };
  }
  return { level: 'ok', why: '', kind: h.kind };
}

async function download(url, dest) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));

  const s = await stat(dest);

  // Check the magic number on what actually landed, not on what the probe saw.
  // A site can serve a valid first 512 bytes and then fail mid-stream, and a
  // truncated zip that unzip refuses hours later is the same wasted afternoon
  // the probe exists to prevent.
  //
  // NOTE THE ORDER: identify first, judge size second, and only for content we
  // could not identify. The first version had a blanket 200 KB floor here and it
  // rejected a perfectly good 1 KB archive in testing — the same false positive
  // already fixed in verdict(), left behind in this function because I fixed one
  // call site and not the other. Two places enforcing the same rule is two places
  // to fix it; if a third appears, hoist it into a shared helper.
  const fh = await open(dest, 'r');
  let kind;
  try {
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fh.read(buf, 0, 512, 0);
    kind = identify(buf.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }

  if (kind === 'html' || kind === 'json' || kind === 'markup') {
    throw new Error(`server sent ${kind}, not a file — left in place for inspection`);
  }
  if (kind === 'other' && s.size < MIN_PLAUSIBLE_BYTES) {
    throw new Error(`${s.size} bytes of unidentified content — left in place for inspection`);
  }

  return s.size;
}

// ── main ────────────────────────────────────────────────────────────────────
//
// Guarded so this file can be IMPORTED for testing without running the CLI.
// It could not be, and that bit immediately: exporting identify() for a unit
// test meant `import { identify } from './fetch.mjs'` executed the whole
// downloader against the real source list, printing 46 failures and swallowing
// the test output entirely. A module with top-level side effects is a module
// that cannot be tested, and the guard costs one line.

const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {

  const src = JSON.parse(await readFile(SOURCES, 'utf8'));
  const outRoot = resolve(arg('out', './tx-data'));
  const wantCounty = arg('county');
  const wantFile = arg('file');
  const maxMb = Number(arg('max-mb', '0')) || 0;

  let districts = src.districts.filter((d) => d.files && Object.keys(d.files).length);
  if (wantCounty) {
    districts = districts.filter((d) => d.county.toLowerCase() === wantCounty.toLowerCase());
    if (!districts.length) {
      console.error(`No district named "${wantCounty}" with known file URLs.`);
      console.error(`Run with --list to see what is available.`);
      process.exit(2);
    }
  }

  if (has('list')) {
    console.log(`\nTexas roll exports with direct URLs — catalogued ${src.catalogued_at}\n`);
    for (const d of districts) {
      console.log(`${d.county}  (${d.format}${d.access === 'free' ? ', free' : `, ${d.access}`})`);
      for (const [k, u] of Object.entries(d.files)) console.log(`    ${k.padEnd(26)} ${u}`);
      if (d.notes) console.log(`    note: ${d.notes.split('. ')[0]}.`);
      console.log();
    }
    const total = districts.reduce((n, d) => n + Object.keys(d.files).length, 0);
    console.log(`${districts.length} districts, ${total} files.`);
    console.log(`\n${src.districts.filter((d) => d.confidence === 'indexed').length} more districts have pages that need a real browser to read,`);
    console.log(`and ${src.districts.filter((d) => d.access === 'public_information_request').length} need a public-information request. See sources.json.\n`);
    process.exit(0);
  }

  const jobs = [];
  for (const d of districts) {
    for (const [key, url] of Object.entries(d.files)) {
      if (wantFile && key !== wantFile) continue;
      jobs.push({ county: d.county, key, url, format: d.format });
    }
  }

  if (!jobs.length) {
    console.error('Nothing selected. Try --list.');
    process.exit(2);
  }

  console.log(`\nChecking ${jobs.length} file${jobs.length === 1 ? '' : 's'} before downloading anything...\n`);
  console.log(`${'COUNTY'.padEnd(12)} ${'FILE'.padEnd(26)} ${'MB'.padStart(6)}  STATUS`);
  console.log(`${'-'.repeat(12)} ${'-'.repeat(26)} ${'-'.repeat(6)}  ------`);

  const good = [];
  const bad = [];
  const warned = [];
  for (const j of jobs) {
    const h = await probe(j.url);
    const v = verdict(h);
    const tags = [h.headOnly ? 'head' : null, h.retried ? `retry ${h.retried}` : null]
      .filter(Boolean).join(', ');
    const label =
      v.level === 'ok'   ? `ok (${v.kind || h.kind})${tags ? ` [${tags}]` : ''}`
    : v.level === 'warn' ? `WARN — ${v.why}`
    :                      `FAIL — ${v.why}`;
    console.log(`${j.county.padEnd(12)} ${j.key.padEnd(26)} ${mb(h.bytes)}  ${label}`);
    const rec = { ...j, bytes: h.bytes, why: v.why };
    if (v.level === 'ok') good.push(rec);
    else if (v.level === 'warn') { warned.push(rec); good.push(rec); }
    else bad.push(rec);

    // Pace the sweep. See the note above probe(): these servers throttle, and a
    // burst produces 403s that read exactly like dead links.
    if (POLITE_DELAY_MS > 0) await sleep(POLITE_DELAY_MS);
  }

  const totalBytes = good.reduce((n, j) => n + (j.bytes || 0), 0);
  console.log(`\n${good.length} reachable, ${warned.length} to eyeball, ${bad.length} failed. Total ${(totalBytes / 1048576).toFixed(0)} MB.`);

  if (warned.length) {
    console.log(`\nWorth a look — real file or error body, cannot tell from the first bytes:`);
    for (const w of warned) console.log(`  ${w.county}/${w.key}: ${w.why}\n    ${w.url}`);
  }

  if (bad.length) {
    console.log(`\nFailures:`);
    for (const b of bad) console.log(`  ${b.county}/${b.key}: ${b.why}\n    ${b.url}`);
    console.log(`\nBefore assuming a link is dead: RE-RUN ONCE. These servers rate limit, and a`);
    console.log(`403 under load is indistinguishable from a moved file. Only if it fails twice`);
    console.log(`should you open the district's data page from sources.json, copy the new link`);
    console.log(`and update it. Never construct a URL by hand — the filenames carry`);
    console.log(`certification dates and supplement numbers.`);
  }

  if (has('check')) {
    console.log('\n--check: nothing downloaded.\n');
    process.exit(bad.length ? 1 : 0);
  }

  let toGet = good;
  if (maxMb) {
    toGet = good.filter((j) => !j.bytes || j.bytes <= maxMb * 1048576);
    const dropped = good.length - toGet.length;
    // Never silently truncate. A skipped file reads as "we covered everything"
    // three weeks later when nobody remembers the flag was set.
    if (dropped) console.log(`\n--max-mb ${maxMb}: skipping ${dropped} file(s) over the cap.`);
  }

  if (!toGet.length) {
    console.log('\nNothing left to download.\n');
    process.exit(bad.length ? 1 : 0);
  }

  console.log(`\nDownloading ${toGet.length} file(s) to ${outRoot}\n`);

  let okCount = 0;
  for (const j of toGet) {
    const name = decodeURIComponent(j.url.split('/').pop().split('?')[0]);
    const dest = join(outRoot, j.county.replace(/\s+/g, '_'), name);
    process.stdout.write(`  ${j.county}/${j.key} -> ${name} ... `);
    try {
      const size = await download(j.url, dest);
      console.log(`${(size / 1048576).toFixed(1)} MB`);
      okCount++;
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  console.log(`\n${okCount} of ${toGet.length} downloaded into ${outRoot}\n`);
  console.log(`Next: unzip one and look at it before any parser is written.`);
  console.log(`  cd ${outRoot} && find . -name '*.zip' -exec sh -c 'echo; echo "== {}"; unzip -l "{}" | head -30' \\;\n`);

}
