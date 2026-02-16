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
  const leftLoading = document.getElementById('left-loading');
  const rightLoading = document.getElementById('right-loading');
  const leftTitle = document.getElementById('left-title');
  const rightTitle = document.getElementById('right-title');
  const filterType = document.getElementById('filter-type');
  const filterSkill = document.getElementById('filter-skill');
  const filterRightBoss = document.getElementById('filter-right-boss');
  const errorEl = document.getElementById('error-message');
  const homeCaptureCountdown = document.getElementById('home-capture-countdown');
  const tabTotal = document.getElementById('tab-total');
  const tabLast24 = document.getElementById('tab-last24');

  let homeViewMode = 'total';

  function getNextFifteenMin() {
    const now = new Date();
    const min = now.getMinutes();
    const nextMin = (Math.floor(min / 15) + 1) * 15;
    const next = new Date(now);
    if (nextMin >= 60) {
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
    } else {
      next.setMinutes(nextMin);
    }
    next.setSeconds(0);
    next.setMilliseconds(0);
    return next;
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
    const next = getNextFifteenMin();
    const ms = next - Date.now();
    homeCaptureCountdown.textContent = formatCountdown(ms);
  }

  function startCaptureCountdown() {
    tickCaptureCountdown();
    setInterval(tickCaptureCountdown, 1000);
  }
  if (homeCaptureCountdown) startCaptureCountdown();

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
    } else {
      leftTitle.textContent = filter.type === 'overall' ? 'Total XP' : skillLabel(filter.key);
    }

    const rows = characterList.map(username => ({
      username,
      value: leftTableValue(playerData[username], filter),
      xpDelta: (last24hDeltas[username] && last24hDeltas[username].xpDelta != null) ? last24hDeltas[username].xpDelta : 0,
    })).filter(r => r.value != null);
    if (homeViewMode === 'last24') {
      rows.sort((a, b) => (b.xpDelta - a.xpDelta));
    } else {
      rows.sort((a, b) => (b.value - a.value));
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const value = r.value != null ? formatNum(r.value) : '—';
      const d = last24hDeltas[r.username];
      const xpDelta = d && d.xpDelta != null && d.xpDelta > 0 ? d.xpDelta : null;
      const last24Cell = xpDelta != null ? `<span class="text-green-400 font-mono">+${formatNum(xpDelta)}</span>` : '—';
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="pl-4 pr-2 py-2 text-right font-mono">${value}</td><td class="pl-2 pr-4 py-2 text-right">${last24Cell}</td>`;
      leftTbody.appendChild(tr);
    });
  }

  function getRightBossKc(player, bossKey) {
    if (!bossKey || !player || !player.bosses) return totalBossKc(player);
    const b = player.bosses[bossKey];
    const n = b && (b.count != null ? b.count : b.kc);
    return typeof n === 'number' ? n : 0;
  }

  function renderRight() {
    rightLoading.classList.add('hidden');
    rightTbody.innerHTML = '';
    const bossKey = (filterRightBoss && filterRightBoss.value) || '';
    if (rightTitle) {
      if (homeViewMode === 'last24') {
        rightTitle.textContent = bossKey ? formatBossKey(bossKey) + ' (last 24hrs)' : 'Boss KC (last 24hrs)';
      } else {
        rightTitle.textContent = bossKey ? formatBossKey(bossKey) : 'Total boss kills';
      }
    }
    const rows = characterList.map(username => ({
      username,
      kc: getRightBossKc(playerData[username], bossKey),
      kcDelta: (last24hDeltas[username] && last24hDeltas[username].bossKcDelta != null) ? last24hDeltas[username].bossKcDelta : 0,
    }));
    if (homeViewMode === 'last24') {
      rows.sort((a, b) => (b.kcDelta - a.kcDelta));
    } else {
      rows.sort((a, b) => (b.kc - a.kc));
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const d = last24hDeltas[r.username];
      const kcDelta = d && d.bossKcDelta != null && d.bossKcDelta > 0 ? d.bossKcDelta : null;
      const last24Cell = kcDelta != null ? `<span class="text-green-400 font-mono">+${formatNum(kcDelta)}</span>` : '—';
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="pl-4 pr-2 py-2 text-right font-mono">${formatNum(r.kc)}</td><td class="pl-2 pr-4 py-2 text-right">${last24Cell}</td>`;
      rightTbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function populateFilterBoss() {
    const keys = new Set();
    Object.values(playerData).forEach(p => { if (p && p.bosses) Object.keys(p.bosses).forEach(k => keys.add(k)); });
    bossKeys = Array.from(keys).sort();
    if (filterRightBoss) {
      filterRightBoss.innerHTML = '<option value="">Total</option>' + bossKeys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(formatBossKey(k))}</option>`).join('');
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
    leftTbody.innerHTML = '';
    rightTbody.innerHTML = '';
    try {
      const [dataRes, deltasRes] = await Promise.all([
        fetch(API + '/characters-with-snapshots'),
        fetch(API + '/characters-deltas?hours=24'),
      ]);
      if (!dataRes.ok) throw new Error('Failed to load data');
      const data = await dataRes.json();
      const deltasData = await deltasRes.json().catch(() => ({}));
      last24hDeltas = {};
      (deltasData.deltas || []).forEach((d) => {
        last24hDeltas[d.username] = { xpDelta: d.xpDelta, bossKcDelta: d.bossKcDelta };
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
        return;
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
          last24hDeltas[d.username] = { xpDelta: d.xpDelta, bossKcDelta: d.bossKcDelta };
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
  let cachedHomeHistory = null;

  function setHomeChartLabels(isLast24) {
    const xpLabelEl = document.getElementById('home-chart-xp-label');
    const bossLabelEl = document.getElementById('home-chart-boss-label');
    if (xpLabelEl) xpLabelEl.textContent = isLast24 ? 'Total XP in last 24 hours' : 'Total XP (all characters)';
    if (bossLabelEl) bossLabelEl.textContent = isLast24 ? 'Total boss kills in last 24 hours' : 'Total boss kills (all characters)';
  }

  function paintHomeCharts(history, mode) {
    const isLast24 = mode === 'last24';
    const xpTotalEl = document.getElementById('home-chart-xp-total');
    const bossTotalEl = document.getElementById('home-chart-boss-total');

    if (homeChartXp) { homeChartXp.destroy(); homeChartXp = null; }
    if (homeChartBoss) { homeChartBoss.destroy(); homeChartBoss = null; }

    if (!history || history.length === 0) {
      if (xpTotalEl) xpTotalEl.textContent = '—';
      if (bossTotalEl) bossTotalEl.textContent = '—';
      setHomeChartLabels(isLast24);
      return;
    }

    const labels = history.map((h) => {
      const d = new Date(h.at);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    });
    const xpValues = isLast24
      ? history.map((h, i) => (i === 0 ? 0 : Math.max(0, Number(h.totalXp) - Number(history[0].totalXp))))
      : history.map((h) => Number(h.totalXp));
    const bossValues = isLast24
      ? history.map((h, i) => (i === 0 ? 0 : Math.max(0, Number(h.totalBossKc) - Number(history[0].totalBossKc))))
      : history.map((h) => Number(h.totalBossKc));
    const lastXp = xpValues[xpValues.length - 1];
    const lastBoss = bossValues[bossValues.length - 1];

    if (xpTotalEl) xpTotalEl.textContent = Math.round(Number(lastXp)).toLocaleString() + (isLast24 ? ' XP (24h)' : ' XP');
    if (bossTotalEl) bossTotalEl.textContent = Math.round(Number(lastBoss)).toLocaleString() + (isLast24 ? ' kills (24h)' : ' kills');
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
  }

  function loadHomeCharts() {
    fetch(API + '/aggregate-history?hours=24')
      .then((res) => res.json())
      .then((data) => {
        const history = (data.history || []).slice();
        cachedHomeHistory = history;
        paintHomeCharts(history, homeViewMode);
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
    if (cachedHomeHistory) {
      paintHomeCharts(cachedHomeHistory, mode);
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
