/**
 * DR-486 PETITION GENERATOR — FLORIDA
 *
 * ============================================================================
 * FILING MODEL: DOCUMENT PREPARATION + MAILING (owner is the signatory)
 *
 * NOT "filing agent" — see the PREPARER block below. An agent is precisely what
 * everything under this heading exists to establish we are not.
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

/**
 * 64 KB instead of Next's 1 MB default (see lib/inputLimits.js), and an EXPLICIT
 * function ceiling.
 *
 * maxDuration is pinned rather than inherited. ANTHROPIC_EVIDENCE_BUDGET_MS below
 * only means anything if the platform lets the function live that long — and the
 * first draft of that budget was justified against an assumed 300s Fluid default,
 * which is exactly the kind of thing that is true until someone changes a plan or a
 * project setting. Every other long-running route here already pins it
 * (cron/process-queued-orders.js, cron/settle-referrals.js). If the platform kills
 * this function mid-retry the customer gets an opaque HTML 504, apply.js fails
 * parsing it as JSON, and the carefully-worded 503 below is never reached — a worse
 * outcome than the bug this file set out to fix. scripts/verify-petition.mjs asserts
 * the budget stays inside this number.
 */
export const config = { ...PROMPT_ROUTE_CONFIG, maxDuration: 300 };

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

/**
 * TaxAppeal appears ONLY as preparer — never as representative, and never as
 * "filing agent" either.
 *
 * WHY THE WORD "FILED" WAS REMOVED FROM EVERY STRING BELOW.
 *
 * "Filing agent" is a contradiction we shipped: an agent is exactly what we
 * spent this whole file establishing we are not. Filing a petition on another
 * person's behalf is an act of agency; putting a document in the mail is a
 * courier function. We do the second one.
 *
 * It also contradicted our own customer agreement. components/StepFloridaFee.js
 * has the owner agree that we will "pay the county filing fee on my behalf, and
 * mail the petition for me" — mail, not file. When the contract and the petition
 * disagree, the Board reads the petition, so the petition is the one that has to
 * be right.
 *
 * Everything here now uses prepare / mail, and nothing else.
 *
 * Note also what this footer is: an ADDENDUM. The DR-486 has an Agent field
 * (which demands a professional licence number or FBN, and which we leave empty)
 * and NO preparer field at all. So none of this is required by the form. It is
 * here on purpose, because the mail piece is a Lob check drawn on TaxAppeal USA's
 * account with the petition attached — the clerk already knows our name before
 * they read a word of the form. A compensated company's cheque arriving with a
 * petition that never explains who sent it is the fact pattern that looks like an
 * undisclosed agent. Naming ourselves and disclaiming agency is the safer of the
 * two options, not the riskier one.
 */
const PREPARER = {
  name: 'TaxAppeal USA',
  role: 'Document preparation and mailing service',

  /**
   * TWO ADDRESSES, TWO JOBS. Do not collapse them back into one.
   *
   * contactEmail is a monitored inbox, read by a person. It is the ONLY address
   * that may be printed for a human — a clerk, a Board, a customer — to write to.
   *
   * decisionsEmail feeds pages/api/webhooks/inbound-email.js: mail arriving there
   * is parsed and the outcome is pushed to the customer's portal. It is a machine
   * intake, not an inbox. Nobody reads it.
   *
   * Both were disputes@ until now, which meant the petition handed a county clerk
   * an address no human monitors — on the one piece of paper we cannot correct
   * after it is in the mail. The determination request must stay on decisionsEmail,
   * because that request is the entire reason the parser exists.
   *
   * WHY decisionsEmail IS ON A SUBDOMAIN (mail.taxappealusa.com), 4 Aug 2026.
   *
   * A domain has exactly one set of MX records, and MX decides where all mail for
   * that name goes. taxappealusa.com's MX points at GoDaddy's Proofpoint front end
   * (mx1/mx2/mx3-usg2.ppe-hosted.com), which serves the human mailboxes.
   * disputes@taxappealusa.com sat behind it and silently stopped delivering:
   * accepted at the edge, never handed on, and no bounce to the sender — the
   * failure mode that leaves nothing in any log. customerservice@ on the same
   * domain kept working throughout, which proved DNS and the tenant were fine and
   * the fault was recipient-specific, inside a layer we cannot inspect.
   *
   * A machine intake must not depend on a mailbox we cannot inspect. The subdomain
   * mail.taxappealusa.com carries its OWN MX, pointed straight at Postmark, so this
   * address bypasses GoDaddy, Proofpoint and Microsoft entirely while
   * customerservice@ is left untouched. It also sidesteps Microsoft's default block
   * on automatic external forwarding, which would have broken the old
   * mailbox-forwards-to-Postmark design even after the mailbox was repaired.
   *
   * DO NOT "tidy" this back onto the root domain. The local part stays `disputes`
   * precisely so the change looks small; the part that matters is after the @.
   * A `vab.` subdomain was rejected — Value Adjustment Board is Florida-only
   * vocabulary, and this same intake will carry TX appraisal district and GA/AR/AL
   * Board of Equalization determinations.
   */
  contactEmail: 'customerservice@taxappealusa.com',
  decisionsEmail: 'disputes@mail.taxappealusa.com',
};

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * "Broward County" + " County" = "Broward County County".
 *
 * The county arrives from orders.county WITH the suffix, and both the Assessment
 * Summary and the evidence prompt appended another. It read "Broward County County,
 * Florida" on a sworn filing sent to that county's own Clerk.
 */
