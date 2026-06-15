// api/kvk-profile.js — KvK Basisprofiel API proxy
// Returns officer/signatory data (bestuurders/gemachtigden) if the API key
// has access to that data (this is a separate KvK product from basic Zoeken).
// If not authorized, returns { officers: [], available: false } — frontend
// degrades gracefully.
//
// Accepts: ?kvk=<8-digit kvk number>

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { kvk } = req.query;
  if (!kvk || !/^\d{8}$/.test(kvk.trim())) {
    return res.status(400).json({ error: 'Missing or invalid kvk number' });
  }

  if (!process.env.KVK_API_KEY) {
    return res.status(200).json({ officers: [], available: false, address: null, reason: 'no_api_key' });
  }

  try {
    const url = `https://api.kvk.nl/api/v1/basisprofielen/${encodeURIComponent(kvk.trim())}`;
    const r = await fetch(url, { headers: { apikey: process.env.KVK_API_KEY } });

    if (r.status === 401 || r.status === 403) {
      // Key doesn't have access to this product
      return res.status(200).json({ officers: [], available: false, address: null, reason: 'not_authorized' });
    }
    if (!r.ok) {
      return res.status(200).json({ officers: [], available: false, address: null, reason: `kvk_${r.status}` });
    }

    const data = await r.json();

    // Address (Basisprofiel includes postcode/huisnummer, unlike Zoeken)
    const hv = data._embedded?.hoofdvestiging || data.hoofdvestiging || {};
    const bezoekadres = hv._embedded?.adressen?.find(a=>a.type==='bezoekadres')
      || hv.adressen?.find(a=>a.type==='bezoekadres')
      || hv._embedded?.adressen?.[0] || hv.adressen?.[0] || {};
    const adres = bezoekadres.binnenlandsAdres || bezoekadres || {};
    const address = (adres.straatnaam || adres.postcode) ? {
      straatnaam: adres.straatnaam || '',
      huisnummer: adres.huisnummer != null ? String(adres.huisnummer) : '',
      huisnummerToevoeging: adres.huisnummerToevoeging || '',
      postcode: adres.postcode || '',
      plaats: adres.plaats || '',
    } : null;

    // Officer/signatory data may appear under different keys depending on
    // KvK API version and product entitlement:
    //   _embedded.eigenaar.bestuurders / gemachtigden
    //   _embedded.hoofdvestiging...
    const eigenaar = data._embedded?.eigenaar || data.eigenaar || {};
    const raw = []
      .concat(eigenaar.bestuurders || [])
      .concat(eigenaar.gemachtigden || [])
      .concat(data.bestuurders || [])
      .concat(data.gemachtigden || []);

    const officers = raw.map(p => ({
      naam: p.naam || p.volledigeNaam || [p.voornamen, p.geslachtsnaam].filter(Boolean).join(' ') || '—',
      functietitel: p.functietitel || p.functie || p.type || '',
      bevoegdheid: p.bevoegdheid || '',
      isAuthorized: p.bevoegdheid ? !/geen/i.test(p.bevoegdheid) : null,
    }));

    return res.status(200).json({
      officers,
      available: officers.length > 0,
      address,
    });
  } catch (e) {
    return res.status(200).json({ officers: [], available: false, address: null, reason: 'error', detail: e.message });
  }
};
