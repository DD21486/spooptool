const fs = require('fs');
const path = require('path');
const { createWorld, applyRosterNames, ensureStarterGear } = require('./engine');

const FILE = path.join(__dirname, '../../data/spoop-state.json');

function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const state = JSON.parse(raw);
    if (!state || !state.spoops || !state.spoops.SpoopSpooply || !state.clock) {
      return createWorld(new Date());
    }
    if (typeof state.useSim !== 'boolean') state.useSim = false;
    const named = applyRosterNames(state);
    if (ensureStarterGear(named)) save(named);
    return named;
  } catch (err) {
    if (err && err.code !== 'ENOENT') console.error('spoop state read', err.message || err);
    return createWorld(new Date());
  }
}

function save(state) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    console.error('spoop state save', err.message || err);
  }
}

module.exports = { load, save, FILE };
