/**
 * GET /api/aggregate-history?hours=24
 * Returns bucketed time series of combined total XP and total boss KC across all characters for the last N hours.
 * Response: { history: [ { at, totalXp, totalBossKc }, ... ] } with one point per 15-minute bucket.
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const today = req.query.today === '1' || req.query.today === 'true';
  const week = req.query.week === '1' || req.query.week === 'true';
  const hours = (today || week) ? null : Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));
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
        SELECT character_id, at,
          (data->'skills'->'overall'->>'xp')::bigint AS xp,
          (SELECT COALESCE(SUM((elem->'count')::int), 0) FROM jsonb_each(data->'bosses') AS t(k, elem)) AS boss_kc
        FROM character_snapshots
        WHERE at >= date_trunc('day', NOW())
        ORDER BY at ASC
      `;
    } else if (week) {
      rows = await sql`
        SELECT character_id, at,
          (data->'skills'->'overall'->>'xp')::bigint AS xp,
          (SELECT COALESCE(SUM((elem->'count')::int), 0) FROM jsonb_each(data->'bosses') AS t(k, elem)) AS boss_kc
        FROM character_snapshots
        WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
        ORDER BY at ASC
      `;
      const startRow = await sql`SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day') AS t`;
      start = startRow.length && startRow[0].t ? new Date(startRow[0].t) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      const fetchHours = hours + 1;
      start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      rows = await sql`
        SELECT character_id, at,
          (data->'skills'->'overall'->>'xp')::bigint AS xp,
          (SELECT COALESCE(SUM((elem->'count')::int), 0) FROM jsonb_each(data->'bosses') AS t(k, elem)) AS boss_kc
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
        totalXp += Number(latest.xp) || 0;
        totalBossKc += Number(latest.boss_kc) || 0;
      }
      return {
        at: bucketEnd.toISOString(),
        totalXp,
        totalBossKc,
      };
    });

    const periodFilter = today || week ? null : (hours === 24 || hours === 168 ? hours : 24);
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
        : week
          ? await sql`
              SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
              FROM loot_drops
              WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
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

    let cronHealth = { ok: false, lastRunAt: null };
    try {
      const heartbeatRows = await sql`SELECT last_run_at FROM cron_heartbeat WHERE job_name = 'snapshot' LIMIT 1`;
      const lastRunAt = heartbeatRows.length ? heartbeatRows[0].last_run_at : null;
      const staleMs = 2.5 * 60 * 60 * 1000;
      const atMs = lastRunAt ? new Date(lastRunAt).getTime() : 0;
      cronHealth = {
        ok: atMs > 0 && Date.now() - atMs < staleMs,
        lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
      };
    } catch (_) {
      /* cron_heartbeat table may not exist */
    }

    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({ history, lootHistory, cronHealth });
  } catch (err) {
    console.error('/api/aggregate-history', err);
    return res.status(500).json({ error: 'Failed to load aggregate history' });
  }
};
