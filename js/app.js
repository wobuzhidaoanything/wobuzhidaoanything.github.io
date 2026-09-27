import { Viewer, webglSupport } from './viewer.js';
import { Walker } from './walk.js';
import { Tools } from './tools.js';
import { initChat } from './chat.js';
import { Measure } from './measure.js';
import { Paint } from './paint.js';
import { FINISHES, FINISH_NAMES } from './materials.js';
import { paintSpan } from './house.js';
import { analyse as analyseClearance, zoneStatus, doorSwing, footprintRect } from './clearance.js';
import { setQuality } from './effects.js';
import { CATEGORY_LABELS, DEFAULT_DIMS } from './models.js';
import { openStorage } from './storage.js';
import { newHouse, newFloor, normalize, migrate, elevations, wallFrame, stairLayout, area, pointInPolygon, closestOnSegment, validate, DEFAULTS } from './design.js';
import { footprint } from './plan.js';
import { cleanFloor, syncRooms, splitWall, makeRecess, moveCorner, moveOpening, openingGaps, insideSign } from './edit.js';
import { colorFromName } from '../shared/colors.js';
import { guessCategory } from '../worker/src/scrape.js';
import { WORKER_URL } from './config.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
const cm = (m) => (m == null ? '?' : Math.round(m * 1000) / 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
  doorWidth: 0.9, windowWidth: 1.2, openingWidth: 1.0, hint: '',
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
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      lastSaved = await store.save(design);
      design.updatedAt = lastSaved;
    } catch (err) {
      toast(`Couldn't save: ${err.message}`);
    }
  }, 400);
}
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
  $('#designName').textContent = design.name;
  $('#undoBtn').disabled = history.index <= 0;
  $('#redoBtn').disabled = history.index >= history.stack.length - 1;
  $('#editBtn').classList.toggle('on', ui.editing);
  $('#editBtn').textContent = ui.editing ? 'Done editing' : 'Edit house';
  $('#furniturePanel').hidden = ui.editing;
  $('#buildPanel').hidden = !ui.editing;
  $('#qualityLabel').textContent = ui.quality === 'high' ? 'High' : 'Fast';
  renderLevelBar();
  renderToolBar();
  refreshClearance();
  if (viewer.view === 'elevation') viewer.buildElevationDims();
  if (ui.editing) renderBuildPanel();
  else renderInventory();
  renderInspector();
  updateHint();
}

function updateHint() {
  if (ui.hover) return ($('#hintbar').textContent = ui.hover);
  if (viewer.view === 'elevation') return ($('#hintbar').textContent = 'Drag furniture along the wall or up and down (e.g. to hang a TV) · scroll to zoom · drag the background to pan · Esc to go back');
  const v = viewer.view;
  const t = ui.tool;
  if (t === 'measure' && !ui.hover)
    return ($('#hintbar').textContent = {
      distance: 'Click two points to measure between them · Shift locks to one direction · Alt ignores corners · Esc cancels',
      path: 'Click points along a line or curve · double-click or Enter to finish · Esc cancels',
      surface: 'Click two points: the length is measured along the surface between them (follows curves) · Esc cancels',
    }[measure.mode]);
  $('#hintbar').textContent =
    v === 'walk'
      ? ''
      : t === 'wall'
        ? 'Click to start a wall, click again for each corner · click the start point, double-click or Esc to finish · Shift for free angles'
        : t === 'room'
          ? 'Click inside an area enclosed by walls to make it a room'
          : t && ['door', 'window', 'opening'].includes(t)
            ? `Click a wall to add ${t === 'opening' ? 'an opening' : `a ${t}`}`
            : t === 'stairs'
              ? 'Click where the stairs start; they climb away from you (rotate them afterwards)'
              : ui.editing
                ? 'Drag corners, walls, doors and stairs · double-click a wall to add a corner · V W D N O S pick tools · E to finish'
                : v === 'plan'
                  ? 'Drag furniture to move it · drag the blue dot to rotate · scroll to zoom · drag to pan'
                  : 'Drag furniture to move it · drag the blue dot to rotate · drag to orbit · right-drag to pan';
}

// ---------- level tabs & tool options ----------

function renderLevelBar() {
  const ys = elevations(design);
  const all = viewer.showAll;
  const el = $('#levelBar');
  if (viewer.view === 'elevation') {
    const e = viewer.elev;
    el.innerHTML = `<button class="on" disabled>Elevation</button><span class="lvl-note">${esc(floorNow().name)} · wall ${e.len.toFixed(2)} m · drag furniture along the wall or up and down</span><span class="sep"></span><button data-eflip title="Look at the other side of this wall">⇄ Other side</button><button data-eclose title="Back (Esc)">Close</button>`;
    $('[data-eflip]', el).onclick = () => openElevation(e.wallId, -e.side);
    $('[data-eclose]', el).onclick = closeElevation;
    return;
  }
  el.innerHTML =
    design.floors
      .map((f, i) => `<button role="tab" class="${!all && i === viewer.activeFloor ? 'on' : ''}" data-floor="${i}" title="${esc(f.name)} · level ${cm(ys[i])} cm · double-click to rename"><span class="lv">${i === 0 ? 'G' : i}</span>${esc(f.name)}</button>`)
      .join('') +
    (design.floors.length > 1 && viewer.view !== 'walk' ? `<button role="tab" class="${all ? 'on' : ''}" data-all title="See the whole house">All floors</button>` : '') +
    (ui.editing ? '<span class="sep"></span><button class="add" data-addfloor title="Add a floor above the top one">+ Floor</button>' : '') +
    ((viewer.view === '3d' || viewer.split) && !all ? `<span class="sep"></span><button data-walls title="Walls full height, or cut at 1.25 m like a plan">${viewer.wallMode === 'cut' ? 'Walls: cut' : 'Walls: full'}</button>` : '') +
    (viewer.view !== 'walk' && viewer.view !== 'elevation' ? `<span class="sep"></span><button data-paint class="${ui.tool === 'paint' ? 'on' : ''}" title="Paint walls and floors: paint, wallpaper, tiles, wood… (P)">Paint</button>` : '') +
    (viewer.view !== 'walk' ? `<button data-measure class="${ui.tool === 'measure' ? 'on' : ''}" title="Measure distances, paths and along surfaces (M)">Measure</button>` : '') +
    (viewer.view !== 'walk' ? `<span class="sep"></span><button data-viewmenu aria-haspopup="menu" title="Show or hide dimensions, areas and the grid">View ▾</button>` : '');
  $$('[data-floor]', el).forEach((b) => {
    b.onclick = () => setFloor(+b.dataset.floor);
    b.ondblclick = () => {
      const f = design.floors[+b.dataset.floor];
      const name = prompt('Floor name', f.name);
      if (name?.trim()) (f.name = name.trim()), commit({ rebuild: false });
    };
  });
  $('[data-all]', el)?.addEventListener('click', () => {
    if (ui.tool) setTool(null);
    viewer.setShowAll(true);
    renderAll();
  });
  $('[data-addfloor]', el)?.addEventListener('click', addFloorAbove);
  $('[data-measure]', el)?.addEventListener('click', () => setTool(ui.tool === 'measure' ? null : 'measure'));
  $('[data-paint]', el)?.addEventListener('click', () => setTool(ui.tool === 'paint' ? null : 'paint'));
  $('[data-viewmenu]', el)?.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#viewMenu');
    if (!m.hidden) return (m.hidden = true);
    renderViewMenu();
    const r = e.currentTarget.getBoundingClientRect(), s = $('#stage').getBoundingClientRect();
    Object.assign(m.style, { left: `${r.right - s.left - 230}px`, top: `${r.bottom - s.top + 6}px` });
    m.hidden = false;
  });
  $('[data-walls]', el)?.addEventListener('click', () => {
    viewer.setWallMode(viewer.wallMode === 'cut' ? 'up' : 'cut');
    pref.set('wallMode', viewer.wallMode);
    renderLevelBar();
  });
}

const DISPLAY = [
  ['clear', 'Clearances', 'Space furniture needs to be used and doors need to open. Problems get a red outline'],
  ['dims', 'Dimensions', 'Lengths of every outside wall and room sizes, drawn on the floor'],
  ['areas', 'Room areas', 'Floor area of each room (m²)'],
  ['grid', 'Grid', '1 m squares, with 10 cm squares when you zoom in'],
  ['snap', 'Snap to grid', 'Walls, corners and furniture move in 5 cm steps (hold Alt to move freely)'],
];

function renderViewMenu() {
  const m = $('#viewMenu');
  m.innerHTML = DISPLAY.map(([k, name, tip]) => `<label title="${esc(tip)}"><input type="checkbox" data-disp="${k}" ${viewer.display[k] ? 'checked' : ''}><span><b>${name}</b><em>${esc(tip)}</em></span></label>`).join('');
  $$('[data-disp]', m).forEach((c) => (c.onchange = () => setDisplay(c.dataset.disp, c.checked)));
}

