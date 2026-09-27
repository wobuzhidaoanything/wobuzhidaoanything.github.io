// Operations shared by the MCP server and the CLI. They work on this device's design store
// (userdata/ folder, see paths.mjs): house designs and the furniture model library.
//
// Vision rule: every model an agent adds or changes is saved as `verified: false`, and
// can only be verified after its current version has been rendered (tracked in
// userdata/.state/renders.json) — so the agent must look at it first. Layout changes return
// renders of every floor for the same reason.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MODELS, STATE, EXPORTS as EXPORT_DIR } from './paths.mjs';
import * as store from './store.mjs';
import { scrapeProduct, guessCategory } from '../../shared/scrape.js';
import { colorFromName } from '../../shared/colors.js';
import { migrate, normalize, validate, elevations, stairLayout, wallFrame } from '../../js/design.js';
import { detectRooms } from '../../js/plan.js';

const STATE_DIR = STATE;
const RENDERS = path.join(STATE_DIR, 'renders.json');
export const EXPORTS = EXPORT_DIR;

export const CATEGORIES = ['sofa', 'armchair', 'chair', 'stool', 'ottoman', 'bed', 'wardrobe', 'bookshelf', 'dresser', 'nightstand', 'sideboard', 'tvstand', 'desk', 'table', 'coffeetable', 'sidetable', 'floorlamp', 'lamp', 'rug', 'plant', 'tv', 'mirror', 'curtain', 'box'];

const rid = (p) => `${p}-${crypto.randomBytes(3).toString('hex')}`;
const cm = (m) => Math.round(m * 1000) / 10;

/** Fingerprint of everything that affects how a model looks. */
export function itemHash(item) {
  const { name, category, dims, colors, accent, modelUrl, useModel, component, componentVersion } = item;
  return crypto.createHash('sha1').update(JSON.stringify({ name, category, dims, colors, accent, modelUrl, useModel, component, componentVersion })).digest('hex').slice(0, 12);
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

const toM = (v) => (v == null || v === '' || !Number.isFinite(+v) || +v <= 0 ? undefined : +(+v / 100).toFixed(4));
const hexOk = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
function normColors(list) {
  if (!Array.isArray(list)) return undefined;
  return list
    .map((c) => (typeof c === 'string' ? { name: c, hex: colorFromName(c) } : { name: String(c.name || c.hex || ''), hex: hexOk(c.hex) ? c.hex.toLowerCase() : colorFromName(c.name) }))
    .filter((c) => c.name && c.hex);
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'item';

function withLibrary(fn) {
  store.ensureStore();
  const lib = store.getLibrary();
  lib.items ||= [];
  const out = fn(lib);
  store.saveLibrary(lib);
  return out;
}

// ---------- links & models ----------

export async function readLink(url, { maxImages = 6 } = {}) {
  const product = await scrapeProduct(url);
  const urls = [...new Set([product.image, ...(product.images || [])].filter(Boolean))].slice(0, maxImages);
  const fetched = await Promise.all(
    urls.map(async (u) => {
      try {
        const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 roomcraft' }, signal: AbortSignal.timeout(15000) });
        const type = r.headers.get('content-type') || '';
        const buf = Buffer.from(await r.arrayBuffer());
        if (r.ok && /^image\/(png|jpe?g|webp|gif)/.test(type) && buf.length < 3.5e6) return { url: u, data: buf, mimeType: type.split(';')[0] };
      } catch {}
      return null;
    })
  );
  const images = fetched.filter(Boolean);
  return { product, image: images[0] || null, images };
}

export function listModels() {
  store.ensureStore();
  const renders = readRenders();
  return store.getLibrary().items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    size_cm: i.dims ? `${cm(i.dims.w)} × ${cm(i.dims.d)} × ${cm(i.dims.h)}` : null,
    colors: (i.colors || []).map((c) => `${c.name} ${c.hex}`),
    modelUrl: i.modelUrl || undefined,
    verified: i.verified !== false,
    renderedCurrentVersion: renders[i.id]?.hash === itemHash(i),
  }));
}

