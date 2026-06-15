// api/log.js — NDA generation log using Upstash Redis REST API
// GET  /api/log   → returns all entries (requires x-admin-secret header)
// POST /api/log   → appends a new entry

const REDIS_URL    = (process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const REDIS_TOKEN  = process.env.KV_REST_API_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'changeme';
const LIST_KEY     = 'nda:log';
const MAX_ENTRIES  = 500;

// Tell Vercel to parse the body for us
module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

async function redis(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('KV_REST_API_URL or KV_REST_API_TOKEN not set');
  const res = await fetch(`${REDIS_URL}/${command}/${args.map(a => encodeURIComponent(a)).join('/')}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── POST: log a new NDA generation ──
  if (req.method === 'POST') {
    try {
      let body = req.body || {};
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const entry = JSON.stringify({
        ts:           new Date().toISOString(),
        requester:    body.requester    || '',
        dept:         body.dept         || '',
        counterparty: body.counterparty || '',
        country:      body.country      || '',
        regno:        body.regno        || '',
        regauth:      body.regauth      || '',
        signatory:    body.signatory    || '',
        signatory_emails: body.signatory_emails || '',
        purpose:      body.purpose      || '',
        art36:        body.art36        || false,
      });
      await redis('LPUSH', LIST_KEY, entry);
      await redis('LTRIM', LIST_KEY, 0, MAX_ENTRIES - 1);
      return res.status(200).json({ ok: true });
    } catch(e) {
      console.error('Log write error:', e.message);
      // Return details so we can debug from admin
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  // ── GET: read log (admin only) ──
  if (req.method === 'GET') {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const raw = await redis('LRANGE', LIST_KEY, 0, MAX_ENTRIES - 1);
      const entries = (Array.isArray(raw) ? raw : []).map(r => {
        try { return typeof r === 'string' ? JSON.parse(r) : r; } catch { return null; }
      }).filter(Boolean);
      return res.status(200).json({ entries, debug: { url_set: !!REDIS_URL, token_set: !!REDIS_TOKEN } });
    } catch(e) {
      return res.status(503).json({ error: 'Log unavailable', detail: e.message, debug: { url_set: !!REDIS_URL, token_set: !!REDIS_TOKEN } });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
