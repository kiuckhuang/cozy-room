// Lighting, atmosphere, dust and time-of-day moods.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const MOODS = {
  golden: {
    label: 'Golden hour',
    sun: { color: 0xffd0a0, intensity: 4.6, pos: [6.6, 8.5, 0.3] },
    hemi: { sky: 0xc9ddf2, ground: 0xe0d5c9, intensity: 0.36 },
    north: { color: 0xc7e0f7, intensity: 1.3 },
    east: { color: 0xffcf9d, intensity: 1.7 },
    exposure: 0.98, bloom: 0.16, bloomThreshold: 1.0,
    warmth: 0.14, saturation: 1.06, vignette: 0.26,
    shadowTint: [0.93, 0.92, 1.05], highlightTint: [1.04, 1.0, 0.94],
    skyNorth: 'golden', skyEast: 'golden',
    ambientBoost: 0.0,
    lamps: { desk: false, bed: true, ceiling: false },
    dust: 0.5, shafts: 0.4
  },
  day: {
    label: 'Soft daylight',
    sun: { color: 0xffeacb, intensity: 4.6, pos: [6.6, 7.6, -1.05] },
    hemi: { sky: 0xcfe4f7, ground: 0xb9a898, intensity: 0.5 },
    north: { color: 0xd8ecff, intensity: 2.0 },
    east: { color: 0xfff0dd, intensity: 2.0 },
    exposure: 0.94, bloom: 0.07, bloomThreshold: 1.15,
    warmth: 0.04, saturation: 1.05, vignette: 0.2,
    shadowTint: [0.95, 0.96, 1.03], highlightTint: [1.02, 1.01, 0.99],
    skyNorth: 'day', skyEast: 'day',
    ambientBoost: 0.15,
    lamps: { desk: false, bed: false, ceiling: false },
    dust: 0.25, shafts: 0.2
  },
  dusk: {
    label: 'Lavender dusk',
    sun: { color: 0xffb180, intensity: 2.8, pos: [7.0, 3.6, 1.9] },
    hemi: { sky: 0xb7a6d8, ground: 0x6f5d75, intensity: 0.75 },
    north: { color: 0xc7b7ea, intensity: 1.8 },
    east: { color: 0xffb28c, intensity: 3.0 },
    exposure: 0.9, bloom: 0.38, bloomThreshold: 0.78,
    warmth: 0.32, saturation: 1.08, vignette: 0.34,
    shadowTint: [1.0, 0.9, 1.12], highlightTint: [1.06, 0.94, 0.9],
    skyNorth: 'dusk', skyEast: 'dusk',
    ambientBoost: 0.05,
    lamps: { desk: true, bed: true, ceiling: false },
    dust: 0.6, shafts: 0.5
  },
  night: {
    label: 'Quiet night',
    sun: { color: 0xa7c0ff, intensity: 0.65, pos: [5.4, 6.2, -1.8] },
    hemi: { sky: 0x5a5f94, ground: 0x39334f, intensity: 0.5 },
    north: { color: 0x9db5ff, intensity: 0.65 },
    east: { color: 0x9faeff, intensity: 0.55 },
    exposure: 1.04, bloom: 0.5, bloomThreshold: 0.55,
    warmth: -0.04, saturation: 1.02, vignette: 0.42,
    shadowTint: [0.88, 0.9, 1.14], highlightTint: [1.02, 0.98, 0.9],
    skyNorth: 'night', skyEast: 'night',
    ambientBoost: 0.0,
    lamps: { desk: true, bed: true, ceiling: false },
    dust: 0.3, shafts: 0.1
  }
};

function makeEnvTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#cfe7ff');
  g.addColorStop(0.45, '#f3e9dd');
  g.addColorStop(0.55, '#e8dccd');
  g.addColorStop(1, '#b7a696');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  // bright window strips (soft area highlights for reflections)
  const win = ctx.createLinearGradient(0, 60, 0, 175);
  win.addColorStop(0, 'rgba(255,255,255,0)');
  win.addColorStop(0.45, 'rgba(255,247,228,0.95)');
  win.addColorStop(1, 'rgba(255,247,228,0)');
  ctx.fillStyle = win;
  ctx.fillRect(70, 60, 120, 115);
  ctx.fillRect(330, 60, 100, 115);
  // soft warm sun spot
  const rad = ctx.createRadialGradient(390, 80, 2, 390, 80, 90);
  rad.addColorStop(0, 'rgba(255,235,190,0.95)');
  rad.addColorStop(1, 'rgba(255,235,190,0)');
  ctx.fillStyle = rad; ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpArr(a, b, t) { return a.map((v, i) => lerp(v, b[i], t)); }
