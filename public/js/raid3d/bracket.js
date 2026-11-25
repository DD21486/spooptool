// The 2D bracket, driven by the show clock so a late joiner sees the same fly-in.
let scrim = null;
let built = null;
let entrants = [];
let castById = new Map();
let sig = '';

function weigh(rounds) {
  let outputs = [];
  rounds.forEach((round, index) => {
    if (!index) {
      round.groups.forEach((group) => {
        group.weight = Math.max(1, group.slots.length);
        group.slots.forEach((slot) => { slot.weight = 1; });
      });
    } else {
      let cursor = 0;
      round.groups.forEach((group) => {
        group.weight = 0;
        group.slots.forEach((slot) => {
          slot.weight = outputs[cursor] || 1;
          cursor += 1;
          group.weight += slot.weight;
        });
      });
    }
    outputs = round.groups.map((group) => group.weight);
  });
  return outputs.reduce((sum, weight) => sum + weight, 0) || 1;
}

function column(round, units, last) {
  const col = document.createElement('div');
  col.className = 'tourney-col' + (last ? ' is-last' : '');
  const label = document.createElement('p');
  label.className = 'tourney-col-label';
  label.textContent = round.name === 'Bye' ? '' : round.name;
  col.appendChild(label);
  const stack = document.createElement('div');
  stack.className = 'tourney-stack';
  stack.style.gridTemplateRows = 'repeat(' + units + ', minmax(0, 1fr))';
  let row = 1;
  round.groups.forEach((group) => {
    const pair = document.createElement('div');
    const single = group.bye || group.slots.length < 2;
    pair.className = single ? 'tourney-bye' : 'tourney-pair';
    pair.style.gridRow = row + ' / span ' + group.weight;
    row += group.weight;
    if (!single && group.slots.length === 2) {
      const top = group.slots[0].weight || 1;
      const bot = group.slots[1].weight || 1;
      const total = top + bot;
      pair.style.gridTemplateRows = top + 'fr ' + bot + 'fr';
      pair.style.setProperty('--join-top', ((top / 2) / total * 100).toFixed(2) + '%');
      pair.style.setProperty('--join-bot', ((top + bot / 2) / total * 100).toFixed(2) + '%');
    }
    group.slots.forEach((slot) => {
      const el = document.createElement('div');
      el.className = 'tourney-slot';
      el.dataset.slot = slot.id;
      pair.appendChild(el);
    });
    stack.appendChild(pair);
  });
  col.appendChild(stack);
  return col;
}

function opening(rounds) {
  const slots = [];
  if (!rounds || !rounds.length) return slots;
  rounds[0].groups.forEach((group) => {
    group.slots.forEach((slot) => { if (slot.playerId) slots.push(slot); });
  });
  return slots;
}

function ensure(stage, tourney) {
  if (built === tourney && scrim && scrim.isConnected) return;
  if (scrim) scrim.remove();
  built = tourney;
  sig = '';
  castById = new Map((tourney.cast || []).map((row) => [row.id, row]));
  const leftRounds = (tourney.sides && tourney.sides.left) || [];
  const rightRounds = (tourney.sides && tourney.sides.right) || [];
  entrants = opening(leftRounds).concat(opening(rightRounds));
  scrim = document.createElement('div');
  scrim.id = 'tourney-scrim';
  scrim.className = 'tourney-scrim';
  const board = document.createElement('div');
  board.className = 'tourney-board';
  const leftUnits = weigh(leftRounds);
  const rightUnits = weigh(rightRounds);
  const left = document.createElement('div');
  left.className = 'tourney-side is-left';
  leftRounds.forEach((round, index) => left.appendChild(column(round, leftUnits, index === leftRounds.length - 1)));
  const right = document.createElement('div');
  right.className = 'tourney-side is-right';
  rightRounds.forEach((round, index) => right.appendChild(column(round, rightUnits, index === rightRounds.length - 1)));
  const center = document.createElement('div');
  center.className = 'tourney-center';
  center.innerHTML = '<p class="tourney-col-label">Final</p><div class="tourney-stack"></div>';
  const stack = center.querySelector('.tourney-stack');
  const mid = tourney.center || {};
  [mid.left, mid.champ, mid.right].forEach((slot) => {
    if (!slot) return;
    const el = document.createElement('div');
    el.className = 'tourney-slot' + (slot === mid.champ ? ' tourney-champ' : '');
    el.dataset.slot = slot.id;
    if (slot === mid.champ) el.innerHTML = '<span class="tourney-champ-kicker">Champion</span>';
    stack.appendChild(el);
  });
  board.append(left, center, right);
  scrim.appendChild(board);
  stage.appendChild(scrim);
  scrim.classList.add('is-in');
}

function slotEl(id) {
  return scrim ? scrim.querySelector('[data-slot="' + id + '"]') : null;
}

function paint(slot, player) {
  if (!slot) return null;
  slot.classList.remove('is-vacant', 'is-out');
  if (!player) {
    const old = slot.querySelector('.tourney-body');
    if (old) old.remove();
    delete slot.dataset.player;
    if (!slot.classList.contains('tourney-champ')) slot.classList.add('is-vacant');
    return null;
  }
  slot.dataset.player = player.id;
  let body = slot.querySelector('.tourney-body');
  if (!body || body.dataset.player !== player.id) {
    body = document.createElement('div');
    body.className = 'tourney-body';
    body.dataset.player = player.id;
    body.innerHTML = '<canvas width="22" height="30"></canvas><span class="tourney-label"></span>';
    const old = slot.querySelector('.tourney-body');
    if (old) old.remove();
    slot.appendChild(body);
    body.querySelector('.tourney-label').textContent = player.name;
    const canvas = body.querySelector('canvas');
    if (canvas && window.SpoopArt) {
      window.SpoopArt.drawSpoop(canvas, { name: player.name, equipped: player.equipped }, { clear: true });
    }
  }
  return body;
}

