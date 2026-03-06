// api/competitions/[[...params]].js
// Catch-all handler for all competition CRUD operations.
//
// Routes:
//   GET    /api/competitions          → list all competitions (summary)
//   POST   /api/competitions          → create a new competition
//   GET    /api/competitions/:id      → get competition detail with live scores
//   DELETE /api/competitions/:id      → delete (requires creator_code in body)

const { neon } = require('@neondatabase/serverless');

// ── CORS ──────────────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Snapshot data helpers (same pattern as characters.js) ─────────────────────
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

// Convert a display boss name ("Abyssal Sire", "K'ril Tsutsaroth", "TzKal-Zuk")
// to the camelCase key used by osrs-json-hiscores ("abyssalSire", "krilTsutsaroth", "tzKalZuk").
function bossToKey(displayName) {
  return String(displayName)
    .replace(/-/g, ' ')       // "TzKal-Zuk"  → "TzKal Zuk"
    .replace(/'/g, '')        // "K'ril"       → "Kril", "Kree'Arra" → "KreeArra"
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toLowerCase() + w.slice(1)
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join('');
}

// Compute the score delta for a single participant.
// startData / endData are raw JSONB objects from character_snapshots.data (or null).
// participantSkill is the per-participant skill name (used when same_skill_for_all = false).
function computeDelta(startData, endData, comp, participantSkill) {
  if (!endData) return 0;

  if (comp.metric === 'xp') {
    if (comp.skill_scope === 'total') {
      const end   = xpFromData(endData);
      const start = startData ? xpFromData(startData) : 0;
      return Math.max(0, end - start);
    }
    // specific skill
    const skillKey = comp.same_skill_for_all
      ? (comp.skill || '').toLowerCase()
      : (participantSkill || '').toLowerCase();
    const end   = xpForSkill(endData, skillKey);
    const start = startData ? xpForSkill(startData, skillKey) : 0;
    return Math.max(0, end - start);
  }

  if (comp.metric === 'kill-count') {
    const bossKey = bossToKey(comp.boss || '');
    const end     = kcForBoss(endData, bossKey);
    const start   = startData ? kcForBoss(startData, bossKey) : 0;
    return Math.max(0, end - start);
  }

  // ehp / ehb — deferred
  return 0;
}

// Fetch start + end snapshots for a set of character IDs in two queries.
// Returns { startByChar, endByChar } keyed by character_id.
async function fetchSnapshots(sql, charIds, startTime, effectiveEnd) {
  if (!charIds.length) return { startByChar: {}, endByChar: {} };

  const [startSnaps, endSnaps] = await Promise.all([
    sql`
      SELECT DISTINCT ON (character_id) character_id, data
      FROM character_snapshots
      WHERE character_id = ANY(${charIds}) AND at <= ${startTime}
      ORDER BY character_id, at DESC
    `,
    sql`
      SELECT DISTINCT ON (character_id) character_id, data
      FROM character_snapshots
      WHERE character_id = ANY(${charIds}) AND at <= ${effectiveEnd}
      ORDER BY character_id, at DESC
    `,
  ]);

  const startByChar = {};
  for (const r of startSnaps) startByChar[r.character_id] = r.data;
  const endByChar = {};
  for (const r of endSnaps) endByChar[r.character_id] = r.data;
  return { startByChar, endByChar };
}

// ── LIST ──────────────────────────────────────────────────────────────────────
async function listCompetitions(req, res, sql) {
  const rows = await sql`
    SELECT id, name, type, category, metric, skill_scope, skill, boss, start_time, end_time
    FROM competitions
    ORDER BY created_at DESC
  `;

  const comps = rows.map(r => ({
    id:         r.id,
    name:       r.name,
    type:       r.type,
    category:   r.category,
    metric:     r.metric,
    skillScope: r.skill_scope,
    skill:      r.skill,
    boss:       r.boss,
    startTime:  r.start_time,
    endTime:    r.end_time,
  }));

  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  return res.status(200).json(comps);
}

// ── CREATE ────────────────────────────────────────────────────────────────────
async function createCompetition(req, res, sql) {
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const {
    name, type, category, metric,
    startTime, endTime,
    selectedPlayers, teams,
    skillScope, sameSkillForAll, selectedSkill, playerSkills,
    selectedBoss,
  } = body;

  if (!name || !type || !category || !metric || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 9-digit numeric creator code
  const creatorCode = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  const sharedSkillForAll = sameSkillForAll !== false;

  const compRows = await sql`
    INSERT INTO competitions
      (name, type, category, metric, skill_scope, skill, same_skill_for_all, boss, start_time, end_time, creator_code)
    VALUES (
      ${name}, ${type}, ${category}, ${metric},
      ${skillScope || null},
      ${selectedSkill || null},
      ${sharedSkillForAll},
      ${selectedBoss || null},
      ${new Date(startTime).toISOString()},
      ${new Date(endTime).toISOString()},
      ${creatorCode}
    )
    RETURNING id
  `;
  const compId = compRows[0].id;

  if (type === 'solo') {
    const players = Array.isArray(selectedPlayers) ? selectedPlayers : [];
    for (const username of players) {
      const charRows = await sql`SELECT id FROM characters WHERE username = ${username}`;
      if (!charRows.length) continue;
      const skill = (!sharedSkillForAll && playerSkills && playerSkills[username])
        ? playerSkills[username]
        : null;
      await sql`
        INSERT INTO competition_participants (competition_id, character_id, skill)
        VALUES (${compId}, ${charRows[0].id}, ${skill})
        ON CONFLICT DO NOTHING
      `;
    }
  } else {
    const teamList = Array.isArray(teams) ? teams : [];
    for (const team of teamList) {
      if (!team.name || !Array.isArray(team.players) || !team.players.length) continue;
      const teamSkill = (!sharedSkillForAll && playerSkills && playerSkills['team_' + team.id])
        ? playerSkills['team_' + team.id]
        : null;
      const teamRows = await sql`
        INSERT INTO competition_teams (competition_id, name, skill)
        VALUES (${compId}, ${team.name}, ${teamSkill})
        RETURNING id
      `;
      const dbTeamId = teamRows[0].id;
      for (const username of team.players) {
        const charRows = await sql`SELECT id FROM characters WHERE username = ${username}`;
        if (!charRows.length) continue;
        await sql`
          INSERT INTO competition_team_members (team_id, character_id)
          VALUES (${dbTeamId}, ${charRows[0].id})
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  return res.status(201).json({ id: compId, creatorCode });
}

// ── GET DETAIL ────────────────────────────────────────────────────────────────
async function getCompetition(req, res, sql, id) {
  const compRows = await sql`
    SELECT id, name, type, category, metric, skill_scope, skill, same_skill_for_all, boss, start_time, end_time
    FROM competitions WHERE id = ${id}
  `;
  if (!compRows.length) return res.status(404).json({ error: 'Competition not found' });
  const comp = compRows[0];

  const isUpcoming   = new Date(comp.start_time).getTime() > Date.now();
  const effectiveEnd = new Date(Math.min(Date.now(), new Date(comp.end_time).getTime())).toISOString();

  const result = {
    id:               comp.id,
    name:             comp.name,
    type:             comp.type,
    category:         comp.category,
    metric:           comp.metric,
    skillScope:       comp.skill_scope,
    skill:            comp.skill,
    sameSkillForAll:  comp.same_skill_for_all,
    boss:             comp.boss,
    startTime:        comp.start_time,
    endTime:          comp.end_time,
  };

  if (comp.type === 'solo') {
    const participants = await sql`
      SELECT cp.character_id, cp.skill AS participant_skill, c.username
      FROM competition_participants cp
      JOIN characters c ON c.id = cp.character_id
      WHERE cp.competition_id = ${comp.id}
    `;

    const charIds = participants.map(p => p.character_id);
    const { startByChar, endByChar } = isUpcoming
      ? { startByChar: {}, endByChar: {} }
      : await fetchSnapshots(sql, charIds, comp.start_time, effectiveEnd);

    result.participants = participants.map(p => {
      const value = computeDelta(
        startByChar[p.character_id] || null,
        endByChar[p.character_id]   || null,
        comp,
        p.participant_skill
      );
      const entry = { name: p.username, value };
      if (comp.skill_scope === 'specific' && !comp.same_skill_for_all) {
        entry.skill = p.participant_skill || '';
      }
      return entry;
    });

  } else {
    // Fetch all team rows in a single join
    const rows = await sql`
      SELECT ct.id AS team_id, ct.name AS team_name, ct.skill AS team_skill,
             ctm.character_id, c.username
      FROM competition_teams ct
      JOIN competition_team_members ctm ON ctm.team_id = ct.id
      JOIN characters c ON c.id = ctm.character_id
      WHERE ct.competition_id = ${comp.id}
      ORDER BY ct.id
    `;

    const charIds = [...new Set(rows.map(r => r.character_id))];
    const { startByChar, endByChar } = isUpcoming
      ? { startByChar: {}, endByChar: {} }
      : await fetchSnapshots(sql, charIds, comp.start_time, effectiveEnd);

    // Group by team
    const teamMap = {};
    for (const row of rows) {
      if (!teamMap[row.team_id]) {
        teamMap[row.team_id] = { id: row.team_id, name: row.team_name, teamSkill: row.team_skill, players: [] };
      }
      const participantSkill = comp.same_skill_for_all ? comp.skill : row.team_skill;
      const value = computeDelta(
        startByChar[row.character_id] || null,
        endByChar[row.character_id]   || null,
        comp,
        participantSkill
      );
      const playerEntry = { name: row.username, value };
      if (comp.skill_scope === 'specific' && !comp.same_skill_for_all) {
        playerEntry.skill = row.team_skill || '';
      }
      teamMap[row.team_id].players.push(playerEntry);
    }

    result.teams = Object.values(teamMap).map(t => ({
      id:      t.id,
      name:    t.name,
      players: t.players,
    }));
  }

  return res.status(200).json(result);
}

// ── DELETE ────────────────────────────────────────────────────────────────────
async function deleteCompetition(req, res, sql, id) {
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { creatorCode } = body;
  if (!creatorCode) return res.status(400).json({ error: 'Creator code required' });

  const rows = await sql`SELECT id, creator_code FROM competitions WHERE id = ${id}`;
  if (!rows.length) return res.status(404).json({ error: 'Competition not found' });
  if (rows[0].creator_code !== String(creatorCode)) {
    return res.status(403).json({ error: 'Invalid creator code' });
  }

  await sql`DELETE FROM competitions WHERE id = ${id}`;
  return res.status(200).json({ deleted: true });
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  let sql;
  try {
    sql = neon(process.env.DATABASE_URL);
  } catch (e) {
    return res.status(500).json({ error: 'Invalid DATABASE_URL' });
  }

  // params is an array of path segments after /api/competitions/
  const raw = req.query.params;
  const params = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const id = params[0] ? parseInt(params[0], 10) : null;

  try {
    if (!id) {
      if (req.method === 'GET')  return await listCompetitions(req, res, sql);
      if (req.method === 'POST') return await createCompetition(req, res, sql);
    } else {
      if (req.method === 'GET')    return await getCompetition(req, res, sql, id);
      if (req.method === 'DELETE') return await deleteCompetition(req, res, sql, id);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('/api/competitions', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
};
