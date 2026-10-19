#!/usr/bin/env node
// Cozy Room smoke test (puppeteer-core + system Chrome + SwiftShader).
//
//   node tests/smoke.mjs
//   node tests/smoke.mjs --url="http://127.0.0.1:4173/?q=med&nostart=1"
//
// Verifies boot/readiness, runtime errors, canvas + renderer stats, scene and
// interaction contracts, the 5 collectible spots, first-person movement and
// collision bounds, and any pause/photo hooks that exist. Exit code 1 on any
// FAIL; warnings (missing optional hooks) do not fail the run.
import {
  launch, instrument, waitForReady, pageSummary, resolveUrl, sleep, j
} from '../tools/lib/harness.mjs';

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
const url = resolveUrl(args.url || '/?q=med&nostart=1');
const WAIT = Number(args.wait || 90000);

const checks = [];
const add = (name, ok, detail = '', severity = 'fail') => {
  checks.push({ name, ok: !!ok, detail, severity: ok ? 'pass' : severity });
  const tag = ok ? 'PASS' : severity === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
};
const warn = (name, ok, detail) => add(name, ok, detail, 'warn');
const info = (name, detail) => checks.push({ name, ok: true, detail, severity: 'info' });

let browser;
let summary = null;
let rec = null;
let pageErrorsAtStart = 0;
try {
  browser = await launch({ width: W, height: H, dpr: 1 });
  const page = await browser.newPage();
  rec = instrument(page);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  console.log(`[smoke] loading ${url} (${W}x${H})`);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const ready = await waitForReady(page, WAIT);
  summary = await pageSummary(page);
  info('boot', `ready=${ready.ready} after ${ready.waitedMs}ms (${Date.now() - t0}ms total)`);

  /* ---------- runtime health ---------- */
  add('no page errors', rec.pageErrors.length === 0, j(rec.pageErrors.slice(0, 5)), 'fail');
  add('no uncaught window.__ERRORS__', (summary.appErrors?.length ?? -1) === 0, j(summary.appErrors), 'fail');
  add('window.__ERRORS__ exists', Array.isArray(summary.appErrors), 'expected [] collector from main.js', 'fail');
  add('no failed HTTP resources', rec.httpErrors.length === 0, j(rec.httpErrors.slice(0, 5)), 'fail');
  add('no console errors', rec.consoleErrors.length === 0, j(rec.consoleErrors.slice(0, 5).map((c) => c.text)), 'fail');
  add('no crashes', rec.crashes.length === 0, j(rec.crashes), 'fail');

  /* ---------- readiness / canvas / renderer ---------- */
  add('__APP_READY__ true', summary.ready === true, '', 'fail');
  const c = summary.canvas;
  add('canvas exists and has pixels', !!c && c.w > 0 && c.h > 0, c ? `${c.w}x${c.h} css ${c.cssW}x${c.cssH}` : 'no canvas', 'fail');
  add('canvas DPR correct', !!c && c.w === Math.floor(W * (summary.dpr || 1)), `canvas ${c?.w} vs viewport ${W} * dpr ${summary.dpr}`, 'warn');
  add('quality is med', summary.quality === 'med', `effective q=${summary.quality} (requested ${summary.requestedQuality})`, 'warn');
  info('renderer', `${summary.renderer || '?'} · ${summary.glVersion || '?'}`);
  add('renderer stats present', !!summary.stats && summary.stats.calls > 0 && summary.stats.tris > 0, j(summary.stats), 'fail');
  add('draw calls >= 25', (summary.stats?.calls ?? 0) >= 25, `calls=${summary.stats?.calls}`, 'warn');
  add('triangles >= 5000', (summary.stats?.tris ?? 0) >= 5000, `tris=${summary.stats?.tris}`, 'warn');

  /* ---------- scene / contract ---------- */
  add('scene has objects', (summary.scene?.objects ?? 0) > 40, j(summary.scene), 'fail');
  add('scene lights present', (summary.scene?.lights ?? 0) >= 3, `lights=${summary.scene?.lights}`, 'warn');
  add('ctx.interactables > 5', (summary.interactables ?? 0) > 5, `interactables=${summary.interactables}`, 'fail');
  add('exactly 5 collectible spots', summary.collectibleSpots === 5, `spots=${summary.collectibleSpots}`, 'fail');
  add('colliders registered', (summary.colliders ?? 0) >= 4, `colliders=${summary.colliders}`, 'warn');

  /* ---------- collectible spots geometry + ids ---------- */
  const spots = await page.evaluate(() => {
    const c = window.__ctx;
    return (c?.collectibleSpots || []).map((s) => ({
      id: s.id, plush: s.plush || null, name: s.name || null, position: s.position || null
    }));
  }).catch(() => null);
  const expected = ['star', 'cat', 'bunny', 'duck', 'cloud'];
  const ids = (spots || []).map((s) => s.id);
  add('collectible ids match spec', expected.every((e) => ids.includes(e)), `ids=${j(ids)}`, 'fail');
  const badSpot = (spots || []).find((s) => !Array.isArray(s.position) || s.position.length !== 3 ||
    Math.abs(s.position[0]) > 2.1 || Math.abs(s.position[2]) > 2.3 || s.position[1] < 0 || s.position[1] > 2.65);
  add('collectible spots inside room bounds', !!spots && spots.length > 0 && !badSpot, badSpot ? j(badSpot) : `${spots?.length} spots checked`, 'fail');

  /* ---------- movement / controls ---------- */
  const preMove = await page.evaluate(() => {
    const c = window.__ctx;
    const cam = c?.camera;
    return {
      enabled: !!c?.controls?.state?.enabled,
      pos: c?.controls?.state?.pos ? { x: c.controls.state.pos.x, z: c.controls.state.pos.z } : null,
      cam: cam ? { x: cam.position.x, y: cam.position.y, z: cam.position.z } : null
    };
  }).catch(() => null);
  add('controls enabled at start', !!preMove?.enabled, preMove ? j(preMove) : 'no __ctx.controls', 'warn');

  if (preMove && !preMove.enabled) {
    const started = await page.evaluate(() => {
      const g = window.__ctx?.game;
      const app = window.__ctx?.app;
      let via = null;
      for (const k of ['start', 'begin', 'enter', 'resume']) {
        const f = (typeof g?.[k] === 'function' && g[k]) || (typeof app?.[k] === 'function' && app[k]);
        if (f) { try { f.call(g?.[k] ? g : app); via = k; break; } catch { /* ignore */ } }
      }
      window.__ctx?.controls?.enable?.();
      return via;
    }).catch(() => null);
    warn('controls started for movement test', true, `was disabled (intro?) — enabled manually${started ? ` via game.${started}()` : ''}`);
    await sleep(300);
  }

  await page.bringToFront();
  await page.evaluate(() => {
    window.__qaKeyLog = [];
    window.addEventListener('keydown', (e) => window.__qaKeyLog.push(e.code));
    if (!window.__qaFrameCounter) {
      window.__qaFrameCounter = true;
      window.__qaFrames = 0;
      const f = () => { window.__qaFrames++; requestAnimationFrame(f); };
      requestAnimationFrame(f);
    }
  }).catch(() => {});

  const probe = () => page.evaluate(() => {
    const c = window.__ctx;
    return {
      keys: c?.controls?.state?.keys ? [...c.controls.state.keys] : null,
      keyLog: window.__qaKeyLog || [],
      frames: window.__qaFrames ?? null,
      pos: c?.controls?.state?.pos ? { x: c.controls.state.pos.x, z: c.controls.state.pos.z } : null,
      cam: c?.camera ? { x: c.camera.position.x, y: c.camera.position.y, z: c.camera.position.z } : null,
      enabled: !!c?.controls?.state?.enabled
    };
  }).catch(() => null);

  // Software GL can run below 1 fps: hold the key until real simulation frames
  // have advanced (dt is capped at 50 ms per rendered frame), not a fixed wall time.
  async function walkUntilMoved(useKeyboard) {
    const start = await probe();
    const frames0 = start?.frames ?? 0;
    if (useKeyboard) await page.keyboard.down('w');
    else await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true, cancelable: true }))).catch(() => {});
    const t0 = Date.now();
    let moved = 0;
    let during = start;
    while (Date.now() - t0 < 20000) {
      await sleep(500);
      during = await probe();
      const a = start?.pos, b = during?.pos;
      moved = a && b ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
      const frames = (during?.frames ?? frames0) - frames0;
      if (moved >= 0.05 && frames >= 1) break;
    }
    if (useKeyboard) await page.keyboard.up('w');
    else await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }))).catch(() => {});
    await sleep(400);
    const after = await probe();
    return { start, during, after, moved, waitedMs: Date.now() - t0 };
  }

  let walk = await walkUntilMoved(true);
  info('keyboard plumbing', `keydown=${j(walk.during?.keyLog)} controls.keys=${j(walk.during?.keys)} enabled=${walk.during?.enabled} frames=${walk.during?.frames}`);
  if (walk.moved < 0.05) {
    const retry = await walkUntilMoved(false);
    if (retry.moved >= 0.05) {
      add('W moves the player (retried with synthetic key)', true,
        `moved ${retry.moved.toFixed(3)}m after ${retry.waitedMs}ms; camera ${j(preMove?.cam)} -> ${j(retry.after?.cam)}`);
      walk = retry;
    } else {
      add('W moves the player', false,
        `moved ${walk.moved.toFixed(3)}m in ${walk.waitedMs}ms, retry ${retry.moved.toFixed(3)}m in ${retry.waitedMs}ms; ` +
        `keys=${j(walk.during?.keys)} keydown=${j(walk.during?.keyLog)} frames=${walk.during?.frames}`, 'fail');
    }
  } else {
    add('W moves the player', true, `moved ${walk.moved.toFixed(2)}m in ${walk.waitedMs}ms, camera ${j(preMove?.cam)} -> ${j(walk.after?.cam)}`);
  }
  const postMove = walk.after;

  const finalPos = postMove?.pos || null;
  add('player stays inside room bounds', !!finalPos && Math.abs(finalPos.x) <= 2.11 && Math.abs(finalPos.z) <= 2.31,
    j(finalPos), 'fail');
  add('camera follows player', !!postMove?.cam && Math.abs((postMove.cam.x ?? 0) - (finalPos?.x ?? 99)) < 0.12 &&
    Math.abs((postMove.cam.z ?? 0) - (finalPos?.z ?? 99)) < 0.12, `cam ${j(postMove?.cam)} pos ${j(finalPos)}`, 'warn');

  /* ---------- optional hooks: photo / pause / collectAll ---------- */
  const photoHook = await page.evaluate(() => {
    const c = window.__ctx;
    return typeof c?.app?.togglePhoto === 'function' || typeof c?.game?.togglePhoto === 'function';
  }).catch(() => false);
  if (photoHook) {
    const photoState = () => page.evaluate(() => {
      const c = window.__ctx;
      const g = window.__game || c?.game;
      return {
        ui: document.getElementById('ui')?.className || '',
        chip: !!document.querySelector('.photo-chip.show'),
        photo: g?.state?.photo ?? c?.app?.photoMode ?? null
      };
    }).catch(() => null);
    const photoBefore = await photoState();
    await page.keyboard.press('p');
    await sleep(500);
    const photoAfter = await photoState();
    const on = !!(photoAfter && (photoAfter.photo === true || photoAfter.chip || /(^|\s)photo(\s|$)/.test(photoAfter.ui || '')));
    add('photo mode toggles with P', on, `before=${j(photoBefore)} after=${j(photoAfter)}`, 'fail');
    if (on) {
      await page.keyboard.press('p');
      await sleep(400);
      const photoOff = await photoState();
      add('photo mode toggles off with P', photoOff?.photo === false || !photoOff?.chip, j(photoOff), 'warn');
    }
  } else {
    warn('photo mode hook exposed', false, 'no app.togglePhoto/game.togglePhoto yet');
  }

  const pauseHook = await page.evaluate(() => !!(window.__game?.ui || document.querySelector('.veil.pause'))).catch(() => false);
  if (pauseHook) {
    await page.keyboard.press('Escape');
    await sleep(500);
    const paused = await page.evaluate(() => {
      const ui = window.__game?.ui;
      return {
        pauseOpen: ui?.pauseOpen ?? null,
        overlay: !!document.querySelector('.veil.pause.show')
      };
    }).catch(() => null);
    add('Escape opens the pause veil', !!(paused && (paused.pauseOpen === true || paused.overlay)), j(paused), 'warn');
    if (paused && (paused.pauseOpen === true || paused.overlay)) {
      await page.evaluate(() => window.__game?.resume?.());
      await sleep(300);
    }
  } else {
    warn('pause hook exposed', false, 'no __game.ui / .veil.pause found');
  }

  const collect = await page.evaluate(() => {
    const c = window.__ctx;
    const g = window.__game || c?.game || c?.app;
    if (!g) return { available: false, reason: 'no game object' };
    if (typeof g.collectAll !== 'function') return { available: false, reason: 'collectAll() missing', keys: Object.keys(g) };
    const count = () => {
      if (g.state && typeof g.state.found === 'number') return g.state.found;
      if (g.collected instanceof Set) return g.collected.size;
      if (Array.isArray(g.collected)) return g.collected.length;
      if (typeof g.collectedCount === 'number') return g.collectedCount;
      if (typeof g.stars === 'number') return g.stars;
      return null;
    };
    const total = g.state?.total ?? null;
    const before = count();
    let ret = null;
    try { ret = g.collectAll(); } catch (e) { return { available: true, error: String(e?.message || e) }; }
    return { available: true, before, after: count(), ret, total, keys: Object.keys(g).slice(0, 25) };
  }).catch((e) => ({ available: false, reason: String(e?.message || e) }));

  if (collect.available && !collect.error) {
    const after = collect.after;
    add('collectAll reachable', true, `before=${collect.before} after=${after}`);
    if (after !== null) add('collectAll collects all 5 pals', after === 5, `after=${after}`, 'fail');
    else warn('collectAll exposes a count', false, 'no collected/collectedCount/stars field to verify');
    await sleep(500);
    const hudText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 240)).catch(() => '');
    info('HUD text after collectAll', hudText || '(empty)');
  } else {
    warn('collectAll hook available', false, collect.reason || collect.error || 'missing');
  }

  /* ---------- wrap up ---------- */
  const afterChecks = await pageSummary(page);
  add('no errors during test run', rec.pageErrors.length === 0 && (afterChecks.appErrors?.length ?? 0) === 0,
    j({ pageErrors: rec.pageErrors.slice(0, 5), appErrors: afterChecks.appErrors }), 'fail');

  const fails = checks.filter((c) => !c.ok && c.severity !== 'warn');
  const warns = checks.filter((c) => !c.ok && c.severity === 'warn');
  console.log('\nSMOKE ' + j({
    ok: fails.length === 0,
    url,
    size: `${W}x${H}`,
    fails: fails.map((c) => ({ name: c.name, detail: c.detail })),
    warnings: warns.map((c) => ({ name: c.name, detail: c.detail })),
    passes: checks.filter((c) => c.ok).length,
    summary: {
      ready: afterChecks.ready, quality: afterChecks.quality, errors: afterChecks.appErrors,
      stats: afterChecks.stats, scene: afterChecks.scene, interactables: afterChecks.interactables,
      collectibleSpots: afterChecks.collectibleSpots, colliders: afterChecks.colliders,
      player: afterChecks.player, camera: afterChecks.camera
    }
  }));
  if (fails.length) {
    console.log(`\nSMOKE FAILED: ${fails.length} failure(s)`);
    process.exitCode = 1;
  } else {
    console.log(`\nSMOKE PASSED (${warns.length} warning${warns.length === 1 ? '' : 's'})`);
  }
} catch (e) {
  console.error('[smoke] FATAL', String(e?.stack || e));
  console.log('SMOKE ' + j({ ok: false, fatal: String(e?.message || e), checks }));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
