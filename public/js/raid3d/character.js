// Low-poly OSRS-style spoops: flat-shaded boxes on a small bone tree, posed procedurally.
// Every equipped piece is drawn from its entry in items.js, keyed by the item's OSRS id, so
// what a spoop wears in 3D matches the icons in their equipment grid.
import * as THREE from 'three';
import { itemSpec, METAL } from './items.js';

const QUALITY_RANK = { crude: 0, worn: 1, standard: 2, fine: 3, sharpened: 4, tempered: 5, masterwork: 6 };
const QUALITY_GLOW = {
  standard: '#3dff4a', fine: '#4aa3ff', sharpened: '#c084fc', tempered: '#ff8a1a', masterwork: '#ffe38a',
};
const SLOTS = ['weapon', 'shield', 'head', 'body', 'legs', 'boots', 'gloves', 'cape', 'neck', 'ring', 'ammo'];
const GOLD = '#e8c45a';
const SKIN = '#e2ad86';
const WOOD = '#6b4228';

function shift(hex, amt) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const ch = (v) => Math.max(0, Math.min(255, v));
  return '#' + [ch((n >> 16) + amt), ch(((n >> 8) & 255) + amt), ch((n & 255) + amt)]
    .map((v) => v.toString(16).padStart(2, '0')).join('');
}

function hashName(name) {
  let h = 2166136261;
  const str = String(name || '');
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rank(item) {
  return item ? (QUALITY_RANK[item.quality] || 0) : -1;
}

// Older saves can carry an item with no id. Draw it from its base and metal.
function fallbackSpec(slot, item) {
  const c = METAL[item.tier] || '#9a9a9e';
  if (slot === 'weapon') {
    const base = ['dagger', 'sword', 'longsword', 'scimitar', 'mace', 'shortbow', 'staff'];
    const k = base.indexOf(item.baseId) >= 0 ? item.baseId
      : item.style === 'ranged' ? 'shortbow' : item.style === 'magic' ? 'staff' : 'sword';
    return { k, m: k === 'shortbow' ? '#8a5a2a' : k === 'staff' ? WOOD : c, o: '#c8a0ff' };
  }
  if (slot === 'head') return { k: item.baseId === 'full-helm' ? 'full' : item.shape === 'hat' ? 'hat' : 'med', c };
  if (slot === 'body') return { k: item.shape === 'robe' ? 'robe' : item.shape === 'vest' ? 'vest' : item.hide ? 'hide' : 'plate', c };
  if (slot === 'legs') return { k: item.shape === 'skirt' ? 'skirt' : item.hide ? 'chaps' : 'pants', c };
  if (slot === 'shield') return { k: 'kite', c };
  if (slot === 'boots') return { k: 'boot', c };
  if (slot === 'gloves') return { k: 'glove', c };
  if (slot === 'cape') return { k: 'plain', c: shift(c, -40) };
  if (slot === 'neck') return { k: 'amulet', c: GOLD, g: c };
  if (slot === 'ring') return { g: c };
  return { k: 'arrow', c };
}

export function specFor(slot, item) {
  if (!item) return null;
  return itemSpec(item.osrsId) || fallbackSpec(slot, item);
}

export function lookOf(fighter) {
  const eq = (fighter && fighter.equipped) || {};
  const hash = hashName(fighter && fighter.name);
  const blonde = (hash & 1) === 0;
  const spec = {};
  const q = {};
  SLOTS.forEach((slot) => {
    spec[slot] = specFor(slot, eq[slot]);
    q[slot] = rank(eq[slot]);
  });
  const weapon = eq.weapon;
  const style = (weapon && weapon.style) || (fighter && fighter.style) || 'melee';
  if (!spec.weapon && style === 'ranged') spec.weapon = { k: 'shortbow', m: '#8a6a3a' };
  if (!spec.weapon && style === 'magic') spec.weapon = { k: 'staff', m: WOOD, o: '#c8b48a' };
  return {
    hash,
    skin: SKIN,
    hair: blonde ? '#d9b443' : '#5e3a22',
    hairDark: blonde ? '#a8862c' : '#3a2414',
    beard: (hash & 4) !== 0,
    longHair: (hash & 8) !== 0,
    spec,
    q,
    style,
    weaponKind: spec.weapon ? spec.weapon.k : 'fist',
    weaponGlow: weapon && QUALITY_GLOW[weapon.quality] ? QUALITY_GLOW[weapon.quality] : null,
    spellColor: (spec.weapon && (spec.weapon.o || spec.weapon.g)) || '#a78bfa',
  };
}

// A box whose top and bottom faces can differ in size, so torsos and heads taper like OSRS models.
function taperGeo(wBottom, wTop, h, dBottom, dTop) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? wTop : wBottom));
    p.setZ(i, p.getZ(i) * (top ? dTop : dBottom));
    p.setY(i, p.getY(i) * h);
  }
  g.computeVertexNormals();
  return g;
}

const STAB = new Set(['dagger', 'rapier', 'fang', 'spear']);
const CRUSH = new Set(['mace', 'warhammer', 'maul', 'hammer', 'flail', 'bludgeon']);
const TWO_HANDED = new Set(['godsword', 'maul', 'scythe', 'halberd', 'greataxe', 'bludgeon', 'axe']);
const BOWS = new Set(['shortbow', 'longbow']);

const ATTACK_TIME = { slash: 0.62, stab: 0.5, crush: 0.7, punch: 0.45, heavy: 0.85, bow: 0.75, cast: 0.8 };

// What a swing looks like, by weapon.
export function attackKind(look, style) {
  if (style === 'ranged') return 'bow';
  if (style === 'magic') return 'cast';
  const k = look.weaponKind;
  if (k === 'fist') return 'punch';
  if (TWO_HANDED.has(k)) return 'heavy';
  if (STAB.has(k)) return 'stab';
  if (CRUSH.has(k)) return 'crush';
  return 'slash';
}

export function attackDuration(kind) {
  return ATTACK_TIME[kind] || 0.6;
}

// What a ranged weapon fires.
export function projectileKind(look) {
  const k = look.weaponKind;
  if (k === 'crossbow') return 'bolt';
  if (k === 'ballista' || k === 'atlatl') return 'javelin';
  if (k === 'blowpipe') return 'dart';
  return 'arrow';
}

// The instant inside an attack when the blow lands or the shot leaves, as a share of its duration.
export const ATTACK_IMPACT = { slash: 0.5, stab: 0.48, crush: 0.55, punch: 0.45, heavy: 0.58, bow: 0.66, cast: 0.6 };

const REST = { rSx: 0.06, rSz: -0.14, rE: -0.22, lSx: 0.06, lSz: 0.14, lE: -0.22, twist: 0, lean: 0, aim: 0, draw: 0, glow: 0 };

// Key poses per attack. u runs 0..1 over the attack. Missing keys fall back to the rest pose.
const KEYS = {
  slash: [
    [0, {}],
    [0.38, { rSx: -2.55, rSz: -0.55, rE: -0.7, twist: -0.42, lean: -0.05, lSx: -0.35 }],
    [0.52, { rSx: -0.55, rSz: 0.45, rE: -0.1, twist: 0.32, lean: 0.12, lSx: 0.3 }],
    [0.7, { rSx: -0.4, rSz: 0.3, rE: -0.2, twist: 0.2, lean: 0.06 }],
    [1, {}],
  ],
  stab: [
    [0, {}],
    [0.36, { rSx: -0.55, rSz: -0.2, rE: -1.75, twist: -0.3 }],
    [0.5, { rSx: -1.55, rSz: 0.05, rE: -0.05, twist: 0.25, lean: 0.18 }],
    [0.72, { rSx: -1.3, rE: -0.3, twist: 0.12, lean: 0.08 }],
    [1, {}],
  ],
  crush: [
    [0, {}],
    [0.42, { rSx: -3.0, rSz: -0.12, rE: -0.55, lean: -0.12, lSx: -0.4 }],
    [0.56, { rSx: -0.75, rSz: 0.05, rE: -0.05, lean: 0.2, lSx: 0.2 }],
    [0.76, { rSx: -0.6, rE: -0.15, lean: 0.1 }],
    [1, {}],
  ],
  // Two-handers: both arms lift the weapon overhead and bring it down together.
  heavy: [
    [0, {}],
    [0.46, { rSx: -2.85, rSz: -0.2, rE: -0.6, lSx: -2.75, lSz: -0.35, lE: -0.7, lean: -0.16, twist: -0.25 }],
    [0.6, { rSx: -0.7, rSz: 0.25, rE: -0.05, lSx: -0.75, lSz: -0.45, lE: -0.1, lean: 0.26, twist: 0.2 }],
    [0.8, { rSx: -0.55, rSz: 0.2, rE: -0.2, lSx: -0.6, lSz: -0.35, lE: -0.25, lean: 0.14 }],
    [1, {}],
  ],
  punch: [
    [0, {}],
    [0.32, { rSx: -0.55, rE: -2.1, twist: -0.3 }],
    [0.46, { rSx: -1.5, rSz: 0.1, rE: -0.02, twist: 0.28, lean: 0.12 }],
    [0.7, { rSx: -1.1, rE: -0.6, twist: 0.1 }],
    [1, {}],
  ],
  bow: [
    [0, {}],
    [0.24, { lSx: -1.52, lSz: -0.12, lE: 0, rSx: -1.35, rSz: 0.32, rE: -1.2, aim: 1, draw: 0.2, twist: -0.12 }],
    [0.64, { lSx: -1.55, lSz: -0.12, lE: 0, rSx: -1.45, rSz: 0.08, rE: -2.05, aim: 1, draw: 1, twist: -0.22 }],
    [0.7, { lSx: -1.55, lSz: -0.12, lE: 0, rSx: -1.2, rSz: -0.25, rE: -0.9, aim: 1, draw: 0, twist: -0.1 }],
    [0.86, { lSx: -1.3, lE: -0.05, aim: 0.8, rSx: -0.4, rE: -0.6 }],
    [1, {}],
  ],
  cast: [
    [0, {}],
    [0.3, { rSx: -0.9, rSz: 0.1, rE: -1.2, lSx: -0.9, lSz: -0.1, lE: -1.2, lean: -0.08, glow: 0.4 }],
    [0.58, { rSx: -1.55, rSz: 0.28, rE: -0.05, lSx: -1.55, lSz: -0.28, lE: -0.05, lean: 0.14, glow: 1 }],
    [0.78, { rSx: -1.35, rSz: 0.2, rE: -0.2, lSx: -1.35, lSz: -0.2, lE: -0.2, lean: 0.06, glow: 0.4 }],
    [1, {}],
  ],
};

