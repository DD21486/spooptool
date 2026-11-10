/**
 * Discord pings before the 9pm ET Spoopfight. A mark stays due until the
 * fight starts, and a claim keeps two callers from posting it twice.
 */

const { nextArenaAfter } = require('./engine');
const { load, claimArenaReminder, releaseArenaReminder } = require('./store');
const { postArenaReminder } = require('./discord');

const ARENA_REMINDERS = [
  { id: '60', ms: 60 * 60 * 1000, label: '1 hour' },
  { id: '30', ms: 30 * 60 * 1000, label: '30 minutes' },
  { id: '5', ms: 5 * 60 * 1000, label: '5 minutes' },
];

function dueReminders(now, fightAt, sent) {
  const when = fightAt instanceof Date ? fightAt.getTime() : new Date(fightAt).getTime();
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(when) || !Number.isFinite(at) || at >= when) return [];
  const done = new Set(sent || []);
  return ARENA_REMINDERS.filter((mark) => !done.has(mark.id) && at >= when - mark.ms);
}

async function sendDueArenaReminders(now) {
  const state = await load();
  if (state.useSim) return { sent: [], skipped: 'sim' };
  const fight = nextArenaAfter(now);
  if (!fight) return { sent: [] };
  const fightAt = fight.when.toISOString();
  const roster = Object.keys(state.spoops || {}).length;
  const due = dueReminders(now, fight.when, []);
  const sent = [];
  for (const mark of due) {
    const claimed = await claimArenaReminder(fightAt, mark.id);
    if (!claimed) continue;
    const ok = await postArenaReminder(mark, fight.when, roster);
    if (!ok) {
      await releaseArenaReminder(fightAt, mark.id);
      return { sent, fightAt, roster, failed: mark.id };
    }
    sent.push(mark.id);
  }
  return { sent, fightAt, roster };
}

module.exports = { ARENA_REMINDERS, dueReminders, sendDueArenaReminders };
