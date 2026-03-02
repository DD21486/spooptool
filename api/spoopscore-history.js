/**
 * GET /api/spoopscore-history?name=Username
 * Returns SpoopScore over time (noon and 8pm snapshots) for the character.
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Feature disabled for now — SpoopScore over time chart not in use
  return res.status(404).json({ error: 'Not found' });

  const name = (req.query.name || req.query.username || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Name required' });

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  const sql = neon(process.env.DATABASE_URL);
  try {
    const charRows = await sql`SELECT id FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${name})) LIMIT 1`;
    if (charRows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const characterId = charRows[0].id;
    const rows = await sql`
      SELECT at_slot, spoop_score, boss_score, skill_score, pet_points
      FROM spoopscore_snapshots
      WHERE character_id = ${characterId}
      ORDER BY at_slot ASC
    `;
    const history = (rows || []).map((r) => ({
      at: r.at_slot,
      spoopScore: Number(r.spoop_score) || 0,
      bossScore: Number(r.boss_score) || 0,
      skillScore: Number(r.skill_score) || 0,
      petPoints: Number(r.pet_points) || 0,
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ history });
  } catch (err) {
    console.error('GET /api/spoopscore-history', err);
    return res.status(500).json({ error: 'Failed to load SpoopScore history' });
  }
};
