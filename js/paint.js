// Paint tool: apply a finish (paint, wallpaper, tiles, wood…) to one side of a wall or to a
// room's floor. "Whole room" paints every wall side facing into the clicked room.
// Alt+click picks up the finish under the pointer (eyedropper).
import * as THREE from 'three';
import { classifyWallFace, finishAt, paintSpan, sideBreaks } from './house.js';
import { pointInPolygon, wallFrame, closestOnSegment } from './design.js';

const FLOOR_KINDS = { wood: 'wood', tiles: 'tiles', carpet: 'carpet', concrete: 'concrete', stone: 'tiles', paint: 'concrete', brick: 'tiles', wallpaper: 'carpet' };

export class Paint {
  constructor(viewer, { edit, picked, hover }) {
    this.v = viewer;
    this.edit = edit; // (fn(floor)) → apply + commit
    this.picked = picked; // (finish) → eyedropper result
    this.hover = hover; // (text) → status bar
    this.finish = { kind: 'paint', color: '#e9e2d4' };
    this.scope = 'surface'; // 'surface' | 'room'
  }

  get active() {
    return this.v.tool === this;
  }

  set(on) {
    if (on) {
      this.v.tool = this;
      this.v.renderer.domElement.style.cursor = 'crosshair';
      this.v.select(null);
    } else if (this.active) this.v.tool = null;
  }

  /** What's under the pointer: { kind: 'wall', wall, side, point } | { kind: 'floor', room } | null */
  target(e) {
    this.v.setPointer(e);
    const hf = this.v.house?.floors[this.v.activeFloor];
    if (!hf) return null;
    const f = this.v.activeFloorData;
    for (const h of this.v.raycaster.intersectObjects([hf.group], true)) {
      const o = h.object;
      if (!visible(o) || o.userData.helper) continue;
      const planes = [].concat(o.material)[0]?.clippingPlanes;
      if (planes?.length && planes.some((pl) => pl.distanceToPoint(h.point) < 0)) continue;
      if (inside(o, hf.furniture)) return null; // furniture is in the way
      if (o === hf.wallMesh) {
        const n = h.face.normal.clone().transformDirection(o.matrixWorld);
        const c = classifyWallFace(f, h.point, n);
        return c ? { kind: 'wall', wall: c.wall, side: c.side, u: c.u, point: h.point } : null;
      }
      if (o.userData.room && !o.userData.ceiling) return { kind: 'floor', room: f.rooms.find((r) => r.id === o.userData.room) };
      return null;
    }
    return null;
  }

  /**
   * The stretches of wall sides that face into a room: [{ wall, side, from, to }] (u along the wall).
   * Found from the room outline: each outline edge lies on one wall's face.
   */
  roomSides(room) {
    const f = this.v.activeFloorData;
    const out = [];
    const pts = room.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      let best = null;
      for (const w of f.walls) {
        const { dir, normal } = wallFrame(w);
        const d = (m) => (m[0] - w.a[0]) * normal[0] + (m[1] - w.a[1]) * normal[1];
        const err = Math.abs(Math.abs(d(mid)) - w.thickness / 2);
        const parallel = Math.abs(((q[0] - p[0]) * dir[0] + (q[1] - p[1]) * dir[1]) / (Math.hypot(q[0] - p[0], q[1] - p[1]) || 1));
        if (err > 0.03 || parallel < 0.99) continue;
        const u = (m) => (m[0] - w.a[0]) * dir[0] + (m[1] - w.a[1]) * dir[1];
        const { len } = wallFrame(w);
        if (u(mid) < -w.thickness || u(mid) > len + w.thickness) continue;
        if (!best || err < best.err) best = { wall: w, side: d(mid) > 0 ? 'l' : 'r', from: Math.min(u(p), u(q)), to: Math.max(u(p), u(q)), err };
      }
      if (best) out.push(best);
    }
    return out;
  }

  /** The stretch of a wall side between the junctions around `u`. */
  surfaceSpan(wall, side, u) {
    const b = sideBreaks(this.v.activeFloorData, wall, side);
    let from = b[0], to = b.at(-1);
    for (const x of b) {
      if (x <= u) from = x;
      if (x > u) {
        to = x;
        break;
      }
    }
    return { from, to };
  }

  roomAt(point) {
    return this.v.activeFloorData.rooms.find((r) => pointInPolygon(point.x, point.z, r.points));
  }

  onDown() {
    return false;
  }

  onMove(e) {
    this.v.renderer.domElement.style.cursor = 'crosshair';
    const t = this.target(e);
    const name = { paint: 'paint', wallpaper: 'wallpaper', tiles: 'tiles', wood: 'wood', brick: 'brick', stone: 'stone', concrete: 'concrete', carpet: 'carpet' }[this.finish.kind];
    this.hover(!t ? 'Click a wall or a floor to apply the finish · Alt+click to pick one up' : t.kind === 'wall' ? (this.scope === 'room' ? `Click to put ${name} on every wall of this room` : `Click to put ${name} on this side of the wall`) : `Click to put ${name} on the ${t.room?.name || 'room'} floor`);
    return true;
  }

  onUp(e) {
    const t = this.target(e);
    if (!t) return true;
    if (e.altKey) {
      // Eyedropper
      const at = t.kind === 'wall' && finishAt(t.wall, t.side, t.u);
      const fin = t.kind === 'wall' ? (at ? { kind: at.kind, color: at.color } : { kind: 'paint', color: this.v.design.wallColor || '#efebe4' }) : { kind: t.room?.floorKind || 'wood', color: t.room?.floorColor || '#c49a6c' };
      this.finish = { ...fin };
      this.picked(this.finish);
      return true;
    }
    const fin = { ...this.finish };
    this.edit((f) => {
      if (t.kind === 'floor' && t.room) {
        const r = f.rooms.find((x) => x.id === t.room.id);
        r.floorKind = FLOOR_KINDS[fin.kind] || 'wood';
        r.floorColor = fin.color;
        return;
      }
      const one = { wall: t.wall, side: t.side, ...this.surfaceSpan(t.wall, t.side, t.u) };
      const sides = this.scope === 'room' ? (() => {
        // The room on the clicked side of the wall
        const { normal } = wallFrame(t.wall);
        const s = t.side === 'l' ? 1 : -1;
        const probe = new THREE.Vector3(t.point.x + normal[0] * s * 0.2, 0, t.point.z + normal[1] * s * 0.2);
        const room = this.roomAt(probe);
        return room ? this.roomSides(room) : [one];
      })() : [one];
      for (const { wall, side, from, to } of sides) {
        const w = f.walls.find((x) => x.id === wall.id);
        paintSpan(w, side, { from, to, ...fin });
      }
    });
    return true;
  }
}

function visible(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}
function inside(o, a) {
  for (; o; o = o.parent) if (o === a) return true;
  return false;
}
