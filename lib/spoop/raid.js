/** Raid bosses. The party fights these one at a time.
 *  A tier is built for a combat level, plus the gear someone at that level usually wears.
 *  Hits are a share of that combat level. Health is what that kit would take the design time to burn.
 *  Higher tiers telegraph less, swing faster, and pay more. Loot is a generic armor pocket, plus a few boss extras.
 *  osrsId is the wiki sprite used when the loot reel rolls.
 */

const { ARMOR, WEAPONS, DHIDE, CLOTH, CUSTOM_HELMS, NAMED_GEAR, TIERS } = require('./data');
const { osrsIdFor } = require('./item-ids');

const ARMOR_SLOTS = new Set(['head', 'body', 'legs', 'shield', 'boots']);
const TIER_NAME = {};
TIERS.forEach((tier) => { TIER_NAME[tier.id] = tier.name; });

// level is the combat the fight is built for. God sits past 126, so the extra is gear.
// length stretches the kill. telegraph, haste, and blunder are how forgiving the dodges are.
// gold is the pile the living split. It does not grow with the party.
const RAID_TIERS = [
  { id: 'trivial', name: 'Trivial', level: 55, length: 0.9, telegraph: 1.08, haste: 0.9, blunder: 0.12, gold: 10000 },
  { id: 'easy', name: 'Easy', level: 70, length: 0.96, telegraph: 1.04, haste: 0.94, blunder: 0.14, gold: 20000 },
  { id: 'medium', name: 'Medium', level: 85, length: 1, telegraph: 1, haste: 1, blunder: 0.16, gold: 35000 },
  { id: 'tough', name: 'Tough', level: 95, length: 1.06, telegraph: 0.94, haste: 1.05, blunder: 0.2, gold: 60000 },
  { id: 'hard', name: 'Hard', level: 105, length: 1.12, telegraph: 0.88, haste: 1.1, blunder: 0.24, gold: 90000 },
  { id: 'elite', name: 'Elite', level: 115, length: 1.18, telegraph: 0.82, haste: 1.16, blunder: 0.3, gold: 120000 },
  { id: 'master', name: 'Master', level: 125, length: 1.24, telegraph: 0.76, haste: 1.22, blunder: 0.36, gold: 150000 },
  { id: 'god', name: 'God', level: 140, length: 1.32, telegraph: 0.68, haste: 1.3, blunder: 0.44, gold: 250000 },
];

const BRUTUS = {
  id: 'brutus',
  name: 'Brutus',
  monster: 'brutus',
  tiers: ['trivial', 'easy', 'medium', 'tough', 'hard'],
  adds: 'cows',
  sprite: '/assets/bosses/Brutus.png',
  face: 'left',
  hp: null,
  minHp: 70,
  maxHp: 50000,
  fightSeconds: 56,
  defence: 36,
  level: 286,
  levelAt: 85,
  radius: 7.2,
  speed: 3.4,
  chargeSpeed: 62,
  opener: 3.6,
  hpCut: 75,
  loot: [
    { name: 'Bones', weight: 8, osrsId: 526 },
    { name: 'Big bones', weight: 5, osrsId: 532 },
    { name: 'Raw beef', weight: 6, osrsId: 2132 },
    { name: 'Cowhide', weight: 5, osrsId: 1739 },
    { name: 'Leather', weight: 4, osrsId: 1741 },
    { name: 'Bullroarer', weight: 2, osrsId: 716 },
  ],
  attacks: [
    { id: 'stomp', kind: 'circle', label: 'STOMP', verb: 'stomps', warn: 1.05, radius: 11.6, damage: [0.26, 0.38], cooldown: 2.5 },
    { id: 'toss', kind: 'mark', label: 'HORN', verb: 'hurls a horn at', warn: 1.28, radius: 5.2, damage: [0.18, 0.28], cooldown: 2.3, aim: 'far' },
    { id: 'charge', kind: 'lane', label: 'CHARGE', verb: 'charges', warn: 0.98, width: 11, reach: 30, damage: [0.34, 0.5], cooldown: 2.7, aim: 'any' },
  ],
};

