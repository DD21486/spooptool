// sandbox.js — all behaviour for sandbox-split.html.
// Loaded at the end of <body> so every DOM element already exists when
// these IIFEs run. No framework; plain ES5-compatible JavaScript.

// ── Shared utilities ─────────────────────────────────────────────────────────

// Build the cumulative XP-per-level lookup table using the standard OSRS
// formula (same as lib/xpTable.js on the server side).
// Index = level (1–99). XP_TABLE[1] = 0, XP_TABLE[2] = 83, …, XP_TABLE[99] = 13,034,431.
var XP_TABLE = (function () {
  var table = [0, 0]; // index 0 unused; index 1 = level 1 = 0 XP
  var total = 0;
  for (var i = 1; i <= 98; i++) {
    total = Math.floor(total + i + 300 * Math.pow(2, i / 7));
    table[i + 1] = Math.floor(total / 4);
  }
  return table;
})();

// Returns the level (1–99) that corresponds to a given XP value.
// Walks the table from the top down and returns the first level whose
// threshold the XP meets or exceeds.
function xpToLevel(xp) {
  for (var l = 98; l >= 1; l--) {
    if (xp >= XP_TABLE[l + 1]) return l + 1;
  }
  return 1;
}

// Formats a number with locale-appropriate thousands separators (e.g. 1,234,567).
function fmt(n) { return Number(n).toLocaleString(); }

// ── Header menu toggle ───────────────────────────────────────────────────────
// Opens/closes the top-right hamburger dropdown. Clicking outside the menu
// closes it via a document-level listener.
(function () {
  var btn = document.getElementById('header-menu-btn');
  var dropdown = document.getElementById('header-menu-dropdown');
  if (!btn || !dropdown) return;
  function open() { dropdown.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); }
  function close() { dropdown.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); }
  function toggle() { if (dropdown.classList.contains('hidden')) open(); else close(); }
  btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  document.addEventListener('click', function () { close(); });
  // Prevent clicks inside the dropdown from bubbling up and immediately closing it.
  dropdown.addEventListener('click', function (e) { e.stopPropagation(); });
})();

