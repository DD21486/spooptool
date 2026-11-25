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

  function hpPct(row) {
    return row && row.maxHp ? Math.max(0, Math.min(1, (Number(row.hp) || 0) / row.maxHp)) : 0;
  }

  function hpColor(pct) {
    return 'hsl(' + Math.round(120 * pct) + ' 72% 42%)';
  }

  // Health carries into the next room, so the summary shows what each survivor walks out with.
  function hpLine(row) {
    if (!row || !(row.maxHp > 0)) return '';
    const pct = hpPct(row);
    return '<i class="raid-hp" title="' + escapeHtml(row.hp + ' / ' + row.maxHp + ' hitpoints') + '">' +
      '<b style="width:' + (pct * 100).toFixed(1) + '%;background:' + hpColor(pct) + '"></b>' +
      '<small>' + row.hp + '/' + row.maxHp + '</small></i>';
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
      return '<div class="raid-share' + taker + best + '"><strong>' + escapeHtml(row.name) + '</strong><span>' + gold + '</span>' + dmg + hpLine(row) + '</div>';
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
      if (room.kind === 'treasure' || room.kind === 'altar' || room.kind === 'grave') {
        (room.shares || []).forEach((share) => {
          if (share) person(share.id, share.name).gold += Number(share.gold) || 0;
        });
        if (room.raised) person(room.raised.id, room.raised.name).fell = '';
        return;
      }
      if (room.kind === 'gear') {
        (room.gifts || []).forEach((gift) => {
          if (!gift) return;
          person(gift.id, gift.name).drops.push({
            name: gift.item,
            osrsId: gift.osrsId,
            rare: !!(room.chest && room.chest.id === 'dragon'),
            from: (room.chest && room.chest.name) || 'a chest',
          });
        });
        return;
      }
      if (room.kind === 'rest') return;
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
      .filter((room) => room.bout && room.bout.loot && !room.bout.loot.wiped && room.boss && room.boss.name && !room.boss.skirmish)
      .map((room) => room.boss.name);
    const chests = rooms.filter((room) => (room.kind === 'treasure' || room.kind === 'gear') && room.chest).map((room) => room.chest.name);
    const map = raid.map && !Array.isArray(raid.map) ? raid.map : null;
    const depth = map && map.layers
      ? 'Reached ' + (raid.route || []).length + ' of ' + map.layers + ' rooms.'
      : '';
    const headline = raid.cleared
      ? 'The party cleared the raid.'
      : 'The party fell to ' + fellTo + '.';
    const awardHtml = (raid.awards || []).length
      ? '<ul class="raid-awards">' + raid.awards.map((award) =>
        '<li class="raid-award is-' + escapeHtml(award.id) + '" title="' + escapeHtml(award.detail || '') + '">' +
          '<span>' + escapeHtml(award.name) + '</span><strong>' + escapeHtml(award.who) + '</strong></li>'
      ).join('') + '</ul>'
      : '';
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
    const path = (killed.length
      ? 'Killed ' + joinNames(killed) + '.'
      : 'No boss went down.') +
      (chests.length ? ' Opened a ' + joinNames(chests) + '.' : '') +
      (depth ? ' ' + depth : '');
    if (kickerEl) kickerEl.textContent = 'Raid over';
    if (phaseEl) phaseEl.textContent = raid.name || 'The raid';
    stageEl.innerHTML = '<p class="raid-recap-fell' + (raid.cleared ? ' is-clear' : '') + '">' + escapeHtml(headline) + '</p>' +
      '<p class="raid-recap-path">' + escapeHtml(path) + '</p>' +
      awardHtml +
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
      const line = stamp('Moving on in ' + left);
      const timer = window.setInterval(() => {
        if (token !== rollToken) {
          window.clearInterval(timer);
          resolve(false);
          return;
        }
        left -= 1;
        if (left <= 0) {
          window.clearInterval(timer);
          if (line) line.textContent = 'Moving on';
          resolve(true);
        } else if (line) {
          line.textContent = 'Moving on in ' + left;
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

  // Same waits as RAID_SHOW in lib/spoop/engine.js.
  const SHOW = { open: 10000, fork: 3600, travel: 5000, camp: 7000, chest: 8000, altar: 7000, grave: 7500, gear: 9000 };

  // Raids from before the branching map stored a plain list of points, one per room.
  function raidMap(data) {
    if (data && data.map && !Array.isArray(data.map) && Array.isArray(data.map.nodes)) {
      return { nodes: data.map.nodes, layers: data.map.layers || 0, route: data.route || [], choices: data.choices || [] };
    }
    const rooms = (data && data.rooms) || [];
    const pts = Array.isArray(data && data.map) && data.map.length
      ? data.map
      : rooms.map((room, i) => ({ x: 12 + (i / Math.max(1, rooms.length - 1)) * 76, y: 32 }));
    const nodes = pts.map((pt, i) => {
      const boss = (rooms[i] && rooms[i].boss) || {};
      return {
        id: 'n' + i,
        layer: i,
        x: pt.x,
        y: pt.y,
        kind: boss.skirmish ? 'swarm' : 'boss',
        name: boss.name || '',
        sprite: boss.sprite || '',
        next: i < pts.length - 1 ? ['n' + (i + 1)] : [],
      };
    });
    rooms.forEach((room, i) => {
      if (room && !room.node && nodes[i]) room.node = nodes[i].id;
    });
    return { nodes, layers: nodes.length, route: nodes.slice(0, rooms.length).map((node) => node.id), choices: [] };
  }

  function nodeArt(node) {
    if (node.sprite) return node.sprite;
    if (node.icon) return '/api/spoops?icon=1&id=' + Number(node.icon);
    return '';
  }

  function nodeLabel(node) {
    if (!node) return '';
    if (node.kind === 'rest' || node.kind === 'treasure' || node.kind === 'altar' || node.kind === 'grave' || node.kind === 'gear') return node.name;
    return node.name + (node.tierName ? ' · ' + node.tierName : '');
  }

  // What the map shows at a step: the nodes walked so far, and every option seen at a fork.
  // The ones the party passed up stay face up, dimmed.
  function mapView(map, step) {
    const walked = map.route.slice(0, step + 1);
    const seen = new Set(walked);
    const skipped = new Set();
    (map.choices || []).forEach((choice) => {
      const at = map.route.indexOf(choice.at);
      if (at < 0 || at >= step) return;
      choice.options.forEach((id) => {
        seen.add(id);
        if (id !== choice.pick) skipped.add(id);
      });
    });
    return { walked, seen, skipped, options: [], on: '', token: null, caption: '' };
  }

  function drawMap(map, view) {
    const byId = new Map(map.nodes.map((node) => [node.id, node]));
    const walked = view.walked || [];
    const steps = new Set();
    for (let i = 1; i < walked.length; i++) steps.add(walked[i - 1] + '>' + walked[i]);
    const options = new Set(view.options || []);
    const here = walked[walked.length - 1];
    let edges = '';
    map.nodes.forEach((node) => {
      (node.next || []).forEach((id) => {
        const to = byId.get(id);
        if (!to) return;
        const cls = steps.has(node.id + '>' + id)
          ? ' is-walked'
          : node.id === here && options.has(id) ? ' is-open' : '';
        edges += '<line class="map-edge' + cls + '" x1="' + node.x + '" y1="' + node.y + '" x2="' + to.x + '" y2="' + to.y + '"></line>';
      });
    });
    let marks = '';
    map.nodes.forEach((node) => {
      const face = view.seen.has(node.id) || options.has(node.id);
      const art = face ? nodeArt(node) : '';
      const cls = 'map-stop is-' + escapeHtml(node.kind || 'boss') +
        (walked.indexOf(node.id) >= 0 ? ' is-past' : '') +
        (options.has(node.id) ? ' is-option' : '') +
        (view.on === node.id ? ' is-on' : '') +
        (view.skipped && view.skipped.has(node.id) ? ' is-skipped' : '');
      marks += '<g class="' + cls + '" data-node="' + escapeHtml(node.id) + '">' +
        '<title>' + escapeHtml(face ? nodeLabel(node) : 'Unknown room') + '</title>' +
        '<circle class="map-node" cx="' + node.x + '" cy="' + node.y + '" r="4.6"></circle>' +
        (art
          ? '<image href="' + escapeHtml(art) + '" x="' + (node.x - 3.5) + '" y="' + (node.y - 3.5) + '" width="7" height="7" preserveAspectRatio="xMidYMid meet"></image>'
          : '<text class="map-q" x="' + node.x + '" y="' + (node.y + 0.4) + '">?</text>') +
      '</g>';
    });
    const token = view.token
      ? '<circle class="map-token" cx="' + view.token.x.toFixed(2) + '" cy="' + view.token.y.toFixed(2) + '" r="1.9"></circle>'
      : '';
    stageEl.innerHTML = '<svg class="raid-map" viewBox="0 0 100 64" role="img" aria-label="Raid map">' +
      edges + marks + token + '</svg>' +
      (view.caption ? '<p class="raid-map-line">' + escapeHtml(view.caption) + '</p>' : '');
  }

  function mapCard(data) {
    if (kickerEl) kickerEl.textContent = 'Tonight';
    if (phaseEl) phaseEl.textContent = data.name || 'The raid';
    lootEl.classList.add('is-intro');
    lootEl.hidden = false;
    if (banner) banner.hidden = true;
  }

  function showOpening(map, data, token) {
    return new Promise((resolve) => {
      if (!lootEl || !stageEl || !map.nodes.length) {
        resolve(token === rollToken);
        return;
      }
      mapCard(data);
      const first = map.nodes[0];
      const view = mapView(map, -1);
      view.token = { x: Math.max(2.5, first.x - 6), y: first.y };
      view.caption = map.layers + ' rooms deep. The path stays hidden until you get there.' +
        (data.twist ? ' Twist: ' + data.twist.name + '. ' + data.twist.detail : '');
      drawMap(map, view);
      window.setTimeout(() => resolve(token === rollToken), SHOW.open);
    });
  }

  // The options turn face up and the highlight hops between them until it lands on the party's pick.
  async function showFork(map, data, step, choice, token) {
    if (!lootEl || !stageEl) return token === rollToken;
    const started = performance.now();
    const byId = new Map(map.nodes.map((node) => [node.id, node]));
    const here = byId.get(map.route[step]);
    mapCard(data);
    if (phaseEl) phaseEl.textContent = 'The road splits';
    const view = mapView(map, step);
    view.options = choice.options;
    view.token = here ? { x: here.x, y: here.y } : null;
    view.caption = choice.options.map((id) => nodeLabel(byId.get(id))).join('  or  ');
    drawMap(map, view);
    const els = choice.options.map((id) => stageEl.querySelector('[data-node="' + id + '"]')).filter(Boolean);
    const land = Math.max(0, choice.options.indexOf(choice.pick));
    await spin(els, land, token);
    if (token !== rollToken) return false;
    const pick = byId.get(choice.pick);
    const line = stageEl.querySelector('.raid-map-line');
    if (line && pick) line.textContent = 'The party heads for ' + nodeLabel(pick) + '.';
    await wait(Math.max(400, SHOW.fork - (performance.now() - started)));
    return token === rollToken;
  }

  function showTravel(map, data, step, token) {
    return new Promise((resolve) => {
      const byId = new Map(map.nodes.map((node) => [node.id, node]));
      const a = byId.get(map.route[step]);
      const b = byId.get(map.route[step + 1]);
      if (!lootEl || !stageEl || !a || !b) {
        resolve(token === rollToken);
        return;
      }
      mapCard(data);
      const view = mapView(map, step + 1);
      view.caption = 'Next: ' + nodeLabel(b);
      const started = performance.now();
      function frame(now) {
        if (token !== rollToken) {
          resolve(false);
          return;
        }
        const u = Math.min(1, (now - started) / SHOW.travel);
        const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        view.token = { x: a.x + (b.x - a.x) * ease, y: a.y + (b.y - a.y) * ease };
        drawMap(map, view);
        if (u < 1) requestAnimationFrame(frame);
        else resolve(true);
      }
      view.token = { x: a.x, y: a.y };
      drawMap(map, view);
      requestAnimationFrame(frame);
    });
  }

  // The bars of whoever gets patched up fill to full a beat after the card opens.
  function showCamp(room, node, token) {
    return new Promise((resolve) => {
      if (!lootEl || !stageEl) {
        resolve(token === rollToken);
        return;
      }
      const healed = new Map((room.healed || []).map((row) => [row.id, row]));
      if (kickerEl) kickerEl.textContent = 'Camp';
      if (phaseEl) phaseEl.textContent = 'A short rest';
      const names = (room.party || []).filter((row) => healed.has(row.id)).map((row) => row.name);
      const line = names.length
        ? joinNames(names) + (names.length === 1 ? ' gets' : ' get') + ' patched up.'
        : 'Nobody needed patching up.';
      const rows = (room.party || []).map((row) => {
        const heal = healed.get(row.id);
        const before = heal ? { hp: heal.from, maxHp: heal.maxHp } : row;
        return '<div class="raid-share raid-camp-row' + (heal ? ' is-healed' : '') + '" data-id="' + escapeHtml(row.id) + '">' +
          '<strong>' + escapeHtml(row.name) + '</strong>' +
          hpLine(before) +
          (heal ? '<em class="raid-camp-gain">+' + (heal.to - heal.from) + '</em>' : '') +
        '</div>';
      }).join('');
      stageEl.innerHTML = '<div class="raid-camp">' +
        iconHtml((node && node.icon) || 385, 56) +
        '<p class="raid-chosen">' + escapeHtml(line) + '</p>' +
        '<div class="raid-shares">' + rows + '</div>' +
      '</div>';
      lootEl.classList.add('is-intro');
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      window.setTimeout(() => {
        if (token !== rollToken) return;
        healed.forEach((heal, id) => {
          const el = stageEl.querySelector('.raid-camp-row[data-id="' + id + '"]');
          if (!el) return;
          el.classList.add('is-full');
          const bar = el.querySelector('.raid-hp b');
          const text = el.querySelector('.raid-hp small');
          if (bar) {
            bar.style.width = '100%';
            bar.style.background = hpColor(1);
          }
          if (text) text.textContent = heal.to + '/' + heal.maxHp;
        });
      }, 1400);
      window.setTimeout(() => resolve(token === rollToken), SHOW.camp);
    });
  }

  // The chest rattles, opens, and the gold counts up before the split shows.
  function showChest(room, token) {
    return new Promise((resolve) => {
      const chest = room.chest || {};
      if (!lootEl || !stageEl) {
        resolve(token === rollToken);
        return;
      }
      if (kickerEl) kickerEl.textContent = 'Treasure';
      if (phaseEl) phaseEl.textContent = chest.name || 'A chest';
      stageEl.innerHTML = '<div class="raid-chest is-' + escapeHtml(chest.id || 'small') + ' is-shut">' +
        '<div class="raid-chest-box">' + iconHtml(chest.osrsId, 72) + '</div>' +
        '<p class="raid-gold raid-chest-gold">? gold</p>' +
        '<div class="raid-shares"></div>' +
      '</div>';
      lootEl.classList.add('is-intro');
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      const box = stageEl.querySelector('.raid-chest');
      const goldEl = stageEl.querySelector('.raid-chest-gold');
      const sharesEl = stageEl.querySelector('.raid-chest .raid-shares');
      const total = Number(chest.gold) || 0;
      window.setTimeout(() => {
        if (token !== rollToken || !box) return;
        box.classList.remove('is-shut');
        box.classList.add('is-open');
        const started = performance.now();
        function count(now) {
          if (token !== rollToken) return;
          const u = Math.min(1, (now - started) / 1400);
          const shown = Math.round(total * (1 - Math.pow(1 - u, 3)));
          if (goldEl) goldEl.innerHTML = shown.toLocaleString('en-US') + ' gold' + (u >= 1 ? ' <span>split by the living</span>' : '');
          if (u < 1) requestAnimationFrame(count);
          else if (sharesEl) {
            sharesEl.innerHTML = (room.shares || []).map((share) =>
              '<div class="raid-share"><strong>' + escapeHtml(share.name) + '</strong><span>' +
                Number(share.gold || 0).toLocaleString('en-US') + ' gp</span></div>'
            ).join('');
          }
        }
        requestAnimationFrame(count);
      }, 1800);
      window.setTimeout(() => resolve(token === rollToken), SHOW.chest);
    });
  }

  function showAltar(room, node, token) {
    return new Promise((resolve) => {
      if (!lootEl || !stageEl) {
        resolve(token === rollToken);
        return;
      }
      const healed = new Map((room.healed || []).map((row) => [row.id, row]));
      const title = room.gift === 'greed' ? 'Gold, and a curse' : room.gift === 'bless' ? 'A blessing' : 'The altar mends';
      if (kickerEl) kickerEl.textContent = 'Altar';
      if (phaseEl) phaseEl.textContent = title;
      let line = 'The altar blesses the party. They hit harder in the next fight.';
      if (room.gift === 'mend') {
        const names = (room.party || []).filter((row) => healed.has(row.id)).map((row) => row.name);
        line = names.length ? joinNames(names) + (names.length === 1 ? ' is' : ' are') + ' made whole.' : 'Nobody needed mending.';
      } else if (room.gift === 'greed') {
        const gold = (room.shares || []).reduce((sum, row) => sum + (Number(row.gold) || 0), 0);
        line = 'The altar pays ' + gold.toLocaleString('en-US') + ' gold. The next fight is cursed.';
      }
      const rows = room.gift === 'mend'
        ? (room.party || []).map((row) => {
          const heal = healed.get(row.id);
          const before = heal ? { hp: heal.from, maxHp: heal.maxHp } : row;
          return '<div class="raid-share raid-camp-row' + (heal ? ' is-healed' : '') + '" data-id="' + escapeHtml(row.id) + '">' +
            '<strong>' + escapeHtml(row.name) + '</strong>' + hpLine(before) +
            (heal ? '<em class="raid-camp-gain">+' + (heal.to - heal.from) + '</em>' : '') +
          '</div>';
        }).join('')
        : (room.shares || []).map((share) =>
          '<div class="raid-share"><strong>' + escapeHtml(share.name) + '</strong><span>' +
            Number(share.gold || 0).toLocaleString('en-US') + ' gp</span></div>'
        ).join('');
      stageEl.innerHTML = '<div class="raid-camp">' + iconHtml((node && node.icon) || 1718, 56) +
        '<p class="raid-chosen">' + escapeHtml(line) + '</p><div class="raid-shares">' + rows + '</div></div>';
      lootEl.classList.add('is-intro');
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      window.setTimeout(() => resolve(token === rollToken), SHOW.altar);
    });
  }

  function showGrave(room, node, token) {
    return new Promise((resolve) => {
      if (!lootEl || !stageEl) {
        resolve(token === rollToken);
        return;
      }
      let line = 'Nobody is buried here. A few coins in the dust.';
      let title = 'Quiet';
      if (room.act === 'raise' && room.raised) {
        title = 'Raised';
        line = room.raised.name + ' stands back up at ' + room.raised.to + ' of ' + room.raised.maxHp + ' hitpoints. The living pay for it.';
      } else if (room.act === 'loot') {
        title = 'Robbed';
        const left = (room.left || []).filter(Boolean);
        line = left.length ? 'They leave ' + joinNames(left) + ' and take the coins.' : 'They take the coins and leave the dead.';
      }
      if (kickerEl) kickerEl.textContent = 'Gravestone';
      if (phaseEl) phaseEl.textContent = title;
      const shares = (room.shares || []).map((share) => {
        const gold = Number(share.gold) || 0;
        const text = (gold < 0 ? '−' : '') + Math.abs(gold).toLocaleString('en-US') + ' gp';
        return '<div class="raid-share"><strong>' + escapeHtml(share.name) + '</strong><span>' + text + '</span></div>';
      }).join('');
      stageEl.innerHTML = '<div class="raid-camp">' + iconHtml((node && node.icon) || 526, 56) +
        '<p class="raid-chosen">' + escapeHtml(line) + '</p><div class="raid-shares">' + shares + '</div></div>';
      lootEl.classList.add('is-intro');
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      window.setTimeout(() => resolve(token === rollToken), SHOW.grave);
    });
  }

  function showGear(room, token) {
    return new Promise((resolve) => {
      const chest = room.chest || {};
      if (!lootEl || !stageEl) {
        resolve(token === rollToken);
        return;
      }
      if (kickerEl) kickerEl.textContent = chest.id === 'dragon' ? 'Dragon chest' : 'Rune chest';
      if (phaseEl) phaseEl.textContent = chest.name || 'A chest';
      stageEl.innerHTML = '<div class="raid-chest is-' + escapeHtml(chest.id || 'rune') + ' is-shut">' +
        '<div class="raid-chest-box">' + iconHtml(chest.osrsId, 72) + '</div>' +
        '<p class="raid-gold raid-chest-gold">' + (chest.rolls || 0) + ' rolls</p>' +
        '<div class="raid-shares"></div></div>';
      lootEl.classList.add('is-intro');
      lootEl.hidden = false;
      if (banner) banner.hidden = true;
      window.setTimeout(() => {
        if (token !== rollToken) return;
        const box = stageEl.querySelector('.raid-chest');
        if (box) {
          box.classList.remove('is-shut');
          box.classList.add('is-open');
        }
        const shares = stageEl.querySelector('.raid-chest .raid-shares');
        if (shares) {
          shares.innerHTML = (room.gifts || []).map((gift) =>
            '<div class="raid-share"><strong>' + escapeHtml(gift.name) + '</strong>' +
              iconHtml(gift.osrsId, 28) + '<span>' + escapeHtml(gift.item) + '</span></div>'
          ).join('');
        }
      }, 1800);
      window.setTimeout(() => resolve(token === rollToken), SHOW.gear);
    });
  }

  // After the last card the full recap takes over, unless a wipe already put it up.
  async function closeOut(data, token) {
    if (!lootEl || lootEl.classList.contains('is-recap')) return;
    await wait(7000);
    if (token !== rollToken) return;
    showRaidRecap(data);
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
    const map = raidMap(data);
    const rooms = data.rooms || [];
    const total = map.layers || map.route.length;
    const byId = new Map(map.nodes.map((node) => [node.id, node]));
    if (statusEl) statusEl.textContent = data.name || 'Tonight';
    if (notesEl) notesEl.textContent = total + ' rooms deep. Damage carries from room to room. An altar, a gravestone, or a chest can sit between the bosses. Anyone left in the ground stays down unless a stone raises them.';
    const opened = await showOpening(map, data, token);
    if (!opened || token !== rollToken) return;
    clearLoot();
    let fights = 0;
    for (let step = 0; step < map.route.length; step++) {
      if (token !== rollToken) return;
      const node = byId.get(map.route[step]) || {};
      const here = rooms.filter((room) => room.node === node.id);
      for (const room of here) {
        if (token !== rollToken) return;
        const more = rooms.indexOf(room) < rooms.length - 1;
        if (statusEl) statusEl.textContent = (step + 1) + ' / ' + total + ' · ' + (data.name || 'Tonight');
        if (notesEl) notesEl.textContent = 'Room ' + (step + 1) + ' of ' + total;
        if (room.kind === 'rest' || room.kind === 'treasure' || room.kind === 'altar' || room.kind === 'grave' || room.kind === 'gear') {
          const shown = room.kind === 'rest' ? await showCamp(room, node, token)
            : room.kind === 'treasure' ? await showChest(room, token)
            : room.kind === 'altar' ? await showAltar(room, node, token)
            : room.kind === 'grave' ? await showGrave(room, node, token)
            : await showGear(room, token);
          if (!shown || token !== rollToken) return;
          clearLoot();
          continue;
        }
        const boss = room.boss || {};
        paintScene(boss);
        const card = await showFightCard(boss, fights, token);
        fights += 1;
        if (!card || token !== rollToken) return;
        if (notesEl) notesEl.textContent = bossLine(boss);
        clearLoot();
        await playBout(room.bout);
        if (token !== rollToken) return;
        const wiped = !!(room.bout && room.bout.loot && room.bout.loot.wiped);
        const cleared = await showLoot(room, { wait: more && !wiped, closing: !more || wiped });
        if (token !== rollToken) return;
        if (!cleared || !more) {
          await closeOut(data, token);
          return;
        }
        clearLoot();
      }
      if (step < map.route.length - 1) {
        const choice = (map.choices || []).find((row) => row.at === node.id);
        if (choice && !(await showFork(map, data, step, choice, token))) return;
        if (!(await showTravel(map, data, step, token))) return;
        clearLoot();
      }
    }
  }

  function paintScene(boss) {
    const pit = document.getElementById('arena-pit');
    if (!pit) return;
    pit.classList.remove('is-lair', 'is-pasture', 'is-sewer', 'is-crandor', 'is-wild', 'is-pool', 'is-hillcave', 'is-ungael', 'is-kennel', 'is-mossy', 'is-kbdlair', 'is-kqlair', 'is-shrine');
    const known = {
      kq: 'is-kqlair',
      zulrah: 'is-shrine',
      bryophyta: 'is-mossy',
      kbd: 'is-kbdlair',
      obor: 'is-hillcave',
      vorkath: 'is-ungael',
      cerberus: 'is-kennel',
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
    const home = { elvarg: 'easy', chaos: 'hard', leviathan: 'master', obor: 'easy', vorkath: 'hard', cerberus: 'tough', bryophyta: 'easy', kbd: 'medium', kq: 'hard', sarachnis: 'easy', grotesque: 'medium', skotizo: 'tough', crazy: 'easy', zulrah: 'tough' }[bossEl.value];
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