function smooth(u) {
  return u * u * (3 - 2 * u);
}

function keyPose(kind, u) {
  const keys = KEYS[kind];
  const out = Object.assign({}, REST);
  if (!keys) return out;
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [ua, pa] = keys[i];
  const [ub, pb] = keys[i + 1];
  const k = smooth(Math.max(0, Math.min(1, (u - ua) / Math.max(1e-4, ub - ua))));
  Object.keys(REST).forEach((name) => {
    const a = name in pa ? pa[name] : REST[name];
    const b = name in pb ? pb[name] : REST[name];
    out[name] = a + (b - a) * k;
  });
  return out;
}

export function buildSpoop(fighter) {
  const look = lookOf(fighter);
  const S = look.spec;
  const mats = new Map();
  const glowMats = [];

  function mat(hex, opts) {
    const key = hex + (opts ? JSON.stringify(opts) : '');
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial(Object.assign({ color: hex, flatShading: true }, opts || {}));
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseEmissiveIntensity = m.emissiveIntensity;
      mats.set(key, m);
    }
    return m;
  }
  function mesh(geo, hex, x, y, z, opts) {
    const m = new THREE.Mesh(geo, mat(hex, opts));
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }
  function box(w, h, d, hex, x, y, z, opts) {
    return mesh(new THREE.BoxGeometry(w, h, d), hex, x, y, z, opts);
  }
  function glowBox(w, h, d, hex, x, y, z, base) {
    const m = box(w, h, d, hex, x, y, z, { emissive: hex });
    return markGlow(m, base == null ? 0.6 : base);
  }
  function markGlow(m, base) {
    m.material.userData.glowBase = base;
    m.material.userData.baseEmissiveIntensity = base;
    m.material.emissiveIntensity = base;
    if (glowMats.indexOf(m.material) < 0) glowMats.push(m.material);
    return m;
  }
  function group(x, y, z, parent) {
    const g = new THREE.Group();
    g.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(g);
    return g;
  }
  const kit = { mat, mesh, box, glowBox, markGlow, group, look };

  const root = new THREE.Group();
  const fall = group(0, 0, 0, root);
  const hips = group(0, 0.74, 0, fall);
  const spine = group(0, 0.06, 0, hips);

  // ---- Colors per slot ----
  const body = S.body;
  const bodyKind = body ? body.k : 'shirt';
  const torso = body ? shift(body.c, look.q.body < 2 ? -20 : look.q.body >= 3 ? 10 : 0) : '#b77a45';
  const legSpec = S.legs || (bodyKind === 'robe' ? { k: 'skirt', c: torso } : null);
  const legKind = legSpec ? legSpec.k : 'pants';
  const legColor = legSpec ? shift(legSpec.c, look.q.legs >= 3 ? 8 : 0) : '#4f3020';
  const bootSpec = S.boots;
  const bootKind = bootSpec ? bootSpec.k : 'shoe';
  const bootColor = bootSpec ? bootSpec.c : '#3a2618';
  const gloveSpec = S.gloves;
  const hand = gloveSpec && (gloveSpec.k === 'glove' || gloveSpec.k === 'gauntlet') ? gloveSpec.c : look.skin;

  // ---- Legs: thigh, knee, shin, boot. The right side of a spoop facing +z is -x. ----
  const underLeg = legKind === 'skirt' ? shift(legColor, -35) : legKind === 'tassets' ? shift(legColor, -45) : legColor;
  const legParts = {};
  ['l', 'r'].forEach((side) => {
    const sx = side === 'l' ? 0.1 : -0.1;
    const leg = group(sx, -0.02, 0, hips);
    leg.add(box(0.15, 0.36, 0.17, underLeg, 0, -0.18, 0));
    if (legKind === 'pants' && legSpec && legSpec.c2) leg.add(box(0.152, 0.05, 0.172, legSpec.c2, 0, -0.06, 0));
    if (legKind === 'pants' && look.q.legs >= 5) leg.add(box(0.152, 0.04, 0.172, GOLD, 0, -0.02, 0));
    if (legKind === 'chaps') leg.add(box(0.155, 0.3, 0.06, shift(legColor, -28), 0, -0.2, 0.06));
    const knee = group(0, -0.36, 0, leg);
    if (legKind === 'pants' && legSpec) knee.add(box(0.11, 0.07, 0.04, shift(legColor, 25), 0, -0.01, 0.085));
    const tall = bootKind === 'tall';
    const shinColor = tall ? bootColor : underLeg;
    knee.add(box(0.135, 0.2, 0.15, shinColor, 0, -0.1, 0));
    knee.add(box(0.145, 0.12, 0.16, bootKind === 'shoe' ? underLeg : bootColor, 0, -0.25, 0));
    knee.add(box(0.15, 0.08, 0.25, bootColor, 0, -0.32, 0.045));
    if (tall && bootSpec.c2) knee.add(box(0.15, 0.04, 0.165, bootSpec.c2, 0, -0.005, 0));
    if (bootSpec && bootSpec.k === 'boot' && bootSpec.c2) knee.add(box(0.152, 0.03, 0.252, bootSpec.c2, 0, -0.285, 0.045));
    if (bootSpec && bootSpec.wings) {
      const wing = box(0.02, 0.1, 0.14, bootSpec.c2, side === 'l' ? 0.08 : -0.08, -0.24, -0.04);
      wing.rotation.x = -0.5;
      knee.add(wing);
    }
    if (bootSpec && bootSpec.g) knee.add(glowBox(0.152, 0.025, 0.252, bootSpec.g, 0, -0.355, 0.045, 0.5));
    if (look.q.boots >= 6) knee.add(box(0.152, 0.025, 0.252, GOLD, 0, -0.285, 0.045));
    legParts[side] = { leg, knee };
  });
  hips.add(box(0.36, 0.14, 0.22, legKind === 'skirt' ? legColor : legColor, 0, 0, 0));
  if (legKind === 'skirt') {
    hips.add(mesh(taperGeo(0.5, 0.37, 0.58, 0.34, 0.24), legColor, 0, -0.3, 0));
    hips.add(mesh(taperGeo(0.505, 0.5, 0.05, 0.345, 0.34), legSpec.c2 || shift(legColor, -30), 0, -0.57, 0));
  }
  if (legKind === 'tassets') {
    [0.1, -0.1].forEach((x) => {
      const plate = mesh(taperGeo(0.17, 0.15, 0.26, 0.03, 0.03), legColor, x, -0.17, 0.13);
      plate.rotation.x = -0.12;
      hips.add(plate);
      if (legSpec.c2) hips.add(box(0.17, 0.03, 0.035, legSpec.c2, x, -0.29, 0.145));
    });
    hips.add(box(0.38, 0.05, 0.24, legSpec.c2 || shift(legColor, -30), 0, 0.03, 0));
  }
  if (legKind === 'chaps') hips.add(box(0.37, 0.05, 0.23, legSpec.c2 || shift(legColor, -40), 0, 0.04, 0));

  // ---- Torso ----
  buildBody(spine, body, bodyKind, torso, kit, look);

  // ---- Head ----
  spine.add(box(0.12, 0.07, 0.12, look.skin, 0, 0.49, 0));
  const head = group(0, 0.52, 0, spine);
  head.add(mesh(taperGeo(0.23, 0.28, 0.3, 0.25, 0.28), look.skin, 0, 0.15, 0));
  const headwear = S.head;
  head.add(box(0.05, 0.035, 0.01, '#1a1410', 0.065, 0.17, 0.142));
  head.add(box(0.05, 0.035, 0.01, '#1a1410', -0.065, 0.17, 0.142));
  head.add(box(0.045, 0.07, 0.04, shift(look.skin, -22), 0, 0.12, 0.15));
  head.add(box(0.09, 0.02, 0.01, shift(look.skin, -50), 0, 0.055, 0.138));
  let helm = null;
  let hairUnder = null;
  if (headwear) {
    helm = group(0, 0, 0, head);
    buildHead(helm, headwear, kit, look);
    // Their own hair, for when the helmet comes off.
    hairUnder = group(0, 0, 0, head);
    buildHead(hairUnder, null, kit, look);
    hairUnder.visible = false;
  } else {
    buildHead(head, null, kit, look);
  }

  // ---- Arms: shoulder, elbow, wrist ----
  const sleeves = {
    plate: [torso, torso], robe: [torso, torso], vest: [look.skin, look.skin], hide: [torso, torso],
    leather: [torso, look.skin], tunic: [torso, look.skin], crystal: [torso, torso], shirt: [torso, torso],
  }[bodyKind] || [torso, torso];
  const armParts = {};
  ['l', 'r'].forEach((side) => {
    const sx = side === 'l' ? 0.3 : -0.3;
    const shoulder = group(sx, 0.42, 0, spine);
    shoulder.add(box(0.13, 0.29, 0.14, sleeves[0], 0, -0.13, 0));
    const elbow = group(0, -0.27, 0, shoulder);
    const cuff = bodyKind === 'robe' ? 0.16 : 0.12;
    elbow.add(box(cuff, 0.23, cuff + 0.01, sleeves[1], 0, -0.11, 0));
    if (bodyKind === 'robe' && body && body.c2) elbow.add(box(cuff + 0.005, 0.035, cuff + 0.015, body.c2, 0, -0.21, 0));
    if (gloveSpec) buildGlove(elbow, gloveSpec, kit);
    const wrist = group(0, -0.24, 0, elbow);
    wrist.add(box(gloveSpec && gloveSpec.k === 'gauntlet' ? 0.12 : 0.1, 0.1, 0.11, hand, 0, -0.04, 0));
    if (side === 'l' && S.ring) {
      const ring = S.ring.glow ? glowBox(0.03, 0.03, 0.03, S.ring.g, 0.05, -0.07, 0.045, 0.6) : box(0.03, 0.03, 0.03, S.ring.g, 0.05, -0.07, 0.045);
      wrist.add(ring);
    }
    armParts[side] = { shoulder, elbow, wrist };
  });

  // ---- Back: cape, devices, quiver ----
  let cape = null;
  if (S.cape) cape = buildCape(spine, S.cape, kit, look.q.cape >= 4);
  const showQuiver = (S.ammo || BOWS.has(look.weaponKind)) && !(S.cape && (S.cape.k === 'quiver' || S.cape.k === 'ava'));
  if (showQuiver) buildQuiver(spine, S.ammo, kit);
  if (S.neck) buildNeck(spine, S.neck, kit);

  const held = buildWeapon(look, armParts, kit);
  if (S.shield) buildShield(armParts.l.elbow, S.shield, kit);

  const parts = { legs: legParts, arms: armParts, cape, held };
  const materials = Array.from(mats.values());

  // Gear that comes loose on death: the helmet, whatever is in each hand, and the shield.
  const loose = [];
  if (helm) loose.push({ obj: helm, kind: 'helm' });
  ['r', 'l'].forEach((side) => {
    armParts[side].wrist.children.forEach((child) => { if (child.isGroup) loose.push({ obj: child, kind: 'weapon', side }); });
  });
  armParts.l.elbow.children.forEach((child) => {
    if (child.isGroup && child !== armParts.l.wrist) loose.push({ obj: child, kind: 'shield', side: 'l' });
  });
  let thrown = false;

  function setTint(hurt, fade) {
    materials.forEach((m) => {
      if (hurt > 0) {
        m.emissive.setRGB(0.55 * hurt, 0, 0);
        m.emissiveIntensity = 1;
      } else {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseEmissiveIntensity;
      }
      if (fade != null) {
        m.transparent = true;
        m.opacity = fade;
      } else if (m.transparent && !m.userData.keepTransparent) {
        m.transparent = false;
        m.opacity = 1;
      }
    });
  }

  const twoHanded = TWO_HANDED.has(look.weaponKind);

  // Frozen solid by ice breath.
  const ice = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.95, 0.8),
    new THREE.MeshLambertMaterial({ color: '#bfefff', emissive: '#3a8ab0', emissiveIntensity: 0.4, transparent: true, opacity: 0.45, flatShading: true, depthWrite: false }),
  );
  ice.position.y = 0.95;
  ice.visible = false;
  root.add(ice);

  // state: { walk: phase radians, move: 0..1, attack: { kind, u } | null, hurt: 0..1, death: 0..1 | null, breathe: seconds, brace: 0..1 }
  function pose(state) {
    const p = state.attack ? keyPose(state.attack.kind, state.attack.u) : Object.assign({}, REST);
    if (twoHanded && !state.attack) {
      // A two-hander rests across the body with the off hand on the grip.
      p.lSx = -0.55;
      p.lSz = -0.4;
      p.lE = -1.0;
      p.rSx = -0.35;
      p.rE = -0.6;
    }
    // Bracing for a hit: crouch, guard up.
    const brace = state.brace || 0;
    if (brace > 0 && !state.attack) {
      p.lSx += (-1.1 - p.lSx) * brace;
      p.lE += (-1.4 - p.lE) * brace;
      p.lean -= 0.12 * brace;
    }
    const move = state.frozen ? 0 : state.attack ? state.move * 0.35 : state.move;
    const amp = 0.62 * Math.min(1, move);
    const ph = state.walk || 0;
    const s = Math.sin(ph);

    parts.legs.l.leg.rotation.x = -s * amp;
    parts.legs.r.leg.rotation.x = s * amp;
    parts.legs.l.knee.rotation.x = amp * 1.25 * Math.max(0, Math.cos(ph)) + brace * 0.35;
    parts.legs.r.knee.rotation.x = amp * 1.25 * Math.max(0, -Math.cos(ph)) + brace * 0.35;
    if (brace > 0) {
      parts.legs.l.leg.rotation.x -= brace * 0.3;
      parts.legs.r.leg.rotation.x -= brace * 0.3;
    }
    hips.position.y = 0.74 + Math.abs(Math.cos(ph)) * 0.035 * Math.min(1, move) - brace * 0.06;

    const swing = s * amp * 0.85;
    const arms = parts.arms;
    arms.r.shoulder.rotation.set(p.rSx - swing * (state.attack ? 0 : 1), 0, p.rSz);
    arms.r.elbow.rotation.x = p.rE;
    arms.l.shoulder.rotation.set(p.lSx + swing * (p.aim > 0.5 || twoHanded ? 0 : 1), 0, p.lSz);
    arms.l.elbow.rotation.x = p.lE;

    const breathe = Math.sin((state.breathe || 0) * 2.2) * 0.008 * (1 - Math.min(1, move));
    spine.position.y = 0.06 + breathe;
    spine.rotation.y = p.twist;
    spine.rotation.x = p.lean + Math.min(1, move) * 0.08 - (state.hurt || 0) * 0.18;
    head.rotation.x = -p.lean * 0.5;

    if (parts.cape) parts.cape.rotation.x = 0.08 + Math.min(1.4, move) * 0.32 + Math.abs(s) * 0.08 * move;
    if (held && held.pose) held.pose(p, state);

    const dt = state.deathTime;
    if (dt != null && dt >= 0) {
      limp(dt);
      throwGear(dt);
      setTint(dt < 0.15 ? 1 - dt / 0.15 : 0, null);
    } else {
      fall.rotation.set(0, 0, 0);
      fall.position.set(0, 0, 0);
      head.rotation.z = 0;
      catchGear();
      setTint(state.hurt || 0, null);
      if (state.mad && !state.hurt) {
        const pulse = 0.25 + 0.15 * Math.sin((state.breathe || 0) * 8);
        materials.forEach((m) => {
          m.emissive.setRGB(0.55 * pulse, 0.1 * pulse, 0.9 * pulse);
          m.emissiveIntensity = 1;
        });
      }
    }
    ice.visible = !!state.frozen && (dt == null || dt < 0);
    const flicker = 0.85 + 0.15 * Math.sin((state.breathe || 0) * 9);
    glowMats.forEach((m) => {
      m.emissiveIntensity = (m.userData.glowBase || 0) * flicker + (p.glow || 0) * 1.2 + (state.attack ? 0.12 : 0);
    });
  }

  // ---- Dying ----
  // Every spoop falls a little differently, picked from their name so a replay falls the same way.
  const rnd = (() => {
    let a = look.hash >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = Math.imul(a ^ (a >>> 15), a | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const fallSide = rnd() < 0.5 ? -1 : 1;
  const flop = { lE: -0.2 - rnd() * 0.9, rE: -0.2 - rnd() * 0.9, lz: 0.9 + rnd() * 0.6, rz: 0.9 + rnd() * 0.6 };

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  // Knees go first, then the body drops backward like a sack, bounces once, and lies there.
  function limp(dt) {
    const buckle = smooth(clamp01(dt / 0.22));
    const u = clamp01((dt - 0.1) / 0.55);
    const drop = u * u;
    const after = dt - 0.65;
    const bounce = after > 0 ? Math.sin(after * 16) * Math.exp(-after * 9) * 0.12 : 0;
    fall.rotation.x = -1.47 * drop + bounce;
    fall.rotation.z = fallSide * 0.22 * drop;
    fall.position.y = 0.13 * drop + Math.abs(bounce) * 0.25;
    fall.position.z = -0.55 * drop;
    hips.position.y = 0.74 - 0.2 * buckle * (1 - drop);
    const legs = parts.legs;
    legs.l.leg.rotation.set(-0.6 * buckle * (1 - drop) + 0.12 * drop, 0, 0.22 * drop);
    legs.r.leg.rotation.set(-0.5 * buckle * (1 - drop) + 0.2 * drop, 0, -0.18 * drop);
    legs.l.knee.rotation.x = 1.0 * buckle * (1 - drop) + 0.35 * drop;
    legs.r.knee.rotation.x = 0.9 * buckle * (1 - drop) + 0.15 * drop;
    spine.rotation.set(-0.35 * buckle * (1 - drop) + 0.08 * drop, 0, 0);
    head.rotation.x = -0.5 * buckle * (1 - drop) - 0.15 * drop;
    head.rotation.z = fallSide * 0.55 * drop;
    const arms = parts.arms;
    arms.r.shoulder.rotation.set(-0.9 * buckle * (1 - drop) - 1.7 * drop, 0, -0.3 - flop.rz * drop);
    arms.l.shoulder.rotation.set(-0.9 * buckle * (1 - drop) - 1.5 * drop, 0, 0.3 + flop.lz * drop);
    arms.r.elbow.rotation.x = flop.rE * drop - 0.3 * (1 - drop);
    arms.l.elbow.rotation.x = flop.lE * drop - 0.3 * (1 - drop);
    if (parts.cape) parts.cape.rotation.x = 0.1 + 0.6 * buckle * (1 - drop);
  }

  // Where each loose piece sits in the spoop's own space when standing, and how it will fly.
  const tmpM = new THREE.Matrix4();
  const tmpS = new THREE.Vector3();
  const spinQ = new THREE.Quaternion();
  const flatQ = new THREE.Quaternion();
  function measureGear() {
    pose({ walk: 0, move: 0, attack: null, hurt: 0, breathe: 0 });
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    loose.forEach((piece, i) => {
      piece.parent = piece.obj.parent;
      piece.localPos = piece.obj.position.clone();
      piece.localQuat = piece.obj.quaternion.clone();
      piece.p0 = new THREE.Vector3();
      piece.q0 = new THREE.Quaternion();
      tmpM.multiplyMatrices(inv, piece.obj.matrixWorld).decompose(piece.p0, piece.q0, tmpS);
      const out = piece.side === 'r' ? -1 : piece.side === 'l' ? 1 : (rnd() - 0.5) * 0.8;
      // Helmets pop up and back, weapons and shields get flung out to their side.
      piece.v = piece.kind === 'helm'
        ? new THREE.Vector3(out * 0.8, 3.2 + rnd() * 1.2, -1.6 - rnd())
        : new THREE.Vector3(out * (1.3 + rnd() * 1.1), 2.2 + rnd() * 1.4, (rnd() - 0.6) * 1.6);
      piece.spinAxis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      piece.spin = (piece.kind === 'weapon' ? 9 : 6) + rnd() * 6;
      piece.restY = piece.kind === 'helm' ? 0.14 : 0.05;
      const yaw = rnd() * Math.PI * 2;
      piece.flat = piece.kind === 'helm'
        ? new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.5, yaw, 0, 'YXZ'))
        : new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, yaw, 'XYZ'));
      const vy = piece.v.y;
      piece.land = (vy + Math.sqrt(vy * vy + 19.6 * Math.max(0, piece.p0.y - piece.restY))) / 9.8;
      piece.i = i;
    });
  }

  function throwGear(dt) {
    if (!thrown) {
      thrown = true;
      loose.forEach((piece) => root.add(piece.obj));
      if (hairUnder) hairUnder.visible = true;
    }
    loose.forEach((piece) => {
      const o = piece.obj;
      const air = Math.min(dt, piece.land);
      o.position.copy(piece.p0).addScaledVector(piece.v, air);
      o.position.y = piece.p0.y + piece.v.y * air - 4.9 * air * air;
      spinQ.setFromAxisAngle(piece.spinAxis, piece.spin * air);
      o.quaternion.copy(piece.q0).premultiply(spinQ);
      const ground = dt - piece.land;
      if (ground > 0) {
        // Skid a little, rattle, settle flat.
        const skid = 1 - Math.exp(-ground * 7);
        o.position.x += piece.v.x * 0.12 * skid;
        o.position.z += piece.v.z * 0.12 * skid;
        o.position.y = piece.restY + Math.abs(Math.sin(ground * 18)) * Math.exp(-ground * 10) * 0.12;
        flatQ.copy(piece.flat);
        o.quaternion.slerp(flatQ, smooth(clamp01(ground / 0.22)));
      }
    });
  }

  function catchGear() {
    if (!thrown) return;
    thrown = false;
    loose.forEach((piece) => {
      piece.parent.add(piece.obj);
      piece.obj.position.copy(piece.localPos);
      piece.obj.quaternion.copy(piece.localQuat);
    });
    if (hairUnder) hairUnder.visible = false;
  }

  measureGear();

  // Where projectiles leave from: the bow hand for archers, the casting hand for mages.
  function launchPoint(out) {
    const side = look.style === 'ranged' ? 'l' : 'r';
    return parts.arms[side].wrist.getWorldPosition(out || new THREE.Vector3());
  }

  return { root, look, pose, launchPoint, height: 1.66 };
}

