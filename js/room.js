// Room geometry from a polygon: floor, walls (with door/window openings),
// skirting, and helpers for polygon maths.
import * as THREE from 'three';
import { floorMaterial, makeMaterial, textures } from './materials.js';

export const WALL_T = 0.12;

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export function centroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) (x += p[0]), (z += p[1]);
  return [x / pts.length, z / pts.length];
}

export function bounds(pts) {
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Closest point on segment a→b to p, plus t along it. */
export function closestOnSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  const q = [a[0] + dx * t, a[1] + dz * t];
  return { q, t, dist: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

/** Per-wall info: start, end, length, unit direction, inward normal. */
export function walls(pts) {
  const ccw = signedArea(pts) > 0; // in x/z with z down-screen
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // Rotate dir by ±90° to get the inward normal.
    const inward = ccw ? [-dir[1], dir[0]] : [dir[1], -dir[0]];
    return { i, a, b, len, dir, inward };
  });
}

export function nearestWall(x, z, pts) {
  let best = null;
  for (const w of walls(pts)) {
    const c = closestOnSegment([x, z], w.a, w.b);
    if (!best || c.dist < best.dist) best = { ...w, ...c };
  }
  return best;
}

function wallMesh(w, height, openings, mat) {
  // Build the wall face in wall space: u along wall (0..len), v up (0..height).
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w.len, 0);
  shape.lineTo(w.len, height);
  shape.lineTo(0, height);
  shape.lineTo(0, 0);
  const valid = [];
  for (const o of openings) {
    const u0 = Math.max(0.02, o.offset);
    const u1 = Math.min(w.len - 0.02, o.offset + o.width);
    const v0 = o.type === 'door' ? 0 : Math.max(0.02, o.sill);
    const v1 = Math.min(height - 0.02, v0 + o.height);
    if (u1 - u0 < 0.05 || v1 - v0 < 0.05) continue;
    valid.push({ ...o, u0, u1, v0, v1 });
    if (o.type === 'door') {
      // Door openings touch the floor, so notch the outline instead of adding a hole.
      continue;
    }
    const hole = new THREE.Path();
    hole.moveTo(u0, v0);
    hole.lineTo(u0, v1);
    hole.lineTo(u1, v1);
    hole.lineTo(u1, v0);
    hole.lineTo(u0, v0);
    shape.holes.push(hole);
  }
  // Rebuild outline with door notches (sorted by position).
  const doors = valid.filter((o) => o.type === 'door').sort((a, b) => a.u0 - b.u0);
  if (doors.length) {
    const s2 = new THREE.Shape();
    s2.moveTo(0, 0);
    for (const dd of doors) {
      s2.lineTo(dd.u0, 0);
      s2.lineTo(dd.u0, dd.v1);
      s2.lineTo(dd.u1, dd.v1);
      s2.lineTo(dd.u1, 0);
    }
    s2.lineTo(w.len, 0);
    s2.lineTo(w.len, height);
    s2.lineTo(0, height);
    s2.lineTo(0, 0);
    s2.holes = shape.holes;
    shape.curves = s2.curves;
    shape.currentPoint = s2.currentPoint;
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false });
  // Wall space → world: u along dir, v up, extrude toward the outside (−inward).
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(w.dir[0], 0, w.dir[1]),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-w.inward[0], 0, -w.inward[1])
  );
  m.setPosition(w.a[0], 0, w.a[1]);
  geo.applyMatrix4(m);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, openings: valid };
}

