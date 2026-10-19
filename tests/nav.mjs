// Navigation/reachability check: spawn free, walkable area, and whether each
// collectible spot is within interaction range of a reachable floor cell.
//   node tests/nav.mjs   (exit 1 if spawn is blocked or a pal is out of range)
import { launch, waitForReady, sleep, j } from '../tools/lib/harness.mjs';

const R = 0.29;      // player radius (controls.js)
const STEP = 0.1;
const X0 = -2.1, X1 = 2.1, Z0 = -2.3, Z1 = 2.3;

const b = await launch({ width: 640, height: 360 });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e.message || e)));
await p.goto('http://127.0.0.1:4173/?q=low&nostart=1&hud=0', { waitUntil: 'domcontentloaded' });
await waitForReady(p, 60000);
await sleep(800);
const data = await p.evaluate(() => {
  const c = window.__ctx;
  const V = c.camera.position.constructor;
  return {
    colliders: c.colliders.map((box) => ({ min: box.min.toArray(), max: box.max.toArray() })),
    spawn: [c.controls.state.pos.x, c.controls.state.pos.z],
    spots: c.collectibleSpots.map((s) => ({ id: s.id, p: s.position })),
    mood: c.moodName || null,
    lamps: c.lights?.lampState || null,
    errors: window.__ERRORS__ || []
  };
});
await b.close();

const solid = data.colliders.filter((c) => c.max[1] > 0.05);
const inside = (x, z, c) =>
  x > c.min[0] - R && x < c.max[0] + R && z > c.min[2] - R && z < c.max[2] + R;
const free = (x, z) => {
  if (x < X0 + R || x > X1 - R || z < Z0 + R || z > Z1 - R) return false;
  for (const c of solid) if (inside(x, z, c)) return false;
  return true;
};
const nx = Math.round((X1 - X0) / STEP) + 1;
const nz = Math.round((Z1 - Z0) / STEP) + 1;
const idx = (i, k) => i * nz + k;
const grid = new Uint8Array(nx * nz);
let freeCells = 0;
for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
  if (free(X0 + i * STEP, Z0 + k * STEP)) { grid[idx(i, k)] = 1; freeCells++; }
}
const spawn = data.spawn;
const spawnFree = free(spawn[0], spawn[1]);
const startI = Math.round((spawn[0] - X0) / STEP);
const startK = Math.round((spawn[1] - Z0) / STEP);
const seen = new Uint8Array(grid.length);
let reach = 0;
if (spawnFree) {
  const q = [[startI, startK]];
  seen[idx(startI, startK)] = 1;
  while (q.length) {
    const [i, k] = q.pop(); reach++;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, c = k + dk;
      if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
      const n = idx(a, c);
      if (seen[n] || !grid[n]) continue;
      seen[n] = 1; q.push([a, c]);
    }
  }
}
const reachable = [];
for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) if (seen[idx(i, k)]) reachable.push([X0 + i * STEP, Z0 + k * STEP]);
const distToSpot = (sx, sz) => {
  let best = Infinity;
  for (const [x, z] of reachable) best = Math.min(best, Math.hypot(x - sx, z - sz));
  return best;
};
const spots = data.spots.map((s) => {
  const d = distToSpot(s.p[0], s.p[2]);
  return { id: s.id, nearestPlayerDist: +d.toFixed(2), inReach: d <= 2.8, pos: s.p.map((v) => +v.toFixed(2)) };
});
const fails = [];
if (!spawnFree) fails.push('spawn is blocked (inside a collider)');
for (const s of spots) if (!s.inReach) fails.push(`${s.id} is ${s.nearestPlayerDist}m from the nearest reachable cell (> 2.8m interaction range)`);
console.log('NAV ' + j({
  ok: fails.length === 0,
  spawn: spawn.map((v) => +v.toFixed(2)),
  spawnFree,
  freeAreaM2: +(freeCells * STEP * STEP).toFixed(2),
  reachableAreaM2: +(reach * STEP * STEP).toFixed(2),
  spots,
  moodDefault: data.mood,
  bedLampDefault: data.lamps?.bed ?? null,
  pageErrors: errs,
  appErrors: data.errors,
  fails
}));
if (errs.length || data.errors.length) fails.push('runtime errors during nav probe');
if (fails.length) process.exitCode = 1;
