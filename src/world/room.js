// Room shell: walls, windows, curtains, door, ceiling, AC, light shafts.
import * as THREE from 'three';
import kit from './kit.js';

const R = { x0: -2.1, x1: 2.1, z0: -2.3, z1: 2.3, h: 2.65, t: 0.14 };
const NW = { x0: -1.98, x1: -0.98, sill: 0.96, head: 2.02 };
const EW = { z0: -2.2, z1: -0.3, sill: 0.97, head: 2.16, recess: 0.24 };
const DOOR = { x0: 0.72, x1: 1.58, h: 2.06 };

export function buildRoom(ctx) {
  const { scene, materials: M, quality } = ctx;
  const root = new THREE.Group();
  root.name = 'room';
  scene.add(root);
  const add = (o) => { root.add(o); return o; };
  const noOutline = (m) => { m.userData.noOutline = true; m.layers.set(1); return m; };
  const box = (w, h, d, mat, x, y, z, r = 0.008) => {
    const m = kit.mesh(kit.rboxGeo(w, h, d, r, 2), mat, { pos: [x, y, z], parent: root });
    return noOutline(m);
  };
  const wallContinuous = M.wall.clone();
  wallContinuous.map = M.wall.map.clone();
  wallContinuous.normalMap = M.wall.normalMap.clone();
  wallContinuous.map.repeat.set(1 / 2.4, 1 / 2.2);
  wallContinuous.normalMap.repeat.set(1 / 2.4, 1 / 2.2);
  wallContinuous.map.needsUpdate = true;
  wallContinuous.normalMap.needsUpdate = true;
  wallContinuous.side = THREE.DoubleSide;

  function wallWithHole(x0, x1, y0, y1, holes = [], { rotY = 0, depth = R.t, pos = [0, 0, 0] } = {}) {
    const sh = new THREE.Shape();
    sh.moveTo(x0, y0); sh.lineTo(x1, y0); sh.lineTo(x1, y1); sh.lineTo(x0, y1); sh.closePath();
    for (const h of holes) {
      const pth = new THREE.Path();
      pth.moveTo(h.x0, h.y0); pth.lineTo(h.x1, h.y0); pth.lineTo(h.x1, h.y1); pth.lineTo(h.x0, h.y1); pth.closePath();
      sh.holes.push(pth);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1, steps: 1 });
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, wallContinuous);
    m.rotation.y = rotY;
    m.position.set(...pos);
    m.receiveShadow = true; m.castShadow = true;
    m.userData.noOutline = true; m.layers.set(1);
    root.add(m);
    return m;
  }

  /* ---------------- soft AO strips ---------------- */
  const aoTex = ctx.textureLib.get('aoEdge').map;
  const aoMatBase = new THREE.MeshBasicMaterial({
    map: aoTex, transparent: true, depthWrite: false, opacity: 0.5,
    color: 0x6f6a86, toneMapped: true, side: THREE.DoubleSide
  });
  function aoStrip(w, h, x, y, z, ry, rx = 0, opacity = 0.5) {
    const mat = aoMatBase.clone(); mat.opacity = opacity;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    m.userData.noOutline = true; m.layers.set(1);
    m.renderOrder = 1;
    root.add(m);
    return m;
  }
  // vertical wall-corner AO (facing into room, dark edge toward corner)
  const cAO = 0.34, cH = 2.6, cY = 1.3;
  aoStrip(cAO, cH, R.x0 + cAO / 2, cY, R.z0 + 0.006, 0, 0, 0.38);
  aoStrip(cAO, cH, R.x0 + 0.006, cY, R.z0 + cAO / 2, Math.PI / 2, 0, 0.38);
  aoStrip(cAO, cH, R.x1 - cAO / 2, cY, R.z0 + 0.006, 0, 0, 0.38);
  aoStrip(cAO, cH, R.x1 - 0.006, cY, R.z0 + cAO / 2, Math.PI / 2, 0, 0.38);
  aoStrip(cAO, cH, R.x0 + cAO / 2, cY, R.z1 - 0.006, Math.PI, 0, 0.38);
  aoStrip(cAO, cH, R.x0 + 0.006, cY, R.z1 - cAO / 2, Math.PI / 2, 0, 0.38);
  aoStrip(cAO, cH, R.x1 - cAO / 2, cY, R.z1 - 0.006, Math.PI, 0, 0.38);
  aoStrip(cAO, cH, R.x1 - 0.006, cY, R.z1 - cAO / 2, Math.PI / 2, 0, 0.38);
  // ceiling junction AO (dark at the top)
  const tAO = 0.30, tY = R.h - tAO / 2;
  aoStrip(4.2, tAO, 0, tY, R.z0 + 0.005, 0, 0, 0.45);
  aoStrip(4.2, tAO, 0, tY, R.z1 - 0.005, Math.PI, 0, 0.45);
  aoStrip(4.6, tAO, R.x0 + 0.005, tY, 0, Math.PI / 2, 0, 0.45);
  aoStrip(4.6, tAO, R.x1 - 0.005, tY, 0, -Math.PI / 2, 0, 0.45);

  /* ---------------- floor + ceiling ---------------- */
  const floor = kit.mesh(kit.rboxGeo(4.2, 0.14, 4.6, 0.02, 2), M.floor, {
    pos: [0, -0.07, 0], parent: root
  });
  floor.receiveShadow = true; floor.castShadow = false; noOutline(floor);

  const ceil = box(4.2, 0.1, 4.6, M.ceiling, 0, R.h + 0.05, 0, 0.01);
  ceil.castShadow = false;

  // crown moulding
  const crownY = R.h - 0.055;
  for (const [w,d,x,z] of [[4.2,0.07,0,R.z0+0.035],[4.2,0.07,0,R.z1-0.035],[0.07,4.6,R.x0+0.035,0],[0.07,4.6,R.x1-0.035,0]]) {
    const m = box(w, 0.07, d, M.trim, x, crownY, z, 0.01); m.castShadow = false;
  }

  /* ---------------- NORTH WALL (AC / window / posters) ---------------- */
  const nz = R.z0 - R.t / 2;
  wallWithHole(R.x0, R.x1, 0, R.h,
    [{ x0: NW.x0, x1: NW.x1, y0: NW.sill, y1: NW.head }],
    { pos: [0, 0, R.z0 - R.t] });

  // window reveal + frame
  const winW = NW.x1 - NW.x0, winH = NW.head - NW.sill, winCx = (NW.x0 + NW.x1) / 2;
  // reveal jambs
  box(0.05, winH, R.t + 0.02, M.trim, NW.x0 + 0.025, (NW.sill + NW.head) / 2, nz, 0.012);
  box(0.05, winH, R.t + 0.02, M.trim, NW.x1 - 0.025, (NW.sill + NW.head) / 2, nz, 0.012);
  box(winW, 0.05, R.t + 0.02, M.trim, winCx, NW.head - 0.025, nz, 0.012);
  // sill (protrudes into the room)
  const sill = box(winW + 0.14, 0.06, 0.22, M.trim, winCx, NW.sill - 0.03, R.z0 + 0.05, 0.02);
  sill.castShadow = true;
  // apron
  box(winW + 0.08, 0.09, 0.03, M.trim, winCx, NW.sill - 0.105, R.z0 + 0.015, 0.012);
  // casing
  box(0.075, winH + 0.2, 0.035, M.trim, NW.x0 - 0.04, (NW.sill + NW.head) / 2, R.z0 + 0.014, 0.012);
  box(0.075, winH + 0.2, 0.035, M.trim, NW.x1 + 0.04, (NW.sill + NW.head) / 2, R.z0 + 0.014, 0.012);
  box(winW + 0.23, 0.075, 0.035, M.trim, winCx, NW.head + 0.04, R.z0 + 0.014, 0.012);

  // sash frame
  const gz = R.z0 - 0.055;
  const fw = 0.045;
  box(winW, fw, 0.05, M.offWhite, winCx, NW.head - fw / 2, gz, 0.008);
  box(winW, fw, 0.05, M.offWhite, winCx, NW.sill + fw / 2, gz, 0.008);
  box(fw, winH, 0.05, M.offWhite, NW.x0 + fw / 2, (NW.sill + NW.head) / 2, gz, 0.008);
  box(fw, winH, 0.05, M.offWhite, NW.x1 - fw / 2, (NW.sill + NW.head) / 2, gz, 0.008);
  box(winW, 0.038, 0.052, M.offWhite, winCx, 1.5, gz, 0.006);
  box(0.034, winH - 0.1, 0.052, M.offWhite, winCx, (NW.sill + NW.head) / 2, gz, 0.006);

  // glass (2 panes)
  const glassMat = M.glass;
  const g1 = kit.mesh(kit.planeGeo(winW - 0.1, winH - 0.1), glassMat, { pos: [winCx, (NW.sill + NW.head) / 2, R.z0 - 0.075], parent: root });
  g1.userData.noOutline = true; g1.layers.set(1); g1.castShadow = false; g1.receiveShadow = false;

  /* ---------------- EAST WALL (bay window + shelf) ---------------- */
  const ex = R.x1 + R.t / 2;
  // local x = -world z, rotate +90deg so local +z -> world +x
  wallWithHole(R.z0, -R.z0, 0, R.h,
    [{ x0: -EW.z1, x1: -EW.z0, y0: EW.sill, y1: EW.head }],
    { pos: [R.x1, 0, 0], rotY: Math.PI / 2 });

  // bay window recess -------------------------------------------------
  const shelfZ0 = EW.z0, shelfZ1 = EW.z0 + 0.40;
  const glassZ0 = shelfZ1 + 0.02, glassZ1 = EW.z1;
  const recessX = R.x1 + EW.recess;
  // reveal surfaces
  box(EW.recess, 0.05, EW.z1 - EW.z0, M.trim, R.x1 + EW.recess / 2, EW.head - 0.025, (EW.z0 + EW.z1) / 2, 0.008);
  box(EW.recess, 0.05, EW.z1 - EW.z0, M.trim, R.x1 + EW.recess / 2, EW.sill + 0.025, (EW.z0 + EW.z1) / 2, 0.008);
  box(EW.recess, EW.head - EW.sill, 0.03, M.trim, R.x1 + EW.recess / 2, (EW.sill + EW.head) / 2, EW.z1, 0.004);
  // white backing for shelf niche
  box(0.02, EW.head - EW.sill, 0.42, M.offWhite, recessX + 0.02, (EW.sill + EW.head) / 2, (shelfZ0 + shelfZ1) / 2, 0.004);
  // niche casing
  box(0.05, EW.head - EW.sill, 0.04, M.trim, R.x1 + 0.03, (EW.sill + EW.head) / 2, shelfZ1 + 0.01, 0.01);
  box(0.05, 0.05, 0.44, M.trim, R.x1 + 0.03, EW.head - 0.025, (shelfZ0 + shelfZ1) / 2, 0.01);

  // deep sill / seat
  const esill = box(0.30, 0.06, EW.z1 - EW.z0 + 0.1, M.trim, R.x1 + 0.06, EW.sill - 0.03, (EW.z0 + EW.z1) / 2, 0.02);
  esill.castShadow = true;
  box(0.06, 0.12, EW.z1 - EW.z0 + 0.1, M.trim, R.x1 + 0.18, EW.sill - 0.12, (EW.z0 + EW.z1) / 2, 0.012);
  box(0.03, 0.07, EW.z1 - EW.z0 + 0.1, M.trim, R.x1 + 0.195, EW.sill - 0.085, (EW.z0 + EW.z1) / 2, 0.012);

  // window frame (glass area)
  const fx = R.x1 + 0.19;
  const gw = glassZ1 - glassZ0, gh = EW.head - EW.sill, gcz = (glassZ0 + glassZ1) / 2;
  box(0.06, gh, 0.05, M.offWhite, fx, (EW.sill + EW.head) / 2, glassZ0, 0.01);
  box(0.06, gh, 0.05, M.offWhite, fx, (EW.sill + EW.head) / 2, glassZ1, 0.01);
  box(0.06, 0.05, gw, M.offWhite, fx, EW.head - 0.025, gcz, 0.01);
  box(0.06, 0.05, gw, M.offWhite, fx, EW.sill + 0.025, gcz, 0.01);
  box(0.055, gh, 0.036, M.offWhite, fx, (EW.sill + EW.head) / 2, gcz, 0.008);
  box(0.055, 0.036, gw, M.offWhite, fx, 1.56, gcz, 0.008);
  // casing
  box(0.04, gh + 0.16, 0.07, M.trim, R.x1 + 0.01, (EW.sill + EW.head) / 2, EW.z0 - 0.02, 0.01);
  box(0.04, gh + 0.16, 0.07, M.trim, R.x1 + 0.01, (EW.sill + EW.head) / 2, EW.z1 + 0.02, 0.01);
  box(0.04, 0.07, gw + 0.2, M.trim, R.x1 + 0.01, EW.head + 0.035, gcz, 0.01);

  const g2 = kit.mesh(kit.planeGeo(gw, gh), glassMat, { pos: [fx + 0.012, (EW.sill + EW.head) / 2, gcz], rot: [0, -Math.PI / 2, 0], parent: root });
  g2.userData.noOutline = true; g2.layers.set(1); g2.castShadow = false; g2.receiveShadow = false;

  // recessed bookshelf inside bay niche
  {
    const z0 = shelfZ0 + 0.02, z1 = shelfZ1 - 0.02;
    const xBack = recessX - 0.005, depth = 0.22;
    const shelfYs = [EW.sill + 0.02, 1.275, 1.575, 1.875, EW.head - 0.02];
    // side cheeks
    box(depth, EW.head - EW.sill, 0.025, M.trim, xBack - depth / 2, (EW.sill + EW.head) / 2, z0, 0.006);
    box(depth, EW.head - EW.sill, 0.025, M.trim, xBack - depth / 2, (EW.sill + EW.head) / 2, z1, 0.006);
    for (let i = 0; i < shelfYs.length; i++) {
      const y = shelfYs[i];
      box(depth, 0.025, z1 - z0, M.trim, xBack - depth / 2, y, (z0 + z1) / 2, 0.006);
    }
    ctx.slots.bayShelf = {
      x: xBack - 0.09,
      z0: z0 + 0.02, z1: z1 - 0.02,
      shelves: shelfYs.slice(0, -1).map(y => ({ y: y + 0.0125, top: shelfYs[shelfYs.indexOf(y) + 1] }))
    };
  }

  // panelled window seat below bay window
  {
    const face = R.x1 - 0.012;
    box(0.07, EW.sill - 0.08, EW.z1 - EW.z0, M.offWhite, face - 0.035, (EW.sill - 0.08) / 2 + 0.08, (EW.z0 + EW.z1) / 2, 0.01);
    for (let i = 0; i < 9; i++) {
      const z = EW.z0 + 0.12 + i * ((EW.z1 - EW.z0 - 0.24) / 8);
      box(0.012, EW.sill - 0.24, 0.016, M.trim, face - 0.048, (EW.sill - 0.08) / 2 + 0.08, z, 0.004);
    }
    box(0.07, 0.06, EW.z1 - EW.z0 + 0.06, M.trim, face - 0.035, EW.sill - 0.055, (EW.z0 + EW.z1) / 2, 0.012);
    // solid returns close the bench ends cleanly
    box(0.30, EW.sill - 0.06, 0.045, M.offWhite, R.x1 + 0.06, (EW.sill - 0.06) / 2 + 0.06, EW.z0 + 0.025, 0.012);
    box(0.30, EW.sill - 0.06, 0.045, M.offWhite, R.x1 + 0.06, (EW.sill - 0.06) / 2 + 0.06, EW.z1 - 0.025, 0.012);
    // front apron under the pad overhang
    box(0.045, 0.14, EW.z1 - EW.z0, M.offWhite, R.x1 - 0.02, EW.sill - 0.10, (EW.z0 + EW.z1) / 2, 0.01);
  }

  /* ---------------- SOUTH WALL + DOOR ---------------- */
  const sz = R.z1 + R.t / 2;
  // local x = -world x, rotate 180deg
  wallWithHole(-R.x1, -R.x0, 0, R.h,
    [{ x0: -DOOR.x1, x1: -DOOR.x0, y0: 0, y1: DOOR.h }],
    { pos: [0, 0, R.z1], rotY: Math.PI });

  // door casing
  box(0.07, DOOR.h + 0.08, 0.04, M.trim, DOOR.x0 - 0.035, (DOOR.h + 0.08) / 2, R.z1 - 0.02, 0.012);
  box(0.07, DOOR.h + 0.08, 0.04, M.trim, DOOR.x1 + 0.035, (DOOR.h + 0.08) / 2, R.z1 - 0.02, 0.012);
  box(DOOR.x1 - DOOR.x0 + 0.14, 0.08, 0.04, M.trim, (DOOR.x0 + DOOR.x1) / 2, DOOR.h + 0.04, R.z1 - 0.02, 0.012);
  // door slab + panels
  const dcx = (DOOR.x0 + DOOR.x1) / 2;
  const doorTex = ctx.textureLib.get('wood', { color: '#d9bb95', contrast: 0.4 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: doorTex.map, normalMap: doorTex.normalMap, roughness: 0.58, metalness: 0, envMapIntensity: 0.5 });
  const doorInsetMat = new THREE.MeshStandardMaterial({ color: 0xd6b78f, roughness: 0.62, metalness: 0 });
  const door = box(DOOR.x1 - DOOR.x0 - 0.02, DOOR.h - 0.02, 0.045, doorMat, dcx, (DOOR.h - 0.02) / 2 + 0.01, R.z1 - 0.055, 0.012);
  door.castShadow = true;
  const panel = (x, y, w, h) => {
    box(w, h, 0.012, doorInsetMat, dcx + x, y, R.z1 - 0.082, 0.012);
    box(w - 0.03, h - 0.03, 0.008, doorMat, dcx + x, y, R.z1 - 0.089, 0.01);
  };
  panel(0, 1.58, 0.6, 0.56);
  panel(0, 0.72, 0.6, 0.84);
  // knob + tiny charm
  const knob = kit.mesh(kit.sphereGeo(0.028, 16), M.brass, { pos: [DOOR.x1 - 0.11, 1.02, R.z1 - 0.095], parent: root });
  kit.mesh(kit.cylGeo(0.012, 0.012, 0.035, 12), M.brass, { pos: [DOOR.x1 - 0.11, 1.02, R.z1 - 0.075], rot: [Math.PI / 2, 0, 0], parent: root });
  kit.mesh(kit.sphereGeo(0.016, 12), M.pink, { pos: [DOOR.x1 - 0.11, 0.95, R.z1 - 0.10], parent: root });

  // light switch
  const sw = kit.mesh(kit.rboxGeo(0.075, 0.11, 0.012, 0.006, 1), M.offWhite, { pos: [DOOR.x1 + 0.16, 1.18, R.z1 - 0.078], parent: root });
  box(0.028, 0.045, 0.012, M.trim, DOOR.x1 + 0.16, 1.18, R.z1 - 0.087, 0.004);
  ctx.registerInteract(sw, {
    id: 'ceilingSwitch', label: 'Ceiling light',
    onUse: () => ctx.setLamp('ceiling', !ctx.lights.lampState.ceiling)
  });

  /* ---------------- WEST WALL ---------------- */
  const wx = R.x0 - R.t / 2;
  const west = kit.mesh(kit.boxGeo(R.t, R.h + 0.012, 4.6 + 0.2), wallContinuous, {
    pos: [wx, R.h / 2, 0], parent: root
  });
  west.receiveShadow = true; noOutline(west);

  /* ---------------- baseboards ---------------- */
  const baseH = 0.085, baseD = 0.022;
  const bMat = M.baseboard;
  box(4.2, baseH, baseD, bMat, 0, baseH / 2, R.z0 + baseD / 2, 0.006);
  box(4.2, baseH, baseD, bMat, 0, baseH / 2, R.z1 - baseD / 2, 0.006);
  box(baseD, baseH, 4.6, bMat, R.x0 + baseD / 2, baseH / 2, 0, 0.006);
  box(baseD, baseH, 4.6, bMat, R.x1 - baseD / 2, baseH / 2, 0, 0.006);
  // door gap correction (tiny caps)
  box(0.03, baseH, baseD, bMat, DOOR.x0 - 0.015, baseH / 2, R.z1 - baseD / 2, 0.006);
  box(0.03, baseH, baseD, bMat, DOOR.x1 + 0.015, baseH / 2, R.z1 - baseD / 2, 0.006);

  /* ---------------- AC unit ---------------- */
  const ac = new THREE.Group();
  ac.position.set(-1.55, 2.285, R.z0 + 0.115);
  root.add(ac);
  const acBody = kit.mesh(kit.rboxGeo(0.92, 0.27, 0.235, 0.05, 3), M.acBody, { parent: ac });
  kit.mesh(kit.rboxGeo(0.86, 0.055, 0.03, 0.02, 1), M.whitePlastic, { pos: [0, 0.1, 0.11], parent: ac });
  // front panel inset
  kit.mesh(kit.rboxGeo(0.8, 0.13, 0.012, 0.01, 1), M.offWhite, { pos: [0, 0.005, 0.12], parent: ac });
  // bottom vent recess
  const vent = kit.mesh(kit.rboxGeo(0.78, 0.06, 0.02, 0.01, 1), M.blackGloss, { pos: [0, -0.075, 0.115], parent: ac });
  vent.material = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.7 });
  // louvre flap (animated)
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, -0.092, 0.105);
  ac.add(flapPivot);
  const flap = kit.mesh(kit.rboxGeo(0.76, 0.05, 0.02, 0.008, 1), M.acBody, { parent: flapPivot });
  flap.position.set(0, -0.02, 0.008);
  // display + led
  kit.mesh(kit.rboxGeo(0.06, 0.022, 0.006, 0.003, 1), M.blackGloss, { pos: [0.35, 0.02, 0.128], parent: ac });
  const led = kit.mesh(kit.sphereGeo(0.007, 10), new THREE.MeshStandardMaterial({ color: 0x7dffa5, emissive: 0x57ff8c, emissiveIntensity: 1.4 }), { pos: [0.28, -0.01, 0.13], parent: ac });
  // brand line
  kit.mesh(kit.rboxGeo(0.1, 0.012, 0.004, 0.002, 1), M.metalSoft, { pos: [-0.3, 0.02, 0.128], parent: ac });
  // side seams
  box(0.006, 0.24, 0.01, M.offWhite, -1.55 + 0.44, 2.285, R.z0 + 0.222, 0.002);
  box(0.006, 0.24, 0.01, M.offWhite, -1.55 - 0.44, 2.285, R.z0 + 0.222, 0.002);

  let acOn = false, acAngle = 0, acTarget = 0;
  ctx.updatables.push((dt) => {
    acAngle += (acTarget - acAngle) * Math.min(1, dt * 6);
    flapPivot.rotation.x = acAngle;
    const targetLed = acOn ? 1.8 : 0.5;
    led.material.emissiveIntensity += (targetLed - led.material.emissiveIntensity) * Math.min(1, dt * 4);
  });
  ctx.registerInteract(acBody, {
    id: 'ac', label: 'Air conditioner',
    onUse: () => {
      acOn = !acOn;
      acTarget = acOn ? 0.5 : 0;
      led.material.color.setHex(acOn ? 0x7dffa5 : 0xffac6a);
      led.material.emissive.setHex(acOn ? 0x57ff8c : 0xff8a4a);
      ctx.audio?.click(acOn ? 880 : 620);
      ctx.toast?.(acOn ? 'Air conditioner on · cool breeze' : 'Air conditioner off');
    }
  });

  /* ---------------- curtains ---------------- */
  const rodY = 2.08, rodZ = R.z0 + 0.145;
  const rod = kit.mesh(kit.cylGeo(0.016, 0.016, 1.3, 16), M.woodMid, {
    pos: [winCx, rodY, rodZ], rot: [0, 0, Math.PI / 2], parent: root
  });
  kit.mesh(kit.sphereGeo(0.035, 16), M.woodMid, { pos: [winCx - 0.66, rodY, rodZ], parent: root });
  kit.mesh(kit.sphereGeo(0.035, 16), M.woodMid, { pos: [winCx + 0.66, rodY, rodZ], parent: root });
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const ring = kit.mesh(new THREE.TorusGeometry(0.033, 0.005, 6, 16), M.brass, {
      pos: [winCx - 0.58 + t * 1.16, rodY - 0.012, rodZ], rot: [0, 0, 0], parent: root
    });
    ring.castShadow = false;
  }

  const curtainPanels = [];
  function makeCurtain(side, cx) {
    const w = 0.26, h = 1.5;
    const geo = new THREE.PlaneGeometry(w, h, 40, 28);
    geo.translate(0, -h / 2, 0);
    const pos = geo.attributes.position;
    const base = new Float32Array(pos.array.length);
    base.set(pos.array);
    const mesh = new THREE.Mesh(geo, M.curtain);
    mesh.position.set(cx, rodY - 0.02, rodZ - 0.04);
    mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.userData.noOutline = true; mesh.layers.set(1);
    mesh.renderOrder = 2;
    root.add(mesh);
    const panel = { mesh, geo, base, side, cx, phase: side * 1.7, open: 0, openTarget: 0 };
    curtainPanels.push(panel);
    return panel;
  }
  makeCurtain(-1, NW.x0 + 0.03);
  makeCurtain(1, NW.x1 - 0.045);

  ctx.updatables.push((dt, t) => {
    for (const p of curtainPanels) {
      p.open += (p.openTarget - p.open) * Math.min(1, dt * 4);
      const pos = p.geo.attributes.position;
      const arr = pos.array, base = p.base;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = base[i], by = base[i + 1];
        const v = (by + 1.5) / 1.5; // 1 at top
        const gathered = 0.86 + 0.14 * v;
        const foldAmp = (0.046 + 0.012 * Math.sin(t * 1.3 + p.phase)) * (1 - p.open * 0.7);
        const fold = (Math.sin((bx / 0.26) * Math.PI * 3.4 + p.phase + Math.sin(t * 0.7 + p.phase) * 0.25) * 0.75 + Math.sin((bx / 0.34) * Math.PI * 9.1 + 0.6) * 0.25) * foldAmp;
        const sway = Math.sin(t * 0.9 + p.phase + v * 1.4) * 0.012 * (1 - v * 0.4);
        const hem = Math.pow(1 - v, 3) * Math.sin((bx / 0.26) * Math.PI * 3.4 + p.phase) * 0.012;
        arr[i] = bx * gathered;
        arr[i + 1] = by + hem;
        arr[i + 2] = base[i + 2] + fold * (0.55 + v * 1.15) + sway;
      }
      pos.needsUpdate = true;
      p.geo.computeVertexNormals();
      p.mesh.position.x = p.cx + p.side * p.open * 0.42;
      p.mesh.scale.x = 1 - p.open * 0.45;
    }
  });
  let curtainsOpen = false;
  const curtainHit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 0.35), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  curtainHit.position.set(winCx, 1.35, R.z0 + 0.15);
  curtainHit.userData.noOutline = true;
  curtainHit.layers.set(1);
  root.add(curtainHit);
  ctx.registerInteract(curtainHit, {
    id: 'curtains', label: 'Curtains',
    onUse: () => {
      curtainsOpen = !curtainsOpen;
      for (const p of curtainPanels) p.openTarget = curtainsOpen ? 1 : 0;
      ctx.audio?.cloth();
      ctx.toast?.(curtainsOpen ? 'Curtains opened · hello sunshine' : 'Curtains closed · cozy again');
    }
  });

  /* ---------------- ceiling light ---------------- */
  {
    const cy = R.h - 0.01;
    kit.mesh(kit.cylGeo(0.19, 0.19, 0.02, 28), M.trim, { pos: [0.1, cy - 0.01, 0.35], parent: root }).castShadow = false;
    const domeMat = M.ceilingDome.clone();
    const dome = kit.mesh(new THREE.SphereGeometry(0.165, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), domeMat, {
      pos: [0.1, cy - 0.015, 0.35], parent: root
    });
    dome.castShadow = false; dome.receiveShadow = false;
    const bulb = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe0b0, emissiveIntensity: 0, roughness: 0.4 });
    const bulbMesh = kit.mesh(kit.sphereGeo(0.06, 14), bulb, { pos: [0.1, cy - 0.05, 0.35], parent: root, cast: false });
    ctx.lights.fixtures.ceiling = { shadeMat: domeMat, bulbMat: bulb };
    ctx.registerInteract(dome, {
      id: 'ceilingLamp', label: 'Ceiling light',
      onUse: () => { ctx.setLamp('ceiling', !ctx.lights.lampState.ceiling); ctx.audio?.click(ctx.lights.lampState.ceiling ? 940 : 600); }
    });
  }

  /* ---------------- door-side wall details ---------------- */
  // little outlet near nightstand
  const outlet = kit.mesh(kit.rboxGeo(0.08, 0.11, 0.012, 0.006, 1), M.offWhite, { pos: [-1.85, 0.3, R.z0 + 0.008], parent: root });
  // cable to bedside lamp
  kit.tube([[-1.85, 0.26, R.z0 + 0.02], [-1.72, 0.1, -2.17], [-1.4, 0.02, -2.05], [-1.15, 0.02, -1.9], [-1.02, 0.18, -2.0]], 0.007, M.metalDark, 32, 6);

  /* ---------------- outside world (window backdrops) ---------------- */
  const skyNMat = new THREE.MeshBasicMaterial({
    map: ctx.textureLib.get('skyGolden').map, toneMapped: true, color: 0xffffff
  });
  const skyN = kit.mesh(kit.planeGeo(16, 8), skyNMat, {
    pos: [-1.48, 2.0, -6.5], parent: root, cast: false, receive: false
  });
  skyN.userData.noOutline = true; skyN.layers.set(1);
  const skyEMat = new THREE.MeshBasicMaterial({
    map: ctx.textureLib.get('skyGolden').map, toneMapped: true, color: 0xffffff
  });
  const skyE = kit.mesh(kit.planeGeo(16, 8), skyEMat, {
    pos: [6.5, 2.0, -1.2], rot: [0, -Math.PI / 2, 0], parent: root, cast: false, receive: false
  });
  skyE.userData.noOutline = true; skyE.layers.set(1);
  ctx.lights.skyMaterials.north = skyNMat;
  ctx.lights.skyMaterials.east = skyEMat;

  // sun glow cards outside windows
  const glowMat = new THREE.MeshBasicMaterial({
    map: ctx.textureLib.get('dust').map, color: 0xffe7c0, transparent: true,
    opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const glowN = kit.mesh(kit.planeGeo(0.9, 0.9), glowMat, { pos: [-1.35, 2.5, -3.4], parent: root, cast: false, receive: false });
  glowMat.opacity = 0.16;
  glowN.userData.noOutline = true; glowN.layers.set(1);
  const glowMat2 = glowMat.clone();
  const glowE = kit.mesh(kit.planeGeo(1.4, 1.4), glowMat2, { pos: [3.5, 2.5, -1.1], rot: [0, -Math.PI / 2, 0], parent: root, cast: false, receive: false });
  glowMat2.opacity = 0.16;
  glowE.userData.noOutline = true; glowE.layers.set(1);

  /* ---------------- volumetric shafts ---------------- */
  const shaftTex = ctx.textureLib.get('shaft').map;
  function addShaft(w, h, pos, rot, color = 0xffe2b4, opacity = 0.32) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTex: { value: shaftTex }, uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }, uTime: { value: 0 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity, uTime;
        varying vec2 vUv;
        void main(){
          vec4 t = texture2D(uTex, vUv);
          float flick = 0.85 + 0.15 * sin(uTime * 0.8 + vUv.y * 4.0);
          gl_FragColor = vec4(uColor, t.a * uOpacity * flick);
        }`
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos); m.rotation.set(...rot);
    m.userData.noOutline = true; m.layers.set(1); m.renderOrder = 2;
    root.add(m);
    mat.userData = { scale: opacity / 0.32 };
    ctx.lights.shaftMaterials.push(mat);
    ctx.updatables.push((dt, t) => { mat.uniforms.uTime.value = t; });
    return m;
  }
  // volumetric shafts disabled: they crossed the ceiling; sun shadows + dust carry the mood

  // floor warmth: soft warm bounce card near window (invisible but lights floor)
  const warmCard = kit.mesh(kit.planeGeo(2.6, 2.2), new THREE.MeshBasicMaterial({
    color: 0xffc98f, transparent: true, opacity: 0.025, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  }), { pos: [1.1, 0.02, -0.7], rot: [-Math.PI / 2, 0, 0], parent: root, cast: false, receive: false });
  warmCard.userData.noOutline = true; warmCard.layers.set(1);

  /* ---------------- colliders ---------------- */
  ctx.addColliderBox(new THREE.Box3(new THREE.Vector3(R.x0, 0, R.z0), new THREE.Vector3(R.x0 + 0.2, R.h, R.z1)));
  ctx.addColliderBox(new THREE.Box3(new THREE.Vector3(R.x1 - 0.2, 0, R.z0), new THREE.Vector3(R.x1, R.h, R.z1)));
  ctx.addColliderBox(new THREE.Box3(new THREE.Vector3(R.x0, 0, R.z0), new THREE.Vector3(R.x1, R.h, R.z0 + 0.2)));
  ctx.addColliderBox(new THREE.Box3(new THREE.Vector3(R.x0, 0, R.z1 - 0.2), new THREE.Vector3(R.x1, R.h, R.z1)));
  // window seat base
  ctx.addColliderBox(new THREE.Box3(new THREE.Vector3(R.x1 - 0.25, 0, EW.z0), new THREE.Vector3(R.x1, 1.1, EW.z1)));

  return root;
}
