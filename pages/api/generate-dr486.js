import { Redis } from '@upstash/redis';

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

const TAXAPPEAL_REP = {
  name: 'TaxAppeal USA',
  email: 'disputes@taxappealusa.com',
  signatureText: 'TaxAppeal USA',
  title: 'Authorized Representative',
};

function buildDR486Html({ ownerFirstName, ownerLastName, ownerEmail, ownerStreet, ownerCity, ownerState, ownerZip, propertyAddress, county, parcelId, assessedValue, requestedValue, taxYear, evidenceText, districtName, flSignatureName, flAuthDate, filingDate }) {
  const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : 'See county records';
  const today = filingDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const yr = taxYear || new Date().getFullYear().toString();
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
  .checkbox{width:12px;height:12px;border:1.5px solid #000;flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;font-size:10pt;}
  .sig-block{border-top:1.5px solid #000;margin-top:10px;padding-top:8px;}
  .sig-line{border-bottom:1.5px solid #000;min-height:28px;margin-bottom:4px;font-size:13pt;font-family:Georgia,serif;font-style:italic;padding:2px 4px;}
  .sig-label{font-size:8pt;color:#444;margin-bottom:8px;}
  .note{font-size:8.5pt;color:#444;font-style:italic;margin-top:4px;}
  .evidence-block{font-size:9.5pt;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;margin-top:4px;}
  .page-break{page-break-before:always;}
  table.summary{width:100%;border-collapse:collapse;margin-top:6px;}
  table.summary td{border:1px solid #999;padding:4px 6px;font-size:9.5pt;}
  table.summary td:first-child{font-weight:bold;width:45%;background:#f5f5f5;}
</style></head>
<body><div class="page">
  <div class="form-ref">Form DR-486 | Rule 12D-16.002, F.A.C. | ${yr} Tax Year</div>
  <h1>PETITION TO THE VALUE ADJUSTMENT BOARD</h1>
  <h2>Request for Hearing</h2>
  <div class="subtitle">Florida Department of Revenue | ${districtName || county + ' County Value Adjustment Board'}</div>
  <div class="part"><div class="part-header">PART 1 — TAXPAYER / PROPERTY OWNER INFORMATION</div><div class="part-body">
    <div class="row"><div class="field"><div class="field-label">Owner Name</div><div class="field-value">${ownerFirstName} ${ownerLastName}</div></div><div class="field"><div class="field-label">Email</div><div class="field-value">${ownerEmail}</div></div></div>
    <div class="row"><div class="field" style="flex:2"><div class="field-label">Mailing Address</div><div class="field-value">${ownerStreet}</div></div><div class="field"><div class="field-label">City</div><div class="field-value">${ownerCity}</div></div><div class="field" style="flex:0.4"><div class="field-label">State</div><div class="field-value">${ownerState}</div></div><div class="field" style="flex:0.7"><div class="field-label">ZIP</div><div class="field-value">${ownerZip}</div></div></div>
    <div class="row"><div class="field" style="flex:2"><div class="field-label">Property Address</div><div class="field-value">${propertyAddress}</div></div><div class="field"><div class="field-label">County</div><div class="field-value">${county}</div></div><div class="field"><div class="field-label">Parcel / Folio ID</div><div class="field-value">${parcelId || 'See county records'}</div></div></div>
    <div class="row"><div class="field" style="flex:0.7"><div class="field-label">Tax Year</div><div class="field-value">${yr}</div></div><div class="field"><div class="field-label">Property Type</div><div class="field-value">Residential 1-4 Units</div></div><div class="field"><div class="field-label">Preferred Contact</div><div class="field-value">Email: ${ownerEmail}</div></div></div>
  </div></div>
  <div class="part"><div class="part-header">PART 2 — REASON FOR PETITION</div><div class="part-body">
    <div class="checkbox-row"><div class="checkbox" style="display:flex;align-items:center;justify-content:center;font-weight:bold;">&#10003;</div><span><strong>Real property value</strong> — assessed value exceeds fair market value as of January 1, ${yr}.</span></div>
    <div style="margin-top:8px;"><div class="field-label">Estimated time needed:</div><div class="field-value" style="width:120px;">15 minutes</div></div>
    <div style="margin-top:8px;" class="checkbox-row"><div class="checkbox" style="display:flex;align-items:center;justify-content:center;font-weight:bold;">&#10003;</div><span>I will not attend but would like my evidence considered. Duplicate copies submitted.</span></div>
  </div></div>
  <div class="part"><div class="part-header">PART 3 — TAXPAYER SIGNATURE</div><div class="part-body">
    <p style="font-size:9pt;margin-bottom:8px;">Taxpayer has authorized TaxAppeal USA as representative. Written authorization (DR-486A) is attached per Florida Statute § 194.011(3).</p>
    <div class="sig-block"><div class="sig-line">${ownerFirstName} ${ownerLastName} — see attached DR-486A</div><div class="sig-label">Taxpayer Signature (via attached DR-486A) &nbsp;&nbsp; Date: ${flAuthDate || today}</div></div>
  </div></div>
  <div class="part"><div class="part-header">PART 4 — EMPLOYEE, ATTORNEY, OR LICENSED PROFESSIONAL</div><div class="part-body"><p style="font-size:9pt;color:#555;">Not applicable — see Part 5.</p></div></div>
  <div class="part"><div class="part-header">PART 5 — UNLICENSED COMPENSATED REPRESENTATIVE SIGNATURE</div><div class="part-body">
    <div class="row"><div class="field"><div class="field-label">Representative Name</div><div class="field-value">${TAXAPPEAL_REP.name}</div></div><div class="field"><div class="field-label">Representative Email</div><div class="field-value">${TAXAPPEAL_REP.email}</div></div></div>
    <div class="checkbox-row" style="margin-top:6px;"><div class="checkbox" style="display:flex;align-items:center;justify-content:center;font-weight:bold;">&#10003;</div><span style="font-size:9pt;">I am a <strong>compensated representative</strong> not acting as a licensed representative listed in Part 4.</span></div>
    <div class="checkbox-row"><div class="checkbox" style="display:flex;align-items:center;justify-content:center;font-weight:bold;">&#10003;</div><span style="font-size:9pt;">Written authorization (DR-486A) from the taxpayer is attached per Florida Statute § 194.011(3)(h).</span></div>
    <div class="sig-block" style="margin-top:12px;"><div class="sig-line">${TAXAPPEAL_REP.signatureText}</div><div class="sig-label">Signature of Representative &nbsp;&nbsp; Date: ${today}</div>
    <div style="font-size:9pt;margin-top:4px;"><strong>Under penalties of perjury</strong>, I declare I am the owner's authorized representative under § 194.011(3)(h), F.S., and that I have read this petition and the facts stated are true.</div></div>
  </div></div>
  <div class="part"><div class="part-header">ASSESSMENT SUMMARY</div><div class="part-body">
    <table class="summary"><tr><td>Property Address</td><td>${propertyAddress}</td></tr><tr><td>County</td><td>${county} County, Florida</td></tr><tr><td>Tax Year</td><td>${yr}</td></tr><tr><td>Current Assessed Value</td><td>${fmt(assessedValue)}</td></tr><tr><td>Requested Value</td><td>${fmt(requestedValue)}</td></tr><tr><td>Legal Basis</td><td>Florida Statute § 193.011 — just value criteria</td></tr></table>
  </div></div>
  <div class="page-break"></div>
  <div class="part"><div class="part-header">EVIDENCE AND ARGUMENT IN SUPPORT OF PETITION</div><div class="part-body">
    <div class="evidence-block">${evidenceText || 'See attached comparable sales analysis.'}</div>
  </div></div>
  <div style="margin-top:16px;font-size:8.5pt;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:10px;">
    Filed by TaxAppeal USA | disputes@taxappealusa.com | Authorized Representative § 194.011(3)(h), F.S.<br/>Filed via USPS Mail | Filing Date: ${today}<br/>Please send the Value Adjustment Board's determination to both the property owner (address above) and to disputes@taxappealusa.com.
  </div>
</div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    ownerFirstName, ownerLastName, ownerEmail,
    ownerStreet, ownerCity, ownerState, ownerZip,
    propertyAddress, county, parcelId,
    assessedValue, requestedValue, taxYear,
    issues, propertyDetails, notes,
    districtName, zip, state,
    flSignatureName, flAuthDate,
  } = req.body;

  if (!propertyAddress || !county) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const issuesBlock = issues && issues.length > 0
      ? 'DOCUMENTED PROPERTY ISSUES:\n' + issues.map(i => '• ' + i).join('\n')
      : 'No specific defects — basis is comparable sales / market value overassessment.';
    const fmt = (n) => n ? '$' + Number(n).toLocaleString() : 'unknown';

    const evidencePrompt = `You are a Florida property tax attorney preparing evidence for a Value Adjustment Board petition.

Write the EVIDENCE AND ARGUMENT section of a DR-486 petition for the ${county} County VAB, tax year ${taxYear || new Date().getFullYear()}.

PROPERTY: ${propertyAddress}
COUNTY: ${county} County, Florida
CURRENT ASSESSED VALUE: ${fmt(assessedValue)}
REQUESTED VALUE: ${fmt(requestedValue)}
${propertyDetails ? 'PROPERTY DETAILS:\n' + propertyDetails : ''}
${issuesBlock}
OWNER NOTES: ${notes || 'None.'}

Write exactly 4 sections:
1. COMPARABLE SALES ANALYSIS — 3-4 recent comparable sales supporting a lower value, citing Florida Statute § 193.011(8)
2. PROPERTY CONDITION — specific condition factors supporting the reduced value
3. MARKET CONDITIONS — current market trends in ${county} County, Florida
4. LEGAL BASIS — cite Florida Statute § 193.011 and § 194.301

Be specific, professional, and factual. Output only the four sections.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: evidencePrompt }] }),
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);
    const evidenceText = claudeData.content?.[0]?.text || '';

    const filingDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const dr486Html = buildDR486Html({
      ownerFirstName, ownerLastName, ownerEmail, ownerStreet, ownerCity, ownerState, ownerZip,
      propertyAddress, county, parcelId, assessedValue, requestedValue, taxYear,
      evidenceText, districtName, flSignatureName, flAuthDate, filingDate,
    });

    let letterKey = null;
    if (redis) {
      try {
        letterKey = `dr486:FL:${zip}:${Date.now()}`;
        await redis.set(letterKey, dr486Html, { ex: 7200 });
        console.log('DR-486 HTML cached in Redis:', letterKey);
      } catch (e) { console.log('Redis cache failed:', e.message); }
    }

    return res.status(200).json({ success: true, dr486Html, evidenceText, letterKey, isFL: true });
  } catch (err) {
    console.error('DR-486 generation error:', err);
    return res.status(500).json({ error: err.message || 'DR-486 generation failed' });
  }
}
