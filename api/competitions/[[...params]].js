// api/competitions/[[...params]].js
// Catch-all handler for all competition CRUD operations.
//
// Routes:
//   GET    /api/competitions               → list all competitions (summary)
//   POST   /api/competitions               → create a new competition
//   POST   /api/competitions?action=save-rates → upsert EHP or EHB rate table
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

// Convert a display boss name to WOM snake_case for EHB rate table lookup.
// e.g. "Abyssal Sire" → "abyssal_sire", "K'ril Tsutsaroth" → "kril_tsutsaroth"
function bossToSnakeCase(displayName) {
  return String(displayName)
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// Compute total EHP from 0 up to `xp` using sorted rate methods.
// methods = [{ start_exp, rate }, ...] sorted ascending by start_exp.
function ehpAt(xp, methods) {
  let total = 0;
  for (let i = 0; i < methods.length; i++) {
    const bracketStart = Number(methods[i].start_exp);
    const bracketEnd = i + 1 < methods.length ? Number(methods[i + 1].start_exp) : 200000000;
    if (xp <= bracketStart) break;
    const xpInBracket = Math.min(xp, bracketEnd) - bracketStart;
    if (xpInBracket > 0 && methods[i].rate > 0) total += xpInBracket / methods[i].rate;
  }
  return total;
}

// Compute total EHB from 0 up to `kc` using sorted rate methods.
// methods = [{ start_kc, rate }, ...] sorted ascending by start_kc.
function ehbAt(kc, methods) {
  let total = 0;
  for (let i = 0; i < methods.length; i++) {
    const bracketStart = Number(methods[i].start_kc);
    const bracketEnd = i + 1 < methods.length ? Number(methods[i + 1].start_kc) : Infinity;
    if (kc <= bracketStart) break;
    const kcInBracket = (bracketEnd === Infinity ? kc : Math.min(kc, bracketEnd)) - bracketStart;
    if (kcInBracket > 0 && methods[i].rate > 0) total += kcInBracket / methods[i].rate;
  }
  return total;
}

// Returns { startValue, endValue, delta } for EHP given raw XP values.
// rateRows is the flattened array from getCompetition's pre-fetch.
function computeEHPGained(startXp, endXp, skill, rateRows, gameMode) {
  const mode = (gameMode || 'main').toLowerCase();
  // WOM doesn't have separate hardcore rates — fall back to ironman.
  const effectiveMode = mode === 'hardcore' ? 'ironman' : mode;
  const methods = rateRows
    .filter(r => r.game_mode === effectiveMode && r.skill === skill.toLowerCase())
    .sort((a, b) => Number(a.start_exp) - Number(b.start_exp));
  if (!methods.length) return { startValue: 0, endValue: 0, delta: 0 };
  const startEhp = ehpAt(startXp, methods);
  const endEhp   = ehpAt(endXp,   methods);
  return { startValue: startEhp, endValue: endEhp, delta: Math.max(0, endEhp - startEhp) };
}

// Returns { startValue, endValue, delta } for EHB given raw KC values.
// rateRows is the flattened array from getCompetition's pre-fetch.
function computeEHBGained(startKc, endKc, boss, rateRows) {
  const bossKey = bossToSnakeCase(boss);
  const methods = rateRows
    .filter(r => r.boss === bossKey)
    .sort((a, b) => Number(a.start_kc) - Number(b.start_kc));
  if (!methods.length) return { startValue: 0, endValue: 0, delta: 0 };
  const startEhb = ehbAt(startKc, methods);
  const endEhb   = ehbAt(endKc,   methods);
  return { startValue: startEhb, endValue: endEhb, delta: Math.max(0, endEhb - startEhb) };
}

// Compute start value, end value, and delta for a single participant.
// startData / endData are raw JSONB objects from character_snapshots.data (or null).
// participantSkill is the per-participant skill name (used when same_skill_for_all = false).
// gameMode is the character's account type ('main', 'ironman', 'hardcore').
// rates is the pre-fetched flat rate array (only populated for ehp/ehb competitions).
function computeValues(startData, endData, comp, participantSkill, gameMode, rates) {
  if (comp.metric === 'xp') {
    if (comp.skill_scope === 'total') {
      const endValue   = endData   ? xpFromData(endData)   : 0;
      const startValue = startData ? xpFromData(startData) : 0;
      return { startValue, endValue, delta: Math.max(0, endValue - startValue) };
    }
    const skillKey = comp.same_skill_for_all
      ? (comp.skill || '').toLowerCase()
      : (participantSkill || '').toLowerCase();
    const endValue   = endData   ? xpForSkill(endData,   skillKey) : 0;
    const startValue = startData ? xpForSkill(startData, skillKey) : 0;
    return { startValue, endValue, delta: Math.max(0, endValue - startValue) };
  }

  if (comp.metric === 'kill-count') {
    const bossKey    = bossToKey(comp.boss || '');
    const endValue   = endData   ? kcForBoss(endData,   bossKey) : 0;
    const startValue = startData ? kcForBoss(startData, bossKey) : 0;
    return { startValue, endValue, delta: Math.max(0, endValue - startValue) };
  }

  if (comp.metric === 'ehp') {
    const skillKey = comp.same_skill_for_all
      ? (comp.skill || '').toLowerCase()
      : (participantSkill || '').toLowerCase();

    // Total EHP: no specific skill set — sum EHP across all skills in the rate table.
    if (!skillKey || comp.skill_scope === 'total') {
      const mode = (gameMode || 'main').toLowerCase();
      const effectiveMode = mode === 'hardcore' ? 'ironman' : mode;
      const uniqueSkills = [...new Set((rates || []).filter(r => r.game_mode === effectiveMode).map(r => r.skill))];
      let startEhp = 0;
      let endEhp   = 0;
      for (const skill of uniqueSkills) {
        const startXp = startData ? xpForSkill(startData, skill) : 0;
        const endXp   = endData   ? xpForSkill(endData,   skill) : 0;
        const r = computeEHPGained(startXp, endXp, skill, rates, gameMode);
        startEhp += r.startValue;
        endEhp   += r.endValue;
      }
      return { startValue: startEhp, endValue: endEhp, delta: Math.max(0, endEhp - startEhp) };
    }

    const startXp = startData ? xpForSkill(startData, skillKey) : 0;
    const endXp   = endData   ? xpForSkill(endData,   skillKey) : 0;
    return computeEHPGained(startXp, endXp, skillKey, rates || [], gameMode);
  }

  if (comp.metric === 'ehb') {
    const bossKey = bossToKey(comp.boss || '');
    const startKc = startData ? kcForBoss(startData, bossKey) : 0;
    const endKc   = endData   ? kcForBoss(endData,   bossKey) : 0;
    return computeEHBGained(startKc, endKc, comp.boss || '', rates || []);
  }

  return { startValue: 0, endValue: 0, delta: 0 };
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

// ── SAVE RATES ────────────────────────────────────────────────────────────────
// Upserts EHP or EHB rate data (raw WOM API array) into the rate tables.
// Called from sandbox.html "Save to DB" button.
async function saveRates(req, res, sql) {
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { metric, gameMode, rates } = body;
  if (!metric || !Array.isArray(rates)) {
    return res.status(400).json({ error: 'metric and rates array required' });
  }

  if (metric === 'ehp') {
    if (!gameMode) return res.status(400).json({ error: 'gameMode required for EHP rates' });
    await sql`
      INSERT INTO ehp_rates (game_mode, rates, updated_at)
      VALUES (${gameMode}, ${JSON.stringify(rates)}, NOW())
      ON CONFLICT (game_mode) DO UPDATE SET rates = EXCLUDED.rates, updated_at = NOW()
    `;
  } else if (metric === 'ehb') {
    // Single universal row — upsert by replacing the first row if it exists.
    const existing = await sql`SELECT id FROM ehb_rates LIMIT 1`;
    if (existing.length) {
      await sql`UPDATE ehb_rates SET rates = ${JSON.stringify(rates)}, updated_at = NOW() WHERE id = ${existing[0].id}`;
    } else {
      await sql`INSERT INTO ehb_rates (rates) VALUES (${JSON.stringify(rates)})`;
    }
  } else {
    return res.status(400).json({ error: 'metric must be ehp or ehb' });
  }

  return res.status(200).json({ ok: true });
}

// ── CHART HISTORY ─────────────────────────────────────────────────────────────
// Returns per-player progress over time: { timestamps, series: [{ name, values }] }
// Each value is the delta gained since competition start at that snapshot time.
async function getChartHistory(req, res, sql, id) {
  const compRows = await sql`
    SELECT id, type, metric, skill_scope, skill, same_skill_for_all, boss, start_time, end_time
    FROM competitions WHERE id = ${id}
  `;
  if (!compRows.length) return res.status(404).json({ error: 'Competition not found' });
  const comp = compRows[0];

  // Load participants (solo: one row per player; team: one row per player across all teams)
  const participants = comp.type === 'solo'
    ? await sql`
        SELECT c.id AS character_id, c.username, c.game_mode, cp.skill AS participant_skill
        FROM competition_participants cp
        JOIN characters c ON c.id = cp.character_id
        WHERE cp.competition_id = ${id}
      `
    : await sql`
        SELECT c.id AS character_id, c.username, c.game_mode, ct.skill AS participant_skill
        FROM competition_teams ct
        JOIN competition_team_members ctm ON ctm.team_id = ct.id
        JOIN characters c ON c.id = ctm.character_id
        WHERE ct.competition_id = ${id}
      `;

  if (!participants.length) return res.status(200).json({ timestamps: [], series: [] });

  // Load all snapshots for these participants, sorted by time
  const allSnaps = comp.type === 'solo'
    ? await sql`
        SELECT cs.character_id, cs.at, cs.data
        FROM character_snapshots cs
        JOIN competition_participants cp ON cp.character_id = cs.character_id
        WHERE cp.competition_id = ${id}
        ORDER BY cs.character_id, cs.at ASC
      `
    : await sql`
        SELECT DISTINCT ON (cs.character_id, cs.at) cs.character_id, cs.at, cs.data
        FROM character_snapshots cs
        JOIN competition_team_members ctm ON ctm.character_id = cs.character_id
        JOIN competition_teams ct ON ct.id = ctm.team_id
        WHERE ct.competition_id = ${id}
        ORDER BY cs.character_id, cs.at ASC
      `;

  // Pre-fetch efficiency rates (mirrors getCompetition logic)
  let rates = [];
  if (comp.metric === 'ehp') {
    const rateRows = await sql`SELECT game_mode, rates FROM ehp_rates`;
    for (const row of rateRows) {
      for (const entry of (Array.isArray(row.rates) ? row.rates : [])) {
        const skill = (entry.skill || '').toLowerCase();
        for (const m of (entry.methods || [])) {
          rates.push({ game_mode: row.game_mode, skill, start_exp: Number(m.startExp || 0), rate: Number(m.rate || 0) });
        }
      }
    }
  } else if (comp.metric === 'ehb') {
    const rateRows = await sql`SELECT rates FROM ehb_rates LIMIT 1`;
    if (rateRows.length) {
      for (const entry of (Array.isArray(rateRows[0].rates) ? rateRows[0].rates : [])) {
        const boss = (entry.boss || '').toLowerCase();
        const methods = Array.isArray(entry.methods) && entry.methods.length
          ? entry.methods
          : (entry.rate != null ? [{ startKc: 0, rate: entry.rate }] : []);
        for (const m of methods) {
          rates.push({ boss, start_kc: Number(m.startKc ?? m.startExp ?? 0), rate: Number(m.rate || 0) });
        }
      }
    }
  }

  // Group snapshots by character (already sorted ASC)
  const snapsByChar = {};
  for (const snap of allSnaps) {
    if (!snapsByChar[snap.character_id]) snapsByChar[snap.character_id] = [];
    snapsByChar[snap.character_id].push(snap);
  }

  const startTimeMs = new Date(comp.start_time).getTime();
  // Cap chart data at end_time so ended competitions don't show post-competition snapshots.
  const effectiveEndMs = Math.min(Date.now(), new Date(comp.end_time).getTime());

  // Start snapshot per player: most recent at or before start_time
  const startDataByChar = {};
  for (const p of participants) {
    const snaps = snapsByChar[p.character_id] || [];
    let startSnap = null;
    for (const s of snaps) {
      if (new Date(s.at).getTime() <= startTimeMs) startSnap = s;
      else break;
    }
    startDataByChar[p.character_id] = startSnap ? startSnap.data : null;
  }

  // Collect unique chart timestamps within the competition window, sorted
  const tsSet = new Set();
  for (const snap of allSnaps) {
    const snapMs = new Date(snap.at).getTime();
    if (snapMs >= startTimeMs && snapMs <= effectiveEndMs) tsSet.add(new Date(snap.at).toISOString());
  }
  const timestamps = [...tsSet].sort();
  if (!timestamps.length) return res.status(200).json({ timestamps: [], series: [] });

  // Build one series per player
  const series = participants.map(p => {
    const snaps = snapsByChar[p.character_id] || [];
    const startData = startDataByChar[p.character_id];
    const values = timestamps.map(ts => {
      const tsMs = new Date(ts).getTime();
      // Most recent snapshot at or before this timestamp
      let snap = null;
      for (const s of snaps) {
        if (new Date(s.at).getTime() <= tsMs) snap = s;
        else break;
      }
      if (!snap) return null;
      const { delta } = computeValues(startData, snap.data, comp, p.participant_skill, p.game_mode, rates);
      return delta;
    });
    return { name: p.username, values };
  });

  return res.status(200).json({ timestamps, series });
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
  // For active competitions: use current time so scores reflect live progress.
  // For ended competitions: use end_time exactly so scores are frozen.
  const effectiveEnd = now <= endMs
    ? new Date(now).toISOString()
    : comp.end_time;

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

  // Pre-fetch efficiency rates for EHP/EHB competitions.
  // Flatten the stored WOM JSON array into the format expected by computeEHPGained/computeEHBGained.
  let rates = [];
  if (comp.metric === 'ehp') {
    const rateRows = await sql`SELECT game_mode, rates FROM ehp_rates`;
    for (const row of rateRows) {
      const skills = Array.isArray(row.rates) ? row.rates : [];
      for (const entry of skills) {
        const skill = (entry.skill || '').toLowerCase();
        for (const m of (entry.methods || [])) {
          rates.push({ game_mode: row.game_mode, skill, start_exp: Number(m.startExp || 0), rate: Number(m.rate || 0) });
        }
      }
    }
  } else if (comp.metric === 'ehb') {
    const rateRows = await sql`SELECT rates FROM ehb_rates LIMIT 1`;
    if (rateRows.length) {
      const bosses = Array.isArray(rateRows[0].rates) ? rateRows[0].rates : [];
      for (const entry of bosses) {
        const boss = (entry.boss || '').toLowerCase();
        const methods = Array.isArray(entry.methods) && entry.methods.length
          ? entry.methods
          : (entry.rate != null ? [{ startKc: 0, rate: entry.rate }] : []);
        for (const m of methods) {
          rates.push({ boss, start_kc: Number(m.startKc ?? m.startExp ?? 0), rate: Number(m.rate || 0) });
        }
      }
    }
  }

  if (comp.type === 'solo') {
    const participants = await sql`
      SELECT cp.character_id, cp.skill AS participant_skill, c.username, c.game_mode
      FROM competition_participants cp
      JOIN characters c ON c.id = cp.character_id
      WHERE cp.competition_id = ${comp.id}
    `;

    const { startByChar, endByChar } = isUpcoming || !participants.length
      ? { startByChar: {}, endByChar: {} }
      : await fetchSnapshotsSolo(sql, comp.id, comp.start_time, effectiveEnd);

    result.participants = participants.map(p => {
      const { startValue, endValue, delta } = computeValues(
        startByChar[p.character_id] || null,
        endByChar[p.character_id]   || null,
        comp,
        p.participant_skill,
        p.game_mode,
        rates
      );
      const entry = { name: p.username, value: delta, startValue, endValue };
      if (comp.skill_scope === 'specific' && !comp.same_skill_for_all) {
        entry.skill = p.participant_skill || '';
      }
      return entry;
    });

  } else {
    const rows = await sql`
      SELECT ct.id AS team_id, ct.name AS team_name, ct.skill AS team_skill,
             ctm.character_id, c.username, c.game_mode
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
      const { startValue, endValue, delta } = computeValues(
        startByChar[row.character_id] || null,
        endByChar[row.character_id]   || null,
        comp,
        participantSkill,
        row.game_mode,
        rates
      );
      const playerEntry = { name: row.username, value: delta, startValue, endValue };
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

// ── SNAPSHOT HELPERS ──────────────────────────────────────────────────────────

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

async function getCompCharRows(sql, compType, id) {
  if (compType === 'solo') {
    return sql`
      SELECT c.id, c.username
      FROM competition_participants cp
      JOIN characters c ON c.id = cp.character_id
      WHERE cp.competition_id = ${id}
    `;
  }
  return sql`
    SELECT DISTINCT c.id, c.username
    FROM competition_teams ct
    JOIN competition_team_members ctm ON ctm.team_id = ct.id
    JOIN characters c ON c.id = ctm.character_id
    WHERE ct.competition_id = ${id}
  `;
}

async function writeSnapshots(sql, charRows, snapshotAt) {
  const { getStats } = require('osrs-json-hiscores');
  let written = 0;
  const errors = [];
  for (const char of charRows) {
    try {
      const player = await getStats(char.username);
      const data = buildSnapshotData(player);
      if (data) {
        await sql`
          INSERT INTO character_snapshots (character_id, at, data)
          VALUES (${char.id}, ${snapshotAt}, ${JSON.stringify(data)})
        `;
        written++;
      }
    } catch (e) {
      errors.push({ username: char.username, error: (e.message || String(e)).slice(0, 100) });
    }
  }
  return { written, errors };
}

// ── REFRESH SNAPSHOT ──────────────────────────────────────────────────────────
// Fetches live Hiscores for every participant and writes a snapshot at NOW().
// Called by the manual "Refresh Scores" button during an active competition.
async function refreshSnapshotCompetition(req, res, sql, id) {
  const compRows = await sql`SELECT id, type FROM competitions WHERE id = ${id}`;
  if (!compRows.length) return res.status(404).json({ error: 'Competition not found' });

  const charRows = await getCompCharRows(sql, compRows[0].type, id);
  if (!charRows.length) return res.status(200).json({ ok: true, snapshots: 0 });

  const snapshotAt = new Date().toISOString();
  const { written, errors } = await writeSnapshots(sql, charRows, snapshotAt);
  return res.status(200).json({ ok: true, snapshots: written, errors: errors.length ? errors : undefined });
}

// ── FINAL SNAPSHOT ────────────────────────────────────────────────────────────
// Fetches live Hiscores for every participant and writes a snapshot at end_time.
// Called by the frontend when the end countdown hits 0.
async function snapshotCompetition(req, res, sql, id) {
  const compRows = await sql`SELECT id, type, end_time FROM competitions WHERE id = ${id}`;
  if (!compRows.length) return res.status(404).json({ error: 'Competition not found' });

  const charRows = await getCompCharRows(sql, compRows[0].type, id);
  if (!charRows.length) return res.status(200).json({ ok: true, snapshots: 0 });

  const { written, errors } = await writeSnapshots(sql, charRows, compRows[0].end_time);
  return res.status(200).json({ ok: true, snapshots: written, errors: errors.length ? errors : undefined });
}

// ── START SNAPSHOT ────────────────────────────────────────────────────────────
// Fetches live Hiscores for every participant and writes a snapshot at start_time.
// Called by the frontend when the start countdown hits 0 (upcoming → active).
async function startSnapshotCompetition(req, res, sql, id) {
  const compRows = await sql`SELECT id, type, start_time FROM competitions WHERE id = ${id}`;
  if (!compRows.length) return res.status(404).json({ error: 'Competition not found' });

  const charRows = await getCompCharRows(sql, compRows[0].type, id);
  if (!charRows.length) return res.status(200).json({ ok: true, snapshots: 0 });

  const { written, errors } = await writeSnapshots(sql, charRows, compRows[0].start_time);
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

  // ID comes from ?compId= query param (path segments not reliable in non-Next.js Vercel).
  // Action comes from ?action= query param (e.g. 'snapshot', 'save-rates').
  const id     = req.query.compId ? parseInt(req.query.compId, 10) : null;
  const action = req.query.action || null;

  try {
    if (!id || isNaN(id)) {
      if (req.method === 'GET')  return await listCompetitions(req, res, sql);
      if (req.method === 'POST') {
        if (action === 'save-rates') return await saveRates(req, res, sql);
        return await createCompetition(req, res, sql);
      }
    } else if (action === 'snapshot') {
      if (req.method === 'POST') return await snapshotCompetition(req, res, sql, id);
    } else if (action === 'start-snapshot') {
      if (req.method === 'POST') return await startSnapshotCompetition(req, res, sql, id);
    } else if (action === 'refresh') {
      if (req.method === 'POST') return await refreshSnapshotCompetition(req, res, sql, id);
    } else if (action === 'chart-history') {
      if (req.method === 'GET') return await getChartHistory(req, res, sql, id);
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
