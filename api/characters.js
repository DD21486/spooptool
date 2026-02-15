const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send500(res, detail) {
  return res.status(500).json({ error: 'Server error', detail: detail || 'Unknown error' });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
      return send500(res, 'DATABASE_URL is not set. In Vercel: Settings → Environment Variables → add DATABASE_URL with your Neon connection string, then redeploy.');
    }

    let sql;
    try {
      sql = neon(process.env.DATABASE_URL);
    } catch (e) {
      return send500(res, 'Invalid DATABASE_URL: ' + (e.message || String(e)));
    }

    if (req.method === 'GET') {
      const rows = await sql`SELECT id, username, game_mode, added_at FROM characters ORDER BY added_at ASC`;
      return res.status(200).json(rows);
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
      let player;
      try {
        player = await getStats(username);
      } catch (e) {
        if ((e.message || '').toLowerCase().includes('not found') || (e.message || '').includes('404')) {
          return res.status(404).json({ error: 'Character not found on Hiscores', detail: 'Check the username and try again.' });
        }
        throw e;
      }
      const mode = (player && player.mode) ? player.mode : 'main';
      await sql`INSERT INTO characters (username, game_mode) VALUES (${username}, ${mode}) ON CONFLICT (username) DO UPDATE SET game_mode = ${mode}`;
      const rows = await sql`SELECT id, username, game_mode, added_at FROM characters ORDER BY added_at ASC`;
      return res.status(201).json({ characters: rows, added: username });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('/api/characters', err);
    const msg = (err.message || String(err)).replace(/postgresql:\/\/[^@]+@/gi, '***@');
    const detail = msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('characters')
      ? 'Characters table missing. In Neon SQL Editor run the contents of sql/schema.sql to create the table.'
      : msg;
    return send500(res, detail);
  }
};
