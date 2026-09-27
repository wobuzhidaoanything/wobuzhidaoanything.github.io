// Local server behind `npm start`: serves the app, its libraries (from node_modules),
// the device design store, the link reader, DXF import and agent connection status.
// Binds to 127.0.0.1 only; API calls must come from the app's own page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, USERDATA, MODELS, TEXTURES, LIBRARY } from './paths.mjs';
import { scrapeProduct } from '../../worker/src/scrape.js';
import * as store from './store.mjs';
import { agentStatus, autoSetup, removeAgent } from './agents.mjs';
import * as runner from './runner.mjs';

export { ROOT };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm', '.hdr': 'application/octet-stream',
};
const ASSET_OK = /\.(glb|gltf|bin|png|jpe?g|webp|avif|ktx2)(\?|$)/i;

export const VENDOR = new Set(['three', 'three-mesh-bvh', 'three-bvh-csg', 'three-gpu-pathtracer', 'camera-controls', 'n8ao', 'postprocessing', 'polygon-clipping', 'splaytree', 'robust-predicates']);

function send(res, status, body, type = 'application/json; charset=utf-8', cache = 'no-store') {
  res.writeHead(status, { 'content-type': type, 'cache-control': cache, 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function body(req, limit = 30e6) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new Error('Request too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Only accept API calls from this app (blocks other websites and DNS-rebinding tricks).
function trusted(req, port) {
  const host = String(req.headers.host || '');
  if (!new RegExp(`^(127\\.0\\.0\\.1|localhost|\\[::1\\]):${port}$`).test(host)) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) return false;
  const site = req.headers['sec-fetch-site'];
  return !site || site === 'same-origin' || site === 'none';
}

// Live updates: tell open pages when a design changes on disk (e.g. an agent edited it),
// and stream what the background agent says.
const clients = new Set();
runner.onAgentEvent((ev) => {
  for (const res of clients) res.write(`data: ${JSON.stringify(ev)}\n\n`);
});
let watcher = null;
function watchDesigns() {
  if (watcher) return;
  fs.mkdirSync(store.DIR, { recursive: true });
  const pending = new Map();
  const onChange = (dir) => (_, name) => {
    if (!name || !name.endsWith('.json') || (dir === USERDATA && name !== 'library.json')) return;
    clearTimeout(pending.get(name));
    pending.set(
      name,
      setTimeout(() => {
        let info = { file: name };
        try {
          const d = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
          info = dir === USERDATA ? { type: 'library', updatedAt: d.updatedAt } : { type: 'design', id: d.id, updatedAt: d.updatedAt, updatedBy: d.updatedBy };
        } catch {
          info = { type: 'removed', file: name };
        }
        for (const res of clients) res.write(`data: ${JSON.stringify(info)}\n\n`);
      }, 120)
    );
  };
  const w1 = fs.watch(store.DIR, onChange(store.DIR));
  const w2 = fs.watch(USERDATA, onChange(USERDATA));
  watcher = { close: () => (w1.close(), w2.close()) };
  void LIBRARY;
}

async function parseDxf(text) {
  const { default: DxfParser } = await import('dxf-parser');
  const dxf = new DxfParser().parseSync(text);
  const units = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 }[dxf.header?.$INSUNITS];
  const segs = [];
  for (const e of dxf.entities || []) {
    const v = e.vertices || [];
    if (e.type === 'LINE' && v.length >= 2) segs.push([v[0], v[1]]);
    else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && v.length >= 2) {
      for (let i = 0; i < v.length - 1; i++) segs.push([v[i], v[i + 1]]);
      if (e.shape || e.closed) segs.push([v[v.length - 1], v[0]]);
    }
  }
  if (!segs.length) throw new Error('No lines or polylines found in the DXF.');
  const xs = segs.flat().map((p) => p.x);
  const ys = segs.flat().map((p) => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // Unitless drawings: guess from the size (a house is ~5–50 m).
  const scale = units || (span > 1000 ? 0.001 : span > 100 ? 0.01 : 1);
  const minX = Math.min(...xs), maxY = Math.max(...ys);
  // DXF y goes up; plan z goes down.
  const lines = segs
    .map(([a, b]) => [[+((a.x - minX) * scale).toFixed(3), +((maxY - a.y) * scale).toFixed(3)], [+((b.x - minX) * scale).toFixed(3), +((maxY - b.y) * scale).toFixed(3)]])
    .filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05);
  return { lines, scale, unitsKnown: !!units, spanMetres: +(span * scale).toFixed(2) };
}

async function api(req, res, url) {
  const m = url.pathname.match(/^\/api\/([\w-]+)(?:\/([\w-:.]+))?$/);
  if (!m) return send(res, 404, { ok: false, error: 'Unknown API' });
  const [, what, id] = m;
  const method = req.method;
  if (what === 'designs') {
    if (method === 'GET' && !id) return send(res, 200, { designs: store.listDesigns(), active: store.getActive() });
    if (method === 'GET') return send(res, 200, store.getDesign(id));
    if (method === 'PUT') {
      const d = JSON.parse(await body(req));
      if (d.id !== id) throw new Error('id mismatch');
      return send(res, 200, { ok: true, updatedAt: store.saveDesign(d, { by: 'app' }).updatedAt });
    }
    if (method === 'DELETE') return store.deleteDesign(id), send(res, 200, { ok: true });
  }
  if (what === 'active') {
    if (method === 'GET') return send(res, 200, { id: store.getActive() });
    if (method === 'PUT') return store.setActive(JSON.parse(await body(req)).id), send(res, 200, { ok: true });
  }
  if (what === 'library') {
    if (method === 'GET') return send(res, 200, store.getLibrary());
    if (method === 'PUT') return store.saveLibrary(JSON.parse(await body(req))), send(res, 200, { ok: true });
  }
  if (what === 'events' && method === 'GET') {
    watchDesigns();
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => (clients.delete(res), clearInterval(ping)));
    return;
  }
  if (what === 'chat') {
    if (method === 'GET') return send(res, 200, runner.chatState());
    const b = JSON.parse((await body(req, 1e6)) || '{}');
    if (method === 'POST' && id === 'send') {
      if (!String(b.text || '').trim()) throw new Error('Empty message');
      return send(res, 200, runner.enqueue('chat', { text: String(b.text).slice(0, 20000), context: b.context && String(b.context).slice(0, 2000), runner: b.runner }));
    }
    if (method === 'POST' && id === 'model') {
      if (!/^https?:\/\//i.test(b.url || '')) throw new Error('Not a link');
      return send(res, 200, runner.enqueue('model', { url: b.url, itemId: b.itemId, name: b.name, runner: b.runner }));
    }
    if (method === 'POST' && id === 'runner') return send(res, 200, runner.setRunner(b.runner));
    if (method === 'POST' && id === 'stop') return send(res, 200, runner.stop());
    if (method === 'POST' && id === 'clear') return send(res, 200, runner.clearChat());
  }
  if (what === 'dxf' && method === 'POST') return send(res, 200, { ok: true, ...(await parseDxf(await body(req))) });
  if (what === 'agents') {
    if (method === 'GET') return send(res, 200, agentStatus());
    const { id: agent } = JSON.parse(await body(req));
    if (method === 'POST' && id === 'setup') return send(res, 200, autoSetup(agent));
    if (method === 'POST' && id === 'remove') return send(res, 200, removeAgent(agent));
  }
  return send(res, 405, { ok: false, error: 'Method not allowed' });
}

export function startServer({ port = 5173, host = '127.0.0.1', quiet = false } = {}) {
  store.ensureStore();
  let boundPort = port;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'roomcraft-local' });
      if (url.pathname.startsWith('/api/') || url.pathname === '/scrape' || url.pathname === '/asset') {
        if (!trusted(req, boundPort)) return send(res, 403, { ok: false, error: 'Forbidden' });
      }
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (url.pathname === '/scrape') {
        const target = url.searchParams.get('url');
        if (!target) return send(res, 400, { ok: false, error: 'Missing ?url=' });
        try {
          return send(res, 200, { ok: true, product: await scrapeProduct(target) });
        } catch (err) {
          return send(res, 200, { ok: false, error: err.message });
        }
      }
      if (url.pathname === '/asset') {
        const target = url.searchParams.get('url');
        const up = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0 roomcraft', accept: '*/*' } });
        const type = up.headers.get('content-type') || 'application/octet-stream';
        if (!up.ok) return send(res, 502, { ok: false, error: `Upstream HTTP ${up.status}` });
        if (!ASSET_OK.test(new URL(target).pathname) && !/^(model|image)\//.test(type) && !/octet-stream/.test(type))
          return send(res, 415, { ok: false, error: 'Only 3D model and image files can be proxied.' });
        return send(res, 200, Buffer.from(await up.arrayBuffer()), type, 'public, max-age=86400');
      }
      // Browser libraries straight from node_modules (versions locked by package-lock.json).
      const vendor = url.pathname.match(/^\/vendor\/((?:@[^/]+\/)?[^/]+)\/(.+)$/);
      if (vendor) {
        if (!VENDOR.has(vendor[1])) return send(res, 404, 'Not a vendored package', 'text/plain');
        const base = path.join(ROOT, 'node_modules', vendor[1]);
        const f = path.normalize(path.join(base, decodeURIComponent(vendor[2])));
        if (!f.startsWith(base + path.sep) || !fs.existsSync(f)) return send(res, 404, 'Not found', 'text/plain');
        return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream', 'public, max-age=3600');
      }
      // Your downloaded models and finish textures (userdata/models, userdata/textures)
      const own = url.pathname.match(/^\/(models|textures)\/([\w.-]+)$/);
      if (own) {
        const f = path.join(own[1] === 'models' ? MODELS : TEXTURES, own[2]);
        if (!fs.existsSync(f)) return send(res, 404, 'Not found', 'text/plain');
        return send(res, 200, fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'no-cache');
      }
      // Static files (never outside the repo, never private folders)
      let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      const rel = file.slice(ROOT.length);
      if (!file.startsWith(ROOT) || /[\\/](\.git|node_modules|userdata|designs|\.roomcraft|tools|exports|models)([\\/]|$)/.test(rel) || /[\\/]\./.test(rel))
        return send(res, 403, 'Forbidden', 'text/plain');
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    } catch (err) {
      if (!res.headersSent) send(res, 500, { ok: false, error: err.message });
    }
  });
  return new Promise((resolve, reject) => {
    const tryPort = (p, attempts) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts > 0) tryPort(p + 1, attempts - 1);
        else reject(err);
      });
      server.listen(p, host, () => {
        boundPort = server.address().port;
        const addr = `http://127.0.0.1:${boundPort}`;
        if (!quiet) console.log(`Roomcraft running at ${addr}`);
        resolve({
          server,
          url: addr,
          close: () =>
            new Promise((r) => {
              for (const c of clients) c.end();
              clients.clear();
              watcher?.close();
              watcher = null;
              server.close(r);
            }),
        });
      });
    };
    tryPort(port, port === 0 ? 0 : 20);
  });
}
