/**
 * Personalities and how spoops see each other.
 *
 * Flavor only. Nothing here is read by a fight, a roll, an activity pick, or
 * the odds, so outcomes and replays are the same with or without it. Every
 * note* call runs once, where a result is committed inside advance or a PK
 * settle, and the world save is guarded by the clock, so nothing counts twice.
 */

const AXES = ['boldness', 'greed', 'temper', 'warmth'];
const AXIS_LIMIT = 100;
const SEED_SPAN = 20;
const MOOD_AT = 40;
const MOOD_LOW = -35;
const OPINION_LIMIT = 100;
const TAG_KEEP = 4;
const TAG_DAYS = 45;
const OPINION_FADE = 0.97;
const AXIS_FADE = 0.99;
const GRUDGE_FLOOR = -30;
const DRAMA_KEEP = 3;

const TRAITS = {
  cursed: { name: 'Cursed', detail: 'Died in three raids in a row while others walked out.' },
  bloodthirsty: { name: 'Bloodthirsty', detail: 'Won five PKs.' },
  'giant-slayer': { name: 'Giant Slayer', detail: 'Beat a spoop ten or more combat levels higher.' },
  underdog: { name: 'Underdog', detail: 'Won the night as one of the weakest in the field.' },
  'sore-loser': { name: 'Sore Loser', detail: 'Lost to the same spoop three times.' },
  survivor: { name: 'Survivor', detail: 'Walked out of ten raids alive.' },
  'public-enemy': { name: 'Public Enemy', detail: 'Four or more spoops have a problem with them.' },
  beloved: { name: 'Beloved', detail: 'Three or more spoops count them as a pal.' },
  'grudge-keeper': { name: 'Grudge Keeper', detail: 'Has a problem with three or more spoops at once.' },
  hothead: { name: 'Hothead', detail: 'Losses stick. Their temper is running high.' },
  'cool-headed': { name: 'Cool-headed', detail: 'Nothing seems to get to them.' },
  reckless: { name: 'Reckless', detail: 'Keeps walking out of bad fights and going back in.' },
  careful: { name: 'Careful', detail: 'Has learned to fear the dungeon.' },
  'pack-rat': { name: 'Pack Rat', detail: 'Wants every drop and keeps all of it.' },
  generous: { name: 'Generous', detail: 'Does not seem to care who gets the loot.' },
  'party-animal': { name: 'Party Animal', detail: 'Happiest in a raid party.' },
  loner: { name: 'Loner', detail: 'Would rather not be in a party.' },
};

// Earned traits stay once earned. Title picks the first one held in this order.
const EARNED_ORDER = ['cursed', 'bloodthirsty', 'public-enemy', 'beloved', 'giant-slayer', 'underdog', 'sore-loser', 'grudge-keeper', 'survivor'];

const MOODS = [
  { id: 'hothead', axis: 'temper', high: true },
  { id: 'cool-headed', axis: 'temper', high: false },
  { id: 'reckless', axis: 'boldness', high: true },
  { id: 'careful', axis: 'boldness', high: false },
  { id: 'pack-rat', axis: 'greed', high: true },
  { id: 'generous', axis: 'greed', high: false },
  { id: 'party-animal', axis: 'warmth', high: true },
  { id: 'loner', axis: 'warmth', high: false },
];

const LABELS = {
  nemesis: 'Nemesis',
  rival: 'Rival',
  contempt: 'Can\u2019t stand',
  idol: 'Looks up to',
  pal: 'Pal',
};

const HOSTILE = new Set(['nemesis', 'rival', 'contempt']);
const FRIENDLY = new Set(['idol', 'pal']);

