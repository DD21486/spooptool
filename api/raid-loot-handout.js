/**
 * Raid Loot Handout (manual raid drops).
 * GET: return list of raid items (name + value gp).
 * POST: body.raidUnlock === true → check password, return { ok }; else submit handout (password, itemName, valueGp, primaryUsername, at, splitPartners).
 */

const { neon } = require('@neondatabase/serverless');
const { insertActivity } = require('../lib/activity-log');

const RAID_ITEMS = [
  { raid: 'CoX', name: 'Dexterous prayer scroll', valueGp: 20_764_207 },
  { raid: 'CoX', name: 'Arcane prayer scroll', valueGp: 5_259_442 },
  { raid: 'CoX', name: 'Twisted buckler', valueGp: 16_450_681 },
  { raid: 'CoX', name: "Dragon hunter crossbow", valueGp: 43_121_185 },
  { raid: 'CoX', name: "Dinh's bulwark", valueGp: 14_220_499 },
  { raid: 'CoX', name: 'Ancestral hat', valueGp: 63_504_116 },
  { raid: 'CoX', name: 'Ancestral robe top', valueGp: 141_949_204 },
  { raid: 'CoX', name: 'Ancestral robe bottom', valueGp: 101_505_227 },
  { raid: 'CoX', name: 'Dragon claws', valueGp: 51_042_745 },
  { raid: 'CoX', name: 'Elder maul', valueGp: 100_248_604 },
  { raid: 'CoX', name: 'Kodai insignia', valueGp: 77_622_185 },
  { raid: 'CoX', name: 'Twisted bow', valueGp: 1_635_985_842 },
  { raid: 'ToA', name: "Osmumten's fang", valueGp: 25_094_641 },
  { raid: 'ToA', name: 'Lightbearer', valueGp: 5_481_608 },
  { raid: 'ToA', name: "Elidinis' ward", valueGp: 3_698_609 },
  { raid: 'ToA', name: 'Masori mask', valueGp: 13_881_101 },
  { raid: 'ToA', name: 'Masori body', valueGp: 54_057_408 },
  { raid: 'ToA', name: 'Masori chaps', valueGp: 37_851_728 },
  { raid: 'ToA', name: "Tumeken's shadow (uncharged)", valueGp: 915_786_348 },
  { raid: 'ToB', name: 'Avernic defender hilt', valueGp: 40_570_001 },
  { raid: 'ToB', name: 'Ghrazi rapier', valueGp: 31_979_886 },
  { raid: 'ToB', name: 'Sanguinesti staff (uncharged)', valueGp: 19_096_765 },
  { raid: 'ToB', name: 'Justiciar faceguard', valueGp: 14_832_129 },
  { raid: 'ToB', name: 'Justiciar chestguard', valueGp: 13_412_164 },
  { raid: 'ToB', name: 'Justiciar legguards', valueGp: 10_266_153 },
  { raid: 'ToB', name: 'Scythe of vitur (uncharged)', valueGp: 1_595_857_039 },
];

const SOURCE_MANUAL = 'Raid (manual)';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function checkPassword(body) {
  const expected = (process.env.RAID_LOOT_PASSWORD || '').trim();
  const given = (body.password || '').trim();
  return expected.length > 0 && given === expected;
}

function formatGpShort(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ items: RAID_ITEMS });
  }

  // POST
  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  } catch (_) {
    body = {};
  }

  if (body.raidUnlock === true) {
    const ok = checkPassword(body);
    return res.status(200).json({ ok });
  }

  // Submit handout
  if (!checkPassword(body)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const itemName = (body.itemName || '').trim().substring(0, 255);
  const valueGp = parseInt(body.valueGp, 10);
  const primaryUsername = (body.primaryUsername || '').trim().replace(/\s+/g, ' ').substring(0, 12);
  if (!itemName || !Number.isFinite(valueGp) || valueGp < 0 || !primaryUsername) {
    return res.status(400).json({ error: 'Missing or invalid itemName, valueGp, or primaryUsername' });
  }

  const at = body.at ? new Date(body.at) : new Date();
  if (Number.isNaN(at.getTime())) {
    return res.status(400).json({ error: 'Invalid at date' });
  }

  const rawPartners = Array.isArray(body.splitPartners) ? body.splitPartners : [];
  const splitPartners = rawPartners
    .map((p) => ({
      username: p.username != null && String(p.username).trim() !== '' ? String(p.username).trim().substring(0, 12) : null,
      percent: Math.max(0, Math.min(100, parseFloat(p.percent, 10) || 0)),
    }))
    .filter((p) => p.percent > 0);

  // Build list: primary + known partners. Primary gets remaining % so total = 100.
  const primaryPercent = Math.max(0, Math.min(100, parseFloat(body.primaryPercent, 10) || 0));
  const partnersPercent = splitPartners.reduce((s, p) => s + p.percent, 0);
  const totalAssigned = primaryPercent + partnersPercent;
  if (Math.abs(totalAssigned - 100) > 0.01) {
    return res.status(400).json({ error: 'Split total must equal 100%' });
  }

  const recipients = [];
  recipients.push({ username: primaryUsername, percent: primaryPercent });
  splitPartners.forEach((p) => recipients.push({ username: p.username, percent: p.percent }));

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const charRows = await sql`SELECT id, username FROM characters`;
    const usernameToId = {};
    charRows.forEach((r) => { usernameToId[(r.username || '').toLowerCase()] = { id: r.id, username: r.username }; });

    const knownRecipients = recipients.filter((r) => r.username && usernameToId[(r.username || '').toLowerCase()]);
    if (knownRecipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient must be a SpoopTool character' });
    }

    for (const r of knownRecipients) {
      const key = (r.username || '').toLowerCase();
      const char = usernameToId[key];
      if (!char) continue;
      const shareGp = Math.floor((valueGp * r.percent) / 100);
      if (shareGp <= 0) continue;
      await sql`
        INSERT INTO loot_drops (character_id, username, item_name, quantity, total_value_gp, source, at)
        VALUES (${char.id}, ${char.username}, ${itemName}, 1, ${shareGp}, ${SOURCE_MANUAL}, ${at})
      `;
    }

    const knownNames = knownRecipients.map((r) => r.username).filter(Boolean);
    const splitSuffix = knownNames.length > 1
      ? ' (split with ' + knownNames.filter((u) => u !== primaryUsername).join(', ') + ')'
      : '';
    const desc = itemName + ' — ' + formatGpShort(valueGp) + ' gp' + splitSuffix;
    await insertActivity(sql, { username: primaryUsername, type: 'loot', description: desc });

    return res.status(201).json({ ok: true, inserted: knownRecipients.length });
  } catch (err) {
    console.error('/api/raid-loot-handout', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
