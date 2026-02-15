const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not set. Create a Neon project and add DATABASE_URL in Vercel env.' });
  }
  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT id, username, game_mode, added_at FROM characters ORDER BY added_at ASC`;
      return res.status(200).json(rows);
    } catch (err) {
      console.error('GET /api/characters', err);
      return res.status(500).json({ error: 'Failed to load characters' });
    }
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    const username = (body.username || '').trim().replace(/\s+/g, ' ');
    if (!username || username.length > 12) {
      return res.status(400).json({ error: 'Username required (max 12 characters)' });
    }

    const { getStats } = require('osrs-json-hiscores');
    try {
      const player = await getStats(username);
      const mode = (player && player.mode) ? player.mode : 'main';
      await sql`INSERT INTO characters (username, game_mode) VALUES (${username}, ${mode}) ON CONFLICT (username) DO UPDATE SET game_mode = ${mode}`;
      const rows = await sql`SELECT id, username, game_mode, added_at FROM characters ORDER BY added_at ASC`;
      return res.status(201).json({ characters: rows, added: username });
    } catch (err) {
      if (err.message && (err.message.includes('not found') || err.message.includes('404'))) {
        return res.status(404).json({ error: 'Character not found on Hiscores' });
      }
      console.error('POST /api/characters', err);
      return res.status(500).json({ error: 'Failed to add character' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
