import { useState, useEffect, useRef } from "react";
import WaitlistForm from '../components/WaitlistForm';
import ApplyHead from '../components/ApplyHead';
import StepFloridaFee, { getFlVabFee } from '../components/StepFloridaFee';
import ContactModal from '../components/ContactModal';
import { isFlCountySupported, FL_COUNTY_NAMES } from '../lib/flVabAddresses';
import { normalizePerkCode } from '../lib/partnerPerk';
import { getFilingWindowStatus } from '../lib/filingWindows';
import { readVerdict } from '../lib/checkHandoff';
import { deriveValuation, buildCategoryIndex } from '../lib/valuation';
import { curePriceFor, totalCostToCure } from '../lib/costToCure';

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52", amber: "#FFF8E6",
  red: "#C0392B", orange: "#E67E22", blue: "#2980B9", teal: "#27AE60", purple: "#8E44AD",
};

/**
 * THE ORDER OF THE FUNNEL. Changed 23 Aug 2026, and the change is the point.
 *
 * Was: account -> property -> issues -> dispute. The first thing this funnel ever
 * asked a stranger for was their name, their email and a password of at least six
 * characters, before it had told them a single thing about their property.
 *
 * Measured 21-23 Aug: /check, which asks for nothing, turned 116 landings into 46
 * checks. /apply, which asked for all three up front, turned 12 landings into 3.
 * Same product, opposite order, and the order is what differs.
 *
 * Now: property -> issues -> account -> dispute. The address earns the verdict,
 * the verdict earns the condition questions, and only then do we ask who they are
 * — at the point where we need it to sell them something rather than at the point
 * where they are deciding whether to stay.
 *
 * THE PASSWORD IS GONE FROM HERE ENTIRELY. It protects the portal, and the portal
 * shows the status of an appeal that does not exist yet. It is offered on /success
 * after the DR-486 signature instead. See lib/noPassword.js.
 *
 * Florida inserts two sub-steps that are not numbered: `florida-check` between
 * property and issues, and `florida-fee` between account and dispute. SUBSTEPS in
 * ProgressBar maps each to the numbered step it displays as — without that the bar
 * renders as though the customer had not started, which reads as progress lost.
 */
const STEPS = ["property", "issues", "account", "dispute"];
/**
 * "Create Account" was accurate when this step created one. It no longer takes a
 * password, so it no longer creates anything — it collects the name that goes on
 * the petition and the address we send the confirmation to. Calling it an account
 * step would promise a login that only exists if they choose to set one later.
 */
const stepLabels = { property: "Your Property", issues: "Property Issues", account: "Your Details", dispute: "Dispute Letter" };

const SUPPORTED_STATES = {
  TX: { name: "Texas", deadlineNote: "May 15 or 30 days after appraisal notice, whichever is later", filingNote: "Postmark by deadline counts in Texas", board: "Appraisal Review Board (ARB)", statute: "Texas Tax Code §41.41 & §41.43" },
  GA: { name: "Georgia", deadlineNote: "45 days from the date on your assessment notice", filingNote: "Postmark by deadline counts in Georgia", board: "Board of Equalization", statute: "O.C.G.A. §48-5-311" },
  FL: { name: "Florida", deadlineNote: "25 days after your TRIM notice (typically mid-September)", filingNote: "⚠️ Florida requires RECEIPT by deadline — not just postmark. File 7+ days early.", board: "Value Adjustment Board (VAB)", statute: "Florida Statute §194.011" },
  // servingFrom: we are NOT taking Arkansas or Alabama orders yet.
  //
  // Both windows are open right now (AR closes 10 Aug, AL 17 Aug) and both would
  // have mailed immediately — but the destination address for every non-Florida
  // state is obtained by asking a model in pages/api/lookup.js and is then cached
  // for 180 days, with no verification and no confidence gate. Florida solved this
  // with lib/flVabAddresses.js: 67 addresses confirmed by phone, and send-letter.js
  // refuses to mail an unconfirmed one. That gate lives inside `if (isFL)`.
  //
  // So rather than sell into a state where we cannot vouch for the envelope, we
  // capture the homeowner and tell them the truth: we will serve them next season.
  // Remove servingFrom once that state has a verified address table AND
  // send-letter.js gates on it.
  AR: { name: "Arkansas", servingFrom: 2027, deadlineNote: "Third Monday in August (August 17, 2026)", filingNote: "Postmark by deadline counts in Arkansas", board: "County Board of Equalization", statute: "Arkansas Code §26-27-317" },
  AL: { name: "Alabama", servingFrom: 2027, deadlineNote: "30 days from your Notice of Valuation (April–August)", filingNote: "File 7+ days before window closes — treat as receipt deadline.", board: "Board of Equalization", statute: "Code of Alabama §40-3-20" }
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

function NavBar({ step, account, property }) {
  /**
   * "Sign in" IS AN EXIT, AND IT ONLY BELONGS ON THE FIRST SCREEN.
   *
   * This read `["account", "property"]` when `account` was step one and `property`
   * step two — the screens where a returning customer might realise they are in
   * the wrong place, with nothing entered yet to lose. Reordering the funnel on
   * 23 Aug 2026 left it pointing at the LAST screen before payment: the details
   * step now sits immediately above the Florida fee screen and checkout, and all
   * funnel state lives in React state only. One click on a prominent navy button
   * and a customer who has given the address, read the verdict and priced their
   * defects is on a sign-in page with every bit of it gone — signing in to an
   * account that, since the password moved to /success, they probably have no
   * password for.
   *
   * The exit belongs on the first screen and nowhere else; every screen after it
   * offers help instead. Found by adversarial review of the diff.
   */
  const isFirstStep = step === "property";
  const rightText = isFirstStep ? "Have an account? Sign in" : "Need help? Contact us";
  /**
   * "Need help? Contact us" used to be mailto:support@taxappealusa.com. Broken two
   * ways: support@ does not exist in the GoDaddy account, and a mailto: link does
   * nothing at all on a phone or any machine with no mail client configured. A
   * customer stuck mid-funnel clicked it and got silence.
   *
   * It now opens a form that posts to /api/contact and emails customerservice@.
   * The sign-in link on the early steps is a real page, so that stays an anchor.
   */
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 19, color: C.darkNavy, lineHeight: 1 }}>TaxAppeal</div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Property Tax Dispute</div>
        </div>
      </div>
      {isFirstStep ? (
        <a href="/portal" className="nav-right" style={{ fontSize: 15, fontWeight: 500, color: C.white, background: C.navy, textDecoration: "none", fontFamily: "'DM Sans', sans-serif", padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.navy}`, transition: "background 0.2s" }}>{rightText}</a>
      ) : (
        <button type="button" onClick={() => setContactOpen(true)} className="nav-right" style={{ fontSize: 15, fontWeight: 500, color: C.white, background: C.navy, textDecoration: "none", fontFamily: "'DM Sans', sans-serif", padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.navy}`, transition: "background 0.2s", cursor: "pointer" }}>{rightText}</button>
      )}
      <ContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        context={{
          step,
          email: account?.email || '',
          address: property ? [property.street, property.city, property.state, property.zip].filter(Boolean).join(', ') : '',
          county: property?.county || '',
          state: property?.state || '',
        }}
      />
    </div>
  );
}

function ProgressBar({ currentStep }) {
  // The eligibility check and the Florida fee screen are not their own numbered
  // steps — they sit between "Your Property" and "Property Issues". Without this
  // STEPS.indexOf returns -1 on those screens and the whole bar renders as though
  // the customer had not started, which reads as progress being lost.
  // 'florida-fee' moved from 'issues' to 'account' when the account step moved
  // below issues — it now sits between "Your Details" and the review screen, so
  // showing it as "Property Issues" would walk the bar backwards.
  // 'florida-check' maps to `issues`, not `property`. It runs at two points: pass
  // one between property and issues, pass two — the rescue re-check with the cost
  // to cure — between issues and account. Mapping it to `property` walked the bar
  // BACKWARDS on pass two, on the screen where a marginal customer is deciding
  // whether to carry on, which is the exact symptom this map exists to prevent.
  // `issues` is the position that is right for one pass and adjacent for the other.
  const SUBSTEPS = { 'florida-check': 'issues', 'florida-fee': 'account' };
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
  const state = SUPPORTED_STATES[stateCode];

  /**
   * This screen was the closest of the five to correct and still wrong twice over.
   * It tracked the result in `submitted` — but `.then()` fires on ANY response
   * including a 500, so a rejected save set it to true; and nothing ever read
   * `submitted` anyway, so the green panel below rendered regardless. State set,
   * read nowhere, exactly like `needsManualFiling` before it.
   */
  // Built unconditionally now. <LeadCapture> asks for the email when we do not
  // already hold one, which since 23 Aug 2026 is the ordinary case — this screen
  // is reached from the property step, and the details step is below it.
  const capturePayload = {
    email: account?.email || "",
    name: `${account?.firstName || ""} ${account?.lastName || ""}`.trim(),
    state: stateCode,
    county: null,
    propertyAddress: property ? `${property.street}, ${property.city}, ${property.state} ${property.zip}` : null,
    notifyDate: windowStatus?.openDate ? windowStatus.openDate.toISOString().split("T")[0] : null,
  };

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
        <LeadCapture
          payload={capturePayload}
          street={property?.street}
          promise={`the day the ${state.name} filing window opens. No action needed on your end.`}
        />
        <div style={{ marginTop: 16 }}>
          <button style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }} onClick={onBack}>← Back</button>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * LEAD CAPTURE — ONE HOOK, AND THE CONFIRMATION CANNOT OUTRUN IT
 * ============================================================================
 * Five screens refuse a sale and save the homeowner instead: an unsupported
 * state, a state we serve from 2027, a closed filing window, an unconfirmed
 * Florida county, and a Florida property with no parcel record. All five did
 * this:
 *
 *     fetch('/api/join-waitlist', {...}).catch((e) => console.error(e))
 *
 * and then rendered "✓ Saved — we'll write to you at <email> about <street>"
 * unconditionally. Fire and forget, no retry, no alert, and an affirmative
 * promise to the customer that the code had no idea whether it had kept. If
 * Supabase was down or the request failed we lost the lead AND told them we had
 * it, and the only trace was a console line in a browser we cannot read.
 *
 * That is the defect the note below was written about, narrowed rather than
 * removed. The old version set `submitted = true` and said "You're on the list!"
 * with no network call at all. Adding the call without binding the message to its
 * RESULT left the lie intact for every failure case.
 *
 * So: status is 'saving' | 'saved' | 'failed', the success panel renders ONLY on
 * 'saved', and a failure is visible to the homeowner with a working retry. Three
 * attempts with backoff, because the common failure here is a cold start or a
 * blip rather than a bad request — but a 4xx that is not a rate limit will not
 * become valid on the second try, so we stop rather than spin.
 *
 * The server end alerts separately (see pages/api/join-waitlist.js). This half
 * cannot: a browser that failed to reach us also cannot tell us that it failed.
 *
 * ============================================================================
 * 'idle' — ADDED 23 Aug 2026, AND IT IS THE SAME BUG A THIRD TIME
 * ============================================================================
 * The initial status was 'saving'. With no email in the payload the effect
 * returned immediately and nothing ever moved it, so LeadCaptureNotice rendered
 * "Saving your details…" permanently — for a customer whose details we did not
 * have and were never going to save.
 *
 * That was unreachable while the account step was step one, because everybody who
 * could see one of these screens had already given us an email. Moving the
 * account step below the property step made it the ORDINARY case for all three:
 * UnsupportedState, FilingWindowClosed and FloridaCountyUnavailable are all
 * reached from the property step, which is now the first thing anyone sees.
 *
 * It is the same defect this hook was written to kill, third variation: a panel
 * asserting something the code is not doing. "You're on the list!" with no
 * network call, then a success panel that ignored the result, now a spinner for a
 * request that was never issued.
 *
 * So 'idle' means WE HAVE NOTHING TO SAVE AND HAVE NOT PRETENDED OTHERWISE, and
 * <LeadCapture> renders an email field instead of a status. Telling somebody the
 * window is shut and then asking for their email is the right order; asking first
 * and telling them afterwards is the version that reads as a bait.
 */
function useLeadCapture(payload) {
  const [status, setStatus] = useState(payload?.email ? 'saving' : 'idle');
  const [nonce, setNonce] = useState(0);
  // Keyed on the ADDRESS, not a boolean. An email that arrives later — typed into
  // the field on one of these screens — is a different payload and must fire; a
  // boolean latch would swallow it and the customer would watch a dead form.
  const started = useRef(null);

  useEffect(() => {
    if (!payload || !payload.email) return;
    if (started.current === payload.email) return;
    started.current = payload.email;
    let cancelled = false;

    (async () => {
      setStatus('saving');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const res = await fetch('/api/join-waitlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            if (!cancelled) setStatus('saved');
            return;
          }
          // A malformed body or a rejected reason will not become valid on the
          // second try. 429 will, and so will anything 5xx.
          if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        } catch (e) {
          console.error('waitlist save attempt failed:', e);
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
      if (!cancelled) setStatus('failed');
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, payload?.email]);

  return {
    status,
    retry: () => { started.current = null; setNonce((n) => n + 1); },
  };
}

/**
 * The panel every refusal screen renders. Deliberately ONE component: the reason
 * the original bug survived a fix is that the promise was hand-written into each
 * screen, so correcting one left the other four saying the same untrue thing.
 *
 * `promise` is what we are actually committing to, and it differs per screen —
 * "when Nassau County confirms its fee" is not "when Arkansas opens in 2027".
 */
/**
 * THE DEAD-END SCREENS' EMAIL CAPTURE, in the only order that is honest.
 *
 * ============================================================================
 * WHY THIS EXISTS NOW AND DID NOT BEFORE
 * ============================================================================
 * UnsupportedState, FilingWindowClosed and FloridaCountyUnavailable all end the
 * funnel and all promise an email when the thing that blocked it clears. Until
 * 23 Aug 2026 they could keep that promise without asking for anything, because
 * the account step was step one — everybody who reached them had already handed
 * over a name and an email.
 *
 * The account step is step three now. All three of these are reached from the
 * property step, which is the first screen. So the promise these pages make had
 * become one they had no way to keep, and useLeadCapture's spinner said "Saving
 * your details…" about a request that was never issued.
 *
 * ============================================================================
 * REFUSE FIRST, THEN ASK
 * ============================================================================
 * The field renders BELOW the sentence explaining why we cannot help. The other
 * arrangement — collect the details, then reveal the wall — captures marginally
 * more addresses and reads as a bait, which is a poor trade for a business whose
 * entire claim is a refusal the homeowner can check for themselves.
 *
 * When an email is already held (a customer who got as far as the details step and
 * came back, or any pre-existing path) it saves on mount exactly as before and no
 * field is shown. Asking somebody to retype what they have already typed adds a
 * step whose only possible outcome is losing the record.
 */
function LeadCapture({ payload, promise, street }) {
  const [typed, setTyped] = useState('');
  const [email, setEmail] = useState(payload?.email || '');
  const [err, setErr] = useState('');
  const capture = useLeadCapture(email ? { ...payload, email } : null);

  if (!email) {
    return (
      <div style={{ padding: 18, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, textAlign: "left" }}>
        <div style={{ fontSize: 13, color: C.darkNavy, fontWeight: 700, marginBottom: 8 }}>
          Want us to tell you {promise || "when this changes"}
        </div>
        <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6, marginBottom: 12 }}>
          Leave your email and that is the only thing we will send. Nothing else &mdash; no marketing.
        </div>
        {err && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            style={{ flex: "2 1 220px", padding: "11px 13px", fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit" }}
          />
          <button
            style={{ ...primaryBtn, flex: "1 1 140px", width: "auto", padding: "11px 18px", fontSize: 14 }}
            onClick={() => {
              const v = typed.trim();
              // The server validates too. This is here so a typo is corrected on
              // the screen the customer is looking at rather than becoming a
              // 'failed' panel that reads as our fault.
              if (!v.includes('@')) { setErr('Enter a valid email address.'); return; }
              setErr(''); setEmail(v);
            }}
          >
            Email me
          </button>
        </div>
      </div>
    );
  }

  return (
    <LeadCaptureNotice
      status={capture.status}
      email={email}
      street={street}
      promise={promise}
      onRetry={capture.retry}
    />
  );
}

function LeadCaptureNotice({ status, email, street, promise, onRetry }) {
  // Nothing to report on and nothing pretended. <LeadCapture> renders the field
  // in this state; a bare notice reaching it must say nothing rather than claim a
  // save is in flight. See the 'idle' note on useLeadCapture.
  if (status === 'idle') return null;

  if (status === 'saved') {
    return (
      <div style={{ padding: 18, background: "#E6F4ED", border: `1px solid #B7DEC8`, borderRadius: 8, textAlign: "left" }}>
        <div style={{ fontSize: 13, color: C.green, fontWeight: 700, marginBottom: 8 }}>&#10003; Saved</div>
        <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.7 }}>
          We&rsquo;ll write to <strong style={{ color: C.darkNavy }}>{email || "you"}</strong>
          {street ? <> about <strong style={{ color: C.darkNavy }}>{street}</strong></> : null}
          {promise ? <> {promise}</> : null}
          {" "}Nothing else &mdash; no marketing.
        </div>
      </div>
    );
  }

  if (status === 'saving') {
    return (
      <div style={{ padding: 18, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, textAlign: "left" }}>
        <div style={{ fontSize: 13, color: C.mutedGray, lineHeight: 1.7 }}>Saving your details&hellip;</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 18, background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 8, textAlign: "left" }}>
      <div style={{ fontSize: 13, color: C.red, fontWeight: 700, marginBottom: 8 }}>We could not save your details</div>
      <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.7, marginBottom: 12 }}>
        Something went wrong on our end, so you are <strong style={{ color: C.darkNavy }}>not</strong> on the list yet and
        we will not be able to email you. Please try again &mdash; or write to{" "}
        <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy }}>customerservice@taxappealusa.com</a>{" "}
        and we will add you by hand.
      </div>
      <button onClick={onRetry} style={{ ...primaryBtn, width: "auto", padding: "9px 20px", fontSize: 13 }}>Try again</button>
    </div>
  );
}

