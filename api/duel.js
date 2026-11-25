const { load, loadReplays, attachReplays } = require('../lib/spoop/store');
const { presentDuelWatch } = require('../lib/spoop/engine');
const { syncPk } = require('../lib/spoop/pk-settle');

function tokenOf(req) {
  const raw = req.query && req.query.w != null ? req.query.w : '';
  return String(raw || '').trim().slice(0, 40);
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = tokenOf(req);
  if (!/^[a-z0-9]+$/i.test(token)) return res.status(404).json({ error: 'That duel is not here.' });
  try {
    let state = await load();
    const pending = state && state.pk && state.pk.staked && state.pk.watch === token ? state.pk : null;
    if (pending && new Date(pending.fightAt) <= new Date()) {
      await syncPk(new Date());
      state = await load();
    }
    attachReplays(state, await loadReplays());
    const view = presentDuelWatch(state, token, new Date());
    if (!view) return res.status(404).json({ error: 'That duel is not here.' });
    view.serverNow = new Date().toISOString();
    return res.status(200).json(view);
  } catch (err) {
    console.error('duel watch', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Could not load the duel' });
  }
}

module.exports = handler;
