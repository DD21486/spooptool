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
    var players = team.players || [];
    var total      = players.reduce(function (sum, p) { return sum + (p.value      || 0); }, 0);
    var startTotal = players.reduce(function (sum, p) { return sum + (p.startValue || 0); }, 0);
    var endTotal   = players.reduce(function (sum, p) { return sum + (p.endValue   || 0); }, 0);
    var sortedPlayers = players.slice().sort(function (a, b) { return b.value - a.value; });
    return Object.assign({}, team, { _total: total, _startTotal: startTotal, _endTotal: endTotal, players: sortedPlayers });
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

  var isTeam       = comp.type === 'team';
  var isBoss       = comp.category === 'boss';
  // Show per-player skill column only when each participant has a different skill
  var showSkillCol = comp.category === 'skill' && comp.skillScope === 'specific' && !comp.sameSkillForAll;
  var startLabel   = isBoss ? (comp.metric === 'ehb' ? 'Starting EHB' : 'Starting KC')  : (comp.metric === 'ehp' ? 'Starting EHP' : 'Starting XP');
  var currentLabel = isBoss ? (comp.metric === 'ehb' ? 'Current EHB'  : 'Current KC')   : (comp.metric === 'ehp' ? 'Current EHP'  : 'Current XP');
  var gainedLabel  = isBoss ? (comp.metric === 'ehb' ? 'EHB Gained'   : 'KC Gained')    : (comp.metric === 'ehp' ? 'EHP Gained'   : 'XP Gained');

  // ── Table header ──────────────────────────────────────────────────────────
  var thClass = 'text-right px-4 py-2.5 text-xs font-medium text-slate-400';
  theadEl.innerHTML = '<tr class="border-b border-slate-700 bg-slate-800">'
    + '<th class="text-left px-4 py-2.5 text-xs font-medium text-slate-400 w-10">#</th>'
    + '<th class="text-left px-4 py-2.5 text-xs font-medium text-slate-400">' + (isTeam ? 'Team / Player' : 'Player') + '</th>'
    + (showSkillCol ? '<th class="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Skill</th>' : '')
    + '<th class="' + thClass + '">' + escHtml(startLabel)   + '</th>'
    + '<th class="' + thClass + '">' + escHtml(currentLabel) + '</th>'
    + '<th class="' + thClass + '">' + escHtml(gainedLabel)  + '</th>'
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
      tbodyHtml += '<td class="px-4 py-3 text-right font-mono text-slate-400 font-semibold">'
        + escHtml(formatMetricValue(team._startTotal || 0, comp)) + '</td>';
      tbodyHtml += '<td class="px-4 py-3 text-right font-mono text-slate-400 font-semibold">'
        + escHtml(formatMetricValue(team._endTotal || 0, comp)) + '</td>';
      tbodyHtml += '<td class="px-4 py-3 text-right font-mono font-semibold text-green-400">'
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

        tbodyHtml += '<td class="px-4 py-2 text-right font-mono text-slate-500 text-sm">'
          + escHtml(formatMetricValue(player.startValue || 0, comp)) + '</td>';
        tbodyHtml += '<td class="px-4 py-2 text-right font-mono text-slate-500 text-sm">'
          + escHtml(formatMetricValue(player.endValue || 0, comp)) + '</td>';
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
      tbodyHtml += '<td class="px-4 py-3 text-right font-mono text-slate-500">'
        + escHtml(formatMetricValue(player.startValue || 0, comp)) + '</td>';
      tbodyHtml += '<td class="px-4 py-3 text-right font-mono text-slate-500">'
        + escHtml(formatMetricValue(player.endValue || 0, comp)) + '</td>';
      tbodyHtml += '<td class="px-4 py-3 text-right font-mono text-green-400">'
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

// ── Progress chart ────────────────────────────────────────────────────────────

var CHART_PLAYER_COLORS = [
  'rgb(56, 189, 248)',   // sky-400
  'rgb(74, 222, 128)',   // green-400
  'rgb(251, 191, 36)',   // amber-400
  'rgb(248, 113, 113)',  // red-400
  'rgb(192, 132, 252)',  // purple-400
  'rgb(251, 146, 60)',   // orange-400
  'rgb(45, 212, 191)',   // teal-400
  'rgb(251, 113, 133)',  // rose-400
  'rgb(129, 140, 248)',  // indigo-400
  'rgb(163, 230, 53)',   // lime-400
];

var compProgressChart = null;

function formatChartTime(isoString) {
  var d = new Date(isoString);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var h = d.getHours();
  var ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  var mins = d.getMinutes();
  return months[d.getMonth()] + ' ' + d.getDate() + ' ' + h + ':' + (mins < 10 ? '0' : '') + mins + ampm;
}

