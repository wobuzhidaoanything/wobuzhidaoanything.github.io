import { Viewer } from './viewer.js';
import { CATEGORY_LABELS, DEFAULT_DIMS } from './models.js';
import { ROOM_PRESETS, signedArea, bounds, centroid, pointInPolygon, walls, nearestWall } from './room.js';
import { colorFromName } from '../shared/colors.js';
import { guessCategory } from '../worker/src/scrape.js';
import { WORKER_URL } from './config.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);
const cm = (m) => (m == null ? '?' : Math.round(m * 1000) / 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS_STATE = 'roomcraft.state.v1';
const LS_WORKER = 'roomcraft.worker';

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

let state = null;
let repoProject = null;
let viewer = null;
const history = { stack: [], index: -1 };
const pickedColor = {}; // itemId → colour name chosen on the inventory card

// ---------- persistence & undo ----------

function snapshot() {
  return JSON.stringify({ room: state.room, inventory: state.inventory, placed: state.placed });
}

function commit({ render = true } = {}) {
  const snap = snapshot();
  if (history.stack[history.index] !== snap) {
    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(snap);
    if (history.stack.length > 80) history.stack.shift();
    history.index = history.stack.length - 1;
  }
  save();
  if (render) renderAll();
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(LS_STATE, JSON.stringify(state)), 150);
}

function restore(i) {
  if (i < 0 || i >= history.stack.length) return;
  history.index = i;
  Object.assign(state, JSON.parse(history.stack[i]));
  save();
  viewer.setRoom(state.room);
  renderAll();
}

function workerUrl() {
  return (store.get(LS_WORKER) || WORKER_URL || '').replace(/\/+$/, '');
}

// ---------- lookups ----------

const itemById = (id) => state.inventory.find((i) => i.id === id);
const placedById = (id) => state.placed.find((p) => p.id === id);
const dimsOf = (item) => {
  const def = DEFAULT_DIMS[item.category] || [0.6, 0.6, 0.6];
  return { w: item.dims?.w || def[0], d: item.dims?.d || def[1], h: item.dims?.h || def[2] };
};
const colorOf = (item, p) => item.colors?.find((c) => c.name === p?.color) || (p?.color?.startsWith?.('#') ? { name: 'Custom', hex: p.color } : item.colors?.[0]);

// ---------- rendering ----------

function renderAll() {
  viewer.sync(state.placed, state.inventory);
  renderInventory();
  renderInspector();
  $('#undoBtn').disabled = history.index <= 0;
  $('#redoBtn').disabled = history.index >= history.stack.length - 1;
}

const ICONS = {
  default: '<svg viewBox="0 0 32 32"><rect x="5" y="11" width="22" height="12" rx="3"/><path d="M8 23v3M24 23v3"/></svg>',
  sofa: '<svg viewBox="0 0 32 32"><rect x="4" y="13" width="24" height="9" rx="3"/><rect x="7" y="8" width="18" height="7" rx="2"/><path d="M7 22v3M25 22v3"/></svg>',
  bed: '<svg viewBox="0 0 32 32"><rect x="4" y="15" width="24" height="7" rx="2"/><path d="M5 22v3M27 22v3M5 15V8M9 13h6"/></svg>',
  plant: '<svg viewBox="0 0 32 32"><path d="M11 20h10l-1.5 7h-7z"/><path d="M16 20c0-6-5-9-8-9 0 5 4 8 8 9zM16 20c0-7 4-11 8-11 0 6-4 10-8 11z"/></svg>',
  lamp: '<svg viewBox="0 0 32 32"><path d="M11 5h10l3 8H8z"/><path d="M16 13v14M11 27h10"/></svg>',
  rug: '<svg viewBox="0 0 32 32"><rect x="5" y="9" width="22" height="14" rx="1"/><rect x="9" y="12" width="14" height="8"/></svg>',
};
const iconFor = (cat) => ICONS[cat] || ICONS[{ armchair: 'sofa', floorlamp: 'lamp' }[cat]] || ICONS.default;

