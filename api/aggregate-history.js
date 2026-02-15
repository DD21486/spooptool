/**
 * GET /api/aggregate-history?hours=24
 * Returns bucketed time series of combined total XP and total boss KC across all characters for the last N hours.
 * Response: { history: [ { at, totalXp, totalBossKc }, ... ] } with one point per 15-minute bucket.
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

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));
  const bucketMinutes = 15;

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT character_id, at, data
      FROM character_snapshots
      WHERE at >= NOW() - make_interval(hours => ${hours})
      ORDER BY at ASC
    `;

    const now = new Date();
    const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const buckets = [];
    for (let t = new Date(start); t <= now; t.setMinutes(t.getMinutes() + bucketMinutes)) {
      buckets.push(new Date(t.getTime()));
    }
    if (buckets.length === 0) buckets.push(new Date(start));

    const characterIds = [...new Set(rows.map((r) => r.character_id))];
    const history = buckets.map((bucketEnd) => {
      let totalXp = 0;
      let totalBossKc = 0;
      for (const cid of characterIds) {
        const characterRows = rows.filter((r) => r.character_id === cid && new Date(r.at) <= bucketEnd);
        if (characterRows.length === 0) continue;
        const latest = characterRows[characterRows.length - 1];
        const data = latest.data;
        if (data && data.skills && data.skills.overall && data.skills.overall.xp != null) {
          totalXp += Number(data.skills.overall.xp);
        }
        totalBossKc += totalBossKcFromData(data);
      }
      return {
        at: bucketEnd.toISOString(),
        totalXp,
        totalBossKc,
      };
    });

    return res.status(200).json({ history });
  } catch (err) {
    console.error('/api/aggregate-history', err);
    return res.status(500).json({ error: 'Failed to load aggregate history' });
  }
};
