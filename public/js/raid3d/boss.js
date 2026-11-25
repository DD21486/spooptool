// Bosses stay 2D: an upright card that turns to face the camera, standing on its own shadow.
import * as THREE from 'three';

// World-unit heights (width follows the sprite), and where breath and spit leave the sprite in card
// space: x across, with -0.5 the side the art faces, y up from the feet.
const BOSS = {
  elvarg: { h: 3.6, mouth: [-0.44, 0.14] },
  mole: { h: 2.2, mouth: [-0.4, 0.22] },
  brutus: { h: 3.0, mouth: [-0.38, 0.6] },
  scurrius: { h: 3.2, mouth: [-0.38, 0.62] },
  chaos: { h: 2.6, mouth: [0, 0.5] },
  leviathan: { h: 4.6, mouth: [-0.1, 0.7] },
  obor: { h: 4.2, mouth: [-0.15, 0.85] },
  bryophyta: { h: 3.6, mouth: [-0.1, 0.85] },
  kbd: { h: 3.0, mouth: [-0.38, 0.38] },
  vorkath: { h: 2.6, mouth: [-0.42, 0.45] },
  kq: { h: 3.0, mouth: [-0.03, 0.8] },
};
// Minions are sized by their art, since a growthling fights under the rat's name.
const MINION = { 'Giant_rat.png': 0.9, 'Growthling.png': 1.15, 'Cow.png': 1.4, 'Venenatis_spiderling.png': 0.8 };
const loader = new THREE.TextureLoader();

export function buildBoss(fighter) {
  const kind = String(fighter.monster || '');
  const art = String(fighter.sprite || '').split('/').pop();
  const conf = BOSS[kind] || {};
  const height = MINION[art] || conf.h || (fighter.minion ? 1.1 : 3);
  const root = new THREE.Group();
  const holder = new THREE.Group();
  root.add(holder);

  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const card = new THREE.Mesh(geo, material);
  card.castShadow = true;
  card.scale.set(height, height, 1);
  holder.add(card);

  const state = { width: height, height, ready: false, src: '' };
  const textures = new Map();
  function apply(tex) {
    material.map = tex;
    material.needsUpdate = true;
    card.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.4, side: THREE.DoubleSide,
    });
    const img = tex.image;
    const aspect = img && img.height ? img.width / img.height : 1;
    state.width = height * aspect;
    card.scale.set(state.width, height, 1);
    state.ready = true;
  }
  // Swap the art, for a boss that changes form. Textures are kept so scrubbing back is instant.
  function setSprite(src) {
    if (!src || src === state.src) return;
    state.src = src;
    if (textures.has(src)) {
      if (textures.get(src)) apply(textures.get(src));
      return;
    }
    textures.set(src, null);
    loader.load(src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      textures.set(src, tex);
      if (state.src === src) apply(tex);
    });
  }
  setSprite(fighter.sprite || '/assets/bosses/Brutus.png');

  // A mound of dirt for the mole to sit in while it is underground.
  const mound = new THREE.Mesh(
    new THREE.ConeGeometry(state.width * 0.32 + 0.6, 0.45, 9, 1),
    new THREE.MeshLambertMaterial({ color: '#6b4a2a', flatShading: true }),
  );
  mound.position.y = 0.12;
  mound.scale.y = 0.6;
  mound.visible = false;
  mound.receiveShadow = true;
  root.add(mound);

  const tint = new THREE.Color();
  const lunge = new THREE.Vector3();
  const nativeLeft = fighter.face === 'left';
  let flip = 1;

  holder.rotation.order = 'YXZ';

  // state: { yaw, pitch, faceRight, wind 0..1, strike 0..1 | null, lungeDir: Vector3, hurt 0..1, enraged, sink 0..1, death 0..1 | null, t }
  function pose(s) {
    root.rotation.y = 0;
    holder.rotation.y = s.yaw;
    // Lean the card back toward a high camera so the sprite isn't squashed, but keep its feet planted.
    holder.rotation.x = -Math.max(0, (s.pitch || 0)) * 0.75;
    const wantFlip = (s.faceRight ? 1 : -1) * (nativeLeft ? -1 : 1);
    flip += (wantFlip - flip) * 0.35;
    if (Math.abs(flip) < 0.08) flip = wantFlip * 0.08;

    let sx = 1;
    let sy = 1;
    lunge.set(0, 0, 0);
    if (s.wind > 0) {
      sy -= 0.07 * s.wind;
      sx += 0.05 * s.wind;
    }
    if (s.strike != null) {
      const k = Math.sin(Math.min(1, s.strike) * Math.PI);
      sy += 0.06 * k;
      sx -= 0.03 * k;
      if (s.lungeDir) lunge.copy(s.lungeDir).multiplyScalar(0.55 * k);
    }
    if (!s.death) {
      const breathe = Math.sin((s.t || 0) * 2.4) * 0.012;
      sy += breathe;
    }
    card.scale.set(state.width * sx * flip, height * sy, 1);
    card.position.set(0, 0, 0);
    holder.position.copy(lunge);

    const sink = Math.max(s.sink || 0, s.death ? Math.min(1, s.death) * 0.25 : 0);
    holder.position.y = -height * 0.92 * sink;
    mound.visible = (s.sink || 0) > 0.02;
    mound.scale.set(1, 0.4 + 0.6 * (s.sink || 0), 1);

    tint.setRGB(1, 1, 1);
    if (s.enraged) {
      const pulse = 0.5 + 0.5 * Math.sin((s.t || 0) * 7);
      tint.setRGB(1, 0.78 - 0.12 * pulse, 0.72 - 0.12 * pulse);
    }
    if (s.wind > 0) tint.lerp(new THREE.Color(1, 0.86, 0.6), 0.35 * s.wind);
    if (s.hurt > 0) tint.lerp(new THREE.Color(1, 0.45, 0.45), s.hurt);
    if (s.death) {
      const fade = Math.max(0, 1 - Math.max(0, s.death - 0.6) / 1.2);
      tint.multiplyScalar(0.45 + 0.55 * fade);
      material.opacity = fade;
      card.castShadow = fade > 0.2;
    } else {
      material.opacity = 1;
      card.castShadow = true;
    }
    material.color.copy(tint);
  }

  const mouthAt = conf.mouth || [-0.4, 0.5];
  function mouthPoint(out) {
    return card.localToWorld((out || new THREE.Vector3()).set(mouthAt[0], mouthAt[1], 0.35));
  }

  return { root, pose, height, mouthPoint, setSprite, minion: !!MINION[art], get width() { return state.width; } };
}