// ---- Body ----

function buildBody(spine, spec, kind, torso, kit, look) {
  const { mesh, box, glowBox } = kit;
  const c2 = spec && spec.c2;
  const dark = shift(torso, -40);
  spine.add(mesh(taperGeo(0.36, 0.5, 0.46, 0.22, 0.27), torso, 0, 0.23, 0));
  spine.add(box(0.37, 0.05, 0.23, (spec && spec.belt) || dark, 0, 0.02, 0));
  if (kind === 'shirt') spine.add(box(0.1, 0.18, 0.02, look.skin, 0, 0.36, 0.13));
  if (kind === 'plate') {
    spine.add(box(0.3, 0.14, 0.02, shift(torso, 18), 0, 0.33, 0.128));
    if (c2) {
      spine.add(box(0.49, 0.035, 0.275, c2, 0, 0.45, 0));
      spine.add(box(0.05, 0.36, 0.02, c2, 0, 0.22, 0.13));
    }
    if ((spec && spec.pads) || look.q.body >= 4) {
      [0.26, -0.26].forEach((x) => {
        spine.add(box(0.18, 0.09, 0.31, torso, x, 0.44, 0));
        if (c2) spine.add(box(0.185, 0.025, 0.315, c2, x, 0.4, 0));
        if (spec && spec.spikes) {
          const spike = mesh(new THREE.ConeGeometry(0.035, 0.12, 4), c2 || '#d9d0c0', x * 1.15, 0.53, 0);
          spike.rotation.z = -Math.sign(x) * 0.6;
          spine.add(spike);
        }
      });
    }
    if (spec && spec.cross) {
      spine.add(box(0.05, 0.22, 0.02, spec.cross, 0, 0.27, 0.135));
      spine.add(box(0.16, 0.05, 0.02, spec.cross, 0, 0.3, 0.135));
    }
    if (look.q.body >= 5) spine.add(box(0.48, 0.035, 0.275, GOLD, 0, 0.42, 0));
    if (look.q.body >= 6) spine.add(box(0.08, 0.08, 0.02, '#fff6c8', 0, 0.28, 0.13, { emissive: '#7a6a20' }));
    if (spec && spec.c2 === '#ff5a1a') spine.add(glowBox(0.04, 0.2, 0.022, '#ff5a1a', 0, 0.25, 0.132, 0.7));
  }
  if (kind === 'robe') {
    spine.add(box(0.2, 0.05, 0.02, c2 || dark, 0, 0.43, 0.13));
    if (c2) spine.add(box(0.06, 0.38, 0.02, c2, 0, 0.22, 0.128));
    if (spec && spec.bark) {
      spine.add(box(0.14, 0.14, 0.02, shift(torso, -25), 0.11, 0.3, 0.13));
      spine.add(box(0.14, 0.14, 0.02, shift(torso, -25), -0.11, 0.3, 0.13));
    }
  }
  if (kind === 'vest') {
    spine.add(box(0.08, 0.26, 0.02, look.skin, 0, 0.32, 0.13));
    if (c2) spine.add(box(0.38, 0.06, 0.235, c2, 0, 0.06, 0));
  }
  if (kind === 'hide') {
    spine.add(box(0.06, 0.44, 0.02, dark, 0.08, 0.24, 0.125));
    spine.add(box(0.06, 0.44, 0.02, dark, -0.08, 0.24, 0.125));
    if (c2) {
      spine.add(box(0.5, 0.04, 0.275, c2, 0, 0.45, 0));
      spine.add(box(0.37, 0.03, 0.235, c2, 0, 0.06, 0));
    }
  }
  if (kind === 'leather') {
    spine.add(box(0.3, 0.04, 0.02, c2 || dark, 0, 0.36, 0.128));
    if (spec && spec.studs) {
      [[0.1, 0.28], [-0.1, 0.28], [0.1, 0.16], [-0.1, 0.16], [0, 0.22]].forEach(([x, y]) => spine.add(box(0.03, 0.03, 0.02, spec.studs, x, y, 0.13)));
    }
  }
  if (kind === 'tunic') {
    spine.add(box(0.38, 0.06, 0.235, c2 || dark, 0, 0.06, 0));
    if (spec && spec.c3) spine.add(box(0.2, 0.04, 0.02, spec.c3, 0, 0.42, 0.13));
  }
  if (kind === 'crystal') {
    spine.add(glowBox(0.12, 0.12, 0.02, c2 || '#f4ffff', 0.08, 0.3, 0.13, 0.35));
    spine.add(glowBox(0.12, 0.12, 0.02, c2 || '#f4ffff', -0.08, 0.3, 0.13, 0.35));
  }
}

