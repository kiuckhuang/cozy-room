// Furniture + soft goods: bed, rugs, nightstand (+bedside lamp), headboard
// hutch shelf, desk, ladder-back chair, pedal bin.
// Everything is procedural geometry; positions follow ROOM_SPEC.md.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import kit from './kit.js';

const { rboxGeo, boxGeo, cylGeo, sphereGeo, mesh, group } = kit;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ *
 * local helpers
 * ------------------------------------------------------------------ */

/** Merge a list of {geo,pos,rot,scale} into one mesh (one draw call). */
function mergeParts(entries, material, { cast = true, receive = true, name = 'merged' } = {}) {
  const geos = [];
  for (const e of entries) {
    const src = e.geo;
    const g = src.index ? src.toNonIndexed() : src.clone();
    const pos = e.pos || [0, 0, 0];
    const rot = e.rot || [0, 0, 0];
    const sc = e.scale;
    const s = sc == null ? [1, 1, 1] : (typeof sc === 'number' ? [sc, sc, sc] : sc);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(s[0], s[1], s[2])
    );
    g.applyMatrix4(m);
    geos.push(g);
  }
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  const m = new THREE.Mesh(merged, material);
  m.name = name;
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

/** Points around a rounded rectangle, in a local 2-D plane. */
function loopPoints2D(w, h, r, seg = 5) {
  const hw = w / 2, hh = h / 2;
  r = Math.max(0.0001, Math.min(r, hw, hh));
  const pts = [];
  const push = (x, y) => {
    const p = pts[pts.length - 1];
    if (p && Math.hypot(p[0] - x, p[1] - y) < 1e-5) return;
    pts.push([x, y]);
  };
  const arc = (cx, cy, a0, a1) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  push(hw, -hh + r); push(hw, 0); push(hw, hh - r);
  arc(hw - r, hh - r, 0, Math.PI / 2);
  push(0, hh); push(-hw + r, hh);
  arc(-hw + r, hh - r, Math.PI / 2, Math.PI);
  push(-hw, 0); push(-hw, -hh + r);
  arc(-hw + r, -hh + r, Math.PI, Math.PI * 1.5);
  push(0, -hh); push(hw - r, -hh);
  arc(hw - r, -hh + r, Math.PI * 1.5, TAU);
  return pts;
}

