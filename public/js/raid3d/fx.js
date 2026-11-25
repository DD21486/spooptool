// Ground warnings, thrown blobs, flames, arrows and spells. Everything here is a pure
// function of fight time, so pausing or scrubbing the timeline shows the same frame.
import * as THREE from 'three';
import { K, toWorld } from './world.js';

const TONES = {
  fire: '#f97316', ice: '#7dd3fc', poison: '#4ade80', shock: '#facc15', moss: '#84cc16',
  bomb: '#ec4899', lava: '#f97316', acid: '#84cc16', 'acid-spit': '#a8e040', swipe: '#fb923c', shadow: '#1f2937',
  spine: '#d8d0b8', bolt: '#c4b5fd', blast: '#ff8a3a', spike: '#d8d8e0', bounce: '#c084fc', rock: '#9a948a',
  'discord-magic': '#7a5aff', 'discord-range': '#5aff7a', 'discord-melee': '#ff5a5a',
  'orb-magic': '#5a8aff', 'orb-range': '#5aff7a', 'orb-melee': '#ff5a5a',
  wave: '#5ac8ff', smoke: '#6a6a72', swing: '#e8501a', claw: '#e8501a',
};
// Attacks that leave the boss's mouth as a fast shot and land on their circle.
const SHOTS = new Set(['barrage', 'orb', 'bolt', 'discord', 'shock', 'spit']);
// Breath attacks spray from the mouth onto their area.
const BREATH = { fire: 'fire', breath: 'fire', ice: 'ice', poison: 'poison', dirt: 'dirt' };
const ATTACK_TONE = { burrow: '#8a5a2b', dirt: '#a16207', claw: '#e8501a', slash: '#e8501a', rocks: '#9a948a', madness: '#a855f7', confusion: '#c084fc' };
const DEFAULT_TONE = '#e8501a';

function toneOf(hz) {
  return TONES[hz.tone] || ATTACK_TONE[hz.attack] || DEFAULT_TONE;
}

function coneHeading(hz, t) {
  if (t >= hz.lockAt) return Number(hz.a);
  const span = Math.max(0.1, Number(hz.lockAt) - Number(hz.t0));
  const u = Math.max(0, Math.min(1, (t - hz.t0) / span));
  return Number(hz.from) + Number(hz.sweep) * (1 - Math.pow(1 - u, 3));
}

function seeded(i) {
  let a = (i * 2654435761) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let flameTexture = null;
function flameTex() {
  if (flameTexture) return flameTexture;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,220,1)');
  grad.addColorStop(0.35, 'rgba(255,190,80,0.9)');
  grad.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  flameTexture = new THREE.CanvasTexture(c);
  flameTexture.colorSpace = THREE.SRGBColorSpace;
  return flameTexture;
}

// Thrown marks: the blob leaves the boss part way through the warning and lands on the mark.
const LOB = { lead: 0.4, arc: 2.2 };

