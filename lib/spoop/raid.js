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
    { name: 'Cow mask', weight: 1, osrsId: 12956, rare: true },
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

// A random raid is a map of layers, walked left to right. One boss to start, a fork of two
// bosses, the camp, two or three random layers, and one boss at the end. Every boss layer rolls
// its tier off these weights, and each layer's weakest tier is at least the last one's hardest,
// so whichever way the party goes, each boss is as tough or tougher than the one before.
// No boss shows up twice on a map. A boss with adds fights that swarm first, in the same node.
const MAP_START = { easy: 1 };
const MAP_FORK = { medium: 1 };
const MAP_MIDDLE = {
  1: [{ medium: 1, tough: 1 }],
  2: [{ medium: 1, tough: 1 }, { tough: 1 }],
  3: [{ medium: 1 }, { medium: 1, tough: 1 }, { tough: 1 }],
};
const MAP_FINALE = { tough: 55, hard: 30, elite: 10, master: 5 };
const MIDDLE_KINDS = { boss: 55, swarm: 30, treasure: 15 };
const MAX_TREASURE = 2;
const TIER_ORDER = ['trivial', 'easy', 'medium', 'tough', 'hard', 'elite', 'master', 'god'];

// The camp after the second boss tops this many hurt spoops back to full.
const CAMP_HEALS = 3;
const CAMP_ICON = 385;
const TREASURE_ICON = 20544;
// A treasure room is a chest split by whoever walks in alive.
const RAID_CHESTS = [
  { id: 'small', name: 'Small chest', gold: 100000, weight: 60, osrsId: 20545 },
  { id: 'big', name: 'Big chest', gold: 200000, weight: 30, osrsId: 20543 },
  { id: 'huge', name: 'Huge chest', gold: 400000, weight: 10, osrsId: 19836 },
];

