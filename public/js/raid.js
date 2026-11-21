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
    if (lootEl) {
      lootEl.hidden = true;
      lootEl.classList.remove('is-intro', 'is-recap');
    }
    if (stageEl) stageEl.innerHTML = '';
    if (phaseEl) phaseEl.textContent = '';
  }

  function tierSlug(name) {
    return String(name || 'medium').toLowerCase().replace(/[^a-z]/g, '');
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
        (drop.jackpot
          ? '<p class="raid-rare-tag">Jackpot · 500,000 gp</p>'
          : drop.rare ? '<p class="raid-rare-tag">Rare</p>' : '') +
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
    const alive = party.filter((row) => row.alive);
    if (opt.closing && party.length && !alive.length && last && Array.isArray(last.rooms)) {
      showRaidRecap(last);
      if (statusEl) statusEl.textContent = 'The party fell.';
      if (notesEl) notesEl.textContent = (last.name || 'The raid') + ' is over.';
      return false;
    }
    if (banner) banner.hidden = true;
    const bossName = (data.boss && data.boss.name) || bout.bossName || 'Boss';
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

  function joinNames(list) {
    const names = (list || []).filter(Boolean);
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  function raidTallies(raid) {
    const people = new Map();
    function person(id, name) {
      let row = people.get(id);
      if (!row) {
        row = { id: id, name: name || 'Spoop', damage: 0, gold: 0, drops: [], fell: '' };
        people.set(id, row);
      } else if (name) row.name = name;
      return row;
    }
    (raid.rooms || []).forEach((room) => {
      const bout = room.bout || {};
      const bossName = (room.boss && room.boss.name) || 'the room';
      const monsters = new Set(((bout.fighters || []).filter((f) => f.monster).map((f) => f.id)));
      const named = new Map((bout.party || []).map((row) => [row.id, row.name]));
      (bout.hits || []).forEach((hit) => {
        if (!hit || !(hit.amount > 0) || monsters.has(hit.from) || !named.has(hit.from)) return;
        person(hit.from, named.get(hit.from)).damage += hit.amount;
      });
      const loot = bout.loot || {};
      (loot.shares || []).forEach((share) => {
        if (!share) return;
        person(share.id, share.name).gold += Number(share.gold) || 0;
      });
      if (!loot.wiped && loot.drop && loot.drop.name && loot.spooply && loot.spooply.name) {
        person(loot.spooply.id, loot.spooply.name).drops.push({
          name: loot.drop.name,
          osrsId: loot.drop.osrsId,
          rare: !!loot.drop.rare,
          from: bossName,
        });
      }
      (bout.party || []).forEach((row) => {
        const entry = person(row.id, row.name);
        if (!row.alive) entry.fell = bossName;
      });
    });
    return Array.from(people.values());
  }

  function showRaidRecap(raid) {
    if (!lootEl || !stageEl) return;
    const rows = raidTallies(raid);
    const rooms = raid.rooms || [];
    const lastRoom = rooms[rooms.length - 1];
    const fellTo = (lastRoom && lastRoom.boss && lastRoom.boss.name) || 'the raid';
    const killed = rooms
      .filter((room) => room.bout && room.bout.loot && !room.bout.loot.wiped && room.boss && room.boss.name)
      .map((room) => room.boss.name);
    const topDamage = rows.reduce((best, row) => Math.max(best, row.damage), 0);
    const topGold = rows.reduce((best, row) => Math.max(best, row.gold), 0);
    const byDamage = rows.slice().sort((a, b) => b.damage - a.damage || a.name.localeCompare(b.name));
    const byGold = rows.slice().sort((a, b) => b.gold - a.gold || a.name.localeCompare(b.name));
    const drops = [];
    rows.forEach((row) => {
      row.drops.forEach((drop) => drops.push({ who: row.name, drop: drop }));
    });
    const damageHtml = byDamage.map((row) => {
      const best = topDamage > 0 && row.damage === topDamage ? ' is-best' : '';
      const tag = best ? '<em>Most</em>' : '';
      const where = row.fell ? '<span class="meta">Fell to ' + escapeHtml(row.fell) + '</span>' : '';
      return '<li class="raid-recap-row' + best + '"><span class="who">' + escapeHtml(row.name) + tag + '</span>' +
        '<span class="num">' + row.damage.toLocaleString('en-US') + '</span>' + where + '</li>';
    }).join('');
    const goldHtml = byGold.map((row) => {
      const best = topGold > 0 && row.gold === topGold ? ' is-best' : '';
      const tag = best ? '<em>Most</em>' : '';
      return '<li class="raid-recap-row' + best + '"><span class="who">' + escapeHtml(row.name) + tag + '</span>' +
        '<span class="num">' + row.gold.toLocaleString('en-US') + ' gp</span></li>';
    }).join('');
    const dropHtml = drops.length
      ? drops.map((row) => {
        const rare = row.drop.rare ? ' is-rare' : '';
        return '<li class="raid-recap-drop' + rare + '">' + iconHtml(row.drop.osrsId, 36) +
          '<span><strong>' + escapeHtml(row.who) + '</strong>' +
          '<span>' + escapeHtml(row.drop.name) + '</span>' +
          '<em>from ' + escapeHtml(row.drop.from) + '</em></span></li>';
      }).join('')
      : '<li class="raid-recap-empty">Nobody took a drop.</li>';
    const path = killed.length
      ? 'Killed ' + joinNames(killed) + '.'
      : 'No room was cleared.';
    if (kickerEl) kickerEl.textContent = 'Raid over';
    if (phaseEl) phaseEl.textContent = raid.name || 'The raid';
    stageEl.innerHTML = '<p class="raid-recap-fell">The party fell to ' + escapeHtml(fellTo) + '.</p>' +
      '<p class="raid-recap-path">' + escapeHtml(path) + '</p>' +
      '<div class="raid-recap-cols">' +
        '<section><h3>Damage</h3><ol class="raid-recap-list">' + damageHtml + '</ol></section>' +
        '<section><h3>Gold</h3><ol class="raid-recap-list">' + goldHtml + '</ol></section>' +
        '<section><h3>Drops</h3><ol class="raid-recap-list">' + dropHtml + '</ol></section>' +
      '</div>';
    lootEl.classList.remove('is-intro');
    lootEl.classList.add('is-recap');
    lootEl.hidden = false;
    if (banner) banner.hidden = true;
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

  function drawMap(nodes, rooms, revealed, tokenPos) {
    const pts = (nodes || []).map((node) => node.x + ',' + node.y).join(' ');
    let marks = '';
    (nodes || []).forEach((node, i) => {
      const room = rooms && rooms[i];
      const sprite = i < revealed && room && room.boss && room.boss.sprite;
      marks += '<circle class="map-node" cx="' + node.x + '" cy="' + node.y + '" r="6.2"></circle>';
      if (sprite) {
        marks += '<image href="' + escapeHtml(sprite) + '" x="' + (node.x - 4.4) + '" y="' + (node.y - 4.4) + '" width="8.8" height="8.8"></image>';
      } else {
        marks += '<text class="map-q" x="' + node.x + '" y="' + (node.y + 0.6) + '">?</text>';
      }
    });
    const tokenMark = tokenPos
      ? '<circle class="map-token" cx="' + tokenPos.x.toFixed(2) + '" cy="' + tokenPos.y.toFixed(2) + '" r="2.15"></circle>'
      : '';
    stageEl.innerHTML = '<svg class="raid-map" viewBox="0 0 100 64" role="img" aria-label="Raid map">' +
      '<polyline class="map-path" points="' + pts + '"></polyline>' +
      marks + tokenMark + '</svg>';
  }

  function showOpening(data, token) {
    return new Promise((resolve) => {
      if (!lootEl || !stageEl) {
        resolve(token === rollToken);
        return;
      }
      if (kickerEl) kickerEl.textContent = 'Tonight';
      if (phaseEl) phaseEl.textContent = data.name || 'The raid';
      const nodes = data.map || [];
      const start = nodes[0] ? { x: Math.max(3, nodes[0].x - 9), y: nodes[0].y } : null;
      drawMap(nodes, data.rooms, 0, start);
      lootEl.classList.add('is-intro');
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      window.setTimeout(() => resolve(token === rollToken), 3200);
    });
  }

  function showTravel(data, fromIndex, token) {
    return new Promise((resolve) => {
      const nodes = data.map || [];
      const a = nodes[fromIndex];
      const b = nodes[fromIndex + 1];
      if (!lootEl || !stageEl || !a || !b) {
        resolve(token === rollToken);
        return;
      }
      if (kickerEl) kickerEl.textContent = 'Tonight';
      if (phaseEl) phaseEl.textContent = data.name || 'The raid';
      lootEl.classList.add('is-intro');
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      const started = performance.now();
      function frame(now) {
        if (token !== rollToken) {
          resolve(false);
          return;
        }
        const u = Math.min(1, (now - started) / 5000);
        const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        drawMap(nodes, data.rooms, fromIndex + 1, {
          x: a.x + (b.x - a.x) * ease,
          y: a.y + (b.y - a.y) * ease,
        });
        if (u < 1) requestAnimationFrame(frame);
        else resolve(true);
      }
      drawMap(nodes, data.rooms, fromIndex + 1, { x: a.x, y: a.y });
      requestAnimationFrame(frame);
    });
  }

  function showFightCard(boss, index, token) {
    return new Promise((resolve) => {
      if (!lootEl || !stageEl) {
        resolve(token === rollToken);
        return;
      }
      const tier = (boss && boss.tierName) || 'Medium';
      if (kickerEl) kickerEl.textContent = 'Raid Fight ' + (index + 1);
      if (phaseEl) phaseEl.textContent = (boss && boss.name) || 'Boss';
      stageEl.innerHTML = '<div class="raid-intro">' +
        (boss && boss.sprite ? '<img class="raid-boss-art" alt="" src="' + escapeHtml(boss.sprite) + '">' : '') +
        '<p class="raid-diff-label">Difficulty</p>' +
        '<p class="raid-diff is-' + tierSlug(tier) + '">' + escapeHtml(tier) + '</p>' +
      '</div>';
      lootEl.classList.add('is-intro');
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      window.setTimeout(() => resolve(token === rollToken), 3200);
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
    if (boss.skirmish) return boss.name + ' · ' + (boss.tierName || 'Light') + ' · level ' + (boss.level || 1);
    return boss.name + ' · ' + (boss.tierName || 'Medium') + ' · level ' + (boss.level || 1) + ' · ' + (boss.hp || 0) + ' hp · hits ' + (boss.maxHit || 0);
  }

  async function runRaid(data) {
    last = data;
    hideLoot();
    const token = rollToken;
    const rooms = data.rooms || [];
    const total = (data.map && data.map.length) || rooms.length;
    if (statusEl) statusEl.textContent = data.name || 'Tonight';
    if (notesEl) notesEl.textContent = total + ' rooms. The path stays hidden until you arrive. Anyone who dies stays down.';
    if (data.map && data.map.length) {
      const opened = await showOpening(data, token);
      if (!opened || token !== rollToken) return;
      clearLoot();
    }
    for (let i = 0; i < rooms.length; i++) {
      if (token !== rollToken) return;
      const room = rooms[i];
      const boss = room.boss || {};
      if (statusEl) statusEl.textContent = (i + 1) + ' / ' + total + ' · ' + (data.name || 'Tonight');
      if (notesEl) notesEl.textContent = 'Room ' + (i + 1) + ' of ' + total;
      paintScene(boss);
      const card = await showFightCard(boss, i, token);
      if (!card || token !== rollToken) return;
      if (notesEl) notesEl.textContent = bossLine(boss);
      clearLoot();
      await playBout(room.bout);
      if (token !== rollToken) return;
      const more = i < rooms.length - 1;
      const cleared = await showLoot(room, { wait: more, closing: !more });
      if (!cleared || !more || token !== rollToken) return;
      if (data.map && data.map.length > i + 1) {
        const moved = await showTravel(data, i, token);
        if (!moved || token !== rollToken) return;
      }
      clearLoot();
    }
  }

  function paintScene(boss) {
    const pit = document.getElementById('arena-pit');
    if (!pit) return;
    pit.classList.remove('is-lair', 'is-pasture', 'is-sewer', 'is-crandor', 'is-wild', 'is-pool');
    const known = {
      mole: 'is-lair',
      brutus: 'is-pasture',
      scurrius: 'is-sewer',
      cows: 'is-pasture',
      rats: 'is-sewer',
      elvarg: 'is-crandor',
      chaos: 'is-wild',
      leviathan: 'is-pool',
    };
    const scene = (boss && known[boss.id]) || (boss && boss.scene) || known[boss && boss.monster];
    if (scene) pit.classList.add(scene);
  }

  async function play(data) {
    if (data && data.raid) {
      runRaid(data);
      return;
    }
    paintScene(data && data.boss);
    last = data;
    hideLoot();
    const token = rollToken;
    const boss = data.boss;
    if (notesEl) {
      notesEl.textContent = boss
        ? boss.name + ' · ' + (boss.tierName || 'Medium') + ' · for ' + (boss.forLevel || boss.level || 1) + ' · party ' + (boss.level || 1) + ' · ' + boss.hp + ' hp · hits ' + (boss.maxHit || 0)
        : 'Step out of the orange.';
    }
    statusEl.textContent = boss ? boss.name : 'Raid';
    const shown = await showFightCard(boss, 0, token);
    if (!shown || token !== rollToken) return;
    clearLoot();
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
    if (!seedEl.value.trim() || (bossEl && bossEl.value === 'raid')) seedEl.value = String(Date.now());
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
    const home = { elvarg: 'easy', chaos: 'hard', leviathan: 'master' }[bossEl.value];
    if (!tonight && home && bossEl.dataset.home !== bossEl.value) tierEl.value = home;
    bossEl.dataset.home = bossEl.value;
  }

  if (bossEl) bossEl.addEventListener('change', syncTier);
  syncTier();

  fightBtn.addEventListener('click', () => fight());
  replayBtn.addEventListener('click', () => {
    if (last) play(last);
  });

  if (new URLSearchParams(location.search).has('live')) {
    fetch('/api/arena?replay=1')
      .then((res) => res.json())
      .then((data) => {
        const raid = data.last && data.last.raid;
        if (raid) play(raid);
      })
      .catch(() => {
        statusEl.textContent = 'Could not load tonight\'s raid.';
      });
  }

  fetch('/api/spoops')
    .then((res) => res.json())
    .then((data) => {
      renderPicks(data.spoops || []);
    })
    .catch(() => {
      statusEl.textContent = 'Could not load spoops.';
    });
})();
