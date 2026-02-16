/**
 * GET /api/character-snapshot?name=Username
 * Returns a single character's latest snapshot from the DB (no Hiscores).
 * Same shape as /api/player/[name] for skills/bosses so the character page can use it.
 * Response: { name, mode, skills, bosses }
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

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT c.username, c.game_mode, cs.data
      FROM characters c
      LEFT JOIN LATERAL (
        SELECT data FROM character_snapshots
        WHERE character_id = c.id
        ORDER BY at DESC
        LIMIT 1
      ) cs ON true
      WHERE LOWER(TRIM(c.username)) = LOWER(TRIM(${name}))
      LIMIT 1
    `;
    if (!rows.length) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const r = rows[0];
    const data = r.data || {};
    const skills = data.skills || {};
    const bosses = data.bosses || {};

    const out = {
      name: r.username,
      mode: r.game_mode || 'main',
      skills,
      bosses,
    };
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json(out);
  } catch (err) {
    console.error('/api/character-snapshot', err);
    return res.status(500).json({ error: 'Failed to load character' });
  }
};
