#!/usr/bin/env node
// GPU / hardware-acceleration probe.
//
//   node tools/gpucheck.mjs                 # probe WSL Chrome (SwiftShader by default)
//   LOCAL_GPU=1 node tools/gpucheck.mjs     # probe WSL Chrome on the GPU (Mesa D3D12)
//   CDP_URL=http://127.0.0.1:9222 node tools/gpucheck.mjs
//                                           # probe Chrome/Edge running on the Windows
//                                           # host (full RTX GPU through D3D11/D3D12)
//
// Prints the unmasked WebGL renderer, WebGL limits, the effective quality tier the
// game picked, frame pacing over ~3 s, and optionally writes a screenshot.
import fs from 'node:fs';
import { launch, resolveUrl, ensureDir, sleep, BASE_URL } from './lib/harness.mjs';

const CDP_URL = process.env.CDP_URL || '';
const URL_ = process.env.URL || '/?hud=1&nostart=1';
const W = Number(process.env.W || 1280);
const H = Number(process.env.H || 720);
const MS = Number(process.env.MS || 3000);
const SHOT = process.env.SHOT || '';

async function open() {
  // One code path with the rest of the tooling: CDP_URL -> host GPU, LOCAL_GPU=1 ->
  // the WSL GL stack (Mesa D3D12), otherwise SwiftShader.
  const browser = await launch({ width: W, height: H });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 }).catch(() => {});
  const backend = process.env.CDP_URL ? `cdp ${process.env.CDP_URL}`
    : process.env.LOCAL_GPU ? 'local (GL/D3D12)' : 'local (software)';
  return { browser, page, mode: `${backend} -> ${BASE_URL}` };
}

const info = async (page) => page.evaluate(() => {
  const mk = (type) => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const gl = c.getContext(type, { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const out = {
      type,
      version: gl.getParameter(gl.VERSION),
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxSamples: gl.getParameter(gl.MAX_SAMPLES)
    };
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return out;
  };
  return { webgl2: mk('webgl2'), webgl1: mk('webgl') };
});

const measure = (page, ms) => page.evaluate((duration) => new Promise((resolve) => {
  const deltas = [];
  let last = performance.now();
  const t0 = last;
  function tick(now) {
    deltas.push(now - last);
    last = now;
    if (now - t0 < duration) requestAnimationFrame(tick);
    else {
      deltas.sort((a, b) => a - b);
      const at = (p) => +deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))].toFixed(2);
      resolve({
        frames: deltas.length,
        seconds: +((now - t0) / 1000).toFixed(2),
        fps: +(deltas.length / ((now - t0) / 1000)).toFixed(1),
        p50: at(0.5),
        p95: at(0.95)
      });
    }
  }
  requestAnimationFrame(tick);
}), ms);

const { browser, page, mode } = await open();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });

await page.goto(resolveUrl(URL_), { waitUntil: 'load', timeout: 60000 });
const gpu = await info(page);
const g = gpu.webgl2 || gpu.webgl1 || {};
const software = /swiftshader|llvmpipe|lavapipe|softpipe|software/i.test(String(g.renderer || '')) ||
                 /swiftshader/i.test(String(g.vendor || ''));
await page.waitForFunction('window.__APP_READY__ === true', { timeout: 120000 }).catch(() => {});
await sleep(1200);
const stats = await page.evaluate(() => (window.__stats ? window.__stats() : null)).catch(() => null);
const quality = await page.evaluate(() => (window.__ctx?.quality || window.__quality || null)).catch(() => null);
const perf = await measure(page, MS);
if (SHOT) { ensureDir(SHOT); await page.screenshot({ path: SHOT }); }

console.log(JSON.stringify({
  mode,
  userAgent: await browser.version().catch(() => null),
  webgl2: gpu.webgl2,
  webgl1: gpu.webgl1,
  hardwareAccelerated: !!g.renderer && !software,
  gameQuality: quality,
  stats,
  perf,
  errors: errors.slice(0, 5),
  screenshot: SHOT || undefined
}, null, 2));

if (CDP_URL) {
  // Never kill a browser we merely attached to (it may be the user's own Chrome).
  await page.close().catch(() => {});
  browser.disconnect();
} else {
  await browser.close().catch(() => {});
}
if (fs.existsSync('/dev/null')) process.exit(0);
