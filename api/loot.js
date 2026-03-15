/**
 * GET /api/loot?player=Username&limit=20&hours=24|168
 * - totalDrops, totalValueGp: for the period when hours is set (24 or 168), else all-time.
 * - lootHistory: when hours set, bucketed cumulative value for the chart (only when hours present).
 * - drops: top N most valuable drops, grouped by item; when hours=24|168, drops are limited to that period (and optional source); each drop has affects_luck true if source matches a boss in luck_baseline for this character.
 *
 * POST /api/loot
 * Ingest from Dink: multipart/form-data with payload_json (type LOOT).
 * Auth: query param secret= or header Authorization (must match LOOT_WEBHOOK_SECRET).
 */

const { neon } = require('@neondatabase/serverless');
const { expectedKillsFromRarity, getLuckDelta, scaleLuckDeltaByRarity } = require('../lib/luck');
const { insertActivity } = require('../lib/activity-log');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

function formatGpShort(n) {
  const num = Number(n);
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return String(num);
}

const DELETED_BY_USER_SUFFIX = ' — Deleted by user';

/** GET /api/loot-icon?id=123 — proxy OSRS item sprite (merged into /api/loot?icon=1 for serverless count). */
const LOOT_SPRITE_URLS = [
  (id) => 'https://chisel.weirdgloop.org/static/img/osrs-sprite/' + id + '.png',
  (id) => 'https://chisel.weirdgloop.org/rsc/config/config18.jag/sprites/' + id + '.png',
];
const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
async function handleLootIcon(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = req.query.id != null ? parseInt(req.query.id, 10) : NaN;
  if (Number.isNaN(id) || id < 0) return res.status(400).end();
  for (const urlFn of LOOT_SPRITE_URLS) {
    try {
      const url = urlFn(id);
      const resp = await fetch(url, { headers: { Accept: 'image/png, image/*' } });
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.end(Buffer.from(buf));
      }
    } catch (_) {
      continue;
    }
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).end(TRANSPARENT_1X1_PNG);
}