function renderInventory() {
  const q = $('#invSearch').value.trim().toLowerCase();
  const list = state.inventory.filter((i) => !q || i.name.toLowerCase().includes(q) || (CATEGORY_LABELS[i.category] || '').toLowerCase().includes(q));
  $('#invCount').textContent = state.inventory.length;
  const el = $('#inventory');
  if (!state.inventory.length) {
    el.innerHTML = '<div class="empty">Your inventory is empty.<br>Paste a product link above or add a custom item.</div>';
    return;
  }
  if (!list.length) {
    el.innerHTML = '<div class="empty">No matches.</div>';
    return;
  }
  el.innerHTML = list
    .map((i) => {
      const d = i.dims || {};
      const missing = !d.w || !d.d || !d.h;
      const inRoom = state.placed.filter((p) => p.itemId === i.id).length;
      const pick = pickedColor[i.id] || i.colors?.[0]?.name;
      return `<div class="card" draggable="true" data-id="${esc(i.id)}" title="Drag into the room">
        <div class="thumb" style="${i.image ? `background-image:url('${esc(i.image)}')` : ''}">${i.image ? '' : iconFor(i.category)}</div>
        <div>
          <div class="nm">${esc(i.name)}</div>
          <div class="sz ${missing ? 'missing' : ''}">${missing ? '⚠ Size needed · ' : ''}${cm(dimsOf(i).w)} × ${cm(dimsOf(i).d)} × ${cm(dimsOf(i).h)} cm${inRoom ? ` · ${inRoom} in room` : ''}</div>
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

function presetSvg(pts) {
  const b = bounds(pts);
  const s = Math.min(34 / (b.maxX - b.minX), 26 / (b.maxZ - b.minZ));
  const ox = (38 - (b.maxX - b.minX) * s) / 2;
  const oz = (30 - (b.maxZ - b.minZ) * s) / 2;
  return `<svg viewBox="0 0 38 30"><polygon points="${pts.map(([x, z]) => `${ox + (x - b.minX) * s},${oz + (z - b.minZ) * s}`).join(' ')}"/></svg>`;
}

function renderInspector() {
  const el = $('#inspector');
  const sel = viewer.selectedId && placedById(viewer.selectedId);
  if (viewer.editRoom) return renderRoomEdit(el);
  if (sel) return renderItemInspector(el, sel);
  return renderRoomOverview(el);
}

function renderItemInspector(el, p) {
  const item = itemById(p.itemId);
  if (!item) return (el.innerHTML = '');
  const d = dimsOf(item);
  const cur = colorOf(item, p);
  const custom = p.color?.startsWith?.('#');
  el.innerHTML = `<div class="insp">
    ${item.image ? `<div class="hero" style="background-image:url('${esc(item.image)}')"></div>` : ''}
    <h3>${esc(item.name)}</h3>
    <div class="sub">${esc(CATEGORY_LABELS[item.category] || item.category)}${item.price ? ` · ${esc(item.currency || '')} ${esc(item.price)}` : ''}${item.url ? ` · <a href="${esc(item.url)}" target="_blank" rel="noopener">View product ↗</a>` : ''}</div>
    <div class="group"><div class="lbl">Colour <span>${esc(cur?.name || '')}</span></div>
      <div class="color-list">
        ${(item.colors || []).map((c) => `<button class="color-chip ${!custom && c.name === cur?.name ? 'on' : ''}" data-color="${esc(c.name)}"><span class="dot" style="background:${esc(c.hex)}"></span>${esc(c.name)}</button>`).join('')}
        <label class="color-chip ${custom ? 'on' : ''}" title="Any colour"><input type="color" id="customColor" value="${esc(custom ? p.color : cur?.hex || '#cccccc')}">Custom</label>
      </div>
    </div>
    <div class="group"><div class="lbl">Size <button class="btn small ghost" id="editSize">Edit item</button></div>
      <div>${cm(d.w)} W × ${cm(d.d)} D × ${cm(d.h)} H cm</div>
    </div>
    <div class="group"><div class="lbl">Rotate <span>${Math.round(p.rot || 0)}°</span></div>
      <div class="row">
        <button class="btn small" data-rot="-90" title="Shift+R">↺ 90°</button>
        <button class="btn small" data-rot="-15">↺ 15°</button>
        <button class="btn small" data-rot="15">↻ 15°</button>
        <button class="btn small" data-rot="90" title="R">↻ 90°</button>
      </div>
    </div>
    <div class="group"><div class="lbl">Position (cm)</div>
      <div class="num-row">
        <label>X<input type="number" step="1" data-pos="x" value="${cm(p.x)}"></label>
        <label>Z<input type="number" step="1" data-pos="z" value="${cm(p.z)}"></label>
        <label>Lift<input type="number" step="1" min="0" data-pos="y" value="${cm(p.y || 0)}"></label>
      </div>
    </div>
    ${item.modelUrl ? `<div class="group"><label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" id="useModel" ${item.useModel !== false ? 'checked' : ''}> Use the store's 3D model</label></div>` : ''}
    <div class="group">
      <div class="row">
        <button class="btn small" id="wallBtn" title="Push its back flat against the nearest wall">Against wall</button>
        <button class="btn small" id="dupBtn" title="Ctrl+D">Duplicate</button>
      </div>
      <div class="row" style="margin-top:6px"><button class="btn small danger" id="removeBtn" title="Delete">Remove from room</button></div>
    </div>
  </div>`;
  $$('.color-chip[data-color]', el).forEach((b) => (b.onclick = () => updatePlaced(p.id, { color: b.dataset.color })));
  $('#customColor', el).oninput = (e) => {
    const q = placedById(p.id);
    q.color = e.target.value;
    viewer.sync(state.placed, state.inventory);
  };
  $('#customColor', el).onchange = () => commit();
  $('#editSize', el).onclick = () => openItemDialog(item);
  $$('[data-rot]', el).forEach((b) => (b.onclick = () => rotateSelected(+b.dataset.rot)));
  $$('[data-pos]', el).forEach((inp) => (inp.onchange = () => {
    const v = parseFloat(inp.value) / 100;
    if (Number.isFinite(v)) updatePlaced(p.id, { [inp.dataset.pos]: Math.max(inp.dataset.pos === 'y' ? 0 : -1e9, v) });
  }));
  if ($('#useModel', el)) $('#useModel', el).onchange = (e) => ((item.useModel = e.target.checked), commit());
  $('#wallBtn', el).onclick = () => againstWall(p.id);
  $('#dupBtn', el).onclick = () => duplicate(p.id);
  $('#removeBtn', el).onclick = () => removePlaced(p.id);
}

function renderRoomOverview(el) {
  const r = state.room;
  const area = Math.abs(signedArea(r.points));
  el.innerHTML = `<div class="insp">
    <h3>Room</h3>
    <div class="sub">${area.toFixed(1)} m² · ${r.points.length} walls · ${state.placed.length} items</div>
    <div class="group"><div class="lbl">Start from a shape</div>
      <div class="preset-grid">${Object.entries(ROOM_PRESETS).map(([k, f]) => `<button class="preset" data-preset="${esc(k)}">${presetSvg(f())}${esc(k)}</button>`).join('')}
        <button class="preset" id="customShape"><svg viewBox="0 0 38 30"><polygon points="4,4 30,4 34,14 24,26 4,26"/></svg>Custom…</button>
      </div>
    </div>
    <div class="group"><div class="lbl">Ceiling height</div>
      <div class="num-row" style="grid-template-columns:1fr"><label><input type="number" id="roomH" min="180" max="800" step="5" value="${cm(r.height)}"></label></div>
    </div>
    <div class="group"><div class="lbl">Floor</div>
      <div class="swatch-input">
        <select id="floorKind">${['wood', 'tiles', 'carpet', 'concrete'].map((k) => `<option ${r.floorKind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <input type="color" id="floorColor" value="${esc(r.floorColor)}">
      </div>
    </div>
    <div class="group"><div class="lbl">Walls</div>
      <div class="swatch-input"><input type="color" id="wallColor" value="${esc(r.wallColor)}"><span class="hint">Wall colour</span></div>
    </div>
    <div class="group"><button class="btn" style="width:100%" id="editShapeBtn">Edit shape, doors & windows</button></div>
    ${state.placed.length ? `<div class="group"><div class="lbl">In this room</div><div class="cards" id="placedList">${state.placed
      .map((p) => {
        const it = itemById(p.itemId);
        const c = it && colorOf(it, p);
        return it ? `<button class="btn small ghost" style="text-align:left;display:flex;gap:8px;align-items:center" data-sel="${esc(p.id)}"><span class="sw" style="background:${esc(c?.hex || '#ccc')}"></span>${esc(it.name)}</button>` : '';
      })
      .join('')}</div></div>` : ''}
  </div>`;
  $$('[data-preset]', el).forEach((b) => (b.onclick = () => applyPreset(b.dataset.preset)));
  $('#customShape', el).onclick = () => setEditRoom(true);
  $('#roomH', el).onchange = (e) => {
    const v = parseFloat(e.target.value);
    if (v >= 150) (state.room.height = v / 100), viewer.setRoom(state.room), commit();
  };
  $('#floorKind', el).onchange = (e) => ((state.room.floorKind = e.target.value), viewer.setRoom(state.room), commit());
  $('#floorColor', el).oninput = (e) => ((state.room.floorColor = e.target.value), viewer.setRoom(state.room));
  $('#floorColor', el).onchange = () => commit();
  $('#wallColor', el).oninput = (e) => ((state.room.wallColor = e.target.value), viewer.setRoom(state.room));
  $('#wallColor', el).onchange = () => commit();
  $('#editShapeBtn', el).onclick = () => setEditRoom(true);
  $$('[data-sel]', el).forEach((b) => (b.onclick = () => viewer.select(b.dataset.sel)));
}

function renderRoomEdit(el) {
  const r = state.room;
  const ws = walls(r.points);
  const wi = viewer.selectedWall;
  const vi = viewer.selectedVertex;
  let body = '';
  if (wi != null && ws[wi]) {
    const w = ws[wi];
    const ops = (r.openings || []).filter((o) => o.wall === wi);
    body = `<div class="group"><div class="lbl">Wall ${wi + 1}</div>
        <div class="num-row" style="grid-template-columns:1fr"><label>Length (cm)<input type="number" id="wallLen" min="20" step="1" value="${cm(w.len)}"></label></div>
      </div>
      <div class="group"><div class="row"><button class="btn small" id="addDoor">+ Door</button><button class="btn small" id="addWindow">+ Window</button><button class="btn small" id="splitWall" title="Adds a corner in the middle of this wall">Split</button></div></div>
      ${ops
        .map(
          (o) => `<div class="opening" data-op="${esc(o.id)}"><div class="top">${o.type === 'door' ? 'Door' : 'Window'}<button class="btn small ghost danger" data-del>Remove</button></div>
          <div class="num-row">
            <label>From corner<input type="number" data-k="offset" value="${cm(o.offset)}"></label>
            <label>Width<input type="number" data-k="width" value="${cm(o.width)}"></label>
            <label>Height<input type="number" data-k="height" value="${cm(o.height)}"></label>
            ${o.type === 'window' ? `<label>Sill<input type="number" data-k="sill" value="${cm(o.sill)}"></label>` : `<label style="flex-direction:row;align-items:center;gap:6px;margin-top:16px"><input type="checkbox" data-k="open" ${o.open ? 'checked' : ''}>Open</label>`}
          </div></div>`
        )
        .join('')}`;
  } else if (vi != null && r.points[vi]) {
    const [x, z] = r.points[vi];
    body = `<div class="group"><div class="lbl">Corner ${vi + 1}</div>
      <div class="num-row" style="grid-template-columns:1fr 1fr"><label>X (cm)<input type="number" data-v="0" value="${cm(x)}"></label><label>Z (cm)<input type="number" data-v="1" value="${cm(z)}"></label></div></div>
      <div class="group"><button class="btn small danger" id="delCorner" ${r.points.length <= 3 ? 'disabled' : ''}>Delete corner</button></div>`;
  } else {
    body = `<div class="tip">• <b>Drag</b> the blue corners to reshape (they snap to straight walls; hold Shift for any angle).<br>• <b>Double-click</b> a wall to add a corner.<br>• <b>Click</b> a wall to set its length and add doors or windows.</div>`;
  }
  el.innerHTML = `<div class="insp"><h3>Edit room</h3><div class="sub">${Math.abs(signedArea(r.points)).toFixed(1)} m² floor area</div>${body}
    <div class="group" style="margin-top:14px"><button class="btn primary" style="width:100%" id="doneEdit">Done</button></div></div>`;
  $('#doneEdit', el).onclick = () => setEditRoom(false);
  if (wi != null && ws[wi]) {
    $('#wallLen', el).onchange = (e) => setWallLength(wi, parseFloat(e.target.value) / 100);
    $('#addDoor', el).onclick = () => addOpening(wi, 'door');
    $('#addWindow', el).onclick = () => addOpening(wi, 'window');
    $('#splitWall', el).onclick = () => {
      const w = ws[wi];
      insertCorner(wi, [+((w.a[0] + w.b[0]) / 2).toFixed(3), +((w.a[1] + w.b[1]) / 2).toFixed(3)]);
    };
    $$('.opening', el).forEach((box) => {
      const o = r.openings.find((x) => x.id === box.dataset.op);
      $('[data-del]', box).onclick = () => ((r.openings = r.openings.filter((x) => x !== o)), viewer.setRoom(r), commit());
      $$('[data-k]', box).forEach((inp) => (inp.onchange = () => {
        if (inp.type === 'checkbox') o[inp.dataset.k] = inp.checked;
        else {
          const v = parseFloat(inp.value) / 100;
          if (Number.isFinite(v) && v >= 0) o[inp.dataset.k] = v;
        }
        viewer.setRoom(r);
        commit();
      }));
    });
  }
  if (vi != null && r.points[vi]) {
    $$('[data-v]', el).forEach((inp) => (inp.onchange = () => {
      const v = parseFloat(inp.value) / 100;
      if (!Number.isFinite(v)) return;
      r.points[vi][+inp.dataset.v] = v;
      viewer.setRoom(r);
      commit();
    }));
    $('#delCorner', el).onclick = () => deleteCorner(vi);
  }
}

// ---------- room operations ----------

function setEditRoom(on) {
  viewer.setEditRoom(on);
  $('#editRoomBtn').classList.toggle('on', on);
  $('#editRoomBtn').textContent = on ? 'Done editing' : 'Edit room';
  updateHint();
  renderInspector();
}

function applyPreset(name) {
  const cur = bounds(state.room.points);
  const W = +(cur.maxX - cur.minX).toFixed(2);
  const D = +(cur.maxZ - cur.minZ).toFixed(2);
  const pts = ROOM_PRESETS[name](Math.max(W, name === 'rectangle' ? 2 : 4), Math.max(D, name === 'rectangle' ? 2 : 3.5)).map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)]);
  state.room.points = pts;
  state.room.openings = (state.room.openings || []).filter((o) => o.wall < pts.length);
  keepItemsInside();
  viewer.setRoom(state.room, { refit: true });
  commit();
  toast(`Room set to ${name}. Use Edit room to fine-tune.`);
}

function setWallLength(i, len) {
  if (!(len > 0.2)) return;
  const pts = state.room.points;
  const n = pts.length;
  const a = pts[i];
  const b = pts[(i + 1) % n];
  const cur = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = ((b[0] - a[0]) / cur) * (len - cur);
  const dz = ((b[1] - a[1]) / cur) * (len - cur);
  // Move the wall's end corner and the next one together, so neighbouring walls keep their angle.
  const j = (i + 1) % n;
  const k = (i + 2) % n;
  pts[j] = [+(pts[j][0] + dx).toFixed(3), +(pts[j][1] + dz).toFixed(3)];
  if (n > 3 && k !== i) pts[k] = [+(pts[k][0] + dx).toFixed(3), +(pts[k][1] + dz).toFixed(3)];
  keepItemsInside();
  viewer.setRoom(state.room);
  commit();
}

function insertCorner(wallIndex, pt) {
  state.room.points.splice(wallIndex + 1, 0, pt);
  // Openings on later walls shift index by one.
  for (const o of state.room.openings || []) if (o.wall > wallIndex) o.wall++;
  viewer.selectedWall = null;
  viewer.selectedVertex = wallIndex + 1;
  viewer.setRoom(state.room);
  commit();
}

function deleteCorner(i) {
  if (state.room.points.length <= 3) return;
  state.room.points.splice(i, 1);
  state.room.openings = (state.room.openings || []).filter((o) => o.wall !== i && o.wall !== (i - 1 + state.room.points.length + 1) % (state.room.points.length + 1));
  for (const o of state.room.openings) if (o.wall > i) o.wall--;
  viewer.selectedVertex = null;
  keepItemsInside();
  viewer.setRoom(state.room);
  commit();
}

function addOpening(wi, type) {
  const w = walls(state.room.points)[wi];
  const width = type === 'door' ? Math.min(0.9, w.len - 0.2) : Math.min(1.2, w.len - 0.3);
  if (width < 0.3) return toast('This wall is too short for that.');
  state.room.openings ||= [];
  state.room.openings.push({ id: uid('o'), type, wall: wi, offset: +((w.len - width) / 2).toFixed(2), width, height: type === 'door' ? 2.1 : 1.3, sill: type === 'door' ? 0 : 0.85, open: false });
  viewer.setRoom(state.room);
  commit();
}

function keepItemsInside() {
  const pts = state.room.points;
  const [cx, cz] = centroid(pts);
  for (const p of state.placed) {
    if (!pointInPolygon(p.x, p.z, pts)) {
      p.x = pointInPolygon(cx, cz, pts) ? cx : pts[0][0] + 0.5;
      p.z = pointInPolygon(cx, cz, pts) ? cz : pts[0][1] + 0.5;
    }
  }
}

// ---------- item operations ----------

function updatePlaced(id, patch) {
  const p = placedById(id);
  if (!p) return;
  Object.assign(p, patch);
  commit();
}

function rotateSelected(delta) {
  const p = viewer.selectedId && placedById(viewer.selectedId);
  if (!p) return;
  p.rot = ((((p.rot || 0) + delta) % 360) + 360) % 360;
  viewer.sync(state.placed, state.inventory);
  const rec = viewer.items.get(p.id);
  const c = rec && viewer.constrain(rec, p.x, p.z, false);
  if (c) Object.assign(p, { x: c.x, z: c.z });
  commit();
}

function footprint(p) {
  const it = itemById(p.itemId);
  if (!it) return null;
  const d = dimsOf(it);
  const a = ((p.rot || 0) * Math.PI) / 180;
  const hw = Math.abs(Math.cos(a)) * d.w / 2 + Math.abs(Math.sin(a)) * d.d / 2;
  const hd = Math.abs(Math.sin(a)) * d.w / 2 + Math.abs(Math.cos(a)) * d.d / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd, rug: it.category === 'rug' };
}

