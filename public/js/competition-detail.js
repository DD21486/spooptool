// competition-detail.js — all behaviour for competition-detail.html.
// Reads ?id= from the URL and renders mock competition data.
// In production the mock data would be replaced with a fetch to /api/competitions/:id.

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Mock competition data ─────────────────────────────────────────────────────
// Keyed by competition ID (string). Replace with API fetch once DB is wired up.

var now = Date.now();
var DAY = 24 * 60 * 60 * 1000;

var MOCK_COMPETITIONS = {
  '1': {
    id: '1',
    name: 'Summer Woodcutting Race',
    type: 'team',
    category: 'skill',
    metric: 'xp',           // 'xp' | 'ehp' | 'kill-count' | 'ehb'
    skillScope: 'specific', // 'total' | 'specific'
    skill: 'Woodcutting',
    sameSkillForAll: true,
    startTime: new Date(now - 2 * DAY),
    endTime:   new Date(now + 5 * DAY),
    teams: [
      {
        id: 1,
        name: 'Team Alpha',
        players: [
          { name: 'Zezima',     value: 450823, skill: 'Woodcutting' },
          { name: 'Woox',       value: 382150, skill: 'Woodcutting' },
          { name: 'Lynx Titan', value: 291034, skill: 'Woodcutting' }
        ]
      },
      {
        id: 2,
        name: 'Team Beta',
        players: [
          { name: 'B0aty',       value: 621447, skill: 'Woodcutting' },
          { name: 'Settled',     value: 315890, skill: 'Woodcutting' },
          { name: 'Swampletics', value: 249123, skill: 'Woodcutting' }
        ]
      }
    ]
  },
  '2': {
    id: '2',
    name: 'Vorkath Grind',
    type: 'solo',
    category: 'boss',
    metric: 'kill-count',
    boss: 'Vorkath',
    startTime: new Date(now - 1 * DAY),
    endTime:   new Date(now + 6 * DAY),
    participants: [
      { name: 'B0aty',       value: 312 },
      { name: 'Woox',        value: 289 },
      { name: 'Zezima',      value: 201 },
      { name: 'Lynx Titan',  value: 178 },
      { name: 'Swampletics', value: 95  }
    ]
  },
  '3': {
    id: '3',
    name: 'Total XP Blitz',
    type: 'solo',
    category: 'skill',
    metric: 'xp',
    skillScope: 'total',
    startTime: new Date(now + 2 * DAY), // upcoming
    endTime:   new Date(now + 9 * DAY),
    participants: [
      { name: 'Zezima',      value: 0 },
      { name: 'Settled',     value: 0 },
      { name: 'Swampletics', value: 0 }
    ]
  }
};

// ── Icon / asset helpers ──────────────────────────────────────────────────────

// Returns the path to the skill icon. Handles the Runecrafting naming edge case.
function getSkillIconSrc(skillName) {
  if (skillName === 'Runecrafting') return 'assets/Runecraft_icon.png';
  return 'assets/' + skillName + '_icon.png';
}

// Returns the path to the boss image. Strips non-alphanumeric to match filenames.
function getBossImageSrc(bossName) {
  var filename = String(bossName).replace(/[^a-zA-Z0-9]/g, '');
  return 'assets/bosses/' + filename + '.png';
}

// Returns the appropriate icon/image for the competition header.
function getCompIconSrc(comp) {
  if (comp.category === 'boss') {
    return getBossImageSrc(comp.boss || '');
  }
  if (comp.skillScope === 'total' || !comp.skill) {
    return 'assets/Skills_icon.png'; // generic skills icon for Total XP / Total EHP
  }
  return getSkillIconSrc(comp.skill);
}

// ── Metric helpers ────────────────────────────────────────────────────────────

function getMetricLabel(comp) {
  if (comp.category === 'boss') return comp.metric === 'ehb' ? 'EHB' : 'Kills';
  return comp.metric === 'ehp' ? 'EHP Gained' : 'XP Gained';
}

function formatMetricValue(val, comp) {
  if (comp.category === 'boss') {
    return comp.metric === 'ehb' ? val.toFixed(2) : Number(val).toLocaleString();
  }
  return comp.metric === 'ehp' ? val.toFixed(2) : Number(val).toLocaleString();
}