const MOLE = {
  id: 'mole',
  name: 'Giant Mole',
  monster: 'mole',
  tiers: ['trivial', 'easy', 'medium', 'tough', 'hard'],
  sprite: '/assets/bosses/Giant_mole.png',
  face: 'left',
  hp: null,
  minHp: 64,
  maxHp: 50000,
  fightSeconds: 50,
  defence: 32,
  level: 230,
  levelAt: 85,
  radius: 5.1,
  speed: 4.8,
  chargeSpeed: 54,
  opener: 3.2,
  loot: [
    { name: 'Big bones', weight: 8, osrsId: 532 },
    { name: 'Mole skin', weight: 6, osrsId: 7418 },
    { name: 'Mole claw', weight: 4, osrsId: 7416 },
    { name: 'Baby mole', weight: 1, osrsId: 12646, rare: true },
  ],
  attacks: [
    { id: 'claw', kind: 'circle', label: 'CLAW', verb: 'claws', warn: 0.98, radius: 8.4, damage: [0.22, 0.34], cooldown: 2.2 },
    { id: 'dirt', kind: 'mark', label: 'DIRT', verb: 'flings dirt at', warn: 1.2, radius: 4.8, damage: [0.16, 0.26], cooldown: 2.15, aim: 'far' },
    { id: 'burrow', kind: 'burrow', label: 'DIG', verb: 'erupts under', warn: 1.15, radius: 9.2, damage: [0.3, 0.46], cooldown: 2.5, aim: 'any' },
  ],
};

const SCURRIUS = {
  id: 'scurrius',
  name: 'Scurrius',
  monster: 'scurrius',
  tiers: ['trivial', 'easy', 'medium', 'tough', 'hard'],
  adds: 'rats',
  sprite: '/assets/bosses/scurrius.png',
  face: 'left',
  hp: null,
  minHp: 70,
  maxHp: 50000,
  fightSeconds: 62,
  defence: 34,
  level: 252,
  levelAt: 105,
  radius: 6.2,
  speed: 4.2,
  chargeSpeed: 54,
  opener: 3.4,
  rats: {
    every: 9,
    first: 8,
    pack: 2,
    cap: 3,
    hp: 0.48,
    damage: [0.045, 0.07],
    speed: 5.1,
    radius: 1.6,
  },
  loot: [
    { name: 'Bones', weight: 8, osrsId: 526 },
    { name: 'Raw rat meat', weight: 6, osrsId: 2134 },
    { name: 'Bone mace', weight: 2, osrsId: 28792, rare: true },
  ],
  attacks: [
    { id: 'bite', kind: 'circle', label: 'BITE', verb: 'bites', warn: 0.95, radius: 7.6, damage: [0.2, 0.32], cooldown: 2.15 },
    { id: 'rocks', kind: 'rocks', label: 'ROCKS', verb: 'drops a rock on', warn: 1.35, radius: 3.6, count: 4, damage: [0.16, 0.26], cooldown: 2.45 },
    {
      id: 'barrage',
      kind: 'barrage',
      label: 'BARRAGE',
      verb: 'fires at',
      warn: 1.2,
      radius: 3.8,
      damage: [0.28, 0.42],
      cooldown: 2.8,
      shots: [
        { label: 'SPINE', tone: 'spine', verb: 'fires a spine at' },
        { label: 'BOLT', tone: 'bolt', verb: 'fires a bolt at' },
        { label: 'BLAST', tone: 'blast', verb: 'blasts' },
      ],
    },
  ],
};

// A random raid is four bosses, easiest first. Each slot rolls a tier off its weights,
// then a boss whose tiers list has that tier, never the same boss twice.
// A boss with adds gets that skirmish right before it. A new boss only needs tiers to join the draw.
const TONIGHT_SLOTS = [
  { easy: 1, medium: 1 },
  { medium: 1 },
  { tough: 1 },
  { tough: 55, hard: 30, elite: 10, master: 5 },
];
const TIER_ORDER = ['trivial', 'easy', 'medium', 'tough', 'hard', 'elite', 'master', 'god'];

// Added to every pot on top of the tier or swarm gold, split by whoever is alive at the end.
const BOSS_KILL_GOLD = 40000;
const STAGE_CLEAR_GOLD = 20000;

