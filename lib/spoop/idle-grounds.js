/**
 * The stretch after a gear bracket flips, before that bracket's events and
 * drops open. One ground per tier you walk into. Loot stays on the bracket
 * below until the hours run out.
 */

const GROUNDS = {
  iron: {
    place: 'The Lumbridge road',
    activities: [
      { id: 'idle-iron-hides', name: 'Selling cowhides', detail: 'At the Lumbridge general store, one hide at a time. The iron scimitar stays in the window.', skill: 'hitpoints', style: 'skilling', gold: 14, xpRate: 0.35, money: true, x: 3212, y: 3247 },
      { id: 'idle-iron-pen', name: 'One more lap of the cow pen', detail: 'The same cows. The bag is for the trip, not the drops.', skill: 'strength', style: 'melee', gold: 6, x: 3258, y: 3267 },
      { id: 'idle-iron-gate', name: 'Short on the toll', detail: 'At the Al Kharid gate, counting coins and not going through.', skill: 'defence', style: 'melee', gold: 8, x: 3268, y: 3228 },
      { id: 'idle-iron-rocks', name: 'Mining the iron rocks', detail: 'North of Al Kharid, filling a sack they are not ready to smith.', skill: 'hitpoints', style: 'skilling', gold: 10, x: 3299, y: 3312 },
      { id: 'idle-iron-bones', name: 'Burying the last of the bones', detail: 'Behind the castle, a small pile and a longer rest than the bones needed.', skill: 'prayer', style: 'skilling', gold: 4, x: 3243, y: 3198 },
    ],
    events: [
      { reward: 'xp', line: 'A lamp was sitting on the Lumbridge signpost. They took it and kept walking.' },
      { reward: 'xp', skill: 'hitpoints', line: 'The cook paid them to stop burning shrimp on his range. They almost managed.' },
      { reward: 'gold', line: 'The general store bought the hides and nothing else. The iron stayed on the shelf.' },
      { reward: 'gold', line: 'The toll collector waved them through for a story, and paid them to tell it somewhere else.' },
      { reward: 'both', skill: 'attack', line: 'They helped a goblin find his mail. He paid them. The spear work counted.' },
      { reward: 'gear', line: 'A piece of kit was left on the cow pen fence. The metal was the one they already wear, and it was better.' },
      { reward: 'gear', line: 'The Draynor bank had a spare in a slot they do not remember depositing. It still fit.' },
      { reward: 'death', line: 'A highwayman on the road to Varrock took the hour. They walked back to Lumbridge.' },
    ],
  },
  steel: {
    place: 'Varrock square',
    activities: [
      { id: 'idle-steel-shop', name: 'At the Varrock sword shop', detail: 'Looking at the steel. The iron on their hip is what they can pay for.', skill: 'attack', style: 'melee', gold: 16, x: 3205, y: 3399 },
      { id: 'idle-steel-anvil', name: 'Smithing the iron they meant to sell', detail: 'At the Varrock west anvil, one bar at a time. Not the steel yet.', skill: 'hitpoints', style: 'skilling', gold: 28, xpRate: 0.32, money: true, x: 3188, y: 3426 },
      { id: 'idle-steel-bar', name: 'One more round in Barbarian Village', detail: 'Getting flattened by people who have already moved on.', skill: 'strength', style: 'melee', gold: 14, x: 3083, y: 3420 },
      { id: 'idle-steel-drill', name: 'Watching the White Knights drill', detail: 'In the Falador courtyard, not in the line. The drill is not theirs yet.', skill: 'defence', style: 'melee', gold: 18, x: 2964, y: 3340 },
      { id: 'idle-steel-monk', name: 'A night at the monastery', detail: 'On the top floor, bones from the hill and no rush to leave.', skill: 'prayer', style: 'skilling', gold: 6, x: 3051, y: 3486 },
    ],
    events: [
      { reward: 'xp', line: 'A genie in the Varrock square fountain. The wish was the only thing they took out of it.' },
      { reward: 'gold', line: 'They sold a stack of iron platebodies to a shop that did not ask questions.' },
      { reward: 'gold', line: 'The sword shop bought the old iron back for more than they remembered paying.' },
      { reward: 'both', skill: 'strength', line: 'A barbarian bet them a purse they could last one round. They did. Barely.' },
      { reward: 'gear', line: 'A spare was hanging on the anvil. It was the old metal. It was better than theirs.' },
      { reward: 'both', line: 'Quiz Master had a booth in the square. The question was easy. So were the lamp and the coins.' },
      { reward: 'xp', skill: 'defence', line: 'A White Knight showed them the stance and would not let them join the drill.' },
      { reward: 'death', line: 'They tried a sword on the rack. The shopkeeper won. The hour was the walk out of the shop.' },
    ],
  },
  black: {
    place: 'Ice Mountain',
    activities: [
      { id: 'idle-black-door', name: 'Outside the Black Knights\' Fortress', detail: 'At the door. They are not going in, and the cabbage crate can wait.', skill: 'defence', style: 'melee', gold: 22, x: 3028, y: 3516 },
      { id: 'idle-black-climb', name: 'Climbing Ice Mountain', detail: 'A cold walk to the top. The view is Falador. The gear is still what they walked up in.', skill: 'strength', style: 'melee', gold: 20, x: 3004, y: 3472 },
      { id: 'idle-black-sell', name: 'Selling the steel', detail: 'At the Grand Exchange, offers on the platebodies, and no offer on black yet.', skill: 'magic', style: 'skilling', gold: 40, xpRate: 0.3, money: true, x: 3164, y: 3487 },
      { id: 'idle-black-bank', name: 'Reorganizing the Edgeville bank', detail: 'A tab for the steel, a tab for the bones, and a long sit on the stool.', skill: 'hitpoints', style: 'skilling', gold: 16, x: 3094, y: 3491 },
      { id: 'idle-black-bones', name: 'Burying hill giant bones', detail: 'On the hill, one bone at a time, in no hurry to find a new spot.', skill: 'prayer', style: 'skilling', gold: 8, x: 3097, y: 3468 },
    ],
    events: [
      { reward: 'xp', line: 'A black knight handed them a lamp through the portcullis and said nothing else.' },
      { reward: 'gold', line: 'A coin pouch in the snow on Ice Mountain. Nobody\'s footprints led away from it.' },
      { reward: 'gold', line: 'They sold the last of the steel to a dwarf who called it a favor.' },
      { reward: 'both', line: 'The gravedigger was working the hill. They helped. He paid, and made them say the words.' },
      { reward: 'gear', line: 'A piece of kit was frozen to the peak. It came loose. It was the metal they already wear.' },
      { reward: 'gear', line: 'Somebody\'s pack at the fortress door. They waited an hour. Then they took the spare.' },
      { reward: 'xp', line: 'Surprise exam in the snow. The question was about ice. They passed, shivering.' },
      { reward: 'death', line: 'A shade in the fortress yard stood up. They were not ready. The hour was the climb down.' },
    ],
  },
  mithril: {
    place: 'The Dwarven Mine',
    activities: [
      { id: 'idle-mith-rocks', name: 'Looking at the mithril rocks', detail: 'In the Dwarven Mine, a pick on the rock, and no swing yet.', skill: 'hitpoints', style: 'skilling', gold: 24, x: 3018, y: 3450 },
      { id: 'idle-mith-sell', name: 'Selling the black', detail: 'At the Grand Exchange. The black goes. The mithril scimitar stays a wish.', skill: 'magic', style: 'skilling', gold: 48, xpRate: 0.3, money: true, x: 3164, y: 3487 },
      { id: 'idle-mith-bank', name: 'A long sit in the Seers\' bank', detail: 'Counting the coins for a mithril set and not spending them.', skill: 'hitpoints', style: 'skilling', gold: 22, x: 2726, y: 3493 },
      { id: 'idle-mith-pray', name: 'Praying before the next metal', detail: 'At the monastery, the bones from the last task and a quiet hour.', skill: 'prayer', style: 'skilling', gold: 8, x: 3051, y: 3486 },
      { id: 'idle-mith-spar', name: 'Sparring outside the mine', detail: 'At the entrance, working the same swings, with dwarves who are not interested.', skill: 'attack', style: 'melee', gold: 28, x: 3060, y: 3374 },
    ],
    events: [
      { reward: 'xp', line: 'A dwarf in the mine was giving out lamps to anyone who would stop asking about mithril.' },
      { reward: 'gold', line: 'They sold a crate of black platelegs in Falador and took the long way back.' },
      { reward: 'gold', line: 'A pay-dirt sack they did not clean. It sold anyway.' },
      { reward: 'both', line: 'The slayer master called it a tip for finishing the last task. A lamp, and coins on the counter.' },
      { reward: 'gear', line: 'A crate by the mine cart had kit in it. The metal was the one they already know.' },
      { reward: 'gear', line: 'They picked a piece of gear off a mine cart. Nobody came back for the cart either.' },
      { reward: 'xp', skill: 'attack', line: 'A dwarf corrected their swing and would not let them leave until it stuck.' },
      { reward: 'death', line: 'A rock golem stood up out of the ore they were only looking at. The hour was the respawn.' },
    ],
  },
  adamant: {
    place: 'The Warriors\' Guild door',
    activities: [
      { id: 'idle-addy-door', name: 'At the Warriors\' Guild door', detail: 'Reading the sign. The combined level is close. They are not inside.', skill: 'attack', style: 'melee', gold: 48, x: 2856, y: 3542 },
      { id: 'idle-addy-rim', name: 'On the volcano rim', detail: 'Watching the lesser demons. The next metal can wait until the walk down.', skill: 'strength', style: 'melee', gold: 44, x: 2848, y: 3170 },
      { id: 'idle-addy-sell', name: 'Selling the mithril', detail: 'At the Grand Exchange, one set at a time. The next metal is a tab they have not opened.', skill: 'magic', style: 'skilling', gold: 80, xpRate: 0.3, money: true, x: 3164, y: 3487 },
      { id: 'idle-addy-bones', name: 'Offering the last of the bones', detail: 'At the monastery, a bag from the last tasks and no new assignment.', skill: 'prayer', style: 'skilling', gold: 12, x: 3051, y: 3486 },
      { id: 'idle-addy-shoot', name: 'Shooting behind Seers', detail: 'The same willows. A slow hour, on purpose.', skill: 'ranged', style: 'ranged', gold: 40, x: 2706, y: 3480 },
    ],
    events: [
      { reward: 'xp', line: 'A cyclops at the door dropped a lamp and went back inside. They stayed outside.' },
      { reward: 'gold', line: 'Pest Control paid them for standing on the outpost, not for going in.' },
      { reward: 'gold', line: 'They sold the mithril platebody they had just replaced and ate outside the guild. They were not a member.' },
      { reward: 'both', skill: 'defence', line: 'Sergeant Damien ran a drill in the road, not the guild. Coins at the end. The form stuck.' },
      { reward: 'gear', line: 'The cyclops tossed kit out the door by mistake. It was the metal they already wear, and it was better.' },
      { reward: 'gear', line: 'A traveler outside the guild was giving gear away to anyone who looked lost. They looked lost.' },
      { reward: 'xp', skill: 'defence', line: 'Quiz Master asked about the door requirement. They knew it. He handed over a lamp and told them to wait.' },
      { reward: 'death', line: 'They stepped into the guild for a look. A cyclops disagreed. The hour was the walk back to the door.' },
    ],
  },
  rune: {
    place: 'The Champions\' Guild',
    activities: [
      { id: 'idle-rune-door', name: 'Outside the Champions\' Guild', detail: 'Reading the door. The rune plate is in a shop they can see and not buy.', skill: 'attack', style: 'melee', gold: 70, x: 3191, y: 3364 },
      { id: 'idle-rune-oziach', name: 'At Oziach\'s, not buying', detail: 'Looking at the rune platebody. They left with the same gear they walked in with.', skill: 'defence', style: 'melee', gold: 64, x: 3068, y: 3517 },
      { id: 'idle-rune-alch', name: 'Alching the adamant', detail: 'At the Grand Exchange, the old set going up in smoke, one piece at a time.', skill: 'magic', style: 'skilling', gold: 140, xpRate: 0.32, money: true, x: 3164, y: 3487 },
      { id: 'idle-rune-mound', name: 'Sitting on the Barrows mounds', detail: 'Not digging. A spade in the bag and an hour of doing nothing with it.', skill: 'strength', style: 'melee', gold: 55, x: 3566, y: 3289 },
      { id: 'idle-rune-pray', name: 'A prayer at the monastery', detail: 'Bones from the last bracket, buried slow, before the next metal.', skill: 'prayer', style: 'skilling', gold: 16, x: 3051, y: 3486 },
    ],
    events: [
      { reward: 'xp', line: 'The Champions\' Guild door had a lamp hung on it. They took the lamp and left the door shut.' },
      { reward: 'gold', line: 'An hour of adamant alchs and a drink in the Varrock pub. No new gear.' },
      { reward: 'gold', line: 'Oziach bought a story about a dragon and paid them to leave the shop.' },
      { reward: 'both', line: 'The slayer master paid the streak in coins and told them to rest the task. The rest counted.' },
      { reward: 'gear', line: 'A coffer in the guild basement was not a champion\'s. The kit inside was the old metal, and it was good.' },
      { reward: 'gear', line: 'Somebody\'s forgotten chest under the Edgeville bank. Ordinary kit. Better than what they had.' },
      { reward: 'xp', line: 'Quiz Master on the path to the guild. The question was about a rune plate. He gave them a lamp instead of the price.' },
      { reward: 'death', line: 'They opened a Barrows mound to look. A brother answered. The hour was the walk out, with the spade.' },
    ],
  },
  dragon: {
    place: 'The Myths\' Guild dock',
    activities: [
      { id: 'idle-drag-dock', name: 'On the Myths\' Guild dock', detail: 'The boat is there. They are checking the supplies and not boarding.', skill: 'ranged', style: 'ranged', gold: 120, x: 2457, y: 2848 },
      { id: 'idle-drag-pot', name: 'Buying antifire', detail: 'At the apothecary, a potion they are not going to sip today.', skill: 'hitpoints', style: 'skilling', gold: 90, x: 3194, y: 3403 },
      { id: 'idle-drag-green', name: 'One green dragon, then stop', detail: 'East of the bone yard. One kill. They banked the hide and did not go back.', skill: 'ranged', style: 'ranged', gold: 110, x: 3344, y: 3665 },
      { id: 'idle-drag-fletch', name: 'Fletching the last of the rune arrows', detail: 'A bank, a knife, and a stack they will sell before they need anything dragon.', skill: 'hitpoints', style: 'skilling', gold: 180, xpRate: 0.32, money: true, x: 2720, y: 3492 },
      { id: 'idle-drag-fountain', name: 'At the Heroes\' Guild fountain', detail: 'The dragon battleaxe is a rumor downstairs. They stayed by the water.', skill: 'attack', style: 'melee', gold: 100, x: 2893, y: 3510 },
    ],
    events: [
      { reward: 'xp', line: 'A lamp in the guild library, on the near side of the door they have not opened.' },
      { reward: 'gold', line: 'They sold the supplies they had bought too early. The boat could wait.' },
      { reward: 'gold', line: 'Rune arrows, fletched and sold the same hour. The dock was still there after.' },
      { reward: 'both', line: 'The mysterious old man had a maze in a field by the dock. Coins, and no reason to board.' },
      { reward: 'gear', line: 'A piece of kit left at the dock. Nobody claimed it. It was the metal they already wear.' },
      { reward: 'gear', line: 'They looted a green dragon somebody else had killed. The gear on the ground was ordinary and better.' },
      { reward: 'xp', skill: 'magic', line: 'A book on the dock was a lamp in disguise. They read it. They did not go in.' },
      { reward: 'death', line: 'They stepped onto the boat. A guild guard sent them back. The hour was the row to the dock.' },
    ],
  },
  barrows: {
    place: 'The Ver Sinhaza dock',
    activities: [
      { id: 'idle-barr-dock', name: 'Watching the Theatre groups', detail: 'At the Ver Sinhaza dock. Other people go in. They count the boats.', skill: 'strength', style: 'melee', gold: 220, x: 3654, y: 3218 },
      { id: 'idle-barr-chest', name: 'One more Barrows chest', detail: 'Six brothers, the same spade, and a walk out with no plan to raid.', skill: 'attack', style: 'melee', gold: 200, x: 3566, y: 3289 },
      { id: 'idle-barr-sell', name: 'Selling the dragon they don\'t wear', detail: 'At the Grand Exchange. The dragon goes. The raid tab is empty.', skill: 'magic', style: 'skilling', gold: 360, xpRate: 0.3, money: true, x: 3164, y: 3487 },
      { id: 'idle-barr-ungael', name: 'On Ungael, outside the instance', detail: 'Checking the crumble undead count and not using it.', skill: 'ranged', style: 'ranged', gold: 240, x: 2268, y: 4048 },
      { id: 'idle-barr-repair', name: 'At the repair stand', detail: 'In Ver Sinhaza, asking about barrows pieces they do not own yet.', skill: 'defence', style: 'melee', gold: 160, x: 3652, y: 3214 },
    ],
    events: [
      { reward: 'xp', line: 'A genie at the dock, not in the raid. He looked at the boat and handed over the wish anyway.' },
      { reward: 'gold', line: 'A Barrows chest that was mostly alchs. They counted it and took the long way home.' },
      { reward: 'gold', line: 'Somebody paid them to hold a spot in a Theatre queue. The group went in without them. They kept the fee.' },
      { reward: 'both', line: 'After watching a wipe from the dock, a stranger paid them to explain the mechanic. They kept the fee and the explanation.' },
      { reward: 'gear', line: 'One of the brothers dropped kit on the mound and wandered off. It was the old metal. They kept it.' },
      { reward: 'gear', line: 'The dock crate was not a purple. It was a very good piece of the gear they already wear.' },
      { reward: 'xp', line: 'The reward chest on the dock was a lamp. No shard. They took the lamp and sat back down.' },
      { reward: 'death', line: 'They stood in the acid on a trip they said was the last one. The hour was the boat.' },
    ],
  },
  raid: {
    place: 'The raid lobby',
    activities: [
      { id: 'idle-raid-lobby', name: 'In the Chambers lobby', detail: 'Reading the board. The supplies are packed, and still packed.', skill: 'attack', style: 'melee', gold: 480, x: 1240, y: 3570 },
      { id: 'idle-raid-bag', name: 'Packing a raid bag', detail: 'At the Grand Exchange, brews and restores, and then putting them back.', skill: 'hitpoints', style: 'skilling', gold: 360, x: 3164, y: 3487 },
      { id: 'idle-raid-inferno', name: 'At the Inferno entrance', detail: 'In the volcano, looking at the first wave and telling nobody a story.', skill: 'defence', style: 'melee', gold: 400, x: 2857, y: 3167 },
      { id: 'idle-raid-tombs', name: 'Scouting the Tombs', detail: 'South of the pyramid. A walk through the lobby and back out before the raid level.', skill: 'ranged', style: 'ranged', gold: 440, x: 3319, y: 2760 },
      { id: 'idle-raid-sell', name: 'Selling the barrows pieces', detail: 'At the Grand Exchange. The old sets go. The raid tab is still empty.', skill: 'magic', style: 'skilling', gold: 700, xpRate: 0.3, money: true, x: 3165, y: 3489 },
    ],
    events: [
      { reward: 'xp', line: 'A lamp on the raid board. The lobby chat said nothing. They took it and stayed in the lobby.' },
      { reward: 'gold', line: 'They sold the supplies they had just packed. The raid could wait.' },
      { reward: 'gold', line: 'A stranger tipped them for reading the board out loud. They did not go in.' },
      { reward: 'both', line: 'A genie outside the lobby, lamp in one hand and a tip in the other. The door stayed shut.' },
      { reward: 'gear', line: 'The purple in the story was not a purple. A piece of the old kit, and it was better than theirs.' },
      { reward: 'gear', line: 'Somebody waiting on the raid threw gear at the bank chest. It was the metal they already wear.' },
      { reward: 'xp', skill: 'ranged', line: 'Practice on the dummy outside the Inferno. No cape. A lamp was sitting where they had been aiming.' },
      { reward: 'death', line: 'They zoned in for a look. The raid wiped on a mechanic they had only read. The hour was the lobby.' },
    ],
  },
};

for (const ground of Object.values(GROUNDS)) {
  for (const activity of ground.activities) activity.idle = true;
}

function groundById(id) {
  return GROUNDS[id] || null;
}

function activitiesFor(id) {
  const ground = GROUNDS[id];
  return ground ? ground.activities : [];
}

function eventsFor(id) {
  const ground = GROUNDS[id];
  return ground ? ground.events : [];
}

function activityById(id) {
  for (const ground of Object.values(GROUNDS)) {
    const found = ground.activities.find((activity) => activity.id === id);
    if (found) return found;
  }
  return null;
}

module.exports = {
  groundById,
  activitiesFor,
  eventsFor,
  activityById,
};
