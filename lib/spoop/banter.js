/**
 * Things spoops say during a raid, worked out when the raid is built so every viewer sees the
 * same lines. Fights get timed lines over heads (bout.banter); camps and loot get a quote.
 * Who says what leans on how they feel about each other (pals mourn, rivals gloat).
 */

const { labelFor } = require('./social');

const HOSTILE = new Set(['nemesis', 'rival', 'contempt']);
const FRIENDLY = new Set(['idol', 'pal']);

const LINES = {
  open: ["Let's do this.", 'Stay out of the orange!', 'Focus up.', 'I call loot.', 'Who brought food?', 'Easy kill.', "Don't stand in stuff.", 'Spread out!'],
  openBoss: {
    elvarg: ['Dragon slayer time.', 'Anyone bring an anti-dragon shield?'],
    mole: ['Bring a light!', "It's just a big mole."],
    brutus: ['Big cow. Big steaks.', 'Mind the horns.'],
    scurrius: ['Rats. Why is it always rats.', 'Smells like sewer in here.'],
    chaos: ["It's going to teleport me again.", 'Hold onto your gear.'],
    leviathan: ['Get the lights on it!', 'That is a big fish.'],
    obor: ['Hill giant, but angrier.', 'Big club, bigger head.'],
    bryophyta: ['Weed killer, anyone?', 'Watch the growthlings!'],
    kbd: ['Three heads, three times the fire.', 'Stay off the breath!'],
    vorkath: ['Watch for the fireball!', 'Undead dragon. Lovely.'],
    kq: ['Bugs. Why bugs.', 'Second form incoming, I bet.'],
    zulrah: ['She switched sides!', 'Blue means magic. I think.'],
  },
  bigHit: ['Get some!', 'Did you see that?', 'Clean.', 'Pow!', 'Feel that one?', 'Big one!'],
  low: ["I'm low!", 'Heal me!', 'Ow ow ow.', 'Not like this...', 'Need a camp!', 'Cover me!'],
  palDies: ['NO! {name}!', '{name}, get up!', "I'll avenge you, {name}!", 'Not {name}!'],
  rivalDies: ["Should've dodged, {name}.", 'One less share. Thanks, {name}.', 'Ha. Bye, {name}.', 'Called it, {name}.'],
  anyDies: ['Man down!', '{name} is down!', 'We lost {name}!', 'Someone grab {name}!'],
  last: ['...uh oh.', 'Just me now.', 'I can solo this. Probably.', 'Okay. Okay okay okay.'],
  kill: ['GG.', 'Loot time!', 'Is that it?', 'Next!', 'Too easy.', 'Down it goes.'],
  camp: ['Ahh, much better.', 'Back in it!', 'Thanks, needed that.', 'Good as new.'],
  famine: ['No food? Seriously?', 'Who ate all the supplies?', "I'm starving here."],
  take: ['MINE!', "Let's gooo!", 'Finally!', "Don't be jealous.", 'Thank you RNG.'],
  envy: ['Of course {name} gets it.', 'Rigged.', "That should've been mine.", 'Enjoy it, {name}. For now.'],
};

