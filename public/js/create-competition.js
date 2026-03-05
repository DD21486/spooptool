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

// Metric options shown when category = "skill"
var SKILL_METRICS = [
  { value: 'total-xp',  label: 'Total XP',   desc: 'XP gained across all skills' },
  { value: 'skill-xp',  label: 'Skill XP',   desc: 'XP gained in a specific skill' },
  { value: 'total-ehp', label: 'Total EHP',  desc: 'Efficient hours played (all skills)' },
  { value: 'skill-ehp', label: 'Skill EHP',  desc: 'EHP gained in a specific skill' }
];

// Metric options shown when category = "boss"
var BOSS_METRICS = [
  { value: 'kill-count', label: 'Kill Count', desc: 'Total kills of a specific boss' },
  { value: 'ehb',        label: 'EHB',        desc: 'Effective hours bossed' }
];

// ── Shared state ──────────────────────────────────────────────────────────────
// Single source of truth for the entire wizard.

var state = {
  step: 1,

  // Step 1
  name: '',
  type: 'solo',      // 'solo' | 'team'
  category: 'skill', // 'skill' | 'boss'
  metric: null,      // see SKILL_METRICS / BOSS_METRICS above
  startTime: '',
  endTime: '',

  // Step 2
  selectedPlayers: [], // solo mode: array of player names selected for the competition
  teams: [],           // team mode: [{ id, name, players: [] }]
  nextTeamId: 1,       // auto-increment for team IDs

  // Step 3
  sameSkillForAll: true, // true = one shared skill; false = each participant picks their own
  selectedSkill: '',     // the shared skill (sameSkillForAll = true)
  playerSkills: {},      // per-participant skills: { key: skillName } (sameSkillForAll = false)
  selectedBoss: '',      // boss mode: the chosen boss name

  // Fetched data
  allPlayers: [],  // player names from /api/characters
  allBosses: []    // boss names from WOM EHB rates endpoint
};

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

// ── Step indicator ────────────────────────────────────────────────────────────
// Renders the numbered step circles and connecting lines at the top of the page.
// Updates dynamically since Total XP / Total EHP skip step 3.

function needsStep3() {
  return state.metric !== 'total-xp' && state.metric !== 'total-ehp';
}

function renderStepIndicator() {
  var el = document.getElementById('step-indicator');
  if (!el) return;

  var steps = needsStep3()
    ? ['Basics', 'Participants', 'Selection']
    : ['Basics', 'Participants'];

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
    html += '<div class="w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors ' + circleClass + '">';
    html += isCompleted ? '&#10003;' : n;
    html += '</div>';
    html += '<span class="text-xs mt-1.5 ' + labelClass + '">' + steps[i] + '</span>';
    html += '</div>';

    // Connecting line between circles
    if (i < steps.length - 1) {
      var lineClass = isCompleted ? 'bg-sky-700' : 'bg-slate-600';
      html += '<div class="h-0.5 w-20 mb-5 mx-1 ' + lineClass + '"></div>';
    }
  }

  html += '</div>';
  el.innerHTML = html;
}

// ── Step navigation ───────────────────────────────────────────────────────────
// Shows the correct step div and hides the others. Triggers re-renders for
// steps 2 and 3 since their content is built dynamically.

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

// Renders the metric option cards based on the currently selected category.
// Each card is a clickable button that updates state.metric and highlights itself.
function renderMetricOptions() {
  var el = document.getElementById('metric-options');
  if (!el) return;

  var metrics = state.category === 'boss' ? BOSS_METRICS : SKILL_METRICS;
  var html = '';

  metrics.forEach(function (m) {
    var isActive = state.metric === m.value;
    var borderClass = isActive
      ? 'border-sky-500 bg-sky-900/30'
      : 'border-slate-600 bg-slate-700/50 hover:border-slate-500';

    html += '<button type="button" data-metric="' + m.value + '" '
      + 'class="text-left rounded-lg border p-3 transition-colors ' + borderClass + '">';
    html += '<p class="text-sm font-semibold text-slate-100">' + m.label + '</p>';
    html += '<p class="text-xs text-slate-400 mt-0.5">' + m.desc + '</p>';
    html += '</button>';
  });

  el.innerHTML = html;

  el.querySelectorAll('[data-metric]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.metric = this.dataset.metric;
      renderMetricOptions();
      renderStepIndicator(); // step count may change (total-xp/total-ehp skip step 3)
    });
  });
}

