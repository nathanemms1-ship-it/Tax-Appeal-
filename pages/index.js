import { useState, useEffect, useRef } from "react";

const STEPS = ["account", "property", "issues", "dispute"];
const stepLabels = { account: "Create Account", property: "Your Property", issues: "Property Issues", dispute: "Dispute Letter" };

const C = {
  ink: "#1A1A2E", slate: "#2C2C4A", white: "#FFFFFF",
  gold: "#C9A84C", goldDim: "#8B6F2E", red: "#C0392B",
  green: "#1A7A4A",
};

const S = {
  page: { minHeight: "100vh", background: `linear-gradient(160deg, ${C.ink} 0%, ${C.slate} 60%, #1E1E38 100%)`, fontFamily: "'Georgia','Times New Roman',serif", color: C.white },
  header: { padding: "24px 40px 18px", borderBottom: "1px solid rgba(201,168,76,0.25)", display: "flex", alignItems: "center", gap: 14 },
  logoMark: { width: 40, height: 40, background: `linear-gradient(135deg,${C.gold},${C.goldDim})`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 },
  logoText: { fontSize: 21, fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1 },
  logoSub: { fontSize: 10, color: C.gold, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 3, fontFamily: "'Arial',sans-serif" },
  main: { maxWidth: 700, margin: "0 auto", padding: "36px 24px 80px" },
  card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 12, padding: "36px 40px", backdropFilter: "blur(8px)" },
  title: { fontSize: 27, fontWeight: 700, marginBottom: 6, lineHeight: 1.2 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 28, fontFamily: "'Arial',sans-serif", lineHeight: 1.5 },
  label: { display: "block", fontSize: 11, fontFamily: "'Arial',sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 7 },
  input: { width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "12px 15px", color: C.white, fontSize: 15, fontFamily: "'Georgia',serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" },
  fieldGroup: { marginBottom: 18 },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 },
  row3: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 15 },
  btn: { background: `linear-gradient(135deg,${C.gold},${C.goldDim})`, color: C.ink, border: "none", borderRadius: 6, padding: "13px 26px", fontSize: 14, fontWeight: 700, fontFamily: "'Arial',sans-serif", letterSpacing: "0.05em", cursor: "pointer", width: "100%", marginTop: 6 },
  btnGhost: { background: "transparent", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6, padding: "10px 22px", fontSize: 13, fontFamily: "'Arial',sans-serif", cursor: "pointer" },
  err: { background: "rgba(192,57,43,0.15)", border: "1px solid rgba(192,57,43,0.35)", borderRadius: 6, padding: "9px 13px", fontSize: 12, color: "#F1948A", fontFamily: "'Arial',sans-serif", marginBottom: 18 },
  warn: { background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 6, padding: "9px 13px", fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "'Arial',sans-serif", marginBottom: 18 },
  badge: (ok) => ({ display: "inline-flex", alignItems: "center", gap: 5, background: ok ? "rgba(26,122,74,0.15)" : "rgba(201,168,76,0.12)", border: `1px solid ${ok ? "rgba(26,122,74,0.4)" : "rgba(201,168,76,0.35)"}`, borderRadius: 20, padding: "3px 11px", fontSize: 11, fontFamily: "'Arial',sans-serif", color: ok ? "#52C48A" : C.gold, marginBottom: 14 }),
  letterBox: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 8, padding: "22px 26px", fontFamily: "'Georgia',serif", fontSize: 13.5, lineHeight: 1.85, color: "rgba(255,255,255,0.87)", whiteSpace: "pre-wrap", maxHeight: 460, overflowY: "auto" },
  infoRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 },
  infoBox: { flex: 1, minWidth: 130, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "14px 16px" },
  infoLabel: { fontSize: 10, fontFamily: "'Arial',sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 5 },
  infoVal: { fontSize: 18, fontWeight: 700, color: C.gold },
  timelineWrap: { marginBottom: 28 },
  timelineItem: (done, active) => ({ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16, opacity: done || active ? 1 : 0.3, transition: "opacity 0.4s" }),
  timelineDot: (done, active) => ({ width: 26, height: 26, borderRadius: "50%", background: done ? C.gold : "transparent", border: done ? "none" : `2px solid ${active ? C.gold : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: done ? C.ink : active ? C.gold : "rgba(255,255,255,0.25)", fontFamily: "'Arial',sans-serif", flexShrink: 0, marginTop: 2, transition: "all 0.4s" }),
  timelineText: (active) => ({ fontSize: 13, fontFamily: "'Arial',sans-serif", color: active ? C.white : "rgba(255,255,255,0.6)", lineHeight: 1.45 }),
  timelineSub: { fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, fontFamily: "'Arial',sans-serif" },
};

// State support configuration
const SUPPORTED_STATES = {
  TX: {
    name: "Texas",
    deadlineType: "fixed",
    deadlineMonth: 4, // May = month 4 (0-indexed)
    deadlineDay: 15,
    deadlineNote: "May 15 or 30 days after your appraisal notice, whichever is later",
    filingNote: "Postmark by deadline counts in Texas",
    board: "Appraisal Review Board (ARB)",
  },
  GA: {
    name: "Georgia",
    deadlineType: "rolling",
    deadlineDaysAfterNotice: 45,
    deadlineNote: "45 days from the date on your assessment notice",
    filingNote: "Postmark by deadline counts in Georgia",
    board: "Board of Equalization",
  },
  FL: {
    name: "Florida",
    deadlineType: "trim",
    deadlineMonth: 8, // September = month 8 (0-indexed)
    deadlineDay: 18,
    deadlineNote: "25 days after your TRIM notice (typically mid-September)",
    filingNote: "⚠️ Florida requires RECEIPT by deadline — not just postmark. File 7+ days early.",
    board: "Value Adjustment Board (VAB)",
  },
};

// Calculate days until deadline for supported states
function getDeadlineInfo(stateCode) {
  const today = new Date();
  const year = today.getFullYear();
  const state = SUPPORTED_STATES[stateCode];
  if (!state) return null;

  let deadline = null;
  if (stateCode === "TX") {
    deadline = new Date(year, 4, 15); // May 15
    if (today > deadline) deadline = new Date(year + 1, 4, 15);
  } else if (stateCode === "FL") {
    deadline = new Date(year, 8, 18); // ~Sept 18
    if (today > deadline) deadline = new Date(year + 1, 8, 18);
  } else if (stateCode === "GA") {
    // Georgia is rolling — use a typical spring deadline
    deadline = new Date(year, 5, 1); // June 1 as approximate
    if (today > deadline) deadline = new Date(year + 1, 5, 1);
  }

  if (!deadline) return null;
  const msLeft = deadline - today;
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  return { daysLeft, deadline, state };
}

// Countdown banner component
function CountdownBanner({ stateCode }) {
  const info = getDeadlineInfo(stateCode);
  if (!info) return null;
  const { daysLeft, state } = info;

  const urgent = daysLeft <= 14;
  const warning = daysLeft <= 30 && daysLeft > 14;

  const bgColor = urgent
    ? "linear-gradient(135deg, rgba(192,57,43,0.25), rgba(192,57,43,0.15))"
    : warning
    ? "linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.1))"
    : "linear-gradient(135deg, rgba(26,122,74,0.15), rgba(26,122,74,0.08))";

  const borderColor = urgent
    ? "rgba(192,57,43,0.5)"
    : warning
    ? "rgba(201,168,76,0.4)"
    : "rgba(26,122,74,0.3)";

  const textColor = urgent ? "#F1948A" : warning ? C.gold : "#52C48A";
  const icon = urgent ? "🚨" : warning ? "⏰" : "📅";

  const message = urgent
    ? `Only ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left to file your ${state.name} protest — potentially save hundreds or thousands. Don't delay!`
    : warning
    ? `${daysLeft} days until the ${state.name} protest deadline. File now to protect your savings.`
    : `${daysLeft} days until the ${state.name} protest deadline — ${state.deadlineNote}.`;

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      padding: "12px 18px",
      marginBottom: 24,
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontFamily: "'Arial',sans-serif", fontWeight: 700, color: textColor, marginBottom: 2 }}>
          {message}
        </div>
        <div style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
          {state.filingNote}
        </div>
      </div>
    </div>
  );
}