/** Add a model to the library. Sizes in cm. `from_url` reads a product page first; explicit fields win. */
export async function addItem(args) {
  let base = {};
  if (args.from_url) {
    const { product } = await readLink(args.from_url, { maxImages: 0 });
    base = { name: product.name, category: product.category, url: product.url, image: product.image, modelUrl: product.modelUrl, dims: product.dims, colors: product.colors?.map((c) => ({ name: c.name, hex: c.hex })), price: product.price, currency: product.currency };
  }
  const name = String(args.name || base.name || 'New model').slice(0, 140);
  const category = CATEGORIES.includes(args.category) ? args.category : CATEGORIES.includes(base.category) && base.category !== 'box' ? base.category : guessCategory(name);
  const dims = { w: toM(args.width_cm) ?? base.dims?.w, d: toM(args.depth_cm) ?? base.dims?.d, h: toM(args.height_cm) ?? base.dims?.h };
  const missing = ['w', 'd', 'h'].filter((k) => !dims[k]);
  if (missing.length) throw new Error(`Missing size (${missing.map((k) => ({ w: 'width_cm', d: 'depth_cm', h: 'height_cm' })[k]).join(', ')}). Give the real product dimensions.`);
  const colors = normColors(args.colors) || base.colors || [];
  return withLibrary((lib) => {
    let id = args.id || `i-${slug(name)}`;
    while (lib.items.some((i) => i.id === id)) id = `${id}-${crypto.randomBytes(2).toString('hex')}`;
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
    lib.items.unshift(item);
    return { item };
  });
}

export function updateItem(args) {
  return withLibrary((lib) => {
    const item = lib.items.find((i) => i.id === args.id);
    if (!item) throw new Error(`No model "${args.id}". Use list_models to see ids.`);
    if (args.name) item.name = String(args.name).slice(0, 140);
    if (args.category) {
      if (!CATEGORIES.includes(args.category)) throw new Error(`Unknown category "${args.category}". Use one of: ${CATEGORIES.join(', ')}`);
      item.category = args.category;
    }
    item.dims = { w: toM(args.width_cm) ?? item.dims?.w, d: toM(args.depth_cm) ?? item.dims?.d, h: toM(args.height_cm) ?? item.dims?.h };
    const colors = normColors(args.colors);
    if (colors?.length) item.colors = colors;
    if (args.accent === null) delete item.accent;
    else if (args.accent && hexOk(args.accent.hex)) item.accent = { name: args.accent.name || 'Accent', hex: args.accent.hex };
    if (args.model_url !== undefined) args.model_url ? (item.modelUrl = args.model_url) : delete item.modelUrl;
    if (args.image) item.image = args.image;
    if (args.url) item.url = args.url;
    item.verified = false;
    return { item };
  });
}

/**
 * Save a model written as a React Three Fiber component (userdata/models/<id>.jsx) and use it
 * for the item. The code is compiled first, so syntax errors and bad imports come back as errors.
 */
export async function writeModelComponent({ id, code }) {
  const { compileSource, componentPath } = await import('./r3f.mjs');
  if (!store.getLibrary().items?.some((i) => i.id === id)) throw new Error(`No model "${id}". Create it first with add_item, then write its component.`);
  if (String(code || '').length > 150 * 1024) throw new Error('The component is over 150 KB of code. Use loops/arrays for repeated parts (slats, buttons, legs) instead of writing each one out.');
  await compileSource(String(code || ''), `${id}.jsx`);
  const f = componentPath(id);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, code);
  const version = crypto.createHash('sha1').update(code).digest('hex').slice(0, 10);
  return withLibrary((lib) => {
    const item = lib.items.find((i) => i.id === id);
    Object.assign(item, { component: `models/${id}.jsx`, componentVersion: version, useModel: true, verified: false });
    return { item, file: path.relative(process.cwd(), f) };
  });
}

