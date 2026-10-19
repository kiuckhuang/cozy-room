// Decor builder — wall art, bay-window dressings, books, plant, desk clutter,
// practical desk lamp and collectible-spot hints. Everything is procedural:
// posters / calendar / notes are painted on canvas, props are built from
// rounded primitives. Owned by the decor builder; no other files touched.
import * as THREE from 'three';
import kit from './kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ *
 *  small utilities
 * ------------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const BOOK_PALETTE = [
  0xd66f7a, 0x7f9fd8, 0x8fbf88, 0xe0b25f, 0x9d7fc4, 0x5fa8a4,
  0xd98f68, 0xb8c9dd, 0xc4a3b8, 0x7f8f6a, 0xe6cf7c, 0x8d7fb0,
  0xcf8f9a, 0x6f9bc4, 0xa8c58f, 0xd4a06a
];

let _shared = null;
/** Textures/materials shared by all flat paper art. */
function sharedArt(ctx) {
  if (_shared) return _shared;
  const lib = ctx.textureLib;

  // paper fibre normal map (very subtle)
  const { canvas: fib, ctx: fctx } = lib.canvas(256, 256);
  fctx.fillStyle = '#808080'; fctx.fillRect(0, 0, 256, 256);
  const fimg = fctx.getImageData(0, 0, 256, 256), fd = fimg.data;
  const frng = mulberry32(77);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const n = (frng() - 0.5) * 16 + Math.sin((x + y * 0.6) * 0.7) * 2;
      fd[i] += n; fd[i + 1] += n; fd[i + 2] += n;
    }
  }
  fctx.putImageData(fimg, 0, 0);
  // sparse fibres
  for (let i = 0; i < 260; i++) {
    fctx.strokeStyle = `rgba(${frng() < 0.5 ? 60 : 220},${frng() < 0.5 ? 60 : 220},200,${0.05 + frng() * 0.08})`;
    fctx.lineWidth = 0.6 + frng() * 0.6;
    const x = frng() * 256, y = frng() * 256, a = frng() * Math.PI, l = 2 + frng() * 9;
    fctx.beginPath(); fctx.moveTo(x, y); fctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); fctx.stroke();
  }
  const paperNormal = lib.normalFrom(fib, 0.6);

  // blurred drop-shadow decal (single cached texture)
  const { canvas: shc, ctx: sh } = lib.canvas(256, 256);
  sh.clearRect(0, 0, 256, 256);
  sh.save();
  sh.filter = 'blur(16px)';
  sh.fillStyle = 'rgba(30,24,44,0.92)';
  sh.beginPath();
  const r = 22, x0 = 52, y0 = 52, w = 152, h = 152;
  sh.moveTo(x0 + r, y0); sh.lineTo(x0 + w - r, y0);
  sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  sh.lineTo(x0 + w, y0 + h - r); sh.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  sh.lineTo(x0 + r, y0 + h); sh.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
  sh.closePath(); sh.fill();
  sh.restore();
  const shadowTex = lib.fromCanvas(shc);

  const paperBackMat = new THREE.MeshStandardMaterial({ color: 0xfbf8ee, roughness: 0.92, metalness: 0 });
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex, color: 0x2f2844, transparent: true, opacity: 0.55,
    depthWrite: false, toneMapped: false
  });

  _shared = { paperNormal, shadowMat, paperBackMat, shadowTex };
  return _shared;
}

function paperMaterial(ctx, tex, { rough = 0.93, normal = 0.09 } = {}) {
  const S = sharedArt(ctx);
  return new THREE.MeshStandardMaterial({
    map: tex, roughness: rough, metalness: 0,
    normalMap: S.paperNormal, normalScale: new THREE.Vector2(normal, normal),
    envMapIntensity: 0.3
  });
}

/** add printed art as a thin sheet with backing and a soft offset shadow */
function addFlatArt(ctx, parent, { w, h, tex, x, y, z, rotY = 0, thick = 0.008, shadow = 0.018 }) {
  const S = sharedArt(ctx);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);

  // soft drop shadow on the wall (sits just behind the paper)
  const sh = new THREE.Mesh(kit.planeGeo(w + shadow * 2.4, h + shadow * 2.4), S.shadowMat);
  sh.position.set(shadow * 0.7, -shadow * 0.8, -thick - 0.0025);
  sh.userData.noOutline = true; sh.layers.set(1);
  sh.castShadow = false; sh.receiveShadow = false;
  g.add(sh);

  // paper back: its front face is exactly at local z=0
  const back = kit.mesh(kit.rboxGeo(w, h, thick, Math.min(0.0035, thick * 0.35), 1), S.paperBackMat, {
    pos: [0, 0, -thick / 2], parent: g
  });
  back.castShadow = true; back.receiveShadow = true;

  // printed face sits clear of the backing (z-fighting safe on low-precision depth)
  const face = kit.mesh(kit.planeGeo(w, h), paperMaterial(ctx, tex), {
    pos: [0, 0, 0.0028], parent: g
  });
  face.castShadow = false; face.receiveShadow = true;
  face.renderOrder = 2;
  return g;
}

/* ------------------------------------------------------------------ *
 *  canvas helpers
 * ------------------------------------------------------------------ */
function paperGrain(ctx2d, w, h, amount = 5, seed = 3) {
  const img = ctx2d.getImageData(0, 0, w, h), d = img.data;
  const rng = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount * 2;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n * 0.9, 0, 255);
  }
  ctx2d.putImageData(img, 0, 0);
}

/** tiny hand-written scratch: a wavy baseline made of loops */
function penScratch(c, x, y, len, size, color, rng, alpha = 0.75) {
  c.save();
  c.strokeStyle = color;
  c.globalAlpha = alpha;
  c.lineWidth = Math.max(1, size * 0.22);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(x, y + (rng() - 0.5) * size * 0.2);
  let px = x;
  while (px < x + len) {
    const step = size * (0.55 + rng() * 0.45);
    const h = (0.45 + rng() * 0.75) * size;
    c.bezierCurveTo(px + step * 0.25, y - h, px + step * 0.6, y - h, px + step, y + (rng() - 0.5) * size * 0.25);
    px += step;
  }
  c.stroke();
  c.restore();
}

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function softCloud(c, x, y, s, color, lw = 12, fill = null) {
  c.save();
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  c.arc(x - s * 0.42, y + s * 0.06, s * 0.30, Math.PI * 0.85, Math.PI * 1.85);
  c.arc(x, y + s * 0.02, s * 0.38, Math.PI * 1.05, Math.PI * 1.98);
  c.arc(x + s * 0.44, y + s * 0.06, s * 0.29, Math.PI * 1.15, Math.PI * 2.1);
  c.quadraticCurveTo(x + s * 0.1, y + s * 0.34, x - s * 0.25, y + s * 0.24);
  c.stroke();
  if (fill) { c.fillStyle = fill; c.fill(); }
  c.restore();
}

/* ------------------------------------------------------------------ *
 *  posters
 * ------------------------------------------------------------------ */
function paintPinkPoster(ctx) {
  const W = 760, H = 543;
  const { canvas, ctx: c } = ctx.textureLib.canvas(W, H);
  const g = c.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, '#f9b6cd'); g.addColorStop(0.55, '#f4a6c2'); g.addColorStop(1, '#ef98b8');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // faint print mottling
  const rng = mulberry32(9);
  for (let i = 0; i < 26; i++) {
    c.fillStyle = `rgba(255,220,236,${0.02 + rng() * 0.04})`;
    c.beginPath(); c.ellipse(rng() * W, rng() * H, 40 + rng() * 120, 20 + rng() * 80, rng() * 3, 0, Math.PI * 2); c.fill();
  }

  const ink = 'rgba(255,250,252,0.95)';
  c.lineCap = 'round'; c.lineJoin = 'round';
  // two clouds upper right
  softCloud(c, W * 0.70, H * 0.20, W * 0.115, ink, 13);
  c.strokeStyle = ink; c.lineWidth = 9;
  c.beginPath();
  c.arc(W * 0.61, H * 0.145, W * 0.066, Math.PI * 0.95, Math.PI * 1.9);
  c.stroke();
  // sun ring, left of centre
  c.lineWidth = 12;
  c.beginPath(); c.arc(W * 0.42, H * 0.38, W * 0.047, 0, Math.PI * 2); c.stroke();
  // mountains / foothills
  c.lineWidth = 14;
  c.beginPath();
  c.moveTo(W * 0.04, H * 0.97);
  c.lineTo(W * 0.10, H * 0.78);
  c.quadraticCurveTo(W * 0.15, H * 0.62, W * 0.22, H * 0.60);
  c.quadraticCurveTo(W * 0.30, H * 0.59, W * 0.35, H * 0.72);
  c.lineTo(W * 0.43, H * 0.88);
  c.lineTo(W * 0.50, H * 0.60);
  c.lineTo(W * 0.56, H * 0.40);
  c.lineTo(W * 0.63, H * 0.58);
  c.quadraticCurveTo(W * 0.66, H * 0.67, W * 0.73, H * 0.63);
  c.lineTo(W * 0.80, H * 0.50);
  c.lineTo(W * 0.86, H * 0.66);
  c.lineTo(W * 0.96, H * 0.94);
  c.stroke();
  // foothill round
  c.lineWidth = 10;
  c.beginPath();
  c.moveTo(W * 0.03, H * 0.86);
  c.quadraticCurveTo(W * 0.14, H * 0.70, W * 0.24, H * 0.84);
  c.quadraticCurveTo(W * 0.30, H * 0.92, W * 0.36, H * 0.99);
  c.stroke();
  // little birds
  c.lineWidth = 5.5;
  for (const [bx, by, bs] of [[W * 0.22, H * 0.20, 1], [W * 0.27, H * 0.14, 0.8], [W * 0.18, H * 0.29, 0.7]]) {
    c.beginPath();
    c.arc(bx, by, 11 * bs, Math.PI * 1.12, Math.PI * 1.88);
    c.arc(bx + 22 * bs, by, 11 * bs, Math.PI * 1.12, Math.PI * 1.88);
    c.stroke();
  }
  // a second small cloud / smoke signature top-right
  softCloud(c, W * 0.86, H * 0.16, W * 0.06, ink, 8);
  // tiny heart
  c.save();
  c.translate(W * 0.20, H * 0.50);
  c.scale(1.05, 1.05);
  c.beginPath();
  c.moveTo(0, 10); c.bezierCurveTo(-16, -3, -13, -17, 0, -8); c.bezierCurveTo(13, -17, 16, -3, 0, 10);
  c.fillStyle = ink; c.globalAlpha = 0.85; c.fill(); c.restore();

  paperGrain(c, W, H, 4.5, 11);
  return ctx.textureLib.fromCanvas(canvas);
}

