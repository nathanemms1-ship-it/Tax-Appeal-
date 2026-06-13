// pages/api/autocomplete.js - simplified proxy
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { query } = req.body;
  if (!query || query.length < 3) return res.status(200).json({ suggestions: [] });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  console.log("API KEY EXISTS:", !!key, "KEY PREFIX:", key ? key.substring(0, 8) : "MISSING");

  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=address&components=country:us&key=${key}`;
    console.log("CALLING URL:", url.replace(key, "REDACTED"));

    const r = await fetch(url);
    const data = await r.json();
    console.log("GOOGLE RESPONSE:", JSON.stringify(data).slice(0, 500));

    if (data.status !== "OK") {
      console.log("GOOGLE ERROR STATUS:", data.status, data.error_message);
      return res.status(200).json({ suggestions: [], error: data.status });
    }

    // Get details for each prediction to extract address components
    const suggestions = await Promise.all(
      (data.predictions || []).slice(0, 5).map(async (pred) => {
        try {
          const detailUrl = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${pred.place_id}&key=${key}`;
          const dr = await fetch(detailUrl);
          const dd = await dr.json();
          const components = dd?.results?.[0]?.address_components || [];
          const get = (type) => components.find(c => c.types.includes(type))?.short_name || "";
          const getLong = (type) => components.find(c => c.types.includes(type))?.long_name || "";
          const street = `${get("street_number")} ${getLong("route")}`.trim();
          return {
            street,
            city: getLong("locality") || getLong("sublocality") || getLong("administrative_area_level_3") || "",
            state: get("administrative_area_level_1"),
            zip: get("postal_code"),
            full: dd?.results?.[0]?.formatted_address || pred.description,
          };
        } catch {
          return { street: pred.description, city: "", state: "", zip: "", full: pred.description };
        }
      })
    );

    const valid = suggestions.filter(s => s.street);
    console.log("RETURNING SUGGESTIONS:", valid.length);
    return res.status(200).json({ suggestions: valid });
  } catch (e) {
    console.log("AUTOCOMPLETE EXCEPTION:", e.message);
    return res.status(200).json({ suggestions: [] });
  }
}
