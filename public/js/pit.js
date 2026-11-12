(function () {
  const picks = document.getElementById('pit-picks');
  const seedEl = document.getElementById('pit-seed');
  const speedEl = document.getElementById('pit-speed');
  const formationEl = document.getElementById('pit-formation');
  const fightBtn = document.getElementById('pit-fight');
  const tourneyBtn = document.getElementById('pit-tourney');
  const replayBtn = document.getElementById('pit-replay');
  const statusEl = document.getElementById('arena-status');
  const notesEl = document.getElementById('pit-notes');
  let last = null;
  let busy = false;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function selected() {
    return Array.from(picks.querySelectorAll('input:checked')).map((box) => box.value);
  }

  function everyone() {
    return Array.from(picks.querySelectorAll('input')).map((box) => box.value);
  }

  function checkEveryone() {
    picks.querySelectorAll('input').forEach((box) => { box.checked = true; });
  }

  function renderPicks(spoops) {
    picks.innerHTML = spoops.map((spoop) => {
      const prayer = (spoop.skills || []).find((skill) => skill.id === 'prayer');
      const weapon = spoop.equipped && spoop.equipped.weapon;
      const style = weapon && weapon.style ? weapon.style : 'melee';
      const hint = 'Cb ' + spoop.combat + ' · gear ' + (spoop.gearRating || 0) + ' · ' + style + ' · prayer ' + (prayer ? prayer.level : 1);
      return '<label title="' + escapeHtml(hint) + '"><input type="checkbox" checked value="' + escapeHtml(spoop.name) + '">' +
        escapeHtml(spoop.name) + '</label>';
    }).join('');
  }

  function play(data) {
    last = data;
    if (notesEl) notesEl.textContent = '';
    statusEl.textContent = data.tournament ? 'Tournament' : 'Test fight';
    if (data.tournament && notesEl) {
      const mins = Math.max(1, Math.round((Number(data.duration) || 0) / 60000));
      const pot = data.tournament.pot != null ? Number(data.tournament.pot).toLocaleString('en-US') + ' gold pot. ' : '';
      notesEl.textContent = pot + 'About ' + mins + ' min, start to finish.';
    }
    if (data.tournament && window.ArenaPit && window.ArenaPit.playTournament) {
      window.ArenaPit.playTournament(data.tournament, speedEl.value);
      return;
    }
    if (window.ArenaPit) window.ArenaPit.play(data.bout, speedEl.value);
  }

  async function fight(formation) {
    if (busy) return;
    if (formation && formationEl) formationEl.value = formation;
    const dragon = formationEl && formationEl.value === 'dragon';
    const bracket = formationEl && formationEl.value === 'bracket';
    if (dragon || bracket) checkEveryone();
    const names = dragon ? everyone() : selected();
    if (names.length < 2) {
      statusEl.textContent = 'Pick at least two spoops.';
      return;
    }
    if (!seedEl.value.trim()) seedEl.value = String(Date.now());
    busy = true;
    fightBtn.disabled = true;
    if (tourneyBtn) tourneyBtn.disabled = true;
    statusEl.textContent = 'Running the fight…';
    try {
      const res = await fetch('/api/spoops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'arena-test',
          names,
          seed: seedEl.value.trim(),
          formation: formationEl ? formationEl.value : 'ring',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not run the fight');
      if (data.seed) seedEl.value = data.seed;
      play(data);
    } catch (err) {
      statusEl.textContent = err.message;
    } finally {
      busy = false;
      fightBtn.disabled = false;
      if (tourneyBtn) tourneyBtn.disabled = false;
    }
  }

  if (formationEl) {
    formationEl.addEventListener('change', function () {
      if (formationEl.value === 'dragon' || formationEl.value === 'bracket') checkEveryone();
    });
  }
  fightBtn.addEventListener('click', () => fight());
  if (tourneyBtn) tourneyBtn.addEventListener('click', () => fight('bracket'));
  replayBtn.addEventListener('click', () => {
    if (last) play(last);
  });

  const autoFlow = new URLSearchParams(location.search).has('flow');
  fetch('/api/spoops')
    .then((res) => res.json())
    .then((data) => {
      renderPicks(data.spoops || []);
      if (autoFlow) fight('bracket');
    })
    .catch(() => {
      statusEl.textContent = 'Could not load spoops.';
    });
})();
