// Shared puppeteer harness for Cozy Room QA tooling.
// Two rendering backends:
//   * default - headless Chrome inside WSL. CPU only: headless Chrome initialises EGL
//     through the surfaceless/GBM path, which WSL cannot serve, so ANGLE lands on
//     SwiftShader. Fine for correctness checks, but ~1 fps at 1280x720.
//   * LOCAL_GPU=1 - same local Chrome but windowed on the WSLg display, which does use
//     the Mesa D3D12 driver (see WSL_GPU.md): 60 fps, effective quality "high".
//   * CDP_URL=http://127.0.0.1:95xx - Chrome/Edge running on the Windows host
//     (`node tools/host-gpu.mjs start`). Real GPU through ANGLE/D3D11, 60+ fps,
//     and quality "high" is no longer auto-downgraded.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
export const CDP_URL = process.env.CDP_URL || '';
export const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function resolveUrl(pathOrUrl = '/') {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return BASE_URL.replace(/\/+$/, '') + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
}

export function ensureDir(file) {
  const dir = dirname(file);
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
}

/**
 * Attach to a browser we do not own (host-GPU Chrome over CDP). Closing the
 * returned proxy closes only the pages it created and detaches - the shared
 * browser keeps running. Pages get the same viewport the local launcher would
 * apply so tools behave identically on both backends.
 */
