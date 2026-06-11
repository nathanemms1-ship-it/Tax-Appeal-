export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  try {
    const response = await fetch("https://api.batchdata.com/api/v1/property/lookup/all-attributes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
      },
      body: JSON.stringify({
        requests: [{ propertyAddress: { street, city, state, zip } }]
      }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { 
      return res.status(500).json({ error: `BatchData returned unexpected response: ${text.slice(0, 200)}` }); 
    }
    if (!response.ok) return res.status(response.status).json({ 
      error: data?.message || data?.error || `BatchData error ${response.status}` 
    });

    // Log the FULL raw response so we can see exactly what BatchData returns
    console.log("BATCHDATA RAW RESPONSE:", JSON.stringify(data, null, 2));

    // Try every possible path to find property data
    const result = data?.results?.[0] || data?.responses?.[0] || data?.data?.[0] || {};
    console.log("RESULT KEYS:", Object.keys(result));

    const prop = result?.propertyInfo || result?.property || result || {};
    console.log("PROP KEYS:", Object.keys(prop));

    const assessment = prop?.assessmentInfo || prop?.assessment || prop?.taxAssessment || prop?.tax || {};
    console.log("ASSESSMENT:", JSON.stringify(assessment));

    const building = prop?.buildingInfo || prop?.building || prop?.structure || prop?.characteristics || {};
    console.log("BUILDING:", JSON.stringify(building));

    const valuation = prop?.valuationInfo || prop?.valuation || prop?.avm || {};
    console.log("VALUATION:", JSON.stringify(valuation));

    // Extract every possible field variant
    const assessedValue = 
      assessment?.assessedValue || 
      assessment?.totalAssessedValue || 
      assessment?.assessedTotalValue ||
      assessment?.taxableValue ||
      assessment?.landValue + assessment?.improvementValue ||
      prop?.assessedValue ||
      null;

    const marketValue = 
      valuation?.estimatedValue || 
      valuation?.value || 
      valuation?.avm ||
      assessment?.marketValue || 
      assessment?.marketTotalValue ||
      assessment?.appraisedValue ||
      prop?.marketValue ||
      null;

    const sqft = 
      building?.livingArea || 
      building?.squareFeet || 
      building?.buildingArea ||
      building?.grossArea ||
      building?.finishedArea ||
      prop?.livingArea ||
      prop?.squareFeet ||
      prop?.buildingArea ||
      result?.squareFeet ||
      null;

    const yearBuilt = 
      building?.yearBuilt || 
      building?.effectiveYearBuilt ||
      prop?.yearBuilt ||
      result?.yearBuilt ||
      null;

    const beds = 
      building?.bedrooms || 
      building?.beds || 
      prop?.bedrooms ||
      prop?.beds ||
      null;

    const baths = 
      building?.bathrooms || 
      building?.baths || 
      building?.totalBaths ||
      prop?.bathrooms ||
      prop?.baths ||
      null;

    const annualTax = 
      prop?.taxInfo?.annualTaxAmount ||
      prop?.tax?.annualTaxAmount ||
      prop?.taxInfo?.taxAmount ||
      assessment?.annualTaxAmount ||
      assessment?.taxAmount ||
      null;

    const county = 
      prop?.county || 
      prop?.countyName || 
      prop?.address?.county || 
      result?.county ||
      result?.address?.county ||
      null;

    const taxYear = 
      assessment?.taxYear || 
      assessment?.year || 
      prop?.taxInfo?.taxYear ||
      new Date().getFullYear().toString();

    const countyName = county ? `${county} County` : `${city} County`;
    const countyState = state.toUpperCase();

    console.log("EXTRACTED VALUES:", { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county });

    // Step 2: Ask Claude to find the county appraisal district filing address
    const districtRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `What is the official mailing address for filing a property tax assessment appeal or dispute with the ${countyName} appraisal district or board of assessment review in ${countyState}?

Return ONLY a JSON object, no other text:
{
  "districtName": "Official name of the appraisal district or board",
  "mailingAddress": "Street address",
  "city": "City",
  "state": "State abbreviation",
  "zip": "ZIP code",
  "phone": "Phone number if known",
  "website": "Website URL if known",
  "filingDeadlineNote": "Brief note about typical filing deadline in this state",
  "filingMethod": "mail | online | in-person | mail or online"
}`
        }],
      }),
    });

    const districtJson = await districtRes.json();
    let appraisalDistrict = null;

    if (districtJson.content) {
      const districtText = districtJson.content.filter(b => b.type === "text").map(b => b.text).join("");
      try {
        const match = districtText.match(/\{[\s\S]*\}/);
        if (match) appraisalDistrict = JSON.parse(match[0]);
      } catch (_) {}
    }

    return res.status(200).json({
      ...data,
      extractedData: { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county, taxYear },
      appraisalDistrict,
      resolvedCounty: countyName,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
