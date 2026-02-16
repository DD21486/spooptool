/**
 * GET /api/player-deltas?name=Username&hours=24
 * Returns per-skill XP deltas and per-boss KC deltas for the character over the last N hours.
 * Response: { skillDeltas: { overall: 123, attack: 456, ... }, bossDeltas: { vorkath: 10, ... } }
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const name = (req.query.name || req.query.username || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Name required' });

  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const chars = await sql`
      SELECT id FROM characters
      WHERE LOWER(TRIM(username)) = LOWER(TRIM(${name}))
      LIMIT 1
    `;
    if (!chars.length) return res.status(404).json({ error: 'Character not found' });
    const characterId = chars[0].id;

    const rows = await sql`
      SELECT at, data
      FROM character_snapshots
      WHERE character_id = ${characterId}
        AND at >= NOW() - make_interval(hours => ${hours})
      ORDER BY at ASC
    `;

    const skillDeltas = {};
    const bossDeltas = {};

    if (rows.length >= 2) {
      const first = rows[0].data;
      const last = rows[rows.length - 1].data;
      const firstSkills = (first && first.skills) || {};
      const lastSkills = (last && last.skills) || {};
      const skillKeys = new Set([...Object.keys(firstSkills), ...Object.keys(lastSkills)]);
      for (const key of skillKeys) {
        const f = firstSkills[key] && firstSkills[key].xp != null ? Number(firstSkills[key].xp) : 0;
        const l = lastSkills[key] && lastSkills[key].xp != null ? Number(lastSkills[key].xp) : 0;
        const delta = Math.max(0, l - f);
        if (delta > 0) skillDeltas[key] = delta;
      }
      const firstBosses = (first && first.bosses) || {};
      const lastBosses = (last && last.bosses) || {};
      const bossKeys = new Set([...Object.keys(firstBosses), ...Object.keys(lastBosses)]);
      for (const key of bossKeys) {
        const fc = firstBosses[key] && typeof firstBosses[key].count === 'number' ? firstBosses[key].count : 0;
        const lc = lastBosses[key] && typeof lastBosses[key].count === 'number' ? lastBosses[key].count : 0;
        const delta = Math.max(0, lc - fc);
        if (delta > 0) bossDeltas[key] = delta;
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({ skillDeltas, bossDeltas });
  } catch (err) {
    console.error('/api/player-deltas', err);
    return res.status(500).json({ error: 'Failed to load deltas' });
  }
};
