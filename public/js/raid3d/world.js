// The stage: a themed floor for each boss, props, sky and light, ambient particles, and the camera rig.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Arena units (100 x 72, origin top-left) to world units (origin at the arena centre).
export const K = 0.25;
export const ARENA_W = 100;
export const ARENA_H = 72;

export function toWorld(x, y, out) {
  return (out || new THREE.Vector3()).set((x - ARENA_W / 2) * K, 0, (y - ARENA_H / 2) * K);
}

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

function noise2(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = noise2(xi, yi);
  const b = noise2(xi + 1, yi);
  const c = noise2(xi, yi + 1);
  const d = noise2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const FIELD = 96;
const HALF_W = (ARENA_W / 2) * K;
const HALF_H = (ARENA_H / 2) * K;

// How far a point is outside the fight area (0 inside).
function outside(x, z, pad) {
  const dx = Math.max(0, Math.abs(x) - HALF_W - (pad || 0));
  const dz = Math.max(0, Math.abs(z) - HALF_H - (pad || 0));
  return Math.hypot(dx, dz);
}

// ---- Themes ----
// shape: hills (open field), bowl (cave walls, lower toward the camera so it reads as a cave mouth),
// island (land falls away into liquid), sewer (flat floor, channels down both sides, brick walls).
const THEMES = {
  grass: {
    shape: 'hills', floor: ['#53802e', '#578530', '#4f7b2c', '#5b8832'], worn: '#7a7a3e', wall: ['#4f7b2c'],
    sky: '#8fbbe0', fog: ['#a7c9e4', 34, 78], hemi: ['#e4f0ff', '#4a6a2c', 1.25], sun: ['#fff1d6', 1.9],
    props: ['trees', 'rocks', 'tufts'],
  },
  pasture: {
    shape: 'hills', floor: ['#5f8a34', '#638e36', '#5a8532', '#689338'], worn: '#8a7a44', wall: ['#5a8532'],
    sky: '#9cc8ef', fog: ['#b5d3ea', 36, 82], hemi: ['#f0f6ff', '#5a7a32', 1.3], sun: ['#fff4dc', 2.0],
    props: ['fence', 'hay', 'barn', 'trees', 'tufts'],
  },
  lair: {
    shape: 'bowl', floor: ['#5a4430', '#604a34', '#54402c', '#664e36'], worn: '#7a6040', wall: ['#4a3a2c', '#3e3024', '#56442f'],
    sky: '#120d08', fog: ['#1a120a', 16, 44], hemi: ['#c8a880', '#2a1a0c', 0.55], sun: ['#ffd8a8', 0.9],
    props: ['stalagmites', 'molehills', 'torches', 'cave-rocks'], particles: 'dust',
  },
  sewer: {
    shape: 'sewer', floor: ['#5a5e52', '#545848', '#60645a', '#4e5246'], worn: '#6a6a5a', wall: ['#5a4a3e', '#4e4036', '#64544a'],
    liquid: { color: '#4a6a2a', emissive: '#2a4a10', y: -0.35, opacity: 0.88 },
    sky: '#0e120a', fog: ['#1a2210', 16, 46], hemi: ['#b8c8a0', '#1a2210', 0.6], sun: ['#e8f0c8', 0.8],
    props: ['pipes', 'grates', 'torches', 'barrels'], particles: 'drips',
  },
  crandor: {
    shape: 'island', floor: ['#3a3430', '#423a34', '#36302c', '#4a4038'], worn: '#5a4a3e', wall: ['#2a2420'],
    liquid: { color: '#ff5a10', emissive: '#ff4a00', y: -0.6, lava: true },
    sky: '#4a2418', fog: ['#5a2a1a', 24, 62], hemi: ['#ffb08a', '#3a1a10', 0.85], sun: ['#ffc890', 1.4],
    props: ['dead-trees', 'lava-cracks', 'rocks'], particles: 'embers',
  },
  wild: {
    shape: 'hills', floor: ['#4a4638', '#4e4a3a', '#444032', '#524c3c'], worn: '#5a5444', wall: ['#3e3a2e'],
    sky: '#4a4058', fog: ['#4e4458', 26, 66], hemi: ['#c8b8e0', '#2a2620', 0.85], sun: ['#e8d8f0', 1.1],
    props: ['dead-trees', 'bones', 'graves', 'ruins', 'rocks'], particles: 'wisps',
  },
  pool: {
    shape: 'island', floor: ['#3a4a52', '#36444c', '#405058', '#323e46'], worn: '#4a5a62', wall: ['#2a363e'],
    liquid: { color: '#0e4a5a', emissive: '#03222a', y: -0.45, opacity: 0.9, water: true },
    sky: '#03121a', fog: ['#062430', 18, 52], hemi: ['#8ad0e8', '#021018', 0.7], sun: ['#bfe8ff', 1.0],
    props: ['pillars', 'coral'], particles: 'bubbles',
  },
  hillcave: {
    shape: 'bowl', floor: ['#6a5a46', '#70604a', '#645440', '#76664e'], worn: '#8a765a', wall: ['#5a4c3c', '#4e4234', '#66574a'],
    sky: '#16120c', fog: ['#221a10', 18, 48], hemi: ['#e0c8a0', '#2a1e10', 0.65], sun: ['#ffe0b0', 1.0],
    props: ['supports', 'cave-rocks', 'torches', 'bones'], particles: 'dust',
  },
  mossy: {
    shape: 'bowl', floor: ['#4a5442', '#4e5a44', '#46503e', '#3e5a34'], worn: '#5a6a4a', wall: ['#3a4a32', '#34422c', '#425238'],
    sky: '#0a120a', fog: ['#122012', 16, 46], hemi: ['#b8e0a0', '#102010', 0.6], sun: ['#d8f0c0', 0.85],
    props: ['moss', 'mushrooms', 'stalagmites', 'torches'], particles: 'spores',
  },
  kbdlair: {
    shape: 'bowl', floor: ['#2a2422', '#302826', '#262020', '#342a26'], worn: '#3e3230', wall: ['#1e1818', '#2a1e1a', '#241c1a'],
    liquid: { color: '#ff4a10', emissive: '#ff3a00', y: -0.5, lava: true, pools: true },
    sky: '#120606', fog: ['#2a0a06', 16, 46], hemi: ['#ff9a7a', '#200606', 0.7], sun: ['#ffb080', 1.0],
    props: ['stalagmites', 'bones', 'lava-cracks'], particles: 'embers',
  },
  ungael: {
    shape: 'island', floor: ['#dfe8ee', '#d6e0e8', '#e8eef2', '#ccd8e2'], worn: '#b8c8d4', wall: ['#a8b8c8'],
    liquid: { color: '#2a5a7a', emissive: '#061a2a', y: -0.5, opacity: 0.92, water: true },
    sky: '#b8c8d8', fog: ['#c8d6e2', 26, 70], hemi: ['#ffffff', '#6a7a8a', 1.15], sun: ['#f4f8ff', 1.6],
    props: ['ice', 'snow-rocks'], particles: 'snow',
  },
  kqlair: {
    shape: 'bowl', floor: ['#b89a5a', '#c0a262', '#b09254', '#c8aa6a'], worn: '#d0b478', wall: ['#8a6e3e', '#7e6436', '#967a46'],
    sky: '#1a1206', fog: ['#3a2a10', 18, 50], hemi: ['#ffe0a0', '#3a2a10', 0.75], sun: ['#ffe8b8', 1.1],
    props: ['eggs', 'hive', 'cave-rocks', 'torches'], particles: 'dust',
  },
  // The spoop-vs-spoop pit: packed sand, a wooden lip, corner posts, and stands around it.
  pit: {
    shape: 'pit', floor: ['#e4c98a', '#d7b56e', '#c9a45a', '#edd6a0'], worn: '#b48a42', wall: ['#3a322c', '#2e2824', '#463c34'],
    sky: '#c9b59a', fog: ['#d2c2aa', 28, 72], hemi: ['#fff4e0', '#6a5030', 1.2], sun: ['#ffe6b8', 1.85],
    props: ['pit'], particles: 'dust',
  },
};

// Which room each boss fights in.
export const BOSS_SCENE = {
  brutus: 'pasture', cow: 'pasture', mole: 'lair', scurrius: 'sewer', rat: 'sewer', elvarg: 'crandor',
  chaos: 'wild', spider: 'wild', leviathan: 'pool', obor: 'hillcave', bryophyta: 'mossy', kbd: 'kbdlair',
  vorkath: 'ungael', kq: 'kqlair', sarachnis: 'mossy', dusk: 'hillcave', dawn: 'hillcave', skotizo: 'wild',
};

function heightFor(theme, x, z) {
  const shape = theme.shape;
  const n = smoothNoise(x * 0.12, z * 0.12);
  if (shape === 'hills') {
    const out = Math.min(1, outside(x, z, 1.5) / 8);
    return out * (n * 2.6 + smoothNoise(x * 0.4, z * 0.4) * 0.4);
  }
  if (shape === 'bowl' || shape === 'sewer') {
    const d = outside(x, z, shape === 'sewer' ? 3.5 : 2.5);
    const front = z > HALF_H ? 0.35 : 1;
    const rise = Math.min(1, d / 4);
    const wall = rise * rise * (7 + n * 4) * front;
    if (theme.liquid && theme.liquid.pools && d > 0.4 && d < 3 && smoothNoise(x * 0.3, z * 0.3) > 0.5) return -0.9;
    if (shape === 'sewer') {
      const ch = Math.abs(x) - HALF_W - 1.4;
      if (ch > 0 && ch < 1.8 && Math.abs(z) < HALF_H + 3) return -0.7;
    }
    return wall + smoothNoise(x * 0.6, z * 0.6) * 0.15 * Math.min(1, d);
  }
  if (shape === 'island') {
    const d = outside(x, z, 2.5);
    if (d <= 0) return smoothNoise(x * 0.5, z * 0.5) * 0.08;
    return -Math.min(1.6, d * 0.35) + (n - 0.5) * 0.6 * Math.min(1, d / 3);
  }
  if (shape === 'pit') {
    const d = outside(x, z, 0.15);
    if (d <= 0) return smoothNoise(x * 0.9, z * 0.9) * 0.04;
    if (d < 0.85) return 0.32;
    return Math.min(2.6, 0.4 + (d - 0.85) * 0.7);
  }
  return 0;
}

function buildGround(theme) {
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, FIELD, FIELD).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightFor(theme, pos.getX(i), pos.getZ(i)));
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const floor = theme.floor.map((h) => new THREE.Color(h));
  const wall = theme.wall.map((h) => new THREE.Color(h));
  const worn = new THREE.Color(theme.worn);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const tx = Math.floor(cx);
    const tz = Math.floor(cz);
    const pick = Math.floor(noise2(tx, tz) * 4) % 4;
    const walled = ((theme.shape === 'bowl' || theme.shape === 'sewer') && cy > 0.6) || (theme.shape === 'pit' && cy > 0.2);
    c.copy(walled ? wall[pick % wall.length] : floor[pick % floor.length]);
    c.offsetHSL(0, 0, (smoothNoise(tx * 0.18, tz * 0.18) - 0.5) * 0.08);
    if (theme.shape === 'pit' && cy > 0.12 && cy < 0.5) c.set(noise2(tz, tx) > 0.5 ? '#6e5840' : '#8d6d48');
    if (theme.shape === 'island' && cy < -0.15) c.lerp(new THREE.Color(theme.wall[0]), 0.6);
    const inner = Math.hypot(cx / (HALF_W + 1), cz / (HALF_H + 1));
    if (inner < 1 && !walled) c.lerp(worn, Math.max(0, 0.42 - inner * 0.42) * (0.6 + noise2(tz, tx) * 0.4));
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true;
  return ground;
}