function hash(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function keyOf(state, spoop) {
  if (!spoop) return '';
  if (spoop.owner && state.spoops && state.spoops[spoop.owner] === spoop) return spoop.owner;
  for (const [key, value] of Object.entries(state.spoops || {})) {
    if (value === spoop) return key;
  }
  return spoop.owner || spoop.name || '';
}

function seedAxes(key) {
  const axes = {};
  for (const axis of AXES) {
    const roll = (hash(key + '|mind|' + axis) % 1000) / 999;
    axes[axis] = Math.round((roll * 2 - 1) * SEED_SPAN);
  }
  return axes;
}

function mindOf(state, spoop) {
  if (!spoop.mind || typeof spoop.mind !== 'object') spoop.mind = {};
  const mind = spoop.mind;
  if (!mind.base) mind.base = seedAxes(keyOf(state, spoop));
  if (!mind.axes) mind.axes = Object.assign({}, mind.base);
  if (!mind.stats) mind.stats = {};
  if (!mind.stats.losesTo) mind.stats.losesTo = {};
  if (!Array.isArray(mind.earned)) mind.earned = [];
  return mind;
}

function shift(state, spoop, axis, amount) {
  const mind = mindOf(state, spoop);
  mind.axes[axis] = round1(clamp((mind.axes[axis] || 0) + amount, AXIS_LIMIT));
}

function bump(state, spoop, stat, amount) {
  const stats = mindOf(state, spoop).stats;
  stats[stat] = (Number(stats[stat]) || 0) + (amount == null ? 1 : amount);
  return stats[stat];
}

function opinion(state, holder, otherKey) {
  if (!holder.opinions || typeof holder.opinions !== 'object') holder.opinions = {};
  if (!holder.opinions[otherKey]) holder.opinions[otherKey] = { affinity: 0, respect: 0, tags: [] };
  return holder.opinions[otherKey];
}

function labelFor(o) {
  if (!o) return null;
  const a = Number(o.affinity) || 0;
  const r = Number(o.respect) || 0;
  if (a <= -50 && r >= 30) return 'nemesis';
  if (a <= -15 && r >= 12) return 'rival';
  if (a <= -15) return 'contempt';
  if (a >= 15 && r >= 30) return 'idol';
  if (a >= 15) return 'pal';
  return null;
}

const TAG_RANK = { 'took-item': 9, 'mad-kill': 8, envy: 6, 'final-loss': 5, 'mad-hit': 5, 'pk-loss': 5, 'raid-pal': 4, 'knocked-out': 3, 'spoopfight-kill': 3, met: 2, revenge: 1 };

const WARM_TAGS = new Set(['raid-pal', 'revenge']);

function tagIsWarm(tag) {
  return tag.kind === 'met' ? !!tag.good : WARM_TAGS.has(tag.kind);
}

// The reason shown matches how they feel: a pal's reason is a warm one if it has one.
function mainTag(o) {
  const tags = (o && o.tags) || [];
  const warm = (Number(o && o.affinity) || 0) > 0;
  let best = null;
  for (const tag of tags) {
    const fits = tagIsWarm(tag) === warm;
    const bestFits = best && tagIsWarm(best) === warm;
    if (!best || (fits && !bestFits) || (fits === bestFits && (TAG_RANK[tag.kind] || 0) > (TAG_RANK[best.kind] || 0))) best = tag;
  }
  return best;
}

function addTag(o, kind, at, extra) {
  const tag = Object.assign({ kind, at }, extra || {});
  o.tags = (o.tags || []).filter((row) => !(row.kind === kind && row.item === tag.item));
  o.tags.unshift(tag);
  if (o.tags.length > TAG_KEEP) o.tags.length = TAG_KEEP;
}

function dropTag(o, kind, item) {
  const before = (o.tags || []).length;
  o.tags = (o.tags || []).filter((row) => !(row.kind === kind && (item == null || row.item === item)));
  return o.tags.length !== before;
}

function nameOf(state, key) {
  const spoop = state.spoops && state.spoops[key];
  return spoop ? spoop.name : key;
}

// Moves one spoop's view of another and logs when the relationship turns over.
function feel(ctx, holder, other, affinity, respect, tag) {
  const { state, when, log } = ctx;
  const otherKey = keyOf(state, other);
  if (!otherKey || holder === other) return null;
  const o = opinion(state, holder, otherKey);
  const before = labelFor(o);
  o.affinity = round1(clamp((Number(o.affinity) || 0) + (affinity || 0), OPINION_LIMIT));
  o.respect = round1(clamp((Number(o.respect) || 0) + (respect || 0), OPINION_LIMIT));
  o.at = when.toISOString();
  if (tag) addTag(o, tag.kind, o.at, tag.extra);
  const after = labelFor(o);
  if (after && after !== before && log) {
    log(holder, when, `${stamp(when)} — ${turnLine(after, other.name)}`);
  }
  return { before, after, o };
}

function turnLine(label, name) {
  if (label === 'nemesis') return `${name} is their nemesis now.`;
  if (label === 'rival') return `Now sees ${name} as a rival.`;
  if (label === 'contempt') return `Can't stand ${name} anymore.`;
  if (label === 'idol') return `Has started looking up to ${name}.`;
  return `Counts ${name} as a pal now.`;
}

function stamp(when) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(when);
}

