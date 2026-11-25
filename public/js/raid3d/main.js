// The 3D raid test page. The server runs the fight exactly as it does for /raid.html and sends
// back the same timeline (tracks, hits, deaths, hazards). This file only draws it, so any frame
// is a function of fight time: pause, scrub, and orbit the camera to look at a pose.
import * as THREE from 'three';
import { createWorld, toWorld, K, BOSS_SCENE } from './world.js';
import { buildSpoop, attackKind, attackDuration, projectileKind, ATTACK_IMPACT } from './character.js';
import { buildBoss } from './boss.js';
import { createFx } from './fx.js';
import { createDirector } from './camera.js';

// Same pacing as /js/arena.js: fight seconds advance at speed x PACE per real second.
const PACE = 0.55;
const SPLAT_LIFE = 0.95;
const PREVIEW_LOOP = 30;

const $ = (id) => document.getElementById(id);
const canvas = $('r3d-canvas');
const stage = $('r3d-stage');
const overlay = $('r3d-overlay');
const picks = $('pit-picks');
const bossEl = $('r3d-boss');
const tierEl = $('r3d-tier');
const seedEl = $('r3d-seed');
const speedEl = $('r3d-speed');
const fightBtn = $('r3d-fight');
const replayBtn = $('r3d-replay');
const statusEl = $('r3d-status');
const bannerEl = $('r3d-banner');
const logEl = $('r3d-log');
const bossBar = $('r3d-bossbar');
const pauseBtn = $('r3d-pause');
const scrub = $('r3d-scrub');
const clockEl = $('r3d-clock');
const pixelBox = $('r3d-pixel');
const namesBox = $('r3d-names');
const partyEl = $('r3d-party');
const meterEl = $('r3d-meter');
const meterRows = meterEl.querySelector('.r3d-meter-rows');
const calloutEl = $('r3d-callout');
const METER_ROW = 22;

const world = createWorld(canvas);
const fx = createFx(world.scene);
const director = createDirector(world);

let bout = null;
let preview = false;
let actors = new Map();
let t = 0;
let endAt = 0;
let playing = false;
let ended = false;
let snapFacing = true;
let dragging = false;
let busy = false;
let lastData = null;
let spoopList = [];
let callouts = [];
let shownCallout = null;

function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === 'on';
  } catch (err) {
    return fallback;
  }
}

function writePref(key, on) {
  try { localStorage.setItem(key, on ? 'on' : 'off'); } catch (err) { /* private mode */ }
}

function applyView() {
  document.body.classList.toggle('is-pixel', pixelBox.checked);
  document.body.classList.toggle('no-names', !namesBox.checked);
  world.setPixel(pixelBox.checked);
}

pixelBox.checked = readPref('r3d-pixel', true);
namesBox.checked = readPref('r3d-names', true);
pixelBox.addEventListener('change', () => { writePref('r3d-pixel', pixelBox.checked); applyView(); });
namesBox.addEventListener('change', () => { writePref('r3d-names', namesBox.checked); applyView(); });
const camButtons = Array.from(document.querySelectorAll('[data-cam]'));
const resetBtn = $('r3d-cam');
function paintCam(mode) {
  camButtons.forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.cam === mode ? 'true' : 'false'));
  resetBtn.hidden = mode !== 'free';
}
camButtons.forEach((btn) => btn.addEventListener('click', () => {
  director.setMode(btn.dataset.cam);
  try { localStorage.setItem('r3d-cam', btn.dataset.cam); } catch (err) { /* private mode */ }
}));
director.onMode(paintCam);
resetBtn.addEventListener('click', () => world.resetCamera());
try {
  if (localStorage.getItem('r3d-cam') === 'free') director.setMode('free');
} catch (err) { /* private mode */ }
paintCam(director.mode);
new ResizeObserver(() => world.resize()).observe(stage);
applyView();

// ---- Timeline helpers (same reading of a track as /js/arena.js) ----

function sampleTrack(pts, time) {
  if (!pts.length) return { x: 50, y: 36, moving: false, target: null };
  if (time + 0.001 < pts[0][0]) return { hidden: true, x: pts[0][1], y: pts[0][2], target: null };
  if (time <= pts[0][0]) return { x: pts[0][1], y: pts[0][2], target: pts[0][3] || null };
  const last = pts[pts.length - 1];
  if (time >= last[0]) return { x: last[1], y: last[2], target: last[3] || null, i: pts.length - 1 };
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= time) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  if (b[4] === 'up') return { x: a[1], y: a[2], buried: true, target: a[3] || null, i: lo };
  const u = (time - a[0]) / (b[0] - a[0] || 1);
  return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u, target: a[3] || null, i: lo, u };
}

// Walked distance in world units up to a point in time, for the stride.
function walkedAt(actor, time, pos) {
  const pts = actor.pts;
  if (!pts.length || pos.i == null) return 0;
  const a = pts[pos.i];
  const b = pts[pos.i + 1];
  const extra = pos.u && b ? Math.hypot(b[1] - a[1], b[2] - a[2]) * pos.u * K : 0;
  return actor.cum[pos.i] + extra + (pos.scramble || 0) * K;
}

function lastIndexAtOrBefore(list, time, key) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][key || 't'] <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// A boss whose first hit lands near full health shows that as its pool, as /js/arena.js does.
function poolMaxHp(fight, fighter) {
  const listed = Math.max(1, Number(fighter.maxHp) || 1);
  if (Number(fighter.startHp) > 0) return listed;
  const hit = (fight.hits || []).find((h) => h && h.to === fighter.id);
  if (!hit) return listed;
  const before = (Number(hit.hp) || 0) + (!hit.miss && hit.amount > 0 ? hit.amount : 0);
  return before >= listed * 0.75 && before <= listed * 1.25 ? Math.max(1, Math.round(before)) : listed;
}

// ---- Dodging, retimed for tension ----
// The engine decides who gets hit. It moves dodgers out early and leaves the unlucky standing
// still, which gives the outcome away. Here the same outcome plays later and messier: a dodger
// holds their ground and breaks out at the last moment, and someone who is going to be hit
// scrambles for the edge and comes up short. Where everyone stands when the attack lands is unchanged.

function hazardEdge(hz, x, y) {
  // Distance from (x, y) to the edge of the warning, positive inside, and the way out.
  const r = Number(hz.r) || 0;
  if (hz.kind === 'lane') {
    const ax = Number(hz.x1);
    const ay = Number(hz.y1);
    const dx = Number(hz.x2) - ax;
    const dy = Number(hz.y2) - ay;
    const len2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const px = x - (ax + dx * u);
    const py = y - (ay + dy * u);
    const d = Math.hypot(px, py);
    const len = Math.sqrt(len2);
    const out = d > 0.01 ? [px / d, py / d] : [-dy / len, dx / len];
    return { inside: Number(hz.w) / 2 - d, out };
  }
  const dx = x - Number(hz.x);
  const dy = y - Number(hz.y);
  const d = Math.hypot(dx, dy);
  const out = d > 0.01 ? [dx / d, dy / d] : [1, 0];
  if (hz.kind === 'cone') {
    let da = Math.atan2(dy, dx) - Number(hz.a);
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const inArc = Math.abs(da) <= Number(hz.arc);
    return { inside: inArc ? Math.min(r - d, (Number(hz.arc) - Math.abs(da)) * d) : -1, out };
  }
  return { inside: r - d, out };
}

