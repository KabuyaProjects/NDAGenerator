// api/oc.js — proxy for OpenCorporates API
// Deployed as a Vercel serverless function at /api/oc
// Accepts: ?q=<name or reg number>&jur=<jurisdiction_code>
// If jur is omitted, searches globally.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, jur } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

  // Optional: set OC_API_TOKEN in Vercel env vars for higher rate limits
  // Free tier works without a token for basic searches
  const token = process.env.OC_API_TOKEN ? `&api_token=${process.env.OC_API_TOKEN}` : '';

  // Heuristic: if q looks like a reg number and jur is provided, try direct fetch first
  const looksLikeNumber = jur && /^[A-Z0-9\-\/]{4,20}$/i.test(q.trim()) && !/\s/.test(q.trim());

  let url;
  if (looksLikeNumber) {
    url = `https://api.opencorporates.com/v0.4/companies/${jur}/${encodeURIComponent(q.trim())}?sparse=false${token}`;
  } else {
    url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(q.trim())}&order=score&per_page=8${jur ? '&jurisdiction_code=' + jur : ''}${token}`;
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'DeltaQuad-NDA-Tool/1.0' },
    });

    if (!upstream.ok) {
      // If direct number fetch fails, fall back to name search
      if (looksLikeNumber && upstream.status === 404) {
        const fallback = await fetch(
          `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(q.trim())}&order=score&per_page=8${jur ? '&jurisdiction_code=' + jur : ''}${token}`,
          { headers: { 'User-Agent': 'DeltaQuad-NDA-Tool/1.0' } }
        );
        if (fallback.ok) {
          const data = await fallback.json();
          return res.status(200).json(data);
        }
      }
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: `OpenCorporates error ${upstream.status}`, detail: text });
    }

    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'OpenCorporates proxy error', detail: err.message });
  }
}