const SWARMS = {
  cows: {
    id: 'cows',
    name: 'Cows',
    unit: 'Cow',
    monster: 'cow',
    sprite: '/assets/bosses/Cow.png',
    face: 'left',
    scene: 'is-pasture',
    count: 11,
    every: 0,
    wave: { count: 6, at: 10 },
    level: 6,
    hp: 16,
    damage: [1, 3],
    defence: 2,
    speed: 3.2,
    radius: 1.5,
    nip: 3.1,
    gold: 4000,
    verb: 'kicks',
  },
  rats: {
    id: 'rats',
    name: 'Giant rats',
    unit: 'Giant rat',
    monster: 'rat',
    sprite: '/assets/pets/Giant_rat.png',
    face: 'left',
    scene: 'is-sewer',
    count: 12,
    every: 0,
    level: 14,
    hp: 14,
    damage: [1, 3],
    defence: 2,
    speed: 4.8,
    radius: 1.15,
    nip: 2.6,
    gold: 6000,
    verb: 'nips',
  },
};

// Easy. Slash up close, then dragonfire: a breath down a lane, and a spit at whoever is far.
// She can breathe at range, which is the part that makes her worse than a normal green dragon.
// The swipe is a cone: she spins for the first spin share of the warn, then locks a random way.
// arc is the half-angle in degrees.
const ELVARG = {
  id: 'elvarg',
  name: 'Elvarg',
  monster: 'elvarg',
  home: 'easy',
  tiers: ['easy'],
  sprite: '/assets/bosses/Elvarg.png',
  scene: 'is-crandor',
  face: 'left',
  hp: null,
  minHp: 60,
  maxHp: 50000,
  fightSeconds: 44,
  defence: 26,
  level: 168,
  levelAt: 70,
  radius: 6.2,
  speed: 2.8,
  chargeSpeed: 40,
  opener: 3.6,
  loot: [
    { name: 'Bones', weight: 8, osrsId: 526 },
    { name: 'Green d\'hide body', weight: 4, osrsId: 1135 },
    { name: 'Rune longsword', weight: 3, osrsId: 1305 },
    { name: 'Anti-dragon shield', weight: 2, osrsId: 1540, rare: true },
  ],
  attacks: [
    { id: 'slash', kind: 'circle', label: 'SLASH', verb: 'slashes', style: 'melee', warn: 1.12, radius: 7.4, damage: [0.14, 0.22], cooldown: 2.35 },
    { id: 'fire', kind: 'lane', hold: true, tone: 'fire', label: 'FIRE', verb: 'breathes fire on', style: 'magic', warn: 1.22, width: 9, reach: 24, damage: [0.28, 0.42], cooldown: 2.55, aim: 'any' },
    { id: 'swipe', kind: 'cone', tone: 'swipe', label: 'SWIPE', verb: 'swipes', style: 'melee', warn: 1.8, spin: 0.55, radius: 17, arc: 45, damage: [0.26, 0.31], cooldown: 2.6 },
    { id: 'fire', kind: 'mark', tone: 'fire', label: 'FIRE', verb: 'breathes fire on', style: 'magic', warn: 1.16, radius: 4.6, damage: [0.2, 0.32], cooldown: 2.3, aim: 'far' },
  ],
};

