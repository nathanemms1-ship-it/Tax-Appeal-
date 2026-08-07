import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

/**
 * SERVICE HEALTH DASHBOARD — replaces taxappeal_service_health_dashboard.html.
 *
 * The old dashboard was a standalone HTML file in ~/Downloads, opened over file://,
 * with a HEALTH_TOKEN baked into it. It stopped working on 5 Aug 2026 with
 * ERR_ACCESS_DENIED — a macOS/Chrome folder-permission failure that had nothing to do
 * with this system and could recur at any time. See the header of
 * pages/api/admin-health.js for why a bookmarkable URL is the better shape.
 *
 * What this shows is OUR ACCOUNT'S health, not the vendors'. The distinction is the
 * whole point and is argued at the top of lib/healthChecks.js: a vendor status page
 * says "Operational" while our Anthropic balance is $0, our Lob key is a test key, or
 * INBOUND_EMAIL_SECRET is unset. Those are the failures that have actually threatened
 * the business, and no status page can see any of them.
 *
 * Auto-refresh is 60s and is deliberately NOT faster: each run fans out to several
 * vendor APIs. The server rate limit (12/min) is the real ceiling.
 *
 * The password is held in component state only — never localStorage or sessionStorage.
 */

const C = {
  navy:     "#1B3A6B",
  gold:     "#FFC940",
  darkNavy: "#0F1F3D",
  bg:       "#F4F7FC",
  lightBlue:"#EEF3FB",
  bodyGray: "#5A6B82",
  mutedGray:"#8596AF",
  border:   "#E8EDF4",
  white:    "#FFFFFF",
  green:    "#2E7D52",
  red:      "#C0392B",
  amber:    "#FFF8E6",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const SEVERITY_STYLE = {
  critical: { bg: "#FEE8E7", border: "#F3B7B2", color: C.red,     label: "CRITICAL", dot: C.red },
  warn:     { bg: C.amber,   border: "#F0DFAE", color: "#7A5C10", label: "WARNING",  dot: "#C8901A" },
  ok:       { bg: "#E6F4ED", border: "#BCE0CD", color: C.green,   label: "OK",       dot: C.green },
};

const OVERALL_COPY = {
  critical: "Something is broken that stops customers being served. Fix now.",
  warn:     "Everything essential works, but something needs attention.",
  ok:       "Every check passed. Customers can search, pay, sign and be mailed.",
};

/**
 * Why each check matters, in the terms that decide whether to act tonight.
 * Kept here rather than in the API so the wording can change without a server deploy.
 */
const WHY = {
  'Configuration':   "Env vars whose absence fails CLOSED and silently.",
  'Sales gate':      "SALES_ENABLED (server) and NEXT_PUBLIC_SALES_ENABLED (pages). Losing the server one stops dispatch silently.",
  'Cron heartbeats': "Did the scheduled jobs actually run? Without this, a stalled scheduler looks identical to a quiet one.",
  'Filing deadlines':"Queued orders against their county deadline. Past the receipt buffer the cron stops retrying, permanently.",
  'Spend ceilings':  "Daily caps in lib/spendGuard.js. At the ceiling, dispatch pauses.",
  'Anthropic':       "Powers lookup, the petition and the decision parser. Down = 'Lookup failed' at checkout.",
  'Stripe':          "Checkout. A test key here means no real money is taken.",
  'Lob':             "Mail and VAB fee cheques. A test key means nothing physically ships.",
  'Database':        "Supabase. Orders cannot be written or read.",
  'Schema':          "Do the 51 columns the code writes actually exist? A missing one takes money and stores nothing.",
  'Redis':           "Rate limits and send-letter idempotency. Degrades, does not stop sales.",
  'Stuck orders':    "Paid but not mailed. The worst outcome this system can produce.",
};

function timeAgo(iso) {
  if (!iso) return '';
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}

function CheckCard({ check }) {
  const s = SEVERITY_STYLE[check.status] || SEVERITY_STYLE.warn;
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderLeft: `4px solid ${s.dot}`, borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color: C.darkNavy, fontSize: 15 }}>{check.name}</div>
        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
          {s.label}
        </span>
      </div>
      <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{check.detail}</div>
      {WHY[check.name] && (
        <div style={{ fontSize: 11.5, color: C.mutedGray, marginTop: 8, lineHeight: 1.5 }}>{WHY[check.name]}</div>
      )}
    </div>
  );
}