/**
 * Shown for a state we do not serve, AND for a state we serve later
 * (SUPPORTED_STATES[sc].servingFrom — currently Arkansas and Alabama).
 *
 * NO BUTTON. The details are already ours by the time anyone reaches this screen:
 * name, email and password came from step 1, street/city/zip/county from step 2.
 * Asking them to press "Notify Me" to hand over what they have already typed adds
 * a step whose only possible outcome is losing the record — so we save on mount
 * and tell them plainly, the same way FilingWindowClosed does.
 *
 * THIS SCREEN USED TO LIE. The old button set submitted = true and rendered
 * "You're on the list!" without calling anything. Nobody was on any list. Every
 * homeowner who reached it since launch was told they would be emailed and was not.
 */
function UnsupportedState({ stateCode, onBack, account, property }) {
  const info = SUPPORTED_STATES[stateCode];
  const servingFrom = info?.servingFrom || null;
  const stateName = info?.name || stateCode;
  const capturePayload = {
    email: account?.email || "",
    name: `${account?.firstName || ""} ${account?.lastName || ""}`.trim(),
    state: stateCode,
    county: property?.county || null,
    propertyAddress: property && property.street
      ? `${property.street}, ${property.city}, ${property.state} ${property.zip}`
      : null,
  };

  // The headline and body describe what we will do IF we have them. Neither may
  // assert that we do — that is the notice's job, and only it knows.
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 40px" }}>
      <div style={{ ...cardStyle, maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 8 }}>
          We&rsquo;re not filing in {stateName} yet
        </h2>
        <p style={{ fontSize: 14, color: C.bodyGray, marginBottom: 20, lineHeight: 1.6 }}>
          {servingFrom
            ? <>We are not filing in {stateName} this season. We will be there for the <strong style={{ color: C.navy }}>{servingFrom}</strong> filing season, and we will email you the day filing opens so you have time to get it in.</>
            : <>We are not filing in {stateName} yet, and we will email you the day we open there.</>}
        </p>
        <LeadCapture
          payload={capturePayload}
          street={property?.street}
          promise={servingFrom ? `when ${stateName} filing opens in ${servingFrom}.` : `when we open in ${stateName}.`}
        />
        <div style={{ marginTop: 16 }}><button style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }} onClick={onBack}>&larr; Back</button></div>
      </div>
    </div>
  );
}

/**
 * A Florida county we cannot file in yet.
 *
 * Reached from applyResolvedCounty when either send-letter.js gate would refuse.
 * The funnel ENDS here — no fee step, no signature, no checkout. See the long note
 * on applyResolvedCounty for why this replaced accepting the order and filing it
 * by hand.
 *
 * NO BUTTON, saves on mount — same as UnsupportedState, for the same reason. By the
 * time anyone reaches this screen we already hold their name and email from step 1
 * and their full property address from step 2. Asking them to press "Notify Me" to
 * hand over what they have already typed adds a step whose only possible outcome is
 * losing the record.
 *
 * `blockedReason` is what stops cron/notify-waitlist.js from emailing these people
 * "your Florida filing window just opened!" on 24 August — for these counties it
 * has not, and that email is exactly the promise we are not in a position to keep.
 */
function FloridaCountyUnavailable({ county, reason, onBack, account, property }) {
  const countyName = county || "This";
  const capturePayload = {
    email: account?.email || "",
    name: `${account?.firstName || ""} ${account?.lastName || ""}`.trim(),
    state: "FL",
    county: county || null,
    propertyAddress: property && property.street
      ? `${property.street}, ${property.city}, ${property.state} ${property.zip}`
      : null,
    blockedReason: "fl_county_unconfirmed",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 40px" }}>
      <div style={{ ...cardStyle, maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 10 }}>
          {countyName} County isn&rsquo;t open yet
        </h2>

        <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 16, fontFamily: "'DM Sans', sans-serif", textAlign: "left" }}>
          {reason === "fee" ? (
            <>Before we file in a county we confirm its Value Adjustment Board filing fee for the current
            tax year directly with that county. Many boards set the fee at an organising meeting in late
            August, and {countyName} County has not published its 2026 figure yet.</>
          ) : (
            <>Before we file in a county we confirm two things directly with that county&rsquo;s Value
            Adjustment Board: the exact address a petition and filing-fee check must be delivered to, and
            the filing fee for the current tax year. {countyName} County has not published a petition
            mailing address, so we are confirming it with their clerk by phone.</>
          )}
        </p>

        <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 20, fontFamily: "'DM Sans', sans-serif", textAlign: "left" }}>
          We are not going to take your money and guess. Florida counts your petition as filed when it is
          physically <strong style={{ color: C.darkNavy }}>received</strong> with the correct fee &mdash; a
          wrong address or a short check is not a late filing, it is no filing, and there is no way to fix
          it after the deadline.
        </p>

        <LeadCapture
          payload={capturePayload}
          street={property?.street}
          promise={`as soon as ${countyName} County is confirmed, so you can file — and only if there is still enough time to get your petition delivered before your deadline.`}
        />

        <div style={{ marginTop: 16 }}>
          <button style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }} onClick={onBack}>&larr; Back</button>
        </div>
      </div>
    </div>
  );
}

/**
 * We have no parcel record for this property, so we will not file on it.
 *
 * WHY THIS REFUSES RATHER THAN WARNS. Everything the petition has to assert is
 * keyed on the parcel: the folio number in Part 1 identifies WHICH property the
 * Board is being asked about, the current assessed value is the figure being
 * disputed, and the requested value is the ask. With no roll record we hold none
 * of the three, and the DR-486 was filling all three with the literal string
 * "See county records" — on a document signed under penalty of perjury, beneath a
 * pre-checked box asserting that the assessed value exceeds market value.
 *
 * There is no version of that which is worth $89 to the homeowner. A petition the
 * clerk cannot match to a parcel is not a weak petition, it is not a petition, and
 * Florida's deadline is satisfied by receipt with no second chance.
 *
 * Saved to the waitlist like the county block, for two reasons: rolls are loaded
 * per year, so a new build or a recent split genuinely does appear later; and if a
 * lot of these land in one county it is the fastest signal that a county's roll
 * failed to load rather than that the properties do not exist.
 */
function NoParcelRecord({ property, account, detail, onBack }) {
  const outsideCoverage = detail?.reason === 'outside_coverage';
  /**
   * STILL CONDITIONAL ON AN EMAIL, DELIBERATELY, AND NOW USUALLY A NO-OP.
   *
   * The other three dead ends were converted to <LeadCapture> on 23 Aug 2026 so
   * they could ask for an address they no longer hold. This one is not, because
   * this one deliberately promises nothing — see the note below the copy. There is
   * no email to ask for when there is nothing we have offered to send.
   *
   * Since the account step moved below the property step, most visitors reaching
   * this screen have no email and this records nothing. That loses no signal that
   * matters: /api/check already writes every `no_parcel` and `outside_coverage` to
   * check_events, which is where the coverage question is actually answered and is
   * the only place it can be counted against the checks that succeeded.
   */
  const capture = useLeadCapture(account?.email ? {
    email: account.email,
    name: `${account.firstName || ''} ${account.lastName || ''}`.trim(),
    state: 'FL',
    county: property?.county || null,
    propertyAddress: property && property.street
      ? `${property.street}, ${property.city}, ${property.state} ${property.zip}`
      : null,
    blockedReason: 'fl_no_parcel_record',
  } : null);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '56px 24px' }}>
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔍</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 25, color: C.darkNavy, marginBottom: 14 }}>
          We couldn&rsquo;t find a parcel record for this property
        </h2>

        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>
          📍 {property.street}{property.city ? `, ${property.city}` : ''}{property.zip ? ` ${property.zip}` : ''}
        </div>

        <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, textAlign: 'left', marginBottom: 16, fontFamily: "'DM Sans', sans-serif" }}>
          {outsideCoverage
            ? <>This address does not appear to be in Florida, and Florida is the only state whose Value Adjustment Board we file with at this time of year.</>
            : <>We searched the current Florida Department of Revenue tax roll and there is no parcel matching this address. That usually means one of three things: the address has a unit, lot or suite number we need, it is very recently built or recently split from another parcel and has not reached the published roll yet, or it is spelled differently on the county&rsquo;s records than the way it is written here.</>}
        </p>

        <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, textAlign: 'left', marginBottom: 16, fontFamily: "'DM Sans', sans-serif" }}>
          <strong style={{ color: C.darkNavy }}>Without that record we cannot file for you, and we are not going to try.</strong>{' '}
          A Value Adjustment Board petition has to name the parcel, state the assessed value you are
          disputing and state the value you are asking for. We would be guessing at all three, and you
          would be signing it under penalty of perjury. A petition the county cannot match to a parcel
          is not a weak petition &mdash; it is not a petition at all, and Florida gives no second chance
          once the deadline passes.
        </p>

        <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, textAlign: 'left', marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>
          <strong style={{ color: C.darkNavy }}>Worth trying first:</strong> go back and check the address
          against your TRIM notice exactly as the county writes it &mdash; including any unit, lot or
          suite number. That fixes most of these.
        </p>

        {/* THE ONE SCREEN THAT DELIBERATELY DOES NOT RENDER LeadCaptureNotice.

            The other four promise an email: when the county confirms, when the
            window opens, when the state opens. This one cannot. cron/notify-waitlist
            skips every blocked_reason as a catch-all, and unlike fl_county_unconfirmed
            there is no branch that ever clears fl_no_parcel_record — so nothing is
            scheduled to contact these people, ever.

            We still WRITE the row, because the count is worth seeing on /admin and a
            cluster of them in one county is a signal the roll load is wrong. But
            showing "✓ Saved — we'll write to you" here would be a fresh instance of
            exactly the defect this whole change removes: a promise with nothing
            behind it. So the panel says only what is unconditionally true — you were
            not billed — and points at a human who will actually answer.

            If a job is ever built that revisits these, this comment is the thing to
            delete, and the notice can go in. */}
        <div style={{ padding: 18, background: '#E6F4ED', border: '1px solid #B7DEC8', borderRadius: 8, textAlign: 'left' }}>
          <div style={{ fontSize: 13, color: C.green, fontWeight: 700, marginBottom: 8 }}>&#10003; Nothing charged</div>
          <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.7 }}>
            You have not been billed. If you believe this is our mistake, email{' '}
            <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy }}>customerservice@taxappealusa.com</a>{' '}
            with your address and the parcel or folio number from your TRIM notice, and we will look at
            it by hand before your deadline.
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <button style={primaryBtn} onClick={onBack}>&larr; Check my address again</button>
        </div>
      </div>
    </div>
  );
}

/**
 * WHO WE ARE FILING FOR. Third step since 23 Aug 2026, and no longer an account.
 *
 * ============================================================================
 * WHAT MOVED, AND WHY IT WAS COSTING SALES
 * ============================================================================
 * This was step one. It asked a stranger for a name, an email and a six-character
 * password before saying anything about their property, and 9 of every 12 people
 * who reached it from /check left rather than answer. They had just been told, on
 * the previous screen, that their property was worth appealing.
 *
 * It now runs after the verdict and after the condition questions — at the point
 * where the name is needed for the petition and the email is needed to send the
 * confirmation, rather than at the point where somebody is deciding whether this
 * is worth their time.
 *
 * ============================================================================
 * THE PASSWORD IS NOT ASKED HERE ANY MORE
 * ============================================================================
 * It protects the portal. The portal shows the status of an appeal that does not
 * exist yet, so the moment of need is three weeks away, not now. It is offered on
 * /success after the DR-486 signature, where the sale is closed and the friction
 * costs nothing — and never above that signature, because nothing mails until the
 * owner signs and no optional field belongs in front of a required one.
 *
 * lib/noPassword.js covers what the order row carries in the meantime and why
 * "Forgot password?" works for a customer who never set one.
 *
 * ============================================================================
 * THE NAME IS A PETITION FIELD, NOT A GREETING
 * ============================================================================
 * It goes onto the DR-486 as the owner of record, so the placeholder asks for the
 * name as the county holds it. A petition filed in a name the roll does not carry
 * is a petition the Board can reject, and the customer has no way to know that
 * from a field labelled "First Name".
 */
