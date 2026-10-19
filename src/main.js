// Cozy Room — bootstrap + integration.
import * as THREE from 'three';
import { createRenderPipeline } from './core/renderer.js';
import { TextureLibrary, setMaxAnisotropy } from './world/textures.js';
import { createMaterials } from './world/materials.js';
import kit from './world/kit.js';
import { buildRoom } from './world/room.js';
import { setupLighting } from './world/lighting.js';
import { buildFurniture } from './world/furniture.js';
import { buildDecor } from './world/decor.js';
import { createControls } from './core/controls.js';
import { createGame } from './game/game.js';

window.__ERRORS__ = [];
window.addEventListener('error', (e) => window.__ERRORS__.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__ERRORS__.push('promise: ' + String(e.reason)));

const params = new URLSearchParams(location.search);
const quality = (params.get('q') || 'high').toLowerCase();
const canvas = document.getElementById('app');

const pipeline = createRenderPipeline({ canvas, quality: ['high', 'med', 'low'].includes(quality) ? quality : 'high', forceQuality: params.get('force') === '1' });
const { renderer, scene, camera } = pipeline;
setMaxAnisotropy(pipeline.maxAniso);
pipeline.setSize(window.innerWidth, window.innerHeight);

const texLib = new TextureLibrary();
const materials = createMaterials(texLib);

const ctx = {
  scene, camera, renderer, pipeline: pipeline, renderPipeline: pipeline, quality: pipeline.quality,
  materials, kit, THREE,
  textureLib: texLib,
  texture: (name, opts) => texLib.get(name, opts),
  slots: {},
  colliders: [], interactables: [], updatables: [],
  collectibleSpots: [],
  app: {},
  time: 0,
  addColliderBox(box) { this.colliders.push(box); },
  registerInteract(object, data) {
    const item = { object, enabled: true, ...data };
    this.interactables.push(item);
    return item;
  },
  onFrame(fn) { this.updatables.push(fn); },
  toast(msg) { this.game?.toast?.(msg); },
  refreshMoodLabel() { this.game?.refreshMood?.(); }
};
window.__ctx = ctx;

// lighting first: builders register fixtures / read mood
setupLighting(ctx);
pipeline.scene = scene;


const contactTex = texLib.get('contact').map;
ctx.addContactShadow = (x, z, w, d, opacity = 0.32, y = 0.007) => {
  const m = kit.contactShadow(contactTex, w, d, x, z, opacity, y);
  m.userData.noOutline = true; m.layers.set(1);
  scene.add(m);
  return m;
};

// world
buildRoom(ctx);
// re-apply current mood sky (room registered backdrop materials after lighting init)
ctx.mood.set('golden', true);
buildFurniture(ctx);
buildDecor(ctx);

// quick soft contact shadows for grounding (builders can add their own)
// controls + game
const controls = createControls(ctx);
ctx.controls = controls;
const game = createGame(ctx);
ctx.game = game;

// camera start
controls.state.pos.set(0.35, 0, 1.62);
controls.state.yaw = 0.20;
controls.state.pitch = -0.045;
controls.enable();

// -------- fixed views for QA / screenshots --------
let fixedView = null;
if (params.has('cam')) {
  const c = (params.get('cam') || '').split(',').map(Number);
  const l = (params.get('look') || '').split(',').map(Number);
  fixedView = {
    cam: new THREE.Vector3(c[0] || 0, c[1] || 1.6, c[2] || 1.7),
    look: new THREE.Vector3(l[0] || 0, l[1] || 1.1, l[2] || -1.3)
  };
  controls.disable();
}
if (params.get('hud') === '0') document.body.classList.add('nohud');
window.__setView = (cam, look) => {
  fixedView = { cam: new THREE.Vector3(...cam), look: new THREE.Vector3(...look) };
  controls.disable();
};
window.__freeView = () => { fixedView = null; controls.enable(); };
window.__setMood = (m, instant = true) => ctx.mood.set(m, instant);
window.__stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles });

function onResize() {
  pipeline.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

let last = performance.now();
let frameCount = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  ctx.time += dt;
  if (fixedView) {
    camera.position.copy(fixedView.cam);
    camera.lookAt(fixedView.look);
    camera.updateMatrixWorld();
  } else {
    controls.update(dt);
  }
  game.update?.(dt, ctx.time);
  for (let i = 0; i < ctx.updatables.length; i++) ctx.updatables[i](dt, ctx.time);
  pipeline.render();
  frameCount++;
  if (frameCount === 3) {
    window.__APP_READY__ = true;
    document.getElementById('boot')?.classList.add('hidden');
  }
}
requestAnimationFrame(tick);

window.__app = ctx.app;
