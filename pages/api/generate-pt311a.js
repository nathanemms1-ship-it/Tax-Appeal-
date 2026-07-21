import { Redis } from '@upstash/redis';

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

const REP_NAME = 'TaxAppeal USA';
const REP_EMAIL = 'disputes@taxappealusa.com';

function buildPT311AHtml(p) {
  var today = p.filingDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  var yr = p.taxYear || String(new Date().getFullYear());
  var fmt = function(n) { return n ? '$' + Number(n).toLocaleString() : 'See county records'; };
  var av = p.ownerValueAssertion ? '$' + Number(p.ownerValueAssertion).toLocaleString() : '[REQUIRED]';
  var prevYr = String(parseInt(yr) - 1);
  var sty = '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:10pt;color:#000;}.page{padding:32px 44px;max-width:816px;margin:0 auto;}h1{font-size:12pt;font-weight:bold;text-align:center;margin-bottom:2px;}h2{font-size:10pt;font-weight:bold;text-align:center;margin-bottom:10px;}.fr{font-size:8pt;color:#555;text-align:right;margin-bottom:10px;}.sec{border:1.5px solid #000;margin-bottom:10px;}.sh{background:#333;color:#fff;font-weight:bold;font-size:10pt;padding:4px 8px;}.sb{padding:8px 10px;}.row{display:flex;gap:10px;margin-bottom:6px;}.field{flex:1;}.fl{font-size:8pt;color:#444;margin-bottom:2px;}.fv{border-bottom:1px solid #000;min-height:16px;font-size:10pt;padding:1px 2px;}.cbr{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;font-size:9.5pt;}.cb{width:13px;height:13px;border:1.5px solid #000;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-weight:bold;}.sb2{border-top:1.5px solid #000;margin-top:10px;padding-top:8px;}.sl{border-bottom:1.5px solid #000;min-height:28px;margin-bottom:4px;font-size:13pt;font-family:Georgia,serif;font-style:italic;padding:2px 4px;}.slb{font-size:8pt;color:#444;margin-bottom:8px;}.hl{background:#fffbe6;border:1px solid #f0c040;padding:6px 8px;font-size:9pt;margin:6px 0;}.ev{font-size:9.5pt;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;}.pb{page-break-before:always;}</style>';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' + sty + '</head><body><div class="page">' +
    '<div class="fr">Form PT-311A | O.C.G.A. 48-5-311 | Digest Year ' + yr + '</div>' +
    '<h1>APPEAL OF ASSESSMENT</h1>' +
    '<h2>' + p.county + ' County Board of Tax Assessors | State of Georgia</h2>' +
    '<div class="sec"><div class="sh">TAXPAYER INFORMATION</div><div class="sb">' +
    '<div class="row"><div class="field"><div class="fl">Owner Name</div><div class="fv">' + p.ownerFirstName + ' ' + p.ownerLastName + '</div></div>' +
    '<div class="field"><div class="fl">Email</div><div class="fv">' + p.ownerEmail + '</div></div></div>' +
    '<div class="row"><div class="field" style="flex:2"><div class="fl">Address</div><div class="fv">' + p.ownerStreet + '</div></div>' +
    '<div class="field"><div class="fl">City</div><div class="fv">' + p.ownerCity + '</div></div>' +
    '<div class="field" style="flex:0.4"><div class="fl">State</div><div class="fv">' + p.ownerState + '</div></div>' +
    '<div class="field" style="flex:0.7"><div class="fl">ZIP</div><div class="fv">' + p.ownerZip + '</div></div></div>' +
    '<div class="row"><div class="field" style="flex:2"><div class="fl">Property Address</div><div class="fv">' + p.propertyAddress + '</div></div>' +
    '<div class="field"><div class="fl">Parcel ID</div><div class="fv">' + (p.parcelId || 'See county records') + '</div></div>' +
    '<div class="field" style="flex:0.6"><div class="fl">Year</div><div class="fv">' + yr + '</div></div></div>' +
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
    '<div style="font-size:9pt;">This appeal was prepared and filed by TaxAppeal USA, a document-preparation and certified-mail filing service, on behalf of the property owner named above. This appeal is signed by the owner and filed in the owner\'s name; TaxAppeal USA does not represent the owner before the Board of Tax Assessors or Board of Equalization.</div>' +
    '</div></div>' +
    '<div class="pb"></div>' +
    '<div class="sec"><div class="sh">EVIDENCE AND COMPARABLE SALES</div><div class="sb">' +
    '<p style="font-size:9pt;margin-bottom:8px;">Comparable sales from ' + prevYr + ' per O.C.G.A. 48-5-311.</p>' +
    '<div class="ev">' + (p.evidenceText || 'See attached analysis.') + '</div>' +
    '</div></div>' +
    '<div style="margin-top:16px;font-size:8.5pt;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:10px;">' +
    'Filed by TaxAppeal USA | disputes@taxappealusa.com | Filing Date: ' + today +
    '</div></div></body></html>';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body;
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
    var evidencePrompt = 'You are a Georgia property tax attorney preparing evidence for a Board of Equalization appeal.\n\n' +
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
