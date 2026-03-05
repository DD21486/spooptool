// create-competition.js — all behaviour for create-competition.html.
// Loaded at the end of <body> so every DOM element already exists when these run.
// No framework; plain ES5-compatible JavaScript.

// ── Constants ─────────────────────────────────────────────────────────────────

var SKILLS = [
  'Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Prayer', 'Magic',
  'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting',
  'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming',
  'Runecrafting', 'Hunter', 'Construction'
];

var TYPE_OPTIONS = [
  { value: 'solo', label: 'Solo',  desc: 'Every competitor for themselves' },
  { value: 'team', label: 'Team',  desc: 'Competitors are divided into teams' }
];

var CATEGORY_OPTIONS = [
  { value: 'skill', label: 'Skill', desc: 'Based on skilling activity' },
  { value: 'boss',  label: 'Boss',  desc: 'Based on bossing activity' }
];

// Metric options for skill competitions (step 1 — Total vs Specific moves to step 3)
var SKILL_METRICS = [
  { value: 'xp',  label: 'XP',  desc: 'Experience points gained' },
  { value: 'ehp', label: 'EHP', desc: 'Efficient hours played' }
];

// Metric options for boss competitions
var BOSS_METRICS = [
  { value: 'kill-count', label: 'Kill Count', desc: 'Total kills of a chosen boss' },
  { value: 'ehb',        label: 'EHB',        desc: 'Effective hours bossed' }
];

// ── Shared state ──────────────────────────────────────────────────────────────

var state = {
  step: 1,

  // Step 1
  name: '',
  type: 'solo',      // 'solo' | 'team'
  category: 'skill', // 'skill' | 'boss'
  metric: null,      // 'xp' | 'ehp' | 'kill-count' | 'ehb'
  startTime: '',
  endTime: '',

  // Step 2
  selectedPlayers: [], // solo: selected player names
  teams: [],           // team: [{ id, name, players: [] }]
  nextTeamId: 1,

  // Step 3
  skillScope: null,      // 'total' | 'specific' — chosen in step 3 for skill competitions
  sameSkillForAll: true, // true = one shared skill; false = one per participant/team
  selectedSkill: '',     // the shared specific skill
  playerSkills: {},      // { key: skillName } for per-participant mode
  selectedBoss: '',      // chosen boss name

  // Fetched data
  allPlayers: [],
  allBosses: []
};

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Default times ─────────────────────────────────────────────────────────────
// Start: next calendar day at 08:00 local time. End: 7 days after start.

function toDatetimeLocal(date) {
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

(function () {
  var start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(8, 0, 0, 0);

  var end = new Date(start);
  end.setDate(end.getDate() + 7);

  document.getElementById('start-time').value = toDatetimeLocal(start);
  document.getElementById('end-time').value   = toDatetimeLocal(end);
})();

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

// ── Generic radio group renderer ──────────────────────────────────────────────
// Builds a vertically-stacked list of radio-style option cards into a container.
// `options`      — array of { value, label, desc }
// `currentValue` — the currently selected value (for highlight)
// `onChange`     — called with the new value when the user picks an option

function renderRadioGroup(containerId, options, currentValue, onChange) {
  var el = document.getElementById(containerId);
  if (!el) return;

  var html = '';
  options.forEach(function (opt) {
    var isActive = currentValue === opt.value;
    var cardClass = isActive
      ? 'border-sky-500 bg-sky-900/20'
      : 'border-slate-600 bg-slate-700/40 hover:border-slate-500';

    html += '<label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ' + cardClass + '">';
    html += '<input type="radio" name="' + containerId + '" value="' + escAttr(opt.value) + '" '
      + 'class="w-4 h-4 accent-sky-500 shrink-0"' + (isActive ? ' checked' : '') + ' />';
    html += '<div>';
    html += '<p class="text-sm font-medium text-slate-100">' + escHtml(opt.label) + '</p>';
    if (opt.desc) html += '<p class="text-xs text-slate-400 mt-0.5">' + escHtml(opt.desc) + '</p>';
    html += '</div>';
    html += '</label>';
  });

  el.innerHTML = html;

  el.querySelectorAll('input[type="radio"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (this.checked) onChange(this.value);
    });
  });
}

// ── Step indicator ────────────────────────────────────────────────────────────
// Step 3 is always shown (Total vs Specific is chosen there, not in step 1).

