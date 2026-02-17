# Luck meter – implementation plan

## Constraint: no new endpoints

**API count must stay at 11 or under.** Do not add any new routes. All luck behavior must use existing endpoints only (e.g. add `luck_score` to an existing response; set baseline via existing cron or a one-off script, not a new API).

---

## Goal

A full-width horizontal “luck” meter on the character page, **above Boss kills and below Skills**, showing a needle from **-100 (Unlucky)** to **+100 (Lucky)** with **Normal** at 0. Only **boss drops** (drops with a source mapped to a boss) affect the meter. When we ingest a boss drop via the loot webhook, we update the character’s luck score based on whether the drop was lucky, on rate, or unlucky.

---

## 1. UI (character page)

- **Placement:** Between the **Skills** section and the **Boss kills** section (below skills, above boss stats).
- **Layout:** Full width from margin to margin (same max-width container as the rest of the page).
- **Elements:**
  - A horizontal track (e.g. a thin bar or line).
  - Left label: **Unlucky** (−100).
  - Center label: **Normal** (0).
  - Right label: **Lucky** (+100).
  - A “needle” or marker whose horizontal position is `luck_score` (e.g. `position = 50% + (luck_score / 100) * 50%` so −100 = left edge, 0 = center, +100 = right edge).
- **Data:** Needle position and optional numeric label (e.g. “+23”) from the character’s `luck_score` returned by the API.

---

## 2. Data model

- **Store one luck score per character:** integer from **−100** to **+100**, default **0**.
- **Option A (recommended):** Add a column to `characters`:
  - `luck_score INT DEFAULT 0` with a check or constraint so it stays in [−100, 100].
- **Option B:** Separate table `character_luck (character_id, score, updated_at)`.
- **Migration:** One small migration (e.g. `sql/migration_luck_score.sql`) that adds the column (or table) and a short comment.

---

## 2b. Luck baseline (so everyone “starts at 0”)

**Problem:** A player with 7,000 Araxxor KC already has a long history we never saw. If they get a drop at 7,001 KC, using raw KC (7,001) would make them look “unlucky” (1 drop in 7,001 kills). In reality they may have had many drops in those 7,000 kills—we just didn’t track them. So we should only count **kills and drops after a chosen starting point**.

**Approach: baseline snapshot per (character, boss)**

- Store a **baseline KC** per character per boss: “at this moment, we treat their KC as 0 for luck.”
- For any drop, use **effective KC** = `kill_count_at_drop - baseline_kc` for that boss.
- Only apply luck logic when the drop’s `kill_count` is **greater than** the baseline (i.e. the drop happened after we started tracking).

**Data model**

- New table, e.g. `luck_baseline`:
  - `character_id` (FK → characters)
  - `boss_key` (VARCHAR, normalized boss id, same as used for mapping)
  - `kill_count` INT (their KC at snapshot time)
  - `snapshot_at` TIMESTAMPTZ (when we took this baseline)
  - Unique on `(character_id, boss_key)` so one baseline per character per boss.
- When we **don’t** have a row for (character, boss): treat baseline as **0** (so new characters or new bosses behave as “start from 0”).

**Taking the snapshot (no new endpoints)**

- **Option A – Existing cron with query param:** Use the **existing** `/api/cron/snapshot` endpoint. When called with an optional param (e.g. `?set_luck_baseline=1`) and valid `CRON_SECRET`, after writing snapshots as usual, also upsert `luck_baseline` from the snapshot data just written. Trigger once (e.g. from cron-job.org or manually) to set baseline; from then on call without the param. Same path, no new endpoint.
- **Option B – One-time SQL or script:** Provide a **SQL script** or a **local Node script** (run once from your machine or Neon SQL Editor) that reads the latest `character_snapshots` per character, extracts boss KCs from the `data` JSONB, and inserts into `luck_baseline`. No API involved.
- **Option C – Use oldest snapshot as baseline:** For each (character, boss), set baseline = KC from the **earliest** snapshot we have (e.g. in the same SQL script or in cron logic). “Tracking” starts from first data we have; no new endpoint.

**In the loot handler**

