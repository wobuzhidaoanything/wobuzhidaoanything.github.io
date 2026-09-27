// Editing tools for the house structure (active floor):
//   wall    click to start, click to add each corner; double-click, Esc or click the start to finish
//   room    click inside an area enclosed by walls to make it a room
//   door / window / opening   click on a wall
//   stairs  click to place a stair going up to the next floor
// Every change goes through `edit(mutator)` so the app can record undo and save.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { snapPoint, orthoSnap } from './viewer.js';
import { detectRooms, footprint } from './house.js';
import { moveOpening } from './edit.js';
import { wallFrame, closestOnSegment, pointInPolygon, area, DEFAULTS, stairLayout, elevations, toPlan } from './design.js';

const rid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);

export class Tools {
  constructor(viewer, { edit, notify, options }) {
    this.v = viewer;
    this.edit = edit;
    this.notify = notify || (() => {});
    this.options = options; // () => ({ exterior, thickness, stairShape, stairTurn })
    this.name = null;
    this.chain = null;
    this.preview = new THREE.Group();
    this.preview.userData.helper = true;
    viewer.overlay.add(this.preview);
    const el = document.createElement('div');
    el.className = 'dim-label';
    this.lenLabel = new CSS2DObject(el);
    this.lenLabel.visible = false;
    viewer.scene.add(this.lenLabel);
    this.onKey = (e) => {
      if (!this.name || /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (this.chain) this.finishChain();
        else this.set(null);
      }
    };
    window.addEventListener('keydown', this.onKey, true);
  }

  set(name) {
    this.name = name;
    this.chain = null;
    this.clearPreview();
    this.v.tool = name ? this : null;
    this.v.renderer.domElement.style.cursor = name ? 'crosshair' : '';
    if (name) this.v.select(null);
    this.notify(name);
  }

  clearPreview() {
    this.preview.clear();
    this.lenLabel.visible = false;
  }

  point(e) {
    const p = this.v.planePoint();
    if (!p) return null;
    let at = [p.x, p.z];
    if (!e.shiftKey) {
      at = snapPoint(at, this.v.activeFloorData);
      if (this.chain?.last) at = orthoSnap(at, this.chain.last);
    }
    return at;
  }

  onDown(e) {
    if (!this.name) return false;
    if (e.button !== 0) return true;
    this.downAt = [e.clientX, e.clientY];
    return true;
  }

