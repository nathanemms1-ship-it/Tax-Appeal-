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
  const today = p.filingDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const yr = p.taxYear || String(new Date().getFullYear());
  const fmt = n => n ? '$' + Number(n).toLocaleString() : 'See county records';
  const av = p.ownerValueAssertion ? '$' + Number(p.ownerValueAssertion).toLocaleString() : '[REQUIRED]';
  const CSS = `*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:10pt;color:#000;}.page{padding:32px 44px;max-width:816px;margin:0 auto;}h1{font-size:12pt;font-weight:bold;text-align:center;margin-bottom:2px;}h2{font-size:10pt;font-weight:bold;text-align:center;margin-bottom:10px;}.form-ref{font-size:8pt;color:#555;text-align:right;margin-bottom:10px;}.section{border:1.5px solid #000;margin-bottom:10px;}.sh{background:#333;color:#fff;font-weight:bold;font-size:10pt;padding:4px 8px;}.sb{padding:8px 10px;}.row{display:flex;gap:10px;margin-bottom:6px;}.field{flex:1;}.fl{font-size:8pt;color:#444;margin-bottom:2px;}.fv{border-bottom:1px solid #000;min-height:16px;font-size:10pt;padding:1px 2px;}.cbr{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;font-size:9.5pt;}.cb{width:13px;height:13px;border:1.5px solid #000;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-weight:bold;}.sig-block{border-top:1.5px solid #000;margin-top:10px;padding-top:8px;}.sig-line{border-bottom:1.5px solid #000;min-height:28px;margin-bottom:4px;font-size:13pt;font-family:Georgia,serif;font-style:italic;padding:2px 4px;}.sig-label{font-size:8pt;color:#444;margin-bottom:8px;}.hl{background:#fffbe6;border:1px solid #f0c040;padding:6px 8px;font-size:9pt;margin:6px 0;}.ev{font-size:9.5pt;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;}.pb{page-break-before:always;}`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body><div class="page">
