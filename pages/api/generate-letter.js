import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { validateVendorInput, PROMPT_ROUTE_CONFIG } from '../../lib/inputLimits';
import { checkSpend } from '../../lib/spendGuard';

// 64 KB instead of Next's 1 MB default. See lib/inputLimits.js.
export const config = PROMPT_ROUTE_CONFIG;

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) {
    redis = new Redis({ url: redisUrl, token: redisToken });
  }
} catch (e) {
  console.log("Redis init failed:", e.message);
}


/**
 * Server-side prompt construction. Previously this template lived in the browser
 * (pages/apply.js) and the assembled string was POSTed here, which is what made
 * this endpoint an open LLM proxy. Keep it here.
 */
function buildProtestPrompt(i) {
  const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : null;
  const issues = Array.isArray(i.issues) ? i.issues : [];
  const issuesBlock = issues.length
    ? `PROPERTY DEFECTS & ISSUES (cite each one in the letter):\n${issues.map(x => `• ${x}`).join("\n")}`
    : "No specific property issues reported beyond general market value discrepancy.";
  const districtBlock = i.districtBlock || `FILE WITH: ${i.county} County\nDeadline: ${i.deadlineNote || "Check with the county"}`;
  const arNote = (i.state || '').toUpperCase() === 'AR'
    ? `\n\nARKANSAS-SPECIFIC RULES:\n- Arkansas assesses property at 20% of market value. The appeal targets MARKET VALUE, not the 20% assessed figure.\n- Address to: Secretary, ${i.county} County Board of Equalization\n- Cite Arkansas Code ss.26-27-317 and ss.26-26-1901\n- Use "Board of Equalization" and "county assessor" — never ARB or appraisal district.`
    : '';

  return `You are a property tax attorney writing a formal protest letter. Output ONLY the letter — no preamble, no markdown, no explanation.

PROPERTY OWNER: ${i.ownerName || ''}
OWNER EMAIL: ${i.ownerEmail || ''}
PROPERTY ADDRESS: ${i.address}
COUNTY: ${i.county}
STATE: ${(i.state || '').toUpperCase()}
TAX YEAR: ${i.taxYear || new Date().getFullYear()}

SUBJECT PROPERTY CHARACTERISTICS:
${i.propertyDetails || "See county records"}
Current Assessed Value: ${fmt(i.assessedValue) || "See records"}
Estimated Market Value: ${fmt(i.marketValue) || "N/A"}
Annual Tax Bill: ${fmt(i.annualTax) || "N/A"}
Requested Reduction: ${i.reductionPctDisplay || ''}% — from ${fmt(i.assessedValue)} to ${fmt(i.targetReduction)}

${issuesBlock}

${districtBlock}

OWNER NOTES: ${i.notes || "None."}${arNote}

IMPORTANT — ACCURACY: do not invent specific comparable sales, prices, or dates you cannot source. Where comparable-sales evidence is called for, describe the methodology and the adjustments the board should apply rather than fabricating transactions.

LETTER REQUIREMENTS:
1. Owner contact block: name, property address, email
2. Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
3. Recipient address block
4. RE: NOTICE OF PROTEST OF PROPERTY VALUATION
5. SUBJECT PROPERTY DESCRIPTION: every characteristic with exact numbers
6. PROPERTY DEFECTS & CONDITIONS: cite each selected issue
7. COMPARABLE SALES EVIDENCE: the valuation methodology for ZIP ${i.zip || ''}
8. MARKET CONDITIONS
9. LEGAL BASIS: cite ${i.statute || "applicable state statutes"}
10. Demand the reduction stated above
11. Professional closing with owner name, address, and email. Below the signature block, on its own line, include exactly: "Please direct all correspondence and decisions regarding this protest to the property owner at the email address above, with a copy to: disputes@taxappealusa.com (Document Preparation Service)."

Output ONLY the complete formal letter.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Anthropic call per request
  if (await enforceRateLimit(req, res, 'letter', 8, 60)) return;
  if (await enforceRateLimit(req, res, 'letter', 40, 3600)) return;

  // This endpoint is called pre-payment from the browser, so it cannot require an
  // internal secret. The actual vulnerability was that `req.body.prompt` was passed
  // UNMODIFIED to api.anthropic.com with ANTHROPIC_API_KEY — a free, unauthenticated,
  // unmetered Sonnet proxy billed to us, with any abusive output attributed to our org.
  //
  // Client-supplied prompts are now refused outright. The prompt is assembled here
  // from structured fields, so the caller can only ever generate a property-tax
  // protest letter for a real address.
  if (req.body?.prompt) {
    return res.status(400).json({ error: "Client-supplied prompts are not accepted." });
  }

  // Refusing a client prompt stopped the caller CHOOSING the prompt. It did not
  // stop them SIZING it: notes/propertyDetails/issues are still interpolated into
  // the prompt we build, so length has to be bounded too.
  const outer = validateVendorInput(req.body || {});
  if (!outer.ok) return res.status(400).json({ error: outer.error });
  const inner = validateVendorInput(req.body?.letterInputs || {});
  if (!inner.ok) return res.status(400).json({ error: inner.error });

  const { address, county, assessedValue, zip, state } = outer.clean;
  const letterInputs = req.body?.letterInputs ? inner.clean : null;
  if (!address || !state) return res.status(400).json({ error: "Missing address or state" });

  const prompt = buildProtestPrompt({ address, county, assessedValue, zip, state, ...(letterInputs || {}) });

  // Global daily ceiling across ALL callers. Per-IP limits bound one attacker; a
  // proxy pool defeats them. See lib/spendGuard.js.
  const spend = await checkSpend('anthropic', 1);
  if (!spend.ok) {
    return res.status(503).json({
      error: 'We are temporarily unable to generate documents. Please try again shortly.',
      code: 'CAPACITY',
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const letter = data.content?.[0]?.text || "";
    if (!letter) return res.status(500).json({ error: "Empty letter response" });

    // Store letter in Redis with a 2-hour TTL so success page can retrieve it
    // Key is based on address + timestamp for uniqueness
    let letterKey = null;
    if (redis) {
      try {
        letterKey = `letter:${state}:${zip}:${Date.now()}`;
        await redis.set(letterKey, letter, { ex: 7200 }); // 2 hours
        console.log("Letter cached in Redis:", letterKey);
      } catch (e) {
        console.log("Redis letter cache failed:", e.message);
        letterKey = null;
      }
    }

    return res.status(200).json({ letter, letterKey });
  } catch (err) {
    console.error("Generate letter error:", err);
    return res.status(500).json({ error: err.message || "Letter generation failed" });
  }
}
