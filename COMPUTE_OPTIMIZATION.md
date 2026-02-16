# Reducing compute usage (Vercel)

## Implemented

### 1. **Response caching on GET APIs**
All read-only GET endpoints now send:
```http
Cache-Control: public, s-maxage=90, stale-while-revalidate=120
```
- **s-maxage=90**: Vercel edge can serve the response for 90 seconds without running the serverless function.
- **stale-while-revalidate=120**: After 90s, a stale response can still be served for up to 120s while the origin revalidates in the background.

**Effect**: Repeated visits, refreshes, or multiple users hitting the same data within 90s count as cache hits → fewer function invocations. With a 15‑minute data cadence, 90s cache is a reasonable tradeoff.

**APIs cached**: `characters-with-snapshots`, `characters-deltas`, `aggregate-history`, `characters` (GET), `player/[name]`, `player-deltas`, `player-history`, `character-snapshot`.

### 2. **Character page: snapshot instead of live Hiscores** ✅ Implemented
- The character detail page now uses **`/api/character-snapshot?name=...`** (DB only) instead of `/api/player/[name]` (Hiscores).
- Character views no longer call the OSRS Hiscores API and benefit from the same 90s edge cache.
- **Tradeoff**: Data is from the last snapshot (e.g. up to ~30 min old with a 30‑min cron) instead of live.

---

## Other options (if you need to cut more)

### 3. **Cron frequency**
- **Run every 30 min** → 48 invocations/day (recommended).
- Every 15 min = 96/day; every hour = 24/day. Adjust your external cron (e.g. cron-job.org) or Vercel cron.

### 4. **Single "home" endpoint**
- Homepage currently does **3** API calls: `characters-with-snapshots`, `characters-deltas`, `aggregate-history`.
- One combined endpoint (e.g. `GET /api/home`) that returns all three in one DB round-trip would reduce to **1** invocation per homepage load (plus cache benefits above).

### 5. **Increase cache duration**
- If 1–2 minute staleness is acceptable, you can raise `s-maxage` (e.g. to 120 or 180) in the API handlers to get more cache hits and fewer invocations.

### 6. **Vercel plan**
- Pro/Enterprise plans include more compute; if you're on Hobby, upgrading increases the monthly allowance.
