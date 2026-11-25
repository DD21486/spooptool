/**
 * One Discord channel for every spoop update. Set DISCORD_SPOOP_WEBHOOK_URL
 * to that channel's incoming webhook. Missing or invalid URL is a no-op.
 */

const { ACTIVITIES, ERRANDS } = require('./data');
const { questByActivity, questRecord } = require('./quests');

const MAX_EMBEDS = 10;
const SITE = 'https://spooptool.vercel.app';

function spoopPageUrl(name) {
  const key = String(name || '').trim();
  if (!key || key === 'Spoop' || key === 'Nobody') return '';
  return SITE + '/spoop.html?name=' + encodeURIComponent(key);
}

function linkedName(name) {
  const label = String(name || '').trim();
  const url = spoopPageUrl(label);
  if (!url) return label;
  const safe = label.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
  return '[' + safe + '](' + url + ')';
}

function linkNamesIn(text, names) {
  const list = [...new Set((names || []).map((name) => String(name || '').trim()).filter((name) => spoopPageUrl(name)))]
    .sort((a, b) => b.length - a.length);
  if (!list.length) return String(text || '');
  const pattern = new RegExp('(?<![A-Za-z0-9])(?:' + list.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![A-Za-z0-9])', 'g');
  return String(text || '').replace(pattern, (hit) => linkedName(hit));
}

function spoopNames(state, extra) {
  const names = [];
  if (state && state.spoops) {
    for (const spoop of Object.values(state.spoops)) {
      if (spoop && spoop.name) names.push(spoop.name);
    }
  }
  for (const name of extra || []) names.push(name);
  return names;
}

function spoopByName(state, name) {
  if (!state || !state.spoops) return null;
  const wanted = String(name || '');
  if (state.spoops[wanted]) return state.spoops[wanted];
  return Object.values(state.spoops).find((spoop) => spoop && spoop.name === wanted) || null;
}

function activityFooter(spoop) {
  const quest = questByActivity(spoop.activityId);
  const act = ACTIVITIES.find((row) => row.id === spoop.activityId)
    || ERRANDS.find((row) => row.id === spoop.activityId);
  const where = quest ? quest.name : act ? act.name : 'Wandering';
  const record = (spoop.arenaWins || 0) + '–' + (spoop.arenaLosses || 0);
  const duels = (spoop.duelWins || 0) + '–' + (spoop.duelLosses || 0);
  const qp = questRecord(spoop.quests).points;
  return { text: '📍 ' + where + '  ·  📜 ' + qp + ' QP  ·  🏟️ ' + record + '  ·  🥊 ' + duels };
}

function spriteUrl(icon) {
  const id = Number(icon);
  if (!(id > 0)) return '';
  return 'https://chisel.weirdgloop.org/static/img/osrs-sprite/' + id + '.png';
}

function linkedBody(text, state, extra) {
  return linkNamesIn(text, spoopNames(state, extra)).trim().slice(0, 3950);
}

