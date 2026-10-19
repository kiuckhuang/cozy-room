#!/usr/bin/env node
// Launch headless Chrome/Edge ON THE WINDOWS HOST and hand its DevTools port to the
// WSL-side tooling. This is how we get real GPU acceleration (RTX/D3D11) for
// screenshots and perf runs: Chrome inside WSL has no hardware GL/Vulkan path
// (WSL exposes the GPU as D3D12, and Mesa ships no D3D12 driver in this distro),
// so ANGLE always falls back to SwiftShader there.
//
//   node tools/host-gpu.mjs start            # start, prints http://127.0.0.1:<port>
//   node tools/host-gpu.mjs status           # is it alive?
//   node tools/host-gpu.mjs stop             # kill it
//
// Then any tool that uses lib/harness.mjs renders on the GPU:
//   export CDP_URL=$(node tools/host-gpu.mjs start --quiet)
//   node tools/gpucheck.mjs
//
// Options: --port=95xx --size=1600x900 --headed --uncapped --browser=edge|chrome
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, openSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';

const STATE = resolve(process.cwd(), '.gpu-host.json');
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--')) || 'start';
const flag = (name, def = undefined) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

const WIN_CANDIDATES = {
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ],
  edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ]
};

const PS = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const CMD = '/mnt/c/Windows/System32/cmd.exe';

const toWsl = (winPath) => {
  const r = spawnSync('wslpath', ['-u', winPath], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

function findBrowser() {
  const want = String(flag('browser', process.env.HOST_BROWSER || 'chrome'));
  const order = want === 'edge' ? ['edge', 'chrome'] : ['chrome', 'edge'];
  for (const kind of order) {
    for (const win of WIN_CANDIDATES[kind]) {
      const wsl = toWsl(win);
      if (wsl && existsSync(wsl)) return { kind, win, wsl };
    }
  }
  return null;
}

const winTemp = () => {
  const r = spawnSync(CMD, ['/c', 'echo %TEMP%'], { encoding: 'utf8' });
  const p = (r.stdout || '').trim().replace(/\r/g, '');
  return p && !/%.*%/.test(p) ? p : 'C:\\temp';
};

// Probe with a TCP connect, never a bind: binding 127.0.0.1 under WSL's mirrored
// networking can leave the Windows-side port unusable, which silently kills Chrome.
function portInUse(port, timeoutMs = 150) {
  return new Promise((res) => {
    const sock = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; sock.destroy(); res(v); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

async function pickPort() {
  const wanted = Number(flag('port', 0));
  if (wanted) return wanted;
  // Random start so a previously poisoned port is not retried first.
  const base = 9600 + Math.floor(Math.random() * 250);
  for (let i = 0; i < 60; i++) {
    const p = base + i;
    if (p > 9899) break;
    if (!(await portInUse(p))) return p;
  }
  throw new Error('no free port in 9600-9899');
}

async function readVersion(port, timeoutMs = 1200) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: ac.signal });
    if (!r.ok) return null;
    const json = JSON.parse(await r.text());
    return json && json.Browser ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function readState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return null; }
}

const killMatching = (pattern) => spawnSync(PS, [
  '-NoProfile', '-Command',
  `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${pattern}*' } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
], { encoding: 'utf8' });

async function launchOnce(browser, port, tag) {
  const size = String(flag('size', '1600x900')).split('x').map(Number);
  const profile = `${winTemp()}\\cozy-host-gpu-${port}-${tag}`;
  const devArgs = [
    '--headless',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--use-angle=d3d11',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${size[0] || 1600},${size[1] || 900}`
  ];
  if (flag('uncapped')) devArgs.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
  if (flag('headed')) devArgs.splice(devArgs.indexOf('--headless'), 1);

  // Spawn through the WSL path so the interop handler starts the Windows binary.
  // stdio goes to a log file: the interop bridge needs real handles, and the log
  // records "DevTools listening on ..." when startup needs debugging.
  const logPath = `/tmp/cozy-host-gpu-${port}.log`;
  const logFd = openSync(logPath, 'a');
  const child = spawn(browser.wsl, devArgs, { stdio: ['ignore', logFd, logFd] });
  child.unref();

  let ver = null;
  for (let i = 0; i < 24 && !ver; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ver = await readVersion(port);
  }
  if (!ver) {
    killMatching(`remote-debugging-port=${port}`);
    killMatching(`cozy-host-gpu-${port}-${tag}`);
    return null;
  }
  return { pid: child.pid, port, browser: ver.Browser, exe: browser.win, profile, logPath, startedAt: new Date().toISOString() };
}

async function start() {
  const existing = readState();
  if (existing?.port) {
    const ver = await readVersion(existing.port);
    if (ver) {
      if (!flag('quiet')) console.error(`host GPU browser already running: ${ver.Browser} at http://127.0.0.1:${existing.port}`);
      console.log(`http://127.0.0.1:${existing.port}`);
      return;
    }
    killMatching(`remote-debugging-port=${existing.port}`);
    rmSync(STATE, { force: true });
  }
  const browser = findBrowser();
  if (!browser) throw new Error('no Windows Chrome/Edge found under /mnt/c/Program Files');

  const tag = Date.now().toString(36);
  let info = null;
  for (let attempt = 0; attempt < 3 && !info; attempt++) {
    const port = await pickPort();
    info = await launchOnce(browser, port, tag);
  }
  if (!info) throw new Error(`DevTools did not come up (${browser.kind}); see /tmp/cozy-host-gpu-*.log`);
  writeFileSync(STATE, JSON.stringify(info, null, 2));
  if (!flag('quiet')) {
    console.error(`started ${info.browser} (${browser.kind}) headless, profile ${info.profile}`);
    console.error(`CDP_URL=http://127.0.0.1:${info.port}`);
  }
  console.log(`http://127.0.0.1:${info.port}`);
}

async function status() {
  const st = readState();
  if (!st) { console.log('not running (no .gpu-host.json)'); return; }
  const ver = await readVersion(st.port);
  console.log(ver ? `running: ${ver.Browser} at http://127.0.0.1:${st.port}` : `stale state: nothing on port ${st.port}`);
}

async function stop() {
  const st = readState();
  if (!st) { console.log('nothing to stop'); return; }
  killMatching(`remote-debugging-port=${st.port}`);
  if (st.profile) killMatching(st.profile.split('\\').pop());
  await new Promise((r) => setTimeout(r, 800));
  const ver = await readVersion(st.port);
  if (!ver) rmSync(STATE, { force: true });
  console.log(ver ? `still alive on ${st.port}` : 'stopped');
}

try {
  if (cmd === 'start') await start();
  else if (cmd === 'status') await status();
  else if (cmd === 'stop') await stop();
  else { console.error(`unknown command: ${cmd}`); process.exit(2); }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
