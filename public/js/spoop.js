(function () {
  const TIER_COLORS = {
    bronze: '#c47a3a',
    iron: '#b8b8b8',
    steel: '#d5d8e0',
    black: '#4a4a4a',
    mithril: '#6a8ec8',
    adamant: '#3d9a55',
    rune: '#3aa0d8',
    dragon: '#d04532',
    barrows: '#7a4ea8',
    raid: '#e6c15a',
  };

  const QUALITY_RANK = {
    crude: 0, worn: 1, standard: 2, fine: 3, sharpened: 4, tempered: 5, masterwork: 6,
  };

  function spoopKey(spoop) {
    return (spoop && (spoop.owner || spoop.name)) || '';
  }

  function findSpoop(spoops, name) {
    const wanted = String(name || '').toLowerCase();
    return (spoops || []).find((spoop) =>
      String(spoop.name || '').toLowerCase() === wanted ||
      String(spoop.owner || '').toLowerCase() === wanted
    );
  }

  function hashName(name) {
    let h = 2166136261;
    const str = String(name || '');
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function gold(n) {
    return Number(n || 0).toLocaleString() + ' gold';
  }

  function shiftColor(hex, amt) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const ch = (v) => Math.max(0, Math.min(255, v));
    const r = ch((n >> 16) + amt);
    const g = ch(((n >> 8) & 255) + amt);
    const b = ch((n & 255) + amt);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function drawSpoop(canvas, spoop, opts) {
    if (!canvas) return;
    const W = 16;
    const H = 24;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const grid = [];
    for (let y = 0; y < H; y++) grid.push(new Array(W).fill(null));
    const put = (x, y, color) => {
      if (x >= 0 && y >= 0 && x < W && y < H && color) grid[y][x] = color;
    };
    const fill = (x, y, w, h, color) => {
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) put(x + xx, y + yy, color);
      }
    };

    const hash = hashName(spoop && spoop.name);
    const blonde = (hash & 1) === 0;
    const beard = (hash & 4) !== 0;
    const hair = blonde ? '#e6c34a' : '#6b4228';
    const hairHi = blonde ? '#f8e7a4' : '#8d5a34';
    const hairLo = blonde ? '#b08a32' : '#3e2616';
    const skin = '#f2c8a4';
    const skinDk = '#e0b08c';
    const eye = '#2f8f45';
    const pupil = '#14321c';

    const eq = (spoop && spoop.equipped) || {};
    const body = eq.body;
    const bodyQ = body ? (QUALITY_RANK[body.quality] || 0) : -1;
    const tierHex = body ? (TIER_COLORS[body.tier] || '#a56b3c') : null;
    const cloth = tierHex ? shiftColor(tierHex, bodyQ < 2 ? -32 : bodyQ >= 3 ? 18 : 0) : '#c48a52';
    const clothDk = tierHex ? shiftColor(tierHex, -52) : '#7a4e2c';

    const helm = eq.head;
    const helmQ = helm ? (QUALITY_RANK[helm.quality] || 0) : -1;
    const top = helm ? shiftColor(TIER_COLORS[helm.tier] || hair, helmQ >= 3 ? 14 : 0) : hair;
    const topHi = helm ? shiftColor(TIER_COLORS[helm.tier] || hair, 48) : hairHi;
    const topLo = helm ? shiftColor(TIER_COLORS[helm.tier] || hair, -42) : hairLo;

    const cape = eq.cape;
    if (cape) {
      const cq = QUALITY_RANK[cape.quality] || 0;
      const cc = shiftColor(TIER_COLORS[cape.tier] || '#3d5a8a', -18);
      const len = 5 + Math.min(5, cq);
      fill(1, 11, 1, len, cc);
      fill(14, 11, 1, len, cc);
      if (cq >= 5) {
        put(1, 11, '#f0d878');
        put(14, 11, '#f0d878');
      }
    }

    fill(4, 1, 8, 2, top);
    fill(3, 3, 10, 2, top);
    fill(5, 1, 3, 1, topHi);
    put(3, 4, topLo);
    put(12, 4, topLo);
    if (helm && helmQ >= 4) fill(5, 2, 6, 1, topHi);
    if (helm && helmQ >= 6) {
      put(7, 1, '#f0d878');
      put(8, 1, '#fff6c8');
    }

    fill(4, 5, 8, 4, skin);
    put(5, 6, eye);
    put(6, 6, pupil);
    put(9, 6, pupil);
    put(10, 6, eye);
    put(7, 7, skinDk);
    put(8, 7, skinDk);
    if (!helm && beard) fill(6, 8, 4, 1, hairLo);
    else {
      put(6, 8, skinDk);
      put(9, 8, skinDk);
    }
    if (helm) fill(4, 5, 8, 1, topLo);

    fill(6, 9, 4, 1, skin);

    fill(4, 10, 8, 5, cloth);
    fill(6, 11, 4, 3, clothDk);
    if (!tierHex) {
      put(7, 11, skin);
      put(8, 11, skin);
    }
    fill(2, 11, 2, 4, skin);
    fill(12, 11, 2, 4, skin);
    put(2, 14, clothDk);
    put(13, 14, clothDk);

    if (bodyQ >= 4 && tierHex) {
      fill(2, 10, 2, 2, cloth);
      fill(12, 10, 2, 2, cloth);
      put(2, 10, clothDk);
      put(13, 10, clothDk);
    }
    if (bodyQ >= 5 && tierHex) fill(4, 10, 8, 1, '#f0d878');
    if (bodyQ >= 6 && tierHex) {
      put(7, 12, '#f0d878');
      put(8, 12, '#fff6c8');
    }
    if (bodyQ === 0 && tierHex) put(5, 13, '#3a2a1c');

    const legs = eq.legs;
    const legQ = legs ? (QUALITY_RANK[legs.quality] || 0) : -1;
    const legCol = legs ? shiftColor(TIER_COLORS[legs.tier] || '#5c3a28', legQ >= 3 ? 8 : -12) : '#5c3824';
    fill(5, 15, 2, 4, legCol);
    fill(9, 15, 2, 4, legCol);
    if (legQ >= 5) {
      put(5, 15, '#f0d878');
      put(9, 15, '#f0d878');
    }

    const boots = eq.boots;
    const bootQ = boots ? (QUALITY_RANK[boots.quality] || 0) : -1;
    const bootCol = boots ? shiftColor(TIER_COLORS[boots.tier] || '#3d2914', bootQ >= 3 ? 10 : -16) : '#3a2618';
    fill(4, 18, 3, 2, bootCol);
    fill(9, 18, 3, 2, bootCol);
    if (bootQ >= 6) {
      put(4, 18, '#f0d878');
      put(11, 18, '#f0d878');
    }

    const shield = eq.shield;
    if (shield) {
      const sq = QUALITY_RANK[shield.quality] || 0;
      const sc = shiftColor(TIER_COLORS[shield.tier] || cloth, sq >= 3 ? 10 : 0);
      fill(13, 12, 2, 3 + (sq >= 4 ? 1 : 0), sc);
      put(14, 13, shiftColor(sc, -40));
      if (sq >= 5) put(13, 12, '#f0d878');
      if (sq >= 6) put(14, 14, '#fff6c8');
    }

    const weapon = eq.weapon;
    if (weapon) {
      const style = weapon.style;
      const wq = QUALITY_RANK[weapon.quality] || 0;
      const wc = style === 'ranged'
        ? '#8a5a2b'
        : style === 'magic'
          ? '#7c6ad8'
          : (TIER_COLORS[weapon.tier] || '#c0c0c0');
      const len = 4 + wq;
      if (style === 'ranged') {
        for (let i = 0; i < 6; i++) put(0, 11 + i, wc);
        put(1, 12, wc);
        put(1, 15, wc);
        put(1, 13, '#efe4c8');
        put(1, 14, '#efe4c8');
      } else if (style === 'magic') {
        for (let i = 0; i < len; i++) put(0, 17 - i, wc);
        put(0, 17 - len, '#f0d878');
        put(1, 17 - len, '#fff6c8');
      } else {
        for (let i = 0; i < len; i++) put(0, 16 - i, wc);
        put(0, 16 - len, shiftColor(wc, 46));
        put(1, 15, shiftColor(wc, 28));
        if (wq >= 5) put(1, 14, '#f0d878');
      }
    }

    if (opts && opts.clear) ctx.clearRect(0, 0, W, H);
    else {
      ctx.fillStyle = '#c4a574';
      ctx.fillRect(0, 0, W, H);
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!grid[y][x]) continue;
        ctx.fillStyle = grid[y][x];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.payload = data;
      throw err;
    }
    return data;
  }

  function influenceOf(state, spoop) {
    if (state.useSim) return spoop.heat || { xp: false, boss: false, loot: false };
    return state.liveHeat || { xp: false, boss: false, loot: false };
  }

  function pip(on, label) {
    const cls = on ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-500';
    return '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ' + cls + '">' + label + '</span>';
  }

  function itemLine(item) {
    if (!item) return '<span class="text-slate-600">Empty</span>';
    return '<span class="text-slate-100">' + escapeHtml(item.name) + '</span>';
  }

  let lastState = null;

  function mountDebug(state) {
    let panel = document.getElementById('spoop-debug');
    if (!state.debug) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'spoop-debug';
      panel.className = 'fixed bottom-4 right-4 z-40 w-72 rounded-lg border border-amber-700/60 bg-slate-900/95 shadow-xl p-3 text-xs';
      document.body.appendChild(panel);
    }
    const next = state.nextEvent ? state.nextEvent.label : 'No event';
    const heat = (state.spoops[0] && state.spoops[0].heat) || { xp: false, boss: false, loot: false };
    const happened = (state.happened || []).slice(-6);
    panel.innerHTML =
      '<div class="flex items-center justify-between gap-2 mb-2">' +
        '<span class="font-semibold text-amber-300">Debug clock</span>' +
        '<span class="text-slate-400">' + (state.useSim ? 'Simulated' : 'Real') + '</span>' +
      '</div>' +
      '<p class="text-slate-200 mb-2">' + escapeHtml(state.clockLabel) + '</p>' +
      '<p class="text-slate-500 mb-2">Next: ' + escapeHtml(next) + '</p>' +
      '<div class="flex flex-wrap gap-1 mb-2">' +
        '<button type="button" data-debug="next" class="px-2 py-1 rounded bg-amber-500 text-slate-900 font-semibold">Next event</button>' +
        '<button type="button" data-debug="day" class="px-2 py-1 rounded bg-slate-700 text-slate-100">+1 day</button>' +
        '<button type="button" data-debug="week" class="px-2 py-1 rounded bg-slate-700 text-slate-100">+7 days</button>' +
        '<button type="button" data-debug="month" class="px-2 py-1 rounded bg-slate-700 text-slate-100">+30 days</button>' +
      '</div>' +
      '<p class="text-slate-500 mb-1">Heat while simulating</p>' +
      '<div class="flex flex-wrap gap-1 mb-2">' +
        heatBtn('xp', 'Big XP', heat.xp) +
        heatBtn('boss', 'Bossing', heat.boss) +
        heatBtn('loot', 'Nice drop', heat.loot) +
      '</div>' +
      '<div class="flex flex-wrap gap-1">' +
        '<button type="button" data-debug="real" class="px-2 py-1 rounded bg-slate-800 text-slate-300">Use real clock</button>' +
        '<button type="button" data-debug="reset" class="px-2 py-1 rounded bg-slate-800 text-rose-300">Reset spoop</button>' +
      '</div>' +
      (happened.length
        ? '<ul class="mt-2 space-y-1 text-slate-400 max-h-28 overflow-auto">' + happened.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') + '</ul>'
        : '');
    panel.querySelectorAll('[data-debug]').forEach((btn) => {
      btn.addEventListener('click', () => onDebug(btn.getAttribute('data-debug')));
    });
  }

  function heatBtn(key, label, on) {
    return '<button type="button" data-debug="heat-' + key + '" class="px-2 py-1 rounded ' +
      (on ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-300') + '">' + label + '</button>';
  }

  async function onDebug(op) {
    const spoop = lastState && lastState.spoops && lastState.spoops[0];
    const heat = (spoop && spoop.heat) || { xp: false, boss: false, loot: false };
    try {
      let body;
      if (op === 'next') body = { action: 'debug', op: 'next' };
      else if (op === 'day') body = { action: 'debug', op: 'days', days: 1 };
      else if (op === 'week') body = { action: 'debug', op: 'days', days: 7 };
      else if (op === 'month') body = { action: 'debug', op: 'days', days: 30 };
      else if (op === 'real') body = { action: 'debug', op: 'real' };
      else if (op === 'reset') {
        if (!window.confirm('Reset SpoopSpooply back to a new spoop?')) return;
        body = { action: 'debug', op: 'reset' };
      } else if (op.indexOf('heat-') === 0) {
        const key = op.slice(5);
        body = { action: 'debug', op: 'heat', xp: !!heat.xp, boss: !!heat.boss, loot: !!heat.loot };
        body[key] = !heat[key];
      }
      const data = await api('/api/spoops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      render(data);
    } catch (err) {
      window.alert(err.message);
    }
  }

  function wornIcons(spoop) {
    const slots = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'gloves', 'boots', 'ring'];
    return slots.map((slot) => {
      const item = spoop.equipped && spoop.equipped[slot];
      if (!item || !item.osrsId) return '';
      return '<img src="/api/spoops?icon=1&id=' + item.osrsId + '" alt="" title="' + escapeHtml(item.name) + '">';
    }).join('');
  }

  // gielinor-map.png: tile (1120, 4096) is the top-left, 0.25 px per tile, 704×391.
  const GIELINOR = { x0: 1120, yTop: 4096, scale: 0.25, w: 704, h: 391 };

  function mapPercent(x, y) {
    const gx = Number(x);
    const gy = Number(y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return { left: 62, top: 56 };
    return {
      left: ((gx - GIELINOR.x0) * GIELINOR.scale) / GIELINOR.w * 100,
      top: ((GIELINOR.yTop - gy) * GIELINOR.scale) / GIELINOR.h * 100,
    };
  }

  function renderMap(spoops) {
    const groups = {};
    spoops.forEach((spoop) => {
      const id = (spoop.activity && spoop.activity.id) || '';
      if (!groups[id]) groups[id] = [];
      groups[id].push(spoop);
    });
    const pins = spoops.map((spoop) => {
      const act = spoop.activity || {};
      const pt = mapPercent(act.x, act.y);
      const mates = groups[act.id] || [spoop];
      const index = Math.max(0, mates.indexOf(spoop));
      let left = pt.left;
      let top = pt.top;
      if (mates.length > 1) {
        const angle = (index / mates.length) * Math.PI * 2 - Math.PI / 2;
        left += Math.cos(angle) * 2.4;
        top += Math.sin(angle) * 1.8;
      }
      left = Math.max(4, Math.min(96, left));
      top = Math.max(5, Math.min(94, top));
      const style = ['melee', 'ranged', 'magic', 'skilling', 'quest'].includes(act.style) ? act.style : 'melee';
      const low = top < 12 ? ' is-low' : '';
      return '<a class="spoop-pin' + low + '" data-spoop="' + escapeHtml(spoopKey(spoop)) + '" href="/spoop.html?name=' + encodeURIComponent(spoopKey(spoop)) + '" style="left:' + left.toFixed(2) + '%;top:' + top.toFixed(2) + '%">' +
        '<span class="spoop-pin-tip">' +
          '<span class="spoop-pin-name">' + escapeHtml(spoop.name) + '</span>' +
          '<span class="spoop-pin-act">' + escapeHtml(act.name || '') + '</span>' +
        '</span>' +
        '<span class="spoop-pin-orb spoop-pin-' + style + '"></span>' +
      '</a>';
    }).join('');
    return '<section class="gielinor-wrap">' +
      '<p class="gielinor-kicker">On Gielinor</p>' +
      '<div class="gielinor">' +
        '<div class="gielinor-stage">' +
          '<img class="gielinor-map" src="/assets/gielinor-map.png" alt="Map of Gielinor" width="704" height="391">' +
          '<img class="gielinor-map gielinor-map-sharp" alt="" width="1408" height="782">' +
          pins +
        '</div>' +
        '<div class="gielinor-zoom" role="group" aria-label="Map zoom">' +
          '<button type="button" data-zoom="in" aria-label="Zoom in">+</button>' +
          '<button type="button" data-zoom="out" aria-label="Zoom out">−</button>' +
          '<button type="button" data-zoom="reset" aria-label="Reset map">↺</button>' +
        '</div>' +
      '</div>' +
      '<p class="gielinor-credit">Scroll or pinch to zoom. Drag to look around. Map tiles from the <a href="https://maps.runescape.wiki/osrs/" target="_blank" rel="noreferrer">Old School RuneScape Wiki</a>. Game map by Jagex.</p>' +
    '</section>';
  }

  function mountMapZoom(root) {
    const view = root.querySelector('.gielinor');
    const stage = root.querySelector('.gielinor-stage');
    if (!view || !stage) return;
    let scale = 1;
    let x = 0;
    let y = 0;
    let drag = null;
    const pointers = new Map();

    function clamp() {
      const vw = view.clientWidth;
      const vh = view.clientHeight;
      const sw = stage.offsetWidth * scale;
      const sh = stage.offsetHeight * scale;
      x = Math.min(0, Math.max(Math.min(0, vw - sw), x));
      y = Math.min(0, Math.max(Math.min(0, vh - sh), y));
    }

    const SHARP_AT = 2;
    const sharp = stage.querySelector('.gielinor-map-sharp');

    function syncSharp() {
      if (!sharp) return;
      const want = scale >= SHARP_AT;
      if (want && !sharp.getAttribute('src')) {
        sharp.addEventListener('load', () => {
          if (scale >= SHARP_AT) stage.classList.add('is-sharp');
        });
        sharp.src = '/assets/gielinor-map-2x.png';
      }
      const ready = sharp.complete && sharp.naturalWidth > 0;
      stage.classList.toggle('is-sharp', want && ready);
    }

    function apply() {
      stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
      // Dots shrink past the map scale so the tile stays visible. Labels shrink less so the names stay readable.
      stage.style.setProperty('--pin-scale', (1 / Math.pow(scale, 1.35)).toFixed(4));
      stage.style.setProperty('--label-scale', Math.pow(scale, 0.22).toFixed(4));
      syncSharp();
    }

    function reveal(pin) {
      if (!pin || scale <= 1.05) return;
      const viewRect = view.getBoundingClientRect();
      const pinRect = pin.getBoundingClientRect();
      const pad = 36;
      const outside = pinRect.left < viewRect.left + pad || pinRect.right > viewRect.right - pad ||
        pinRect.top < viewRect.top + pad || pinRect.bottom > viewRect.bottom - pad;
      if (!outside) return;
      x += (viewRect.left + viewRect.width / 2) - (pinRect.left + pinRect.width / 2);
      y += (viewRect.top + viewRect.height / 2) - (pinRect.top + pinRect.height / 2);
      clamp();
      apply();
    }

    function zoomAt(clientX, clientY, next) {
      const rect = view.getBoundingClientRect();
      const ox = clientX - rect.left;
      const oy = clientY - rect.top;
      const clamped = Math.min(8, Math.max(1, next));
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

    view.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(ev.clientX, ev.clientY, scale * factor);
    }, { passive: false });

    view.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.gielinor-zoom')) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 1) {
        drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false, originX: x, originY: y };
        view.classList.add('is-drag');
      }
      view.setPointerCapture(ev.pointerId);
    });

    view.addEventListener('pointermove', (ev) => {
      const prev = pointers.get(ev.pointerId);
      if (!prev) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size >= 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (!view._pinchDist) view._pinchDist = dist;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        zoomAt(midX, midY, scale * (dist / view._pinchDist));
        view._pinchDist = dist;
        if (drag) drag.moved = true;
        return;
      }
      if (!drag || drag.id !== ev.pointerId || scale === 1) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 4 || Math.hypot(x - drag.originX, y - drag.originY) > 4) {
        drag.moved = true;
      }
      x += dx;
      y += dy;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      clamp();
      apply();
    });

    function endPointer(ev) {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) view._pinchDist = 0;
      if (drag && drag.id === ev.pointerId) {
        view.classList.remove('is-drag');
        if (drag.moved) {
          const block = (clickEv) => {
            clickEv.preventDefault();
            clickEv.stopPropagation();
            view.removeEventListener('click', block, true);
          };
          view.addEventListener('click', block, true);
        }
        drag = null;
      }
    }
    view.addEventListener('pointerup', endPointer);
    view.addEventListener('pointercancel', endPointer);

    view.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.gielinor-zoom') || ev.target.closest('.spoop-pin')) return;
      zoomAt(ev.clientX, ev.clientY, scale < 4 ? scale * 2 : 1);
    });

    view.querySelectorAll('[data-zoom]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const rect = view.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const op = btn.getAttribute('data-zoom');
        if (op === 'in') zoomAt(cx, cy, scale * 1.4);
        else if (op === 'out') zoomAt(cx, cy, scale / 1.4);
        else zoomAt(cx, cy, 1);
      });
    });

    return { reveal };
  }

  function bindSpoopHover(root, map) {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    root.querySelectorAll('.spoop-card, .spoop-pin').forEach((el) => {
      const key = el.getAttribute('data-spoop');
      if (!key) return;
      const mates = () => Array.from(root.querySelectorAll('[data-spoop]')).filter((other) => other.getAttribute('data-spoop') === key);
      el.addEventListener('pointerenter', () => {
        mates().forEach((other) => other.classList.add('is-hot'));
        if (map && el.classList.contains('spoop-card')) {
          const pin = mates().find((other) => other.classList.contains('spoop-pin'));
          if (pin) map.reveal(pin);
        }
      });
      el.addEventListener('pointerleave', () => {
        mates().forEach((other) => other.classList.remove('is-hot'));
      });
      el.addEventListener('focus', () => mates().forEach((other) => other.classList.add('is-hot')));
      el.addEventListener('blur', () => mates().forEach((other) => other.classList.remove('is-hot')));
    });
  }

  function nextActionPhrase(kind) {
    if (kind === 'arena') return 'Arena';
    if (kind === 'drop') return 'Activity and loot';
    return 'Next activity';
  }

  function formatRemain(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  }

  function nextActionHtml(spoop, state, detail) {
    const next = spoop && spoop.nextAction;
    if (!next || !next.at) return '';
    const cls = detail ? 'spoop-next mt-3 text-sm text-slate-300' : 'spoop-next';
    return '<p class="' + cls + '" data-next-at="' + escapeHtml(next.at) + '" data-next-kind="' + escapeHtml(next.kind || 'tick') + '" data-next-time="' + escapeHtml(next.time || '') + '"' +
      (detail ? ' data-next-detail="1"' : '') +
      (state && state.useSim ? ' data-sim="1" data-sim-clock="' + escapeHtml(state.clock || '') + '"' : '') +
      '></p>';
  }

  function nextActionText(el) {
    const what = nextActionPhrase(el.getAttribute('data-next-kind'));
    const time = el.getAttribute('data-next-time') || '';
    const at = Date.parse(el.getAttribute('data-next-at') || '');
    const clockBit = time ? ' · ' + time + ' ET' : '';
    if (!Number.isFinite(at)) return what;
    if (el.getAttribute('data-sim') === '1') return what + ' at ' + (time || 'the next slot') + ' ET';
    const ms = at - Date.now();
    if (ms <= 0) return what + ' due now' + (el.getAttribute('data-next-detail') === '1' ? clockBit : '');
    const line = what + ' in ' + formatRemain(ms);
    return el.getAttribute('data-next-detail') === '1' ? line + clockBit : line;
  }

  let nextTimer = null;
  let nextRefreshAt = 0;

  function paintNextActions() {
    let due = false;
    document.querySelectorAll('[data-next-at]').forEach((el) => {
      const at = Date.parse(el.getAttribute('data-next-at') || '');
      const time = el.getAttribute('data-next-time');
      el.textContent = nextActionText(el);
      if (time) el.title = time + ' ET';
      if (el.getAttribute('data-sim') !== '1' && Number.isFinite(at) && at <= Date.now()) due = true;
    });
    if (!due || document.querySelector('.roll-overlay') || Date.now() < nextRefreshAt) return;
    nextRefreshAt = Date.now() + 15000;
    boot();
  }

  function startNextTimers() {
    paintNextActions();
    if (nextTimer) return;
    nextTimer = window.setInterval(paintNextActions, 1000);
  }

  function renderList(state) {
    const root = document.getElementById('spoop-root');
    const spoops = state.spoops || [];
    const cards = spoops.map((spoop) => {
      const owner = spoop.owner && spoop.owner !== spoop.name
        ? '<p class="spoop-owner">' + escapeHtml(spoop.owner) + '</p>'
        : '';
      return (
        '<a href="/spoop.html?name=' + encodeURIComponent(spoopKey(spoop)) + '" class="spoop-card" data-spoop="' + escapeHtml(spoopKey(spoop)) + '">' +
          '<canvas class="spoop-sprite" width="16" height="24" data-spoop="' + escapeHtml(spoopKey(spoop)) + '"></canvas>' +
          '<h2>' + escapeHtml(spoop.name) + '</h2>' +
          owner +
          '<dl class="spoop-stats">' +
            '<div><dt>Combat</dt><dd>' + spoop.combat + '</dd></div>' +
            '<div><dt>Gold</dt><dd>' + Number(spoop.gold || 0).toLocaleString() + '</dd></div>' +
            '<div><dt>Arena</dt><dd>' + spoop.arenaWins + '–' + spoop.arenaLosses + '</dd></div>' +
          '</dl>' +
          '<p class="spoop-act">' + escapeHtml(spoop.activity.name) + '</p>' +
          nextActionHtml(spoop, state) +
        '</a>'
      );
    }).join('');
    root.innerHTML = renderMap(spoops) + (cards ? '<div class="spoop-grid">' + cards + '</div>' : '<p class="spoop-log-empty">No spoops yet.</p>');
    const map = mountMapZoom(root);
    bindSpoopHover(root, map);
    paint(state);
  }

  function activityLog(spoop) {
    const rows = (spoop.log || []).slice(0, 20);
    if (!rows.length) return '<p class="spoop-log-empty">Nothing recorded yet.</p>';
    return '<ol class="spoop-log-list">' + rows.map((row) => {
      const text = String(row.text || '');
      const parts = text.split(' — ');
      const time = parts.length > 1 ? parts[0] : '';
      const body = parts.length > 1 ? parts.slice(1).join(' — ') : text;
      return '<li><time>' + escapeHtml(time) + '</time><p>' + escapeHtml(body) + '</p></li>';
    }).join('') + '</ol>';
  }

  function bar(pct) {
    const w = Math.max(0, Math.min(100, Math.round((Number(pct) || 0) * 100)));
    return '<div class="spoop-bar flex-1"><span style="width:' + w + '%"></span></div>';
  }

  function itemIcon(item) {
    if (!item || !item.osrsId) return '';
    return '<img src="/api/spoops?icon=1&id=' + item.osrsId + '" alt="" width="36" height="36" loading="lazy">';
  }

  const SKILL_ICON = {
    attack: '/assets/Attack_icon.png',
    strength: '/assets/Strength_icon.png',
    defence: '/assets/Defence_icon.png',
    hitpoints: '/assets/Hitpoints_icon.png',
    ranged: '/assets/Ranged_icon.png',
    magic: '/assets/Magic_icon.png',
    prayer: '/assets/Prayer_icon.png',
  };

  const SLOT_LABEL = {
    weapon: 'Weapon', shield: 'Shield', head: 'Head', body: 'Body', legs: 'Legs',
    boots: 'Boots', gloves: 'Hands', cape: 'Cape', neck: 'Neck', ring: 'Ring', ammo: 'Ammo',
  };

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

  function bonusRows(stats, suffixFor) {
    const labels = { stab: 'Stab', slash: 'Slash', crush: 'Crush', magic: 'Magic', range: 'Range', melee: 'Melee str', ranged: 'Ranged str', prayer: 'Prayer' };
    return Object.keys(stats).map((key) => {
      const n = Number(stats[key]) || 0;
      if (!n) return '';
      const tone = n > 0 ? 'text-emerald-400' : 'text-rose-400';
      const suffix = suffixFor && suffixFor[key] ? suffixFor[key] : '';
      const label = key === 'magic' && suffix ? 'Magic dmg' : labels[key];
      return '<div class="flex justify-between gap-3"><span>' + label + '</span><span class="tabular-nums ' + tone + '">' + (n > 0 ? '+' : '') + n + suffix + '</span></div>';
    }).join('');
  }

  function itemTip(item, spoop) {
    const bonuses = item.bonuses || { attack: {}, defence: {}, other: {} };
    const attack = bonusRows(bonuses.attack || {});
    const defence = bonusRows(bonuses.defence || {});
    const other = bonusRows(bonuses.other || {}, { magic: '%' });
    const block = (title, rows) => rows
      ? '<p class="text-[10px] uppercase tracking-wide text-slate-500 mt-1.5">' + title + '</p>' + rows
      : '';
    const req = item.requirement;
    let reqHtml = '';
    if (req) {
      const skill = (spoop.skills || []).find((s) => s.id === req.skill);
      const met = skill && skill.level >= req.level;
      reqHtml = '<p class="mt-1.5 ' + (met ? 'text-slate-400' : 'text-rose-300') + '">Requires ' + req.level + ' ' + escapeHtml(req.skillName) + '</p>';
    }
    return '<div class="spoop-tip" role="tooltip">' +
      '<p class="text-xs" style="color:' + (QUALITY_COLOR[item.quality] || '#fde68a') + '">' + escapeHtml(item.name) + '</p>' +
      reqHtml +
      block('Attack', attack) +
      block('Defence', defence) +
      block('Other', other) +
    '</div>';
  }

  function slotFrame(item, inner, spoop) {
    const color = item && QUALITY_COLOR[item.quality];
    const style = color ? ' style="border-color:' + color + '"' : '';
    const tip = item ? itemTip(item, spoop) : '';
    return '<div class="spoop-slot"' + style + ' tabindex="0">' + inner + tip + '</div>';
  }

  function gearCell(slot, item, spoop) {
    if (!slot) return '<div></div>';
    const label = SLOT_LABEL[slot] || slot;
    const inner = item && item.osrsId
      ? itemIcon(item)
      : '<span class="text-[9px] uppercase tracking-wide text-slate-600 text-center leading-tight px-1">' + escapeHtml(label) + '</span>';
    return slotFrame(item, inner, spoop);
  }

  function renderDetail(state) {
    const root = document.getElementById('spoop-root');
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name') || 'SpoopSpooply';
    const spoop = findSpoop(state.spoops, name);
    if (!spoop) {
      root.innerHTML = '<p class="text-slate-400">No spoop named ' + escapeHtml(name) + '.</p>';
      return;
    }
    const heat = influenceOf(state, spoop);
    const heatLabel = state.useSim ? 'Debug heat, applied as you simulate' : 'From the real account, last 18 hours';
    const quests = spoop.quests || { points: 0, done: 0, total: 0 };
    const focus = (spoop.activity && spoop.activity.skills) || [spoop.activity.skill];
    const skills = spoop.skills.map((s) => {
      const training = focus.indexOf(s.id) >= 0;
      return '<div class="flex items-center gap-2 py-1' + (training ? ' text-amber-200' : '') + '">' +
        '<img src="' + SKILL_ICON[s.id] + '" alt="" width="16" height="16" class="shrink-0">' +
        '<span class="w-16 text-sm">' + escapeHtml(s.name) + '</span>' +
        '<span class="w-8 text-right text-slate-100 tabular-nums">' + s.level + '</span>' +
        bar(s.progress) +
      '</div>';
    }).join('');
    const statsHtml = renderCombatStats(spoop.combatStats);
    const gate = spoop.gearGate || { progress: 0, nextName: null, nextCombat: null };
    const gateLabel = gate.nextName
      ? 'Next gear at ' + gate.nextCombat + ' (' + gate.nextName + ')'
      : 'Top gear tier';
    const goal = spoop.goldGoal || { progress: 0, name: 'Bronze crate', cost: 100 };
    const grid = EQUIP_GRID.map((row) => row.map((slot) => gearCell(slot, slot ? spoop.equipped[slot] : null, spoop)).join('')).join('');
    const bankSlots = state.bankSlots || 48;
    const bankCells = [];
    for (let i = 0; i < bankSlots; i++) {
      const item = spoop.bank[i];
      bankCells.push(item
        ? slotFrame(item, itemIcon(item), spoop)
        : '<div class="spoop-slot"></div>');
    }
    const bank = '<div class="flex flex-wrap gap-1">' + bankCells.join('') + '</div>';
    const log = activityLog(spoop);
    const fight = spoop.fights[0];
    const fightHtml = fight
      ? '<p class="text-sm ' + (fight.won ? 'text-emerald-300' : 'text-rose-300') + '">' + escapeHtml(fight.summary) + '</p>' +
        '<ol class="mt-2 text-xs text-slate-400 space-y-0.5">' + fight.lines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') + '</ol>'
      : '<p class="text-slate-600 text-sm">No arena fight yet. Fights resolve at 9:00pm ET.</p>';
    const crates = (state.crates || []).map((crate) => {
      const afford = spoop.gold >= crate.cost;
      const tint = TIER_COLORS[crate.tier] || '#94a3b8';
      return '<button type="button" data-crate="' + escapeHtml(crate.id) + '" class="crate-btn text-left rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2' + (afford ? '' : ' opacity-45') + '" style="border-left:3px solid ' + tint + '">' +
        '<span class="block text-sm text-slate-100">' + escapeHtml(crate.name) + '</span>' +
        '<span class="block text-xs text-amber-200/90">' + priceLabel(crate.cost) + ' gold</span>' +
      '</button>';
    }).join('');

    root.innerHTML =
      '<a href="/spoops.html" class="text-xs text-sky-400 hover:text-sky-300">All spoops</a>' +
      '<div class="mt-3 flex flex-wrap items-end gap-4">' +
        '<canvas id="spoop-hero" class="spoop-sprite" width="16" height="24"></canvas>' +
        '<div>' +
          '<h1 class="text-2xl text-slate-100">' + escapeHtml(spoop.name) + '</h1>' +
          (spoop.owner && spoop.owner !== spoop.name ? '<p class="text-xs text-slate-500">' + escapeHtml(spoop.owner) + '</p>' : '') +
          '<p class="text-slate-400 text-sm">' + gold(spoop.gold) + ' · Arena ' + spoop.arenaWins + 'W ' + spoop.arenaLosses + 'L</p>' +
        '</div>' +
        '<section class="ml-auto max-w-md text-right">' +
          '<p class="text-xs uppercase tracking-wide text-slate-500">Right now</p>' +
          '<h2 class="text-xl text-amber-200 mt-1">' + escapeHtml(spoop.activity.name) + '</h2>' +
          '<p class="text-slate-300 mt-1">' + escapeHtml(spoop.activity.detail) + '</p>' +
          '<p class="text-xs text-slate-500 mt-2">' + (spoop.activity.quest ? 'Quest reward this hour' : 'Training ' + escapeHtml(spoop.activity.skill)) + '</p>' +
          (spoop.activity.money ? '<p class="text-xs text-amber-200/80 mt-1">Slow training. The gold is the point.</p>' : '') +
          nextActionHtml(spoop, state, true) +
          '<div class="flex gap-1 mt-3 justify-end">' + pip(heat.xp, 'XP') + pip(heat.boss, 'Boss') + pip(heat.loot, 'Drop') + '</div>' +
          '<p class="text-[11px] text-slate-500 mt-1">' + heatLabel + '</p>' +
        '</section>' +
      '</div>' +
      '<div class="mt-6 grid gap-4 md:grid-cols-2">' +
        '<section class="rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
          '<div class="flex items-baseline justify-between gap-3 mb-2">' +
            '<h3 class="text-sm text-slate-300">Skills</h3>' +
            '<p class="text-sm text-slate-100 tabular-nums">Combat ' + spoop.combat + ' · ' + quests.points + ' QP</p>' +
          '</div>' +
          '<div class="flex items-center gap-2 mb-3">' + bar(gate.progress) + '</div>' +
          '<p class="text-[11px] text-slate-500 mb-2">' + escapeHtml(gateLabel) + ' · ' + quests.done + '/' + quests.total + ' quests</p>' +
          skills +
          statsHtml +
        '</section>' +
        '<section class="rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
          '<h3 class="text-sm text-slate-300 mb-3">Wearing</h3>' +
          '<div class="spoop-grid">' + grid + '</div>' +
        '</section>' +
      '</div>' +
      '<section class="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
        '<h3 class="text-sm text-slate-300 mb-2">Crates</h3>' +
        '<div class="flex items-center gap-2 mb-1">' + bar(goal.progress) + '</div>' +
        '<p class="text-[11px] text-slate-500 mb-3">' + spoop.gold.toLocaleString() + ' gold · saving for ' + escapeHtml(goal.name) + ' (' + priceLabel(goal.cost) + ')</p>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">' + crates + '</div>' +
      '</section>' +
      '<section class="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
        '<h3 class="text-sm text-slate-300 mb-2">Last arena</h3>' + fightHtml +
      '</section>' +
      '<section class="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
        '<div class="flex items-baseline justify-between gap-3 mb-2">' +
          '<h3 class="text-sm text-slate-300">Bank</h3>' +
          '<p class="text-xs text-slate-500 tabular-nums">' + Math.min(spoop.bank.length, bankSlots) + '/' + bankSlots + '</p>' +
        '</div>' +
        bank +
      '</section>' +
      '<section class="spoop-log mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
        '<h3>Activity</h3>' +
        log +
      '</section>';

    drawSpoop(document.getElementById('spoop-hero'), spoop);
    root.querySelectorAll('[data-crate]').forEach((btn) => {
      btn.addEventListener('click', () => buyCrate(spoopKey(spoop), btn.getAttribute('data-crate'), spoop.gold));
    });
  }

  function statIcon(kind) {
    if (kind === 'magic' || kind === 'range' || kind === 'strength' || kind === 'prayer') {
      const src = {
        magic: SKILL_ICON.magic,
        range: SKILL_ICON.ranged,
        strength: SKILL_ICON.strength,
        prayer: SKILL_ICON.prayer,
      }[kind];
      return '<img src="' + src + '" alt="" width="14" height="14" class="shrink-0">';
    }
    const paths = {
      stab: '<path d="M7 1.5v8M7 9.5l-2 3M7 9.5l2 3" />',
      slash: '<path d="M3 11.5L11 2.5M9.2 2.2l2.2.4-.4 2.2" />',
      crush: '<path d="M7 6.5v6M4.2 4.2a3.2 3.2 0 1 1 5.6 0" />',
    };
    return '<svg viewBox="0 0 14 14" width="14" height="14" class="shrink-0 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' + paths[kind] + '</svg>';
  }

  function statLine(kind, label, value, suffix) {
    const n = Number(value) || 0;
    const tone = n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-amber-200/70';
    const shown = (n > 0 ? '+' : '') + n + (suffix || '');
    return '<div class="flex items-center gap-1.5 py-0.5">' +
      statIcon(kind) +
      '<span class="flex-1 text-xs text-slate-300">' + label + '</span>' +
      '<span class="text-xs tabular-nums ' + tone + '">' + shown + '</span>' +
    '</div>';
  }

  function renderCombatStats(stats) {
    const sheet = stats || {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { melee: 0, ranged: 0, magic: 0, prayer: 0 },
    };
    const attack = sheet.attack;
    const defence = sheet.defence;
    const other = sheet.other;
    const column = (title, values) =>
      '<div>' +
        '<p class="text-[11px] uppercase tracking-wide text-slate-500 mb-1">' + title + '</p>' +
        statLine('stab', 'Stab', values.stab) +
        statLine('slash', 'Slash', values.slash) +
        statLine('crush', 'Crush', values.crush) +
        statLine('magic', 'Magic', values.magic) +
        statLine('range', 'Range', values.range) +
      '</div>';
    return '<div class="mt-4 pt-3 border-t border-slate-700/80">' +
      '<h3 class="text-sm text-slate-300 mb-2">Stats</h3>' +
      '<div class="grid grid-cols-2 gap-x-4">' +
        column('Attack bonus', attack) +
        column('Defence bonus', defence) +
      '</div>' +
      '<p class="text-[11px] uppercase tracking-wide text-slate-500 mt-3 mb-1">Other bonuses</p>' +
      '<div class="grid grid-cols-2 gap-x-4">' +
        '<div>' +
          statLine('strength', 'Melee strength', other.melee) +
          statLine('range', 'Ranged strength', other.ranged) +
        '</div>' +
        '<div>' +
          statLine('magic', 'Magic damage', other.magic, '%') +
          statLine('prayer', 'Prayer', other.prayer) +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function priceLabel(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) {
      const m = v / 1000000;
      return (m >= 10 || m % 1 === 0 ? String(Math.round(m)) : m.toFixed(1)) + 'm';
    }
    if (v >= 10000) return Math.round(v / 1000) + 'k';
    return v.toLocaleString();
  }

  function playRoll(roll) {
    return new Promise((resolve) => {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const overlay = document.createElement('div');
      overlay.className = 'roll-overlay';
      const cards = (roll.reel || []).map((item, i) => {
        const icon = item && item.osrsId
          ? '<img src="/api/spoops?icon=1&id=' + item.osrsId + '" alt="" width="36" height="36">'
          : '';
        return '<div class="roll-card" data-i="' + i + '">' + icon + '<span>' + escapeHtml(item ? item.name : '') + '</span></div>';
      }).join('');
      overlay.innerHTML =
        '<div class="roll-modal" role="dialog" aria-modal="true" aria-label="' + escapeHtml(roll.crateName) + '">' +
          '<p class="text-xs uppercase tracking-wide text-amber-200/80">' + escapeHtml(roll.crateName) + '</p>' +
          '<h2 class="text-lg text-slate-100 mb-3">Opening</h2>' +
          '<div class="roll-window"><div class="roll-marker"></div><div class="roll-strip">' + cards + '</div></div>' +
          '<p class="roll-result hidden"></p>' +
          '<button type="button" class="roll-take hidden mt-3 px-3 py-1.5 rounded bg-amber-400 text-slate-900 font-semibold">Take it</button>' +
        '</div>';
      document.body.appendChild(overlay);
      const strip = overlay.querySelector('.roll-strip');
      const result = overlay.querySelector('.roll-result');
      const take = overlay.querySelector('.roll-take');
      const win = overlay.querySelector('.roll-card[data-i="' + roll.winIndex + '"]');
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (win) win.classList.add('is-win');
        result.textContent = roll.detail || (roll.winner && roll.winner.name) || 'Got an item';
        result.classList.remove('hidden');
        take.classList.remove('hidden');
      };
      take.addEventListener('click', () => {
        overlay.remove();
        resolve();
      });
      const view = overlay.querySelector('.roll-window');
      const viewW = view.clientWidth || 480;
      const cardW = (win && win.offsetWidth ? win.offsetWidth : 104) + 8;
      const jitter = reduce ? 0 : (Math.random() * 28 - 14);
      const maxShift = Math.max(0, strip.scrollWidth - viewW);
      const rawTarget = (win ? win.offsetLeft : roll.winIndex * cardW) - viewW / 2 + (win ? win.offsetWidth : 104) / 2 + jitter;
      const target = Math.max(0, Math.min(maxShift, rawTarget));
      const travel = Math.min(maxShift, target + cardW * 11);
      if (reduce) {
        strip.style.transform = 'translateX(' + (-target) + 'px)';
        finish();
        return;
      }
      strip.style.transform = 'translateX(' + (-travel) + 'px)';
      void strip.offsetWidth;
      requestAnimationFrame(() => {
        strip.style.transition = 'transform 5.1s cubic-bezier(0.05, 0.65, 0.05, 1)';
        strip.style.transform = 'translateX(' + (-target) + 'px)';
      });
      strip.addEventListener('transitionend', (ev) => {
        if (ev.target === strip && ev.propertyName === 'transform') finish();
      });
      window.setTimeout(finish, 5600);
    });
  }

  async function buyCrate(name, crateId, purse) {
    const crate = (lastState && lastState.crates || []).find((c) => c.id === crateId);
    if (crate && purse < crate.cost) {
      window.alert('Need ' + crate.cost.toLocaleString() + ' gold');
      return;
    }
    try {
      const data = await api('/api/spoops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'spend', name, crate: crateId }),
      });
      if (data.roll) await playRoll(data.roll);
      const fresh = await api('/api/spoops');
      render(fresh);
    } catch (err) {
      window.alert(err.message);
    }
  }

  function paint(state) {
    document.querySelectorAll('canvas.spoop-sprite').forEach((canvas) => {
      const name = canvas.getAttribute('data-spoop');
      const spoop = name ? findSpoop(state.spoops, name) : (state.spoops || [])[0];
      if (spoop) drawSpoop(canvas, spoop);
    });
  }

  function render(state) {
    lastState = state;
    const page = document.body.getAttribute('data-page');
    if (page === 'detail') renderDetail(state);
    else renderList(state);
    mountDebug(state);
    const clock = document.getElementById('spoop-clock');
    if (clock) {
      clock.textContent = (state.useSim ? 'Simulated · ' : '') + state.clockLabel;
    }
    startNextTimers();
  }

  let bootSeq = 0;

  async function boot() {
    const root = document.getElementById('spoop-root');
    if (!root) return;
    const seq = ++bootSeq;
    const keep = lastState && root.querySelector('.gielinor, h1');
    if (!keep) root.innerHTML = '<p class="text-slate-500">Loading spoop…</p>';
    try {
      const data = await api('/api/spoops');
      if (seq !== bootSeq) return;
      render(data);
    } catch (err) {
      if (seq !== bootSeq || err.name === 'AbortError') return;
      const offline = /failed to fetch|networkerror|load failed|can't connect|cannot connect/i.test(err.message || '');
      root.innerHTML = '<p class="text-rose-300">Could not load spoops. ' + escapeHtml(offline ? 'Can’t connect. The page will try again.' : err.message) + '</p>' +
        '<button type="button" id="spoop-retry" class="mt-3 px-3 py-1 rounded bg-slate-700 text-slate-100 text-sm">Try again</button>';
      const retry = document.getElementById('spoop-retry');
      if (retry) retry.addEventListener('click', () => boot());
      if (offline && seq === 1) window.setTimeout(() => { if (seq === bootSeq) boot(); }, 1200);
    }
  }

  window.SpoopArt = { drawSpoop };

  window.addEventListener('pagehide', () => {
    bootSeq += 1;
    if (nextTimer) {
      window.clearInterval(nextTimer);
      nextTimer = null;
    }
  });
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) boot();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
