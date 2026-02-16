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

  const params = new URLSearchParams(window.location.search);
  const name = params.get('name') || params.get('username') || '';

  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  const charName = document.getElementById('char-name');
  const charMode = document.getElementById('char-mode');
  const lastUpdated = document.getElementById('last-updated');
  const skillsTbody = document.getElementById('skills-tbody');
  const bossesTbody = document.getElementById('bosses-tbody');
  const errorEl = document.getElementById('error-message');
  const lootTotalDrops = document.getElementById('loot-total-drops');
  const lootTotalValue = document.getElementById('loot-total-value');
  const lootTbody = document.getElementById('loot-tbody');
  const lootLoading = document.getElementById('loot-loading');
  const lootEmpty = document.getElementById('loot-empty');

  let characterDeltas = { skillDeltas: {}, bossDeltas: {} };

  function skillLabel(key) {
    if (!key) return '';
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function skillIconSrc(key) {
    if (!key) return '';
    if (key === 'overall') return '/assets/Skills_icon.png';
    const name = skillLabel(key).replace(/\s+/g, '');
    return '/assets/' + name + '_icon.png';
  }
  function skillIconHtml(key) {
    const src = skillIconSrc(key);
    const label = skillLabel(key);
    return '<img src="' + escapeHtml(src) + '" alt="" class="w-4 h-4 object-contain shrink-0" width="16" height="16" loading="lazy" onerror="this.style.display=\'none\'">';
  }
  function formatNum(n) {
    if (n == null || n === undefined) return '—';
    return Number(n).toLocaleString();
  }
  /** Last :00 or :30 in America/New_York (matches cron schedule). Returns string e.g. "11:30 PM ET". */
  function getLastCronRunInNY() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
    const now = new Date();
    const parts = formatter.formatToParts(now);
    const get = (name) => parts.find((p) => p.type === name)?.value || '0';
    const nyMin = parseInt(get('minute'), 10);
    let nyHour = parseInt(get('hour'), 10);
    const runMin = nyMin < 30 ? 0 : 30;
    const runHour = nyMin < 30 ? nyHour : nyHour;
    const h12 = runHour % 12 || 12;
    const period = runHour >= 12 ? 'PM' : 'AM';
    const minStr = runMin === 0 ? '00' : '30';
    return h12 + ':' + minStr + ' ' + period + ' ET';
  }
  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // OSRS cumulative XP table (same as wiki Module:Experience/data). Used for XP-to-next when API doesn't send it.
  const xpTable = (function () {
    const ret = [0];
    let total = 0;
    for (let i = 1; i <= 98; i++) {
      total = Math.floor(total + i + 300 * Math.pow(2, i / 7));
      ret[i + 1] = Math.floor(total / 4);
    }
    return ret;
  })();
  function xpToNextFromLevelAndXp(level, currentXp) {
    const L = parseInt(level, 10);
    if (Number.isNaN(L) || L >= 99) return null;
    const xp = Math.max(0, parseInt(currentXp, 10) || 0);
    const nextXp = xpTable[L + 1];
    if (nextXp == null) return null;
    return Math.max(0, nextXp - xp);
  }
  /** Percent (0–100) of the way to the next level; null if max or invalid. */
  function percentToNextLevel(level, currentXp) {
    const L = parseInt(level, 10);
    if (Number.isNaN(L) || L >= 99) return null;
    const xp = Math.max(0, parseInt(currentXp, 10) || 0);
    const currentLevelXp = xpTable[L];
    const nextLevelXp = xpTable[L + 1];
    if (currentLevelXp == null || nextLevelXp == null) return null;
    const needed = nextLevelXp - currentLevelXp;
    if (needed <= 0) return null;
    const intoLevel = xp - currentLevelXp;
    return Math.min(100, Math.max(0, (intoLevel / needed) * 100));
  }

  const chartIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';

  function showError(msg) {
    errorEl.textContent = msg || '';
    errorEl.classList.toggle('hidden', !msg);
  }

  function render(data) {
    if (!data) return;
    document.title = (data.name || name) + ' – SpoopTool';
    charName.textContent = data.name || name;
    charMode.textContent = (data.mode || 'main').replace(/\b\w/g, c => c.toUpperCase());
    const lastCapture = getLastCronRunInNY();
    lastUpdated.textContent = 'Last capture: ' + lastCapture;

    const skills = data.skills || {};
    const skillOrder = ['overall', 'attack', 'hitpoints', 'mining', 'strength', 'agility', 'smithing', 'defence', 'herblore', 'fishing', 'ranged', 'thieving', 'cooking', 'prayer', 'crafting', 'firemaking', 'magic', 'fletching', 'woodcutting', 'runecraft', 'slayer', 'farming', 'construction', 'hunter'];
    const keys = Object.keys(skills).filter(k => k !== 'overall').sort((a, b) => {
      const ai = skillOrder.indexOf(a);
      const bi = skillOrder.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
    if (skills.overall) keys.unshift('overall');

    skillsTbody.innerHTML = keys.map(key => {
      const s = skills[key];
      const level = (s && s.level) != null ? s.level : '—';
      const xp = (s && (s.xp != null ? s.xp : s.experience)) != null ? (s.xp != null ? s.xp : s.experience) : 0;
      const levelNum = s && s.level != null ? parseInt(s.level, 10) : NaN;
      const isMaxLevel = !Number.isNaN(levelNum) && levelNum >= 99;
      const pct = !isMaxLevel && !Number.isNaN(levelNum) && xp !== '—' ? percentToNextLevel(levelNum, xp) : null;
      let xpToNextDisplay = '—';
      if (isMaxLevel) {
        xpToNextDisplay = 'Max';
      } else {
        const fromApi = s && s.xpToNext != null && typeof s.xpToNext === 'number' ? s.xpToNext : null;
        const computed = !Number.isNaN(levelNum) && xp !== '—' ? xpToNextFromLevelAndXp(levelNum, xp) : null;
        const xpToNext = fromApi != null ? fromApi : computed;
        if (xpToNext != null) {
          xpToNextDisplay = xpToNext === 0 ? 'Max' : formatNum(xpToNext);
          if (pct != null && xpToNext > 0) xpToNextDisplay += ` (${Math.round(pct)}%)`;
        }
      }
      const progressBar = pct != null
        ? `<div class="mt-1 h-1 w-32 rounded-full bg-slate-600 overflow-hidden"><div class="h-full rounded-full bg-sky-500" style="width:${Math.min(100, Math.max(0, pct))}%"></div></div>`
        : '';
      const rank = (s && s.rank != null) ? s.rank : '—';
      const skillDelta = characterDeltas.skillDeltas[key];
      const last24Skill = skillDelta != null && skillDelta > 0 ? `<span class="text-green-400 font-mono">+${formatNum(skillDelta)}</span>` : '—';
      const chartIcon = '<button type="button" class="row-chart-btn p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-slate-700" data-skill="' + escapeHtml(key) + '" title="View chart" aria-label="View chart">' + chartIconSvg + '</button>';
      return `<tr class="border-b border-slate-700/70 hover:bg-slate-700/30">
        <td class="px-4 py-2 font-medium"><span class="inline-flex items-center gap-2"><span class="w-4 h-4 flex items-center justify-center shrink-0">${skillIconHtml(key)}</span>${skillLabel(key)}</span></td>
        <td class="px-4 py-2 text-right">${level}</td>
        <td class="pl-2 pr-4 py-2 text-right">${last24Skill}</td>
        <td class="px-4 py-2 text-right font-mono">${formatNum(xp)}</td>
        <td class="px-4 py-2 text-right font-mono align-top">
          <div class="flex flex-col items-end"><div>${xpToNextDisplay}</div>${progressBar ? progressBar : ''}</div>
        </td>
        <td class="px-4 py-2 text-right text-slate-500">${formatNum(rank)}</td>
        <td class="px-2 py-2 text-right">${chartIcon}</td>
      </tr>`;
    }).join('');

    const bosses = data.bosses || {};
    const bossEntries = Object.entries(bosses)
      .filter(([, b]) => b && ((b.count != null && b.count > 0) || (b.kc != null && b.kc > 0)))
      .sort((a, b) => (b[1].count ?? b[1].kc ?? 0) - (a[1].count ?? a[1].kc ?? 0));
    bossesTbody.innerHTML = bossEntries.map(([bossKey, b]) => {
      const kc = b.count != null ? b.count : b.kc;
      const rank = (b.rank != null) ? b.rank : '—';
      const bossDelta = characterDeltas.bossDeltas[bossKey];
      const last24Boss = bossDelta != null && bossDelta > 0 ? `<span class="text-green-400 font-mono">+${formatNum(bossDelta)}</span>` : '—';
      const chartIconBoss = '<button type="button" class="row-chart-btn p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-slate-700" data-boss="' + escapeHtml(bossKey) + '" title="View chart" aria-label="View chart">' + chartIconSvg + '</button>';
      return `<tr class="border-b border-slate-700/70 hover:bg-slate-700/30">
        <td class="px-4 py-2">${skillLabel(bossKey)}</td>
        <td class="px-4 py-2 text-right font-mono">${formatNum(kc)}</td>
        <td class="pl-2 pr-4 py-2 text-right">${last24Boss}</td>
        <td class="px-4 py-2 text-right text-slate-500">${formatNum(rank)}</td>
        <td class="px-2 py-2 text-right">${chartIconBoss}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="px-4 py-6 text-slate-500 text-center">No boss kills recorded</td></tr>';

    if (lootTotalDrops) lootTotalDrops.textContent = '—';
    if (lootTotalValue) lootTotalValue.textContent = '—';
    if (lootTbody) lootTbody.innerHTML = '';
    if (lootLoading) lootLoading.classList.remove('hidden');
    if (lootEmpty) lootEmpty.classList.add('hidden');

    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
  }

  function renderLoot(data) {
    if (!lootTotalDrops || !lootTotalValue || !lootTbody || !lootLoading || !lootEmpty) return;
    if (!data) {
      lootLoading.classList.add('hidden');
      lootEmpty.classList.remove('hidden');
      lootTbody.innerHTML = '';
      return;
    }
    lootLoading.classList.add('hidden');
    const totalDrops = data.totalDrops != null ? data.totalDrops : 0;
    const totalValueGp = data.totalValueGp != null ? data.totalValueGp : 0;
    const drops = Array.isArray(data.drops) ? data.drops : [];

    lootTotalDrops.textContent = formatNum(totalDrops);
    lootTotalValue.textContent = totalValueGp >= 1e6 ? (totalValueGp / 1e6).toFixed(2) + 'M gp' : formatNum(totalValueGp) + ' gp';

    lootTbody.innerHTML = drops.length === 0
      ? '<tr><td colspan="3" class="px-4 py-6 text-slate-500 text-center">No loot recorded yet.</td></tr>'
      : drops.map((d) => {
          const valueStr = d.total_value_gp >= 1e6 ? (d.total_value_gp / 1e6).toFixed(2) + 'M' : formatNum(d.total_value_gp);
          return '<tr class="border-b border-slate-700/50 hover:bg-slate-800/50">' +
            '<td class="px-4 py-2 text-slate-200">' + escapeHtml(d.item_name || '') + '</td>' +
            '<td class="px-4 py-2 text-right font-mono text-slate-300">' + escapeHtml(String(d.quantity)) + '</td>' +
            '<td class="px-4 py-2 text-right font-mono text-slate-200">' + escapeHtml(valueStr) + '</td>' +
            '</tr>';
        }).join('');

    lootEmpty.classList.toggle('hidden', totalDrops > 0);
  }

  async function load() {
    if (!name) {
      showError('No character name in URL. Use ?name=Username');
      loadingEl.textContent = 'Missing name';
      return;
    }
    showError('');
    loadingEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    try {
      const [res, deltasRes, lootRes] = await Promise.all([
        fetch(API + '/character-snapshot?name=' + encodeURIComponent(name)),
        fetch(API + '/player-deltas?name=' + encodeURIComponent(name) + '&hours=24'),
        fetch(API + '/loot?player=' + encodeURIComponent(name) + '&limit=20'),
      ]);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Character not found');
      }
      const data = await res.json();
      if (deltasRes && deltasRes.ok) {
        const d = await deltasRes.json().catch(() => ({}));
        characterDeltas = { skillDeltas: d.skillDeltas || {}, bossDeltas: d.bossDeltas || {} };
      } else {
        characterDeltas = { skillDeltas: {}, bossDeltas: {} };
      }
      render(data);
      if (lootRes && lootRes.ok) {
        const lootData = await lootRes.json().catch(() => ({}));
        renderLoot(lootData);
      } else {
        renderLoot(null);
      }
    } catch (e) {
      loadingEl.textContent = 'Failed to load';
      showError(e.message || 'Failed to load character');
    }
  }

  let chartInstance = null;
  let currentChartOpts = {};
  const CHART_RANGES = [
    { hours: 3, label: 'last 3 hours' },
    { hours: 12, label: 'last 12 hours' },
    { hours: 24, label: 'last 24 hours' },
    { hours: 168, label: 'last 7 days' },
  ];

  function chartRangeLabel(hours) {
    const r = CHART_RANGES.find((x) => x.hours === hours);
    return r ? r.label : 'last ' + hours + ' hours';
  }

  function setChartRangeActive(hours) {
    document.querySelectorAll('.chart-range-btn').forEach((btn) => {
      const isActive = parseInt(btn.getAttribute('data-hours'), 10) === hours;
      btn.classList.toggle('bg-sky-600', isActive);
      btn.classList.toggle('hover:bg-sky-500', isActive);
      btn.classList.toggle('bg-slate-700', !isActive);
      btn.classList.toggle('hover:bg-slate-600', !isActive);
    });
  }

  function fetchAndDrawChart(hours, opts) {
    if (opts) currentChartOpts = opts;
    opts = opts || currentChartOpts;
    const titleEl = document.getElementById('chart-modal-title');
    const emptyEl = document.getElementById('chart-modal-empty');
    const canvasWrap = document.getElementById('chart-modal-canvas-wrap');
    const seriesLabel = opts.seriesLabel || 'Total XP';
    titleEl.textContent = seriesLabel + ' (' + chartRangeLabel(hours) + ')';
    emptyEl.classList.add('hidden');
    emptyEl.textContent = 'No snapshot data for this range. Snapshots are taken periodically; try again later.';
    canvasWrap.classList.add('hidden');
    setChartRangeActive(hours);

    let url = API + '/player-history?name=' + encodeURIComponent(name) + '&hours=' + hours;
    if (opts.skill) url += '&skill=' + encodeURIComponent(opts.skill);
    if (opts.boss) url += '&boss=' + encodeURIComponent(opts.boss);

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const history = (data.history || []).slice();
        if (history.length === 0) {
          emptyEl.classList.remove('hidden');
          if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
          }
          return;
        }
        canvasWrap.classList.remove('hidden');
        const isWeek = hours >= 168;
        const labels = history.map((h) => {
          const d = new Date(h.at);
          return isWeek
            ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        });
        const values = history.map((h) => (h.value != null ? h.value : h.totalXp));
        const dataMin = Math.min(...values);
        const dataMax = Math.max(...values);
        const range = dataMax - dataMin;
        const pad = range > 0 ? range * 0.01 : Math.max(1, (dataMax || 1) * 0.01);
        const yMin = dataMin - pad;
        const yMax = dataMax + pad;
        const label = (data.seriesLabel != null ? data.seriesLabel : opts.seriesLabel) || seriesLabel;

        if (chartInstance) {
          chartInstance.data.labels = labels;
          chartInstance.data.datasets[0].label = label;
          chartInstance.data.datasets[0].data = values;
          chartInstance.options.scales.y.min = yMin;
          chartInstance.options.scales.y.max = yMax;
          chartInstance.update('none');
          return;
        }

        const ctx = document.getElementById('chart-canvas').getContext('2d');
        chartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label,
              data: values,
              borderColor: 'rgb(56, 189, 248)',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              fill: true,
              tension: 0.2,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: false },
            },
            scales: {
              x: {
                grid: { color: 'rgba(148, 163, 184, 0.2)' },
                ticks: { color: '#94a3b8', maxTicksLimit: 10 },
              },
              y: {
                min: yMin,
                max: yMax,
                grid: { color: 'rgba(148, 163, 184, 0.2)' },
                ticks: { color: '#94a3b8', callback: (v) => Number(v).toLocaleString() },
              },
            },
          },
        });
      })
      .catch(() => {
        emptyEl.textContent = 'Failed to load chart data.';
        emptyEl.classList.remove('hidden');
      });
  }

  function openChartModal(opts) {
    currentChartOpts = opts || {};
    const modal = document.getElementById('chart-modal');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    fetchAndDrawChart(12, currentChartOpts);
  }

  function openChartForSkill(skillKey) {
    openChartModal({ skill: skillKey, seriesLabel: skillLabel(skillKey) + ' XP' });
  }

  function openChartForBoss(bossKey) {
    openChartModal({ boss: bossKey, seriesLabel: skillLabel(bossKey) + ' KC' });
  }

  function closeChartModal() {
    document.getElementById('chart-modal').classList.add('hidden');
    document.getElementById('chart-modal').setAttribute('aria-hidden', 'true');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  }

  document.getElementById('btn-view-chart').addEventListener('click', openChartModal);
  document.getElementById('chart-modal-close').addEventListener('click', closeChartModal);
  document.getElementById('chart-modal').addEventListener('click', (e) => { if (e.target.id === 'chart-modal') closeChartModal(); });
  document.querySelectorAll('.chart-range-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      const hours = parseInt(this.getAttribute('data-hours'), 10);
      fetchAndDrawChart(hours, currentChartOpts);
    });
  });
  skillsTbody.addEventListener('click', function (e) {
    const btn = e.target.closest('.row-chart-btn[data-skill]');
    if (btn) openChartForSkill(btn.getAttribute('data-skill'));
  });
  bossesTbody.addEventListener('click', function (e) {
    const btn = e.target.closest('.row-chart-btn[data-boss]');
    if (btn) openChartForBoss(btn.getAttribute('data-boss'));
  });
  load();
})();