function earn(ctx, spoop, id) {
  const mind = mindOf(ctx.state, spoop);
  if (mind.earned.some((row) => row.id === id)) return false;
  mind.earned.push({ id, at: ctx.when.toISOString() });
  if (ctx.log) ctx.log(spoop, ctx.when, `${stamp(ctx.when)} — Earned a trait: ${TRAITS[id].name}. ${TRAITS[id].detail}`);
  return true;
}

function relationCounts(state, key) {
  const self = state.spoops[key];
  let holds = 0;
  for (const o of Object.values((self && self.opinions) || {})) {
    if (HOSTILE.has(labelFor(o))) holds += 1;
  }
  let hated = 0;
  let liked = 0;
  for (const [otherKey, other] of Object.entries(state.spoops || {})) {
    if (otherKey === key || !other || !other.opinions) continue;
    const label = labelFor(other.opinions[key]);
    if (HOSTILE.has(label)) hated += 1;
    if (FRIENDLY.has(label)) liked += 1;
  }
  return { holds, hated, liked };
}

function checkTraits(ctx, spoops) {
  const { state } = ctx;
  const earned = [];
  for (const spoop of spoops) {
    if (!spoop) continue;
    const key = keyOf(state, spoop);
    const stats = mindOf(state, spoop).stats;
    const counts = relationCounts(state, key);
    const maxLoss = Math.max(0, ...Object.values(stats.losesTo || {}).map(Number));
    const checks = [
      ['cursed', (stats.raidDeathStreak || 0) >= 3],
      ['bloodthirsty', (stats.pkWins || 0) >= 5],
      ['sore-loser', maxLoss >= 3],
      ['survivor', (stats.raidsSurvived || 0) >= 10],
      ['grudge-keeper', counts.holds >= 3],
      ['public-enemy', counts.hated >= 4],
      ['beloved', counts.liked >= 3],
    ];
    for (const [id, ok] of checks) {
      if (ok && earn(ctx, spoop, id)) earned.push({ spoop, id });
    }
  }
  return earned;
}

function slayCheck(ctx, winner, winnerCombat, loserCombat) {
  if (Number(loserCombat) - Number(winnerCombat) >= 10) earn(ctx, winner, 'giant-slayer');
}

function everyone(state) {
  return Object.values(state.spoops || {}).filter(Boolean);
}

function earnedLine(row) {
  if (row.id === 'cursed') return `${row.spoop.name} died in a third raid in a row. They are Cursed now.`;
  if (row.id === 'public-enemy') return `${row.spoop.name} is a Public Enemy. Four spoops have a problem with them.`;
  if (row.id === 'bloodthirsty') return `${row.spoop.name} has five PK wins and a taste for it.`;
  return `${row.spoop.name} earned ${TRAITS[row.id].name}.`;
}

function pushDrama(list, line) {
  if (line && list.length < DRAMA_KEEP && !list.includes(line)) list.push(line);
}

