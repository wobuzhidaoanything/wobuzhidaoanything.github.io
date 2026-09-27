#!/usr/bin/env node
// One command: `npm start`. Installs dependencies when needed, serves the site with the
// local link reader, and opens it in your browser.
//   --port 8080   use a specific port      --no-open   don't open a browser
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = +(args[args.indexOf('--port') + 1] || process.env.PORT || 5173) || 5173;

// Install dependencies if node_modules is missing or older than package.json.
const marker = path.join(ROOT, 'node_modules', '.package-lock.json');
if (!fs.existsSync(marker) || fs.statSync(marker).mtimeMs < fs.statSync(path.join(ROOT, 'package.json')).mtimeMs) {
  console.log('Installing dependencies (first run only)…');
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) console.warn('npm install failed; the site still works, but agent rendering may not.');
}

const { startServer } = await import('./lib/server.mjs');
const { url } = await startServer({ port });
console.log('Links pasted into the site are read by this local server. Press Ctrl+C to stop.');

if (!args.includes('--no-open') && !process.env.CI) {
  const opener = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {}
}
