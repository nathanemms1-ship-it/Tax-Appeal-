import { useState, useEffect, useRef } from "react";

const STEPS = ["account", "property", "dispute"];
const stepLabels = { account: "Create Account", property: "Your Property", dispute: "Dispute Letter" };

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

function StepProperty({ data, onChange, onNext, onBack }) {
  const [err, setErr] = useState("");
  const go = () => {
    if (!data.street || !data.city || !data.state || !data.zip) return setErr("Please fill in the complete property address.");
    setErr(""); onNext();
  };
  return (
    <div style={S.card}>
      <h2 style={S.title}>Your property</h2>
      <p style={S.sub}>Enter your address and we'll automatically pull the official assessed value and market data.</p>
      {err && <div style={S.err}>{err}</div>}
      <Field label="Street Address" id="st" value={data.street} onChange={e => onChange("street", e.target.value)} placeholder="123 Maple Avenue" />
      <div style={S.row3}>
        <Field label="City" id="city" value={data.city} onChange={e => onChange("city", e.target.value)} placeholder="Mansfield" />
        <Field label="State" id="state" value={data.state} onChange={e => onChange("state", e.target.value)} placeholder="TX" />
        <Field label="ZIP" id="zip" value={data.zip} onChange={e => onChange("zip", e.target.value)} placeholder="76063" />
      </div>
      <div style={S.row2}>
        <Field label="Property Type (optional)" id="pt" value={data.propType} onChange={e => onChange("propType", e.target.value)} placeholder="Single-family home" />
        <Field label="Year Built (optional)" id="yb" value={data.yearBuilt} onChange={e => onChange("yearBuilt", e.target.value)} placeholder="1998" />
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 18, marginTop: 4, marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
          From your tax bill — optional but improves accuracy
        </div>
        <div style={S.row3}>
          <Field label="Assessed Value" id="av" value={data.manualAssessedValue} onChange={e => onChange("manualAssessedValue", e.target.value)} placeholder="$320,000" />
          <Field label="Square Footage" id="sf" value={data.manualSqft} onChange={e => onChange("manualSqft", e.target.value)} placeholder="2,100" />
          <Field label="Year Built" id="ybm" value={data.manualYearBuilt} onChange={e => onChange("manualYearBuilt", e.target.value)} placeholder="1998" />
        </div>
      </div>
      <div style={S.fieldGroup}>
        <label style={S.label}>Additional Notes (optional)</label>
        <textarea value={data.notes} onChange={e => onChange("notes", e.target.value)}
          placeholder="e.g., Foundation issues, recent storm damage, comparable homes assessed lower..."
          style={{ ...S.input, minHeight: 72, resize: "vertical", lineHeight: 1.6 }} />
      </div>
      <button style={{ ...S.btn, marginTop: 20 }} onClick={go}>Look Up My Assessment →</button>
      <div style={{ marginTop: 11, textAlign: "center" }}>
        <button style={S.btnGhost} onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

const STAGES = [
  { label: "Determining county", sub: "Looking up jurisdiction via Census geocoder" },
  { label: "Retrieving assessment data", sub: "Pulling official county assessor records" },
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

  const { account, property } = formData;
  const addr = `${property.street}, ${property.city}, ${property.state} ${property.zip}`;

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
          manualAssessedValue: property.manualAssessedValue
            ? Number(property.manualAssessedValue.replace(/[^0-9]/g, "")) : null,
          manualSqft: property.manualSqft
            ? Number(property.manualSqft.replace(/[^0-9]/g, "")) : null,
          manualYearBuilt: property.manualYearBuilt || null,
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
      const yearBuilt = extracted.yearBuilt || property.yearBuilt || null;
      const appraisalDistrict = bdJson?.appraisalDistrict || null;

      setStage(2);

      const overPct = assessedValue && marketValue && marketValue > 0
        ? Math.round(((assessedValue - marketValue) / marketValue) * 100) : null;
      const effectiveRate = annualTax && assessedValue ? (annualTax / assessedValue) : 0.011;
      const savings = assessedValue && marketValue && assessedValue > marketValue
        ? Math.round((assessedValue - marketValue) * effectiveRate) : null;
      const targetReduction = assessedValue ? Math.round(Number(assessedValue) * 0.80) : null;

      const pd = {
        assessedValue, marketValue, annualTax, county, taxYear,
        overPct, savings, beds, baths, sqft, yearBuilt,
        rawAddress: addr,
        hasData: !!(assessedValue || marketValue),
        appraisalDistrict, targetReduction,
      };
      setPropData(pd);

      await new Promise(r => setTimeout(r, 400));
      setStage(3);

      const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : "on file";

      const districtBlock = appraisalDistrict
        ? `FILE YOUR DISPUTE WITH:
${appraisalDistrict.districtName}
${appraisalDistrict.mailingAddress}
${appraisalDistrict.city}, ${appraisalDistrict.state} ${appraisalDistrict.zip}
${appraisalDistrict.phone ? "Phone: " + appraisalDistrict.phone : ""}
${appraisalDistrict.website ? "Website: " + appraisalDistrict.website : ""}
Filing deadline: ${appraisalDistrict.filingDeadlineNote || "Check with district"}
Filing method: ${appraisalDistrict.filingMethod || "mail"}`
        : `FILE WITH: ${county} Appraisal District`;

      const prompt = `You are a property tax attorney. Write a complete, formal property tax assessment dispute letter. Output ONLY the letter — no preamble, no markdown, no explanation.

OWNER: ${account.firstName} ${account.lastName}
EMAIL: ${account.email}
PROPERTY ADDRESS: ${addr}
PROPERTY TYPE: ${property.propType || "Residential"}
BEDS/BATHS: ${beds ? beds + " bed" : "on file"} / ${baths ? baths + " bath" : "on file"}
SQUARE FOOTAGE: ${sqft ? Number(sqft).toLocaleString() + " sq ft" : "on file"}
YEAR BUILT: ${yearBuilt || "on file"}
COUNTY: ${county}
TAX YEAR: ${taxYear}

OFFICIAL ASSESSMENT DATA:
- Current Assessed Value: ${fmt(assessedValue)}
- Estimated Fair Market Value: ${fmt(marketValue)}
- Annual Tax Bill: ${fmt(annualTax)}
- Over-Assessment: ${overPct != null ? overPct + "%" : "significant discrepancy"}

${districtBlock}

LETTER REQUIREMENTS:
1. Address the letter directly to ${appraisalDistrict ? appraisalDistrict.districtName : county + " Appraisal District"}
2. Open with a clear demand for a 20% reduction: from ${fmt(assessedValue)} to ${fmt(targetReduction)}
3. Reference the specific square footage (${sqft ? Number(sqft).toLocaleString() + " sq ft" : "on file"}) and year built (${yearBuilt || "on file"})
4. Include a section "Comparable Sales Evidence" — cite 3-5 realistic comparable sales from ZIP ${property.zip} with addresses, sale prices, dates, and price per sq ft
5. Include a section "Market Conditions" — explain how ${county} market trends support a lower assessment
6. Include a section "Legal Basis" — cite Texas Tax Code Section 41.41 (or applicable state law), equal and uniform assessment standards
7. Calculate and compare price-per-sq-ft of subject property vs comparables
8. Request a formal ARB hearing if the protest is not resolved administratively
9. Close with owner full name, property address, and email

ADDITIONAL NOTES FROM OWNER: ${property.notes || "None provided."}

Output ONLY the complete formal letter.`;

      const claudeRes = await fetch("/api/generate-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          address: addr,
          county,
          assessedValue,
          zip: property.zip,
          state: property.state,
        }),
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
                  {done ? "✓" : active
                    ? <div style={{ width: 9, height: 9, borderRadius: "50%", border: `2px solid ${C.gold}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
                    : i + 1}
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
        <p style={{ ...S.sub, marginBottom: 20 }}>Try again or enter your assessment details manually in the property step.</p>
        <button style={S.btn} onClick={retry}>Try Again</button>
        <div style={{ marginTop: 11, textAlign: "center" }}>
          <button style={S.btnGhost} onClick={onRestart}>← Start over</button>
        </div>
      </div>
    );
  }

  const pd = propData || {};
  return (
    <div style={S.card}>
      <div style={S.badge(true)}>✓ Assessment Retrieved — Dispute Ready</div>
      <h2 style={S.title}>Your dispute letter</h2>
      <p style={S.sub}>{pd.rawAddress} — {pd.county}</p>

      {/* Key value cards */}
      <div style={S.infoRow}>
        {pd.assessedValue && (
          <div style={S.infoBox}>
            <div style={S.infoLabel}>Current Assessed Value</div>
            <div style={S.infoVal}>${Number(pd.assessedValue).toLocaleString()}</div>
          </div>
        )}
        {pd.targetReduction && (
          <div style={S.infoBox}>
            <div style={S.infoLabel}>Target Value (−20%)</div>
            <div style={{ ...S.infoVal, color: "#52C48A" }}>${Number(pd.targetReduction).toLocaleString()}</div>
          </div>
        )}
        {pd.savings && pd.savings > 0 && (
          <div style={S.infoBox}>
            <div style={S.infoLabel}>Est. Annual Savings</div>
            <div style={{ ...S.infoVal, color: C.gold }}>${pd.savings.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Property detail chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {pd.sqft && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>📐 {Number(pd.sqft).toLocaleString()} sq ft</span>}
        {pd.yearBuilt && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>🏗 Built {pd.yearBuilt}</span>}
        {pd.beds && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>🛏 {pd.beds} bed</span>}
        {pd.baths && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>🚿 {pd.baths} bath</span>}
        {pd.annualTax && <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "4px 10px", color: "rgba(255,255,255,0.7)" }}>💰 ${Number(pd.annualTax).toLocaleString()}/yr tax</span>}
        {pd.sqft && pd.assessedValue && (
          <span style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", background: "rgba(201,168,76,0.1)", borderRadius: 4, padding: "4px 10px", color: C.gold }}>
            📊 ${Math.round(Number(pd.assessedValue) / Number(pd.sqft))}/sqft assessed
          </span>
        )}
      </div>

      {!pd.hasData && (
        <div style={S.warn}>⚠️ Limited data returned. The letter was drafted with available info — verify figures with your county assessor.</div>
      )}

      {/* Letter */}
      <div style={S.letterBox}>{letter}</div>

      <div style={{ display: "flex", gap: 11, marginTop: 18 }}>
        <button style={{ ...S.btn, flex: 1, marginTop: 0 }} onClick={doCopy}>{copied ? "✓ Copied!" : "Copy Letter"}</button>
        <button style={{ ...S.btn, flex: 1, marginTop: 0, background: "rgba(255,255,255,0.08)", color: C.white }} onClick={doPrint}>Print Letter</button>
      </div>

      {/* Where to file */}
      <div style={{ marginTop: 22, padding: "16px 18px", background: "rgba(26,122,74,0.07)", border: "1px solid rgba(26,122,74,0.2)", borderRadius: 8 }}>
        <div style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#52C48A", marginBottom: 10 }}>
          Where to File Your Dispute
        </div>
        {pd.appraisalDistrict ? (
          <div style={{ fontSize: 13, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.75)", lineHeight: 1.9 }}>
            <div style={{ fontWeight: 700, color: C.white, fontSize: 14, marginBottom: 4 }}>{pd.appraisalDistrict.districtName}</div>
            <div>{pd.appraisalDistrict.mailingAddress}</div>
            <div>{pd.appraisalDistrict.city}, {pd.appraisalDistrict.state} {pd.appraisalDistrict.zip}</div>
            {pd.appraisalDistrict.phone && <div style={{ marginTop: 4 }}>📞 {pd.appraisalDistrict.phone}</div>}
            {pd.appraisalDistrict.website && (
              <div>🌐 <a href={pd.appraisalDistrict.website} target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>{pd.appraisalDistrict.website}</a></div>
            )}
            <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(201,168,76,0.08)", borderRadius: 6, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
              <strong style={{ color: C.gold }}>Filing Method:</strong> {pd.appraisalDistrict.filingMethod}<br />
              <strong style={{ color: C.gold }}>Deadline:</strong> {pd.appraisalDistrict.filingDeadlineNote}<br />
              <strong style={{ color: C.gold }}>Tip:</strong> Send via certified mail and keep your tracking number as proof of filing.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, fontFamily: "'Arial',sans-serif", color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
            Search <strong style={{ color: "rgba(255,255,255,0.8)" }}>"{pd.county} appraisal district"</strong> to find the filing address.<br />
            Most counties require filing <strong style={{ color: "rgba(255,255,255,0.8)" }}>30–90 days</strong> after the assessment notice.<br />
            Send this letter by <strong style={{ color: "rgba(255,255,255,0.8)" }}>certified mail</strong> as supporting documentation.
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, textAlign: "center" }}>
        <button style={S.btnGhost} onClick={onRestart}>Start a new dispute</button>
      </div>

      <div style={{ marginTop: 18, padding: "13px 16px", background: "rgba(201,168,76,0.05)", borderRadius: 8, border: "1px solid rgba(201,168,76,0.12)", fontSize: 11.5, color: "rgba(255,255,255,0.38)", fontFamily: "'Arial',sans-serif", lineHeight: 1.6 }}>
        ⚖️ <strong style={{ color: "rgba(255,255,255,0.5)" }}>Disclaimer:</strong> This letter is AI-generated for informational purposes and does not constitute legal advice. Consult a licensed property tax consultant for jurisdiction-specific filing requirements.
      </div>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState("account");
  const [account, setAccount] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [property, setProperty] = useState({
    street: "", city: "", state: "", zip: "",
    propType: "", yearBuilt: "", notes: "",
    manualAssessedValue: "", manualSqft: "", manualYearBuilt: "",
  });

  const upd = (setObj) => (key, val) => setObj(p => ({ ...p, [key]: val }));

  const restart = () => {
    setStep("account");
    setAccount({ firstName: "", lastName: "", email: "", password: "" });
    setProperty({
      street: "", city: "", state: "", zip: "",
      propType: "", yearBuilt: "", notes: "",
      manualAssessedValue: "", manualSqft: "", manualYearBuilt: "",
    });
  };

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
        <ProgressBar currentStep={step} />
        {step === "account" && <StepAccount data={account} onChange={upd(setAccount)} onNext={() => setStep("property")} />}
        {step === "property" && <StepProperty data={property} onChange={upd(setProperty)} onNext={() => setStep("dispute")} onBack={() => setStep("account")} />}
        {step === "dispute" && <StepDispute formData={{ account, property }} onRestart={restart} />}
      </main>
    </div>
  );
}
