// Procedural texture library — every surface is painted on canvas at boot.
// No external image assets.  All generators are deterministic.
import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  small deterministic PRNG / value noise
 * ------------------------------------------------------------------ */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, seed = 0, oct = 4, gain = 0.5, lac = 2.0) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 97);
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

export function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return { canvas: c, ctx };
}

/* ------------------------------------------------------------------ *
 *  texture helpers
 * ------------------------------------------------------------------ */
let MAX_ANISO = 8;

export function setMaxAnisotropy(v) { MAX_ANISO = Math.max(1, v | 0); }

function makeTexture(canvas, { repeat = [1, 1], srgb = true, rotation = 0, wrap = THREE.RepeatWrapping, filter = THREE.LinearMipmapLinearFilter } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = wrap;
  t.repeat.set(repeat[0], repeat[1]);
  t.center.set(0.5, 0.5);
  t.rotation = rotation;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  t.minFilter = filter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = filter !== THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function normalFromCanvas(canvas, strength = 2.2) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => {
    x = (x + w) % w; y = (y + h) % h;
    const i = (y * w + x) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const dy = (H(x, y - 1) - H(x, y + 1)) * strength;
      let nx = dx, ny = dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function greyCanvas(w, h, fn) {
  const { canvas, ctx } = canvas2d(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(255, fn(x, y, w, h)));
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function tintCanvas(w, h, rgb, fn) {
  const { canvas, ctx } = canvas2d(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y, w, h);
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] ?? 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function rgba(hex) {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
}

/* ------------------------------------------------------------------ *
 *  generators
 * ------------------------------------------------------------------ */

/** Warm oak parquet: running-bond planks, grain, knots, bevels, seams. */
function genFloor() {
  const S = 1024, rowH = 256, plankW = 128;
  const { canvas, ctx } = canvas2d(S, S);
  const rng = makeRng(31771);
  const bases = ['#c5a27c', '#bd9a72', '#c19d76', '#caa984', '#bf9a6f', '#b89369', '#c3a179'];
  ctx.fillStyle = '#a97a4c'; ctx.fillRect(0, 0, S, S);
  for (let row = 0; row < S / rowH; row++) {
    const y = row * rowH;
    const off = (row % 2 === 0 ? 0 : plankW) + (row % 4 === 3 ? plankW / 2 : 0);
    for (let k = -1; k < S / plankW + 1; k++) {
      const x = k * plankW + off;
      const w = plankW - 2, h = rowH - 2;
      const base = bases[(rng() * bases.length) | 0];
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, w, h, 2);
      ctx.clip();
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, base);
      const darker = new THREE.Color(base).multiplyScalar(0.9 + rng() * 0.1).getStyle();
      g.addColorStop(0.55, darker);
      g.addColorStop(1, new THREE.Color(base).multiplyScalar(0.94).getStyle());
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);

      // grain
      const gRng = makeRng(1000 + row * 37 + k * 13);
      for (let i = 0; i < 26; i++) {
        const gy = y + 6 + gRng() * (h - 12);
        const amp = 1 + gRng() * 5;
        ctx.beginPath();
        ctx.moveTo(x - 4, gy);
        for (let sx = 0; sx <= w + 8; sx += 18) {
          ctx.lineTo(x + sx, gy + Math.sin(sx * 0.04 + i) * amp + (gRng() - 0.5) * 2.2);
        }
        ctx.strokeStyle = `rgba(96,62,34,${0.035 + gRng() * 0.09})`;
        ctx.lineWidth = 0.6 + gRng() * 1.6;
        ctx.stroke();
      }
      // knots
      if (gRng() > 0.55) {
        const kx = x + 30 + gRng() * (w - 60), ky = y + 20 + gRng() * (h - 40);
        for (let r = 1; r < 9; r++) {
          ctx.beginPath();
          ctx.ellipse(kx, ky, r * 2.3, r * 1.1, 0.3, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(92,58,30,${0.18 - r * 0.015})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.beginPath(); ctx.ellipse(kx, ky, 4, 2.2, 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(83,51,27,0.22)'; ctx.fill();
      }
      // soft inner highlight / bevel
      const hl = ctx.createLinearGradient(x, y, x, y + 10);
      hl.addColorStop(0, 'rgba(255,238,210,0.22)');
      hl.addColorStop(1, 'rgba(255,238,210,0)');
      ctx.fillStyle = hl; ctx.fillRect(x, y, w, 12);
      const sh = ctx.createLinearGradient(x, y + h - 12, x, y + h);
      sh.addColorStop(0, 'rgba(70,40,18,0)');
      sh.addColorStop(1, 'rgba(70,40,18,0.20)');
      ctx.fillStyle = sh; ctx.fillRect(x, y + h - 12, w, 12);
      // butt seam
      const seam = ctx.createLinearGradient(x, y, x + 7, y);
      seam.addColorStop(0, 'rgba(72,42,20,0.38)');
      seam.addColorStop(1, 'rgba(72,42,20,0)');
      ctx.fillStyle = seam; ctx.fillRect(x, y, 7, h);
      ctx.restore();
    }
  }
  // fine dust / tonal variation
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (fbm(x / 90, y / 90, 8, 3) - 0.5) * 18 + (hash2(x, y, 3) - 0.5) * 6;
    d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);

  // height -> normal: seams + bevels
  const height = greyCanvas(512, 512, (x, y, w, h) => {
    const px = (x / w) * 1024, py = (y / h) * 1024;
    const lx = px % plankW, ly = py % rowH;
    let v = 150;
    if (lx < 3 || ly < 3) v = 40;
    else if (lx < 9) v = 110;
    else if (ly < 9) v = 120;
    v += fbm(px / 40, py / 40, 21, 3) * 25;
    return v;
  });
  const rough = greyCanvas(512, 512, (x, y) => {
    const px = (x / 512) * 1024, py = (y / 512) * 1024;
    const lx = px % plankW, ly = py % rowH;
    let v = 155 + fbm(px / 60, py / 60, 5, 3) * 45;
    if (lx < 3 || ly < 3) v = 225;
    return v;
  });
  return {
    map: makeTexture(canvas, { repeat: [2, 2] }),
    normalMap: makeTexture(normalFromCanvas(height, 1.7), { repeat: [2, 2], srgb: false }),
    roughnessMap: makeTexture(rough, { repeat: [2, 2], srgb: false })
  };
}

/** painted pale-blue wall with orange-peel micro texture */
function genWall() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#d6e8f6'); g.addColorStop(0.6, '#cfe3f3'); g.addColorStop(1, '#c9dff1');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (fbm(x / 9, y / 9, 33, 3) - 0.5) * 7 + (hash2(x, y, 9) - 0.5) * 4;
    const streak = Math.sin(x * 0.09 + fbm(x / 30, y / 90, 2, 2) * 2) * 1.1;
    d[i] += n + streak; d[i + 1] += n + streak; d[i + 2] += n * 0.9 + streak;
  }
  ctx.putImageData(img, 0, 0);
  const height = greyCanvas(512, 512, (x, y) => 128 + (fbm(x / 6, y / 6, 44, 3) - 0.5) * 60);
  return {
    map: makeTexture(canvas, { repeat: [2, 1.6] }),
    normalMap: makeTexture(normalFromCanvas(height, 0.7), { repeat: [2, 1.6], srgb: false })
  };
}

