import { useState, useEffect, useRef } from "react";
import StepFloridaFee, { getFlVabFee } from '../components/StepFloridaFee';
import { isFlCountySupported } from '../lib/flVabAddresses';
import { getFilingWindowStatus } from '../lib/filingWindows';

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

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
  const idx = STEPS.indexOf(currentStep);
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

function AddressAutocomplete({ value, onChange, onSelect }) {
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
        const res = await fetch("/api/autocomplete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: val }) });
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setShow((data.suggestions || []).length > 0);
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
          <AddressAutocomplete value={data.street} onChange={val => onChange("street", val)} onSelect={s => { onChange("street", s.street); if (s.city) onChange("city", s.city); if (s.state) onChange("state", s.state); if (s.zip) onChange("zip", s.zip); }} />
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

function StepIssues({ selectedIssues, onToggle, onNext, onBack, stateCode, notes, onNotesChange }) {
  const count = selectedIssues.length;
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
                return (
                  <div key={issue} onClick={() => onToggle(issue)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${selected ? C.navy : C.border}`, background: selected ? C.lightBlue : C.white, cursor: "pointer", transition: "all 0.15s" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${selected ? C.navy : "#C5D0E0"}`, background: selected ? C.navy : C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.white, fontWeight: 700 }}>{selected ? "✓" : ""}</div>
                    <span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: selected ? C.darkNavy : "#3D4F66", fontWeight: selected ? 500 : 400 }}>{issue}</span>
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
              ["4–5", "Comparable sales cited"],
              [issues.length.toString(), "Issues cited in letter"],
            ].map(([val, label]) => (
              <div key={label}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.gold }}>{val}</div>
                <div style={{ fontSize: 12, color: "#5A7A9F", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid #1E2D45`, paddingTop: 12, fontSize: 12, color: "#5A7A9F", fontFamily: "'DM Sans', sans-serif" }}>
            ⚖️ Drafted under {stateInfo.statute || "applicable state statutes"} · {pd.appraisalDistrict?.districtName || pd.county}
          </div>
        </div>
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>Dispute Letter Preview</div>
            {pd.appraisalDistrict && <div style={{ background: C.lightBlue, color: C.navy, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif" }}>{pd.appraisalDistrict.districtName}</div>}
          </div>
          <div style={{ padding: "16px", fontFamily: "Georgia, serif", fontSize: 13, lineHeight: 1.85, color: C.darkNavy, background: C.white, whiteSpace: "pre-wrap", overflowX: "hidden" }}>{visibleLines}</div>
          <div style={{ position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80, background: `linear-gradient(to bottom, rgba(255,255,255,0.97), transparent)`, zIndex: 2 }} />
            <div style={{ padding: "0 24px 20px", fontFamily: "Georgia, serif", fontSize: 13, lineHeight: 1.85, color: C.darkNavy, background: C.white, filter: "blur(4px)", opacity: 0.6, userSelect: "none", whiteSpace: "pre-wrap" }}>{blurredLines || "Your complete dispute letter will be emailed to you after payment..."}</div>
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
  const [letter, setLetter] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const ran = useRef(false);
  const { account, property, issues } = formData;
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
      let reductionPct;
      if (issueCount >= 5 || overAssessedPct >= 15) reductionPct = 0.22 + (Math.random() * 0.02);
      else if (issueCount >= 3 || overAssessedPct >= 8) reductionPct = 0.20 + (Math.random() * 0.02);
      else if (issueCount >= 1) reductionPct = 0.19 + (Math.random() * 0.015);
      else reductionPct = 0.18 + (Math.random() * 0.015);
      const reductionPctDisplay = Math.round(reductionPct * 100);
      const targetReduction = assessedValue ? Math.round(Number(assessedValue) * (1 - reductionPct)) : null;
      const effectiveRate = annualTax && assessedValue ? (annualTax / assessedValue) : 0.011;
      const savingsFromReduction = assessedValue ? Math.round((Number(assessedValue) * reductionPct) * effectiveRate) : null;
      const savingsFromMarket = assessedValue && marketValue && assessedValue > marketValue ? Math.round((assessedValue - marketValue) * effectiveRate) : null;
      const savings = savingsFromMarket || savingsFromReduction;
      const stateInfo = SUPPORTED_STATES[stateCode] || {};
      const pd = { assessedValue, marketValue, annualTax, county, taxYear, savings, beds, baths, sqft, yearBuilt, rawAddress: addr, hasData: !!(assessedValue || marketValue), appraisalDistrict, targetReduction, reductionPctDisplay };
      setPropData(pd);
      const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : null;
      const propDetails = [sqft ? `Square Footage: ${Number(sqft).toLocaleString()} sq ft` : null, yearBuilt ? `Year Built: ${yearBuilt}` : null, beds ? `Bedrooms: ${beds}` : null, baths ? `Bathrooms: ${baths}` : null, property.propType ? `Property Type: ${property.propType}` : null, sqft && assessedValue ? `Assessed Price Per Sq Ft: $${Math.round(Number(assessedValue) / Number(sqft))}` : null].filter(Boolean).join("\n");
      const issuesBlock = issues && issues.length > 0 ? `PROPERTY DEFECTS & ISSUES (cite each one in the letter):\n${issues.map(i => `• ${i}`).join("\n")}` : "No specific property issues reported beyond general market value discrepancy.";
      const districtBlock = appraisalDistrict ? `FILING DESTINATION:\n${appraisalDistrict.districtName}\n${appraisalDistrict.mailingAddress}\n${appraisalDistrict.city}, ${appraisalDistrict.state} ${appraisalDistrict.zip}\n${appraisalDistrict.phone ? "Phone: " + appraisalDistrict.phone : ""}\nProtest Deadline: ${appraisalDistrict.filingDeadlineNote || stateInfo.deadlineNote || "Check with district"}` : `FILE WITH: ${county} Appraisal District\nDeadline: ${stateInfo.deadlineNote || "Check with district"}`;
      const arNote = stateCode === 'AR' ? '\n\nARKANSAS-SPECIFIC RULES:\n- Arkansas assesses property at 20% of market value. The appeal targets MARKET VALUE, not the 20% assessed figure.\n- Address to: Secretary, ' + county + ' County Board of Equalization\n- Cite Arkansas Code ss.26-27-317 (appeal rights) and ss.26-26-1901 (market value standard)\n- The Board meets in August - emphasize timely filing and postmark date\n- Do NOT mention ARB or appraisal districts - use "Board of Equalization" and "county assessor"' : '';
      const prompt = `You are a property tax attorney writing a formal protest letter. Output ONLY the letter — no preamble, no markdown, no explanation.\n\nPROPERTY OWNER: ${account.firstName} ${account.lastName}\nOWNER EMAIL: ${account.email}\nPROPERTY ADDRESS: ${addr}\nCOUNTY: ${county}\nSTATE: ${property.state.toUpperCase()}\nTAX YEAR: ${taxYear}\n\nSUBJECT PROPERTY CHARACTERISTICS:\n${propDetails || "See county records"}\nCurrent Assessed Value: ${fmt(assessedValue) || "See records"}\nEstimated Market Value: ${fmt(marketValue) || "N/A"}\nAnnual Tax Bill: ${fmt(annualTax) || "N/A"}\nRequested Reduction: ${reductionPctDisplay}% — from ${fmt(assessedValue)} to ${fmt(targetReduction)}\nJustification basis: ${issueCount} property issue${issueCount !== 1 ? "s" : ""} documented${overAssessedPct > 0 ? ", property over-assessed by approx " + Math.round(overAssessedPct) + "% vs market" : ""}\n\n${issuesBlock}\n\n${districtBlock}\n\nOWNER NOTES: ${property.notes || "None."}${arNote}\n\nLETTER REQUIREMENTS:\n1. Open with owner contact block: [Owner Full Name], [Owner Property Address], [Owner Email]\n2. Date: June 15, 2026\n3. Recipient address block\n4. RE: NOTICE OF PROTEST OF PROPERTY VALUATION\n5. Section SUBJECT PROPERTY DESCRIPTION: list every characteristic with exact numbers\n6. Section PROPERTY DEFECTS & CONDITIONS: cite each selected issue\n7. Section COMPARABLE SALES EVIDENCE: 4-5 recent sales from ZIP ${property.zip}\n8. Section MARKET CONDITIONS: local market trends\n9. Section LEGAL BASIS: cite ${stateInfo.statute || "applicable state statutes"}\n10. Demand ${reductionPctDisplay}% reduction from ${fmt(assessedValue)} to ${fmt(targetReduction)}\n11. Professional closing with owner name, address, and email address. Below the owner signature block, on its own line, include exactly this sentence: "Please direct all correspondence and decisions regarding this protest to the property owner at the email address above, with a copy to: disputes@taxappealusa.com (Document Preparation Service)."\n\nOutput ONLY the complete formal letter.`;
      // Florida: use generate-dr486 (official DR-486; the OWNER signs Part 3 and
    // Parts 4/5 are left N/A — TaxAppeal is never the representative)
      // All other states: use generate-letter (free-form protest letter)
      let claudeJson;
      if (stateCode === 'FL') {
        const flSig = formData.flSignature || {};
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
            propertyAddress: addr,
            county,
            assessedValue,
            requestedValue: targetReduction,
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
function FloridaCountyBlocked({ info, onBack }) {
  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 20px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🗺️</div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        {info.kind === 'unsupported'
          ? `We're not filing in ${info.county} County yet`
          : "We need your county"}
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "#444", marginBottom: 24 }}>{info.message}</p>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "#666", marginBottom: 28 }}>
        Email <a href="mailto:customerservice@taxappealusa.com" style={{ color: "#0B7A4B", fontWeight: 600 }}>customerservice@taxappealusa.com</a> with your address and we'll tell you where you stand — including whether we can file for you manually this season.
      </p>
      <button onClick={onBack} style={{ padding: "12px 28px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        ← Back
      </button>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState("account");
  const [account, setAccount] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [property, setProperty] = useState({ street: "", city: "", state: "", zip: "", propType: "", yearBuilt: "", notes: "", manualAssessedValue: "", manualSqft: "", manualYearBuilt: "", manualBeds: "", manualBaths: "" });
  const [issues, setIssues] = useState([]);
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
          kind: 'unresolved',
          message: "We couldn't automatically determine which Florida county this property is in. Your county determines the filing fee and where the petition is mailed, so we need it to be exact.",
        });
        return;
      }

      const feeInfo = getFlVabFee(j.county);

      // Hard gate: never take money for a county we cannot correctly file in.
      if (!isFlCountySupported(j.county)) {
        setFlCountyError({
          kind: 'unsupported',
          county: j.county,
          message: `We're not filing in ${j.county} County yet. We only file where we've verified the Value Adjustment Board's mailing address directly with the county — we won't take your money and guess at where to send your petition.`,
        });
        return;
      }

      setProperty(p => ({ ...p, county: j.county }));
      setFlFeeData({ ...feeInfo, county: j.county });
      setStep('florida-fee');
      window.scrollTo(0, 0);
    } catch (e) {
      setFlCountyError({ kind: 'error', message: 'We had trouble looking up your county. Please try again in a moment.' });
    } finally {
      setResolvingCounty(false);
    }
  };
  const upd = (setObj) => (key, val) => setObj(p => ({ ...p, [key]: val }));
  const toggleIssue = (issue) => setIssues(prev => prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue]);
  const restart = () => {
    setStep("account");
    setAccount({ firstName: "", lastName: "", email: "", password: "" });
    setProperty({ street: "", city: "", state: "", zip: "", propType: "", yearBuilt: "", notes: "", manualAssessedValue: "", manualSqft: "", manualYearBuilt: "", manualBeds: "", manualBaths: "" });
    setIssues([]); setNotes(""); setUnsupportedState(null); setClosedWindow(null); setFlFeeData(null); setFlSignature(null);
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
      <style>{`
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
      `}</style>
      <AnnouncementBar />
      <NavBar step={step} />
      {!unsupportedState && <ProgressBar currentStep={step} />}
      {flCountyError ? (
        <FloridaCountyBlocked info={flCountyError} onBack={() => setFlCountyError(null)} />
      ) : closedWindow ? (
        <FilingWindowClosed stateCode={closedWindow.stateCode} windowStatus={closedWindow.windowStatus} onBack={() => setClosedWindow(null)} account={account} property={property} />
      ) : unsupportedState ? (
        <UnsupportedState stateCode={unsupportedState} onBack={() => setUnsupportedState(null)} />
      ) : (
        <>
          {step === "account" && <StepAccount data={account} onChange={upd(setAccount)} onNext={() => { setStep("property"); window.scrollTo(0,0); }} />}
          {step === "property" && <StepProperty data={property} onChange={upd(setProperty)} onNext={() => { setStep("issues"); window.scrollTo(0,0); }} onBack={() => { setStep("account"); window.scrollTo(0,0); }} onUnsupportedState={s => setUnsupportedState(s)} onClosedWindow={(sc, ws) => setClosedWindow({ stateCode: sc, windowStatus: ws })} />}
          {step === "issues" && <StepIssues selectedIssues={issues} onToggle={toggleIssue} onNext={() => { const sc = property.state.trim().toUpperCase(); if (sc === 'FL') { goToFloridaFeeStep(); } else { setStep('dispute'); window.scrollTo(0,0); } }} onBack={() => { setStep("property"); window.scrollTo(0,0); }} stateCode={property.state.trim().toUpperCase()} notes={notes} onNotesChange={setNotes} />}
          {step === "florida-fee" && <StepFloridaFee feeData={flFeeData} property={property} account={account} onAuthorize={(sig) => { setFlSignature(sig); setStep("dispute"); window.scrollTo(0,0); }} onBack={() => { setStep("issues"); window.scrollTo(0,0); }} />}
          {step === "dispute" && <StepDispute formData={{ account, property: { ...property, notes }, issues, flSignature }} onRestart={restart} />}
        </>
      )}
    </div>
  );
}
