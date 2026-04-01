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

  /** When "No Chuds" is on, exclude VDBL from leaderboards and SpoopScore. Default off = everyone included. */
  const NO_CHUDS_USERNAME = 'vdbl';
  let noChudsEnabled = false;
  function getDisplayCharacterList() {
    if (!noChudsEnabled) return characterList;
    return characterList.filter((u) => (u || '').toLowerCase() !== NO_CHUDS_USERNAME);
  }

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
  let lastWeekDeltas = {};
  let lastWeekLootLeaderboard = [];
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
  const settingsTestLeaderboardBtn = document.getElementById('settings-test-leaderboard-btn');
  const settingsTestLeaderboardFeedback = document.getElementById('settings-test-leaderboard-feedback');
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
      if (settingsTestLeaderboardFeedback) {
        settingsTestLeaderboardFeedback.classList.add('hidden');
        settingsTestLeaderboardFeedback.textContent = '';
      }
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
  if (settingsTestLeaderboardBtn && settingsTestLeaderboardFeedback) {
    settingsTestLeaderboardBtn.addEventListener('click', function () {
      settingsTestLeaderboardFeedback.classList.add('hidden');
      settingsTestLeaderboardFeedback.textContent = '';
      settingsTestLeaderboardBtn.disabled = true;
      fetch(API + '/test-leaderboard-webhook')
        .then((r) => r.json())
        .then((d) => {
          settingsTestLeaderboardBtn.disabled = false;
          settingsTestLeaderboardFeedback.classList.remove('hidden');
          if (d && d.ok) {
            settingsTestLeaderboardFeedback.textContent = 'Test message sent! Check your Discord channel.';
            settingsTestLeaderboardFeedback.classList.remove('text-red-400', 'text-amber-400');
            settingsTestLeaderboardFeedback.classList.add('text-sky-400');
          } else {
            settingsTestLeaderboardFeedback.textContent = d && d.error ? d.error : 'Failed to send test.';
            settingsTestLeaderboardFeedback.classList.remove('text-sky-400');
            settingsTestLeaderboardFeedback.classList.add('text-amber-400');
          }
        })
        .catch(function () {
          settingsTestLeaderboardBtn.disabled = false;
          settingsTestLeaderboardFeedback.classList.remove('hidden', 'text-sky-400');
          settingsTestLeaderboardFeedback.classList.add('text-red-400');
          settingsTestLeaderboardFeedback.textContent = 'Request failed. Check the console.';
        });
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
    if (!key) return '';
    const k = String(key).toLowerCase().trim().replace(/\s+/g, '_');
    if (k === 'gauntlet' || k === 'crystalline_hunllef') return 'Crystalline Hunllef';
    return (key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function bossImageSrc(bossKey) {
    if (!bossKey) return '';
    const overrides = {
      brutus: 'Brutus.png',
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
    const displayList = getDisplayCharacterList();
    const rows = displayList.map(username => {
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
    brutus: 0.5,
    wintertodt: 1, kraken: 1,
    tempoross: 2, bryophyta: 2, giant_mole: 2, giantmole: 2, hespori: 2, obor: 2, scurrius: 2, shellbane_gryphon: 2, shellbanegryphon: 2,
    amoxliatl: 3, barrows: 3, crazy_archaeologist: 3, crazyarchaeologist: 3, deranged_archaeologist: 3, derangedarchaeologist: 3, grotesque_guardians: 3, grotesqueguardians: 3, king_black_dragon: 3, kingblackdragon: 3, lunar_chests: 3, lunarchests: 3, tombs_of_amascut_entry_mode: 3, the_hueycoatl: 3, hueycoatl: 3, the_royal_titans: 3, royal_titans: 3, royaltitans: 3,
    dagannoth_prime: 4, dagannothprime: 4, dagannoth_rex: 4, dagannothrex: 4, dagannoth_supreme: 4, dagannothsupreme: 4, callisto: 4, chaos_fanatic: 4, chaosfanatic: 4, moons_of_peril: 4, skotizo: 4, sarachnis: 4,
    crystalline_hunllef: 5, gauntlet: 5, abyssal_sire: 5, abyssalsire: 5, araxxor: 5, cerberus: 5, chambers_of_xeric: 5, chambersofxeric: 5, commander_zilyana: 5, commanderzilyana: 5, duke_sucellus: 5, dukesucellus: 5, general_graardor: 5, generalgraardor: 5, krilsutsaroth: 5, kril_tsutsaroth: 5, kriltsutsaroth: 5, the_nightmare: 5, nightmare: 5, tombs_of_amascut: 5, tombsofamascut: 5, venenatis: 5, vorkath: 5, zalcano: 5, zulrah: 5, chaos_elemental: 5, chaoselemental: 5, scorpia: 5,
  kalphite_queen: 6, kalphitequeen: 6, kreearra: 6, corporeal_beast: 6, corporealbeast: 6, phantom_muspah: 6, phantommuspah: 6, thermonuclear_smoke_devil: 6, thermonuclearsmokedevil: 6, tztok_jad: 6, tztokjad: 6, vetion: 6, tombs_of_amascut_expert_mode: 8, tombsofamascutexpertmode: 8, alchemical_hydra: 6, alchemicalhydra: 6,
  corrupted_hunllef: 7, corruptedhunllef: 7, the_leviathan: 7, leviathan: 7, the_whisperer: 7, whisperer: 7, the_mimic: 7, mimic: 7, chambers_of_xeric_challenge_mode: 8, chambersofxericchallengemode: 8, vardorvis: 7, yama: 7,
  theatre_of_blood: 8, theatreofblood: 8, phosanis_nightmare: 8, phosanisnightmare: 8, nex: 8,
  tzhaar_ket_raks_challenges: 9,
  theatre_of_blood_hard_mode: 12,
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
  function buildScoringBossListHtml() {
    const byPts = {};
    Object.entries(BOSS_POINTS).forEach(([key, pts]) => {
      if (!byPts[pts]) byPts[pts] = [];
      const name = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      byPts[pts].push(name);
    });
    const sortedPts = Object.keys(byPts).map(Number).sort((a, b) => b - a);
    const lines = sortedPts.map((pts) => {
      const names = [...new Set(byPts[pts])].sort((a, b) => a.localeCompare(b));
      return pts + ' pt' + (pts !== 1 ? 's' : '') + ': ' + names.join(', ');
    });
    return lines.map((line) => '<div>' + escapeHtml(line) + '</div>').join('');
  }
  function openScoringModal(tab) {
    const overlay = document.getElementById('scoring-modal-overlay');
    const listEl = document.getElementById('scoring-boss-list');
    if (listEl) listEl.innerHTML = buildScoringBossListHtml();
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }
    setScoringTab(tab || 'boss');
  }
  function closeScoringModal() {
    const overlay = document.getElementById('scoring-modal-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }
  function setScoringTab(tab) {
    document.querySelectorAll('.scoring-tab').forEach((btn) => {
      const isActive = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('border-sky-500', isActive);
      btn.classList.toggle('border-transparent', !isActive);
      btn.classList.toggle('bg-slate-800', true);
      btn.classList.toggle('text-sky-400', isActive);
      btn.classList.toggle('text-slate-400', !isActive);
    });
    document.querySelectorAll('.scoring-tab-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== 'scoring-tab-' + tab);
    });
  }

  const POINTS_PER_10K_XP = 0.1;
  const SKILL_DIFFICULTY_RANK = {
    runecraft: 1, slayer: 2, agility: 3, mining: 4, woodcutting: 5, fishing: 6, smithing: 7,
    defence: 8, attack: 9, strength: 10, hitpoints: 11, ranged: 12, magic: 13, farming: 14,
    herblore: 15, crafting: 16, thieving: 17, hunter: 18, construction: 19, prayer: 20,
    firemaking: 21, cooking: 22, fletching: 23,
  };
  function getDifficultyBonusFor99(skillKey) {
    if (!skillKey || skillKey === 'overall') return 0;
    const rank = SKILL_DIFFICULTY_RANK[String(skillKey).toLowerCase()];
    if (rank == null) return 0;
    return Math.round(1000 - (700 * (rank - 1)) / 22);
  }
  function skillPointsForLevel(level, xp, skillKey) {
    const L = typeof level === 'number' && !Number.isNaN(level) ? Math.max(0, Math.min(99, Math.floor(level))) : 0;
    let pts = L * 15;
    if (L >= 40) pts += 5;
    if (L >= 50) pts += 10;
    if (L >= 60) pts += 25;
    if (L >= 70) pts += 100;
    if (L >= 80) pts += 200;
    if (L >= 90) pts += 300;
    if (L >= 93) pts += 600;
    if (L >= 99) pts += 3000;
    const xpNum = typeof xp === 'number' && !Number.isNaN(xp) ? Math.max(0, Math.floor(xp)) : (xp != null ? Math.max(0, Math.floor(Number(xp))) : 0);
    pts += Math.floor(xpNum / 10000) * POINTS_PER_10K_XP;
    if (L >= 99 && skillKey) pts += getDifficultyBonusFor99(skillKey);
    return pts;
  }
  function totalSkillingScore(skills) {
    if (!skills || typeof skills !== 'object') return 0;
    let totalLevel = 0;
    const sum = Object.entries(skills).reduce((acc, [key, s]) => {
      if (key === 'overall') return acc;
      if (!s || typeof s !== 'object') return acc;
      const level = s.level != null ? parseInt(s.level, 10) : NaN;
      if (!Number.isNaN(level) && level >= 0) totalLevel += level;
      const xp = s.xp != null ? s.xp : (s.experience != null ? s.experience : 0);
      return acc + skillPointsForLevel(level, xp, key);
    }, 0);
    const n = Math.floor(totalLevel / 100);
    const totalLevelBonus = (n * (n + 1)) / 2;
    return sum + totalLevelBonus;
  }

  /** SpoopScore bonus per pet (must match character.js). */
  const PET_POINTS = 4000;
  /** Username (lowercase) -> array of pet display names. Keep in sync with character.js CHARACTER_PETS. */
  const CHARACTER_PETS = {
    b7hund3r: ['Giant squirrel'],
    spoopspooply: ['Vorki'],
    legolad52: ['Vorki', 'Beef'],
    'roby pls': ['Chompy chick', 'Ikkle hydra', 'Nid', 'Rock golem', 'Skotos', 'Tzrek-jad'],
    newlinechar: ['Heron', 'Pet smoke devil'],
    player1817: ['Beef', 'Chompy chick', 'Giant squirrel', 'Herbi', 'Rocky', 'Tangleroot'],
    norgentgorge: ['Phoenix'],
    muddyewgoo: ['Rift guardian', 'Tiny tempor', 'Phoenix'],
  };
  function getPetsForCharacter(username) {
    if (!username) return [];
    const key = String(username).toLowerCase().trim();
    const list = CHARACTER_PETS[key];
    return Array.isArray(list) ? list : [];
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
    const displayList = getDisplayCharacterList();
    const rows = displayList.map((username) => ({ username, value: getValue(username) }));
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
    const displayList = getDisplayCharacterList();
    const rows = (displayList || []).map((username) => {
      const player = playerData[username];
      const bossScore = computeBossPointsForPeriod(null, player);
      const skillScore = totalSkillingScore(player && player.skills ? player.skills : {});
      const b = bossScore || 0;
      const s = skillScore || 0;
      const petPoints = getPetsForCharacter(username).length * PET_POINTS;
      return { username, spoopScore: b + s + petPoints, bossScore: b, skillScore: s, petPoints };
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
                const lines = [
                  'Total: ' + formatNum(ctx.raw),
                  'Boss: ' + formatNum(r.bossScore),
                  'Skill: ' + formatNum(r.skillScore),
                ];
                if (spoopChartMode === 'all' && r.petPoints > 0) lines.push('Pets: +' + formatNum(r.petPoints));
                return lines;
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

  function count99s(skills) {
    if (!skills || typeof skills !== 'object') return 0;
    return Object.entries(skills).filter(([key]) => key !== 'overall').filter(([, s]) => s && Number(s.level) === 99).length;
  }

  function render99CountLeaderboard() {
    const tbody = document.getElementById('leaderboard-99-tbody');
    const emptyEl = document.getElementById('leaderboard-99-empty');
    if (!tbody) return;
    const list = getDisplayCharacterList();
    const rows = list.map((username) => {
      const player = playerData[username];
      const count = count99s(player && player.skills ? player.skills : {});
      return { username, count };
    });
    rows.sort((a, b) => b.count - a.count);
    tbody.innerHTML = '';
    if (rows.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      tr.innerHTML = '<td class="px-4 py-2 text-slate-400">' + (i + 1) + '</td><td class="px-4 py-2"><a href="/character.html?name=' + encodeURIComponent(r.username) + '" class="text-sky-400 hover:underline">' + escapeHtml(r.username) + '</a></td><td class="px-4 py-2 text-right font-mono">' + formatNum(r.count) + '</td>';
      tbody.appendChild(tr);
    });
  }

  function renderBossDiversityLeaderboard() {
    const tbody = document.getElementById('leaderboard-diversity-tbody');
    const emptyEl = document.getElementById('leaderboard-diversity-empty');
    if (!tbody) return;
    const totalBosses = (bossKeys && bossKeys.length) ? bossKeys.length : 0;
    const list = getDisplayCharacterList();
    const rows = list.map((username) => {
      const player = playerData[username];
      const bosses = player && player.bosses ? player.bosses : {};
      const withKc = totalBosses ? bossKeys.filter((b) => (bosses[b] && Number(bosses[b].count) > 0)).length : 0;
      const pct = totalBosses > 0 ? (withKc / totalBosses * 100) : 0;
      return { username, pct, withKc, totalBosses };
    });
    rows.sort((a, b) => b.pct - a.pct);
    tbody.innerHTML = '';
    if (rows.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const pctText = totalBosses > 0 ? (Math.round(r.pct * 10) / 10).toFixed(1) + '%' : '—';
      tr.innerHTML = '<td class="px-4 py-2 text-slate-400">' + (i + 1) + '</td><td class="px-4 py-2"><a href="/character.html?name=' + encodeURIComponent(r.username) + '" class="text-sky-400 hover:underline">' + escapeHtml(r.username) + '</a></td><td class="px-4 py-2 text-right font-mono">' + pctText + '</td>';
      tbody.appendChild(tr);
    });
  }

  function renderWeeklyWinners() {
    const xpEl = document.getElementById('weekly-winner-xp-name');
    const bossEl = document.getElementById('weekly-winner-boss-name');
    const lootEl = document.getElementById('weekly-winner-loot-name');
    const xpWinner = characterList
      .map((u) => ({ username: u, xpDelta: (lastWeekDeltas[u] && lastWeekDeltas[u].xpDelta) || 0 }))
      .filter((r) => r.xpDelta > 0)
      .sort((a, b) => b.xpDelta - a.xpDelta)[0];
    const bossWinner = characterList
      .map((u) => ({ username: u, bossScoreDelta: (lastWeekDeltas[u] && lastWeekDeltas[u].bossScoreDelta) != null ? lastWeekDeltas[u].bossScoreDelta : (lastWeekDeltas[u] && lastWeekDeltas[u].bossKcDelta) || 0 }))
      .filter((r) => r.bossScoreDelta > 0)
      .sort((a, b) => b.bossScoreDelta - a.bossScoreDelta)[0];
    const lootWinner = lastWeekLootLeaderboard[0];
    if (xpEl) xpEl.textContent = xpWinner ? xpWinner.username : '—';
    if (bossEl) bossEl.textContent = bossWinner ? bossWinner.username : '—';
    if (lootEl) lootEl.textContent = lootWinner && lootWinner.username ? lootWinner.username : '—';
  }

  function renderRight() {
    rightLoading.classList.add('hidden');
    rightTbody.innerHTML = '';
    const bossKey = (filterRightBoss && filterRightBoss.value) || '';
    const isDelta = homeViewMode === 'last24' || homeViewMode === 'today' || homeViewMode === 'week' || homeViewMode === 'month';
    const deltaSource = homeViewMode === 'today' ? todayDeltas : (homeViewMode === 'week' ? weekDeltas : (homeViewMode === 'month' ? monthDeltas : last24hDeltas));
    if (rightTitle) rightTitle.textContent = bossKey ? formatBossKey(bossKey) : 'Boss score';
    if (rightValueTh) {
      rightValueTh.textContent = homeViewMode === 'today'
        ? (bossKey ? formatBossKey(bossKey) + ' (today)' : 'Today')
        : homeViewMode === 'week'
          ? (bossKey ? formatBossKey(bossKey) + ' (this week)' : 'This Week')
          : homeViewMode === 'month'
            ? (bossKey ? formatBossKey(bossKey) + ' (this month)' : 'This Month')
            : (homeViewMode === 'last24'
              ? (bossKey ? formatBossKey(bossKey) + ' (24h)' : 'Last 24 Hr')
              : (bossKey ? formatBossKey(bossKey) : 'Total score'));
    }
    const rows = getDisplayCharacterList().map(username => {
      const d = deltaSource[username];
      const player = playerData[username];
      const bossScoreDelta = (d && d.bossScoreDelta != null) ? d.bossScoreDelta : 0;
      const kcDelta = isDelta && d && bossKey && d.bossDeltas && bossKey in d.bossDeltas ? d.bossDeltas[bossKey] : (bossKey ? null : bossScoreDelta);
      const bossPoints = bossKey
        ? (isDelta ? computeBossPointsForPeriod(d, null) : computeBossPointsForPeriod(null, player))
        : (isDelta ? bossScoreDelta : computeBossPointsForPeriod(null, player));
      const rawKc = !bossKey ? (isDelta ? (d && (d.bossKcDelta != null ? d.bossKcDelta : 0) || 0) : (player ? totalBossKc(player) : 0)) : 0;
      return {
        username,
        kc: getRightBossKc(player, bossKey),
        kcDelta: kcDelta != null ? kcDelta : 0,
        bossPoints,
        rawKc,
      };
    });
    if (isDelta) {
      rows.sort((a, b) => (bossKey ? (b.kcDelta - a.kcDelta) : (b.bossPoints - a.bossPoints)));
    } else {
      rows.sort((a, b) => (bossKey ? (b.kc - a.kc) : (b.bossPoints - a.bossPoints)));
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/70 hover:bg-slate-700/30';
      const showScore = !bossKey;
      const kcDisplay = isDelta
        ? (showScore ? (r.bossPoints != null && r.bossPoints > 0 ? `<span class="text-green-400 font-mono">+${formatNum(r.bossPoints)}</span>` : '—') : (r.kcDelta != null && r.kcDelta > 0 ? `<span class="text-green-400 font-mono">+${formatNum(r.kcDelta)}</span>` : '—'))
        : (showScore ? formatNum(r.bossPoints) : formatNum(r.kc));
      let pointsSuffix = (bossKey && typeof r.bossPoints === 'number') ? ` <span class="text-slate-400 font-mono">(${formatNum(r.bossPoints)} pts)</span>` : '';
      if (showScore && r.rawKc != null && (isDelta ? r.rawKc > 0 : true)) {
        pointsSuffix += ` <span class="text-slate-400 font-mono">(${formatNum(r.rawKc)} KC)</span>`;
      }
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
        .map(([k, v]) => {
          const delta = Number(v) || 0;
          const pts = BOSS_POINTS[normalizeBossKeyForPoints(k)] || 0;
          const pointsGain = delta * pts + (delta >= 1 ? FIRST_KILL_BONUS : 0);
          return { key: k, delta, pointsGain };
        })
        .filter((e) => e.delta > 0)
        .sort((a, b) => b.pointsGain - a.pointsGain)
        .slice(0, 3);
      if (entries.length === 0) return '<div class="text-slate-400">No boss kills ' + (isToday ? 'today' : (isWeek ? 'this week' : (isMonth ? 'this month' : 'in last 24h'))) + '</div>';
      const header = '<div class="font-semibold text-slate-300 mb-1.5">Top 3 bosses (' + periodLabel + ')</div>';
      return header + entries.map((e) => {
        const icon = bossImageSrc(e.key);
        const name = escapeHtml(formatBossKey(e.key));
        const val = '+' + formatNum(e.pointsGain) + ' pts <span class="text-slate-400">(+' + formatNum(e.delta) + ' KC)</span>';
        return '<div class="flex items-center gap-2 py-0.5"><img src="' + escapeHtml(icon) + '" alt="" class="w-4 h-4 shrink-0 object-contain rounded-sm" width="16" height="16" loading="lazy" onerror="this.style.display=\'none\'"><span class="flex-1 text-left">' + name + '</span><span class="text-right tabular-nums text-green-400/90">' + val + '</span></div>';
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
    lootTopDropsCache = {};
    leftLoading.classList.remove('hidden');
    rightLoading.classList.remove('hidden');
    if (lootLoading) lootLoading.classList.remove('hidden');
    leftTbody.innerHTML = '';
    rightTbody.innerHTML = '';
    if (lootTbody) lootTbody.innerHTML = '';
    try {
      const [dataRes, deltasRes, deltasTodayRes, deltasWeekRes, deltasMonthRes, deltasLastWeekRes, lootTotalRes, loot24Res, lootTodayRes, lootWeekRes, lootMonthRes, lootLastWeekRes] = await Promise.all([
        fetch(API + '/characters-with-snapshots'),
        fetch(API + '/characters-deltas?hours=24'),
        fetch(API + '/characters-deltas?today=1'),
        fetch(API + '/characters-deltas?week=1'),
        fetch(API + '/characters-deltas?month=1'),
        fetch(API + '/characters-deltas?lastWeek=1'),
        fetch(API + '/loot?leaderboard=1'),
        fetch(API + '/loot?leaderboard=1&hours=24'),
        fetch(API + '/loot?leaderboard=1&today=1'),
        fetch(API + '/loot?leaderboard=1&week=1'),
        fetch(API + '/loot?leaderboard=1&month=1'),
        fetch(API + '/loot?leaderboard=1&lastWeek=1'),
      ]);
      if (!dataRes.ok) throw new Error('Failed to load data');
      const data = await dataRes.json();
      const deltasData = await deltasRes.json().catch(() => ({}));
      const deltasTodayData = await deltasTodayRes.json().catch(() => ({}));
      const deltasWeekData = await deltasWeekRes.json().catch(() => ({}));
      const deltasMonthData = await deltasMonthRes.json().catch(() => ({}));
      const deltasLastWeekData = await deltasLastWeekRes.json().catch(() => ({}));
      last24hDeltas = {};
      (deltasData.deltas || []).forEach((d) => {
        last24hDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          bossScoreDelta: d.bossScoreDelta != null ? d.bossScoreDelta : (d.bossKcDelta || 0),
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      todayDeltas = {};
      (deltasTodayData.deltas || []).forEach((d) => {
        todayDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          bossScoreDelta: d.bossScoreDelta != null ? d.bossScoreDelta : (d.bossKcDelta || 0),
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      weekDeltas = {};
      (deltasWeekData.deltas || []).forEach((d) => {
        weekDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          bossScoreDelta: d.bossScoreDelta != null ? d.bossScoreDelta : (d.bossKcDelta || 0),
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      monthDeltas = {};
      (deltasMonthData.deltas || []).forEach((d) => {
        monthDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          bossScoreDelta: d.bossScoreDelta != null ? d.bossScoreDelta : (d.bossKcDelta || 0),
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      lastWeekDeltas = {};
      (deltasLastWeekData.deltas || []).forEach((d) => {
        lastWeekDeltas[d.username] = {
          xpDelta: d.xpDelta,
          bossKcDelta: d.bossKcDelta,
          bossScoreDelta: d.bossScoreDelta != null ? d.bossScoreDelta : (d.bossKcDelta || 0),
          skillDeltas: d.skillDeltas || {},
          bossDeltas: d.bossDeltas || {},
        };
      });
      const lootLastWeekData = await lootLastWeekRes.json().catch(() => ({}));
      lastWeekLootLeaderboard = Array.isArray(lootLastWeekData.players) ? lootLastWeekData.players : [];
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
      render99CountLeaderboard();
      renderBossDiversityLeaderboard();
      renderWeeklyWinners();
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

  /** Parse xp_kc description "+1.5M overall XP, +3 vorkath, +1 zulrah" into one inline row: XP, vertical separator(s), boss items with icons. */
  function formatXpKcActivityDescription(description) {
    const desc = (description || '').trim();
    if (!desc) return '<span class="text-slate-500">—</span>';
    const parts = desc.split(/\s*,\s*/);
    let xpPart = null;
    const bossParts = [];
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.endsWith(' overall XP')) {
        xpPart = trimmed;
      } else {
        const m = trimmed.match(/^\+(\d+)\s+(.+)$/);
        if (m) bossParts.push({ delta: m[1], key: m[2].trim() });
      }
    }
    const vSep = '<span class="border-l border-sky-400/70 h-4 mx-2 inline-block align-middle shrink-0" aria-hidden="true"></span>';
    const segs = [];
    if (xpPart) {
      segs.push('<span class="text-slate-300 whitespace-nowrap">' + escapeHtml(xpPart) + '</span>');
    }
    if (bossParts.length > 0) {
      if (xpPart) segs.push(vSep);
      const bossItems = bossParts.map(function (b) {
        const src = bossImageSrc(b.key);
        const name = formatBossKey(b.key);
        return '<span class="inline-flex items-center gap-1.5 align-middle shrink-0"><span class="text-green-400 font-medium tabular-nums">+' + escapeHtml(b.delta) + '</span> <img src="' + escapeHtml(src) + '" alt="" title="' + escapeHtml(name) + '" class="w-5 h-5 object-contain rounded-sm shrink-0" width="20" height="20" loading="lazy" onerror="this.style.display=\'none\'"></span>';
      }).join(vSep);
      segs.push(bossItems);
    }
    return segs.length ? '<span class="inline-flex flex-nowrap items-center gap-0">' + segs.join('') + '</span>' : '<span class="text-slate-500">—</span>';
  }

  /** Parse loot description "Item (1.2M gp) from Vorkath" -> { source: 'Vorkath', gp: 1200000 }. Returns null if not loot or no parse. */
  function parseLootDescription(description) {
    if (!description || typeof description !== 'string') return null;
    const fromMatch = description.match(/\s+from\s+(.+)$/);
    const source = fromMatch ? fromMatch[1].trim() : null;
    const gpMatch = description.match(/\(([^)]+)\s*gp\)/);
    if (!gpMatch) return source != null ? { source, gp: 0 } : null;
    const gpStr = gpMatch[1].replace(/\s/g, '').toUpperCase();
    let gp = 0;
    if (gpStr.endsWith('B')) gp = parseFloat(gpStr, 10) * 1e9;
    else if (gpStr.endsWith('M')) gp = parseFloat(gpStr, 10) * 1e6;
    else if (gpStr.endsWith('K')) gp = parseFloat(gpStr, 10) * 1e3;
    else gp = parseFloat(gpStr, 10) || 0;
    return { source: source || null, gp: Number.isFinite(gp) ? gp : 0 };
  }

  /** Group consecutive activity entries: same type (loot), same username, same source (from description). Single entries stay as-is. */
  function groupConsecutiveLoot(activity) {
    if (!activity || activity.length === 0) return [];
    const out = [];
    let i = 0;
    while (i < activity.length) {
      const a = activity[i];
      if (a.type !== 'loot') {
        out.push({ ...a, grouped: false });
        i++;
        continue;
      }
      const parsed = parseLootDescription(a.description);
      if (!parsed || !parsed.source) {
        out.push({ ...a, grouped: false });
        i++;
        continue;
      }
      const group = [a];
      let totalGp = parsed.gp;
      let j = i + 1;
      while (j < activity.length) {
        const b = activity[j];
        if (b.type !== 'loot' || (b.username || '').trim() !== (a.username || '').trim()) break;
        const bParsed = parseLootDescription(b.description);
        if (!bParsed || bParsed.source !== parsed.source) break;
        group.push(b);
        totalGp += bParsed.gp;
        j++;
      }
      if (group.length > 1) {
        out.push({
          type: 'loot',
          username: a.username,
          at: group[0].at,
          grouped: true,
          count: group.length,
          source: parsed.source,
          totalGp,
        });
      } else {
        out.push({ ...a, grouped: false });
      }
      i = j;
    }
    return out;
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
    const grouped = groupConsecutiveLoot(activity);
    const typeLabel = (t) => (t === 'loot' ? 'Loot' : 'XP/KC');
    const typeBadgeClass = (t) => (t === 'loot' ? 'activity-badge activity-badge-loot' : 'activity-badge activity-badge-xpkc');
    const typeIcon = (t) => (t === 'loot'
      ? '<img src="/assets/Coins_4.webp" alt="" width="12" height="12" loading="lazy" />'
      : '<img src="/assets/Skills_icon.png" alt="" width="12" height="12" loading="lazy" />');
    const deletedSuffix = ' — Deleted by user';
    const formatGroupGp = (gp) => (gp >= 1e6 ? (gp / 1e6).toFixed(1) + 'M' : (gp >= 1e3 ? Math.round(gp / 1e3) + 'k' : String(Math.round(gp))));
    tbody.innerHTML = grouped.map((a) => {
      const time = formatActivityTime(a.at);
      const badge = '<span class="' + typeBadgeClass(a.type) + '">' + typeIcon(a.type) + '<span>' + typeLabel(a.type) + '</span></span>';
      let descriptionHtml;
      if (a.grouped === true && a.type === 'loot') {
        const text = a.count + ' ' + (a.source || '') + ' kills, bagging ' + formatGroupGp(a.totalGp) + ' gp loot';
        descriptionHtml = '<span class="text-slate-300">' + (text.replace(/</g, '&lt;')) + '</span>';
      } else if (a.type === 'xp_kc') {
        descriptionHtml = formatXpKcActivityDescription(a.description);
      } else {
        const desc = (a.description || '').replace(/</g, '&lt;');
        const deletedIdx = desc.indexOf(deletedSuffix);
        if (deletedIdx !== -1) {
          const mainPart = desc.slice(0, deletedIdx);
          const suffixPart = desc.slice(deletedIdx);
          descriptionHtml = '<span class="text-slate-300"><s class="text-slate-500">' + mainPart + '</s><span class="text-slate-500">' + suffixPart + '</span></span>';
        } else {
          descriptionHtml = '<span class="text-slate-300">' + desc + '</span>';
        }
      }
      return '<tr class="border-b border-slate-700/70 hover:bg-slate-700/30">' +
        '<td class="px-4 py-2 text-slate-400 whitespace-nowrap">' + time + '</td>' +
        '<td class="px-4 py-2 font-medium">' + (a.username || '—') + '</td>' +
        '<td class="px-4 py-2 whitespace-nowrap align-middle">' + badge + ' <span class="inline align-middle">' + descriptionHtml + '</span></td>' +
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
            bossScoreDelta: d.bossScoreDelta != null ? d.bossScoreDelta : (d.bossKcDelta || 0),
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
      render99CountLeaderboard();
      renderBossDiversityLeaderboard();
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
    if (bossLabelEl) bossLabelEl.textContent = isDelta ? 'Boss score' : 'Boss score (all characters)';
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
      const sumXp = Object.entries(todayDeltas).filter(([u]) => !noChudsEnabled || u.toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, [, d]) => s + (Number(d.xpDelta) || 0), 0);
      const sumBoss = Object.entries(todayDeltas).filter(([u]) => !noChudsEnabled || u.toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, [, d]) => s + (Number(d.bossScoreDelta != null ? d.bossScoreDelta : d.bossKcDelta) || 0), 0);
      const sumLoot = lootLeaderboardToday.filter((p) => !noChudsEnabled || (p.username || '').toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(sumXp).toLocaleString() + ' XP (today)';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(sumBoss).toLocaleString() + ' pts (today)';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp (today)';
    } else if (isWeek) {
      const sumXp = Object.entries(weekDeltas).filter(([u]) => !noChudsEnabled || u.toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, [, d]) => s + (Number(d.xpDelta) || 0), 0);
      const sumBoss = Object.entries(weekDeltas).filter(([u]) => !noChudsEnabled || u.toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, [, d]) => s + (Number(d.bossScoreDelta != null ? d.bossScoreDelta : d.bossKcDelta) || 0), 0);
      const sumLoot = lootLeaderboardWeek.filter((p) => !noChudsEnabled || (p.username || '').toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(sumXp).toLocaleString() + ' XP (this week)';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(sumBoss).toLocaleString() + ' pts (this week)';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp (this week)';
    } else if (isMonth) {
      const sumXp = Object.entries(monthDeltas).filter(([u]) => !noChudsEnabled || u.toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, [, d]) => s + (Number(d.xpDelta) || 0), 0);
      const sumBoss = Object.entries(monthDeltas).filter(([u]) => !noChudsEnabled || u.toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, [, d]) => s + (Number(d.bossScoreDelta != null ? d.bossScoreDelta : d.bossKcDelta) || 0), 0);
      const sumLoot = lootLeaderboardMonth.filter((p) => !noChudsEnabled || (p.username || '').toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(sumXp).toLocaleString() + ' XP (this month)';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(sumBoss).toLocaleString() + ' pts (this month)';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp (this month)';
    } else if (isLast24) {
      const sumXp = Object.entries(last24hDeltas).filter(([u]) => !noChudsEnabled || u.toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, [, d]) => s + (Number(d.xpDelta) || 0), 0);
      const sumBoss = Object.entries(last24hDeltas).filter(([u]) => !noChudsEnabled || u.toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, [, d]) => s + (Number(d.bossScoreDelta != null ? d.bossScoreDelta : d.bossKcDelta) || 0), 0);
      const sumLoot = lootLeaderboard24.filter((p) => !noChudsEnabled || (p.username || '').toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
      if (xpTotalEl) xpTotalEl.textContent = Math.round(sumXp).toLocaleString() + ' XP (24h)';
      if (bossTotalEl) bossTotalEl.textContent = Math.round(sumBoss).toLocaleString() + ' pts (24h)';
      if (lootTotalEl) lootTotalEl.textContent = (sumLoot >= 1e6 ? (sumLoot / 1e6).toFixed(2) + 'M' : formatNum(sumLoot)) + ' gp (24h)';
    } else {
      const sumLoot = lootLeaderboardTotal.filter((p) => !noChudsEnabled || (p.username || '').toLowerCase() !== NO_CHUDS_USERNAME).reduce((s, p) => s + (Number(p.totalValueGp) || 0), 0);
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

  const noChudsToggle = document.getElementById('no-chuds-toggle');
  if (noChudsToggle) {
    noChudsToggle.addEventListener('change', function () {
      noChudsEnabled = noChudsToggle.checked;
      noChudsToggle.setAttribute('aria-checked', String(noChudsEnabled));
      renderLeft();
      renderRight();
      renderLoot();
      paintSpoopScoreChart();
      render99CountLeaderboard();
      renderBossDiversityLeaderboard();
      renderWeeklyWinners();
      if (homeViewMode === 'today' && cachedHomeHistoryToday != null) {
        paintHomeCharts(cachedHomeHistoryToday, 'today', cachedLootHistoryToday);
      } else if (homeViewMode === 'week' && cachedHomeHistoryWeek != null) {
        paintHomeCharts(cachedHomeHistoryWeek, 'week', cachedLootHistoryWeek);
      } else if (homeViewMode === 'month' && cachedHomeHistoryMonth != null) {
        paintHomeCharts(cachedHomeHistoryMonth, 'month', cachedLootHistoryMonth);
      } else if (cachedHomeHistory) {
        paintHomeCharts(cachedHomeHistory, homeViewMode, cachedLootHistory);
      }
    });
  }

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

  const spoopWtfLink = document.getElementById('spoop-wtf-link');
  if (spoopWtfLink) spoopWtfLink.addEventListener('click', () => openScoringModal('boss'));
  const scoringModalClose = document.getElementById('scoring-modal-close');
  if (scoringModalClose) scoringModalClose.addEventListener('click', closeScoringModal);
  const scoringOverlay = document.getElementById('scoring-modal-overlay');
  if (scoringOverlay) scoringOverlay.addEventListener('click', function (e) {
    if (e.target === scoringOverlay) closeScoringModal();
  });
  document.querySelectorAll('.scoring-tab').forEach((btn) => {
    btn.addEventListener('click', function () { setScoringTab(this.getAttribute('data-tab')); });
  });

  const bossDiversityWtfLink = document.getElementById('boss-diversity-wtf-link');
  const bossDiversityModalOverlay = document.getElementById('boss-diversity-modal-overlay');
  const bossDiversityModalClose = document.getElementById('boss-diversity-modal-close');
  if (bossDiversityWtfLink && bossDiversityModalOverlay) {
    bossDiversityWtfLink.addEventListener('click', function () {
      bossDiversityModalOverlay.classList.remove('hidden');
      bossDiversityModalOverlay.setAttribute('aria-hidden', 'false');
    });
  }
  if (bossDiversityModalClose) bossDiversityModalClose.addEventListener('click', function () {
    if (bossDiversityModalOverlay) {
      bossDiversityModalOverlay.classList.add('hidden');
      bossDiversityModalOverlay.setAttribute('aria-hidden', 'true');
    }
  });
  if (bossDiversityModalOverlay) bossDiversityModalOverlay.addEventListener('click', function (e) {
    if (e.target === bossDiversityModalOverlay) {
      bossDiversityModalOverlay.classList.add('hidden');
      bossDiversityModalOverlay.setAttribute('aria-hidden', 'true');
    }
  });

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

  (function setupRaidLootHandout() {
    const RAID_STORAGE_KEY = 'spooptool_raid_handout_unlocked';
    const RAID_PWD_STORAGE_KEY = 'spooptool_raid_handout_pwd';
    const modal = document.getElementById('raid-loot-handout-modal');
    const passwordView = document.getElementById('raid-handout-password-view');
    const formView = document.getElementById('raid-handout-form-view');
    const passwordInput = document.getElementById('raid-handout-password');
    const passwordError = document.getElementById('raid-handout-password-error');
    const unlockBtn = document.getElementById('raid-handout-unlock');
    const itemSelect = document.getElementById('raid-handout-item');
    const itemValueEl = document.getElementById('raid-handout-item-value');
    const primarySelect = document.getElementById('raid-handout-primary');
    const atInput = document.getElementById('raid-handout-at');
    const splitCheckbox = document.getElementById('raid-handout-split');
    const splitSection = document.getElementById('raid-handout-split-section');
    const partnersContainer = document.getElementById('raid-handout-partners');
    const addPartnerBtn = document.getElementById('raid-handout-add-partner');
    const splitTotalEl = document.getElementById('raid-handout-split-total');
    const submitErrorEl = document.getElementById('raid-handout-submit-error');
    const confirmBtn = document.getElementById('raid-handout-confirm');
    const cancelBtn = document.getElementById('raid-handout-cancel');
    const confirmDialog = document.getElementById('raid-handout-confirm-dialog');
    const confirmText = document.getElementById('raid-handout-confirm-text');
    const confirmNo = document.getElementById('raid-handout-confirm-no');
    const confirmYes = document.getElementById('raid-handout-confirm-yes');
    const headerMenuDropdown = document.getElementById('header-menu-dropdown');

    let raidHandoutItems = [];
    let raidHandoutPassword = '';

    function formatGp(n) {
      if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return String(n);
    }

    function closeRaidHandoutModal() {
      if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
      }
      if (headerMenuDropdown) headerMenuDropdown.classList.add('hidden');
    }

    function showFormView() {
      if (passwordView) passwordView.classList.add('hidden');
      if (formView) formView.classList.remove('hidden');
      populateRaidHandoutForm();
    }

    function populateRaidHandoutForm() {
      if (!itemSelect || !primarySelect) return;
      itemSelect.innerHTML = '<option value="">Select item…</option>';
      raidHandoutItems.forEach((it, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = it.name + ' (' + it.raid + ') — ' + formatGp(it.valueGp) + ' gp';
        itemSelect.appendChild(opt);
      });
      itemValueEl.textContent = '';
      primarySelect.innerHTML = '<option value="">Select player…</option>';
      const list = characterList && characterList.length ? characterList : [];
      list.forEach((u) => {
        const opt = document.createElement('option');
        opt.value = typeof u === 'string' ? u : (u && u.username) || '';
        opt.textContent = opt.value || '—';
        primarySelect.appendChild(opt);
      });
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const h = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      if (atInput) atInput.value = y + '-' + m + '-' + d + 'T' + h + ':' + min;
      if (splitCheckbox) splitCheckbox.checked = false;
      if (splitSection) splitSection.classList.add('hidden');
      partnersContainer.innerHTML = '';
      updateSplitTotal();
    }

    function updateItemValue() {
      const idx = parseInt(itemSelect.value, 10);
      if (Number.isNaN(idx) || idx < 0 || !raidHandoutItems[idx]) {
        itemValueEl.textContent = '';
        return;
      }
      itemValueEl.textContent = 'Value: ' + formatGp(raidHandoutItems[idx].valueGp) + ' gp';
    }

    function addPartnerRow() {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 flex-wrap';
      const sel = document.createElement('select');
      sel.className = 'flex-1 min-w-[100px] px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-sm';
      sel.innerHTML = '<option value="">Unknown</option>';
      (characterList || []).forEach((u) => {
        const un = typeof u === 'string' ? u : (u && u.username) || '';
        if (un) {
          const o = document.createElement('option');
          o.value = un;
          o.textContent = un;
          sel.appendChild(o);
        }
      });
      const pct = document.createElement('input');
      pct.type = 'number';
      pct.min = 0;
      pct.max = 100;
      pct.step = 0.5;
      pct.placeholder = '%';
      pct.className = 'w-16 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-sm';
      const preview = document.createElement('span');
      preview.className = 'text-xs text-slate-500';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.className = 'text-red-400 hover:text-red-300 text-xs';
      function updatePreview() {
        const val = raidHandoutItems[parseInt(itemSelect.value, 10)];
        const v = val ? val.valueGp : 0;
        const p = parseFloat(pct.value, 10) || 0;
        preview.textContent = p ? formatGp(Math.floor((v * p) / 100)) + ' gp' : '';
      }
      pct.addEventListener('input', function () {
        updatePreview();
        updateSplitTotal();
      });
      row.appendChild(sel);
      row.appendChild(pct);
      row.appendChild(preview);
      row.appendChild(remove);
      partnersContainer.appendChild(row);
      remove.addEventListener('click', function () {
        row.remove();
        updateSplitTotal();
      });
      updatePreview();
      updateSplitTotal();
    }

    function getPrimaryPercent() {
      if (!splitCheckbox || !splitCheckbox.checked) return 100;
      const rows = partnersContainer.querySelectorAll('.flex.items-center.gap-2');
      let partnerSum = 0;
      rows.forEach((r) => {
        const inp = r.querySelector('input[type="number"]');
        if (inp) partnerSum += parseFloat(inp.value, 10) || 0;
      });
      return Math.max(0, Math.min(100, 100 - partnerSum));
    }

    function updateSplitTotal() {
      const primaryP = getPrimaryPercent();
      const rows = partnersContainer.querySelectorAll('.flex.items-center.gap-2');
      let partnerSum = 0;
      rows.forEach((r) => {
        const inp = r.querySelector('input[type="number"]');
        if (inp) partnerSum += parseFloat(inp.value, 10) || 0;
      });
      const total = primaryP + partnerSum;
      const ok = Math.abs(total - 100) < 0.01;
      if (splitTotalEl) {
        splitTotalEl.textContent = 'Primary: ' + primaryP + '% + partners: ' + partnerSum + '% = ' + total + '%' + (ok ? ' ✓' : ' (must be 100%)');
        splitTotalEl.classList.toggle('text-red-400', !ok);
        splitTotalEl.classList.toggle('text-slate-500', ok);
      }
    }

    function buildHandoutPayload() {
      const idx = parseInt(itemSelect.value, 10);
      const item = Number.isNaN(idx) || idx < 0 ? null : raidHandoutItems[idx];
      const primary = (primarySelect.value || '').trim();
      if (!item || !primary) return null;
      const atVal = atInput.value ? new Date(atInput.value) : new Date();
      const primaryPercent = getPrimaryPercent();
      const partners = [];
      partnersContainer.querySelectorAll('.flex.items-center.gap-2').forEach((r) => {
        const sel = r.querySelector('select');
        const inp = r.querySelector('input[type="number"]');
        const p = parseFloat(inp && inp.value, 10) || 0;
        if (p <= 0) return;
        partners.push({ username: (sel && sel.value) || null, percent: p });
      });
      return {
        password: raidHandoutPassword,
        itemName: item.name,
        valueGp: item.valueGp,
        primaryUsername: primary,
        primaryPercent: primaryPercent,
        at: atVal.toISOString(),
        splitPartners: partners,
      };
    }

    function buildConfirmMessage() {
      const idx = parseInt(itemSelect.value, 10);
      const item = Number.isNaN(idx) || idx < 0 ? null : raidHandoutItems[idx];
      const primary = (primarySelect.value || '').trim();
      if (!item || !primary) return '';
      const atVal = atInput.value ? new Date(atInput.value) : new Date();
      const dateStr = atVal.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
      const names = [primary];
      partnersContainer.querySelectorAll('.flex.items-center.gap-2').forEach((r) => {
        const sel = r.querySelector('select');
        const un = (sel && sel.value) || 'Unknown';
        if (un && !names.includes(un)) names.push(un);
      });
      return 'Record drop: ' + item.name + ' (' + formatGp(item.valueGp) + ' gp) to ' + names.join(', ') + ' on ' + dateStr + '?';
    }

    document.getElementById('btn-raid-loot-handout').addEventListener('click', async function () {
      if (headerMenuDropdown) headerMenuDropdown.classList.add('hidden');
      if (!modal) return;
      const unlocked = sessionStorage.getItem(RAID_STORAGE_KEY) === '1';
      if (unlocked) {
        try { raidHandoutPassword = sessionStorage.getItem(RAID_PWD_STORAGE_KEY) || ''; } catch (_) {}
        showFormView();
      } else {
        if (passwordView) passwordView.classList.remove('hidden');
        if (formView) formView.classList.add('hidden');
        if (passwordInput) passwordInput.value = '';
        if (passwordError) { passwordError.classList.add('hidden'); passwordError.textContent = ''; }
      }
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      if (!unlocked) passwordInput.focus();
      if (raidHandoutItems.length === 0) {
        try {
          const r = await fetch(API + '/raid-loot-handout');
          const data = await r.json().catch(() => ({}));
          raidHandoutItems = (data.items || []).slice();
          if (unlocked) showFormView();
        } catch (_) {}
      } else if (unlocked) {
        showFormView();
      }
    });

    unlockBtn.addEventListener('click', async function () {
      const pwd = (passwordInput.value || '').trim();
      if (!pwd) {
        passwordError.textContent = 'Enter password';
        passwordError.classList.remove('hidden');
        return;
      }
      passwordError.classList.add('hidden');
      try {
        const res = await fetch(API + '/raid-loot-handout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd, raidUnlock: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.ok === true) {
          raidHandoutPassword = pwd;
          sessionStorage.setItem(RAID_STORAGE_KEY, '1');
          try { sessionStorage.setItem(RAID_PWD_STORAGE_KEY, pwd); } catch (_) {}
          showFormView();
        } else {
          passwordError.textContent = 'Invalid password';
          passwordError.classList.remove('hidden');
        }
      } catch (e) {
        passwordError.textContent = e.message || 'Request failed';
        passwordError.classList.remove('hidden');
      }
    });

    passwordInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') unlockBtn.click();
    });

    itemSelect.addEventListener('change', updateItemValue);
    splitCheckbox.addEventListener('change', function () {
      splitSection.classList.toggle('hidden', !splitCheckbox.checked);
      updateSplitTotal();
    });
    addPartnerBtn.addEventListener('click', addPartnerRow);

    cancelBtn.addEventListener('click', closeRaidHandoutModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeRaidHandoutModal();
    });

    confirmBtn.addEventListener('click', function () {
      const payload = buildHandoutPayload();
      if (!payload) {
        submitErrorEl.textContent = 'Select an item and primary player.';
        submitErrorEl.classList.remove('hidden');
        return;
      }
      if (splitCheckbox.checked) {
        const total = getPrimaryPercent() + payload.splitPartners.reduce((s, p) => s + p.percent, 0);
        if (Math.abs(total - 100) > 0.01) {
          submitErrorEl.textContent = 'Split total must equal 100%.';
          submitErrorEl.classList.remove('hidden');
          return;
        }
      }
      submitErrorEl.classList.add('hidden');
      confirmText.textContent = buildConfirmMessage();
      confirmDialog.classList.remove('hidden');
      confirmDialog.setAttribute('aria-hidden', 'false');
    });

    confirmNo.addEventListener('click', function () {
      confirmDialog.classList.add('hidden');
      confirmDialog.setAttribute('aria-hidden', 'true');
    });
    confirmDialog.addEventListener('click', function (e) {
      if (e.target === confirmDialog) {
        confirmDialog.classList.add('hidden');
        confirmDialog.setAttribute('aria-hidden', 'true');
      }
    });

    confirmYes.addEventListener('click', async function () {
      const payload = buildHandoutPayload();
      if (!payload) return;
      if (!raidHandoutPassword) {
        try { raidHandoutPassword = sessionStorage.getItem(RAID_PWD_STORAGE_KEY) || ''; } catch (_) {}
      }
      if (!raidHandoutPassword) {
        submitErrorEl.textContent = 'Password required. Unlock again and try recording.';
        submitErrorEl.classList.remove('hidden');
        confirmDialog.classList.add('hidden');
        return;
      }
      payload.password = raidHandoutPassword;
      confirmDialog.classList.add('hidden');
      submitErrorEl.classList.add('hidden');
      try {
        const res = await fetch(API + '/raid-loot-handout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          submitErrorEl.textContent = data.error || 'Failed to record drop';
          submitErrorEl.classList.remove('hidden');
          return;
        }
        closeRaidHandoutModal();
        loadFromSnapshots();
      } catch (e) {
        submitErrorEl.textContent = e.message || 'Request failed';
        submitErrorEl.classList.remove('hidden');
      }
    });
  })();

  setHomeViewMode('last24');
  loadFromSnapshots();
})();
