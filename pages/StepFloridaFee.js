import { useState } from 'react';

// Per-county FL VAB fees (cents) — sourced 2026-07-20 from official county web pages.
// Source of truth: lib/flCountyFees.js (duplicated here for self-contained component)
// 57 of 67 counties confirmed; 10 remain at the $50 default pending a phone call.
// 🔴 Corrections vs the prior version: Orange $15→$50, Palm Beach $50→$20, Hernando $50→$15.
const FL_COUNTY_VAB_FEES = {
"Alachua": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Baker": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Bay": { vabFee: 5000, payableTo: "Bay County Clerk of the VAB" },
"Bradford": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Brevard": { vabFee: 4500, payableTo: "Brevard Clerk of Courts" },
"Broward": { vabFee: 2500, payableTo: "Broward County VAB" },
"Calhoun": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Charlotte": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Citrus": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Clay": { vabFee: 3500, payableTo: "Board of County Commissioners" },
"Collier": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"DeSoto": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Duval": { vabFee: 1500, payableTo: "Duval County Tax Collector" },
"Escambia": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Flagler": { vabFee: 5000, payableTo: "Flagler County Clerk of Court" },
"Glades": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Gulf": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Hamilton": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Hardee": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Hendry": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Hernando": { vabFee: 1500, payableTo: "Clerk of Circuit Court" },
"Highlands": { vabFee: 5000, payableTo: "Highlands County Clerk of Courts" },
"Hillsborough": { vabFee: 5000, payableTo: "Hillsborough County Clerk of Court" },
"Holmes": { vabFee: 5000, payableTo: "Holmes County Board of Commissioners" },
"Indian River": { vabFee: 1500, payableTo: "Indian River County VAB" },
"Jackson": { vabFee: 5000, payableTo: "Jackson County Clerk of Court" },
"Jefferson": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Lafayette": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Lake": { vabFee: 5000, payableTo: "Lake County Clerk of the Circuit Court" },
"Lee": { vabFee: 3000, payableTo: "Lee County Clerk of Court" },
"Leon": { vabFee: 1500, payableTo: "Leon County Clerk of Court" },
"Liberty": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Manatee": { vabFee: 5000, payableTo: "Manatee County Clerk of Court" },
"Marion": { vabFee: 5000, payableTo: "Marion County Clerk of Court and Comptroller" },
"Martin": { vabFee: 5000, payableTo: "Martin County Clerk of the Circuit Court" },
"Miami-Dade": { vabFee: 1500, payableTo: "Clerk of the Value Adjustment Board" },
"Monroe": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Okaloosa": { vabFee: 5000, payableTo: "Okaloosa County Board of County Commissioners" },
"Okeechobee": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Orange": { vabFee: 5000, payableTo: "Orange County BCC" },
"Osceola": { vabFee: 5000, payableTo: "Osceola County Clerk of Court" },
"Palm Beach": { vabFee: 2000, payableTo: "Board of County Commissioners" },
"Pasco": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Pinellas": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Polk": { vabFee: 5000, payableTo: "Polk County Value Adjustment Board" },
"Putnam": { vabFee: 1500, payableTo: "Putnam County Clerk of the Circuit Court" },
"St. Johns": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"St. Lucie": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Santa Rosa": { vabFee: 1500, payableTo: "Board of County Commissioners" },
"Sarasota": { vabFee: 5000, payableTo: "Sarasota County Clerk of Court" },
"Seminole": { vabFee: 1500, payableTo: "Seminole County Clerk to the BCC" },
"Sumter": { vabFee: 3500, payableTo: "Sumter County Clerk" },
"Suwannee": { vabFee: 5000, payableTo: "Suwannee County Clerk of the Value Adjustment Board" },
"Taylor": { vabFee: 1500, payableTo: "Taylor County Clerk of Court" },
"Union": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Volusia": { vabFee: 4000, payableTo: "County of Volusia" },
"Wakulla": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Walton": { vabFee: 5000, payableTo: "Walton County Board of County Commissioners" },
"Washington": { vabFee: 5000, payableTo: "Washington County Board of County Commissioners" },
"Columbia": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Dixie": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Franklin": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Gadsden": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Gilchrist": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Levy": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Madison": { vabFee: 5000, payableTo: "Board of County Commissioners" },
"Nassau": { vabFee: 5000, payableTo: "Board of County Commissioners" },
};
const DEFAULT_FL_FEE = { vabFee: 5000, payableTo: "Board of County Commissioners" };

export function getFlVabFee(countyName) {
if (!countyName) return DEFAULT_FL_FEE;
const clean = countyName.replace(/ County$/i, "").trim();
return FL_COUNTY_VAB_FEES[clean] || DEFAULT_FL_FEE;
}

