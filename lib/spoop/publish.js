const { postSpoopUpdates, postPkNotice, postArenaResult } = require('./discord');
const { claimArenaReminder, releaseArenaReminder, keepReminderMarks } = require('./store');

function isPk(entry) {
  return !!(entry && (entry.kind === 'pk-call' || entry.kind === 'pk-result'));
}

function isArenaPayout(entry) {
  const text = entry && entry.text ? String(entry.text) : '';
  return text.includes('Spoopfight, place ');
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

async function publishPk(state) {
  if (!state) return false;
  let changed = false;
  if (state.pk && state.pk.needsPost && state.pk.text && state.pk.fightAt) {
    const posted = await claimAndPost(state.pk.fightAt, 'pk-call', {
      kind: 'pk-call',
      text: state.pk.text,
    }, postPkNotice);
    if (posted) {
      state.pk.needsPost = false;
      changed = true;
    }
  }
  const last = state.lastPk;
  if (last && last.needsPost && last.text && last.at) {
    const posted = await claimAndPost(last.at, 'pk-result', {
      kind: 'pk-result',
      text: last.text,
    }, postPkNotice);
    if (posted) {
      last.needsPost = false;
      changed = true;
    }
  }
  return changed;
}

async function publishArena(state) {
  if (!state) return false;
  const last = state.lastArena;
  if (!last || !last.needsPost || !last.text || !last.at) return false;
  const posted = await claimAndPost(last.at, 'arena-result', { text: last.text }, postArenaResult);
  if (posted) {
    last.needsPost = false;
    return true;
  }
  return false;
}

async function publishEvents(events, state) {
  const rest = [];
  for (const entry of events || []) {
    if (!isPk(entry) && !isArenaPayout(entry)) rest.push(entry);
  }
  await postSpoopUpdates(rest, state);
  const pkChanged = await publishPk(state);
  const arenaChanged = await publishArena(state);
  if (pkChanged || arenaChanged) keepReminderMarks(state);
  return pkChanged || arenaChanged;
}

module.exports = { publishEvents, publishPk, publishArena };
