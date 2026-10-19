// Geometry + scene helpers shared by every builder.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const geoCache = new Map();

function cached(key, factory) {
  let g = geoCache.get(key);
  if (!g) { g = factory(); geoCache.set(key, g); }
  return g;
}

export function rboxGeo(w, h, d, r = 0.02, seg = 2) {
  r = Math.min(r, Math.min(w, h, d) * 0.49);
  const key = `rb|${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}|${r.toFixed(4)}|${seg}`;
  return cached(key, () => r > 0.0005
    ? new RoundedBoxGeometry(w, h, d, seg + 1, r)
    : new THREE.BoxGeometry(w, h, d));
}

export function boxGeo(w, h, d) {
  const key = `b|${w}|${h}|${d}`;
  return cached(key, () => new THREE.BoxGeometry(w, h, d));
}

export function cylGeo(rt, rb, h, seg = 20, open = false) {
  const key = `c|${rt}|${rb}|${h}|${seg}|${open}`;
  return cached(key, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}

export function sphereGeo(r, seg = 20) {
  const key = `s|${r}|${seg}`;
  return cached(key, () => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.66))));
}

export function capsuleGeo(r, len, capSeg = 6, radial = 16) {
  const key = `cap|${r}|${len}|${capSeg}|${radial}`;
  return cached(key, () => new THREE.CapsuleGeometry(r, len, capSeg, radial));
}

export function planeGeo(w, h, wSeg = 1, hSeg = 1) {
  const key = `p|${w}|${h}|${wSeg}|${hSeg}`;
  return cached(key, () => new THREE.PlaneGeometry(w, h, wSeg, hSeg));
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function hexShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export function extrudeShape(shape, { depth = 0.02, bevel = 0.004, curveSegments = 8 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 2, curveSegments, steps: 1
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

export function group(name = 'group') {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

/** Add mesh and set sensible shadows. */
export function mesh(geo, mat, { pos, rot, scale, cast = true, receive = true, parent, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) {
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(scale[0], scale[1], scale[2]);
  }
  m.castShadow = cast; m.receiveShadow = receive;
  if (name) m.name = name;
  if (parent) parent.add(m);
  return m;
}

/** Add object to parent (default scene) and enable shadows recursively. */
export function add(obj, parent) {
  obj.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  if (parent) parent.add(obj);
  return obj;
}

export function cast(obj, castShadow = true, receiveShadow = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = castShadow; o.receiveShadow = receiveShadow; } });
  return obj;
}

export function position(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
export function rotation(obj, x, y, z) { obj.rotation.set(x, y, z); return obj; }
export function scale(obj, x, y, z) { obj.scale.set(x, y, z); return obj; }

let contactGeo = null, contactMat = null;
export function contactShadowMaterial(opacity = 0.38) {
  if (!contactMat) {
    contactMat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, opacity,
      color: 0x2a2338, toneMapped: false
    });
  }
  const m = contactMat.clone();
  m.opacity = opacity;
  return m;
}

/** Soft grounding shadow decal. */
export function contactShadow(texture, w, d, x, z, opacity = 0.35, y = 0.006) {
  if (!contactGeo) contactGeo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, opacity,
    color: 0x3a3050, toneMapped: false
  });
  const m = new THREE.Mesh(contactGeo, mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.set(x, y, z);
  m.renderOrder = 1;
  return m;
}

/** Build a lot of books as ONE merged, vertex-coloured mesh (1 draw call). */
export function buildBooks(books, { pagesColor = 0xf6f1e2 } = {}) {
  const geos = [];
  const col = new THREE.Color();
  const pages = new THREE.Color(pagesColor);
  for (const b of books) {
    const w = b.size?.[0] ?? 0.03, h = b.size?.[1] ?? 0.24, d = b.size?.[2] ?? 0.17;
    const g = new THREE.BoxGeometry(w, h, d);
    // vertex colours: fore edge (+x) & page top/bottom lighter
    const count = g.attributes.position.count;
    const cols = new Float32Array(count * 3);
    const normals = g.attributes.normal;
    col.set(b.color ?? 0xffffff);
    for (let i = 0; i < count; i++) {
      const nx = normals.getX(i), ny = normals.getY(i);
      let c = col;
      if (nx > 0.5 && !b.noPages) c = pages;
      else if (ny > 0.5 && b.pagesTop) c = pages;
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      b.rot?.[0] ?? 0, b.rot?.[1] ?? 0, b.rot?.[2] ?? 0
    ));
    m.compose(new THREE.Vector3(...(b.pos ?? [0, 0, 0])), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    geos.push(g);
  }
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0 });
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A simple, nicely proportioned single book (2 draws) for hero placements. */
export function book({ w = 0.03, h = 0.24, d = 0.17, cover, pages } = {}, materials) {
  const g = group('book');
  const coverMat = new THREE.MeshStandardMaterial({ color: cover ?? 0xb86a72, roughness: 0.6 });
  const pageMat = pages ?? materials?.bookPages ?? new THREE.MeshStandardMaterial({ color: 0xf6f1e2, roughness: 0.9 });
  const c = mesh(rboxGeo(w, h, d, 0.003, 1), coverMat, { parent: g });
  const p = mesh(boxGeo(w * 0.86, h * 0.9, d * 0.94), pageMat, { parent: g });
  p.position.x = w * 0.08;
  p.castShadow = false;
  c.castShadow = true;
  return g;
}

export function tube(points, radius, material, seg = 64, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', 0.5);
  const g = new THREE.TubeGeometry(curve, seg, radius, radial, closed);
  return new THREE.Mesh(g, material);
}

export function lathe(points, material, seg = 32) {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, seg);
  return new THREE.Mesh(g, material);
}

export function box3Of(obj, pad = 0) {
  obj.updateWorldMatrix(true, true);
  const b = new THREE.Box3().setFromObject(obj);
  if (pad) b.expandByScalar(pad);
  return b;
}

export const kit = {
  rboxGeo, boxGeo, cylGeo, sphereGeo, capsuleGeo, planeGeo,
  roundedRectShape, hexShape, extrudeShape,
  group, mesh, add, cast, position, rotation, scale,
  contactShadow, contactShadowMaterial, buildBooks, book,
  tube, lathe, box3Of,
  THREE
};
export default kit;
