
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  try {
    const response = await fetch("https://api.batchdata.com/api/v1/property/lookup/all-attributes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BATCHDATA_API_KEY}`,
      },
      body: JSON.stringify({
        requests: [{ propertyAddress: { street, city, state, zip } }]
      }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { return res.status(500).json({ error: `BatchData returned unexpected response: ${text.slice(0, 200)}` }); }

    if (!response.ok) return res.status(response.status).json({ error: data?.message || data?.error || `BatchData error ${response.status}` });

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