function seededFor(a, b) {
  let h = 2166136261;
  const str = a + '|' + b;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function planDodges(actor, hazards) {
  actor.warps = [];
  actor.scrambles = [];
  actor.braces = [];
  hazards.forEach((hz) => {
    const span = Number(hz.t1) - Number(hz.t0);
    if (!(span > 0.45) || hz.attack === 'rocks') return;
    if (actor.deathT != null && actor.deathT <= hz.t1) return;
    const end = sampleTrack(actor.pts, hz.t1);
    if (end.hidden) return;
    let entered = null;
    let lastIn = null;
    for (let tt = Number(hz.t0); tt < hz.t1; tt += 0.1) {
      const p = sampleTrack(actor.pts, tt);
      if (hazardEdge(hz, p.x, p.y).inside > 0) {
        if (entered == null) entered = tt;
        lastIn = tt;
      }
    }
    const roll = seededFor(actor.f.id, hz.id || hz.t0);
    const caught = hazardEdge(hz, end.x, end.y);
    if (caught.inside <= 0 && entered != null) {
      // A dodger: hold, then break for it. Some cut it finer than others.
      const dash = Math.max(0.3, span * (0.2 + roll * 0.3));
      const hold = Number(hz.t1) - dash;
      if (lastIn < hold) actor.warps.push({ from: entered, hold, t1: Number(hz.t1), roll });
      return;
    }
    if (caught.inside > 0) {
      // Caught: most try to get out and don't make it. The rest brace for it.
      if (roll < 0.72 && caught.inside > 0.8) {
        const room = Math.min(3.2, (caught.inside - 0.6) * (0.55 + roll * 0.4));
        const start = Number(hz.t1) - Math.min(0.65, span * 0.55);
        actor.scrambles.push({ start, t1: Number(hz.t1), amp: room, dir: caught.out });
      } else {
        actor.braces.push({ start: Number(hz.t1) - Math.min(0.6, span * 0.5), t1: Number(hz.t1) });
      }
    }
  });
}

function easeInOut(u) {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

// The track as shown: retimed through dodges, nudged by scrambles.
function posAt(actor, time) {
  let tt = time;
  let shuffle = 0;
  const warps = actor.warps || [];
  for (let i = 0; i < warps.length; i++) {
    const w = warps[i];
    if (time < w.from || time > w.t1) continue;
    if (time < w.hold) {
      tt = w.from;
      shuffle = Math.sin(time * (5 + w.roll * 3)) * 0.35;
    } else {
      tt = w.from + easeInOut((time - w.hold) / (w.t1 - w.hold)) * (w.t1 - w.from);
    }
    break;
  }
  const p = sampleTrack(actor.pts, tt);
  if (shuffle) p.x += shuffle;
  const scrambles = actor.scrambles || [];
  for (let i = 0; i < scrambles.length; i++) {
    const s = scrambles[i];
    let k = 0;
    if (time >= s.start && time <= s.t1) k = easeInOut((time - s.start) / (s.t1 - s.start));
    else if (time > s.t1 && time < s.t1 + 0.7) k = 1 - (time - s.t1) / 0.7;
    if (k <= 0) continue;
    p.x += s.dir[0] * s.amp * k;
    p.y += s.dir[1] * s.amp * k;
    p.scramble = s.amp * k * (time <= s.t1 ? 1 : 0);
  }
  return p;
}

function braceAt(actor, time) {
  const braces = actor.braces || [];
  for (let i = 0; i < braces.length; i++) {
    const b = braces[i];
    if (time >= b.start && time <= b.t1 + 0.15) return Math.min(1, (time - b.start) / 0.25);
  }
  return 0;
}

// ---- Building a fight ----

function clearActors() {
  actors.forEach((actor) => {
    actor.obj.root.removeFromParent();
    if (actor.tag) actor.tag.remove();
  });
  actors = new Map();
  overlay.innerHTML = '';
  partyEl.innerHTML = '';
  meterRows.innerHTML = '';
  meterSig = '';
  splats.clear();
  hzLabels.clear();
  logEl.innerHTML = '';
  logSig = '';
  fx.clear();
}

function makeTag(fighter, isBoss) {
  const el = document.createElement('div');
  el.className = 'r3d-tag';
  el.innerHTML = (isBoss ? '' : '<span class="r3d-say" hidden></span><span class="r3d-tag-name"></span>') + '<span class="r3d-tag-hp"><b></b></span>';
  const name = el.querySelector('.r3d-tag-name');
  if (name) name.textContent = fighter.name;
  overlay.appendChild(el);
  return { el, bar: el.querySelector('.r3d-tag-hp > b'), say: el.querySelector('.r3d-say') };
}

const SAY_LIFE = 2.8;
const CALLOUT_LIFE = 1.9;
const CALLOUT_TIPS = { circle: 'Get out of the circle!', lane: 'Dodge the charge!', cone: 'Get out of the cone!', pool: "Don't stand in the acid!", mark: 'Spread out!' };

// The first time a boss uses each attack in a fight, and when it enrages.
function planCallouts(fight, bossName) {
  const seen = new Set();
  const list = [];
  (fight.hazards || []).slice().sort((a, b) => a.t0 - b.t0).forEach((hz) => {
    const key = hz.label || hz.attack;
    if (!key || hz.attack === 'rocks' || seen.has(key)) return;
    seen.add(key);
    list.push({ t: hz.t0, title: bossName + ': ' + String(hz.label || hz.attack).toUpperCase(), tip: CALLOUT_TIPS[hz.kind] || 'Watch out!' });
  });
  const rage = Number(fight.rageAt) || 0;
  if (rage > 0 && rage < (Number(fight.duration) || 0)) list.push({ t: rage, title: bossName + ' is enraged!', tip: 'It only gets faster from here.', rage: true });
  return list.sort((a, b) => a.t - b.t);
}

// A raid frame: name, health bar with a trail for damage just taken, and hp %.
function makeUnit(fighter) {
  const el = document.createElement('div');
  const style = (fighter.equipped && fighter.equipped.weapon && fighter.equipped.weapon.style) || fighter.style || 'melee';
  el.className = 'r3d-unit is-' + style;
  el.innerHTML = '<i></i><b></b><span></span><em></em>';
  el.querySelector('span').textContent = fighter.name;
  el.title = fighter.name;
  partyEl.appendChild(el);
  return { el, fill: el.querySelector('b'), trail: el.querySelector('i'), pct: el.querySelector('em'), last: '' };
}

function makeMeter(fighter) {
  const el = document.createElement('div');
  const style = (fighter.equipped && fighter.equipped.weapon && fighter.equipped.weapon.style) || fighter.style || 'melee';
  el.className = 'r3d-dps is-' + style;
  el.innerHTML = '<b></b><span></span><em></em>';
  el.querySelector('span').textContent = fighter.name;
  meterRows.appendChild(el);
  return { el, bar: el.querySelector('b'), num: el.querySelector('em') };
}

function damageAt(actor, time) {
  const list = actor.dealt;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo ? list[lo - 1][1] : 0;
}

let meterSig = '';
// Ranked by damage so far. DPS is damage over the time they have been fighting.
function paintMeter() {
  if (preview) return;
  const rows = [];
  actors.forEach((actor) => {
    if (!actor.meter) return;
    const dmg = damageAt(actor, t);
    const stop = actor.deathT != null && t > actor.deathT ? actor.deathT : t;
    const dps = stop > 1 ? dmg / stop : 0;
    rows.push({ actor, dmg, dps });
  });
  rows.sort((a, b) => b.dmg - a.dmg || a.actor.f.name.localeCompare(b.actor.f.name));
  const top = rows.length ? Math.max(1, rows[0].dmg) : 1;
  const sig = rows.map((r) => r.actor.f.id + ':' + r.dmg + ':' + r.dps.toFixed(1)).join('|');
  if (sig === meterSig) return;
  meterSig = sig;
  rows.forEach((row, i) => {
    const m = row.actor.meter;
    m.el.style.transform = 'translateY(' + (i * METER_ROW) + 'px)';
    m.bar.style.width = (row.dmg / top * 100).toFixed(1) + '%';
    m.num.textContent = row.dmg.toLocaleString('en-US') + ' (' + row.dps.toFixed(1) + ')';
    m.el.classList.toggle('is-dead', row.actor.deathT != null && t >= row.actor.deathT);
  });
}

function paintUnit(actor) {
  const u = actor.unit;
  if (!u) return;
  const dead = actor.deathT != null && t >= actor.deathT;
  const now = Math.max(0, Math.min(1, hpAt(actor, t) / actor.maxHp));
  // The trail holds where the bar was a moment ago, then drains down to it.
  const before = Math.max(0, Math.min(1, hpAt(actor, t - 0.8) / actor.maxHp));
  const hurt = !dead && hurtAt(actor, t) > 0;
  const sig = (dead ? 'd' : '') + now.toFixed(3) + '|' + before.toFixed(3) + (hurt ? 'h' : '');
  if (sig === u.last) return;
  u.last = sig;
  u.fill.style.width = (now * 100).toFixed(1) + '%';
  u.trail.style.width = (Math.max(now, before) * 100).toFixed(1) + '%';
  u.pct.textContent = dead ? 'Dead' : Math.ceil(now * 100) + '%';
  u.el.classList.toggle('is-dead', dead);
  u.el.classList.toggle('is-hit', hurt);
  u.el.classList.toggle('is-low', !dead && now < 0.3);
}

function loadFight(fight, opts) {
  clearActors();
  bout = fight;
  preview = !!(opts && opts.preview);
  const tracks = {};
  (fight.tracks || []).forEach((tr) => { tracks[tr.id] = tr.pts || []; });
  const hits = fight.hits || [];
  const fighters = fight.fighters || [];

  fighters.forEach((f) => {
    const pts = tracks[f.id] || [];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const jump = pts[i][4] === 'up';
      cum.push(cum[i - 1] + (jump ? 0 : Math.hypot(pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) * K));
    }
    const monster = !!f.monster;
    const obj = monster ? buildBoss(f) : buildSpoop(f);
    world.scene.add(obj.root);
    const maxHp = poolMaxHp(fight, f);
    const start = Number(f.startHp) > 0 ? Math.min(Number(f.startHp), maxHp) : maxHp;
    const tag = makeTag(f, monster && !f.minion);
    const unit = monster ? null : makeUnit(f);
    const meter = monster || preview ? null : makeMeter(f);
    const buried = [];
    for (let i = 1; i < pts.length; i++) if (pts[i][4] === 'up') buried.push([pts[i - 1][0], pts[i][0]]);
    actors.set(f.id, {
      f, obj, pts, cum, monster, maxHp, startHp: start, buried,
      tag: tag && tag.el, bar: tag && tag.bar, say: tag && tag.say, sayText: '', unit, meter, dealt: [],
      lines: preview ? [] : (fight.banter || []).filter((line) => line.id === f.id),
      yaw: monster ? 0 : Math.PI, attacks: [], winds: [], strikes: [], hitsOn: [], deathT: null,
      anchor: new THREE.Vector3(), pos: new THREE.Vector3(),
      appearT: pts.length && pts[0][0] > 0 ? pts[0][0] : null, frozen: [], mad: [],
    });
  });

  const boss = bossActor();
  hits.forEach((hit, idx) => {
    const from = actors.get(hit.from);
    const to = actors.get(hit.to);
    if (to) to.hitsOn.push(idx);
    if (!from) return;
    if (!from.monster) {
      const style = hit.style || from.f.style || 'melee';
      const kind = attackKind(from.obj.look, style);
      const dur = attackDuration(kind);
      const flight = style === 'ranged' ? 0.3 : style === 'magic' ? 0.42 : 0;
      const launch = hit.t - flight;
      from.attacks.push({ start: launch - ATTACK_IMPACT[kind] * dur, dur, kind, idx, flight, launch, style });
      return;
    }
    const nearHazard = (fight.hazards || []).some((hz) => Math.abs(hz.t1 - hit.t) < 0.35);
    if (!nearHazard) from.strikes.push({ start: hit.t - 0.24, end: hit.t + 0.2, idx });
  });
  if (boss) {
    (fight.hazards || []).forEach((hz) => {
      boss.winds.push({ t0: hz.t0, t1: hz.t1, hz });
      boss.strikes.push({ start: hz.t1 - 0.14, end: hz.t1 + 0.3, hz });
    });
    boss.strikes.sort((a, b) => a.start - b.start);
  }
  actors.forEach((actor) => actor.attacks.sort((a, b) => a.start - b.start));
  // Running damage per spoop, for the meter: [time, total so far].
  hits.forEach((hit) => {
    const from = actors.get(hit.from);
    if (!from || from.monster || hit.miss || !(hit.amount > 0)) return;
    const prev = from.dealt.length ? from.dealt[from.dealt.length - 1][1] : 0;
    from.dealt.push([hit.t, prev + hit.amount]);
  });
  meterEl.hidden = preview;
  meterRows.style.height = (fighters.filter((f) => !f.monster).length * METER_ROW) + 'px';
  (fight.deaths || []).forEach((d) => {
    const a = actors.get(d.id);
    if (a && a.deathT == null) {
      a.deathT = d.t;
      a.deathBy = d.by;
    }
  });
  actors.forEach((actor) => { if (!actor.monster) planDodges(actor, fight.hazards || []); });

  fx.setHazards(fight.hazards || []);
  fx.setRubble(fight.rubble || []);
  world.setScene(preview ? 'grass' : (BOSS_SCENE[boss && boss.f.monster] || 'grass'));
  // Status effects on spoops: frozen by ice breath, or driven mad.
  hits.forEach((hit) => {
    const v = actors.get(hit.to);
    if (!v || v.monster) return;
    if (hit.effect === 'freeze') v.frozen.push([hit.t, Number(hit.until) || hit.t + 3]);
    if (hit.effect === 'madness') v.mad.push([hit.t, Number(hit.until) || hit.t + 5]);
  });
  if (boss) {
    boss.phases = (fight.phases || []).slice().sort((a, b) => a.t - b.t);
    boss.baseMax = boss.maxHp;
  }
  callouts = preview || !boss ? [] : planCallouts(fight, boss.f.name);
  calloutEl.hidden = true;
  director.plan({
    preview,
    duration: Number(fight.duration) || 0,
    hazards: fight.hazards || [],
    deaths: fight.deaths || [],
    bossId: boss ? boss.f.id : null,
  });
  endAt = preview ? PREVIEW_LOOP : (Number(fight.duration) || 0) + 0.8;
  scrub.max = String(endAt);
  t = 0;
  ended = false;
  snapFacing = true;
  bannerEl.hidden = true;
  paintBossBar();
}

function bossActor() {
  for (const actor of actors.values()) {
    if (actor.monster && !actor.f.minion && actor.f.monster !== 'rat') return actor;
  }
  return null;
}

const WANDER_SPEED = 3.5;

// One spoop's warm-up loop: amble to a few spots near home, idle a bit at each, and be back
// home by the end of the loop so it repeats without a jump.
function wander(i, hx, hy) {
  let s = (i + 1) * 7919;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pts = [[0, hx, hy, '']];
  const rests = [];
  let at = 0.4 + rand() * 2.5;
  let x = hx;
  let y = hy;
  rests.push([0, at]);
  for (;;) {
    const ang = rand() * Math.PI * 2;
    const r = 3 + rand() * 8;
    const nx = clamp(hx + Math.cos(ang) * r, 5, 95);
    const ny = clamp(hy + Math.sin(ang) * r * 0.8, 10, 64);
    const go = Math.hypot(nx - x, ny - y) / WANDER_SPEED;
    const back = Math.hypot(nx - hx, ny - hy) / WANDER_SPEED;
    if (at + go + 4 + back > PREVIEW_LOOP - 0.3) break;
    pts.push([at, x, y, '']);
    at += go;
    x = nx;
    y = ny;
    pts.push([at, x, y, '']);
    const rest = 1.2 + rand() * 2.6;
    rests.push([at, at + rest]);
    at += rest;
  }
  pts.push([at, x, y, '']);
  at += Math.hypot(x - hx, y - hy) / WANDER_SPEED;
  pts.push([at, hx, hy, ''], [1e6, hx, hy, '']);
  rests.push([at, PREVIEW_LOOP]);
  return { pts, rests, rand };
}

// The party milling about before a fight, now and then taking a swing, so gear and
// animations can be checked without running the fight.
function showPreview() {
  const list = spoopList.slice(0, 14);
  const n = list.length;
  const fighters = list.map((spoop, i) => {
    const weapon = spoop.equipped && spoop.equipped.weapon;
    return { id: 'p' + i, name: spoop.name, equipped: spoop.equipped, style: (weapon && weapon.style) || 'melee', maxHp: 10 };
  });
  const hits = [];
  const tracks = fighters.map((f, i) => {
    const off = i - (n - 1) / 2;
    const plan = wander(i, 50 + off * 7.2, 38 - off * off * 0.18);
    plan.rests.forEach(([a, b]) => {
      if (b - a > 1.6 && b < PREVIEW_LOOP - 0.6 && plan.rand() < 0.6) hits.push({ t: a + 0.5 + plan.rand() * (b - a - 1.4), from: f.id, to: null, style: f.style });
    });
    return { id: f.id, pts: plan.pts };
  });
  hits.sort((a, b) => a.t - b.t);
  loadFight({ fighters, tracks, hits, deaths: [], hazards: [], duration: PREVIEW_LOOP }, { preview: true });
  playing = true;
  statusEl.textContent = n ? 'The party, warming up. Pick a boss and fight.' : 'No spoops to show.';
}

// ---- Per-frame update ----

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const mouthAt = new THREE.Vector3();
const proj = new THREE.Vector3();

function angleTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function approachAngle(cur, want, k) {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * k;
}

function activeAt(list, time, endOf) {
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    if (w.start <= time && time < endOf(w)) return w;
    if (w.start + 5 < time) break;
  }
  return null;
}

