/**
 * SpoopScore computation for server-side use (cron, API).
 * Must stay in sync with character.js / app.js scoring rules.
 */

const POINTS_PER_10K_XP = 0.1;
const FIRST_KILL_BONUS = 10;
const PET_POINTS = 4000;

const BOSS_POINTS = {
  brutus: 0.5,
  wintertodt: 1, kraken: 1,
  tempoross: 2, bryophyta: 2, giant_mole: 2, giantmole: 2, hespori: 2, obor: 2, scurrius: 2, shellbane_gryphon: 2, shellbanegryphon: 2,
  amoxliatl: 3, barrows: 3, crazy_archaeologist: 3, crazyarchaeologist: 3, deranged_archaeologist: 3, derangedarchaeologist: 3, grotesque_guardians: 3, grotesqueguardians: 3, king_black_dragon: 3, kingblackdragon: 3, lunar_chests: 3, lunarchests: 3, tombs_of_amascut_entry_mode: 3, the_hueycoatl: 3, hueycoatl: 3, the_royal_titans: 3, royal_titans: 3, royaltitans: 3,
  dagannoth_prime: 4, dagannothprime: 4, dagannoth_rex: 4, dagannothrex: 4, dagannoth_supreme: 4, dagannothsupreme: 4, callisto: 4, chaos_fanatic: 4, chaosfanatic: 4, moons_of_peril: 4, skotizo: 4, sarachnis: 4,
  crystalline_hunllef: 5, gauntlet: 5, abyssal_sire: 5, abyssalsire: 5, araxxor: 5, cerberus: 5, chambers_of_xeric: 5, chambersofxeric: 5, commander_zilyana: 5, commanderzilyana: 5, duke_sucellus: 5, dukesucellus: 5, general_graardor: 5, generalgraardor: 5, krilsutsaroth: 5, kril_tsutsaroth: 5, kriltsutsaroth: 5, the_nightmare: 5, nightmare: 5, tombs_of_amascut: 5, tombsofamascut: 5, venenatis: 5, vorkath: 5, zalcano: 5, zulrah: 5, chaos_elemental: 5, chaoselemental: 5, scorpia: 5,
  kalphite_queen: 6, kalphitequeen: 6, kreearra: 6, corporeal_beast: 6, corporealbeast: 6, phantom_muspah: 6, phantommuspah: 6, thermonuclear_smoke_devil: 6, thermonuclearsmokedevil: 6, tztok_jad: 6, tztokjad: 6, vetion: 6, tombs_of_amascut_expert_mode: 8, tombsofamascutexpertmode: 8, alchemical_hydra: 6, alchemicalhydra: 6,
  corrupted_hunllef: 7, corruptedhunllef: 7, the_leviathan: 7, leviathan: 7, the_whisperer: 7, whisperer: 7, the_mimic: 7, mimic: 7, chambers_of_xeric_challenge_mode: 8, chambersofxericchallengemode: 8, vardorvis: 7, yama: 7,
  theatre_of_blood: 8, theatreofblood: 8, phosanis_nightmare: 8, phosanisnightmare: 8, nex: 8,
  tzhaar_ket_raks_challenges: 9,
  theatre_of_blood_hard_mode: 12,
  doom_of_mokhaiotl: 14, doomofmokhaiotl: 14,
  fortis_colosseum: 25, tzkal_zuk: 25, tzkalzuk: 25,
};

const SKILL_DIFFICULTY_RANK = {
  runecraft: 1, slayer: 2, agility: 3, mining: 4, woodcutting: 5, fishing: 6, smithing: 7,
  defence: 8, attack: 9, strength: 10, hitpoints: 11, ranged: 12, magic: 13, farming: 14,
  herblore: 15, crafting: 16, thieving: 17, hunter: 18, construction: 19, prayer: 20,
  firemaking: 21, cooking: 22, fletching: 23,
};

