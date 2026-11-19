const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { createWorld, applyRosterNames, ensureRoster, ensureStarterGear, ensureMegaRares, grantGoldGift, LOG_KEEP, arenaSnapshot } = require('./engine');

const FILE = path.join(__dirname, '../../data/spoop-state.json');

let sqlClient = null;
let tableReady = null;
let backend = null;

function databaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

function db() {
  if (!sqlClient) sqlClient = neon(databaseUrl());
  return sqlClient;
}

function ensureTable() {
  if (!tableReady) {
    const sql = db();
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS spoop_world (
        id smallint PRIMARY KEY,
        state jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `.then(() => sql`
      ALTER TABLE spoop_world ADD COLUMN IF NOT EXISTS arena_card jsonb
    `).then(() => sql`
      CREATE TABLE IF NOT EXISTS spoop_replay (
        id text PRIMARY KEY,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `).catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

function slimArenaCard(snap) {
  if (!snap || typeof snap !== 'object') return snap;
  if (snap.last) {
    const bout = snap.last.bout;
    const tourney = snap.last.tournament;
    const raid = snap.last.raid;
    snap.last = Object.assign({}, snap.last, {
      bout: null,
      tournament: null,
      raid: null,
      hasReplay: !!(snap.last.hasReplay || bout || tourney || raid),
      boutDuration: bout && bout.duration != null ? Number(bout.duration) || 0 : (Number(snap.last.boutDuration) || 0),
      showMs: snap.last.showMs || (tourney && tourney.showMs) || 0,
    });
  }
  if (snap.lastPk) {
    const bout = snap.lastPk.bout;
    snap.lastPk = Object.assign({}, snap.lastPk, {
      bout: null,
      hasReplay: !!(snap.lastPk.hasReplay || bout),
      boutDuration: bout && bout.duration != null ? Number(bout.duration) || 0 : (Number(snap.lastPk.boutDuration) || 0),
    });
  }
  return snap;
}

function cardFor(state) {
  try {
    return slimArenaCard(arenaSnapshot(state));
  } catch (err) {
    console.error('arena card', err.message || err);
    return null;
  }
}

function packForStore(state) {
  const packed = JSON.parse(JSON.stringify(state));
  const replays = { arena: null, pk: null };
  for (const spoop of Object.values(packed.spoops || {})) {
    if (Array.isArray(spoop.log) && spoop.log.length > LOG_KEEP) spoop.log.length = LOG_KEEP;
  }
  const last = packed.lastArena;
  if (last && (last.bout || last.tournament || last.raid)) {
    replays.arena = {
      bout: last.bout || null,
      tournament: last.tournament || null,
      raid: last.raid || null,
    };
    last.hasReplay = true;
    if (last.bout && last.bout.duration != null) last.boutDuration = Number(last.bout.duration) || 0;
    if (!last.showMs && last.tournament && last.tournament.showMs) last.showMs = last.tournament.showMs;
    last.bout = null;
    last.tournament = null;
    last.raid = null;
  }
  const pk = packed.lastPk;
  if (pk && pk.bout) {
    replays.pk = pk.bout;
    pk.hasReplay = true;
    if (pk.bout.duration != null) pk.boutDuration = Number(pk.bout.duration) || 0;
    pk.bout = null;
  }
  return { packed, replays };
}

async function writeReplays(replays) {
  const sql = db();
  if (replays && replays.arena) {
    const json = JSON.stringify(replays.arena);
    await sql`
      INSERT INTO spoop_replay (id, payload, updated_at)
      VALUES ('arena', ${json}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
  }
  if (replays && replays.pk) {
    const json = JSON.stringify(replays.pk);
    await sql`
      INSERT INTO spoop_replay (id, payload, updated_at)
      VALUES ('pk', ${json}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
  }
}

async function persist(state, { expectedClock, fightAt } = {}) {
  await ensureTable();
  const { packed, replays } = packForStore(state);
  const json = JSON.stringify(packed);
  const cardJson = JSON.stringify(cardFor(state));
  const sql = db();
  let rows;
  if (fightAt && expectedClock) {
    rows = await sql`
      UPDATE spoop_world
      SET state = ${json}::jsonb, arena_card = ${cardJson}::jsonb, updated_at = NOW()
      WHERE id = 1
        AND state->>'clock' = ${expectedClock}
        AND state->'pk'->>'fightAt' = ${fightAt}
      RETURNING id
    `;
  } else if (expectedClock) {
    rows = await sql`
      UPDATE spoop_world
      SET state = ${json}::jsonb, arena_card = ${cardJson}::jsonb, updated_at = NOW()
      WHERE id = 1 AND state->>'clock' = ${expectedClock}
      RETURNING id
    `;
  } else {
    await sql`
      INSERT INTO spoop_world (id, state, arena_card, updated_at)
      VALUES (1, ${json}::jsonb, ${cardJson}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
        SET state = EXCLUDED.state, arena_card = EXCLUDED.arena_card, updated_at = NOW()
    `;
    rows = [{ id: 1 }];
  }
  if (rows.length > 0) await writeReplays(replays);
  return rows.length > 0;
}

function parseState(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (err) { return null; }
  }
  return value;
}

function usable(state) {
  return !!(state && state.spoops && state.spoops.SpoopSpooply && state.clock && !state.useSim);
}

function readFileState() {
  try {
    const state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return usable(state) ? state : null;
  } catch (err) {
    if (err && err.code !== 'ENOENT') console.error('spoop state read', err.message || err);
    return null;
  }
}

function prepare(state) {
  if (!state || !state.spoops || !state.spoops.SpoopSpooply || !state.clock) {
    return { state: createWorld(new Date()), dirty: true };
  }
  if (typeof state.useSim !== 'boolean') state.useSim = false;
  applyRosterNames(state);
  const tagged = ensureMegaRares(state);
  const dirty = ensureRoster(state) || ensureStarterGear(state) || grantGoldGift(state) || tagged;
  return { state, dirty };
}

function saveFile(state) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
    return true;
  } catch (err) {
    console.error('spoop state save', err.message || err);
    return false;
  }
}

async function loadFile() {
  const { state, dirty } = prepare(readFileState() || createWorld(new Date()));
  if (dirty) saveFile(state);
  return state;
}

async function save(state, expectedClock) {
  if (backend === 'file' || !databaseUrl()) return saveFile(state);
  return persist(state, { expectedClock: expectedClock || null });
}

async function loadDb() {
  await ensureTable();
  let rows = await db()`SELECT state FROM spoop_world WHERE id = 1`;
  if (!rows.length) {
    const seeded = readFileState() || createWorld(new Date());
    await db()`
      INSERT INTO spoop_world (id, state, updated_at)
      VALUES (1, ${JSON.stringify(seeded)}::jsonb, NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    rows = await db()`SELECT state FROM spoop_world WHERE id = 1`;
  }
  const { state, dirty } = prepare(parseState(rows[0] && rows[0].state));
  if (dirty) await save(state, state.clock);
  return state;
}

async function load() {
  if (backend === 'file' || !databaseUrl()) return loadFile();
  try {
    const state = await loadDb();
    backend = 'db';
    return state;
  } catch (err) {
    console.error('spoop state db', err.message || err);
    backend = 'file';
    return loadFile();
  }
}

async function peekArenaCard() {
  if (!databaseUrl() || backend === 'file') return null;
  await ensureTable();
  const rows = await db()`SELECT arena_card FROM spoop_world WHERE id = 1`;
  return parseState(rows[0] && rows[0].arena_card);
}

async function loadReplays() {
  if (!databaseUrl() || backend === 'file') return { arena: null, pk: null };
  await ensureTable();
  const rows = await db()`SELECT id, payload FROM spoop_replay WHERE id IN ('arena', 'pk')`;
  const out = { arena: null, pk: null };
  for (const row of rows) out[row.id] = parseState(row.payload);
  return out;
}

function attachReplays(state, replays) {
  if (!state || !replays) return state;
  const arena = replays.arena;
  if (arena && state.lastArena) {
    if (arena.bout) state.lastArena.bout = arena.bout;
    if (arena.tournament) state.lastArena.tournament = arena.tournament;
    if (arena.raid) state.lastArena.raid = arena.raid;
  }
  if (replays.pk && state.lastPk) state.lastPk.bout = replays.pk;
  return state;
}

let reminderTableReady = null;
function ensureReminderTable() {
  if (!reminderTableReady) {
    reminderTableReady = db()`
      CREATE TABLE IF NOT EXISTS spoop_arena_reminder (
        fight_at timestamptz NOT NULL,
        mark text NOT NULL,
        PRIMARY KEY (fight_at, mark)
      )
    `.catch((err) => {
      reminderTableReady = null;
      throw err;
    });
  }
  return reminderTableReady;
}

let fileClaim = Promise.resolve();

function claimFile(fightAt, id) {
  const run = fileClaim.then(() => {
    const state = readFileState();
    if (!state) return false;
    const rec = state.arenaReminders && state.arenaReminders.fightAt === fightAt
      ? state.arenaReminders
      : { fightAt, sent: [] };
    const sent = Array.isArray(rec.sent) ? rec.sent : [];
    if (sent.includes(id)) return false;
    state.arenaReminders = { fightAt, sent: sent.concat(id) };
    return saveFile(state);
  });
  fileClaim = run.then(() => {}, () => {});
  return run;
}

function releaseFile(fightAt, id) {
  const run = fileClaim.then(() => {
    const state = readFileState();
    if (!state || !state.arenaReminders || state.arenaReminders.fightAt !== fightAt) return;
    const sent = (state.arenaReminders.sent || []).filter((mark) => mark !== id);
    state.arenaReminders = { fightAt, sent };
    saveFile(state);
  });
  fileClaim = run.then(() => {}, () => {});
  return run;
}

async function claimArenaReminder(fightAt, id) {
  if (backend === 'file' || !databaseUrl()) return claimFile(fightAt, id);
  await ensureReminderTable();
  const rows = await db()`
    INSERT INTO spoop_arena_reminder (fight_at, mark)
    VALUES (${fightAt}, ${id})
    ON CONFLICT DO NOTHING
    RETURNING mark
  `;
  return rows.length > 0;
}

async function releaseArenaReminder(fightAt, id) {
  if (backend === 'file' || !databaseUrl()) return releaseFile(fightAt, id);
  await ensureReminderTable();
  await db()`
    DELETE FROM spoop_arena_reminder
    WHERE fight_at = ${fightAt} AND mark = ${id}
  `;
}

async function savePkResolution(state, expectedClock, fightAt) {
  if (!expectedClock || !fightAt) return false;
  if (backend === 'file' || !databaseUrl()) {
    const current = readFileState();
    if (!current || current.clock !== expectedClock) return false;
    if (!current.pk || current.pk.fightAt !== fightAt) return false;
    return saveFile(state);
  }
  return persist(state, { expectedClock, fightAt });
}

function keepReminderMarks(state) {
  if (!state || (backend !== 'file' && databaseUrl())) return state;
  const current = readFileState();
  if (current && current.arenaReminders) state.arenaReminders = current.arenaReminders;
  return state;
}

module.exports = {
  load,
  save,
  savePkResolution,
  peekArenaCard,
  loadReplays,
  attachReplays,
  claimArenaReminder,
  releaseArenaReminder,
  keepReminderMarks,
  packForStore,
  FILE,
};
