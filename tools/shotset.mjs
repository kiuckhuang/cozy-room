#!/usr/bin/env node
// Curated fixed-view screenshot set + contact sheet.
//
//   nice -n 10 node tools/shotset.mjs
//   node tools/shotset.mjs --q=med --w=960 --h=540 --out=shots/set --views=bed,desk
//
// Captures 8 cameras (overall from the door, bed, bay window, desk/chair,
// north window/AC/curtains, plant/nightstand, rugs/floor, poster wall) with
// ?q=med&hud=0, writing shots/set/<view>.png and shots/set/contact.png.
// One browser only; software rendering is slow so be patient.
import { spawnSync } from 'node:child_process';
import {
  launch, instrument, waitForReady, resolveUrl, ensureDir, sleep, j
} from './lib/harness.mjs';

function parseArgs(argv) {
  const flags = { positional: [] };
  for (const a of argv) {
    const m = /^--([a-zA-Z][\w-]*)(?:=(.*))?$/.exec(a);
    if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
    else flags.positional.push(a);
  }
  return flags;
}
const args = parseArgs(process.argv.slice(2));

// Authoritative camera script. Coordinates from ROOM_SPEC.md (metres).
const VIEWS = [
  { name: '01_overall_door', cam: [1.52, 1.60, 2.06], look: [0.10, 1.00, -1.62], note: 'wide establishing view from the doorway' },
  { name: '02_bed', cam: [0.95, 1.34, 0.18], look: [0.12, 0.54, -1.60], note: 'bed, duvet, pillows, headboard + wall shelf' },
  { name: '03_bay_window', cam: [0.95, 1.45, -1.25], look: [2.10, 1.45, -1.25], note: 'east bay window, bookshelf, sill cushions (frontal)' },
  { name: '04_desk_chair', cam: [0.55, 1.35, 0.72], look: [1.72, 0.82, 1.32], note: 'desk, chair, lamp, clutter' },
  { name: '05_north_window', cam: [-1.10, 1.44, -0.92], look: [-1.52, 1.52, -2.30], note: 'north window, AC, curtains, sill' },
  { name: '06_plant_nightstand', cam: [-1.02, 1.28, -0.52], look: [-1.24, 0.68, -2.02], note: 'nightstand, lamp, plant' },
  { name: '07_rugs_floor', cam: [0.58, 1.50, 1.72], look: [-1.22, 0.02, -0.24], note: 'yellow rug, mint mat, floor planks' },
  { name: '08_poster_wall', cam: [-0.15, 1.68, -0.82], look: [-0.82, 1.92, -2.30], note: 'posters, shelf, headboard' }
];

const q = String(args.q || 'med');
const W = Number(args.w || args.width || process.env.W || 960);
const H = Number(args.h || args.height || process.env.H || 540);
const DPR = Number(args.dpr || process.env.DPR || 1);
const outDir = args.out || 'shots/set';
const sheetPath = args.sheet || `${outDir}/contact.png`;
const only = args.views ? String(args.views).split(',').map((s) => s.trim()).filter(Boolean) : null;
const settleMs = Number(args.settle ?? 700);
const basePath = String(args.url || process.env.SHOT_PATH || `/?q=${q}&hud=0&nostart=1`);
const url = resolveUrl(basePath);

const views = only
  ? VIEWS.filter((v) => only.some((o) => v.name === o || v.name.includes(o)))
  : VIEWS;
if (!views.length) {
  console.error('shotset: no views matched', only);
  process.exit(1);
}

