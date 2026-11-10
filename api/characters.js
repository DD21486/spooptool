const { neon } = require('@neondatabase/serverless');
const { computeBossScore, computeSpoopScore } = require('../lib/spoopscore');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function totalBossKcFromData(data) {
  if (!data || !data.bosses) return 0;
  let sum = 0;
  for (const b of Object.values(data.bosses)) {
    if (b && typeof b.count === 'number') sum += b.count;
  }
  return sum;
}
function xpFromData(data) {
  if (!data || !data.skills || !data.skills.overall) return 0;
  const x = data.skills.overall.xp;
  return x != null ? Number(x) : 0;
}
function xpForSkill(data, skillKey) {
  if (!data || !data.skills) return 0;
  const s = data.skills[skillKey];
  if (!s) return 0;
  const x = s.xp != null ? s.xp : s.experience;
  return x != null ? Number(x) : 0;
}
function kcForBoss(data, bossKey) {
  if (!data || !data.bosses || !bossKey) return 0;
  const b = data.bosses[bossKey];
  const n = b && (b.count != null ? b.count : b.kc);
  return typeof n === 'number' ? n : 0;
}

/** GET /api/characters-deltas (via rewrite to ?path=deltas) */
async function handleCharactersDeltas(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const today = req.query.today === '1' || req.query.today === 'true';
  const week = req.query.week === '1' || req.query.week === 'true';
  const lastWeek = req.query.lastWeek === '1' || req.query.lastWeek === 'true';
  const month = req.query.month === '1' || req.query.month === 'true';
  const hours = (today || week || lastWeek || month) ? null : Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }
  try {
    const sql = neon(process.env.DATABASE_URL);
    const chars = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
    const firstRows = today
      ? await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= date_trunc('day', NOW()) ORDER BY character_id, at ASC`
      : week
        ? await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') ORDER BY character_id, at ASC`
        : lastWeek
          ? await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - interval '7 days' AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day') ORDER BY character_id, at ASC`
          : month
            ? await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= date_trunc('month', NOW()) ORDER BY character_id, at ASC`
            : await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= NOW() - make_interval(hours => ${hours}) ORDER BY character_id, at ASC`;
    const lastRows = today
      ? await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= date_trunc('day', NOW()) ORDER BY character_id, at DESC`
      : week
        ? await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') ORDER BY character_id, at DESC`
        : lastWeek
          ? await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - interval '7 days' AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day') ORDER BY character_id, at DESC`
          : month
            ? await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= date_trunc('month', NOW()) ORDER BY character_id, at DESC`
            : await sql`SELECT DISTINCT ON (character_id) character_id, at, data FROM character_snapshots WHERE at >= NOW() - make_interval(hours => ${hours}) ORDER BY character_id, at DESC`;
    const firstByChar = {};
    for (const r of firstRows) firstByChar[r.character_id] = r;
    const lastByChar = {};
    for (const r of lastRows) lastByChar[r.character_id] = r;
    const deltas = chars.map((c) => {
      const first = firstByChar[c.id];
      const last = lastByChar[c.id];
      if (!first || !last) return { username: c.username, xpDelta: 0, bossKcDelta: 0, bossScoreDelta: 0, skillDeltas: {}, bossDeltas: {} };
      const firstData = first.data || {};
      const lastData = last.data || {};
      const skillKeys = new Set([...Object.keys(firstData.skills || {}), ...Object.keys(lastData.skills || {})]);
      const skillDeltas = {};
      for (const key of skillKeys) skillDeltas[key] = Math.max(0, xpForSkill(lastData, key) - xpForSkill(firstData, key));
      const bossKeys = new Set([...Object.keys(firstData.bosses || {}), ...Object.keys(lastData.bosses || {})]);
      const bossDeltas = {};
      for (const key of bossKeys) bossDeltas[key] = Math.max(0, kcForBoss(lastData, key) - kcForBoss(firstData, key));
      const firstBossScore = computeBossScore(firstData.bosses || {});
      const lastBossScore = computeBossScore(lastData.bosses || {});
      const bossScoreDelta = Math.max(0, lastBossScore - firstBossScore);
      return {
        username: c.username,
        xpDelta: Math.max(0, xpFromData(lastData) - xpFromData(firstData)),
        bossKcDelta: Math.max(0, totalBossKcFromData(lastData) - totalBossKcFromData(firstData)),
        bossScoreDelta,
        skillDeltas,
        bossDeltas,
      };
    });
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({ deltas });
  } catch (err) {
    console.error('/api/characters-deltas', err);
    return res.status(500).json({ error: 'Failed to load deltas' });
  }
}

/** GET /api/spoopscore-history (via rewrite to ?path=spoopscore-history) */
async function handleSpoopscoreHistory(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const name = (req.query.name || req.query.username || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Name required' });

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  const sql = neon(process.env.DATABASE_URL);
  try {
    const charRows = await sql`SELECT id, username FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${name})) LIMIT 1`;
    if (charRows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const characterId = charRows[0].id;
    const username = charRows[0].username || name;

    let rows = [];
    try {
      rows = await sql`
        SELECT at_slot, spoop_score, boss_score, skill_score, pet_points
        FROM spoopscore_snapshots
        WHERE character_id = ${characterId}
          AND at_slot >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '8 days'
        ORDER BY at_slot ASC
      `;
    } catch (tableErr) {
      if (tableErr && tableErr.code === '42P01') {
        rows = [];
      } else {
        throw tableErr;
      }
    }

    const bySlot = new Map();
    for (const r of rows || []) {
      const at = r.at_slot;
      const ts = slotTs(at);
      if (Number.isFinite(ts)) {
        bySlot.set(ts, {
          at: at instanceof Date ? at.toISOString() : at,
          spoopScore: Number(r.spoop_score) || 0,
          bossScore: Number(r.boss_score) || 0,
          skillScore: Number(r.skill_score) || 0,
          petPoints: Number(r.pet_points) || 0,
        });
      }
    }

    const needBackfill = bySlot.size < 7;
    if (needBackfill) {
      const snapshotRows = await sql`
        SELECT at, data
        FROM character_snapshots
        WHERE character_id = ${characterId}
          AND at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '8 days'
        ORDER BY at ASC
      `;
      const latestInSlot = new Map();
      for (const r of snapshotRows || []) {
        const at = r.at instanceof Date ? r.at : new Date(r.at);
        const ts = slotTs(at);
        if (!Number.isFinite(ts)) continue;
        const existing = latestInSlot.get(ts);
        if (!existing || at.getTime() > (existing.at instanceof Date ? existing.at.getTime() : new Date(existing.at).getTime())) {
          latestInSlot.set(ts, { at, data: r.data || {} });
        }
      }
      for (const [ts, { data }] of latestInSlot) {
        if (bySlot.has(ts)) continue;
        const skills = data.skills || {};
        const bosses = data.bosses || {};
        const { spoopScore, bossScore, skillScore, petPoints } = computeSpoopScore(skills, bosses, username);
        bySlot.set(ts, {
          at: new Date(ts).toISOString(),
          spoopScore,
          bossScore,
          skillScore,
          petPoints,
        });
      }
    }

    const history = Array.from(bySlot.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ history });
  } catch (err) {
    console.error('GET /api/spoopscore-history', err);
    return res.status(500).json({ error: 'Failed to load SpoopScore history' });
  }
}

function slotTs(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const h = Math.floor(d.getUTCHours() / 6) * 6;
  return Date.UTC(y, m, day, h, 0, 0, 0);
}

function send500(res, detail) {
  return res.status(500).json({ error: 'Server error', detail: detail || 'Unknown error' });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.query.path === 'spoopscore-history') return handleSpoopscoreHistory(req, res);
  if (req.method === 'GET' && (req.query.path === 'deltas')) return handleCharactersDeltas(req, res);

  try {
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
      return send500(res, 'DATABASE_URL is not set. In Vercel: Settings → Environment Variables → add DATABASE_URL with your Neon connection string, then redeploy.');
    }

    let sql;
    try {
      sql = neon(process.env.DATABASE_URL);
    } catch (e) {
      return send500(res, 'Invalid DATABASE_URL: ' + (e.message || String(e)));
    }

    if (req.method === 'GET') {
      const rows = await sql`SELECT id, username, game_mode, added_at FROM characters ORDER BY added_at ASC`;
      res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      let body;
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
      const username = (body.username || '').trim().replace(/\s+/g, ' ');
      if (!username || username.length > 12) {
        return res.status(400).json({ error: 'Username required (max 12 characters)' });
      }

      const { getStats } = require('osrs-json-hiscores');
      let player;
      try {
        player = await getStats(username);
      } catch (e) {
        if ((e.message || '').toLowerCase().includes('not found') || (e.message || '').includes('404')) {
          return res.status(404).json({ error: 'Character not found on Hiscores', detail: 'Check the username and try again.' });
        }
        throw e;
      }
      const mode = (player && player.mode) ? player.mode : 'main';
      await sql`INSERT INTO characters (username, game_mode) VALUES (${username}, ${mode}) ON CONFLICT (username) DO UPDATE SET game_mode = ${mode}`;
      const rows = await sql`SELECT id, username, game_mode, added_at FROM characters ORDER BY added_at ASC`;
      return res.status(201).json({ characters: rows, added: username });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('/api/characters', err);
    const msg = (err.message || String(err)).replace(/postgresql:\/\/[^@]+@/gi, '***@');
    const detail = msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('characters')
      ? 'Characters table missing. In Neon SQL Editor run the contents of sql/schema.sql to create the table.'
      : msg;
    return send500(res, detail);
  }
};
