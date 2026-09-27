// First-person walk-through: mouse-look (pointer lock, or drag on touch),
// W A S D / arrows to move, Shift to hurry. Collides with walls, railings and
// furniture; stands on floors, landings and stair treads found by BVH raycasts,
// rising step by step at a human pace when climbing stairs.
import * as THREE from 'three';

const EYE = 1.62; // eye height above the floor
const RADIUS = 0.24; // body radius
const MAX_STEP = 0.45; // highest ledge you can step onto
const WALK = 1.5; // m/s
const RUN = 3.0;
const CLIMB = 1.6; // vertical m/s when stepping up (smooth, not a teleport)

export class Walker {
  constructor(viewer, { onFloor } = {}) {
    this.v = viewer;
    this.onFloor = onFloor;
    this.active = false;
    this.yaw = 0;
    this.pitch = 0;
    this.feet = new THREE.Vector3();
    this.vy = 0;
    this.keys = new Set();
    this.touchMove = [0, 0];
    this.eyeY = 0;
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;
    this.down = new THREE.Vector3(0, -1, 0);
    const el = viewer.renderer.domElement;
    this.handlers = [
      [document, 'keydown', (e) => this.key(e, true)],
      [document, 'keyup', (e) => this.key(e, false)],
      [window, 'blur', () => this.keys.clear()],
      [document, 'mousemove', (e) => this.onMouse(e)],
      [el, 'pointerdown', (e) => this.onDown(e)],
      [window, 'pointermove', (e) => this.onDrag(e)],
      [window, 'pointerup', () => (this.dragging = null)],
      [el, 'wheel', (e) => this.active && (e.preventDefault(), this.step(-Math.sign(e.deltaY) * 0.35, 0)), { passive: false }],
      [document, 'pointerlockchange', () => this.v.cb.onPointerLock?.(document.pointerLockElement === el)],
    ];
    for (const [t, n, f, o] of this.handlers) t.addEventListener(n, f, o);
    this.tick = (dt) => this.update(dt);
  }

  dispose() {
    this.stop();
    for (const [t, n, f, o] of this.handlers) t.removeEventListener(n, f, o);
  }

  /** Start walking on `floorIndex`, at `at` [x,z] (default: middle of the largest room). */
  start(floorIndex = this.v.activeFloor, at) {
    const v = this.v;
    const design = v.design;
    const floor = design.floors[floorIndex];
    const y0 = v.house.elevations[floorIndex];
    let p = at;
    if (!p) {
      const room = [...(floor.rooms || [])].sort((a, b) => polyArea(b.points) - polyArea(a.points))[0];
      const pts = room?.points || floor.walls.flatMap((w) => [w.a, w.b]);
      p = pts.length ? [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length] : [0, 0];
      p = this.freeSpot(p, floorIndex, y0);
    }
    this.feet.set(p[0], y0, p[1]);
    this.eyeY = y0 + EYE;
    this.vy = 0;
    // Face the house centre.
    const c = v.bounds?.getCenter(new THREE.Vector3()) || new THREE.Vector3();
    this.yaw = Math.atan2(-(c.x - p[0]), -(c.z - p[1])) || 0;
    this.pitch = -0.05;
    this.active = true;
    v.frameHooks.add(this.tick);
    this.apply();
  }