/** The component source of an item, if it has one. */
export async function readModelComponent(id) {
  const { componentPath } = await import('./r3f.mjs');
  const f = componentPath(id);
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8');
}

/** Download a .glb into userdata/models/ (served at /models/…) so the model has a permanent local copy. */
export async function saveModelFile({ id, url }) {
  if (!store.getLibrary().items?.some((i) => i.id === id)) throw new Error(`No model "${id}".`);
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 roomcraft' } });
  if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
  const raw = Buffer.from(await r.arrayBuffer());
  if (raw.length > 200e6) throw new Error('That file is over 200 MB; build the model with write_model_component instead.');
  if (raw.subarray(0, 4).toString() !== 'glTF') throw new Error('That file is not a binary glTF (.glb).');
  // Keep it within the storage budget: clean up, shrink textures, simplify only if needed, compress
  const { shrinkGLB } = await import('./shrink.mjs');
  const { blankPage } = await import('./render.mjs');
  const page = await blankPage().catch(() => null);
  let result;
  try {
    result = await shrinkGLB(raw, { page });
  } finally {
    await page?.close().catch(() => {});
  }
  fs.mkdirSync(MODELS, { recursive: true });
  const rel = `models/${slug(id)}.glb`;
  fs.writeFileSync(path.join(MODELS, `${slug(id)}.glb`), result.buf);
  return withLibrary((lib) => {
    const item = lib.items.find((i) => i.id === id);
    Object.assign(item, { modelUrl: rel, useModel: true, verified: false });
    return { item, file: rel, bytes: result.after, before: result.before, triangles: result.triangles, steps: result.steps };
  });
}

export async function renderItemImages(id, opts = {}) {
  const { renderItem } = await import('./render.mjs');
  const item = store.getLibrary().items.find((i) => i.id === id);
  if (!item) throw new Error(`No model "${id}".`);
  const shots = await renderItem(id, opts);
  recordRender(item);
  return { item, shots, stats: shots.stats };
}

/** Record a visual check. Refused unless the current version was rendered (i.e. looked at). */
export function verifyItem({ id, matches, notes }) {
  const item = store.getLibrary().items.find((i) => i.id === id);
  if (!item) throw new Error(`No model "${id}".`);
  const r = readRenders()[id];
  if (!r || r.hash !== itemHash(item)) throw new Error('This model has not been rendered since its last change. Render it (render_item), look at the images and compare them with the product photo, then verify.');
  if (!notes || String(notes).trim().length < 10) throw new Error('Describe what you compared in the renders (shape, proportions, colours, size) in `notes`.');
  return withLibrary((lib) => {
    const it = lib.items.find((i) => i.id === id);
    if (matches) Object.assign(it, { verified: true, verifiedNotes: String(notes).slice(0, 500), verifiedAt: new Date().toISOString() });
    else Object.assign(it, { verified: false, verifiedNotes: `Mismatch: ${String(notes).slice(0, 480)}` });
    return { item: it };
  });
}

// ---------- designs ----------

export function listDesigns() {
  store.ensureStore();
  return { active: store.getActive(), designs: store.listDesigns() };
}

const resolveId = (id) => id || store.getActive() || (() => { throw new Error('No designs yet. Run npm start once, or create one with write_design.'); })();

/** A human-readable summary + the full JSON of a design. */
export function getDesign(id) {
  store.ensureStore();
  const d = store.getDesign(resolveId(id));
  const ys = elevations(d);
  const summary = d.floors.map((f, i) => ({
    index: i, id: f.id, name: f.name, level_cm: cm(ys[i]), ceiling_cm: cm(f.height), slab_cm: cm(f.slab),
    walls: f.walls.length, rooms: f.rooms.map((r) => r.name || r.id), openings: f.openings.length, stairs: f.stairs.length, furniture: f.placed.length,
  }));
  return { summary: { id: d.id, name: d.name, floors: summary }, design: d, problems: validate({ ...d, inventory: store.getLibrary().items }) };
}

