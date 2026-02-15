/**
 * OSRS XP table: total XP required for level L
 * Formula: floor((L + 300 * 2^(L/7)) / 4)
 * Same for all skills. Level 99 = 13,034,431 XP.
 */
function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor((level + 300 * Math.pow(2, level / 7)) / 4);
}

/**
 * XP required to reach the next level from current level and XP.
 * Returns 0 if already 99.
 */
function xpToNextLevel(level, currentXp) {
  if (level >= 99) return 0;
  const nextLevelXp = xpForLevel(level + 1);
  return Math.max(0, nextLevelXp - currentXp);
}

module.exports = { xpForLevel, xpToNextLevel };