// ---- Head ----

function addHorns(head, color, mesh, y) {
  [1, -1].forEach((side) => {
    const horn = mesh(new THREE.ConeGeometry(0.035, 0.16, 5), color, side * 0.17, y || 0.34, 0);
    horn.rotation.z = -side * 0.7;
    head.add(horn);
  });
}

function addFins(head, color, mesh) {
  [1, -1].forEach((side) => {
    const fin = mesh(new THREE.BoxGeometry(0.02, 0.14, 0.18), color, side * 0.17, 0.3, -0.04);
    fin.rotation.z = -side * 0.35;
    fin.rotation.x = 0.3;
    head.add(fin);
  });
}

function buildHead(head, spec, kit, look) {
  const { mesh, box, glowBox } = kit;
  if (!spec) {
    head.add(mesh(taperGeo(0.3, 0.28, 0.08, 0.3, 0.28), look.hair, 0, 0.31, -0.005));
    head.add(box(0.29, look.longHair ? 0.34 : 0.2, 0.06, look.hair, 0, look.longHair ? 0.12 : 0.2, -0.13));
    head.add(box(0.03, 0.12, 0.2, look.hair, 0.14, 0.24, -0.02));
    head.add(box(0.03, 0.12, 0.2, look.hair, -0.14, 0.24, -0.02));
    head.add(box(0.22, 0.04, 0.05, look.hair, 0, 0.27, 0.12));
    if (look.beard) {
      head.add(box(0.2, 0.08, 0.06, look.hairDark, 0, 0.03, 0.125));
      head.add(box(0.12, 0.04, 0.05, look.hairDark, 0, -0.02, 0.12));
    }
    return;
  }
  const c = spec.c;
  const c2 = spec.c2 || shift(c, -30);
  const k = spec.k;

  if (k === 'full' || k === 'great') {
    const great = k === 'great';
    const w = spec.blocky ? 0.34 : 0.32;
    head.add(mesh(taperGeo(great ? 0.31 : 0.29, w, great ? 0.44 : 0.36, 0.3, great ? 0.31 : 0.32), c, 0, great ? 0.2 : 0.16, 0));
    const visor = spec.visor || (great ? 'cross' : 'slit');
    const slit = visor === 'gold' ? spec.c2 : '#111111';
    head.add(box(0.22, 0.035, 0.01, slit, 0, 0.18, 0.162));
    if (visor === 'cross' || great) head.add(box(0.035, 0.12, 0.01, great ? c2 : slit, 0, 0.12, 0.162));
    if (visor === 'grill') [-0.06, 0, 0.06].forEach((x) => head.add(box(0.02, 0.1, 0.01, '#111111', x, 0.1, 0.162)));
    if (visor === 'gold') head.add(box(0.3, 0.03, 0.31, spec.c2, 0, 0.26, 0));
    if (visor === 'snake') {
      head.add(box(0.2, 0.12, 0.12, c, 0, 0.12, 0.2));
      head.add(box(0.22, 0.03, 0.13, spec.c2, 0, 0.19, 0.2));
    }
    if (spec.eyes) {
      const z = visor === 'snake' ? 0.262 : 0.164;
      head.add(glowBox(0.05, 0.03, 0.01, spec.eyes, 0.06, 0.18, z, 0.7));
      head.add(glowBox(0.05, 0.03, 0.01, spec.eyes, -0.06, 0.18, z, 0.7));
    }
    if (spec.crest) head.add(box(0.03, 0.1, 0.26, spec.c2 || shift(c, 40), 0, great ? 0.44 : 0.37, -0.01));
    if (spec.spikes) [-0.08, 0, 0.08].forEach((z) => head.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 4), c, 0, 0.38, z)));
    if (spec.horns) addHorns(head, spec.horns, mesh);
    if (look.q.head >= 6) head.add(box(0.032, 0.04, 0.12, GOLD, 0, 0.42, 0.04));
    return;
  }

  if (k === 'hat') {
    head.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 8), shift(c, -20), 0, 0.29, 0));
    head.add(box(0.29, 0.04, 0.29, c2, 0, 0.31, 0));
    const cone = mesh(new THREE.ConeGeometry(0.15, spec.short ? 0.22 : 0.36, 6), c, 0, spec.short ? 0.41 : 0.47, -0.02);
    cone.rotation.x = spec.short ? -0.35 : -0.18;
    head.add(cone);
    head.add(box(0.27, 0.06, 0.05, look.hair, 0, 0.24, -0.13));
    return;
  }

  if (k === 'hood' || k === 'coif') {
    head.add(box(0.32, 0.08, 0.31, c, 0, 0.31, -0.005));
    head.add(box(0.035, 0.32, 0.3, c, 0.15, 0.15, -0.01));
    head.add(box(0.035, 0.32, 0.3, c, -0.15, 0.15, -0.01));
    head.add(box(0.32, 0.34, 0.04, c, 0, 0.15, -0.145));
    head.add(box(0.27, 0.04, 0.04, c2, 0, 0.02, 0.1));
    if (k === 'hood') {
      const tip = mesh(new THREE.ConeGeometry(0.1, 0.18, 4), c, 0, 0.36, -0.12);
      tip.rotation.x = -0.9;
      head.add(tip);
      head.add(box(0.3, 0.03, 0.04, c2, 0, 0.29, 0.14));
    }
    if (spec.mask) head.add(box(0.25, 0.1, 0.02, c2, 0, 0.07, 0.142));
    if (spec.shadow) head.add(box(0.22, 0.2, 0.01, '#0e0c10', 0, 0.14, 0.141));
    if (spec.helm) {
      const dome = mesh(new THREE.SphereGeometry(0.18, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#6a6a6a', 0, 0.24, 0);
      head.add(dome);
    }
    if (spec.spikes) [-0.1, 0, 0.1].forEach((x) => head.add(mesh(new THREE.ConeGeometry(0.03, 0.14, 4), c2, x, 0.4, -0.02)));
    return;
  }

  if (k === 'mask') {
    if (spec.full) head.add(mesh(taperGeo(0.29, 0.31, 0.35, 0.3, 0.31), c, 0, 0.16, -0.005));
    else {
      head.add(mesh(new THREE.SphereGeometry(0.175, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, 0.2, -0.005));
      head.add(box(0.26, 0.11, 0.02, '#1a1a1a', 0, 0.16, 0.142));
    }
    head.add(box(0.26, 0.04, 0.02, c2, 0, 0.24, 0.155));
    const eye = spec.eyes || (spec.full ? '#111111' : c2);
    head.add(spec.eyes ? glowBox(0.06, 0.03, 0.01, eye, 0.06, 0.18, 0.16, 0.7) : box(0.06, 0.03, 0.01, eye, 0.06, 0.18, 0.16));
    head.add(spec.eyes ? glowBox(0.06, 0.03, 0.01, eye, -0.06, 0.18, 0.16, 0.7) : box(0.06, 0.03, 0.01, eye, -0.06, 0.18, 0.16));
    if (spec.crest) head.add(box(0.03, 0.12, 0.24, c2, 0, 0.37, -0.02));
    return;
  }

  if (k === 'bandana') {
    head.add(mesh(taperGeo(0.3, 0.28, 0.08, 0.3, 0.28), look.hair, 0, 0.31, -0.005));
    head.add(box(0.3, 0.06, 0.3, c, 0, 0.25, 0));
    const tail = box(0.05, 0.12, 0.03, c, 0.06, 0.18, -0.16);
    tail.rotation.z = 0.4;
    head.add(tail);
    return;
  }

  if (k === 'cap' || k === 'brim') {
    head.add(box(0.29, 0.06, 0.05, look.hair, 0, 0.24, -0.13));
    if (k === 'brim') {
      head.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 10), shift(c, -15), 0, 0.29, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.14, 8), c, 0, 0.37, 0));
    } else {
      const cone = mesh(new THREE.ConeGeometry(0.17, 0.3, 5), c, 0, 0.4, -0.06);
      cone.rotation.x = -0.7;
      head.add(cone);
      head.add(box(0.3, 0.05, 0.3, c, 0, 0.29, 0));
    }
    if (spec.plume) {
      const plume = box(0.02, 0.26, 0.05, spec.plume, 0.12, 0.42, -0.05);
      plume.rotation.z = -0.35;
      plume.rotation.x = -0.4;
      head.add(plume);
    }
    return;
  }

  // Open helms: med helms, sallets and the rest, face showing.
  const dome = mesh(new THREE.SphereGeometry(0.175, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, 0.2, -0.005);
  dome.scale.set(1, 0.95, 1.04);
  head.add(dome);
  head.add(box(0.31, 0.045, 0.31, k === 'sallet' ? spec.c2 : shift(c, -28), 0, 0.215, -0.005));
  if (k === 'med' && !spec.visor) head.add(box(0.035, 0.1, 0.03, shift(c, -20), 0, 0.15, 0.155));
  if (spec.visor === 'void') {
    head.add(box(0.27, 0.12, 0.02, '#9aa0a8', 0, 0.08, 0.142));
    head.add(box(0.05, 0.03, 0.33, spec.c2, 0, 0.36, -0.005));
  }
  if (spec.cheeks) {
    head.add(box(0.03, 0.14, 0.12, c, 0.15, 0.08, 0.02));
    head.add(box(0.03, 0.14, 0.12, c, -0.15, 0.08, 0.02));
  }
  if (spec.horns) addHorns(head, spec.horns, mesh);
  if (spec.fins) addFins(head, spec.fins, mesh);
  if (spec.spikes) {
    [[0, 0.38, 0], [0.12, 0.32, 0], [-0.12, 0.32, 0], [0, 0.32, -0.12]].forEach(([x, y, z]) => {
      const spike = mesh(new THREE.ConeGeometry(0.03, 0.1, 4), shift(c, -20), x, y, z);
      spike.rotation.z = -x * 4;
      head.add(spike);
    });
  }
  if (spec.crest) head.add(box(0.03, 0.08, 0.24, spec.c2 || shift(c, 40), 0, 0.37, -0.01));
  if (spec.plume) {
    const plume = box(0.03, 0.18, 0.06, spec.plume, 0, 0.44, -0.08);
    plume.rotation.x = -0.4;
    head.add(plume);
  }
  if (spec.glow) head.add(glowBox(0.04, 0.06, 0.04, spec.glow, 0, 0.33, 0.12, 0.7));
  if (look.q.head >= 4 && !spec.crest && k === 'med') head.add(box(0.03, 0.06, 0.24, shift(c, 40), 0, 0.37, -0.01));
}