/** Nearest free floor spot to `at` (or the room centre) where the item fits without overlapping. */
function findSpot(item, at) {
  const pts = state.room.points;
  const d = dimsOf(item);
  const [cx, cz] = at || centroid(pts);
  if (at) return at;
  const others = state.placed.map(footprint).filter((f) => f && !(item.category !== 'rug' && f.rug));
  const fits = (x, z) => {
    const corners = [[x - d.w / 2, z - d.d / 2], [x + d.w / 2, z - d.d / 2], [x + d.w / 2, z + d.d / 2], [x - d.w / 2, z + d.d / 2]];
    if (!corners.every(([px, pz]) => pointInPolygon(px, pz, pts))) return false;
    return !others.some((f) => x + d.w / 2 > f.x0 && x - d.w / 2 < f.x1 && z + d.d / 2 > f.z0 && z - d.d / 2 < f.z1);
  };
  const b = bounds(pts);
  let best = null;
  for (let x = b.minX + d.w / 2; x <= b.maxX - d.w / 2 + 1e-6; x += 0.1)
    for (let z = b.minZ + d.d / 2; z <= b.maxZ - d.d / 2 + 1e-6; z += 0.1) {
      if (!fits(x, z)) continue;
      const dist = Math.hypot(x - cx, z - cz);
      if (!best || dist < best[2]) best = [x, z, dist];
    }
  if (best) return [best[0], best[1]];
  // Room is full: fall back to anywhere inside.
  if (pointInPolygon(cx, cz, pts)) return [cx, cz];
  for (let t = 0.1; t <= 1; t += 0.1) {
    const px = pts[0][0] + (cx - pts[0][0]) * t;
    const pz = pts[0][1] + (cz - pts[0][1]) * t;
    if (pointInPolygon(px, pz, pts)) return [px, pz];
  }
  return [cx, cz];
}

