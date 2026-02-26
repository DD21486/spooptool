# SpoopTool – Full documentation (current state)

SpoopTool is a private Old School RuneScape (OSRS) progress tracker. It shows character stats, rankings, SpoopScore (Boss + Skill), loot, and activity. Data comes from the OSRS Hiscores (via cron snapshots), optional live Hiscores lookups, and loot drops from the Dink plugin (webhook). Everything is stored in a Neon Postgres database and served by Vercel serverless APIs and static front ends.

---

## 1. Features

### 1.1 Homepage (`/`)

- **Character list**  
  All tracked characters; data is loaded from the database (latest snapshots), not from Hiscores on page load.

- **View modes**  
  Tabs: **Last 24**, **Today**, **This Week**, **This Month**. All tables and charts respect the selected period (except Skill Score, which is always total).

- **Three leaderboard columns**
  - **Total XP** – Sortable by overall XP or by a chosen skill (filter dropdown). Shows rank, character name, and value (with +gain when in a time-filtered mode). Small line chart above for aggregate XP over the period.
  - **Boss KC** – Sortable by total boss kills or by a chosen boss. Shows rank, character name, kill count (and +gain when filtered), and grey boss points in parentheses. Line chart for aggregate boss KC.
  - **Loot value** – Sortable by total loot value in the selected period. Table + line chart of cumulative loot value over time.

- **SpoopScore section**
  - **Horizontal bar chart** – All players ranked by SpoopScore (Boss Score + Skill Score from latest snapshot). Bars are proportional to score; player names on the left, bars left-to-right.
  - **Toggles** – **All** (total SpoopScore), **Boss Score** only, **Skill Score** only. Chart and sort update to the selected metric.
  - **Tooltip** – Hover shows Total, Boss, and Skill breakdown. Chart uses the SpoopScore logo and subtle rounded bar ends.

- **Recent activity**  
  Last 30 entries: XP/KC gains (from cron) and loot drops (from webhook). Each row: time ago, username, short description.

- **Cron status orb** (top-left)  
  Green = last snapshot ran within the last 2.5 hours; red = stale or failed. Tooltip shows last run time.

- **Header**
  - **SpoopTool** ASCII art (animated gradient; Chrome fallback to solid colour).
  - Countdown to “next data fetch” (next :00 in configured timezone).
  - **Menu** – Links to Boss Trophy Room, Settings (loot webhook URL), Add character (if enabled).

- **Settings modal**  
  Displays the loot webhook URL (with optional secret) for users to paste into Dink’s Loot notifier.

- **Add character**  
  Modal to add a character by username. Calls Hiscores once to validate and get game mode, then inserts into `characters` and returns the updated list.

### 1.2 Character page (`/character.html?name=...`)

- **Data source**  
  Fetches **latest snapshot** from the DB via `/api/character-snapshot?name=...` (no Hiscores call unless no snapshot exists; then can fall back to `/api/player/[name]`).

- **Header**
  - Character name, **SpoopScore** (large, gradient), “SpoopScore” label.
  - **Four stat boxes:** # of 99’s, # of Boss Kills, **Boss Score**, **Skill Score**. Boss/Skill boxes are clickable and open the scoring modal. Tooltip on Boss Score shows per-boss breakdown (name, count × points, total).

- **Scoring modal** (Scoring button)
  - **Boss Score** – Points per kill per boss (and +10 first kill per boss). List of boss → points.
  - **Skill Score** – 15/level, +100@70, +200@80, +500@93, +2500@99, +0.5 per 10k XP (no cap). At **99** an extra **difficulty bonus**: hardest skill +1000, easiest +300, linear scale in between (see `docs/SKILL_DIFFICULTY_RANKING.md`). Example for 99 Runecraft vs 99 Fletching.

- **Skills table**  
  All skills (including Overall): Skill, Level, Last 24 Hr, This Month, XP, XP to next, **Skill Score**, Rank. Skill Score includes level, XP component, and 99 difficulty bonus. Chart icon opens a modal with XP history for that skill (from snapshots).

- **Luck meter**  
  Single value per character (-100 to +100). Unlucky ↔ Normal ↔ Spooned. Updated when loot drops are ingested (boss drops that match `luck_baseline` affect the meter).

