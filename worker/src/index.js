// Cloudflare Worker: product-link scraper + CORS proxy for 3D models/images.
//
//   GET /scrape?url=<product page>   → JSON product info (name, dims in metres, colours, modelUrl…)
//   GET /asset?url=<glb|gltf|bin|image> → the file, with CORS headers, so three.js can load it
//
// ALLOWED_ORIGINS (wrangler.toml var) limits which sites may call the worker.

import { scrapeProduct } from './scrape.js';

const ASSET_TYPES = /\.(glb|gltf|bin|png|jpe?g|webp|avif|ktx2)(\?|$)/i;
const ASSET_MIME = /^(model\/|image\/|application\/octet-stream|application\/json|binary\/octet-stream)/i;
const MAX_ASSET_BYTES = 60 * 1024 * 1024;

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ok,
    headers: {
      'access-control-allow-origin': ok ? origin || '*' : 'null',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      vary: 'origin',
    },
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

function targetUrl(request) {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) throw new Error('Missing ?url=');
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs are allowed.');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) throw new Error('Private addresses are not allowed.');
  return u;
}

export default {
  async fetch(request, env, ctx) {
    const { ok, headers } = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!ok) return json({ ok: false, error: 'Origin not allowed. Add it to ALLOWED_ORIGINS.' }, 403, headers);
    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    try {
      if (path === '' || path === '/health') return json({ ok: true, service: 'room-planner-worker' }, 200, headers);

      if (path === '/scrape') {
        const target = targetUrl(request);
        const cache = caches.default;
        const cacheKey = new Request(`https://cache.local/scrape?url=${encodeURIComponent(target.href)}`);
        const hit = await cache.match(cacheKey);
        if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...headers } });
        const product = await scrapeProduct(target.href);
        const res = json({ ok: true, product }, 200, { ...headers, 'cache-control': 'public, max-age=86400' });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      }

      if (path === '/asset') {
        const target = targetUrl(request);
        const upstream = await fetch(target.href, {
          headers: { 'user-agent': 'Mozilla/5.0 room-planner', accept: '*/*' },
          cf: { cacheTtl: 86400, cacheEverything: true },
        });
        const type = upstream.headers.get('content-type') || '';
        if (!upstream.ok) return json({ ok: false, error: `Upstream HTTP ${upstream.status}` }, 502, headers);
        if (!ASSET_TYPES.test(target.pathname) && !ASSET_MIME.test(type)) {
          return json({ ok: false, error: 'Only 3D model and image files can be proxied.' }, 415, headers);
        }
        const len = +(upstream.headers.get('content-length') || 0);
        if (len > MAX_ASSET_BYTES) return json({ ok: false, error: 'File too large.' }, 413, headers);
        return new Response(upstream.body, {
          status: 200,
          headers: { ...headers, 'content-type': type || 'application/octet-stream', 'cache-control': 'public, max-age=86400' },
        });
      }

      return json({ ok: false, error: 'Not found' }, 404, headers);
    } catch (err) {
      return json({ ok: false, error: err?.message || String(err) }, 400, headers);
    }
  },
};
