/**
 * GET /api/characters-with-snapshots
 * Returns character list with each character's latest snapshot (skills + bosses) for home page without hitting Hiscores.
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT c.id, c.username, c.game_mode, c.added_at, cs.data AS latest_snapshot
      FROM characters c
      LEFT JOIN LATERAL (
        SELECT data FROM character_snapshots
        WHERE character_id = c.id
        ORDER BY at DESC
        LIMIT 1
      ) cs ON true
      ORDER BY c.added_at ASC
    `;

    const characters = rows.map((r) => ({
      id: r.id,
      username: r.username,
      game_mode: r.game_mode,
      added_at: r.added_at,
      latestSnapshot: r.latest_snapshot ? { skills: r.latest_snapshot.skills || {}, bosses: r.latest_snapshot.bosses || {} } : null,
    }));

    let activity = [];
    try {
      const activityRows = await sql`
        SELECT at, username, type, description
        FROM activity_log
        ORDER BY at DESC
        LIMIT 30
      `;
      activity = activityRows.map((a) => ({
        at: a.at,
        username: a.username,
        type: a.type,
        description: a.description,
      }));
    } catch (_) {
      /* table may not exist */
    }

    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({ characters, activity });
  } catch (err) {
    console.error('/api/characters-with-snapshots', err);
    return res.status(500).json({ error: 'Failed to load characters' });
  }
};
