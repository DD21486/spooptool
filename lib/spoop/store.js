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

module.exports = { load, save, FILE };