function genCeiling() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (fbm(x / 14, y / 14, 77, 3) - 0.5) * 6;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return { map: makeTexture(canvas, { repeat: [3, 3] }) };
}

function genWoodGrain(base = '#c49a6c', contrast = 1) {
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  const c = new THREE.Color(base);
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  const rng = makeRng(9182);
  for (let i = 0; i < 120; i++) {
    const x0 = rng() * S;
    ctx.beginPath();
    for (let y = 0; y <= S; y += 8) {
      const x = x0 + Math.sin(y * 0.02 + i * 1.7) * (2 + (i % 7)) + fbm(x0 / 60, y / 80, 5, 2) * 6;
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const shade = 0.10 + rng() * 0.16;
    ctx.strokeStyle = `rgba(${(c.r * 90) | 0},${(c.g * 70) | 0},${(c.b * 45) | 0},${shade * contrast})`;
    ctx.lineWidth = 0.5 + rng() * 2.2;
    ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (fbm(x / 45, y / 130, 10, 3) - 0.5) * 12 * contrast;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const height = greyCanvas(512, 512, (x, y) => 128 + (fbm(x / 6, y / 90, 4, 2) - 0.5) * 34);
  return {
    map: makeTexture(canvas, { repeat: [1, 1] }),
    normalMap: makeTexture(normalFromCanvas(height, 0.6), { srgb: false })
  };
}

function genFabricWeave() {
  const S = 256;
  const { canvas, ctx } = canvas2d(S, S);
  const img = ctx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const warp = Math.sin(x * Math.PI / 4) * 0.5 + 0.5;
    const weft = Math.sin(y * Math.PI / 4) * 0.5 + 0.5;
    const checker = ((x >> 2) + (y >> 2)) & 1;
    let v = 205 + warp * 18 + weft * 18 - checker * 12;
    v += (fbm(x / 7, y / 7, 2, 2) - 0.5) * 22;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const height = greyCanvas(256, 256, (x, y) => {
    const warp = Math.sin(x * Math.PI / 4);
    const weft = Math.sin(y * Math.PI / 4);
    return 128 + warp * 26 + weft * 26;
  });
  return {
    map: makeTexture(canvas, { repeat: [10, 10] }),
    normalMap: makeTexture(normalFromCanvas(height, 0.55), { repeat: [10, 10], srgb: false })
  };
}

function genDuvet() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#f8fbff'; ctx.fillRect(0, 0, S, S);
  // soft blue stripes across U
  const stripeW = 46, gap = 52;
  for (let x = 8; x < S; x += stripeW + gap) {
    const g = ctx.createLinearGradient(x, 0, x + stripeW, 0);
    g.addColorStop(0, '#a7c8e8'); g.addColorStop(0.15, '#d3e4f6');
    g.addColorStop(0.85, '#d3e4f6'); g.addColorStop(1, '#a7c8e8');
    ctx.fillStyle = g; ctx.fillRect(x, 0, stripeW, S);
  }
  // weave + stitching texture
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const w = Math.sin(x * Math.PI / 3) * 1.5 + Math.sin(y * Math.PI / 3) * 1.5;
    const n = (fbm(x / 30, y / 30, 12, 3) - 0.5) * 8 + w;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const height = greyCanvas(512, 512, (x, y) => {
    const stripe = Math.sin(x * Math.PI / 3) * 3 + Math.sin(y * Math.PI / 3) * 3;
    return 128 + stripe + (fbm(x / 26, y / 26, 7, 2) - 0.5) * 20;
  });
  return {
    map: makeTexture(canvas, { repeat: [1.6, 1.2] }),
    normalMap: makeTexture(normalFromCanvas(height, 0.45), { repeat: [1.6, 1.2], srgb: false })
  };
}

function genPillowStripe() {
  const S = 256;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#a9c9ea';
  for (let x = 0; x < S; x += 64) {
    ctx.fillRect(x + 6, 0, 8, S);
    ctx.fillRect(x + 20, 0, 3, S);
  }
  return {
    map: makeTexture(canvas, { repeat: [1.4, 1] }),
    normalMap: makeTexture(normalFromCanvas(greyCanvas(256, 256, (x, y) => 128 + Math.sin(x * 0.9) * 8 + Math.sin(y * 0.9) * 8), 0.35), { repeat: [1.4, 1], srgb: false })
  };
}

function genRug(base = '#f5cc6a', dot = '#e6b64f', kind = 'yellow') {
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const weave = (Math.sin(x * 1.3) + Math.sin(y * 1.3)) * 5;
    const n = (fbm(x / 22, y / 22, 31, 3) - 0.5) * 16 + weave;
    d[i] += n; d[i + 1] += n * 0.95; d[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = dot;
  const step = kind === 'yellow' ? 42 : 56;
  for (let y = 20; y < S; y += step) for (let x = 20; x < S; x += step) {
    const ox = ((y / step) % 2) * step / 2;
    const r = kind === 'yellow' ? 2.4 : 3.4;
    ctx.beginPath(); ctx.arc(x + ox, y, r, 0, Math.PI * 2); ctx.fill();
  }
  if (kind === 'mint') {
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 2;
    for (let i = -S; i < S; i += 90) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + S, 0); ctx.lineTo(i, S); ctx.stroke();
    }
  }
  // border binding
  ctx.strokeStyle = kind === 'yellow' ? 'rgba(214,166,70,0.65)' : 'rgba(150,206,186,0.75)';
  ctx.lineWidth = 10; ctx.strokeRect(8, 8, S - 16, S - 16);
  const height = greyCanvas(256, 256, (x, y) => 128 + Math.sin(x * 0.8) * 6 + Math.sin(y * 0.8) * 6 + (hash2(x, y, 6) - 0.5) * 12);
  return {
    map: makeTexture(canvas, { repeat: [1, 1] }),
    normalMap: makeTexture(normalFromCanvas(height, 0.5), { srgb: false })
  };
}