function addToRoom(itemId, at) {
  const item = itemById(itemId);
  if (!item) return;
  const [x, z] = findSpot(item, at);
  const p = { id: uid('p'), itemId, x: +x.toFixed(3), z: +z.toFixed(3), rot: 0, color: pickedColor[itemId] || item.colors?.[0]?.name || null };
  state.placed.push(p);
  viewer.sync(state.placed, state.inventory);
  const rec = viewer.items.get(p.id);
  const c = rec && viewer.constrain(rec, p.x, p.z, false);
  if (c) Object.assign(p, c);
  if (item.category === 'curtain' || item.category === 'mirror' || item.category === 'wardrobe' || item.category === 'bookshelf') {
    placeAgainstWall(p);
  }
  commit({ render: false });
  renderAll();
  viewer.select(p.id);
  $('#leftPanel').classList.remove('open');
}

function placeAgainstWall(p) {
  const item = itemById(p.itemId);
  const w = nearestWall(p.x, p.z, state.room.points);
  if (!w) return;
  const d = dimsOf(item);
  p.rot = Math.round((Math.atan2(w.inward[0], w.inward[1]) * 180) / Math.PI + 360) % 360;
  p.x = +(w.q[0] + w.inward[0] * (d.d / 2 + 0.005)).toFixed(3);
  p.z = +(w.q[1] + w.inward[1] * (d.d / 2 + 0.005)).toFixed(3);
  viewer.sync(state.placed, state.inventory);
  const rec = viewer.items.get(p.id);
  const c = rec && viewer.constrain(rec, p.x, p.z, true);
  if (c) Object.assign(p, { x: c.x, z: c.z });
}

