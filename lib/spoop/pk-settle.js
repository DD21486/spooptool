const { advance, considerPk, resolveDuePk } = require('./engine');
const { load, save, savePkResolution, keepReminderMarks } = require('./store');
const { publishEvents, publishPk } = require('./publish');

async function syncPk(now) {
  const at = now instanceof Date ? now : new Date(now);
  const state = await load();
  if (!state || state.useSim) return { settled: false, called: false, skipped: 'sim' };
  const expected = state.clock;
  if (state.pk && state.pk.needsPost && new Date(state.pk.fightAt) <= at) state.pk.needsPost = false;
  if ((state.pk && state.pk.needsPost) || (state.lastPk && state.lastPk.needsPost)) {
    if (await publishPk(state)) {
      keepReminderMarks(state);
      const posted = await save(state, expected);
      if (!posted) return { settled: false, called: false, lostRace: true };
    }
  }
  const fightKey = state.pk && state.pk.fightAt;
  if (fightKey && new Date(fightKey) <= at) {
    const when = new Date(fightKey);
    const notes = [];
    if (when > new Date(state.clock)) notes.push(...advance(state, when));
    if (state.pk && state.pk.fightAt === fightKey) notes.push(...resolveDuePk(state, when));
    const saved = await savePkResolution(state, expected, fightKey);
    if (!saved) return { settled: false, called: false, lostRace: true };
    if (await publishEvents(notes, state)) await save(state, state.clock);
    return {
      settled: true,
      called: notes.some((row) => row && row.kind === 'pk-call'),
    };
  }
  const considered = considerPk(state, at);
  if (!considered.rolled) return { settled: false, called: false };
  const saved = await save(state, expected);
  if (!saved) return { settled: false, called: false, lostRace: true };
  if (await publishEvents(considered.call ? [considered.call] : [], state)) await save(state, state.clock);
  return { settled: false, called: !!considered.call, rolled: true };
}

module.exports = { syncPk };
