// ============================================================================
// Cozy Room — gameplay layer
//   • five modelled plush pals hidden in the room (built from ctx.collectibleSpots)
//   • sparkle ambience, pickup bursts, tiny idle animations
//   • intro / pause / photo / completion flow, HUD wiring, procedural audio hookup
// ============================================================================
import * as THREE from 'three';
import kit from '../world/kit.js';
import { createAudio } from '../core/audio.js';
import { createUI } from '../ui/hud.js';

const FALLBACK_SPOTS = [
  { id: 'star', plush: 'star', name: 'Twinkle', position: [1.72, 0.79, 1.62], rotationY: -0.6 },
  { id: 'cat', plush: 'cat', name: 'Mochi', position: [1.70, 1.02, -0.82], rotationY: -1.2 },
  { id: 'bunny', plush: 'bunny', name: 'Clover', position: [1.33, 0.36, 2.05], rotationY: 0.5 },
  { id: 'duck', plush: 'duck', name: 'Pip', position: [0.58, 1.80, -2.12], rotationY: 0.2 },
  { id: 'cloud', plush: 'cloud', name: 'Puff', position: [0.52, 0.63, -0.40], rotationY: 0.1 }
];

const NAMES = { star: 'Twinkle', cat: 'Mochi', bunny: 'Clover', duck: 'Pip', cloud: 'Puff' };
const PLUSH_SCALE = 1.3;   // all pals read clearly at play distance
const MOOD_FALLBACK = { golden: 'Golden hour', day: 'Soft daylight', dusk: 'Lavender dusk', night: 'Quiet night' };
const PICK_LINES = [
  (n) => `“${n}” is coming home with you ✨`,
  (n) => `You tucked “${n}” into your pocket`,
  (n) => `“${n}” gives a tiny happy wiggle`,
  (n) => `Found “${n}” — soft and squishy`,
  (n) => `“${n}” squeaks with joy`
];

/* -------------------------------------------------------------- tiny utils */
function starShape(outer = 0.075, inner = 0.042) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function makeSparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, 'rgba(255,255,255,1)');
  rad.addColorStop(0.22, 'rgba(255,248,226,0.95)');
  rad.addColorStop(0.5, 'rgba(255,214,160,0.22)');
  rad.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  // little four-point flare so sparkles read as stars, not blobs
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,252,240,0.55)';
  g.lineWidth = 1.7;
  g.beginPath();
  g.moveTo(32, 6); g.lineTo(32, 58);
  g.moveTo(6, 32); g.lineTo(58, 32);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/* ============================================================================ */