/**
 * Output budget for the evidence section. 2000 was the original and it truncated a
 * real petition mid-word once six comparable sales started being included — see the
 * note at the call site. 6000 leaves room for a full comp table, several priced
 * defects, and all four sections, without inviting bloat: every extra page is
 * another page Lob prints and posts.
 */
const EVIDENCE_MAX_TOKENS = 6000;

/**
 * ============================================================================
 * THE MODEL CALL HAD NO TIMEOUT AND NO RETRY. THIS IS THE REVENUE PATH.
 * ============================================================================
 * On 24 Aug 2026 Anthropic had a brief outage. A customer sitting on the review
 * screen at that moment clicked to generate their petition, this route's single
 * fetch failed, the outer catch turned it into a 500, and they could not buy. There
 * was no second attempt. The failure alertOps' own header names as the one that
 * stops revenue outright had exactly one chance to not happen.
 *
 * The existing retry above covers TRUNCATION — the model finished but ran out of
 * budget. It does nothing for the API being unreachable, which is a different
 * failure at a different layer, and the more likely of the two.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IS RETRIED: ONLY WHAT DEMONSTRABLY PRODUCED NOTHING
 * ────────────────────────────────────────────────────────────────────────────
 * The first draft of this retried anything that smelled like transport, including a
 * timeout. That is wrong, and the reason is money rather than latency: a
 * non-streaming request that we hang up on at N seconds has ALREADY had its tokens
 * generated and billed. Anthropic does not un-bill them because we stopped
 * listening. So retrying a timeout pays twice and sells nothing — while
 * checkSpend('anthropic', 1) below counts the whole evidence step as one.
 *
 * So the retryable set is deliberately narrow, and every member of it is a case
 * where inference PROVABLY never started:
 *
 *   fetch failed  the TCP/TLS connection was never established. Nothing was sent.
 *   429           rate limited. Rejected at the edge, before any model ran.
 *   503 / 529     capacity refusal. Same — this is the shape of a real outage.
 *
 * Everything else fails on the first attempt, on purpose:
 *
 *   timeout       the vendor was probably working, just slow. Sending the same
 *                 request again makes it slower AND bills it twice.
 *   terminated    socket reset mid-BODY — the response had started, so tokens were
 *                 generated. Ambiguous, and ambiguity here costs real money.
 *   500/502/504   could be pre- or post-inference. Not worth the gamble.
 *   400 / 401     a broken request or a dead key. Retrying spends the customer's
 *                 patience three times to reach the same answer.
 *
 * That keeps the claim under checkSpend HONEST: a retry here follows an attempt that
 * generated no tokens, so not re-counting it is correct rather than convenient.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THE TIMEOUT IS GENEROUS AND SCALES WITH THE ASK
 * ────────────────────────────────────────────────────────────────────────────
 * A fixed per-attempt timeout is a guess about how long a legitimate generation
 * takes, and guessing low breaks real petitions to fix a rare one — a strictly
 * worse trade. It is worse still on the TRUNCATION retry below, which asks for
 * DOUBLE the tokens: that call is by construction the longest generation this route
 * ever issues, so a constant timeout squeezes the one request that needs the most
 * room, turning a recoverable long petition into a deterministic dead end.
 *
 * So the timeout is derived from what was asked for, and the whole evidence step —
 * both askClaude calls — shares one wall-clock budget inside the pinned
 * maxDuration below. The timeout exists to catch a socket that is hung, not to
 * hurry a model that is working.
 */
const ANTHROPIC_EVIDENCE_BUDGET_MS = 270000;
/** Per attempt: a floor for connection setup, plus room proportional to the ask. */
const ANTHROPIC_TIMEOUT_BASE_MS = 45000;
const ANTHROPIC_TIMEOUT_PER_TOKEN_MS = 18;
/** Below this, there is not enough budget left for a retry to plausibly finish. */
const ANTHROPIC_MIN_RETRY_MS = 20000;
export const ANTHROPIC_MAX_ATTEMPTS = 3;
/**
 * Exported and read by index at call time so scripts/verify-petition.mjs can zero
 * the waits while it counts attempts. Without that the guard sleeps 4s per exhausted
 * case and adds ~10s to every build — a slow suite is a suite people start skipping.
 * The guard separately asserts these real values are non-zero and ascending, so
 * zeroing them in a test cannot hide a backoff that was removed in production.
 */
export const ANTHROPIC_BACKOFF_MS = [1000, 3000];

/** Statuses that prove the request was refused BEFORE any token was generated. */
const ANTHROPIC_RETRYABLE_STATUS = new Set([429, 503, 529]);

const anthropicAttemptTimeout = (maxTokens) =>
  ANTHROPIC_TIMEOUT_BASE_MS + maxTokens * ANTHROPIC_TIMEOUT_PER_TOKEN_MS;

export function bareCounty(county) {
  return String(county || '').replace(/\s+County\s*$/i, '').trim();
}

/**
 * Dates on this document are legal facts, so they are rendered in the PROPERTY's
 * timezone, not the server's.
 *
 * The 5 Aug test petition was signed at 22:09 US Central and the DR-486 recorded it
 * as "August 6, 2026" — Vercel runs UTC, and toLocaleDateString with no timeZone
 * follows the server. A sworn attestation dated a day after it was made is a defect
 * on its face, and for a Florida filing the relevant clock is Eastern.
 */
