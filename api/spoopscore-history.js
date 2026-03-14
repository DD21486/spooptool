/**
 * GET /api/spoopscore-history?name=Username
 * Returns SpoopScore over time (6-hour UTC slots) for the character.
 * Uses spoopscore_snapshots when present; backfills from character_snapshots when sparse so the 7-day chart has data.
 */

const { neon } = require('@neondatabase/serverless');
const { computeSpoopScore } = require('../lib/spoopscore');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

const SLOT_MS = 6 * 60 * 60 * 1000;

function slotTs(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const h = Math.floor(d.getUTCHours() / 6) * 6;
  return Date.UTC(y, m, day, h, 0, 0, 0);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const name = (req.query.name || req.query.username || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Name required' });

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  const sql = neon(process.env.DATABASE_URL);
  try {
    const charRows = await sql`SELECT id, username FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${name})) LIMIT 1`;
    if (charRows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const characterId = charRows[0].id;
    const username = charRows[0].username || name;

    const rows = await sql`
      SELECT at_slot, spoop_score, boss_score, skill_score, pet_points
      FROM spoopscore_snapshots
      WHERE character_id = ${characterId}
        AND at_slot >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '8 days'
      ORDER BY at_slot ASC
    `;

    const bySlot = new Map();
    for (const r of rows || []) {
      const at = r.at_slot;
      const ts = slotTs(at);
      if (Number.isFinite(ts)) {
        bySlot.set(ts, {
          at: at instanceof Date ? at.toISOString() : at,
          spoopScore: Number(r.spoop_score) || 0,
          bossScore: Number(r.boss_score) || 0,
          skillScore: Number(r.skill_score) || 0,
          petPoints: Number(r.pet_points) || 0,
        });
      }
    }

    const needBackfill = bySlot.size < 7;
    if (needBackfill) {
      const snapshotRows = await sql`
        SELECT at, data
        FROM character_snapshots
        WHERE character_id = ${characterId}
          AND at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '8 days'
        ORDER BY at ASC
      `;
      const latestInSlot = new Map();
      for (const r of snapshotRows || []) {
        const at = r.at instanceof Date ? r.at : new Date(r.at);
        const ts = slotTs(at);
        if (!Number.isFinite(ts)) continue;
        const existing = latestInSlot.get(ts);
        if (!existing || at.getTime() > (existing.at instanceof Date ? existing.at.getTime() : new Date(existing.at).getTime())) {
          latestInSlot.set(ts, { at, data: r.data || {} });
        }
      }
      for (const [ts, { data }] of latestInSlot) {
        if (bySlot.has(ts)) continue;
        const skills = data.skills || {};
        const bosses = data.bosses || {};
        const { spoopScore, bossScore, skillScore, petPoints } = computeSpoopScore(skills, bosses, username);
        bySlot.set(ts, {
          at: new Date(ts).toISOString(),
          spoopScore,
          bossScore,
          skillScore,
          petPoints,
        });
      }
    }

    const history = Array.from(bySlot.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ history });
  } catch (err) {
    console.error('GET /api/spoopscore-history', err);
    return res.status(500).json({ error: 'Failed to load SpoopScore history' });
  }
};
