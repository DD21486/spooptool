/**
 * POST /api/location/post
 * Receives one player's location (Live Location Sharing plugin compatible).
 * Body: { name, waypoint: { x, y, plane }, type, title, world }
 * Auth: header Authorization must match LOCATION_SHARED_KEY.
 * Returns full array of current locations (same shape as GET /api/location).
 */
const { neon } = require('@neondatabase/serverless');

const STALE_MS = 10 * 1000;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function auth(req) {
  const key = process.env.LOCATION_SHARED_KEY;
  if (!key || key.trim() === '') return { ok: false, reason: 'LOCATION_SHARED_KEY not set' };
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || header !== key) return { ok: false, reason: 'Invalid or missing Authorization' };
  return { ok: true };
}

function send500(res, detail) {
  return res.status(500).json({ error: 'Server error', detail: detail || 'Unknown error' });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const a = auth(req);
  if (!a.ok) return res.status(401).json({ error: a.reason });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const name = (body.name || '').trim();
  const waypoint = body.waypoint || {};
  const x = parseInt(waypoint.x, 10);
  const y = parseInt(waypoint.y, 10);
  const plane = parseInt(waypoint.plane, 10);
  const world = parseInt(body.world, 10) || 0;
  const type = (body.type || '').trim().slice(0, 32);
  const title = (body.title || '').trim().slice(0, 64);

  if (!name || name.length > 12 || isNaN(x) || isNaN(y) || isNaN(plane)) {
    return res.status(400).json({ error: 'Missing or invalid name or waypoint (x, y, plane)' });
  }

  try {
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
      return send500(res, 'DATABASE_URL is not set.');
    }
    const sql = neon(process.env.DATABASE_URL);
    await sql`
      INSERT INTO location_updates (name, x, y, plane, world, type, title, updated_at)
      VALUES (${name}, ${x}, ${y}, ${plane}, ${world}, ${type}, ${title}, NOW())
      ON CONFLICT (name) DO UPDATE SET
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        plane = EXCLUDED.plane,
        world = EXCLUDED.world,
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        updated_at = NOW()
    `;
    const since = new Date(Date.now() - STALE_MS);
    const rows = await sql`
      SELECT name, x, y, plane, world, type, title, updated_at
      FROM location_updates
      WHERE updated_at > ${since}
      ORDER BY name
    `;
    const out = rows.map((r) => ({
      name: r.name,
      x: r.x,
      y: r.y,
      plane: r.plane,
      type: r.type || '',
      title: r.title || '',
      world: r.world,
      timestamp: new Date(r.updated_at).getTime(),
    }));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out);
  } catch (err) {
    console.error('/api/location/post', err);
    const msg = (err.message || String(err)).replace(/postgresql:\/\/[^@]+@/gi, '***@');
    const detail = msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('location_updates')
      ? 'Run sql/migration_location_updates.sql in Neon SQL Editor to create the table.'
      : msg;
    return send500(res, detail);
  }
};
