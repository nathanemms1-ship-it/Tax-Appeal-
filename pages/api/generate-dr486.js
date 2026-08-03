/**
 * DR-486 PETITION GENERATOR — FLORIDA
 *
 * ============================================================================
 * FILING MODEL: DOCUMENT PREPARATION + FILING AGENT (owner is the signatory)
 * ============================================================================
 *
 * The property owner signs PART 3 of the petition. TaxAppeal USA does NOT sign
 * as a representative — Parts 4 and 5 are left blank / not applicable.
 *
 * WHY THIS MATTERS (do not "simplify" this back):
 *
 * Fla. Stat. § 194.011(3): "A petition to the value adjustment board must be
 * signed by the taxpayer OR be accompanied at the time of filing by the
 * taxpayer's written authorization or power of attorney..."  The requirement is
 * disjunctive — a taxpayer signature is a complete, independent alternative to
 * any authorization document.
 *
 * Under Fla. Admin. Code R. 12D-9.015(2)(g) and R. 12D-9.018(3), a COMPENSATED
 * representative who is not a Florida Bar attorney, a Ch. 473 CPA, a Ch. 475
 * licensed real estate appraiser or broker, or an employee of the taxpayer must
 * supply a POWER OF ATTORNEY (Form DR-486POA) conforming to Ch. 709 Part II —
 * which requires two witnesses and notarization. Form DR-486A is reserved for
 * UNCOMPENSATED representatives; its operative text reads "...authorize [name]
 * to, WITHOUT COMPENSATION, act on my behalf."
 *
 * The prior version of this file signed Part 5 as a "compensated representative"
 * while attaching DR-486A and citing § 194.011(3)(h). That was wrong three ways:
 * DR-486A affirmatively misstates the compensation relationship, § 194.011(3)(h)
 * is the service-of-process provision and confers no representation authority,
 * and the whole thing was submitted under penalty of perjury.
 *
 * By having the owner sign Part 3 and keeping TaxAppeal off Parts 4 and 5
 * entirely, no representative-authorization document is required at all.
 * Nothing in ch. 194 or ch. 12D-9 imposes any authorization, licensing, or
 * registration requirement on a party that merely prepares, transmits, or pays
 * the filing fee for a petition the taxpayer signed. Every trigger in the
 * statute and rules attaches to SIGNING.
 *
 * CONSTRAINTS THIS MODEL IMPOSES — respect them:
 *   1. TaxAppeal must NOT appear at a VAB hearing or present testimony. Doing so
 *      triggers § 194.034(1) and would require a DR-486POA.
 *   2. TaxAppeal must NOT be listed as the taxpayer's representative anywhere on
 *      the petition.
 *   3. Receiving the owner's confidential information from the Property
 *      Appraiser requires separate written authorization from the owner
 *      (§ 194.011(3)(h), second sentence). Determinations are therefore directed
 *      to the OWNER, not to disputes@.
 *   4. The "I will not attend" election belongs to the OWNER and must be
 *      disclosed and chosen, never defaulted silently.
 *
 * Sources: Fla. Stat. §§ 194.011, 194.034; Fla. Admin. Code R. 12D-9.015,
 * 12D-9.018; DOR Form DR-486 (R. 12/25) Part 3 instruction; DOR Form PT-101.
 */

import { Redis } from '@upstash/redis';
import { getFlVabAddress } from '../../lib/flVabAddresses';
import { enforceRateLimit } from '../../lib/rateLimit';
import { validateVendorInput, PROMPT_ROUTE_CONFIG } from '../../lib/inputLimits';
import { checkSpend } from '../../lib/spendGuard';

// 64 KB instead of Next's 1 MB default. See lib/inputLimits.js.
export const config = PROMPT_ROUTE_CONFIG;

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