// Called once when a PK settles.
function notePk(state, args) {
  const { winner, loser, item, winnerCombat, loserCombat, when, log } = args;
  if (!winner || !loser || winner === loser) return '';
  const ctx = { state, when, log };
  const winnerKey = keyOf(state, winner);
  const loserKey = keyOf(state, loser);
  const held = winner.opinions && winner.opinions[loserKey];
  const heldLabel = labelFor(held);
  const wanted = held && (held.tags || []).find((tag) => tag.kind === 'took-item');
  let line = '';
  if (item && wanted && wanted.item === item) {
    dropTag(held, 'took-item', item);
    feel(ctx, winner, loser, 14, 4, { kind: 'revenge', extra: { item } });
    line = `${winner.name} took the ${item} back from ${loser.name}.`;
  } else if (HOSTILE.has(heldLabel)) {
    feel(ctx, winner, loser, 6, -4, { kind: 'revenge' });
    line = `${winner.name} settled a score with ${loser.name}.`;
  } else {
    feel(ctx, winner, loser, -2, -6, null);
  }
  feel(ctx, loser, winner, -18, 10, item
    ? { kind: 'took-item', extra: { item } }
    : { kind: 'pk-loss' });
  bump(state, winner, 'pkWins');
  bump(state, loser, 'pkLosses');
  const losses = mindOf(state, loser).stats.losesTo;
  losses[winnerKey] = (Number(losses[winnerKey]) || 0) + 1;
  if (!line && losses[winnerKey] >= 3) line = `${loser.name} has now lost to ${winner.name} ${losses[winnerKey]} times.`;
  shift(state, loser, 'temper', 8);
  shift(state, loser, 'warmth', -2);
  shift(state, winner, 'boldness', 4);
  shift(state, winner, 'temper', -3);
  if (item) shift(state, winner, 'greed', 4);
  slayCheck(ctx, winner, winnerCombat, loserCombat);
  const earned = checkTraits(ctx, everyone(state));
  if (!line && earned.length) line = earnedLine(earned[0]);
  return line;
}

// fights: [{ winner, loser, kind: 'spoopfight' | 'tournament', round, winnerCombat, loserCombat }]
function noteArena(state, args) {
  const { fights, champion, field, when, log, kind } = args;
  const ctx = { state, when, log };
  const drama = [];
  for (const row of fights || []) {
    const { winner, loser } = row;
    if (!winner || !loser || winner === loser) continue;
    const loserKey = keyOf(state, loser);
    const winnerKey = keyOf(state, winner);
    const grudge = labelFor(winner.opinions && winner.opinions[loserKey]);
    const theirs = labelFor(loser.opinions && loser.opinions[winnerKey]);
    const tag = row.kind === 'tournament'
      ? { kind: row.round === 'Final' ? 'final-loss' : 'knocked-out', extra: { round: row.round || '' } }
      : { kind: 'spoopfight-kill' };
    const final = row.round === 'Final';
    feel(ctx, loser, winner, final ? -10 : -8, 8, tag);
    feel(ctx, winner, loser, HOSTILE.has(grudge) ? 4 : 0, -3, HOSTILE.has(grudge) ? { kind: 'revenge' } : null);
    const losses = mindOf(state, loser).stats.losesTo;
    losses[winnerKey] = (Number(losses[winnerKey]) || 0) + 1;
    shift(state, loser, 'temper', final ? 4 : 2);
    shift(state, winner, 'temper', -1);
    slayCheck(ctx, winner, row.winnerCombat, row.loserCombat);
    const verb = row.kind === 'tournament' ? (final ? 'beat' : 'knocked out') : 'killed';
    if (grudge === 'nemesis') pushDrama(drama, `${winner.name} ${verb} their nemesis ${loser.name}.`);
    else if (HOSTILE.has(grudge)) pushDrama(drama, `${winner.name} got revenge on ${loser.name}.`);
    else if (FRIENDLY.has(theirs)) pushDrama(drama, `${winner.name} ${verb} ${loser.name}, who thought they were friends.`);
  }
  if (champion) {
    const others = (field || []).filter((spoop) => spoop && spoop !== champion);
    for (const other of others) feel(ctx, other, champion, 0, 3, null);
    shift(state, champion, 'boldness', 3);
    const avg = Number(args.avgCombat) || 0;
    const mine = Number(args.championCombat) || 0;
    if (mine && avg && avg - mine >= 5 && earn(ctx, champion, 'underdog')) {
      pushDrama(drama, `${champion.name} won the ${kind === 'tournament' ? 'Tournament' : 'Spoopfight'} as an underdog.`);
    }
  }
  for (const row of checkTraits(ctx, everyone(state))) pushDrama(drama, earnedLine(row));
  return drama;
}

