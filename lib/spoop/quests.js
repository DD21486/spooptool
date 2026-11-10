/**
 * OSRS quests a spoop can spend an hour on.
 *
 * Experience is the real quest reward for Attack, Strength, Defence,
 * Hitpoints, Ranged, Magic, and Prayer. Lamps land on the lowest skill
 * that is allowed to take them.
 *
 * The chance is 10% on the level they qualify and reaches 100% twelve
 * levels past the tightest requirement. Quests with no level requirement
 * use combat instead, so a new spoop is unlikely and a grown one is certain.
 * A combat requirement stands in when the real gate is a skill spoops do
 * not train (Slayer, Crafting, and the rest).
 */

const { SKILL_IDS } = require('./data');
const { levelForXp } = require('../xpTable');

const QUEST_CHANCE_AT_REQ = 0.1;
const QUEST_LEVELS_TO_SURE = 12;

const QUESTS = [
  { id: 'witchs-potion', name: "Witch's Potion", points: 1, x: 2968, y: 3205, xp: { magic: 325 }, detail: 'In Rimmington, drinking something Hetty should not have handed them.' },
  { id: 'imp-catcher', name: 'Imp Catcher', points: 1, x: 3109, y: 3162, xp: { magic: 875 }, detail: 'Under the Wizards\' Tower, chasing beads and getting set on fire.' },
  { id: 'restless-ghost', name: 'The Restless Ghost', points: 1, x: 3244, y: 3206, xp: { prayer: 1125 }, detail: 'In the Lumbridge church, a skull, a ghost, and a priest who will not touch either.' },
  { id: 'demon-slayer', name: 'Demon Slayer', points: 3, x: 3204, y: 3424, lamp: { amount: 1000, times: 2 }, detail: 'In Varrock, a Silverlight and a demon that was supposed to stay in the circle.' },
  { id: 'vampire-slayer', name: 'Vampire Slayer', points: 3, x: 3098, y: 3268, xp: { attack: 4825 }, detail: 'In Draynor, a stake, a hammer, and Count Draynor.' },
  { id: 'witchs-house', name: "Witch's House", points: 4, x: 2927, y: 3456, xp: { hitpoints: 6325 }, detail: 'In Taverley, four experiments and a key they were not supposed to find.' },
  { id: 'death-plateau', name: 'Death Plateau', points: 1, x: 2896, y: 3528, xp: { attack: 3000 }, detail: 'On the path to Trollheim, a guard and a very bad map.' },
  { id: 'fight-arena', name: 'Fight Arena', points: 2, x: 2566, y: 3194, xp: { attack: 12175 }, detail: 'South of the Tree Gnome Village, still in the cage until the scorpion stopped moving.' },
  { id: 'tree-gnome-village', name: 'Tree Gnome Village', points: 2, x: 2541, y: 3170, xp: { attack: 11450 }, detail: 'In the maze, a warlord, and a king who wanted his orbs back.' },
  { id: 'waterfall', name: 'Waterfall Quest', points: 1, x: 2521, y: 3495, xp: { attack: 13750, strength: 13750 }, detail: 'Under the Baxtorian Falls. Two pebbles, a tomb, and a lot of experience.' },
  { id: 'grand-tree', name: 'The Grand Tree', points: 5, x: 2465, y: 3495, requires: ['tree-gnome-village'], xp: { attack: 18400, magic: 2150 }, detail: 'In the Grand Tree, a black demon and a king who trusted the wrong advisor.' },
  { id: 'priest-in-peril', name: 'Priest in Peril', points: 1, x: 3416, y: 3486, xp: { prayer: 1406 }, detail: 'At the Paterdomus temple, a monk, a dog, and fifty unblessed bones.' },
  { id: 'nature-spirit', name: 'Nature Spirit', points: 2, x: 3440, y: 3336, requires: ['priest-in-peril', 'restless-ghost'], xp: { defence: 2000, hitpoints: 2000 }, detail: 'In Mort Myre, filling a pouch and hoping the ghasts stay down.' },
  { id: 'scorpion-catcher', name: 'Scorpion Catcher', points: 1, x: 2704, y: 3404, xp: { strength: 6625 }, detail: 'Up Thormac\'s tower, three scorpions that did not want to be caught.' },
  { id: 'horror-from-the-deep', name: 'Horror from the Deep', points: 2, x: 2509, y: 3634, xp: { magic: 4663, ranged: 4663, strength: 4663 }, detail: 'At the lighthouse, a dagannoth mother and a book they can finally wear.' },
  { id: 'dragon-slayer-i', name: 'Dragon Slayer I', points: 2, x: 3191, y: 3363, xp: { strength: 18650, defence: 18650 }, detail: 'In the Champions\' Guild, then Crandor, then Elvarg.' },
  { id: 'mountain-daughter', name: 'Mountain Daughter', points: 2, x: 2810, y: 3672, xp: { attack: 1000, prayer: 2000 }, detail: 'In the mountain camp, a missing daughter and a kendal in a cave.' },
  { id: 'souls-bane', name: "A Soul's Bane", points: 1, x: 3308, y: 3452, xp: { defence: 500, hitpoints: 500 }, detail: 'East of Varrock, a rift and a family that would not stay dead.' },
  { id: 'ghosts-ahoy', name: 'Ghosts Ahoy', points: 2, x: 3659, y: 3518, requires: ['priest-in-peril', 'restless-ghost'], xp: { prayer: 2400 }, detail: 'In Port Phasmatys, a petition, a ghostship, and a lobster.' },
  { id: 'in-search-of-the-myreque', name: 'In Search of the Myreque', points: 2, x: 3496, y: 3489, requires: ['nature-spirit'], xp: { attack: 600, strength: 600, defence: 600, hitpoints: 600 }, detail: 'Through Canifis and into the caves, looking for a resistance.' },
  { id: 'in-aid-of-the-myreque', name: 'In Aid of the Myreque', points: 2, x: 3488, y: 3284, requires: ['in-search-of-the-myreque'], xp: { attack: 2000, strength: 2000, defence: 2000 }, detail: 'In Burgh de Rott, rebuilding a town the vyres already own.' },
  { id: 'haunted-mine', name: 'Haunted Mine', points: 2, x: 3440, y: 3232, requires: ['priest-in-peril'], xp: { strength: 22000 }, detail: 'In the Abandoned Mine, a cart ride and a salve they will actually use.' },
  { id: 'fremennik-trials', name: 'The Fremennik Trials', points: 3, x: 2658, y: 3668, xp: { attack: 2812, strength: 2812, defence: 2812, hitpoints: 2812, magic: 2812 }, detail: 'In Rellekka, seven trials and a name the council will pretend to respect.' },
  { id: 'olafs-quest', name: "Olaf's Quest", points: 1, x: 2722, y: 3727, requires: ['fremennik-trials'], xp: { defence: 12000 }, detail: 'East of Rellekka, a longship, a puzzle, and a lot of defence experience.' },
  { id: 'holy-grail', name: 'Holy Grail', points: 2, x: 2757, y: 3478, xp: { defence: 15300, prayer: 11000 }, detail: 'From Camelot to the fisher realm, a whistle and a titan.' },
  { id: 'heroes-quest', name: "Heroes' Quest", points: 1, x: 2902, y: 3511, xp: { attack: 3075, strength: 3075, defence: 3075, hitpoints: 3075, ranged: 2075 }, detail: 'At the Heroes\' Guild door, with a shield they had to earn twice.' },
  { id: 'roving-elves', name: 'Roving Elves', points: 1, x: 2207, y: 3158, requires: ['waterfall'], xp: { strength: 10000 }, detail: 'In Isafdar, a consecrated seed and a moss guardian.' },
  { id: 'monkey-madness-i', name: 'Monkey Madness I', points: 3, x: 2465, y: 3495, requires: ['tree-gnome-village', 'grand-tree'], choice: 'monkey', detail: 'On Ape Atoll, a greegree, a jungle demon, and a very large pile of experience.' },
  { id: 'what-lies-below', name: 'What Lies Below', points: 1, x: 3266, y: 3333, xp: { defence: 2000 }, detail: 'South of Varrock, a ruined temple and something under it.' },
  { id: 'another-slice', name: 'Another Slice of H.A.M.', points: 1, x: 3209, y: 3213, levels: { prayer: 25 }, xp: { prayer: 3000 }, detail: 'Back in the Lumbridge cellar, deeper this time, with the Dorgeshuun.' },
  { id: 'temple-of-ikov', name: 'Temple of Ikov', points: 1, x: 2654, y: 3492, levels: { ranged: 40 }, xp: { ranged: 10500 }, detail: 'North of Ardougne, a temple, Lucien, and a staff they were not meant to take.' },
  { id: 'between-a-rock', name: 'Between a Rock...', points: 2, x: 2780, y: 3614, levels: { defence: 30 }, xp: { defence: 5000 }, detail: 'In Keldagrim, a cannonball and a dwarf who would not move.' },
  { id: 'spirits-of-the-elid', name: 'Spirits of the Elid', points: 2, x: 3424, y: 2930, levels: { magic: 33 }, xp: { magic: 1000, prayer: 8000 }, detail: 'In Nardah, a drought, three spirits, and a priest who needed the river back.' },
  { id: 'giant-dwarf', name: 'The Giant Dwarf', points: 2, x: 2732, y: 3713, levels: { magic: 33 }, xp: { magic: 1500 }, detail: 'On the Keldagrim boat, then a consortium that wanted a statue finished.' },
  { id: 'enakhras-lament', name: "Enakhra's Lament", points: 2, x: 3190, y: 2928, levels: { magic: 39 }, xp: { magic: 7000 }, detail: 'South of the desert mining camp, a temple and a mahjarrat.' },
  { id: 'rum-deal', name: 'Rum Deal', points: 2, x: 3659, y: 3518, requires: ['priest-in-peril'], levels: { prayer: 47 }, xp: { prayer: 7000 }, detail: 'Off the coast, a brewery, an undead pirate, and a prayer they did not expect.' },
  { id: 'desert-treasure-i', name: 'Desert Treasure I', points: 3, x: 3178, y: 3043, levels: { magic: 50 }, xp: { magic: 20000 }, detail: 'Across the desert, four diamonds, and the ancient spellbook.' },
  { id: 'hopespears-will', name: "Hopespear's Will", points: 0, x: 2858, y: 3577, levels: { prayer: 50 }, xp: { prayer: 38750 }, detail: 'In the goblin temple, a prophecy and a very large prayer reward.' },
  { id: 'great-brain-robbery', name: 'The Great Brain Robbery', points: 2, x: 3794, y: 2834, levels: { prayer: 50 }, xp: { prayer: 6000 }, lamp: { amount: 5000, times: 1, minLevel: 30 }, detail: 'On Harmony Island, a pirate ship and a monk who needed his brain back.' },
  { id: 'sins-of-the-father', name: 'Sins of the Father', points: 2, x: 3654, y: 3218, levels: { magic: 50 }, lamp: { amount: 15000, times: 6, minLevel: 60 }, detail: 'In Darkmeyer, a vyre, a blood tithe, and six lamps.' },
  { id: 'a-kingdom-divided', name: 'A Kingdom Divided', points: 2, x: 1624, y: 3672, levels: { magic: 54 }, lamp: { amount: 10000, times: 2, minLevel: 40 }, detail: 'In Great Kourend, a council that would rather not be united.' },
  { id: 'path-of-glouphrie', name: 'The Path of Glouphrie', points: 1, x: 2541, y: 3170, requires: ['grand-tree', 'waterfall'], levels: { strength: 60 }, xp: { strength: 30000, magic: 5000 }, detail: 'Back at the Grand Tree, a king\'s brother and three warped terrorbirds.' },
  { id: 'kings-ransom', name: "King's Ransom", points: 1, x: 2757, y: 3478, levels: { defence: 65, magic: 45 }, xp: { defence: 33000, magic: 5000 }, lamp: { amount: 5000, times: 1, minLevel: 50 }, detail: 'In Camelot, a missing king, the Black Knights\' Fortress, and a lot of defence experience.' },
  { id: 'lunar-diplomacy', name: 'Lunar Diplomacy', points: 2, x: 2105, y: 3914, requires: ['fremennik-trials'], levels: { magic: 65 }, xp: { magic: 5000 }, detail: 'On Lunar Isle, a ceremony and a spellbook the moon clan finally shared.' },
  { id: 'swan-song', name: 'Swan Song', points: 2, x: 2344, y: 3650, levels: { magic: 66 }, xp: { prayer: 10000 }, detail: 'At Piscatoris, sea trolls, and a colony that fishes anyway.' },
  { id: 'monkey-madness-ii', name: 'Monkey Madness II', points: 4, x: 2465, y: 3495, requires: ['monkey-madness-i'], combat: 70, lamp: { amount: 50000, times: 2 }, detail: 'Back through Ape Atoll, a kruk, and two enormous lamps.' },
  { id: 'dream-mentor', name: 'Dream Mentor', points: 2, x: 2105, y: 3914, requires: ['lunar-diplomacy'], combat: 85, xp: { hitpoints: 15000, magic: 10000 }, lamp: { amount: 15000, times: 1 }, detail: 'On Lunar Isle, someone else\'s nightmare, and a combat level high enough to survive it.' },
  { id: 'dragon-slayer-ii', name: 'Dragon Slayer II', points: 5, x: 2457, y: 2848, requires: ['dragon-slayer-i'], levels: { magic: 75, hitpoints: 50 }, lamp: { amount: 25000, times: 4 }, detail: 'From the Myths\' Guild to Ungael. Four lamps, and Vorkath.' },
  { id: 'desert-treasure-ii', name: 'Desert Treasure II', points: 5, x: 3430, y: 2914, requires: ['desert-treasure-i'], levels: { magic: 75 }, lamp: { amount: 100000, times: 3 }, detail: 'North of the desert, four bosses, and three lamps that do not care which skill is behind.' },
];