// ---- Props ----

const matCache = new Map();
function lambert(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, opts || {})));
  return matCache.get(key);
}

function piece(geo, color, x, y, z, opts) {
  const m = new THREE.Mesh(geo, lambert(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

let flameTexture = null;
function flameTex() {
  if (flameTexture) return flameTexture;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  flameTexture = new THREE.CanvasTexture(c);
  flameTexture.colorSpace = THREE.SRGBColorSpace;
  return flameTexture;
}

function placeOutside(r, theme, min, max, pad, fn, tries) {
  let made = 0;
  for (let i = 0; i < (tries || 400) && made < max; i++) {
    const x = (r() - 0.5) * 62;
    const z = (r() - 0.5) * 52;
    const d = outside(x, z, 0);
    if (d < pad || d > (theme.shape === 'bowl' || theme.shape === 'sewer' ? pad + 6 : 99)) continue;
    const y = heightFor(theme, x, z);
    if (theme.shape === 'island' && y < -0.2) continue;
    if (fn(x, y, z)) made += 1;
  }
  return made >= min;
}

function buildProps(theme, group, lights, r) {
  const add = (o) => { group.add(o); return true; };
  const props = theme.props || [];
  let torchCount = 0;

  function torch(x, y, z) {
    if (torchCount >= 4) return false;
    torchCount += 1;
    add(piece(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 5), '#4a3420', x, y + 0.8, z));
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), color: '#ffb050', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.position.set(x, y + 1.75, z);
    flame.scale.set(0.8, 1.1, 1);
    group.add(flame);
    const light = new THREE.PointLight('#ffb060', 14, 13, 1.6);
    light.position.set(x, y + 1.9, z);
    group.add(light);
    lights.push({ light, flame, base: 14, seed: r() * 10 });
    return true;
  }

  props.forEach((kind) => {
    if (kind === 'trees') {
      placeOutside(r, theme, 0, 46, 3, (x, y, z) => {
        const h = 1.6 + r() * 1.2;
        add(piece(new THREE.CylinderGeometry(0.18, 0.26, h, 6), '#5b3a1f', x, y + h / 2, z));
        const greens = ['#2f5e1f', '#3a6d24', '#2a5419'];
        for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
          const leaf = piece(new THREE.IcosahedronGeometry(1 + r() * 0.5, 0), greens[i % 3], x + (r() - 0.5) * 0.9, y + h + 0.4 + i * 0.55, z + (r() - 0.5) * 0.9);
          leaf.rotation.set(r() * 3, r() * 3, r() * 3);
          add(leaf);
        }
        return true;
      });
    }
    if (kind === 'dead-trees') {
      placeOutside(r, theme, 0, 22, 2.5, (x, y, z) => {
        const h = 2 + r() * 1.6;
        const col = theme.sky === '#4a2418' ? '#2a2018' : '#3a3026';
        add(piece(new THREE.CylinderGeometry(0.1, 0.22, h, 5), col, x, y + h / 2, z));
        for (let i = 0; i < 3; i++) {
          const br = piece(new THREE.CylinderGeometry(0.04, 0.08, 1 + r(), 4), col, x, y + h * (0.55 + i * 0.15), z);
          br.rotation.z = (r() - 0.5) * 2.2;
          br.rotation.y = r() * 6;
          br.position.x += Math.sin(br.rotation.z) * -0.4;
          add(br);
        }
        return true;
      });
    }
    if (kind === 'rocks' || kind === 'cave-rocks' || kind === 'snow-rocks') {
      const col = kind === 'snow-rocks' ? '#9aa8b4' : kind === 'cave-rocks' ? theme.wall[0] : '#6c6962';
      placeOutside(r, theme, 0, kind === 'cave-rocks' ? 30 : 22, 1, (x, y, z) => {
        const s = 0.35 + r() * (kind === 'cave-rocks' ? 1.1 : 0.6);
        const m = piece(new THREE.DodecahedronGeometry(s, 0), col, x, y + s * 0.35, z);
        m.rotation.set(r() * 3, r() * 3, r() * 3);
        m.scale.y = 0.65;
        add(m);
        if (kind === 'snow-rocks') add(piece(new THREE.DodecahedronGeometry(s * 0.7, 0), '#f4f8fc', x, y + s * 0.6, z));
        return true;
      });
    }
    if (kind === 'tufts') {
      for (let i = 0; i < 220; i++) {
        const x = (r() - 0.5) * 40;
        const z = (r() - 0.5) * 32;
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3 + r() * 0.2, 4), lambert(r() < 0.5 ? '#3f6e22' : '#6a9a3a'));
        tuft.position.set(x, heightFor(theme, x, z) + 0.12, z);
        add(tuft);
      }
    }
    if (kind === 'pit') {
      const wood = '#6e5840';
      const beam = '#8d6d48';
      [[-HALF_W, -HALF_H], [HALF_W, -HALF_H], [-HALF_W, HALF_H], [HALF_W, HALF_H]].forEach(([x, z]) => {
        add(piece(new THREE.BoxGeometry(0.38, 1.7, 0.38), wood, x, 0.85, z));
        add(piece(new THREE.BoxGeometry(0.5, 0.16, 0.5), beam, x, 1.72, z));
      });
      add(piece(new THREE.BoxGeometry(HALF_W * 2, 0.28, 0.22), wood, 0, 0.42, -HALF_H));
      add(piece(new THREE.BoxGeometry(HALF_W * 2, 0.22, 0.22), wood, 0, 0.28, HALF_H));
      [-HALF_W, HALF_W].forEach((x) => add(piece(new THREE.BoxGeometry(0.22, 0.28, HALF_H * 2), wood, x, 0.42, 0)));
      // Stands on the far side and both flanks. The near side stays a low rail so the camera can see in.
      for (let i = -4; i <= 4; i++) {
        const x = i * 2.3;
        add(piece(new THREE.BoxGeometry(2.1, 1.15, 1.3), '#3a322c', x, 0.7, -HALF_H - 2.1));
        add(piece(new THREE.BoxGeometry(2.1, 1.7, 1.1), '#2e2824', x, 0.95, -HALF_H - 3.3));
      }
      for (let i = -2; i <= 2; i++) {
        const z = i * 2.4;
        [-1, 1].forEach((side) => add(piece(new THREE.BoxGeometry(1.2, 1.2, 2.2), '#3a322c', side * (HALF_W + 2.1), 0.72, z)));
      }
    }
    if (kind === 'fence') {
      const w = HALF_W + 2.5;
      const h = HALF_H + 2.5;
      for (let x = -w; x <= w + 0.01; x += 1.8) {
        [-h, h].forEach((z) => add(piece(new THREE.BoxGeometry(0.14, 1.0, 0.14), '#7a5a34', x, 0.5, z)));
      }
      for (let z = -h; z <= h + 0.01; z += 1.8) {
        [-w, w].forEach((x) => add(piece(new THREE.BoxGeometry(0.14, 1.0, 0.14), '#7a5a34', x, 0.5, z)));
      }
      [0.4, 0.8].forEach((y) => {
        [-h, h].forEach((z) => add(piece(new THREE.BoxGeometry(w * 2, 0.08, 0.06), '#8a6a40', 0, y, z)));
        [-w, w].forEach((x) => add(piece(new THREE.BoxGeometry(0.06, 0.08, h * 2), '#8a6a40', x, y, 0)));
      });
    }
    if (kind === 'hay') {
      placeOutside(r, theme, 0, 10, 3.5, (x, y, z) => {
        const bale = piece(new THREE.CylinderGeometry(0.6, 0.6, 1.0, 8), '#d8b850', x, y + 0.6, z);
        bale.rotation.z = Math.PI / 2;
        bale.rotation.y = r() * 3;
        return add(bale);
      });
    }
    if (kind === 'barn') {
      const bx = -HALF_W - 9;
      const bz = -HALF_H - 6;
      add(piece(new THREE.BoxGeometry(6, 3.2, 4.5), '#8a2a20', bx, 1.6, bz));
      const roof = piece(new THREE.ConeGeometry(4.3, 2, 4), '#4a2a20', bx, 4.2, bz);
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.75;
      add(roof);
      add(piece(new THREE.BoxGeometry(1.8, 2.2, 0.1), '#e8e0d0', bx, 1.1, bz + 2.27));
    }
    if (kind === 'stalagmites') {
      placeOutside(r, theme, 0, 26, 1.5, (x, y, z) => {
        const h = 1 + r() * 2.6;
        return add(piece(new THREE.ConeGeometry(0.3 + r() * 0.35, h, 5), theme.wall[Math.floor(r() * theme.wall.length)], x, y + h / 2, z));
      });
    }
    if (kind === 'molehills') {
      for (let i = 0; i < 9; i++) {
        const x = (r() - 0.5) * HALF_W * 2.2;
        const z = (r() - 0.5) * HALF_H * 2.2;
        const m = piece(new THREE.SphereGeometry(0.6 + r() * 0.4, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), '#4a3622', x, 0, z);
        m.scale.y = 0.45;
        add(m);
      }
    }
    if (kind === 'torches') {
      [[-HALF_W - 2.2, -HALF_H - 1.2], [HALF_W + 2.2, -HALF_H - 1.2], [-HALF_W - 2.2, HALF_H * 0.2], [HALF_W + 2.2, HALF_H * 0.2]]
        .forEach(([x, z]) => torch(x, heightFor(theme, x, z), z));
    }
    if (kind === 'pipes') {
      [-1, 1].forEach((side) => {
        for (let i = 0; i < 3; i++) {
          const z = -HALF_H + i * HALF_H;
          const pipe = piece(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 8), '#5a5248', side * (HALF_W + 5), 1.4, z);
          pipe.rotation.z = Math.PI / 2;
          add(pipe);
          add(piece(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 8), '#1a1a14', side * (HALF_W + 3.7), 1.4, z)).rotation;
        }
      });
    }
    if (kind === 'grates') {
      for (let i = 0; i < 4; i++) {
        const g = piece(new THREE.BoxGeometry(1.2, 0.05, 1.2), '#2a2a24', (r() - 0.5) * HALF_W * 1.6, 0.02, (r() - 0.5) * HALF_H * 1.6);
        add(g);
      }
    }
    if (kind === 'barrels') {
      placeOutside(r, theme, 0, 6, 1, (x, y, z) => add(piece(new THREE.CylinderGeometry(0.4, 0.45, 0.9, 8), '#6a4a2a', x, y + 0.45, z)));
    }
    if (kind === 'lava-cracks') {
      for (let i = 0; i < 26; i++) {
        const x = (r() - 0.5) * 50;
        const z = (r() - 0.5) * 40;
        if (outside(x, z, 0) < 0.5 && r() < 0.7) continue;
        const y = heightFor(theme, x, z);
        if (y < -0.3) continue;
        const crack = piece(new THREE.BoxGeometry(0.15, 0.04, 1.2 + r() * 2), '#ff6a1a', x, y + 0.03, z, { emissive: '#ff4a00', emissiveIntensity: 1.2 });
        crack.rotation.y = r() * 3;
        crack.castShadow = false;
        add(crack);
      }
    }
    if (kind === 'bones') {
      placeOutside(r, theme, 0, 14, 0.5, (x, y, z) => {
        const bone = piece(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 4), '#e8e0c8', x, y + 0.06, z);
        bone.rotation.set(Math.PI / 2, r() * 3, 0);
        add(bone);
        if (r() < 0.4) add(piece(new THREE.BoxGeometry(0.28, 0.24, 0.3), '#e8e0c8', x + 0.3, y + 0.12, z + 0.2));
        return true;
      });
    }
    if (kind === 'graves') {
      placeOutside(r, theme, 0, 10, 2, (x, y, z) => {
        const g = piece(new THREE.BoxGeometry(0.7, 1, 0.18), '#6a6a6a', x, y + 0.5, z);
        g.rotation.z = (r() - 0.5) * 0.3;
        return add(g);
      });
    }
    if (kind === 'ruins' || kind === 'pillars' || kind === 'hive') {
      const col = kind === 'hive' ? '#8a6e3e' : kind === 'pillars' ? '#3a4a52' : '#7a7466';
      placeOutside(r, theme, 0, kind === 'pillars' ? 10 : 8, 2.5, (x, y, z) => {
        const h = kind === 'hive' ? 3 + r() * 3 : 1.5 + r() * 3;
        const p = kind === 'hive'
          ? piece(new THREE.ConeGeometry(0.9 + r() * 0.6, h, 6), col, x, y + h / 2, z)
          : piece(new THREE.CylinderGeometry(0.45, 0.5, h, 6), col, x, y + h / 2, z);
        add(p);
        if (kind === 'ruins' && r() < 0.5) add(piece(new THREE.BoxGeometry(1.2, 0.3, 1.2), col, x, y + h + 0.15, z));
        return true;
      });
    }
    if (kind === 'coral') {
      placeOutside(r, theme, 0, 10, 1, (x, y, z) => {
        const h = 0.6 + r() * 0.8;
        return add(piece(new THREE.ConeGeometry(0.2, h, 4), r() < 0.5 ? '#2a8a8a' : '#4aa0a0', x, y + h / 2, z, { emissive: '#0a3a3a' }));
      });
    }
    if (kind === 'supports') {
      [-1, 1].forEach((side) => {
        for (let i = -1; i <= 1; i++) {
          const x = side * (HALF_W + 2.6);
          const z = i * HALF_H * 0.8;
          const y = heightFor(theme, x, z);
          add(piece(new THREE.BoxGeometry(0.3, 3.2, 0.3), '#5a4028', x, y + 1.6, z));
          add(piece(new THREE.BoxGeometry(0.3, 0.3, 2.6), '#5a4028', x, y + 3.2, z));
        }
      });
    }
    if (kind === 'moss') {
      for (let i = 0; i < 30; i++) {
        const x = (r() - 0.5) * HALF_W * 2.8;
        const z = (r() - 0.5) * HALF_H * 2.8;
        const m = piece(new THREE.CylinderGeometry(0.5 + r() * 0.8, 0.6 + r() * 0.8, 0.06, 7), '#3e6a2a', x, heightFor(theme, x, z) + 0.03, z);
        m.castShadow = false;
        add(m);
      }
    }
    if (kind === 'mushrooms') {
      placeOutside(r, theme, 0, 16, 0.5, (x, y, z) => {
        const h = 0.3 + r() * 0.5;
        add(piece(new THREE.CylinderGeometry(0.05, 0.07, h, 5), '#d8d0b8', x, y + h / 2, z));
        add(piece(new THREE.SphereGeometry(0.2 + r() * 0.15, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), '#7adf8a', x, y + h, z, { emissive: '#2a8a3a', emissiveIntensity: 0.8 }));
        return true;
      });
    }
    if (kind === 'ice') {
      placeOutside(r, theme, 0, 22, 1.5, (x, y, z) => {
        const h = 1 + r() * 2.4;
        const m = piece(new THREE.ConeGeometry(0.3 + r() * 0.3, h, 5), '#bfe8f8', x, y + h / 2, z, { transparent: true, opacity: 0.85, emissive: '#2a6a8a', emissiveIntensity: 0.3 });
        m.rotation.z = (r() - 0.5) * 0.4;
        return add(m);
      });
    }
    if (kind === 'eggs') {
      placeOutside(r, theme, 0, 14, 0.8, (x, y, z) => {
        for (let i = 0; i < 3; i++) {
          const egg = piece(new THREE.SphereGeometry(0.35, 6, 5), '#c8b870', x + (r() - 0.5), y + 0.35, z + (r() - 0.5), { emissive: '#3a3a10' });
          egg.scale.y = 1.35;
          add(egg);
        }
        return true;
      });
    }
  });
}