// Sets the active/inactive visual state of a segmented control group.
// `buttons` is a NodeList of buttons with a `data-*` attribute.
// `activeValue` is the currently selected value.
function updateSegmentButtons(buttons, activeValue) {
  buttons.forEach(function (btn) {
    var active = btn.dataset.type === activeValue || btn.dataset.category === activeValue;
    btn.classList.toggle('bg-sky-600', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('bg-slate-700', !active);
    btn.classList.toggle('text-slate-300', !active);
  });
}

(function () {
  // Competition type (Solo / Team) segment buttons
  var typeBtns = document.querySelectorAll('.type-btn');
  typeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.type = this.dataset.type;
      updateSegmentButtons(typeBtns, state.type);
    });
  });

  // Category (Skill / Boss) segment buttons
  var catBtns = document.querySelectorAll('.cat-btn');
  catBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.category = this.dataset.category;
      state.metric = null; // reset metric when category changes
      updateSegmentButtons(catBtns, state.category);
      renderMetricOptions();
    });
  });

  // Step 1 → Step 2
  document.getElementById('step1-next').addEventListener('click', function () {
    var nameEl    = document.getElementById('comp-name');
    var startEl   = document.getElementById('start-time');
    var endEl     = document.getElementById('end-time');
    var nameErr   = document.getElementById('name-error');
    var metricErr = document.getElementById('metric-error');
    var timeErr   = document.getElementById('time-error');
    var valid = true;

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

  // Initial render
  renderMetricOptions();
  renderStepIndicator();
})();

// ── Fetch tracked players ─────────────────────────────────────────────────────
// Fetches the list of tracked characters from the local API. Called when
// navigating to step 2 for the first time; subsequent visits use the cache.

function fetchPlayers() {
  if (state.allPlayers.length > 0) {
    renderStep2();
    return;
  }

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
      if (el) {
        el.innerHTML = '<p class="text-red-400 text-sm text-center py-8">Failed to load players: ' + escHtml(err.message) + '</p>';
      }
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

  // Update the "Next" button label based on whether step 3 is needed
  var nextBtn = document.getElementById('step2-next');
  if (nextBtn) {
    if (needsStep3()) {
      nextBtn.textContent = 'Next: Selection \u2192';
      nextBtn.className = 'px-6 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors';
    } else {
      nextBtn.textContent = 'Create Competition \u2713';
      nextBtn.className = 'px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors';
    }
  }

  if (state.type === 'solo') {
    renderSoloParticipants(el);
  } else {
    renderTeamBuilder(el);
  }
}

// Renders a checkbox list of all tracked players for solo competitions.
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
      // Sync the card border colour without a full re-render
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

// Renders the team builder: a list of team cards with name inputs and player
// assignment dropdowns, plus an "Add Team" button below.
function renderTeamBuilder(container) {
  // Seed with one empty team on first render
  if (state.teams.length === 0) {
    state.teams.push({ id: state.nextTeamId++, name: '', players: [] });
  }

  // Build the flat list of all assigned players across all teams
  var allAssigned = [];
  state.teams.forEach(function (t) {
    t.players.forEach(function (p) { allAssigned.push(p); });
  });

  var html = '<h3 class="text-sm font-medium text-slate-300 mb-3">Build Teams</h3>';
  html += '<div class="space-y-3" id="teams-list">';
  state.teams.forEach(function (team) {
    html += buildTeamCardHtml(team, allAssigned);
  });
  html += '</div>';

  var canAdd = state.teams.length < state.allPlayers.length;
  html += '<button type="button" id="add-team-btn" '
    + 'class="mt-4 w-full px-4 py-2.5 rounded-lg border border-dashed border-slate-600 text-slate-400 text-sm '
    + 'hover:border-slate-400 hover:text-slate-200 transition-colors'
    + (canAdd ? '' : ' opacity-40 cursor-not-allowed') + '">';
  html += '+ Add Team</button>';
  html += '<p id="teams-error" class="mt-3 text-xs text-red-400 hidden"></p>';

  container.innerHTML = html;
  bindTeamEvents(container);
}

