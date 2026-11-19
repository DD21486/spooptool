/**
 * Small leaderboard reads. Deltas are computed in Postgres so the wire
 * only carries the numbers that changed, not full hiscores snapshots.
 */

const { computeBossScore } = require('./spoopscore');

function asObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (err) { return {}; }
  }
  return value;
}

function emptyDelta(username, characterId) {
  return {
    username,
    characterId: characterId == null ? null : characterId,
    xpDelta: 0,
    bossKcDelta: 0,
    bossScoreDelta: 0,
    skillDeltas: {},
    bossDeltas: {},
  };
}

function shapeDelta(row) {
  const skillDeltas = {};
  for (const [key, value] of Object.entries(asObject(row.skill_deltas))) {
    const n = Number(value) || 0;
    if (key !== 'overall' && n > 0) skillDeltas[key] = n;
  }
  const firstBosses = {};
  const lastBosses = {};
  const bossDeltas = {};
  let bossKcDelta = 0;
  for (const [key, pair] of Object.entries(asObject(row.boss_edges))) {
    const first = Array.isArray(pair) ? Number(pair[0]) || 0 : 0;
    const last = Array.isArray(pair) ? Number(pair[1]) || 0 : 0;
    const gained = Math.max(0, last - first);
    bossKcDelta += gained;
    if (gained > 0) bossDeltas[key] = gained;
    firstBosses[key] = { count: first };
    lastBosses[key] = { count: last };
  }
  return {
    username: row.username,
    characterId: row.character_id,
    xpDelta: Math.max(0, Number(row.xp_delta) || 0),
    bossKcDelta,
    bossScoreDelta: Math.max(0, computeBossScore(lastBosses) - computeBossScore(firstBosses)),
    skillDeltas,
    bossDeltas,
  };
}

const HOME_PERIODS = ['hours24', 'today', 'week', 'month', 'lastWeek'];

async function loadHomeDeltas(sql) {
  const chars = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
  const rows = await sql`
    WITH periods AS (
      SELECT * FROM (VALUES
        ('hours24', NOW() - interval '24 hours', NOW() + interval '1 second'),
        ('today', date_trunc('day', NOW()), NOW() + interval '1 second'),
        ('week', (date_trunc('week', NOW() + interval '1 day') - interval '1 day'), NOW() + interval '1 second'),
        ('lastWeek', (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - interval '7 days', (date_trunc('week', NOW() + interval '1 day') - interval '1 day')),
        ('month', date_trunc('month', NOW()), NOW() + interval '1 second')
      ) AS v(period, start_at, end_at)
    ),
    firsts AS (
      SELECT DISTINCT ON (p.period, s.character_id)
        p.period, s.character_id, s.data AS data
      FROM periods p
      JOIN character_snapshots s ON s.at >= p.start_at AND s.at < p.end_at
      ORDER BY p.period, s.character_id, s.at ASC
    ),
    lasts AS (
      SELECT DISTINCT ON (p.period, s.character_id)
        p.period, s.character_id, s.data AS data
      FROM periods p
      JOIN character_snapshots s ON s.at >= p.start_at AND s.at < p.end_at
      ORDER BY p.period, s.character_id, s.at DESC
    )
    SELECT f.period, c.id AS character_id, c.username,
      GREATEST(0, COALESCE((l.data->'skills'->'overall'->>'xp')::bigint, 0)
        - COALESCE((f.data->'skills'->'overall'->>'xp')::bigint, 0)) AS xp_delta,
      (
        SELECT COALESCE(jsonb_object_agg(key, delta), '{}'::jsonb)
        FROM (
          SELECT COALESCE(fs.key, ls.key) AS key,
            GREATEST(0,
              COALESCE((ls.value->>'xp')::bigint, (ls.value->>'experience')::bigint, 0)
              - COALESCE((fs.value->>'xp')::bigint, (fs.value->>'experience')::bigint, 0)
            ) AS delta
          FROM jsonb_each(COALESCE(l.data->'skills', '{}'::jsonb)) ls
          FULL OUTER JOIN jsonb_each(COALESCE(f.data->'skills', '{}'::jsonb)) fs ON fs.key = ls.key
        ) d
        WHERE key IS DISTINCT FROM 'overall' AND delta > 0
      ) AS skill_deltas,
      (
        SELECT COALESCE(jsonb_object_agg(key, jsonb_build_array(first_kc, last_kc)), '{}'::jsonb)
        FROM (
          SELECT COALESCE(fb.key, lb.key) AS key,
            COALESCE((fb.value->>'count')::int, (fb.value->>'kc')::int, 0) AS first_kc,
            COALESCE((lb.value->>'count')::int, (lb.value->>'kc')::int, 0) AS last_kc
          FROM jsonb_each(COALESCE(l.data->'bosses', '{}'::jsonb)) lb
          FULL OUTER JOIN jsonb_each(COALESCE(f.data->'bosses', '{}'::jsonb)) fb ON fb.key = lb.key
        ) b
        WHERE last_kc IS DISTINCT FROM first_kc
      ) AS boss_edges
    FROM firsts f
    JOIN lasts l ON l.period = f.period AND l.character_id = f.character_id
    JOIN characters c ON c.id = f.character_id
  `;
  const byPeriod = {};
  for (const name of HOME_PERIODS) byPeriod[name] = {};
  for (const row of rows) {
    if (!byPeriod[row.period]) byPeriod[row.period] = {};
    byPeriod[row.period][row.username] = shapeDelta(row);
  }
  const periods = {};
  for (const name of HOME_PERIODS) {
    periods[name] = chars.map((c) => byPeriod[name][c.username] || emptyDelta(c.username, c.id));
  }
  return periods;
}

