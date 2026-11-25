// The same fight sounds as the 2D arena, driven by fight time so pause and scrub stay quiet.
const KEY = 'spoop-arena-sound';
const HIT_CUT = 0.53;

function pool(src, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    list.push(audio);
  }
  return { list, i: 0 };
}

function go(audio) {
  const pending = audio.play();
  if (pending) pending.catch(() => {});
}

export function createSound() {
  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (err) { /* private mode */ }
  let unlocked = false;
  let mode = 'off';
  let hitI = 0;
  let fight = null;

  const hits = pool('/audio/hit.mp3', 8);
  const misses = pool('/audio/miss.mp3', 6);
  const bows = pool('/audio/longbow.ogg', 4);
  const fires = pool('/audio/dragon-fire.ogg', 2);
  const magics = pool('/audio/magic-atk.ogg', 4);
  const moles = pool('/audio/mole-atk.ogg', 2);
  const charges = pool('/audio/brutus-charge.ogg', 2);
  const fightMusic = new Audio('/audio/fight_music.mp3');
  fightMusic.loop = true;
  fightMusic.preload = 'auto';
  const victory = new Audio('/audio/victory.mp3');
  victory.preload = 'auto';
  const all = [fightMusic, victory].concat(hits.list, misses.list, bows.list, fires.list, magics.list, moles.list, charges.list);

  function muted() {
    all.forEach((audio) => { audio.muted = !on; });
  }

  function play(group, volume, rate) {
    const audio = group.list[group.i];
    group.i = (group.i + 1) % group.list.length;
    audio.pause();
    try { audio.currentTime = 0; } catch (err) { /* not ready yet */ }
    audio.playbackRate = rate || 1;
    audio.volume = volume;
    go(audio);
    return audio;
  }

  function playHit(lethal) {
    const audio = play(hits, 0.45 + Math.random() * 0.5, 0.86 + Math.random() * 0.3);
    if (lethal) return;
    const gen = (Number(audio.dataset.gen) || 0) + 1;
    audio.dataset.gen = String(gen);
    const started = performance.now();
    function cut(now) {
      if (audio.dataset.gen !== String(gen)) return;
      if ((now - started) / 1000 >= HIT_CUT) {
        audio.pause();
        return;
      }
      requestAnimationFrame(cut);
    }
    requestAnimationFrame(cut);
  }

  function applyMusic() {
    muted();
    if (!unlocked || !on) {
      if (!on) {
        fightMusic.pause();
        victory.pause();
      }
      return;
    }
    if (mode === 'fight') {
      victory.pause();
      if (fightMusic.paused) go(fightMusic);
      return;
    }
    if (mode === 'victory') {
      fightMusic.pause();
      if (victory.paused && victory.currentTime < 0.2) go(victory);
      return;
    }
    fightMusic.pause();
    victory.pause();
  }

  // One pass over the hits and hazards whose time falls in (prev, now]. A scrub jumps too far
  // to play, so it only moves the cursor.
  function cue(bout, prev, now) {
    if (bout !== fight) {
      fight = bout;
      hitI = 0;
    }
    const list = (bout && bout.hits) || [];
    if (!(now > prev) || now - prev > 1.25) {
      hitI = 0;
      while (hitI < list.length && list[hitI].t <= now) hitI += 1;
      return;
    }
    if (!on || !unlocked) {
      while (hitI < list.length && list[hitI].t <= now) hitI += 1;
      return;
    }
    const fighters = bout.fighters || [];
    while (hitI < list.length && list[hitI].t <= now) {
      const hit = list[hitI];
      hitI += 1;
      if (!(hit.t > prev)) continue;
      const attacker = fighters.find((f) => f.id === hit.from);
      const victim = fighters.find((f) => f.id === hit.to);
      const miss = (hit.miss || !(hit.amount > 0)) && hit.effect !== 'madness';
      if (hit.effect !== 'madness' && miss) play(misses, 0.4 + Math.random() * 0.45, 0.86 + Math.random() * 0.3);
      else if (hit.effect !== 'madness' || hit.amount > 0) playHit(!!(victim && !victim.monster && hit.hp <= 0));
      if (hit.style === 'ranged') play(bows, 0.55 + Math.random() * 0.35, 0.9 + Math.random() * 0.2);
      if (attacker && !attacker.monster && hit.style === 'magic') play(magics, 0.62, 1);
      if (hit.attack === 'fire' && !miss) play(fires, 0.85, 1);
    }
    const mole = fighters.some((f) => f.monster === 'mole');
    (bout.hazards || []).forEach((hz) => {
      if (!hz) return;
      let at = 0;
      let group = null;
      let volume = 0.85;
      if (hz.attack === 'charge' || hz.attack === 'swoop') {
        at = hz.t0 + (hz.t1 - hz.t0) * 0.62;
        group = charges;
        volume = 0.9;
      } else if (mole && (hz.attack === 'claw' || hz.attack === 'dirt' || hz.attack === 'burrow')) {
        at = hz.t1;
        group = moles;
      }
      if (group && at > prev && at <= now) play(group, volume, 1);
    });
  }

  function music(next) {
    if (next === mode) {
      applyMusic();
      return;
    }
    mode = next;
    if (next === 'fight') {
      try { fightMusic.currentTime = fightMusic.currentTime || 0; } catch (err) { /* not ready */ }
    }
    if (next !== 'victory') {
      try { victory.currentTime = 0; } catch (err) { /* not ready */ }
    }
    applyMusic();
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    applyMusic();
  }

  muted();
  return {
    get on() { return on; },
    get debug() { return { on, unlocked, mode, fight: fightMusic.paused, victory: victory.paused }; },
    setOn(next) {
      on = !!next;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (err) { /* private mode */ }
      unlocked = true;
      applyMusic();
    },
    unlock,
    music,
    cue,
  };
}