// Returns the inner HTML for a single team card.
function buildTeamCardHtml(team, allAssigned) {
  var html = '<div class="rounded-lg border border-slate-600 bg-slate-700/40 p-4" data-team-id="' + team.id + '">';

  // Team name input + remove button
  html += '<div class="flex items-center gap-2 mb-3">';
  html += '<input type="text" class="team-name-input flex-1 px-2.5 py-1.5 rounded-lg bg-slate-600 border border-slate-500 '
    + 'text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" '
    + 'placeholder="Team name" value="' + escAttr(team.name) + '" />';
  html += '<button type="button" class="remove-team-btn p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-600 transition-colors" title="Remove team">';
  html += '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">'
    + '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
  html += '</button>';
  html += '</div>';

  // Chips for players already on this team
  if (team.players.length > 0) {
    html += '<div class="flex flex-wrap gap-1.5 mb-3">';
    team.players.forEach(function (player) {
      html += '<span class="flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-sky-900/50 border border-sky-700 text-xs text-sky-300">';
      html += escHtml(player);
      html += '<button type="button" class="remove-player-btn ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-sky-700/60 text-sky-400 hover:text-white transition-colors" '
        + 'data-player="' + escAttr(player) + '" title="Remove">&times;</button>';
      html += '</span>';
    });
    html += '</div>';
  }

  // Dropdown to add an unassigned player to this team
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

// Attaches all event listeners for team cards within a container.
// Called after renderTeamBuilder rebuilds the DOM.
function bindTeamEvents(container) {
  // Team name input → update state
  container.querySelectorAll('.team-name-input').forEach(function (input) {
    var teamId = parseInt(input.closest('[data-team-id]').dataset.teamId);
    input.addEventListener('input', function () {
      var team = state.teams.find(function (t) { return t.id === teamId; });
      if (team) team.name = this.value;
    });
  });

  // Remove team button → remove from state and re-render
  container.querySelectorAll('.remove-team-btn').forEach(function (btn) {
    var teamId = parseInt(btn.closest('[data-team-id]').dataset.teamId);
    btn.addEventListener('click', function () {
      state.teams = state.teams.filter(function (t) { return t.id !== teamId; });
      renderStep2();
    });
  });

  // Add player dropdown → assign player to team
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

  // Remove player chip × button → unassign player from team
  container.querySelectorAll('.remove-player-btn').forEach(function (btn) {
    var teamId = parseInt(btn.closest('[data-team-id]').dataset.teamId);
    var player = btn.dataset.player;
    btn.addEventListener('click', function () {
      var team = state.teams.find(function (t) { return t.id === teamId; });
      if (team) team.players = team.players.filter(function (p) { return p !== player; });
      renderStep2();
    });
  });

  // Add team button
  var addBtn = document.getElementById('add-team-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      if (state.teams.length >= state.allPlayers.length) return;
      state.teams.push({ id: state.nextTeamId++, name: '', players: [] });
      renderStep2();
    });
  }
}

// Step 2 navigation buttons
document.getElementById('step2-back').addEventListener('click', function () {
  showStep(1);
});

document.getElementById('step2-next').addEventListener('click', function () {
  var valid = true;

  if (state.type === 'solo') {
    var errEl = document.getElementById('participants-error');
    if (state.selectedPlayers.length < 2) {
      if (errEl) { errEl.textContent = 'Select at least 2 participants.'; errEl.classList.remove('hidden'); }
      valid = false;
    } else if (errEl) {
      errEl.classList.add('hidden');
    }
  } else {
    var errEl = document.getElementById('teams-error');
    var filledTeams = state.teams.filter(function (t) { return t.name.trim() && t.players.length > 0; });
    if (filledTeams.length < 2) {
      if (errEl) { errEl.textContent = 'Define at least 2 named teams with at least one player each.'; errEl.classList.remove('hidden'); }
      valid = false;
    } else if (errEl) {
      errEl.classList.add('hidden');
    }
  }

  if (!valid) return;

  if (needsStep3()) {
    showStep(3);
    if (state.category === 'boss') fetchBosses();
  } else {
    createCompetition();
  }
});

// ── Fetch bosses from WOM ─────────────────────────────────────────────────────
// Only needed if the competition category is "boss". Fetches once and caches.

