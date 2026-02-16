/**
 * Snapshot job: fetch current Hiscores for each character and store in character_snapshots.
 * Call with Authorization: Bearer <CRON_SECRET> (or ?secret=CRON_SECRET).
 * - Vercel Cron (Hobby: once/day): set in vercel.json and add CRON_SECRET in env.
 * - For every 30 min on Hobby: use external cron (e.g. cron-job.org) to POST/GET this URL with the secret.
 */

const { neon } = require('@neondatabase/serverless');
const { getStats } = require('osrs-json-hiscores');

/** Delay between batches of parallel requests (to avoid Hiscores rate limit). */
const DELAY_MS_BETWEEN_BATCHES = 1500;
/** How many characters to fetch in parallel per batch. */
const BATCH_CONCURRENCY = 2;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Process array in chunks of size n. */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function authorize(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: 'CRON_SECRET not set' };
  const auth = req.headers.authorization;
  const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const q = req.query && req.query.secret;
  if ((bearer && bearer === secret) || (q && q === secret)) return { ok: true };
  return { ok: false, reason: 'Invalid or missing secret' };
}

/** Build snapshot payload: skills (rank, level, xp) and bosses (rank, count) for storage. */
function buildSnapshotData(player) {
  if (!player || !player.main) return null;
  const skills = {};
  for (const [key, data] of Object.entries(player.main.skills || {})) {
    skills[key] = {
      rank: data.rank,
      level: data.level,
      xp: data.xp != null ? data.xp : data.experience,
    };
  }
  const bosses = {};
  for (const [key, b] of Object.entries(player.main.bosses || {})) {
    if (b && typeof b === 'object') {
      const count = b.score != null ? b.score : (b.count != null ? b.count : b.kc);
      bosses[key] = { rank: b.rank, count: typeof count === 'number' && count >= 0 ? count : 0 };
    }
  }
  return { skills, bosses };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorize(req);
  if (!auth.ok) {
    return res.status(401).json({ error: 'Unauthorized', detail: auth.reason });
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  const sql = neon(process.env.DATABASE_URL);
  let characters = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
  if (characters.length === 0) {
    return res.status(200).json({ ok: true, snapshots: 0, message: 'No characters' });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || characters.length, 20);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  characters = characters.slice(offset, offset + limit);

  let written = 0;
  const errors = [];
  const batches = chunk(characters, BATCH_CONCURRENCY);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const results = await Promise.all(
      batch.map(async (row) => {
        try {
          const player = await getStats(row.username);
          const data = buildSnapshotData(player);
          if (data) {
            await sql`INSERT INTO character_snapshots (character_id, at, data) VALUES (${row.id}, NOW(), ${JSON.stringify(data)})`;
            return { ok: true };
          }
          return { ok: false };
        } catch (e) {
          return { ok: false, username: row.username, error: (e.message || String(e)).slice(0, 100) };
        }
      })
    );
    for (const r of results) {
      if (r.ok) written += 1;
      else if (r.username) errors.push({ username: r.username, error: r.error });
    }
    if (i < batches.length - 1) await delay(DELAY_MS_BETWEEN_BATCHES);
  }

  return res.status(200).json({
    ok: true,
    snapshots: written,
    characters: characters.length,
    offset,
    limit,
    errors: errors.length ? errors : undefined,
  });
};