<div class="form-ref">Form PT-311A | O.C.G.A. 48-5-311 | Digest Year ${yr}</div>
<h1>APPEAL OF ASSESSMENT</h1>
<h2>${p.county} County Board of Tax Assessors | State of Georgia</h2>
<div class="section"><div class="sh">TAXPAYER / PROPERTY OWNER INFORMATION</div><div class="sb">
<div class="row"><div class="field"><div class="fl">Owner Name</div><div class="fv">${p.ownerFirstName} ${p.ownerLastName}</div></div><div class="field"><div class="fl">Email</div><div class="fv">${p.ownerEmail}</div></div></div>
<div class="row"><div class="field" style="flex:2"><div class="fl">Address</div><div class="fv">${p.ownerStreet}</div></div><div class="field"><div class="fl">City</div><div class="fv">${p.ownerCity}</div></div><div class="field" style="flex:0.4"><div class="fl">State</div><div class="fv">${p.ownerState}</div></div><div class="field" style="flex:0.7"><div class="fl">ZIP</div><div class="fv">${p.ownerZip}</div></div></div>
<div class="row"><div class="field" style="flex:2"><div class="fl">Property Address</div><div class="fv">${p.propertyAddress}</div></div><div class="field"><div class="fl">Parcel ID</div><div class="fv">${p.parcelId || 'See county records'}</div></div><div class="field" style="flex:0.6"><div class="fl">Year</div><div class="fv">${yr}</div></div></div>
</div></div>
<div class="section"><div class="sh">PROPERTY TYPE</div><div class="sb"><div class="cbr"><div class="cb">&#10003;</div><span>Real Property</span></div></div></div>
<div class="section"><div class="sh">GROUNDS FOR APPEAL</div><div class="sb">
<div class="cbr"><div class="cb">&#10003;</div><span><strong>BOE - Board of Equalization</strong> with appeal to Superior Court</span></div>
<div style="margin-left:22px;"><div class="cbr"><div class="cb">&#10003;</div><span>Value</span></div><div class="cbr"><div class="cb">&nbsp;</div><span>Uniformity</span></div></div>
</div></div>
<div class="section"><div class="sh">OWNER VALUE ASSERTION (REQUIRED - Georgia Law)</div><div class="sb">
<div class="hl">&#9888; Under Georgia law, this is a HARD CEILING - the Board cannot reduce below this amount.</div>
<div class="row" style="margin-top:8px;"><div class="field"><div class="fl">Current Assessed Value</div><div class="fv">${fmt(p.assessedValue)}</div></div><div class="field"><div class="fl" style="font-weight:bold;color:#c00;">Owner Opinion of Value</div><div class="fv" style="font-weight:bold;font-size:12pt;">${av}</div></div></div>
</div></div>
<div class="section"><div class="sh">AUTHORIZED AGENT</div><div class="sb">
<div class="row"><div class="field" style="flex:2"><div class="fl">Agent Name</div><div class="fv">${REP_NAME}</div></div><div class="field"><div class="fl">Agent Email</div><div class="fv">${REP_EMAIL}</div></div></div>
<div style="font-size:8.5pt;margin-top:4px;">Letter of Authorization signed by property owner is attached per O.C.G.A. 48-5-311.</div>
</div></div>
<div class="section"><div class="sh">SIGNATURE</div><div class="sb">
<div class="sig-block"><div class="sig-line">${REP_NAME} - Agent (see attached LOA)</div><div class="sig-label">Signature of Agent &nbsp; Date: ${today}</div></div>
</div></div>
<div class="pb"></div>
<div class="section"><div class="sh">EVIDENCE AND COMPARABLE SALES</div><div class="sb">
<p style="font-size:9pt;margin-bottom:8px;">Submitted per O.C.G.A. 48-5-311. Comparables from prior calendar year (${parseInt(yr)-1} sales for ${yr} digest).</p>
<div class="ev">${p.evidenceText || 'See attached comparable sales analysis.'}</div>
</div></div>
<div style="margin-top:16px;font-size:8.5pt;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:10px;">
Filed by TaxAppeal USA | disputes@taxappealusa.com | Filing Date: ${today} | Postmark controls per O.C.G.A. 48-5-311
</div></div></body></html>`;
}

function buildGALoaHtml(p) {
  const yr = p.taxYear || String(new Date().getFullYear());
  const today = p.ownerSignatureDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const CSS2 = `*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:11pt;color:#000;}.page{padding:48px 56px;max-width:816px;margin:0 auto;}h1{font-size:14pt;font-weight:bold;text-align:center;margin-bottom:4px;}h2{font-size:11pt;text-align:center;margin-bottom:24px;}p{line-height:1.7;margin-bottom:14px;}.sl{border-bottom:1.5px solid #000;min-height:32px;margin-bottom:4px;font-size:15pt;font-family:Georgia,serif;font-style:italic;padding:2px 4px;margin-top:32px;}.slb{font-size:9pt;color:#555;}table.it{width:100%;margin:16px 0;}table.it td{padding:4px 8px;font-size:10.5pt;vertical-align:top;}table.it td:first-child{font-weight:bold;width:200px;}`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS2}</style></head><body><div class="page">
