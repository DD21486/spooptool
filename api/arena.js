const { load, save } = require('../lib/spoop/store');
const { advance, buildArenaTest, formatEt, nextArenaAfter, STARTER_NAME } = require('../lib/spoop/engine');
const { liveHeatFor } = require('../lib/spoop/liveHeat');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function worldNow() {
  const state = load();
  if (!state.useSim) {
    const live = await liveHeatFor(STARTER_NAME);
    advance(state, new Date(), live);
    save(state);
  }
  const now = new Date(state.clock);
  const next = nextArenaAfter(now);
  const last = state.lastArena || null;
  return {
    now: state.clock,
    clockLabel: formatEt(now),
    useSim: !!state.useSim,
    nextAt: next ? next.when.toISOString() : null,
    nextLabel: next ? formatEt(next.when) : null,
    last,
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await worldNow());
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = await readBody(req);
    const count = Math.max(2, Math.min(20, parseInt(body.count, 10) || 8));
    const seed = (Math.random() * 4294967296) >>> 0;
    return res.status(200).json(buildArenaTest(count, seed));
  } catch (err) {
    console.error('arena', err);
    return res.status(500).json({ error: 'Could not build the arena', detail: err.message || String(err) });
  }
};
