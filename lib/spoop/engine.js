/**
 * Spoop life: training ticks, random events, drops, arena, gold.
 * Time is America/New_York. The world clock only moves forward.
 */

const { xpForLevel, levelForXp, MAX_LEVEL } = require('../xpTable');
const { BOSS_DROPS, SPOOP_BOSSES } = require('./bosses');
const { raidBoss, raidTier, scaleRaidBoss, buildRaidRoll, rollRaidMap, mapTitleIds, swarmSpec, rollChest, raidTitle, RAID_JACKPOTS, JACKPOT_GOLD, CAMP_HEALS } = require('./raid');
const social = require('./social');
const {
  SKILLS,
  SKILL_IDS,
  ACTIVITIES,
  TIERS,
  QUALITIES,
  QUALITY_WEIGHTS,
  WEAPONS,
  ARMOR,
  DHIDE,
  CLOTH,
  CUSTOM_HELMS,
  NAMED_GEAR,
  MEGA_RARES,
  MEGA_CHEST,
  SLOTS,
  ERRANDS,
  CLUES,
  CRATES,
  XP_LAMPS,
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
// New gold from training, bosses, events, sales, and the nightly purse. Crate prices stay put.
const GOLD_INTAKE = 1.25;
// Quest cash-outs, and coins from activities that pay for the work rather than
// a drop: skilling and money-making. Combat camps, boss loot, clues, raid
// splits, crate pulls, and selling gear stay on GOLD_INTAKE alone.
const ACTIVITY_GOLD = 1.2;
const TOURNAMENT_POT = Math.round(300 * GOLD_INTAKE);
const MAX_EVENTS = (TICK_HOURS.length * TICK_SLOT_MINUTES.length + 1) * 32;
// One coin flip per ET day. About half of days a pair gets mad.
const PK_DAY_CHANCE = 0.5;
const PK_DELAY_MS = 10 * 60 * 1000;
// A direct gold duel. The challenger's gold is held until it is accepted,
// declined, or taken back. Gear is not on the line.
const DUEL_MIN = 1000;
const DUEL_MAX = 100000000;
// Same pace and speeds as public/js/arena.js. Playback is sim time / (speed * pace).
const FIGHT_PACE = 0.55;
const PK_PLAY_SPEED = 2;
const ARENA_PLAY_SPEED = 1.5;
// A watched duel uses the tournament match speed, then the versus card and the walk-in.
const DUEL_WATCH_SPEED = ARENA_PLAY_SPEED * 2;
const DUEL_VERSUS_MS = 2900;
const DUEL_INTRO_MS = 2000;
const DUEL_WATCH_LEAD_MS = DUEL_VERSUS_MS + DUEL_INTRO_MS;
const DUEL_REVEAL_SLACK_MS = 1500;
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
// Shared rate for training, events, errands, clues, and fights.
// 570, then 627 (+10%), now 690 (+10% again).
// Low levels still take a smaller share, and the full rate is back near level 80.
const XP_TIMESCALE = 690;
const BANK_SLOTS = 48;
// The activity feed shows 80 lines and a spoop page shows 20. Keeping more
// than that ships unused history on every world read.
const LOG_KEEP = 80;

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

// One night off the bracket. Everyone starts scattered in one pit.
const FFA_NIGHTS = {
  '2026-11-14': { formation: 'scatter', pot: 30000 },
};

// The raid replaces the bracket for this night. A list is that night's rooms, in order.
// An object keeps the random map but pins the first boss, the last boss, and bosses that
// must show up somewhere on it.
const RAID_NIGHTS = {
  '2026-11-22': {
    start: { boss: 'bryophyta', tier: 'easy' },
    finale: { boss: 'vorkath', tier: 'hard' },
    include: [{ boss: 'kbd' }, { boss: 'kq', tier: 'hard' }],
  },
  '2026-11-16': true,
  '2026-11-19': [
    { kind: 'boss', boss: 'elvarg', tier: 'easy' },
    { kind: 'cows' },
    { kind: 'boss', boss: 'brutus', tier: 'medium' },
    { kind: 'boss', boss: 'mole', tier: 'medium' },
    { kind: 'rats' },
    { kind: 'boss', boss: 'chaos', tier: 'hard' },
  ],
  '2026-11-21': [
    { kind: 'boss', boss: 'obor', tier: 'easy' },
    { kind: 'boss', boss: 'elvarg', tier: 'easy' },
    { kind: 'cows' },
    { kind: 'boss', boss: 'brutus', tier: 'tough' },
    { kind: 'boss', boss: 'vorkath', tier: 'hard' },
  ],
};

function nightLineup(when) {
  const night = RAID_NIGHTS[etDayKey(when instanceof Date ? when : new Date(when))];
  return night && typeof night === 'object' ? night : null;
}

// One night off the daily climb. Later nights go back to it.
const TOURNAMENT_POTS = {
  '2026-11-17': 90000,
};

function arenaNightPlan(when) {
  const day = etDayKey(when instanceof Date ? when : new Date(when));
  const night = FFA_NIGHTS[day];
  if (night) {
    return {
      kind: 'ffa',
      formation: night.formation,
      title: 'Spoopfight',
      detail: 'Free-for-all, random formation',
      pot: night.pot,
    };
  }
  if (RAID_NIGHTS[day]) {
    return {
      kind: 'raid',
      formation: null,
      title: 'Raid',
      detail: '',
      pot: 0,
    };
  }
  return { kind: 'tournament', formation: null, title: 'Tournament', detail: '', pot: TOURNAMENT_POTS[day] || 0 };
}

function nightRoster(state, when) {
  return Object.values((state && state.spoops) || {})
    .filter((spoop) => spoop && new Date(spoop.born) <= when)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

// Same seed the night uses, so the lobby name matches the raid that actually runs.
function raidNightName(state, when) {
  const roster = nightRoster(state, when);
  const seed = hashString('nightly-raid|' + when.toISOString() + '|' + roster.map((spoop) => spoop.name).join('|'));
  const rng = mulberry32(seed);
  return raidTitle(mapTitleIds(rollRaidMap(rng, nightLineup(when))), rng);
}

function nightBlurb(state, when) {
  const plan = arenaNightPlan(when);
  if (plan.kind === 'raid') return raidNightName(state, when);
  return plan.detail || '';
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
    const night = arenaNightPlan(next.at);
    const detail = nightBlurb(state, next.at);
    let line = night.title + ' at ' + label(next.at) + '.';
    if (detail) line = night.title + ' at ' + label(next.at) + '. ' + detail + '.';
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
  // 99 Attack, Strength, Defence, Hitpoints, and Prayer is 126. Skills can keep
  // climbing past 99, but combat stops where Old School stops.
  return Math.min(126, Math.floor(base + Math.max(melee, range, mage)));
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

function helmRank(item) {
  if (!item || item.slot !== 'head') return 0;
  if (item.baseId === 'full-helm') return 1;
  if (CUSTOM_HELMS.some((helm) => helm.id === item.baseId)) return 2;
  return 0;
}

const MEGA_BY_ID = new Map(MEGA_RARES.map((row) => [row.id, row]));

function megaOf(item) {
  return (item && item.mega && MEGA_BY_ID.get(item.mega)) || null;
}

function itemScore(item) {
  const ti = Math.max(0, TIERS.findIndex((t) => t.id === item.tier));
  return ti * 10 + qualityIndex(item.quality) + (item.unique ? 15 : 0) + (megaOf(item) ? 25 : 0) + helmRank(item);
}

// Helms are worn by the bonus sheet, not by metal alone. A steel full helm
// out-defends a black med helm, so the higher sheet is the one that stays on.
function helmStatScore(item) {
  if (!item || item.slot !== 'head') return null;
  const bonuses = bonusesForItem(item);
  let score = 0;
  for (const value of Object.values(bonuses.defence)) score += value;
  for (const value of Object.values(bonuses.other)) score += value;
  for (const value of Object.values(bonuses.attack)) if (value > 0) score += value;
  return score;
}

function isBetterItem(item, current) {
  if (!current) return true;
  if (item.slot === 'head' && current.slot === 'head') {
    const diff = helmStatScore(item) - helmStatScore(current);
    if (diff) return diff > 0;
  }
  return itemScore(item) > itemScore(current);
}

const BUILDS = ['melee', 'ranged', 'magic'];
const MAGIC_PIECES = new Set(['wizard-hat', 'farseer-helm', 'void-mage', 'ancestral-hat']);
  const RANGED_PIECES = new Set(['coif', 'archer-helm', 'robin-hood', 'ranger-hat', 'void-ranger', 'armadyl-helm']);
const OPEN_HELMS = new Set(['serpentine-helm', 'justiciar-helm', 'slayer-helm']);

function combatBuild(spoop) {
  const style = spoop && spoop.build;
  return BUILDS.includes(style) ? style : 'melee';
}

function itemBuild(item) {
  if (!item) return null;
  if (item.slot === 'weapon') return item.style === 'ranged' || item.style === 'magic' ? item.style : 'melee';
  if (item.slot === 'ammo') return 'ranged';
  if (item.gearStyle === 'ranged' || item.gearStyle === 'magic' || item.gearStyle === 'melee') return item.gearStyle;
  if (item.slot === 'shield') return 'melee';
  if (item.anyStyle) return null;
  if (item.slot === 'neck' || item.slot === 'ring' || item.slot === 'cape' || item.slot === 'boots' || item.slot === 'gloves') return null;
  if (MAGIC_PIECES.has(item.baseId)) return 'magic';
  if (RANGED_PIECES.has(item.baseId)) return 'ranged';
  if (item.slot === 'head' && OPEN_HELMS.has(item.baseId)) return null;
  if (item.slot === 'head' || item.slot === 'body' || item.slot === 'legs') return 'melee';
  return null;
}

function fitsBuild(item, style) {
  const build = itemBuild(item);
  return !build || build === style;
}

function styleAffinity(item, style) {
  const key = [item && item.baseId, item && item.baseName, item && item.uniqueName].filter(Boolean).join(' ').toLowerCase();
  if (style === 'melee' && /berserker|warrior|bandos|proselyte|obsidian|torso/.test(key)) return 1;
  if (style === 'ranged' && /archer|assembler|d'hide|dhide|vambrace|huey|crystal|dragonbone|accuracy|sight|fang|rupture|unholy|law|balance|antler|shayzien|attractor|accumulator|robin|ranger|hopper|odium/.test(key)) return 1;
  if (style === 'magic' && /mystic|infinity|xeric|wizard|zamorak|saradomin|guthix|bloodbark/.test(key)) return 1;
  if (style === 'magic' && /robe/.test(key) && !/void/.test(key)) return 1;
  if (style === 'magic' && /seer|occult/.test(key)) return 1;
  return 0;
}

function betterForBuild(item, current, style) {
  if (!current) return true;
  if (isBetterItem(item, current)) return true;
  if (isBetterItem(current, item)) return false;
  return styleAffinity(item, style) > styleAffinity(current, style);
}

/** Crude bronze is 1. Each quality step adds 1. Each metal adds 10, so quality stays inside the tier. A megarare rates one metal above raid. */
function gearRating(item) {
  if (!item) return 0;
  const ti = Math.max(0, TIERS.findIndex((t) => t.id === item.tier)) + (megaOf(item) ? 1 : 0);
  return 1 + ti * 10 + qualityIndex(item.quality) + helmRank(item);
}

/** Average of every worn slot, to one decimal. An empty slot counts as 0, so a bare weapon cannot look like a full kit. */
function equippedGearRating(spoop) {
  const equipped = spoop && spoop.equipped;
  if (!equipped) return 0;
  let sum = 0;
  for (const slot of SLOTS) sum += gearRating(equipped[slot]);
  return Math.round((sum / SLOTS.length) * 10) / 10;
}

function qualityLabel(quality, slot) {
  if (quality === 'sharpened' && slot !== 'weapon') return 'Reinforced';
  const q = QUALITIES.find((x) => x.id === quality);
  const id = q ? q.id : 'standard';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function itemDisplayName(item) {
  if (item.uniqueName) return item.uniqueName;
  const quality = qualityLabel(item.quality, item.slot);
  if (item.plainName) return `${quality} ${item.baseName}`;
  const tier = tierById(item.tier);
  return `${quality} ${tier.name} ${item.baseName}`;
}

function errandById(id) {
  return ERRANDS.find((row) => row.id === id) || null;
}

function clueById(id) {
  return CLUES.find((row) => row.id === id) || null;
}

function activityById(id) {
  return ACTIVITIES.find((a) => a.id === id) || clueById(id) || idleActivityById(id) || errandById(id) || ACTIVITIES[0];
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
    build: 'melee',
    focus: null,
    autoSell: true,
    autoEquip: true,
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
  ['Kycats12', "Grillin'NewLineChar"],
  ['NewLineChar', null],
  ['SpoopSpooply', 'Pooply'],
  ['Roby pls', 'Retardchud'],
  ['Player1817', 'PlayerHater'],
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

// Each id pays once. A gift with an owner goes to that one spoop, otherwise to everyone.
// A gift is gold, or a lamp id from XP_LAMPS.
const GOLD_GIFTS = [
  { id: 'gift-10000-2026-11-17', gold: 10000 },
  { id: 'gift-30000-roby-pls-2026-11-19', gold: 30000, owner: 'Roby pls' },
  { id: 'gift-large-lamp-2026-11-19', lamp: 'large' },
];

function grantGoldGift(state) {
  if (!state || !state.spoops) return false;
  if (!state.gifts) state.gifts = {};
  const when = new Date(state.clock || Date.now());
  let paid = false;
  for (const gift of GOLD_GIFTS) {
    if (state.gifts[gift.id]) continue;
    const lamp = gift.lamp ? lampById(gift.lamp) : null;
    if (gift.lamp && !lamp) continue;
    const text = lamp
      ? `${clockLabel(when)} — A gift of ${lampLine(lamp)}. It went into the inventory.`
      : `${clockLabel(when)} — A gift of ${gift.gold.toLocaleString('en-US')} gold.`;
    const spoops = gift.owner ? [state.spoops[gift.owner]].filter(Boolean) : Object.values(state.spoops);
    if (!spoops.length) continue;
    for (const spoop of spoops) {
      if (lamp) grantLamp(spoop, lamp);
      else spoop.gold = (Number(spoop.gold) || 0) + gift.gold;
      pushLog(spoop, when, text);
    }
    state.gifts[gift.id] = true;
    paid = true;
  }
  return paid;
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
  const clues = CLUES.filter((clue) => combat >= clue.min && combat <= clue.max);
  return pool.concat(clues);
}

function activityWeight(spoop, activity, poolSize) {
  if (activity.boss) return 0.35;
  // One camp among many, but heavy enough that a trail actually comes up.
  if (activity.clue) return 6;
  let w = 1;
  if (spoop.lessonTicksLeft > 0 && spoop.lessonSkill === activity.skill) w += 8;
  if (activity.money && poolSize > 40) w += 1;
  return w;
}

const BALANCED_SKILLS = ['attack', 'strength', 'defence', 'ranged', 'magic'];

// The catalog is not even per skill: low bands are mostly melee and high bands
// mostly ranged and magic. Each combat skill gets the same share of the band so
// none of them falls behind and then trains slower off the xp ramp.
function skillBalance(band) {
  const share = {};
  for (const row of band) {
    if (row.clue || row.money || !BALANCED_SKILLS.includes(row.skill)) continue;
    share[row.skill] = (share[row.skill] || 0) + (row.boss ? 0.35 : 1);
  }
  const skills = Object.keys(share);
  const avg = skills.reduce((sum, id) => sum + share[id], 0) / (skills.length || 1);
  const scale = {};
  for (const id of skills) scale[id] = avg / share[id];
  return scale;
}

function chooseFrom(spoop, rng, band, poolSize) {
  const current = band.find((row) => row.id === spoop.activityId);
  const stayCut = current && current.boss ? 0.75 : 0.4;
  if (current && rng() > stayCut && !(spoop.lessonTicksLeft > 0)) return current;
  const balance = skillBalance(band);
  return pickWeighted(rng, band, (activity) => {
    const w = activityWeight(spoop, activity, poolSize);
    return activity.clue || activity.money ? w : w * (balance[activity.skill] || 1);
  });
}

// A set focus claims about 60% of ordinary wandering. The other hours pick
// some different skill at random. Quests, errands, and events are not wandering.
function chooseActivity(spoop, rng, skipClues) {
  let pool = activityPool(combatLevel(spoop));
  if (skipClues) pool = pool.filter((row) => !row.clue);
  const focus = SKILL_IDS.includes(spoop.focus) ? spoop.focus : null;
  const focusPool = focus ? pool.filter((row) => row.skill === focus) : [];
  if (!focus || !focusPool.length) return chooseFrom(spoop, rng, pool, pool.length);
  const others = pool.filter((row) => row.skill !== focus);
  if (!others.length || rng() < 0.6) return chooseFrom(spoop, rng, focusPool, pool.length);
  const skills = [];
  for (const row of others) if (!skills.includes(row.skill)) skills.push(row.skill);
  const skill = skills[Math.floor(rng() * skills.length)];
  return chooseFrom(spoop, rng, others.filter((row) => row.skill === skill), pool.length);
}

function grantXp(spoop, skill, amount, opts) {
  ensureBracket(spoop);
  const cap = xpForLevel(MAX_LEVEL);
  const before = levelForXp(spoop.skills[skill] || 0);
  spoop.skills[skill] = Math.min(cap, (spoop.skills[skill] || 0) + amount);
  const after = levelForXp(spoop.skills[skill]);
  const skillName = SKILLS.find((s) => s.id === skill).name;
  const notes = [`+${amount} ${skillName} XP`];
  const gains = [{ id: skill, amount }];
  if (after > before) notes.push(`${skillName} is now level ${after}`);
  if (!(opts && opts.noHitpoints) && ['attack', 'strength', 'defence', 'ranged', 'magic'].includes(skill)) {
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
  if (spec.plainName) item.plainName = true;
  if (spec.osrsId) item.osrsId = spec.osrsId;
  if (spec.gearStyle) item.gearStyle = spec.gearStyle;
  if (spec.hide) item.hide = spec.hide;
  if (spec.cloth) item.cloth = spec.cloth;
  if (spec.shape) item.shape = spec.shape;
  if (spec.req) item.req = spec.req;
  if (spec.anyStyle) item.anyStyle = true;
  if (spec.mega) item.mega = spec.mega;
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

function autoEquipOn(spoop) {
  return !spoop || spoop.autoEquip !== false;
}

function equipIfBetter(spoop, item) {
  if (!autoEquipOn(spoop) || !canWear(spoop, item) || !fitsBuild(item, combatBuild(spoop))) {
    bankItem(spoop, item);
    return false;
  }
  const current = spoop.equipped[item.slot];
  if (betterForBuild(item, current, combatBuild(spoop))) {
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
  const mega = megaOf(item);
  const req = (mega && mega.req) || item.req;
  if (req && req.skill) {
    if ((req.level || 1) <= 1) return null;
    const skillName = (SKILLS.find((s) => s.id === req.skill) || {}).name || req.skill;
    return { skill: req.skill, level: req.level, skillName };
  }
  const hideLevel = item.hide === 'black' ? 70 : item.hide === 'blue' ? 50 : item.hide === 'green' ? 30 : 0;
  if (hideLevel) {
    const skillName = (SKILLS.find((s) => s.id === 'ranged') || {}).name || 'Ranged';
    return { skill: 'ranged', level: hideLevel, skillName };
  }
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
  const style = combatBuild(spoop);
  const pool = [];
  for (const slot of SLOTS) {
    if (spoop.equipped[slot]) pool.push(spoop.equipped[slot]);
    spoop.equipped[slot] = null;
  }
  for (const item of spoop.bank) pool.push(item);
  const best = {};
  const bank = [];
  for (const item of pool) {
    if (!canWear(spoop, item) || !fitsBuild(item, style)) {
      bank.push(item);
      continue;
    }
    const current = best[item.slot];
    if (betterForBuild(item, current, style)) {
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

function setCombatBuild(spoop, style) {
  spoop.build = combatBuild({ build: style });
  if (autoEquipOn(spoop)) reequipBest(spoop);
  return spoop.build;
}

function setEquipMode(spoop, mode) {
  spoop.autoEquip = String(mode || '').toLowerCase() !== 'manual';
  if (spoop.autoEquip) reequipBest(spoop);
  return spoop.autoEquip;
}

function setTrainingFocus(spoop, skill) {
  const id = String(skill || '').trim().toLowerCase();
  spoop.focus = SKILL_IDS.includes(id) ? id : null;
  return spoop.focus;
}

function autoSellOn(spoop) {
  return !spoop || spoop.autoSell !== false;
}

function setAutoSell(spoop, on) {
  spoop.autoSell = !!on;
  return spoop.autoSell;
}

function applyWearRules(spoop, when) {
  const before = {};
  for (const slot of SLOTS) before[slot] = spoop.equipped[slot] || null;
  const notes = [];
  if (autoEquipOn(spoop)) {
    reequipBest(spoop);
  } else {
    for (const slot of SLOTS) {
      const worn = spoop.equipped[slot];
      if (worn && !canWear(spoop, worn)) {
        spoop.equipped[slot] = null;
        bankItem(spoop, worn);
      }
    }
  }
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

function pieceSpec(piece, tierId, qualityId, slot) {
  return {
    slot: slot || piece.slot,
    tier: piece.tier || tierId,
    quality: qualityId,
    baseId: piece.baseId || piece.id,
    baseName: piece.name,
    style: piece.style || null,
    plainName: !!piece.plainName,
    osrsId: piece.osrsId || null,
    gearStyle: piece.gearStyle || null,
    hide: piece.hide || null,
    cloth: piece.cloth || null,
    shape: piece.shape || null,
    req: piece.req || null,
    anyStyle: !!piece.anyStyle,
    mega: piece.mega ? piece.id : null,
  };
}

// How often a body, legs, or gloves roll becomes dragonhide. Fine steel is
// where green starts in earnest. Higher crates still mostly pay their uniques.
function hideChance(spoop, tierId, shift) {
  const ranged = combatBuild(spoop) === 'ranged';
  if (tierId === 'steel') {
    if ((shift || 0) >= 2) return ranged ? 0.7 : 0.2;
    return ranged ? 0.22 : 0.06;
  }
  if (tierId === 'barrows' || tierId === 'raid') return ranged ? 0.22 : 0.07;
  return ranged ? 0.75 : 0.18;
}

function dhideOptions(tierId, slot) {
  return DHIDE.filter((row) => row.slot === slot && row.tiers && row.tiers[tierId]);
}

// Dragonhide shares those slots with the metal. A ranged spoop usually finds
// the hide. Everyone else still mostly finds the plate.
function maybeDhide(rng, spoop, piece, tierId, shift) {
  if (!piece || piece.plainName || piece.gearStyle) return piece;
  const options = dhideOptions(tierId, piece.slot);
  if (!options.length || rng() >= hideChance(spoop, tierId, shift)) return piece;
  return pickWeighted(rng, options, (row) => row.tiers[tierId]);
}

function clothOptions(tierId, slot, spoop) {
  const build = combatBuild(spoop);
  return CLOTH.filter((row) => {
    if (row.slot !== slot || !row.tiers || !row.tiers[tierId]) return false;
    if (row.anyStyle) return build !== 'magic';
    return !row.gearStyle || row.gearStyle === build;
  });
}

// Robes for a mage, white or obsidian for a fighter. The other builds still
// mostly find the plate that was already rolled.
function clothChance(spoop, tierId) {
  if (tierId === 'barrows' || tierId === 'raid') return 0;
  const build = combatBuild(spoop);
  if (build === 'magic') return 0.75;
  if (build === 'melee') return 0.5;
  return 0.08;
}

function maybeCloth(rng, spoop, piece, tierId) {
  if (!piece || piece.plainName || piece.gearStyle) return piece;
  const options = clothOptions(tierId, piece.slot, spoop);
  if (!options.length) return piece;
  const styled = options.filter((row) => !row.anyStyle);
  const universal = options.filter((row) => row.anyStyle);
  if (styled.length && rng() < clothChance(spoop, tierId)) {
    return pickWeighted(rng, styled, (row) => row.tiers[tierId]);
  }
  if (universal.length && rng() < 0.12) {
    return pickWeighted(rng, universal, (row) => row.tiers[tierId]);
  }
  return piece;
}

// Iron through rune crates keep their metal, and sometimes a named piece for
// that slot: a glory, a god book, Ava's device. Dragon and above already roll
// the named list on their own.
function maybeFamiliar(rng, spoop, piece, tierId) {
  if (!piece || piece.plainName || piece.gearStyle) return piece;
  if (tierId === 'dragon' || tierId === 'barrows' || tierId === 'raid') return piece;
  const build = combatBuild(spoop);
  const options = NAMED_GEAR.filter((item) => item.tier === tierId && item.slot === piece.slot && fitsBuild(item, build));
  if (!options.length || rng() >= 0.5) return piece;
  return pickWeighted(rng, options, (item) => item.weight || 1);
}

// A plain bow or staff below dragon sometimes comes up as a real one: an oak
// shortbow, a staff of fire, a battlestaff.
function maybeNamedWeapon(rng, weapon, tierId) {
  if (tierId === 'dragon' || tierId === 'barrows' || tierId === 'raid') return weapon;
  const options = NAMED_GEAR.filter((item) => item.tier === tierId && item.slot === 'weapon' && item.style === weapon.style);
  if (!options.length || rng() >= 0.5) return weapon;
  return pickWeighted(rng, options, (item) => item.weight || 1);
}

function maybeCustomHelm(rng, piece, tierId) {
  if (!piece || piece.slot !== 'head') return piece;
  const pool = CUSTOM_HELMS.filter((helm) => helm.tier === tierId);
  if (!pool.length || rng() >= 0.22) return piece;
  return pool[Math.floor(rng() * pool.length)];
}

function pickNamed(rng, tierId, slot) {
  const pool = NAMED_GEAR.filter((item) => item.tier === tierId && (!slot || item.slot === slot));
  if (!pool.length) return null;
  return pickWeighted(rng, pool, (item) => item.weight || 1);
}

// Dragon metal stays the usual find, with a real unique mixed in sometimes.
// Barrows and raid always come off the named list.
function takeNamedPiece(rng, tierId, slot) {
  if (tierId === 'barrows' || tierId === 'raid') {
    return pickNamed(rng, tierId, slot) || pickNamed(rng, tierId);
  }
  if (tierId === 'dragon' && rng() < 0.22) {
    return pickNamed(rng, tierId, slot) || pickNamed(rng, tierId);
  }
  return null;
}

function randomPiece(rng, tierId, qualityId, spoop, shift) {
  if (tierId === 'barrows' || tierId === 'raid') {
    if (rng() < hideChance(spoop, tierId, shift)) {
      const slot = ['body', 'legs', 'gloves'][Math.floor(rng() * 3)];
      const hide = pickWeighted(rng, dhideOptions(tierId, slot), (row) => row.tiers[tierId]);
      if (hide) return pieceSpec(hide, tierId, qualityId);
    }
  }
  const named = takeNamedPiece(rng, tierId);
  if (named) return pieceSpec(named, tierId, qualityId, named.slot);
  if (rng() < 0.45) {
    const w = maybeNamedWeapon(rng, WEAPONS[Math.floor(rng() * WEAPONS.length)], tierId);
    return pieceSpec(w, tierId, qualityId, 'weapon');
  }
  const a = ARMOR[Math.floor(rng() * ARMOR.length)];
  return pieceSpec(maybeFamiliar(rng, spoop, maybeDhide(rng, spoop, maybeCloth(rng, spoop, maybeCustomHelm(rng, a, tierId), tierId), tierId, shift), tierId), tierId, qualityId);
}

function giveItem(spoop, item) {
  const name = itemDisplayName(item);
  const previous = spoop.equipped[item.slot];
  const before = previous ? itemDisplayName(previous) : '';
  const equipped = equipIfBetter(spoop, item);
  let text = `Found ${name}. Banked it.`;
  let outcome = 'banked';
  if (equipped) {
    text = `Found ${name}. Equipped it.`;
    outcome = 'equipped';
  } else if (!spoop.bank.some((i) => i.id === item.id)) {
    text = `Found ${name}. The bank kept better gear, so this one was tossed.`;
    outcome = 'tossed';
  } else {
    const req = wearRequirement(item);
    if (req && !canWear(spoop, item)) {
      text = `Found ${name}. Banked it. Needs ${req.level} ${req.skillName}.`;
      outcome = 'locked';
    }
  }
  return { text, item, outcome, before };
}

// Share of a same-tier roll that still lands. Past rune the bracket itself thins out.
const OWN_TIER_SCALE = {
  bronze: 1,
  iron: 1,
  steel: 1,
  black: 1,
  mithril: 1,
  adamant: 1,
  rune: 0.72,
  dragon: 0.38,
  barrows: 0.14,
  raid: 0.07,
};

// Share of a next-tier roll that still lands. Dragon off a rune spoop is uncommon.
// A raid piece while they are on barrows is a few times a season across the roster.
const UP_TIER_SCALE = {
  bronze: 1,
  iron: 1,
  steel: 0.85,
  black: 0.7,
  mithril: 0.5,
  adamant: 0.32,
  rune: 0.1,
  dragon: 0.045,
  barrows: 0.012,
  raid: 0,
};

function ownTierScale(tierId) {
  const scale = OWN_TIER_SCALE[tierId];
  return scale == null ? 1 : scale;
}

function upTierScale(tierId) {
  const scale = UP_TIER_SCALE[tierId];
  return scale == null ? 1 : scale;
}

function dropIsRare(spoop, item) {
  if (!item) return false;
  const have = tierIndex(bestTierForCombat(combatLevel(spoop)).id);
  const got = tierIndex(item.tier);
  if (got <= have) return false;
  if (got >= tierIndex('barrows')) return true;
  return got >= tierIndex('dragon') && have >= tierIndex('rune');
}

function giveFound(spoop, item) {
  const found = giveItem(spoop, item);
  if (dropIsRare(spoop, item)) found.text = 'Rare drop. ' + found.text;
  return found;
}

// A won piece. Their combat bracket is the common one, until that bracket is
// rune or better, where most of the weight falls back a step. The bracket
// above shrinks the same way the hourly table does. A shift off the list
// stays on their bracket, so bronze and raid still get an item.
function lootBracket(spoop, rng) {
  const base = bestTierForCombat(combatLevel(spoop));
  const index = TIERS.findIndex((row) => row.id === base.id);
  const own = ownTierScale(base.id);
  const same = 70 * own;
  const rows = [
    { shift: 0, weight: same },
    { shift: -1, weight: 22 + (70 - same) },
  ];
  const above = 8 * upTierScale(base.id);
  if (above > 0) rows.push({ shift: 1, weight: above });
  const pick = pickWeighted(rng, rows, (row) => row.weight);
  const next = index + pick.shift;
  if (next < 0 || next >= TIERS.length) return base;
  return TIERS[next];
}

function rollDrop(spoop, rng) {
  const tier = lootBracket(spoop, rng);
  const quality = rollQuality(rng, 0);
  return giveFound(spoop, makeItem(spoop, rng, randomPiece(rng, tier.id, quality.id, spoop)));
}

// One roll per hourly tick, on the bracket their combat level has reached.
// Written chances are about 30% on that bracket, 10% on the one below, and 3%
// on the one above. From rune up, ownTierScale and upTierScale thin those out,
// and the flat lift shrinks with them. Anything left is no item. A shift off
// the end misses. A jump to dragon, barrows, or raid is logged as a rare drop.
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
    { slot: 'head', baseId: 'full-helm', baseName: 'full helm', style: null },
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

function tickLootChance(row, tierId) {
  if (row.shift > 0) return row.chance * upTierScale(tierId);
  if (row.shift < 0) return row.chance;
  return row.chance * ownTierScale(tierId);
}

function tickLootLift(tierId) {
  const own = ownTierScale(tierId);
  if (own >= 0.95) return 0.1;
  if (own >= 0.5) return 0.03;
  return 0.01;
}

function rollTickLoot(spoop, rng) {
  const tier = bestTierForCombat(combatLevel(spoop));
  const ti = TIERS.findIndex((row) => row.id === tier.id);
  const chances = TICK_LOOT.map((row) => tickLootChance(row, tier.id));
  const base = chances.reduce((sum, chance) => sum + chance, 0);
  const lift = tickLootLift(tier.id);
  const scale = base > 0 ? (base + lift) / base : 1;
  let roll = rng();
  for (let i = 0; i < TICK_LOOT.length; i++) {
    const row = TICK_LOOT[i];
    const chance = chances[i] * scale;
    if (roll < chance) {
      const index = ti + row.shift;
      if (index < 0 || index >= TIERS.length) return null;
      const tierId = TIERS[index].id;
      let rolled = maybeCustomHelm(rng, tickLootPiece(rng), tierId);
      if ((tierId === 'barrows' || tierId === 'raid') && dhideOptions(tierId, rolled.slot).length && rng() < hideChance(spoop, tierId, 0)) {
        rolled = pickWeighted(rng, dhideOptions(tierId, rolled.slot), (row) => row.tiers[tierId]);
      } else {
        const named = takeNamedPiece(rng, tierId, rolled.slot);
        if (named) rolled = named;
        else rolled = maybeFamiliar(rng, spoop, maybeDhide(rng, spoop, maybeCloth(rng, spoop, rolled, tierId), tierId, 0), tierId);
      }
      const item = makeItem(spoop, rng, {
        slot: rolled.slot,
        tier: rolled.tier || tierId,
        quality: row.quality,
        baseId: rolled.baseId || rolled.id,
        baseName: rolled.baseName || rolled.name,
        style: rolled.style,
        plainName: rolled.plainName,
        osrsId: rolled.osrsId,
        gearStyle: rolled.gearStyle || null,
        hide: rolled.hide || null,
        cloth: rolled.cloth || null,
        shape: rolled.shape || null,
        req: rolled.req || null,
        anyStyle: !!rolled.anyStyle,
      });
      return giveFound(spoop, item);
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
  'full-helm': { def: { stab: 7, slash: 8, crush: 6, magic: -3, range: 6 }, atk: { stab: -1, slash: -1, crush: -1, magic: -5, range: -2 } },
  'wizard-hat': { def: { magic: 4 }, atk: { magic: 4 }, other: { magic: 1 } },
  coif: { def: { stab: 2, slash: 2, crush: 1, magic: 3, range: 4 }, atk: { range: 2 } },
  'spiny-helm': { def: { stab: 3, slash: 4, crush: 6, magic: -1, range: 3 } },
  'black-mask': { def: { stab: 3, slash: 4, crush: 2, magic: -1, range: 3 }, other: { melee: 1 } },
  'slayer-helm': { def: { stab: 4, slash: 5, crush: 3, magic: 1, range: 4 }, other: { melee: 1 } },
  'initiate-sallet': { def: { stab: 3, slash: 3, crush: 2, magic: 2, range: 2 }, other: { prayer: 1 } },
  'proselyte-sallet': { def: { stab: 4, slash: 4, crush: 3, magic: 3, range: 3 }, other: { prayer: 2 } },
  'berserker-helm': { def: { stab: 5, slash: 6, crush: 4, magic: -3, range: 5 }, atk: { magic: -4, range: -4 }, other: { melee: 1 } },
  'warrior-helm': { def: { stab: 5, slash: 6, crush: 5, magic: -2, range: 5 }, atk: { magic: -3, range: -3 }, other: { melee: 1 } },
  'archer-helm': { def: { stab: 4, slash: 4, crush: 3, magic: -1, range: 5 }, atk: { range: 3 } },
  'farseer-helm': { def: { magic: 5 }, atk: { magic: 4 } },
  'void-melee': { def: { stab: 3, slash: 3, crush: 3, magic: 2, range: 2 }, atk: { stab: 2, slash: 2, crush: 2 } },
  'void-ranger': { def: { stab: 3, slash: 3, crush: 3, magic: 2, range: 3 }, atk: { range: 3 } },
  'void-mage': { def: { stab: 2, slash: 2, crush: 2, magic: 3, range: 2 }, atk: { magic: 3 } },
  'granite-helm': { def: { stab: 4, slash: 5, crush: 8, magic: -4, range: 4 }, atk: { magic: -4, range: -3 }, other: { melee: 1 } },
  'neitiznot-helm': { def: { stab: 6, slash: 7, crush: 5, magic: 2, range: 6 }, other: { melee: 1, prayer: 1 } },
  'obsidian-helm': { def: { stab: 5, slash: 5, crush: 5, magic: -2, range: 3 }, atk: { magic: -4, range: -4 }, other: { melee: 1 } },
  faceguard: { def: { stab: 7, slash: 8, crush: 6, magic: 3, range: 7 }, other: { melee: 2, prayer: 1 } },
  'serpentine-helm': { def: { stab: 8, slash: 8, crush: 7, magic: 4, range: 6 } },
  'armadyl-helm': { def: { stab: 5, slash: 5, crush: 4, magic: 2, range: 7 }, atk: { range: 5 } },
  'inquisitor-helm': { def: { stab: 5, slash: 5, crush: 8, magic: 2, range: 4 }, atk: { crush: 2 }, other: { prayer: 1 } },
  'ancestral-hat': { def: { magic: 6 }, atk: { magic: 5 }, other: { magic: 1 } },
  'justiciar-helm': { def: { stab: 8, slash: 8, crush: 8, magic: 4, range: 7 }, other: { prayer: 2 } },
  'torva-helm': { def: { stab: 8, slash: 8, crush: 7, magic: 3, range: 7 }, other: { melee: 2 } },
  'proselyte-hauberk': { def: { stab: 12, slash: 12, crush: 10, magic: 4, range: 10 }, other: { prayer: 3 } },
  'proselyte-tasset': { def: { stab: 8, slash: 8, crush: 6, magic: 3, range: 7 }, other: { prayer: 2 } },
  'fighter-torso': { def: { stab: 12, slash: 15, crush: 11, magic: -2, range: 12 }, other: { melee: 4 } },
  'obsidian-platebody': { def: { stab: 14, slash: 14, crush: 14, magic: -2, range: 12 }, other: { melee: 3 } },
  'obsidian-platelegs': { def: { stab: 9, slash: 9, crush: 9, magic: -1, range: 8 }, other: { melee: 2 } },
  'void-top': { def: { stab: 10, slash: 10, crush: 10, magic: 10, range: 10 } },
  'void-robe': { def: { stab: 7, slash: 7, crush: 7, magic: 7, range: 7 } },
  platebody: { def: { stab: 16, slash: 16, crush: 15, magic: -1, range: 16 }, atk: { magic: -6, range: -3 } },
  platelegs: { def: { stab: 10, slash: 9, crush: 8, magic: -1, range: 10 }, atk: { magic: -4, range: -2 } },
  kiteshield: { def: { stab: 9, slash: 10, crush: 8, magic: -1, range: 8 }, atk: { magic: -2, range: -1 } },
  boots: { def: { stab: 1, slash: 2, crush: 3 } },
  gloves: { def: { stab: 2, slash: 2, crush: 1, magic: 1, range: 2 } },
  cape: { def: { stab: 1, slash: 1, crush: 1, magic: 1, range: 1 } },
};

// Shown stats for robes and hides. Combat power still follows the tier.
const STYLE_SHEET = {
  magic: {
    head: { def: { magic: 6, range: 1 }, atk: { magic: 5 }, other: { magic: 1 } },
    body: { def: { stab: 4, slash: 3, crush: 6, magic: 14 }, atk: { magic: 10 }, other: { magic: 1 } },
    legs: { def: { stab: 3, slash: 2, crush: 4, magic: 8 }, atk: { magic: 6 } },
    gloves: { def: { magic: 2 }, atk: { magic: 2 } },
    boots: { def: { stab: 1, slash: 1, crush: 1, magic: 2 }, atk: { magic: 1 } },
    shield: { def: { magic: 5 }, atk: { magic: 5 }, other: { magic: 1 } },
  },
  ranged: {
    head: { def: { stab: 4, slash: 4, crush: 3, magic: 3, range: 8 }, atk: { range: 5 } },
    body: { def: { stab: 6, slash: 5, crush: 6, magic: 6, range: 12 }, atk: { range: 8 } },
    legs: { def: { stab: 4, slash: 3, crush: 4, magic: 4, range: 8 }, atk: { range: 5 } },
    gloves: { def: { stab: 1, slash: 1, crush: 1, magic: 2, range: 3 }, atk: { range: 1 } },
    boots: { def: { stab: 1, slash: 1, crush: 2, magic: 1, range: 2 }, atk: { range: 1 } },
    shield: { def: { stab: 4, slash: 4, crush: 4, magic: 3, range: 6 }, atk: { range: 2 } },
  },
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

// How a megarare's defence spreads over the five styles, by the style it is built for.
const MEGA_GUARD = {
  melee: { stab: 1, slash: 1, crush: 1, magic: 0.3, range: 1 },
  ranged: { stab: 0.7, slash: 0.7, crush: 0.7, magic: 1.1, range: 1 },
  magic: { stab: 0.5, slash: 0.5, crush: 0.5, magic: 1.2, range: 0.4 },
  any: { stab: 0.8, slash: 0.8, crush: 0.8, magic: 0.8, range: 0.8 },
};

// Shown numbers for a megarare. They come off the same power that fights, so
// the sheet tells the truth: defence reads about 4x, magic strength as a percent.
function megaBonuses(item, mega) {
  const bonuses = emptyBonuses();
  const power = mega.power || {};
  const q = item.quality;
  const hits = mega.hits || { stab: 1, slash: 1, crush: 1 };
  for (const key of ['stab', 'slash', 'crush']) bonuses.attack[key] = influence((power.meleeAcc || 0) * (hits[key] || 0), q);
  bonuses.attack.range = influence(power.rangeAcc || 0, q);
  bonuses.attack.magic = influence(power.mageAcc || 0, q);
  const guard = MEGA_GUARD[mega.gearStyle || (mega.slot === 'shield' ? 'melee' : 'any')] || MEGA_GUARD.any;
  for (const key of Object.keys(guard)) bonuses.defence[key] = influence((power.def || 0) * 4 * guard[key], q);
  bonuses.other.melee = influence(power.meleeStr || 0, q);
  bonuses.other.ranged = influence(power.rangeStr || 0, q);
  bonuses.other.magic = influence((power.mageStr || 0) / 4, q);
  bonuses.other.prayer = influence(power.prayer || 0, q);
  return bonuses;
}

function bonusesForItem(item) {
  const bonuses = emptyBonuses();
  if (!item) return bonuses;
  const mega = megaOf(item);
  if (mega) return megaBonuses(item, mega);
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
    const styled = item.gearStyle && STYLE_SHEET[item.gearStyle] && STYLE_SHEET[item.gearStyle][item.slot];
    const sheet = styled || ARMOR_SHEET[item.baseId];
    if (sheet) {
      addSheet(defence, sheet.def, item);
      addSheet(attack, sheet.atk, item);
      addSheet(other, sheet.other, item);
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

function defenceSum(item) {
  const bonuses = bonusesForItem(item);
  let total = 0;
  for (const value of Object.values(bonuses.defence)) total += value;
  return total;
}

function helmDefenceFactor(item) {
  const mine = defenceSum(item);
  const med = defenceSum({
    slot: 'head',
    tier: item.tier,
    quality: item.quality || 'standard',
    baseId: 'med-helm',
  });
  if (!(med > 0)) return 1;
  return Math.max(0, mine / med);
}

// Old School ticks (0.6s). Lower is faster. The wiki puts scimitar, sword,
// dagger, and mace on 4, and longsword and staff on 5. The sword sits a
// little slower than the scimitar so that gap is visible. A shortbow on
// rapid is 3, so the bow lands between 3 and 4.
const WEAPON_TICKS = {
  dagger: 4,
  scimitar: 4,
  mace: 4,
  sword: 4.4,
  shortbow: 3.6,
  longsword: 5,
  staff: 5,
};
const ATTACK_BASE = 4.4;

function attackInterval(baseId) {
  const ticks = WEAPON_TICKS[baseId] || 4;
  return Math.round(ATTACK_BASE * (ticks / 4) * 10) / 10;
}

// A megarare skips the slot formula and adds its own power. Prayer on a piece is defence in a fight.
function addMegaPower(gear, item, mega) {
  const power = mega.power || {};
  const f = qualityFactor(item.quality);
  for (const key of ['meleeAcc', 'meleeStr', 'rangeAcc', 'rangeStr', 'mageAcc', 'mageStr', 'def']) {
    gear[key] += (power[key] || 0) * f;
  }
  gear.def += (power.prayer || 0) * f;
}

function gearBonuses(spoop) {
  const gear = { meleeAcc: 1, meleeStr: 0, rangeAcc: 1, rangeStr: 0, mageAcc: 1, mageStr: 0, def: 0, style: 'melee' };
  const weapon = spoop.equipped && spoop.equipped.weapon;
  gear.attack = attackInterval(weapon && weapon.baseId);
  const weaponMega = megaOf(weapon);
  if (weaponMega) {
    gear.style = weapon.style || 'melee';
    addMegaPower(gear, weapon, weaponMega);
  } else if (weapon) {
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
    const mega = megaOf(piece);
    if (mega) {
      addMegaPower(gear, piece, mega);
      continue;
    }
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
      let defence = p * 2;
      if (slot === 'head') defence *= helmDefenceFactor(piece);
      gear.def += defence;
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

// One swing for the whole bout. Each spoop shows up 10–20% hot or cold.
// Attack speed is not part of the roll.
function boutFortune(rng) {
  const span = 0.10 + rng() * 0.10;
  return 1 + (rng() < 0.5 ? -span : span);
}

function fight(a, b, rng) {
  const formA = boutFortune(rng);
  const formB = boutFortune(rng);
  const hpMaxA = levelForXp(a.skills.hitpoints);
  const hpMaxB = levelForXp(b.skills.hitpoints);
  let hpA = Math.max(1, Math.round(hpMaxA * formA));
  let hpB = Math.max(1, Math.round(hpMaxB * formB));
  const na = styleNumbers(a);
  const nb = styleNumbers(b);
  na.acc *= formA;
  nb.acc *= formB;
  na.max = Math.max(1, Math.floor(na.max * formA));
  nb.max = Math.max(1, Math.floor(nb.max * formB));
  const defA = (levelForXp(a.skills.defence) + a.gear.def + Math.floor(levelForXp(a.skills.prayer) / 4)) * formA;
  const defB = (levelForXp(b.skills.defence) + b.gear.def + Math.floor(levelForXp(b.skills.prayer) / 4)) * formB;
  const chance = (acc, def) => Math.max(0.18, Math.min(0.85, acc / (acc + def)));
  const lines = [];
  const firstA = rng() > 0.5;
  const gapA = a.gear && a.gear.attack > 0 ? a.gear.attack : attackInterval(null);
  const gapB = b.gear && b.gear.attack > 0 ? b.gear.attack : attackInterval(null);
  let nextA = firstA ? 0 : 0.05;
  let nextB = firstA ? 0.05 : 0;
  const horizon = 12 * attackInterval(null);
  let swings = 0;
  while (hpA > 0 && hpB > 0 && swings < 40) {
    const when = Math.min(nextA, nextB);
    if (when > horizon) break;
    const attackingA = nextA <= nextB;
    if (attackingA) nextA += gapA;
    else nextB += gapB;
    swings += 1;
    const acc = attackingA ? na : nb;
    const def = attackingA ? defB : defA;
    const actor = attackingA ? a : b;
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

function metalCrates() {
  return CRATES.filter((crate) => !crate.style && !crate.lamps);
}

function goldGoal(gold) {
  const crates = metalCrates();
  const next = crates.find((c) => c.cost > gold);
  if (!next) {
    const last = crates[crates.length - 1];
    return { name: last.name, cost: last.cost, progress: 1 };
  }
  const index = crates.indexOf(next);
  const start = index > 0 ? crates[index - 1].cost : 0;
  const span = next.cost - start;
  return {
    name: next.name,
    cost: next.cost,
    progress: span <= 0 ? 1 : Math.max(0, Math.min(1, (gold - start) / span)),
  };
}

const UNIQUE_CHANCE = 0.04;
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
  if (!autoEquipOn(spoop)) return null;
  const style = combatBuild(spoop);
  const options = spoop.bank.filter((item) => item.slot === slot && canWear(spoop, item) && fitsBuild(item, style));
  if (!options.length) return null;
  options.sort((a, b) => (betterForBuild(a, b, style) ? -1 : betterForBuild(b, a, style) ? 1 : 0));
  const next = options[0];
  spoop.bank = spoop.bank.filter((item) => item.id !== next.id);
  delete next.storedAt;
  spoop.equipped[slot] = next;
  return next;
}

function bossDeathChance(combat, activity) {
  const meta = SPOOP_BOSSES[activity.boss] || {};
  const threat = meta.threat || 2;
  const over = Math.max(0, combat - (activity.min || 1));
  const base = threat <= 1 ? 0.28 : threat >= 3 ? 0.55 : 0.42;
  const floor = threat <= 1 ? 0.06 : threat >= 3 ? 0.18 : 0.12;
  return Math.max(floor, base - over * 0.011);
}

// Per kill, on a raid whose own unique is a megarare. Rolled before the normal uniques.
const RAID_MEGA_CHANCE = 0.01;

function bossEncounter(spoop, activity, when, rng) {
  const boss = BOSS_DROPS[activity.id];
  const megas = boss && Array.isArray(boss.mega) ? boss.mega.map((id) => MEGA_BY_ID.get(id)).filter(Boolean) : [];
  if (megas.length && rng() < RAID_MEGA_CHANCE) {
    const piece = megas[Math.floor(rng() * megas.length)];
    const item = makeItem(spoop, rng, pieceSpec(piece, 'raid', rollQuality(rng, 2).id));
    const found = giveItem(spoop, item);
    return [{
      log: `${clockLabel(when)} — Megarare drop from ${boss.name}. ${found.text}`,
      item: found.item,
      note: `Megarare drop from ${boss.name}.`,
    }];
  }
  if (!boss || !boss.drops.length || rng() >= UNIQUE_CHANCE) return [];
  const spec = boss.drops[Math.floor(rng() * boss.drops.length)];
  const item = makeUnique(spoop, spec);
  const found = giveItem(spoop, item);
  return [{
    log: `${clockLabel(when)} — Rare drop from ${boss.name}. ${found.text}`,
    item: found.item,
    note: `Rare drop from ${boss.name}.`,
  }];
}

function doBossAttempt(spoop, next, ev, rng) {
  const meta = SPOOP_BOSSES[next.boss] || { name: next.name };
  const label = meta.name || next.name;
  if (rng() < bossDeathChance(combatLevel(spoop), next)) {
    const text = `${clockLabel(ev.when)} — Died to ${label}. Nothing gained.`;
    pushLog(spoop, ev.when, text);
    return discordAction(ev.when, `Died to ${label}. Nothing gained.`, [], [], null);
  }
  if (!spoop.bossKc || typeof spoop.bossKc !== 'object' || Array.isArray(spoop.bossKc)) spoop.bossKc = {};
  const kc = (Number(spoop.bossKc[next.boss]) || 0) + 1;
  spoop.bossKc[next.boss] = kc;
  const skillLevel = levelForXp(spoop.skills[next.skill] || 0);
  let xp = (18 + Math.floor(rng() * 28)) * XP_TIMESCALE * TRAIN_SHARE;
  xp *= xpRamp(skillLevel);
  const pace = next.xpRate > 0 && next.xpRate < 1 ? next.xpRate : 1;
  xp = Math.max(1, Math.floor(xp * pace));
  const notes = grantXp(spoop, next.skill, xp);
  const gold = workGold(next, next.gold + Math.floor(rng() * Math.max(1, next.gold)));
  spoop.gold += gold;
  const killWord = kc === 1 ? 'kill' : 'kills';
  const verb = `Killed ${label}`;
  const text = `${clockLabel(ev.when)} — ${verb}. ${kc.toLocaleString('en-US')} ${killWord}. ${notes.join('. ')}. +${gold} gold.`;
  pushLog(spoop, ev.when, text);
  const found = [];
  const side = [];
  for (const extra of bossEncounter(spoop, next, ev.when, rng)) {
    pushLog(spoop, ev.when, extra.log);
    if (extra.item) found.push(extra);
    if (extra.note) side.push(extra.note);
  }
  const lamp = lampDrop(spoop, 'boss', ev.when);
  if (lamp) {
    pushLog(spoop, ev.when, `${clockLabel(ev.when)} — ${lamp.text}`);
    side.push('🪔 ' + lamp.text);
  }
  const petRng = mulberry32(hashString(`${spoop.name}|pet|${ev.when.toISOString()}`));
  const pet = rollPet(spoop, next, petRng);
  if (pet) {
    pushLog(spoop, ev.when, `${clockLabel(ev.when)} — ${pet.name} followed them home.`);
    side.push(pet.name + ' followed them home.');
  }
  return discordAction(ev.when, `${verb}. ${kc.toLocaleString('en-US')} ${killWord}.`, found, side, notes.gains);
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

function workGold(activity, raw) {
  const scale = activity && !activity.clue && (activity.style === 'skilling' || activity.money) ? ACTIVITY_GOLD : 1;
  return Math.max(1, Math.round(raw * TRAIN_SHARE * GOLD_INTAKE * scale));
}

function eventGold(tierId, rng, share) {
  const band = EVENT_GOLD[tierId] || EVENT_GOLD.bronze;
  const amount = band[0] + Math.floor(rng() * (band[1] - band[0] + 1));
  return Math.max(1, Math.round(amount * share * GOLD_INTAKE));
}

// Skilling is the purse once they leave the starter band. It stays near the old
// rate under combat 12, then climbs through 15–40 and holds at 10x. Money
// methods already pay for the hour, so they only take part of that climb.
function skillingGoldScale(combat, money) {
  if (combat < 12) return money ? 1 : 1.25;
  const t = Math.max(0, Math.min(1, (combat - 12) / 28));
  const ordinary = 2 + t * 8;
  if (money) return 1 + (ordinary - 1) * 0.3;
  return ordinary;
}

function eventGear(spoop, rng, tierId) {
  const quality = rollQuality(rng, 2);
  return giveFound(spoop, makeItem(spoop, rng, randomPiece(rng, tierId, quality.id, spoop)));
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

function rollQuestPiece(spoop, rng) {
  const tier = lootBracket(spoop, rng);
  const quality = rollQuality(rng, 0);
  return randomPiece(rng, tier.id, quality.id, spoop);
}

function questReward(spoop, quest, ev) {
  const rng = mulberry32(hashString(`${spoop.name}|quest-reward|${quest.id}|${ev.when.toISOString()}`));
  const spec = rollQuestPiece(spoop, rng);
  const preview = {
    slot: spec.slot,
    tier: spec.tier,
    quality: spec.quality,
    baseId: spec.baseId,
    baseName: spec.baseName,
    style: spec.style || null,
    plainName: !!spec.plainName,
    osrsId: spec.osrsId || null,
  };
  if (rng() < 0.5) {
    const found = giveFound(spoop, makeItem(spoop, rng, spec));
    return { found, text: found.text };
  }
  const price = Math.max(1, Math.round(itemValue(preview) * ACTIVITY_GOLD));
  const name = itemDisplayName(preview);
  spoop.gold += price;
  return { found: null, text: `Took ${price.toLocaleString('en-US')} gold instead of ${article(name)} ${name}.` };
}

function finishQuest(spoop, quest, ev, sameHour) {
  if (!Array.isArray(spoop.quests)) spoop.quests = [];
  if (!spoop.quests.includes(quest.id)) spoop.quests.push(quest.id);
  spoop.questHoursLeft = 0;
  spoop.questGap = 1;
  const rewards = resolveQuestXp(spoop.skills, quest);
  const { notes, gains } = applyQuestXp(spoop, rewards);
  spoop.activitySkills = gains.map((row) => row.id);
  const reward = questReward(spoop, quest, ev);
  const xpBody = notes.length ? notes.join('. ') + '.' : 'Nothing they train went up.';
  const lead = sameHour
    ? `Started ${quest.name} and finished it.`
    : `Finished ${quest.name}.`;
  const text = `${clockLabel(ev.when)} — ${lead} ${xpBody} ${reward.text}`;
  pushLog(spoop, ev.when, text);
  const levels = notes.filter((line) => line.includes('now level'));
  const extra = reward.found ? [] : [reward.text];
  return discordAction(ev.when, lead, reward.found ? [reward.found] : [], levels.concat(extra), gains);
}

function beginQuest(spoop, quest, ev) {
  const hours = quest.hours > 1 ? quest.hours : 1;
  spoop.activityId = 'quest:' + quest.id;
  spoop.activitySince = ev.when.toISOString();
  spoop.activitySkills = null;
  spoop.questHours = hours;
  spoop.questHoursLeft = hours - 1;
  spoop.clueHoursLeft = 0;
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

// Spare gear: uniques and megarares stay, and so does the best piece they cannot wear yet.
// Anything no better than what they have on can go to the GE.
function extraBankItems(spoop) {
  const bank = Array.isArray(spoop.bank) ? spoop.bank : [];
  const keep = new Set();
  const bestUpgrade = {};
  for (const item of bank) {
    if (item.unique || item.mega) {
      keep.add(item.id);
      continue;
    }
    const worn = spoop.equipped && spoop.equipped[item.slot];
    if (worn && !isBetterItem(item, worn)) continue;
    const prev = bestUpgrade[item.slot];
    if (!prev || isBetterItem(item, prev)) bestUpgrade[item.slot] = item;
  }
  for (const item of Object.values(bestUpgrade)) keep.add(item.id);
  return bank.filter((item) => !keep.has(item.id));
}

function canAffordTierCrate(spoop) {
  const tierId = bestTierForCombat(combatLevel(spoop)).id;
  return metalCrates().some((crate) => crate.tier === tierId && crate.shift === 0 && spoop.gold >= crate.cost);
}

function chooseCrate(spoop, rng) {
  const tierId = bestTierForCombat(combatLevel(spoop)).id;
  const options = metalCrates().filter((crate) => crate.tier === tierId && spoop.gold >= crate.cost);
  const plain = options.find((crate) => crate.shift === 0);
  const fine = options.find((crate) => crate.shift > 0);
  if (fine && plain && rng() < 0.3) return fine;
  return plain || fine || null;
}

function chooseErrand(spoop, rng) {
  const canCrate = canAffordTierCrate(spoop);
  const extras = autoSellOn(spoop) ? extraBankItems(spoop).length : 0;
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

function itemValue(item, wobble) {
  if (!item) return 0;
  const crate = metalCrates().find((row) => row.tier === item.tier && row.shift === 0);
  const cost = crate ? crate.cost : 100;
  const quality = GE_QUALITY[item.quality] || 1;
  const swing = wobble == null ? 1 : wobble;
  const mega = megaOf(item) ? 6 : 1;
  return Math.max(1, Math.round(cost * 0.08 * mega * quality * swing * GOLD_INTAKE));
}

function geSalePrice(item, rng) {
  return itemValue(item, 0.85 + rng() * 0.3);
}

function takeGearItem(spoop, itemId) {
  const wanted = String(itemId);
  const bank = Array.isArray(spoop.bank) ? spoop.bank : [];
  const banked = bank.find((row) => String(row.id) === wanted);
  if (banked) {
    spoop.bank = bank.filter((row) => String(row.id) !== wanted);
    return banked;
  }
  for (const slot of SLOTS) {
    const worn = spoop.equipped && spoop.equipped[slot];
    if (worn && String(worn.id) === wanted) {
      spoop.equipped[slot] = null;
      return worn;
    }
  }
  return null;
}

function sellBankItem(spoop, itemId, when) {
  const item = takeGearItem(spoop, itemId);
  if (!item) return { ok: false, error: 'That item is not in the bank.' };
  const price = itemValue(item);
  spoop.gold += price;
  const name = itemDisplayName(item);
  const sentence = `${spoop.name} sold ${article(name)} ${name} for ${price.toLocaleString('en-US')} gold.`;
  pushLog(spoop, when, `${clockLabel(when)} — ${sentence}`);
  return { ok: true, text: sentence, price, gold: spoop.gold };
}

function equipBankItem(spoop, itemId, when) {
  const bank = Array.isArray(spoop.bank) ? spoop.bank : [];
  const wanted = String(itemId);
  const item = bank.find((row) => String(row.id) === wanted);
  if (!item) return { ok: false, error: 'That item is not in the bank.' };
  if (!canWear(spoop, item)) {
    const req = wearRequirement(item);
    return { ok: false, error: req ? 'Needs ' + req.level + ' ' + req.skillName + '.' : 'They cannot wear that.' };
  }
  spoop.autoEquip = false;
  const current = spoop.equipped && spoop.equipped[item.slot];
  spoop.bank = bank.filter((row) => String(row.id) !== wanted);
  if (current) bankItem(spoop, current);
  delete item.storedAt;
  if (!spoop.equipped) spoop.equipped = emptyEquipped();
  spoop.equipped[item.slot] = item;
  const name = itemDisplayName(item);
  const sentence = current
    ? `${spoop.name} equipped ${article(name)} ${name} and banked ${article(itemDisplayName(current))} ${itemDisplayName(current)}.`
    : `${spoop.name} equipped ${article(name)} ${name}.`;
  pushLog(spoop, when, `${clockLabel(when)} — ${sentence}`);
  return { ok: true, text: sentence };
}

function unequipItem(spoop, itemId, when) {
  const wanted = String(itemId);
  let foundSlot = null;
  let item = null;
  for (const slot of SLOTS) {
    const worn = spoop.equipped && spoop.equipped[slot];
    if (worn && String(worn.id) === wanted) {
      foundSlot = slot;
      item = worn;
      break;
    }
  }
  if (!item) return { ok: false, error: 'That item is not equipped.' };
  spoop.autoEquip = false;
  spoop.equipped[foundSlot] = null;
  bankItem(spoop, item);
  const kept = spoop.bank.some((row) => row.id === item.id);
  const name = itemDisplayName(item);
  const sentence = kept
    ? `${spoop.name} took off ${article(name)} ${name}.`
    : `${spoop.name} took off ${article(name)} ${name}. The bank was full, so it was cleared.`;
  pushLog(spoop, when, `${clockLabel(when)} — ${sentence}`);
  return { ok: true, text: sentence };
}

function crateOutcome(found) {
  const text = found && found.text ? found.text : '';
  if (text.includes('Equipped')) return ' Equipped it.';
  if (text.includes('tossed')) return ' The bank kept better gear, so it was tossed.';
  if (text.includes('Needs ')) return ' Banked it. Needs ' + text.split('Needs ')[1];
  return '';
}

const CRATE_SLOT = {
  weapon: 'Weapon',
  shield: 'Shield',
  head: 'Helm',
  body: 'Body',
  legs: 'Legs',
  boots: 'Boots',
  gloves: 'Gloves',
  cape: 'Cape',
  neck: 'Amulet',
  ring: 'Ring',
  ammo: 'Ammo',
};

function crateDiscordText(crateName, found) {
  const item = found && found.item;
  const name = item ? itemDisplayName(item) : 'Something';
  const lines = ['✨ ' + crateName + ' bursts open.', '**' + name + '**'];
  if (found && found.outcome === 'equipped') {
    const slot = CRATE_SLOT[item && item.slot] || 'Gear';
    lines.push(slot + ': ' + (found.before || 'Nothing') + ' → ' + name);
  } else if (found && found.outcome === 'tossed') {
    lines.push('Tossed. The bank kept the better one.');
  } else if (found && found.outcome === 'locked') {
    const req = wearRequirement(item);
    lines.push(req ? 'Banked. Needs ' + req.level + ' ' + req.skillName + '.' : 'Banked.');
  } else {
    lines.push('Into the bank.');
  }
  return lines.join('\n');
}

function crateStatLine(label, value, suffix) {
  const n = Number(value) || 0;
  if (!n) return '';
  return label + ' ' + (n > 0 ? '+' : '') + n + (suffix || '');
}

function crateStatFields(item) {
  const bonuses = bonusesForItem(item);
  const attackLabels = { stab: 'Stab', slash: 'Slash', crush: 'Crush', magic: 'Magic', range: 'Range' };
  const column = (stats, labels, suffixFor) => Object.keys(labels)
    .map((key) => crateStatLine(labels[key], stats[key], suffixFor && suffixFor[key]))
    .filter(Boolean)
    .join('\n');
  const fields = [];
  const attack = column(bonuses.attack, attackLabels);
  const defence = column(bonuses.defence, attackLabels);
  const other = column(bonuses.other, {
    melee: 'Melee str',
    ranged: 'Ranged str',
    magic: 'Magic dmg',
    prayer: 'Prayer',
  }, { magic: '%' });
  if (attack) fields.push({ name: 'Attack', value: attack, inline: true });
  if (defence) fields.push({ name: 'Defence', value: defence, inline: true });
  if (other) fields.push({ name: 'Other', value: other, inline: true });
  return fields;
}

function crateDiscordCard(crateName, found) {
  const item = found && found.item;
  return {
    text: crateDiscordText(crateName, found),
    icon: item ? osrsIdFor(item) : null,
    stats: item ? crateStatFields(item) : [],
  };
}

function doCrateErrand(spoop, ev, rng) {
  const crate = chooseCrate(spoop, rng);
  if (!crate) return null;
  const notes = errandXp(spoop, rng, 'crate');
  beginErrand(spoop, errandById('errand:crate'), ev, notes);
  spoop.gold -= crate.cost;
  const prize = rollCratePrize(spoop, crate, rng);
  if (prize.mega || prize.lamp) {
    const count = prize.mega ? grantMegaChest(spoop) : grantLamp(spoop, prize.lamp);
    const got = prize.mega ? 'a megarare chest' : lampLine(prize.lamp);
    const sentence = `${spoop.name} spent ${crate.cost.toLocaleString('en-US')} gold and opened ${article(crate.name)} ${crate.name} and got ${got}.`;
    pushLog(spoop, ev.when, `${clockLabel(ev.when)} — ${sentence} ${notes.join('. ')}.`);
    const card = prize.mega ? megaChestDiscordCard(crate.name, count) : lampDiscordCard(crate.name, prize.lamp, count);
    return {
      kind: 'crate',
      text: discordAction(ev.when, sentence, [], [], notes.gains),
      discord: card.text,
      icon: card.icon,
      stats: card.stats,
    };
  }
  const winner = prize.item;
  const found = giveItem(spoop, winner);
  const itemName = itemDisplayName(winner);
  const sentence = `${spoop.name} spent ${crate.cost.toLocaleString('en-US')} gold and opened ${article(crate.name)} ${crate.name} and got ${article(itemName)} ${itemName}.`;
  const text = `${clockLabel(ev.when)} — ${sentence}${crateOutcome(found)} ${notes.join('. ')}.`;
  pushLog(spoop, ev.when, text);
  const card = crateDiscordCard(crate.name, found);
  return {
    kind: 'crate',
    text: discordAction(ev.when, sentence + crateOutcome(found), [], [], notes.gains),
    discord: card.text,
    icon: card.icon,
    stats: card.stats,
  };
}

function doGeErrand(spoop, ev, rng) {
  if (!autoSellOn(spoop)) return null;
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
  const next = chooseActivity(spoop, rng, true);
  spoop.activityId = next.id;
  spoop.activitySince = ev.when.toISOString();
  spoop.activitySkills = null;
  spoop.questHoursLeft = 0;
  spoop.clueHoursLeft = 0;
}

const CLUE_LOOT = {
  easy: [
    { tier: 'iron', weight: 34 },
    { tier: 'steel', weight: 32 },
    { tier: 'black', weight: 18 },
    { tier: 'mithril', weight: 12 },
    { tier: 'adamant', weight: 4 },
  ],
  medium: [
    { tier: 'adamant', weight: 48 },
    { tier: 'rune', weight: 42 },
    { tier: 'dragon', weight: 10 },
  ],
  hard: [
    { tier: 'rune', weight: 25 },
    { tier: 'dragon', weight: 55 },
    { tier: 'barrows', weight: 20 },
  ],
  expert: [
    { tier: 'dragon', weight: 35 },
    { tier: 'barrows', weight: 58 },
    { tier: 'raid', weight: 7 },
  ],
  elite: [
    { tier: 'barrows', weight: 82 },
    { tier: 'raid', weight: 18 },
  ],
  master: [
    { tier: 'barrows', weight: 62 },
    { tier: 'raid', weight: 38 },
  ],
};

const CLUE_RARE = {
  hard: [
    { kind: 'gilded', weight: 75 },
    { kind: 'armor', tier: 'barrows', quality: 'masterwork', weight: 25 },
  ],
  expert: [
    { kind: 'gilded', weight: 45 },
    { kind: 'armor', tier: 'barrows', quality: 'masterwork', weight: 40 },
    { kind: 'armor', tier: 'raid', quality: 'fine', weight: 15 },
  ],
  elite: [
    { kind: 'gilded', weight: 40 },
    { kind: 'armor', tier: 'barrows', quality: 'masterwork', weight: 35 },
    { kind: 'armor', tier: 'raid', quality: 'masterwork', weight: 15 },
    { kind: 'helm', weight: 10 },
  ],
  master: [
    { kind: 'gilded', weight: 25 },
    { kind: 'armor', tier: 'barrows', quality: 'masterwork', weight: 30 },
    { kind: 'armor', tier: 'raid', quality: 'masterwork', weight: 25 },
    { kind: 'helm', weight: 20 },
  ],
};

const GILDED = [
  { slot: 'head', baseId: 'full-helm', name: 'Gilded full helm', osrsId: 3486 },
  { slot: 'body', baseId: 'platebody', name: 'Gilded platebody', osrsId: 3481 },
  { slot: 'legs', baseId: 'platelegs', name: 'Gilded platelegs', osrsId: 3483 },
  { slot: 'shield', baseId: 'kiteshield', name: 'Gilded kiteshield', osrsId: 3488 },
];

const CLUE_ARMOR = ['platebody', 'platelegs', 'full-helm', 'kiteshield', 'boots'];

function rollClueRare(spoop, clue, rng) {
  const table = CLUE_RARE[clue.tier] || CLUE_RARE.hard;
  const roll = pickWeighted(rng, table, (row) => row.weight);
  if (roll.kind === 'gilded') {
    const piece = GILDED[Math.floor(rng() * GILDED.length)];
    const item = makeUnique(spoop, {
      slot: piece.slot,
      tier: 'rune',
      quality: 'masterwork',
      name: piece.name,
      style: null,
      osrsId: piece.osrsId,
    });
    item.baseId = piece.baseId;
    return giveFound(spoop, item);
  }
  if (roll.kind === 'helm') {
    const helms = NAMED_GEAR.filter((item) => item.tier === 'raid' && item.slot === 'head');
    const helm = helms[Math.floor(rng() * helms.length)] || CUSTOM_HELMS[CUSTOM_HELMS.length - 1];
    return giveFound(spoop, makeItem(spoop, rng, pieceSpec(helm, 'raid', 'masterwork')));
  }
  const ids = CLUE_ARMOR;
  const baseId = ids[Math.floor(rng() * ids.length)];
  const armor = ARMOR.find((row) => row.id === baseId) || ARMOR[0];
  const named = takeNamedPiece(rng, roll.tier, armor.slot);
  const spec = named
    ? pieceSpec(named, roll.tier, roll.quality)
    : pieceSpec(armor, roll.tier, roll.quality);
  return giveFound(spoop, makeItem(spoop, rng, spec));
}

function rollClueReward(spoop, clue, rng) {
  if (clue.rare && rng() < (clue.rareChance || 0)) return rollClueRare(spoop, clue, rng);
  const table = CLUE_LOOT[clue.tier] || CLUE_LOOT.easy;
  const band = pickWeighted(rng, table, (row) => row.weight);
  let quality = rollQuality(rng, clue.qualityShift || 0);
  if (clue.tier === 'master' && qualityIndex(quality.id) < QUALITIES.length - 1 && rng() < 0.55) {
    quality = QUALITIES[qualityIndex(quality.id) + 1];
  }
  return giveFound(spoop, makeItem(spoop, rng, randomPiece(rng, band.tier, quality.id, spoop)));
}

function cluePayout(spoop, clue, rng) {
  const hours = clue.hours > 1 ? clue.hours : 1;
  let xp = 0;
  let gold = 0;
  for (let i = 0; i < hours; i++) {
    xp += 18 + Math.floor(rng() * 28);
    gold += clue.gold + Math.floor(rng() * Math.max(1, clue.gold));
  }
  xp = Math.max(1, Math.floor(xp * XP_TIMESCALE * TRAIN_SHARE * xpRamp(levelForXp(spoop.skills[clue.skill] || 0))));
  gold = Math.max(1, Math.round(gold * TRAIN_SHARE * GOLD_INTAKE));
  return { xp, gold };
}

function finishClue(spoop, clue, ev) {
  const rng = mulberry32(hashString(`${spoop.name}|clue-reward|${clue.id}|${ev.when.toISOString()}`));
  const pay = cluePayout(spoop, clue, rng);
  const notes = grantXp(spoop, clue.skill, pay.xp);
  spoop.gold += pay.gold;
  spoop.activitySkills = notes.gains.map((row) => row.id);
  spoop.clueHoursLeft = 0;
  const found = rollClueReward(spoop, clue, rng);
  const lead = `Finished ${article(clue.label)} ${clue.label}.`;
  const lamp = lampDrop(spoop, 'clue', ev.when);
  const text = `${clockLabel(ev.when)} — ${lead} ${notes.join('. ')}. +${pay.gold.toLocaleString('en-US')} gold. ${found.text}${lamp ? ' ' + lamp.text : ''}`;
  pushLog(spoop, ev.when, text);
  const side = [`+${pay.gold.toLocaleString('en-US')} gold.`];
  if (lamp) side.push('🪔 ' + lamp.text);
  return discordAction(ev.when, lead, [found], side, notes.gains);
}

function beginClue(spoop, clue, ev) {
  const hours = clue.hours > 1 ? clue.hours : 1;
  spoop.activityId = clue.id;
  spoop.activitySince = ev.when.toISOString();
  spoop.activitySkills = null;
  spoop.questHoursLeft = 0;
  spoop.clueHours = hours;
  spoop.clueHoursLeft = hours - 1;
  if (hours <= 1) return finishClue(spoop, clue, ev);
  const text = `${clockLabel(ev.when)} — Started ${article(clue.label)} ${clue.label}.`;
  pushLog(spoop, ev.when, text);
  return text;
}

function continueClue(spoop, clue, ev) {
  spoop.clueHoursLeft -= 1;
  if (spoop.clueHoursLeft > 0) {
    const text = `${clockLabel(ev.when)} — Still on ${article(clue.label)} ${clue.label}.`;
    pushLog(spoop, ev.when, text);
    return text;
  }
  return finishClue(spoop, clue, ev);
}

function doTrainingTick(state, spoop, ev) {
  if (spoop.clueHoursLeft > 0) {
    const clue = clueById(spoop.activityId);
    if (clue) return continueClue(spoop, clue, ev);
    spoop.clueHoursLeft = 0;
  }
  if (spoop.questHoursLeft > 0) {
    const underway = questByActivity(spoop.activityId);
    if (underway) return continueQuest(spoop, underway, ev);
    spoop.questHoursLeft = 0;
  }
  let afterQuest = false;
  if (spoop.questGap > 0) {
    spoop.questGap -= 1;
    afterQuest = true;
  } else {
    const questRng = mulberry32(hashString(`${spoop.name}|quest|${ev.when.toISOString()}`));
    const offer = bestQuest(spoop.skills, combatLevel(spoop), spoop.quests);
    if (offer && questRng() < offer.chance) return beginQuest(spoop, offer.quest, ev);
  }
  const eventRng = mulberry32(hashString(`${spoop.name}|random|${ev.when.toISOString()}`));
  if (!afterQuest && eventRng() < RANDOM_EVENT_CHANCE) {
    if (questByActivity(spoop.activityId)) leaveQuest(spoop, ev);
    return doRandomEvent(spoop, ev, eventRng);
  }
  if (!afterQuest && !(spoop.lessonTicksLeft > 0)) {
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
  if (next.clue) return beginClue(spoop, next, ev);
  spoop.activityId = next.id;
  spoop.activitySkills = null;
  spoop.questHoursLeft = 0;
  spoop.clueHoursLeft = 0;
  if (swapped) spoop.activitySince = ev.when.toISOString();
  if (spoop.lessonTicksLeft > 0) spoop.lessonTicksLeft -= 1;
  if (next.boss) return doBossAttempt(spoop, next, ev, rng);
  const skillLevel = levelForXp(spoop.skills[next.skill] || 0);
  let xp = (18 + Math.floor(rng() * 28)) * XP_TIMESCALE * TRAIN_SHARE;
  xp *= xpRamp(skillLevel);
  const pace = next.xpRate > 0 && next.xpRate < 1 ? next.xpRate : 1;
  xp = Math.max(1, Math.floor(xp * pace));
  const notes = grantXp(spoop, next.skill, xp);
  let gold = workGold(next, next.gold + Math.floor(rng() * Math.max(1, next.gold)));
  let skillingExtra = 0;
  if (next.style === 'skilling') {
    const paid = Math.max(gold, Math.round(gold * skillingGoldScale(combatLevel(spoop), next.money)));
    skillingExtra = paid - gold;
    gold = paid;
  }
  spoop.gold += gold;
  const verb = swapped ? `Wandered off to ${next.name}` : `Kept at ${next.name}`;
  const extraNote = skillingExtra ? ` Skilling paid ${skillingExtra} extra.` : '';
  const text = `${clockLabel(ev.when)} — ${verb}. ${notes.join('. ')}. +${gold} gold.${extraNote}`;
  pushLog(spoop, ev.when, text);
  const loot = rollTickLoot(spoop, rng);
  if (loot) pushLog(spoop, ev.when, `${clockLabel(ev.when)} — ${loot.text}`);
  const found = loot ? [loot] : [];
  const side = [];
  if (skillingExtra) side.push('Skilling paid ' + skillingExtra.toLocaleString('en-US') + ' extra gold.');
  const lamp = next.style === 'skilling' ? null : lampDrop(spoop, 'monster', ev.when);
  if (lamp) {
    pushLog(spoop, ev.when, `${clockLabel(ev.when)} — ${lamp.text}`);
    side.push('🪔 ' + lamp.text);
  }
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

// Tonight starts at 40,000. Each later night adds 10,000, until the pot holds at 250,000.
const PURSE_START_DAY = '2026-11-15';
const PURSE_START = 40000;
const PURSE_DAILY = 10000;
const PURSE_FLAT_DAY = '2026-11-23';
const PURSE_FLAT = 250000;

function dailyPurse(when) {
  const day = etDayKey(when instanceof Date ? when : new Date(when));
  if (day >= PURSE_FLAT_DAY) return PURSE_FLAT;
  const start = Date.parse(PURSE_START_DAY + 'T00:00:00Z');
  const current = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(current)) return PURSE_START;
  const days = Math.round((current - start) / 86400000);
  if (days < 0) return TOURNAMENT_POT;
  return PURSE_START + days * PURSE_DAILY;
}

// A one-night purse on the state. A dated night plan wins, then that purse, then the daily climb.
function arenaPurse(when, state) {
  if (when) {
    const planned = arenaNightPlan(when).pot;
    if (planned > 0) return planned;
  }
  const next = Number(state && state.arenaPotNext);
  if (next > 0) return Math.round(next);
  if (when) return dailyPurse(when);
  return TOURNAMENT_POT;
}

function takeArenaPot(state, when) {
  const pot = arenaPurse(when, state);
  if (state && state.arenaPotNext != null) state.arenaPotNext = null;
  return pot;
}

function previewArenaPot(state, when) {
  const moment = when || new Date(state.clock);
  const upcoming = nextArenaAfter(moment, state);
  const at = upcoming ? upcoming.when : moment;
  const roster = Object.values(state.spoops || {})
    .filter((spoop) => spoop && new Date(spoop.born) <= at);
  if (roster.length < 2) return null;
  const avg = roster.reduce((sum, spoop) => sum + combatLevel(spoop), 0) / roster.length;
  return { gold: arenaPurse(at, state), avgLevel: Math.round(avg), count: roster.length };
}

function arenaPayouts(pot, count) {
  const amounts = new Array(count).fill(0);
  if (count === 0) return amounts;
  if (count === 1) {
    amounts[0] = pot;
    return amounts;
  }
  const second = Math.floor(pot * 0.2);
  const third = count >= 3 ? Math.floor(pot * 0.1) : 0;
  amounts[0] = pot - second - third;
  amounts[1] = second;
  if (count >= 3) amounts[2] = third;
  return amounts;
}

function payArenaPlace(spoop, ev, place, total, payout, eventName) {
  const combat = combatLevel(spoop);
  const won = place === 1;
  const eventTitle = eventName || 'Spoopfight';
  const prize = Math.max(0, Math.round(payout));
  if (prize > 0) spoop.gold += prize;
  const style = gearBonuses(spoop).style;
  const skill = style === 'ranged' ? 'ranged' : style === 'magic' ? 'magic' : 'strength';
  const xpNotes = grantXp(spoop, skill, Math.max(1, Math.floor((won ? 30 : 12) * XP_TIMESCALE * xpRamp(levelForXp(spoop.skills[skill] || 0)))));
  if (won) spoop.arenaWins += 1;
  else spoop.arenaLosses += 1;
  const purseNote = prize > 0 ? `Took ${prize.toLocaleString('en-US')} from the pot. ` : '';
  const text = `${clockLabel(ev.when)} — ${eventTitle}, place ${place} of ${total}. ${purseNote}${xpNotes.join('. ')}. +${prize.toLocaleString('en-US')} gold.`;
  pushLog(spoop, ev.when, text);
  spoop.fights.unshift({
    at: ev.when.toISOString(),
    opponent: eventTitle,
    won,
    gold: prize,
    place,
    lines: [],
    summary: text,
  });
  if (spoop.fights.length > 8) spoop.fights.length = 8;
  return { place, name: spoop.name, gold: prize, payout: prize, won, combat, text };
}

function arenaGold(net) {
  const value = Number(net) || 0;
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return sign + Math.abs(value).toLocaleString('en-US') + ' gold';
}

function joinNames(list) {
  const names = (list || []).filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' and ' + names[1];
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

// The wrap-up after the per-boss posts: how it ended, the totals, and the awards.
function raidRecapLine(last) {
  const raid = (last && last.raid) || {};
  const rooms = raid.rooms || [];
  const killed = [];
  const drops = [];
  let gold = 0;
  let fellTo = '';
  rooms.forEach((room) => {
    if (room && room.kind === 'treasure') {
      gold += (room.shares || []).reduce((sum, row) => sum + (Number(row.gold) || 0), 0);
      return;
    }
    const loot = room && room.bout && room.bout.loot;
    if (!room || room.kind !== 'fight') return;
    if (!loot || loot.wiped) {
      fellTo = (room.boss && room.boss.name) || 'the raid';
      return;
    }
    const boss = room.boss || {};
    if (!boss.skirmish && boss.name) killed.push(boss.name);
    gold += (loot.shares || []).reduce((sum, row) => sum + (Number(row.gold) || 0), 0);
    if (loot.drop && loot.drop.name && loot.spooply && loot.spooply.name) drops.push(loot.spooply.name + ' (' + loot.drop.name + ')');
  });
  if (!killed.length) return 'The party fell to ' + (fellTo || 'the raid') + ' before a kill.';
  const layers = (raid.map && raid.map.layers) || 0;
  const reached = (raid.route || []).length;
  const lines = [raid.cleared
    ? 'The party cleared ' + (raid.name || 'the raid') + '.'
    : 'The party fell to ' + (fellTo || 'the raid') + (layers ? ', ' + reached + ' of ' + layers + ' rooms deep.' : '.')];
  lines.push('Bosses killed: ' + joinNames(killed) + '. ' + goldText(gold) + ' handed out.');
  if (drops.length) lines.push('Drops: ' + drops.join(', ') + '.');
  const awards = (raid.awards || []).map((award) => award.name + ': ' + award.who);
  if (awards.length) lines.push(awards.join(' · '));
  return lines.join('\n');
}

function arenaDiscordText(last) {
  if (!last) return '';
  if (last.kind === 'raid') return raidRecapLine(last);
  const winner = last.winner || 'Nobody';
  const tourney = last.kind === 'tournament';
  let head = winner + (tourney ? ' won the Tournament.' : ' won the Spoopfight.');
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

// Same waits as public/js/arena.js. A night's reveal stays up until the show ends.
const TOURNEY_SHOW = {
  titleIn: 550,
  titleHold: 5000,
  titleOut: 700,
  entrance: 2000,
  bye: 900,
  hold: 15000,
  versus: 2900,
  intro: 2000,
  call: 720,
  win: 700,
  advance: 900,
  after: 400,
  bestFlash: 1400,
  score: 3000,
  bracketHold: 3000,
  crown: 20000,
};

function largestPow2AtMost(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function shuffleList(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = arr[i];
    arr[i] = arr[j];
    arr[j] = swap;
  }
  return arr;
}

function sideRoundName(incoming, outgoing) {
  if (outgoing === 1) return 'Semifinal';
  const power = largestPow2AtMost(incoming) === incoming;
  if (!power) return 'Play-in';
  if (outgoing === 2) return 'Quarterfinal';
  if (incoming === 8) return 'Round of 16';
  return 'Round of ' + incoming;
}

function tournamentShowMs(playerCount, byeCount, matches) {
  let ms = TOURNEY_SHOW.titleIn + TOURNEY_SHOW.titleHold + TOURNEY_SHOW.titleOut;
  ms += playerCount * TOURNEY_SHOW.entrance;
  if (byeCount) ms += TOURNEY_SHOW.bye;
  ms += TOURNEY_SHOW.hold;
  const list = matches || [];
  list.forEach((match, index) => {
    const games = match.games && match.games.length ? match.games : [match];
    ms += TOURNEY_SHOW.versus;
    if (match.bestOf) ms += TOURNEY_SHOW.bestFlash;
    games.forEach((game, gameIndex) => {
      if (gameIndex) ms += TOURNEY_SHOW.score;
      ms += 2 * TOURNEY_SHOW.intro + TOURNEY_SHOW.call;
      ms += fightPlaybackMs(game.bout.duration, ARENA_PLAY_SPEED * 2);
    });
    ms += TOURNEY_SHOW.win + TOURNEY_SHOW.advance;
    const last = index === list.length - 1;
    ms += last ? TOURNEY_SHOW.bracketHold + TOURNEY_SHOW.crown : TOURNEY_SHOW.after;
  });
  if (!list.length) ms += TOURNEY_SHOW.bracketHold + TOURNEY_SHOW.crown;
  return ms;
}

function tourneyPayouts(pot, roles) {
  const amounts = roles.map(() => 0);
  const champ = roles.indexOf('champion');
  if (champ < 0) return amounts;
  const finalistCut = roles.includes('finalist') ? Math.floor(pot * 0.2) : 0;
  const semis = [];
  roles.forEach((role, i) => { if (role === 'semi') semis.push(i); });
  const semiPool = semis.length ? Math.floor(pot * 0.1) : 0;
  const semiEach = semis.length ? Math.floor(semiPool / semis.length) : 0;
  const semiPaid = semiEach * semis.length;
  amounts[champ] = pot - finalistCut - semiPaid;
  const finalist = roles.indexOf('finalist');
  if (finalist >= 0) amounts[finalist] = finalistCut;
  semis.forEach((i) => { amounts[i] = semiEach; });
  return amounts;
}

function viewRounds(rounds, slotById) {
  return rounds.map((round) => ({
    name: round.name,
    groups: round.matches.map((match) => ({
      bye: !!match.bye,
      slots: (match.bye ? [match.a] : [match.a, match.b]).map((id) => {
        const slot = slotById.get(id);
        return {
          id: slot.id,
          playerId: slot.playerId || null,
          byePlayerId: slot.byePlayerId || null,
        };
      }),
    })),
  }));
}

function buildSide(entries, side, centerSlot, slotById) {
  const rounds = [];
  if (!entries.length) return rounds;
  let slots = entries.map((entry, i) => {
    const slot = { id: side + 'o' + i, playerId: entry.id, byePlayerId: null };
    slotById.set(slot.id, slot);
    return slot;
  });
  if (slots.length === 1) {
    centerSlot.byePlayerId = slots[0].playerId;
    rounds.push({
      name: 'Bye',
      side,
      matches: [{ bye: true, a: slots[0].id, b: null, winnerTo: centerSlot.id, playerId: slots[0].playerId }],
    });
    return rounds;
  }
  let guard = 0;
  while (slots.length > 1 && guard < 8) {
    guard += 1;
    const power = largestPow2AtMost(slots.length);
    const shrinking = slots.length === power;
    const pairMatches = shrinking ? slots.length / 2 : slots.length - power;
    const byeCount = shrinking ? 0 : power - pairMatches;
    const matches = [];
    const next = [];
    let cursor = 0;
    const toCenter = pairMatches + byeCount === 1;
    for (let p = 0; p < pairMatches; p++) {
      const a = slots[cursor++];
      const b = slots[cursor++];
      let destId;
      if (toCenter) destId = centerSlot.id;
      else {
        const dest = { id: side + 'r' + guard + 'w' + p, playerId: null, byePlayerId: null };
        slotById.set(dest.id, dest);
        destId = dest.id;
        next.push(dest);
      }
      matches.push({ bye: false, a: a.id, b: b.id, winnerTo: destId });
    }
    for (let b = 0; b < byeCount; b++) {
      const a = slots[cursor++];
      const dest = { id: side + 'r' + guard + 'b' + b, playerId: null, byePlayerId: a.playerId };
      slotById.set(dest.id, dest);
      matches.push({ bye: true, a: a.id, b: null, winnerTo: dest.id, playerId: a.playerId });
      next.push(dest);
    }
    const outgoing = toCenter ? 1 : next.length;
    rounds.push({ name: sideRoundName(slots.length, outgoing), side, matches });
    if (toCenter) break;
    slots = next;
  }
  return rounds;
}

function simulateTournament(roster, rng) {
  const shuffled = shuffleList(roster, rng);
  const cast = shuffled.map((spoop, i) => {
    const portrait = arenaPortrait(spoop, 'p' + i);
    return {
      id: portrait.id,
      spoop,
      name: portrait.name,
      combat: portrait.combat,
      equipped: portrait.equipped,
      maxHp: portrait.maxHp,
    };
  });
  const castById = new Map(cast.map((entry) => [entry.id, entry]));
  const slotById = new Map();
  const finalLeft = { id: 'FL', playerId: null, byePlayerId: null };
  const finalRight = { id: 'FR', playerId: null, byePlayerId: null };
  const champSlot = { id: 'champ', playerId: null, byePlayerId: null };
  slotById.set(finalLeft.id, finalLeft);
  slotById.set(finalRight.id, finalRight);
  slotById.set(champSlot.id, champSlot);
  const leftCount = Math.ceil(cast.length / 2);
  const leftRounds = buildSide(cast.slice(0, leftCount), 'L', finalLeft, slotById);
  const rightRounds = buildSide(cast.slice(leftCount), 'R', finalRight, slotById);
  const occupancy = new Map();
  slotById.forEach((slot, id) => {
    if (slot.playerId) occupancy.set(id, castById.get(slot.playerId));
  });
  const playable = [];
  const losers = [];

  function resolveRound(round, depth) {
    if (!round) return;
    for (const match of round.matches) {
      if (match.bye) {
        occupancy.set(match.winnerTo, castById.get(match.playerId));
        continue;
      }
      const a = occupancy.get(match.a);
      const b = occupancy.get(match.b);
      const bout = simulateArena([a.spoop, b.spoop], rng, 'duel');
      const winner = bout.winnerId === 'f1' ? b : a;
      const loser = winner === a ? b : a;
      occupancy.set(match.winnerTo, winner);
      playable.push({
        id: match.a + '-' + match.b,
        roundName: round.name,
        side: round.side,
        aId: a.id,
        bId: b.id,
        winnerId: winner.id,
        loserId: loser.id,
        winnerFrom: winner === a ? match.a : match.b,
        loserFrom: winner === a ? match.b : match.a,
        winnerTo: match.winnerTo,
        bout,
      });
      losers.push({ player: loser, depth, roundName: round.name });
    }
  }

  const maxRounds = Math.max(leftRounds.length, rightRounds.length);
  for (let i = 0; i < maxRounds; i++) {
    resolveRound(leftRounds[i], i);
    resolveRound(rightRounds[i], i);
  }
  const leftFinalist = occupancy.get(finalLeft.id);
  const rightFinalist = occupancy.get(finalRight.id);
  const games = [];
  let leftWins = 0;
  let rightWins = 0;
  while (leftFinalist && rightFinalist && leftWins < 2 && rightWins < 2) {
    const bout = simulateArena([leftFinalist.spoop, rightFinalist.spoop], rng, 'duel');
    const winner = bout.winnerId === 'f1' ? rightFinalist : leftFinalist;
    const loser = winner === leftFinalist ? rightFinalist : leftFinalist;
    if (winner === leftFinalist) leftWins += 1;
    else rightWins += 1;
    games.push({ winnerId: winner.id, loserId: loser.id, bout });
  }
  const champion = leftWins >= rightWins ? leftFinalist : rightFinalist;
  const finalist = champion === leftFinalist ? rightFinalist : leftFinalist;
  if (champion) occupancy.set(champSlot.id, champion);
  if (champion && finalist) {
    playable.push({
      id: 'final',
      roundName: 'Final',
      side: 'center',
      bestOf: 3,
      aId: leftFinalist.id,
      bId: rightFinalist.id,
      winnerId: champion.id,
      loserId: finalist.id,
      winnerFrom: champion === leftFinalist ? finalLeft.id : finalRight.id,
      loserFrom: champion === leftFinalist ? finalRight.id : finalLeft.id,
      winnerTo: champSlot.id,
      games,
      bout: games[0] ? games[0].bout : null,
    });
  }
  const semis = losers.filter((row) => row.roundName === 'Semifinal').map((row) => row.player);
  const rest = losers
    .filter((row) => row.roundName !== 'Semifinal')
    .sort((a, b) => b.depth - a.depth);
  const placeEntries = [champion, finalist].concat(semis, rest.map((row) => row.player)).filter(Boolean);
  const roles = placeEntries.map((entry, i) => {
    if (i === 0) return 'champion';
    if (i === 1) return 'finalist';
    if (semis.includes(entry)) return 'semi';
    return 'out';
  });
  const byes = [];
  [leftRounds, rightRounds].forEach((rounds) => {
    rounds.forEach((round) => {
      round.matches.forEach((match) => {
        if (match.bye) byes.push({ from: match.a, to: match.winnerTo, playerId: match.playerId });
      });
    });
  });
  const publicCast = cast.map((entry) => ({
    id: entry.id,
    name: entry.name,
    combat: entry.combat,
    equipped: entry.equipped,
    maxHp: entry.maxHp,
  }));
  const tournament = {
    pot: null,
    showMs: tournamentShowMs(cast.length, byes.length, playable),
    championId: champion ? champion.id : null,
    championGold: null,
    cast: publicCast,
    sides: {
      left: viewRounds(leftRounds, slotById),
      right: viewRounds(rightRounds, slotById),
    },
    center: {
      left: { id: finalLeft.id, playerId: null, byePlayerId: finalLeft.byePlayerId },
      right: { id: finalRight.id, playerId: null, byePlayerId: finalRight.byePlayerId },
      champ: { id: champSlot.id, playerId: null, byePlayerId: null },
    },
    byes,
    matches: playable,
  };
  return {
    tournament,
    places: placeEntries.map((entry) => entry.spoop),
    roles,
  };
}

function runFfaNight(state, ev, roster, plan) {
  const seed = hashString('nightly|' + ev.when.toISOString() + '|' + roster.map((s) => s.name).join('|'));
  const bout = simulateArena(roster, mulberry32(seed), plan.formation);
  const byFighter = new Map(roster.map((spoop, i) => ['f' + i, spoop]));
  const placed = [];
  const seen = new Set();
  for (const id of arenaPlacement(bout)) {
    const spoop = byFighter.get(id);
    if (!spoop || seen.has(spoop)) continue;
    seen.add(spoop);
    placed.push(spoop);
  }
  for (const spoop of roster) {
    if (!seen.has(spoop)) placed.push(spoop);
  }
  const avgLevel = placed.reduce((sum, spoop) => sum + combatLevel(spoop), 0) / (placed.length || 1);
  const pot = takeArenaPot(state, ev.when);
  const payouts = arenaPayouts(pot, placed.length);
  const results = [];
  const notes = [];
  placed.forEach((spoop, index) => {
    const row = payArenaPlace(spoop, ev, index + 1, placed.length, payouts[index] || 0, 'Spoopfight');
    results.push({
      place: row.place,
      name: row.name,
      gold: row.gold,
      payout: row.payout,
      won: row.won,
      combat: row.combat,
    });
    notes.push({ name: row.name, kind: 'arena', text: row.text });
  });
  const kills = (bout.deaths || [])
    .map((death) => ({ winner: byFighter.get(death.by), loser: byFighter.get(death.id) }))
    .filter((row) => row.winner && row.loser && row.winner !== row.loser)
    .map((row) => Object.assign(row, {
      kind: 'spoopfight',
      winnerCombat: combatLevel(row.winner),
      loserCombat: combatLevel(row.loser),
    }));
  const drama = social.noteArena(state, {
    kind: 'spoopfight',
    fights: kills,
    champion: placed[0] || null,
    championCombat: placed[0] ? combatLevel(placed[0]) : 0,
    field: placed,
    avgCombat: avgLevel,
    when: ev.when,
    log: pushLog,
  });
  state.lastArena = {
    at: ev.when.toISOString(),
    label: formatEt(ev.when),
    kind: 'spoopfight',
    drama,
    formation: bout.formation,
    winner: results[0] ? results[0].name : null,
    pot,
    avgLevel: Math.round(avgLevel),
    results,
    bout,
    tournament: null,
  };
  state.lastArena.text = arenaDiscordText(state.lastArena);
  state.lastArena.revealAt = fightRevealAt(ev.when, bout.duration, ARENA_PLAY_SPEED);
  state.lastArena.needsPost = true;
  return notes;
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
  const plan = arenaNightPlan(ev.when);
  if (plan.kind === 'ffa') return runFfaNight(state, ev, roster, plan);
  if (plan.kind === 'raid') return runRaidNight(state, ev, roster);
  const seed = hashString('nightly|' + ev.when.toISOString() + '|' + roster.map((s) => s.name).join('|'));
  const tourney = simulateTournament(roster, mulberry32(seed));
  const placed = tourney.places.filter(Boolean);
  const avgLevel = placed.reduce((sum, spoop) => sum + combatLevel(spoop), 0) / (placed.length || 1);
  const pot = takeArenaPot(state, ev.when);
  const payouts = tourneyPayouts(pot, tourney.roles);
  const results = [];
  const notes = [];
  tourney.tournament.pot = pot;
  tourney.tournament.championGold = payouts[0] || 0;
  placed.forEach((spoop, index) => {
    const row = payArenaPlace(spoop, ev, index + 1, placed.length, payouts[index] || 0, 'Tournament');
    results.push({
      place: row.place,
      name: row.name,
      gold: row.gold,
      payout: row.payout,
      won: row.won,
      combat: row.combat,
    });
    notes.push({ name: row.name, kind: 'arena', text: row.text });
  });
  const byName = new Map(roster.map((spoop) => [spoop.name, spoop]));
  const castSpoop = new Map(tourney.tournament.cast.map((row) => [row.id, byName.get(row.name)]));
  const matchFights = [];
  for (const match of tourney.tournament.matches || []) {
    const games = match.games && match.games.length ? match.games : [match];
    for (const game of games) {
      const winner = castSpoop.get(game.winnerId);
      const loser = castSpoop.get(game.loserId);
      if (!winner || !loser) continue;
      matchFights.push({
        winner,
        loser,
        kind: 'tournament',
        round: match.roundName,
        winnerCombat: combatLevel(winner),
        loserCombat: combatLevel(loser),
      });
    }
  }
  const drama = social.noteArena(state, {
    kind: 'tournament',
    fights: matchFights,
    champion: placed[0] || null,
    championCombat: placed[0] ? combatLevel(placed[0]) : 0,
    field: placed,
    avgCombat: avgLevel,
    when: ev.when,
    log: pushLog,
  });
  state.lastArena = {
    at: ev.when.toISOString(),
    label: formatEt(ev.when),
    kind: 'tournament',
    drama,
    winner: results[0] ? results[0].name : null,
    pot,
    avgLevel: Math.round(avgLevel),
    results,
    bout: null,
    tournament: tourney.tournament,
    showMs: tourney.tournament.showMs,
  };
  state.lastArena.text = arenaDiscordText(state.lastArena);
  state.lastArena.revealAt = new Date(Math.max(ev.when.getTime(), Date.now()) + tourney.tournament.showMs).toISOString();
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
  const gold = Math.round((won ? 25 + combat * 2 : 8 + combat) * GOLD_INTAKE);
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

function rollCratePiece(spoop, rng, tierId, shift) {
  const quality = rollQuality(rng, shift);
  return makeItem(spoop, rng, randomPiece(rng, tierId, quality.id, spoop, shift));
}

function rollStyleCratePiece(spoop, rng, crate) {
  const pool = crate.items || [];
  const piece = pool[Math.floor(rng() * pool.length)];
  const quality = rollQuality(rng, crate.shift || 0);
  return makeItem(spoop, rng, pieceSpec(piece, piece.tier, quality.id, piece.slot));
}

function nearbyTier(rng, tierId) {
  const ids = TIERS.map((t) => t.id);
  const i = ids.indexOf(tierId);
  const roll = rng();
  if (roll < 0.14 && i > 0) return ids[i - 1];
  if (roll > 0.88 && i >= 0 && i < ids.length - 1) return ids[i + 1];
  return tierId;
}

function megaChestCount(spoop) {
  return Math.max(0, Math.floor(Number(spoop && spoop.megaChests) || 0));
}

function rollsMegaChest(crate, rng) {
  return !!(crate && crate.mega > 0) && rng() < crate.mega;
}

function grantMegaChest(spoop) {
  spoop.megaChests = megaChestCount(spoop) + 1;
  return spoop.megaChests;
}

// The chest as a reel card. It is not gear, so it has no id or stats.
function megaChestCard() {
  return { id: null, chest: true, mega: true, name: MEGA_CHEST.name, osrsId: MEGA_CHEST.osrsId, quality: 'masterwork' };
}

function megaChestDiscordCard(crateName, count) {
  return {
    text: [
      '✨ ' + crateName + ' bursts open.',
      '**🌟 ' + MEGA_CHEST.name + ' 🌟**',
      count > 1 ? 'Into the inventory. ' + count + ' waiting to be opened.' : 'Into the inventory, waiting to be opened.',
    ].join('\n'),
    icon: MEGA_CHEST.osrsId,
    stats: [],
  };
}

// Every crate except the lamp chest pays a lamp this often instead of gear.
const LAMP_CHANCE = 0.01;

function lampById(id) {
  return XP_LAMPS.find((lamp) => lamp.id === id) || null;
}

function lampCount(spoop, id) {
  return Math.max(0, Math.floor(Number(spoop && spoop.lamps && spoop.lamps[id]) || 0));
}

function rollLamp(rng) {
  return pickWeighted(rng, XP_LAMPS, (lamp) => lamp.weight);
}

// Lamps off things other than crates. chance is per roll: per combat training
// tick, per boss kill, per finished clue, per spoop on a raid night.
const LAMP_DROPS = {
  monster: { chance: 0.01, weights: { tiny: 55, small: 30, medium: 12, large: 3 } },
  boss: { chance: 0.03, weights: { small: 30, medium: 35, large: 22, huge: 11, massive: 2 } },
  clue: { chance: 0.06, weights: { tiny: 20, small: 35, medium: 30, large: 12, huge: 3 } },
  raid: { chance: 0.05, weights: { large: 60, huge: 32, massive: 8 } },
};

// A lamp off a kill, a clue, or a raid. Its own seed, so the other rolls on that tick are unchanged.
function lampDrop(spoop, source, when) {
  const table = LAMP_DROPS[source];
  const rng = mulberry32(hashString(`${spoop.name}|lamp-${source}|${when.toISOString()}`));
  if (!table || rng() >= table.chance) return null;
  const pool = XP_LAMPS.filter((lamp) => table.weights[lamp.id] > 0);
  const lamp = pickWeighted(rng, pool, (row) => table.weights[row.id]);
  grantLamp(spoop, lamp);
  return { lamp, text: `Found ${lampLine(lamp)}. It went into the inventory.` };
}

function grantLamp(spoop, lamp) {
  if (!spoop.lamps || typeof spoop.lamps !== 'object') spoop.lamps = {};
  spoop.lamps[lamp.id] = lampCount(spoop, lamp.id) + 1;
  return spoop.lamps[lamp.id];
}

function lampCard(lamp) {
  return { id: null, lamp: lamp.id, name: lamp.name, osrsId: lamp.osrsId, xp: lamp.xp };
}

function lampLine(lamp) {
  const name = lamp.name.charAt(0).toLowerCase() + lamp.name.slice(1);
  return `${article(name)} ${name} (${lamp.xp.toLocaleString('en-US')} XP)`;
}

function lampDiscordCard(crateName, lamp, count) {
  return {
    text: [
      '✨ ' + crateName + ' bursts open.',
      '**🪔 ' + lamp.name + '**',
      lamp.xp.toLocaleString('en-US') + ' XP in one skill. ' +
        (count > 1 ? 'Into the inventory. ' + count + ' waiting to be rubbed.' : 'Into the inventory, waiting to be rubbed.'),
    ].join('\n'),
    icon: lamp.osrsId,
    stats: [],
  };
}

// One pull off a crate: a megarare chest, then a lamp, then gear. The reel and the prize both use it.
function rollCratePrize(spoop, crate, rng) {
  if (rollsMegaChest(crate, rng)) return { mega: true };
  if (crate.lamps || rng() < LAMP_CHANCE) return { lamp: rollLamp(rng) };
  if (crate.style) return { item: rollStyleCratePiece(spoop, rng, crate) };
  const tierId = nearbyTier(rng, crate.tier);
  return { item: rollCratePiece(spoop, rng, tierId, tierId === crate.tier ? crate.shift : 0) };
}

function prizeCard(prize) {
  if (prize.mega) return megaChestCard();
  if (prize.lamp) return lampCard(prize.lamp);
  return publicItem(prize.item);
}

function openCrate(spoop, crateId, when, rng) {
  const crate = crateById(crateId);
  if (!crate) return { ok: false, error: 'Unknown crate', cost: 0 };
  if (spoop.gold < crate.cost) return { ok: false, error: 'Need ' + crate.cost.toLocaleString() + ' gold', cost: crate.cost };
  spoop.gold -= crate.cost;
  const winIndex = 36;
  const reel = [];
  for (let i = 0; i < 56; i++) reel.push(prizeCard(rollCratePrize(spoop, crate, rng)));
  const roll = { crateId: crate.id, crateName: crate.name, cost: crate.cost, winIndex, reel };
  const prize = rollCratePrize(spoop, crate, rng);
  reel[winIndex] = prizeCard(prize);
  if (prize.mega || prize.lamp) {
    const count = prize.mega ? grantMegaChest(spoop) : grantLamp(spoop, prize.lamp);
    const detail = prize.mega
      ? 'A megarare chest. It went into the inventory.'
      : capWord(lampLine(prize.lamp)) + '. It went into the inventory.';
    const text = `${clockLabel(when)} — Spent ${crate.cost.toLocaleString()} gold on a ${crate.name}. ${detail}`;
    const card = prize.mega ? megaChestDiscordCard(crate.name, count) : lampDiscordCard(crate.name, prize.lamp, count);
    pushLog(spoop, when, text);
    return {
      ok: true,
      text,
      discord: card.text,
      icon: card.icon,
      stats: card.stats,
      cost: crate.cost,
      roll: Object.assign(roll, { winner: reel[winIndex], detail, mega: !!prize.mega, lamp: prize.lamp ? prize.lamp.id : null }),
    };
  }
  const winner = prize.item;
  const found = giveItem(spoop, winner);
  const detail = found.text;
  const text = `${clockLabel(when)} — Spent ${crate.cost.toLocaleString()} gold on a ${crate.name}. ${detail}`;
  const card = crateDiscordCard(crate.name, found);
  pushLog(spoop, when, text);
  reel[winIndex] = publicItem(winner);
  return {
    ok: true,
    text,
    discord: card.text,
    icon: card.icon,
    stats: card.stats,
    cost: crate.cost,
    roll: Object.assign(roll, { winner: publicItem(winner), detail }),
  };
}

// A lamp goes into one skill the owner picks. Hitpoints gets no share, unlike training.
function useLamp(spoop, lampId, skill, when) {
  const lamp = lampById(lampId);
  if (!lamp) return { ok: false, error: 'Unknown lamp.' };
  if (lampCount(spoop, lamp.id) < 1) return { ok: false, error: 'No ' + lamp.name + ' left.' };
  if (!SKILL_IDS.includes(skill)) return { ok: false, error: 'Pick a skill.' };
  if ((spoop.skills[skill] || 0) >= xpForLevel(MAX_LEVEL)) return { ok: false, error: 'That skill is already maxed.' };
  spoop.lamps[lamp.id] = lampCount(spoop, lamp.id) - 1;
  const before = levelForXp(spoop.skills[skill] || 0);
  const notes = grantXp(spoop, skill, lamp.xp, { noHitpoints: true });
  const after = levelForXp(spoop.skills[skill] || 0);
  const sentence = `${spoop.name} rubbed ${lampLine(lamp)}.`;
  const text = `${clockLabel(when)} — ${sentence} ${notes.join('. ')}.`;
  pushLog(spoop, when, text);
  const card = lampUseCard(lamp, skill, before, after);
  return { ok: true, text, discord: card.text, icon: lamp.osrsId, stats: card.stats };
}

function lampUseCard(lamp, skill, before, after) {
  const skillName = SKILLS.find((s) => s.id === skill).name;
  const lines = [
    '**🪔 ' + lamp.name + '**',
    'The lamp flares, and ' + lamp.xp.toLocaleString('en-US') + ' XP pours into ' + skillName + '.',
  ];
  if (after > before) lines.push('⬆️ **' + skillName + ' is now level ' + after + '!**');
  return {
    text: lines.join('\n'),
    stats: [
      { name: '📈 Skill', value: '**' + skillName + '**', inline: true },
      { name: '✨ XP', value: '**+' + lamp.xp.toLocaleString('en-US') + '**', inline: true },
      { name: '🎯 Level', value: '**' + (after > before ? before + ' → ' + after : String(after)) + '**', inline: true },
    ],
  };
}

function megaSpec(rng) {
  const piece = pickWeighted(rng, MEGA_RARES, (row) => row.weight || 1);
  return pieceSpec(piece, 'raid', rollQuality(rng, 2).id);
}

// A chest spends nothing. It rolls the megarare table once, with the crate reel.
function openMegaChest(spoop, when, rng, state) {
  if (megaChestCount(spoop) < 1) return { ok: false, error: 'No megarare chest to open.' };
  spoop.megaChests = megaChestCount(spoop) - 1;
  const winIndex = 36;
  const reel = [];
  for (let i = 0; i < 56; i++) reel.push(publicItem(Object.assign({ id: null }, megaSpec(rng))));
  const winner = makeItem(spoop, rng, megaSpec(rng));
  const found = giveItem(spoop, winner);
  const detail = found.text;
  const text = `${clockLabel(when)} — Opened a megarare chest. ${detail}`;
  const card = crateDiscordCard(MEGA_CHEST.name, found);
  pushLog(spoop, when, text);
  if (state) social.noteMegaChest(state, { opener: spoop, item: itemDisplayName(winner), when, log: pushLog });
  reel[winIndex] = publicItem(winner);
  return {
    ok: true,
    text,
    discord: card.text,
    icon: card.icon,
    stats: card.stats,
    roll: {
      crateId: 'mega-chest',
      crateName: MEGA_CHEST.name,
      cost: 0,
      winIndex,
      winner: publicItem(winner),
      reel,
      detail,
      mega: true,
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

function duelAt(state, when) {
  if (when instanceof Date) return when;
  return new Date(state && state.clock ? state.clock : Date.now());
}

function duelRows(state) {
  if (!state || !Array.isArray(state.duels)) return [];
  return state.duels;
}

function ensureDuels(state) {
  if (!Array.isArray(state.duels)) state.duels = [];
  return state.duels;
}

function parseDuelGold(raw) {
  const parsed = Math.floor(Number(String(raw == null ? '' : raw).replace(/[,\s]/g, '')));
  if (!Number.isFinite(parsed) || parsed < DUEL_MIN) {
    return { ok: false, error: 'A duel has to be at least ' + DUEL_MIN.toLocaleString('en-US') + ' gold.' };
  }
  if (parsed > DUEL_MAX) {
    return { ok: false, error: 'A duel can\'t go above ' + DUEL_MAX.toLocaleString('en-US') + ' gold.' };
  }
  return { ok: true, gold: parsed };
}

function duelById(state, id) {
  const key = String(id || '');
  return duelRows(state).find((row) => String(row.id) === key) || null;
}

function removeDuel(state, duel) {
  state.duels = duelRows(state).filter((row) => row !== duel);
}

function giveGold(spoop, amount) {
  if (!spoop || !amount) return;
  spoop.gold = Math.floor(Number(spoop.gold) || 0) + amount;
}

function takeGold(spoop, amount) {
  const held = Math.floor(Number(spoop && spoop.gold) || 0);
  if (held < amount) return false;
  spoop.gold = held - amount;
  return true;
}

function issueDuel(state, from, targetKey, goldRaw, when) {
  const to = spoopByKey(state, targetKey);
  if (!from || !to) return { ok: false, error: 'That spoop is not here.' };
  if (to === from) return { ok: false, error: 'A spoop cannot challenge themself.' };
  const parsed = parseDuelGold(goldRaw);
  if (!parsed.ok) return parsed;
  const fromKey = spoopKey(state, from);
  const toKey = spoopKey(state, to);
  const open = duelRows(state).some((row) =>
    (row.fromKey === fromKey && row.toKey === toKey) ||
    (row.fromKey === toKey && row.toKey === fromKey)
  );
  if (open) return { ok: false, error: 'There is already a challenge between those two.' };
  if (!takeGold(from, parsed.gold)) {
    return { ok: false, error: from.name + ' does not have ' + parsed.gold.toLocaleString('en-US') + ' gold.' };
  }
  const at = duelAt(state, when);
  const id = String((state.duelSeq = (Number(state.duelSeq) || 0) + 1));
  ensureDuels(state).push({
    id,
    fromKey,
    toKey,
    gold: parsed.gold,
    at: at.toISOString(),
  });
  const purse = parsed.gold.toLocaleString('en-US');
  const stamp = clockLabel(at);
  pushLog(from, at, `${stamp} — Challenged ${to.name} to a duel for ${purse} gold.`);
  pushLog(to, at, `${stamp} — ${from.name} challenged them to a duel for ${purse} gold.`);
  const sides = duelSides(state, from.name, to.name);
  return {
    ok: true,
    text: `${from.name} challenged ${to.name} to a duel for ${purse} gold.`,
    challenge: {
      from: from.name,
      to: to.name,
      toKey,
      gold: parsed.gold,
      fromCombat: sides[0].combat,
      toCombat: sides[1].combat,
      fromOdds: sides[0].p,
    },
  };
}

function cancelDuel(state, from, id, when) {
  const duel = duelById(state, id);
  if (!duel) return { ok: false, error: 'That challenge is already gone.' };
  if (!from || spoopKey(state, from) !== duel.fromKey) {
    return { ok: false, error: 'Only the challenger can take that back.' };
  }
  const to = spoopByKey(state, duel.toKey);
  const at = duelAt(state, when);
  const purse = Number(duel.gold).toLocaleString('en-US');
  giveGold(from, duel.gold);
  removeDuel(state, duel);
  const stamp = clockLabel(at);
  pushLog(from, at, `${stamp} — Took back the duel challenge${to ? ' to ' + to.name : ''}. ${purse} gold returned.`);
  if (to) pushLog(to, at, `${stamp} — ${from.name} took back the duel challenge.`);
  return { ok: true, text: `${from.name} took back the challenge.` };
}

function declineDuel(state, to, id, when) {
  const duel = duelById(state, id);
  if (!duel) return { ok: false, error: 'That challenge is already gone.' };
  if (!to || spoopKey(state, to) !== duel.toKey) {
    return { ok: false, error: 'That challenge is not for this spoop.' };
  }
  const from = spoopByKey(state, duel.fromKey);
  const at = duelAt(state, when);
  const purse = Number(duel.gold).toLocaleString('en-US');
  giveGold(from, duel.gold);
  removeDuel(state, duel);
  const stamp = clockLabel(at);
  if (from) pushLog(from, at, `${stamp} — ${to.name} declined the duel. ${purse} gold returned.`);
  pushLog(to, at, `${stamp} — Declined ${from ? from.name : 'a spoop'}'s duel for ${purse} gold.`);
  return { ok: true, text: `${to.name} declined the duel.` };
}

function scheduleDuel(state, a, b, amount, when) {
  const at = when instanceof Date ? when : new Date(when);
  const fightAt = new Date(at.getTime() + PK_DELAY_MS);
  const purse = amount.toLocaleString('en-US');
  const text = `${a.name} and ${b.name} agreed to a duel. ${purse} gold each. They fight in 10 minutes.`;
  const watch = hashString('duel-watch|' + fightAt.toISOString() + '|' + spoopKey(state, a) + '|' + spoopKey(state, b)).toString(36);
  state.pk = {
    aKey: spoopKey(state, a),
    bKey: spoopKey(state, b),
    aName: a.name,
    bName: b.name,
    reason: 'Duel. ' + purse + ' gold each.',
    calledAt: at.toISOString(),
    fightAt: fightAt.toISOString(),
    text,
    needsPost: true,
    staked: true,
    stake: amount,
    pot: amount * 2,
    watch,
  };
  const stamp = clockLabel(at);
  pushLog(a, at, `${stamp} — ${b.name} accepted the duel. ${purse} gold each. The fight is in 10 minutes.`);
  pushLog(b, at, `${stamp} — Accepted ${a.name}'s duel. ${purse} gold each. The fight is in 10 minutes.`);
  return { kind: 'pk-call', name: 'Duel', fightAt: state.pk.fightAt, text };
}

function acceptDuel(state, to, id, when) {
  const duel = duelById(state, id);
  if (!duel) return { ok: false, error: 'That challenge is already gone.' };
  if (!to || spoopKey(state, to) !== duel.toKey) {
    return { ok: false, error: 'That challenge is not for this spoop.' };
  }
  if (state.pk) return { ok: false, error: 'A fight is already booked. This challenge can wait.' };
  const from = spoopByKey(state, duel.fromKey);
  if (!from || from === to) {
    removeDuel(state, duel);
    return { ok: false, error: 'The challenger is gone.' };
  }
  const purse = Number(duel.gold).toLocaleString('en-US');
  if (!takeGold(to, duel.gold)) {
    return { ok: false, error: to.name + ' needs ' + purse + ' gold to accept. The challenge stays open.' };
  }
  const at = duelAt(state, when);
  removeDuel(state, duel);
  const call = scheduleDuel(state, from, to, duel.gold, at);
  return { ok: true, text: call.text, call };
}

function presentDuels(state) {
  return duelRows(state).map((duel) => {
    const from = spoopByKey(state, duel.fromKey);
    const to = spoopByKey(state, duel.toKey);
    return {
      id: String(duel.id),
      fromKey: duel.fromKey,
      toKey: duel.toKey,
      from: from ? from.name : String(duel.fromKey || ''),
      to: to ? to.name : String(duel.toKey || ''),
      gold: Math.max(0, Math.floor(Number(duel.gold) || 0)),
      toGold: to ? Math.floor(Number(to.gold) || 0) : 0,
      at: duel.at || null,
    };
  }).filter((row) => row.gold >= DUEL_MIN && row.fromKey && row.toKey);
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
  const reason = social.pkReason(state, a, b) || PK_REASONS[Math.floor(rng() * PK_REASONS.length)];
  return { rolled: true, call: schedulePk(state, a, b, at, reason) };
}

function rememberFight(spoop, when, opponent, won, summary, gold) {
  if (!Array.isArray(spoop.fights)) spoop.fights = [];
  spoop.fights.unshift({
    at: when.toISOString(),
    opponent,
    won,
    gold: gold || 0,
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
  if (autoEquipOn(winner) && canWear(winner, item) && fitsBuild(item, combatBuild(winner))) {
    const current = winner.equipped[item.slot];
    if (betterForBuild(item, current, combatBuild(winner))) {
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

function refundStake(pk, a, b) {
  if (!pk || !pk.staked) return;
  const stake = Math.max(0, Math.floor(Number(pk.stake) || 0));
  if (!stake) return;
  if (a && a !== b) a.gold = Math.floor(Number(a.gold) || 0) + stake;
  if (b) b.gold = Math.floor(Number(b.gold) || 0) + stake;
}

function finishStakePk(state, pk, winner, loser, bout, due, fightAt) {
  const stake = Math.max(0, Math.floor(Number(pk.stake) || 0));
  const pot = Math.max(stake * 2, Math.floor(Number(pk.pot) || 0));
  const sides = duelSides(state, winner.name, loser.name);
  const winnerOdds = sides[0].p;
  winner.gold = Math.floor(Number(winner.gold) || 0) + pot;
  winner.arenaWins = (winner.arenaWins || 0) + 1;
  loser.arenaLosses = (loser.arenaLosses || 0) + 1;
  const purse = stake.toLocaleString('en-US');
  const winnerText = `${clockLabel(due)} — Won the duel against ${loser.name}. The purse was ${purse} gold each.`;
  const loserText = `${clockLabel(due)} — Lost the duel to ${winner.name}. The purse was ${purse} gold each.`;
  pushLog(winner, due, winnerText);
  pushLog(loser, due, loserText);
  rememberFight(winner, due, loser.name, true, winnerText, stake);
  rememberFight(loser, due, winner.name, false, loserText, -stake);
  const drama = social.notePk(state, {
    winner,
    loser,
    item: null,
    winnerCombat: combatLevel(winner),
    loserCombat: combatLevel(loser),
    when: due,
    log: pushLog,
  });
  let discord = `${winner.name} beat ${loser.name} in a duel and took the ${pot.toLocaleString('en-US')} gold purse.`;
  if (drama) discord += ' ' + drama;
  state.lastPk = {
    at: fightAt,
    label: formatEt(due),
    aName: pk.aName,
    bName: pk.bName,
    winner: winner.name,
    loser: loser.name,
    item: null,
    staked: true,
    stake,
    pot,
    winnerOdds,
    winnerRecord: [winner.arenaWins || 0, winner.arenaLosses || 0],
    loserRecord: [loser.arenaWins || 0, loser.arenaLosses || 0],
    winnerCombat: sides[0].combat,
    loserCombat: sides[1].combat,
    text: discord,
    needsPost: true,
    revealAt: duelRevealAt(fightAt, bout.duration),
    watch: pk.watch || '',
    bout,
  };
  rememberDuelWatch(state, state.lastPk);
  state.pk = null;
  return [{
    kind: 'pk-result',
    name: 'Duel',
    fightAt,
    text: discord,
  }];
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
    refundStake(pk, a, b);
    state.pk = null;
    return [];
  }
  if (pk.staked) {
    const rng = mulberry32(hashString('pk-fight|' + fightAt + '|' + pk.aKey + '|' + pk.bKey));
    const formation = pickArenaFormation(rng);
    const bout = simulateArena([a, b], rng, formation);
    const winner = pkWinnerSpoop(bout, a, b);
    const loser = winner === a ? b : a;
    return finishStakePk(state, pk, winner, loser, bout, due, fightAt);
  }
  const rng = mulberry32(hashString('pk-fight|' + fightAt + '|' + pk.aKey + '|' + pk.bKey));
  const formation = pickArenaFormation(rng);
  const bout = simulateArena([a, b], rng, formation);
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
  const drama = social.notePk(state, {
    winner,
    loser,
    item: taken ? taken.name : null,
    winnerCombat: combatLevel(winner),
    loserCombat: combatLevel(loser),
    when: due,
    log: pushLog,
  });
  let discord = taken
    ? `${winner.name} beat ${loser.name} and took ${taken.name}.`
    : `${winner.name} beat ${loser.name}. ${loser.name} had nothing equipped to take.`;
  if (drama) discord += ' ' + drama;
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

function duelRevealAt(fightAt, duration) {
  const end = new Date(fightRevealAt(fightAt, duration, DUEL_WATCH_SPEED)).getTime();
  return new Date(end + DUEL_WATCH_LEAD_MS + DUEL_REVEAL_SLACK_MS).toISOString();
}

function rememberDuelWatch(state, row) {
  if (!state || !row || !row.watch) return;
  if (!Array.isArray(state.duelWatch)) state.duelWatch = [];
  state.duelWatch = state.duelWatch.filter((item) => item && item.watch !== row.watch);
  state.duelWatch.unshift({
    watch: row.watch,
    at: row.at,
    revealAt: row.revealAt,
    aName: row.aName,
    bName: row.bName,
    winner: row.winner,
    loser: row.loser,
    stake: row.stake,
    pot: row.pot,
  });
  if (state.duelWatch.length > 8) state.duelWatch.length = 8;
}

// Same pricing as the arena odds board: gear plus combat, on an Elo-style curve.
function duelSides(state, aName, bName) {
  const byName = new Map();
  for (const spoop of Object.values(state.spoops || {})) {
    if (spoop && spoop.name) byName.set(String(spoop.name).toLowerCase(), spoop);
  }
  const side = (name) => {
    const spoop = byName.get(String(name || '').toLowerCase());
    if (!spoop) return { name: name || '', combat: 0, gear: 0, equipped: null, strength: 0 };
    const combat = combatLevel(spoop);
    const gear = equippedGearRating(spoop);
    return {
      name: spoop.name,
      combat,
      gear,
      equipped: Object.fromEntries(SLOTS.map((slot) => [slot, publicItem(spoop.equipped[slot])])),
      strength: Number(gear) + Math.max(0, combat - 1) * 1.5,
    };
  };
  const a = side(aName);
  const b = side(bName);
  const pA = 1 / (1 + Math.pow(10, (b.strength - a.strength) / 50));
  return [a, b].map((row, i) => {
    const out = Object.assign({}, row, { p: i === 0 ? pA : 1 - pA });
    delete out.strength;
    return out;
  });
}

function presentDuelWatch(state, token, now) {
  const result = duelWatchView(state, token, now);
  if (result) result.sides = duelSides(state, result.a, result.b);
  return result;
}

function duelWatchView(state, token, now) {
  const key = String(token || '');
  if (!key || !state) return null;
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const meta = {
    speed: DUEL_WATCH_SPEED,
    leadMs: DUEL_WATCH_LEAD_MS,
    versusMs: DUEL_VERSUS_MS,
    pace: FIGHT_PACE,
  };
  if (state.pk && state.pk.staked && state.pk.watch === key) {
    const fightMs = new Date(state.pk.fightAt).getTime();
    return Object.assign({}, meta, {
      phase: 'wait',
      fightAt: state.pk.fightAt,
      a: state.pk.aName,
      b: state.pk.bName,
      stake: Math.floor(Number(state.pk.stake) || 0),
      pot: Math.floor(Number(state.pk.pot) || 0),
      starting: fightMs <= nowMs,
    });
  }
  const last = state.lastPk && state.lastPk.staked && state.lastPk.watch === key ? state.lastPk : null;
  const saved = !last && Array.isArray(state.duelWatch)
    ? state.duelWatch.find((row) => row && row.watch === key)
    : null;
  const row = last || saved;
  if (!row) return null;
  const stake = Math.floor(Number(row.stake) || 0);
  const pot = Math.floor(Number(row.pot) || 0);
  const names = {
    fightAt: row.at,
    a: row.aName,
    b: row.bName,
    stake,
    pot,
  };
  const revealMs = new Date(row.revealAt || 0).getTime();
  if (!(revealMs > nowMs)) {
    return Object.assign({}, meta, names, {
      phase: 'done',
      winner: row.winner || '',
      loser: row.loser || '',
    });
  }
  const bout = last && last.bout ? last.bout : null;
  if (!bout) return Object.assign({}, meta, names, { phase: 'wait', starting: true });
  const playback = fightPlaybackMs(bout.duration, DUEL_WATCH_SPEED);
  const showAtMs = revealMs - playback - DUEL_WATCH_LEAD_MS - DUEL_REVEAL_SLACK_MS;
  const age = nowMs - showAtMs;
  const seek = age > DUEL_WATCH_LEAD_MS ? ((age - DUEL_WATCH_LEAD_MS) / 1000) * DUEL_WATCH_SPEED * FIGHT_PACE : 0;
  return Object.assign({}, meta, names, {
    phase: 'live',
    showAt: new Date(showAtMs).toISOString(),
    seek,
    bout,
  });
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
    staked: !!state.pk.staked,
    stake: Math.floor(Number(state.pk.stake) || 0),
    pot: Math.floor(Number(state.pk.pot) || 0),
  };
}

function pitTestCopy(spoop, rng) {
  const copy = JSON.parse(JSON.stringify(spoop));
  const level = 12 + Math.floor(rng() * 3);
  for (const id of SKILL_IDS) copy.skills[id] = xpForLevel(level);
  return copy;
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
  const levelRng = mulberry32(hashString('pit-level|' + seed));
  const fighters = roster.map((spoop) => pitTestCopy(spoop, levelRng));
  if (formation === 'bracket') {
    const tourney = simulateTournament(fighters, mulberry32(hashString(seed)));
    const pot = TOURNAMENT_POT;
    const payouts = tourneyPayouts(pot, tourney.roles);
    tourney.tournament.pot = pot;
    tourney.tournament.championGold = payouts[0] || 0;
    const castNames = new Map(tourney.tournament.cast.map((entry) => [entry.id, entry.name]));
    return {
      seed,
      winner: castNames.get(tourney.tournament.championId) || null,
      duration: tourney.tournament.showMs,
      tournament: withTourneyLoadouts(state, tourney.tournament),
    };
  }
  const allowed = ['ring', 'pairs', 'scatter', 'dragon'];
  const start = allowed.includes(formation) ? formation : 'ring';
  const bout = simulateArena(fighters, mulberry32(hashString(seed)), start);
  const survivors = Array.isArray(bout.winnerIds) ? bout.winnerIds : [];
  const winner = survivors.length
    ? null
    : (bout.fighters || []).find((f) => f.id === bout.winnerId);
  const survivorNames = survivors
    .map((id) => (bout.fighters || []).find((f) => f.id === id))
    .filter(Boolean)
    .map((f) => f.name);
  return {
    seed,
    winner: survivorNames.length ? survivorNames.join(', ') : (winner ? winner.name : null),
    duration: bout.duration,
    bout: withLoadouts(state, bout),
  };
}

function testRaid(state, names, seedText, bossId, tierId) {
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
  roster.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  if (!roster.length) return { error: 'Pick at least one spoop' };
  if (roster.length > 16) roster.length = 16;
  const seed = String(seedText || 'raid').slice(0, 80);
  const id = String(bossId || 'brutus').slice(0, 40);
  const tier = String(tierId || 'medium').toLowerCase().slice(0, 20);
  const rng = mulberry32(hashString('raid|' + seed + '|' + id + '|' + tier));
  const bout = simulateRaid(raidProfiles(roster, rng), rng, id, tier);
  const survivors = Array.isArray(bout.winnerIds) ? bout.winnerIds : [];
  const survivorNames = survivors
    .map((fid) => (bout.fighters || []).find((f) => f.id === fid))
    .filter(Boolean)
    .map((f) => f.name);
  const bossFighter = (bout.fighters || []).find((f) => f.monster && f.monster !== 'rat');
  return {
    seed,
    boss: bossFighter ? {
      id: bossFighter.monster,
      name: bossFighter.name,
      hp: bossFighter.maxHp,
      tier: tier,
      tierName: bossFighter.tierName || 'Medium',
      sprite: bossFighter.sprite || '',
      forLevel: bossFighter.forLevel || 0,
      level: bossFighter.partyLevel || 1,
      maxHit: bossFighter.maxHit || 0,
    } : null,
    winner: survivorNames.length ? survivorNames.join(', ') : (bossFighter ? bossFighter.name : null),
    duration: bout.duration,
    party: bout.party,
    bout: withLoadouts(state, bout),
  };
}

function simulateSwarm(profiles, rng, spec) {
  const spots = raidSpawns(profiles.length);
  const monsters = [];
  const hits = [];
  const deaths = [];
  let spawned = 0;
  const wave = spec.wave && spec.wave.count > 0 ? spec.wave : null;
  const openingCount = spec.count || 4;
  const want = openingCount + (wave ? wave.count : 0);
  let waveSent = !wave;
  let t = 0;
  let winnerId = null;
  let winnerIds = null;
  let called = false;
  const hitChance = (acc, def) => Math.max(0.18, Math.min(0.85, acc / (acc + Math.max(1, def))));
  const bodies = profiles.map((p, i) => ({
    id: p.portrait.id,
    name: p.portrait.name,
    style: p.style,
    levels: p.levels,
    gear: p.gear,
    prayer: p.prayer,
    fortune: 1,
    hp: raidStartHp(p),
    maxHp: Math.max(1, p.portrait.maxHp),
    x: spots[i].x,
    y: spots[i].y,
    alive: true,
    attack: p.attack,
    cd: p.portrait.windup,
    track: [[0, round1(spots[i].x), round1(spots[i].y), '']],
  }));

  function livingPlayers() {
    return bodies.filter((b) => b.alive);
  }

  function livingMonsters() {
    return monsters.filter((m) => m.alive);
  }

  function hurt(target, amount, fromId, attack, style, verb) {
    if (amount > 0) target.hp = Math.max(0, target.hp - amount);
    hits.push({
      t,
      from: fromId,
      to: target.id,
      amount,
      miss: amount <= 0,
      hp: target.hp,
      style: style || 'melee',
      attack: attack || '',
      verb: verb || '',
    });
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      target.track.push([t, round1(target.x), round1(target.y), '']);
      deaths.push({ t, id: target.id, by: fromId });
    }
  }

  function spawnOne(living, index, total, edge) {
    const ang = ((index + (edge ? 0.5 : rng() * 0.35)) / Math.max(1, total)) * Math.PI * 2;
    const rx = edge ? 48 : 36;
    const ry = edge ? 30 : 20;
    const spot = arenaPoint(50 + Math.cos(ang) * rx, 40 + Math.sin(ang) * ry);
    spawned += 1;
    const prey = living.length ? living[Math.floor(rng() * living.length)] : null;
    monsters.push({
      id: spec.id + spawned,
      name: spec.unit || spec.name,
      radius: spec.radius || 2,
      speed: spec.speed || 3.4,
      hp: spec.hp || 20,
      maxHp: spec.hp || 20,
      defence: spec.defence || 2,
      x: spot.x,
      y: spot.y,
      alive: true,
      targetId: prey ? prey.id : null,
      cd: 0.35 + rng() * 0.7,
      track: [[t, round1(spot.x), round1(spot.y), prey ? prey.id : '']],
    });
  }

  const opening = livingPlayers();
  for (let i = 0; i < openingCount; i++) spawnOne(opening, i, openingCount, false);

  const limit = 90;
  for (let step = 0; step < limit / ARENA_STEP; step++) {
    t = round1((step + 1) * ARENA_STEP);
    if (wave && !waveSent && t >= wave.at) {
      waveSent = true;
      const present = livingPlayers();
      for (let i = 0; i < wave.count; i++) spawnOne(present, i, wave.count, true);
    }
    let living = livingPlayers();
    if (!living.length) {
      winnerId = 'pack';
      break;
    }
    const pack = livingMonsters();
    for (let i = 0; i < pack.length; i++) {
      for (let j = i + 1; j < pack.length; j++) {
        const a = pack[i];
        const b = pack[j];
        const need = Math.max(2.1, (a.radius + b.radius) * 0.85);
        const d = arenaDist(a, b);
        if (d >= need || d < 0.001) continue;
        const push = (need - d) / 2;
        const nx = (a.x - b.x) / d;
        const ny = (a.y - b.y) / d;
        a.x += nx * push;
        a.y += ny * push;
        b.x -= nx * push;
        b.y -= ny * push;
        arenaClamp(a);
        arenaClamp(b);
      }
    }
    if (!pack.length && spawned >= want) {
      winnerIds = living.map((b) => b.id);
      break;
    }
    for (const m of pack) {
      let prey = bodies.find((b) => b.alive && b.id === m.targetId);
      if (!prey) {
        prey = living[Math.floor(rng() * living.length)] || null;
        m.targetId = prey ? prey.id : null;
      }
      if (prey && arenaDist(m, prey) > m.radius + 1.6) moveAt(m, prey.x, prey.y, ARENA_STEP, m.speed);
      arenaClamp(m);
      m.track.push([t, round1(m.x), round1(m.y), m.targetId || '']);
      m.cd -= ARENA_STEP;
      if (!prey || m.cd > 0) continue;
      if (arenaDist(m, prey) > m.radius + 1.8) continue;
      m.cd = spec.nip || 3;
      const bite = spec.damage || [2, 4];
      const amount = bite[0] + Math.floor(rng() * (Math.max(bite[0], bite[1]) - bite[0] + 1));
      hurt(prey, amount, m.id, 'nip', 'melee', spec.verb || 'hits');
    }
    living = livingPlayers();
    if (!living.length) {
      winnerId = 'pack';
      break;
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
    const foes = livingMonsters();
    for (const f of bodies) {
      if (!f.alive) continue;
      let foe = null;
      let best = Infinity;
      for (const m of foes) {
        const d = arenaDist(f, m);
        if (d < best) {
          best = d;
          foe = m;
        }
      }
      if (foe && best > foe.radius + (f.style === 'melee' ? 2.2 : 16)) {
        moveAt(f, foe.x, foe.y, ARENA_STEP, ARENA_SPEED);
      }
      arenaClamp(f);
      f.track.push([t, round1(f.x), round1(f.y), foe ? foe.id : '']);
      f.cd -= ARENA_STEP;
      if (!foe || f.cd > 0) continue;
      const reach = foe.radius + arenaRange(f.style) + 0.4;
      if (arenaDist(f, foe) > reach) continue;
      f.cd = f.attack;
      const atk = arenaStats(f, t);
      const miss = rng() > hitChance(atk.acc, foe.defence || 2);
      const amount = miss ? 0 : 1 + Math.floor(rng() * atk.max);
      hurt(foe, amount, f.id, '', f.style, '');
    }
    if (!livingMonsters().length && spawned >= want) {
      winnerIds = livingPlayers().map((b) => b.id);
      break;
    }
  }
  if (!winnerIds && !winnerId) {
    if (!livingMonsters().length && spawned >= want) winnerIds = livingPlayers().map((b) => b.id);
    else {
      winnerId = 'pack';
      called = true;
    }
  }
  const end = round1(t + 1.2);
  for (const m of monsters) m.track.push([end, round1(m.x), round1(m.y), '']);
  for (const f of bodies) f.track.push([end, round1(f.x), round1(f.y), '']);
  const livingEnd = bodies.filter((b) => b.alive);
  const wiped = !livingEnd.length || livingMonsters().length > 0;
  const purse = wiped ? 0 : (spec.gold || 0);
  const share = !wiped && livingEnd.length ? Math.floor(purse / livingEnd.length) : 0;
  let rem = !wiped && livingEnd.length ? purse - share * livingEnd.length : 0;
  const shares = wiped ? [] : livingEnd.map((b) => {
    const gold = share + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return { id: b.id, name: b.name, gold };
  });
  const party = bodies.map((b) => ({
    id: b.id,
    name: b.name,
    alive: b.alive,
    hp: b.hp,
    maxHp: b.maxHp,
  }));
  const views = monsters.map((m) => ({
    id: m.id,
    name: m.name,
    monster: spec.monster,
    minion: true,
    sprite: spec.sprite,
    face: spec.face || '',
    tierName: '',
    combat: spec.level || null,
    style: 'melee',
    maxHp: m.maxHp,
    maxHit: (spec.damage && spec.damage[1]) || 0,
    levels: null,
    weapon: '',
    gear: [],
    equipped: null,
    prayer: null,
  }));
  return {
    width: ARENA_W,
    height: ARENA_H,
    formation: 'raid',
    bossName: spec.name,
    scene: spec.scene || '',
    pack: { name: spec.name, level: spec.level || 1 },
    duration: end,
    called,
    rageAt: 0,
    winnerId,
    winnerIds: winnerIds || [],
    fighters: views.concat(raidFighters(profiles)),
    tracks: monsters.map((m) => ({ id: m.id, pts: m.track })).concat(bodies.map((b) => ({ id: b.id, pts: b.track }))),
    hits,
    deaths,
    hazards: [],
    party,
    loot: {
      wiped: !!wiped,
      gold: purse,
      shares,
      drop: null,
      spooply: null,
    },
  };
}

const RAID_SCENES = {
  mole: 'is-lair',
  brutus: 'is-pasture',
  scurrius: 'is-sewer',
  elvarg: 'is-crandor',
  chaos: 'is-wild',
  leviathan: 'is-pool',
  obor: 'is-hillcave',
  vorkath: 'is-ungael',
  cerberus: 'is-kennel',
  bryophyta: 'is-mossy',
  kbd: 'is-kbdlair',
  kq: 'is-kqlair',
};

function raidPartyRows(profiles) {
  return profiles.map((p) => ({
    id: p.portrait.id,
    name: p.portrait.name,
    alive: true,
    hp: p.hp,
    maxHp: Math.max(1, p.portrait.maxHp),
  }));
}

function splitGold(purse, profiles) {
  if (!profiles.length) return [];
  const share = Math.floor(purse / profiles.length);
  let rem = purse - share * profiles.length;
  return profiles.map((p) => {
    const gold = share + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return { id: p.portrait.id, name: p.portrait.name, gold };
  });
}

// room is { kind: 'boss', boss, tier } or { kind: swarm id, tier }.
function raidFightRoom(state, profiles, rng, room, nodeId) {
  const isBoss = room.kind === 'boss';
  const swarm = isBoss ? null : swarmSpec(room.kind, room.tier);
  const spec = isBoss ? raidBoss(room.boss) : swarm;
  const tier = isBoss ? raidTier(room.tier || spec.home) : null;
  const bout = isBoss
    ? simulateRaid(profiles, rng, room.boss, tier.id, room.hpOff)
    : simulateSwarm(profiles, rng, swarm);
  const wrapped = withLoadouts(state, bout);
  const bossFighter = (wrapped.fighters || []).find((f) => f.monster && !f.minion && f.monster !== 'rat');
  const packHp = (wrapped.fighters || []).filter((f) => f.minion).reduce((sum, f) => sum + (f.maxHp || 0), 0);
  const tierName = isBoss
    ? tier.name
    : (spec.levelAt && room.tier ? raidTier(room.tier).name : 'Light');
  return {
    kind: 'fight',
    node: nodeId,
    boss: {
      id: isBoss ? room.boss : room.kind,
      name: bossFighter ? bossFighter.name : spec.name,
      hp: bossFighter ? bossFighter.maxHp : packHp,
      tier: room.tier || '',
      tierName: bossFighter ? (bossFighter.tierName || tierName) : tierName,
      forLevel: bossFighter ? bossFighter.forLevel : 0,
      level: bossFighter ? (bossFighter.combat || bossFighter.partyLevel || 1) : (spec.level || 1),
      maxHit: bossFighter ? bossFighter.maxHit : 0,
      sprite: bossFighter ? bossFighter.sprite : spec.sprite,
      scene: (isBoss && RAID_SCENES[room.boss]) || spec.scene || '',
      skirmish: !isBoss,
    },
    duration: bout.duration,
    party: bout.party,
    bout: wrapped,
  };
}

// The camp tops a few hurt spoops back to full, picked at random.
function raidCampRoom(profiles, rng, nodeId) {
  const hurt = profiles.filter((p) => p.hp < p.portrait.maxHp);
  const picks = [];
  while (hurt.length && picks.length < CAMP_HEALS) picks.push(hurt.splice(Math.floor(rng() * hurt.length), 1)[0]);
  const healed = picks.map((p) => {
    const row = { id: p.portrait.id, name: p.portrait.name, from: p.hp, to: p.portrait.maxHp, maxHp: p.portrait.maxHp };
    p.hp = p.portrait.maxHp;
    return row;
  });
  return { kind: 'rest', node: nodeId, healed, party: raidPartyRows(profiles) };
}

function raidTreasureRoom(profiles, rng, nodeId) {
  const chest = rollChest(rng);
  return {
    kind: 'treasure',
    node: nodeId,
    chest: { id: chest.id, name: chest.name, gold: chest.gold, osrsId: chest.osrsId },
    shares: splitGold(chest.gold, profiles),
    party: raidPartyRows(profiles),
  };
}

// The party sees the next rooms before it picks one. Hurt parties lean away from bosses.
const ROUTE_LEAN = { boss: 1, swarm: 1, treasure: 1.5, rest: 1.6 };

function pickRoute(options, profiles, rng) {
  if (options.length < 2) return options[0] || null;
  const max = profiles.reduce((sum, p) => sum + Math.max(1, p.portrait.maxHp), 0) || 1;
  const health = profiles.reduce((sum, p) => sum + p.hp, 0) / max;
  const weights = options.map((node) => {
    const base = ROUTE_LEAN[node.kind] || 1;
    return node.kind === 'boss' ? base * (health >= 0.6 ? 1.25 : 0.55) : base;
  });
  let roll = rng() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i];
    if (roll < 0) return options[i];
  }
  return options[options.length - 1];
}

// Walks the map from the first node. Health carries from room to room, and the dead stay down.
// The raid is cleared when the party kills whatever sits in the last layer.
function buildRaidNight(state, roster, rng, fixed) {
  const map = rollRaidMap(rng, fixed);
  const title = raidTitle(mapTitleIds(map), rng);
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  let profiles = raidProfiles(roster, rng);
  profiles.forEach((p) => { p.hp = Math.max(1, p.portrait.maxHp); });
  const rooms = [];
  const route = [];
  const choices = [];
  let node = map.nodes[0] || null;
  let fell = false;
  while (node && profiles.length && !fell) {
    route.push(node.id);
    const fights = node.kind === 'boss'
      ? (node.adds ? [{ kind: node.adds, tier: '' }] : []).concat([{ kind: 'boss', boss: node.boss, tier: node.tier }])
      : node.kind === 'swarm' ? [{ kind: node.swarm, tier: node.tier }] : [];
    for (const fight of fights) {
      const room = raidFightRoom(state, profiles, rng, fight, node.id);
      rooms.push(room);
      const survivors = (room.party || []).filter((row) => row.alive);
      const loot = room.bout && room.bout.loot;
      if (!loot || loot.wiped || !survivors.length) {
        fell = true;
        break;
      }
      const left = new Map(survivors.map((row) => [row.id, row]));
      profiles = profiles.filter((p) => left.has(p.portrait.id));
      profiles.forEach((p) => { p.hp = Math.max(1, left.get(p.portrait.id).hp); });
    }
    if (fell) break;
    if (node.kind === 'rest') rooms.push(raidCampRoom(profiles, rng, node.id));
    if (node.kind === 'treasure') rooms.push(raidTreasureRoom(profiles, rng, node.id));
    const options = (node.next || []).map((id) => byId.get(id)).filter(Boolean);
    const next = pickRoute(options, profiles, rng);
    if (next && options.length > 1) choices.push({ at: node.id, options: options.map((row) => row.id), pick: next.id });
    node = next;
  }
  const lastLayer = map.layers - 1;
  const end = byId.get(route[route.length - 1]);
  const cleared = !fell && !!end && end.layer === lastLayer && profiles.length > 0;
  const raid = { raid: true, name: title, map, route, choices, rooms, cleared };
  raid.awards = raidAwards(raid);
  return raid;
}

const RAID_AWARDS = {
  mvp: { name: 'MVP', detail: 'Most damage in the raid' },
  finisher: { name: 'Finisher', detail: 'Killing blow on the last boss to fall' },
  untouchable: { name: 'Untouchable', detail: 'Least damage taken, and lived' },
  tank: { name: 'Punching Bag', detail: 'Most damage taken' },
  floor: { name: 'Floor Inspector', detail: 'First to go down' },
  lucky: { name: 'Lucky', detail: 'Took a rare drop' },
};

// One row per spoop that walked in, keyed by name. Fight ids only hold within a raid.
function raidTally(raid) {
  const rows = new Map();
  const nodes = new Map((((raid && raid.map) || {}).nodes || []).map((node) => [node.id, node]));
  const row = (name) => {
    let entry = rows.get(name);
    if (!entry) {
      entry = { name, damage: 0, taken: 0, gold: 0, rooms: 0, bosses: 0, drops: 0, rares: 0, jackpots: 0, chests: 0, healed: 0, depth: 0, fell: '', fellAt: 0, alive: true };
      rows.set(name, entry);
    }
    return entry;
  };
  let deaths = 0;
  let finisher = '';
  for (const room of (raid && raid.rooms) || []) {
    const node = nodes.get(room.node);
    const depth = node ? node.layer + 1 : 0;
    for (const member of room.party || []) {
      const entry = row(member.name);
      entry.depth = Math.max(entry.depth, depth);
    }
    if (room.kind === 'treasure') {
      for (const share of room.shares || []) {
        const entry = row(share.name);
        entry.gold += Number(share.gold) || 0;
        entry.chests += 1;
      }
      continue;
    }
    if (room.kind === 'rest') {
      for (const heal of room.healed || []) row(heal.name).healed += 1;
      continue;
    }
    const bout = room.bout || {};
    const names = new Map((bout.party || []).map((member) => [member.id, member.name]));
    const monsters = new Set((bout.fighters || []).filter((f) => f.monster).map((f) => f.id));
    let lastBlow = '';
    for (const hit of bout.hits || []) {
      if (!hit || !(hit.amount > 0)) continue;
      if (names.has(hit.from) && monsters.has(hit.to)) {
        row(names.get(hit.from)).damage += hit.amount;
        if (hit.to === 'boss' && hit.hp <= 0) lastBlow = names.get(hit.from);
      }
      if (names.has(hit.to)) row(names.get(hit.to)).taken += hit.amount;
    }
    for (const death of (bout.deaths || []).slice().sort((a, b) => a.t - b.t)) {
      if (!names.has(death.id)) continue;
      const entry = row(names.get(death.id));
      deaths += 1;
      entry.alive = false;
      entry.fell = (room.boss && room.boss.name) || 'the raid';
      entry.fellAt = deaths;
    }
    const loot = bout.loot || {};
    if (loot.wiped) continue;
    for (const member of bout.party || []) {
      if (!member.alive) continue;
      const entry = row(member.name);
      entry.rooms += 1;
      if (room.boss && !room.boss.skirmish) entry.bosses += 1;
    }
    for (const share of loot.shares || []) row(share.name).gold += Number(share.gold) || 0;
    if (loot.drop && loot.spooply && loot.spooply.name) {
      const entry = row(loot.spooply.name);
      entry.drops += 1;
      if (loot.drop.rare) entry.rares += 1;
      if (loot.drop.jackpot) entry.jackpots += 1;
    }
    if (room.boss && !room.boss.skirmish && lastBlow) finisher = lastBlow;
  }
  return { rows: [...rows.values()], finisher };
}

function raidAwards(raid) {
  const { rows, finisher } = raidTally(raid);
  const awards = [];
  const give = (id, name) => {
    if (name) awards.push({ id, name: RAID_AWARDS[id].name, detail: RAID_AWARDS[id].detail, who: name });
  };
  const best = (list, score) => list.reduce((top, entry) => (!top || score(entry) > score(top) ? entry : top), null);
  const byName = rows.slice().sort((a, b) => a.name.localeCompare(b.name));
  const hitter = best(byName.filter((entry) => entry.damage > 0), (entry) => entry.damage);
  give('mvp', hitter && hitter.name);
  give('finisher', finisher);
  if (byName.length > 1) {
    const standing = byName.filter((entry) => entry.alive && entry.rooms >= 2);
    const calm = best(standing, (entry) => -entry.taken);
    give('untouchable', calm && calm.name);
    const bag = best(byName.filter((entry) => entry.taken > 0), (entry) => entry.taken);
    if (bag && (!calm || bag.name !== calm.name)) give('tank', bag.name);
  }
  const first = byName.find((entry) => entry.fellAt === 1);
  give('floor', first && first.name);
  byName.filter((entry) => entry.rares > 0).forEach((entry) => give('lucky', entry.name));
  return awards;
}

const RAID_STAT_KEYS = ['raids', 'clears', 'deaths', 'rooms', 'bosses', 'damage', 'taken', 'gold', 'drops', 'rares', 'jackpots', 'chests', 'healed'];

function raidStatsOf(spoop) {
  const stats = spoop.raidStats && typeof spoop.raidStats === 'object' && !Array.isArray(spoop.raidStats) ? spoop.raidStats : {};
  RAID_STAT_KEYS.forEach((key) => { stats[key] = Math.max(0, Number(stats[key]) || 0); });
  stats.bestDamage = Math.max(0, Number(stats.bestDamage) || 0);
  stats.deepest = Math.max(0, Number(stats.deepest) || 0);
  if (!stats.awards || typeof stats.awards !== 'object' || Array.isArray(stats.awards)) stats.awards = {};
  spoop.raidStats = stats;
  return stats;
}

function noteRaidStats(spoop, entry, raid, awards, when) {
  const stats = raidStatsOf(spoop);
  stats.raids += 1;
  if (raid.cleared && entry.alive) stats.clears += 1;
  if (!entry.alive) stats.deaths += 1;
  ['rooms', 'bosses', 'damage', 'taken', 'gold', 'drops', 'rares', 'jackpots', 'chests', 'healed'].forEach((key) => {
    stats[key] += Number(entry[key]) || 0;
  });
  stats.bestDamage = Math.max(stats.bestDamage, entry.damage);
  stats.deepest = Math.max(stats.deepest, entry.depth);
  const mine = awards.filter((award) => award.who === entry.name).map((award) => award.id);
  mine.forEach((id) => { stats.awards[id] = (Number(stats.awards[id]) || 0) + 1; });
  stats.last = {
    at: when.toISOString(),
    name: raid.name || 'The raid',
    cleared: !!raid.cleared,
    alive: entry.alive,
    fell: entry.fell,
    damage: entry.damage,
    rooms: entry.rooms,
    gold: entry.gold,
    awards: mine,
  };
  return mine;
}

function presentRaidStats(spoop) {
  if (!spoop.raidStats) return null;
  const stats = raidStatsOf(spoop);
  if (!stats.raids) return null;
  return Object.assign({}, stats, {
    awards: Object.keys(RAID_AWARDS).map((id) => ({
      id,
      name: RAID_AWARDS[id].name,
      detail: RAID_AWARDS[id].detail,
      count: Number(stats.awards[id]) || 0,
    })),
    last: stats.last ? Object.assign({}, stats.last, {
      awards: (stats.last.awards || []).filter((id) => RAID_AWARDS[id]).map((id) => RAID_AWARDS[id].name),
    }) : null,
  });
}

// Same waits as public/js/raid.js.
const RAID_SHOW = {
  open: 3400,
  card: 3200,
  loot: 19000,
  split: 11000,
  travel: 5000,
  fork: 3600,
  camp: 7000,
  chest: 8000,
};

function raidShowMs(raid) {
  const rooms = (raid && raid.rooms) || [];
  const route = (raid && raid.route) || [];
  let ms = route.length ? RAID_SHOW.open : 0;
  rooms.forEach((room, index) => {
    const more = index < rooms.length - 1;
    if (room.kind === 'rest') ms += RAID_SHOW.camp;
    else if (room.kind === 'treasure') ms += RAID_SHOW.chest;
    else {
      ms += RAID_SHOW.card;
      ms += fightPlaybackMs(room.duration || (room.bout && room.bout.duration), ARENA_PLAY_SPEED);
      const loot = room.bout && room.bout.loot;
      if (more) ms += loot && loot.drop ? RAID_SHOW.loot : RAID_SHOW.split;
    }
  });
  ms += Math.max(0, route.length - 1) * RAID_SHOW.travel;
  ms += ((raid && raid.choices) || []).length * RAID_SHOW.fork;
  return ms;
}

function goldText(n) {
  return Number(n || 0).toLocaleString('en-US') + ' gold';
}

// "Everyone standing split 40,000 gold (5,000 each)" when the shares only differ by the remainder.
function raidGoldLine(shares, standing) {
  const rows = (shares || []).filter((row) => row && row.name && Number(row.gold) > 0);
  if (!rows.length) return '';
  const total = rows.reduce((sum, row) => sum + Number(row.gold), 0);
  if (rows.length === 1) return rows[0].name + ' took ' + goldText(total) + '.';
  const golds = rows.map((row) => Number(row.gold));
  if (Math.max(...golds) - Math.min(...golds) <= 1) {
    const who = rows.length >= standing ? 'Everyone standing' : rows.length + ' spoops';
    return who + ' split ' + goldText(total) + ' (' + Math.floor(total / rows.length).toLocaleString('en-US') + ' each).';
  }
  const byGold = new Map();
  rows.forEach((row) => byGold.set(Number(row.gold), (byGold.get(Number(row.gold)) || []).concat(row.name)));
  return [...byGold.entries()].sort((a, b) => b[0] - a[0])
    .map(([gold, names]) => goldText(gold) + ': ' + joinNames(names)).join(' · ') + '.';
}

function raidDropLine(loot) {
  if (!loot || !loot.drop || !loot.drop.name || !loot.spooply || !loot.spooply.name) return '';
  const tag = loot.drop.jackpot ? ' Jackpot!' : loot.drop.rare ? ' Rare drop!' : '';
  return loot.spooply.name + ' received ' + loot.drop.name + '.' + tag;
}

function raidFellLine(room) {
  const party = room.party || [];
  const fell = party.filter((row) => !row.alive).map((row) => row.name);
  if (!fell.length) return '';
  if (fell.length === party.length) return 'Everyone went down: ' + joinNames(fell) + '.';
  return 'Died: ' + joinNames(fell) + '.';
}

// Camps, chests, and swarms do not get their own post. They ride along with the next boss.
function raidAsideLine(room) {
  if (room.kind === 'rest') {
    const healed = (room.healed || []).map((row) => row.name);
    return healed.length ? 'Camp: ' + joinNames(healed) + (healed.length === 1 ? ' is' : ' are') + ' back to full health.' : 'Camp: nobody needed patching up.';
  }
  if (room.kind === 'treasure' && room.chest) {
    return 'Found a ' + room.chest.name + '. ' + raidGoldLine(room.shares, (room.party || []).length);
  }
  const boss = room.boss || {};
  const lost = (room.party || []).filter((row) => !row.alive).map((row) => row.name);
  const parts = ['Cleared the ' + (boss.name || 'swarm') + (lost.length ? ', but lost ' + joinNames(lost) : '') + '.'];
  const gold = raidGoldLine(room.bout && room.bout.loot && room.bout.loot.shares, (room.party || []).filter((row) => row.alive).length);
  if (gold) parts.push(gold);
  return parts.join(' ');
}

function raidBeat(room, step, total, aside, starting) {
  const boss = room.boss || {};
  const loot = room.bout && room.bout.loot;
  const alive = (room.party || []).filter((row) => row.alive);
  const wiped = !loot || loot.wiped || !alive.length;
  const label = (boss.name || 'The boss') + (boss.tierName && !boss.skirmish ? ' (' + boss.tierName + ')' : '');
  const lines = [];
  if (aside.length) lines.push('On the way:\n' + aside.map((line) => '• ' + line).join('\n') + '\n');
  const fell = raidFellLine(room);
  if (fell) lines.push(fell.replace(/^Died:/, 'Died to ' + (boss.name || 'the boss') + ':'));
  if (!wiped) {
    const gold = raidGoldLine(loot.shares, alive.length);
    if (gold) lines.push(gold);
    const drop = raidDropLine(loot);
    if (drop) lines.push(drop);
    lines.push(alive.length + ' of ' + starting + ' still standing.');
  }
  return {
    title: 'Room ' + (step + 1) + ' of ' + total + ': ' + (wiped ? 'the party fell to ' + label : label + ' is down'),
    text: lines.join('\n'),
    sprite: boss.sprite || '',
    wiped,
  };
}

// One Discord post per boss, timed to when the show reveals that room's loot. Walks the
// rooms in the same order and with the same waits as raidShowMs.
function raidBeats(raid, startMs) {
  const rooms = (raid && raid.rooms) || [];
  const route = (raid && raid.route) || [];
  const choices = (raid && raid.choices) || [];
  const total = (raid && raid.map && raid.map.layers) || route.length;
  const starting = ((rooms[0] && rooms[0].party) || []).length;
  const beats = [];
  let t = startMs + (route.length ? RAID_SHOW.open : 0);
  let aside = [];
  route.forEach((nodeId, step) => {
    rooms.filter((room) => room.node === nodeId).forEach((room) => {
      const more = rooms.indexOf(room) < rooms.length - 1;
      if (room.kind === 'rest' || room.kind === 'treasure') {
        t += room.kind === 'rest' ? RAID_SHOW.camp : RAID_SHOW.chest;
        aside.push(raidAsideLine(room));
        return;
      }
      const loot = room.bout && room.bout.loot;
      t += RAID_SHOW.card + fightPlaybackMs(room.duration || (room.bout && room.bout.duration), ARENA_PLAY_SPEED);
      if (more) t += loot && loot.drop ? RAID_SHOW.loot : RAID_SHOW.split;
      const beat = raidBeat(room, step, total, aside, starting);
      if (room.boss && room.boss.skirmish && !beat.wiped) {
        aside.push(raidAsideLine(room));
        return;
      }
      beats.push(Object.assign({ at: new Date(t).toISOString() }, beat));
      aside = [];
    });
    if (step < route.length - 1) {
      if (choices.some((row) => row.at === nodeId)) t += RAID_SHOW.fork;
      t += RAID_SHOW.travel;
    }
  });
  return beats;
}

function jackpotCount(spoop, id) {
  return Math.max(0, Math.floor(Number(spoop && spoop.jackpots && spoop.jackpots[id]) || 0));
}

function grantJackpot(spoop, id) {
  if (!spoop.jackpots || typeof spoop.jackpots !== 'object') spoop.jackpots = {};
  spoop.jackpots[id] = jackpotCount(spoop, id) + 1;
  return spoop.jackpots[id];
}

function sellJackpot(spoop, id, when) {
  const prize = RAID_JACKPOTS[id];
  if (!prize) return { ok: false, error: 'Unknown item.' };
  if (jackpotCount(spoop, id) < 1) return { ok: false, error: 'No ' + prize.name + ' left.' };
  spoop.jackpots[id] = jackpotCount(spoop, id) - 1;
  spoop.gold += JACKPOT_GOLD;
  const sentence = `${spoop.name} sold ${prize.name} for ${JACKPOT_GOLD.toLocaleString('en-US')} gold.`;
  pushLog(spoop, when, `${clockLabel(when)} — ${sentence}`);
  return { ok: true, text: sentence, price: JACKPOT_GOLD, gold: spoop.gold };
}

function grantRaidDrop(spoop, drop, rng) {
  if (!spoop || !drop) return '';
  if (drop.jackpot && RAID_JACKPOTS[drop.jackpot]) {
    grantJackpot(spoop, drop.jackpot);
    return `Found ${drop.name}! It went into the inventory. It sells for ${JACKPOT_GOLD.toLocaleString('en-US')} gold.`;
  }
  const won = raidDropPiece(drop);
  if (!won) return 'Found ' + drop.name + '.';
  const found = giveItem(spoop, makeItem(spoop, rng, pieceSpec(won.piece, won.tier, 'standard', won.slot)));
  return found.text;
}

const RAID_GEAR_LISTS = { armor: ARMOR, weapon: WEAPONS, helm: CUSTOM_HELMS, dhide: DHIDE, cloth: CLOTH, named: NAMED_GEAR };

// Drops rolled before gear refs existed only carry a name, so they fall back to the named list.
function raidDropPiece(drop) {
  const ref = drop.gear;
  const list = ref && RAID_GEAR_LISTS[ref.list];
  const piece = list && list.find((row) => row.id === ref.id);
  if (piece) {
    if (ref.list === 'armor' || ref.list === 'weapon') {
      return { piece, tier: ref.tier, slot: ref.list === 'weapon' ? 'weapon' : piece.slot };
    }
    return { piece, tier: piece.tier, slot: piece.slot };
  }
  const named = NAMED_GEAR.find((item) => (drop.osrsId && item.osrsId === drop.osrsId) || item.name === drop.name);
  return named ? { piece: named, tier: named.tier || 'raid', slot: named.slot } : null;
}

// Raid rooms that are the same boss as the kill-count board.
const RAID_BOSS_KC = {
  mole: 'giant_mole',
  scurrius: 'scurrius',
  elvarg: 'elvarg',
  chaos: 'chaos_elemental',
  leviathan: 'leviathan',
  obor: 'obor',
  vorkath: 'vorkath',
  cerberus: 'cerberus',
  bryophyta: 'bryophyta',
  kbd: 'king_black_dragon',
  kq: 'kalphite_queen',
};

function addBossKc(spoop, bossId) {
  if (!spoop || !bossId || !SPOOP_BOSSES[bossId]) return null;
  if (!spoop.bossKc || typeof spoop.bossKc !== 'object' || Array.isArray(spoop.bossKc)) spoop.bossKc = {};
  const kc = (Number(spoop.bossKc[bossId]) || 0) + 1;
  spoop.bossKc[bossId] = kc;
  return { id: bossId, name: SPOOP_BOSSES[bossId].name, kc };
}

function raidKillCredits(raid) {
  const byName = new Map();
  for (const room of (raid && raid.rooms) || []) {
    if (!room.boss || room.boss.skirmish) continue;
    const bossId = RAID_BOSS_KC[room.boss.id];
    if (!bossId) continue;
    const loot = room.bout && room.bout.loot;
    if (!loot || loot.wiped) continue;
    for (const row of room.party || []) {
      if (!row || !row.alive || !row.name) continue;
      const list = byName.get(row.name) || [];
      list.push(bossId);
      byName.set(row.name, list);
    }
  }
  return byName;
}

function runRaidNight(state, ev, roster) {
  const seed = hashString('nightly-raid|' + ev.when.toISOString() + '|' + roster.map((spoop) => spoop.name).join('|'));
  const rng = mulberry32(seed);
  const raid = buildRaidNight(state, roster, rng, nightLineup(ev.when));
  const goldBy = new Map();
  const drops = [];
  const killsBy = raidKillCredits(raid);
  for (const room of raid.rooms) {
    if (room.kind === 'treasure') {
      for (const share of room.shares || []) {
        goldBy.set(share.name, (goldBy.get(share.name) || 0) + (Number(share.gold) || 0));
      }
      continue;
    }
    const loot = room.bout && room.bout.loot;
    if (!loot || loot.wiped) continue;
    for (const share of loot.shares || []) {
      goldBy.set(share.name, (goldBy.get(share.name) || 0) + (Number(share.gold) || 0));
    }
    if (loot.drop && loot.spooply) drops.push({ name: loot.spooply.name, drop: loot.drop });
  }
  const tally = new Map(raidTally(raid).rows.map((entry) => [entry.name, entry]));
  const awards = raid.awards || [];
  const notes = [];
  const results = [];
  roster.forEach((spoop) => {
    const gold = goldBy.get(spoop.name) || 0;
    const mine = drops.filter((row) => row.name === spoop.name);
    const killIds = killsBy.get(spoop.name) || [];
    const entry = tally.get(spoop.name);
    const won = entry ? noteRaidStats(spoop, entry, raid, awards, ev.when) : [];
    const lamp = lampDrop(spoop, 'raid', ev.when);
    if (!gold && !mine.length && !killIds.length && !lamp && !won.length) return;
    if (gold) spoop.gold += gold;
    const found = mine.map((row) => grantRaidDrop(spoop, row.drop, rng)).filter(Boolean);
    if (lamp) found.push(lamp.text);
    const killed = killIds.map((id) => addBossKc(spoop, id)).filter(Boolean);
    const killText = killed.length
      ? ' Killed ' + killed.map((row) => row.name + ' (' + row.kc.toLocaleString('en-US') + ')').join(', ') + '.'
      : '';
    const awardText = won.length ? ' Raid award: ' + won.map((id) => RAID_AWARDS[id].name).join(', ') + '.' : '';
    const text = clockLabel(ev.when) + ' — Raid. +' + gold.toLocaleString('en-US') + ' gold.' + killText + awardText + (found.length ? ' ' + found.join(' ') : '');
    pushLog(spoop, ev.when, text);
    notes.push({ name: spoop.name, kind: 'arena', text });
    results.push({ place: results.length + 1, name: spoop.name, gold, payout: gold, won: raid.cleared, combat: combatLevel(spoop) });
  });
  if (!notes.length) {
    const text = clockLabel(ev.when) + ' — ' + (raid.cleared ? 'The party cleared the raid.' : 'The raid ended.');
    notes.push({ name: roster[0].name, kind: 'arena', text });
    pushLog(roster[0], ev.when, text);
  }
  const showMs = raidShowMs(raid);
  const drama = social.noteRaid(state, {
    raid,
    byName: new Map(roster.map((spoop) => [spoop.name, spoop])),
    when: ev.when,
    log: pushLog,
  });
  state.lastArena = {
    at: ev.when.toISOString(),
    label: formatEt(ev.when),
    kind: 'raid',
    drama,
    winner: raid.name,
    cleared: raid.cleared,
    pot: null,
    results,
    bout: null,
    raid,
    showMs,
  };
  state.lastArena.text = arenaDiscordText(state.lastArena);
  state.lastArena.revealAt = new Date(Math.max(ev.when.getTime(), Date.now()) + showMs).toISOString();
  state.lastArena.beats = raidBeats(raid, new Date(state.lastArena.revealAt).getTime() - showMs);
  state.lastArena.beatsSent = 0;
  state.lastArena.needsPost = true;
  return notes;
}

function testRaidNight(state, names, seedText) {
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
  roster.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  if (!roster.length) return { error: 'Pick at least one spoop' };
  if (roster.length > 16) roster.length = 16;
  const seed = String(seedText || 'raid').slice(0, 80);
  const rng = mulberry32(hashString('raid-night|' + seed));
  const night = buildRaidNight(state, roster, rng);
  night.seed = seed;
  return night;
}

function loadoutFromSpoop(spoop) {
  const loadout = {};
  for (const slot of SLOTS) {
    const item = spoop && spoop.equipped ? spoop.equipped[slot] : null;
    const osrsId = osrsIdFor(item);
    loadout[slot] = osrsId ? { osrsId, quality: item.quality || null, rating: gearRating(item) } : null;
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
      return Object.assign({}, fighter, {
        loadout: loadoutFromSpoop(spoop),
        gearRating: equippedGearRating(spoop),
      });
    }),
  });
}

function withTourneyLoadouts(state, tourney) {
  if (!tourney) return null;
  return Object.assign({}, tourney, {
    matches: (tourney.matches || []).map((match) => Object.assign({}, match, {
      bout: withLoadouts(state, match.bout),
      games: (match.games || []).map((game) => Object.assign({}, game, {
        bout: withLoadouts(state, game.bout),
      })),
    })),
  });
}

function nightOdds(state, when) {
  const roster = Object.values(state.spoops || {})
    .filter((spoop) => spoop && new Date(spoop.born) <= when)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (roster.length < 2) return null;
  const plan = arenaNightPlan(when);
  const field = roster.map((spoop) => {
    const levels = levelsOf(spoop.skills);
    return {
      name: spoop.name,
      combat: combatLevel(spoop),
      gear: equippedGearRating(spoop),
      hp: levels.hitpoints,
      atk: levels.attack,
      str: levels.strength,
      def: levels.defence,
      rng: levels.ranged,
      mag: levels.magic,
      pry: levels.prayer,
    };
  });
  const odds = { kind: plan.kind, field };
  if (plan.kind === 'tournament') {
    const seed = hashString('nightly|' + when.toISOString() + '|' + field.map((row) => row.name).join('|'));
    odds.cast = shuffleList(field, mulberry32(seed)).map((row) => row.name);
  }
  return odds;
}

// One reading per clock hour, 9am through 8pm, on the day of the fight.
// The first look at an hour sticks, so the line does not rewrite itself.
function noteOddsHour(state, when) {
  if (!state || state.useSim || !(when instanceof Date) || Number.isNaN(when.getTime())) return false;
  const parts = etParts(when);
  if (parts.hour < 9 || parts.hour >= ARENA_HOUR) return false;
  const next = nextArenaAfter(when, state);
  if (!next || etDayKey(next.when) !== etDayKey(when)) return false;
  const night = next.when.toISOString();
  if (!state.oddsTrail || state.oddsTrail.night !== night || !Array.isArray(state.oddsTrail.hours)) {
    state.oddsTrail = { night, hours: [] };
  }
  if (state.oddsTrail.hours.some((row) => row && row.hour === parts.hour)) return false;
  const odds = nightOdds(state, next.when);
  if (!odds || !Array.isArray(odds.field) || odds.field.length < 2) return false;
  state.oddsTrail.hours.push({
    hour: parts.hour,
    kind: odds.kind,
    cast: odds.cast || null,
    field: odds.field.map((row) => ({
      name: row.name,
      gear: Math.round(Number(row.gear) * 10) / 10,
      combat: row.combat,
    })),
  });
  return true;
}

function oddsTrailFor(state, next) {
  const trail = state && state.oddsTrail;
  if (!next || !trail || trail.night !== next.when.toISOString() || !Array.isArray(trail.hours)) return [];
  return trail.hours
    .filter((row) => row && row.hour >= 9 && row.hour < ARENA_HOUR && Array.isArray(row.field))
    .map((row) => ({
      hour: row.hour,
      kind: row.kind,
      cast: row.cast || null,
      field: row.field,
    }))
    .sort((a, b) => a.hour - b.hour);
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
    staked: !!state.lastPk.staked,
    stake: Math.floor(Number(state.lastPk.stake) || 0),
    pot: Math.floor(Number(state.lastPk.pot) || 0),
    bout: withLoadouts(state, state.lastPk.bout || null),
  } : null;
  const last = state.lastArena
    ? Object.assign({}, state.lastArena, {
        bout: withLoadouts(state, state.lastArena.bout),
        tournament: withTourneyLoadouts(state, state.lastArena.tournament),
      })
    : null;
  return {
    now: state.clock,
    clockLabel: formatEt(now),
    useSim: !!state.useSim,
    nextAt: next ? next.when.toISOString() : null,
    nextLabel: next ? formatEt(next.when) : null,
    nextTitle: next ? arenaNightPlan(next.when).title : null,
    nextKind: next ? arenaNightPlan(next.when).kind : null,
    nextDetail: next ? nightBlurb(state, next.when) : '',
    odds: next ? nightOdds(state, next.when) : null,
    oddsTrail: oddsTrailFor(state, next),
    last,
    pot: previewArenaPot(state),
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
  function pushUpdate(name, text, extra) {
    if (!text) return;
    const row = { name, text: String(text) };
    if (extra && extra.kind) row.kind = extra.kind;
    if (extra && extra.discord) row.discord = extra.discord;
    if (extra && extra.icon) row.icon = extra.icon;
    if (extra && Array.isArray(extra.stats) && extra.stats.length) row.stats = extra.stats;
    happened.push(row);
  }
  for (const spoop of Object.values(state.spoops)) {
    for (const text of applyWearRules(spoop, from)) pushUpdate(spoop.name, text);
  }
  for (const ev of events) {
    noteOddsHour(state, ev.when);
    social.dailyDrift(state, etDayKey(ev.when));
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
    const acted = [];
    for (const spoop of Object.values(state.spoops)) {
      if (minutes.get(spoop) !== ev.minute) continue;
      if (new Date(spoop.born) > ev.when) continue;
      acted.push(spoop);
      const lines = [];
      const tickText = doTrainingTick(state, spoop, ev);
      if (tickText && typeof tickText === 'object') lines.push(tickText);
      else if (tickText) lines.push({ text: tickText });
      for (const text of applyWearRules(spoop, ev.when)) if (text) lines.push({ text });
      if (ev.drop) {
        const dropText = doDrop(state, spoop, ev);
        if (dropText) lines.push({ text: dropText });
      }
      const move = nextMoveLine(state, spoop, ev.when);
      if (move && lines.length && lines[lines.length - 1].kind !== 'crate') {
        lines[lines.length - 1].text += '\n' + move;
      }
      for (const line of lines) pushUpdate(spoop.name, line.text, line);
    }
    social.noteEncounters(state, {
      acted,
      placeOf: (spoop) => {
        const act = presentActivity(spoop);
        return act && !act.idle ? { id: act.id, name: act.name } : null;
      },
      when: ev.when,
      log: pushLog,
    });
  }
  const clockTo = capped ? events[events.length - 1].when : target;
  noteOddsHour(state, clockTo);
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
    rating: gearRating(item),
    value: itemValue(item),
    osrsId: osrsIdFor(item),
    hide: item.hide || null,
    cloth: item.cloth || null,
    shape: item.shape || null,
    bonuses: bonusesForItem(item),
    requirement: wearRequirement(item),
    mega: !!megaOf(item),
    job: megaOf(item) ? megaOf(item).job : null,
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
    clue: !!act.clue,
    hours: act.clue ? (spoop.clueHours || act.hours || 1) : undefined,
    hoursLeft: act.clue ? (spoop.clueHoursLeft || 0) : undefined,
    errand: act.errand || null,
    idle: !!act.idle,
    money: !!act.money,
    boss: act.boss || null,
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
    gearRating: equippedGearRating(spoop),
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
    build: combatBuild(spoop),
    focus: SKILL_IDS.includes(spoop.focus) ? spoop.focus : null,
    autoSell: spoop.autoSell !== false,
    autoEquip: spoop.autoEquip !== false,
    equipped: Object.fromEntries(SLOTS.map((slot) => [slot, publicItem(spoop.equipped[slot])])),
    bank,
    megaChests: megaChestCount(spoop),
    lamps: XP_LAMPS.filter((lamp) => lampCount(spoop, lamp.id) > 0).map((lamp) => ({
      id: lamp.id,
      name: lamp.name,
      xp: lamp.xp,
      osrsId: lamp.osrsId,
      count: lampCount(spoop, lamp.id),
    })),
    jackpots: Object.keys(RAID_JACKPOTS).filter((id) => jackpotCount(spoop, id) > 0).map((id) => ({
      id,
      name: RAID_JACKPOTS[id].name,
      osrsId: RAID_JACKPOTS[id].osrsId,
      gold: JACKPOT_GOLD,
      count: jackpotCount(spoop, id),
    })),
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
    bosses: presentBosses(spoop),
    raids: presentRaidStats(spoop),
  };
}

function presentBosses(spoop) {
  const byId = new Map();
  for (const act of ACTIVITIES) {
    if (!act.boss || !SPOOP_BOSSES[act.boss]) continue;
    const prev = byId.get(act.boss);
    if (!prev || act.min < prev.min) byId.set(act.boss, act);
  }
  const kc = spoop.bossKc && typeof spoop.bossKc === 'object' ? spoop.bossKc : {};
  return [...byId.entries()]
    .map(([id, act]) => {
      const meta = SPOOP_BOSSES[id];
      return {
        id,
        name: meta.name,
        icon: '/assets/bosses/' + meta.icon,
        min: act.min,
        kc: Number(kc[id]) || 0,
      };
    })
    .sort((a, b) => a.min - b.min || a.name.localeCompare(b.name));
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
      baseId: item.baseId || null,
      hide: item.hide || null,
      cloth: item.cloth || null,
      shape: item.shape || null,
      osrsId: osrsIdFor(item),
      rating: gearRating(item),
    };
    gearNames.push(itemDisplayName(item));
  }
  return {
    id,
    name: spoop.name,
    combat: combatLevel(spoop),
    gearRating: equippedGearRating(spoop),
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
  const form = f.fortune > 0 ? f.fortune : 1;
  const def = (boost('defence', lv.defence) + g.def + Math.floor(lv.prayer / 4)) * form;
  if (f.style === 'ranged') {
    const ranged = boost('ranged', lv.ranged);
    return {
      acc: (ranged + g.rangeAcc) * form,
      max: Math.max(1, Math.floor((ranged / 8 + g.rangeStr / 3) * form)),
      def,
    };
  }
  if (f.style === 'magic') {
    const magic = boost('magic', lv.magic);
    return {
      acc: (magic + g.mageAcc) * form,
      max: Math.max(1, Math.floor((magic / 8 + g.mageStr / 3) * form)),
      def,
    };
  }
  const attack = boost('attack', lv.attack);
  const strength = boost('strength', lv.strength);
  return {
    acc: (attack + g.meleeAcc) * form,
    max: Math.max(1, Math.floor((strength / 8 + 1 + g.meleeStr / 3) * form)),
    def,
  };
}

function arenaRange(style) {
  if (style === 'ranged') return 32;
  if (style === 'magic') return 30;
  return 5.6;
}

function arenaWindup(interval, rng) {
  return round1(rng() * interval);
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

const ARENA_FORMATIONS = ['ring', 'pairs', 'scatter'];

function pickArenaFormation(rng) {
  return ARENA_FORMATIONS[Math.floor(rng() * ARENA_FORMATIONS.length)];
}

function arenaScatter(n, rng) {
  const pts = [];
  const minX = 10;
  const maxX = ARENA_W - 10;
  const minY = 22;
  const maxY = ARENA_H - 12;
  for (let i = 0; i < n; i++) {
    let spot = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      spot = {
        x: minX + rng() * (maxX - minX),
        y: minY + rng() * (maxY - minY),
      };
      const clear = pts.every((other) => arenaDist(spot, other) >= ARENA_BODY);
      if (clear) break;
    }
    pts.push(spot);
  }
  return pts;
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

function duelSlots(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    pts.push(arenaPoint(left ? 34 : 66, 42));
  }
  return pts;
}

function arenaSpawns(n, rng, formation) {
  if (formation === 'duel') {
    const pts = duelSlots(n);
    pts.kind = 'duel';
    return pts;
  }
  const kind = ARENA_FORMATIONS.includes(formation) ? formation : pickArenaFormation(rng);
  const pts = kind === 'scatter' ? arenaScatter(n, rng) : arenaSlots(n, kind);
  pts.kind = kind;
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

function dragonRing(n) {
  const cx = 50;
  const cy = 40;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({
      x: Math.max(12, Math.min(ARENA_W - 12, cx + Math.cos(a) * 28)),
      y: Math.max(22, Math.min(ARENA_H - 10, cy + Math.sin(a) * 15)),
    });
  }
  return pts;
}

// Claw accuracy is 87 so a full bronze set (defence 29) is hit 75% of the time.
const DRAGON_CLAW_ACC = 87;
const DRAGON_HP = 100;

function simulateDragon(profiles, rng) {
  const spots = dragonRing(profiles.length);
  const cx = 50;
  const cy = 40;
  const dragon = {
    id: 'dragon',
    name: 'Dragon',
    monster: 'dragon',
    style: 'claw',
    levels: null,
    gear: null,
    prayer: null,
    hp: DRAGON_HP,
    maxHp: DRAGON_HP,
    radius: 8,
    x: cx,
    y: cy,
    alive: true,
    targetId: null,
    cd: 1.6,
    track: [[0, cx, cy, '']],
  };
  const bodies = profiles.map((p, i) => {
    const interval = p.gear && p.gear.attack > 0 ? p.gear.attack : attackInterval(null);
    const windup = round1(((i + 0.5) / profiles.length) * interval);
    p.portrait.attack = interval;
    p.portrait.windup = windup;
    return {
      id: p.portrait.id,
      name: p.portrait.name,
      style: p.style,
      levels: p.levels,
      gear: p.gear,
      prayer: p.prayer,
      fortune: p.fortune > 0 ? p.fortune : 1,
      hp: Math.max(1, Math.round(p.portrait.maxHp * (p.fortune > 0 ? p.fortune : 1))),
      maxHp: Math.max(1, Math.round(p.portrait.maxHp * (p.fortune > 0 ? p.fortune : 1))),
      x: spots[i].x,
      y: spots[i].y,
      alive: true,
      targetId: dragon.id,
      attack: interval,
      cd: windup,
      track: [[0, round1(spots[i].x), round1(spots[i].y), dragon.id]],
    };
  });
  const hits = [];
  const deaths = [];
  const chance = (acc, def) => Math.max(0.18, Math.min(0.85, acc / (acc + Math.max(1, def))));
  const clawChance = (def) => Math.max(0.08, Math.min(0.92, DRAGON_CLAW_ACC / (DRAGON_CLAW_ACC + Math.max(1, def))));
  let t = 0;
  let winnerId = null;
  let winnerIds = null;
  let called = false;

  function livingPlayers() {
    return bodies.filter((b) => b.alive);
  }

  function holdPoint(f) {
    const dx = f.x - dragon.x;
    const dy = f.y - dragon.y;
    const d = Math.hypot(dx, dy) || 1;
    const hold = dragon.radius + Math.min(arenaRange(f.style), 7);
    return { x: dragon.x + (dx / d) * hold, y: dragon.y + (dy / d) * hold };
  }

  function hurt(target, amount, fromId, attack, style) {
    if (amount > 0) target.hp = Math.max(0, target.hp - amount);
    hits.push({
      t,
      from: fromId,
      to: target.id,
      amount,
      miss: amount <= 0,
      hp: target.hp,
      style: style || 'melee',
      attack: attack || '',
    });
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      target.targetId = null;
      target.track.push([t, round1(target.x), round1(target.y), '']);
      deaths.push({ t, id: target.id, by: fromId });
    }
  }

  for (let step = 0; step < ARENA_MAX_T / ARENA_STEP; step++) {
    t = round1((step + 1) * ARENA_STEP);
    const living = livingPlayers();
    if (!dragon.alive) {
      winnerIds = living.map((b) => b.id);
      break;
    }
    if (!living.length) {
      winnerId = dragon.id;
      break;
    }
    for (const f of bodies) {
      if (!f.alive) continue;
      f.targetId = dragon.id;
      const hold = holdPoint(f);
      if (arenaDist(f, hold) > 0.6) arenaMoveToward(f, hold.x, hold.y, ARENA_STEP);
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
    const minDist = dragon.radius + 1.2;
    for (const f of bodies) {
      if (!f.alive) continue;
      const d = arenaDist(f, dragon);
      if (d < minDist && d > 0.001) {
        f.x = dragon.x + ((f.x - dragon.x) / d) * minDist;
        f.y = dragon.y + ((f.y - dragon.y) / d) * minDist;
      }
      arenaClamp(f);
      if (step % 2 === 0) f.track.push([t, round1(f.x), round1(f.y), dragon.alive ? dragon.id : '']);
      f.cd -= ARENA_STEP;
      if (!dragon.alive || f.cd > 0) continue;
      const reach = dragon.radius + arenaRange(f.style) + 0.6;
      if (arenaDist(f, dragon) > reach) continue;
      f.cd = f.attack;
      const atk = arenaStats(f, t);
      const miss = rng() > chance(atk.acc, 24);
      const amount = miss ? 0 : 1 + Math.floor(rng() * atk.max);
      hurt(dragon, amount, f.id, '', f.style);
      if (!dragon.alive) {
        winnerIds = livingPlayers().map((b) => b.id);
        break;
      }
    }
    if (!dragon.alive) break;
    if (step % 2 === 0) dragon.track.push([t, cx, cy, dragon.targetId || '']);
    dragon.cd -= ARENA_STEP;
    if (dragon.cd <= 0 && dragon.alive) {
      const prey = livingPlayers();
      if (prey.length) {
        const target = prey[Math.floor(rng() * prey.length)];
        dragon.targetId = target.id;
        const fire = rng() < 0.5;
        dragon.cd = 3.2 + rng() * 0.9;
        if (fire) {
          const amount = 20 + Math.floor(rng() * 21);
          hurt(target, amount, dragon.id, 'fire', 'fire');
        } else {
          const def = arenaStats(target, t).def;
          const miss = rng() > clawChance(def);
          const amount = miss ? 0 : 10 + Math.floor(rng() * 21);
          hurt(target, amount, dragon.id, 'claw', 'claw');
        }
      }
    }
    if (!livingPlayers().length) {
      winnerId = dragon.id;
      break;
    }
  }
  if (!winnerIds && !winnerId) {
    if (!dragon.alive) winnerIds = livingPlayers().map((b) => b.id);
    else {
      winnerId = dragon.id;
      called = true;
    }
  }
  profiles.forEach((p, i) => {
    p.portrait.maxHp = bodies[i].maxHp;
  });
  const dragonView = {
    id: dragon.id,
    name: dragon.name,
    monster: 'dragon',
    combat: null,
    style: 'melee',
    maxHp: dragon.maxHp,
    maxHit: 40,
    levels: null,
    weapon: '',
    gear: [],
    equipped: null,
    prayer: null,
  };
  return {
    width: ARENA_W,
    height: ARENA_H,
    formation: 'dragon',
    duration: t,
    called,
    winnerId,
    winnerIds: winnerIds || [],
    fighters: [dragonView].concat(profiles.map((p) => p.portrait)),
    tracks: [{ id: dragon.id, pts: dragon.track }].concat(bodies.map((b) => ({ id: b.id, pts: b.track }))),
    hits,
    deaths,
  };
}

function raidProfiles(spoops, rng) {
  return spoops.map((spoop, i) => {
    const portrait = arenaPortrait(spoop, 'f' + i);
    const gear = gearBonuses(spoop);
    const levels = levelsOf(spoop.skills);
    const prayer = prayerClock(chooseArenaPrayer(gear.style, levels.prayer, rng), levels.prayer);
    portrait.prayer = prayer
      ? { id: prayer.id, name: prayer.name, max: prayer.max, rate: prayer.rate, off: prayer.off }
      : null;
    const interval = gear.attack > 0 ? gear.attack : attackInterval(null);
    portrait.attack = interval;
    portrait.windup = round1(((i + 0.4) / Math.max(1, spoops.length)) * interval);
    return { portrait, gear, levels, style: gear.style, prayer, attack: interval };
  });
}

// A raid night keeps p.hp between rooms. Anything else starts full.
function raidStartHp(p) {
  const max = Math.max(1, p.portrait.maxHp);
  return p.hp > 0 ? Math.min(max, Math.round(p.hp)) : max;
}

// The replay starts each bar where the room started, not at full.
function raidFighters(profiles) {
  return profiles.map((p) => Object.assign({}, p.portrait, { startHp: raidStartHp(p) }));
}

function raidMeter(profiles) {
  let hp = 0;
  let combat = 0;
  let acc = 0;
  const n = Math.max(1, profiles.length);
  for (const p of profiles) {
    hp += Math.max(1, p.portrait.maxHp);
    combat += combatLevelFromLevels(p.levels);
    const atk = arenaStats({
      style: p.style,
      levels: p.levels,
      gear: p.gear,
      prayer: p.prayer,
      fortune: 1,
    }, 0);
    acc += atk.acc;
  }
  return { hp: hp / n, combat: combat / n, acc: acc / n, count: profiles.length };
}

function raidPool(boss, profiles) {
  if (boss.hp > 0) return Math.round(boss.hp);
  const hitChance = (acc, def) => Math.max(0.18, Math.min(0.85, acc / (acc + Math.max(1, def))));
  let dps = 0;
  for (const p of profiles) {
    const atk = arenaStats({
      style: p.style,
      levels: p.levels,
      gear: p.gear,
      prayer: p.prayer,
      fortune: 1,
    }, 0);
    const interval = Math.max(0.6, p.attack || 2.4);
    dps += hitChance(atk.acc, boss.defence) * ((1 + atk.max) / 2) / interval;
  }
  const scaled = Math.round(Math.max(0.4, dps) * (boss.fightSeconds || 42));
  return Math.max(boss.minHp || 48, Math.min(boss.maxHp || 5000, scaled));
}

function raidSpawns(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = n <= 1 ? 0.5 : i / (n - 1);
    const ang = Math.PI * (0.22 + u * 0.56);
    pts.push(arenaPoint(50 + Math.cos(ang) * 34, 36 + Math.sin(ang) * 22));
  }
  return pts;
}

function moveAt(f, x, y, dt, speed) {
  const dx = x - f.x;
  const dy = y - f.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return;
  const step = Math.min(d, speed * dt);
  f.x += (dx / d) * step;
  f.y += (dy / d) * step;
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function clampBoss(boss) {
  const pad = boss.radius + 1;
  boss.x = Math.max(pad, Math.min(ARENA_W - pad, boss.x));
  boss.y = Math.max(pad + 6, Math.min(ARENA_H - pad, boss.y));
}

function segmentHit(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  let u = ((px - x1) * vx + (py - y1) * vy) / len2;
  u = Math.max(0, Math.min(1, u));
  const x = x1 + vx * u;
  const y = y1 + vy * u;
  return { d: Math.hypot(px - x, py - y), x, y, vx, vy };
}

// One boss. Spoops keep their real hitpoints. A death stays down for the rest of the fight.
function simulateRaid(profiles, rng, bossId, tierId, hpOff) {
  const meter = raidMeter(profiles);
  const spec = scaleRaidBoss(raidBoss(bossId), meter, tierId);
  if (hpOff) {
    spec.hp = Math.max(1, Math.round(spec.hp + hpOff));
    spec.minHp = spec.hp;
  }
  const pool = raidPool(spec, profiles);
  const spots = raidSpawns(profiles.length);
  const startX = spec.at ? spec.at[0] : 50;
  const startY = spec.at ? spec.at[1] : spec.rooted ? 36 : 30;
  const boss = {
    id: 'boss',
    name: spec.name,
    monster: spec.monster,
    radius: spec.radius,
    speed: spec.speed,
    defence: spec.defence,
    hp: pool,
    maxHp: pool,
    x: startX,
    y: startY,
    alive: true,
    targetId: null,
    cd: spec.opener || 3.6,
    next: 0,
    intent: null,
    buried: false,
    track: [[0, startX, startY, '']],
  };
  const rooted = !!spec.rooted;
  const rubble = [];
  const bodies = profiles.map((p, i) => ({
    id: p.portrait.id,
    name: p.portrait.name,
    style: p.style,
    levels: p.levels,
    gear: p.gear,
    prayer: p.prayer,
    fortune: 1,
    hp: raidStartHp(p),
    maxHp: Math.max(1, p.portrait.maxHp),
    x: spots[i].x,
    y: spots[i].y,
    alive: true,
    attack: p.attack,
    cd: p.portrait.windup,
    reflex: round1(0.08 + rng() * 0.3),
    blunder: rng() < (spec.blunder || 0.18) ? round1(0.28 + rng() * 0.36) : 0,
    laneSide: i % 2 === 0 ? 1 : -1,
    orbit: rng() * Math.PI * 2,
    clears: !!(spec.rats) && rng() < 0.42,
    seen: '',
    dodgeAt: 0,
    track: [[0, round1(spots[i].x), round1(spots[i].y), boss.id]],
  }));
  const hits = [];
  const deaths = [];
  const hazards = [];
  const rats = [];
  let ratSeq = 0;
  let nextRat = spec.rats ? (spec.rats.first || 7) : 1e9;
  const allAttacks = (spec.attacks || []).concat(...(spec.forms || []).map((next) => next.attacks || []));
  const phases = [];
  const bounces = [];
  const BOUNCE_GAP = 0.3;
  let form = 0;
  const hitChance = (acc, def) => Math.max(0.18, Math.min(0.85, acc / (acc + Math.max(1, def))));
  let t = 0;
  let winnerId = null;
  let winnerIds = null;
  let called = false;
  const forms = spec.forms || [];
  const lives = 1 + forms.reduce((sum, next) => sum + (next.hp || 1), 0);
  const cap = Math.max(72, Math.round((spec.fightSeconds || 56) * 1.25 * lives));
  // No clock. When the old timer would have stopped the fight, the boss rages:
  // attack speed climbs 1% a second until the party falls or the boss does.
  // The ceiling is only a backstop, past the point where the telegraphs are shorter than a dodge.
  const rageAt = cap;
  const limit = cap + 360;

  function livingPlayers() {
    return bodies.filter((b) => b.alive);
  }

  function hurt(target, amount, fromId, attack, style, verb, effect) {
    if (amount > 0) target.hp = Math.max(0, target.hp - amount);
    hits.push({
      t,
      from: fromId,
      to: target.id,
      amount,
      miss: amount <= 0 && effect !== 'madness',
      hp: target.hp,
      style: style || 'melee',
      attack: attack || '',
      verb: verb || '',
      effect: effect || '',
    });
    if (target === boss && target.hp <= 0 && form < forms.length) {
      shed();
      return;
    }
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      target.track.push([t, round1(target.x), round1(target.y), '']);
      deaths.push({ t, id: target.id, by: fromId });
    }
  }

  // The bar ran out but she has another form: drop whatever she was winding up, take the
  // next form's attacks and speed, and stay untouchable for molt seconds while she changes.
  function shed() {
    const next = forms[form];
    form += 1;
    if (boss.intent) {
      for (let i = hazards.length - 1; i >= 0; i--) {
        if (hazards[i].id === boss.intent.id) hazards.splice(i, 1);
      }
      boss.intent = null;
    }
    bounces.length = 0;
    spec.attacks = next.attacks || spec.attacks;
    spec.chargeSpeed = next.chargeSpeed || spec.chargeSpeed;
    boss.speed = next.speed || boss.speed;
    boss.next = 0;
    boss.hp = Math.max(1, Math.round(pool * (next.hp || 1)));
    boss.buried = true;
    boss.moltUntil = round1(t + (next.molt || 1.6));
    boss.cd = (next.molt || 1.6) + 1;
    phases.push({
      t,
      form: next.id || 'form' + form,
      name: next.name || spec.name,
      sprite: next.sprite || spec.sprite,
      verb: next.verb || 'changes form',
      hp: boss.hp,
      until: boss.moltUntil,
    });
  }

  // A landed bolt hops to the nearest spoop it hasn't hit yet, weaker every hop.
  function bounceTick() {
    for (let i = bounces.length - 1; i >= 0; i--) {
      const hop = bounces[i];
      if (t < hop.at) continue;
      bounces.splice(i, 1);
      let next = null;
      let best = hop.reach;
      for (const f of bodies) {
        if (!f.alive || hop.hit.has(f.id)) continue;
        const d = arenaDist(hop.from, f);
        if (d <= best) {
          next = f;
          best = d;
        }
      }
      if (!next) continue;
      const amount = Math.max(1, Math.round(hop.amount * hop.falloff));
      hop.hit.add(next.id);
      hurt(next, amount, boss.id, 'bounce', hop.style, hop.verb);
      hits[hits.length - 1].via = hop.from.id;
      if (hop.left > 1) {
        bounces.push(Object.assign({}, hop, { at: round1(t + BOUNCE_GAP), from: next, amount, left: hop.left - 1 }));
      }
    }
  }

  function pointIn(x, y, intent, pad) {
    if (!intent) return false;
    const extra = pad || 0;
    if (intent.zones && intent.zones.length) {
      return intent.zones.some((zone) => Math.hypot(x - zone.x, y - zone.y) <= (zone.r || 0) + extra);
    }
    if (intent.kind === 'lane') {
      return segmentHit(x, y, intent.x1, intent.y1, intent.x2, intent.y2).d <= intent.w / 2 + extra;
    }
    if (intent.kind === 'cone') {
      if (t < intent.lockAt) return false;
      const d = Math.hypot(x - intent.x, y - intent.y);
      if (d > intent.r + extra) return false;
      if (d < 1) return true;
      const off = Math.abs(wrapAngle(Math.atan2(y - intent.y, x - intent.x) - intent.a));
      return off <= intent.arc + extra / d;
    }
    return Math.hypot(x - intent.x, y - intent.y) <= intent.r + extra;
  }

  function inHazard(f, intent) {
    return pointIn(f.x, f.y, intent, 0);
  }

  function exitPoint(f, intent) {
    if (intent.zones && intent.zones.length) {
      let zone = intent.zones[0];
      let best = Infinity;
      for (const candidate of intent.zones) {
        const d = Math.hypot(f.x - candidate.x, f.y - candidate.y);
        if (d < best) {
          best = d;
          zone = candidate;
        }
      }
      const dx = f.x - zone.x;
      const dy = f.y - zone.y;
      const d = Math.hypot(dx, dy) || 0.01;
      return {
        x: zone.x + (dx / d) * ((zone.r || 3) + 1.8),
        y: zone.y + (dy / d) * ((zone.r || 3) + 1.8),
      };
    }
    if (intent.kind === 'lane') {
      const hit = segmentHit(f.x, f.y, intent.x1, intent.y1, intent.x2, intent.y2);
      const len = Math.hypot(hit.vx, hit.vy) || 1;
      const px = -hit.vy / len;
      const py = hit.vx / len;
      const side = (f.x - hit.x) * px + (f.y - hit.y) * py;
      const sign = Math.abs(side) > 0.25 ? Math.sign(side) : f.laneSide;
      const need = intent.w / 2 + 2.1 - Math.min(intent.w / 2, hit.d);
      return { x: f.x + px * sign * need, y: f.y + py * sign * need };
    }
    if (intent.kind === 'cone') {
      const rx = f.x - intent.x;
      const ry = f.y - intent.y;
      const d = Math.hypot(rx, ry) || 0.01;
      const options = [{ x: intent.x + (rx / d) * (intent.r + 1.8), y: intent.y + (ry / d) * (intent.r + 1.8) }];
      for (const side of [1, -1]) {
        const edge = intent.a + side * intent.arc;
        const ux = Math.cos(edge);
        const uy = Math.sin(edge);
        const along = Math.max(0, rx * ux + ry * uy);
        options.push({
          x: intent.x + ux * along - side * uy * 2.2,
          y: intent.y + uy * along + side * ux * 2.2,
        });
      }
      let best = options[0];
      for (const spot of options) {
        if (Math.hypot(spot.x - f.x, spot.y - f.y) < Math.hypot(best.x - f.x, best.y - f.y)) best = spot;
      }
      return best;
    }
    const dx = f.x - intent.x;
    const dy = f.y - intent.y;
    const d = Math.hypot(dx, dy) || 0.01;
    return {
      x: intent.x + (dx / d) * (intent.r + 1.8),
      y: intent.y + (dy / d) * (intent.r + 1.8),
    };
  }

  function dodgePoint(f) {
    const intent = boss.intent;
    if (!intent || intent.kind === 'acid' || !boss.alive || t < f.dodgeAt || !inHazard(f, intent)) return null;
    if (intent.effect === 'wash' || intent.attack === 'bite' || intent.sure) return null;
    if (intent.effect === 'smoke') {
      if (behindRubble(f)) return null;
      const cover = coverPoint(f);
      if (cover) return cover;
    }
    let dest = exitPoint(f, intent);
    if (f.blunder && t < f.dodgeAt + f.blunder) {
      dest = { x: f.x * 2 - dest.x, y: f.y * 2 - dest.y };
    }
    return arenaPoint(dest.x, dest.y);
  }

  function combatPoint(f, living) {
    const melee = f.style === 'melee';
    const group = living.filter((a) => (melee ? a.style === 'melee' : a.style !== 'melee'));
    const n = Math.max(1, group.length);
    let i = group.indexOf(f);
    if (i < 0) i = 0;
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + (melee ? 0 : f.orbit);
    const dist = melee ? boss.radius + 2.3 : 23;
    return arenaPoint(boss.x + Math.cos(ang) * dist, boss.y + Math.sin(ang) * dist);
  }

  function nearest(living) {
    let best = null;
    let bestD = Infinity;
    for (const f of living) {
      const d = arenaDist(boss, f);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  function madPrey(f) {
    if (!f.mad || t >= f.mad) return null;
    let best = null;
    let bestD = Infinity;
    for (const other of bodies) {
      if (other === f || !other.alive) continue;
      const d = arenaDist(f, other);
      if (d < bestD) {
        best = other;
        bestD = d;
      }
    }
    return best;
  }

  function madReach(f) {
    return Math.min(arenaRange(f.style), 12) + 0.4;
  }

  function livingRats() {
    return rats.filter((rat) => rat.alive);
  }

  function nearestRat(f, reach) {
    let best = null;
    let bestD = reach;
    for (const rat of rats) {
      if (!rat.alive) continue;
      const d = arenaDist(f, rat);
      if (d < bestD) {
        best = rat;
        bestD = d;
      }
    }
    return best;
  }

  function spawnRats() {
    const cfg = spec.rats;
    if (!cfg) return;
    const room = (cfg.cap || 4) - livingRats().length;
    if (room <= 0) return;
    const n = Math.min(cfg.pack || 2, room);
    const hi = (cfg.damage && cfg.damage[1]) || 8;
    for (let i = 0; i < n; i++) {
      const edge = Math.floor(rng() * 4);
      let x = 50;
      let y = 36;
      if (edge === 0) { x = 10 + rng() * 80; y = 8; }
      else if (edge === 1) { x = 10 + rng() * 80; y = 64; }
      else if (edge === 2) { x = 8; y = 12 + rng() * 48; }
      else { x = 92; y = 12 + rng() * 48; }
      const spot = arenaPoint(x, y);
      ratSeq += 1;
      rats.push({
        id: 'rat' + ratSeq,
        name: cfg.name || 'Giant rat',
        radius: cfg.radius || 1.6,
        speed: cfg.speed || 5.4,
        hp: cfg.hp || 28,
        maxHp: cfg.hp || 28,
        maxHit: hi,
        x: spot.x,
        y: spot.y,
        alive: true,
        targetId: null,
        cd: 0.35 + rng() * 0.7,
        track: [[t, round1(spot.x), round1(spot.y), '']],
      });
    }
  }

  function beginAttack(living) {
    const attacks = spec.attacks || [];
    if (!attacks.length || !living.length) return;
    const atk = attacks[boss.next % attacks.length];
    boss.next += 1;
    const haste = rageAt && t >= rageAt ? Math.pow(1.01, t - rageAt) : 1;
    const warn = atk.warn / haste;
    const aim = atk.aim === 'far'
      ? living.slice().sort((a, b) => arenaDist(boss, b) - arenaDist(boss, a))[0]
      : atk.aim === 'any'
        ? living[Math.floor(rng() * living.length)]
        : nearest(living);
    const intent = {
      id: 'h' + hazards.length,
      attack: atk.id,
      kind: atk.kind,
      label: atk.label,
      verb: atk.verb,
      tone: atk.tone || '',
      effect: atk.effect || '',
      style: atk.style || 'melee',
      hold: !!atk.hold,
      sure: !!atk.sure,
      mad: atk.mad || 0,
      freeze: atk.freeze || 0,
      hops: atk.hops || 0,
      hop: atk.hop || 12,
      falloff: atk.falloff || 0.75,
      hopVerb: atk.hopVerb || atk.verb,
      t0: t,
      t1: round1(t + warn),
      dashAt: round1(t + warn * 0.62),
      aimId: aim ? aim.id : null,
      damage: atk.damage,
      cooldown: Math.max(0.2, atk.cooldown / haste),
      x: boss.x,
      y: boss.y,
      r: atk.radius || boss.radius,
      w: atk.width || 6,
      x1: boss.x,
      y1: boss.y,
      x2: boss.x,
      y2: boss.y,
    };
    if ((atk.kind === 'mark' || atk.kind === 'burrow') && aim) {
      const spot = atk.kind === 'burrow' ? arenaPoint(aim.x, aim.y) : aim;
      intent.x = spot.x;
      intent.y = spot.y;
    }
    boss.buried = atk.kind === 'burrow';
    if (atk.kind === 'lane' && aim) {
      const dx = aim.x - boss.x;
      const dy = aim.y - boss.y;
      const d = Math.hypot(dx, dy) || 1;
      const len = Math.max(16, Math.min(atk.reach || 30, d + 14));
      const end = arenaPoint(boss.x + (dx / d) * len, boss.y + (dy / d) * len);
      intent.x2 = end.x;
      intent.y2 = end.y;
    }
    if (atk.kind === 'cone') {
      // Spins from where she was looking, a turn or two, and lands on a random heading.
      const from = aim ? Math.atan2(aim.y - boss.y, aim.x - boss.x) : 0;
      const a = rng() * Math.PI * 2;
      const dir = rng() < 0.5 ? 1 : -1;
      const gap = (((a - from) * dir) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      intent.a = a;
      intent.arc = ((atk.arc || 45) * Math.PI) / 180;
      intent.from = from;
      intent.sweep = dir * (gap + Math.PI * 2 * (1 + Math.floor(rng() * 2)));
      intent.lockAt = round1(t + warn * (atk.spin || 0.4));
    }
    if (atk.kind === 'rocks' || atk.kind === 'barrage') {
      const shots = atk.kind === 'barrage'
        ? (atk.shots && atk.shots.length ? atk.shots : [
          { label: 'SPINE', tone: 'spine', verb: 'fires a spine at' },
          { label: 'BOLT', tone: 'bolt', verb: 'fires a bolt at' },
          { label: 'BLAST', tone: 'blast', verb: 'blasts' },
        ])
        : null;
      const n = shots ? shots.length : atk.each ? living.length : Math.max(1, atk.count || 4);
      const picks = living.slice();
      intent.zones = [];
      for (let i = 0; i < n; i++) {
        const host = picks.length
          ? picks.splice(Math.floor(rng() * picks.length), 1)[0]
          : living[i % living.length];
        const spreadX = atk.kind === 'rocks' ? rng() * 5 - 2.5 : rng() * 2.4 - 1.2;
        const spreadY = atk.kind === 'rocks' ? rng() * 4 - 2 : rng() * 2 - 1;
        const spot = arenaPoint(host.x + spreadX, host.y + spreadY);
        const shot = shots ? shots[i % shots.length] : null;
        intent.zones.push({
          x: spot.x,
          y: spot.y,
          r: atk.radius || 3.6,
          label: shot ? shot.label : (atk.label || ''),
          tone: shot ? shot.tone : (atk.tone || 'rock'),
          verb: shot ? shot.verb : atk.verb,
          style: shot && shot.style ? shot.style : (atk.style || 'melee'),
        });
      }
    }
    if (atk.kind === 'acid') {
      intent.t1 = round1(t + (atk.phase || 9));
      intent.aimId = null;
      intent.spitWarn = warn;
      intent.every = Math.max(0.25, (atk.every || 0.55) / haste);
      intent.nextSpit = round1(t + 0.9);
      intent.spitR = atk.radius || 3.4;
      intent.chip = atk.pool || [1, 3];
      intent.spits = [];
      intent.pools = acidPools(atk.pools || 14, atk.poolRadius || 3.3);
    }
    boss.intent = intent;
    if (intent.kind === 'acid') {
      for (const spot of intent.pools) {
        hazards.push({
          id: intent.id,
          kind: 'pool',
          attack: 'acid',
          label: '',
          tone: 'acid',
          t0: intent.t0,
          t1: intent.t1,
          x: spot.x,
          y: spot.y,
          r: spot.r,
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          w: 0,
        });
      }
    } else if (intent.zones && intent.zones.length) {
      for (const zone of intent.zones) {
        hazards.push({
          id: intent.id,
          kind: 'circle',
          attack: intent.attack,
          label: zone.label,
          tone: zone.tone || '',
          t0: intent.t0,
          t1: intent.t1,
          x: zone.x,
          y: zone.y,
          r: zone.r,
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          w: 0,
        });
      }
    } else {
      const hazard = {
        id: intent.id,
        kind: intent.kind,
        attack: intent.attack,
        label: intent.label,
        tone: intent.tone || '',
        t0: intent.t0,
        t1: intent.t1,
        x: intent.x,
        y: intent.y,
        r: intent.r,
        x1: intent.x1,
        y1: intent.y1,
        x2: intent.x2,
        y2: intent.y2,
        w: intent.w,
      };
      if (intent.kind === 'cone') {
        hazard.a = Math.round(intent.a * 1000) / 1000;
        hazard.arc = Math.round(intent.arc * 1000) / 1000;
        hazard.from = Math.round(intent.from * 1000) / 1000;
        hazard.sweep = Math.round(intent.sweep * 1000) / 1000;
        hazard.lockAt = intent.lockAt;
      }
      hazards.push(hazard);
    }
    for (const f of bodies) {
      if (!f.alive) continue;
      f.seen = intent.id;
      f.dodgeAt = round1((intent.lockAt || t) + f.reflex);
    }
  }

  function acidPools(n, r) {
    const pools = [];
    for (let tries = 0; tries < n * 8 && pools.length < n; tries++) {
      const spot = arenaPoint(10 + rng() * 80, 18 + rng() * 46);
      if (Math.hypot(spot.x - boss.x, spot.y - boss.y) < boss.radius + r + 2) continue;
      if (pools.some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) < r * 2 + 1.6)) continue;
      pools.push({ x: round1(spot.x), y: round1(spot.y), r });
    }
    return pools;
  }

  function inAcid(x, y, acid, pad) {
    return acid.pools.some((p) => Math.hypot(x - p.x, y - p.y) <= p.r + (pad || 0));
  }

  // A spit you stand in only needs you walking out of it. One ahead needs a line that misses it.
  function spitInWay(f, spot, acid) {
    return acid.spits.some((s) => {
      if (s.done) return false;
      if (Math.hypot(f.x - s.x, f.y - s.y) <= s.r + 1) return Math.hypot(spot.x - s.x, spot.y - s.y) < s.r + 2;
      return segmentHit(s.x, s.y, f.x, f.y, spot.x, spot.y).d < s.r + 1;
    });
  }

  // A clean lap point: off every pool, clear of the dragon, with a straight walk that misses the acid.
  // A spoop that fumbles its dodges sometimes takes a line through a pool anyway.
  function acidSpot(f, acid) {
    const careless = f.blunder && rng() < 0.35;
    let fallback = null;
    for (let tries = 0; tries < 14; tries++) {
      const ang = rng() * Math.PI * 2;
      const dist = 8 + rng() * 16;
      const spot = arenaPoint(f.x + Math.cos(ang) * dist, f.y + Math.sin(ang) * dist * 0.7);
      if (Math.hypot(spot.x - boss.x, spot.y - boss.y) < boss.radius + 3) continue;
      if (inAcid(spot.x, spot.y, acid, 1.4)) continue;
      if (!fallback) fallback = spot;
      if (careless) return spot;
      const crosses = acid.pools.some((p) => segmentHit(p.x, p.y, f.x, f.y, spot.x, spot.y).d < p.r + 0.6);
      if (!crosses && !spitInWay(f, spot, acid)) return spot;
    }
    return fallback || arenaPoint(f.x + (rng() * 16 - 8), f.y + (rng() * 12 - 6));
  }

  function acidRun(f) {
    const acid = boss.intent;
    const there = f.run && Math.hypot(f.run.x - f.x, f.run.y - f.y) < 1.2;
    const fresh = !f.run || f.runFor !== acid.id;
    const blocked = !fresh && t >= (f.rethinkAt || 0) && spitInWay(f, f.run, acid);
    if (fresh || there || blocked) {
      f.run = acidSpot(f, acid);
      f.rethinkAt = round1(t + f.reflex + (f.blunder ? 0.35 : 0));
    }
    f.runFor = acid.id;
    moveAt(f, f.run.x, f.run.y, ARENA_STEP, ARENA_SPEED);
  }

  function rollHit(range) {
    const [lo, hi] = range;
    const span = Math.max(lo, hi) - lo;
    return span > 0 ? lo + Math.floor(rng() * (span + 1)) : lo;
  }

  function acidTick(living) {
    const acid = boss.intent;
    if (t >= acid.nextSpit && t < acid.t1 - acid.spitWarn && living.length) {
      const prey = living[Math.floor(rng() * living.length)];
      const spit = {
        id: acid.id + 's' + acid.spits.length,
        x: round1(prey.x),
        y: round1(prey.y),
        r: acid.spitR,
        t0: t,
        t1: round1(t + acid.spitWarn),
        done: false,
      };
      acid.spits.push(spit);
      acid.nextSpit = round1(t + acid.every);
      boss.targetId = prey.id;
      const clear = prey.run && prey.runFor === acid.id && Math.hypot(prey.run.x - spit.x, prey.run.y - spit.y) > spit.r + 3;
      if (!clear && !(prey.blunder && rng() < 0.5)) prey.run = acidSpot(prey, acid);
      hazards.push({
        id: spit.id,
        kind: 'circle',
        attack: 'spit',
        label: '',
        tone: 'acid-spit',
        t0: spit.t0,
        t1: spit.t1,
        x: spit.x,
        y: spit.y,
        r: spit.r,
        x1: round1(boss.x),
        y1: round1(boss.y - 2),
        x2: 0,
        y2: 0,
        w: 0,
      });
    }
    for (const spit of acid.spits) {
      if (spit.done || t < spit.t1) continue;
      spit.done = true;
      for (const f of living) {
        if (!f.alive || Math.hypot(f.x - spit.x, f.y - spit.y) > spit.r) continue;
        hurt(f, rollHit(acid.damage), boss.id, 'spit', 'ranged', acid.verb);
      }
    }
    for (const f of living) {
      if (!f.alive || t < (f.acidAt || 0) || !inAcid(f.x, f.y, acid, 0)) continue;
      f.acidAt = round1(t + 1.2);
      hurt(f, rollHit(acid.chip), boss.id, 'pool', 'ranged', 'burns');
    }
  }

  function confusionSpot(f) {
    const ang = Math.PI + (rng() - 0.5) * 1.15;
    const dist = 10 + rng() * 14;
    return arenaPoint(f.x + Math.cos(ang) * dist, f.y + Math.sin(ang) * dist * 0.6);
  }

  function behindRubble(f) {
    const fx = f.x - boss.x;
    const fy = f.y - boss.y;
    const fd = Math.hypot(fx, fy) || 1;
    for (const rock of rubble) {
      const bx = rock.x - boss.x;
      const by = rock.y - boss.y;
      const rd = Math.hypot(bx, by);
      if (rd < 1 || rd > fd - 1.2) continue;
      const dot = (bx * fx + by * fy) / (rd * fd);
      if (dot > 0.82) return true;
    }
    return false;
  }

  function coverPoint(f) {
    let best = null;
    let bestD = Infinity;
    for (const rock of rubble) {
      const bx = rock.x - boss.x;
      const by = rock.y - boss.y;
      const rd = Math.hypot(bx, by) || 1;
      const spot = arenaPoint(
        boss.x + (bx / rd) * (rd + rock.r + 2.4),
        boss.y + (by / rd) * (rd + rock.r + 2.4)
      );
      const d = Math.hypot(spot.x - f.x, spot.y - f.y);
      if (d < bestD) {
        best = spot;
        bestD = d;
      }
    }
    return best;
  }

  function dropRubble(n, when) {
    const cap = 14;
    for (let i = 0; i < n && rubble.length < cap; i++) {
      const ang = rng() * Math.PI * 2;
      const dist = 15 + rng() * 12;
      const spot = arenaPoint(boss.x + Math.cos(ang) * dist, boss.y + Math.sin(ang) * dist * 0.72);
      if (Math.hypot(spot.x - boss.x, spot.y - boss.y) < boss.radius + 5) continue;
      if (rubble.some((rock) => Math.hypot(rock.x - spot.x, rock.y - spot.y) < 8)) continue;
      rubble.push({ x: round1(spot.x), y: round1(spot.y), r: 3.2, t: round1(when) });
    }
  }

  function washToEdge(f) {
    let dx = f.x - boss.x;
    let dy = f.y - boss.y;
    if (Math.hypot(dx, dy) < 0.4) {
      dx = 1;
      dy = (rng() - 0.5) * 0.4;
    }
    const d = Math.hypot(dx, dy) || 1;
    const spot = arenaPoint(boss.x + (dx / d) * 90, boss.y + (dy / d) * 70);
    f.x = spot.x;
    f.y = spot.y;
  }

  function shoveOffRubble(f) {
    for (let pass = 0; pass < 2; pass++) {
      for (const rock of rubble) {
        const dx = f.x - rock.x;
        const dy = f.y - rock.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const need = rock.r + 1.6;
        if (d >= need) continue;
        f.x = rock.x + (dx / d) * need;
        f.y = rock.y + (dy / d) * need;
      }
    }
  }

  function routePoint(f, dest) {
    let hit = null;
    let best = Infinity;
    for (const rock of rubble) {
      const d = Math.hypot(dest.x - rock.x, dest.y - rock.y);
      if (d < rock.r + 2.4 && d < best) {
        hit = rock;
        best = d;
      }
    }
    if (!hit) return dest;
    const dx = dest.x - f.x;
    const dy = dest.y - f.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const left = arenaPoint(f.x + px * 7, f.y + py * 7);
    const right = arenaPoint(f.x - px * 7, f.y - py * 7);
    const dl = Math.hypot(left.x - dest.x, left.y - dest.y);
    const dr = Math.hypot(right.x - dest.x, right.y - dest.y);
    return dl < dr ? left : right;
  }

  function resolveAttack(living) {
    const intent = boss.intent;
    if (!intent) return;
    if (intent.kind === 'acid') {
      boss.cd = intent.cooldown || 2.4;
      boss.intent = null;
      return;
    }
    const caught = new Set();
    let spark = null;
    const [lo, hi] = intent.damage || [8, 14];
    for (const f of living) {
      const forced = intent.effect === 'wash';
      if (!forced && !inHazard(f, intent)) continue;
      if (intent.effect === 'smoke' && behindRubble(f)) {
        caught.add(f.id);
        hurt(f, 0, boss.id, intent.attack, intent.style || 'magic', intent.verb);
        continue;
      }
      caught.add(f.id);
      let verb = intent.verb;
      let style = intent.style || 'melee';
      if (intent.zones && intent.zones.length) {
        let zone = null;
        for (const candidate of intent.zones) {
          if (Math.hypot(f.x - candidate.x, f.y - candidate.y) <= candidate.r) zone = candidate;
        }
        if (zone && zone.verb) verb = zone.verb;
        if (zone && zone.style) style = zone.style;
      }
      const span = Math.max(lo, hi) - lo;
      const amount = span > 0 ? lo + Math.floor(rng() * (span + 1)) : lo;
      hurt(f, amount, boss.id, intent.attack, style, verb, intent.effect);
      if (intent.hops && amount > 0 && (!spark || f.id === intent.aimId)) spark = { f, amount };
      if (intent.effect === 'wash') {
        washToEdge(f);
        f.track.push([t, round1(f.x), round1(f.y), '']);
      }
      if (intent.effect === 'blink') {
        const spot = confusionSpot(f);
        f.x = spot.x;
        f.y = spot.y;
        f.track.push([t, round1(f.x), round1(f.y), '']);
      }
      if (intent.effect === 'madness' && f.alive) {
        f.mad = round1(t + (intent.mad || 5));
        f.cd = Math.min(f.cd, 0.4);
        hits[hits.length - 1].until = f.mad;
      }
      if (intent.effect === 'freeze' && f.alive) {
        f.frozen = round1(t + (intent.freeze || 2));
        hits[hits.length - 1].until = f.frozen;
      }
    }
    if (intent.effect === 'wash') dropRubble(6, t);
    if (intent.effect === 'settle' && intent.zones) {
      for (const zone of intent.zones) {
        if (rubble.length >= 14) break;
        if (Math.hypot(zone.x - boss.x, zone.y - boss.y) < boss.radius + 4) continue;
        if (rubble.some((rock) => Math.hypot(rock.x - zone.x, rock.y - zone.y) < 7)) continue;
        rubble.push({ x: round1(zone.x), y: round1(zone.y), r: 3.1, t: round1(t) });
      }
    }
    if (intent.aimId && !caught.has(intent.aimId) && intent.effect !== 'wash' && intent.effect !== 'smoke') {
      const aim = bodies.find((b) => b.id === intent.aimId);
      if (aim && aim.alive) hurt(aim, 0, boss.id, intent.attack, intent.style || 'melee', intent.verb);
    }
    if (spark) {
      bounces.push({
        at: round1(t + BOUNCE_GAP),
        from: spark.f,
        amount: spark.amount,
        left: intent.hops,
        reach: intent.hop,
        falloff: intent.falloff,
        hit: new Set(caught),
        style: intent.style || 'magic',
        verb: intent.hopVerb,
      });
    }
    boss.buried = false;
    boss.cd = intent.cooldown || 2.4;
    boss.intent = null;
  }

  for (let step = 0; step < limit / ARENA_STEP; step++) {
    t = round1((step + 1) * ARENA_STEP);
    const living = livingPlayers();
    if (!boss.alive) {
      winnerIds = living.map((b) => b.id);
      break;
    }
    if (!living.length) {
      winnerId = boss.id;
      break;
    }
    if (spec.rats && t >= nextRat) {
      spawnRats();
      nextRat = round1(t + (spec.rats.every || 8));
    }
    const intent = boss.intent;
    if (boss.moltUntil && t >= boss.moltUntil) {
      boss.moltUntil = 0;
      boss.buried = false;
    }
    if (boss.moltUntil) {
      boss.targetId = null;
    } else if (rooted) {
      if (!intent) {
        const prey = nearest(living);
        boss.targetId = prey ? prey.id : null;
        boss.cd -= ARENA_STEP;
        if (boss.cd <= 0) beginAttack(living);
      } else if (intent.aimId) {
        boss.targetId = intent.aimId;
      }
    } else if (intent && t >= intent.t1) {
      // Positions update before the hit, so a step that clears the mark is a dodge.
    } else if (intent && intent.kind === 'lane' && !intent.hold && t >= intent.dashAt) {
      moveAt(boss, intent.x2, intent.y2, ARENA_STEP, spec.chargeSpeed || 60);
      boss.targetId = intent.aimId;
    } else if (intent && intent.kind === 'mark') {
      const prey = nearest(living);
      if (prey) {
        boss.targetId = prey.id;
        if (arenaDist(boss, prey) > boss.radius + 3.2) moveAt(boss, prey.x, prey.y, ARENA_STEP, boss.speed);
      }
    } else if (!intent) {
      const prey = nearest(living);
      if (prey) {
        boss.targetId = prey.id;
        if (arenaDist(boss, prey) > boss.radius + 3.2) moveAt(boss, prey.x, prey.y, ARENA_STEP, boss.speed);
      }
      boss.cd -= ARENA_STEP;
      if (boss.cd <= 0) beginAttack(living);
    } else if (intent.aimId) {
      boss.targetId = intent.aimId;
    }
    clampBoss(boss);

    for (const f of bodies) {
      if (!f.alive) continue;
      if (boss.intent && f.seen !== boss.intent.id) {
        f.seen = boss.intent.id;
        f.dodgeAt = round1(t + f.reflex);
      }
      if (f.frozen && t < f.frozen) continue;
      if (boss.intent && boss.intent.kind === 'acid') {
        acidRun(f);
        continue;
      }
      const prey = madPrey(f);
      const away = prey ? null : dodgePoint(f);
      const ratJob = f.clears ? nearestRat(f, f.style === 'melee' ? 20 : 28) : null;
      if (prey) {
        if (arenaDist(f, prey) > madReach(f) - 0.8) moveAt(f, prey.x, prey.y, ARENA_STEP, ARENA_SPEED);
      } else if (away) moveAt(f, away.x, away.y, ARENA_STEP, ARENA_SPEED);
      else if (ratJob) {
        if (arenaDist(f, ratJob) > ratJob.radius + (f.style === 'melee' ? 2.4 : 16)) {
          moveAt(f, ratJob.x, ratJob.y, ARENA_STEP, ARENA_SPEED);
        }
      } else if (boss.alive) {
        if (f.style !== 'melee') f.orbit += 0.22 * ARENA_STEP;
        const spot = routePoint(f, combatPoint(f, living));
        const blocked = boss.intent && pointIn(spot.x, spot.y, boss.intent, 0.8);
        if (!blocked) moveAt(f, spot.x, spot.y, ARENA_STEP, ARENA_SPEED);
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
    if (!boss.intent) {
      const minDist = boss.radius + 1.1;
      for (const f of bodies) {
        if (!f.alive) continue;
        const d = arenaDist(f, boss);
        if (d < minDist && d > 0.001) {
          f.x = boss.x + ((f.x - boss.x) / d) * minDist;
          f.y = boss.y + ((f.y - boss.y) / d) * minDist;
        }
      }
    }
    for (const f of bodies) {
      if (!f.alive) continue;
      const stuck = f.frozen && t < f.frozen;
      const away = madPrey(f) || stuck ? null : dodgePoint(f);
      if (away) moveAt(f, away.x, away.y, ARENA_STEP, ARENA_SPEED);
      shoveOffRubble(f);
      arenaClamp(f);
    }
    clampBoss(boss);
    const surfacing = boss.intent && boss.intent.kind === 'burrow' && t >= boss.intent.t1;
    if (surfacing) {
      boss.x = boss.intent.x;
      boss.y = boss.intent.y;
      boss.buried = false;
    }

    boss.track.push([t, round1(boss.x), round1(boss.y), boss.targetId || '', surfacing ? 'up' : '']);
    const walking = !!(boss.intent && boss.intent.kind === 'acid');
    if (walking) acidTick(livingPlayers());
    for (const f of bodies) {
      if (!f.alive) continue;
      if (walking) {
        f.track.push([t, round1(f.x), round1(f.y), '']);
        f.cd = Math.max(0, f.cd - ARENA_STEP);
        continue;
      }
      const onYou = nearestRat(f, f.style === 'melee' ? 4.6 : 14);
      const hunt = f.clears ? nearestRat(f, f.style === 'melee' ? 20 : 28) : null;
      const rat = onYou || hunt;
      const prey = madPrey(f);
      f.track.push([t, round1(f.x), round1(f.y), prey ? prey.id : rat ? rat.id : (boss.alive ? boss.id : '')]);
      f.cd -= ARENA_STEP;
      if (f.cd > 0) continue;
      if (prey) {
        if (arenaDist(f, prey) > madReach(f)) continue;
        f.cd = f.attack;
        const atk = arenaStats(f, t);
        const miss = rng() > hitChance(atk.acc, arenaStats(prey, t).def);
        const amount = miss ? 0 : 1 + Math.floor(rng() * atk.max);
        hurt(prey, amount, f.id, 'mad', f.style, '');
        continue;
      }
      if (rat) {
        const reach = rat.radius + (f.style === 'melee' ? 3.4 : 18);
        if (arenaDist(f, rat) <= reach) {
          f.cd = f.attack;
          const atk = arenaStats(f, t);
          const miss = rng() > hitChance(atk.acc, 6);
          const amount = miss ? 0 : 1 + Math.floor(rng() * atk.max);
          hurt(rat, amount, f.id, '', f.style, '');
          continue;
        }
        if (hunt) continue;
      }
      if (!boss.alive || boss.buried) continue;
      const reach = boss.radius + arenaRange(f.style) + 0.4;
      if (arenaDist(f, boss) > reach) continue;
      f.cd = f.attack;
      const atk = arenaStats(f, t);
      const miss = rng() > hitChance(atk.acc, boss.defence);
      const amount = miss ? 0 : 1 + Math.floor(rng() * atk.max);
      hurt(boss, amount, f.id, '', f.style, '');
      if (!boss.alive) break;
    }
    if (!boss.alive) {
      winnerIds = livingPlayers().map((b) => b.id);
      break;
    }
    for (const rat of rats) {
      if (!rat.alive) continue;
      const prey = nearest(livingPlayers());
      if (prey) {
        rat.targetId = prey.id;
        if (arenaDist(rat, prey) > rat.radius + 1.5) moveAt(rat, prey.x, prey.y, ARENA_STEP, rat.speed);
      }
      arenaClamp(rat);
      rat.track.push([t, round1(rat.x), round1(rat.y), rat.targetId || '']);
      rat.cd -= ARENA_STEP;
      if (!prey || rat.cd > 0) continue;
      if (arenaDist(rat, prey) > rat.radius + 1.9) continue;
      rat.cd = 2.6;
      const bite = spec.rats.damage || [4, 8];
      const amount = bite[0] + Math.floor(rng() * (Math.max(bite[0], bite[1]) - bite[0] + 1));
      hurt(prey, amount, rat.id, 'nip', 'melee', spec.rats.verb || 'nips');
    }
    if (bounces.length) bounceTick();
    if (boss.intent && t >= boss.intent.t1) resolveAttack(livingPlayers());
    if (!livingPlayers().length) {
      winnerId = boss.id;
      break;
    }
  }
  if (!winnerIds && !winnerId) {
    if (!boss.alive) winnerIds = livingPlayers().map((b) => b.id);
    else {
      winnerId = boss.id;
      called = true;
    }
  }
  const end = round1(t + 1.4);
  boss.track.push([end, round1(boss.x), round1(boss.y), '']);
  for (const f of bodies) f.track.push([end, round1(f.x), round1(f.y), '']);
  for (const rat of rats) rat.track.push([end, round1(rat.x), round1(rat.y), '']);

  const livingEnd = bodies.filter((b) => b.alive);
  const wiped = !livingEnd.length || boss.alive;
  const purse = wiped ? 0 : (spec.gold || 0) + bodies.length * (spec.goldEach || 0);
  const share = !wiped && livingEnd.length ? Math.floor(purse / livingEnd.length) : 0;
  let rem = !wiped && livingEnd.length ? purse - share * livingEnd.length : 0;
  const shares = wiped ? [] : livingEnd.map((b) => {
    const gold = share + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return { id: b.id, name: b.name, gold };
  });
  let drop = null;
  let spooply = null;
  if (!wiped && (spec.loot || []).length && livingEnd.length) {
    drop = buildRaidRoll(spec.loot, rng);
    const who = livingEnd[Math.floor(rng() * livingEnd.length)];
    spooply = { id: who.id, name: who.name };
  }
  const party = bodies.map((b) => ({
    id: b.id,
    name: b.name,
    alive: b.alive,
    hp: b.hp,
    maxHp: b.maxHp,
  }));
  const bossView = {
    id: boss.id,
    name: boss.name,
    monster: spec.monster,
    sprite: spec.sprite,
    face: spec.face || '',
    tierName: spec.tierName || '',
    forLevel: spec.forLevel || 0,
    partyLevel: Math.round(meter.combat),
    combat: spec.level || null,
    style: 'melee',
    maxHp: boss.maxHp,
    maxHit: Math.max(...allAttacks.map((atk) => (atk.damage && atk.damage[1]) || 0), 0),
    levels: null,
    weapon: '',
    gear: [],
    equipped: null,
    prayer: null,
  };
  const ratViews = rats.map((rat) => ({
    id: rat.id,
    name: rat.name,
    monster: 'rat',
    sprite: (spec.rats && spec.rats.sprite) || '/assets/pets/Giant_rat.png',
    face: 'left',
    tierName: '',
    combat: null,
    style: 'melee',
    maxHp: rat.maxHp,
    maxHit: rat.maxHit,
    levels: null,
    weapon: '',
    gear: [],
    equipped: null,
    prayer: null,
  }));
  return {
    width: ARENA_W,
    height: ARENA_H,
    formation: 'raid',
    bossName: spec.name,
    scene: spec.scene || '',
    duration: end,
    called,
    rageAt: rageAt || 0,
    winnerId,
    winnerIds: winnerIds || [],
    fighters: [bossView].concat(ratViews, raidFighters(profiles)),
    tracks: [{ id: boss.id, pts: boss.track }]
      .concat(rats.map((rat) => ({ id: rat.id, pts: rat.track })))
      .concat(bodies.map((b) => ({ id: b.id, pts: b.track }))),
    hits,
    deaths,
    hazards,
    rubble,
    phases,
    party,
    loot: {
      wiped: !!wiped,
      gold: purse,
      shares,
      drop,
      spooply,
    },
  };
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
    const interval = gear.attack > 0 ? gear.attack : attackInterval(null);
    portrait.attack = interval;
    return { portrait, gear, levels, style: gear.style, prayer, attack: interval, fortune: boutFortune(rng) };
  });
  if (formation === 'dragon') return simulateDragon(profiles, rng);
  const spawns = arenaSpawns(spoops.length, rng, formation);
  const bodies = profiles.map((p, i) => {
    const windup = arenaWindup(p.attack, rng);
    p.portrait.windup = windup;
    return {
      id: p.portrait.id,
      name: p.portrait.name,
      style: p.style,
      levels: p.levels,
      gear: p.gear,
      prayer: p.prayer,
      fortune: p.fortune,
      hp: Math.max(1, Math.round(p.portrait.maxHp * p.fortune)),
      maxHp: Math.max(1, Math.round(p.portrait.maxHp * p.fortune)),
      x: spawns[i].x,
      y: spawns[i].y,
      alive: true,
      targetId: null,
      retargetAt: rng() * 0.8,
      attack: p.attack,
      cd: windup,
      wander: null,
      wanderUntil: 0,
      track: [[0, round1(spawns[i].x), round1(spawns[i].y)]],
    };
  });
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
      f.cd = f.attack;
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
  // The portrait's hitpoints level is the spoop sheet. The bout pool is that
  // level nudged by fortune, and the hits are counted on the pool. The bar
  // has to use the same number or a third of their health misses the bar.
  profiles.forEach((p, i) => {
    p.portrait.maxHp = bodies[i].maxHp;
  });
  return {
    width: ARENA_W,
    height: ARENA_H,
    formation: spawns.kind,
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

function capWord(text) {
  const s = String(text || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function cratePieceName(spec) {
  if (spec.plainName) return capWord(spec.baseName);
  return capWord(tierById(spec.tier).name + ' ' + spec.baseName);
}

function viewNamedPiece(piece, tierId) {
  const spec = pieceSpec(piece, tierId, 'standard', piece.slot);
  return {
    name: cratePieceName(spec),
    osrsId: piece.osrsId || osrsIdFor(spec),
    slot: piece.slot,
    rare: !!piece.rare,
  };
}

function dhideViews(tierId) {
  const items = [];
  for (const piece of DHIDE) {
    if (!piece.tiers || !piece.tiers[tierId]) continue;
    const spec = pieceSpec(piece, piece.tier, 'standard');
    items.push({ name: cratePieceName(spec), osrsId: osrsIdFor(spec), slot: piece.slot });
  }
  return items;
}

function clothViews(tierId) {
  const items = [];
  for (const piece of CLOTH) {
    if (!piece.tiers || !piece.tiers[tierId]) continue;
    const spec = pieceSpec(piece, piece.tier, 'standard');
    items.push({ name: cratePieceName(spec), osrsId: osrsIdFor(spec), slot: piece.slot });
  }
  return items;
}

function piecesForTier(tierId) {
  if (tierId === 'barrows' || tierId === 'raid') {
    return NAMED_GEAR.filter((piece) => piece.tier === tierId).map((piece) => viewNamedPiece(piece, tierId)).concat(dhideViews(tierId), clothViews(tierId));
  }
  const items = [];
  for (const weapon of WEAPONS) {
    const spec = pieceSpec(weapon, tierId, 'standard', 'weapon');
    items.push({ name: cratePieceName(spec), osrsId: osrsIdFor(spec), slot: 'weapon' });
  }
  for (const armor of ARMOR) {
    const spec = pieceSpec(armor, tierId, 'standard');
    items.push({ name: cratePieceName(spec), osrsId: osrsIdFor(spec), slot: armor.slot });
  }
  items.push(...dhideViews(tierId));
  items.push(...clothViews(tierId));
  for (const piece of NAMED_GEAR) {
    if (piece.tier !== tierId || tierId === 'dragon') continue;
    items.push(viewNamedPiece(piece, tierId));
  }
  for (const helm of CUSTOM_HELMS) {
    if (helm.tier !== tierId) continue;
    const spec = pieceSpec(helm, tierId, 'standard');
    items.push({ name: cratePieceName(spec), osrsId: osrsIdFor(spec), slot: 'head', rare: true });
  }
  if (tierId === 'dragon') {
    for (const piece of NAMED_GEAR) {
      if (piece.tier !== 'dragon') continue;
      const view = viewNamedPiece(piece, tierId);
      view.rare = true;
      items.push(view);
    }
  }
  return items;
}

// Exact odds of randomPiece, keyed by the name the contents sheet shows.
// Keep this in step with randomPiece and the maybe* rolls it calls.
function weightedShares(items, weightFn) {
  const weights = items.map((item) => Math.max(0, weightFn(item)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return items.map((item, i) => [item, total > 0 ? weights[i] / total : 1 / items.length]);
}

function spreadPiece(piece, step) {
  return step(piece) || [[piece, 1]];
}

function spreadAll(rows, step) {
  const out = [];
  for (const [piece, p] of rows) {
    for (const [next, q] of spreadPiece(piece, step)) out.push([next, p * q]);
  }
  return out;
}

function pieceOdds(tierId, build, shift) {
  const spoop = { build };
  const odds = new Map();
  const add = (piece, slot, p) => {
    if (!piece || p <= 0) return;
    const key = cratePieceName(pieceSpec(piece, tierId, 'standard', slot));
    odds.set(key, (odds.get(key) || 0) + p);
  };
  const plain = (piece) => piece.plainName || piece.gearStyle;
  let rest = 1;
  if (tierId === 'barrows' || tierId === 'raid') {
    const hide = hideChance(spoop, tierId, shift);
    for (const slot of ['body', 'legs', 'gloves']) {
      const options = dhideOptions(tierId, slot);
      if (!options.length) continue;
      for (const [row, q] of weightedShares(options, (r) => r.tiers[tierId])) add(row, row.slot, (hide / 3) * q);
      rest -= hide / 3;
    }
  }
  const named = NAMED_GEAR.filter((item) => item.tier === tierId);
  const namedShare = tierId === 'barrows' || tierId === 'raid' ? 1 : tierId === 'dragon' ? 0.22 : 0;
  if (named.length && namedShare) {
    for (const [item, q] of weightedShares(named, (row) => row.weight || 1)) add(item, item.slot, rest * namedShare * q);
    rest *= 1 - namedShare;
  }
  if (rest <= 0) return odds;
  const lowTier = tierId !== 'dragon' && tierId !== 'barrows' && tierId !== 'raid';
  for (const weapon of WEAPONS) {
    const rows = spreadPiece(weapon, (w) => {
      if (!lowTier) return null;
      const options = NAMED_GEAR.filter((item) => item.tier === tierId && item.slot === 'weapon' && item.style === w.style);
      if (!options.length) return null;
      return [[w, 0.5]].concat(weightedShares(options, (item) => item.weight || 1).map(([item, q]) => [item, 0.5 * q]));
    });
    for (const [piece, q] of rows) add(piece, 'weapon', rest * 0.45 * q / WEAPONS.length);
  }
  for (const armor of ARMOR) {
    let rows = spreadPiece(armor, (piece) => {
      const pool = piece.slot === 'head' ? CUSTOM_HELMS.filter((helm) => helm.tier === tierId) : [];
      if (!pool.length) return null;
      return [[piece, 0.78]].concat(pool.map((helm) => [helm, 0.22 / pool.length]));
    });
    rows = spreadAll(rows, (piece) => {
      if (plain(piece)) return null;
      const options = clothOptions(tierId, piece.slot, spoop);
      if (!options.length) return null;
      const styled = options.filter((row) => !row.anyStyle);
      const universal = options.filter((row) => row.anyStyle);
      const out = [];
      let left = 1;
      if (styled.length) {
        const chance = clothChance(spoop, tierId);
        for (const [row, q] of weightedShares(styled, (r) => r.tiers[tierId])) out.push([row, chance * q]);
        left -= chance;
      }
      if (universal.length) {
        for (const [row, q] of weightedShares(universal, (r) => r.tiers[tierId])) out.push([row, left * 0.12 * q]);
        left *= 0.88;
      }
      out.push([piece, left]);
      return out;
    });
    rows = spreadAll(rows, (piece) => {
      if (plain(piece)) return null;
      const options = dhideOptions(tierId, piece.slot);
      if (!options.length) return null;
      const hide = hideChance(spoop, tierId, shift);
      return [[piece, 1 - hide]].concat(weightedShares(options, (r) => r.tiers[tierId]).map(([row, q]) => [row, hide * q]));
    });
    rows = spreadAll(rows, (piece) => {
      if (plain(piece) || !lowTier) return null;
      const options = NAMED_GEAR.filter((item) => item.tier === tierId && item.slot === piece.slot && fitsBuild(item, build));
      if (!options.length) return null;
      return [[piece, 0.5]].concat(weightedShares(options, (item) => item.weight || 1).map(([item, q]) => [item, 0.5 * q]));
    });
    for (const [piece, q] of rows) add(piece, undefined, rest * 0.55 * q / ARMOR.length);
  }
  return odds;
}

// Chance per build that one crate open pays this exact piece.
function attachOdds(items, oddsByBuild, scale) {
  for (const item of items) {
    item.chance = {};
    for (const build of BUILDS) item.chance[build] = (oddsByBuild[build].get(item.name) || 0) * scale;
  }
}

function uniqueByName(items) {
  const seen = new Set();
  return items.filter((item) => !seen.has(item.name) && seen.add(item.name));
}

const crateLootCache = new Map();

let lampTableCache = null;

function lampTable() {
  if (lampTableCache) return lampTableCache;
  const items = weightedShares(XP_LAMPS, (lamp) => lamp.weight).map(([lamp, share]) => ({
    name: lamp.name,
    osrsId: lamp.osrsId,
    lamp: lamp.id,
    job: lamp.xp.toLocaleString('en-US') + ' XP',
    chance: share,
  }));
  lampTableCache = {
    name: 'XP lamps',
    quality: 'One lamp. Open it from the inventory and pick the skill it goes to.',
    groups: [{ label: 'XP lamps', items }],
  };
  return lampTableCache;
}

function crateLoot(crate) {
  const cached = crateLootCache.get(crate.id);
  if (cached) return cached;
  if (crate.lamps) {
    const table = lampTable();
    const loot = { quality: crate.note || table.quality, groups: table.groups };
    crateLootCache.set(crate.id, loot);
    return loot;
  }
  const lamp = { chance: (1 - (crate.mega || 0)) * LAMP_CHANCE, name: 'XP lamp', osrsId: XP_LAMPS[0].osrsId };
  const gearShare = (1 - (crate.mega || 0)) * (1 - LAMP_CHANCE);
  if (crate.style) {
    const pool = crate.items || [];
    const items = pool.map((piece) => viewNamedPiece(piece, piece.tier));
    const counts = new Map();
    for (const item of items) counts.set(item.name, (counts.get(item.name) || 0) + 1 / pool.length);
    attachOdds(items, Object.fromEntries(BUILDS.map((build) => [build, counts])), gearShare);
    const loot = {
      quality: crate.note || 'One piece from this list.',
      groups: [{
        label: crate.style === 'magic' ? 'Magic' : 'Ranged',
        items: uniqueByName(items),
      }],
      lamp,
    };
    crateLootCache.set(crate.id, loot);
    return loot;
  }
  const ids = TIERS.map((tier) => tier.id);
  const index = ids.indexOf(crate.tier);
  // Same split as nearbyTier. Only the crate's own tier gets its quality shift.
  const below = index > 0 ? ids[index - 1] : null;
  const above = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null;
  const rolls = [{ tierId: crate.tier, share: 1 - (below ? 0.14 : 0) - (above ? 0.12 : 0), shift: crate.shift, label: '' }];
  if (below) rolls.push({ tierId: below, share: 0.14, shift: 0, label: ' · less often' });
  if (above) rolls.push({ tierId: above, share: 0.12, shift: 0, label: ' · less often' });
  const oddsByBuild = {};
  for (const build of BUILDS) {
    const total = new Map();
    for (const roll of rolls) {
      for (const [name, p] of pieceOdds(roll.tierId, build, roll.shift)) total.set(name, (total.get(name) || 0) + roll.share * p);
    }
    oddsByBuild[build] = total;
  }
  // A plain name like a wizard hat can come from more than one tier. It shows once, with both shares.
  const listed = new Set();
  const groups = rolls.map((roll) => {
    const items = uniqueByName(piecesForTier(roll.tierId)).filter((item) => !listed.has(item.name));
    for (const item of items) listed.add(item.name);
    attachOdds(items, oddsByBuild, gearShare);
    return { label: capWord(tierById(roll.tierId).name) + roll.label, items };
  }).filter((group) => group.items.length);
  const loot = {
    quality: crate.shift
      ? 'Each piece can be crude through masterwork. This crate leans toward fine and better.'
      : 'Each piece can be crude through masterwork. Standard is the most common.',
    groups,
    mega: crate.mega > 0 ? { chance: crate.mega, name: MEGA_CHEST.name, osrsId: MEGA_CHEST.osrsId } : null,
    lamp,
  };
  crateLootCache.set(crate.id, loot);
  return loot;
}

let megaTableCache = null;

// The chest's sheet, slot by slot, with what each piece is for.
function megaTable() {
  if (megaTableCache) return megaTableCache;
  const items = weightedShares(MEGA_RARES, (row) => row.weight || 1).map(([piece, share]) => Object.assign(viewNamedPiece(piece, 'raid'), {
    job: piece.job || '',
    chance: share,
    mega: true,
  }));
  megaTableCache = {
    name: MEGA_CHEST.name,
    osrsId: MEGA_CHEST.osrsId,
    quality: 'One megarare, rolled evenly across the table. Each piece leans toward fine and better.',
    groups: SLOTS.map((slot) => ({
      label: CRATE_SLOT[slot] || capWord(slot),
      items: items.filter((item) => item.slot === slot),
    })).filter((group) => group.items.length),
  };
  return megaTableCache;
}

// Twisted bows, scythes, and shadows found before the megarare table keep
// their slot and quality and pick up the megarare sheet.
const OLD_MEGA_IDS = new Map([[20997, 'twisted-bow'], [22325, 'scythe'], [27275, 'shadow']]);

function tagOldMega(item) {
  if (!item || item.mega || item.tier !== 'raid' || item.slot !== 'weapon') return false;
  const id = OLD_MEGA_IDS.get(Number(item.osrsId));
  const piece = id && MEGA_BY_ID.get(id);
  if (!piece) return false;
  item.mega = piece.id;
  item.baseId = piece.baseId;
  item.style = piece.style;
  if (piece.gearStyle) item.gearStyle = piece.gearStyle;
  if (!item.uniqueName) {
    item.baseName = piece.name;
    item.plainName = true;
  }
  return true;
}

function ensureMegaRares(state) {
  if (!state || !state.spoops) return false;
  let changed = false;
  for (const spoop of Object.values(state.spoops)) {
    if (!spoop) continue;
    for (const item of Array.isArray(spoop.bank) ? spoop.bank : []) {
      if (tagOldMega(item)) changed = true;
    }
    for (const slot of SLOTS) {
      if (tagOldMega(spoop.equipped && spoop.equipped[slot])) changed = true;
    }
  }
  return changed;
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
    duels: presentDuels(state),
    crates: CRATES.map((crate) => ({
      id: crate.id,
      name: crate.name,
      tier: crate.tier,
      style: crate.style || null,
      lamps: !!crate.lamps,
      tint: crate.tint || null,
      shift: crate.shift,
      cost: crate.cost,
      mega: crate.mega || 0,
      loot: crateLoot(crate),
    })),
    megaTable: megaTable(),
    lampTable: lampTable(),
    bankSlots: BANK_SLOTS,
    spoops: Object.values(state.spoops).map((spoop) => {
      const view = presentSpoop(spoop);
      view.social = social.presentSocial(state, spoop);
      const next = nextSpoopAction(state, spoop, clock);
      view.nextAction = next
        ? { at: next.at.toISOString(), time: clockLabel(next.at), kind: next.kind, line: nextMoveLine(state, spoop, clock) }
        : null;
      return view;
    }),
    feuds: social.presentFeuds(state),
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
    nextTitle: next ? arenaNightPlan(next.when).title : null,
    nextKind: next ? arenaNightPlan(next.when).kind : null,
    nextDetail: next ? nightBlurb(state, next.when) : '',
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
  LOG_KEEP,
  STARTER_NAME,
  TZ,
  createWorld,
  applyRosterNames,
  ensureRoster,
  ensureStarterGear,
  ensureMegaRares,
  grantGoldGift,
  createSpoop,
  advance,
  openCrate,
  openMegaChest,
  useLamp,
  sellBankItem,
  sellJackpot,
  applyWearRules,
  setCombatBuild,
  setTrainingFocus,
  setAutoSell,
  setEquipMode,
  issueDuel,
  cancelDuel,
  declineDuel,
  acceptDuel,
  equipBankItem,
  unequipItem,
  presentWorld,
  nextEventAfter,
  combatLevel,
  levelForXp,
  equipmentStats,
  equippedGearRating,
  etDayKey,
  formatEt,
  nextArenaAfter,
  scheduleBetween,
  hashString,
  mulberry32,
  bossEncounter,
  considerPk,
  resolveDuePk,
  presentDuelWatch,
  schedulePk,
  arenaSnapshot,
  noteOddsHour,
  arenaNightPlan,
  testArena,
  testRaid,
  testRaidNight,
};
