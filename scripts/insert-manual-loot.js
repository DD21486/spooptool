/**
 * One-off / manual loot row (Neon). Usage:
 *   DATABASE_URL=... node scripts/insert-manual-loot.js
 * Loads ../.env if DATABASE_URL is unset (KEY=VALUE lines, no export required).
 */
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { insertActivity } = require('../lib/activity-log');

function loadEnvFile() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return;
  fs.readFileSync(p, 'utf8').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq === -1) return;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  });
}

async function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const sql = neon(url);

  const username = 'NewLineChar';
  const itemName = 'Araxyte fang';
  const itemId = 29799;
  const totalValueGp = 43_427_315;
  const source = 'Araxxor';
  const rarityText = '1 in 600';

  const charRows = await sql`
    SELECT id, username FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${username})) LIMIT 1
  `;
  if (!charRows.length) {
    console.error('No character found for username:', username);
    process.exit(1);
  }
  const characterId = charRows[0].id;
  const dbUsername = charRows[0].username || username;

  try {
    await sql`
      INSERT INTO loot_drops (character_id, username, item_id, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
      VALUES (${characterId}, ${dbUsername}, ${itemId}, ${itemName}, 1, ${totalValueGp}, ${source}, NULL, ${rarityText})
    `;
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (msg.includes('item_id') || msg.includes('column')) {
      await sql`
        INSERT INTO loot_drops (character_id, username, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
        VALUES (${characterId}, ${dbUsername}, ${itemName}, 1, ${totalValueGp}, ${source}, NULL, ${rarityText})
      `;
    } else {
      throw e;
    }
  }

  const gpShort = totalValueGp >= 1_000_000
    ? (totalValueGp / 1_000_000).toFixed(1) + 'M'
    : String(totalValueGp);
  await insertActivity(sql, {
    username: dbUsername,
    type: 'loot',
    description: `${itemName} — ${gpShort} gp from ${source}`,
  });

  console.log('Inserted loot_drops:', itemName, 'for', dbUsername, `(${totalValueGp.toLocaleString()} gp)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