function lerpColor(target, a, b, t) { target.copy(a).lerp(b, t); return target; }

export function setupLighting(ctx) {
  RectAreaLightUniformsLib.init();
  const { scene, renderer } = ctx;

  const sun = new THREE.DirectionalLight(0xffc489, 4.2);
  sun.position.set(7.2, 4.3, -0.9);
  sun.target.position.set(-0.4, 0.5, -0.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -4.8; sc.right = 4.8; sc.top = 4.8; sc.bottom = -4.8;
  sc.near = 0.8; sc.far = 16;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 2.5;
  sun.shadow.blurSamples = 12;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x8f6f58, 0.55);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xe9eef7, 0.055);
  scene.add(ambient);

  const northFill = new THREE.RectAreaLight(0xcfe8ff, 2.6, 0.95, 1.0);
  northFill.position.set(-1.48, 1.52, -2.13);
  northFill.lookAt(-1.2, 1.35, -0.2);
  scene.add(northFill);

  const eastFill = new THREE.RectAreaLight(0xffd6a6, 5.0, 1.65, 1.05);
  eastFill.position.set(1.98, 1.58, -1.2);
  eastFill.lookAt(0.5, 1.35, -1.2);
  scene.add(eastFill);

  const bounce = new THREE.PointLight(0xffe0c0, 0.35, 6, 2.0);
  bounce.position.set(-0.2, 1.7, 0.6);
  scene.add(bounce);

  const ceilingBounce = new THREE.PointLight(0xfff2e2, 0.35, 7, 2.0);
  ceilingBounce.position.set(0.2, 2.35, 0.5);
  scene.add(ceilingBounce);

  // practical lamps -------------------------------------------------
  const bedLampLight = new THREE.PointLight(0xffcf8a, 0, 3.2, 2.0);
  bedLampLight.position.set(-0.92, 0.86, -1.92);
  bedLampLight.castShadow = false;
  scene.add(bedLampLight);

  const deskLampLight = new THREE.PointLight(0xffd495, 0, 3.8, 2.0);
  deskLampLight.position.set(1.8, 1.02, 1.77);
  deskLampLight.castShadow = false;
  scene.add(deskLampLight);

  const ceilingLight = new THREE.PointLight(0xffe9c6, 0, 8, 2.0);
  ceilingLight.position.set(0.1, 2.48, 0.35);
  ceilingLight.castShadow = false;
  scene.add(ceilingLight);

  // soft lamp spill so walls catch the glow even with no shadow
  const deskGlow = new THREE.PointLight(0xffb877, 0, 2.2, 2.0);
  deskGlow.position.set(1.7, 0.95, 1.65);
  scene.add(deskGlow);

  // environment -----------------------------------------------------
  const envTex = makeEnvTexture(renderer);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.28;
  envTex.dispose();
  pmrem.dispose();

  const lights = {
    sun, hemi, northFill, eastFill, bounce,
    deskLamp: deskLampLight, deskGlow, bedLamp: bedLampLight, ceiling: ceilingLight,
    lampState: { desk: false, bed: false, ceiling: false },
    fixtures: {}, // filled by builders: {desk:{shadeMat, bulbMat, ...}, bed:{...}, ceiling:{...}}
    skyMaterials: {}, // filled by room builder: {north: material, east: material}
    shaftMaterials: [],
    dust: null
  };
  ctx.lights = lights;

  function setLamp(name, on, opts = {}) {
    const state = lights.lampState;
    state[name] = on;
    const fix = lights.fixtures[name];
    if (name === 'desk') {
      lights.deskLamp.intensity = on ? (opts.intensity ?? 2.4) : 0;
      lights.deskGlow.intensity = on ? (opts.intensity ?? 0.7) : 0;
      if (fix?.shadeMat) fix.shadeMat.emissiveIntensity = on ? 0.85 : 0.0;
      if (fix?.bulbMat) fix.bulbMat.emissiveIntensity = on ? 4.0 : 0.0;
    } else if (name === 'bed') {
      lights.bedLamp.intensity = on ? (opts.intensity ?? 1.7) : 0;
      if (fix?.shadeMat) fix.shadeMat.emissiveIntensity = on ? 0.8 : 0.0;
      if (fix?.bulbMat) fix.bulbMat.emissiveIntensity = on ? 3.2 : 0.0;
    } else if (name === 'ceiling') {
      lights.ceiling.intensity = on ? (opts.intensity ?? 6.0) : 0;
      if (fix?.shadeMat) fix.shadeMat.emissiveIntensity = on ? 1.1 : 0.0;
      if (fix?.bulbMat) fix.bulbMat.emissiveIntensity = on ? 3.0 : 0.0;
    }
  }
  lights.setLamp = setLamp;
  ctx.setLamp = setLamp;

  // dust motes ------------------------------------------------------
  {
    const N = 280;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = -2.0 + Math.random() * 4.0;
      pos[i * 3 + 1] = 0.15 + Math.random() * 2.3;
      pos[i * 3 + 2] = -2.2 + Math.random() * 4.2;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uTex: { value: ctx.textureLib.get('dust').map },
        uOpacity: { value: 0.022 }, uSun: { value: new THREE.Vector3(7.2, 4.3, -0.9) }
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime;
        varying float vTw;
        void main(){
          vec3 p = position;
          float t = uTime * (0.05 + aSeed * 0.07);
          p.x += sin(t * 1.7 + aSeed * 31.0) * 0.09;
          p.y += sin(t * 1.1 + aSeed * 17.0) * 0.06 + t * 0.012;
          p.z += cos(t * 1.3 + aSeed * 13.0) * 0.09;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float nearFade = smoothstep(0.5, 1.4, -mv.z);
          gl_PointSize = clamp((0.5 + aSeed * 0.9) * (190.0 / max(0.4, -mv.z)), 0.4, 1.5);
          vTw = (0.35 + 0.65 * abs(sin(uTime * 0.45 + aSeed * 40.0))) * nearFade;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform float uOpacity;
        varying float vTw;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vec3(1.0, 0.94, 0.82) * t.rgb, t.a * uOpacity * vTw);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.userData.noOutline = true;
    pts.layers.set(1);
    pts.renderOrder = 3;
    scene.add(pts);
    lights.dust = pts;
    ctx.updatables.push((dt, t) => { m.uniforms.uTime.value = t; });
  }

  // mood engine ------------------------------------------------------
  const current = JSON.parse(JSON.stringify(MOODS.golden));
  let from = JSON.parse(JSON.stringify(MOODS.golden));
  let to = JSON.parse(JSON.stringify(MOODS.golden));
  let fromSky = { north: null, east: null }, toSky = { north: null, east: null };
  let blend = 1, dur = 1.0, active = false;
  let name = 'golden';

  const tmpA = new THREE.Color(), tmpB = new THREE.Color();

  function applyBlend(k, moodFrom, moodTo) {
    // sun
    lerpColor(sun.color, tmpA.setHex(moodFrom.sun.color), tmpB.setHex(moodTo.sun.color), k);
    sun.intensity = lerp(moodFrom.sun.intensity, moodTo.sun.intensity, k);
    sun.position.set(
      lerp(moodFrom.sun.pos[0], moodTo.sun.pos[0], k),
      lerp(moodFrom.sun.pos[1], moodTo.sun.pos[1], k),
      lerp(moodFrom.sun.pos[2], moodTo.sun.pos[2], k)
    );
    sun.target.position.set(-0.4, 0.5, -0.8);
    sun.target.updateMatrixWorld();
    lerpColor(hemi.color, tmpA.setHex(moodFrom.hemi.sky), tmpB.setHex(moodTo.hemi.sky), k);
    lerpColor(hemi.groundColor, tmpA.setHex(moodFrom.hemi.ground), tmpB.setHex(moodTo.hemi.ground), k);
    hemi.intensity = lerp(moodFrom.hemi.intensity, moodTo.hemi.intensity, k);
    lerpColor(northFill.color, tmpA.setHex(moodFrom.north.color), tmpB.setHex(moodTo.north.color), k);
    northFill.intensity = lerp(moodFrom.north.intensity, moodTo.north.intensity, k);
    lerpColor(eastFill.color, tmpA.setHex(moodFrom.east.color), tmpB.setHex(moodTo.east.color), k);
    eastFill.intensity = lerp(moodFrom.east.intensity, moodTo.east.intensity, k);
    bounce.intensity = lerp(0.25 + moodFrom.ambientBoost, 0.25 + moodTo.ambientBoost, k);

    renderer.toneMappingExposure = lerp(moodFrom.exposure, moodTo.exposure, k);
    if (ctx.renderPipeline) {
      const rp = ctx.renderPipeline;
      rp.bloomPass.strength = lerp(moodFrom.bloom, moodTo.bloom, k);
      rp.bloomPass.threshold = lerp(moodFrom.bloomThreshold, moodTo.bloomThreshold, k);
      const u = rp.gradePass.uniforms;
      u.warmth.value = lerp(moodFrom.warmth, moodTo.warmth, k);
      u.saturation.value = lerp(moodFrom.saturation, moodTo.saturation, k);
      u.vignette.value = lerp(moodFrom.vignette, moodTo.vignette, k);
      u.shadowTint.value.setRGB(...lerpArr(moodFrom.shadowTint, moodTo.shadowTint, k));
      u.highlightTint.value.setRGB(...lerpArr(moodFrom.highlightTint, moodTo.highlightTint, k));
    }
    if (lights.dust) lights.dust.material.uniforms.uOpacity.value = lerp(moodFrom.dust, moodTo.dust, k) * 0.75;
    for (const s of lights.shaftMaterials) s.uniforms.uOpacity.value = lerp(moodFrom.shafts, moodTo.shafts, k) * (s.userData?.scale || 1);
  }

  function setMood(moodName, instant = false) {
    if (!MOODS[moodName]) moodName = 'golden';
    name = moodName;
    from = JSON.parse(JSON.stringify(current));
    to = JSON.parse(JSON.stringify(MOODS[moodName]));
    fromSky = { north: lights.skyMaterials.north?.map || null, east: lights.skyMaterials.east?.map || null };
    const lib = ctx.textureLib;
    const nm = lib.get('sky' + (MOODS[moodName].skyNorth[0].toUpperCase() + MOODS[moodName].skyNorth.slice(1))).map;
    const em = lib.get('sky' + (MOODS[moodName].skyEast[0].toUpperCase() + MOODS[moodName].skyEast.slice(1))).map;
    toSky = { north: nm, east: em };
    if (instant) {
      blend = 1; active = false;
      Object.assign(current, JSON.parse(JSON.stringify(MOODS[moodName])));
      applyBlend(1, MOODS[moodName], MOODS[moodName]);
      if (lights.skyMaterials.north) lights.skyMaterials.north.map = nm;
      if (lights.skyMaterials.east) lights.skyMaterials.east.map = em;
      if (lights.skyMaterials.north) lights.skyMaterials.north.needsUpdate = true;
      if (lights.skyMaterials.east) lights.skyMaterials.east.needsUpdate = true;
      // lamp defaults
      for (const k of ['desk', 'bed', 'ceiling']) setLamp(k, MOODS[moodName].lamps[k]);
    } else {
      blend = 0; active = true; dur = 1.2;
      // lamps switch immediately with a little delay feel
      for (const k of ['desk', 'bed', 'ceiling']) setLamp(k, MOODS[moodName].lamps[k]);
    }
    ctx.moodName = moodName;
    if (ctx.onMoodChange) ctx.onMoodChange(moodName, MOODS[moodName]);
  }

  const order = ['golden', 'day', 'dusk', 'night'];
  const mood = {
    name: 'golden',
    label: MOODS.golden.label,
    presets: MOODS,
    order,
    set: setMood,
    cycle() {
      const i = order.indexOf(name);
      setMood(order[(i + 1) % order.length]);
    },
    get values() { return current; }
  };
  ctx.mood = mood;

  ctx.updatables.push((dt) => {
    if (active) {
      blend = Math.min(1, blend + dt / dur);
      const k = blend * blend * (3 - 2 * blend);
      applyBlend(k, from, to);
      // crossfade window skies by swapping halfway (cheap + effective)
      if (blend > 0.5) {
        if (lights.skyMaterials.north && lights.skyMaterials.north.map !== toSky.north) {
          lights.skyMaterials.north.map = toSky.north; lights.skyMaterials.north.needsUpdate = true;
        }
        if (lights.skyMaterials.east && lights.skyMaterials.east.map !== toSky.east) {
          lights.skyMaterials.east.map = toSky.east; lights.skyMaterials.east.needsUpdate = true;
        }
      }
      if (blend >= 1) { active = false; Object.assign(current, to); }
    }
  });

  setMood('golden', true);

  // a tiny lamp-click helper shared by interactions
  ctx.toggleLamp = (which) => setLamp(which, !lights.lampState[which]);

  return { lights, mood, setMood };
}