function setDisplay(k, on) {
  viewer.setDisplay(k, on);
  if (k === 'clear') refreshClearance();
  pref.set('display', viewer.display);
  if (!$('#viewMenu').hidden) renderViewMenu();
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
  $$('#viewSeg button').forEach((b) => b.classList.remove('on'));
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
function renderToolBar() {
  const el = $('#toolBar');
  const t = ui.tool;
  el.hidden = !t;
  if (!t) return (el.innerHTML = '');
  const seg = (attr, opts, cur) => `<div class="small-seg">${opts.map(([k, n]) => `<button data-${attr}="${k}" class="${cur === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const widthKey = { door: 'doorWidth', window: 'windowWidth', opening: 'openingWidth' }[t];
  el.innerHTML =
    `<b>${{ wall: 'Wall', door: 'Door', window: 'Window', opening: 'Opening', stairs: 'Stairs', measure: 'Measure', paint: 'Paint' }[t]}</b>` +
    (t === 'paint' ? `<select id="tbFinish" title="Finish">${FINISHES.map((f) => `<option value="${f.kind}" ${paint.finish.kind === f.kind ? 'selected' : ''}>${f.name}</option>`).join('')}</select><input type="color" id="tbFinishColor" value="${esc(paint.finish.color)}" title="Colour">` + seg('pscope', [['surface', 'One side'], ['room', 'Whole room']], paint.scope) + '<span>Alt+click picks up a finish</span>' : '') +
    (t === 'measure' ? seg('mmode', [['distance', 'Distance'], ['path', 'Path'], ['surface', 'Along surface']], measure.mode) + `<button class="tb-btn" id="tbClearMeasure" ${measure.results.length ? '' : 'disabled'}>Clear all</button>` : '') +
    (t === 'wall' ? seg('ext', [['0', 'Interior'], ['1', 'Exterior']], ui.wallExterior ? '1' : '0') + `<label>Thickness <input type="number" id="tbThick" min="5" max="60" step="1" value="${cm(ui.wallThickness)}"> cm</label>` : '') +
    (widthKey ? `<label>Width <input type="number" id="tbWidth" min="30" max="400" step="5" value="${cm(ui[widthKey])}"> cm</label>` : '') +
    (t === 'stairs' ? seg('sshape', [['straight', 'Straight'], ['L', 'L-turn'], ['U', 'U-turn']], ui.stairShape) + (ui.stairShape !== 'straight' ? seg('sturn', [['left', 'Turn left'], ['right', 'Turn right']], ui.stairTurn) : '') : '') +
    '<span>Esc to finish</span><button class="x" id="tbClose" title="Stop (Esc)">×</button>';
  $$('[data-ext]', el).forEach((b) => (b.onclick = () => {
    ui.wallExterior = b.dataset.ext === '1';
    ui.wallThickness = ui.wallExterior ? DEFAULTS.exteriorWall : DEFAULTS.interiorWall;
    renderToolBar();
  }));
  $('#tbThick', el)?.addEventListener('change', (e) => (ui.wallThickness = Math.max(0.05, parseFloat(e.target.value) / 100 || ui.wallThickness)));
  $('#tbWidth', el)?.addEventListener('change', (e) => (ui[widthKey] = Math.max(0.3, parseFloat(e.target.value) / 100 || ui[widthKey])));
  $('#tbFinish', el)?.addEventListener('change', (e) => {
    paint.finish = { kind: e.target.value, color: FINISHES.find((f) => f.kind === e.target.value).color };
    renderToolBar();
  });
  $('#tbFinishColor', el)?.addEventListener('input', (e) => (paint.finish = { ...paint.finish, color: e.target.value }));
  $$('[data-pscope]', el).forEach((b) => (b.onclick = () => ((paint.scope = b.dataset.pscope), renderToolBar())));
  $$('[data-mmode]', el).forEach((b) => (b.onclick = () => (measure.setMode(b.dataset.mmode), renderToolBar(), updateHint())));
  $('#tbClearMeasure', el)?.addEventListener('click', () => (measure.clear(), renderToolBar()));
  $$('[data-sshape]', el).forEach((b) => (b.onclick = () => ((ui.stairShape = b.dataset.sshape), renderToolBar())));
  $$('[data-sturn]', el).forEach((b) => (b.onclick = () => ((ui.stairTurn = b.dataset.sturn), renderToolBar())));
  $('#tbClose', el).onclick = () => setTool(null);
}

// ---------- furniture inventory ----------

const ICONS = {
  default: '<svg viewBox="0 0 32 32"><rect x="5" y="11" width="22" height="12" rx="3"/><path d="M8 23v3M24 23v3"/></svg>',
  sofa: '<svg viewBox="0 0 32 32"><rect x="4" y="13" width="24" height="9" rx="3"/><rect x="7" y="8" width="18" height="7" rx="2"/><path d="M7 22v3M25 22v3"/></svg>',
  bed: '<svg viewBox="0 0 32 32"><rect x="4" y="15" width="24" height="7" rx="2"/><path d="M5 22v3M27 22v3M5 15V8M9 13h6"/></svg>',
  plant: '<svg viewBox="0 0 32 32"><path d="M11 20h10l-1.5 7h-7z"/><path d="M16 20c0-6-5-9-8-9 0 5 4 8 8 9zM16 20c0-7 4-11 8-11 0 6-4 10-8 11z"/></svg>',
  lamp: '<svg viewBox="0 0 32 32"><path d="M11 5h10l3 8H8z"/><path d="M16 13v14M11 27h10"/></svg>',
  rug: '<svg viewBox="0 0 32 32"><rect x="5" y="9" width="22" height="14" rx="1"/><rect x="9" y="12" width="14" height="8"/></svg>',
};
const iconFor = (cat) => ICONS[cat] || ICONS[{ armchair: 'sofa', floorlamp: 'lamp' }[cat]] || ICONS.default;
const placedCount = (itemId) => design.floors.reduce((n, f) => n + f.placed.filter((p) => p.itemId === itemId).length, 0);

function renderInventory() {
  const q = $('#invSearch').value.trim().toLowerCase();
  const list = library.items.filter((i) => !q || i.name.toLowerCase().includes(q) || (CATEGORY_LABELS[i.category] || '').toLowerCase().includes(q));
  $('#invCount').textContent = library.items.length;
  const el = $('#inventory');
  if (!library.items.length) return (el.innerHTML = '<div class="empty">No models yet.<br>Paste a product link above or add a custom model.</div>');
  if (!list.length) return (el.innerHTML = '<div class="empty">No matches.</div>');
  el.innerHTML = list
    .map((i) => {
      const d = dimsOf(i);
      const n = placedCount(i.id);
      const pick = ui.pickedColor[i.id] || i.colors?.[0]?.name;
      return `<div class="card" draggable="true" data-id="${esc(i.id)}" title="Drag into the room">
        <div class="thumb" style="${i.image ? `background-image:url('${esc(i.image)}')` : ''}">${i.image ? '' : iconFor(i.category)}</div>
        <div>
          <div class="nm">${esc(i.name)}</div>
          ${i.verified === false ? '<div class="badge-unverified" title="Added by an AI agent and not yet checked against a render">Unverified</div>' : ''}
          <div class="sz ${i.needsDims ? 'missing' : ''}">${i.needsDims ? '⚠ Check size · ' : ''}${cm(d.w)} × ${cm(d.d)} × ${cm(d.h)} cm${n ? ` · ${n} placed` : ''}</div>
          <div class="swatches">${(i.colors || []).slice(0, 10).map((c) => `<button class="sw ${c.name === pick ? 'on' : ''}" data-color="${esc(c.name)}" title="${esc(c.name)}" style="background:${esc(c.hex)}"></button>`).join('')}${i.colors?.length > 10 ? `<span class="hint">+${i.colors.length - 10}</span>` : ''}</div>
        </div>
        <div class="card-actions">
          <button class="btn small primary" data-act="add">Add</button>
          <button class="btn small ghost" data-act="edit">Edit</button>
        </div>
      </div>`;
    })
    .join('');
}

// ---------- inspector ----------

function renderInspector() {
  const el = $('#inspector');
  const s = viewer.sel;
  if (viewer.view === 'walk') return (el.innerHTML = walkInspector());
  if (s?.type === 'item') return itemInspector(el, s.id);
  if (s?.type === 'items') return multiInspector(el);
  if (s?.type === 'wall') return wallInspector(el, s.id);
  if (s?.type === 'opening') return openingInspector(el, s.id);
  if (s?.type === 'stairs') return stairsInspector(el, s.id);
  if (s?.type === 'room') return roomInspector(el, s.id);
  return floorInspector(el);
}

function walkInspector() {
  const f = floorNow();
  return `<div class="insp"><h3>Walking</h3><div class="sub">You're on ${esc(f.name)}</div>
    <div class="tip">Click the view to look around with your mouse. <b>W A S D</b> or the arrow keys to walk, <b>Shift</b> to hurry, scroll to step. Walk onto the stairs to change floors. <b>Esc</b> releases the mouse; press it again to leave.</div>
    <div class="group" style="margin-top:14px"><button class="btn" style="width:100%" id="leaveWalk">Back to 3D view</button></div></div>`;
}

const field = (label, attrs) => `<label>${label}<input ${attrs}></label>`;

function itemInspector(el, id) {
  const { p, floor } = findPlaced(id);
  const item = p && itemById(p.itemId);
  if (!item) return (el.innerHTML = '');
  const d = dimsOf(item);
  const cur = colorOf(item, p);
  const custom = p.color?.startsWith?.('#');
  el.innerHTML = `<div class="insp">
    ${item.image ? `<div class="hero" style="background-image:url('${esc(item.image)}')"></div>` : ''}
    <h3>${esc(item.name)}</h3>
    <div class="sub">${esc(CATEGORY_LABELS[item.category] || item.category)} · ${esc(floor.name)}${item.price ? ` · ${esc(item.currency || '')} ${esc(item.price)}` : ''}${item.url ? ` · <a href="${esc(item.url)}" target="_blank" rel="noopener">Product ↗</a>` : ''}</div>
    ${item.verified === false ? '<div class="note">Added by an AI agent and not yet visually checked.</div>' : ''}
    ${clearanceProblems().filter((x) => x.placedId === p.id).map((x) => `<div class="note warn">⚠ ${esc(x.message)}.</div>`).join('')}
    <div class="group"><div class="lbl">Colour <span>${esc(cur?.name || '')}</span></div>
      <div class="color-list">
        ${(item.colors || []).map((c) => `<button class="color-chip ${!custom && c.name === cur?.name ? 'on' : ''}" data-color="${esc(c.name)}"><span class="dot" style="background:${esc(c.hex)}"></span>${esc(c.name)}</button>`).join('')}
        <label class="color-chip ${custom ? 'on' : ''}" title="Any colour"><input type="color" id="customColor" value="${esc(custom ? p.color : cur?.hex || '#cccccc')}">Custom</label>
      </div>
    </div>
    <div class="group"><div class="lbl">Size <button class="btn small ghost" id="editSize">Edit model</button></div><div>${cm(d.w)} W × ${cm(d.d)} D × ${cm(d.h)} H cm</div></div>
    <div class="group"><div class="lbl">Rotate <span>${Math.round(p.rot || 0)}°</span></div>
      <div class="row"><button class="btn small" data-rot="-90">↺ 90°</button><button class="btn small" data-rot="-15">↺ 15°</button><button class="btn small" data-rot="15">↻ 15°</button><button class="btn small" data-rot="90">↻ 90°</button></div>
    </div>
    <div class="group"><div class="lbl">Position (cm)</div>
      <div class="num-row">${field('X', `type="number" step="1" data-pos="x" value="${cm(p.x)}"`)}${field('Z', `type="number" step="1" data-pos="z" value="${cm(p.z)}"`)}${field('Lift', `type="number" step="1" min="0" data-pos="y" value="${cm(p.y || 0)}"`)}</div>
    </div>
    ${design.floors.length > 1 ? `<div class="group"><div class="lbl">Floor</div><select id="moveFloor">${design.floors.map((f) => `<option value="${esc(f.id)}" ${f === floor ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>` : ''}
    ${item.modelUrl ? `<div class="group"><label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" id="useModel" ${item.useModel !== false ? 'checked' : ''}> Use the store's 3D model</label></div>` : ''}
    <div class="group"><div class="row"><button class="btn small" id="wallBtn">Against wall</button><button class="btn small" id="dupBtn" title="Ctrl+D">Duplicate</button></div>
      <div class="row" style="margin-top:6px"><button class="btn small ${p.locked ? 'on' : ''}" id="lockBtn" title="A locked item can't be moved, turned or deleted by accident (L)">${p.locked ? '🔒 Locked' : 'Lock'}</button><button class="btn small danger" id="removeBtn" title="Delete">Remove</button></div></div>
  </div>`;
  $$('.color-chip[data-color]', el).forEach((b) => (b.onclick = () => ((p.color = b.dataset.color), commit({ rebuild: false }))));
  $('#customColor', el).oninput = (e) => ((p.color = e.target.value), viewer.syncFurniture());
  $('#customColor', el).onchange = () => commit({ rebuild: false });
  $('#editSize', el).onclick = () => openItemDialog(item);
  $$('[data-rot]', el).forEach((b) => (b.onclick = () => rotateItem(p, +b.dataset.rot)));
  $$('[data-pos]', el).forEach((inp) => (inp.onchange = () => {
    const v = parseFloat(inp.value) / 100;
    if (Number.isFinite(v)) (p[inp.dataset.pos] = inp.dataset.pos === 'y' ? Math.max(0, v) : v), commit({ rebuild: false });
  }));
  if ($('#moveFloor', el)) $('#moveFloor', el).onchange = (e) => {
    const to = design.floors.find((f) => f.id === e.target.value);
    floor.placed = floor.placed.filter((x) => x !== p);
    to.placed.push(p);
    commit({ rebuild: false });
    viewer.setActiveFloor(design.floors.indexOf(to));
    viewer.select({ type: 'item', id: p.id });
    renderAll();
  };
  if ($('#useModel', el)) $('#useModel', el).onchange = (e) => ((item.useModel = e.target.checked), commit({ lib: true, rebuild: false }));
  $('#wallBtn', el).onclick = () => (againstWall(p, floor), commit({ rebuild: false }));
  $('#dupBtn', el).onclick = () => duplicate(id);
  $('#lockBtn', el).onclick = () => toggleLock();
  $('#removeBtn', el).onclick = () => deleteSelection();
}

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

function multiInspector(el) {
  const ps = selectedPlaced();
  const locked = ps.filter((p) => p.locked).length;
  const btn = (k, label, tip, dis = false) => `<button class="btn small icon-txt" data-align="${k}" title="${tip}" ${dis ? 'disabled' : ''}>${label}</button>`;
  el.innerHTML = `<div class="insp"><h3>${ps.length} items</h3><div class="sub">${esc(ps.map((p) => itemById(p.itemId)?.name).filter(Boolean).slice(0, 4).join(', '))}${ps.length > 4 ? '…' : ''}${locked ? ` · ${locked} locked` : ''}</div>
    <div class="group"><div class="lbl">Align</div>
      <div class="row">${btn('left', '⇤ Left', 'Line up their left edges')}${btn('cx', '↔ Centre', 'Line up their centres (left–right)')}${btn('right', 'Right ⇥', 'Line up their right edges')}</div>
      <div class="row" style="margin-top:6px">${btn('top', '⤒ Back', 'Line up their back edges (top of the plan)')}${btn('cz', '↕ Middle', 'Line up their centres (front–back)')}${btn('bottom', 'Front ⤓', 'Line up their front edges (bottom of the plan)')}</div></div>
    <div class="group"><div class="lbl">Distribute</div>
      <div class="row">${btn('dx', '↔ Evenly across', 'Equal gaps from left to right', ps.length < 3)}${btn('dz', '↕ Evenly down', 'Equal gaps from back to front', ps.length < 3)}</div></div>
    <div class="group"><div class="row"><button class="btn small" id="mRot">↻ Rotate 90°</button><button class="btn small" id="mDup" title="Ctrl+D">Duplicate</button><button class="btn small" id="mCopy" title="Ctrl+C">Copy</button></div>
      <div class="row" style="margin-top:6px"><button class="btn small" id="mLock">${locked === ps.length ? 'Unlock all' : 'Lock all'}</button><button class="btn small danger" id="mDel">Remove</button></div></div>
    <div class="tip">Shift-click adds or removes items. Shift-drag on the floor draws a selection box. Drag any selected item to move them together.</div></div>`;
  $$('[data-align]', el).forEach((b) => (b.onclick = () => alignItems(b.dataset.align)));
  $('#mRot', el).onclick = () => rotateGroup(90);
  $('#mDup', el).onclick = () => (copyItems(), pasteItems({ offset: true }));
  $('#mCopy', el).onclick = () => copyItems();
  $('#mLock', el).onclick = () => toggleLock();
  $('#mDel', el).onclick = () => deleteSelection();
}

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

function wallInspector(el, id) {
  const f = floorNow();
  const w = f.walls.find((x) => x.id === id);
  if (!w) return (el.innerHTML = '');
  const { len } = wallFrame(w);
  const ops = f.openings.filter((o) => o.wall === id).sort((a, b) => a.offset - b.offset);
  const edit = ui.editing;
  const rw = Math.min(2, Math.max(0.5, +(len / 3).toFixed(2)));
  el.innerHTML = `<div class="insp"><h3>Wall</h3><div class="sub">${esc(f.name)} · ${w.exterior ? 'exterior' : 'interior'} · ${cm(len)} cm</div>
    ${edit ? `<div class="group"><div class="num-row" style="grid-template-columns:1fr 1fr">${field('Length (cm)', `type="number" min="10" step="1" id="wLen" value="${cm(len)}"`)}${field('Thickness (cm)', `type="number" min="5" max="60" step="1" id="wThick" value="${cm(w.thickness)}"`)}</div>
      <label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" id="wExt" ${w.exterior ? 'checked' : ''}> Exterior wall</label>
      <label class="row" style="gap:8px;margin-top:6px" title="A locked wall can't be dragged, pushed or deleted by accident"><input type="checkbox" id="wLock" ${w.locked ? 'checked' : ''}> Locked</label></div>
    <div class="group"><div class="lbl">Add to this wall</div><div class="row"><button class="btn small" data-add="door">+ Door</button><button class="btn small" data-add="window">+ Window</button><button class="btn small" data-add="opening">+ Opening</button></div></div>
    <div class="group"><div class="lbl">Recess or bay</div>
      <div class="num-row">${field('From start', `type="number" min="0" step="5" id="rStart" value="${cm((len - rw) / 2)}"`)}${field('Width', `type="number" min="20" step="5" id="rWidth" value="${cm(rw)}"`)}${field('Depth', `type="number" min="5" step="5" id="rDepth" value="60"`)}</div>
      <div class="row" style="margin-top:8px"><button class="btn small" id="rIn" title="Push part of the wall into the building">Make recess</button><button class="btn small" id="rOut" title="Push part of the wall outward">Make bay</button></div></div>` : ''}
    <div class="group"><div class="lbl">Finish</div>${['l', 'r'].map((sd) => {
      const list = [].concat(w.finishes?.[sd] || []);
      const names = [...new Set(list.map((x) => FINISH_NAMES[x.kind] || x.kind))].join(' + ');
      return `<div class="finish-row">${list.length ? list.slice(0, 4).map((x) => `<span class="sw" style="background:${esc(x.color)}"></span>`).join('') : `<span class="sw" style="background:${esc(design.wallColor || '#efebe4')}"></span>`}<span>${sd === 'l' ? 'Side A' : 'Side B'}: ${esc(list.length ? names : 'house colour')}</span>${list.length ? `<button class="btn small ghost" data-unfinish="${sd}" title="Back to the house wall colour">Reset</button>` : ''}</div>`;
    }).join('')}<p class="hint" style="margin:6px 0 0">Use <b>Paint</b> (P) to change a side.</p></div>
    <div class="group"><button class="btn small" id="wElev" title="Look straight at this wall, with heights">Elevation view</button></div>
    ${ops.length ? `<div class="group"><div class="lbl">On this wall</div>${ops.map((o) => `<button class="btn small ghost list-btn" data-op="${esc(o.id)}"><span>${o.type === 'door' ? 'Door' : o.type === 'window' ? 'Window' : 'Opening'} · ${cm(o.width)} cm</span><em>${cm(o.offset)} cm in</em></button>`).join('')}</div>` : ''}
    ${edit ? `<div class="group"><div class="row"><button class="btn small" id="wSplit" title="Adds a corner in the middle; drag it to angle the wall">Add corner</button><button class="btn small danger" id="wDel">Delete wall</button></div></div>
    <div class="tip">Drag the wall to push or pull it: square neighbours stretch, others get a step. Drag the dots to move corners (Shift for any angle). Double-click a wall to add a corner there.</div>` : '<div class="tip">Turn on <b>Edit house</b> (E) to change walls.</div>'}</div>`;
  $$('[data-op]', el).forEach((b) => (b.onclick = () => viewer.select({ type: 'opening', id: b.dataset.op })));
  $('#wElev', el).onclick = () => openElevation(id);
  $$('[data-unfinish]', el).forEach((b) => (b.onclick = () => {
    delete w.finishes[b.dataset.unfinish];
    commit();
  }));
  if (!edit) return;
  $('#wLen', el).onchange = (e) => {
    const L = parseFloat(e.target.value) / 100;
    if (!(L >= 0.1)) return renderInspector();
    const { dir } = wallFrame(w);
    moveCorner(f, w.b.slice(), [+(w.a[0] + dir[0] * L).toFixed(4), +(w.a[1] + dir[1] * L).toFixed(4)]);
    tidy(f);
    commit();
  };
  $('#wThick', el).onchange = (e) => {
    const t = parseFloat(e.target.value) / 100;
    if (t >= 0.05 && t <= 0.6) (w.thickness = t), tidy(f), commit();
    else renderInspector();
  };
  $('#wExt', el).onchange = (e) => ((w.exterior = e.target.checked), commit());
  $('#wLock', el).onchange = (e) => (e.target.checked ? (w.locked = true) : delete w.locked, commit({ rebuild: false }));
  $$('[data-add]', el).forEach((b) => (b.onclick = () => {
    const type = b.dataset.add;
    const width = Math.min(ui[type + 'Width'], len - 0.2);
    if (width < (type === 'door' ? 0.6 : 0.3)) return toast('This wall is too short for that.');
    const oid = uid('o');
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    const probe = structuredClone(f);
    probe.openings.push({ id: oid, type, wall: w.id, offset: 0, width, height: 1, sill: 0 });
    if (!moveOpening(probe, oid, mid, { reach: 0.01 })) return toast('No free space left on this wall.');
    const offset = probe.openings.find((o) => o.id === oid).offset;
    f.openings.push({ id: oid, type, wall: w.id, offset, width, height: type === 'window' ? Math.min(1.3, f.height - 1) : Math.min(2.1, f.height - 0.1), sill: type === 'window' ? 0.9 : 0 });
    commit();
    viewer.select({ type: 'opening', id: oid });
  }));
  const recess = (sign) => {
    const start = parseFloat($('#rStart', el).value) / 100;
    const width = parseFloat($('#rWidth', el).value) / 100;
    const depth = parseFloat($('#rDepth', el).value) / 100;
    if (!(start >= 0 && width >= 0.2 && depth >= 0.05)) return toast('Enter a start, width (20 cm or more) and depth.');
    if (start + width > len + 1e-6) return toast(`That runs past the end of the wall (${cm(len)} cm).`);
    const cut = f.openings.find((o) => o.wall === w.id && o.offset < start + width && o.offset + o.width > start && (o.offset < start || o.offset + o.width > start + width));
    if (cut) return toast(`A ${cut.type} crosses the edge of that ${sign > 0 ? 'recess' : 'bay'}. Move it or change the numbers.`);
    const mid = makeRecess(f, w.id, { start, width, depth: sign * depth });
    tidy(f);
    commit();
    viewer.select({ type: 'wall', id: mid });
    toast(sign > 0 ? 'Recess made. Drag the back wall to change its depth.' : 'Bay made. Drag the front wall to change its depth.', { undo: true });
  };
  $('#rIn', el).onclick = () => recess(1);
  $('#rOut', el).onclick = () => recess(-1);
  $('#wSplit', el).onclick = () => {
    if (!splitWall(f, w.id, len / 2)) return toast('This wall is too short to split.');
    commit();
    toast('Corner added in the middle. Drag its dot to move it.');
  };
  $('#wDel', el).onclick = () => deleteSelection();
}

function openingInspector(el, id) {
  const f = floorNow();
  const o = f.openings.find((x) => x.id === id);
  if (!o) return (el.innerHTML = '');
  const w = f.walls.find((x) => x.id === o.wall);
  const { len } = wallFrame(w);
  const g = openingGaps(f, id);
  const name = o.type === 'door' ? 'Door' : o.type === 'window' ? 'Window' : 'Opening';
  if (!ui.editing) return (el.innerHTML = `<div class="insp"><h3>${name}</h3><div class="sub">${esc(f.name)} · ${cm(o.width)} × ${cm(o.height)} cm</div><div class="tip">Turn on <b>Edit house</b> (E) to change it.</div></div>`);
  el.innerHTML = `<div class="insp"><h3>${name}</h3><div class="sub">${esc(f.name)} · on a ${cm(len)} cm wall</div>
    <div class="group"><div class="lbl">Type</div><div class="seg small-seg">${['door', 'window', 'opening'].map((t) => `<button data-type="${t}" class="${o.type === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
    <div class="group"><div class="num-row">${field('Width', `type="number" min="30" step="1" data-k="width" value="${cm(o.width)}"`)}${field('Height', `type="number" min="30" step="1" data-k="height" value="${cm(o.height)}"`)}${o.type === 'window' ? field('Sill', `type="number" min="0" step="1" data-k="sill" value="${cm(o.sill)}"`) : '<span></span>'}</div></div>
    <div class="group"><div class="lbl">Position <span>${cm(g.left)} cm clear · ${cm(g.right)} cm clear</span></div><div class="num-row" style="grid-template-columns:1fr 1fr">${field('From start', `type="number" min="0" step="1" data-pos="start" value="${cm(o.offset)}"`)}${field('From end', `type="number" min="0" step="1" data-pos="end" value="${cm(len - o.offset - o.width)}"`)}</div></div>
    ${o.type === 'door' ? `<div class="group"><div class="lbl">Swing</div><div class="row"><button class="btn small" id="oHinge" title="Hinge on the other side">⇄ Hinge side</button><button class="btn small" id="oSwing" title="Open to the other side of the wall">⇅ Flip swing</button></div><label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" id="oOpen" ${o.open ? 'checked' : ''}> Shown open</label></div>` : ''}
    <div class="group"><button class="btn small danger" id="oDel">Delete</button></div>
    <div class="tip">Drag it along the wall, or onto another wall. It stops at other doors and windows. Arrow keys nudge it 1 cm (Shift: 10 cm).</div></div>`;
  $$('[data-type]', el).forEach((b) => (b.onclick = () => {
    o.type = b.dataset.type;
    if (o.type === 'window') Object.assign(o, { sill: 0.9, height: Math.min(o.height, 1.4, f.height - 1) });
    else Object.assign(o, { sill: 0, height: Math.min(2.1, f.height - 0.1), width: o.type === 'door' ? Math.max(o.width, 0.6) : o.width });
    tidy(f);
    commit();
  }));
  const place = (offset) => {
    // Through moveOpening so it never overlaps a neighbour or leaves the wall.
    const { dir } = wallFrame(w);
    const u = Math.max(0, Math.min(len - o.width, offset)) + o.width / 2;
    moveOpening(f, id, [w.a[0] + dir[0] * u, w.a[1] + dir[1] * u], { reach: 0.01, snap: 0.01 });
  };
  $$('[data-k]', el).forEach((inp) => (inp.onchange = () => {
    const v = parseFloat(inp.value) / 100;
    const k = inp.dataset.k;
    const min = { width: o.type === 'door' ? 0.6 : 0.3, height: 0.3, sill: 0 }[k];
    if (!Number.isFinite(v) || v < min) return toast(`Minimum ${cm(min)} cm.`), renderInspector();
    if (k === 'width') {
      const room = g.left + g.right + o.width - 0.1;
      if (v > room) return toast(`Only ${cm(room)} cm free here.`), renderInspector();
      const grow = v - o.width;
      o.width = v;
      if (g.right < grow + 0.05) o.offset = Math.max(0.05, o.offset - (grow + 0.05 - g.right));
    } else if (k === 'height') o.height = Math.min(v, f.height - (o.type === 'window' ? o.sill : 0) - 0.05);
    else o.sill = Math.min(v, f.height - o.height - 0.05);
    tidy(f);
    commit();
  }));
  $$('[data-pos]', el).forEach((inp) => (inp.onchange = () => {
    const v = parseFloat(inp.value) / 100;
    if (!Number.isFinite(v) || v < 0) return renderInspector();
    place(inp.dataset.pos === 'start' ? v : len - o.width - v);
    commit();
  }));
  if ($('#oOpen', el)) $('#oOpen', el).onchange = (e) => ((o.open = e.target.checked), commit());
  if ($('#oSwing', el)) $('#oSwing', el).onclick = () => ((o.swing = o.swing === 'out' ? 'in' : 'out'), commit());
  if ($('#oHinge', el)) $('#oHinge', el).onclick = () => ((o.hinge = o.hinge === 'end' ? 'start' : 'end'), commit());
  $('#oDel', el).onclick = () => deleteSelection();
}

function stairsInspector(el, id) {
  const f = floorNow();
  const s = f.stairs.find((x) => x.id === id);
  if (!s) return (el.innerHTML = '');
  const ys = elevations(design);
  const fi = viewer.activeFloor;
  const H = ys[fi + 1] - ys[fi];
  const L = stairLayout(s, H);
  const stats = `<div class="stat-grid"><div><b>${L.n}</b><span>steps</span></div><div><b>${Math.round(L.riser * 1000)}</b><span>mm rise</span></div><div><b>${Math.round(L.going * 1000)}</b><span>mm tread</span></div><div><b>${cm(H)}</b><span>cm climb</span></div></div>`;
  if (!ui.editing) return (el.innerHTML = `<div class="insp"><h3>Stairs</h3><div class="sub">${esc(f.name)} → ${esc(design.floors[fi + 1]?.name || '')}</div>${stats}<div class="tip">Turn on <b>Edit house</b> to change them.</div></div>`);
  el.innerHTML = `<div class="insp"><h3>Stairs</h3><div class="sub">${esc(f.name)} → ${esc(design.floors[fi + 1]?.name || '')}</div>${stats}
    <div class="group"><div class="lbl">Shape</div><div class="seg small-seg">${[['straight', 'Straight'], ['L', 'L-turn'], ['U', 'U-turn']].map(([k, t]) => `<button data-shape="${k}" class="${s.shape === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    ${s.shape !== 'straight' ? `<div class="group"><div class="lbl">Turns</div><div class="seg small-seg">${['left', 'right'].map((k) => `<button data-turn="${k}" class="${s.turn === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>` : ''}
    <div class="group"><div class="num-row" style="grid-template-columns:1fr">${field('Width (cm)', `type="number" min="60" max="200" step="5" id="sWidth" value="${cm(s.width)}"`)}</div></div>
    <div class="group"><div class="lbl">Rotate <span>${Math.round(s.rot || 0)}°</span></div><div class="row"><button class="btn small" data-srot="-90">↺ 90°</button><button class="btn small" data-srot="90">↻ 90°</button></div></div>
    <div class="group"><button class="btn small danger" id="sDel">Delete stairs</button></div>
    <div class="tip">Step height and tread depth follow real building rules (max 18 cm rise, 2 × rise + tread ≈ 63 cm) and adjust to the floor-to-floor height automatically. The stairwell is cut in the floor above.</div></div>`;
  $$('[data-shape]', el).forEach((b) => (b.onclick = () => ((s.shape = b.dataset.shape), commit())));
  $$('[data-turn]', el).forEach((b) => (b.onclick = () => ((s.turn = b.dataset.turn), commit())));
  $('#sWidth', el).onchange = (e) => {
    const v = parseFloat(e.target.value) / 100;
    if (v >= 0.6) (s.width = v), commit();
  };
  $$('[data-srot]', el).forEach((b) => (b.onclick = () => ((s.rot = ((((s.rot || 0) + +b.dataset.srot) % 360) + 360) % 360), commit())));
  $('#sDel', el).onclick = () => deleteSelection();
}

function roomInspector(el, id) {
  const f = floorNow();
  const r = f.rooms.find((x) => x.id === id);
  if (!r) return (el.innerHTML = '');
  const items = f.placed.filter((p) => pointInPolygon(p.x, p.z, r.points));
  el.innerHTML = `<div class="insp"><h3>${esc(r.name || 'Room')}</h3><div class="sub">${esc(f.name)} · ${Math.abs(area(r.points)).toFixed(1)} m²</div>
    <div class="group"><label class="field-label">Name<input id="rName" value="${esc(r.name || '')}"></label></div>
    <div class="group"><div class="lbl">Floor finish</div><div class="swatch-input"><select id="rKind">${['wood', 'tiles', 'carpet', 'concrete'].map((k) => `<option ${r.floorKind === k ? 'selected' : ''}>${k}</option>`).join('')}</select><input type="color" id="rColor" value="${esc(r.floorColor || '#c49a6c')}"></div></div>
    <div class="group"><div class="lbl">Ceiling</div><div class="swatch-input"><select id="rCeilKind">${FINISHES.filter((x) => ['paint', 'wood', 'concrete', 'tiles'].includes(x.kind)).map((x) => `<option value="${x.kind}" ${(r.ceiling?.kind || 'paint') === x.kind ? 'selected' : ''}>${x.name}</option>`).join('')}</select><input type="color" id="rCeilColor" value="${esc(r.ceiling?.color || '#f6f5f2')}"></div></div>
    <div class="group"><div class="lbl">Walls of this room</div><div class="swatch-input"><select id="rWallKind">${FINISHES.filter((x) => x.kind !== 'carpet').map((x) => `<option value="${x.kind}">${x.name}</option>`).join('')}</select><input type="color" id="rWallColor" value="${esc(design.wallColor || '#efebe4')}"><button class="btn small" id="rWallApply">Apply</button></div></div>
    ${items.length ? `<div class="group"><div class="lbl">In this room</div>${items.map((p) => `<button class="btn small ghost list-btn" data-sel="${esc(p.id)}">${esc(itemById(p.itemId)?.name || 'Item')}</button>`).join('')}</div>` : ''}
    ${ui.editing ? '<div class="tip">Rooms follow the walls. Delete or move a wall to merge or reshape rooms.</div>' : ''}</div>`;
  $('#rName', el).onchange = (e) => ((r.name = e.target.value.trim()), commit());
  $('#rKind', el).onchange = (e) => ((r.floorKind = e.target.value), commit());
  $('#rColor', el).oninput = (e) => (r.floorColor = e.target.value);
  $('#rColor', el).onchange = () => commit();
  const ceil = () => ((r.ceiling = { kind: $('#rCeilKind', el).value, color: $('#rCeilColor', el).value }), commit());
  $('#rCeilKind', el).onchange = ceil;
  $('#rCeilColor', el).onchange = ceil;
  $('#rWallApply', el).onclick = () => {
    const fin = { kind: $('#rWallKind', el).value, color: $('#rWallColor', el).value };
    const sides = paint.roomSides(r);
    for (const { wall, side, from, to } of sides) paintSpan(wall, side, { from, to, ...fin });
    commit();
    toast(`${FINISH_NAMES[fin.kind]} on ${sides.length} wall side${sides.length === 1 ? '' : 's'} of ${r.name || 'this room'}.`, { undo: true });
  };
  $$('[data-sel]', el).forEach((b) => (b.onclick = () => viewer.select({ type: 'item', id: b.dataset.sel })));
}

function floorInspector(el) {
  const f = floorNow();
  const ys = elevations(design);
  const fi = viewer.activeFloor;
  const gross = footprint(f).reduce((s, p) => s + Math.abs(area(p[0].slice(0, -1))), 0);
  el.innerHTML = `<div class="insp"><h3>${esc(f.name)}</h3><div class="sub">Level ${cm(ys[fi])} cm · ${gross.toFixed(1)} m² · ${f.rooms.length} rooms · ${f.placed.length} items</div>
    ${ui.editing ? `<div class="group"><label class="field-label">Floor name<input id="fName" value="${esc(f.name)}"></label></div>
    <div class="group"><div class="num-row" style="grid-template-columns:1fr 1fr">${field('Ceiling height (cm)', `type="number" min="200" max="600" step="5" id="fHeight" value="${cm(f.height)}"`)}${field(fi === 0 ? 'Ground slab (cm)' : 'Floor slab (cm)', `type="number" min="5" max="60" step="1" id="fSlab" value="${cm(f.slab)}"`)}</div></div>` : ''}
    ${floorProblems(f, fi)}
    ${f.rooms.length ? `<div class="group"><div class="lbl">Rooms</div>${f.rooms.map((r) => `<button class="btn small ghost list-btn" data-room="${esc(r.id)}"><span>${esc(r.name || 'Room')}</span><em>${Math.abs(area(r.points)).toFixed(1)} m²</em></button>`).join('')}</div>` : ''}
    ${f.placed.length ? `<div class="group"><div class="lbl">Furniture</div>${f.placed.map((p) => {
      const it = itemById(p.itemId);
      const c = it && colorOf(it, p);
      return it ? `<button class="btn small ghost list-btn" data-sel="${esc(p.id)}"><span class="sw" style="background:${esc(c?.hex || '#ccc')}"></span>${esc(it.name)}</button>` : '';
    }).join('')}</div>` : ''}
    ${!ui.editing ? `<div class="group"><button class="btn" style="width:100%" id="walkHere">Walk through ${esc(f.name)}</button></div><div class="group"><button class="btn" style="width:100%" id="editHouse">Edit walls, rooms &amp; stairs</button></div>` : ''}
    <div class="group"><div class="lbl">House</div>
      ${ui.editing ? `<label class="field-label">Name<input id="hName" value="${esc(design.name)}"></label>` : ''}
      <div class="swatch-input" style="margin-top:6px"><input type="color" id="wallColor" value="${esc(design.wallColor || '#efebe4')}"><span class="hint">Wall colour</span></div>
    </div></div>`;
  $$('[data-room]', el).forEach((b) => (b.onclick = () => viewer.select({ type: 'room', id: b.dataset.room })));
  $$('[data-sel]', el).forEach((b) => (b.onclick = () => viewer.select({ type: 'item', id: b.dataset.sel })));
  if ($('#fName', el)) $('#fName', el).onchange = (e) => ((f.name = e.target.value.trim() || f.name), commit());
  if ($('#fHeight', el)) $('#fHeight', el).onchange = (e) => {
    const v = parseFloat(e.target.value) / 100;
    if (v >= 2) (f.height = v), commit();
  };
  if ($('#fSlab', el)) $('#fSlab', el).onchange = (e) => {
    const v = parseFloat(e.target.value) / 100;
    if (v >= 0.05) (f.slab = v), commit();
  };
  if ($('#hName', el)) $('#hName', el).onchange = (e) => ((design.name = e.target.value.trim() || design.name), commit());
  $('#wallColor', el).oninput = (e) => (design.wallColor = e.target.value);
  $('#wallColor', el).onchange = () => commit();
  if ($('#walkHere', el)) $('#walkHere', el).onclick = () => setView('walk');
  if ($('#editHouse', el)) $('#editHouse', el).onclick = () => setEditing(true);
}

function floorProblems(f, fi) {
  const ys = elevations(design);
  const list = validate(design)
    .filter((p) => p.startsWith(`floor "${f.name}"`) && !/refers to missing item/.test(p))
    .map((p) => p.replace(/^floor "[^"]*":?\s*/, '').replace(/ \b(wall|stairs|door|window|opening) [a-z]+-[a-z0-9]+/g, ' $1'));
  if (fi < design.floors.length - 1) for (const s of f.stairs) if (!tools.stairFits(s, ys[fi + 1] - ys[fi])) list.push('stairs cross a wall or leave the floor');
  for (const p of f.placed) if (!itemById(p.itemId)) list.push('a placed item has no model in your library');
  if (viewer.display.clear) for (const x of clearanceProblems(f)) list.push(x.message);
  if (!f.rooms.length && f.walls.length) list.push('no enclosed rooms yet: close the walls into a loop');
  if (!list.length) return '<div class="group problems ok">✓ No problems on this floor</div>';
  return `<div class="group problems"><div class="lbl">Check</div><ul>${list.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
}

// ---------- build panel (edit mode) ----------

const TOOL_KEYS = { select: 'V', wall: 'W', door: 'D', window: 'N', opening: 'O', stairs: 'S' };
const TOOLS = [
  ['select', 'Select', '<path d="M5 3l14 8-6 2-2 6z"/>'],
  ['wall', 'Wall', '<path d="M3 17h18M3 17V7h18v10M8 7v10M14 7v10"/>'],
  ['door', 'Door', '<path d="M6 21V4h10v17M4 21h16"/><circle cx="13" cy="13" r="1"/>'],
  ['window', 'Window', '<rect x="4" y="5" width="16" height="14"/><path d="M12 5v14M4 12h16"/>'],
  ['opening', 'Opening', '<path d="M5 21V8a7 7 0 0 1 14 0v13"/>'],
  ['stairs', 'Stairs', '<path d="M4 20h4v-4h4v-4h4V8h4"/>'],
];

function renderBuildPanel() {
  const el = $('#buildPanel');
  const t = ui.tool || 'select';
  const fi = viewer.activeFloor;
  el.innerHTML = `<section>
      <h2>Build · ${esc(floorNow().name)}</h2>
      <div class="tool-grid">${TOOLS.map(([k, name, svg]) => `<button class="tool ${t === k ? 'on' : ''}" data-tool="${k}" title="${name} (${TOOL_KEYS[k]})"><svg viewBox="0 0 24 24">${svg}</svg>${name}</button>`).join('')}</div>
      <p class="hint" style="margin:10px 0 0">Rooms follow the walls automatically. Drag a corner or a wall to reshape; double-click a wall to add a corner.</p>
    </section>
    <section>
      <h2>Floors</h2>
      <div class="floor-list">${design.floors.map((f, i) => ({ f, i })).reverse().map(({ f, i }) => `<button class="floor-row ${i === fi ? 'on' : ''}" data-f="${i}"><span class="badge">${i === 0 ? 'G' : i}</span><span>${esc(f.name)}</span><em>${f.rooms.length} rooms</em></button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="btn small" id="addFloor">+ Floor above</button><button class="btn small danger ghost" id="delFloor" ${design.floors.length < 2 ? 'disabled' : ''}>Delete floor</button></div>
    </section>
    <section>
      <h2>Start over</h2>
      <div class="row"><button class="btn small" id="newHouse2">New house…</button><button class="btn small" id="dxf2">Import DXF…</button></div>
      <p class="hint" style="margin-top:8px">Have a floor plan image? Give it to your AI agent (see <b>Agents</b>) and it will trace it into this house.</p>
    </section>`;
  $$('[data-tool]', el).forEach((b) => (b.onclick = () => setTool(b.dataset.tool === 'select' ? null : b.dataset.tool)));
  $$('[data-f]', el).forEach((b) => (b.onclick = () => setFloor(+b.dataset.f)));
  $('#addFloor', el).onclick = addFloorAbove;
  $('#delFloor', el).onclick = deleteFloor;
  $('#newHouse2', el).onclick = () => $('#newHouseDialog').showModal();
  $('#dxf2', el).onclick = () => $('#dxfFile').click();
}

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
  $('#leftPanel').classList.remove('open');
  commit({ rebuild: false });
  viewer.select({ type: 'item', id: p.id });
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

let editing = null;

function colorRow(c = { name: '', hex: '#cccccc' }) {
  const row = document.createElement('div');
  row.className = 'color-row';
  row.innerHTML = `<input type="color" value="${esc(c.hex || '#cccccc')}"><input type="text" placeholder="Colour name, e.g. Light beige" value="${esc(c.name)}"><button type="button" title="Remove">×</button>`;
  const [pick, name] = $$('input', row);
  let manual = !!c.name;
  pick.oninput = () => (manual = true);
  name.oninput = () => {
    const hex = colorFromName(name.value);
    if (hex && !manual) pick.value = hex;
  };
  $('button', row).onclick = () => row.remove();
  return row;
}

function openItemDialog(item, { note, isNew } = {}) {
  editing = { item, isNew };
  const f = $('#itemForm');
  $('#itemDialogTitle').textContent = isNew ? 'New model' : 'Edit model';
  $('#itemNote').hidden = !note;
  $('#itemNote').textContent = note || '';
  const d = item.dims || {};
  const def = DEFAULT_DIMS[item.category] || [0.6, 0.6, 0.6];
  f.name.value = item.name || '';
  f.category.value = item.category || 'box';
  f.url.value = item.url || '';
  f.w.value = cm(d.w || def[0]);
  f.d.value = cm(d.d || def[1]);
  f.h.value = cm(d.h || def[2]);
  f.image.value = item.image || '';
  f.modelUrl.value = item.modelUrl || '';
  f.useModel.checked = item.useModel !== false;
  f.accentOn.checked = !!item.accent;
  f.accent.value = item.accent?.hex || '#4a3426';
  const rows = $('#colorRows');
  rows.innerHTML = '';
  for (const c of item.colors?.length ? item.colors : [{ name: '', hex: '#cccccc' }]) rows.appendChild(colorRow(c));
  $('#deleteItemBtn').hidden = !!isNew;
  $('#itemDialog').showModal();
}

function saveItemDialog() {
  const f = $('#itemForm');
  const { item, isNew } = editing;
  const num = (v) => Math.max(0.005, parseFloat(v) / 100);
  item.name = f.name.value.trim() || 'Untitled model';
  item.category = f.category.value;
  item.url = f.url.value.trim() || null;
  item.dims = { w: num(f.w.value), d: num(f.d.value), h: num(f.h.value) };
  item.image = f.image.value.trim() || null;
  item.modelUrl = f.modelUrl.value.trim() || null;
  item.useModel = f.useModel.checked;
  item.accent = f.accentOn.checked ? { name: 'Custom', hex: f.accent.value } : null;
  item.colors = $$('#colorRows .color-row')
    .map((r) => {
      const [pick, name] = $$('input', r);
      return { name: name.value.trim() || pick.value, hex: pick.value };
    })
    .filter((c, i, a) => a.findIndex((x) => x.name === c.name) === i);
  if (!item.colors.length) item.colors = [{ name: 'Default', hex: '#b8b2a7' }];
  delete item.needsDims;
  for (const fl of design.floors) for (const p of fl.placed) if (p.itemId === item.id && p.color && !p.color.startsWith('#') && !item.colors.some((c) => c.name === p.color)) p.color = item.colors[0].name;
  if (isNew && !itemById(item.id)) library.items.unshift(item);
  commit({ lib: true, rebuild: false });
  if (isNew) toast(`“${item.name}” added to your models.`, { action: ['Add to room', () => addToRoom(item.id)] });
}

// ---------- importing links ----------

function workerUrl() {
  const custom = pref.get('worker', '') || WORKER_URL;
  return (custom || (store.kind === 'device' ? location.origin + location.pathname.replace(/\/[^/]*$/, '') : '')).replace(/\/+$/, '');
}

function renderQueue() {
  $('#queue').innerHTML = ui.queue
    .slice(-6)
    .reverse()
    .map((q) => `<li class="${q.status === 'error' ? 'err' : q.status === 'warn' ? 'warn' : ''}" data-q="${q.id}">
      <span class="st">${q.status === 'pending' || q.status === 'busy' ? '<span class="spin"></span>' : q.status === 'error' ? '✕' : q.status === 'warn' ? '!' : '✓'}</span>
      <div class="body"><div class="t" title="${esc(q.url)}">${esc(q.title || q.url)}</div><div class="m">${q.message || 'Reading page…'}</div></div>
      ${q.status !== 'pending' ? '<button class="x" data-dismiss title="Dismiss">×</button>' : ''}
    </li>`)
    .join('');
  $$('#queue [data-dismiss]').forEach((b) => (b.onclick = () => {
    const id = b.closest('li').dataset.q;
    ui.queue.splice(ui.queue.findIndex((q) => q.id === id), 1);
    renderQueue();
  }));
  $$('#queue [data-edit]').forEach((a) => (a.onclick = () => itemById(a.dataset.edit) && openItemDialog(itemById(a.dataset.edit))));
  $$('#queue [data-add]').forEach((a) => (a.onclick = () => addToRoom(a.dataset.add)));
  $$('#queue [data-chat]').forEach((a) => (a.onclick = () => chat?.toggle(true)));
  $$('#queue [data-manual]').forEach((a) => (a.onclick = () => {
    const q = ui.queue.find((x) => x.id === a.dataset.manual);
    openItemDialog(guessFromUrl(q.url), { isNew: true, note: "We couldn't read this page automatically. Check the name and enter the size from the product page." });
  }));
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

async function importUrls(urls) {
  if (!urls.length) return toast('No links found. Paste a full link starting with https://');
  const base = workerUrl();
  for (const url of urls) {
    const existing = library.items.find((i) => i.url === url);
    const q = { id: uid('q'), url, status: 'pending', title: url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) };
    ui.queue.push(q);
    if (existing) {
      Object.assign(q, { status: 'ok', title: existing.name, message: `Already in your models · <a data-add="${existing.id}">Add to room</a>` });
      continue;
    }
    renderQueue();
    if (!base) {
      const item = guessFromUrl(url);
      item.needsDims = true;
      library.items.unshift(item);
      commit({ lib: true, rebuild: false });
      Object.assign(q, { status: 'warn', title: item.name, message: `Run Roomcraft with <code>npm start</code> to read links. Size is a typical guess: <a data-edit="${item.id}">enter the real size</a>` });
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
      Object.assign(q, { status: item.needsDims ? 'warn' : 'ok', title: item.name, itemId: item.id, message: (item.needsDims ? `Size partly guessed. <a data-edit="${item.id}">Check size</a> · ` : '') + bits.join(' · ') + ` · <a data-add="${item.id}">Add to room</a>` });
      await handToAgent(q, url, item);
    } catch (err) {
      if (agentModels()) {
        // The page couldn't be read here; the agent may still manage (it can look harder).
        const item = guessFromUrl(url);
        item.needsDims = true;
        library.items.unshift(item);
        commit({ lib: true, rebuild: false });
        Object.assign(q, { status: 'warn', title: item.name, itemId: item.id, message: `Couldn’t read the page here (${esc(err.message || err)}).` });
        await handToAgent(q, url, item);
      } else Object.assign(q, { status: 'error', message: `${esc(err.message || err)} <a data-manual="${q.id}">Add manually</a>` });
    }
    renderQueue();
  }
  renderQueue();
}

const agentModels = () => !!chat?.ready && $('#autoModel').checked;

/** Pasted links go to the user's agent, which models them from the product photos. */
async function handToAgent(q, url, item) {
  if (!agentModels()) return;
  try {
    await chat.modelLink(url, item);
    q.status = 'busy';
    q.message = `${q.message ? q.message + ' ' : ''}Your agent is modelling it from the photos… <a data-chat>watch</a>`;
  } catch (err) {
    q.message += ` (Agent: ${esc(err.message)})`;
  }
  renderQueue();
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

async function renderDesignList() {
  const list = await store.list();
  $('#storageNote').textContent = store.kind === 'device' ? 'Saved on this computer (userdata/ folder)' : 'Saved in this browser. Run npm start to save to your computer.';
  $('#designList').innerHTML = list
    .map((d) => `<div class="design-row ${d.id === design.id ? 'on' : ''}" data-id="${esc(d.id)}">
      <div class="dr-main"><b>${esc(d.name || 'Untitled')}</b><span>${d.floors} floor${d.floors === 1 ? '' : 's'} · ${d.updatedAt ? new Date(d.updatedAt).toLocaleString() : ''}${d.updatedBy === 'agent' ? ' · edited by agent' : ''}</span></div>
      <div class="dr-actions">
        ${d.id === design.id ? '<span class="pill">Open</span>' : '<button class="btn small primary" data-open>Open</button>'}
        <button class="btn small ghost" data-dup>Duplicate</button>
        <button class="btn small ghost" data-rename>Rename</button>
        <button class="btn small ghost danger" data-del ${list.length < 2 ? 'disabled' : ''}>Delete</button>
      </div></div>`)
    .join('');
  $$('#designList .design-row').forEach((row) => {
    const id = row.dataset.id;
    $('[data-open]', row)?.addEventListener('click', async () => {
      await openDesign(id);
      $('#designsDialog').close();
    });
    $('[data-dup]', row).onclick = async () => {
      const d = id === design.id ? JSON.parse(JSON.stringify(design)) : await store.load(id);
      d.id = uid('d');
      d.name = `${d.name} (copy)`;
      await store.save(d);
      renderDesignList();
    };
    $('[data-rename]', row).onclick = async () => {
      const d = id === design.id ? design : await store.load(id);
      const name = prompt('Design name', d.name);
      if (!name?.trim()) return;
      d.name = name.trim();
      if (id === design.id) commit({ rebuild: false });
      else await store.save(d);
      renderDesignList();
    };
    $('[data-del]', row).onclick = async () => {
      if (!confirm('Delete this design? This cannot be undone.')) return;
      await store.remove(id);
      if (id === design.id) await openDesign((await store.list())[0].id);
      renderDesignList();
    };
  });
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
  } else if (kind === 'glb') {
    toast('Preparing 3D model…');
    const { exportGLB } = await import('./export.js');
    const blob = await exportGLB(viewer);
    download(`${fileName(design.name)}.glb`, URL.createObjectURL(blob));
    toast(`Saved ${fileName(design.name)}.glb (${(blob.size / 1e6).toFixed(1)} MB). In Blender: File → Import → glTF 2.0.`);
  }
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

async function openAgents() {
  if (store.kind !== 'device') return toast('Connecting agents needs Roomcraft running with npm start.');
  const dlg = $('#agentsDialog');
  const data = await (await fetch('api/agents')).json();
  const connected = data.harnesses.filter((h) => h.connection || h.configured);
  $('#agentsTitle').textContent = connected.length ? 'AI agents' : 'Connect your AI agent';
  $('#agentsDontAsk').checked = pref.get('agentsDontAsk', false);
  $('#agentsConnected').innerHTML = connected.length
    ? `<div class="lbl">Set up</div>${connected
        .map((h) => `<div class="agent-row"><div><b>${esc(h.name)}</b><span>${h.connection ? `Connected · last used ${new Date(h.connection.lastSeen).toLocaleString()}` : 'Configured, waiting for its first connection. Restart the agent and ask it to list the roomcraft tools.'}</span></div><button class="btn small danger ghost" data-remove="${esc(h.id)}">Remove</button></div>`)
        .join('')}<div class="lbl" style="margin-top:14px">Set up another agent</div>`
    : '';
  $('#agentGrid').innerHTML =
    data.harnesses
      .filter((h) => !h.other)
      .map((h) => `<button class="agent-card ${h.connection || h.configured ? 'done' : ''}" data-agent="${esc(h.id)}"><b>${esc(h.name)}</b><span>${h.connection ? 'Connected' : h.configured ? 'Configured' : 'Set up'}</span></button>`)
      .join('') + '<button class="agent-card" data-agent="other"><b>Other agent</b><span>Any MCP client</span></button>';
  $('#agentSetup').hidden = true;
  $$('[data-remove]', dlg).forEach((b) => (b.onclick = async () => {
    const r = await (await fetch('api/agents/remove', { method: 'POST', body: JSON.stringify({ id: b.dataset.remove }) })).json();
    toast(r.message);
    openAgents();
    refreshAgentsDot();
  }));
  $$('[data-agent]', dlg).forEach((b) => (b.onclick = () => {
    $$('[data-agent]', dlg).forEach((x) => x.classList.toggle('on', x === b));
    const h = data.harnesses.find((x) => x.id === b.dataset.agent);
    const prompt = h ? h.prompt : data.genericPrompt;
    const box = $('#agentSetup');
    box.hidden = false;
    box.innerHTML = `<div class="setup-steps">
      <div class="step"><span>1</span><div>${h?.noShell ? `${esc(h.name)} can't run setup commands itself, so Roomcraft can add itself to its config for you.` : `Copy this prompt and paste it into ${esc(h?.name || 'your agent')}. It installs the Roomcraft server into its own settings.`}</div></div>
      ${h?.noShell ? '' : `<div class="prompt-box"><pre>${esc(prompt)}</pre><button class="btn small primary" id="copyPrompt">Copy prompt</button></div>`}
      ${h?.canAutoSetup ? `<div class="step"><span>${h.noShell ? '2' : 'or'}</span><div><button class="btn small ${h.noShell ? 'primary' : ''}" id="autoSetup">Add it to ${esc(h.name)} automatically</button> <em class="muted">${esc(h.configPath)}</em></div></div>` : ''}
      <div class="step"><span>${h?.noShell ? '3' : '2'}</span><div>Approve what the agent asks for and restart it if it says so. It shows as connected here the first time it uses Roomcraft.</div></div>
    </div>`;
    $('#copyPrompt', box)?.addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(prompt);
        e.target.textContent = 'Copied ✓';
      } catch {
        const r = document.createRange();
        r.selectNodeContents($('pre', box));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        e.target.textContent = 'Selected, press Ctrl+C';
      }
    });
    $('#autoSetup', box)?.addEventListener('click', async () => {
      const r = await (await fetch('api/agents/setup', { method: 'POST', body: JSON.stringify({ id: h.id }) })).json();
      toast(r.message || r.error);
      refreshAgentsDot();
      openAgents();
    });
  }));
  if (!dlg.open) dlg.showModal();
}

async function refreshAgentsDot() {
  if (store.kind !== 'device') return ($('#agentsBtn').hidden = true), 0;
  chat?.refresh();
  try {
    const data = await (await fetch('api/agents')).json();
    const n = data.harnesses.filter((h) => h.connection || h.configured).length;
    $('#agentsDot').classList.toggle('ok', n > 0);
    $('#agentsBtn').title = n ? `${n} AI agent${n > 1 ? 's' : ''} set up` : 'Connect an AI agent';
    return n;
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
  $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $('#walkUI').hidden = v !== 'walk';
  if (v === 'walk') {
    viewer.select(null);
    walker.start(viewer.activeFloor);
    walkHelp(false);
  } else walker.stop();
  renderAll();
  if ($('#leaveWalk')) $('#leaveWalk').onclick = () => setView('3d');
}

function walkHelp(locked) {
  const f = design && viewer ? `<b>${esc(floorNow().name)}</b> · ` : '';
  $('#walkHelp').innerHTML = locked
    ? `${f}W A S D to walk · Shift to hurry · Esc to release the mouse`
    : matchMedia('(pointer: coarse)').matches
      ? `${f}drag to look around · use the arrows to walk`
      : `${f}<u>Click to look around</u> · W A S D to walk · walk onto the stairs to change floors`;
}

// ---------- photo ----------

let photoAbort = null;
async function takePhoto() {
  const ov = $('#photoOverlay');
  ov.hidden = false;
  $('#photoImg').hidden = true;
  $('#photoSave').hidden = true;
  $('#photoCancel').textContent = 'Cancel';
  $('#photoTitle').textContent = 'Rendering photo…';
  $('#photoInfo').textContent = 'Preparing the scene…';
  $('#photoBar').style.width = '0%';
  photoAbort = new AbortController();
  try {
    const { renderPhoto } = await import('./photo.js');
    const started = performance.now();
    const url = await renderPhoto(viewer, {
      samples: ui.quality === 'high' ? 400 : 150,
      signal: photoAbort.signal,
      onProgress: (n, total) => {
        $('#photoBar').style.width = `${(n / total) * 100}%`;
        const secs = ((performance.now() - started) / 1000) * (total / Math.max(1, n) - 1);
        $('#photoInfo').textContent = `${n} / ${total} light samples · about ${Math.max(1, Math.round(secs))} s left`;
      },
    });
    if (!url) return (ov.hidden = true);
    $('#photoTitle').textContent = 'Photo ready';
    $('#photoInfo').textContent = '';
    $('#photoImg').src = url;
    $('#photoImg').hidden = false;
    $('#photoSave').hidden = false;
    $('#photoCancel').textContent = 'Close';
    $('#photoSave').onclick = () => download(`${fileName(design.name)}-photo.png`, url);
  } catch (err) {
    console.error(err);
    $('#photoTitle').textContent = "Couldn't render the photo";
    $('#photoInfo').textContent = err.message;
    $('#photoCancel').textContent = 'Close';
  }
}

// ---------- misc UI ----------

let chat = null;
let measure = null;
let paint = null;
let toastTimer;
function toast(msg, { undo, action } = {}) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (undo ? '<button data-t="undo">Undo</button>' : '') + (action ? `<button data-t="act">${esc(action[0])}</button>` : '');
  t.classList.add('show');
  if (undo) $('[data-t=undo]', t).onclick = () => (restore(history.index - 1), t.classList.remove('show'));
  if (action) $('[data-t=act]', t).onclick = () => (action[1](), t.classList.remove('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action || undo ? 6000 : 3500);
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
  $('#categorySelect').innerHTML = Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

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
      if (kind === 'elevation') return ($('#coords').textContent = `along ${x.toFixed(2)} m · height ${z.toFixed(2)} m`);
      ui.pointer = [x, z];
      $('#coords').textContent = `x ${x.toFixed(2)} m · z ${z.toFixed(2)} m`;
    },
    onLocked: (what) => toast(what === 'wall' ? 'This wall is locked. Unlock it in the wall panel to move it.' : 'This item is locked. Press L or use Unlock in the panel to move it.'),
    editable: () => ui.editing,
    onModelError: (item) => toast(`Couldn't load the 3D model for “${item.name}”, showing a generated one.`),
    onPointerLock: (locked) => walkHelp(locked),
  });
  viewer.library = library.items;
  viewer.wallMode = pref.get('wallMode', 'cut');
  Object.assign(viewer.display, pref.get('display', {}));
  viewer.setAssetProxy((u) => {
    const base = workerUrl();
    if (!base || !/^https?:/i.test(u) || u.startsWith(location.origin)) return u;
    return `${base}/asset?url=${encodeURIComponent(u)}`;
  });
  setQuality(viewer, ui.quality);
  viewer.setDesign(design, { refit: true });
  walker = new Walker(viewer, {
    onFloor: (fi) => {
      viewer.activeFloor = fi;
      renderLevelBar();
      walkHelp(!!document.pointerLockElement);
      renderInspector();
      if ($('#leaveWalk')) $('#leaveWalk').onclick = () => setView('3d');
    },
  });
  measure = new Measure(viewer, {
    onResult: (r) => {
      $('#hintbar').textContent = `${r.mode === 'surface' ? 'Along the surface' : r.mode === 'path' ? 'Path length' : 'Distance'}: ${r.length.toFixed(3)} m${r.mode !== 'distance' ? ` (straight line ${r.straight.toFixed(3)} m)` : ''}`;
      renderToolBar();
    },
  });
  paint = new Paint(viewer, {
    edit: (fn) => {
      fn(floorNow());
      commit();
    },
    picked: (fin) => (renderToolBar(), toast(`Picked up ${FINISH_NAMES[fin.kind] || fin.kind} ${fin.color}. Click to apply it.`)),
    hover: (t) => ($('#hintbar').textContent = t),
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
  resetHistory();
  wireUI();
  renderAll();

  // Live updates from AI agents (or another window) editing the same files.
  store.subscribe(async (ev) => {
    if (ev.type === 'agent') return chat.handle(ev);
    if (ev.type === 'design' && ev.id === design.id && ev.updatedAt !== lastSaved) {
      const d = await store.load(design.id);
      if (d.updatedAt === lastSaved) return;
      design = d;
      lastSaved = d.updatedAt;
      commit();
      toast(ev.updatedBy === 'agent' ? 'Your AI agent updated this design.' : 'Design updated.');
    } else if (ev.type === 'library' && Date.now() - lastLibSave > 1500) {
      library = await store.loadLibrary();
      viewer.library = library.items;
      viewer.syncFurniture();
      renderAll();
    }
  });

  chat = initChat({
    local: store.kind === 'device',
    context: chatContext,
    openAgents,
    onReady: (r) => {
      $('#autoModelRow').hidden = !r;
      $('#autoModelAgent').textContent = r?.name || 'my agent';
    },
    onJobDone: (ev) => {
      if (ev.kind !== 'model') return;
      const item = itemById(ev.itemId);
      const q = ui.queue.find((x) => x.itemId && x.itemId === ev.itemId);
      if (q) {
        Object.assign(q, { status: ev.error ? 'warn' : 'ok', message: (ev.error ? 'Your agent couldn’t finish the model; the draft is kept. ' : `Modelled and checked by your agent · `) + `<a data-add="${esc(ev.itemId)}">Add to room</a>` });
        renderQueue();
      }
      toast(ev.error ? 'Your agent couldn’t finish a model. See the Assistant panel.' : `Your agent finished the model${item ? ` for “${item.name}”` : ''}.`, { action: item && ['Add to room', () => addToRoom(item.id)] });
    },
  });
  $('#autoModel').checked = pref.get('autoModel', true);
  $('#autoModel').onchange = (e) => pref.set('autoModel', e.target.checked);

  const agents = await refreshAgentsDot();
  if (store.kind === 'device' && !agents && !pref.get('agentsDontAsk', false)) openAgents();
  window.roomcraft = { get viewer() { return viewer; }, get design() { return design; }, get library() { return library; }, commit, addToRoom, setView, setFloor, setEditing, setTool, get walker() { return walker; } };
}

function wireUI() {
  $$('#viewSeg button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  $('#editBtn').onclick = () => setEditing(!ui.editing);
  $('#undoBtn').onclick = () => restore(history.index - 1);
  $('#redoBtn').onclick = () => restore(history.index + 1);
  $('#photoBtn').onclick = takePhoto;
  $('#photoCancel').onclick = () => {
    photoAbort?.abort();
    $('#photoOverlay').hidden = true;
  };
  $('#panelToggle').onclick = () => $('#leftPanel').classList.toggle('open');
  $('#designBtn').onclick = () => (renderDesignList(), $('#designsDialog').showModal());
  $('#newDesignBtn').onclick = () => $('#newHouseDialog').showModal();
  $('#importDesignBtn').onclick = () => $('#designFile').click();
  $('#agentsBtn').onclick = () => openAgents();
  $('#agentsDontAsk').onchange = (e) => pref.set('agentsDontAsk', e.target.checked);
  $$('dialog [data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
  $('#newHouseForm').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    $('#newHouseDialog').close();
    $('#designsDialog').close();
    createHouse({ name: f.elements.name.value.trim() || 'My house', width: +f.width.value, depth: +f.depth.value, floors: Math.round(+f.floors.value), floorHeight: +f.height.value });
  };
  $('#designFile').onchange = (e) => (e.target.files[0] && importDesignFile(e.target.files[0]), (e.target.value = ''), $('#designsDialog').close());
  $('#dxfFile').onchange = (e) => (e.target.files[0] && importDxf(e.target.files[0]), (e.target.value = ''));

  const menus = [['#menuBtn', '#menu'], ['#exportBtn', '#exportMenu']];
  for (const [btn, m] of menus)
    $(btn).onclick = (e) => {
      e.stopPropagation();
      for (const [, o] of menus) if (o !== m) $(o).hidden = true;
      $(m).hidden = !$(m).hidden;
    };
  document.addEventListener('click', (e) => [...menus.map(([, m]) => m), '#viewMenu'].forEach((m) => !$(m).contains(e.target) && ($(m).hidden = true)));
  $('#exportMenu').onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    $('#exportMenu').hidden = true;
    if (act) exportAs(act).catch((err) => toast(`Export failed: ${err.message}`));
  };
  $('#menu').onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    $('#menu').hidden = true;
    if (['glb', 'design', 'png'].includes(act)) exportAs(act).catch((err) => toast(`Export failed: ${err.message}`));
    else if (act === 'photo') takePhoto();
    else if (act === 'import-design') $('#designFile').click();
    else if (act === 'import-dxf') $('#dxfFile').click();
    else if (act === 'quality') {
      ui.quality = ui.quality === 'high' ? 'low' : 'high';
      pref.set('quality', ui.quality);
      setQuality(viewer, ui.quality);
      renderAll();
      toast(ui.quality === 'high' ? 'High quality: soft shadows and ambient occlusion.' : 'Fast graphics for older computers.');
    } else if (act === 'settings') openSettings();
    else if (act === 'help') $('#helpDialog').showModal();
  };

  // Models
  $('#invSearch').oninput = renderInventory;
  $('#newItemBtn').onclick = () => openItemDialog({ id: uid('i'), name: '', category: 'sofa', colors: [] }, { isNew: true });
  $('#inventory').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    const sw = e.target.closest('.sw');
    if (sw) {
      ui.pickedColor[id] = sw.dataset.color;
      const sel = viewer.sel?.type === 'item' && findPlaced(viewer.sel.id).p;
      if (sel?.itemId === id) (sel.color = sw.dataset.color), commit({ rebuild: false });
      else renderInventory();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add') addToRoom(id);
    else if (act === 'edit') openItemDialog(itemById(id));
  });
  $('#inventory').addEventListener('dragstart', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    e.dataTransfer.setData('application/x-roomcraft-item', card.dataset.id);
    e.dataTransfer.effectAllowed = 'copy';
    card.classList.add('dragging');
  });
  $('#inventory').addEventListener('dragend', (e) => e.target.closest?.('.card')?.classList.remove('dragging'));

  // Model dialog
  $('#addColorBtn').onclick = () => $('#colorRows').appendChild(colorRow());
  $('#cancelItemBtn').onclick = () => $('#itemDialog').close();
  $('#itemForm').onsubmit = (e) => {
    e.preventDefault();
    saveItemDialog();
    $('#itemDialog').close();
  };
  $('#deleteItemBtn').onclick = () => {
    const { item } = editing;
    const n = placedCount(item.id);
    if (n && !confirm(`Delete “${item.name}”? It is placed ${n} time(s) in this design.`)) return;
    library.items = library.items.filter((i) => i !== item);
    viewer.library = library.items;
    for (const f of design.floors) f.placed = f.placed.filter((p) => p.itemId !== item.id);
    $('#itemDialog').close();
    viewer.select(null);
    commit({ lib: true, rebuild: false });
    toast('Model deleted.', { undo: true });
  };
  $('#itemForm').category.onchange = (e) => {
    if (!editing?.isNew) return;
    const def = DEFAULT_DIMS[e.target.value];
    const f = $('#itemForm');
    [f.w.value, f.d.value, f.h.value] = def.map((v) => cm(v));
  };
  $('#itemForm').elements.name.oninput = (e) => {
    if (!editing?.isNew) return;
    const cat = guessCategory(e.target.value);
    if (cat !== 'box' && cat !== $('#itemForm').category.value) {
      $('#itemForm').category.value = cat;
      $('#itemForm').category.onchange({ target: $('#itemForm').category });
    }
  };

  // Importing links
  $('#importBtn').onclick = () => {
    const urls = extractUrls($('#linkInput').value);
    $('#linkInput').value = '';
    importUrls(urls);
  };
  $('#linkInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#importBtn').click();
    }
  });
  $('#linkInput').addEventListener('paste', () => setTimeout(() => extractUrls($('#linkInput').value).length && $('#importBtn').click(), 0));

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

  // Walk touch pad
  $$('.dpad [data-move]').forEach((b) => {
    const [f, s] = b.dataset.move.split(',').map(Number);
    const on = (e) => (e.preventDefault(), walker.setMove(f, s));
    const off = () => walker.setMove(0, 0);
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (/input|textarea|select/i.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const sel = viewer.sel;
    if (mod && k === 'z') (e.preventDefault(), restore(history.index + (e.shiftKey ? 1 : -1)));
    else if (mod && k === 'y') (e.preventDefault(), restore(history.index + 1));
    else if (ui.tool === 'measure' && (k === 'escape' || k === 'enter') && measure.key(k)) e.preventDefault();
    else if (k === 'escape' && viewer.view === 'elevation' && !viewer.sel) closeElevation();
    else if (k === 'escape') {
      if (viewer.view === 'walk' && !document.pointerLockElement) setView('3d');
      else if (ui.tool) setTool(null);
      else viewer.select(null);
    } else if (viewer.view === 'walk') return;
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
  walkHelp(false);
}

function togglePanel(side) {
  document.body.classList.toggle('hide-' + side);
  pref.set('hide-' + side, document.body.classList.contains('hide-' + side));
  setTimeout(() => viewer.resize?.(), 0);
}

function openSettings() {
  $('#workerUrl').value = pref.get('worker', '');
  $('#workerStatus').textContent = '';
  $('#readerNote').hidden = store.kind !== 'device';
  $('#settingsDialog').showModal();
  $('#workerUrl').onchange = () => pref.set('worker', $('#workerUrl').value.trim());
  $('#testWorker').onclick = async () => {
    pref.set('worker', $('#workerUrl').value.trim());
    const base = workerUrl();
    if (!base) return ($('#workerStatus').textContent = 'Enter a URL first.');
    $('#workerStatus').textContent = 'Testing…';
    try {
      const j = await (await fetch(`${base}/health`)).json();
      $('#workerStatus').textContent = j.ok ? '✓ Connected' : `✕ ${j.error || 'Unexpected reply'}`;
    } catch (err) {
      $('#workerStatus').textContent = `✕ Could not reach it (${err.message}).`;
    }
  };
}

boot().catch((err) => {
  console.error(err);
  const l = $('#loading');
  if (l) l.textContent = "Couldn't start: " + err.message;
});
