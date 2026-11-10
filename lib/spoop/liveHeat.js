const { neon } = require('@neondatabase/serverless');

const NONE = { xp: false, boss: false, loot: false };

function bossKc(data) {
  if (!data || !data.bosses) return 0;
  let sum = 0;
  for (const b of Object.values(data.bosses)) {
    if (b && typeof b.count === 'number') sum += b.count;
  }
  return sum;
}

function overallXp(data) {
  const xp = data && data.skills && data.skills.overall && data.skills.overall.xp;
  return xp != null ? Number(xp) : 0;
}

/** Today's real-account lean for SpoopSpooply. Zeros when the database isn't available. */
async function liveHeatFor(username) {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) return NONE;
  try {
    const sql = neon(process.env.DATABASE_URL);
    const chars = await sql`SELECT id FROM characters WHERE lower(username) = lower(${username}) LIMIT 1`;
    if (!chars.length) return NONE;
    const id = chars[0].id;
    const snaps = await sql`
      SELECT data FROM character_snapshots
      WHERE character_id = ${id} AND at >= NOW() - interval '18 hours'
      ORDER BY at ASC
    `;
    let xp = false;
    let boss = false;
    if (snaps.length >= 2) {
      const first = snaps[0].data || {};
      const last = snaps[snaps.length - 1].data || {};
      xp = overallXp(last) - overallXp(first) >= 80000;
      boss = bossKc(last) - bossKc(first) >= 3;
    }
    const lootRows = await sql`
      SELECT COALESCE(SUM(total_value_gp), 0) AS gp, COALESCE(MAX(total_value_gp), 0) AS big
      FROM loot_drops
      WHERE lower(username) = lower(${username}) AND at >= NOW() - interval '18 hours'
    `;
    const gp = Number(lootRows[0] && lootRows[0].gp) || 0;
    const big = Number(lootRows[0] && lootRows[0].big) || 0;
    const loot = big >= 400000 || gp >= 1000000;
    return { xp, boss, loot };
  } catch (err) {
    console.error('spoop live heat', err.message || err);
    return NONE;
  }
}

module.exports = { liveHeatFor };
