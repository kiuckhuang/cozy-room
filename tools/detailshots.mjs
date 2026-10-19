// QA detail capture: intro + in-game HUD, plush close-ups and bay/ceiling details.
//   node tools/detailshots.mjs   → shots/qa/*.png
import { launch, waitForReady, sleep } from './lib/harness.mjs';
const OUT = 'shots/qa';
const b = await launch({ width: 960, height: 540 });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('[console-error]', m.text()); });
await p.goto('http://127.0.0.1:4173/?q=med', { waitUntil: 'domcontentloaded' });
await waitForReady(p, 60000);
await sleep(1200);
await p.screenshot({ path: `${OUT}/hud_intro.png` });
console.log('saved hud_intro', await p.evaluate(() => ({ started: window.__game?.state?.started, ui: document.getElementById('ui')?.className })));

// start the game without pointer lock and let the HUD settle
await p.evaluate(() => window.__game?.start?.());
await sleep(1600);
await p.screenshot({ path: `${OUT}/hud_ingame.png` });
console.log('saved hud_ingame', await p.evaluate(() => ({
  started: window.__game?.state?.started,
  found: window.__game?.state?.found, total: window.__game?.state?.total,
  hud: document.querySelector('.hud')?.getBoundingClientRect().toJSON(),
  prompt: document.querySelector('.prompt')?.className,
  mood: document.querySelector('.mood-label')?.textContent
})));

const shots = [
  ['plush_star', [1.38, 1.24, 0.74], [1.80, 0.80, 1.03]],
  ['plush_cat', [1.28, 1.42, -0.58], [1.99, 1.04, -0.95]],
  ['plush_bunny', [0.78, 1.18, 0.76], [1.42, 0.10, 0.20]],
  ['plush_duck', [0.52, 1.94, -1.18], [0.95, 1.80, -2.16]],
  ['plush_cloud', [-0.72, 1.06, 0.66], [-1.40, 0.08, 0.10]],
  ['detail_bay_seat', [1.42, 1.30, -0.55], [2.06, 1.12, -1.30]],
  ['detail_ceiling_westwall', [1.55, 1.55, 1.90], [-1.60, 1.55, -0.15]]
];
for (const [name, cam, look] of shots) {
  await p.evaluate(([c, l]) => window.__setView?.(c, l), [cam, look]);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  await sleep(800);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
}
await b.close();