- When evaluating a boss drop:
  1. Resolve character and normalized `boss_key` from `source`.
  2. `SELECT kill_count FROM luck_baseline WHERE character_id = ? AND boss_key = ?`. If no row, baseline = 0.
  3. If `kill_count_at_drop <= baseline` → skip (drop is in the past relative to our baseline, or bad data).
  4. **Effective KC** = `kill_count_at_drop - baseline`.
  5. Use **effective KC** (not raw) for ratio: `effective_kc / expected_kills`. Then apply tick rules as before.

**Summary**

- Yes: take a snapshot of all boss KCs (per character, per boss) and store it as the baseline. From then on, everyone effectively “starts at 0” for luck. Only drops that occur when `kill_count > baseline` count, and we use `(kill_count - baseline)` as the KC for that drop so someone with 7,000 baseline who gets a drop at 7,001 is evaluated as 1 effective KC (mega lucky) instead of 7,001 (unlucky).

---

## 3. Boss mapping (when does a drop count?)

- A drop is **only** counted for the luck meter if:
  - It has a **source** (e.g. “Vorkath”, “The Whisperer”).
  - That source is considered a **boss** (see below).
- **Boss list:** Use a single source of truth so we don’t count random activities. Options:
  - **A:** Maintain a list of canonical boss names (or slugs) that match Hiscores bosses (e.g. from `osrs-json-hiscores` or your existing boss list). Normalize `source` (trim, case-insensitive or slug) and check membership.
  - **B:** Treat any drop that has both `source` and `kill_count` as a “boss” drop (simpler but may include non-boss content).
- **Recommendation:** Option A with a normalized list derived from your existing boss keys (same as used for boss kills table). When ingesting loot, if `source` normalizes to one of these bosses, the drop is eligible for luck updates.

---

## 4. When to update luck (POST /api/loot)

- Run the logic **once per webhook payload** (one “drop event”), not per item line, using the event’s **rarest** drop and **kill count** (same as Discord big-drop logic).
- **Inputs from payload:** `source`, `kill_count` (at drop), `rarest` (rarity text, e.g. “1 in 100.0 (1%)”).
- **Conditions to skip update:**
  - `source` is null or not mapped to a boss → skip.
  - `kill_count` is null → skip (we need KC at drop for this event).
  - Look up **baseline KC** for (character, boss); if `kill_count <= baseline` → skip (drop is before our tracking window).
  - `rarest` is null or unparseable → skip.
  - Parsed “1 in N” gives N ≤ 1 or nonsensical → skip (e.g. guaranteed drops don’t move the meter).

---

## 5. Parsing rarity

- From `rarity_text` (e.g. “1 in 100.0 (1%)” or “1 in 5000”), parse **expected KC** = N (the number after “1 in ”).
- **Implementation:** Regex or simple string split (e.g. `1 in 5000` → 5000). Ignore the “(1%)” part if present.
- **Expected kills** = N. **Actual kills** = **effective KC** = `kill_count` from the drop **minus** baseline KC for that (character, boss). If no baseline row, baseline = 0.

---

## 6. Lucky / on rate / unlucky

- **Ratio** = `effective_kills / expected_kills` = `(kill_count_at_drop - baseline_kc) / N`.
- **Lucky:** ratio **< 1** (got the drop before expected).
- **Unlucky:** ratio **> 1** (got the drop after expected / dry).
- **On rate:** ratio in a band around 1 (e.g. **0.8 ≤ ratio ≤ 1.2**). Exact thresholds can be tuned later.

---

## 7. Tick amounts (how much to move the needle)

- **Lucky (ratio < 1):** move score **up** (toward +100):
  - 1 tick:  ratio in [0.5, 0.8)  (or similar)
  - 2 ticks: ratio in [0.25, 0.5)
  - 3 ticks: ratio in [0.1, 0.25)
  - 5 ticks: ratio < 0.1 (mega lucky)
- **Unlucky (ratio > 1):** move score **down** (toward −100):
  - 1 tick:  ratio in (1.2, 2]
  - 2 ticks: ratio in (2, 4]
  - 3 ticks: ratio in (4, 10]
  - 5 ticks: ratio > 10 (mega dry)
- **On rate (e.g. 0.8 ≤ ratio ≤ 1.2):**
  - If current **luck_score < 0:** add **1** (nudge toward normal/lucky).
  - If current **luck_score > 0:** subtract **1** (nudge toward normal).
  - If **luck_score === 0:** no change (optional).