- **Boss kills table**  
  Boss name, Kill count, Boss Score, Last 24 Hr, Rank. Hover on Boss Score cell shows per-boss points breakdown. Chart icon for boss KC history.

- **Loot section**  
  Tabs: Last 24 hours, Last 7 days. Filter by source (e.g. boss name). Total drops, total value, small chart, and “Top 20 most valuable” table with Name, From, Amount, Value, Luck (delta from that drop). Data from `loot_drops` only (Dink webhook).

### 1.3 Boss Trophy Room (`/boss-trophy-room.html`)

- **Boss-focused view**  
  All characters’ kill counts per boss (or selected boss). Sort by total KC, 24h gain, etc. Uses snapshot + deltas from API.

### 1.4 Other pages

- **Where is the bull** – `/whereisthebull` – Simple page with centred “where is the bull?” and ASCII bull (easter egg).

---

## 2. How we get the data

### 2.1 OSRS Hiscores (primary source for skills and bosses)

- **Library:** `osrs-json-hiscores` (`getStats(username)`).
- **Used in:**
  - **Cron snapshot** – Fetches every tracked character and writes `character_snapshots` (see below).
  - **Add character** – One-off fetch to validate username and get game mode before inserting into `characters`.
  - **Live player** – `GET /api/player/[name]` returns current Hiscores (skills, bosses, etc.) when you need real-time data (e.g. character page fallback if no snapshot).

- **Rate limiting**  
  Snapshot cron processes characters in small batches with a delay between batches to avoid Hiscores rate limits.

### 2.2 Cron job (snapshots and maintenance)