// raid: the built raid night. byName maps a spoop name to its spoop.
function noteRaid(state, args) {
  const { raid, byName, when, log } = args;
  const ctx = { state, when, log };
  const drama = [];
  if (!raid || !Array.isArray(raid.rooms)) return drama;
  const raidName = raid.name || 'the raid';
  const madHits = new Map();
  const madKills = [];
  const died = new Set();
  const joined = new Set();
  for (const room of raid.rooms) {
    const party = room.party || [];
    const byId = new Map(party.map((row) => [row.id, byName.get(row.name)]).filter((pair) => pair[1]));
    for (const spoop of byId.values()) joined.add(spoop);
    for (const row of party) {
      const spoop = byName.get(row.name);
      if (spoop && !row.alive) died.add(spoop);
    }
    const bout = room.bout || {};
    for (const hit of bout.hits || []) {
      if (hit.attack !== 'mad' || !(hit.amount > 0)) continue;
      const from = byId.get(hit.from);
      const to = byId.get(hit.to);
      if (!from || !to || from === to) continue;
      const pair = keyOf(state, to) + '|' + keyOf(state, from);
      const seen = madHits.get(pair) || { to, from, amount: 0 };
      seen.amount += hit.amount;
      madHits.set(pair, seen);
    }
    for (const death of bout.deaths || []) {
      const victim = byId.get(death.id);
      const killer = byId.get(death.by);
      if (victim && killer && victim !== killer) madKills.push({ victim, killer });
    }
    if (room.bout && room.bout.loot && room.bout.loot.drop && room.bout.loot.spooply) {
      const lucky = byName.get(room.bout.loot.spooply.name);
      const drop = room.bout.loot.drop.name;
      if (lucky) {
        shift(state, lucky, 'greed', 6);
        for (const other of byId.values()) {
          if (other === lucky) continue;
          if ((mindOf(state, other).axes.greed || 0) < 15) continue;
          feel(ctx, other, lucky, -5, 0, { kind: 'envy', extra: { item: drop } });
        }
      }
    }
  }
  for (const row of madKills) {
    feel(ctx, row.victim, row.killer, -16, 0, { kind: 'mad-kill', extra: { raid: raidName } });
    shift(state, row.victim, 'temper', 4);
    pushDrama(drama, `${row.killer.name} went mad and killed ${row.victim.name}. ${row.victim.name} is not calling it an accident.`);
  }
  const killedBy = new Set(madKills.map((row) => keyOf(state, row.victim) + '|' + keyOf(state, row.killer)));
  for (const [pair, row] of madHits) {
    if (killedBy.has(pair)) continue;
    feel(ctx, row.to, row.from, -6, 0, { kind: 'mad-hit', extra: { raid: raidName } });
    shift(state, row.to, 'temper', 3);
    shift(state, row.to, 'warmth', -3);
    if (row.amount >= 10) pushDrama(drama, `A mad ${row.from.name} hit ${row.to.name} for ${row.amount}. ${row.to.name} has not forgiven them.`);
  }
  const survivors = [];
  const wiped = [...joined].every((spoop) => died.has(spoop));
  for (const spoop of joined) {
    if (died.has(spoop)) {
      if (!wiped) bump(state, spoop, 'raidDeathStreak');
      shift(state, spoop, 'boldness', -3);
    } else {
      mindOf(state, spoop).stats.raidDeathStreak = 0;
      bump(state, spoop, 'raidsSurvived');
      survivors.push(spoop);
      if (raid.cleared) shift(state, spoop, 'boldness', 4);
    }
  }
  if (raid.cleared) {
    for (const a of survivors) {
      shift(state, a, 'warmth', 4);
      for (const b of survivors) {
        if (a !== b) feel(ctx, a, b, 5, 3, { kind: 'raid-pal', extra: { raid: raidName } });
      }
    }
  }
  for (const row of checkTraits(ctx, everyone(state))) pushDrama(drama, earnedLine(row));
  return drama;
}

const ENCOUNTER_CHANCE = 0.3;

