// pages/api/indexnow.js
// Submits URLs to IndexNow (Bing, Yandex, Seznam, Naver) for near-instant indexing.
// ChatGPT search grounds on Bing's index, so IndexNow = fastest path into Bing + ChatGPT.
//
// Self-contained: pulls the URL list straight from the live sitemap, so it never
// drifts from /api/sitemap.xml and you never maintain a second list.
//
// Auth:
//   - Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when the
//     CRON_SECRET env var is set. That authorizes the scheduled daily run.
//   - Manual/targeted runs send `X-IndexNow-Secret: <INDEXNOW_SECRET>` as a HEADER.
//     It used to be `?secret=...`; a query string is written in plaintext to Vercel's
//     request logs and to the Referer of any outbound link, and this secret lets a
//     caller push arbitrary URLs into Bing's and Yandex's crawl queues under our key.
//
// Usage:
//   curl -H "X-IndexNow-Secret: $INDEXNOW_SECRET" \
//        'https://www.taxappealusa.com/api/indexnow'                 -> full sitemap
//   curl -H "X-IndexNow-Secret: $INDEXNOW_SECRET" \
//        '.../api/indexnow?urls=/counties/hillsborough-county-fl'    -> only those URLs
//
// Required env vars (Vercel -> Settings -> Environment Variables):
//   INDEXNOW_KEY     = 64bcda3c09a0d08cc8286468ee6b541f   (must match the /public/<key>.txt filename + contents)
//   INDEXNOW_SECRET  = <any long random string of your choice>   (gate for manual calls)
//   CRON_SECRET      = <any long random string>                  (Vercel auto-sends this to the cron)

import { requireCronSecret } from '../../lib/webhookAuth';

const HOST = "www.taxappealusa.com";
const BASE = `https://${HOST}`;

export default async function handler(req, res) {
  const KEY = process.env.INDEXNOW_KEY;
  const SECRET = process.env.INDEXNOW_SECRET;

  // --- Auth: allow either the Vercel cron bearer token or the manual secret ---
  //
  // The `process.env.CRON_SECRET &&` guard here is what kept this route from having
  // the "Bearer undefined" bypass that the two /cron routes did have. It is routed
  // through the shared helper anyway, so there is one implementation of the check and
  // one place doing the constant-time compare.
  const manualOk = SECRET && req.headers["x-indexnow-secret"] === SECRET;
  if (!manualOk) {
    if (req.query.secret) {
      return res.status(400).json({
        error: "Send the secret in the X-IndexNow-Secret header, not the query string.",
        code: "PASSWORD_IN_QUERY",
      });
    }
    if (requireCronSecret(req, res)) return;
  }
  if (!KEY) {
    return res.status(500).json({ error: "INDEXNOW_KEY env var not set" });
  }

  // --- Build the URL list ---
  let urlList = [];
  try {
    if (req.query.urls) {
      // Targeted submission: comma-separated relative or absolute URLs
      urlList = String(req.query.urls)
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean)
        .map((u) =>
          u.startsWith("http")
            ? u
            : `${BASE}${u.startsWith("/") ? "" : "/"}${u}`
        );
    } else {
      // Full submission: parse the live sitemap so this always mirrors it
      const r = await fetch(`${BASE}/api/sitemap.xml`, {
        headers: { "User-Agent": "taxappealusa-indexnow" },
      });
      if (!r.ok) {
        return res
          .status(502)
          .json({ error: `Sitemap fetch failed: ${r.status}` });
      }
      const xml = await r.text();
      urlList = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
    }
  } catch (err) {
    return res.status(500).json({ error: `Build URL list failed: ${err.message}` });
  }

  if (!urlList.length) {
    return res.status(400).json({ error: "No URLs to submit" });
  }

  // IndexNow accepts up to 10,000 URLs per request
  urlList = urlList.slice(0, 10000);

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `${BASE}/${KEY}.txt`,
    urlList,
  };

  try {
    const resp = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    // IndexNow returns 200 or 202 on success; body is usually empty
    return res.status(200).json({
      ok: resp.status === 200 || resp.status === 202,
      submitted: urlList.length,
      indexnowStatus: resp.status,
      mode: req.query.urls ? "targeted" : "full-sitemap",
    });
  } catch (err) {
    return res.status(502).json({ error: `IndexNow submit failed: ${err.message}` });
  }
}