function hurtAt(actor, time) {
  const hits = bout.hits;
  for (let i = actor.hitsOn.length - 1; i >= 0; i--) {
    const hit = hits[actor.hitsOn[i]];
    if (hit.t > time) continue;
    if (time - hit.t > 0.22) return 0;
    if (hit.miss || !(hit.amount > 0)) continue;
    return 1 - (time - hit.t) / 0.22;
  }
  return 0;
}

function hpAt(actor, time) {
  const hits = bout.hits;
  for (let i = actor.hitsOn.length - 1; i >= 0; i--) {
    const hit = hits[actor.hitsOn[i]];
    if (hit.t <= time) return Math.max(0, Number(hit.hp) || 0);
  }
  return actor.startHp;
}

function sinkAt(actor, time) {
  if (actor.appearT != null && time >= actor.appearT && time < actor.appearT + 0.4) return 1 - (time - actor.appearT) / 0.4;
  for (const [s, e] of actor.buried) {
    if (time >= s && time <= e) return Math.min(1, (time - s) / 0.35);
    if (time > e && time < e + 0.35) return 1 - (time - e) / 0.35;
  }
  return 0;
}

function screenX(v) {
  proj.copy(v).project(world.camera);
  return proj.x;
}

function update(dt) {
  const cam = world.camera.position;
  const turn = snapFacing ? 1 : 1 - Math.exp(-dt * 10);
  snapFacing = false;

  // Positions first, so facing can look at where everyone is now.
  actors.forEach((actor) => {
    const p = actor.monster ? sampleTrack(actor.pts, t) : posAt(actor, t);
    actor.sample = p;
    actor.obj.root.visible = !p.hidden;
    toWorld(p.x, p.y, actor.pos);
    actor.obj.root.position.copy(actor.pos);
  });

  actors.forEach((actor) => {
    if (actor.sample.hidden) return;
    const dead = actor.deathT != null && t >= actor.deathT;
    if (!actor.monster) poseSpoop(actor, dead, turn);
    else poseBoss(actor, dead, cam);
  });

  world.scene.updateMatrixWorld();
  const boss = bossActor();
  const mouth = boss && !boss.sample.hidden && !(boss.deathT != null && t > boss.deathT) && boss.obj.mouthPoint
    ? boss.obj.mouthPoint(mouthAt) : null;
  fx.update(t, { mouth });
  fx.drawProjectiles(preview ? [] : shotsAt());
}

function poseSpoop(actor, dead, turn) {
  const p = actor.sample;
  const before = posAt(actor, t - 0.12);
  const after = posAt(actor, t + 0.12);
  const speed = Math.hypot(after.x - before.x, after.y - before.y) * K / 0.24;
  const move = dead ? 0 : Math.max(0, Math.min(1.5, (speed - 0.08) / 0.6));
  const swing = dead ? null : activeAt(actor.attacks, t, (w) => w.start + w.dur);
  const attack = swing ? { kind: swing.kind, u: (t - swing.start) / swing.dur } : null;

  let face = null;
  const victim = swing && actors.get(bout.hits[swing.idx].to);
  const killer = dead && actors.get(actor.deathBy);
  // Go down facing whoever did it, so the body is knocked back away from them.
  if (killer) face = killer.pos;
  else if (victim && !victim.sample.hidden) face = victim.pos;
  else if (p.target && actors.get(p.target)) face = actors.get(p.target).pos;
  if (face && face.distanceToSquared(actor.pos) > 0.0001) {
    actor.yaw = approachAngle(actor.yaw, angleTo(actor.pos, face), turn);
  } else if (move > 0.2) {
    tmp.subVectors(toWorld(after.x, after.y, tmp2), actor.pos);
    if (tmp.lengthSq() > 1e-5) actor.yaw = approachAngle(actor.yaw, Math.atan2(tmp.x, tmp.z), turn);
  } else if (preview) {
    actor.yaw = approachAngle(actor.yaw, 0, turn * 0.4);
  }
  actor.obj.root.rotation.y = actor.yaw;
  actor.obj.pose({
    walk: walkedAt(actor, t, p) * (Math.PI * 2 / 1.15),
    move,
    attack,
    hurt: dead ? 0 : hurtAt(actor, t),
    deathTime: dead ? t - actor.deathT : null,
    breathe: t + actor.f.id.length,
    brace: dead ? 0 : braceAt(actor, t),
    frozen: !dead && inWindow(actor.frozen, t),
    mad: !dead && inWindow(actor.mad, t),
  });
}

function inWindow(list, time) {
  return list.some(([a, b]) => time >= a && time < b);
}

// A boss with another form: the art and the size of its bar follow whichever form is up.
function applyForm(actor) {
  if (!actor.phases || !actor.phases.length || !actor.obj.setSprite) return;
  let form = null;
  actor.phases.forEach((ph) => { if (ph.t <= t) form = ph; });
  actor.obj.setSprite((form && form.sprite) || actor.f.sprite);
  actor.maxHp = form && form.hp ? form.hp : actor.baseMax;
}

function poseBoss(actor, dead, cam) {
  applyForm(actor);
  const p = actor.sample;
  const wind = actor.winds.find((w) => t >= w.t0 && t < w.t1);
  const strike = dead ? null : activeAt(actor.strikes, t, (w) => w.end);
  let aim = null;
  if (strike && strike.hz) aim = hazardAim(strike.hz, tmp);
  else if (wind) aim = hazardAim(wind.hz, tmp);
  else if (strike && bout.hits[strike.idx] && actors.get(bout.hits[strike.idx].to)) aim = actors.get(bout.hits[strike.idx].to).pos;
  else if (p.target && actors.get(p.target)) aim = actors.get(p.target).pos;
  if (aim) {
    const dx = screenX(aim) - screenX(actor.pos);
    if (Math.abs(dx) > 0.01) actor.faceRight = dx > 0;
  }
  let lungeDir = null;
  if (aim) {
    lungeDir = tmp2.subVectors(aim, actor.pos).setY(0);
    if (lungeDir.lengthSq() > 1e-5) lungeDir.normalize();
    else lungeDir = null;
  }
  const flat = Math.hypot(cam.x - actor.pos.x, cam.z - actor.pos.z);
  actor.obj.pose({
    t,
    yaw: Math.atan2(cam.x - actor.pos.x, cam.z - actor.pos.z),
    pitch: Math.atan2(cam.y - actor.obj.height * 0.5, flat),
    faceRight: !!actor.faceRight,
    wind: wind && !dead ? Math.min(1, (t - wind.t0) / Math.max(0.1, wind.t1 - wind.t0)) : 0,
    strike: strike ? (t - strike.start) / (strike.end - strike.start) : null,
    lungeDir,
    hurt: dead ? 0 : hurtAt(actor, t) * 0.7,
    enraged: !!(bout.rageAt && t >= bout.rageAt) && !dead,
    sink: sinkAt(actor, t),
    death: dead ? (t - actor.deathT) : null,
  });
}

