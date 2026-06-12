export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query } = req.body;
  if (!query || query.length < 3) return res.status(200).json({ suggestions: [] });

  try {
    const response = await fetch("https://api.batchdata.com/api/v1/address/autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
      },
      body: JSON.stringify({ query, limit: 6 }),
    });

    if (!response.ok) {
      return res.status(200).json({ suggestions: [] });
    }

    const data = await response.json();
    console.log("AUTOCOMPLETE RESPONSE:", JSON.stringify(data, null, 2));

    // Parse BatchData autocomplete response — try multiple schema paths
    const raw = data?.results || data?.suggestions || data?.addresses || data?.data || [];
    const suggestions = raw.map(item => {
      const street = item?.streetAddress || item?.street || item?.address || item?.line1 || "";
      const city = item?.city || item?.locality || "";
      const state = item?.state || item?.region || "";
      const zip = item?.zip || item?.postalCode || item?.zipCode || "";
      const full = item?.formattedAddress || item?.fullAddress || [street, city, state, zip].filter(Boolean).join(", ");
      return { street, city, state, zip, full };
    }).filter(s => s.street);

    return res.status(200).json({ suggestions });
  } catch (err) {
    console.error("Autocomplete error:", err);
    return res.status(200).json({ suggestions: [] });
  }
}
