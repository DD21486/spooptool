/**
 * Snapshot job: fetch current Hiscores for each character and store in character_snapshots.
 * Call with Authorization: Bearer <CRON_SECRET> (or ?secret=CRON_SECRET).
 * - External cron (e.g. cron-job.org): hit this URL hourly for snapshots.
 * - Snapshots are append-only; all queries use "latest" or "last N hours". Loot is saved only via Dink webhook (no cron).
 *
 * Weekly awards (same function, no extra serverless): add ?weekly_awards=1 to run only the weekly-award
 * logic (increment medal counts for last week's winners). Schedule that URL once per week (e.g. Monday 00:05 UTC).
 *
 * Retention (run after each snapshot run):
 * - Keep all snapshots from the last 30 days.
 * - Older than 30 days: keep one snapshot per character per calendar month (the latest in that month) for yearly summaries.
 */

const { neon } = require('@neondatabase/serverless');
const { getStats } = require('osrs-json-hiscores');
const { insertActivity, pruneTo50 } = require('../../lib/activity-log');
const { computeSpoopScore } = require('../../lib/spoopscore');

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

async function runWeeklyAwards(sql, res) {
  const weekEndRow = await sql`SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day')::date AS week_end`;
  const weekEnd = weekEndRow.length && weekEndRow[0].week_end ? weekEndRow[0].week_end : null;
  if (!weekEnd) {
    return res.status(200).json({ ok: true, mode: 'weekly_awards', message: 'Could not determine week end', awarded: {} });
  }
  const windowStart = new Date(weekEnd);
  windowStart.setDate(windowStart.getDate() - 7);
  const windowEnd = new Date(weekEnd);
  windowEnd.setDate(windowEnd.getDate() + 1);

  const chars = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
  if (chars.length === 0) {
    return res.status(200).json({ ok: true, mode: 'weekly_awards', weekEnd: String(weekEnd), awarded: {} });
  }

  const snapshotRows = await sql`
    SELECT character_id, at, data FROM character_snapshots
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
    FROM loot_drops WHERE at >= ${windowStart} AND at < ${windowEnd}
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
      ON CONFLICT (week_end, category) DO NOTHING RETURNING character_id
    `;
    if (logInsert.length > 0) {
      await sql`UPDATE characters SET weekly_xp_wins = weekly_xp_wins + 1 WHERE id = ${xpWinner.character_id}`;
      awarded.xp = xpWinner.username;
    }
  }
  if (bossWinner) {
    const logInsert = await sql`
      INSERT INTO weekly_awards_log (week_end, category, character_id)
      VALUES (${weekEnd}, 'boss', ${bossWinner.character_id})
      ON CONFLICT (week_end, category) DO NOTHING RETURNING character_id
    `;
    if (logInsert.length > 0) {
      await sql`UPDATE characters SET weekly_boss_wins = weekly_boss_wins + 1 WHERE id = ${bossWinner.character_id}`;
      awarded.boss = bossWinner.username;
    }
  }
  let lootCharId = null;
  if (lootWinnerUsername) {
    const charMatch = await sql`SELECT id FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${lootWinnerUsername})) LIMIT 1`;
    if (charMatch.length) lootCharId = charMatch[0].id;
  }
  if (lootCharId != null) {
    const logInsert = await sql`
      INSERT INTO weekly_awards_log (week_end, category, character_id)
      VALUES (${weekEnd}, 'loot', ${lootCharId})
      ON CONFLICT (week_end, category) DO NOTHING RETURNING character_id
    `;
    if (logInsert.length > 0) {
      await sql`UPDATE characters SET weekly_loot_wins = weekly_loot_wins + 1 WHERE id = ${lootCharId}`;
      const rows = await sql`SELECT username FROM characters WHERE id = ${lootCharId}`;
      if (rows.length) awarded.loot = rows[0].username;
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, mode: 'weekly_awards', weekEnd: String(weekEnd), awarded });
}

/** Delay between batches of parallel requests (to avoid Hiscores rate limit). */
const DELAY_MS_BETWEEN_BATCHES = 800;
/** How many characters to fetch in parallel per batch. Tuned so 10 characters finish in ~10–15s (under cron-job.org 30s timeout including cold start). */
const BATCH_CONCURRENCY = 5;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Process array in chunks of size n. */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
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

