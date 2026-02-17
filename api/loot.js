/**
 * GET /api/loot?player=Username&limit=20&hours=24|168
 * - totalDrops, totalValueGp: for the period when hours is set (24 or 168), else all-time.
 * - lootHistory: when hours set, bucketed cumulative value for the chart (only when hours present).
 * - drops: top N most valuable drops, grouped by item (sum quantity + value), all-time, not filtered by hours.
 *
 * POST /api/loot
 * Ingest from Dink: multipart/form-data with payload_json (type LOOT).
 * Auth: query param secret= or header Authorization (must match LOOT_WEBHOOK_SECRET).
 */

const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Parse multipart/form-data and return the value of the part named "payload_json". */
function extractPayloadJson(buffer, contentType) {
  const match = contentType && contentType.match(/boundary=([^;\s]+)/);
  const boundary = match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  if (!boundary) return null;
  const boundaryBuf = Buffer.from('--' + boundary, 'utf8');
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  if (start === -1) return null;
  start += boundaryBuf.length;
  while (start < buffer.length) {
    const next = buffer.indexOf(boundaryBuf, start);
    const slice = next === -1 ? buffer.subarray(start) : buffer.subarray(start, next);
    start = next === -1 ? buffer.length : next + boundaryBuf.length;
    const doubleCrlf = slice.indexOf(Buffer.from('\r\n\r\n', 'utf8'));
    if (doubleCrlf === -1) continue;
    const header = slice.subarray(0, doubleCrlf).toString('utf8');
    const body = slice.subarray(doubleCrlf + 4);
    if (header.includes('name="payload_json"') || header.includes("name='payload_json'")) {
      const str = body.toString('utf8').replace(/\r\n$/, '');
      try {
        return JSON.parse(str);
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

function send500(res, detail) {
  return res.status(500).json({ error: 'Server error', detail: detail || 'Unknown error' });
}

const DISCORD_BIG_DROP_THRESHOLD_GP = 300_000;

/**
 * POST to Discord incoming webhook with an embed for a big loot drop.
 * Does not throw; logs errors so the main handler can still return 201.
 */
async function sendBigDropToDiscord(webhookUrl, { username, items, source, killCount, rarest, totalValueGp }) {
  if (!webhookUrl || typeof webhookUrl !== 'string') return;
  const url = webhookUrl.trim();
  if (!url.startsWith('https://discord.com/api/webhooks/')) return;

  const formatGp = (n) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : (n >= 1_000 ? (n / 1_000).toFixed(1) + 'K' : String(n)));
  const lines = items.map((item) => {
    const total = (item.quantity || 1) * (item.priceEach || 0);
    const qty = item.quantity && item.quantity > 1 ? ` x${item.quantity}` : '';
    return `• **${item.name || 'Unknown'}**${qty} — ${formatGp(total)} gp`;
  });
  const description = lines.join('\n');
  const fields = [
    { name: 'Total value', value: `${formatGp(totalValueGp)} gp`, inline: true },
    { name: 'Player', value: username || '—', inline: true },
  ];
  if (source) fields.push({ name: 'Source', value: source, inline: true });
  if (killCount != null) fields.push({ name: 'Kill count', value: String(killCount), inline: true });
  if (rarest) fields.push({ name: 'Rarity', value: rarest, inline: false });

  const body = {
    embeds: [
      {
        title: '💰 Big drop',
        description: description.length > 4096 ? description.slice(0, 4093) + '...' : description,
        fields: fields.slice(0, 25),
        color: 0x58b157,
        footer: { text: 'SpoopTool' },
      },
    ],
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('Discord webhook failed', resp.status, text?.slice(0, 200));
    }
  } catch (e) {
    console.error('Discord webhook error', e?.message || e);
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return send500(res, 'DATABASE_URL not set');
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const player = (req.query.player || req.query.username || '').trim().replace(/\s+/g, ' ');

      if (!player) {
        if (req.query.webhook === '1' || req.query.webhook === 'true') {
          const secret = process.env.LOOT_WEBHOOK_SECRET || '';
          const host = req.headers['x-forwarded-host'] || req.headers.host || '';
          const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
          const base = host ? protocol + '://' + host : '';
          if (!base) return res.status(500).json({ error: 'Could not determine base URL' });
          const path = '/api/loot';
          const url = secret ? base + path + '?secret=' + encodeURIComponent(secret) : base + path;
          res.setHeader('Cache-Control', 'private, no-store');
          return res.status(200).json({ url });
        }
        if (req.query.leaderboard === '1' || req.query.leaderboard === 'true') {
          const hoursParam = req.query.hours != null ? parseInt(req.query.hours, 10) : null;
          const periodFilter = hoursParam === 24 || hoursParam === 168 ? hoursParam : null;
          let rows;
          if (periodFilter != null) {
            rows = await sql`
              SELECT MAX(TRIM(username)) AS username, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
              FROM loot_drops
              WHERE at >= NOW() - make_interval(hours => ${periodFilter})
              GROUP BY LOWER(TRIM(username))
              ORDER BY total_value_gp DESC
            `;
          } else {
            rows = await sql`
              SELECT MAX(TRIM(username)) AS username, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
              FROM loot_drops
              GROUP BY LOWER(TRIM(username))
              ORDER BY total_value_gp DESC
            `;
          }
          const players = rows.map((r) => ({ username: r.username, totalValueGp: Number(r.total_value_gp) }));
          res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
          return res.status(200).json({ players });
        }
        return res.status(400).json({ error: 'player required' });
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const hours = req.query.hours != null ? parseInt(req.query.hours, 10) : null;
      const periodFilter = hours === 24 || hours === 168 ? hours : null;
      const sourceFilter = (req.query.source || req.query.from || '').trim() || null;

      let agg;
      if (periodFilter != null) {
        if (sourceFilter) {
          agg = await sql`
            SELECT COUNT(*)::int AS total_drops, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
              AND at >= NOW() - make_interval(hours => ${periodFilter})
              AND TRIM(source) = TRIM(${sourceFilter})
          `;
        } else {
          agg = await sql`
            SELECT COUNT(*)::int AS total_drops, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
              AND at >= NOW() - make_interval(hours => ${periodFilter})
          `;
        }
      } else {
        if (sourceFilter) {
          agg = await sql`
            SELECT COUNT(*)::int AS total_drops, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
              AND TRIM(source) = TRIM(${sourceFilter})
          `;
        } else {
          agg = await sql`
            SELECT COUNT(*)::int AS total_drops, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
          `;
        }
      }
      const a = agg[0] || { total_drops: 0, total_value_gp: 0 };

      let lootHistory = [];
      if (periodFilter != null) {
        let buckets;
        if (sourceFilter) {
          buckets = await sql`
            SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
              AND at >= NOW() - make_interval(hours => ${periodFilter})
              AND TRIM(source) = TRIM(${sourceFilter})
            GROUP BY date_trunc('hour', at)
            ORDER BY bucket ASC
          `;
        } else {
          buckets = await sql`
            SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
              AND at >= NOW() - make_interval(hours => ${periodFilter})
            GROUP BY date_trunc('hour', at)
            ORDER BY bucket ASC
          `;
        }
        let cum = 0;
        lootHistory = buckets.map((r) => {
          cum += Number(r.value || 0);
          return { at: r.bucket, value: cum };
        });
      }

      const sourceRows = await sql`
        SELECT DISTINCT TRIM(source) AS source
        FROM loot_drops
        WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
          AND source IS NOT NULL
          AND TRIM(source) != ''
        ORDER BY source ASC
      `;
      const sources = sourceRows.map((r) => r.source);

      let grouped;
      try {
        grouped = await sql`
          SELECT item_id, item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
            (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source
          FROM loot_drops
          WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
          GROUP BY item_id, item_name
          ORDER BY total_value_gp DESC
          LIMIT ${limit}
        `;
      } catch (groupErr) {
        const msg = (groupErr && groupErr.message) || String(groupErr);
        if (msg.includes('item_id') || msg.includes('does not exist') || msg.includes('column')) {
          grouped = await sql`
            SELECT item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
              (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
            GROUP BY item_name
            ORDER BY total_value_gp DESC
            LIMIT ${limit}
          `;
          grouped = grouped.map((r) => ({ ...r, item_id: null }));
        } else {
          throw groupErr;
        }
      }

      const drops = grouped.map((r) => ({
        item_id: r.item_id != null ? r.item_id : null,
        item_name: r.item_name,
        quantity: r.quantity,
        total_value_gp: Number(r.total_value_gp),
        source: r.source != null ? r.source : null,
      }));

      res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
      return res.status(200).json({
        totalDrops: a.total_drops,
        totalValueGp: Number(a.total_value_gp),
        lootHistory: lootHistory.length ? lootHistory : undefined,
        drops,
        sources,
      });
    }

    if (req.method === 'POST') {
      const secret = process.env.LOOT_WEBHOOK_SECRET || '';
      const querySecret = (req.query.secret || '').trim();
      const authHeader = (req.headers.authorization || '').trim();
      const headerSecret = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (secret && querySecret !== secret && headerSecret !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Expected multipart/form-data' });
      }

      let rawBody = req.body;
      if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') {
        rawBody = await getRawBody(req);
      }
      if (typeof rawBody === 'string') rawBody = Buffer.from(rawBody, 'utf8');
      if (!rawBody || rawBody.length === 0) return res.status(400).json({ error: 'Empty body' });
      const payload = extractPayloadJson(rawBody, contentType);
      if (!payload || payload.type !== 'LOOT') {
        return res.status(400).json({ error: 'Invalid or non-LOOT payload' });
      }

      const username = (payload.playerName || '').trim().replace(/\s+/g, ' ').substring(0, 12);
      if (!username) return res.status(400).json({ error: 'Missing playerName' });

      const extra = payload.extra || {};
      const items = Array.isArray(extra.items) ? extra.items : [];
      const source = (extra.source || '').trim().substring(0, 128) || null;
      const killCount = extra.killCount != null ? parseInt(extra.killCount, 10) : null;
      const rarest = extra.rarestProbability != null ? String(extra.rarestProbability).substring(0, 64) : null;

      const charRow = await sql`
        SELECT id FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${username})) LIMIT 1
      `;
      const characterId = charRow.length ? charRow[0].id : null;

      let inserted = 0;
      let payloadTotalValueGp = 0;
      let tableHasItemId = true;
      for (const item of items) {
        const itemName = (item.name || 'Unknown').trim().substring(0, 255);
        const itemId = item.id != null ? parseInt(item.id, 10) : null;
        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        const priceEach = parseInt(item.priceEach, 10) || 0;
        const totalValueGp = qty * priceEach;
        payloadTotalValueGp += totalValueGp;

        if (tableHasItemId) {
          try {
            await sql`
              INSERT INTO loot_drops (character_id, username, item_id, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
              VALUES (${characterId}, ${username}, ${Number.isNaN(itemId) ? null : itemId}, ${itemName}, ${qty}, ${totalValueGp}, ${source}, ${killCount}, ${rarest})
            `;
          } catch (insertErr) {
            const msg = (insertErr && insertErr.message) || String(insertErr);
            if (msg.includes('item_id') || msg.includes('does not exist') || msg.includes('column')) {
              tableHasItemId = false;
              await sql`
                INSERT INTO loot_drops (character_id, username, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
                VALUES (${characterId}, ${username}, ${itemName}, ${qty}, ${totalValueGp}, ${source}, ${killCount}, ${rarest})
              `;
            } else {
              throw insertErr;
            }
          }
        } else {
          await sql`
            INSERT INTO loot_drops (character_id, username, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
            VALUES (${characterId}, ${username}, ${itemName}, ${qty}, ${totalValueGp}, ${source}, ${killCount}, ${rarest})
          `;
        }
        inserted += 1;
      }

      if (payloadTotalValueGp >= DISCORD_BIG_DROP_THRESHOLD_GP) {
        const discordUrl = process.env.DISCORD_LOOT_WEBHOOK_URL || '';
        if (discordUrl) {
          await sendBigDropToDiscord(discordUrl, {
            username,
            items,
            source,
            killCount,
            rarest,
            totalValueGp: payloadTotalValueGp,
          });
        }
      }

      return res.status(201).json({ ok: true, inserted });
    }
  } catch (err) {
    console.error('/api/loot', err);
    return send500(res, err.message);
  }
};