// Hard is the fight she is built for. Elite is the same cloud, meaner.
// Discord is the three-colour hit. Confusion throws you west.
// Madness turns you on the party: for mad seconds you chase and hit whoever is nearest.
const CHAOS = {
  id: 'chaos',
  name: 'Chaos Elemental',
  monster: 'chaos',
  home: 'hard',
  tiers: ['hard', 'elite'],
  sprite: '/assets/bosses/ChaosElemental.png',
  scene: 'is-wild',
  face: 'left',
  hp: null,
  minHp: 80,
  maxHp: 50000,
  fightSeconds: 62,
  defence: 40,
  level: 305,
  levelAt: 105,
  radius: 6.4,
  speed: 3.6,
  chargeSpeed: 48,
  opener: 3.2,
  loot: [
    { name: 'Dragon 2h sword', weight: 3, osrsId: 7158 },
    { name: 'Dragon pickaxe', weight: 2, osrsId: 11920 },
    { name: 'Pet chaos elemental', weight: 1, osrsId: 11995, rare: true },
  ],
  attacks: [
    {
      id: 'discord',
      kind: 'barrage',
      label: 'DISCORD',
      verb: 'hurls discord at',
      warn: 1.08,
      radius: 4.2,
      damage: [0.22, 0.36],
      cooldown: 2.15,
      shots: [
        { label: 'DISCORD', tone: 'discord-magic', verb: 'hurls discord at', style: 'magic' },
        { label: 'DISCORD', tone: 'discord-magic', verb: 'hurls discord at', style: 'magic' },
        { label: 'DISCORD', tone: 'discord-range', verb: 'hurls discord at', style: 'ranged' },
        { label: 'DISCORD', tone: 'discord-melee', verb: 'hurls discord at', style: 'melee' },
      ],
    },
    { id: 'confusion', kind: 'mark', effect: 'blink', label: 'CONFUSION', verb: 'flings', style: 'magic', warn: 1.12, radius: 5.2, damage: [0.1, 0.18], cooldown: 2.4, aim: 'any' },
    { id: 'madness', kind: 'mark', effect: 'madness', mad: 5, label: 'MADNESS', verb: 'drives mad', style: 'magic', warn: 1.2, radius: 4.8, damage: [0, 0], cooldown: 2.7, aim: 'any' },
  ],
};

// The lure stays in the middle of the pool. Orbs are the real volley
// (blue magic, green ranged, orange melee), rocks stay where they land,
// the roar washes everyone to the wall for a chip of 1, and smoke only
// lands if a rock is not between you and him. The bite is the pool edge.
const LEVIATHAN = {
  id: 'leviathan',
  name: 'The Leviathan',
  monster: 'leviathan',
  home: 'master',
  tiers: ['master'],
  rooted: true,
  sprite: '/assets/bosses/Leviathan.png',
  scene: 'is-pool',
  face: 'left',
  hp: null,
  minHp: 200,
  maxHp: 50000,
  fightSeconds: 72,
  defence: 48,
  level: 798,
  levelAt: 125,
  radius: 7.4,
  speed: 0,
  chargeSpeed: 0,
  opener: 3.4,
  loot: [
    { name: 'Chromium ingot', weight: 4, osrsId: 28276 },
    { name: "Leviathan's lure", weight: 2, osrsId: 28325, rare: true },
    { name: 'Venator vestige', weight: 2, osrsId: 28283, rare: true },
    { name: "Lil'viathan", weight: 1, osrsId: 28252, rare: true },
  ],
  attacks: [
    { id: 'orb', kind: 'barrage', label: 'ORB', verb: 'spits an orb at', warn: 1.05, radius: 4.1, damage: [0.16, 0.28], cooldown: 1.7,
      shots: [
        { label: 'MAGIC', tone: 'orb-magic', verb: 'spits an orb at', style: 'magic' },
        { label: 'RANGE', tone: 'orb-range', verb: 'spits an orb at', style: 'ranged' },
        { label: 'MELEE', tone: 'orb-melee', verb: 'spits an orb at', style: 'melee' },
        { label: 'MAGIC', tone: 'orb-magic', verb: 'spits an orb at', style: 'magic' },
      ] },
    { id: 'rocks', kind: 'rocks', effect: 'settle', label: 'ROCKS', verb: 'drops rocks on', style: 'ranged', warn: 1.15, radius: 4.4, damage: [0.14, 0.22], cooldown: 2.05 },
    { id: 'roar', kind: 'circle', effect: 'wash', flat: 1, tone: 'wave', label: 'ROAR', verb: 'roars', style: 'magic', warn: 1.35, radius: 48, damage: [1, 1], cooldown: 2.5 },
    { id: 'bite', kind: 'circle', label: 'BITE', verb: 'bites', style: 'melee', warn: 0.7, radius: 15, damage: [0.22, 0.38], cooldown: 1.9 },
    { id: 'smoke', kind: 'circle', effect: 'smoke', tone: 'smoke', label: 'SMOKE', verb: 'blasts', style: 'magic', warn: 1.28, radius: 48, damage: [0.26, 0.4], cooldown: 2.45 },
  ],
};

