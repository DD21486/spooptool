# SpoopTool

Private Old School RuneScape tool for you and your friends. Uses OSRS Hiscores data to show character stats, rankings (total XP + filters by skill or boss), and detailed character pages.

**Start here:** See [PLAN.md](./PLAN.md) for full scope, API research, and phased implementation.

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
2. **Vercel:** Add env var `CRON_SECRET` (e.g. `openssl rand -hex 32`). Vercel Cron will send this as `Authorization: Bearer <CRON_SECRET>` when it invokes the snapshot job.
3. **Schedule:**
   - **Hobby plan:** Vercel Cron is limited to **once per day**. The app is configured to run the snapshot at 12:00 UTC daily. That gives one snapshot per character per day — good for "yesterday vs today" and weekly trends.
   - **More frequent (e.g. every 30 min) on Hobby:** Use an external cron (e.g. [cron-job.org](https://cron-job.org), free) to call `GET https://your-app.vercel.app/api/cron/snapshot` with header `Authorization: Bearer YOUR_CRON_SECRET` every 30 minutes. Keeps data recent without upgrading Vercel.
   - **10 min:** Same idea with external cron every 10 min; watch Neon storage (0.5 GB on free) and prune old snapshots if needed (e.g. keep last 30 days).

## Loot (Dink webhook)

To log loot drops from the [Dink](https://github.com/pajlads/DinkPlugin) plugin:

1. **Neon:** Run `sql/migration_loot_drops.sql` in the SQL Editor.
2. **Vercel:** Add env var `LOOT_WEBHOOK_SECRET` (e.g. `openssl rand -hex 24`). The Settings cog on the homepage shows the full webhook URL for users to copy.
3. **Dink:** In the Loot notifier, add the webhook URL (from Settings) as a second URL or in Webhook Overrides. Dink will POST loot events to your app; character pages show a Loot section (drop count, total value, last 20 drops).

**Big drops → Discord:** To post only high-value drops to your Discord loot channel, add env var `DISCORD_LOOT_WEBHOOK_URL` with your channel’s [incoming webhook](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) URL. SpoopTool logs every drop it receives; when a single drop event totals **≥ 400k gp**, it also sends that drop to Discord (one embed per event). Use Dink’s 50k threshold so SpoopTool only receives notable loot; Discord then gets only the 400k+ events.

**Boss kill leader change → Discord:** After each snapshot cron run, SpoopTool checks who has the most total boss kills. If that leader changed (someone overtook the previous leader), it can post to Discord. Add env var `DISCORD_LEADERBOARD_WEBHOOK_URL` with an incoming webhook URL for the channel where you want these notifications. Run `sql/migration_leaderboard_state.sql` in Neon so the cron can store the previous leader and detect changes.
