# Skill XP points – plan

## Goal
Add a small, uncapped XP-based bonus to Skill Score so that natural skilling (XP gains) has a visible but modest impact. Level 99 is ~13M XP; you want this to add on the order of **~1k total points** for a maxed account (22 skills × ~13M), with **no cap** so 200M XP keeps counting.

## Current formula (level only)
- 15 per level
- +100 at 70, +200 at 80, +500 at 93, +2500 at 99
- Level 99 skill ≈ **4,785** points. No XP component.

## Proposed addition: points per 10k XP
- **Rule:** `floor(XP / 10_000) × P` points, with **no cap** (post-99 and 200M both count).
- **P** = points per 10k XP (tunable).

## Rate options

| P (per 10k) | At 13M (99) | At 200M | 22 skills @ 13M total | 22 skills @ 200M total |
|-------------|-------------|---------|------------------------|-------------------------|
| **0.1**     | 130 pts     | 2,000   | **~2,860**             | 44,000                  |
| **0.05**    | 65 pts     | 1,000   | **~1,430**             | 22,000                  |
| **~0.035** (1 pt / 285k) | ~45 pts | ~700  | **~1,000**             | ~15,400                 |
| **0.04** (1 pt / 250k)   | 52 pts  | 800    | **~1,144**             | 17,600                  |

- **0.1 per 10k**: Simple (“0.1 points per 10k”). Gives ~2.9k extra at max 99, so a bit more than “1k total” but still only a few % of total Skill Score. At 200M per skill, +2k per skill (big but “no limit”).
- **~0.035–0.04 per 10k**: Closer to “~1k total at 99”; 200M still adds a few hundred per skill.
- **0.05 per 10k**: Middle ground: ~1.4k total at 99, 1k extra per skill at 200M.

**Recommendation:** Start with **0.1 points per 10k XP**. It’s easy to explain, and “1k total” can be treated as a rough target rather than exact; if it feels high we can lower to 0.05 or 0.04 later.

## Balance check
- Max level-only score per skill: **4,785**. With 0.1/10k at 13M: **4,785 + 130 = 4,915** (~2.7% increase).
- Total Skill Score for 22 × 99: **105,270** (level only). With XP: **105,270 + 2,860 = 108,130** (~2.7%).
- So level stays dominant; XP is a small, continuous bonus that rewards grinding past 99 and going toward 200M.

## Implementation summary
1. **Data:** Skills already have `xp` or `experience` in the API/snapshot; use that (0 if missing).
2. **Formula:** In `skillPointsForLevel(level, xp)` (or equivalent), add:
   - `xpPoints = Math.floor(Number(xp) / 10_000) * 0.1`
   - Return level points + xpPoints. No cap.
3. **Places to update:**
   - **character.js:** `skillPointsForLevel(level, xp)`, `totalSkillingScore(skills)` (pass xp per skill), and the skills table row that shows per-skill score (pass xp). Scoring modal text: add “Plus 0.1 points per 10k XP (no cap).”
   - **app.js:** Same `skillPointsForLevel(level, xp)` and `totalSkillingScore(skills)` so the homepage SpoopScore chart and any tooltips stay correct.
4. **Display:** In the Skill Score tab of the scoring modal, add a bullet: “+0.1 points per 10k XP (no cap).” Optionally show XP component in the level-99 example (e.g. “13M XP → +130”).

## Optional later
- Constant `POINTS_PER_10K = 0.1` in one place so we can tune without searching.
- If 0.1 feels too strong, switch to 0.05 or 0.04 and update the modal text.