All changes are then **clamped** so the new score stays in [−100, 100].

---

## 8. Where to implement the update

- **In `api/loot.js`**, inside the POST handler, **after** inserting loot rows:
  - If no boss drop (skip conditions above), do nothing.
  - Otherwise:
    - Parse rarity → expected N.
    - Compute ratio = kill_count / N.
    - Classify as lucky / on rate / unlucky and compute **delta** (e.g. +2, −1, etc.).
    - Load current `luck_score` for the character (from `characters` or `character_luck`). If character not in DB, skip or use 0.
    - New score = clamp(current + delta, −100, 100).
    - Update `characters.luck_score` (or equivalent) for that character.

---

## 9. Exposing luck_score to the front end

- **Character page:** The character page needs `luck_score` for the current player. **No new endpoint:** add `luck_score` to the response of whatever endpoint the character page already uses (e.g. `GET /api/character-snapshot?name=...` or the payload from `GET /api/player/[name]`). Include it in that existing response (e.g. join `characters.luck_score` when returning character + snapshot) so the meter can render without an extra request.

---

## 10. Implementation order

1. **Migrations:** Add `luck_score` on `characters`; add `luck_baseline` table (character_id, boss_key, kill_count, snapshot_at).
2. **Boss list:** Define a normalized list of “boss” sources (or a small helper that checks `source` against Hiscores boss keys).
3. **Baseline snapshot:** Implement a way to set baseline **without a new endpoint**: e.g. optional query param on existing `GET/POST /api/cron/snapshot` (e.g. `?set_luck_baseline=1`), or a one-time SQL/Node script that populates `luck_baseline` from latest `character_snapshots`. Run it once when enabling the feature so everyone “starts at 0.”
4. **Loot handler:** In `api/loot.js` POST:
   - Resolve character + boss; look up baseline; compute effective KC; parse rarity; compute ratio; classify; compute delta; read current luck_score; clamp and update.
5. **API:** Add `luck_score` to the **existing** character/snapshot response used by the character page (no new endpoint).
6. **UI:** Insert the meter block in `character.html` (below Skills, above Boss kills) and in `character.js` (needle position from `luck_score`, labels Unlucky | Normal | Lucky).

---

## 11. Edge cases / notes

- **Multiple items in one webhook:** Use one evaluation per event (one `source`, one `kill_count`, one `rarest`). Single tick per webhook for luck.
- **Character not in list:** If the loot webhook is for a username not in `characters`, you can skip the luck update (or create character and set luck_score; current design is “only registered characters have a meter”).
- **Rarity format:** If Dink changes format, parsing may need updating; keep the parse in one place (e.g. `parseRarityToExpectedKills(rarityText)`).
- **Meter when no data:** If `luck_score` is 0 and no boss drops have been logged, the needle stays at center; no special UX required beyond “Normal”.

---

## 12. Summary

| Item              | Detail                                                                 |
|-------------------|------------------------------------------------------------------------|
| **Meter position**| Below Skills, above Boss kills, full width.                            |
| **Scale**         | −100 (Unlucky) … 0 (Normal) … +100 (Lucky).                            |
| **Storage**       | One integer per character (e.g. `characters.luck_score`).              |
| **Eligibility**   | Only drops whose `source` is mapped to a boss.                        |
| **Baseline**      | Per (character, boss) in `luck_baseline`; effective KC = drop KC − baseline so everyone “starts at 0.” |
| **Inputs**        | `source`, `kill_count`, `rarest` from Dink; baseline from DB.         |
| **Lucky**         | ratio &lt; 1 → tick up (1–5); **Unlucky** ratio &gt; 1 → tick down (1–5). |
| **On rate**       | ratio ≈ 1 → nudge toward 0 (1 tick toward center).                     |
| **Update**        | In POST `/api/loot` after inserting drops; clamp to [−100, 100].       |
| **Endpoints**     | No new routes; use existing only (add fields to existing responses; baseline via cron param or one-off script). |

This gives you a concrete plan to implement the luck meter and the tick rules you described, only for boss drops, with small movements (1–5 ticks) and on-rate correction toward Normal, while keeping the API at 11 endpoints or fewer.
