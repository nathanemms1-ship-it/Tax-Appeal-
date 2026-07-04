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
//   - Manual/targeted runs use `?secret=<INDEXNOW_SECRET>`.
//
// Usage:
//   GET  /api/indexnow?secret=XXX                       -> submit the full sitemap
//   GET  /api/indexnow?secret=XXX&urls=/counties/hillsborough-county-fl,/florida/tampa-fl
//                                                        -> submit only those URLs (use after editing specific pages)
//
// Required env vars (Vercel -> Settings -> Environment Variables):
//   INDEXNOW_KEY     = 64bcda3c09a0d08cc8286468ee6b541f   (must match the /public/<key>.txt filename + contents)
//   INDEXNOW_SECRET  = <any long random string of your choice>   (gate for manual calls)
//   CRON_SECRET      = <any long random string>                  (Vercel auto-sends this to the cron)

const HOST = "www.taxappealusa.com";
const BASE = `https://${HOST}`;

export default async function handler(req, res) {
  const KEY = process.env.INDEXNOW_KEY;
  const SECRET = process.env.INDEXNOW_SECRET;

  // --- Auth: allow either the Vercel cron bearer token or the manual secret ---
  const authHeader = req.headers.authorization || "";
  const cronOk =
    process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const secretOk = SECRET && req.query.secret === SECRET;
  if (!cronOk && !secretOk) {
    return res.status(401).json({ error: "Unauthorized" });
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