const SPELL_COLOR = { magic: '#a78bfa' };

// Where a boss looks for an attack: down the lane, along the cone, or at the mark.
function hazardAim(hz, out) {
  if (hz.kind === 'lane') return toWorld(hz.x2, hz.y2, out);
  if (hz.kind === 'cone') return toWorld(Number(hz.x) + Math.cos(hz.a) * hz.r, Number(hz.y) + Math.sin(hz.a) * hz.r, out);
  return toWorld(hz.x, hz.y, out);
}

function shotsAt() {
  const shots = [];
  actors.forEach((actor) => {
    if (actor.monster || actor.sample.hidden) return;
    for (let i = actor.attacks.length - 1; i >= 0; i--) {
      const w = actor.attacks[i];
      if (w.start + 3 < t) break;
      if (!w.flight || t < w.launch || t > w.launch + w.flight) continue;
      const victim = actors.get(bout.hits[w.idx].to);
      if (!victim) continue;
      const from = actor.obj.launchPoint(new THREE.Vector3());
      const to = victim.pos.clone();
      to.y += victim.monster ? victim.obj.height * 0.45 : 1.1;
      shots.push({
        kind: w.style === 'ranged' ? projectileKind(actor.obj.look) : 'orb',
        from, to,
        u: (t - w.launch) / w.flight,
        color: actor.obj.look.spellColor || SPELL_COLOR.magic,
      });
    }
  });
  // Bouncing bolts hop from the last spoop they hit, or leave the boss's mouth.
  const boss = bossActor();
  const hits = bout.hits || [];
  for (let i = lastIndexAtOrBefore(hits, t + 0.35); i >= 0; i--) {
    const hit = hits[i];
    if (hit.t < t - 0.05) break;
    if (hit.attack !== 'bounce' || t > hit.t) continue;
    const victim = actors.get(hit.to);
    if (!victim) continue;
    const via = hit.via && actors.get(hit.via);
    const from = via ? via.pos.clone().setY(1.1) : boss && boss.obj.mouthPoint ? boss.obj.mouthPoint(new THREE.Vector3()) : null;
    if (!from) continue;
    shots.push({ kind: 'orb', from, to: victim.pos.clone().setY(1.1), u: 1 - (hit.t - t) / 0.35, color: '#c084fc' });
  }
  return shots;
}

// ---- Overlay: tags, hitsplats, warning labels, log, boss bar ----

const splats = new Map();
const hzLabels = new Map();
let logSig = '';

function toScreen(v, w, h) {
  proj.copy(v).project(world.camera);
  if (proj.z > 1 || proj.z < -1) return null;
  return { x: (proj.x * 0.5 + 0.5) * w, y: (-proj.y * 0.5 + 0.5) * h };
}

function headOf(actor) {
  const a = actor.anchor.copy(actor.pos);
  if (actor.monster) a.y = (actor.obj.height || 3) * (1 - sinkAt(actor, t) * 0.85) + 0.25;
  else a.y = actor.deathT != null && t >= actor.deathT ? 0.6 : 2.0;
  return a;
}

function splatBias(fromId, victim) {
  if (!victim.monster) return { x: 0, y: 0 };
  const ids = (bout.fighters || []).map((f) => f.id);
  const i = Math.max(0, ids.indexOf(fromId));
  const n = Math.max(3, ids.length);
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.round(Math.cos(a) * 40), y: Math.round(Math.sin(a) * 20) + 30 };
}

function drawOverlay() {
  const w = overlay.clientWidth;
  const h = overlay.clientHeight;
  actors.forEach((actor) => {
    if (!actor.tag) return;
    const dead = actor.deathT != null && t >= actor.deathT;
    const at = !actor.sample.hidden && toScreen(headOf(actor), w, h);
    actor.tag.hidden = !at || (actor.monster && dead);
    if (!at) return;
    actor.tag.style.transform = 'translate(' + at.x.toFixed(1) + 'px,' + at.y.toFixed(1) + 'px) translate(-50%,-100%)';
    actor.tag.classList.toggle('is-dead', dead);
    const hp = hpAt(actor, t);
    actor.bar.style.width = (Math.max(0, Math.min(1, hp / actor.maxHp)) * 100).toFixed(1) + '%';
    if (actor.say) {
      const line = actor.lines.find((row) => t >= row.t && t < row.t + SAY_LIFE);
      const text = line && !dead ? line.text : '';
      if (text !== actor.sayText) {
        actor.sayText = text;
        actor.say.textContent = text;
        actor.say.hidden = !text;
      }
    }
  });
  const call = callouts.find((row) => t >= row.t && t < row.t + CALLOUT_LIFE);
  if (call !== shownCallout) {
    shownCallout = call || null;
    calloutEl.hidden = !call;
    if (call) {
      calloutEl.className = 'r3d-callout' + (call.rage ? ' is-rage' : '');
      calloutEl.innerHTML = '<b>' + esc(call.title) + '</b><small>' + esc(call.tip) + '</small>';
    }
  }

  actors.forEach(paintUnit);
  paintMeter();

  const hits = (bout && bout.hits) || [];
  const live = new Set();
  if (!preview) {
    const lastIdx = lastIndexAtOrBefore(hits, t);
    for (let i = lastIdx; i >= 0; i--) {
      const hit = hits[i];
      const age = t - hit.t;
      if (age > SPLAT_LIFE) break;
      const victim = actors.get(hit.to);
      if (!victim || victim.sample.hidden) continue;
      if (hit.effect === 'madness' && !(hit.amount > 0)) continue;
      const anchor = tmp.copy(victim.pos);
      anchor.y = victim.monster ? (victim.obj.height || 3) * 0.5 : 1.1;
      const at = toScreen(anchor, w, h);
      if (!at) continue;
      live.add(i);
      let el = splats.get(i);
      if (!el) {
        el = document.createElement('div');
        const miss = hit.miss || !(hit.amount > 0);
        const attacker = actors.get(hit.from);
        const max = !miss && attacker && attacker.f.maxHit && hit.amount >= attacker.f.maxHit;
        el.className = 'r3d-splat' + (miss ? ' is-miss' : '') + (max ? ' is-max' : '');
        el.textContent = miss ? '0' : String(hit.amount);
        overlay.appendChild(el);
        splats.set(i, el);
      }
      const bias = splatBias(hit.from, victim);
      const rise = age * 16;
      el.style.transform = 'translate(' + (at.x + bias.x - 13).toFixed(1) + 'px,' + (at.y + bias.y - 12 - rise).toFixed(1) + 'px)';
      el.style.opacity = age > SPLAT_LIFE * 0.7 ? String(Math.max(0, 1 - (age - SPLAT_LIFE * 0.7) / (SPLAT_LIFE * 0.3))) : '1';
    }
  }
  splats.forEach((el, i) => {
    if (live.has(i)) return;
    el.remove();
    splats.delete(i);
  });

  const words = new Set();
  fx.labels(t).forEach((row) => {
    const at = toScreen(row.pos, w, h);
    if (!at) return;
    words.add(row.key);
    let el = hzLabels.get(row.key);
    if (!el) {
      el = document.createElement('span');
      el.className = 'r3d-hz-label';
      el.textContent = row.text;
      overlay.appendChild(el);
      hzLabels.set(row.key, el);
    }
    el.style.transform = 'translate(' + at.x.toFixed(1) + 'px,' + at.y.toFixed(1) + 'px) translate(-50%,-50%)';
    el.style.color = row.hot ? '#ffffff' : '';
  });
  hzLabels.forEach((el, key) => {
    if (words.has(key)) return;
    el.remove();
    hzLabels.delete(key);
  });

  if (!preview) drawLog();
  setBossBar();
}

function nameOf(id) {
  const a = actors.get(id);
  return a ? a.f.name : 'Someone';
}

function drawLog() {
  const hits = bout.hits || [];
  const deaths = bout.deaths || [];
  const hi = lastIndexAtOrBefore(hits, t);
  const di = lastIndexAtOrBefore(deaths, t);
  const sig = hi + '|' + di;
  if (sig === logSig) return;
  logSig = sig;
  const rows = [];
  for (let i = hi; i >= 0 && rows.length < 12; i--) {
    const hit = hits[i];
    const miss = hit.miss || !(hit.amount > 0);
    const a = nameOf(hit.from);
    const v = nameOf(hit.to);
    let text;
    if (hit.verb) text = a + ' ' + hit.verb + ' ' + v + (miss ? '. Dodged.' : ' ' + hit.amount);
    else text = miss ? a + ' misses ' + v : a + ' hits ' + v + ' ' + hit.amount;
    rows.push({ t: hit.t, text, kind: miss ? 'is-miss' : 'is-hit' });
  }
  for (let i = di; i >= 0 && i > di - 4; i--) rows.push({ t: deaths[i].t, text: nameOf(deaths[i].id) + ' is defeated', kind: 'is-dead' });
  rows.sort((a, b) => a.t - b.t);
  logEl.innerHTML = '';
  rows.slice(-12).forEach((row) => {
    const li = document.createElement('li');
    li.className = row.kind;
    li.textContent = row.text;
    logEl.appendChild(li);
  });
}

function paintBossBar() {
  const boss = bossActor();
  bossBar.hidden = !boss || preview;
  if (!boss) return;
  bossBar.querySelector('strong').textContent = boss.f.name;
  bossBar.querySelector('span').textContent = (boss.f.tierName ? boss.f.tierName + ' · ' : '') + (boss.f.combat ? 'Level ' + boss.f.combat : '');
}

function setBossBar() {
  const boss = bossActor();
  if (!boss || preview) return;
  const pct = Math.max(0, Math.min(1, hpAt(boss, t) / boss.maxHp)) * 100;
  bossBar.querySelector('b').style.width = pct.toFixed(1) + '%';
  bossBar.querySelector('i').style.width = pct.toFixed(1) + '%';
  bossBar.classList.toggle('is-enraged', !!(bout.rageAt && t >= bout.rageAt));
}

function showEnd() {
  if (preview || !bout) return;
  const boss = bossActor();
  const bossName = (boss && boss.f.name) || bout.bossName || 'The boss';
  const party = (bout.party || []);
  const alive = party.filter((row) => row.alive);
  const wiped = !!(bout.loot && bout.loot.wiped);
  const dealt = new Map();
  (bout.hits || []).forEach((hit) => {
    const from = actors.get(hit.from);
    if (!from || from.monster || !(hit.amount > 0)) return;
    dealt.set(hit.from, (dealt.get(hit.from) || 0) + hit.amount);
  });
  let topId = null;
  dealt.forEach((amount, id) => { if (!topId || amount > dealt.get(topId)) topId = id; });
  const head = wiped
    ? (alive.length ? bossName + ' wins' : 'The party fell')
    : bossName + ' is down';
  const sub = (wiped && alive.length && bout.called ? 'Time called. ' : '') +
    (topId ? 'Most damage: ' + nameOf(topId) + ' (' + dealt.get(topId).toLocaleString('en-US') + ')' : '');
  bannerEl.textContent = head;
  if (sub) {
    const small = document.createElement('small');
    small.textContent = sub;
    bannerEl.appendChild(small);
  }
  bannerEl.hidden = false;
  statusEl.textContent = head + '.';
}