async function loadWeeklySeries(sql) {
  const rows = await sql`
    WITH periods AS (
      SELECT i::text AS period,
        (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - (i + 1) * interval '7 days' AS start_at,
        (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - i * interval '7 days' AS end_at
      FROM generate_series(0, 51) AS i
    ),
    firsts AS (
      SELECT DISTINCT ON (p.period, s.character_id)
        p.period, s.character_id, s.data AS data
      FROM periods p
      JOIN character_snapshots s ON s.at >= p.start_at AND s.at < p.end_at
      ORDER BY p.period, s.character_id, s.at ASC
    ),
    lasts AS (
      SELECT DISTINCT ON (p.period, s.character_id)
        p.period, s.character_id, s.data AS data
      FROM periods p
      JOIN character_snapshots s ON s.at >= p.start_at AND s.at < p.end_at
      ORDER BY p.period, s.character_id, s.at DESC
    )
    SELECT f.period, c.id AS character_id, c.username,
      GREATEST(0, COALESCE((l.data->'skills'->'overall'->>'xp')::bigint, 0)
        - COALESCE((f.data->'skills'->'overall'->>'xp')::bigint, 0)) AS xp_delta,
      (
        SELECT COALESCE(jsonb_object_agg(key, delta), '{}'::jsonb)
        FROM (
          SELECT COALESCE(fs.key, ls.key) AS key,
            GREATEST(0,
              COALESCE((ls.value->>'xp')::bigint, (ls.value->>'experience')::bigint, 0)
              - COALESCE((fs.value->>'xp')::bigint, (fs.value->>'experience')::bigint, 0)
            ) AS delta
          FROM jsonb_each(COALESCE(l.data->'skills', '{}'::jsonb)) ls
          FULL OUTER JOIN jsonb_each(COALESCE(f.data->'skills', '{}'::jsonb)) fs ON fs.key = ls.key
        ) d
        WHERE key IS DISTINCT FROM 'overall' AND delta > 0
      ) AS skill_deltas,
      (
        SELECT COALESCE(jsonb_object_agg(key, jsonb_build_array(first_kc, last_kc)), '{}'::jsonb)
        FROM (
          SELECT COALESCE(fb.key, lb.key) AS key,
            COALESCE((fb.value->>'count')::int, (fb.value->>'kc')::int, 0) AS first_kc,
            COALESCE((lb.value->>'count')::int, (lb.value->>'kc')::int, 0) AS last_kc
          FROM jsonb_each(COALESCE(l.data->'bosses', '{}'::jsonb)) lb
          FULL OUTER JOIN jsonb_each(COALESCE(f.data->'bosses', '{}'::jsonb)) fb ON fb.key = lb.key
        ) b
        WHERE last_kc IS DISTINCT FROM first_kc
      ) AS boss_edges
    FROM firsts f
    JOIN lasts l ON l.period = f.period AND l.character_id = f.character_id
    JOIN characters c ON c.id = f.character_id
  `;
  const lootRows = await sql`
    SELECT DISTINCT ON (idx) idx, username
    FROM (
      SELECT p.idx,
        MAX(TRIM(d.username)) AS username,
        SUM(d.total_value_gp)::bigint AS total
      FROM generate_series(0, 51) AS p(idx)
      JOIN loot_drops d
        ON d.at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - (p.idx + 1) * interval '7 days'
       AND d.at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - p.idx * interval '7 days'
      GROUP BY p.idx, LOWER(TRIM(d.username))
    ) s
    WHERE total > 0
    ORDER BY idx, total DESC
  `;
  const xp = Array(52).fill(null);
  const boss = Array(52).fill(null);
  const byWeek = new Map();
  for (const row of rows) {
    const idx = parseInt(row.period, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx > 51) continue;
    if (!byWeek.has(idx)) byWeek.set(idx, []);
    byWeek.get(idx).push(shapeDelta(row));
  }
  for (const [idx, list] of byWeek) {
    const xpWinner = list.filter((d) => d.xpDelta > 0).sort((a, b) => b.xpDelta - a.xpDelta)[0];
    const bossWinner = list.filter((d) => d.bossScoreDelta > 0).sort((a, b) => b.bossScoreDelta - a.bossScoreDelta)[0];
    xp[idx] = xpWinner ? xpWinner.username : null;
    boss[idx] = bossWinner ? bossWinner.username : null;
  }
  const loot = Array(52).fill(null);
  for (const row of lootRows) {
    const idx = Number(row.idx);
    if (Number.isInteger(idx) && idx >= 0 && idx < 52) loot[idx] = row.username;
  }
  const firstNonNull = (arr) => (arr && arr.find((x) => x != null && String(x).trim() !== '')) || null;
  return {
    xp,
    boss,
    loot,
    xpLatest: firstNonNull(xp),
    bossLatest: firstNonNull(boss),
    lootLatest: firstNonNull(loot),
  };
}