/** Keep in sync with character.js CHARACTER_PETS. */
const CHARACTER_PETS = {
  b7hund3r: ['Giant squirrel'],
  spoopspooply: ['Vorki'],
  legolad52: ['Vorki'],
  'roby pls': ['Chompy chick', 'Ikkle hydra', 'Nid', 'Rock golem', 'Skotos', 'Tzrek-jad'],
  newlinechar: ['Heron'],
  player1817: ['Beef', 'Chompy chick', 'Giant squirrel', 'Herbi', 'Rocky', 'Tangleroot'],
  norgentgorge: ['Phoenix'],
};

function normalizeBossKeyForPoints(key) {
  return String(key || '').toLowerCase().replace(/\s+/g, '_').replace(/'/g, '').replace(/:/g, '').replace(/-/g, '_').trim();
}

function getDifficultyBonusFor99(skillKey) {
  if (!skillKey || skillKey === 'overall') return 0;
  const rank = SKILL_DIFFICULTY_RANK[String(skillKey).toLowerCase()];
  if (rank == null) return 0;
  return Math.round(1000 - (700 * (rank - 1)) / 22);
}

function skillPointsForLevel(level, xp, skillKey) {
  const L = typeof level === 'number' && !Number.isNaN(level) ? Math.max(0, Math.min(99, Math.floor(level))) : 0;
  let pts = L * 15;
  if (L >= 40) pts += 5;
  if (L >= 50) pts += 10;
  if (L >= 60) pts += 25;
  if (L >= 70) pts += 100;
  if (L >= 80) pts += 200;
  if (L >= 90) pts += 300;
  if (L >= 93) pts += 600;
  if (L >= 99) pts += 3000;
  const xpNum = typeof xp === 'number' && !Number.isNaN(xp) ? Math.max(0, Math.floor(xp)) : (xp != null ? Math.max(0, Math.floor(Number(xp))) : 0);
  pts += Math.floor(xpNum / 10000) * POINTS_PER_10K_XP;
  if (L >= 99 && skillKey) pts += getDifficultyBonusFor99(skillKey);
  return pts;
}

function totalSkillingScore(skills) {
  if (!skills || typeof skills !== 'object') return 0;
  let totalLevel = 0;
  const sum = Object.entries(skills).reduce((acc, [key, s]) => {
    if (key === 'overall') return acc;
    if (!s || typeof s !== 'object') return acc;
    const level = s.level != null ? parseInt(s.level, 10) : NaN;
    if (!Number.isNaN(level) && level >= 0) totalLevel += level;
    const xp = s.xp != null ? s.xp : (s.experience != null ? s.experience : 0);
    return acc + skillPointsForLevel(level, xp, key);
  }, 0);
  const n = Math.floor(totalLevel / 100);
  const totalLevelBonus = (n * (n + 1)) / 2;
  return sum + totalLevelBonus;
}

function computeBossScore(bosses) {
  if (!bosses || typeof bosses !== 'object') return 0;
  let sum = 0;
  for (const [bossKey, b] of Object.entries(bosses)) {
    if (!b || typeof b !== 'object') continue;
    const count = b.count != null ? b.count : (b.kc != null ? b.kc : 0);
    const n = typeof count === 'number' && !Number.isNaN(count) ? count : 0;
    const pts = BOSS_POINTS[normalizeBossKeyForPoints(bossKey)] || 0;
    sum += n * pts + (n >= 1 ? FIRST_KILL_BONUS : 0);
  }
  return sum;
}

function getPetPoints(username) {
  if (!username) return 0;
  const key = String(username).toLowerCase().trim();
  const list = CHARACTER_PETS[key];
  const count = Array.isArray(list) ? list.length : 0;
  return count * PET_POINTS;
}

/**
 * Compute SpoopScore from snapshot data (skills + bosses) and username (for pet points).
 * Returns { spoopScore, bossScore, skillScore, petPoints }.
 */
function computeSpoopScore(skills, bosses, username) {
  const bossScore = computeBossScore(bosses || {});
  const skillScore = totalSkillingScore(skills || {});
  const petPoints = getPetPoints(username);
  return {
    spoopScore: bossScore + skillScore + petPoints,
    bossScore,
    skillScore,
    petPoints,
  };
}

module.exports = { computeSpoopScore, computeBossScore, totalSkillingScore, getPetPoints };