// Returns a short subtitle for the competition type, e.g. "Team · Woodcutting XP"
function getCompSubtitle(comp) {
  var typeLabel = comp.type === 'team' ? 'Team' : 'Solo';
  var metricLabel = getMetricLabel(comp);
  var scopeLabel = '';
  if (comp.category === 'skill') {
    scopeLabel = comp.skillScope === 'total'
      ? 'Total ' + metricLabel
      : (comp.skill ? comp.skill + ' ' : '') + metricLabel;
  } else {
    scopeLabel = (comp.boss ? comp.boss + ' ' : '') + metricLabel;
  }
  return typeLabel + ' · ' + scopeLabel;
}

// ── Status helpers ────────────────────────────────────────────────────────────

// Returns 'upcoming', 'active', or 'ended' based on the current time.
function getStatus(comp) {
  var n = Date.now();
  if (n < new Date(comp.startTime).getTime()) return 'upcoming';
  if (n > new Date(comp.endTime).getTime())   return 'ended';
  return 'active';
}

// Formats a date for display: "Jul 1, 2025 at 8:00 AM"
function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' at '
    + new Date(date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Returns a human-readable countdown string from now to `targetDate`.
function formatCountdown(targetDate) {
  var diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return '0s';
  var d = Math.floor(diff / 86400000);
  var h = Math.floor((diff % 86400000) / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  var parts = [];
  if (d > 0)              parts.push(d + 'd');
  if (h > 0 || d > 0)    parts.push(h + 'h');
  if (m > 0 || h > 0 || d > 0) parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}

// ── Data processing ───────────────────────────────────────────────────────────

// For team competitions: adds a `_total` field to each team and returns teams
// sorted by total descending, with players within each team also sorted.
function processTeams(comp) {
  return (comp.teams || []).map(function (team) {
    var total = (team.players || []).reduce(function (sum, p) { return sum + p.value; }, 0);
    var sortedPlayers = (team.players || []).slice().sort(function (a, b) { return b.value - a.value; });
    return Object.assign({}, team, { _total: total, players: sortedPlayers });
  }).sort(function (a, b) { return b._total - a._total; });
}

// For solo competitions: returns participants sorted by value descending.
function processSolo(comp) {
  return (comp.participants || []).slice().sort(function (a, b) { return b.value - a.value; });
}

// ── Header menu toggle ────────────────────────────────────────────────────────

(function () {
  var btn = document.getElementById('header-menu-btn');
  var dropdown = document.getElementById('header-menu-dropdown');
  if (!btn || !dropdown) return;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = !dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', open);
    btn.setAttribute('aria-expanded', String(!open));
  });
  document.addEventListener('click', function () { dropdown.classList.add('hidden'); });
  dropdown.addEventListener('click', function (e) { e.stopPropagation(); });
})();

// ── Render functions ──────────────────────────────────────────────────────────

function renderHeader(comp) {
  var el = document.getElementById('comp-header');
  if (!el) return;

  document.title = comp.name + ' – SpoopTool';

  var status = getStatus(comp);
  var statusClasses = {
    active:   'text-green-400 bg-green-400/10 border-green-400/30',
    upcoming: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    ended:    'text-slate-400 bg-slate-700/50 border-slate-600'
  };
  var statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  var html = '<img src="' + escAttr(getCompIconSrc(comp)) + '" alt="" '
    + 'class="w-14 h-14 object-contain shrink-0" width="56" height="56" />';
  html += '<div>';
  html += '<h1 class="text-2xl font-bold text-slate-100 leading-tight">' + escHtml(comp.name) + '</h1>';
  html += '<div class="flex flex-wrap items-center gap-2 mt-2">';
  html += '<span class="text-xs px-2.5 py-0.5 rounded-full border border-slate-600 bg-slate-700/50 text-slate-300">'
    + escHtml(getCompSubtitle(comp)) + '</span>';
  html += '<span class="text-xs px-2.5 py-0.5 rounded-full border ' + statusClasses[status] + '">'
    + statusLabel + '</span>';
  html += '</div>';
  html += '</div>';

  el.innerHTML = html;
}

function renderScheduleCard(comp) {
  var el = document.getElementById('schedule-content');
  if (!el) return;

  var status = getStatus(comp);

  var html = '<div class="space-y-3">';
  html += '<div>'
    + '<p class="text-xs text-slate-500 mb-0.5">Start</p>'
    + '<p class="text-sm text-slate-200">' + formatDate(comp.startTime) + '</p>'
    + '</div>';
  html += '<div>'
    + '<p class="text-xs text-slate-500 mb-0.5">End</p>'
    + '<p class="text-sm text-slate-200">' + formatDate(comp.endTime) + '</p>'
    + '</div>';
  html += '<div class="pt-2 border-t border-slate-700/80">';

  if (status === 'ended') {
    html += '<p class="text-sm text-slate-400">Competition has ended.</p>';
  } else if (status === 'upcoming') {
    html += '<p class="text-xs text-slate-500 mb-0.5">Starts in</p>';
    html += '<p id="countdown-display" class="text-base font-mono font-semibold text-amber-400"></p>';
  } else {
    html += '<p class="text-xs text-slate-500 mb-0.5">Ends in</p>';
    html += '<p id="countdown-display" class="text-base font-mono font-semibold text-green-400"></p>';
  }

  html += '</div></div>';
  el.innerHTML = html;
}