function boardFrom(rows, field) {
  return rows
    .map((row) => ({ username: row.username, totalValueGp: Number(row[field]) || 0 }))
    .filter((row) => row.totalValueGp > 0)
    .sort((a, b) => b.totalValueGp - a.totalValueGp);
}

async function loadLootBoards(sql) {
  const rows = await sql`
    SELECT
      MAX(TRIM(username)) AS username,
      COALESCE(SUM(total_value_gp), 0)::bigint AS total,
      COALESCE(SUM(total_value_gp) FILTER (WHERE at >= NOW() - interval '24 hours'), 0)::bigint AS hours24,
      COALESCE(SUM(total_value_gp) FILTER (WHERE at >= date_trunc('day', NOW())), 0)::bigint AS today,
      COALESCE(SUM(total_value_gp) FILTER (WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day')), 0)::bigint AS week,
      COALESCE(SUM(total_value_gp) FILTER (WHERE at >= date_trunc('month', NOW())), 0)::bigint AS month,
      COALESCE(SUM(total_value_gp) FILTER (
        WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - interval '7 days'
          AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
      ), 0)::bigint AS last_week
    FROM loot_drops
    GROUP BY LOWER(TRIM(username))
  `;
  return {
    total: boardFrom(rows, 'total'),
    hours24: boardFrom(rows, 'hours24'),
    today: boardFrom(rows, 'today'),
    week: boardFrom(rows, 'week'),
    month: boardFrom(rows, 'month'),
    lastWeek: boardFrom(rows, 'last_week'),
  };
}

module.exports = { loadHomeDeltas, loadWeeklySeries, loadLootBoards };