// ---- Hands, back, neck ----

function buildGlove(elbow, spec, kit) {
  const { box, glowBox } = kit;
  if (spec.k === 'vamb' || spec.k === 'gauntlet') {
    elbow.add(box(0.135, 0.12, 0.145, spec.c, 0, -0.17, 0));
    if (spec.c2) elbow.add(box(0.14, 0.03, 0.15, spec.c2, 0, -0.12, 0));
  }
  if (spec.k === 'glove' && spec.c2) elbow.add(box(0.13, 0.04, 0.14, spec.c2, 0, -0.21, 0));
  if (spec.k === 'bracelet') elbow.add(glowBox(0.13, 0.035, 0.14, spec.c, 0, -0.21, 0, 0.3));
  if (spec.k === 'bracelet' && spec.g) elbow.add(glowBox(0.04, 0.04, 0.02, spec.g, 0, -0.21, 0.075, 0.8));
}

function buildCape(spine, spec, kit, long) {
  const { mesh, box, glowBox, group } = kit;
  const k = spec.k;
  if (k === 'ava') {
    const device = group(0, 0.32, -0.17, spine);
    if (spec.cape) {
      const back = mesh(taperGeo(0.42, 0.36, 0.72, 0.03, 0.03), spec.cape, 0, -0.42, 0.02);
      device.add(back);
    }
    device.add(box(0.2, 0.2, 0.1, spec.c2, 0, 0, -0.04));
    device.add(mesh(new THREE.SphereGeometry(0.08, 6, 4), spec.c, 0, 0.12, -0.05));
    device.add(box(0.04, 0.12, 0.04, '#8a8a8a', 0.08, 0.14, -0.05));
    return null;
  }
  if (k === 'quiver') {
    const q = group(0.06, 0.28, -0.18, spine);
    q.rotation.z = -0.35;
    q.add(mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.5, 6), spec.c, 0, 0, 0));
    q.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 6), spec.c2, 0, 0.2, 0));
    q.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 6), spec.c2, 0, -0.18, 0));
    [-0.03, 0.03].forEach((x) => q.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 4), '#e8e0c0', x, 0.3, 0)));
    return null;
  }
  const cape = group(0, 0.44, -0.15, spine);
  const len = long || k === 'max' || k === 'infernal' ? 0.95 : 0.82;
  cape.add(mesh(taperGeo(0.5, 0.4, len, 0.03, 0.03), spec.c, 0, -len / 2, 0));
  const back = -0.02;
  const strip = (w, h, color, x, y, glow) => cape.add(glow
    ? glowBox(w, h, 0.012, color, x, y, back, glow)
    : box(w, h, 0.012, color, x, y, back));
  if (k === 'fire') {
    [[-0.12, -0.25, 0.3], [0.05, -0.45, 0.4], [0.14, -0.2, 0.22], [-0.05, -0.65, 0.25]].forEach(([x, y, h]) => strip(0.07, h, spec.c2, x, y, 0.8));
  }
  if (k === 'infernal' || spec.fire) {
    [[-0.13, -0.3, 0.35], [0.02, -0.55, 0.45], [0.13, -0.25, 0.25], [-0.04, -0.15, 0.12]].forEach(([x, y, h]) => strip(0.035, h, spec.c2, x, y, 0.9));
  }
  if (k === 'spotted') [[-0.12, -0.2], [0.1, -0.35], [-0.05, -0.55], [0.13, -0.65], [0, -0.15]].forEach(([x, y]) => strip(0.07, 0.06, spec.c2, x, y));
  if (k === 'max') {
    strip(0.44, 0.06, spec.c2, 0, -0.06);
    strip(0.38, 0.06, spec.c2, 0, -len + 0.06);
    strip(0.06, len - 0.2, spec.c2, 0, -len / 2);
  }
  if (k === 'god' || k === 'legends' || k === 'mythical') {
    strip(0.04, len - 0.04, spec.c2, 0.22, -len / 2);
    strip(0.04, len - 0.04, spec.c2, -0.2, -len / 2);
    strip(0.42, 0.05, spec.c2, 0, -len + 0.04);
  }
  if (k === 'plain' && spec.c2) strip(0.4, 0.05, spec.c2, 0, -len + 0.04, spec.c2 === '#ff6a1a' ? 0.6 : 0);
  if (spec.glow) strip(0.36, 0.04, spec.glow, 0, -0.12, 0.6);
  return cape;
}