- **Endpoint:** `GET` or `POST` `/api/cron/snapshot`.
- **Auth:** `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
- **What it does:**
  1. Reads all (or paginated) characters from `characters`.
  2. For each character, calls `getStats(username)`, builds a snapshot payload (skills: rank/level/xp; bosses: rank/count).
  3. **Inserts** one row into `character_snapshots` per character with `data` JSONB.
  4. **Activity log:** Compares latest two snapshots per character; if overall XP or any boss KC increased, appends an `xp_kc` entry to `activity_log` (then prunes to last 30).
  5. **Luck baseline (optional):** If `?set_luck_baseline=1`, writes current boss KC per (character, boss) into `luck_baseline` (used later by loot to compute “effective” KC for luck).
  6. **Cron heartbeat:** Upserts `cron_heartbeat` with `job_name = 'snapshot'` and `last_run_at = NOW()` so the homepage orb can show green/red.
  7. **Retention:** Deletes snapshots older than 30 days except one per character per calendar month (latest in that month).
  8. **Leaderboard notification:** Computes current boss-kill leader(s); if different from `leaderboard_state.boss_kill_leader`, POSTs to Discord (if `DISCORD_LEADERBOARD_WEBHOOK_URL` is set) and updates `leaderboard_state`.

- **Scheduling**  
  Typically via external cron (e.g. cron-job.org) every 30–60 minutes; Vercel Cron can run it once per day on Hobby.

### 2.3 Loot (Dink webhook)

- **Endpoint:** `POST /api/loot` (and `GET /api/loot?webhook=1` to obtain the URL).
- **Auth:** `LOOT_WEBHOOK_SECRET` in query or `Authorization` header.
- **Payload:** Dink sends `multipart/form-data` with a part `payload_json` containing JSON (type LOOT: `playerName`, `extra.items[]`, `extra.source`, `extra.killCount`, rarity, etc.).
- **What the API does:**
  1. Parses `payload_json`, resolves username to `character_id` (if not in DB, still stores with `username`; `character_id` may be null).
  2. For each item: computes `total_value_gp` (quantity × price), normalizes source/kill count/rarity.
  3. **Inserts** one or more rows into `loot_drops` (per item or aggregated, depending on implementation). May store `item_id` for sprites, `luck_delta` if luck is applied.
  4. **Luck:** If the drop’s source matches a boss in `luck_baseline` for that character, computes a luck delta from drop rarity vs expected rate; updates `characters.luck_score` (clamped -100..100) and can store `luck_delta` on the drop row.
  5. **Activity log:** Inserts a `loot` entry into `activity_log` (then prunes to 30).
  6. **Discord:** If `DISCORD_LOOT_WEBHOOK_URL` is set and total value of the event ≥ threshold (e.g. 300k gp), sends an embed to Discord.

- **No cron for loot** – Loot is written only when Dink (or another client) POSTs to `/api/loot`.

### 2.4 Aggregate and delta APIs (read-only from DB)

- **`GET /api/characters-with-snapshots`**  
  Returns character list plus each character’s **latest** snapshot (skills + bosses) and last 30 **activity_log** entries. Homepage uses this so it doesn’t call Hiscores.

- **`GET /api/aggregate-history?hours=24|...&today=1|&week=1|&month=1`**  
  Returns time-series of **combined** total XP and total boss KC across all characters (from `character_snapshots`), bucketed (e.g. 15 min). Also returns **lootHistory** (cumulative loot value over time from `loot_drops`) and **cronHealth** (from `cron_heartbeat`). Used for homepage charts.

- **`GET /api/characters-deltas?hours=24|...&today=1|&week=1|&month=1`**  
  Returns per-character XP and boss KC deltas (earliest vs latest snapshot in the period), plus per-skill and per-boss deltas. Homepage uses this for “Last 24” / “Today” / “This week” / “This month” values.

- **`GET /api/player-deltas?name=...&hours=24|&month=1`**  
  Per-character deltas for one character (for character page “Last 24 Hr” and “This Month” columns).

- **`GET /api/player-history?name=...&hours=6&skill=...|&boss=...`**  
  Snapshot history for one character (for skill or boss chart in the modal).

- **`GET /api/character-snapshot?name=...`**  
  Latest snapshot from DB for one character (+ luck_score). Character page uses this as the main data source.

- **`GET /api/loot?player=...&hours=24|168&leaderboard=1|...`**  
  Loot drops for a player or loot leaderboard; filters by period and optional source. Used by character page and homepage loot column.

---

## 3. How data is saved in the database

**Database:** Neon (Postgres). Connection via `DATABASE_URL` (pooled recommended for serverless).

### 3.1 Tables (in order of creation)

**`characters`** (`sql/schema.sql`)

- `id` (SERIAL PRIMARY KEY)
- `username` (VARCHAR(12) UNIQUE NOT NULL)
- `game_mode` (VARCHAR(20) DEFAULT 'main')
- `added_at` (TIMESTAMPTZ DEFAULT NOW())
- `luck_score` (INT, default 0, check -100..100) – added in `migration_luck_score.sql`

**`character_snapshots`** (`migration_character_snapshots.sql`)

- `id` (BIGSERIAL PRIMARY KEY)
- `character_id` (INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE)
- `at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `data` (JSONB NOT NULL) – structure: `{ skills: { overall: { rank, level, xp }, attack: {...}, ... }, bosses: { vorkath: { rank, count }, ... } }`

Indexes on `(character_id, at DESC)` and `(at DESC)`. Retention is applied by the cron (keep last 30 days full; older than 30 days keep one per character per month).

**`loot_drops`** (`migration_loot_drops.sql`, `migration_loot_drops_item_id.sql`)

- `id` (BIGSERIAL PRIMARY KEY)
- `character_id` (INT REFERENCES characters(id) ON DELETE SET NULL), nullable
- `username` (VARCHAR(12) NOT NULL)
- `item_id` (INT NULL) – OSRS item id for sprites
- `item_name` (VARCHAR(255) NOT NULL)
- `quantity` (INT NOT NULL DEFAULT 1)
- `total_value_gp` (BIGINT NOT NULL)
- `source` (VARCHAR(128)), `kill_count` (INT), `rarity_text` (VARCHAR(64))
- `at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- Optional: `luck_delta` (if added by a migration) – stored when a drop affects the luck meter

Indexes on `(username, at DESC)`, `(character_id, at DESC)`, `(at DESC)`.

**`activity_log`** (`migration_activity_log.sql`)

- `id` (SERIAL PRIMARY KEY)
- `at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `username` (VARCHAR(12) NOT NULL)
- `type` (VARCHAR(20) NOT NULL CHECK (type IN ('xp_kc', 'loot')))
- `description` (TEXT NOT NULL)