function hash(text) {
  let h = 2166136261;
  const str = String(text);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rngFor(seed) {
  let a = hash(seed);
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function say(list, rng, name) {
  return pick(list, rng).replace(/\{name\}/g, name || '');
}

// How `holder` feels about `other`, by spoop name: 'friend', 'foe', or ''.
function feeling(spoops, holderName, otherName) {
  const holder = spoops.byName.get(holderName);
  const otherKey = spoops.keyByName.get(otherName);
  if (!holder || !otherKey || !holder.opinions) return '';
  const label = labelFor(holder.opinions[otherKey]);
  if (FRIENDLY.has(label)) return 'friend';
  if (HOSTILE.has(label)) return 'foe';
  return '';
}

function greedOf(spoops, name) {
  const spoop = spoops.byName.get(name);
  return (spoop && spoop.mind && spoop.mind.axes && Number(spoop.mind.axes.greed)) || 0;
}

function fightBanter(room, index, raid, spoops) {
  const bout = room.bout || {};
  const party = bout.party || [];
  if (!party.length) return [];
  const rng = rngFor((raid.name || 'raid') + '|banter|' + index);
  const names = new Map(party.map((row) => [row.id, row.name]));
  const maxHp = new Map((bout.fighters || []).filter((f) => names.has(f.id)).map((f) => [f.id, f.maxHp || 1]));
  const deaths = (bout.deaths || []).filter((d) => names.has(d.id)).sort((a, b) => a.t - b.t);
  const diedAt = new Map(deaths.map((d) => [d.id, d.t]));
  const aliveAt = (time) => party.filter((row) => !(diedAt.has(row.id) && diedAt.get(row.id) <= time)).map((row) => row.id);
  const end = Number(bout.duration) || 0;
  const wanted = [];
  const want = (rank, t, id, text) => {
    if (id && text && t >= 0 && t < end) wanted.push({ rank, t: Math.round(t * 100) / 100, id, text });
  };

  deaths.forEach((d) => {
    const victim = names.get(d.id);
    const around = aliveAt(d.t + 0.6).filter((id) => id !== d.id);
    if (!around.length) return;
    const friend = around.find((id) => feeling(spoops, names.get(id), victim) === 'friend');
    const foe = around.find((id) => feeling(spoops, names.get(id), victim) === 'foe');
    if (friend) want(1, d.t + 0.6, friend, say(LINES.palDies, rng, victim));
    else if (foe) want(1, d.t + 0.6, foe, say(LINES.rivalDies, rng, victim));
    else if (rng() < 0.7) want(2, d.t + 0.6, pick(around, rng), say(LINES.anyDies, rng, victim));
  });

  const lastDeath = deaths[deaths.length - 1];
  if (lastDeath && party.length > 2) {
    const left = aliveAt(lastDeath.t);
    if (left.length === 1) want(1, lastDeath.t + 1.8, left[0], say(LINES.last, rng));
  }

  const wiped = !bout.loot || bout.loot.wiped;
  if (!wiped) {
    const standing = aliveAt(end);
    const blows = (bout.hits || []).filter((hit) => names.has(hit.from) && hit.amount > 0 && standing.includes(hit.from));
    const finisher = blows.length ? blows[blows.length - 1].from : standing[0];
    want(2, end - 1.1, finisher, say(LINES.kill, rng));
  }

  const lowSaid = new Set();
  (bout.hits || []).forEach((hit) => {
    if (!names.has(hit.to) || !(hit.amount > 0) || lowSaid.has(hit.to)) return;
    if (!(hit.hp > 0) || hit.hp / (maxHp.get(hit.to) || 1) >= 0.25) return;
    lowSaid.add(hit.to);
    if (rng() < 0.55) want(3, hit.t + 0.3, hit.to, say(LINES.low, rng));
  });

  let top = null;
  (bout.hits || []).forEach((hit) => {
    if (names.has(hit.from) && !names.has(hit.to) && hit.amount > 0 && (!top || hit.amount > top.amount)) top = hit;
  });
  if (top) want(4, top.t + 0.25, top.from, say(LINES.bigHit, rng));

  const boss = room.boss || {};
  const opener = pick(party, rng);
  const local = LINES.openBoss[boss.id];
  want(5, 0.9, opener.id, local && rng() < 0.6 ? pick(local, rng) : say(LINES.open, rng));

  // Most important first; a line is dropped if it would talk over another or the same spoop just spoke.
  const kept = [];
  wanted.sort((a, b) => a.rank - b.rank || a.t - b.t).forEach((line) => {
    if (kept.length >= 6) return;
    if (kept.some((other) => Math.abs(other.t - line.t) < 1.6 || (other.id === line.id && Math.abs(other.t - line.t) < 4))) return;
    if (diedAt.has(line.id) && diedAt.get(line.id) <= line.t) return;
    kept.push(line);
  });
  return kept.sort((a, b) => a.t - b.t).map((line) => ({ t: line.t, id: line.id, text: line.text }));
}

function addRaidBanter(state, raid, famine) {
  const spoops = { byName: new Map(), keyByName: new Map() };
  Object.entries((state && state.spoops) || {}).forEach(([key, spoop]) => {
    if (!spoop || !spoop.name) return;
    spoops.byName.set(spoop.name, spoop);
    spoops.keyByName.set(spoop.name, key);
  });
  (raid.rooms || []).forEach((room, index) => {
    const rng = rngFor((raid.name || 'raid') + '|quote|' + index);
    if (room.kind === 'fight' && room.bout) {
      room.bout.banter = fightBanter(room, index, raid, spoops);
      const loot = room.bout.loot;
      if (loot && !loot.wiped && loot.drop && loot.spooply) {
        const taker = loot.spooply.name;
        const quotes = [{ name: taker, text: say(LINES.take, rng) }];
        const others = (room.bout.party || []).filter((row) => row.alive && row.name !== taker).map((row) => row.name);
        const jealous = others.find((name) => feeling(spoops, name, taker) === 'foe') || others.find((name) => greedOf(spoops, name) >= 15);
        if (jealous) quotes.push({ name: jealous, text: say(LINES.envy, rng, taker) });
        loot.quotes = quotes;
      }
      return;
    }
    if (room.kind === 'rest') {
      const party = room.party || [];
      if (famine) {
        if (party.length) room.quote = { name: pick(party, rng).name, text: say(LINES.famine, rng) };
      } else if ((room.healed || []).length) {
        room.quote = { name: pick(room.healed, rng).name, text: say(LINES.camp, rng) };
      }
    }
  });
}

module.exports = { addRaidBanter };