function renderLeaderCard(comp, sorted) {
  var el = document.getElementById('leader-card');
  if (!el) return;

  var isTeam = comp.type === 'team';
  var cardTitle = isTeam ? 'Leading Team' : 'Current Leader';
  var leader = sorted[0];

  var html = '<p class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">' + cardTitle + '</p>';

  if (!leader || (isTeam ? leader._total : leader.value) === 0) {
    html += '<p class="text-sm text-slate-500 italic">No data yet</p>';
    el.innerHTML = html;
    return;
  }

  var value = isTeam ? leader._total : leader.value;
  var name  = isTeam ? leader.name  : leader.name;

  html += '<div class="flex items-center gap-2 mb-3">';
  html += '<span class="text-amber-400 text-lg" aria-hidden="true">&#127942;</span>';
  html += '<span class="text-lg font-bold text-slate-100 truncate">' + escHtml(name) + '</span>';
  html += '</div>';
  html += '<p class="text-2xl font-mono font-bold text-sky-400">' + escHtml(formatMetricValue(value, comp)) + '</p>';
  html += '<p class="text-xs text-slate-500 mt-1">' + getMetricLabel(comp) + '</p>';

  el.innerHTML = html;
}

function renderContributorCard(comp, sorted) {
  var el = document.getElementById('contributor-card');
  if (!el) return;

  // For solo competitions the top contributor is the same as the leader — show runner-up instead.
  if (comp.type === 'solo') {
    var html = '<p class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Runner-Up</p>';
    var runnerUp = sorted[1];
    if (!runnerUp || runnerUp.value === 0) {
      html += '<p class="text-sm text-slate-500 italic">No data yet</p>';
    } else {
      html += '<p class="text-lg font-bold text-slate-100 mb-2">' + escHtml(runnerUp.name) + '</p>';
      html += '<p class="text-2xl font-mono font-bold text-sky-400">' + escHtml(formatMetricValue(runnerUp.value, comp)) + '</p>';
      html += '<p class="text-xs text-slate-500 mt-1">' + getMetricLabel(comp) + '</p>';
    }
    el.innerHTML = html;
    return;
  }

  // Team mode: find the single player with the highest individual value across all teams.
  var topPlayer = null;
  var topTeamName = '';
  sorted.forEach(function (team) {
    team.players.forEach(function (player) {
      if (!topPlayer || player.value > topPlayer.value) {
        topPlayer  = player;
        topTeamName = team.name;
      }
    });
  });

  var html = '<p class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Top Contributor</p>';

  if (!topPlayer || topPlayer.value === 0) {
    html += '<p class="text-sm text-slate-500 italic">No data yet</p>';
  } else {
    html += '<p class="text-xs text-slate-500 mb-0.5">' + escHtml(topTeamName) + '</p>';
    html += '<p class="text-lg font-bold text-slate-100 mb-2">' + escHtml(topPlayer.name) + '</p>';
    html += '<p class="text-2xl font-mono font-bold text-sky-400">' + escHtml(formatMetricValue(topPlayer.value, comp)) + '</p>';
    html += '<p class="text-xs text-slate-500 mt-1">' + getMetricLabel(comp) + '</p>';
  }

  el.innerHTML = html;
}