function openingDressing(w, o, group) {
  const toWorld = (u, v, n = 0) =>
    new THREE.Vector3(w.a[0] + w.dir[0] * u - w.inward[0] * n, v, w.a[1] + w.dir[1] * u - w.inward[1] * n);
  const angle = Math.atan2(-w.dir[1], w.dir[0]);
  const frameMat = makeMaterial('#f4f3ef', { kind: 'plastic' });
  const cu = (o.u0 + o.u1) / 2;
  const width = o.u1 - o.u0;
  const height = o.v1 - o.v0;
  const addBox = (sx, sy, sz, u, v, n, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.copy(toWorld(u, v, n));
    m.rotation.y = angle;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const f = 0.05;
  // Frame (jambs + head, and sill for windows)
  addBox(f, height, WALL_T + 0.02, o.u0 + f / 2, o.v0 + height / 2, WALL_T / 2, frameMat);
  addBox(f, height, WALL_T + 0.02, o.u1 - f / 2, o.v0 + height / 2, WALL_T / 2, frameMat);
  addBox(width, f, WALL_T + 0.02, cu, o.v1 - f / 2, WALL_T / 2, frameMat);
  if (o.type === 'window') {
    addBox(width + 0.06, 0.03, WALL_T + 0.08, cu, o.v0 - 0.015, WALL_T / 2 - 0.02, frameMat);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6f0, transmission: 0.9, roughness: 0.02, transparent: true, opacity: 0.25 });
    const g = addBox(width - 2 * f, height - 2 * f, 0.01, cu, o.v0 + height / 2, WALL_T / 2, glass);
    g.castShadow = false;
    if (width > 0.8) addBox(0.04, height - 2 * f, 0.05, cu, o.v0 + height / 2, WALL_T / 2, frameMat);
  } else {
    const doorMat = makeMaterial(o.color || '#e9e4da', { kind: 'plastic' });
    const leafW = width - 2 * f;
    const openAngle = o.open ? Math.PI / 3 : 0;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, height - f, 0.04), doorMat);
    leaf.castShadow = leaf.receiveShadow = true;
    // Hinged at u0, swinging into the room.
    const pivot = new THREE.Group();
    pivot.position.copy(toWorld(o.u0 + f, 0, 0.02));
    pivot.rotation.y = angle - openAngle;
    leaf.position.set(leafW / 2, (height - f) / 2, 0);
    pivot.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), makeMaterial('#b5954a', { kind: 'metal' }));
    knob.position.set(leafW - 0.08, 1.0, 0.04);
    pivot.add(knob);
    group.add(pivot);
  }
}

/**
 * Build the whole room. Returns { group, wallMeshes: [{mesh, wall}], floor }.
 */
export function buildRoom(room) {
  const group = new THREE.Group();
  const pts = room.points;
  const height = room.height || 2.6;

  // Floor
  const fshape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const fgeo = new THREE.ShapeGeometry(fshape);
  fgeo.rotateX(-Math.PI / 2);
  // UVs in metres so plank texture has real scale (~1.6 m per texture tile).
  const uv = fgeo.attributes.uv;
  const pos = fgeo.attributes.position;
  const tile = room.floorKind === 'tiles' ? 1.2 : room.floorKind === 'carpet' ? 1 : 1.8;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  const floor = new THREE.Mesh(fgeo, floorMaterial(room.floorColor || '#b89468', room.floorKind || 'wood'));
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: room.wallColor || '#efece6', roughness: 0.95, map: textures.plaster() });
  const skirtMat = makeMaterial('#f7f6f2', { kind: 'plastic' });
  const wallMeshes = [];
  const ws = walls(pts);
  for (const w of ws) {
    const ops = (room.openings || []).filter((o) => o.wall === w.i);
    const { mesh, openings } = wallMesh(w, height, ops, wallMat.clone());
    mesh.userData.wall = w;
    const wg = new THREE.Group();
    wg.add(mesh);
    // Skirting board, split around doors
    const segs = [];
    let u = 0;
    for (const o of openings.filter((o) => o.type === 'door').sort((a, b) => a.u0 - b.u0)) {
      segs.push([u, o.u0]);
      u = o.u1;
    }
    segs.push([u, w.len]);
    for (const [u0, u1] of segs) {
      if (u1 - u0 < 0.02) continue;
      const sk = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, 0.08, 0.015), skirtMat);
      const cu = (u0 + u1) / 2;
      sk.position.set(w.a[0] + w.dir[0] * cu + w.inward[0] * 0.0075, 0.04, w.a[1] + w.dir[1] * cu + w.inward[1] * 0.0075);
      sk.rotation.y = Math.atan2(-w.dir[1], w.dir[0]);
      sk.receiveShadow = true;
      wg.add(sk);
    }
    for (const o of openings) openingDressing(w, o, wg);
    wg.userData.wall = w;
    group.add(wg);
    wallMeshes.push({ group: wg, mesh, wall: w });
  }
  return { group, wallMeshes, floor };
}

export const ROOM_PRESETS = {
  rectangle: (W = 4, D = 3.5) => [[0, 0], [W, 0], [W, D], [0, D]],
  'L-shape': (W = 5, D = 4.5) => [[0, 0], [W, 0], [W, D * 0.5], [W * 0.5, D * 0.5], [W * 0.5, D], [0, D]],
  'T-shape': (W = 6, D = 4.5) => [[0, 0], [W, 0], [W, D * 0.45], [W * 0.68, D * 0.45], [W * 0.68, D], [W * 0.32, D], [W * 0.32, D * 0.45], [0, D * 0.45]],
  'U-shape': (W = 6, D = 4.5) => [[0, 0], [W * 0.33, 0], [W * 0.33, D * 0.5], [W * 0.67, D * 0.5], [W * 0.67, 0], [W, 0], [W, D], [0, D]],
  'Studio + nook': (W = 6, D = 4) => [[0, 0], [W, 0], [W, D], [W * 0.35, D], [W * 0.35, D + 1.4], [0, D + 1.4]],
};
