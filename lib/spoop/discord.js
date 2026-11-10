/**
 * One Discord channel for every spoop update. Set DISCORD_SPOOP_WEBHOOK_URL
 * to that channel's incoming webhook. Missing or invalid URL is a no-op.
 */

const MAX_EMBEDS = 10;
const MAX_UPDATES = 80;

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
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.lines.push(text);
    else groups.push({ name, lines: [text] });
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
  }
}

async function postSpoopUpdates(entries) {
  const url = webhookUrl();
  if (!url) return;
  let groups = groupUpdates(entries);
  if (!groups.length) return;
  if (groups.length > MAX_UPDATES) groups = groups.slice(groups.length - MAX_UPDATES);
  const embeds = groups.map((group) => ({
    title: group.name,
    description: group.lines.join('\n').slice(0, 4000),
    color: 0xf59e0b,
  }));
  try {
    for (let i = 0; i < embeds.length; i += MAX_EMBEDS) {
      await postBatch(url, embeds.slice(i, i + MAX_EMBEDS));
    }
  } catch (err) {
    console.error('spoop discord', err && err.message ? err.message : err);
  }
}

module.exports = { postSpoopUpdates, groupUpdates };