/** Closed piping cord following a rounded rectangle, laid flat (XZ plane). */
function pipingLoop(w, d, r, y, material, tubeR = 0.0055) {
  const pts = loopPoints2D(w, d, r).map(([x, z]) => V(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, Math.max(40, pts.length * 2), tubeR, 6, true);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Closed welt cord in a pillow's local XY plane. */
function pipingLoopXY(w, h, r, z, material, tubeR = 0.0075) {
  const pts = loopPoints2D(w, h, r).map(([x, y]) => V(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, Math.max(40, pts.length * 2), tubeR, 6, true);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Flat, softly beveled rug slab lying on the floor (centre y ~= 0). */
function rugGeometry(w, d, r, depth, bevel) {
  const shape = kit.roundedRectShape(w, d, r);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 2, curveSegments: 8, steps: 1
  });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/* ------------------------------------------------------------------ *
 * BED — custom draped duvet (stripes run head -> foot, soft cloth folds)
 * ------------------------------------------------------------------ */
const BED = { x: 0.70, z: -1.30 };
const DU = {
  HW: 0.69,            // half width of the duvet top
  OUT: 0.750,          // outer x of the hanging side cloth
  Y_EDGE: 0.600,       // top height at the rounded edge
  Y_CENTER: 0.662,     // fluffy centre height
  Y_CORNER: 0.474,     // top of the vertical side drape
  Y_BOT: 0.322,        // hem height (just above the white platform)
  Z0: -0.66,           // local head end of the duvet body
  Z1: 0.985,           // local foot edge
  FOOT_R: 0.078,
  U_SCALE: 1.5         // stripe repeats across the width
};
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** Top surface height of the duvet at local x (also used by the foot drape). */
function duvetTopY(x) {
  const ax = Math.abs(x);
  if (ax <= DU.HW) {
    const t = x / DU.HW;
    return DU.Y_CENTER - (DU.Y_CENTER - DU.Y_EDGE) * t * t;
  }
  const t = Math.min(1, (ax - DU.HW) / (DU.OUT - DU.HW));
  const th = (Math.PI / 2) * (1 - t);
  return DU.Y_CORNER + (DU.Y_EDGE - DU.Y_CORNER) * Math.sin(th);
}

/** Visible height of the duvet top: loft ridges + broad creases + gathers. */
function duvetTopSurfaceY(x, z) {
  const t = x / DU.HW;                       // -1..1 across the bed
  const v = (z - DU.Z0) / (DU.Z1 - DU.Z0);
  const base = duvetTopY(x);
  // soft lengthwise folds (they run head -> foot)
  const ridge = 0.0090 * Math.sin(t * Math.PI * 1.25 + z * 0.35 + 0.6)
    + 0.0048 * Math.sin(t * Math.PI * 2.8 + z * 0.9 - 0.4)
    + 0.0022 * Math.sin(t * Math.PI * 5.3 + z * 1.7 + 1.1);
  // broad diagonal creases
  const c1 = Math.exp(-Math.pow((z - 0.30 + x * 0.60) / 0.40, 2));
  const c2 = Math.exp(-Math.pow((z + 0.30 - x * 0.75) / 0.28, 2));
  const c3 = Math.exp(-Math.pow((z - 0.845) / 0.115, 2));
  // fine gathered cloth, stronger toward the foot
  const gather = 0.0030 * Math.sin(z * 11.0 + x * 6.2) + 0.0018 * Math.sin(z * 19.0 - x * 3.4);
  return base + ridge * (0.72 + 0.55 * v) + gather * (0.5 + 0.9 * v)
    + 0.0055 * Math.sin(z * 3.4 + 0.4)
    + 0.0140 * c1 - 0.0110 * c2 - 0.0105 * c3;
}

function duvetCrossSection() {
  const { HW, OUT, Y_EDGE, Y_CENTER, Y_CORNER, Y_BOT } = DU;
  const R = OUT - HW, RY = Y_EDGE - Y_CORNER;
  const SIDE = 5, CORNER = 5, TOP = 15;
  const prof = [];
  for (let i = 0; i <= SIDE; i++) {
    const t = i / SIDE;
    prof.push([-OUT, Y_BOT + (Y_CORNER - Y_BOT) * (t * t * 0.35 + t * 0.65), 2]);
  }
  for (let i = 1; i <= CORNER; i++) {
    const th = Math.PI - (Math.PI / 2) * (i / CORNER);
    prof.push([-HW + R * Math.cos(th), Y_CORNER + RY * Math.sin(th), 1]);
  }
  for (let i = 1; i <= TOP; i++) {
    const t = -1 + (2 * i) / TOP;
    prof.push([HW * t, Y_CENTER - (Y_CENTER - Y_EDGE) * t * t, 0]);
  }
  for (let i = 1; i <= CORNER; i++) {
    const th = (Math.PI / 2) * (1 - i / CORNER);
    prof.push([HW + R * Math.cos(th), Y_CORNER + RY * Math.sin(th), 1]);
  }
  for (let i = 1; i <= SIDE; i++) {
    const t = 1 - i / SIDE;
    prof.push([OUT, Y_BOT + (Y_CORNER - Y_BOT) * (t * t * 0.35 + t * 0.65), 2]);
  }
  return prof;
}

/** One point of the duvet body surface (shared with the hem piping). */
function duvetProfilePoint(px, py, kind, z) {
  const v = (z - DU.Z0) / (DU.Z1 - DU.Z0);
  const ax = Math.abs(px);
  const sideAmt = clamp01((ax - DU.HW * 0.6) / (DU.OUT - DU.HW * 0.6));
  const hemAmt = clamp01((DU.Y_CORNER - py) / (DU.Y_CORNER - DU.Y_BOT));
  let x = px, y = py;
  if (kind === 0) {
    y = duvetTopSurfaceY(px, z);
  } else {
    let wr = 0.0042 * Math.sin(z * 9.5 + px * 2.4)
      + 0.0026 * Math.sin(z * 4.6 - px * 5.1 + 0.8)
      + 0.0017 * Math.sin(z * 17.0 + px * 1.2);
    wr *= 0.5 + 0.8 * sideAmt + 0.45 * v;
    y += wr;
    if (hemAmt > 0) {
      // gathered side cloth: soft horizontal fold bands + a wavy hem
      y += 0.0145 * Math.sin(z * 6.5 + 0.9) * hemAmt;
      y += 0.0072 * Math.sin(z * 10.7 + 2.0) * hemAmt * hemAmt;
      x += Math.sign(px) * (0.0080 * Math.sin(z * 5.8 + 1.3) * hemAmt + 0.0062 * hemAmt * hemAmt);
    }
    x += 0.0025 * Math.sin(z * 8.0 + py * 5.0) * sideAmt;
  }
  return [x, y];
}

/** Body of the duvet: puffed top + softly wrinkled side drapes. */
function duvetBodyGeometry() {
  const prof = duvetCrossSection();
  const cols = prof.length;
  const rows = 38;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const idx = [];
  for (let j = 0; j < rows; j++) {
    const v = j / (rows - 1);
    const z = DU.Z0 + (DU.Z1 - DU.Z0) * v;
    for (let i = 0; i < cols; i++) {
      const [px, py, kind] = prof[i];
      const [x, y] = duvetProfilePoint(px, py, kind, z);
      const o = (j * cols + i) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      // stripes run head -> foot: U follows the cross-section, V follows z
      const uo = (j * cols + i) * 2;
      uv[uo] = (i / (cols - 1)) * DU.U_SCALE; uv[uo + 1] = v;
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Hem of the duvet foot drape (shared by the cloth surface and its piping). */
function duvetFootHemPoint(x0) {
  const hemY = DU.Y_BOT + 0.016 * Math.sin(x0 * 10.0 + 0.6) + 0.006 * Math.sin(x0 * 19.0 + 2.2);
  return [
    x0,
    hemY + 0.0085 * Math.sin(x0 * 14.0 + 1.1) + 0.0050 * Math.sin(x0 * 6.4 - 0.3),
    DU.Z1 + DU.FOOT_R + 0.022 + 0.011 * Math.sin(x0 * 12.0 + 0.4) + 0.006 * Math.sin(x0 * 5.2 + 1.9)
  ];
}

/** Cloth hanging over the foot end, folding around a rounded edge. */
function duvetFootGeometry() {
  const colsX = 31;
  const rows = 12;
  const bendT = 0.42;
  const pos = new Float32Array(colsX * rows * 3);
  const uv = new Float32Array(colsX * rows * 2);
  const idx = [];
  for (let j = 0; j < rows; j++) {
    const tt = j / (rows - 1);
    for (let i = 0; i < colsX; i++) {
      const ux = i / (colsX - 1);
      const x0 = -0.7485 + 1.497 * ux;
      const yTop = duvetTopSurfaceY(x0, DU.Z1);
      const hem = duvetFootHemPoint(x0);
      let dz, drop, q;
      if (tt <= bendT) {
        const a = (tt / bendT) * (Math.PI / 2);
        dz = DU.FOOT_R * Math.sin(a);
        drop = DU.FOOT_R * (1 - Math.cos(a));
        q = 0;
      } else {
        q = (tt - bendT) / (1 - bendT);
        dz = DU.FOOT_R + 0.022 * q * q;
        drop = DU.FOOT_R + q * Math.max(0.02, yTop - DU.FOOT_R - hem[1]);
      }
      let z = DU.Z1 + dz;
      let y = yTop - drop;
      y += 0.0085 * Math.sin(x0 * 14.0 + 1.1) * q + 0.0045 * Math.sin(x0 * 6.4 - 0.3) * q;
      z += 0.0100 * Math.sin(x0 * 12.0 + 0.4) * q * q + 0.0055 * Math.sin(x0 * 5.2 + 1.9) * q;
      const o = (j * colsX + i) * 3;
      pos[o] = x0; pos[o + 1] = y; pos[o + 2] = z;
      const uo = (j * colsX + i) * 2;
      uv[uo] = ux * DU.U_SCALE; uv[uo + 1] = 1.0 + 0.20 * tt;
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < colsX - 1; i++) {
      const a = j * colsX + i, b = a + 1, c = a + colsX, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Soft piping cord following the duvet hem (sides + foot). */
function duvetHemCurvePoints() {
  const pts = [];
  const nz = 18, nx = 22;
  for (let k = 0; k <= nz; k++) {
    const z = DU.Z0 + 0.02 + (DU.Z1 - DU.Z0 - 0.02) * (k / nz);
    const [x, y] = duvetProfilePoint(-DU.OUT, DU.Y_BOT, 2, z);
    pts.push(V(x - 0.001, y + 0.004, z));
  }
  for (let k = 0; k <= nx; k++) {
    const x0 = -0.742 + 1.484 * (k / nx);
    const [x, y, z] = duvetFootHemPoint(x0);
    pts.push(V(x, y + 0.004, z));
  }
  for (let k = 0; k <= nz; k++) {
    const z = DU.Z1 - (DU.Z1 - DU.Z0 - 0.02) * (k / nz);
    const [x, y] = duvetProfilePoint(DU.OUT, DU.Y_BOT, 2, z);
    pts.push(V(x + 0.001, y + 0.004, z));
  }
  return pts;
}

/** Turned-back plain edge at the head of the duvet. */
function turnoverGeometry() {
  const cols = 17, rows = 4;
  const z0 = -0.678, z1 = -0.525;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const idx = [];
  for (let j = 0; j < rows; j++) {
    const v = j / (rows - 1);
    const z = z0 + (z1 - z0) * v;
    for (let i = 0; i < cols; i++) {
      const t = -1 + (2 * i) / (cols - 1);
      const x = t * 0.664;
      let y = duvetTopSurfaceY(x, z) + 0.022;
      const o = (j * cols + i) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      const uo = (j * cols + i) * 2;
      uv[uo] = i / (cols - 1); uv[uo + 1] = v;
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Puffy pinstripe pillow (rounded box + displacement + welt). */
function pillowGeometry(w, h, t, r) {
  const geo = rboxGeo(w, h, t, r, 4).clone();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = x / (w * 0.5), ny = y / (h * 0.5);
    const d2 = Math.min(1, nx * nx * 0.82 + ny * ny * 0.82);
    const puff = Math.max(0, 1 - d2 * d2);
    const zAmt = Math.min(1, Math.abs(z) / (t * 0.5));
    pos.setZ(i, z + Math.sign(z) * puff * 0.042 * zAmt);
    // soften the vertical edge into a knife-ish seam
    pos.setX(i, x * (1 - 0.035 * zAmt * puff));
    pos.setY(i, y * (1 - 0.030 * zAmt * puff));
  }
  geo.computeVertexNormals();
  return geo;
}

/** Puffy seat cushion (rounded slab with a soft pouf + squashed edges). */
function cushionGeometry(w, d, t, r) {
  const geo = rboxGeo(w, t, d, r, 4).clone();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = x / (w * 0.5), nz = z / (d * 0.5);
    const d2 = Math.min(1, nx * nx * 0.80 + nz * nz * 0.80);
    const puff = Math.max(0, 1 - d2 * d2);
    const yAmt = Math.min(1, Math.abs(y) / (t * 0.5));
    pos.setY(i, y + Math.sign(y) * puff * 0.021 * yAmt);
    pos.setX(i, x * (1 - 0.045 * yAmt * puff));
    pos.setZ(i, z * (1 - 0.045 * yAmt * puff));
  }
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ *
 * materials (local clones only)
 * ------------------------------------------------------------------ */
function makeMaterials(ctx) {
  const M = ctx.materials;
  const softWhite = M.sheet.clone();
  softWhite.color.setHex(0xfbfcff);
  softWhite.side = THREE.DoubleSide;

  const bedBase = M.sheet.clone();
  bedBase.color.setHex(0xf7fafd);
  bedBase.roughness = 0.94;

  const duvetMat = M.duvet.clone();
  duvetMat.side = THREE.DoubleSide;
  duvetMat.shadowSide = THREE.FrontSide;
  duvetMat.color.setHex(0xf0f6fd);
  duvetMat.sheen = 0.65;

  const sheetMat = M.sheet.clone();
  sheetMat.side = THREE.DoubleSide;

  const piping = new THREE.MeshPhysicalMaterial({
    color: 0xb7d3ef, roughness: 0.62, metalness: 0,
    sheen: 0.5, sheenColor: new THREE.Color(0xdfeeff), envMapIntensity: 0.5
  });
  const pipingSoft = new THREE.MeshStandardMaterial({ color: 0xeaf3fb, roughness: 0.62, metalness: 0 });

  const crate = M.cream.clone();
  crate.color.setHex(0xf2ebdb);
  crate.roughness = 0.55;

  const darkGap = new THREE.MeshStandardMaterial({ color: 0x6f5a45, roughness: 0.9, metalness: 0 });
  const shadowWood = new THREE.MeshStandardMaterial({ color: 0x9c7a55, roughness: 0.72 });

  // pale, low-contrast oak generated through the shared texture library
  const paleOakTex = ctx.texture('wood', { color: '#d3b58c', contrast: 0.58 });
  const paleMidTex = ctx.texture('wood', { color: '#bfa077', contrast: 0.62 });
  const woodMat = (tex, tint, rep, rough) => {
    const map = tex.map.clone();
    map.repeat.set(rep, rep); map.needsUpdate = true;
    const nrm = tex.normalMap.clone();
    nrm.repeat.set(rep, rep); nrm.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      color: tint, map, normalMap: nrm,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: rough, metalness: 0, envMapIntensity: 0.55
    });
  };
  const oak = woodMat(paleOakTex, 0xffffff, 2.4, 0.44);
  const oakMid = woodMat(paleMidTex, 0xf6f0e7, 1.8, 0.5);
  const oakHead = woodMat(paleOakTex, 0xfffcf6, 2.0, 0.40);

  // pinstripe pillows: rotate the weave so the lines run along the pillow
  const pMap = M.pillow.map.clone();
  pMap.center.set(0.5, 0.5); pMap.rotation = Math.PI / 2; pMap.repeat.set(1.6, 1.0); pMap.needsUpdate = true;
  const pNrm = M.pillow.normalMap.clone();
  pNrm.center.set(0.5, 0.5); pNrm.rotation = Math.PI / 2; pNrm.repeat.set(1.6, 1.0); pNrm.needsUpdate = true;
  const pillowMat = M.pillow.clone();
  pillowMat.map = pMap; pillowMat.normalMap = pNrm;

  // mint seat cushion: finer weave than the big rug texture
  const cMap = M.mint.map.clone(); cMap.repeat.set(3.4, 3.4); cMap.needsUpdate = true;
  const cNrm = M.mint.normalMap.clone(); cNrm.repeat.set(3.4, 3.4); cNrm.needsUpdate = true;
  const cushionMint = new THREE.MeshPhysicalMaterial({
    color: 0xd9f0e5, map: cMap, normalMap: cNrm,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.93, metalness: 0, sheen: 0.45, sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0xffffff), envMapIntensity: 0.4
  });

  const ceramicCream = M.ceramicWhite.clone();
  ceramicCream.color.setHex(0xf4edde);
  ceramicCream.roughness = 0.28;

  const lampShadeMat = M.lampShade.clone();
  lampShadeMat.color.setHex(0xf7d98a);
  lampShadeMat.emissive.setHex(0xffcf7a);
  lampShadeMat.emissiveIntensity = 0;
  const lampBulbMat = M.bulb.clone();
  lampBulbMat.emissiveIntensity = 0;

  const clockBody = M.offWhite.clone();
  clockBody.roughness = 0.5;
  const pinkMat = M.pink.clone();
  const pageMat = M.bookPages;

  const binMat = new THREE.MeshPhysicalMaterial({
    color: 0xf6f5f0, roughness: 0.30, metalness: 0.02,
    clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 0.95
  });
  const binInner = new THREE.MeshStandardMaterial({ color: 0xc9c8c2, roughness: 0.8 });

  return {
    softWhite, bedBase, duvetMat, sheetMat, piping, pipingSoft, crate,
    darkGap, shadowWood, oak, oakMid, oakHead, cushionMint, ceramicCream,
    pillowMat, lampShadeMat, lampBulbMat, clockBody, pinkMat, pageMat, binMat, binInner
  };
}

/* ------------------------------------------------------------------ *
 * colliders / shadows
 * ------------------------------------------------------------------ */
function box3(x0, y0, z0, x1, y1, z1) {
  return new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
}

/* ================================================================== *
 * BUILD
 * ================================================================== */
export function buildFurniture(ctx) {
  const { scene } = ctx;
  const M = ctx.materials;
  const P = makeMaterials(ctx);
  const root = group('furniture');
  scene.add(root);

  /* ---------------------------------------------------------------- *
   * 1. BED (group in local coords; bed centre at BED.x / BED.z)
   * ---------------------------------------------------------------- */
  const bed = group('bed');
  bed.position.set(BED.x, 0, BED.z);
  root.add(bed);
  const add = (o, parent = bed) => { parent.add(o); return o; };

  // recessed plinth + upholstered platform base
  add(mesh(rboxGeo(1.27, 0.05, 1.87, 0.02, 2), P.shadowWood, { pos: [0, 0.024, 0] }));
  add(mesh(rboxGeo(1.365, 0.268, 1.955, 0.05, 4), P.bedBase, { pos: [0, 0.178, 0] }));
  // pale-blue piping (bottom + top seam)
  add(pipingLoop(1.379, 1.969, 0.056, 0.078, P.piping, 0.0062));
  add(pipingLoop(1.376, 1.966, 0.054, 0.300, P.piping, 0.0052));

  // mattress (top exactly 0.56)
  add(mesh(rboxGeo(1.34, 0.252, 1.94, 0.055, 4), M.mattress, { pos: [0, 0.434, 0] }));
  add(pipingLoop(1.342, 1.942, 0.055, 0.44, P.pipingSoft, 0.0032));

  // fitted sheet slab under the pillows + soft hem
  add(mesh(rboxGeo(1.342, 0.028, 0.40, 0.012, 2), P.sheetMat, { pos: [0, 0.552, -0.845] }));

  // duvet body + foot drape
  const duvet = new THREE.Mesh(duvetBodyGeometry(), P.duvetMat);
  duvet.castShadow = false; duvet.receiveShadow = true; duvet.name = 'duvet';
  add(duvet);
  const duvetFoot = new THREE.Mesh(duvetFootGeometry(), P.duvetMat);
  duvetFoot.castShadow = false; duvetFoot.receiveShadow = true; duvetFoot.name = 'duvetFoot';
  add(duvetFoot);
  // rounded fold where the duvet turns over the foot (hides the cloth seam)
  {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const x = -0.744 + 1.488 * (i / 30);
      pts.push(V(x, duvetTopSurfaceY(x, DU.Z1) + 0.001, DU.Z1 + 0.004));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const roll = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.016, 8, false), P.duvetMat);
    roll.castShadow = false; roll.receiveShadow = true; roll.name = 'duvetFootRoll';
    add(roll);
  }
  // soft piping cord along the hem of the duvet (sides + foot)
  {
    const curve = new THREE.CatmullRomCurve3(duvetHemCurvePoints(), false, 'centripetal');
    const hem = new THREE.Mesh(new THREE.TubeGeometry(curve, 130, 0.0046, 6, false), P.pipingSoft);
    hem.castShadow = false; hem.receiveShadow = true; hem.name = 'duvetHem';
    add(hem);
  }

  // rolled, folded-back plain edge at the head
  const turn = new THREE.Mesh(turnoverGeometry(), P.sheetMat);
  turn.castShadow = true; turn.receiveShadow = true; turn.name = 'duvetFold';
  add(turn);
  {
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const t = -1 + (2 * i) / 26;
      const x = t * 0.662;
      pts.push(V(x, duvetTopSurfaceY(x, -0.522) + 0.024, -0.518 + 0.003 * Math.sin(x * 7.0)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const roll = new THREE.Mesh(new THREE.TubeGeometry(curve, 42, 0.024, 8, false), P.softWhite);
    roll.castShadow = true; roll.receiveShadow = true;
    add(roll);
  }

  // two pinstripe pillows, leaning on the headboard
  {
    const specs = [
      { x: -0.348, y: 0.735, z: -0.848, w: 0.635, h: 0.395, t: 0.185, rot: [-0.40, 0.05, -0.025] },
      { x: 0.345, y: 0.726, z: -0.826, w: 0.600, h: 0.378, t: 0.175, rot: [-0.425, -0.04, 0.03] }
    ];
    for (const s of specs) {
      const pivot = group('pillow');
      pivot.position.set(s.x, s.y, s.z);
      pivot.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      const body = new THREE.Mesh(pillowGeometry(s.w, s.h, s.t, 0.085), P.pillowMat);
      body.castShadow = true; body.receiveShadow = true;
      pivot.add(body);
      const welt = pipingLoopXY(s.w - 0.010, s.h - 0.010, 0.078, 0, P.softWhite, 0.0072);
      pivot.add(welt);
      add(pivot);
    }
  }

  // headboard: panelled oak with rounded top rail
  {
    add(mesh(rboxGeo(1.34, 0.455, 0.048, 0.03, 3), P.oakHead, { pos: [0, 0.7675, -0.976] }));
    add(mesh(rboxGeo(1.355, 0.050, 0.075, 0.024, 3), P.oak, { pos: [0, 0.968, -0.965] }));
    const boards = [];
    const bw = 0.2478, gap = 0.0055;
    for (let i = 0; i < 5; i++) {
      const x = -2 * (bw + gap) + i * (bw + gap);
      boards.push({ geo: rboxGeo(bw, 0.395, 0.014, 0.008, 2), pos: [x, 0.764, -0.947] });
    }
    add(mergeParts(boards, P.oak, { name: 'headboardBoards' }));
    // brass bolt caps on the top rail
    const bolts = [];
    for (const x of [-0.56, 0.56]) {
      bolts.push({ geo: cylGeo(0.011, 0.011, 0.008, 12), pos: [x, 0.969, -0.927], rot: [Math.PI / 2, 0, 0] });
    }
    add(mergeParts(bolts, M.brass, { name: 'headboardBolts' }));
  }

  /* ---------------------------------------------------------------- *
   * 2. HEADBOARD WALL SHELF (lower + shallower, over the bed)
   * ---------------------------------------------------------------- */
  {
    const sx = 0;              // local x of shelf centre (world 0.70)
    const zc = -0.92;          // shelf centre z (world -2.22), 0.16 deep
    const botY = 1.200, topY = 1.720;
    const innerY = 1.224;      // books stand here
    // shallow carcass: bottom, top, sides, divider, back
    const carcass = [];
    carcass.push({ geo: rboxGeo(1.30, 0.024, 0.16, 0.007, 2), pos: [sx, 1.212, zc] });
    carcass.push({ geo: rboxGeo(1.296, 0.030, 0.156, 0.008, 2), pos: [sx, 1.704, zc] });
    carcass.push({ geo: rboxGeo(0.024, 0.478, 0.16, 0.007, 2), pos: [-0.638, 1.464, zc] });
    carcass.push({ geo: rboxGeo(0.024, 0.478, 0.16, 0.007, 2), pos: [0.638, 1.464, zc] });
    carcass.push({ geo: rboxGeo(0.019, 0.462, 0.15, 0.006, 2), pos: [0.002, 1.464, zc] });
    carcass.push({ geo: rboxGeo(1.282, 0.462, 0.014, 0.005, 2), pos: [sx, 1.464, -0.994] });
    add(mergeParts(carcass, P.oakMid, { name: 'shelfCarcass' }));
    // slim lighter top cap with a rounded front edge; top surface exactly 1.720
    add(mesh(rboxGeo(1.325, 0.016, 0.174, 0.007, 3), P.oak, { pos: [sx, 1.712, zc - 0.004] }));
    // two slim oak brackets tying the shelf to the wall (not a bulky hutch back)
    add(mergeParts([
      { geo: rboxGeo(0.022, 0.095, 0.020, 0.005, 1), pos: [-0.50, 1.158, -0.988] },
      { geo: rboxGeo(0.022, 0.020, 0.115, 0.005, 1), pos: [-0.50, 1.196, -0.912] },
      { geo: rboxGeo(0.022, 0.095, 0.020, 0.005, 1), pos: [0.50, 1.158, -0.988] },
      { geo: rboxGeo(0.022, 0.020, 0.115, 0.005, 1), pos: [0.50, 1.196, -0.912] }
    ], P.oak, { name: 'shelfBrackets' }));

    // left cubby: inset drawer front, recess shadow + brass knob
    add(mesh(rboxGeo(0.580, 0.336, 0.016, 0.007, 2), P.oak, { pos: [-0.318, 1.452, -0.848] }));
    add(mesh(boxGeo(0.594, 0.350, 0.004), P.shadowWood, { pos: [-0.318, 1.452, -0.856] }));
    add(mesh(cylGeo(0.018, 0.018, 0.014, 16), M.brass, { pos: [-0.318, 1.452, -0.836], rot: [Math.PI / 2, 0, 0] }));
    add(mesh(sphereGeo(0.021, 16), M.brass, { pos: [-0.318, 1.452, -0.828] }));

    // right cubby: colourful books (merged, 1 draw call) + bookend
    const books = [];
    const bookSpecs = [
      [0.140, 0.280, 0.030], [0.136, 0.248, 0.024], [0.144, 0.300, 0.038],
      [0.134, 0.262, 0.027], [0.142, 0.292, 0.034], [0.138, 0.232, 0.022],
      [0.132, 0.274, 0.031], [0.140, 0.288, 0.026], [0.136, 0.256, 0.036],
      [0.140, 0.240, 0.023]
    ];
    const cols = [0xd66f7a, 0x7f9fd8, 0x8fbf88, 0xe0b25f, 0x9d7fc4, 0x5fa8a4,
      0xd98f68, 0xb8c9dd, 0xc4a3b8, 0xe6cf7c];
    let bx = 0.035;
    for (let i = 0; i < bookSpecs.length; i++) {
      const [depth, hgt, thick] = bookSpecs[i];
      books.push({
        size: [depth, hgt, thick],
        pos: [bx + thick / 2, innerY + hgt / 2, -0.918],
        rot: [0, Math.PI / 2, 0],
        color: cols[i % cols.length],
        pagesTop: true
      });
      bx += thick + 0.0025;
    }
    // two books resting flat, stacked at the right end
    books.push({ size: [0.135, 0.030, 0.180], pos: [0.512, innerY + 0.015, -0.916], rot: [0, 0.05, 0], color: 0x8d7fb0 });
    books.push({ size: [0.122, 0.026, 0.166], pos: [0.512, innerY + 0.043, -0.919], rot: [0, -0.06, 0], color: 0xcf8f9a });
    add(kit.buildBooks(books));
    // bookend holding the upright row
    add(mergeParts([
      { geo: rboxGeo(0.078, 0.012, 0.14, 0.004, 2), pos: [0.392, innerY + 0.006, -0.918] },
      { geo: rboxGeo(0.012, 0.170, 0.14, 0.004, 2), pos: [0.356, innerY + 0.09, -0.918] }
    ], P.oak, { name: 'bookend' }));

    ctx.slots.headboardShelf = { x: BED.x, z0: -2.30, z1: -2.14, y0: botY, y1: topY, innerY };
  }

  /* ---------------------------------------------------------------- *
   * 3. NIGHTSTAND + BEDSIDE LAMP
   * ---------------------------------------------------------------- */
  const NS = { x: -0.37, z: -2.05 };
  const ns = group('nightstand');
  ns.position.set(NS.x, 0, NS.z);
  root.add(ns);
  {
    // tapered feet
    const feet = [];
    for (const [fx, fz, rz, rx] of [[-0.17, -0.14, 0.07, -0.05], [0.17, -0.14, -0.07, -0.05], [-0.17, 0.14, 0.07, 0.05], [0.17, 0.14, -0.07, 0.05]]) {
      feet.push({ geo: cylGeo(0.019, 0.012, 0.095, 14), pos: [fx, 0.0475, fz], rot: [rx, 0, rz] });
    }
    ns.add(mergeParts(feet, P.oakMid, { name: 'nsFeet' }));

    // carcass, top slab
    ns.add(mesh(rboxGeo(0.44, 0.415, 0.38, 0.018, 3), P.oakMid, { pos: [0, 0.3025, 0] }));
    ns.add(mesh(rboxGeo(0.462, 0.026, 0.402, 0.012, 3), P.oak, { pos: [0, 0.510, 0] }));

    // two inset drawer fronts + dark recess + brass knobs
    const fronts = [], gaps = [], knobs = [];
    for (let i = 0; i < 2; i++) {
      const y = 0.208 + i * 0.182;
      fronts.push({ geo: rboxGeo(0.385, 0.168, 0.016, 0.008, 2), pos: [0, y, 0.186] });
      gaps.push({ geo: boxGeo(0.402, 0.185, 0.004), pos: [0, y, 0.179] });
      knobs.push({ geo: sphereGeo(0.0155, 14), pos: [0, y, 0.208] });
      knobs.push({ geo: cylGeo(0.007, 0.009, 0.016, 10), pos: [0, y, 0.196], rot: [Math.PI / 2, 0, 0] });
    }
    ns.add(mergeParts(fronts, P.oak, { name: 'nsDrawers' }));
    ns.add(mergeParts(gaps, P.darkGap, { name: 'nsGaps' }));
    ns.add(mergeParts(knobs, M.brass, { name: 'nsKnobs' }));

    // ---- bedside lamp: flared cream ceramic base + butter cube shade ----
    const lamp = group('bedsideLamp');
    lamp.position.set(-0.07, 0.523, -0.03);
    ns.add(lamp);
    const basePts = [
      [0.001, 0.000], [0.072, 0.000], [0.086, 0.009], [0.083, 0.022],
      [0.062, 0.055], [0.048, 0.092], [0.044, 0.122], [0.048, 0.142],
      [0.041, 0.156], [0.024, 0.164], [0.019, 0.176], [0.021, 0.186]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const baseGeo = new THREE.LatheGeometry(basePts, 28);
    const base = new THREE.Mesh(baseGeo, P.ceramicCream);
    base.castShadow = true; base.receiveShadow = true;
    lamp.add(base);
    lamp.add(mesh(cylGeo(0.017, 0.020, 0.020, 14), M.brass, { pos: [0, 0.193, 0] }));
    // butter-yellow rounded cube shade
    const shade = mesh(rboxGeo(0.152, 0.152, 0.152, 0.052, 5), P.lampShadeMat, { pos: [0, 0.279, 0] });
    shade.castShadow = false; shade.receiveShadow = false;
    lamp.add(shade);
    // cream trim collars + finial
    lamp.add(mergeParts([
      { geo: rboxGeo(0.148, 0.012, 0.148, 0.005, 1), pos: [0, 0.197, 0] },
      { geo: rboxGeo(0.146, 0.007, 0.146, 0.0035, 1), pos: [0, 0.356, 0] }
    ], P.ceramicCream, { name: 'shadeTrim' }));
    lamp.add(mesh(sphereGeo(0.012, 12), M.brass, { pos: [0, 0.366, 0], cast: false }));
    // warm bulb (emissive, toggled by lighting.js)
    const bulb = mesh(sphereGeo(0.034, 16), P.lampBulbMat, { pos: [0, 0.279, 0], cast: false });
    lamp.add(bulb);
    ctx.lights.fixtures.bed = { shadeMat: P.lampShadeMat, bulbMat: P.lampBulbMat };
    // align the shared practical light with this lamp (nightstand moved in the final layout)
    if (ctx.lights.bedLamp) ctx.lights.bedLamp.position.set(NS.x - 0.07, 0.79, NS.z - 0.03);
    ctx.registerInteract(lamp, {
      id: 'bedLamp', label: 'Bedside lamp',
      onUse: () => {
        ctx.setLamp('bed', !ctx.lights.lampState.bed);
        ctx.audio?.click(ctx.lights.lampState.bed ? 880 : 620);
        ctx.toast?.(ctx.lights.lampState.bed ? 'Bedside lamp on' : 'Bedside lamp off');
      }
    });

    // ---- small pink book ----
    const bk = group('pinkBook');
    bk.position.set(0.093, 0.523, 0.082);
    bk.rotation.y = -0.22;
    ns.add(bk);
    bk.add(mesh(rboxGeo(0.155, 0.026, 0.112, 0.004, 1), P.pinkMat, { pos: [0, 0.013, 0] }));
    bk.add(mesh(boxGeo(0.146, 0.020, 0.104), P.pageMat, { pos: [0.004, 0.013, 0] }));
    bk.add(mesh(boxGeo(0.150, 0.003, 0.106), M.pink, { pos: [0, 0.0275, 0] }));

    // ---- tiny alarm clock ----
    const clock = group('alarmClock');
    clock.position.set(0.128, 0.523, -0.052);
    clock.rotation.y = -0.34;
    ns.add(clock);
    clock.add(mesh(rboxGeo(0.095, 0.090, 0.044, 0.016, 3), P.clockBody, { pos: [0, 0.050, 0] }));
    clock.add(mesh(cylGeo(0.035, 0.035, 0.004, 24), M.clockFace, { pos: [0, 0.051, 0.023], rot: [Math.PI / 2, 0, 0] }));
    const ticks = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ticks.push({
        geo: boxGeo(0.0028, 0.0072, 0.0016), pos: [Math.sin(a) * 0.0288, 0.051 + Math.cos(a) * 0.0288, 0.0255],
        rot: [0, 0, -a]
      });
    }
    clock.add(mergeParts(ticks, M.blackGloss, { name: 'clockTicks' }));
    const hands = [];
    hands.push({ geo: boxGeo(0.0028, 0.018, 0.0016), pos: [0, 0.056, 0.0265], rot: [0, 0, 0.5] });
    hands.push({ geo: boxGeo(0.0024, 0.013, 0.0016), pos: [0.005, 0.051, 0.0265], rot: [0, 0, 1.85] });
    clock.add(mergeParts(hands, M.blackGloss, { name: 'clockHands' }));
    clock.add(mesh(sphereGeo(0.003, 8), M.brass, { pos: [0, 0.051, 0.028] }));
    // bells + feet
    const bells = [];
    for (const bx2 of [-0.030, 0.030]) {
      bells.push({ geo: new THREE.SphereGeometry(0.021, 14, 8, 0, TAU, 0, Math.PI / 2), pos: [bx2, 0.094, 0] });
      bells.push({ geo: cylGeo(0.0022, 0.0022, 0.015, 8), pos: [bx2, 0.103, 0] });
    }
    bells.push({ geo: cylGeo(0.005, 0.005, 0.008, 10), pos: [-0.03, 0.006, 0.008], rot: [0, 0, 0.2] });
    bells.push({ geo: cylGeo(0.005, 0.005, 0.008, 10), pos: [0.03, 0.006, 0.008], rot: [0, 0, -0.2] });
    clock.add(mergeParts(bells, M.brass, { name: 'clockBells' }));
  }

  /* ---------------------------------------------------------------- *
   * 4. RUGS (yellow woven rug + mint quilted mat)
   * ---------------------------------------------------------------- */
  {
    // mint quilted mat under the foot of the bed
    const mg = rugGeometry(1.35, 0.72, 0.065, 0.007, 0.0035);
    const mintMat = new THREE.Mesh(mg, M.mint);
    mintMat.position.set(0.40, 0.009, -0.32);
    mintMat.castShadow = false; mintMat.receiveShadow = true;
    root.add(mintMat);
    // bound edge + stitch cord
    const mintBind = new THREE.Mesh(rugGeometry(1.362, 0.732, 0.07, 0.004, 0.002), new THREE.MeshStandardMaterial({ color: 0x9fcdb8, roughness: 0.95 }));
    mintBind.position.set(0.40, 0.0045, -0.32);
    mintBind.castShadow = false; mintBind.receiveShadow = true;
    root.add(mintBind);
    const mintCord = pipingLoop(1.345, 0.715, 0.062, 0.0155, new THREE.MeshStandardMaterial({ color: 0x8fc4ac, roughness: 0.9 }), 0.0032);
    mintCord.position.set(0.40, 0, -0.32);
    root.add(mintCord);

    // yellow woven rug with fringe on the two short (x) ends
    const yg = rugGeometry(1.35, 1.10, 0.075, 0.006, 0.003);
    const yellow = new THREE.Mesh(yg, M.rugYellow);
    yellow.position.set(-1.40, 0.0068, 0.05);
    yellow.castShadow = false; yellow.receiveShadow = true;
    root.add(yellow);
    const fringeMat = new THREE.MeshStandardMaterial({ color: 0xf3dfa6, roughness: 0.95 });
    const strands = [];
    const rnd = (i) => Math.sin(i * 12.9898 + 4.14) * 0.5 + 0.5;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 26; i++) {
        const z = -0.50 + (i / 25) * 1.0 + (rnd(i) - 0.5) * 0.006;
        const len = 0.030 + rnd(i + 9) * 0.014;
        const x = side * (0.675 + len / 2);
        strands.push({
          geo: boxGeo(len, 0.0028, 0.0045),
          pos: [x, 0.0035, z],
          rot: [0, (rnd(i + 3) - 0.5) * 0.16, (rnd(i + 7) - 0.5) * 0.06]
        });
      }
    }
    const fringe = mergeParts(strands, fringeMat, { name: 'rugFringe', cast: false });
    fringe.position.set(-1.40, 0, 0.05);
    root.add(fringe);
  }

  /* ---------------------------------------------------------------- *
   * 5. DESK (east wall) + pedestal
   * ---------------------------------------------------------------- */
  const desk = group('desk');
  desk.position.set(1.79, 0, 0.95);
  root.add(desk);
  {
    // top: rounded grey-lilac slab, top face exactly y=0.76
    desk.add(mesh(rboxGeo(0.62, 0.036, 1.46, 0.026, 4), M.deskTop, { pos: [0, 0.742, 0] }));
    desk.add(mesh(rboxGeo(0.604, 0.013, 1.444, 0.022, 3), M.deskEdge, { pos: [0, 0.7185, 0] }));

    // square-tube legs (south end) + adjustable feet
    const legs = [], caps = [];
    for (const lx of [-0.252, 0.252]) {
      legs.push({ geo: rboxGeo(0.038, 0.706, 0.038, 0.008, 1), pos: [lx, 0.359, 0.686] });
      caps.push({ geo: cylGeo(0.017, 0.019, 0.012, 12), pos: [lx, 0.008, 0.686] });
      // slim cross brace to the pedestal keeps the frame believable
      legs.push({ geo: rboxGeo(0.30, 0.026, 0.028, 0.006, 1), pos: [lx * 0.48, 0.688, -0.40] });
    }
    desk.add(mergeParts(legs, M.metalGrey, { name: 'deskLegs' }));
    desk.add(mergeParts(caps, M.metalDark, { name: 'deskFeet' }));

    // 3-drawer pedestal at the north end (z 0.35..0.89 world)
    const pedC = { x: 0.012, z: -0.33 };
    desk.add(mesh(rboxGeo(0.52, 0.664, 0.54, 0.016, 3), M.deskTop, { pos: [pedC.x, 0.383, pedC.z] }));
    desk.add(mesh(rboxGeo(0.47, 0.05, 0.49, 0.012, 2), M.deskEdge, { pos: [pedC.x, 0.025, pedC.z] }));
    const fronts = [], gaps = [], handles = [];
    for (let i = 0; i < 3; i++) {
      const y = 0.196 + i * 0.187;
      fronts.push({ geo: rboxGeo(0.018, 0.166, 0.474, 0.008, 2), pos: [pedC.x - 0.256, y, pedC.z] });
      gaps.push({ geo: boxGeo(0.004, 0.182, 0.492), pos: [pedC.x - 0.250, y, pedC.z] });
      // brass bar handle + standoffs
      handles.push({ geo: cylGeo(0.0075, 0.0075, 0.176, 12), pos: [pedC.x - 0.278, y, pedC.z], rot: [Math.PI / 2, 0, 0] });
      handles.push({ geo: cylGeo(0.0055, 0.0055, 0.016, 10), pos: [pedC.x - 0.268, y, pedC.z - 0.074], rot: [0, 0, Math.PI / 2] });
      handles.push({ geo: cylGeo(0.0055, 0.0055, 0.016, 10), pos: [pedC.x - 0.268, y, pedC.z + 0.074], rot: [0, 0, Math.PI / 2] });
    }
    desk.add(mergeParts(fronts, M.deskTop, { name: 'deskDrawers' }));
    desk.add(mergeParts(gaps, new THREE.MeshStandardMaterial({ color: 0x6e6178, roughness: 0.8 }), { name: 'deskGaps' }));
    desk.add(mergeParts(handles, M.brass, { name: 'deskHandles' }));

    // small cable rail at the back
    const rail = [];
    rail.push({ geo: cylGeo(0.008, 0.008, 1.28, 12), pos: [0.286, 0.698, 0.03], rot: [Math.PI / 2, 0, 0] });
    rail.push({ geo: rboxGeo(0.03, 0.03, 0.022, 0.005, 1), pos: [0.272, 0.706, -0.60] });
    rail.push({ geo: rboxGeo(0.03, 0.03, 0.022, 0.005, 1), pos: [0.272, 0.706, 0.66] });
    desk.add(mergeParts(rail, M.metalDark, { name: 'deskRail' }));

    ctx.slots.desk = { topY: 0.76, x0: 1.48, x1: 2.10, z0: 0.22, z1: 1.68 };
  }

  /* ---------------------------------------------------------------- *
   * 6. LADDER-BACK CHAIR (facing the desk)
   * ---------------------------------------------------------------- */
  const chair = group('chair');
  chair.position.set(1.12, 0, 1.28);
  chair.rotation.y = 0.17;
  root.add(chair);
  {
    const wood = [], metal = [];
    // chunky tapered legs, slightly splayed
    const legSpots = [
      [0.175, -0.175, 0.035, 0.02], [0.175, 0.175, 0.035, -0.02],
      [-0.175, -0.175, -0.045, 0.02], [-0.175, 0.175, -0.045, -0.02]
    ];
    for (const [lx, lz, tx, tz] of legSpots) {
      wood.push({ geo: rboxGeo(0.043, 0.43, 0.043, 0.012, 2), pos: [lx, 0.215, lz], rot: [tz, 0, tx] });
    }
    // stretchers
    wood.push({ geo: rboxGeo(0.33, 0.028, 0.03, 0.008, 1), pos: [0, 0.135, -0.175] });
    wood.push({ geo: rboxGeo(0.33, 0.028, 0.03, 0.008, 1), pos: [0, 0.135, 0.175] });
    wood.push({ geo: rboxGeo(0.03, 0.026, 0.33, 0.008, 1), pos: [-0.175, 0.17, 0] });
    // footrest bar between the front legs
    wood.push({ geo: cylGeo(0.016, 0.016, 0.305, 14), pos: [0.176, 0.148, 0], rot: [Math.PI / 2, 0, 0] });
    // seat frame + seat board
    wood.push({ geo: rboxGeo(0.41, 0.036, 0.415, 0.012, 2), pos: [0, 0.445, 0] });
    // back posts, tilted back a touch
    const tilt = 0.085;
    for (const lz of [-0.174, 0.174]) {
      wood.push({ geo: rboxGeo(0.044, 0.525, 0.046, 0.018, 3), pos: [-0.208, 0.700, lz], rot: [0, 0, tilt] });
    }
    // rounded ladder slats (three) + arched crest rail
    for (const [sy, sr] of [[0.598, 0.023], [0.728, 0.023], [0.852, 0.025]]) {
      wood.push({ geo: cylGeo(sr, sr, 0.342, 16), pos: [-0.222 - (sy - 0.6) * 0.085, sy, 0], rot: [Math.PI / 2, 0, 0] });
    }
    wood.push({ geo: cylGeo(0.029, 0.029, 0.372, 18), pos: [-0.247, 0.932, 0], rot: [Math.PI / 2, 0, 0] });
    // small brass bolt caps where the back posts meet the seat
    for (const lz of [-0.174, 0.174]) {
      metal.push({ geo: cylGeo(0.011, 0.011, 0.006, 10), pos: [-0.234, 0.452, lz], rot: [0, 0, Math.PI / 2] });
    }
    chair.add(mergeParts(wood, P.oak, { name: 'chairWood' }));
    chair.add(mergeParts(metal, M.brass, { name: 'chairBolts' }));

    // mint seat cushion: puffy rounded pouf + soft piping + little tuft
    const cushion = mesh(cushionGeometry(0.372, 0.382, 0.088, 0.05), P.cushionMint, { pos: [0.005, 0.502, 0] });
    chair.add(cushion);
    const cwelt = pipingLoop(0.360, 0.370, 0.048, 0.503, P.softWhite, 0.0048);
    cwelt.position.x = 0.005;
    chair.add(cwelt);
    chair.add(mesh(sphereGeo(0.0075, 10), P.softWhite, { pos: [0.005, 0.566, 0], cast: false }));
  }

  /* ---------------------------------------------------------------- *
   * 7. LIDDED PEDAL BIN (0.30 d x 0.30 h, soft domed lid)
   * ---------------------------------------------------------------- */
  const bin = group('bin');
  bin.position.set(1.35, 0, 0.02);
  root.add(bin);
  {
    // slightly tapered body, rounded bottom, rolled rim
    const bodyPts = [
      [0.001, 0.000], [0.096, 0.000], [0.124, 0.007], [0.136, 0.022],
      [0.142, 0.060], [0.147, 0.150], [0.149, 0.218], [0.150, 0.238],
      [0.146, 0.248], [0.138, 0.250], [0.134, 0.240], [0.130, 0.234]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 34), P.binMat);
    body.castShadow = true; body.receiveShadow = true;
    bin.add(body);
    // dark interior just under the lid
    bin.add(mesh(cylGeo(0.132, 0.132, 0.012, 30), P.binInner, { pos: [0, 0.234, 0], cast: false }));
    // soft domed lid
    const lidPts = [
      [0.001, 0.046], [0.032, 0.045], [0.068, 0.040], [0.100, 0.031],
      [0.125, 0.020], [0.141, 0.010], [0.147, 0.003], [0.144, -0.004]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const lid = new THREE.Mesh(new THREE.LatheGeometry(lidPts, 34), P.binMat);
    lid.position.y = 0.246;
    lid.castShadow = true; lid.receiveShadow = true;
    bin.add(lid);
    bin.add(mesh(new THREE.TorusGeometry(0.145, 0.0065, 8, 32), P.binMat, { pos: [0, 0.246, 0], rot: [Math.PI / 2, 0, 0] }));
    // little finger tab on the lid
    bin.add(mesh(rboxGeo(0.048, 0.012, 0.016, 0.006, 1), P.binMat, { pos: [-0.062, 0.276, 0.112], rot: [-0.38, 0, 0] }));
    // hinge (east side, toward the wall)
    bin.add(mergeParts([
      { geo: cylGeo(0.008, 0.008, 0.065, 10), pos: [0.142, 0.250, 0], rot: [Math.PI / 2, 0, 0] },
      { geo: rboxGeo(0.028, 0.032, 0.016, 0.005, 1), pos: [0.142, 0.238, -0.038] },
      { geo: rboxGeo(0.028, 0.032, 0.016, 0.005, 1), pos: [0.142, 0.238, 0.038] }
    ], M.metalSoft, { name: 'binHinge' }));
    // foot pedal (west side, facing the room) + linkage
    bin.add(mergeParts([
      { geo: rboxGeo(0.058, 0.022, 0.096, 0.009, 2), pos: [-0.163, 0.019, 0] },
      { geo: rboxGeo(0.085, 0.009, 0.020, 0.004, 1), pos: [-0.116, 0.011, 0] }
    ], P.binMat, { name: 'binPedal' }));
    // crumpled paper peeking out from under the lid
    const paperMat = M.paper;
    const p1 = mesh(new THREE.PlaneGeometry(0.095, 0.105, 2, 2), paperMat, {
      pos: [-0.080, 0.272, 0.040], rot: [-0.72, 0.85, 0.22], cast: false
    });
    bin.add(p1);
    const p2 = mesh(new THREE.PlaneGeometry(0.068, 0.078, 2, 2), paperMat, {
      pos: [-0.030, 0.275, 0.080], rot: [-1.12, -0.35, -0.18], cast: false
    });
    bin.add(p2);
  }

  /* ---------------------------------------------------------------- *
   * 8. COLLIDERS + CONTACT SHADOWS
   * ---------------------------------------------------------------- */
  // bed
  ctx.addColliderBox(box3(BED.x - 0.71, 0, -2.30, BED.x + 0.71, 0.72, -0.275));
  // nightstand
  ctx.addColliderBox(box3(NS.x - 0.24, 0, NS.z - 0.21, NS.x + 0.24, 0.56, NS.z + 0.21));
  // desk (top + pedestal footprint)
  ctx.addColliderBox(box3(1.475, 0, 0.21, 2.10, 0.80, 1.69));
  // chair
  ctx.addColliderBox(box3(0.90, 0, 1.045, 1.345, 0.94, 1.515));
  // bin
  ctx.addColliderBox(box3(1.35 - 0.165, 0, 0.02 - 0.17, 1.35 + 0.165, 0.32, 0.02 + 0.18));

  ctx.addContactShadow(BED.x, BED.z + 0.01, 1.92, 2.5, 0.30);
  ctx.addContactShadow(NS.x, NS.z + 0.02, 0.78, 0.72, 0.34);
  ctx.addContactShadow(1.80, 0.94, 0.98, 1.80, 0.24);
  ctx.addContactShadow(1.12, 1.28, 0.72, 0.74, 0.30);
  ctx.addContactShadow(1.35, 0.02, 0.52, 0.52, 0.32);
  ctx.addContactShadow(-1.40, 0.05, 1.56, 1.30, 0.10);
  ctx.addContactShadow(0.40, -0.32, 1.54, 0.90, 0.08);

  // useful handles for other builders
  ctx.slots.bed = { x: BED.x, z: BED.z, w: 1.40, l: 2.00, mattressTop: 0.56, duvetTop: 0.662 };
  ctx.slots.nightstand = { x: NS.x, z: NS.z, topY: 0.52 };

  return root;
}

export default buildFurniture;