export function createFx(scene) {
  const hazardGroup = new THREE.Group();
  hazardGroup.position.y = 0.03;
  scene.add(hazardGroup);
  const airGroup = new THREE.Group();
  scene.add(airGroup);
  let made = new Map();
  let hazards = [];

  function clear() {
    made.forEach((entry) => {
      [entry.group].concat(entry.extra).forEach((root) => {
        root.traverse((o) => {
          if (o.geometry && !o.isSprite) o.geometry.dispose();
          if (o.material && o.material !== sharedFlameMat) o.material.dispose();
        });
        root.removeFromParent();
      });
    });
    made = new Map();
    projectilePool.forEach((p) => { p.visible = false; });
  }

  const sharedFlameMat = new THREE.SpriteMaterial({ map: flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

  // Rocks left lying from earlier drops, for the Leviathan's smoke to hide behind.
  let rubble = [];
  const rubbleMeshes = [];
  function setRubble(list) {
    rubbleMeshes.forEach((m) => m.removeFromParent());
    rubbleMeshes.length = 0;
    rubble = list || [];
    rubble.forEach((rock, i) => {
      const s = Math.max(0.4, Number(rock.r) * K * 0.9);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), new THREE.MeshLambertMaterial({ color: '#6e6a62', flatShading: true }));
      m.position.copy(toWorld(rock.x, rock.y));
      m.position.y = s * 0.45;
      m.scale.y = 0.75;
      m.rotation.set(i, i * 2, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      m.visible = false;
      airGroup.add(m);
      rubbleMeshes.push(m);
    });
  }
  function updateRubble(t) {
    rubble.forEach((rock, i) => { rubbleMeshes[i].visible = t >= rock.t; });
  }

  function setHazards(list) {
    clear();
    hazards = list || [];
  }

  function fillMat(color) {
    return new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.35, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }

  function build(hz, i) {
    const group = new THREE.Group();
    const color = toneOf(hz);
    const fill = fillMat(color);
    const edge = fillMat(color);
    let shape = null;
    let rim = null;
    const r = Math.max(0.2, Number(hz.r) * K);
    if (hz.kind === 'lane') {
      const a = toWorld(hz.x1, hz.y1);
      const b = toWorld(hz.x2, hz.y2);
      const len = a.distanceTo(b);
      const geo = new THREE.PlaneGeometry(len, Math.max(0.2, Number(hz.w) * K));
      geo.rotateX(-Math.PI / 2);
      shape = new THREE.Mesh(geo, fill);
      shape.position.copy(a).add(b).multiplyScalar(0.5);
      shape.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    } else if (hz.kind === 'cone') {
      const geo = new THREE.CircleGeometry(r, 24, -Number(hz.arc), Number(hz.arc) * 2);
      geo.rotateX(-Math.PI / 2);
      shape = new THREE.Mesh(geo, fill);
      shape.position.copy(toWorld(hz.x, hz.y));
    } else {
      const geo = new THREE.CircleGeometry(r, 28);
      geo.rotateX(-Math.PI / 2);
      shape = new THREE.Mesh(geo, fill);
      shape.position.copy(toWorld(hz.x, hz.y));
      const ring = new THREE.RingGeometry(Math.max(0.05, r - 0.08), r, 28);
      ring.rotateX(-Math.PI / 2);
      rim = new THREE.Mesh(ring, edge);
      rim.position.copy(shape.position);
      rim.position.y += 0.005;
      group.add(rim);
    }
    group.add(shape);

    let lob = null;
    const from = toWorld(hz.x1, hz.y1);
    const to = toWorld(hz.x, hz.y);
    if (hz.kind === 'mark' && from.distanceTo(to) > 0.8) {
      const lobColor = hz.attack === 'dirt' ? '#7a4a1e' : color;
      lob = new THREE.Mesh(new THREE.IcosahedronGeometry(hz.attack === 'dirt' ? 0.22 : 0.26, 0),
        new THREE.MeshLambertMaterial({ color: lobColor, emissive: hz.tone ? color : '#000000', emissiveIntensity: 0.8, flatShading: true }));
      lob.castShadow = true;
      airGroup.add(lob);
    }

    let flames = null;
    if (hz.tone === 'fire' || hz.tone === 'lava') {
      flames = [];
      const rand = seeded(i + 1);
      for (let n = 0; n < 22; n++) {
        const sprite = new THREE.Sprite(sharedFlameMat);
        sprite.userData = { a: rand(), b: rand(), c: rand() };
        sprite.visible = false;
        airGroup.add(sprite);
        flames.push(sprite);
      }
    }

    // Claw and slash attacks leave a bright arc across the area as they land.
    let arc = null;
    if (hz.attack === 'slash' || hz.attack === 'swipe' || hz.attack === 'claw') {
      const cone = hz.kind === 'cone';
      const len = cone ? Number(hz.arc) * 2 : 2.4;
      const geo = new THREE.RingGeometry(r * (cone ? 0.45 : 0.5), r * (cone ? 0.95 : 0.82), 24, 1, -len / 2, len);
      geo.rotateX(-Math.PI / 2);
      arc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: '#fff4dc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      arc.position.copy(toWorld(hz.x, hz.y));
      arc.position.y = 0.55;
      arc.visible = false;
      airGroup.add(arc);
    }

    // A falling rock for rock attacks.
    let rock = null;
    if (hz.attack === 'rocks') {
      rock = new THREE.Mesh(new THREE.DodecahedronGeometry(Math.max(0.35, r * 0.55), 0),
        new THREE.MeshLambertMaterial({ color: '#7d7a72', flatShading: true }));
      rock.castShadow = true;
      rock.visible = false;
      airGroup.add(rock);
    }
    // A shot from the mouth for barrages and spit.
    let shot = null;
    if (SHOTS.has(hz.attack) && hz.kind !== 'mark') {
      shot = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      shot.visible = false;
      airGroup.add(shot);
    }
    // A flash where anything thrown, dropped or fired lands.
    let flash = null;
    if (lob || rock || shot || hz.kind === 'burrow') {
      flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), color: hz.attack === 'rocks' || hz.kind === 'burrow' ? '#c8b89a' : color, blending: hz.attack === 'rocks' || hz.kind === 'burrow' ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flash.visible = false;
      flash.position.copy(toWorld(hz.x, hz.y));
      airGroup.add(flash);
    }
    // The Leviathan's roar rolls out as a wave across the whole room.
    let wave = null;
    if (hz.tone === 'wave') {
      const geo = new THREE.RingGeometry(0.85, 1, 48);
      geo.rotateX(-Math.PI / 2);
      wave = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#7ad8ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      wave.position.copy(toWorld(hz.x, hz.y));
      wave.position.y = 0.3;
      wave.visible = false;
      airGroup.add(wave);
      group.visible = false;
    }

    hazardGroup.add(group);
    const big = Number(hz.r) > 30;
    const entry = {
      group, shape, rim, fill, edge, color: new THREE.Color(color), lob, from, to, flames, arc, rock, shot, flash, wave, big,
      extra: [lob, arc, rock, shot, flash, wave].concat(flames || []).filter(Boolean),
    };
    return entry;
  }

  const white = new THREE.Color('#fff7e0');

  let ctxMouth = null;
  function update(t, ctx) {
    ctxMouth = ctx && ctx.mouth;
    updateSpray(t, ctxMouth);
    updateRubble(t);
    hazards.forEach((hz, i) => {
      const live = t >= hz.t0 && t <= hz.t1 + 0.6;
      let entry = made.get(i);
      if (!live) {
        if (entry) {
          entry.group.visible = false;
          entry.extra.forEach((o) => { o.visible = false; });
        }
        return;
      }
      if (!entry) {
        entry = build(hz, i);
        made.set(i, entry);
      }
      entry.group.visible = !entry.wave && !(entry.big && hz.tone === 'smoke');
      const hot = t >= hz.t1 - 0.16;
      const hit = t >= hz.t1;
      let opacity;
      const c = entry.fill.color.copy(entry.color);
      if (hit) {
        const k = Math.min(1, (t - hz.t1) / 0.55);
        c.lerp(white, 0.6 * (1 - k));
        opacity = 0.75 * (1 - k);
      } else if (hot) {
        opacity = 0.62;
      } else {
        opacity = 0.24 + 0.12 * (0.5 + 0.5 * Math.sin(t * 9));
      }
      entry.fill.opacity = opacity;
      entry.edge.color.copy(c);
      entry.edge.opacity = Math.min(1, opacity + 0.35);
      if (hz.kind === 'cone') entry.shape.rotation.y = -coneHeading(hz, t);

      if (entry.rock) {
        const fallStart = hz.t0 + (hz.t1 - hz.t0) * 0.35;
        const show = t >= fallStart && t < hz.t1 + 0.7;
        entry.rock.visible = show;
        if (show) {
          const u = Math.min(1, (t - fallStart) / Math.max(0.1, hz.t1 - fallStart));
          entry.rock.position.copy(entry.to);
          entry.rock.position.y = t < hz.t1 ? 9 * (1 - u * u) + 0.3 : 0.3 - Math.max(0, t - hz.t1 - 0.3) * 1.2;
          entry.rock.rotation.set(u * 4 + hz.t0, u * 3, 0);
        }
      }
      if (entry.shot) {
        const launch = hz.t1 - 0.45;
        const show = ctxMouth && t >= launch && t < hz.t1;
        entry.shot.visible = !!show;
        if (show) {
          const u = (t - launch) / 0.45;
          entry.shot.position.lerpVectors(ctxMouth, entry.to, u);
          entry.shot.position.y += Math.sin(u * Math.PI) * 0.8 + (1 - u) * 0.2;
          const sc = 0.7 + Math.sin(t * 30) * 0.08;
          entry.shot.scale.set(sc, sc, 1);
        }
      }
      if (entry.flash) {
        const k = (t - hz.t1) / 0.38;
        entry.flash.visible = k >= 0 && k <= 1;
        if (entry.flash.visible) {
          const sc = (0.6 + k * 2.6) * Math.max(1, Number(hz.r) * K * 0.6);
          entry.flash.scale.set(sc, sc, 1);
          entry.flash.position.y = 0.4 + k * 0.4;
          entry.flash.material.opacity = 1 - k;
        }
      }
      if (entry.wave) {
        const k = (t - (hz.t1 - 0.1)) / 1.1;
        entry.wave.visible = k >= 0 && k <= 1;
        if (entry.wave.visible) {
          const sc = 0.5 + k * 16;
          entry.wave.scale.set(sc, 1 + k * 2, sc);
          entry.wave.material.opacity = 0.75 * (1 - k);
        }
      }
      if (entry.arc) {
        const k = (t - (hz.t1 - 0.06)) / 0.36;
        entry.arc.visible = k >= 0 && k <= 1;
        if (entry.arc.visible) {
          const heading = hz.kind === 'cone' ? Number(hz.a) : 0;
          entry.arc.rotation.y = -heading + (hz.kind === 'cone' ? (k - 0.5) * 0.6 : k * 2.6);
          entry.arc.material.opacity = 0.9 * (1 - k);
          entry.arc.scale.setScalar(0.8 + k * 0.3);
        }
      }

      if (entry.lob) {
        const span = Math.max(0.2, hz.t1 - hz.t0);
        const launch = hz.t0 + span * LOB.lead;
        const flying = t >= launch && t < hz.t1;
        entry.lob.visible = flying;
        if (flying) {
          const u = (t - launch) / Math.max(0.1, hz.t1 - launch);
          entry.lob.position.lerpVectors(entry.from, entry.to, u);
          entry.lob.position.y = 1.4 * (1 - u) + Math.sin(u * Math.PI) * LOB.arc + 0.2;
          entry.lob.rotation.set(u * 9, u * 7, 0);
        }
      }

      if (entry.flames) {
        const start = hz.t1 - 0.12;
        const life = 0.7;
        entry.flames.forEach((sprite, n) => {
          const d = sprite.userData;
          const age = t - start - d.c * 0.25;
          if (age < 0 || age > life) {
            sprite.visible = false;
            return;
          }
          sprite.visible = true;
          const k = age / life;
          if (hz.kind === 'lane') {
            const along = Math.min(1, d.a * 0.9 + age * 1.6);
            const a = toWorld(hz.x1, hz.y1);
            const b = toWorld(hz.x2, hz.y2);
            sprite.position.lerpVectors(a, b, along);
            const side = (d.b - 0.5) * Number(hz.w) * K * 0.7;
            const nx = -(b.z - a.z);
            const nz = b.x - a.x;
            const nl = Math.hypot(nx, nz) || 1;
            sprite.position.x += (nx / nl) * side;
            sprite.position.z += (nz / nl) * side;
          } else {
            const ang = d.a * Math.PI * 2;
            const rad = Math.sqrt(d.b) * Number(hz.r) * K * 0.85;
            sprite.position.copy(entry.to);
            sprite.position.x += Math.cos(ang) * rad;
            sprite.position.z += Math.sin(ang) * rad;
          }
          sprite.position.y = 0.25 + k * 1.3;
          const s = (0.9 - k * 0.6) * (0.7 + d.c * 0.6);
          sprite.scale.set(s, s * 1.3, 1);
          sprite.material.opacity = 1;
        });
      }
    });
  }

  // Arrows and spells. A pool of meshes, re-aimed every frame.
  const projectilePool = [];
  const arrowMat = new THREE.MeshLambertMaterial({ color: '#c4a56a', flatShading: true });
  const tipMat = new THREE.MeshLambertMaterial({ color: '#9aa3ad', flatShading: true });
  function makeProjectile() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.55), arrowMat);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), tipMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.31;
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.1), new THREE.MeshLambertMaterial({ color: '#e8e0d0' }));
    fletch.position.z = -0.24;
    const arrow = new THREE.Group();
    arrow.add(shaft, tip, fletch);
    const orbMat = new THREE.MeshBasicMaterial({ color: '#a78bfa' });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), orbMat);
    const haloMat = new THREE.SpriteMaterial({ map: flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: '#a78bfa' });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(0.9, 0.9, 1);
    orb.add(halo);
    g.add(arrow, orb);
    g.userData = { arrow, orb, orbMat, haloMat };
    g.visible = false;
    airGroup.add(g);
    return g;
  }

  const look = new THREE.Vector3();
  // shots: [{ kind: 'arrow'|'orb', from: Vector3, to: Vector3, u: 0..1, color }]
  function drawProjectiles(shots) {
    while (projectilePool.length < shots.length) projectilePool.push(makeProjectile());
    projectilePool.forEach((p, i) => {
      const shot = shots[i];
      if (!shot) {
        p.visible = false;
        return;
      }
      p.visible = true;
      const u = shot.u;
      p.position.lerpVectors(shot.from, shot.to, u);
      const arc = shot.kind === 'orb' ? 0.25 : shot.kind === 'javelin' ? 0.9 : 0.5;
      p.position.y += Math.sin(u * Math.PI) * arc;
      const u2 = Math.min(1, u + 0.05);
      look.lerpVectors(shot.from, shot.to, u2);
      look.y += Math.sin(u2 * Math.PI) * arc;
      p.lookAt(look);
      p.userData.arrow.visible = shot.kind !== 'orb';
      p.userData.arrow.scale.set(1, 1, { bolt: 0.6, dart: 0.45, javelin: 1.7 }[shot.kind] || 1);
      p.userData.orb.visible = shot.kind === 'orb';
      if (shot.kind === 'orb') {
        p.userData.orbMat.color.set(shot.color || '#a78bfa');
        p.userData.haloMat.color.set(shot.color || '#a78bfa');
        const s = 0.8 + Math.sin(u * 20) * 0.12;
        p.userData.orb.scale.setScalar(s);
      }
    });
  }

  // Breath and spray: a shared pool of sprites handed out every frame. Fire is additive, dirt is not.
  const firePool = [];
  const dirtPool = [];
  function poolSprite(list, i, additive) {
    while (list.length <= i) {
      const m = new THREE.SpriteMaterial({
        map: flameTex(), transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const sp = new THREE.Sprite(m);
      sp.visible = false;
      airGroup.add(sp);
      list.push(sp);
    }
    const sp = list[i];
    sp.visible = true;
    return sp;
  }
  const FIRE_RAMP = [new THREE.Color('#fff6c0'), new THREE.Color('#ffb040'), new THREE.Color('#ff5a14'), new THREE.Color('#7a1e0a')];
  const dest = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();

  const RAMPS = {
    fire: FIRE_RAMP,
    ice: ['#ffffff', '#c8f0ff', '#5ac0f0', '#1a4a8a'].map((c) => new THREE.Color(c)),
    poison: ['#f0ffc0', '#a8f060', '#3aa03a', '#1a4a1a'].map((c) => new THREE.Color(c)),
  };
  function fireColor(out, u, ramp) {
    const r = ramp || FIRE_RAMP;
    const x = Math.min(0.999, u) * (r.length - 1);
    const i = Math.floor(x);
    return out.copy(r[i]).lerp(r[i + 1], x - i);
  }

  function sprayDest(hz, s2, s3, out) {
    if (hz.kind === 'lane') {
      toWorld(hz.x1, hz.y1, pa);
      toWorld(hz.x2, hz.y2, pb);
      out.lerpVectors(pa, pb, 0.25 + s3 * 0.8);
      const nx = -(pb.z - pa.z);
      const nz = pb.x - pa.x;
      const nl = Math.hypot(nx, nz) || 1;
      const side = (s2 - 0.5) * Number(hz.w) * K * (0.4 + s3 * 0.6);
      out.x += (nx / nl) * side;
      out.z += (nz / nl) * side;
    } else if (hz.kind === 'cone') {
      const a = Number(hz.a) + (s2 - 0.5) * 2 * Number(hz.arc);
      const d = Number(hz.r) * (0.3 + 0.7 * s3);
      toWorld(Number(hz.x) + Math.cos(a) * d, Number(hz.y) + Math.sin(a) * d, out);
    } else {
      const a = s2 * Math.PI * 2;
      const d = Math.sqrt(s3) * Number(hz.r) * 0.8;
      toWorld(Number(hz.x) + Math.cos(a) * d, Number(hz.y) + Math.sin(a) * d, out);
    }
    return out;
  }

  function updateSpray(t, mouth) {
    let fi = 0;
    let di = 0;
    if (mouth) {
      hazards.forEach((hz, i) => {
        const breath = BREATH[hz.attack];
        if (!breath || SHOTS.has(hz.attack)) return;
        const fire = breath !== 'dirt';
        const dirt = !fire;
        const ramp = RAMPS[breath] || RAMPS.fire;
        const span = Math.max(0.3, hz.t1 - hz.t0);
        const e0 = hz.t1 - (fire ? 0.4 : 0.3);
        const e1 = hz.t1 + (fire ? 0.14 : 0.02);
        // The breath gathers in the mouth before it comes out.
        if (fire && t >= hz.t0 + span * 0.2 && t < e0 + 0.1) {
          const k = (t - (hz.t0 + span * 0.2)) / Math.max(0.1, e0 + 0.1 - (hz.t0 + span * 0.2));
          const ember = poolSprite(firePool, fi++, true);
          ember.position.copy(mouth);
          const s = 0.4 + k * 1.3 + Math.sin(t * 40) * 0.1;
          ember.scale.set(s, s, 1);
          fireColor(ember.material.color, 0.15 + (1 - k) * 0.3, ramp);
          ember.material.opacity = 0.5 + k * 0.5;
          for (let n = 0; n < 6; n++) {
            const spark = poolSprite(firePool, fi++, true);
            const a = n * 1.7 + t * 6;
            const rr = (1 - ((t * 2.5 + n / 6) % 1)) * 0.7;
            spark.position.set(mouth.x + Math.cos(a) * rr, mouth.y + Math.sin(a * 1.3) * rr * 0.6, mouth.z + Math.sin(a) * rr);
            spark.scale.set(0.12, 0.12, 1);
            fireColor(spark.material.color, 0.1, ramp);
            spark.material.opacity = k;
          }
        }
        if (t < e0 || t > e1 + 0.65) return;
        const rand = seeded(i * 31 + 7);
        const count = fire ? (hz.kind === 'lane' ? 140 : 70) : 40;
        for (let n = 0; n < count; n++) {
          const s1 = rand();
          const s2 = rand();
          const s3 = rand();
          const s4 = rand();
          const birth = e0 + s1 * (e1 - e0);
          const life = (fire ? 0.36 : 0.5) + s4 * 0.2;
          const age = t - birth;
          if (age < 0 || age > life) continue;
          const u = age / life;
          const fly = 1 - Math.pow(1 - Math.min(1, u * 1.25), 2);
          sprayDest(hz, s2, s3, dest);
          const sp = fire ? poolSprite(firePool, fi++, true) : poolSprite(dirtPool, di++, false);
          sp.position.lerpVectors(mouth, dest, fly);
          if (fire) {
            sp.position.y = mouth.y + (0.35 - mouth.y) * fly + Math.sin(fly * Math.PI) * 0.35 + Math.max(0, u - 0.6) * 1.4;
            const s = (0.45 + u * 1.6) * (0.7 + s4 * 0.6);
            sp.scale.set(s, s, 1);
            fireColor(sp.material.color, u, ramp);
            sp.material.opacity = Math.pow(1 - u, 0.7);
          } else {
            sp.position.y = mouth.y + (0.1 - mouth.y) * fly + Math.sin(fly * Math.PI) * 1.1;
            const s = 0.16 + s4 * 0.16;
            sp.scale.set(s, s, 1);
            sp.material.color.set(s4 < 0.5 ? '#6b4a2a' : '#8a6a3a');
            sp.material.opacity = 1 - Math.max(0, u - 0.7) / 0.3;
          }
        }
      });
    }
    hazards.forEach((hz, i) => {
      if (hz.tone !== 'smoke') return;
      const rand = seeded(i * 17 + 3);
      for (let n = 0; n < 36; n++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * 11;
        const birth = hz.t1 - 0.1 + rand() * 0.3;
        const life = 1.2 + rand() * 0.6;
        const age = t - birth;
        if (age < 0 || age > life) continue;
        const u = age / life;
        const sp = poolSprite(dirtPool, di++, false);
        sp.position.set(Math.cos(a) * d, 0.4 + u * 1.6, Math.sin(a) * d);
        const sc = 1.6 + u * 2.4;
        sp.scale.set(sc, sc, 1);
        sp.material.color.set('#55555c');
        sp.material.opacity = 0.75 * Math.sin(Math.min(1, u * 1.4) * Math.PI);
      }
    });
    for (let i = fi; i < firePool.length; i++) firePool[i].visible = false;
    for (let i = di; i < dirtPool.length; i++) dirtPool[i].visible = false;
  }

  // Labels for warnings, in world space, for the overlay to place.
  function labels(t) {
    const out = [];
    hazards.forEach((hz, i) => {
      if (!hz.label || hz.attack === 'rocks') return;
      if (t < hz.t0 || t > hz.t1 + 0.3) return;
      let p;
      if (hz.kind === 'lane') p = toWorld((Number(hz.x1) + Number(hz.x2)) / 2, (Number(hz.y1) + Number(hz.y2)) / 2);
      else if (hz.kind === 'cone') {
        const a = coneHeading(hz, t);
        p = toWorld(Number(hz.x) + Math.cos(a) * hz.r * 0.62, Number(hz.y) + Math.sin(a) * hz.r * 0.62);
      } else p = toWorld(hz.x, hz.y);
      p.y = 0.15;
      const word = String(hz.label);
      out.push({ key: i, text: word.charAt(0) + word.slice(1).toLowerCase(), pos: p, hot: t >= hz.t1 - 0.16 });
    });
    return out;
  }

  return { setHazards, setRubble, update, drawProjectiles, labels, clear };
}