function genPaper() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#fdfcf7'; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (fbm(x / 5, y / 5, 3, 2) - 0.5) * 7 + (hash2(x, y, 4) - 0.5) * 4;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  ctx.putImageData(img, 0, 0);
  return { map: makeTexture(canvas, { repeat: [1, 1] }) };
}

function genMetal() {
  const S = 256;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#a8a2ad'; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (fbm(x / 14, y / 300, 9, 2) - 0.5) * 26 + Math.sin(y * 2.1) * 2;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const rough = greyCanvas(256, 256, (x, y) => 90 + fbm(x / 18, y / 240, 4, 3) * 60);
  return {
    map: makeTexture(canvas, { repeat: [2, 2] }),
    roughnessMap: makeTexture(rough, { repeat: [2, 2], srgb: false })
  };
}

function genCardboard() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#d7b48b'; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const flute = Math.sin(y * 0.55) * 4;
    const n = (fbm(x / 25, y / 25, 15, 3) - 0.5) * 20 + flute + (hash2(x, y, 2) - 0.5) * 5;
    d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.7;
  }
  ctx.putImageData(img, 0, 0);
  // tape lines / stamps
  ctx.strokeStyle = 'rgba(168,128,82,0.35)'; ctx.lineWidth = 2;
  const rng = makeRng(818);
  for (let i = 0; i < 4; i++) {
    const y = rng() * S;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (rng() - 0.5) * 40); ctx.stroke();
  }
  return { map: makeTexture(canvas, { repeat: [1, 1] }) };
}