function againstWall(id) {
  const p = placedById(id);
  if (!p) return;
  placeAgainstWall(p);
  commit();
}

function duplicate(id) {
  const p = placedById(id);
  if (!p) return;
  const q = { ...p, id: uid('p'), x: p.x + 0.3, z: p.z + 0.3 };
  if (!pointInPolygon(q.x, q.z, state.room.points)) Object.assign(q, { x: p.x - 0.3, z: p.z - 0.3 });
  state.placed.push(q);
  commit();
  viewer.select(q.id);
}

function removePlaced(id) {
  state.placed = state.placed.filter((p) => p.id !== id);
  viewer.select(null);
  commit();
  toast('Removed from room.', { undo: true });
}

// ---------- item editor ----------

let editing = null;

function colorRow(c = { name: '', hex: '#cccccc' }) {
  const row = document.createElement('div');
  row.className = 'color-row';
  row.innerHTML = `<input type="color" value="${esc(c.hex || '#cccccc')}"><input type="text" placeholder="Colour name, e.g. Light beige" value="${esc(c.name)}"><button type="button" title="Remove">×</button>`;
  const [pick, name] = $$('input', row);
  // Typing a colour name suggests a matching swatch until the user picks one by hand.
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
  $('#itemDialogTitle').textContent = isNew ? 'Add item' : 'Edit item';
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
  if (!note) f.name.focus();
}

function saveItemDialog() {
  const f = $('#itemForm');
  const { item, isNew } = editing;
  const num = (v) => Math.max(0.005, parseFloat(v) / 100);
  item.name = f.name.value.trim() || 'Untitled item';
  const oldCat = item.category;
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
  // Keep placed colours valid.
  for (const p of state.placed) if (p.itemId === item.id && p.color && !p.color.startsWith('#') && !item.colors.some((c) => c.name === p.color)) p.color = item.colors[0].name;
  if (isNew && !itemById(item.id)) state.inventory.unshift(item);
  commit();
  if (isNew) toast(`“${item.name}” added to inventory.`, { action: ['Add to room', () => addToRoom(item.id)] });
  void oldCat;
}

// ---------- importing links ----------

const queue = [];

