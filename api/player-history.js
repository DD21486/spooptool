/**
 * GET /api/player-history?name=Username&hours=6
 * Returns snapshot history for the character: { history: [ { at, totalXp }, ... ] } for the last N hours.
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

  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 6));
  const skill = (req.query.skill || '').trim() || null;
  const boss = (req.query.boss || '').trim() || null;

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

    const formatLabel = (key) => (key || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    if (boss) {
      const history = rows.map((r) => {
        const data = r.data && r.data.bosses && r.data.bosses[boss];
        const val = data && typeof data.count === 'number' ? data.count : 0;
        return { at: r.at instanceof Date ? r.at.toISOString() : r.at, value: val };
      });
      return res.status(200).json({ history, seriesLabel: formatLabel(boss) + ' KC' });
    }

    if (skill) {
      const history = rows.map((r) => {
        const data = r.data && r.data.skills && r.data.skills[skill];
        const val = data && (data.xp != null || data.experience != null)
          ? Number(data.xp != null ? data.xp : data.experience)
          : 0;
        return { at: r.at instanceof Date ? r.at.toISOString() : r.at, value: val };
      });
      return res.status(200).json({ history, seriesLabel: formatLabel(skill) + ' XP' });
    }

    const history = rows.map((r) => {
      const xp = r.data && r.data.skills && r.data.skills.overall && (r.data.skills.overall.xp != null)
        ? Number(r.data.skills.overall.xp)
        : 0;
      return { at: r.at instanceof Date ? r.at.toISOString() : r.at, totalXp: xp };
    });

    return res.status(200).json({ history });
  } catch (err) {
    console.error('/api/player-history', err);
    return res.status(500).json({ error: 'Failed to load history' });
  }
};