/**
 * Save a whole design (format 2, metres). Normalizes, auto-detects rooms on floors that have
 * none (if `detect_rooms`), validates, and makes it the active design so the open app shows it.
 */
export function writeDesign(json, { detect_rooms = true, activate = true } = {}) {
  store.ensureStore();
  let d = typeof json === 'string' ? JSON.parse(json) : json;
  d = migrate({ ...d, format: d.format ?? 2 });
  d.id ||= rid('d');
  if (detect_rooms) {
    for (const f of d.floors) {
      if (f.rooms.length || !f.walls.length) continue;
      f.rooms = detectRooms(f).map((pts, i) => ({ id: rid('r'), name: `Room ${i + 1}`, points: pts, floorKind: 'wood', floorColor: '#c49a6c' }));
    }
  }
  d = normalize(d);
  const problems = validate({ ...d, inventory: store.getLibrary().items });
  const saved = store.saveDesign(d, { by: 'agent' });
  if (activate) store.setActive(saved.id);
  return { id: saved.id, problems, floors: saved.floors.map((f) => `${f.name}: ${f.walls.length} walls, ${f.rooms.length} rooms, ${f.openings.length} openings, ${f.stairs.length} stairs, ${f.placed.length} items`) };
}

/** Stair numbers for a design floor (so agents can plan stairwells that fit). */
export function stairInfo(id, floorIndex = 0, shape = 'straight', width_cm = 100) {
  const d = store.getDesign(resolveId(id));
  const ys = elevations(d);
  if (floorIndex >= d.floors.length - 1) throw new Error('Stairs need a floor above.');
  const L = stairLayout({ shape, width: width_cm / 100, turn: 'left' }, ys[floorIndex + 1] - ys[floorIndex]);
  return { steps: L.n, riser_mm: Math.round(L.riser * 1000), tread_mm: Math.round(L.going * 1000), footprint_cm: { width: cm(L.box.maxX - L.box.minX), length: cm(L.box.maxZ - L.box.minZ) }, note: 'Stair origin = bottom-centre of the first step; rot 0 climbs toward −z. Leave ~95 cm clear floor at the bottom and top.' };
}

export async function renderDesignImages(id, { floors, views = ['plan', '3d'], exterior = false } = {}) {
  const { renderDesign } = await import('./render.mjs');
  const did = resolveId(id);
  const d = store.getDesign(did);
  const idx = floors?.length ? floors : d.floors.map((_, i) => i);
  const specs = [];
  for (const i of idx) for (const v of views) specs.push(`${v}:${i}`);
  if (exterior) specs.push('exterior');
  return renderDesign(did, specs);
}

export async function exportGLB(id, file) {
  const { exportDesignGLB } = await import('./render.mjs');
  const did = resolveId(id);
  const d = store.getDesign(did);
  const buf = await exportDesignGLB(did);
  fs.mkdirSync(EXPORTS, { recursive: true });
  const out = path.resolve(file || path.join(EXPORTS, `${slug(d.name)}.glb`));
  fs.writeFileSync(out, buf);
  return { file: out, bytes: buf.length };
}

// ---------- placing furniture (agents editing layouts) ----------

export function placeItem({ design, floor = 0, item, x_cm, z_cm, rot = 0, color, lift_cm = 0 }) {
  const did = resolveId(design);
  const d = store.getDesign(did);
  const f = d.floors[floor];
  if (!f) throw new Error(`No floor ${floor}`);
  const it = store.getLibrary().items.find((i) => i.id === item);
  if (!it) throw new Error(`No model "${item}" in the library (list_models).`);
  const p = { id: rid('p'), itemId: item, x: +(x_cm / 100).toFixed(3), z: +(z_cm / 100).toFixed(3), rot: ((+rot % 360) + 360) % 360, color: color || it.colors?.[0]?.name || null, ...(lift_cm ? { y: lift_cm / 100 } : {}) };
  f.placed.push(p);
  store.saveDesign(d, { by: 'agent' });
  return { placed: p };
}

export { wallFrame };
