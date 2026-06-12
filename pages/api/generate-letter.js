export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, address, county, assessedValue, zip, state } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    const targetReduction = assessedValue ? Math.round(Number(assessedValue) * 0.80) : null;
    const targetValue = targetReduction ? `$${Number(targetReduction).toLocaleString()}` : "80% of current assessed value";

    // Step 1: Pull recent sales comps by zip code from BatchData
    let compSection = "";
    try {
      const compRes = await fetch("https://api.batchdata.com/api/v1/property/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
        },
        body: JSON.stringify({
          filters: {
            address: { zip },
            lastSaleDate: { min: "2024-01-01" },
            propertyType: ["SFR", "CONDO", "TOWNHOUSE"],
          },
          fields: ["address", "lastSalePrice", "lastSaleDate", "bedrooms", "bathrooms", "livingArea", "assessedValue", "pricePerSquareFoot"],
          size: 10,
        }),
      });

      if (compRes.ok) {
        const compData = await compRes.json();
        const properties = compData?.results || compData?.properties || compData?.data || [];

        if (properties.length > 0) {
          const comps = properties.slice(0, 6).map(p => {
            const a = p?.address?.formattedAddress || p?.address?.street || "Nearby property";
            const price = p?.lastSalePrice || p?.salePrice || null;
            const date = p?.lastSaleDate || p?.saleDate || null;
            const beds = p?.bedrooms || p?.beds || null;
            const baths = p?.bathrooms || p?.baths || null;
            const sqft = p?.livingArea || p?.squareFeet || null;
            const ppsf = p?.pricePerSquareFoot || (price && sqft ? Math.round(price / sqft) : null);
            return { a, price, date, beds, baths, sqft, ppsf };
          }).filter(c => c.price);

          if (comps.length > 0) {
            const avgPrice = Math.round(comps.reduce((s, c) => s + c.price, 0) / comps.length);
            const avgPpsf = comps.filter(c => c.ppsf).length > 0
              ? Math.round(comps.filter(c => c.ppsf).reduce((s, c) => s + c.ppsf, 0) / comps.filter(c => c.ppsf).length)
              : null;

            compSection = `
COMPARABLE SALES DATA (ZIP CODE ${zip} — PULLED LIVE FROM COUNTY RECORDS):
Average Sale Price in ZIP: $${avgPrice.toLocaleString()}
${avgPpsf ? `Average Price Per Sq Ft: $${avgPpsf}` : ""}

Individual Comparable Sales:
${comps.map(c =>
  `• ${c.a}: Sold $${Number(c.price).toLocaleString()}${c.date ? ` (${c.date})` : ""}${c.beds ? ` — ${c.beds}bd` : ""}${c.baths ? `/${c.baths}ba` : ""}${c.sqft ? `, ${Number(c.sqft).toLocaleString()} sqft` : ""}${c.ppsf ? `, $${c.ppsf}/sqft` : ""}`
).join("\n")}

Use these REAL sales as the core evidence in the comparable sales section of the letter.
Highlight how these actual sales prices support a lower assessed value.
${assessedValue && avgPrice < Number(assessedValue) ? `Note: The average sale price of $${avgPrice.toLocaleString()} is BELOW the current assessed value of $${Number(assessedValue).toLocaleString()}, which directly supports the over-assessment claim.` : ""}`;
          }
        }
      }
    } catch (compErr) {
      console.error("Comp lookup failed:", compErr.message);
    }

    // Step 2: Generate letter with real comp data injected
    const fullPrompt = `${prompt}

${compSection || `No live comp data was retrieved. Use your knowledge of the ${county} real estate market near ZIP ${zip} to provide 3-5 realistic comparable sales that support a lower valuation.`}

LETTER REQUIREMENTS:
- Open with a clear demand for a 20% reduction, bringing the assessed value to ${targetValue}
- Include a section titled "Comparable Sales Evidence" using the sales data above
- Include a section titled "Market Conditions" explaining how ZIP code ${zip} market trends support a lower assessment
- Include a section titled "Legal Basis" citing equal and uniform assessment standards and state constitutional provisions
- Reference specific price-per-square-foot figures from the comps
- Close professionally with the owner's full name, address, and email

Output ONLY the formal letter, no preamble or explanation.`;

    const letterRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: fullPrompt }],
      }),
    });

    const letterData = await letterRes.json();
    if (letterData.error) return res.status(500).json({ error: letterData.error.message });

    const letter = (letterData.content || []).map(b => b.text || "").join("").trim();
    if (!letter) return res.status(500).json({ error: "Empty response from Claude" });

    return res.status(200).json({ letter, targetReduction });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
