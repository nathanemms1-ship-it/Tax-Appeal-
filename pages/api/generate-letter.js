import { Redis } from '@upstash/redis';

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) {
    redis = new Redis({ url: redisUrl, token: redisToken });
  }
} catch (e) {
  console.log("Redis init failed:", e.message);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, address, county, assessedValue, zip, state } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const letter = data.content?.[0]?.text || "";
    if (!letter) return res.status(500).json({ error: "Empty letter response" });

    // Store letter in Redis with a 2-hour TTL so success page can retrieve it
    // Key is based on address + timestamp for uniqueness
    let letterKey = null;
    if (redis) {
      try {
        letterKey = `letter:${state}:${zip}:${Date.now()}`;
        await redis.set(letterKey, letter, { ex: 7200 }); // 2 hours
        console.log("Letter cached in Redis:", letterKey);
      } catch (e) {
        console.log("Redis letter cache failed:", e.message);
        letterKey = null;
      }
    }

    return res.status(200).json({ letter, letterKey });
  } catch (err) {
    console.error("Generate letter error:", err);
    return res.status(500).json({ error: err.message || "Letter generation failed" });
  }
}
