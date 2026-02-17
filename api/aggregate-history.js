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

  const today = req.query.today === '1' || req.query.today === 'true';
  const hours = today ? null : Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));
  const bucketMinutes = 15;

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const now = new Date();
    let start;
    let rows;
    if (today) {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      rows = await sql`
        SELECT character_id, at, data
        FROM character_snapshots
        WHERE at >= date_trunc('day', NOW())
        ORDER BY at ASC
      `;
    } else {
      const fetchHours = hours + 1;
      start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      rows = await sql`
        SELECT character_id, at, data
        FROM character_snapshots
        WHERE at >= NOW() - make_interval(hours => ${fetchHours})
        ORDER BY at ASC
      `;
    }

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

    const periodFilter = today ? null : (hours === 24 || hours === 168 ? hours : 24);
    let lootHistory = [];
    try {
      const lootBuckets = today
        ? await sql`
            SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
            FROM loot_drops
            WHERE at >= date_trunc('day', NOW())
            GROUP BY date_trunc('hour', at)
            ORDER BY bucket ASC
          `
        : await sql`
            SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
            FROM loot_drops
            WHERE at >= NOW() - make_interval(hours => ${periodFilter})
            GROUP BY date_trunc('hour', at)
            ORDER BY bucket ASC
          `;
      let cum = 0;
      lootHistory = lootBuckets.map((r) => {
        cum += Number(r.value || 0);
        return { at: r.bucket, value: cum };
      });
    } catch (lootErr) {
      console.error('aggregate-history lootHistory', lootErr);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({ history, lootHistory });
  } catch (err) {
    console.error('/api/aggregate-history', err);
    return res.status(500).json({ error: 'Failed to load aggregate history' });
  }
};