// Spoops who end an hour at the same spot sometimes run into each other.
// The roll is a hash of the day, the pair, and the spot, so no game roll moves.
// placeOf(spoop) returns { id, name } for where the spoop is now.
function noteEncounters(state, args) {
  const { acted, placeOf, when, log } = args;
  if (!acted || !acted.length) return;
  const ctx = { state, when, log };
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(when);
  const all = everyone(state);
  for (const a of acted) {
    const here = placeOf(a);
    if (!here || !here.id) continue;
    for (const b of all) {
      if (b === a || new Date(b.born) > when) continue;
      const there = placeOf(b);
      if (!there || there.id !== here.id) continue;
      const aKey = keyOf(state, a);
      const bKey = keyOf(state, b);
      const ab = opinion(state, a, bKey);
      const ba = opinion(state, b, aKey);
      if (ab.metDay === day || ba.metDay === day) continue;
      const pair = [aKey, bKey].sort().join('|');
      const roll = (hash(day + '|' + pair + '|' + here.id) % 10000) / 10000;
      if (roll >= ENCOUNTER_CHANCE) continue;
      ab.metDay = day;
      ba.metDay = day;
      const mindA = mindOf(state, a).axes;
      const mindB = mindOf(state, b).axes;
      const lean = ((mindA.warmth || 0) + (mindB.warmth || 0) - (mindA.temper || 0) - (mindB.temper || 0)) / 400;
      const mood = (hash(pair + '|' + day + '|mood') % 10000) / 10000;
      const good = mood < 0.55 + lean + (Number(ab.affinity) || 0) / 300;
      const extra = { place: here.name, good };
      feel(ctx, a, b, good ? 5 : -5, 1, { kind: 'met', extra });
      feel(ctx, b, a, good ? 5 : -5, 1, { kind: 'met', extra });
      shift(state, a, 'warmth', good ? 1 : -1);
      shift(state, b, 'warmth', good ? 1 : -1);
      if (!good) {
        shift(state, a, 'temper', 1);
        shift(state, b, 'temper', 1);
      }
    }
  }
  checkTraits(ctx, acted);
}

function noteMegaChest(state, args) {
  const { opener, item, when, log } = args;
  if (!opener) return;
  const ctx = { state, when, log };
  shift(state, opener, 'greed', 5);
  for (const other of everyone(state)) {
    if (other === opener) continue;
    if ((mindOf(state, other).axes.greed || 0) < 25) continue;
    feel(ctx, other, opener, -4, 2, { kind: 'envy', extra: { item } });
  }
}

// Once per ET day: opinions and moods drift back toward where they started.
function dailyDrift(state, day) {
  if (!day || state.socialDay === day) return false;
  const first = !state.socialDay;
  state.socialDay = day;
  if (first) return true;
  const cutoff = Date.parse(day + 'T00:00:00Z') - TAG_DAYS * 86400000;
  for (const spoop of everyone(state)) {
    const mind = mindOf(state, spoop);
    for (const axis of AXES) {
      const base = mind.base[axis] || 0;
      mind.axes[axis] = round1(base + ((mind.axes[axis] || 0) - base) * AXIS_FADE);
    }
    for (const [key, o] of Object.entries(spoop.opinions || {})) {
      o.tags = (o.tags || []).filter((tag) => tag.kind === 'took-item' || Date.parse(tag.at) >= cutoff);
      o.affinity = round1((Number(o.affinity) || 0) * OPINION_FADE);
      o.respect = round1((Number(o.respect) || 0) * OPINION_FADE);
      if (o.tags.some((tag) => tag.kind === 'took-item')) o.affinity = Math.min(o.affinity, GRUDGE_FLOOR);
      if (Math.abs(o.affinity) < 1 && Math.abs(o.respect) < 1 && !o.tags.length) delete spoop.opinions[key];
    }
  }
  return true;
}

// First load: build opinions from the PKs already in each spoop's fight history.
function ensureSocial(state) {
  if (!state || !state.spoops || state.socialSeeded) return false;
  const byName = new Map(everyone(state).map((spoop) => [spoop.name, spoop]));
  for (const spoop of everyone(state)) {
    mindOf(state, spoop);
    const fights = (spoop.fights || []).filter((row) => row && row.pk).slice().reverse();
    for (const row of fights) {
      const other = byName.get(row.opponent);
      if (!other) continue;
      const when = new Date(row.at);
      const ctx = { state, when, log: null };
      if (row.won) {
        feel(ctx, spoop, other, -2, -6, null);
        bump(state, spoop, 'pkWins');
        continue;
      }
      const took = /Lost the PK to .+?\. Lost (.+?)\.(?: |$)/.exec(row.summary || '');
      feel(ctx, spoop, other, -18, 10, took ? { kind: 'took-item', extra: { item: took[1] } } : { kind: 'pk-loss' });
      bump(state, spoop, 'pkLosses');
      const losses = mindOf(state, spoop).stats.losesTo;
      const otherKey = keyOf(state, other);
      losses[otherKey] = (Number(losses[otherKey]) || 0) + 1;
      shift(state, spoop, 'temper', 8);
    }
  }
  state.socialSeeded = true;
  return true;
}