const NAME_WORDS = {
  mole: ['Burrow', 'Dirt', 'Park'],
  brutus: ['Bull', 'Horn', 'Pasture'],
  scurrius: ['Sewer', 'Rat', 'Bone'],
  elvarg: ['Crandor', 'Cave', 'Dragon'],
  chaos: ['Cloud', 'Wild', 'Element'],
  leviathan: ['Pool', 'Lure', 'Strangle'],
};

const RAID_BOSSES = {
  brutus: BRUTUS,
  mole: MOLE,
  scurrius: SCURRIUS,
  elvarg: ELVARG,
  chaos: CHAOS,
  leviathan: LEVIATHAN,
};

// rng must be the night's seeded roll, so the lobby name and the raid draw the same bosses.
// A fixed lineup skips the draw and runs those rooms in order.
function rollTonight(rng, fixed) {
  if (Array.isArray(fixed) && fixed.length) return fixed.map((room) => Object.assign({}, room));
  const roll = typeof rng === 'function' ? rng : Math.random;
  const used = new Set();
  const rooms = [];
  const free = (tier) => Object.keys(RAID_BOSSES).filter((id) => !used.has(id) && (RAID_BOSSES[id].tiers || []).includes(tier));
  for (const slot of TONIGHT_SLOTS) {
    const open = Object.keys(slot).filter((tier) => slot[tier] > 0 && free(tier).length);
    let boss = null;
    let tier = null;
    if (open.length) {
      const total = open.reduce((sum, id) => sum + slot[id], 0);
      let pick = roll() * total;
      tier = open.find((id) => (pick -= slot[id]) < 0) || open[open.length - 1];
      const pool = free(tier);
      boss = pool[Math.floor(roll() * pool.length)];
    } else {
      // Nobody left at these tiers: take any unused boss at its tier nearest the slot.
      const want = Math.min(...Object.keys(slot).map((id) => TIER_ORDER.indexOf(id)));
      const spare = Object.keys(RAID_BOSSES).filter((id) => !used.has(id));
      if (!spare.length) break;
      boss = spare[Math.floor(roll() * spare.length)];
      const tiers = RAID_BOSSES[boss].tiers || [RAID_BOSSES[boss].home || 'medium'];
      tier = tiers.slice().sort((a, b) => Math.abs(TIER_ORDER.indexOf(a) - want) - Math.abs(TIER_ORDER.indexOf(b) - want))[0];
    }
    used.add(boss);
    if (RAID_BOSSES[boss].adds && SWARMS[RAID_BOSSES[boss].adds]) rooms.push({ kind: RAID_BOSSES[boss].adds });
    rooms.push({ kind: 'boss', boss, tier });
  }
  return rooms;
}

function swarmSpec(kind) {
  const src = SWARMS[kind];
  if (!src) return null;
  const spec = JSON.parse(JSON.stringify(src));
  spec.gold = (spec.gold || 0) + STAGE_CLEAR_GOLD;
  return spec;
}

function raidTitle(ids, rng) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  const words = (ids || []).map((id) => {
    const list = NAME_WORDS[id] || ['Path'];
    return list[Math.floor(roll() * list.length)];
  });
  if (words.length >= 3) return 'The ' + words.slice(0, -1).join(', the ') + ', and the ' + words[words.length - 1];
  if (words.length) return 'The ' + words.join(' and ');
  return 'The raid';
}

function raidPath(count, rng) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  const n = Math.max(2, count || 2);
  const nodes = [];
  let y = 30 + (roll() * 10 - 5);
  for (let i = 0; i < n; i++) {
    const along = n === 1 ? 0.5 : i / (n - 1);
    const x = 12 + along * 76 + (roll() * 7 - 3.5);
    y += roll() * 26 - 13;
    nodes.push({
      x: Math.round(Math.max(10, Math.min(90, x)) * 10) / 10,
      y: Math.round(Math.max(14, Math.min(50, y)) * 10) / 10,
    });
  }
  return nodes;
}

function raidBoss(id) {
  const src = RAID_BOSSES[id] || RAID_BOSSES.brutus;
  return JSON.parse(JSON.stringify(src));
}

function raidTier(id) {
  const wanted = String(id || 'medium').toLowerCase();
  return RAID_TIERS.find((tier) => tier.id === wanted) || RAID_TIERS[2];
}