function renderStepIndicator() {
  var el = document.getElementById('step-indicator');
  if (!el) return;

  var steps = ['Basics', 'Participants', 'Selection'];
  var html = '<div class="flex items-center justify-center">';

  for (var i = 0; i < steps.length; i++) {
    var n = i + 1;
    var isActive    = state.step === n;
    var isCompleted = state.step > n;

    var circleClass = isActive
      ? 'bg-sky-600 border-sky-600 text-white'
      : isCompleted
        ? 'bg-sky-900 border-sky-700 text-sky-300'
        : 'bg-slate-700 border-slate-600 text-slate-400';

    var labelClass = isActive ? 'text-slate-100' : isCompleted ? 'text-sky-400' : 'text-slate-500';

    html += '<div class="flex flex-col items-center">';
    html += '<div class="w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors '
      + circleClass + '">';
    html += isCompleted ? '&#10003;' : n;
    html += '</div>';
    html += '<span class="text-xs mt-1.5 ' + labelClass + '">' + steps[i] + '</span>';
    html += '</div>';

    if (i < steps.length - 1) {
      html += '<div class="h-0.5 w-20 mb-5 mx-1 ' + (isCompleted ? 'bg-sky-700' : 'bg-slate-600') + '"></div>';
    }
  }

  html += '</div>';
  el.innerHTML = html;
}

// ── Step navigation ───────────────────────────────────────────────────────────

function showStep(n) {
  state.step = n;
  document.getElementById('step-1').classList.toggle('hidden', n !== 1);
  document.getElementById('step-2').classList.toggle('hidden', n !== 2);
  document.getElementById('step-3').classList.toggle('hidden', n !== 3);
  renderStepIndicator();
  if (n === 2) renderStep2();
  if (n === 3) renderStep3();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Step 1: Basics ────────────────────────────────────────────────────────────

(function () {
  // Render all three radio groups on load
  renderRadioGroup('type-options', TYPE_OPTIONS, state.type, function (val) {
    state.type = val;
    renderRadioGroup('type-options', TYPE_OPTIONS, state.type, arguments.callee);
  });

  renderRadioGroup('category-options', CATEGORY_OPTIONS, state.category, function (val) {
    state.category = val;
    state.metric = null; // reset metric when category changes
    renderRadioGroup('category-options', CATEGORY_OPTIONS, state.category, arguments.callee);
    renderMetricOptions();
  });

  renderMetricOptions();
  renderStepIndicator();

  // Step 1 → Step 2
  document.getElementById('step1-next').addEventListener('click', function () {
    var nameEl  = document.getElementById('comp-name');
    var startEl = document.getElementById('start-time');
    var endEl   = document.getElementById('end-time');
    var valid   = true;

    var nameErr   = document.getElementById('name-error');
    var metricErr = document.getElementById('metric-error');
    var timeErr   = document.getElementById('time-error');

    if (!nameEl.value.trim()) {
      nameErr.textContent = 'Please enter a competition name.';
      nameErr.classList.remove('hidden');
      valid = false;
    } else {
      nameErr.classList.add('hidden');
    }

    if (!state.metric) {
      metricErr.textContent = 'Please select a metric.';
      metricErr.classList.remove('hidden');
      valid = false;
    } else {
      metricErr.classList.add('hidden');
    }

    if (!startEl.value || !endEl.value) {
      timeErr.textContent = 'Please set both a start and end time.';
      timeErr.classList.remove('hidden');
      valid = false;
    } else if (new Date(endEl.value) <= new Date(startEl.value)) {
      timeErr.textContent = 'End time must be after start time.';
      timeErr.classList.remove('hidden');
      valid = false;
    } else {
      timeErr.classList.add('hidden');
    }

    if (!valid) return;

    state.name      = nameEl.value.trim();
    state.startTime = startEl.value;
    state.endTime   = endEl.value;

    showStep(2);
    fetchPlayers();
  });
})();

// Renders the metric radio group. Called on load and when category changes.
function renderMetricOptions() {
  var metrics = state.category === 'boss' ? BOSS_METRICS : SKILL_METRICS;
  renderRadioGroup('metric-options', metrics, state.metric, function (val) {
    state.metric = val;
    renderMetricOptions(); // re-render to update highlight
  });
}

// ── Fetch tracked players ─────────────────────────────────────────────────────

function fetchPlayers() {
  if (state.allPlayers.length > 0) { renderStep2(); return; }

  fetch('/api/characters')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      state.allPlayers = (Array.isArray(data) ? data : []).map(function (p) {
        return p.username || p.name || p.display_name || String(p);
      }).filter(Boolean);
      if (state.step === 2) renderStep2();
    })
    .catch(function (err) {
      var el = document.getElementById('step2-content');
      if (el) el.innerHTML = '<p class="text-red-400 text-sm text-center py-8">Failed to load players: ' + escHtml(err.message) + '</p>';
    });
}