function reasonFor(tag, holderName, otherName) {
  if (!tag) return '';
  switch (tag.kind) {
    case 'took-item': return `${otherName} took ${holderName}'s ${tag.item} in a PK.`;
    case 'pk-loss': return `${otherName} beat ${holderName} in a PK.`;
    case 'revenge': return tag.item ? `${holderName} took the ${tag.item} back from ${otherName}.` : `${holderName} got even with ${otherName}.`;
    case 'met': return (tag.good ? 'They got along' : 'They squabbled') + (tag.place ? ` on the same job (${tag.place}).` : '.');
    case 'spoopfight-kill': return `${otherName} killed ${holderName} in a Spoopfight.`;
    case 'knocked-out': return `${otherName} knocked ${holderName} out${tag.round ? ' in the ' + tag.round : ''}.`;
    case 'final-loss': return `${otherName} beat ${holderName} in a Tournament final.`;
    case 'mad-hit': return `${otherName} hit ${holderName} while mad in ${tag.raid || 'a raid'}.`;
    case 'mad-kill': return `${otherName} killed ${holderName} while mad in ${tag.raid || 'a raid'}.`;
    case 'raid-pal': return `They cleared ${tag.raid || 'a raid'} together.`;
    case 'envy': return `${otherName} got the ${tag.item} instead of ${holderName}.`;
    default: return '';
  }
}

// A PK reason drawn from the pair's history, or '' if they have none.
function pkReason(state, a, b) {
  const aKey = keyOf(state, a);
  const bKey = keyOf(state, b);
  const picks = [];
  for (const [holder, other, otherKey] of [[a, b, bKey], [b, a, aKey]]) {
    const o = holder.opinions && holder.opinions[otherKey];
    if (!o) continue;
    for (const tag of o.tags || []) picks.push({ holder, other, tag, o });
  }
  if (!picks.length) return '';
  picks.sort((x, y) => (TAG_RANK[y.tag.kind] || 0) - (TAG_RANK[x.tag.kind] || 0) || String(y.tag.at).localeCompare(String(x.tag.at)));
  const { holder, other, tag } = picks[0];
  const h = holder.name;
  const o = other.name;
  switch (tag.kind) {
    case 'took-item': return `${h} still wants the ${tag.item} back.`;
    case 'mad-kill': return `${h} still says ${o} killed them on purpose in the raid.`;
    case 'mad-hit': return `${h} still thinks ${o} hit them on purpose in the raid.`;
    case 'envy': return `${h} thinks the ${tag.item} should have been theirs.`;
    case 'final-loss': return `${h} has not gotten over the Tournament final.`;
    case 'pk-loss': return `${h} has not let go of the last PK.`;
    case 'knocked-out': return `${h} is still sore about the ${tag.round || 'Tournament'}.`;
    case 'spoopfight-kill': return `${o} killed ${h} in the Spoopfight and will not stop bringing it up.`;
    case 'raid-pal':
    case 'met': return tag.kind === 'met' && !tag.good
      ? `They have been at each other since ${tag.place || 'they last crossed paths'}.`
      : 'They are friends. It started as a sparring match.';
    case 'revenge': return `${o} wants a rematch.`;
    default: return '';
  }
}

function traitsFor(state, spoop) {
  const mind = mindOf(state, spoop);
  const earned = EARNED_ORDER
    .filter((id) => mind.earned.some((row) => row.id === id))
    .map((id) => ({ id, name: TRAITS[id].name, detail: TRAITS[id].detail, kind: 'earned' }));
  const moods = [];
  for (const mood of MOODS) {
    const value = mind.axes[mood.axis] || 0;
    if (mood.high ? value >= MOOD_AT : value <= MOOD_LOW) {
      moods.push({ id: mood.id, name: TRAITS[mood.id].name, detail: TRAITS[mood.id].detail, kind: 'mood', strength: Math.abs(value) });
    }
  }
  if (spoop.autoSell === false && (spoop.bank || []).length >= 40 && !moods.some((row) => row.id === 'pack-rat')) {
    moods.push({ id: 'pack-rat', name: TRAITS['pack-rat'].name, detail: 'Auto-sell is off and the bank is nearly full.', kind: 'mood', strength: 1 });
  }
  moods.sort((x, y) => y.strength - x.strength);
  return earned.concat(moods.map(({ strength, ...row }) => row));
}

