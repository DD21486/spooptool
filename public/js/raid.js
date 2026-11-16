(function () {
  const picks = document.getElementById('pit-picks');
  const seedEl = document.getElementById('pit-seed');
  const speedEl = document.getElementById('pit-speed');
  const bossEl = document.getElementById('raid-boss');
  const fightBtn = document.getElementById('pit-fight');
  const replayBtn = document.getElementById('pit-replay');
  const statusEl = document.getElementById('arena-status');
  const notesEl = document.getElementById('pit-notes');
  const lootEl = document.getElementById('raid-loot');
  const kickerEl = document.getElementById('raid-kicker');
  const goldEl = document.getElementById('raid-gold');
  const sharesEl = document.getElementById('raid-shares');
  const tableLabel = document.getElementById('raid-table-label');
  const tableEl = document.getElementById('raid-table');
  const spooplyLabel = document.getElementById('raid-spooply-label');
  const spooplyEl = document.getElementById('raid-spooply');
  const takeEl = document.getElementById('raid-take');
  const banner = document.getElementById('arena-banner');
  let last = null;
  let busy = false;
  let rollToken = 0;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function selected() {
    return Array.from(picks.querySelectorAll('input:checked')).map((box) => box.value);
  }

  function renderPicks(spoops) {
    picks.innerHTML = spoops.map((spoop) => {
      const weapon = spoop.equipped && spoop.equipped.weapon;
      const style = weapon && weapon.style ? weapon.style : 'melee';
      const hint = 'Cb ' + spoop.combat + ' · ' + style + ' · hp ' + ((spoop.skills || []).find((skill) => skill.id === 'hitpoints') || {}).level;
      return '<label title="' + escapeHtml(hint) + '"><input type="checkbox" checked value="' + escapeHtml(spoop.name) + '">' +
        escapeHtml(spoop.name) + '</label>';
    }).join('');
  }

  function hideLoot() {
    rollToken += 1;
    if (lootEl) lootEl.hidden = true;
    if (tableEl) tableEl.innerHTML = '';
    if (spooplyEl) spooplyEl.innerHTML = '';
    if (sharesEl) sharesEl.innerHTML = '';
    if (takeEl) takeEl.textContent = '';
    if (tableLabel) tableLabel.hidden = true;
    if (spooplyLabel) spooplyLabel.hidden = true;
  }

  function chip(label, extra) {
    const el = document.createElement('div');
    el.className = 'raid-chip' + (extra || '');
    el.textContent = label;
    return el;
  }

  async function spin(nodes, landIndex, token) {
    if (!nodes.length) return;
    const laps = nodes.length * 2 + landIndex;
    for (let i = 0; i <= laps; i++) {
      if (token !== rollToken) return;
      const idx = i === laps ? landIndex : i % nodes.length;
      nodes.forEach((node, n) => node.classList.toggle('is-on', n === idx));
      const u = i / Math.max(1, laps);
      await wait(34 + u * u * 240);
    }
    if (token !== rollToken) return;
    nodes[landIndex].classList.add('is-landed');
  }

  async function showLoot(data) {
    const token = rollToken;
    const bout = data && data.bout;
    const loot = bout && bout.loot;
    const party = (bout && bout.party) || [];
    if (!lootEl || !loot) return;
    if (banner) banner.hidden = true;
    const bossName = (data.boss && data.boss.name) || bout.bossName || 'Boss';
    const alive = party.filter((row) => row.alive);
    const dead = party.filter((row) => !row.alive);
    kickerEl.textContent = bossName;
    sharesEl.innerHTML = '';
    tableEl.innerHTML = '';
    spooplyEl.innerHTML = '';
    takeEl.textContent = '';
    tableLabel.hidden = true;
    spooplyLabel.hidden = true;
    const goldById = new Map((loot.shares || []).map((row) => [row.id, row.gold]));
    party.forEach((row) => {
      const share = goldById.get(row.id);
      const text = row.alive
        ? row.name + (share ? ' · ' + share.toLocaleString('en-US') + ' gp' : '')
        : row.name + ' · down';
      sharesEl.appendChild(chip(text, row.alive ? '' : ' is-down'));
    });
    if (loot.wiped) {
      goldEl.innerHTML = alive.length
        ? 'Time called. <span>No kill, so no loot.</span>'
        : 'The party fell. <span>No one is left to loot.</span>';
    } else {
      goldEl.innerHTML = (loot.gold || 0).toLocaleString('en-US') + ' gold <span>split by the living</span>';
    }
    lootEl.hidden = false;
    const deadNote = dead.length
      ? ' ' + dead.map((row) => row.name).join(', ') + (dead.length === 1 ? ' stays down.' : ' stay down.')
      : '';
    if (notesEl) notesEl.textContent = alive.length + ' standing.' + deadNote;
    if (statusEl) {
      statusEl.textContent = loot.wiped
        ? (alive.length ? bossName + ' wins.' : 'The party fell.')
        : bossName + ' is down.';
    }
    if (loot.wiped || !loot.drop || !loot.table || !loot.table.length) return;
    await wait(700);
    if (token !== rollToken) return;
    tableLabel.hidden = false;
    const tableNodes = loot.table.map((row) => {
      const el = document.createElement('div');
      el.className = 'raid-chip' + (row.rare ? ' is-rare' : '');
      if (row.osrsId) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = '/api/spoops?icon=1&id=' + row.osrsId;
        el.appendChild(img);
      }
      el.appendChild(document.createTextNode(row.name));
      tableEl.appendChild(el);
      return el;
    });
    const land = Math.max(0, Math.min(loot.table.length - 1, loot.drop.index || 0));
    await spin(tableNodes, land, token);
    if (token !== rollToken) return;
    await wait(420);
    if (token !== rollToken) return;
    spooplyLabel.hidden = false;
    const living = alive.length ? alive : [{ id: loot.spooply && loot.spooply.id, name: loot.spooply && loot.spooply.name }];
    const spoopNodes = living.map((row) => {
      const el = chip(row.name);
      spooplyEl.appendChild(el);
      return el;
    });
    let who = living.findIndex((row) => loot.spooply && row.id === loot.spooply.id);
    if (who < 0) who = 0;
    await spin(spoopNodes, who, token);
    if (token !== rollToken) return;
    const taker = (loot.spooply && loot.spooply.name) || 'Someone';
    takeEl.textContent = taker + ' takes the ' + loot.drop.name + '.';
  }

  function play(data) {
    last = data;
    hideLoot();
    const boss = data.boss;
    if (notesEl) {
      notesEl.textContent = (boss ? boss.name + ' · ' + boss.hp + ' hp. ' : '') + 'Step out of the orange.';
    }
    statusEl.textContent = boss ? boss.name : 'Raid';
    if (window.ArenaPit) {
      window.ArenaPit.play(data.bout, speedEl.value, function () {
        showLoot(data);
      });
    }
  }

  async function fight() {
    if (busy) return;
    const names = selected();
    if (!names.length) {
      statusEl.textContent = 'Pick at least one spoop.';
      return;
    }
    if (!seedEl.value.trim()) seedEl.value = String(Date.now());
    busy = true;
    fightBtn.disabled = true;
    statusEl.textContent = 'Walking in…';
    try {
      const res = await fetch('/api/spoops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'raid-test',
          names,
          seed: seedEl.value.trim(),
          boss: bossEl ? bossEl.value : 'brutus',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not run the raid');
      if (data.seed) seedEl.value = data.seed;
      play(data);
    } catch (err) {
      statusEl.textContent = err.message;
    } finally {
      busy = false;
      fightBtn.disabled = false;
    }
  }

  fightBtn.addEventListener('click', () => fight());
  replayBtn.addEventListener('click', () => {
    if (last) play(last);
  });

  fetch('/api/spoops')
    .then((res) => res.json())
    .then((data) => {
      renderPicks(data.spoops || []);
    })
    .catch(() => {
      statusEl.textContent = 'Could not load spoops.';
    });
})();
