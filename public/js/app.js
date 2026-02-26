(function () {
  const API = '/api';

  function updateCronStatusOrb(cronHealth) {
    const orb = document.getElementById('cron-status-orb');
    const tooltipEl = document.getElementById('cron-status-orb-tooltip');
    if (!orb) return;
    const ok = cronHealth && cronHealth.ok === true;
    orb.classList.remove('bg-slate-500', 'bg-emerald-500', 'bg-red-500');
    orb.classList.add(ok ? 'bg-emerald-500' : 'bg-red-500');
    const lastRun = cronHealth && cronHealth.lastRunAt ? new Date(cronHealth.lastRunAt) : null;
    const timeStr = lastRun ? lastRun.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
    const tip = ok
      ? 'Green =\nLast Fetch Succeeded\n' + timeStr
      : 'Red =\nLast Fetch Failure\n' + timeStr;
    orb.title = tip;
    orb.setAttribute('aria-label', ok ? 'Cron status: OK' : 'Cron status: stale or failed');
    if (tooltipEl) tooltipEl.textContent = tip;
  }

  (function setupCronOrbHover() {
    const wrap = document.getElementById('cron-status-orb-wrap');
    const tooltipEl = document.getElementById('cron-status-orb-tooltip');
    if (!wrap || !tooltipEl) return;
    let showTimer = null;
    wrap.addEventListener('mouseenter', function () {
      showTimer = setTimeout(function () {
        tooltipEl.classList.remove('hidden');
      }, 200);
    });
    wrap.addEventListener('mouseleave', function () {
      if (showTimer) clearTimeout(showTimer);
      tooltipEl.classList.add('hidden');
    });
  })();

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
  const tabMonth = document.getElementById('tab-month');
  const tabWeek = document.getElementById('tab-week');
  const tabToday = document.getElementById('tab-today');
  const tabLast24 = document.getElementById('tab-last24');
  const spoopChartAll = document.getElementById('spoop-chart-all');
  const spoopChartBoss = document.getElementById('spoop-chart-boss');
  const spoopChartSkill = document.getElementById('spoop-chart-skill');
  const leftValueTh = document.getElementById('left-value-th');
  const rightValueTh = document.getElementById('right-value-th');
  const lootValueTh = document.getElementById('loot-value-th');

  let homeViewMode = 'last24';
  let spoopChartMode = 'all';
  let last24hDeltas = {};
  let todayDeltas = {};
  let weekDeltas = {};
  let monthDeltas = {};
  let lootTopDropsCache = {};
  let homeTooltipHideTimer = null;

  const CRON_TZ = 'America/New_York';
  /** Next :00 in America/New_York (hourly; actual trigger is cron-job.org). */
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
    for (let i = 0; i < 65; i++) {
      const parts = formatter.formatToParts(candidate);
      const get = (name) => parts.find((p) => p.type === name)?.value || '0';
      const nyMin = parseInt(get('minute'), 10);
      const nySec = parseInt(get('second'), 10);
      if (nyMin === 0) {
        const runTime = new Date(candidate.getTime() - nySec * 1000);
        if (runTime.getTime() > now) return runTime;
      }
      candidate = new Date(candidate.getTime() + 60000);
    }
    return new Date(now + 60 * 60 * 1000);
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
      const inLastMinuteBeforeRun = totalSec >= 59 * 60 && totalSec < 60 * 60;
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

  function bossImageSrc(bossKey) {
    if (!bossKey) return '';
    const overrides = {
      barrows: 'barrows.png', giant_mole: 'giantmole.png', giantmole: 'giantmole.png',
      deranged_archaeologist: 'derangedarchaeologist.png', derangedarchaeologist: 'derangedarchaeologist.png',
      scurrius: 'scurrius.png', wintertodt: 'Wintertodt.gif', doom_of_mokhaiotl: 'DoomofMokhaiotl.png', doomofmokhaiotl: 'DoomofMokhaiotl.png',
      phantom_muspah: 'PhantomMuspah.png', phantommuspah: 'PhantomMuspah.png', shellbane_gryphon: 'Shellbanegryphon.png', shellbanegryphon: 'Shellbanegryphon.png',
      sol_heredit: 'SolHeredit.png', solheredit: 'SolHeredit.png', chambers_of_xeric: 'ChambersOfXeric.png', chambersofxeric: 'ChambersOfXeric.png',
      chambers_of_xeric_challenge_mode: 'ChambersOfXericChallengeMode.png', chambersofxericchallengemode: 'ChambersOfXericChallengeMode.png',
      theatre_of_blood: 'TheatreOfBlood.png', theatreofblood: 'TheatreOfBlood.png', tombs_of_amascut: 'TombsOfAmascut.png', tombsofamascut: 'TombsOfAmascut.png',
      tombs_of_amascut_expert_mode: 'TombsOfAmascutExpertMode.png', tombsofamascutexpertmode: 'TombsOfAmascutExpertMode.png',
      king_black_dragon: 'KingBlackDragon.png', kingblackdragon: 'KingBlackDragon.png',
      thermonuclear_smoke_devil: 'ThermonuclearSmokeDevil.png', thermonuclearsmokedevil: 'ThermonuclearSmokeDevil.png',
      grotesque_guardians: 'GrotesqueGuardians.png', grotesqueguardians: 'GrotesqueGuardians.png',
      dagannoth_prime: 'DagannothPrime.png', dagannothprime: 'DagannothPrime.png', dagannoth_rex: 'DagannothRex.png', dagannothrex: 'DagannothRex.png',
      dagannoth_supreme: 'DagannothSupreme.png', dagannothsupreme: 'DagannothSupreme.png',
      chaos_elemental: 'ChaosElemental.png', chaoselemental: 'ChaosElemental.png', chaos_fanatic: 'ChaosFanatic.png', chaosfanatic: 'ChaosFanatic.png',
      crazy_archaeologist: 'Crazyarchaeologist.png', crazyarchaeologist: 'Crazyarchaeologist.png',
      commander_zilyana: 'CommanderZilyana.png', commanderzilyana: 'CommanderZilyana.png', general_graardor: 'GeneralGraardor.png', generalgraardor: 'GeneralGraardor.png',
      kreearra: 'Kreearra.png', kril_tsutsaroth: 'KrilTsutsaroth.png', kriltsutsaroth: 'KrilTsutsaroth.png',
      corporeal_beast: 'CorporealBeast.png', corporealbeast: 'CorporealBeast.png', lunar_chests: 'LunarChests.png', lunarchests: 'LunarChests.png',
      tzkal_zuk: 'TzKalZuk.png', tzkalzuk: 'TzKalZuk.png', tztok_jad: 'TzTokJad.png', tztokjad: 'TzTokJad.png',
      abyssal_sire: 'AbyssalSire.png', abyssalsire: 'AbyssalSire.png', alchemical_hydra: 'AlchemicalHydra.png', alchemicalhydra: 'AlchemicalHydra.png',
      duke_sucellus: 'DukeSucellus.png', dukesucellus: 'DukeSucellus.png', the_whisperer: 'TheWhisperer.png', whisperer: 'TheWhisperer.png',
      kalphite_queen: 'KalphiteQueen.png', kalphitequeen: 'KalphiteQueen.png', royal_titans: 'RoyalTitans.png', royaltitans: 'RoyalTitans.png',
      corrupted_gauntlet: 'CorruptedGuantlet.png', corruptedgauntlet: 'CorruptedGuantlet.png',
      phosani_nightmare: 'PhosanisNightmare.png', phosanis_nightmare: 'PhosanisNightmare.png', phosanisnightmare: 'PhosanisNightmare.png', gauntlet: 'Gauntlet.png',
    };
    const lower = String(bossKey).toLowerCase().trim().replace(/\s+/g, '_');
    if (overrides[lower]) return '/assets/bosses/' + overrides[lower];
    const pascal = lower.split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join('') + '.png';
    return '/assets/bosses/' + pascal;
  }

  function skillIconSrc(key) {
    if (!key) return '';
    if (key === 'overall') return '/assets/Skills_icon.png';
    const name = skillLabel(key).replace(/\s+/g, '');
    return '/assets/' + name + '_icon.png';
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
    const isDelta = homeViewMode === 'last24' || homeViewMode === 'today' || homeViewMode === 'week' || homeViewMode === 'month';
    const deltaSource = homeViewMode === 'today' ? todayDeltas : (homeViewMode === 'week' ? weekDeltas : (homeViewMode === 'month' ? monthDeltas : last24hDeltas));
    if (homeViewMode === 'last24') {
      leftTitle.textContent = filter.type === 'overall' ? 'XP' : skillLabel(filter.key);
      if (leftValueTh) leftValueTh.textContent = filter.type === 'overall' ? 'Last 24 Hr' : skillLabel(filter.key) + ' (24h)';
    } else if (homeViewMode === 'today') {
      leftTitle.textContent = filter.type === 'overall' ? 'XP' : skillLabel(filter.key);
      if (leftValueTh) leftValueTh.textContent = filter.type === 'overall' ? 'Today' : skillLabel(filter.key) + ' (today)';
    } else if (homeViewMode === 'week') {
      leftTitle.textContent = filter.type === 'overall' ? 'XP' : skillLabel(filter.key);
      if (leftValueTh) leftValueTh.textContent = filter.type === 'overall' ? 'This Week' : skillLabel(filter.key) + ' (this week)';
    } else if (homeViewMode === 'month') {
      leftTitle.textContent = filter.type === 'overall' ? 'XP' : skillLabel(filter.key);
      if (leftValueTh) leftValueTh.textContent = filter.type === 'overall' ? 'This Month' : skillLabel(filter.key) + ' (this month)';
    } else {
      leftTitle.textContent = filter.type === 'overall' ? 'Total XP' : skillLabel(filter.key);
      if (leftValueTh) leftValueTh.textContent = filter.type === 'overall' ? 'Total XP' : skillLabel(filter.key);
    }

    const skillKey = filter.type === 'skill' ? filter.key : 'overall';
    const rows = characterList.map(username => {
      const d = deltaSource[username];
      const delta = isDelta && d
        ? (d.skillDeltas && skillKey in d.skillDeltas ? d.skillDeltas[skillKey] : d.xpDelta)
        : 0;
      return {
        username,
        value: leftTableValue(playerData[username], filter),
        xpDelta: delta != null ? delta : 0,
      };
    }).filter(r => r.value != null);
    if (isDelta) {
      rows.sort((a, b) => (b.xpDelta - a.xpDelta));
    } else {
      rows.sort((a, b) => (b.value - a.value));
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const displayValue = isDelta
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

  function normalizeBossKeyForPoints(key) {
    return String(key || '').toLowerCase().replace(/\s+/g, '_').replace(/'/g, '').replace(/:/g, '').replace(/-/g, '_').trim();
  }
  const BOSS_POINTS = {
    wintertodt: 1, kraken: 1,
    tempoross: 2, bryophyta: 2, giant_mole: 2, giantmole: 2, hespori: 2, obor: 2, scurrius: 2, shellbane_gryphon: 2, shellbanegryphon: 2,
    amoxliatl: 3, barrows: 3, crazy_archaeologist: 3, crazyarchaeologist: 3, deranged_archaeologist: 3, derangedarchaeologist: 3, grotesque_guardians: 3, grotesqueguardians: 3, king_black_dragon: 3, kingblackdragon: 3, theatre_of_blood_entry_mode: 3, tombs_of_amascut_entry_mode: 3, the_hueycoatl: 3, hueycoatl: 3, the_royal_titans: 3, royal_titans: 3, royaltitans: 3,
    dagannoth_prime: 4, dagannothprime: 4, dagannoth_rex: 4, dagannothrex: 4, dagannoth_supreme: 4, dagannothsupreme: 4, callisto: 4, chaos_fanatic: 4, chaosfanatic: 4, moons_of_peril: 4, skotizo: 4, sarachnis: 4,
    crystalline_hunllef: 5, abyssal_sire: 5, abyssalsire: 5, araxxor: 5, cerberus: 5, chambers_of_xeric: 5, chambersofxeric: 5, commander_zilyana: 5, commanderzilyana: 5, duke_sucellus: 5, dukesucellus: 5, general_graardor: 5, generalgraardor: 5, krilsutsaroth: 5, kril_tsutsaroth: 5, kriltsutsaroth: 5, the_nightmare: 5, nightmare: 5, tombs_of_amascut: 5, tombsofamascut: 5, venenatis: 5, vorkath: 5, zalcano: 5, zulrah: 5, chaos_elemental: 5, chaoselemental: 5, scorpia: 5,
    kalphite_queen: 6, kalphitequeen: 6, kreearra: 6, corporeal_beast: 6, corporealbeast: 6, phantom_muspah: 6, phantommuspah: 6, thermonuclear_smoke_devil: 6, thermonuclearsmokedevil: 6, tztok_jad: 6, tztokjad: 6, vetion: 6, tombs_of_amascut_expert_mode: 6, tombsofamascutexpertmode: 6, alchemical_hydra: 6, alchemicalhydra: 6,
    corrupted_hunllef: 7, corruptedhunllef: 7, the_leviathan: 7, leviathan: 7, the_whisperer: 7, whisperer: 7, the_mimic: 7, mimic: 7, chambers_of_xeric_challenge_mode: 7, chambersofxericchallengemode: 7, vardorvis: 7, yama: 7,
    theatre_of_blood: 8, theatreofblood: 8, phosanis_nightmare: 8, phosanisnightmare: 8, nex: 8,
    tzhaar_ket_raks_challenges: 9,
    theatre_of_blood_hard_mode: 10,
    doom_of_mokhaiotl: 14, doomofmokhaiotl: 14,
    fortis_colosseum: 25, tzkal_zuk: 25, tzkalzuk: 25,
  };
  const FIRST_KILL_BONUS = 10;
  function computeBossPointsForPeriod(deltas, player) {
    if (deltas && deltas.bossDeltas && typeof deltas.bossDeltas === 'object') {
      let sum = 0;
      for (const [bossKey, delta] of Object.entries(deltas.bossDeltas)) {
        const count = typeof delta === 'number' && !Number.isNaN(delta) ? delta : 0;
        const pts = BOSS_POINTS[normalizeBossKeyForPoints(bossKey)] || 0;
        sum += count * pts + (count >= 1 ? FIRST_KILL_BONUS : 0);
      }
      return sum;
    }
    if (player && player.bosses && typeof player.bosses === 'object') {
      let sum = 0;
      for (const [bossKey, b] of Object.entries(player.bosses)) {
        const count = b && (b.count != null ? b.count : b.kc);
        const n = typeof count === 'number' && !Number.isNaN(count) ? count : 0;
        const pts = BOSS_POINTS[normalizeBossKeyForPoints(bossKey)] || 0;
        sum += n * pts + (n >= 1 ? FIRST_KILL_BONUS : 0);
      }
      return sum;
    }
    return 0;
  }

  function skillPointsForLevel(level) {
    const L = typeof level === 'number' && !Number.isNaN(level) ? Math.max(0, Math.min(99, Math.floor(level))) : 0;
    let pts = L * 15;
    if (L >= 70) pts += 100;
    if (L >= 80) pts += 200;
    if (L >= 93) pts += 300;
    if (L >= 99) pts += 2000;
    return pts;
  }
  function totalSkillingScore(skills) {
    if (!skills || typeof skills !== 'object') return 0;
    return Object.entries(skills).reduce((sum, [key, s]) => {
      if (key === 'overall') return sum;
      if (!s || typeof s !== 'object') return sum;
      const level = s.level != null ? parseInt(s.level, 10) : NaN;
      return sum + skillPointsForLevel(level);
    }, 0);
  }

  function renderLoot() {
    if (!lootTbody || !lootLoading) return;
    lootLoading.classList.add('hidden');
    lootTbody.innerHTML = '';
    const isLast24 = homeViewMode === 'last24';
    const isToday = homeViewMode === 'today';
    const isWeek = homeViewMode === 'week';
    const isMonth = homeViewMode === 'month';
    const list = isToday ? lootLeaderboardToday : (isWeek ? lootLeaderboardWeek : (isMonth ? lootLeaderboardMonth : (isLast24 ? lootLeaderboard24 : lootLeaderboardTotal)));
    if (lootTitle) lootTitle.textContent = 'Loot value';
    if (lootValueTh) lootValueTh.textContent = isToday ? 'Value (today)' : (isWeek ? 'Value (this week)' : (isMonth ? 'Value (this month)' : (isLast24 ? 'Value (24h)' : 'Value')));
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

  /** SpoopScore = total boss points (with first-kill bonus) + total skill score from current snapshot. */
  function paintSpoopScoreChart() {
    const canvas = document.getElementById('spoop-score-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (homeChartSpoopScore) {
      homeChartSpoopScore.destroy();
      homeChartSpoopScore = null;
    }
    const valueKey = spoopChartMode === 'boss' ? 'bossScore' : spoopChartMode === 'skill' ? 'skillScore' : 'spoopScore';
    const datasetLabel = spoopChartMode === 'boss' ? 'Boss Score' : spoopChartMode === 'skill' ? 'Skill Score' : 'SpoopScore';
    const rows = (characterList || []).map((username) => {
      const player = playerData[username];
      const bossScore = computeBossPointsForPeriod(null, player);
      const skillScore = totalSkillingScore(player && player.skills ? player.skills : {});
      const b = bossScore || 0;
      const s = skillScore || 0;
      return { username, spoopScore: b + s, bossScore: b, skillScore: s };
    });
    rows.sort((a, b) => b[valueKey] - a[valueKey]);
    const labels = rows.map((r) => r.username);
    const data = rows.map((r) => r[valueKey]);
    if (labels.length === 0) return;
    homeChartSpoopScore = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: datasetLabel,
          data,
          backgroundColor: 'rgba(56, 189, 248, 0.6)',
          borderColor: 'rgb(56, 189, 248)',
          borderWidth: 1,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        elements: {
          bar: {
            borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = rows[ctx.dataIndex];
                return [
                  'Total: ' + formatNum(ctx.raw),
                  'Boss: ' + formatNum(r.bossScore),
                  'Skill: ' + formatNum(r.skillScore),
                ];
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(148, 163, 184, 0.2)' },
            ticks: { color: '#94a3b8', callback: (v) => formatNum(Number(v)), font: { size: 10 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 13, weight: 'bold' }, autoSkip: false },
          },
        },
      },
    });
  }

  function renderRight() {
    rightLoading.classList.add('hidden');
    rightTbody.innerHTML = '';
    const bossKey = (filterRightBoss && filterRightBoss.value) || '';
    const isDelta = homeViewMode === 'last24' || homeViewMode === 'today' || homeViewMode === 'week' || homeViewMode === 'month';
    const deltaSource = homeViewMode === 'today' ? todayDeltas : (homeViewMode === 'week' ? weekDeltas : (homeViewMode === 'month' ? monthDeltas : last24hDeltas));
    if (rightTitle) rightTitle.textContent = bossKey ? formatBossKey(bossKey) : 'Boss KC';
    if (rightValueTh) {
      rightValueTh.textContent = homeViewMode === 'today'
        ? (bossKey ? formatBossKey(bossKey) + ' (today)' : 'Today')
        : homeViewMode === 'week'
          ? (bossKey ? formatBossKey(bossKey) + ' (this week)' : 'This Week')
          : homeViewMode === 'month'
            ? (bossKey ? formatBossKey(bossKey) + ' (this month)' : 'This Month')
            : (homeViewMode === 'last24'
              ? (bossKey ? formatBossKey(bossKey) + ' (24h)' : 'Last 24 Hr')
              : (bossKey ? formatBossKey(bossKey) : 'Total KC'));
    }
    const rows = characterList.map(username => {
      const d = deltaSource[username];
      const player = playerData[username];
      const kcDelta = isDelta && d
        ? (bossKey && d.bossDeltas && bossKey in d.bossDeltas ? d.bossDeltas[bossKey] : d.bossKcDelta)
        : 0;
      const bossPoints = isDelta ? computeBossPointsForPeriod(d, null) : computeBossPointsForPeriod(null, player);
      return {
        username,
        kc: getRightBossKc(player, bossKey),
        kcDelta: kcDelta != null ? kcDelta : 0,
        bossPoints,
      };
    });
    if (isDelta) {
      rows.sort((a, b) => (b.kcDelta - a.kcDelta));
    } else {
      rows.sort((a, b) => (b.kc - a.kc));
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const kcDisplay = isDelta
        ? (r.kcDelta != null && r.kcDelta > 0 ? `<span class="text-green-400 font-mono">+${formatNum(r.kcDelta)}</span>` : '—')
        : formatNum(r.kc);
      const pointsSuffix = typeof r.bossPoints === 'number' ? ` <span class="text-slate-400 font-mono">(${formatNum(r.bossPoints)})</span>` : '';
      const displayValue = kcDisplay + pointsSuffix;
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
    const deltas24 = last24hDeltas[username];
    const deltasToday = todayDeltas[username];
    const deltasWeek = weekDeltas[username];
    const deltasMonth = monthDeltas[username];
    const isLast24 = homeViewMode === 'last24';
    const isToday = homeViewMode === 'today';
    const isWeek = homeViewMode === 'week';
    const isMonth = homeViewMode === 'month';
    const deltas = isToday ? deltasToday : (isWeek ? deltasWeek : (isMonth ? deltasMonth : deltas24));
    const periodLabel = isToday ? 'today' : (isWeek ? 'this week' : (isMonth ? 'this month' : '24h'));
    let header = '';
    let entries = [];
    if ((isLast24 || isToday || isWeek || isMonth) && deltas && deltas.skillDeltas) {
      entries = Object.entries(deltas.skillDeltas)
        .filter(([k]) => k !== 'overall')
        .map(([k, v]) => ({ key: k, delta: Number(v) || 0 }))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No skill gains ' + (isToday ? 'today' : (isWeek ? 'this week' : (isMonth ? 'this month' : 'in last 24h'))) + '</div>';
      header = '<div class="font-semibold text-slate-300 mb-1.5">Top 3 skills (' + periodLabel + ')</div>';
      return header + entries.map((e) => {
        const icon = skillIconSrc(e.key);
        const name = escapeHtml(skillLabel(e.key));
        const val = '+' + formatNum(e.delta) + ' XP';
        return '<div class="flex items-center gap-2 py-0.5"><img src="' + escapeHtml(icon) + '" alt="" class="w-4 h-4 shrink-0 object-contain" width="16" height="16" loading="lazy" onerror="this.style.display=\'none\'"><span class="flex-1 text-left">' + name + '</span><span class="text-right tabular-nums text-green-400/90">' + escapeHtml(val) + '</span></div>';
      }).join('');
    }
    if (player && player.skills) {
      entries = Object.entries(player.skills)
        .filter(([k]) => k !== 'overall')
        .map(([k, s]) => ({ key: k, xp: (s && (s.xp != null ? s.xp : s.experience)) || 0 }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No skills</div>';
      header = '<div class="font-semibold text-slate-300 mb-1.5">Top 3 skills (total)</div>';
      return header + entries.map((e) => {
        const icon = skillIconSrc(e.key);
        const name = escapeHtml(skillLabel(e.key));
        const val = formatNum(e.xp) + ' XP';
        return '<div class="flex items-center gap-2 py-0.5"><img src="' + escapeHtml(icon) + '" alt="" class="w-4 h-4 shrink-0 object-contain" width="16" height="16" loading="lazy" onerror="this.style.display=\'none\'"><span class="flex-1 text-left">' + name + '</span><span class="text-right tabular-nums">' + escapeHtml(val) + '</span></div>';
      }).join('');
    }
    return '<div class="text-slate-400">No data</div>';
  }
  function buildBossTooltipContent(username) {
    const player = playerData[username];
    const deltas24 = last24hDeltas[username];
    const deltasToday = todayDeltas[username];
    const deltasWeek = weekDeltas[username];
    const deltasMonth = monthDeltas[username];
    const isLast24 = homeViewMode === 'last24';
    const isToday = homeViewMode === 'today';
    const isWeek = homeViewMode === 'week';
    const isMonth = homeViewMode === 'month';
    const deltas = isToday ? deltasToday : (isWeek ? deltasWeek : (isMonth ? deltasMonth : deltas24));
    const periodLabel = isToday ? 'today' : (isWeek ? 'this week' : (isMonth ? 'this month' : '24h'));
    let entries = [];
    if ((isLast24 || isToday || isWeek || isMonth) && deltas && deltas.bossDeltas) {
      entries = Object.entries(deltas.bossDeltas)
        .map(([k, v]) => ({ key: k, delta: Number(v) || 0 }))
        .filter((e) => e.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No boss kills ' + (isToday ? 'today' : (isWeek ? 'this week' : (isMonth ? 'this month' : 'in last 24h'))) + '</div>';
      const header = '<div class="font-semibold text-slate-300 mb-1.5">Top 3 bosses (' + periodLabel + ')</div>';
      return header + entries.map((e) => {
        const icon = bossImageSrc(e.key);
        const name = escapeHtml(formatBossKey(e.key));
        const val = '+' + formatNum(e.delta) + ' KC';
        return '<div class="flex items-center gap-2 py-0.5"><img src="' + escapeHtml(icon) + '" alt="" class="w-4 h-4 shrink-0 object-contain rounded-sm" width="16" height="16" loading="lazy" onerror="this.style.display=\'none\'"><span class="flex-1 text-left">' + name + '</span><span class="text-right tabular-nums text-green-400/90">' + escapeHtml(val) + '</span></div>';
      }).join('');
    }
    if (player && player.bosses) {
      entries = Object.entries(player.bosses)
        .map(([k, b]) => ({ key: k, kc: (b && (b.count != null ? b.count : b.kc)) || 0 }))
        .filter((e) => e.kc > 0)
        .sort((a, b) => b.kc - a.kc)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No boss kills</div>';
      const header = '<div class="font-semibold text-slate-300 mb-1.5">Top 3 bosses (total)</div>';
      return header + entries.map((e) => {
        const icon = bossImageSrc(e.key);
        const name = escapeHtml(formatBossKey(e.key));
        const val = formatNum(e.kc) + ' KC';
        return '<div class="flex items-center gap-2 py-0.5"><img src="' + escapeHtml(icon) + '" alt="" class="w-4 h-4 shrink-0 object-contain rounded-sm" width="16" height="16" loading="lazy" onerror="this.style.display=\'none\'"><span class="flex-1 text-left">' + name + '</span><span class="text-right tabular-nums">' + escapeHtml(val) + '</span></div>';
      }).join('');
    }
    return '<div class="text-slate-400">No data</div>';
  }
  async function fetchAndBuildLootTooltipContent(username) {
    const suffix = homeViewMode === 'today' ? ':today' : (homeViewMode === 'week' ? ':week' : (homeViewMode === 'month' ? ':month' : (homeViewMode === 'last24' ? ':24' : ':all')));
    const cacheKey = username + suffix;
    if (lootTopDropsCache[cacheKey]) return lootTopDropsCache[cacheKey];
    const todayParam = homeViewMode === 'today' ? '&today=1' : '';
    const weekParam = homeViewMode === 'week' ? '&week=1' : '';
    const monthParam = homeViewMode === 'month' ? '&month=1' : '';
    const hoursParam = homeViewMode === 'last24' ? '&hours=24' : '';
    const url = API + '/loot?player=' + encodeURIComponent(username) + '&limit=3' + hoursParam + todayParam + weekParam + monthParam;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const drops = Array.isArray(data.drops) ? data.drops : [];
      if (drops.length === 0) return '<div class="text-slate-400">No loot recorded</div>';
      let html = '<div class="font-semibold text-slate-300 mb-1.5">Top 3 by value</div>';
      drops.slice(0, 3).forEach((d) => {
        const val = Number(d.total_value_gp) || 0;
        const valStr = (val >= 1e6 ? (val / 1e6).toFixed(2) + 'M' : formatNum(val)) + ' gp';
        html += '<div class="flex items-center gap-2 py-0.5"><span class="flex-1 text-left">' + escapeHtml(d.item_name || '—') + '</span><span class="text-right tabular-nums">' + escapeHtml(valStr) + '</span></div>';
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
      const [dataRes, deltasRes, deltasTodayRes, deltasWeekRes, deltasMonthRes, lootTotalRes, loot24Res, lootTodayRes, lootWeekRes, lootMonthRes] = await Promise.all([
        fetch(API + '/characters-with-snapshots'),
        fetch(API + '/characters-deltas?hours=24'),
        fetch(API + '/characters-deltas?today=1'),
        fetch(API + '/characters-deltas?week=1'),
        fetch(API + '/characters-deltas?month=1'),
        fetch(API + '/loot?leaderboard=1'),
        fetch(API + '/loot?leaderboard=1&hours=24'),
        fetch(API + '/loot?leaderboard=1&today=1'),
        fetch(API + '/loot?leaderboard=1&week=1'),
        fetch(API + '/loot?leaderboard=1&month=1'),
      ]);
      if (!dataRes.ok) throw new Error('Failed to load data');
      const data = await dataRes.json();
      const deltasData = await deltasRes.json().catch(() => ({}));
      const deltasTodayData = await deltasTodayRes.json().catch(() => ({}));
      const deltasWeekData = await deltasWeekRes.json().catch(() => ({}));
      const deltasMonthData = await deltasMonthRes.json().catch(() => ({}));
      last24hDeltas = {};
      (deltasData.deltas || []).forEach((d) => {
        last24hDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      todayDeltas = {};
      (deltasTodayData.deltas || []).forEach((d) => {
        todayDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      weekDeltas = {};
      (deltasWeekData.deltas || []).forEach((d) => {
        weekDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      monthDeltas = {};
      (deltasMonthData.deltas || []).forEach((d) => {
        monthDeltas[d.username] = {
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
      const lootTodayData = await lootTodayRes.json().catch(() => ({}));
      const lootWeekData = await lootWeekRes.json().catch(() => ({}));
      const lootMonthData = await lootMonthRes.json().catch(() => ({}));
      lootLeaderboardTotal = Array.isArray(lootTotalData.players) ? lootTotalData.players : [];
      lootLeaderboard24 = Array.isArray(loot24Data.players) ? loot24Data.players : [];
      lootLeaderboardToday = Array.isArray(lootTodayData.players) ? lootTodayData.players : [];
      lootLeaderboardWeek = Array.isArray(lootWeekData.players) ? lootWeekData.players : [];
      lootLeaderboardMonth = Array.isArray(lootMonthData.players) ? lootMonthData.players : [];
      populateFilterSkill();
      populateFilterBoss();
      renderLeft();
      renderRight();
      renderLoot();
      paintSpoopScoreChart();
      renderActivity(data.activity || []);
      loadHomeCharts();
    } catch (e) {
      console.error(e);
      showError(e.message || 'Failed to load data. Is the API running?');
      leftLoading.textContent = 'Error loading.';
      rightLoading.textContent = 'Error loading.';
    }
  }

  function formatActivityTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = Date.now();
    const ms = now - d.getTime();
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
    if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
    if (ms < 604800000) return Math.floor(ms / 86400000) + 'd ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function renderActivity(activity) {
    const tbody = document.getElementById('activity-tbody');
    const emptyEl = document.getElementById('activity-empty');
    if (!tbody) return;
    if (!activity || activity.length === 0) {
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    const typeLabel = (t) => (t === 'loot' ? 'Loot' : 'XP/KC');
    const typeClass = (t) => (t === 'loot' ? 'bg-amber-600/80 text-slate-100' : 'bg-sky-600/80 text-slate-100');
    tbody.innerHTML = activity.map((a) => {
      const time = formatActivityTime(a.at);
      const badge = '<span class="inline-block px-1.5 py-0.5 rounded text-xs font-medium ' + typeClass(a.type) + '">' + typeLabel(a.type) + '</span>';
      return '<tr class="border-b border-slate-700/70 hover:bg-slate-700/30">' +
        '<td class="px-4 py-2 text-slate-400 whitespace-nowrap">' + time + '</td>' +
        '<td class="px-4 py-2 font-medium">' + (a.username || '—') + '</td>' +
        '<td class="px-4 py-2">' + badge + ' <span class="text-slate-300">' + (a.description || '').replace(/</g, '&lt;') + '</span></td>' +
        '</tr>';
    }).join('');
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
      renderLoot();
      paintSpoopScoreChart();
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
  let homeChartSpoopScore = null;
  let cachedHomeHistory = null;
  let cachedLootHistory = null;
  let lootLeaderboardTotal = [];
  let lootLeaderboard24 = [];
  let lootLeaderboardToday = [];
  let lootLeaderboardWeek = [];
  let lootLeaderboardMonth = [];
  let cachedHomeHistoryToday = null;
  let cachedLootHistoryToday = null;
  let cachedHomeHistoryWeek = null;
  let cachedLootHistoryWeek = null;
  let cachedHomeHistoryMonth = null;
  let cachedLootHistoryMonth = null;

  function setHomeChartLabels(mode) {
    const isDelta = mode === 'last24' || mode === 'today' || mode === 'week' || mode === 'month';
    const xpLabelEl = document.getElementById('home-chart-xp-label');
    const bossLabelEl = document.getElementById('home-chart-boss-label');
    const lootLabelEl = document.getElementById('home-chart-loot-label');
    if (xpLabelEl) xpLabelEl.textContent = isDelta ? 'Total XP' : 'Total XP (all characters)';
    if (bossLabelEl) bossLabelEl.textContent = isDelta ? 'Boss KC' : 'Boss KC (all characters)';
    if (lootLabelEl) lootLabelEl.textContent = isDelta ? 'Loot value' : 'Loot value (all characters)';
  }

  /** For Today view: build fixed 24h axis (12am–midnight) and map history into hourly slots; future hours are null so the line stops at current time. */
  function buildToday24hAxis(history, baseXp, baseBoss) {
    const now = new Date();
    const currentHour = now.getHours();
    const labels = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(2000, 0, 1, i, 0, 0);
      labels.push(d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    }
    const xpSlots = new Array(24).fill(null);
    const bossSlots = new Array(24).fill(null);
    for (const h of history) {
      const d = new Date(h.at);
      const lh = d.getHours();
      xpSlots[lh] = Math.max(0, (Number(h.totalXp) || 0) - baseXp);
      bossSlots[lh] = Math.max(0, (Number(h.totalBossKc) || 0) - baseBoss);
    }
    for (let i = 1; i < 24; i++) {
      if (xpSlots[i] == null) xpSlots[i] = xpSlots[i - 1];
      if (bossSlots[i] == null) bossSlots[i] = bossSlots[i - 1];
    }
    if (xpSlots[0] == null) xpSlots[0] = 0;
    if (bossSlots[0] == null) bossSlots[0] = 0;
    for (let i = currentHour + 1; i < 24; i++) {
      xpSlots[i] = null;
      bossSlots[i] = null;
    }
    return { labels, xpValues: xpSlots, bossValues: bossSlots };
  }

  function paintHomeCharts(history, mode, lootHistory) {
    const isLast24 = mode === 'last24';
    const isToday = mode === 'today';
    const isWeek = mode === 'week';
    const isMonth = mode === 'month';
    const isDelta = isLast24 || isToday || isWeek || isMonth;
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
      setHomeChartLabels(mode);
      paintHomeLootChart(lootHistory || [], mode);
      return;
    }

    let labels;
    let xpValues;
    let bossValues;
    if (isToday) {
      const base = history[0];
      const baseXp = base ? Number(base.totalXp) || 0 : 0;
      const baseBoss = base ? Number(base.totalBossKc) || 0 : 0;
      const built = buildToday24hAxis(history, baseXp, baseBoss);
      labels = built.labels;
      xpValues = built.xpValues;
      bossValues = built.bossValues;
    } else {
      labels = history.map((h) => {
        const d = new Date(h.at);
        if (isWeek || isMonth) {
          const M = d.getMonth() + 1;
          const day = d.getDate();
          const hr = d.getHours();
          const h12 = hr % 12 || 12;
          const ap = hr < 12 ? 'a' : 'p';
          return M + '/' + day + ' ' + h12 + ap;
        }
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      });
      if (isDelta) {
        const base = history[0];
        const baseXp = base ? Number(base.totalXp) || 0 : 0;
        const baseBoss = base ? Number(base.totalBossKc) || 0 : 0;
        xpValues = history.map((h) => Math.max(0, (Number(h.totalXp) || 0) - baseXp));
        bossValues = history.map((h) => Math.max(0, (Number(h.totalBossKc) || 0) - baseBoss));
      } else {
        xpValues = history.map((h) => Number(h.totalXp));
        bossValues = history.map((h) => Number(h.totalBossKc));
      }
    }

    let lastXp = xpValues[xpValues.length - 1];
    let lastBoss = bossValues[bossValues.length - 1];
    if (isToday) {
      for (let i = 23; i >= 0; i--) {
        if (xpValues[i] != null) { lastXp = xpValues[i]; break; }
      }
      for (let i = 23; i >= 0; i--) {
        if (bossValues[i] != null) { lastBoss = bossValues[i]; break; }
      }
    }
    if ((isWeek || isMonth) && xpValues.length > 0) {
      for (let i = xpValues.length - 1; i >= 0; i--) {
        if (xpValues[i] != null) { lastXp = xpValues[i]; break; }
      }
      for (let i = bossValues.length - 1; i >= 0; i--) {
        if (bossValues[i] != null) { lastBoss = bossValues[i]; break; }
      }
    }

    if (isToday) {
      const sumXp = Object.values(todayDeltas).reduce((s, d) => s + (Number(d.xpDelta) || 0), 0);
      const sumBoss = Object.values(todayDeltas).reduce((s, d) => s + (Number(d.bossKcDelta) || 0), 0);
      const sumLoot = lootLeaderboardToday.reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(sumXp).toLocaleString() + ' XP (today)';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(sumBoss).toLocaleString() + ' kills (today)';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp (today)';
    } else if (isWeek) {
      const sumXp = Object.values(weekDeltas).reduce((s, d) => s + (Number(d.xpDelta) || 0), 0);
      const sumBoss = Object.values(weekDeltas).reduce((s, d) => s + (Number(d.bossKcDelta) || 0), 0);
      const sumLoot = lootLeaderboardWeek.reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(sumXp).toLocaleString() + ' XP (this week)';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(sumBoss).toLocaleString() + ' kills (this week)';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp (this week)';
    } else if (isMonth) {
      const sumXp = Object.values(monthDeltas).reduce((s, d) => s + (Number(d.xpDelta) || 0), 0);
      const sumBoss = Object.values(monthDeltas).reduce((s, d) => s + (Number(d.bossKcDelta) || 0), 0);
      const sumLoot = lootLeaderboardMonth.reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(sumXp).toLocaleString() + ' XP (this month)';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(sumBoss).toLocaleString() + ' kills (this month)';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp (this month)';
    } else if (isLast24) {
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
    setHomeChartLabels(mode);

    /** Y-axis range from series. When min is 0 and data is mostly above zero, zoom into the positive range so the chart is readable. */
    function rangeFromSeries(values, fallbackMax) {
      const nums = values.filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
      const dataMin = nums.length ? Math.min(...nums) : 0;
      const dataMax = nums.length ? Math.max(...nums, fallbackMax) : fallbackMax;
      const range = dataMax - dataMin;
      const pad = range > 0 ? range * 0.01 : Math.max(dataMax * 0.01, 1);
      let yMin = dataMin - pad;
      if (dataMin === 0 && dataMax > 0 && range > 0) {
        const positive = nums.filter((n) => n > 0);
        if (positive.length > 0) {
          const minPositive = Math.min(...positive);
          const rangePositive = dataMax - minPositive;
          const padP = rangePositive > 0 ? rangePositive * 0.01 : Math.max(dataMax * 0.01, 1);
          yMin = Math.max(0, minPositive - padP);
        } else {
          yMin = 0;
        }
      } else {
        yMin = Math.max(0, yMin);
      }
      return { min: yMin, max: dataMax + pad };
    }
    const xpRange = rangeFromSeries(xpValues, 10);
    const bossRange = rangeFromSeries(bossValues, 10);
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
            label: isToday ? 'XP gain (today)' : (isWeek ? 'XP gain (this week)' : (isMonth ? 'XP gain (this month)' : (isLast24 ? 'XP gain (24h)' : 'Total XP'))),
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
            label: isToday ? 'KC gain (today)' : (isWeek ? 'KC gain (this week)' : (isMonth ? 'KC gain (this month)' : (isLast24 ? 'KC gain (24h)' : 'Total KC'))),
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
    const sharedAxis = (mode === 'week' || mode === 'month' || mode === 'last24') && history && history.length
      ? { labels, bucketTimes: history.map((h) => h.at) }
      : null;
    paintHomeLootChart(lootHistory || [], mode, sharedAxis);
  }

  /** Cumulative loot value at or before time T from lootHistory (each entry has at, value = cumulative). */
  function cumulativeLootAt(bucketTime, lootHistory) {
    if (!lootHistory || lootHistory.length === 0) return 0;
    const t = new Date(bucketTime).getTime();
    let best = 0;
    for (const h of lootHistory) {
      const at = new Date(h.at).getTime();
      if (at <= t) best = Number(h.value) || 0;
    }
    return best;
  }

  function paintHomeLootChart(lootHistory, homeViewMode, sharedAxis) {
    const lootTotalEl = document.getElementById('home-chart-loot-total');
    if (homeChartLoot) { homeChartLoot.destroy(); homeChartLoot = null; }
    const isToday = homeViewMode === 'today';
    const isWeek = homeViewMode === 'week';
    const isMonth = homeViewMode === 'month';
    const isLast24 = homeViewMode === 'last24';
    let labels;
    let values;
    if (sharedAxis && (isWeek || isMonth || isLast24)) {
      labels = sharedAxis.labels;
      values = sharedAxis.bucketTimes.map((t) => cumulativeLootAt(t, lootHistory || []));
    } else if (!lootHistory || lootHistory.length === 0) {
      if (lootTotalEl) lootTotalEl.textContent = '—';
      return;
    }
    if (labels === undefined) {
      if (isToday) {
        labels = [];
        for (let i = 0; i < 24; i++) {
          const d = new Date(2000, 0, 1, i, 0, 0);
          labels.push(d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
        }
        const valueSlots = new Array(24).fill(null);
        for (const h of lootHistory) {
          const d = new Date(h.at);
          const lh = d.getHours();
          valueSlots[lh] = Number(h.value) || 0;
        }
        for (let i = 1; i < 24; i++) {
          if (valueSlots[i] == null) valueSlots[i] = valueSlots[i - 1];
        }
        if (valueSlots[0] == null) valueSlots[0] = 0;
        const now = new Date();
        const currentHour = now.getHours();
        for (let i = currentHour + 1; i < 24; i++) valueSlots[i] = null;
        values = valueSlots;
      } else {
        labels = lootHistory.map((h) => {
          const d = new Date(h.at);
          return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        });
        values = lootHistory.map((h) => Number(h.value) || 0);
        const now = new Date();
        const lastBucket = lootHistory.length ? new Date(lootHistory[lootHistory.length - 1].at) : null;
        if (lastBucket && (now - lastBucket) > 45 * 60 * 1000) {
          labels.push(now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
          values = values.concat(values[values.length - 1]);
        }
      }
    }
    const numericValues = values.filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
    const dataMin = numericValues.length ? Math.min(...numericValues) : 0;
    const dataMax = numericValues.length ? Math.max(...numericValues, 1) : 1;
    const range = dataMax - dataMin;
    const pad = range > 0 ? range * 0.01 : Math.max(dataMax * 0.01, 1);
    let yMin = dataMin - pad;
    if (dataMin === 0 && dataMax > 0 && range > 0) {
      const positive = numericValues.filter((n) => n > 0);
      if (positive.length > 0) {
        const minPositive = Math.min(...positive);
        const rangePositive = dataMax - minPositive;
        const padP = rangePositive > 0 ? rangePositive * 0.01 : Math.max(dataMax * 0.01, 1);
        yMin = Math.max(0, minPositive - padP);
      } else {
        yMin = 0;
      }
    } else {
      yMin = Math.max(0, yMin);
    }
    const yMax = dataMax + pad;
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
              min: yMin,
              max: yMax,
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
        if (data.cronHealth) updateCronStatusOrb(data.cronHealth);
      })
      .catch(() => {});
  }

  function loadHomeChartsToday() {
    fetch(API + '/aggregate-history?today=1')
      .then((res) => res.json())
      .then((data) => {
        const history = (data.history || []).slice();
        cachedHomeHistoryToday = history;
        cachedLootHistoryToday = (data.lootHistory || []).slice();
        paintHomeCharts(history, 'today', cachedLootHistoryToday);
        if (data.cronHealth) updateCronStatusOrb(data.cronHealth);
      })
      .catch(() => {});
  }

  function loadHomeChartsWeek() {
    fetch(API + '/aggregate-history?week=1')
      .then((res) => res.json())
      .then((data) => {
        const history = (data.history || []).slice();
        cachedHomeHistoryWeek = history;
        cachedLootHistoryWeek = (data.lootHistory || []).slice();
        paintHomeCharts(history, 'week', cachedLootHistoryWeek);
        if (data.cronHealth) updateCronStatusOrb(data.cronHealth);
      })
      .catch(() => {});
  }

  function loadHomeChartsMonth() {
    fetch(API + '/aggregate-history?month=1')
      .then((res) => res.json())
      .then((data) => {
        const history = (data.history || []).slice();
        cachedHomeHistoryMonth = history;
        cachedLootHistoryMonth = (data.lootHistory || []).slice();
        paintHomeCharts(history, 'month', cachedLootHistoryMonth);
        if (data.cronHealth) updateCronStatusOrb(data.cronHealth);
      })
      .catch(() => {});
  }

  function setHomeViewMode(mode) {
    homeViewMode = mode;
    setHomeChartLabels(mode);
    const isMonth = mode === 'month';
    const isWeek = mode === 'week';
    const isToday = mode === 'today';
    const isLast24 = mode === 'last24';
    if (tabMonth) {
      tabMonth.classList.toggle('bg-sky-600', isMonth);
      tabMonth.classList.toggle('text-white', isMonth);
      tabMonth.classList.toggle('bg-slate-700', !isMonth);
      tabMonth.classList.toggle('text-slate-300', !isMonth);
      tabMonth.setAttribute('aria-selected', String(isMonth));
    }
    if (tabWeek) {
      tabWeek.classList.toggle('bg-sky-600', isWeek);
      tabWeek.classList.toggle('text-white', isWeek);
      tabWeek.classList.toggle('bg-slate-700', !isWeek);
      tabWeek.classList.toggle('text-slate-300', !isWeek);
      tabWeek.setAttribute('aria-selected', String(isWeek));
    }
    if (tabToday) {
      tabToday.classList.toggle('bg-sky-600', isToday);
      tabToday.classList.toggle('text-white', isToday);
      tabToday.classList.toggle('bg-slate-700', !isToday);
      tabToday.classList.toggle('text-slate-300', !isToday);
      tabToday.setAttribute('aria-selected', String(isToday));
    }
    if (tabLast24) {
      tabLast24.classList.toggle('bg-sky-600', isLast24);
      tabLast24.classList.toggle('text-white', isLast24);
      tabLast24.classList.toggle('bg-slate-700', !isLast24);
      tabLast24.classList.toggle('text-slate-300', !isLast24);
      tabLast24.setAttribute('aria-selected', String(isLast24));
    }
    renderLeft();
    renderRight();
    renderLoot();
    paintSpoopScoreChart();
    if (mode === 'today') {
      if (cachedHomeHistoryToday != null) {
        paintHomeCharts(cachedHomeHistoryToday, 'today', cachedLootHistoryToday);
      } else {
        loadHomeChartsToday();
      }
    } else if (mode === 'week') {
      if (cachedHomeHistoryWeek != null) {
        paintHomeCharts(cachedHomeHistoryWeek, 'week', cachedLootHistoryWeek);
      } else {
        loadHomeChartsWeek();
      }
    } else if (mode === 'month') {
      if (cachedHomeHistoryMonth != null) {
        paintHomeCharts(cachedHomeHistoryMonth, 'month', cachedLootHistoryMonth);
      } else {
        loadHomeChartsMonth();
      }
    } else if (cachedHomeHistory) {
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

  if (tabMonth) tabMonth.addEventListener('click', () => setHomeViewMode('month'));
  if (tabWeek) tabWeek.addEventListener('click', () => setHomeViewMode('week'));
  if (tabToday) tabToday.addEventListener('click', () => setHomeViewMode('today'));
  if (tabLast24) tabLast24.addEventListener('click', () => setHomeViewMode('last24'));

  function setSpoopChartMode(mode) {
    spoopChartMode = mode;
    const isAll = mode === 'all';
    const isBoss = mode === 'boss';
    const isSkill = mode === 'skill';
    if (spoopChartAll) {
      spoopChartAll.classList.toggle('bg-sky-600', isAll);
      spoopChartAll.classList.toggle('text-white', isAll);
      spoopChartAll.classList.toggle('bg-slate-700', !isAll);
      spoopChartAll.classList.toggle('text-slate-300', !isAll);
      spoopChartAll.setAttribute('aria-selected', String(isAll));
    }
    if (spoopChartBoss) {
      spoopChartBoss.classList.toggle('bg-sky-600', isBoss);
      spoopChartBoss.classList.toggle('text-white', isBoss);
      spoopChartBoss.classList.toggle('bg-slate-700', !isBoss);
      spoopChartBoss.classList.toggle('text-slate-300', !isBoss);
      spoopChartBoss.setAttribute('aria-selected', String(isBoss));
    }
    if (spoopChartSkill) {
      spoopChartSkill.classList.toggle('bg-sky-600', isSkill);
      spoopChartSkill.classList.toggle('text-white', isSkill);
      spoopChartSkill.classList.toggle('bg-slate-700', !isSkill);
      spoopChartSkill.classList.toggle('text-slate-300', !isSkill);
      spoopChartSkill.setAttribute('aria-selected', String(isSkill));
    }
    paintSpoopScoreChart();
  }
  if (spoopChartAll) spoopChartAll.addEventListener('click', () => setSpoopChartMode('all'));
  if (spoopChartBoss) spoopChartBoss.addEventListener('click', () => setSpoopChartMode('boss'));
  if (spoopChartSkill) spoopChartSkill.addEventListener('click', () => setSpoopChartMode('skill'));

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

  setHomeViewMode('last24');
  loadFromSnapshots();
})();