function renderLeaderboard(comp, sorted) {
  var theadEl = document.getElementById('lb-thead');
  var tbodyEl = document.getElementById('lb-tbody');
  if (!theadEl || !tbodyEl) return;

  var metricLabel  = getMetricLabel(comp);
  var isTeam       = comp.type === 'team';
  // Show per-player skill column only when each participant has a different skill
  var showSkillCol = comp.category === 'skill' && comp.skillScope === 'specific' && !comp.sameSkillForAll;
  var colCount     = showSkillCol ? 4 : 3;

  // ── Table header ──────────────────────────────────────────────────────────
  theadEl.innerHTML = '<tr class="border-b border-slate-700 bg-slate-800">'
    + '<th class="text-left px-4 py-2.5 text-xs font-medium text-slate-400 w-10">#</th>'
    + '<th class="text-left px-4 py-2.5 text-xs font-medium text-slate-400">' + (isTeam ? 'Team / Player' : 'Player') + '</th>'
    + (showSkillCol ? '<th class="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Skill</th>' : '')
    + '<th class="text-right px-4 py-2.5 text-xs font-medium text-slate-400">' + escHtml(metricLabel) + '</th>'
    + '</tr>';

  // ── Table body ────────────────────────────────────────────────────────────
  var tbodyHtml = '';

  if (isTeam) {
    sorted.forEach(function (team, idx) {
      var rank     = idx + 1;
      var teamId   = 'team-' + team.id;
      var rankBadge = rank === 1 ? '<span class="text-amber-400">&#127942;</span>'
                    : rank === 2 ? '<span class="text-slate-300">&#129352;</span>'
                    : rank === 3 ? '<span class="text-amber-700">&#129353;</span>'
                    : rank;

      // Team row — click to collapse/expand member rows
      tbodyHtml += '<tr class="team-row border-b border-slate-600 hover:bg-slate-800/40 cursor-pointer select-none" data-team-id="' + teamId + '">';
      tbodyHtml += '<td class="px-4 py-3 text-sm font-medium text-slate-300">' + rankBadge + '</td>';
      tbodyHtml += '<td class="px-4 py-3 font-semibold text-slate-100">'
        + '<span class="collapse-arrow text-slate-500 text-xs mr-2">&#9660;</span>'
        + escHtml(team.name) + '</td>';
      if (showSkillCol) tbodyHtml += '<td></td>';
      tbodyHtml += '<td class="px-4 py-3 text-right font-mono font-semibold text-sky-300">'
        + escHtml(formatMetricValue(team._total, comp)) + '</td>';
      tbodyHtml += '</tr>';

      // Player sub-rows (open by default)
      team.players.forEach(function (player) {
        tbodyHtml += '<tr class="player-row border-b border-slate-700/40 bg-slate-800/10" data-team-member="' + teamId + '">';
        tbodyHtml += '<td class="px-4 py-2"></td>';
        tbodyHtml += '<td class="px-4 py-2 text-slate-300 text-sm pl-10">' + escHtml(player.name) + '</td>';

        if (showSkillCol) {
          tbodyHtml += '<td class="px-4 py-2 text-slate-400 text-sm">';
          if (player.skill) {
            tbodyHtml += '<span class="flex items-center gap-1.5">'
              + '<img src="' + escAttr(getSkillIconSrc(player.skill)) + '" class="w-4 h-4 object-contain" alt="" />'
              + escHtml(player.skill) + '</span>';
          }
          tbodyHtml += '</td>';
        }

        tbodyHtml += '<td class="px-4 py-2 text-right font-mono text-slate-400 text-sm">'
          + escHtml(formatMetricValue(player.value, comp)) + '</td>';
        tbodyHtml += '</tr>';
      });
    });
  } else {
    // Solo leaderboard — flat rows
    sorted.forEach(function (player, idx) {
      var rank = idx + 1;
      var rankBadge = rank === 1 ? '<span class="text-amber-400">&#127942;</span>'
                    : rank === 2 ? '<span class="text-slate-300">&#129352;</span>'
                    : rank === 3 ? '<span class="text-amber-700">&#129353;</span>'
                    : rank;

      tbodyHtml += '<tr class="border-b border-slate-700/50 hover:bg-slate-800/40">';
      tbodyHtml += '<td class="px-4 py-3 text-sm font-medium text-slate-300">' + rankBadge + '</td>';
      tbodyHtml += '<td class="px-4 py-3 font-medium text-slate-100">' + escHtml(player.name) + '</td>';
      if (showSkillCol) {
        tbodyHtml += '<td class="px-4 py-3 text-slate-400 text-sm">';
        if (player.skill) {
          tbodyHtml += '<span class="flex items-center gap-1.5">'
            + '<img src="' + escAttr(getSkillIconSrc(player.skill)) + '" class="w-4 h-4 object-contain" alt="" />'
            + escHtml(player.skill) + '</span>';
        }
        tbodyHtml += '</td>';
      }
      tbodyHtml += '<td class="px-4 py-3 text-right font-mono text-sky-300">'
        + escHtml(formatMetricValue(player.value, comp)) + '</td>';
      tbodyHtml += '</tr>';
    });
  }

  tbodyEl.innerHTML = tbodyHtml;

  // Wire up team row collapse toggles
  tbodyEl.querySelectorAll('.team-row').forEach(function (row) {
    var teamId = row.dataset.teamId;
    row.addEventListener('click', function () {
      var members  = tbodyEl.querySelectorAll('[data-team-member="' + teamId + '"]');
      var arrow    = row.querySelector('.collapse-arrow');
      var willHide = members.length > 0 && !members[0].classList.contains('hidden');
      members.forEach(function (m) { m.classList.toggle('hidden', willHide); });
      if (arrow) arrow.innerHTML = willHide ? '&#9654;' : '&#9660;'; // ▶ or ▼
    });
  });
}