  onUp(e) {
    if (!this.name) return false;
    if (!this.downAt || Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) > 5) {
      this.downAt = null;
      return true; // it was a camera drag
    }
    this.downAt = null;
    this.v.setPointer(e);
    const at = this.point(e);
    if (!at) return true;
    const floor = this.v.activeFloorData;
    const o = this.options();
    if (this.name === 'wall') {
      if (!this.chain) {
        this.chain = { start: at, last: at, count: 0 };
        return true;
      }
      if (Math.hypot(at[0] - this.chain.last[0], at[1] - this.chain.last[1]) < 0.05) return true;
      const closes = this.chain.count > 1 && Math.hypot(at[0] - this.chain.start[0], at[1] - this.chain.start[1]) < 0.02;
      const a = this.chain.last;
      this.edit((f) => f.walls.push({ id: rid('w'), a, b: at, thickness: o.thickness, ...(o.exterior ? { exterior: true } : {}) }));
      this.chain.last = at;
      this.chain.count++;
      if (closes) this.finishChain();
      return true;
    }
    if (this.name === 'room') {
      const polys = detectRooms(floor);
      const hit = polys.filter((p) => pointInPolygon(at[0], at[1], p)).sort((a, b) => Math.abs(area(a)) - Math.abs(area(b)))[0];
      if (!hit) {
        this.notify(this.name, 'Click inside an area fully enclosed by walls.');
        return true;
      }
      const existing = floor.rooms.find((r) => pointInPolygon(at[0], at[1], r.points));
      const pts = hit.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)]);
      this.edit((f) => {
        if (existing) f.rooms.find((r) => r.id === existing.id).points = pts;
        else f.rooms.push({ id: rid('r'), name: `Room ${f.rooms.length + 1}`, points: pts, floorKind: 'wood', floorColor: '#c49a6c' });
      });
      return true;
    }
    if (['door', 'window', 'opening'].includes(this.name)) {
      const w = this.v.nearestWall(at, 0.6);
      if (!w) {
        this.notify(this.name, 'Click on a wall.');
        return true;
      }
      const { len } = wallFrame(w);
      const width = Math.min(this.openingWidth(), len - 0.2);
      if (width < (this.name === 'door' ? 0.6 : 0.3)) return this.notify(this.name, 'That wall is too short.'), true;
      const id = rid('o');
      // Try on a copy first: it must fit between the other doors and windows on that wall.
      const probe = structuredClone(floor);
      probe.openings.push({ id, type: this.name, wall: w.id, offset: 0, width, height: 1, sill: 0 });
      if (!moveOpening(probe, id, at, { reach: 0.6 }) || probe.openings.find((o) => o.id === id).wall !== w.id) {
        this.notify(this.name, 'No room for it there: that part of the wall is taken.');
        return true;
      }
      const offset = probe.openings.find((o) => o.id === id).offset;
      this.edit((f) =>
        f.openings.push({ id, type: this.name, wall: w.id, offset: +offset.toFixed(3), width, height: this.name === 'window' ? Math.min(1.3, f.height - 1) : Math.min(2.1, f.height - 0.1), sill: this.name === 'window' ? 0.9 : 0 })
      );
      this.v.select({ type: 'opening', id });
      return true;
    }
    if (this.name === 'stairs') {
      const d = this.v.design;
      const fi = this.v.activeFloor;
      if (fi >= d.floors.length - 1) {
        this.notify(this.name, 'Add a floor above first: stairs lead up to the next floor.');
        return true;
      }
      const id = rid('s');
      const ys = elevations(d);
      const base = { id, shape: o.stairShape || 'straight', turn: o.stairTurn || 'left', x: +at[0].toFixed(3), z: +at[1].toFixed(3), rot: 0, width: DEFAULTS.stairWidth };
      // Prefer a rotation where the whole stair fits inside the house.
      const rot = [0, 90, 180, 270].find((r) => this.stairFits({ ...base, rot: r }, ys[fi + 1] - ys[fi]));
      if (rot === undefined) this.notify(this.name, "The stairs don't fit here; move or rotate them so they're inside the walls.");
      base.rot = rot ?? 0;
      this.edit((f) => f.stairs.push(base));
      this.set(null);
      this.v.select({ type: 'stairs', id });
      return true;
    }
    return true;
  }

  /** True when a stair's footprint lies inside the floor (and clear of walls). */
  openingWidth() {
    const o = this.options();
    return { door: o.doorWidth, window: o.windowWidth, opening: o.openingWidth }[this.name] || 0.9;
  }

  stairFits(stair, H) {
    const floor = this.v.activeFloorData;
    const L = stairLayout(stair, H);
    const regions = footprint(floor).map((p) => p[0].slice(0, -1));
    const pts = L.rects.flat().map((q) => toPlan(stair, q));
    if (!pts.every(([x, z]) => regions.some((r) => pointInPolygon(x, z, r)))) return false;
    return !floor.walls.some((w) => pts.some((q) => closestOnSegment(q, w.a, w.b).dist < w.thickness / 2 - 0.01));
  }

  onDblClick() {
    if (this.name === 'wall' && this.chain) this.finishChain();
  }

  finishChain() {
    this.chain = null;
    this.clearPreview();
  }

  onMove(e) {
    if (!this.name) return false;
    this.clearPreview();
    const at = this.point(e);
    if (!at) return true;
    const y = this.v.floorY;
    const o = this.options();
    const blue = new THREE.MeshBasicMaterial({ color: 0x2f6fed, transparent: true, opacity: 0.55, depthTest: false });
    // Cursor dot
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 20), new THREE.MeshBasicMaterial({ color: 0x2f6fed, depthTest: false }));
    dot.position.set(at[0], y + 0.02, at[1]);
    dot.renderOrder = 30;
    this.preview.add(dot);
    if (this.name === 'wall' && this.chain) {
      const a = this.chain.last;
      const len = Math.hypot(at[0] - a[0], at[1] - a[1]);
      if (len > 0.01) {
        const h = Math.min(this.v.activeFloorData.height, 1.25);
        const box = new THREE.Mesh(new THREE.BoxGeometry(len, h, o.thickness), blue);
        box.position.set((a[0] + at[0]) / 2, y + h / 2, (a[1] + at[1]) / 2);
        box.rotation.y = -Math.atan2(at[1] - a[1], at[0] - a[0]);
        box.renderOrder = 29;
        this.preview.add(box);
        this.lenLabel.element.textContent = `${Math.round(len * 100)} cm`;
        this.lenLabel.position.set((a[0] + at[0]) / 2, y + h + 0.2, (a[1] + at[1]) / 2);
        this.lenLabel.visible = true;
      }
    } else if (['door', 'window', 'opening'].includes(this.name)) {
      const w = this.v.nearestWall(at, 0.6);
      if (w) {
        const { len, dir } = wallFrame(w);
        const width = Math.min(this.openingWidth(), len - 0.2);
        const c = closestOnSegment(at, w.a, w.b);
        const u = Math.max(0.1 + width / 2, Math.min(len - width / 2 - 0.1, c.t * len));
        const hgt = this.name === 'window' ? 1.3 : 2.1;
        const box = new THREE.Mesh(new THREE.BoxGeometry(width, hgt, w.thickness + 0.06), blue);
        box.position.set(w.a[0] + dir[0] * u, y + (this.name === 'window' ? 0.9 : 0) + hgt / 2, w.a[1] + dir[1] * u);
        box.rotation.y = -Math.atan2(dir[1], dir[0]);
        box.renderOrder = 29;
        this.preview.add(box);
      }
    } else if (this.name === 'stairs') {
      const d = this.v.design;
      const fi = this.v.activeFloor;
      if (fi < d.floors.length - 1) {
        const ys = elevations(d);
        const H = ys[fi + 1] - ys[fi];
        const L = stairLayout({ shape: o.stairShape, turn: o.stairTurn }, H);
        const fits = [0, 90, 180, 270].some((r) => this.stairFits({ shape: o.stairShape, turn: o.stairTurn, x: at[0], z: at[1], rot: r }, H));
        if (!fits) blue.color.set(0xd14343);
        for (const r of L.rects) {
          const shape = new THREE.Shape(r.map(([x, z]) => new THREE.Vector2(x + at[0], -(z + at[1]))));
          const g = new THREE.ShapeGeometry(shape);
          g.rotateX(-Math.PI / 2);
          const m = new THREE.Mesh(g, blue);
          m.position.y = y + 0.02;
          m.renderOrder = 29;
          this.preview.add(m);
        }
      }
    }
    return true;
  }
}
