const { getStats } = require('osrs-json-hiscores');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const name = (req.query.name || req.query.username || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const player = await getStats(name);
    if (!player || !player.main) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const { xpToNextLevel } = require('../../lib/xpTable');
    const skills = player.main.skills || {};
    const withXpToNext = {};
    for (const [key, data] of Object.entries(skills)) {
      const rawLevel = data.level != null ? parseInt(data.level, 10) : NaN;
      const rawXp = data.xp != null ? data.xp : data.experience;
      const level = Number.isNaN(rawLevel) || rawLevel < 0 ? 1 : Math.min(99, rawLevel);
      const xp = Math.max(0, parseInt(rawXp, 10) || 0);
      const xpToNext = key === 'overall' ? null : xpToNextLevel(level, xp);
      withXpToNext[key] = { ...data, xpToNext };
    }
    // Library returns bosses as { rank, score }; we normalize to { rank, count } for the frontend
    const rawBosses = player.main.bosses || {};
    const bosses = {};
    for (const [key, b] of Object.entries(rawBosses)) {
      if (b && typeof b === 'object') {
        const score = b.score != null ? b.score : (b.count != null ? b.count : b.kc);
        const count = typeof score === 'number' && score >= 0 ? score : 0;
        bosses[key] = { rank: b.rank >= 0 ? b.rank : null, count };
      }
    }

    const out = {
      name: player.name,
      mode: player.mode || 'main',
      skills: withXpToNext,
      bosses,
      activities: player.main.clues || {},
    };
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=120');
    return res.status(200).json(out);
  } catch (err) {
    if (err.message && (err.message.includes('not found') || err.message.includes('404') || err.message.includes('404'))) {
      return res.status(404).json({ error: 'Player not found on Hiscores' });
    }
    console.error('GET /api/player/[name]', err);
    return res.status(500).json({ error: 'Hiscores request failed' });
  }
};