// ── Step 2: Participants ──────────────────────────────────────────────────────

function renderStep2() {
  var el = document.getElementById('step2-content');
  if (!el) return;

  if (state.allPlayers.length === 0) {
    el.innerHTML = '<p class="text-slate-500 text-sm text-center py-8">Loading players&hellip;</p>';
    return;
  }

  if (state.type === 'solo') {
    renderSoloParticipants(el);
  } else {
    renderTeamBuilder(el);
  }
}

function renderSoloParticipants(container) {
  var html = '<h3 class="text-sm font-medium text-slate-300 mb-3">Select Participants</h3>';
  html += '<div class="space-y-2">';

  state.allPlayers.forEach(function (player) {
    var isChecked = state.selectedPlayers.indexOf(player) !== -1;
    var cardClass = isChecked
      ? 'border-sky-500 bg-sky-900/20'
      : 'border-slate-600 bg-slate-700/40 hover:border-slate-500';

    html += '<label class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors '
      + cardClass + '" data-player-label="' + escAttr(player) + '">';
    html += '<input type="checkbox" class="player-check w-4 h-4 accent-sky-500" value="' + escAttr(player) + '"'
      + (isChecked ? ' checked' : '') + ' />';
    html += '<span class="text-sm font-medium text-slate-100">' + escHtml(player) + '</span>';
    html += '</label>';
  });

  html += '</div>';
  html += '<p id="participants-error" class="mt-3 text-xs text-red-400 hidden"></p>';
  container.innerHTML = html;

  container.querySelectorAll('.player-check').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var player = this.value;
      if (this.checked) {
        if (state.selectedPlayers.indexOf(player) === -1) state.selectedPlayers.push(player);
      } else {
        state.selectedPlayers = state.selectedPlayers.filter(function (p) { return p !== player; });
      }
      var label = container.querySelector('[data-player-label="' + escAttr(player) + '"]');
      if (label) {
        label.classList.toggle('border-sky-500', this.checked);
        label.classList.toggle('bg-sky-900/20', this.checked);
        label.classList.toggle('border-slate-600', !this.checked);
        label.classList.toggle('bg-slate-700/40', !this.checked);
      }
    });
  });
}

function renderTeamBuilder(container) {
  if (state.teams.length === 0) {
    state.teams.push({ id: state.nextTeamId++, name: '', players: [] });
  }

  var allAssigned = [];
  state.teams.forEach(function (t) { t.players.forEach(function (p) { allAssigned.push(p); }); });

  var html = '<h3 class="text-sm font-medium text-slate-300 mb-3">Build Teams</h3>';
  html += '<div class="space-y-3">';
  state.teams.forEach(function (team) { html += buildTeamCardHtml(team, allAssigned); });
  html += '</div>';

  var canAdd = state.teams.length < state.allPlayers.length;
  html += '<button type="button" id="add-team-btn" '
    + 'class="mt-4 w-full px-4 py-2.5 rounded-lg border border-dashed border-slate-600 text-slate-400 text-sm '
    + 'hover:border-slate-400 hover:text-slate-200 transition-colors'
    + (canAdd ? '' : ' opacity-40 cursor-not-allowed') + '">'
    + '+ Add Team</button>';
  html += '<p id="teams-error" class="mt-3 text-xs text-red-400 hidden"></p>';

  container.innerHTML = html;
  bindTeamEvents(container);
}

