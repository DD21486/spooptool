/**
 * Luck meter helpers: parse rarity, compute effective KC ratio, and tick delta.
 * Used by api/loot.js (boss drops) and api/cron/snapshot.js (baseline).
 */

/**
 * Parse "1 in N" from rarity text. Returns expected kills (N) or null.
 * e.g. "1 in 100.0 (1%)" -> 100, "1 in 5000" -> 5000
 */
function parseRarityToExpectedKills(rarityText) {
  if (!rarityText || typeof rarityText !== 'string') return null;
  const s = rarityText.trim();
  const match = s.match(/1\s+in\s+([\d.,]+)/i);
  if (!match) return null;
  const n = parseFloat(match[1].replace(/,/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/**
 * Given ratio = effective_kc / expected_kills:
 * - ratio < 1: lucky (got drop early) -> positive ticks
 * - ratio > 1: unlucky (dry) -> negative ticks
 * - 0.8 <= ratio <= 1.2: on rate -> nudge toward 0 (caller applies based on current score)
 * Returns { type: 'lucky'|'unlucky'|'on_rate', delta: number }.
 * delta is the change to apply to luck_score (clamp to [-100,100] elsewhere).
 */
function getLuckDelta(ratio, currentLuckScore) {
  if (ratio >= 0.8 && ratio <= 1.2) {
    if (currentLuckScore < 0) return { type: 'on_rate', delta: 1 };
    if (currentLuckScore > 0) return { type: 'on_rate', delta: -1 };
    return { type: 'on_rate', delta: 0 };
  }
  if (ratio < 1) {
    if (ratio < 0.1) return { type: 'lucky', delta: 5 };
    if (ratio < 0.25) return { type: 'lucky', delta: 3 };
    if (ratio < 0.5) return { type: 'lucky', delta: 2 };
    return { type: 'lucky', delta: 1 };
  }
  if (ratio > 10) return { type: 'unlucky', delta: -5 };
  if (ratio > 4) return { type: 'unlucky', delta: -3 };
  if (ratio > 2) return { type: 'unlucky', delta: -2 };
  return { type: 'unlucky', delta: -1 };
}

module.exports = {
  parseRarityToExpectedKills,
  getLuckDelta,
};
