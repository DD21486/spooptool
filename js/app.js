(function () {
  const API = '/api';
  const skillLabel = (key) => (key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  let characterList = [];
  let playerData = {};
  let bossKeys = [];
  let skillKeys = ['overall'];

  const leftTbody = document.getElementById('left-tbody');
  const rightTbody = document.getElementById('right-tbody');
  const leftLoading = document.getElementById('left-loading');
  const rightLoading = document.getElementById('right-loading');
  const leftTitle = document.getElementById('left-title');
  const filterType = document.getElementById('filter-type');
  const filterSkill = document.getElementById('filter-skill');
  const filterBoss = document.getElementById('filter-boss');
  const errorEl = document.getElementById('error-message');

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
    if (type === 'boss') return { type: 'boss', key: filterBoss.value };
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
    if (filter.type === 'boss' && filter.key && player.bosses) {
      const b = player.bosses[filter.key];
      const n = b && (b.count != null ? b.count : b.kc);
      return typeof n === 'number' ? n : 0;
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
    leftTitle.textContent = filter.type === 'overall' ? 'Total XP' : (filter.type === 'skill' ? skillLabel(filter.key) : (filter.key ? formatBossKey(filter.key) : 'Total XP'));

    const rows = characterList.map(username => ({
      username,
      mode: (playerData[username] && playerData[username].mode) || '—',
      value: leftTableValue(playerData[username], filter),
    })).filter(r => r.value != null);
    rows.sort((a, b) => (b.value - a.value));
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const value = r.value != null ? formatNum(r.value) : '—';
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="px-4 py-2 text-right font-mono">${value}</td><td class="px-4 py-2 text-slate-500 capitalize">${escapeHtml(r.mode)}</td>`;
      leftTbody.appendChild(tr);
    });
  }

  function renderRight() {
    rightLoading.classList.add('hidden');
    rightTbody.innerHTML = '';
    const rows = characterList.map(username => ({
      username,
      mode: (playerData[username] && playerData[username].mode) || '—',
      totalKc: totalBossKc(playerData[username]),
    }));
    rows.sort((a, b) => (b.totalKc - a.totalKc));
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="px-4 py-2 text-right font-mono">${formatNum(r.totalKc)}</td><td class="px-4 py-2 text-slate-500 capitalize">${escapeHtml(r.mode)}</td>`;
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
    filterBoss.innerHTML = '<option value="">Select boss</option>' + bossKeys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(formatBossKey(k))}</option>`).join('');
  }

  function populateFilterSkill() {
    const keys = new Set(['overall']);
    Object.values(playerData).forEach(p => { if (p && p.skills) Object.keys(p.skills).forEach(k => keys.add(k)); });
    skillKeys = Array.from(keys).sort((a, b) => (a === 'overall' ? -1 : (b === 'overall' ? 1 : a.localeCompare(b))));
    filterSkill.innerHTML = skillKeys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(skillLabel(k))}</option>`).join('');
  }

  async function fetchCharacters() {
    const res = await fetch(API + '/characters');
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      if (!res.ok) throw new Error(text || 'Failed to load characters');
    }
    if (!res.ok) throw new Error(data.detail || data.error || text || 'Failed to load characters');
    return data;
  }

  async function fetchPlayer(name) {
    const res = await fetch(API + '/player/' + encodeURIComponent(name));
    if (!res.ok) return null;
    return res.json();
  }

  async function loadAll() {
    showError('');
    leftLoading.classList.remove('hidden');
    rightLoading.classList.remove('hidden');
    leftTbody.innerHTML = '';
    rightTbody.innerHTML = '';
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
      populateFilterSkill();
      populateFilterBoss();
      renderLeft();
      renderRight();
    } catch (e) {
      console.error(e);
      showError(e.message || 'Failed to load data. Is the API running?');
      leftLoading.textContent = 'Error loading.';
      rightLoading.textContent = 'Error loading.';
    }
  }

  async function addCharacter() {
    const input = document.getElementById('input-username');
    const username = (input.value || '').trim();
    if (!username) {
      showError('Enter a username.');
      return;
    }
    showError('');
    try {
      const res = await fetch(API + '/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.replace(/\s+/g, ' ') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || 'Failed to add character');
        return;
      }
      input.value = '';
      showError('');
      await loadAll();
    } catch (e) {
      showError(e.message || 'Failed to add character');
    }
  }

  filterType.addEventListener('change', function () {
    filterSkill.classList.toggle('hidden', this.value !== 'skill');
    filterBoss.classList.toggle('hidden', this.value !== 'boss');
    renderLeft();
  });
  filterSkill.addEventListener('change', () => renderLeft());
  filterBoss.addEventListener('change', () => renderLeft());

  document.getElementById('btn-refresh').addEventListener('click', loadAll);
  document.getElementById('btn-add').addEventListener('click', addCharacter);
  document.getElementById('input-username').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addCharacter();
  });

  loadAll();
})();