// ── ASCII title animation ────────────────────────────────────────────────────
// Renders the "SANDBOX" figlet art into #ascii-title, wrapping each character
// in a <span> with a staggered animation-delay so the art fades in row-by-row.
// After the fade-in completes, shimmer and flash effects run on a loop.
(function () {
  // Figlet "Big Money-nw" style art for "SANDBOX".
  var lines = [
    '  /$$$$$$   /$$$$$$  /$$   /$$  /$$$$$$$  /$$$$$$$   /$$$$$$  /$$   /$$',
    ' /$$__  $$ /$$__  $$| $$$ | $$ | $$__  $$| $$__  $$ /$$__  $$|  $$/ $$/',
    '| $$  \\__/| $$  \\ $$| $$$$| $$ | $$  | $$| $$  \\ $$| $$  \\ $$ \\  $$$$/ ',
    '|  $$$$$$ | $$$$$$$$| $$ $$ $$ | $$  | $$| $$$$$$$/| $$  | $$  >$$  $$<',
    ' \\____  $$| $$__  $$| $$  $$$$ | $$  | $$| $$__  $$| $$  | $$ /$$/\\  $$',
    ' /$$  \\ $$| $$  \\ $$| $$\\  $$$ | $$  | $$| $$  \\ $$| $$  | $$| $$  \\ $$',
    '|  $$$$$$/| $$  | $$| $$ \\  $$ | $$$$$$$/ | $$$$$$$/|  $$$$$$/| $$  | $$',
    ' \\______/ |__/  |__/|__/  \\__/ |_______/  |_______/  \\______/ |__/  \\__/'
  ];

  var el = document.getElementById('ascii-title');
  if (!el) return;

  // Chrome can't animate background-clip:text on child spans, so we use a
  // solid fallback colour instead (handled via the ascii-chrome CSS class).
  if (/Chrome/.test(navigator.userAgent)) el.classList.add('ascii-chrome');

  var durationMs = 3000; // total time for the row-by-row fade-in
  var html = '';

  // Escape special HTML characters so the art renders correctly in innerHTML.
  function esc(c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c; }

  // Build the inner HTML: one <span class="ascii-char"> per character,
  // with an animation-delay proportional to the row index.
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var delay = (i / lines.length) * durationMs;
    for (var j = 0; j < line.length; j++) {
      html += '<span class="ascii-char" style="animation-delay:' + delay + 'ms">' + esc(line[j]) + '</span>';
    }
    if (i < lines.length - 1) html += '\n'; // preserve line breaks
  }
  el.innerHTML = '<span class="ascii-gradient-inner">' + html + '</span>';

  // Collect only non-whitespace characters for the shimmer/flash effects
  // (animating spaces is pointless and wastes work).
  var allChars = el.querySelectorAll('.ascii-char');
  var visibleChars = [];
  for (var i = 0; i < allChars.length; i++) {
    var text = (allChars[i].textContent || '').trim();
    if (text.length > 0) visibleChars.push(allChars[i]);
  }

  var flashColors = ['#ffffff', '#38bdf8', '#fbbf24', '#a3e635', '#f472b6', '#c084fc', '#2dd4bf'];

  // Briefly dims a random character (opacity pulse).
  function triggerShimmer() {
    if (visibleChars.length === 0) return;
    var span = visibleChars[Math.floor(Math.random() * visibleChars.length)];
    // Force a reflow by reading offsetHeight so re-adding the class restarts the animation.
    span.classList.remove('ascii-shimmer');
    span.offsetHeight;
    span.classList.add('ascii-shimmer');
    setTimeout(function () { span.classList.remove('ascii-shimmer'); }, 2000);
  }

  // Briefly flashes a random character a bright colour via a CSS custom property.
  function triggerFlash() {
    if (visibleChars.length === 0) return;
    var span = visibleChars[Math.floor(Math.random() * visibleChars.length)];
    span.style.setProperty('--flash-color', flashColors[Math.floor(Math.random() * flashColors.length)]);
    span.classList.remove('ascii-flash');
    span.offsetHeight;
    span.classList.add('ascii-flash');
    setTimeout(function () { span.classList.remove('ascii-flash'); }, 800);
  }

  function startShimmer() {
    triggerShimmer();
    setInterval(triggerShimmer, 500);
    triggerFlash();
    setInterval(triggerFlash, 600);
  }
  // Wait until the fade-in finishes before starting the ongoing effects.
  setTimeout(startShimmer, durationMs + 400);
})();

// ── EHP section collapse toggle ──────────────────────────────────────────────
// Clicking the section header (anywhere except the account-type dropdown)
// toggles the table body in/out of view.
(function () {
  var header = document.getElementById('section-header');
  var body = document.getElementById('section-body');
  var arrow = document.getElementById('section-arrow');
  var controls = document.getElementById('section-controls'); // dropdown lives here
  var open = true;
  header.addEventListener('click', function (e) {
    // Don't collapse when the user is interacting with the account-type select.
    if (controls.contains(e.target)) return;
    open = !open;
    body.classList.toggle('hidden', !open);
    arrow.textContent = open ? '▼' : '▶';
  });
})();

