const { postSpoopUpdates, postPkNotice } = require('./discord');
const { claimArenaReminder, releaseArenaReminder, keepReminderMarks } = require('./store');

function isPk(entry) {
  return !!(entry && (entry.kind === 'pk-call' || entry.kind === 'pk-result'));
}

async function claimAndPost(fightAt, mark, entry) {
  let claimed = false;
  try {
    claimed = await claimArenaReminder(fightAt, mark);
  } catch (err) {
    console.error('pk claim', err && err.message ? err.message : err);
    return false;
  }
  if (!claimed) return true;
  const ok = await postPkNotice(entry);
  if (ok) return true;
  try {
    await releaseArenaReminder(fightAt, mark);
  } catch (err) {
    console.error('pk claim release', err && err.message ? err.message : err);
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
    });
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
    });
    if (posted) {
      last.needsPost = false;
      changed = true;
    }
  }
  return changed;
}

async function publishEvents(events, state) {
  const rest = [];
  for (const entry of events || []) {
    if (!isPk(entry)) rest.push(entry);
  }
  await postSpoopUpdates(rest, state);
  const changed = await publishPk(state);
  if (changed) keepReminderMarks(state);
  return changed;
}

module.exports = { publishEvents, publishPk };
