import { Redis } from '@upstash/redis';
import { getCountyPortal } from './county_portals';

// Initialize Redis gracefully
let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) {
    redis = new Redis({ url: redisUrl, token: redisToken });
    console.log("Redis initialized successfully");
  } else {
    console.log("Redis credentials not found — caching disabled");
  }
} catch (e) {
  console.log("Redis init failed:", e.message);
  redis = null;
}

async function cacheGet(key) {
  if (!redis) return null;
  try { return await redis.get(key); } catch (e) { return null; }
}
async function cacheSet(key, value, ttl) {
  if (!redis) return;
  try { await redis.set(key, value, { ex: ttl }); } catch (e) {}
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip, manualAssessedValue, manualSqft, manualYearBuilt, manualBeds, manualBaths } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  const fullAddress = `${street}, ${city}, ${state} ${zip}`;
  const stateUpper = state.trim().toUpperCase();
  const TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days

  const addrSlug = `${street.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${zip.trim()}`;
  const countyKey = `county:${stateUpper}:${addrSlug}`;

  try {
    let assessedValue = manualAssessedValue ? Number(String(manualAssessedValue).replace(/[^0-9.]/g, "")) || null : null;
    let sqft = manualSqft ? Number(String(manualSqft).replace(/[^0-9.]/g, "")) || null : null;
    let yearBuilt = manualYearBuilt || null;
    let beds = manualBeds ? Number(manualBeds) || null : null;
    let baths = manualBaths ? Number(manualBaths) || null : null;
    let annualTax = null;
    let marketValue = null;
    let county = null;

    // ── STEP 1: County via Census geocoder ────────────────────────────────────
    const cachedCounty = await cacheGet(countyKey);
    if (cachedCounty) {
      county = cachedCounty;
      console.log(`COUNTY FROM CACHE (${countyKey}):`, county);
    }

    if (!county) {
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
            await cacheSet(countyKey, county, TTL_SECONDS);
          }
        }
      } catch (e) {
        console.log("Census lookup failed:", e.message);
      }
    }

    // Claude county fallback
    if (!county) {
      try {
        const countyRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 100,
            messages: [{ role: "user", content: `What county is ${fullAddress} in? Return ONLY JSON: {"county": "Name"} — name only, no word "County".` }],
          }),
        });
        const countyJson = await countyRes.json();
        const countyText = (countyJson.content || []).map(b => b.text || "").join("");
        const match = countyText.match(/\{[\s\S]*?\}/);
        if (match) {
          county = JSON.parse(match[0])?.county?.replace(/ County$/i, "").trim() || null;
          console.log("COUNTY FROM CLAUDE:", county);
          if (county) await cacheSet(countyKey, county, TTL_SECONDS);
        }
      } catch (e) {
        console.log("Claude county fallback failed:", e.message);
      }
    }

    const countyName = county ? `${county} County` : `${city} County`;
    const districtKey = `district:${stateUpper}:${(county || city).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    let appraisalDistrict = await cacheGet(districtKey);
    if (appraisalDistrict) console.log(`DISTRICT FROM CACHE (${districtKey}):`, appraisalDistrict?.districtName);

    // ── STEP 2: BatchData PRIMARY lookup with Core + Valuation datasets ───────
    try {
      console.log("Calling BatchData with Core dataset...");
      const bdRes = await fetch("https://api.batchdata.com/api/v1/property/lookup/all-attributes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
        },
        body: JSON.stringify({
          requests: [{ street: street.trim(), city: city.trim(), state: stateUpper, zip: zip.trim() }],
          options: {
            datasets: ["core", "valuation"]
          }
        }),
      });

      if (bdRes.ok) {
        const bdData = await bdRes.json();
        console.log("BATCHDATA FULL RESPONSE:", JSON.stringify(bdData, null, 2));

        const properties = bdData?.results?.properties || [];
        if (properties.length > 0) {
          const prop = properties[0];
          console.log("PROPERTY KEYS:", Object.keys(prop));

          // Log every nested object so we can see exact field names
          const allKeys = JSON.stringify(prop);
          console.log("FULL PROPERTY:", allKeys);

          // Try every possible path for assessment data
          const assess =
            prop?.assessment ||
            prop?.assessmentInfo ||
            prop?.taxAssessment ||
            prop?.tax ||
            {};

          const build =
            prop?.building ||
            prop?.buildingInfo ||
            prop?.structure ||
            prop?.improvements ||
            {};

          const val =
            prop?.valuation ||
            prop?.valuationInfo ||
            prop?.avm ||
            {};

          console.log("ASSESSMENT OBJECT:", JSON.stringify(assess));
          console.log("BUILDING OBJECT:", JSON.stringify(build));
          console.log("VALUATION OBJECT:", JSON.stringify(val));

          // Extract assessed value — try every known field name
          if (!assessedValue) {
            assessedValue =
              assess?.totalAssessedValue ??
              assess?.assessedValue ??
              assess?.appraisedValue ??
              assess?.taxableValue ??
              assess?.assessedTotalValue ??
              assess?.landValue ??
              prop?.assessedValue ??
              prop?.totalAssessedValue ??
              prop?.appraisedValue ??
              null;
            console.log("ASSESSED VALUE EXTRACTED:", assessedValue);
          }

          if (!marketValue) {
            marketValue =
              val?.estimatedValue ??
              val?.value ??
              val?.amount ??
              val?.avm ??
              assess?.marketValue ??
              prop?.marketValue ??
              null;
          }

          if (!sqft) {
            sqft =
              build?.livingArea ??
              build?.squareFeet ??
              build?.buildingArea ??
              build?.totalArea ??
              build?.finishedArea ??
              prop?.livingArea ??
              prop?.squareFeet ??
              null;
          }

          if (!yearBuilt) {
            const yb = build?.yearBuilt ?? prop?.yearBuilt ?? null;
            yearBuilt = yb ? String(yb) : null;
          }

          if (!beds) beds = build?.bedrooms ?? build?.beds ?? build?.bedroomsCount ?? prop?.bedrooms ?? null;
          if (!baths) baths = build?.bathrooms ?? build?.totalBaths ?? build?.bathroomsCount ?? prop?.bathrooms ?? null;
          if (!annualTax) annualTax = assess?.annualTaxAmount ?? assess?.taxAmount ?? assess?.annualTax ?? prop?.annualTaxAmount ?? null;

          // Get county from BatchData if we don't have it
          if (!county) {
            const bdCounty = prop?.address?.county || prop?.county || null;
            if (bdCounty) county = bdCounty.replace(/ County$/i, "").trim();
          }
        } else {
          console.log("BatchData returned 0 properties");
        }
      } else {
        const errText = await bdRes.text();
        console.log("BatchData error response:", bdRes.status, errText.slice(0, 300));
      }
    } catch (e) {
      console.log("BatchData error:", e.message);
    }

    console.log("AFTER BATCHDATA:", { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax });

    // ── STEP 3: Web search for district info + any still-missing property data ─
    if (!appraisalDistrict || !assessedValue || !sqft) {
      try {
        const portalInfo = getCountyPortal(stateUpper, county);
        const districtName = portalInfo?.name || `${countyName} Appraisal District`;

        const searchPrompt = `Search for TWO things about ${fullAddress} in ${countyName}, ${stateUpper}:

