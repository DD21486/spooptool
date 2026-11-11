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
  const waitKicker = document.getElementById('arena-wait-kicker');
  const replayBtn = document.getElementById('arena-replay');
  let fightTitle = 'Spoopfight';
  let playSpeed = ARENA_SPEED;
  let pkAtMs = 0;
  let pkA = '';
  let pkB = '';
  let pkReason = '';
  let lastFetchAt = 0;
  let replayLast = null;
  let holdPk = '';
  let holdNight = '';

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
    let markup = '';
    for (const f of bout.fighters) {
      const view = actors.get(f.id);
      if (!view || view.dead || !view.target) continue;
      const other = actors.get(view.target);
      if (!other || other.dead) continue;
      markup += '<line x1="' + view.x.toFixed(2) + '" y1="' + (view.y - 2.4).toFixed(2) +
        '" x2="' + other.x.toFixed(2) + '" y2="' + (other.y - 2.4).toFixed(2) + '"/>';
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
      return '<li class="tile" data-id="' + f.id + '">' +
        '<div class="tile-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
        '<canvas width="16" height="24" data-spoop="' + escapeHtml(f.name) + '"></canvas>' +
        '<div class="tile-hp"><span></span></div>' +
      '</li>';
    }).join('');
    if (!window.SpoopArt) return;
    fight.fighters.forEach((f) => {
      const canvas = rosterEl.querySelector('[data-id="' + f.id + '"] canvas');
      window.SpoopArt.drawSpoop(canvas, { name: f.name, equipped: f.equipped }, { clear: true });
    });
  }

  function mountActors(fight) {
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
      el.innerHTML =
        '<div class="hud">' +
          '<div class="hud-name">' + escapeHtml(f.name) + '</div>' +
          '<div class="hud-cb">Cb ' + f.combat + '</div>' +
          '<div class="hp-track"><span></span></div>' +
        '</div>' +
        '<div class="sprite-wrap"><canvas width="16" height="24"></canvas></div>';
      el.querySelector('.hud').style.transform = 'translateY(' + ((f.id.charCodeAt(f.id.length - 1) % 3) - 1) * 7 + 'px)';
      actorsEl.appendChild(el);
      const canvas = el.querySelector('canvas');
      if (window.SpoopArt) window.SpoopArt.drawSpoop(canvas, { name: f.name, equipped: f.equipped }, { clear: true });
      const card = rosterEl.querySelector('[data-id="' + f.id + '"]');
      const view = {
        el,
        wrap: el.querySelector('.sprite-wrap'),
        bar: el.querySelector('.hp-track > span'),
        card,
        cardBar: card ? card.querySelector('.tile-hp > span') : null,
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
      place(el, start.x, start.y, fight.width, fight.height);
      setHp(f, f.maxHp);
    });
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

  function shot(from, to, style) {
    const el = document.createElement('div');
    el.className = 'shot';
    el.style.background = style === 'magic' ? '#60a5fa' : '#bbf7d0';
    el.style.boxShadow = style === 'magic' ? '0 0 8px #60a5fa' : '0 0 6px #86efac';
    const x0 = (from.x / bout.width) * 100;
    const y0 = ((from.y - 4) / bout.height) * 100;
    const x1 = (to.x / bout.width) * 100;
    const y1 = ((to.y - 5) / bout.height) * 100;
    el.style.left = x0 + '%';
    el.style.top = y0 + '%';
    fxEl.appendChild(el);
    const t0 = performance.now();
    function step(now) {
      const u = Math.min(1, (now - t0) / 480);
      el.style.left = (x0 + (x1 - x0) * u) + '%';
      el.style.top = (y0 + (y1 - y0) * u) + '%';
      if (u < 1) requestAnimationFrame(step);
      else el.remove();
    }
    requestAnimationFrame(step);
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
    if (from && hit.style === 'melee') {
      from.el.classList.remove('is-lunge');
      void from.el.offsetWidth;
      from.el.classList.add('is-lunge');
    } else if (from && to) {
      shot(from, to, hit.style);
    }
  }

  function applyDeath(death) {
    const view = actors.get(death.id);
    if (view) {
      view.dead = true;
      view.el.classList.add('is-dead');
      view.el.classList.remove('is-lunge');
      if (view.card) view.card.classList.add('is-dead');
    }
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
      const faceLeft = pos.faceLeft != null ? pos.faceLeft : pos.x < prevX - 0.02;
      view.wrap.classList.toggle('is-left', !!faceLeft && pos.moving);
      view.wrap.classList.toggle('is-walk', !!pos.moving);
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
    cancelAnimationFrame(raf);
    playing = false;
    bout = fight;
    fightTitle = title || 'Spoopfight';
    playSpeed = fightTitle === 'PK' ? PK_SPEED : ARENA_SPEED;
    shownHit = 0;
    shownDeath = 0;
    renderRoster(fight);
    mountActors(fight);
    statusEl.textContent = fightTitle;
  }

  function start() {
    if (!bout || playing) return;
    shownHit = 0;
    shownDeath = 0;
    playFrom = 0;
    playOrigin = performance.now();
    playing = true;
    banner.hidden = true;
    resultsEl.hidden = true;
    waitEl.hidden = true;
    bout.fighters.forEach((f) => {
      const view = actors.get(f.id);
      if (!view) return;
      view.dead = false;
      view.el.classList.remove('is-dead', 'is-winner', 'is-lunge');
      if (view.card) view.card.classList.remove('is-dead', 'is-winner');
      setHp(f, f.maxHp);
      const startPos = sampleTrack(view.pts, 0);
      view.x = startPos.x;
      view.y = startPos.y;
      place(view.el, startPos.x, startPos.y, bout.width, bout.height);
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
    cancelAnimationFrame(raf);
    playing = false;
    bout = null;
    banner.hidden = true;
    banner.innerHTML = '';
    actors.clear();
    actorsEl.innerHTML = '';
    fxEl.innerHTML = '';
    if (linesEl) linesEl.innerHTML = '';
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
    if (playing) {
      countdownEl.textContent = fightTitle;
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
        start();
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
        start();
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
    if (playing || fetchingNight) return;
    if (Date.now() - lastFetchAt < 30000) return;
    loadNight();
  }, 5000);
  loadNight();
})();
