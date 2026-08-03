import { useState, useEffect, useRef } from "react";
import WaitlistForm from '../components/WaitlistForm';
import StepFloridaFee, { getFlVabFee } from '../components/StepFloridaFee';
import { isFlCountySupported, FL_COUNTY_NAMES } from '../lib/flVabAddresses';
import { getFilingWindowStatus } from '../lib/filingWindows';
import { deriveValuation, buildCategoryIndex } from '../lib/valuation';
import { curePriceFor, totalCostToCure } from '../lib/costToCure';

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52", amber: "#FFF8E6",
  red: "#C0392B", orange: "#E67E22", blue: "#2980B9", teal: "#27AE60", purple: "#8E44AD",
};

const STEPS = ["account", "property", "issues", "dispute"];
const stepLabels = { account: "Create Account", property: "Your Property", issues: "Property Issues", dispute: "Dispute Letter" };

const SUPPORTED_STATES = {
  TX: { name: "Texas", deadlineNote: "May 15 or 30 days after appraisal notice, whichever is later", filingNote: "Postmark by deadline counts in Texas", board: "Appraisal Review Board (ARB)", statute: "Texas Tax Code §41.41 & §41.43" },
  GA: { name: "Georgia", deadlineNote: "45 days from the date on your assessment notice", filingNote: "Postmark by deadline counts in Georgia", board: "Board of Equalization", statute: "O.C.G.A. §48-5-311" },
  FL: { name: "Florida", deadlineNote: "25 days after your TRIM notice (typically mid-September)", filingNote: "⚠️ Florida requires RECEIPT by deadline — not just postmark. File 7+ days early.", board: "Value Adjustment Board (VAB)", statute: "Florida Statute §194.011" },
  AR: { name: "Arkansas", deadlineNote: "Third Monday in August (August 17, 2026)", filingNote: "Postmark by deadline counts in Arkansas", board: "County Board of Equalization", statute: "Arkansas Code §26-27-317" },
  AL: { name: "Alabama", deadlineNote: "30 days from your Notice of Valuation (April–August)", filingNote: "File 7+ days before window closes — treat as receipt deadline.", board: "Board of Equalization", statute: "Code of Alabama §40-3-20" }
};

const ISSUE_CATEGORIES = [
  { category: "Structural & Major Systems", color: C.red, icon: "🏗", issues: ["Foundation cracks, settling, or structural damage","Roof damage or age (leaks, missing shingles, sagging)","Major water damage (ceiling/wall/floor stains, rot)","Mold or persistent mildew problems","Outdated or failed HVAC system","Failed or aging water heater","Outdated electrical service","Significant plumbing defects (leaks, corroded pipes)","Sewer or septic failure requiring replacement"] },
  { category: "Safety, Health & Code", color: C.orange, icon: "⚠️", issues: ["Active pest infestation (termites, rodents)","Asbestos or lead paint present","Code violations or illegal additions","Unpermitted work or missing permits","Noncompliant electrical (knob-and-tube, overloaded panels)","Hazardous materials requiring remediation"] },
  { category: "Functional & Livability", color: C.blue, icon: "🏠", issues: ["Cramped or poorly configured rooms","Illegally converted rooms with no egress","Inadequate insulation or energy inefficiency","Broken windows, doors, or security issues","No indoor laundry hookups","Only one bathroom for multiple bedrooms","Severely dated interiors requiring major renovation"] },
  { category: "Exterior & Site", color: C.teal, icon: "🌿", issues: ["Poor drainage causing yard or foundation flooding","Floodplain location or high flood insurance costs","Erosion, steep unusable land, or poor lot configuration","Proximity to busy road, industrial site, or airport","Proximity to landfill or other nuisance","Unpermitted outbuildings, fences, or encroachments"] },
  { category: "Appearance & Maintenance", color: C.purple, icon: "🔧", issues: ["Deferred maintenance (peeling paint, rotten trim)","Severely dated kitchen requiring full update","Severely dated bathrooms requiring full update","Significant curb appeal issues reducing buyer interest","Overgrown or neglected landscaping"] },
];

// Issue text -> category, so the valuation module can weight defects by severity
// without duplicating the category list.
const ISSUE_CATEGORY_INDEX = buildCategoryIndex(ISSUE_CATEGORIES);

const base = { fontFamily: "'DM Sans', sans-serif", color: C.darkNavy, background: C.bg, minHeight: "100vh" };
const cardStyle = { background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "32px" };
const inputStyle = { width: "100%", background: "#F8FAFD", border: `1.5px solid #DDE4EE`, borderRadius: 7, padding: "10px 13px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", color: C.darkNavy, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s, background 0.2s" };
const labelStyle = { display: "block", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", color: C.bodyGray, fontWeight: 500, marginBottom: 6, fontFamily: "'DM Sans', sans-serif" };
const primaryBtn = { background: C.navy, color: C.white, border: "none", borderRadius: 8, padding: "14px 24px", fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", width: "100%", transition: "background 0.2s, color 0.2s" };
const secondaryBtn = { background: "transparent", color: C.mutedGray, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "12px 24px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", width: "100%", transition: "border-color 0.2s" };
const disabledBtn = { ...primaryBtn, background: "#C5D0E0", cursor: "not-allowed" };

function AnnouncementBar() {
  return (
    <div className="announcement-bar-inner" style={{ background: C.navy, color: C.white, textAlign: "center", padding: "10px 20px", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
      In as little as 4 minutes, you could be on your way to saving thousands on your tax bill —{" "}
      <strong style={{ color: C.gold }}>we handle the paperwork.</strong>
    </div>
  );
}

function NavBar({ step }) {
  const isAccountStep = ["account", "property"].includes(step);
  const rightText = isAccountStep ? "Have an account? Sign in" : "Need help? Contact us";
  const rightHref = isAccountStep ? "/portal" : "mailto:support@taxappealusa.com";
  return (
    <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 19, color: C.darkNavy, lineHeight: 1 }}>TaxAppeal</div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Property Tax Dispute</div>
        </div>
      </div>
      <a href={rightHref} className="nav-right" style={{ fontSize: 15, fontWeight: 500, color: C.white, background: C.navy, textDecoration: "none", fontFamily: "'DM Sans', sans-serif", padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.navy}`, transition: "background 0.2s" }}>{rightText}</a>
    </div>
  );
}

function ProgressBar({ currentStep }) {
  // The eligibility check and the Florida fee screen are not their own numbered
  // steps — they sit between "Your Property" and "Property Issues". Without this
  // STEPS.indexOf returns -1 on those screens and the whole bar renders as though
  // the customer had not started, which reads as progress being lost.
  const SUBSTEPS = { 'florida-check': 'property', 'florida-fee': 'issues' };
  const idx = STEPS.indexOf(SUBSTEPS[currentStep] || currentStep);
  return (
    <div className="progress-bar-wrap" style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "14px 40px", display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
      {STEPS.map((step, i) => {
        const done = i < idx; const active = i === idx;
        return (
          <div key={step} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: done ? C.navy : active ? C.gold : C.white, border: done ? "none" : active ? "none" : `1.5px solid #C5D0E0`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: done ? C.white : active ? C.darkNavy : C.mutedGray, fontFamily: "'DM Sans', sans-serif" }}>
                {done ? "✓" : i + 1}
              </div>
              <div className="step-label" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.5px", textTransform: "uppercase", color: active ? C.navy : C.mutedGray, fontWeight: active ? 500 : 400, whiteSpace: "nowrap" }}>
                {stepLabels[step]}
              </div>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: 60, height: 1, background: i < idx ? C.navy : "#C5D0E0", margin: "0 8px", marginBottom: 20 }} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, id, type = "text", value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ ...inputStyle, ...(focused ? { borderColor: C.navy, background: C.white } : {}) }}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
    </div>
  );
}

/**
 * ADDRESS SUGGESTIONS COME FROM OUR OWN ROLL IN FLORIDA, NOT GOOGLE PLACES.
 *
 * Typing "7431 arthur st" against Google returned Gainesville VA, Oakland CA and
 * a Virginia drive — while the actual property, 7431 ARTHUR ST in Hollywood FL,
 * sat in our own parcels table with a 2026 just value on it. A national geocoder
 * has no idea which addresses we can serve.
 *
 * Two consequences, and the second is the real one:
 *   - every keystroke was a metered Google Places call, on 8.4 million Florida
 *     addresses we already hold and can query for nothing
 *   - a suggestion Google returns is not guaranteed to resolve to a parcel, so a
 *     customer could pick a perfectly real address and then be told we have no
 *     record of their property — which is exactly the failure the whole county
 *     data pipeline exists to remove
 *
 * NO GOOGLE FALLBACK IN FLORIDA. If the roll does not have it, offering a
 * suggestion we cannot resolve is worse than offering none — the customer types
 * it manually and the lookup fails honestly rather than after a false promise.
 * Other states keep Google, because we hold no data for them.
 */
function AddressAutocomplete({ value, onChange, onSelect, stateCode, zip }) {
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounce = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShow(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    if (debounce.current) clearTimeout(debounce.current);
    if (val.length < 3) { setSuggestions([]); setShow(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const z = String(zip || '').trim().slice(0, 5);
        const sc = String(stateCode || '').trim().toUpperCase();
        const looksFlorida = sc === 'FL' || (/^\d{5}$/.test(z) && Number(z) >= 32000 && Number(z) <= 34999);

        let list = [];
        // Our own roll first whenever Florida is possible — including when the
        // state box is still empty, which it usually is while the street is
        // being typed.
        if (looksFlorida || !sc) {
          const r = await fetch("/api/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: val, zip: z || null }) });
          const j = await r.json();
          list = (j.suggestions || []).map((x) => ({ ...x, state: 'FL' }));
        }
        // Google only for states we hold no roll for. Never as a Florida
        // fallback — see the header.
        if (!list.length && !looksFlorida) {
          const res = await fetch("/api/autocomplete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: val }) });
          const data = await res.json();
          list = data.suggestions || [];
        }
        setSuggestions(list);
        setShow(list.length > 0);
      } catch (_) {}
      setLoading(false);
    }, 300);
  };

  return (
    <div ref={wrapRef} style={{ marginBottom: 14, position: "relative" }}>
      <label style={labelStyle}>Street Address</label>
      <div style={{ position: "relative" }}>
        <input type="text" value={value} onChange={handleChange} placeholder="123 Maple Avenue" autoComplete="off"
          style={{ ...inputStyle, ...(focused ? { borderColor: C.navy, background: C.white } : {}), paddingRight: 36 }}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
        {loading && <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.navy}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />}
      </div>
      {show && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: C.white, border: `1.5px solid ${C.border}`, borderRadius: "0 0 8px 8px", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={() => { onSelect(s); setShow(false); setSuggestions([]); }}
              style={{ padding: "11px 14px", cursor: "pointer", borderBottom: i < suggestions.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: 10, transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.lightBlue}
              onMouseLeave={e => e.currentTarget.style.background = C.white}>
              <span style={{ color: C.navy, fontSize: 14, flexShrink: 0 }}>📍</span>
              <div>
                <div style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: C.darkNavy }}>{s.street}</div>
                <div style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: C.mutedGray, marginTop: 2 }}>{[s.city, s.state, s.zip].filter(Boolean).join(", ")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeadlinePopup({ stateCode, onClose }) {
  const state = SUPPORTED_STATES[stateCode];
  const ws = getFilingWindowStatus(stateCode);
  if (!state || !ws || !ws.isOpen) return null;
  const daysLeft = ws.daysUntilClose;
  const urgent = ws.urgency === "critical" || ws.urgency === "urgent";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "36px 40px", maxWidth: 480, width: "100%", boxShadow: "0 24px 80px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>{urgent ? "🚨" : "✅"}</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, textAlign: "center", color: C.darkNavy, marginBottom: 8 }}>
          {urgent ? `Only ${daysLeft} Days Left to File!` : `Filing Season is Open — ${daysLeft} Days Remaining`}
        </h2>
        <p style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", color: C.bodyGray, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
          {urgent ? `The ${state.name} filing window closes in ${daysLeft} days. Don't leave money on the table — file now.` : `The ${state.name} filing window is open. Most homeowners who file save hundreds or thousands per year. Now is the perfect time to dispute.`}
        </p>
        <div style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 24 }}>
          {[["State", state.name], ["Filing Body", state.board], ["Deadline", state.deadlineNote], ["Important", state.filingNote], ["Filing Window", `${daysLeft} days remaining`]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
              <span style={{ color: C.mutedGray }}>{k}</span>
              <span style={{ color: C.darkNavy, fontWeight: 500, textAlign: "right", maxWidth: 240 }}>{v}</span>
            </div>
          ))}
        </div>
        <button style={primaryBtn} onClick={onClose}>File My Protest Now →</button>
      </div>
    </div>
  );
}

function FilingWindowClosed({ stateCode, windowStatus, onBack, account, property }) {
  const [submitted, setSubmitted] = useState(false);
  const state = SUPPORTED_STATES[stateCode];
  const autoSaved = useRef(false);

  useEffect(() => {
    if (autoSaved.current) return;
    if (!account?.email) return;
    autoSaved.current = true;
    fetch("/api/join-waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: account.email,
        name: `${account.firstName} ${account.lastName}`,
        state: stateCode,
        county: null,
        propertyAddress: property ? `${property.street}, ${property.city}, ${property.state} ${property.zip}` : null,
        notifyDate: windowStatus?.openDate ? windowStatus.openDate.toISOString().split("T")[0] : null,
      }),
    }).then(() => { setSubmitted(true); }).catch(e => console.error("Auto-save waitlist error:", e));
  }, []);

  if (!state || !windowStatus) return null;
  const isTooClose = windowStatus.isOpen && windowStatus.tooClose;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 40px" }}>
      <div style={{ ...cardStyle, maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{isTooClose ? "⏰" : "📅"}</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.darkNavy, marginBottom: 10 }}>
          {isTooClose ? `${state.name} Filing Deadline Too Close` : `${state.name} Filing Season Opens Soon`}
        </h2>
        {isTooClose ? (
          <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 24, fontFamily: "'DM Sans', sans-serif" }}>
            The {state.name} filing deadline is in {windowStatus.daysUntilHard} days{windowStatus.receiptRequired ? " and Florida requires RECEIPT by the deadline (not just postmark)" : ""}. To protect you from a missed deadline, we cannot accept new filings this close to the cutoff.
          </p>
        ) : (
          <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 24, fontFamily: "'DM Sans', sans-serif" }}>
            The {state.name} protest filing window is currently closed. The next filing season opens in <strong style={{ color: C.navy, fontSize: 20 }}>{windowStatus.daysUntilOpen} days</strong>. We've saved your information and will email you the moment filing season opens.
          </p>
        )}
        <div style={{ background: C.darkNavy, borderRadius: 12, padding: "24px", marginBottom: 24, display: "inline-block", width: "100%" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 52, color: C.gold, marginBottom: 4 }}>{isTooClose ? windowStatus.daysUntilHard : windowStatus.daysUntilOpen}</div>
          <div style={{ fontSize: 14, color: "#8596AF", fontFamily: "'DM Sans', sans-serif" }}>{isTooClose ? "days until deadline" : "days until filing season opens"}</div>
          <div style={{ fontSize: 12, color: "#8596AF", fontFamily: "'DM Sans', sans-serif", marginTop: 8 }}>{state.deadlineNote}</div>
        </div>
        <div style={{ padding: 20, background: "#E6F4ED", border: "1px solid #B7DEC8", borderRadius: 8, textAlign: "left" }}>
          <div style={{ fontSize: 14, color: C.green, fontWeight: 700, marginBottom: 8 }}>✓ You're all set!</div>
          <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>We will email <strong>{account?.email || "you"}</strong> the day the {state.name} filing window opens. No action needed on your end.</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }} onClick={onBack}>← Back</button>
        </div>
      </div>
    </div>
  );
}