// Added to every pot on top of the tier or swarm gold, split by whoever is alive at the end.
const BOSS_KILL_GOLD = 40000;
const STAGE_CLEAR_GOLD = 20000;
// Room piles and treasure chests. Jackpot sales stay flat.
const RAID_GOLD = 1.2;

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
  // The three below can roll as their own room anywhere in the middle of a map.
  // levelAt is the tier level their numbers are written for. Deeper layers scale hp and hits.
  spiders: {
    id: 'spiders',
    name: 'Spiderlings',
    unit: 'Spiderling',
    monster: 'spider',
    sprite: '/assets/pets/Venenatis_spiderling.png',
    face: 'left',
    scene: 'is-wild',
    count: 10,
    every: 0,
    wave: { count: 6, at: 12 },
    level: 34,
    levelAt: 95,
    hp: 20,
    damage: [2, 6],
    defence: 8,
    speed: 5.6,
    radius: 1.3,
    nip: 2.2,
    gold: 12000,
    verb: 'bites',
  },
  nibblers: {
    id: 'nibblers',
    name: 'Jal-Nib',
    unit: 'Jal-Nib',
    monster: 'nibbler',
    sprite: '/assets/pets/Jal-nib-rek.png',
    face: 'left',
    scene: 'is-kbdlair',
    count: 14,
    every: 0,
    wave: { count: 8, at: 9 },
    level: 32,
    levelAt: 95,
    hp: 14,
    damage: [1, 5],
    defence: 4,
    speed: 6.2,
    radius: 1.1,
    nip: 1.7,
    gold: 14000,
    verb: 'nibbles',
  },
  hounds: {
    id: 'hounds',
    name: 'Hellhounds',
    unit: 'Hellhound',
    monster: 'hound',
    sprite: '/assets/pets/Hellpuppy.png',
    face: 'left',
    scene: 'is-kennel',
    count: 4,
    every: 0,
    wave: { count: 3, at: 14 },
    level: 122,
    levelAt: 105,
    hp: 64,
    damage: [5, 12],
    defence: 24,
    speed: 4.4,
    radius: 2,
    nip: 2.8,
    gold: 24000,
    verb: 'mauls',
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

// Easy. The club is the heavy hit up close. The stomp shakes rocks loose over everyone.
const OBOR = {
  id: 'obor',
  name: 'Obor',
  monster: 'obor',
  home: 'easy',
  tiers: ['easy'],
  sprite: '/assets/bosses/Obor.png',
  scene: 'is-hillcave',
  face: 'left',
  hp: null,
  minHp: 62,
  maxHp: 50000,
  fightSeconds: 46,
  defence: 28,
  level: 106,
  levelAt: 70,
  radius: 6.6,
  speed: 3,
  chargeSpeed: 40,
  opener: 3.6,
  hpCut: 100,
  loot: [
    { name: 'Big bones', weight: 8, osrsId: 532 },
    { name: 'Limpwurt root', weight: 5, osrsId: 225 },
    { name: 'Giant key', weight: 2, osrsId: 20754 },
    { name: 'Hill giant club', weight: 1, osrsId: 20756, rare: true },
  ],
  attacks: [
    { id: 'club', kind: 'circle', label: 'CLUB', verb: 'clubs', style: 'melee', warn: 0.72, radius: 10.4, damage: [0.3, 0.44], cooldown: 2.4 },
    { id: 'rocks', kind: 'rocks', label: 'ROCKS', verb: 'drops a rock on', style: 'ranged', warn: 1.4, radius: 3.8, count: 7, damage: [0.14, 0.22], cooldown: 2.5 },
  ],
};

// Easy. A sword swing up close and a magic blast at whoever hangs back. Every few seconds she
// grows growthlings out of the moss. They are weak alone and a problem if nobody clears them.
const BRYOPHYTA = {
  id: 'bryophyta',
  name: 'Bryophyta',
  monster: 'bryophyta',
  home: 'easy',
  tiers: ['easy'],
  sprite: '/assets/bosses/Bryophyta.png',
  scene: 'is-mossy',
  face: 'left',
  hp: null,
  minHp: 60,
  maxHp: 50000,
  fightSeconds: 42,
  defence: 26,
  level: 128,
  levelAt: 70,
  radius: 5.6,
  speed: 3.2,
  chargeSpeed: 40,
  opener: 3.6,
  rats: {
    name: 'Growthling',
    sprite: '/assets/pets/Growthling.png',
    verb: 'lashes',
    every: 14,
    first: 8,
    pack: 2,
    cap: 3,
    hp: 0.24,
    damage: [0.02, 0.04],
    speed: 4.2,
    radius: 1.5,
  },
  loot: [
    { name: 'Big bones', weight: 8, osrsId: 532 },
    { name: 'Mossy key', weight: 3, osrsId: 22374 },
    { name: "Bryophyta's essence", weight: 1, osrsId: 22372, rare: true },
  ],
  attacks: [
    { id: 'slash', kind: 'circle', tone: 'swing', label: 'SWING', verb: 'swings at', style: 'melee', warn: 1, radius: 8.4, damage: [0.2, 0.3], cooldown: 2.3 },
    { id: 'blast', kind: 'mark', tone: 'moss', label: 'MAGIC', verb: 'casts at', style: 'magic', warn: 1.15, radius: 4.6, damage: [0.12, 0.2], cooldown: 2.3, aim: 'far' },
  ],
};

// Medium. Three heads, three breaths: ice that freezes a spoop where it stands, fire down a lane,
// poison at whoever is far, and a shock that splits across three. Slashes anyone up close.
// The freeze outlasts the next wind-up, so a frozen spoop can't step out of it.
const KBD = {
  id: 'kbd',
  name: 'King Black Dragon',
  monster: 'kbd',
  home: 'medium',
  tiers: ['medium', 'tough'],
  sprite: '/assets/bosses/KingBlackDragon.png',
  scene: 'is-kbdlair',
  face: 'left',
  hp: null,
  minHp: 70,
  maxHp: 50000,
  fightSeconds: 54,
  defence: 34,
  level: 276,
  levelAt: 85,
  radius: 7.4,
  speed: 3,
  chargeSpeed: 40,
  opener: 3.4,
  loot: [
    { name: 'Dragon bones', weight: 8, osrsId: 536 },
    { name: 'Black dragonhide', weight: 5, osrsId: 1747 },
    { name: 'Kbd heads', weight: 2, osrsId: 7980 },
    { name: 'Dragon pickaxe', weight: 1, osrsId: 11920, rare: true },
    { name: 'Dragon med helm', weight: 1, osrsId: 1149, rare: true },
    { name: 'Prince black dragon', weight: 1, osrsId: 12653, rare: true },
  ],
  attacks: [
    { id: 'ice', kind: 'mark', effect: 'freeze', freeze: 3.4, tone: 'ice', label: 'ICE', verb: 'freezes', style: 'magic', warn: 1.1, radius: 4.8, damage: [0.1, 0.18], cooldown: 2.2, aim: 'any' },
    { id: 'fire', kind: 'lane', hold: true, tone: 'fire', label: 'FIRE', verb: 'breathes fire on', style: 'magic', warn: 1.15, width: 9, reach: 30, damage: [0.26, 0.38], cooldown: 2.3, aim: 'any' },
    { id: 'slash', kind: 'circle', tone: 'claw', label: 'SLASH', verb: 'slashes', style: 'melee', warn: 1, radius: 10.2, damage: [0.2, 0.3], cooldown: 2.2 },
    { id: 'shock', kind: 'barrage', label: 'SHOCK', verb: 'shocks', warn: 1.05, radius: 4, damage: [0.16, 0.26], cooldown: 2.2,
      shots: [
        { label: 'SHOCK', tone: 'shock', verb: 'shocks', style: 'magic' },
        { label: 'SHOCK', tone: 'shock', verb: 'shocks', style: 'magic' },
        { label: 'SHOCK', tone: 'shock', verb: 'shocks', style: 'magic' },
      ] },
    { id: 'poison', kind: 'mark', tone: 'poison', label: 'POISON', verb: 'breathes poison on', style: 'magic', warn: 1.15, radius: 5, damage: [0.18, 0.28], cooldown: 2.2, aim: 'far' },
  ],
};

// Hard. Two health bars. On the ground she claws up close and casts a bolt that bounces from spoop
// to spoop: it hops to the nearest spoop within hop that it hasn't hit, losing falloff each hop.
// When the first bar runs out she sheds her shell and each forms entry takes over with a fresh bar
// (hp is its share of the first). Her flying form swoops down lanes faster than she ever walked.
const KQ = {
  id: 'kq',
  name: 'Kalphite Queen',
  monster: 'kq',
  home: 'hard',
  tiers: ['hard'],
  sprite: '/assets/bosses/KalphiteQueen.png',
  scene: 'is-kqlair',
  face: 'left',
  hp: null,
  minHp: 80,
  maxHp: 50000,
  fightSeconds: 30,
  defence: 40,
  level: 333,
  levelAt: 105,
  radius: 6.8,
  speed: 3,
  chargeSpeed: 50,
  opener: 3.4,
  loot: [
    { name: 'Grimy ranarr weed', weight: 6, osrsId: 207 },
    { name: 'Battlestaff', weight: 4, osrsId: 1391 },
    { name: 'Dragon chainbody', weight: 1, osrsId: 3140, rare: true },
    { name: 'Dragon 2h sword', weight: 1, osrsId: 7158, rare: true },
    { name: 'Kalphite princess', weight: 1, osrsId: 12647, rare: true },
  ],
  attacks: [
    { id: 'claw', kind: 'circle', label: 'CLAW', verb: 'claws', style: 'melee', warn: 0.95, radius: 9.6, damage: [0.22, 0.34], cooldown: 2.2 },
    { id: 'bounce', kind: 'mark', tone: 'bounce', label: 'MAGIC', verb: 'casts a bolt at', hopVerb: 'bounces the bolt onto', style: 'magic', warn: 1.15, radius: 4.4, damage: [0.16, 0.26], hops: 3, hop: 11, falloff: 0.7, cooldown: 2.3, aim: 'far' },
  ],
  forms: [
    {
      id: 'flying',
      name: 'Kalphite Queen',
      sprite: '/assets/bosses/KalphiteQueenFlying.png',
      verb: 'sheds her shell and takes flight',
      hp: 1,
      speed: 4.4,
      chargeSpeed: 74,
      molt: 1.8,
      attacks: [
        { id: 'swoop', kind: 'lane', label: 'SWOOP', verb: 'swoops through', style: 'melee', warn: 0.82, width: 10, reach: 36, damage: [0.24, 0.36], cooldown: 1.7, aim: 'any' },
        { id: 'bounce', kind: 'mark', tone: 'bounce', label: 'MAGIC', verb: 'casts a bolt at', hopVerb: 'bounces the bolt onto', style: 'magic', warn: 1.05, radius: 4.4, damage: [0.18, 0.28], hops: 4, hop: 12, falloff: 0.72, cooldown: 2.1, aim: 'far' },
        { id: 'swoop', kind: 'lane', label: 'SWOOP', verb: 'swoops through', style: 'melee', warn: 0.82, width: 10, reach: 36, damage: [0.24, 0.36], cooldown: 1.7, aim: 'any' },
      ],
    },
  ],
};

// Stays on the back of the island. The volley is magic, a spike, and fire. The firebomb lands
// where you stood. Every sixth attack is the acid phase: pools cover the floor, he spits at
// whoever he picks, and the party walks laps until it ends. pool is the burn for standing in one.
const VORKATH = {
  id: 'vorkath',
  name: 'Vorkath',
  monster: 'vorkath',
  home: 'hard',
  tiers: ['tough', 'hard'],
  rooted: true,
  at: [50, 27],
  sprite: '/assets/bosses/Vorkath.png',
  scene: 'is-ungael',
  face: 'left',
  hp: null,
  minHp: 90,
  maxHp: 50000,
  fightSeconds: 52,
  defence: 42,
  level: 732,
  levelAt: 105,
  radius: 7.6,
  speed: 0,
  chargeSpeed: 0,
  opener: 3.4,
  loot: [
    { name: 'Superior dragon bones', weight: 8, osrsId: 22124 },
    { name: 'Blue dragonhide', weight: 5, osrsId: 1751 },
    { name: "Vorkath's head", weight: 2, osrsId: 21907 },
    { name: 'Dragonbone necklace', weight: 1, osrsId: 22111, rare: true },
    { name: 'Jar of decay', weight: 1, osrsId: 22106, rare: true },
    { name: 'Skeletal visage', weight: 1, osrsId: 22006, rare: true },
    { name: 'Vorki', weight: 1, osrsId: 21992, rare: true },
  ],
  attacks: [
    { id: 'bolt', kind: 'barrage', label: 'VOLLEY', verb: 'fires at', warn: 1.05, radius: 4, damage: [0.16, 0.26], cooldown: 1.9,
      shots: [
        { label: 'MAGIC', tone: 'orb-magic', verb: 'hurls a magic orb at', style: 'magic' },
        { label: 'SPIKE', tone: 'spike', verb: 'fires a spike at', style: 'ranged' },
        { label: 'FIRE', tone: 'fire', verb: 'breathes fire on', style: 'magic' },
      ] },
    { id: 'breath', kind: 'lane', hold: true, tone: 'fire', label: 'DRAGONFIRE', verb: 'breathes dragonfire on', style: 'magic', warn: 1.2, width: 9, reach: 46, damage: [0.3, 0.44], cooldown: 2.2, aim: 'any' },
    { id: 'bomb', kind: 'mark', tone: 'bomb', label: 'FIREBOMB', verb: 'lobs a firebomb at', style: 'magic', warn: 1.3, radius: 5.4, damage: [0.42, 0.62], cooldown: 2.2, aim: 'any' },
    { id: 'claw', kind: 'circle', label: 'CLAW', verb: 'claws', style: 'melee', warn: 0.95, radius: 13, damage: [0.22, 0.34], cooldown: 2 },
    { id: 'bolt', kind: 'barrage', label: 'VOLLEY', verb: 'fires at', warn: 1.05, radius: 4, damage: [0.16, 0.26], cooldown: 1.9,
      shots: [
        { label: 'FIRE', tone: 'fire', verb: 'breathes fire on', style: 'magic' },
        { label: 'SPIKE', tone: 'spike', verb: 'fires a spike at', style: 'ranged' },
        { label: 'MAGIC', tone: 'orb-magic', verb: 'hurls a magic orb at', style: 'magic' },
      ] },
    { id: 'acid', kind: 'acid', label: 'ACID', verb: 'spits acid at', style: 'ranged', warn: 0.95, phase: 9, every: 0.55, pools: 16, poolRadius: 3.3, radius: 3.4, damage: [0.1, 0.16], pool: [0.03, 0.06], cooldown: 2.6 },
  ],
};

// Tough. Three heads in one volley, a maul up close, and lava that erupts under every spoop at once.
// Benched: not in RAID_BOSSES, so it never draws. Add it back there to bring it in.
const CERBERUS = {
  id: 'cerberus',
  name: 'Cerberus',
  monster: 'cerberus',
  home: 'tough',
  tiers: ['tough', 'hard'],
  sprite: '/assets/bosses/Cerberus.png',
  scene: 'is-kennel',
  face: 'left',
  hp: null,
  minHp: 84,
  maxHp: 50000,
  fightSeconds: 62,
  defence: 40,
  level: 318,
  levelAt: 95,
  radius: 7,
  speed: 3.2,
  chargeSpeed: 46,
  opener: 3.4,
  loot: [
    { name: 'Ashes', weight: 8, osrsId: 592 },
    { name: 'Key master teleport', weight: 4, osrsId: 13249 },
    { name: 'Smouldering stone', weight: 2, osrsId: 13233, rare: true },
    { name: 'Primordial crystal', weight: 1, osrsId: 13231, rare: true },
    { name: 'Pegasian crystal', weight: 1, osrsId: 13229, rare: true },
    { name: 'Eternal crystal', weight: 1, osrsId: 13227, rare: true },
    { name: 'Hellpuppy', weight: 1, osrsId: 13247, rare: true },
  ],
  attacks: [
    { id: 'maul', kind: 'circle', label: 'MAUL', verb: 'mauls', style: 'melee', warn: 1, radius: 8.6, damage: [0.22, 0.34], cooldown: 2.2 },
    { id: 'heads', kind: 'barrage', label: 'TRIPLE', verb: 'snaps at', warn: 1.1, radius: 4.2, damage: [0.18, 0.3], cooldown: 2.2,
      shots: [
        { label: 'MAGIC', tone: 'orb-magic', verb: 'spits a magic blast at', style: 'magic' },
        { label: 'RANGE', tone: 'orb-range', verb: 'spits a fireball at', style: 'ranged' },
        { label: 'MELEE', tone: 'orb-melee', verb: 'snaps at', style: 'melee' },
      ] },
    { id: 'lava', kind: 'rocks', each: true, tone: 'lava', label: 'LAVA', verb: 'erupts lava under', style: 'magic', warn: 1.25, radius: 4.2, damage: [0.2, 0.32], cooldown: 2.4 },
  ],
};

const NAME_WORDS = {
  obor: ['Hill', 'Club', 'Giant'],
  bryophyta: ['Moss', 'Growth', 'Grove'],
  kbd: ['Lair', 'Breath', 'Wilderness'],
  vorkath: ['Ungael', 'Acid', 'Bone'],
  cerberus: ['Kennel', 'Hound', 'Lava'],
  mole: ['Burrow', 'Dirt', 'Park'],
  brutus: ['Bull', 'Horn', 'Pasture'],
  scurrius: ['Sewer', 'Rat', 'Bone'],
  elvarg: ['Crandor', 'Cave', 'Dragon'],
  chaos: ['Cloud', 'Wild', 'Element'],
  leviathan: ['Pool', 'Lure', 'Strangle'],
  kq: ['Hive', 'Desert', 'Swarm'],
};

// One per raid boss, keyed by boss id. It does nothing but sell, for JACKPOT_GOLD flat.
// It takes JACKPOT_CHANCE of every kill's table on any tier.
// A boss can have its row here before it joins RAID_BOSSES.
const JACKPOT_CHANCE = 0.01;
const JACKPOT_GOLD = 500000;
const RAID_JACKPOTS = {
  brutus: { name: "Brutus's horn", osrsId: 24466 },
  mole: { name: 'Immaculate mole skin', osrsId: 33382 },
  scurrius: { name: "Scurrius' spine", osrsId: 28798 },
  elvarg: { name: "Elvarg's head", osrsId: 11279 },
  chaos: { name: 'Chaos core', osrsId: 25700 },
  leviathan: { name: 'Smoke quartz', osrsId: 28274 },
  obor: { name: "Obor's head", osrsId: 13475 },
  vorkath: { name: 'Draconic visage', osrsId: 11286 },
  cerberus: { name: 'Jar of souls', osrsId: 13245 },
  kq: { name: 'Kq head', osrsId: 7981 },
  bryophyta: { name: "Bryophyta's staff", osrsId: 22368 },
  kbd: { name: 'Draconic visage', osrsId: 11286 },
};

const RAID_BOSSES = {
  brutus: BRUTUS,
  mole: MOLE,
  scurrius: SCURRIUS,
  elvarg: ELVARG,
  chaos: CHAOS,
  leviathan: LEVIATHAN,
  obor: OBOR,
  vorkath: VORKATH,
  bryophyta: BRYOPHYTA,
  kbd: KBD,
  kq: KQ,
};

// A fixed lineup runs its rooms in order. A boss room with a tier and no boss draws an
// unused boss at that tier, with that boss's adds in front of it. A room's except list is never drawn.
function fixedTonight(roll, fixed) {
  const used = new Set(fixed.filter((room) => room.kind === 'boss' && room.boss).map((room) => room.boss));
  fixed.forEach((room) => (room.except || []).forEach((id) => used.add(id)));
  const rooms = [];
  for (const room of fixed) {
    if (room.kind !== 'boss' || room.boss) {
      rooms.push(Object.assign({}, room));
      continue;
    }
    const pool = Object.keys(RAID_BOSSES).filter((id) => !used.has(id) && (RAID_BOSSES[id].tiers || []).includes(room.tier));
    if (!pool.length) continue;
    const boss = pool[Math.floor(roll() * pool.length)];
    used.add(boss);
    if (RAID_BOSSES[boss].adds && SWARMS[RAID_BOSSES[boss].adds]) rooms.push({ kind: RAID_BOSSES[boss].adds });
    rooms.push({ kind: 'boss', boss, tier: room.tier });
  }
  return rooms;
}

function pickWeighted(roll, weights, keys) {
  const open = keys || Object.keys(weights).filter((id) => weights[id] > 0);
  const total = open.reduce((sum, id) => sum + weights[id], 0);
  let pick = roll() * total;
  return open.find((id) => (pick -= weights[id]) < 0) || open[open.length - 1];
}

function freeBosses(used, tier) {
  return Object.keys(RAID_BOSSES).filter((id) => !used.has(id) && (RAID_BOSSES[id].tiers || []).includes(tier));
}

// An unused boss at one of the slot's tiers. Strict gives up when none fits.
// Otherwise it takes any unused boss, at whichever of its tiers sits nearest the slot.
function drawBoss(roll, slot, used, strict) {
  const open = Object.keys(slot).filter((tier) => slot[tier] > 0 && freeBosses(used, tier).length);
  let boss = null;
  let tier = null;
  if (open.length) {
    tier = pickWeighted(roll, slot, open);
    const pool = freeBosses(used, tier);
    boss = pool[Math.floor(roll() * pool.length)];
  } else {
    if (strict) return null;
    const want = Math.min(...Object.keys(slot).map((id) => TIER_ORDER.indexOf(id)));
    const spare = Object.keys(RAID_BOSSES).filter((id) => !used.has(id));
    if (!spare.length) return null;
    boss = spare[Math.floor(roll() * spare.length)];
    const tiers = RAID_BOSSES[boss].tiers || [RAID_BOSSES[boss].home || 'medium'];
    tier = tiers.slice().sort((a, b) => Math.abs(TIER_ORDER.indexOf(a) - want) - Math.abs(TIER_ORDER.indexOf(b) - want))[0];
  }
  used.add(boss);
  const node = { kind: 'boss', boss, tier };
  const adds = RAID_BOSSES[boss].adds;
  if (adds && SWARMS[adds]) node.adds = adds;
  return node;
}

function drawSwarm(roll, slot, used) {
  const all = Object.keys(SWARMS);
  const fresh = all.filter((id) => !used.has(id));
  const pool = fresh.length ? fresh : all;
  const swarm = pool[Math.floor(roll() * pool.length)];
  used.add(swarm);
  return { kind: 'swarm', swarm, tier: pickWeighted(roll, slot) };
}

// Edges between two layers never cross: a staircase from the top pair to the bottom pair,
// so every node has a way in and a way out. A node with two ways out is a fork.
function linkLayers(from, to, roll) {
  let i = 0;
  let j = 0;
  from[0].next.push(to[0].id);
  while (i < from.length - 1 || j < to.length - 1) {
    if (i === from.length - 1) j += 1;
    else if (j === to.length - 1) i += 1;
    else {
      const r = roll();
      if (r < 0.34) i += 1;
      else if (r < 0.68) j += 1;
      else {
        i += 1;
        j += 1;
      }
    }
    if (!from[i].next.includes(to[j].id)) from[i].next.push(to[j].id);
  }
}

function dressNode(node) {
  if (node.kind === 'boss') {
    const src = RAID_BOSSES[node.boss];
    node.name = src.name;
    node.sprite = src.sprite;
  } else if (node.kind === 'swarm') {
    const src = SWARMS[node.swarm];
    node.name = src.name;
    node.sprite = src.sprite;
  } else if (node.kind === 'rest') {
    node.name = 'Camp';
    node.icon = CAMP_ICON;
  } else if (node.kind === 'treasure') {
    node.name = 'Treasure';
    node.icon = TREASURE_ICON;
  }
  if (node.tier) node.tierName = raidTier(node.tier).name;
  return node;
}

// Coordinates are in the map's 100 by 64 box. Layers run left to right.
function placeLayers(layers, roll) {
  const nodes = [];
  const span = Math.max(1, layers.length - 1);
  layers.forEach((layer, L) => {
    const x = 8 + (L / span) * 84;
    layer.forEach((node, k) => {
      const y = layer.length === 1
        ? 32 + (roll() * 6 - 3)
        : 12 + ((k + 0.5) / layer.length) * 40 + (roll() * 4 - 2);
      node.id = 'n' + nodes.length;
      node.layer = L;
      node.x = Math.round(x * 10) / 10;
      node.y = Math.round(Math.max(9, Math.min(55, y)) * 10) / 10;
      node.next = [];
      nodes.push(dressNode(node));
    });
  });
  for (let L = 0; L < layers.length - 1; L++) linkLayers(layers[L], layers[L + 1], roll);
  return { nodes, layers: layers.length };
}

// A fixed lineup is a straight path. Swarm rooms stay their own node.
// It gets the camp after its second boss unless it lists one itself.
function fixedMap(rooms, roll) {
  const layers = [];
  const hasCamp = rooms.some((room) => room.kind === 'rest');
  let bosses = 0;
  for (const room of rooms) {
    if (room.kind === 'boss') {
      layers.push([{ kind: 'boss', boss: room.boss, tier: room.tier || RAID_BOSSES[room.boss].home || 'medium' }]);
      bosses += 1;
      if (bosses === 2 && !hasCamp) layers.push([{ kind: 'rest' }]);
    } else if (room.kind === 'rest' || room.kind === 'treasure') {
      layers.push([{ kind: room.kind }]);
    } else if (SWARMS[room.kind]) {
      layers.push([{ kind: 'swarm', swarm: room.kind, tier: room.tier || '' }]);
    }
  }
  return placeLayers(layers, roll);
}

function pinnedBoss(spec) {
  const src = RAID_BOSSES[spec.boss];
  const node = { kind: 'boss', boss: spec.boss, tier: spec.tier || src.home || 'medium', pinned: true };
  if (src.adds && SWARMS[src.adds]) node.adds = src.adds;
  return node;
}

// A must-have boss goes in a random layer that rolls one of its tiers, at that layer's top
// tier so the climb still holds. One too tough for any of them sits right before the finale.
function placeBoss(spec, layers, roll) {
  const src = RAID_BOSSES[spec.boss];
  const tiers = spec.tier ? [spec.tier] : (src.tiers || [src.home]);
  const fits = layers.filter((row) => tiers.some((tier) => row.slot[tier] > 0));
  const target = fits.length ? fits[Math.floor(roll() * fits.length)] : layers[layers.length - 1];
  if (!target) return;
  const tier = spec.tier || tiers.filter((tier) => target.slot[tier] > 0).pop() || src.home;
  const spots = target.nodes.map((node, i) => i).filter((i) => !target.nodes[i].pinned);
  if (!spots.length) return;
  target.nodes[spots[Math.floor(roll() * spots.length)]] = pinnedBoss({ boss: spec.boss, tier });
}

// rng must be the night's seeded roll, so the lobby name and the raid draw the same map.
// fixed is a list of rooms for a straight path, or { start, finale, include } to pin bosses.
function rollRaidMap(rng, fixed) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  if (Array.isArray(fixed) && fixed.length) return fixedMap(fixedTonight(roll, fixed), roll);
  const plan = fixed && typeof fixed === 'object' ? fixed : {};
  const pins = [plan.start, plan.finale].concat(plan.include || []).filter((spec) => spec && RAID_BOSSES[spec.boss]);
  const used = new Set(pins.map((spec) => spec.boss));
  const swarmsUsed = new Set();
  const start = plan.start && RAID_BOSSES[plan.start.boss] ? pinnedBoss(plan.start) : drawBoss(roll, MAP_START, used, false);
  const fork = [drawBoss(roll, MAP_FORK, used, false), drawBoss(roll, MAP_FORK, used, false)].filter(Boolean);
  const finale = plan.finale && RAID_BOSSES[plan.finale.boss] ? pinnedBoss(plan.finale) : drawBoss(roll, MAP_FINALE, used, false);
  // bosses: 4 is a shorter map with exactly four on any path: start, the fork, a choice of bosses
  // after camp, and the finale, with a side room (treasure or a swarm) before the finale.
  const four = plan.bosses === 4;
  const depth = four ? 1 : roll() < 0.55 ? 2 : 3;
  let treasures = 0;
  const middle = MAP_MIDDLE[depth].map((slot) => {
    if (four) {
      const size = roll() < 0.5 ? 2 : 3;
      return Array.from({ length: size }, () => drawBoss(roll, slot, used, false)).filter(Boolean);
    }
    const size = roll() < 0.5 ? 2 : 3;
    const layer = [];
    for (let i = 0; i < size; i++) {
      const kinds = Object.assign({}, MIDDLE_KINDS);
      if (treasures >= MAX_TREASURE || layer.some((node) => node.kind === 'treasure')) kinds.treasure = 0;
      const kind = pickWeighted(roll, kinds);
      const boss = kind === 'boss' ? drawBoss(roll, slot, used, true) : null;
      if (boss) layer.push(boss);
      else if (kind === 'treasure') {
        treasures += 1;
        layer.push({ kind: 'treasure' });
      } else layer.push(drawSwarm(roll, slot, swarmsUsed));
    }
    if (!layer.some((node) => node.kind === 'boss')) {
      const boss = drawBoss(roll, slot, used, true);
      const spot = layer.findIndex((node) => node.kind === 'swarm');
      if (boss && spot >= 0) layer[spot] = boss;
    }
    return layer;
  });
  const slots = [{ slot: MAP_FORK, nodes: fork }].concat(middle.map((nodes, i) => ({ slot: MAP_MIDDLE[depth][i], nodes })));
  (plan.include || []).filter((spec) => spec && RAID_BOSSES[spec.boss]).forEach((spec) => placeBoss(spec, slots, roll));
  const side = four ? [[{ kind: 'treasure' }, drawSwarm(roll, MAP_MIDDLE[2][1], swarmsUsed)]] : [];
  const layers = [[start], fork, [{ kind: 'rest' }]].concat(middle, side, [[finale]]).filter((layer) => layer.length && layer.every(Boolean));
  return placeLayers(layers, roll);
}

