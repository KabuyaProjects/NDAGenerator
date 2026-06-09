// api/kvk.js
// Primary:  KvK API (when KVK_API_KEY env var is set)
// Fallback: GLEIF LEI search — free, no auth, no bot-blocking, global coverage
// Response shape: { source, resultaten: [{naam, kvkNummer, adres}] }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q' });

  // ── KvK (when key is set) ──
  if (process.env.KVK_API_KEY) {
    try {
      const isNum = /^\d{8}$/.test(q.trim());
      const url = isNum
        ? `https://api.kvk.nl/api/v2/zoeken?kvkNummer=${encodeURIComponent(q.trim())}`
        : `https://api.kvk.nl/api/v2/zoeken?naam=${encodeURIComponent(q.trim())}&resultatenPerPagina=5`;
      const r = await fetch(url, { headers: { apikey: process.env.KVK_API_KEY } });
      if (!r.ok) throw new Error(`KvK ${r.status}`);
      const data = await r.json();
      return res.status(200).json({ source: 'kvk', ...data });
    } catch (e) {
      console.warn('KvK failed:', e.message);
    }
  }

  // ── GLEIF fallback — free, no auth needed ──
  // Searches by entity name, filtered to NL registrations
  try {
    const url = `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(q.trim())}&filter[entity.legalAddress.country]=NL&page[size]=5`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/vnd.api+json' }
    });
    if (!r.ok) throw new Error(`GLEIF ${r.status}`);
    const data = await r.json();

    const records = data.data || [];
    if (records.length === 0) {
      return res.status(200).json({ source: 'gleif', resultaten: [] });
    }

    const resultaten = records.map(rec => {
      const entity = rec.attributes?.entity || {};
      const addr = entity.legalAddress || {};
      // GLEIF legalName can be a string, {name:...} or {value:...} depending on version
      const ln = entity.legalName;
      const naam = (typeof ln === 'string' ? ln : ln?.name || ln?.value) || '—';
      // Use LEI as the registration identifier (KvK number comes from real KvK API)
      const reg = rec.attributes?.lei || entity.registeredAs || '';
      return {
        naam,
        kvkNummer: reg,
        adres: {
          binnenlandsAdres: {
            straatnaam: (addr.addressLines || [])[0] || '',
            huisnummer: '',
            postcode: addr.postalCode || '',
            plaats: addr.city || addr.locality || '',
          }
        }
      };
    });

    return res.status(200).json({ source: 'gleif', resultaten });
  } catch (e) {
    return res.status(502).json({ error: 'Registry lookup failed', detail: e.message });
  }
};
