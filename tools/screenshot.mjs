#!/usr/bin/env node
// Screenshot CLI — hardened version.
//
//   node tools/screenshot.mjs <url> <out.png> [waitMs]
//   node tools/screenshot.mjs --url=http://127.0.0.1:4173/?q=med --out=shots/a.png --wait=25000
//
// Env: W, H (viewport, default 960x540), DPR (default 1), BASE_URL.
// Flags: --url --out --wait --width --height --dpr --settle --strict --quiet --timeout
// Waits for window.__APP_READY__, then prints a compact JSON summary with
// page errors, window.__ERRORS__, renderer info and draw calls / triangles.
// Exit code: 0 ok, 2 page/readiness errors with --strict, 1 hard failure.
import {
  launch, instrument, waitForReady, pageSummary, resolveUrl, ensureDir, sleep, j
} from './lib/harness.mjs';

function parseArgs(argv) {
  const out = { positional: [], flags: {} };
  for (const a of argv) {
    const m = /^--([a-zA-Z][\w-]*)(?:=(.*))?$/.exec(a);
    if (m) out.flags[m[1]] = m[2] === undefined ? true : m[2];
    else out.positional.push(a);
  }
  return out;
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const url = resolveUrl(flags.url || positional[0] || '/');
const out = flags.out || positional[1] || 'shots/view.png';
const waitMs = Number(flags.wait || flags.timeout || positional[2] || process.env.WAIT || 25000);
const settleMs = Number(flags.settle ?? 900);
const W = Number(flags.width || process.env.W || 960);
const H = Number(flags.height || process.env.H || 540);
const DPR = Number(flags.dpr || process.env.DPR || 1);
const quiet = !!flags.quiet;
const strict = !!flags.strict;

ensureDir(out);
const log = (...a) => { if (!quiet) console.log(...a); };

let browser;
let exitCode = 0;
try {
  browser = await launch({ width: W, height: H, dpr: DPR });
  const page = await browser.newPage();
  const rec = instrument(page);
  page.on('console', (m) => { if (!quiet && m.type() === 'error') console.log('[console.error]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  log('[shot] navigating', url);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ready = await waitForReady(page, waitMs);
  if (ready.ready) await sleep(settleMs);
  else log(`[shot] WARNING: __APP_READY__ not set after ${ready.waitedMs}ms`);
  const summary = await pageSummary(page);
  await page.screenshot({ path: out });

  const report = {
    ok: !!summary && !summary.evalError && rec.pageErrors.length === 0 &&
      (summary.appErrors?.length ?? 0) === 0 && rec.httpErrors.length === 0 && rec.requestFails.length === 0,
    ready: summary?.ready ?? false,
    readyWaitedMs: ready.waitedMs,
    totalMs: Date.now() - t0,
    out,
    errors: {
      pageErrors: rec.pageErrors,
      appErrors: summary?.appErrors ?? null,
      consoleErrors: rec.consoleErrors.map((c) => c.text).slice(0, 10),
      httpErrors: rec.httpErrors.slice(0, 8),
      requestFails: rec.requestFails.slice(0, 6)
    },
    canvas: summary?.canvas,
    dpr: summary?.dpr,
    quality: summary?.quality,
    renderer: summary?.renderer,
    stats: summary?.stats,
    scene: summary?.scene,
    interactables: summary?.interactables,
    collectibleSpots: summary?.collectibleSpots,
    camera: summary?.camera
  };
  const hasRuntimeErrors = (report.errors.pageErrors.length + (report.errors.appErrors?.length ?? 0) + report.errors.consoleErrors.length) > 0;
  if (hasRuntimeErrors) exitCode = strict ? 2 : 0;
  console.log('SHOT ' + j(report));
  console.log('saved', out);
} catch (e) {
  console.error('[shot] FAILED:', String(e?.stack || e));
  exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
process.exit(exitCode);
