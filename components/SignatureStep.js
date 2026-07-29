// components/SignatureStep.js
// Post-payment review + electronic signature (delivery-only model, TX/GA/AR/AL).
// The homeowner reviews the full protest, signs on-screen (draw default, type fallback),
// and checks the ownership/non-representation acknowledgment. onSigned() then fires,
// which triggers /api/save-signature + /api/send-letter upstream.
//
// Props: letter, ownerName, propertyAddress, sending (bool), onSigned(fn)
import { useRef, useState, useEffect } from "react";

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

export default function SignatureStep({
  letter, ownerName, propertyAddress, sending, onSigned,
  // Florida: the petition is HTML (the rendered DR-486), not plain text, and the
  // owner makes two elections of their own alongside the Part 3 signature.
  isFL = false, petitionHtml = null,
}) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const [mode, setMode] = useState("draw"); // default to draw (best for AL "original signature" reviewers)
  const [typedName, setTypedName] = useState(ownerName || "");
  const [hasSignature, setHasSignature] = useState(false);
  const [ack, setAck] = useState(false);
  // Florida elections. Defaults chosen to be the safe ones: "I will not attend" is
  // the common case but is shown and changeable, and sharing confidential info is
  // opt-IN because it is the owner's information to release, not ours to assume.
  const [flWillAttend, setFlWillAttend] = useState(false);
  const [flShareInfo, setFlShareInfo] = useState(true);

  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = C.darkNavy;
  }, [mode]);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn.current) { hasDrawn.current = true; setHasSignature(true); }
  };
  const end = () => { drawing.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    setHasSignature(false);
  };

  // Florida's Part 3 is signed with the owner's name, so a typed signature is
  // required there regardless of which tab is showing.
  const ready = isFL
    ? ack && typedName.trim().length > 1
    : ack && (mode === "type" ? typedName.trim().length > 1 : hasSignature);

  const submit = () => {
    if (!ready || sending) return;
    const image =
      mode === "draw" && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null;
    onSigned({
      ...(isFL ? {
        flSignatureName: typedName.trim(),
        flWillNotAttend: !flWillAttend,
        flAuthorizeConfidential: flShareInfo,
      } : {}),
      image,
      typedName: mode === "type" ? typedName.trim() : (ownerName || ""),
      acknowledged: true,
      signedAt: new Date().toISOString(),
    });
  };

  const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.navy };
  const tab = (active) => ({
    ...label, cursor: "pointer", padding: "8px 16px", borderRadius: 8,
    background: active ? C.navy : C.lightBlue, color: active ? C.white : C.navy, border: "none",
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ color: C.navy, fontSize: 26, margin: "0 0 6px" }}>Review and sign your protest</h1>
      <p style={{ color: C.bodyGray, fontSize: 15, lineHeight: 1.6, margin: "0 0 20px" }}>
        This is the protest that will be filed in your name for{" "}
        <strong style={{ color: C.navy }}>{propertyAddress}</strong>. Read it over and{" "}
        <strong style={{ color: C.navy }}>sign electronically below — there's nothing to print or mail.</strong>{" "}
        The moment you sign, we print your protest and send it by USPS certified mail to your appraisal
        district, and email you the tracking number.
      </p>

      {/* Full letter */}
      <div
        style={{
          border: `1.5px solid ${C.border}`, borderRadius: 10, background: C.white,
          padding: "24px 28px", maxHeight: 340, overflowY: "auto", marginBottom: 24,
          fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13.5, lineHeight: 1.85,
          color: "#111", whiteSpace: "pre-wrap",
        }}
      >
        {isFL && petitionHtml
          ? <div dangerouslySetInnerHTML={{ __html: petitionHtml }} />
          : letter}
      </div>

      {isFL && (
        <div style={{ background: "#F7FAFF", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#1B3A6B", fontWeight: 600, marginBottom: 10 }}>
            Form DR-486, Part 3 — your signature
          </div>
          <div style={{ fontSize: 13, color: "#5A6B82", lineHeight: 1.65, marginBottom: 14 }}>
            <strong style={{ color: "#0F1F3D" }}>Under penalties of perjury</strong>, I declare that I am the
            owner of the property described above, that I have read this petition, and that the facts stated
            in it are true. The complete petition is shown above — nothing is hidden.
          </div>

          <div style={{ fontSize: 13, color: "#5A6B82", marginBottom: 8 }}>Will you attend the hearing, if one is scheduled?</div>
          <div onClick={() => setFlWillAttend(false)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 7, border: `1.5px solid ${!flWillAttend ? "#1B3A6B" : C.border}`, background: !flWillAttend ? "#EEF4FF" : "#fff", cursor: "pointer", marginBottom: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 2, border: `1.5px solid ${!flWillAttend ? "#1B3A6B" : "#C5D0E0"}`, background: !flWillAttend ? "#1B3A6B" : "#fff" }} />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>No — decide my petition on the written evidence.</span>
          </div>
          <div onClick={() => setFlWillAttend(true)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 7, border: `1.5px solid ${flWillAttend ? "#1B3A6B" : C.border}`, background: flWillAttend ? "#EEF4FF" : "#fff", cursor: "pointer", marginBottom: 12 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 2, border: `1.5px solid ${flWillAttend ? "#1B3A6B" : "#C5D0E0"}`, background: flWillAttend ? "#1B3A6B" : "#fff" }} />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>Yes — I want a hearing. TaxAppeal cannot attend for you; you would appear yourself.</span>
          </div>

          <div onClick={() => setFlShareInfo(!flShareInfo)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 7, border: `1.5px solid ${flShareInfo ? "#1B3A6B" : C.border}`, background: flShareInfo ? "#EEF4FF" : "#fff", cursor: "pointer" }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2, border: `1.5px solid ${flShareInfo ? "#1B3A6B" : "#C5D0E0"}`, background: flShareInfo ? "#1B3A6B" : "#fff", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{flShareInfo ? "\u2713" : ""}</div>
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>
              I authorize the Property Appraiser to release information about my property to TaxAppeal USA so
              they can prepare and file my petition (&sect; 194.011(3), Fla. Stat.). Optional.
            </span>
          </div>
        </div>
      )}

      {/* Signature */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" style={tab(mode === "draw")} onClick={() => setMode("draw")}>Draw signature</button>
        <button type="button" style={tab(mode === "type")} onClick={() => setMode("type")}>Type signature</button>
      </div>

      {mode === "draw" ? (
        <div style={{ marginBottom: 8 }}>
          <canvas
            ref={canvasRef}
            style={{
              width: "100%", height: 150, border: `1.5px dashed ${C.mutedGray}`,
              borderRadius: 10, background: C.bg, touchAction: "none", cursor: "crosshair",
            }}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 12, color: C.mutedGray }}>Sign with your mouse or finger</span>
            <button type="button" onClick={clearCanvas}
              style={{ background: "none", border: "none", color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 8 }}>
          <input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type your full legal name"
            style={{
              width: "100%", padding: "16px 18px", border: `1.5px solid ${C.border}`, borderRadius: 10,
              fontSize: 22, fontFamily: "'Brush Script MT', cursive", color: C.darkNavy, boxSizing: "border-box",
            }}
          />
          <span style={{ fontSize: 12, color: C.mutedGray }}>Typing your name counts as your legal electronic signature.</span>
        </div>
      )}

      {/* Acknowledgment — REQUIRED. Non-representation attestation. */}
      <label
        style={{
          display: "flex", gap: 12, alignItems: "flex-start", background: C.lightBlue,
          border: `1.5px solid ${ack ? C.navy : C.border}`, borderRadius: 10,
          padding: "16px 18px", margin: "18px 0", cursor: "pointer",
        }}
      >
        <input
          type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)}
          style={{ marginTop: 3, width: 18, height: 18, accentColor: C.navy, flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, lineHeight: 1.6, color: C.bodyGray }}>
          I am the owner of this property (or authorized to act for the owner). This is my protest,
          filed in my name. I understand TaxAppeal USA is a document-preparation and certified-mail
          service — not my property tax consultant, agent, or representative — does not provide tax
          or legal advice, and will not represent me before the appraisal district or review board.
        </span>
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!ready || sending}
        style={{
          width: "100%", padding: "18px", borderRadius: 12, border: "none",
          fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700,
          cursor: ready && !sending ? "pointer" : "not-allowed",
          background: ready && !sending ? C.gold : "#DCE3EE",
          color: ready && !sending ? C.darkNavy : C.mutedGray,
          transition: "background 0.15s",
        }}
      >
        {sending ? "Filing your protest…" : "Sign & file my protest"}
      </button>
      <p style={{ fontSize: 11.5, color: C.mutedGray, textAlign: "center", marginTop: 10 }}>
        You sign online — nothing to print. Your protest isn't mailed until you sign.
      </p>
    </div>
  );
}