// ── Snapshot / score refresh ──────────────────────────────────────────────────
// POSTs to /api/competitions/:id/snapshot to fetch fresh Hiscores for all
// participants, then reloads the competition detail so scores are up to date.

function triggerFinalSnapshot(compId, onDone) {
  fetch('/api/competitions/_?compId=' + encodeURIComponent(compId) + '&action=snapshot', { method: 'POST' })
    .then(function () { onDone(); })
    .catch(function () { onDone(); }); // always proceed even if it fails
}

// ── Live countdown ────────────────────────────────────────────────────────────
// Updates the #countdown-display element every second.

function startCountdown(comp) {
  var status = getStatus(comp);

  // For ended competitions: show a Refresh button so scores can be updated on demand.
  if (status === 'ended') {
    var el = document.getElementById('schedule-content');
    if (el && !el.querySelector('#refresh-scores-btn')) {
      var btn = document.createElement('button');
      btn.id = 'refresh-scores-btn';
      btn.type = 'button';
      btn.textContent = 'Refresh Scores';
      btn.className = 'mt-4 w-full px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition-colors';
      btn.addEventListener('click', function () {
        btn.disabled = true;
        btn.textContent = 'Refreshing\u2026';
        triggerFinalSnapshot(comp.id, function () { init(); });
      });
      el.appendChild(btn);
    }
    return;
  }

  var targetDate = status === 'upcoming' ? comp.startTime : comp.endTime;

  function tick() {
    var el = document.getElementById('countdown-display');
    if (!el) return;
    el.textContent = formatCountdown(targetDate);
    // Competition just started or ended — take a fresh snapshot then re-render.
    if (new Date(targetDate).getTime() <= Date.now()) {
      clearInterval(intervalId);
      if (status === 'active') {
        // Competition just ended: snapshot all participants for an accurate final score.
        var cdEl = document.getElementById('countdown-display');
        if (cdEl) cdEl.textContent = 'Finalizing scores\u2026';
        triggerFinalSnapshot(comp.id, function () { init(); });
      } else {
        init(); // competition just started, re-render to show active state
      }
    }
  }

  tick(); // run immediately so there's no 1s blank
  var intervalId = setInterval(tick, 1000);
}

// ── Page initialisation ───────────────────────────────────────────────────────
// Reads the ?id= URL param, fetches the competition from /api/competitions/:id,
// and renders everything. Falls back to MOCK_COMPETITIONS for unknown numeric IDs
// that are also present in the mock dataset (handy for local dev without a DB).

function renderPage(comp) {
  var sorted = comp.type === 'team' ? processTeams(comp) : processSolo(comp);
  renderHeader(comp);
  renderScheduleCard(comp);
  renderLeaderCard(comp, sorted);
  renderContributorCard(comp, sorted);
  renderLeaderboard(comp, sorted);
  startCountdown(comp);
}

function showLoadingState() {
  var headerEl = document.getElementById('comp-header');
  if (headerEl) headerEl.innerHTML = '<p class="text-slate-500 text-sm animate-pulse">Loading\u2026</p>';
}

function showError(msg) {
  var headerEl = document.getElementById('comp-header');
  if (headerEl) headerEl.innerHTML = '<p class="text-slate-400">' + escHtml(msg) + '</p>';
}

function init() {
  var urlParams = new URLSearchParams(window.location.search);
  var id = urlParams.get('id') || '1';

  showLoadingState();

  fetch('/api/competitions/_?compId=' + encodeURIComponent(id))
    .then(function (res) {
      if (res.status === 404) throw new Error('Competition not found.');
      if (!res.ok) throw new Error('Server error (HTTP ' + res.status + ').');
      return res.json();
    })
    .then(function (comp) {
      renderPage(comp);
    })
    .catch(function (err) {
      showError(err.message || 'Failed to load competition.');
    });
}

init();