export function createGame(ctx) {
  const scene = ctx.scene;
  const M = ctx.materials || {};
  const params = new URLSearchParams(location.search);
  const autoStart = params.get('nostart') === '1' || params.has('cam') || params.get('hud') === '0';

  const audio = createAudio();
  ctx.audio = audio;

  const state = {
    started: autoStart,
    found: 0,
    total: 0,
    photo: false,
    celebrating: false,
    complete: false,
    celebrateAt: 0
  };

  const plushies = [];
  const pops = [];
  const bursts = [];
  const sparkTex = makeSparkTexture();

  /* ---------------------------------------------------------- materials */
  const matCache = new Map();
  const plushMat = (hex) => {
    if (!matCache.has(hex)) {
      let m;
      if (M.plush) {
        m = M.plush.clone();
        m.color.setHex(hex);
      } else {
        m = new THREE.MeshPhysicalMaterial({
          color: hex, roughness: 0.94, metalness: 0,
          sheen: 0.9, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff)
        });
      }
      matCache.set(hex, m);
    }
    return matCache.get(hex);
  };
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x3d3149, roughness: 0.32, metalness: 0.05 });
  const shineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8ea, emissiveIntensity: 0.7, roughness: 0.25 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xff9dba, roughness: 0.85, transparent: true, opacity: 0.7, depthWrite: false });
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xee8fae, roughness: 0.5 });
  const pinkMat = new THREE.MeshStandardMaterial({ color: 0xf6a8c2, roughness: 0.78 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xffae55, roughness: 0.55 });
  const goldMat = M.gold || new THREE.MeshStandardMaterial({ color: 0xd9b46a, roughness: 0.34, metalness: 0.6 });
  const creamMat = plushMat(0xfff1dc);

  /* ----------------------------------------------------- shared helpers */
  const mesh = (parent, geo, mat, pos, opts = {}) => kit.mesh(geo, mat, {
    pos, rot: opts.rot, scale: opts.scale, parent,
    cast: opts.cast !== false, receive: opts.receive !== false
  });

  function beadEye(parent, x, y, z, r = 0.0085, rotZ = 0) {
    const e = mesh(parent, kit.sphereGeo(r, 14), eyeMat, [x, y, z], { cast: false });
    e.scale.set(1, 1.1, 0.6);
    e.rotation.z = rotZ;
    const sh = mesh(parent, kit.sphereGeo(r * 0.33, 10), shineMat, [x + r * 0.3, y + r * 0.42, z + r * 0.42], { cast: false });
    return e;
  }
  function closedEye(parent, x, y, z, r = 0.0075) {
    const g = new THREE.TorusGeometry(r, r * 0.2, 5, 10, Math.PI);
    const m = mesh(parent, g, eyeMat, [x, y, z], { rot: [0, 0, Math.PI], cast: false });
    return m;
  }
  function blush(parent, x, y, z, s = 0.0095) {
    const b = mesh(parent, kit.sphereGeo(s, 12), blushMat, [x, y, z], { cast: false, receive: false });
    b.scale.set(1.2, 0.62, 0.42);
    return b;
  }
  function smile(parent, x, y, z, r = 0.008) {
    return mesh(parent, new THREE.TorusGeometry(r, r * 0.22, 5, 10, Math.PI), eyeMat, [x, y, z], {
      rot: [0, 0, Math.PI], cast: false, receive: false
    });
  }

  /* ------------------------------------------------------ plush builders */
  function buildStar() {
    const g = kit.group('plush-star');
    const body = plushMat(0xffdf96);
    const geo = kit.extrudeShape(starShape(0.075, 0.043), { depth: 0.042, bevel: 0.014, curveSegments: 4 });
    mesh(g, geo, body, [0, 0.063, 0]);
    // stubby arms + feet
    const arm = kit.capsuleGeo(0.011, 0.018, 4, 10);
    for (const s of [-1, 1]) {
      const a = mesh(g, arm, body, [s * 0.071, 0.055, 0.004], { rot: [0, 0, s * 1.15] });
      a.scale.set(1, 1, 0.85);
      const f = mesh(g, kit.sphereGeo(0.0125, 12), body, [s * 0.026, 0.013, 0.012]);
      f.scale.set(1, 0.78, 1.1);
    }
    beadEye(g, -0.023, 0.073, 0.034);
    beadEye(g, 0.023, 0.073, 0.034);
    blush(g, -0.041, 0.056, 0.028, 0.0095);
    blush(g, 0.041, 0.056, 0.028, 0.0095);
    smile(g, 0, 0.060, 0.0365, 0.0075);
    // a tiny embroidered star on the belly? keep the silhouette clean
    return { group: g, height: 0.16, glow: 0xffdc94 };
  }

  function buildCat() {
    const g = kit.group('plush-cat');
    const body = plushMat(0xd9c9f4);
    const b = mesh(g, kit.sphereGeo(0.052, 22), body, [0, 0.054, 0]);
    b.scale.set(1, 1.02, 0.95);
    const h = mesh(g, kit.sphereGeo(0.046, 22), body, [0, 0.115, 0.005]);
    h.scale.set(1, 0.95, 0.97);
    // ears
    for (const s of [-1, 1]) {
      const ear = mesh(g, kit.cylGeo(0.0008, 0.019, 0.036, 12), body, [s * 0.027, 0.155, 0.002], { rot: [0, 0, s * 0.3] });
      ear.scale.set(1, 1, 0.75);
      const inner = mesh(g, kit.cylGeo(0.0008, 0.011, 0.024, 10), pinkMat, [s * 0.026, 0.153, 0.012], { rot: [0, 0, s * 0.3], cast: false });
      inner.scale.set(1, 1, 0.45);
    }
    // muzzle + face
    const mz = mesh(g, kit.sphereGeo(0.019, 14), creamMat, [0, 0.104, 0.043], { cast: false });
    mz.scale.set(1.15, 0.72, 0.5);
    beadEye(g, -0.0185, 0.121, 0.042);
    beadEye(g, 0.0185, 0.121, 0.042);
    blush(g, -0.032, 0.106, 0.036, 0.009);
    blush(g, 0.032, 0.106, 0.036, 0.009);
    mesh(g, kit.sphereGeo(0.0042, 10), noseMat, [0, 0.111, 0.055], { cast: false });
    smile(g, 0, 0.103, 0.056, 0.0052);
    // paws
    for (const s of [-1, 1]) {
      const p = mesh(g, kit.sphereGeo(0.0135, 12), creamMat, [s * 0.021, 0.014, 0.038]);
      p.scale.set(1, 0.72, 1.25);
    }
    // tail
    const tail = kit.tube([
      [0.032, 0.038, -0.036], [0.058, 0.05, -0.052], [0.062, 0.088, -0.045], [0.045, 0.103, -0.026]
    ], 0.0085, body, 18, 8);
    tail.castShadow = true; tail.receiveShadow = true;
    g.add(tail);
    // little bow at the neck
    for (const s of [-1, 1]) {
      const w = mesh(g, kit.sphereGeo(0.0095, 10), pinkMat, [s * 0.011, 0.087, 0.045]);
      w.scale.set(1.4, 0.9, 0.55);
    }
    mesh(g, kit.sphereGeo(0.005, 10), pinkMat, [0, 0.088, 0.049], { cast: false });
    return { group: g, height: 0.18, glow: 0xffd9e8 };
  }

  function buildBunny() {
    const g = kit.group('plush-bunny');
    const body = plushMat(0xfff3e2);
    const b = mesh(g, kit.sphereGeo(0.048, 22), body, [0, 0.054, 0]);
    b.scale.set(1, 1.04, 0.95);
    const h = mesh(g, kit.sphereGeo(0.042, 22), body, [0, 0.113, 0.004]);
    h.scale.set(1, 0.97, 0.97);
    for (const s of [-1, 1]) {
      const ear = mesh(g, kit.capsuleGeo(0.014, 0.046, 4, 12), body, [s * 0.018, 0.171, -0.002], { rot: [-0.1, 0, s * 0.16] });
      ear.scale.set(1, 1, 0.72);
      const inner = mesh(g, kit.capsuleGeo(0.0072, 0.038, 3, 10), pinkMat, [s * 0.018, 0.171, 0.008], { rot: [-0.1, 0, s * 0.16], cast: false });
      inner.scale.set(1, 1, 0.4);
    }
    beadEye(g, -0.0165, 0.119, 0.038);
    beadEye(g, 0.0165, 0.119, 0.038);
    blush(g, -0.029, 0.105, 0.033, 0.0085);
    blush(g, 0.029, 0.105, 0.033, 0.0085);
    mesh(g, kit.sphereGeo(0.0042, 10), noseMat, [0, 0.109, 0.044], { cast: false });
    smile(g, 0, 0.102, 0.0435, 0.0048);
    for (const s of [-1, 1]) {
      const f = mesh(g, kit.sphereGeo(0.014, 12), body, [s * 0.022, 0.013, 0.03]);
      f.scale.set(1, 0.6, 1.4);
    }
    const t = mesh(g, kit.sphereGeo(0.0145, 12), body, [0, 0.042, -0.043]);
    t.scale.set(1, 1, 0.85);
    return { group: g, height: 0.2, glow: 0xffe3c6 };
  }

  function buildDuck() {
    const g = kit.group('plush-duck');
    const body = plushMat(0xffdc8d);
    const b = mesh(g, kit.sphereGeo(0.05, 22), body, [0, 0.056, 0]);
    b.scale.set(1, 1.03, 0.95);
    const h = mesh(g, kit.sphereGeo(0.035, 20), body, [0, 0.117, 0.012]);
    h.scale.set(1, 0.98, 0.98);
    // beak
    const beak = mesh(g, kit.cylGeo(0.001, 0.016, 0.032, 12), beakMat, [0, 0.114, 0.051], { rot: [Math.PI / 2, 0, 0] });
    beak.scale.set(1.25, 1, 0.62);
    // wings
    for (const s of [-1, 1]) {
      const w = mesh(g, kit.sphereGeo(0.023, 16), body, [s * 0.044, 0.062, 0.002], { rot: [0, 0, s * 0.28] });
      w.scale.set(0.34, 0.6, 0.9);
    }
    beadEye(g, -0.0135, 0.124, 0.038);
    beadEye(g, 0.0135, 0.124, 0.038);
    blush(g, -0.026, 0.112, 0.033, 0.0075);
    blush(g, 0.026, 0.112, 0.033, 0.0075);
    for (const s of [-1, 1]) {
      const f = mesh(g, kit.sphereGeo(0.013, 10), beakMat, [s * 0.017, 0.006, 0.024]);
      f.scale.set(1, 0.4, 1.5);
    }
    const tuft = mesh(g, kit.sphereGeo(0.0075, 10), body, [0, 0.152, 0.01]);
    tuft.scale.set(0.8, 1.25, 0.8);
    return { group: g, height: 0.16, glow: 0xffe7a6 };
  }

  function buildCloud() {
    const g = kit.group('plush-cloud');
    // Near-white top, pale blue under-belly: reads as a soft cloud, not a pebble.
    const topMat = plushMat(0xfdfeff);
    topMat.emissive.setHex(0x9dc2f0);
    topMat.emissiveIntensity = 0.055;
    const lowMat = plushMat(0xe8f2ff);
    lowMat.emissive.setHex(0x8fb5e8);
    lowMat.emissiveIntensity = 0.045;
    const S = 1;                          // sized by PLUSH_SCALE like every other pal
    const lobes = [
      [-0.056, 0.055, 0.000, 0.035, 1],
      [-0.030, 0.073, 0.002, 0.040, 0],
      [0.000, 0.081, 0.000, 0.038, 0],
      [0.031, 0.072, 0.002, 0.038, 0],
      [0.058, 0.054, 0.000, 0.033, 1],
      [-0.036, 0.043, 0.018, 0.031, 1],
      [0.000, 0.046, 0.024, 0.037, 0],   // front lobe carries the face
      [0.035, 0.041, 0.016, 0.030, 1],
      [0.000, 0.031, 0.004, 0.030, 1]    // little belly lobe, sits on the rug
    ];
    for (const [x, y, z, r, low] of lobes) {
      const l = mesh(g, kit.sphereGeo(r * S, 22), low ? lowMat : topMat, [x * S, y * S, z * S]);
      l.scale.set(1, 0.92, 0.8);
    }
    // tiny rounded feet so it plants on the rug
    for (const s of [-1, 1]) {
      const f = mesh(g, kit.sphereGeo(0.013 * S, 12), lowMat, [s * 0.021 * S, 0.008 * S, 0.02 * S]);
      f.scale.set(1, 0.6, 1);
    }
    // clear sleepy face: closed eyes, blush and a little smile, sitting on the
    // curved front lobe so nothing floats when seen from the side
    closedEye(g, -0.021 * S, 0.058 * S, 0.0465 * S, 0.0105 * S);
    closedEye(g, 0.021 * S, 0.058 * S, 0.0465 * S, 0.0105 * S);
    blush(g, -0.034 * S, 0.044 * S, 0.0385 * S, 0.0105 * S);
    blush(g, 0.034 * S, 0.044 * S, 0.0385 * S, 0.0105 * S);
    smile(g, 0, 0.0475 * S, 0.0538 * S, 0.0072 * S);
    // tiny golden star pinned on the cloud
    const star = mesh(g, kit.extrudeShape(starShape(0.015, 0.008), { depth: 0.005, bevel: 0.002, curveSegments: 3 }), goldMat, [0, 0.02 * S, 0.0445 * S]);
    star.rotation.z = 0.12;
    return {
      group: g, height: 0.15, glow: 0xe6f1ff,
      glowBase: 0.34, glowScale: 0.24,
      shadow: [0.21, 0.16, 0.36]
    };
  }

  const BUILDERS = { star: buildStar, cat: buildCat, bunny: buildBunny, duck: buildDuck, cloud: buildCloud };

  /* ----------------------------------------------------- plush placement */
  const plushRoot = new THREE.Group();
  plushRoot.name = 'plush-pals';
  scene.add(plushRoot);

  let contactMap = null;
  try { contactMap = ctx.texture?.('contact')?.map || ctx.textureLib?.get?.('contact')?.map || null; } catch { contactMap = null; }

  // one-time downward probe so every pal's contact disc lands on the actual
  // surface below it (rug, desk, sill…) instead of floating at its spawn y
  const groundRay = new THREE.Raycaster();
  const DOWN = new THREE.Vector3(0, -1, 0);
  function surfaceBelow(x, y, z) {
    try {
      groundRay.set(new THREE.Vector3(x, y + 0.4, z), DOWN);
      groundRay.far = 0.9;
      const hits = groundRay.intersectObjects(scene.children.filter((o) => o !== plushRoot), true);
      for (const h of hits) {
        if (!h.object.isMesh) continue;
        const mm = h.object.material;
        if (Array.isArray(mm) ? mm.some((m) => m && m.transparent) : (mm && mm.transparent)) continue;
        if (h.point.y > y + 0.03) continue;
        return h.point.y;
      }
    } catch { /* noop */ }
    return Math.max(0.004, y - 0.018);
  }

  function spotList() {
    const raw = Array.isArray(ctx.collectibleSpots) ? ctx.collectibleSpots.filter((s) => s && Array.isArray(s.position)) : [];
    const out = raw.slice(0, 5);
    // robust against a partially built world: fill any gaps with safe fallbacks
    const used = new Set(out.map((s) => s.id));
    for (const f of FALLBACK_SPOTS) {
      if (out.length >= 5) break;
      if (used.has(f.id)) continue;
      out.push(f);
    }
    return out.slice(0, 5);
  }

  function buildPlushie(spot, index) {
    const type = BUILDERS[spot.plush] ? spot.plush : FALLBACK_SPOTS[index % 5].plush;
    const built = BUILDERS[type]();
    const art = built.group;
    const group = kit.group('plush-root');
    art.scale.setScalar(PLUSH_SCALE);
    group.add(art);
    const [x, y, z] = spot.position;
    const baseY = Math.max(0.015, Number.isFinite(y) ? y : 0.015);
    group.position.set(Number.isFinite(x) ? x : 0, baseY, Number.isFinite(z) ? z : 0);
    // face the room centre unless the decor builder asked for something else
    const baseRot = Number.isFinite(spot.rotationY) ? spot.rotationY : Math.atan2(-group.position.x, -group.position.z);
    group.rotation.y = baseRot;
    plushRoot.add(group);

    // soft grounding disc so the plush feels planted on its surface
    if (contactMap) {
      const shW = built.shadow?.[0] ?? 0.13;
      const shD = built.shadow?.[1] ?? 0.11;
      const gY = surfaceBelow(group.position.x, baseY, group.position.z);
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(shW, shD),
        new THREE.MeshBasicMaterial({
          map: contactMap, transparent: true, opacity: built.shadow?.[2] ?? 0.34, depthWrite: false,
          color: 0x3f3458, toneMapped: false
        })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = gY + 0.002 - baseY;
      sh.userData.noOutline = true;
      sh.layers.set(1);
      sh.renderOrder = 1;
      group.add(sh);
    }

    // warm glow so the pal is findable without being obvious
    const glowMat = new THREE.SpriteMaterial({
      map: sparkTex, color: built.glow, transparent: true, opacity: 0.32,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false
    });
    const glow = new THREE.Sprite(glowMat);
    const glowScale = built.glowScale || 0.2;
    glow.scale.set(glowScale, glowScale, 1);
    glow.position.set(0, built.height * PLUSH_SCALE * 0.58, 0);
    glow.layers.set(1);
    glow.userData.noOutline = true;
    group.add(glow);

    const name = spot.name || NAMES[type] || type;
    const plush = {
      id: String(spot.id ?? type),
      type,
      name,
      group,
      glow,
      glowColor: built.glow,
      glowScale: built.glowScale || 0.2,
      glowBase: built.glowBase ?? 0.30,
      baseY,
      baseRot,
      phase: index * 1.7 + 0.4,
      look: 0,
      collected: false,
      item: null,
      height: built.height * PLUSH_SCALE
    };
    group.name = `plush-${plush.id}`;
    group.traverse((o) => { if (o.isMesh) o.userData.plush = plush; });

    plush.item = ctx.registerInteract(group, {
      id: `plush_${plush.id}`,
      label: `“${name}” · pick up`,
      range: 2.8,
      onUse: () => collect(plush)
    });
    plushies.push(plush);
    return plush;
  }

  const spots = spotList();
  state.total = spots.length;
  spots.forEach(buildPlushie);

  /* --------------------------------------------------- orbiting sparkles */
  const ORBIT = [];
  let sparklePoints = null;
  {
    const count = plushies.length * 4;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const pl = plushies[Math.floor(i / 4)];
      if (!pl) continue;
      ORBIT.push({
        plush: pl,
        radius: 0.095 + Math.random() * 0.065,
        speed: 0.5 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        y: 0.04 + Math.random() * 0.14,
        wobble: 0.012 + Math.random() * 0.02
      });
      c.setHex(i % 3 === 0 ? 0xfff3d0 : pl.type === 'cloud' ? 0xe8f3ff : 0xffdfeb);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.023, map: sparkTex, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
      vertexColors: true, sizeAttenuation: true, toneMapped: false, alphaTest: 0.01
    });
    sparklePoints = new THREE.Points(geo, mat);
    sparklePoints.frustumCulled = false;
    sparklePoints.layers.set(1);
    sparklePoints.userData.noOutline = true;
    scene.add(sparklePoints);
  }

  /* ------------------------------------------------------- pickup burst */
  function spawnBurst(worldPos, colorHex) {
    const count = 24;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      positions[i * 3] = worldPos.x;
      positions[i * 3 + 1] = worldPos.y;
      positions[i * 3 + 2] = worldPos.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 1.35);
      const sp = 0.35 + Math.random() * 0.85;
      vel[i * 3] = Math.sin(phi) * Math.cos(theta) * sp;
      vel[i * 3 + 1] = Math.abs(Math.cos(phi)) * sp * 1.2 + 0.25;
      vel[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * sp;
      col.setHex(Math.random() > 0.45 ? colorHex : 0xfff3cf);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.024, map: sparkTex, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending,
      vertexColors: true, sizeAttenuation: true, toneMapped: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.layers.set(1);
    points.userData.noOutline = true;
    scene.add(points);
    bursts.push({ points, geo, mat, vel, life: 0, dur: 0.95 });
  }

  /* ------------------------------------------------------------- collect */
  function collect(target) {
    const plush = typeof target === 'string' ? plushies.find((p) => p.id === target) : target;
    if (!plush || plush.collected) return false;
    plush.collected = true;
    state.found += 1;

    // stop being an interactable right away
    const idx = ctx.interactables?.indexOf(plush.item) ?? -1;
    if (idx >= 0) ctx.interactables.splice(idx, 1);
    if (plush.item) plush.item.disabled = true;

    const world = new THREE.Vector3(plush.group.position.x, plush.group.position.y + plush.height * 0.55, plush.group.position.z);
    audio.pickup();
    spawnBurst(world, plush.glowColor);
    plush.glow.visible = false;
    pops.push({ plush, t: 0 });

    ui.setProgress(state.found, state.total);
    ui.clearPrompt();
    ui.toast(PICK_LINES[Math.min(PICK_LINES.length - 1, Math.floor(Math.random() * PICK_LINES.length))](plush.name));

    if (state.found >= state.total && !state.complete) {
      state.complete = true;
      // wall-clock deadline so a slow frame can never swallow the celebration
      state.celebrateAt = performance.now() + 900;
    }
    return true;
  }

  function celebrate() {
    if (state.celebrating) return;
    state.celebrating = true;
    if (state.photo) togglePhoto(false);
    audio.completion();
    ui.setProgress(state.found, state.total, false);
    ui.showComplete();
    ui.clearPrompt();
    // release the mouse so the celebration card is clickable
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* noop */ }
    }
  }

  /* ---------------------------------------------------------------- UI */
  const moods = (() => {
    const presets = ctx.mood?.presets || {};
    const order = ctx.mood?.order?.length ? ctx.mood.order : Object.keys(MOOD_FALLBACK);
    const list = order.map((name) => ({ name, label: presets[name]?.label || MOOD_FALLBACK[name] || name }));
    return list.length ? list : Object.entries(MOOD_FALLBACK).map(([name, label]) => ({ name, label }));
  })();

  const ui = createUI({
    moods,
    onStart: () => startGame(true),
    onResume: () => resumeGame(),
    onContinue: () => continueGame(),
    onMute: () => toggleMute(),
    onMood: (name) => {
      if (ctx.mood?.set) ctx.mood.set(name);
      refreshMood();
      audio.chime();
      ui.toast(`${moodLabel(name)} · the room shifts its light`);
    }
  });

  function moodName() {
    return ctx.moodName || ctx.mood?.name || 'golden';
  }
  function moodLabel(name) {
    return ctx.mood?.presets?.[name]?.label || MOOD_FALLBACK[name] || name;
  }
  function refreshMood() {
    const name = moodName();
    ui.setMood(name, moodLabel(name));
    audio.setAmbient(name);
  }

  /* ----------------------------------------------------------- flow */
  let bootHidden = false;
  function hideBoot() {
    if (bootHidden) return;
    bootHidden = true;
    document.getElementById('boot')?.classList.add('hidden');
  }

  function requestLock() {
    const dom = ctx.renderer?.domElement;
    if (!dom || document.pointerLockElement === dom) return;
    try {
      const p = dom.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => ui.showLockHint());
    } catch {
      ui.showLockHint();
    }
  }

  function startGame(lock = true) {
    if (state.started) return;
    state.started = true;
    audio.start();
    audio.setAmbient(moodName());
    ui.hideIntro();
    hideBoot();
    refreshMood();
    if (lock) requestLock();
    setTimeout(() => ui.toast('Five little pals are hiding nearby ✨', 3600), 700);
  }

  function resumeGame() {
    if (!state.started) { startGame(true); return; }
    audio.start();
    ui.hidePause();
    requestLock();
    audio.click(780);
  }

  function continueGame() {
    ui.hideComplete();
    state.celebrating = false;
    audio.confirm();
    requestLock();
  }

  function togglePhoto(force) {
    if (!state.started) return;
    const next = typeof force === 'boolean' ? force : !state.photo;
    if (next === state.photo) return;
    state.photo = next;
    ui.setPhoto(next);
    ui.clearPrompt();
    if (!next) ui.armHints();
  }

  function toggleMute() {
    if (!audio.ready) audio.start();
    const next = !audio.isMuted;
    if (!next) audio.toggle();
    audio.setMuted(next);
    ui.setMuted(next);
    ui.toast(next ? 'Sound off · press M to unmute' : 'Sound on · soft and cozy');
  }

  /* -------------------------------------------------------- ctx wiring */
  ctx.onHover = (item) => {
    if (!state.started || state.photo || ui.pauseOpen || ui.completeOpen) { ui.clearPrompt(); return; }
    ui.setPrompt(item?.label || '');
    if (!item) ui.clearPrompt();
  };
  ctx.onLockChange = (locked) => {
    if (locked) {
      ui.hidePause();
      ui.hideLockHint();
      return;
    }
    if (state.started && !state.celebrating) ui.showPause();
  };
  ctx.onMoodChange = (name) => {
    ui.setMood(name, moodLabel(name));
    audio.setAmbient(name);
  };
  document.addEventListener('pointerlockerror', () => ui.showLockHint());

  // contextual keys that the controls module does not own
  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.code === 'KeyM') { toggleMute(); return; }
    if (e.code === 'Escape' && state.started && !document.pointerLockElement) {
      if (ui.completeOpen) return;
      if (ui.pauseOpen) resumeGame();
      else ui.showPause();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // the intro is a real overlay: swallow gameplay keys so the room stays still
  // behind it (movement, interactions, photo and mood keys). Started state and
  // the ?nostart QA path are untouched.
  const INTRO_BLOCKED = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyT', 'KeyP', 'KeyC',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);
  window.addEventListener('keydown', (e) => {
    if (!state.started && ui.introOpen && INTRO_BLOCKED.has(e.code)) e.stopPropagation();
  }, true);

  /* --------------------------------------------------------- interface */
  const api = {
    update,
    toast: (msg) => ui.toast(msg),
    refreshMood,
    togglePhoto,
    start: () => startGame(false),
    pause: () => ui.showPause(),
    resume: () => resumeGame(),
    collect: (id) => collect(id),
    collectAll: () => {
      plushies.slice().forEach((p) => collect(p));
      // deterministic for the QA harness: skip the short "are you sure" beat
      if (state.complete && !state.celebrating) { state.celebrateAt = 0; celebrate(); }
      return state.found;
    },
    celebrate,
    get state() {
      return {
        found: state.found,
        total: state.total,
        started: state.started,
        photo: state.photo,
        celebrating: state.celebrating,
        complete: state.complete,
        muted: audio.isMuted,
        audioReady: audio.ready,
        pals: plushies.map((p) => ({ id: p.id, name: p.name, type: p.type, collected: p.collected }))
      };
    },
    ui,
    audio
  };

  ctx.app.togglePhoto = togglePhoto;
  ctx.app.game = api;
  ctx.game = api;

  /* ---------------------------------------------------------- init view */
  ui.setProgress(state.found, state.total, false);
  refreshMood();
  ui.setMuted(audio.isMuted);

  if (autoStart) {
    hideBoot();
    ui.hideIntro();
    ui.armHints();
    refreshMood();
    // no user gesture yet: start the audio graph on the first input event
    const unlock = () => {
      audio.start();
      audio.setAmbient(moodName());
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  } else {
    ui.showIntro();
  }

  /* -------------------------------------------------------------- frame */
  const camPos = new THREE.Vector3();

  function update(dt, t) {
    ctx.camera.getWorldPosition(camPos);

    if (state.celebrateAt && performance.now() >= state.celebrateAt) {
      state.celebrateAt = 0;
      celebrate();
    }

    // gentle idle bob, breathing and a shy look toward the player
    for (let i = 0; i < plushies.length; i++) {
      const p = plushies[i];
      if (p.collected) continue;
      const bob = Math.sin(t * 1.5 + p.phase) * 0.0042 + Math.sin(t * 0.7 + p.phase * 1.7) * 0.0018;
      p.group.position.y = p.baseY + bob;
      const dx = camPos.x - p.group.position.x;
      const dz = camPos.z - p.group.position.z;
      const dist = Math.hypot(dx, dz);
      let lookTarget = 0;
      if (dist < 2.3 && state.started) {
        const want = Math.atan2(dx, dz);
        lookTarget = Math.max(-0.5, Math.min(0.5, wrap(want - p.baseRot)));
      }
      p.look += (lookTarget - p.look) * Math.min(1, dt * 2.6);
      p.group.rotation.y = p.baseRot + Math.sin(t * 0.55 + p.phase) * 0.06 + p.look;
      const near = dist < 2.1 ? 0.15 : 0;
      p.glow.material.opacity = p.glowBase + near + Math.sin(t * 1.8 + p.phase) * 0.045;
      const gs = p.glowScale + Math.sin(t * 1.8 + p.phase) * 0.012 + near * 0.08;
      p.glow.scale.set(gs, gs, 1);
    }

    // orbiting sparkles
    if (sparklePoints) {
      const arr = sparklePoints.geometry.attributes.position.array;
      for (let i = 0; i < ORBIT.length; i++) {
        const o = ORBIT[i];
        const p = o.plush;
        if (p.collected) {
          arr[i * 3 + 1] = -30;
          continue;
        }
        const a = t * o.speed + o.phase;
        arr[i * 3] = p.group.position.x + Math.cos(a) * o.radius;
        arr[i * 3 + 1] = p.group.position.y + o.y + Math.sin(a * 2.1) * o.wobble;
        arr[i * 3 + 2] = p.group.position.z + Math.sin(a) * o.radius;
      }
      sparklePoints.geometry.attributes.position.needsUpdate = true;
    }

    // pop animation for collected pals
    for (let i = pops.length - 1; i >= 0; i--) {
      const pop = pops[i];
      pop.t += dt;
      const p = pop.plush;
      if (pop.t < 0.11) {
        const k = pop.t / 0.11;
        p.group.scale.setScalar(1 + k * 0.35);
      } else {
        const k = Math.min(1, (pop.t - 0.11) / 0.28);
        p.group.scale.setScalar(Math.max(0.001, 1.35 * (1 - k * k)));
        p.group.position.y += dt * 0.22;
        p.group.rotation.y += dt * 7;
      }
      if (pop.t > 0.42) {
        plushRoot.remove(p.group);
        pops.splice(i, 1);
      }
    }

    // sparkle bursts
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life += dt;
      const arr = b.geo.attributes.position.array;
      const drag = Math.max(0, 1 - dt * 1.7);
      for (let j = 0; j < b.vel.length; j += 3) {
        b.vel[j] *= drag;
        b.vel[j + 1] = b.vel[j + 1] * drag - dt * 1.4;
        b.vel[j + 2] *= drag;
        arr[j] += b.vel[j] * dt;
        arr[j + 1] += b.vel[j + 1] * dt;
        arr[j + 2] += b.vel[j + 2] * dt;
      }
      b.geo.attributes.position.needsUpdate = true;
      const k = b.life / b.dur;
      b.mat.opacity = Math.max(0, 1 - k * k);
      if (b.life >= b.dur) {
        scene.remove(b.points);
        b.geo.dispose();
        b.mat.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  // QA hooks — used by the screenshot / smoke-test harness
  window.__game = api;

  return api;
}

export default createGame;