// Unsupported state screen with waitlist
function UnsupportedState({ stateCode, onBack }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const stateName = stateCode
    ? stateCode.toUpperCase()
    : "your state";

  return (
    <div style={S.card}>
      <div style={{ fontSize: 48, marginBottom: 16, textAlign: "center" }}>🗺️</div>
      <h2 style={{ ...S.title, textAlign: "center" }}>Coming Soon to {stateName}</h2>
      <p style={{ ...S.sub, textAlign: "center" }}>
        TaxAppeal currently serves homeowners in <strong style={{ color: C.gold }}>Texas</strong>, <strong style={{ color: C.gold }}>Georgia</strong>, and <strong style={{ color: C.gold }}>Florida</strong>. We're expanding rapidly — enter your email to be first in line when we launch in {stateName}.
      </p>

      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "18px 20px", marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontFamily: "'Arial',sans-serif", fontWeight: 700, color: C.gold, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
          Currently available in:
        </div>
        {Object.entries(SUPPORTED_STATES).map(([code, s]) => (
          <div key={code} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 13, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.7)" }}>
            <span style={{ color: "#52C48A", fontSize: 14 }}>✓</span>
            <strong style={{ color: C.white }}>{s.name}</strong>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>— {s.deadlineNote}</span>
          </div>
        ))}
      </div>

      {!submitted ? (
        <>
          <div style={S.fieldGroup}>
            <label style={S.label}>Notify me when {stateName} launches</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={S.input}
            />
          </div>
          <button
            style={S.btn}
            onClick={() => { if (email.includes("@")) setSubmitted(true); }}
          >
            Notify Me →
          </button>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "20px", background: "rgba(26,122,74,0.1)", border: "1px solid rgba(26,122,74,0.3)", borderRadius: 8 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontFamily: "'Arial',sans-serif", color: "#52C48A", fontWeight: 700 }}>You're on the list!</div>
          <div style={{ fontSize: 12, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.45)", marginTop: 4 }}>We'll email you as soon as {stateName} is available.</div>
        </div>
      )}

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <button style={S.btnGhost} onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

