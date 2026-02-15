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
      const xpToNext = (s && s.xpToNext != null) ? s.xpToNext : '—';
      const rank = (s && s.rank != null) ? s.rank : '—';
      return `<tr class="border-b border-slate-700/70 hover:bg-slate-700/30">
        <td class="px-4 py-2 font-medium">${skillLabel(key)}</td>
        <td class="px-4 py-2 text-right">${level}</td>
        <td class="px-4 py-2 text-right font-mono">${formatNum(xp)}</td>
        <td class="px-4 py-2 text-right font-mono">${typeof xpToNext === 'number' ? formatNum(xpToNext) : xpToNext}</td>
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

  document.getElementById('btn-update').addEventListener('click', load);
  load();
})();
