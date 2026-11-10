const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { createWorld, applyRosterNames, ensureRoster, ensureStarterGear } = require('./engine');

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
    tableReady = db()`
      CREATE TABLE IF NOT EXISTS spoop_world (
        id smallint PRIMARY KEY,
        state jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `.catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
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
  const dirty = ensureRoster(state) || ensureStarterGear(state);
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
  await ensureTable();
  const json = JSON.stringify(state);
  if (expectedClock) {
    const rows = await db()`
      UPDATE spoop_world
      SET state = ${json}::jsonb, updated_at = NOW()
      WHERE id = 1 AND state->>'clock' = ${expectedClock}
      RETURNING id
    `;
    return rows.length > 0;
  }
  await db()`
    INSERT INTO spoop_world (id, state, updated_at)
    VALUES (1, ${json}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
  `;
  return true;
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
  await ensureTable();
  const json = JSON.stringify(state);
  const rows = await db()`
    UPDATE spoop_world
    SET state = ${json}::jsonb, updated_at = NOW()
    WHERE id = 1
      AND state->>'clock' = ${expectedClock}
      AND state->'pk'->>'fightAt' = ${fightAt}
    RETURNING id
  `;
  return rows.length > 0;
}

function keepReminderMarks(state) {
  if (!state || (backend !== 'file' && databaseUrl())) return state;
  const current = readFileState();
  if (current && current.arenaReminders) state.arenaReminders = current.arenaReminders;
  return state;
}

module.exports = { load, save, savePkResolution, claimArenaReminder, releaseArenaReminder, keepReminderMarks, FILE };