function buildQuiver(spine, ammo, kit) {
  const { mesh, group } = kit;
  const quiver = group(0.1, 0.3, -0.17, spine);
  quiver.rotation.z = -0.5;
  quiver.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.38, 6), '#6b4228', 0, 0, 0));
  const tip = (ammo && ammo.c) || '#e8e0c0';
  const kind = (ammo && ammo.k) || 'arrow';
  const n = kind === 'dart' ? 0 : 3;
  for (let i = 0; i < n; i++) {
    const x = (i - 1) * 0.025;
    quiver.add(mesh(new THREE.BoxGeometry(0.012, kind === 'bolt' ? 0.08 : 0.14, 0.012), '#c4a56a', x, 0.24, 0));
    quiver.add(mesh(new THREE.ConeGeometry(0.022, 0.06, 4), tip, x, kind === 'bolt' ? 0.3 : 0.34, 0));
  }
}

function buildNeck(spine, spec, kit) {
  const { box, glowBox, mesh } = kit;
  spine.add(box(0.2, 0.02, 0.02, spec.c, 0, 0.45, 0.13));
  const y = 0.37;
  if (spec.k === 'symbol') {
    spine.add(box(0.025, 0.08, 0.02, spec.c, 0, y, 0.138));
    spine.add(box(0.07, 0.025, 0.02, spec.c, 0, y + 0.01, 0.138));
    return;
  }
  if (spec.k === 'fang') {
    const fang = mesh(new THREE.ConeGeometry(0.025, 0.09, 4), spec.k === 'fang' && spec.c === '#e8e0c8' ? '#f4f0e0' : '#f4f0e0', 0, y - 0.01, 0.14);
    fang.rotation.x = Math.PI;
    spine.add(fang);
    spine.add(box(0.03, 0.03, 0.02, spec.g, 0, y + 0.04, 0.14));
    return;
  }
  if (spec.k === 'bone') {
    [-0.05, 0, 0.05].forEach((x) => spine.add(box(0.025, 0.05, 0.02, spec.c, x, y + 0.03, 0.138)));
    spine.add(box(0.03, 0.03, 0.02, spec.g, 0, y - 0.01, 0.14));
    return;
  }
  const s = spec.big ? 0.075 : 0.055;
  spine.add(box(s + 0.02, s + 0.02, 0.02, spec.c, 0, y, 0.135));
  spine.add(spec.glow ? glowBox(s, s, 0.025, spec.g, 0, y, 0.142, 0.7) : box(s, s, 0.025, spec.g, 0, y, 0.142, { emissive: shift(spec.g, -90) }));
}

function buildShield(forearm, spec, kit) {
  const { mesh, box, glowBox, group } = kit;
  const g = group(0.08, -0.13, 0.02, forearm);
  const c = spec.c;
  const c2 = spec.c2 || shift(c, 48);
  const k = spec.k;
  if (k === 'book' || k === 'tome') {
    g.add(box(0.05, 0.22, 0.17, c, 0.02, -0.08, 0.04));
    g.add(box(0.052, 0.18, 0.01, c2, 0.02, -0.08, 0.125));
    if (spec.g) g.add(glowBox(0.054, 0.06, 0.06, spec.g, 0.025, -0.08, 0.04, 0.8));
    return;
  }
  const face = new THREE.Group();
  face.rotation.y = Math.PI / 2 - 0.35;
  g.add(face);
  g.rotation.x = -0.25;
  function slab(shape, color, depth) {
    const m = mesh(new THREE.ExtrudeGeometry(shape, { depth: depth || 0.035, bevelEnabled: false }), color, 0, 0, 0);
    face.add(m);
    return m;
  }
  const shape = new THREE.Shape();
  if (k === 'defender') {
    shape.moveTo(0, 0.2);
    shape.lineTo(0.1, 0.1);
    shape.lineTo(0.08, -0.12);
    shape.lineTo(0, -0.2);
    shape.lineTo(-0.06, -0.08);
    shape.lineTo(-0.08, 0.12);
  } else if (k === 'sq' || k === 'odium' || k === 'hide') {
    shape.moveTo(-0.15, 0.2);
    shape.lineTo(0.15, 0.2);
    shape.lineTo(0.15, -0.12);
    shape.lineTo(0, -0.24);
    shape.lineTo(-0.15, -0.12);
  } else if (k === 'buckler' || k === 'hopper') {
    shape.absarc(0, 0, k === 'buckler' ? 0.14 : 0.17, 0, Math.PI * 2, false);
  } else if (k === 'antler') {
    shape.moveTo(-0.14, 0.18);
    shape.lineTo(-0.04, 0.06);
    shape.lineTo(0.04, 0.2);
    shape.lineTo(0.14, 0.08);
    shape.lineTo(0.08, -0.2);
    shape.lineTo(-0.1, -0.16);
  } else if (k === 'ward' || k === 'spirit' || k === 'dfs') {
    shape.moveTo(0, 0.24);
    shape.lineTo(0.17, 0.12);
    shape.lineTo(0.15, -0.1);
    shape.lineTo(0, -0.27);
    shape.lineTo(-0.15, -0.1);
    shape.lineTo(-0.17, 0.12);
  } else {
    shape.moveTo(0, 0.22);
    shape.lineTo(0.16, 0.15);
    shape.lineTo(0.14, -0.06);
    shape.lineTo(0, -0.25);
    shape.lineTo(-0.14, -0.06);
    shape.lineTo(-0.16, 0.15);
  }
  shape.closePath();
  slab(shape, c);
  const emblem = (w, h, color, y, glow) => {
    const m = glow ? glowBox(w, h, 0.03, color, 0, y || 0, 0.04, glow) : box(w, h, 0.03, color, 0, y || 0, 0.04);
    face.add(m);
  };
  if (k === 'kite') emblem(0.06, 0.06, c2);
  if (k === 'sq') emblem(0.2, 0.04, c2, 0.05);
  if (k === 'dfs') {
    emblem(0.18, 0.12, c2, 0.03);
    emblem(0.06, 0.04, '#ffb04a', 0.03, 0.6);
  }
  if (k === 'ward') emblem(0.12, 0.16, c2);
  if (k === 'spirit') {
    emblem(0.2, 0.025, c2, 0.08, 0.5);
    emblem(0.025, 0.3, c2, 0, 0.5);
    if (spec.g) emblem(0.07, 0.07, spec.g, 0.04, 0.9);
  }
  if (k === 'defender') emblem(0.05, 0.14, c2 || '#e8e8e8');
  if (k === 'odium' || k === 'hopper' || k === 'buckler' || k === 'antler') emblem(0.08, 0.08, c2, 0, k === 'buckler' ? 0.5 : 0);
  if (k === 'hide') emblem(0.04, 0.3, shift(c, -40));
}

