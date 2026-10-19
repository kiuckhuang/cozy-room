// First-person controller: pointer look, smooth movement, collision, interactions.
import * as THREE from 'three';

export function createControls(ctx) {
  const { camera, renderer, scene } = ctx;
  const dom = renderer.domElement;
  const state = {
    yaw: 0.23, pitch: -0.05,
    pos: new THREE.Vector3(0.95, 0, 1.75),
    vel: new THREE.Vector3(),
    eye: 1.62, eyeTarget: 1.62,
    bob: 0, bobAmp: 0,
    enabled: false, locked: false,
    keys: new Set(), sprint: false, crouch: false,
    stepDist: 0, lastYaw: 0
  };
  const R = 0.29;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 3.2;
  const center = new THREE.Vector2(0, 0);
  let hovered = null;
  let interactQueued = false;
  let jumpLatch = false;

  const isSolid = (b) => b.max.y > 0.05;
  function blocked(x, z) {
    for (const b of ctx.colliders) {
      if (!isSolid(b)) continue;
      if (x > b.min.x - R && x < b.max.x + R && z > b.min.z - R && z < b.max.z + R) return true;
    }
    if (x < -2.1 + R || x > 2.1 - R || z < -2.3 + R || z > 2.3 - R) return true;
    return false;
  }

  function updateCamera(dt) {
    state.eye += (state.eyeTarget - state.eye) * Math.min(1, dt * 10);
    const moving = state.vel.lengthSq() > 0.02 && !state.crouch;
    state.bobAmp += ((moving ? 1 : 0) - state.bobAmp) * Math.min(1, dt * 6);
    const bob = Math.sin(state.bob) * 0.016 * state.bobAmp;
    const roll = Math.sin(state.bob * 0.5) * 0.006 * state.bobAmp;
    camera.position.set(
      state.pos.x + Math.cos(state.bob * 0.5) * 0.004 * state.bobAmp,
      state.eye + bob,
      state.pos.z
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.set(state.pitch, state.yaw, roll);
    camera.updateMatrixWorld();
  }

  function onKeyDown(e) {
    if (!state.enabled) return;
    const code = e.code;
    state.keys.add(code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
    if (code === 'KeyC') state.crouch = !state.crouch, state.eyeTarget = state.crouch ? 1.08 : 1.62;
    if (code === 'ControlLeft' || code === 'ControlRight') { state.crouch = true; state.eyeTarget = 1.08; }
    if (code === 'KeyE' || code === 'KeyF') interactQueued = true;
    if (code === 'KeyT') { ctx.mood.cycle(); ctx.audio?.chime(); ctx.refreshMoodLabel?.(); }
    if (code === 'KeyP') ctx.app?.togglePhoto?.();
  }
  function onKeyUp(e) {
    state.keys.delete(e.code);
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      state.crouch = false; state.eyeTarget = 1.62;
    }
  }
  function onMouseMove(e) {
    if (!state.enabled) return;
    if (state.locked) {
      const s = 0.0021;
      state.yaw -= e.movementX * s;
      state.pitch -= e.movementY * s;
      state.pitch = Math.max(-1.35, Math.min(1.35, state.pitch));
    }
  }
  function onCanvasClick() {
    if (!state.enabled) return;
    if (!state.locked) {
      dom.requestPointerLock?.();
    } else {
      interactQueued = true;
    }
  }
  function onLockChange() {
    state.locked = document.pointerLockElement === dom;
    document.body.classList.toggle('playing', state.locked);
    ctx.onLockChange?.(state.locked);
  }
  function onMouseDown(e) {
    if (state.enabled && state.locked && e.button === 0) interactQueued = true;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  dom.addEventListener('click', onCanvasClick);
  dom.addEventListener('mousedown', onMouseDown);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('blur', () => state.keys.clear());

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
  const clock = new THREE.Clock();

  function update(dt) {
    if (!state.enabled) { updateCamera(dt); return; }
    fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    wish.set(0, 0, 0);
    const k = state.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) wish.add(fwd);
    if (k.has('KeyS') || k.has('ArrowDown')) wish.sub(fwd);
    if (k.has('KeyD') || k.has('ArrowRight')) wish.add(right);
    if (k.has('KeyA') || k.has('ArrowLeft')) wish.sub(right);
    const shift = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = state.crouch ? 1.15 : shift ? 3.35 : 1.95;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const accel = wish.lengthSq() > 0 ? 10 : 13;
    state.vel.lerp(wish, Math.min(1, dt * accel));
    if (state.vel.lengthSq() < 0.0004) state.vel.set(0, 0, 0);

    let nx = state.pos.x + state.vel.x * dt;
    let nz = state.pos.z + state.vel.z * dt;
    if (!blocked(nx, state.pos.z)) state.pos.x = nx; else state.vel.x = 0;
    if (!blocked(state.pos.x, nz)) state.pos.z = nz; else state.vel.z = 0;

    const sp = state.vel.length();
    if (sp > 0.1) {
      const prev = state.bob;
      state.bob += dt * (state.crouch ? 5.2 : shift ? 9.5 : 7.2) * (sp / speed);
      state.stepDist += sp * dt;
      if (state.stepDist > (shift ? 0.78 : 0.62)) {
        state.stepDist = 0;
        ctx.audio?.footstep(state.crouch ? 0.5 : shift ? 1 : 0.75);
      }
    } else {
      state.bob += dt * 1.2;
    }

    // interaction raycast
    hovered = null;
    const objs = [];
    for (const it of ctx.interactables) { if (!it.disabled) objs.push(it.object); }
    if (objs.length) {
      raycaster.setFromCamera(center, camera);
      const hits = raycaster.intersectObjects(objs, true);
      if (hits.length) {
        let obj = hits[0].object;
        while (obj && !ctx.interactables.some(it => it.object === obj)) obj = obj.parent;
        const item = ctx.interactables.find(it => it.object === obj);
        if (item && hits[0].distance < (item.range || 2.6)) hovered = item;
      }
    }
    ctx.onHover?.(hovered);
    if (interactQueued) {
      interactQueued = false;
      if (hovered) {
        hovered.onUse?.(ctx);
        ctx.audio?.click?.(720);
      }
    }

    updateCamera(dt);
    // keep a frame-rate independent walk bob
    if (state.bob > 1e7) state.bob = 0;
  }

  return {
    update,
    state,
    enable() { state.enabled = true; },
    disable() { state.enabled = false; state.keys.clear(); state.vel.set(0, 0, 0); },
    lookAt(target) {
      const eyePos = new THREE.Vector3(state.pos.x, state.eye, state.pos.z);
      const d = new THREE.Vector3().subVectors(target, eyePos);
      state.yaw = Math.atan2(-d.x, -d.z);
      state.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      updateCamera(0.016);
    },
    get hovered() { return hovered; },
    setPosition(x, z) { state.pos.set(x, 0, z); },
    teleport(x, z, yaw = state.yaw) { state.pos.set(x, 0, z); state.yaw = yaw; updateCamera(0.016); }
  };
}
