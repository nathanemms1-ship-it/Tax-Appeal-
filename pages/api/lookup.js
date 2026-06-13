import { Redis } from '@upstash/redis';
import { getCountyPortal } from './county_portals';

// Initialize Redis — gracefully handle missing credentials
let redis = null;
try {
  // Support both Upstash variable naming conventions
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (redisUrl && redisToken) {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    console.log("Redis initialized successfully");
  } else {
    console.log("Redis credentials not found — caching disabled, continuing without cache");
  }
} catch (e) {
  console.log("Redis init failed:", e.message, "— continuing without cache");
  redis = null;
}

// Safe cache helpers — silently skip if Redis unavailable
async function cacheGet(key) {
  if (!redis) return null;
  try { return await redis.get(key); } catch (e) { console.log("Cache get failed:", e.message); return null; }
}
async function cacheSet(key, value, ttl) {
  if (!redis) return;
  try { await redis.set(key, value, { ex: ttl }); } catch (e) { console.log("Cache set failed:", e.message); }
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

  // County cached by full address + zip to handle split-ZIP counties
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

    // ── STEP 1: County — cache by full address ────────────────────────────────
    try {
      const cachedCounty = await cacheGet(countyKey);
      if (cachedCounty) {
        county = cachedCounty;
        console.log(`COUNTY FROM CACHE (${countyKey}):`, county);
      }
    } catch (e) {
      console.log("Redis county read failed:", e.message);
    }

    if (!county) {
      // Census geocoder (free, no API cost)
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
            try {
              await cacheSet(countyKey, county, TTL_SECONDS);
              console.log(`CACHED county for ${countyKey} (180 days)`);
            } catch (e) {
              console.log("Redis county write failed:", e.message);
            }
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
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
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
          if (county) {
            try { await cacheSet(countyKey, county, TTL_SECONDS); } catch (e) {}
          }
        }
      } catch (e) {
        console.log("Claude county fallback failed:", e.message);
      }
    }

    const countyName = county ? `${county} County` : `${city} County`;

    // ── STEP 2: Appraisal district — cache by state + county ──────────────────
    const districtKey = `district:${stateUpper}:${(county || city).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    let appraisalDistrict = null;

    try {
      const cachedDistrict = await cacheGet(districtKey);
      if (cachedDistrict) {
        appraisalDistrict = cachedDistrict;
        console.log(`DISTRICT FROM CACHE (${districtKey}):`, appraisalDistrict?.districtName);
      }
    } catch (e) {
      console.log("Redis district read failed:", e.message);
    }

    // ── STEP 3: Web search for property + tax + district ──────────────────────
    try {
      // Look up the county portal from our database first
      const portalInfo = getCountyPortal(stateUpper, county);
      const districtWebsite = portalInfo?.searchUrl || appraisalDistrict?.website || null;
      const districtName = portalInfo?.name || appraisalDistrict?.districtName || `${countyName} Appraisal District`;
      console.log("PORTAL INFO:", { county, portalInfo, districtWebsite });

      const searchPrompt = appraisalDistrict
        ? `Do TWO searches for the property at ${fullAddress}:

SEARCH 1: Search Zillow, Redfin, or Realtor.com for this property to find square footage, bedrooms, bathrooms, year built, and estimated market value.

SEARCH 2: Go to ${districtWebsite ? districtWebsite : `"${countyName} appraisal district property search"`} and search for "${fullAddress}" to find the OFFICIAL TAX APPRAISED VALUE (also called appraised value or assessed value) and annual property tax amount for this exact address. This is the value set by the county appraisal district, NOT the Zillow estimate.

Return ONLY this JSON object:
{
  "property": { "sqft": null, "beds": null, "baths": null, "yearBuilt": null, "marketValue": null, "source": null },
  "tax": { "assessedValue": null, "annualTax": null, "taxYear": null, "source": null }
}`
        : `Do THREE searches for ${fullAddress} in ${countyName}, ${stateUpper}:

SEARCH 1: Search Zillow, Redfin, or Realtor.com for this property: square footage, bedrooms, bathrooms, year built, estimated market value.

SEARCH 2: Go to ${districtWebsite ? districtWebsite : `the ${countyName} Appraisal District website`} and search for "${fullAddress}" to find the OFFICIAL TAX APPRAISED VALUE and annual property tax amount. This is the county's official appraisal, not an estimate.

SEARCH 3: Find the official mailing address, phone, website, and protest filing deadline for the ${countyName} Appraisal District in ${stateUpper}.

Return ONLY this JSON object:
{
  "property": { "sqft": null, "beds": null, "baths": null, "yearBuilt": null, "marketValue": null, "source": null },
  "tax": { "assessedValue": null, "annualTax": null, "taxYear": null, "source": null },
  "district": { "districtName": null, "mailingAddress": null, "city": null, "state": "${stateUpper}", "zip": null, "phone": null, "website": null, "filingDeadlineNote": null, "filingMethod": null }
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
          max_tokens: 1200,
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
          console.log("SEARCH DATA:", JSON.stringify(data));

          const prop = data.property || {};
          if (!sqft && prop.sqft) sqft = Number(prop.sqft);
          if (!beds && prop.beds) beds = Number(prop.beds);
          if (!baths && prop.baths) baths = Number(prop.baths);
          if (!yearBuilt && prop.yearBuilt) yearBuilt = String(prop.yearBuilt);
          if (!marketValue && prop.marketValue) marketValue = Number(prop.marketValue);

          const tax = data.tax || {};
          if (!assessedValue && tax.assessedValue) assessedValue = Number(tax.assessedValue);
          if (!annualTax && tax.annualTax) annualTax = Number(tax.annualTax);

          if (!appraisalDistrict && data.district && data.district.districtName) {
            appraisalDistrict = data.district;
            try {
              await cacheSet(districtKey, appraisalDistrict, TTL_SECONDS);
              console.log(`CACHED district for ${districtKey} (180 days)`);
            } catch (e) {
              console.log("Redis district write failed:", e.message);
            }
          }
        }
      }
    } catch (e) {
      console.log("Web search failed:", e.message);
    }

    // ── STEP 4: BatchData fallback ────────────────────────────────────────────
    if (!sqft || !yearBuilt || !assessedValue) {
      try {
        const bdRes = await fetch("https://api.batchdata.com/api/v1/property/lookup/all-attributes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
          },
          body: JSON.stringify({
            requests: [{ street: street.trim(), city: city.trim(), state: stateUpper, zip: zip.trim() }],
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

    // ── STEP 5: District Claude fallback ──────────────────────────────────────
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
          try {
            await cacheSet(districtKey, appraisalDistrict, TTL_SECONDS);
            console.log(`CACHED district (fallback) for ${districtKey} (180 days)`);
          } catch (e) {}
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
