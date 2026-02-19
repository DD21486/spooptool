# Fun insights we could get from SpoopTool data

Planning doc only — nothing added to the website yet. Data we have: character snapshots (skills, bosses over time), loot drops (item, value, source, rarity, luck_delta), activity log, luck_score per character, leaderboard_state (current boss kill leader), and deltas (XP / boss KC per character for 24h and today).

---

## What we could get with current data (no new backend)

| Insight | What it is | Data we have |
|--------|------------|--------------|
| **Boss kill leader** | Who has the most total boss KC | `leaderboard_state.boss_kill_leader` (already stored; Discord notifies on overtake) |
| **Luckiest / Unluckiest** | Highest and lowest luck meter | `characters.luck_score` |
| **Most XP today / 24h** | Who gained the most overall XP in the period | `characters-deltas` (today or 24h) → `xpDelta` per character |
| **Most boss KC today / 24h** | Who got the most boss kills in the period | Same API → `bossKcDelta` |
| **Top loot (all time / 24h / today)** | Who has the most total loot value | Loot leaderboard API → `players[]` with `totalValueGp` |
| **Biggest single drop** | Highest value on one loot event | `loot_drops` → max `total_value_gp` per row (could query or derive from existing leaderboard logic) |
| **Rarest drop in period** | Drop with best (smallest) “1 in N” in the window | `loot_drops.rarity_text` or Dink’s `rarestProbability` if we store it |
| **Boss main** | Character with the most KC at a *single* boss | Latest snapshot `data.bosses` → max count per character across bosses |
| **Jack of all trades** | Character with KC from the *most* different bosses | Same snapshot → count of bosses with `count > 0` |
| **Loot diversity** | Who has loot from the most different bosses | `loot_drops` → count distinct `source` per username in period |
| **Most active today** | Who has the most activity log entries today | `activity_log` filtered by today, count by username |
| **Touch grass** | Who gained the *least* today (or 24h) | Same deltas → minimum `xpDelta` / `bossKcDelta` (fun reverse leaderboard) |
| **Earned it** | High total KC but low or negative luck | Snapshot total boss KC + `characters.luck_score` |
| **Carried by RNG** | High luck and high loot value | `luck_score` + loot leaderboard total value |

---

## What we’d need a bit more for

| Insight | What we’d need |
|--------|----------------|
| **Spooned** | Clear “rare” threshold (e.g. 1/500+) and flag or query drops below that (we have rarity; need a shared definition of “spoon”). |
| **Dry streak** | Per character (and maybe per boss) “last rare drop at” or “kills since last rare” (new fields or derived from loot_drops + kill counts). |
| **Grindiest 24h** | We have 24h deltas; “grindiest” could just be “most XP in 24h” (same as “Most XP 24h” above) or “most XP in any single 24h window” (would need history of daily totals). |
| **Comeback** | History of who was boss leader when (e.g. `leaderboard_state` history or a log of leader changes). |
| **Boss of the week** | Sum of boss KC *gains* per boss across all characters (deltas already have `bossDeltas` per boss; aggregate by boss key). |
| **Peak hour** | Bucket snapshots or activity by hour, sum XP (or KC) per hour, then max hour. |
| **First to X** | Per-boss (or global) milestone config and a way to record “first to 100 Vorkath” etc. (e.g. milestone table or first time we see KC ≥ X). |
| **Collection log energy** | Count distinct bosses with KC > 0 per character (we have this in snapshot; no new storage). |
| **Consistency** | Daily totals per character for last 7 days, then variance or “least variance” winner. |
| **Dedication streak** | “Days in a row with at least one snapshot” per character (need daily activity flags or derive from snapshot dates). |

---

## Silly / flavour (copy and presentation)

- **Boss main label** — “Vorkath’s best friend”, “Araxxor enthusiast”, etc., from who has the most KC at one boss (data we have).
- **Luck tier** — “Spooned” / “Normal” / “Dry” from `luck_score` bands (e.g. &gt; 20, -20 to 20, &lt; -20).
- **One-liner** — e.g. “SpoopSpooply is on a tear today” when they’re #1 in both XP and boss KC today (deltas + comparison).

---

## Summary

- **No new backend:** leaderboard callouts (boss, XP, KC, loot), luckiest/unluckiest, boss main, jack of all trades, loot diversity, most active, touch grass, earned it / carried by RNG, and the silly labels.
- **Small extra logic or storage:** spooned (define rare), boss of the week (aggregate deltas by boss), peak hour (bucket by hour), collection log (count bosses with KC &gt; 0).
- **New or richer data:** dry streak, comeback story, first-to-X milestones, consistency, dedication streak.

Use this as the backlog when you want to add fun stats to the app.