// ---- Transport ----

function setPlaying(on) {
  playing = on;
  pauseBtn.textContent = on ? 'Pause' : 'Play';
  pauseBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
}

pauseBtn.addEventListener('click', () => {
  if (live && live.segs) {
    live.playing = !live.playing;
    if (live.playing && live.clock >= live.total) live.clock = 0;
    setPlaying(live.playing);
    return;
  }
  if (!bout) return;
  if (!playing && ended) {
    t = 0;
    ended = false;
    bannerEl.hidden = true;
    snapFacing = true;
  }
  setPlaying(!playing);
});

scrub.addEventListener('pointerdown', () => { dragging = true; });
scrub.addEventListener('pointerup', () => { dragging = false; });
scrub.addEventListener('input', () => {
  if (live && live.segs) {
    live.clock = (Number(scrub.value) || 0) * 1000;
    live.view = {};
    snapFacing = true;
    return;
  }
  if (!bout) return;
  t = Number(scrub.value) || 0;
  snapFacing = true;
  if (t < endAt) {
    ended = false;
    bannerEl.hidden = true;
  }
});

window.addEventListener('keydown', (ev) => {
  if (ev.target && /input|select|textarea/i.test(ev.target.tagName) && ev.target.type !== 'range') return;
  if (ev.code === 'Space') {
    ev.preventDefault();
    pauseBtn.click();
  }
});

// How far through a live boss's entrance card we are, or null outside one.
function introAt() {
  const seg = live && live.segs && live.seg;
  const on = !!seg && seg.kind === 'card';
  document.body.classList.toggle('is-entrance', on);
  if (!on) return null;
  return Math.max(0, Math.min(1, (live.clock - seg.start) / (seg.end - seg.start)));
}

let lastNow = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  const liveOn = !!(live && live.segs);
  if (liveOn) tickLive(dt);
  if (bout) {
    if (playing && !dragging && !liveOn) t += dt * Number(speedEl.value || 1.5) * PACE;
    if (liveOn) {
      // The live raid sets t itself.
    } else if (preview) {
      if (t >= endAt) t -= endAt;
    } else if (t >= endAt) {
      t = endAt;
      if (!ended) {
        ended = true;
        setPlaying(false);
        showEnd();
      }
    }
    update(dt);
    world.update(dt);
    director.update({ t, actors, boss: bossActor(), intro: introAt() });
    drawOverlay();
    if (!liveOn) {
      if (!dragging) scrub.value = String(t);
      clockEl.textContent = t.toFixed(1) + 's';
    }
  } else {
    director.update({ t, actors, boss: null });
  }
  world.renderer.render(world.scene, world.camera);
}
requestAnimationFrame(frame);

// Console handle for poking at the scene: raid3d.camera.position, raid3d.actors, raid3d.seek(12).
window.raid3d = {
  world,
  camera: world.camera,
  get actors() { return actors; },
  get bout() { return bout; },
  get live() { return live; },
  seek(time) {
    t = Number(time) || 0;
    snapFacing = true;
  },
  pause() { setPlaying(false); },
  director,
  look(x, y, z, tx, ty, tz) {
    director.setMode('free');
    world.camera.position.set(x, y, z);
    world.controls.target.set(tx || 0, ty || 0, tz || 0);
    world.controls.update();
  },
};

// ---- Live raid ----
// The night's rooms in order, on the same clock the engine uses for the show (RAID_SHOW and
// fightPlaybackMs in lib/spoop/engine.js), so this stays in step with the 2D page and Discord.
const SHOW = { open: 10000, card: 3200, loot: 22000, split: 12000, travel: 5000, fork: 3600, camp: 7000, chest: 8000 };
// Inside a loot card: who loots, then the drop reel, then the split for the rest of the card.
const ROLL = { spin: 3000, up: 1500, reel: 5100, land: 900 };
const ROLL_MS = ROLL.spin + ROLL.up + ROLL.reel + ROLL.land;
const FORK_SPIN = 2400;
const LIVE_SPEED = 1.5;
const cardEl = $('r3d-card');
const raidEl = $('r3d-raid');
const raidKicker = raidEl.querySelector('.raid-kicker');
const raidPhase = raidEl.querySelector('.raid-phase');
const raidStage = raidEl.querySelector('.raid-stage');
let live = null;
let livePoll = 0;

