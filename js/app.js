import { Viewer, webglSupport } from './viewer.js';
import { Walker } from './walk.js';
import { Tools } from './tools.js';
import { createChat } from './chat.js';
import { Measure } from './measure.js';
import { Paint } from './paint.js';
import { FINISH_NAMES } from './materials.js';
import { sunPosition, sunVector } from './sun.js';
import { analyse as analyseClearance, zoneStatus, doorSwing, footprintRect } from './clearance.js';
import { setQuality } from './effects.js';
import { CATEGORY_LABELS, DEFAULT_DIMS } from './models.js';
import { openStorage } from './storage.js';
import { newHouse, newFloor, normalize, migrate, elevations, wallFrame, area, pointInPolygon, closestOnSegment, validate, DEFAULTS } from './design.js';
import { footprint } from './plan.js';
import { cleanFloor, syncRooms, splitWall, moveOpening, insideSign } from './edit.js';
import { colorFromName } from '../shared/colors.js';
import { guessCategory } from '../shared/scrape.js';
import { describeChange } from './diff.js';
import { mountUI } from '../ui/main.js';
import { openDialog } from '../ui/store.js';
import { DISPLAY } from '../ui/Stage.js';

const $ = (s, el = document) => el.querySelector(s);
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
const cm = (m) => (m == null ? '?' : Math.round(m * 1000) / 10);
const pref = {
  get(k, d) {
    try {
      const v = localStorage.getItem('roomcraft.pref.' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('roomcraft.pref.' + k, JSON.stringify(v));
    } catch {}
  },
};

let store;
let design;
let library = { items: [] };
let viewer, walker, tools;
const ui = {
  editing: false, tool: null, pickedColor: {}, queue: [],
  quality: pref.get('quality', matchMedia('(pointer: coarse)').matches ? 'low' : 'high'),
  wallExterior: false, wallThickness: DEFAULTS.interiorWall, stairShape: 'straight', stairTurn: 'left',
  doorWidth: 0.9, windowWidth: 1.2, openingWidth: 1.0, hover: '', hintText: '', coords: '', agents: 0, view: '3d',
};
const history = { stack: [], index: -1 };

// ---------- lookups ----------

const floorNow = () => design.floors[viewer.activeFloor];
const itemById = (id) => library.items.find((i) => i.id === id);
const findPlaced = (id) => {
  for (const f of design.floors) {
    const p = f.placed.find((x) => x.id === id);
    if (p) return { p, floor: f };
  }
  return {};
};
const dimsOf = (item) => {
  const def = DEFAULT_DIMS[item.category] || [0.6, 0.6, 0.6];
  return { w: item.dims?.w || def[0], d: item.dims?.d || def[1], h: item.dims?.h || def[2] };
};
const colorOf = (item, p) => item.colors?.find((c) => c.name === p?.color) || (p?.color?.startsWith?.('#') ? { name: 'Custom', hex: p.color } : item.colors?.[0]);

/**
 * After any change to walls: no zero-length or duplicate walls, openings
 * inside their walls, rooms re-detected (keeping names and finishes).
 */
function tidy(floor = floorNow()) {
  const r = cleanFloor(floor);
  syncRooms(floor);
  if (r.droppedOpenings.length) toast(`${r.droppedOpenings.length} door/window${r.droppedOpenings.length > 1 ? 's' : ''} no longer fit and ${r.droppedOpenings.length > 1 ? 'were' : 'was'} removed.`, { undo: true });
  return r;
}

// ---------- saving & undo ----------

let saveTimer, libTimer, lastSaved = null, lastLibSave = 0;
function scheduleSave(delay = 400) {
  clearTimeout(saveTimer);
  setSaveState('saving');
  saveTimer = setTimeout(saveNow, delay);
}

/**
 * Save now. Never loses work: if the server is down it keeps retrying (with a banner); if an
 * agent or another window saved a newer version meanwhile, that version is shown and yours is
 * kept in History.
 */
async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    lastSaved = await store.save(design, store.kind === 'device' ? lastSaved : undefined);
    design.updatedAt = lastSaved;
    if (!saveTimer) setSaveState('saved');
    saveThumb();
    if (reactUI?.state.banner) {
      reactUI.set({ banner: null });
      toast('Saved. Everything is up to date again.');
    }
  } catch (err) {
    if (err.conflict && err.current) {
      const mine = structuredClone(design);
      await store.keep?.(mine).catch(() => {});
      design = err.current;
      lastSaved = design.updatedAt;
      viewer.setDesign(design, { force: true });
      resetHistory();
      renderAll();
      toast(`${design.updatedBy === 'agent' ? 'Your AI agent' : 'Another window'} changed this design at the same time. Showing that version; yours is kept in History (Designs → History).`, { action: ['History', () => openHistory(design.id)] });
    } else {
      setSaveState('error');
      reactUI?.set({ banner: err.offline ? 'Not saved yet: Roomcraft’s server isn’t running. Start it again with npm start; your changes are kept here and will save automatically.' : `Not saved yet (${err.message}). Retrying…` });
      scheduleSave(3000);
    }
  }
}

// Leaving the page: save anything pending right away
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveTimer && saveNow());
window.addEventListener('beforeunload', (e) => {
  if (saveTimer || reactUI?.state.banner) {
    saveNow();
    e.preventDefault();
  }
});
function scheduleLibrarySave() {
  clearTimeout(libTimer);
  libTimer = setTimeout(() => {
    lastLibSave = Date.now();
    store.saveLibrary(library).catch((err) => toast(`Couldn't save models: ${err.message}`));
  }, 400);
}

const snapshot = () => JSON.stringify({ design: { ...design, updatedAt: undefined, updatedBy: undefined }, library });

/** Record an undo step, save, and redraw. */
function commit({ lib = false, rebuild = true } = {}) {
  const snap = snapshot();
  if (history.stack[history.index] !== snap) {
    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(snap);
    if (history.stack.length > 100) history.stack.shift();
    history.index = history.stack.length - 1;
  }
  scheduleSave();
  if (lib) scheduleLibrarySave();
  if (rebuild) viewer.setDesign(design);
  else viewer.syncFurniture();
  renderAll();
}

function restore(i) {
  if (i < 0 || i >= history.stack.length) return;
  history.index = i;
  const snap = JSON.parse(history.stack[i]);
  const libChanged = JSON.stringify(snap.library) !== JSON.stringify(library);
  design = normalize(snap.design);
  library = snap.library;
  viewer.library = library.items;
  scheduleSave();
  if (libChanged) scheduleLibrarySave();
  viewer.setDesign(design);
  renderAll();
}

function resetHistory() {
  history.stack = [];
  history.index = -1;
  commit({ rebuild: false });
}

// ---------- rendering ----------

function renderAll() {
  refreshClearance();
  applySun();
  if (viewer.view === 'elevation') viewer.buildElevationDims();
  updateHint();
  reactUI?.bump();
}

// Parts of the screen redraw on their own (see js/ui/store.jsx)
const renderInspector = () => reactUI?.bump('inspector');
const renderPanels = () => reactUI?.bump('main');

/** The status bar: what a click will do right now. */
function updateHint() {
  const v = viewer.view;
  const t = ui.tool;
  ui.hintText = ui.hover
    ? ui.hover
    : v === 'elevation'
      ? 'Drag furniture along the wall or up and down (e.g. to hang a TV) · scroll to zoom · drag the background to pan · Esc to go back'
      : t === 'measure'
        ? {
            distance: 'Click two points to measure between them · Shift locks to one direction · Alt ignores corners · Esc cancels',
            path: 'Click points along a line or curve · double-click or Enter to finish · Esc cancels',
            surface: 'Click two points: the length is measured along the surface between them (follows curves) · Esc cancels',
          }[measure.mode]
        : v === 'walk'
          ? ''
          : t === 'wall'
            ? 'Click to start a wall, click again for each corner · click the start point, double-click or Esc to finish · Shift for free angles'
            : t && ['door', 'window', 'opening'].includes(t)
              ? `Click a wall to add ${t === 'opening' ? 'an opening' : `a ${t}`}`
              : t === 'stairs'
                ? 'Click where the stairs start; they climb away from you (rotate them afterwards)'
                : ui.editing
                  ? 'Drag corners, walls, doors and stairs · double-click a wall to add a corner · V W D N O S pick tools · E to finish'
                  : v === 'plan'
                    ? 'Drag furniture to move it · drag the blue dot to rotate · scroll to zoom · drag to pan'
                    : 'Drag furniture to move it · drag the blue dot to rotate · drag to orbit · right-drag to pan';
  reactUI?.bump('status');
}

function setHint(text) {
  ui.hintText = text;
  reactUI?.bump('status');
}

// ---------- level tabs & tool options ----------

function setDisplay(k, on) {
  viewer.setDisplay(k, on);
  if (k === 'clear') refreshClearance();
  pref.set('display', viewer.display);
  renderPanels();
}

/** Straight-on view of one wall (from inside the room by default). */
function openElevation(wallId, side) {
  const f = floorNow();
  const w = f.walls.find((x) => x.id === wallId);
  if (!w) return;
  if (ui.tool) setTool(null);
  if (viewer.split) viewer.setSplit(false);
  ui.beforeElevation ||= ui.view || viewer.view;
  viewer.setElevation(wallId, side ?? insideSign(f, w));
  renderAll();
}

function closeElevation() {
  const back = ui.beforeElevation || '3d';
  ui.beforeElevation = null;
  setView(back === 'elevation' ? '3d' : back);
}

function setFloor(i) {
  if (i < 0 || i >= design.floors.length) return;
  viewer.setShowAll(false);
  viewer.setActiveFloor(i);
  if (viewer.view === 'walk') walker.start(viewer.activeFloor);
  renderAll();
}

/** Options for the active tool, floating over the view (like a CAD options bar). */
// ---------- furniture inventory ----------

const placedCount = (itemId) => design.floors.reduce((n, f) => n + f.placed.filter((p) => p.itemId === itemId).length, 0);

// ---------- clearances ----------

/** Clearance problems on the active floor (for the overlay, the panels and the Check list). */
function clearanceProblems(f = floorNow()) {
  return analyseClearance(f, itemById, dimsOf);
}

function refreshClearance({ dragging = false } = {}) {
  if (!viewer.display.clear || viewer.view === 'walk' || ui.editing) return viewer.setClearance(null);
  const f = floorNow();
  const probs = clearanceProblems(f);
  const bad = new Set(probs.map((x) => x.placedId));
  const sel = new Set(viewer.selectedItems());
  const zones = [];
  const rects = [];
  for (const p of f.placed) {
    const item = itemById(p.itemId);
    if (!item) continue;
    const dims = dimsOf(item);
    if (bad.has(p.id)) rects.push(footprintRect(p, dims));
    if (sel.has(p.id)) zones.push(...zoneStatus(f, p.id, itemById, dimsOf));
  }
  // Door swings: while furniture is selected or moved, and any that are blocked
  const swings = [];
  for (const o of f.openings) {
    const poly = doorSwing(f, o);
    if (!poly) continue;
    const blocked = probs.some((x) => x.door === o.id);
    if (blocked || sel.size || dragging) swings.push({ poly, bad: blocked });
  }
  viewer.setClearance({ zones, swings, problems: rects });
}

