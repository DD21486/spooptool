/**
 * Spoop life: training ticks, random events, drops, arena, gold.
 * Time is America/New_York. The world clock only moves forward.
 */

const { xpForLevel, levelForXp, MAX_LEVEL } = require('../xpTable');
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
  ERRANDS,
  CRATES,
  DUMMY_NAMES,
  PETS,
} = require('./data');
const { RANDOM_EVENTS, EVENT_GOLD } = require('./random-events');
const {
  groundById,
  activityById: idleActivityById,
} = require('./idle-grounds');
const { osrsIdFor } = require('./item-ids');
const {
  bestQuest,
  resolveQuestXp,
  questByActivity,
  questRecord,
  questSkills,
} = require('./quests');

const TZ = 'America/New_York';
// Hourly from 8am through 8pm. The original eight share the quarter hours in
// pairs. Anyone added later joins a pair, so that slot becomes three and the
// others keep their minute. The arena is everyone together at 9. XP and
// training gold are scaled off the old four-tick day, so a full day still
// lands in the same place.
const TICK_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const TICK_SLOT_MINUTES = [0, 15, 30, 45];
const FORMER_DAILY_TICKS = 4;
const TRAIN_SHARE = FORMER_DAILY_TICKS / TICK_HOURS.length;
const ARENA_HOUR = 21;
const MAX_EVENTS = (TICK_HOURS.length * TICK_SLOT_MINUTES.length + 1) * 32;
// One coin flip per ET day. About half of days a pair gets mad.
const PK_DAY_CHANCE = 0.5;
const PK_DELAY_MS = 10 * 60 * 1000;
// Same pace and speeds as public/js/arena.js. Playback is sim time / (speed * pace).
const FIGHT_PACE = 0.55;
const PK_PLAY_SPEED = 2;
const ARENA_PLAY_SPEED = 1.5;
const PK_REASONS = [
  'They both grabbed for the same drop.',
  'One called the other\'s gear a costume.',
  'A comment about combat level did not land.',
  'They argued over the crab spot.',
  'Someone said sit and meant it.',
  'The loot pile had two names on it.',
  'They met at the bank and it went badly.',
  'A joke duel stopped being a joke.',
  'They both wanted the last word.',
  'One of them stood where the other was standing.',
];
const STARTER_NAME = 'SpoopSpooply';
// Tuned for four ticks a day. Over six months the combat skills land around 80, prayer a little behind.
// Low levels take a smaller share of that XP, so a tick adds about a level instead of skipping the teens.
// The full rate is back near level 80.
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

