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
  const rightTitle = document.getElementById('right-title');
  const filterType = document.getElementById('filter-type');
  const filterSkill = document.getElementById('filter-skill');
  const filterRightBoss = document.getElementById('filter-right-boss');
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
    leftTitle.textContent = filter.type === 'overall' ? 'Total XP' : skillLabel(filter.key);

    const rows = characterList.map(username => ({
      username,
      value: leftTableValue(playerData[username], filter),
    })).filter(r => r.value != null);
    rows.sort((a, b) => (b.value - a.value));
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const value = r.value != null ? formatNum(r.value) : '—';
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="px-4 py-2 text-right font-mono">${value}</td>`;
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
      rightTitle.textContent = bossKey ? formatBossKey(bossKey) : 'Total boss kills';
    }
    const rows = characterList.map(username => ({
      username,
      kc: getRightBossKc(playerData[username], bossKey),
    }));
    rows.sort((a, b) => (b.kc - a.kc));
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      tr.innerHTML = `<td class="px-4 py-2 text-slate-400">${i + 1}</td><td class="px-4 py-2"><a href="/character.html?name=${encodeURIComponent(r.username)}" class="text-sky-400 hover:underline">${escapeHtml(r.username)}</a></td><td class="px-4 py-2 text-right font-mono">${formatNum(r.kc)}</td>`;
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
      await loadAll();
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

  document.getElementById('btn-refresh').addEventListener('click', loadAll);
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

  loadAll();
})();