function dock(slot, player) {
  const body = paint(slot, player);
  if (!body) return;
  body.classList.remove('is-tourney-fly');
  body.style.cssText = '';
}

function centerOf(el) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function ease(u) {
  const t = Math.max(0, Math.min(1, u));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function glide(body, from, to, u, scaleFrom, scaleTo, opacity) {
  const e = ease(u);
  body.classList.add('is-tourney-fly');
  body.style.position = 'fixed';
  body.style.zIndex = '70';
  body.style.margin = '0';
  body.style.left = (from.x + (to.x - from.x) * e) + 'px';
  body.style.top = (from.y + (to.y - from.y) * e) + 'px';
  body.style.transform = 'translate(-50%, -50%) scale(' + (scaleFrom + (scaleTo - scaleFrom) * e) + ')';
  body.style.opacity = String(opacity == null ? 1 : opacity);
}

function clearAll() {
  scrim.querySelectorAll('.tourney-slot').forEach((slot) => {
    slot.classList.remove('is-out', 'is-champion');
    paint(slot, null);
  });
}

// Apply finished byes and matches, then return the slot map of who is standing where.
function settled(tourney, byeDone, matchCount) {
  clearAll();
  const where = new Map();
  entrants.forEach((slot) => {
    const el = slotEl(slot.id);
    const player = castById.get(slot.playerId);
    if (el && player) {
      dock(el, player);
      where.set(slot.id, player);
    }
  });
  if (byeDone) {
    (tourney.byes || []).forEach((bye) => {
      const from = slotEl(bye.from);
      const to = slotEl(bye.to);
      const player = castById.get(bye.playerId);
      if (from) paint(from, null);
      if (to && player) dock(to, player);
      where.delete(bye.from);
      if (player) where.set(bye.to, player);
    });
  }
  const matches = tourney.matches || [];
  for (let i = 0; i < matchCount && i < matches.length; i++) {
    const match = matches[i];
    const from = slotEl(match.winnerFrom);
    const loser = slotEl(match.loserFrom);
    const to = slotEl(match.winnerTo);
    const player = castById.get(match.winnerId);
    if (from) paint(from, null);
    if (loser) {
      const who = castById.get(match.loserId);
      if (who) dock(loser, who);
      loser.classList.add('is-out');
    }
    if (to && player) {
      dock(to, player);
      if (match.winnerTo === 'champ') to.classList.add('is-champion');
    }
  }
  return where;
}

function stageCenter() {
  const rect = scrim.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.46 };
}

export function hideBracket() {
  document.body.classList.remove('is-bracket');
  if (scrim) scrim.hidden = true;
}

export function syncBracket(stage, tourney, phase, ms, matchIndex) {
  if (!stage || !tourney) return hideBracket();
  ensure(stage, tourney);
  document.body.classList.add('is-bracket');
  scrim.hidden = false;
  const matches = tourney.matches || [];
  if (phase === 'entrance') {
    const i = Math.min(entrants.length - 1, Math.max(0, Math.floor(ms / 2000)));
    const key = 'e' + i;
    if (sig !== key) {
      sig = key;
      settled(tourney, false, 0);
      for (let n = i; n < entrants.length; n++) paint(slotEl(entrants[n].id), null);
    }
    const slot = entrants[i];
    const player = slot && castById.get(slot.playerId);
    const el = slot && slotEl(slot.id);
    if (!el || !player) return;
    const body = paint(el, player);
    const dest = centerOf(el);
    const home = stageCenter();
    const local = ms - i * 2000;
    if (local < 1050) {
      const u = local / 1050;
      glide(body, home, home, 1, 0.35 + u * 2.25, 2.6, Math.min(1, u * 4));
    } else glide(body, home, dest, (local - 1050) / 950, 2.6, 1, 1);
    return;
  }
  if (phase === 'bye') {
    if (sig !== 'bye') {
      sig = 'bye';
      settled(tourney, false, 0);
      (tourney.byes || []).forEach((bye) => paint(slotEl(bye.from), null));
    }
    const u = Math.max(0, Math.min(1, ms / 900));
    (tourney.byes || []).forEach((bye) => {
      const from = slotEl(bye.from);
      const to = slotEl(bye.to);
      const player = castById.get(bye.playerId);
      if (!from || !to || !player) return;
      glide(paint(to, player), centerOf(from), centerOf(to), u, 1, 1, 1);
    });
    return;
  }
  if (phase === 'advance') {
    const index = matchIndex || 0;
    const key = 'a' + index;
    const match = matches[index];
    if (sig !== key) {
      sig = key;
      settled(tourney, true, index);
      if (match) {
        const loser = slotEl(match.loserFrom);
        const gone = castById.get(match.loserId);
        if (loser && gone) {
          dock(loser, gone);
          loser.classList.add('is-out');
        }
        paint(slotEl(match.winnerFrom), null);
      }
    }
    if (!match) return;
    const from = slotEl(match.winnerFrom);
    const to = slotEl(match.winnerTo);
    const player = castById.get(match.winnerId);
    if (!from || !to || !player) return;
    const u = Math.max(0, Math.min(1, (ms - 200) / 1100));
    glide(paint(to, player), centerOf(from), centerOf(to), u, 1.15, 1, 1);
    if (u >= 1 && match.winnerTo === 'champ') to.classList.add('is-champion');
    return;
  }
  const played = matchIndex || 0;
  const key = 'h' + played;
  if (sig !== key) {
    sig = key;
    settled(tourney, true, played);
  }
}