function combatOf(levels) {
  const base = 0.25 * (levels.defence + levels.hitpoints + Math.floor(levels.prayer / 2));
  const melee = 0.325 * (levels.attack + levels.strength);
  return Math.min(126, Math.floor(base + melee));
}

function metalForCombat(combat) {
  let best = TIERS[0];
  TIERS.forEach((tier) => {
    if (combat >= tier.minCombat) best = tier;
  });
  return best;
}

// A spoop at this combat in a normal kit: weapon, amulet, ring, and a full armour set.
// Past 126 the skills stay at 99 and the metal bonus keeps climbing, which is the god band.
function referenceRaider(combat) {
  const target = Math.max(3, Number(combat) || 3);
  let levels;
  if (target > 126) {
    levels = { attack: 99, strength: 99, defence: 99, hitpoints: 99, prayer: 99 };
  } else {
    let best = null;
    for (let L = 10; L <= 99; L++) {
      const prayers = [Math.max(1, Math.round(L * 0.7)), Math.min(99, L), 99];
      prayers.forEach((prayer) => {
        const gap = Math.abs(combatOf({
          attack: L, strength: L, defence: L, hitpoints: L, prayer,
        }) - target);
        const score = L + prayer * 0.15;
        if (!best || gap < best.gap || (gap === best.gap && score < best.score)) {
          best = { L, prayer, gap, score };
        }
      });
    }
    levels = {
      attack: best.L,
      strength: best.L,
      defence: best.L,
      hitpoints: best.L,
      prayer: best.prayer,
    };
  }
  const metal = metalForCombat(Math.min(126, target));
  const power = target > 126 ? metal.power * (target / 126) : metal.power;
  const acc = levels.attack + 1 + power * 4 + power;
  const max = Math.max(1, Math.floor(levels.strength / 8 + 1 + (power * 3 + power * 0.6) / 3));
  return { acc, max, hp: levels.hitpoints, interval: 4.4, power };
}

// Band budgets are the whole metal's share of the table, not a weight per piece.
// Dragon stays the base from elite upward. Barrows and raid only roll named pieces.
const RAID_POCKETS = {
  trivial: [
    { tier: 'steel', budget: 46 },
    { tier: 'mithril', budget: 36 },
    { tier: 'adamant', budget: 12 },
    { tier: 'rune', budget: 4, rare: true },
  ],
  easy: [
    { tier: 'mithril', budget: 40 },
    { tier: 'adamant', budget: 34 },
    { tier: 'rune', budget: 12 },
    { tier: 'dragon', budget: 4, rare: true, named: true },
  ],
  medium: [
    { tier: 'adamant', budget: 38 },
    { tier: 'rune', budget: 34 },
    { tier: 'dragon', budget: 12, rare: true, named: true },
  ],
  tough: [
    { tier: 'adamant', budget: 10 },
    { tier: 'rune', budget: 40 },
    { tier: 'dragon', budget: 12, rare: true, named: true },
    { tier: 'barrows', budget: 4, rare: true },
  ],
  hard: [
    { tier: 'rune', budget: 16 },
    { tier: 'dragon', budget: 36, named: true },
    { tier: 'barrows', budget: 10, rare: true },
    { tier: 'raid', budget: 3, rare: true },
  ],
  elite: [
    { tier: 'dragon', budget: 42, named: true },
    { tier: 'barrows', budget: 16, rare: true },
    { tier: 'raid', budget: 6, rare: true },
  ],
  master: [
    { tier: 'dragon', budget: 34, named: true },
    { tier: 'barrows', budget: 20, rare: true },
    { tier: 'raid', budget: 12, rare: true },
  ],
  god: [
    { tier: 'dragon', budget: 28, named: true },
    { tier: 'barrows', budget: 22, rare: true },
    { tier: 'raid', budget: 20, rare: true },
  ],
};

const FLAVOR_SCALE = {
  trivial: 1,
  easy: 0.8,
  medium: 0.5,
  tough: 0.32,
  hard: 0.18,
  elite: 0.1,
  master: 0.06,
  god: 0.04,
};