const BY_ID = new Map(QUESTS.map((quest) => [quest.id, quest]));

function levelsFrom(skills) {
  const levels = {};
  const source = skills || {};
  for (const id of SKILL_IDS) levels[id] = levelForXp(source[id] || 0);
  return levels;
}

function questReady(quest, levels, combat, done) {
  for (const id of quest.requires || []) {
    if (!done.has(id)) return false;
  }
  if (quest.combat && combat < quest.combat) return false;
  for (const [skill, level] of Object.entries(quest.levels || {})) {
    if ((levels[skill] || 1) < level) return false;
  }
  return true;
}

function questMargin(levels, combat, quest) {
  let margin = null;
  for (const [skill, level] of Object.entries(quest.levels || {})) {
    const over = (levels[skill] || 1) - level;
    margin = margin == null ? over : Math.min(margin, over);
  }
  if (quest.combat) {
    const over = combat - quest.combat;
    margin = margin == null ? over : Math.min(margin, over);
  }
  if (margin == null) margin = Math.max(0, combat - 3);
  return Math.max(0, margin);
}

function chanceForMargin(margin) {
  const t = Math.max(0, Math.min(1, margin / QUEST_LEVELS_TO_SURE));
  return QUEST_CHANCE_AT_REQ + (1 - QUEST_CHANCE_AT_REQ) * t * t;
}

