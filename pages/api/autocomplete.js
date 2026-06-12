
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query } = req.body;
  if (!query || query.length < 3) return res.status(200).json({ suggestions: [] });

  // Try multiple request formats since BatchData docs aren't clear
  const formats = [
    // Format 1: search field
    { url: "https://api.batchdata.com/api/v1/address/autocomplete", body: { search: query, limit: 6 } },
    // Format 2: query field
    { url: "https://api.batchdata.com/api/v1/address/autocomplete", body: { query, limit: 6 } },
    // Format 3: input field
    { url: "https://api.batchdata.com/api/v1/address/autocomplete", body: { input: query, limit: 6 } },
    // Format 4: text field
    { url: "https://api.batchdata.com/api/v1/address/autocomplete", body: { text: query, limit: 6 } },
    // Format 5: address field
    { url: "https://api.batchdata.com/api/v1/address/autocomplete", body: { address: query, limit: 6 } },
  ];

  for (const fmt of formats) {
    try {
      const response = await fetch(fmt.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
        },
        body: JSON.stringify(fmt.body),
      });

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { continue; }

      console.log(`Autocomplete format ${JSON.stringify(fmt.body)} => status ${response.status}:`, JSON.stringify(data).slice(0, 500));

      if (!response.ok) continue;

      // Try every possible response path
      const raw =
        data?.results?.suggestions ||
        data?.results ||
        data?.suggestions ||
        data?.addresses ||
        data?.data ||
        data?.items ||
        [];

      if (!Array.isArray(raw) || raw.length === 0) continue;

      const suggestions = raw.map(item => {
        // Try every possible field name
        const street =
          item?.streetAddress ||
          item?.street ||
          item?.address ||
          item?.line1 ||
          item?.street_address ||
          item?.addressLine1 ||
          item?.formattedStreet ||
          "";

        const city =
          item?.city ||
          item?.locality ||
          item?.municipalitySubdivision ||
          item?.municipality ||
          "";

        const state =
          item?.state ||
          item?.region ||
          item?.countrySubdivision ||
          item?.stateCode ||
          "";

        const zip =
          item?.zip ||
          item?.postalCode ||
          item?.zipCode ||
          item?.postal_code ||
          item?.postcode ||
          "";

        const full =
          item?.formattedAddress ||
          item?.fullAddress ||
          item?.label ||
          item?.display_name ||
          [street, city, state, zip].filter(Boolean).join(", ");

        return { street, city, state, zip, full };
      }).filter(s => s.street || s.full);

      if (suggestions.length > 0) {
        console.log("AUTOCOMPLETE SUCCESS with format:", JSON.stringify(fmt.body));
        return res.status(200).json({ suggestions });
      }
    } catch (err) {
      console.log(`Format ${JSON.stringify(fmt.body)} error:`, err.message);
    }
  }

  // All BatchData formats failed — fall back to Census geocoder for address suggestions
  try {
    const censusRes = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`
    );
    if (censusRes.ok) {
      const censusData = await censusRes.json();
      const matches = censusData?.result?.addressMatches || [];
      const suggestions = matches.slice(0, 5).map(m => {
        const components = m?.addressComponents || {};
        return {
          street: `${components.fromAddress || ""} ${components.streetName || ""} ${components.suffixType || ""}`.trim(),
          city: components.city || "",
          state: components.state || "",
          zip: components.zip || "",
          full: m?.matchedAddress || "",
        };
      }).filter(s => s.street);

      if (suggestions.length > 0) {
        console.log("AUTOCOMPLETE using Census fallback");
        return res.status(200).json({ suggestions });
      }
    }
  } catch (e) {
    console.log("Census fallback error:", e.message);
  }

  return res.status(200).json({ suggestions: [] });
}
