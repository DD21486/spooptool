/**
 * Weekly awards cron: compute last completed week's winners (XP, Boss KC, Loot)
 * and increment each winner's count on their character profile. Idempotent: uses
 * weekly_awards_log so we only award once per week per category.
 *
 * Vercel doesn't run crons; use an external scheduler (e.g. cron-job.org):
 * - URL: https://your-app.vercel.app/api/cron/weekly-awards
 * - Schedule: once per week (e.g. Monday 00:05 UTC)
 * - Auth: add ?secret=YOUR_CRON_SECRET to the URL, or set Authorization: Bearer YOUR_CRON_SECRET
 */

const { neon } = require('@neondatabase/serverless');

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

function authorize(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: 'CRON_SECRET not set' };
  const auth = req.headers.authorization;
  const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const q = req.query && req.query.secret;
  if ((bearer && bearer === secret) || (q && q === secret)) return { ok: true };
  return { ok: false, reason: 'Invalid or missing secret' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorize(req);
  if (!auth.ok) {
    return res.status(401).json({ error: 'Unauthorized', detail: auth.reason });
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  const sql = neon(process.env.DATABASE_URL);

  const weekEndRow = await sql`SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day')::date AS week_end`;
  const weekEnd = weekEndRow.length && weekEndRow[0].week_end ? weekEndRow[0].week_end : null;
  if (!weekEnd) {
    return res.status(200).json({ ok: true, message: 'Could not determine week end', awarded: {} });
  }

  const windowStart = new Date(weekEnd);
  windowStart.setDate(windowStart.getDate() - 7);
  const windowEnd = new Date(weekEnd);
  windowEnd.setDate(windowEnd.getDate() + 1);

  const chars = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
  if (chars.length === 0) {
    return res.status(200).json({ ok: true, weekEnd: weekEnd.toISOString().slice(0, 10), awarded: {} });
  }

  const snapshotRows = await sql`
    SELECT character_id, at, data
    FROM character_snapshots
    WHERE at >= ${windowStart} AND at < ${windowEnd}
    ORDER BY at ASC
  `;

  const firstByChar = {};
  const lastByChar = {};
  for (const r of snapshotRows) {
    const cid = r.character_id;
    if (!firstByChar[cid]) firstByChar[cid] = r;
    lastByChar[cid] = r;
  }

  const deltas = chars.map((c) => {
    const first = firstByChar[c.id];
    const last = lastByChar[c.id];
    if (!first || !last) return { character_id: c.id, username: c.username, xpDelta: 0, bossKcDelta: 0 };
    const firstData = first.data || {};
    const lastData = last.data || {};
    return {
      character_id: c.id,
      username: c.username,
      xpDelta: Math.max(0, xpFromData(lastData) - xpFromData(firstData)),
      bossKcDelta: Math.max(0, totalBossKcFromData(lastData) - totalBossKcFromData(firstData)),
    };
  });

  const xpWinner = deltas.filter((d) => d.xpDelta > 0).sort((a, b) => b.xpDelta - a.xpDelta)[0];
  const bossWinner = deltas.filter((d) => d.bossKcDelta > 0).sort((a, b) => b.bossKcDelta - a.bossKcDelta)[0];

  const lootRows = await sql`
    SELECT LOWER(TRIM(username)) AS key_username, MAX(TRIM(username)) AS username, at, total_value_gp
    FROM loot_drops
    WHERE at >= ${windowStart} AND at < ${windowEnd}
  `;
  const lootByUser = {};
  for (const r of lootRows) {
    const u = (r.key_username || r.username || '').trim();
    if (!u) continue;
    if (!lootByUser[u]) lootByUser[u] = { username: (r.username || u).trim(), total: 0 };
    lootByUser[u].total += Number(r.total_value_gp) || 0;
  }
  const lootSorted = Object.values(lootByUser).filter((o) => o.total > 0).sort((a, b) => b.total - a.total);
  const lootWinnerUsername = lootSorted[0] ? lootSorted[0].username : null;

  const awarded = { xp: null, boss: null, loot: null };

  if (xpWinner) {
    const logInsert = await sql`
      INSERT INTO weekly_awards_log (week_end, category, character_id)
      VALUES (${weekEnd}, 'xp', ${xpWinner.character_id})
      ON CONFLICT (week_end, category) DO NOTHING
      RETURNING character_id
    `;
    if (logInsert.length > 0) {
      await sql`
        UPDATE characters SET weekly_xp_wins = weekly_xp_wins + 1 WHERE id = ${xpWinner.character_id}
      `;
      awarded.xp = xpWinner.username;
    }
  }

  if (bossWinner) {
    const logInsert = await sql`
      INSERT INTO weekly_awards_log (week_end, category, character_id)
      VALUES (${weekEnd}, 'boss', ${bossWinner.character_id})
      ON CONFLICT (week_end, category) DO NOTHING
      RETURNING character_id
    `;
    if (logInsert.length > 0) {
      await sql`
        UPDATE characters SET weekly_boss_wins = weekly_boss_wins + 1 WHERE id = ${bossWinner.character_id}
      `;
      awarded.boss = bossWinner.username;
    }
  }

  let lootCharId = null;
  if (lootWinnerUsername) {
    const charMatch = await sql`
      SELECT id FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${lootWinnerUsername})) LIMIT 1
    `;
    if (charMatch.length) lootCharId = charMatch[0].id;
  }
  if (lootCharId != null) {
    const logInsert = await sql`
      INSERT INTO weekly_awards_log (week_end, category, character_id)
      VALUES (${weekEnd}, 'loot', ${lootCharId})
      ON CONFLICT (week_end, category) DO NOTHING
      RETURNING character_id
    `;
    if (logInsert.length > 0) {
      await sql`
        UPDATE characters SET weekly_loot_wins = weekly_loot_wins + 1 WHERE id = ${lootCharId}
      `;
      const rows = await sql`SELECT username FROM characters WHERE id = ${lootCharId}`;
      if (rows.length) awarded.loot = rows[0].username;
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    weekEnd: weekEnd.toISOString().slice(0, 10),
    awarded,
  });
};