function renderChart(comp) {
  var section  = document.getElementById('comp-chart-section');
  var canvas   = document.getElementById('comp-progress-chart');
  var loadEl   = document.getElementById('comp-chart-loading');
  var emptyEl  = document.getElementById('comp-chart-empty');
  if (!section || !canvas) return;

  // Hide chart entirely for upcoming competitions
  if (getStatus(comp) === 'upcoming') {
    section.classList.add('hidden');
    return;
  }

  // Destroy previous instance if re-rendering after refresh
  if (compProgressChart) {
    compProgressChart.destroy();
    compProgressChart = null;
  }

  loadEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  fetch('/api/competitions/_?compId=' + encodeURIComponent(comp.id) + '&action=chart-history')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      loadEl.classList.add('hidden');

      if (!data.timestamps || !data.timestamps.length) {
        emptyEl.classList.remove('hidden');
        return;
      }

      var isEff = comp.metric === 'ehp' || comp.metric === 'ehb';

      // Collect the union of all timestamps where any player changed, in the
      // original chronological order from the API. Use these as the shared
      // x-axis labels. Each dataset uses index-based values (not {x,y}) with
      // null at positions where that player didn't change. spanGaps:true then
      // draws a direct line between their actual change points, skipping nulls,
      // so there are no flat segments and no label-matching issues.
      var allChangeTs = new Set();
      var playerChangeMaps = data.series.map(function (player) {
        var map = {};
        var lastValue = null;
        data.timestamps.forEach(function (ts, idx) {
          var v = player.values[idx];
          if (v === null) return;
          if (lastValue === null || v !== lastValue) {
            map[ts] = v;
            allChangeTs.add(ts);
            lastValue = v;
          }
        });
        return map;
      });

      // Preserve original sort order from data.timestamps
      var changeTsList = data.timestamps.filter(function (ts) { return allChangeTs.has(ts); });
      var labels = changeTsList.map(formatChartTime);

      var datasets = data.series.map(function (player, i) {
        var color = CHART_PLAYER_COLORS[i % CHART_PLAYER_COLORS.length];
        var alpha = color.replace('rgb(', 'rgba(').replace(')', ', 0.08)');
        var map = playerChangeMaps[i];
        return {
          label: player.name,
          data: changeTsList.map(function (ts) { return map.hasOwnProperty(ts) ? map[ts] : null; }),
          borderColor: color,
          backgroundColor: alpha,
          fill: false,
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 6,
          spanGaps: true,
        };
      });

      compProgressChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 12 },
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var v = ctx.parsed.y;
                  if (v == null) return null;
                  return ' ' + ctx.dataset.label + ': ' + (isEff ? v.toFixed(2) : Number(v).toLocaleString());
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(148, 163, 184, 0.2)' },
              ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 10 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(148, 163, 184, 0.2)' },
              ticks: {
                color: '#94a3b8',
                font: { size: 10 },
                callback: function (v) {
                  return isEff ? Number(v).toFixed(1) : Number(v).toLocaleString();
                },
              },
            },
          },
        },
      });
    })
    .catch(function () {
      loadEl.classList.add('hidden');
      emptyEl.textContent = 'Failed to load chart data.';
      emptyEl.classList.remove('hidden');
    });
}

// ── Delete competition ────────────────────────────────────────────────────────

function initDeleteButton(compId) {
  var openBtn    = document.getElementById('delete-comp-btn');
  var modal      = document.getElementById('delete-modal');
  var cancelBtn  = document.getElementById('delete-cancel-btn');
  var confirmBtn = document.getElementById('delete-confirm-btn');
  var codeInput  = document.getElementById('delete-code-input');
  var errorEl    = document.getElementById('delete-error');
  if (!openBtn || !modal) return;

  function openModal() {
    codeInput.value = '';
    errorEl.classList.add('hidden');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete';
    modal.classList.remove('hidden');
    codeInput.focus();
  }
  function closeModal() { modal.classList.add('hidden'); }

  openBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  confirmBtn.addEventListener('click', function () {
    var code = codeInput.value.trim();
    if (!code) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting\u2026';
    errorEl.classList.add('hidden');

    fetch('/api/competitions/_?compId=' + encodeURIComponent(compId), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creatorCode: code }),
    })
      .then(function (res) {
        if (res.status === 403) {
          errorEl.classList.remove('hidden');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Delete';
          return;
        }
        if (!res.ok) throw new Error('Server error');
        window.location.href = 'competitions.html';
      })
      .catch(function () {
        errorEl.textContent = 'Something went wrong. Try again.';
        errorEl.classList.remove('hidden');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete';
      });
  });
}

// ── Refresh button ────────────────────────────────────────────────────────────

function initRefreshButton(compId, status) {
  var btn = document.getElementById('refresh-scores-btn');
  if (!btn) return;
  if (status !== 'active') return; // only show for active competitions

  // Reset state in case this is called after a re-render following a refresh
  btn.disabled = false;
  btn.textContent = 'Refresh Scores';
  btn.classList.remove('hidden');

  btn.addEventListener('click', function () {
    btn.disabled = true;
    btn.textContent = 'Refreshing\u2026';

    fetch('/api/competitions/_?compId=' + encodeURIComponent(compId) + '&action=refresh', { method: 'POST' })
      .then(function () {
        btn.textContent = 'Updated!';
        setTimeout(function () { init(); }, 800);
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Refresh Scores';
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

function triggerStartSnapshot(compId, onDone) {
  fetch('/api/competitions/_?compId=' + encodeURIComponent(compId) + '&action=start-snapshot', { method: 'POST' })
    .then(function () { onDone(); })
    .catch(function () { onDone(); }); // always proceed even if it fails
}

// ── Live countdown ────────────────────────────────────────────────────────────
// Updates the #countdown-display element every second.

function startCountdown(comp) {
  var status = getStatus(comp);

  if (status === 'ended') {
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
        // Competition just started: snapshot all participants for an accurate baseline.
        var cdEl2 = document.getElementById('countdown-display');
        if (cdEl2) cdEl2.textContent = 'Recording starting scores\u2026';
        triggerStartSnapshot(comp.id, function () { init(); });
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
  var status = getStatus(comp);
  renderHeader(comp);
  renderScheduleCard(comp);
  renderLeaderCard(comp, sorted);
  renderContributorCard(comp, sorted);
  renderChart(comp);
  renderLeaderboard(comp, sorted);
  startCountdown(comp);
  initRefreshButton(comp.id, status);
  initDeleteButton(comp.id);
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
