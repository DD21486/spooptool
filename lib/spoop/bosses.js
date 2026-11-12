/** Rare uniques a spoop can pull while they are on that boss. osrsId is the public wiki sprite. */

function drop(name, slot, baseId, tier, osrsId, style) {
  return { name, slot, baseId, tier, quality: 'masterwork', osrsId, style: style || null };
}

const BOSS_DROPS = {
  mole: {
    name: 'the Giant Mole',
    drops: [
      drop('Mole claw', 'weapon', 'mace', 'rune', 7416, 'melee'),
    ],
  },
  scurrius: {
    name: 'Scurrius',
    drops: [
      drop('Bone mace', 'weapon', 'mace', 'adamant', 28792, 'melee'),
    ],
  },
  kbd: {
    name: 'the King Black Dragon',
    drops: [
      drop('Draconic visage', 'shield', 'kiteshield', 'dragon', 11286),
      drop('Dragon pickaxe', 'weapon', 'mace', 'dragon', 11920, 'melee'),
    ],
  },
  kq: {
    name: 'the Kalphite Queen',
    drops: [
      drop('Dragon chainbody', 'body', 'platebody', 'dragon', 3140),
      drop('Dragon 2h sword', 'weapon', 'longsword', 'dragon', 7158, 'melee'),
    ],
  },
  sarachnis: {
    name: 'Sarachnis',
    drops: [
      drop('Sarachnis cudgel', 'weapon', 'mace', 'rune', 23528, 'melee'),
    ],
  },
  barrows: {
    name: 'Barrows',
    drops: [
      drop("Dharok's greataxe", 'weapon', 'longsword', 'barrows', 4718, 'melee'),
      drop("Ahrim's staff", 'weapon', 'staff', 'barrows', 4710, 'magic'),
      drop("Karil's crossbow", 'weapon', 'shortbow', 'barrows', 4734, 'ranged'),
    ],
  },
  kraken: {
    name: 'the Kraken',
    drops: [
      drop('Trident of the seas', 'weapon', 'staff', 'rune', 11905, 'magic'),
      drop('Kraken tentacle', 'weapon', 'dagger', 'rune', 12004, 'magic'),
    ],
  },
  cerberus: {
    name: 'Cerberus',
    drops: [
      drop('Primordial boots', 'boots', 'boots', 'dragon', 13239),
      drop('Pegasian boots', 'boots', 'boots', 'dragon', 13237),
      drop('Eternal boots', 'boots', 'boots', 'dragon', 13235),
    ],
  },
  zulrah: {
    name: 'Zulrah',
    drops: [
      drop('Toxic blowpipe', 'weapon', 'shortbow', 'dragon', 12926, 'ranged'),
      drop('Magic fang', 'weapon', 'staff', 'dragon', 12932, 'magic'),
      drop('Serpentine visage', 'shield', 'kiteshield', 'dragon', 12927),
    ],
  },
  vorkath: {
    name: 'Vorkath',
    drops: [
      drop('Skeletal visage', 'shield', 'kiteshield', 'dragon', 22006),
      drop('Draconic visage', 'shield', 'kiteshield', 'dragon', 11286),
      drop('Dragonbone necklace', 'neck', 'amulet', 'dragon', 22111),
    ],
  },
  hydra: {
    name: 'the Alchemical Hydra',
    drops: [
      drop('Hydra claw', 'weapon', 'dagger', 'dragon', 22966, 'melee'),
      drop('Hydra leather', 'body', 'platebody', 'dragon', 22983),
    ],
  },
  gauntlet: {
    name: 'the Hunllef',
    drops: [
      drop('Blade of saeldor', 'weapon', 'scimitar', 'raid', 23995, 'melee'),
      drop('Bow of faerdhinen', 'weapon', 'shortbow', 'raid', 25865, 'ranged'),
    ],
  },
  cox: {
    name: 'Chambers of Xeric',
    drops: [
      drop('Twisted bow', 'weapon', 'shortbow', 'raid', 20997, 'ranged'),
      drop('Dexterous prayer scroll', 'shield', 'kiteshield', 'raid', 21034),
    ],
  },
  tob: {
    name: 'the Theatre of Blood',
    drops: [
      drop('Scythe of vitur', 'weapon', 'longsword', 'raid', 22325, 'melee'),
      drop('Avernic defender', 'shield', 'kiteshield', 'raid', 22322),
      drop('Ghrazi rapier', 'weapon', 'sword', 'raid', 22324, 'melee'),
    ],
  },
  toa: {
    name: "Tombs of Amascut",
    drops: [
      drop("Tumeken's shadow", 'weapon', 'staff', 'raid', 27275, 'magic'),
      drop("Osmumten's fang", 'weapon', 'sword', 'raid', 26219, 'melee'),
      drop('Lightbearer', 'ring', 'ring', 'raid', 25975),
    ],
  },
  nex: {
    name: 'Nex',
    drops: [
      drop('Zaryte crossbow', 'weapon', 'shortbow', 'raid', 26374, 'ranged'),
      drop('Torva platebody', 'body', 'platebody', 'raid', 26384),
    ],
  },
  nightmare: {
    name: 'the Nightmare',
    drops: [
      drop("Inquisitor's mace", 'weapon', 'mace', 'raid', 24417, 'melee'),
      drop("Inquisitor's great helm", 'head', 'med-helm', 'raid', 24419),
    ],
  },
  muspah: {
    name: 'the Phantom Muspah',
    drops: [
      drop('Ancient icon', 'neck', 'amulet', 'dragon', 27627),
      drop('Venator bow', 'weapon', 'shortbow', 'dragon', 27612, 'ranged'),
    ],
  },
  inferno: {
    name: 'the Inferno',
    drops: [
      drop('Infernal cape', 'cape', 'cape', 'raid', 21295),
    ],
  },
};

