(function () {
  const pit = document.getElementById('arena-pit');
  const actorsEl = document.getElementById('arena-actors');
  const linesEl = document.getElementById('arena-lines');
  const fxEl = document.getElementById('arena-fx');
  const rosterEl = document.getElementById('arena-roster');
  const banner = document.getElementById('arena-banner');
  const statusEl = document.getElementById('arena-status');
  const countdownEl = document.getElementById('arena-countdown');
  const resultsEl = document.getElementById('arena-results');
  const waitEl = document.getElementById('arena-wait');
  const waitClock = document.getElementById('arena-wait-clock');
  const waitWhen = document.getElementById('arena-wait-when');

  const PACE = 0.55;
  const ARENA_SPEED = 1.5;
  const PK_SPEED = 2;

  let bout = null;
  let playing = false;
  let raf = 0;
  let playOrigin = 0;
  let playFrom = 0;
  let shownHit = 0;
  let shownDeath = 0;
  let nightDone = null;
  let clockOffset = 0;
  let worldNowMs = 0;
  let simMode = false;
  let nextAtMs = 0;
  let nextLabel = '';
  let fetchingNight = false;
  let retryAt = 0;
  const SEEN = 'spoop-arena-seen';
  const SEEN_PK = 'spoop-arena-pk-seen';
  const actors = new Map();
  const SPR = { ox: 6, width: 28, height: 24 };
  const WEAPON_GLOW = {
    crude: { color: '#c5ccd4', a: '0px', b: '0px' },
    worn: { color: '#f4f4f4', a: '1px', b: '2px' },
    standard: { color: '#3dff4a', a: '1px', b: '3px' },
    fine: { color: '#4aa3ff', a: '1px', b: '4px' },
    sharpened: { color: '#c084fc', a: '2px', b: '5px' },
    tempered: { color: '#ff8a1a', a: '2px', b: '7px' },
    masterwork: { color: '#ffe38a', a: '3px', b: '9px' },
  };
  const waitKicker = document.getElementById('arena-wait-kicker');
  const replayBtn = document.getElementById('arena-replay');
  const loadoutEl = document.createElement('div');
  loadoutEl.id = 'arena-loadout';
  loadoutEl.className = 'arena-loadout';
  loadoutEl.hidden = true;
  loadoutEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(loadoutEl);
  let loadoutId = '';
  const SOUND_KEY = 'spoop-arena-sound';
  const fightMusic = new Audio('/audio/fight_music.mp3');
  fightMusic.loop = true;
  fightMusic.preload = 'auto';
  const victoryMusic = new Audio('/audio/victory.mp3');
  victoryMusic.preload = 'auto';
  let musicMode = 'off';
  let soundOn = true;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (err) { /* private mode */ }

  function syncMute() {
    fightMusic.muted = !soundOn;
    victoryMusic.muted = !soundOn;
  }

  function stopFightMusic() {
    fightMusic.pause();
    fightMusic.currentTime = 0;
    if (musicMode === 'fight') musicMode = 'off';
  }

  function playFightMusic(fromStart) {
    syncMute();
    victoryMusic.pause();
    victoryMusic.currentTime = 0;
    if (fromStart || musicMode !== 'fight') fightMusic.currentTime = 0;
    musicMode = 'fight';
    const pending = fightMusic.play();
    if (pending) pending.catch(function () {});
  }

  function playVictoryMusic() {
    syncMute();
    fightMusic.pause();
    fightMusic.currentTime = 0;
    victoryMusic.currentTime = 0;
    musicMode = 'victory';
    const pending = victoryMusic.play();
    if (pending) pending.catch(function () {});
  }

  function primeTrack(audio, active) {
    if (active) {
      if (!audio.paused) return;
      const pending = audio.play();
      if (pending) pending.catch(function () {});
      return;
    }
    if (audio.dataset.primed || !audio.paused) return;
    const volume = audio.volume;
    audio.volume = 0;
    const pending = audio.play();
    if (!pending) return;
    pending.then(function () {
      const stillActive = (audio === fightMusic && musicMode === 'fight') || (audio === victoryMusic && musicMode === 'victory');
      if (!stillActive) {
        audio.pause();
        audio.currentTime = 0;
      }
      audio.volume = volume;
      audio.dataset.primed = '1';
    }).catch(function () {
      audio.volume = volume;
    });
  }

  function resumeMusic(ev) {
    if (!soundOn) return;
    if (ev && ev.target && ev.target.closest && ev.target.closest('#arena-sound')) return;
    primeTrack(fightMusic, musicMode === 'fight');
    primeTrack(victoryMusic, musicMode === 'victory');
  }

  function paintSound() {
    const btn = document.getElementById('arena-sound');
    if (!btn) return;
    btn.classList.toggle('is-off', !soundOn);
    btn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    btn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
    btn.title = soundOn ? 'Sound on' : 'Sound off';
  }

  function setSound(on) {
    soundOn = !!on;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (err) { /* private mode */ }
    syncMute();
    paintSound();
    if (soundOn) resumeMusic();
  }

  function mountSoundToggle() {
    if (!rosterEl || document.getElementById('arena-sound')) return;
    const bar = document.createElement('div');
    bar.className = 'roster-bar';
    rosterEl.parentNode.insertBefore(bar, rosterEl);
    bar.appendChild(rosterEl);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'arena-sound';
    btn.className = 'sound-toggle';
    btn.innerHTML =
      '<svg class="icon-on" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="currentColor" d="M4 9.2h3.4L12 4.8v14.4l-4.6-4.4H4z"/>' +
        '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M15.2 9.1a3.6 3.6 0 0 1 0 5.8"/>' +
        '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M17.5 6.8a6.6 6.6 0 0 1 0 10.4"/>' +
      '</svg>' +
      '<svg class="icon-off" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="currentColor" d="M4 9.2h3.4L12 4.8v14.4l-4.6-4.4H4z"/>' +
        '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M16 9.2l4.6 5.6M20.6 9.2 16 14.8"/>' +
      '</svg>';
    bar.appendChild(btn);
    btn.addEventListener('click', function () { setSound(!soundOn); });
    paintSound();
  }

  syncMute();
  mountSoundToggle();
  window.addEventListener('pointerdown', resumeMusic);
  window.addEventListener('keydown', resumeMusic);

  const EQUIP_GRID = [
    [null, 'head', null],
    ['cape', 'neck', 'ammo'],
    ['weapon', 'body', 'shield'],
    [null, 'legs', null],
    ['gloves', 'boots', 'ring'],
  ];

  const QUALITY_COLOR = {
    crude: '#9d9d9d',
    worn: '#ffffff',
    standard: '#1eff00',
    fine: '#0070dd',
    sharpened: '#a335ee',
    tempered: '#ff8000',
    masterwork: '#e6cc80',
  };

  function mountPitZoom() {
    if (!pit || pit.querySelector('.pit-stage')) return;
    const stage = document.createElement('div');
    stage.className = 'pit-stage';
    const stay = new Set([banner, waitEl].filter(Boolean));
    Array.from(pit.children).forEach((child) => {
      if (!stay.has(child)) stage.appendChild(child);
    });
    pit.insertBefore(stage, pit.firstChild);
    const controls = document.createElement('div');
    controls.className = 'pit-zoom';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Pit zoom');
    controls.innerHTML = '<button type="button" data-zoom="in" aria-label="Zoom in">+</button>' +
      '<button type="button" data-zoom="out" aria-label="Zoom out">−</button>';
    pit.appendChild(controls);

    let scale = 1;
    let x = 0;
    let y = 0;
    let drag = null;

    function clamp() {
      const vw = pit.clientWidth;
      const vh = pit.clientHeight;
      x = Math.min(0, Math.max(vw - vw * scale, x));
      y = Math.min(0, Math.max(vh - vh * scale, y));
    }

    function apply() {
      stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
      pit.classList.toggle('is-zoom', scale > 1.01);
    }

    function zoomAt(clientX, clientY, next) {
      const rect = pit.getBoundingClientRect();
      const ox = clientX - rect.left;
      const oy = clientY - rect.top;
      const clamped = Math.min(4, Math.max(1, next));
      const k = clamped / scale;
      x = ox - (ox - x) * k;
      y = oy - (oy - y) * k;
      scale = clamped;
      if (scale === 1) {
        x = 0;
        y = 0;
      }
      clamp();
      apply();
    }

    pit.addEventListener('wheel', (ev) => {
      if (ev.target.closest('.pit-zoom')) return;
      ev.preventDefault();
      zoomAt(ev.clientX, ev.clientY, scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12));
    }, { passive: false });

    pit.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.pit-zoom') || scale <= 1.01) return;
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
      pit.classList.add('is-drag');
      pit.setPointerCapture(ev.pointerId);
    });

    pit.addEventListener('pointermove', (ev) => {
      if (!drag || drag.id !== ev.pointerId) return;
      x += ev.clientX - drag.x;
      y += ev.clientY - drag.y;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      clamp();
      apply();
    });

    function endDrag(ev) {
      if (!drag || drag.id !== ev.pointerId) return;
      drag = null;
      pit.classList.remove('is-drag');
    }
    pit.addEventListener('pointerup', endDrag);
    pit.addEventListener('pointercancel', endDrag);

    pit.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.pit-zoom')) return;
      zoomAt(ev.clientX, ev.clientY, scale > 1.01 ? 1 : 2);
    });

    controls.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-zoom]');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const rect = pit.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const op = btn.getAttribute('data-zoom');
      zoomAt(cx, cy, op === 'in' ? scale * 1.35 : scale / 1.35);
    });
  }
  mountPitZoom();
  let fightTitle = 'Spoopfight';
  let playSpeed = ARENA_SPEED;
  let introducing = false;
  let introToken = 0;
  const INTRO_MS = 2000;
  const INTRO_HOLD = 1050;
  const FIGHT_CALL_MS = 720;
  let pkAtMs = 0;
  let pkA = '';
  let pkB = '';
  let pkReason = '';
  let lastFetchAt = 0;
  let replayLast = null;
  let holdPk = '';
  let holdNight = '';

  function gearPiece(fighter, slot) {
    const loadout = fighter && fighter.loadout;
    if (loadout && Object.prototype.hasOwnProperty.call(loadout, slot)) return loadout[slot];
    const item = fighter && fighter.equipped && fighter.equipped[slot];
    if (!item || !item.osrsId) return null;
    return { osrsId: item.osrsId, quality: item.quality || null };
  }

  function gearCells(fighter) {
    return EQUIP_GRID.map((row) => row.map((slot) => {
      if (!slot) return '<div></div>';
      const item = gearPiece(fighter, slot);
      const id = item ? parseInt(item.osrsId, 10) : 0;
      const color = item && QUALITY_COLOR[item.quality];
      const style = color ? ' style="border-color:' + color + '"' : '';
      const icon = id > 0
        ? '<img src="/api/spoops?icon=1&id=' + id + '" alt="" width="36" height="36">'
        : '';
      return '<div class="spoop-slot"' + style + '>' + icon + '</div>';
    }).join('')).join('');
  }

  function fighterFrom(id) {
    if (!bout || !id) return null;
    return bout.fighters.find((f) => f.id === id) || null;
  }

  function showLoadout(fighter) {
    if (!fighter) return;
    if (loadoutId === fighter.id && !loadoutEl.hidden) return;
    loadoutId = fighter.id;
    loadoutEl.innerHTML = '<div class="loadout-grid">' + gearCells(fighter) + '</div>';
    loadoutEl.hidden = false;
  }

  function hideLoadout() {
    loadoutId = '';
    loadoutEl.hidden = true;
    loadoutEl.innerHTML = '';
  }

  function bindLoadout(root, selector) {
    if (!root) return;
    root.addEventListener('pointerover', (ev) => {
      const node = ev.target.closest(selector);
      if (!node || !root.contains(node)) return;
      const fighter = fighterFrom(node.getAttribute('data-id'));
      if (fighter) showLoadout(fighter);
    });
    root.addEventListener('pointerout', (ev) => {
      const node = ev.target.closest(selector);
      if (!node || !root.contains(node)) return;
      const next = ev.relatedTarget;
      if (next && node.contains(next)) return;
      const onto = next && next.closest && next.closest('.actor, .tile');
      if (onto && (actorsEl.contains(onto) || rosterEl.contains(onto))) return;
      hideLoadout();
    });
  }
  bindLoadout(actorsEl, '.actor');
  bindLoadout(rosterEl, '.tile');

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function place(el, x, y, width, height) {
    el.style.left = (x / width) * 100 + '%';
    el.style.top = (y / height) * 100 + '%';
  }

  function aimOf(pt) {
    return pt && pt[3] ? pt[3] : null;
  }

  function sampleTrack(pts, t) {
    if (!pts.length) return { x: 50, y: 36, moving: false, target: null };
    if (t <= pts[0][0]) return { x: pts[0][1], y: pts[0][2], moving: false, target: aimOf(pts[0]) };
    const last = pts[pts.length - 1];
    if (t >= last[0]) return { x: last[1], y: last[2], moving: false, target: aimOf(last) };
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] <= t) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    const span = b[0] - a[0] || 1;
    const u = (t - a[0]) / span;
    return {
      x: a[1] + (b[1] - a[1]) * u,
      y: a[2] + (b[2] - a[2]) * u,
      moving: Math.hypot(b[1] - a[1], b[2] - a[2]) > 0.15,
      faceLeft: b[1] < a[1] - 0.05,
      target: aimOf(a),
    };
  }

  function drawAims() {
    if (!linesEl || !bout) return;
    const rect = linesEl.getBoundingClientRect();
    const sx = rect.width / 100;
    const sy = rect.height / 72;
    if (!(sx > 0) || !(sy > 0)) {
      linesEl.innerHTML = '';
      return;
    }
    const n = (v) => v.toFixed(2);
    let markup = '';
    for (const f of bout.fighters) {
      const view = actors.get(f.id);
      if (!view || view.dead || !view.target) continue;
      const other = actors.get(view.target);
      if (!other || other.dead) continue;
      const dx = (other.x - view.x) * sx;
      const dy = (other.y - view.y) * sy;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) continue;
      const ux = dx / dist;
      const uy = dy / dist;
      const px = -uy;
      const py = ux;
      const chest = 16;
      const reach = 1 / Math.hypot(ux / 12, uy / 16);
      const start = reach + 1;
      const tip = start + 16;
      const base = tip - 8;
      const wing = 4.5;
      const at = (along, side) => ({
        x: view.x + (ux * along + px * side) / sx,
        y: view.y - chest / sy + (uy * along + py * side) / sy,
      });
      const a = at(start, 0);
      const b = at(base, 0);
      const h1 = at(base, wing);
      const h2 = at(base, -wing);
      const c = at(tip, 0);
      markup += '<line x1="' + n(a.x) + '" y1="' + n(a.y) + '" x2="' + n(b.x) + '" y2="' + n(b.y) + '"/>' +
        '<polygon points="' + n(c.x) + ',' + n(c.y) + ' ' + n(h1.x) + ',' + n(h1.y) + ' ' + n(h2.x) + ',' + n(h2.y) + '"/>';
    }
    linesEl.innerHTML = markup;
  }

  function hpColor(pct) {
    const hue = Math.round(120 * Math.max(0, Math.min(1, pct)));
    return 'hsl(' + hue + ' 72% 42%)';
  }

  function setHp(fighter, hp) {
    const pct = fighter.maxHp ? hp / fighter.maxHp : 0;
    const view = actors.get(fighter.id);
    if (!view) return;
    view.hp = hp;
    view.bar.style.width = Math.max(0, pct * 100) + '%';
    view.bar.style.background = hpColor(pct);
    if (view.cardBar) {
      view.cardBar.style.width = Math.max(0, pct * 100) + '%';
      view.cardBar.style.background = hpColor(pct);
    }
  }

  function renderRoster(fight) {
    rosterEl.innerHTML = fight.fighters.map((f) => {
      const pray = f.prayer
        ? '<div class="tile-pray" title="' + escapeHtml(f.prayer.name) + '"><span></span></div>'
        : '';
      return '<li class="tile" data-id="' + f.id + '">' +
        '<div class="tile-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
        '<canvas width="16" height="24" data-spoop="' + escapeHtml(f.name) + '"></canvas>' +
        '<div class="tile-hp"><span></span></div>' +
        pray +
      '</li>';
    }).join('');
    if (!window.SpoopArt) return;
    fight.fighters.forEach((f) => {
      const canvas = rosterEl.querySelector('[data-id="' + f.id + '"] canvas');
      window.SpoopArt.drawSpoop(canvas, { name: f.name, equipped: f.equipped }, { clear: true });
    });
  }

  function mountActors(fight) {
    hideLoadout();
    actors.clear();
    actorsEl.innerHTML = '';
    fxEl.innerHTML = '';
    if (linesEl) linesEl.innerHTML = '';
    banner.hidden = true;
    const tracks = {};
    (fight.tracks || []).forEach((tr) => { tracks[tr.id] = tr.pts || []; });
    fight.fighters.forEach((f) => {
      const el = document.createElement('div');
      el.className = 'actor';
      el.setAttribute('data-id', f.id);
      const pray = f.prayer
        ? '<div class="pray" title="' + escapeHtml(f.prayer.name) + '">' +
            '<img class="pray-icon" alt="' + escapeHtml(f.prayer.name) + '" src="/assets/prayers/' + String(f.prayer.id || '').replace(/[^a-z0-9-]/g, '') + '.png">' +
            '<div class="pray-track"><span></span></div>' +
          '</div>'
        : '';
      el.innerHTML =
        '<div class="hud">' +
          pray +
          '<div class="hud-name">' + escapeHtml(f.name) + '</div>' +
          '<div class="hud-cb">Cb ' + f.combat + '</div>' +
          '<div class="hp-track"><span></span></div>' +
        '</div>' +
        '<div class="sprite-wrap"><div class="sprite-motion">' +
          '<canvas class="body-layer" width="28" height="24"></canvas>' +
          '<canvas class="weapon-glow" width="28" height="24"></canvas>' +
          '<canvas class="weapon-layer" width="28" height="24"></canvas>' +
          '<span class="swing-flash"></span>' +
        '</div></div>';
      el.querySelector('.hud').style.transform = 'translateY(' + ((f.id.charCodeAt(f.id.length - 1) % 3) - 1) * 7 + 'px)';
      actorsEl.appendChild(el);
      const card = rosterEl.querySelector('[data-id="' + f.id + '"]');
      const weapon = (f.equipped && f.equipped.weapon) || null;
      const view = {
        el,
        wrap: el.querySelector('.sprite-wrap'),
        motion: el.querySelector('.sprite-motion'),
        bodyCanvas: el.querySelector('.body-layer'),
        weaponGlow: el.querySelector('.weapon-glow'),
        weaponCanvas: el.querySelector('.weapon-layer'),
        spoop: { name: f.name, equipped: f.equipped },
        weapon,
        glow: weapon && WEAPON_GLOW[weapon.quality] || null,
        attackGen: 0,
        bar: el.querySelector('.hp-track > span'),
        pray: el.querySelector('.pray'),
        prayBar: el.querySelector('.pray-track > span'),
        prayer: f.prayer || null,
        card,
        cardBar: card ? card.querySelector('.tile-hp > span') : null,
        cardPray: card ? card.querySelector('.tile-pray > span') : null,
        pts: tracks[f.id] || [],
        hp: f.maxHp,
        dead: false,
        x: 0,
        y: 0,
      };
      actors.set(f.id, view);
      const start = sampleTrack(view.pts, 0);
      view.x = start.x;
      view.y = start.y;
      view.target = start.target || firstAim(view.pts);
      place(el, start.x, start.y, fight.width, fight.height);
      applyGlow(view);
      paintLayers(view, 'idle');
      setHp(f, f.maxHp);
      setPrayer(view, 0);
    });
    actors.forEach((view) => {
      const other = view.target ? actors.get(view.target) : null;
      if (other) view.wrap.classList.toggle('is-left', other.x < view.x - 0.35);
    });
  }

  function firstAim(pts) {
    for (let i = 0; i < pts.length; i++) {
      const id = aimOf(pts[i]);
      if (id) return id;
    }
    return null;
  }

  function paintLayers(view, pose) {
    if (!window.SpoopArt || !view || !view.bodyCanvas) return;
    const common = {
      clear: true,
      pose: pose || 'idle',
      ox: SPR.ox,
      width: SPR.width,
      height: SPR.height,
    };
    window.SpoopArt.drawSpoop(view.bodyCanvas, view.spoop, Object.assign({ layer: 'body' }, common));
    if (view.weaponGlow) window.SpoopArt.drawSpoop(view.weaponGlow, view.spoop, Object.assign({ layer: 'weapon' }, common));
    if (view.weaponCanvas) window.SpoopArt.drawSpoop(view.weaponCanvas, view.spoop, Object.assign({ layer: 'weapon' }, common));
  }

  function applyGlow(view) {
    const glowEl = view && view.weaponGlow;
    if (!glowEl) return;
    const quality = view.weapon && view.weapon.quality;
    const glow = view.glow;
    glowEl.className = 'weapon-glow' + (quality ? ' q-' + quality : '');
    const color = glow ? glow.color : '#e7edf2';
    glowEl.style.setProperty('--glow', color);
    glowEl.style.setProperty('--glow-a', glow ? glow.a : '0px');
    glowEl.style.setProperty('--glow-b', glow ? glow.b : '0px');
    if (view.motion) view.motion.style.setProperty('--glow', color);
  }

  function swingColor(view) {
    if (view && view.glow && view.weapon && view.weapon.quality && view.weapon.quality !== 'crude') return view.glow.color;
    return '#fff6d0';
  }

  function facingLeft(view, pos, prevX) {
    if (pos && pos.target) {
      const other = actors.get(pos.target);
      if (other && !other.dead) return other.x < pos.x - 0.35;
    }
    if (pos && pos.moving) {
      if (pos.faceLeft != null) return !!pos.faceLeft;
      return pos.x < prevX - 0.02;
    }
    return view.wrap.classList.contains('is-left');
  }

  function faceView(view, other) {
    if (!view || !other || !view.wrap) return;
    view.wrap.classList.toggle('is-left', other.x < view.x - 0.35);
  }

  function setPrayer(view, t) {
    if (!view || !view.prayer) return;
    const left = view.dead ? 0 : Math.max(0, view.prayer.max - view.prayer.rate * t);
    const on = left > 0.05;
    if (view.pray) view.pray.hidden = !on;
    const width = view.prayer.max ? Math.max(0, left / view.prayer.max * 100) + '%' : '0%';
    if (view.prayBar) view.prayBar.style.width = width;
    if (view.cardPray) {
      view.cardPray.parentElement.hidden = !on;
      view.cardPray.style.width = width;
    }
  }

  function floater(x, y, amount, miss) {
    const el = document.createElement('div');
    el.className = 'hitsplat' + (miss ? ' is-zero' : '');
    const num = document.createElement('span');
    num.textContent = miss ? '0' : String(amount);
    el.appendChild(num);
    const jx = Math.round(Math.random() * 8 - 4);
    const jy = Math.round(Math.random() * 6 - 3);
    el.style.left = 'calc(' + (x / bout.width * 100).toFixed(2) + '% + ' + jx + 'px)';
    el.style.top = 'calc(' + ((y - 4.2) / bout.height * 100).toFixed(2) + '% + ' + jy + 'px)';
    fxEl.appendChild(el);
    window.setTimeout(() => el.remove(), 1200);
  }

  function slash(from, to, color) {
    if (!fxEl || !bout || !from || !to) return;
    const el = document.createElement('div');
    el.className = 'slash';
    const y0 = from.y - 3.1;
    const y1 = to.y - 3.1;
    const dx = to.x - from.x;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy) || 1;
    const reach = Math.min(3.8, dist * 0.45);
    const x = from.x + (dx / dist) * reach;
    const y = y0 + (dy / dist) * reach;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    el.style.left = (x / bout.width * 100) + '%';
    el.style.top = (y / bout.height * 100) + '%';
    el.style.setProperty('--slash', color || '#fff6d0');
    el.style.setProperty('--spin', (angle - 58) + 'deg');
    fxEl.appendChild(el);
    window.setTimeout(() => el.remove(), 320);
  }

  function shot(from, to, style, color, bright) {
    if (!fxEl || !bout || !from || !to) return;
    const el = document.createElement('div');
    const magic = style === 'magic';
    el.className = 'shot ' + (magic ? 'shot-magic' : 'shot-ranged') + (bright ? ' is-bright' : '');
    el.style.setProperty('--shot', color || (magic ? '#8eb6ff' : '#d9f5c4'));
    const dx = to.x - from.x;
    const dy = (to.y - 4.6) - (from.y - 3.4);
    const dist = Math.hypot(dx, dy) || 1;
    const x0 = ((from.x + (dx / dist) * 1.5) / bout.width) * 100;
    const y0 = (((from.y - 3.4) + (dy / dist) * 0.7) / bout.height) * 100;
    const x1 = (to.x / bout.width) * 100;
    const y1 = ((to.y - 4.6) / bout.height) * 100;
    const angle = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    el.style.left = x0 + '%';
    el.style.top = y0 + '%';
    if (!magic) el.style.transform = 'rotate(' + angle + 'deg)';
    fxEl.appendChild(el);
    const t0 = performance.now();
    const travel = magic ? 430 : 340;
    function step(now) {
      if (!el.isConnected) return;
      const u = Math.min(1, (now - t0) / travel);
      el.style.left = (x0 + (x1 - x0) * u) + '%';
      el.style.top = (y0 + (y1 - y0) * u) + '%';
      if (u < 1) requestAnimationFrame(step);
      else el.remove();
    }
    requestAnimationFrame(step);
  }

  function playAttack(view, style, victim) {
    if (!view || view.dead) return;
    const gen = (view.attackGen || 0) + 1;
    view.attackGen = gen;
    if (view.attackRaf) cancelAnimationFrame(view.attackRaf);
    const kind = style === 'ranged' ? 'ranged' : style === 'magic' ? 'magic' : 'melee';
    const seq = kind === 'ranged'
      ? [['draw', 0], ['idle', 150]]
      : kind === 'magic'
        ? [['cast', 0], ['idle', 200]]
        : [['windup', 0], ['strike', 70], ['idle', 200]];
    const doneAt = kind === 'ranged' ? 250 : kind === 'magic' ? 310 : 290;
    view.el.classList.remove('is-lunge', 'is-draw', 'is-cast');
    if (view.weaponGlow) view.weaponGlow.classList.remove('is-hot');
    void view.el.offsetWidth;
    view.el.classList.add(kind === 'ranged' ? 'is-draw' : kind === 'magic' ? 'is-cast' : 'is-lunge');
    const t0 = performance.now();
    let shown = '';
    function tick(now) {
      if (view.attackGen !== gen || !view.el.isConnected) return;
      const elapsed = now - t0;
      let pose = 'idle';
      for (let i = 0; i < seq.length; i++) if (elapsed >= seq[i][1]) pose = seq[i][0];
      if (pose !== shown) {
        shown = pose;
        paintLayers(view, pose);
        if (view.weaponGlow) view.weaponGlow.classList.toggle('is-hot', !!view.weapon && pose !== 'idle');
        if (pose === 'strike' && victim) slash(view, victim, swingColor(view));
      }
      if (elapsed < doneAt) view.attackRaf = requestAnimationFrame(tick);
      else {
        view.el.classList.remove('is-lunge', 'is-draw', 'is-cast');
        if (view.weaponGlow) view.weaponGlow.classList.remove('is-hot');
        paintLayers(view, 'idle');
      }
    }
    view.attackRaf = requestAnimationFrame(tick);
  }

  function applyEvent(hit) {
    const attacker = bout.fighters.find((f) => f.id === hit.from);
    const victim = bout.fighters.find((f) => f.id === hit.to);
    const from = actors.get(hit.from);
    const to = actors.get(hit.to);
    if (!attacker || !victim || !to) return;
    setHp(victim, hit.hp);
    if (hit.miss) floater(to.x, to.y, 0, true);
    else floater(to.x, to.y, hit.amount, false);
    if (!from) return;
    faceView(from, to);
    playAttack(from, hit.style, to);
    if (hit.style === 'melee') return;
    const color = from.glow && from.glow.color;
    const bright = !!(from.weapon && (from.weapon.quality === 'tempered' || from.weapon.quality === 'masterwork'));
    const wait = hit.style === 'magic' ? 120 : 140;
    window.setTimeout(() => {
      if (!from.el.isConnected || !bout) return;
      shot(from, to, hit.style, color, bright);
    }, wait);
  }

  function applyDeath(death) {
    const view = actors.get(death.id);
    if (view) {
      view.dead = true;
      view.attackGen = (view.attackGen || 0) + 1;
      if (view.attackRaf) cancelAnimationFrame(view.attackRaf);
      view.el.classList.add('is-dead');
      view.el.classList.remove('is-lunge', 'is-draw', 'is-cast');
      if (view.weaponGlow) view.weaponGlow.classList.remove('is-hot');
      paintLayers(view, 'idle');
      if (view.pray) view.pray.hidden = true;
      if (view.cardPray) view.cardPray.parentElement.hidden = true;
      if (view.card) view.card.classList.add('is-dead');
      bloodPool(view.x, view.y);
    }
  }

  function bloodPool(x, y) {
    if (!fxEl || !bout) return;
    const el = document.createElement('div');
    el.className = 'blood-pool';
    const jx = Math.round(Math.random() * 6 - 3);
    const jy = Math.round(Math.random() * 4 - 1);
    el.style.left = 'calc(' + (x / bout.width * 100).toFixed(2) + '% + ' + jx + 'px)';
    el.style.top = 'calc(' + (y / bout.height * 100).toFixed(2) + '% + ' + jy + 'px)';
    el.style.setProperty('--pool', (0.85 + Math.random() * 0.35).toFixed(2));
    el.style.setProperty('--spin', Math.round(Math.random() * 36 - 18) + 'deg');
    fxEl.appendChild(el);
  }

  function standingCount(t) {
    let n = bout.fighters.length;
    for (const d of bout.deaths) if (d.t <= t) n -= 1;
    return Math.max(1, n);
  }

  function finish() {
    playing = false;
    cancelAnimationFrame(raf);
    const winner = bout.fighters.find((f) => f.id === bout.winnerId);
    if (winner) playVictoryMusic();
    else stopFightMusic();
    if (winner) {
      const view = actors.get(winner.id);
      if (view) {
        view.el.classList.add('is-winner');
        if (view.card) view.card.classList.add('is-winner');
      }
      banner.hidden = false;
      const note = bout.pkNote ? ' · ' + bout.pkNote : '';
      banner.innerHTML = '<span class="text-xs uppercase tracking-wide">Winner</span><strong>' +
        escapeHtml(winner.name) + '</strong><span class="text-sm text-slate-300">Combat ' + winner.combat +
        (bout.called ? ' · time called' : '') + escapeHtml(note) + '</span>';
    }
    if (linesEl) linesEl.innerHTML = '';
    statusEl.textContent = winner ? winner.name + ' wins.' : 'The pit is empty.';
    const done = nightDone;
    nightDone = null;
    if (done) done();
  }

  function frame(now) {
    if (!playing || !bout) return;
    const t = playFrom + ((now - playOrigin) / 1000) * playSpeed * PACE;
    for (const f of bout.fighters) {
      const view = actors.get(f.id);
      if (!view || view.dead) continue;
      const pos = sampleTrack(view.pts, t);
      const prevX = view.x;
      view.x = pos.x;
      view.y = pos.y;
      view.target = pos.target;
      place(view.el, pos.x, pos.y, bout.width, bout.height);
      view.wrap.classList.toggle('is-left', facingLeft(view, pos, prevX));
      view.wrap.classList.toggle('is-walk', !!pos.moving);
      setPrayer(view, t);
    }
    while (shownHit < bout.hits.length && bout.hits[shownHit].t <= t) {
      applyEvent(bout.hits[shownHit]);
      shownHit += 1;
    }
    while (shownDeath < bout.deaths.length && bout.deaths[shownDeath].t <= t) {
      applyDeath(bout.deaths[shownDeath]);
      shownDeath += 1;
    }
    drawAims();
    if (t < bout.duration && standingCount(t) > 1) {
      statusEl.textContent = fightTitle;
      raf = requestAnimationFrame(frame);
    } else {
      finish();
    }
  }

  function arm(fight, title) {
    introToken += 1;
    introducing = false;
    cancelAnimationFrame(raf);
    playing = false;
    bout = fight;
    fightTitle = title || 'Spoopfight';
    playSpeed = fightTitle === 'PK' ? PK_SPEED : ARENA_SPEED;
    shownHit = 0;
    shownDeath = 0;
    renderRoster(fight);
    mountActors(fight);
    const call = pit && pit.querySelector('.fight-call');
    if (call) {
      call.classList.remove('is-on');
      call.hidden = true;
    }
    statusEl.textContent = fightTitle;
  }

  function pitCenter() {
    const stage = pit && pit.querySelector('.pit-stage');
    const pitRect = pit.getBoundingClientRect();
    const stageRect = stage ? stage.getBoundingClientRect() : pitRect;
    if (!stageRect.width || !stageRect.height) return { x: bout.width / 2, y: bout.height * 0.58 };
    const cx = pitRect.left + pitRect.width / 2;
    const cy = pitRect.top + pitRect.height * 0.58;
    return {
      x: ((cx - stageRect.left) / stageRect.width) * bout.width,
      y: ((cy - stageRect.top) / stageRect.height) * bout.height,
    };
  }

  function clearIntroPose(el) {
    el.style.transition = '';
    el.style.transform = '';
    el.style.opacity = '';
    el.classList.remove('is-hidden', 'is-entrance', 'is-flying');
  }

  function runIntro() {
    const token = ++introToken;
    introducing = true;
    playFightMusic(true);
    if (linesEl) linesEl.style.visibility = 'hidden';
    const order = (bout && bout.fighters) || [];
    order.forEach((f) => {
      const view = actors.get(f.id);
      if (view) view.el.classList.add('is-hidden');
    });
    const alive = () => token === introToken && bout;
    return new Promise((resolve) => {
      let index = 0;
      function finishIntro() {
        if (!alive()) {
          resolve(false);
          return;
        }
        introducing = false;
        if (linesEl) linesEl.style.visibility = '';
        resolve(true);
      }
      function showCall() {
        if (!alive()) {
          resolve(false);
          return;
        }
        let call = pit.querySelector('.fight-call');
        if (!call) {
          call = document.createElement('div');
          call.className = 'fight-call';
          call.textContent = 'Fight';
          pit.appendChild(call);
        }
        call.hidden = false;
        call.classList.remove('is-on');
        void call.offsetWidth;
        call.classList.add('is-on');
        window.setTimeout(() => {
          if (call) {
            call.classList.remove('is-on');
            call.hidden = true;
          }
          finishIntro();
        }, FIGHT_CALL_MS);
      }
      function step() {
        if (!alive()) {
          resolve(false);
          return;
        }
        if (index >= order.length) {
          showCall();
          return;
        }
        const fighter = order[index];
        index += 1;
        const view = actors.get(fighter.id);
        if (!view) {
          window.setTimeout(step, 0);
          return;
        }
        const spot = sampleTrack(view.pts, 0);
        const center = pitCenter();
        const el = view.el;
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -72%) scale(0.35)';
        place(el, center.x, center.y, bout.width, bout.height);
        el.classList.remove('is-hidden');
        el.classList.add('is-entrance');
        void el.offsetWidth;
        el.style.transition = 'transform 0.18s cubic-bezier(.15, 1.3, .35, 1), opacity 0.18s linear';
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%, -72%) scale(3.6)';
        window.setTimeout(() => {
          if (!alive()) return;
          el.classList.remove('is-entrance');
          el.classList.add('is-flying');
          el.style.transition = 'left 0.9s cubic-bezier(.5, .05, .25, 1), top 0.9s cubic-bezier(.5, .05, .25, 1), transform 0.9s cubic-bezier(.5, .05, .25, 1)';
          void el.offsetWidth;
          place(el, spot.x, spot.y, bout.width, bout.height);
          el.style.transform = 'translate(-50%, -100%) scale(1)';
        }, INTRO_HOLD);
        window.setTimeout(() => {
          if (!alive()) return;
          clearIntroPose(el);
          view.x = spot.x;
          view.y = spot.y;
          step();
        }, INTRO_MS);
      }
      step();
    });
  }

  function beginFight(withIntro) {
    if (withIntro) {
      runIntro().then((ok) => {
        if (ok) start();
      });
      return;
    }
    start();
  }

  function start() {
    if (!bout || playing) return;
    playFightMusic(false);
    shownHit = 0;
    shownDeath = 0;
    playFrom = 0;
    playOrigin = performance.now();
    playing = true;
    introducing = false;
    if (fxEl) fxEl.querySelectorAll('.blood-pool').forEach((el) => el.remove());
    if (linesEl) linesEl.style.visibility = '';
    if (banner) banner.hidden = true;
    if (resultsEl) resultsEl.hidden = true;
    if (waitEl) waitEl.hidden = true;
    bout.fighters.forEach((f) => {
      const view = actors.get(f.id);
      if (!view) return;
      view.dead = false;
      view.attackGen = (view.attackGen || 0) + 1;
      if (view.attackRaf) cancelAnimationFrame(view.attackRaf);
      view.el.classList.remove('is-dead', 'is-winner', 'is-lunge', 'is-draw', 'is-cast');
      if (view.weaponGlow) view.weaponGlow.classList.remove('is-hot');
      paintLayers(view, 'idle');
      if (view.card) view.card.classList.remove('is-dead', 'is-winner');
      setHp(f, f.maxHp);
      setPrayer(view, 0);
      const startPos = sampleTrack(view.pts, 0);
      view.x = startPos.x;
      view.y = startPos.y;
      view.target = startPos.target || firstAim(view.pts);
      place(view.el, startPos.x, startPos.y, bout.width, bout.height);
    });
    bout.fighters.forEach((f) => {
      const view = actors.get(f.id);
      if (!view || !view.target) return;
      const other = actors.get(view.target);
      if (other) view.wrap.classList.toggle('is-left', other.x < view.x - 0.35);
    });
    statusEl.textContent = fightTitle;
    raf = requestAnimationFrame(frame);
  }

  function formatRemain(ms) {
    const safe = Math.max(0, ms);
    const total = Math.floor(safe / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function worldMs() {
    return simMode ? worldNowMs : Date.now() + clockOffset;
  }

  function liveFor(atMs, fight, speed) {
    if (!atMs || !fight) return false;
    const duration = Number(fight.duration) || 0;
    const playback = (duration / (speed * PACE)) * 1000;
    const windowMs = Math.max(2 * 60 * 1000, playback + 60 * 1000);
    const age = worldMs() - atMs;
    return age >= -5000 && age <= windowMs;
  }

  function restPit() {
    introToken += 1;
    introducing = false;
    if (musicMode === 'fight') stopFightMusic();
    cancelAnimationFrame(raf);
    playing = false;
    bout = null;
    hideLoadout();
    banner.hidden = true;
    banner.innerHTML = '';
    actors.clear();
    actorsEl.innerHTML = '';
    fxEl.innerHTML = '';
    if (linesEl) {
      linesEl.innerHTML = '';
      linesEl.style.visibility = '';
    }
    const call = pit && pit.querySelector('.fight-call');
    if (call) {
      call.classList.remove('is-on');
      call.hidden = true;
    }
    rosterEl.innerHTML = '';
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    waitEl.hidden = false;
  }

  function syncReplay() {
    if (!replayBtn) return;
    const pkWaiting = !!(pkAtMs && worldMs() < pkAtMs);
    replayBtn.hidden = !(replayLast && replayLast.bout) || playing || pkWaiting;
  }

  function showPkWait(text) {
    countdownEl.classList.add('is-pk');
    waitEl.classList.add('is-pk');
    if (waitKicker) waitKicker.textContent = 'PK';
    countdownEl.textContent = (simMode ? 'Simulated · ' : '') + 'PK ' + text;
    waitClock.textContent = text;
    waitWhen.textContent = pkA + ' vs ' + pkB + (pkReason ? ' — ' + pkReason : '');
  }

  function showNightWait(text) {
    countdownEl.classList.remove('is-pk');
    waitEl.classList.remove('is-pk');
    if (waitKicker) waitKicker.textContent = 'Next Spoopfight';
    countdownEl.textContent = (simMode ? 'Simulated · ' : '') + 'Next Spoopfight ' + text;
    waitClock.textContent = text;
    waitWhen.textContent = nextLabel || '';
  }

  function tickCountdown() {
    if (playing || introducing) {
      if (countdownEl) countdownEl.textContent = fightTitle;
      if (replayBtn) replayBtn.hidden = true;
      return;
    }
    const nowMs = worldMs();
    if (pkAtMs && pkAtMs > nowMs) {
      showPkWait(formatRemain(pkAtMs - nowMs));
      return;
    }
    if (pkAtMs && pkAtMs <= nowMs && !simMode && !playing && !fetchingNight && Date.now() >= retryAt) {
      retryAt = Date.now() + 15000;
      loadNight();
      return;
    }
    if (!nextAtMs) {
      countdownEl.classList.remove('is-pk');
      waitEl.classList.remove('is-pk');
      if (waitKicker) waitKicker.textContent = 'Next Spoopfight';
      countdownEl.textContent = 'Next Spoopfight';
      waitClock.textContent = '--:--:--';
      return;
    }
    const remain = nextAtMs - nowMs;
    showNightWait(formatRemain(remain));
    if (!simMode && remain <= 0 && !playing && !fetchingNight && Date.now() >= retryAt) {
      retryAt = Date.now() + 20000;
      loadNight();
    }
  }

  function seenAt() {
    try { return localStorage.getItem(SEEN); } catch (err) { return null; }
  }

  function markSeen(at) {
    try { localStorage.setItem(SEEN, at); } catch (err) { /* private mode */ }
  }

  function seenPk() {
    try { return localStorage.getItem(SEEN_PK); } catch (err) { return null; }
  }

  function markPk(at) {
    try { localStorage.setItem(SEEN_PK, at); } catch (err) { /* private mode */ }
  }

  async function loadNight() {
    fetchingNight = true;
    lastFetchAt = Date.now();
    try {
      const res = await fetch('/api/arena');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the Spoopfight');
      worldNowMs = Date.parse(data.now);
      simMode = !!data.useSim;
      clockOffset = worldNowMs - Date.now();
      nextAtMs = data.nextAt ? Date.parse(data.nextAt) : 0;
      nextLabel = data.nextLabel || '';
      pkAtMs = data.pk && data.pk.fightAt ? Date.parse(data.pk.fightAt) : 0;
      pkA = data.pk ? data.pk.a || '' : '';
      pkB = data.pk ? data.pk.b || '' : '';
      pkReason = data.pk ? data.pk.reason || '' : '';
      const last = data.last;
      const lastPk = data.lastPk;
      replayLast = last && last.bout ? last : null;
      const waiting = !!(pkAtMs && worldMs() < pkAtMs);
      const pkLive = !!(lastPk && lastPk.bout && !waiting && holdPk !== lastPk.at && seenPk() !== lastPk.at && liveFor(Date.parse(lastPk.at), lastPk.bout, PK_SPEED));
      const nightLive = !!(last && last.bout && !waiting && !pkLive && holdNight !== last.at && seenAt() !== last.at && liveFor(Date.parse(last.at), last.bout, ARENA_SPEED));
      if (pkLive) {
        resultsEl.hidden = true;
        waitEl.hidden = true;
        lastPk.bout.pkNote = lastPk.item ? 'Took ' + lastPk.item : '';
        nightDone = function () {
          holdPk = lastPk.at;
          markPk(lastPk.at);
          restPit();
          statusEl.textContent = (lastPk.winner || 'Someone') + ' won the PK.';
          syncReplay();
          tickCountdown();
          loadNight();
        };
        arm(lastPk.bout, 'PK');
        beginFight(worldMs() - Date.parse(lastPk.at) < 15000);
      } else if (nightLive) {
        resultsEl.hidden = true;
        waitEl.hidden = true;
        nightDone = function () {
          holdNight = last.at;
          markSeen(last.at);
          restPit();
          statusEl.textContent = (last.winner || 'Someone') + ' won the Spoopfight.';
          syncReplay();
          tickCountdown();
        };
        arm(last.bout, 'Spoopfight');
        beginFight(worldMs() - Date.parse(last.at) < 15000);
      } else if (waiting) {
        restPit();
        statusEl.textContent = pkA + ' vs ' + pkB;
        syncReplay();
        tickCountdown();
      } else {
        restPit();
        statusEl.textContent = last && last.winner ? last.winner + ' won the last Spoopfight.' : 'Waiting for 9:00pm ET.';
        syncReplay();
        tickCountdown();
      }
    } catch (err) {
      statusEl.textContent = err.message;
    } finally {
      fetchingNight = false;
    }
  }

  if (document.body.getAttribute('data-page') === 'pit') {
    window.ArenaPit = {
      play(fight, speed) {
        if (waitEl) waitEl.hidden = true;
        nightDone = null;
        arm(fight, 'Test fight');
        const next = Number(speed);
        playSpeed = next > 0 ? next : ARENA_SPEED;
        beginFight(true);
      },
    };
    return;
  }

  if (replayBtn) replayBtn.addEventListener('click', function () {
    if (!replayLast || !replayLast.bout || playing) return;
    waitEl.hidden = true;
    replayBtn.hidden = true;
    nightDone = function () {
      restPit();
      statusEl.textContent = (replayLast.winner || 'Someone') + ' won the Spoopfight.';
      syncReplay();
      tickCountdown();
    };
    arm(replayLast.bout, 'Spoopfight');
    start();
  });

  window.setInterval(tickCountdown, 250);
  window.setInterval(() => {
    if (playing || fetchingNight || introducing) return;
    if (Date.now() - lastFetchAt < 30000) return;
    loadNight();
  }, 5000);
  loadNight();
})();