function capName(text) {
  const s = String(text || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function dedupe(pool) {
  const seen = new Set();
  return pool.filter((row) => {
    if (!row || !row.osrsId || seen.has(row.osrsId)) return false;
    seen.add(row.osrsId);
    return true;
  });
}

function metalPool(tierId) {
  const pool = [];
  ARMOR.forEach((armor) => {
    if (!ARMOR_SLOTS.has(armor.slot)) return;
    const spec = { baseId: armor.id, tier: tierId };
    pool.push({
      name: capName((TIER_NAME[tierId] || tierId) + ' ' + armor.name),
      osrsId: osrsIdFor(spec),
      kind: 'armor',
    });
  });
  WEAPONS.forEach((weapon) => {
    if (weapon.style !== 'melee') return;
    const spec = { baseId: weapon.id, tier: tierId };
    pool.push({
      name: capName((TIER_NAME[tierId] || tierId) + ' ' + weapon.name),
      osrsId: osrsIdFor(spec),
      kind: 'weapon',
    });
  });
  CUSTOM_HELMS.forEach((helm) => {
    if (helm.tier !== tierId) return;
    pool.push({
      name: capName(helm.name),
      osrsId: helm.osrsId,
      kind: 'armor',
    });
  });
  return dedupe(pool);
}

function dhidePool(tierId) {
  return DHIDE.filter((piece) => piece.tiers && piece.tiers[tierId]).map((piece) => ({
    name: capName(piece.name),
    osrsId: piece.osrsId,
    weight: piece.tiers[tierId],
    kind: 'armor',
  }));
}

function clothPool(tierId) {
  return CLOTH.filter((piece) => piece.tiers && piece.tiers[tierId]).map((piece) => ({
    name: capName(piece.name),
    osrsId: piece.osrsId,
    weight: piece.tiers[tierId],
    kind: 'armor',
  }));
}

function namedPool(tierId) {
  return dedupe(NAMED_GEAR.filter((piece) => piece.tier === tierId).map((piece) => ({
    name: capName(piece.name),
    osrsId: piece.osrsId,
    weight: piece.weight || 1,
    rare: !!piece.rare,
    kind: piece.slot === 'weapon' ? 'weapon' : 'armor',
  })));
}

function bandPool(band) {
  if (band.tier === 'barrows' || band.tier === 'raid') return dedupe(namedPool(band.tier).concat(dhidePool(band.tier), clothPool(band.tier)));
  const metal = dedupe(metalPool(band.tier).concat(dhidePool(band.tier), clothPool(band.tier)));
  if (!band.named) return metal;
  return dedupe(metal.concat(namedPool(band.tier)));
}

function addPool(table, pool, budget, rare, tierId, splitKinds) {
  if (!pool.length || budget <= 0) return;
  if (splitKinds) {
    const armor = pool.filter((piece) => piece.kind !== 'weapon');
    const weapons = pool.filter((piece) => piece.kind === 'weapon');
    if (armor.length && weapons.length) {
      addPool(table, armor, budget * 0.72, rare, tierId, false);
      addPool(table, weapons, budget * 0.28, rare, tierId, false);
    } else {
      addPool(table, pool, budget, rare, tierId, false);
    }
    return;
  }
  const sum = pool.reduce((total, piece) => total + (piece.weight || 1), 0) || 1;
  pool.forEach((piece) => {
    table.push({
      name: piece.name,
      osrsId: piece.osrsId,
      tier: tierId,
      weight: budget * ((piece.weight || 1) / sum),
      rare: !!(rare || piece.rare),
    });
  });
}

function raidPocket(tierId, flavor) {
  const tier = raidTier(tierId);
  const bands = RAID_POCKETS[tier.id] || RAID_POCKETS.medium;
  const table = [];
  bands.forEach((band) => {
    addPool(table, bandPool(band), band.budget, !!band.rare, band.tier, true);
  });
  const scale = FLAVOR_SCALE[tier.id] == null ? 0.5 : FLAVOR_SCALE[tier.id];
  (flavor || []).forEach((row) => {
    const weight = Math.round((row.weight || 1) * scale * 10) / 10;
    if (weight <= 0 || !row.name) return;
    table.push({
      name: row.name,
      osrsId: row.osrsId || null,
      tier: '',
      weight,
      rare: !!row.rare,
    });
  });
  return table;
}

function rollWeighted(table, rng) {
  const total = table.reduce((sum, row) => sum + row.weight, 0) || 1;
  let roll = rng() * total;
  for (let i = 0; i < table.length; i++) {
    roll -= table[i].weight;
    if (roll < 0) return i;
  }
  return table.length - 1;
}

function lootCard(row) {
  return {
    name: row.name,
    osrsId: row.osrsId || null,
    rare: !!row.rare,
  };
}

function buildRaidRoll(table, rng) {
  if (!table || !table.length) return null;
  const index = rollWeighted(table, rng);
  const winner = lootCard(table[index]);
  const winIndex = 36;
  const reel = [];
  for (let i = 0; i < 56; i++) reel.push(lootCard(table[rollWeighted(table, rng)]));
  reel[winIndex] = winner;
  return {
    name: winner.name,
    osrsId: winner.osrsId,
    rare: winner.rare,
    winIndex,
    reel,
  };
}

function scaleRaidBoss(boss, meter, tierId) {
  const tier = raidTier(tierId);
  const copy = JSON.parse(JSON.stringify(boss));
  const ref = referenceRaider(tier.level);
  const count = Math.max(1, Number(meter && meter.count) || 1);
  const power = tier.level;
  const spread = 1 + Math.max(0, 1 - tier.telegraph) * 0.18;
  const chance = 1 / 1.75;
  const dps = chance * ((1 + ref.max) / 2) / ref.interval * 0.7;
  copy.tier = tier.id;
  copy.tierName = tier.name;
  copy.forLevel = tier.level;
  const anchor = boss.levelAt || tier.level || 1;
  copy.level = Math.max(1, Math.round((boss.level || tier.level) * tier.level / anchor));
  copy.blunder = tier.blunder;
  copy.defence = Math.max(8, Math.round(ref.acc * 0.75));
  copy.fightSeconds = Math.round((boss.fightSeconds || 56) * (tier.length || 1));
  copy.speed = Math.round((boss.speed || 3.4) * tier.haste * 10) / 10;
  copy.chargeSpeed = Math.round((boss.chargeSpeed || 62) * (0.9 + tier.haste * 0.1));
  copy.opener = Math.round((boss.opener || 3.6) * Math.max(0.7, tier.telegraph) * 10) / 10;
  copy.gold = tier.gold + BOSS_KILL_GOLD;
  copy.goldEach = 0;
  const pool = Math.round(dps * count * copy.fightSeconds);
  copy.hp = Math.max(48, Math.min(boss.maxHp || 50000, pool));
  if (boss.hpCut) copy.hp = Math.max(1, copy.hp - boss.hpCut);
  copy.minHp = copy.hp;
  copy.attacks = (copy.attacks || []).map((atk) => {
    const lo = atk.flat ? atk.flat : Math.max(1, Math.round(power * atk.damage[0]));
    const hi = atk.flat ? atk.flat : Math.max(lo, Math.round(power * atk.damage[1]));
    return Object.assign({}, atk, {
      warn: Math.max(0.42, Math.round(atk.warn * tier.telegraph * 100) / 100),
      radius: atk.radius ? Math.round(atk.radius * spread * 10) / 10 : atk.radius,
      width: atk.width ? Math.round(atk.width * spread * 10) / 10 : atk.width,
      cooldown: Math.max(0.8, Math.round(atk.cooldown / tier.haste * 100) / 100),
      damage: [lo, hi],
    });
  });
  copy.loot = raidPocket(tier.id, boss.loot || []);
  if (copy.rats) {
    const rats = copy.rats;
    const lo = Math.max(1, Math.round(power * rats.damage[0]));
    const hi = Math.max(lo, Math.round(power * rats.damage[1]));
    copy.rats = Object.assign({}, rats, {
      hp: Math.max(16, Math.round(power * (rats.hp || 0.32))),
      damage: [lo, hi],
    });
  }
  return copy;
}

module.exports = {
  RAID_BOSSES,
  RAID_TIERS,
  TONIGHT_SLOTS,
  raidBoss,
  raidTier,
  rollTonight,
  swarmSpec,
  raidTitle,
  raidPath,
  referenceRaider,
  scaleRaidBoss,
  raidPocket,
  buildRaidRoll,
};