// ── EHP rates fetch & render ─────────────────────────────────────────────────
// Fetches EHP (Efficient Hours Played) skill rates from the Wise Old Man API
// for the selected account type, then builds the table rows.
// API: GET https://api.wiseoldman.net/v2/efficiency/rates?type=<type>&metric=ehp
// Response: array of { skill, methods: [{ startExp, rate, description }] }
(function () {
  var tbody = document.getElementById('rates-tbody');
  var loading = document.getElementById('rates-loading');
  var errorEl = document.getElementById('rates-error');
  var typeSelect = document.getElementById('type-select');

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Builds all table rows from the API response array.
  function renderRates(data) {
    tbody.innerHTML = '';
    if (!Array.isArray(data) || data.length === 0) {
      loading.textContent = 'No data returned.';
      return;
    }
    loading.classList.add('hidden');

    data.forEach(function (entry, idx) {
      var skillName = capitalize(entry.skill || entry.boss || 'Unknown');
      var methods = Array.isArray(entry.methods) ? entry.methods : [];

      methods.forEach(function (method, mi) {
        var tr = document.createElement('tr');
        tr.className = 'border-b border-slate-700/50 hover:bg-slate-800/40';

        // The skill name cell spans all method rows for that skill (rowspan).
        var skillCell = '';
        if (mi === 0) {
          skillCell = '<td class="px-4 py-2 font-medium text-slate-200 align-top" rowspan="' + methods.length + '">' + skillName + '</td>';
        }

        // End XP is the start of the next method, or 200m if this is the last phase.
        var nextMethod = methods[mi + 1];
        var rawEndXp = nextMethod ? nextMethod.startExp : 200000000;
        var startLvl = xpToLevel(method.startExp || 0);
        var endLvl = xpToLevel(rawEndXp);

        tr.innerHTML = skillCell +
          '<td class="px-4 py-2 text-slate-300">' + (method.description || '—') + '</td>' +
          '<td class="px-4 py-2 text-right font-mono text-slate-400">' + fmt(method.startExp || 0) + '</td>' +
          '<td class="px-4 py-2 text-right font-mono text-amber-400">' + startLvl + '</td>' +
          '<td class="px-4 py-2 text-right font-mono text-slate-400">' + fmt(rawEndXp) + '</td>' +
          '<td class="px-4 py-2 text-right font-mono text-amber-400">' + endLvl + '</td>' +
          '<td class="px-4 py-2 text-right font-mono text-sky-300">' + fmt(method.rate || 0) + '</td>';

        tbody.appendChild(tr);
      });

      // Visual separator between skills (thicker border row).
      if (idx < data.length - 1 && methods.length > 0) {
        var sep = document.createElement('tr');
        sep.innerHTML = '<td colspan="7" class="p-0"><div class="border-b border-slate-600/60"></div></td>';
        tbody.appendChild(sep);
      }
    });
  }

  // Fetches rates for the currently selected account type and re-renders.
  function loadRates() {
    loading.classList.remove('hidden');
    errorEl.classList.add('hidden');
    tbody.innerHTML = '';
    loading.textContent = 'Loading…';

    fetch('https://api.wiseoldman.net/v2/efficiency/rates?type=' + typeSelect.value + '&metric=ehp')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { renderRates(data); })
      .catch(function (err) {
        loading.classList.add('hidden');
        errorEl.classList.remove('hidden');
        errorEl.textContent = 'Failed to load rates: ' + err.message;
      });
  }

  typeSelect.addEventListener('change', loadRates);
  loadRates(); // initial load
})();

// ── XP threshold table & collapse toggle ────────────────────────────────────
// Renders the 1–99 level XP table entirely client-side using XP_TABLE,
// then wires up the collapse toggle for the section header.
(function () {
  var tbody = document.getElementById('xp-tbody');

  for (var lvl = 1; lvl <= 99; lvl++) {
    var startXp = XP_TABLE[lvl];
    // Level 99's "end" is the 200m XP cap, not a level-100 threshold.
    var endXp = lvl < 99 ? XP_TABLE[lvl + 1] : 200000000;
    var diff = endXp - startXp; // XP needed to reach the next level

    var tr = document.createElement('tr');
    tr.className = 'border-b border-slate-700/50 hover:bg-slate-800/40';
    tr.innerHTML =
      '<td class="px-4 py-1.5 text-right font-mono text-slate-200">' + lvl + '</td>' +
      '<td class="px-4 py-1.5 text-right font-mono text-slate-400">' + fmt(startXp) + '</td>' +
      '<td class="px-4 py-1.5 text-right font-mono text-slate-400">' + fmt(endXp) + '</td>' +
      '<td class="px-4 py-1.5 text-right font-mono text-sky-300">' + fmt(diff) + '</td>';
    tbody.appendChild(tr);
  }

  // Collapse toggle — same pattern as the EHP section above.
  var header = document.getElementById('xp-section-header');
  var body = document.getElementById('xp-section-body');
  var arrow = document.getElementById('xp-section-arrow');
  var open = true;
  header.addEventListener('click', function () {
    open = !open;
    body.classList.toggle('hidden', !open);
    arrow.textContent = open ? '▼' : '▶';
  });
})();
