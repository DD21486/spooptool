/**
 * Discord pings before the 9pm ET Spoopfight, and a heads-up before any raid. A mark stays
 * due until the fight starts, and a claim keeps two callers from posting it twice.
 */

const { nextArenaAfter, arenaNightPlan, nextRaidBetween } = require('./engine');
const { load, claimArenaReminder, releaseArenaReminder } = require('./store');
const { postArenaReminder, postRaidHype } = require('./discord');

const ARENA_REMINDERS = [
  { id: '60', ms: 60 * 60 * 1000, label: '1 hour' },
  { id: '30', ms: 30 * 60 * 1000, label: '30 minutes' },
  { id: '5', ms: 5 * 60 * 1000, label: '5 minutes' },
];

const RAID_HYPE = { id: 'raid-hype', ms: 10 * 60 * 1000, label: '10 minutes' };

function dueReminders(now, fightAt, sent) {
  const when = fightAt instanceof Date ? fightAt.getTime() : new Date(fightAt).getTime();
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(when) || !Number.isFinite(at) || at >= when) return [];
  const done = new Set(sent || []);
  return ARENA_REMINDERS.filter((mark) => !done.has(mark.id) && at >= when - mark.ms);
}

async function sendRaidHype(state, now) {
  const preview = nextRaidBetween(state, now, new Date(now.getTime() + RAID_HYPE.ms));
  if (!preview) return null;
  const at = preview.when.toISOString();
  if (!(await claimArenaReminder(at, RAID_HYPE.id))) return null;
  const left = Math.max(1, Math.round((preview.when.getTime() - now.getTime()) / 60000));
  const ok = await postRaidHype(Object.assign({}, preview, { label: left === 1 ? '1 minute' : left + ' minutes' }));
  if (!ok) {
    await releaseArenaReminder(at, RAID_HYPE.id);
    return null;
  }
  return at;
}

async function sendDueArenaReminders(now) {
  const state = await load();
  if (state.useSim) return { sent: [], skipped: 'sim' };
  const hype = await sendRaidHype(state, now);
  const fight = nextArenaAfter(now, state);
  if (!fight) return { sent: [], hype };
  const fightAt = fight.when.toISOString();
  const roster = Object.keys(state.spoops || {}).length;
  const due = dueReminders(now, fight.when, []);
  const sent = [];
  for (const mark of due) {
    const claimed = await claimArenaReminder(fightAt, mark.id);
    if (!claimed) continue;
    const night = arenaNightPlan(fight.when);
    const ok = await postArenaReminder(mark, fight.when, roster, night.title);
    if (!ok) {
      await releaseArenaReminder(fightAt, mark.id);
      return { sent, fightAt, roster, failed: mark.id, hype };
    }
    sent.push(mark.id);
  }
  return { sent, fightAt, roster, hype };
}

module.exports = { ARENA_REMINDERS, RAID_HYPE, dueReminders, sendDueArenaReminders };