const C = {
navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52", red: "#C0392B",
};

/**
* StepFloridaFee — Florida VAB fee disclosure + DR-486A e-signature authorization
*
* Props:
* feeData { vabFee, payableTo, county } — from getFlVabFee()
* property { street, city, zip }
* account { firstName, lastName }
* onAuthorize(sig) — called with { name, date, timestamp, county, vabFee, payableTo }
* onBack()
*
* Wire into apply.js:
* import StepFloridaFee, { getFlVabFee } from './StepFloridaFee';
*
* In App() state: const [flFeeData, setFlFeeData] = useState(null);
* const [flSignature, setFlSignature] = useState(null);
*
* In issues onNext: if (sc === 'FL') {
* const clean = county.replace(/ County$/i,'').trim();
* setFlFeeData({ ...getFlVabFee(clean), county: clean });
* setStep('florida-fee');
* } else { setStep('dispute'); }
*
* In render:
* {step === 'florida-fee' && (
* <StepFloridaFee
* feeData={flFeeData}
* property={property}
* account={account}
* onAuthorize={(sig) => { setFlSignature(sig); setStep('dispute'); window.scrollTo(0,0); }}
* onBack={() => { setStep('issues'); window.scrollTo(0,0); }}
* />
* )}
*
* Pass flSignature into formData for DisputeLetter/doCheckout.
*/
export default function StepFloridaFee({ feeData, property, account, onAuthorize, onBack }) {
const [sigName, setSigName] = useState('');
const [agreedAuth, setAgreedAuth] = useState(false);
const [agreedFee, setAgreedFee] = useState(false);
const [sigError, setSigError] = useState('');

const vabFee = feeData?.vabFee || 5000;
const payableTo = feeData?.payableTo || 'Board of County Commissioners';
const countyDisplay = (feeData?.county || 'Your') + ' County';
const vabFeeDisplay = `$${(vabFee / 100).toFixed(0)}`;
const totalDisplay = `$${((8900 + vabFee) / 100).toFixed(0)}`;
const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const canProceed = agreedAuth && agreedFee && sigName.trim().length >= 3;

const handleAuthorize = () => {
if (!canProceed) return;
if (account?.firstName && account?.lastName) {
const expected = `${account.firstName} ${account.lastName}`.toLowerCase();
if (sigName.trim().toLowerCase() !== expected) {
setSigError(`Please type your full name exactly as entered: ${account.firstName} ${account.lastName}`);
return;
}
}
setSigError('');
onAuthorize({
name: sigName.trim(),
date: today,
timestamp: new Date().toISOString(),
county: feeData?.county,
vabFee,
payableTo,
});
};

const checkbox = (checked, onClick, children) => (
<div
onClick={onClick}
style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 8, border: `1.5px solid ${checked ? C.navy : C.border}`, background: checked ? C.lightBlue : C.white, cursor: 'pointer', transition: 'all 0.15s', marginBottom: 10 }}
>
<div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${checked ? C.navy : '#C5D0E0'}`, background: checked ? C.navy : C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: C.white, fontWeight: 700, marginTop: 2 }}>
{checked ? '✓' : ''}
</div>
<span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: C.bodyGray, lineHeight: 1.6 }}>
{children}
</span>
</div>
);

return (
<div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 40px' }}>
<div style={{ maxWidth: 560, margin: '0 auto' }}>

<div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.lightBlue, color: C.navy, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
📋 Florida Filing Requirements — Step 3 of 4
</div>

<h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.darkNavy, marginBottom: 8 }}>
Two things Florida requires
</h2>
<p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 28, fontFamily: "'DM Sans', sans-serif" }}>
Florida law requires a mandatory county filing fee and written authorization before we can file your VAB petition on your behalf.
</p>

{/* Order summary */}
<div style={{ background: C.darkNavy, borderRadius: 12, padding: 24, marginBottom: 20 }}>
<div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: '#5A7A9F', fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
ORDER SUMMARY — {countyDisplay.toUpperCase()}
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
<span style={{ color: '#8596AF' }}>TaxAppeal service fee</span>
<span style={{ color: C.white, fontWeight: 500 }}>$89</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
<div>
<div style={{ color: '#8596AF' }}>{countyDisplay} VAB filing fee</div>
<div style={{ fontSize: 11, color: '#5A7A9F', marginTop: 3 }}>Required by Florida law § 194.013 · paid to {payableTo}</div>
</div>
<span style={{ color: C.white, fontWeight: 500, flexShrink: 0, marginLeft: 12 }}>{vabFeeDisplay}</span>
</div>
<div style={{ borderTop: '1px solid #1E2D45', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<span style={{ fontSize: 15, fontWeight: 700, color: C.white, fontFamily: "'DM Sans', sans-serif" }}>Total charged today</span>
<span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold }}>{totalDisplay}</span>
</div>
</div>

{/* DR-486A Authorization block */}
<div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
<div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '1px', color: C.navy, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>
✍️ Written Authorization — Form DR-486A
</div>
<p style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.7, fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>
Florida Statute § 194.011(3) requires written authorization when an unlicensed compensated
representative files a VAB petition on your behalf. By signing below, you authorize TaxAppeal USA
to act as your representative before the {countyDisplay} Value Adjustment Board for the property at{' '}
<strong style={{ color: C.darkNavy }}>{property?.street}, {property?.city}, FL {property?.zip}</strong>.
</p>

{/* Authorization text */}
<div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 16, fontSize: 12, color: C.bodyGray, lineHeight: 1.8, fontFamily: "'DM Sans', sans-serif" }}>
<strong style={{ color: C.darkNavy, display: 'block', marginBottom: 8 }}>WRITTEN AUTHORIZATION FOR REPRESENTATION BEFORE THE VALUE ADJUSTMENT BOARD (DR-486A)</strong>
I, the undersigned property owner, hereby authorize <strong>TaxAppeal USA</strong> to act as my
authorized representative for purposes of filing and prosecuting a petition before the {countyDisplay} Value
Adjustment Board regarding the above property, pursuant to Florida Statute § 194.011(3)(h). I
understand TaxAppeal USA is a compensated representative. This authorization includes the right to
file Form DR-486, submit evidence, and receive VAB correspondence on my behalf. I certify the
information I provided is accurate and I am the owner or authorized agent of the property described.
<br /><br />
<strong>Date: {today}</strong>
</div>

{/* Typed e-signature */}
<label style={{ display: 'block', fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: C.bodyGray, fontWeight: 500, marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
Type Your Full Legal Name to Sign
</label>
<input
type="text"
value={sigName}
onChange={e => { setSigName(e.target.value); setSigError(''); }}
placeholder={account ? `${account.firstName} ${account.lastName}` : 'First Last'}
style={{ width: '100%', background: C.bg, border: `1.5px solid ${sigError ? C.red : C.border}`, borderRadius: 7, padding: '12px 14px', fontSize: 16, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: C.darkNavy, outline: 'none', boxSizing: 'border-box', letterSpacing: '0.5px' }}
/>
{sigError && (
<div style={{ fontSize: 12, color: C.red, marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{sigError}</div>
)}
<div style={{ fontSize: 11, color: C.mutedGray, marginTop: 5, fontFamily: "'DM Sans', sans-serif" }}>
By typing your name you are electronically signing this authorization under Florida’s Electronic Signature Act (§ 668.50, F.S.).
</div>
</div>

{/* Checkboxes */}
{checkbox(agreedAuth, () => setAgreedAuth(!agreedAuth), (
<><strong style={{ color: C.darkNavy }}>I authorize TaxAppeal USA to file as my VAB representative</strong> for the property above, as permitted under Florida Statute § 194.011(3). My typed name above serves as my electronic signature on Form DR-486A.</>
))}
{checkbox(agreedFee, () => setAgreedFee(!agreedFee), (
<><strong style={{ color: C.darkNavy }}>I understand the {vabFeeDisplay} {countyDisplay} VAB filing fee is required by Florida law</strong> (§ 194.013) and is non-refundable once submitted. TaxAppeal USA will pay this fee to {payableTo} on my behalf with my petition.</>
))}

{!canProceed && (
<div style={{ fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", textAlign: 'center', marginBottom: 10 }}>
{!sigName.trim() ? 'Type your full name above to sign' : 'Check both boxes to continue'}
</div>
)}

<div style={{ display: 'flex', gap: 12 }}>
<button
onClick={onBack}
style={{ background: 'transparent', color: C.mutedGray, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '14px 24px', fontSize: 14, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}
>
← Back
</button>
<button
onClick={handleAuthorize}
disabled={!canProceed}
style={{ background: canProceed ? C.navy : '#C5D0E0', color: C.white, border: 'none', borderRadius: 8, padding: '14px 24px', fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", cursor: canProceed ? 'pointer' : 'not-allowed', flex: 1, transition: 'background 0.2s' }}
>
{canProceed ? 'Continue to My Dispute Letter →' : '🔒 Sign and check both boxes to continue'}
</button>
</div>

<div style={{ marginTop: 16, padding: '12px 16px', background: C.bg, borderRadius: 8, fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
🔒 Your signed authorization is stored securely and attached to your VAB petition as required by Florida Statute § 194.011(3)(h). A copy is included in your mailed filing package.
</div>
</div>
</div>
);
}
