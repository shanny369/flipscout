export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { type } = req.query;

  // Geocoding proxy
  if (type === "geocode") {
    const { address } = req.query;
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`,
      { headers: { "User-Agent": "FlipScout/1.0", "Accept-Language": "en" } }
    );
    const d = await r.json();
    return res.status(200).json(d);
  }

  // Anthropic proxy
  if (req.method !== "POST") return res.status(405).end();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();
  res.status(response.status).json(data);
}
