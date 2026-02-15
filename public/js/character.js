(function () {
  const API = '/api';
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

  function skillLabel(key) {
    if (!key) return '';
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function formatNum(n) {
    if (n == null || n === undefined) return '—';
    return Number(n).toLocaleString();
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

  function showError(msg) {
    errorEl.textContent = msg || '';
    errorEl.classList.toggle('hidden', !msg);
  }

  function render(data) {
    if (!data) return;
    document.title = (data.name || name) + ' – SpoopTool';
    charName.textContent = data.name || name;
    charMode.textContent = (data.mode || 'main').replace(/\b\w/g, c => c.toUpperCase());
    lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleString();

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
      return `<tr class="border-b border-slate-700/70 hover:bg-slate-700/30">
        <td class="px-4 py-2 font-medium">${skillLabel(key)}</td>
        <td class="px-4 py-2 text-right">${level}</td>
        <td class="px-4 py-2 text-right font-mono">${formatNum(xp)}</td>
        <td class="px-4 py-2 text-right font-mono align-top">
          <div class="flex flex-col items-end"><div>${xpToNextDisplay}</div>${progressBar ? progressBar : ''}</div>
        </td>
        <td class="px-4 py-2 text-right text-slate-500">${formatNum(rank)}</td>
      </tr>`;
    }).join('');

    const bosses = data.bosses || {};
    const bossEntries = Object.entries(bosses)
      .filter(([, b]) => b && ((b.count != null && b.count > 0) || (b.kc != null && b.kc > 0)))
      .sort((a, b) => (b[1].count ?? b[1].kc ?? 0) - (a[1].count ?? a[1].kc ?? 0));
    bossesTbody.innerHTML = bossEntries.map(([bossKey, b]) => {
      const kc = b.count != null ? b.count : b.kc;
      const rank = (b.rank != null) ? b.rank : '—';
      return `<tr class="border-b border-slate-700/70 hover:bg-slate-700/30">
        <td class="px-4 py-2">${skillLabel(bossKey)}</td>
        <td class="px-4 py-2 text-right font-mono">${formatNum(kc)}</td>
        <td class="px-4 py-2 text-right text-slate-500">${formatNum(rank)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="3" class="px-4 py-6 text-slate-500 text-center">No boss kills recorded</td></tr>';

    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
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
      const res = await fetch(API + '/player/' + encodeURIComponent(name));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Character not found');
      }
      const data = await res.json();
      render(data);
    } catch (e) {
      loadingEl.textContent = 'Failed to load';
      showError(e.message || 'Failed to load character');
    }
  }

  let chartInstance = null;

  function openChartModal() {
    const modal = document.getElementById('chart-modal');
    const emptyEl = document.getElementById('chart-modal-empty');
    const canvasWrap = document.getElementById('chart-modal-canvas-wrap');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    emptyEl.classList.add('hidden');
    canvasWrap.classList.add('hidden');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    fetch(API + '/player-history?name=' + encodeURIComponent(name) + '&hours=6')
      .then((res) => res.json())
      .then((data) => {
        const history = (data.history || []).slice();
        if (history.length === 0) {
          emptyEl.classList.remove('hidden');
          return;
        }
        canvasWrap.classList.remove('hidden');
        const labels = history.map((h) => {
          const d = new Date(h.at);
          return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        });
        const values = history.map((h) => h.totalXp);
        const dataMin = Math.min(...values);
        const dataMax = Math.max(...values);
        const range = dataMax - dataMin;
        const pad = range > 0 ? range * 0.01 : Math.max(1, dataMin * 0.01);
        const yMin = range > 0 ? dataMin - pad : dataMin - pad;
        const yMax = range > 0 ? dataMax + pad : dataMax + pad;

        const ctx = document.getElementById('chart-canvas').getContext('2d');
        chartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Total XP',
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

  function closeChartModal() {
    document.getElementById('chart-modal').classList.add('hidden');
    document.getElementById('chart-modal').setAttribute('aria-hidden', 'true');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  }

  document.getElementById('btn-update').addEventListener('click', load);
  document.getElementById('btn-view-chart').addEventListener('click', openChartModal);
  document.getElementById('chart-modal-close').addEventListener('click', closeChartModal);
  document.getElementById('chart-modal').addEventListener('click', (e) => { if (e.target.id === 'chart-modal') closeChartModal(); });
  load();
})();
