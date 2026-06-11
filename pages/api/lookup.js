export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  try {
    // Try multiple request formats until one works
    const attempts = [
      // Format 1: standard nested propertyAddress
      {
        requests: [{
          propertyAddress: {
            street: street.trim(),
            city: city.trim(),
            state: state.trim().toUpperCase(),
            zip: zip.trim()
          }
        }]
      },
      // Format 2: flat address fields
      {
        requests: [{
          street: street.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zip: zip.trim()
        }]
      },
      // Format 3: single address string
      {
        requests: [{
          propertyAddress: {
            address: `${street.trim()}, ${city.trim()}, ${state.trim().toUpperCase()} ${zip.trim()}`
          }
        }]
      },
    ];

    let data = null;
    let properties = [];

    for (const body of attempts) {
      const response = await fetch("https://api.batchdata.com/api/v1/property/lookup/all-attributes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { continue; }

      console.log(`Attempt with body ${JSON.stringify(body)} => matchCount: ${parsed?.results?.meta?.results?.matchCount}`);
      console.log("FULL RESPONSE:", JSON.stringify(parsed, null, 2));

      properties = parsed?.results?.properties || [];
      if (properties.length > 0) {
        data = parsed;
        break;
      }
    }

    // If lookup failed, try property-search endpoint
    if (properties.length === 0) {
      console.log("All lookup attempts failed, trying property-search...");
      const searchRes = await fetch("https://api.batchdata.com/api/v1/property/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
        },
        body: JSON.stringify({
          filters: {
            address: {
              street: street.trim(),
              city: city.trim(),
              state: state.trim().toUpperCase(),
              zip: zip.trim(),
            }
          },
          fields: ["address", "assessmentInfo", "buildingInfo", "valuationInfo", "taxInfo", "lotInfo"],
          size: 1,
        }),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        console.log("SEARCH RESPONSE:", JSON.stringify(searchData, null, 2));
        properties = searchData?.results?.properties || searchData?.properties || [];
        if (properties.length > 0) data = searchData;
      }
    }

    if (properties.length === 0) {
      return res.status(404).json({
        error: `Property not found. Please verify: ${street}, ${city}, ${state} ${zip}. Try abbreviating street type (St, Ave, Ct, Dr, Blvd).`
      });
    }

    const property = properties[0];
    console.log("MATCHED PROPERTY:", JSON.stringify(property, null, 2));

    // Extract all fields
    const address = property?.address || {};
    const assessmentInfo = property?.assessmentInfo || property?.assessment || property?.taxInfo || {};
    const buildingInfo = property?.buildingInfo || property?.building || property?.improvements || {};
    const valuationInfo = property?.valuationInfo || property?.valuation || property?.avm || {};

    console.log("ASSESSMENT:", JSON.stringify(assessmentInfo));
    console.log("BUILDING:", JSON.stringify(buildingInfo));
    console.log("VALUATION:", JSON.stringify(valuationInfo));

    const assessedValue = assessmentInfo?.assessedValue ?? assessmentInfo?.totalAssessedValue ?? assessmentInfo?.taxableValue ?? property?.assessedValue ?? null;
    const marketValue = valuationInfo?.estimatedValue ?? valuationInfo?.value ?? assessmentInfo?.marketValue ?? assessmentInfo?.appraisedValue ?? property?.marketValue ?? null;
    const sqft = buildingInfo?.livingArea ?? buildingInfo?.squareFeet ?? buildingInfo?.buildingArea ?? property?.livingArea ?? property?.squareFeet ?? null;
    const yearBuilt = buildingInfo?.yearBuilt ?? buildingInfo?.effectiveYearBuilt ?? property?.yearBuilt ?? null;
    const beds = buildingInfo?.bedrooms ?? buildingInfo?.beds ?? property?.bedrooms ?? null;
    const baths = buildingInfo?.bathrooms ?? buildingInfo?.totalBaths ?? property?.bathrooms ?? null;
    const annualTax = assessmentInfo?.annualTaxAmount ?? assessmentInfo?.taxAmount ?? property?.annualTaxAmount ?? null;
    const county = address?.county ?? property?.county ?? property?.countyName ?? null;
    const taxYear = assessmentInfo?.taxYear ?? assessmentInfo?.year ?? new Date().getFullYear().toString();
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
  "filingDeadlineNote": "Deadline note",
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