export default function HealthDashboard() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const pwRef = useRef('');

  const load = useCallback(async (pw) => {
    const secret = pw ?? pwRef.current;
    if (!secret) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: secret }),
      });
      if (r.status === 401) {
        setError('Wrong password.');
        setAuthed(false);
        pwRef.current = '';
        return;
      }
      if (r.status === 429) {
        setError('Rate limited — the checks call several vendor APIs. Wait a minute.');
        return;
      }
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || `Request failed (${r.status})`);
        return;
      }
      pwRef.current = secret;
      setAuthed(true);
      setReport(data);
      setFetchedAt(new Date().toISOString());
    } catch (e) {
      setError(`Could not reach the server: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 60s auto-refresh, only once authenticated.
  useEffect(() => {
    if (!authed) return undefined;
    const id = setInterval(() => load(), 60000);
    return () => clearInterval(id);
  }, [authed, load]);

  if (!authed) {
    return (
      <>
        <Head>
          <title>Service Health | TaxAppeal Admin</title>
          <meta name="robots" content="noindex, nofollow" />
          <style>{FONT_IMPORT}</style>
        </Head>
        <div style={{ fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%" }}>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: C.darkNavy, margin: "0 0 8px" }}>Service Health</h1>
            <p style={{ fontSize: 14, color: C.bodyGray, margin: "0 0 24px", lineHeight: 1.6 }}>
              Enter your admin password. This is the same password as the orders dashboard.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); load(password); }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                autoFocus
                style={{ width: "100%", padding: "12px 14px", fontSize: 15, border: `1.5px solid ${C.border}`, borderRadius: 8, marginBottom: 12, boxSizing: "border-box", fontFamily: "inherit" }}
              />
              <button
                type="submit"
                disabled={loading || !password}
                style={{ width: "100%", background: C.navy, color: C.white, border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: loading || !password ? "not-allowed" : "pointer", opacity: loading || !password ? 0.6 : 1, fontFamily: "inherit" }}
              >
                {loading ? 'Checking…' : 'View health'}
              </button>
            </form>
            {error && <div style={{ marginTop: 14, fontSize: 13, color: C.red }}>{error}</div>}
          </div>
        </div>
      </>
    );
  }

  const s = SEVERITY_STYLE[report?.overall] || SEVERITY_STYLE.warn;
  const budgets = report?.budgets || {};

  return (
    <>
      <Head>
        <title>Service Health | TaxAppeal Admin</title>
        <meta name="robots" content="noindex, nofollow" />
        <style>{FONT_IMPORT}</style>
      </Head>
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh" }}>

        <div style={{ background: C.darkNavy, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: C.white }}>TaxAppeal</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: "1px", textTransform: "uppercase" }}>Service Health</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => load()} disabled={loading} style={{ background: "transparent", color: C.white, border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer", fontFamily: "inherit" }}>
              {loading ? 'Checking…' : '↻ Refresh'}
            </button>
            <a href="/admin" style={{ background: "transparent", color: C.white, border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none", fontFamily: "inherit" }}>
              Orders →
            </a>
          </div>
        </div>

        <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 24px 60px" }}>

          {error && (
            <div style={{ background: "#FEE8E7", border: `1px solid #F3B7B2`, color: C.red, borderRadius: 10, padding: "12px 16px", fontSize: 13, marginBottom: 20 }}>
              {error}
            </div>
          )}

          <div style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 14, padding: "22px 24px", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.6 }}>{OVERALL_COPY[report?.overall] || ''}</div>
            <div style={{ fontSize: 12, color: C.mutedGray, marginTop: 10 }}>
              Checked {timeAgo(report?.checkedAt)}
              {fetchedAt ? ` · auto-refreshes every 60s` : ''}
            </div>
          </div>

          {(report?.checks || []).map((c) => <CheckCard key={c.name} check={c} />)}

          {Object.keys(budgets).length > 0 && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 20 }}>
              <div style={{ fontWeight: 700, color: C.darkNavy, fontSize: 14, marginBottom: 10 }}>Daily ceilings</div>
              <div style={{ fontSize: 12.5, color: C.bodyGray, lineHeight: 1.9 }}>
                {Object.entries(budgets).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ textTransform: "capitalize" }}>{k}</span>
                    <span style={{ color: C.mutedGray }}>{String(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: C.mutedGray, marginTop: 10, lineHeight: 1.5 }}>
                Set in lib/spendGuard.js. These bound the damage from a retry storm or a bad cron — they are not a billing forecast.
              </div>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: C.mutedGray, marginTop: 24, lineHeight: 1.7 }}>
            This reports <strong>our account&rsquo;s</strong> health, not the vendors&rsquo;. A vendor status page can read
            &ldquo;Operational&rdquo; while our Anthropic balance is $0 or our Lob key is a test key. For paging on an outage,
            an external monitor should poll <code>/api/health</code>, which returns a bare status word without authentication.
          </div>
        </div>
      </div>
    </>
  );
}
