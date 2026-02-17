# Neon network transfer (5GB limit)

Neon’s 5GB hobby limit is **public egress**: data transferred from the database to your app (e.g. Vercel serverless). Every `SELECT` that returns rows counts.

## Why it’s going up quickly

1. **Full `character_snapshots.data` on every read**  
   Each snapshot row stores a large JSONB blob (all skills + all bosses). Every endpoint that reads snapshots was pulling the full blob:
   - **aggregate-history** – All snapshots in the time window (e.g. 24h or “today”). Could be hundreds of rows × 5–20KB each.
   - **characters-deltas** – All snapshots in the window for every character, then first/last computed in JS (many rows × full `data`).
   - **player-history** – All snapshots for one character in range (full `data`).
   - **player-deltas** – First and last snapshot (full `data`).
   - **characters-with-snapshots** – One latest snapshot per character (full `data`).
   - **character-snapshot** – One latest snapshot (full `data`).

2. **Home page load = many DB calls**  
   A single load triggers: `characters-with-snapshots`, `characters-deltas?hours=24`, `characters-deltas?today=1`, `loot?leaderboard=1` (×3), then `aggregate-history?hours=24`. So every visit multiplies egress.

3. **Cron snapshot job**  
   Runs on a schedule (e.g. cron-job.org). Each run: `SELECT` characters, then `INSERT` one big snapshot per character. Inserts count as write traffic; any later `SELECT` that reads those rows counts as egress.

4. **No pruning**  
   `character_snapshots` is append-only. Over time you have more rows, so time-range queries return more data.

## What we changed (code)

- **aggregate-history** – Aggregation is done in SQL. We only read extracted fields (`xp`, `boss_kc`) and return one row per 15‑min bucket. No full `data` returned.
- **characters-deltas** – We only fetch **first and last** snapshot per character in the window (`DISTINCT ON`), not every snapshot. Cuts rows from hundreds to 2× number of characters; we still need full `data` for per-skill/per-boss deltas.
- **player-history** – We `SELECT` only the needed JSON path (e.g. `data->'skills'->'overall'->>'xp'`) instead of full `data`, so each row is a few bytes.

## Further ways to stay under 5GB

1. **Prune old snapshots**  
   Keep only what you need for “last 7 days” or “last 24h” and delete older rows (e.g. nightly job or scheduled Neon SQL). Fewer rows ⇒ less egress on every time-range query.

2. **Increase cache TTL**  
   Responses already use `Cache-Control: public, s-maxage=90, stale-while-revalidate=120`. Consider raising to `s-maxage=300` (5 min) or more for read-heavy endpoints so Vercel serves cached responses more often and Neon is hit less.

3. **Run snapshot cron less often**  
   If it runs every 15–30 minutes, try hourly. Fewer inserts and fewer new rows to read later.

4. **Lazy-load heavy endpoints**  
   e.g. Load `aggregate-history` only when the user switches to a tab that needs it, or after a short delay, so not every home load hits that endpoint.

5. **Pre-aggregate in DB**  
   Optional: a small table that stores pre-bucketed totals (e.g. per hour) updated by the snapshot job or a separate job. Then `aggregate-history` reads from that table instead of scanning all snapshots.

6. **Upgrade**  
   Neon’s paid plans include more included egress (e.g. 100GB) if you outgrow hobby.