Pruned to last 30 rows after each insert (in API code using `lib/activity-log.js`).

**`cron_heartbeat`** (`migration_cron_heartbeat.sql`)

- `job_name` (VARCHAR(64) PRIMARY KEY)
- `last_run_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

Updated by `/api/cron/snapshot` on success (`job_name = 'snapshot'`).

**`leaderboard_state`** (`migration_leaderboard_state.sql`)

- `key` (VARCHAR(64) PRIMARY KEY)
- `value` (TEXT)
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

Used for `boss_kill_leader` (comma-separated usernames) to detect leader changes and send Discord notification.

**`luck_baseline`** (`migration_luck_baseline.sql`)

- `character_id` (INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE)
- `boss_key` (VARCHAR(128) NOT NULL)
- `kill_count` (INT NOT NULL DEFAULT 0)
- `snapshot_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- PRIMARY KEY (character_id, boss_key)

Filled when cron is called with `?set_luck_baseline=1`; used by loot ingestion to compute effective KC (drop’s kill_count − baseline) for luck delta.

### 3.2 Who writes what

| Data              | Written by                    | Table(s)                |
|-------------------|-------------------------------|-------------------------|
| Character list    | POST /api/characters          | characters              |
| Snapshots         | GET/POST /api/cron/snapshot   | character_snapshots     |
| Activity (XP/KC) | Cron after snapshot           | activity_log            |
| Activity (loot)   | POST /api/loot                | activity_log            |
| Loot drops        | POST /api/loot                | loot_drops              |
| Luck score        | POST /api/loot                | characters.luck_score  |
| Cron health       | Cron on success               | cron_heartbeat          |
| Boss leader state | Cron after snapshot           | leaderboard_state       |
| Luck baseline     | Cron with ?set_luck_baseline=1| luck_baseline           |

All other endpoints are read-only (SELECT) from these tables (and optionally one-off Hiscores in `GET /api/player/[name]`).

---

## 4. Scoring formulas (reference)

- **Boss Score:** Sum over bosses of `(kill_count × points_per_boss)` plus **+10 per boss for first kill** (once per boss). Boss point values are defined in the front end (e.g. Wintertodt 1, …, Fortis/Zuk 25).
- **Skill Score (per skill):** `level × 15` + 100 at 70 + 200 at 80 + 500 at 93 + 2500 at 99 + `floor(xp / 10_000) × 0.5` (no cap). **At 99 only:** difficulty bonus from **1000** (hardest, e.g. Runecraft) down to **300** (easiest, e.g. Fletching), linear by rank (see `docs/SKILL_DIFFICULTY_RANKING.md`).
- **SpoopScore:** Boss Score + Skill Score (sum over all non-overall skills), from latest snapshot. Used for the homepage bar chart and character page header.

---

## 5. Environment variables

- **`DATABASE_URL`** – Neon Postgres connection string (required for all DB use).
- **`CRON_SECRET`** – Secret for `/api/cron/snapshot` (Bearer or query).
- **`LOOT_WEBHOOK_SECRET`** – Optional secret for POST /api/loot and for building the webhook URL in Settings.
- **`DISCORD_LOOT_WEBHOOK_URL`** – Optional; big drops (e.g. ≥300k gp) are posted here.
- **`DISCORD_LEADERBOARD_WEBHOOK_URL`** – Optional; notification when boss-kill leader changes.
- **`NODE_OPTIONS`** – Optional; e.g. `--no-deprecation` to hide deprecation warnings in Vercel logs.

---

## 6. Related docs

- **Setup (Neon + Vercel, cron, loot, Discord):** `README.md`
- **Loot integration (Dink):** `docs/LOOT_INTEGRATION.md`
- **Skill XP points (0.5 per 10k):** `docs/SKILL_XP_POINTS_PLAN.md`
- **Skill difficulty ranking (99 bonus):** `docs/SKILL_DIFFICULTY_RANKING.md`
- **Boss drops reference:** `docs/BOSS_DROPS_REFERENCE.md`
- **Luck meter:** `docs/LUCK_METER_PLAN.md`

This document reflects the tool’s current state: features, data sources, and how and where data is stored.
