// OSRS cumulative XP per level (1–99). From wiki Module:Experience/data.
const XP_TABLE = (function () {
  const ret = [0];
  let total = 0;
  for (let i = 1; i <= 98; i++) {
    total = Math.floor(total + i + 300 * Math.pow(2, i / 7));
    ret[i + 1] = Math.floor(total / 4);
  }
  return ret;
})();

/**
 * Total XP required to reach level L (1–99). Same for all skills. Level 99 = 13,034,431 XP.
 */
function xpForLevel(level) {
  const L = parseInt(level, 10);
  if (Number.isNaN(L) || L <= 1) return 0;
  if (L >= 99) return XP_TABLE[99];
  return XP_TABLE[L] != null ? XP_TABLE[L] : 0;
}

/**
 * XP required to reach the next level from current level and current XP.
 * Returns 0 if already level 99 (max).
 */
function xpToNextLevel(level, currentXp) {
  const L = parseInt(level, 10);
  if (Number.isNaN(L) || L >= 99) return 0;
  const xp = Math.max(0, parseInt(currentXp, 10) || 0);
  const nextLevelXp = xpForLevel(L + 1);
  return Math.max(0, nextLevelXp - xp);
}

module.exports = { xpForLevel, xpToNextLevel };
