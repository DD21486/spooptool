# SpoopTool

Private Old School RuneScape tool for you and your friends. Uses OSRS Hiscores data to show character stats, rankings (total XP + filters by skill or boss), SpoopScore (Boss + Skill with 99 difficulty bonuses), loot from Dink, and detailed character pages.

- **Full documentation:** [docs/TOOL_DOCUMENTATION.md](./docs/TOOL_DOCUMENTATION.md) – all features, how data is obtained, and how it’s saved in the database.
- **Scope/planning:** [PLAN.md](./PLAN.md) – original scope, API research, and phased implementation.

- **Name:** SpoopTool
- **Repo:** [github.com/DD21486/spooptool](https://github.com/DD21486/spooptool)
- **Hosting:** Vercel. **Database:** Neon (Postgres).
- **Test character:** SpoopSpooply
- **Scope:** Homepage with two side-by-side tables (Total XP + Total boss kills), filters (Overall / every skill / every boss), Tailwind + dark mode, all game modes (main + ironman etc.), character detail pages; add characters via UI; no auth
- **Setup:** Neon and Vercel projects to be created after code is in GitHub (see below).

## Setup (Neon + Vercel)

1. **Neon**
   - Go to [neon.tech](https://neon.tech) and create a project (sign in with GitHub or email).
   - In the Neon dashboard, open the SQL Editor and run the schema: copy contents of `sql/schema.sql` and execute it (creates `characters` table).
   - Copy the **connection string**. In the dashboard use **Connection string** (or **Connect** → **Connection string**). For Vercel serverless, prefer the **pooled** connection string if Neon shows both (pooled works better with serverless). It looks like `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.

2. **Vercel**
   - Push this repo to GitHub, then go to [vercel.com](https://vercel.com) and import the repo (e.g. DD21486/spooptool).
   - In the project → **Settings** → **Environment Variables**, add `DATABASE_URL` with the Neon connection string. **Redeploy** after saving (Deployments → ⋮ on latest → Redeploy).
   - Deploy. The site will serve `index.html` and `character.html`; API routes live under `/api/characters` and `/api/player/[name]`.

3. **Seed a character**
   - After first deploy, open the app and use "Add character" to add **SpoopSpooply** (or run the commented INSERT in `sql/schema.sql` in Neon SQL Editor).

## Historical snapshots (optional)

To store periodic Hiscores snapshots for progress-over-time and insights:

1. **Neon:** Run the migration in the SQL Editor: copy and run `sql/migration_character_snapshots.sql` (creates `character_snapshots` table).
2. **Vercel:** Add env var `CRON_SECRET` (e.g. `openssl rand -hex 32`). The snapshot endpoint checks this when invoked.
3. **Schedule (external cron):**
   - **External cron (recommended):** Use a free service like [cron-job.org](https://cron-job.org) to call `GET https://your-app.vercel.app/api/cron/snapshot` with header `Authorization: Bearer YOUR_CRON_SECRET` every 30-60 minutes. Set the request timeout to at least 60 seconds so the job can finish after a cold start.

**Snapshot retention (automatic):** After each snapshot run, the cron prunes old data to stay under Neon’s 0.5 GB limit. It keeps **all snapshots from the last 30 days**, and for data older than 30 days it keeps **one snapshot per character per calendar month** (the latest in that month) for yearly summaries. So you get full resolution for the last 30 days and ~1 snapshot per user per month for as long as you’ve been running (e.g. ~60 MB total for 8 users).

## Loot (Dink webhook)

To log loot drops from the [Dink](https://github.com/pajlads/DinkPlugin) plugin:

1. **Neon:** Run `sql/migration_loot_drops.sql` in the SQL Editor.
2. **Vercel:** Add env var `LOOT_WEBHOOK_SECRET` (e.g. `openssl rand -hex 24`). The Settings cog on the homepage shows the full webhook URL for users to copy.
3. **Dink:** In the Loot notifier, add the webhook URL (from Settings) as a second URL or in Webhook Overrides. Dink will POST loot events to your app; character pages show a Loot section (drop count, total value, last 20 drops).

**Big drops → Discord:** To post only high-value drops to your Discord loot channel, add env var `DISCORD_LOOT_WEBHOOK_URL` with your channel’s [incoming webhook](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) URL. SpoopTool logs every drop it receives; when a single drop event totals **≥ 400k gp**, it also sends that drop to Discord (one embed per event). Use Dink’s 50k threshold so SpoopTool only receives notable loot; Discord then gets only the 400k+ events.

**Boss kill leader change → Discord:** After each snapshot cron run, SpoopTool checks who has the most total boss kills. If that leader changed (someone overtook the previous leader), it can post to Discord. Add env var `DISCORD_LEADERBOARD_WEBHOOK_URL` with an incoming webhook URL for the channel where you want these notifications. Run `sql/migration_leaderboard_state.sql` in Neon so the cron can store the previous leader and detect changes.

**Deploy results → Discord (for collaborators):** On Vercel Hobby you can’t add team members, but you can still share deploy status. Vercel can send webhooks when a deployment succeeds, fails, or is canceled; SpoopTool can forward those to a Discord channel.

**Quick setup:**

1. **Discord** – In the channel where you want deploy messages: **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**. Copy the webhook URL.
2. **Vercel env** – In your Vercel project: **Settings** → **Environment Variables**. Add **Name** `DISCORD_DEPLOY_WEBHOOK_URL`, **Value** the Discord webhook URL. Save and **redeploy once** so the API route has the variable.
3. **Register the webhook with Vercel (one-time)** – From the project root, run:
   ```bash
   VERCEL_TOKEN=your_token_here APP_URL=https://your-app.vercel.app node scripts/setup-vercel-deploy-webhook.js
   ```
   - **VERCEL_TOKEN:** The token you created at [vercel.com/account/tokens](https://vercel.com/account/tokens). Replace `your_token_here` with it.
   - **APP_URL:** Your live app URL (e.g. `https://spooptool.vercel.app`), no trailing slash.
   If you have multiple Vercel projects, set `VERCEL_PROJECT_ID=prj_xxxx` (find it in **Project** → **Settings** → **General**).
   When the script prints "Webhook created successfully", the next deploy will post to Discord.

## Notes

**`url.parse()` deprecation warning:** You may see `[DEP0169] DeprecationWarning: url.parse()...` in Vercel function logs. This comes from a dependency or the Node runtime, not from SpoopTool’s code. It’s harmless. To hide it in production, add an environment variable in Vercel: **Key** `NODE_OPTIONS`, **Value** `--no-deprecation` (Project → Settings → Environment Variables, then redeploy).