function UnsupportedState({ stateCode, onBack }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 40px" }}>
      <div style={{ ...cardStyle, maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 8 }}>Coming Soon to {stateCode}</h2>
        <p style={{ fontSize: 14, color: C.bodyGray, marginBottom: 24, lineHeight: 1.6 }}>TaxAppeal currently serves homeowners in <strong style={{ color: C.navy }}>Texas</strong>, <strong style={{ color: C.navy }}>Georgia</strong>, <strong style={{ color: C.navy }}>Florida</strong>, <strong style={{ color: C.navy }}>Arkansas</strong>, and <strong style={{ color: C.navy }}>Alabama</strong>. Enter your email to be first in line when we launch in {stateCode}.</p>
        {!submitted ? (
          <>
            <Field label={`Notify me when ${stateCode} launches`} id="wl" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
            <button style={primaryBtn} onClick={() => { if (email.includes("@")) setSubmitted(true); }}>Notify Me →</button>
          </>
        ) : (
          <div style={{ padding: 20, background: "#E6F4ED", border: `1px solid #B7DEC8`, borderRadius: 8 }}>
            <div style={{ fontSize: 14, color: C.green, fontWeight: 700 }}>✓ You're on the list!</div>
          </div>
        )}
        <div style={{ marginTop: 16 }}><button style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }} onClick={onBack}>← Back</button></div>
      </div>
    </div>
  );
}

