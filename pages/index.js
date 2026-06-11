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
        <Field label="City" id="city" value={data.city} onChange={e => onChange("city", e.target.value)} placeholder="Springfield" />
        <Field label="State" id="state" value={data.state} onChange={e => onChange("state", e.target.value)} placeholder="IL" />
        <Field label="ZIP" id="zip" value={data.zip} onChange={e => onChange("zip", e.target.value)} placeholder="62701" />
      </div>
      <div style={S.row2}>
        <Field label="Property Type (optional)" id="pt" value={data.propType} onChange={e => onChange("propType", e.target.value)} placeholder="Single-family home" />
        <Field label="Year Built (optional)" id="yb" value={data.yearBuilt} onChange={e => onChange("yearBuilt", e.target.value)} placeholder="1985" />
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 18, marginTop: 4, marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontFamily: "'Arial',sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>From your tax bill (optional — improves letter accuracy)</div>
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
