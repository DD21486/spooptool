// Local preview server for the 3D raid and spoop pages, no database needed.
// Serves public/ and stands in for /api/spoops with the real fight engine running on a made-up
// roster in varied gear, so any boss fight can be run and watched locally.
//
//   node scripts/raid3d-dev.js [port]      then open http://localhost:4791/raid3d.html
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 4791);
const e = require(ROOT + '/lib/spoop/engine');
const { xpForLevel } = require(ROOT + '/lib/xpTable');
const state = e.createWorld(new Date('2026-11-20T12:00:00Z'));
const data = require(ROOT + '/lib/spoop/data');
const { OSRS_IDS } = require(ROOT + '/lib/spoop/item-ids');
const ALL = [].concat(data.DHIDE, data.CLOTH, data.CUSTOM_HELMS, data.NAMED_GEAR, data.MEGA_RARES);
function piece(ref, quality) {
  // 'rune:platebody' for plain metal, or a named item id.
  if (ref.indexOf(':') > 0) {
    const [tier, baseId] = ref.split(':');
    const style = { shortbow: 'ranged', staff: 'magic' }[baseId] || (['dagger', 'sword', 'longsword', 'scimitar', 'mace'].includes(baseId) ? 'melee' : null);
    const slot = { 'med-helm': 'head', 'full-helm': 'head', platebody: 'body', platelegs: 'legs', kiteshield: 'shield', boots: 'boots', gloves: 'gloves', cape: 'cape', amulet: 'neck', ring: 'ring', ammo: 'ammo' }[baseId] || 'weapon';
    return { slot, baseId, baseName: baseId, tier, style, quality: quality || 'standard', osrsId: OSRS_IDS[baseId][tier] };
  }
  const row = ALL.find((r) => r.id === ref);
  if (!row) throw new Error('no item ' + ref);
  return { slot: row.slot, baseId: row.baseId || row.id, baseName: row.name, tier: row.tier || 'rune', style: row.style || null, quality: quality || 'standard', osrsId: row.osrsId, hide: row.hide, cloth: row.cloth, shape: row.shape, plainName: true };
}
const looks = [
  ['rune:scimitar', 'rune:platebody', 'rune:platelegs', 'rune:full-helm', 'rune:kiteshield', 'fire-cape', 'rune:boots', 'glory'],
  ['armadyl-crossbow', 'arma-helm', 'arma-body', 'arma-legs', 'avas-accumulator', 'ranger-boots', 'blue-dhide-vambs', 'diamond-bolts'],
  ['nightmare-staff', 'ancestral-hat', 'ancestral-top', 'ancestral-bottom', 'arcane', 'imbued-sara', 'eternals', 'tormented', 'occult'],
  ['ags', 'torva-helm', 'torva-body', 'torva-legs', 'infernal-cape', 'prims', 'ferocious', 'torture'],
  ['whip', 'faceguard', 'bandos-body', 'bandos-legs', 'dragon-defender', 'barrows-gloves', 'dragon-boots', 'fury'],
  ['dragon-warhammer', 'dharok-helm', 'dharok-body', 'dharok-legs', 'mythical-cape'],
  ['twisted-bow', 'masori-mask', 'masori-body', 'masori-legs', 'dizana', 'pegs', 'zaryte-vambs', 'anguish', 'dragon-arrows'],
  ['trident', 'infinity-hat', 'infinity-top', 'infinity-bottom', 'tome-fire', 'saradomin-cape', 'infinity-boots'],
  ['scythe', 'serpentine', 'justiciar-body', 'justiciar-legs', 'avernic', 'infernal-max', 'avernic-treads', 'blood-fury'],
  ['toxic-sotd', 'virtus-mask', 'virtus-top', 'virtus-bottom', 'elysian', 'sara-max'],
];
Object.values(state.spoops).forEach((spoop, i) => {
  Object.keys(spoop.equipped).forEach((slot) => { spoop.equipped[slot] = null; });
  (looks[i % looks.length] || []).forEach((ref, n) => {
    const item = piece(ref, n === 0 ? ['fine', 'tempered', 'masterwork', 'standard'][i % 4] : 'standard');
    item.id = 900 + i * 20 + n;
    spoop.equipped[item.slot] = item;
  });
  const lv = 70 + (i * 7) % 29;
  ['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer'].forEach((id) => { spoop.skills[id] = xpForLevel(lv); });
  spoop.skills.hitpoints = xpForLevel(lv + 5);
  const w = spoop.equipped.weapon;
  spoop.build = (w && w.style) || 'melee';
});
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json' };
let devRaid = null;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // A stand-in for the arena card: the whole roster runs a 4-boss raid that starts when first asked for.
  if (url.pathname === '/api/arena') {
    if (!devRaid) {
      const night = e.testRaidNight(state, [], 'dev-' + Date.now());
      devRaid = { kind: 'raid', hasReplay: true, at: new Date().toISOString(), revealAt: new Date(Date.now() + 1000).toISOString(), showMs: 1000, raid: night };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ last: devRaid, special: null, serverNow: new Date().toISOString() }));
  }
  if (url.pathname === '/api/spoops') {
    if (req.method === 'GET') {
      if (url.searchParams.get('icon')) { res.writeHead(404); return res.end(); }
      const world = e.presentWorld(state, false, []);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(world));
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      const r = String(b.boss || '') === 'raid'
        ? e.testRaidNight(state, b.names || [], String(b.seed || Date.now()))
        : e.testRaid(state, b.names || [], String(b.seed || Date.now()), b.boss, b.tier);
      res.writeHead(r.error ? 400 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r.error ? { error: r.error } : r));
    });
    return;
  }
  const file = path.join(ROOT, 'public', decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('dev server on http://localhost:' + PORT + '/raid3d.html'));