function mapTitleIds(map) {
  const bosses = ((map && map.nodes) || []).filter((node) => node.kind === 'boss').map((node) => node.boss);
  if (bosses.length <= 3) return bosses;
  return [bosses[0], bosses[1], bosses[bosses.length - 1]];
}

// The newer swarms carry levelAt and grow with the tier of the layer they sit in.
function swarmSpec(kind, tierId) {
  const src = SWARMS[kind];
  if (!src) return null;
  const spec = JSON.parse(JSON.stringify(src));
  spec.gold = Math.round(((spec.gold || 0) + STAGE_CLEAR_GOLD) * RAID_GOLD);
  if (spec.levelAt && tierId) {
    const scale = Math.max(0.8, Math.min(1.6, raidTier(tierId).level / spec.levelAt));
    spec.hp = Math.max(1, Math.round(spec.hp * scale));
    const lo = Math.max(1, Math.round(spec.damage[0] * scale));
    spec.damage = [lo, Math.max(lo, Math.round(spec.damage[1] * scale))];
  }
  return spec;
}

function rollChest(rng) {
  const weights = {};
  RAID_CHESTS.forEach((chest) => { weights[chest.id] = chest.weight; });
  const id = pickWeighted(rng, weights);
  const chest = Object.assign({}, RAID_CHESTS.find((chest) => chest.id === id));
  chest.gold = Math.round((chest.gold || 0) * RAID_GOLD);
  return chest;
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

// gear points back at the catalog row, so a won drop becomes the real piece rather than a name.
function metalPool(tierId) {
  const pool = [];
  ARMOR.forEach((armor) => {
    if (!ARMOR_SLOTS.has(armor.slot)) return;
    const spec = { baseId: armor.id, tier: tierId };
    pool.push({
      name: capName((TIER_NAME[tierId] || tierId) + ' ' + armor.name),
      osrsId: osrsIdFor(spec),
      kind: 'armor',
      gear: { list: 'armor', id: armor.id, tier: tierId },
    });
  });
  WEAPONS.forEach((weapon) => {
    if (weapon.style !== 'melee') return;
    const spec = { baseId: weapon.id, tier: tierId };
    pool.push({
      name: capName((TIER_NAME[tierId] || tierId) + ' ' + weapon.name),
      osrsId: osrsIdFor(spec),
      kind: 'weapon',
      style: 'melee',
      gear: { list: 'weapon', id: weapon.id, tier: tierId },
    });
  });
  CUSTOM_HELMS.forEach((helm) => {
    if (helm.tier !== tierId) return;
    pool.push({
      name: capName(helm.name),
      osrsId: helm.osrsId,
      kind: 'armor',
      gear: { list: 'helm', id: helm.id },
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
    gear: { list: 'dhide', id: piece.id },
  }));
}

function clothPool(tierId) {
  return CLOTH.filter((piece) => piece.tiers && piece.tiers[tierId]).map((piece) => ({
    name: capName(piece.name),
    osrsId: piece.osrsId,
    weight: piece.tiers[tierId],
    kind: 'armor',
    gear: { list: 'cloth', id: piece.id },
  }));
}

function namedPool(tierId) {
  return dedupe(NAMED_GEAR.filter((piece) => piece.tier === tierId).map((piece) => ({
    name: capName(piece.name),
    osrsId: piece.osrsId,
    weight: piece.weight || 1,
    rare: !!piece.rare,
    kind: piece.slot === 'weapon' ? 'weapon' : 'armor',
    style: piece.style || null,
    gear: { list: 'named', id: piece.id },
  })));
}

// Below dragon the named list is real bows, staves, and accessories, so it always joins.
function bandPool(band) {
  if (band.tier === 'barrows' || band.tier === 'raid') return dedupe(namedPool(band.tier).concat(dhidePool(band.tier), clothPool(band.tier)));
  const metal = metalPool(band.tier).concat(dhidePool(band.tier), clothPool(band.tier));
  if (band.tier === 'dragon' && !band.named) return dedupe(metal);
  return dedupe(metal.concat(namedPool(band.tier)));
}

// The weapon share splits evenly by style, so a melee-heavy tier still pays bows and staves.
function addPool(table, pool, budget, rare, tierId, splitKinds) {
  if (!pool.length || budget <= 0) return;
  if (splitKinds) {
    const armor = pool.filter((piece) => piece.kind !== 'weapon');
    const weapons = pool.filter((piece) => piece.kind === 'weapon');
    if (armor.length && weapons.length) {
      addPool(table, armor, budget * 0.72, rare, tierId, false);
      const styles = [...new Set(weapons.map((piece) => piece.style || 'melee'))];
      styles.forEach((style) => {
        const group = weapons.filter((piece) => (piece.style || 'melee') === style);
        addPool(table, group, budget * 0.28 / styles.length, rare, tierId, false);
      });
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
      gear: piece.gear || null,
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

function withJackpot(table, bossId) {
  const prize = RAID_JACKPOTS[bossId];
  if (!prize || !table.length) return table;
  const total = table.reduce((sum, row) => sum + row.weight, 0);
  table.push({
    name: prize.name,
    osrsId: prize.osrsId,
    tier: '',
    weight: total * JACKPOT_CHANCE / (1 - JACKPOT_CHANCE),
    rare: true,
    jackpot: bossId,
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
  const card = {
    name: row.name,
    osrsId: row.osrsId || null,
    rare: !!row.rare,
  };
  if (row.jackpot) card.jackpot = row.jackpot;
  return card;
}

function buildRaidRoll(table, rng) {
  if (!table || !table.length) return null;
  const index = rollWeighted(table, rng);
  const winner = lootCard(table[index]);
  const winIndex = 36;
  const reel = [];
  for (let i = 0; i < 56; i++) reel.push(lootCard(table[rollWeighted(table, rng)]));
  reel[winIndex] = winner;
  const roll = {
    name: winner.name,
    osrsId: winner.osrsId,
    rare: winner.rare,
    winIndex,
    reel,
  };
  if (winner.jackpot) roll.jackpot = winner.jackpot;
  if (table[index].gear) roll.gear = table[index].gear;
  return roll;
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
  copy.gold = Math.round((tier.gold + BOSS_KILL_GOLD) * RAID_GOLD);
  copy.goldEach = 0;
  const pool = Math.round(dps * count * copy.fightSeconds);
  copy.hp = Math.max(48, Math.min(boss.maxHp || 50000, pool));
  if (boss.hpCut) copy.hp = Math.max(1, copy.hp - boss.hpCut);
  copy.minHp = copy.hp;
  const scaleAttacks = (list) => (list || []).map((atk) => {
    const lo = atk.flat ? atk.flat : Math.max(1, Math.round(power * atk.damage[0]));
    const hi = atk.flat ? atk.flat : Math.max(lo, Math.round(power * atk.damage[1]));
    const scaled = Object.assign({}, atk, {
      warn: Math.max(0.42, Math.round(atk.warn * tier.telegraph * 100) / 100),
      radius: atk.radius ? Math.round(atk.radius * spread * 10) / 10 : atk.radius,
      width: atk.width ? Math.round(atk.width * spread * 10) / 10 : atk.width,
      cooldown: Math.max(0.8, Math.round(atk.cooldown / tier.haste * 100) / 100),
      damage: [lo, hi],
    });
    if (atk.every) scaled.every = Math.max(0.3, Math.round(atk.every / tier.haste * 100) / 100);
    if (atk.pool) {
      const poolLo = Math.max(1, Math.round(power * atk.pool[0]));
      scaled.pool = [poolLo, Math.max(poolLo, Math.round(power * atk.pool[1]))];
    }
    return scaled;
  });
  copy.attacks = scaleAttacks(copy.attacks);
  if (copy.forms) {
    copy.forms = copy.forms.map((form) => Object.assign({}, form, {
      speed: Math.round((form.speed || boss.speed || 3.4) * tier.haste * 10) / 10,
      chargeSpeed: Math.round((form.chargeSpeed || boss.chargeSpeed || 62) * (0.9 + tier.haste * 0.1)),
      attacks: scaleAttacks(form.attacks),
    }));
  }
  copy.loot = withJackpot(raidPocket(tier.id, boss.loot || []), boss.id);
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
  RAID_JACKPOTS,
  JACKPOT_GOLD,
  RAID_CHESTS,
  CAMP_HEALS,
  SWARMS,
  raidBoss,
  raidTier,
  rollRaidMap,
  mapTitleIds,
  swarmSpec,
  rollChest,
  raidTitle,
  referenceRaider,
  scaleRaidBoss,
  raidPocket,
  buildRaidRoll,
};