// ---------- several items: align, distribute, lock ----------

/** Plan footprint extents of a placed item, taking its rotation into account. */
function extentOf(p) {
  const d = dimsOf(itemById(p.itemId));
  const a = ((p.rot || 0) * Math.PI) / 180;
  const hx = (Math.abs(Math.cos(a)) * d.w + Math.abs(Math.sin(a)) * d.d) / 2;
  const hz = (Math.abs(Math.sin(a)) * d.w + Math.abs(Math.cos(a)) * d.d) / 2;
  return { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz, hx, hz };
}

const selectedPlaced = () => viewer.selectedItems().map((id) => findPlaced(id).p).filter(Boolean);

function alignItems(mode) {
  const ps = selectedPlaced().filter((p) => !p.locked);
  if (ps.length < 2) return toast('Select at least two unlocked items.');
  const ex = ps.map((p) => ({ p, e: extentOf(p) }));
  const min = (k) => Math.min(...ex.map((x) => x.e[k])), max = (k) => Math.max(...ex.map((x) => x.e[k]));
  if (mode === 'left') ex.forEach(({ p, e }) => (p.x = min('x0') + e.hx));
  if (mode === 'right') ex.forEach(({ p, e }) => (p.x = max('x1') - e.hx));
  if (mode === 'cx') ex.forEach(({ p }) => (p.x = (min('x0') + max('x1')) / 2));
  if (mode === 'top') ex.forEach(({ p, e }) => (p.z = min('z0') + e.hz));
  if (mode === 'bottom') ex.forEach(({ p, e }) => (p.z = max('z1') - e.hz));
  if (mode === 'cz') ex.forEach(({ p }) => (p.z = (min('z0') + max('z1')) / 2));
  if (mode === 'dx' || mode === 'dz') {
    // Equal gaps between neighbours, keeping the outermost two where they are
    const [a0, a1, h] = mode === 'dx' ? ['x0', 'x1', 'hx'] : ['z0', 'z1', 'hz'];
    const k = mode === 'dx' ? 'x' : 'z';
    ex.sort((u, v) => u.e[a0] - v.e[a0]);
    const span = ex.at(-1).e[a1] - ex[0].e[a0];
    const gap = (span - ex.reduce((s, x) => s + 2 * x.e[h], 0)) / (ex.length - 1);
    let at = ex[0].e[a0];
    for (const x of ex) (x.p[k] = at + x.e[h]), (at += 2 * x.e[h] + gap);
  }
  for (const p of ps) (p.x = +p.x.toFixed(3)), (p.z = +p.z.toFixed(3));
  commit({ rebuild: false });
}

function rotateGroup(deg) {
  const ps = selectedPlaced().filter((p) => !p.locked);
  if (!ps.length) return;
  const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.z, 0) / ps.length;
  const a = (deg * Math.PI) / 180;
  for (const p of ps) {
    const dx = p.x - cx, dz = p.z - cz;
    // Plan rotation matching the items' own turn direction (rot increases clockwise seen from above)
    p.x = +(cx + dx * Math.cos(a) + dz * Math.sin(a)).toFixed(3);
    p.z = +(cz - dx * Math.sin(a) + dz * Math.cos(a)).toFixed(3);
    p.rot = ((((p.rot || 0) + deg) % 360) + 360) % 360;
  }
  commit({ rebuild: false });
}

function toggleLock() {
  const ps = selectedPlaced();
  if (!ps.length) return;
  const lock = !ps.every((p) => p.locked);
  for (const p of ps) lock ? (p.locked = true) : delete p.locked;
  commit({ rebuild: false });
  toast(lock ? `Locked ${ps.length > 1 ? `${ps.length} items` : 'it'}: it can't be moved or removed until you unlock it.` : 'Unlocked.');
}

let clipboard = null;
function copyItems() {
  const ps = selectedPlaced();
  if (!ps.length) return;
  const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.z, 0) / ps.length;
  clipboard = ps.map((p) => ({ ...p, dx: p.x - cx, dz: p.z - cz }));
  toast(`Copied ${ps.length > 1 ? `${ps.length} items` : itemById(ps[0].itemId)?.name || 'item'}. Ctrl+V pastes at the pointer.`);
}

function pasteItems({ offset = false } = {}) {
  if (!clipboard?.length) return toast('Nothing copied yet. Select furniture and press Ctrl+C.');
  const f = floorNow();
  const at = !offset && ui.pointer ? ui.pointer : [clipboard[0].x - clipboard[0].dx + 0.3, clipboard[0].z - clipboard[0].dz + 0.3];
  const ids = [];
  for (const c of clipboard) {
    const { dx, dz, locked, ...rest } = c;
    const q = { ...rest, id: uid('p'), x: +(at[0] + dx).toFixed(3), z: +(at[1] + dz).toFixed(3) };
    f.placed.push(q);
    ids.push(q.id);
  }
  commit({ rebuild: false });
  viewer.select(ids.length > 1 ? { type: 'items', ids } : { type: 'item', id: ids[0] });
}

function selectAllItems() {
  const ids = floorNow().placed.map((p) => p.id);
  if (ids.length) viewer.select(ids.length > 1 ? { type: 'items', ids } : { type: 'item', id: ids[0] });
}

/** Add a door, window or opening to wall `w`, centred on `at` (default: the middle of the wall). */
function addOpening(w, type, at) {
  const f = floorNow();
  const { len } = wallFrame(w);
  const width = Math.min(ui[type + 'Width'], len - 0.2);
  if (width < (type === 'door' ? 0.6 : 0.3)) return toast('This wall is too short for that.');
  const oid = uid('o');
  const mid = at || [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
  const probe = structuredClone(f);
  probe.openings.push({ id: oid, type, wall: w.id, offset: 0, width, height: 1, sill: 0 });
  if (!moveOpening(probe, oid, mid, { reach: 0.01 })) return toast('No free space left on this wall.');
  const offset = probe.openings.find((o) => o.id === oid).offset;
  f.openings.push({ id: oid, type, wall: w.id, offset, width, height: type === 'window' ? Math.min(1.3, f.height - 1) : Math.min(2.1, f.height - 0.1), sill: type === 'window' ? 0.9 : 0 });
  commit();
  viewer.select({ type: 'opening', id: oid });
}

/** Furniture total for the floors, against the budget from Settings. */
/** Problems on a floor, in words, for the Check list. */
function floorProblems(f, fi) {
  const ys = elevations(design);
  const list = validate(design)
    .filter((p) => p.startsWith(`floor "${f.name}"`) && !/refers to missing item/.test(p))
    .map((p) => p.replace(/^floor "[^"]*":?\s*/, '').replace(/ \b(wall|stairs|door|window|opening) [a-z]+-[a-z0-9]+/g, ' $1'));
  if (fi < design.floors.length - 1) for (const s of f.stairs) if (!tools.stairFits(s, ys[fi + 1] - ys[fi])) list.push('stairs cross a wall or leave the floor');
  for (const p of f.placed) if (!itemById(p.itemId)) list.push('a placed item has no model in your library');
  if (viewer.display.clear) for (const x of clearanceProblems(f)) list.push(x.message);
  if (!f.rooms.length && f.walls.length) list.push('no enclosed rooms yet: close the walls into a loop');
  return list;
}

// ---------- edit mode ----------

function setTool(name) {
  tools.set(name === 'measure' || name === 'paint' ? null : name);
  ui.tool = name;
  measure.set(name === 'measure');
  paint.set(name === 'paint');
  if (name && viewer.view === 'walk') setView('3d');
  renderAll();
}

function addFloorAbove() {
  const top = design.floors.at(-1);
  const f = newFloor(design.floors.length, { height: top.height });
  // Copy the exterior walls so the new storey sits on the one below.
  f.walls = top.walls.filter((w) => w.exterior).map((w) => ({ ...w, id: uid('w'), a: w.a.slice(), b: w.b.slice() }));
  if (!f.walls.length) f.walls = top.walls.map((w) => ({ ...w, id: uid('w'), a: w.a.slice(), b: w.b.slice() }));
  syncRooms(f);
  design.floors.push(f);
  commit();
  setFloor(design.floors.length - 1);
  toast(`${f.name} added. Place stairs on the floor below to reach it.`);
}

function deleteFloor() {
  const i = viewer.activeFloor;
  const f = design.floors[i];
  if (design.floors.length < 2) return;
  if (!confirm(`Delete ${f.name} with its walls, rooms and ${f.placed.length} items?`)) return;
  design.floors.splice(i, 1);
  viewer.activeFloor = Math.max(0, i - 1);
  commit();
  setFloor(viewer.activeFloor);
  toast('Floor deleted.', { undo: true });
}

function setEditing(on) {
  if (on && viewer.view === 'walk') setView('3d');
  ui.editing = on;
  if (!on && ui.tool) setTool(null);
  if (on && viewer.showAll) viewer.setShowAll(false);
  viewer.setEditMode(on);
  viewer.select(null);
  renderAll();
}

// ---------- furniture operations ----------

function rotateItem(p, delta) {
  p.rot = ((((p.rot || 0) + delta) % 360) + 360) % 360;
  viewer.syncFurniture();
  const rec = viewer.items.get(p.id);
  const c = rec && viewer.constrain(rec, p.x, p.z, false);
  if (c) Object.assign(p, { x: c.x, z: c.z });
  commit({ rebuild: false });
}

function footprintOf(p) {
  const it = itemById(p.itemId);
  if (!it) return null;
  const d = dimsOf(it);
  const a = ((p.rot || 0) * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(a)) * d.w) / 2 + (Math.abs(Math.sin(a)) * d.d) / 2;
  const hd = (Math.abs(Math.sin(a)) * d.w) / 2 + (Math.abs(Math.cos(a)) * d.d) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd, rug: it.category === 'rug' };
}

