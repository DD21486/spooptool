(function () {
  const picks = document.getElementById('pit-picks');
  const seedEl = document.getElementById('pit-seed');
  const speedEl = document.getElementById('pit-speed');
  const fightBtn = document.getElementById('pit-fight');
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

  function renderPicks(spoops) {
    picks.innerHTML = spoops.map((spoop) => {
      const prayer = (spoop.skills || []).find((skill) => skill.id === 'prayer');
      const weapon = spoop.equipped && spoop.equipped.weapon;
      const style = weapon && weapon.style ? weapon.style : 'melee';
      const hint = 'Cb ' + spoop.combat + ' · ' + style + ' · prayer ' + (prayer ? prayer.level : 1);
      return '<label title="' + escapeHtml(hint) + '"><input type="checkbox" checked value="' + escapeHtml(spoop.name) + '">' +
        escapeHtml(spoop.name) + '</label>';
    }).join('');
  }

  function describe(data) {
    const fighters = (data.bout && data.bout.fighters) || [];
    const bits = fighters.map((f) => {
      const prayer = f.prayer;
      const overhead = prayer ? prayer.name + ', ' + Math.round(prayer.off) + 's' : 'no prayer';
      return f.name + ' ' + overhead;
    });
    const winner = data.winner || 'Nobody';
    return winner + ' wins. ' + Math.round((data.duration || 0) * 10) / 10 + 's. ' + bits.join(' · ');
  }

  function play(data) {
    last = data;
    notesEl.textContent = describe(data);
    statusEl.textContent = 'Test fight';
    if (window.ArenaPit) window.ArenaPit.play(data.bout, speedEl.value);
  }

  async function fight() {
    if (busy) return;
    const names = selected();
    if (names.length < 2) {
      statusEl.textContent = 'Pick at least two spoops.';
      return;
    }
    if (!seedEl.value.trim()) seedEl.value = String(Date.now());
    busy = true;
    fightBtn.disabled = true;
    statusEl.textContent = 'Running the fight…';
    try {
      const res = await fetch('/api/spoops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'arena-test', names, seed: seedEl.value.trim() }),
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
    }
  }

  fightBtn.addEventListener('click', fight);
  replayBtn.addEventListener('click', () => {
    if (last) play(last);
  });

  fetch('/api/spoops')
    .then((res) => res.json())
    .then((data) => renderPicks(data.spoops || []))
    .catch(() => {
      statusEl.textContent = 'Could not load spoops.';
    });
})();
