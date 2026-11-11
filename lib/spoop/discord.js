/**
 * One Discord channel for every spoop update. Set DISCORD_SPOOP_WEBHOOK_URL
 * to that channel's incoming webhook. Missing or invalid URL is a no-op.
 */

const { SKILLS, ACTIVITIES } = require('./data');
const { combatLevel, levelForXp } = require('./engine');
const { questByActivity, questRecord } = require('./quests');

const MAX_EMBEDS = 10;

const SKILL_ICON = {
  attack: '⚔️',
  strength: '💪',
  defence: '🛡️',
  hitpoints: '❤️',
  ranged: '🏹',
  magic: '🔮',
  prayer: '🙏',
};

function spoopByName(state, name) {
  if (!state || !state.spoops) return null;
  const wanted = String(name || '');
  if (state.spoops[wanted]) return state.spoops[wanted];
  return Object.values(state.spoops).find((spoop) => spoop && spoop.name === wanted) || null;
}

function skillFields(spoop) {
  const skills = spoop.skills || {};
  const fields = SKILLS.map((skill) => ({
    name: SKILL_ICON[skill.id] + ' ' + skill.name,
    value: '**' + levelForXp(skills[skill.id] || 0) + '**',
    inline: true,
  }));
  fields.push(
    { name: '🎖️ Combat', value: '**' + combatLevel(spoop) + '**', inline: true },
    { name: '🪙 Gold', value: '**' + Number(spoop.gold || 0).toLocaleString('en-US') + '**', inline: true },
  );
  return fields;
}

function activityFooter(spoop) {
  const quest = questByActivity(spoop.activityId);
  const act = ACTIVITIES.find((row) => row.id === spoop.activityId);
  const where = quest ? quest.name : act ? act.name : 'Wandering';
  const record = (spoop.arenaWins || 0) + '–' + (spoop.arenaLosses || 0);
  const qp = questRecord(spoop.quests).points;
  return { text: '📍 ' + where + '  ·  📜 ' + qp + ' QP  ·  🏟️ ' + record };
}

function embedFor(group, state) {
  if (group && (group.kind === 'pk-call' || group.kind === 'pk-result')) {
    return {
      title: group.kind === 'pk-result' ? 'PK result' : 'PK challenge',
      description: group.lines.join('\n').trim().slice(0, 3950),
      color: 0xdc2626,
      url: 'https://spooptool.vercel.app/arena.html',
    };
  }
  const spoop = spoopByName(state, group.name);
  const body = group.lines.join('\n').trim().slice(0, 3950);
  const embed = {
    title: group.name,
    description: spoop ? body + '\n\n────────────────────────────────' : body,
    color: 0xf59e0b,
  };
  if (!spoop) return embed;
  embed.fields = skillFields(spoop);
  embed.footer = activityFooter(spoop);
  return embed;
}

function webhookUrl() {
  const url = String(process.env.DISCORD_SPOOP_WEBHOOK_URL || '').trim();
  if (!url.startsWith('https://discord.com/api/webhooks/')) return '';
  return url;
}

function groupUpdates(entries) {
  const groups = [];
  for (const entry of entries || []) {
    const text = entry && entry.text ? String(entry.text).trim() : '';
    if (!text) continue;
    const name = (entry.name && String(entry.name).trim()) || 'Spoop';
    const kind = entry.kind || '';
    const last = groups[groups.length - 1];
    if (last && last.name === name && last.kind === kind) last.lines.push(text);
    else groups.push({ name, kind, lines: [text] });
  }
  return groups;
}

async function postBatch(url, embeds) {
  const body = JSON.stringify({
    username: 'Spoops',
    embeds,
  });
  let resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (resp.status === 429) {
    const data = await resp.json().catch(() => ({}));
    const wait = Math.min(2000, Math.ceil(Number(data.retry_after || 1) * 1000));
    await new Promise((resolve) => setTimeout(resolve, wait));
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error('spoop discord', resp.status, text.slice(0, 200));
    return resp.status >= 500 || resp.status === 429 ? false : 'drop';
  }
  return true;
}

async function postSpoopUpdates(entries, state) {
  const url = webhookUrl();
  if (!url) return 0;
  const groups = groupUpdates(entries);
  let sent = 0;
  let groupsSent = 0;
  try {
    for (const group of groups) {
      if (groupsSent >= MAX_EMBEDS) break;
      const result = await postBatch(url, [embedFor(group, state)]);
      if (result === false) break;
      sent += group.lines.length;
      groupsSent += 1;
    }
  } catch (err) {
    console.error('spoop discord', err && err.message ? err.message : err);
  }
  return sent;
}

async function postArenaReminder(mark, when, rosterCount) {
  const url = webhookUrl();
  if (!url) {
    console.error('spoop arena reminder: webhook missing');
    return false;
  }
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(when);
  const count = Number(rosterCount) || 0;
  const who = count === 1 ? '1 spoop is in.' : count + ' spoops are in.';
  try {
    return await postBatch(url, [{
      title: 'Spoopfight in ' + mark.label,
      description: time + ' ET. ' + who,
      color: 0xf59e0b,
      url: 'https://spooptool.vercel.app/arena.html',
    }]);
  } catch (err) {
    console.error('spoop arena reminder', err && err.message ? err.message : err);
    return false;
  }
}

function arenaResultEmbed(entry) {
  const results = Array.isArray(entry.results) ? entry.results : [];
  const fields = results.slice(0, 25).map((row) => {
    const net = Number(row.gold) || 0;
    const sign = net > 0 ? '+' : net < 0 ? '\u2212' : '';
    return {
      name: (row.place || '') + '. ' + (row.name || 'Spoop'),
      value: sign + Math.abs(net).toLocaleString('en-US') + ' gold',
      inline: true,
    };
  });
  const winner = entry.winner || 'Nobody';
  let description = winner + ' won the Spoopfight.';
  if (entry.pot != null) description += ' Pot ' + Number(entry.pot).toLocaleString('en-US') + ' gold.';
  if (!fields.length && entry.text) description = String(entry.text).trim().slice(0, 3950);
  else if (entry.label) description += '\n' + entry.label;
  return {
    title: 'Spoopfight result',
    description: description.slice(0, 3950),
    color: 0xf59e0b,
    url: 'https://spooptool.vercel.app/arena.html',
    fields,
  };
}

async function postArenaResult(entry) {
  const url = webhookUrl();
  if (!url || !entry) return false;
  try {
    return await postBatch(url, [arenaResultEmbed(entry)]);
  } catch (err) {
    console.error('spoop arena result', err && err.message ? err.message : err);
    return false;
  }
}

async function postPkNotice(entry) {
  const url = webhookUrl();
  if (!url || !entry) return false;
  const kind = entry.kind === 'pk-result' ? 'pk-result' : 'pk-call';
  try {
    return await postBatch(url, [{
      title: kind === 'pk-result' ? 'PK result' : 'PK challenge',
      description: String(entry.text || '').trim().slice(0, 3950),
      color: 0xdc2626,
      url: 'https://spooptool.vercel.app/arena.html',
    }]);
  } catch (err) {
    console.error('spoop pk', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = { postSpoopUpdates, postArenaReminder, postArenaResult, postPkNotice, groupUpdates, embedFor };
