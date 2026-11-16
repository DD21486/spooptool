(function () {
  const picks = document.getElementById('pit-picks');
  const seedEl = document.getElementById('pit-seed');
  const speedEl = document.getElementById('pit-speed');
  const bossEl = document.getElementById('raid-boss');
  const tierEl = document.getElementById('raid-tier');
  const fightBtn = document.getElementById('pit-fight');
  const replayBtn = document.getElementById('pit-replay');
  const statusEl = document.getElementById('arena-status');
  const notesEl = document.getElementById('pit-notes');
  const lootEl = document.getElementById('raid-loot');
  const kickerEl = document.getElementById('raid-kicker');
  const phaseEl = document.getElementById('raid-phase');
  const stageEl = document.getElementById('raid-stage');
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

  function clearLoot() {
    if (lootEl) lootEl.hidden = true;
    if (stageEl) stageEl.innerHTML = '';
    if (phaseEl) phaseEl.textContent = '';
  }

  function hideLoot() {
    rollToken += 1;
    clearLoot();
  }

  function iconHtml(osrsId, size) {
    if (!osrsId) return '';
    const px = size || 36;
    return '<img src="/api/spoops?icon=1&id=' + Number(osrsId) + '" alt="" width="' + px + '" height="' + px + '">';
  }

  async function spin(nodes, landIndex, token) {
    if (!nodes.length) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const laps = Math.max(nodes.length * 2, 8) + landIndex;
    const steps = reduce ? 1 : laps;
    for (let i = 0; i <= steps; i++) {
      if (token !== rollToken) return;
      const idx = i === steps ? landIndex : i % nodes.length;
      nodes.forEach((node, n) => node.classList.toggle('is-on', n === idx));
      if (i === steps) break;
      const u = i / Math.max(1, steps);
      await wait(reduce ? 0 : 36 + u * u * 220);
    }
    if (token !== rollToken) return;
    nodes[landIndex].classList.add('is-landed');
  }

  function playReel(drop, token) {
    return new Promise((resolve) => {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const reel = (drop && drop.reel) || [];
      const cards = reel.map((item, i) => {
        const rare = item && item.rare ? ' is-rare' : '';
        return '<div class="roll-card' + rare + '" data-i="' + i + '">' +
          iconHtml(item && item.osrsId, 42) +
          '<span>' + escapeHtml(item ? item.name : '') + '</span></div>';
      }).join('');
      stageEl.innerHTML = '<div class="roll-window"><div class="roll-marker"></div><div class="roll-strip">' + cards + '</div></div>' +
        '<p class="raid-land"></p>';
      const strip = stageEl.querySelector('.roll-strip');
      const land = stageEl.querySelector('.raid-land');
      const win = stageEl.querySelector('.roll-card[data-i="' + drop.winIndex + '"]');
      if (!strip) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (token !== rollToken) {
          resolve();
          return;
        }
        if (win) win.classList.add('is-win');
        if (land) land.textContent = drop.name || '';
        resolve();
      };
      const view = stageEl.querySelector('.roll-window');
      const viewW = (view && view.clientWidth) || 640;
      const cardW = (win && win.offsetWidth ? win.offsetWidth : 112) + 8;
      const jitter = reduce ? 0 : (Math.random() * 24 - 12);
      const maxShift = Math.max(0, strip.scrollWidth - viewW);
      const rawTarget = (win ? win.offsetLeft : drop.winIndex * cardW) - viewW / 2 + (win ? win.offsetWidth : 112) / 2 + jitter;
      const target = Math.max(0, Math.min(maxShift, rawTarget));
      const travel = Math.min(maxShift, target + cardW * 11);
      if (reduce || token !== rollToken) {
        strip.style.transform = 'translateX(' + (-target) + 'px)';
        finish();
        return;
      }
      strip.style.transform = 'translateX(' + (-travel) + 'px)';
      void strip.offsetWidth;
      requestAnimationFrame(() => {
        if (token !== rollToken) {
          finish();
          return;
        }
        strip.style.transition = 'transform 5.1s cubic-bezier(0.05, 0.65, 0.05, 1)';
        strip.style.transform = 'translateX(' + (-target) + 'px)';
      });
      strip.addEventListener('transitionend', (ev) => {
        if (ev.target === strip && ev.propertyName === 'transform') finish();
      });
      window.setTimeout(finish, 5600);
    });
  }

  function renderSummary(loot, party, bout) {
    const goldById = new Map((loot.shares || []).map((row) => [row.id, row.gold]));
    const takerId = loot.spooply && loot.spooply.id;
    const drop = loot.drop;
    const dealt = new Map();
    const monsters = new Set(((bout && bout.fighters) || []).filter((f) => f.monster).map((f) => f.id));
    ((bout && bout.hits) || []).forEach((hit) => {
      if (!hit || !(hit.amount > 0) || monsters.has(hit.from)) return;
      dealt.set(hit.from, (dealt.get(hit.from) || 0) + hit.amount);
    });
    let top = 0;
    dealt.forEach((amount) => { if (amount > top) top = amount; });
    const shares = party.map((row) => {
      const share = goldById.get(row.id);
      const amount = dealt.get(row.id) || 0;
      const taker = row.alive && row.id === takerId ? ' is-taker' : '';
      const best = top > 0 && amount === top ? ' is-top' : '';
      const dmg = '<em class="raid-dmg">' + amount.toLocaleString('en-US') + ' dmg</em>';
      if (!row.alive) {
        return '<div class="raid-share is-down' + taker + best + '"><strong>' + escapeHtml(row.name) + '</strong><span>Down</span>' + dmg + '</div>';
      }
      const gold = share ? share.toLocaleString('en-US') + ' gp' : '0 gp';
      return '<div class="raid-share' + taker + best + '"><strong>' + escapeHtml(row.name) + '</strong><span>' + gold + '</span>' + dmg + '</div>';
    }).join('');
    let prize = '';
    if (!loot.wiped && drop) {
      const who = (loot.spooply && loot.spooply.name) || 'Someone';
      const rare = drop.rare ? ' is-rare' : '';
      prize = '<div class="raid-prize' + rare + '">' +
        iconHtml(drop.osrsId, 64) +
        (drop.rare ? '<p class="raid-rare-tag">Rare</p>' : '') +
        '<p class="raid-take">' + escapeHtml(who) + ' takes the ' + escapeHtml(drop.name) + '.</p>' +
      '</div>';
    }
    const goldLine = loot.wiped
      ? (party.some((row) => row.alive)
        ? 'Time called. <span>No kill, so no loot.</span>'
        : 'The party fell. <span>No one is left to loot.</span>')
      : (loot.gold || 0).toLocaleString('en-US') + ' gold <span>split by the living</span>';
    stageEl.innerHTML = '<div class="raid-summary">' +
      '<p class="raid-gold">' + goldLine + '</p>' +
      prize +
      '<div class="raid-shares">' + shares + '</div>' +
    '</div>';
  }

  async function showLoot(data, opt) {
    opt = opt || {};
    const token = rollToken;
    const bout = data && data.bout;
    const loot = bout && bout.loot;
    const party = (bout && bout.party) || [];
    if (!lootEl || !loot || !stageEl) return false;
    if (banner) banner.hidden = true;
    const bossName = (data.boss && data.boss.name) || bout.bossName || 'Boss';
    const alive = party.filter((row) => row.alive);
    const dead = party.filter((row) => !row.alive);
    kickerEl.textContent = bossName;
    phaseEl.textContent = '';
    stageEl.innerHTML = '';
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
    const cleared = !loot.wiped && alive.length > 0;
    if (loot.wiped || !loot.drop || !loot.spooply) {
      phaseEl.textContent = loot.wiped ? 'No loot' : 'The split';
      renderSummary(loot, party, bout);
      return finishCard(opt, token, cleared);
    }
    const living = alive.length ? alive : [loot.spooply];
    phaseEl.textContent = 'Who loots';
    const row = document.createElement('div');
    row.className = 'raid-who';
    const spoopNodes = living.map((person) => {
      const el = document.createElement('div');
      el.className = 'raid-chip';
      el.textContent = person.name;
      row.appendChild(el);
      return el;
    });
    stageEl.appendChild(row);
    let who = living.findIndex((person) => person.id === loot.spooply.id);
    if (who < 0) who = 0;
    await spin(spoopNodes, who, token);
    if (token !== rollToken) return false;
    const chosen = document.createElement('p');
    chosen.className = 'raid-chosen';
    chosen.textContent = loot.spooply.name + ' is up.';
    stageEl.appendChild(chosen);
    await wait(2000);
    if (token !== rollToken) return false;
    phaseEl.textContent = 'The drop';
    await playReel(loot.drop, token);
    if (token !== rollToken) return false;
    await wait(900);
    if (token !== rollToken) return false;
    phaseEl.textContent = 'The split';
    renderSummary(loot, party, bout);
    return finishCard(opt, token, true);
  }

  function stamp(text) {
    if (!text || !stageEl) return;
    const line = document.createElement('p');
    line.className = 'raid-next';
    line.textContent = text;
    const box = stageEl.querySelector('.raid-summary');
    (box || stageEl).appendChild(line);
    return line;
  }

  function countdown(seconds, token) {
    return new Promise((resolve) => {
      let left = seconds;
      const line = stamp('Next fight in ' + left);
      const timer = window.setInterval(() => {
        if (token !== rollToken) {
          window.clearInterval(timer);
          resolve(false);
          return;
        }
        left -= 1;
        if (left <= 0) {
          window.clearInterval(timer);
          if (line) line.textContent = 'Next fight';
          resolve(true);
        } else if (line) {
          line.textContent = 'Next fight in ' + left;
        }
      }, 1000);
    });
  }

  async function finishCard(opt, token, cleared) {
    if (token !== rollToken) return false;
    if (opt && opt.wait && cleared) return countdown(10, token);
    if (opt && opt.closing) stamp(cleared ? 'Raid complete.' : 'The raid ends here.');
    return cleared && token === rollToken;
  }

  function showLineup(lineup, token) {
    return new Promise((resolve) => {
      if (!lootEl || !stageEl) {
        resolve(token === rollToken);
        return;
      }
      if (kickerEl) kickerEl.textContent = 'Tonight';
      if (phaseEl) phaseEl.textContent = 'The run';
      stageEl.innerHTML = '<div class="raid-lineup">' + (lineup || []).map((boss, i) => (
        '<div class="raid-room">' +
          '<p class="raid-room-num">' + (i + 1) + '</p>' +
          (boss.sprite ? '<img alt="" src="' + escapeHtml(boss.sprite) + '">' : '') +
          '<strong>' + escapeHtml(boss.name || 'Boss') + '</strong>' +
          '<span>' + escapeHtml(boss.tierName || '') + '</span>' +
        '</div>'
      )).join('') + '</div>';
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      window.setTimeout(() => resolve(token === rollToken), 4500);
    });
  }

  function playBout(bout) {
    return new Promise((resolve) => {
      if (!window.ArenaPit) {
        resolve();
        return;
      }
      window.ArenaPit.play(bout, speedEl.value, () => resolve());
    });
  }

  function bossLine(boss) {
    if (!boss) return 'Step out of the orange.';
    return boss.name + ' · ' + (boss.tierName || 'Medium') + ' · for ' + (boss.forLevel || boss.level || 1) + ' · party ' + (boss.level || 1) + ' · ' + (boss.hp || 0) + ' hp · hits ' + (boss.maxHit || 0);
  }

  async function runRaid(data) {
    last = data;
    hideLoot();
    const token = rollToken;
    const rooms = data.rooms || [];
    const lineup = data.lineup && data.lineup.length ? data.lineup : rooms.map((room) => room.boss || {});
    if (statusEl) statusEl.textContent = 'Tonight';
    if (notesEl) {
      notesEl.textContent = lineup.map((boss, i) => (i + 1) + '. ' + (boss.name || 'Boss') + ' · ' + (boss.tierName || '')).join('    ');
    }
    const shown = await showLineup(lineup, token);
    if (!shown || token !== rollToken) return;
    clearLoot();
    for (let i = 0; i < rooms.length; i++) {
      if (token !== rollToken) return;
      const room = rooms[i];
      const boss = room.boss || {};
      if (notesEl) notesEl.textContent = bossLine(boss);
      if (statusEl) statusEl.textContent = (i + 1) + ' / ' + lineup.length + ' · ' + (boss.name || 'Boss');
      await playBout(room.bout);
      if (token !== rollToken) return;
      const more = i < rooms.length - 1;
      const cleared = await showLoot(room, { wait: more, closing: !more });
      if (!cleared || !more || token !== rollToken) return;
      clearLoot();
    }
  }

  function play(data) {
    if (data && data.raid) {
      runRaid(data);
      return;
    }
    last = data;
    hideLoot();
    const boss = data.boss;
    if (notesEl) {
      notesEl.textContent = boss
        ? boss.name + ' · ' + (boss.tierName || 'Medium') + ' · for ' + (boss.forLevel || boss.level || 1) + ' · party ' + (boss.level || 1) + ' · ' + boss.hp + ' hp · hits ' + (boss.maxHit || 0)
        : 'Step out of the orange.';
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
          tier: tierEl ? tierEl.value : 'medium',
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

  function syncTier() {
    if (!bossEl || !tierEl) return;
    const tonight = bossEl.value === 'raid';
    tierEl.disabled = tonight;
    tierEl.title = tonight ? 'Tonight rolls a tier for each boss' : '';
  }

  if (bossEl) bossEl.addEventListener('change', syncTier);
  syncTier();

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
