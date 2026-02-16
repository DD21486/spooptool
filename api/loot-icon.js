/**
 * GET /api/loot-icon?id=123
 * Proxies OSRS item sprite from Chisel so the browser gets same-origin image (avoids CORB).
 */

const CHISEL_SPRITE = 'https://chisel.weirdgloop.org/rsc/config/config18.jag/sprites';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const id = req.query.id != null ? parseInt(req.query.id, 10) : NaN;
  if (Number.isNaN(id) || id < 0) return res.status(400).end();

  try {
    const url = CHISEL_SPRITE + '/' + id + '.png';
    const resp = await fetch(url, { headers: { 'Accept': 'image/png' } });
    if (!resp.ok) {
      res.status(404).end();
      return;
    }
    const buf = await resp.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(Buffer.from(buf));
  } catch (err) {
    console.error('/api/loot-icon', err);
    res.status(502).end();
  }
};