function buildTeamCardHtml(team, allAssigned) {
  var html = '<div class="rounded-lg border border-slate-600 bg-slate-700/40 p-4" data-team-id="' + team.id + '">';

  html += '<div class="flex items-center gap-2 mb-3">';
  html += '<input type="text" class="team-name-input flex-1 px-2.5 py-1.5 rounded-lg bg-slate-600 border border-slate-500 '
    + 'text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" '
    + 'placeholder="Team name" value="' + escAttr(team.name) + '" />';
  html += '<button type="button" class="remove-team-btn p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-600 transition-colors" title="Remove team">'
    + '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">'
    + '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>';
  html += '</div>';

  if (team.players.length > 0) {
    html += '<div class="flex flex-wrap gap-1.5 mb-3">';
    team.players.forEach(function (player) {
      html += '<span class="flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-sky-900/50 border border-sky-700 text-xs text-sky-300">';
      html += escHtml(player);
      html += '<button type="button" class="remove-player-btn ml-0.5 w-4 h-4 flex items-center justify-center rounded-full '
        + 'hover:bg-sky-700/60 text-sky-400 hover:text-white transition-colors" data-player="' + escAttr(player) + '">&times;</button>';
      html += '</span>';
    });
    html += '</div>';
  }

  var unassigned = state.allPlayers.filter(function (p) { return allAssigned.indexOf(p) === -1; });
  if (unassigned.length > 0) {
    html += '<select class="add-player-select w-full px-2.5 py-1.5 rounded-lg bg-slate-600 border border-slate-500 '
      + 'text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500">';
    html += '<option value="">+ Add player&hellip;</option>';
    unassigned.forEach(function (p) {
      html += '<option value="' + escAttr(p) + '">' + escHtml(p) + '</option>';
    });
    html += '</select>';
  } else if (team.players.length === 0) {
    html += '<p class="text-xs text-slate-500 italic">All players have been assigned to other teams.</p>';
  }

  html += '</div>';
  return html;
}

function bindTeamEvents(container) {
  container.querySelectorAll('.team-name-input').forEach(function (input) {
    var teamId = parseInt(input.closest('[data-team-id]').dataset.teamId);
    input.addEventListener('input', function () {
      var team = state.teams.find(function (t) { return t.id === teamId; });
      if (team) team.name = this.value;
    });
  });

  container.querySelectorAll('.remove-team-btn').forEach(function (btn) {
    var teamId = parseInt(btn.closest('[data-team-id]').dataset.teamId);
    btn.addEventListener('click', function () {
      state.teams = state.teams.filter(function (t) { return t.id !== teamId; });
      renderStep2();
    });
  });

  container.querySelectorAll('.add-player-select').forEach(function (select) {
    var teamId = parseInt(select.closest('[data-team-id]').dataset.teamId);
    select.addEventListener('change', function () {
      var player = this.value;
      if (!player) return;
      var team = state.teams.find(function (t) { return t.id === teamId; });
      if (team && team.players.indexOf(player) === -1) team.players.push(player);
      renderStep2();
    });
  });

  container.querySelectorAll('.remove-player-btn').forEach(function (btn) {
    var teamId = parseInt(btn.closest('[data-team-id]').dataset.teamId);
    var player = btn.dataset.player;
    btn.addEventListener('click', function () {
      var team = state.teams.find(function (t) { return t.id === teamId; });
      if (team) team.players = team.players.filter(function (p) { return p !== player; });
      renderStep2();
    });
  });

  var addBtn = document.getElementById('add-team-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      if (state.teams.length >= state.allPlayers.length) return;
      state.teams.push({ id: state.nextTeamId++, name: '', players: [] });
      renderStep2();
    });
  }
}

document.getElementById('step2-back').addEventListener('click', function () { showStep(1); });

document.getElementById('step2-next').addEventListener('click', function () {
  var valid = true;

  if (state.type === 'solo') {
    var errEl = document.getElementById('participants-error');
    if (state.selectedPlayers.length < 2) {
      if (errEl) { errEl.textContent = 'Select at least 2 participants.'; errEl.classList.remove('hidden'); }
      valid = false;
    } else if (errEl) { errEl.classList.add('hidden'); }
  } else {
    var errEl = document.getElementById('teams-error');
    var filledTeams = state.teams.filter(function (t) { return t.name.trim() && t.players.length > 0; });
    if (filledTeams.length < 2) {
      if (errEl) { errEl.textContent = 'Define at least 2 named teams with at least one player each.'; errEl.classList.remove('hidden'); }
      valid = false;
    } else if (errEl) { errEl.classList.add('hidden'); }
  }

  if (valid) showStep(3);
  if (valid && state.category === 'boss') fetchBosses();
});

// ── Fetch bosses from WOM ─────────────────────────────────────────────────────

