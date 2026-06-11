export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  try {
    // Try the single property lookup endpoint
    const response = await fetch("https://api.batchdata.com/api/v1/property/lookup/all-attributes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
      },
      body: JSON.stringify({
        requests: [{ 
          propertyAddress: { 
            street: street.trim(), 
            city: city.trim(), 
            state: state.trim().toUpperCase(), 
            zip: zip.trim() 
          } 
        }]
      }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { 
      return res.status(500).json({ error: `Unexpected response: ${text.slice(0, 200)}` }); 
    }

    console.log("BATCHDATA RAW RESPONSE:", JSON.stringify(data, null, 2));

    // Correct path: results.properties array
    const properties = data?.results?.properties || [];
    console.log("PROPERTIES COUNT:", properties.length);

    let property = null;

    if (properties.length > 0) {
      property = properties[0];
      console.log("PROPERTY KEYS:", Object.keys(property));
      console.log("FULL PROPERTY:", JSON.stringify(property, null, 2));
    } else {
      // If no match, try the search endpoint as fallback
      console.log("No match from lookup, trying search endpoint...");
      const searchResponse = await fetch("https://api.batchdata.com/api/v1/property/search", {
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
          size: 1,
        }),
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        console.log("SEARCH RESPONSE:", JSON.stringify(searchData, null, 2));
        const searchProps = searchData?.results?.properties || searchData?.results || searchData?.properties || [];
        if (searchProps.length > 0) property = searchProps[0];
      }
    }

    if (!property) {
      return res.status(404).json({ 
        error: `Property not found for ${street}, ${city}, ${state} ${zip}. Please verify the address and try again.` 
      });
    }

    // Extract fields — log every key so we can see the exact structure
    console.log("ALL PROPERTY FIELDS:", JSON.stringify(property, null, 2));

    // Navigate the actual BatchData schema
    const address = property?.address || {};
    const assessmentInfo = property?.assessmentInfo || property?.assessment || property?.taxInfo || {};
    const buildingInfo = property?.buildingInfo || property?.building || property?.improvements || {};
    const valuationInfo = property?.valuationInfo || property?.valuation || property?.avm || {};
    const lotInfo = property?.lotInfo || property?.lot || {};

    console.log("ASSESSMENT INFO:", JSON.stringify(assessmentInfo));
    console.log("BUILDING INFO:", JSON.stringify(buildingInfo));
    console.log("VALUATION INFO:", JSON.stringify(valuationInfo));

    const assessedValue = 
      assessmentInfo?.assessedValue ?? 
      assessmentInfo?.totalAssessedValue ?? 
      assessmentInfo?.assessedTotalValue ??
      assessmentInfo?.taxableValue ??
      property?.assessedValue ??
      null;

    const marketValue = 
      valuationInfo?.estimatedValue ?? 
      valuationInfo?.value ?? 
      valuationInfo?.avm ??
      assessmentInfo?.marketValue ?? 
      assessmentInfo?.appraisedValue ??
      property?.marketValue ??
      null;

    const sqft = 
      buildingInfo?.livingArea ?? 
      buildingInfo?.squareFeet ?? 
      buildingInfo?.buildingArea ??
      buildingInfo?.totalArea ??
      buildingInfo?.finishedArea ??
      property?.livingArea ??
      property?.squareFeet ??
      null;

    const yearBuilt = 
      buildingInfo?.yearBuilt ?? 
      buildingInfo?.effectiveYearBuilt ??
      property?.yearBuilt ??
      null;

    const beds = 
      buildingInfo?.bedrooms ?? 
      buildingInfo?.beds ?? 
      property?.bedrooms ??
      null;

    const baths = 
      buildingInfo?.bathrooms ?? 
      buildingInfo?.totalBaths ??
      buildingInfo?.baths ??
      property?.bathrooms ??
      null;

    const annualTax = 
      assessmentInfo?.annualTaxAmount ??
      assessmentInfo?.taxAmount ??
      property?.annualTaxAmount ??
      null;

    const county = 
      address?.county ?? 
      property?.county ?? 
      property?.countyName ??
      null;

    const taxYear = 
      assessmentInfo?.taxYear ?? 
      assessmentInfo?.year ??
      new Date().getFullYear().toString();

    const countyName = county ? `${county} County` : `${city} County`;

    console.log("EXTRACTED:", { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county, taxYear });

    // Look up the appraisal district
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
          content: `What is the official mailing address for filing a property tax assessment appeal with the ${countyName} appraisal district in ${state.toUpperCase()}?

Return ONLY a JSON object, no other text:
{
  "districtName": "Official name",
  "mailingAddress": "Street address",
  "city": "City",
  "state": "State abbreviation",
  "zip": "ZIP code",
  "phone": "Phone number or null",
  "website": "Website URL or null",
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
