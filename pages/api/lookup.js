export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip, manualAssessedValue, manualSqft, manualYearBuilt, manualBeds, manualBaths } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  const fullAddress = `${street}, ${city}, ${state} ${zip}`;

  try {
    let assessedValue = manualAssessedValue ? Number(String(manualAssessedValue).replace(/[^0-9.]/g, "")) || null : null;
    let sqft = manualSqft ? Number(String(manualSqft).replace(/[^0-9.]/g, "")) || null : null;
    let yearBuilt = manualYearBuilt || null;
    let beds = manualBeds ? Number(manualBeds) || null : null;
    let baths = manualBaths ? Number(manualBaths) || null : null;
    let annualTax = null;
    let marketValue = null;
    let county = null;

    // Step 1: Resolve county via US Census Geocoder (free, no API key needed)
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

    // Step 2: Claude county fallback if census failed
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
              content: `What county is ${fullAddress} in? Return ONLY JSON: {"county": "Name"} — name only, no word "County".`
            }],
          }),
        });
        const countyJson = await countyRes.json();
        const countyText = (countyJson.content || []).map(b => b.text || "").join("");
        const match = countyText.match(/\{[\s\S]*?\}/);
        if (match) county = JSON.parse(match[0])?.county?.replace(/ County$/i, "").trim() || null;
        console.log("COUNTY FROM CLAUDE:", county);
      } catch (e) {
        console.log("Claude county fallback failed:", e.message);
      }
    }

    const countyName = county ? `${county} County` : `${city} County`;
    const taxYear = new Date().getFullYear().toString();

    // Step 3: Single combined web search for ALL property data at once
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
          max_tokens: 1500,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `I need three pieces of information about ${fullAddress} in ${countyName}, ${state.toUpperCase()}. Please search for all three and return a single JSON object.

1. Property details from Zillow, Redfin, or Realtor.com: square footage, bedrooms, bathrooms, year built, estimated market value
2. Current tax appraised value from the ${countyName} Appraisal District public records or county tax assessor website
3. The official mailing address of the ${countyName} Appraisal District where property owners file tax protests, including phone, website, and protest deadline

Return ONLY this JSON object with no other text:
{
  "property": {
    "sqft": 2150,
    "beds": 4,
    "baths": 2.5,
    "yearBuilt": 1998,
    "marketValue": 425000,
    "source": "Zillow"
  },
  "tax": {
    "assessedValue": 389000,
    "annualTax": 8200,
    "taxYear": "2025",
    "source": "Tarrant Appraisal District"
  },
  "district": {
    "districtName": "Tarrant Appraisal District",
    "mailingAddress": "2500 Handley-Ederville Rd",
    "city": "Fort Worth",
    "state": "TX",
    "zip": "76118",
    "phone": "817-284-0024",
    "website": "https://www.tad.org",
    "filingDeadlineNote": "May 15 or 30 days after notice, whichever is later",
    "filingMethod": "mail or online"
  }
}
Use null for any field you cannot find. Return ONLY the JSON object.`
          }],
        }),
      });

      const searchJson = await searchRes.json();
      console.log("COMBINED SEARCH RESPONSE:", JSON.stringify(searchJson?.content?.filter(b => b.type === "text"), null, 2));

      if (searchJson.content) {
        const text = searchJson.content.filter(b => b.type === "text").map(b => b.text).join("");
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const data = JSON.parse(match[0]);
          console.log("PARSED COMBINED DATA:", JSON.stringify(data, null, 2));

          // Property details
          const prop = data.property || {};
          if (!sqft && prop.sqft) sqft = Number(prop.sqft);
          if (!beds && prop.beds) beds = Number(prop.beds);
          if (!baths && prop.baths) baths = Number(prop.baths);
          if (!yearBuilt && prop.yearBuilt) yearBuilt = String(prop.yearBuilt);
          if (!marketValue && prop.marketValue) marketValue = Number(prop.marketValue);

          // Tax data
          const tax = data.tax || {};
          if (!assessedValue && tax.assessedValue) assessedValue = Number(tax.assessedValue);
          if (!annualTax && tax.annualTax) annualTax = Number(tax.annualTax);

          // Appraisal district
          if (data.district && data.district.districtName) {
            appraisalDistrict = data.district;
          }
        }
      }
    } catch (e) {
      console.log("Combined search failed:", e.message);
    }

    // Step 4: BatchData as fallback for any still-missing property fields
    if (!sqft || !yearBuilt || !assessedValue) {
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
          const properties = bdData?.results?.properties || [];
          if (properties.length > 0) {
            const prop = properties[0];
            const ai = prop?.assessmentInfo || prop?.assessment || {};
            const bi = prop?.buildingInfo || prop?.building || {};
            const vi = prop?.valuationInfo || prop?.valuation || {};

            if (!assessedValue) assessedValue = ai?.assessedValue ?? ai?.totalAssessedValue ?? ai?.taxableValue ?? null;
            if (!marketValue) marketValue = vi?.estimatedValue ?? vi?.value ?? ai?.marketValue ?? null;
            if (!sqft) sqft = bi?.livingArea ?? bi?.squareFeet ?? bi?.buildingArea ?? null;
            if (!yearBuilt) yearBuilt = bi?.yearBuilt ? String(bi.yearBuilt) : null;
            if (!beds) beds = bi?.bedrooms ?? bi?.beds ?? null;
            if (!baths) baths = bi?.bathrooms ?? bi?.totalBaths ?? null;
            if (!annualTax) annualTax = ai?.annualTaxAmount ?? ai?.taxAmount ?? null;
          }
        }
      } catch (e) {
        console.log("BatchData fallback error:", e.message);
      }
    }

    // Step 5: Appraisal district Claude fallback if web search missed it
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
            max_tokens: 400,
            messages: [{
              role: "user",
              content: `What is the official mailing address of the ${countyName} Appraisal District in ${state.toUpperCase()} where property owners file tax protests? Return ONLY JSON:
{
  "districtName": "Official name",
  "mailingAddress": "Street address",
  "city": "City",
  "state": "${state.toUpperCase()}",
  "zip": "ZIP",
  "phone": "Phone or null",
  "website": "URL or null",
  "filingDeadlineNote": "Filing deadline",
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
        console.log("District fallback failed:", e.message);
      }
    }

    console.log("FINAL DATA:", { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county: countyName });

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
