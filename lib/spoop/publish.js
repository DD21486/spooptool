const { postSpoopUpdates, postPkNotice, postArenaResult, postRaidBeat } = require('./discord');
const { claimArenaReminder, releaseArenaReminder, keepReminderMarks } = require('./store');

function isPk(entry) {
  return !!(entry && (entry.kind === 'pk-call' || entry.kind === 'pk-result'));
}

function isArenaPayout(entry) {
  if (entry && entry.kind === 'arena') return true;
  const text = entry && entry.text ? String(entry.text) : '';
  return text.includes('Spoopfight, place ') || text.includes('Tournament, place ');
}

async function claimAndPost(fightAt, mark, entry, post) {
  let claimed = false;
  try {
    claimed = await claimArenaReminder(fightAt, mark);
  } catch (err) {
    console.error('arena claim', err && err.message ? err.message : err);
    return false;
  }
  if (!claimed) return true;
  const ok = await post(entry);
  if (ok) return true;
  try {
    await releaseArenaReminder(fightAt, mark);
  } catch (err) {
    console.error('arena claim release', err && err.message ? err.message : err);
  }
  return false;
}

function resultReady(entry, now) {
  if (!entry || !entry.revealAt) return true;
  const at = new Date(entry.revealAt).getTime();
  if (!Number.isFinite(at)) return true;
  return at <= (now instanceof Date ? now.getTime() : Date.now());
}

async function publishPk(state) {
  if (!state) return false;
  let changed = false;
  if (state.pk && state.pk.needsPost && state.pk.text && state.pk.fightAt) {
    const posted = await claimAndPost(state.pk.fightAt, 'pk-call', {
      kind: 'pk-call',
      text: state.pk.text,
      staked: !!state.pk.staked,
      watch: state.pk.watch || '',
    }, postPkNotice);
    if (posted) {
      state.pk.needsPost = false;
      changed = true;
    }
  }
  const last = state.lastPk;
  if (last && last.needsPost && last.text && last.at && resultReady(last)) {
    const posted = await claimAndPost(last.at, 'pk-result', {
      kind: 'pk-result',
      text: last.text,
      staked: !!last.staked,
      watch: last.watch || '',
      winner: last.winner || '',
      loser: last.loser || '',
      stake: last.stake || 0,
      pot: last.pot || 0,
      winnerOdds: last.winnerOdds,
      winnerRecord: last.winnerRecord || null,
      loserRecord: last.loserRecord || null,
      winnerCombat: last.winnerCombat || 0,
      loserCombat: last.loserCombat || 0,
    }, postPkNotice);
    if (posted) {
      last.needsPost = false;
      changed = true;
    }
  }
  return changed;
}

function dueAt(iso, now) {
  const at = new Date(iso).getTime();
  return !Number.isFinite(at) || at <= now;
}

// Per-boss raid posts go out in order as their moment in the show passes. The claim mark keeps
// two syncs from sending the same one.
async function publishRaidBeats(last) {
  if (!last || last.kind !== 'raid' || !last.needsPost || !last.at || !Array.isArray(last.beats)) return false;
  let sent = Math.max(0, Number(last.beatsSent) || 0);
  const start = sent;
  while (sent < last.beats.length && dueAt(last.beats[sent].at, Date.now())) {
    const posted = await claimAndPost(last.at, 'raid-beat-' + sent, last.beats[sent], postRaidBeat);
    if (!posted) break;
    sent += 1;
  }
  last.beatsSent = sent;
  return sent > start;
}

function raidBeatsLeft(last) {
  return !!(last && last.kind === 'raid' && Array.isArray(last.beats) && (Number(last.beatsSent) || 0) < last.beats.length);
}

function nextArenaOnlyPostAt(state) {
  const last = state && state.lastArena;
  if (!last || !last.needsPost || !last.at) return null;
  if (raidBeatsLeft(last)) return last.beats[Number(last.beatsSent) || 0].at;
  return last.revealAt || last.at;
}