/** Nearest free floor spot (inside a room, clear of walls and furniture) to what the camera is looking at. */
function findSpot(item, floor) {
  const d = dimsOf(item);
  const regions = floor.rooms.length ? floor.rooms.map((r) => r.points) : footprint(floor).map((p) => p[0].slice(0, -1));
  if (!regions.length) return [0, 0];
  const tgt = viewer.controls.getTarget ? viewer.controls.getTarget(viewer.persp.position.clone()) : { x: 0, z: 0 };
  const others = floor.placed.map(footprintOf).filter((f) => f && !(item.category !== 'rug' && f.rug));
  const clear = (x, z) => {
    const corners = [[x - d.w / 2, z - d.d / 2], [x + d.w / 2, z - d.d / 2], [x + d.w / 2, z + d.d / 2], [x - d.w / 2, z + d.d / 2]];
    if (!regions.some((r) => corners.every(([px, pz]) => pointInPolygon(px, pz, r)))) return false;
    if (floor.walls.some((w) => corners.some((c) => closestOnSegment(c, w.a, w.b).dist < w.thickness / 2 + 0.02))) return false;
    return !others.some((f) => x + d.w / 2 > f.x0 && x - d.w / 2 < f.x1 && z + d.d / 2 > f.z0 && z - d.d / 2 < f.z1);
  };
  const xs = regions.flat().map((p) => p[0]), zs = regions.flat().map((p) => p[1]);
  let best = null;
  for (let x = Math.min(...xs) + d.w / 2; x <= Math.max(...xs) - d.w / 2 + 1e-6; x += 0.1)
    for (let z = Math.min(...zs) + d.d / 2; z <= Math.max(...zs) - d.d / 2 + 1e-6; z += 0.1) {
      if (!clear(x, z)) continue;
      const dist = Math.hypot(x - tgt.x, z - tgt.z);
      if (!best || dist < best[2]) best = [x, z, dist];
    }
  if (best) return [best[0], best[1]];
  const r = regions[0];
  return r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
}

function addToRoom(itemId, at) {
  const item = itemById(itemId);
  if (!item) return;
  if (viewer.view === 'walk') setView('3d');
  const floor = floorNow();
  const [x, z] = at || findSpot(item, floor);
  const p = { id: uid('p'), itemId, x: +x.toFixed(3), z: +z.toFixed(3), rot: 0, color: ui.pickedColor[itemId] || item.colors?.[0]?.name || null };
  floor.placed.push(p);
  viewer.syncFurniture();
  const rec = viewer.items.get(p.id);
  const c = rec && viewer.constrain(rec, p.x, p.z, false);
  if (c) Object.assign(p, c);
  if (!at && ['curtain', 'mirror', 'wardrobe', 'bookshelf', 'tvstand', 'sideboard', 'dresser'].includes(item.category)) againstWall(p, floor);
  commit({ rebuild: false });
  viewer.select({ type: 'item', id: p.id });
  toast(`Added “${item.name}” to ${floor.name}. Drag it to move it.`, { undo: true });
}

function againstWall(p, floor) {
  const item = itemById(p.itemId);
  const d = dimsOf(item);
  let best = null;
  for (const w of floor.walls) {
    const c = closestOnSegment([p.x, p.z], w.a, w.b);
    if (!best || c.dist < best.dist) best = { w, ...c };
  }
  if (!best) return;
  const { normal } = wallFrame(best.w);
  const side = Math.sign((p.x - best.q[0]) * normal[0] + (p.z - best.q[1]) * normal[1]) || 1;
  const n = [normal[0] * side, normal[1] * side];
  p.rot = Math.round((Math.atan2(n[0], n[1]) * 180) / Math.PI + 360) % 360;
  p.x = +(best.q[0] + n[0] * (best.w.thickness / 2 + d.d / 2 + 0.005)).toFixed(3);
  p.z = +(best.q[1] + n[1] * (best.w.thickness / 2 + d.d / 2 + 0.005)).toFixed(3);
  viewer.syncFurniture();
  const rec = viewer.items.get(p.id);
  const c = rec && viewer.constrain(rec, p.x, p.z, true);
  if (c) Object.assign(p, { x: c.x, z: c.z });
}

function duplicate(id) {
  const { p, floor } = findPlaced(id);
  if (!p) return;
  const q = { ...p, id: uid('p'), x: +(p.x + 0.3).toFixed(3), z: +(p.z + 0.3).toFixed(3) };
  floor.placed.push(q);
  commit({ rebuild: false });
  viewer.select({ type: 'item', id: q.id });
}

function deleteSelection() {
  const s = viewer.sel;
  if (!s) return;
  const f = floorNow();
  if (s.type === 'item' || s.type === 'items') {
    const ids = viewer.selectedItems();
    const locked = ids.filter((id) => findPlaced(id).p?.locked);
    if (locked.length === ids.length) return toast('Locked items can’t be removed. Unlock them first (L).');
    for (const id of ids) {
      const { p, floor } = findPlaced(id);
      if (floor && !p.locked) floor.placed = floor.placed.filter((x) => x !== p);
    }
    if (locked.length) toast(`${locked.length} locked item${locked.length > 1 ? 's were' : ' was'} kept.`);
  } else if (!ui.editing) return;
  else if (s.type === 'wall' && floorNow().walls.find((w) => w.id === s.id)?.locked) return toast('This wall is locked. Unlock it in the wall panel first.');
  else if (s.type === 'wall') {
    f.walls = f.walls.filter((w) => w.id !== s.id);
    f.openings = f.openings.filter((o) => o.wall !== s.id);
    tidy(f);
  } else if (s.type === 'opening') f.openings = f.openings.filter((o) => o.id !== s.id);
  else if (s.type === 'stairs') f.stairs = f.stairs.filter((x) => x.id !== s.id);
  else if (s.type === 'room') return toast('Rooms follow the walls. Delete a wall to merge two rooms.');
  viewer.select(null);
  commit({ rebuild: s.type !== 'item' && s.type !== 'items' });
  toast('Deleted.', { undo: true });
}

// ---------- model editor ----------

function openItemDialog(item, { note, isNew } = {}) {
  if (item) openDialog('item', { item, note, isNew });
}

const newItem = () => openItemDialog({ id: uid('i'), name: '', category: 'sofa', colors: [] }, { isNew: true });

/** Save the model editor's values `v` into `item` (a new model is added to the library). */
function saveItem(item, v, isNew) {
  const num = (x) => Math.max(0.005, parseFloat(x) / 100);
  item.name = v.name.trim() || 'Untitled model';
  item.category = v.category;
  item.url = v.url.trim() || null;
  item.dims = { w: num(v.w), d: num(v.d), h: num(v.h) };
  item.image = v.image.trim() || null;
  item.modelUrl = v.modelUrl.trim() || null;
  item.useModel = v.useModel;
  item.accent = v.accentOn ? { name: 'Custom', hex: v.accent } : null;
  item.colors = v.colors
    .map((c) => ({ name: c.name.trim() || c.hex, hex: c.hex, ...(c.image ? { image: c.image } : {}) }))
    .filter((c, i, a) => a.findIndex((x) => x.name === c.name) === i);
  if (!item.colors.length) item.colors = [{ name: 'Default', hex: '#b8b2a7' }];
  delete item.needsDims;
  for (const fl of design.floors) for (const p of fl.placed) if (p.itemId === item.id && p.color && !p.color.startsWith('#') && !item.colors.some((c) => c.name === p.color)) p.color = item.colors[0].name;
  if (isNew && !itemById(item.id)) library.items.unshift(item);
  commit({ lib: true, rebuild: false });
  if (isNew) toast(`“${item.name}” added to your models.`, { action: ['Add to room', () => addToRoom(item.id)] });
}

/** Delete a model from the library (and the design). Returns true if it was deleted. */
function deleteItem(item) {
  const n = placedCount(item.id);
  if (n && !confirm(`Delete “${item.name}”? It is placed ${n} time(s) in this design.`)) return false;
  library.items = library.items.filter((i) => i !== item);
  viewer.library = library.items;
  for (const f of design.floors) f.placed = f.placed.filter((p) => p.itemId !== item.id);
  viewer.select(null);
  commit({ lib: true, rebuild: false });
  toast('Model deleted.', { undo: true });
  return true;
}

/** Click a colour swatch on a library card: remember it, and recolour the selected piece. */
function pickColor(itemId, name) {
  ui.pickedColor[itemId] = name;
  const sel = viewer.sel?.type === 'item' && findPlaced(viewer.sel.id).p;
  if (sel?.itemId === itemId) (sel.color = name), commit({ rebuild: false });
  else renderPanels();
}

function moveToFloor(p, floor, toId) {
  const to = design.floors.find((f) => f.id === toId);
  floor.placed = floor.placed.filter((x) => x !== p);
  to.placed.push(p);
  commit({ rebuild: false });
  viewer.setActiveFloor(design.floors.indexOf(to));
  viewer.select({ type: 'item', id: p.id });
  renderAll();
}

// ---------- importing links ----------

/** The local server (npm start) reads product pages and proxies model files. */
function workerUrl() {
  return store.kind === 'device' ? location.origin : '';
}

export function extractUrls(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    const u = m[0].replace(/[),.;\]]+$/, '');
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

function guessFromUrl(url) {
  let name = 'New model';
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    const dp = segs.findIndex((s) => /^(dp|gp|product|products|p|item|itm|pd)$/i.test(s));
    let seg = (dp > 0 && /[a-z]-/i.test(segs[dp - 1]) ? segs[dp - 1] : null) || [...segs].reverse().find((s) => /[a-z]{3,}.*[-_+]/i.test(s)) || segs.at(-1) || u.hostname;
    seg = decodeURIComponent(seg).replace(/\.(html?|aspx?|php)$/i, '').replace(/[-_+]+/g, ' ').replace(/\b(s?\d{6,}|[A-Z0-9]{10})\b/g, '').replace(/\s+/g, ' ').trim();
    if (seg) name = seg.replace(/\b([a-z])/g, (c) => c.toUpperCase()).slice(0, 80);
  } catch {}
  const category = guessCategory(name);
  const words = name.replace(/coffee table/gi, '').split(' ').filter(Boolean);
  let color = null;
  for (let i = words.length - 1; i >= 0 && !color; i--) {
    if (!colorFromName(words[i])) continue;
    const start = i > 0 && /^(light|dark|pale|deep|dusty|navy|sky|royal|forest|burnt|off|white|black)$/i.test(words[i - 1]) ? i - 1 : i;
    const phrase = words.slice(start, i + 1).join(' ');
    color = { name: phrase, hex: colorFromName(phrase) };
  }
  const def = DEFAULT_DIMS[category];
  return { id: uid('i'), name, category, url, dims: { w: def[0], d: def[1], h: def[2] }, colors: [color || { name: 'Default', hex: '#b8b2a7' }] };
}

function itemFromProduct(prod) {
  const cat = prod.category || 'box';
  const def = DEFAULT_DIMS[cat] || [0.6, 0.6, 0.6];
  const d = prod.dims || {};
  let colors = (prod.colors || []).filter((c) => c.hex).map((c) => ({ name: c.name, hex: c.hex, image: c.image || undefined }));
  if (!colors.length) {
    const hex = colorFromName(prod.name);
    colors = [{ name: hex ? 'As shown' : 'Default', hex: hex || '#b8b2a7' }];
  }
  if (cat === 'rug' && d.w && d.d == null && d.h) Object.assign(d, { d: d.h, h: 0.012 });
  if (cat === 'rug' && (!d.h || d.h > 0.05)) d.h = 0.012;
  return {
    id: uid('i'), name: prod.name || 'Imported model', category: cat, url: prod.url, image: prod.image || null,
    price: prod.price || null, currency: prod.currency || null, modelUrl: prod.modelUrl || null,
    dims: { w: d.w || def[0], d: d.d || def[1], h: d.h || def[2] }, needsDims: !(d.w && d.d && d.h), colors,
  };
}

