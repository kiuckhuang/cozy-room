#!/usr/bin/env node
// Performance probe: FPS over ~5s + draw calls / triangles.
//
//   node tools/perf.mjs                 # med, med without post, high, high without post
//   node tools/perf.mjs --ms=4000 --w=960 --h=540
//
// Runs one browser, one page per configuration, sequentially (software GL is
// slow and CPU-bound). Also reports the *effective* quality: under SwiftShader
// renderer.js auto-downgrades `high` to `med`, so the high row is informational.
import { launch, instrument, waitForReady, resolveUrl, sleep, j } from './lib/harness.mjs';

function parseArgs(argv) {
  const flags = {};
  for (const a of argv) {
    const m = /^--([a-zA-Z][\w-]*)(?:=(.*))?$/.exec(a);
    if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
  }
  return flags;
}
const args = parseArgs(process.argv.slice(2));
const W = Number(args.w || process.env.W || 960);
const H = Number(args.h || process.env.H || 540);
const DPR = Number(args.dpr || process.env.DPR || 1);
const MS = Number(args.ms || 5000);
const BASE = args.url || '/?hud=0&nostart=1';

const CONFIGS = [
  { label: 'med+post', q: 'med', post: true },
  { label: 'med-nopost', q: 'med', post: false },
  { label: 'high+post', q: 'high', post: true },
  { label: 'high-nopost', q: 'high', post: false }
];
const SELECTED = args.q ? CONFIGS.filter((c) => c.q === String(args.q) && (args.post === undefined || c.post === (String(args.post) !== '0'))) : CONFIGS;

function measure(page, ms) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const deltas = [];
    let frames = 0;
    let last = performance.now();
    const t0 = last;
    function tick() {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      frames++;
      if (now - t0 < duration) requestAnimationFrame(tick);
      else {
        const seconds = (now - t0) / 1000;
        deltas.sort((a, b) => a - b);
        const at = (p) => deltas.length ? +deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))].toFixed(1) : null;
        resolve({
          frames,
          seconds: +seconds.toFixed(2),
          fps: +(frames / seconds).toFixed(1),
          frameMsP50: at(0.5),
          frameMsP95: at(0.95),
          frameMsMax: deltas.length ? +deltas[deltas.length - 1].toFixed(1) : null
        });
      }
    }
    requestAnimationFrame(tick);
  }), ms);
}

const results = [];
let browser;
try {
  browser = await launch({ width: W, height: H, dpr: DPR });
  for (const cfg of SELECTED) {
    const page = await browser.newPage();
    const rec = instrument(page);
    const url = resolveUrl(`${BASE}${BASE.includes('?') ? '&' : '?'}q=${cfg.q}`);
    const row = { label: cfg.label, requestedQuality: cfg.q, post: cfg.post, url };
    try {
      console.log(`[perf] ${cfg.label}: loading ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      const ready = await waitForReady(page, 60000);
      row.ready = ready.ready;
      row.bootMs = ready.waitedMs;
      if (!ready.ready) throw new Error('not ready: ' + j(ready));
      await sleep(1200); // let shaders warm up / boot fade finish
      const info = await page.evaluate(() => {
        const ctx = window.__ctx;
        return {
          effectiveQuality: ctx?.pipeline?.quality ?? null,
          pixelRatio: ctx?.renderer?.getPixelRatio?.() ?? null,
          isSoftware: !!ctx?.pipeline?.isSoftware,
          outline: !!ctx?.pipeline?.outlineEnabled,
          canvas: [ctx?.renderer?.domElement?.width, ctx?.renderer?.domElement?.height]
        };
      });
      Object.assign(row, info);

      if (!cfg.post) {
        const swapped = await page.evaluate(() => {
          const p = window.__ctx?.pipeline;
          if (!p || typeof p.render !== 'function') return false;
          window.__qaOrigRender = p.render;
          p.render = () => {
            p.renderer.info.reset();
            p.renderer.render(p.scene, p.camera);
          };
          return true;
        });
        row.noPostSwap = swapped;
        if (!swapped) row.note = 'pipeline.render not accessible; post state unchanged';
        await sleep(400);
      }

      const fps = await measure(page, MS);
      Object.assign(row, fps);
      row.stats = await page.evaluate(() => {
        try { return window.__stats ? window.__stats() : null; } catch { return null; }
      });
      row.renderInfo = await page.evaluate(() => {
        const r = window.__ctx?.renderer?.info;
        return r ? { calls: r.render.calls, triangles: r.render.triangles, programs: r.programs?.length ?? null, geometries: r.memory.geometries, textures: r.memory.textures } : null;
      });
      row.pageErrors = rec.pageErrors;
      console.log(`[perf] ${cfg.label}: ${row.fps} fps, p50 ${row.frameMsP50}ms, p95 ${row.frameMsP95}ms, ` +
        `${row.stats?.calls ?? '?'} calls, ${row.stats?.tris ?? '?'} tris, effective q=${row.effectiveQuality}`);
    } catch (e) {
      row.error = String(e?.message || e);
      console.log(`[perf] ${cfg.label} FAILED: ${row.error}`);
    } finally {
      await page.close().catch(() => {});
    }
    results.push(row);
  }
} catch (e) {
  console.error('[perf] FATAL', String(e?.stack || e));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
console.log('PERF ' + j({ size: `${W}x${H}`, dpr: DPR, durationMs: MS, renderer: results[0]?.isSoftware ? 'swiftshader' : undefined, results }));
if (results.some((r) => r.error || !r.ready)) process.exitCode = 2;