// Deadline popup modal
function DeadlinePopup({ stateCode, onClose }) {
  const info = getDeadlineInfo(stateCode);
  const state = SUPPORTED_STATES[stateCode];
  if (!info || !state) return null;
  const { daysLeft } = info;
  const urgent = daysLeft <= 14;
  const accentColor = urgent ? "#F1948A" : C.gold;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: `linear-gradient(160deg, ${C.ink} 0%, ${C.slate} 100%)`,
        border: `1px solid ${urgent ? "rgba(192,57,43,0.5)" : "rgba(201,168,76,0.3)"}`,
        borderRadius: 14, padding: "36px 40px", maxWidth: 480, width: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>
          {urgent ? "🚨" : "⏰"}
        </div>
        <h2 style={{ ...S.title, textAlign: "center", fontSize: 22, marginBottom: 8 }}>
          {urgent ? `Only ${daysLeft} Days Left!` : `${daysLeft} Days Until Deadline`}
        </h2>
        <p style={{ ...S.sub, textAlign: "center", marginBottom: 20 }}>
          {urgent
            ? `The ${state.name} property tax protest deadline is almost here. Homeowners who file save an average of $800–$2,500 per year. Don't leave money on the table.`
            : `The ${state.name} protest window is open. Most homeowners who file save hundreds or thousands per year.`}
        </p>

        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "16px 18px", marginBottom: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, fontFamily: "'Arial',sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>State</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{state.name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Filing Body</span>
              <span style={{ color: C.white }}>{state.board}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Deadline Rule</span>
              <span style={{ color: accentColor, fontWeight: 700, textAlign: "right", maxWidth: 220 }}>{state.deadlineNote}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Filing Note</span>
              <span style={{ color: "rgba(255,255,255,0.6)", textAlign: "right", maxWidth: 220 }}>{state.filingNote}</span>
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Days Remaining</span>
              <span style={{ color: accentColor, fontWeight: 700, fontSize: 16 }}>{daysLeft} days</span>
            </div>
          </div>
        </div>

        <button style={{ ...S.btn, marginTop: 0, marginBottom: 10 }} onClick={onClose}>
          File My Protest Now →
        </button>
        <div style={{ textAlign: "center" }}>
          <button style={{ ...S.btnGhost, fontSize: 12, padding: "7px 16px" }} onClick={onClose}>
            I understand, continue
          </button>
        </div>
      </div>
    </div>
  );
}

const ISSUE_CATEGORIES = [
  {
    category: "Structural & Major Systems",
    icon: "🏗",
    issues: [
      "Foundation cracks, settling, or structural damage",
      "Roof damage or age (leaks, missing shingles, sagging)",
      "Major water damage (ceiling/wall/floor stains, rot)",
      "Mold or persistent mildew problems",
      "Outdated or failed HVAC system",
      "Failed or aging water heater",
      "Outdated electrical service",
      "Significant plumbing defects (leaks, corroded pipes)",
      "Sewer or septic failure requiring replacement",
    ],
  },
  {
    category: "Safety, Health & Code",
    icon: "⚠️",
    issues: [
      "Active pest infestation (termites, rodents)",
      "Asbestos or lead paint present",
      "Code violations or illegal additions",
      "Unpermitted work or missing permits",
      "Noncompliant electrical (knob-and-tube, overloaded panels)",
      "Hazardous materials requiring remediation",
    ],
  },
  {
    category: "Functional & Livability",
    icon: "🏠",
    issues: [
      "Cramped or poorly configured rooms",
      "Illegally converted rooms with no egress",
      "Inadequate insulation or energy inefficiency",
      "Broken windows, doors, or security issues",
      "No indoor laundry hookups",
      "Only one bathroom for multiple bedrooms",
      "Severely dated interiors requiring major renovation",
    ],
  },
  {
    category: "Exterior & Site",
    icon: "🌿",
    issues: [
      "Poor drainage causing yard or foundation flooding",
      "Floodplain location or high flood insurance costs",
      "Erosion, steep unusable land, or poor lot configuration",
      "Proximity to busy road, industrial site, or airport",
      "Proximity to landfill or other nuisance",
      "Unpermitted outbuildings, fences, or encroachments",
    ],
  },
  {
    category: "Appearance & Maintenance",
    icon: "🔧",
    issues: [
      "Deferred maintenance (peeling paint, rotten trim)",
      "Severely dated kitchen requiring full update",
      "Severely dated bathrooms requiring full update",
      "Significant curb appeal issues reducing buyer interest",
      "Overgrown or neglected landscaping",
    ],
  },
];

function Field({ label, id, type = "text", value, onChange, placeholder, mono }) {
  const [f, setF] = useState(false);
  return (
    <div style={S.fieldGroup}>
      <label htmlFor={id} style={S.label}>{label}</label>
      <input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ ...S.input, ...(mono ? { fontFamily: "monospace", letterSpacing: "0.03em" } : {}), ...(f ? { borderColor: C.gold } : {}) }}
        onFocus={() => setF(true)} onBlur={() => setF(false)} />
    </div>
  );
}

