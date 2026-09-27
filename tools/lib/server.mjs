// Zero-dependency local server: serves the site and provides the same /scrape and
// /asset endpoints as the Cloudflare Worker, so links work locally with no deploy.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeProduct } from '../../worker/src/scrape.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.ktx2': 'image/ktx2',
};
const ASSET_OK = /\.(glb|gltf|bin|png|jpe?g|webp|avif|ktx2)(\?|$)/i;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Three.js is loaded from a CDN by the page; serve a local copy when node_modules has one,
// so rendering works offline too.
export function localThreeFile(pathname) {
  const m = pathname.match(/^\/npm\/three@[^/]+\/(.+)$/);
  if (!m) return null;
  const f = path.join(ROOT, 'node_modules', 'three', m[1]);
  return fs.existsSync(f) ? f : null;
}

export function startServer({ port = 5173, host = '127.0.0.1', quiet = false } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'OPTIONS') return send(res, 204, '');
      if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'roomcraft-local' });
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
        return send(res, 200, Buffer.from(await up.arrayBuffer()), type);
      }
      if (url.pathname.startsWith('/vendor/three/')) {
        const f = localThreeFile('/npm/three@x/' + url.pathname.slice('/vendor/three/'.length));
        if (f) return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)]);
      }
      // Static files (never outside the repo)
      let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      if (!file.startsWith(ROOT) || /[\\/](\.git|node_modules)([\\/]|$)/.test(file.slice(ROOT.length))) return send(res, 403, 'Forbidden', 'text/plain');
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    } catch (err) {
      send(res, 500, { ok: false, error: err.message });
    }
  });
  return new Promise((resolve, reject) => {
    const tryPort = (p, attempts) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts > 0) tryPort(p + 1, attempts - 1);
        else reject(err);
      });
      server.listen(p, host, () => {
        const addr = `http://${host === '0.0.0.0' ? 'localhost' : host}:${server.address().port}`;
        if (!quiet) console.log(`Roomcraft running at ${addr}`);
        resolve({ server, url: addr, close: () => new Promise((r) => server.close(r)) });
      });
    };
    tryPort(port, port === 0 ? 0 : 20);
  });
}