function paintBluePoster(ctx) {
  const W = 600, H = 800;
  const { canvas, ctx: c } = ctx.textureLib.canvas(W, H);
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#6478c6'); g.addColorStop(0.5, '#5669b8'); g.addColorStop(1, '#4b5dab');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const rng = mulberry32(31);
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgba(190,208,255,${0.02 + rng() * 0.05})`;
    c.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
  }

  const pale = 'rgba(220,232,255,0.82)';
  // thin double border
  c.strokeStyle = 'rgba(222,236,255,0.65)'; c.lineWidth = 2.8;
  roundRectPath(c, 26, 26, W - 52, H - 52, 8); c.stroke();
  // pixel grid border: little squares marching around the frame
  c.fillStyle = 'rgba(216,230,255,0.52)';
  const inset = 46, q = 9, gap = 8.5;
  for (let x = inset; x < W - inset - q; x += gap) {
    c.fillRect(x, inset, q, q);
    c.fillRect(x, H - inset - q, q, q);
  }
  for (let y = inset; y < H - inset - q; y += gap) {
    c.fillRect(inset, y, q, q);
    c.fillRect(W - inset - q, y, q, q);
  }
  c.fillStyle = 'rgba(206,222,255,0.75)';
  // corner pixels
  c.fillRect(inset - 4, inset - 4, 16, 16);
  c.fillRect(W - inset - 12, inset - 4, 16, 16);
  c.fillRect(inset - 4, H - inset - 12, 16, 16);
  c.fillRect(W - inset - 12, H - inset - 12, 16, 16);

  // sparkles / little icons
  const sparkle = (x, y, s, col) => {
    c.save(); c.translate(x, y); c.fillStyle = col;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? s : s * 0.28;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath(); c.fill(); c.restore();
  };
  sparkle(W * 0.76, H * 0.155, 17, pale);
  c.save(); // four-point star outline top-left
  c.strokeStyle = 'rgba(220,232,255,0.6)'; c.lineWidth = 3;
  c.beginPath(); c.arc(W * 0.24, H * 0.145, 22, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(W * 0.24, H * 0.145 - 34); c.lineTo(W * 0.24, H * 0.145 + 34);
  c.moveTo(W * 0.24 - 34, H * 0.145); c.lineTo(W * 0.24 + 34, H * 0.145); c.stroke();
  c.restore();
  // moon ring right
  c.strokeStyle = 'rgba(220,232,255,0.5)'; c.lineWidth = 4;
  c.beginPath(); c.arc(W * 0.82, H * 0.36, 30, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(220,232,255,0.35)';
  c.beginPath(); c.arc(W * 0.82, H * 0.36, 9, 0, Math.PI * 2); c.fill();
  // dots
  for (const [dx, dy, dr] of [[W * 0.18, H * 0.30, 3], [W * 0.70, H * 0.30, 2.5], [W * 0.20, H * 0.84, 3.5], [W * 0.64, H * 0.855, 2.2]]) {
    c.fillStyle = 'rgba(220,232,255,0.6)';
    c.beginPath(); c.arc(dx, dy, dr, 0, Math.PI * 2); c.fill();
  }

  // cute pixel-ish creature (pale line art)
  c.save();
  c.translate(W * 0.50, H * 0.47);
  c.scale(1.12, 1.12);
  c.translate(-W * 0.50, -H * 0.47);
  c.strokeStyle = 'rgba(238,245,255,0.95)';
  c.fillStyle = 'rgba(238,245,255,0.95)';
  c.lineWidth = 12; c.lineCap = 'round'; c.lineJoin = 'round';
  const cx = W * 0.50, cy = H * 0.47;
  // head blob (egg shape with little top bump)
  c.beginPath();
  c.moveTo(cx - 104, cy + 22);
  c.bezierCurveTo(cx - 108, cy - 82, cx - 42, cy - 120, cx + 6, cy - 108);
  c.bezierCurveTo(cx + 76, cy - 118, cx + 116, cy - 44, cx + 104, cy + 26);
  c.bezierCurveTo(cx + 92, cy + 96, cx - 82, cy + 108, cx - 104, cy + 22);
  c.closePath(); c.stroke();
  // antennae
  c.beginPath();
  c.moveTo(cx - 44, cy - 104);
  c.quadraticCurveTo(cx - 72, cy - 164, cx - 28, cy - 178);
  c.stroke();
  c.beginPath(); c.arc(cx - 25, cy - 182, 11, 0, Math.PI * 2); c.fill();
  c.beginPath();
  c.moveTo(cx + 56, cy - 100);
  c.quadraticCurveTo(cx + 88, cy - 150, cx + 62, cy - 170);
  c.stroke();
  c.beginPath(); c.arc(cx + 60, cy - 175, 9, 0, Math.PI * 2); c.fill();
  // bright eyes
  c.fillStyle = 'rgba(255,255,255,0.98)';
  c.beginPath(); c.ellipse(cx - 40, cy - 22, 21, 28, 0.1, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(cx + 42, cy - 22, 21, 28, -0.1, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(70,88,160,0.9)';
  c.beginPath(); c.ellipse(cx - 36, cy - 20, 7, 10, 0.1, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(cx + 46, cy - 20, 7, 10, -0.1, 0, Math.PI * 2); c.fill();
  // smile
  c.strokeStyle = 'rgba(238,245,255,0.9)'; c.lineWidth = 8;
  c.beginPath(); c.arc(cx + 2, cy + 18, 26, 0.25, Math.PI - 0.25); c.stroke();
  // blush
  c.fillStyle = 'rgba(255,214,235,0.42)';
  c.beginPath(); c.ellipse(cx - 66, cy + 12, 14, 8, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(cx + 68, cy + 12, 14, 8, 0, 0, Math.PI * 2); c.fill();
  // little body + arms
  c.strokeStyle = 'rgba(238,245,255,0.9)'; c.lineWidth = 11;
  c.beginPath();
  c.moveTo(cx - 46, cy + 96);
  c.quadraticCurveTo(cx - 66, cy + 150, cx - 30, cy + 168);
  c.quadraticCurveTo(cx + 4, cy + 184, cx + 34, cy + 162);
  c.quadraticCurveTo(cx + 54, cy + 146, cx + 44, cy + 94);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - 48, cy + 118); c.quadraticCurveTo(cx - 86, cy + 138, cx - 80, cy + 160); c.stroke();
  c.beginPath();
  c.moveTo(cx + 46, cy + 116); c.quadraticCurveTo(cx + 86, cy + 132, cx + 82, cy + 154); c.stroke();
  // feet
  c.lineWidth = 10;
  c.beginPath(); c.moveTo(cx - 30, cy + 168); c.lineTo(cx - 34, cy + 182); c.stroke();
  c.beginPath(); c.moveTo(cx + 30, cy + 166); c.lineTo(cx + 34, cy + 180); c.stroke();
  // little heart on chest
  c.save(); c.translate(cx - 4, cy + 138); c.fillStyle = 'rgba(255,190,215,0.75)';
  c.beginPath(); c.moveTo(0, 8); c.bezierCurveTo(-13, -3, -10, -14, 0, -7); c.bezierCurveTo(10, -14, 13, -3, 0, 8);
  c.fill(); c.restore();
  c.restore(); // creature scale

  paperGrain(c, W, H, 4, 33);
  return ctx.textureLib.fromCanvas(canvas);
}

function paintGreenPoster(ctx) {
  const W = 640, H = 840;
  const { canvas, ctx: c } = ctx.textureLib.canvas(W, H);
  const g = c.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#b2dca4'); g.addColorStop(0.55, '#a9d59b'); g.addColorStop(1, '#a0cd92');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const rng = mulberry32(5);
  for (let i = 0; i < 20; i++) {
    c.fillStyle = `rgba(240,255,230,${0.02 + rng() * 0.035})`;
    c.beginPath(); c.ellipse(rng() * W, rng() * H, 50 + rng() * 120, 30 + rng() * 90, rng() * 3, 0, Math.PI * 2); c.fill();
  }
  // faint inner border
  c.strokeStyle = 'rgba(238,250,228,0.22)'; c.lineWidth = 3;
  roundRectPath(c, 16, 16, W - 32, H - 32, 6); c.stroke();

  // shapes: triangle / square / semicircle + dots
  c.save();
  c.translate(W * 0.34, H * 0.47); c.rotate(-0.12);
  c.fillStyle = '#a678d6';
  c.beginPath(); c.moveTo(0, -138); c.lineTo(96, 52); c.lineTo(-96, 52); c.closePath(); c.fill();
  c.restore();
  c.save();
  c.translate(W * 0.68, H * 0.52); c.rotate(0.16);
  c.fillStyle = '#5b8fdc'; c.fillRect(-92, -92, 184, 184);
  c.restore();
  c.save();
  c.translate(W * 0.52, H * 0.60);
  c.fillStyle = '#f4b03c';
  c.beginPath(); c.arc(0, 0, 104, Math.PI, Math.PI * 2); c.closePath(); c.fill();
  c.restore();
  // small accents
  c.fillStyle = '#5b8fdc';
  c.beginPath(); c.moveTo(W * 0.16, H * 0.57); c.lineTo(W * 0.21, H * 0.62); c.lineTo(W * 0.16, H * 0.62); c.closePath(); c.fill();
  c.fillStyle = '#8fbf88';
  c.beginPath(); c.arc(W * 0.78, H * 0.70, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#a678d6';
  c.beginPath(); c.arc(W * 0.80, H * 0.405, 11, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(W * 0.62, H * 0.78, 7, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f4b03c';
  c.beginPath(); c.arc(W * 0.18, H * 0.72, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#8fbf88';
  c.beginPath(); c.arc(W * 0.36, H * 0.335, 7, 0, Math.PI * 2); c.fill();

  // NICE! — chunky cream letters, slightly hand-placed
  const text = 'NICE!';
  const size = 148;
  c.font = `900 ${size}px "Arial Rounded MT Bold", "Trebuchet MS", "DejaVu Sans", sans-serif`;
  c.textBaseline = 'middle';
  c.save();
  c.translate(W * 0.50, H * 0.185);
  c.rotate(-0.10);
  c.textAlign = 'center';
  const widths = [...text].map(ch => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let px = -total / 2;
  let i = 0;
  for (const ch of text) {
    const wch = widths[i];
    c.save();
    c.translate(px + wch / 2, Math.sin(i * 2.1) * 4);
    c.rotate((i - 2) * 0.018);
    c.fillStyle = 'rgba(88,128,74,0.30)';
    c.fillText(ch, 3, 5);
    c.fillStyle = '#fdf7e6';
    c.fillText(ch, 0, 0);
    c.restore();
    px += wch;
    i++;
  }
  c.restore();

  paperGrain(c, W, H, 4.2, 8);
  return ctx.textureLib.fromCanvas(canvas);
}

function buildPosters(ctx, root) {
  const pink = paintPinkPoster(ctx);
  const blue = paintBluePoster(ctx);
  const green = paintGreenPoster(ctx);
  const z = -2.2885;
  addFlatArt(ctx, root, { w: 0.40, h: 0.28, tex: pink, x: -0.50, y: 2.08, z });
  addFlatArt(ctx, root, { w: 0.26, h: 0.36, tex: blue, x: -0.76, y: 1.70, z });
  addFlatArt(ctx, root, { w: 0.30, h: 0.40, tex: green, x: -0.42, y: 1.68, z });
}

/* ------------------------------------------------------------------ *
 *  calendar (east wall)
 * ------------------------------------------------------------------ */
function paintCalendar(ctx) {
  const W = 640, H = 886;
  const { canvas, ctx: c } = ctx.textureLib.canvas(W, H);
  const rng = mulberry32(101);
  c.fillStyle = '#fdf8ec'; c.fillRect(0, 0, W, H);
  // soft warm paper edge
  const eg = c.createRadialGradient(W * 0.5, H * 0.42, W * 0.2, W * 0.5, H * 0.5, H * 0.72);
  eg.addColorStop(0, 'rgba(255,255,255,0)'); eg.addColorStop(1, 'rgba(202,184,158,0.24)');
  c.fillStyle = eg; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,233,190,0.18)'; c.fillRect(0, 0, W, H);

  // header
  c.fillStyle = '#7c8aa8';
  c.font = 'italic 600 44px "Segoe Script", "Comic Sans MS", "DejaVu Sans", cursive';
  c.fillText('october', 44, 78);
  c.font = '500 25px "Trebuchet MS", "DejaVu Sans", sans-serif';
  c.fillStyle = '#a4afc4';
  c.fillText('little days', 46, 112);
  // tiny heart top right
  c.save(); c.translate(W - 66, 70); c.fillStyle = 'rgba(238,159,186,0.8)';
  c.beginPath(); c.moveTo(0, 12); c.bezierCurveTo(-20, -4, -16, -22, 0, -10); c.bezierCurveTo(16, -22, 20, -4, 0, 12); c.fill(); c.restore();

  // 5 x 6 grid
  const gx = 40, gy = 150, gw = W - 80, gh = H - 210;
  const cols = 5, rows = 6;
  const cw = gw / cols, ch = gh / rows;
  const line = 'rgba(152,166,190,0.62)';
  c.strokeStyle = line; c.lineWidth = 1.7;
  for (let i = 0; i <= cols; i++) { c.beginPath(); c.moveTo(gx + i * cw, gy); c.lineTo(gx + i * cw, gy + gh); c.stroke(); }
  for (let j = 0; j <= rows; j++) { c.beginPath(); c.moveTo(gx, gy + j * ch); c.lineTo(gx + gw, gy + j * ch); c.stroke(); }
  // weekday initials
  c.fillStyle = 'rgba(130,146,174,0.75)';
  c.font = '600 19px "Trebuchet MS", sans-serif';
  const days = ['m', 't', 'w', 't', 'f'];
  for (let i = 0; i < cols; i++) {
    c.textAlign = 'center';
    c.fillText(days[i], gx + cw * (i + 0.5), gy - 14);
  }
  c.textAlign = 'left';
  // tiny day numbers in the corner of each cell
  c.font = '500 15px "Trebuchet MS", sans-serif';
  c.fillStyle = 'rgba(140,156,182,0.6)';
  let day = 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      c.fillText(String(day), gx + i * cw + 9, gy + j * ch + 22);
      day++;
    }
  }

  // hand-written scribbles in a scattering of cells
  const cellsMarked = [[1, 0], [0, 1], [3, 1], [4, 2], [1, 3], [2, 4], [0, 4], [4, 5]];
  for (const [i, j] of cellsMarked) {
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const len = 18 + rng() * 34;
      const x = gx + i * cw + 12 + rng() * (cw - len - 20);
      const y = gy + j * ch + 44 + rng() * (ch - 62);
      penScratch(c, x, y, len, 6, 'rgba(104,122,150,0.75)', rng, 0.8);
    }
  }
  // little check marks / stars
  const star = (x, y, r, col) => {
    c.save(); c.translate(x, y); c.fillStyle = col;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 === 0 ? r : r * 0.45;
      i === 0 ? c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath(); c.fill(); c.restore();
  };
  star(gx + cw * 4.6, gy + ch * 1.22, 7, 'rgba(238,159,186,0.85)');
  star(gx + cw * 0.55, gy + ch * 3.62, 6, 'rgba(150,180,220,0.8)');
  c.strokeStyle = 'rgba(120,150,190,0.7)'; c.lineWidth = 2.4;
  c.beginPath(); c.moveTo(gx + cw * 3.2, gy + ch * 2.6); c.lineTo(gx + cw * 3.34, gy + ch * 2.76); c.lineTo(gx + cw * 3.64, gy + ch * 2.38); c.stroke();

  // circled day (pink marker)
  c.save();
  const ccx = gx + cw * 2.5, ccy = gy + ch * 4.5;
  c.strokeStyle = 'rgba(238,145,176,0.85)'; c.lineWidth = 6; c.lineCap = 'round';
  c.beginPath(); c.ellipse(ccx, ccy, cw * 0.44, ch * 0.36, -0.08, 0.2, Math.PI * 1.92); c.stroke();
  c.globalAlpha = 0.45; c.lineWidth = 4;
  c.beginPath(); c.ellipse(ccx + 3, ccy - 2, cw * 0.43, ch * 0.35, 0.1, 0.4, Math.PI * 1.9); c.stroke();
  c.restore();

  // cat doodle across the lower-left / centre cells
  c.save();
  const kx = gx + cw * 0.95, ky = gy + ch * 2.55;
  c.strokeStyle = 'rgba(118,132,160,0.92)'; c.fillStyle = 'rgba(250,246,238,0.9)';
  c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round';
  // body
  c.beginPath();
  c.ellipse(kx, ky + 52, 30, 33, -0.06, 0, Math.PI * 2); c.fill(); c.stroke();
  // head
  c.beginPath(); c.arc(kx - 12, ky - 4, 25, 0, Math.PI * 2); c.fill(); c.stroke();
  // ears
  c.beginPath();
  c.moveTo(kx - 32, ky - 10); c.lineTo(kx - 30, ky - 34); c.lineTo(kx - 14, ky - 22); c.closePath(); c.fill(); c.stroke();
  c.beginPath();
  c.moveTo(kx + 2, ky - 26); c.lineTo(kx + 14, ky - 42); c.lineTo(kx + 16, ky - 16); c.closePath(); c.fill(); c.stroke();
  // closed happy eyes
  c.beginPath(); c.arc(kx - 21, ky - 4, 5.5, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
  c.beginPath(); c.arc(kx - 3, ky - 6, 5.5, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
  // nose + smile
  c.fillStyle = 'rgba(238,159,186,0.9)';
  c.beginPath(); c.moveTo(kx - 11, ky + 3); c.lineTo(kx - 7, ky + 3); c.lineTo(kx - 9, ky + 6); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(118,132,160,0.92)';
  c.beginPath(); c.arc(kx - 14, ky + 7, 4.5, 0.1, Math.PI - 0.1); c.arc(kx - 5, ky + 7, 4.5, 0.1, Math.PI - 0.1); c.stroke();
  // whiskers
  c.lineWidth = 1.7;
  for (const dy of [-2, 4]) {
    c.beginPath(); c.moveTo(kx - 30, ky + dy); c.lineTo(kx - 46, ky + dy - 3); c.stroke();
    c.beginPath(); c.moveTo(kx + 9, ky + dy); c.lineTo(kx + 25, ky + dy - 3); c.stroke();
  }
  // tail
  c.lineWidth = 2.6;
  c.beginPath(); c.moveTo(kx + 24, ky + 68); c.quadraticCurveTo(kx + 58, ky + 60, kx + 48, ky + 32); c.stroke();
  // tiny "meow"
  c.fillStyle = 'rgba(150,161,182,0.85)';
  c.font = 'italic 15px "Segoe Script", "Comic Sans MS", cursive';
  c.fillText('meow', kx + 28, ky - 32);
  c.restore();

  // a sticker-ish highlighter swipe
  c.fillStyle = 'rgba(252,226,160,0.42)';
  c.fillRect(gx + cw * 3.08, gy + ch * 3.62, cw * 0.85, 16);
  paperGrain(c, W, H, 3.8, 12);
  return ctx.textureLib.fromCanvas(canvas);
}

function buildCalendar(ctx, root) {
  const tex = paintCalendar(ctx);
  const g = addFlatArt(ctx, root, {
    w: 0.40, h: 0.55, tex, x: 2.0895, y: 1.63, z: -0.05, rotY: -Math.PI / 2, thick: 0.007, shadow: 0.014
  });
  // two tiny brass pins at the top (local space of the rotated paper group)
  for (const dx of [-0.15, 0.15]) {
    kit.mesh(kit.sphereGeo(0.0045, 12), ctx.materials.brass, {
      pos: [dx, 0.249, 0.0045], parent: g, cast: false
    });
  }
  return g;
}

/* ------------------------------------------------------------------ *
 *  hexagon wall tiles
 * ------------------------------------------------------------------ */
function buildHexagons(ctx, root) {
  const M = ctx.materials;
  const rng = mulberry32(44);
  const fills = [
    new THREE.MeshPhysicalMaterial({ color: 0xf2ead6, roughness: 0.28, metalness: 0.05, clearcoat: 0.85, clearcoatRoughness: 0.16, envMapIntensity: 0.9 }),
    new THREE.MeshPhysicalMaterial({ color: 0xc9e6d8, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.85 }),
    new THREE.MeshPhysicalMaterial({ color: 0xdcd3f0, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.85 }),
    new THREE.MeshPhysicalMaterial({ color: 0xf6d9dd, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.85 }),
    new THREE.MeshPhysicalMaterial({ color: 0xd9e8f6, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.85 }),
    new THREE.MeshPhysicalMaterial({ color: 0xf7e6c6, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.85 })
  ];
  const g = new THREE.Group(); g.name = 'hex-wall-art'; root.add(g);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const z = lerp(0.62, 1.28, t) + (i % 2 ? 0.012 : -0.008);
    const y = lerp(1.50, 0.95, t) + (i % 2 ? -0.008 : 0.005);
    const size = lerp(0.10, 0.06, t);
    const r = size / 2;
    const tile = new THREE.Group();
    tile.position.set(2.089, y, z);
    g.add(tile);
    const brass = kit.mesh(kit.extrudeShape(kit.hexShape(r), { depth: 0.015, bevel: 0.0024, curveSegments: 1 }), M.brass, { parent: tile });
    brass.rotation.y = -Math.PI / 2;
    const fill = kit.mesh(kit.extrudeShape(kit.hexShape(r * 0.76), { depth: 0.007, bevel: 0.0016, curveSegments: 1 }), fills[i], { parent: tile });
    fill.rotation.y = -Math.PI / 2;
    fill.position.x = -0.008;
    fill.rotation.z = (rng() - 0.5) * 0.05;
    brass.castShadow = true; fill.castShadow = false;
  }
}

/* ------------------------------------------------------------------ *
 *  bay-window shelf books
 * ------------------------------------------------------------------ */
function buildBayBooks(ctx, root) {
  const bay = ctx.slots?.bayShelf;
  const shelfX = bay?.x ?? 2.245;
  const z0 = bay?.z0 ?? -2.16;
  const z1 = bay?.z1 ?? -1.84;
  const shelves = bay?.shelves ?? [
    { y: 1.0025, top: 1.275 }, { y: 1.2875, top: 1.575 },
    { y: 1.5875, top: 1.875 }, { y: 1.8875, top: 2.14 }
  ];
  const bx = clamp(shelfX - 0.032, 2.15, 2.25); // spines near the room-side opening
  const rng = mulberry32(2024);
  const books = [];
  const zMin = z0 + 0.011, zMax = z1 - 0.011;
  const pick = (i, salt = 0) => BOOK_PALETTE[(i * 5 + salt * 3 + Math.floor(rng() * 7)) % BOOK_PALETTE.length];
  const titleCream = 0xf7ecd2;

  for (let si = 0; si < shelves.length; si++) {
    const sh = shelves[si];
    const avail = Math.min(0.25, (sh.top ?? sh.y + 0.27) - sh.y - 0.03);
    let z = zMin;
    let guard = 0;
    let force = null;
    while (z < zMax - 0.018 && guard++ < 22) {
      const remain = zMax - z;
      let kind = force || (rng() < 0.18 ? 'stack' : rng() < 0.29 ? 'lean' : 'upright');
      force = null;
      if (kind === 'stack' && remain < 0.185) kind = 'upright';
      if (kind === 'lean' && remain < 0.065) kind = 'upright';
      const depth = 0.155 + rng() * 0.024;

      if (kind === 'stack') {
        const len = 0.15 + rng() * 0.035; // along z
        const n = 2 + Math.floor(rng() * 2);
        let yy = sh.y;
        let cz = z + len / 2;
        let lastColor = 0;
        for (let k = 0; k < n; k++) {
          const th = 0.016 + rng() * 0.014;
          const col = pick(si, k);
          lastColor = col;
          books.push({
            size: [depth, len, th],
            pos: [bx, yy + th / 2, cz + (k % 2 ? 0.004 : -0.003)],
            rot: [Math.PI / 2, Math.PI, (rng() - 0.5) * 0.045],
            color: col
          });
          // coloured cover plates make the page block read as a real book stack
          for (const sgn of [0, 1]) {
            books.push({
              size: [depth + 0.004, len + 0.004, 0.0016],
              pos: [bx, yy + (sgn ? th : 0), cz + (k % 2 ? 0.004 : -0.003)],
              rot: [Math.PI / 2, Math.PI, 0],
              color: col, noPages: true
            });
          }
          yy += th + 0.0022;
        }
        // a cheeky ribbon bookmark peeking out
        if (rng() < 0.7) {
          books.push({
            size: [0.055, 0.0022, 0.013],
            pos: [bx - depth / 2 + 0.012, yy + 0.0016, cz + 0.012],
            rot: [0, 0, (rng() - 0.5) * 0.1],
            color: rng() < 0.5 ? 0xef9fb6 : 0xe6cf7c, noPages: true
          });
        }
        z += len + 0.012;
      } else if (kind === 'lean') {
        const h = Math.min(avail - 0.005, 0.18 + rng() * 0.06);
        const th = 0.019 + rng() * 0.017;
        const a = (rng() < 0.5 ? -1 : 1) * (0.12 + rng() * 0.07);
        const y = sh.y + (h / 2) * Math.cos(a) + (th / 2) * Math.abs(Math.sin(a)) + 0.002;
        books.push({
          size: [depth, h, th],
          pos: [bx, y, z + th / 2 + 0.004],
          rot: [a, 0, (rng() - 0.5) * 0.02],
          color: pick(si, 3),
          pagesTop: true
        });
        z += th + 0.006;
        force = 'upright';
      } else {
        const h = Math.min(avail - 0.004, 0.175 + rng() * 0.07);
        const th = 0.02 + rng() * 0.023;
        const zc = z + th / 2;
        const rz = (rng() - 0.5) * 0.03;
        const col = pick(si, 5);
        books.push({
          size: [depth, h, th],
          pos: [bx, sh.y + h / 2, zc],
          rot: [0, 0, rz],
          color: col,
          pagesTop: true
        });
        // little cream title band on the spine
        if (rng() < 0.62) {
          const bandH = h * (0.08 + rng() * 0.06);
          const bandY = sh.y + h * (0.68 + rng() * 0.14);
          books.push({
            size: [0.0022, bandH, th * 0.62],
            pos: [bx - depth / 2 - 0.0011, bandY, zc],
            rot: [0, 0, rz],
            color: rng() < 0.25 ? 0xe6cf7c : titleCream,
            noPages: true
          });
        }
        z += th + 0.0026;
      }
    }
  }
  const merged = kit.buildBooks(books);
  merged.name = 'bay-books';
  merged.castShadow = true; merged.receiveShadow = true;
  root.add(merged);
  return merged;
}

/* ------------------------------------------------------------------ *
 *  bay-window sill: seat pad + striped lean cushions
 * ------------------------------------------------------------------ */
function stripedTexture(ctx, base, stripe = '#fbfdff', repeatX = 1) {
  const W = 512, H = 512;
  const { canvas, ctx: c } = ctx.textureLib.canvas(W, H);
  c.fillStyle = base; c.fillRect(0, 0, W, H);
  const n = 9;
  const sw = W / n;
  for (let i = 0; i < n; i += 2) {
    c.fillStyle = stripe;
    c.fillRect(i * sw, 0, sw * 0.52, H);
  }
  // woven grain
  const rng = mulberry32(17);
  for (let i = 0; i < 2400; i++) {
    c.fillStyle = `rgba(${rng() < 0.5 ? 0 : 255},${rng() < 0.5 ? 0 : 255},${rng() < 0.5 ? 0 : 255},${0.015 + rng() * 0.02})`;
    c.fillRect(rng() * W, rng() * H, 1.2, 1.2);
  }
  const tex = ctx.textureLib.fromCanvas(canvas);
  tex.repeat.set(repeatX, 1);
  return tex;
}

function roundedRectPoints(w, h, r, seg = 6) {
  const pts = [];
  const x = -w / 2, y = -h / 2;
  const corners = [
    [x + w - r, y + r, -Math.PI / 2, 0],
    [x + w - r, y + h - r, 0, Math.PI / 2],
    [x + r, y + h - r, Math.PI / 2, Math.PI],
    [x + r, y + r, Math.PI, Math.PI * 1.5]
  ];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = lerp(a0, a1, i / seg);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
  }
  return pts;
}

function makeCushion(ctx, { w, h, tex, piping = 0xeef6fb, pipingR = 0.006 }) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, color: 0xffffff, roughness: 0.92, metalness: 0,
    sheen: 0.65, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff),
    envMapIntensity: 0.35
  });
  const body = kit.mesh(kit.rboxGeo(w, h, 0.115, Math.min(w, h) * 0.16, 4), mat, { parent: g });
  body.scale.set(1.0, 1.0, 1.0);
  // piping sits on the widest silhouette (local z=0), so it can never float off the face
  const pts = roundedRectPoints(w * 0.995, h * 0.995, Math.min(w, h) * 0.16).map(p => [p.x, p.y, 0]);
  const pipe = kit.tube(pts, Math.min(pipingR, 0.0045), new THREE.MeshStandardMaterial({ color: piping, roughness: 0.65 }), 96, 6, true);
  pipe.castShadow = false; pipe.receiveShadow = true;
  g.add(pipe);
  // tiny center button
  kit.mesh(kit.cylGeo(0.008, 0.008, 0.008, 12), new THREE.MeshStandardMaterial({ color: piping, roughness: 0.7 }), {
    pos: [0, 0, 0.0575], rot: [Math.PI / 2, 0, 0], parent: g, cast: false
  });
  return g;
}

function buildSillCushions(ctx, root) {
  const M = ctx.materials;
  const sillY = 0.97;
  const padTop = sillY + 0.052;

  // white seat pad — soft, slightly overhanging the sill lip
  const padMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5f2ea, roughness: 0.92, metalness: 0, sheen: 0.55,
    sheenRoughness: 0.75, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 0.28,
    map: M.sheet.map ? M.sheet.map.clone() : null,
    normalMap: M.sheet.normalMap ? M.sheet.normalMap.clone() : null,
    normalScale: new THREE.Vector2(0.16, 0.16)
  });
  if (padMat.map) { padMat.map.repeat.set(1.3, 1.3); padMat.map.needsUpdate = true; }
  if (padMat.normalMap) { padMat.normalMap.repeat.set(1.3, 1.3); padMat.normalMap.needsUpdate = true; }
  const pad = kit.mesh(kit.rboxGeo(0.29, 0.052, 1.46, 0.024, 3), padMat, {
    pos: [2.145, sillY + 0.026, -1.05], parent: root
  });
  pad.name = 'bay-seat-pad';
  pad.castShadow = true; pad.receiveShadow = true;
  // two soft seam lines across the pad
  const seamMat = new THREE.MeshStandardMaterial({ color: 0xe4edf6, roughness: 0.8 });
  for (const z of [-1.48, -0.93]) {
    kit.mesh(kit.boxGeo(0.28, 0.003, 0.004), seamMat, { pos: [2.145, padTop + 0.0008, z], parent: root, cast: false });
  }
  // soft stitched edge band along the pad's lower rim
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe3ecf5, roughness: 0.78 });
  kit.mesh(kit.rboxGeo(0.294, 0.018, 1.468, 0.007, 2), edgeMat, {
    pos: [2.145, sillY + 0.009, -1.05], parent: root, cast: false
  });
  // thin stitched seam along the pad's front edge (subtle, warm thread)
  const stitchMat = new THREE.MeshStandardMaterial({ color: 0xded8ca, roughness: 0.82 });
  kit.mesh(kit.boxGeo(0.0018, 0.0026, 1.40), stitchMat, {
    pos: [2.0009, sillY + 0.024, -1.05], parent: root, cast: false
  });
  kit.mesh(kit.boxGeo(0.0018, 0.0026, 1.40), stitchMat, {
    pos: [2.2891, sillY + 0.024, -1.05], parent: root, cast: false
  });

  // mint striped lean cushion
  const mintTex = stripedTexture(ctx, '#b9e3d1', '#fbfdff', 1.0);
  const mint = makeCushion(ctx, { w: 0.34, h: 0.335, tex: mintTex, piping: 0xf2fbf6 });
  mint.rotation.order = 'YXZ';
  mint.rotation.set(-0.24, -Math.PI / 2 + 0.06, 0);
  mint.position.set(2.155, padTop + 0.168, -1.56);
  mint.name = 'bay-cushion-mint';
  root.add(mint);

  // blush striped lean cushion
  const blushTex = stripedTexture(ctx, '#f6c3d2', '#fff6f9', 1.0);
  const blush = makeCushion(ctx, { w: 0.35, h: 0.34, tex: blushTex, piping: 0xfff4f7 });
  blush.rotation.order = 'YXZ';
  blush.rotation.set(-0.30, -Math.PI / 2 - 0.08, 0);
  blush.position.set(2.125, padTop + 0.172, -1.26);
  blush.name = 'bay-cushion-blush';
  root.add(blush);

  // grounding on the sill — soft AO seam at the front base + on top
  ctx.addContactShadow(1.978, -1.05, 0.11, 1.47, 0.26, sillY + 0.0015);
  ctx.addContactShadow(2.14, -1.05, 0.33, 1.50, 0.10, padTop + 0.0015);
  return { padTop, pad };
}

/* ------------------------------------------------------------------ *
 *  snake plant in a purple glazed pot
 * ------------------------------------------------------------------ */
function buildPlant(ctx, root) {
  const M = ctx.materials;
  const px = -0.95, pz = -1.42;
  const g = new THREE.Group();
  g.name = 'snake-plant';
  g.position.set(px, 0, pz);
  root.add(g);

  // purple glazed pot — lathe profile with rim + foot
  const profile = [
    [0.0, 0.0], [0.062, 0.0], [0.072, 0.006], [0.078, 0.016],
    [0.085, 0.06], [0.095, 0.16], [0.103, 0.245], [0.109, 0.278],
    [0.115, 0.292], [0.115, 0.302], [0.105, 0.304], [0.098, 0.298],
    [0.098, 0.288], [0.0, 0.288]
  ].map(([x, y]) => [x, y]);
  const potMat = M.ceramicPurple.clone();
  potMat.side = THREE.DoubleSide;
  potMat.color = new THREE.Color(0xffffff);
  const pot = kit.lathe(profile, potMat, 44);
  pot.castShadow = true; pot.receiveShadow = true;
  pot.name = 'purple-pot';
  g.add(pot);

  // rim lip + foot
  const rim = kit.mesh(new THREE.TorusGeometry(0.109, 0.006, 8, 40), potMat, {
    pos: [0, 0.301, 0], rot: [Math.PI / 2, 0, 0], parent: g, cast: false
  });
  rim.receiveShadow = true;
  const foot = kit.mesh(kit.cylGeo(0.066, 0.07, 0.014, 28), potMat, { pos: [0, 0.007, 0], parent: g });
  foot.castShadow = true;

  // soil
  const soil = kit.mesh(kit.cylGeo(0.101, 0.101, 0.02, 32), M.soil, { pos: [0, 0.283, 0], parent: g });
  soil.receiveShadow = true; soil.castShadow = false;
  // pebbles + a tiny dried leaf
  const prng = mulberry32(66);
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xb9ad9c, roughness: 0.95 });
  const pebbleMat2 = new THREE.MeshStandardMaterial({ color: 0x8f8779, roughness: 0.95 });
  for (let i = 0; i < 7; i++) {
    const a = prng() * Math.PI * 2, rr = 0.015 + prng() * 0.07;
    kit.mesh(kit.sphereGeo(0.006 + prng() * 0.006, 8), i % 3 ? pebbleMat : pebbleMat2, {
      pos: [Math.cos(a) * rr, 0.292, Math.sin(a) * rr], scale: [1, 0.6, 0.9], parent: g, cast: false
    });
  }

  // 9 curved sansevieria blades — merged into one mesh
  const N = 12, M2 = 4;
  const geos = [];
  const rng = mulberry32(1234);
  const cCenter = new THREE.Color(0x3e773c);
  const cEdge = new THREE.Color(0x9fce84);
  const leafHeights = [0.83, 0.62, 0.75, 0.48, 0.69, 0.40, 0.59, 0.33, 0.55, 0.45, 0.28];
  for (let b = 0; b < leafHeights.length; b++) {
    const h = leafHeights[b] * (0.97 + rng() * 0.06);
    const ang = (b / leafHeights.length) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    const dirX = Math.cos(ang), dirZ = Math.sin(ang);
    const sideX = -dirZ, sideZ = dirX;
    const baseR = 0.02 + rng() * 0.05;
    const bx = dirX * baseR, bz = dirZ * baseR;
    const bow = 0.065 + rng() * 0.075;
    const wmax = 0.054 + rng() * 0.016;
    const twist = (rng() - 0.5) * 0.34;
    const wob = (rng() - 0.5) * 0.02;
    const baseY = 0.215;
    const positions = [], colors = [], indices = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const out = bow * Math.sin(Math.PI * Math.min(1, s * 0.66)) + 0.09 * Math.pow(s, 2.4);
      const y = baseY + h * Math.pow(s, 0.95);
      const wig = wob * Math.sin(s * 4.2 + b * 1.7);
      const cx = bx + dirX * out + sideX * wig;
      const cz = bz + dirZ * out + sideZ * wig;
      const half = wmax * Math.pow(1 - s, 0.5) * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, s * 1.55)));
      const ct = Math.cos(twist * s), st = Math.sin(twist * s);
      const wdx = sideX * ct + dirX * st, wdz = sideZ * ct + dirZ * st;
      const ndx = -sideX * st + dirX * ct, ndz = -sideZ * st + dirZ * ct;
      for (let j = 0; j <= M2; j++) {
        const u = -1 + 2 * j / M2;
        const lat = half * u;
        const bulge = 0.0062 * Math.sqrt(Math.max(0, 1 - u * u));
        positions.push(cx + wdx * lat + ndx * bulge, y, cz + wdz * lat + ndz * bulge);
        const edge = Math.pow(Math.abs(u), 1.35);
        const band = 0.5 + 0.5 * Math.sin(s * 21 + b * 2.1);
        const col = cCenter.clone().lerp(cEdge, edge * 0.95);
        col.lerp(cEdge, band * 0.07);
        // faint darker cross-banding (sansevieria mottling)
        const mott = 0.5 + 0.5 * Math.sin(s * 34 + edge * 2.0 + b * 1.3);
        col.multiplyScalar(0.94 + 0.08 * mott);
        colors.push(col.r, col.g, col.b);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M2; j++) {
        const a = i * (M2 + 1) + j, bb = a + 1, cc = a + M2 + 1, dd = cc + 1;
        indices.push(a, cc, bb, bb, cc, dd);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geos.push(geo);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach(g2 => g2.dispose());
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  const leafMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.42, metalness: 0.02,
    side: THREE.DoubleSide, sheen: 0.35, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xd8f0b2), envMapIntensity: 0.55,
    clearcoat: 0.18, clearcoatRoughness: 0.4
  });
  const leaves = new THREE.Mesh(merged, leafMat);
  leaves.name = 'snake-leaves';
  leaves.castShadow = true; leaves.receiveShadow = true;
  g.add(leaves);

  ctx.addContactShadow(px, pz, 0.46, 0.46, 0.36, 0.007);
  // small collider so the player doesn't walk through the pot
  try {
    ctx.addColliderBox(new THREE.Box3(
      new THREE.Vector3(px - 0.14, 0, pz - 0.14),
      new THREE.Vector3(px + 0.14, 0.34, pz + 0.14)
    ));
  } catch (e) { /* optional */ }
  return g;
}

/* ------------------------------------------------------------------ *
 *  desk clutter + lamp
 * ------------------------------------------------------------------ */

// hand-written notebook page / loose sheet
function paintSheet(ctx, { kind = 'note', seed = 1, W = 420, H = 560 } = {}) {
  const { canvas, ctx: c } = ctx.textureLib.canvas(W, H);
  const rng = mulberry32(seed);
  c.fillStyle = kind === 'notebook' ? '#fdfbf2' : '#fffdf7';
  c.fillRect(0, 0, W, H);
  // paper edge shading
  const eg = c.createLinearGradient(0, 0, 0, H);
  eg.addColorStop(0, 'rgba(206,198,178,0.16)'); eg.addColorStop(0.1, 'rgba(255,255,255,0)');
  eg.addColorStop(0.9, 'rgba(255,255,255,0)'); eg.addColorStop(1, 'rgba(190,182,166,0.18)');
  c.fillStyle = eg; c.fillRect(0, 0, W, H);
  // faint ruled lines
  if (kind === 'notebook' || kind === 'note') {
    c.strokeStyle = kind === 'notebook' ? 'rgba(150,186,222,0.33)' : 'rgba(174,202,230,0.24)';
    c.lineWidth = 1.2;
    const top = kind === 'notebook' ? 90 : 60;
    for (let y = top; y < H - 40; y += 34) {
      c.beginPath(); c.moveTo(30, y); c.lineTo(W - 24, y); c.stroke();
    }
  }
  // margin line
  c.strokeStyle = 'rgba(234,150,166,0.35)'; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(W * 0.16, 30); c.lineTo(W * 0.16, H - 24); c.stroke();

  // heading / date
  c.fillStyle = 'rgba(92,104,128,0.88)';
  c.font = 'italic 600 23px "Segoe Script", "Comic Sans MS", "DejaVu Sans", cursive';
  if (kind === 'notebook') {
    c.fillText('monday dreams', 64, 58);
    c.font = '500 15px "Trebuchet MS", sans-serif';
    c.fillStyle = 'rgba(150,160,180,0.8)';
    c.fillText('oct 14', W - 110, 54);
    // list notes
    for (let i = 0; i < 7; i++) {
      const y = 126 + i * 34;
      let x = 76;
      if (i % 3 === 0) {
        c.strokeStyle = 'rgba(120,140,168,0.7)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(52, y - 5); c.lineTo(57, y); c.lineTo(66, y - 13); c.stroke();
      } else {
        c.fillStyle = 'rgba(238,159,186,0.7)';
        c.beginPath(); c.arc(58, y - 6, 3, 0, Math.PI * 2); c.fill();
      }
      penScratch(c, x, y, 150 + rng() * 120, 9, 'rgba(96,108,132,0.85)', rng, 0.82);
    }
    // doodle: tiny cloud + star + heart
    c.strokeStyle = 'rgba(140,158,190,0.75)'; c.lineWidth = 2;
    c.beginPath(); c.arc(W * 0.68, H * 0.83, 18, Math.PI * 0.9, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(W * 0.72, H * 0.82, 22, Math.PI * 0.95, Math.PI * 1.95); c.stroke();
    c.fillStyle = 'rgba(238,159,186,0.7)';
    c.beginPath(); c.moveTo(W * 0.42, H * 0.87); c.bezierCurveTo(W * 0.38, H * 0.84, W * 0.39, H * 0.80, W * 0.42, H * 0.82);
    c.bezierCurveTo(W * 0.45, H * 0.80, W * 0.46, H * 0.84, W * 0.42, H * 0.87); c.fill();
    c.fillStyle = 'rgba(120,140,170,0.6)'; c.font = 'italic 18px "Segoe Script", cursive';
    c.fillText('remember to breathe', W * 0.30, H * 0.96);
  } else if (kind === 'todo') {
    c.fillText('to do', 64, 58);
    for (let i = 0; i < 6; i++) {
      const y = 115 + i * 40;
      c.strokeStyle = 'rgba(130,150,180,0.7)'; c.lineWidth = 2;
      c.strokeRect(50, y - 15, 17, 17);
      if (i % 2 === 0) {
        c.beginPath(); c.moveTo(53, y - 7); c.lineTo(58, y - 1); c.lineTo(68, y - 13); c.stroke();
      }
      penScratch(c, 84, y, 120 + rng() * 140, 10, 'rgba(96,108,132,0.85)', rng, 0.8);
    }
    // star doodle
    c.fillStyle = 'rgba(240,188,92,0.8)';
    const sx = W * 0.74, sy = H * 0.8;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 === 0 ? 20 : 9;
      i === 0 ? c.moveTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr) : c.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  } else {
    // little sketch / letter
    c.fillText('dear room,', 64, 58);
    for (let i = 0; i < 7; i++) {
      penScratch(c, 64, 112 + i * 40, 150 + rng() * 170, 10, 'rgba(96,108,132,0.82)', rng, 0.8);
    }
    c.strokeStyle = 'rgba(150,170,200,0.65)'; c.lineWidth = 2;
    c.strokeRect(W * 0.62, H * 0.78, 96, 74);
    c.beginPath(); c.moveTo(W * 0.62, H * 0.78 + 18); c.lineTo(W * 0.68, H * 0.78 + 30); c.lineTo(W * 0.78, H * 0.78); c.stroke();
    c.fillStyle = 'rgba(238,159,186,0.7)'; c.font = 'italic 20px "Segoe Script", cursive';
    c.fillText('xoxo', W * 0.30, H * 0.9);
  }
  paperGrain(c, W, H, 3.4, seed + 7);
  return ctx.textureLib.fromCanvas(canvas);
}

function buildDeskClutter(ctx, root) {
  const M = ctx.materials;
  const desk = ctx.slots?.desk;
  const topY = desk?.topY ?? 0.76;
  const g = new THREE.Group(); g.name = 'desk-clutter'; root.add(g);

  /* ---------------- desk lamp ---------------- */
  {
    const lamp = new THREE.Group();
    lamp.name = 'desk-lamp';
    lamp.position.set(1.86, topY, 1.52);
    g.add(lamp);
    const cream = new THREE.MeshPhysicalMaterial({
      color: 0xeee3ce, roughness: 0.38, metalness: 0.01, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.85
    });
    // flared ceramic foot with a soft lip
    const base = kit.lathe([
      [0, 0], [0.075, 0], [0.081, 0.006], [0.08, 0.013], [0.07, 0.022],
      [0.048, 0.031], [0.03, 0.041], [0.022, 0.05], [0.019, 0.056], [0, 0.056]
    ].map(([x, y]) => [x, y]), cream, 44);
    base.castShadow = true; base.receiveShadow = true; lamp.add(base);
    // slim neck + brass collars
    kit.mesh(kit.cylGeo(0.0105, 0.0105, 0.155, 14), M.metalSoft, { pos: [0, 0.135, 0], parent: lamp });
    kit.mesh(kit.cylGeo(0.019, 0.016, 0.014, 16), M.brassSoft, { pos: [0, 0.06, 0], parent: lamp });
    kit.mesh(kit.cylGeo(0.018, 0.014, 0.012, 16), M.brassSoft, { pos: [0, 0.204, 0], parent: lamp });
    // butter-yellow rounded cube shade
    const shadeMat = M.lampShade.clone();
    shadeMat.color = new THREE.Color(0xf6d68e);
    shadeMat.emissive = new THREE.Color(0xffc978);
    shadeMat.emissiveIntensity = 0.0;
    shadeMat.roughness = 0.52;
    shadeMat.opacity = 1.0;
    shadeMat.transparent = false;
    const shade = kit.mesh(kit.rboxGeo(0.124, 0.112, 0.124, 0.023, 3), shadeMat, { pos: [0, 0.262, 0], parent: lamp });
    shade.name = 'desk-lamp-shade';
    // soft rim under the shade
    kit.mesh(kit.rboxGeo(0.128, 0.012, 0.128, 0.005, 1), new THREE.MeshStandardMaterial({ color: 0xead08d, roughness: 0.5 }), {
      pos: [0, 0.207, 0], parent: lamp
    });
    // little brass yoke under the shade
    kit.mesh(kit.cylGeo(0.022, 0.03, 0.014, 16), M.brassSoft, { pos: [0, 0.2, 0], parent: lamp });
    // bulb + glowing underside
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff5dd, emissive: 0xffd79a, emissiveIntensity: 0, roughness: 0.4 });
    kit.mesh(kit.sphereGeo(0.031, 14), bulbMat, { pos: [0, 0.202, 0], parent: lamp, cast: false });
    const glow = kit.mesh(new THREE.CircleGeometry(0.052, 24), bulbMat, { pos: [0, 0.201, 0], rot: [Math.PI / 2, 0, 0], parent: lamp, cast: false });
    glow.userData.noOutline = true;
    // little switch on the base
    kit.mesh(kit.cylGeo(0.008, 0.008, 0.008, 10), new THREE.MeshStandardMaterial({ color: 0xef9fb6, roughness: 0.5 }), {
      pos: [0.045, 0.041, 0.045], rot: [0, 0, 0], parent: lamp, cast: false
    });
    // cute pink pull cord with a bead
    const cordMat = new THREE.MeshStandardMaterial({ color: 0xf2a9bf, roughness: 0.6 });
    kit.mesh(kit.cylGeo(0.0016, 0.0016, 0.062, 6), cordMat, { pos: [0.049, 0.176, 0.049], parent: lamp, cast: false });
    kit.mesh(kit.sphereGeo(0.0075, 10), cordMat, { pos: [0.049, 0.144, 0.049], parent: lamp, cast: false });

    ctx.lights.fixtures.desk = { shadeMat, bulbMat };
    // keep the practical point light inside the lamp Lead moved to the desk's south end
    try {
      if (ctx.lights.deskLamp) ctx.lights.deskLamp.position.set(1.86, 1.035, 1.52);
      if (ctx.lights.deskGlow) ctx.lights.deskGlow.position.set(1.76, 0.96, 1.42);
    } catch (e) { /* optional */ }
    ctx.registerInteract(shade, {
      id: 'deskLamp', label: 'Desk lamp',
      onUse: () => {
        const on = !(ctx.lights.lampState?.desk);
        ctx.setLamp('desk', on);
        ctx.audio?.click?.(on ? 940 : 620);
        ctx.toast?.(on ? 'Desk lamp on · warm glow' : 'Desk lamp off');
      }
    });
    ctx.addContactShadow(1.86, 1.52, 0.3, 0.3, 0.24, topY + 0.003);
  }

  /* ---------------- kraft box with open flaps ---------------- */
  {
    const boxG = new THREE.Group();
    boxG.name = 'kraft-box';
    boxG.position.set(1.62, topY, 0.55);
    g.add(boxG);
    const bw = 0.18, bd = 0.16, bh = 0.13, t = 0.007;
    const card = M.cardboard;
    const edge = M.cardboardEdge;
    // floor + walls
    kit.mesh(kit.rboxGeo(bw, 0.008, bd, 0.002, 1), card, { pos: [0, 0.004, 0], parent: boxG });
    kit.mesh(kit.rboxGeo(t, bh, bd, 0.002, 1), card, { pos: [-bw / 2 + t / 2, 0.065, 0], parent: boxG });
    kit.mesh(kit.rboxGeo(t, bh, bd, 0.002, 1), card, { pos: [bw / 2 - t / 2, 0.065, 0], parent: boxG });
    kit.mesh(kit.rboxGeo(bw, bh, t, 0.002, 1), card, { pos: [0, 0.065, -bd / 2 + t / 2], parent: boxG });
    kit.mesh(kit.rboxGeo(bw, bh, t, 0.002, 1), card, { pos: [0, 0.065, bd / 2 - t / 2], parent: boxG });
    // inner lip / wall tops (lighter edge)
    kit.mesh(kit.boxGeo(bw, 0.002, bd), edge, { pos: [0, 0.1305, 0], parent: boxG, cast: false });
    // flaps
    const flap = (px, pz, rotX, rotZ, w, l, ax, az) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, 0.128, pz);
      pivot.rotation.x = rotX; pivot.rotation.z = rotZ;
      boxG.add(pivot);
      kit.mesh(kit.rboxGeo(w, 0.006, l, 0.002, 1), card, { pos: [ax, 0.003, az], parent: pivot });
    };
    flap(bw / 2, 0, 0, 1.18, 0.092, bd * 0.96, 0.046, 0);      // back flap up
    flap(-bw / 2, 0, 0, -1.95, 0.10, bd * 0.96, -0.05, 0);     // front flap folded down
    flap(0, bd / 2, -1.32, 0, bw * 0.96, 0.098, 0, 0.048);     // south flap up/out
    flap(0, -bd / 2, 1.32, 0, bw * 0.96, 0.098, 0, -0.048);    // north flap up/out
    // crumpled tissue inside
    const tissueMat = new THREE.MeshStandardMaterial({ color: 0xfdf4e4, roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      kit.mesh(kit.sphereGeo(0.022 + i * 0.004, 7), tissueMat, {
        pos: [-0.03 + i * 0.028, 0.095 + (i % 2) * 0.012, -0.02 + i * 0.02],
        scale: [1.15, 0.7, 1.0], parent: boxG, cast: false
      });
    }
    // shipping label on the west face
    const label = kit.mesh(kit.planeGeo(0.065, 0.042), new THREE.MeshStandardMaterial({ color: 0xf7f2e3, roughness: 0.95 }), {
      pos: [-bw / 2 - 0.0006, 0.082, 0.018], rot: [0, -Math.PI / 2, 0], parent: boxG, cast: false
    });
    label.receiveShadow = true;
    const lmat = new THREE.MeshStandardMaterial({ color: 0x9d8c74, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      kit.mesh(kit.boxGeo(0.001, 0.0026, 0.042 - i * 0.008), lmat, {
        pos: [-bw / 2 - 0.0012, 0.094 - i * 0.007, 0.018], parent: boxG, cast: false
      });
    }
    ctx.addContactShadow(1.62, 0.55, 0.26, 0.24, 0.26, topY + 0.002);
  }

  /* ---------------- green pencil cup + pencils ---------------- */
  {
    const cupG = new THREE.Group();
    cupG.name = 'pencil-cup';
    cupG.position.set(1.63, topY, 0.80);
    g.add(cupG);
    const cupMat = M.green.clone();
    cupMat.roughness = 0.42; cupMat.metalness = 0.02;
    if ('clearcoat' in cupMat) { cupMat.clearcoat = 0.5; cupMat.clearcoatRoughness = 0.2; }
    const cup = kit.lathe([
      [0, 0], [0.032, 0], [0.036, 0.004], [0.04, 0.012], [0.043, 0.085],
      [0.041, 0.093], [0.038, 0.094], [0.036, 0.086], [0.035, 0.022], [0.032, 0.014], [0, 0.014]
    ].map(([x, y]) => [x, y]), cupMat, 32);
    cup.castShadow = true; cup.receiveShadow = true; cupG.add(cup);
    // pencils & pens
    const prng = mulberry32(9001);
    const bodyMats = [
      new THREE.MeshStandardMaterial({ color: 0xe8b64c, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x7f9fd8, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0xe39ab5, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x5fa8a4, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ color: 0xe89a4b, roughness: 0.5 })
    ];
    const wood = new THREE.MeshStandardMaterial({ color: 0xe6c69a, roughness: 0.8 });
    const graphite = new THREE.MeshStandardMaterial({ color: 0x3c3a42, roughness: 0.5 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8a7fa0, roughness: 0.4, metalness: 0.2 });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + 0.35;
      const tilt = 0.055 + prng() * 0.16;
      const len = 0.155 + prng() * 0.035;
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.012, 0);
      pivot.rotation.x = tilt * Math.sin(a);
      pivot.rotation.z = -tilt * Math.cos(a);
      cupG.add(pivot);
      const body = kit.mesh(kit.cylGeo(0.0042, 0.0042, len, 8), bodyMats[i], {
        pos: [0, len / 2, 0], parent: pivot
      });
      body.castShadow = true;
      if (i < 3) {
        // wooden pencil tip + graphite
        kit.mesh(kit.cylGeo(0.0042, 0.0008, 0.018, 8), wood, { pos: [0, len + 0.009, 0], parent: pivot, cast: false });
        kit.mesh(kit.sphereGeo(0.0016, 6), graphite, { pos: [0, len + 0.018, 0], parent: pivot, cast: false });
        // eraser ferrule
        kit.mesh(kit.cylGeo(0.0045, 0.0045, 0.012, 8), capMat, { pos: [0, len - 0.004, 0], parent: pivot, cast: false });
      } else {
        // pen cap
        kit.mesh(kit.cylGeo(0.0048, 0.0048, 0.024, 8), capMat, { pos: [0, len - 0.008, 0], parent: pivot, cast: false });
      }
    }
    ctx.addContactShadow(1.63, 0.80, 0.16, 0.16, 0.18, topY + 0.002);
  }

  /* ---------------- ceramic mug + faint steam ---------------- */
  {
    const mugG = new THREE.Group();
    mugG.name = 'mug';
    mugG.position.set(1.97, topY, 0.66);
    g.add(mugG);
    const mugMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7e9e2, roughness: 0.22, metalness: 0, clearcoat: 0.9,
      clearcoatRoughness: 0.1, envMapIntensity: 1.0
    });
    const mug = kit.lathe([
      [0, 0], [0.031, 0], [0.036, 0.005], [0.039, 0.014], [0.042, 0.078],
      [0.040, 0.086], [0.036, 0.087], [0.036, 0.078], [0.035, 0.02], [0.031, 0.012], [0, 0.012]
    ].map(([x, y]) => [x, y]), mugMat, 32);
    mug.castShadow = true; mug.receiveShadow = true; mugG.add(mug);
    kit.mesh(kit.cylGeo(0.0355, 0.0355, 0.003, 24), new THREE.MeshStandardMaterial({ color: 0x7a5238, roughness: 0.35 }), {
      pos: [0, 0.076, 0], parent: mugG, cast: false
    });
    const handle = kit.mesh(new THREE.TorusGeometry(0.025, 0.0062, 8, 22, Math.PI * 1.35), mugMat, {
      pos: [0.038, 0.048, 0], rot: [0, 0, -Math.PI * 0.62], parent: mugG
    });
    handle.castShadow = true;
    // tiny painted heart on the mug
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, 0.006);
    heartShape.bezierCurveTo(-0.011, -0.002, -0.008, -0.011, 0, -0.005);
    heartShape.bezierCurveTo(0.008, -0.011, 0.011, -0.002, 0, 0.006);
    const heart = new THREE.Mesh(new THREE.ShapeGeometry(heartShape), new THREE.MeshStandardMaterial({ color: 0xef9fb6, roughness: 0.45 }));
    heart.position.set(-0.043, 0.048, 0.0);
    heart.rotation.y = -Math.PI / 2;
    mugG.add(heart);

    // steam wisps (billboarded, very faint)
    const { canvas: sc, ctx: sctx } = ctx.textureLib.canvas(64, 128);
    const sgrad = sctx.createLinearGradient(0, 128, 0, 0);
    sgrad.addColorStop(0, 'rgba(255,255,255,0)');
    sgrad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    sgrad.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = sgrad;
    sctx.beginPath(); sctx.ellipse(32, 64, 15, 55, 0, 0, Math.PI * 2); sctx.fill();
    const steamTex = ctx.textureLib.fromCanvas(sc);
    const wisps = [];
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: steamTex, transparent: true, opacity: 0.12, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false
      });
      const wisp = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.115), mat);
      wisp.position.set(1.97 + (i - 0.5) * 0.014, topY + 0.22, 0.66);
      wisp.userData.noOutline = true; wisp.layers.set(1);
      wisp.renderOrder = 3;
      root.add(wisp);
      wisps.push({ mesh: wisp, phase: i * 2.1 });
    }
    ctx.onFrame((dt, t) => {
      for (const w of wisps) {
        const k = (t * 0.25 + w.phase) % 1;
        w.mesh.position.y = topY + 0.10 + k * 0.16;
        w.mesh.quaternion.copy(ctx.camera.quaternion);
        w.mesh.material.opacity = 0.11 * Math.sin(Math.PI * k) * (Math.sin(t * 0.9 + w.phase) * 0.35 + 0.65);
        w.mesh.scale.set(1 + k * 0.9, 1 + k * 0.6, 1);
      }
    });
    ctx.addContactShadow(1.97, 0.66, 0.14, 0.14, 0.18, topY + 0.002);
  }

  /* ---------------- open notebook, loose papers, notes ---------------- */
  {
    const noteGroup = new THREE.Group(); noteGroup.name = 'desk-papers'; g.add(noteGroup);
    const pageMat = (tex) => new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.25
    });
    const nbTexA = paintSheet(ctx, { kind: 'notebook', seed: 31, W: 420, H: 820 });
    const nbTexB = paintSheet(ctx, { kind: 'letter', seed: 47, W: 420, H: 820 });
    const todoTex = paintSheet(ctx, { kind: 'todo', seed: 62, W: 460, H: 600 });
    const letterTex = paintSheet(ctx, { kind: 'letter', seed: 78, W: 460, H: 600 });
    const sketchTex = paintSheet(ctx, { kind: 'note', seed: 90, W: 460, H: 600 });

    const nb = new THREE.Group();
    nb.name = 'open-notebook';
    nb.position.set(1.855, topY, 1.25);
    nb.rotation.y = 0.07;
    noteGroup.add(nb);
    const cover = kit.mesh(kit.rboxGeo(0.30, 0.005, 0.345, 0.003, 1), new THREE.MeshStandardMaterial({ color: 0x7d8fb8, roughness: 0.62 }), {
      pos: [0, 0.0035, 0], parent: nb
    });
    cover.receiveShadow = true;
    for (const side of [-1, 1]) {
      kit.mesh(kit.rboxGeo(0.145, 0.007, 0.33, 0.002, 1), new THREE.MeshStandardMaterial({ color: 0xf3eee0, roughness: 0.9 }), {
        pos: [side * 0.0755, 0.0095, 0], parent: nb, cast: false
      });
      const geo = kit.planeGeo(0.143, 0.326, 4, 10);
      const pp = geo.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i);
        const u = x / 0.0715;
        pp.setZ(i, 0.0026 * (1 - u * u) + 0.0012 * Math.sin(y * 3));
      }
      geo.computeVertexNormals();
      const page = new THREE.Mesh(geo, pageMat(side === -1 ? nbTexA : nbTexB));
      page.rotation.x = -Math.PI / 2;
      page.position.set(side * 0.0745, 0.0142, 0);
      page.receiveShadow = true; page.castShadow = false;
      nb.add(page);
    }
    // spine shadow line
    kit.mesh(kit.boxGeo(0.012, 0.003, 0.33), new THREE.MeshStandardMaterial({ color: 0x5e6e94, roughness: 0.7 }), {
      pos: [0, 0.0135, 0], parent: nb, cast: false
    });
    // pencil lying on the notebook
    {
      const p = new THREE.Group(); p.position.set(0.085, 0.0175, 0.075); p.rotation.y = 0.55; p.rotation.z = 0;
      nb.add(p);
      kit.mesh(kit.cylGeo(0.0042, 0.0042, 0.145, 8), new THREE.MeshStandardMaterial({ color: 0xe8b64c, roughness: 0.5 }), {
        pos: [0, 0, 0], rot: [0, 0, Math.PI / 2], parent: p
      });
      kit.mesh(kit.cylGeo(0.0042, 0.0008, 0.018, 8), new THREE.MeshStandardMaterial({ color: 0xe6c69a, roughness: 0.8 }), {
        pos: [0.0815, 0, 0], rot: [0, 0, -Math.PI / 2], parent: p, cast: false
      });
      kit.mesh(kit.sphereGeo(0.0016, 6), new THREE.MeshStandardMaterial({ color: 0x3c3a42, roughness: 0.5 }), {
        pos: [0.0905, 0, 0], parent: p, cast: false
      });
      kit.mesh(kit.cylGeo(0.0045, 0.0045, 0.013, 8), new THREE.MeshStandardMaterial({ color: 0xd98f9a, roughness: 0.5 }), {
        pos: [-0.068, 0, 0], rot: [0, 0, Math.PI / 2], parent: p, cast: false
      });
    }
    // loose sheets
    const sheets = [
      { tex: todoTex, x: 1.605, z: 1.005, w: 0.16, h: 0.218, yaw: -0.22, y: 0.001 },
      { tex: letterTex, x: 1.63, z: 1.10, w: 0.165, h: 0.225, yaw: 0.17, y: 0.002 },
      { tex: sketchTex, x: 1.625, z: 1.24, w: 0.158, h: 0.215, yaw: 0.42, y: 0.003 }
    ];
    for (const s of sheets) {
      const sheet = kit.mesh(kit.planeGeo(s.w, s.h), pageMat(s.tex), { pos: [s.x, topY + s.y, s.z], parent: noteGroup });
      sheet.rotation.set(-Math.PI / 2, 0, s.yaw);
      sheet.castShadow = false; sheet.receiveShadow = true;
    }
    // pink sticky notes
    const stickyMat = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.92, side: THREE.DoubleSide });
    const sn1 = kit.mesh(kit.planeGeo(0.062, 0.062), stickyMat(0xf4afc4), {
      pos: [1.60, topY + 0.0042, 1.03], parent: noteGroup
    });
    sn1.rotation.set(-Math.PI / 2, 0, 0.30); sn1.castShadow = false;
    const sn2 = kit.mesh(kit.planeGeo(0.07, 0.07), stickyMat(0xf7bccb), {
      pos: [1.945, topY + 0.0168, 1.108], parent: noteGroup
    });
    sn2.rotation.set(-Math.PI / 2, 0, -0.18); sn2.castShadow = false;
    // hand squiggles on the sticky notes
    const scribble = (x, y, z, w2, h2, yaw, seed) => {
      const { canvas, ctx: c2 } = ctx.textureLib.canvas(160, 160);
      c2.fillStyle = '#f4afc4'; c2.fillRect(0, 0, 160, 160);
      const rr = mulberry32(seed);
      for (let i = 0; i < 3; i++) penScratch(c2, 20, 45 + i * 32, 108, 10, 'rgba(120,86,102,0.85)', rr, 0.85);
      const t = ctx.textureLib.fromCanvas(canvas);
      const m = new THREE.Mesh(kit.planeGeo(w2, h2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide, transparent: false }));
      m.position.set(x, y, z); m.rotation.set(-Math.PI / 2, 0, yaw); m.receiveShadow = true; m.castShadow = false;
      noteGroup.add(m);
      return m;
    };
    sn1.visible = false; sn2.visible = false;
    scribble(1.60, topY + 0.0044, 1.03, 0.058, 0.058, 0.30, 5);
    scribble(1.945, topY + 0.0170, 1.108, 0.064, 0.064, -0.18, 9);

    // tiny eraser (pink + white sleeve)
    const er = new THREE.Group(); er.position.set(1.735, topY, 0.92); noteGroup.add(er);
    kit.mesh(kit.rboxGeo(0.034, 0.013, 0.021, 0.004, 1), new THREE.MeshStandardMaterial({ color: 0xef9fb6, roughness: 0.8 }), {
      pos: [0, 0.0065, 0], parent: er
    });
    kit.mesh(kit.rboxGeo(0.02, 0.014, 0.022, 0.003, 1), new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: 0.8 }), {
      pos: [-0.004, 0.0068, 0], parent: er
    });
    // paperclip
    {
      const pts = [
        [-0.012, 0.001, 0.006], [0.006, 0.001, 0.012], [0.014, 0.001, -0.004],
        [-0.002, 0.001, -0.014], [-0.012, 0.001, -0.004], [-0.007, 0.001, 0.006]
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const clip = kit.tube(pts.map(v => [v.x, v.y, v.z]), 0.0014, M.chrome, 48, 5, false);
      clip.position.set(1.94, topY + 0.003, 1.005);
      clip.castShadow = false; noteGroup.add(clip);
    }
    ctx.addContactShadow(1.86, 1.25, 0.38, 0.42, 0.16, topY + 0.0015);
  }

}

/* ------------------------------------------------------------------ *
 *  collectible spots (the game builds the actual plush meshes)
 * ------------------------------------------------------------------ */
function pushCollectibles(ctx, info) {
  const topY = info.topY;
  const padTop = info.padTop;
  ctx.collectibleSpots.push(
    { id: 'star', name: 'Star Pals', plush: 'star', position: [1.80, topY + 0.002, 1.03], rotationY: -0.45 },
    { id: 'cat', name: 'Cloud Kitten', plush: 'cat', position: [2.06, padTop + 0.002, -0.95], rotationY: -1.15 },
    { id: 'bunny', name: 'Bunny', plush: 'bunny', position: [1.58, 0.03, 0.30], rotationY: 0.65 },
    { id: 'duck', name: 'Duckling', plush: 'duck', position: [0.95, 1.721, -2.22], rotationY: 0.38 },
    { id: 'cloud', name: 'Cloud', plush: 'cloud', position: [-1.40, 0.03, 0.10], rotationY: 0.55 }
  );
}

/* ------------------------------------------------------------------ *
 *  main
 * ------------------------------------------------------------------ */
export function buildDecor(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group();
  root.name = 'decor';
  scene.add(root);

  buildPosters(ctx, root);
  buildCalendar(ctx, root);
  buildHexagons(ctx, root);
  buildBayBooks(ctx, root);
  const sill = buildSillCushions(ctx, root);
  buildPlant(ctx, root);
  buildDeskClutter(ctx, root);

  const desk = ctx.slots?.desk;
  pushCollectibles(ctx, {
    topY: desk?.topY ?? 0.76,
    padTop: sill.padTop
  });

  return root;
}
