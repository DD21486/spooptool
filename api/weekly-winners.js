/**
 * GET /api/weekly-winners
 * Returns last week's leader usernames for XP, Boss KC, and Loot.
 * Used by the character page Awards section.
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

function xpFromData(data) {
  if (!data || !data.skills || !data.skills.overall) return 0;
  const x = data.skills.overall.xp;
  return x != null ? Number(x) : 0;
}

function totalBossKcFromData(data) {
  if (!data || !data.bosses) return 0;
  let sum = 0;
  for (const b of Object.values(data.bosses)) {
    if (b && typeof b.count === 'number') sum += b.count;
  }
  return sum;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const chars = await sql`SELECT id, username FROM characters ORDER BY id ASC`;

    const firstRows = await sql`
      SELECT DISTINCT ON (character_id) character_id, at, data
      FROM character_snapshots
      WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - interval '7 days'
        AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
      ORDER BY character_id, at ASC
    `;
    const lastRows = await sql`
      SELECT DISTINCT ON (character_id) character_id, at, data
      FROM character_snapshots
      WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - interval '7 days'
        AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
      ORDER BY character_id, at DESC
    `;

    const firstByChar = {};
    for (const r of firstRows) firstByChar[r.character_id] = r;
    const lastByChar = {};
    for (const r of lastRows) lastByChar[r.character_id] = r;

    const deltas = chars.map((c) => {
      const first = firstByChar[c.id];
      const last = lastByChar[c.id];
      if (!first || !last) return { username: c.username, xpDelta: 0, bossKcDelta: 0 };
      const firstData = first.data || {};
      const lastData = last.data || {};
      return {
        username: c.username,
        xpDelta: Math.max(0, xpFromData(lastData) - xpFromData(firstData)),
        bossKcDelta: Math.max(0, totalBossKcFromData(lastData) - totalBossKcFromData(firstData)),
      };
    });

    const lootRows = await sql`
      SELECT MAX(TRIM(username)) AS username, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
      FROM loot_drops
      WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - interval '7 days'
        AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
      GROUP BY LOWER(TRIM(username))
      ORDER BY total_value_gp DESC
    `;

    const xpWinner = deltas.filter((d) => d.xpDelta > 0).sort((a, b) => b.xpDelta - a.xpDelta)[0];
    const bossWinner = deltas.filter((d) => d.bossKcDelta > 0).sort((a, b) => b.bossKcDelta - a.bossKcDelta)[0];
    const lootWinner = lootRows[0];

    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({
      xp: xpWinner ? xpWinner.username : null,
      boss: bossWinner ? bossWinner.username : null,
      loot: lootWinner && lootWinner.username ? lootWinner.username : null,
    });
  } catch (err) {
    console.error('GET /api/weekly-winners', err);
    return res.status(500).json({ error: 'Failed to load weekly winners' });
  }
};