/** Single bosses a spoop can attempt. threat 1 is forgiving, 3 is a real chance of dying. */
const SPOOP_BOSSES = {
  giant_mole: { name: 'Giant Mole', icon: 'giantmole.png', threat: 1 },
  scurrius: { name: 'Scurrius', icon: 'scurrius.png', threat: 1 },
  obor: { name: 'Obor', icon: 'Obor.png', threat: 1 },
  bryophyta: { name: 'Bryophyta', icon: 'Bryophyta.png', threat: 1 },
  barrows: { name: 'Barrows', icon: 'barrows.png', threat: 1 },
  crazy_archaeologist: { name: 'Crazy archaeologist', icon: 'Crazyarchaeologist.png', threat: 1 },
  chaos_fanatic: { name: 'Chaos Fanatic', icon: 'ChaosFanatic.png', threat: 1 },
  wintertodt: { name: 'Wintertodt', icon: 'Wintertodt.gif', threat: 1 },
  tempoross: { name: 'Tempoross', icon: 'Tempoross.png', threat: 1 },
  hespori: { name: 'Hespori', icon: 'Hespori.png', threat: 1 },
  sarachnis: { name: 'Sarachnis', icon: 'Sarachnis.png', threat: 1 },
  king_black_dragon: { name: 'King Black Dragon', icon: 'KingBlackDragon.png', threat: 2 },
  kalphite_queen: { name: 'Kalphite Queen', icon: 'KalphiteQueen.png', threat: 2 },
  kraken: { name: 'Kraken', icon: 'Kraken.png', threat: 2 },
  grotesque_guardians: { name: 'Grotesque Guardians', icon: 'GrotesqueGuardians.png', threat: 2 },
  dagannoth_rex: { name: 'Dagannoth Rex', icon: 'DagannothRex.png', threat: 2 },
  dagannoth_prime: { name: 'Dagannoth Prime', icon: 'DagannothPrime.png', threat: 2 },
  dagannoth_supreme: { name: 'Dagannoth Supreme', icon: 'DagannothSupreme.png', threat: 2 },
  callisto: { name: 'Callisto', icon: 'Callisto.png', threat: 2 },
  vetion: { name: "Vet'ion", icon: 'Vetion.png', threat: 2 },
  tztok_jad: { name: 'TzTok-Jad', icon: 'TzTokJad.png', threat: 2 },
  skotizo: { name: 'Skotizo', icon: 'Skotizo.png', threat: 2 },
  thermonuclear_smoke_devil: { name: 'Thermonuclear smoke devil', icon: 'ThermonuclearSmokeDevil.png', threat: 2 },
  zalcano: { name: 'Zalcano', icon: 'Zalcano.png', threat: 2 },
  phantom_muspah: { name: 'Phantom Muspah', icon: 'PhantomMuspah.png', threat: 2 },
  zulrah: { name: 'Zulrah', icon: 'Zulrah.png', threat: 2 },
  vorkath: { name: 'Vorkath', icon: 'Vorkath.png', threat: 2 },
  cerberus: { name: 'Cerberus', icon: 'Cerberus.png', threat: 2 },
  alchemical_hydra: { name: 'Alchemical Hydra', icon: 'AlchemicalHydra.png', threat: 2 },
  general_graardor: { name: 'General Graardor', icon: 'GeneralGraardor.png', threat: 3 },
  commander_zilyana: { name: 'Commander Zilyana', icon: 'CommanderZilyana.png', threat: 3 },
  kreearra: { name: "Kree'arra", icon: 'Kreearra.png', threat: 3 },
  kril_tsutsaroth: { name: "K'ril Tsutsaroth", icon: 'KrilTsutsaroth.png', threat: 3 },
  abyssal_sire: { name: 'Abyssal Sire', icon: 'AbyssalSire.png', threat: 3 },
  corporeal_beast: { name: 'Corporeal Beast', icon: 'CorporealBeast.png', threat: 3 },
  gauntlet: { name: 'Crystalline Hunllef', icon: 'Gauntlet.png', threat: 3 },
  chambers_of_xeric: { name: 'Chambers of Xeric', icon: 'ChambersOfXeric.png', threat: 3 },
  theatre_of_blood: { name: 'Theatre of Blood', icon: 'TheatreOfBlood.png', threat: 3 },
  tombs_of_amascut: { name: 'Tombs of Amascut', icon: 'TombsOfAmascut.png', threat: 3 },
  nex: { name: 'Nex', icon: 'Nex.png', threat: 3 },
  nightmare: { name: 'The Nightmare', icon: 'Nightmare.png', threat: 3 },
  tzkal_zuk: { name: 'TzKal-Zuk', icon: 'TzKalZuk.png', threat: 3 },
};

module.exports = { BOSS_DROPS, SPOOP_BOSSES };
