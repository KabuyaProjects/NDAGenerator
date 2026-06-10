// api/log.js — NDA generation log using Upstash Redis
// Setup: Vercel Dashboard → Storage → Connect to Upstash Redis (free tier)
// That auto-adds UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
//
// GET  /api/log          → returns all log entries (for /admin page)
// POST /api/log          → appends a new entry
// Requires ADMIN_SECRET header for GET (set ADMIN_SECRET in Vercel env vars)

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'changeme';
const LIST_KEY = 'nda:log';
const MAX_ENTRIES = 500;

async function redis(cmd, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Upstash not configured');
  const res = await fetch(`${REDIS_URL}/${[cmd, ...args.map(a => encodeURIComponent(JSON.stringify(a)))].join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
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
      const entry = {
        ts: new Date().toISOString(),
        requester: req.body?.requester || '',
        dept: req.body?.dept || '',
        counterparty: req.body?.counterparty || '',
        country: req.body?.country || '',
        regno: req.body?.regno || '',
        signatory: req.body?.signatory || '',
        purpose: req.body?.purpose || '',
        art36: req.body?.art36 || false,
      };
      await redis('lpush', LIST_KEY, JSON.stringify(entry));
      await redis('ltrim', LIST_KEY, 0, MAX_ENTRIES - 1); // keep last 500
      return res.status(200).json({ ok: true });
    } catch(e) {
      console.error('Log write failed:', e.message);
      return res.status(200).json({ ok: false, note: 'Log unavailable but NDA generated' });
    }
  }

  // ── GET: read log (admin only) ──
  if (req.method === 'GET') {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (secret !== ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const raw = await redis('lrange', LIST_KEY, 0, MAX_ENTRIES - 1);
      const entries = (raw || []).map(r => {
        try { return JSON.parse(r); } catch { return null; }
      }).filter(Boolean);
      return res.status(200).json({ entries });
    } catch(e) {
      return res.status(503).json({ error: 'Log unavailable', detail: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
