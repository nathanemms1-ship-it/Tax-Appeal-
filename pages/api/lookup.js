export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip, manualAssessedValue, manualSqft, manualYearBuilt } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  try {
    let assessedValue = manualAssessedValue || null;
    let sqft = manualSqft || null;
    let yearBuilt = manualYearBuilt || null;
    let beds = null;
    let baths = null;
    let annualTax = null;
    let marketValue = null;
    let county = null;

    // Step 1: Resolve county from US Census Geocoder (free, no key needed)
    try {
      const censusRes = await fetch(
        `https://geocoding.geo.census.gov/geocoder/geographies/address?street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&zip=${encodeURIComponent(zip)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`
      );
      if (censusRes.ok) {
        const censusData = await censusRes.json();
        const countyGeo = censusData?.result?.addressMatches?.[0]?.geographies?.Counties?.[0];
        if (countyGeo?.NAME) {
          county = countyGeo.NAME.replace(/ County$/i, "").trim();
          console.log("COUNTY FROM CENSUS:", county);
        }
      }
    } catch (e) {
      console.log("Census lookup failed:", e.message);
    }

    // Step 2: Claude fallback for county if Census failed
    if (!county) {
      try {
        const countyRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 100,
            messages: [{
              role: "user",
              content: `What county is ${street}, ${city}, ${state} ${zip} in? Return ONLY JSON: {"county": "Name"} — name only, no word "County".`
            }],
          }),
        });
        const countyJson = await countyRes.json();
        const countyText = (countyJson.content || []).map(b => b.text || "").join("");
        const match = countyText.match(/\{[\s\S]*?\}/);
        if (match) county = JSON.parse(match[0])?.county?.replace(/ County$/i, "").trim() || null;
        console.log("COUNTY FROM CLAUDE:", county);
      } catch (e) {
        console.log("Claude county lookup failed:", e.message);
      }
    }

    // Step 3: BatchData property lookup
    try {
      const bdRes = await fetch("https://api.batchdata.com/api/v1/property/lookup/all-attributes", {
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

      if (bdRes.ok) {
        const bdData = await bdRes.json();
        console.log("BATCHDATA:", JSON.stringify(bdData, null, 2));
        const properties = bdData?.results?.properties || [];
        if (properties.length > 0) {
          const prop = properties[0];
          const assessmentInfo = prop?.assessmentInfo || prop?.assessment || {};
          const buildingInfo = prop?.buildingInfo || prop?.building || {};
          const valuationInfo = prop?.valuationInfo || prop?.valuation || prop?.avm || {};

          if (!county) {
            const bdCounty = prop?.address?.county || prop?.county || null;
            if (bdCounty) county = bdCounty.replace(/ County$/i, "").trim();
          }

          assessedValue = assessedValue || assessmentInfo?.assessedValue || assessmentInfo?.totalAssessedValue || assessmentInfo?.taxableValue || null;
          marketValue = valuationInfo?.estimatedValue || valuationInfo?.value || assessmentInfo?.marketValue || null;
          sqft = sqft || buildingInfo?.livingArea || buildingInfo?.squareFeet || buildingInfo?.buildingArea || null;
          yearBuilt = yearBuilt || buildingInfo?.yearBuilt || null;
          beds = buildingInfo?.bedrooms || buildingInfo?.beds || null;
          baths = buildingInfo?.bathrooms || buildingInfo?.totalBaths || null;
          annualTax = assessmentInfo?.annualTaxAmount || assessmentInfo?.taxAmount || null;
        }
      }
    } catch (e) {
      console.log("BatchData error:", e.message);
    }

    const countyName = county ? `${county} County` : `${city} County`;
    const taxYear = new Date().getFullYear().toString();
    console.log("FINAL COUNTY:", countyName);

    // Step 4: Web search for the actual current appraisal district address
    let appraisalDistrict = null;
    try {
      const searchRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 800,
          tools: [{
            type: "web_search_20250305",
            name: "web_search",
          }],
          messages: [{
            role: "user",
            content: `Search for the official mailing address of the ${countyName} Appraisal District in ${state.toUpperCase()} where property tax protests or appeals must be filed. Find the current street address, city, zip, phone number, website, and filing deadline. Return ONLY a JSON object with no other text:
{
  "districtName": "Official appraisal district name",
  "mailingAddress": "Street mailing address",
  "city": "City",
  "state": "${state.toUpperCase()}",
  "zip": "ZIP code",
  "phone": "Main phone number",
  "website": "Official website URL",
  "filingDeadlineNote": "Specific protest/appeal deadline for this county",
  "filingMethod": "mail | online | in-person | mail or online"
}`
          }],
        }),
      });

      const searchJson = await searchRes.json();
      console.log("DISTRICT SEARCH RESPONSE:", JSON.stringify(searchJson, null, 2));

      if (searchJson.content) {
        const textBlocks = searchJson.content.filter(b => b.type === "text").map(b => b.text).join("");
        const match = textBlocks.match(/\{[\s\S]*\}/);
        if (match) appraisalDistrict = JSON.parse(match[0]);
        console.log("APPRAISAL DISTRICT:", JSON.stringify(appraisalDistrict));
      }
    } catch (e) {
      console.log("District search failed:", e.message);
    }

    // Step 5: Fallback to Claude knowledge if web search failed
    if (!appraisalDistrict) {
      try {
        const fallbackRes = await fetch("https://api.anthropic.com/v1/messages", {
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
              content: `What is the official mailing address for the ${countyName} Appraisal District in ${state.toUpperCase()} where property owners file tax protests? Return ONLY JSON:
{
  "districtName": "Official name",
  "mailingAddress": "Street address",
  "city": "City",
  "state": "${state.toUpperCase()}",
  "zip": "ZIP",
  "phone": "Phone or null",
  "website": "URL or null",
  "filingDeadlineNote": "Filing deadline note",
  "filingMethod": "mail | online | in-person | mail or online"
}`
            }],
          }),
        });
        const fallbackJson = await fallbackRes.json();
        const fallbackText = (fallbackJson.content || []).map(b => b.text || "").join("");
        const match = fallbackText.match(/\{[\s\S]*\}/);
        if (match) appraisalDistrict = JSON.parse(match[0]);
      } catch (e) {
        console.log("Fallback district lookup failed:", e.message);
      }
    }

    return res.status(200).json({
      extractedData: { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county, taxYear },
      appraisalDistrict,
      resolvedCounty: countyName,
    });

  } catch (err) {
    console.error("Lookup error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
