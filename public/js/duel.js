(function () {
  const statusEl = document.getElementById('arena-status');
  const countdownEl = document.getElementById('arena-countdown');
  const waitEl = document.getElementById('arena-wait');
  const waitClock = document.getElementById('arena-wait-clock');
  const waitWhen = document.getElementById('arena-wait-when');
  const pit = document.getElementById('arena-pit');
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/^\/w\/([a-z0-9]+)\/?$/i);
  const token = String(params.get('w') || (pathMatch ? pathMatch[1] : '')).trim();

  let clockOffset = 0;
  let fightAtMs = 0;
  let latest = null;
  let started = false;
  let sawWait = false;
  let polling = false;

  function nowMs() {
    return Date.now() + clockOffset;
  }

  function formatRemain(ms) {
    const safe = Math.max(0, ms);
    const total = Math.floor(safe / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return (h > 0 ? h + ':' : '') + pad(m) + ':' + pad(s);
  }

  function purseLine(data) {
    const gold = Number(data && data.stake || 0).toLocaleString();
    return (data && data.a ? data.a : 'Someone') + ' vs ' + (data && data.b ? data.b : 'someone') + ' · ' + gold + ' gold each';
  }

  function americanOdds(p) {
    if (!(p > 0) || !(p < 1)) return '';
    if (Math.abs(p - 0.5) < 0.005) return 'Even';
    if (p >= 0.5) return '-' + Math.round((100 * p) / (1 - p));
    return '+' + Math.round((100 * (1 - p)) / p);
  }

  let paintedSig = '';

  function paintStage(data) {
    if (!waitEl || !data) return;
    const sides = Array.isArray(data.sides) && data.sides.length === 2
      ? data.sides
      : [{ name: data.a }, { name: data.b }];
    const winner = data.phase === 'done' ? String(data.winner || '') : '';
    const sig = JSON.stringify([sides, winner, data.pot, data.stake]);
    if (sig === paintedSig) return;
    paintedSig = sig;
    waitEl.classList.toggle('is-done', !!winner);
    const potEl = document.getElementById('duel-pot');
    const stakeEl = document.getElementById('duel-stake');
    const pot = Number(data.pot) || Number(data.stake || 0) * 2;
    if (potEl) potEl.textContent = pot.toLocaleString();
    if (stakeEl) stakeEl.textContent = Number(data.stake || 0).toLocaleString() + ' gold each';
    sides.forEach((side, i) => {
      const el = waitEl.querySelector('.duel-side[data-side="' + i + '"]');
      if (!el) return;
      const p = Number(side.p);
      const hasOdds = Number.isFinite(p) && p > 0;
      el.querySelector('.duel-name').textContent = side.name || '';
      el.querySelector('.duel-meta').textContent = side.combat
        ? 'Cb ' + side.combat + ' · Gear ' + Math.round(Number(side.gear) || 0)
        : '';
      el.querySelector('.duel-pct').textContent = hasOdds ? Math.round(p * 100) + '%' : '';
      el.querySelector('.duel-line').textContent = hasOdds ? americanOdds(p) + ' to win' : '';
      el.classList.toggle('is-fav', hasOdds && p > 0.5);
      el.classList.toggle('is-winner', !!winner && winner === side.name);
      el.classList.toggle('is-loser', !!winner && winner !== side.name);
      el.querySelector('.duel-badge').hidden = !(winner && winner === side.name);
      const canvas = el.querySelector('.duel-art');
      if (canvas && window.SpoopArt) {
        window.SpoopArt.drawSpoop(canvas, { name: side.name, equipped: side.equipped || {} }, { clear: true });
      }
    });
  }

  function showWait(data) {
    if (waitEl) waitEl.hidden = false;
    if (countdownEl) countdownEl.textContent = 'Duel';
    paintStage(data);
    if (waitWhen) waitWhen.textContent = data && data.starting ? 'Fighters walking out' : 'until the fight';
    const left = fightAtMs - nowMs();
    const text = data && data.starting ? 'FIGHT' : formatRemain(left);
    if (waitClock) {
      waitClock.textContent = text;
      waitClock.classList.toggle('is-close', !!(data && data.starting) || left <= 60000);
    }
    if (statusEl) statusEl.textContent = data && data.starting ? 'The duel is about to start.' : purseLine(data);
  }

  function showDone(data) {
    if (waitEl) waitEl.hidden = false;
    if (countdownEl) countdownEl.textContent = 'Duel';
    paintStage(data);
    const kicker = document.getElementById('arena-wait-kicker');
    if (kicker) kicker.textContent = 'Duel over';
    if (waitClock) {
      waitClock.textContent = data && data.winner ? data.winner + ' wins' : 'Finished';
      waitClock.classList.remove('is-close');
      waitClock.classList.add('is-result');
    }
    if (waitWhen) waitWhen.textContent = data && data.winner ? 'and takes the pot' : '';
    if (statusEl) statusEl.textContent = (data && data.winner ? data.winner : 'Someone') + ' won the duel.';
  }

  function waitMs(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
  }

  function showVersus(data, ms) {
    if (!pit) return waitMs(ms);
    const card = document.createElement('div');
    card.className = 'tourney-vs';
    card.innerHTML = '<div class="tourney-vs-inner">' +
      '<p class="tourney-vs-round">Duel</p>' +
      '<p class="tourney-vs-line"><strong></strong><span>vs</span><strong></strong></p>' +
      '</div>';
    const names = card.querySelectorAll('strong');
    names[0].textContent = data.a || '';
    names[1].textContent = data.b || '';
    pit.appendChild(card);
    if (statusEl) statusEl.textContent = (data.a || '') + ' vs ' + (data.b || '');
    return waitMs(ms).then(() => card.remove());
  }

  function onDone() {
    window.setTimeout(() => refresh(true), 1200);
  }

  async function beginShow(data) {
    if (started || !data || data.phase !== 'live' || !data.bout || !window.ArenaPit) return;
    started = true;
    if (waitEl) waitEl.hidden = true;
    data.bout.pkNote = Number(data.stake || 0).toLocaleString() + ' gold each';
    const showAt = Date.parse(data.showAt || '');
    const age = sawWait || !Number.isFinite(showAt) ? 0 : nowMs() - showAt;
    const versus = Number(data.versusMs) || 2900;
    const lead = Number(data.leadMs) || versus + 2000;
    if (age < versus) await showVersus(data, versus - Math.max(0, age));
    if (!window.ArenaPit) return;
    const seek = age > lead ? ((age - lead) / 1000) * (Number(data.speed) || 3) * (Number(data.pace) || 0.55) : 0;
    window.ArenaPit.play(data.bout, data.speed, onDone, seek);
  }

  async function refresh(force) {
    if (polling && !force) return;
    if (!token) {
      if (statusEl) statusEl.textContent = 'This duel link is empty.';
      return;
    }
    polling = true;
    try {
      const res = await fetch('/api/duel?w=' + encodeURIComponent(token));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the duel');
      latest = data;
      const serverNow = Date.parse(data.serverNow || '');
      if (Number.isFinite(serverNow)) clockOffset = serverNow - Date.now();
      fightAtMs = Date.parse(data.fightAt || '') || 0;
      if (data.phase === 'wait') {
        sawWait = true;
        showWait(data);
        return;
      }
      if (data.phase === 'done') {
        if (!started) showDone(data);
        else if (statusEl && data.winner) statusEl.textContent = data.winner + ' won the duel.';
        return;
      }
      if (data.phase === 'live') await beginShow(data);
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message || 'Could not load the duel';
    } finally {
      polling = false;
    }
  }

  function tick() {
    if (!latest || started) return;
    if (latest.phase === 'wait') showWait(latest);
    if (latest.phase === 'wait' && fightAtMs && nowMs() >= fightAtMs) refresh(true);
  }

  window.setInterval(tick, 250);
  window.setInterval(() => {
    if (started) return;
    refresh(false);
  }, 3000);
  refresh(true);
})();
