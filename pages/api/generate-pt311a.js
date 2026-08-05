import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { validateVendorInput, PROMPT_ROUTE_CONFIG } from '../../lib/inputLimits';
import { checkSpend } from '../../lib/spendGuard';

// 64 KB instead of Next's 1 MB default. See lib/inputLimits.js — the default
// allowed a single request to carry ~190k input tokens to Anthropic.
export const config = PROMPT_ROUTE_CONFIG;

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

const REP_NAME = 'TaxAppeal USA';

/**
 * TWO ADDRESSES, TWO JOBS. They are not interchangeable.
 *
 * CONTACT_EMAIL is a monitored inbox. It is the only address that may be printed
 * for a human — a customer, a clerk, a Board — to write to.
 *
 * DECISIONS_EMAIL feeds pages/api/webhooks/inbound-email.js, which parses an
 * incoming decision letter and pushes the outcome to the customer's portal. It is
 * a machine intake, not an inbox. Printing it as a contact address hands someone
 * an address no person reads.
 *
 * The old single REP_EMAIL was disputes@ and was used for both. Its name was also
 * wrong in a way that matters here: "REP" is short for representative, which is
 * the one thing this file spends its FILED BY block denying we are.
 */
const CONTACT_EMAIL = 'customerservice@taxappealusa.com';
const DECISIONS_EMAIL = 'disputes@mail.taxappealusa.com';

/**
 * Escape for HTML. generate-dr486.js has had this since its own rewrite; this file
 * did not, so owner-supplied fields (name, address, parcel id) and the model's
 * evidence text were concatenated raw into the document. A '<' in any of them
 * corrupted the filed appeal, and a '<script>' or '<style>' made it into a document
 * we render, cache in Redis, and mail. Georgia petitions carry the same owner data
 * as Florida ones and get the same treatment.
 */