${!assessedValue ? `1. The OFFICIAL COUNTY TAX APPRAISED VALUE — search Redfin.com, Realtor.com, or Trulia.com for "${fullAddress}" and look in the "Tax History" or "Public Facts" section for the county assessed/appraised value. This is NOT the Zillow estimate — it is the value set by the county.` : "1. Property details already found — skip this."}

${!appraisalDistrict ? `2. The official mailing address of the ${districtName} in ${stateUpper} where property owners file tax protests — include phone, website, and protest deadline.` : "2. District already found — skip this."}

Return ONLY this JSON:
{
  "tax": { "assessedValue": null, "annualTax": null, "taxYear": null },
  "property": { "sqft": null, "beds": null, "baths": null, "yearBuilt": null, "marketValue": null },
  "district": { "districtName": null, "mailingAddress": null, "city": null, "state": "${stateUpper}", "zip": null, "phone": null, "website": null, "filingDeadlineNote": null, "filingMethod": null }
}`;

        const searchRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 1000,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{ role: "user", content: searchPrompt }],
          }),
        });

        const searchJson = await searchRes.json();
        if (searchJson.content) {
          const text = searchJson.content.filter(b => b.type === "text").map(b => b.text).join("");
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            const data = JSON.parse(match[0]);
            console.log("WEB SEARCH DATA:", JSON.stringify(data));

            if (!assessedValue && data.tax?.assessedValue) assessedValue = Number(data.tax.assessedValue);
            if (!annualTax && data.tax?.annualTax) annualTax = Number(data.tax.annualTax);
            if (!sqft && data.property?.sqft) sqft = Number(data.property.sqft);
            if (!beds && data.property?.beds) beds = Number(data.property.beds);
            if (!baths && data.property?.baths) baths = Number(data.property.baths);
            if (!yearBuilt && data.property?.yearBuilt) yearBuilt = String(data.property.yearBuilt);
            if (!marketValue && data.property?.marketValue) marketValue = Number(data.property.marketValue);

            if (!appraisalDistrict && data.district?.districtName) {
              appraisalDistrict = data.district;
              await cacheSet(districtKey, appraisalDistrict, TTL_SECONDS);
              console.log(`CACHED district for ${districtKey} (180 days)`);
            }
          }
        }
      } catch (e) {
        console.log("Web search failed:", e.message);
      }
    }

    // ── STEP 4: District Claude fallback ──────────────────────────────────────
    if (!appraisalDistrict) {
      try {
        const fallbackRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 400,
            messages: [{
              role: "user",
              content: `What is the official mailing address of the ${countyName} Appraisal District in ${stateUpper} where property owners file tax protests? Return ONLY JSON:
{
  "districtName": "Official name",
  "mailingAddress": "Street address",
  "city": "City",
  "state": "${stateUpper}",
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
        if (match) {
          appraisalDistrict = JSON.parse(match[0]);
          await cacheSet(districtKey, appraisalDistrict, TTL_SECONDS);
        }
      } catch (e) {
        console.log("District fallback failed:", e.message);
      }
    }

    const taxYear = new Date().getFullYear().toString();
    console.log("FINAL:", { assessedValue, marketValue, sqft, yearBuilt, beds, baths, annualTax, county: countyName });

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