// Queue entries: { id, url, status, title, message, actions: [[label, kind, arg]] }
async function importUrls(urls) {
  if (!urls.length) return toast('No links found. Paste a full link starting with https://');
  const base = workerUrl();
  for (const url of urls) {
    const existing = library.items.find((i) => i.url === url);
    const q = { id: uid('q'), url, status: 'pending', title: url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) };
    ui.queue.push(q);
    if (existing) {
      Object.assign(q, { status: 'ok', title: existing.name, message: 'Already in your models', actions: [['Add to room', 'add', existing.id]] });
      continue;
    }
    renderPanels();
    if (!base) {
      const item = guessFromUrl(url);
      item.needsDims = true;
      library.items.unshift(item);
      commit({ lib: true, rebuild: false });
      Object.assign(q, { status: 'warn', title: item.name, message: 'Run Roomcraft with npm start to read links. Size is a typical guess', actions: [['enter the real size', 'edit', item.id]] });
      continue;
    }
    try {
      const res = await fetch(`${base}/scrape?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!data.ok) throw new Error(data.error || 'Could not read the page.');
      const item = itemFromProduct(data.product);
      library.items.unshift(item);
      commit({ lib: true, rebuild: false });
      const bits = [`${cm(item.dims.w)} × ${cm(item.dims.d)} × ${cm(item.dims.h)} cm`];
      if (item.colors.length > 1) bits.push(`${item.colors.length} colours`);
      if (item.modelUrl) bits.push('3D model found');
      Object.assign(q, {
        status: item.needsDims ? 'warn' : 'ok', title: item.name, itemId: item.id,
        message: (item.needsDims ? 'Size partly guessed · ' : '') + bits.join(' · '),
        actions: [...(item.needsDims ? [['Check size', 'edit', item.id]] : []), ['Add to room', 'add', item.id]],
      });
      await handToAgent(q, url, item);
    } catch (err) {
      if (agentModels()) {
        // The page couldn't be read here; the agent may still manage (it can look harder).
        const item = guessFromUrl(url);
        item.needsDims = true;
        library.items.unshift(item);
        commit({ lib: true, rebuild: false });
        Object.assign(q, { status: 'warn', title: item.name, itemId: item.id, message: `Couldn’t read the page here (${err.message || err}).`, actions: [] });
        await handToAgent(q, url, item);
      } else Object.assign(q, { status: 'error', message: String(err.message || err), actions: [['Add manually', 'manual', q.id]] });
    }
    renderPanels();
  }
  renderPanels();
}

const agentModels = () => !!chat?.ready && pref.get('autoModel', true);

/** Pasted links go to the user's agent, which models them from the product photos. */
async function handToAgent(q, url, item) {
  if (!agentModels()) return;
  try {
    await chat.modelLink(url, item);
    q.status = 'busy';
    q.message = `${q.message ? q.message + ' · ' : ''}Your agent is modelling it from the photos…`;
    q.actions = [...(q.actions || []), ['watch', 'chat']];
  } catch (err) {
    q.message += ` (Agent: ${err.message})`;
  }
  renderPanels();
}

/**
 * A modelling job finished. It only counts as done when the model was changed and checked
 * (the server looks at the library, not at what the agent says): see modelOutcome in runner.mjs.
 */
async function modelJobDone(ev) {
  if (ev.kind !== 'model') return;
  // The agent saved the library on disk; make sure we show its version
  if (Date.now() - lastLibSave > 1500) {
    library = await store.loadLibrary();
    viewer.library = library.items;
    viewer.syncFurniture();
  }
  const item = itemById(ev.itemId);
  const name = item ? `“${item.name}”` : 'the model';
  const q = ui.queue.find((x) => x.url === ev.url || (x.itemId && x.itemId === ev.itemId));
  const retry = ['Try again', 'retry', q?.id];
  if (ev.outcome === 'done') {
    if (item) (ui.ready ||= new Set()).add(item.id);
    if (q) Object.assign(q, { status: 'ok', itemId: ev.itemId, message: 'Modelled and checked by your agent', actions: [['Add to room', 'add', ev.itemId]] });
    toast(`Your agent finished ${name}. It’s at the top of your models.`, { action: item && ['Add to room', () => (ui.ready?.delete(item.id), addToRoom(item.id))] });
    setTimeout(() => $(`#inventory .card[data-id="${CSS.escape(ev.itemId || '')}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  } else if (ev.outcome === 'unverified') {
    if (q) Object.assign(q, { status: 'warn', itemId: ev.itemId, message: `Modelled, but not checked: ${ev.reason}`, actions: [['Add to room', 'add', ev.itemId], retry] });
    toast(`Your agent changed ${name} but didn’t confirm it matches the photos.`, { action: ['Try again', () => retryModel(ev.url, ev.itemId)] });
  } else if (ev.outcome === 'failed') {
    if (q) Object.assign(q, { status: 'error', message: `Your agent couldn’t model it: ${ev.reason} The draft is kept.`, actions: [retry, ['See why', 'chat'], ...(item ? [['Edit size', 'edit', item.id]] : [])] });
    toast(`Your agent couldn’t model ${name}: ${ev.reason}`, { action: ['See why', () => chat.toggle(true)] });
  } else if (q) Object.assign(q, { status: 'warn', message: 'Stopped. The draft is kept.', actions: [retry] });
  renderPanels();
}

/** Hand a link to the agent again. */
async function retryModel(url, itemId, name) {
  if (!chat?.ready) return toast('No agent is ready. Open Agents to set one up.');
  const item = itemById(itemId) || (name ? { id: itemId, name } : null);
  let q = ui.queue.find((x) => x.url === url);
  if (!q) ui.queue.push((q = { id: uid('q'), url, title: item?.name || url, itemId }));
  try {
    await chat.modelLink(url, item);
    Object.assign(q, { status: 'busy', message: 'Your agent is trying again…', actions: [['watch', 'chat']] });
  } catch (err) {
    Object.assign(q, { status: 'error', message: `Agent: ${err.message}`, actions: [] });
  }
  renderPanels();
}

function queueAction(kind, arg) {
  if (kind === 'retry') {
    const q = ui.queue.find((x) => x.id === arg);
    if (q) retryModel(q.url, q.itemId);
  } else if (kind === 'add') (ui.ready?.delete(arg), addToRoom(arg));
  else if (kind === 'edit') openItemDialog(itemById(arg));
  else if (kind === 'chat') chat?.toggle(true);
  else if (kind === 'manual') {
    const q = ui.queue.find((x) => x.id === arg);
    openItemDialog(guessFromUrl(q.url), { isNew: true, note: "We couldn't read this page automatically. Check the name and enter the size from the product page." });
  }
}

function dismissQueue(id) {
  ui.queue = id === 'finished' ? ui.queue.filter((q) => q.status === 'pending' || q.status === 'busy') : ui.queue.filter((q) => q.id !== id);
  renderPanels();
}

/** Ask the agent to check an unverified model against its photos (and fix it). */
function checkWithAgent(item) {
  if (!chat?.ready) return toast('No agent is ready. Open Agents to set one up.');
  chat.toggle(true);
  chat.send(`Please check the model "${item.name}" (id ${item.id}): render it, compare it with ${item.url ? `its product photos (read_link ${item.url})` : 'what it should look like'}, fix anything that doesn't match, then verify_item.`);
}

function focusLinkBox() {
  if (ui.editing) setEditing(false);
  document.body.classList.remove('hide-left');
  setTimeout(() => $('#linkInput')?.focus(), 50);
}

// ---------- designs ----------

async function openDesign(id) {
  design = await store.load(id);
  await store.setActive(id).catch(() => {});
  lastSaved = design.updatedAt;
  viewer.select(null);
  viewer.activeFloor = 0;
  viewer.setDesign(design, { refit: true, force: true });
  if (viewer.view === 'walk') walker.start(0);
  resetHistory();
  renderAll();
}

async function duplicateDesign(id) {
  const d = id === design.id ? JSON.parse(JSON.stringify(design)) : await store.load(id);
  d.id = uid('d');
  d.name = `${d.name} (copy)`;
  await store.save(d);
}

async function renameDesign(id) {
  const d = id === design.id ? design : await store.load(id);
  const name = prompt('Design name', d.name);
  if (!name?.trim()) return;
  d.name = name.trim();
  if (id === design.id) commit({ rebuild: false });
  else await store.save(d);
}

async function deleteDesign(id) {
  if (!confirm('Delete this design? This cannot be undone.')) return;
  await store.remove(id);
  if (id === design.id) await openDesign((await store.list())[0].id);
}

async function createHouse(opts) {
  const d = newHouse(opts);
  await store.save(d);
  await openDesign(d.id);
  toast(`“${d.name}” created. Use Edit house to draw rooms, or give your agent a floor plan.`);
}

async function importDesignFile(file) {
  try {
    const data = JSON.parse(await file.text());
    const d = migrate(data);
    d.id = uid('d');
    // Bring along any models the design uses that this device doesn't have yet.
    const ids = new Set(library.items.map((i) => i.id));
    const incoming = (data.inventory || []).filter((i) => i?.id && !ids.has(i.id));
    if (incoming.length) {
      library.items.push(...incoming);
      await store.saveLibrary(library);
    }
    delete d.inventory;
    await store.save(d);
    await openDesign(d.id);
    toast(`Imported “${d.name}”${incoming.length ? ` with ${incoming.length} new model${incoming.length > 1 ? 's' : ''}` : ''}.`);
  } catch (err) {
    toast(`That isn't a Roomcraft design file (${err.message}).`);
  }
}

function download(name, href) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const fileName = (s) => String(s || 'house').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'house';

async function exportAs(kind) {
  if (kind === 'design') {
    const used = new Set(design.floors.flatMap((f) => f.placed.map((p) => p.itemId)));
    const out = { ...design, inventory: library.items.filter((i) => used.has(i.id)) };
    download(`${fileName(design.name)}.roomcraft.json`, URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })));
  } else if (kind === 'png') {
    download(`${fileName(design.name)}.png`, viewer.screenshot());
  } else if (kind === 'qty') {
    openDialog('qty');
  } else if (kind === 'plan') {
    openDialog('plan');
  } else if (kind === 'glb') {
    toast('Preparing 3D model…');
    const { exportGLB } = await import('./export.js');
    const blob = await exportGLB(viewer);
    download(`${fileName(design.name)}.glb`, URL.createObjectURL(blob));
    toast(`Saved ${fileName(design.name)}.glb (${(blob.size / 1e6).toFixed(1)} MB). In Blender: File → Import → glTF 2.0.`);
  }
}

