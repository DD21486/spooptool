/**
 * GET /api/characters-deltas?hours=24
 * Returns per-character XP and boss KC deltas over the last N hours (earliest vs latest snapshot).
 * Response: { deltas: [ { username, xpDelta, bossKcDelta }, ... ] }
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

function totalBossKcFromData(data) {
  if (!data || !data.bosses) return 0;
  let sum = 0;
  for (const b of Object.values(data.bosses)) {
    if (b && typeof b.count === 'number') sum += b.count;
  }
  return sum;
}

function xpFromData(data) {
  if (!data || !data.skills || !data.skills.overall) return 0;
  const x = data.skills.overall.xp;
  return x != null ? Number(x) : 0;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const chars = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
    const rows = await sql`
      SELECT character_id, at, data
      FROM character_snapshots
      WHERE at >= NOW() - make_interval(hours => ${hours})
      ORDER BY character_id, at ASC
    `;

    const byChar = {};
    for (const r of rows) {
      const cid = r.character_id;
      if (!byChar[cid]) byChar[cid] = [];
      byChar[cid].push(r);
    }

    const deltas = chars.map((c) => {
      const snaps = byChar[c.id] || [];
      if (snaps.length === 0) return { username: c.username, xpDelta: 0, bossKcDelta: 0 };
      const first = snaps[0];
      const last = snaps[snaps.length - 1];
      const firstXp = xpFromData(first.data);
      const lastXp = xpFromData(last.data);
      const firstKc = totalBossKcFromData(first.data);
      const lastKc = totalBossKcFromData(last.data);
      return {
        username: c.username,
        xpDelta: Math.max(0, lastXp - firstXp),
        bossKcDelta: Math.max(0, lastKc - firstKc),
      };
    });

    return res.status(200).json({ deltas });
  } catch (err) {
    console.error('/api/characters-deltas', err);
    return res.status(500).json({ error: 'Failed to load deltas' });
  }
};