function formatBossName(raw) {
  return String(raw).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function fetchBosses() {
  if (state.allBosses.length > 0) { renderStep3(); return; }

  fetch('https://api.wiseoldman.net/v2/efficiency/rates?type=main&metric=ehb')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      state.allBosses = (Array.isArray(data) ? data : [])
        .map(function (e) { return formatBossName(e.boss || e.skill || ''); })
        .filter(Boolean);
      if (state.step === 3) renderStep3();
    })
    .catch(function () {
      state.allBosses = [
        'Abyssal Sire', 'Alchemical Hydra', 'Barrows', 'Callisto', 'Cerberus',
        'Commander Zilyana', 'Corporeal Beast', 'Dagannoth Kings', 'General Graardor',
        'Giant Mole', 'Grotesque Guardians', 'Hespori', 'Kalphite Queen',
        'King Black Dragon', 'Kraken', "K'ril Tsutsaroth", "Kree'Arra", 'Mimic',
        'The Nightmare', 'Obor', 'Sarachnis', 'Scorpia', 'Skotizo',
        'Theatre of Blood', 'Thermonuclear Smoke Devil', 'TzKal-Zuk', 'TzTok-Jad',
        'Venenatis', "Vet'ion", 'Vorkath', 'Wintertodt', 'Zalcano', 'Zulrah'
      ];
      if (state.step === 3) renderStep3();
    });
}

// ── Step 3: Skill / Boss Selection ────────────────────────────────────────────

function renderStep3() {
  var el = document.getElementById('step3-content');
  if (!el) return;

  if (state.category === 'boss') {
    renderBossSelector(el);
  } else {
    renderSkillSelector(el);
  }
}

function renderBossSelector(container) {
  var html = '<div>';
  html += '<label class="block text-sm font-medium text-slate-300 mb-1.5">Select Boss</label>';

  if (state.allBosses.length === 0) {
    html += '<p class="text-slate-500 text-sm py-4">Loading bosses&hellip;</p>';
  } else {
    html += '<select id="boss-select" class="w-full max-w-xs px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 '
      + 'text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm">';
    html += '<option value="">Choose a boss&hellip;</option>';
    state.allBosses.forEach(function (b) {
      html += '<option value="' + escAttr(b) + '"' + (state.selectedBoss === b ? ' selected' : '') + '>' + escHtml(b) + '</option>';
    });
    html += '</select>';
  }

  html += '<p id="selection-error" class="mt-2 text-xs text-red-400 hidden"></p>';
  html += '</div>';
  container.innerHTML = html;

  var sel = document.getElementById('boss-select');
  if (sel) sel.addEventListener('change', function () { state.selectedBoss = this.value; });
}