function StepAccount({ data, onChange, onNext }) {
  const [err, setErr] = useState("");
  const go = () => {
    if (!data.firstName || !data.lastName) return setErr("Enter your full name.");
    if (!data.email.includes("@")) return setErr("Enter a valid email address.");
    if (data.password.length < 6) return setErr("Password must be at least 6 characters.");
    setErr(""); onNext();
  };
  return (
    <div className="page-grid">
      <div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.lightBlue, color: C.navy, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>🛡️ You sign it — we mail it certified</div>
        <h1 className="hero" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, color: C.darkNavy, lineHeight: 1.15, marginBottom: 12 }}>We fight your property tax bill. You keep the savings.</h1>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#1B3A6B", marginBottom: 24, fontFamily: "'DM Serif Display', serif", lineHeight: 1.3 }}>No forms to mail. No county offices to call. You sign it — we do the rest.</p>
        <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 28, fontFamily: "'DM Sans', sans-serif" }}>The National Taxpayers Union Foundation estimates that 30–60% of taxable property in the United States is over-assessed, and that fewer than 5% of taxpayers ever challenge it. TaxAppeal finds the discrepancy, builds your case with real comparable sales data, and files your protest for a flat $89 fee.</p>
        <div className="stat-flex" style={{ background: C.darkNavy, borderRadius: 10, padding: "18px 22px", marginBottom: 20 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 44, color: C.gold, lineHeight: 1, flexShrink: 0 }}>&lt;5%</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.white, marginBottom: 4 }}>of taxpayers ever challenge their assessment</div>
            <div style={{ fontSize: 12, color: C.mutedGray, lineHeight: 1.5 }}>Most over-assessed homeowners simply pay the bill. Filing takes about four minutes and costs $89 — whether your county grants a reduction is up to your county. Source: National Taxpayers Union Foundation.</div>
          </div>
        </div>
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "22px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, background: C.darkNavy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📊</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.darkNavy }}>We build your case</div>
          </div>
          <p style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.65, marginBottom: 16, fontFamily: "'DM Sans', sans-serif" }}>Our system searches millions of comparable sales, calculates your property's fair market value, and builds a professional appeal — so when your dispute lands on a reviewer's desk, it's backed by real data and impossible to ignore.</p>
          <div className="three-col-equal" style={{ marginBottom: 14 }}>
            {[["Nearby", "Comparable sales searched"], ["Fair", "Market value calculated"], ["100%", "Code-compliant appeals"]].map(([n, l]) => (
              <div key={l} style={{ background: C.bg, borderRadius: 8, padding: "12px", textAlign: "center" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.navy }}>{n}</div>
                <div style={{ fontSize: 10, color: C.mutedGray, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ background: C.lightBlue, borderRadius: 6, padding: "8px 12px", fontSize: 11, color: C.navy, fontFamily: "'DM Sans', sans-serif" }}>⚖️ Aligned with Texas §41.41 · Georgia §48-5-311 · Florida §194.011 · Arkansas Code §26-27-317 · Alabama Code §40-3-20</div>
        </div>
        <div className="price-flex" style={{ background: C.amber, border: `1.5px solid #FFD97A`, borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.gold, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>ONE-TIME FEE</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: C.darkNavy }}>$89</div>
            <div style={{ fontSize: 12, color: C.gold, fontFamily: "'DM Sans', sans-serif" }}>Flat rate. No hidden cuts.</div>
          </div>
          <div style={{ borderLeft: `2px solid #FFD97A`, paddingLeft: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.darkNavy, marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>vs. the other guys</div>
            <div style={{ fontSize: 12, color: C.bodyGray, lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>Up to 50% of your savings — on a $2,000 win, that's $1,000 gone before it ever reaches you.</div>
          </div>
        </div>
        {[["You sign it — we mail it certified", "Your dispute is submitted via certified letter — you review and sign, then we mail it in your name"], ["You get the certified mail receipt", "Official proof of submission sent directly to you"], ["Takes about 4 minutes", "Answer a few questions; you review and sign, and we mail it certified"], ["Keep 100% of what you save", "No percentage cuts — your savings are yours"]].map(([t, d]) => (
          <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.lightBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.navy, flexShrink: 0, marginTop: 2 }}>✓</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>{t}</div>
              <div style={{ fontSize: 12, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card-padding" style={{ ...cardStyle, position: "sticky", top: 20 }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, marginBottom: 6 }}>Create your account</h2>
        <p style={{ fontSize: 13, color: C.bodyGray, marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>Currently available for residents of:</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {Object.entries(SUPPORTED_STATES).map(([code, s]) => (
            <div key={code} style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: C.navy, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 5 }}>📍 {s.name}</div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#A0AFBF", marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>🕐 More states coming soon</div>
        <div style={{ background: C.bg, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif" }}>Total today</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: C.darkNavy }}>$89</span>
            <span style={{ background: "#E6F4ED", color: C.green, fontSize: 11, padding: "2px 8px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif" }}>One-time only</span>
          </div>
        </div>
        {err && <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 6, padding: "9px 13px", fontSize: 12, color: C.red, fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>{err}</div>}
        <div className="two-col">
          <Field label="First Name" id="fn" value={data.firstName} onChange={e => onChange("firstName", e.target.value)} placeholder="Jane" />
          <Field label="Last Name" id="ln" value={data.lastName} onChange={e => onChange("lastName", e.target.value)} placeholder="Smith" />
        </div>
        <Field label="Email Address" id="email" type="email" value={data.email} onChange={e => onChange("email", e.target.value)} placeholder="jane@example.com" />
        <Field label="Password" id="pw" type="password" value={data.password} onChange={e => onChange("password", e.target.value)} placeholder="At least 6 characters" />
        <button style={primaryBtn} onClick={go}>Continue →</button>
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif" }}>
          🔒 Secure checkout · 256-bit encryption<br />
          <span style={{ marginTop: 4, display: "block" }}>You won't be charged until your appeal is ready to file.</span>
        </div>
      </div>
    </div>
  );
}

function StepProperty({ data, onChange, onNext, onBack, onUnsupportedState, onClosedWindow }) {
  const [err, setErr] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [checkedState, setCheckedState] = useState(null);
  const [checking, setChecking] = useState(false);

  const go = async () => {
    if (!data.street || !data.city || !data.state || !data.zip) return setErr("Please fill in the complete property address.");
    const sc = data.state.trim().toUpperCase();
    if (!SUPPORTED_STATES[sc]) { onUnsupportedState(sc); return; }
    let countyName = null;
    if (sc === "GA") {
      setChecking(true);
      try {
        const censusRes = await fetch(`https://geocoding.geo.census.gov/geocoder/geographies/address?street=${encodeURIComponent(data.street)}&city=${encodeURIComponent(data.city)}&state=${encodeURIComponent(data.state)}&zip=${encodeURIComponent(data.zip)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
        if (censusRes.ok) {
          const censusData = await censusRes.json();
          const countyGeo = censusData?.result?.addressMatches?.[0]?.geographies?.Counties?.[0];
          if (countyGeo?.NAME) countyName = countyGeo.NAME.replace(/ County$/i, "").trim();
        }
      } catch (e) { console.log("County check failed:", e.message); }
      setChecking(false);
    }
    const ws = getFilingWindowStatus(sc, countyName);
    if (ws && !ws.canFile && !ws.canPreOrder) { onClosedWindow(sc, ws); return; }
    if (ws && ws.canPreOrder) { setErr(""); onNext(); return; }
    if (checkedState !== sc) { setCheckedState(sc); setShowPopup(true); return; }
    setErr(""); onNext();
  };

  return (
    <>
      {showPopup && checkedState && <DeadlinePopup stateCode={checkedState} onClose={() => { setShowPopup(false); window.scrollTo(0,0); onNext(); }} />}
      <div className="page-grid-sm">
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.lightBlue, color: C.navy, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>🏠 Step 2 of 4</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: C.darkNavy, marginBottom: 8 }}>Tell us about your property</h2>
          <div style={{ background: "#F0F7FF", border: "1px solid #C5D9F0", borderRadius: 8, padding: "10px 14px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1B4D8E", fontFamily: "'DM Sans', sans-serif" }}>
            🗄️ <span><strong>We auto-fill what we can.</strong> Enter your address and we'll pull your tax appraisal value, property details, and comparable sales from public records automatically.</span>
          </div>
          {err && <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 6, padding: "9px 13px", fontSize: 12, color: C.red, fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>{err}</div>}
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.navy, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>Property Address</div>
          <AddressAutocomplete value={data.street} stateCode={data.state} zip={data.zip} onChange={val => onChange("street", val)} onSelect={s => { onChange("street", s.street); if (s.city) onChange("city", s.city); if (s.state) onChange("state", s.state); if (s.zip) onChange("zip", s.zip); }} />
          <div className="three-col">
            <Field label="City" id="city" value={data.city} onChange={e => onChange("city", e.target.value)} placeholder="Mansfield" />
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>State</label>
              <select value={data.state} onChange={e => onChange("state", e.target.value)} style={{ ...inputStyle, appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235A6B82' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 28 }}>
                <option value="">State</option>
                <option value="TX">TX</option>
                <option value="GA">GA</option>
                <option value="FL">FL</option>
              </select>
            </div>
            <Field label="ZIP" id="zip" value={data.zip} onChange={e => onChange("zip", e.target.value)} placeholder="76063" />
          </div>
          <div style={{ background: "#FAFBFC", border: `1.5px dashed #C5D0E0`, borderRadius: 10, padding: 20, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>📋</span>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>Have your tax bill handy? </span>
                <span style={{ fontSize: 13, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif" }}>(Optional)</span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: C.bodyGray, marginBottom: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>Enter the values from your bill to override our lookup. Leave blank and we'll pull everything from public records automatically.</p>
            <div className="two-col">
              <Field label="Assessed Value" id="av" value={data.manualAssessedValue} onChange={e => onChange("manualAssessedValue", e.target.value)} placeholder="$425,000" />
              <Field label="Square Footage" id="sf" value={data.manualSqft} onChange={e => onChange("manualSqft", e.target.value)} placeholder="2,150" />
            </div>
            <div className="three-col-equal">
              <Field label="Year Built" id="yb" value={data.manualYearBuilt} onChange={e => onChange("manualYearBuilt", e.target.value)} placeholder="1998" />
              <Field label="Bedrooms" id="bd" value={data.manualBeds} onChange={e => onChange("manualBeds", e.target.value)} placeholder="4" />
              <Field label="Bathrooms" id="bt" value={data.manualBaths} onChange={e => onChange("manualBaths", e.target.value)} placeholder="2.5" />
            </div>
            <div style={{ marginBottom: 0 }}>
              <label style={labelStyle}>Property Type</label>
              <select value={data.propType} onChange={e => onChange("propType", e.target.value)} style={{ ...inputStyle, appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235A6B82' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 28 }}>
                <option value="">Select type</option>
                <option>Single-family home</option>
                <option>Townhouse</option>
                <option>Condo</option>
                <option>Multi-family</option>
                <option>Commercial</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button style={{ ...secondaryBtn, width: "auto", padding: "14px 24px" }} onClick={onBack}>← Back</button>
            <button style={{ ...primaryBtn }} onClick={go} disabled={checking}>{checking ? "Checking filing window..." : "🔍 Look up my property & continue"}</button>
          </div>
        </div>
        <div className="mob-hide">
          <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 12, padding: "22px 24px", marginBottom: 16 }}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.navy, marginBottom: 4 }}>$1,840</div>
            <div style={{ fontSize: 12, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif" }}>avg. savings per homeowner</div>
            <div style={{ fontSize: 11, color: C.mutedGray, marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>Flat fee — we never take a percentage</div>
          </div>
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.navy, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>What we look up</div>
            {[["🏛️", "County appraisal records"], ["📊", "Recent comparable sales"], ["🏠", "Property characteristics"], ["⚖️", "Tax code alignment"]].map(([icon, text]) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ width: 28, height: 28, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{icon}</div>
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The issues step, with what each defect costs to fix.
 *
 * The cost figure is the thing the petition actually asks for, so it is shown
 * here — before the owner pays — rather than appearing for the first time on a
 * letter they have already been charged for. Every figure is editable, because
 * an owner holding a contractor's quote has better information than a published
 * regional average and their number should win.
 *
 * PARCEL FACTS ARE FETCHED FOR FLORIDA ONLY. The costs scale by living area and
 * improvement value, which for Florida come free from the county roll. Every
 * other state would mean a metered RentCast call at a step the customer may
 * abandon, so those fall back to unscaled figures rather than spending money to
 * decorate a page. `/api/lookup` is cached, so the call the dispute step makes
 * later is served from cache and costs nothing extra.
 */
/**
 * THE FLORIDA ELIGIBILITY CHECK, INSIDE THE FUNNEL.
 *
 * Roughly 6 in 10 Florida residential parcels cannot benefit from an appeal at
 * all — Save Our Homes caps assessed value, and a petition can only move JUST
 * value, so a reduction that does not clear the cap changes nothing on the bill.
 * Those people must be turned away, and this is where that happens: after the
 * property step, before a single question about defects, and long before payment.
 *
 * WHY HERE AND NOT ON A SEPARATE PAGE FIRST.
 * By this point we hold their email (step 1) and their address (step 2). Someone
 * we turn away is therefore someone we can email the year their situation
 * changes — a sale, a market fall, a homestead ending. Putting the check on the
 * doorstep instead would mean the people we cannot help leave without a trace,
 * and they are the majority.
 *
 * A failure to reach the check is NOT a refusal. If the lookup errors we
 * continue, because refusing on absence of evidence would turn an outage into
 * lost customers who were perfectly eligible.
 */
function StepFloridaCheck({ property, onEligible, onBack }) {
  const [state, setState] = useState({ status: 'loading', data: null, comps: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // BOTH TESTS, HERE, BEFORE ANY MORE OF THE CUSTOMER'S TIME IS SPENT.
        //
        // /api/check is the Save Our Homes cap test — can a reduction reach the
        // bill at all. /api/comps additionally knows whether this property sold
        // arms-length for more than comparable sales support, which is the one
        // fact the Property Appraiser can answer every comp with.
        //
        // Until now the sale check did not run until the letter step, so someone
        // could be told "worth appealing" with three savings figures and then
        // quietly refused two steps later. Same answer, arrived at after wasting
        // their evening.
        //
        // Run together — the comps call is county data, so it costs nothing and
        // adds no vendor spend.
        const body = JSON.stringify({ street: property.street, zip: property.zip, city: property.city, state: 'FL' });
        const [cRes, kRes] = await Promise.all([
          fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
          fetch('/api/comps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => null),
        ]);
        const j = await cRes.json();
        if (cancelled) return;
        if (!j || j.found === false || j.eligible === undefined) { onEligible(); return; }

        // A comps failure must never block anyone. Only one specific verdict
        // stops the funnel: the subject itself sold above what the comps argue.
        // Thin comps do NOT stop it — a property with a failed roof still has a
        // real case on condition, and refusing those would turn a data gap into
        // a lost customer who was perfectly entitled to file.
        let comps = null;
        try { comps = kRes ? await kRes.json() : null; } catch { comps = null; }
        if (cancelled) return;

        setState({ status: 'done', data: j, comps });
      } catch {
        if (!cancelled) onEligible();
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: C.darkNavy, marginBottom: 10 }}>
          Checking your county&rsquo;s roll
        </div>
        <p style={{ color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
          We&rsquo;re reading the {property.city || 'county'} assessment roll to see whether an appeal
          can actually lower your bill. This takes a moment and costs you nothing.
        </p>
      </div>
    );
  }

  const d = state.data;
  const money = (n) => (n || n === 0 ? `$${Number(n).toLocaleString()}` : null);

  // ── Refuted by the property's own sale. ───────────────────────────────────
  //
  // Shown before the cap test because it is the more specific answer: this is not
  // "an appeal cannot help properties like yours", it is "the county will point
  // at your own deed". The owner should hear the actual reason.
  const sale = state.comps?.reason === 'subject_sold_above_indicated_value' ? state.comps : null;
  if (sale) {
    const px1 = d.parcel || {};
    const when = sale.subjectSale?.saleDate
      ? new Date(sale.subjectSale.saleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'recently';
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 12 }}>
          We don&rsquo;t think this appeal would succeed
        </h2>
        <p style={{ color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 18 }}>
          Your property sold on the open market in {when} for {money(sale.subjectSale?.salePrice)}. Recent sales of
          comparable homes nearby support a value of about {money(sale.indicatedValue)} — below what your own property
          actually sold for.
        </p>
        <p style={{ color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 18 }}>
          A recent arms-length sale is the strongest evidence a Property Appraiser has. If we filed, they would answer
          every comparable sale we cited with your own closing figure, and the Board would agree with them.
        </p>
        <div style={{ background: C.lightBlue, border: '1px solid #C5D3E8', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 14, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
          {px1.address ? <><strong>{px1.address}</strong><br /></> : null}
          Just value on the {px1.rollYear || ''} roll: {money(d.facts?.justValue)} · Sold {when} for {money(sale.subjectSale?.salePrice)}
        </div>
        <p style={{ color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 24, fontSize: 14 }}>
          We&rsquo;re not going to take $89 for a filing we expect to lose. This changes as the market moves and as your
          purchase recedes from the assessment date — we re-read every roll and will email you if it becomes worth filing.
        </p>
        <button style={{ ...secondaryBtn, width: 'auto', padding: '13px 24px' }} onClick={onBack}>
          ← Check a different property
        </button>
      </div>
    );
  }

  // ── Cannot win on the cap. Say so, plainly, and keep the door open. ────────
  if (!d.eligible) {
    const px0 = d.parcel || {};
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 12 }}>
          An appeal wouldn&rsquo;t lower your bill this year
        </h2>
        <p style={{ color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 18 }}>
          {d.message || 'Your assessed value is capped well below your just value, so reducing the just value would not reach your tax bill.'}
        </p>

        {/* THE FIGURES THE PARAGRAPH IS TALKING ABOUT.
            Without this the screen quotes a gap and a threshold and expects the
            reader to infer the just value those were derived from. On the one
            screen where we are telling somebody no, every number in the sentence
            has to be visible and checkable against their TRIM notice. */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
          {[
            ['Just value — what the county says it is worth', money(d.facts?.justValue)],
            ['Assessed value — what you are actually taxed on', money(d.facts?.cappedAt)],
            ['Save Our Homes is holding this much off your bill', money(d.facts?.differential)],
            ['A petition would have to cut just value by', d.facts?.requiredReductionPct != null ? `${d.facts.requiredReductionPct}%` : null],
          ].filter(([, v]) => v).map(([label, value], i) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '13px 16px', background: i % 2 ? C.white : '#FBFCFE', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
              <span style={{ color: C.bodyGray }}>{label}</span>
              <span style={{ color: C.darkNavy, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>

        {px0.address && (
          <p style={{ fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, marginBottom: 18 }}>
            {px0.address}{px0.rollYear ? ` · ${px0.rollYear} assessment roll` : ''}
          </p>
        )}
        {/* Only when it is NOT already inside d.message. qualify.js builds the
            refusal message by prepending breakEvenStatement to it, so rendering
            both printed the same two sentences twice in a row — which reads as a
            bug in the figures rather than a bug in the layout, on the one screen
            where we are asking someone to believe a number they did not want. */}
        {d.facts?.statement && !(d.message || '').includes(d.facts.statement) && (
          <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 10, padding: '16px 18px', marginBottom: 18, fontSize: 14, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
            {d.facts.statement}
          </div>
        )}
        <p style={{ color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 24, fontSize: 14 }}>
          We&rsquo;re not going to take $89 for a filing that cannot help you. We re-read every
          roll — if this changes, we&rsquo;ll email you at the address you gave us. Nothing else.
        </p>
        <button style={{ ...secondaryBtn, width: 'auto', padding: '13px 24px' }} onClick={onBack}>
          ← Check a different property
        </button>
      </div>
    );
  }

  // ── Worth filing. Show the county's own arithmetic, then continue. ─────────
  //
  // UNCAPPED IS NOT "NO ROOM". A parcel where assessed value equals just value
  // has no Save Our Homes differential to absorb a reduction, which is the
  // strongest position a Florida homeowner can be in — every dollar off just
  // value reaches the bill. Rendering that as "Room between them: $0" made the
  // best case on the page read as a failure.
  const uncapped = !d.facts?.differential || Number(d.facts.differential) <= 0;
  const px = d.parcel || {};

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '48px 24px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#E8F5EE', color: C.green, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 14, fontWeight: 600 }}>
        ✓ Worth appealing
      </div>
      <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 12 }}>
        Your property is worth appealing
      </h2>

      {/* Identify the parcel we matched. A customer needs to see we found THEIR
          house before any figure below it means anything. */}
      {px.address && (
        <div style={{ background: '#FBFCFE', border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 18, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ color: C.darkNavy, fontWeight: 600, marginBottom: 4 }}>{px.address}</div>
          <div style={{ color: C.mutedGray, fontSize: 13 }}>
            {[px.livingArea ? `${Number(px.livingArea).toLocaleString()} sq ft` : null,
              px.yearBuilt ? `built ${px.yearBuilt}` : null,
              px.parcelId ? `parcel ${px.parcelId}` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      )}

      <p style={{ color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 20 }}>
        These are your county&rsquo;s own figures from the {px.rollYear || ''} assessment roll.
        You can check every one of them against your TRIM notice.
      </p>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        {[
          ['Just value — the figure a petition disputes', money(d.facts?.justValue)],
          uncapped ? null : ['Your assessed value is capped at', money(d.facts?.cappedAt)],
          uncapped ? null : ['A reduction has to clear this much first', money(d.facts?.differential)],
        ].filter(Boolean).filter(([, v]) => v).map(([label, value], i) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '13px 16px', background: i % 2 ? C.white : '#FBFCFE', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
            <span style={{ color: C.bodyGray }}>{label}</span>
            <span style={{ color: C.darkNavy, fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ background: uncapped ? '#E8F5EE' : C.lightBlue, border: `1px solid ${uncapped ? '#B8DFC9' : '#C5D3E8'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 14, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
        {uncapped
          ? <>Your assessed value is <strong>not capped</strong> — it equals your just value. That is the
             best position to appeal from: every dollar taken off your just value comes straight off
             the value you are taxed on, with nothing absorbing it first.</>
          : (d.facts?.statement || <>Save Our Homes caps your assessed value below your just value, so a
             reduction only reaches your bill once it clears that gap.</>)}
      </div>

      {/* When comparable sales already support a lower value, say so here rather
          than making the customer take the cap arithmetic on trust. This is the
          strongest thing we know about their property and it was previously not
          surfaced until after payment. */}
      {state.comps?.sufficient && state.comps?.indicatedValue && d.facts?.justValue
        && state.comps.indicatedValue < d.facts.justValue && (
        <div style={{ background: '#E8F5EE', border: '1px solid #B8DFC9', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 14, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
          <strong>Comparable sales already support a lower value.</strong> {state.comps.comps?.length || 0} qualified
          arms-length sales in your own appraiser neighbourhood indicate about {money(state.comps.indicatedValue)},
          against the county&rsquo;s {money(d.facts.justValue)}. Those sales are cited in your petition.
        </div>
      )}

      {/* Scenarios labelled with the reduction each assumes, not adjectives.
          "Typical: $3,121" invites the question the label cannot answer.
          "At a 15% reduction: $3,121" states the assumption on its face, and the
          percentages come from lib/dor/qualify.js so they cannot drift. */}
      {d.estimates && (d.estimates.conservative != null || d.estimates.likely != null) && (
        <div style={{ marginBottom: 20 }}>
          {/* THE HOOK. This is the number a homeowner came for, so it is set as a
              headline rather than a field label — the old 11px uppercase caption
              made the most persuasive line on the page look like fine print. */}
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, marginBottom: 4, lineHeight: 1.3 }}>
            If your appeal succeeds, estimated savings in the first year
          </div>
          <p style={{ fontSize: 13, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", marginBottom: 12, lineHeight: 1.6 }}>
            And every year after, until your county raises the value again.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              ['conservative', d.estimates.conservative],
              ['likely', d.estimates.likely],
              ['optimistic', d.estimates.optimistic],
            ].filter(([, v]) => v != null).map(([key, v]) => {
              const pct = d.estimates.pcts?.[key];
              return (
                <div key={key} style={{ flex: '1 1 150px', border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', background: C.white }}>
                  <div style={{ fontSize: 12, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 4 }}>
                    {pct ? `${Math.round(pct * 100)}% reduction` : 'Reduction'}
                  </div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.navy, lineHeight: 1.1 }}>{money(v)}</div>
                  <div style={{ fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", marginTop: 3 }}>a year</div>
                </div>
              );
            })}
          </div>
          {d.estimates.millageIsEstimated && (
            <p style={{ fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, marginTop: 10 }}>
              Estimates only, shown at three possible outcomes. The millage rate used is a county
              average, so your actual saving depends on your exact taxing districts — and on what
              your Value Adjustment Board decides.
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button style={{ ...secondaryBtn, width: 'auto', padding: '14px 24px' }} onClick={onBack}>← Back</button>
        <button style={primaryBtn} onClick={onEligible}>Continue →</button>
      </div>

      <p style={{ fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
        {px.source ? `Source: ${px.source}. ` : ''}
        We report the county&rsquo;s own figures and the arithmetic that follows from them. TaxAppeal
        USA is a document preparation service — not appraisers, attorneys or tax advisers — and we do
        not represent you before the Value Adjustment Board. You sign and file in your own name.
      </p>
    </div>
  );
}

function StepIssues({ selectedIssues, onToggle, onNext, onBack, stateCode, notes, onNotesChange, property, costOverrides, onCostChange }) {
  const count = selectedIssues.length;
  const [parcel, setParcel] = useState(null);
  const [parcelState, setParcelState] = useState('idle');

  useEffect(() => {
    if (stateCode !== 'FL') { setParcelState('unscaled'); return; }
    let cancelled = false;
    setParcelState('loading');
    (async () => {
      try {
        const r = await fetch('/api/lookup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ street: property.street, city: property.city, state: property.state, zip: property.zip }),
        });
        const j = await r.json();
        if (cancelled) return;
        const e = j?.extractedData || {};
        if (e.assessedValue || e.sqft) {
          setParcel({ jv: e.assessedValue, lnd_val: e.landValue, tot_lvg_area: e.sqft });
          setParcelState('ok');
        } else setParcelState('unscaled');
      } catch { if (!cancelled) setParcelState('unscaled'); }
    })();
    return () => { cancelled = true; };
  }, [stateCode, property.street, property.city, property.state, property.zip]);

  const cure = totalCostToCure(selectedIssues, parcel, costOverrides);
  const curable = cure.priced.length;

  return (
    <div className="page-grid-issues">
      <div>
        <div style={{ background: C.amber, border: `1px solid #FFD97A`, borderRadius: 8, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>📅</span>
          <div style={{ fontSize: 13, color: "#7A5C10", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
            <strong>Don't wait — deadlines are firm.</strong> The Texas protest deadline is May 15 or 30 days after your appraisal notice, whichever is later. Georgia, Florida, Arkansas, and Alabama have firm deadlines too. File now to protect your right to appeal.
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.lightBlue, color: C.navy, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>💡 Optional but strengthens your case</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.darkNavy, marginBottom: 8 }}>Property issues</h2>
        <p style={{ fontSize: 14, color: C.bodyGray, marginBottom: 24, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>Select any problems that apply. Each one will be cited as evidence in your dispute letter.</p>
        {ISSUE_CATEGORIES.map((cat) => (
          <div key={cat.category} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: cat.color, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 7 }}>
              <span>{cat.icon}</span>{cat.category}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cat.issues.map((issue) => {
                const selected = selectedIssues.includes(issue);
                const price = selected ? curePriceFor(issue, parcel) : null;
                const override = costOverrides[issue];
                return (
                  <div key={issue}>
                    <div onClick={() => onToggle(issue)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: selected && price ? "8px 8px 0 0" : 8, border: `1.5px solid ${selected ? C.navy : C.border}`, borderBottom: selected && price ? "none" : undefined, background: selected ? C.lightBlue : C.white, cursor: "pointer", transition: "all 0.15s" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${selected ? C.navy : "#C5D0E0"}`, background: selected ? C.navy : C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.white, fontWeight: 700 }}>{selected ? "✓" : ""}</div>
                      <span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: selected ? C.darkNavy : "#3D4F66", fontWeight: selected ? 500 : 400 }}>{issue}</span>
                    </div>
                    {selected && price && price.curable && price.asked != null && (
                      <div style={{ border: `1.5px solid ${C.navy}`, borderTop: "none", borderRadius: "0 0 8px 8px", background: C.white, padding: "12px 14px 12px 44px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif" }}>Cost to repair</span>
                          <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 6, paddingLeft: 8, background: C.white }}>
                            <span style={{ fontSize: 13, color: C.bodyGray }}>$</span>
                            <input
                              type="text" inputMode="numeric"
                              value={override != null ? override : (price.asked ?? 0).toLocaleString()}
                              onChange={(e) => onCostChange(issue, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              style={{ border: "none", outline: "none", width: 92, padding: "7px 8px 7px 2px", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: C.darkNavy, fontWeight: 600, background: "transparent" }}
                            />
                          </div>
                          {override != null && String(override).trim() !== "" && (
                            <button onClick={() => onCostChange(issue, null)} style={{ border: "none", background: "none", color: C.navy, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>reset</button>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: C.mutedGray, marginTop: 6, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                          {override != null && String(override).trim() !== ""
                            ? "Your figure — cited as the owner's own estimate."
                            : <>{price.scope}. Typical range ${price.low.toLocaleString()}–${price.high.toLocaleString()}. Source: {price.source}, {price.sourceYear}.{parcelState === 'unscaled' ? " Not yet adjusted for your home's size." : ""}</>}
                        </div>
                      </div>
                    )}
                    {selected && price && !price.curable && (
                      <div style={{ border: `1.5px solid ${C.navy}`, borderTop: "none", borderRadius: "0 0 8px 8px", background: C.white, padding: "10px 14px 10px 44px", fontSize: 11, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                        No repair cost — this cannot be fixed by spending money. It is cited as support for the comparable-sales argument instead.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.bodyGray, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>📝 Additional notes</div>
          <p style={{ fontSize: 12, color: C.bodyGray, marginBottom: 8, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>Anything else that could strengthen your case.</p>
          <textarea value={notes} onChange={e => onNotesChange(e.target.value)} placeholder="e.g. County records show 4 bedrooms but we only have 3..." style={{ ...inputStyle, minHeight: 100, resize: "vertical", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={{ ...secondaryBtn, width: "auto", padding: "14px 24px" }} onClick={onBack}>← Back</button>
          <button style={primaryBtn} onClick={onNext}>📄 {count > 0 ? `Save & generate my dispute letter (${count} issue${count !== 1 ? "s" : ""})` : "Skip & generate my dispute letter"}</button>
        </div>
      </div>
      <div className="mob-hide" style={{ position: "sticky", top: 20 }}>
        <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 12, padding: "22px 24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: C.navy, lineHeight: 1 }}>{count}</div>
          <div style={{ fontSize: 13, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>{count === 1 ? "issue selected" : "issues selected"}</div>
          {count >= 3 && <div style={{ fontSize: 11, color: C.green, marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>✓ Strong case</div>}
        </div>
        {cure.total > 0 && (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.bodyGray, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>Total cost to repair</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: C.navy, lineHeight: 1 }}>${cure.total.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", marginTop: 8, lineHeight: 1.5 }}>
              across {curable} repairable {curable === 1 ? "issue" : "issues"}
              {cure.narrative.length > 0 && <> · {cure.narrative.length} non-repairable {cure.narrative.length === 1 ? "condition" : "conditions"} cited separately</>}
            </div>
            {/* Said here, before payment, not for the first time on the letter. */}
            {cure.disproportionate && (
              <div style={{ fontSize: 11, color: "#7A5C10", background: C.amber, border: "1px solid #FFD97A", borderRadius: 6, padding: "9px 11px", marginTop: 12, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                This is {Math.round(cure.shareOfValue * 100)}% of your assessed value. That is a large claim — your petition will state it plainly, and it is much stronger if you can produce contractor estimates for the biggest items.
              </div>
            )}
            <div style={{ fontSize: 11, color: C.mutedGray, marginTop: 12, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
              Your dispute asks the county to reduce the value by what these repairs cost. Every figure is editable and every source is named in the letter.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const LOAD_STAGES = [
  { label: "Determining your county", desc: "Looking up jurisdiction via Census geocoder", ms: 2800 },
  { label: "Retrieving appraisal data", desc: "Searching county appraisal district records", ms: 2200 },
  { label: "Searching comparable sales", desc: "Scanning recent transactions near your property", ms: 3500 },
  { label: "Finding your appraisal district", desc: "Locating where to file your dispute", ms: 2000 },
  { label: "Drafting your dispute letter", desc: "Building legal arguments with comp evidence", ms: 3000 },
];

function LoadingScreen({ addr }) {
  const [activeStage, setActiveStage] = useState(0);
  const [doneStages, setDoneStages] = useState([]);
  const [progress, setProgress] = useState(5);

  useEffect(() => {
    let stageIdx = 0;
    const advance = () => {
      if (stageIdx >= LOAD_STAGES.length) return;
      const current = stageIdx;
      stageIdx++;
      setTimeout(() => {
        setDoneStages(prev => [...prev, current]);
        setActiveStage(stageIdx);
        setProgress(Math.min(78, 5 + (stageIdx / LOAD_STAGES.length) * 73));
        if (stageIdx < LOAD_STAGES.length) advance();
      }, LOAD_STAGES[current].ms);
    };
    advance();
    const progressTimer = setInterval(() => setProgress(p => Math.min(78, p + 0.5)), 200);
    return () => clearInterval(progressTimer);
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
      <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 24px" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: C.navy, borderRightColor: C.navy, animation: "spin 1.1s linear infinite" }} />
        <div style={{ position: "absolute", inset: 13, borderRadius: "50%", background: C.lightBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📊</div>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 13, color: "#3D5275", fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>📍 {addr}</div>
      <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: C.darkNavy, marginBottom: 12 }}>Building your case</h2>
      <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.6, marginBottom: 32, fontFamily: "'DM Sans', sans-serif" }}>We're pulling live data from county appraisal records, searching comparable sales, and drafting your dispute letter. This takes about 60 seconds.</p>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24, textAlign: "left" }}>
        {LOAD_STAGES.map((stage, i) => {
          const done = doneStages.includes(i); const active = i === activeStage;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < LOAD_STAGES.length - 1 ? `1px solid ${C.border}` : "none", background: active ? C.bg : C.white, opacity: i > activeStage && !done ? 0.45 : 1, transition: "all 0.3s" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: done ? C.navy : active ? C.gold : "#E8EDF4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, animation: active ? "pulse 1.5s ease-in-out infinite" : "none" }}>
                {done ? <span style={{ color: C.white, fontSize: 14 }}>✓</span> : active ? "⟳" : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>{stage.label}</div>
                <div style={{ fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{stage.desc}</div>
              </div>
              <div style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", color: done ? C.green : active ? "#B8860B" : C.mutedGray, fontWeight: done || active ? 500 : 400 }}>{done ? "Complete" : active ? "In progress..." : "Waiting"}</div>
            </div>
          );
        })}
      </div>
      <div style={{ background: C.border, height: 6, borderRadius: 4, marginBottom: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${C.navy}, #3A6BC4)`, width: `${progress}%`, transition: "width 0.5s ease-out" }} />
      </div>
      <div style={{ fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", marginBottom: 28 }}>{activeStage < LOAD_STAGES.length ? LOAD_STAGES[Math.min(activeStage, LOAD_STAGES.length - 1)].label : "Finalizing..."}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 28 }}>
        {["🔒 256-bit encrypted", "🏛️ County records only", "⏱️ About 60 seconds"].map(item => (
          <div key={item} style={{ fontSize: 12, color: "#A0AFBF", fontFamily: "'DM Sans', sans-serif" }}>{item}</div>
        ))}
      </div>
    </div>
  );
}

/**
 * Render the evidence text.
 *
 * The model returns Markdown - "# EVIDENCE AND ARGUMENT", "## 1. BASIS OF
 * PETITION", "**Present Cash Value (s 193.011(1))**" - and the preview printed it
 * raw inside a <pre>-style block, so the customer saw literal #, ## and ** on the
 * document they are about to swear to. It read like a broken export.
 *
 * Deliberately a tiny renderer rather than a Markdown dependency: this handles the
 * three constructs the evidence prompt actually produces, and anything it does not
 * recognise falls through as plain text rather than disappearing. Nothing here is
 * dangerouslySetInnerHTML - the model's output is never injected as markup.
 */
function renderEvidence(text) {
  if (!text) return null;

  const inline = (line, keyBase) => {
    // **bold** -> <strong>, leaving everything else untouched.
    const parts = String(line).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return parts.map((part, i) =>
      /^\*\*[^*]+\*\*$/.test(part)
        ? <strong key={`${keyBase}-${i}`} style={{ color: "#0F1F3D" }}>{part.slice(2, -2)}</strong>
        : <span key={`${keyBase}-${i}`}>{part}</span>
    );
  };

  return String(text).split(/\n/).map((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) return <div key={i} style={{ height: 10 }} />;

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      return (
        <div key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#1B3A6B", marginTop: 16, marginBottom: 6 }}>
          {h2[1]}
        </div>
      );
    }
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      return (
        <div key={i} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: "#0F1F3D", marginTop: i === 0 ? 0 : 20, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #E8EDF4" }}>
          {h1[1]}
        </div>
      );
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      return (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <span style={{ color: "#8596AF" }}>•</span>
          <span>{inline(bullet[1], i)}</span>
        </div>
      );
    }
    return <p key={i} style={{ marginBottom: 8 }}>{inline(line, i)}</p>;
  });
}

function DisputeLetter({ propData, letter, issues, onRestart, account, property, flSignature }) {
  // What the customer will ACTUALLY be charged: $89 plus the Florida county VAB
  // filing fee. Every one of these labels used to read a hardcoded "$89" while a
  // Hillsborough customer was charged $139 — including the checkbox attesting that
  // "the $89 fee is non-refundable". That is a chargeback waiting to happen.
  const SERVICE_FEE_CENTS = 8900;
  const countyFeeCents = (flSignature && flSignature.vabFee) ? Number(flSignature.vabFee) : 0;
  const totalChargeCents = SERVICE_FEE_CENTS + countyFeeCents;
  const money = (cents) => `$${(cents / 100).toFixed(0)}`;
  const totalChargeLabel = money(totalChargeCents);
  const serviceFeeLabel = money(SERVICE_FEE_CENTS);
  const countyFeeLabel = money(countyFeeCents);

  // Refund terms.
  //
  // Sales open up to PRE_ORDER_DAYS (60) before a state's filing window, so a
  // customer can pay in June for a petition we are not permitted to mail until
  // late August. The old wording — "non-refundable once my dispute letter has
  // been filed" — therefore promised an open-ended refund right for up to two
  // months, and contradicted both the inline terms ("mailed") and /terms
  // ("generated and dispatched"). Three different triggers in three places; in a
  // dispute the reading most favourable to the customer governs, so we were
  // effectively bound by the loosest one.
  //
  // The rule now matches what the system actually does: the document is prepared
  // immediately on purchase, and preparation is the substance of the service. The
  // county filing fee is treated separately on purpose — it is a pass-through we
  // have not remitted until we mail, so we do not keep it.
  const refundAgreementText = countyFeeCents > 0
    ? `I understand my petition is prepared within 24 hours of purchase and that the ${serviceFeeLabel} service fee is non-refundable after that point. My ${countyFeeLabel} county filing fee is refunded in full if my petition has not yet been mailed. I agree to TaxAppeal's Terms of Service.`
    : `I understand my protest is prepared within 24 hours of purchase and that the ${serviceFeeLabel} fee is non-refundable after that point. I agree to TaxAppeal's Terms of Service.`;

  // ── Florida Part 3 signature ────────────────────────────────────────────────
  // Captured HERE, on the review screen, because the owner attests "I have read
  // this petition". Previously it was taken two screens earlier, before the
  // petition had been generated at all.
  const isFLFlow = (property?.state || '').trim().toUpperCase() === 'FL';
  // NOTE: no signature is captured on this screen any more. Florida's DR-486
  // Part 3 signature now happens on /success, after payment, against the complete
  // unblurred petition. See lib/fulfillOrder.js for why.
  const [agreements, setAgreements] = useState([false, false, false, false]);
  const [checkingOut, setCheckingOut] = useState(false);
  const pd = propData || {};
  const stateCode = property.state.trim().toUpperCase();
  const stateInfo = SUPPORTED_STATES[stateCode] || {};
  const filingWindow = getFilingWindowStatus(stateCode, pd.county);
  const requiresAuth = ["AR","AL"].includes(stateCode);
  const allAgreed = agreements[0] && agreements[1] && agreements[2] && (!requiresAuth || agreements[3]);
  const toggleAgreement = (i) => setAgreements(prev => { const n = [...prev]; n[i] = !n[i]; return n; });

  const agentAuthGranted = requiresAuth && agreements[3];
  const doCheckout = async () => {
    if (!allAgreed) return;
    setCheckingOut(true);

    // The petition is NOT regenerated with a signature here any more - there is no
    // signature yet. propData.letterKey holds the unsigned preview, which is what
    // /success shows the owner to read and sign. processOrder's
    // refreshPetitionBeforeFiling rebuilds it with their signature at mail time.
    const signedLetterKey = propData?.letterKey || '';

    // Actual amount the customer is about to be charged: $89 base plus the
    // Florida county VAB filing fee. This was hardcoded to 89, so Google Ads'
    // Smart Bidding was learning from understated values in the launch market
    // (FL orders are $104-$139).
    const totalChargeDollars = totalChargeCents / 100;

    // Google Ads / GA4 — begin_checkout conversion event
    // Fires the moment the homeowner clicks `File my dispute · ${totalChargeLabel}" and agrees to terms.
    // Set NEXT_PUBLIC_GADS_CHECKOUT_LABEL in your Vercel env to activate Google Ads conversion.
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'begin_checkout', {
        currency: 'USD',
        value: totalChargeDollars,
        items: [{
          item_id: 'property-tax-appeal',
          item_name: 'Property Tax Appeal Filing',
          item_category: stateCode,
          price: totalChargeDollars,
          quantity: 1,
        }],
      });
      const gadsId = process.env.NEXT_PUBLIC_GADS_ID;
      const checkoutLabel = process.env.NEXT_PUBLIC_GADS_CHECKOUT_LABEL;
      if (gadsId && checkoutLabel) {
        window.gtag('event', 'conversion', {
          send_to: `${gadsId}/${checkoutLabel}`,
          value: totalChargeDollars,
          currency: 'USD',
        });
      }
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          firstName: account.firstName,
          lastName: account.lastName,
          password: account.password,
          address: pd.rawAddress,
          county: pd.county,
          assessedValue: pd.assessedValue,
          targetReduction: pd.targetReduction,
          savings: pd.savings,
          letter: null,
          districtName: pd.appraisalDistrict?.districtName || null,
          districtAddress: pd.appraisalDistrict?.mailingAddress || null,
          districtCity: pd.appraisalDistrict?.city || null,
          districtState: pd.appraisalDistrict?.state || null,
          districtZip: pd.appraisalDistrict?.zip || null,
          ownerStreet: property.street,
          ownerCity: property.city,
          ownerState: property.state,
          ownerZip: property.zip,
          stateCode: property.state ? property.state.trim().toUpperCase() : '',
          // FL: the SIGNED petition (re-rendered after the owner read and signed it).
          // Other states: the generated protest letter.
          letterKey: signedLetterKey || pd.letterKey || null,
          // Florida signs after payment on /success; finalize-order writes the
          // Part 3 name and elections to the order row from there.
          flSignatureName: '',
          flSignatureTimestamp: '',
          flAuthDate: '',
          // Evidence the customer affirmatively confirmed their county, rather than
          // us having inferred it. County sets the fee, the payee and which office
          // receives the petition, so if it is ever disputed this is the record of
          // who chose it. Stripe metadata is durable and auditable, which is why it
          // rides here rather than only in our own table.
          countyConfirmedAt: flSignature?.countyConfirmedAt || '',
          countySource: flSignature?.countySource || '',
          refCode: (() => {
            if (typeof window === 'undefined') return '';
            try {
              const code = localStorage.getItem('taxappeal_ref');
              const at = Number(localStorage.getItem('taxappeal_ref_at') || 0);
              // 90-day attribution window; anything older is not this partner's referral.
              if (!code || !at || (Date.now() - at) > 90 * 24 * 60 * 60 * 1000) return '';
              return code.trim().toUpperCase();
            } catch (e) { return ''; }
          })(),
          isPreOrder: !!(filingWindow && filingWindow.canPreOrder),
          scheduledFileDate: (filingWindow && filingWindow.canPreOrder) ? filingWindow.openDate.toISOString() : '',
        }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { throw new Error(data.error || 'Checkout failed'); }
    } catch (e) {
      alert('Payment error: ' + e.message);
      setCheckingOut(false);
    }
  };

  const lines = letter.split("\n");
  const visibleLines = lines.slice(0, 30).join("\n");
  const blurredLines = lines.slice(30).join("\n");

  return (
    <div className="page-grid-letter">
      <div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#E6F4ED", color: C.green, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>✓ Your dispute letter is ready</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.darkNavy, marginBottom: 6 }}>Your case is built.</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", marginBottom: 24 }}>📍 {pd.rawAddress} — {pd.county}</div>
        <div style={{ background: C.darkNavy, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: "#5A7A9F", fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>CASE SUMMARY</div>
          <div className="two-col-summary">
            {[
              [pd.assessedValue && pd.targetReduction ? `$${Number(pd.assessedValue - pd.targetReduction).toLocaleString()}` : pd.assessedValue ? `$${Math.round(Number(pd.assessedValue) * 0.20).toLocaleString()}` : "—", "Estimated overvaluation"],
              [pd.savings ? `$${pd.savings.toLocaleString()}` : pd.assessedValue ? `$${Math.round(Number(pd.assessedValue) * 0.20 * 0.018).toLocaleString()}` : "—", "Potential annual savings"],
              // WAS THE LITERAL STRING "4–5".
              // It claimed four to five comparable sales on every petition,
              // including ones where the comps engine supplied none — which is
              // now the normal outcome whenever the subject's own sale refutes
              // them. A count the customer reads before paying has to be the
              // real count.
              [String(pd.compCount ?? 0), (pd.compCount ?? 0) === 1 ? "Comparable sale cited" : "Comparable sales cited"],
              [issues.length.toString(), "Issues cited in letter"],
            ].map(([val, label]) => (
              <div key={label}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.gold }}>{val}</div>
                <div style={{ fontSize: 12, color: "#5A7A9F", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{label}</div>

            {/* WHY THERE ARE NO COMPARABLE SALES.
                A zero in gold next to the price reads as something that failed
                unless we say otherwise. It is also material to what the customer
                is about to buy: a petition citing six verified sales and one
                citing none are different products, and they should know which
                one they are getting while they can still walk away.
                The reason is specific, because "your neighbourhood rarely
                transacts" and "nearby sales argue against you" are different
                facts and only one of them is about them. */}
            {(pd.compCount ?? 0) === 0 && (
              <div style={{ background: C.amber, border: "1px solid #FFD97A", borderRadius: 10, padding: "16px 18px", marginTop: 16, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ fontWeight: 700, color: "#7A5C10", fontSize: 14, marginBottom: 6 }}>
                  This petition does not cite comparable sales
                </div>
                <p style={{ fontSize: 13, color: "#7A5C10", lineHeight: 1.7, margin: "0 0 10px" }}>
                  {pd.compsReason === 'comps_do_not_support_reduction'
                    ? <>Recent sales of similar homes near you support a value at or above your assessment. We are not citing them, because doing so would argue against your own case.</>
                    : pd.compsReason === 'land_value_not_comparable'
                    ? <>Most of your property&rsquo;s value is the land itself, and the nearby sales we hold are not comparable on that basis. Comparing a lot like yours to houses on ordinary lots would produce a figure we could not defend.</>
                    : <>Too few homes of similar size and age near you sold in the assessment period for us to cite any. That is common for larger or older properties, and for neighbourhoods where houses change hands rarely.</>}
                </p>
                <p style={{ fontSize: 13, color: "#7A5C10", lineHeight: 1.7, margin: 0 }}>
                  <strong>This does not mean your petition will fail.</strong>{' '}
                  {pd.askRestsOn === 'evidence' && pd.cureTotal
                    ? <>It rests on the condition of your property — {`$${Number(pd.cureTotal).toLocaleString()}`} of documented defects, each priced from published construction cost data. Condition is a mandatory consideration under Fla. Stat. § 193.011(6), and it stands on its own without comparable sales.</>
                    : <>It rests on two grounds: the condition of your property{pd.cureTotal ? `, with ${`$${Number(pd.cureTotal).toLocaleString()}`} of documented defects priced from published cost data` : ''}, and the fact that your county set this value by mass appraisal without ever inspecting your property. Both are recognised grounds under Fla. Stat. § 193.011.</>}
                </p>
              </div>
            )}
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid #1E2D45`, paddingTop: 12, fontSize: 12, color: "#5A7A9F", fontFamily: "'DM Sans', sans-serif" }}>
            ⚖️ Drafted under {stateInfo.statute || "applicable state statutes"} · {pd.appraisalDistrict?.districtName || pd.county}
          </div>
        </div>
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>Dispute Letter Preview</div>
              <div style={{ fontSize: 11.5, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                {isFLFlow
                  ? "You'll see your complete petition after checkout, and sign it there."
                  : "You'll see your complete letter after checkout, and sign it there."}
              </div>
            </div>
            {/* Florida has no appraisal districts. A VAB petition goes to the county's
                Clerk of the Value Adjustment Board, so labelling this box with the
                Property Appraiser told the customer it was going somewhere it is not. */}
            {!isFLFlow && pd.appraisalDistrict && <div style={{ background: C.lightBlue, color: C.navy, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif" }}>{pd.appraisalDistrict.districtName}</div>}
            {isFLFlow && pd.county && <div style={{ background: C.lightBlue, color: C.navy, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>{String(pd.county).replace(/\s+County$/i, "")} County VAB</div>}
          </div>
          {/* Petition details.
              The preview rendered the evidence argument only. A Florida customer
              signs Part 3 under penalties of perjury attesting the facts are true,
              so they have to be able to check the facts that identify the property:
              their name, the address, the parcel number and the values. Those live
              in Parts 1-2 of the DR-486 and were nowhere on this screen. */}
          <div style={{ padding: "14px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: C.mutedGray, fontWeight: 600, marginBottom: 10 }}>
              {isFLFlow ? "Petition details — please check these are correct" : "Filing details — please check these are correct"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 18px", fontSize: 12.5 }}>
              {[
                ["Property owner", `${account?.firstName || ""} ${account?.lastName || ""}`.trim() || "—"],
                ["Property address", pd.rawAddress || `${property?.street || ""}, ${property?.city || ""} ${property?.zip || ""}`],
                ["Parcel / folio number", pd.parcelId || pd.apn || "Not listed in county records"],
                [isFLFlow ? "Value Adjustment Board" : "Filed with", isFLFlow ? `${String(pd.county || "").replace(/\s+County$/i, "")} County VAB` : (pd.appraisalDistrict?.districtName || pd.county || "—")],
                ["Tax year", pd.taxYear || new Date().getFullYear()],
                ["Current assessed value", pd.assessedValue ? `$${Number(pd.assessedValue).toLocaleString()}` : "—"],
                ["Value we are requesting", pd.targetReduction ? `$${Number(pd.targetReduction).toLocaleString()}` : "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ color: C.mutedGray, fontSize: 11 }}>{label}</div>
                  <div style={{ color: C.darkNavy, fontWeight: 500, wordBreak: "break-word" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "16px", fontFamily: "Georgia, serif", fontSize: 13, lineHeight: 1.85, color: C.darkNavy, background: C.white, overflowX: "hidden" }}>{renderEvidence(visibleLines)}</div>
          <div style={{ position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80, background: `linear-gradient(to bottom, rgba(255,255,255,0.97), transparent)`, zIndex: 2 }} />
            {/* The blur is the paywall: the customer reads the opening of their
                petition, pays, then reads and signs the whole thing.
                NEXT_PUBLIC_PREVIEW_UNBLURRED=true lifts it, for reviewing the
                full document without paying. It is an env var rather than a
                query parameter so it cannot be guessed, and it should be removed
                from Vercel before there is meaningful traffic. */}
            <div style={{ padding: "0 24px 20px", fontFamily: "Georgia, serif", fontSize: 13, lineHeight: 1.85, color: C.darkNavy, background: C.white, ...(process.env.NEXT_PUBLIC_PREVIEW_UNBLURRED === 'true' ? {} : { filter: "blur(4px)", opacity: 0.6, userSelect: "none" }), whiteSpace: "normal" }}>{blurredLines ? renderEvidence(blurredLines) : ( "The rest of your letter is being prepared — you will see all of it after checkout.")}</div>
          </div>
          <div style={{ background: C.bg, borderTop: `1px solid ${C.border}`, padding: "10px 16px", fontSize: 12, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
            {process.env.NEXT_PUBLIC_PREVIEW_UNBLURRED === 'true'
              ? <>🔓 <strong>Preview mode</strong> — the full petition is shown unblurred for review. Customers see this section hidden until checkout.</>
              : <>🔒 The rest is hidden until checkout. Right after you pay you will see the <strong>complete document with nothing blurred</strong>, read it, and sign it yourself.</>}
          </div>
        </div>
        <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <span>📋</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>Terms & Disclaimer — Please read before filing</span>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto", padding: "14px 16px", fontSize: 12, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7 }}>
            <p><strong>1. No guarantee of outcome.</strong> Your appraisal district determines the result, not TaxAppeal.</p>
            <p><strong>2. Not legal advice.</strong> TaxAppeal is a document preparation service only.</p>
            <p><strong>3. Accuracy of information.</strong> You are responsible for reviewing the letter for accuracy.</p>
            <p><strong>4. Filing deadlines.</strong> You are responsible for verifying that your county's protest window is still open.</p>
            <p><strong>5. Refunds.</strong> Your protest or petition is prepared in the TaxAppeal system within 24 hours of purchase. The {serviceFeeLabel} service fee may be refunded in full if you request it within 24 hours of payment; after that it is non-refundable, because your document has been prepared.{countyFeeCents > 0 ? ` Your ${countyFeeLabel} county filing fee is separate: it is refunded in full at any time before your petition is mailed.` : ''}</p>
            <p><strong>6. Service availability.</strong> TaxAppeal currently serves TX, GA, FL, AR, and AL.</p>
          </div>
        </div>
        {/* NOTE: these MUST be template literals (backticks).
            The third one used to be a double-quoted string containing
            "${totalChargeLabel}", so it shipped to production with the literal
            placeholder text in it — the single checkbox that constitutes the
            customer's agreement to the price did not state a price. */}
        {[
          `I understand that TaxAppeal does not guarantee my appraisal district will lower my assessed value. The outcome is determined solely by my county.`,
          `I confirm the property information I provided is accurate and I have reviewed the letter preview above.`,
          refundAgreementText,
        ].map((text, i) => (
          <div key={i} onClick={() => toggleAgreement(i)} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${agreements[i] ? C.navy : C.border}`, background: agreements[i] ? C.lightBlue : C.white, cursor: "pointer", marginBottom: 10, transition: "all 0.15s" }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${agreements[i] ? C.navy : "#C5D0E0"}`, background: agreements[i] ? C.navy : C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.white, fontWeight: 700, marginTop: 2 }}>{agreements[i] ? "✓" : ""}</div>
            <span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: C.bodyGray, lineHeight: 1.5 }}>{text}</span>
          </div>
        ))}
        {requiresAuth && (
          <div
            onClick={() => toggleAgreement(3)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 14px", borderRadius: 8, marginBottom: 10, cursor: "pointer",
              border: "1.5px solid " + (agreements[3] ? C.navy : "#D4860A"),
              background: agreements[3] ? C.lightBlue : "#FFF8E6",
              transition: "all 0.15s"
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2,
              border: "1.5px solid " + (agreements[3] ? C.navy : "#D4860A"),
              background: agreements[3] ? C.navy : C.white,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: C.white, fontWeight: 700
            }}>
              {agreements[3] ? "✓" : ""}
            </div>
            <div style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: C.bodyGray, lineHeight: 1.5 }}>
              <strong style={{ color: "#7A5C10", display: "block", marginBottom: 3 }}>
                {"Filing Authorization — Required for " + (stateInfo.name || "this state")}
              </strong>
              {"I authorize TaxAppeal USA to prepare and submit my property tax protest to the " + (stateInfo.board || "Board of Equalization") + " using the information I have provided, and to file it in my name as the property owner. This electronic authorization — recorded with my name, date, and IP address — will accompany my protest filing."}
            </div>
          </div>
        )}
        {/* The Florida Part 3 signature used to live here, under a preview whose
            second half is deliberately blurred - so the owner attested, under
            penalties of perjury, that they had "read this petition and the facts
            stated in it are true" about a document this page was hiding from them,
            including comparable sales they could not check.

            It now happens on /success, after payment, on the complete unblurred
            petition - the same post-payment flow TX/GA/AR/AL already used. Nothing
            mails until it is signed. See lib/fulfillOrder.js. */}
        <button style={allAgreed ? { ...primaryBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 } : { ...disabledBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }} onClick={allAgreed ? doCheckout : undefined} disabled={!allAgreed || checkingOut}>
          <span>{!allAgreed ? "🔒" : checkingOut ? "⏳" : "📤"}</span>
          <span>{!allAgreed ? "Agree to all terms to continue" : checkingOut ? "Redirecting to payment..." : `Continue to payment · ${totalChargeLabel} — you sign your petition next`}</span>
        </button>
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button style={{ ...secondaryBtn, width: "auto", padding: "8px 20px", fontSize: 12 }} onClick={onRestart}>Start a new dispute</button>
        </div>
      </div>
      <div className="mob-hide" style={{ position: "sticky", top: 20 }}>
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.navy, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>Where to File</div>
          {pd.appraisalDistrict ? (
            <div style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: C.bodyGray, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: C.darkNavy, marginBottom: 4, fontSize: 14 }}>{pd.appraisalDistrict.districtName}</div>
              <div>{pd.appraisalDistrict.mailingAddress}</div>
              <div>{pd.appraisalDistrict.city}, {pd.appraisalDistrict.state} {pd.appraisalDistrict.zip}</div>
              {pd.appraisalDistrict.phone && <div style={{ marginTop: 4 }}>📞 {pd.appraisalDistrict.phone}</div>}
              <div style={{ marginTop: 10, background: C.amber, border: `1px solid #FFD97A`, borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#7A5C10" }}>📅 {pd.appraisalDistrict.filingDeadlineNote}</div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif" }}>Search "{pd.county} appraisal district" to find the filing address.</div>
          )}
        </div>
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.navy, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>What Happens After You Pay</div>
          {[["💳", `Secure ${totalChargeLabel} payment`, "One-time, no recurring charges"], ["📬", "We file via certified mail", "Your letter is mailed with tracking"], ["🧾", "You receive the receipt", "USPS certified mail proof sent to you"], ["⏳", "Await the decision", "Districts respond in 30–90 days"]].map(([icon, t, d]) => (
            <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>{t}</div>
                <div style={{ fontSize: 11, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepDispute({ formData, onRestart }) {
  const [loading, setLoading] = useState(true);
  const [propData, setPropData] = useState(null);
  // Non-null when the county's own figures show an appeal cannot reduce this
  // owner's tax. See the block in run() for why this stops the sale outright.
  const [noSavings, setNoSavings] = useState(null);
  const [letter, setLetter] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const ran = useRef(false);
  const { account, property, issues, costOverrides } = formData;
  const addr = `${property.street}, ${property.city}, ${property.state} ${property.zip}`;
  const stateCode = property.state.trim().toUpperCase();

  useEffect(() => { if (ran.current) return; ran.current = true; run(); }, []);

  const run = async () => {
    setLoading(true); setErrMsg(""); setLetter(""); setPropData(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ street: property.street, city: property.city, state: property.state, zip: property.zip, manualAssessedValue: property.manualAssessedValue ? Number(String(property.manualAssessedValue).replace(/[^0-9.]/g, "")) : null, manualSqft: property.manualSqft ? Number(String(property.manualSqft).replace(/[^0-9.]/g, "")) : null, manualYearBuilt: property.manualYearBuilt || null, manualBeds: property.manualBeds || null, manualBaths: property.manualBaths || null }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || `Lookup failed (${res.status}).`); }
      const bdJson = await res.json();

      // ── THE SAVINGS GATE ────────────────────────────────────────────────
      //
      // Florida taxes flow from ASSESSED value, which Save OurHomes caps
      // (Fla. Stat. s 193.155). Reducing JUST value — which is all a VAB
      // petition can do — only reaches the tax bill once it drops below that
      // cap. Above it, winning changes nothing.
      //
      // Roughly 42% of Florida residential parcels are in that position. The
      // real Hillsborough parcel this was built against needs a 24.5% reduction
      // before a single dollar moves, and even a strong 25% result would save
      // about $57 against a $104 filing cost.
      //
      // So we stop here. Not a warning, not a disclosure — the sale does not
      // proceed. Taking $89 for an outcome that cannot occur is the thing this
      // whole data pipeline exists to prevent, and a blocked sale is recoverable
      // where a charged customer with no saving is not.
      //
      // `eligible` is only ever false when we hold county roll data for the
      // parcel. A missing lookup leaves savings null and the funnel continues as
      // before — we never refuse on absence of evidence.
      if (bdJson?.savings && bdJson.savings.eligible === false) {
        setNoSavings(bdJson.savings);
        setLoading(false);
        return;
      }

      const extracted = bdJson?.extractedData || {};
      const manualAV = property.manualAssessedValue ? Number(String(property.manualAssessedValue).replace(/[^0-9.]/g, "")) : null;
      const manualSqftNum = property.manualSqft ? Number(String(property.manualSqft).replace(/[^0-9.]/g, "")) : null;
      const assessedValue = extracted.assessedValue || manualAV || null;
      const marketValue = extracted.marketValue || null;
      const annualTax = extracted.annualTax || null;
      const county = bdJson?.resolvedCounty || `${property.city} County`;
      const taxYear = extracted.taxYear || new Date().getFullYear().toString();
      const beds = extracted.beds || (property.manualBeds ? Number(property.manualBeds) : null) || null;
      const baths = extracted.baths || (property.manualBaths ? Number(property.manualBaths) : null) || null;
      const sqft = extracted.sqft || manualSqftNum || null;
      const yearBuilt = extracted.yearBuilt || property.manualYearBuilt || null;
      const appraisalDistrict = bdJson?.appraisalDistrict || null;
      const issueCount = issues ? issues.length : 0;
      const overAssessedPct = assessedValue && marketValue && marketValue > 0 ? ((assessedValue - marketValue) / marketValue) * 100 : 0;

      // The requested reduction is DERIVED, in one state-agnostic place, and comes
      // back with the statutory grounds supporting it. It used to be
      // 0.18-0.22 + Math.random(), which meant the number the owner signs for was
      // drawn at random, the letter's claim that it reflected property-specific
      // factors was untrue, and reloading changed the ask. See lib/valuation.js.
      //
      // The 18-22% band is unchanged and is applied as a hard clamp, so this never
      // reduces the ask and never makes it conditional on finding comparable sales.
      const valuation = deriveValuation({
        stateCode,
        assessedValue,
        marketValue,
        issues,
        categoryOf: ISSUE_CATEGORY_INDEX,
        // Cost to cure needs the property, not just the value: repairs scale with
        // living area and with how the house is built. Florida gets both free
        // from the roll; elsewhere sqft alone still scales the size component.
        parcel: { jv: assessedValue, lnd_val: extracted.landValue ?? null, tot_lvg_area: sqft },
        costOverrides: costOverrides || {},
        corrections: {
          sqft: property.manualSqft || null,
          countySqft: sqft || null,
          beds: property.manualBeds || null,
          countyBeds: beds || null,
          baths: property.manualBaths || null,
          countyBaths: baths || null,
          yearBuilt: property.manualYearBuilt || null,
          countyYearBuilt: yearBuilt || null,
        },
      });
      const reductionPct = valuation.reductionPct;
      const reductionPctDisplay = valuation.reductionPctDisplay;
      const targetReduction = valuation.requestedValue;
      // THE REAL MILLAGE, NOT 1.1%.
      //
      // The placeholder produced $1,303 on a Broward property whose eligibility
      // screen had said $1,960 for the same reduction two steps earlier —
      // Broward levies 19.86 mills, not 11. Two different savings figures for one
      // property in one session is the kind of thing a customer notices and a
      // magistrate asks about.
      //
      // qualify.js already computed its scenarios at the county's actual rate, so
      // the effective rate is recovered from them rather than re-derived.
      let effectiveRate = annualTax && assessedValue ? (annualTax / assessedValue) : 0.011;
      //
      // READ FROM bdJson.savings, NOT `savings`.
      //
      // `savings` in this scope is a NUMBER, declared three lines below, so the
      // first version of this both used the wrong value and referenced it inside
      // its own temporal dead zone — "Cannot access 'savings' before
      // initialization", which reached the customer as "Lookup failed".
      // The qualify object carrying the scenarios is bdJson.savings.
      const gate = bdJson?.savings;
      const likely = gate?.scenarios?.likely;
      const likelyPct = gate?.scenarioPcts?.likely;
      if (likely?.dollarsSaved && likelyPct && assessedValue) {
        const implied = likely.dollarsSaved / (Number(assessedValue) * likelyPct);
        // Sanity-bounded: Florida millage runs roughly 11 to 24 mills, so
        // anything outside 0.3%-5% means the arithmetic upstream changed shape
        // and the placeholder is the safer answer.
        if (implied > 0.003 && implied < 0.05) effectiveRate = implied;
      }
      const savingsFromReduction = assessedValue ? Math.round((Number(assessedValue) * reductionPct) * effectiveRate) : null;
      const savingsFromMarket = assessedValue && marketValue && assessedValue > marketValue ? Math.round((assessedValue - marketValue) * effectiveRate) : null;
      const savings = savingsFromMarket || savingsFromReduction;
      const stateInfo = SUPPORTED_STATES[stateCode] || {};
      // parcelId WAS ABSENT, so the preview printed "Not listed in county
      // records" for a parcel we had already resolved and shown on the
      // eligibility screen two steps earlier. The folio number is how the Board
      // identifies the property being petitioned.
      //
      // compCount is set later, once the comps call has actually returned.
      const pd = { assessedValue, marketValue, annualTax, county, taxYear, savings, beds, baths, sqft, yearBuilt, rawAddress: addr, hasData: !!(assessedValue || marketValue), appraisalDistrict, targetReduction, reductionPctDisplay, parcelId: extracted.parcelId || extracted.apn || null, compCount: 0, compsReason: null, askRestsOn: valuation.askRestsOn, cureTotal: cure.total, valuationGrounds: valuation.grounds, valuationBasis: valuation.basisSummary };
      setPropData(pd);
      const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : null;
      const propDetails = [sqft ? `Square Footage: ${Number(sqft).toLocaleString()} sq ft` : null, yearBuilt ? `Year Built: ${yearBuilt}` : null, beds ? `Bedrooms: ${beds}` : null, baths ? `Bathrooms: ${baths}` : null, property.propType ? `Property Type: ${property.propType}` : null, sqft && assessedValue ? `Assessed Price Per Sq Ft: $${Math.round(Number(assessedValue) / Number(sqft))}` : null].filter(Boolean).join("\n");
      // The defects block now carries what each repair costs and where the figure
      // came from. A cited cost is arguable; a bare list of complaints is not.
      // Incurable conditions are listed separately and explicitly at no cost, so
      // the letter cannot imply we priced something we did not.
      const cure = totalCostToCure(issues, { jv: assessedValue, lnd_val: extracted.landValue ?? null, tot_lvg_area: sqft }, costOverrides || {});
      const curedLines = cure.priced.map(c =>
        `• ${c.issue}\n    Remedy: ${c.scope}\n    Cost to cure: $${c.asked.toLocaleString()}${c.ownerSupplied ? " (owner's own contractor estimate)" : ` (source: ${c.source}, ${c.sourceYear})`}`
      ).join("\n");
      const narrativeLines = cure.narrative.map(n => `• ${n.issue} \u2014 ${n.narrative}`).join("\n");
      const issuesBlock = issues && issues.length > 0
        ? [
            cure.priced.length ? `PROPERTY DEFECTS, PRICED AT COST TO CURE (cite each, with its cost and its source):\n${curedLines}\n\nTOTAL COST TO CURE: $${cure.total.toLocaleString()}` : "",
            cure.narrative.length ? `CONDITIONS THAT CANNOT BE CURED BY EXPENDITURE (cite as support for the value argument, and state explicitly that NO cost to cure is claimed for them):\n${narrativeLines}` : "",
            cure.disproportionate ? `NOTE: the total cost to cure is ${Math.round(cure.shareOfValue * 100)}% of the assessed value. Address this directly rather than leaving it unexplained.` : "",
          ].filter(Boolean).join("\n\n")
        : "No specific property issues reported beyond general market value discrepancy.";

      // WHICH GROUND THE DEMAND RESTS ON. When the priced evidence comes to less
      // than the floor, the ask is supported by the mass-appraisal ground and the
      // letter must say so. Crediting $900,000 to a $121,900 air conditioner is
      // the sentence that loses the petition.
      const askBasis = valuation.askRestsOn === 'evidence'
        ? `The requested reduction of ${reductionPctDisplay}% is supported by the grounds itemised above. Attribute it to them.`
        : `IMPORTANT: the requested reduction of ${reductionPctDisplay}% is NOT derived from the repair costs above, which total ${fmt(cure.total) || "$0"}. It rests on the ground that the assessment was produced by mass appraisal without examination of this specific property. State that as the basis for the requested figure. Present the repair costs as additional supporting evidence of over-valuation, and do NOT claim the requested figure was calculated from them.`;
      const districtBlock = appraisalDistrict ? `FILING DESTINATION:\n${appraisalDistrict.districtName}\n${appraisalDistrict.mailingAddress}\n${appraisalDistrict.city}, ${appraisalDistrict.state} ${appraisalDistrict.zip}\n${appraisalDistrict.phone ? "Phone: " + appraisalDistrict.phone : ""}\nProtest Deadline: ${appraisalDistrict.filingDeadlineNote || stateInfo.deadlineNote || "Check with district"}` : `FILE WITH: ${county} Appraisal District\nDeadline: ${stateInfo.deadlineNote || "Check with district"}`;
      const arNote = stateCode === 'AR' ? '\n\nARKANSAS-SPECIFIC RULES:\n- Arkansas assesses property at 20% of market value. The appeal targets MARKET VALUE, not the 20% assessed figure.\n- Address to: Secretary, ' + county + ' County Board of Equalization\n- Cite Arkansas Code ss.26-27-317 (appeal rights) and ss.26-26-1901 (market value standard)\n- The Board meets in August - emphasize timely filing and postmark date\n- Do NOT mention ARB or appraisal districts - use "Board of Equalization" and "county assessor"' : '';
      const prompt = `You are a property tax attorney writing a formal protest letter. Output ONLY the letter — no preamble, no markdown, no explanation.\n\nPROPERTY OWNER: ${account.firstName} ${account.lastName}\nOWNER EMAIL: ${account.email}\nPROPERTY ADDRESS: ${addr}\nCOUNTY: ${county}\nSTATE: ${property.state.toUpperCase()}\nTAX YEAR: ${taxYear}\n\nSUBJECT PROPERTY CHARACTERISTICS:\n${propDetails || "See county records"}\nCurrent Assessed Value: ${fmt(assessedValue) || "See records"}\nEstimated Market Value: ${fmt(marketValue) || "N/A"}\nAnnual Tax Bill: ${fmt(annualTax) || "N/A"}\nRequested Reduction: ${reductionPctDisplay}% — from ${fmt(assessedValue)} to ${fmt(targetReduction)}\nJustification basis (cite these, do not invent others):\n${valuation.basisSummary}\n\n${issuesBlock}\n\n${askBasis}\n\n${districtBlock}\n\nOWNER NOTES: ${property.notes || "None."}${arNote}\n\nLETTER REQUIREMENTS:\n1. Open with owner contact block: [Owner Full Name], [Owner Property Address], [Owner Email]\n2. Date: June 15, 2026\n3. Recipient address block\n4. RE: NOTICE OF PROTEST OF PROPERTY VALUATION\n5. Section SUBJECT PROPERTY DESCRIPTION: list every characteristic with exact numbers\n6. Section PROPERTY DEFECTS & CONDITIONS: cite each defect with its stated cost to cure and name the source of that cost. List non-curable conditions separately and state that no cost to cure is claimed for them. Never state a cost that is not given above.\n7. Section COMPARABLE SALES EVIDENCE: 4-5 recent sales from ZIP ${property.zip}\n8. Section MARKET CONDITIONS: local market trends\n9. Section LEGAL BASIS: cite ${stateInfo.statute || "applicable state statutes"}\n10. Demand ${reductionPctDisplay}% reduction from ${fmt(assessedValue)} to ${fmt(targetReduction)}, attributing it exactly as instructed in the paragraph above beginning "The requested reduction" or "IMPORTANT". Do NOT claim the figure derives from comparable sales unless comparable sales are actually listed in section 7.\n11. Professional closing with owner name, address, and email address. Below the owner signature block, on its own line, include exactly this sentence: "Please direct all correspondence and decisions regarding this protest to the property owner at the email address above, with a copy to: disputes@taxappealusa.com (Document Preparation Service)."\n\nOutput ONLY the complete formal letter.`;
      // Florida: use generate-dr486 (official DR-486; the OWNER signs Part 3 and
    // Parts 4/5 are left N/A — TaxAppeal is never the representative)
      // All other states: use generate-letter (free-form protest letter)
      let claudeJson;
      if (stateCode === 'FL') {
        const flSig = formData.flSignature || {};

        // Real comparable sales from the county's own sale data file. Fetched
        // here rather than inside generate-dr486 so a comps failure can never
        // block the petition — no comps means the petition argues methodology
        // alone, exactly as it did before, and never invents any.
        let flComps = null;
        try {
          const cRes = await fetch('/api/comps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ street: property.street, city: property.city, state: 'FL', zip: property.zip }),
          });
          if (cRes.ok) {
            const cJson = await cRes.json();
            // Only a set that is BOTH sufficient and actually supports a
            // reduction may reach the petition. Comps indicating a value above
            // the county's would be evidence against our own customer.
            if (cJson?.sufficient && cJson?.supportsReduction !== false && Array.isArray(cJson.comps)) {
              flComps = cJson.comps;
            }
            // The count the summary card shows. Zero when the engine declined —
            // including when the subject's own sale refuted the comps, which is
            // the case the hardcoded "4–5" used to paper over.
            pd.compCount = Array.isArray(flComps) ? flComps.length : 0;
            // Why there are none, so the customer gets the actual reason rather
            // than a bare zero next to the price.
            pd.compsReason = pd.compCount === 0 ? (cJson?.reason || 'none') : null;
          }
        } catch (e) {
          console.log('comps unavailable, filing on methodology alone:', e?.message);
        }

        const dr486Res = await fetch("/api/generate-dr486", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerFirstName: account.firstName,
            ownerLastName: account.lastName,
            ownerEmail: account.email,
            ownerStreet: property.street,
            ownerCity: property.city,
            ownerState: property.state,
            ownerZip: property.zip,
            comps: flComps,
            // Which ground supports the ask, and how much of it the priced
            // defects actually account for. Without these the petition described
            // an 18% floor-based figure as "assessed value less cost to cure".
            askRestsOn: valuation.askRestsOn,
            costToCureTotal: cure.total,
            propertyAddress: addr,
            county,
            assessedValue,
            requestedValue: targetReduction,
            valuationBasis: valuation.basisSummary,
            valuationGrounds: valuation.grounds,
            taxYear,
            issues,
            propertyDetails: propDetails,
            notes: property.notes,
            zip: property.zip,
            // Preparer model: the OWNER signs Part 3. These are the owner's
            // signature, not a representative authorization. See the header of
            // pages/api/generate-dr486.js for why this distinction is load-bearing.
            // PREVIEW: build the petition unsigned so the owner can read it before
            // attesting that they have read it. The signature is captured on the
            // review screen below and the document is re-rendered with it.
            preview: true,
            ownerPhone: account.phone || '',
            parcelId: extracted.parcelId || extracted.apn || '',
          }),
        });
        claudeJson = await dr486Res.json();
        if (claudeJson.error) throw new Error(claudeJson.error);
        // For FL: letter display shows evidence text; letterKey points to full DR-486 HTML
        setLetter(claudeJson.evidenceText || '');
        if (claudeJson.letterKey) pd.letterKey = claudeJson.letterKey;
        pd.isFL = true;
        pd.evidenceText = claudeJson.evidenceText || '';
        pd.dr486Preview = claudeJson.dr486Html || '';
      } else if (stateCode === 'GA') {
        const gaRes = await fetch("/api/generate-pt311a", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerFirstName: account.firstName,
            ownerLastName: account.lastName,
            ownerEmail: account.email,
            ownerStreet: property.street,
            ownerCity: property.city,
            ownerState: property.state,
            ownerZip: property.zip,
            propertyAddress: addr,
            county,
            assessedValue,
            requestedValue: targetReduction,
            valuationBasis: valuation.basisSummary,
            valuationGrounds: valuation.grounds,
            taxYear,
            issues,
            propertyDetails: propDetails,
            notes: property.notes,
            districtName: appraisalDistrict?.districtName || '',
            zip: property.zip,
            gaSignatureDate: new Date().toISOString().split('T')[0],
          }),
        });
        claudeJson = await gaRes.json();
        if (claudeJson.error) throw new Error(claudeJson.error);
        setLetter(claudeJson.evidenceText || '');
        if (claudeJson.letterKey) pd.letterKey = claudeJson.letterKey;
        pd.isGA = true;
      } else {
        const claudeRes = await fetch("/api/generate-letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr, county, assessedValue, zip: property.zip, state: property.state, letterInputs: { ownerName: `${account.firstName} ${account.lastName}`, ownerEmail: account.email, taxYear, propertyDetails: propDetails, marketValue, annualTax, targetReduction, reductionPctDisplay, issues, notes: property.notes, districtBlock, deadlineNote: stateInfo.deadlineNote, statute: stateInfo.statute } }) });
        claudeJson = await claudeRes.json();
        if (claudeJson.error) throw new Error(claudeJson.error);
        if (!claudeJson.letter) throw new Error("Letter generation returned empty.");
        setLetter(claudeJson.letter);
        if (claudeJson.letterKey) pd.letterKey = claudeJson.letterKey;
      }
      setLoading(false);
    } catch (e) {
      setErrMsg(e.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  // Refused BEFORE the letter is generated and before any charge. Deliberately
  // not styled as an error — nothing went wrong, and the customer is being told
  // something genuinely useful that nobody else in this market will tell them.
  if (noSavings) {
    const fmtUsd = (n) => (n || n === 0 ? `$${Number(n).toLocaleString()}` : '—');
    return (
      <div style={{ maxWidth: 620, margin: "60px auto", padding: "0 24px" }}>
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 12 }}>
            An appeal wouldn&rsquo;t lower your tax bill
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.65, color: C.body, marginBottom: 18 }}>
            {noSavings.message}
          </p>
          <div style={{ background: "#FFF8E6", border: "1px solid #F0DFB0", borderRadius: 8, padding: 16, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontFamily: "'DM Sans', sans-serif", padding: "5px 0", color: C.body }}>
              <span>Market (just) value</span><strong style={{ color: C.darkNavy }}>{fmtUsd(noSavings.jv)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontFamily: "'DM Sans', sans-serif", padding: "5px 0", color: C.body }}>
              <span>Your assessment is capped at</span><strong style={{ color: C.darkNavy }}>{fmtUsd(noSavings.breakEven)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontFamily: "'DM Sans', sans-serif", padding: "5px 0", color: C.body }}>
              <span>Capped below market by</span><strong style={{ color: C.darkNavy }}>{fmtUsd(noSavings.differential)}</strong>
            </div>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.65, color: C.muted, marginBottom: 20 }}>
            You haven&rsquo;t been charged. Check these figures against your TRIM notice — they come
            straight from your county&rsquo;s own records and should match exactly. This can change:
            buying or selling resets the cap, and a falling market brings your market value back
            toward the capped figure.
          </p>
          <button style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }} onClick={onRestart}>← Check a different property</button>
        </div>
      </div>
    );
  }

  if (errMsg) {
    return (
      <div style={{ maxWidth: 520, margin: "80px auto", padding: "0 24px" }}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: C.darkNavy, marginBottom: 8 }}>Lookup failed</h2>
          <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: C.red, fontFamily: "'DM Sans', sans-serif", marginBottom: 20, textAlign: "left" }}>{errMsg}</div>
          <button style={primaryBtn} onClick={() => { ran.current = false; run(); ran.current = true; }}>Try Again</button>
          <div style={{ marginTop: 12 }}><button style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }} onClick={onRestart}>← Start over</button></div>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingScreen addr={addr} />;
  // flSignature MUST be forwarded. Without it DisputeLetter sends empty
  // flSignatureName to /api/checkout, which means /api/send-letter rejects the
  // order with "Protest has not been signed by the owner" AFTER the customer has
  // already paid — no petition mailed, no check mailed, no confirmation email,
  // and save-order still writes dispute_status 'filed'. This omission broke 100%
  // of Florida orders.
  return <DisputeLetter propData={propData} letter={letter} issues={issues} onRestart={onRestart} account={account} property={property} flSignature={formData.flSignature} />;
}

/**
 * Shown when we cannot safely file in the customer's Florida county — either the
 * county couldn't be resolved from the address, or it's a county whose Value
 * Adjustment Board mailing address we haven't verified directly with the county.
 *
 * We deliberately stop the sale here rather than proceeding on a guess. A blocked
 * sale is recoverable; a petition mailed to the wrong office is not — Florida's
 * 25-day window is a hard receipt deadline and a missed one costs the homeowner
 * the entire tax year.
 */
/**
 * County picker. Replaces a dead end.
 *
 * When /api/resolve-county could not place the address, this screen used to be
 * terminal: a "we need your county" message, an email address, and a Back button.
 * The customer was lost. Nathan hit it on four consecutive Florida addresses -
 * not because the addresses were unusual, but because the Census geocoder was
 * degraded for a few minutes and one timeout was treated as unknowable.
 *
 * A DROPDOWN, never a free-text field. County determines the filing fee, the
 * check payee, and which government office receives the petition. "Miami" instead
 * of "Miami-Dade", or a misspelled "Hillsborough", means we mail a petition and a
 * cheque to the wrong clerk while the customer believes they have filed - a worse
 * failure than the one this screen exists to fix.
 */
function FloridaCountyPicker({ info, onConfirm, onBack }) {
  const [picked, setPicked] = useState(info.county || '');
  const counties = FL_COUNTY_NAMES;

  return (
    <div style={{ maxWidth: 560, margin: "48px auto", padding: "0 20px" }}>
      <div style={{ fontSize: 40, marginBottom: 16, textAlign: "center" }}>🗺️</div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, textAlign: "center" }}>
        Which Florida county is this property in?
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "#444", marginBottom: 24, textAlign: "center" }}>
        {info.message}
      </p>

      <label style={{ display: "block", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#5A6B82", fontWeight: 500, marginBottom: 6 }}>
        County
      </label>
      <select
        value={picked}
        onChange={(e) => setPicked(e.target.value)}
        style={{ width: "100%", background: "#F8FAFD", border: "1.5px solid #DDE4EE", borderRadius: 7, padding: "12px 13px", fontSize: 15, color: "#0F1F3D", marginBottom: 8 }}
      >
        <option value="">Select your county…</option>
        {counties.map((c) => <option key={c} value={c}>{c} County</option>)}
      </select>
      <p style={{ fontSize: 12, color: "#8596AF", lineHeight: 1.6, marginBottom: 22 }}>
        Your county sets the filing fee, who the fee cheque is made out to, and which
        Value Adjustment Board receives your petition — so this has to be right. It is on
        your TRIM notice and your tax bill.
      </p>

      <button
        onClick={() => picked && onConfirm(picked)}
        disabled={!picked}
        style={{ width: "100%", padding: "14px 28px", borderRadius: 8, border: "none", background: picked ? "#1B3A6B" : "#C5D0E0", color: "#fff", fontSize: 15, fontWeight: 500, cursor: picked ? "pointer" : "not-allowed", marginBottom: 10 }}
      >
        Continue with {picked ? `${picked} County` : "my county"}
      </button>
      <button onClick={onBack} style={{ width: "100%", padding: "12px 28px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", fontSize: 14, color: "#5A6B82", cursor: "pointer" }}>
        ← Back
      </button>
    </div>
  );
}

function ApplyFunnel() {
  const [step, setStep] = useState("account");
  const [account, setAccount] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [property, setProperty] = useState({ street: "", city: "", state: "", zip: "", propType: "", yearBuilt: "", notes: "", manualAssessedValue: "", manualSqft: "", manualYearBuilt: "", manualBeds: "", manualBaths: "" });

  /**
   * Prefill the property from /check, so a Florida customer types their address
   * once rather than twice.
   *
   * The value came from the county roll via /check, so it is guaranteed to
   * resolve here — unlike free text, which may not. Read once and cleared, so a
   * later visit does not silently inherit a previous property: someone appealing
   * two houses would otherwise file the second petition against the first
   * address, and the address is the one field on a sworn petition nobody
   * re-reads.
   *
   * Every field stays editable. This is a prefill, never a lock.
   */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ta_property');
      if (!raw) return;
      sessionStorage.removeItem('ta_property');
      const p = JSON.parse(raw);
      if (!p?.street) return;
      setProperty((prev) => ({
        ...prev,
        street: p.street || prev.street,
        city: p.city || prev.city,
        state: p.state || prev.state,
        zip: p.zip || prev.zip,
      }));
    } catch {
      // A malformed or unreadable value must never block the funnel — the
      // customer can still type the address, which is where we were before.
    }
  }, []);
  const [issues, setIssues] = useState([]);
  // Owner-entered repair costs, keyed by issue label. A value here always beats
  // the computed default — they have the quote, we have a regional average.
  const [costOverrides, setCostOverrides] = useState({});
  const [notes, setNotes] = useState("");
  const [unsupportedState, setUnsupportedState] = useState(null);
  const [closedWindow, setClosedWindow] = useState(null);
  const [flFeeData, setFlFeeData] = useState(null);
  const [flSignature, setFlSignature] = useState(null);
  const [resolvingCounty, setResolvingCounty] = useState(false);
  const [flCountyError, setFlCountyError] = useState(null);

  /**
   * Resolve the real county BEFORE showing the Florida fee/authorization step.
   *
   * The fee amount, the check payee, the county named in the signed attestation,
   * and the mailing address are all keyed on county. Previously this step ran
   * before any county lookup, so it fell back to property.city — getFlVabFee("Miami")
   * missed the table and defaulted to $50 / "Board of County Commissioners", while
   * Stripe charged Miami-Dade's real $15 and the check went to the Clerk of the VAB.
   * The customer typed their legal name to attest to numbers that were all wrong.
   */
  const goToFloridaFeeStep = async () => {
    setResolvingCounty(true);
    setFlCountyError(null);
    try {
      const r = await fetch('/api/resolve-county', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ street: property.street, city: property.city, state: property.state, zip: property.zip }),
      });
      const j = await r.json();

      if (!j.found || !j.county) {
        setFlCountyError({
          kind: 'pick',
          county: '',
          message: "We couldn't confirm your county automatically — the county lookup service didn't respond. Please pick it below and we'll carry on.",
        });
        return;
      }

      const feeInfo = getFlVabFee(j.county);

      // A zip-centroid match resolved the ZIP, not the property. Most Florida ZIPs
      // sit inside one county but some straddle a line, and county drives the fee,
      // the cheque payee and which office receives the petition - so this one gets
      // confirmed explicitly rather than accepted silently.
      if (j.confidence === 'zip') {
        setFlCountyError({
          kind: 'pick',
          county: j.county,
          message: `We matched your ZIP code to ${j.county} County, but not your exact street address — please confirm this is right, or pick the correct county.`,
        });
        return;
      }

      applyResolvedCounty(j.county, j.source || 'address');
    } catch (e) {
      setFlCountyError({ kind: 'error', message: 'We had trouble looking up your county. Please try again in a moment.' });
    } finally {
      setResolvingCounty(false);
    }
  };
  /**
   * Accept a county — resolved automatically or chosen by the customer — and move
   * on to the fee step.
   *
   * Counties whose VAB mailing address we have NOT confirmed directly with the
   * county used to be a hard block. Nathan's call is to accept those orders and
   * file them by hand. That is fine commercially, but it must not be silent: the
   * automated mail path refuses an unconfirmed address (getFlVabAddress returns
   * null and send-letter rejects), so without a flag the customer would pay, see
   * "filed", and nothing would ever go out. `needsManualFiling` rides with the
   * order so it lands in the ops queue instead of the automated one.
   */
  const applyResolvedCounty = (county, source = 'address') => {
    const feeInfo = getFlVabFee(county);
    const verified = isFlCountySupported(county);
    setProperty(p => ({ ...p, county }));
    setFlFeeData({ ...feeInfo, county, needsManualFiling: !verified, countySource: source });
    setFlCountyError(null);
    setStep('florida-fee');
    window.scrollTo(0, 0);
  };

  const upd = (setObj) => (key, val) => setObj(p => ({ ...p, [key]: val }));
  const toggleIssue = (issue) => setIssues(prev => prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue]);
  // null clears the override and restores the computed figure.
  const setCost = (issue, value) => setCostOverrides(prev => {
    const next = { ...prev };
    if (value == null || String(value).trim() === '') delete next[issue];
    else next[issue] = String(value).replace(/[^0-9]/g, '');
    return next;
  });
  const restart = () => {
    setStep("account");
    setAccount({ firstName: "", lastName: "", email: "", password: "" });
    setProperty({ street: "", city: "", state: "", zip: "", propType: "", yearBuilt: "", notes: "", manualAssessedValue: "", manualSqft: "", manualYearBuilt: "", manualBeds: "", manualBaths: "" });
    setIssues([]); setCostOverrides({}); setNotes(""); setUnsupportedState(null); setClosedWindow(null); setFlFeeData(null); setFlSignature(null);
  };

  // Capture referral code and pre-fill state from URL params on mount.
  // ?state=FL from florida.js CTAs pre-selects Florida in the property step.
  // ?gclid / ?utm_* are stored in sessionStorage for Google Ads attribution.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('taxappeal_ref', ref);
    const stateParam = params.get('state');
    if (stateParam) setProperty(p => ({ ...p, state: stateParam.toUpperCase() }));
    // Store UTM params for attribution
    const utmKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid'];
    const hasUtm = utmKeys.some(k => params.get(k));
    if (hasUtm) {
      const utmStr = utmKeys.filter(k => params.get(k)).map(k => `${k}=${params.get(k)}`).join('&');
      try { sessionStorage.setItem('taxappeal_utm', utmStr); } catch(_) {}
    }
  }, []);

  return (
    <div style={base}>
      {/* dangerouslySetInnerHTML, not a text child.
          React escapes text children, so the apostrophes in @import url('...')
          became &#x27; in the server HTML and stayed literal on the client. The
          two strings differ, React reports "Text content does not match
          server-rendered HTML", and the dev overlay covers the whole page. The
          CSS is a constant in this file, not user input. */}
      <style dangerouslySetInnerHTML={{ __html: `
        ${FONT_IMPORT}
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder, textarea::placeholder { color: #B0BECF; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #1B3A6B !important; background: #FFFFFF !important; }
        button:hover:not(:disabled) { opacity: 0.88; }
        button:active:not(:disabled) { transform: scale(0.98); }
        textarea { font-family: 'DM Sans', sans-serif !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #C5D0E0; border-radius: 3px; }
        a { text-decoration: none; }
        .page-grid { display: grid; grid-template-columns: 1fr 360px; gap: 48px; align-items: start; max-width: 900px; margin: 0 auto; padding: 48px 40px; }
        .page-grid-sm { display: grid; grid-template-columns: 1fr 340px; gap: 48px; align-items: start; max-width: 900px; margin: 0 auto; padding: 48px 40px; }
        .page-grid-issues { display: grid; grid-template-columns: 1fr 300px; gap: 48px; align-items: start; max-width: 900px; margin: 0 auto; padding: 48px 40px; }
        .page-grid-letter { display: grid; grid-template-columns: 1fr 320px; gap: 48px; align-items: start; max-width: 900px; margin: 0 auto; padding: 48px 40px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .three-col { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
        .three-col-equal { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .two-col-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .mob-hide { display: block; }
        .stat-flex { display: flex; align-items: center; gap: 20px; }
        .price-flex { display: flex; align-items: center; gap: 20px; }
        @media (max-width: 768px) {
          .page-grid, .page-grid-sm, .page-grid-issues, .page-grid-letter { grid-template-columns: 1fr !important; padding: 20px 16px !important; gap: 20px !important; }
          .mob-hide { display: none !important; }
          .three-col { grid-template-columns: 1fr 1fr !important; }
          .three-col-equal { grid-template-columns: 1fr 1fr !important; }
          .stat-flex { flex-direction: column !important; text-align: center !important; gap: 12px !important; }
          .price-flex { flex-direction: column !important; gap: 12px !important; }
          .step-label { display: none !important; }
          .progress-bar-wrap { padding: 12px 16px !important; }
          .announcement-bar-inner { font-size: 11px !important; padding: 8px 12px !important; }
          .card-padding { padding: 20px 16px !important; }
          h1.hero { font-size: 26px !important; }
        }
        @media (max-width: 480px) {
          .two-col { grid-template-columns: 1fr !important; }
          .three-col { grid-template-columns: 1fr !important; }
        }
      ` }} />
      <AnnouncementBar />
      <NavBar step={step} />
      {!unsupportedState && <ProgressBar currentStep={step} />}
      {flCountyError ? (
        <FloridaCountyPicker
          info={flCountyError}
          onConfirm={(c) => applyResolvedCounty(c, 'customer-picked')}
          onBack={() => setFlCountyError(null)}
        />
      ) : closedWindow ? (
        <FilingWindowClosed stateCode={closedWindow.stateCode} windowStatus={closedWindow.windowStatus} onBack={() => setClosedWindow(null)} account={account} property={property} />
      ) : unsupportedState ? (
        <UnsupportedState stateCode={unsupportedState} onBack={() => setUnsupportedState(null)} />
      ) : (
        <>
          {step === "account" && <StepAccount data={account} onChange={upd(setAccount)} onNext={() => { setStep("property"); window.scrollTo(0,0); }} />}
          {step === "property" && <StepProperty data={property} onChange={upd(setProperty)} onNext={() => { const sc = property.state.trim().toUpperCase(); setStep(sc === 'FL' ? 'florida-check' : 'issues'); window.scrollTo(0,0); }} onBack={() => { setStep("account"); window.scrollTo(0,0); }} onUnsupportedState={s => setUnsupportedState(s)} onClosedWindow={(sc, ws) => setClosedWindow({ stateCode: sc, windowStatus: ws })} />}
          {step === "florida-check" && <StepFloridaCheck property={property} onEligible={() => { setStep("issues"); window.scrollTo(0,0); }} onBack={() => { setStep("property"); window.scrollTo(0,0); }} />}
          {step === "issues" && <StepIssues selectedIssues={issues} onToggle={toggleIssue} property={property} costOverrides={costOverrides} onCostChange={setCost} onNext={() => { const sc = property.state.trim().toUpperCase(); if (sc === 'FL') { goToFloridaFeeStep(); } else { setStep('dispute'); window.scrollTo(0,0); } }} onBack={() => { setStep("property"); window.scrollTo(0,0); }} stateCode={property.state.trim().toUpperCase()} notes={notes} onNotesChange={setNotes} />}
          {step === "florida-fee" && <StepFloridaFee feeData={flFeeData} property={property} account={account} onAuthorize={(sig) => { setFlSignature(sig); setStep("dispute"); window.scrollTo(0,0); }} onBack={() => { setStep("issues"); window.scrollTo(0,0); }} onChangeCounty={() => setFlCountyError({ kind: "pick", county: property.county || "", message: "Pick the county this property is in. It sets your filing fee and which Value Adjustment Board receives your petition." })} />}
          {step === "dispute" && <StepDispute formData={{ account, property: { ...property, notes }, issues, costOverrides, flSignature }} onRestart={restart} />}
        </>
      )}
    </div>
  );
}

/**
 * SALES PAUSED -> the funnel never mounts.
 *
 * A wrapper rather than an early return inside ApplyFunnel, so no hook is ever
 * skipped: this component calls none, and the branch is a build-time constant.
 *
 * Not mounting the funnel matters beyond hiding a button. ApplyFunnel calls
 * /api/autocomplete on keystrokes, /api/lookup (BatchData + Google + Anthropic),
 * and /api/generate-dr486 or /api/generate-letter — all before checkout, all
 * billed. Hiding only the pay button would have kept every one of those calls
 * running for visitors who now have nothing to buy.
 *
 * lib/salesGate.js is still what makes a CHARGE impossible; a stale tab or a
 * direct POST bypasses this file entirely. This is the experience, that is the
 * guarantee, and they read the same variable so they cannot drift — the build
 * fails if SALES_ENABLED and NEXT_PUBLIC_SALES_ENABLED disagree.
 */
export default function App() {
  if (process.env.NEXT_PUBLIC_SALES_ENABLED !== 'true') return <WaitlistForm />;
  return <ApplyFunnel />;
}
