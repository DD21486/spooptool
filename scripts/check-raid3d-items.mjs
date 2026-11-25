// Every id the game can put in an equipment slot must have a 3D look in public/js/raid3d/items.js.
//   node scripts/check-raid3d-items.mjs
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const P = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raid3d-items-'));
const require = createRequire(import.meta.url);
const d = require(P + '/lib/spoop/data.js');
const { OSRS_IDS } = require(P + '/lib/spoop/item-ids.js');
// items.js is an ES module in a CommonJS package, so load a .mjs copy of it.
fs.copyFileSync(P + '/public/js/raid3d/items.js', tmp + '/items.mjs');
const { itemSpec } = await import('file://' + tmp + '/items.mjs');
const ids = new Map();
for (const [b, row] of Object.entries(OSRS_IDS)) for (const [t, id] of Object.entries(row)) ids.set(id, t + ' ' + b);
for (const L of ['DHIDE', 'CLOTH', 'CUSTOM_HELMS', 'NAMED_GEAR', 'MEGA_RARES']) for (const r of d[L]) if (r.osrsId) ids.set(r.osrsId, r.name);
const missing = [...ids].filter(([id]) => !itemSpec(id));
console.log(ids.size + ' ids, ' + missing.length + ' missing');
missing.forEach(([id, n]) => console.log('  ' + id + ' ' + n));
process.exit(missing.length ? 1 : 0);