// ---- Weapons ----
// The held item hangs off a wrist. Its blade or shaft runs along local +y from the grip,
// then the mount tips it forward.

function buildWeapon(look, arms, kit) {
  const spec = look.spec.weapon;
  if (!spec) return null;
  const { mesh, box, glowBox, markGlow, group } = kit;
  const k = spec.k;
  const m = spec.m || '#c0c0c0';
  const h = spec.h || '#5c3a22';
  const qGlow = look.weaponGlow;
  const qBase = look.q.weapon >= 5 ? 0.22 : look.q.weapon >= 3 ? 0.08 : 0.03;
  const bladeOpts = qGlow ? { emissive: qGlow } : null;
  function blade(geo, color, x, y, z) {
    const part = mesh(geo, color || m, x, y, z, bladeOpts);
    if (qGlow) markGlow(part, qBase);
    return part;
  }
  function bar(w, len, d, color, y0, x, z) {
    return blade(new THREE.BoxGeometry(w, len, d), color, x || 0, (y0 || 0) + len / 2, z || 0);
  }
  function shaft(r, len, color, y0) {
    return mesh(new THREE.CylinderGeometry(r, r, len, 6), color || h, 0, (y0 || 0) + len / 2, 0);
  }
  function orb(r, color, y, x, z) {
    return glowBox(r * 1.6, r * 1.6, r * 1.6, color, x || 0, y, z || 0, 0.55);
  }

  const mount = group(0, -0.07, 0.01);

  // ---- Ranged, held in the left hand ----
  if (k === 'shortbow' || k === 'longbow') {
    arms.l.wrist.add(mount);
    const bow = new THREE.Group();
    mount.add(bow);
    const half = k === 'longbow' ? 0.6 : 0.46;
    const limb = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, -half), new THREE.Vector3(0, -0.22, 0), new THREE.Vector3(0, 0, half));
    const limbColor = spec.crystal ? m : shift(m, 24);
    const limbMesh = blade(new THREE.TubeGeometry(limb, 12, spec.twisted ? 0.045 : 0.034, 5, false), limbColor, 0, 0, 0);
    if (spec.crystal) {
      limbMesh.material.transparent = true;
      limbMesh.material.opacity = 0.85;
      limbMesh.material.userData.keepTransparent = true;
    }
    if (spec.g) {
      limbMesh.material.emissive.set(spec.g);
      markGlow(limbMesh, 0.3);
    }
    bow.add(limbMesh);
    bow.add(box(0.05, 0.05, 0.1, '#3e2a0c', 0, -0.1, 0));
    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -half), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, half)]);
    const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#efe4c8' }));
    bow.add(string);
    const arrow = box(0.015, 0.5, 0.015, '#c4a56a', 0, -0.17, 0);
    arrow.add(box(0.03, 0.06, 0.03, (look.spec.ammo && look.spec.ammo.c) || '#9aa3ad', 0, -0.27, 0));
    bow.add(arrow);
    return {
      pose(p) {
        // Hanging, the bow sits upright at the hip. Aimed, it stands upright in front of the face.
        bow.rotation.x = (Math.PI / 2) * (1 - p.aim);
        const pull = 0.06 + p.draw * 0.3;
        const pos = string.geometry.attributes.position;
        pos.setY(1, pull);
        pos.needsUpdate = true;
        arrow.visible = p.draw > 0.15;
        arrow.position.y = pull - 0.25;
      },
    };
  }

  if (k === 'crossbow' || k === 'ballista' || k === 'blowpipe' || k === 'atlatl') {
    // These point along the arm: down at rest, at the target when the arm comes up.
    arms.l.wrist.add(mount);
    const big = k === 'ballista';
    if (k === 'blowpipe') {
      mount.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.7, 6), m, 0, -0.2, 0));
      mount.add(box(0.06, 0.1, 0.08, h, 0, 0.05, 0));
      mount.add(box(0.05, 0.08, 0.06, '#d9d0c0', 0, -0.05, 0.06));
      return null;
    }
    if (k === 'atlatl') {
      mount.add(shaft(0.02, 0.5, h, -0.45));
      mount.add(box(0.05, 0.06, 0.05, m, 0, -0.46, 0.03));
      if (spec.g) mount.add(glowBox(0.03, 0.03, 0.03, spec.g, 0, -0.1, 0.03, 0.6));
      return null;
    }
    const len = big ? 0.85 : 0.5;
    mount.add(box(big ? 0.1 : 0.07, len, big ? 0.1 : 0.07, h, 0, -len / 2 + 0.1, 0));
    const span = big ? 0.75 : 0.5;
    const arms2 = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-span / 2, 0, 0.02), new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(span / 2, 0, 0.02));
    const limb = blade(new THREE.TubeGeometry(arms2, 8, big ? 0.04 : 0.03, 5, false), m, 0, -len + 0.14, 0);
    if (spec.g) {
      limb.material.emissive.set(spec.g);
      markGlow(limb, 0.35);
    }
    mount.add(limb);
    if (big) {
      mount.add(box(0.04, 0.3, 0.04, m, 0.12, -0.3, 0));
      mount.add(box(0.04, 0.3, 0.04, m, -0.12, -0.3, 0));
    }
    return null;
  }

  // ---- Claws: one set on each hand ----
  if (k === 'claws') {
    ['l', 'r'].forEach((side) => {
      const c = group(0, -0.08, 0.04, arms[side].wrist);
      c.rotation.x = 1.3;
      [-0.035, 0, 0.035].forEach((x) => {
        const claw = blade(new THREE.ConeGeometry(0.018, 0.26, 4), m, x, 0.13, 0);
        claw.rotation.x = 0.25;
        c.add(claw);
      });
    });
    return null;
  }

  arms.r.wrist.add(mount);

  // ---- Magic ----
  if (k === 'staff' || k === 'battlestaff' || k === 'wand' || k === 'trident' || k === 'sotd' || k === 'nightmare' ||
      k === 'sang' || k === 'shadow' || k === 'iban' || k === 'slayerstaff') {
    const wand = k === 'wand';
    mount.rotation.x = wand ? 1.0 : 0.22;
    const len = wand ? 0.42 : k === 'shadow' ? 1.0 : 1.2;
    const low = wand ? -0.05 : -0.38;
    const thick = k === 'battlestaff' || k === 'nightmare' ? 0.036 : 0.028;
    mount.add(mesh(new THREE.CylinderGeometry(thick, thick + 0.004, len, 6), m, 0, low + len / 2, 0));
    const top = low + len;
    const o = spec.o || '#c8a0ff';
    if (k === 'staff') {
      mount.add(orb(0.05, o, top + 0.04));
      if (spec.head === 'ancient') [1, -1].forEach((s) => mount.add(box(0.12, 0.03, 0.02, '#8a6ab8', s * 0.07, top - 0.02, 0)));
      if (spec.head === 'ahrim') mount.add(mesh(new THREE.ConeGeometry(0.04, 0.14, 4), '#2a2a2a', 0, top + 0.14, 0));
    }
    if (k === 'battlestaff') {
      [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]].forEach(([x, z]) => mount.add(box(0.02, 0.1, 0.02, spec.mystic ? '#c8c8c8' : shift(m, 30), x, top + 0.02, z)));
      mount.add(orb(0.05, o, top + 0.05));
    }
    if (k === 'wand') mount.add(spec.kodai ? orb(0.045, o, top + 0.06) : orb(0.04, o, top + 0.03));
    if (k === 'trident') {
      [-0.07, 0, 0.07].forEach((x) => mount.add(box(0.022, x ? 0.16 : 0.22, 0.022, m, x, top + (x ? 0.08 : 0.11), 0)));
      mount.add(box(0.16, 0.025, 0.025, m, 0, top, 0));
      mount.add(orb(0.03, o, top + 0.05));
    }
    if (k === 'sotd' || k === 'slayerstaff') {
      mount.add(box(0.09, 0.09, 0.09, k === 'slayerstaff' ? '#d8d0c0' : shift(m, 20), 0, top + 0.03, 0));
      mount.add(orb(0.035, o, top + 0.12));
      if (k === 'sotd') [1, -1].forEach((s) => mount.add(box(0.025, 0.14, 0.025, shift(m, 20), s * 0.06, top + 0.1, 0)));
    }
    if (k === 'nightmare') {
      [[0.06, 0], [-0.06, 0], [0, 0.06], [0, -0.06]].forEach(([x, z]) => mount.add(box(0.025, 0.18, 0.025, shift(m, 25), x, top + 0.08, z)));
      mount.add(orb(0.055, o, top + 0.09));
    }
    if (k === 'sang') {
      [1, -1].forEach((s) => {
        const prong = box(0.025, 0.2, 0.025, '#5a1a1a', s * 0.06, top + 0.08, 0);
        prong.rotation.z = -s * 0.35;
        mount.add(prong);
      });
      mount.add(orb(0.055, o, top + 0.1));
    }
    if (k === 'shadow') {
      mount.add(orb(0.07, o, top + 0.1));
      const ring = mesh(new THREE.TorusGeometry(0.12, 0.015, 4, 12), m, 0, top + 0.1, 0);
      ring.rotation.x = Math.PI / 2;
      mount.add(ring);
    }
    if (k === 'iban') {
      const hook = box(0.03, 0.18, 0.03, m, 0.05, top + 0.06, 0);
      hook.rotation.z = -0.8;
      mount.add(hook);
      mount.add(orb(0.035, o, top + 0.1, 0.1));
    }
    return null;
  }

  // ---- Melee ----
  const tilt = { greataxe: 0.95, maul: 0.95, godsword: 1.0, halberd: 0.55, scythe: 0.55, spear: 1.2, bludgeon: 1.0, axe: 0.9 };
  mount.rotation.x = tilt[k] != null ? tilt[k] : 1.15;
  if (spec.magic) mount.rotation.x = 0.4;

  if (k === 'greataxe' || k === 'maul' || k === 'halberd' || k === 'scythe' || k === 'spear' || k === 'bludgeon' || k === 'axe') {
    const long = k === 'halberd' || k === 'scythe' || k === 'spear';
    const len = long ? 1.35 : k === 'axe' ? 0.85 : 0.95;
    mount.add(shaft(k === 'maul' ? 0.035 : 0.028, len, h, long ? -0.35 : -0.15));
    const top = (long ? -0.35 : -0.15) + len;
    if (k === 'greataxe') {
      [1, -1].forEach((s) => mount.add(blade(taperGeo(0.04, 0.04, 0.3, 0.02, 0.02), m, s * 0.14, top - 0.15, 0)));
      [1, -1].forEach((s) => mount.add(bar(0.2, 0.06, 0.03, m, top - 0.18, s * 0.08)));
    }
    if (k === 'maul') mount.add(blade(new THREE.BoxGeometry(0.3, 0.2, 0.2), m, 0, top, 0));
    if (k === 'bludgeon') {
      mount.add(blade(new THREE.CylinderGeometry(0.08, 0.05, 0.4, 6), m, 0, top - 0.1, 0));
      if (spec.g) mount.add(glowBox(0.05, 0.05, 0.05, spec.g, 0, top + 0.12, 0, 0.6));
    }
    if (k === 'spear') {
      mount.add(blade(new THREE.ConeGeometry(0.05, 0.26, 4), m, 0, top + 0.12, 0));
      if (spec.g) mount.add(glowBox(0.04, 0.04, 0.04, spec.g, 0, top - 0.02, 0, 0.7));
    }
    if (k === 'halberd') {
      mount.add(blade(new THREE.ConeGeometry(0.035, 0.22, 4), m, 0, top + 0.1, 0));
      mount.add(blade(taperGeo(0.24, 0.12, 0.22, 0.02, 0.02), m, 0.12, top - 0.1, 0));
      if (spec.g) mount.add(glowBox(0.03, 0.18, 0.025, spec.g, 0.2, top - 0.1, 0, 0.6));
    }
    if (k === 'scythe' || k === 'axe') {
      const reach = k === 'scythe' ? 0.6 : 0.32;
      for (let i = 0; i < 4; i++) {
        const seg = blade(new THREE.BoxGeometry(reach / 4 + 0.02, 0.06 - i * 0.008, 0.02), m, 0, 0, 0);
        seg.position.set(0.04 + (i + 0.5) * (reach / 4), top - 0.04 - i * i * 0.025, 0);
        seg.rotation.z = -0.15 - i * 0.18;
        mount.add(seg);
      }
      if (spec.g) mount.add(glowBox(0.04, 0.04, 0.04, spec.g, 0, top, 0, 0.6));
    }
    return null;
  }

  mount.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 5), h, 0, 0, 0));
  const guard = (w, color) => mount.add(box(w, 0.03, 0.05, color || shift(m, 30), 0, 0.075, 0));

  if (k === 'mace' || k === 'warhammer' || k === 'hammer' || k === 'flail') {
    const len = spec.heavy ? 0.5 : 0.4;
    mount.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 5), h, 0, len / 2, 0));
    if (k === 'mace') {
      mount.add(blade(new THREE.IcosahedronGeometry(spec.heavy ? 0.1 : 0.085, 0), m, 0, len + 0.04, 0));
      [0, Math.PI / 2].forEach((r) => {
        const fin = bar(0.24, 0.07, 0.02, m, len + 0.005);
        fin.rotation.y = r;
        mount.add(fin);
      });
      if (spec.g) mount.add(glowBox(0.04, 0.04, 0.04, spec.g, 0, len + 0.14, 0, 0.5));
    }
    if (k === 'warhammer' || k === 'hammer') mount.add(blade(new THREE.BoxGeometry(k === 'warhammer' ? 0.26 : 0.18, 0.12, 0.12), m, 0, len + 0.04, 0));
    if (k === 'flail') {
      for (let i = 0; i < 3; i++) mount.add(box(0.025, 0.04, 0.025, '#8a8a8a', 0.03 * i, len + 0.03 + i * 0.045, 0));
      mount.add(blade(new THREE.IcosahedronGeometry(0.07, 0), m, 0.1, len + 0.16, 0));
    }
    return null;
  }

  if (k === 'whip') {
    mount.add(mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.2, 5), h, 0, 0.1, 0));
    let parent = group(0, 0.2, 0, mount);
    for (let i = 0; i < 7; i++) {
      parent.add(blade(new THREE.BoxGeometry(0.03 - i * 0.002, 0.12, 0.03 - i * 0.002), m, 0, 0.06, 0));
      const next = group(0, 0.12, 0, parent);
      next.rotation.x = 0.28;
      parent = next;
    }
    return null;
  }

  if (k === 'macuahuitl') {
    mount.add(bar(0.09, 0.5, 0.025, h, 0.08));
    for (let i = 0; i < 5; i++) {
      [1, -1].forEach((s) => mount.add(blade(new THREE.BoxGeometry(0.03, 0.05, 0.02), m, s * 0.055, 0.14 + i * 0.09, 0)));
    }
    if (spec.g) mount.add(glowBox(0.03, 0.03, 0.03, spec.g, 0, 0.6, 0, 0.6));
    return null;
  }

  if (k === 'scimitar' || k === 'saeldor' || k === 'voidwaker') {
    guard(0.16, k === 'voidwaker' ? h : null);
    const pieces = k === 'scimitar' ? [[0.12, 0], [0.32, -0.12], [0.5, -0.32]] : [[0.13, 0], [0.35, -0.04], [0.56, -0.08]];
    pieces.forEach(([y, rot], i) => {
      const seg = blade(new THREE.BoxGeometry(k === 'voidwaker' ? 0.07 : 0.055, 0.22, 0.016), m, -i * 0.025, 0.09 + y, 0);
      seg.rotation.z = rot;
      if (k === 'saeldor') {
        seg.material.transparent = true;
        seg.material.opacity = 0.8;
        seg.material.userData.keepTransparent = true;
      }
      mount.add(seg);
    });
    if (spec.g) mount.add(glowBox(0.02, 0.5, 0.02, spec.g, -0.02, 0.38, 0.012, 0.5));
    return null;
  }

  if (k === 'godsword') {
    mount.add(box(0.26, 0.06, 0.07, h, 0, 0.09, 0));
    if (spec.g) mount.add(glowBox(0.05, 0.05, 0.05, spec.g, 0, 0.09, 0.04, 0.6));
    mount.add(bar(0.11, 0.9, 0.025, m, 0.12));
    const tip = blade(new THREE.ConeGeometry(0.075, 0.14, 4), m, 0, 1.09, 0);
    tip.scale.z = 0.3;
    mount.add(tip);
    return null;
  }

  if (k === 'rapier') {
    mount.add(mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10), h, 0, 0.08, 0));
    mount.add(bar(0.022, 0.75, 0.012, m, 0.09));
    return null;
  }

  if (k === 'fang') {
    guard(0.12, h);
    mount.add(blade(taperGeo(0.1, 0.02, 0.55, 0.02, 0.01), m, 0, 0.37, 0));
    return null;
  }

  // Straight blades: dagger, sword, longsword.
  const len = k === 'dagger' ? 0.26 : k === 'longsword' ? 0.72 : 0.54;
  guard(k === 'dagger' ? 0.1 : 0.18);
  mount.add(bar(0.05, len, 0.016, m, 0.09));
  const tipMesh = blade(new THREE.ConeGeometry(0.035, 0.08, 4), shift(m, 40), 0, 0.09 + len + 0.04, 0);
  tipMesh.scale.z = 0.35;
  mount.add(tipMesh);
  if (spec.g) mount.add(glowBox(0.02, len * 0.8, 0.02, spec.g, 0, 0.09 + len / 2, 0.01, 0.5));
  return null;
}
