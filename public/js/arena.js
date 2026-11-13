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
  const recapEl = document.getElementById('arena-recap');
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
  let onFightDone = null;
  let tourneyBusy = false;
  let tourneyToken = 0;
  let tourneySettleAt = 0;
  let clockOffset = 0;
  let worldNowMs = 0;
  let simMode = false;
  let nextAtMs = 0;
  let recapAt = '';
  let recapStatus = '';
  const LOG_KEY = 'spoop-arena-log';
  let logHidden = false;
  try { logHidden = localStorage.getItem(LOG_KEY) === 'off'; } catch (err) { logHidden = false; }
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
  const hitVoices = [];
  for (let i = 0; i < 8; i++) {
    const voice = new Audio('/audio/hit.mp3');
    voice.preload = 'auto';
    hitVoices.push(voice);
  }
  let hitVoice = 0;
  const fireVoices = [];
  for (let i = 0; i < 2; i++) {
    const voice = new Audio('/audio/dragon-fire.ogg');
    voice.preload = 'auto';
    fireVoices.push(voice);
  }
  let fireVoice = 0;
  const missVoices = [];
  for (let i = 0; i < 6; i++) {
    const voice = new Audio('/audio/miss.mp3');
    voice.preload = 'auto';
    missVoices.push(voice);
  }
  let missVoice = 0;
  const bowVoices = [];
  for (let i = 0; i < 4; i++) {
    const voice = new Audio('/audio/longbow.ogg');
    voice.preload = 'auto';
    bowVoices.push(voice);
  }
  let bowVoice = 0;
  const introVoices = [];
  for (let i = 0; i < 2; i++) {
    const voice = new Audio('/audio/fang-intro.ogg');
    voice.preload = 'auto';
    introVoices.push(voice);
  }
  let introVoice = 0;
  let musicMode = 'off';
  let soundOn = true;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (err) { /* private mode */ }

  function syncMute() {
    fightMusic.muted = !soundOn;
    victoryMusic.muted = !soundOn;
    fireVoices.forEach(function (audio) { audio.muted = !soundOn; });
    missVoices.forEach(function (audio) { audio.muted = !soundOn; });
    bowVoices.forEach(function (audio) { audio.muted = !soundOn; });
    introVoices.forEach(function (audio) { audio.muted = !soundOn; });
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

  const HIT_CUT = 0.53;

  function playHitSound(lethal) {
    if (!soundOn) return;
    const audio = hitVoices[hitVoice];
    hitVoice = (hitVoice + 1) % hitVoices.length;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = 0.86 + Math.random() * 0.3;
    audio.volume = 0.45 + Math.random() * 0.5;
    const gen = (Number(audio.dataset.gen) || 0) + 1;
    audio.dataset.gen = String(gen);
    audio.dataset.cut = lethal ? '' : '1';
    const pending = audio.play();
    if (pending) pending.catch(function () {});
    if (!lethal) watchHitCut(audio, gen);
  }

  function watchHitCut(audio, gen) {
    function step() {
      if (audio.dataset.gen !== String(gen) || audio.dataset.cut !== '1') return;
      if (audio.currentTime >= HIT_CUT) {
        audio.pause();
        return;
      }
      if (!audio.paused) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function playMissSound() {
    if (!soundOn) return;
    const audio = missVoices[missVoice];
    missVoice = (missVoice + 1) % missVoices.length;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = 0.86 + Math.random() * 0.3;
    audio.volume = 0.4 + Math.random() * 0.45;
    const pending = audio.play();
    if (pending) pending.catch(function () {});
  }

  function playBowSound() {
    if (!soundOn) return;
    const audio = bowVoices[bowVoice];
    bowVoice = (bowVoice + 1) % bowVoices.length;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = 0.9 + Math.random() * 0.2;
    audio.volume = 0.55 + Math.random() * 0.35;
    const pending = audio.play();
    if (pending) pending.catch(function () {});
  }

  function playIntroSound() {
    if (!soundOn) return;
    const audio = introVoices[introVoice];
    introVoice = (introVoice + 1) % introVoices.length;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = 0.86 + Math.random() * 0.3;
    audio.volume = 0.25 + Math.random() * 0.2;
    const pending = audio.play();
    if (pending) pending.catch(function () {});
  }

  function playFireSound() {
    if (!soundOn) return;
    const audio = fireVoices[fireVoice];
    fireVoice = (fireVoice + 1) % fireVoices.length;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.85;
    const pending = audio.play();
    if (pending) pending.catch(function () {});
  }

  function primeHits() {
    hitVoices.forEach(function (audio) {
      if (audio.dataset.primed) return;
      const volume = audio.volume;
      audio.volume = 0;
      const pending = audio.play();
      if (!pending) return;
      pending.then(function () {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        audio.playbackRate = 1;
        audio.dataset.primed = '1';
      }).catch(function () {
        audio.volume = volume;
      });
    });
  }

  function primeMisses() {
    missVoices.forEach(function (audio) {
      if (audio.dataset.primed) return;
      const volume = audio.volume;
      audio.volume = 0;
      const pending = audio.play();
      if (!pending) return;
      pending.then(function () {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        audio.playbackRate = 1;
        audio.dataset.primed = '1';
      }).catch(function () {
        audio.volume = volume;
      });
    });
  }

  function primeBows() {
    bowVoices.forEach(function (audio) {
      if (audio.dataset.primed) return;
      const volume = audio.volume;
      audio.volume = 0;
      const pending = audio.play();
      if (!pending) return;
      pending.then(function () {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        audio.playbackRate = 1;
        audio.dataset.primed = '1';
      }).catch(function () {
        audio.volume = volume;
      });
    });
  }

  function primeIntros() {
    introVoices.forEach(function (audio) {
      if (audio.dataset.primed) return;
      const volume = audio.volume;
      audio.volume = 0;
      const pending = audio.play();
      if (!pending) return;
      pending.then(function () {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        audio.playbackRate = 1;
        audio.dataset.primed = '1';
      }).catch(function () {
        audio.volume = volume;
      });
    });
  }

  function primeFires() {
    fireVoices.forEach(function (audio) {
      if (audio.dataset.primed) return;
      const volume = audio.volume;
      audio.volume = 0;
      const pending = audio.play();
      if (!pending) return;
      pending.then(function () {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        audio.dataset.primed = '1';
      }).catch(function () {
        audio.volume = volume;
      });
    });
  }

  function resumeMusic(ev) {
    if (!soundOn) return;
    if (ev && ev.target && ev.target.closest && ev.target.closest('#arena-sound')) return;
    primeTrack(fightMusic, musicMode === 'fight');
    primeTrack(victoryMusic, musicMode === 'victory');
    primeHits();
    primeMisses();
    primeBows();
    primeIntros();
    primeFires();
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
    const pot = document.createElement('div');
    pot.id = 'arena-pot';
    pot.className = 'arena-pot';
    pot.hidden = true;
    pot.innerHTML = '<span class="pot-kicker">Pot</span><strong id="arena-pot-value">0</strong><span class="pot-meta" id="arena-pot-meta"></span>';
    bar.insertBefore(pot, rosterEl);
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
    const stay = new Set([banner, waitEl, recapEl, document.getElementById('arena-log')].filter(Boolean));
    Array.from(pit.children).forEach((child) => {
      if (!stay.has(child)) stage.appendChild(child);
    });
    pit.insertBefore(stage, pit.firstChild);
    mountColosseum(stage);
    mountCombatLog();
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
      if (ev.target.closest('.pit-zoom, .combat-log-toggle')) return;
      ev.preventDefault();
      zoomAt(ev.clientX, ev.clientY, scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12));
    }, { passive: false });

    pit.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.pit-zoom, .combat-log-toggle') || scale <= 1.01) return;
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
      if (ev.target.closest('.pit-zoom, .combat-log-toggle')) return;
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
  let upcomingPot = null;
  let lastPot = null;
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
      const rate = item && item.rating != null ? '<span class="spoop-rate">' + item.rating + '</span>' : '';
      return '<div class="spoop-slot"' + style + '>' + icon + rate + '</div>';
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
    const gear = fighter.gearRating != null
      ? '<span class="loadout-gear">Gear ' + fighter.gearRating + '</span>'
      : '';
    loadoutEl.innerHTML = '<p class="loadout-name">' + escapeHtml(fighter.name) + gear + '</p>' +
      '<div class="loadout-grid">' + gearCells(fighter) + '</div>';
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
      if (fighter && !fighter.monster) showLoadout(fighter);
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

  function paintPot(purse) {
    const el = document.getElementById('arena-pot');
    const value = document.getElementById('arena-pot-value');
    const meta = document.getElementById('arena-pot-meta');
    if (!el || !value) return;
    if (!purse || purse.gold == null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    value.textContent = Number(purse.gold).toLocaleString();
    if (meta) {
      const bits = [];
      if (purse.avgLevel) bits.push('avg ' + purse.avgLevel);
      if (purse.count) bits.push(purse.count + ' in');
      meta.textContent = bits.join(' · ');
    }
  }

  const feedLines = [];

  function paintLogToggle() {
    const btn = document.getElementById('arena-log-toggle');
    const wrap = document.getElementById('arena-log');
    if (wrap) wrap.classList.toggle('is-hidden', logHidden);
    if (!btn) return;
    btn.textContent = logHidden ? 'Show log' : 'Hide log';
    btn.setAttribute('aria-pressed', logHidden ? 'true' : 'false');
    btn.setAttribute('aria-label', logHidden ? 'Show combat log' : 'Hide combat log');
  }

  function mountCombatLog() {
    if (!pit || document.getElementById('arena-log')) return;
    const wrap = document.createElement('div');
    wrap.id = 'arena-log';
    wrap.className = 'combat-log';
    wrap.innerHTML = '<button type="button" id="arena-log-toggle" class="combat-log-toggle">Hide log</button>' +
      '<ol id="arena-feed" class="combat-feed"></ol>';
    pit.appendChild(wrap);
    const btn = wrap.querySelector('.combat-log-toggle');
    btn.addEventListener('click', function () {
      logHidden = !logHidden;
      try { localStorage.setItem(LOG_KEY, logHidden ? 'off' : 'on'); } catch (err) { /* private mode */ }
      paintLogToggle();
    });
    paintLogToggle();
  }

  function clearFeed() {
    feedLines.length = 0;
    const feed = document.getElementById('arena-feed');
    if (feed) feed.innerHTML = '';
  }

  function pushFeed(text, kind) {
    const feed = document.getElementById('arena-feed');
    if (!feed) return;
    feedLines.push({ text, kind });
    if (feedLines.length > 8) feedLines.shift();
    feed.innerHTML = feedLines.map((row) => '<li class="' + row.kind + '">' + row.text + '</li>').join('');
  }

  function mountColosseum(stage) {
    if (!stage || stage.querySelector('.colosseum')) return;
    const robes = ['#3d4f73', '#6b3a3a', '#3f5c45', '#5c4a32', '#4a3d5c', '#6b5a3a', '#3a4a55'];
    const fans = [];
    function row(side, count) {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const x = 5 + t * 90;
        const wave = Math.sin(t * Math.PI);
        const y = side === 'top' ? 2.4 + wave * 3.2 : 96.6 - wave * 3.2;
        const robe = robes[(i * 3 + (side === 'top' ? 0 : 2)) % robes.length];
        fans.push('<span class="fan" style="left:' + x.toFixed(2) + '%;top:' + y.toFixed(2) + '%;--robe:' + robe + '"></span>');
      }
    }
    row('top', 22);
    row('bottom', 20);
    const el = document.createElement('div');
    el.className = 'colosseum';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="stands stands-top"></div><div class="stands stands-bottom"></div>' +
      fans.join('') +
      '<div class="wall wall-top"></div><div class="wall wall-bottom"></div>';
    stage.insertBefore(el, stage.firstChild);
  }

  function renderRoster(fight) {
    rosterEl.innerHTML = fight.fighters.map((f) => {
      const pray = f.prayer
        ? '<div class="tile-pray" title="' + escapeHtml(f.prayer.name) + '"><span></span></div>'
        : '';
      return '<li class="tile" data-id="' + f.id + '">' +
        '<div class="tile-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
        (f.monster === 'dragon'
          ? '<img class="tile-dragon" alt="" src="/assets/dragon/idle.png">'
          : '<canvas width="16" height="24" data-spoop="' + escapeHtml(f.name) + '"></canvas>') +
        '<div class="tile-hp"><span></span></div>' +
        pray +
      '</li>';
    }).join('');
    fight.fighters.forEach((f) => {
      const canvas = rosterEl.querySelector('[data-id="' + f.id + '"] canvas');
      if (!canvas) return;
      if (window.SpoopArt) window.SpoopArt.drawSpoop(canvas, { name: f.name, equipped: f.equipped }, { clear: true });
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
      el.className = 'actor' + (f.monster ? ' is-boss' : '');
      el.setAttribute('data-id', f.id);
      const pray = !f.monster && f.prayer
        ? '<div class="pray" title="' + escapeHtml(f.prayer.name) + '">' +
            '<img class="pray-icon" alt="' + escapeHtml(f.prayer.name) + '" src="/assets/prayers/' + String(f.prayer.id || '').replace(/[^a-z0-9-]/g, '') + '.png">' +
            '<div class="pray-track"><span></span></div>' +
          '</div>'
        : '';
      const sprite = f.monster
        ? '<div class="sprite-wrap"><img class="dragon-sprite" alt="" src="/assets/dragon/idle.png"></div>'
        : '<div class="sprite-wrap"><div class="sprite-motion">' +
          '<canvas class="body-layer" width="28" height="24"></canvas>' +
          '<canvas class="weapon-glow" width="28" height="24"></canvas>' +
          '<canvas class="weapon-layer" width="28" height="24"></canvas>' +
          '<span class="swing-flash"></span>' +
        '</div></div>';
      el.innerHTML =
        '<div class="hud">' +
          pray +
          '<div class="hud-name">' + escapeHtml(f.name) + '</div>' +
          '<div class="hud-cb">' + (f.monster ? 'Boss' : 'Cb ' + f.combat) + '</div>' +
          '<div class="hp-track"><span></span></div>' +
        '</div>' +
        sprite +
        (f.monster || !(f.attack > 0)
          ? ''
          : '<div class="speed-track" title="Attack speed"><span></span></div>');
      el.querySelector('.hud').style.transform = 'translateY(' + ((f.id.charCodeAt(f.id.length - 1) % 3) - 1) * 7 + 'px)';
      actorsEl.appendChild(el);
      const card = rosterEl.querySelector('[data-id="' + f.id + '"]');
      const weapon = (f.equipped && f.equipped.weapon) || null;
      const view = {
        el,
        wrap: el.querySelector('.sprite-wrap'),
        motion: el.querySelector('.sprite-motion'),
        bodyCanvas: el.querySelector('.body-layer'),
        dragonImg: el.querySelector('.dragon-sprite'),
        weaponGlow: el.querySelector('.weapon-glow'),
        weaponCanvas: el.querySelector('.weapon-layer'),
        spoop: { name: f.name, equipped: f.equipped },
        weapon,
        glow: weapon && WEAPON_GLOW[weapon.quality] || null,
        monster: f.monster || '',
        attackGen: 0,
        bar: el.querySelector('.hp-track > span'),
        speedBar: el.querySelector('.speed-track > span'),
        attack: f.attack || 0,
        windup: Number(f.windup) || 0,
        myHits: (fight.hits || []).filter((hit) => hit.from === f.id),
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
      setSpeed(view, 0);
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

  const DRAGON_FRAME = {
    idle: '/assets/dragon/idle.png',
    'claw-1': '/assets/dragon/claw-1.png',
    'claw-2': '/assets/dragon/claw-2.png',
    'fire-1': '/assets/dragon/fire-1.png',
    'fire-2': '/assets/dragon/fire-2.png',
  };
  Object.keys(DRAGON_FRAME).forEach((key) => { const img = new Image(); img.src = DRAGON_FRAME[key]; });

  function setDragonFrame(view, frame) {
    if (!view || !view.dragonImg) return;
    const src = DRAGON_FRAME[frame] || DRAGON_FRAME.idle;
    if (view.dragonImg.getAttribute('src') !== src) view.dragonImg.src = src;
  }

  function paintLayers(view, pose) {
    if (!view) return;
    if (view.monster === 'dragon') {
      setDragonFrame(view, 'idle');
      return;
    }
    if (!view.bodyCanvas) return;
    if (!window.SpoopArt) return;
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

  function setSpeed(view, t) {
    if (!view || !view.speedBar || !(view.attack > 0) || view.dead) return;
    let from = 0;
    let cd = view.windup;
    const hits = view.myHits || [];
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (hit.t > t) break;
      cd = Math.max(0, cd - (hit.t - from));
      cd = view.attack;
      from = hit.t;
    }
    cd = Math.max(0, cd - (t - from));
    const fill = Math.max(0, Math.min(1, 1 - cd / view.attack));
    view.speedBar.style.width = (fill * 100).toFixed(1) + '%';
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

  function splatBias(id) {
    const ids = (bout && bout.fighters || []).map((f) => f.id);
    const i = Math.max(0, ids.indexOf(id));
    const n = Math.max(3, ids.length);
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(Math.cos(a) * 46), y: Math.round(Math.sin(a) * 24) };
  }

  function floater(x, y, amount, miss, bias) {
    const el = document.createElement('div');
    el.className = 'hitsplat' + (miss ? ' is-zero' : '');
    const num = document.createElement('span');
    num.textContent = miss ? '0' : String(amount);
    el.appendChild(num);
    const jx = bias ? bias.x : Math.round(Math.random() * 8 - 4);
    const jy = bias ? bias.y : Math.round(Math.random() * 6 - 3);
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
    const magic = style === 'magic' || style === 'fire';
    el.className = 'shot ' + (style === 'fire' ? 'shot-fire' : magic ? 'shot-magic' : 'shot-ranged') + (bright ? ' is-bright' : '');
    el.style.setProperty('--shot', color || (style === 'fire' ? '#fb923c' : magic ? '#8eb6ff' : '#d9f5c4'));
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
    if (view.monster === 'dragon') {
      const fire = style === 'fire';
      const seq = fire
        ? [['fire-1', 0], ['fire-2', 180], ['idle', 480]]
        : [['claw-1', 0], ['claw-2', 150], ['idle', 340]];
      const doneAt = fire ? 560 : 400;
      const t0 = performance.now();
      let shown = '';
      function tickDragon(now) {
        if (view.attackGen !== gen || !view.el.isConnected) return;
        const elapsed = now - t0;
        let frame = 'idle';
        for (let i = 0; i < seq.length; i++) if (elapsed >= seq[i][1]) frame = seq[i][0];
        if (frame !== shown) {
          shown = frame;
          setDragonFrame(view, frame);
        }
        if (elapsed < doneAt) view.attackRaf = requestAnimationFrame(tickDragon);
        else setDragonFrame(view, 'idle');
      }
      view.attackRaf = requestAnimationFrame(tickDragon);
      return;
    }
    const kind = style === 'ranged' ? 'ranged' : style === 'magic' || style === 'fire' ? 'magic' : 'melee';
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
    const bias = victim.monster ? splatBias(hit.from) : null;
    const miss = hit.miss || !(hit.amount > 0);
    if (miss) {
      floater(to.x, to.y, 0, true, bias);
      playMissSound();
    } else {
      floater(to.x, to.y, hit.amount, false, bias);
      playHitSound(hit.hp <= 0 && !victim.monster);
    }
    if (hit.style === 'ranged') playBowSound();
    if (hit.attack === 'fire') {
      playFireSound();
      pushFeed(escapeHtml(attacker.name) + ' breathes fire on ' + escapeHtml(victim.name) + ' ' + hit.amount, 'hit');
    }
    else if (hit.attack === 'claw') pushFeed(escapeHtml(attacker.name) + (miss ? ' claws at ' : ' claws ') + escapeHtml(victim.name) + (miss ? '' : ' ' + hit.amount), miss ? 'miss' : 'hit');
    else if (miss) pushFeed(escapeHtml(attacker.name) + ' misses ' + escapeHtml(victim.name), 'miss');
    else pushFeed(escapeHtml(attacker.name) + ' hits ' + escapeHtml(victim.name) + ' ' + hit.amount, 'hit');
    if (!from) return;
    faceView(from, to);
    const swing = hit.attack === 'fire' ? 'fire' : hit.attack === 'claw' ? 'melee' : hit.style;
    playAttack(from, swing, to);
    if (from.monster || swing === 'melee') return;
    const color = swing === 'fire' ? '#fb923c' : from.glow && from.glow.color;
    const bright = swing === 'fire' || !!(from.weapon && (from.weapon.quality === 'tempered' || from.weapon.quality === 'masterwork'));
    const wait = swing === 'fire' ? 80 : hit.style === 'magic' ? 120 : 140;
    window.setTimeout(() => {
      if (!from.el.isConnected || !bout) return;
      shot(from, to, swing, color, bright);
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
      const fallen = bout && bout.fighters.find((f) => f.id === death.id);
      if (fallen) pushFeed(escapeHtml(fallen.name) + ' is defeated', 'dead');
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

  function lastEventTime(list) {
    if (!list || !list.length) return 0;
    return Number(list[list.length - 1].t) || 0;
  }

  function standingCount(t) {
    let n = bout.fighters.length;
    for (const d of bout.deaths) if (d.t <= t) n -= 1;
    return Math.max(1, n);
  }

  function finish() {
    playing = false;
    cancelAnimationFrame(raf);
    const named = (bout.winnerIds || []).map((id) => bout.fighters.find((f) => f.id === id)).filter((f) => f && !f.monster);
    const single = !named.length ? bout.fighters.find((f) => f.id === bout.winnerId) : null;
    const dragonWin = !!(single && single.monster);
    const playerWin = !!(single && !single.monster);
    if (!tourneyBusy) {
      if (named.length || playerWin) playVictoryMusic();
      else stopFightMusic();
    }
    const celebrate = named.length ? named : (playerWin ? [single] : []);
    celebrate.forEach((fighter) => {
      const view = actors.get(fighter.id);
      if (view) view.el.classList.add('is-winner');
      if (view && view.card) view.card.classList.add('is-winner');
    });
    if (named.length || dragonWin || playerWin) {
      banner.hidden = false;
      if (named.length) {
        banner.innerHTML = '<span class="text-xs uppercase tracking-wide">' + (named.length === 1 ? 'Survivor' : 'Survivors') + '</span><strong>' +
          escapeHtml(named.map((f) => f.name).join(', ')) + '</strong>';
      } else if (dragonWin) {
        banner.innerHTML = '<span class="text-xs uppercase tracking-wide">Dragon</span><strong>The dragon wins</strong>';
      } else {
        const note = bout.pkNote ? ' · ' + bout.pkNote : '';
        banner.innerHTML = '<span class="text-xs uppercase tracking-wide">Winner</span><strong>' +
          escapeHtml(single.name) + '</strong><span class="text-sm text-slate-300">Combat ' + single.combat +
          (bout.called ? ' · time called' : '') + escapeHtml(note) + '</span>';
      }
    }
    if (linesEl) linesEl.innerHTML = '';
    statusEl.textContent = named.length
      ? named.map((f) => f.name).join(', ') + (named.length === 1 ? ' survives.' : ' survive.')
      : dragonWin ? 'The dragon wins.'
      : playerWin ? single.name + ' wins.'
      : 'The pit is empty.';
    const done = onFightDone;
    onFightDone = null;
    if (done) {
      done();
      return;
    }
    const night = nightDone;
    nightDone = null;
    if (night) night();
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
      setSpeed(view, t);
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
    const endAt = tourneyBusy
      ? Math.max(Number(bout.duration) || 0, lastEventTime(bout.hits), lastEventTime(bout.deaths))
      : Number(bout.duration) || 0;
    const stillGoing = tourneyBusy ? t < endAt : (t < endAt && standingCount(t) > 1);
    if (stillGoing) {
      statusEl.textContent = fightTitle;
      raf = requestAnimationFrame(frame);
      return;
    }
    if (tourneyBusy) {
      if (!tourneySettleAt) tourneySettleAt = now;
      if (now - tourneySettleAt < 1000) {
        statusEl.textContent = fightTitle;
        raf = requestAnimationFrame(frame);
        return;
      }
    }
    finish();
  }

  function arm(fight, title) {
    introToken += 1;
    if (!tourneyBusy) introducing = false;
    cancelAnimationFrame(raf);
    playing = false;
    bout = fight;
    const styleName = { ring: 'Ring', pairs: 'Pairs', scatter: 'Random', dragon: 'Dragon', duel: 'Duel' };
    const style = fight && styleName[fight.formation] ? styleName[fight.formation] : '';
    fightTitle = (title || 'Spoopfight') + (style ? ' · ' + style : '');
    playSpeed = (title || '') === 'PK' ? PK_SPEED : ARENA_SPEED;
    shownHit = 0;
    shownDeath = 0;
    clearFeed();
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
    playFightMusic(!tourneyBusy);
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
        if (!tourneyBusy) introducing = false;
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
        const boss = !!fighter.monster;
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -72%) scale(' + (boss ? 0.72 : 0.35) + ')';
        place(el, center.x, center.y, bout.width, bout.height);
        el.classList.remove('is-hidden');
        el.classList.add('is-entrance');
        void el.offsetWidth;
        el.style.transition = 'transform 0.18s cubic-bezier(.15, 1.3, .35, 1), opacity 0.18s linear';
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%, -72%) scale(' + (boss ? 1.08 : 3.6) + ')';
        playIntroSound();
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
    tourneySettleAt = 0;
    playing = true;
    if (!tourneyBusy) introducing = false;
    if (fxEl) fxEl.querySelectorAll('.blood-pool').forEach((el) => el.remove());
    if (linesEl) linesEl.style.visibility = '';
    if (banner) banner.hidden = true;
    if (resultsEl) resultsEl.hidden = true;
    if (waitEl) waitEl.hidden = true;
    hideRecap();
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
      setSpeed(view, 0);
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

  function liveFor(atMs, fight, speed, showMs) {
    if (!atMs) return false;
    const explicit = Number(showMs) || 0;
    const duration = fight ? Number(fight.duration) || 0 : 0;
    const playback = explicit > 0 ? explicit : (duration / (speed * PACE)) * 1000;
    if (!(playback > 0)) return false;
    const windowMs = Math.max(2 * 60 * 1000, playback + 60 * 1000);
    const age = worldMs() - atMs;
    return age >= -5000 && age <= windowMs;
  }

  function clearStage() {
    introToken += 1;
    tourneyToken += 1;
    const pendingFight = onFightDone;
    onFightDone = null;
    tourneyBusy = false;
    introducing = false;
    cancelAnimationFrame(raf);
    playing = false;
    if (pendingFight) pendingFight();
    removeTourneyDom();
    if (rosterEl) rosterEl.hidden = false;
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
    clearFeed();
    paintPot(upcomingPot);
    if (resultsEl) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    }
  }

  function hideRecap() {
    recapAt = '';
    recapStatus = '';
    if (!recapEl) return;
    recapEl.hidden = true;
    recapEl.classList.remove('is-dragon');
    recapEl.innerHTML = '';
  }

  function restPit() {
    clearStage();
    hideRecap();
    if (waitEl) waitEl.hidden = false;
  }

  function formatGold(net) {
    const value = Number(net) || 0;
    const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
    return sign + Math.abs(value).toLocaleString('en-US');
  }

  function placeLabel(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return n + 'th';
    const tail = n % 10;
    if (tail === 1) return n + 'st';
    if (tail === 2) return n + 'nd';
    if (tail === 3) return n + 'rd';
    return n + 'th';
  }

  function outcomeOf(fight, fallback) {
    const fighters = (fight && fight.fighters) || [];
    const named = (fight && fight.winnerIds || []).map((id) => fighters.find((f) => f.id === id)).filter((f) => f && !f.monster);
    if (named.length === 1) return { title: 'Winner', name: named[0].name };
    if (named.length > 1) return { title: 'Survivors', name: named.map((f) => f.name).join(', ') };
    const single = fighters.find((f) => f.id === (fight && fight.winnerId));
    if (single && single.monster) return { title: 'Dragon', name: 'The dragon' };
    if (single) return { title: 'Winner', name: single.name };
    return { title: 'Winner', name: fallback || 'Nobody' };
  }

  function fightStatRows(fight, results) {
    const byName = new Map();
    ((fight && fight.fighters) || []).forEach((f) => {
      byName.set(String(f.name || '').toLowerCase(), {
        id: f.id,
        name: f.name,
        monster: !!f.monster,
        dealt: 0,
        taken: 0,
        pks: 0,
        hits: 0,
        swings: 0,
        best: 0,
      });
    });
    function rowFor(id) {
      const fighter = ((fight && fight.fighters) || []).find((f) => f.id === id);
      if (!fighter) return null;
      return byName.get(String(fighter.name || '').toLowerCase()) || null;
    }
    ((fight && fight.hits) || []).forEach((hit) => {
      const amount = hit.amount > 0 && !hit.miss ? hit.amount : 0;
      const from = rowFor(hit.from);
      const to = rowFor(hit.to);
      if (from) {
        from.swings += 1;
        if (amount > 0) {
          from.dealt += amount;
          from.hits += 1;
          if (amount > from.best) from.best = amount;
        }
      }
      if (to && amount > 0) to.taken += amount;
    });
    ((fight && fight.deaths) || []).forEach((death) => {
      const killer = rowFor(death.by);
      if (killer) killer.pks += 1;
    });
    const used = new Set();
    const ordered = [];
    (results || []).forEach((result) => {
      const key = String(result.name || '').toLowerCase();
      const stat = byName.get(key);
      if (!stat || stat.monster) return;
      used.add(key);
      ordered.push(Object.assign({}, stat, { place: result.place, won: !!result.won }));
    });
    byName.forEach((stat, key) => {
      if (used.has(key) || stat.monster) return;
      ordered.push(Object.assign({}, stat, { place: ordered.length + 1 }));
    });
    byName.forEach((stat) => {
      if (!stat.monster) return;
      ordered.push(Object.assign({}, stat, { place: null, won: !!(fight && fight.winnerId === stat.id) }));
    });
    return ordered;
  }

  function tourneyStatRows(tourney, results) {
    const byName = new Map();
    (tourney.cast || []).forEach((entry) => {
      byName.set(String(entry.name || '').toLowerCase(), {
        name: entry.name,
        dealt: 0,
        taken: 0,
        pks: 0,
        hits: 0,
        swings: 0,
        best: 0,
      });
    });
    (tourney.matches || []).forEach((match) => {
      const bout = match.bout;
      if (!bout) return;
      const idName = new Map((bout.fighters || []).map((f) => [f.id, f.name]));
      (bout.hits || []).forEach((hit) => {
        const amount = hit.amount > 0 && !hit.miss ? hit.amount : 0;
        const from = byName.get(String(idName.get(hit.from) || '').toLowerCase());
        const to = byName.get(String(idName.get(hit.to) || '').toLowerCase());
        if (from) {
          from.swings += 1;
          if (amount > 0) {
            from.dealt += amount;
            from.hits += 1;
            if (amount > from.best) from.best = amount;
          }
        }
        if (to && amount > 0) to.taken += amount;
      });
      (bout.deaths || []).forEach((death) => {
        const killer = byName.get(String(idName.get(death.by) || '').toLowerCase());
        if (killer) killer.pks += 1;
      });
    });
    const used = new Set();
    const ordered = [];
    (results || []).forEach((result) => {
      const key = String(result.name || '').toLowerCase();
      const stat = byName.get(key);
      if (!stat) return;
      used.add(key);
      ordered.push(Object.assign({}, stat, { place: result.place, won: !!result.won }));
    });
    byName.forEach((stat, key) => {
      if (used.has(key)) return;
      ordered.push(Object.assign({}, stat, { place: ordered.length + 1 }));
    });
    return ordered;
  }

  function paintRecap(last) {
    if (!recapEl) return;
    const fight = last && last.bout;
    const tourney = last && last.tournament;
    const dragon = !!(fight && fight.formation === 'dragon');
    const outcome = tourney
      ? { title: 'Champion', name: (last && last.winner) || 'Nobody' }
      : outcomeOf(fight, last && last.winner);
    const results = (last && last.results) || [];
    const stats = tourney ? tourneyStatRows(tourney, results) : fightStatRows(fight, results);
    recapStatus = tourney
      ? outcome.name + ' wins the Tournament.'
      : outcome.name + (outcome.title === 'Winner' && !/wins$/.test(outcome.name) ? ' wins.' : '.');
    if (outcome.title === 'Survivors') recapStatus = outcome.name + ' survive.';
    if (outcome.title === 'Dragon') recapStatus = 'The dragon wins.';
    recapEl.classList.toggle('is-dragon', dragon);
    const pot = last && last.pot != null
      ? '<div class="recap-pot"><span>Pot</span><strong>' + Number(last.pot).toLocaleString('en-US') + '</strong></div>'
      : '';
    const note = fight && fight.called ? '<p class="recap-note">Time called.</p>' : '';
    const places = results.length
      ? results.map((row) => {
          const net = Number(row.gold) || 0;
          const tone = net > 0 ? 'is-up' : net < 0 ? 'is-down' : '';
          const prize = row.payout != null
            ? '<span>Prize ' + Number(row.payout).toLocaleString('en-US') + '</span>'
            : '';
          return '<li class="recap-row' + (row.place === 1 ? ' is-first' : '') + '">' +
            '<span class="recap-place">' + placeLabel(row.place) + '</span>' +
            '<span class="recap-name">' + escapeHtml(row.name) + '</span>' +
            '<span class="recap-earn"><strong class="' + tone + '">' + formatGold(net) + '</strong>' + prize + '</span>' +
          '</li>';
        }).join('')
      : '<li class="recap-row"><span class="recap-name">No placements recorded.</span></li>';
    const statHead = '<div class="recap-stat-head"><span>Fighter</span><span>Dmg</span><span>Taken</span><span>PKs</span><span>Best</span></div>';
    const statList = stats.length
      ? stats.map((row) => {
          const acc = row.swings ? Math.round((row.hits / row.swings) * 100) + '% accuracy' : '';
          const tip = acc ? row.name + ' · ' + acc : row.name;
          return '<li class="recap-stat' + (row.won ? ' is-first' : '') + '">' +
            '<b title="' + escapeHtml(tip) + '">' + escapeHtml(row.name) + '</b>' +
            '<span>' + row.dealt.toLocaleString('en-US') + '</span>' +
            '<span>' + row.taken.toLocaleString('en-US') + '</span>' +
            '<span>' + row.pks + '</span>' +
            '<span>' + row.best + '</span>' +
          '</li>';
        }).join('')
      : '<li class="recap-row"><span class="recap-name">No fight stats.</span></li>';
    recapEl.innerHTML =
      '<div class="recap-card">' +
        '<div class="recap-head">' +
          '<div><p class="recap-kicker">' + (tourney ? 'Tournament' : dragon ? 'Dragon fight' : 'Spoopfight') + '</p>' +
            '<p class="recap-winner">' + escapeHtml(outcome.name) + '</p>' + note + '</div>' +
          pot +
        '</div>' +
        '<div class="recap-body">' +
          '<section class="recap-col"><h3>Placements</h3><ol class="recap-list">' + places + '</ol></section>' +
          '<section class="recap-col"><h3>Fight stats</h3>' + statHead + '<ol class="recap-list">' + statList + '</ol></section>' +
        '</div>' +
        '<div class="recap-actions">' +
          '<button type="button" class="replay-btn" data-recap="replay">Watch again</button>' +
          '<button type="button" class="replay-btn" data-recap="close">Next fight</button>' +
        '</div>' +
      '</div>';
    recapEl.hidden = false;
  }

  function presentRecap(last) {
    if (!last || (!last.bout && !last.tournament)) {
      restPit();
      return;
    }
    recapAt = last.at || 'shown';
    clearStage();
    if (waitEl) waitEl.hidden = true;
    paintRecap(last);
    if (statusEl) statusEl.textContent = recapStatus;
    syncReplay();
    tickCountdown();
  }

  function leaveRecap() {
    const status = recapStatus;
    hideRecap();
    if (waitEl) waitEl.hidden = false;
    if (statusEl) statusEl.textContent = status || 'Waiting for 9:00pm ET.';
    syncReplay();
    tickCountdown();
  }

  function playReplay() {
    if (!replayLast || playing || introducing) return;
    hideRecap();
    if (waitEl) waitEl.hidden = true;
    if (replayBtn) replayBtn.hidden = true;
    paintPot(lastPot || upcomingPot);
    if (replayLast.tournament) {
      nightDone = function () {
        restPit();
        const name = replayLast.winner || 'Champion';
        if (statusEl) statusEl.textContent = name + ' won the Tournament.';
        syncReplay();
        tickCountdown();
      };
      runTournament(replayLast.tournament);
      return;
    }
    if (!replayLast.bout) return;
    nightDone = function () {
      presentRecap(replayLast);
    };
    arm(replayLast.bout, 'Spoopfight');
    start();
  }

  function syncReplay() {
    if (!replayBtn) return;
    const pkWaiting = !!(pkAtMs && worldMs() < pkAtMs);
    const replayable = replayLast && (replayLast.bout || replayLast.tournament);
    replayBtn.hidden = !replayable || playing || introducing || pkWaiting;
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
    if (waitKicker) waitKicker.textContent = 'Next Tournament';
    countdownEl.textContent = (simMode ? 'Simulated · ' : '') + 'Next Tournament ' + text;
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
      if (waitKicker) waitKicker.textContent = 'Next Tournament';
      countdownEl.textContent = 'Next Tournament';
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

  const SHOW = {
    titleIn: 550,
    titleHold: 5000,
    titleOut: 700,
    entrance: 2000,
    bye: 900,
    hold: 15000,
    versus: 2900,
    intro: 2000,
    call: 720,
    win: 700,
    advance: 900,
    after: 400,
    bestFlash: 1400,
    score: 3000,
    bracketHold: 3000,
    crown: 20000,
  };

  function removeTourneyDom() {
    ['tourney-scrim', 'tourney-card', 'tourney-vs', 'tourney-best', 'tourney-score', 'tourney-crown'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    const log = document.getElementById('arena-log');
    if (log) log.hidden = false;
    if (pit) pit.querySelectorAll('.tourney-wait').forEach((el) => el.remove());
  }

  function mountWaitBar(ms) {
    if (!pit) return null;
    pit.querySelectorAll('.tourney-wait').forEach((el) => el.remove());
    const count = Math.max(4, Math.min(14, Math.round(ms / 800)));
    const bar = document.createElement('div');
    bar.className = 'tourney-wait';
    bar.setAttribute('aria-hidden', 'true');
    const step = ms / count;
    for (let i = 0; i < count; i++) {
      const clump = document.createElement('i');
      clump.style.animationDelay = (step * i) + 'ms';
      clump.style.animationDuration = Math.max(120, step * 0.7) + 'ms';
      bar.appendChild(clump);
    }
    pit.appendChild(bar);
    return bar;
  }

  function tourneyWait(ms, token, bar) {
    const mark = bar ? mountWaitBar(ms) : null;
    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (mark) mark.remove();
        resolve(token === tourneyToken);
      }, ms);
    });
  }

  function openingPlayers(rounds) {
    const slots = [];
    if (!rounds || !rounds.length) return slots;
    rounds[0].groups.forEach((group) => {
      group.slots.forEach((slot) => {
        if (slot.playerId) slots.push(slot);
      });
    });
    return slots;
  }

  async function runTournament(tourney, speed) {
    if (!tourney || !pit) return;
    removeTourneyDom();
    cancelAnimationFrame(raf);
    playing = false;
    introToken += 1;
    const token = ++tourneyToken;
    const pending = onFightDone;
    onFightDone = null;
    const alive = () => token === tourneyToken;
    tourneyBusy = true;
    introducing = true;
    playFightMusic(true);
    if (pending) pending();
    fightTitle = 'Tournament';
    if (statusEl) statusEl.textContent = 'Tournament';
    if (waitEl) waitEl.hidden = true;
    if (rosterEl) rosterEl.hidden = true;
    if (banner) banner.hidden = true;
    hideRecap();
    cancelAnimationFrame(raf);
    actors.clear();
    if (actorsEl) actorsEl.innerHTML = '';
    if (fxEl) fxEl.innerHTML = '';
    if (linesEl) linesEl.innerHTML = '';
    clearFeed();
    const castById = new Map((tourney.cast || []).map((entry) => [entry.id, entry]));
    const playSpeedPick = ((Number(speed) > 0 ? Number(speed) : ARENA_SPEED) * 2);

    function slotNode(id) {
      const scrim = document.getElementById('tourney-scrim');
      return scrim ? scrim.querySelector('[data-slot="' + id + '"]') : null;
    }

    function drawBody(body, player) {
      const canvas = body.querySelector('canvas');
      if (canvas && window.SpoopArt) {
        window.SpoopArt.drawSpoop(canvas, { name: player.name, equipped: player.equipped }, { clear: true });
      }
    }

    function paintPlayer(slot, player) {
      if (!slot || !player) return null;
      slot.dataset.player = player.id;
      let body = slot.querySelector('.tourney-body');
      if (!body) {
        body = document.createElement('div');
        body.className = 'tourney-body';
        slot.appendChild(body);
      }
      body.dataset.player = player.id;
      body.innerHTML = '<canvas width="22" height="30"></canvas><span class="tourney-label"></span>';
      body.querySelector('.tourney-label').textContent = player.name;
      body.title = player.name;
      drawBody(body, player);
      return body;
    }

    function dockBody(body) {
      body.classList.remove('is-tourney-fly');
      body.style.transition = '';
      body.style.position = '';
      body.style.left = '';
      body.style.top = '';
      body.style.transform = '';
      body.style.zIndex = '';
      body.style.opacity = '';
    }

    function scrimCenter() {
      const scrim = document.getElementById('tourney-scrim');
      const rect = scrim ? scrim.getBoundingClientRect() : pit.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.5 };
    }

    function weighRounds(rounds) {
      let outputs = [];
      rounds.forEach((round, index) => {
        if (!index) {
          round.groups.forEach((group) => {
            group.weight = Math.max(1, group.slots.length);
            group.slots.forEach((slot) => { slot.weight = 1; });
          });
        } else {
          let cursor = 0;
          round.groups.forEach((group) => {
            group.weight = 0;
            group.slots.forEach((slot) => {
              slot.weight = outputs[cursor] || 1;
              cursor += 1;
              group.weight += slot.weight;
            });
          });
        }
        outputs = round.groups.map((group) => group.weight);
      });
      return outputs.reduce((sum, weight) => sum + weight, 0) || 1;
    }

    function makeColumn(round, units, last) {
      const col = document.createElement('div');
      col.className = 'tourney-col' + (last ? ' is-last' : '');
      const label = document.createElement('p');
      label.className = 'tourney-col-label';
      label.textContent = round.name === 'Bye' ? '' : round.name;
      col.appendChild(label);
      const stack = document.createElement('div');
      stack.className = 'tourney-stack';
      stack.style.gridTemplateRows = 'repeat(' + units + ', minmax(0, 1fr))';
      let row = 1;
      round.groups.forEach((group) => {
        const pair = document.createElement('div');
        const single = group.bye || group.slots.length < 2;
        pair.className = single ? 'tourney-bye' : 'tourney-pair';
        pair.style.gridRow = row + ' / span ' + group.weight;
        row += group.weight;
        if (!single && group.slots.length === 2) {
          const top = group.slots[0].weight || 1;
          const bot = group.slots[1].weight || 1;
          const total = top + bot;
          pair.style.gridTemplateRows = top + 'fr ' + bot + 'fr';
          pair.style.setProperty('--join-top', ((top / 2) / total * 100).toFixed(2) + '%');
          pair.style.setProperty('--join-bot', ((top + bot / 2) / total * 100).toFixed(2) + '%');
        }
        group.slots.forEach((slot) => {
          const el = document.createElement('div');
          el.className = 'tourney-slot';
          el.dataset.slot = slot.id;
          pair.appendChild(el);
        });
        stack.appendChild(pair);
      });
      col.appendChild(stack);
      return col;
    }

    function buildBoard() {
      const scrim = document.createElement('div');
      scrim.id = 'tourney-scrim';
      scrim.className = 'tourney-scrim';
      const board = document.createElement('div');
      board.className = 'tourney-board';
      const leftRounds = tourney.sides && tourney.sides.left || [];
      const rightRounds = tourney.sides && tourney.sides.right || [];
      const leftUnits = weighRounds(leftRounds);
      const rightUnits = weighRounds(rightRounds);
      const left = document.createElement('div');
      left.className = 'tourney-side is-left';
      leftRounds.forEach((round, index) => left.appendChild(makeColumn(round, leftUnits, index === leftRounds.length - 1)));
      const right = document.createElement('div');
      right.className = 'tourney-side is-right';
      rightRounds.forEach((round, index) => right.appendChild(makeColumn(round, rightUnits, index === rightRounds.length - 1)));
      const center = document.createElement('div');
      center.className = 'tourney-center';
      center.innerHTML = '<p class="tourney-col-label">Final</p><div class="tourney-stack"></div>';
      const stack = center.querySelector('.tourney-stack');
      const finalLeft = document.createElement('div');
      finalLeft.className = 'tourney-slot';
      finalLeft.dataset.slot = tourney.center.left.id;
      const champ = document.createElement('div');
      champ.className = 'tourney-slot tourney-champ';
      champ.dataset.slot = tourney.center.champ.id;
      champ.innerHTML = '<span class="tourney-champ-kicker">Champion</span>';
      const finalRight = document.createElement('div');
      finalRight.className = 'tourney-slot';
      finalRight.dataset.slot = tourney.center.right.id;
      stack.append(finalLeft, champ, finalRight);
      board.append(left, center, right);
      scrim.appendChild(board);
      pit.appendChild(scrim);
      return scrim;
    }

    function hideScrim() {
      const scrim = document.getElementById('tourney-scrim');
      if (!scrim) return;
      scrim.hidden = true;
      scrim.classList.add('is-down');
      scrim.classList.remove('is-in');
    }

    function popScrim() {
      if (playing) return;
      const scrim = document.getElementById('tourney-scrim');
      if (!scrim) return;
      scrim.classList.remove('is-down');
      scrim.hidden = false;
      const log = document.getElementById('arena-log');
      if (log) log.hidden = true;
      scrim.classList.remove('is-in');
      void scrim.offsetWidth;
      scrim.classList.add('is-in');
    }

    async function enterSlot(slot) {
      const player = castById.get(slot.playerId);
      const node = slotNode(slot.id);
      const body = paintPlayer(node, player);
      if (!body) return alive();
      const center = scrimCenter();
      body.classList.add('is-tourney-fly');
      body.style.position = 'fixed';
      body.style.zIndex = '60';
      body.style.left = center.x + 'px';
      body.style.top = center.y + 'px';
      body.style.opacity = '0';
      body.style.transform = 'translate(-50%, -72%) scale(0.35)';
      void body.offsetWidth;
      body.style.transition = 'transform 0.18s cubic-bezier(.15, 1.3, .35, 1), opacity 0.18s linear';
      body.style.opacity = '1';
      body.style.transform = 'translate(-50%, -72%) scale(2.6)';
      playIntroSound();
      if (!await tourneyWait(1050, token)) return false;
      const dest = node.getBoundingClientRect();
      body.style.transition = 'left 0.9s cubic-bezier(.5, .05, .25, 1), top 0.9s cubic-bezier(.5, .05, .25, 1), transform 0.9s cubic-bezier(.5, .05, .25, 1)';
      body.style.left = (dest.left + dest.width / 2) + 'px';
      body.style.top = (dest.top + dest.height / 2) + 'px';
      body.style.transform = 'translate(-50%, -50%) scale(1)';
      if (!await tourneyWait(950, token)) return false;
      if (!alive()) return false;
      dockBody(body);
      return true;
    }

    async function flySlot(fromId, toId, playerId) {
      const player = castById.get(playerId);
      const from = slotNode(fromId);
      const to = slotNode(toId);
      if (!player || !to) return alive();
      const source = from && from.querySelector('.tourney-body');
      if (!source) {
        paintPlayer(to, player);
        return alive();
      }
      const flyer = source.cloneNode(true);
      flyer.classList.add('is-tourney-fly');
      const scrim = document.getElementById('tourney-scrim');
      scrim.appendChild(flyer);
      drawBody(flyer, player);
      const start = source.getBoundingClientRect();
      flyer.style.position = 'fixed';
      flyer.style.zIndex = '61';
      flyer.style.left = (start.left + start.width / 2) + 'px';
      flyer.style.top = (start.top + start.height / 2) + 'px';
      flyer.style.transform = 'translate(-50%, -50%) scale(1)';
      flyer.style.opacity = '1';
      vacateSlot(from);
      void flyer.offsetWidth;
      const dest = to.getBoundingClientRect();
      flyer.style.transition = 'left 0.9s cubic-bezier(.5, .05, .25, 1), top 0.9s cubic-bezier(.5, .05, .25, 1)';
      flyer.style.left = (dest.left + dest.width / 2) + 'px';
      flyer.style.top = (dest.top + dest.height / 2) + 'px';
      const stayed = await tourneyWait(SHOW.advance, token);
      if (flyer.parentNode) flyer.remove();
      if (!stayed) return false;
      paintPlayer(to, player);
      if (toId === (tourney.center && tourney.center.champ && tourney.center.champ.id)) {
        to.classList.add('is-champion');
      }
      return true;
    }

    function vacateSlot(slot) {
      if (!slot) return;
      slot.classList.remove('is-advanced', 'is-champion');
      slot.classList.add('is-vacant');
      delete slot.dataset.player;
      const body = slot.querySelector('.tourney-body');
      if (body) body.remove();
    }

    function fadePlayer(playerId) {
      const scrim = document.getElementById('tourney-scrim');
      if (!scrim) return;
      scrim.querySelectorAll('[data-player="' + playerId + '"]').forEach((el) => {
        const slot = el.classList.contains('tourney-slot') ? el : el.closest('.tourney-slot');
        if (!slot) return;
        slot.classList.remove('is-advanced', 'is-champion');
        slot.classList.add('is-out');
      });
    }

    async function showTitle() {
      const card = document.createElement('div');
      card.id = 'tourney-card';
      card.className = 'tourney-card';
      const inner = document.createElement('div');
      inner.className = 'tourney-card-inner';
      const word = document.createElement('p');
      word.className = 'tourney-word';
      word.textContent = 'Tournament';
      inner.appendChild(word);
      if (tourney.pot != null) {
        const label = document.createElement('p');
        label.className = 'tourney-pot-label';
        label.textContent = 'Prize pool';
        const gold = document.createElement('strong');
        gold.textContent = Number(tourney.pot).toLocaleString('en-US');
        inner.append(label, gold);
      }
      card.appendChild(inner);
      pit.appendChild(card);
      if (!await tourneyWait(SHOW.titleIn + SHOW.titleHold, token, true)) return false;
      card.classList.add('is-out');
      if (!await tourneyWait(SHOW.titleOut, token)) return false;
      card.remove();
      return true;
    }

    async function showVersus(match) {
      const a = castById.get(match.aId);
      const b = castById.get(match.bId);
      const card = document.createElement('div');
      card.id = 'tourney-vs';
      card.className = 'tourney-vs';
      const inner = document.createElement('div');
      inner.className = 'tourney-vs-inner';
      const round = document.createElement('p');
      round.className = 'tourney-vs-round';
      round.textContent = match.roundName || '';
      const line = document.createElement('p');
      line.className = 'tourney-vs-line';
      const left = document.createElement('strong');
      left.textContent = a ? a.name : '';
      const mid = document.createElement('span');
      mid.textContent = 'vs';
      const right = document.createElement('strong');
      right.textContent = b ? b.name : '';
      line.append(left, mid, right);
      inner.append(round, line);
      card.appendChild(inner);
      pit.appendChild(card);
      fightTitle = (match.roundName || 'Match') + ' · ' + (a ? a.name : '') + ' vs ' + (b ? b.name : '');
      if (statusEl) statusEl.textContent = fightTitle;
      const stayed = await tourneyWait(SHOW.versus, token, true);
      card.remove();
      return stayed;
    }

    function playMatch(match, bout, gameIndex, gameCount) {
      return new Promise((resolve) => {
        if (!alive()) {
          resolve(false);
          return;
        }
        onFightDone = () => resolve(alive());
        if (rosterEl) rosterEl.hidden = false;
        const log = document.getElementById('arena-log');
        if (log) log.hidden = false;
        hideScrim();
        arm(bout || match.bout, 'Spoopfight');
        playSpeed = playSpeedPick;
        const a = castById.get(match.aId);
        const b = castById.get(match.bId);
        const gameNote = match.bestOf && gameCount > 1 ? ' · Game ' + (gameIndex + 1) : '';
        fightTitle = (match.roundName || 'Match') + gameNote + ' · ' + (a ? a.name : '') + ' vs ' + (b ? b.name : '');
        if (statusEl) statusEl.textContent = fightTitle;
        beginFight(true);
      });
    }

    async function showBestOf() {
      const card = document.createElement('div');
      card.id = 'tourney-best';
      card.className = 'tourney-best';
      const word = document.createElement('p');
      word.className = 'tourney-word';
      word.textContent = 'Best 2 of 3';
      card.appendChild(word);
      pit.appendChild(card);
      fightTitle = 'Best 2 of 3';
      if (statusEl) statusEl.textContent = fightTitle;
      const stayed = await tourneyWait(SHOW.bestFlash, token, true);
      card.remove();
      return stayed;
    }

    async function showScore(match, tally) {
      const a = castById.get(match.aId);
      const b = castById.get(match.bId);
      const card = document.createElement('div');
      card.id = 'tourney-score';
      card.className = 'tourney-score';
      function side(player, wins) {
        const col = document.createElement('div');
        col.className = 'tourney-score-side';
        const name = document.createElement('strong');
        name.textContent = player ? player.name : '';
        const num = document.createElement('span');
        num.textContent = String(wins || 0);
        col.append(name, num);
        return col;
      }
      card.append(side(a, tally.get(match.aId)), side(b, tally.get(match.bId)));
      pit.appendChild(card);
      const leftName = a ? a.name : '';
      const rightName = b ? b.name : '';
      fightTitle = leftName + ' ' + (tally.get(match.aId) || 0) + '–' + (tally.get(match.bId) || 0) + ' ' + rightName;
      if (statusEl) statusEl.textContent = fightTitle;
      const stayed = await tourneyWait(SHOW.score, token, true);
      card.remove();
      return stayed;
    }

    async function showCrown() {
      const scrim = document.getElementById('tourney-scrim');
      if (scrim) scrim.remove();
      actors.clear();
      if (actorsEl) actorsEl.innerHTML = '';
      if (fxEl) fxEl.innerHTML = '';
      if (linesEl) linesEl.innerHTML = '';
      clearFeed();
      if (banner) banner.hidden = true;
      const champ = castById.get(tourney.championId);
      const card = document.createElement('div');
      card.id = 'tourney-crown';
      card.className = 'tourney-card';
      const inner = document.createElement('div');
      inner.className = 'tourney-card-inner tourney-crown-inner';
      const kicker = document.createElement('p');
      kicker.className = 'tourney-pot-label';
      kicker.textContent = 'Champion';
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 128;
      canvas.className = 'tourney-crown-art';
      const name = document.createElement('strong');
      name.textContent = champ ? champ.name : 'Champion';
      inner.append(kicker, canvas, name);
      if (tourney.championGold != null) {
        const earnLabel = document.createElement('p');
        earnLabel.className = 'tourney-pot-label';
        earnLabel.textContent = 'Earnings';
        const gold = document.createElement('b');
        gold.className = 'tourney-crown-gold';
        gold.textContent = Number(tourney.championGold).toLocaleString('en-US') + ' gold';
        inner.append(earnLabel, gold);
      }
      card.appendChild(inner);
      pit.appendChild(card);
      if (champ && window.SpoopArt) {
        window.SpoopArt.drawSpoop(canvas, { name: champ.name, equipped: champ.equipped }, { clear: true });
      }
      fightTitle = (champ ? champ.name : 'Champion') + ' wins the Tournament';
      if (statusEl) statusEl.textContent = fightTitle;
      playVictoryMusic();
      const stayed = await tourneyWait(SHOW.crown, token, true);
      card.remove();
      return stayed;
    }

    async function playSeries(match) {
      const games = match.games && match.games.length ? match.games : [{ bout: match.bout, winnerId: match.winnerId }];
      hideScrim();
      if (rosterEl) rosterEl.hidden = true;
      if (!await showVersus(match)) return false;
      if (match.bestOf && !await showBestOf()) return false;
      const tally = new Map([[match.aId, 0], [match.bId, 0]]);
      for (let g = 0; g < games.length; g++) {
        const game = games[g];
        if (!await playMatch(match, game.bout, g, games.length)) return false;
        tally.set(game.winnerId, (tally.get(game.winnerId) || 0) + 1);
        if (g < games.length - 1) {
          if (banner) banner.hidden = true;
          if (!await showScore(match, tally)) return false;
        } else if (!await tourneyWait(SHOW.win, token)) return false;
      }
      if (banner) banner.hidden = true;
      if (rosterEl) rosterEl.hidden = true;
      popScrim();
      fadePlayer(match.loserId);
      if (!await flySlot(match.winnerFrom, match.winnerTo, match.winnerId)) return false;
      return true;
    }

    let finished = false;
    try {
      if (!await showTitle()) return;
      buildBoard();
      popScrim();
      const entrants = openingPlayers(tourney.sides && tourney.sides.left)
        .concat(openingPlayers(tourney.sides && tourney.sides.right));
      for (const slot of entrants) {
        if (!await enterSlot(slot)) return;
      }
      const byes = tourney.byes || [];
      if (byes.length) {
        const moved = await Promise.all(byes.map((bye) => flySlot(bye.from, bye.to, bye.playerId)));
        if (moved.some((ok) => !ok)) return;
      }
      fightTitle = 'Tournament';
      if (statusEl) statusEl.textContent = 'Tournament';
      if (!await tourneyWait(SHOW.hold, token, true)) return;
      const matches = tourney.matches || [];
      for (let i = 0; i < matches.length; i++) {
        if (!await playSeries(matches[i])) return;
        const last = i === matches.length - 1;
        if (last) {
          if (!await tourneyWait(SHOW.bracketHold, token, true)) return;
          if (!await showCrown()) return;
        } else if (!await tourneyWait(SHOW.after, token)) return;
      }
      finished = true;
    } finally {
      if (token === tourneyToken) {
        tourneyBusy = false;
        introducing = false;
        if (finished) {
          const done = nightDone;
          nightDone = null;
          if (done) done();
        }
      }
    }
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
      if (tourneyBusy || playing) return;
      const last = data.last;
      upcomingPot = data.pot || null;
      lastPot = last && last.pot != null
        ? { gold: last.pot, avgLevel: last.avgLevel, count: (last.results || []).length }
        : null;
      paintPot(upcomingPot);
      const lastPk = data.lastPk;
      replayLast = last && (last.bout || last.tournament) ? last : null;
      const waiting = !!(pkAtMs && worldMs() < pkAtMs);
      const pkLive = !!(lastPk && lastPk.bout && !waiting && holdPk !== lastPk.at && seenPk() !== lastPk.at && liveFor(Date.parse(lastPk.at), lastPk.bout, PK_SPEED));
      const showMs = last && last.tournament ? last.tournament.showMs : 0;
      const nightLive = !!(last && (last.tournament || last.bout) && !waiting && !pkLive && holdNight !== last.at && seenAt() !== last.at && liveFor(Date.parse(last.at), last.bout, ARENA_SPEED, showMs));
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
      } else if (nightLive && last.tournament) {
        resultsEl.hidden = true;
        waitEl.hidden = true;
        nightDone = function () {
          holdNight = last.at;
          markSeen(last.at);
          restPit();
          statusEl.textContent = (last.winner || 'Champion') + ' won the Tournament.';
          syncReplay();
          tickCountdown();
        };
        paintPot(lastPot || upcomingPot);
        runTournament(last.tournament);
      } else if (nightLive) {
        resultsEl.hidden = true;
        waitEl.hidden = true;
        nightDone = function () {
          holdNight = last.at;
          markSeen(last.at);
          presentRecap(last);
        };
        paintPot(lastPot || upcomingPot);
        arm(last.bout, 'Spoopfight');
        beginFight(worldMs() - Date.parse(last.at) < 15000);
      } else if (waiting) {
        restPit();
        statusEl.textContent = pkA + ' vs ' + pkB;
        syncReplay();
        tickCountdown();
      } else if (recapAt && last && last.at === recapAt) {
        syncReplay();
        tickCountdown();
      } else {
        restPit();
        statusEl.textContent = last && last.winner
          ? last.winner + (last.tournament ? ' won the last Tournament.' : ' won the last Spoopfight.')
          : 'Waiting for 9:00pm ET.';
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
      playTournament(tourney, speed) {
        if (waitEl) waitEl.hidden = true;
        const champ = (tourney.cast || []).find((entry) => entry.id === tourney.championId);
        nightDone = function () {
          if (statusEl) statusEl.textContent = (champ ? champ.name : 'Champion') + ' won the Tournament.';
        };
        runTournament(tourney, speed);
      },
    };
    return;
  }

  if (replayBtn) replayBtn.addEventListener('click', playReplay);
  if (recapEl) recapEl.addEventListener('click', function (ev) {
    const action = ev.target.closest('[data-recap]');
    if (!action) return;
    if (action.getAttribute('data-recap') === 'replay') playReplay();
    if (action.getAttribute('data-recap') === 'close') leaveRecap();
  });

  window.setInterval(tickCountdown, 250);
  window.setInterval(() => {
    if (playing || fetchingNight || introducing) return;
    if (Date.now() - lastFetchAt < 30000) return;
    loadNight();
  }, 5000);
  loadNight();
})();
