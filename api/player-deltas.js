/**
 * GET /api/player-deltas?name=Username&hours=24
 * Returns per-skill XP deltas and per-boss KC deltas for the character over the last N hours.
 * GET /api/player-history (rewrite → ?path=history): snapshot history for one character (totalXp or skill/boss series).
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

async function handlePlayerHistory(sql, req, res) {
  const name = (req.query.name || req.query.username || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Name required' });
  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 6));
  const skill = (req.query.skill || '').trim() || null;
  const boss = (req.query.boss || '').trim() || null;

  const chars = await sql`
    SELECT id FROM characters
    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${name}))
    LIMIT 1
  `;
  if (!chars.length) return res.status(404).json({ error: 'Character not found' });
  const characterId = chars[0].id;

  const formatLabel = (key) => (key || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  if (boss) {
    const rows = await sql`
      SELECT at, (data->'bosses'->${boss}->>'count')::int AS value
      FROM character_snapshots
      WHERE character_id = ${characterId}
        AND at >= NOW() - make_interval(hours => ${hours})
      ORDER BY at ASC
    `;
    const history = rows.map((r) => ({
      at: r.at instanceof Date ? r.at.toISOString() : r.at,
      value: r.value != null ? Number(r.value) : 0,
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({ history, seriesLabel: formatLabel(boss) + ' KC' });
  }

  if (skill) {
    const rows = await sql`
      SELECT at, COALESCE(
        (data->'skills'->${skill}->>'xp')::bigint,
        (data->'skills'->${skill}->>'experience')::bigint,
        0
      ) AS value
      FROM character_snapshots
      WHERE character_id = ${characterId}
        AND at >= NOW() - make_interval(hours => ${hours})
      ORDER BY at ASC
    `;
    const history = rows.map((r) => ({
      at: r.at instanceof Date ? r.at.toISOString() : r.at,
      value: r.value != null ? Number(r.value) : 0,
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({ history, seriesLabel: formatLabel(skill) + ' XP' });
  }

  const rows = await sql`
    SELECT at, (data->'skills'->'overall'->>'xp')::bigint AS total_xp
    FROM character_snapshots
    WHERE character_id = ${characterId}
      AND at >= NOW() - make_interval(hours => ${hours})
    ORDER BY at ASC
  `;
  const history = rows.map((r) => ({
    at: r.at instanceof Date ? r.at.toISOString() : r.at,
    totalXp: r.total_xp != null ? Number(r.total_xp) : 0,
  }));
  res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
  return res.status(200).json({ history });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const name = (req.query.name || req.query.username || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Name required' });

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  const path = (req.query.path || '').trim();
  if (path === 'history') {
    try {
      const sql = neon(process.env.DATABASE_URL);
      return await handlePlayerHistory(sql, req, res);
    } catch (err) {
      console.error('/api/player-history', err);
      return res.status(500).json({ error: 'Failed to load history' });
    }
  }

  const month = req.query.month === '1' || req.query.month === 'true';
  const hours = month ? null : Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));

  try {
    const sql = neon(process.env.DATABASE_URL);
    const chars = await sql`
      SELECT id FROM characters
      WHERE LOWER(TRIM(username)) = LOWER(TRIM(${name}))
      LIMIT 1
    `;
    if (!chars.length) return res.status(404).json({ error: 'Character not found' });
    const characterId = chars[0].id;

    const firstRow = month
      ? await sql`
          SELECT at, data
          FROM character_snapshots
          WHERE character_id = ${characterId}
            AND at >= date_trunc('month', NOW())
          ORDER BY at ASC
          LIMIT 1
        `
      : await sql`
          SELECT at, data
          FROM character_snapshots
          WHERE character_id = ${characterId}
            AND at >= NOW() - make_interval(hours => ${hours})
          ORDER BY at ASC
          LIMIT 1
        `;
    const lastRow = month
      ? await sql`
          SELECT at, data
          FROM character_snapshots
          WHERE character_id = ${characterId}
            AND at >= date_trunc('month', NOW())
          ORDER BY at DESC
          LIMIT 1
        `
      : await sql`
          SELECT at, data
          FROM character_snapshots
          WHERE character_id = ${characterId}
            AND at >= NOW() - make_interval(hours => ${hours})
          ORDER BY at DESC
          LIMIT 1
        `;

    const skillDeltas = {};
    const bossDeltas = {};

    if (firstRow.length && lastRow.length) {
      const first = firstRow[0].data;
      const last = lastRow[0].data;
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