function ProgressBar({ currentStep }) {
  const idx = STEPS.indexOf(currentStep);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 36 }}>
      {STEPS.map((step, i) => (
        <div key={step} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
          {i < STEPS.length - 1 && (
            <div style={{ position: "absolute", top: 14, left: "50%", width: "100%", height: 2, background: i < idx ? C.gold : "rgba(255,255,255,0.1)", zIndex: 0, transition: "background 0.4s" }} />
          )}
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: i < idx ? C.gold : "transparent", border: i === idx ? `2px solid ${C.gold}` : i < idx ? "none" : "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i < idx ? C.ink : i === idx ? C.gold : "rgba(255,255,255,0.25)", fontFamily: "'Arial',sans-serif", zIndex: 1, position: "relative", transition: "all 0.3s" }}>
            {i < idx ? "✓" : i + 1}
          </div>
          <div style={{ fontSize: 9.5, fontFamily: "'Arial',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: i === idx ? C.gold : "rgba(255,255,255,0.28)", marginTop: 6, textAlign: "center", maxWidth: 72, lineHeight: 1.3 }}>
            {stepLabels[step]}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepAccount({ data, onChange, onNext }) {
  const [err, setErr] = useState("");
  const go = () => {
    if (!data.firstName || !data.lastName) return setErr("Enter your full name.");
    if (!data.email.includes("@")) return setErr("Enter a valid email.");
    if (data.password.length < 6) return setErr("Password needs at least 6 characters.");
    setErr(""); onNext();
  };
  return (
    <div style={S.card}>
      <div style={S.badge(false)}>⚖️ Free Dispute Service</div>
      <h2 style={S.title}>Create your account</h2>
      <p style={S.sub}>We'll use this to deliver your dispute letter and track your case.</p>
      {err && <div style={S.err}>{err}</div>}
      <div style={S.row2}>
        <Field label="First Name" id="fn" value={data.firstName} onChange={e => onChange("firstName", e.target.value)} placeholder="Jane" />
        <Field label="Last Name" id="ln" value={data.lastName} onChange={e => onChange("lastName", e.target.value)} placeholder="Smith" />
      </div>
      <Field label="Email Address" id="email" type="email" value={data.email} onChange={e => onChange("email", e.target.value)} placeholder="jane@example.com" />
      <Field label="Password" id="pw" type="password" value={data.password} onChange={e => onChange("password", e.target.value)} placeholder="At least 6 characters" />
      <button style={S.btn} onClick={go}>Continue →</button>
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
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShow(false);
    };
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
        const res = await fetch("/api/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: val }),
        });
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setShow((data.suggestions || []).length > 0);
      } catch (_) {}
      setLoading(false);
    }, 300);
  };

  const handleSelect = (s) => {
    onSelect(s);
    setShow(false);
    setSuggestions([]);
  };

  return (
    <div ref={wrapRef} style={{ ...S.fieldGroup, position: "relative" }}>
      <label style={S.label}>Street Address</label>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="123 Maple Avenue"
          style={{ ...S.input, ...(focused ? { borderColor: C.gold } : {}), paddingRight: 36 }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="off"
        />
        {loading && (
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.gold}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
        )}
      </div>
      {show && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "#1E1E38", border: `1px solid rgba(201,168,76,0.35)`, borderRadius: "0 0 8px 8px", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={() => handleSelect(s)}
              style={{ padding: "11px 15px", cursor: "pointer", borderBottom: i < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", display: "flex", alignItems: "center", gap: 10 }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(201,168,76,0.1)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ color: C.gold, fontSize: 14, flexShrink: 0 }}>📍</span>
              <div>
                <div style={{ fontSize: 13, fontFamily: "'Arial',sans-serif", color: C.white, lineHeight: 1.3 }}>{s.street}</div>
                <div style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{[s.city, s.state, s.zip].filter(Boolean).join(", ")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepProperty({ data, onChange, onNext, onBack, onUnsupportedState }) {
  const [err, setErr] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [checkedState, setCheckedState] = useState(null);

  const go = () => {
    if (!data.street || !data.city || !data.state || !data.zip) return setErr("Please fill in the complete property address.");
    const stateCode = data.state.trim().toUpperCase();
    if (!SUPPORTED_STATES[stateCode]) {
      onUnsupportedState(stateCode);
      return;
    }
    if (checkedState !== stateCode) {
      setCheckedState(stateCode);
      setShowPopup(true);
      return;
    }
    setErr(""); onNext();
  };

  const handlePopupClose = () => {
    setShowPopup(false);
    onNext();
  };

  return (
    <>
      {showPopup && checkedState && (
        <DeadlinePopup stateCode={checkedState} onClose={handlePopupClose} />
      )}
      <div style={S.card}>
        <h2 style={S.title}>Your property</h2>
        <p style={S.sub}>Enter your address and we'll automatically pull your tax appraisal value, property details, and comparable sales from public records.</p>
        {err && <div style={S.err}>{err}</div>}
        <AddressAutocomplete
          value={data.street}
          onChange={(val) => onChange("street", val)}
          onSelect={(s) => {
            onChange("street", s.street);
            if (s.city) onChange("city", s.city);
            if (s.state) onChange("state", s.state);
            if (s.zip) onChange("zip", s.zip);
          }}
        />
        <div style={S.row3}>
          <Field label="City" id="city" value={data.city} onChange={e => onChange("city", e.target.value)} placeholder="Mansfield" />
          <Field label="State" id="state" value={data.state} onChange={e => onChange("state", e.target.value)} placeholder="TX" />
          <Field label="ZIP" id="zip" value={data.zip} onChange={e => onChange("zip", e.target.value)} placeholder="76063" />
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 18, marginTop: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
            Override (optional) — enter if you have your tax bill handy
          </div>
          <div style={{ fontSize: 12, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.3)", marginBottom: 14, lineHeight: 1.5 }}>
            Leave blank and we'll look everything up automatically.
          </div>
          <div style={S.row2}>
            <Field label="Assessed Value" id="av" value={data.manualAssessedValue} onChange={e => onChange("manualAssessedValue", e.target.value)} placeholder="$425,000" />
            <Field label="Square Footage" id="sf" value={data.manualSqft} onChange={e => onChange("manualSqft", e.target.value)} placeholder="2,150" />
          </div>
          <div style={S.row3}>
            <Field label="Year Built" id="ybm" value={data.manualYearBuilt} onChange={e => onChange("manualYearBuilt", e.target.value)} placeholder="1998" />
            <Field label="Bedrooms" id="bd" value={data.manualBeds} onChange={e => onChange("manualBeds", e.target.value)} placeholder="4" />
            <Field label="Bathrooms" id="bt" value={data.manualBaths} onChange={e => onChange("manualBaths", e.target.value)} placeholder="2.5" />
          </div>
          <Field label="Property Type" id="pt" value={data.propType} onChange={e => onChange("propType", e.target.value)} placeholder="Single-family home" />
        </div>
        <div style={S.fieldGroup}>
          <label style={S.label}>Additional Notes (optional)</label>
          <textarea value={data.notes} onChange={e => onChange("notes", e.target.value)}
            placeholder="Any other details about the property..."
            style={{ ...S.input, minHeight: 72, resize: "vertical", lineHeight: 1.6 }} />
        </div>
        <button style={{ ...S.btn, marginTop: 20 }} onClick={go}>Next: Property Issues →</button>
        <div style={{ marginTop: 11, textAlign: "center" }}>
          <button style={S.btnGhost} onClick={onBack}>← Back</button>
        </div>
      </div>
    </>
  );
}

function StepIssues({ selectedIssues, onToggle, onNext, onBack, stateCode }) {
  const count = selectedIssues.length;
  return (
    <div style={S.card}>
      {stateCode && <CountdownBanner stateCode={stateCode} />}
      <div style={S.badge(false)}>💡 Optional but strengthens your case</div>
      <h2 style={S.title}>Property issues</h2>
      <p style={S.sub}>Select any problems that apply to your property. Each one will be cited as evidence in your dispute letter to support the lower valuation.</p>
      {ISSUE_CATEGORIES.map((cat) => (
        <div key={cat.category} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontFamily: "'Arial',sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
            <span>{cat.icon}</span>{cat.category}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {cat.issues.map((issue) => {
              const selected = selectedIssues.includes(issue);
              return (
                <div key={issue} onClick={() => onToggle(issue)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 7, border: `1px solid ${selected ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.08)"}`, background: selected ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.02)", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `2px solid ${selected ? C.gold : "rgba(255,255,255,0.2)"}`, background: selected ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.ink, fontWeight: 700, transition: "all 0.15s" }}>
                    {selected ? "✓" : ""}
                  </div>
                  <span style={{ fontSize: 13, fontFamily: "'Arial',sans-serif", color: selected ? C.white : "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>
                    {issue}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {count > 0 && (
        <div style={{ marginBottom: 20, padding: "10px 14px", background: "rgba(26,122,74,0.1)", border: "1px solid rgba(26,122,74,0.3)", borderRadius: 7, fontSize: 12, fontFamily: "'Arial',sans-serif", color: "#52C48A" }}>
          ✓ {count} issue{count !== 1 ? "s" : ""} selected — {count >= 3 ? "strong case" : "good start"}
        </div>
      )}
      <button style={S.btn} onClick={onNext}>
        {count > 0 ? `Generate Letter with ${count} Issue${count !== 1 ? "s" : ""} →` : "Skip & Generate Letter →"}
      </button>
      <div style={{ marginTop: 11, textAlign: "center" }}>
        <button style={S.btnGhost} onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

const STAGES = [
  { label: "Determining county", sub: "Looking up jurisdiction via Census geocoder" },
  { label: "Retrieving assessment data", sub: "Searching county appraisal district records" },
  { label: "Finding appraisal district", sub: "Locating where to file your dispute" },
  { label: "Drafting dispute letter", sub: "Building legal arguments with comp evidence" },
];

function StepDispute({ formData, onRestart }) {
  const [stage, setStage] = useState(0);
  const [propData, setPropData] = useState(null);
  const [letter, setLetter] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const ran = useRef(false);

  const { account, property, issues } = formData;
  const addr = `${property.street}, ${property.city}, ${property.state} ${property.zip}`;
  const stateCode = property.state.trim().toUpperCase();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  }, []);

  const run = async () => {
    setStage(0); setErrMsg(""); setLetter(""); setPropData(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          street: property.street,
          city: property.city,
          state: property.state,
          zip: property.zip,
          manualAssessedValue: property.manualAssessedValue ? Number(String(property.manualAssessedValue).replace(/[^0-9.]/g, "")) : null,
          manualSqft: property.manualSqft ? Number(String(property.manualSqft).replace(/[^0-9.]/g, "")) : null,
          manualYearBuilt: property.manualYearBuilt || null,
          manualBeds: property.manualBeds || null,
          manualBaths: property.manualBaths || null,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Lookup failed (${res.status}).`);
      }

      const bdJson = await res.json();
      setStage(1);

      const extracted = bdJson?.extractedData || {};
      const assessedValue = extracted.assessedValue || null;
      const marketValue = extracted.marketValue || null;
      const annualTax = extracted.annualTax || null;
      const county = bdJson?.resolvedCounty || `${property.city} County`;
      const taxYear = extracted.taxYear || new Date().getFullYear().toString();
      const beds = extracted.beds || null;
      const baths = extracted.baths || null;
      const sqft = extracted.sqft || null;
      const yearBuilt = extracted.yearBuilt || null;
      const appraisalDistrict = bdJson?.appraisalDistrict || null;

      setStage(2);

      const overPct = assessedValue && marketValue && marketValue > 0 ? Math.round(((assessedValue - marketValue) / marketValue) * 100) : null;
      const effectiveRate = annualTax && assessedValue ? (annualTax / assessedValue) : 0.011;
      const savings = assessedValue && marketValue && assessedValue > marketValue ? Math.round((assessedValue - marketValue) * effectiveRate) : null;
      const targetReduction = assessedValue ? Math.round(Number(assessedValue) * 0.80) : null;

      const pd = { assessedValue, marketValue, annualTax, county, taxYear, overPct, savings, beds, baths, sqft, yearBuilt, rawAddress: addr, hasData: !!(assessedValue || marketValue), appraisalDistrict, targetReduction };
      setPropData(pd);

      await new Promise(r => setTimeout(r, 400));
      setStage(3);

      const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : null;
      const stateInfo = SUPPORTED_STATES[stateCode] || {};

      const propDetails = [
        sqft ? `Square Footage: ${Number(sqft).toLocaleString()} sq ft` : null,
        yearBuilt ? `Year Built: ${yearBuilt}` : null,
        beds ? `Bedrooms: ${beds}` : null,
        baths ? `Bathrooms: ${baths}` : null,
        property.propType ? `Property Type: ${property.propType}` : null,
        sqft && assessedValue ? `Assessed Price Per Sq Ft: $${Math.round(Number(assessedValue) / Number(sqft))}` : null,
      ].filter(Boolean).join("\n");

      const issuesBlock = issues && issues.length > 0
        ? `PROPERTY DEFECTS & ISSUES (cite each one in the letter):\n${issues.map(i => `• ${i}`).join("\n")}`
        : "No specific property issues reported beyond general market value discrepancy.";

      const districtBlock = appraisalDistrict
        ? `FILING DESTINATION:\n${appraisalDistrict.districtName}\n${appraisalDistrict.mailingAddress}\n${appraisalDistrict.city}, ${appraisalDistrict.state} ${appraisalDistrict.zip}\n${appraisalDistrict.phone ? "Phone: " + appraisalDistrict.phone : ""}\nProtest Deadline: ${appraisalDistrict.filingDeadlineNote || stateInfo.deadlineNote || "Check with district"}\nFiling Method: ${appraisalDistrict.filingMethod || "mail"}`
        : `FILE WITH: ${county} Appraisal District\nDeadline: ${stateInfo.deadlineNote || "Check with district"}`;

      const prompt = `You are a property tax attorney writing a formal protest letter. Output ONLY the letter — no preamble, no markdown, no explanation.

PROPERTY OWNER: ${account.firstName} ${account.lastName}
EMAIL: ${account.email}
PROPERTY ADDRESS: ${addr}
COUNTY: ${county}
STATE: ${property.state.toUpperCase()}
TAX YEAR: ${taxYear}

SUBJECT PROPERTY CHARACTERISTICS:
${propDetails || "See county records"}
Current Assessed Value: ${fmt(assessedValue) || "See records"}
Estimated Market Value: ${fmt(marketValue) || "N/A"}
Annual Tax Bill: ${fmt(annualTax) || "N/A"}
Requested Reduction: 20% — from ${fmt(assessedValue)} to ${fmt(targetReduction)}

${issuesBlock}

${districtBlock}

OWNER NOTES: ${property.notes || "None."}

LETTER REQUIREMENTS:
1. Address letter to: ${appraisalDistrict ? appraisalDistrict.districtName : county + " Appraisal District"}
2. Date: June 2026
3. Subject line referencing property address and tax year
4. Section "SUBJECT PROPERTY DESCRIPTION": list every characteristic with its EXACT number. Never write "on file."
5. Section "PROPERTY DEFECTS & CONDITIONS": cite each selected issue by name, explain how it negatively impacts market value. Be specific and persuasive.
6. Section "COMPARABLE SALES EVIDENCE": cite 4-5 real recent sales from ZIP ${property.zip} with addresses, prices, dates, sq ft, and price per sq ft. Show subject property's assessed price per sq ft exceeds comparable sales.
7. Section "MARKET CONDITIONS": explain local market trends supporting a lower valuation.
8. Section "LEGAL BASIS": cite applicable state statutes (Texas Tax Code §41.41/§41.43 for TX, O.C.G.A. §48-5-311 for GA, Florida Statute §194.011 for FL), equal and uniform assessment, and market value standard.
9. Demand 20% reduction: from ${fmt(assessedValue)} to ${fmt(targetReduction)}.
10. Request formal hearing if not resolved administratively.
11. Professional closing with owner name, address, email, and signature line.

Output ONLY the complete formal letter.`;

      const claudeRes = await fetch("/api/generate-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, address: addr, county, assessedValue, zip: property.zip, state: property.state }),
      });

      const claudeJson = await claudeRes.json();
      if (claudeJson.error) throw new Error(claudeJson.error);
      if (!claudeJson.letter) throw new Error("Letter generation returned empty.");
      setLetter(claudeJson.letter);
      setStage(4);
    } catch (e) {
      setErrMsg(e.message || "Something went wrong. Please try again.");
      setStage(-1);
    }
  };

  const retry = () => { ran.current = false; setStage(0); run(); ran.current = true; };
  const doCopy = () => { navigator.clipboard.writeText(letter); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  const doPrint = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><body style="font-family:Georgia,serif;max-width:680px;margin:60px auto;font-size:15px;line-height:1.85;color:#111;">${letter.replace(/\n/g, "<br/>")}</body></html>`);
    w.document.close(); w.print();
  };

  if (stage >= 0 && stage < 4) {
    return (
      <div style={S.card}>
        <h2 style={S.title}>Looking up your property</h2>
        <p style={S.sub}>Pulling live data from county assessor records for {addr}.</p>
        <div style={S.timelineWrap}>
          {STAGES.map((st, i) => {
            const done = stage > i; const active = stage === i;
            return (
              <div key={i} style={S.timelineItem(done, active)}>
                <div style={S.timelineDot(done, active)}>
                  {done ? "✓" : active ? <div style={{ width: 9, height: 9, borderRadius: "50%", border: `2px solid ${C.gold}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} /> : i + 1}
                </div>
                <div>
                  <div style={S.timelineText(active)}>{st.label}</div>
                  <div style={S.timelineSub}>{st.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (stage === -1) {
    return (
      <div style={S.card}>
        <h2 style={S.title}>Lookup failed</h2>
        <div style={S.err}>{errMsg}</div>
        <p style={{ ...S.sub, marginBottom: 20 }}>Try again or go back and enter your details manually.</p>
        <button style={S.btn} onClick={retry}>Try Again</button>
        <div style={{ marginTop: 11, textAlign: "center" }}><button style={S.btnGhost} onClick={onRestart}>← Start over</button></div>
      </div>
    );
  }

  const pd = propData || {};
  return (
    <div style={S.card}>
      {stateCode && <CountdownBanner stateCode={stateCode} />}
      <div style={S.badge(true)}>✓ Dispute Letter Ready</div>
      <h2 style={S.title}>Your dispute letter</h2>
      <p style={S.sub}>{pd.rawAddress} — {pd.county}</p>
      <div style={S.infoRow}>
        {pd.assessedValue && <div style={S.infoBox}><div style={S.infoLabel}>Current Assessed Value</div><div style={S.infoVal}>${Number(pd.assessedValue).toLocaleString()}</div></div>}
        {pd.targetReduction && <div style={S.infoBox}><div style={S.infoLabel}>Target Value (−20%)</div><div style={{ ...S.infoVal, color: "#52C48A" }}>${Number(pd.targetReduction).toLocaleString()}</div></div>}
        {pd.savings && pd.savings > 0 && <div style={S.infoBox}><div style={S.infoLabel}>Est. Annual Savings</div><div style={{ ...S.infoVal, color: C.gold }}>${pd.savings.toLocaleString()}</div></div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {pd.sqft && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>📐 {Number(pd.sqft).toLocaleString()} sq ft</span>}
        {pd.yearBuilt && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>🏗 Built {pd.yearBuilt}</span>}
        {pd.beds && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>🛏 {pd.beds} bed</span>}
        {pd.baths && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>🚿 {pd.baths} bath</span>}
        {pd.annualTax && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>💰 ${Number(pd.annualTax).toLocaleString()}/yr tax</span>}
        {pd.sqft && pd.assessedValue && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(201,168,76,0.1)", borderRadius: 4, padding: "4px 10px", color: C.gold }}>📊 ${Math.round(Number(pd.assessedValue) / Number(pd.sqft))}/sqft assessed</span>}
      </div>
      {formData.issues && formData.issues.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontFamily: "'Arial',sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Issues cited in letter</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {formData.issues.map(issue => (
              <span key={issue} style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 4, padding: "3px 9px", color: "#F1948A" }}>{issue}</span>
            ))}
          </div>
        </div>
      )}
      {!pd.hasData && <div style={S.warn}>⚠️ Limited data returned. Verify figures with your county assessor.</div>}
      <div style={S.letterBox}>{letter}</div>
      <div style={{ display: "flex", gap: 11, marginTop: 18 }}>
        <button style={{ ...S.btn, flex: 1, marginTop: 0 }} onClick={doCopy}>{copied ? "✓ Copied!" : "Copy Letter"}</button>
        <button style={{ ...S.btn, flex: 1, marginTop: 0, background: "rgba(255,255,255,0.08)", color: C.white }} onClick={doPrint}>Print Letter</button>
      </div>
      <div style={{ marginTop: 22, padding: "16px 18px", background: "rgba(26,122,74,0.07)", border: "1px solid rgba(26,122,74,0.2)", borderRadius: 8 }}>
        <div style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#52C48A", marginBottom: 10 }}>Where to File Your Dispute</div>
        {pd.appraisalDistrict ? (
          <div style={{ fontSize: 13, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.75)", lineHeight: 1.9 }}>
            <div style={{ fontWeight: 700, color: C.white, fontSize: 14, marginBottom: 4 }}>{pd.appraisalDistrict.districtName}</div>
            <div>{pd.appraisalDistrict.mailingAddress}</div>
            <div>{pd.appraisalDistrict.city}, {pd.appraisalDistrict.state} {pd.appraisalDistrict.zip}</div>
            {pd.appraisalDistrict.phone && <div style={{ marginTop: 4 }}>📞 {pd.appraisalDistrict.phone}</div>}
            {pd.appraisalDistrict.website && <div>🌐 <a href={pd.appraisalDistrict.website} target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>{pd.appraisalDistrict.website}</a></div>}
            <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(201,168,76,0.08)", borderRadius: 6, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
              <strong style={{ color: C.gold }}>Filing Method:</strong> {pd.appraisalDistrict.filingMethod}<br />
              <strong style={{ color: C.gold }}>Deadline:</strong> {pd.appraisalDistrict.filingDeadlineNote}<br />
              <strong style={{ color: C.gold }}>Tip:</strong> Send via certified mail and keep your tracking number as proof of filing.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
            Search <strong style={{ color: "rgba(255,255,255,0.8)" }}>"{pd.county} appraisal district"</strong> to find the filing address.<br />
            Send by <strong style={{ color: "rgba(255,255,255,0.8)" }}>certified mail</strong> with tracking as proof of filing.
          </div>
        )}
      </div>
      <div style={{ marginTop: 14, textAlign: "center" }}><button style={S.btnGhost} onClick={onRestart}>Start a new dispute</button></div>
      <div style={{ marginTop: 18, padding: "13px 16px", background: "rgba(201,168,76,0.05)", borderRadius: 8, border: "1px solid rgba(201,168,76,0.12)", fontSize: 11.5, color: "rgba(255,255,255,0.38)", fontFamily: "'Arial',sans-serif", lineHeight: 1.6 }}>
        ⚖️ <strong style={{ color: "rgba(255,255,255,0.5)" }}>Disclaimer:</strong> This letter is AI-generated for informational purposes and does not constitute legal advice. Consult a licensed property tax consultant for jurisdiction-specific filing requirements.
      </div>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState("account");
  const [account, setAccount] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [property, setProperty] = useState({ street: "", city: "", state: "", zip: "", propType: "", yearBuilt: "", notes: "", manualAssessedValue: "", manualSqft: "", manualYearBuilt: "", manualBeds: "", manualBaths: "" });
  const [issues, setIssues] = useState([]);
  const [unsupportedState, setUnsupportedState] = useState(null);

  const upd = (setObj) => (key, val) => setObj(p => ({ ...p, [key]: val }));
  const toggleIssue = (issue) => setIssues(prev => prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue]);

  const restart = () => {
    setStep("account");
    setAccount({ firstName: "", lastName: "", email: "", password: "" });
    setProperty({ street: "", city: "", state: "", zip: "", propType: "", yearBuilt: "", notes: "", manualAssessedValue: "", manualSqft: "", manualYearBuilt: "", manualBeds: "", manualBaths: "" });
    setIssues([]);
    setUnsupportedState(null);
  };

  const stateCode = property.state.trim().toUpperCase();

  return (
    <div style={S.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.22); }
        input:focus, textarea:focus { outline: none; border-color: #C9A84C !important; }
        button:hover { opacity: 0.86; } button:active { transform: scale(0.98); }
        * { box-sizing: border-box; } textarea { font-family: 'Georgia',serif !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.3); border-radius: 3px; }
      `}</style>
      <header style={S.header}>
        <div style={S.logoMark}>⚖</div>
        <div>
          <div style={S.logoText}>TaxAppeal</div>
          <div style={S.logoSub}>Property Tax Dispute Service</div>
        </div>
      </header>
      <main style={S.main}>
        {unsupportedState ? (
          <UnsupportedState stateCode={unsupportedState} onBack={() => setUnsupportedState(null)} />
        ) : (
          <>
            <ProgressBar currentStep={step} />
            {step === "account" && <StepAccount data={account} onChange={upd(setAccount)} onNext={() => setStep("property")} />}
            {step === "property" && <StepProperty data={property} onChange={upd(setProperty)} onNext={() => setStep("issues")} onBack={() => setStep("account")} onUnsupportedState={(s) => setUnsupportedState(s)} />}
            {step === "issues" && <StepIssues selectedIssues={issues} onToggle={toggleIssue} onNext={() => setStep("dispute")} onBack={() => setStep("property")} stateCode={stateCode} />}
            {step === "dispute" && <StepDispute formData={{ account, property, issues }} onRestart={restart} />}
          </>
        )}
      </main>
    </div>
  );
}
