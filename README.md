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
