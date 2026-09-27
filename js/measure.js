// Measure tool: works in 3D and Plan, in any mode.
//   distance  two clicks: straight 3D distance between two points on any surface
//   path      click point after point along a curve; double-click or Enter to finish
//   surface   two clicks: the length along the surface between them (follows curves and steps)
// Points snap to wall corners (Alt: off). Shift locks a distance to one axis.
// Measurements stay on screen until cleared.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const BLUE = 0x2f6fed;
const fmt = (m) => (m < 1 ? `${(m * 100).toFixed(1)} cm` : `${m.toFixed(3)} m`);

export class Measure {
  constructor(viewer, { onResult } = {}) {
    this.v = viewer;
    this.onResult = onResult || (() => {});
    this.mode = 'distance';
    this.group = new THREE.Group();
    this.group.userData.helper = true;
    this.group.renderOrder = 40;
    viewer.scene.add(this.group);
    this.live = new THREE.Group();
    this.group.add(this.live);
    this.points = [];
    this.results = [];
  }

  get active() {
    return this.v.tool === this;
  }

  set(on) {
    if (on) {
      this.v.tool = this;
      this.v.renderer.domElement.style.cursor = 'crosshair';
      this.v.select(null);
    } else if (this.active) {
      this.v.tool = null;
      this.v.renderer.domElement.style.cursor = '';
    }
    this.points = [];
    this.live.clear();
  }

  setMode(m) {
    this.mode = m;
    this.points = [];
    this.live.clear();
  }

  clear() {
    this.group.clear();
    this.group.add(this.live);
    this.live.clear();
    this.points = [];
    this.results = [];
  }

  /** The surface point under the pointer (house, furniture or the floor plane). */
  hit(e) {
    this.v.setPointer(e);
    const hits = this.v.raycaster.intersectObjects([this.v.houseGroup], true);
    let p = null;
    for (const h of hits) {
      if (!visible(h.object) || h.object.userData.helper) continue;
      const planes = h.object.material?.clippingPlanes;
      if (planes?.length && planes.some((pl) => pl.distanceToPoint(h.point) < 0)) continue; // cut away
      p = h.point.clone();
      break;
    }
    p ||= this.v.planePoint();
    if (!p) return null;
    // Snap to wall corners of the active floor (in plan position), unless Alt
    if (!e.altKey) {
      const f = this.v.activeFloorData;
      for (const w of f?.walls || [])
        for (const q of [w.a, w.b])
          if (Math.hypot(q[0] - p.x, q[1] - p.z) < 0.12) {
            p.x = q[0];
            p.z = q[1];
          }
    }
    // Shift: lock to the main axis from the previous point
    const prev = this.points.at(-1);
    if (e.shiftKey && prev) {
      const d = p.clone().sub(prev);
      const ax = ['x', 'y', 'z'].reduce((a, k) => (Math.abs(d[k]) > Math.abs(d[a]) ? k : a), 'x');
      for (const k of ['x', 'y', 'z']) if (k !== ax) p[k] = prev[k];
    }
    return p;
  }

  onDown(e) {
    if (e.button !== 0) return false;
    this.downAt = { x: e.clientX, y: e.clientY };
    return false; // let the camera move; a click (no drag) adds a point in onUp
  }

  onUp(e) {
    if (!this.downAt || Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) return (this.downAt = null), false;
    this.downAt = null;
    const p = this.hit(e);
    if (!p) return true;
    this.points.push(p);
    if (this.mode !== 'path' && this.points.length === 2) this.finish();
    else this.preview(p);
    return true;
  }

  onMove(e) {
    this.v.renderer.domElement.style.cursor = 'crosshair';
    if (!this.points.length) return true;
    const p = this.hit(e);
    if (p) this.preview(p);
    return true;
  }

  onDblClick() {
    if (this.mode === 'path' && this.points.length >= 2) this.finish();
    return true;
  }

  /** Enter finishes a path; Escape drops the measurement in progress. Returns true if handled. */
  key(k) {
    if (k === 'enter' && this.mode === 'path' && this.points.length >= 2) return this.finish(), true;
    if (k === 'escape' && this.points.length) return (this.points = []), this.live.clear(), true;
    return false;
  }

  /** Points along the surface between a and b (as seen from the camera), for "along surface". */
  surfacePath(a, b, n = 96) {
    const cam = this.v.camera;
    const A = a.clone().project(cam), B = b.clone().project(cam);
    const ray = new THREE.Raycaster();
    const out = [a.clone()];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ray.setFromCamera(new THREE.Vector2(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t), cam);
      const h = ray.intersectObjects([this.v.houseGroup], true).find((x) => visible(x.object) && !x.object.userData.helper && !(x.object.material?.clippingPlanes || []).some((pl) => pl.distanceToPoint(x.point) < 0));
      out.push(h ? h.point.clone() : a.clone().lerp(b, t));
    }
    out.push(b.clone());
    return out;
  }

  pathOf(pts) {
    if (this.mode === 'surface' && pts.length === 2) return this.surfacePath(pts[0], pts[1]);
    return pts;
  }

  preview(cursor) {
    this.live.clear();
    const pts = [...this.points];
    if (cursor && pts.at(-1) !== cursor) pts.push(cursor);
    if (pts.length < 2) return this.live.add(dot(pts[0]));
    this.draw(this.live, this.pathOf(pts), pts, true);
  }

  finish() {
    const pts = this.points;
    this.points = [];
    this.live.clear();
    const path = this.pathOf(pts);
    const g = new THREE.Group();
    const r = this.draw(g, path, pts, false);
    this.group.add(g);
    this.results.push(r);
    this.onResult(r);
  }

  draw(g, path, clicks, live) {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += path[i].distanceTo(path[i - 1]);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), new THREE.LineBasicMaterial({ color: BLUE, depthTest: false, transparent: true, opacity: live ? 0.7 : 1 }));
    line.renderOrder = 41;
    g.add(line, ...clicks.map(dot));
    const a = path[0], b = path.at(-1);
    const d = b.clone().sub(a);
    const mid = path[Math.floor(path.length / 2)].clone();
    if (path.length === 2) mid.copy(a).lerp(b, 0.5);
    const el = document.createElement('div');
    el.className = 'measure-label';
    el.innerHTML = `<b>${fmt(total)}</b>${this.mode === 'distance' ? `<span>↔ ${fmt(Math.hypot(d.x, d.z))} · ↕ ${fmt(Math.abs(d.y))}</span>` : this.mode === 'surface' ? '<span>along the surface</span>' : `<span>${clicks.length - 1} segments</span>`}`;
    const l = new CSS2DObject(el);
    l.position.copy(mid);
    l.center.set(0.5, 1.3);
    g.add(l);
    return { mode: this.mode, length: total, dx: d.x, dy: d.y, dz: d.z, straight: a.distanceTo(b) };
  }
}

function dot(p) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: BLUE, depthTest: false }));
  m.position.copy(p);
  m.renderOrder = 42;
  return m;
}

function visible(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}