export function flDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/**
 * The model is instructed to emit plain prose, but instruction is not enforcement.
 * evidenceText is rendered inside a white-space:pre-wrap block, so any markdown that
 * does slip through appears LITERALLY on the petition: the 5 Aug test document went
 * out reading "# EVIDENCE AND ARGUMENT" and "**Florida Statutes § 193.011**" on a
 * filing to a government board over a homeowner's signature.
 *
 * Strips only the syntax, never the words. Applied at render, so it also cleans any
 * evidence generated before the prompt was tightened.
 */
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')      // headings
    .replace(/\*\*(.+?)\*\*/gs, '$1')        // bold
    .replace(/(^|\s)\*(?!\s)(.+?)(?<!\s)\*(?=\s|$|[.,;:)])/gs, '$1$2')  // italics
    .replace(/^\s{0,3}[-*+]\s+/gm, '\u2022 ')  // bullets -> real bullet
    .replace(/`([^`]+)`/g, '$1')              // inline code
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildDR486Html({
  ownerFirstName, ownerLastName, ownerEmail, ownerPhone,
  ownerStreet, ownerCity, ownerState, ownerZip,
  propertyAddress, county, parcelId, assessedValue, requestedValue, taxYear, comps,
  evidenceText, vabName, ownerSignatureName, ownerSignatureDate, filingDate,
  willNotAttend, authorizeConfidential, preview,
}) {
  /**
   * A blank is honest. "See county records" is a placeholder wearing the costume
   * of content — on a sworn form, in the box stating the value under dispute, it
   * reads as though a figure were supplied. The handler now refuses outright when
   * a value is missing (see FL_MISSING_PARCEL_FACTS), so this branch should be
   * unreachable for the values that matter; it renders an em dash rather than a
   * sentence so that if it ever IS reached the gap is visible instead of disguised.
   */
  const fmt = (n) => (Number(n) > 0 ? `$${Number(n).toLocaleString()}` : '\u2014');
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
    <div class="row"><div class="field"><div class="field-label">Owner Name</div><div class="field-value">${esc(ownerFirstName)} ${esc(ownerLastName)}</div></div><div class="field"><div class="field-label">Email</div><div class="field-value">${esc(ownerEmail)}</div></div>${ownerPhone ? `<div class="field"><div class="field-label">Phone</div><div class="field-value">${esc(ownerPhone)}</div></div>` : ''}</div>
    <div class="row"><div class="field" style="flex:2"><div class="field-label">Mailing Address</div><div class="field-value">${esc(ownerStreet)}</div></div><div class="field"><div class="field-label">City</div><div class="field-value">${esc(ownerCity)}</div></div><div class="field" style="flex:0.4"><div class="field-label">State</div><div class="field-value">${esc(ownerState)}</div></div><div class="field" style="flex:0.7"><div class="field-label">ZIP</div><div class="field-value">${esc(ownerZip)}</div></div></div>
    <div class="row"><div class="field" style="flex:2"><div class="field-label">Property Address</div><div class="field-value">${esc(propertyAddress)}</div></div><div class="field"><div class="field-label">County</div><div class="field-value">${esc(bareCounty(county))} County</div></div><div class="field"><div class="field-label">Parcel / Folio ID</div><div class="field-value">${esc(parcelId)}</div></div></div>
    <div class="row"><div class="field" style="flex:0.7"><div class="field-label">Tax Year</div><div class="field-value">${esc(yr)}</div></div><div class="field"><div class="field-label">Property Type</div><div class="field-value">Residential 1-4 Units</div></div><div class="field"><div class="field-label">Preferred Contact</div><div class="field-value">Email: ${esc(ownerEmail)}</div></div></div>
  </div></div>

  <div class="part"><div class="part-header">PART 2 — REASON FOR PETITION</div><div class="part-body">
    <div class="checkbox-row">${box(true)}<span><strong>Real property value</strong> — assessed value exceeds fair market value as of January 1, ${esc(yr)}.</span></div>
    <div style="margin-top:8px;"><div class="field-label">Estimated time needed:</div><div class="field-value" style="width:120px;">15 minutes</div></div>
    <div style="margin-top:8px;" class="checkbox-row">${box(!!willNotAttend)}<span>I will not attend the hearing but would like my evidence considered. My evidence is enclosed with this petition.</span></div>
    <div style="margin-top:4px;" class="checkbox-row">${box(!willNotAttend)}<span>I intend to attend the hearing.</span></div>
  </div></div>

  <div class="part"><div class="part-header">PART 3 — TAXPAYER SIGNATURE</div><div class="part-body">
    <p style="font-size:9pt;margin-bottom:8px;">This petition is signed by the property owner pursuant to section 194.011(3), Florida Statutes.</p>
    <div class="sig-block"><div class="sig-line">${preview ? '<span style="font-style:normal;font-size:10pt;color:#888;">— you will sign here after reviewing this petition —</span>' : esc(ownerSignatureName)}</div>
      <div class="sig-label">Signature of Taxpayer / Property Owner (electronically signed) &nbsp;&nbsp; Date: ${esc(flDate(ownerSignatureDate) || today)}</div>
      <div class="attest"><strong>Under penalties of perjury</strong>, I declare that I am the owner of the property described in this petition, that I have read this petition, and that the facts stated in it are true.</div>
      ${authorizeConfidential ? `<div class="attest" style="margin-top:6px;">I authorize the Property Appraiser and the Clerk of the Value Adjustment Board to release information regarding this petition to ${esc(PREPARER.name)}, ${esc(PREPARER.decisionsEmail)}, which prepared this petition at my direction and mailed it for me. This authorization releases records only. It does not appoint ${esc(PREPARER.name)} as my agent or representative.</div>` : ''}
    </div>
  </div></div>

  <div class="part"><div class="part-header">PART 4 — EMPLOYEE, ATTORNEY, OR LICENSED PROFESSIONAL REPRESENTATIVE</div><div class="part-body">
    <p class="na">Not applicable — this petition is signed by the taxpayer (Part 3). No representative is designated.</p>
  </div></div>

  <div class="part"><div class="part-header">PART 5 — UNLICENSED REPRESENTATIVE</div><div class="part-body">
    <p class="na">Not applicable — this petition is signed by the taxpayer (Part 3). No representative is designated.</p>
  </div></div>

  <div class="part"><div class="part-header">ASSESSMENT SUMMARY</div><div class="part-body">
    <table class="summary"><tr><td>Property Address</td><td>${esc(propertyAddress)}</td></tr><tr><td>County</td><td>${esc(bareCounty(county))} County, Florida</td></tr><tr><td>Parcel / Folio ID</td><td>${esc(parcelId)}</td></tr><tr><td>Tax Year</td><td>${esc(yr)}</td></tr><tr><td>Current Assessed Value</td><td>${fmt(assessedValue)}</td></tr><tr><td>Requested Value</td><td>${fmt(requestedValue)}</td></tr><tr><td>Legal Basis</td><td>Florida Statute § 193.011 — just value criteria</td></tr></table>
  </div></div>

  <div class="page-break"></div>
  <div class="part"><div class="part-header">EVIDENCE AND ARGUMENT IN SUPPORT OF PETITION</div><div class="part-body">
    <div class="evidence-block">${esc(stripMarkdown(evidenceText))}</div>
  </div></div>

  <div style="margin-top:16px;font-size:8.5pt;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:10px;">
    This petition was prepared at the property owner's direction by ${esc(PREPARER.name)} — ${esc(PREPARER.role)} — and mailed on the owner's behalf. Prepared: ${esc(today)}.<br/>
    <strong>The property owner signed this petition personally and is the petitioner of record.</strong> ${esc(PREPARER.name)} is not the owner's representative or agent in this proceeding. It will not appear before the Board, will not present evidence or argument at any hearing, and has no authority to act for the owner. No agent authorization &mdash; DR-486A or DR-486POA &mdash; is filed with this petition, and none is intended.<br/>
    <strong>Direct all correspondence and the Board's determination to the property owner at the address above.</strong> ${authorizeConfidential
      ? `The owner has separately authorized in writing that a courtesy copy of the determination also be sent to ${esc(PREPARER.decisionsEmail)}; that authorization releases records only and appoints no representative.`
      : ''}<br/>
    Questions about the enclosed filing-fee payment or this mailing only: ${esc(PREPARER.contactEmail)}. Questions about the petition itself should go to the property owner.
  </div>
</div></body></html>`;
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
    // WHERE THOSE COMPS CAME FROM. Must be destructured HERE, in the handler —
    // adding it only to buildDR486Html's parameter list reproduces exactly the
    // ReferenceError described directly above, and verify-routes catches it by
    // actually invoking the handler rather than by reading it.
    //
    // 'county' is the only value that admits comps to the petition, because the
    // source line printed beneath them names the DOR sale data file specifically.
    compsSource,
    /**
     * WHICH GROUND THE ASK RESTS ON — SENT SINCE 6 AUG, READ BY NOBODY UNTIL NOW.
     *
     * lib/valuation.js computes `askRestsOn` and its own comment calls it "the
     * load-bearing condition": when the 18% floor governs, the petition MUST
     * attribute the demand to the mass-appraisal ground and NOT to the cure cost.
     * pages/apply.js sends it, beside a comment reading "Without these the petition
     * described an 18% floor-based figure as 'assessed value less cost to cure'".
     *
     * It was never destructured here. The diagnosis was right, the value was on the
     * wire, and the receiving end never listened — so the petition mailed on 12 Aug
     * said, verbatim: "The requested value of $859,057 represents the current
     * assessed value reduced by the $114,900 cost to cure." That is $932,730, not
     * $859,057. The same document then gave a SECOND, different derivation — the
     * midpoint of five comps less the cure — which is $750,100. Two contradictory
     * arithmetic claims about the petition's headline figure, neither true, on a
     * document sworn under penalty of perjury, in front of a board whose function
     * is to check precisely that arithmetic.
     *
     * The real derivation is neither: requestedValue = assessed x (1 - clamped),
     * clamped = max(BAND.floor, evidencePct). At exactly 18.0000% the floor
     * governed — meaning the evidence supported LESS, and the ask is a stated
     * minimum rather than a computed figure.
     *
     * Sending a value is not the same as reading it. Same lesson as `compsSource`
     * immediately above; same lesson as the other flags with zero readers.
     */
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

  /**
   * ======================================================================
   * NO PARCEL, NO VALUES, NO PETITION.
   * ======================================================================
   * Added 11 Aug 2026, after tracing what this route did with an empty lookup.
   *
   * `fmt()` returns the string "See county records" for any falsy number, and the
   * same fallback was applied to `parcelId` at the call site. So a property we held
   * no roll data on produced a DR-486 carrying that string in the folio box, the
   * current-assessed-value box AND the requested-value box — under a pre-checked
   * assertion that the assessed value exceeds market value, above a Part 3
   * declaration the owner signs under penalty of perjury.
   *
   * All three fields are load-bearing. The folio tells the Board WHICH property.
   * The assessed value is the figure being disputed. The requested value is the
   * ask. A petition missing them is not a weak petition — it is one the clerk
   * cannot process, and Florida's deadline is satisfied by physical receipt with
   * no recovery once it passes.
   *
   * Same shape and same reasoning as the county refusal directly below: where we
   * cannot file correctly we refuse, rather than produce something that looks like
   * a filing. The funnel now stops these at pages/apply.js StepFloridaCheck, so
   * reaching here means that gate was bypassed or has regressed. Refusing in both
   * places is the point.
   */
  const missingPetitionFacts = [];
  if (!parcelId || !String(parcelId).trim()) missingPetitionFacts.push('parcel/folio number');
  if (!(Number(assessedValue) > 0)) missingPetitionFacts.push('current assessed value');
  if (!(Number(requestedValue) > 0)) missingPetitionFacts.push('requested value');
  if (missingPetitionFacts.length) {
    return res.status(400).json({
      error: `We cannot prepare a Value Adjustment Board petition without the ${missingPetitionFacts.join(', ')} for this property. A petition has to identify the parcel and state the values in dispute.`,
      code: 'FL_MISSING_PARCEL_FACTS',
      missing: missingPetitionFacts,
    });
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
    /**
     * =====================================================================
     * COMPS WITHOUT KNOWN PROVENANCE ARE NOT USED. Added 11 Aug 2026.
     * =====================================================================
     * The source line below is a specific factual assertion — DOR sale data
     * file, appraiser neighborhood — and it was emitted unconditionally under
     * whatever array arrived. pages/api/comps.js has two paths: the county one
     * returns `basis.source === 'county'`, and a RentCast fallback that returns
     * neither. Vendor rows were being printed under the DOR attribution on a
     * document signed under penalty of perjury, while their own correct label
     * ('...via RentCast') was discarded upstream.
     *
     * Dropping them is the right failure. A petition with no comps argues the
     * statutory methodology, which is already fully supported below and is what
     * the zero-comps explainer on the preview describes. A petition citing sales
     * to the wrong source is a misstatement on a sworn form.
     */
    const compsProvenanceOk = compsSource === 'county';
    if (Array.isArray(comps) && comps.length && !compsProvenanceOk) {
      console.warn(`[generate-dr486] dropping ${comps.length} comp(s): compsSource=${compsSource || 'none'}, cannot carry the DOR attribution`);
    }
    const compRows = (compsProvenanceOk && Array.isArray(comps) ? comps : [])
      .filter((c) => c && c.salePrice && c.address)
      .slice(0, 12);
    /**
     * SAY THE MONTH, BECAUSE THE MONTH IS WHAT WE HAVE.
     *
     * lib/dor/parseRoll.js builds sale_date as `${yr}-${mo}-01` and says so in its
     * own comment: "Day is unknown in the roll — only year and month are reported.
     * Using the 1st is a deliberate, documented convention, not a parsing accident."
     *
     * That convention is fine inside the database and wrong on a sworn petition. The
     * document mailed on 12 Aug listed six comparable sales dated "April 1, 2026",
     * "February 1, 2026", "October 1, 2025" — every one the 1st, because every one
     * was synthesised. Two problems, and the second is the worse of them: it states
     * a precise date we do not hold, on a document signed under penalty of perjury;
     * and six sales all falling on the 1st tells the Property Appraiser at a glance
     * that the dates are manufactured, which invites them to attack the credibility
     * of the whole evidence package rather than its substance.
     *
     * Rendering the month is both honest and unremarkable — "sold in April 2026" is
     * how comparable sales are ordinarily described.
     */
    const saleMonth = (iso) => {
      const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(iso || ''));
      if (!m) return String(iso || 'date not reported');
      const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const name = MONTHS[Number(m[2]) - 1];
      return name ? `${name} ${m[1]}` : String(iso);
    };

    const compsBlock = compRows.length
      ? `\nVERIFIED COMPARABLE SALES — these are real recorded transactions supplied to you.
You MAY restate these rows exactly as given. You MUST NOT add, alter, round, or
extrapolate from them, and you must not introduce any sale not listed here.
Sale dates are reported by the county to the MONTH ONLY. Write them exactly as given
— "sold in April 2026". Never convert a month into a specific day.

${compRows.map((c, i) =>
  `${i + 1}. ${c.address} | Parcel ${c.parcelId || 'n/a'} | Sold ${saleMonth(c.saleDate)} for ${fmt(c.salePrice)}` +
  `${c.sqft ? ` | ${Number(c.sqft).toLocaleString()} sq ft` : ''}` +
  `${c.pricePerSqft ? ` | ${fmt(c.pricePerSqft)}/sq ft` : ''}` +
  `${c.yearBuilt ? ` | built ${c.yearBuilt}` : ''}`
).join('\n')}

Source: qualified arms-length sales from the Florida Department of Revenue sale
data file for ${bareCounty(county)} County, drawn from the same appraiser neighborhood as the
subject property.\n`
      : '';
    /**
     * HOW THE REQUESTED VALUE WAS ACTUALLY REACHED, SUPPLIED AS A FACT.
     *
     * The model was previously handed REQUESTED VALUE as a bare number and asked to
     * argue for it, so it back-filled a derivation that sounded plausible and was
     * arithmetically false — twice, in the same document, with two different wrong
     * answers. That is not a phrasing problem. Given a number and no account of
     * where it came from, inventing one is the only thing left to do.
     *
     * So the account is supplied, in the same shape as the comps source line: a
     * sentence to restate, plus a prohibition on constructing any other.
     *
     * The floor case is the one that matters. When `askRestsOn` is
     * 'mass_appraisal_floor' the evidence supported LESS than the ask, and saying
     * "assessed less cost to cure" both overstates the defects' contribution and
     * gives the Board a subtraction that does not compute. Naming it as a minimum
     * resting on the mass-appraisal ground is accurate AND stronger: it is an
     * ordinary alternative-grounds petition rather than one contradicting itself.
     */
    const cureNum = Number(costToCureTotal) || 0;
    const askBasisBlock = (() => {
      if (!requestedValue || !assessedValue) return '';
      const head = 'HOW THE REQUESTED VALUE WAS REACHED (state this and only this — see the rules below):';
      if (askRestsOn === 'evidence') {
        return `${head}
The requested value is the assessed value reduced by the priced grounds set out below,
which together support a reduction of this size.${cureNum > 0 ? ` Of that reduction, ${fmt(cureNum)} is the documented cost to cure the condition defects.` : ''}`;
      }
      // Floor governs, or we could not tell — both must be described as a minimum.
      return `${head}
The requested value is a MINIMUM reduction. It rests on the mass-appraisal ground —
that a county-wide valuation model does not reflect this property's individual
characteristics — which applies to this property irrespective of its condition.
${cureNum > 0
  ? `The documented cost to cure of ${fmt(cureNum)} is an ADDITIONAL and independent ground. It is NOT the arithmetic by which the requested value was produced, and the requested value is NOT the assessed value minus the cost to cure. Do not present it as such, and do not subtract one figure from another anywhere in this document.`
  : 'Do not present the requested value as the output of any subtraction.'}
The owner asks the Board to determine just value at no more than the requested figure.`;
    })();

    const evidencePrompt = `You are preparing the EVIDENCE AND ARGUMENT section of a Florida DR-486 Value Adjustment Board petition for the ${bareCounty(county)} County VAB, tax year ${taxYear || new Date().getFullYear()}.

PROPERTY: ${propertyAddress}
COUNTY: ${bareCounty(county)} County, Florida
PARCEL/FOLIO: ${parcelId || 'not provided'}
CURRENT ASSESSED VALUE: ${fmt(assessedValue)}
REQUESTED VALUE: ${fmt(requestedValue)}
${askBasisBlock}
${valuationBasis ? 'GROUNDS FOR THE REQUESTED VALUE (these were derived from the facts below — argue THESE, and do not substitute your own):\n' + valuationBasis : ''}
${propertyDetails ? 'PROPERTY DETAILS:\n' + propertyDetails : ''}
${compsBlock}
${issuesBlock}
OWNER NOTES: ${notes || 'None.'}

CRITICAL RULES — this document is signed by the property owner UNDER PENALTY OF PERJURY:
- DO NOT invent, estimate, or state any specific comparable sale. No street addresses, no sale prices, no sale dates, no parcel numbers other than the one given above.
- SALE DATES ARE MONTH-PRECISION. The county reports the month and year of a sale, never
  the day. Write "sold in October 2025". Never write "October 1, 2025" or any other day,
  for any sale, under any circumstances.
- The ONLY comparable sales you may reference are those listed under VERIFIED COMPARABLE SALES, if that section is present. Restate them exactly. If it is absent, cite no sales at all.
- DO NOT state any statistic, percentage, or market figure you cannot source. No fabricated median values or appreciation rates.
- DO NOT DERIVE THE REQUESTED VALUE. Restate the account given under "HOW THE REQUESTED
  VALUE WAS REACHED" and construct no other. Do not write that the requested value equals
  the assessed value minus the cost to cure, or a comparable sale minus anything, or any
  other subtraction, average or percentage — not even as an aside, and not even if the
  figures look as though they ought to work. A board member with a calculator is the
  intended reader of this document, and a derivation that does not compute discredits the
  petition and everything else in it.
- Only assert facts supplied above. Everything else must be framed as the analytical standard the Board should apply, not as fact.
- If a section would require data you do not have, state the standard the Board must apply and rest on the facts given. Do NOT say what evidence the owner should submit.
- NEVER PROMISE FUTURE EVIDENCE. This petition is the owner's complete submission and the
  owner has elected not to attend the hearing, so nothing further will follow it. Do not
  write "I will submit", "I will provide", "I will present", "evidence to follow", or any
  variation. A board told that evidence is coming will wait for a package that never
  arrives and rule on an apparently abandoned filing. Write only in the present tense
  about what this document contains.
- OUTPUT PLAIN PROSE ONLY. No markdown of any kind: no #, no ##, no **bold**, no *italics*,
  no backticks, no bullet characters. Section headings are plain capitalised lines. The
  text is printed verbatim onto a legal form mailed to a government board; markdown syntax
  appears literally on the page.
- Do not claim any analysis was performed that is not evidenced above. If no comparable
  sales were supplied, do not write that comparable sales were analysed.
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
1. BASIS OF PETITION — why the assessed value exceeds just value as of January 1, citing Fla. Stat. § 193.011(1)-(8) criteria and applying them to the property details given above.
2. PROPERTY CONDITION — the specific condition factors reported by the owner above and how each bears on just value. If none were reported, say so plainly.
3. COMPARABLE SALES AND VALUATION METHODOLOGY — if VERIFIED COMPARABLE SALES were supplied, present them in a table (address, sale date, sale price, square feet, price per square foot), state the source line given, and explain what they indicate about just value as of January 1 under § 193.011(1). If none were supplied, set out the comparable-sales standard the Board must apply under § 193.011(1) and rest the petition on the criteria and on the property facts stated above. Either way: do not invent comparables.
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
    /**
     * A TRUNCATED PETITION MUST NEVER REACH A SIGNATURE.
     *
     * max_tokens was 2000 — roughly 8,000 characters — and nothing checked whether
     * the model had actually finished. The 6 Aug 2026 test proof ended mid-word:
     *
     *   "Subsection (1) defines just value as the amount a willing purch"
     *
     * The entire LEGAL BASIS section, including the s. 194.301 burden-of-proof
     * argument, was missing from a document filed with a government board and sworn
     * to under penalty of perjury.
     *
     * The ceiling was survivable while petitions argued methodology alone. It stopped
     * being survivable the moment real comparable sales started reaching the evidence
     * — six sales, each with address, parcel, date, price, size and price per square
     * foot, plus the analysis of them, is most of the old budget on its own.
     *
     * So: a generous ceiling, and a check on stop_reason rather than a hope. One
     * retry with double the budget covers an unusually long set (more comps, more
     * defects); a second truncation is an error, because mailing a petition that
     * stops mid-sentence is worse than not mailing one.
     */
    /**
     * The wall-clock budget is opened once, here, and shared by BOTH askClaude calls
     * below. Opening it per call would let the truncation retry start a fresh budget
     * and blow the platform ceiling — the failure would then be an opaque platform
     * kill rather than our own error, which is the harder one to diagnose.
     */
    const evidenceDeadline = Date.now() + ANTHROPIC_EVIDENCE_BUDGET_MS;

    const askClaude = async (maxTokens) => {
      /**
       * THE BUILD MUST NOT BUY A PETITION — AND MUST NEVER INVENT ONE.
       *
       * Third route to need this flag, same reason as the first two
       * (SUPPRESS_CHECK_EVENTS, then Stripe in portal/set-password):
       * scripts/verify-routes.mjs invokes this handler on every deploy, inside
       * `next build`, WITH PRODUCTION CREDENTIALS. Its fixture carries no
       * providedEvidence, so it lands here — and on Vercel, where ANTHROPIC_API_KEY
       * is valid, that is a real 6,000-token generation billed on every deploy.
       * Locally the key is invalid, so the call fails fast and the cost was
       * invisible from a developer machine.
       *
       * IT REFUSES. It does not return placeholder evidence.
       *
       * The first draft returned a stub string, on the reasoning that letting the
       * handler run on through buildDR486Html made the smoke test stronger. Follow
       * where that string goes: buildDR486Html renders it into the EVIDENCE AND
       * ARGUMENT block, redis.set caches it, lib/fulfillOrder.js copies it to
       * orders.evidence_text, finalize-order feeds it back as providedEvidence, and
       * lib/processOrder.js mails it. Nothing on that path inspects the text. The
       * response is 200 with no error field, so pages/apply.js renders it happily.
       * One environment variable set on the wrong project — plausibly by someone
       * reacting to the very complaint documented above — and a homeowner signs a
       * petition, under penalty of perjury, whose entire argument is a placeholder.
       *
       * A build that skips a step is a smaller loss than a filing that fabricates
       * one. portal/set-password.js already refuses under this flag; this matches it.
       *
       * Refusing HERE rather than at the top of the handler keeps everything before
       * the model call under test — validation, the county and VAB lookup, the spend
       * gate, the whole prompt build — which is more coverage than the route had
       * before, without producing a single fabricated character.
       *
       * Set on the verifying process only. Absent the variable, every call is live.
       */
      if (process.env.SUPPRESS_EXTERNAL_CALLS === '1') {
        throw Object.assign(
          new Error('Evidence generation is temporarily unavailable.'),
          { suppressed: true }
        );
      }

      let lastError = null;
      let attemptsMade = 0;

      for (let attempt = 1; attempt <= ANTHROPIC_MAX_ATTEMPTS; attempt++) {
        // Not enough budget left for an attempt to plausibly finish. Sending one
        // anyway would abort within milliseconds, burn a socket, and replace the real
        // fault below with a meaningless timeout.
        const remaining = evidenceDeadline - Date.now();
        if (remaining < ANTHROPIC_MIN_RETRY_MS) break;

        attemptsMade++;
        try {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: maxTokens, messages: [{ role: 'user', content: evidencePrompt }] }),
            // Guarded the way lib/spendGuard.js and lib/heartbeat.js guard it. Without
            // the guard an old runtime would throw "AbortSignal.timeout is not a
            // function" on EVERY petition — trading a rare hang for a total outage.
            signal: typeof AbortSignal?.timeout === 'function'
              ? AbortSignal.timeout(Math.min(anthropicAttemptTimeout(maxTokens), remaining))
              : undefined,
          });

          // Status is read BEFORE the body. A 529 overloaded_error used to arrive
          // here as `data.error` and be thrown like a malformed request — the same
          // treatment for "try again in a second" and "this will never work".
          if (!r.ok && ANTHROPIC_RETRYABLE_STATUS.has(r.status)) {
            // Release the socket rather than leaving an unread body pinning a
            // connection out of the pool — three per request during a 529 storm.
            try { await r.body?.cancel(); } catch { /* nothing to release */ }
            throw Object.assign(new Error(`Anthropic HTTP ${r.status}`), { anthropicRefused: true });
          }

          const data = await r.json();
          if (data.error) throw new Error(data.error.message);
          return { text: data.content?.[0]?.text || '', truncated: data.stop_reason === 'max_tokens' };
        } catch (e) {
          /**
           * `fetch failed` is undici's message when the connection was never
           * established — DNS, refused, TLS. Nothing was sent, so nothing was billed.
           *
           * Matched on the exact message rather than on `e.name === 'TypeError'`,
           * which was the first draft: a plain dereference bug inside this try block
           * ALSO throws a TypeError, and retrying our own defect three times before
           * telling the customer it was a transient vendor problem would bury it —
           * and would make it invisible to verify-routes, whose CODE_DEFECT matcher
           * reads the returned message.
           */
          const connectionNeverLanded = e instanceof TypeError && e.message === 'fetch failed';
          if (!e.anthropicRefused && !connectionNeverLanded) {
            // A timeout is deliberately NOT retried — see the header; the tokens were
            // almost certainly generated and billed. But it must still reach the
            // customer as something they can act on, not as a raw DOMException.
            if (e.name === 'TimeoutError' || e.name === 'AbortError') {
              console.error(`[dr486] Anthropic timed out at ${anthropicAttemptTimeout(maxTokens)}ms for ${maxTokens} tokens`);
              throw Object.assign(
                new Error('Preparing your petition took longer than expected. Please try again — it usually completes on a second attempt.'),
                { vendorUnavailable: true, timedOut: true, cause: e }
              );
            }
            throw e;
          }

          lastError = e;
          const backoff = ANTHROPIC_BACKOFF_MS[attempt - 1] ?? ANTHROPIC_BACKOFF_MS[ANTHROPIC_BACKOFF_MS.length - 1];
          const left = evidenceDeadline - Date.now() - backoff;
          if (attempt >= ANTHROPIC_MAX_ATTEMPTS || left < ANTHROPIC_MIN_RETRY_MS) break;

          console.warn(`[dr486] Anthropic attempt ${attempt} failed (${e.name}: ${e.message}) — retrying in ${backoff}ms, ${Math.round(left / 1000)}s of budget left`);
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }

      /**
       * Every attempt failed on transport. The technical detail goes to the log; the
       * customer gets a sentence that tells them the truth AND what to do about it.
       *
       * This message reaches a human: pages/apply.js throws `claudeJson.error`
       * verbatim on the review screen. Before this, that screen could show them
       * "Overloaded" — a word from a vendor's API they have no relationship with,
       * with no suggestion that trying again would work. It does work, which is the
       * whole point of the 503 below.
       */
      console.error(`[dr486] Anthropic unreachable after ${attemptsMade} attempt(s):`, lastError?.name, lastError?.message);
      throw Object.assign(
        new Error('We could not reach the service that prepares your petition. This is usually brief — please try again in a moment.'),
        { vendorUnavailable: true, attemptsMade, cause: lastError }
      );
    };

    let attempt = await askClaude(EVIDENCE_MAX_TOKENS);
    if (attempt.truncated) {
      console.warn(`[dr486] evidence truncated at ${EVIDENCE_MAX_TOKENS} tokens — retrying at ${EVIDENCE_MAX_TOKENS * 2}`);
      attempt = await askClaude(EVIDENCE_MAX_TOKENS * 2);
    }
    if (attempt.truncated) {
      throw new Error('Evidence generation was truncated twice; refusing to build a petition that ends mid-sentence.');
    }
    evidenceText = attempt.text;
    }

    const filingDate = flDate();
    const dr486Html = buildDR486Html({
      ownerFirstName, ownerLastName, ownerEmail, ownerPhone,
      ownerStreet, ownerCity, ownerState, ownerZip,
      propertyAddress, county, parcelId,
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
        // The EVIDENCE section is cached beside the document under a derived key.
        //
        // It is the only part of the petition that costs a model call and the only
        // part that carries the owner's reported defects and the verified comparable
        // sales. lib/fulfillOrder.js reads it back and stores it on the order, so the
        // signing pass can rebuild this exact petition WITH the signature instead of
        // generating a different one — see the header of lib/processOrder.js.
        //
        // Before this existed, the evidence was recoverable only from inside the
        // rendered HTML, which the mail-time regeneration then overwrote. That is how
        // comps and defects were being lost between purchase and filing.
        await redis.set(`${letterKey}:evidence`, evidenceText, { ex: 604800 });
      } catch (e) { console.log('Redis cache failed:', e.message); }
    }

    return res.status(200).json({
      success: true, dr486Html, evidenceText, letterKey, isFL: true, preview: !!preview,
      vabName: vab.vabName,
    });
  } catch (err) {
    console.error('DR-486 generation error:', err);
    // A vendor that was unreachable is not the same answer as a defect in this
    // route, and it must not be dressed as one: 503 says "come back", 500 says
    // "something here is broken". The customer is one click from buying.
    if (err?.suppressed) {
      return res.status(503).json({ error: err.message, code: 'SUPPRESSED' });
    }
    if (err?.vendorUnavailable) {
      return res.status(503).json({ error: err.message, code: 'VENDOR_UNAVAILABLE' });
    }
    return res.status(500).json({ error: err.message || 'DR-486 generation failed' });
  }
}