function embedFor(group, state) {
  const page = spoopPageUrl(group && group.name);
  if (group && (group.kind === 'crate' || group.kind === 'mega')) {
    const mega = group.kind === 'mega';
    const embed = {
      title: (group.name || 'Spoop') + (mega ? ' opened a megarare chest' : ' opened a crate'),
      description: linkedBody(group.lines.join('\n\n'), state, [group.name]),
      color: mega ? 0xf5c542 : 0xc026d3,
    };
    if (page) embed.url = page;
    const icon = spriteUrl(group.icon);
    if (icon) embed.thumbnail = { url: icon };
    if (Array.isArray(group.stats) && group.stats.length) embed.fields = group.stats;
    return embed;
  }
  if (group && group.kind === 'lamp') {
    const embed = {
      title: '🪔 ' + (group.name || 'Spoop') + ' rubbed an XP lamp',
      description: linkedBody(group.lines.join('\n\n'), state, [group.name]),
      color: 0xe0b84a,
    };
    if (page) embed.url = page;
    const icon = spriteUrl(group.icon);
    if (icon) embed.thumbnail = { url: icon };
    if (Array.isArray(group.stats) && group.stats.length) embed.fields = group.stats;
    return embed;
  }
  if (group && group.kind === 'level') {
    const embed = {
      title: (group.name || 'Spoop') + ' leveled up',
      description: linkedBody(group.lines.join('\n\n'), state, [group.name]),
      color: 0xe0b84a,
    };
    if (page) embed.url = page;
    if (Array.isArray(group.stats) && group.stats.length) embed.fields = group.stats;
    const spoop = spoopByName(state, group.name);
    if (spoop) embed.footer = activityFooter(spoop);
    return embed;
  }
  if (group && (group.kind === 'pk-call' || group.kind === 'pk-result')) {
    return {
      title: group.kind === 'pk-result' ? 'PK result' : 'PK challenge',
      description: linkedBody(group.lines.join('\n'), state, [group.name]),
      color: 0xdc2626,
      url: SITE + '/arena.html',
    };
  }
  const spoop = spoopByName(state, group.name);
  const body = linkedBody(group.lines.join('\n'), state, [group.name]);
  const embed = {
    title: group.name,
    description: body,
    color: 0xf59e0b,
  };
  if (page) embed.url = page;
  if (!spoop) return embed;
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
    if (last && last.name === name && last.kind === kind) {
      last.lines.push(text);
      if (Array.isArray(entry.stats) && entry.stats.length) last.stats = last.stats.concat(entry.stats);
    }
    else groups.push({
      name,
      kind,
      lines: [text],
      icon: entry.icon || 0,
      stats: Array.isArray(entry.stats) ? entry.stats : [],
    });
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

async function postArenaReminder(mark, when, rosterCount, title) {
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
      title: (title || 'Tournament') + ' in ' + mark.label,
      description: time + ' ET. ' + who,
      color: 0xf59e0b,
      url: SITE + '/arena.html',
    }]);
  } catch (err) {
    console.error('spoop arena reminder', err && err.message ? err.message : err);
    return false;
  }
}

// The heads-up before a raid: who's going, the night's twist, and where to watch.
async function postRaidHype(preview) {
  const url = webhookUrl();
  if (!url || !preview) return false;
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(preview.when);
  const names = preview.roster || [];
  const lines = [time + ' ET. ' + (names.length === 1 ? '1 spoop is' : names.length + ' spoops are') + ' going in.'];
  if (preview.twist) lines.push('', "**Tonight's twist: " + preview.twist.name + '**', preview.twist.detail);
  if (names.length) lines.push('', 'Party: ' + names.map(linkedName).join(', '));
  lines.push('', 'Watch live: ' + RAID_WATCH);
  try {
    return await postBatch(url, [{
      title: '⚔️ ' + (preview.name || 'Raid') + ' starts in ' + preview.label,
      description: lines.join('\n').slice(0, 3950),
      color: 0x7c3aed,
      url: RAID_WATCH,
    }]);
  } catch (err) {
    console.error('spoop raid hype', err && err.message ? err.message : err);
    return false;
  }
}

function dramaBlock(entry) {
  const lines = Array.isArray(entry.drama) ? entry.drama.filter(Boolean) : [];
  return lines.length ? '\n\n' + lines.join('\n') : '';
}

