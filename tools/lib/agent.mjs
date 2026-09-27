// Operations shared by the MCP server and the CLI. Everything reads and writes
// data/project.json (the house layout + model inventory).
//
// Vision rule: every item an agent adds or changes is saved as `verified: false`.
// It can only be verified after the agent has rendered its current version
// (renders are tracked in .roomcraft/renders.json), so the agent must look first.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './server.mjs';
import { scrapeProduct, guessCategory } from '../../worker/src/scrape.js';
import { colorFromName } from '../../shared/colors.js';

export const PROJECT = path.join(ROOT, 'data', 'project.json');
const STATE_DIR = path.join(ROOT, '.roomcraft');
const RENDERS = path.join(STATE_DIR, 'renders.json');

export const CATEGORIES = ['sofa', 'armchair', 'chair', 'stool', 'ottoman', 'bed', 'wardrobe', 'bookshelf', 'dresser', 'nightstand', 'sideboard', 'tvstand', 'desk', 'table', 'coffeetable', 'sidetable', 'floorlamp', 'lamp', 'rug', 'plant', 'tv', 'mirror', 'curtain', 'box'];

export function loadProject() {
  return JSON.parse(fs.readFileSync(PROJECT, 'utf8'));
}

/** Save and bump the version so open browsers offer to load the change. */
export function saveProject(p) {
  p.version = (+p.version || 0) + 1;
  fs.writeFileSync(PROJECT, JSON.stringify(p, null, 2) + '\n');
  return p.version;
}

/** Fingerprint of everything that affects how an item looks. */
export function itemHash(item) {
  const { name, category, dims, colors, accent, modelUrl, useModel } = item;
  return crypto.createHash('sha1').update(JSON.stringify({ name, category, dims, colors, accent, modelUrl, useModel })).digest('hex').slice(0, 12);
}

function readRenders() {
  try {
    return JSON.parse(fs.readFileSync(RENDERS, 'utf8'));
  } catch {
    return {};
  }
}
function recordRender(item) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const r = readRenders();
  r[item.id] = { hash: itemHash(item), at: new Date().toISOString() };
  fs.writeFileSync(RENDERS, JSON.stringify(r, null, 2));
}

const toM = (cm) => (cm == null || cm === '' || !Number.isFinite(+cm) || +cm <= 0 ? undefined : +(+cm / 100).toFixed(4));
const hexOk = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
function normColors(list) {
  if (!Array.isArray(list)) return undefined;
  return list
    .map((c) => (typeof c === 'string' ? { name: c, hex: colorFromName(c) } : { name: String(c.name || c.hex || ''), hex: hexOk(c.hex) ? c.hex.toLowerCase() : colorFromName(c.name) }))
    .filter((c) => c.name && c.hex);
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'item';
}

// ---------- operations ----------

export async function readLink(url) {
  const product = await scrapeProduct(url);
  let image = null;
  if (product.image) {
    try {
      const r = await fetch(product.image, { headers: { 'user-agent': 'Mozilla/5.0 roomcraft' } });
      const type = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.ok && /^image\/(png|jpe?g|webp|gif)/.test(type) && buf.length < 4.5e6) image = { data: buf, mimeType: type.split(';')[0] };
    } catch {}
  }
  return { product, image };
}

export function listItems() {
  const p = loadProject();
  const renders = readRenders();
  return {
    version: p.version,
    inventory: p.inventory.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      size_cm: i.dims ? `${Math.round(i.dims.w * 100)} × ${Math.round(i.dims.d * 100)} × ${Math.round(i.dims.h * 100)}` : null,
      colors: (i.colors || []).map((c) => `${c.name} ${c.hex}`),
      modelUrl: i.modelUrl || undefined,
      verified: i.verified !== false,
      renderedCurrentVersion: renders[i.id]?.hash === itemHash(i),
    })),
    placed: (p.placed || []).map((q) => ({ id: q.id, itemId: q.itemId, x_cm: Math.round(q.x * 100), z_cm: Math.round(q.z * 100), rot: q.rot || 0, color: q.color })),
  };
}

/**
 * Add a model to the inventory. Fields in cm. `from_url` scrapes the product first;
 * explicit fields override what was scraped.
 */