function viewOf(state, holder, otherKey, o, holderIsSelf) {
  const label = labelFor(o);
  const otherName = nameOf(state, otherKey);
  const tag = mainTag(o);
  return {
    key: otherKey,
    name: otherName,
    label,
    labelName: label ? LABELS[label] : null,
    affinity: Math.round(Number(o.affinity) || 0),
    respect: Math.round(Number(o.respect) || 0),
    reason: holderIsSelf ? reasonFor(tag, holder.name, otherName) : '',
  };
}

function weight(o) {
  return Math.abs(Number(o.affinity) || 0) + Math.abs(Number(o.respect) || 0) * 0.5;
}

function presentSocial(state, spoop) {
  const key = keyOf(state, spoop);
  const traits = traitsFor(state, spoop);
  const sees = Object.entries(spoop.opinions || {})
    .filter(([otherKey]) => state.spoops[otherKey] && otherKey !== key)
    .sort((x, y) => weight(y[1]) - weight(x[1]))
    .filter(([, o]) => weight(o) >= 5)
    .slice(0, 9)
    .map(([otherKey, o]) => viewOf(state, spoop, otherKey, o, true));
  const seenBy = [];
  for (const [otherKey, other] of Object.entries(state.spoops || {})) {
    if (otherKey === key || !other || !other.opinions || !other.opinions[key]) continue;
    const o = other.opinions[key];
    if (weight(o) < 5) continue;
    const row = viewOf(state, other, key, o, false);
    const tag = mainTag(o);
    seenBy.push({
      key: otherKey,
      name: other.name,
      label: row.label,
      labelName: row.labelName,
      affinity: row.affinity,
      respect: row.respect,
      reason: reasonFor(tag, other.name, spoop.name),
      w: weight(o),
    });
  }
  seenBy.sort((x, y) => y.w - x.w);
  return {
    title: traits[0] || null,
    traits,
    sees,
    seenBy: seenBy.slice(0, 9).map(({ w, ...row }) => row),
  };
}

// Pairs where both spoops have a problem with each other, worst first.
function presentFeuds(state) {
  const entries = Object.entries(state.spoops || {});
  const feuds = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [aKey, a] = entries[i];
      const [bKey, b] = entries[j];
      const ab = a.opinions && a.opinions[bKey];
      const ba = b.opinions && b.opinions[aKey];
      const hostileA = HOSTILE.has(labelFor(ab));
      const hostileB = HOSTILE.has(labelFor(ba));
      if (!hostileA && !hostileB) continue;
      const mutual = hostileA && hostileB;
      const heat = -((hostileA ? Number(ab.affinity) || 0 : 0) + (hostileB ? Number(ba.affinity) || 0 : 0));
      const tagA = hostileA ? mainTag(ab) : null;
      const tagB = hostileB ? mainTag(ba) : null;
      const useA = tagA && (!tagB || (TAG_RANK[tagA.kind] || 0) >= (TAG_RANK[tagB.kind] || 0));
      const holder = useA ? a : b;
      const other = holder === a ? b : a;
      feuds.push({
        holder: holder.name,
        holderKey: holder === a ? aKey : bKey,
        target: other.name,
        targetKey: other === a ? aKey : bKey,
        mutual,
        label: labelFor(useA ? ab : ba),
        heat: Math.round(heat),
        reason: reasonFor(useA ? tagA : tagB, holder.name, other.name),
      });
    }
  }
  feuds.sort((x, y) => (y.mutual - x.mutual) || y.heat - x.heat);
  return feuds.slice(0, 4);
}

module.exports = {
  TRAITS,
  ensureSocial,
  dailyDrift,
  notePk,
  noteArena,
  noteRaid,
  noteEncounters,
  noteMegaChest,
  pkReason,
  presentSocial,
  presentFeuds,
  labelFor,
};