function bestQuest(skills, combat, doneIds) {
  const levels = levelsFrom(skills);
  const done = new Set(doneIds || []);
  let best = null;
  let bestChance = -1;
  for (const quest of QUESTS) {
    if (done.has(quest.id)) continue;
    if (!questReady(quest, levels, combat, done)) continue;
    const chance = chanceForMargin(questMargin(levels, combat, quest));
    if (chance > bestChance) {
      best = quest;
      bestChance = chance;
    }
  }
  if (!best) return null;
  return { quest: best, chance: bestChance };
}

function monkeySplit(levels) {
  const pairs = [
    ['attack', 'defence'],
    ['strength', 'hitpoints'],
  ];
  const score = (pair) => pair.reduce((sum, id) => sum + (levels[id] || 1), 0);
  const [chosen, other] = score(pairs[0]) <= score(pairs[1]) ? [pairs[0], pairs[1]] : [pairs[1], pairs[0]];
  const xp = {};
  for (const id of chosen) xp[id] = 35000;
  for (const id of other) xp[id] = 20000;
  return xp;
}

function lampTarget(levels, minLevel) {
  const ready = SKILL_IDS.filter((id) => (levels[id] || 1) >= minLevel);
  const pool = ready.length ? ready : SKILL_IDS;
  const ranked = pool.slice().sort((a, b) => {
    const diff = (levels[a] || 1) - (levels[b] || 1);
    if (diff) return ready.length ? diff : -diff;
    return a.localeCompare(b);
  });
  return ranked[0];
}