function renderQueue() {
  $('#queue').innerHTML = queue
    .slice(-6)
    .reverse()
    .map((q) => `<li class="${q.status === 'error' ? 'err' : q.status === 'warn' ? 'warn' : ''}" data-q="${q.id}">
      <span class="st">${q.status === 'pending' ? '<span class="spin"></span>' : q.status === 'error' ? '✕' : q.status === 'warn' ? '!' : '✓'}</span>
      <div class="body"><div class="t" title="${esc(q.url)}">${esc(q.title || q.url)}</div><div class="m">${q.message || 'Reading page…'}</div></div>
      ${q.status !== 'pending' ? '<button class="x" data-dismiss title="Dismiss">×</button>' : ''}
    </li>`)
    .join('');
  $$('#queue [data-dismiss]').forEach((b) => (b.onclick = () => {
    const id = b.closest('li').dataset.q;
    queue.splice(queue.findIndex((q) => q.id === id), 1);
    renderQueue();
  }));
  $$('#queue [data-edit]').forEach((a) => (a.onclick = () => {
    const it = itemById(a.dataset.edit);
    if (it) openItemDialog(it);
  }));
  $$('#queue [data-add]').forEach((a) => (a.onclick = () => addToRoom(a.dataset.add)));
  $$('#queue [data-manual]').forEach((a) => (a.onclick = () => {
    const q = queue.find((x) => x.id === a.dataset.manual);
    openItemDialog(guessFromUrl(q.url), { isNew: true, note: 'We could not read this page automatically. Check the name and enter the size from the product page.' });
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

function titleCase(s) {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

function guessFromUrl(url) {
  let name = 'New item';
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    const dp = segs.findIndex((s) => /^(dp|gp|product|products|p|item|itm|pd)$/i.test(s));
    let seg = (dp > 0 && /[a-z]-/i.test(segs[dp - 1]) ? segs[dp - 1] : null) || [...segs].reverse().find((s) => /[a-z]{3,}.*[-_+]/i.test(s)) || segs.at(-1) || u.hostname;
    seg = decodeURIComponent(seg).replace(/\.(html?|aspx?|php)$/i, '').replace(/[-_+]+/g, ' ').replace(/\b(s?\d{6,}|[A-Z0-9]{10})\b/g, '').replace(/\s+/g, ' ').trim();
    if (seg) name = titleCase(seg).slice(0, 80);
  } catch {}
  const category = guessCategory(name);
  // Colour = last colour word in the name, plus a modifier before it ("Light beige").
  const words = name.split(' ');
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
  // Rugs are flat; if the store listed only two numbers, the second is length.
  if (cat === 'rug' && d.w && d.d == null && d.h) Object.assign(d, { d: d.h, h: 0.012 });
  if (cat === 'rug' && (!d.h || d.h > 0.05)) d.h = 0.012;
  return {
    id: uid('i'),
    name: prod.name || 'Imported item',
    category: cat,
    url: prod.url,
    image: prod.image || null,
    price: prod.price || null,
    currency: prod.currency || null,
    modelUrl: prod.modelUrl || null,
    dims: { w: d.w || def[0], d: d.d || def[1], h: d.h || def[2] },
    needsDims: !(d.w && d.d && d.h),
    colors,
  };
}

async function importUrls(urls) {
  if (!urls.length) return toast('No links found. Paste a full link starting with https://');
  const base = workerUrl();
  for (const url of urls) {
    const existing = state.inventory.find((i) => i.url === url);
    const q = { id: uid('q'), url, status: 'pending', title: url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) };
    queue.push(q);
    if (existing) {
      Object.assign(q, { status: 'ok', title: existing.name, message: `Already in your inventory · <a data-add="${existing.id}">Add to room</a>` });
      continue;
    }
    renderQueue();
    if (!base) {
      const item = guessFromUrl(url);
      item.needsDims = true;
      state.inventory.unshift(item);
      commit();
      Object.assign(q, {
        status: 'warn',
        title: item.name,
        message: `Link reader not set up, so the size is a typical guess. <a data-edit="${item.id}">Enter the real size</a> · <a onclick="document.querySelector('[data-act=settings]').click()">Set up</a>`,
      });
      continue;
    }
    try {
      const res = await fetch(`${base}/scrape?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!data.ok) throw new Error(data.error || 'Could not read the page.');
      const item = itemFromProduct(data.product);
      state.inventory.unshift(item);
      commit();
      const bits = [];
      bits.push(`${cm(item.dims.w)} × ${cm(item.dims.d)} × ${cm(item.dims.h)} cm`);
      if (item.colors.length > 1) bits.push(`${item.colors.length} colours`);
      if (item.modelUrl) bits.push('3D model found');
      Object.assign(q, {
        status: item.needsDims ? 'warn' : 'ok',
        title: item.name,
        message: (item.needsDims ? `Size partly guessed. <a data-edit="${item.id}">Check size</a> · ` : '') + bits.join(' · ') + ` · <a data-add="${item.id}">Add to room</a>`,
      });
    } catch (err) {
      Object.assign(q, { status: 'error', message: `${esc(err.message || err)} <a data-manual="${q.id}">Add manually</a>` });
    }
    renderQueue();
  }
  renderQueue();
}

// ---------- misc UI ----------

let toastTimer;
function toast(msg, { undo, action } = {}) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (undo ? '<button data-t="undo">Undo</button>' : '') + (action ? `<button data-t="act">${esc(action[0])}</button>` : '');
  t.classList.add('show');
  if (undo) $('[data-t=undo]', t).onclick = () => (restore(history.index - 1), t.classList.remove('show'));
  if (action) $('[data-t=act]', t).onclick = () => (action[1](), t.classList.remove('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action || undo ? 6000 : 3000);
}

function updateHint() {
  const v = viewer.view;
  $('#hintbar').textContent = viewer.editRoom
    ? 'Drag corners to reshape · Double-click a wall to add a corner · Click a wall for doors & windows'
    : v === 'eye'
      ? 'W A S D or scroll to walk · Drag to look around'
      : v === 'plan'
        ? 'Drag items to move · Drag the blue dot to rotate · Scroll to zoom · Drag empty space to pan'
        : 'Drag items to move · Drag the blue dot to rotate · Drag empty space to orbit · Right-drag to pan';
}

function setView(v) {
  viewer.setView(v);
  $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  updateHint();
}

function download(name, href) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function normalizeProject(p) {
  const room = p.room || {};
  return {
    room: {
      points: Array.isArray(room.points) && room.points.length >= 3 ? room.points : ROOM_PRESETS.rectangle(),
      height: room.height || 2.6,
      floorKind: room.floorKind || 'wood',
      floorColor: room.floorColor || '#c49a6c',
      wallColor: room.wallColor || '#efebe4',
      openings: room.openings || [],
    },
    inventory: Array.isArray(p.inventory) ? p.inventory : [],
    placed: Array.isArray(p.placed) ? p.placed : [],
    meta: { baseVersion: p.version ?? p.meta?.baseVersion ?? 0 },
  };
}

function loadRepoProject({ merge }) {
  const next = normalizeProject(repoProject);
  if (merge) {
    // Keep the user's own imported items too.
    const ids = new Set(next.inventory.map((i) => i.id));
    for (const i of state.inventory) if (!ids.has(i.id)) next.inventory.push(i);
  }
  Object.assign(state, next);
  viewer.select(null);
  viewer.setRoom(state.room, { refit: true });
  commit();
}

function showBanner(html, buttons) {
  const b = $('#banner');
  b.innerHTML = `<span>${html}</span>` + buttons.map((x, i) => `<button class="btn small ${i === 0 ? 'primary' : ''}" data-b="${i}">${esc(x[0])}</button>`).join('');
  b.hidden = false;
  buttons.forEach((x, i) => ($(`[data-b="${i}"]`, b).onclick = () => ((b.hidden = true), x[1]())));
}

// ---------- boot ----------

async function boot() {
  const categorySelect = $('#categorySelect');
  categorySelect.innerHTML = Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

  try {
    const res = await fetch('data/project.json', { cache: 'no-cache' });
    repoProject = await res.json();
  } catch {
    repoProject = { version: 0, room: {}, inventory: [], placed: [] };
  }
  let local = null;
  try {
    local = JSON.parse(store.get(LS_STATE) || 'null');
  } catch {}
  state = normalizeProject(local || repoProject);
  if (local?.meta) state.meta = local.meta;

  $('#loading').remove();
  viewer = new Viewer($('#stage'), {
    onSelect: () => renderInspector(),
    onLive: (p) => {
      const q = placedById(p.id);
      if (q) Object.assign(q, { x: p.x, z: p.z, y: p.y, rot: p.rot });
    },
    onCommit: (p) => {
      const q = placedById(p.id);
      if (q) Object.assign(q, { x: p.x, z: p.z, y: p.y, rot: p.rot });
      commit();
    },
    onRoomChange: (room) => {
      state.room.points = room.points;
      keepItemsInside();
      commit();
    },
    onRoomSelect: () => renderInspector(),
    onInsertCorner: (i, pt) => insertCorner(i, pt),
    onModelError: (item) => toast(`Couldn't load the 3D model for “${item.name}”, showing a generated one.`),
  });
  viewer.setAssetProxy((u) => {
    const base = workerUrl();
    if (!base || !/^https?:/i.test(u) || u.startsWith(location.origin) || u.startsWith(base)) return u;
    return `${base}/asset?url=${encodeURIComponent(u)}`;
  });
  viewer.setRoom(state.room);
  commit();
  updateHint();

  if (local && repoProject.version != null && local.meta?.baseVersion !== repoProject.version) {
    showBanner('The project file in the repo was updated.', [
      ['Load it', () => loadRepoProject({ merge: true })],
      ['Keep mine', () => ((state.meta.baseVersion = repoProject.version), save())],
    ]);
  }

  wireUI();
  // Handy for debugging from the browser console.
  window.roomcraft = { viewer, get state() { return state; }, commit, addToRoom };
}

function wireUI() {
  $$('#viewSeg button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  $('#editRoomBtn').onclick = () => setEditRoom(!viewer.editRoom);
  $('#undoBtn').onclick = () => restore(history.index - 1);
  $('#redoBtn').onclick = () => restore(history.index + 1);
  $('#shotBtn').onclick = () => download('room.png', viewer.screenshot());
  $('#panelToggle').onclick = () => $('#leftPanel').classList.toggle('open');

  const menu = $('#menu');
  $('#menuBtn').onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) menu.hidden = true;
  });
  menu.onclick = (e) => {
    const act = e.target.dataset.act;
    menu.hidden = true;
    if (act === 'export') {
      const blob = new Blob([JSON.stringify({ version: state.meta.baseVersion, room: state.room, inventory: state.inventory, placed: state.placed }, null, 2)], { type: 'application/json' });
      download('project.json', URL.createObjectURL(blob));
    } else if (act === 'import') $('#fileInput').click();
    else if (act === 'reload') {
      if (confirm('Replace the room with the project file from the repo? Your imported items are kept in the inventory.')) loadRepoProject({ merge: true });
    } else if (act === 'settings') openSettings();
    else if (act === 'help') $('#helpDialog').showModal();
    else if (act === 'clear') {
      state.placed = [];
      viewer.select(null);
      commit();
      toast('Room cleared.', { undo: true });
    }
  };
  $('#fileInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      Object.assign(state, normalizeProject(data));
      viewer.select(null);
      viewer.setRoom(state.room, { refit: true });
      commit();
      toast('Project imported.');
    } catch {
      toast('That file is not a valid project.');
    }
    e.target.value = '';
  };

  // Inventory
  $('#invSearch').oninput = renderInventory;
  $('#newItemBtn').onclick = () => openItemDialog({ id: uid('i'), name: '', category: 'sofa', colors: [] }, { isNew: true });
  $('#inventory').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    const sw = e.target.closest('.sw');
    if (sw) {
      pickedColor[id] = sw.dataset.color;
      // Also recolour the selected instance of this item, if any.
      const sel = viewer.selectedId && placedById(viewer.selectedId);
      if (sel?.itemId === id) updatePlaced(sel.id, { color: sw.dataset.color });
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

  // Item dialog
  $('#addColorBtn').onclick = () => $('#colorRows').appendChild(colorRow());
  $('#cancelItemBtn').onclick = () => $('#itemDialog').close();
  $('#itemForm').onsubmit = (e) => {
    e.preventDefault();
    saveItemDialog();
    $('#itemDialog').close();
  };
  $('#deleteItemBtn').onclick = () => {
    const { item } = editing;
    const n = state.placed.filter((p) => p.itemId === item.id).length;
    if (n && !confirm(`Delete “${item.name}”? It is placed ${n} time(s) in the room.`)) return;
    state.inventory = state.inventory.filter((i) => i !== item);
    state.placed = state.placed.filter((p) => p.itemId !== item.id);
    $('#itemDialog').close();
    viewer.select(null);
    commit();
    toast('Item deleted.', { undo: true });
  };
  $('#itemForm').category.onchange = (e) => {
    // Fill typical dimensions for a new item when switching type.
    if (!editing?.isNew) return;
    const def = DEFAULT_DIMS[e.target.value];
    const f = $('#itemForm');
    [f.w.value, f.d.value, f.h.value] = def.map((v) => cm(v));
  };
  $('#itemForm').name.oninput = (e) => {
    if (!editing?.isNew) return;
    const cat = guessCategory(e.target.value);
    if (cat !== 'box' && cat !== $('#itemForm').category.value) {
      $('#itemForm').category.value = cat;
      $('#itemForm').category.onchange({ target: $('#itemForm').category });
    }
  };

  // Importing
  $('#importBtn').onclick = () => {
    const urls = extractUrls($('#linkInput').value);
    $('#linkInput').value = '';
    importUrls(urls);
  };
  $('#linkInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      $('#importBtn').click();
    }
  });
  $('#linkInput').addEventListener('paste', () => setTimeout(() => {
    if (extractUrls($('#linkInput').value).length) $('#importBtn').click();
  }, 0));

  // Drag & drop: links anywhere; inventory cards onto the stage.
  let dragDepth = 0;
  const isInternal = (e) => e.dataTransfer?.types?.includes('application/x-roomcraft-item');
  const isLink = (e) => !isInternal(e) && ['text/uri-list', 'text/plain', 'text/x-moz-url'].some((t) => e.dataTransfer?.types?.includes(t));
  window.addEventListener('dragenter', (e) => {
    if (!isLink(e)) return;
    dragDepth++;
    $('#dropOverlay').hidden = false;
    $('#dropzone').classList.add('over');
  });
  window.addEventListener('dragleave', (e) => {
    if (!isLink(e)) return;
    if (--dragDepth <= 0) {
      dragDepth = 0;
      $('#dropOverlay').hidden = true;
      $('#dropzone').classList.remove('over');
    }
  });
  window.addEventListener('dragover', (e) => {
    if (isLink(e) || (isInternal(e) && e.target.closest?.('#stage'))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  window.addEventListener('drop', (e) => {
    dragDepth = 0;
    $('#dropOverlay').hidden = true;
    $('#dropzone').classList.remove('over');
    if (isInternal(e)) {
      e.preventDefault();
      if (!e.target.closest?.('#stage')) return;
      const id = e.dataTransfer.getData('application/x-roomcraft-item');
      const p = viewer.floorAt(e.clientX, e.clientY);
      addToRoom(id, p && pointInPolygon(p.x, p.z, state.room.points) ? [p.x, p.z] : null);
      return;
    }
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/x-moz-url');
    const urls = extractUrls(text);
    if (urls.length) {
      e.preventDefault();
      importUrls(urls);
    }
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (/input|textarea|select/i.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') {
      e.preventDefault();
      restore(history.index + (e.shiftKey ? 1 : -1));
    } else if (mod && k === 'y') {
      e.preventDefault();
      restore(history.index + 1);
    } else if (mod && k === 'd' && viewer.selectedId) {
      e.preventDefault();
      duplicate(viewer.selectedId);
    } else if ((k === 'delete' || k === 'backspace') && viewer.selectedId) {
      e.preventDefault();
      removePlaced(viewer.selectedId);
    } else if (k === 'r' && !mod && viewer.selectedId) rotateSelected(e.shiftKey ? -90 : 90);
    else if (k === 'escape') {
      if (viewer.editRoom) setEditRoom(false);
      else viewer.select(null);
    } else if (['1', '2', '3'].includes(k) && !mod) setView({ 1: '3d', 2: 'plan', 3: 'eye' }[k]);
    else if (k.startsWith('arrow') && viewer.selectedId && viewer.view !== 'eye') {
      e.preventDefault();
      const p = placedById(viewer.selectedId);
      const step = e.shiftKey ? 0.1 : 0.01;
      const [dx, dz] = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
      if (pointInPolygon(p.x + dx, p.z + dz, state.room.points)) {
        p.x = +(p.x + dx).toFixed(3);
        p.z = +(p.z + dz).toFixed(3);
        viewer.sync(state.placed, state.inventory);
        clearTimeout(wireUI.nudge);
        wireUI.nudge = setTimeout(() => commit(), 400);
      }
    }
  });
}

function openSettings() {
  $('#workerUrl').value = workerUrl();
  $('#workerStatus').textContent = '';
  $('#settingsDialog').showModal();
  $('#workerUrl').onchange = () => store.set(LS_WORKER, $('#workerUrl').value.trim());
  $('#testWorker').onclick = async () => {
    store.set(LS_WORKER, $('#workerUrl').value.trim());
    const base = workerUrl();
    if (!base) return ($('#workerStatus').textContent = 'Enter a URL first.');
    $('#workerStatus').textContent = 'Testing…';
    try {
      const r = await fetch(`${base}/health`);
      const j = await r.json();
      $('#workerStatus').textContent = j.ok ? '✓ Connected' : `✕ ${j.error || 'Unexpected reply'}`;
    } catch (err) {
      $('#workerStatus').textContent = `✕ Could not reach it (${err.message}). Check the URL and ALLOWED_ORIGINS.`;
    }
  };
}

boot().catch((err) => {
  console.error(err);
  const l = $('#loading');
  if (l) l.textContent = 'Could not start the 3D view: ' + err.message;
});