function genCeramic() {
  const S = 256;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#a678d6'; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (fbm(x / 30, y / 30, 21, 2) - 0.5) * 14 + (hash2(x, y, 11) - 0.5) * 4;
    d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return { map: makeTexture(canvas, { repeat: [1, 1] }) };
}

/** window backdrop: painted pastel town + sky */
function genSky(mode = 'golden') {
  const W = 1536, H = 768;
  const { canvas, ctx } = canvas2d(W, H);
  const palettes = {
    golden: { top: '#4f9fdc', mid: '#b8dcf3', horizon: '#ffc386', sun: '#fff2c8', sunX: 0.72, sunY: 0.30, town: '#9a90b0', trees: '#7ba184', cloud: '#fff6e8', alpha: 0.62 },
    day: { top: '#3f95dc', mid: '#a8d6f4', horizon: '#ffd6a6', sun: '#fffdf2', sunX: 0.62, sunY: 0.24, town: '#93a6bd', trees: '#78a98d', cloud: '#fffdf8', alpha: 0.55 },
    dusk: { top: '#5b57a8', mid: '#c98fb4', horizon: '#ffbe89', sun: '#ffe0b0', sunX: 0.78, sunY: 0.42, town: '#7d7394', trees: '#77927f', cloud: '#ffdfe8', alpha: 0.6 },
    night: { top: '#10163c', mid: '#282758', horizon: '#5f4a7c', sun: '#eef0ff', sunX: 0.70, sunY: 0.20, town: '#26264a', trees: '#2b3b46', cloud: '#53507f', alpha: 0.4 }
  };
  const p = palettes[mode] || palettes.golden;
  // sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.86);
  g.addColorStop(0, p.top); g.addColorStop(0.52, p.mid); g.addColorStop(0.76, p.horizon); g.addColorStop(0.86, p.horizon);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * p.sunX, sy = H * p.sunY;
  // soft sun halo
  const rg = ctx.createRadialGradient(sx, sy, 8, sx, sy, W * 0.34);
  rg.addColorStop(0, p.sun); rg.addColorStop(0.06, mode === 'night' ? 'rgba(240,240,255,0.85)' : 'rgba(255,255,250,0.8)');
  rg.addColorStop(0.28, mode === 'night' ? 'rgba(180,180,230,0.10)' : 'rgba(255,238,205,0.18)');
  rg.addColorStop(1, 'rgba(255,240,215,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  // crisp-ish sun disc
  const sg = ctx.createRadialGradient(sx, sy, 1, sx, sy, W * 0.028);
  sg.addColorStop(0, 'rgba(255,252,238,1)');
  sg.addColorStop(0.55, 'rgba(255,246,218,0.85)');
  sg.addColorStop(1, 'rgba(255,242,210,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, W * 0.03, 0, 6.283); ctx.fill();
  // stars at night
  if (mode === 'night') {
    const rng = makeRng(99);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.18 + rng() * 0.7})`;
      const r = rng() * 1.4 + 0.4;
      ctx.beginPath(); ctx.arc(rng() * W, rng() * H * 0.62, r, 0, 6.283); ctx.fill();
    }
  }
  // soft clouds
  const rng = makeRng(4242);
  for (let i = 0; i < 9; i++) {
    const cx = (i / 9 + rng() * 0.1) * W, cy = H * (0.12 + rng() * 0.32), rw = 90 + rng() * 190, rh = 16 + rng() * 30;
    ctx.save(); ctx.globalAlpha = p.alpha * (0.3 + rng() * 0.45);
    ctx.fillStyle = p.cloud;
    ctx.filter = 'blur(14px)';
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(cx + (rng() - 0.5) * rw, cy + (rng() - 0.5) * rh, rw * (0.3 + rng() * 0.4), rh * (0.55 + rng() * 0.6), 0, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }
  // hazy distant skyline
  const horizon = H * 0.70;
  const rng2 = makeRng(777);
  const townAlpha = mode === 'night' ? 0.92 : 0.8;
  let x = -30;
  while (x < W + 30) {
    const bw = 40 + rng2() * 100, bh = 26 + rng2() * 92;
    ctx.globalAlpha = townAlpha;
    ctx.fillStyle = p.town;
    ctx.fillRect(x, horizon - bh, bw, bh + 40);
    ctx.beginPath(); ctx.moveTo(x - 4, horizon - bh); ctx.lineTo(x + bw / 2, horizon - bh - 12 - rng2() * 20); ctx.lineTo(x + bw + 4, horizon - bh); ctx.closePath(); ctx.fill();
    // windows
    ctx.fillStyle = mode === 'night' ? 'rgba(255,214,150,0.65)' : 'rgba(255,250,235,0.48)';
    for (let wy = horizon - bh + 10; wy < horizon - 4; wy += 14) for (let wx = x + 7; wx < x + bw - 7; wx += 12) {
      if (rng2() > 0.42) ctx.fillRect(wx, wy, 4, 5);
    }
    x += bw + 6 + rng2() * 16;
  }
  // soft tree line, small and low
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 40; i++) {
    const tx = rng2() * W, ty = horizon + 14 + rng2() * 16, r = 8 + rng2() * 14;
    ctx.fillStyle = p.trees;
    ctx.beginPath(); ctx.ellipse(tx, ty - r, r * 0.7, r, 0, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // ground haze below horizon
  const hz = ctx.createLinearGradient(0, horizon - 24, 0, H);
  hz.addColorStop(0, 'rgba(255,244,226,0)');
  hz.addColorStop(0.35, 'rgba(255,242,224,0.14)');
  hz.addColorStop(0.62, 'rgba(226,214,205,0.5)');
  hz.addColorStop(1, 'rgba(196,184,176,0.85)');
  ctx.fillStyle = hz; ctx.fillRect(0, horizon - 24, W, H - horizon + 24);
  // very subtle vertical grain
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 4;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return makeTexture(canvas, { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping });
}

function genDust() {
  const S = 64;
  const { canvas, ctx } = canvas2d(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,252,240,1)');
  g.addColorStop(0.35, 'rgba(255,250,235,0.55)');
  g.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return makeTexture(canvas, { wrap: THREE.ClampToEdgeWrapping });
}

function genContact() {
  const S = 256;
  const { canvas, ctx } = canvas2d(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(40,30,55,0.55)');
  g.addColorStop(0.55, 'rgba(40,30,55,0.22)');
  g.addColorStop(1, 'rgba(40,30,55,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return makeTexture(canvas, { wrap: THREE.ClampToEdgeWrapping });
}

function genShaft() {
  const S = 128;
  const { canvas, ctx } = canvas2d(S, S);
  const g = ctx.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0, 'rgba(255,232,200,0)');
  g.addColorStop(0.5, 'rgba(255,232,200,0.55)');
  g.addColorStop(1, 'rgba(255,232,200,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const v = ctx.createLinearGradient(0, 0, 0, S);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.2, 'rgba(0,0,0,0.9)'); v.addColorStop(0.8, 'rgba(0,0,0,0.5)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = v; ctx.fillRect(0, 0, S, S);
  return makeTexture(canvas, { wrap: THREE.ClampToEdgeWrapping });
}

function genAOEdge() {
  const S = 128;
  const { canvas, ctx } = canvas2d(S, S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(34,28,48,0.85)');
  g.addColorStop(0.35, 'rgba(34,28,48,0.35)');
  g.addColorStop(1, 'rgba(34,28,48,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return { map: makeTexture(canvas, { wrap: THREE.ClampToEdgeWrapping }) };
}

function genPlush() {
  const S = 256;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = 220 + (hash2(x, y, 55) - 0.5) * 50 + Math.sin(x * 0.7) * 6 + Math.sin(y * 0.7) * 6;
    d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const height = greyCanvas(256, 256, (x, y) => 128 + (hash2(x, y, 51) - 0.5) * 70);
  return {
    map: makeTexture(canvas, { repeat: [2, 2] }),
    normalMap: makeTexture(normalFromCanvas(height, 0.5), { repeat: [2, 2], srgb: false })
  };
}

function genWallPhoto() {
  // very soft vertical sheen for sheer curtains
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  const img = ctx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const folds = Math.sin(x * 0.06) * 8 + Math.sin(x * 0.021 + 1.3) * 12;
    const n = 235 + folds + (fbm(x / 12, y / 60, 8, 2) - 0.5) * 10;
    d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return makeTexture(canvas, { repeat: [2, 1] });
}

/* ------------------------------------------------------------------ *
 *  library
 * ------------------------------------------------------------------ */
export class TextureLibrary {
  constructor() { this.cache = new Map(); }
  get(name, opts) {
    const key = name + '|' + JSON.stringify(opts || {});
    if (this.cache.has(key)) return this.cache.get(key);
    const v = this.build(name, opts || {});
    this.cache.set(key, v);
    return v;
  }
  build(name, opts) {
    switch (name) {
      case 'floor': return genFloor();
      case 'wall': return genWall();
      case 'ceiling': return genCeiling();
      case 'wood': return genWoodGrain(opts.color || '#c49a6c', opts.contrast ?? 1);
      case 'fabric': return genFabricWeave();
      case 'duvet': return genDuvet();
      case 'pillowStripe': return genPillowStripe();
      case 'rugYellow': return genRug('#f5cc6a', '#e3b24a', 'yellow');
      case 'rugMint': return genRug('#bfe7d5', '#a7d8c2', 'mint');
      case 'paper': return genPaper();
      case 'metal': return genMetal();
      case 'cardboard': return genCardboard();
      case 'ceramic': return genCeramic();
      case 'skyGolden': return { map: genSky('golden') };
      case 'skyDay': return { map: genSky('day') };
      case 'skyDusk': return { map: genSky('dusk') };
      case 'skyNight': return { map: genSky('night') };
      case 'dust': return { map: genDust() };
      case 'contact': return { map: genContact() };
      case 'shaft': return { map: genShaft() };
      case 'aoEdge': return genAOEdge();
      case 'plush': return genPlush();
      case 'sheer': return { map: genWallPhoto() };
      default: throw new Error('unknown texture ' + name);
    }
  }
  canvas(w, h) { return canvas2d(w, h); }
  normalFrom(canvas, strength = 1.2) { return makeTexture(normalFromCanvas(canvas, strength), { srgb: false }); }
  fromCanvas(canvas, { repeat = [1, 1], srgb = true } = {}) { return makeTexture(canvas, { repeat, srgb }); }
}

export const textureLib = new TextureLibrary();
export { makeTexture, tintCanvas, greyCanvas, rgba };