const DISCORD_BIG_DROP_THRESHOLD_GP = 312_000;

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

  const playerLabel = username && username.trim() ? username.trim() : 'Unknown';
  const body = {
    embeds: [
      {
        title: `💰 Big drop — ${playerLabel}`,
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

/** GET /api/test-leaderboard-webhook (rewrite → ?testLeaderboard=1): send test message to Discord leaderboard webhook. */
async function handleTestLeaderboardWebhook(res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  const webhookUrl = (process.env.DISCORD_LEADERBOARD_WEBHOOK_URL || '').trim();
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return res.status(200).json({
      ok: false,
      error: 'Leaderboard webhook not configured. Add DISCORD_LEADERBOARD_WEBHOOK_URL in Vercel environment variables.',
    });
  }
  const body = {
    embeds: [
      {
        title: '🏆 Boss kill leader changed',
        description: "**This is a test from SpoopTool.** If you see this, your leaderboard notification webhook is working. You'll get a message here when someone ties or overtakes the boss KC lead.",
        color: 0xf59e0b,
        footer: { text: 'SpoopTool (test)' },
      },
    ],
  };
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(200).json({
        ok: false,
        error: 'Discord returned ' + resp.status + (text ? ': ' + text.slice(0, 100) : ''),
      });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: (e && e.message) ? e.message : 'Failed to send test message',
    });
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET' && (req.query.icon === '1' || req.query.icon === 'true')) {
    return handleLootIcon(req, res);
  }
  if (req.method === 'GET' && (req.query.testLeaderboard === '1' || req.query.testLeaderboard === 'true')) {
    return handleTestLeaderboardWebhook(res);
  }
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return send500(res, 'DATABASE_URL not set');
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'DELETE') {
      let body;
      try {
        body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      } catch (_) {
        body = {};
      }
      const idParam = body.id != null ? body.id : req.query.id;
      const id = idParam != null ? parseInt(idParam, 10) : NaN;
      const playerParam = body.player || body.username || req.query.player || req.query.username || '';
      const player = String(playerParam).trim().replace(/\s+/g, ' ').substring(0, 12);
      const confirm = String(body.confirm || '').trim();
      if (confirm !== 'DELETE' || !player || !Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Missing or invalid id, player, or confirm (must be the word DELETE)' });
      }
      const rows = await sql`
        SELECT id, username, item_name, total_value_gp FROM loot_drops
        WHERE id = ${id} AND LOWER(TRIM(username)) = LOWER(TRIM(${player}))
        LIMIT 1
      `;
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Loot entry not found or not owned by this player' });
      }
      const itemName = (rows[0].item_name || '').trim();
      const valueGp = Number(rows[0].total_value_gp) || 0;
      await sql`DELETE FROM loot_drops WHERE id = ${id} AND LOWER(TRIM(username)) = LOWER(TRIM(${player}))`;

      if (itemName && valueGp >= 0) {
        const valueStr = formatGpShort(valueGp);
        try {
          const activityRows = await sql`
            SELECT id, description FROM activity_log
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
              AND type = 'loot'
              AND description IS NOT NULL
              AND description NOT LIKE ${'%' + DELETED_BY_USER_SUFFIX}
              AND description LIKE ${'%' + itemName.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%'}
              AND description LIKE ${'%' + valueStr + '%'}
            ORDER BY at DESC
            LIMIT 1
          `;
          if (activityRows.length > 0) {
            const currentDesc = (activityRows[0].description || '').trim();
            const newDesc = currentDesc + DELETED_BY_USER_SUFFIX;
            await sql`
              UPDATE activity_log SET description = ${newDesc}
              WHERE id = ${activityRows[0].id}
            `;
          }
        } catch (activityErr) {
          console.error('Activity log update after loot delete', activityErr?.message || activityErr);
        }
      }
      return res.status(200).json({ ok: true });
    }

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
          const todayParam = req.query.today === '1' || req.query.today === 'true';
          const weekParam = req.query.week === '1' || req.query.week === 'true';
          const lastWeekParam = req.query.lastWeek === '1' || req.query.lastWeek === 'true';
          const monthParam = req.query.month === '1' || req.query.month === 'true';
          const periodFilter = hoursParam === 24 || hoursParam === 168 ? hoursParam : null;
          let rows;
          if (todayParam) {
            rows = await sql`
              SELECT MAX(TRIM(username)) AS username, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
              FROM loot_drops
              WHERE at >= date_trunc('day', NOW())
              GROUP BY LOWER(TRIM(username))
              ORDER BY total_value_gp DESC
            `;
          } else if (weekParam) {
            rows = await sql`
              SELECT MAX(TRIM(username)) AS username, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
              FROM loot_drops
              WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
              GROUP BY LOWER(TRIM(username))
              ORDER BY total_value_gp DESC
            `;
          } else if (lastWeekParam) {
            rows = await sql`
              SELECT MAX(TRIM(username)) AS username, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
              FROM loot_drops
              WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - interval '7 days'
                AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
              GROUP BY LOWER(TRIM(username))
              ORDER BY total_value_gp DESC
            `;
          } else if (monthParam) {
            rows = await sql`
              SELECT MAX(TRIM(username)) AS username, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
              FROM loot_drops
              WHERE at >= date_trunc('month', NOW())
              GROUP BY LOWER(TRIM(username))
              ORDER BY total_value_gp DESC
            `;
          } else if (periodFilter != null) {
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
      const monthParam = req.query.month === '1' || req.query.month === 'true';
      const periodFilter = !monthParam && (hours === 24 || hours === 168) ? hours : null;
      const sourceFilter = (req.query.source || req.query.from || '').trim() || null;

      let agg;
      if (monthParam) {
        if (sourceFilter) {
          agg = await sql`
            SELECT COUNT(*)::int AS total_drops, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
              AND at >= date_trunc('month', NOW())
              AND TRIM(source) = TRIM(${sourceFilter})
          `;
        } else {
          agg = await sql`
            SELECT COUNT(*)::int AS total_drops, COALESCE(SUM(total_value_gp), 0)::bigint AS total_value_gp
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
              AND at >= date_trunc('month', NOW())
          `;
        }
      } else if (periodFilter != null) {
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
      if (monthParam || periodFilter != null) {
        let buckets;
        if (monthParam) {
          if (sourceFilter) {
            buckets = await sql`
              SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
              FROM loot_drops
              WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                AND at >= date_trunc('month', NOW())
                AND TRIM(source) = TRIM(${sourceFilter})
              GROUP BY date_trunc('hour', at)
              ORDER BY bucket ASC
            `;
          } else {
            buckets = await sql`
              SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
              FROM loot_drops
              WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                AND at >= date_trunc('month', NOW())
              GROUP BY date_trunc('hour', at)
              ORDER BY bucket ASC
            `;
          }
        } else if (sourceFilter) {
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

      let characterId = null;
      const charRows = await sql`
        SELECT id FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player})) LIMIT 1
      `;
      if (charRows.length) characterId = charRows[0].id;
      const luckBossKeys = new Set();
      if (characterId) {
        const baselineRows = await sql`
          SELECT DISTINCT LOWER(TRIM(boss_key)) AS boss_key
          FROM luck_baseline
          WHERE character_id = ${characterId}
        `;
        baselineRows.forEach((r) => { if (r.boss_key) luckBossKeys.add(r.boss_key); });
      }

      const perDrop = req.query.perDrop === '1' || req.query.perDrop === 'true';
      if (perDrop) {
        let rawRows;
        try {
          if (monthParam) {
            rawRows = sourceFilter != null
              ? await sql`
                  SELECT id, item_id, item_name, quantity, total_value_gp, source, at, luck_delta
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND at >= date_trunc('month', NOW())
                    AND TRIM(source) = TRIM(${sourceFilter})
                  ORDER BY at DESC
                  LIMIT ${limit}
                `
              : await sql`
                  SELECT id, item_id, item_name, quantity, total_value_gp, source, at, luck_delta
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND at >= date_trunc('month', NOW())
                  ORDER BY at DESC
                  LIMIT ${limit}
                `;
          } else if (periodFilter != null) {
            rawRows = sourceFilter != null
              ? await sql`
                  SELECT id, item_id, item_name, quantity, total_value_gp, source, at, luck_delta
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND at >= NOW() - make_interval(hours => ${periodFilter})
                    AND TRIM(source) = TRIM(${sourceFilter})
                  ORDER BY at DESC
                  LIMIT ${limit}
                `
              : await sql`
                  SELECT id, item_id, item_name, quantity, total_value_gp, source, at, luck_delta
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND at >= NOW() - make_interval(hours => ${periodFilter})
                  ORDER BY at DESC
                  LIMIT ${limit}
                `;
          } else {
            rawRows = sourceFilter != null
              ? await sql`
                  SELECT id, item_id, item_name, quantity, total_value_gp, source, at, luck_delta
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND TRIM(source) = TRIM(${sourceFilter})
                  ORDER BY at DESC
                  LIMIT ${limit}
                `
              : await sql`
                  SELECT id, item_id, item_name, quantity, total_value_gp, source, at, luck_delta
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                  ORDER BY at DESC
                  LIMIT ${limit}
                `;
          }
        } catch (rawErr) {
          const msg = (rawErr && rawErr.message) || String(rawErr);
          if (msg.includes('luck_delta') || msg.includes('does not exist')) {
            if (monthParam) {
              rawRows = sourceFilter != null
                ? await sql`
                    SELECT id, item_id, item_name, quantity, total_value_gp, source, at
                    FROM loot_drops
                    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                      AND at >= date_trunc('month', NOW())
                      AND TRIM(source) = TRIM(${sourceFilter})
                    ORDER BY at DESC
                    LIMIT ${limit}
                  `
                : await sql`
                    SELECT id, item_id, item_name, quantity, total_value_gp, source, at
                    FROM loot_drops
                    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                      AND at >= date_trunc('month', NOW())
                    ORDER BY at DESC
                    LIMIT ${limit}
                  `;
            } else if (periodFilter != null) {
              rawRows = sourceFilter != null
                ? await sql`
                    SELECT id, item_id, item_name, quantity, total_value_gp, source, at
                    FROM loot_drops
                    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                      AND at >= NOW() - make_interval(hours => ${periodFilter})
                      AND TRIM(source) = TRIM(${sourceFilter})
                    ORDER BY at DESC
                    LIMIT ${limit}
                  `
                : await sql`
                    SELECT id, item_id, item_name, quantity, total_value_gp, source, at
                    FROM loot_drops
                    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                      AND at >= NOW() - make_interval(hours => ${periodFilter})
                    ORDER BY at DESC
                    LIMIT ${limit}
                  `;
            } else {
              rawRows = sourceFilter != null
                ? await sql`
                    SELECT id, item_id, item_name, quantity, total_value_gp, source, at
                    FROM loot_drops
                    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                      AND TRIM(source) = TRIM(${sourceFilter})
                    ORDER BY at DESC
                    LIMIT ${limit}
                  `
                : await sql`
                    SELECT id, item_id, item_name, quantity, total_value_gp, source, at
                    FROM loot_drops
                    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    ORDER BY at DESC
                    LIMIT ${limit}
                  `;
            }
            rawRows = rawRows.map((r) => ({ ...r, luck_delta: null }));
          } else {
            throw rawErr;
          }
        }
        const drops = rawRows.map((r) => {
          const src = r.source != null ? String(r.source).trim() : '';
          const affectsLuck = src !== '' && luckBossKeys.has(src.toLowerCase());
          const luckDelta = r.luck_delta != null && Number.isFinite(Number(r.luck_delta)) ? Number(r.luck_delta) : null;
          return {
            id: r.id,
            item_id: r.item_id != null ? r.item_id : null,
            item_name: r.item_name,
            quantity: r.quantity,
            total_value_gp: Number(r.total_value_gp),
            source: r.source != null ? r.source : null,
            affects_luck: affectsLuck,
            luck_delta: luckDelta,
          };
        });
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=90');
        return res.status(200).json({
          totalDrops: a.total_drops,
          totalValueGp: Number(a.total_value_gp),
          lootHistory: lootHistory.length ? lootHistory : undefined,
          drops,
          sources,
        });
      }

      let grouped;
      try {
        grouped = monthParam
          ? (sourceFilter != null
            ? await sql`
                SELECT MAX(item_id) AS item_id, MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                  (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source,
                  (array_agg(luck_delta ORDER BY at DESC NULLS LAST))[1] AS luck_delta
                FROM loot_drops
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                  AND at >= date_trunc('month', NOW())
                  AND TRIM(source) = TRIM(${sourceFilter})
                GROUP BY LOWER(TRIM(item_name))
                ORDER BY total_value_gp DESC
                LIMIT ${limit}
              `
            : await sql`
                SELECT MAX(item_id) AS item_id, MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                  (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source,
                  (array_agg(luck_delta ORDER BY at DESC NULLS LAST))[1] AS luck_delta
                FROM loot_drops
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                  AND at >= date_trunc('month', NOW())
                GROUP BY LOWER(TRIM(item_name))
                ORDER BY total_value_gp DESC
                LIMIT ${limit}
              `)
          : periodFilter != null
            ? (sourceFilter != null
              ? await sql`
                  SELECT MAX(item_id) AS item_id, MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                    (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source,
                    (array_agg(luck_delta ORDER BY at DESC NULLS LAST))[1] AS luck_delta
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND at >= NOW() - make_interval(hours => ${periodFilter})
                    AND TRIM(source) = TRIM(${sourceFilter})
                  GROUP BY LOWER(TRIM(item_name))
                  ORDER BY total_value_gp DESC
                  LIMIT ${limit}
                `
              : await sql`
                  SELECT MAX(item_id) AS item_id, MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                    (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source,
                    (array_agg(luck_delta ORDER BY at DESC NULLS LAST))[1] AS luck_delta
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND at >= NOW() - make_interval(hours => ${periodFilter})
                  GROUP BY LOWER(TRIM(item_name))
                  ORDER BY total_value_gp DESC
                  LIMIT ${limit}
                `)
            : (sourceFilter != null
            ? await sql`
                SELECT MAX(item_id) AS item_id, MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                  (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source,
                  (array_agg(luck_delta ORDER BY at DESC NULLS LAST))[1] AS luck_delta
                FROM loot_drops
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                  AND TRIM(source) = TRIM(${sourceFilter})
                GROUP BY LOWER(TRIM(item_name))
                ORDER BY total_value_gp DESC
                LIMIT ${limit}
              `
            : await sql`
                SELECT MAX(item_id) AS item_id, MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                  (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source,
                  (array_agg(luck_delta ORDER BY at DESC NULLS LAST))[1] AS luck_delta
                FROM loot_drops
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                GROUP BY LOWER(TRIM(item_name))
                ORDER BY total_value_gp DESC
                LIMIT ${limit}
              `);
      } catch (groupErr) {
        const msg = (groupErr && groupErr.message) || String(groupErr);
        if (msg.includes('item_id') || msg.includes('does not exist') || msg.includes('column')) {
          grouped = monthParam
            ? (sourceFilter != null
              ? await sql`
                  SELECT MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                    (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND at >= date_trunc('month', NOW())
                    AND TRIM(source) = TRIM(${sourceFilter})
                  GROUP BY LOWER(TRIM(item_name))
                  ORDER BY total_value_gp DESC
                  LIMIT ${limit}
                `
              : await sql`
                  SELECT MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                    (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND at >= date_trunc('month', NOW())
                  GROUP BY LOWER(TRIM(item_name))
                  ORDER BY total_value_gp DESC
                  LIMIT ${limit}
                `)
            : periodFilter != null
              ? (sourceFilter != null
                ? await sql`
                    SELECT MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                      (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source
                    FROM loot_drops
                    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                      AND at >= NOW() - make_interval(hours => ${periodFilter})
                      AND TRIM(source) = TRIM(${sourceFilter})
                    GROUP BY LOWER(TRIM(item_name))
                    ORDER BY total_value_gp DESC
                    LIMIT ${limit}
                  `
                : await sql`
                    SELECT MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                      (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source
                    FROM loot_drops
                    WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                      AND at >= NOW() - make_interval(hours => ${periodFilter})
                    GROUP BY LOWER(TRIM(item_name))
                    ORDER BY total_value_gp DESC
                    LIMIT ${limit}
                  `)
              : (sourceFilter != null
              ? await sql`
                  SELECT MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                    (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                    AND TRIM(source) = TRIM(${sourceFilter})
                  GROUP BY LOWER(TRIM(item_name))
                  ORDER BY total_value_gp DESC
                  LIMIT ${limit}
                `
              : await sql`
                  SELECT MAX(item_name) AS item_name, SUM(quantity)::int AS quantity, SUM(total_value_gp)::bigint AS total_value_gp,
                    (array_agg(source ORDER BY at DESC NULLS LAST))[1] AS source
                  FROM loot_drops
                  WHERE LOWER(TRIM(username)) = LOWER(TRIM(${player}))
                  GROUP BY LOWER(TRIM(item_name))
                  ORDER BY total_value_gp DESC
                  LIMIT ${limit}
                `);
          grouped = grouped.map((r) => ({ ...r, item_id: null, luck_delta: null }));
        } else {
          throw groupErr;
        }
      }

      const drops = grouped.map((r) => {
        const src = r.source != null ? String(r.source).trim() : '';
        const affectsLuck = src !== '' && luckBossKeys.has(src.toLowerCase());
        const luckDelta = r.luck_delta != null && Number.isFinite(Number(r.luck_delta)) ? Number(r.luck_delta) : null;
        return {
          item_id: r.item_id != null ? r.item_id : null,
          item_name: r.item_name,
          quantity: r.quantity,
          total_value_gp: Number(r.total_value_gp),
          source: r.source != null ? r.source : null,
          affects_luck: affectsLuck,
          luck_delta: luckDelta,
        };
      });

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
        console.warn('Loot POST: invalid or non-LOOT payload', payload ? { type: payload.type } : 'null');
        return res.status(400).json({ error: 'Invalid or non-LOOT payload' });
      }

      const username = (payload.playerName || '').trim().replace(/\s+/g, ' ').substring(0, 12);
      if (!username) {
        console.warn('Loot POST: missing playerName');
        return res.status(400).json({ error: 'Missing playerName' });
      }

      const extra = payload.extra || {};
      const items = Array.isArray(extra.items) ? extra.items : [];
      if (items.length === 0) {
        console.warn('Loot POST: no items in payload', { username, extraKeys: Object.keys(extra || {}) });
      }
      const source = (extra.source || '').trim().substring(0, 128) || null;
      const killCount = extra.killCount != null ? parseInt(extra.killCount, 10) : null;
      const rarest = extra.rarestProbability != null ? String(extra.rarestProbability).substring(0, 64) : null;

      const eventTotalGp = items.reduce((s, i) => s + (Math.max(1, parseInt(i.quantity, 10) || 1) * (parseInt(i.priceEach, 10) || 0)), 0);

      // Deduplicate: Dink sometimes sends the same raid loot twice (e.g. kill 23 and 24). Group by minute so
      // multiple rows from one webhook (inserted in the same minute) are treated as one batch.
      if (items.length > 0 && source) {
        const dupCheck = await sql`
          SELECT 1 FROM (
            SELECT date_trunc('minute', at) AS bucket, SUM(total_value_gp) AS event_total, COUNT(*) AS item_count
            FROM loot_drops
            WHERE LOWER(TRIM(username)) = LOWER(TRIM(${username}))
              AND TRIM(source) = TRIM(${source})
              AND at > NOW() - interval '2 minutes'
            GROUP BY date_trunc('minute', at)
            HAVING SUM(total_value_gp) = ${eventTotalGp}
              AND COUNT(*) = ${items.length}
            LIMIT 1
          ) AS sub
        `;
        if (dupCheck.length > 0) {
          console.log('Loot POST: duplicate raid/source drop ignored for', username, source);
          return res.status(201).json({ ok: true, inserted: 0, duplicate: true });
        }
      }

      const charRow = await sql`
        SELECT id FROM characters WHERE LOWER(TRIM(username)) = LOWER(TRIM(${username})) LIMIT 1
      `;
      const characterId = charRow.length ? charRow[0].id : null;

      // Compute luck delta before inserts so we can store it on each row (1/100–1/500 medium, 1/500–1/1500 high, 1/1500+ extreme)
      let appliedLuckDelta = null;
      let newLuckScore = null;
      const prob = extra.rarestProbability;
      const probNum = typeof prob === 'number' ? prob : parseFloat(prob, 10);
      const isGuaranteedDrop = prob != null && Number.isFinite(probNum) && probNum >= 0.99;
      if (characterId && source && killCount != null && prob != null && !isGuaranteedDrop) {
        try {
          const baselineRows = await sql`
            SELECT kill_count FROM luck_baseline
            WHERE character_id = ${characterId} AND LOWER(TRIM(boss_key)) = LOWER(TRIM(${source}))
            LIMIT 1
          `;
          const baselineKc = baselineRows.length ? Math.max(0, parseInt(baselineRows[0].kill_count, 10) || 0) : 0;
          if (killCount > baselineKc) {
            const effectiveKc = killCount - baselineKc;
            const expected = expectedKillsFromRarity(prob);
            if (expected != null && expected > 32) {
              const ratio = effectiveKc / expected;
              const charLuck = await sql`SELECT luck_score FROM characters WHERE id = ${characterId} LIMIT 1`;
              const currentScore = charLuck.length ? (parseInt(charLuck[0].luck_score, 10) || 0) : 0;
              const { delta } = getLuckDelta(ratio, currentScore);
              appliedLuckDelta = scaleLuckDeltaByRarity(delta, expected);
              newLuckScore = Math.max(-100, Math.min(100, currentScore + appliedLuckDelta));
            }
          }
        } catch (luckErr) {
          console.error('Luck meter update skipped', luckErr?.message || luckErr);
        }
      }

      let inserted = 0;
      let payloadTotalValueGp = 0;
      let tableHasItemId = true;
      let tableHasLuckDelta = true;
      for (const item of items) {
        const itemName = (item.name || 'Unknown').trim().substring(0, 255);
        const itemId = item.id != null ? parseInt(item.id, 10) : null;
        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        const priceEach = parseInt(item.priceEach, 10) || 0;
        const totalValueGp = qty * priceEach;
        payloadTotalValueGp += totalValueGp;

        if (tableHasItemId && tableHasLuckDelta) {
          try {
            await sql`
              INSERT INTO loot_drops (character_id, username, item_id, item_name, quantity, total_value_gp, source, kill_count, rarity_text, luck_delta)
              VALUES (${characterId}, ${username}, ${Number.isNaN(itemId) ? null : itemId}, ${itemName}, ${qty}, ${totalValueGp}, ${source}, ${killCount}, ${rarest}, ${appliedLuckDelta})
            `;
          } catch (insertErr) {
            const msg = (insertErr && insertErr.message) || String(insertErr);
            if (msg.includes('item_id') || msg.includes('does not exist') || msg.includes('column')) {
              tableHasItemId = false;
              tableHasLuckDelta = msg.includes('luck_delta') ? false : tableHasLuckDelta;
              await sql`
                INSERT INTO loot_drops (character_id, username, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
                VALUES (${characterId}, ${username}, ${itemName}, ${qty}, ${totalValueGp}, ${source}, ${killCount}, ${rarest})
              `;
            } else if (msg.includes('luck_delta')) {
              tableHasLuckDelta = false;
              await sql`
                INSERT INTO loot_drops (character_id, username, item_id, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
                VALUES (${characterId}, ${username}, ${Number.isNaN(itemId) ? null : itemId}, ${itemName}, ${qty}, ${totalValueGp}, ${source}, ${killCount}, ${rarest})
              `;
            } else {
              throw insertErr;
            }
          }
        } else if (tableHasItemId) {
          await sql`
            INSERT INTO loot_drops (character_id, username, item_id, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
            VALUES (${characterId}, ${username}, ${Number.isNaN(itemId) ? null : itemId}, ${itemName}, ${qty}, ${totalValueGp}, ${source}, ${killCount}, ${rarest})
          `;
        } else {
          await sql`
            INSERT INTO loot_drops (character_id, username, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
            VALUES (${characterId}, ${username}, ${itemName}, ${qty}, ${totalValueGp}, ${source}, ${killCount}, ${rarest})
          `;
        }
        inserted += 1;
      }

      if (newLuckScore != null) {
        await sql`UPDATE characters SET luck_score = ${newLuckScore} WHERE id = ${characterId}`;
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

      const formatGpShort = (n) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : (n >= 1_000 ? (n / 1_000).toFixed(1) + 'K' : String(n)));
      const lootDesc = items.map((i) => (i.name || 'Unknown') + (i.quantity > 1 ? ' x' + i.quantity : '')).join(', ') + ' (' + formatGpShort(payloadTotalValueGp) + ' gp)' + (source ? ' from ' + source : '');
      await insertActivity(sql, { username, type: 'loot', description: lootDesc });

      if (inserted > 0) {
        console.log('Loot POST: inserted', inserted, 'for', username, formatGpShort(payloadTotalValueGp) + ' gp');
      }
      return res.status(201).json({ ok: true, inserted });
    }
  } catch (err) {
    console.error('/api/loot', err);
    return send500(res, err.message);
  }
};