function esc(text) {
  return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function nodeLabel(node) {
  if (!node) return '';
  return node.name + (node.tierName && node.kind !== 'rest' && node.kind !== 'treasure' ? ' · ' + node.tierName : '');
}

function planRaid(last) {
  const raid = last.raid || {};
  const rooms = raid.rooms || [];
  const route = raid.route || [];
  const choices = raid.choices || [];
  const nodes = new Map(((raid.map && raid.map.nodes) || []).map((n) => [n.id, n]));
  const segs = [];
  let at = 0;
  const push = (kind, ms, extra) => {
    segs.push(Object.assign({ kind, start: at, end: at + ms }, extra));
    at += ms;
  };
  if (route.length) push('open', SHOW.open);
  let fights = 0;
  route.forEach((nodeId, step) => {
    rooms.filter((room) => room.node === nodeId).forEach((room) => {
      const index = rooms.indexOf(room);
      const more = index < rooms.length - 1;
      if (room.kind === 'rest') return push('camp', SHOW.camp, { room });
      if (room.kind === 'treasure') return push('chest', SHOW.chest, { room });
      fights += 1;
      push('card', SHOW.card, { room, index, n: fights });
      const dur = Number(room.duration || (room.bout && room.bout.duration)) || 0;
      push('fight', Math.round((dur / (LIVE_SPEED * PACE)) * 1000), { room, index, dur });
      const loot = room.bout && room.bout.loot;
      push('loot', loot && loot.drop ? SHOW.loot : SHOW.split, { room, index, dur, closing: !more });
    });
    if (step < route.length - 1) {
      const choice = choices.find((row) => row.at === nodeId);
      if (choice) push('fork', SHOW.fork, { choice, step });
      push('travel', SHOW.travel, { next: nodes.get(route[step + 1]), step });
    }
  });
  const total = at;
  push('recap', 3600 * 1000);
  const startAt = new Date(last.revealAt).getTime() - (Number(last.showMs) || total);
  const map = { nodes: (raid.map && raid.map.nodes) || [], layers: (raid.map && raid.map.layers) || route.length, route, choices, byId: nodes };
  return { segs, total, startAt, raid, nodes, map, clock: 0, playing: true, room: -1, seg: null, view: {} };
}

function showCard(kicker, title, body) {
  cardEl.querySelector('.r3d-card-kicker').textContent = kicker || '';
  cardEl.querySelector('.r3d-card-title').textContent = title || '';
  cardEl.querySelector('.r3d-card-body').innerHTML = body || '';
  cardEl.hidden = false;
}

function joinNames(list) {
  const names = (list || []).filter(Boolean);
  if (names.length < 2) return names[0] || '';
  if (names.length === 2) return names[0] + ' and ' + names[1];
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

function iconHtml(osrsId, size) {
  if (!osrsId) return '';
  const px = size || 36;
  return '<img src="/api/spoops?icon=1&id=' + Number(osrsId) + '" alt="" width="' + px + '" height="' + px + '">';
}

function hpColor(pct) {
  return 'hsl(' + Math.round(120 * pct) + ' 72% 42%)';
}

function hpLine(row) {
  if (!row || !(row.maxHp > 0)) return '';
  const pct = Math.max(0, Math.min(1, (Number(row.hp) || 0) / row.maxHp));
  return '<i class="raid-hp" title="' + esc(row.hp + ' / ' + row.maxHp + ' hitpoints') + '">' +
    '<b style="width:' + (pct * 100).toFixed(1) + '%;background:' + hpColor(pct) + '"></b>' +
    '<small>' + row.hp + '/' + row.maxHp + '</small></i>';
}

function tierSlug(name) {
  return String(name || 'medium').toLowerCase().replace(/[^a-z]/g, '');
}

function showRaid(kicker, phase, cls) {
  raidKicker.textContent = kicker || '';
  raidPhase.textContent = phase || '';
  raidEl.className = 'raid-loot r3d-raid' + (cls ? ' ' + cls : '');
  raidEl.hidden = false;
  cardEl.hidden = true;
}

// Which chip is lit at a point in a spin: quick hops that slow down, landing on `land` at `span`.
function spinPlan(n, land, span) {
  const steps = Math.max(n * 2, 8) + land;
  const gaps = [];
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const u = i / steps;
    gaps.push(36 + u * u * 220);
    sum += gaps[i];
  }
  let acc = 0;
  return gaps.map((gap) => (acc += (gap * span) / sum));
}

function spinIndex(plan, n, land, ms) {
  let i = 0;
  while (i < plan.length && ms >= plan[i]) i++;
  return i >= plan.length ? land : i % n;
}

function lightChips(els, idx, landed) {
  els.forEach((el, n) => {
    el.classList.toggle('is-on', n === idx);
    el.classList.toggle('is-landed', landed && n === idx);
  });
}

// ---- Map ----

function nodeArt(node) {
  if (node.sprite) return node.sprite;
  if (node.icon) return '/api/spoops?icon=1&id=' + Number(node.icon);
  return '';
}

// The rooms walked by a step, and every option seen at a fork; the ones passed up stay dimmed.
function mapView(map, step) {
  const walked = map.route.slice(0, step + 1);
  const seen = new Set(walked);
  const skipped = new Set();
  (map.choices || []).forEach((choice) => {
    const at = map.route.indexOf(choice.at);
    if (at < 0 || at >= step) return;
    choice.options.forEach((id) => {
      seen.add(id);
      if (id !== choice.pick) skipped.add(id);
    });
  });
  return { walked, seen, skipped, options: [], on: '', token: null };
}

function mapHtml(map, view) {
  const walked = view.walked || [];
  const steps = new Set();
  for (let i = 1; i < walked.length; i++) steps.add(walked[i - 1] + '>' + walked[i]);
  const options = new Set(view.options || []);
  const here = walked[walked.length - 1];
  let edges = '';
  map.nodes.forEach((node) => {
    (node.next || []).forEach((id) => {
      const to = map.byId.get(id);
      if (!to) return;
      const cls = steps.has(node.id + '>' + id) ? ' is-walked' : node.id === here && options.has(id) ? ' is-open' : '';
      edges += '<line class="map-edge' + cls + '" x1="' + node.x + '" y1="' + node.y + '" x2="' + to.x + '" y2="' + to.y + '"></line>';
    });
  });
  let marks = '';
  map.nodes.forEach((node) => {
    const face = view.seen.has(node.id) || options.has(node.id);
    const art = face ? nodeArt(node) : '';
    const cls = 'map-stop is-' + esc(node.kind || 'boss') +
      (walked.indexOf(node.id) >= 0 ? ' is-past' : '') +
      (options.has(node.id) ? ' is-option' : '') +
      (view.on === node.id ? ' is-on' : '') +
      (view.skipped && view.skipped.has(node.id) ? ' is-skipped' : '');
    marks += '<g class="' + cls + '" data-node="' + esc(node.id) + '">' +
      '<title>' + esc(face ? nodeLabel(node) : 'Unknown room') + '</title>' +
      '<circle class="map-node" cx="' + node.x + '" cy="' + node.y + '" r="4.6"></circle>' +
      (art
        ? '<image href="' + esc(art) + '" x="' + (node.x - 3.5) + '" y="' + (node.y - 3.5) + '" width="7" height="7" preserveAspectRatio="xMidYMid meet"></image>'
        : '<text class="map-q" x="' + node.x + '" y="' + (node.y + 0.4) + '">?</text>') +
    '</g>';
  });
  const token = view.token ? '<circle class="map-token" cx="' + view.token.x.toFixed(2) + '" cy="' + view.token.y.toFixed(2) + '" r="1.9"></circle>' : '';
  return '<svg class="raid-map" viewBox="0 0 100 64" role="img" aria-label="Raid map">' + edges + marks + token + '</svg>';
}

function moveToken(x, y) {
  const el = raidStage.querySelector('.map-token');
  if (!el) return;
  el.setAttribute('cx', x.toFixed(2));
  el.setAttribute('cy', y.toFixed(2));
}

function ease(u) {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function twistHtml(twist) {
  if (!twist) return '';
  return '<div><p class="r3d-twist is-' + esc(twist.id) + '">Twist: <b>' + esc(twist.name) + '</b> · ' + esc(twist.detail) + '</p></div>';
}

function quoteHtml(quote) {
  return quote && quote.name ? '<p class="r3d-quote"><b>' + esc(quote.name) + ':</b> <q>' + esc(quote.text) + '</q></p>' : '';
}

// ---- Live raid screens ----
// Each screen is drawn from how far into its segment the clock is, so a late join, a scrub,
// and the first viewer all see the same thing. `v` holds what the segment has built so far.

function drawOpen(ms, v) {
  const map = live.map;
  const raid = live.raid;
  const first = map.byId.get(map.route[0]);
  if (!v.phase) {
    v.phase = 'open';
    showRaid('Tonight', raid.name || 'The raid', 'is-intro');
    const party = ((raid.rooms && raid.rooms[0] && raid.rooms[0].party) || []);
    const byName = new Map(spoopList.map((s) => [s.name, s]));
    const chips = party.map((row) => {
      const spoop = byName.get(row.name);
      const weapon = spoop && spoop.equipped && spoop.equipped.weapon;
      const meta = spoop ? 'Cb ' + spoop.combat + ' · ' + ((weapon && weapon.style) || 'melee') : row.maxHp + ' hp';
      return '<div class="raid-chip">' + esc(row.name) + '<small>' + esc(meta) + '</small></div>';
    }).join('');
    v.start = first ? { x: Math.max(2.5, first.x - 6), y: first.y } : null;
    const view = mapView(map, -1);
    view.token = v.start;
    raidStage.innerHTML = (map.nodes.length ? mapHtml(map, view) : '') +
      '<p class="raid-map-line">' + esc((map.layers || '') + ' rooms deep. Forks are picked on the way, so the rest of the path stays hidden.') + '</p>' +
      twistHtml(raid.twist) +
      '<div class="raid-who r3d-roster">' + chips + '</div>';
    v.chips = Array.from(raidStage.querySelectorAll('.r3d-roster .raid-chip'));
  }
  const shown = Math.floor((ms - 600) / 260);
  v.chips.forEach((el, i) => el.classList.toggle('is-in', i <= shown));
  if (ms >= 5500 && v.phase === 'open' && first) {
    v.phase = 'first';
    const view = mapView(map, -1);
    view.seen.add(first.id);
    view.on = first.id;
    view.token = v.start;
    raidStage.querySelector('.raid-map').outerHTML = mapHtml(map, view);
    raidStage.querySelector('.raid-map-line').textContent = 'First up: ' + nodeLabel(first);
  }
  if (v.phase === 'first' && v.start) {
    const u = ease(Math.max(0, Math.min(1, (ms - 6500) / 3000)));
    moveToken(v.start.x + (first.x - v.start.x) * u, v.start.y + (first.y - v.start.y) * u);
  }
}

// The boss's entrance: the camera circles it (see introAt) under a title along the bottom.
function drawCard(seg, v) {
  if (v.phase) return;
  v.phase = 'card';
  const boss = seg.room.boss || {};
  const tier = boss.tierName || 'Medium';
  showRaid('Raid fight ' + seg.n, boss.name || 'Boss', 'is-title');
  raidStage.innerHTML = '<p class="raid-diff is-' + tierSlug(tier) + '">' + esc(tier) + '</p>' +
    '<p class="r3d-title-line">' + esc((boss.level ? 'Level ' + boss.level : '') + (boss.maxHit ? ' · hits up to ' + boss.maxHit : '')) + '</p>';
}

function drawFork(seg, ms, v) {
  const map = live.map;
  const choice = seg.choice;
  const land = Math.max(0, choice.options.indexOf(choice.pick));
  if (!v.phase) {
    v.phase = 'spin';
    showRaid('The road splits', 'Which way?', 'is-intro');
    const here = map.byId.get(map.route[seg.step]);
    const view = mapView(map, seg.step);
    view.options = choice.options;
    view.token = here ? { x: here.x, y: here.y } : null;
    raidStage.innerHTML = mapHtml(map, view) +
      '<p class="raid-map-line">' + esc(choice.options.map((id) => nodeLabel(map.byId.get(id))).join('  or  ')) + '</p>';
    v.els = choice.options.map((id) => raidStage.querySelector('[data-node="' + id + '"]')).filter(Boolean);
    v.plan = spinPlan(v.els.length, land, FORK_SPIN);
  }
  if (!v.els.length) return;
  const done = ms >= FORK_SPIN;
  lightChips(v.els, spinIndex(v.plan, v.els.length, land, ms), done);
  if (done && v.phase === 'spin') {
    v.phase = 'picked';
    raidStage.querySelector('.raid-map-line').textContent = 'The party heads for ' + nodeLabel(map.byId.get(choice.pick)) + '.';
  }
}

function drawTravel(seg, ms, v) {
  const map = live.map;
  const a = map.byId.get(map.route[seg.step]);
  const b = map.byId.get(map.route[seg.step + 1]);
  if (!v.phase) {
    v.phase = 'travel';
    showRaid('Onward', live.raid.name || 'The raid', 'is-intro');
    const view = mapView(map, seg.step + 1);
    view.token = a ? { x: a.x, y: a.y } : null;
    raidStage.innerHTML = (map.nodes.length ? mapHtml(map, view) : '') +
      '<p class="raid-map-line">' + esc('Next: ' + nodeLabel(b)) + '</p>';
  }
  if (!a || !b) return;
  const u = ease(Math.min(1, ms / SHOW.travel));
  moveToken(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
}

function drawCamp(seg, ms, v) {
  const room = seg.room;
  const healed = new Map((room.healed || []).map((row) => [row.id, row]));
  if (!v.phase) {
    v.phase = 'camp';
    showRaid('Camp', 'A short rest', 'is-intro');
    const names = (room.party || []).filter((row) => healed.has(row.id)).map((row) => row.name);
    const famine = live.raid.twist && live.raid.twist.id === 'famine';
    const line = famine ? 'The camp has no supplies. Nobody gets patched up.'
      : names.length ? joinNames(names) + (names.length === 1 ? ' gets' : ' get') + ' patched up.' : 'Nobody needed patching up.';
    const node = live.nodes.get(room.node);
    const rows = (room.party || []).map((row) => {
      const heal = healed.get(row.id);
      const before = heal ? { hp: heal.from, maxHp: heal.maxHp } : row;
      return '<div class="raid-share raid-camp-row' + (heal ? ' is-healed' : '') + '" data-id="' + esc(row.id) + '">' +
        '<strong>' + esc(row.name) + '</strong>' + hpLine(before) +
        (heal ? '<em class="raid-camp-gain">+' + (heal.to - heal.from) + '</em>' : '') +
      '</div>';
    }).join('');
    raidStage.innerHTML = '<div class="raid-camp">' + iconHtml((node && node.icon) || 385, 56) +
      '<p class="raid-chosen">' + esc(line) + '</p><div class="raid-shares">' + rows + '</div>' + quoteHtml(room.quote) + '</div>';
  }
  if (ms >= 1400 && v.phase === 'camp') {
    v.phase = 'healed';
    healed.forEach((heal, id) => {
      const el = raidStage.querySelector('.raid-camp-row[data-id="' + id + '"]');
      if (!el) return;
      el.classList.add('is-full');
      const bar = el.querySelector('.raid-hp b');
      const text = el.querySelector('.raid-hp small');
      if (bar) {
        bar.style.width = '100%';
        bar.style.background = hpColor(1);
      }
      if (text) text.textContent = heal.to + '/' + heal.maxHp;
    });
  }
}

function drawChest(seg, ms, v) {
  const room = seg.room;
  const chest = room.chest || {};
  const total = Number(chest.gold) || 0;
  if (!v.phase) {
    v.phase = 'shut';
    showRaid('Treasure', chest.name || 'A chest', 'is-intro');
    raidStage.innerHTML = '<div class="raid-chest is-' + esc(chest.id || 'small') + ' is-shut">' +
      '<div class="raid-chest-box">' + iconHtml(chest.osrsId, 72) + '</div>' +
      '<p class="raid-gold raid-chest-gold">? gold</p><div class="raid-shares"></div></div>';
  }
  if (ms < 1800) return;
  const box = raidStage.querySelector('.raid-chest');
  const goldEl = raidStage.querySelector('.raid-chest-gold');
  if (v.phase === 'shut') {
    v.phase = 'open';
    box.classList.remove('is-shut');
    box.classList.add('is-open');
  }
  const u = Math.min(1, (ms - 1800) / 1400);
  if (v.phase === 'open') {
    goldEl.innerHTML = Math.round(total * (1 - Math.pow(1 - u, 3))).toLocaleString('en-US') + ' gold' + (u >= 1 ? ' <span>split by the living</span>' : '');
  }
  if (u >= 1 && v.phase === 'open') {
    v.phase = 'split';
    raidStage.querySelector('.raid-chest .raid-shares').innerHTML = (room.shares || []).map((share) =>
      '<div class="raid-share"><strong>' + esc(share.name) + '</strong><span>' + Number(share.gold || 0).toLocaleString('en-US') + ' gp</span></div>'
    ).join('');
  }
}

function summaryHtml(room) {
  const bout = room.bout || {};
  const loot = bout.loot || {};
  const party = bout.party || [];
  const goldById = new Map((loot.shares || []).map((row) => [row.id, row.gold]));
  const takerId = loot.spooply && loot.spooply.id;
  const monsters = new Set((bout.fighters || []).filter((f) => f.monster).map((f) => f.id));
  const dealt = new Map();
  (bout.hits || []).forEach((hit) => {
    if (!hit || !(hit.amount > 0) || monsters.has(hit.from)) return;
    dealt.set(hit.from, (dealt.get(hit.from) || 0) + hit.amount);
  });
  let top = 0;
  dealt.forEach((amount) => { if (amount > top) top = amount; });
  const shares = party.map((row) => {
    const amount = dealt.get(row.id) || 0;
    const taker = row.alive && row.id === takerId ? ' is-taker' : '';
    const best = top > 0 && amount === top ? ' is-top' : '';
    const dmg = '<em class="raid-dmg">' + amount.toLocaleString('en-US') + ' dmg</em>';
    if (!row.alive) return '<div class="raid-share is-down' + taker + best + '"><strong>' + esc(row.name) + '</strong><span>Down</span>' + dmg + '</div>';
    const share = goldById.get(row.id);
    return '<div class="raid-share' + taker + best + '"><strong>' + esc(row.name) + '</strong><span>' + (share ? share.toLocaleString('en-US') : '0') + ' gp</span>' + dmg + hpLine(row) + '</div>';
  }).join('');
  let prize = '';
  if (!loot.wiped && loot.drop) {
    const drop = loot.drop;
    prize = '<div class="raid-prize' + (drop.rare ? ' is-rare' : '') + '">' + iconHtml(drop.osrsId, 64) +
      (drop.jackpot ? '<p class="raid-rare-tag">Jackpot · 500,000 gp</p>' : drop.rare ? '<p class="raid-rare-tag">Rare</p>' : '') +
      '<p class="raid-take">' + esc((loot.spooply && loot.spooply.name) || 'Someone') + ' takes the ' + esc(drop.name) + '.</p></div>';
  }
  const goldLine = loot.wiped
    ? (party.some((row) => row.alive) ? 'Time called. <span>No kill, so no loot.</span>' : 'The party fell. <span>No one is left to loot.</span>')
    : Number(loot.gold || 0).toLocaleString('en-US') + ' gold <span>split by the living</span>';
  return '<div class="raid-summary"><p class="raid-gold">' + goldLine + '</p>' + prize + '<div class="raid-shares">' + shares + '</div></div>';
}

// Who loots, the drop reel, then the split with a countdown to the next room. The last fight
// of the night has no next room, so it closes on a line instead of a countdown.
function drawLoot(room, ms, span, v, closing) {
  const bout = room.bout || {};
  const loot = bout.loot || {};
  const party = bout.party || [];
  const alive = party.filter((row) => row.alive);
  const bossName = (room.boss && room.boss.name) || bout.bossName || 'Boss';
  const rolls = !loot.wiped && loot.drop && loot.spooply;
  let phase = 'split';
  if (rolls && ms < ROLL.spin) phase = 'who';
  else if (rolls && ms < ROLL.spin + ROLL.up) phase = 'up';
  else if (rolls && ms < ROLL.spin + ROLL.up + ROLL.reel) phase = 'reel';
  else if (rolls && ms < ROLL_MS) phase = 'land';
  const living = alive.length ? alive : loot.spooply ? [loot.spooply] : [];
  const who = Math.max(0, living.findIndex((row) => row.id === (loot.spooply && loot.spooply.id)));
  const fresh = v.phase !== phase;
  if (fresh) {
    v.phase = phase;
    showRaid(bossName, { who: 'Who loots', up: 'Who loots', reel: 'The drop', land: 'The drop', split: loot.wiped ? 'No loot' : 'The split' }[phase]);
  }
  if (phase === 'who' || phase === 'up') {
    if (fresh) {
      raidStage.innerHTML = '<div class="raid-who">' + living.map((row) => '<div class="raid-chip">' + esc(row.name) + '</div>').join('') + '</div>' +
        (phase === 'up' ? '<p class="raid-chosen">' + esc(loot.spooply.name) + ' is up.</p>' : '');
      v.els = Array.from(raidStage.querySelectorAll('.raid-chip'));
      v.plan = spinPlan(v.els.length, who, ROLL.spin);
    }
    lightChips(v.els, phase === 'up' ? who : spinIndex(v.plan, v.els.length, who, ms), phase === 'up');
    return;
  }
  if (phase === 'reel' || phase === 'land') {
    const drop = loot.drop;
    if (fresh || !v.strip) {
      const reel = drop.reel || [];
      raidStage.innerHTML = '<div class="roll-window"><div class="roll-marker"></div><div class="roll-strip">' +
        reel.map((item, i) => '<div class="roll-card' + (item && item.rare ? ' is-rare' : '') + '" data-i="' + i + '">' + iconHtml(item && item.osrsId, 42) + '<span>' + esc(item ? item.name : '') + '</span></div>').join('') +
        '</div></div><p class="raid-land"></p>';
      v.strip = raidStage.querySelector('.roll-strip');
      const win = raidStage.querySelector('.roll-card[data-i="' + drop.winIndex + '"]');
      const viewW = raidStage.querySelector('.roll-window').clientWidth || 640;
      const cardW = ((win && win.offsetWidth) || 112) + 8;
      const maxShift = Math.max(0, v.strip.scrollWidth - viewW);
      v.target = Math.max(0, Math.min(maxShift, (win ? win.offsetLeft : drop.winIndex * cardW) - viewW / 2 + ((win && win.offsetWidth) || 112) / 2));
      v.from = Math.min(maxShift, v.target + cardW * 11);
      v.win = win;
    }
    const u = phase === 'land' ? 1 : (ms - ROLL.spin - ROLL.up) / ROLL.reel;
    const shift = v.from + (v.target - v.from) * (1 - Math.pow(1 - u, 4));
    v.strip.style.transform = 'translateX(' + (-shift) + 'px)';
    if (phase === 'land' && fresh) {
      if (v.win) v.win.classList.add('is-win');
      raidStage.querySelector('.raid-land').textContent = drop.name || '';
      if (drop.rare) {
        raidEl.classList.add('is-rare-land');
        raidEl.classList.toggle('is-jackpot-land', !!drop.jackpot);
        raidStage.insertAdjacentHTML('beforeend', '<p class="r3d-rare-banner' + (drop.jackpot ? ' is-jackpot' : '') + '">' +
          (drop.jackpot ? 'JACKPOT!' : 'RARE DROP!') +
          (drop.lucky ? '<small>Lucky Night reroll</small>' : drop.jackpot ? '<small>500,000 gp</small>' : '') + '</p>');
      }
    }
    return;
  }
  if (fresh) {
    v.strip = null;
    raidStage.innerHTML = summaryHtml(room) + (loot.quotes || []).map(quoteHtml).join('') + '<p class="raid-next"></p>';
    v.next = raidStage.querySelector('.raid-next');
  }
  const cleared = !loot.wiped && alive.length > 0;
  const left = Math.ceil((span - ms) / 1000);
  v.next.textContent = closing ? (cleared ? 'Raid complete.' : 'The raid ends here.') : left > 0 ? 'Moving on in ' + left : 'Moving on';
}

function raidTallies(raid) {
  const people = new Map();
  const person = (id, name) => {
    let row = people.get(id);
    if (!row) people.set(id, (row = { name: name || 'Spoop', damage: 0, gold: 0, drops: [], fell: '' }));
    return row;
  };
  (raid.rooms || []).forEach((room) => {
    if (room.kind === 'treasure') return (room.shares || []).forEach((s) => { if (s) person(s.id, s.name).gold += Number(s.gold) || 0; });
    if (room.kind === 'rest') return;
    const bout = room.bout || {};
    const bossName = (room.boss && room.boss.name) || 'the room';
    const named = new Map((bout.party || []).map((row) => [row.id, row.name]));
    (bout.hits || []).forEach((hit) => {
      if (hit && hit.amount > 0 && named.has(hit.from)) person(hit.from, named.get(hit.from)).damage += hit.amount;
    });
    const loot = bout.loot || {};
    (loot.shares || []).forEach((s) => { if (s) person(s.id, s.name).gold += Number(s.gold) || 0; });
    if (!loot.wiped && loot.drop && loot.drop.name && loot.spooply) person(loot.spooply.id, loot.spooply.name).drops.push({ name: loot.drop.name, osrsId: loot.drop.osrsId, rare: !!loot.drop.rare, from: bossName });
    (bout.party || []).forEach((row) => { if (!row.alive) person(row.id, row.name).fell = bossName; });
  });
  return Array.from(people.values());
}

function drawRecap(v) {
  if (v.phase === 'recap') return;
  v.phase = 'recap';
  const raid = live.raid;
  const rows = raidTallies(raid);
  const rooms = raid.rooms || [];
  const lastRoom = rooms[rooms.length - 1];
  const killed = rooms.filter((room) => room.bout && room.bout.loot && !room.bout.loot.wiped && room.boss && room.boss.name && !room.boss.skirmish).map((room) => room.boss.name);
  const chests = rooms.filter((room) => room.kind === 'treasure' && room.chest).map((room) => room.chest.name);
  const depth = live.map.layers ? ' Reached ' + live.map.route.length + ' of ' + live.map.layers + ' rooms.' : '';
  const headline = raid.cleared ? 'The party cleared the raid.' : 'The party fell to ' + ((lastRoom && lastRoom.boss && lastRoom.boss.name) || 'the raid') + '.';
  const path = (killed.length ? 'Killed ' + joinNames(killed) + '.' : 'No boss went down.') + (chests.length ? ' Opened a ' + joinNames(chests) + '.' : '') + depth;
  const awards = (raid.awards || []).length
    ? '<ul class="raid-awards">' + raid.awards.map((a) => '<li class="raid-award is-' + esc(a.id) + '" title="' + esc(a.detail || '') + '"><span>' + esc(a.name) + '</span><strong>' + esc(a.who) + '</strong></li>').join('') + '</ul>'
    : '';
  const list = (sorted, key, unit) => {
    const top = sorted.some((row) => row[key] !== sorted[0][key]) ? sorted.reduce((best, row) => Math.max(best, row[key]), 0) : 0;
    return sorted.map((row) => {
      const best = top > 0 && row[key] === top ? ' is-best' : '';
      const where = key === 'damage' && row.fell ? '<span class="meta">Fell to ' + esc(row.fell) + '</span>' : '';
      return '<li class="raid-recap-row' + best + '"><span class="who">' + esc(row.name) + (best ? '<em>Most</em>' : '') + '</span><span class="num">' + row[key].toLocaleString('en-US') + unit + '</span>' + where + '</li>';
    }).join('');
  };
  const drops = [];
  rows.forEach((row) => row.drops.forEach((drop) => drops.push({ who: row.name, drop })));
  const dropHtml = drops.length
    ? drops.map((row) => '<li class="raid-recap-drop' + (row.drop.rare ? ' is-rare' : '') + '">' + iconHtml(row.drop.osrsId, 36) +
      '<span><strong>' + esc(row.who) + '</strong><span>' + esc(row.drop.name) + '</span><em>from ' + esc(row.drop.from) + '</em></span></li>').join('')
    : '<li class="raid-recap-empty">Nobody took a drop.</li>';
  showRaid('Raid over', raid.name || 'The raid', 'is-recap');
  raidStage.innerHTML = '<p class="raid-recap-fell' + (raid.cleared ? ' is-clear' : '') + '">' + esc(headline) + '</p>' +
    '<p class="raid-recap-path">' + esc(path) + '</p>' + awards + recordsHtml(raid.records) +
    '<div class="raid-recap-cols">' +
      '<section><h3>Damage</h3><ol class="raid-recap-list">' + list(rows.slice().sort((a, b) => b.damage - a.damage || a.name.localeCompare(b.name)), 'damage', '') + '</ol></section>' +
      '<section><h3>Gold</h3><ol class="raid-recap-list">' + list(rows.slice().sort((a, b) => b.gold - a.gold || a.name.localeCompare(b.name)), 'gold', ' gp') + '</ol></section>' +
      '<section><h3>Drops</h3><ol class="raid-recap-list">' + dropHtml + '</ol></section>' +
    '</div>';
}

function recordsHtml(records) {
  const board = (records && records.board) || [];
  if (!board.length) return '';
  const beat = new Map(((records && records.broken) || []).filter((row) => row.prev != null).map((row) => [row.id, row]));
  return '<section class="r3d-records"><h3>Records</h3><ul>' + board.map((row) => {
    const was = beat.get(row.id);
    return '<li' + (was ? ' class="is-new"' : '') + '><span>' + esc(row.label) + '</span><strong>' + esc(row.who) + '</strong> <em>' + esc(row.text) + '</em>' +
      (was ? '<small>Was ' + esc(row.id.startsWith('kill-') ? Number(was.prev).toFixed(1) + 's' : Number(was.prev).toLocaleString('en-US')) + (was.prevWho ? ' by ' + esc(was.prevWho) : '') + '</small>' : '') + '</li>';
  }).join('') + '</ul></section>';
}

function drawSeg(seg, ms) {
  if (live.view.seg !== seg) live.view = { seg };
  const v = live.view;
  if (seg.kind === 'fight') {
    raidEl.hidden = true;
    cardEl.hidden = true;
    return;
  }
  if (seg.kind === 'open') return drawOpen(ms, v);
  if (seg.kind === 'card') return drawCard(seg, v);
  if (seg.kind === 'loot') return drawLoot(seg.room, ms, seg.end - seg.start, v, seg.closing);
  if (seg.kind === 'fork') return drawFork(seg, ms, v);
  if (seg.kind === 'travel') return drawTravel(seg, ms, v);
  if (seg.kind === 'camp') return drawCamp(seg, ms, v);
  if (seg.kind === 'chest') return drawChest(seg, ms, v);
  if (seg.kind === 'recap') return drawRecap(v);
}

function tickLive(dt) {
  if (!live || !live.segs) return;
  if (live.playing && !dragging) live.clock += dt * 1000;
  const clock = live.clock;
  const seg = live.segs.find((row) => clock >= row.start && clock < row.end) || live.segs[live.segs.length - 1];
  if (seg.index != null && seg.room && seg.room.bout && seg.index !== live.room) {
    live.room = seg.index;
    loadFight(seg.room.bout, { preview: false });
    bannerEl.hidden = true;
    snapFacing = true;
  }
  if (seg.kind === 'card') t = 0;
  else if (seg.kind === 'fight') t = ((clock - seg.start) / 1000) * LIVE_SPEED * PACE;
  else if (seg.kind === 'loot') t = endAt;
  live.seg = seg;
  drawSeg(seg, clock - seg.start);
  const shown = Math.min(clock, live.total);
  if (!dragging) scrub.value = String(shown / 1000);
  const mm = Math.floor(shown / 60000);
  const ss = Math.floor((shown % 60000) / 1000);
  clockEl.textContent = mm + ':' + String(ss).padStart(2, '0') + ' / ' + Math.floor(live.total / 60000) + ':' + String(Math.floor((live.total % 60000) / 1000)).padStart(2, '0');
}

function startLivePlayback(last) {
  live = planRaid(last);
  live.clock = Math.max(0, Date.now() - live.startAt);
  // Joining after the end goes straight to the night's totals.
  if (live.clock > live.total) live.clock = live.total;
  scrub.max = String(live.total / 1000);
  setPlaying(true);
  statusEl.textContent = (live.raid.name || 'Raid') + (Date.now() < live.startAt + live.total ? ' · live' : ' · replay');
}

// Wait for the raid, then play it. Joining late jumps to where everyone else is.
async function watchLive() {
  window.clearTimeout(livePoll);
  live = live && live.segs ? live : { waiting: true };
  try {
    const card = await (await fetch('/api/arena')).json();
    const special = card.special;
    const last = card.last;
    const lastIsRaid = last && last.kind === 'raid' && last.hasReplay;
    const due = special ? Date.parse(special.at) : 0;
    if (special && (!lastIsRaid || Date.parse(last.at) < due)) {
      const left = Math.max(0, due - Date.now());
      const mm = Math.floor(left / 60000);
      const ss = Math.floor((left % 60000) / 1000);
      showCard('Raid', 'Starts ' + special.label.replace(/^.*?, .*?, /, ''), '<p>' + (left > 0 ? 'In ' + mm + ':' + String(ss).padStart(2, '0') : 'Any second now') + '</p><p class="is-dim">The party warms up while you wait.</p>');
      if (!bout) showPreview();
      livePoll = window.setTimeout(watchLive, left > 60000 ? 15000 : left > 0 ? 4000 : 2000);
      return;
    }
    if (!lastIsRaid) {
      showCard('Raid', 'No raid to watch', '<p class="is-dim">The next one shows up here when it starts.</p>');
      return;
    }
    const full = await (await fetch('/api/arena?replay=1')).json();
    if (!full.last || !full.last.raid) throw new Error('no raid');
    startLivePlayback(full.last);
  } catch (err) {
    showCard('Raid', 'Could not load the raid', '<p class="is-dim">Trying again shortly.</p>');
    livePoll = window.setTimeout(watchLive, 10000);
  }
}

// ---- Data ----

function renderPicks(spoops) {
  picks.innerHTML = '';
  spoops.forEach((spoop) => {
    const label = document.createElement('label');
    const weapon = spoop.equipped && spoop.equipped.weapon;
    const hp = ((spoop.skills || []).find((skill) => skill.id === 'hitpoints') || {}).level;
    label.title = 'Cb ' + spoop.combat + ' · ' + ((weapon && weapon.style) || 'melee') + ' · hp ' + hp;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.value = spoop.name;
    label.appendChild(box);
    label.appendChild(document.createTextNode(spoop.name));
    picks.appendChild(label);
  });
}

function selected() {
  return Array.from(picks.querySelectorAll('input:checked')).map((box) => box.value);
}

function play(data) {
  lastData = data;
  loadFight(data.bout, { preview: false });
  const boss = data.boss || {};
  statusEl.textContent = (boss.name || 'Boss') + ' · ' + (boss.tierName || '') + ' · ' + (boss.hp || 0) + ' hp · hits ' + (boss.maxHit || 0);
  setPlaying(true);
}

async function fight() {
  if (busy) return;
  const names = selected();
  if (!names.length) {
    statusEl.textContent = 'Pick at least one spoop.';
    return;
  }
  if (!seedEl.value.trim()) seedEl.value = String(Date.now());
  busy = true;
  fightBtn.disabled = true;
  statusEl.textContent = 'Walking in…';
  try {
    const res = await fetch('/api/spoops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'raid-test', names, seed: seedEl.value.trim(), boss: bossEl.value, tier: tierEl.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.bout) throw new Error(data.error || 'Could not run the fight');
    if (data.seed) seedEl.value = data.seed;
    play(data);
  } catch (err) {
    statusEl.textContent = err.message;
  } finally {
    busy = false;
    fightBtn.disabled = false;
  }
}

// Each boss's usual tier, same as /js/raid.js.
const HOME_TIER = { elvarg: 'easy', mole: 'medium', brutus: 'medium', scurrius: 'medium', chaos: 'hard', leviathan: 'master', obor: 'easy', vorkath: 'hard', bryophyta: 'easy', kbd: 'medium', kq: 'hard' };
bossEl.addEventListener('change', () => {
  if (HOME_TIER[bossEl.value]) tierEl.value = HOME_TIER[bossEl.value];
  tierEl.disabled = bossEl.value === 'live';
  fightBtn.textContent = bossEl.value === 'live' ? 'Watch' : 'Fight';
  if (bossEl.value === 'live') watchLive();
  else leaveLive();
});

// /raid3d.html?live opens straight onto the live raid.
if (new URLSearchParams(location.search).has('live')) {
  document.body.classList.add('is-watch');
  bossEl.value = 'live';
  tierEl.disabled = true;
  fightBtn.textContent = 'Watch';
  watchLive();
}
function leaveLive() {
  window.clearTimeout(livePoll);
  live = null;
  cardEl.hidden = true;
  raidEl.hidden = true;
}

fightBtn.addEventListener('click', () => {
  if (bossEl.value === 'live') {
    watchLive();
    return;
  }
  leaveLive();
  fight();
});
replayBtn.addEventListener('click', () => {
  if (live && live.segs) {
    live.clock = 0;
    live.view = {};
    live.playing = true;
    setPlaying(true);
    return;
  }
  if (lastData) play(lastData);
});

fetch('/api/spoops')
  .then((res) => res.json())
  .then((data) => {
    spoopList = data.spoops || [];
    renderPicks(spoopList);
    if (!bout || preview) showPreview();
  })
  .catch(() => {
    statusEl.textContent = 'Could not load spoops.';
  });
