// The 3D spoop on /spoop.html: the same model the 3D raid uses, turning slowly in the hero.
// /js/spoop.js redraws the hero on every update. It leaves { container, spoop } on
// window.__spoopHero and calls SpoopPortrait.show(). One renderer is kept and its canvas moves
// into each new hero, so the model only rebuilds when the spoop or their gear changes.
import * as THREE from 'three';
import { buildSpoop, attackKind, attackDuration } from './character.js';

function gearKey(spoop) {
  const eq = (spoop && spoop.equipped) || {};
  return (spoop && spoop.name) + '|' + Object.keys(eq).sort().map((slot) => {
    const item = eq[slot];
    return item ? slot + ':' + (item.osrsId || item.baseId) + ':' + (item.quality || '') : '';
  }).join(',');
}

function fighterOf(spoop) {
  const weapon = spoop.equipped && spoop.equipped.weapon;
  return { name: spoop.name, equipped: spoop.equipped || {}, style: (weapon && weapon.style) || spoop.build || 'melee' };
}

function sparkleTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,235,1)');
  grad.addColorStop(0.4, 'rgba(255,230,150,0.6)');
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function create() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'spoop-sprite spoop-sprite-3d';
  canvas.setAttribute('role', 'img');

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff4e0', '#3a2a18', 1.6));
  const key = new THREE.DirectionalLight('#fff1d6', 1.8);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9ac8ff', 0.9);
  rim.position.set(-3, 2, -3);
  scene.add(rim);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(30, 2 / 3, 0.1, 20);
  camera.position.set(0, 1.05, 4.1);
  camera.lookAt(0, 0.86, 0);

  const turntable = new THREE.Group();
  scene.add(turntable);

  // Sparkles that swirl up the spoop when they put something new on.
  const sparkMat = new THREE.SpriteMaterial({ map: sparkleTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const sparks = Array.from({ length: 26 }, (_, i) => {
    const s = new THREE.Sprite(sparkMat.clone());
    s.userData = { a: (i / 26) * Math.PI * 2, d: Math.random() * 0.4 };
    s.visible = false;
    scene.add(s);
    return s;
  });

  let model = null;
  let key2 = '';
  let yaw = 0.5;
  let spin = 0;
  let flourish = -10;
  let clock = 0;
  let nextSwing = 3;
  let swing = null;
  let dragging = null;
  let visible = true;

  canvas.addEventListener('pointerdown', (ev) => {
    dragging = { x: ev.clientX };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    yaw += (ev.clientX - dragging.x) * 0.02;
    dragging.x = ev.clientX;
  });
  const endDrag = () => { dragging = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  }).observe(canvas);

  function setSpoop(spoop) {
    const next = gearKey(spoop);
    if (next === key2) return;
    const sameSpoop = model && key2.split('|')[0] === next.split('|')[0];
    key2 = next;
    if (model) turntable.remove(model.root);
    model = buildSpoop(fighterOf(spoop));
    turntable.add(model.root);
    canvas.setAttribute('aria-label', spoop.name + ', in 3D');
    if (sameSpoop) {
      flourish = clock;
      spin = Math.PI * 2;
    }
  }

  function resize() {
    const w = canvas.clientWidth || 112;
    const h = canvas.clientHeight || 168;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    requestAnimationFrame(frame);
    if (!model || !visible || document.hidden || !canvas.isConnected) return;
    clock += dt;
    if (!dragging) yaw += dt * 0.45;
    if (spin > 0) {
      const step = Math.min(spin, dt * 9);
      spin -= step;
      yaw += step;
    }
    turntable.rotation.y = yaw;

    // Show the weapon off now and then.
    if (!swing && clock > nextSwing) {
      const kind = attackKind(model.look, model.look.style);
      swing = { kind, start: clock, dur: attackDuration(kind) * 1.4 };
    }
    let attack = null;
    if (swing) {
      const u = (clock - swing.start) / swing.dur;
      if (u >= 1) {
        swing = null;
        nextSwing = clock + 5 + Math.random() * 3;
      } else attack = { kind: swing.kind, u };
    }
    model.pose({ walk: 0, move: 0, attack, hurt: 0, breathe: clock });

    const f = clock - flourish;
    sparks.forEach((s, i) => {
      const on = f >= 0 && f < 1.3;
      s.visible = on;
      if (!on) return;
      const a = s.userData.a + f * 5;
      const r = 0.55 - f * 0.2 + s.userData.d * 0.2;
      s.position.set(Math.cos(a) * r, (i / sparks.length) * 0.5 + f * 1.4, Math.sin(a) * r);
      const sc = 0.18 * (1 - f / 1.3) + 0.05;
      s.scale.set(sc, sc, 1);
    });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    show(container, spoop) {
      if (!container || !spoop) return;
      const flat = container.querySelector('canvas:not(.spoop-sprite-3d)');
      if (flat) flat.hidden = true;
      if (canvas.parentNode !== container) container.appendChild(canvas);
      resize();
      setSpoop(spoop);
    },
  };
}

const portrait = create();
if (portrait) {
  window.SpoopPortrait = portrait;
  const pending = window.__spoopHero;
  if (pending) portrait.show(pending.container, pending.spoop);
}
