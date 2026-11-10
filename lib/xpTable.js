// OSRS cumulative XP. The official table stops at 99; the same formula
// keeps going so spoop skills can reach level 999.
const MAX_LEVEL = 999;
const XP_TABLE = (function () {
  const ret = [0];
  let total = 0;
  for (let i = 1; i < MAX_LEVEL; i++) {
    total = Math.floor(total + i + 300 * Math.pow(2, i / 7));
    ret[i + 1] = Math.floor(total / 4);
  }
  return ret;
})();

/**
 * Total XP required to reach level L. Level 99 is 13,034,431.
 * Levels above 99 use the same per-level formula, up to 999.
 */
function xpForLevel(level) {
  const L = parseInt(level, 10);
  if (Number.isNaN(L) || L <= 1) return 0;
  if (L >= MAX_LEVEL) return XP_TABLE[MAX_LEVEL];
  return XP_TABLE[L] != null ? XP_TABLE[L] : 0;
}

/**
 * XP required to reach the next level from current level and current XP.
 * Real hiscores cap at 99, so a level of 99 or more reports no next level.
 */
function xpToNextLevel(level, currentXp) {
  const L = parseInt(level, 10);
  if (Number.isNaN(L) || L >= 99) return 0;
  const xp = Math.max(0, parseInt(currentXp, 10) || 0);
  const nextLevelXp = xpForLevel(L + 1);
  return Math.max(0, nextLevelXp - xp);
}

module.exports = { xpForLevel, xpToNextLevel, MAX_LEVEL };
