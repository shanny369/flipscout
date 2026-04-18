export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { type } = req.query;

  if (type === "geocode") {
    try {
      const { address } = req.query;
      // Try Nominatim first
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`,
        { headers: { "User-Agent": "FlipScout/1.0", "Accept-Language": "en" } }
      );
      if (r.ok) {
        const d = await r.json();
        if (d && d.length > 0) return res.status(200).json(d);
      }
      // Fallback to Photon geocoder
      const r2 = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=en`,
        { headers: { "User-Agent": "FlipScout/1.0" } }
      );
      const d2 = await r2.json();
      if (d2.features && d2.features.length > 0) {
        const f = d2.features[0];
        return res.status(200).json([{
          lat: String(f.geometry.coordinates[1]),
          lon: String(f.geometry.coordinates[0]),
          display_name: f.properties.name
        }]);
      }
      return res.status(200).json([]);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "POST") return res.status(405).end();
  try {
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
