export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { street, city, state, zip } = req.body;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: "Missing address fields" });
  }

  try {
    // Step 1: Pull property data from BatchData
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

    // Step 2: Extract county from BatchData response
    const result = data?.results?.[0] || data?.responses?.[0] || data?.data?.[0] || {};
    const prop = result?.propertyInfo || result?.property || result || {};
    const county = prop?.county || prop?.countyName || prop?.address?.county || result?.county || null;
    const countyName = county ? `${county} County` : `${city} County`;
    const countyState = state.toUpperCase();

    // Step 3: Ask Claude to find the county appraisal district filing address
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
          content: `What is the official mailing address for filing a property tax assessment appeal or dispute with the ${countyName} appraisal district or board of assessment review in ${countyState}?

Return ONLY a JSON object, no other text:
{
  "districtName": "Official name of the appraisal district or board",
  "mailingAddress": "Street address",
  "city": "City",
  "state": "State abbreviation",
  "zip": "ZIP code",