function adopt(remote, viewport) {
  const mine = new Set();
  return new Proxy(remote, {
    get(target, prop) {
      if (prop === 'close') {
        return async () => {
          for (const p of mine) await p.close().catch(() => {});
          mine.clear();
          target.disconnect();
        };
      }
      if (prop === 'newPage') {
        return async () => {
          const page = await target.newPage();
          await page.setViewport(viewport).catch(() => {});
          mine.add(page);
          return page;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

/**
 * Launch (or attach to) one browser.
 * Set CDP_URL to drive Chrome/Edge on the Windows host for real GPU rendering:
 *   node tools/host-gpu.mjs start   # prints http://127.0.0.1:95xx
 *   CDP_URL=http://127.0.0.1:95xx node tools/perf.mjs
 */
export async function launch({ width = 960, height = 540, dpr = 1 } = {}) {
  if (CDP_URL) {
    const remote = await puppeteer.connect({ browserURL: CDP_URL, defaultViewport: null });
    return adopt(remote, { width, height, deviceScaleFactor: dpr });
  }
  // LOCAL_GPU=1 uses the distro/ANGLE-GL stack instead of SwiftShader. Once Mesa's
  // D3D12 driver is wired up in WSL (see docs/WSL_GPU.md) this renders on the card.
  const glFlags = process.env.LOCAL_GPU
    ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    // LOCAL_GPU needs a real display (WSLg :0): headless Chrome on Linux cannot use
    // the D3D12 driver's surfaceless path, but a windowed one renders on the GPU and
    // is still fully scriptable over CDP.
    headless: process.env.LOCAL_GPU ? false : 'new',
    protocolTimeout: 600000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...glFlags,
      '--enable-webgl',
      '--hide-scrollbars',
      '--mute-audio',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      `--window-size=${width},${height}`
    ],
    defaultViewport: { width, height, deviceScaleFactor: dpr }
  });
  return browser;
}

/**
 * Attach error collectors to a page. Returns a record that is mutated live:
 * { console: [{type,text}], consoleErrors: [{type,text}], pageErrors: [msg],
 *   requestFails: [{url,error}], crashes: [msg] }
 */
export function instrument(page) {
  const rec = { console: [], consoleErrors: [], pageErrors: [], requestFails: [], httpErrors: [], crashes: [] };
  page.on('console', (m) => {
    const entry = { type: m.type(), text: m.text().slice(0, 2000) };
    rec.console.push(entry);
    if (rec.console.length > 300) rec.console.shift();
    // "Failed to load resource" duplicates httpErrors with less detail; keep the URL version
    if (entry.type === 'error' && !/^Failed to load resource/i.test(entry.text)) rec.consoleErrors.push(entry);
  });
  page.on('pageerror', (e) => rec.pageErrors.push(String(e?.message || e).slice(0, 2000)));
  page.on('response', (r) => {
    if (r.status() < 400) return;
    if (/favicon/i.test(r.url())) return;
    rec.httpErrors.push({ status: r.status(), url: r.url().slice(0, 300) });
  });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || 'unknown';
    // favicon / aborted navigations during reload are noise, keep everything else
    if (/favicon/i.test(r.url())) return;
    rec.requestFails.push({ url: r.url().slice(0, 300), error: err });
  });
  page.on('error', (e) => rec.crashes.push(String(e?.message || e)));
  return rec;
}

/** Poll window.__APP_READY__ until true or timeout. Never throws on nav races. */
export async function waitForReady(page, timeoutMs = 30000, { pollMs = 300 } = {}) {
  const t0 = Date.now();
  let last = { ready: false, errors: [] };
  while (Date.now() - t0 < timeoutMs) {
    try {
      last = await page.evaluate(() => ({
        ready: !!window.__APP_READY__,
        errors: Array.isArray(window.__ERRORS__) ? window.__ERRORS__.slice(0, 5) : []
      }));
      if (last.ready) break;
    } catch {
      /* page executing / navigated; retry */
    }
    await sleep(pollMs);
  }
  return { ready: !!last.ready, waitedMs: Date.now() - t0, appErrors: last.errors || [] };
}

/** Compact page/runtime summary used by every tool. */
export async function pageSummary(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const canvas = q('canvas');
    let rendererName = null;
    let glVersion = null;
    try {
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      if (gl) {
        glVersion = gl.getParameter(gl.VERSION) || null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        rendererName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || null;
      }
    } catch { /* ignore */ }
    let stats = null;
    try { stats = window.__stats ? window.__stats() : null; } catch { /* ignore */ }
    const ctx = window.__ctx || null;
    const info = ctx?.renderer?.info?.render || null;
    const sceneInfo = { objects: 0, meshes: 0, lights: 0, instanced: 0 };
    try {
      ctx?.scene?.traverse((o) => {
        sceneInfo.objects++;
        if (o.isMesh) sceneInfo.meshes++;
        if (o.isInstancedMesh) sceneInfo.instanced++;
        if (o.isLight) sceneInfo.lights++;
      });
    } catch { /* ignore */ }
    return {
      ready: !!window.__APP_READY__,
      appErrors: Array.isArray(window.__ERRORS__) ? window.__ERRORS__.slice(0, 25) : null,
      canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
      dpr: window.devicePixelRatio || null,
      glVersion,
      renderer: rendererName,
      quality: ctx?.pipeline?.quality || ctx?.quality || null,
      requestedQuality: new URLSearchParams(location.search).get('q'),
      stats: {
        calls: stats?.calls ?? info?.calls ?? null,
        tris: stats?.tris ?? info?.triangles ?? null,
        points: info?.points ?? null,
        lines: info?.lines ?? null
      },
      scene: sceneInfo,
      interactables: ctx?.interactables?.length ?? null,
      collectibleSpots: ctx?.collectibleSpots?.length ?? null,
      colliders: ctx?.colliders?.length ?? null,
      hudPresent: !!q('.hud'),
      bodyClasses: document.body.className || '',
      gameKeys: ctx?.game && typeof ctx.game === 'object' ? Object.keys(ctx.game).slice(0, 30) : null,
      camera: ctx?.camera ? { x: +ctx.camera.position.x.toFixed(3), y: +ctx.camera.position.y.toFixed(3), z: +ctx.camera.position.z.toFixed(3) } : null,
      player: ctx?.controls?.state?.pos ? { x: +ctx.controls.state.pos.x.toFixed(3), z: +ctx.controls.state.pos.z.toFixed(3), enabled: !!ctx.controls.state.enabled } : null
    };
  }).catch((e) => ({ evalError: String(e?.message || e) }));
}

/** Pretty one-line JSON (kept compact for CLI output). */
export const j = (o) => JSON.stringify(o);

/** Wait for n animation frames in-page (software rendering: use sparingly). */
export async function waitFrames(page, n = 2, timeoutMs = 60000) {
  const t0 = Date.now();
  const startFrames = await page.evaluate(() => window.__frameCount ?? null).catch(() => null);
  if (startFrames != null) {
    while (Date.now() - t0 < timeoutMs) {
      const f = await page.evaluate(() => window.__frameCount ?? null).catch(() => null);
      if (f != null && f >= startFrames + n) return { frames: f, waitedMs: Date.now() - t0 };
      await sleep(120);
    }
    return { frames: null, waitedMs: Date.now() - t0, timedOut: true };
  }
  // fallback: plain rAF count
  return page.evaluate((count) => new Promise((resolve) => {
    let i = 0;
    const t = performance.now();
    function tick() {
      if (++i >= count || performance.now() - t > 20000) resolve({ frames: i, waitedMs: performance.now() - t });
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }), n).catch(() => ({ frames: null, timedOut: true }));
}
