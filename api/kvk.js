// api/kvk.js — proxy for Dutch Chamber of Commerce API
// Deployed as a Vercel serverless function at /api/kvk
// Accepts: ?q=<name or kvk number>

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

  const isNumber = /^\d{8}$/.test(q.trim());
  const url = isNumber
    ? `https://api.kvk.nl/api/v2/zoeken?kvkNummer=${encodeURIComponent(q.trim())}`
    : `https://api.kvk.nl/api/v2/zoeken?naam=${encodeURIComponent(q.trim())}&resultatenPerPagina=5`;

  try {
    const upstream = await fetch(url, {
      headers: {
        // Set your KvK API key in Vercel environment variables as KVK_API_KEY
        // Get a free key at: https://developers.kvk.nl/
        'apikey': process.env.KVK_API_KEY || 'l7xx1f2691f2520d487b902f4e0b57a0b197',
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: `KvK API error ${upstream.status}`, detail: text });
    }

    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'KvK proxy error', detail: err.message });
  }
}