export async function addItem(args) {
  let base = {};
  if (args.from_url) {
    const { product } = await readLink(args.from_url);
    base = {
      name: product.name, category: product.category, url: product.url, image: product.image, modelUrl: product.modelUrl,
      dims: product.dims, colors: product.colors?.map((c) => ({ name: c.name, hex: c.hex })),
      price: product.price, currency: product.currency,
    };
  }
  const p = loadProject();
  const name = String(args.name || base.name || 'New item').slice(0, 140);
  const category = CATEGORIES.includes(args.category) ? args.category : CATEGORIES.includes(base.category) && base.category !== 'box' ? base.category : guessCategory(name);
  const dims = { w: toM(args.width_cm) ?? base.dims?.w, d: toM(args.depth_cm) ?? base.dims?.d, h: toM(args.height_cm) ?? base.dims?.h };
  const missing = ['w', 'd', 'h'].filter((k) => !dims[k]);
  if (missing.length) throw new Error(`Missing size (${missing.map((k) => ({ w: 'width_cm', d: 'depth_cm', h: 'height_cm' })[k]).join(', ')}). Give the real product dimensions.`);
  const colors = normColors(args.colors) || base.colors || [];
  let id = args.id || `i-${slug(name)}`;
  while (p.inventory.some((i) => i.id === id)) id = `${id}-${crypto.randomBytes(2).toString('hex')}`;
  const item = {
    id, name, category, dims,
    colors: colors.length ? colors : [{ name: 'Default', hex: '#b8b2a7' }],
    ...(args.accent && hexOk(args.accent.hex) ? { accent: { name: args.accent.name || 'Accent', hex: args.accent.hex } } : {}),
    ...(args.url || base.url ? { url: args.url || base.url } : {}),
    ...(args.image || base.image ? { image: args.image || base.image } : {}),
    ...(args.model_url || base.modelUrl ? { modelUrl: args.model_url || base.modelUrl } : {}),
    ...(base.price ? { price: String(base.price), currency: base.currency || null } : {}),
    verified: false,
    addedBy: 'agent',
  };
  p.inventory.unshift(item);
  const version = saveProject(p);
  return { item, version };
}

export function updateItem(args) {
  const p = loadProject();
  const item = p.inventory.find((i) => i.id === args.id);
  if (!item) throw new Error(`No inventory item "${args.id}". Use list_items to see ids.`);
  if (args.name) item.name = String(args.name).slice(0, 140);
  if (args.category) {
    if (!CATEGORIES.includes(args.category)) throw new Error(`Unknown category "${args.category}". Use one of: ${CATEGORIES.join(', ')}`);
    item.category = args.category;
  }
  item.dims = { w: toM(args.width_cm) ?? item.dims?.w, d: toM(args.depth_cm) ?? item.dims?.d, h: toM(args.height_cm) ?? item.dims?.h };
  const colors = normColors(args.colors);
  if (colors?.length) {
    item.colors = colors;
    for (const q of p.placed || []) if (q.itemId === item.id && q.color && !q.color.startsWith('#') && !colors.some((c) => c.name === q.color)) q.color = colors[0].name;
  }
  if (args.accent === null) delete item.accent;
  else if (args.accent && hexOk(args.accent.hex)) item.accent = { name: args.accent.name || 'Accent', hex: args.accent.hex };
  if (args.model_url !== undefined) args.model_url ? (item.modelUrl = args.model_url) : delete item.modelUrl;
  if (args.image) item.image = args.image;
  if (args.url) item.url = args.url;
  item.verified = false;
  const version = saveProject(p);
  return { item, version };
}

/** Download a .glb into models/ so the repo keeps its own copy of the 3D model. */
export async function saveModelFile({ id, url }) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 roomcraft' } });
  if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 40e6) throw new Error('Model is larger than 40 MB; keep it as a URL instead.');
  if (buf.subarray(0, 4).toString() !== 'glTF') throw new Error('That file is not a binary glTF (.glb).');
  const p = loadProject();
  const item = p.inventory.find((i) => i.id === id);
  if (!item) throw new Error(`No inventory item "${id}".`);
  fs.mkdirSync(path.join(ROOT, 'models'), { recursive: true });
  const rel = `models/${slug(id)}.glb`;
  fs.writeFileSync(path.join(ROOT, rel), buf);
  item.modelUrl = rel;
  item.useModel = true;
  item.verified = false;
  const version = saveProject(p);
  return { item, file: rel, bytes: buf.length, version };
}

export async function renderItemImages(id, opts = {}) {
  const { renderItem } = await import('./render.mjs');
  const item = loadProject().inventory.find((i) => i.id === id);
  if (!item) throw new Error(`No inventory item "${id}".`);
  const shots = await renderItem(id, opts);
  recordRender(item);
  return { item, shots };
}

export async function renderRoomImages(opts = {}) {
  const { renderRoom } = await import('./render.mjs');
  return renderRoom(opts);
}

/** Mark an item verified. Refuses unless the current version was rendered (i.e. looked at). */
export function verifyItem({ id, matches, notes }) {
  const p = loadProject();
  const item = p.inventory.find((i) => i.id === id);
  if (!item) throw new Error(`No inventory item "${id}".`);
  const r = readRenders()[id];
  if (!r || r.hash !== itemHash(item))
    throw new Error('This item has not been rendered since its last change. Render it (render_item), look at the images and compare with the product photo, then verify.');
  if (!notes || String(notes).trim().length < 10) throw new Error('Describe what you compared in the renders (shape, proportions, colours, size) in `notes`.');
  if (matches) {
    item.verified = true;
    item.verifiedNotes = String(notes).slice(0, 500);
    item.verifiedAt = new Date().toISOString();
  } else {
    item.verified = false;
    item.verifiedNotes = `Mismatch: ${String(notes).slice(0, 480)}`;
  }
  const version = saveProject(p);
  return { item, version };
}