function arenaResultEmbed(entry) {
  const results = Array.isArray(entry.results) ? entry.results : [];
  const names = results.map((row) => row && row.name).concat([entry.winner]);
  if (entry.kind === 'raid') {
    const page = spoopPageUrl(entry.winner);
    let description = linkNamesIn(String(entry.text || (entry.cleared ? 'The party cleared the raid.' : 'The raid ended.')).trim() + dramaBlock(entry), names);
    if (page) description += '\n\nArena: ' + SITE + '/arena.html';
    return {
      title: entry.winner || 'Raid recap',
      description: description.slice(0, 3950),
      color: 0x7c3aed,
      url: page || SITE + '/arena.html',
    };
  }
  const fields = results.slice(0, 25).map((row) => {
    const net = Number(row.gold) || 0;
    const sign = net > 0 ? '+' : net < 0 ? '\u2212' : '';
    return {
      name: String(row.place || '·'),
      value: linkedName(row.name || 'Spoop') + '\n' + sign + Math.abs(net).toLocaleString('en-US') + ' gold',
      inline: true,
    };
  });
  const tourney = entry.kind === 'tournament';
  const winner = entry.winner || 'Nobody';
  let description = linkedName(winner) + (tourney ? ' won the Tournament.' : ' won the Spoopfight.');
  if (entry.pot != null) description += ' Pot ' + Number(entry.pot).toLocaleString('en-US') + ' gold.';
  if (!fields.length && entry.text) description = linkNamesIn(String(entry.text).trim(), names).slice(0, 3950);
  else if (entry.label) description += '\n' + linkNamesIn(entry.label, names);
  description += linkNamesIn(dramaBlock(entry), names);
  return {
    title: tourney ? 'Tournament result' : 'Spoopfight result',
    description: description.slice(0, 3950),
    color: 0xf59e0b,
    url: SITE + '/arena.html',
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

const RAID_WATCH = SITE + '/raid3d.html?live';

async function postRaidBeat(beat) {
  const url = webhookUrl();
  if (!url || !beat) return false;
  let description = linkNamesIn(String(beat.text || '').trim(), beat.names);
  if (beat.live) description += (description ? '\n\n' : '') + 'Watch live: ' + RAID_WATCH;
  const embed = {
    title: String(beat.title || 'Raid').slice(0, 250),
    description: description.slice(0, 3950),
    color: beat.live ? 0x22c55e : beat.wiped ? 0xdc2626 : 0x7c3aed,
    url: beat.live ? RAID_WATCH : SITE + '/arena.html',
  };
  if (beat.sprite && String(beat.sprite).startsWith('/')) {
    embed.thumbnail = { url: SITE + encodeURI(beat.sprite) };
  }
  try {
    return await postBatch(url, [embed]);
  } catch (err) {
    console.error('spoop raid beat', err && err.message ? err.message : err);
    return false;
  }
}

function duelWatchUrl(entry) {
  const token = String(entry && entry.watch || '').trim();
  if (!token || !entry.staked) return '';
  return 'https://spooptool.vercel.app/w/' + token;
}

function oddsLabel(p) {
  if (!(p > 0) || !(p < 1)) return '';
  if (Math.abs(p - 0.5) < 0.005) return 'even';
  const line = p >= 0.5 ? '-' + Math.round((100 * p) / (1 - p)) : '+' + Math.round((100 * (1 - p)) / p);
  return Math.round(p * 100) + '% (' + line + ')';
}

function recordLabel(record) {
  return Array.isArray(record) ? record[0] + '–' + record[1] : '';
}

function duelResultEmbed(entry, link) {
  const gold = (n) => Math.floor(Number(n) || 0).toLocaleString('en-US');
  const p = Number(entry.winnerOdds);
  const upset = p > 0 && p < 0.4;
  const winnerLines = ['**+' + gold(entry.pot - entry.stake) + ' gold**'];
  const loserLines = ['**\u2212' + gold(entry.stake) + ' gold**'];
  if (entry.winnerCombat) winnerLines.push('Cb ' + entry.winnerCombat);
  if (entry.loserCombat) loserLines.push('Cb ' + entry.loserCombat);
  if (entry.winnerRecord) winnerLines.push('Duels ' + recordLabel(entry.winnerRecord));
  if (entry.loserRecord) loserLines.push('Duels ' + recordLabel(entry.loserRecord));
  const fields = [
    { name: '🏆 Winner', value: linkedName(entry.winner) + '\n' + winnerLines.join('\n'), inline: true },
    { name: '💀 Loser', value: linkedName(entry.loser) + '\n' + loserLines.join('\n'), inline: true },
    { name: '💰 Pot', value: '**' + gold(entry.pot) + ' gold**', inline: true },
  ];
  if (p > 0 && p < 1) {
    const odds = oddsLabel(p);
    fields.push({
      name: upset ? '🚨 Upset' : '📊 Odds',
      value: odds === 'even' ? 'The odds were even' : linkedName(entry.winner) + ' was ' + odds + ' to win',
      inline: false,
    });
  }
  let description = linkNamesIn(String(entry.text || '').trim(), [entry.winner, entry.loser]);
  if (link) description += '\n\nWatch the replay: ' + link;
  return {
    title: (upset ? '🚨 Upset! ' : '⚔️ ') + entry.winner + ' beat ' + entry.loser,
    description: description.slice(0, 3950),
    color: upset ? 0xf59e0b : 0xfacc15,
    url: link || 'https://spooptool.vercel.app/arena.html',
    fields,
  };
}

async function postDuelChallenge(entry) {
  const url = webhookUrl();
  if (!url || !entry || !entry.from || !entry.to) return false;
  const gold = Math.floor(Number(entry.gold) || 0).toLocaleString('en-US');
  const link = 'https://spooptool.vercel.app/spoop.html?name=' + encodeURIComponent(entry.toKey || entry.to);
  const fields = [
    { name: '🪙 Stake', value: '**' + gold + ' gold each**', inline: true },
    { name: '💰 Pot', value: '**' + (Math.floor(Number(entry.gold) || 0) * 2).toLocaleString('en-US') + ' gold**', inline: true },
  ];
  const p = Number(entry.fromOdds);
  if (p > 0 && p < 1) {
    fields.push({
      name: '📊 Odds',
      value: linkedName(entry.from) + (entry.fromCombat ? ' (Cb ' + entry.fromCombat + ')' : '') + ': **' + Math.round(p * 100) + '%**\n' +
        linkedName(entry.to) + (entry.toCombat ? ' (Cb ' + entry.toCombat + ')' : '') + ': **' + Math.round((1 - p) * 100) + '%**',
      inline: false,
    });
  }
  try {
    return await postBatch(url, [{
      title: '🥊 ' + entry.from + ' challenged ' + entry.to + ' to a duel',
      description: linkedName(entry.from) + ' challenged ' + linkedName(entry.to) + '.\n' +
        linkedName(entry.to) + ' can accept or decline on their spoop page.',
      color: 0xf97316,
      url: link,
      fields,
    }]);
  } catch (err) {
    console.error('spoop duel challenge', err && err.message ? err.message : err);
    return false;
  }
}

async function postPkNotice(entry) {
  const url = webhookUrl();
  if (!url || !entry) return false;
  const kind = entry.kind === 'pk-result' ? 'pk-result' : 'pk-call';
  const link = duelWatchUrl(entry);
  if (kind === 'pk-result' && entry.staked && entry.winner && entry.loser) {
    try {
      return await postBatch(url, [duelResultEmbed(entry, link)]);
    } catch (err) {
      console.error('spoop duel result', err && err.message ? err.message : err);
      return false;
    }
  }
  let description = linkNamesIn(String(entry.text || '').trim(), [entry.aName, entry.bName, entry.winner, entry.loser]);
  if (link && kind === 'pk-call') description += '\n\nWatch it live: ' + link;
  try {
    return await postBatch(url, [{
      title: entry.staked
        ? (kind === 'pk-result' ? 'Duel result' : 'Duel')
        : (kind === 'pk-result' ? 'PK result' : 'PK challenge'),
      description: description.slice(0, 3950),
      color: 0xdc2626,
      url: link || 'https://spooptool.vercel.app/arena.html',
    }]);
  } catch (err) {
    console.error('spoop pk', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = { postSpoopUpdates, postArenaReminder, postArenaResult, postRaidBeat, postRaidHype, postPkNotice, postDuelChallenge, groupUpdates, embedFor };