function formatBossName(raw) {
  return String(raw)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function fetchBosses() {
  if (state.allBosses.length > 0) {
    renderStep3();
    return;
  }

  fetch('https://api.wiseoldman.net/v2/efficiency/rates?type=main&metric=ehb')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      state.allBosses = (Array.isArray(data) ? data : [])
        .map(function (entry) { return formatBossName(entry.boss || entry.skill || ''); })
        .filter(Boolean);
      if (state.step === 3) renderStep3();
    })
    .catch(function () {
      // Fallback hardcoded list if the API is unreachable
      state.allBosses = [
        'Abyssal Sire', 'Alchemical Hydra', 'Barrows', 'Callisto', 'Cerberus',
        'Commander Zilyana', 'Corporeal Beast', 'Dagannoth Kings', 'General Graardor',
        'Giant Mole', 'Grotesque Guardians', 'Hespori', 'Kalphite Queen',
        'King Black Dragon', 'Kraken', "K'ril Tsutsaroth", 'Kree\'Arra', 'Mimic',
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

// Renders a single boss dropdown.
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

// Renders the skill assignment UI: a toggle for same/different skill, then
// either a single dropdown or one dropdown per participant/team.
function renderSkillSelector(container) {
  // Participants are either the selected player list (solo) or team names (team)
  var participants = state.type === 'solo'
    ? state.selectedPlayers
    : state.teams.map(function (t) { return t.name || 'Unnamed Team'; });

  var noun = state.type === 'team' ? 'team' : 'participant';

  var html = '';

  // Same-for-all vs per-participant toggle
  html += '<div class="mb-5">';
  html += '<label class="block text-sm font-medium text-slate-300 mb-2">Skill Assignment</label>';
  html += '<div class="inline-flex rounded-lg border border-slate-600 overflow-hidden">';

  var sameActive = state.sameSkillForAll;
  html += '<button type="button" data-same="true" class="same-toggle px-4 py-2 text-sm font-medium transition-colors '
    + (sameActive ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600') + '">'
    + 'Same skill for all</button>';
  html += '<button type="button" data-same="false" class="same-toggle px-4 py-2 text-sm font-medium border-l border-slate-600 transition-colors '
    + (!sameActive ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600') + '">'
    + 'Different per ' + noun + '</button>';
  html += '</div>';
  html += '</div>';

  if (state.sameSkillForAll) {
    // Single shared skill dropdown
    html += '<div>';
    html += '<label class="block text-sm font-medium text-slate-300 mb-1.5">Skill</label>';
    html += buildSkillSelect('global-skill', state.selectedSkill, 'w-full max-w-xs');
    html += '</div>';
  } else {
    // One skill dropdown per participant or team
    html += '<div class="space-y-3">';
    participants.forEach(function (participant, i) {
      var key = state.type === 'team' ? 'team_' + state.teams[i].id : participant;
      var current = state.playerSkills[key] || '';
      html += '<div class="flex items-center gap-3">';
      html += '<span class="text-sm font-medium text-slate-200 w-28 shrink-0 truncate">' + escHtml(participant) + '</span>';
      html += buildSkillSelect('per-skill_' + escAttr(key), current, 'flex-1 per-skill-select', key);
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<p id="selection-error" class="mt-3 text-xs text-red-400 hidden"></p>';
  container.innerHTML = html;

  // Bind same-for-all toggle
  container.querySelectorAll('.same-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.sameSkillForAll = this.dataset.same === 'true';
      renderStep3();
    });
  });

  // Bind global skill select
  var globalSel = document.getElementById('global-skill');
  if (globalSel) {
    globalSel.addEventListener('change', function () { state.selectedSkill = this.value; });
  }

  // Bind per-participant skill selects
  container.querySelectorAll('.per-skill-select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      state.playerSkills[this.dataset.key] = this.value;
    });
  });
}

// Returns the HTML for a skill <select> element.
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

// Step 3 navigation buttons
document.getElementById('step3-back').addEventListener('click', function () {
  showStep(2);
});

document.getElementById('step3-create').addEventListener('click', function () {
  var errEl = document.getElementById('selection-error');
  var valid = true;

  if (state.category === 'boss') {
    if (!state.selectedBoss) {
      if (errEl) { errEl.textContent = 'Please select a boss.'; errEl.classList.remove('hidden'); }
      valid = false;
    }
  } else if (state.sameSkillForAll) {
    if (!state.selectedSkill) {
      if (errEl) { errEl.textContent = 'Please select a skill.'; errEl.classList.remove('hidden'); }
      valid = false;
    }
  } else {
    // Per-participant: every participant must have a skill assigned
    var participants = state.type === 'solo'
      ? state.selectedPlayers
      : state.teams.map(function (t, i) { return { key: 'team_' + state.teams[i].id }; });

    var missingSkill = false;
    if (state.type === 'solo') {
      missingSkill = state.selectedPlayers.some(function (p) { return !state.playerSkills[p]; });
    } else {
      missingSkill = state.teams.some(function (t) { return !state.playerSkills['team_' + t.id]; });
    }

    if (missingSkill) {
      if (errEl) { errEl.textContent = 'Please assign a skill to every ' + (state.type === 'team' ? 'team' : 'participant') + '.'; errEl.classList.remove('hidden'); }
      valid = false;
    }
  }

  if (!valid) return;
  createCompetition();
});

// ── Create competition ────────────────────────────────────────────────────────
// Generates a 9-digit numeric creator code and shows the confirmation modal.
// No API call yet — database persistence will be added in a future step.

function generateCreatorCode() {
  var code = '';
  for (var i = 0; i < 9; i++) code += Math.floor(Math.random() * 10);
  return code;
}

function createCompetition() {
  var code = generateCreatorCode();
  document.getElementById('creator-code-display').textContent = code;
  document.getElementById('creator-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // prevent scrolling behind modal
}

// ── Creator code modal ────────────────────────────────────────────────────────

document.getElementById('copy-code-btn').addEventListener('click', function () {
  var code = document.getElementById('creator-code-display').textContent;
  var feedback = document.getElementById('copy-feedback');

  function showCopied() {
    feedback.textContent = 'Copied!';
    setTimeout(function () { feedback.textContent = ''; }, 2000);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(showCopied).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }

  function fallbackCopy() {
    var ta = document.createElement('textarea');
    ta.value = code;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showCopied(); } catch (e) {}
    document.body.removeChild(ta);
  }
});
