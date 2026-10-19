#!/usr/bin/env node
// Regenerate the README media (hero / dusk / night / HUD / intro / contact sheet).
//
// Runs on the GPU backend when CDP_URL is set (or .gpu-host.json exists), which
// keeps quality "high" instead of the SwiftShader auto-downgrade, and takes a few
// seconds instead of minutes:
//
//   export CDP_URL=$(node tools/host-gpu.mjs start --quiet)
//   node tools/media.mjs                 # writes shots/media/*.png (+ .jpg)
//   MEDIA_OUT=/tmp/m node tools/media.mjs
//
// `?q=high&force=1` is used so MSAA 4x + full bloom/outline land in the plates.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { launch, waitForReady, resolveUrl, ensureDir, sleep } from './lib/harness.mjs';

const OUT = process.env.MEDIA_OUT || 'shots/media';
ensureDir(`${OUT}/x.png`);
const W = 1280;
const H = 720;

// Mirrors the camera script in tools/shotset.mjs (see ROOM_SPEC.md for the metres).
const VIEWS = [
  { name: '01_overall_door', cam: [1.52, 1.60, 2.06], look: [0.10, 1.00, -1.62] },
  { name: '02_bed', cam: [0.95, 1.34, 0.18], look: [0.12, 0.54, -1.60] },
  { name: '03_bay_window', cam: [0.95, 1.45, -1.25], look: [2.10, 1.45, -1.25] },
  { name: '04_desk_chair', cam: [0.55, 1.35, 0.72], look: [1.72, 0.82, 1.32] },
  { name: '05_north_window', cam: [-1.10, 1.44, -0.92], look: [-1.52, 1.52, -2.30] },
  { name: '06_plant_nightstand', cam: [-1.02, 1.28, -0.52], look: [-1.24, 0.68, -2.02] },
  { name: '07_rugs_floor', cam: [0.58, 1.50, 1.72], look: [-1.22, 0.02, -0.24] },
  { name: '08_poster_wall', cam: [-0.15, 1.68, -0.82], look: [-0.82, 1.92, -2.30] }
];

const viewUrl = (v) =>
  resolveUrl(`/?q=high&force=1&hud=0&nostart=1&cam=${v.cam.join(',')}&look=${v.look.join(',')}`);

const browser = await launch({ width: W, height: H });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));

// --- hero plates (golden is the default mood, bedside lamp already on) -------
await page.goto(resolveUrl('/?q=high&force=1&hud=0&nostart=1'), { waitUntil: 'domcontentloaded', timeout: 120000 });
const ready = await waitForReady(page, 120000);
await sleep(1800);
await page.screenshot({ path: `${OUT}/hero.png` });
console.log('[media] hero', JSON.stringify(await page.evaluate(() => ({
  mood: window.__ctx?.mood?.name,
  quality: window.__ctx?.pipeline?.quality,
  isSoftware: window.__ctx?.pipeline?.isSoftware,
  renderer: window.__ctx?.renderer?.getContext?.()?.getParameter?.(0x1F01),
  stats: window.__stats?.()
}))));

for (const mood of ['dusk', 'night']) {
  await page.evaluate((m) => window.__setMood?.(m, true), mood).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  await sleep(1600);
  await page.screenshot({ path: `${OUT}/${mood}.png` });
  console.log('[media]', mood);
}

// --- HUD plate --------------------------------------------------------------
await page.evaluate(() => window.__setMood?.('golden', true)).catch(() => {});
await page.evaluate(() => document.body.classList.remove('nohud'));
await sleep(1500);
await page.screenshot({ path: `${OUT}/hero_hud.png` });
console.log('[media] hero_hud');

// --- intro card -------------------------------------------------------------
const intro = await browser.newPage();
await intro.goto(resolveUrl('/'), { waitUntil: 'domcontentloaded', timeout: 120000 });
await waitForReady(intro, 120000).catch(() => {});
await sleep(2200);
await intro.screenshot({ path: `${OUT}/intro.png` });
await intro.close().catch(() => {});
console.log('[media] intro');

// --- 8 view plates + contact sheet -----------------------------------------
const viewDir = `${OUT}/views`;
ensureDir(`${viewDir}/x.png`);
const flat = await browser.newPage();
for (const v of VIEWS) {
  await flat.goto(viewUrl(v), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForReady(flat, 120000).catch(() => {});
  await sleep(900);
  await flat.screenshot({ path: `${viewDir}/${v.name}.png` });
  console.log('[media] view', v.name);
}
await flat.close().catch(() => {});

const py = spawnSync('python3', ['-c', `
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont
d, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(d, '*.png')))
if not files: raise SystemExit('no tiles')
TW, TH, CAP, GAP, COLS = 480, 270, 22, 10, 2
rows = (len(files) + COLS - 1) // COLS
W = COLS * TW + (COLS + 1) * GAP
H = rows * (TH + CAP) + (rows + 1) * GAP
sheet = Image.new('RGB', (W, H), (27, 24, 48))
draw = ImageDraw.Draw(sheet)
font = None
for p in ('/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf', '/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf'):
    if os.path.exists(p):
        try: font = ImageFont.truetype(p, 13); break
        except OSError: pass
for i, f in enumerate(files):
    c, r = i % COLS, i // COLS
    x = GAP + c * (TW + GAP)
    y = GAP + r * (TH + CAP + GAP)
    im = Image.open(f).convert('RGB').resize((TW, TH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    label = os.path.splitext(os.path.basename(f))[0].replace('_', ' ')
    draw.text((x + 2, y + TH + 4), label, fill=(244, 236, 255), font=font)
sheet.save(out)
print('contact sheet', out, sheet.size)
`, viewDir, `${OUT}/contact.png`], {
  encoding: 'utf8',
  env: { ...process.env, PYTHONPATH: process.env.PYTHONPATH || (existsSync('/home/kiu/github/testbed/pylibs') ? '/home/kiu/github/testbed/pylibs' : '') }
});
if (py.status === 0) console.log('[media]', (py.stdout || '').trim());
else console.error('[media] contact sheet failed:', (py.stderr || '').slice(0, 800));

// --- jpg versions for the README ------------------------------------------
const jpgs = spawnSync('python3', ['-c', `
import glob, os, sys
from PIL import Image
d = sys.argv[1]
for f in glob.glob(os.path.join(d, '*.png')):
    im = Image.open(f).convert('RGB')
    out = os.path.splitext(f)[0] + '.jpg'
    im.save(out, 'JPEG', quality=88, optimize=True, progressive=True)
    print(os.path.basename(out), os.path.getsize(out))
`, OUT], {
  encoding: 'utf8',
  env: { ...process.env, PYTHONPATH: process.env.PYTHONPATH || (existsSync('/home/kiu/github/testbed/pylibs') ? '/home/kiu/github/testbed/pylibs' : '') }
});
if (jpgs.status === 0) console.log('[media]', jpgs.stdout.trim().replace(/\n/g, ' '));
else console.error('[media] jpg conversion failed:', (jpgs.stderr || '').slice(0, 800));

console.log('[media] errors', JSON.stringify({ ready: ready.ready, errors, tiles: readdirSync(`${OUT}/views`).length }));
await browser.close();
