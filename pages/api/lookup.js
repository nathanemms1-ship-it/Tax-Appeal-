export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  try {
    // Correct BatchData format: flat fields inside requests array
    const response = await fetch("https://api.batchdata.com/api/v1/property/lookup/all-attributes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
      },
      body: JSON.stringify({
        requests: [{
          street: street.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zip: zip.trim(),
        }],
        options: {}
      }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(500).json({ error: `Unexpected response: ${text.slice(0, 200)}` });
    }

    console.log("BATCHDATA RESPONSE:", JSON.stringify(data, null, 2));

    const properties = data?.results?.properties || [];

    if (properties.length === 0) {
      return res.status(404).json({
        error: `Property not found for ${street}, ${city}, ${state} ${zip}. Please verify the address.`
      });
    }

    const property = properties[0];
    console.log("MATCHED PROPERTY:", JSON.stringify(property, null, 2));

    const address = property?.address || {};
    const assessmentInfo = property?.assessmentInfo || property?.assessment || {};
    const buildingInfo = property?.buildingInfo || property?.building || {};
    const valuationInfo = property?.valuationInfo || property?.valuation || property?.avm || {};

    const assessedValue = assessmentInfo?.assessedValue ?? assessmentInfo?.totalAssessedValue ?? assessmentInfo?.taxableValue ?? null;
    const marketValue = valuationInfo?.estimatedValue ?? valuationInfo?.value ?? assessmentInfo?.marketValue ?? assessmentInfo?.appraisedValue ?? null;
    const sqft = buildingInfo?.livingArea ?? buildingInfo?.squareFeet ?? buildingInfo?.buildingArea ?? null;
    const yearBuilt = buildingInfo?.yearBuilt ?? buildingInfo?.effectiveYearBuilt ?? null;
    const beds = buildingInfo?.bedrooms ?? buildingInfo?.beds ?? null;
    const baths = buildingInfo?.bathrooms ?? buildingInfo?.totalBaths ?? null;
    const annualTax = assessmentInfo?.annualTaxAmount ?? assessmentInfo?.taxAmount ?? null;
    const county = address?.county ?? property?.county ?? null;
    const taxYear = assessmentInfo?.taxYear ?? new Date().getFullYear().toString();
    const countyName = county ? `${county} County` : `${city} County`;

    console.log("EXTRACTED:", { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county });

    // Look up appraisal district
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
          content: `What is the official mailing address for filing a property tax assessment appeal with the ${countyName} appraisal district in ${state.toUpperCase()}? Return ONLY a JSON object:
{
  "districtName": "Official name",
  "mailingAddress": "Street address",
  "city": "City",
  "state": "State",
  "zip": "ZIP",
  "phone": "Phone or null",
  "website": "URL or null",
  "filingDeadlineNote": "Typical filing deadline note",
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
      results: { properties: [property] },
      extractedData: { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county, taxYear },
      appraisalDistrict,
      resolvedCounty: countyName,
    });

  } catch (err) {
    console.error("Lookup error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
