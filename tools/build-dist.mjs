// Build the portable, server-free dist/ folder.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const OUT = process.env.OUT_DIR || 'docs';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/fonts`, { recursive: true });
import { existsSync } from 'node:fs';
const local = process.platform === 'win32' ? 'node_modules/.bin/esbuild.cmd' : 'node_modules/.bin/esbuild';
const esbuild = existsSync(local) ? local : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const esbuildArgs = ['src/main.js', '--bundle', '--format=iife', '--target=chrome110',
  `--outfile=${OUT}/bundle.js`, '--minify',
  '--alias:three/addons=./node_modules/three/examples/jsm'];
if (!existsSync(local)) esbuildArgs.unshift('esbuild');
execFileSync(esbuild, esbuildArgs, { stdio: 'inherit' });
cpSync('src/ui/style.css', `${OUT}/style.css`);
cpSync('src/ui/fonts', `${OUT}/fonts`, { recursive: true });
cpSync('favicon.svg', `${OUT}/favicon.svg`);
let html = readFileSync('index.html', 'utf8');
html = html
  .replace('<link rel="stylesheet" href="/src/ui/style.css">', '<link rel="stylesheet" href="style.css">')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace('<script type="module" src="/src/main.js"></script>', '<script src="bundle.js"></script>');
writeFileSync(`${OUT}/index.html`, html);
console.log('built:', resolve(`${OUT}/index.html`));
