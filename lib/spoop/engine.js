/**
 * Spoop life: training ticks, drops, arena, gold.
 * Time is America/New_York. The world clock only moves forward.
 */

const { xpForLevel, MAX_LEVEL } = require('../xpTable');
const { BOSS_DROPS } = require('./bosses');
const {
  SKILLS,
  SKILL_IDS,
  ACTIVITIES,
  TIERS,
  QUALITIES,
  QUALITY_WEIGHTS,
  WEAPONS,
  ARMOR,
  SLOTS,
  CRATES,
  DUMMY_NAMES,
} = require('./data');
const { osrsIdFor } = require('./item-ids');

const TZ = 'America/New_York';
// Hourly from 8am through 8pm. Pairs act on the quarter hours, two at a time,
// then the arena is everyone together at 9. XP and training gold are scaled
// off the old four-tick day, so a full day still lands in the same place.
const TICK_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const TICK_SLOT_MINUTES = [0, 15, 30, 45];
const FORMER_DAILY_TICKS = 4;
const TRAIN_SHARE = FORMER_DAILY_TICKS / TICK_HOURS.length;
const ARENA_HOUR = 21;
const MAX_EVENTS = (TICK_HOURS.length * TICK_SLOT_MINUTES.length + 1) * 32;
const STARTER_NAME = 'SpoopSpooply';
// Tuned for four ticks a day. Over six months the combat skills land around 80, prayer a little behind.
const XP_TIMESCALE = 760;
const BANK_SLOTS = 48;
const LOG_KEEP = 160;

