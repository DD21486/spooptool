/**
 * GET /api/loot-webhook-url
 * Returns the full webhook URL for users to paste into Dink (Loot notifier).
 * Requires LOOT_WEBHOOK_SECRET to be set so the URL includes the secret.
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.LOOT_WEBHOOK_SECRET || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const base = host ? protocol + '://' + host : '';

  if (!base) {
    return res.status(500).json({ error: 'Could not determine base URL' });
  }

  const path = '/api/loot';
  const url = secret ? base + path + '?secret=' + encodeURIComponent(secret) : base + path;

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ url });
};
