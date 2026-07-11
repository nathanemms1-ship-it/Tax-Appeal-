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

export default function SignatureStep({ letter, ownerName, propertyAddress, sending, onSigned }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const [mode, setMode] = useState("draw"); // default to draw (best for AL "original signature" reviewers)
  const [typedName, setTypedName] = useState(ownerName || "");
  const [hasSignature, setHasSignature] = useState(false);
  const [ack, setAck] = useState(false);

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

  const ready = ack && (mode === "type" ? typedName.trim().length > 1 : hasSignature);

  const submit = () => {
    if (!ready || sending) return;
    const image =
      mode === "draw" && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null;
    onSigned({
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
        {letter}
      </div>

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