function resolveQuestXp(skills, quest) {
  const xp = {};
  const levels = levelsFrom(skills);
  if (quest.xp) {
    for (const [skill, amount] of Object.entries(quest.xp)) xp[skill] = (xp[skill] || 0) + amount;
  }
  if (quest.choice === 'monkey') {
    for (const [skill, amount] of Object.entries(monkeySplit(levels))) {
      xp[skill] = (xp[skill] || 0) + amount;
    }
  }
  if (quest.lamp) {
    const projected = Object.assign({}, skills || {});
    for (const [skill, amount] of Object.entries(xp)) projected[skill] = (projected[skill] || 0) + amount;
    const target = lampTarget(levelsFrom(projected), quest.lamp.minLevel || 1);
    xp[target] = (xp[target] || 0) + quest.lamp.amount * (quest.lamp.times || 1);
  }
  return xp;
}

function questSkills(quest) {
  const ids = [];
  if (quest.xp) ids.push(...Object.keys(quest.xp));
  if (quest.choice === 'monkey') ids.push('attack', 'strength', 'defence', 'hitpoints');
  return ids;
}

function questByActivity(activityId) {
  const id = String(activityId || '');
  if (!id.startsWith('quest:')) return null;
  return BY_ID.get(id.slice(6)) || null;
}

function questRecord(doneIds) {
  const done = new Set(doneIds || []);
  let points = 0;
  let count = 0;
  for (const quest of QUESTS) {
    if (!done.has(quest.id)) continue;
    count += 1;
    points += quest.points || 0;
  }
  return { points, done: count, total: QUESTS.length };
}

(function checkQuests() {
  const seen = new Set();
  for (const quest of QUESTS) {
    if (seen.has(quest.id)) throw new Error('duplicate quest ' + quest.id);
    seen.add(quest.id);
    for (const skill of Object.keys(quest.xp || {}).concat(Object.keys(quest.levels || {}))) {
      if (!SKILL_IDS.includes(skill)) throw new Error(quest.id + ' has unknown skill ' + skill);
    }
  }
  for (const quest of QUESTS) {
    for (const id of quest.requires || []) {
      if (!seen.has(id)) throw new Error(quest.id + ' is missing prereq ' + id);
    }
  }
})();

module.exports = {
  QUESTS,
  bestQuest,
  resolveQuestXp,
  questByActivity,
  questRecord,
  questSkills,
};