  stop() {
    this.active = false;
    this.v.frameHooks.delete(this.tick);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Nudge a start point out of furniture. */
  freeSpot(p, fi, y0) {
    for (let r = 0; r < 3; r += 0.25)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const q = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];
        if (!this.blocked(q, fi, y0)) return q;
        if (r === 0) break;
      }
    return p;
  }

  blocked(q, fi, y0) {
    for (const s of this.colliders(fi, y0)) {
      if (segDist(q, s.a, s.b) < RADIUS) return true;
    }
    return false;
  }

  key(e, down) {
    if (!this.active || /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      e.preventDefault();
      down ? this.keys.add(k) : this.keys.delete(k);
    }
  }

  onDown(e) {
    if (!this.active) return;
    if (e.pointerType === 'mouse' && e.button === 0 && !document.pointerLockElement) {
      this.v.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
    }
    if (e.pointerType !== 'mouse') this.dragging = { x: e.clientX, y: e.clientY };
  }

  onMouse(e) {
    if (!this.active || document.pointerLockElement !== this.v.renderer.domElement) return;
    this.look(e.movementX, e.movementY);
  }

  onDrag(e) {
    if (!this.active || !this.dragging) return;
    this.look((e.clientX - this.dragging.x) * 1.5, (e.clientY - this.dragging.y) * 1.5);
    this.dragging = { x: e.clientX, y: e.clientY };
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0025;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy * 0.0025));
  }

  /** Walk-mode UI buttons (touch): forward/back, strafe. */
  setMove(forward, strafe) {
    this.touchMove = [forward, strafe];
  }

  colliders(fi, feetY) {
    const v = this.v;
    const out = [];
    const hf = v.house.floors[fi];
    if (!hf) return out;
    for (const c of hf.colliders) if (feetY + 0.3 < c.y1 && feetY + 1.6 > c.y0) out.push(c);
    // Stairs of the floor below reach up into this level.
    const below = v.house.floors[fi - 1];
    if (below) for (const c of below.colliders) if (c.y1 > feetY + 0.3 && c.y0 < feetY + 1.6 && c.y1 - c.y0 < 5) out.push(c);
    // Furniture on this floor (not rugs, not things sitting on other things)
    for (const rec of v.items.values()) {
      if (rec.floorIndex !== fi || rec.item.category === 'rug' || rec.item.category === 'curtain' || (rec.placed.y || 0) > 0.3) continue;
      const { w, d } = rec.dims;
      const a = rec.group.rotation.y;
      const ax = [Math.cos(a), -Math.sin(a)], az = [Math.sin(a), Math.cos(a)];
      const c = [rec.placed.x, rec.placed.z];
      const corner = (sx, sz) => [c[0] + ax[0] * sx * w / 2 + az[0] * sz * d / 2, c[1] + ax[1] * sx * w / 2 + az[1] * sz * d / 2];
      const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      for (let i = 0; i < 4; i++) out.push({ a: pts[i], b: pts[(i + 1) % 4] });
    }
    return out;
  }

  currentFloor() {
    const ys = this.v.house.elevations;
    let fi = 0;
    for (let i = 0; i < ys.length; i++) if (this.feet.y >= ys[i] - 0.3) fi = i;
    return fi;
  }

  /** Highest walkable surface under (x, z) that we can reach from the current height. */
  groundAt(x, z) {
    const meshes = [this.v.ground];
    for (const f of this.v.house.floors) meshes.push(...f.walkables);
    this.ray.set(new THREE.Vector3(x, this.feet.y + MAX_STEP, z), this.down);
    this.ray.far = 50;
    let best = null;
    for (const h of this.ray.intersectObjects(meshes, false)) if (best === null || h.point.y > best) best = h.point.y;
    return best;
  }

  step(forward, strafe) {
    const fwd = [-Math.sin(this.yaw), -Math.cos(this.yaw)];
    const right = [-fwd[1], fwd[0]];
    this.tryMove(fwd[0] * forward + right[0] * strafe, fwd[1] * forward + right[1] * strafe);
  }

  tryMove(dx, dz) {
    const fi = this.currentFloor();
    const cols = this.colliders(fi, this.feet.y);
    // Sub-steps so fast moves can't tunnel through thin walls.
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
    let p = [this.feet.x, this.feet.z];
    for (let s = 0; s < n; s++) {
      let q = [p[0] + dx / n, p[1] + dz / n];
      for (let iter = 0; iter < 3; iter++) {
        for (const c of cols) {
          const cp = closest(q, c.a, c.b);
          const d = Math.hypot(q[0] - cp[0], q[1] - cp[1]);
          if (d < RADIUS && d > 1e-6) q = [cp[0] + ((q[0] - cp[0]) / d) * RADIUS, cp[1] + ((q[1] - cp[1]) / d) * RADIUS];
        }
      }
      // Don't walk up a ledge taller than a step, or off an edge higher than a step down.
      const g = this.groundAt(q[0], q[1]);
      if (g !== null && (g - this.feet.y > MAX_STEP || this.feet.y - g > MAX_STEP + 0.1)) break;
      p = q;
    }
    this.feet.x = p[0];
    this.feet.z = p[1];
  }

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + this.touchMove[0];
    const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.touchMove[1];
    if (f || s) {
      const speed = (k.has('shift') ? RUN : WALK) * dt;
      const L = Math.hypot(f, s);
      this.step((f / L) * speed, (s / L) * speed);
    }
    // Stand on the surface below: rise at a steady climbing pace, fall with gravity.
    const g = this.groundAt(this.feet.x, this.feet.z);
    if (g !== null) {
      if (g > this.feet.y) {
        this.feet.y = Math.min(g, this.feet.y + CLIMB * dt);
        this.vy = 0;
      } else if (g < this.feet.y - 0.002) {
        this.vy += 9.8 * dt;
        this.feet.y = Math.max(g, this.feet.y - this.vy * dt);
      } else this.vy = 0;
    }
    // Eye follows the feet with a little easing, like a real step.
    const targetEye = this.feet.y + EYE;
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * 10);
    const fi = this.currentFloor();
    if (fi !== this.lastFloor) {
      this.lastFloor = fi;
      this.onFloor?.(fi);
    }
    this.apply();
  }

  apply() {
    const cam = this.v.persp;
    cam.position.set(this.feet.x, this.eyeY, this.feet.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }
}

function closest(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return [a[0] + dx * t, a[1] + dz * t];
}

function segDist(p, a, b) {
  const q = closest(p, a, b);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1];
  return Math.abs(s / 2);
}
