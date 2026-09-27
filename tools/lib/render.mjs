// Headless-browser renders of items and rooms, so agents can check models visually.
// Uses Playwright's Chromium (installed automatically on first use), or Chrome/Edge if present.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer, ROOT } from './server.mjs';

let session = null;

const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function launch() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    throw new Error('Rendering needs dependencies. Run `npm install` (or `npm start` once) in the repo, then retry.');
  }
  const { chromium } = playwright;
  const exe = process.env.ROOMCRAFT_CHROME; // optional: path to any Chrome/Chromium
  const attempts = [...(exe ? [() => chromium.launch({ executablePath: exe, args: GL_ARGS })] : []), () => chromium.launch({ args: GL_ARGS }), () => chromium.launch({ channel: 'chrome', args: GL_ARGS }), () => chromium.launch({ channel: 'msedge', args: GL_ARGS })];
  for (const a of attempts) {
    try {
      return await a();
    } catch {}
  }
  // No browser yet: install Playwright's Chromium once, then retry.
  process.stderr.write('Installing headless Chromium for rendering (one time)…\n');
  spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], { stdio: ['ignore', process.stderr, process.stderr] });
  return chromium.launch({ args: GL_ARGS });
}

async function getSession() {
  if (session) return session;
  const [browser, srv] = await Promise.all([launch(), startServer({ port: 0, quiet: true })]);
  const context = await browser.newContext({ viewport: { width: 1000, height: 750 }, deviceScaleFactor: 1 });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  session = { browser, context, srv };
  const close = () => closeRenderer();
  process.once('exit', close);
  return session;
}

export async function closeRenderer() {
  if (!session) return;
  const s = session;
  session = null;
  await s.browser.close().catch(() => {});
  await s.srv.close().catch(() => {});
}

async function capture(query, views) {
  const { context, srv } = await getSession();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${srv.url}/preview.html?${query}`);
    await page.waitForFunction(() => window.preview && (window.preview.ready || window.preview.error), null, { timeout: 60000 });
    const err = await page.evaluate(() => window.preview.error || (window.preview.componentError && `the model component failed: ${window.preview.componentError}`));
    if (err) throw new Error(err);
    const out = [];
    for (const view of views) {
      await page.evaluate((v) => window.preview.show(v), view);
      await page.waitForTimeout(150);
      out.push({ view, png: await page.screenshot({ type: 'png' }) });
    }
    return out;
  } catch (err) {
    throw new Error(`Render failed: ${err.message}${errors.length ? ` (page errors: ${errors.join('; ')})` : ''}`);
  } finally {
    await page.close();
  }
}

/** Render one furniture model from the library. Views: three-quarter, front, side, top. */
export function renderItem(itemId, { color, views = ['three-quarter', 'front'] } = {}) {
  const q = new URLSearchParams({ item: itemId });
  if (color) q.set('color', color);
  return capture(q.toString(), views);
}

/** Render a design. Views: "3d:<floor>", "plan:<floor>", "exterior". */
export function renderDesign(id, views) {
  return capture(new URLSearchParams({ design: id }).toString(), views);
}

/** Export a design as a .glb (Buffer), exactly like the app's Export button. */
export async function exportDesignGLB(id) {
  const { context, srv } = await getSession();
  const page = await context.newPage();
  try {
    await page.goto(`${srv.url}/preview.html?design=${encodeURIComponent(id)}`);
    await page.waitForFunction(() => window.preview && (window.preview.ready || window.preview.error), null, { timeout: 60000 });
    const err = await page.evaluate(() => window.preview.error);
    if (err) throw new Error(err);
    return Buffer.from(await page.evaluate(() => window.preview.exportGLB()), 'base64');
  } finally {
    await page.close();
  }
}
