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

    // Step 1: Resolve county via US Census Geocoder
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

    const countyName = county ? `${county} County` : `${city} County`;
    const taxYear = new Date().getFullYear().toString();

    // Step 2: Web search for property details + tax appraisal value
    // Run all searches in parallel for speed
    const [propertySearchResult, taxSearchResult, districtSearchResult] = await Promise.all([

      // Search 1: Property details from Zillow/Redfin
      fetch("https://api.anthropic.com/v1/messages", {
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
          messages: [{
            role: "user",
            content: `Search Zillow, Redfin, or Realtor.com for the property at ${fullAddress}. Find the square footage, number of bedrooms, number of bathrooms, year built, and estimated market value (Zestimate or similar AVM). Return ONLY a JSON object with no other text:
{
  "sqft": 2150,
  "beds": 4,
  "baths": 2.5,
  "yearBuilt": 1998,
  "marketValue": 425000,
  "source": "Zillow"
}
If a field is not found, use null. Return ONLY the JSON object.`
          }],
        }),
      }).then(r => r.json()).catch(() => null),

      // Search 2: Current tax appraisal value from county appraisal district
      fetch("https://api.anthropic.com/v1/messages", {
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
          messages: [{
            role: "user",
            content: `Search the ${countyName} appraisal district website or property tax records for the current appraised/assessed value of ${fullAddress}. Also look for the annual property tax amount. Try searching the county appraisal district portal, county tax assessor website, or public property records. Return ONLY a JSON object:
{
  "assessedValue": 389000,
  "annualTax": 8200,
  "taxYear": "2025",
  "appraisalAccountNumber": "12345678",
  "source": "Tarrant Appraisal District"
}
If a field is not found, use null. Return ONLY the JSON object.`
          }],
        }),
      }).then(r => r.json()).catch(() => null),

      // Search 3: Appraisal district filing address
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 800,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `Search for the official mailing address of the ${countyName} Appraisal District in ${state.toUpperCase()} where property owners file tax protests. Find the current street address, city, ZIP, phone, website, and protest filing deadline. Return ONLY a JSON object:
{
  "districtName": "Tarrant Appraisal District",
  "mailingAddress": "2500 Handley-Ederville Rd",
  "city": "Fort Worth",
  "state": "TX",
  "zip": "76118",
  "phone": "817-284-0024",
  "website": "https://www.tad.org",
  "filingDeadlineNote": "May 15 or 30 days after assessment notice, whichever is later",
  "filingMethod": "mail or online"
}
Return ONLY the JSON object.`
          }],
        }),
      }).then(r => r.json()).catch(() => null),
    ]);

    // Parse property details from web search
    if (propertySearchResult?.content) {
      const text = propertySearchResult.content.filter(b => b.type === "text").map(b => b.text).join("");
      try {
        const match = text.match(/\{[\s\S]*?\}/);
        if (match) {
          const data = JSON.parse(match[0]);
          console.log("PROPERTY FROM WEB SEARCH:", data);
          if (!sqft && data.sqft) sqft = Number(data.sqft);
          if (!beds && data.beds) beds = Number(data.beds);
          if (!baths && data.baths) baths = Number(data.baths);
          if (!yearBuilt && data.yearBuilt) yearBuilt = String(data.yearBuilt);
          if (!marketValue && data.marketValue) marketValue = Number(data.marketValue);
        }
      } catch (e) {
        console.log("Property search parse error:", e.message);
      }
    }

    // Parse tax appraisal value from web search
    if (taxSearchResult?.content) {
      const text = taxSearchResult.content.filter(b => b.type === "text").map(b => b.text).join("");
      try {
        const match = text.match(/\{[\s\S]*?\}/);
        if (match) {
          const data = JSON.parse(match[0]);
          console.log("TAX DATA FROM WEB SEARCH:", data);
          if (!assessedValue && data.assessedValue) assessedValue = Number(data.assessedValue);
          if (!annualTax && data.annualTax) annualTax = Number(data.annualTax);
        }
      } catch (e) {
        console.log("Tax search parse error:", e.message);
      }
    }

    // Parse appraisal district info
    let appraisalDistrict = null;
    if (districtSearchResult?.content) {
      const text = districtSearchResult.content.filter(b => b.type === "text").map(b => b.text).join("");
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          appraisalDistrict = JSON.parse(match[0]);
          console.log("APPRAISAL DISTRICT:", appraisalDistrict);
        }
      } catch (e) {
        console.log("District parse error:", e.message);
      }
    }

    // Step 3: BatchData as additional fallback for any still-missing fields
    if (!assessedValue || !sqft || !yearBuilt) {
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
            if (!county) {
              const bdCounty = prop?.address?.county || prop?.county || null;
              if (bdCounty) county = bdCounty.replace(/ County$/i, "").trim();
            }
          }
        }
      } catch (e) {
        console.log("BatchData fallback error:", e.message);
      }
    }

    // Step 4: Claude county fallback if still missing
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
      } catch (e) {
        console.log("Claude county fallback failed:", e.message);
      }
    }

    // Step 5: Appraisal district fallback if web search failed
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
              content: `What is the official mailing address of the ${countyName} Appraisal District in ${state.toUpperCase()} where property owners file tax protests? Return ONLY JSON:
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
        console.log("District fallback failed:", e.message);
      }
    }

    const finalCountyName = county ? `${county} County` : countyName;

    console.log("FINAL DATA:", { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county: finalCountyName });

    return res.status(200).json({
      extractedData: { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county, taxYear },
      appraisalDistrict,
      resolvedCounty: finalCountyName,
    });

  } catch (err) {
    console.error("Lookup error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
