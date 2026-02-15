/**
 * Snapshot job: fetch current Hiscores for each character and store in character_snapshots.
 * Call with Authorization: Bearer <CRON_SECRET> (or ?secret=CRON_SECRET).
 * - Vercel Cron (Hobby: once/day): set in vercel.json and add CRON_SECRET in env.
 * - For every 30 min on Hobby: use external cron (e.g. cron-job.org) to POST/GET this URL with the secret.
 */

const { neon } = require('@neondatabase/serverless');
const { getStats } = require('osrs-json-hiscores');

const DELAY_MS_BETWEEN_CHARACTERS = 2500;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const characters = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
  if (characters.length === 0) {
    return res.status(200).json({ ok: true, snapshots: 0, message: 'No characters' });
  }

  let written = 0;
  const errors = [];

  for (const row of characters) {
    try {
      const player = await getStats(row.username);
      const data = buildSnapshotData(player);
      if (data) {
        await sql`INSERT INTO character_snapshots (character_id, at, data) VALUES (${row.id}, NOW(), ${JSON.stringify(data)})`;
        written += 1;
      }
    } catch (e) {
      errors.push({ username: row.username, error: (e.message || String(e)).slice(0, 100) });
    }
    if (characters.indexOf(row) < characters.length - 1) {
      await delay(DELAY_MS_BETWEEN_CHARACTERS);
    }
  }

  return res.status(200).json({
    ok: true,
    snapshots: written,
    characters: characters.length,
    errors: errors.length ? errors : undefined,
  });
};