function e(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPT311AHtml(p) {
  var today = p.filingDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  var yr = p.taxYear || String(new Date().getFullYear());
  var fmt = function(n) { return n ? '$' + Number(n).toLocaleString() : 'See county records'; };
  var av = p.ownerValueAssertion ? '$' + Number(p.ownerValueAssertion).toLocaleString() : '[REQUIRED]';
  var prevYr = String(parseInt(yr) - 1);
  var sty = '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:10pt;color:#000;}.page{padding:32px 44px;max-width:816px;margin:0 auto;}h1{font-size:12pt;font-weight:bold;text-align:center;margin-bottom:2px;}h2{font-size:10pt;font-weight:bold;text-align:center;margin-bottom:10px;}.fr{font-size:8pt;color:#555;text-align:right;margin-bottom:10px;}.sec{border:1.5px solid #000;margin-bottom:10px;}.sh{background:#333;color:#fff;font-weight:bold;font-size:10pt;padding:4px 8px;}.sb{padding:8px 10px;}.row{display:flex;gap:10px;margin-bottom:6px;}.field{flex:1;}.fl{font-size:8pt;color:#444;margin-bottom:2px;}.fv{border-bottom:1px solid #000;min-height:16px;font-size:10pt;padding:1px 2px;}.cbr{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;font-size:9.5pt;}.cb{width:13px;height:13px;border:1.5px solid #000;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-weight:bold;}.sb2{border-top:1.5px solid #000;margin-top:10px;padding-top:8px;}.sl{border-bottom:1.5px solid #000;min-height:28px;margin-bottom:4px;font-size:13pt;font-family:Georgia,serif;font-style:italic;padding:2px 4px;}.slb{font-size:8pt;color:#444;margin-bottom:8px;}.hl{background:#fffbe6;border:1px solid #f0c040;padding:6px 8px;font-size:9pt;margin:6px 0;}.ev{font-size:9.5pt;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;}.pb{page-break-before:always;}</style>';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' + sty + '</head><body><div class="page">' +
    '<div class="fr">Form PT-311A | O.C.G.A. 48-5-311 | Digest Year ' + e(yr) + '</div>' +
    '<h1>APPEAL OF ASSESSMENT</h1>' +
    '<h2>' + e(p.county) + ' County Board of Tax Assessors | State of Georgia</h2>' +
    '<div class="sec"><div class="sh">TAXPAYER INFORMATION</div><div class="sb">' +
    '<div class="row"><div class="field"><div class="fl">Owner Name</div><div class="fv">' + e(p.ownerFirstName) + ' ' + e(p.ownerLastName) + '</div></div>' +
    '<div class="field"><div class="fl">Email</div><div class="fv">' + e(p.ownerEmail) + '</div></div></div>' +
    '<div class="row"><div class="field" style="flex:2"><div class="fl">Address</div><div class="fv">' + e(p.ownerStreet) + '</div></div>' +
    '<div class="field"><div class="fl">City</div><div class="fv">' + e(p.ownerCity) + '</div></div>' +
    '<div class="field" style="flex:0.4"><div class="fl">State</div><div class="fv">' + e(p.ownerState) + '</div></div>' +
    '<div class="field" style="flex:0.7"><div class="fl">ZIP</div><div class="fv">' + e(p.ownerZip) + '</div></div></div>' +
    '<div class="row"><div class="field" style="flex:2"><div class="fl">Property Address</div><div class="fv">' + e(p.propertyAddress) + '</div></div>' +
    '<div class="field"><div class="fl">Parcel ID</div><div class="fv">' + e(p.parcelId || 'See county records') + '</div></div>' +
    '<div class="field" style="flex:0.6"><div class="fl">Year</div><div class="fv">' + e(yr) + '</div></div></div>' +
    '</div></div>' +
    '<div class="sec"><div class="sh">GROUNDS FOR APPEAL</div><div class="sb">' +
    '<div class="cbr"><div class="cb">&#10003;</div><span><strong>BOE - Board of Equalization</strong></span></div>' +
    '<div style="margin-left:22px;"><div class="cbr"><div class="cb">&#10003;</div><span>Value</span></div></div>' +
    '</div></div>' +
    '<div class="sec"><div class="sh">OWNER VALUE ASSERTION (REQUIRED)</div><div class="sb">' +
    '<div class="hl">&#9888; HARD CEILING - Board cannot reduce below this amount.</div>' +
    '<div class="row" style="margin-top:8px;">' +
    '<div class="field"><div class="fl">Current Assessed Value</div><div class="fv">' + fmt(p.assessedValue) + '</div></div>' +
    '<div class="field"><div class="fl" style="font-weight:bold;color:#c00;">Owner Opinion of Value</div><div class="fv" style="font-weight:bold;font-size:12pt;">' + av + '</div></div>' +
    '</div></div></div>' +
    '<div class="sec"><div class="sh">FILED BY</div><div class="sb">' +
    /* Same correction as the DR-486 footer: "filed ... on behalf of" is agency
       language sitting one clause away from "does not represent the owner". Filing
       for someone is an act of an agent; mailing is a courier function. We mail. */
    '<div style="font-size:9pt;">This appeal was prepared at the direction of the property owner named above by TaxAppeal USA, a document-preparation and certified-mail service, and mailed for the owner. <b>The owner signed this appeal personally and is the appellant of record.</b> TaxAppeal USA is not the owner\'s representative or agent, does not represent the owner before the Board of Tax Assessors or Board of Equalization, will not appear at any hearing, and has no authority to act for the owner.</div>' +
    '</div></div>' +
    '<div class="pb"></div>' +
    '<div class="sec"><div class="sh">EVIDENCE AND COMPARABLE SALES</div><div class="sb">' +
    '<p style="font-size:9pt;margin-bottom:8px;">Comparable sales from ' + e(prevYr) + ' per O.C.G.A. 48-5-311.</p>' +
    '<div class="ev">' + e(p.evidenceText || 'See attached analysis.') + '</div>' +
    '</div></div>' +
    '<div style="margin-top:16px;font-size:8.5pt;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:10px;">' +
    'Prepared and mailed by TaxAppeal USA | Prepared and mailed: ' + e(today) +
    '<br/>Direct all correspondence about this appeal to the property owner at the address above. Questions about this mailing only: ' + CONTACT_EMAIL + '.' +
    '<br/>Please send the Board\'s Notice of Decision to the property owner (address above), with a courtesy copy to ' + DECISIONS_EMAIL + ' as authorized by the owner. That authorization releases records only and appoints no representative.' +
    '</div></div></body></html>';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // This route makes an Anthropic call on an unauthenticated POST, exactly like
  // generate-letter and generate-dr486, but shipped without the limiter they got.
  // Verified open on production: it returned 6,868 characters of Sonnet output to
  // an anonymous caller with no X-RateLimit-* headers on the response.
  if (await enforceRateLimit(req, res, 'pt311a', 8, 60)) return;
  if (await enforceRateLimit(req, res, 'pt311a', 100, 3600)) return;

  const checked = validateVendorInput(req.body || {});
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  var body = checked.clean;
  var ownerFirstName = body.ownerFirstName, ownerLastName = body.ownerLastName, ownerEmail = body.ownerEmail;
  var ownerPhone = body.ownerPhone, ownerStreet = body.ownerStreet, ownerCity = body.ownerCity;
  var ownerState = body.ownerState, ownerZip = body.ownerZip;
  var propertyAddress = body.propertyAddress, county = body.county, parcelId = body.parcelId;
  var assessedValue = body.assessedValue, requestedValue = body.requestedValue, taxYear = body.taxYear;
  var issues = body.issues, propertyDetails = body.propertyDetails, notes = body.notes;
  var districtName = body.districtName, zip = body.zip, gaSignatureDate = body.gaSignatureDate;
  if (!propertyAddress || !county) return res.status(400).json({ error: 'Missing required fields' });
  try {
    var fmt = function(n) { return n ? '$' + Number(n).toLocaleString() : 'unknown'; };
    var yr = taxYear || String(new Date().getFullYear());
    var prevYr = String(parseInt(yr) - 1);
    var twoBack = String(parseInt(yr) - 2);
    var issuesBlock = issues && issues.length > 0
      ? 'DOCUMENTED ISSUES:\n' + issues.map(function(i) { return '- ' + i; }).join('\n')
      : 'No specific defects.';
    var evidencePrompt = 'You are preparing evidence for a Georgia Board of Equalization appeal that the property owner will read, sign, and submit in their own name.\n\n' +
      'Write the COMPARABLE SALES AND EVIDENCE section for a PT-311A appeal in ' + county + ' County, Georgia, digest year ' + yr + '.\n\n' +
      'PROPERTY: ' + propertyAddress + '\n' +
      'CURRENT ASSESSED VALUE: ' + fmt(assessedValue) + '\n' +
      'OWNER ASSERTED VALUE: ' + fmt(requestedValue) + '\n' +
      (propertyDetails ? 'DETAILS:\n' + propertyDetails + '\n' : '') +
      issuesBlock + '\n' +
      'OWNER NOTES: ' + (notes || 'None.') + '\n\n' +
      'CRITICAL: Comparables MUST be from ' + prevYr + ' only (' + yr + ' and ' + twoBack + ' sales rejected).\n' +
      'The asserted value (' + fmt(requestedValue) + ') is a hard ceiling.\n\n' +
      'Write exactly 4 sections:\n' +
      '1. COMPARABLE SALES ANALYSIS - 3-4 sales from ' + prevYr + ' in ' + county + ' County citing O.C.G.A. 48-5-2\n' +
      '2. PROPERTY CONDITION\n' +
      '3. MARKET CONDITIONS - ' + prevYr + ' market in ' + county + ' County, Georgia\n' +
      '4. LEGAL BASIS - O.C.G.A. 48-5-2 and 48-5-311\n\n' +
      'Output only the four sections.';
    // Global daily ceiling across ALL callers. See lib/spendGuard.js.
    var spend = await checkSpend('anthropic', 1);
    if (!spend.ok) {
      return res.status(503).json({
        error: 'We are temporarily unable to generate documents. Please try again shortly.',
        code: 'CAPACITY',
      });
    }
    var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: evidencePrompt }] }),
    });
    var claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);
    var evidenceText = claudeData.content && claudeData.content[0] ? claudeData.content[0].text : '';
    var filingDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    var ownerSignatureDate = gaSignatureDate || filingDate;
    var pt311aHtml = buildPT311AHtml({ ownerFirstName: ownerFirstName, ownerLastName: ownerLastName, ownerEmail: ownerEmail, ownerPhone: ownerPhone, ownerStreet: ownerStreet, ownerCity: ownerCity, ownerState: ownerState, ownerZip: ownerZip, propertyAddress: propertyAddress, county: county, parcelId: parcelId, assessedValue: assessedValue, ownerValueAssertion: requestedValue, taxYear: yr, evidenceText: evidenceText, districtName: districtName, filingDate: filingDate });
    var letterKey = null;
    if (redis) {
    try {
    letterKey = 'pt311a:GA:' + (zip || '') + ':' + Date.now();
    await redis.set(letterKey, pt311aHtml, { ex: 7200 });
    console.log('PT-311A cached:', letterKey);
    } catch (e) { console.log('Redis cache failed:', e.message); }
    }
    return res.status(200).json({ success: true, pt311aHtml: pt311aHtml, evidenceText: evidenceText, letterKey: letterKey, isGA: true });
  } catch (err) {
    console.error('PT-311A error:', err);
    return res.status(500).json({ error: err.message || 'PT-311A generation failed' });
  }
}
