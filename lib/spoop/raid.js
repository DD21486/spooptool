/** Raid bosses. The party fights these one at a time.
 *  Leave hp null to size the pool from fightSeconds against the party that showed up.
 *  Set hp to a number to lock it.
 *  Attacks: circle on the boss, mark locked on a spoop, or a charge lane.
 *  osrsId is the wiki sprite used when the loot table rolls.
 */

const BRUTUS = {
  id: 'brutus',
  name: 'Brutus',
  monster: 'brutus',
  sprite: '/assets/bosses/Brutus.png',
  face: 'left',
  hp: null,
  minHp: 48,
  maxHp: 5000,
  fightSeconds: 42,
  defence: 36,
  radius: 7.2,
  speed: 3.4,
  chargeSpeed: 62,
  opener: 3.6,
  gold: 500,
  goldEach: 250,
  attacks: [
    { id: 'stomp', kind: 'circle', label: 'STOMP', verb: 'stomps', warn: 1.2, radius: 10.2, damage: [12, 18], cooldown: 2.5 },
    { id: 'toss', kind: 'mark', label: 'HORN', verb: 'hurls a horn at', warn: 1.5, radius: 4.4, damage: [8, 12], cooldown: 2.3, aim: 'far' },
    { id: 'charge', kind: 'lane', label: 'CHARGE', verb: 'charges', warn: 1.12, width: 6.4, reach: 30, damage: [14, 22], cooldown: 2.7, aim: 'any' },
  ],
  loot: [
    { name: 'Bones', weight: 42, osrsId: 526 },
    { name: 'Raw beef', weight: 24, osrsId: 2132 },
    { name: 'Cowhide', weight: 16, osrsId: 1739 },
    { name: 'Bullroarer', weight: 10, osrsId: 716 },
    { name: 'Amulet of strength', weight: 6, osrsId: 1725 },
    { name: 'Berserker ring', weight: 2, osrsId: 6737, rare: true },
  ],
};

const RAID_BOSSES = {
  brutus: BRUTUS,
};

function raidBoss(id) {
  const src = RAID_BOSSES[id] || RAID_BOSSES.brutus;
  return JSON.parse(JSON.stringify(src));
}

module.exports = { RAID_BOSSES, raidBoss };
