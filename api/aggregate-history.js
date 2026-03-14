/**
 * GET /api/aggregate-history?hours=24
 * Returns bucketed time series of combined total XP and total boss KC across all characters for the last N hours.
 * GET /api/weekly-winners (rewrite → ?path=weekly-winners): last week's leader usernames for XP, Boss KC, Loot.
 * GET /api/ge-prices (rewrite → ?path=ge): GE data from DB cache or OSRS Wiki API (and save to DB when fetched).
 */

const { neon } = require('@neondatabase/serverless');

const GE_PRICES_BASE = 'https://prices.runescape.wiki/api/v1/osrs';
const GE_USER_AGENT = 'SpoopTool GE Tracker - https://github.com/spooptool';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

async function fetchFromWiki(route, params) {
  const qs = params.toString();
  const url = qs ? `${GE_PRICES_BASE}/${route}?${qs}` : `${GE_PRICES_BASE}/${route}`;
  const resp = await fetch(url, { headers: { 'User-Agent': GE_USER_AGENT } });
  if (!resp.ok) throw new Error('Wiki API ' + resp.status);
  return resp.json();
}

async function handleGeProxy(req, res, sql) {
  const route = (req.query.route || 'latest').toString().trim().toLowerCase();
  const allowed = ['latest', 'mapping', 'init', '5m', '1h', 'timeseries', 'sync'];
  if (!allowed.includes(route)) {
    return res.status(400).json({ error: 'Invalid route. Use: latest, mapping, init, 5m, 1h, timeseries, sync' });
  }
  if (route === 'init') {
    try {
      let mapData = null;
      let latestData = null;
      if (sql) {
        try {
          const mapRows = await sql`SELECT item_id, name, "limit", value, members FROM ge_items ORDER BY item_id`;
          if (mapRows.length > 0) mapData = mapRows.map((r) => ({ id: r.item_id, name: r.name, limit: r.limit, value: r.value, members: r.members }));
        } catch (_) {}
        try {
          const priceRows = await sql`SELECT item_id, high, low, at FROM ge_item_prices`;
          if (priceRows.length > 0) {
            const atMs = (d) => d && d.getTime ? d.getTime() : 0;
            latestData = {};
            priceRows.forEach((r) => {
              latestData[String(r.item_id)] = { high: r.high != null ? Number(r.high) : null, low: r.low != null ? Number(r.low) : null, highTime: atMs(r.at), lowTime: atMs(r.at) };
            });
          }
        } catch (_) {}
      }
      if (!mapData || !latestData || Object.keys(latestData).length === 0) {
        const [wikiMap, wikiLatest] = await Promise.all([fetchFromWiki('mapping', new URLSearchParams()), fetchFromWiki('latest', new URLSearchParams())]);
        mapData = Array.isArray(wikiMap) ? wikiMap : mapData;
        let rawLatest = wikiLatest && typeof wikiLatest === 'object' && !Array.isArray(wikiLatest) ? wikiLatest : latestData;
        if (rawLatest && typeof rawLatest === 'object') {
          const keys = Object.keys(rawLatest);
          if (keys.length === 1 && typeof rawLatest[keys[0]] === 'object' && rawLatest[keys[0]] !== null && !Array.isArray(rawLatest[keys[0]])) {
            latestData = rawLatest[keys[0]];
          } else {
            latestData = rawLatest;
          }
        } else {
          latestData = latestData || {};
        }
      }
      let volume1h = {};
      try {
        const raw1h = await fetchFromWiki('1h', new URLSearchParams());
        const dataWrap = raw1h && typeof raw1h === 'object' && raw1h.data ? raw1h.data : raw1h;
        if (dataWrap && typeof dataWrap === 'object' && !Array.isArray(dataWrap)) {
          for (const [itemId, v] of Object.entries(dataWrap)) {
            if (v && typeof v === 'object' && /^\d+$/.test(itemId)) {
              const hv = v.highPriceVolume != null ? Number(v.highPriceVolume) : 0;
              const lv = v.lowPriceVolume != null ? Number(v.lowPriceVolume) : 0;
              volume1h[itemId] = hv + lv;
            }
          }
        }
      } catch (_) {}
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ mapping: mapData || [], latest: latestData || {}, volume1h });
    } catch (err) {
      console.error('GE init', err);
      return res.status(502).json({ error: 'Failed to load GE data' });
    }
  }
  if (route === 'sync') {
    if (!sql) return res.status(500).json({ error: 'Database required for sync' });
    const secret = (req.query.secret || '').trim();
    const want = (process.env.GE_SYNC_SECRET || '').trim();
    if (want && secret !== want) return res.status(401).json({ error: 'Invalid sync secret' });
    try {
      const [mapData, latestData] = await Promise.all([
        fetchFromWiki('mapping', new URLSearchParams()),
        fetchFromWiki('latest', new URLSearchParams()),
      ]);
      let savedPrices = 0;
      let savedItems = 0;
      if (latestData && typeof latestData === 'object' && !Array.isArray(latestData)) {
        const now = new Date();
        for (const k of Object.keys(latestData).filter((x) => /^\d+$/.test(x))) {
          try {
            await sql`INSERT INTO ge_item_prices (item_id, high, low, at) VALUES (${parseInt(k, 10)}, ${latestData[k].high}, ${latestData[k].low}, ${now})
              ON CONFLICT (item_id) DO UPDATE SET high = EXCLUDED.high, low = EXCLUDED.low, at = EXCLUDED.at`;
            savedPrices++;
          } catch (_) { /* table missing */ }
        }
      }
      if (Array.isArray(mapData) && mapData.length > 0) {
        for (const e of mapData) {
          try {
            await sql`INSERT INTO ge_items (item_id, name, "limit", value, members, at) VALUES (${e.id}, ${(e.name || '').toString().substring(0, 255)}, ${e.limit != null ? e.limit : null}, ${e.value != null ? e.value : null}, ${e.members === true}, NOW())
              ON CONFLICT (item_id) DO UPDATE SET name = EXCLUDED.name, "limit" = EXCLUDED."limit", value = EXCLUDED.value, members = EXCLUDED.members, at = NOW()`;
            savedItems++;
          } catch (_) { /* table missing */ }
        }
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, savedPrices, savedItems });
    } catch (err) {
      console.error('GE sync', err);
      return res.status(502).json({ error: 'Sync failed: ' + (err.message || '') });
    }
  }
  const id = (req.query.id || '').toString().trim();
  const timestep = (req.query.timestep || '1h').toString().trim();
  const timestamp = (req.query.timestamp || '').toString().trim();
  const params = new URLSearchParams();
  if (id) params.set('id', id);
  if (timestep && route === 'timeseries') params.set('timestep', timestep);
  if (timestamp && (route === '5m' || route === '1h')) params.set('timestamp', timestamp);

  if (route === 'latest' && sql) {
    try {
      const rows = await sql`SELECT item_id, high, low, at FROM ge_item_prices`;
      if (rows.length > 0) {
        const out = {};
        const atMs = (d) => d && d.getTime ? d.getTime() : 0;
        rows.forEach((r) => {
          out[String(r.item_id)] = {
            high: r.high != null ? Number(r.high) : null,
            low: r.low != null ? Number(r.low) : null,
            highTime: atMs(r.at),
            lowTime: atMs(r.at),
          };
        });
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        return res.status(200).json(out);
      }
    } catch (dbErr) {
      if (dbErr && !(dbErr.message || '').includes('ge_item_prices')) console.error('GE DB read latest', dbErr.message);
    }
  }

  if (route === 'mapping' && sql) {
    try {
      const rows = await sql`SELECT item_id, name, "limit", value, members FROM ge_items ORDER BY item_id`;
      if (rows.length > 0) {
        const out = rows.map((r) => ({
          id: r.item_id,
          name: r.name,
          limit: r.limit != null ? r.limit : null,
          value: r.value != null ? r.value : null,
          members: r.members,
        }));
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        return res.status(200).json(out);
      }
    } catch (dbErr) {
      if (dbErr && !(dbErr.message || '').includes('ge_items')) console.error('GE DB read mapping', dbErr.message);
    }
  }

  try {
    const data = await fetchFromWiki(route, params);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (err) {
    console.error('GE proxy', err);
    return res.status(502).json({ error: 'Failed to fetch GE prices' });
  }
}

