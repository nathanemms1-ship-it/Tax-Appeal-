export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, address, county, assessedValue } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    // Step 1: Search for local comparable sales using Claude's web search
    const searchPrompt = `Search for recent home sales in ${county} near ${address} from the last 6-12 months. 
    Find 3-5 comparable properties that sold for less than the current assessed value of ${assessedValue ? '$' + Number(assessedValue).toLocaleString() : 'the subject property'}.
    Return ONLY a JSON object with this structure, no other text:
    {
      "comparables": [
        {"address": "123 Main St", "salePrice": 250000, "saleDate": "2024-03", "sqft": 1800, "beds": 3, "baths": 2},
        ...
      ],
      "medianSalePrice": 265000,
      "averagePricePerSqft": 145,
      "marketTrend": "declining" | "stable" | "appreciating",
      "summary": "Brief 1-2 sentence market summary"
    }`;

    const searchRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: searchPrompt }],
      }),
    });

    const searchData = await searchRes.json();
    
    // Extract comparable sales data from search
    let comparables = null;
    let marketSummary = "";
    
    if (searchData.content) {
      const textBlocks = searchData.content.filter(b => b.type === "text").map(b => b.text).join("");
      try {
        const jsonMatch = textBlocks.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          comparables = JSON.parse(jsonMatch[0]);
          marketSummary = comparables.summary || "";
        }
      } catch (e) {
        marketSummary = textBlocks.slice(0, 500);
      }
    }

    // Step 2: Generate the dispute letter with comparable data + 20% reduction argument
    const targetReduction = assessedValue ? Math.round(Number(assessedValue) * 0.80) : null;
    
    const enhancedPrompt = `${prompt}

COMPARABLE SALES DATA FROM LOCAL MARKET SEARCH:
${comparables ? `
- Median Sale Price in Area: $${Number(comparables.medianSalePrice || 0).toLocaleString()}
- Average Price Per Sq Ft: $${comparables.averagePricePerSqft || 'N/A'}
- Market Trend: ${comparables.marketTrend || 'stable'}
- Market Summary: ${comparables.summary || ''}
- Comparable Sales:
${(comparables.comparables || []).map(c => 
  `  • ${c.address}: Sold $${Number(c.salePrice).toLocaleString()} (${c.saleDate}) — ${c.beds}bd/${c.baths}ba, ${c.sqft ? Number(c.sqft).toLocaleString() + ' sqft' : ''}`
).join('\n')}
` : `Market research indicates local comparable sales support a significant reduction in assessed value. ${marketSummary}`}

CRITICAL INSTRUCTIONS FOR THIS LETTER:
1. The primary argument must be for a 20% reduction in assessed value${targetReduction ? ` — from the current assessed value down to $${Number(targetReduction).toLocaleString()}` : ''}.
2. Cite the comparable sales above as direct evidence that the current assessment exceeds fair market value.
3. Argue that neighboring properties with similar characteristics have sold at prices that support the reduced valuation.
4. Reference the market trend data to support the case that current market conditions do not support the existing assessment.
5. Make the 20% reduction request the central, boldly stated demand of the letter.`;

    const letterRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: enhancedPrompt }],
      }),
    });

    const letterData = await letterRes.json();
    if (letterData.error) return res.status(500).json({ error: letterData.error.message });

    const letter = (letterData.content || []).map(b => b.text || "").join("").trim();
    if (!letter) return res.status(500).json({ error: "Empty response from Claude" });

    return res.status(200).json({ 
      letter,
      comparables: comparables?.comparables || [],
      marketSummary: comparables?.summary || marketSummary,
      targetReduction,
      medianSalePrice: comparables?.medianSalePrice || null,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