/** The Share menu. */
function shareAction(act) {
  if (act === 'photo') takePhoto();
  else if (act === 'copy') copyPicture();
  else exportAs(act).catch((err) => toast(`Export failed: ${err.message}`));
}

const pickFile = (kind) => $(kind === 'dxf' ? '#dxfFile' : '#designFile').click();

// ---------- version history ----------

const openHistory = (id) => openDialog('history', id);

async function restoreVersion(id, file) {
  const d = await store.version(id, file);
  if (id !== design.id) await openDesign(id);
  await saveNow(); // the current state goes into History first
  design = { ...d, id, updatedAt: lastSaved };
  viewer.setDesign(design, { force: true });
  commit();
  reactUI.set({ dialogs: {} });
  toast('Restored that version. The one before it is in History too.', { undo: true });
}

async function openVersionCopy(id, file) {
  const d = await store.version(id, file);
  const when = d.updatedAt ? new Date(d.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '?';
  const copy = { ...d, id: uid('d'), name: `${d.name} (${when})` };
  await store.save(copy);
  reactUI.set({ dialogs: {} });
  await openDesign(copy.id);
  toast(`Opened “${copy.name}” as a separate design.`);
}

// ---------- sun study ----------

function setSunOn(on) {
  ui.sunOn = on;
  pref.set('sunOn', on);
  applySun();
  renderPanels();
}

function useMyLocation() {
  if (!navigator.geolocation) return toast('Location isn’t available in this browser.');
  navigator.geolocation.getCurrentPosition(
    (p) => ((design.site = { ...(design.site || {}), lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }), commit({ rebuild: false })),
    () => toast('Couldn’t get your location. Type the latitude and longitude instead (search the address on a map).')
  );
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Apply the sun for the design's site and the chosen date/time (or the default daylight). */
function applySun() {
  const site = design.site;
  if (!ui.sunOn || !site || !Number.isFinite(site.lat) || !Number.isFinite(site.lon)) {
    viewer.setSun(null);
    $('#northArrow').hidden = !site;
    return null;
  }
  const when = new Date(`${ui.sunDate}T${ui.sunTime}`);
  const pos = sunPosition(when, site.lat, site.lon);
  viewer.setSun(sunVector(pos, site.north || 0));
  $('#northArrow').hidden = false;
  return pos;
}

async function importDxf(file) {
  if (store.kind !== 'device') return toast('DXF import needs Roomcraft running with npm start.');
  try {
    const r = await fetch('api/dxf', { method: 'POST', body: await file.text() });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    const f = floorNow();
    const replace = !f.walls.length || confirm(`Replace the walls on ${f.name} with the ${j.lines.length} lines from the DXF? (Cancel adds them instead.)`);
    if (replace) {
      f.walls = [];
      f.openings = [];
      f.rooms = [];
    }
    for (const [a, b] of j.lines) f.walls.push({ id: uid('w'), a, b, thickness: DEFAULTS.interiorWall });
    tidy(f);
    const rooms = f.rooms;
    commit();
    viewer.frameHouse(true);
    toast(`Imported ${j.lines.length} wall lines (${j.spanMetres} m across${j.unitsKnown ? '' : ', units guessed'}) and found ${rooms.length} rooms. Mark exterior walls and set thickness in Edit house.`);
  } catch (err) {
    toast(`Couldn't import the DXF: ${err.message}`);
  }
}

// ---------- AI agents ----------

function openAgents() {
  if (store.kind !== 'device') return toast('Connecting agents needs Roomcraft running with npm start.');
  openDialog('agents');
}

async function refreshAgentsDot() {
  if (store.kind !== 'device') return 0;
  chat?.refresh();
  try {
    const data = await (await fetch('api/agents')).json();
    ui.agents = data.harnesses.filter((h) => h.connection || h.configured).length;
    renderPanels();
    return ui.agents;
  } catch {
    return 0;
  }
}

// What the agent should know about where the user is in the app.
function chatContext() {
  const f = floorNow();
  const s = viewer.sel;
  let sel = '';
  if (s?.type === 'item') {
    const found = findPlaced(s.id);
    sel = `selected furniture "${itemById(found?.p.itemId)?.name}" (placed id ${s.id})`;
  } else if (s?.type === 'room') sel = `selected room "${f.rooms.find((r) => r.id === s.id)?.name}" (id ${s.id})`;
  else if (s) sel = `selected ${s.type} ${s.id}`;
  return [`design "${design.name}" (id ${design.id})`, `floor "${f.name}" (index ${viewer.activeFloor})`, `${viewer.view} view`, ui.editing && 'editing the structure', sel].filter(Boolean).join(', ');
}

// ---------- views & walking ----------

function setView(v) {
  if (v === 'walk' && ui.editing) setEditing(false);
  if (v === 'walk' && ui.tool) setTool(null);
  if (v === 'walk' && viewer.showAll) viewer.setShowAll(false);
  // Split view = the plan and the 3D view side by side
  if (v !== 'split') viewer.setSplit(false);
  viewer.setView(v === 'split' ? 'plan' : v);
  if (v === 'split') viewer.setSplit(true);
  ui.view = v;
  $('#walkUI').hidden = v !== 'walk';
  if (v === 'walk') {
    viewer.select(null);
    walker.start(viewer.activeFloor);
    walkHelp(false);
  } else walker.stop();
  renderAll();
}

function walkHelp(locked) {
  ui.walkLocked = locked;
  reactUI?.bump('status');
}

// ---------- photo ----------

let photoAbort = null;
async function takePhoto() {
  const show = (p) => reactUI.set({ photo: { ...reactUI.state.photo, ...p } });
  reactUI.set({ photo: { title: 'Rendering photo…', info: 'Preparing the scene…', progress: 0 } });
  photoAbort = new AbortController();
  try {
    const { renderPhoto } = await import('./photo.js');
    const started = performance.now();
    const url = await renderPhoto(viewer, {
      samples: ui.quality === 'high' ? 400 : 150,
      signal: photoAbort.signal,
      onProgress: (n, total) => {
        const secs = ((performance.now() - started) / 1000) * (total / Math.max(1, n) - 1);
        show({ progress: n / total, info: `${n} / ${total} light samples · about ${Math.max(1, Math.round(secs))} s left` });
      },
    });
    if (!url) return reactUI.set({ photo: null });
    show({ title: 'Photo ready', info: '', url });
  } catch (err) {
    console.error(err);
    show({ title: "Couldn't render the photo", info: err.message, error: true });
  }
}

function cancelPhoto() {
  photoAbort?.abort();
  reactUI.set({ photo: null });
}

const savePhoto = (url) => download(`${fileName(design.name)}-photo.png`, url);

// ---------- misc UI ----------

let chat = null;
let measure = null;
let paint = null;
let toastTimer;
function toast(msg, { undo, action } = {}) {
  const t = { id: uid('t'), msg, undo, action };
  reactUI?.set({ toast: t });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => reactUI.state.toast?.id === t.id && reactUI.set({ toast: null }), action || undo ? 6000 : 3500);
}
// ---------- React panels: commands, right-click menu, settings, tour, save state ----------

let reactUI = null;

function setSaveState(status) {
  if (!reactUI) return;
  const cur = reactUI.state.save;
  if (cur.status === status && status !== 'saved') return;
  reactUI.set({ save: { status, at: status === 'saved' ? Date.now() : cur.at } });
}

/** A small picture of the house for the designs list, at most every 20 s. */
let thumbAt = 0;
function saveThumb() {
  if (store.kind !== 'device' || Date.now() - thumbAt < 20000 || viewer.view === 'walk' || viewer.view === 'elevation') return;
  thumbAt = Date.now();
  setTimeout(() => {
    try {
      const src = viewer.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 240;
      c.height = Math.round((240 * src.height) / src.width) || 150;
      viewer.withoutHelpers(() => {
        viewer.renderer.render(viewer.scene, viewer.camera);
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      });
      fetch(`api/thumbs/${encodeURIComponent(design.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: c.toDataURL('image/jpeg', 0.7) }) }).catch(() => {});
    } catch {}
  }, 300);
}

function settings() {
  return {
    theme: pref.get('theme', 'system'),
    quality: ui.quality,
    currency: pref.get('currency', 'SGD'),
    budget: pref.get('budget', 0),
    tips: pref.get('tips', true),
    autoModel: pref.get('autoModel', true),
  };
}

function setSetting(k, v) {
  if (k === 'quality') {
    ui.quality = v;
    setQuality(viewer, v);
  }
  pref.set(k, v);
  if (k === 'theme') applyTheme();
  renderAll();
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = pref.get('theme', 'system');
  const dark = t === 'dark' || (t === 'system' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  viewer?.setTheme(dark);
}
darkQuery.addEventListener?.('change', applyTheme);

/** Prices in the chosen currency (items without a currency are assumed to be in it). */
function furnitureCost(floors = design.floors) {
  const cur = pref.get('currency', 'SGD');
  const sums = {};
  for (const f of floors)
    for (const p of f.placed) {
      const it = itemById(p.itemId);
      const v = parseFloat(String(it?.price ?? '').replace(/[^\d.]/g, ''));
      if (!Number.isFinite(v)) continue;
      const c = (it.currency || cur).toUpperCase();
      sums[c] = (sums[c] || 0) + v;
    }
  return { cur, sums, main: sums[cur] || 0, other: Object.entries(sums).filter(([c]) => c !== cur) };
}
const money = (v, c) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v);
  } catch {
    return `${c} ${v.toFixed(2)}`;
  }
};

const openSun = () => $('[data-sun]')?.click();

/** Everything you can do, for the command palette (and its shortcuts, shown as hints). */
function commands() {
  const sel = viewer.sel;
  const items = viewer.selectedItems();
  const p = sel?.type === 'item' ? findPlaced(sel.id).p : null;
  const walk = viewer.view === 'walk';
  const c = [];
  const add = (group, id, label, run, extra = {}) => c.push({ group, id, label, run, ...extra });
  // Selection first, when there is one
  if (items.length) {
    add('Selection', 'dup', items.length > 1 ? 'Duplicate the selected items' : 'Duplicate', () => (items.length > 1 ? (copyItems(), pasteItems({ offset: true })) : duplicate(sel.id)), { keys: 'Ctrl+D' });
    add('Selection', 'rot', 'Turn 90°', () => (p ? rotateItem(p, 90) : rotateGroup(90)), { keys: 'R' });
    add('Selection', 'rotb', 'Turn 90° the other way', () => (p ? rotateItem(p, -90) : rotateGroup(-90)), { keys: 'Shift+R' });
    if (p) add('Selection', 'wall', 'Push against the nearest wall', () => (againstWall(p, findPlaced(p.id).floor), commit({ rebuild: false })));
    add('Selection', 'lock', selectedPlaced().every((q) => q.locked) ? 'Unlock' : 'Lock (so it can’t be moved by accident)', toggleLock, { keys: 'L' });
    add('Selection', 'copy', 'Copy', copyItems, { keys: 'Ctrl+C' });
    if (p) add('Selection', 'editmodel', 'Edit this model (size, colours)', () => openItemDialog(itemById(p.itemId)));
    add('Selection', 'del', 'Delete', deleteSelection, { keys: 'Delete' });
  } else if (sel?.type === 'wall') {
    const w = floorNow().walls.find((x) => x.id === sel.id);
    if (w && ui.editing) for (const t of ['door', 'window', 'opening']) add('Selection', `add-${t}`, `Add a ${t} to this wall`, () => addOpening(w, t));
    add('Selection', 'elev', 'Elevation view of this wall', () => openElevation(sel.id));
    if (ui.editing) add('Selection', 'del', 'Delete this wall', deleteSelection, { keys: 'Delete' });
  }
  if (sel) add('Selection', 'focus', 'Zoom to the selection', () => viewer.frameSelection(), { keys: 'F' });

  add('View', 'v3d', '3D view', () => setView('3d'), { keys: '1' });
  add('View', 'vplan', 'Floor plan', () => setView('plan'), { keys: '2' });
  add('View', 'vwalk', 'Walk through the house', () => setView('walk'), { keys: '3' });
  add('View', 'vsplit', 'Plan and 3D side by side', () => setView('split'), { keys: '4' });
  add('View', 'fit', 'Zoom to the whole house', () => (viewer.select(null), viewer.frameHouse(true)), { keys: 'F' });
  for (const [k, name] of DISPLAY) add('View', `disp-${k}`, `${viewer.display[k] ? 'Hide' : 'Show'} ${name.toLowerCase()}`, () => setDisplay(k, !viewer.display[k]), { keys: k === 'grid' ? 'G' : null, keywords: 'display toggle' });
  add('View', 'walls', viewer.wallMode === 'cut' ? 'Show walls full height' : 'Cut walls at 1.25 m', () => (viewer.setWallMode(viewer.wallMode === 'cut' ? 'up' : 'cut'), pref.set('wallMode', viewer.wallMode), renderAll()));
  if (design.floors.length > 1) add('View', 'all', 'See all floors', () => (viewer.setShowAll(true), renderAll()));
  add('View', 'sun', 'Sun and shadows', () => (setView(viewer.view === 'walk' ? '3d' : viewer.view), setTimeout(openSun, 0)), { keywords: 'light daylight time' });
  add('View', 'left', 'Hide or show the left panel', () => togglePanel('left'), { keys: '[' });
  add('View', 'right', 'Hide or show the right panel', () => togglePanel('right'), { keys: ']' });
  add('View', 'dark', document.documentElement.dataset.theme === 'dark' ? 'Light mode' : 'Dark mode', () => setSetting('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'), { keywords: 'theme night appearance' });

  design.floors.forEach((f, i) => add('Floors', `floor-${i}`, `Go to ${f.name}`, () => setFloor(i), { note: i === viewer.activeFloor ? 'current' : '', keys: null }));
  add('Floors', 'addfloor', 'Add a floor on top', () => (ui.editing || setEditing(true), addFloorAbove()));
  if (design.floors.length > 1) add('Floors', 'delfloor', `Delete ${floorNow().name}`, deleteFloor);

  add('House', 'edit', ui.editing ? 'Stop editing the house' : 'Edit the house (walls, rooms, doors…)', () => setEditing(!ui.editing), { keys: 'E' });
  for (const [t, label, keys] of [['wall', 'Draw walls', 'W'], ['door', 'Add doors', 'D'], ['window', 'Add windows', 'N'], ['opening', 'Add openings (no door)', 'O'], ['stairs', 'Add stairs', 'S']])
    add('House', `tool-${t}`, label, () => (ui.editing || setEditing(true), setTool(t)), { keys: ui.editing ? keys : null, note: ui.editing ? '' : 'turns on Edit house' });
  add('House', 'measure', 'Measure', () => setTool(ui.tool === 'measure' ? null : 'measure'), { keys: 'M', keywords: 'distance length tape ruler' });
  add('House', 'paint', 'Paint walls and floors', () => setTool(ui.tool === 'paint' ? null : 'paint'), { keys: 'P', keywords: 'wallpaper tiles colour color finish' });
  add('House', 'rename', 'Rename this house', () => {
    const n = prompt('House name', design.name);
    if (n?.trim()) (design.name = n.trim()), commit({ rebuild: false });
  });

  add('Furniture', 'links', 'Add furniture from a product link', focusLinkBox, { keywords: 'import shop url ikea' });
  add('Furniture', 'custom', 'Add a custom model', newItem);
  add('Furniture', 'selall', 'Select all furniture on this floor', selectAllItems, { keys: 'Ctrl+A' });
  if (clipboard?.length) add('Furniture', 'paste', 'Paste', () => pasteItems(), { keys: 'Ctrl+V' });
  for (const it of library.items) add('Add to room', `add-${it.id}`, it.name, () => addToRoom(it.id), { note: CATEGORY_LABELS[it.category] || '', keywords: `add place ${it.category}`, hidden: true });

  add('Edit', 'undo', 'Undo', () => restore(history.index - 1), { keys: 'Ctrl+Z', disabled: history.index <= 0 });
  add('Edit', 'redo', 'Redo', () => restore(history.index + 1), { keys: 'Ctrl+Shift+Z', disabled: history.index >= history.stack.length - 1 });

  add('File', 'designs', 'Your designs', () => openDialog('designs'), { keywords: 'open switch house' });
  add('File', 'new', 'New house', () => openDialog('newHouse'));
  if (store.history) add('File', 'history', 'Version history', () => openHistory(design.id), { keywords: 'restore earlier backup' });
  add('File', 'photo', 'Photo-real picture of this view', takePhoto, { keywords: 'render' });
  add('File', 'copyimg', 'Copy a picture of this view', copyPicture, { keys: 'Ctrl+Shift+C', keywords: 'clipboard screenshot' });
  add('File', 'png', 'Save a screenshot (.png)', () => exportAs('png'));
  add('File', 'plan', '2D floor plan (PDF or PNG)', () => exportAs('plan'), { keywords: 'print drawing' });
  add('File', 'qty', 'Quantities and costs', () => exportAs('qty'), { keywords: 'budget price paint flooring' });
  add('File', 'glb', '3D model for Blender (.glb)', () => exportAs('glb').catch((err) => toast(`Export failed: ${err.message}`)));
  add('File', 'json', 'Design file (.json)', () => exportAs('design'), { keywords: 'backup share' });
  add('File', 'import', 'Import a design file', () => pickFile('design'));
  add('File', 'dxf', 'Import a CAD floor plan (DXF)', () => pickFile('dxf'));

  add('Help', 'assistant', 'Talk to your AI agent', () => chat?.toggle(true), { keys: 'C', keywords: 'chat ai assistant' });
  add('Help', 'agents', 'Connect an AI agent', openAgents);
  add('Help', 'guide', 'User guide', () => openDialog('help'), { keys: 'F1 or ?' });
  add('Help', 'tour', 'Show the tour again', startTour);
  add('Help', 'settings', 'Settings', () => reactUI.set({ settings: true }), { keywords: 'preferences currency theme graphics' });
  return walk ? c.filter((x) => !['Selection', 'Furniture', 'Add to room'].includes(x.group) || x.id === 'links') : c;
}

function runCommand(cmd) {
  if (cmd.id) {
    const recent = [cmd.id, ...pref.get('recentCommands', []).filter((x) => x !== cmd.id)].slice(0, 5);
    if (cmd.group !== 'Selection' && !cmd.id.startsWith('floor-')) pref.set('recentCommands', recent);
  }
  try {
    cmd.run();
  } catch (err) {
    console.error(err);
    toast(`That didn’t work: ${err.message}`);
  }
}

function startTour() {
  if (ui.editing) setEditing(false);
  if (viewer.view === 'walk') setView('3d');
  document.body.classList.remove('hide-left');
  reactUI.set({ tour: 0 });
}

async function copyPicture() {
  try {
    const blob = await (await fetch(viewer.screenshot())).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Picture copied. Paste it into a message or document.');
  } catch {
    toast('Couldn’t copy to the clipboard here; saving it as a file instead.');
    exportAs('png');
  }
}

/** Right-click menu: actions for what's under the pointer. */
function contextMenu(e) {
  if (viewer.view === 'walk' || ui.tool) return;
  const hit = viewer.pickAt(e.clientX, e.clientY);
  const at = viewer.planAt(e.clientX, e.clientY);
  const f = floorNow();
  if (hit?.type === 'item') {
    if (!viewer.selectedItems().includes(hit.id)) viewer.select({ type: 'item', id: hit.id });
  } else if (hit && hit.type !== 'handle' && hit.id) viewer.select({ type: hit.type, id: hit.id });
  const s = viewer.sel;
  const items = [];
  const sep = () => items.length && !items.at(-1).sep && items.push({ sep: true });
  const add = (label, run, extra = {}) => items.push({ label, run, ...extra });
  let title = '';
  const n = viewer.selectedItems().length;
  if (hit?.type === 'item' && n) {
    const p = findPlaced(s.id)?.p;
    title = n > 1 ? `${n} items` : itemById(p?.itemId)?.name || 'Item';
    const cmds = commands().filter((x) => x.group === 'Selection');
    for (const id of ['dup', 'rot', 'rotb', 'wall', 'lock']) {
      const x = cmds.find((q) => q.id === id);
      if (x) items.push(x);
    }
    sep();
    for (const id of ['copy', 'editmodel', 'focus']) {
      const x = cmds.find((q) => q.id === id);
      if (x) items.push(x);
    }
    sep();
    items.push({ ...cmds.find((q) => q.id === 'del'), danger: true });
  } else if (hit?.type === 'wall' && s?.type === 'wall') {
    const w = f.walls.find((x) => x.id === s.id);
    title = `Wall · ${cm(wallFrame(w).len)} cm`;
    if (ui.editing) {
      for (const t of ['door', 'window', 'opening']) add(`Add a ${t} here`, () => addOpening(w, t, at), { keys: { door: 'D', window: 'N', opening: 'O' }[t] });
      add('Add a corner here', () => {
        const c = closestOnSegment(at, w.a, w.b);
        if (!splitWall(f, w.id, Math.round(c.t * wallFrame(w).len * 20) / 20)) return toast('Too close to a corner to add one here.');
        commit();
      });
      sep();
    }
    add('Elevation view', () => openElevation(w.id));
    add('Paint this wall', () => setTool('paint'), { keys: 'P' });
    add('Zoom to it', () => viewer.frameSelection(), { keys: 'F' });
    if (ui.editing) {
      add(w.locked ? 'Unlock' : 'Lock', () => (w.locked ? delete w.locked : (w.locked = true), commit({ rebuild: false })));
      sep();
      add('Delete wall', deleteSelection, { keys: 'Delete', danger: true, disabled: !!w.locked });
    } else add('Edit the house to change it', () => setEditing(true), { keys: 'E' });
  } else if (hit?.type === 'opening' || hit?.type === 'stairs') {
    title = hit.type === 'stairs' ? 'Stairs' : { door: 'Door', window: 'Window', opening: 'Opening' }[f.openings.find((o) => o.id === hit.id)?.type] || 'Opening';
    if (ui.editing && hit.type === 'stairs') add('Turn 90°', () => {
      const st = f.stairs.find((x) => x.id === hit.id);
      st.rot = ((st.rot || 0) + 90) % 360;
      commit();
    }, { keys: 'R' });
    add('Zoom to it', () => viewer.frameSelection(), { keys: 'F' });
    if (ui.editing) (sep(), add('Delete', deleteSelection, { keys: 'Delete', danger: true }));
    else add('Edit the house to change it', () => (setEditing(true), viewer.select({ type: hit.type, id: hit.id })), { keys: 'E' });
  } else {
    const room = hit?.type === 'room' ? f.rooms.find((r) => r.id === hit.id) : null;
    title = room ? `${room.name || 'Room'} · ${Math.abs(area(room.points)).toFixed(1)} m²` : f.name;
    if (clipboard?.length) add('Paste here', () => ((ui.pointer = at), pasteItems()), { keys: 'Ctrl+V' });
    if (room) {
      add('Rename room…', () => {
        const name = prompt('Room name', room.name || '');
        if (name?.trim()) (room.name = name.trim()), commit();
      });
      const inRoom = f.placed.filter((q) => pointInPolygon(q.x, q.z, room.points)).map((q) => q.id);
      if (inRoom.length) add(`Select the ${inRoom.length} item${inRoom.length > 1 ? 's' : ''} in this room`, () => viewer.select(inRoom.length > 1 ? { type: 'items', ids: inRoom } : { type: 'item', id: inRoom[0] }));
      add('Paint the floor', () => setTool('paint'), { keys: 'P' });
      add('Zoom to room', () => viewer.frameSelection(), { keys: 'F' });
      sep();
    }
    add('Select all furniture', selectAllItems, { keys: 'Ctrl+A' });
    add('Add furniture from a link…', focusLinkBox);
    add('Measure', () => setTool('measure'), { keys: 'M' });
    add('Zoom to the whole house', () => (viewer.select(null), viewer.frameHouse(true)), { keys: 'F' });
    sep();
    add(ui.editing ? 'Stop editing the house' : 'Edit the house', () => setEditing(!ui.editing), { keys: 'E' });
  }
  if (items.at(-1)?.sep) items.pop();
  reactUI.set({ menu: { x: e.clientX, y: e.clientY, title, items } });
}

// ---------- boot ----------

async function boot() {
  if (!webglSupport()) {
    $('#loading').innerHTML = '<div class="webgl-error"><b>3D view unavailable</b>This browser has WebGL turned off or unsupported.<br>Enable hardware acceleration, or try Chrome, Edge, Firefox or Safari.</div>';
    return;
  }
  store = await openStorage();
  library = await store.loadLibrary();
  library.items ||= [];
  let id = await store.getActive();
  const list = await store.list();
  if (!list.some((d) => d.id === id)) id = list[0]?.id;
  if (!id) {
    const d = newHouse({ name: 'My house' });
    await store.save(d);
    id = d.id;
  }
  design = await store.load(id);
  lastSaved = design.updatedAt;

  $('#loading').remove();
  viewer = new Viewer($('#viewport'), {
    onSelect: () => (renderInspector(), refreshClearance()),
    onLive: () => {
      renderInspector();
      clearTimeout(ui.clearTimer);
      ui.clearTimer = setTimeout(() => refreshClearance({ dragging: true }), 60);
    },
    onCommit: () => commit({ rebuild: false }),
    onStructureLive: () => viewer.setDesign(design),
    onStructureCommit: () => {
      tidy();
      commit();
    },
    onWallDblClick: (id, [x, z]) => {
      if (!ui.editing || ui.tool) return;
      const f = floorNow();
      const w = f.walls.find((q) => q.id === id);
      if (!w) return;
      const c = closestOnSegment([x, z], w.a, w.b);
      const at = Math.round(c.t * wallFrame(w).len * 20) / 20;
      const nw = splitWall(f, id, at);
      if (!nw) return toast('Too close to a corner to add one here.');
      commit();
      toast('Corner added. Drag its dot to move it.');
    },
    onHover: (t) => {
      ui.hover = t || '';
      updateHint();
    },
    onPointer: (x, z, kind) => {
      if (kind === 'elevation') ui.coords = `along ${x.toFixed(2)} m · height ${z.toFixed(2)} m`;
      else (ui.pointer = [x, z]), (ui.coords = `x ${x.toFixed(2)} m · z ${z.toFixed(2)} m`);
      reactUI?.bump('status');
    },
    onHeavyModel: (item, tris) => {
      ui.heavyWarned ||= new Set();
      if (ui.heavyWarned.has(item.id)) return;
      ui.heavyWarned.add(item.id);
      toast(`“${item.name}” is a very detailed 3D model (${Math.round(tris / 1000)}k triangles) and may slow things down.`, { action: ['Use simple shape', () => ((item.useModel = false), commit({ lib: true, rebuild: false }))] });
    },
    onLocked: (what) => toast(what === 'wall' ? 'This wall is locked. Unlock it in the wall panel to move it.' : 'This item is locked. Press L or use Unlock in the panel to move it.'),
    editable: () => ui.editing,
    onModelError: (item) => toast(`Couldn't load the 3D model for “${item.name}”, showing a generated one.`),
    onPointerLock: (locked) => walkHelp(locked),
  });
  viewer.library = library.items;
  viewer.wallMode = pref.get('wallMode', 'cut');
  Object.assign(viewer.display, pref.get('display', {}));
  ui.sunOn = pref.get('sunOn', false);
  const now = new Date();
  ui.sunDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  ui.sunTime = `${pad2(now.getHours())}:00`;
  // North arrow follows the camera
  viewer.frameHooks.add(() => {
    if ($('#northArrow').hidden) return;
    const az = viewer.view === 'plan' || viewer.view === 'elevation' ? 0 : viewer.orbit.azimuthAngle;
    $('#northArrow svg').style.transform = `rotate(${(design.site?.north || 0) + (az * 180) / Math.PI}deg)`;
  });
  viewer.setAssetProxy((u) => {
    const base = workerUrl();
    if (!base || !/^https?:/i.test(u) || u.startsWith(location.origin)) return u;
    return `${base}/asset?url=${encodeURIComponent(u)}`;
  });
  setQuality(viewer, ui.quality);
  applyTheme();
  viewer.setDesign(design, { refit: true });
  walker = new Walker(viewer, {
    onFloor: (fi) => {
      viewer.activeFloor = fi;
      walkHelp(!!document.pointerLockElement);
      reactUI?.bump();
    },
  });
  measure = new Measure(viewer, {
    onResult: (r) => {
      setHint(`${r.mode === 'surface' ? 'Along the surface' : r.mode === 'path' ? 'Path length' : 'Distance'}: ${r.length.toFixed(3)} m${r.mode !== 'distance' ? ` (straight line ${r.straight.toFixed(3)} m)` : ''}`);
      renderPanels();
    },
  });
  paint = new Paint(viewer, {
    edit: (fn) => {
      fn(floorNow());
      commit();
    },
    picked: (fin) => (renderPanels(), toast(`Picked up ${FINISH_NAMES[fin.kind] || fin.kind} ${fin.color}. Click to apply it.`)),
    hover: (t) => setHint(t),
  });
  tools = new Tools(viewer, {
    edit: (fn) => {
      fn(floorNow());
      tidy();
      commit();
    },
    notify: (name, msg) => {
      if (msg) toast(msg);
      if (name !== ui.tool) {
        ui.tool = name;
        renderAll();
      }
    },
    options: () => ({ exterior: ui.wallExterior, thickness: ui.wallThickness, stairShape: ui.stairShape, stairTurn: ui.stairTurn, doorWidth: ui.doorWidth, windowWidth: ui.windowWidth, openingWidth: ui.openingWidth }),
  });
  reactUI = mountUI(appApi());
  resetHistory();
  wireUI();
  renderAll();
  setSaveState('saved');

  // Live updates from AI agents (or another window) editing the same files.
  store.subscribe(async (ev) => {
    if (ev.type === 'agent') return chat.handle(ev);
    if (ev.type === 'design' && ev.id === design.id && ev.updatedAt !== lastSaved && saveTimer) {
      // Changed elsewhere while you have unsaved changes: saving runs the conflict check
      // (shows their version, keeps yours in History) instead of silently dropping yours.
      saveNow();
    } else if (ev.type === 'design' && ev.id === design.id && ev.updatedAt !== lastSaved) {
      const d = await store.load(design.id);
      if (d.updatedAt === lastSaved) return;
      const before = structuredClone(design);
      design = d;
      lastSaved = d.updatedAt;
      commit();
      const lines = describeChange(before, d, (id) => itemById(id)?.name);
      if (ev.updatedBy !== 'agent' || !lines.length) return toast('Design updated.');
      // Applied straight away; one click puts it back
      const after = structuredClone(d);
      const put = (v) => () => {
        design = normalize(structuredClone(v));
        design.updatedAt = lastSaved;
        commit();
      };
      const card = chat.addChange({ lines, undo: put(before), redo: put(after) });
      toast(`Your AI agent changed the house: ${lines.join('; ')}.`, { action: ['Undo', () => (put(before)(), (card.undone = true), chat.refresh())] });
    } else if (ev.type === 'library' && Date.now() - lastLibSave > 1500) {
      library = await store.loadLibrary();
      viewer.library = library.items;
      viewer.syncFurniture();
      renderAll();
    }
  });

  chat = createChat({
    local: store.kind === 'device',
    context: chatContext,
    onLinks: (urls) => importUrls(urls),
    onChange: () => reactUI.bump('chat'),
    onJobDone: modelJobDone,
    onRetryModel: (url, itemId, name) => retryModel(url, itemId, name),
  });

  const agents = await refreshAgentsDot();
  const firstRun = !pref.get('tourDone', false);
  if (store.kind === 'device' && !agents && !pref.get('agentsDontAsk', false) && !firstRun) openAgents();
  if (firstRun) setTimeout(startTour, 600);
  window.roomcraft = { get viewer() { return viewer; }, get design() { return design; }, get library() { return library; }, commit, addToRoom, setView, setFloor, setEditing, setTool, get walker() { return walker; } };
}

function wireUI() {
  $('#designFile').onchange = (e) => (e.target.files[0] && importDesignFile(e.target.files[0]), (e.target.value = ''));
  $('#dxfFile').onchange = (e) => (e.target.files[0] && importDxf(e.target.files[0]), (e.target.value = ''));

  // Drag & drop: links anywhere; model cards onto the view.
  let dragDepth = 0;
  const isInternal = (e) => e.dataTransfer?.types?.includes('application/x-roomcraft-item');
  const isLink = (e) => !isInternal(e) && ['text/uri-list', 'text/plain', 'text/x-moz-url'].some((t) => e.dataTransfer?.types?.includes(t));
  window.addEventListener('dragenter', (e) => isLink(e) && (dragDepth++, ($('#dropOverlay').hidden = false)));
  window.addEventListener('dragleave', (e) => isLink(e) && --dragDepth <= 0 && ((dragDepth = 0), ($('#dropOverlay').hidden = true)));
  window.addEventListener('dragover', (e) => {
    if (isLink(e) || (isInternal(e) && e.target.closest?.('#stage'))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  window.addEventListener('drop', (e) => {
    dragDepth = 0;
    $('#dropOverlay').hidden = true;
    if (isInternal(e)) {
      e.preventDefault();
      if (!e.target.closest?.('#stage')) return;
      const p = viewer.planAt(e.clientX, e.clientY);
      const inside = p && footprint(floorNow()).some((poly) => pointInPolygon(p[0], p[1], poly[0].slice(0, -1)));
      addToRoom(e.dataTransfer.getData('application/x-roomcraft-item'), inside ? p : null);
      return;
    }
    const urls = extractUrls(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/x-moz-url'));
    if (urls.length) {
      e.preventDefault();
      importUrls(urls);
    }
  });

  // Right-click: what you can do with what's under the pointer (a right-drag still pans)
  let rdown = null;
  $('#viewport').addEventListener('pointerdown', (e) => e.button === 2 && (rdown = [e.clientX, e.clientY]));
  $('#viewport').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (rdown && Math.hypot(e.clientX - rdown[0], e.clientY - rdown[1]) > 5) return;
    contextMenu(e);
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      reactUI.set({ palette: !reactUI.state.palette, menu: null });
    } else if (mod && e.key === ',') {
      e.preventDefault();
      reactUI.set({ settings: true });
    }
  });
  window.addEventListener('keydown', (e) => {
    if (/input|textarea|select/i.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === 'F1' || (e.key === '?' && !mod)) return e.preventDefault(), openDialog('help');
    const sel = viewer.sel;
    if (mod && k === 'z') (e.preventDefault(), restore(history.index + (e.shiftKey ? 1 : -1)));
    else if (mod && k === 'y') (e.preventDefault(), restore(history.index + 1));
    else if (ui.tool === 'measure' && (k === 'escape' || k === 'enter') && measure.key(k)) e.preventDefault();
    else if (k === 'escape' && viewer.view === 'elevation' && !viewer.sel) closeElevation();
    else if (k === 'escape') {
      if (viewer.view === 'walk' && !document.pointerLockElement) setView('3d');
      else if (ui.tool) setTool(null);
      else viewer.select(null);
    } else if (['1', '2', '3', '4'].includes(k) && !mod) setView({ 1: '3d', 2: 'plan', 3: 'walk', 4: 'split' }[k]);
    else if (viewer.view === 'walk') return;
    else if (mod && e.shiftKey && k === 'c') (e.preventDefault(), copyPicture());
    else if (mod && k === 'd' && sel?.type === 'item') (e.preventDefault(), duplicate(sel.id));
    else if (mod && k === 'd' && sel?.type === 'items') (e.preventDefault(), copyItems(), pasteItems({ offset: true }));
    else if (mod && k === 'c' && viewer.selectedItems().length) (e.preventDefault(), copyItems());
    else if (mod && k === 'v') (e.preventDefault(), pasteItems());
    else if (mod && k === 'a') (e.preventDefault(), selectAllItems());
    else if (k === 'l' && !mod && viewer.selectedItems().length) toggleLock();
    else if (k === 'r' && !mod && sel?.type === 'items') rotateGroup(e.shiftKey ? -90 : 90);
    else if ((k === 'delete' || k === 'backspace') && sel) (e.preventDefault(), deleteSelection());
    else if (k === 'r' && !mod && sel?.type === 'item' && !findPlaced(sel.id).p?.locked) rotateItem(findPlaced(sel.id).p, e.shiftKey ? -90 : 90);
    else if (k === 'r' && !mod && sel?.type === 'stairs' && ui.editing) {
      const s = floorNow().stairs.find((x) => x.id === sel.id);
      s.rot = ((((s.rot || 0) + (e.shiftKey ? -90 : 90)) % 360) + 360) % 360;
      commit();
    } else if (k === 'e' && !mod) setEditing(!ui.editing);
    else if (k === 'c' && !mod && !e.shiftKey) chat?.toggle();
    else if (k === 'g' && !mod) setDisplay('grid', !viewer.display.grid);
    else if (k === 'f' && !mod && viewer.view !== 'walk' && viewer.view !== 'elevation') sel ? viewer.frameSelection() : viewer.frameHouse(true);
    else if (k === 'm' && !mod) setTool(ui.tool === 'measure' ? null : 'measure');
    else if (k === 'p' && !mod && viewer.view !== 'elevation') setTool(ui.tool === 'paint' ? null : 'paint');
    else if (ui.editing && !mod && !e.shiftKey && { v: 1, w: 1, d: 1, n: 1, o: 1, s: 1 }[k]) {
      const t = { v: null, w: 'wall', d: 'door', n: 'window', o: 'opening', s: 'stairs' }[k];
      setTool(t === ui.tool ? null : t);
    } else if (k === '[' && !mod) togglePanel('left');
    else if (k === ']' && !mod) togglePanel('right');
    else if (k.startsWith('arrow') && sel?.type === 'opening' && ui.editing && (k === 'arrowleft' || k === 'arrowright')) {
      e.preventDefault();
      const f = floorNow();
      const o = f.openings.find((q) => q.id === sel.id);
      const w = f.walls.find((q) => q.id === o.wall);
      const { dir, len } = wallFrame(w);
      // Left/right along the wall as seen on screen
      const sx = Math.sign(dir[0]) || Math.sign(dir[1]);
      const step = (e.shiftKey ? 0.1 : 0.01) * (k === 'arrowright' ? sx : -sx);
      const u = Math.max(0, Math.min(len - o.width, o.offset + step)) + o.width / 2;
      moveOpening(f, o.id, [w.a[0] + dir[0] * u, w.a[1] + dir[1] * u], { reach: 0.01, snap: 0.01 });
      viewer.setDesign(design);
      renderInspector();
      clearTimeout(wireUI.nudge);
      wireUI.nudge = setTimeout(() => commit(), 400);
    }
    else if (['1', '2', '3', '4'].includes(k) && !mod) setView({ 1: '3d', 2: 'plan', 3: 'walk', 4: 'split' }[k]);
    else if (k === 'pageup') (e.preventDefault(), setFloor(viewer.activeFloor + 1));
    else if (k === 'pagedown') (e.preventDefault(), setFloor(viewer.activeFloor - 1));
    else if (k.startsWith('arrow') && (sel?.type === 'item' || sel?.type === 'items')) {
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : 0.01;
      const [dx, dz] = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
      for (const p of selectedPlaced()) {
        if (p.locked) continue;
        p.x = +(p.x + dx).toFixed(3);
        p.z = +(p.z + dz).toFixed(3);
      }
      viewer.syncFurniture();
      clearTimeout(wireUI.nudge);
      wireUI.nudge = setTimeout(() => commit({ rebuild: false }), 400);
    }
  });
  $('#toggleLeft').onclick = () => togglePanel('left');
  $('#toggleRight').onclick = () => togglePanel('right');
  for (const side of ['left', 'right']) if (pref.get('hide-' + side, false)) document.body.classList.add('hide-' + side);
}

/** Everything the React UI (js/ui) reads and calls. */
function appApi() {
  return {
    get design() { return design; },
    get library() { return library; },
    get viewer() { return viewer; },
    get store() { return store; },
    get chat() { return chat; },
    get measure() { return measure; },
    get paint() { return paint; },
    ui, history, pref, cm,
    bump: (...t) => reactUI.bump(...t),
    // lookups
    floorNow, itemById, findPlaced, dimsOf, colorOf, placedCount, selectedPlaced, clearanceProblems, floorProblems, furnitureCost, money,
    // editing
    commit, restore, tidy, toast, updateHint, setView, setEditing, setTool, setFloor, addFloorAbove, deleteFloor, setDisplay, openElevation, closeElevation,
    showAllFloors: () => (ui.tool && setTool(null), viewer.setShowAll(true), renderAll()),
    toggleWallMode: () => (viewer.setWallMode(viewer.wallMode === 'cut' ? 'up' : 'cut'), pref.set('wallMode', viewer.wallMode), renderPanels()),
    setWallKind: (ext) => ((ui.wallExterior = ext), (ui.wallThickness = ext ? DEFAULTS.exteriorWall : DEFAULTS.interiorWall), renderPanels()),
    applySun, setSunOn, useMyLocation,
    addToRoom, rotateItem, rotateGroup, againstWall, duplicate, deleteSelection, toggleLock, copyItems, pasteItems, alignItems, addOpening, moveToFloor, pickColor,
    // furniture from links and the model editor
    extractUrls, importUrls, queueAction, dismissQueue, checkWithAgent, newItem, openItemDialog, saveItem, deleteItem,
    // designs and files
    openDesign, duplicateDesign, renameDesign, deleteDesign, createHouse, openHistory, restoreVersion, openVersionCopy, pickFile,
    exportAs, shareAction, takePhoto, cancelPhoto, savePhoto, copyPicture, download, fileName,
    // agents, commands, settings
    openAgents, refreshAgentsDot, commands, runCommand, settings, setSetting, startTour,
    recentCommands: () => pref.get('recentCommands', []),
    // After the first tour, offer to connect an agent (once)
    tourEnded: async () => {
      if (store.kind !== 'device' || pref.get('agentsDontAsk', false) || ui.askedAgents) return;
      ui.askedAgents = true;
      if (!(await refreshAgentsDot())) openAgents();
    },
  };
}

function togglePanel(side) {
  document.body.classList.toggle('hide-' + side);
  pref.set('hide-' + side, document.body.classList.contains('hide-' + side));
  setTimeout(() => viewer.resize?.(), 0);
}

boot().catch((err) => {
  console.error(err);
  const l = $('#loading');
  if (l) l.textContent = "Couldn't start: " + err.message;
});