function nextDuelPostAt(state) {
  if (state && state.pk && state.pk.staked && state.pk.fightAt) return state.pk.fightAt;
  const last = state && state.lastPk;
  if (last && last.staked && last.needsPost && last.at) return last.revealAt || last.at;
  return null;
}

// When the next arena or duel post is due, for a caller that wants to come back right on time.
function nextArenaPostAt(state) {
  const times = [nextArenaOnlyPostAt(state), nextDuelPostAt(state)]
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return times[0] || null;
}

async function publishArena(state) {
  if (!state) return false;
  const last = state.lastArena;
  const beats = await publishRaidBeats(last);
  if (raidBeatsLeft(last)) return beats;
  if (!last || !last.needsPost || !last.text || !last.at || !resultReady(last)) return beats;
  const posted = await claimAndPost(last.at, 'arena-result', last, postArenaResult);
  if (posted) {
    last.needsPost = false;
    return true;
  }
  return beats;
}

const DISCORD_QUEUE_MAX = 160;

function queueEntry(entry) {
  const row = {
    name: (entry.name && String(entry.name).trim()) || 'Spoop',
    text: String((entry.discord || entry.text) || '').trim(),
    kind: entry.kind || '',
  };
  const icon = Number(entry.icon);
  if (icon > 0) row.icon = icon;
  if (Array.isArray(entry.stats) && entry.stats.length) row.stats = entry.stats;
  return row;
}

function queueKey(entry) {
  return entry.name + '\n' + entry.kind + '\n' + entry.text;
}

function enqueueDiscord(state, events) {
  if (!state) return;
  if (!Array.isArray(state.discordQueue)) state.discordQueue = [];
  const seen = new Set(state.discordQueue.map(queueKey));
  for (const entry of events || []) {
    if (!entry || isPk(entry) || isArenaPayout(entry)) continue;
    const next = queueEntry(entry);
    if (!next.text) continue;
    const key = queueKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    state.discordQueue.push(next);
  }
  if (state.discordQueue.length > DISCORD_QUEUE_MAX) {
    state.discordQueue.splice(0, state.discordQueue.length - DISCORD_QUEUE_MAX);
  }
}

// Pull the queue off the world before it is saved. The caller posts only after
// that save wins, so a second sync cannot send the same lines again.
function takeDiscordQueue(state, events) {
  enqueueDiscord(state, events);
  if (!state || !Array.isArray(state.discordQueue) || !state.discordQueue.length) return [];
  const claimed = state.discordQueue.slice();
  state.discordQueue = [];
  return claimed;
}

async function deliverDiscord(state, claimed) {
  if (!claimed || !claimed.length) return false;
  const sent = await postSpoopUpdates(claimed, state);
  if (sent < claimed.length) {
    const leftover = claimed.slice(Math.max(0, sent));
    if (!Array.isArray(state.discordQueue)) state.discordQueue = [];
    const seen = new Set(state.discordQueue.map(queueKey));
    const put = [];
    for (const entry of leftover) {
      const key = queueKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      put.push(entry);
    }
    state.discordQueue = put.concat(state.discordQueue);
    if (state.discordQueue.length > DISCORD_QUEUE_MAX) {
      state.discordQueue.splice(0, state.discordQueue.length - DISCORD_QUEUE_MAX);
    }
  }
  return sent > 0;
}

async function flushDiscord(state) {
  if (!state || !Array.isArray(state.discordQueue) || !state.discordQueue.length) return false;
  const sent = await postSpoopUpdates(state.discordQueue, state);
  if (sent > 0) state.discordQueue.splice(0, sent);
  return sent > 0;
}

async function publishEvents(events, state) {
  enqueueDiscord(state, events);
  const flushed = await flushDiscord(state);
  const pkChanged = await publishPk(state);
  const arenaChanged = await publishArena(state);
  if (pkChanged || arenaChanged) keepReminderMarks(state);
  return flushed || pkChanged || arenaChanged;
}

module.exports = { publishEvents, publishPk, publishArena, nextArenaPostAt, enqueueDiscord, flushDiscord, takeDiscordQueue, deliverDiscord };
