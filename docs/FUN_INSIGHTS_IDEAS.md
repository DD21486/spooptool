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

---

## More fun ideas (additions)

### Quick wins (existing or minimal data)

| Idea | What it is | Data / notes |
|------|------------|--------------|
| **Rivalry of the day** | Side‑by‑side: pick two characters, compare total XP, boss KC, 99s, SpoopScore. "SpoopSpooply wins 3–2 in categories." | Latest snapshot + simple comparison UI. |
| **Skill flex** | "Slayer king" = most Slayer XP in the group; "Mining lord" = most Mining XP. One row or badge per skill. | Latest snapshot, max per skill across characters. |
| **99 count leaderboard** | Rank everyone by number of 99s. "SpoopSpooply: 12 — Friend: 8." | Count skills at level 99 from snapshot. |
| **Closest to level** | "12k XP from 90 Attack" — show who in the group is nearest to their next level (per skill or overall). | Snapshot + XP-to-next (already computed). |
| **Group total** | Big number: "Your group: 2.3B total XP" (sum of all character total XP). | Sum from latest snapshot. |
| **Boss diversity %** | "You've killed 23% of tracked bosses" — (bosses with KC &gt; 0) / total bosses we track. | Snapshot; count distinct bosses with count &gt; 0. |
| **Reverse SpoopScore** | "Lowest SpoopScore" leaderboard — for the lols. | Same SpoopScore, sort ascending. |
| **RNG tier list** | Sort characters by `luck_score` into tiers: Spooned / Normal / Dry (with bands e.g. &gt;20, -20–20, &lt;-20). | `characters.luck_score`. |
| **Grind pair** | "Today's grind duo: SpoopSpooply + Friend" — the two with most XP gained today. | Deltas, take top 2. |
| **One-liner generator** | Random fun fact: "SpoopSpooply has 47× more Vorkath KC than Zulrah", "Carried by RNG" (high luck + high loot). | Snapshot + luck + loot; pick a template, fill in. |
| **Time to 99** | "At your 7-day rate, 99 Slayer in ~12 days." Per skill, when we have enough history. | Deltas + current XP + XP for 99. |

### Silly / flavour

| Idea | What it is |
|------|------------|
| **Random roast** | Data-driven roasts: "Still no 99 Slayer?" (if Slayer &lt; 99), "Vorkath called, he wants his KC back" (if low Vorkath). Optional, toggle or easter egg. |
| **Mood / status line** | Let each user set a one-line status (e.g. "Grinding ToB") — store in DB or localStorage; show next to name on homepage. |
| **Boss main label** | Already in doc — "Vorkath's best friend", "Zulrah enthusiast" from who has most KC at one boss. |
| **Weekly MVP badge** | "MVP of the week" = most XP gained this week; show a small badge or crown next to their name on homepage. |
| **Touch grass crown** | Dedicated "Touch grass" section: who gained the *least* today. Crown for "most grass touched." |

### Needs a bit more (storage or logic)

| Idea | What we'd need |
|------|----------------|
| **Season / league** | "Season 1: Jan 1–31" — leaderboard of who gained the most in that period. Resets each month. Filter deltas by date range; optional "season" table for start/end. |
| **First to X** | "First to 1k Vorkath" — record when someone first hits a milestone (e.g. milestone table or first time snapshot has KC ≥ X). |
| **Brag of the week** | Optional: users submit a screenshot or link; show "Brag of the week" on homepage (needs upload/storage or just a URL + manual pick). |
| **Boss bingo** | 3×3 card of bosses; first to get KC &gt; 0 in all 9 gets "Bingo!" (track first-to-complete or just show who has all 9). |
| **Daily challenge** | "Today's challenge: most Construction XP" — next day compare deltas for that skill. Just a label + filter; or random skill each day. |

### Summary of new ideas

- **No/small backend:** Rivalry of the day, skill flex, 99 count, closest to level, group total, boss diversity %, reverse SpoopScore, RNG tier list, grind pair, one-liner generator, time to 99, roasts, boss main label, weekly MVP, touch grass crown. Status line needs one new field (or localStorage).
- **Some logic or storage:** Season/league (date filter or season table), first to X (milestone table or snapshot scan), brag of the week (optional upload/URL), boss bingo (track completion), daily challenge (label + skill filter).