// ---- Liquids and particles ----

function buildLiquid(theme) {
  const L = theme.liquid;
  if (!L) return null;
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, 24, 24);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({
    color: L.color, emissive: L.emissive, emissiveIntensity: L.lava ? 1.1 : 0.6,
    transparent: L.opacity != null, opacity: L.opacity != null ? L.opacity : 1, flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = L.y;
  mesh.receiveShadow = !L.lava;
  return mesh;
}

const PARTICLES = {
  dust: { n: 160, color: '#e8d0a0', size: 0.09, rise: 0.05, drift: 0.15, spread: [40, 6, 32], opacity: 0.45 },
  drips: { n: 120, color: '#a8c880', size: 0.07, rise: -2.5, drift: 0, spread: [40, 8, 32], opacity: 0.6 },
  embers: { n: 260, color: '#ff8a2a', size: 0.12, rise: 0.9, drift: 0.4, spread: [44, 9, 36], opacity: 0.9, additive: true },
  wisps: { n: 80, color: '#b080ff', size: 0.16, rise: 0.15, drift: 0.5, spread: [44, 5, 36], opacity: 0.7, additive: true },
  bubbles: { n: 200, color: '#9ae8ff', size: 0.1, rise: 0.7, drift: 0.2, spread: [50, 8, 40], opacity: 0.55, additive: true },
  spores: { n: 180, color: '#a8ff7a', size: 0.09, rise: 0.12, drift: 0.35, spread: [40, 6, 32], opacity: 0.7, additive: true },
  snow: { n: 500, color: '#ffffff', size: 0.11, rise: -0.9, drift: 0.5, spread: [50, 14, 40], opacity: 0.9 },
};

function buildParticles(theme, r) {
  const P = PARTICLES[theme.particles];
  if (!P) return null;
  const pos = new Float32Array(P.n * 3);
  const seeds = new Float32Array(P.n);
  for (let i = 0; i < P.n; i++) {
    pos[i * 3] = (r() - 0.5) * P.spread[0];
    pos[i * 3 + 1] = r() * P.spread[1];
    pos[i * 3 + 2] = (r() - 0.5) * P.spread[2];
    seeds[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: P.color, size: P.size, map: flameTex(), transparent: true, opacity: P.opacity, depthWrite: false,
    blending: P.additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData = { P, seeds };
  return points;
}

function tickParticles(points, dt, time) {
  const { P, seeds } = points.userData;
  const pos = points.geometry.attributes.position;
  for (let i = 0; i < P.n; i++) {
    let y = pos.getY(i) + P.rise * dt;
    if (y > P.spread[1]) y -= P.spread[1];
    if (y < 0) y += P.spread[1];
    pos.setY(i, y);
    pos.setX(i, pos.getX(i) + Math.sin(time * 0.6 + seeds[i]) * P.drift * dt);
    pos.setZ(i, pos.getZ(i) + Math.cos(time * 0.5 + seeds[i]) * P.drift * dt);
  }
  pos.needsUpdate = true;
}

const HOME = { pos: new THREE.Vector3(0, 12, 13.5), target: new THREE.Vector3(0, 0.6, 0.8) };

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight('#e4f0ff', '#4a6a2c', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 1.9);
  sun.position.set(11, 22, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -19;
  sun.shadow.camera.right = 19;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // One built set per theme, kept so switching back is instant.
  const built = new Map();
  let current = null;
  let currentId = '';

  function setScene(id) {
    const themeId = THEMES[id] ? id : 'grass';
    if (themeId === currentId) return;
    if (current) scene.remove(current.group);
    if (!built.has(themeId)) {
      const theme = THEMES[themeId];
      const group = new THREE.Group();
      const r = rng(424242 + themeId.length * 977);
      group.add(buildGround(theme));
      const lights = [];
      buildProps(theme, group, lights, r);
      const liquid = buildLiquid(theme);
      if (liquid) group.add(liquid);
      const particles = buildParticles(theme, r);
      if (particles) group.add(particles);
      built.set(themeId, { theme, group, lights, liquid, particles });
    }
    current = built.get(themeId);
    currentId = themeId;
    scene.add(current.group);
    const t = current.theme;
    scene.background = new THREE.Color(t.sky);
    scene.fog = new THREE.Fog(t.fog[0], t.fog[1], t.fog[2]);
    hemi.color.set(t.hemi[0]);
    hemi.groundColor.set(t.hemi[1]);
    hemi.intensity = t.hemi[2];
    sun.color.set(t.sun[0]);
    sun.intensity = t.sun[1];
    stage.style.background = t.sky;
  }

  let clock = 0;
  function update(dt) {
    clock += dt;
    if (!current) return;
    current.lights.forEach((l) => {
      const f = 0.85 + Math.sin(clock * 11 + l.seed) * 0.08 + Math.sin(clock * 23 + l.seed * 2) * 0.05;
      l.light.intensity = l.base * f;
      l.flame.scale.set(0.8 * f, 1.1 * f, 1);
    });
    if (current.liquid) {
      const L = current.theme.liquid;
      current.liquid.position.y = L.y + Math.sin(clock * 0.8) * 0.04;
      if (L.lava) current.liquid.material.emissiveIntensity = 1 + Math.sin(clock * 1.7) * 0.15;
    }
    if (current.particles) tickParticles(current.particles, dt, clock);
  }

  const stage = canvas.parentElement || canvas;
  setScene('grass');

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 5;
  controls.maxDistance = 48;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.36;
  controls.screenSpacePanning = false;
  controls.update();

  let pixel = false;
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixel ? Math.max(0.34, dpr / 3) : dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // A tall phone screen gets a wider lens, so the fight still fits side to side.
    camera.fov = camera.aspect < 1 ? 38 + (1 - camera.aspect) * 34 : 38;
    camera.updateProjectionMatrix();
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    resize,
    setScene,
    update,
    get sceneId() { return currentId; },
    setPixel(on) {
      pixel = !!on;
      resize();
    },
    resetCamera() {
      camera.position.copy(HOME.pos);
      controls.target.copy(HOME.target);
      controls.update();
    },
  };
}