function hashString(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function levelForXp(xp) {
  const n = Math.max(0, Number(xp) || 0);
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (n >= xpForLevel(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function etParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour,
    minute: parseInt(parts.minute, 10),
  };
}

function etDayKey(date) {
  const p = etParts(date);
  const m = String(p.month).padStart(2, '0');
  const d = String(p.day).padStart(2, '0');
  return `${p.year}-${m}-${d}`;
}

function tzOffsetMs(date) {
  const p = etParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return asUtc - date.getTime();
}

function zonedToUtc(year, month, day, hour, minute) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = tzOffsetMs(guess);
  const fixed = new Date(guess.getTime() - offset);
  const check = etParts(fixed);
  if (check.hour !== hour || check.day !== day) {
    const offset2 = tzOffsetMs(fixed);
    return new Date(guess.getTime() - offset2);
  }
  return fixed;
}

function addCalendarDays(year, month, day, n) {
  const dt = new Date(Date.UTC(year, month - 1, day + n));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function formatEt(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function clockLabel(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function scheduleBetween(fromExclusive, toInclusive) {
  const start = etParts(new Date(fromExclusive.getTime() - 36 * 3600 * 1000));
  const end = etParts(toInclusive);
  const events = [];
  let cursor = { year: start.year, month: start.month, day: start.day };
  const endKey = end.year * 10000 + end.month * 100 + end.day;
  for (let guard = 0; guard < 400; guard++) {
    const key = cursor.year * 10000 + cursor.month * 100 + cursor.day;
    if (key > endKey) break;
    const hours = [...TICK_HOURS, ARENA_HOUR];
    for (const hour of hours) {
      const minutes = hour === ARENA_HOUR ? [0] : TICK_SLOT_MINUTES;
      for (const minute of minutes) {
        const when = zonedToUtc(cursor.year, cursor.month, cursor.day, hour, minute);
        if (when > fromExclusive && when <= toInclusive) {
          events.push({
            when,
            kind: hour === ARENA_HOUR ? 'arena' : 'tick',
            drop: hour === 12,
            hour,
            minute,
          });
        }
      }
    }
    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }
  events.sort((a, b) => a.when - b.when);
  return events;
}

function nextEventAfter(date) {
  const ahead = new Date(date.getTime() + 48 * 3600 * 1000);
  const events = scheduleBetween(date, ahead);
  return events[0] || null;
}

function combatLevelFromLevels(levels) {
  const base = 0.25 * (levels.defence + levels.hitpoints + Math.floor(levels.prayer / 2));
  const melee = 0.325 * (levels.attack + levels.strength);
  const range = 0.325 * Math.floor(levels.ranged * 1.5);
  const mage = 0.325 * Math.floor(levels.magic * 1.5);
  return Math.floor(base + Math.max(melee, range, mage));
}

function levelsOf(skills) {
  const levels = {};
  for (const id of SKILL_IDS) levels[id] = levelForXp(skills[id] || 0);
  return levels;
}

function combatLevel(spoop) {
  return combatLevelFromLevels(levelsOf(spoop.skills));
}

function tierById(id) {
  return TIERS.find((t) => t.id === id) || TIERS[0];
}

function qualityIndex(id) {
  const i = QUALITIES.findIndex((q) => q.id === id);
  return i < 0 ? 2 : i;
}

function itemScore(item) {
  const ti = Math.max(0, TIERS.findIndex((t) => t.id === item.tier));
  return ti * 10 + qualityIndex(item.quality) + (item.unique ? 15 : 0);
}

function qualityLabel(quality, slot) {
  if (quality === 'sharpened' && slot !== 'weapon') return 'Reinforced';
  const q = QUALITIES.find((x) => x.id === quality);
  const id = q ? q.id : 'standard';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function itemDisplayName(item) {
  if (item.uniqueName) return item.uniqueName;
  const tier = tierById(item.tier);
  return `${qualityLabel(item.quality, item.slot)} ${tier.name} ${item.baseName}`;
}

function activityById(id) {
  return ACTIVITIES.find((a) => a.id === id) || ACTIVITIES[0];
}

function emptySkills() {
  const skills = {};
  for (const id of SKILL_IDS) skills[id] = 0;
  skills.hitpoints = xpForLevel(10);
  return skills;
}

function emptyEquipped() {
  const equipped = {};
  for (const slot of SLOTS) equipped[slot] = null;
  return equipped;
}

function createSpoop(name, bornIso) {
  return {
    name,
    owner: name,
    born: bornIso,
    gold: 0,
    skills: emptySkills(),
    activityId: 'chickens',
    activitySince: bornIso,
    equipped: emptyEquipped(),
    bank: [],
    nextItemId: 1,
    log: [],
    fights: [],
    arenaWins: 0,
    arenaLosses: 0,
    standingOrder: null,
    lessonSkill: null,
    lessonTicksLeft: 0,
    heat: { xp: false, boss: false, loot: false },
  };
}

const ROSTER = [
  ['Legolad52', null],
  ['Kycats12', null],
  ['NewLineChar', null],
  ['SpoopSpooply', 'Pooply'],
  ['Roby pls', null],
  ['Player1817', null],
  ['UncannyKaos', 'DefinitelyNotABot'],
  ['B7hund3r', null],
];

function rosterName(id, custom) {
  return custom || (id + "'s Spoop");
}

function spoopOrder(state) {
  const rank = new Map(ROSTER.map(([id], i) => [id, i]));
  return Object.values(state.spoops).sort((a, b) => {
    const ra = rank.has(a.owner) ? rank.get(a.owner) : ROSTER.length;
    const rb = rank.has(b.owner) ? rank.get(b.owner) : ROSTER.length;
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });
}

function tickMinuteFor(index, count) {
  const slots = TICK_SLOT_MINUTES.length;
  const perSlot = Math.max(1, Math.ceil(Math.max(1, count) / slots));
  const slot = Math.min(slots - 1, Math.floor(index / perSlot));
  return TICK_SLOT_MINUTES[slot];
}

function tickMinutes(state) {
  const order = spoopOrder(state);
  const minutes = new Map();
  order.forEach((spoop, index) => minutes.set(spoop, tickMinuteFor(index, order.length)));
  return minutes;
}

function applyRosterNames(state) {
  if (!state || !state.spoops) return state;
  for (const [id, custom] of ROSTER) {
    const spoop = state.spoops[id];
    if (!spoop) continue;
    spoop.name = rosterName(id, custom);
    spoop.owner = id;
  }
  return state;
}

function createWorld(now) {
  const iso = now.toISOString();
  const spoops = {};
  for (const [id, custom] of ROSTER) {
    const spoop = createSpoop(rosterName(id, custom), iso);
    spoop.owner = id;
    grantStarterGear(spoop);
    spoops[id] = spoop;
  }
  return {
    version: 1,
    clock: iso,
    useSim: false,
    spoops,
  };
}

function pushLog(spoop, when, text) {
  spoop.log.unshift({ at: when.toISOString(), text });
  if (spoop.log.length > LOG_KEEP) spoop.log.length = LOG_KEEP;
}

function insertLog(spoop, when, text) {
  if (!Array.isArray(spoop.log)) spoop.log = [];
  const entry = { at: when.toISOString(), text };
  const t = when.getTime();
  const idx = spoop.log.findIndex((row) => new Date(row.at).getTime() < t);
  if (idx < 0) spoop.log.push(entry);
  else spoop.log.splice(idx, 0, entry);
  if (spoop.log.length > LOG_KEEP) spoop.log.length = LOG_KEEP;
}

function spoopHasGear(spoop) {
  if (Array.isArray(spoop.bank) && spoop.bank.length) return true;
  const equipped = spoop.equipped || {};
  return SLOTS.some((slot) => equipped[slot]);
}

function starterSpec(rng) {
  const visible = new Set(['head', 'body', 'legs', 'shield', 'boots', 'gloves', 'cape']);
  const weapons = WEAPONS.map((w) => ({
    slot: 'weapon', tier: 'bronze', quality: 'standard', baseId: w.id, baseName: w.name, style: w.style,
  }));
  const armor = ARMOR.filter((a) => visible.has(a.slot)).map((a) => ({
    slot: a.slot, tier: 'bronze', quality: 'standard', baseId: a.id, baseName: a.name, style: null,
  }));
  const pool = weapons.concat(armor);
  return pool[Math.floor(rng() * pool.length)];
}

function grantStarterGear(spoop) {
  if (spoop.starterGear || spoopHasGear(spoop)) return false;
  const rng = mulberry32(hashString(`${spoop.owner || spoop.name}|starter-bronze`));
  const item = makeItem(spoop, rng, starterSpec(rng));
  if (!spoop.equipped) spoop.equipped = emptyEquipped();
  spoop.equipped[item.slot] = item;
  spoop.starterGear = true;
  insertLog(spoop, new Date(spoop.born || Date.now()), `Started with ${itemDisplayName(item)}.`);
  return true;
}

function ensureStarterGear(state) {
  if (!state || !state.spoops) return false;
  let granted = false;
  for (const spoop of Object.values(state.spoops)) {
    if (grantStarterGear(spoop)) granted = true;
  }
  return granted;
}

function pickWeighted(rng, items, weightFn) {
  let total = 0;
  const weights = items.map((item) => {
    const w = Math.max(0, weightFn(item));
    total += w;
    return w;
  });
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function activityPool(combat) {
  let pool = ACTIVITIES.filter((a) => combat >= a.min && combat <= a.max);
  if (pool.length < 4) pool = ACTIVITIES.filter((a) => combat >= a.min);
  if (!pool.length) pool = ACTIVITIES.filter((a) => a.min <= 3);
  return pool;
}

function heatOf(state, spoop, when, liveHeat) {
  if (state.useSim) {
    return {
      xp: !!(spoop.heat && spoop.heat.xp),
      boss: !!(spoop.heat && spoop.heat.boss),
      loot: !!(spoop.heat && spoop.heat.loot),
    };
  }
  if (liveHeat && etDayKey(when) === etDayKey(new Date())) return liveHeat;
  return { xp: false, boss: false, loot: false };
}

function chooseActivity(spoop, rng, heat) {
  const combat = combatLevel(spoop);
  const pool = activityPool(combat);
  const current = activityById(spoop.activityId);
  const stay = pool.some((a) => a.id === current.id) && rng() > 0.4 && !(spoop.lessonTicksLeft > 0);
  if (stay) return current;
  return pickWeighted(rng, pool, (a) => {
    let w = 1;
    if (spoop.lessonTicksLeft > 0 && spoop.lessonSkill === a.skill) w += 8;
    if (heat.boss && a.style !== 'skilling') w += 3;
    if (heat.xp && a.skill === current.skill) w += 2;
    if (a.money && pool.length > 40) w += 1;
    return w;
  });
}

function grantXp(spoop, skill, amount) {
  const cap = xpForLevel(MAX_LEVEL);
  const before = levelForXp(spoop.skills[skill] || 0);
  spoop.skills[skill] = Math.min(cap, (spoop.skills[skill] || 0) + amount);
  const after = levelForXp(spoop.skills[skill]);
  const skillName = SKILLS.find((s) => s.id === skill).name;
  const notes = [`+${amount} ${skillName} XP`];
  if (after > before) notes.push(`${skillName} is now level ${after}`);
  if (['attack', 'strength', 'defence', 'ranged', 'magic'].includes(skill)) {
    const hp = Math.max(1, Math.floor(amount / 3));
    const hpBefore = levelForXp(spoop.skills.hitpoints);
    spoop.skills.hitpoints = Math.min(cap, spoop.skills.hitpoints + hp);
    const hpAfter = levelForXp(spoop.skills.hitpoints);
    if (hpAfter > hpBefore) notes.push(`Hitpoints is now level ${hpAfter}`);
  }
  return notes;
}

function bestTierForCombat(combat) {
  let best = TIERS[0];
  for (const tier of TIERS) {
    if (combat >= tier.minCombat) best = tier;
  }
  return best;
}

function rollQuality(rng, shift) {
  const weights = QUALITY_WEIGHTS.slice();
  const steps = Math.max(0, Math.min(2, shift));
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < weights.length - 1; i++) {
      const move = Math.floor(weights[i] * 0.45);
      weights[i] -= move;
      weights[i + 1] += move;
    }
  }
  return pickWeighted(rng, QUALITIES, (q) => weights[QUALITIES.indexOf(q)] || 0);
}

function makeItem(spoop, rng, spec) {
  const id = spoop.nextItemId++;
  const item = {
    id,
    slot: spec.slot,
    tier: spec.tier,
    quality: spec.quality,
    baseId: spec.baseId,
    baseName: spec.baseName,
    style: spec.style || null,
  };
  return item;
}

function findItem(spoop, id) {
  if (id == null) return null;
  for (const slot of SLOTS) {
    const worn = spoop.equipped[slot];
    if (worn && worn.id === id) return worn;
  }
  return spoop.bank.find((i) => i.id === id) || null;
}

function noteStored(spoop, item) {
  if (item.storedAt == null) {
    spoop.bankSeq = (spoop.bankSeq || 0) + 1;
    item.storedAt = spoop.bankSeq;
  } else if (item.storedAt > (spoop.bankSeq || 0)) {
    spoop.bankSeq = item.storedAt;
  }
}

function trimBank(spoop) {
  if (!Array.isArray(spoop.bank)) spoop.bank = [];
  for (const item of spoop.bank) noteStored(spoop, item);
  if (spoop.bank.length <= BANK_SLOTS) return [];
  const ranked = spoop.bank.slice().sort((a, b) => {
    const byScore = itemScore(a) - itemScore(b);
    if (byScore) return byScore;
    return (a.storedAt || 0) - (b.storedAt || 0);
  });
  const cut = ranked.slice(0, spoop.bank.length - BANK_SLOTS);
  const cutIds = new Set(cut.map((i) => i.id));
  spoop.bank = spoop.bank.filter((i) => !cutIds.has(i.id));
  return cut;
}

function bankItem(spoop, item) {
  if (!spoop.bank.some((i) => i.id === item.id)) {
    noteStored(spoop, item);
    spoop.bank.push(item);
  }
  trimBank(spoop);
}

function equipIfBetter(spoop, item) {
  if (!canWear(spoop, item)) {
    bankItem(spoop, item);
    return false;
  }
  const current = spoop.equipped[item.slot];
  if (!current || itemScore(item) > itemScore(current)) {
    if (current) bankItem(spoop, current);
    delete item.storedAt;
    spoop.equipped[item.slot] = item;
    spoop.bank = spoop.bank.filter((i) => i.id !== item.id);
    return true;
  }
  bankItem(spoop, item);
  return false;
}

const TIER_LEVEL = {
  bronze: 1,
  iron: 1,
  steel: 5,
  black: 10,
  mithril: 20,
  adamant: 30,
  rune: 40,
  dragon: 60,
  barrows: 70,
  raid: 75,
};

function wearRequirement(item) {
  if (!item) return null;
  if (item.slot === 'neck' || item.slot === 'ring' || item.slot === 'cape') return null;
  let level = TIER_LEVEL[item.tier] || 1;
  if (item.tier === 'raid' && item.slot !== 'weapon' && item.slot !== 'ammo') level = 80;
  if (level <= 1) return null;
  let skill = 'defence';
  if (item.slot === 'weapon') {
    skill = item.style === 'ranged' ? 'ranged' : item.style === 'magic' ? 'magic' : 'attack';
  } else if (item.slot === 'ammo') {
    skill = 'ranged';
  }
  const skillName = (SKILLS.find((s) => s.id === skill) || {}).name || skill;
  return { skill, level, skillName };
}

function canWear(spoop, item) {
  const req = wearRequirement(item);
  if (!req) return true;
  return levelForXp(spoop.skills[req.skill] || 0) >= req.level;
}

function reequipBest(spoop) {
  const pool = [];
  for (const slot of SLOTS) {
    if (spoop.equipped[slot]) pool.push(spoop.equipped[slot]);
    spoop.equipped[slot] = null;
  }
  for (const item of spoop.bank) pool.push(item);
  const best = {};
  const bank = [];
  for (const item of pool) {
    if (!canWear(spoop, item)) {
      bank.push(item);
      continue;
    }
    const current = best[item.slot];
    if (!current || itemScore(item) > itemScore(current)) {
      if (current) bank.push(current);
      best[item.slot] = item;
    } else {
      bank.push(item);
    }
  }
  for (const slot of SLOTS) spoop.equipped[slot] = best[slot] || null;
  spoop.bank = bank;
  for (const item of spoop.bank) noteStored(spoop, item);
}

function applyWearRules(spoop, when) {
  const before = {};
  for (const slot of SLOTS) before[slot] = spoop.equipped[slot] || null;
  const notes = [];
  reequipBest(spoop);
  const cut = trimBank(spoop);
  if (cut.length) {
    const text = `${clockLabel(when)} — Cleared ${cut.length} old cheap ${cut.length === 1 ? 'piece' : 'pieces'} from the bank.`;
    pushLog(spoop, when, text);
    notes.push(text);
  }
  for (const slot of SLOTS) {
    const prev = before[slot];
    const now = spoop.equipped[slot];
    if (!prev || (now && now.id === prev.id) || canWear(spoop, prev)) continue;
    const req = wearRequirement(prev);
    const text = `${clockLabel(when)} — Took off ${itemDisplayName(prev)}. Needs ${req.level} ${req.skillName}.`;
    pushLog(spoop, when, text);
    notes.push(text);
  }
  return notes;
}

function emptySlots(spoop) {
  return SLOTS.filter((slot) => !spoop.equipped[slot]);
}

function randomPiece(rng, tierId, qualityId) {
  if (rng() < 0.45) {
    const w = WEAPONS[Math.floor(rng() * WEAPONS.length)];
    return { slot: 'weapon', tier: tierId, quality: qualityId, baseId: w.id, baseName: w.name, style: w.style };
  }
  const a = ARMOR[Math.floor(rng() * ARMOR.length)];
  return { slot: a.slot, tier: tierId, quality: qualityId, baseId: a.id, baseName: a.name, style: null };
}

function pieceForSlot(rng, slot, tierId, qualityId) {
  if (slot === 'weapon') {
    const w = WEAPONS[Math.floor(rng() * WEAPONS.length)];
    return { slot: 'weapon', tier: tierId, quality: qualityId, baseId: w.id, baseName: w.name, style: w.style };
  }
  const a = ARMOR.find((x) => x.slot === slot) || ARMOR[0];
  return { slot: a.slot, tier: tierId, quality: qualityId, baseId: a.id, baseName: a.name, style: null };
}

function giveItem(spoop, item) {
  const name = itemDisplayName(item);
  const equipped = equipIfBetter(spoop, item);
  if (equipped) return `Found ${name}. Equipped it.`;
  const still = spoop.bank.some((i) => i.id === item.id);
  if (!still) return `Found ${name}. The bank kept better gear, so this one was tossed.`;
  const req = wearRequirement(item);
  if (req && !canWear(spoop, item)) return `Found ${name}. Banked it. Needs ${req.level} ${req.skillName}.`;
  return `Found ${name}. Banked it.`;
}

function rollDrop(spoop, rng, heat) {
  const combat = combatLevel(spoop);
  let tier = bestTierForCombat(combat);
  const ti = TIERS.findIndex((t) => t.id === tier.id);
  if (ti > 0 && rng() < 0.25) tier = TIERS[ti - 1];
  const shift = (heat.xp ? 1 : 0) + (heat.loot ? 1 : 0);
  const rolls = shift >= 2 ? 2 : 1;
  let best = null;
  for (let i = 0; i < rolls; i++) {
    const quality = rollQuality(rng, shift);
    const holes = emptySlots(spoop);
    const spec = holes.length && rng() < 0.6
      ? pieceForSlot(rng, holes[Math.floor(rng() * holes.length)], tier.id, quality.id)
      : randomPiece(rng, tier.id, quality.id);
    const item = makeItem(spoop, rng, spec);
    if (!best || itemScore(item) > itemScore(best)) best = item;
  }
  return giveItem(spoop, best);
}

const WEAPON_SHEET = {
  dagger: { stab: 4, slash: 2, crush: -4, magic: 1 },
  sword: { stab: 6, slash: 4, crush: -2 },
  scimitar: { stab: 2, slash: 7, crush: -2 },
  longsword: { stab: 6, slash: 8, crush: -2 },
  mace: { stab: -2, slash: -2, crush: 7 },
  shortbow: { range: 8 },
  staff: { stab: 2, slash: -1, crush: 6, magic: 10 },
};

const WEAPON_STRENGTH = {
  dagger: 3,
  sword: 5,
  scimitar: 6,
  longsword: 9,
  mace: 6,
  staff: 3,
};

const ARMOR_SHEET = {
  'med-helm': { def: { stab: 4, slash: 5, crush: 3, magic: -1, range: 4 }, atk: { magic: -2, range: -1 } },
  platebody: { def: { stab: 16, slash: 16, crush: 15, magic: -1, range: 16 }, atk: { magic: -6, range: -3 } },
  platelegs: { def: { stab: 10, slash: 9, crush: 8, magic: -1, range: 10 }, atk: { magic: -4, range: -2 } },
  kiteshield: { def: { stab: 9, slash: 10, crush: 8, magic: -1, range: 8 }, atk: { magic: -2, range: -1 } },
  boots: { def: { stab: 1, slash: 2, crush: 3 } },
  gloves: { def: { stab: 2, slash: 2, crush: 1, magic: 1, range: 2 } },
  cape: { def: { stab: 1, slash: 1, crush: 1, magic: 1, range: 1 } },
};

function tierScale(piece) {
  if (!piece) return 0;
  return tierById(piece.tier).power / 2;
}

function qualitySteps(id) {
  return qualityIndex(id) - qualityIndex('standard');
}

/** Standard quality is 1. Each step off that is a 2% nudge. */
function qualityFactor(id) {
  return 1 + qualitySteps(id) * 0.02;
}

/** Base stat, then a small quality shift. Each step moves the number by one point, plus about 2%. */
function influence(base, qualityId) {
  if (!base) return 0;
  const steps = qualitySteps(qualityId);
  const plain = Math.round(base);
  if (!steps) return plain;
  const percent = Math.round(base * steps * 0.02);
  return plain + Math.sign(base) * steps + percent;
}

function addSheet(into, bonus, piece) {
  if (!bonus || !piece) return;
  const scale = tierScale(piece);
  for (const key of Object.keys(bonus)) into[key] += influence(bonus[key] * scale, piece.quality);
}

function emptyBonuses() {
  return {
    attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
    defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
    other: { melee: 0, ranged: 0, magic: 0, prayer: 0 },
  };
}

function bonusesForItem(item) {
  const bonuses = emptyBonuses();
  if (!item) return bonuses;
  const { attack, defence, other } = bonuses;
  const scale = tierScale(item);
  if (item.slot === 'weapon') {
    const sheet = WEAPON_SHEET[item.baseId] || WEAPON_SHEET.sword;
    addSheet(attack, sheet, item);
    other.melee += influence((WEAPON_STRENGTH[item.baseId] || 0) * scale, item.quality);
    if (item.baseId === 'staff') other.magic += influence(Math.max(0, scale - 1), item.quality);
  } else if (item.slot === 'neck') {
    const acc = influence(2 * scale, item.quality);
    attack.stab += acc;
    attack.slash += acc;
    attack.crush += acc;
    attack.magic += acc;
    attack.range += acc;
    other.melee += acc;
    other.prayer += influence(1, item.quality);
  } else if (item.slot === 'ring') {
    other.melee += influence(Math.max(1, scale), item.quality);
  } else if (item.slot === 'ammo') {
    other.ranged += influence(7 * scale, item.quality);
  } else {
    const sheet = ARMOR_SHEET[item.baseId];
    if (sheet) {
      addSheet(defence, sheet.def, item);
      addSheet(attack, sheet.atk, item);
    }
  }
  return bonuses;
}

function equipmentStats(spoop) {
  const totals = emptyBonuses();
  for (const slot of SLOTS) {
    const part = bonusesForItem(spoop.equipped[slot]);
    for (const group of ['attack', 'defence', 'other']) {
      for (const key of Object.keys(totals[group])) totals[group][key] += part[group][key];
    }
  }
  return totals;
}

function gearBonuses(spoop) {
  const gear = { meleeAcc: 1, meleeStr: 0, rangeAcc: 1, rangeStr: 0, mageAcc: 1, mageStr: 0, def: 0, style: 'melee' };
  const weapon = spoop.equipped.weapon;
  if (weapon) {
    const p = tierById(weapon.tier).power * qualityFactor(weapon.quality);
    gear.style = weapon.style || 'melee';
    if (gear.style === 'ranged') {
      gear.rangeAcc += p * 4;
      gear.rangeStr += p * 3;
    } else if (gear.style === 'magic') {
      gear.mageAcc += p * 4;
      gear.mageStr += p * 3;
    } else {
      gear.meleeAcc += p * 4;
      gear.meleeStr += p * 3;
    }
  }
  for (const slot of SLOTS) {
    if (slot === 'weapon') continue;
    const piece = spoop.equipped[slot];
    if (!piece) continue;
    const p = tierById(piece.tier).power * qualityFactor(piece.quality);
    if (slot === 'neck') {
      gear.meleeAcc += p;
      gear.rangeAcc += p;
      gear.mageAcc += p;
    } else if (slot === 'ring') {
      gear.meleeStr += p * 0.6;
      gear.rangeStr += p * 0.6;
      gear.mageStr += p * 0.6;
    } else if (slot === 'ammo') {
      gear.rangeAcc += p;
      gear.rangeStr += p * 0.5;
    } else {
      gear.def += p * 2;
    }
  }
  return gear;
}

function fighterFromSpoop(spoop) {
  return {
    name: spoop.name,
    skills: spoop.skills,
    gear: gearBonuses(spoop),
    dummy: false,
  };
}

function makeDummy(spoop, rng) {
  const name = DUMMY_NAMES[Math.floor(rng() * DUMMY_NAMES.length)];
  const skills = {};
  const levels = levelsOf(spoop.skills);
  for (const id of SKILL_IDS) {
    let lv = levels[id] + (Math.floor(rng() * 5) - 2);
    if (id === 'hitpoints') lv = Math.max(10, lv);
    else lv = Math.max(1, lv);
    skills[id] = xpForLevel(Math.min(MAX_LEVEL, lv));
  }
  const tier = bestTierForCombat(combatLevel(spoop));
  const power = tier.power * 0.85;
  const style = ['melee', 'ranged', 'magic'][Math.floor(rng() * 3)];
  const gear = { meleeAcc: 1, meleeStr: 0, rangeAcc: 1, rangeStr: 0, mageAcc: 1, mageStr: 0, def: power * 3, style };
  if (style === 'ranged') {
    gear.rangeAcc += power * 3;
    gear.rangeStr += power * 2;
  } else if (style === 'magic') {
    gear.mageAcc += power * 3;
    gear.mageStr += power * 2;
  } else {
    gear.meleeAcc += power * 3;
    gear.meleeStr += power * 2;
  }
  return { name, skills, gear, dummy: true };
}

function styleNumbers(fighter) {
  const levels = levelsOf(fighter.skills);
  const style = fighter.gear.style;
  if (style === 'ranged') {
    return { acc: levels.ranged + fighter.gear.rangeAcc, max: Math.max(1, Math.floor(levels.ranged / 8 + fighter.gear.rangeStr / 3)) };
  }
  if (style === 'magic') {
    return { acc: levels.magic + fighter.gear.mageAcc, max: Math.max(1, Math.floor(levels.magic / 8 + fighter.gear.mageStr / 3)) };
  }
  return { acc: levels.attack + fighter.gear.meleeAcc, max: Math.max(1, Math.floor(levels.strength / 8 + 1 + fighter.gear.meleeStr / 3)) };
}

function fight(a, b, rng) {
  const hpMaxA = levelForXp(a.skills.hitpoints);
  const hpMaxB = levelForXp(b.skills.hitpoints);
  let hpA = hpMaxA;
  let hpB = hpMaxB;
  const na = styleNumbers(a);
  const nb = styleNumbers(b);
  const defA = levelForXp(a.skills.defence) + a.gear.def + Math.floor(levelForXp(a.skills.prayer) / 4);
  const defB = levelForXp(b.skills.defence) + b.gear.def + Math.floor(levelForXp(b.skills.prayer) / 4);
  const chance = (acc, def) => Math.max(0.18, Math.min(0.85, acc / (acc + def)));
  const lines = [];
  const firstA = rng() > 0.5;
  for (let round = 1; round <= 12 && hpA > 0 && hpB > 0; round++) {
    const order = firstA ? [a, b] : [b, a];
    for (const actor of order) {
      if (hpA <= 0 || hpB <= 0) break;
      const attackingA = actor === a;
      const acc = attackingA ? na : nb;
      const def = attackingA ? defB : defA;
      if (rng() > chance(acc.acc, def)) {
        lines.push(`${actor.name} misses.`);
        continue;
      }
      const dmg = 1 + Math.floor(rng() * acc.max);
      if (attackingA) hpB = Math.max(0, hpB - dmg);
      else hpA = Math.max(0, hpA - dmg);
      const target = attackingA ? b.name : a.name;
      lines.push(`${actor.name} hits ${target} for ${dmg}.`);
    }
  }
  let winner = a;
  let loser = b;
  if (hpA <= 0 && hpB > 0) {
    winner = b;
    loser = a;
  } else if (hpB <= 0 && hpA > 0) {
    winner = a;
    loser = b;
  } else if (hpA / hpMaxA < hpB / hpMaxB) {
    winner = b;
    loser = a;
  }
  return { winner: winner.name, loser: loser.name, lines, hpA, hpB, hpMaxA, hpMaxB };
}

function goldGoal(gold) {
  const next = CRATES.find((c) => c.cost > gold);
  if (!next) {
    const last = CRATES[CRATES.length - 1];
    return { name: last.name, cost: last.cost, progress: 1 };
  }
  const index = CRATES.indexOf(next);
  const start = index > 0 ? CRATES[index - 1].cost : 0;
  const span = next.cost - start;
  return {
    name: next.name,
    cost: next.cost,
    progress: span <= 0 ? 1 : Math.max(0, Math.min(1, (gold - start) / span)),
  };
}

const UNIQUE_CHANCE = 0.04;
const DEATH_CHANCE = 0.06;
const DEATH_GOLD_SHARE = 0.1;

function makeUnique(spoop, spec) {
  const id = spoop.nextItemId++;
  return {
    id,
    slot: spec.slot,
    tier: spec.tier,
    quality: spec.quality,
    baseId: spec.baseId,
    baseName: spec.name,
    style: spec.style,
    unique: true,
    uniqueName: spec.name,
    osrsId: spec.osrsId,
  };
}

function fillSlotFromBank(spoop, slot) {
  const options = spoop.bank.filter((item) => item.slot === slot && canWear(spoop, item));
  if (!options.length) return null;
  options.sort((a, b) => itemScore(b) - itemScore(a));
  const next = options[0];
  spoop.bank = spoop.bank.filter((item) => item.id !== next.id);
  delete next.storedAt;
  spoop.equipped[slot] = next;
  return next;
}

function dieToBoss(spoop, bossName, rng) {
  const worn = SLOTS.map((slot) => spoop.equipped[slot]).filter(Boolean);
  let lost = null;
  let replaced = null;
  if (worn.length) {
    const item = worn[Math.floor(rng() * worn.length)];
    lost = itemDisplayName(item);
    spoop.equipped[item.slot] = null;
    const next = fillSlotFromBank(spoop, item.slot);
    if (next) replaced = itemDisplayName(next);
  }
  const fee = Math.min(spoop.gold, Math.floor(spoop.gold * DEATH_GOLD_SHARE));
  spoop.gold -= fee;
  let text = `Died to ${bossName}.`;
  if (lost) text += ` Lost ${lost}.`;
  if (fee > 0) text += ` Lost ${fee.toLocaleString('en-US')} gold.`;
  if (replaced) text += ` Equipped ${replaced} from the bank.`;
  else if (lost) text += ` Nothing in the bank could replace it.`;
  return text;
}

function bossEncounter(spoop, activity, when, rng) {
  const boss = BOSS_DROPS[activity.id];
  if (!boss) return [];
  const lines = [];
  if (rng() < UNIQUE_CHANCE && boss.drops.length) {
    const spec = boss.drops[Math.floor(rng() * boss.drops.length)];
    const item = makeUnique(spoop, spec);
    lines.push(`${clockLabel(when)} — Rare drop from ${boss.name}. ${giveItem(spoop, item)}`);
  }
  if (rng() < DEATH_CHANCE) {
    lines.push(`${clockLabel(when)} — ${dieToBoss(spoop, boss.name, rng)}`);
  }
  return lines;
}

function doTrainingTick(state, spoop, ev, liveHeat) {
  const heat = heatOf(state, spoop, ev.when, liveHeat);
  const rng = mulberry32(hashString(`${spoop.name}|tick|${ev.when.toISOString()}`));
  const next = chooseActivity(spoop, rng, heat);
  const swapped = next.id !== spoop.activityId;
  spoop.activityId = next.id;
  if (swapped) spoop.activitySince = ev.when.toISOString();
  if (spoop.lessonTicksLeft > 0) spoop.lessonTicksLeft -= 1;
  let xp = (18 + Math.floor(rng() * 28)) * XP_TIMESCALE * TRAIN_SHARE;
  if (heat.xp) xp += 20 * XP_TIMESCALE * TRAIN_SHARE;
  if (heat.boss && next.style !== 'skilling') xp += 12 * XP_TIMESCALE * TRAIN_SHARE;
  const pace = next.xpRate > 0 && next.xpRate < 1 ? next.xpRate : 1;
  xp = Math.max(1, Math.floor(xp * pace));
  const notes = grantXp(spoop, next.skill, xp);
  let gold = next.gold + Math.floor(rng() * Math.max(1, next.gold));
  if (heat.boss) gold += 4;
  gold = Math.round(gold * TRAIN_SHARE);
  spoop.gold += gold;
  const verb = swapped ? `Wandered off to ${next.name}` : `Kept at ${next.name}`;
  const text = `${clockLabel(ev.when)} — ${verb}. ${notes.join('. ')}. +${gold} gold.`;
  pushLog(spoop, ev.when, text);
  const extras = bossEncounter(spoop, next, ev.when, rng);
  for (const extra of extras) pushLog(spoop, ev.when, extra);
  return [text, ...extras].join(' ');
}

function doDrop(state, spoop, ev, liveHeat) {
  const heat = heatOf(state, spoop, ev.when, liveHeat);
  const rng = mulberry32(hashString(`${spoop.name}|drop|${ev.when.toISOString()}`));
  const text = `${clockLabel(ev.when)} — ${rollDrop(spoop, rng, heat)}`;
  pushLog(spoop, ev.when, text);
  return text;
}

function arenaStake(gold, avgLevel, rosterSize) {
  const purse = Math.max(0, Math.floor(gold));
  if (purse <= 0 || rosterSize <= 0 || avgLevel <= 0) return 0;
  const share = (avgLevel * 20) / rosterSize;
  const reference = avgLevel * 15;
  return Math.max(0, Math.min(purse, Math.round(share * (purse / reference))));
}

function arenaPayouts(pot, stakes) {
  const count = stakes.length;
  const amounts = new Array(count).fill(0);
  if (count === 0) return amounts;
  if (count === 1) {
    amounts[0] = pot;
    return amounts;
  }
  const field = Math.max(0, pot - stakes[0]);
  const second = Math.floor(field * 0.2);
  const third = count >= 3 ? Math.floor(field * 0.1) : 0;
  amounts[0] = pot - second - third;
  amounts[1] = second;
  if (count >= 3) amounts[2] = third;
  return amounts;
}

function payArenaPlace(spoop, ev, place, total, payout, stake) {
  const combat = combatLevel(spoop);
  const won = place === 1;
  spoop.gold -= stake;
  spoop.gold += payout;
  const net = payout - stake;
  const style = gearBonuses(spoop).style;
  const skill = style === 'ranged' ? 'ranged' : style === 'magic' ? 'magic' : 'strength';
  const xpNotes = grantXp(spoop, skill, (won ? 30 : 12) * XP_TIMESCALE);
  if (won) spoop.arenaWins += 1;
  else spoop.arenaLosses += 1;
  const sign = (net >= 0 ? '+' : '') + net;
  const text = `${clockLabel(ev.when)} — Spoopfight, place ${place} of ${total}. Staked ${stake.toLocaleString('en-US')} gold, took ${payout.toLocaleString('en-US')} from the pot. ${xpNotes.join('. ')}. ${sign} gold.`;
  pushLog(spoop, ev.when, text);
  spoop.fights.unshift({
    at: ev.when.toISOString(),
    opponent: 'Spoopfight',
    won,
    gold: net,
    place,
    lines: [],
    summary: text,
  });
  if (spoop.fights.length > 8) spoop.fights.length = 8;
  return { place, name: spoop.name, gold: net, payout, stake, won, combat, text };
}

function arenaPlacement(bout) {
  const ids = [];
  const seen = new Set();
  function add(id) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  }
  add(bout.winnerId);
  const dead = (bout.deaths || []).map((d) => d.id);
  for (let i = dead.length - 1; i >= 0; i--) add(dead[i]);
  (bout.fighters || []).forEach((f) => add(f.id));
  return ids;
}

function runNightlyArena(state, ev) {
  const roster = Object.values(state.spoops)
    .filter((spoop) => new Date(spoop.born) <= ev.when)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (roster.length < 2) {
    const notes = roster.map((spoop) => ({ name: spoop.name, text: doArena(spoop, ev) }));
    const only = roster[0];
    const fight = only && only.fights[0];
    state.lastArena = {
      at: ev.when.toISOString(),
      label: formatEt(ev.when),
      winner: fight && fight.won ? only.name : (fight ? fight.opponent : null),
      results: fight ? [{
        place: fight.won ? 1 : 2,
        name: only.name,
        gold: fight.gold,
        won: !!fight.won,
        combat: combatLevel(only),
        opponent: fight.opponent,
      }] : [],
      bout: null,
    };
    return notes;
  }
  const seed = hashString('nightly|' + ev.when.toISOString() + '|' + roster.map((s) => s.name).join('|'));
  const bout = simulateArena(roster, mulberry32(seed));
  const byId = {};
  bout.fighters.forEach((fighter, i) => { byId[fighter.id] = roster[i]; });
  const order = arenaPlacement(bout);
  const placed = order.map((id) => byId[id]).filter(Boolean);
  const avgLevel = placed.reduce((sum, spoop) => sum + combatLevel(spoop), 0) / (placed.length || 1);
  const stakes = placed.map((spoop) => arenaStake(spoop.gold, avgLevel, placed.length));
  const pot = stakes.reduce((sum, stake) => sum + stake, 0);
  const payouts = arenaPayouts(pot, stakes);
  const results = [];
  const notes = [];
  placed.forEach((spoop, index) => {
    const row = payArenaPlace(spoop, ev, index + 1, placed.length, payouts[index] || 0, stakes[index] || 0);
    results.push({
      place: row.place,
      name: row.name,
      gold: row.gold,
      payout: row.payout,
      stake: row.stake,
      won: row.won,
      combat: row.combat,
    });
    notes.push({ name: row.name, text: row.text });
  });
  state.lastArena = {
    at: ev.when.toISOString(),
    label: formatEt(ev.when),
    winner: results[0] ? results[0].name : null,
    pot,
    avgLevel: Math.round(avgLevel),
    results,
    bout,
  };
  return notes;
}

function nextArenaAfter(date) {
  const ahead = new Date(date.getTime() + 50 * 3600 * 1000);
  const events = scheduleBetween(date, ahead);
  return events.find((ev) => ev.kind === 'arena') || null;
}

function doArena(spoop, ev) {
  const rng = mulberry32(hashString(`${spoop.name}|arena|${ev.when.toISOString()}`));
  const dummy = makeDummy(spoop, rng);
  const result = fight(fighterFromSpoop(spoop), dummy, rng);
  const won = result.winner === spoop.name;
  const combat = combatLevel(spoop);
  const gold = won ? 25 + combat * 2 : 8 + combat;
  spoop.gold += gold;
  const style = gearBonuses(spoop).style;
  const skill = style === 'ranged' ? 'ranged' : style === 'magic' ? 'magic' : 'strength';
  const xpNotes = grantXp(spoop, skill, (won ? 30 : 12) * XP_TIMESCALE);
  if (won) spoop.arenaWins += 1;
  else spoop.arenaLosses += 1;
  const verb = won ? 'won' : 'lost';
  const text = `${clockLabel(ev.when)} — Fought ${dummy.name} and ${verb}. ${xpNotes.join('. ')}. +${gold} gold.`;
  pushLog(spoop, ev.when, text);
  spoop.fights.unshift({
    at: ev.when.toISOString(),
    opponent: dummy.name,
    won,
    gold,
    lines: result.lines.slice(0, 16),
    summary: text,
  });
  if (spoop.fights.length > 8) spoop.fights.length = 8;
  return text;
}

function crateById(id) {
  return CRATES.find((c) => c.id === id) || null;
}

function rollCratePiece(spoop, rng, tierId, shift, useful) {
  const quality = rollQuality(rng, shift);
  const holes = useful ? emptySlots(spoop) : [];
  const spec = holes.length && rng() < 0.55
    ? pieceForSlot(rng, holes[Math.floor(rng() * holes.length)], tierId, quality.id)
    : randomPiece(rng, tierId, quality.id);
  return makeItem(spoop, rng, spec);
}

function nearbyTier(rng, tierId) {
  const ids = TIERS.map((t) => t.id);
  const i = ids.indexOf(tierId);
  const roll = rng();
  if (roll < 0.14 && i > 0) return ids[i - 1];
  if (roll > 0.88 && i >= 0 && i < ids.length - 1) return ids[i + 1];
  return tierId;
}

function openCrate(spoop, crateId, when, rng) {
  const crate = crateById(crateId);
  if (!crate) return { ok: false, error: 'Unknown crate', cost: 0 };
  if (spoop.gold < crate.cost) return { ok: false, error: 'Need ' + crate.cost.toLocaleString() + ' gold', cost: crate.cost };
  spoop.gold -= crate.cost;
  const winIndex = 36;
  const reelItems = [];
  for (let i = 0; i < 56; i++) {
    const tierId = nearbyTier(rng, crate.tier);
    const shift = tierId === crate.tier ? crate.shift : 0;
    reelItems.push(rollCratePiece(spoop, rng, tierId, shift, false));
  }
  const winner = rollCratePiece(spoop, rng, crate.tier, crate.shift, true);
  reelItems[winIndex] = winner;
  const detail = giveItem(spoop, winner);
  const text = `${clockLabel(when)} — Spent ${crate.cost.toLocaleString()} gold on a ${crate.name}. ${detail}`;
  pushLog(spoop, when, text);
  return {
    ok: true,
    text,
    cost: crate.cost,
    roll: {
      crateId: crate.id,
      crateName: crate.name,
      cost: crate.cost,
      winIndex,
      winner: publicItem(winner),
      reel: reelItems.map(publicItem),
      detail,
    },
  };
}

function advance(state, targetDate, liveHeat) {
  const target = targetDate instanceof Date ? targetDate : new Date(targetDate);
  const from = new Date(state.clock);
  if (!(target > from)) return [];
  let events = scheduleBetween(from, target);
  let capped = false;
  if (events.length > MAX_EVENTS) {
    events = events.slice(0, MAX_EVENTS);
    capped = true;
  }
  const happened = [];
  const minutes = tickMinutes(state);
  function pushUpdate(name, text) {
    if (!text) return;
    happened.push({ name, text });
  }
  for (const spoop of Object.values(state.spoops)) {
    for (const text of applyWearRules(spoop, from)) pushUpdate(spoop.name, text);
  }
  for (const ev of events) {
    if (ev.kind === 'arena') {
      for (const row of runNightlyArena(state, ev)) pushUpdate(row.name, row.text);
      continue;
    }
    for (const spoop of Object.values(state.spoops)) {
      if (minutes.get(spoop) !== ev.minute) continue;
      if (new Date(spoop.born) > ev.when) continue;
      pushUpdate(spoop.name, doTrainingTick(state, spoop, ev, liveHeat));
      for (const text of applyWearRules(spoop, ev.when)) pushUpdate(spoop.name, text);
      if (ev.drop) pushUpdate(spoop.name, doDrop(state, spoop, ev, liveHeat));
    }
  }
  state.clock = (capped ? events[events.length - 1].when : target).toISOString();
  return happened;
}

function publicItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    slot: item.slot,
    tier: item.tier,
    quality: item.quality,
    style: item.style,
    baseId: item.baseId,
    name: itemDisplayName(item),
    score: itemScore(item),
    osrsId: osrsIdFor(item),
    bonuses: bonusesForItem(item),
    requirement: wearRequirement(item),
  };
}

function skillProgress(level, xp) {
  if (level >= MAX_LEVEL) return 1;
  const at = xpForLevel(level);
  const next = xpForLevel(level + 1);
  if (next <= at) return 1;
  return Math.max(0, Math.min(1, (xp - at) / (next - at)));
}

function gearGate(combat) {
  let prev = TIERS[0];
  let next = null;
  for (const tier of TIERS) {
    if (combat >= tier.minCombat) prev = tier;
    else { next = tier; break; }
  }
  if (!next) return { nextName: null, nextCombat: null, progress: 1 };
  const span = next.minCombat - prev.minCombat;
  const progress = span <= 0 ? 1 : (combat - prev.minCombat) / span;
  return { nextName: next.name, nextCombat: next.minCombat, progress: Math.max(0, Math.min(1, progress)) };
}

function presentSpoop(spoop) {
  const levels = levelsOf(spoop.skills);
  const act = activityById(spoop.activityId);
  const bank = spoop.bank.map(publicItem).sort((a, b) => b.score - a.score);
  return {
    name: spoop.name,
    owner: spoop.owner,
    gold: spoop.gold,
    combat: combatLevel(spoop),
    skills: SKILLS.map((s) => ({
      id: s.id,
      name: s.name,
      level: levels[s.id],
      xp: spoop.skills[s.id] || 0,
      toNext: levels[s.id] >= MAX_LEVEL ? 0 : xpForLevel(levels[s.id] + 1) - (spoop.skills[s.id] || 0),
      progress: skillProgress(levels[s.id], spoop.skills[s.id] || 0),
    })),
    gearGate: gearGate(combatLevel(spoop)),
    activity: {
      id: act.id,
      name: act.name,
      detail: act.detail,
      skill: act.skill,
      style: act.style,
      money: !!act.money,
      x: act.x,
      y: act.y,
      since: spoop.activitySince,
    },
    equipped: Object.fromEntries(SLOTS.map((slot) => [slot, publicItem(spoop.equipped[slot])])),
    bank,
    log: spoop.log.slice(0, 40),
    fights: spoop.fights.slice(0, 5),
    arenaWins: spoop.arenaWins,
    arenaLosses: spoop.arenaLosses,
    standingOrder: spoop.standingOrder,
    lessonSkill: spoop.lessonSkill,
    lessonTicksLeft: spoop.lessonTicksLeft,
    heat: spoop.heat || { xp: false, boss: false, loot: false },
    goldGoal: goldGoal(spoop.gold),
    combatStats: equipmentStats(spoop),
  };
}

const ARENA_NAMES_A = ['Spoop', 'Gloop', 'Nib', 'Wob', 'Muck', 'Peb', 'Squint', 'Dreg', 'Moss', 'Pip', 'Grub', 'Noodle', 'Bram', 'Tilly', 'Hoot', 'Crumb', 'Bog', 'Fenn', 'Lark', 'Jib', 'Snip', 'Toad', 'Wisp', 'Cob'];
const ARENA_NAMES_B = ['ly', 'kin', 'bottom', 'wick', 'snout', 'bean', 'fang', 'pocket', 'whisk', 'nose', 'toe', 'mug', 'cap', 'ling', 'bert', 'win'];

const ARENA_W = 100;
const ARENA_H = 72;
const ARENA_MARGIN = 6;
const ARENA_SIGHT = 50;
const ARENA_SPEED = 5.4;
const ARENA_BODY = 4.6;
const ARENA_STEP = 0.1;
const ARENA_MAX_T = 420;

function clampLevel(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function setSkillLevel(spoop, skill, level) {
  const lo = skill === 'hitpoints' ? 10 : 1;
  spoop.skills[skill] = xpForLevel(clampLevel(level, lo, 99));
}

function arenaName(rng, used) {
  for (let n = 0; n < 60; n++) {
    const name = ARENA_NAMES_A[Math.floor(rng() * ARENA_NAMES_A.length)] + ARENA_NAMES_B[Math.floor(rng() * ARENA_NAMES_B.length)];
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const name = 'Spoop ' + (used.size + 1);
  used.add(name);
  return name;
}

function wearRolledPiece(spoop, rng, slot, tierIndex, build) {
  for (let i = tierIndex; i >= 0; i--) {
    const quality = rollQuality(rng, 0);
    const tierId = TIERS[i].id;
    let spec;
    if (slot === 'weapon') {
      const pool = WEAPONS.filter((w) => w.style === build);
      const w = pool[Math.floor(rng() * pool.length)];
      spec = { slot, tier: tierId, quality: quality.id, baseId: w.id, baseName: w.name, style: w.style };
    } else {
      spec = pieceForSlot(rng, slot, tierId, quality.id);
    }
    const item = makeItem(spoop, rng, spec);
    if (canWear(spoop, item)) return item;
  }
  return null;
}

function rollArenaSpoop(rng, used) {
  const spoop = createSpoop(arenaName(rng, used), new Date().toISOString());
  const build = ['melee', 'melee', 'ranged', 'magic'][Math.floor(rng() * 4)];
  const power = 12 + Math.floor(rng() * 86);
  const jitter = () => Math.floor(rng() * 21) - 10;
  if (build === 'ranged') {
    setSkillLevel(spoop, 'ranged', clampLevel(power + jitter(), 1, 99));
    setSkillLevel(spoop, 'defence', clampLevel(power * 0.75 + jitter(), 1, 99));
    setSkillLevel(spoop, 'attack', clampLevel(power * 0.4 + jitter(), 1, 99));
    setSkillLevel(spoop, 'strength', clampLevel(power * 0.4 + jitter(), 1, 99));
    setSkillLevel(spoop, 'magic', clampLevel(power * 0.35 + jitter(), 1, 99));
  } else if (build === 'magic') {
    setSkillLevel(spoop, 'magic', clampLevel(power + jitter(), 1, 99));
    setSkillLevel(spoop, 'defence', clampLevel(power * 0.7 + jitter(), 1, 99));
    setSkillLevel(spoop, 'attack', clampLevel(power * 0.35 + jitter(), 1, 99));
    setSkillLevel(spoop, 'strength', clampLevel(power * 0.35 + jitter(), 1, 99));
    setSkillLevel(spoop, 'ranged', clampLevel(power * 0.35 + jitter(), 1, 99));
  } else {
    setSkillLevel(spoop, 'attack', clampLevel(power + jitter(), 1, 99));
    setSkillLevel(spoop, 'strength', clampLevel(power + jitter(), 1, 99));
    setSkillLevel(spoop, 'defence', clampLevel(power * 0.9 + jitter(), 1, 99));
    setSkillLevel(spoop, 'ranged', clampLevel(power * 0.35 + jitter(), 1, 99));
    setSkillLevel(spoop, 'magic', clampLevel(power * 0.3 + jitter(), 1, 99));
  }
  setSkillLevel(spoop, 'hitpoints', clampLevel(Math.max(10, power + jitter()), 10, 99));
  setSkillLevel(spoop, 'prayer', clampLevel(power * (0.15 + rng() * 0.7), 1, 99));

  const tier = bestTierForCombat(combatLevel(spoop));
  let tierIndex = Math.max(0, TIERS.findIndex((t) => t.id === tier.id));
  const bump = rng();
  if (bump < 0.22 && tierIndex > 0) tierIndex -= 1;
  else if (bump > 0.82 && tierIndex < TIERS.length - 1) tierIndex += 1;
  for (const slot of SLOTS) {
    if (slot !== 'weapon' && rng() < 0.16) continue;
    if (slot === 'ammo' && build !== 'ranged' && rng() < 0.7) continue;
    const piece = wearRolledPiece(spoop, rng, slot, tierIndex, build);
    if (piece) spoop.equipped[slot] = piece;
  }
  return spoop;
}

function arenaPortrait(spoop, id) {
  const levels = levelsOf(spoop.skills);
  const gear = gearBonuses(spoop);
  const profile = styleNumbers({ skills: spoop.skills, gear });
  const equipped = {};
  const gearNames = [];
  for (const slot of SLOTS) {
    const item = spoop.equipped[slot];
    if (!item) continue;
    equipped[slot] = { tier: item.tier, quality: item.quality, style: item.style || null };
    gearNames.push(itemDisplayName(item));
  }
  return {
    id,
    name: spoop.name,
    combat: combatLevel(spoop),
    style: gear.style,
    maxHp: levels.hitpoints,
    maxHit: profile.max,
    levels,
    weapon: spoop.equipped.weapon ? itemDisplayName(spoop.equipped.weapon) : 'Unarmed',
    gear: gearNames,
    equipped,
  };
}

function arenaRange(style) {
  if (style === 'ranged') return 32;
  if (style === 'magic') return 30;
  return 5.6;
}

function arenaDelay(style, rng) {
  const base = style === 'melee' ? 4.4 : style === 'ranged' ? 5.4 : 5.8;
  return base * (0.9 + rng() * 0.22);
}

function arenaDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function arenaClamp(f) {
  f.x = Math.max(8, Math.min(ARENA_W - 8, f.x));
  f.y = Math.max(16, Math.min(ARENA_H - 6, f.y));
}

function arenaMoveToward(f, x, y, dt) {
  const dx = x - f.x;
  const dy = y - f.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return;
  const step = Math.min(d, ARENA_SPEED * dt);
  f.x += (dx / d) * step;
  f.y += (dy / d) * step;
}

function arenaSpawns(n, rng) {
  const pts = [];
  const cx = ARENA_W / 2;
  const cy = 42;
  const outer = Math.min(n, 10);
  for (let i = 0; i < n; i++) {
    const inner = i >= outer;
    const index = inner ? i - outer : i;
    const count = inner ? n - outer : outer;
    const a = (index / count) * Math.PI * 2 - Math.PI / 2 + (rng() - 0.5) * 0.2;
    const rx = inner ? 16 : 36;
    const ry = inner ? 8 : 16;
    pts.push({
      x: Math.max(8, Math.min(ARENA_W - 8, cx + Math.cos(a) * rx)),
      y: Math.max(20, Math.min(ARENA_H - 6, cy + Math.sin(a) * ry)),
    });
  }
  return pts;
}

function pickArenaTarget(self, others, rng) {
  let best = null;
  let bestScore = Infinity;
  for (const other of others) {
    if (other === self || !other.alive) continue;
    const d = arenaDist(self, other);
    if (d > ARENA_SIGHT) continue;
    const score = d * (0.68 + rng() * 0.64);
    if (score < bestScore) {
      bestScore = score;
      best = other;
    }
  }
  return best;
}

function simulateArena(spoops, rng) {
  const profiles = spoops.map((spoop, i) => {
    const portrait = arenaPortrait(spoop, 'f' + i);
    const gear = gearBonuses(spoop);
    const nums = styleNumbers({ skills: spoop.skills, gear });
    const levels = levelsOf(spoop.skills);
    return {
      portrait,
      acc: nums.acc,
      max: nums.max,
      def: levels.defence + gear.def + Math.floor(levels.prayer / 4),
      style: gear.style,
    };
  });
  const spawns = arenaSpawns(spoops.length, rng);
  const bodies = profiles.map((p, i) => ({
    id: p.portrait.id,
    name: p.portrait.name,
    style: p.style,
    acc: p.acc,
    max: p.max,
    def: p.def,
    hp: p.portrait.maxHp,
    maxHp: p.portrait.maxHp,
    x: spawns[i].x,
    y: spawns[i].y,
    alive: true,
    targetId: null,
    retargetAt: rng() * 0.8,
    cd: rng() * arenaDelay(p.style, rng),
    wander: null,
    wanderUntil: 0,
    track: [[0, round1(spawns[i].x), round1(spawns[i].y)]],
  }));
  const hits = [];
  const deaths = [];
  const chance = (acc, def) => Math.max(0.18, Math.min(0.85, acc / (acc + Math.max(1, def))));
  let t = 0;
  let winnerId = null;
  let called = false;

  function aliveBodies() {
    return bodies.filter((b) => b.alive);
  }

  function byId(id) {
    return bodies.find((b) => b.id === id) || null;
  }

  for (let step = 0; step < ARENA_MAX_T / ARENA_STEP; step++) {
    t = round1((step + 1) * ARENA_STEP);
    const living = aliveBodies();
    if (living.length <= 1) {
      winnerId = living[0] ? living[0].id : null;
      break;
    }
    for (const f of bodies) {
      if (!f.alive) continue;
      let target = f.targetId ? byId(f.targetId) : null;
      const lost = !target || !target.alive || arenaDist(f, target) > ARENA_SIGHT;
      if (lost || t >= f.retargetAt) {
        target = pickArenaTarget(f, bodies, rng);
        f.targetId = target ? target.id : null;
        f.retargetAt = t + 2.6 + rng() * 2.2;
      }
      if (target) {
        const d = arenaDist(f, target);
        if (d > arenaRange(f.style) + 0.35) arenaMoveToward(f, target.x, target.y, ARENA_STEP);
      } else {
        if (!f.wander || arenaDist(f, f.wander) < 1.5 || t >= f.wanderUntil) {
          const toward = rng() < 0.5;
          f.wander = toward
            ? { x: ARENA_W / 2 + (rng() - 0.5) * 36, y: ARENA_H / 2 + (rng() - 0.5) * 22 }
            : {
              x: ARENA_MARGIN + rng() * (ARENA_W - ARENA_MARGIN * 2),
              y: ARENA_MARGIN + rng() * (ARENA_H - ARENA_MARGIN * 2),
            };
          f.wanderUntil = t + 4 + rng() * 3;
        }
        arenaMoveToward(f, f.wander.x, f.wander.y, ARENA_STEP);
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (!a.alive || !b.alive) continue;
        const d = arenaDist(a, b);
        if (d >= ARENA_BODY || d < 0.001) continue;
        const push = (ARENA_BODY - d) / 2;
        const nx = (a.x - b.x) / d;
        const ny = (a.y - b.y) / d;
        a.x += nx * push;
        a.y += ny * push;
        b.x -= nx * push;
        b.y -= ny * push;
      }
    }
    for (const f of bodies) {
      if (!f.alive) continue;
      arenaClamp(f);
      if (step % 2 === 0) f.track.push([t, round1(f.x), round1(f.y), f.targetId || '']);
      const target = f.targetId ? byId(f.targetId) : null;
      f.cd -= ARENA_STEP;
      if (!target || !target.alive || f.cd > 0) continue;
      if (arenaDist(f, target) > arenaRange(f.style) + 0.6) continue;
      f.cd = arenaDelay(f.style, rng);
      const miss = rng() > chance(f.acc, target.def);
      const amount = miss ? 0 : 1 + Math.floor(rng() * f.max);
      if (!miss) target.hp = Math.max(0, target.hp - amount);
      hits.push({
        t,
        from: f.id,
        to: target.id,
        amount,
        miss,
        hp: target.hp,
        style: f.style,
      });
      if (target.hp <= 0 && target.alive) {
        target.alive = false;
        target.targetId = null;
        target.track.push([t, round1(target.x), round1(target.y), '']);
        deaths.push({ t, id: target.id, by: f.id });
      }
    }
    if (aliveBodies().length <= 1) {
      winnerId = aliveBodies()[0] ? aliveBodies()[0].id : null;
      break;
    }
  }
  if (!winnerId) {
    const left = aliveBodies().sort((a, b) => b.hp - a.hp);
    winnerId = left[0] ? left[0].id : null;
    called = true;
  }
  return {
    width: ARENA_W,
    height: ARENA_H,
    duration: t,
    called,
    winnerId,
    fighters: profiles.map((p) => p.portrait),
    tracks: bodies.map((b) => ({ id: b.id, pts: b.track })),
    hits,
    deaths,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function buildArenaTest(count, seed) {
  const n = Math.max(2, Math.min(20, parseInt(count, 10) || 2));
  const rng = mulberry32((Number(seed) >>> 0) || 1);
  const used = new Set();
  const spoops = [];
  for (let i = 0; i < n; i++) spoops.push(rollArenaSpoop(rng, used));
  const fight = simulateArena(spoops, rng);
  fight.seed = Number(seed) >>> 0;
  fight.count = n;
  return fight;
}

function presentWorld(state, debug, happened) {
  const clock = new Date(state.clock);
  const upcoming = nextEventAfter(clock);
  return {
    debug: !!debug,
    clock: state.clock,
    clockLabel: formatEt(clock),
    useSim: !!state.useSim,
    nextEvent: upcoming
      ? {
          at: upcoming.when.toISOString(),
          label: formatEt(upcoming.when),
          kind: upcoming.drop ? 'drop' : upcoming.kind,
        }
      : null,
    happened: happened || [],
    crates: CRATES,
    bankSlots: BANK_SLOTS,
    spoops: Object.values(state.spoops).map(presentSpoop),
    nightArena: nightArenaPublic(state),
  };
}

function nightArenaPublic(state) {
  const now = new Date(state.clock);
  const next = nextArenaAfter(now);
  const last = state.lastArena;
  return {
    nextAt: next ? next.when.toISOString() : null,
    nextLabel: next ? formatEt(next.when) : null,
    last: last ? {
      at: last.at,
      label: last.label,
      winner: last.winner,
      pot: last.pot == null ? null : last.pot,
      avgLevel: last.avgLevel == null ? null : last.avgLevel,
      results: last.results || [],
    } : null,
  };
}

module.exports = {
  STARTER_NAME,
  TZ,
  createWorld,
  applyRosterNames,
  ensureStarterGear,
  createSpoop,
  advance,
  openCrate,
  applyWearRules,
  presentWorld,
  nextEventAfter,
  combatLevel,
  levelForXp,
  etDayKey,
  formatEt,
  nextArenaAfter,
  scheduleBetween,
  hashString,
  mulberry32,
  bossEncounter,
  buildArenaTest,
};
