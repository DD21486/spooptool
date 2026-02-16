(function () {
  const API = '/api';

  if (typeof Chart !== 'undefined') {
    Chart.register({
      id: 'verticalHoverLine',
      afterDraw(chart) {
        const active = chart.getActiveElements();
        if (!active || active.length === 0) return;
        const x = active[0].element.x;
        const ctx = chart.ctx;
        const yScale = chart.scales.y;
        if (!yScale) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, yScale.top);
        ctx.lineTo(x, yScale.bottom);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      },
    });
  }

  const skillLabel = (key) => (key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  let characterList = [];
  let playerData = {};
  let last24hDeltas = {};
  let bossKeys = [];
  let skillKeys = ['overall'];

  const leftTbody = document.getElementById('left-tbody');
  const rightTbody = document.getElementById('right-tbody');
  const lootTbody = document.getElementById('loot-tbody');
  const leftLoading = document.getElementById('left-loading');
  const rightLoading = document.getElementById('right-loading');
  const lootLoading = document.getElementById('loot-loading');
  const leftTitle = document.getElementById('left-title');
  const rightTitle = document.getElementById('right-title');
  const lootTitle = document.getElementById('loot-title');
  const filterType = document.getElementById('filter-type');
  const filterSkill = document.getElementById('filter-skill');
  const filterRightBoss = document.getElementById('filter-right-boss');
  const errorEl = document.getElementById('error-message');
  const homeCaptureCountdown = document.getElementById('home-capture-countdown');
  const homeRefreshWrap = document.getElementById('home-refresh-wrap');
  const tabTotal = document.getElementById('tab-total');
  const tabLast24 = document.getElementById('tab-last24');
  const leftValueTh = document.getElementById('left-value-th');
  const rightValueTh = document.getElementById('right-value-th');
  const lootValueTh = document.getElementById('loot-value-th');

  let homeViewMode = 'total';
  let lootTopDropsCache = {};
  let homeTooltipHideTimer = null;

  const CRON_TZ = 'America/New_York';
  /** Next :00 or :30 in America/New_York (cron schedule). */
  function getNextCronRun() {
    const now = Date.now();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: CRON_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    let candidate = new Date(now);
    candidate.setSeconds(0);
    candidate.setMilliseconds(0);
    candidate.setMinutes(candidate.getMinutes() + 1);
    for (let i = 0; i < 35; i++) {
      const parts = formatter.formatToParts(candidate);
      const get = (name) => parts.find((p) => p.type === name)?.value || '0';
      const nyMin = parseInt(get('minute'), 10);
      const nySec = parseInt(get('second'), 10);
      if (nyMin === 0 || nyMin === 30) {
        const runTime = new Date(candidate.getTime() - nySec * 1000);
        if (runTime.getTime() > now) return runTime;
      }
      candidate = new Date(candidate.getTime() + 60000);
    }
    return new Date(now + 30 * 60 * 1000);
  }

  function formatCountdown(ms) {
    if (ms <= 0) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const s = totalSec % 60;
    const m = Math.floor(totalSec / 60) % 60;
    const h = Math.floor(totalSec / 3600);
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return m + ':' + String(s).padStart(2, '0');
  }

  function tickCaptureCountdown() {
    if (!homeCaptureCountdown) return;
    const next = getNextCronRun();
    const ms = next.getTime() - Date.now();
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    homeCaptureCountdown.textContent = formatCountdown(ms);
    if (homeRefreshWrap) {
      const inLastMinuteBeforeRun = totalSec >= 29 * 60 && totalSec < 30 * 60;
      const atZero = totalSec === 0;
      homeRefreshWrap.classList.toggle('hidden', !inLastMinuteBeforeRun && !atZero);
    }
  }

  function startCaptureCountdown() {
    tickCaptureCountdown();
    setInterval(tickCaptureCountdown, 1000);
  }
  if (homeCaptureCountdown) startCaptureCountdown();

  if (homeRefreshWrap) {
    const refreshBtn = document.getElementById('home-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        homeRefreshWrap.classList.add('hidden');
        loadFromSnapshots();
      });
    }
  }

  const settingsModal = document.getElementById('settings-modal');
  const settingsWebhookInput = document.getElementById('settings-webhook-url');
  const settingsCopyBtn = document.getElementById('settings-copy-btn');
  const settingsCopyFeedback = document.getElementById('settings-copy-feedback');
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings && settingsModal) {
    btnSettings.addEventListener('click', function () {
      settingsModal.classList.remove('hidden');
      settingsModal.setAttribute('aria-hidden', 'false');
      if (settingsWebhookInput) {
        settingsWebhookInput.value = '';
        fetch(API + '/loot-webhook-url')
          .then((r) => r.json())
          .then((d) => { if (d && d.url) settingsWebhookInput.value = d.url; })
          .catch(() => {});
      }
      if (settingsCopyFeedback) settingsCopyFeedback.classList.add('hidden');
    });
  }
  const settingsModalClose = document.getElementById('settings-modal-close');
  if (settingsModalClose && settingsModal) {
    settingsModalClose.addEventListener('click', function () {
      settingsModal.classList.add('hidden');
      settingsModal.setAttribute('aria-hidden', 'true');
    });
  }
  if (settingsModal) {
    settingsModal.addEventListener('click', function (e) {
      if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
        settingsModal.setAttribute('aria-hidden', 'true');
      }
    });
  }
  if (settingsCopyBtn && settingsWebhookInput) {
    settingsCopyBtn.addEventListener('click', function () {
      settingsWebhookInput.select();
      try {
        navigator.clipboard.writeText(settingsWebhookInput.value);
        if (settingsCopyFeedback) {
          settingsCopyFeedback.classList.remove('hidden');
          setTimeout(function () { settingsCopyFeedback.classList.add('hidden'); }, 2000);
        }
      } catch (_) {}
    });
  }

  function showError(msg) {
    errorEl.textContent = msg || '';
    errorEl.classList.toggle('hidden', !msg);
  }

  function formatNum(n) {
    if (n == null || n === undefined) return '—';
    return Number(n).toLocaleString();
  }

  function formatBossKey(key) {
    return (key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function getFilter() {
    const type = filterType.value;
    if (type === 'skill') return { type: 'skill', key: filterSkill.value || 'overall' };
    return { type: 'overall' };
  }

  function skillXp(s) {
    if (!s) return 0;
    return s.xp != null ? s.xp : (s.experience != null ? s.experience : 0);
  }
  function leftTableValue(player, filter) {
    if (!player || !player.skills) return null;
    if (filter.type === 'overall' || filter.key === 'overall') {
      return skillXp(player.skills.overall);
    }
    if (filter.type === 'skill') {
      return skillXp(player.skills[filter.key]);
    }
    return null;
  }

  function totalBossKc(player) {
    if (!player || !player.bosses) return 0;
    let sum = 0;
    for (const k of Object.keys(player.bosses)) {
      const b = player.bosses[k];
      const n = b && (b.count != null ? b.count : b.kc);
      if (typeof n === 'number' && !Number.isNaN(n)) sum += n;
    }
    return sum;
  }

  function renderLeft() {
    const filter = getFilter();
    leftLoading.classList.add('hidden');
    leftTbody.innerHTML = '';
    if (homeViewMode === 'last24') {
      leftTitle.textContent = filter.type === 'overall' ? 'XP (last 24hrs)' : skillLabel(filter.key) + ' (last 24hrs)';
      if (leftValueTh) leftValueTh.textContent = filter.type === 'overall' ? 'Last 24 Hr' : skillLabel(filter.key) + ' (24h)';
    } else {
      leftTitle.textContent = filter.type === 'overall' ? 'Total XP' : skillLabel(filter.key);
      if (leftValueTh) leftValueTh.textContent = filter.type === 'overall' ? 'Total XP' : skillLabel(filter.key);
    }

    const skillKey = filter.type === 'skill' ? filter.key : 'overall';
    const rows = characterList.map(username => {
      const d = last24hDeltas[username];
      const delta = homeViewMode === 'last24' && d
        ? (d.skillDeltas && skillKey in d.skillDeltas ? d.skillDeltas[skillKey] : d.xpDelta)
        : 0;
      return {
        username,
        value: leftTableValue(playerData[username], filter),
        xpDelta: delta != null ? delta : 0,
      };
    }).filter(r => r.value != null);
    if (homeViewMode === 'last24') {
      rows.sort((a, b) => (b.xpDelta - a.xpDelta));
    } else {
      rows.sort((a, b) => (b.value - a.value));
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const displayValue = homeViewMode === 'last24'
        ? (r.xpDelta != null && r.xpDelta > 0 ? `<span class="text-green-400 font-mono">+${formatNum(r.xpDelta)}</span>` : '—')
        : (r.value != null ? formatNum(r.value) : '—');
      const valueCell = `<span class="home-value-cell cursor-help" data-table="xp" data-username="${escapeHtml(r.username)}" title="">${displayValue}</span>`;
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="px-4 py-2 text-right font-mono">${valueCell}</td>`;
      leftTbody.appendChild(tr);
    });
  }

  function getRightBossKc(player, bossKey) {
    if (!bossKey || !player || !player.bosses) return totalBossKc(player);
    const b = player.bosses[bossKey];
    const n = b && (b.count != null ? b.count : b.kc);
    return typeof n === 'number' ? n : 0;
  }

  function renderLoot() {
    if (!lootTbody || !lootLoading) return;
    lootLoading.classList.add('hidden');
    lootTbody.innerHTML = '';
    const isLast24 = homeViewMode === 'last24';
    const list = isLast24 ? lootLeaderboard24 : lootLeaderboardTotal;
    if (lootTitle) lootTitle.textContent = isLast24 ? 'Loot value (last 24hrs)' : 'Loot value';
    if (lootValueTh) lootValueTh.textContent = isLast24 ? 'Value (24h)' : 'Value';
    const getValue = (username) => {
      const p = list.find((x) => (x.username || '').toLowerCase() === (username || '').toLowerCase());
      return p ? Number(p.totalValueGp) || 0 : 0;
    };
    function coinTierForValue(gp) {
      const v = Number(gp) || 0;
      if (v <= 80000) return 'Coins_1';
      if (v <= 150000) return 'Coins_2';
      if (v <= 400000) return 'Coins_3';
      if (v <= 1100000) return 'Coins_4';
      return 'Coins_5';
    }
    const assetsBase = (typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : '') + '/assets/';
    const rows = characterList.map((username) => ({ username, value: getValue(username) }));
    rows.sort((a, b) => b.value - a.value);
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const displayValue = r.value >= 1e6 ? (r.value / 1e6).toFixed(2) + 'M gp' : formatNum(r.value) + ' gp';
      const coinTier = coinTierForValue(r.value);
      const coinImg = '<img src="' + escapeHtml(assetsBase + coinTier + '.webp') + '" alt="" width="16" height="16" class="w-4 h-4 object-contain shrink-0 inline-block" loading="lazy" onerror="this.style.display=\'none\'">';
      const valueCell = `<span class="home-value-cell cursor-help inline-flex items-center justify-end gap-1.5" data-table="loot" data-username="${escapeHtml(r.username)}" title="">${coinImg}<span>${displayValue}</span></span>`;
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="px-4 py-2 text-right font-mono">${valueCell}</td>`;
      lootTbody.appendChild(tr);
    });
  }

  function renderRight() {
    rightLoading.classList.add('hidden');
    rightTbody.innerHTML = '';
    const bossKey = (filterRightBoss && filterRightBoss.value) || '';
    if (rightTitle) {
      if (homeViewMode === 'last24') {
        rightTitle.textContent = bossKey ? formatBossKey(bossKey) + ' (last 24hrs)' : 'Boss KC (last 24hrs)';
      } else {
        rightTitle.textContent = bossKey ? formatBossKey(bossKey) : 'Boss KC';
      }
    }
    if (rightValueTh) {
      rightValueTh.textContent = homeViewMode === 'last24'
        ? (bossKey ? formatBossKey(bossKey) + ' (24h)' : 'Last 24 Hr')
        : (bossKey ? formatBossKey(bossKey) : 'Total KC');
    }
    const rows = characterList.map(username => {
      const d = last24hDeltas[username];
      const kcDelta = homeViewMode === 'last24' && d
        ? (bossKey && d.bossDeltas && bossKey in d.bossDeltas ? d.bossDeltas[bossKey] : d.bossKcDelta)
        : 0;
      return {
        username,
        kc: getRightBossKc(playerData[username], bossKey),
        kcDelta: kcDelta != null ? kcDelta : 0,
      };
    });
    if (homeViewMode === 'last24') {
      rows.sort((a, b) => (b.kcDelta - a.kcDelta));
    } else {
      rows.sort((a, b) => (b.kc - a.kc));
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const displayValue = homeViewMode === 'last24'
        ? (r.kcDelta != null && r.kcDelta > 0 ? `<span class="text-green-400 font-mono">+${formatNum(r.kcDelta)}</span>` : '—')
        : formatNum(r.kc);
      const valueCell = `<span class="home-value-cell cursor-help" data-table="boss" data-username="${escapeHtml(r.username)}" title="">${displayValue}</span>`;
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="px-4 py-2 text-right font-mono">${valueCell}</td>`;
      rightTbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  const homeTooltipEl = document.getElementById('home-value-tooltip');
  function showHomeTooltip(content, anchor) {
    if (!homeTooltipEl) return;
    homeTooltipEl.innerHTML = content;
    homeTooltipEl.classList.remove('hidden');
    homeTooltipEl.setAttribute('aria-hidden', 'false');
    const rect = anchor.getBoundingClientRect();
    const ttRect = homeTooltipEl.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - ttRect.width / 2;
    let top = rect.top - ttRect.height - 6;
    if (top < 8) top = rect.bottom + 6;
    if (left < 8) left = 8;
    if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
    homeTooltipEl.style.left = left + 'px';
    homeTooltipEl.style.top = top + 'px';
  }
  function hideHomeTooltip() {
    if (homeTooltipEl) {
      homeTooltipEl.classList.add('hidden');
      homeTooltipEl.setAttribute('aria-hidden', 'true');
    }
    if (homeTooltipHideTimer) {
      clearTimeout(homeTooltipHideTimer);
      homeTooltipHideTimer = null;
    }
  }
  function buildXpTooltipContent(username) {
    const player = playerData[username];
    const deltas = last24hDeltas[username];
    const isLast24 = homeViewMode === 'last24';
    let lines = [];
    if (isLast24 && deltas && deltas.skillDeltas) {
      const entries = Object.entries(deltas.skillDeltas)
        .filter(([k]) => k !== 'overall')
        .map(([k, v]) => ({ key: k, delta: Number(v) || 0 }))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No skill gains in last 24h</div>';
      lines.push('<div class="font-semibold text-slate-300 mb-1">Top 3 skills (24h)</div>');
      entries.forEach((e) => { lines.push('<div class="text-green-400/90">' + escapeHtml(skillLabel(e.key)) + ': +' + formatNum(e.delta) + ' XP</div>'); });
    } else if (player && player.skills) {
      const entries = Object.entries(player.skills)
        .filter(([k]) => k !== 'overall')
        .map(([k, s]) => ({ key: k, xp: (s && (s.xp != null ? s.xp : s.experience)) || 0 }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No skills</div>';
      lines.push('<div class="font-semibold text-slate-300 mb-1">Top 3 skills (total)</div>');
      entries.forEach((e) => { lines.push('<div>' + escapeHtml(skillLabel(e.key)) + ': ' + formatNum(e.xp) + ' XP</div>'); });
    } else return '<div class="text-slate-400">No data</div>';
    return lines.join('');
  }
  function buildBossTooltipContent(username) {
    const player = playerData[username];
    const deltas = last24hDeltas[username];
    const isLast24 = homeViewMode === 'last24';
    let lines = [];
    if (isLast24 && deltas && deltas.bossDeltas) {
      const entries = Object.entries(deltas.bossDeltas)
        .map(([k, v]) => ({ key: k, delta: Number(v) || 0 }))
        .filter((e) => e.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No boss kills in last 24h</div>';
      lines.push('<div class="font-semibold text-slate-300 mb-1">Top 3 bosses (24h)</div>');
      entries.forEach((e) => { lines.push('<div class="text-green-400/90">' + escapeHtml(formatBossKey(e.key)) + ': +' + formatNum(e.delta) + ' KC</div>'); });
    } else if (player && player.bosses) {
      const entries = Object.entries(player.bosses)
        .map(([k, b]) => ({ key: k, kc: (b && (b.count != null ? b.count : b.kc)) || 0 }))
        .filter((e) => e.kc > 0)
        .sort((a, b) => b.kc - a.kc)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No boss kills</div>';
      lines.push('<div class="font-semibold text-slate-300 mb-1">Top 3 bosses (total)</div>');
      entries.forEach((e) => { lines.push('<div>' + escapeHtml(formatBossKey(e.key)) + ': ' + formatNum(e.kc) + ' KC</div>'); });
    } else return '<div class="text-slate-400">No data</div>';
    return lines.join('');
  }
  async function fetchAndBuildLootTooltipContent(username) {
    const cacheKey = username + (homeViewMode === 'last24' ? ':24' : ':all');
    if (lootTopDropsCache[cacheKey]) return lootTopDropsCache[cacheKey];
    const url = API + '/loot?player=' + encodeURIComponent(username) + '&limit=3' + (homeViewMode === 'last24' ? '&hours=24' : '');
    try {
      const res = await fetch(url);
      const data = await res.json();
      const drops = Array.isArray(data.drops) ? data.drops : [];
      if (drops.length === 0) return '<div class="text-slate-400">No loot recorded</div>';
      let html = '<div class="font-semibold text-slate-300 mb-1">Top 3 by value</div>';
      drops.slice(0, 3).forEach((d) => {
        const val = Number(d.total_value_gp) || 0;
        const valStr = val >= 1e6 ? (val / 1e6).toFixed(2) + 'M' : formatNum(val);
        html += '<div>' + escapeHtml(d.item_name || '—') + ': ' + valStr + ' gp</div>';
      });
      lootTopDropsCache[cacheKey] = html;
      return html;
    } catch (_) {
      return '<div class="text-slate-400">Failed to load</div>';
    }
  }

  document.addEventListener('mouseenter', function (e) {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const cell = e.target.closest('.home-value-cell');
    if (!cell || !homeTooltipEl) return;
    if (homeTooltipHideTimer) { clearTimeout(homeTooltipHideTimer); homeTooltipHideTimer = null; }
    const table = cell.getAttribute('data-table');
    const username = cell.getAttribute('data-username');
    if (!username) return;
    if (table === 'xp') {
      showHomeTooltip(buildXpTooltipContent(username), cell);
    } else if (table === 'boss') {
      showHomeTooltip(buildBossTooltipContent(username), cell);
    } else if (table === 'loot') {
      showHomeTooltip('<div class="text-slate-400">Loading…</div>', cell);
      fetchAndBuildLootTooltipContent(username).then((content) => {
        if (homeTooltipEl && !homeTooltipEl.classList.contains('hidden')) showHomeTooltip(content, cell);
      });
    }
  }, true);
  document.addEventListener('mouseleave', function (e) {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const cell = e.target.closest('.home-value-cell');
    if (!cell || !homeTooltipEl) return;
    homeTooltipHideTimer = setTimeout(hideHomeTooltip, 120);
  }, true);

  function populateFilterBoss() {
    const keys = new Set();
    Object.values(playerData).forEach(p => { if (p && p.bosses) Object.keys(p.bosses).forEach(k => keys.add(k)); });
    bossKeys = Array.from(keys).sort();
    if (filterRightBoss) {
      filterRightBoss.innerHTML = '<option value="">Filter</option>' + bossKeys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(formatBossKey(k))}</option>`).join('');
    }
  }

  function populateFilterSkill() {
    const keys = new Set(['overall']);
    Object.values(playerData).forEach(p => { if (p && p.skills) Object.keys(p.skills).forEach(k => keys.add(k)); });
    skillKeys = Array.from(keys).sort((a, b) => (a === 'overall' ? -1 : (b === 'overall' ? 1 : a.localeCompare(b))));
    filterSkill.innerHTML = skillKeys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(skillLabel(k))}</option>`).join('');
  }

  async function fetchCharacters() {
    const res = await fetch(API + '/characters');
    if (!res.ok) throw new Error('Failed to load characters');
    return res.json();
  }

  async function fetchPlayer(name) {
    const res = await fetch(API + '/player/' + encodeURIComponent(name));
    if (!res.ok) return null;
    return res.json();
  }

  /** Load home page from latest snapshots only (no Hiscores). */
  async function loadFromSnapshots() {
    showError('');
    leftLoading.classList.remove('hidden');
    rightLoading.classList.remove('hidden');
    if (lootLoading) lootLoading.classList.remove('hidden');
    leftTbody.innerHTML = '';
    rightTbody.innerHTML = '';
    if (lootTbody) lootTbody.innerHTML = '';
    try {
      const [dataRes, deltasRes, lootTotalRes, loot24Res] = await Promise.all([
        fetch(API + '/characters-with-snapshots'),
        fetch(API + '/characters-deltas?hours=24'),
        fetch(API + '/loot?leaderboard=1'),
        fetch(API + '/loot?leaderboard=1&hours=24'),
      ]);
      if (!dataRes.ok) throw new Error('Failed to load data');
      const data = await dataRes.json();
      const deltasData = await deltasRes.json().catch(() => ({}));
      last24hDeltas = {};
      (deltasData.deltas || []).forEach((d) => {
        last24hDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      const list = data.characters || [];
      characterList = list.map(c => (typeof c === 'string' ? c : c.username));
      playerData = {};
      list.forEach((c) => {
        const username = typeof c === 'string' ? c : c.username;
        if (c.latestSnapshot) playerData[username] = { skills: c.latestSnapshot.skills, bosses: c.latestSnapshot.bosses };
      });
      if (characterList.length === 0) {
        leftLoading.textContent = 'No characters. Add one above.';
        rightLoading.textContent = 'No characters. Add one above.';
        if (lootLoading) lootLoading.textContent = 'No characters.';
        return;
      }
      const lootTotalData = await lootTotalRes.json().catch(() => ({}));
      const loot24Data = await loot24Res.json().catch(() => ({}));
      lootLeaderboardTotal = Array.isArray(lootTotalData.players) ? lootTotalData.players : [];
      lootLeaderboard24 = Array.isArray(loot24Data.players) ? loot24Data.players : [];
      populateFilterSkill();
      populateFilterBoss();
      renderLeft();
      renderRight();
      renderLoot();
      loadHomeCharts();
    } catch (e) {
      console.error(e);
      showError(e.message || 'Failed to load data. Is the API running?');
      leftLoading.textContent = 'Error loading.';
      rightLoading.textContent = 'Error loading.';
    }
  }

  /** Load from Hiscores API (used when user clicks Update all). */
  async function loadAll() {
    showError('');
    leftLoading.classList.remove('hidden');
    rightLoading.classList.remove('hidden');
    leftTbody.innerHTML = '';
    rightTbody.innerHTML = '';
    playerData = {};
    try {
      const list = await fetchCharacters();
      characterList = Array.isArray(list) ? list.map(c => (typeof c === 'string' ? c : c.username)) : [];
      if (characterList.length === 0) {
        leftLoading.textContent = 'No characters. Add one above.';
        rightLoading.textContent = 'No characters. Add one above.';
        return;
      }
      for (const name of characterList) {
        const data = await fetchPlayer(name);
        playerData[name] = data || null;
      }
      const deltasRes = await fetch(API + '/characters-deltas?hours=24').catch(() => null);
      if (deltasRes && deltasRes.ok) {
        const deltasData = await deltasRes.json().catch(() => ({}));
        last24hDeltas = {};
        (deltasData.deltas || []).forEach((d) => {
          last24hDeltas[d.username] = {
            xpDelta: d.xpDelta,
            bossKcDelta: d.bossKcDelta,
            skillDeltas: d.skillDeltas || {},
            bossDeltas: d.bossDeltas || {},
          };
        });
      }
      populateFilterSkill();
      populateFilterBoss();
      renderLeft();
      renderRight();
      loadHomeCharts();
    } catch (e) {
      console.error(e);
      showError(e.message || 'Failed to load data. Is the API running?');
      leftLoading.textContent = 'Error loading.';
      rightLoading.textContent = 'Error loading.';
      throw e;
    }
  }

  let homeChartXp = null;
  let homeChartBoss = null;
  let homeChartLoot = null;
  let cachedHomeHistory = null;
  let cachedLootHistory = null;
  let lootLeaderboardTotal = [];
  let lootLeaderboard24 = [];

  function setHomeChartLabels(isLast24) {
    const xpLabelEl = document.getElementById('home-chart-xp-label');
    const bossLabelEl = document.getElementById('home-chart-boss-label');
    const lootLabelEl = document.getElementById('home-chart-loot-label');
    if (xpLabelEl) xpLabelEl.textContent = isLast24 ? 'Total XP in last 24 hours' : 'Total XP (all characters)';
    if (bossLabelEl) bossLabelEl.textContent = isLast24 ? 'Boss KC in last 24 hours' : 'Boss KC (all characters)';
    if (lootLabelEl) lootLabelEl.textContent = isLast24 ? 'Loot value in last 24 hours' : 'Loot value (all characters)';
  }

  function paintHomeCharts(history, mode, lootHistory) {
    const isLast24 = mode === 'last24';
    const xpTotalEl = document.getElementById('home-chart-xp-total');
    const bossTotalEl = document.getElementById('home-chart-boss-total');
    const lootTotalEl = document.getElementById('home-chart-loot-total');

    if (homeChartXp) { homeChartXp.destroy(); homeChartXp = null; }
    if (homeChartBoss) { homeChartBoss.destroy(); homeChartBoss = null; }
    if (homeChartLoot) { homeChartLoot.destroy(); homeChartLoot = null; }

    if (!history || history.length === 0) {
      if (xpTotalEl) xpTotalEl.textContent = '—';
      if (bossTotalEl) bossTotalEl.textContent = '—';
      if (lootTotalEl) lootTotalEl.textContent = '—';
      setHomeChartLabels(isLast24);
      paintHomeLootChart(lootHistory || []);
      return;
    }

    const labels = history.map((h) => {
      const d = new Date(h.at);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    });
    let xpValues;
    let bossValues;
    if (isLast24) {
      const baseIdx = history.findIndex((h) => Number(h.totalXp) > 0 || Number(h.totalBossKc) > 0);
      const base = baseIdx >= 0 ? history[baseIdx] : history[0];
      const baseXp = Number(base.totalXp) || 0;
      const baseBoss = Number(base.totalBossKc) || 0;
      xpValues = history.map((h) => Math.max(0, Number(h.totalXp) - baseXp));
      bossValues = history.map((h) => Math.max(0, Number(h.totalBossKc) - baseBoss));
    } else {
      xpValues = history.map((h) => Number(h.totalXp));
      bossValues = history.map((h) => Number(h.totalBossKc));
    }
    const lastXp = xpValues[xpValues.length - 1];
    const lastBoss = bossValues[bossValues.length - 1];

    if (isLast24) {
      const sumXp = Object.values(last24hDeltas).reduce((s, d) => s + (Number(d.xpDelta) || 0), 0);
      const sumBoss = Object.values(last24hDeltas).reduce((s, d) => s + (Number(d.bossKcDelta) || 0), 0);
      const sumLoot = lootLeaderboard24.reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(sumXp).toLocaleString() + ' XP (24h)';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(sumBoss).toLocaleString() + ' kills (24h)';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp (24h)';
    } else {
      const sumLoot = lootLeaderboardTotal.reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(Number(lastXp)).toLocaleString() + ' XP';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(Number(lastBoss)).toLocaleString() + ' kills';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp';
    }
    setHomeChartLabels(isLast24);

    function rangeFromLast(lastVal, fallbackMax, padPct) {
      const max = lastVal != null && lastVal > 0 ? lastVal : fallbackMax;
      const pad = max * padPct;
      return { min: Math.max(0, max - pad), max: max + pad };
    }
    const xpRange = rangeFromLast(lastXp, 10, 0.003);
    const bossRange = rangeFromLast(lastBoss, 10, 0.01);
    const formatInt = (v) => Math.round(Number(v)).toLocaleString();
    const chartOpts = (yMin, yMax, tickCallback) => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 10 } },
        },
        y: {
          min: yMin,
          max: yMax,
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { color: '#94a3b8', callback: tickCallback, font: { size: 10 } },
        },
      },
    });

    const ctxXp = document.getElementById('home-chart-xp');
    const ctxBoss = document.getElementById('home-chart-boss');
    if (ctxXp && ctxXp.getContext) {
      homeChartXp = new Chart(ctxXp.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: isLast24 ? 'XP gain (24h)' : 'Total XP',
            data: xpValues,
            borderColor: 'rgb(56, 189, 248)',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 6,
          }],
        },
        options: chartOpts(xpRange.min, xpRange.max, formatInt),
      });
    }
    if (ctxBoss && ctxBoss.getContext) {
      homeChartBoss = new Chart(ctxBoss.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: isLast24 ? 'KC gain (24h)' : 'Total KC',
            data: bossValues,
            borderColor: 'rgb(56, 189, 248)',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 6,
          }],
        },
        options: chartOpts(bossRange.min, bossRange.max, formatInt),
      });
    }
    paintHomeLootChart(lootHistory || []);
  }

  function paintHomeLootChart(lootHistory) {
    const lootTotalEl = document.getElementById('home-chart-loot-total');
    if (homeChartLoot) { homeChartLoot.destroy(); homeChartLoot = null; }
    if (!lootHistory || lootHistory.length === 0) {
      if (lootTotalEl) lootTotalEl.textContent = '—';
      return;
    }
    const labels = lootHistory.map((h) => {
      const d = new Date(h.at);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    });
    let values = lootHistory.map((h) => Number(h.value) || 0);
    const now = new Date();
    const lastBucket = lootHistory.length ? new Date(lootHistory[lootHistory.length - 1].at) : null;
    if (lastBucket && (now - lastBucket) > 45 * 60 * 1000) {
      labels.push(now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
      values = values.concat(values[values.length - 1]);
    }
    const lastVal = values[values.length - 1];
    const maxVal = Math.max(...values, 1);
    const pad = maxVal * 0.05;
    const ctxLoot = document.getElementById('home-chart-loot');
    if (ctxLoot && ctxLoot.getContext) {
      homeChartLoot = new Chart(ctxLoot.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Loot value',
            data: values,
            borderColor: 'rgb(56, 189, 248)',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { color: 'rgba(148, 163, 184, 0.2)' },
              ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 10 } },
            },
            y: {
              min: Math.max(0, (lastVal != null ? lastVal : maxVal) - pad),
              max: (lastVal != null ? lastVal : maxVal) + pad,
              grid: { color: 'rgba(148, 163, 184, 0.2)' },
              ticks: { color: '#94a3b8', callback: (v) => (Number(v) >= 1e6 ? (Number(v) / 1e6).toFixed(1) + 'M' : Math.round(Number(v)).toLocaleString()), font: { size: 10 } },
            },
          },
        },
      });
    }
  }

  function loadHomeCharts() {
    fetch(API + '/aggregate-history?hours=24')
      .then((res) => res.json())
      .then((data) => {
        const history = (data.history || []).slice();
        cachedHomeHistory = history;
        cachedLootHistory = (data.lootHistory || []).slice();
        paintHomeCharts(history, homeViewMode, cachedLootHistory);
      })
      .catch(() => {});
  }

  function setHomeViewMode(mode) {
    homeViewMode = mode;
    const isLast24 = mode === 'last24';
    setHomeChartLabels(isLast24);
    if (tabTotal && tabLast24) {
      const isTotal = mode === 'total';
      tabTotal.classList.toggle('bg-sky-600', isTotal);
      tabTotal.classList.toggle('text-white', isTotal);
      tabTotal.classList.toggle('bg-slate-700', !isTotal);
      tabTotal.classList.toggle('text-slate-300', !isTotal);
      tabTotal.setAttribute('aria-selected', String(isTotal));
      tabLast24.classList.toggle('bg-sky-600', !isTotal);
      tabLast24.classList.toggle('text-white', !isTotal);
      tabLast24.classList.toggle('bg-slate-700', isTotal);
      tabLast24.classList.toggle('text-slate-300', isTotal);
      tabLast24.setAttribute('aria-selected', String(!isTotal));
    }
    renderLeft();
    renderRight();
    renderLoot();
    if (cachedHomeHistory) {
      paintHomeCharts(cachedHomeHistory, mode, cachedLootHistory);
    } else {
      loadHomeCharts();
    }
  }

  const addModal = document.getElementById('add-character-modal');
  const modalUsername = document.getElementById('modal-username');
  const modalError = document.getElementById('modal-error');
  const modalSubmit = document.getElementById('modal-submit');
  const modalCancel = document.getElementById('modal-cancel');

  function openAddModal() {
    modalUsername.value = '';
    modalError.textContent = '';
    modalError.classList.add('hidden');
    modalSubmit.disabled = true;
    modalSubmit.className = 'px-3 py-1.5 rounded-lg bg-slate-600 text-slate-400 cursor-not-allowed text-sm font-medium';
    addModal.classList.remove('hidden');
    addModal.setAttribute('aria-hidden', 'false');
    modalUsername.focus();
  }

  function closeAddModal() {
    addModal.classList.add('hidden');
    addModal.setAttribute('aria-hidden', 'true');
  }

  function setModalAddEnabled(enabled) {
    modalSubmit.disabled = !enabled;
    modalSubmit.className = enabled
      ? 'px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium'
      : 'px-3 py-1.5 rounded-lg bg-slate-600 text-slate-400 cursor-not-allowed text-sm font-medium';
  }

  function updateModalAddState() {
    const trimmed = (modalUsername.value || '').trim();
    setModalAddEnabled(trimmed.length > 0);
    modalError.classList.add('hidden');
  }

  async function submitAddCharacter() {
    const username = (modalUsername.value || '').trim().replace(/\s+/g, ' ');
    if (!username) return;
    const lower = username.toLowerCase();
    const isDuplicate = characterList.some(c => (c || '').toLowerCase() === lower);
    if (isDuplicate) {
      modalError.textContent = 'That character is already in the list.';
      modalError.classList.remove('hidden');
      return;
    }
    modalError.classList.add('hidden');
    try {
      const res = await fetch(API + '/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        modalError.textContent = data.error || 'Failed to add character';
        modalError.classList.remove('hidden');
        return;
      }
      closeAddModal();
      await loadFromSnapshots();
    } catch (e) {
      modalError.textContent = e.message || 'Failed to add character';
      modalError.classList.remove('hidden');
    }
  }

  filterType.addEventListener('change', function () {
    filterSkill.classList.toggle('hidden', this.value !== 'skill');
    renderLeft();
  });
  filterSkill.addEventListener('change', () => renderLeft());
  if (filterRightBoss) filterRightBoss.addEventListener('change', () => renderRight());

  if (tabTotal) tabTotal.addEventListener('click', () => setHomeViewMode('total'));
  if (tabLast24) tabLast24.addEventListener('click', () => setHomeViewMode('last24'));

  document.getElementById('btn-add').addEventListener('click', openAddModal);
  modalUsername.addEventListener('input', updateModalAddState);
  modalUsername.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!modalSubmit.disabled) submitAddCharacter();
    }
  });
  modalSubmit.addEventListener('click', submitAddCharacter);
  modalCancel.addEventListener('click', closeAddModal);
  addModal.addEventListener('click', function (e) {
    if (e.target === addModal) closeAddModal();
  });

  loadFromSnapshots();
})();