<h1>LETTER OF AUTHORIZATION</h1>
<h2>Authorization for Agent Representation in Property Tax Appeal<br/>O.C.G.A. 48-5-311 | ${p.county} County, Georgia</h2>
<table class="it">
<tr><td>Property Owner:</td><td>${p.ownerFirstName} ${p.ownerLastName}</td></tr>
<tr><td>Owner Email:</td><td>${p.ownerEmail}</td></tr>
<tr><td>Property Address:</td><td>${p.propertyAddress}</td></tr>
<tr><td>County:</td><td>${p.county} County, Georgia</td></tr>
<tr><td>Digest Year:</td><td>${yr}</td></tr>
<tr><td>Authorized Agent:</td><td>${REP_NAME}</td></tr>
<tr><td>Agent Email:</td><td>${REP_EMAIL}</td></tr>
</table>
<p>I, <strong>${p.ownerFirstName} ${p.ownerLastName}</strong>, the undersigned property owner of record, hereby authorize <strong>${REP_NAME}</strong> (${REP_EMAIL}) to act as my agent and authorized representative for the purpose of filing and prosecuting a property tax appeal before the <strong>${p.county} County Board of Tax Assessors</strong> and, if necessary, the <strong>${p.county} County Board of Equalization</strong>, regarding the above-referenced property for digest year <strong>${yr}</strong>.</p>
<p>This authorization is made pursuant to O.C.G.A. 48-5-311, which provides that a taxpayer may appear before the Board of Equalization by their authorized agent or representative, and that the taxpayer shall specify in writing the name of any such agent prior to any appearance.</p>
<p>This Letter of Authorization grants ${REP_NAME} the authority to: file the PT-311A Appeal of Assessment form on my behalf; submit evidence and comparable sales data; receive all Board correspondence; and represent my interests in any hearing related to this appeal.</p>
<p>This authorization expires upon final resolution of this appeal or December 31, ${yr}, whichever is earlier.</p>
<div class="sl">${p.ownerFirstName} ${p.ownerLastName}</div>
<div class="slb">Signature of Property Owner &nbsp;&nbsp; Date: ${today}</div>
<div style="margin-top:8px;font-size:9pt;color:#555;">Electronic signature provided via TaxAppeal USA secure platform. Legally binding under Georgia Electronic Records and Signatures Act, O.C.G.A. 10-12-1 et seq.</div>
<div style="margin-top:32px;font-size:8.5pt;color:#777;border-top:1px solid #ccc;padding-top:10px;text-align:center;">TaxAppeal USA | disputes@taxappealusa.com | Retained copy filed with PT-311A</div>
</div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { ownerFirstName, ownerLastName, ownerEmail, ownerPhone, ownerStreet, ownerCity, ownerState, ownerZip, propertyAddress, county, parcelId, assessedValue, requestedValue, taxYear, issues, propertyDetails, notes, districtName, zip, gaSignatureDate } = req.body;
  if (!propertyAddress || !county) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const fmt = n => n ? '$' + Number(n).toLocaleString() : 'unknown';
    const yr = taxYear || String(new Date().getFullYear());
    const prevYr = String(parseInt(yr) - 1);
    const issuesBlock = issues && issues.length > 0 ? 'DOCUMENTED ISSUES:\n' + issues.map(i => '- ' + i).join('\n') : 'No specific defects.';
    const evidencePrompt = 'You are a Georgia property tax attorney preparing evidence for a Board of Equalization appeal.\n\nWrite the COMPARABLE SALES AND EVIDENCE section for a PT-311A appeal in ' + county + ' County, Georgia, digest year ' + yr + '.\n\nPROPERTY: ' + propertyAddress + '\nCURRENT ASSESSED VALUE: ' + fmt(assessedValue) + '\nOWNER ASSERTED VALUE: ' + fmt(requestedValue) + '\n' + (propertyDetails ? 'DETAILS:\n' + propertyDetails : '') + '\n' + issuesBlock + '\nOWNER NOTES: ' + (notes || 'None.') + '\n\nRULES: Comparables MUST be from ' + prevYr + ' only. The asserted value (' + fmt(requestedValue) + ') is a hard ceiling.\n\nWrite exactly 4 sections: 1. COMPARABLE SALES ANALYSIS (3-4 sales from ' + prevYr + ' citing O.C.G.A. 48-5-2) 2. PROPERTY CONDITION 3. MARKET CONDITIONS 4. LEGAL BASIS (O.C.G.A. 48-5-2 and 48-5-311)\n\nOutput only the four sections.';
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: evidencePrompt }] }) });
    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);
    const evidenceText = claudeData.content?.[0]?.text || '';
    const filingDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const ownerSignatureDate = gaSignatureDate || filingDate;
    const pt311aHtml = buildPT311AHtml({ ownerFirstName, ownerLastName, ownerEmail, ownerPhone, ownerStreet, ownerCity, ownerState, ownerZip, propertyAddress, county, parcelId, assessedValue, ownerValueAssertion: requestedValue, taxYear: yr, evidenceText, districtName, filingDate });
    const loaHtml = buildGALoaHtml({ ownerFirstName, ownerLastName, ownerEmail, propertyAddress, county, taxYear: yr, ownerSignatureDate });
    const loaBodyMatch = loaHtml.match(/<body>([\s\S]*?)</body>/);
    const loaBody = loaBodyMatch ? '<div style="page-break-before:always;">' + loaBodyMatch[1] + '</div>' : '';
    const combinedHtml = pt311aHtml.replace('</body></html>', loaBody + '</body></html>');
    let letterKey = null;
    if (redis) {
      try {
        letterKey = 'pt311a:GA:' + (zip || '') + ':' + Date.now();
        await redis.set(letterKey, combinedHtml, { ex: 7200 });
        console.log('PT-311A + LOA cached:', letterKey);
      } catch (e) { console.log('Redis cache failed:', e.message); }
    }
    return res.status(200).json({ success: true, pt311aHtml: combinedHtml, evidenceText, letterKey, isGA: true });
  } catch (err) {
    console.error('PT-311A error:', err);
    return res.status(500).json({ error: err.message || 'PT-311A generation failed' });
  }
}