/** Build snapshot payload: skills (rank, level, xp) and bosses (rank, count) for storage. */
function buildSnapshotData(player) {
  if (!player || !player.main) return null;
  const skills = {};
  for (const [key, data] of Object.entries(player.main.skills || {})) {
    skills[key] = {
      rank: data.rank,
      level: data.level,
      xp: data.xp != null ? data.xp : data.experience,
    };
  }
  const bosses = {};
  for (const [key, b] of Object.entries(player.main.bosses || {})) {
    if (b && typeof b === 'object') {
      const raw = b.score != null ? b.score : (b.count != null ? b.count : b.kc);
      const count = typeof raw === 'number' ? raw : parseInt(raw, 10);
      bosses[key] = { rank: b.rank, count: Number.isFinite(count) && count >= 0 ? count : 0 };
    }
  }
  return { skills, bosses };
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

  if (req.query.weekly_awards === '1' || req.query.weekly_awards === 'true') {
    return await runWeeklyAwards(sql, res);
  }

  let characters = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
  if (characters.length === 0) {
    return res.status(200).json({ ok: true, snapshots: 0, message: 'No characters' });
  }

  const limitParam = parseInt(req.query.limit, 10);
  const limit = Number.isNaN(limitParam) || limitParam < 1
    ? Math.min(characters.length, 100)
    : Math.min(limitParam, 100);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const setLuckBaseline = req.query.set_luck_baseline === '1' || req.query.set_luck_baseline === 'true';
  characters = characters.slice(offset, offset + limit);

  let written = 0;
  const errors = [];
  const batches = chunk(characters, BATCH_CONCURRENCY);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const results = await Promise.all(
      batch.map(async (row) => {
        try {
          const player = await getStats(row.username);
          const data = buildSnapshotData(player);
          if (data) {
            await sql`INSERT INTO character_snapshots (character_id, at, data) VALUES (${row.id}, NOW(), ${JSON.stringify(data)})`;
            return { ok: true };
          }
          return { ok: false };
        } catch (e) {
          return { ok: false, username: row.username, error: (e.message || String(e)).slice(0, 100) };
        }
      })
    );
    for (const r of results) {
      if (r.ok) written += 1;
      else if (r.username) errors.push({ username: r.username, error: r.error });
    }
    if (i < batches.length - 1) await delay(DELAY_MS_BETWEEN_BATCHES);
  }

  try {
    for (const row of characters) {
      const snapRows = await sql`
        SELECT data FROM character_snapshots
        WHERE character_id = ${row.id}
        ORDER BY at DESC
        LIMIT 2
      `;
      if (snapRows.length < 2) continue;
      const prev = snapRows[1].data || {};
      const curr = snapRows[0].data || {};
      const prevSkills = prev.skills || {};
      const currSkills = curr.skills || {};
      const prevBosses = prev.bosses || {};
      const currBosses = curr.bosses || {};
      const prevXp = (prevSkills.overall && (prevSkills.overall.xp != null ? prevSkills.overall.xp : prevSkills.overall.experience)) || 0;
      const currXp = (currSkills.overall && (currSkills.overall.xp != null ? currSkills.overall.xp : currSkills.overall.experience)) || 0;
      const xpDelta = Math.max(0, Number(currXp) - Number(prevXp));
      const bossDeltas = [];
      for (const [key, b] of Object.entries(currBosses)) {
        if (!b || typeof b !== 'object') continue;
        const currKc = b.count != null ? b.count : (b.kc != null ? b.kc : 0);
        const prevKc = (prevBosses[key] && (prevBosses[key].count != null ? prevBosses[key].count : prevBosses[key].kc)) != null ? (prevBosses[key].count ?? prevBosses[key].kc) : 0;
        const delta = Math.max(0, Number(currKc) - Number(prevKc));
        if (delta > 0) bossDeltas.push({ key, delta });
      }
      if (xpDelta === 0 && bossDeltas.length === 0) continue;
      const parts = [];
      if (xpDelta > 0) parts.push('+' + (xpDelta >= 1e6 ? (xpDelta / 1e6).toFixed(1) + 'M' : xpDelta >= 1e3 ? (xpDelta / 1e3).toFixed(1) + 'K' : xpDelta) + ' overall XP');
      bossDeltas.forEach(({ key, delta }) => parts.push('+' + delta + ' ' + key));
      const description = parts.join(', ');
      await insertActivity(sql, { username: row.username, type: 'xp_kc', description });
    }
    await pruneTo50(sql);
  } catch (activityErr) {
    console.error('activity_log xp_kc', activityErr?.message || activityErr);
  }

  let baselineUpdated = 0;
  if (setLuckBaseline) {
    try {
      const latest = await sql`
        SELECT DISTINCT ON (character_id) character_id, data
        FROM character_snapshots
        ORDER BY character_id, at DESC
      `;
      for (const row of latest) {
        const bosses = (row.data && row.data.bosses) || {};
        for (const [bossKey, b] of Object.entries(bosses)) {
          if (!b || typeof b !== 'object') continue;
          const kc = b.count != null ? b.count : (b.kc != null ? b.kc : 0);
          if (!Number.isFinite(kc) || kc < 0) continue;
          try {
            await sql`
              INSERT INTO luck_baseline (character_id, boss_key, kill_count, snapshot_at)
              VALUES (${row.character_id}, ${bossKey.trim().substring(0, 128)}, ${kc}, NOW())
              ON CONFLICT (character_id, boss_key) DO UPDATE SET
                kill_count = EXCLUDED.kill_count,
                snapshot_at = EXCLUDED.snapshot_at
            `;
            baselineUpdated += 1;
          } catch (_) {
            /* table or column may not exist yet */
          }
        }
      }
    } catch (baselineErr) {
      console.error('set_luck_baseline failed', baselineErr?.message || baselineErr);
    }
  }

  /** SpoopScore snapshots: one row per character per 6-hour UTC slot (0, 6, 12, 18). Upsert so we get ~4 points per day for the 7-day chart. */
  let spoopScoreWritten = 0;
  try {
    const slotDate = new Date();
    slotDate.setUTCMinutes(0, 0, 0);
    slotDate.setUTCHours(Math.floor(slotDate.getUTCHours() / 6) * 6, 0, 0, 0);
    const atSlot = slotDate.toISOString();
    const latestRows = await sql`
      SELECT DISTINCT ON (cs.character_id) cs.character_id, cs.data, c.username
      FROM character_snapshots cs
      JOIN characters c ON c.id = cs.character_id
      ORDER BY cs.character_id, cs.at DESC
    `;
    for (const row of latestRows || []) {
      const data = row.data || {};
      const skills = data.skills || {};
      const bosses = data.bosses || {};
      const username = row.username != null ? String(row.username).trim() : null;
      const { spoopScore, bossScore, skillScore, petPoints } = computeSpoopScore(skills, bosses, username);
      await sql`
        INSERT INTO spoopscore_snapshots (character_id, at_slot, spoop_score, boss_score, skill_score, pet_points)
        VALUES (${row.character_id}, ${atSlot}::timestamptz, ${spoopScore}, ${bossScore}, ${skillScore}, ${petPoints})
        ON CONFLICT (character_id, at_slot) DO UPDATE SET
          spoop_score = EXCLUDED.spoop_score,
          boss_score = EXCLUDED.boss_score,
          skill_score = EXCLUDED.skill_score,
          pet_points = EXCLUDED.pet_points
      `;
      spoopScoreWritten += 1;
    }
  } catch (spoopErr) {
    console.error('spoopscore_snapshots write', spoopErr?.message || spoopErr);
  }

  try {
    await sql`
      INSERT INTO cron_heartbeat (job_name, last_run_at) VALUES ('snapshot', NOW())
      ON CONFLICT (job_name) DO UPDATE SET last_run_at = NOW()
    `;
  } catch (heartbeatErr) {
    /* table may not exist yet; don't fail the response */
  }

  /** Retention: keep last 30 days in full; older than 30 days keep one per character per month (latest in that month). */
  let pruneDeleted = 0;
  try {
    const pruneResult = await sql`
      WITH keep AS (
        SELECT DISTINCT ON (character_id, date_trunc('month', at))
          id
        FROM character_snapshots
        WHERE at < NOW() - interval '30 days'
        ORDER BY character_id, date_trunc('month', at), at DESC
      )
      DELETE FROM character_snapshots
      WHERE at < NOW() - interval '30 days'
        AND id NOT IN (SELECT id FROM keep)
    `;
    pruneDeleted = typeof pruneResult.rowCount === 'number' ? pruneResult.rowCount : 0;
  } catch (pruneErr) {
    console.error('snapshot retention prune', pruneErr?.message || pruneErr);
  }

  const leaderWebhookUrl = (process.env.DISCORD_LEADERBOARD_WEBHOOK_URL || '').trim();
  if (leaderWebhookUrl && leaderWebhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    try {
      const leaderRows = await sql`
        WITH latest AS (
          SELECT DISTINCT ON (character_id) character_id, data
          FROM character_snapshots
          ORDER BY character_id, at DESC
        ),
        totals AS (
          SELECT character_id,
            (SELECT COALESCE(SUM((elem->>'count')::int), 0) FROM jsonb_each(data->'bosses') AS t(k, elem)) AS total_kc
          FROM latest
        ),
        max_kc AS (SELECT MAX(total_kc) AS m FROM totals)
        SELECT c.username
        FROM totals t
        JOIN characters c ON c.id = t.character_id
        CROSS JOIN max_kc
        WHERE t.total_kc = max_kc.m AND max_kc.m > 0
        ORDER BY c.username ASC
      `;
      const currentLeaders = (leaderRows || [])
        .map((r) => (r.username != null ? String(r.username).trim() : ''))
        .filter(Boolean);
      const currentLeaderValue = currentLeaders.length > 0 ? currentLeaders.join(',') : null;
      const stateRows = await sql`SELECT value FROM leaderboard_state WHERE key = 'boss_kill_leader' LIMIT 1`;
      const previousValue = stateRows.length && stateRows[0].value != null ? String(stateRows[0].value).trim() : null;
      const previousLeaders = previousValue ? previousValue.split(',').map((s) => s.trim()).filter(Boolean).sort() : [];
      const currentSet = currentLeaders.slice().sort().join(',');
      const previousSet = previousLeaders.join(',');
      const leadersChanged = currentSet !== previousSet;
      if (currentLeaderValue && leadersChanged) {
        const leaderLabel = currentLeaders.length === 1
          ? `**${currentLeaders[0]}**`
          : currentLeaders.length === 2
            ? `**${currentLeaders[0]}** & **${currentLeaders[1]}**`
            : currentLeaders.slice(0, -1).map((u) => `**${u}**`).join(', ') + ' & **' + currentLeaders[currentLeaders.length - 1] + '**';
        const description = currentLeaders.length === 1 && previousLeaders.length >= 1
          ? `${leaderLabel} has taken the lead for the most boss kills!`
          : currentLeaders.length >= 2 && previousLeaders.length === 1
            ? `${leaderLabel} are now tied for the lead!`
            : currentLeaders.length >= 2
              ? `${leaderLabel} are the boss kill champions!`
              : `${leaderLabel} has overtaken the previous leader for the most boss kills!`;
        const body = {
          embeds: [
            {
              title: '🏆 Boss kill leader changed',
              description,
              color: 0xf59e0b,
              footer: { text: 'SpoopTool' },
            },
          ],
        };
        const resp = await fetch(leaderWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) console.error('Discord leaderboard webhook failed', resp.status);
      }
      if (currentLeaderValue != null) {
        await sql`
          INSERT INTO leaderboard_state (key, value, updated_at) VALUES ('boss_kill_leader', ${currentLeaderValue}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
      }
    } catch (leaderErr) {
      console.error('Boss leader / Discord notify', leaderErr?.message || leaderErr);
    }
  }

  return res.status(200).json({
    ok: true,
    snapshots: written,
    characters: characters.length,
    offset,
    limit,
    spoopScoreSnapshots: spoopScoreWritten || undefined,
    pruneDeleted: pruneDeleted || undefined,
    setLuckBaseline: setLuckBaseline || undefined,
    baselineRows: setLuckBaseline ? baselineUpdated : undefined,
    errors: errors.length ? errors : undefined,
  });
};