// TaxAppeal appears ONLY as preparer/filing agent — never as representative.
const PREPARER = {
  name: 'TaxAppeal USA',
  email: 'disputes@taxappealusa.com',
  role: 'Document preparation and filing service',
};

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildDR486Html({
  ownerFirstName, ownerLastName, ownerEmail, ownerPhone,
  ownerStreet, ownerCity, ownerState, ownerZip,
  propertyAddress, county, parcelId, assessedValue, requestedValue, taxYear, comps,
  evidenceText, vabName, ownerSignatureName, ownerSignatureDate, filingDate,
  willNotAttend, authorizeConfidential, preview,
}) {
  const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : 'See county records';
  const today = filingDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const yr = taxYear || new Date().getFullYear().toString();
  const box = (checked) => checked
    ? '<div class="checkbox" style="display:flex;align-items:center;justify-content:center;font-weight:bold;">&#10003;</div>'
    : '<div class="checkbox"></div>';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000;background:#fff;}
  .page{padding:36px 48px;max-width:816px;margin:0 auto;}
  h1{font-size:13pt;font-weight:bold;text-align:center;margin-bottom:2px;}
  h2{font-size:11pt;font-weight:bold;text-align:center;margin-bottom:6px;}
  .subtitle{font-size:9pt;text-align:center;margin-bottom:16px;}
  .form-ref{font-size:8pt;color:#555;text-align:right;margin-bottom:12px;}
  .part{border:1.5px solid #000;margin-bottom:10px;}
  .part-header{background:#333;color:#fff;font-weight:bold;font-size:10pt;padding:4px 8px;}
  .part-body{padding:8px 10px;}
  .row{display:flex;gap:12px;margin-bottom:6px;}
  .field{flex:1;}
  .field-label{font-size:8pt;color:#444;margin-bottom:2px;}
  .field-value{border-bottom:1px solid #000;min-height:16px;font-size:10pt;padding:1px 2px;}
  .checkbox-row{display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;font-size:9.5pt;}
  .checkbox{width:12px;height:12px;border:1.5px solid #000;flex-shrink:0;margin-top:2px;}
  .sig-block{border-top:1.5px solid #000;margin-top:10px;padding-top:8px;}
  .sig-line{border-bottom:1.5px solid #000;min-height:28px;margin-bottom:4px;font-size:13pt;font-family:Georgia,serif;font-style:italic;padding:2px 4px;}
  .sig-label{font-size:8pt;color:#444;margin-bottom:8px;}
  .attest{font-size:9pt;margin-top:6px;line-height:1.45;}
  .na{font-size:9pt;color:#555;font-style:italic;}
  .evidence-block{font-size:9.5pt;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;margin-top:4px;}
  .page-break{page-break-before:always;}
  table.summary{width:100%;border-collapse:collapse;margin-top:6px;}
  table.summary td{border:1px solid #999;padding:4px 6px;font-size:9.5pt;}
  table.summary td:first-child{font-weight:bold;width:45%;background:#f5f5f5;}
</style></head>
<body><div class="page">
  <div class="form-ref">Form DR-486 | Rule 12D-16.002, F.A.C. | ${esc(yr)} Tax Year</div>
  <h1>PETITION TO THE VALUE ADJUSTMENT BOARD</h1>
  <h2>Request for Hearing</h2>
  <div class="subtitle">Florida Department of Revenue | ${esc(vabName || county + ' County Value Adjustment Board')}</div>

  <div class="part"><div class="part-header">PART 1 — TAXPAYER / PROPERTY OWNER INFORMATION</div><div class="part-body">
    <div class="row"><div class="field"><div class="field-label">Owner Name</div><div class="field-value">${esc(ownerFirstName)} ${esc(ownerLastName)}</div></div><div class="field"><div class="field-label">Email</div><div class="field-value">${esc(ownerEmail)}</div></div><div class="field"><div class="field-label">Phone</div><div class="field-value">${esc(ownerPhone) || '&nbsp;'}</div></div></div>
    <div class="row"><div class="field" style="flex:2"><div class="field-label">Mailing Address</div><div class="field-value">${esc(ownerStreet)}</div></div><div class="field"><div class="field-label">City</div><div class="field-value">${esc(ownerCity)}</div></div><div class="field" style="flex:0.4"><div class="field-label">State</div><div class="field-value">${esc(ownerState)}</div></div><div class="field" style="flex:0.7"><div class="field-label">ZIP</div><div class="field-value">${esc(ownerZip)}</div></div></div>
    <div class="row"><div class="field" style="flex:2"><div class="field-label">Property Address</div><div class="field-value">${esc(propertyAddress)}</div></div><div class="field"><div class="field-label">County</div><div class="field-value">${esc(county)}</div></div><div class="field"><div class="field-label">Parcel / Folio ID</div><div class="field-value">${esc(parcelId)}</div></div></div>
    <div class="row"><div class="field" style="flex:0.7"><div class="field-label">Tax Year</div><div class="field-value">${esc(yr)}</div></div><div class="field"><div class="field-label">Property Type</div><div class="field-value">Residential 1-4 Units</div></div><div class="field"><div class="field-label">Preferred Contact</div><div class="field-value">Email: ${esc(ownerEmail)}</div></div></div>
  </div></div>

  <div class="part"><div class="part-header">PART 2 — REASON FOR PETITION</div><div class="part-body">
    <div class="checkbox-row">${box(true)}<span><strong>Real property value</strong> — assessed value exceeds fair market value as of January 1, ${esc(yr)}.</span></div>
    <div style="margin-top:8px;"><div class="field-label">Estimated time needed:</div><div class="field-value" style="width:120px;">15 minutes</div></div>
    <div style="margin-top:8px;" class="checkbox-row">${box(!!willNotAttend)}<span>I will not attend the hearing but would like my evidence considered. Duplicate copies submitted.</span></div>
    <div style="margin-top:4px;" class="checkbox-row">${box(!willNotAttend)}<span>I intend to attend the hearing.</span></div>
  </div></div>

  <div class="part"><div class="part-header">PART 3 — TAXPAYER SIGNATURE</div><div class="part-body">
    <p style="font-size:9pt;margin-bottom:8px;">This petition is signed by the property owner pursuant to section 194.011(3), Florida Statutes.</p>
    <div class="sig-block"><div class="sig-line">${preview ? '<span style="font-style:normal;font-size:10pt;color:#888;">— you will sign here after reviewing this petition —</span>' : esc(ownerSignatureName)}</div>
      <div class="sig-label">Signature of Taxpayer / Property Owner (electronically signed) &nbsp;&nbsp; Date: ${esc(ownerSignatureDate || today)}</div>
      <div class="attest"><strong>Under penalties of perjury</strong>, I declare that I am the owner of the property described in this petition, that I have read this petition, and that the facts stated in it are true.</div>
      ${authorizeConfidential ? `<div class="attest" style="margin-top:6px;">I authorize the Property Appraiser and the Clerk of the Value Adjustment Board to release information regarding this petition to ${esc(PREPARER.name)}, ${esc(PREPARER.email)}, which prepared and filed this petition at my direction.</div>` : ''}
    </div>
  </div></div>

  <div class="part"><div class="part-header">PART 4 — EMPLOYEE, ATTORNEY, OR LICENSED PROFESSIONAL REPRESENTATIVE</div><div class="part-body">
    <p class="na">Not applicable — this petition is signed by the taxpayer (Part 3). No representative is designated.</p>
  </div></div>

  <div class="part"><div class="part-header">PART 5 — UNLICENSED REPRESENTATIVE</div><div class="part-body">
    <p class="na">Not applicable — this petition is signed by the taxpayer (Part 3). No representative is designated.</p>
  </div></div>

  <div class="part"><div class="part-header">ASSESSMENT SUMMARY</div><div class="part-body">
    <table class="summary"><tr><td>Property Address</td><td>${esc(propertyAddress)}</td></tr><tr><td>County</td><td>${esc(county)} County, Florida</td></tr><tr><td>Parcel / Folio ID</td><td>${esc(parcelId)}</td></tr><tr><td>Tax Year</td><td>${esc(yr)}</td></tr><tr><td>Current Assessed Value</td><td>${fmt(assessedValue)}</td></tr><tr><td>Requested Value</td><td>${fmt(requestedValue)}</td></tr><tr><td>Legal Basis</td><td>Florida Statute § 193.011 — just value criteria</td></tr></table>
  </div></div>

  <div class="page-break"></div>
  <div class="part"><div class="part-header">EVIDENCE AND ARGUMENT IN SUPPORT OF PETITION</div><div class="part-body">
    <div class="evidence-block">${esc(evidenceText)}</div>
  </div></div>

  <div style="margin-top:16px;font-size:8.5pt;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:10px;">
    Prepared and filed at the property owner's direction by ${esc(PREPARER.name)} — ${esc(PREPARER.role)}.<br/>
    ${esc(PREPARER.name)} is not the taxpayer's representative in these proceedings and will not appear before the Board.<br/>
    Filing date: ${esc(today)} &nbsp;|&nbsp; Questions: ${esc(PREPARER.email)}<br/>
    ${authorizeConfidential
      ? `Please send the Value Adjustment Board's determination to the property owner at the address above, with a copy to ${esc(PREPARER.email)} as authorized by the owner in Part 3.`
      : `Please send the Value Adjustment Board's determination to the property owner at the address above.`}
  </div>
</div></body></html>`;
}

/**
 * REFUSE OUTPUT THAT CITES EVIDENCE WE DID NOT SUPPLY.
 *
 * Three times in one day the model referred to comparable sales that were not
 * attached — each time complying with the letter of a prohibition while finding
 * another phrasing. Prompt wording is a request; this is the check.
 *
 * Only runs when NO comps were supplied. With a real table these phrases are
 * accurate and expected.
 */
/**
 * ANY court citation at all. We supply no case law, so any that appears was
 * recalled rather than verified, and it is going onto a sworn filing.
 */
export function citesCaseLaw(text) {
  const t = String(text || '');
  return /\b\d{2,4}\s+So\.\s?\d?d\s+\d+/.test(t)        // 452 So. 2d 564
      || /\bv\.\s+[A-Z][A-Za-z.'-]+\s+(?:Cty|County|Corp|Inc|Co)\b/.test(t)
      || /\((?:Fla\.[^)]*)\)/.test(t);                     // (Fla. 4th DCA 1984)
}

export function citesAbsentComps(text) {
  const t = String(text || '').toLowerCase();
  return [
    /comparable sales/,
    /comparable properties/,
    /similar (?:homes|properties|residences) (?:that )?(?:sold|have sold)/,
    /sales comparison approach/,
    /what buyers actually pay/,
  ].some((re) => re.test(t));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Anthropic call per request
  if (await enforceRateLimit(req, res, 'dr486', 8, 60)) return;
  if (await enforceRateLimit(req, res, 'dr486', 100, 3600)) return;

  // Bound the free-text fields that get interpolated into the prompt below.
  const checked = validateVendorInput(req.body || {});
  if (!checked.ok) return res.status(400).json({ error: checked.error });

  const {
    ownerFirstName, ownerLastName, ownerEmail, ownerPhone,
    ownerStreet, ownerCity, ownerState, ownerZip,
    propertyAddress, county, parcelId,
    assessedValue, requestedValue, taxYear,
    // Verified comparable sales from lib/dor/comps.js. THIS WAS MISSING, and its
    // absence threw ReferenceError: comps is not defined at the compRows line
    // below — the identifier existed only as a parameter of buildDR486Html, a
    // different function. Every Florida petition failed at the final step.
    comps,
    // 'evidence' | 'mass_appraisal_floor' — which ground actually supports the
    // requested figure. See askAttribution below.
    askRestsOn, costToCureTotal,
    // Derived in lib/valuation.js with the statutory grounds supporting the ask.
    valuationBasis, valuationGrounds,
    issues, propertyDetails, notes,
    zip,
    ownerSignatureName, ownerSignatureDate,
    willNotAttend, authorizeConfidential,
    // preview: render the petition for the owner to READ before they sign it.
    // evidenceText: on the signing pass, reuse the evidence already generated for
    // the preview so signing costs no additional model call.
    preview, evidenceText: providedEvidence,
  } = checked.clean;

  if (!propertyAddress || !county) {
    return res.status(400).json({ error: 'Missing required fields: propertyAddress and county' });
  }

  // The owner's signature IS the authorization, so the FINAL petition cannot be
  // built without it. A PREVIEW deliberately has no signature: the owner has to be
  // able to read the petition before attesting that they have read it.
  //
  // The flow previously captured the signature two screens BEFORE the petition was
  // generated, which meant the Part 3 attestation ("I have read this petition")
  // carried a timestamp that predated the document's existence.
  if (!preview && (!ownerSignatureName || !String(ownerSignatureName).trim())) {
    return res.status(400).json({ error: 'Owner signature is required before a Florida petition can be prepared.' });
  }

  // Never let an LLM address government mail. If the county is not in the
  // verified table, we cannot file and must not pretend otherwise.
  const vab = getFlVabAddress(county);
  if (!vab) {
    return res.status(400).json({
      error: `We cannot currently file in ${county} County, Florida. This county's Value Adjustment Board mailing address has not been verified.`,
      code: 'FL_COUNTY_UNSUPPORTED',
      county,
    });
  }

  try {
    const issuesBlock = issues && issues.length > 0
      ? 'DOCUMENTED PROPERTY ISSUES REPORTED BY OWNER:\n' + issues.map(i => '• ' + i).join('\n')
      : 'No specific defects reported — basis is market value overassessment.';
    const fmt = (n) => n ? '$' + Number(n).toLocaleString() : 'unknown';

    // NOTE ON EVIDENCE INTEGRITY:
    // This petition is signed by the owner under penalty of perjury. The model
    // is therefore explicitly forbidden from inventing comparable sales — no
    // addresses, no sale prices, no dates it cannot source. The prior version
    // asked for "3-4 recent comparable sales" with no data and no search tool,
    // which meant fabricated sales figures were mailed to a government board
    // over a homeowner's sworn signature.
    // COMPARABLE SALES ARE NOW SUPPLIED AS FACTS, NOT REQUESTED AS A SECTION.
    //
    // They come from lib/dor/comps.js: qualified arms-length sales (DOR
    // QUAL_CD 01/02) drawn from the subject's own appraiser neighbourhood code,
    // banded by living area and construction year, taken from the county's
    // Sale Data File — the same record set the Property Appraiser used to value
    // the subject.
    //
    // The distinction that matters: the model is handed a finished table and
    // told it may restate those rows and nothing else. It is never asked to
    // "include a comparable sales section", which is the phrasing that produced
    // fabricated addresses and prices in the first place. Supplying real comps
    // does not relax the prohibition below by one word — it just gives the model
    // something true to cite.
    //
    // No comps supplied means the petition argues methodology alone, exactly as
    // before. Absence of evidence must never become invented evidence.
    // Bounded before use. The engine returns at most MAX_COMPS (6), but this
    // route is reachable by direct POST and every row is interpolated into the
    // prompt, so the cap is enforced here rather than assumed upstream.
    const compRows = (Array.isArray(comps) ? comps : [])
      .filter((c) => c && c.salePrice && c.address)
      .slice(0, 12);
    const compsBlock = compRows.length
      ? `\nVERIFIED COMPARABLE SALES — these are real recorded transactions supplied to you.
You MAY restate these rows exactly as given. You MUST NOT add, alter, round, or
extrapolate from them, and you must not introduce any sale not listed here.

${compRows.map((c, i) =>
  `${i + 1}. ${c.address} | Parcel ${c.parcelId || 'n/a'} | Sold ${c.saleDate} for ${fmt(c.salePrice)}` +
  `${c.sqft ? ` | ${Number(c.sqft).toLocaleString()} sq ft` : ''}` +
  `${c.pricePerSqft ? ` | ${fmt(c.pricePerSqft)}/sq ft` : ''}` +
  `${c.yearBuilt ? ` | built ${c.yearBuilt}` : ''}`
).join('\n')}

Source: qualified arms-length sales from the Florida Department of Revenue sale
data file for ${county} County, drawn from the same appraiser neighborhood as the
subject property.\n`
      : '';

/**
 * THE STATUTE, SUPPLIED VERBATIM.
 *
 * A generated petition listed subsection (2) as income, (3) as "the net proceeds
 * of the sale... after deduction of the usual and reasonable fees and costs of
 * sale", and (7) as condition. The real order is below. (3) is location; the
 * net-proceeds language is subsection (8), the one criterion this service must
 * never argue — so a misnumbering smuggled it back into a petition that had been
 * written specifically to exclude it.
 *
 * Same principle as the comparable sales: hand over the facts, forbid recall.
 * Subsection (8) is deliberately ABSENT from this list and must stay absent.
 */
const FL_193_011 = `THE STATUTORY CRITERIA, VERBATIM. Use ONLY these. Do not paraphrase the
numbering, do not add subsections, and do not recite any criterion not listed here.

(1) The present cash value of the property, which is the amount a willing purchaser would
    pay a willing seller, exclusive of reasonable fees and costs of purchase, in cash or the
    immediate equivalent thereof in a transaction at arm's length.
(2) The highest and best use to which the property can be expected to be put in the
    immediate future and the present use of the property, taking into consideration any
    applicable judicial limitation, local or state land use regulation, or historic
    preservation ordinance.
(3) The location of said property.
(4) The quantity or size of said property.
(5) The cost of said property and the present replacement value of any improvements thereon.
(6) The condition of said property.
(7) The income from said property.

Subsection (8) exists and is DELIBERATELY OMITTED. Do not cite it, quote it, number any
other criterion as (8), or refer to net proceeds of sale or to deduction of the costs of
sale in any form.`;

    // THE REQUESTED FIGURE MUST BE ATTRIBUTED TO WHAT ACTUALLY SUPPORTS IT.
    //
    // A generated petition described a requested value of $539,503 as "the
    // current assessed value less the objectively documented cost to cure" on a
    // property whose assessed value was $657,930 and whose cure cost was $28,400.
    // $657,930 - $28,400 is $629,530. The sentence was arithmetically false on a
    // document signed under penalty of perjury, because the ask actually rested
    // on a different ground entirely.
    const cureTotal = Number(costToCureTotal) || 0;
    const impliedByCure = Number(assessedValue) - cureTotal;
    const askAttribution = (askRestsOn === 'evidence' || !cureTotal)
      ? `ATTRIBUTION OF THE REQUESTED VALUE: the requested value is supported by the grounds itemised above. You may describe it as following from them.`
      : `ATTRIBUTION OF THE REQUESTED VALUE — READ THIS TWICE.
The requested value is ${fmt(requestedValue)}. The documented cost to cure totals ${fmt(cureTotal)}.
Assessed value minus cost to cure would be ${fmt(impliedByCure)}, which is NOT the requested value.
You must NOT write that the requested value equals, reflects, or represents the assessed value
less the cost to cure. That sentence would be arithmetically false.
State it correctly: the cost to cure is ${fmt(cureTotal)} of the reduction sought, and the remainder
rests on the separate ground that the assessment was produced by mass appraisal without any
physical inspection of this specific property, so it cannot reflect its actual condition.
Both grounds are real. Present them as two grounds, not as one calculation.`;

    const evidencePrompt = `You are preparing the EVIDENCE AND ARGUMENT section of a Florida DR-486 Value Adjustment Board petition for the ${county} County VAB, tax year ${taxYear || new Date().getFullYear()}.

PROPERTY: ${propertyAddress}
COUNTY: ${county} County, Florida
PARCEL/FOLIO: ${parcelId || 'not provided'}
CURRENT ASSESSED VALUE: ${fmt(assessedValue)}
REQUESTED VALUE: ${fmt(requestedValue)}
${valuationBasis ? 'GROUNDS FOR THE REQUESTED VALUE (these were derived from the facts below — argue THESE, and do not substitute your own):\n' + valuationBasis : ''}
${propertyDetails ? 'PROPERTY DETAILS:\n' + propertyDetails : ''}
${compsBlock}
${issuesBlock}
OWNER NOTES: ${notes || 'None.'}

CRITICAL RULES — this document is signed by the property owner UNDER PENALTY OF PERJURY:
- DO NOT invent, estimate, or state any specific comparable sale. No street addresses, no sale prices, no sale dates, no parcel numbers other than the one given above.
- The ONLY comparable sales you may reference are those listed under VERIFIED COMPARABLE SALES, if that section is present. Restate them exactly. If it is absent, cite no sales at all.
- DO NOT state any statistic, percentage, or market figure you cannot source. No fabricated median values or appreciation rates.
- Only assert facts supplied above. Everything else must be framed as the analytical standard the Board should apply, not as fact.
- If a section would require data you do not have, say what evidence the owner should submit instead.
${FL_193_011}

${askAttribution}

- DO NOT cite, quote, or reference ANY court decision, case name, or reporter citation.
  Not one. We cannot verify a citation before it is mailed, and a fabricated or
  misapplied case on a document the owner signs under penalty of perjury is worse than
  no legal argument at all. This project has already cited three Florida cases for
  propositions none of them hold. Argue from the statute text supplied above and from the
  facts of this property, and nothing else.
- DO NOT refer to comparable sales, "comparable sales analysis", "what buyers actually pay
  for similar properties", or any equivalent phrase UNLESS a VERIFIED COMPARABLE SALES table
  was supplied to you above. When none was supplied there are none — not "to be submitted
  separately", not "as demonstrated through comparable sales". A petition that credits its
  requested value to evidence it does not attach is asking the Board to take an unsupported
  figure on trust, over an owner's signature given under penalty of perjury.
  If no table was supplied, attribute the requested value ONLY to the grounds actually stated
  above: the priced cost to cure, and the fact that a mass appraisal produced this value
  without examining this specific property.
- DO NOT argue the "eighth criterion" (§ 193.011(8)) deduction of costs of sale, and do not
  assert the Property Appraiser failed to deduct costs of sale. Every Florida property
  appraiser files Form DR-493 ("Adjustments Made to Recorded Selling Prices or Fair Market
  Value IN ARRIVING AT ASSESSED VALUE") and in practice certifies roughly 15% across all use
  codes, so the just value on the TRIM notice is normally already net of it. Arguing it again
  is double counting, and asserting it was omitted would be a false statement of fact on a
  petition signed under penalty of perjury.
- DO NOT cite Deltona Corp. v. Bailey, Valencia Center v. Bystrom, or Bystrom v. Whitman for a
  cost-of-sale proposition. None of them holds that. Bystrom v. Equitable Life, 416 So. 2d
  1133, is directly adverse, and Mazourek v. Wal-Mart, 831 So. 2d 85 (Fla. 2002), is Supreme
  Court authority against the expansive theory.

Write exactly 4 sections:
1. BASIS OF PETITION — why the assessed value exceeds just value as of January 1, citing the applicable Fla. Stat. § 193.011 criteria (1) through (7) ONLY and applying them to the property details given above. DO NOT cite or quote § 193.011(8). It is the net-proceeds/costs-of-sale criterion, the appraiser has already applied it, and arguing it is the prohibition stated above — the previous version of this instruction said "(1)-(8)" and the resulting petition opened by quoting subsection (8).
2. PROPERTY CONDITION — the specific condition factors reported by the owner above and how each bears on just value. If none were reported, say so plainly.
3. COMPARABLE SALES AND VALUATION METHODOLOGY — INCLUDE THIS SECTION ONLY IF VERIFIED COMPARABLE SALES WERE SUPPLIED ABOVE. If they were, present them in a table (address, sale date, sale price, square feet, price per square foot), state the source line given, and explain what they indicate about just value as of January 1 under § 193.011(1).
IF NONE WERE SUPPLIED, OMIT SECTION 3 ENTIRELY and renumber the sections that follow. Do not describe a methodology, do not tell the Board what sales to look for, and above all do NOT state that the owner will submit comparable sales separately — the previous version of this instruction said exactly that, and produced a petition promising evidence the owner had no plan to file, over their signature under penalty of perjury. A petition resting on condition and on the absence of a physical inspection is complete without a comparable sales section; adding an empty one only advertises what is missing.
4. LEGAL BASIS — Fla. Stat. § 193.011 (just valuation criteria) and § 194.301 (burden of proof; presumption of correctness and when it is lost).

Professional, factual, first person as the property owner. Output only the four sections.`;

    let evidenceText;
    if (providedEvidence && String(providedEvidence).trim()) {
      // Signing pass — reuse the evidence the owner actually read.
      evidenceText = String(providedEvidence);
    } else {
    // Global daily ceiling across ALL callers. Per-IP limits bound one attacker; a
    // residential proxy pool defeats them. See lib/spendGuard.js.
    const spend = await checkSpend('anthropic', 1);
    if (!spend.ok) {
      return res.status(503).json({
        error: 'We are temporarily unable to prepare petitions. Please try again shortly.',
        code: 'CAPACITY',
      });
    }
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2000, messages: [{ role: 'user', content: evidencePrompt }] }),
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);
    evidenceText = claudeData.content?.[0]?.text || '';

    // ONE RETRY, THEN STRIP. See citesAbsentComps above for why this exists.
    const badComps = () => compRows.length === 0 && citesAbsentComps(evidenceText);
    if (badComps() || citesCaseLaw(evidenceText)) {
      console.warn('[dr486] output cited unsupplied evidence — retrying once', { comps: badComps(), caseLaw: citesCaseLaw(evidenceText) });
      const retry = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5', max_tokens: 2000,
          messages: [{ role: 'user', content: `${evidencePrompt}\n\nYOUR PREVIOUS ATTEMPT REFERRED TO COMPARABLE SALES. NONE WERE SUPPLIED WITH THIS PETITION. Rewrite it. Remove every mention of comparable sales, comparable properties, a sales comparison approach, or what buyers pay for similar homes — in any form, including a promise to submit them later; omit that section entirely and renumber. Remove every case name, court decision and reporter citation. Argue only from the statutory text supplied and the facts of this property.` }],
        }),
      });
      const retryData = await retry.json();
      const retryText = retryData?.content?.[0]?.text || '';
      const retryClean = retryText && !citesCaseLaw(retryText) && !(compRows.length === 0 && citesAbsentComps(retryText));
      if (retryClean) {
        evidenceText = retryText;
      } else {
        // Still wrong. Drop the offending paragraphs rather than mailing a claim
        // we cannot support — a shorter petition is recoverable, a false one is
        // not, and the owner signs this.
        console.error('[dr486] retry still cited absent comparables — removing those paragraphs');
        evidenceText = evidenceText
          .split(/\n\s*\n/)
          .filter((para) => !citesCaseLaw(para) && !(compRows.length === 0 && citesAbsentComps(para)))
          .join('\n\n');
      }
    }
    }

    const filingDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const dr486Html = buildDR486Html({
      ownerFirstName, ownerLastName, ownerEmail, ownerPhone,
      ownerStreet, ownerCity, ownerState, ownerZip,
      propertyAddress, county, parcelId: parcelId || 'See county records',
      assessedValue, requestedValue, taxYear,
      evidenceText, vabName: vab.vabName,
      ownerSignatureName: preview ? '' : ownerSignatureName,
      ownerSignatureDate, filingDate, preview: !!preview,
      willNotAttend: willNotAttend !== false, // owner's disclosed election
      authorizeConfidential: !!authorizeConfidential,
    });

    let letterKey = null;
    if (redis) {
      try {
        // 7-day TTL. The old 2-hour TTL meant any customer who paused between
        // generating and paying lost their petition, and the success page then
        // silently skipped creating an order row at all.
        letterKey = `dr486:FL:${zip || county}:${Date.now()}`;
        await redis.set(letterKey, dr486Html, { ex: 604800 });
      } catch (e) { console.log('Redis cache failed:', e.message); }
    }

    return res.status(200).json({
      success: true, dr486Html, evidenceText, letterKey, isFL: true, preview: !!preview,
      vabName: vab.vabName,
    });
  } catch (err) {
    console.error('DR-486 generation error:', err);
    return res.status(500).json({ error: err.message || 'DR-486 generation failed' });
  }
}
