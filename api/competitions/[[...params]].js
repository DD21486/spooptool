// api/competitions/[[...params]].js
// Catch-all handler for all competition CRUD operations.
//
// Routes:
//   GET    /api/competitions               → list all competitions (summary)
//   POST   /api/competitions               → create a new competition
//   GET    /api/competitions/:id           → get competition detail with live scores
//   DELETE /api/competitions/:id           → delete (requires creator_code in body)
//   POST   /api/competitions/:id/snapshot  → fetch fresh Hiscores for all participants and store snapshots

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

// Fetch start + end snapshots for all participants in a solo competition.
async function fetchSnapshotsSolo(sql, compId, startTime, effectiveEnd) {
  const [startSnaps, endSnaps] = await Promise.all([
    sql`
      SELECT DISTINCT ON (cs.character_id) cs.character_id, cs.data
      FROM character_snapshots cs
      JOIN competition_participants cp ON cp.character_id = cs.character_id
      WHERE cp.competition_id = ${compId} AND cs.at <= ${startTime}
      ORDER BY cs.character_id, cs.at DESC
    `,
    sql`
      SELECT DISTINCT ON (cs.character_id) cs.character_id, cs.data
      FROM character_snapshots cs
      JOIN competition_participants cp ON cp.character_id = cs.character_id
      WHERE cp.competition_id = ${compId} AND cs.at <= ${effectiveEnd}
      ORDER BY cs.character_id, cs.at DESC
    `,
  ]);
  const startByChar = {};
  for (const r of startSnaps) startByChar[r.character_id] = r.data;
  const endByChar = {};
  for (const r of endSnaps) endByChar[r.character_id] = r.data;
  return { startByChar, endByChar };
}

// Fetch start + end snapshots for all participants in a team competition.
async function fetchSnapshotsTeam(sql, compId, startTime, effectiveEnd) {
  const [startSnaps, endSnaps] = await Promise.all([
    sql`
      SELECT DISTINCT ON (cs.character_id) cs.character_id, cs.data
      FROM character_snapshots cs
      JOIN competition_team_members ctm ON ctm.character_id = cs.character_id
      JOIN competition_teams ct ON ct.id = ctm.team_id
      WHERE ct.competition_id = ${compId} AND cs.at <= ${startTime}
      ORDER BY cs.character_id, cs.at DESC
    `,
    sql`
      SELECT DISTINCT ON (cs.character_id) cs.character_id, cs.data
      FROM character_snapshots cs
      JOIN competition_team_members ctm ON ctm.character_id = cs.character_id
      JOIN competition_teams ct ON ct.id = ctm.team_id
      WHERE ct.competition_id = ${compId} AND cs.at <= ${effectiveEnd}
      ORDER BY cs.character_id, cs.at DESC
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

  const now          = Date.now();
  const endMs        = new Date(comp.end_time).getTime();
  const isUpcoming   = new Date(comp.start_time).getTime() > now;
  // For active competitions: use the current time so scores reflect live progress.
  // For ended competitions: allow up to 2 hours past end_time so the next hourly
  // cron snapshot (taken shortly after the competition closed) is included rather
  // than being stuck on a snapshot that may be up to 59 minutes stale.
  const effectiveEnd = now <= endMs
    ? new Date(now).toISOString()
    : new Date(endMs + 2 * 60 * 60 * 1000).toISOString();

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

    const { startByChar, endByChar } = isUpcoming || !participants.length
      ? { startByChar: {}, endByChar: {} }
      : await fetchSnapshotsSolo(sql, comp.id, comp.start_time, effectiveEnd);

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
    const rows = await sql`
      SELECT ct.id AS team_id, ct.name AS team_name, ct.skill AS team_skill,
             ctm.character_id, c.username
      FROM competition_teams ct
      JOIN competition_team_members ctm ON ctm.team_id = ct.id
      JOIN characters c ON c.id = ctm.character_id
      WHERE ct.competition_id = ${comp.id}
      ORDER BY ct.id
    `;

    const { startByChar, endByChar } = isUpcoming || !rows.length
      ? { startByChar: {}, endByChar: {} }
      : await fetchSnapshotsTeam(sql, comp.id, comp.start_time, effectiveEnd);

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

// ── FINAL SNAPSHOT ────────────────────────────────────────────────────────────
// Fetches live Hiscores for every participant and writes a character_snapshot row.
// Called by the frontend when a competition ends (countdown hits 0) or via the
// "Refresh Scores" button on an ended competition.
async function snapshotCompetition(req, res, sql, id) {
  const compRows = await sql`SELECT id, type FROM competitions WHERE id = ${id}`;
  if (!compRows.length) return res.status(404).json({ error: 'Competition not found' });

  // Collect all character rows for this competition
  let charRows;
  if (compRows[0].type === 'solo') {
    charRows = await sql`
      SELECT c.id, c.username
      FROM competition_participants cp
      JOIN characters c ON c.id = cp.character_id
      WHERE cp.competition_id = ${id}
    `;
  } else {
    charRows = await sql`
      SELECT DISTINCT c.id, c.username
      FROM competition_teams ct
      JOIN competition_team_members ctm ON ctm.team_id = ct.id
      JOIN characters c ON c.id = ctm.character_id
      WHERE ct.competition_id = ${id}
    `;
  }

  if (!charRows.length) return res.status(200).json({ ok: true, snapshots: 0 });

  const { getStats } = require('osrs-json-hiscores');

  function buildSnapshotData(player) {
    if (!player || !player.main) return null;
    const skills = {};
    for (const [key, d] of Object.entries(player.main.skills || {})) {
      skills[key] = { rank: d.rank, level: d.level, xp: d.xp != null ? d.xp : d.experience };
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

  let written = 0;
  const errors = [];
  for (const char of charRows) {
    try {
      const player = await getStats(char.username);
      const data = buildSnapshotData(player);
      if (data) {
        await sql`
          INSERT INTO character_snapshots (character_id, at, data)
          VALUES (${char.id}, NOW(), ${JSON.stringify(data)})
        `;
        written++;
      }
    } catch (e) {
      errors.push({ username: char.username, error: (e.message || String(e)).slice(0, 100) });
    }
  }

  return res.status(200).json({ ok: true, snapshots: written, errors: errors.length ? errors : undefined });
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
  const id     = params[0] && params[0] !== '_' ? parseInt(params[0], 10) : null;
  const action = params[1] || null; // e.g. 'snapshot'

  try {
    if (!id) {
      if (req.method === 'GET')  return await listCompetitions(req, res, sql);
      if (req.method === 'POST') return await createCompetition(req, res, sql);
    } else if (action === 'snapshot') {
      if (req.method === 'POST') return await snapshotCompetition(req, res, sql, id);
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
