const { load, save, keepReminderMarks } = require('../lib/spoop/store');
const { advance, openCrate, applyWearRules, presentWorld, nextEventAfter, STARTER_NAME, createWorld, hashString, mulberry32, arenaSnapshot, testArena } = require('../lib/spoop/engine');
const { publishEvents, publishArena, takeDiscordQueue, deliverDiscord } = require('../lib/spoop/publish');
const { sendDueArenaReminders } = require('../lib/spoop/arena-reminders');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function debugAllowed(req) {
  const host = String(req.headers.host || '');
  const name = host.split(':')[0];
  return name === 'localhost' || name === '127.0.0.1' || name === '::1';
}

let chain = Promise.resolve();
function locked(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function spoopOf(state, name) {
  if (name && state.spoops[name]) return state.spoops[name];
  if (name) {
    const wanted = String(name).toLowerCase();
    const found = Object.values(state.spoops).find((spoop) =>
      String(spoop.name || '').toLowerCase() === wanted ||
      String(spoop.owner || '').toLowerCase() === wanted
    );
    if (found) return found;
  }
  return state.spoops[STARTER_NAME];
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function happenedLines(events) {
  return (events || []).map((event) => (event && event.name ? event.name + ': ' + event.text : String(event || '')));
}

async function syncWorld(debug) {
  try {
    await sendDueArenaReminders(new Date());
  } catch (err) {
    console.error('arena reminder', err && err.message ? err.message : err);
  }
  const state = await load();
  let expected = state.clock;
  if (!state.useSim && state.lastArena && state.lastArena.needsPost && state.lastArena.at) {
    const due = new Date(state.lastArena.at);
    if (due <= new Date(state.clock)) {
      if (await publishArena(state)) {
        keepReminderMarks(state);
        if (await save(state, expected)) expected = state.clock;
      }
    }
  }
  let events = [];
  for (const spoop of Object.values(state.spoops)) {
    for (const text of applyWearRules(spoop, new Date(state.clock))) {
      events.push({ name: spoop.name, text });
    }
  }
  const changedGear = events.length > 0;
  if (!state.useSim) {
    events = events.concat(advance(state, new Date()));
    const claimed = takeDiscordQueue(state, events);
    const saved = await save(state, expected);
    if (!saved) return presentWorld(await load(), debug, []);
    const delivered = await deliverDiscord(state, claimed);
    const published = await publishEvents([], state);
    if (published || delivered || (state.discordQueue && state.discordQueue.length)) {
      await save(state, state.clock);
    }
  } else if (changedGear) {
    await save(state, expected);
  }
  return presentWorld(state, debug, happenedLines(events));
}

async function handlePost(req) {
  const body = await readBody(req);
  const action = body.action;
  if (action === 'arena-test') {
    const state = await load();
    const seed = String(body.seed || '').trim().slice(0, 80) || String(Date.now());
    const names = Array.isArray(body.names) ? body.names.slice(0, 16) : [];
    const result = testArena(state, names, seed, body.formation);
    if (result.error) return { status: 400, payload: { error: result.error } };
    return { status: 200, payload: result };
  }
  const state = await load();
  const expected = state.clock;
  const debug = debugAllowed(req);
  const spoop = spoopOf(state, body.name || STARTER_NAME);
  if (!spoop) return { status: 404, payload: { error: 'No spoop by that name' } };
  const wearNotes = applyWearRules(spoop, new Date(state.clock));
  if (wearNotes.length) await save(state, expected);

  if (action === 'spend') {
    const now = new Date(state.clock);
    const rng = mulberry32(hashString(`${spoop.name}|crate|${now.toISOString()}|${spoop.gold}|${body.crate}|${Math.random()}`));
    const result = openCrate(spoop, body.crate, now, rng);
    if (!result.ok) return { status: 400, payload: { error: result.error } };
    const saved = await save(state, state.clock);
    if (saved && await publishEvents([{ name: spoop.name, text: result.text }], state)) {
      await save(state, state.clock);
    }
    const payload = presentWorld(state, debug, [result.text]);
    payload.roll = result.roll;
    return { status: 200, payload };
  }

  if (action === 'debug') {
    if (!debug) return { status: 403, payload: { error: 'Debug is only available on localhost' } };
    let happened = [];
    if (body.op === 'reset') {
      const fresh = createWorld(new Date());
      await save(fresh);
      return { status: 200, payload: presentWorld(fresh, true, ['Reset SpoopSpooply.']) };
    }
    if (body.op === 'real') {
      state.useSim = false;
      const fromClock = state.clock;
      happened = advance(state, new Date());
      const saved = await save(state, fromClock);
      if (saved && await publishEvents(happened, state)) await save(state, state.clock);
      return { status: 200, payload: presentWorld(state, true, happenedLines(happened)) };
    }
    state.useSim = true;
    const fromClock = state.clock;
    const from = new Date(fromClock);
    let target = null;
    if (body.op === 'next') {
      const ev = nextEventAfter(from, state);
      if (!ev) return { status: 400, payload: { error: 'No upcoming event' } };
      target = ev.when;
    } else if (body.op === 'hours') {
      const hours = Math.max(1, Math.min(48, parseInt(body.hours, 10) || 4));
      target = new Date(from.getTime() + hours * 3600 * 1000);
    } else if (body.op === 'days') {
      const days = Math.max(1, Math.min(60, parseInt(body.days, 10) || 1));
      target = new Date(from.getTime() + days * 24 * 3600 * 1000);
    } else {
      return { status: 400, payload: { error: 'Unknown debug op' } };
    }
    happened = advance(state, target);
    await save(state, fromClock);
    return { status: 200, payload: presentWorld(state, true, happenedLines(happened)) };
  }

  return { status: 400, payload: { error: 'Unknown action' } };
}

const SPRITE_URLS = [
  (id) => 'https://chisel.weirdgloop.org/static/img/osrs-sprite/' + id + '.png',
];

async function proxySprite(req, res) {
  const id = req.query.id != null ? parseInt(req.query.id, 10) : NaN;
  if (Number.isNaN(id) || id < 0) return res.status(400).end();
  for (const urlFn of SPRITE_URLS) {
    try {
      const resp = await fetch(urlFn(id), { headers: { Accept: 'image/png, image/*' } });
      if (!resp.ok) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).end(buf);
    } catch (_) {
      continue;
    }
  }
  return res.status(404).end();
}

async function worldNow() {
  await syncWorld(false);
  const state = await load();
  return arenaSnapshot(state);
}

/** GET /api/arena (rewrite → ?path=arena). Same function as /api/spoops. */
async function handleArena(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    return res.status(200).json(await worldNow());
  } catch (err) {
    console.error('arena', err);
    return res.status(500).json({ error: 'Could not load the Spoopfight', detail: err.message || String(err) });
  }
}

async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if ((req.query.path || '') === 'arena') return handleArena(req, res);
  try {
    if (req.method === 'GET' && (req.query.icon === '1' || req.query.icon === 'true')) {
      return proxySprite(req, res);
    }
    if (req.method === 'GET') {
      const payload = await locked(() => syncWorld(debugAllowed(req)));
      return res.status(200).json(payload);
    }
    if (req.method === 'POST') {
      const result = await locked(() => handlePost(req));
      return res.status(result.status).json(result.payload);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('spoops', err);
    return res.status(500).json({ error: 'Server error', detail: err.message || String(err) });
  }
}

module.exports = handler;
module.exports.syncWorld = syncWorld;