function xpFromData(data) {
  if (!data || !data.skills || !data.skills.overall) return 0;
  const x = data.skills.overall.xp;
  return x != null ? Number(x) : 0;
}

function totalBossKcFromData(data) {
  if (!data || !data.bosses) return 0;
  let sum = 0;
  for (const b of Object.values(data.bosses)) {
    if (b && typeof b.count === 'number') sum += b.count;
  }
  return sum;
}

const WEEKLY_WINNERS_WEEKS = 52;

async function handleWeeklyWinners(sql, res) {
  const weeksParam = WEEKLY_WINNERS_WEEKS;
  const daysBack = weeksParam * 7;
  const chars = await sql`SELECT id, username FROM characters ORDER BY id ASC`;
  const idToUsername = {};
  chars.forEach((c) => { idToUsername[c.id] = c.username; });

  const snapshotRows = await sql`
    SELECT character_id, at, data
    FROM character_snapshots
    WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - make_interval(days => ${daysBack})
      AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
    ORDER BY at ASC
  `;
  const lootRows = await sql`
    SELECT LOWER(TRIM(username)) AS key_username, MAX(TRIM(username)) AS username, at, total_value_gp
    FROM loot_drops
    WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day') - make_interval(days => ${daysBack})
      AND at < (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
  `;

  const weekEndRow = await sql`SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day') AS week_end`;
  const weekEnd = weekEndRow.length && weekEndRow[0].week_end ? new Date(weekEndRow[0].week_end) : new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const xpWinners = [];
  const bossWinners = [];
  const lootWinners = [];

  for (let i = 0; i < weeksParam; i++) {
    const windowStart = new Date(weekEnd.getTime() - (i + 1) * msPerWeek);
    const windowEnd = new Date(weekEnd.getTime() - i * msPerWeek);

    const snapInWindow = (snapshotRows || []).filter((r) => {
      const t = new Date(r.at).getTime();
      return t >= windowStart.getTime() && t < windowEnd.getTime();
    });
    const firstByChar = {};
    const lastByChar = {};
    for (const r of snapInWindow) {
      const cid = r.character_id;
      if (!firstByChar[cid]) firstByChar[cid] = r;
      lastByChar[cid] = r;
    }
    const deltas = chars.map((c) => {
      const first = firstByChar[c.id];
      const last = lastByChar[c.id];
      if (!first || !last) return { username: c.username, xpDelta: 0, bossKcDelta: 0 };
      const firstData = first.data || {};
      const lastData = last.data || {};
      return {
        username: c.username,
        xpDelta: Math.max(0, xpFromData(lastData) - xpFromData(firstData)),
        bossKcDelta: Math.max(0, totalBossKcFromData(lastData) - totalBossKcFromData(firstData)),
      };
    });
    const xpWinner = deltas.filter((d) => d.xpDelta > 0).sort((a, b) => b.xpDelta - a.xpDelta)[0];
    const bossWinner = deltas.filter((d) => d.bossKcDelta > 0).sort((a, b) => b.bossKcDelta - a.bossKcDelta)[0];
    xpWinners.push(xpWinner ? xpWinner.username : null);
    bossWinners.push(bossWinner ? bossWinner.username : null);

    const lootInWindow = (lootRows || []).filter((r) => {
      const t = new Date(r.at).getTime();
      return t >= windowStart.getTime() && t < windowEnd.getTime();
    });
    const lootByUser = {};
    for (const r of lootInWindow) {
      const u = (r.key_username || r.username || '').trim();
      if (!u) continue;
      if (!lootByUser[u]) lootByUser[u] = { username: (r.username || u).trim(), total: 0 };
      lootByUser[u].total += Number(r.total_value_gp) || 0;
    }
    const lootSorted = Object.values(lootByUser).filter((o) => o.total > 0).sort((a, b) => b.total - a.total);
    lootWinners.push(lootSorted[0] ? lootSorted[0].username : null);
  }

  const firstNonNull = (arr) => (arr && Array.isArray(arr) ? arr.find((x) => x != null && String(x).trim() !== '') : null) ?? null;
  res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
  return res.status(200).json({
    xp: xpWinners,
    boss: bossWinners,
    loot: lootWinners,
    xpLatest: firstNonNull(xpWinners),
    bossLatest: firstNonNull(bossWinners),
    lootLatest: firstNonNull(lootWinners),
  });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const path = (req.query.path || '').trim();
  if (path === 'ge') {
    let sql = null;
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
      try { sql = neon(process.env.DATABASE_URL); } catch (_) {}
    }
    return await handleGeProxy(req, res, sql);
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  if (path === 'weekly-winners') {
    try {
      const sql = neon(process.env.DATABASE_URL);
      return await handleWeeklyWinners(sql, res);
    } catch (err) {
      console.error('GET /api/weekly-winners', err);
      return res.status(500).json({ error: 'Failed to load weekly winners' });
    }
  }

  const today = req.query.today === '1' || req.query.today === 'true';
  const week = req.query.week === '1' || req.query.week === 'true';
  const month = req.query.month === '1' || req.query.month === 'true';
  const hours = (today || week || month) ? null : Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));
  const bucketMinutes = 15;

  try {
    const sql = neon(process.env.DATABASE_URL);
    const now = new Date();
    let start;
    let rows;
    if (today) {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      rows = await sql`
        SELECT character_id, at,
          (data->'skills'->'overall'->>'xp')::bigint AS xp,
          (SELECT COALESCE(SUM((elem->'count')::int), 0) FROM jsonb_each(data->'bosses') AS t(k, elem)) AS boss_kc
        FROM character_snapshots
        WHERE at >= date_trunc('day', NOW())
        ORDER BY at ASC
      `;
    } else if (week) {
      rows = await sql`
        SELECT character_id, at,
          (data->'skills'->'overall'->>'xp')::bigint AS xp,
          (SELECT COALESCE(SUM((elem->'count')::int), 0) FROM jsonb_each(data->'bosses') AS t(k, elem)) AS boss_kc
        FROM character_snapshots
        WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
        ORDER BY at ASC
      `;
      const startRow = await sql`SELECT (date_trunc('week', NOW() + interval '1 day') - interval '1 day') AS t`;
      start = startRow.length && startRow[0].t ? new Date(startRow[0].t) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (month) {
      const startRow = await sql`SELECT date_trunc('month', NOW()) AS t`;
      start = startRow.length && startRow[0].t ? new Date(startRow[0].t) : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      rows = await sql`
        SELECT character_id, at,
          (data->'skills'->'overall'->>'xp')::bigint AS xp,
          (SELECT COALESCE(SUM((elem->'count')::int), 0) FROM jsonb_each(data->'bosses') AS t(k, elem)) AS boss_kc
        FROM character_snapshots
        WHERE at >= date_trunc('month', NOW())
        ORDER BY at ASC
      `;
    } else {
      const fetchHours = hours + 1;
      start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      rows = await sql`
        SELECT character_id, at,
          (data->'skills'->'overall'->>'xp')::bigint AS xp,
          (SELECT COALESCE(SUM((elem->'count')::int), 0) FROM jsonb_each(data->'bosses') AS t(k, elem)) AS boss_kc
        FROM character_snapshots
        WHERE at >= NOW() - make_interval(hours => ${fetchHours})
        ORDER BY at ASC
      `;
    }

    const buckets = [];
    for (let t = new Date(start); t <= now; t.setMinutes(t.getMinutes() + bucketMinutes)) {
      buckets.push(new Date(t.getTime()));
    }
    if (buckets.length === 0) buckets.push(new Date(start));

    const characterIds = [...new Set(rows.map((r) => r.character_id))];
    const history = buckets.map((bucketEnd) => {
      let totalXp = 0;
      let totalBossKc = 0;
      for (const cid of characterIds) {
        const characterRows = rows.filter((r) => r.character_id === cid && new Date(r.at) <= bucketEnd);
        if (characterRows.length === 0) continue;
        const latest = characterRows[characterRows.length - 1];
        totalXp += Number(latest.xp) || 0;
        totalBossKc += Number(latest.boss_kc) || 0;
      }
      return {
        at: bucketEnd.toISOString(),
        totalXp,
        totalBossKc,
      };
    });

    const periodFilter = today || week || month ? null : (hours === 24 || hours === 168 ? hours : 24);
    let lootHistory = [];
    try {
      const lootBuckets = today
        ? await sql`
            SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
            FROM loot_drops
            WHERE at >= date_trunc('day', NOW())
            GROUP BY date_trunc('hour', at)
            ORDER BY bucket ASC
          `
        : week
          ? await sql`
              SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
              FROM loot_drops
              WHERE at >= (date_trunc('week', NOW() + interval '1 day') - interval '1 day')
              GROUP BY date_trunc('hour', at)
              ORDER BY bucket ASC
            `
          : month
            ? await sql`
                SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
                FROM loot_drops
                WHERE at >= date_trunc('month', NOW())
                GROUP BY date_trunc('hour', at)
                ORDER BY bucket ASC
              `
            : await sql`
                SELECT date_trunc('hour', at) AS bucket, SUM(total_value_gp)::bigint AS value
                FROM loot_drops
                WHERE at >= NOW() - make_interval(hours => ${periodFilter})
                GROUP BY date_trunc('hour', at)
                ORDER BY bucket ASC
              `;
      let cum = 0;
      lootHistory = lootBuckets.map((r) => {
        cum += Number(r.value || 0);
        return { at: r.bucket, value: cum };
      });
    } catch (lootErr) {
      console.error('aggregate-history lootHistory', lootErr);
    }

    let cronHealth = { ok: false, lastRunAt: null };
    try {
      const heartbeatRows = await sql`SELECT last_run_at FROM cron_heartbeat WHERE job_name = 'snapshot' LIMIT 1`;
      const lastRunAt = heartbeatRows.length ? heartbeatRows[0].last_run_at : null;
      const staleMs = 2.5 * 60 * 60 * 1000;
      const atMs = lastRunAt ? new Date(lastRunAt).getTime() : 0;
      cronHealth = {
        ok: atMs > 0 && Date.now() - atMs < staleMs,
        lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
      };
    } catch (_) {
      /* cron_heartbeat table may not exist */
    }

    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json({ history, lootHistory, cronHealth });
  } catch (err) {
    console.error('/api/aggregate-history', err);
    return res.status(500).json({ error: 'Failed to load aggregate history' });
  }
};
