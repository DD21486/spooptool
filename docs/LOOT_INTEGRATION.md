# Loot drop integration (DINK → SpoopTool)

**Goal:** When DINK sends a loot drop to your Discord channel, we also log it in the app so players can see loot totals (e.g. "This week: 12.5M gp").

**Dink supports custom web servers.** From the [Dink README](https://github.com/pajlads/DinkPlugin): Dink sends notifications to a Discord webhook **or a custom web server**, with **additional metadata** for custom handlers. So you can send loot data directly to your API—no Discord bot required. Use **multiple webhook URLs** (one per line) or the Loot notifier’s **Webhook Overrides** to add `https://yourapp.vercel.app/api/loot` while keeping Discord. The payload is **multipart/form-data** with JSON in the **`payload_json`** field; see [json-examples.md](https://github.com/pajlads/DinkPlugin/blob/master/docs/json-examples.md) for the exact Loot shape (`playerName`, `extra.items[]`, `extra.source`, `extra.killCount`, etc.).

---

## Options

### A – Use the webhook to send data directly to your website ✅ (recommended when possible)

**Idea:** Have DINK (or something that sees the same event) send an HTTP request to your app instead of—or in addition to—Discord.

- **If DINK supports a custom webhook URL:** Point it at your API (e.g. `POST https://yourapp.vercel.app/api/loot`) and optionally keep posting to Discord via a second webhook or a small bot. Your API receives the payload, parses it, and writes to the DB. No Discord parsing needed.
- **If DINK only supports Discord webhooks:** Then the webhook goes only to Discord. To get data into your site you either:
  - Add a **Discord bot** that listens to the loot channel and forwards messages to your API (same as B below), or
  - Use a **Discord outgoing webhook / automation** (e.g. Zapier, n8n, or a small cloud function that subscribes to Discord events) that calls your API when a message is posted.

So “use the webhook” either means “DINK → your API” (best) or “DINK → Discord → bot/automation → your API”.

### B – Export data from the Discord channel

**Idea:** Something reads messages from the loot Discord channel and sends that data to your app.

- A **Discord bot** with read access to the channel can:
  - Listen for new messages (including those from DINK’s webhook).
  - Parse the embed (player, item, quantity, value, source, kill count, rarity).
  - `POST` each drop to your API.
- No change to DINK config; you only add the bot and your API.

**Conclusion:**  
- **Best:** DINK can send to a custom URL → use that URL as your ingest endpoint (A, direct).  
- **Otherwise:** Use a Discord bot that reads the loot channel and POSTs to your API (B); the “webhook” is then “Discord → your backend,” not “DINK → your backend.”

---

## Recommended architecture (either path)

```
[DINK] --> (Discord webhook) --> [Loot channel]
                    |
                    v (optional)
         [Discord bot OR DINK custom URL]
                    |
                    v POST /api/loot
              [Vercel API]
                    |
                    v INSERT
              [Neon: loot_drops]
                    ^
              [GET /api/loot] <-- Character page / Home
```

1. **Ingest:** One of:
   - **Direct:** DINK (if supported) or automation calls `POST /api/loot` with a JSON body.
   - **Via Discord:** Bot in the loot channel parses DINK embeds and calls `POST /api/loot`.
2. **Storage:** Neon table `loot_drops` (see below).
3. **Read:** `GET /api/loot?player=Username&since=week` (or `since=month`) for the app to show “Loot this week” etc.

---

## Data model

Match the DINK embed fields so parsing is straightforward.

**Table: `loot_drops`**

| Column         | Type         | Notes |
|----------------|--------------|--------|
| id             | BIGSERIAL PK | |
| character_id   | INT FK → characters(id) | Optional: link to existing character; can be NULL if player not in list yet. |
| username       | VARCHAR(12)  | Display name from DINK (e.g. "VDBL") – always store for display and matching. |
| item_name      | VARCHAR(255) | e.g. "Dragon plateskirt". |
| quantity       | INT          | e.g. 7. |
| total_value_gp | BIGINT       | e.g. 1128730 (prefer exact value from chat if available). |
| source         | VARCHAR(128) | e.g. "The Whisperer". |
| kill_count     | INT          | Optional; e.g. 230. |
| rarity_text    | VARCHAR(64)  | Optional; e.g. "1 in 100.0 (1%)". |
| at             | TIMESTAMPTZ  | When the drop occurred (server time). |

- **Character link:** If `username` matches a `characters.username`, set `character_id` so you can join for “per character” views. If not in list yet, `character_id` NULL is fine; you can still show loot by `username` and later attach when they’re added.
- **Indexes:** `(username, at DESC)`, `(character_id, at DESC)`, and optionally `(at DESC)` for “recent drops” across everyone.

---

## API design

### Ingest: `POST /api/loot`

- **Auth:** Use a shared secret (query param or header) so only Dink or your bot can call it.
- **Body (from Dink):** **multipart/form-data**. Read the part named **`payload_json`** (string), parse as JSON. If `type === "LOOT"`:
  - `playerName` → username
  - `extra.items[]` → sum `quantity * priceEach` for total_value_gp; use first item (or concatenate) for item_name/quantity
  - `extra.source` → source
  - `extra.killCount` → kill_count
  - `extra.rarestProbability` → optional rarity_text (e.g. "1 in 100")
  - Optional: `extra.category`, `extra.npcId`
- **Logic:** Resolve `username` → `character_id` if in `characters`; INSERT into `loot_drops`; return 201 and id.
- **Libraries:** For Node serverless multipart parsing use e.g. `formidable` or parse the raw body and extract the `payload_json` part manually (see [Dink json-examples](https://github.com/pajlads/DinkPlugin/blob/master/docs/json-examples.md) and the [example Fastify handler](https://git.ivr.fi/Leppunen/runelite-dink-api/src/branch/master/handlers/dinkHandler.js)).

### Read: `GET /api/loot`

- **Query params:**  
  - `player` (optional) – filter by username.  
  - `since` (optional) – e.g. `week`, `month`, or ISO date.  
  - `limit` (optional) – cap number of rows.
- **Response:** List of drops (and optionally aggregates like `totalGpThisWeek`). Same cache headers as other GETs if you want edge caching.

Use this from the character page (“Loot this week”) and/or a small “Recent loot” block on the home page.

---

## Implementation order

1. **DB:** Add migration `sql/migration_loot_drops.sql` with `loot_drops` table and indexes.
2. **API:** Implement `POST /api/loot` (with secret) and `GET /api/loot` (with optional `player` and `since`).
3. **Ingest path (choose one):**
   - **If DINK can hit a URL:** Configure DINK to POST to `https://yourapp.vercel.app/api/loot` (and add a small adapter if its payload format differs from the JSON above). **Or** use a Zapier/n8n “Discord new message” → “HTTP POST” with a body you map from the embed.
   - **If using a Discord bot:** Create a bot that listens to the loot channel, parses DINK embeds (title, fields, description), maps to the JSON above, and POSTs to `POST /api/loot` with the secret. Host the bot somewhere (e.g. a small VPS, Railway, or a long-running worker) and add it to your Discord server with read access to that channel.
4. **UI:** On character page (and optionally home), add a “Loot” section that calls `GET /api/loot?player=...&since=week` and shows total gp and optionally a short list of recent drops.

---

## Discord bot (if you use option B)

- Create an application in the [Discord Developer Portal](https://discord.com/developers/applications), add a bot, invite it to your server with “View Channel” (and “Read Message History” if you want backfill) on the loot channel only.
- On each message in that channel, check that the message has an embed (DINK posts embeds). Parse:
  - **Player:** From embed description or a field (e.g. “VDBL has looted”).
  - **Item / quantity:** From description or fields (e.g. “7 x Dragon plateskirt”).
  - **Total value:** From a field like “Total Value: 1.12M gp” – convert to integer; if the in-game chat has the exact value (e.g. 1,128,730), you can sometimes get that from embed footer or a second field if DINK includes it.
  - **Source, Kill count, Rarity:** From embed fields.
- Build the JSON body and `POST` to `POST /api/loot` with your secret.
- Libraries: Node.js → `discord.js`; Python → `discord.py`. Run the bot on a host that stays up (Railway, Fly.io, or a small VPS).

---

## Summary

| Approach | Pros | Cons |
|----------|------|------|
| **A – Dink custom URL → your API** | Dink supports this; no Discord bot; rich JSON in `payload_json` | API must parse multipart/form-data and `payload_json` |
| **B – Discord bot reads channel → your API** | No DINK config change; works with current Discord setup | You run and maintain a bot; must parse embed format |

Either way, the app side is the same: **`loot_drops` table, `POST /api/loot` (with secret), `GET /api/loot` (with optional player/since), and UI for “Loot this week” (and optionally recent drops).** Next step is to check DINK’s docs or settings for “custom webhook URL” or “additional webhook”; if it’s Discord-only, implement the Discord bot path and the same API.
