/**
 * GET /api/loot-icon?id=123
 * Proxies OSRS item sprite so the browser gets same-origin image (avoids CORB).
 * Tries Chisel URLs; if not found, returns 1x1 transparent PNG so img doesn't 404.
 */

const SPRITE_URLS = [
  (id) => 'https://chisel.weirdgloop.org/static/img/osrs-sprite/' + id + '.png',
  (id) => 'https://chisel.weirdgloop.org/rsc/config/config18.jag/sprites/' + id + '.png',
];

const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const id = req.query.id != null ? parseInt(req.query.id, 10) : NaN;
  if (Number.isNaN(id) || id < 0) return res.status(400).end();

  for (const urlFn of SPRITE_URLS) {
    try {
      const url = urlFn(id);
      const resp = await fetch(url, { headers: { 'Accept': 'image/png, image/*' } });
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
};
