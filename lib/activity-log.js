/**
 * Activity log: insert and prune to last 50 entries.
 * Used by api/loot.js (loot) and api/cron/snapshot.js (xp_kc).
 */

async function pruneTo50(sql) {
  try {
    await sql`
      DELETE FROM activity_log
      WHERE id NOT IN (SELECT id FROM activity_log ORDER BY at DESC LIMIT 50)
    `;
  } catch (e) {
    console.error('activity_log prune', e?.message || e);
  }
}

/**
 * Insert one activity row and prune to 50. Safe if table missing.
 */
async function insertActivity(sql, { username, type, description }) {
  if (!username || !type || !description) return;
  const desc = String(description).trim().substring(0, 500);
  try {
    await sql`
      INSERT INTO activity_log (username, type, description)
      VALUES (${username.trim().substring(0, 12)}, ${type}, ${desc})
    `;
    await pruneTo50(sql);
  } catch (e) {
    if (e && !(e.message || '').includes('activity_log')) console.error('activity_log insert', e?.message || e);
  }
}

module.exports = { insertActivity, pruneTo50 };
