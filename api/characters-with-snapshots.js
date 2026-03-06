/**
 * GET /api/characters-with-snapshots
 *   Returns character list with each character's latest snapshot for the home page.
 *
 * GET /api/character-snapshot?name=Username   (via rewrite in vercel.json)
 *   Returns a single character's latest snapshot. Same shape as /api/player/[name].
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

async function handleSingleSnapshot(req, res, sql) {
  const name = (req.query.name || req.query.username || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Name required' });

  let rows;
  try {
    rows = await sql`
      SELECT c.username, c.game_mode, COALESCE(c.luck_score, 0) AS luck_score, cs.data
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
  } catch (colErr) {
    if (colErr && (colErr.message || '').includes('luck_score')) {
      rows = await sql`
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
      if (rows.length) rows[0].luck_score = 0;
    } else {
      throw colErr;
    }
  }

  if (!rows.length) return res.status(404).json({ error: 'Character not found' });

  const r = rows[0];
  const data = r.data || {};
  res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
  return res.status(200).json({
    name:      r.username,
    mode:      r.game_mode || 'main',
    skills:    data.skills || {},
    bosses:    data.bosses || {},
    luckScore: Number(r.luck_score) || 0,
  });
}

async function handleList(req, res, sql) {
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
    id:             r.id,
    username:       r.username,
    game_mode:      r.game_mode,
    added_at:       r.added_at,
    latestSnapshot: r.latest_snapshot
      ? { skills: r.latest_snapshot.skills || {}, bosses: r.latest_snapshot.bosses || {} }
      : null,
  }));

  let activity = [];
  try {
    const activityRows = await sql`
      SELECT at, username, type, description
      FROM activity_log
      ORDER BY at DESC
      LIMIT 50
    `;
    activity = activityRows.map((a) => ({
      at:          a.at,
      username:    a.username,
      type:        a.type,
      description: a.description,
    }));
  } catch (_) {
    /* table may not exist */
  }

  res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
  return res.status(200).json({ characters, activity });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    if (req.query.name || req.query.username) {
      return await handleSingleSnapshot(req, res, sql);
    }
    return await handleList(req, res, sql);
  } catch (err) {
    console.error('/api/characters-with-snapshots', err);
    return res.status(500).json({ error: 'Failed to load characters' });
  }
};