function renderSkillSelector(container) {
  // Label adapts to the chosen metric (XP or EHP)
  var metricLabel = state.metric === 'ehp' ? 'EHP' : 'XP';
  var participants = state.type === 'solo'
    ? state.selectedPlayers
    : state.teams.map(function (t) { return t.name || 'Unnamed Team'; });
  var noun = state.type === 'team' ? 'team' : 'participant';

  var html = '';

  // ── Scope: Total vs Specific Skill ────────────────────────────────────────
  var SCOPE_OPTIONS = [
    { value: 'total',    label: 'Total ' + metricLabel, desc: metricLabel + ' gained across all skills' },
    { value: 'specific', label: 'Specific Skill',        desc: 'Choose which skill(s) count toward the competition' }
  ];

  html += '<div id="scope-options" class="space-y-2 mb-5"></div>';

  // ── Per-participant skill assignment (shown only when scope = specific) ───
  if (state.skillScope === 'specific') {
    html += '<div id="specific-skill-section">';
    html += '<div class="border-t border-slate-700 pt-5">';

    // Same for all vs different per participant toggle
    html += '<label class="block text-sm font-medium text-slate-300 mb-2">Skill Assignment</label>';
    html += '<div class="inline-flex rounded-lg border border-slate-600 overflow-hidden mb-4">';
    html += '<button type="button" data-same="true" class="same-toggle px-4 py-2 text-sm font-medium transition-colors '
      + (state.sameSkillForAll ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600') + '">Same for all</button>';
    html += '<button type="button" data-same="false" class="same-toggle px-4 py-2 text-sm font-medium border-l border-slate-600 transition-colors '
      + (!state.sameSkillForAll ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600') + '">Different per ' + noun + '</button>';
    html += '</div>';

    if (state.sameSkillForAll) {
      html += '<div>';
      html += '<label class="block text-sm font-medium text-slate-300 mb-1.5">Skill</label>';
      html += buildSkillSelect('global-skill', state.selectedSkill, 'w-full max-w-xs');
      html += '</div>';
    } else {
      html += '<div class="space-y-3">';
      participants.forEach(function (participant, i) {
        var key = state.type === 'team' ? 'team_' + state.teams[i].id : participant;
        html += '<div class="flex items-center gap-3">';
        html += '<span class="text-sm font-medium text-slate-200 w-28 shrink-0 truncate">' + escHtml(participant) + '</span>';
        html += buildSkillSelect('per-skill_' + escAttr(key), state.playerSkills[key] || '', 'flex-1 per-skill-select', key);
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    html += '</div>';
  }

  html += '<p id="selection-error" class="mt-3 text-xs text-red-400 hidden"></p>';
  container.innerHTML = html;

  // Render the scope radio group into its placeholder div
  renderRadioGroup('scope-options', SCOPE_OPTIONS, state.skillScope, function (val) {
    state.skillScope = val;
    renderStep3();
  });

  // Bind same-for-all toggle
  container.querySelectorAll('.same-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.sameSkillForAll = this.dataset.same === 'true';
      renderStep3();
    });
  });

  // Bind global skill select
  var globalSel = document.getElementById('global-skill');
  if (globalSel) globalSel.addEventListener('change', function () { state.selectedSkill = this.value; });

  // Bind per-participant skill selects
  container.querySelectorAll('.per-skill-select').forEach(function (sel) {
    sel.addEventListener('change', function () { state.playerSkills[this.dataset.key] = this.value; });
  });
}

function buildSkillSelect(id, currentValue, extraClasses, dataKey) {
  var html = '<select id="' + escAttr(id) + '" '
    + (dataKey ? 'data-key="' + escAttr(dataKey) + '" ' : '')
    + 'class="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 '
    + 'focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm ' + (extraClasses || '') + '">';
  html += '<option value="">Choose a skill&hellip;</option>';
  SKILLS.forEach(function (s) {
    html += '<option value="' + escAttr(s) + '"' + (currentValue === s ? ' selected' : '') + '>' + escHtml(s) + '</option>';
  });
  html += '</select>';
  return html;
}

document.getElementById('step3-back').addEventListener('click', function () { showStep(2); });

document.getElementById('step3-create').addEventListener('click', function () {
  var errEl = document.getElementById('selection-error');
  var valid = true;

  if (state.category === 'boss') {
    if (!state.selectedBoss) {
      if (errEl) { errEl.textContent = 'Please select a boss.'; errEl.classList.remove('hidden'); }
      valid = false;
    }
  } else {
    if (!state.skillScope) {
      if (errEl) { errEl.textContent = 'Please choose Total ' + (state.metric === 'ehp' ? 'EHP' : 'XP') + ' or Specific Skill.'; errEl.classList.remove('hidden'); }
      valid = false;
    } else if (state.skillScope === 'specific') {
      if (state.sameSkillForAll) {
        if (!state.selectedSkill) {
          if (errEl) { errEl.textContent = 'Please select a skill.'; errEl.classList.remove('hidden'); }
          valid = false;
        }
      } else {
        var missing = state.type === 'solo'
          ? state.selectedPlayers.some(function (p) { return !state.playerSkills[p]; })
          : state.teams.some(function (t) { return !state.playerSkills['team_' + t.id]; });
        if (missing) {
          if (errEl) { errEl.textContent = 'Please assign a skill to every ' + (state.type === 'team' ? 'team' : 'participant') + '.'; errEl.classList.remove('hidden'); }
          valid = false;
        }
      }
    }
  }

  if (!valid) return;
  createCompetition();
});

// ── Create competition ────────────────────────────────────────────────────────

function generateCreatorCode() {
  var code = '';
  for (var i = 0; i < 9; i++) code += Math.floor(Math.random() * 10);
  return code;
}

function createCompetition() {
  document.getElementById('creator-code-display').textContent = generateCreatorCode();
  document.getElementById('creator-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// ── Creator code modal ────────────────────────────────────────────────────────

document.getElementById('copy-code-btn').addEventListener('click', function () {
  var code = document.getElementById('creator-code-display').textContent;
  var feedback = document.getElementById('copy-feedback');

  function showCopied() {
    feedback.textContent = 'Copied!';
    setTimeout(function () { feedback.textContent = ''; }, 2000);
  }

  function fallbackCopy() {
    var ta = document.createElement('textarea');
    ta.value = code;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showCopied(); } catch (e) {}
    document.body.removeChild(ta);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(showCopied).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
});