function StepAccount({ data, onChange, onNext, onBack, vabFeeCents }) {
  const [err, setErr] = useState("");
  const go = () => {
    if (!data.firstName || !data.lastName) return setErr("Enter your full name.");
    if (!data.email.includes("@")) return setErr("Enter a valid email address.");
    setErr(""); onNext();
  };
  return (
    <div className="page-grid">
      {/*
        ======================================================================
        THIS COLUMN COMES AFTER THE FORM ON A PHONE. 25 Aug 2026.
        ======================================================================
        On desktop .page-grid is two columns and the form sits beside this, so
        none of it is in the way. At 768px the grid collapses to one column and
        this stacks ON TOP — putting 200+ words of marketing between a customer
        who is already three steps in and the three fields they came to fill.

        They have typed their address, been told they qualify, and chosen to
        continue. Re-selling them the homepage at that point is the same mistake
        /check was making this morning: words where a control should be.

        `apply-sell` is ordered second inside the mobile media query rather than
        hidden, because the reassurance below is worth having — just not before
        the form.
      */}
      <div className="apply-sell">
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.lightBlue, color: C.navy, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>🛡️ You sign it — we mail it for you</div>
        {/* An <h1> while this was step one. It is step three now, and the page's
            heading belongs to the screen the visitor actually lands on.

            It also read "We fight your property tax bill. You keep the savings."
            — the HOMEPAGE headline, to somebody who is already inside the funnel
            and has already been told their property qualifies. Replaced with a
            line about where they actually are, and clamped: fontSize 38 was a
            hardcoded pixel value in a file with no clamp() and no vw units. */}
        <h2 className="hero" style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(1.6rem, 5.2vw, 2.375rem)", color: C.darkNavy, lineHeight: 1.15, marginBottom: 12 }}>Last step before we prepare your filing.</h2>
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
        {/*
          THE "$89 / Flat rate. No hidden cuts." BOX IS GONE. 25 Aug 2026.

          It contradicted the real total sixty lines below it in this same
          component, which correctly reads `$89 + vabFeeCents/100` and names the
          county fee. A Florida customer on this screen is paying $104-$139, and
          this box told them $89 with "no hidden cuts" written underneath — on
          the screen immediately before checkout, which is a worse place for that
          claim than the homepage, where the identical wording was removed
          earlier today.

          Not replaced with a corrected version: the honest figure is already on
          this screen, in the form card, derived rather than typed. Two price
          displays is how they came to disagree.

          The competitor comparison went with it. It belongs on a page where
          somebody is deciding whether to buy, not on the one where they are
          entering their email to complete a purchase they have already chosen.
        */}
        {[["You sign it — we mail it for you", "You review and sign your filing, then we mail it in your name"], ["We send you the proof", "We email you when it is dispatched, with the tracking details we hold"], ["Takes about 4 minutes", "Answer a few questions; you review and sign, and we do the rest"], ["Keep 100% of what you save", "No percentage cuts — your savings are yours"]].map(([t, d]) => (
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
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, marginBottom: 6 }}>Who are we filing for?</h2>
        {/* THE STATE CHIPS ARE GONE FROM THIS SIDEBAR, AND THE REASON THEY WERE
            HERE HAS GONE WITH THEM.

            The note that used to sit here was right about its own funnel: the
            sidebar was on step 1 and the state gate was on step 2, so listing all
            five states captured a name, an email and a password BEFORE an Arkansas
            homeowner learned we do not file there until 2027.

            This step is now step 3. The state gate fires on step 1 and, for a
            Florida arrival from /check, again in the verdict effect before this
            screen renders at all. Nobody reaches it whose state we have not already
            accepted — so a list of five states here is answering a question that
            was settled two screens ago, and the two of them we cannot file in read
            as an offer we are not making.

            The homepage still sells Arkansas and Alabama. That is a real open item
            and it is not this file's to fix — see "Homepage sells AR and AL" in the
            open items queue, and the two verify-pages warnings that carry it. */}
        <p style={{ fontSize: 13, color: C.bodyGray, marginBottom: 20, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
          This goes on the petition, so use the name your county has on the property
          record. We email the confirmation and the tracking to the address below.
        </p>
        {/*
          "TOTAL TODAY $89" WAS NOT THE TOTAL, AND THIS IS NOW THE SCREEN BEFORE
          CHECKOUT.
          ======================================================================
          A Florida order is $89 plus the county's VAB filing fee — $15 to $50,
          set by the county, paid on the owner's behalf under Fla. Stat.
          § 194.013. The fee screen discloses it correctly and Stripe itemises it,
          so nobody was ever charged a surprise. But this panel used to sit on
          step one as a headline price; the reorder put it immediately before the
          purchase, where a number that goes UP on the next screen reads as a
          bait rather than a summary.
          It is also unnecessary now: the county is known by the time anyone sees
          this screen — off the DOR roll for a /check arrival, or resolved before
          the fee step otherwise — so the real number can simply be shown.
          `vabFeeCents` is null when the county is genuinely not resolved yet
          (a typed non-Florida address, or a lookup still pending). Then we say
          what we know and no more, rather than printing a total we cannot stand
          behind.
        */}
        <div style={{ background: C.bg, borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif" }}>Total today</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: C.darkNavy }}>
                {vabFeeCents ? `$${89 + vabFeeCents / 100}` : "$89"}
              </span>
              <span style={{ background: "#E6F4ED", color: C.green, fontSize: 11, padding: "2px 8px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif" }}>One-time only</span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", marginTop: 6, lineHeight: 1.5 }}>
            {vabFeeCents
              ? <>$89 filing service + ${vabFeeCents / 100} county filing fee, paid to your Value Adjustment Board on your behalf.</>
              : <>$89 filing service. Your county adds its own filing fee ($15&ndash;$50), shown before you pay.</>}
          </div>
        </div>
        {err && <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 6, padding: "9px 13px", fontSize: 12, color: C.red, fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>{err}</div>}
        <div className="two-col">
          <Field label="First Name" id="fn" value={data.firstName} onChange={e => onChange("firstName", e.target.value)} placeholder="Jane" />
          <Field label="Last Name" id="ln" value={data.lastName} onChange={e => onChange("lastName", e.target.value)} placeholder="Smith" />
        </div>
        <Field label="Email Address" id="email" type="email" value={data.email} onChange={e => onChange("email", e.target.value)} placeholder="jane@example.com" />
        {/* NO PASSWORD FIELD. It is offered on /success after the signature — see
            the header of this component and lib/noPassword.js. */}
        <button style={primaryBtn} onClick={go}>Continue →</button>
        {onBack && (
          <button onClick={onBack} style={{ ...secondaryBtn, marginTop: 10 }}>← Back</button>
        )}
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif" }}>
          🔒 Secure checkout · 256-bit encryption<br />
          <span style={{ marginTop: 4, display: "block" }}>You won't be charged until your appeal is ready to file.</span>
        </div>
      </div>
    </div>
  );
}

function StepProperty({ data, onChange, onNext, onBack, onUnsupportedState, onClosedWindow }) {
  // The optional TRIM-notice override is disclosed on demand — see the comment at
  // the block itself. It used to sit between the last field and the Continue
  // button, 441px below the fold on a phone.
  const [showTaxBill, setShowTaxBill] = useState(false);
  const [err, setErr] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [checkedState, setCheckedState] = useState(null);
  const [checking, setChecking] = useState(false);
  // Drives the manual-override labelling below. Florida's TRIM notice prints three
  // values and only one of them is the one a DR-486 disputes.
  const isFL = (data.state || "").trim().toUpperCase() === "FL";

  const go = async () => {
    if (!data.street || !data.city || !data.state || !data.zip) return setErr("Please fill in the complete property address.");
    const sc = data.state.trim().toUpperCase();
    if (!SUPPORTED_STATES[sc]) { onUnsupportedState(sc); return; }
    // Checked BEFORE the filing-window test on purpose: AR and AL windows are open
    // today, so a window check would wave them straight through to checkout.
    if (SUPPORTED_STATES[sc].servingFrom) { onUnsupportedState(sc); return; }
    // FLORIDA NEEDS THE COUNTY HERE TOO, AND USED NOT TO GET IT.
    // This branch was GA-only. Georgia's county windows differ by weeks; Florida's
    // differ by up to thirteen days and this is the gate that decides whether we
    // take the money. With no county, Florida fell back to the statewide 18 Sept —
    // Miami-Dade's date — so a Hillsborough buyer on 1 September was told they had
    // 17 days when their board closes on the 7th.
    //
    // /api/resolve-county rather than a second inline Census call: it is cached and
    // rate-limited, it retries, and it returns the Census BASENAME ("St. Johns",
    // "Miami-Dade") which is the exact key shape FL_COUNTY_DATES uses. The inline
    // version below reads NAME and strips " County", which produces "Saint Johns"
    // and misses the table.
    let countyName = null;
    if (sc === "GA" || sc === "FL") {
      setChecking(true);
      try {
        const r = await fetch("/api/resolve-county", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ street: data.street, city: data.city, state: data.state, zip: data.zip }),
        });
        const j = await r.json();
        if (j?.found && j?.county) countyName = j.county;
      } catch (e) { console.log("County check failed:", e.message); }
      setChecking(false);
      // PERSIST IT. It used to live and die in this local, so `property.county` was
      // still empty on the account step, `flAccountVabFee` fell back to nothing, and
      // the screen rendered "Total today $89" — then the fee step, which resolves the
      // county properly, rendered "$114". The price went up after the customer had
      // read a total. The comment at :1012 says this was fixed; it was fixed for
      // arrivals from /check, which carry a county, and not for anyone who typed one.
      if (countyName) onChange("county", countyName);
    }
    /*
      ==========================================================================
      A GEOCODER MISS IS NOT A CLOSED WINDOW. 24 Aug.
      ==========================================================================
      The comment that used to sit here read: "The customer is not blocked: an
      unplaceable address already gets the 'pick your county' screen at the fee
      step." That was false, and this line is why — it returns before the fee step
      can ever be reached.

      With strict:true and a null county, getFilingWindowStatus falls back to the
      EARLIEST Florida deadline. Executed on 24 Aug: null -> {canFile:false,
      canPreOrder:false, daysUntilHard:9}, while Broward, Miami-Dade and Orange all
      return 25. So one failed /api/resolve-county call — a Census 403, a timeout, a
      rural address it cannot place — sent a Broward homeowner to a terminal screen
      reading "The Florida filing deadline is in 9 days ... we cannot accept new
      filings this close to the cutoff." False about their county, on the first
      screen of the funnel, with no way forward.

      The strict fallback is right for PRICING and for gating a KNOWN county. It is
      wrong as grounds for refusal when the county is simply unknown, because the
      thing it is conservative about is the one fact we have not established.

      Refusing here was also never load-bearing. Nothing can be sold through a closed
      window regardless: /api/checkout re-runs this exact call with strict:true and
      409s FILING_WINDOW_CLOSED, and re-tests county filability besides. Advancing an
      unplaceable address costs nothing and routes it to the fee step, where the
      county picker exists precisely for this case.
    */
    const ws = getFilingWindowStatus(sc, countyName, { strict: true });
    if (countyName && ws && !ws.canFile && !ws.canPreOrder) { onClosedWindow(sc, ws); return; }
    if (ws && ws.canPreOrder) { setErr(""); onNext(); return; }
    if (checkedState !== sc) { setCheckedState(sc); setShowPopup(true); return; }
    setErr(""); onNext();
  };

  return (
    <>
      {showPopup && checkedState && <DeadlinePopup stateCode={checkedState} onClose={() => { setShowPopup(false); window.scrollTo(0,0); onNext(); }} />}
      <div className="page-grid-sm">
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.lightBlue, color: C.navy, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>🏠 Step 1 of 4</div>
          {/*
            THE PAGE'S ONE <h1>, BECAUSE THIS IS NOW THE FIRST SCREEN.
            It was an <h2> under StepAccount's hero, which carried the h1 while the
            account step was step one. Reordering the funnel left /apply with no
            heading at all — caught in production by verify-pages and NOT locally,
            because line ~3864 returns <WaitlistForm /> unless
            NEXT_PUBLIC_SALES_ENABLED is 'true'. That variable is unset on a
            developer machine, so a local build renders the waitlist page (which has
            its own h1) and never renders this funnel at all.
          */}
          <h1 className="hero" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: C.darkNavy, marginBottom: 8 }}>Tell us about your property</h1>
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
          {/*
            ======================================================================
            OPTIONAL, SO IT NO LONGER STANDS BETWEEN THE FIELDS AND THE BUTTON.
            ======================================================================
            Measured 25 Aug on a 390x844 phone: the last required field ended at
            688px and the "Look up my property & continue" button sat at 1285px —
            441px BELOW the fold, with this 560px optional panel in between.

            So a customer who had typed everything asked of them could not see the
            control that moves them forward. Same disease as /check this morning:
            content where a control should be, on a screen reached by paid traffic.

            Collapsed behind a link rather than moved or deleted. It is genuinely
            useful — a TRIM notice overrides our lookup — but it is for the
            minority who have the notice in front of them, and it should cost the
            majority nothing. Same pattern as the ZIP disclosure on /check.
          */}
          {!showTaxBill && (
            <button
              type="button"
              onClick={() => setShowTaxBill(true)}
              style={{ marginTop: 12, padding: 0, fontSize: 13, color: C.navy, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              Have your tax bill handy? Enter the values yourself
            </button>
          )}
          {showTaxBill && (
          <div style={{ background: "#FAFBFC", border: `1.5px dashed #C5D0E0`, borderRadius: 10, padding: 20, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>📋</span>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif" }}>Have your tax bill handy? </span>
                <span style={{ fontSize: 13, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif" }}>(Optional)</span>
              </div>
            </div>
            {/*
              FLORIDA GETS A DIFFERENT LABEL, AND IT IS NOT COSMETIC.
              A DR-486 disputes JUST (market) value — Fla. Stat. § 193.011. A Florida
              TRIM notice prints THREE values, and the line headed "Assessed Value" is
              the Save Our Homes CAPPED figure, which on a long-held homestead sits far
              below just value. Hillsborough example from lib/dor: just $608,998,
              capped $459,927.

              This field said "Assessed Value" in every state and told the owner to
              "enter the values from your bill". A Florida owner reading their notice
              correctly typed the capped number, /api/lookup took it in preference to
              the roll's just value, and the petition then asked the Board to cut a
              number that appears on no just-value line — beneath a pre-checked
              "assessed exceeds market" box and above a Part 3 declaration signed under
              penalty of perjury.

              Labelling makes the mistake unlikely; /api/lookup's manualValueLooksCapped
              check catches it when it happens anyway. Both, because neither is
              sufficient alone.
            */}
            <p style={{ fontSize: 12, color: C.bodyGray, marginBottom: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
              {isFL
                ? <>Enter the values from your TRIM notice to override our lookup. Leave blank and we'll pull everything from public records automatically. <strong>Use the <em>Just (Market) Value</em> line — not <em>Assessed Value</em>,</strong> which is your capped Save Our Homes figure and is not what a VAB petition disputes.</>
                : <>Enter the values from your bill to override our lookup. Leave blank and we'll pull everything from public records automatically.</>}
            </p>
            <div className="two-col">
              <Field label={isFL ? "Just (Market) Value" : "Assessed Value"} id="av" value={data.manualAssessedValue} onChange={e => onChange("manualAssessedValue", e.target.value)} placeholder="$425,000" />
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
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            {/* NO BACK BUTTON ON STEP ONE. This rendered unconditionally while the
                account step sat above it. The account step moved below on 23 Aug
                2026 and this became a control with `onClick={undefined}` — it does
                not throw, it simply does nothing when pressed, which is the worst
                available outcome: the customer concludes the page is broken and
                there is no error anywhere to say so. This page has already shipped
                a dead control once (the signature button on /success) and the cost
                was two reproductions before anyone believed it. */}
            {onBack && (
              <button style={{ ...secondaryBtn, width: "auto", padding: "14px 24px" }} onClick={onBack}>← Back</button>
            )}
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
function StepFloridaCheck({ property, account, onEligible, onBack, issues, costOverrides, onAddIssues, alreadyAsked, autoAdvance }) {
  const [state, setState] = useState({ status: 'loading', data: null, comps: null });
  /**
   * Retry counter, in the fetch effect's dependency list.
   *
   * Without it, the "Try again" button on the `unavailable` screen can only reload
   * the page — and on the /check handoff path a reload is a trap, because
   * readVerdict() and the ta_property reader both removeItem on first mount. The
   * customer returns to a blank address form with the verdict and the address
   * already consumed.
   *
   * Setting status back to 'loading' alone is NOT enough and would be worse than
   * the reload: the effect's only other dependency is the issues list, which has
   * not changed, so nothing would re-run and the spinner would never resolve.
   */
  const [retryNonce, setRetryNonce] = useState(0);

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
        // Issues ride along so the SECOND visit to this screen — after the owner
        // has been asked about condition — re-runs the cap test with cost to cure
        // included. First visit sends an empty list and behaves exactly as before.
        // `source: 'apply'` is for check_events. It rides on the SHARED body
        // rather than a second object on purpose: the one string is what keeps
        // the check call and the comps call describing the same property, and
        // splitting them to keep one extra field out of /api/comps would trade a
        // real drift risk for a cosmetic one. /api/comps reads named fields and
        // ignores this.
        const body = JSON.stringify({ street: property.street, zip: property.zip, city: property.city, state: 'FL', issues: issues || [], costOverrides: costOverrides || {}, source: 'apply' });
        const [cRes, kRes] = await Promise.all([
          fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
          fetch('/api/comps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => null),
        ]);
        /**
         * ====================================================================
         * "NO RECORD OF THIS PROPERTY" IS NOT THE SAME AS "PROCEED"
         * ====================================================================
         * This line used to read:
         *
         *   if (!j || j.found === false || j.eligible === undefined) { onEligible(); return; }
         *
         * `onEligible()` advances to the issues step. So a property we hold NO
         * data on was treated as byte-identical to one we had checked and cleared,
         * and the screen never rendered — the customer saw a flicker and moved on.
         *
         * What that produced, traced end to end on 11 Aug 2026: nothing downstream
         * asked for a parcel either. `generate-dr486` printed the string
         * "See county records" into the folio box, the current-assessed-value box
         * AND the requested-value box — under a pre-checked assertion that the
         * assessed value exceeds market value, above a Part 3 declaration signed
         * under penalty of perjury. The cheque memo fell back to the owner's
         * surname, so the county's finance office and its VAB clerk held two
         * documents with no common key between them. `processOrder`'s preflight
         * required only `letter_text` and `owner_street`, so it mailed.
         *
         * Nathan's call: we do not file a petition for a property we cannot
         * identify. Refuse, say why, take nothing.
         *
         * THE THREE OUTCOMES ARE GENUINELY DIFFERENT AND MUST NOT BE COLLAPSED
         * AGAIN — collapsing them is exactly what caused this:
         *
         *   ambiguous   several parcels share the address (a condo or duplex
         *               with no unit number). The customer can fix this in ten
         *               seconds by adding their unit. Recoverable — send them back.
         *   found:false we looked, and this property is not on the roll. Refuse.
         *   error       OUR side failed — a 500, a dropped connection, Supabase
         *               down. Their property may be perfectly fine. Telling this
         *               customer "we have no record of your property" is a false
         *               statement about their home and loses a good sale. Say the
         *               check failed and let them retry.
         */
        if (!cRes.ok) { setState({ status: 'unavailable', data: null, comps: null }); return; }
        const j = await cRes.json();
        if (cancelled) return;
        if (!j || j.eligible === undefined && j.found !== false) {
          setState({ status: 'unavailable', data: null, comps: null });
          return;
        }
        if (j.found === false) {
          setState({
            status: j.reason === 'ambiguous' ? 'ambiguous' : 'noparcel',
            data: j,
            comps: null,
          });
          return;
        }

        // A comps failure must never block anyone. Only one specific verdict
        // stops the funnel: the subject itself sold above what the comps argue.
        // Thin comps do NOT stop it — a property with a failed roof still has a
        // real case on condition, and refusing those would turn a data gap into
        // a lost customer who was perfectly entitled to file.
        let comps = null;
        try { comps = kRes ? await kRes.json() : null; } catch { comps = null; }
        if (cancelled) return;

        /**
         * DID THE SALE TEST ACTUALLY RUN? A SEPARATE QUESTION FROM WHAT IT SAID.
         *
         * `comps === null` means the call was caught, refused or unparseable —
         * /api/comps is rate limited 10 per minute per client IP, and a NAT'd
         * office or carrier can exhaust that. `comps.reason` merely absent means
         * it ran and found nothing disqualifying.
         *
         * Both used to be indistinguishable, and the paragraph above is right that
         * neither may BLOCK a customer. But `autoAdvance` skips the screen, so
         * conflating them would have skipped a screen on the strength of a test
         * that never ran, and left nothing on the page to say so. The customer
         * would see the condition step and no trace of the gate declining.
         *
         * So: a comps failure still does not block, and it does not license the
         * skip either. `saleTestRan: false` sends them to the ordinary verdict
         * screen — the one they have already read — which is a redundant screen
         * rather than a silent gap.
         */
        const saleTestRan = comps !== null && typeof comps === 'object' && !comps.error;

        setState({ status: 'done', data: j, comps, saleTestRan });
      } catch {
        // A thrown fetch is our failure, not evidence about their property.
        // See the long note above — this used to call onEligible() and wave them
        // through on an outage.
        if (!cancelled) setState({ status: 'unavailable', data: null, comps: null });
      }
    })();
    return () => { cancelled = true; };
  }, [(issues || []).join('|'), retryNonce]);

  /**
   * ==========================================================================
   * ARRIVED FROM /check WITH THE VERDICT ALREADY: RUN THE GATES, SKIP THE SCREEN.
   * ==========================================================================
   * The first version of the /check handoff routed an eligible arrival straight
   * to `issues`, so this component never mounted. That skipped a refusal that
   * exists in exactly ONE place in the whole product — the sale test below.
   *
   * `subject_sold_above_indicated_value` appears in lib/dor/comps.js,
   * pages/api/comps.js and here. It is NOT in /api/checkout and NOT in
   * send-letter.js, so nothing downstream would have caught it. And the cohort it
   * refuses is precisely the cohort the handoff was carrying: in Florida a
   * `no_cap_differential` verdict overwhelmingly means the homestead cap has just
   * RESET ON A SALE, so the largest eligible bucket is recent buyers — the people
   * whose own closing figure is the strongest evidence the Property Appraiser
   * has. We would have sold $89 filings we expect to lose, to the segment least
   * able to win, on the page that exists to say no.
   *
   * So the component still mounts and both tests still run. What `autoAdvance`
   * removes is the "Your property is worth appealing" screen at the bottom of
   * this file — the duplicate of what /check just said, and the screen 9 of 12
   * customers quit at. They see the loading state and land on the condition step.
   *
   * THE QUERY IS STILL DUPLICATED. That is the honest cost: the roll lookup runs
   * twice for these visitors, and it buys the sale gate. What the handoff removes
   * is the duplicated question and the duplicated screen, not the duplicated
   * query.
   *
   * Guarded by a ref rather than by the dependency list because `onEligible` is an
   * inline arrow recreated on every render of ApplyFunnel — putting it in the deps
   * would advance the step repeatedly.
   */
  const autoAdvanced = useRef(false);
  useEffect(() => {
    if (!autoAdvance || autoAdvanced.current) return;
    const d = state.data;
    if (state.status !== 'done' || !d?.found || !d.eligible) return;
    // The sale refusal wins over eligibility, exactly as it does in the render
    // below. Auto-advancing past it would be the bug this effect exists to avoid.
    if (state.comps?.reason === 'subject_sold_above_indicated_value') return;
    // AND the test must have actually run. A rate-limited or failed /api/comps
    // yields no reason, which is indistinguishable from a clean result unless we
    // ask. Skipping a screen on a test that did not run is the same defect one
    // layer down. They get the verdict screen instead — redundant, not silent.
    if (!state.saleTestRan) return;
    autoAdvanced.current = true;
    onEligible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance, state.status, state.data, state.comps]);

  /**
   * NO FLASH OF THE SCREEN WE ARE ABOUT TO LEAVE.
   *
   * useEffect is passive: `{status:'done'}` commits and can paint the "Your
   * property is worth appealing" screen for a frame before onEligible() runs. That
   * is the exact screen autoAdvance exists to skip, and a flash of it is worse
   * than showing it properly. Rendering the loading state for the one frame in
   * between is deterministic and needs no useLayoutEffect (which warns on the
   * server).
   *
   * The conditions match the effect above exactly. If they ever drift, this
   * renders a spinner nobody dismisses — so they are written once, here, and the
   * effect reads the same three facts.
   */
  const willAutoAdvance = autoAdvance && !autoAdvanced.current
    && state.status === 'done' && state.data?.found && state.data?.eligible
    && state.saleTestRan && state.comps?.reason !== 'subject_sold_above_indicated_value';

  if (state.status === 'loading' || willAutoAdvance) {
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

  // ── Several parcels share this address. Recoverable — they add a unit. ─────
  //
  // Condos and duplexes typed without a unit number. lib/dor/parcels.js:284
  // returns every candidate with its `phy_addr2`, so we can show them the actual
  // unit list from the county roll rather than a generic "try again".
  if (state.status === 'ambiguous') {
    const units = (state.data?.candidates || []).map(c => c.unit).filter(Boolean);
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>🏢</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 25, color: C.darkNavy, marginBottom: 12 }}>
            Several properties share that address
          </h2>
          <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, textAlign: 'left', marginBottom: 16, fontFamily: "'DM Sans', sans-serif" }}>
            The county roll has more than one parcel at <strong style={{ color: C.darkNavy }}>{property.street}</strong>.
            That usually means a unit or apartment number is missing. Each unit is assessed separately, so
            we need to know which one is yours before we can petition on it.
          </p>
          {units.length > 0 && (
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 18, textAlign: 'left' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.mutedGray, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
                Units the county lists at this address
              </div>
              <div style={{ fontSize: 13, color: C.darkNavy, lineHeight: 1.8, fontFamily: "'DM Sans', sans-serif" }}>
                {units.slice(0, 12).join(' · ')}{units.length > 12 ? ` · +${units.length - 12} more` : ''}
              </div>
            </div>
          )}
          <p style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.7, textAlign: 'left', marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>
            Go back and add your unit number to the street address &mdash; for example
            &ldquo;{property.street}{units[0] ? `, ${units[0]}` : ', Unit 4B'}&rdquo;.
          </p>
          <button style={primaryBtn} onClick={onBack}>&larr; Add my unit number</button>
        </div>
      </div>
    );
  }

  // ── We looked, and this property is not on the roll. Refuse. ───────────────
  if (state.status === 'noparcel') {
    return (
      <NoParcelRecord
        property={property}
        account={account}
        detail={state.data}
        onBack={onBack}
      />
    );
  }

  // ── OUR failure, not a finding about their property. ──────────────────────
  if (state.status === 'unavailable') {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>⚠️</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 25, color: C.darkNavy, marginBottom: 12 }}>
            We couldn&rsquo;t check your property just now
          </h2>
          <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, textAlign: 'left', marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>
            This is a problem on our end, not with your property &mdash; the county roll lookup did not
            respond. We will not take your money for a petition we have not been able to check first,
            so nothing has been charged.
          </p>
          <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, textAlign: 'left', marginBottom: 22, fontFamily: "'DM Sans', sans-serif" }}>
            Please try again in a few minutes. If it keeps happening, email{' '}
            <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy }}>customerservice@taxappealusa.com</a>{' '}
            with your address and we will look it up by hand.
          </p>
          {/*
            RETRY IN PLACE. This was window.location.reload(), which on the /check
            handoff path is a trap: readVerdict() and the ta_property reader both
            removeItem on first mount, so a reload returns to a blank address form
            with the verdict and the address already consumed — the customer was
            told their property is worth appealing, hit one transient 500, and
            landed on an empty page with no explanation. That is the "apply form
            simply opened blank" failure lib/checkHandoff.js calls the most
            expensive way to fail, and autoAdvance made it newly reachable.

            Re-running the effect keeps every piece of React state, including the
            prefilled address, so a retry costs one query rather than the session.
          */}
          {/*
            RETRY IN PLACE, not window.location.reload(). See the note on
            retryNonce: a reload consumes the handoff and returns a customer who
            was just told their property is worth appealing to a blank form. This
            keeps every piece of React state, including the prefilled address, so a
            transient 500 costs one query rather than the session.
          */}
          <button style={primaryBtn} onClick={() => { setState({ status: 'loading', data: null, comps: null }); setRetryNonce((n) => n + 1); }}>Try again</button>
          <div style={{ marginTop: 14 }}>
            <button style={{ ...secondaryBtn, width: 'auto', padding: '10px 22px' }} onClick={onBack}>&larr; Back</button>
          </div>
        </div>
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
          {d.rescuable && onAddIssues && !alreadyAsked
            ? <>On comparable sales alone, an appeal wouldn&rsquo;t be worth filing</>
            : <>An appeal wouldn&rsquo;t lower your bill this year</>}
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
        {/* RESCUABLE — the required cut is within reach of a documented condition
            case, so this is a QUESTION, not a refusal. Measured on the 2026 roll,
            688,497 Florida homes sit in this band and every one of them used to be
            told flatly that an appeal could not help.

            `alreadyAsked` suppresses the invitation on the SECOND pass. Without it
            an owner who clicks through, ticks nothing and returns is invited again,
            forever. Asked once, answered — after that it is an honest no. */}
        {d.rescuable && onAddIssues && !alreadyAsked && (
          <div style={{ background: C.lightBlue, border: '1px solid #C5D3E8', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            {/* BOLD, not underlined — underline was tried first and read as a link
                across four lines of body copy. This is the only sentence on the
                screen that can change the outcome, and it sits directly above the
                button that acts on it. The text comes from qualify.js so the
                wording cannot drift apart from the arithmetic that produced it. */}
            <p style={{ color: C.darkNavy, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.75, marginBottom: 14, fontSize: 14, fontWeight: 600 }}>
              {d.conditionPrompt || 'This answer assumes your home is in average condition. What it would cost to put right a failed roof, a dead air conditioner, an original kitchen or active damage reduces what your property is worth on top of what comparable sales show.'}
            </p>
            {/* `true` = this parcel only qualifies WITH the cure. Passed explicitly:
                this used to be `onClick={onAddIssues}`, which handed the click EVENT
                to the handler — truthy, so it happened to work here and would have
                silently set the rescue flag for the eligible customer using the new
                "Review my property issues" button below. */}
            <button style={{ ...primaryBtn, width: 'auto', padding: '13px 24px' }} onClick={() => onAddIssues(true)}>
              Tell us what&rsquo;s wrong with the property →
            </button>
          </div>
        )}

        <p style={{ color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 24, fontSize: 14 }}>
          {d.rescuable && onAddIssues && !alreadyAsked
            ? <>You haven&rsquo;t been charged, and you won&rsquo;t be unless the numbers work. We re-read every roll — if this changes, we&rsquo;ll email you at the address you gave us.</>
            : <>We&rsquo;re not going to take $89 for a filing that cannot help you. We re-read every roll — if this changes, we&rsquo;ll email you at the address you gave us. Nothing else.</>}
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
        {d.cure ? 'What your documented repairs change' : 'Your property is worth appealing'}
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

      {/*
        ORDER MATTERS HERE, AND THE FIRST VERSION HAD IT WRONG.
        ======================================================================
        These two blocks sat directly under the heading, ABOVE the parcel card and
        above the figures table — so the screen opened by telling the owner their
        repairs were "9.3% of your county's $764,980 just value" before it had
        shown them which property it meant or where $764,980 came from. A delta
        has to come after the things it is a delta of.

        They now sit between the county's own figures and the savings estimates,
        which is also the right side of the fact/estimate line this file keeps:
        the delta is exact arithmetic on the roll, so it belongs with the facts
        above it, not with the ±30% projections below.
      */}
      {/*
        ====================================================================
        THE DELTA. WHAT A MINUTE OF TICKING BOXES ACTUALLY BOUGHT.
        ====================================================================
        This screen used to state the position and leave the owner to infer what
        their own answers contributed. Nathan's call, 23 Aug: show it.

        THE ARITHMETIC IS EXACT, NOT AN ESTIMATE, AND THAT IS WHY IT IS ON THIS
        SIDE OF THE LINE. qualify() asks for `jv * (1 - pct) - cure`, so a cure of
        C dollars reduces the percentage comparable sales must carry by exactly
        C / jv. No modelling, no opinion of value, no millage — two figures off
        the county roll and a division. It belongs with the facts, and the dollar
        projections stay where they are, separately, carrying their own ±30%.

        THE CURE FIGURE COMES FROM THE SERVER. lib/dor/parcels.js prices the
        owner's issue labels against the NAL row and hands the total to qualify().
        The browser holds the labels but not the row — no living area, no land
        value — so recomputing here would print a number that is not the one that
        decided anything. `d.cure` is what was used.

        WE DO NOT SAY "YOU WILL SAVE". The sentence is about what the ask
        changes. Cost to cure is the owner's evidence under § 193.011(6); whether
        the Board accepts it is the Board's to decide, and asserting otherwise is
        the unlicensed-appraisal line this whole file is careful about (counsel
        memo, question 3).
      */}
      {d.cure && d.cure.shareOfValue != null && (() => {
        const curePts = d.cure.shareOfValue * 100;
        const requiredPts = d.facts?.requiredReductionPct ?? 0;
        // Below the cap there is no gap to close — every dollar off just value
        // already reaches the bill — so "covers X of Y points" would be arithmetic
        // about a threshold that does not exist for them. 88% of the sellable
        // population is in this branch; it gets the true sentence instead.
        const hasGap = requiredPts > 0;
        const remaining = Math.max(0, requiredPts - curePts);
        return (
          <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
              Your documented repairs: {money(d.cure.dollars)}
            </div>
            <p style={{ fontSize: 14.5, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, margin: 0 }}>
              {hasGap ? (
                <>
                  That is <strong>{curePts.toFixed(1)}%</strong> of your county&rsquo;s{' '}
                  {money(d.facts?.justValue)} just value. A petition needs{' '}
                  <strong>{requiredPts.toFixed(1)}%</strong> before your bill changes, so your
                  repairs carry {curePts.toFixed(1)} of those points and comparable sales have to
                  carry the remaining <strong>{remaining.toFixed(1)}%</strong>.
                </>
              ) : (
                <>
                  That is <strong>{curePts.toFixed(1)}%</strong> of your county&rsquo;s{' '}
                  {money(d.facts?.justValue)} just value, argued off on top of whatever comparable
                  sales support. Nothing is capped below market here, so every dollar of reduction
                  reaches your bill.
                </>
              )}
            </p>
            <p style={{ fontSize: 13, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, margin: '10px 0 0' }}>
              Priced from published repair-cost data, or your own figures where you entered them.
              It goes into the petition as evidence under Fla. Stat. § 193.011(6). Whether the
              Board accepts it is the Board&rsquo;s decision.
            </p>
          </div>
        );
      })()}

      {/*
        ====================================================================
        "DID WE MISS ANYTHING?" — SCOPED, AND NOT A QUOTA.
        ====================================================================
        Shown only when the required cut is still ABOVE what comparable sales
        plausibly reach — the same `disclosure` band the cost-to-cure invitation
        on /check is scoped to. That is the state where going back is genuinely
        useful information, because a point or two decides whether this is worth
        filing at all.

        NOT shown because a total looks small. The issue list goes onto a DR-486
        signed under penalty of perjury, and a screen that says "your number is
        low, add more" is coaching somebody to inflate a sworn claim — against
        their own interest, since a petition the Board rejects costs them the
        year. So the copy is a memory aid for defects people genuinely forget,
        and it says out loud that only real ones belong on it.
      */}
      {d.cure && d.disclosure && onAddIssues && (
        <div style={{ background: '#FBFCFE', border: `1px dashed #C5D0E0`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.darkNavy, fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>
            Did we miss anything?
          </div>
          <p style={{ fontSize: 13.5, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.65, margin: '0 0 12px' }}>
            Comparable sales still have to carry the rest on their own, which is an ambitious
            reduction to ask of them &mdash; so anything else you can document counts. The ones
            owners most often forget: the age of the roof, an air conditioner past its life,
            original kitchens and baths, and drainage or flooding. <strong style={{ color: C.darkNavy }}>Only add what is actually true of
            your home</strong> — you sign this petition yourself, and a claim you cannot support
            costs you the year rather than helping.
          </p>
          <p style={{ fontSize: 13, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, margin: '0 0 12px' }}>
            If you have a repair quote for any of them, entering your own figure is stronger
            evidence than our regional average.
          </p>
          <button style={{ ...secondaryBtn, width: 'auto', padding: '11px 22px' }} onClick={() => onAddIssues(false)}>
            ← Review my property issues
          </button>
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
  /*
    The customer's OWN deadline, for the banner below. Derived rather than
    written down: Florida has no statewide date — Hillsborough closes on 7 Sept
    and Miami-Dade on the 18th — so a single printed date is wrong for most
    counties. Falls back to the receipt rule, which is true everywhere in Florida,
    when the county is not resolved yet.
  */
  const issuesCounty = String(property?.county || '').replace(/\s+County$/i, '').trim();
  let issuesDeadline = null;
  try {
    const w = issuesCounty ? getFilingWindowStatus('FL', issuesCounty) : null;
    if (w?.hardDeadline) {
      issuesDeadline = new Date(w.hardDeadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  } catch { issuesDeadline = null; }
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
            {/*
              THIS SAID "The Texas protest deadline is May 15 or 30 days after
              your appraisal notice" — on the second screen of a FLORIDA-ONLY
              funnel, in an amber alert, as the first thing on the page. 25 Aug.

              It also named Arkansas and Alabama, which apply.js refuses at step
              one, and it was static: the component already receives `property`
              and therefore knows the county, and getFilingWindowStatus knows
              that county's real date. It was urging urgency using somebody
              else's calendar.
            */}
            <strong>Don&apos;t wait — deadlines are firm.</strong>{' '}
            {issuesDeadline
              ? <>Your petition must be <em>received</em> by {issuesCounty ? `${issuesCounty} County` : 'your county'} on {issuesDeadline} — Florida counts receipt, not postmark, so we mail well ahead of it. Finish now to protect your right to appeal.</>
              : <>Florida counts a petition as filed when it is physically received, not when it is postmarked, so the useful deadline is earlier than the published one. Finish now to protect your right to appeal.</>}
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.lightBlue, color: C.navy, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>💡 Optional but strengthens your case</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.darkNavy, marginBottom: 8 }}>Property issues</h2>
        <p style={{ fontSize: 14, color: C.bodyGray, marginBottom: 10, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>Select any problems that apply. Each one will be cited as evidence in your dispute letter.</p>
        {/* Deliberately the loudest thing on the page. Cost to cure is what carries
            the 688,497 Florida homes whose comparable sales alone fall short of the
            Save Our Homes cap — an unticked box is money the owner does not get. */}
        <p style={{ fontSize: 14, color: '#B3261E', marginBottom: 24, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, fontWeight: 600 }}>Check every item that is wrong with the home — don&rsquo;t leave anything off. Each one builds your case and can lower your appraised value, which is what puts money back in your pocket.</p>
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

  /**
   * THE PARTNER COUPON FIELD.
   *
   * `perkInput` is exactly what the customer typed; `perkNormalized` is what we
   * will send. normalizePerkCode is imported from lib/partnerPerk.js — the SAME
   * function pages/api/checkout.js validates with — so the field cannot accept a
   * shape the server will reject, or reject one it would have taken. Two
   * normalisers would eventually disagree, and the failure would look like a
   * broken coupon rather than like a bug.
   *
   * DELIBERATELY NO LIVE "IS THIS CODE REAL" LOOKUP. An endpoint that answered
   * that would be an enumeration oracle for a credential worth $20, and it would
   * also lie: it could say "valid" and then lose the reservation race at
   * checkout, so the customer would be shown $69 and charged $89. Instead we
   * validate the SHAPE here, which catches every typo, and Stripe's own payment
   * page shows the real line item — "(partner coupon applied) $69.00" — before
   * anyone pays. The customer sees the truth from the system that will charge
   * them, not a promise from us.
   */
  const [perkInput, setPerkInput] = useState('');
  const perkNormalized = normalizePerkCode(perkInput);
  const perkLooksWrong = perkInput.trim().length > 0 && !perkNormalized;

  /**
   * OPERATOR PREVIEW UNLOCK — see pages/api/preview-unlock.js for the reasoning.
   *
   * Reading our own petition used to require either buying one or setting
   * NEXT_PUBLIC_PREVIEW_UNBLURRED, which lifts the blur for every visitor and has
   * to be remembered back off afterwards. Two settings of exactly that kind nearly
   * outlived their purpose on 12 Aug. This one is per-browser and expires itself.
   *
   * STARTS FALSE AND STAYS FALSE UNTIL AFTER MOUNT, DELIBERATELY. Reading
   * document.cookie during render would differ between server and client and
   * produce a hydration mismatch; more importantly, the safe state is blurred, so
   * the very first paint a customer sees can never be the unlocked one even for a
   * frame. It fails closed on every path: no cookie, no JS, no hydration.
   *
   * The env var is kept for local development, where there is no admin to log in as.
   */
  const [previewUnlocked, setPreviewUnlocked] = useState(false);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PREVIEW_UNBLURRED === 'true') { setPreviewUnlocked(true); return; }
    try {
      setPreviewUnlocked(document.cookie.split('; ').some((c) => c === 'ta_preview_unlocked=1'));
    } catch { /* no document, or cookies blocked — stay blurred */ }
  }, []);
  const pd = propData || {};
  const stateCode = property.state.trim().toUpperCase();
  const stateInfo = SUPPORTED_STATES[stateCode] || {};
  const filingWindow = getFilingWindowStatus(stateCode, pd.county, { strict: true });
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
          // NO `password`. The funnel stopped collecting one on 23 Aug 2026 — it is
          // offered on /success after the signature instead. /api/checkout has always
          // treated the field as optional (`if (password)` before it hashes), so this
          // omission is the case that branch was written for, and save-order.js writes
          // the lib/noPassword.js sentinel rather than a null.
          //
          // Sending `account.password` as an empty string would also have worked, and
          // is worse: a field that is always "" travelling through Stripe metadata to
          // a bcrypt branch is a live wire nobody can see is dead.
          address: pd.rawAddress,
          county: pd.county,
          // Carried all the way to the cheque memo and to orders.account_number.
          // Without it the Lob cheque reaches the county with nothing on it but the
          // county's own name, and a clerk who separates the cheque from the petition
          // (which is what mailrooms do) cannot tell which petition it paid for. It is
          // also the fallback key the inbound decision parser matches on — see
          // pages/api/webhooks/inbound-email.js.
          parcelId: pd.parcelId || pd.apn || '',
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
          // Normalised, never raw. checkout.js normalises again — belt and
          // braces, because this body is also reachable from anything else that
          // learns to POST it.
          perkCode: perkNormalized || '',
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
              </div>
            ))}
          </div>
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
              <div style={{ background: "rgba(255,201,64,0.10)", border: "1px solid rgba(255,201,64,0.45)", borderRadius: 10, padding: "16px 18px", margin: "16px 0 4px", fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ fontWeight: 700, color: C.gold, fontSize: 14, marginBottom: 6 }}>
                  This petition does not cite comparable sales
                </div>
                <p style={{ fontSize: 13, color: "#C7D6EA", lineHeight: 1.7, margin: "0 0 10px" }}>
                  {pd.compsReason === 'comps_do_not_support_reduction'
                    ? <>Recent sales of similar homes near you support a value at or above your assessment. We are not citing them, because doing so would argue against your own case.</>
                    : pd.compsReason === 'land_value_not_comparable'
                    ? <>Most of your property&rsquo;s value is the land itself, and the nearby sales we hold are not comparable on that basis. Comparing a lot like yours to houses on ordinary lots would produce a figure we could not defend.</>
                    : <>Too few homes of similar size and age near you sold in the assessment period for us to cite any. That is common for larger or older properties, and for neighbourhoods where houses change hands rarely.</>}
                </p>
                <p style={{ fontSize: 13, color: "#C7D6EA", lineHeight: 1.7, margin: 0 }}>
                  <strong style={{ color: C.white }}>This does not mean your petition will fail.</strong>{' '}
                  {pd.askRestsOn === 'evidence' && pd.cureTotal
                    ? <>It rests on the condition of your property — {`$${Number(pd.cureTotal).toLocaleString()}`} of documented defects, each priced from published construction cost data. Condition is a mandatory consideration under Fla. Stat. § 193.011(6), and it stands on its own without comparable sales.</>
                    : <>It rests on two grounds: the condition of your property{pd.cureTotal ? `, with ${`$${Number(pd.cureTotal).toLocaleString()}`} of documented defects priced from published cost data` : ''}, and the fact that your county set this value by mass appraisal without ever inspecting your property. Both are recognised grounds under Fla. Stat. § 193.011.</>}
                </p>
              </div>
            )}
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
                An operator lifts it for their own browser via the Unlock
                control on /admin, which sets an 8-hour cookie — see
                pages/api/preview-unlock.js. NEXT_PUBLIC_PREVIEW_UNBLURRED still
                works and is for local development only: it unblurs for EVERY
                visitor and must never be set in production. */}
            <div style={{ padding: "0 24px 20px", fontFamily: "Georgia, serif", fontSize: 13, lineHeight: 1.85, color: C.darkNavy, background: C.white, ...(previewUnlocked ? {} : { filter: "blur(4px)", opacity: 0.6, userSelect: "none" }), whiteSpace: "normal" }}>{blurredLines ? renderEvidence(blurredLines) : ( "The rest of your letter is being prepared — you will see all of it after checkout.")}</div>
          </div>
          {/* WHY THIS NOTICE IS PROMINENT.
              The blur is the paywall, and a customer who does not understand it
              reads it as a broken page rather than a deliberate boundary — they
              wonder why the document is cut off, and abandon. It sat in 12px muted
              grey under a blurred block, which is exactly where the eye does not
              go. It now reads as a deliberate statement: gold left rule, its own
              background, a heading line, and body text at the same size as the
              petition itself. */}
          <div style={{ background: C.amber, borderTop: `1px solid ${C.border}`, borderLeft: `4px solid ${C.gold}`, padding: "16px 20px", fontFamily: "'DM Sans', sans-serif" }}>
            {previewUnlocked
              ? <div style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.6 }}>
                  🔓 <strong>Preview mode</strong> — the full petition is shown unblurred for review. Customers see this section hidden until checkout.
                </div>
              : <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.darkNavy, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 17 }}>🔒</span>
                    <span>This is a preview — the rest unlocks at checkout</span>
                  </div>
                  <div style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7 }}>
                    Nothing is missing from your petition. Right after you pay, you will see the{' '}
                    <strong style={{ color: C.darkNavy }}>complete document with nothing blurred</strong> — you read all of
                    it, and you sign it yourself before anything is filed.
                  </div>
                </>}
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
        {/* Partner coupon. Placed directly above the pay button because that is
            where someone holding a code looks for it, and collapsed by default so
            the 99% who have none are not prompted to go hunting for one. */}
        <div style={{ marginTop: 18, marginBottom: 4 }}>
          <label style={{ display: "block", fontSize: 12, fontFamily: "'DM Sans', sans-serif", color: C.mutedGray, marginBottom: 6 }}>
            Have a partner coupon? (optional)
          </label>
          <input
            type="text"
            value={perkInput}
            onChange={(e) => setPerkInput(e.target.value)}
            placeholder="TAP-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            aria-label="Partner coupon code"
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 14px",
              fontSize: 14, fontFamily: "'DM Sans', sans-serif",
              letterSpacing: perkInput ? "0.06em" : "normal",
              textTransform: perkInput ? "uppercase" : "none",
              border: `1px solid ${perkLooksWrong ? "#D97706" : perkNormalized ? "#A7DFC0" : C.border}`,
              background: perkNormalized ? "#F0FBF4" : C.white,
              borderRadius: 8, outline: "none",
            }}
          />
          {perkLooksWrong && (
            <p style={{ fontSize: 12, color: "#B45309", margin: "6px 0 0", fontFamily: "'DM Sans', sans-serif" }}>
              That doesn&rsquo;t look like a coupon code. They look like <strong>TAP-K7M2-QW9F</strong> &mdash; eight letters and numbers. Leave it blank if you don&rsquo;t have one.
            </p>
          )}
          {perkNormalized && (
            <p style={{ fontSize: 12, color: "#0F5C40", margin: "6px 0 0", fontFamily: "'DM Sans', sans-serif" }}>
              $20 off will be applied if this coupon is still available. You&rsquo;ll see the final amount on the payment page before you pay.
            </p>
          )}
        </div>
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
          {[["💳", `Secure ${totalChargeLabel} payment`, "One-time, no recurring charges"], ["📬", isFLFlow ? "We mail your petition" : "We mail it certified", isFLFlow ? "Tracked USPS First Class mail to your county's Value Adjustment Board, with the filing fee paid" : "USPS certified mail to your appraisal district, with tracking"], ["🧾", "You receive the proof", isFLFlow ? "We email you the dispatch confirmation and tracking details we hold" : "USPS certified mail proof sent to you"], ["⏳", "Await the decision", isFLFlow ? "Boards respond in 30–90 days" : "Districts respond in 30–90 days"]].map(([icon, t, d]) => (
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

function StepDispute({ formData, onRestart, onAddIssues }) {
  const [loading, setLoading] = useState(true);
  const [propData, setPropData] = useState(null);
  // Non-null when the county's own figures show an appeal cannot reduce this
  // owner's tax. See the block in run() for why this stops the sale outright.
  const [noSavings, setNoSavings] = useState(null);
  // Non-null when the owner's manual entry matches their capped assessed value
  // rather than just value. Blocks the step until they pick which they meant.
  const [valueConflict, setValueConflict] = useState(null);
  const [letter, setLetter] = useState("");
  const [errMsg, setErrMsg] = useState("");
  /**
   * Whether the failure was ours-and-transient or the lookup genuinely not working.
   *
   * The heading on the error screen below was hardcoded "Lookup failed" for every
   * error reachable here. When /api/generate-dr486 answers 503 VENDOR_UNAVAILABLE —
   * the model API was briefly unreachable, nothing to do with the lookup, which had
   * already succeeded — the customer read "Lookup failed" above a sentence saying
   * their petition service was busy. Two different claims, one screen, and the one
   * in the larger type was the wrong one.
   */
  const [errTransient, setErrTransient] = useState(false);
  const ran = useRef(false);
  const { account, property, issues, costOverrides } = formData;
  const addr = `${property.street}, ${property.city}, ${property.state} ${property.zip}`;
  const stateCode = property.state.trim().toUpperCase();

  useEffect(() => { if (ran.current) return; ran.current = true; run(); }, []);

  const run = async () => {
    setLoading(true); setErrMsg(""); setErrTransient(false); setLetter(""); setPropData(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ street: property.street, city: property.city, state: property.state, zip: property.zip, manualAssessedValue: property.manualAssessedValue ? Number(String(property.manualAssessedValue).replace(/[^0-9.]/g, "")) : null, manualSqft: property.manualSqft ? Number(String(property.manualSqft).replace(/[^0-9.]/g, "")) : null, manualYearBuilt: property.manualYearBuilt || null, manualBeds: property.manualBeds || null, manualBaths: property.manualBaths || null,
          // The owner's selected defects, sent as LABELS not dollars. lib/dor/parcels.js
          // prices them server-side against this parcel's improvement value per square
          // foot, then hands the total to qualify() as cureDollars. Sending labels rather
          // than an amount is deliberate: a client cannot assert its own cure figure to
          // buy its way past the savings gate.
          issues: issues || [], costOverrides: costOverrides || {} }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || `Lookup failed (${res.status}).`); }
      const bdJson = await res.json();

      // THE OWNER TYPED THEIR CAPPED VALUE INTO THE JUST-VALUE BOX.
      //
      // /api/lookup sets this when the manual entry matches the Save Our Homes
      // capped figure and sits well below the roll's just value. Stop here rather
      // than proceeding, because everything after this point treats the number as
      // just value: the comps are selected against it, the requested value is
      // derived from it, and the DR-486 is signed under penalty of perjury.
      //
      // We do NOT silently substitute the roll's figure. The owner is the one
      // attesting, so they choose — but they choose knowing which line they read.
      if (bdJson?.manualValueLooksCapped) {
        const v = bdJson.manualValueLooksCapped;
        setLoading(false);
        setValueConflict(v);
        return;
      }

      // ── THE SAVINGS GATE ────────────────────────────────────────────────
      //
      // Florida taxes flow from ASSESSED value, which Save OurHomes caps
      // (Fla. Stat. s 193.155). Reducing JUST value — which is all a VAB
      // petition can do — only reaches the tax bill once it drops below that
      // cap. Above it, winning changes nothing.
      //
      // Measured against the full 2026 roll: 29.99% of Florida residential
      // parcels (2,522,194) need a cut of more than 35% before a single dollar
      // moves, which nothing realistic delivers. The real Hillsborough parcel
      // this was built against needs 24.5%, and a strong 25% comps result would
      // save about $57 against a $104 filing cost.
      //
      // BUT SEE `rescuable` BELOW (7 Aug 2026). A further 688,497 parcels sit in
      // the 25-35% band, where comparable sales alone fall short but a documented
      // cost to cure does not. Those must be ASKED about condition, not refused —
      // on this same parcel $63,900 of sourced cure turns $57 a year into $1,194.
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
      // COMPUTED BEFORE pd, WHICH READS IT.
      //
      // This was declared below, next to the prompt that first used it, and pd
      // then referenced `cure.total` inside its own temporal dead zone —
      // "Cannot access 'cure' before initialization", which reached the customer
      // as "Lookup failed". Identical in shape to the `savings` bug on 2 August:
      // a value added to pd whose declaration sits further down the function.
      //
      // Neither verify-routes nor verify-render catches this, because both stop
      // at the boundary of run(). That gap is item 1 of the open work.
      const cure = totalCostToCure(issues, { jv: assessedValue, lnd_val: extracted.landValue ?? null, tot_lvg_area: sqft }, costOverrides || {});

      const pd = { assessedValue, marketValue, annualTax, county, taxYear, savings, beds, baths, sqft, yearBuilt, rawAddress: addr, hasData: !!(assessedValue || marketValue), appraisalDistrict, targetReduction, reductionPctDisplay, parcelId: extracted.parcelId || extracted.apn || null, compCount: 0, compsReason: null, askRestsOn: valuation.askRestsOn, cureTotal: cure.total, valuationGrounds: valuation.grounds, valuationBasis: valuation.basisSummary };
      setPropData(pd);
      const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : null;
      const propDetails = [sqft ? `Square Footage: ${Number(sqft).toLocaleString()} sq ft` : null, yearBuilt ? `Year Built: ${yearBuilt}` : null, beds ? `Bedrooms: ${beds}` : null, baths ? `Bathrooms: ${baths}` : null, property.propType ? `Property Type: ${property.propType}` : null, sqft && assessedValue ? `Assessed Price Per Sq Ft: $${Math.round(Number(assessedValue) / Number(sqft))}` : null].filter(Boolean).join("\n");
      // The defects block now carries what each repair costs and where the figure
      // came from. A cited cost is arguable; a bare list of complaints is not.
      // Incurable conditions are listed separately and explicitly at no cost, so
      // the letter cannot imply we priced something we did not.

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
      /**
       * ══════════════════════════════════════════════════════════════════════
       * EVIDENCE BLOCKS — the model FORMATS these, it never SOURCES them.
       * ══════════════════════════════════════════════════════════════════════
       * Until 17 Aug 2026 requirement 7 below read:
       *
       *     "Section COMPARABLE SALES EVIDENCE: 4-5 recent sales from ZIP ..."
       *
       * Nothing supplied those sales. The model was being asked to produce five
       * of them from nowhere, into a document the property owner signs in their
       * own name. `pd.compCount` has been hardcoded to 0 this whole time, which
       * was the visible symptom nobody read.
       *
       * In TEXAS it is worse than a gap. Texas is a NON-DISCLOSURE state: sale
       * prices are not in public records at all, so every "recent sale" in a
       * Texas letter was necessarily invented. And a fabricated APPRAISED value
       * would be worse still than a fabricated sale price, because the district
       * can look the account up in its own system and check it.
       *
       * The fix is not better wording. It is that the data must arrive as a
       * BLOCK, exactly as `issuesBlock` already does for cost to cure — where
       * requirement 6 has always said "Never state a cost that is not given
       * above." Section 7 was the only section asking the model to source rather
       * than format, and that asymmetry was the whole bug.
       *
       * These are empty today. That is deliberate and it is not a regression:
       * an omitted section is correct, and an invented one never was. The Texas
       * engine that fills this (lib/tx/comps.js -> findComps) returns the rows,
       * the median per square foot, the stratum tier and the disclosures; wiring
       * it in is the next change, and it plugs in here.
       */
      const compsBlock = '';   // TODO(tx): populate from lib/tx/comps.js findComps()
      const marketBlock = '';  // no sourced market statistics exist in this path

      const prompt = `You are preparing a property tax protest letter that the property owner will read, sign, and submit in their own name. Output ONLY the letter — no preamble, no markdown, no explanation.\n\nPROPERTY OWNER: ${account.firstName} ${account.lastName}\nOWNER EMAIL: ${account.email}\nPROPERTY ADDRESS: ${addr}\nCOUNTY: ${county}\nSTATE: ${property.state.toUpperCase()}\nTAX YEAR: ${taxYear}\n\nSUBJECT PROPERTY CHARACTERISTICS:\n${propDetails || "See county records"}\nCurrent Assessed Value: ${fmt(assessedValue) || "See records"}\nEstimated Market Value: ${fmt(marketValue) || "N/A"}\nAnnual Tax Bill: ${fmt(annualTax) || "N/A"}\nRequested Reduction: ${reductionPctDisplay}% — from ${fmt(assessedValue)} to ${fmt(targetReduction)}\nJustification basis (cite these, do not invent others):\n${valuation.basisSummary}\n\n${issuesBlock}\n\n${compsBlock}${marketBlock}${askBasis}\n\n${districtBlock}\n\nOWNER NOTES: ${property.notes || "None."}${arNote}\n\nABSOLUTE RULES — THESE OVERRIDE EVERY NUMBERED REQUIREMENT BELOW:\nA. Every factual figure in this letter must come from the data above. If a figure is not given above, it does not belong in the letter. Do not estimate it, do not interpolate it, and do not supply a typical or representative value.\nB. Never state a sale price, sale date, or the value of any other specific property unless it appears in a block above.${property.state.toUpperCase() === 'TX' ? ' Texas is a NON-DISCLOSURE state: sale prices are not public records, so any sale price in this letter would be fabricated. State none.' : ''}\nC. If a requirement below asks for a section and no data for it was supplied above, OMIT that section entirely. An omitted section is correct. An invented one is a false statement in a document signed under the owner's name.\n\nLETTER REQUIREMENTS:\n1. Open with owner contact block: [Owner Full Name], [Owner Property Address], [Owner Email]\n2. Date: June 15, 2026\n3. Recipient address block\n4. RE: NOTICE OF PROTEST OF PROPERTY VALUATION\n5. Section SUBJECT PROPERTY DESCRIPTION: list every characteristic with exact numbers\n6. Section PROPERTY DEFECTS & CONDITIONS: cite each defect with its stated cost to cure and name the source of that cost. List non-curable conditions separately and state that no cost to cure is claimed for them. Never state a cost that is not given above.\n7. Section COMPARABLE PROPERTIES: only if a COMPARABLE PROPERTIES block appears above. If it does, reproduce it exactly — every row, every figure, and its source line — and state the median exactly as given. Do not add a row, remove a row, alter a number, or introduce any property not listed. If no such block appears above, OMIT this section entirely and make no claim anywhere in the letter about how this property compares with any other specific property.\n8. Section MARKET CONDITIONS: only if market figures are supplied above. If none are, OMIT this section. Do not state any market statistic, percentage, index, direction or trend that is not given above.\n9. Section LEGAL BASIS: cite ${stateInfo.statute || "applicable state statutes"}\n10. Demand ${reductionPctDisplay}% reduction from ${fmt(assessedValue)} to ${fmt(targetReduction)}, attributing it exactly as instructed in the paragraph above beginning "The requested reduction" or "IMPORTANT". Do NOT claim the figure derives from comparable properties, comparable sales, or market data unless a COMPARABLE PROPERTIES block was actually supplied above and reproduced in section 7.\n11. Professional closing with owner name, address, and email address. Below the owner signature block, on its own line, include exactly this sentence: "Please direct all correspondence and decisions regarding this protest to the property owner at the email address above, with a copy to: disputes@mail.taxappealusa.com (Document Preparation Service)."\n\nOutput ONLY the complete formal letter.`;
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
        // Travels with the comps so the petition cites the source it actually has,
        // rather than a source it assumes. See the admission test below.
        let flCompsSource = null;
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
            /**
             * PROVENANCE IS NOW PART OF THE ADMISSION TEST — added 11 Aug 2026.
             *
             * This accepted any sufficient comp set. The county path
             * (pages/api/comps.js) returns `basis.source === 'county'`; the
             * RentCast fallback returns no `basis` at all and no
             * `supportsReduction` key either — so `undefined !== false` was true
             * and vendor comps sailed through.
             *
             * That mattered because generate-dr486.js printed ONE hardcoded source
             * line under whatever it was given: "qualified arms-length sales from
             * the Florida Department of Revenue sale data file … drawn from the
             * same appraiser neighborhood as the subject property." RentCast rows
             * are neither, and they carry their own correct attribution
             * ('...via RentCast') which nothing read. So a petition signed under
             * penalty of perjury asserted a source for its evidence that was not
             * the source.
             *
             * A Florida petition now cites county sale data or it cites nothing.
             * Nothing is a supported outcome — the zero-comps explainer already
             * exists on the preview and the petition argues methodology instead.
             */
            const compsAreCountySourced = cJson?.basis?.source === 'county';
            if (cJson?.sufficient && cJson?.supportsReduction !== false && Array.isArray(cJson.comps) && compsAreCountySourced) {
              flComps = cJson.comps;
              flCompsSource = 'county';
            } else if (cJson?.sufficient && Array.isArray(cJson.comps) && !compsAreCountySourced) {
              console.warn('[apply] comps rejected — not county-sourced, so they cannot carry the DOR attribution');
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
            compsSource: flCompsSource,
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
        /**
         * A 503 from this route means the model API was briefly unreachable or slow —
         * see the header of pages/api/generate-dr486.js. The lookup already worked, so
         * this is worth telling the customer plainly and worth them clicking Try Again
         * for. Read from the STATUS, not from the message text, so the copy can change
         * without silently changing what the screen claims.
         */
        if (dr486Res.status === 503) setErrTransient(true);
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
            {noSavings.rescuable
              ? 'On comparable sales alone, an appeal wouldn’t be worth filing'
              : 'An appeal wouldn’t lower your tax bill'}
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.65, color: C.bodyGray, marginBottom: 18 }}>
            {noSavings.message}
          </p>
          <div style={{ background: "#FFF8E6", border: "1px solid #F0DFB0", borderRadius: 8, padding: 16, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontFamily: "'DM Sans', sans-serif", padding: "5px 0", color: C.bodyGray }}>
              <span>Market (just) value</span><strong style={{ color: C.darkNavy }}>{fmtUsd(noSavings.jv)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontFamily: "'DM Sans', sans-serif", padding: "5px 0", color: C.bodyGray }}>
              <span>Your assessment is capped at</span><strong style={{ color: C.darkNavy }}>{fmtUsd(noSavings.breakEven)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontFamily: "'DM Sans', sans-serif", padding: "5px 0", color: C.bodyGray }}>
              <span>Capped below market by</span><strong style={{ color: C.darkNavy }}>{fmtUsd(noSavings.differential)}</strong>
            </div>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.65, color: C.mutedGray, marginBottom: 20 }}>
            You haven&rsquo;t been charged. Check these figures against your TRIM notice — they come
            straight from your county&rsquo;s own records and should match exactly. This can change:
            buying or selling resets the cap, and a falling market brings your market value back
            toward the capped figure.
          </p>

          {/* RESCUABLE — the required reduction is within reach of a documented
              condition case, so this is a QUESTION, not a refusal. Measured against
              the 2026 roll, 688,497 Florida homes sit in this band and every one of
              them used to be told flatly that an appeal could not help. The primary
              action has to be "tell us about the condition", not "go away". */}
          {noSavings.rescuable && onAddIssues && (
            <div style={{ background: "#EEF6FF", border: "1px solid #C7DEF7", borderRadius: 8, padding: 16, marginBottom: 18 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.65, color: C.bodyGray, marginBottom: 12 }}>
                <strong>This answer assumes your home is in average condition.</strong> Cost to cure —
                what it would take to put right a failed roof, a dead air conditioner, an original
                kitchen, active damage — reduces what your property is worth <em>on top of</em> what
                comparable sales show. On this property that can be the difference between an appeal
                being pointless and being worth filing.
              </p>
              <button
                style={{ ...primaryBtn, width: "auto", padding: "11px 22px" }}
                onClick={onAddIssues}
              >
                Tell us what&rsquo;s wrong with the property →
              </button>
            </div>
          )}

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
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: C.darkNavy, marginBottom: 8 }}>{errTransient ? "One moment needed" : "Lookup failed"}</h2>
          <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: C.red, fontFamily: "'DM Sans', sans-serif", marginBottom: 20, textAlign: "left" }}>{errMsg}</div>
          <button style={primaryBtn} onClick={() => { ran.current = false; run(); ran.current = true; }}>Try Again</button>
          <div style={{ marginTop: 12 }}><button style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }} onClick={onRestart}>← Start over</button></div>
        </div>
      </div>
    );
  }

  /*
    THE VALUE THE OWNER TYPED LOOKS LIKE THEIR CAPPED ASSESSED VALUE.

    Not an error screen and not a refusal — a fork. A Florida TRIM notice prints
    Just, Assessed and Taxable; only Just is what a DR-486 disputes, and the line
    headed "Assessed Value" is the Save Our Homes capped figure. An owner who reads
    their own notice correctly and types the number under that heading produces a
    petition asking the Board to cut a figure that appears on no just-value line.

    Both numbers are shown with their source named, because the whole failure was
    that two different numbers looked interchangeable. Choosing the roll clears the
    override and re-runs; keeping their own figure is allowed, because they are the
    one signing and there are legitimate reasons the roll is wrong — but it is now
    a decision rather than an accident.
  */
  if (valueConflict) {
    const money = (n) => `$${Number(n).toLocaleString()}`;
    return (
      <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 24px" }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 40, marginBottom: 16, textAlign: "center" }}>🧾</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: C.darkNavy, marginBottom: 10, textAlign: "center" }}>Which value did you mean?</h2>
          <p style={{ fontSize: 14, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 18 }}>
            {/* Says "at or below", not "matches". The trigger is at-or-below the cap, so the
                typed figure is often the Assessed or Taxable line from LAST year's column of a
                two-year TRIM notice rather than an exact match on this year's. Claiming a match
                on a number the customer can see is different would read as a bug. */}
            You entered <strong>{money(valueConflict.typed)}</strong>. That is at or below the <strong>Assessed Value</strong> your county has on file — your <em>Save Our Homes capped</em> figure, which is not what a petition disputes.
          </p>
          <p style={{ fontSize: 14, color: C.bodyGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 18 }}>
            A VAB petition disputes <strong>Just (Market) Value</strong>, which your county reports as <strong>{money(valueConflict.justValue)}</strong>. Those are different lines on your TRIM notice and only the second one is what the Board rules on.
          </p>
          <div style={{ background: "#F0F7FF", border: "1px solid #C5D9F0", borderRadius: 8, padding: "12px 16px", marginBottom: 22, fontSize: 13, color: "#1B4D8E", fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ marginBottom: 4 }}><strong>Just (market) value</strong> — county roll: {money(valueConflict.justValue)}</div>
            <div><strong>Assessed value</strong> — after the Save Our Homes cap: {money(valueConflict.cappedAssessedValue)}</div>
          </div>
          <button
            style={primaryBtn}
            onClick={() => {
              formData.property.manualAssessedValue = "";
              setValueConflict(null);
              ran.current = false; run(); ran.current = true;
            }}
          >
            Use the county's just value — {money(valueConflict.justValue)}
          </button>
          <div style={{ marginTop: 12 }}>
            <button
              style={{ ...secondaryBtn, width: "auto", padding: "10px 22px" }}
              onClick={() => { setValueConflict(null); setLoading(false); onRestart(); }}
            >
              ← Go back and re-enter it
            </button>
          </div>
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
  // The funnel opens on the property, not on a form. See the note on STEPS.
  const [step, setStep] = useState("property");
  // No `password` field. It is not collected in this funnel any more and nothing
  // downstream reads one — carrying an always-empty string here is the live wire
  // nobody can see is dead. See lib/noPassword.js and the note on StepAccount.
  const [account, setAccount] = useState({ firstName: "", lastName: "", email: "" });
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
  /**
   * A Florida county we will not take an order in yet, and why.
   *
   * Set by applyResolvedCounty when either of send-letter.js's two refusal gates
   * would fire. Renders FloridaCountyUnavailable INSTEAD of the fee step, so the
   * funnel terminates BEFORE checkout rather than after it. See the long note on
   * applyResolvedCounty for why this replaced the hand-filing path.
   */
  const [flCountyBlocked, setFlCountyBlocked] = useState(null);
  const [flFeeData, setFlFeeData] = useState(null);
  const [flSignature, setFlSignature] = useState(null);
  /**
   * Set when the Florida cap check sent the owner to the condition step rather
   * than refusing them. Two jobs:
   *   1. The issues step must return them to the CHECK, not run on to the fee
   *      step — otherwise a property that still cannot benefit walks straight
   *      past the gate that just stopped it.
   *   2. The invitation is suppressed on the way back, so an owner who ticks
   *      nothing gets an honest no instead of the same question again.
   */
  const [flRescueReturn, setFlRescueReturn] = useState(false);

  /**
   * THE COUNTY THE DOR ROLL ITSELF REPORTED, when they arrived from /check.
   *
   * Empty on the ordinary path, and every consumer must behave exactly as before
   * when it is. Set only by the verdict effect below, from the parcel's own DOR
   * county number — see lib/dor/coverage.js LOADED_COUNTIES.
   *
   * It is a SHORTCUT, not a second source of truth. getFlVabFee and
   * isFlCountySupported are still the tables that decide anything, and
   * applyResolvedCounty is still the only function that acts on a county. What
   * this removes is one round trip to the Census geocoder for a fact the roll
   * already stated — the same geocoder whose four-minute outage is why the county
   * picker screen exists.
   */
  const [flRollCounty, setFlRollCounty] = useState('');

  /**
   * Skip the "worth appealing" screen — never the tests behind it.
   *
   * Set only for an eligible arrival from /check, who has already read that
   * verdict. StepFloridaCheck still mounts, still runs the cap test and the sale
   * test, and still renders every refusal; this only suppresses the confirmation
   * screen they have already seen. Cleared the moment they can change the
   * property, because then the verdict they read no longer describes it.
   */
  const [flAutoAdvance, setFlAutoAdvance] = useState(false);

  /**
   * THE CONDITION STEP HAS BEEN ANSWERED — so `florida-check` means something
   * different from here on.
   *
   * Before the issues step, that screen is the verdict. After it, the same screen
   * re-runs qualify WITH the documented cost to cure, so it is a summary of what
   * the owner's own answers changed. Without this flag `onEligible` cannot tell
   * the two apart and sends a customer who has just finished the issues step back
   * to the issues step.
   *
   * Distinct from flRescueReturn on purpose. That one means "this parcel only
   * qualifies WITH the cure" and governs whether a sale may proceed at all;
   * this one means "the question has been asked" and governs which screen comes
   * next. Overloading one for the other is how the rescue gate came to be
   * walk-back-able in the first place.
   */
  const [flIssuesDone, setFlIssuesDone] = useState(false);

  /**
   * ARRIVED FROM /check HAVING ALREADY SAID YES TO THE CONDITION QUESTION.
   *
   * /check now renders the same `conditionPrompt` this funnel does and sends them
   * here with sessionStorage 'ta_intent' = 'condition' (see stashConditionIntent
   * in pages/check.js). Without this flag the property step hands them to
   * `florida-check`, /api/check returns the identical rescuable answer, and the
   * funnel opens by telling somebody who has just volunteered to describe their
   * failed roof that an appeal would not be worth filing — then asks them to
   * describe it. Asked once, on /check; acted on once, here.
   *
   * Read in its own effect rather than beside 'ta_property' so it sits AFTER the
   * state it feeds. Read and cleared, so a second visit cannot inherit an intent
   * that belonged to a different property.
   */
  const [flConditionIntent, setFlConditionIntent] = useState(false);
  useEffect(() => {
    try {
      const intent = sessionStorage.getItem('ta_intent');
      if (!intent) return;
      sessionStorage.removeItem('ta_intent');
      if (intent === 'condition') setFlConditionIntent(true);
    } catch {
      // Storage unavailable. They get asked the condition question here instead,
      // which is exactly where this funnel stood before /check could ask it.
    }
  }, []);

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
    /*
      THE ROLL ALREADY SAID WHICH COUNTY THIS IS.
      Set only when the visitor arrived from /check, where the county comes off
      the parcel's own DOR county number. Asking the Census geocoder to re-derive
      a fact the assessment roll stated is a network call that can time out, can
      answer `confidence: 'zip'` and send a resolved customer to the county
      picker, and cannot be more right than the roll it is being checked against.

      applyResolvedCounty is still the only thing that acts on the answer, so both
      refusal gates below it fire exactly as they do on the typed path.
    */
    if (flRollCounty) { applyResolvedCounty(flRollCounty, 'roll'); return; }
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
   * Accept a county — resolved automatically or chosen by the customer — and either
   * move on to the fee step or stop the funnel.
   *
   * ==========================================================================
   * WE DO NOT FILE BY HAND. WE REFUSE THE SALE AND TAKE THE EMAIL.
   * ==========================================================================
   * Nathan's call, 11 Aug 2026, replacing the accept-and-hand-file model.
   *
   * The previous design accepted an order in an unconfirmed county, warned the
   * customer on the payment screen, and flagged it `needsManualFiling` so it would
   * "land in the ops queue". There was no ops queue. The flag never left this file:
   * it was never in the /api/checkout body, never in Stripe metadata, never a
   * column. So the order queued like any other, send-letter refused it every hour,
   * and cron/process-queued-orders swallowed the failure — paid, promised, never
   * filed, and invisible until the deadline had passed.
   *
   * Refusing is also the better product. Florida counts a petition as filed when it
   * is physically RECEIVED with the correct fee. A guessed address or a short check
   * is not a late filing, it is no filing, and there is no recovery after the
   * deadline. Taking money against that is a refund we have to remember to make and
   * a year the homeowner cannot get back.
   *
   * So: capture the email, say plainly why, and notify them if and when the county
   * confirms. cron/notify-waitlist.js owns that promise — it re-tests these same
   * two gates every day and only writes to someone once there is still enough time
   * to file. See `blocked_reason = 'fl_county_unconfirmed'` there.
   *
   * BOTH GATES ARE TESTED HERE, and they must stay identical to the two in
   * send-letter.js:148-169 or the refusal is in the wrong place:
   *   - no confirmed VAB mailing address  (FL_COUNTY_UNSUPPORTED) — 8 counties
   *   - fee confidence !== 'confirmed'    (FL_FEE_UNCONFIRMED)    — Nassau,
   *     Columbia, Levy, which have a good address and a $50 guess
   * scripts/verify-fl-dispatch.mjs asserts the two sets agree.
   */
  const applyResolvedCounty = (county, source = 'address') => {
    const feeInfo = getFlVabFee(county);
    const addressOk = isFlCountySupported(county);
    const feeOk = feeInfo?.confidence === 'confirmed';

    if (!addressOk || !feeOk) {
      setProperty(p => ({ ...p, county }));
      setFlCountyError(null);
      // Which gate failed changes one sentence of the copy, nothing else. Fee-only
      // is the honest "waiting on their board meeting" case; a missing address is
      // waiting on a phone call.
      setFlCountyBlocked({ county, reason: !addressOk ? 'address' : 'fee' });
      window.scrollTo(0, 0);
      return;
    }

    setProperty(p => ({ ...p, county }));
    setFlFeeData({ ...feeInfo, county, countySource: source });
    setFlCountyError(null);
    setFlCountyBlocked(null);
    setStep('florida-fee');
    window.scrollTo(0, 0);
  };

  /**
   * ==========================================================================
   * ARRIVED FROM /check WITH THE ANSWER ALREADY IN HAND.
   * ==========================================================================
   * Measured 21-23 Aug: 17 people were told "an appeal could lower your bill",
   * 12 clicked through to here, and 3 ran a check. The 9 who did not were
   * looking at the account step, then the property step, then `florida-check` —
   * a screen that re-ran the same qualify() against the same roll row to print
   * the sentence they had just read. The check is the product; asking for it
   * twice is the funnel telling them it did not believe itself.
   *
   * `ta_intent` gave the RESCUABLE branch this exemption on 22 Aug. This gives it
   * to the eligible branch, which is the larger one and the only one with a sale
   * at the end of it.
   *
   * ==========================================================================
   * EVERY GATE STILL FIRES. THAT IS THE WHOLE POINT OF DOING IT HERE.
   * ==========================================================================
   * Skipping StepProperty means skipping the three refusals StepProperty owns, so
   * they are re-run here against the county the roll gave us, in the same order
   * and with the same arguments:
   *
   *   1. The filing window for this county, STRICT — the same shape of call
   *      /api/checkout makes. Strict because a blank or unrecognised county must
   *      fall to the EARLIEST date we stand behind rather than the latest, which
   *      is how a Hillsborough order came to be measured against Miami-Dade's
   *      deadline eleven days later.
   *
   *      Deliberately not written here as the function name followed by its
   *      arguments: verify-fl-data.mjs COUNTS those calls across this file to
   *      assert how many of them gate money, and its matcher spans newlines — so
   *      a call spelled out in prose is counted as a real one. The first draft of
   *      this comment failed the build for a call that does not exist.
   *   2. isFlCountySupported — the 8 counties with no confirmed VAB address.
   *   3. fee confidence === 'confirmed' — Nassau, Columbia and Levy, which have a
   *      good address and a $50 guess.
   *
   * 2 and 3 are send-letter.js's two refusals, and reaching them HERE rather than
   * at the fee step is a fix in its own right: a Dixie County owner used to pick
   * their defects, price them, and only then be told we cannot file in their
   * county at all. Same refusal, three screens earlier, before any work is asked
   * of them.
   *
   * ==========================================================================
   * THE VERDICT PICKS A SCREEN. IT NEVER GRANTS A PERMISSION.
   * ==========================================================================
   * sessionStorage is the visitor's own browser and can be edited from a console.
   * So `eligible` and `rescuable` are read for one purpose only — which step to
   * open on — and a forged value buys somebody the issues screen, which is free,
   * asks for nothing, and is followed by `florida-check`, which derives the
   * verdict from the roll itself and refuses there if it does not hold.
   *
   * BE PRECISE ABOUT WHAT THE LATER GATES DO. /api/checkout and /api/send-letter
   * re-test the filing window, the county's VAB address and its fee confidence.
   * Neither contains an eligibility test — an earlier draft of this comment said
   * they "re-derive eligibility from the roll" and that is false. The screen that
   * derives eligibility is `florida-check`, which is why an eligible arrival is
   * routed through it rather than around it.
   *
   * A rescuable arrival sets flRescueReturn, which is what makes the issues step
   * return to `florida-check` for a second pass WITH their documented cure rather
   * than running on to the fee step. That re-check is not the duplicate this
   * effect removes — it is the only pass that can clear them.
   */
  useEffect(() => {
    const v = readVerdict();
    if (!v) return;
    const county = (v.county || '').trim();
    // No county means no gate can be evaluated, so nothing may be skipped. The
    // ordinary path already handles this: the property step resolves the county
    // and the picker catches it when the geocoder cannot.
    if (!county) return;

    const ws = getFilingWindowStatus('FL', county, { strict: true });
    if (!ws || (!ws.canFile && !ws.canPreOrder)) {
      setProperty(p => ({ ...p, state: p.state || 'FL', county }));
      setClosedWindow({ stateCode: 'FL', windowStatus: ws });
      return;
    }

    const feeInfo = getFlVabFee(county);
    if (!isFlCountySupported(county) || feeInfo?.confidence !== 'confirmed') {
      setProperty(p => ({ ...p, state: p.state || 'FL', county }));
      setFlCountyBlocked({ county, reason: !isFlCountySupported(county) ? 'address' : 'fee' });
      return;
    }

    setProperty(p => ({ ...p, state: p.state || 'FL', county }));
    setFlRollCounty(county);

    /**
     * RESCUABLE goes to the condition step; ELIGIBLE goes through the check.
     *
     * A rescuable parcel has already been asked the condition question on /check
     * and answered it by clicking. It needs `issues` first, and flRescueReturn
     * sends it back to `florida-check` for the second pass — the one that runs
     * qualify WITH the documented cure, and the only pass that can clear them.
     * That second pass is where their sale test runs.
     *
     * An ELIGIBLE parcel has passed the cap test and NOT the sale test, because
     * /check never runs one. So it goes through `florida-check` with autoAdvance:
     * both tests run, the refusals render, and the "worth appealing" screen — the
     * duplicate of what they just read — is skipped. See the autoAdvance effect in
     * StepFloridaCheck for why routing them straight to `issues` was wrong.
     */
    if (v.rescuable) {
      setFlRescueReturn(true);
      setStep('issues');
    } else {
      setFlAutoAdvance(true);
      setStep('florida-check');
    }
  }, []);

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
    setStep("property");
    setAccount({ firstName: "", lastName: "", email: "" });
    setProperty({ street: "", city: "", state: "", zip: "", propType: "", yearBuilt: "", notes: "", manualAssessedValue: "", manualSqft: "", manualYearBuilt: "", manualBeds: "", manualBaths: "" });
    setIssues([]); setCostOverrides({}); setNotes(""); setUnsupportedState(null); setClosedWindow(null); setFlFeeData(null); setFlSignature(null);
    // The /check handoff is per-property. Starting over means the roll's county
    // and the rescue loop belong to a property this funnel is no longer about —
    // carrying either forward would price the next petition off the last one.
    clearHandoff(); setFlCountyBlocked(null);
  };

  /**
   * ==========================================================================
   * THE TWO TRANSITIONS THAT CHANGED, WRITTEN ONCE.
   * ==========================================================================
   * The step order moved on 23 Aug 2026 — see the note on STEPS. Three different
   * screens hand control onward at these two points (the issues step, the second
   * pass of `florida-check`, and the account step), and before this they each
   * carried their own inline copy of the routing. That is how the two Florida
   * sub-steps came to be reachable in orders nobody intended: `goToFloridaFeeStep`
   * was called from the issues step, which is now two screens too early, because
   * the fee screen sits AFTER the details we have not collected yet.
   *
   * Stated once, so the order is a fact about this file rather than a coincidence
   * between three handlers.
   */

  /**
   * EVERYTHING THE /check HANDOFF CARRIED, DISCARDED TOGETHER.
   *
   * Called from every control that lets the customer reach the address field
   * again. All four values describe the property /check matched, and the moment
   * that address is editable none of them can be trusted about the next one:
   *
   *   flRollCounty     sets the fee, the cheque payee and which VAB receives it
   *   flAutoAdvance    would skip the verdict screen for a property never checked
   *   flRescueReturn   would route the second property past its own first pass
   *   flConditionIntent same, one screen earlier
   *
   * DISMISSING AN OVERLAY IS ALSO A ROUTE BACK. FilingWindowClosed and
   * UnsupportedState do not navigate — they stop rendering, which REVEALS the
   * property step underneath. flRollCounty and flAutoAdvance cannot be live there,
   * but flConditionIntent can: it is set by its own effect, independently of the
   * verdict effect, which returns early on the closed-window branch. Without a
   * clear, the next address typed skips its own first qualify pass with
   * `alreadyAsked` already true — silently closing the rescue path to a second
   * property that might have needed it.
   *
   * The first version of this cleared only flRollCounty, from one of the three
   * Back buttons. Adversarial review of the diff found the rest: going back from
   * `florida-check`, typing a different address and continuing could reach the fee
   * screen disclosing the PREVIOUS county's fee and payee, with the previous
   * property's priced defects attached — and ask the owner to confirm that county
   * and sign an authorization naming it.
   */
  const clearHandoff = () => {
    setFlRollCounty('');
    setFlAutoAdvance(false);
    setFlRescueReturn(false);
    setFlConditionIntent(false);
    setFlIssuesDone(false);
  };

  /**
   * Condition questions are done. Florida may still owe a second qualify pass.
   *
   * ==========================================================================
   * flRescueReturn IS NOT CLEARED WHEN THE RESCUE PASS SUCCEEDS. THAT IS THE FIX.
   * ==========================================================================
   * It used to be. `onEligible` did `setFlRescueReturn(false)` and moved on, which
   * meant the flag recorded "we are mid-rescue" rather than what it actually needs
   * to record: THIS PARCEL ONLY QUALIFIES WITH A DOCUMENTED COST TO CURE.
   *
   * The difference is two clicks. Pass 2 clears them with their defects ticked ->
   * details screen -> Back -> untick every defect -> "Skip & generate my dispute
   * letter" (StepIssues has no minimum) -> with the flag cleared, this function
   * routed them straight to `account`, then the fee screen, then checkout. The one
   * pass that could clear them was never re-run against the list that no longer
   * clears them.
   *
   * Nothing downstream re-derives it. /api/checkout and /api/send-letter re-test
   * the filing window and the two county gates and contain no eligibility test at
   * all — so a homeowner in the 688,497-parcel rescuable band would have paid $89
   * plus a county fee for a petition lib/dor/qualify.js says cannot reach their
   * bill. Found by adversarial review; no guard covered it, and the comment on the
   * verdict effect claiming checkout "re-derives eligibility from the roll" was
   * simply wrong and has been corrected.
   *
   * Leaving the flag set makes the loop self-healing: any return to `issues`, from
   * anywhere, sends them back through `florida-check`, which re-runs qualify with
   * whatever is ticked NOW. `alreadyAsked` keeps the invitation to one showing.
   * The cost is one redundant re-check for a customer who goes back and changes
   * nothing, which is the right side of that trade.
   */
  const afterIssues = () => {
    const sc = property.state.trim().toUpperCase();
    // THE RESCUE PASS IS NOT THE DUPLICATE CHECK. A rescuable parcel was refused
    // on comparable sales alone; this is the run that includes the documented cost
    // to cure, and it is the only pass that can clear them. It must happen before
    // we ask for anything, because it can still end in an honest no.
    setFlIssuesDone(true);
    /**
     * A RESCUABLE PARCEL MUST re-check. AN ELIGIBLE ONE WITH DEFECTS SHOULD.
     *
     * Rescuable: this is the only pass that can clear them, and it can still end
     * in an honest no. Non-negotiable.
     *
     * Eligible with defects ticked: the re-check is not a gate, it is the summary
     * — qualify() subtracts the documented cure from the requested just value in
     * every scenario, so the numbers genuinely change and the owner can see what
     * their minute of ticking boxes bought. Nathan's call, 23 Aug.
     *
     * Eligible with NOTHING ticked: skip it. There is nothing new to say, and a
     * screen with nothing new on it is the duplicate check this funnel just spent
     * a day removing.
     */
    const wantsSummary = sc === 'FL' && (flRescueReturn || issues.length > 0);
    if (wantsSummary) { setFlAutoAdvance(false); setStep('florida-check'); window.scrollTo(0, 0); return; }
    setStep('account'); window.scrollTo(0, 0);
  };

  /**
   * THE COUNTY FEE, FOR THE DETAILS SCREEN'S TOTAL. Null when we cannot stand
   * behind a number.
   *
   * Only a CONFIRMED fee is shown. Nassau, Columbia and Levy carry a $50 guess,
   * and the funnel refuses those counties before this screen anyway — but a
   * number printed beside the word "Total" must never be one of them, and
   * relying on an upstream gate to guarantee that is how the $50 default came to
   * be charged for "Notarealcounty" on 15 Aug.
   *
   * flRollCounty first: it came off the parcel's own DOR county number. Falling
   * back to property.county covers the typed path, where the county was resolved
   * by the geocoder before the fee step.
   */
  const flAccountVabFee = (() => {
    if (property.state.trim().toUpperCase() !== 'FL') return null;
    const c = (flRollCounty || property.county || '').trim();
    if (!c) return null;
    const info = getFlVabFee(c);
    return info?.confidence === 'confirmed' ? info.vabFee : null;
  })();

  /** We have a name and an email. Florida discloses its county fee before paying. */
  const afterAccount = () => {
    const sc = property.state.trim().toUpperCase();
    if (sc === 'FL') { goToFloridaFeeStep(); return; }
    setStep('dispute'); window.scrollTo(0, 0);
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
          /* The form before the pitch, once the two columns become one.
             See the comment at .apply-sell in StepAccount. */
          .page-grid > .apply-sell { order: 2; }
          .page-grid > .card-padding { order: 1; }
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
      <NavBar step={step} account={account} property={property} />
      {!unsupportedState && <ProgressBar currentStep={step} />}
      {flCountyBlocked ? (
        <FloridaCountyUnavailable
          county={flCountyBlocked.county}
          reason={flCountyBlocked.reason}
          onBack={() => { setFlCountyBlocked(null); clearHandoff(); setStep('property'); }}
          account={account}
          property={property}
        />
      ) : flCountyError ? (
        <FloridaCountyPicker
          info={flCountyError}
          onConfirm={(c) => applyResolvedCounty(c, 'customer-picked')}
          onBack={() => setFlCountyError(null)}
        />
      ) : closedWindow ? (
        <FilingWindowClosed stateCode={closedWindow.stateCode} windowStatus={closedWindow.windowStatus} onBack={() => { clearHandoff(); setClosedWindow(null); }} account={account} property={property} />
      ) : unsupportedState ? (
        <UnsupportedState stateCode={unsupportedState} onBack={() => { clearHandoff(); setUnsupportedState(null); }} account={account} property={property} />
      ) : (
        <>
          {step === "account" && <StepAccount data={account} onChange={upd(setAccount)} onNext={afterAccount} onBack={() => { setStep("issues"); window.scrollTo(0,0); }} vabFeeCents={flAccountVabFee} />}
          {step === "property" && <StepProperty data={property} onChange={upd(setProperty)} onNext={() => {
            const sc = property.state.trim().toUpperCase();
            /*
              A CONDITION ARRIVAL ENTERS THE RESCUE LOOP ONE STEP EARLY.
              They answered the condition question on /check by clicking through,
              so send them to `issues` and set flRescueReturn — which is what makes
              the issues step return to `florida-check` rather than running on to
              the fee step. Pass 2 then re-runs qualify WITH their documented cure,
              which is the only pass that can clear them, and `alreadyAsked`
              suppresses a second invitation. Every gate still fires before
              checkout; only the order of the first two screens changes.

              `!flRescueReturn` keeps this to the first pass, so the loop cannot
              re-enter itself.
            */
            if (sc === 'FL' && flConditionIntent && !flRescueReturn) {
              setFlConditionIntent(false);
              setFlRescueReturn(true);
              setStep('issues');
            } else {
              setStep(sc === 'FL' ? 'florida-check' : 'issues');
            }
            window.scrollTo(0,0);
          }} onUnsupportedState={s => setUnsupportedState(s)} onClosedWindow={(sc, ws) => setClosedWindow({ stateCode: sc, windowStatus: ws })} />}
          {/* PASS 2 OF THE FLORIDA CHECK ENDS AT THE DETAILS STEP, NOT THE FEE
              STEP. It used to run straight on to `goToFloridaFeeStep`, which was
              correct while the account step was step 1 and the name was already in
              hand. It is step 3 now, so jumping to the fee screen from here would
              reach the review page with no name on the petition and no address to
              send the confirmation to. */}
          {step === "florida-check" && <StepFloridaCheck property={property} account={account} issues={issues} costOverrides={costOverrides} alreadyAsked={flRescueReturn} autoAdvance={flAutoAdvance} onAddIssues={(isRescue) => { setFlAutoAdvance(false); if (isRescue) setFlRescueReturn(true); setStep("issues"); window.scrollTo(0,0); }} onEligible={() => { setFlAutoAdvance(false); if (flRescueReturn || flIssuesDone) { setStep("account"); } else { setStep("issues"); } window.scrollTo(0,0); }} onBack={() => { clearHandoff(); setStep("property"); window.scrollTo(0,0); }} />}
          {step === "issues" && <StepIssues selectedIssues={issues} onToggle={toggleIssue} property={property} costOverrides={costOverrides} onCostChange={setCost} onNext={afterIssues} onBack={() => {
            /*
              GOING BACK TO THE ADDRESS DISCARDS THE ROLL'S COUNTY.
              flRollCounty is the county of the parcel /check matched. The moment
              the customer can edit the address it may no longer describe the
              property they are filing on, and it is the value that sets the fee,
              the cheque payee and which VAB office receives the petition. Dropping
              it returns them to the ordinary path — /api/resolve-county, then the
              picker — which is slower and is correct for an address we have not
              matched to the roll.
            */
            clearHandoff(); setStep("property"); window.scrollTo(0,0);
          }} stateCode={property.state.trim().toUpperCase()} notes={notes} onNotesChange={setNotes} />}
          {step === "florida-fee" && <StepFloridaFee feeData={flFeeData} property={property} account={account} onAuthorize={(sig) => { setFlSignature(sig); setStep("dispute"); window.scrollTo(0,0); }} onBack={() => { setStep("account"); window.scrollTo(0,0); }} onChangeCounty={() => setFlCountyError({ kind: "pick", county: property.county || "", message: "Pick the county this property is in. It sets your filing fee and which Value Adjustment Board receives your petition." })} />}
          {step === "dispute" && <StepDispute formData={{ account, property: { ...property, notes }, issues, costOverrides, flSignature }} onRestart={restart} onAddIssues={() => { setStep("issues"); window.scrollTo(0, 0); }} />}
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
  /*
   * /apply had NO title of its own when sales are enabled — this file never
   * imported next/head, so the funnel rendered under the _app default and shared
   * it with /portal. It is sitemap priority 0.95 and the page every ad and every
   * CTA points at.
   *
   * Only visible with NEXT_PUBLIC_SALES_ENABLED=true. With sales off, WaitlistForm
   * supplies its own title, so a local build without the variable set looks
   * correct. That divergence is why the duplicate survived: production and a
   * developer's build were rendering different documents.
   */
  return <><ApplyHead /><ApplyFunnel /></>;
}