let browser;
const results = [];
let fatal = null;
try {
  browser = await launch({ width: W, height: H, dpr: DPR });
  const page = await browser.newPage();
  const rec = instrument(page);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });

  console.log('[shotset] navigating', url, `${W}x${H} q=${q}`);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const ready = await waitForReady(page, 60000);
  console.log(`[shotset] ready=${ready.ready} after ${ready.waitedMs}ms (${Date.now() - t0}ms total)`);

  // Hide the boot/intro overlay and HUD for clean plates. `nostart=1` should
  // already do this; this is a QA fallback so review shots are never blocked.
  const overlayInfo = await page.evaluate(() => {
    const hidden = [];
    const g = window.__ctx?.game;
    const called = [];
    for (const k of ['skipIntro', 'dismissIntro', 'skipSplash', 'start', 'begin']) {
      if (typeof g?.[k] === 'function') {
        try { g[k](); called.push(k); } catch { /* ignore */ }
      }
    }
    document.body.classList.add('nohud', 'qa-plate');
    const nodes = [...document.querySelectorAll('body > *')].filter((el) => {
      if (['SCRIPT', 'STYLE', 'CANVAS', 'LINK'].includes(el.tagName)) return false;
      const cs = getComputedStyle(el);
      const fixed = cs.position === 'fixed' || cs.position === 'absolute';
      const covers = el.getBoundingClientRect().width > innerWidth * 0.5 && el.getBoundingClientRect().height > innerHeight * 0.5;
      return fixed && covers && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    });
    for (const el of nodes) {
      el.dataset.qaHidden = el.id || el.className || el.tagName;
      el.style.setProperty('display', 'none', 'important');
      hidden.push(el.dataset.qaHidden);
    }
    return { hidden, called };
  });
  if (overlayInfo.hidden.length || overlayInfo.called.length) {
    console.log('[shotset] overlays', j(overlayInfo));
  }

  const hasSetView = await page.evaluate(() => typeof window.__setView === 'function').catch(() => false);

  for (const v of views) {
    const pageErrBefore = rec.pageErrors.length;
    const httpErrBefore = rec.httpErrors.length;
    const appErrBefore = await page.evaluate(() => (window.__ERRORS__ || []).length).catch(() => 0);
    const tv = Date.now();
    try {
      if (hasSetView) {
        await page.evaluate(([cam, look]) => window.__setView(cam, look), [v.cam, v.look]);
      } else {
        const u = resolveUrl(`${basePath}${basePath.includes('?') ? '&' : '?'}cam=${v.cam.join(',')}&look=${v.look.join(',')}`);
        await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await waitForReady(page, 60000);
      }
      // one rAF guarantees the fixed camera was applied and a frame rendered
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(res))).catch(() => {});
      await sleep(settleMs);
      const file = `${outDir}/${v.name}.png`;
      ensureDir(file);
      await page.screenshot({ path: file });
      const lite = await page.evaluate(() => {
        let stats = null;
        try { stats = window.__stats ? window.__stats() : null; } catch { /* ignore */ }
        return {
          ready: !!window.__APP_READY__,
          stats,
          appErrors: Array.isArray(window.__ERRORS__) ? window.__ERRORS__.slice(0, 20) : null
        };
      }).catch(() => ({}));
      const appErrAfter = lite.appErrors?.length ?? 0;
      const newPageErrors = rec.pageErrors.slice(pageErrBefore);
      const newHttpErrors = rec.httpErrors.slice(httpErrBefore);
      const appDelta = Math.max(0, appErrAfter - appErrBefore);
      results.push({
        view: v.name, file, ms: Date.now() - tv, note: v.note,
        ready: lite.ready, stats: lite.stats,
        newPageErrors, newHttpErrors, appErrorDelta: appDelta,
        appErrors: lite.appErrors ?? null
      });
      const errTxt = newPageErrors.length || newHttpErrors.length || appDelta
        ? ` ERRORS: ${j({ page: newPageErrors, http: newHttpErrors, appErrs: appDelta })}` : '';
      console.log(`[shotset] ${v.name} ${lite.stats?.calls ?? '?'} calls ${lite.stats?.tris ?? '?'} tris ${Date.now() - tv}ms${errTxt}`);
    } catch (e) {
      results.push({ view: v.name, file: null, error: String(e?.message || e) });
      console.log(`[shotset] ${v.name} FAILED: ${String(e?.message || e)}`);
    }
  }

  // contact sheet via PIL
  const usable = results.filter((r) => r.file);
  if (usable.length) {
    const py = spawnSync('python3', ['tools/contactsheet.py', outDir, sheetPath, ...usable.map((r) => r.view)], {
      cwd: process.cwd(),
      env: { ...process.env },
      encoding: 'utf8'
    });
    if (py.status === 0) console.log('[shotset] ' + py.stdout.trim());
    else console.error('[shotset] contact sheet failed:', (py.stderr || py.stdout || '').slice(0, 1500));
  }

  const failed = results.filter((r) => !r.file || r.newPageErrors.length || r.newHttpErrors.length || r.appErrorDelta);
  console.log('SHOTSET ' + j({
    ok: failed.length === 0 && rec.pageErrors.length === 0,
    url, quality: q, size: `${W}x${H}`, sheet: sheetPath,
    views: results.length,
    failedViews: failed.map((r) => r.view),
    pageErrors: rec.pageErrors.slice(0, 10),
    httpErrors: rec.httpErrors.slice(0, 10),
    consoleErrors: rec.consoleErrors.map((c) => c.text).slice(0, 10),
    lastStats: results[results.length - 1]?.stats ?? null,
    files: results.map((r) => r.file)
  }));
  if (failed.length) process.exitCode = 2;
} catch (e) {
  fatal = String(e?.stack || e);
  console.error('[shotset] FATAL', fatal);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
