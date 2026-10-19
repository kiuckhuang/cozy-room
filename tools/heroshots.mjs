// Final hero: 1280x720 HUD shot on the Golden-hour default (bedside lamp on),
// plus dusk and night mood plates via window.__setMood. One browser/page.
import { launch, waitForReady, sleep, j } from './lib/harness.mjs';

const OUT = 'shots/qa';
const W = 1280, H = 720;
const b = await launch({ width: W, height: H });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e.message || e)));
p.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/i.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:4173/?q=med&nostart=1', { waitUntil: 'domcontentloaded' });
const ready = await waitForReady(p, 90000);
await sleep(1800);
await p.screenshot({ path: `${OUT}/hero_1280_golden_hud.png` });
console.log('saved hero_1280_golden_hud', j(await p.evaluate(() => ({
  ready: !!window.__APP_READY__, mood: window.__ctx?.mood?.name,
  bedLamp: window.__ctx?.lights?.lampState?.bed, found: window.__game?.state?.found,
  stats: window.__stats?.()
}))));

for (const mood of ['dusk', 'night']) {
  await p.evaluate((m) => window.__setMood?.(m, true), mood).catch(() => {});
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  await sleep(1500);
  await p.screenshot({ path: `${OUT}/hero_1280_${mood}.png` });
  console.log('saved', mood, j(await p.evaluate(() => ({ mood: window.__ctx?.mood?.name, stats: window.__stats?.() }))));
}

// photo mode plate (P) for HUD completeness
await p.evaluate(() => window.__game?.togglePhoto?.(true));
await sleep(900);
await p.screenshot({ path: `${OUT}/hero_1280_photo.png` });
await p.evaluate(() => window.__game?.togglePhoto?.(false));

console.log('errors', j({ ready: ready.ready, waitedMs: ready.waitedMs, errors: errs, appErrors: await p.evaluate(() => window.__ERRORS__ || []) }));
await b.close();
