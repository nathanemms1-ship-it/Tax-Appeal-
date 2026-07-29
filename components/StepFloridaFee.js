import { useState } from 'react';
// Single source of truth for FL VAB fees — lib/flCountyFees.js
export { getFlVabFee } from '../lib/flCountyFees';

const C = {
navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52", red: "#C0392B",
};

/**
* StepFloridaFee — Florida VAB fee disclosure + DR-486 e-signature authorization
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
export default function StepFloridaFee({ feeData, property, account, onAuthorize, onBack, onChangeCounty }) {
const [agreedAuth, setAgreedAuth] = useState(false);
const [agreedFee, setAgreedFee] = useState(false);

const vabFee = feeData?.vabFee || 5000;
const payableTo = feeData?.payableTo || 'Board of County Commissioners';
const countyDisplay = (feeData?.county || 'Your') + ' County';
const vabFeeDisplay = `$${(vabFee / 100).toFixed(0)}`;
const totalDisplay = `$${((8900 + vabFee) / 100).toFixed(0)}`;
const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const canProceed = agreedAuth && agreedFee;

const handleAuthorize = () => {
if (!canProceed) return;
// NOTE: no signature is captured here any more.
//
// This step used to take the owner's Part 3 signature two screens BEFORE the
// petition was generated — so the attestation "I have read this petition" carried
// a timestamp that predated the document. The signature now happens on the review
// screen, after the owner has actually seen what they are signing.
//
// This step's only job is to disclose the county filing fee and the real total.
onAuthorize({
county: feeData?.county,
vabFee,
payableTo,
needsManualFiling: !!feeData?.needsManualFiling,
acknowledgedAt: new Date().toISOString(),
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
Florida law requires a mandatory county filing fee and your signature on the petition before we can file it for you.
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
{/* County confirmation, inline.
    County sets the fee, the cheque payee and which government office receives
    the petition, so it is the one field worth confirming explicitly - but the fee
    and payee shown here are DERIVED from it, so this screen is already where a
    customer would notice a wrong county. A link beats a modal: no extra click for
    the majority where the lookup is right, one click to fix it when it is not.
    Correcting it opens a dropdown of all 67 counties, never a text box. */}
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12.5, fontFamily: "'DM Sans', sans-serif" }}>
<span style={{ color: '#8596AF' }}>
📍 We have this property in <strong style={{ color: C.white }}>{feeData?.county} County</strong>.
</span>
{onChangeCounty && (
<button onClick={onChangeCounty} style={{ background: 'transparent', border: 'none', color: C.gold, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', fontFamily: "'DM Sans', sans-serif" }}>
Not right? Change it
</button>
)}
</div>

{feeData?.needsManualFiling && (
<div style={{ background: 'rgba(255,201,64,0.12)', border: '1px solid rgba(255,201,64,0.35)', borderRadius: 8, padding: '12px 14px', marginBottom: 14, fontSize: 12.5, color: '#FFD97A', lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
<strong>{feeData?.county} County is filed by hand.</strong> We have not yet confirmed this
county&rsquo;s Value Adjustment Board mailing address directly with the county, so your petition
is prepared and reviewed by a person before it is mailed rather than going out automatically.
We will email you once it is confirmed filed. If we cannot file it before your deadline we
refund you in full, including the county fee.
</div>
)}

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

{/* DR-486 Authorization block */}
<div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
<div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '1px', color: C.navy, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>
✍️ Sign Your Petition — Form DR-486, Part 3
</div>
<p style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.7, fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>
Florida Statute § 194.011(3) requires a VAB petition to be signed by the property owner.
By signing below you are signing your own petition to the {countyDisplay} Value Adjustment
Board for the property at{' '}
<strong style={{ color: C.darkNavy }}>{property?.street}, {property?.city}, FL {property?.zip}</strong>.
</p>

{/* Authorization text */}
<div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 16, fontSize: 12, color: C.bodyGray, lineHeight: 1.8, fontFamily: "'DM Sans', sans-serif" }}>
<strong style={{ color: C.darkNavy, display: 'block', marginBottom: 8 }}>WHAT TAXAPPEAL USA WILL DO (AND WILL NOT DO)</strong>
{/* This paragraph used to read "...authorize TaxAppeal USA to act as my document
    preparer for purposes of filing and PROSECUTING a petition before the ... Value
    Adjustment Board". "Prosecuting a petition before the Board" is representation
    language lifted from power-of-attorney forms, and it sat two sentences above
    "We do not represent you" - the operative document the customer agreed to
    contradicted itself, and the representation reading is the one that would have
    governed. Under Fla. Admin. Code R. 12D-9.018(3) a COMPENSATED representative
    who is not a Bar attorney, CPA, or licensed appraiser/broker must file a
    DR-486POA with two witnesses and a notary. We file no such form, so we must not
    describe ourselves in terms that imply representation. */}
I am the property owner. I am engaging <strong>TaxAppeal USA</strong> to prepare my petition to the{' '}
{countyDisplay} Value Adjustment Board, to pay the county filing fee on my behalf, and to mail the
petition for me. <strong>I will sign the petition myself</strong> after reviewing it, as
&sect;&nbsp;194.011(3), Florida Statutes requires. TaxAppeal USA is not my representative or agent
in this proceeding, will not appear before the Board, and gives no tax or legal advice. If a
hearing is scheduled, attending is my decision and my responsibility.
<br /><br />
<strong>Date: {today}</strong>
</div>

</div>

{/* Checkboxes */}
{checkbox(agreedAuth, () => setAgreedAuth(!agreedAuth), (
<><strong style={{ color: C.darkNavy }}>I understand I will review and sign my own petition on the next screen</strong> for the property above, as permitted under Florida Statute § 194.011(3). My typed name above serves as my electronic signature on Form DR-486.</>
))}
{checkbox(agreedFee, () => setAgreedFee(!agreedFee), (
<><strong style={{ color: C.darkNavy }}>I understand the {vabFeeDisplay} {countyDisplay} VAB filing fee is required by Florida law</strong> (§ 194.013) and is non-refundable once submitted. TaxAppeal USA will pay this fee to {payableTo} on my behalf with my petition.</>
))}

{!canProceed && (
<div style={{ fontSize: 12, color: C.mutedGray, fontFamily: "'DM Sans', sans-serif", textAlign: 'center', marginBottom: 10 }}>
{'Check both boxes to continue'}
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
🔒 Your signature is applied to Part 3 of your DR-486 petition, which is what Florida Statute § 194.011(3) requires. No separate authorization form is needed or filed.
</div>
</div>
</div>
);
}
