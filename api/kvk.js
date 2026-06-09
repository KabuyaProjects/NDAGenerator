// api/kvk.js — proxy for Dutch Chamber of Commerce API
// Falls back to OpenCorporates (jurisdiction: nl) when KVK_API_KEY is not set.
// Accepts: ?q=<name or kvk number>
// Response always uses the KvK-style shape { resultaten: [...] } so the
// frontend doesn't need to care which source was used.
// Set KVK_API_KEY in Vercel env vars to use the real KvK API.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

  // ── Use real KvK API if key is available ──
  if (process.env.KVK_API_KEY) {
    const isNumber = /^\d{8}$/.test(q.trim());
    const url = isNumber
      ? `https://api.kvk.nl/api/v2/zoeken?kvkNummer=${encodeURIComponent(q.trim())}`
      : `https://api.kvk.nl/api/v2/zoeken?naam=${encodeURIComponent(q.trim())}&resultatenPerPagina=5`;
    try {
      const upstream = await fetch(url, { headers: { apikey: process.env.KVK_API_KEY } });
      if (!upstream.ok) throw new Error(`KvK ${upstream.status}`);
      const data = await upstream.json();
      return res.status(200).json({ source: 'kvk', ...data });
    } catch (err) {
      // fall through to OpenCorporates on any KvK error
      console.warn('KvK failed, falling back to OpenCorporates:', err.message);
    }
  }

  // ── Fallback: OpenCorporates for NL ──
  try {
    const token = process.env.OC_API_TOKEN ? `&api_token=${process.env.OC_API_TOKEN}` : '';
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(q.trim())}&jurisdiction_code=nl&order=score&per_page=5${token}`;
    const upstream = await fetch(url, { headers: { 'User-Agent': 'DeltaQuad-NDA-Tool/1.0' } });
    if (!upstream.ok) throw new Error(`OpenCorporates ${upstream.status}`);
    const data = await upstream.json();

    // Normalise to KvK-style shape so the frontend works unchanged
    const companies = (data.results?.companies || []).map(c => c.company);
    const resultaten = companies.map(co => ({
      naam: co.name,
      kvkNummer: co.company_number,
      _source: 'opencorporates',
      adres: {
        binnenlandsAdres: {
          straatnaam: co.registered_address?.street_address || '',
          huisnummer: '',
          postcode: co.registered_address?.postal_code || '',
          plaats: co.registered_address?.locality || '',
        }
      }
    }));

    return res.status(200).json({ source: 'opencorporates', resultaten });
  } catch (err) {
    return res.status(502).json({ error: 'Registry lookup failed', detail: err.message });
  }
}
