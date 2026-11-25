// Camera modes. Free is orbit controls. Cinematic plans a shot list from the fight timeline:
// high slow pans as the base, cutting in close for big attacks, deaths and the party at work.
// Each shot is a function of fight time, so pausing or scrubbing holds the same framing.
import * as THREE from 'three';
import { toWorld } from './world.js';

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ease(u) {
  const k = Math.max(0, Math.min(1, u));
  return k * k * (3 - 2 * k);
}

export function createDirector(world) {
  const camera = world.camera;
  const controls = world.controls;
  let mode = 'cinematic';
  let shots = [];
  let lastTarget = new THREE.Vector3(0, 0.6, 0);
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const listeners = [];

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    controls.enabled = mode === 'free';
    if (mode === 'free') {
      controls.target.copy(lastTarget);
      controls.update();
    }
    listeners.forEach((fn) => fn(mode));
  }

  // Plan the shots for one fight. info: { duration, hazards, deaths, actors (Map), bossId, preview }
  function plan(info) {
    shots = [];
    if (info.preview) {
      shots.push({ type: 'orbit', start: 0, end: Infinity });
      return;
    }
    const r = rng(Math.floor((info.duration || 1) * 1000) + (info.hazards || []).length * 7);
    const end = info.duration || 0;
    const key = [];
    // Deaths come first: every one gets its moment.
    (info.deaths || []).forEach((d) => {
      if (d.id === info.bossId) key.push({ type: 'finale', start: d.t - 0.6, end: d.t + 3.2, id: d.id });
      else key.push({ type: 'fall', start: d.t - 0.7, end: d.t + 1.5, id: d.id });
    });
    // Big attacks next, spaced out so it never cuts every two seconds.
    let lastBig = -10;
    (info.hazards || []).forEach((hz) => {
      const big = hz.tone === 'fire' || hz.attack === 'burrow' || hz.kind === 'cone' || hz.kind === 'lane';
      if (!big || hz.t0 - lastBig < 7 || r() < 0.3) return;
      lastBig = hz.t0;
      key.push({ type: 'hazard', start: hz.t0 - 0.15, end: hz.t1 + 0.8, hz, a: r() * Math.PI * 2 });
    });
    key.sort((a, b) => a.start - b.start);
    const kept = [];
    key.forEach((shot) => {
      const prev = kept[kept.length - 1];
      if (prev && shot.start < prev.end) {
        if (shot.type === 'fall' || shot.type === 'finale') {
          prev.end = shot.start;
          kept.push(shot);
        }
        return;
      }
      kept.push(shot);
    });
    // Fill the gaps: open with a crane down, then rotate between a high pan, a hero shot and the boss.
    const fill = ['wide', 'hero', 'wide', 'boss', 'wide', 'hero'];
    let at = 0;
    let n = 0;
    const out = [];
    const opening = Math.min(4.5, end);
    out.push({ type: 'establish', start: 0, end: opening });
    at = opening;
    kept.concat([{ start: Infinity }]).forEach((shot) => {
      while (at < Math.min(shot.start, end + 1)) {
        const type = fill[n % fill.length];
        const len = type === 'wide' ? 6 + r() * 3 : 3.5 + r() * 2;
        const stop = Math.min(shot.start, at + len);
        if (stop - at < 1.5 && out.length) out[out.length - 1].end = stop;
        else out.push({ type, start: at, end: stop, a: r() * Math.PI * 2, side: r() < 0.5 ? 1 : -1, pick: r() });
        at = stop;
        n += 1;
      }
      if (shot.start !== Infinity) {
        out.push(shot);
        at = shot.end;
      }
    });
    out.push({ type: 'wide', start: at, end: Infinity, a: r() * Math.PI * 2 });
    shots = out;
  }

  function partyCentre(ctx, out) {
    out.set(0, 0, 0);
    let n = 0;
    ctx.actors.forEach((a) => {
      if (a.monster || a.sample.hidden) return;
      if (a.deathT != null && ctx.t > a.deathT + 1) return;
      out.add(a.pos);
      n += 1;
    });
    if (n) out.multiplyScalar(1 / n);
    return out;
  }

  // The direction from the boss with the most room between it and the party.
  function clearSide(ctx, bossPos) {
    let best = null;
    let bestGap = -1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const cam = bossPos.clone().addScaledVector(dir, 7.5);
      let gap = Infinity;
      ctx.actors.forEach((x) => {
        if (x.monster || x.sample.hidden) return;
        // Distance from each spoop to the line between camera and boss.
        const along = Math.max(0, Math.min(1, x.pos.clone().sub(bossPos).dot(dir) / 7.5));
        const near = bossPos.clone().addScaledVector(dir, along * 7.5);
        gap = Math.min(gap, near.distanceTo(x.pos) + (along < 0.2 ? 1 : 0));
      });
      // Prefer the side facing the default camera a little, so the ground reads well.
      const score = gap + dir.z * 0.6;
      if (score > bestGap) {
        bestGap = score;
        best = dir;
      }
    }
    return best || new THREE.Vector3(0, 0, 1);
  }

  function heroFor(shot, ctx) {
    const alive = [];
    ctx.actors.forEach((a) => {
      if (a.monster || a.sample.hidden) return;
      if (a.deathT != null && a.deathT < shot.end) return;
      alive.push(a);
    });
    if (!alive.length) return null;
    return alive[Math.floor(shot.pick * alive.length) % alive.length];
  }

  // A little handheld drift so even a held shot breathes.
  function drift(t, amount) {
    pos.x += Math.sin(t * 0.7) * amount;
    pos.y += Math.sin(t * 0.53 + 1) * amount * 0.6;
  }

  function frame(shot, ctx) {
    const t = ctx.t;
    const u = shot.end === Infinity ? 0 : (t - shot.start) / Math.max(0.1, shot.end - shot.start);
    const boss = ctx.boss;
    const bossPos = boss ? boss.pos : tmp2.set(0, 0, 0);
    const bossH = boss ? boss.obj.height : 3;
    if (shot.type === 'orbit') {
      const a = t * 0.12;
      pos.set(Math.sin(a) * 10, 4.2, Math.cos(a) * 10 + 0.8);
      target.set(0, 1, 0.6);
      return;
    }
    if (shot.type === 'establish') {
      const k = ease(u);
      const a = 0.4 - k * 0.5;
      const rad = 26 - k * 11;
      pos.set(Math.sin(a) * rad, 18 - k * 8, Math.cos(a) * rad);
      target.set(0, 0.8, 0);
      return;
    }
    if (shot.type === 'wide') {
      partyCentre(ctx, target).lerp(bossPos, 0.4);
      target.y = 0.8;
      const a = shot.a + (t - shot.start) * 0.06;
      pos.set(target.x + Math.sin(a) * 16, 11.5, target.z + Math.cos(a) * 16);
      drift(t, 0.15);
      return;
    }
    if (shot.type === 'boss') {
      // Low, looking up at the boss, from whichever side is clearest of the party when the shot starts.
      if (!shot.dir) shot.dir = clearSide(ctx, bossPos);
      const push = 8 - ease(u) * 1.5;
      pos.copy(bossPos).addScaledVector(shot.dir, push);
      pos.y = 1.3;
      target.copy(bossPos);
      target.y = bossH * 0.5;
      drift(t, 0.05);
      return;
    }
    if (shot.type === 'hero') {
      const hero = heroFor(shot, ctx);
      if (!hero) {
        shot.type = 'wide';
        return frame(shot, ctx);
      }
      // Over the shoulder, toward the boss.
      tmp.subVectors(bossPos, hero.pos).setY(0);
      if (tmp.lengthSq() < 0.01) tmp.set(0, 0, -1);
      tmp.normalize();
      const side = tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar((shot.side || 1) * 1.1);
      pos.copy(hero.pos).addScaledVector(tmp, -2.6 - ease(u) * 0.4).add(side);
      pos.y = 2.05;
      target.copy(hero.pos).lerp(bossPos, 0.55);
      target.y = 1.2;
      drift(t, 0.03);
      return;
    }
    if (shot.type === 'hazard') {
      // From the side of the attack, so a breath or a throw crosses the frame.
      const hz = shot.hz;
      const aim = hz.kind === 'lane' ? toWorld(hz.x2, hz.y2, tmp)
        : hz.kind === 'cone' ? toWorld(Number(hz.x) + Math.cos(hz.a) * hz.r, Number(hz.y) + Math.sin(hz.a) * hz.r, tmp)
          : toWorld(hz.x, hz.y, tmp);
      target.copy(aim).lerp(bossPos, 0.5);
      tmp2.subVectors(aim, bossPos).setY(0);
      if (tmp2.lengthSq() < 0.01) tmp2.set(1, 0, 0);
      tmp2.normalize();
      const sideSign = Math.cos(shot.a) > 0 ? 1 : -1;
      const sx = -tmp2.z * sideSign;
      const sz = tmp2.x * sideSign;
      // Lean the side toward the default camera so it never ends up looking from behind the trees.
      const rad = 10 - ease(u) * 2.5;
      pos.set(target.x + sx * rad, 5 - ease(u) * 1.2, target.z + sz * rad + 2);
      target.y = 1;
      // A kick when it lands.
      const since = t - hz.t1;
      if (since > 0 && since < 0.35) {
        const shake = (1 - since / 0.35) * 0.12;
        pos.x += Math.sin(t * 90) * shake;
        pos.y += Math.cos(t * 77) * shake;
      }
      return;
    }
    if (shot.type === 'fall' || shot.type === 'finale') {
      const who = ctx.actors.get(shot.id);
      if (!who) {
        shot.type = 'wide';
        return frame(shot, ctx);
      }
      const finale = shot.type === 'finale';
      const a = (finale ? 0.6 : 2.2) + u * (finale ? 0.7 : 0.5);
      const rad = finale ? 8 + ease(u) * 4 : 3.4;
      target.copy(who.pos);
      target.y = finale ? bossH * 0.4 : 0.5;
      pos.set(who.pos.x + Math.sin(a) * rad, finale ? 2.5 + ease(u) * 4 : 1.8, who.pos.z + Math.cos(a) * rad);
      return;
    }
    partyCentre(ctx, target);
    pos.set(target.x, 12, target.z + 14);
  }

  // A boss's entrance before the fight: low and close, sweeping round and pulling up and back.
  function intro(ctx) {
    const boss = ctx.boss;
    const k = ease(ctx.intro);
    const h = boss.obj.height || 3;
    const a = 0.95 - k * 1.5;
    const rad = h * 1.1 + 3 + k * (h * 0.9 + 4);
    pos.set(boss.pos.x + Math.sin(a) * rad, 0.7 + k * (h * 0.7 + 2), boss.pos.z + Math.cos(a) * rad);
    target.copy(boss.pos);
    target.y = h * (0.62 - k * 0.15);
    drift(ctx.intro * 10, 0.04);
  }

  function update(ctx) {
    if (mode === 'cinematic' && ctx.intro != null && ctx.boss) {
      intro(ctx);
      camera.position.copy(pos);
      camera.lookAt(target);
      lastTarget.copy(target);
      return;
    }
    if (mode !== 'cinematic' || !shots.length) {
      controls.update();
      return;
    }
    let shot = shots[0];
    for (let i = 0; i < shots.length; i++) {
      if (ctx.t >= shots[i].start) shot = shots[i];
      else break;
    }
    frame(shot, ctx);
    camera.position.copy(pos);
    camera.lookAt(target);
    lastTarget.copy(target);
  }

  // Grabbing the view while a shot is running hands the camera over.
  // Capture phase, so the orbit controls see the same press already switched on.
  world.renderer.domElement.addEventListener('pointerdown', () => {
    if (mode === 'cinematic') setMode('free');
  }, { capture: true });
  world.renderer.domElement.addEventListener('wheel', () => {
    if (mode === 'cinematic') setMode('free');
  }, { passive: true, capture: true });

  controls.enabled = false;

  return {
    plan,
    update,
    setMode,
    get mode() { return mode; },
    onMode(fn) { listeners.push(fn); },
    get shots() { return shots; },
  };
}
