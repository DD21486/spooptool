/** Raid bosses. The party fights these one at a time.
 *  Damage numbers are a share of the party's average combat level.
 *  A tier multiplies health, damage, defence, attack tempo, and how tight the dodges are.
 *  Loot is a generic armor pocket for that tier, plus a few boss-specific extras.
 *  osrsId is the wiki sprite used when the loot reel rolls.
 */

const { ARMOR, WEAPONS, CUSTOM_HELMS, NAMED_GEAR, TIERS } = require('./data');
const { osrsIdFor } = require('./item-ids');

const ARMOR_SLOTS = new Set(['head', 'body', 'legs', 'shield', 'boots']);
const TIER_NAME = {};
TIERS.forEach((tier) => { TIER_NAME[tier.id] = tier.name; });

const RAID_TIERS = [
  { id: 'trivial', name: 'Trivial', hp: 0.55, danger: 0.45, telegraph: 1.32, haste: 0.84, blunder: 0.04, defence: 0.55, gold: 0.4 },
  { id: 'easy', name: 'Easy', hp: 0.78, danger: 0.7, telegraph: 1.14, haste: 0.92, blunder: 0.1, defence: 0.78, gold: 0.7 },
  { id: 'medium', name: 'Medium', hp: 1, danger: 1, telegraph: 1, haste: 1, blunder: 0.18, defence: 1, gold: 1 },
  { id: 'tough', name: 'Tough', hp: 1.28, danger: 1.22, telegraph: 0.9, haste: 1.08, blunder: 0.26, defence: 1.22, gold: 1.35 },
  { id: 'hard', name: 'Hard', hp: 1.58, danger: 1.48, telegraph: 0.8, haste: 1.16, blunder: 0.34, defence: 1.48, gold: 1.75 },
  { id: 'elite', name: 'Elite', hp: 1.95, danger: 1.8, telegraph: 0.7, haste: 1.24, blunder: 0.44, defence: 1.8, gold: 2.25 },
  { id: 'master', name: 'Master', hp: 2.4, danger: 2.2, telegraph: 0.62, haste: 1.34, blunder: 0.55, defence: 2.15, gold: 2.9 },
  { id: 'god', name: 'God', hp: 3.05, danger: 2.75, telegraph: 0.52, haste: 1.46, blunder: 0.68, defence: 2.6, gold: 3.8 },
];

const BRUTUS = {
  id: 'brutus',
  name: 'Brutus',
  monster: 'brutus',
  sprite: '/assets/bosses/Brutus.png',
  face: 'left',
  hp: null,
  minHp: 70,
  maxHp: 50000,
  fightSeconds: 56,
  defence: 36,
  radius: 7.2,
  speed: 3.4,
  chargeSpeed: 62,
  opener: 3.6,
  gold: 500,
  goldEach: 250,
  loot: [
    { name: 'Bones', weight: 8, osrsId: 526 },
    { name: 'Big bones', weight: 5, osrsId: 532 },
    { name: 'Raw beef', weight: 6, osrsId: 2132 },
    { name: 'Cowhide', weight: 5, osrsId: 1739 },
    { name: 'Leather', weight: 4, osrsId: 1741 },
    { name: 'Bullroarer', weight: 2, osrsId: 716 },
  ],
  attacks: [
    { id: 'stomp', kind: 'circle', label: 'STOMP', verb: 'stomps', warn: 1.2, radius: 10.2, damage: [0.26, 0.38], cooldown: 2.5 },
    { id: 'toss', kind: 'mark', label: 'HORN', verb: 'hurls a horn at', warn: 1.5, radius: 4.4, damage: [0.18, 0.28], cooldown: 2.3, aim: 'far' },
    { id: 'charge', kind: 'lane', label: 'CHARGE', verb: 'charges', warn: 1.12, width: 6.4, reach: 30, damage: [0.34, 0.5], cooldown: 2.7, aim: 'any' },
  ],
};

const RAID_BOSSES = {
  brutus: BRUTUS,
};

function raidBoss(id) {
  const src = RAID_BOSSES[id] || RAID_BOSSES.brutus;
  return JSON.parse(JSON.stringify(src));
}

function raidTier(id) {
  const wanted = String(id || 'medium').toLowerCase();
  return RAID_TIERS.find((tier) => tier.id === wanted) || RAID_TIERS[2];
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
  if (band.tier === 'barrows' || band.tier === 'raid') return namedPool(band.tier);
  const metal = metalPool(band.tier);
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
  const power = Math.max(8, Number(meter && meter.combat) || 8);
  const acc = Math.max(8, Number(meter && meter.acc) || 8);
  const spread = 1 + (1 - tier.telegraph) * 0.4;
  copy.tier = tier.id;
  copy.tierName = tier.name;
  copy.blunder = tier.blunder;
  copy.defence = Math.max(6, Math.round(acc * 0.62 * tier.defence));
  copy.fightSeconds = Math.round((boss.fightSeconds || 56) * tier.hp);
  copy.minHp = Math.max(24, Math.round((boss.minHp || 70) * tier.hp * (power / 40)));
  copy.speed = Math.round((boss.speed || 3.4) * tier.haste * 10) / 10;
  copy.chargeSpeed = Math.round((boss.chargeSpeed || 62) * (0.9 + tier.haste * 0.1));
  copy.opener = Math.round((boss.opener || 3.6) * Math.max(0.7, tier.telegraph) * 10) / 10;
  copy.gold = Math.round((boss.gold || 0) * tier.gold);
  copy.goldEach = Math.round((boss.goldEach || 0) * tier.gold);
  if (copy.hp > 0) copy.hp = Math.round(copy.hp * tier.hp);
  copy.attacks = (copy.attacks || []).map((atk) => {
    const lo = Math.max(1, Math.round(power * atk.damage[0] * tier.danger));
    const hi = Math.max(lo, Math.round(power * atk.damage[1] * tier.danger));
    return Object.assign({}, atk, {
      warn: Math.max(0.42, Math.round(atk.warn * tier.telegraph * 100) / 100),
      radius: atk.radius ? Math.round(atk.radius * spread * 10) / 10 : atk.radius,
      width: atk.width ? Math.round(atk.width * spread * 10) / 10 : atk.width,
      cooldown: Math.max(0.8, Math.round(atk.cooldown / tier.haste * 100) / 100),
      damage: [lo, hi],
    });
  });
  copy.loot = raidPocket(tier.id, boss.loot || []);
  return copy;
}

module.exports = {
  RAID_BOSSES,
  RAID_TIERS,
  raidBoss,
  raidTier,
  scaleRaidBoss,
  raidPocket,
  buildRaidRoll,
};
