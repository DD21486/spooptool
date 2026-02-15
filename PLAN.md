# SpoopTool – Project Plan

**SpoopTool** is an all-encompassing Old School RuneScape (OSRS) tool for you and your friends. Uses OSRS/Jagex data to show character info and build useful tools, starting with a guild-style homepage and detailed character pages.

**Scope:** Private use only — you and players you know (e.g. clanmates). Single test character to start: **SpoopSpooply**.

**Project root:** `web-dev-project/OSRS_Tool`  
**Repository:** [https://github.com/DD21486/spooptool](https://github.com/DD21486/spooptool)  
**Hosting:** Vercel (front + serverless API). **Database:** Neon (Postgres).

**Cost:** You can run SpoopTool on **free/hobby plans** for both. No credit card required.
- **Vercel Hobby** (free): 1M serverless invocations/month, 100 GB bandwidth, 100 deployments/day. More than enough for a small private tool. [Vercel Hobby](https://vercel.com/docs/plans/hobby) is for non-commercial/personal use.
- **Neon Free**: 0.5 GB storage, 100 compute-hours/month, multiple projects. Guild list + optional hourly snapshots use very little. [Neon free tier](https://neon.tech) does not require a card and allows commercial use.
If you outgrow limits (e.g. many users or long history), you can move to paid tiers later.

**Setup:** No Neon or Vercel project yet. You’ll create the Vercel project after code is in GitHub. We’ll include setup steps in the README (create Neon project → get `DATABASE_URL` → create Vercel project → add env). Account email: Daleyvisuals@gmail.com (for reference).

---

## 1. API Research Summary

### 1.1 What the official data gives you

**Jagex OSRS Hiscores** (the source of truth) exposes:

| Data | Available | Notes |
|------|-----------|--------|
| **Skills** | ✅ | All 24 (including Overall). Each: `rank`, `level`, `experience` (total XP). |
| **Boss kills** | ✅ | Per-boss `rank` and `count` (kill count). Many bosses; e.g. Vorkath, Zulrah, CoX, ToB, etc. |
| **Activities** | ✅ | Clue scrolls (all tiers), LMS, Bounty Hunter, Soul Wars, Rifts, Colosseum, League points, etc. |
| **Collection log (unique drops)** | ❌ | Not in Hiscores. Only kill *counts* are on Hiscores. |
| **Collection log (completion %)** | ⚠️ 3rd party | Temple OSRS and similar services offer collection-log-style data via their own APIs; not from Jagex. |

So we **can** do:

- Total XP, level, rank per skill and overall.
- **XP to next level** — computed from current XP using the standard OSRS formula:  
  `XP_for_level(L) = floor(L + 300 × 2^(L/7)) / 4` (same for all skills).
- Boss kill counts (and rank) for all Hiscores bosses.
- Clue scrolls, minigames, and other activities as exposed.

We **cannot** get from Jagex:

- Which specific unique drops a player has (full collection log). That would require a third-party (e.g. Temple OSRS) or manual tracking later if you want it.

### 1.2 CORS and where the API runs

- **Jagex does not send CORS headers.** You cannot call the Hiscores from the browser.
- **Approach:** Use a **small backend** (Node/Express or similar) that:
  - Calls Jagex (or a wrapper like `osrs-json-hiscores` / `runescape-api`) server-side.
  - Exposes your own endpoints (e.g. `GET /api/player/:name`, `GET /api/guild`).
  - Optionally caches responses to reduce calls and improve refresh behavior (see below).

### 1.3 Refresh / rate limits

- Jagex does **not** publish strict Hiscores rate limits. Community practice is to avoid hammering (e.g. no hundreds of requests per minute).
- Hiscores data is updated by Jagex on their schedule (often within minutes of in-game changes, but not real-time).
- **How often we *can* update:** Technically we can request as often as we want; the constraint is being polite and not hammering. For a small private tool, a request every 1–2 minutes per viewed character is conservative and acceptable. There is no "max refreshes per day" from Jagex — the limit is self-imposed for good citizenship.

(Detailed update behavior — manual vs optional "Watch XP" — is in **Section 2. User stats update strategy**.)
 “Refresh” button (or “Add character” which does a fresh fetch). No hard delay between *user* actions.
  - **Optional caching:** Cache each player’s response for 1–5 minutes (configurable) so that multiple clicks or page loads don’t re-hit Jagex every time. This keeps the tool feeling responsive while staying polite.
  - **Background refresh:** Later, optional: periodic re-fetch (e.g. every 5–15 minutes) for “guild” list only, with cache; avoid per-player polling on a timer.

So we can support **short refresh windows** (e.g. 1–5 min cache) and still feel snappy, unlike tools that only refresh every 30+ minutes.

---

## 2. User stats update strategy

We support two modes so users get full control and optional "live" updates when they care.

### 2.1 Default: manual update only

- **No automatic refresh.** Stats are updated only when the user explicitly hits an **"Update"** (or "Refresh") button.
- **Where the button appears:** On the **home page** (refresh all characters in the table) and on each **character detail page** (refresh that character only).
- **Backend behavior:** When the frontend calls the API for an update, the backend should **bypass or ignore cache** so the user gets fresh Hiscores data. (Alternatively: use a very short cache only to dedupe rapid double-clicks, e.g. 10–30 seconds.)
- **Result:** Zero unnecessary API calls. Data never changes unless the user asks.

### 2.2 Optional: frequent refresh ("Watch XP" mode)

- **When a user is actively watching** (e.g. grinding and wants to see XP move), we offer an opt-in **"Live" or "Watch XP"** toggle (e.g. on the character detail page).
- **When ON:**
  - Poll the backend for that character at a **fixed, conservative interval** (e.g. **every 2 minutes**). This is polite to Jagex and still useful — Hiscores often update within a few minutes of in-game gains.
  - **Only poll while the tab is visible.** Use the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API): when the user switches to another tab or minimizes the window, pause the timer; resume when they come back. No point hitting the API when nobody is looking.
  - **Only poll for the character currently on screen.** If they navigate to another character or back to home, stop the timer. No background polling for multiple characters.
- **When OFF (default):** Same as 2.1 — no requests until the user hits "Update".
- **Backend:** For these polling requests, the backend may use a **short cache** (e.g. 1–2 minutes) so that if the frontend polls every 2 minutes, we don’t necessarily hit Jagex twice in a row with no time for their data to change. Optional; can also always fetch fresh when in "watch" mode so the user sees updates as soon as Jagex has them.

### 2.3 Smart behavior summary

| Scenario | Behavior |
|----------|----------|
| Page load (home or character) | Fetch once (or from cache). No repeat until user acts. |
| User clicks "Update" / "Refresh" | Always fetch fresh from Hiscores (bypass cache). |
| "Watch XP" OFF (default) | No further requests. |
| "Watch XP" ON, tab visible | Poll every 2 min (or chosen interval) for *this* character only. |
| "Watch XP" ON, tab hidden | Pause polling; resume when tab visible again. |
| User leaves character page or goes home | Stop polling. |

### 2.4 Implementation notes

- **Persist the preference:** Store "Watch XP" on/off in `localStorage` (or session) so it can default to OFF on next visit but remember if they turned it on.
- **Minimum interval:** Cap the polling interval at something sane (e.g. no more than once per 60–90 seconds) even if we later add a "faster" option. Keeps us well within polite usage.
- **Cache TTL:** With manual-only default, backend cache is less critical. Use cache mainly to avoid double-fetch on rapid "Update" clicks, or to serve polling when "Watch XP" is on (e.g. 1–2 min TTL so we don’t hit Jagex every 2 min if we have recent data).

This gives you **never update unless the user asks** by default, and **optional, bounded, visible-tab-only** refreshing when they want to watch XP.

### 2.5 XP/hr tracking and session charts (when Watch XP is on)

When Watch XP is enabled, we already poll at a fixed interval (e.g. every 2 minutes). Each poll gives us a fresh snapshot of all skill XP. We can use that to:

- **Estimate XP/hr per skill:** On each poll, compare current XP to the previous snapshot for that skill. `XP/hr ≈ (XP_now - XP_prev) / (hours between polls)`. Example: if Attack went from 1,000,000 to 1,050,000 in 2 minutes, that’s 50k XP in 1/30 hour → **~1.5M XP/hr** for that window. Show this on each skill row (e.g. “~1.2M XP/hr”) so the user can see which skills are gaining and how fast. Only show the rate when we have **at least two samples** (first poll = baseline, second poll = first rate).
- **Smoothing (optional):** To avoid a single noisy 2‑min window, we can average the last 2–3 rate samples per skill so XP/hr doesn’t jump wildly. Still simple and session-only.
- **Session-only history:** Keep a short history in the **frontend only** (no backend persistence). For each skill, store the last N samples (e.g. 10–15), i.e. `{ skillId: [ { timestamp, xp }, ... ] }`. At 2 min per poll, that’s ~20–30 minutes of data. When the user leaves the page or turns Watch XP off, we can clear or keep in memory until page refresh — no need to persist across sessions.
- **Thin line chart per skill row:** Use the same history to draw a **small sparkline / line chart** next to (or under) the XP/hr text for that skill. Options:
  - **Rate over time:** Each point = computed XP/hr for that interval. The line goes up/down as their rate improves or drops — “is my XP/hr going up or down?”
  - **XP gained per interval:** Each point = (XP_now - XP_prev) for that poll. Simpler, but less intuitive than “XP/hr” on the Y-axis.
  - Recommend **rate over time** so the chart directly illustrates “XP/hr dropping or going up.” Keep it thin (e.g. 60–120px wide, subtle line) so the skills table doesn’t get noisy.
- **When to show:** Only show the XP/hr value and the chart when **Watch XP is ON** and we have **≥2 samples** for that skill. Skills with no gain (or not trained this session) can show “—” or “0 XP/hr” and a flat line.
- **Implementation:** Pure frontend. No API changes. After each Watch XP poll, diff new snapshot vs previous, append to per-skill history (cap at N points), compute rate, update the row’s XP/hr label and redraw the tiny chart (e.g. canvas or SVG; or a minimal chart lib if we want axes/tooltips later).

This makes the character detail page not only “live” but **informative** while grinding: per-skill XP/hr and a quick visual trend without any extra backend or storage.

---

| Layer | Choice | Role |
|-------|--------|------|
| **Backend** | Node (Express or similar) | Proxy to Jagex, optional cache, serve JSON. |
| **Jagex access** | `osrs-json-hiscores` or `runescape-api` (npm) | Parse Hiscores CSV/JSON into skills + bosses + activities. |
| **Game modes** | Same libs | **All modes treated equally** (main, ironman, hardcore, ultimate). Auto-detect when fetching so each character's stats come from the correct Hiscores mode. |

No API key required for Hiscores. If you later add Temple OSRS (e.g. collection log), that may require an API key (check their docs).

---

## 3. Feature Scope (Phased)

### Phase 1 – MVP (this plan)

1. **Home page**
   - Table of “guild” characters:
     - Columns: Rank (by total XP), Character name, Total XP, optional game mode.
     - Sorted by total XP (highest first).
   - **Quick links:** Each name links to that character’s detail page.
   - **Update button:** Refresh all characters in the table (manual only; no auto-refresh by default). See Section 2.
   - **Add character:** Control in top-right: input username → backend fetches from Hiscores → add to list and persist in Neon. New character appears in table and in links.
   - Initial data: **SpoopSpooply** as the single seed character.

2. **Character list storage**
   - Simple persistence for “which characters are in my guild” (e.g. `characters.json` or a small DB). No auth for now; list is editable via “Add character” and optionally “Remove” later.

3. **Character detail page**
   - One page per character (e.g. `/character/SpoopSpooply` or `?name=SpoopSpooply`).
   - **Update button:** Refresh this character's stats only (manual; no auto-refresh by default). See Section 2.
   - **Watch XP (optional):** Toggle to turn on periodic refresh (e.g. every 2 min) while viewing this page and tab is visible; off by default, preference in localStorage. See Section 2.
   - **Skills:** All skills with:
     - Level, current XP, rank.
     - **XP to next level** (computed from XP table).
     - **XP/hr (when Watch XP is on):** Per-skill estimated XP/hr from the last 1–3 poll deltas; only shown when Watch XP is enabled and we have ≥2 samples. See Section 2.5.
     - **Thin line chart (when Watch XP is on):** Small sparkline per skill row showing XP/hr over the current session (rate going up or down). Session-only history in frontend; no backend. See Section 2.5.
   - **Overall** total XP and rank prominently.
   - Optional: small “Last updated” if you add caching.

4. **Boss kills (Phase 1 optional)**
   - If the chosen lib returns boss data (it does in the docs), add a “Boss kills” section on the character page: name → kill count (and rank if useful). No collection log items, just counts.

### Phase 2 – Later

- **Collection log:** If you want it, integrate a third-party (e.g. Temple OSRS) and add a section or separate view; document API key if needed.
- **Refresh UX:** Already in Phase 1 (Update button + optional Watch XP). Phase 2 could add configurable Watch XP interval (e.g. 1 / 2 / 5 min) or configurable cache TTL in backend. Former text was: “Refresh all” on homepage; configurable cache TTL in backend.
- **Remove character** from guild list.
- **Extra tools:** E.g. XP goals, comparisons, or DPS-style helpers — all driven by the same character data.
- **Historical logging and insights:** See Section 10. Periodically store character snapshots in our own DB to unlock progress-over-time and group insights.

---

## 4. Tech Stack

| Part | Choice | Rationale |
|------|--------|------------|
| **Frontend** | HTML/CSS/JS + **Tailwind CSS** (or React + Tailwind) | Crisp, clean UI; **dark mode** by default. Tailwind for layout and components; optional component library (e.g. shadcn/ui) if we use React. |
| **Backend** | Node + Express (Vercel serverless) | Hiscores proxy + cache; Vercel serverless API routes. |
| **Hiscores** | `osrs-json-hiscores` or `runescape-api` | Parsed skills + bosses + activities; TypeScript types available. |
| **Database** | **Neon** (Postgres) | Guild character list + optional historical snapshots (Section 10). You've used it on other projects. |
| **Hosting** | **Vercel** | Front + serverless API; connect to Neon via env (e.g. `DATABASE_URL`). |

---

## 5. Suggested Project Layout

```
OSRS_Tool/
├── PLAN.md                    # This document
├── README.md                  # How to run / env (Vercel + Neon)
├── package.json
├── .env.example               # DATABASE_URL (Neon), etc.
│
├── api/                       # Vercel serverless (or server/)
│   ├── characters.js          # GET/POST guild list (Neon)
│   ├── player/[name].js       # GET full player (Hiscores proxy)
│   ├── hiscores.js            # Call osrs-json-hiscores or runescape-api
│   └── cache.js               # Optional in-memory or edge cache
│
├── public/                    # Static frontend (Tailwind, dark mode)
│   ├── index.html             # Home: filters + two tables + add character
│   ├── character.html         # Detail page (or SPA route)
│   ├── css/
│   └── js/
│       ├── app.js             # Home: filters, load table, add character
│       └── character.js       # Detail: load skills, XP to next, bosses
│
└── lib/                       # Optional shared (e.g. XP table)
    └── xpTable.js             # Level → required XP; XP to next
```

Neon holds the guild list (and, when we add it, historical snapshots). Vercel hosts the site and serverless API; connect to Neon via `DATABASE_URL`. You can swap `public/` for a React/Vue app later; the API contract stays the same.

---

## 6. API Contract (Backend → Frontend)

Suggested endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/characters` | List of guild character names (from Neon). |
| POST | `/api/characters` | Body: `{ "username": "SpoopSpooply" }`. Fetch from Hiscores; if valid, add to Neon and return updated list (and optionally full player object). |
| GET | `/api/player/:name` | Full player object (skills, bosses, activities). Backend hits Hiscores (or cache). 404 if not on Hiscores. |
| GET | `/api/player/:name/summary` | Lightweight: total XP, rank, name (for table rows). Optional, or derive from full player. |

Frontend uses these to:

- Load table on home (list characters → fetch summary or full for each, or backend can return summaries).
- “Add character” → POST then refresh table.
- Character detail page → GET full player and render skills (with XP to next) and bosses.

---

## 7. XP to Next Level

- **Stored:** Static table or formula: for each level `L`, total XP required = `floor((L + 300 * 2^(L/7)) / 4)` (same for all skills).
- **Logic:** Given current `level` and `experience`, “XP to next” = `xpForLevel(level + 1) - experience` (capped at 0 for level 99).
- Can live in backend or frontend; backend is a single source of truth if you ever add more tools.

---

## 8. Open Decisions (for when you implement)

1. **Game mode:** Support all (main, ironman, hardcore, ultimate); auto-detect when fetching so each character's stats are correct. Treat all the same in the app.
2. **Character list:** Start with only **SpoopSpooply** in Neon; “Add character” appends. Remove button in Phase 2.
3. **Cache TTL:** e.g. 2–5 minutes for `/api/player/:name` so repeated visits don’t hit Jagex every time.
4. **Styling:** Tailwind CSS, dark mode default, crisp and clean.

---

## 9. Summary

- **APIs:** Hiscores give skills (level, XP, rank), boss kill counts, and activities. XP-to-next is computed. Collection log uniques are not from Jagex; possible later via third-party.
- **Refresh:** Default = never auto-update; only when user hits "Update". Optional "Watch XP" mode = poll every 2 min for current character only, only when tab visible. See Section 2.
- **Scope:** **SpoopTool** — Home page (two side-by-side tables: Total XP with filters [Overall / every skill / every boss] + Total boss kills; add character + links), Tailwind + dark mode, character detail (skills + XP to next + boss kills), Vercel + Neon, all game modes supported. Node backend to proxy and optionally cache.
- **Later (value-add):** Hourly logging of character snapshots to our own DB unlocks progress-over-time charts, group insights ("who gained the most this week?"), milestones, and time-to-level estimates. See Section 10.
- **First step:** Backend with one route that fetches **SpoopSpooply** and returns JSON; then add character list and frontend.

When you’re ready to develop, we can start with the backend and the homepage table, then add the character detail page and boss section.

---

## 10. Historical logging and insights (value-add)

**Why log at all?** The whole point of the tool is for you and your friends to track progress. Right now we only show *current* state (plus a short session trend when Watch XP is on). If we **store snapshots of character data in our own database** on a schedule (e.g. every hour), we can answer: "How much did we gain this week?" "Who's been climbing the ranks?" "When did I hit 90 Attack?" That turns the tool from a live hiscores viewer into a **progress diary and group dashboard** with real insight.

**How it fits the rest of the plan:** This is **background logging only**. It does *not* change the user-facing rule "no auto-refresh unless the user hits Update or turns on Watch XP." A scheduled job (cron or serverless timer) runs every N hours, fetches each character in the guild list from Hiscores, and writes a snapshot to our DB. Users still get fresh data only when they ask (or when Watch XP is on). The logged history is used only for **insights and charts** we build on top.

### 10.1 What to store and how often

- **Frequency:** Every **1 hour** (or configurable: 30 min / 2 hr). Hourly is a good balance: enough points for "XP today" and "this week" trends without hammering Jagex or growing the DB too fast.
- **Scope:** Every character in the guild list. One fetch per character per run; if the list has 10 people, that's 10 Hiscores calls per hour — well within polite usage.
- **Per snapshot, store:**
  - **Timestamp** (when we took the snapshot).
  - **Character identifier** (name + optional game mode, or internal ID).
  - **Skills:** For each skill: rank, level, experience (total XP). Enough to compute "XP gained since last snapshot" and "total XP over time."
  - **Bosses (optional but recommended):** Per-boss kill count (and rank if we want). Enables "Vorkath KC this week" and similar.
  - **Activities (optional):** Clue counts, LMS, etc. if we want clues-gained-over-time later.
- **Schema options:**
  - **Normalized:** Tables like `snapshots` (id, character_id, at), `skill_snapshots` (snapshot_id, skill_name, rank, level, xp), `boss_snapshots` (snapshot_id, boss_name, rank, count). Best for querying "total XP over time" or "XP gained in last 7 days."
  - **JSON blob per snapshot:** One row per (character, timestamp) with a JSON column holding the full Hiscores response. Simpler to implement; querying "XP for skill X over time" means parsing JSON or using DB JSON functions. Fine for small scale.
- **Retention:** Keep forever, or cap (e.g. last 90 days) and prune older rows to limit DB size. For a small friend group, "keep forever" is usually fine.

### 10.2 Value-add features we can build

Once we have history, the tool can offer things like:

**Personal progress over time**

- **Total XP over time:** Line chart (or area) of your overall XP vs date. "I went from 50M to 55M this month."
- **Per-skill XP over time:** Same idea per skill — which skills are you actually training?
- **XP gained in a period:** "You gained 2.1M XP in the last 7 days" (delta between oldest and newest snapshot in that window). Show on character detail or a "Progress" tab.
- **Level-up history:** Infer from XP history when you crossed a level threshold (e.g. "90 Attack on 2025-02-10"). Could show a simple "Milestones" list.
- **Time-to-level estimate:** Using recent rate (e.g. last 7 days XP/day), "At this rate you'll hit 99 Slayer in ~12 days." Only show when we have enough history.

**Guild / group insights**

- **Leaderboard over time:** "Who was #1 by total XP last month vs this month?" — compare snapshots at two dates. Fun for bragging and rivalry.
- **Who gained the most this week?** Per-character XP delta in the last 7 days; rank friends by "XP gained" instead of "total XP." Highlights who's been grinding.
- **Group total XP growth:** "Our group gained 50M total XP this month." Sum of all characters' deltas.
- **Simple "Progress" or "Insights" page:** One place for "This week's gains," "Your XP over time," "Boss KC this week," etc.

**Boss and activity history**

- **Boss KC over time:** Line chart of Vorkath (or any boss) kill count vs date. "You did 100 Vorkath this week."
- **Clues over time:** Same idea for clue scroll counts if we store activities.

**Milestones and callouts**

- **First time we see a new level:** When a snapshot shows level 90 Attack and the previous one was 89, we can record "Level 90 Attack on &lt;date&gt;." Surface as a small "Recent milestones" list.
- **Big gain callouts (optional):** "You gained 1M+ XP in a day" — compare snapshots ~24h apart and highlight.

### 10.3 Implementation notes

- **Scheduled job:** Backend cron (e.g. `node scripts/hourly-snapshot.js`) or a serverless scheduled function (e.g. Vercel Cron) that: (1) reads guild character list, (2) for each character calls Hiscores (or our existing hiscores module), (3) writes snapshot(s) to DB. Add a small delay between characters (e.g. 2–5 sec) to be nice to Jagex.
- **DB:** **Neon** (Postgres) — same DB we use for the guild list. Schema (normalized or JSON) lives in Neon; Vercel Cron or a serverless function runs the hourly job and writes snapshots.
- **API:** New endpoints only when we build the insight UIs, e.g. `GET /api/player/:name/history?from=&to=&skill=` or `GET /api/insights/weekly-gains`. No change to existing "current stats" endpoints.
- **Privacy:** Data stays in our DB; only you and your friends (the guild list) are logged. No public access unless you add it later.

This section is the **value-add roadmap** once the MVP (live view + Watch XP + optional XP/hr sparklines) is done: add hourly logging, then layer on progress-over-time and group insight features so the tool becomes the place you and your friends check not just "what are my stats now" but "how are we all doing over time?"