function xpRamp(level) {
  const t = Math.max(0, Math.min(1, ((Number(level) || 1) - 1) / 79));
  return 0.08 + 0.92 * t * t;
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

function etCalendarDayKey(year, month, day) {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function arenaPostponeMs(state, year, month, day) {
  const postpone = state && state.arenaPostpone;
  if (!postpone || typeof postpone.ms !== 'number' || postpone.ms <= 0) return 0;
  if (postpone.day !== etCalendarDayKey(year, month, day)) return 0;
  return postpone.ms;
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

function scheduleBetween(fromExclusive, toInclusive, state) {
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
        let when = zonedToUtc(cursor.year, cursor.month, cursor.day, hour, minute);
        if (hour === ARENA_HOUR && minute === 0) {
          when = new Date(when.getTime() + arenaPostponeMs(state, cursor.year, cursor.month, cursor.day));
        }
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

function nextEventAfter(date, state) {
  const ahead = new Date(date.getTime() + 48 * 3600 * 1000);
  const events = scheduleBetween(date, ahead, state);
  return events[0] || null;
}

function nextSpoopAction(state, spoop, fromDate) {
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const minute = tickMinutes(state).get(spoop);
  const born = new Date(spoop.born || 0);
  const ahead = new Date(from.getTime() + 36 * 3600 * 1000);
  const events = scheduleBetween(from, ahead, state);
  for (const ev of events) {
    if (born > ev.when) continue;
    if (ev.kind === 'arena') return { at: ev.when, kind: 'arena' };
    if (ev.kind === 'tick' && ev.minute === minute) {
      return { at: ev.when, kind: ev.drop ? 'drop' : 'tick' };
    }
  }
  return null;
}

function nextMoveLine(state, spoop, after) {
  const from = after instanceof Date ? after : new Date(after);
  const next = nextSpoopAction(state, spoop, from);
  if (!next) return '';
  const label = (when) => {
    const time = clockLabel(when) + ' ET';
    return etDayKey(when) !== etDayKey(from) ? time + ' tomorrow' : time;
  };
  const quiet = next.at.getTime() - from.getTime() >= 3 * 60 * 60 * 1000;
  if (next.kind === 'arena') {
    const later = nextSpoopAction(state, spoop, next.at);
    let line = 'Arena at ' + label(next.at) + '.';
    if (later && later.kind !== 'arena') line += ' Moves again at ' + label(later.at) + '.';
    return line;
  }
  let line = 'Moves again at ' + label(next.at) + '.';
  if (quiet) line += ' Nothing until then.';
  return line;
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

function errandById(id) {
  return ERRANDS.find((row) => row.id === id) || null;
}

function activityById(id) {
  return ACTIVITIES.find((a) => a.id === id) || idleActivityById(id) || errandById(id) || ACTIVITIES[0];
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
    settledTier: 'bronze',
    idleTier: null,
    idleTicksLeft: 0,
    idleTicksTotal: 0,
    quests: [],
  };
}

const ROSTER = [
  ['Legolad52', 'Roby'],
  ['Kycats12', null],
  ['NewLineChar', null],
  ['SpoopSpooply', 'Pooply'],
  ['Roby pls', 'Retardchud'],
  ['Player1817', null],
  ['hearthside', 'Fe Psiloi'],
  ['UncannyKaos', 'DefinitelyNotABot'],
  ['B7hund3r', 'ThunderSpoop'],
  ['Smegmatude', 'Spills'],
];

function rosterName(id, custom) {
  return custom || (id + "'s Spoop");
}

// Quarter-hour slots. Later spoops are named here so they join a pair
// instead of lengthening :30 and shoving the line down.
const TICK_MINUTE = {
  Legolad52: 0,
  Kycats12: 0,
  NewLineChar: 15,
  SpoopSpooply: 15,
  'Roby pls': 30,
  Player1817: 30,
  hearthside: 30,
  UncannyKaos: 45,
  B7hund3r: 45,
  Smegmatude: 45,
};

function tickMinutes(state) {
  const minutes = new Map();
  const counts = new Map(TICK_SLOT_MINUTES.map((minute) => [minute, 0]));
  const loose = [];
  for (const spoop of Object.values(state.spoops || {})) {
    const minute = TICK_MINUTE[spoop.owner];
    if (minute == null) {
      loose.push(spoop);
      continue;
    }
    minutes.set(spoop, minute);
    counts.set(minute, counts.get(minute) + 1);
  }
  for (const spoop of loose) {
    let minute = TICK_SLOT_MINUTES[0];
    let best = Infinity;
    for (const slot of TICK_SLOT_MINUTES) {
      const n = counts.get(slot);
      if (n < best) {
        best = n;
        minute = slot;
      }
    }
    minutes.set(spoop, minute);
    counts.set(minute, best + 1);
  }
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

function ensureRoster(state) {
  if (!state || !state.spoops) return false;
  const born = state.clock || new Date().toISOString();
  let added = false;
  for (const [id, custom] of ROSTER) {
    if (state.spoops[id]) continue;
    const spoop = createSpoop(rosterName(id, custom), born);
    spoop.owner = id;
    grantStarterGear(spoop);
    state.spoops[id] = spoop;
    added = true;
  }
  return added;
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

function chooseActivity(spoop, rng) {
  const combat = combatLevel(spoop);
  const pool = activityPool(combat);
  const current = ACTIVITIES.find((a) => a.id === spoop.activityId);
  const stay = current && pool.some((a) => a.id === current.id) && rng() > 0.4 && !(spoop.lessonTicksLeft > 0);
  if (stay) return current;
  return pickWeighted(rng, pool, (a) => {
    let w = 1;
    if (spoop.lessonTicksLeft > 0 && spoop.lessonSkill === a.skill) w += 8;
    if (a.money && pool.length > 40) w += 1;
    return w;
  });
}

function grantXp(spoop, skill, amount) {
  ensureBracket(spoop);
  const cap = xpForLevel(MAX_LEVEL);
  const before = levelForXp(spoop.skills[skill] || 0);
  spoop.skills[skill] = Math.min(cap, (spoop.skills[skill] || 0) + amount);
  const after = levelForXp(spoop.skills[skill]);
  const skillName = SKILLS.find((s) => s.id === skill).name;
  const notes = [`+${amount} ${skillName} XP`];
  const gains = [{ id: skill, amount }];
  if (after > before) notes.push(`${skillName} is now level ${after}`);
  if (['attack', 'strength', 'defence', 'ranged', 'magic'].includes(skill)) {
    const hp = Math.max(1, Math.floor(amount / 3));
    const hpBefore = levelForXp(spoop.skills.hitpoints);
    spoop.skills.hitpoints = Math.min(cap, spoop.skills.hitpoints + hp);
    const hpAfter = levelForXp(spoop.skills.hitpoints);
    if (hpAfter > hpBefore) notes.push(`Hitpoints is now level ${hpAfter}`);
    gains.push({ id: 'hitpoints', amount: hp });
  }
  notes.gains = gains;
  openIdleIfNeeded(spoop);
  return notes;
}

function bestTierForCombat(combat) {
  let best = TIERS[0];
  for (const tier of TIERS) {
    if (combat >= tier.minCombat) best = tier;
  }
  return best;
}

function tierIndex(id) {
  const index = TIERS.findIndex((tier) => tier.id === id);
  return index < 0 ? 0 : index;
}

// Hours on the ground between brackets. Short brackets get a shorter pause.
// Long ones cap at about a day of their ticks, so the stretch is a place and not a week.
function idleTickCount(index) {
  const here = TIERS[index];
  const prev = TIERS[index - 1];
  const next = TIERS[index + 1];
  const span = next
    ? next.minCombat - here.minCombat
    : here.minCombat - (prev ? prev.minCombat : 0);
  return Math.max(4, Math.min(10, span));
}

function ensureBracket(spoop) {
  if (spoop.settledTier && TIERS.some((tier) => tier.id === spoop.settledTier)) return;
  spoop.settledTier = bestTierForCombat(combatLevel(spoop)).id;
  spoop.idleTier = null;
  spoop.idleTicksLeft = 0;
  spoop.idleTicksTotal = 0;
}

function openIdleIfNeeded(spoop) {
  ensureBracket(spoop);
  if (spoop.idleTicksLeft > 0 && spoop.idleTier) return;
  const reached = tierIndex(bestTierForCombat(combatLevel(spoop)).id);
  const settled = tierIndex(spoop.settledTier);
  if (reached <= settled) return;
  const step = settled + 1;
  const count = idleTickCount(step);
  spoop.idleTier = TIERS[step].id;
  spoop.idleTicksLeft = count;
  spoop.idleTicksTotal = count;
}

function spendIdleHour(spoop, when) {
  if (!(spoop.idleTicksLeft > 0) || !spoop.idleTier) return null;
  spoop.idleTicksLeft -= 1;
  if (spoop.idleTicksLeft > 0) return null;
  const opened = tierById(spoop.idleTier);
  spoop.settledTier = opened.id;
  spoop.idleTier = null;
  spoop.idleTicksLeft = 0;
  spoop.idleTicksTotal = 0;
  openIdleIfNeeded(spoop);
  if (!when || spoop.idleTicksLeft > 0) return null;
  const name = opened.name.charAt(0).toUpperCase() + opened.name.slice(1);
  const text = `${name} drops are open.`;
  pushLog(spoop, when, `${clockLabel(when)} — ${text}`);
  return text;
}

function bracketView(spoop) {
  ensureBracket(spoop);
  const settled = tierById(spoop.settledTier);
  const ground = spoop.idleTicksLeft > 0 && spoop.idleTier ? groundById(spoop.idleTier) : null;
  if (!ground) return { settled, idle: null };
  return {
    settled,
    idle: {
      id: spoop.idleTier,
      place: ground.place,
      tierName: tierById(spoop.idleTier).name,
      ticksLeft: spoop.idleTicksLeft,
      ticks: spoop.idleTicksTotal || spoop.idleTicksLeft,
    },
  };
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
  let text = `Found ${name}. Banked it.`;
  if (equipped) text = `Found ${name}. Equipped it.`;
  else if (!spoop.bank.some((i) => i.id === item.id)) text = `Found ${name}. The bank kept better gear, so this one was tossed.`;
  else {
    const req = wearRequirement(item);
    if (req && !canWear(spoop, item)) text = `Found ${name}. Banked it. Needs ${req.level} ${req.skillName}.`;
  }
  return { text, item };
}

// A won piece. Their combat bracket is the common one. The bracket below shows up
// less often. The bracket above is rare. A shift that would fall off the list
// stays on their bracket, so bronze and raid still get an item.
const DROP_BRACKET = [
  { shift: 0, weight: 70 },
  { shift: -1, weight: 22 },
  { shift: 1, weight: 8 },
];

function lootBracket(spoop, rng) {
  const base = bestTierForCombat(combatLevel(spoop));
  const index = TIERS.findIndex((row) => row.id === base.id);
  const pick = pickWeighted(rng, DROP_BRACKET, (row) => row.weight);
  const next = index + pick.shift;
  if (next < 0 || next >= TIERS.length) return base;
  return TIERS[next];
}

function rollDrop(spoop, rng) {
  const tier = lootBracket(spoop, rng);
  const quality = rollQuality(rng, 0);
  const holes = emptySlots(spoop);
  const spec = holes.length && rng() < 0.6
    ? pieceForSlot(rng, holes[Math.floor(rng() * holes.length)], tier.id, quality.id)
    : randomPiece(rng, tier.id, quality.id);
  return giveItem(spoop, makeItem(spoop, rng, spec));
}

// One roll per hourly tick, on the bracket their combat level has reached.
// That bracket is about 30%. The one below is about 10%. The one above is
// about 3%. Anything left is no item. A shift off the end of the list misses.
const TICK_LOOT = [
  { shift: 0, quality: 'crude', chance: 0.10 },
  { shift: 0, quality: 'worn', chance: 0.08 },
  { shift: 0, quality: 'standard', chance: 0.07 },
  { shift: 0, quality: 'fine', chance: 0.03 },
  { shift: 0, quality: 'sharpened', chance: 0.012 },
  { shift: 0, quality: 'tempered', chance: 0.004 },
  { shift: 0, quality: 'masterwork', chance: 0.0015 },
  { shift: -1, quality: 'crude', chance: 0.035 },
  { shift: -1, quality: 'worn', chance: 0.028 },
  { shift: -1, quality: 'standard', chance: 0.025 },
  { shift: -1, quality: 'fine', chance: 0.010 },
  { shift: -1, quality: 'sharpened', chance: 0.004 },
  { shift: -1, quality: 'tempered', chance: 0.0014 },
  { shift: -1, quality: 'masterwork', chance: 0.0005 },
  { shift: 1, quality: 'crude', chance: 0.012 },
  { shift: 1, quality: 'worn', chance: 0.008 },
  { shift: 1, quality: 'standard', chance: 0.006 },
  { shift: 1, quality: 'fine', chance: 0.002 },
];

// Share of a won drop. Common pieces are most of it. Platebodies and the better weapons are the rare end.
const TICK_LOOT_PIECES = [
  { weight: 62, items: [
    { slot: 'cape', baseId: 'cape', baseName: 'cape', style: null },
    { slot: 'boots', baseId: 'boots', baseName: 'boots', style: null },
    { slot: 'gloves', baseId: 'gloves', baseName: 'gloves', style: null },
    { slot: 'head', baseId: 'med-helm', baseName: 'med helm', style: null },
    { slot: 'weapon', baseId: 'dagger', baseName: 'dagger', style: 'melee' },
  ] },
  { weight: 28, items: [
    { slot: 'weapon', baseId: 'sword', baseName: 'sword', style: 'melee' },
    { slot: 'weapon', baseId: 'mace', baseName: 'mace', style: 'melee' },
    { slot: 'weapon', baseId: 'shortbow', baseName: 'shortbow', style: 'ranged' },
    { slot: 'weapon', baseId: 'staff', baseName: 'staff', style: 'magic' },
    { slot: 'legs', baseId: 'platelegs', baseName: 'platelegs', style: null },
    { slot: 'shield', baseId: 'kiteshield', baseName: 'kiteshield', style: null },
  ] },
  { weight: 10, items: [
    { slot: 'weapon', baseId: 'scimitar', baseName: 'scimitar', style: 'melee' },
    { slot: 'weapon', baseId: 'longsword', baseName: 'longsword', style: 'melee' },
    { slot: 'body', baseId: 'platebody', baseName: 'platebody', style: null },
  ] },
];

function tickLootPiece(rng) {
  const pool = [];
  for (const band of TICK_LOOT_PIECES) {
    const each = band.weight / band.items.length;
    for (const item of band.items) pool.push({ item, weight: each });
  }
  return pickWeighted(rng, pool, (row) => row.weight).item;
}

// One roll per hourly tick, separate from gear. 1/100,000.
// Ten spoops over a full year is still under one pet, most years.
const PET_CHANCE = 0.00001;

function rollPet(spoop, activity, rng) {
  if (rng() >= PET_CHANCE) return null;
  if (!Array.isArray(spoop.pets)) spoop.pets = [];
  const owned = new Set(spoop.pets.map((pet) => pet.id));
  const style = activity && activity.style === 'skilling' ? 'skilling' : 'combat';
  let pool = PETS.filter((pet) => pet.style === style && !owned.has(pet.id));
  if (!pool.length) pool = PETS.filter((pet) => !owned.has(pet.id));
  if (!pool.length) return null;
  const pet = pool[Math.floor(rng() * pool.length)];
  spoop.pets.push({ id: pet.id, name: pet.name, osrsId: pet.osrsId });
  spoop.pet = pet.id;
  return pet;
}

function presentFollower(spoop) {
  const pets = Array.isArray(spoop.pets) ? spoop.pets : [];
  const follower = pets.find((pet) => pet.id === spoop.pet) || pets[0] || null;
  if (!follower) return null;
  return { id: follower.id, name: follower.name, osrsId: follower.osrsId, owned: pets.length };
}

function rollTickLoot(spoop, rng) {
  const tier = bestTierForCombat(combatLevel(spoop));
  const ti = TIERS.findIndex((row) => row.id === tier.id);
  let roll = rng();
  for (const row of TICK_LOOT) {
    const chance = row.chance;
    if (roll < chance) {
      const index = ti + row.shift;
      if (index < 0 || index >= TIERS.length) return null;
      const piece = tickLootPiece(rng);
      const item = makeItem(spoop, rng, {
        slot: piece.slot,
        tier: TIERS[index].id,
        quality: row.quality,
        baseId: piece.baseId,
        baseName: piece.baseName,
        style: piece.style,
      });
      return giveItem(spoop, item);
    }
    roll -= chance;
  }
  return null;
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
// A random event replaces the hourly tick. Death pays nothing. The rest pay more than the hour would have.
const RANDOM_EVENT_CHANCE = 0.05;

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
    const found = giveItem(spoop, item);
    lines.push({
      log: `${clockLabel(when)} — Rare drop from ${boss.name}. ${found.text}`,
      item: found.item,
      note: `Rare drop from ${boss.name}.`,
    });
  }
  if (rng() < DEATH_CHANCE) {
    lines.push(`${clockLabel(when)} — ${dieToBoss(spoop, boss.name, rng)}`);
  }
  return lines;
}

function skillGainLine(gains) {
  const icons = {
    attack: '⚔️',
    strength: '💪',
    defence: '🛡️',
    hitpoints: '❤️',
    ranged: '🏹',
    magic: '🔮',
    prayer: '🙏',
  };
  return (gains || [])
    .filter((row) => row && row.amount > 0)
    .map((row) => '+' + (icons[row.id] || '') + row.amount)
    .join(' | ');
}

const SLOT_ICON = {
  weapon: '🗡️',
  shield: '🛡️',
  head: '🪖',
  body: '👕',
  legs: '👖',
  boots: '👢',
  gloves: '🧤',
  cape: '🧣',
  neck: '📿',
  ring: '💍',
  ammo: '🏹',
};

function discordFoundLine(found) {
  const item = found && found.item;
  if (!item) return '';
  const icon = SLOT_ICON[item.slot] || '✨';
  let line = icon + ' Found ' + itemDisplayName(item);
  const text = found.text || '';
  if (text.includes('tossed')) line += '. Tossed it.';
  else if (text.includes('Needs ')) line += '. Needs ' + text.split('Needs ')[1];
  return line;
}

function discordAction(when, action, found, notes, gains) {
  const lines = [clockLabel(when) + (action ? ' — ' + action : '')];
  for (const row of found || []) {
    const line = discordFoundLine(row);
    if (line) lines.push(line);
  }
  for (const note of notes || []) {
    if (note) lines.push(String(note).replace(/^.+?\s—\s/, ''));
  }
  const xp = skillGainLine(gains);
  if (xp) lines.push(xp);
  return lines.join('\n');
}

function skillForEvent(spoop, rng) {
  const quest = questByActivity(spoop.activityId);
  if (quest) {
    const skills = questSkills(quest);
    if (skills.length) return skills[Math.floor(rng() * skills.length)];
  }
  const act = activityById(spoop.activityId);
  if (act && act.id === spoop.activityId && !(act.xpRate > 0 && act.xpRate < 1)) return act.skill;
  return SKILL_IDS[Math.floor(rng() * SKILL_IDS.length)];
}

function eventXp(spoop, skill, rng) {
  let xp = (18 + Math.floor(rng() * 28)) * XP_TIMESCALE * TRAIN_SHARE;
  xp *= xpRamp(levelForXp(spoop.skills[skill] || 0));
  return Math.max(1, Math.floor(xp));
}

function eventGold(tierId, rng, share) {
  const band = EVENT_GOLD[tierId] || EVENT_GOLD.bronze;
  const amount = band[0] + Math.floor(rng() * (band[1] - band[0] + 1));
  return Math.max(1, Math.round(amount * share));
}

function eventGear(spoop, rng, tierId) {
  const quality = rollQuality(rng, 2);
  const holes = emptySlots(spoop);
  const spec = holes.length && rng() < 0.6
    ? pieceForSlot(rng, holes[Math.floor(rng() * holes.length)], tierId, quality.id)
    : randomPiece(rng, tierId, quality.id);
  return giveItem(spoop, makeItem(spoop, rng, spec));
}

function doRandomEvent(spoop, ev, rng) {
  const tier = bestTierForCombat(combatLevel(spoop));
  const pool = RANDOM_EVENTS[tier.id] || RANDOM_EVENTS.bronze;
  const event = pool[Math.floor(rng() * pool.length)];
  const stamp = clockLabel(ev.when);
  if (event.reward === 'death') {
    const text = `${stamp} — ${event.line} No experience this hour.`;
    pushLog(spoop, ev.when, text);
    return text;
  }
  const bits = [event.line];
  const discordBits = [event.line];
  if (event.reward === 'xp' || event.reward === 'both') {
    const skill = event.skill || skillForEvent(spoop, rng);
    const mult = event.reward === 'xp' ? 3.6 : 2.4;
    const notes = grantXp(spoop, skill, Math.max(1, Math.floor(eventXp(spoop, skill, rng) * mult)));
    const sentence = notes.join('. ') + '.';
    bits.push(sentence);
    discordBits.push(sentence);
  }
  if (event.reward === 'gear') {
    const found = eventGear(spoop, rng, lootBracket(spoop, rng).id);
    bits.push(found.text);
    discordBits.push(discordFoundLine(found));
  }
  if (event.reward === 'gold' || event.reward === 'both' || event.reward === 'gear') {
    const share = event.reward === 'gold' ? 1 : event.reward === 'both' ? 0.7 : 0.4;
    const gold = eventGold(tier.id, rng, share);
    spoop.gold += gold;
    const sentence = '+' + gold.toLocaleString('en-US') + ' gold.';
    bits.push(sentence);
    discordBits.push(sentence);
  }
  const text = `${stamp} — ${bits.join(' ')}`;
  pushLog(spoop, ev.when, text);
  if (discordBits.length === 1) return text;
  return [stamp + ' — ' + discordBits[0], ...discordBits.slice(1)].join('\n');
}

function applyQuestXp(spoop, rewards) {
  ensureBracket(spoop);
  const cap = xpForLevel(MAX_LEVEL);
  const notes = [];
  const gains = [];
  for (const id of SKILL_IDS) {
    const amount = Math.round(rewards[id] || 0);
    if (amount <= 0) continue;
    const beforeXp = spoop.skills[id] || 0;
    spoop.skills[id] = Math.min(cap, beforeXp + amount);
    const gained = spoop.skills[id] - beforeXp;
    if (gained <= 0) continue;
    const before = levelForXp(beforeXp);
    const after = levelForXp(spoop.skills[id]);
    const name = SKILLS.find((s) => s.id === id).name;
    notes.push(`+${gained.toLocaleString('en-US')} ${name} XP`);
    if (after > before) notes.push(`${name} is now level ${after}`);
    gains.push({ id, amount: gained });
  }
  openIdleIfNeeded(spoop);
  return { notes, gains };
}

function finishQuest(spoop, quest, ev, sameHour) {
  if (!Array.isArray(spoop.quests)) spoop.quests = [];
  if (!spoop.quests.includes(quest.id)) spoop.quests.push(quest.id);
  spoop.questHoursLeft = 0;
  const rewards = resolveQuestXp(spoop.skills, quest);
  const { notes, gains } = applyQuestXp(spoop, rewards);
  spoop.activitySkills = gains.map((row) => row.id);
  const body = notes.length ? notes.join('. ') + '.' : 'Nothing they train went up.';
  const lead = sameHour
    ? `Started ${quest.name} and finished it.`
    : `Finished ${quest.name}.`;
  const text = `${clockLabel(ev.when)} — ${lead} ${body}`;
  pushLog(spoop, ev.when, text);
  const levels = notes.filter((line) => line.includes('now level'));
  return discordAction(ev.when, lead, [], levels, gains);
}

function beginQuest(spoop, quest, ev) {
  const hours = quest.hours > 1 ? quest.hours : 1;
  spoop.activityId = 'quest:' + quest.id;
  spoop.activitySince = ev.when.toISOString();
  spoop.activitySkills = null;
  spoop.questHours = hours;
  spoop.questHoursLeft = hours - 1;
  if (hours <= 1) return finishQuest(spoop, quest, ev, true);
  const text = `${clockLabel(ev.when)} — Started ${quest.name}.`;
  pushLog(spoop, ev.when, text);
  return text;
}

function continueQuest(spoop, quest, ev) {
  spoop.questHoursLeft -= 1;
  if (spoop.questHoursLeft > 0) {
    const text = `${clockLabel(ev.when)} — Still on ${quest.name}.`;
    pushLog(spoop, ev.when, text);
    return text;
  }
  return finishQuest(spoop, quest, ev, false);
}

// A fifth of free hours. A bank sitting on spare gear goes more often, before the slots just delete it.
const ERRAND_CHANCE = 0.2;
const ERRAND_CHANCE_FULL = 0.4;

function article(name) {
  return /^[aeiou]/i.test(String(name || '').trim()) ? 'an' : 'a';
}

function nameList(parts) {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return parts[0] + ' and ' + parts[1];
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

function errandXp(spoop, rng, kind) {
  const skill = skillForEvent(spoop, rng);
  const base = kind === 'crate' ? 5 + Math.floor(rng() * 9) : 3 + Math.floor(rng() * 6);
  const amount = Math.max(1, Math.floor(base * XP_TIMESCALE * TRAIN_SHARE * xpRamp(levelForXp(spoop.skills[skill] || 0))));
  return grantXp(spoop, skill, amount);
}

function beginErrand(spoop, errand, ev, notes) {
  spoop.activityId = errand.id;
  spoop.activitySince = ev.when.toISOString();
  spoop.activitySkills = notes.gains.map((row) => row.id);
  spoop.questHoursLeft = 0;
}

// Spare gear: uniques stay, and so does the best piece they cannot wear yet.
// Anything no better than what they have on can go to the GE.
function extraBankItems(spoop) {
  const bank = Array.isArray(spoop.bank) ? spoop.bank : [];
  const keep = new Set();
  const bestUpgrade = {};
  for (const item of bank) {
    if (item.unique) {
      keep.add(item.id);
      continue;
    }
    const worn = spoop.equipped && spoop.equipped[item.slot];
    if (worn && itemScore(item) <= itemScore(worn)) continue;
    const prev = bestUpgrade[item.slot];
    if (!prev || itemScore(item) > itemScore(prev)) bestUpgrade[item.slot] = item;
  }
  for (const item of Object.values(bestUpgrade)) keep.add(item.id);
  return bank.filter((item) => !keep.has(item.id));
}

function canAffordTierCrate(spoop) {
  const tierId = bestTierForCombat(combatLevel(spoop)).id;
  return CRATES.some((crate) => crate.tier === tierId && crate.shift === 0 && spoop.gold >= crate.cost);
}

function chooseCrate(spoop, rng) {
  const tierId = bestTierForCombat(combatLevel(spoop)).id;
  const options = CRATES.filter((crate) => crate.tier === tierId && spoop.gold >= crate.cost);
  const plain = options.find((crate) => crate.shift === 0);
  const fine = options.find((crate) => crate.shift > 0);
  if (fine && plain && rng() < 0.3) return fine;
  return plain || fine || null;
}

function chooseErrand(spoop, rng) {
  const canCrate = canAffordTierCrate(spoop);
  const extras = extraBankItems(spoop).length;
  if (!canCrate && extras <= 0) return null;
  const chance = extras >= 6 ? ERRAND_CHANCE_FULL : ERRAND_CHANCE;
  if (rng() >= chance) return null;
  if (canCrate && extras > 0) {
    if (extras >= 6) return rng() < 0.3 ? 'crate' : 'ge';
    return rng() < 0.55 ? 'crate' : 'ge';
  }
  return canCrate ? 'crate' : 'ge';
}

// About 8% of that tier's plain crate. Crude and worn sell for less, so junk funds a crate slowly.
const GE_QUALITY = {
  crude: 0.55,
  worn: 0.8,
  standard: 1,
  fine: 1.4,
  sharpened: 1.85,
  tempered: 2.4,
  masterwork: 3.2,
};

function geSalePrice(item, rng) {
  const crate = CRATES.find((row) => row.tier === item.tier && row.shift === 0);
  const cost = crate ? crate.cost : 100;
  const quality = GE_QUALITY[item.quality] || 1;
  const wobble = 0.85 + rng() * 0.3;
  return Math.max(1, Math.round(cost * 0.08 * quality * wobble));
}

function crateOutcome(found) {
  const text = found && found.text ? found.text : '';
  if (text.includes('Equipped')) return ' Equipped it.';
  if (text.includes('tossed')) return ' The bank kept better gear, so it was tossed.';
  if (text.includes('Needs ')) return ' Banked it. Needs ' + text.split('Needs ')[1];
  return '';
}

function doCrateErrand(spoop, ev, rng) {
  const crate = chooseCrate(spoop, rng);
  if (!crate) return null;
  const notes = errandXp(spoop, rng, 'crate');
  beginErrand(spoop, errandById('errand:crate'), ev, notes);
  spoop.gold -= crate.cost;
  const winner = rollCratePiece(spoop, rng, crate.tier, crate.shift, true);
  const found = giveItem(spoop, winner);
  const itemName = itemDisplayName(winner);
  const sentence = `${spoop.name} spent ${crate.cost.toLocaleString('en-US')} gold and opened ${article(crate.name)} ${crate.name} and got ${article(itemName)} ${itemName}.`;
  const text = `${clockLabel(ev.when)} — ${sentence}${crateOutcome(found)} ${notes.join('. ')}.`;
  pushLog(spoop, ev.when, text);
  return discordAction(ev.when, sentence + crateOutcome(found), [], [], notes.gains);
}

function doGeErrand(spoop, ev, rng) {
  const extras = extraBankItems(spoop);
  if (!extras.length) return null;
  const notes = errandXp(spoop, rng, 'ge');
  beginErrand(spoop, errandById('errand:ge'), ev, notes);
  extras.sort((a, b) => itemScore(a) - itemScore(b) || (a.storedAt || 0) - (b.storedAt || 0));
  const sold = extras.slice(0, 5);
  const soldIds = new Set(sold.map((item) => item.id));
  spoop.bank = spoop.bank.filter((item) => !soldIds.has(item.id));
  let gold = 0;
  const named = [];
  for (const item of sold) {
    gold += geSalePrice(item, rng);
    const name = itemDisplayName(item);
    named.push(article(name) + ' ' + name);
  }
  spoop.gold += gold;
  const sentence = `${spoop.name} went to the GE and sold ${nameList(named)} for ${gold.toLocaleString('en-US')} gold.`;
  const text = `${clockLabel(ev.when)} — ${sentence} ${notes.join('. ')}.`;
  pushLog(spoop, ev.when, text);
  return discordAction(ev.when, sentence, [], [], notes.gains);
}

function leaveQuest(spoop, ev) {
  const rng = mulberry32(hashString(`${spoop.name}|after-quest|${ev.when.toISOString()}`));
  const next = chooseActivity(spoop, rng);
  spoop.activityId = next.id;
  spoop.activitySince = ev.when.toISOString();
  spoop.activitySkills = null;
  spoop.questHoursLeft = 0;
}

function doTrainingTick(state, spoop, ev) {
  if (spoop.questHoursLeft > 0) {
    const underway = questByActivity(spoop.activityId);
    if (underway) return continueQuest(spoop, underway, ev);
    spoop.questHoursLeft = 0;
  }
  const questRng = mulberry32(hashString(`${spoop.name}|quest|${ev.when.toISOString()}`));
  const offer = bestQuest(spoop.skills, combatLevel(spoop), spoop.quests);
  if (offer && questRng() < offer.chance) return beginQuest(spoop, offer.quest, ev);
  const eventRng = mulberry32(hashString(`${spoop.name}|random|${ev.when.toISOString()}`));
  if (eventRng() < RANDOM_EVENT_CHANCE) {
    if (questByActivity(spoop.activityId)) leaveQuest(spoop, ev);
    return doRandomEvent(spoop, ev, eventRng);
  }
  if (!(spoop.lessonTicksLeft > 0)) {
    const errandRng = mulberry32(hashString(`${spoop.name}|errand|${ev.when.toISOString()}`));
    const kind = chooseErrand(spoop, errandRng);
    if (kind === 'crate') {
      const text = doCrateErrand(spoop, ev, errandRng);
      if (text) return text;
    } else if (kind === 'ge') {
      const text = doGeErrand(spoop, ev, errandRng);
      if (text) return text;
    }
  }
  const rng = mulberry32(hashString(`${spoop.name}|tick|${ev.when.toISOString()}`));
  const next = chooseActivity(spoop, rng);
  const swapped = next.id !== spoop.activityId;
  spoop.activityId = next.id;
  spoop.activitySkills = null;
  spoop.questHoursLeft = 0;
  if (swapped) spoop.activitySince = ev.when.toISOString();
  if (spoop.lessonTicksLeft > 0) spoop.lessonTicksLeft -= 1;
  const skillLevel = levelForXp(spoop.skills[next.skill] || 0);
  let xp = (18 + Math.floor(rng() * 28)) * XP_TIMESCALE * TRAIN_SHARE;
  xp *= xpRamp(skillLevel);
  const pace = next.xpRate > 0 && next.xpRate < 1 ? next.xpRate : 1;
  xp = Math.max(1, Math.floor(xp * pace));
  const notes = grantXp(spoop, next.skill, xp);
  let gold = Math.round((next.gold + Math.floor(rng() * Math.max(1, next.gold))) * TRAIN_SHARE);
  let skillingExtra = 0;
  if (next.style === 'skilling' && !next.money) {
    skillingExtra = Math.max(1, Math.round(gold * 0.2));
    gold += skillingExtra;
  }
  spoop.gold += gold;
  const verb = swapped ? `Wandered off to ${next.name}` : `Kept at ${next.name}`;
  const extraNote = skillingExtra ? ` Skilling paid ${skillingExtra} extra.` : '';
  const text = `${clockLabel(ev.when)} — ${verb}. ${notes.join('. ')}. +${gold} gold.${extraNote}`;
  pushLog(spoop, ev.when, text);
  const loot = rollTickLoot(spoop, rng);
  if (loot) pushLog(spoop, ev.when, `${clockLabel(ev.when)} — ${loot.text}`);
  const extras = bossEncounter(spoop, next, ev.when, rng);
  const found = loot ? [loot] : [];
  const side = [];
  for (const extra of extras) {
    if (typeof extra === 'string') {
      pushLog(spoop, ev.when, extra);
      side.push(extra);
    } else {
      pushLog(spoop, ev.when, extra.log);
      if (extra.item) found.push(extra);
      if (extra.note) side.push(extra.note);
    }
  }
  if (skillingExtra) side.push('Skilling paid ' + skillingExtra.toLocaleString('en-US') + ' extra gold.');
  const petRng = mulberry32(hashString(`${spoop.name}|pet|${ev.when.toISOString()}`));
  const pet = rollPet(spoop, next, petRng);
  if (pet) {
    pushLog(spoop, ev.when, `${clockLabel(ev.when)} — ${pet.name} followed them home.`);
    side.push(pet.name + ' followed them home.');
  }
  return discordAction(ev.when, verb + '.', found, side, notes.gains);
}

function doDrop(state, spoop, ev) {
  const rng = mulberry32(hashString(`${spoop.name}|drop|${ev.when.toISOString()}`));
  const found = rollDrop(spoop, rng);
  const text = `${clockLabel(ev.when)} — ${found.text}`;
  pushLog(spoop, ev.when, text);
  return discordAction(ev.when, null, [found], [], null);
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
  const xpNotes = grantXp(spoop, skill, Math.max(1, Math.floor((won ? 30 : 12) * XP_TIMESCALE * xpRamp(levelForXp(spoop.skills[skill] || 0)))));
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

function arenaGold(net) {
  const value = Number(net) || 0;
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return sign + Math.abs(value).toLocaleString('en-US') + ' gold';
}

function arenaDiscordText(last) {
  if (!last) return '';
  const winner = last.winner || 'Nobody';
  let head = winner + ' won the Spoopfight.';
  if (last.pot != null) head += ' Pot ' + Number(last.pot).toLocaleString('en-US') + ' gold.';
  const lines = [head];
  for (const row of last.results || []) {
    lines.push(row.place + '. ' + row.name + ' — ' + arenaGold(row.gold));
  }
  if (last.label) lines.push(last.label);
  return lines.join('\n');
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

function fightPlaybackMs(duration, speed) {
  const span = Number(duration);
  if (!(span > 0) || !(speed > 0)) return 0;
  return Math.round((span / (speed * FIGHT_PACE)) * 1000);
}

function fightRevealAt(when, duration, speed) {
  const scheduled = new Date(when).getTime();
  const start = Math.max(Number.isFinite(scheduled) ? scheduled : 0, Date.now());
  return new Date(start + fightPlaybackMs(duration, speed)).toISOString();
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
    state.lastArena.text = arenaDiscordText(state.lastArena);
    state.lastArena.revealAt = fightRevealAt(ev.when, 0, ARENA_PLAY_SPEED);
    state.lastArena.needsPost = true;
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
    notes.push({ name: row.name, kind: 'arena', text: row.text });
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
  state.lastArena.text = arenaDiscordText(state.lastArena);
  state.lastArena.revealAt = fightRevealAt(ev.when, bout.duration, ARENA_PLAY_SPEED);
  state.lastArena.needsPost = true;
  return notes;
}

function nextArenaAfter(date, state) {
  const ahead = new Date(date.getTime() + 50 * 3600 * 1000);
  const events = scheduleBetween(date, ahead, state);
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
  const xpNotes = grantXp(spoop, skill, Math.max(1, Math.floor((won ? 30 : 12) * XP_TIMESCALE * xpRamp(levelForXp(spoop.skills[skill] || 0)))));
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
  const detail = giveItem(spoop, winner).text;
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

function spoopKey(state, spoop) {
  if (spoop && spoop.owner && state.spoops[spoop.owner] === spoop) return spoop.owner;
  for (const [key, value] of Object.entries(state.spoops || {})) {
    if (value === spoop) return key;
  }
  return (spoop && (spoop.owner || spoop.name)) || '';
}

function spoopByKey(state, key) {
  if (!key || !state.spoops) return null;
  if (state.spoops[key]) return state.spoops[key];
  return Object.values(state.spoops).find((spoop) => spoop && (spoop.owner === key || spoop.name === key)) || null;
}

function schedulePk(state, a, b, when, reason) {
  const at = when instanceof Date ? when : new Date(when);
  const fightAt = new Date(at.getTime() + PK_DELAY_MS);
  const why = reason || PK_REASONS[0];
  const text = `${a.name} and ${b.name} are mad at each other. ${why} They fight in the arena in 10 minutes.`;
  state.pkDay = etDayKey(at);
  state.pk = {
    aKey: spoopKey(state, a),
    bKey: spoopKey(state, b),
    aName: a.name,
    bName: b.name,
    reason: why,
    calledAt: at.toISOString(),
    fightAt: fightAt.toISOString(),
    text,
    needsPost: true,
  };
  const stamp = clockLabel(at);
  pushLog(a, at, `${stamp} — Challenged ${b.name} to a PK. ${why} The fight is in 10 minutes.`);
  pushLog(b, at, `${stamp} — Challenged ${a.name} to a PK. ${why} The fight is in 10 minutes.`);
  return { kind: 'pk-call', name: 'PK', fightAt: state.pk.fightAt, text };
}

function considerPk(state, now) {
  const at = now instanceof Date ? now : new Date(now);
  if (!state || state.useSim || state.pk) return { rolled: false, call: null };
  const day = etDayKey(at);
  if (state.pkDay === day) return { rolled: false, call: null };
  const roster = Object.values(state.spoops).filter((spoop) => spoop && new Date(spoop.born) <= at);
  if (roster.length < 2) return { rolled: false, call: null };
  state.pkDay = day;
  const rng = mulberry32(hashString('pk-day|' + day));
  if (rng() >= PK_DAY_CHANCE) return { rolled: true, call: null };
  const pool = roster.slice();
  const a = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const b = pool[Math.floor(rng() * pool.length)];
  const reason = PK_REASONS[Math.floor(rng() * PK_REASONS.length)];
  return { rolled: true, call: schedulePk(state, a, b, at, reason) };
}

function rememberFight(spoop, when, opponent, won, summary) {
  if (!Array.isArray(spoop.fights)) spoop.fights = [];
  spoop.fights.unshift({
    at: when.toISOString(),
    opponent,
    won,
    gold: 0,
    pk: true,
    lines: [],
    summary,
  });
  if (spoop.fights.length > 8) spoop.fights.length = 8;
}

function holdTakenItem(spoop, item) {
  for (const slot of SLOTS) {
    if (spoop.equipped[slot] && spoop.equipped[slot].id === item.id) return;
  }
  if (spoop.bank.some((row) => row.id === item.id)) return;
  if (spoop.bank.length >= BANK_SLOTS) {
    const ranked = spoop.bank.slice().sort((a, b) => itemScore(a) - itemScore(b) || (a.storedAt || 0) - (b.storedAt || 0));
    const drop = ranked[0];
    spoop.bank = spoop.bank.filter((row) => row !== drop);
  }
  noteStored(spoop, item);
  spoop.bank.push(item);
}

function giveTakenItem(winner, item) {
  item.id = winner.nextItemId++;
  delete item.storedAt;
  const name = itemDisplayName(item);
  let equipped = false;
  if (canWear(winner, item)) {
    const current = winner.equipped[item.slot];
    if (!current || itemScore(item) > itemScore(current)) {
      if (current) bankItem(winner, current);
      delete item.storedAt;
      winner.equipped[item.slot] = item;
      equipped = true;
    } else {
      bankItem(winner, item);
    }
  } else {
    bankItem(winner, item);
  }
  holdTakenItem(winner, item);
  return {
    name,
    text: equipped ? `Took ${name}. Equipped it.` : `Took ${name}. Banked it.`,
  };
}

function takeEquippedItem(loser, winner, rng) {
  const worn = SLOTS.map((slot) => loser.equipped[slot]).filter(Boolean);
  if (!worn.length) return null;
  const item = worn[Math.floor(rng() * worn.length)];
  loser.equipped[item.slot] = null;
  const replaced = fillSlotFromBank(loser, item.slot);
  const given = giveTakenItem(winner, item);
  return {
    name: given.name,
    text: given.text,
    replaced: replaced ? itemDisplayName(replaced) : null,
  };
}

function pkWinnerSpoop(bout, a, b) {
  const fighter = (bout.fighters || []).find((row) => row.id === bout.winnerId);
  if (fighter && fighter.name === b.name) return b;
  if (fighter && fighter.name === a.name) return a;
  const last = (bout.deaths || []).slice().reverse().find((row) => row.by);
  if (last) {
    const by = (bout.fighters || []).find((row) => row.id === last.by);
    if (by && by.name === b.name) return b;
    if (by && by.name === a.name) return a;
  }
  return a;
}

function resolveDuePk(state, now) {
  const pk = state.pk;
  if (!pk) return [];
  const due = new Date(pk.fightAt);
  const at = now instanceof Date ? now : new Date(now);
  if (due > at) return [];
  const a = spoopByKey(state, pk.aKey);
  const b = spoopByKey(state, pk.bKey);
  const fightAt = pk.fightAt;
  if (!a || !b || a === b) {
    state.pk = null;
    return [];
  }
  const rng = mulberry32(hashString('pk-fight|' + fightAt + '|' + pk.aKey + '|' + pk.bKey));
  const bout = simulateArena([a, b], rng);
  const winner = pkWinnerSpoop(bout, a, b);
  const loser = winner === a ? b : a;
  const taken = takeEquippedItem(loser, winner, rng);
  winner.arenaWins = (winner.arenaWins || 0) + 1;
  loser.arenaLosses = (loser.arenaLosses || 0) + 1;
  let winnerText = `${clockLabel(due)} — Won the PK against ${loser.name}.`;
  let loserText = `${clockLabel(due)} — Lost the PK to ${winner.name}.`;
  if (taken) {
    winnerText += ' ' + taken.text;
    loserText += ` Lost ${taken.name}.`;
    loserText += taken.replaced ? ` Equipped ${taken.replaced} from the bank.` : ' That slot is empty.';
  } else {
    winnerText += ` ${loser.name} had nothing equipped.`;
    loserText += ' Nothing equipped to take.';
  }
  pushLog(winner, due, winnerText);
  pushLog(loser, due, loserText);
  rememberFight(winner, due, loser.name, true, winnerText);
  rememberFight(loser, due, winner.name, false, loserText);
  const discord = taken
    ? `${winner.name} beat ${loser.name} and took ${taken.name}.`
    : `${winner.name} beat ${loser.name}. ${loser.name} had nothing equipped to take.`;
  state.pkDay = etDayKey(new Date(pk.calledAt || due));
  state.lastPk = {
    at: fightAt,
    label: formatEt(due),
    aName: pk.aName,
    bName: pk.bName,
    winner: winner.name,
    loser: loser.name,
    item: taken ? taken.name : null,
    text: discord,
    needsPost: true,
    revealAt: fightRevealAt(fightAt, bout.duration, PK_PLAY_SPEED),
    bout,
  };
  state.pk = null;
  return [{
    kind: 'pk-result',
    name: 'PK',
    fightAt,
    text: discord,
  }];
}

function takeDuePk(state, when) {
  if (!state.pk || new Date(state.pk.fightAt) > when) return [];
  return resolveDuePk(state, new Date(state.pk.fightAt));
}

function pkPublic(state) {
  if (!state || !state.pk) return null;
  const fightAt = new Date(state.pk.fightAt);
  if (!(fightAt > new Date(state.clock))) return null;
  return {
    fightAt: state.pk.fightAt,
    a: state.pk.aName,
    b: state.pk.bName,
    reason: state.pk.reason,
    label: formatEt(fightAt),
  };
}

function testArena(state, names, seedText, formation) {
  const list = Array.isArray(names) ? names.map((name) => String(name || '').trim()).filter(Boolean) : [];
  const wanted = new Set(list.map((name) => name.toLowerCase()));
  const roster = [];
  for (const spoop of Object.values(state.spoops || {})) {
    if (!spoop) continue;
    const name = String(spoop.name || '').toLowerCase();
    const owner = String(spoop.owner || '').toLowerCase();
    if (wanted.size && !wanted.has(name) && !wanted.has(owner)) continue;
    roster.push(spoop);
  }
  if (roster.length < 2) return { error: 'Pick at least two spoops' };
  if (roster.length > 16) roster.length = 16;
  const seed = String(seedText || 'pit').slice(0, 80);
  const allowed = ['ring', 'pairs'];
  const start = allowed.includes(formation) ? formation : 'ring';
  const bout = simulateArena(roster, mulberry32(hashString(seed)), start);
  const winner = (bout.fighters || []).find((f) => f.id === bout.winnerId);
  return {
    seed,
    winner: winner ? winner.name : null,
    duration: bout.duration,
    bout: withLoadouts(state, bout),
  };
}

function loadoutFromSpoop(spoop) {
  const loadout = {};
  for (const slot of SLOTS) {
    const item = spoop && spoop.equipped ? spoop.equipped[slot] : null;
    const osrsId = osrsIdFor(item);
    loadout[slot] = osrsId ? { osrsId, quality: item.quality || null } : null;
  }
  return loadout;
}

function withLoadouts(state, bout) {
  if (!bout || !Array.isArray(bout.fighters)) return bout;
  const byName = new Map();
  for (const spoop of Object.values(state.spoops || {})) {
    if (spoop && spoop.name) byName.set(String(spoop.name).toLowerCase(), spoop);
  }
  return Object.assign({}, bout, {
    fighters: bout.fighters.map((fighter) => {
      const spoop = byName.get(String(fighter.name || '').toLowerCase());
      if (!spoop) return fighter;
      return Object.assign({}, fighter, { loadout: loadoutFromSpoop(spoop) });
    }),
  });
}

function arenaSnapshot(state) {
  const now = new Date(state.clock);
  const next = nextArenaAfter(now, state);
  const lastPk = state.lastPk ? {
    at: state.lastPk.at,
    label: state.lastPk.label,
    a: state.lastPk.aName,
    b: state.lastPk.bName,
    winner: state.lastPk.winner,
    loser: state.lastPk.loser,
    item: state.lastPk.item || null,
    bout: withLoadouts(state, state.lastPk.bout || null),
  } : null;
  const last = state.lastArena
    ? Object.assign({}, state.lastArena, { bout: withLoadouts(state, state.lastArena.bout) })
    : null;
  return {
    now: state.clock,
    clockLabel: formatEt(now),
    useSim: !!state.useSim,
    nextAt: next ? next.when.toISOString() : null,
    nextLabel: next ? formatEt(next.when) : null,
    last,
    pk: pkPublic(state),
    lastPk,
  };
}

function advance(state, targetDate) {
  const target = targetDate instanceof Date ? targetDate : new Date(targetDate);
  const from = new Date(state.clock);
  if (!(target > from)) return [];
  let events = scheduleBetween(from, target, state);
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
    for (const row of takeDuePk(state, ev.when)) happened.push(row);
    if (ev.kind === 'arena') {
      const arenaDay = etDayKey(ev.when);
      const lastDay = state.lastArena && state.lastArena.at ? etDayKey(new Date(state.lastArena.at)) : '';
      if (lastDay === arenaDay) {
        if (state.arenaPostpone && arenaDay === state.arenaPostpone.day) state.arenaPostpone = null;
        continue;
      }
      for (const row of runNightlyArena(state, ev)) pushUpdate(row.name, row.text);
      if (state.arenaPostpone && ev.hour === ARENA_HOUR && arenaDay === state.arenaPostpone.day) {
        state.arenaPostpone = null;
      }
      continue;
    }
    for (const spoop of Object.values(state.spoops)) {
      if (minutes.get(spoop) !== ev.minute) continue;
      if (new Date(spoop.born) > ev.when) continue;
      const lines = [];
      const tickText = doTrainingTick(state, spoop, ev);
      if (tickText) lines.push(tickText);
      for (const text of applyWearRules(spoop, ev.when)) if (text) lines.push(text);
      if (ev.drop) {
        const dropText = doDrop(state, spoop, ev);
        if (dropText) lines.push(dropText);
      }
      const move = nextMoveLine(state, spoop, ev.when);
      if (move && lines.length) lines[lines.length - 1] += '\n' + move;
      for (const text of lines) pushUpdate(spoop.name, text);
    }
  }
  const clockTo = capped ? events[events.length - 1].when : target;
  for (const row of takeDuePk(state, clockTo)) happened.push(row);
  state.clock = clockTo.toISOString();
  if (!capped) {
    const considered = considerPk(state, clockTo);
    if (considered.call) happened.push(considered.call);
  }
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

function gearGate(spoop) {
  const combat = combatLevel(spoop);
  let prev = TIERS[0];
  let next = null;
  for (const tier of TIERS) {
    if (combat >= tier.minCombat) prev = tier;
    else { next = tier; break; }
  }
  if (!next) return { nextName: null, nextCombat: null, progress: 1, idle: false };
  const span = next.minCombat - prev.minCombat;
  const progress = span <= 0 ? 1 : (combat - prev.minCombat) / span;
  return {
    nextName: next.name,
    nextCombat: next.minCombat,
    progress: Math.max(0, Math.min(1, progress)),
    idle: false,
  };
}

function presentActivity(spoop) {
  const quest = questByActivity(spoop.activityId);
  if (quest) {
    const skills = spoop.activitySkills && spoop.activitySkills.length
      ? spoop.activitySkills
      : questSkills(quest);
    return {
      id: spoop.activityId,
      name: quest.name,
      detail: quest.detail,
      skill: skills[0] || 'attack',
      skills,
      style: 'quest',
      quest: true,
      hours: spoop.questHours || quest.hours || 1,
      hoursLeft: spoop.questHoursLeft || 0,
      money: false,
      x: quest.x,
      y: quest.y,
      since: spoop.activitySince,
    };
  }
  const act = activityById(spoop.activityId);
  const skills = act.errand && Array.isArray(spoop.activitySkills) && spoop.activitySkills.length
    ? spoop.activitySkills
    : [act.skill];
  return {
    id: act.id,
    name: act.name,
    detail: act.detail,
    skill: skills[0],
    skills,
    style: act.style,
    quest: false,
    errand: act.errand || null,
    idle: !!act.idle,
    money: !!act.money,
    x: act.x,
    y: act.y,
    since: spoop.activitySince,
  };
}

function presentSpoop(spoop) {
  const levels = levelsOf(spoop.skills);
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
    gearGate: gearGate(spoop),
    quests: questRecord(spoop.quests),
    activity: presentActivity(spoop),
    equipped: Object.fromEntries(SLOTS.map((slot) => [slot, publicItem(spoop.equipped[slot])])),
    bank,
    log: spoop.log.slice(0, 40),
    fights: spoop.fights.slice(0, 5),
    arenaWins: spoop.arenaWins,
    arenaLosses: spoop.arenaLosses,
    standingOrder: spoop.standingOrder,
    lessonSkill: spoop.lessonSkill,
    lessonTicksLeft: spoop.lessonTicksLeft,
    goldGoal: goldGoal(spoop.gold),
    combatStats: equipmentStats(spoop),
    follower: presentFollower(spoop),
  };
}

const ARENA_W = 100;
const ARENA_H = 72;
const ARENA_MARGIN = 6;
const ARENA_SIGHT = 50;
const ARENA_SPEED = 5.4;
const ARENA_BODY = 4.6;
const ARENA_STEP = 0.1;
const ARENA_MAX_T = 420;

function arenaPortrait(spoop, id) {
  const levels = levelsOf(spoop.skills);
  const gear = gearBonuses(spoop);
  const profile = styleNumbers({ skills: spoop.skills, gear });
  const equipped = {};
  const gearNames = [];
  for (const slot of SLOTS) {
    const item = spoop.equipped[slot];
    if (!item) continue;
    equipped[slot] = {
      tier: item.tier,
      quality: item.quality,
      style: item.style || null,
      osrsId: osrsIdFor(item),
    };
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

// One overhead at a time. The best rank they can use, in a style that matches the weapon.
const ARENA_PRAYERS = [
  { id: 'clarity-of-thought', name: 'Clarity of Thought', stat: 'attack', level: 7, pct: 0.05, drain: 3 },
  { id: 'improved-reflexes', name: 'Improved Reflexes', stat: 'attack', level: 16, pct: 0.1, drain: 6 },
  { id: 'incredible-reflexes', name: 'Incredible Reflexes', stat: 'attack', level: 34, pct: 0.15, drain: 12 },
  { id: 'burst-of-strength', name: 'Burst of Strength', stat: 'strength', level: 4, pct: 0.05, drain: 3 },
  { id: 'superhuman-strength', name: 'Superhuman Strength', stat: 'strength', level: 13, pct: 0.1, drain: 6 },
  { id: 'ultimate-strength', name: 'Ultimate Strength', stat: 'strength', level: 31, pct: 0.15, drain: 12 },
  { id: 'sharp-eye', name: 'Sharp Eye', stat: 'ranged', level: 8, pct: 0.05, drain: 3 },
  { id: 'hawk-eye', name: 'Hawk Eye', stat: 'ranged', level: 26, pct: 0.1, drain: 6 },
  { id: 'eagle-eye', name: 'Eagle Eye', stat: 'ranged', level: 44, pct: 0.15, drain: 12 },
  { id: 'mystic-will', name: 'Mystic Will', stat: 'magic', level: 9, pct: 0.05, drain: 3 },
  { id: 'mystic-lore', name: 'Mystic Lore', stat: 'magic', level: 27, pct: 0.1, drain: 6 },
  { id: 'mystic-might', name: 'Mystic Might', stat: 'magic', level: 45, pct: 0.15, drain: 12 },
  { id: 'thick-skin', name: 'Thick Skin', stat: 'defence', level: 1, pct: 0.05, drain: 3 },
  { id: 'rock-skin', name: 'Rock Skin', stat: 'defence', level: 10, pct: 0.1, drain: 6 },
  { id: 'steel-skin', name: 'Steel Skin', stat: 'defence', level: 28, pct: 0.15, drain: 12 },
];

function bestArenaPrayer(stat, level) {
  let pick = null;
  for (const row of ARENA_PRAYERS) {
    if (row.stat === stat && level >= row.level) pick = row;
  }
  return pick;
}

function chooseArenaPrayer(style, level, rng) {
  const options = [];
  const add = (row, weight) => { if (row) options.push({ row, weight }); };
  if (style === 'ranged') add(bestArenaPrayer('ranged', level), 3);
  else if (style === 'magic') add(bestArenaPrayer('magic', level), 3);
  else {
    add(bestArenaPrayer('strength', level), 2);
    add(bestArenaPrayer('attack', level), 2);
  }
  add(bestArenaPrayer('defence', level), 1);
  const total = options.reduce((sum, opt) => sum + opt.weight, 0);
  if (!total) return null;
  let roll = rng() * total;
  for (const opt of options) {
    roll -= opt.weight;
    if (roll < 0) return opt.row;
  }
  return options[options.length - 1].row;
}

function prayerClock(prayer, points) {
  if (!prayer || points <= 0) return null;
  const off = Math.max(8, points / (prayer.drain / 8));
  return {
    id: prayer.id,
    name: prayer.name,
    stat: prayer.stat,
    pct: prayer.pct,
    max: points,
    rate: points / off,
    off,
  };
}

function arenaStats(f, t) {
  const on = f.prayer && t < f.prayer.off;
  const stat = on ? f.prayer.stat : '';
  const mul = stat ? 1 + f.prayer.pct : 1;
  const boost = (name, value) => (stat === name ? value * mul : value);
  const lv = f.levels;
  const g = f.gear;
  const def = boost('defence', lv.defence) + g.def + Math.floor(lv.prayer / 4);
  if (f.style === 'ranged') {
    const ranged = boost('ranged', lv.ranged);
    return { acc: ranged + g.rangeAcc, max: Math.max(1, Math.floor(ranged / 8 + g.rangeStr / 3)), def };
  }
  if (f.style === 'magic') {
    const magic = boost('magic', lv.magic);
    return { acc: magic + g.mageAcc, max: Math.max(1, Math.floor(magic / 8 + g.mageStr / 3)), def };
  }
  const attack = boost('attack', lv.attack);
  const strength = boost('strength', lv.strength);
  return {
    acc: attack + g.meleeAcc,
    max: Math.max(1, Math.floor(strength / 8 + 1 + g.meleeStr / 3)),
    def,
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

function arenaPoint(x, y) {
  return {
    x: Math.max(8, Math.min(ARENA_W - 8, x)),
    y: Math.max(18, Math.min(ARENA_H - 8, y)),
  };
}

function arenaSpread(i, n, from, to) {
  if (n <= 1) return (from + to) / 2;
  return from + (i / (n - 1)) * (to - from);
}

function arenaSlots(n, formation) {
  const pts = [];
  if (formation === 'pairs') {
    const pairCount = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const pair = Math.floor(i / 2);
      pts.push(arenaPoint(arenaSpread(pair, pairCount, 18, 82), i % 2 === 0 ? 34 : 50));
    }
    return pts;
  }
  const cx = ARENA_W / 2;
  const cy = 42;
  const outer = Math.min(n, 10);
  for (let i = 0; i < n; i++) {
    const inner = i >= outer;
    const index = inner ? i - outer : i;
    const count = inner ? n - outer : outer;
    const a = (index / count) * Math.PI * 2 - Math.PI / 2;
    const rx = inner ? 16 : 36;
    const ry = inner ? 8 : 16;
    pts.push({
      x: Math.max(8, Math.min(ARENA_W - 8, cx + Math.cos(a) * rx)),
      y: Math.max(20, Math.min(ARENA_H - 6, cy + Math.sin(a) * ry)),
    });
  }
  return pts;
}

function arenaSpawns(n, rng, formation) {
  const kind = formation === 'pairs' ? 'pairs' : formation === 'ring' ? 'ring' : (rng() < 0.5 ? 'ring' : 'pairs');
  const pts = arenaSlots(n, kind);
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = pts[i];
    pts[i] = pts[j];
    pts[j] = swap;
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

function simulateArena(spoops, rng, formation) {
  const profiles = spoops.map((spoop, i) => {
    const portrait = arenaPortrait(spoop, 'f' + i);
    const gear = gearBonuses(spoop);
    const levels = levelsOf(spoop.skills);
    const prayer = prayerClock(chooseArenaPrayer(gear.style, levels.prayer, rng), levels.prayer);
    portrait.prayer = prayer
      ? { id: prayer.id, name: prayer.name, max: prayer.max, rate: prayer.rate, off: prayer.off }
      : null;
    return { portrait, gear, levels, style: gear.style, prayer };
  });
  const spawns = arenaSpawns(spoops.length, rng, formation);
  const bodies = profiles.map((p, i) => ({
    id: p.portrait.id,
    name: p.portrait.name,
    style: p.style,
    levels: p.levels,
    gear: p.gear,
    prayer: p.prayer,
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
      const atk = arenaStats(f, t);
      const def = arenaStats(target, t);
      const miss = rng() > chance(atk.acc, def.def);
      const amount = miss ? 0 : 1 + Math.floor(rng() * atk.max);
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

function presentWorld(state, debug, happened) {
  const clock = new Date(state.clock);
  const upcoming = nextEventAfter(clock, state);
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
    pk: pkPublic(state),
    crates: CRATES,
    bankSlots: BANK_SLOTS,
    spoops: Object.values(state.spoops).map((spoop) => {
      const view = presentSpoop(spoop);
      const next = nextSpoopAction(state, spoop, clock);
      view.nextAction = next
        ? { at: next.at.toISOString(), time: clockLabel(next.at), kind: next.kind, line: nextMoveLine(state, spoop, clock) }
        : null;
      return view;
    }),
    nightArena: nightArenaPublic(state),
  };
}

function nightArenaPublic(state) {
  const now = new Date(state.clock);
  const next = nextArenaAfter(now, state);
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
  ensureRoster,
  ensureStarterGear,
  createSpoop,
  advance,
  openCrate,
  applyWearRules,
  presentWorld,
  nextEventAfter,
  combatLevel,
  levelForXp,
  equipmentStats,
  etDayKey,
  formatEt,
  nextArenaAfter,
  scheduleBetween,
  hashString,
  mulberry32,
  bossEncounter,
  considerPk,
  resolveDuePk,
  schedulePk,
  arenaSnapshot,
  testArena,
};
