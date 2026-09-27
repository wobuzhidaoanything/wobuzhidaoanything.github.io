// Builds three.js geometry for a multi-floor house design (see design.js).
// Walls: 2D union of wall footprints (clean corners), extruded, then doors and
// windows cut out with CSG, giving watertight meshes that export cleanly to Blender.
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { elevations, wallFrame, stairLayout, stairwellPolygon, toPlan, closestOnSegment } from './design.js';
import { floorMaterial, makeMaterial, textures } from './materials.js';
import { ring, openRing, wallUnion, footprint, detectRooms, polygonClipping } from './plan.js';

export { wallUnion, footprint, detectRooms };

const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.attributes = ['position', 'normal', 'uv'];

// ---------- 2D helpers ----------

const flat = (g) => (g.index ? g.toNonIndexed() : g);

/** Shape in the XY plane from plan rings, flipped so that rotateX(-90°) lands on plan x/z. */
function shapeFromPolygon(poly) {
  const toV = (r) => openRing(r).map(([x, z]) => new THREE.Vector2(x, -z));
  const shape = new THREE.Shape(toV(poly[0]));
  for (const hole of poly.slice(1)) shape.holes.push(new THREE.Path(toV(hole)));
  return shape;
}

/** Extrude plan polygons (multipolygon) from y0 up to y1. */
function extrudePlan(multi, y0, y1) {
  const geos = multi.map((poly) => {
    const g = new THREE.ExtrudeGeometry(shapeFromPolygon(poly), { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    return g;
  });
  return geos.length ? mergeGeometries(geos.map(flat), false) : null;
}

/** Flat plan polygons at height y, UVs in metres / tile. */
function flatPlan(multi, y, tile = 1.8) {
  const geos = multi.map((poly) => {
    const g = new THREE.ShapeGeometry(shapeFromPolygon(poly));
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
    return g;
  });
  return geos.length ? mergeGeometries(geos.map(flat), false) : null;
}

/** World-space UVs for walls so plaster doesn't stretch. */
function boxUV(geo, scale = 1) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [u, v] = ny > 0.5 ? [x, z] : nx > 0.5 ? [z, y] : [x, y];
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ---------- openings (frames, glass, doors) ----------

function openingPlacement(floor, o) {
  const w = floor.walls.find((x) => x.id === o.wall);
  if (!w) return null;
  const { len, dir, normal } = wallFrame(w);
  const u0 = Math.max(0.02, o.offset);
  const u1 = Math.min(len - 0.02, o.offset + o.width);
  if (u1 - u0 < 0.1) return null;
  return { w, len, dir, normal, u0, u1, v0: o.type === 'window' ? o.sill : 0, v1: (o.type === 'window' ? o.sill : 0) + o.height };
}

function openingDressing(o, pl, y0, group) {
  const { w, dir, normal, u0, u1, v0, v1 } = pl;
  const angle = Math.atan2(-dir[1], dir[0]);
  const at = (u, v, n = 0) => new THREE.Vector3(w.a[0] + dir[0] * u + normal[0] * n, y0 + v, w.a[1] + dir[1] * u + normal[1] * n);
  const g = new THREE.Group();
  g.name = `${o.type === 'window' ? 'Window' : o.type === 'door' ? 'Door' : 'Opening'} ${o.id}`;
  g.userData.opening = o.id;
  if (o.type === 'opening') return group.add(g);
  const frameMat = makeMaterial('#f4f3ef', { kind: 'plastic' });
  const f = 0.05, depth = w.thickness + 0.02;
  const width = u1 - u0, height = v1 - v0, cu = (u0 + u1) / 2;
  const box = (sx, sy, sz, u, v, n, mat, name) => {
    const m = mesh(new THREE.BoxGeometry(sx, sy, sz), mat, name);
    m.position.copy(at(u, v, n));
    m.rotation.y = angle;
    g.add(m);
    return m;
  };
  box(f, height, depth, u0 + f / 2, v0 + height / 2, 0, frameMat, 'Jamb');
  box(f, height, depth, u1 - f / 2, v0 + height / 2, 0, frameMat, 'Jamb');
  box(width, f, depth, cu, v1 - f / 2, 0, frameMat, 'Head');
  if (o.type === 'window') {
    box(width + 0.06, 0.03, depth + 0.06, cu, v0 - 0.015, 0, frameMat, 'Sill');
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6f0, transmission: 0.9, roughness: 0.02, transparent: true, opacity: 0.25, name: 'Glass' });
    const pane = box(width - 2 * f, height - 2 * f, 0.012, cu, v0 + height / 2, 0, glass, 'Glass');
    pane.castShadow = false;
    if (width > 0.9) box(0.04, height - 2 * f, 0.05, cu, v0 + height / 2, 0, frameMat, 'Mullion');
  } else {
    const leafW = width - 2 * f;
    const doorMat = makeMaterial(o.color || '#e9e4da', { kind: 'plastic' });
    doorMat.name = 'Door';
    const pivot = new THREE.Group();
    pivot.name = 'Door leaf';
    // Hinge at the wall's start side (default) or end side; swing toward the wall's normal side
    // (default) or away from it.
    const atEnd = o.hinge === 'end';
    pivot.position.copy(at(atEnd ? u1 - f : u0 + f, 0, 0));
    const base = angle + (atEnd ? Math.PI : 0);
    const sw = (o.swing === 'out' ? -1 : 1) * (atEnd ? -1 : 1);
    pivot.rotation.y = base + (o.open ? sw * Math.PI / 2.4 : 0);
    // Plan symbol: the leaf fully open and its swing arc (shown in plan view only).
    const arcPts = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * (Math.PI / 2) * sw;
      arcPts.push(new THREE.Vector3(Math.cos(t) * leafW, 0, -Math.sin(t) * leafW));
    }
    arcPts.push(new THREE.Vector3(0, 0, 0));
    const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), new THREE.LineBasicMaterial({ color: 0x5b6068 }));
    arc.position.copy(pivot.position).setY(y0 + 0.02);
    arc.rotation.y = base;
    arc.userData.planOnly = true;
    arc.userData.helper = true;
    arc.visible = false;
    g.add(arc);
    const leaf = mesh(new THREE.BoxGeometry(leafW, height - f, 0.04), doorMat, 'Leaf');
    leaf.position.set(leafW / 2, (height - f) / 2, 0);
    pivot.add(leaf);
    const knob = mesh(new THREE.SphereGeometry(0.028, 12, 8), makeMaterial('#b5954a', { kind: 'metal' }), 'Handle');
    knob.position.set(leafW - 0.08, 1.0, 0.04 * sw);
    pivot.add(knob);
    g.add(pivot);
  }
  group.add(g);
}

// ---------- stairs ----------

function railing(points, y0s, height, mat, name) {
  // Handrail + balusters along a polyline; y0s = floor height at each point.
  const g = new THREE.Group();
  g.name = name;
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(points[i][0], y0s[i] + height, points[i][1]);
    const b = new THREE.Vector3(points[i + 1][0], y0s[i + 1] + height, points[i + 1][1]);
    const len = a.distanceTo(b);
    const rail = mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 10), mat, 'Handrail');
    rail.position.copy(a).add(b).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(rail);
    const count = Math.max(1, Math.round(len / 0.12));
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const x = points[i][0] + (points[i + 1][0] - points[i][0]) * t;
      const z = points[i][1] + (points[i + 1][1] - points[i][1]) * t;
      const yb = y0s[i] + (y0s[i + 1] - y0s[i]) * t;
      const post = mesh(new THREE.BoxGeometry(0.02, height, 0.02), mat, 'Baluster');
      post.position.set(x, yb + height / 2, z);
      g.add(post);
    }
  }
  return g;
}

/** Stairs from floor `y0` rising `H`. Adds walkable meshes (treads/landings) to `walkables`. */
export function buildStairs(stair, y0, H, { walkables, colliders }) {
  const L = stairLayout(stair, H);
  const g = new THREE.Group();
  g.name = `Stairs ${stair.id}`;
  g.userData.stair = stair.id;
  const wood = makeMaterial(stair.color || '#a27b54', { kind: 'wood' });
  wood.name = 'Stair wood';
  const white = makeMaterial('#f2f1ec', { kind: 'plastic' });
  white.name = 'Stair riser';
  const metal = makeMaterial('#2b2b2b', { kind: 'metal' });
  metal.name = 'Railing';
  const W = L.width;
  const place = (m, lx, ly, lz, rotY = 0) => {
    const [px, pz] = toPlan(stair, [lx, lz]);
    m.position.set(px, y0 + ly, pz);
    m.rotation.y = ((stair.rot || 0) * Math.PI) / 180 + rotY;
  };
  const tread = 0.04;
  for (const f of L.flights) {
    const rotY = Math.atan2(f.dir[0], f.dir[1]) + Math.PI; // local frame of the flight
    for (let k = 0; k < f.count; k++) {
      const top = f.y0 + (k + 1) * L.riser;
      const c = [f.start[0] + f.dir[0] * (k + 0.5) * L.going, f.start[1] + f.dir[1] * (k + 0.5) * L.going];
      const t = mesh(new THREE.BoxGeometry(W, tread, L.going + 0.025), wood, `Tread ${k + 1}`);
      place(t, c[0], top - tread / 2, c[1], rotY);
      t.userData.walkable = true;
      walkables.push(t);
      g.add(t);
      // Closed riser below each tread
      const rs = mesh(new THREE.BoxGeometry(W, L.riser - tread, 0.018), white, `Riser ${k + 1}`);
      const e = [f.start[0] + f.dir[0] * k * L.going, f.start[1] + f.dir[1] * k * L.going];
      place(rs, e[0], f.y0 + k * L.riser + (L.riser - tread) / 2, e[1], rotY);
      g.add(rs);
    }
    // Stringers: sloped boards on both sides
    const run = f.count * L.going;
    const rise = f.count * L.riser;
    const slope = Math.hypot(run, rise);
    for (const side of [-1, 1]) {
      const perp = [-f.dir[1], f.dir[0]];
      const mid = [f.start[0] + f.dir[0] * run / 2 + perp[0] * side * (W / 2 + 0.02), f.start[1] + f.dir[1] * run / 2 + perp[1] * side * (W / 2 + 0.02)];
      const s = mesh(new THREE.BoxGeometry(0.04, 0.28, slope + 0.1), white, 'Stringer');
      place(s, mid[0], f.y0 + rise / 2 + 0.02, mid[1], rotY);
      s.rotateX(Math.atan2(rise, run));
      g.add(s);
      // Handrail on each side, following the pitch line
      const a = [f.start[0] + perp[0] * side * (W / 2), f.start[1] + perp[1] * side * (W / 2)];
      const b = [a[0] + f.dir[0] * run, a[1] + f.dir[1] * run];
      const pa = toPlan(stair, a), pb = toPlan(stair, b);
      g.add(railing([pa, pb], [y0 + f.y0 + L.riser, y0 + f.y0 + rise + L.riser], 0.9, metal, 'Stair railing'));
      colliders.push({ a: pa, b: pb, y0: y0 + f.y0, y1: y0 + f.y0 + rise + 1.2 });
    }
  }
  // Landings get railings on every edge except where they touch a flight or another landing.
  const inRect = (p, r) => {
    const xs = r.map((q) => q[0]), zs = r.map((q) => q[1]);
    return p[0] > Math.min(...xs) + 1e-3 && p[0] < Math.max(...xs) - 1e-3 && p[1] > Math.min(...zs) + 1e-3 && p[1] < Math.max(...zs) - 1e-3;
  };
  L.landings.forEach((l, li) => {
    const [cx, cz] = l.center, [sx, sz] = l.size;
    const corners = [[cx - sx / 2, cz - sz / 2], [cx + sx / 2, cz - sz / 2], [cx + sx / 2, cz + sz / 2], [cx - sx / 2, cz + sz / 2]];
    const self = L.rects[L.flights.length + li];
    const others = L.rects.filter((r) => r !== self);
    for (let k = 0; k < 4; k++) {
      const a = corners[k], b = corners[(k + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const out = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len]; // outward for this winding
      const steps = Math.max(2, Math.round(len / 0.05));
      let runStart = null;
      const flush = (t1) => {
        if (runStart === null) return;
        const t0 = runStart;
        runStart = null;
        if ((t1 - t0) * len < 0.12) return;
        const pa = toPlan(stair, [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
        const pb = toPlan(stair, [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]);
        g.add(railing([pa, pb], [y0 + l.y, y0 + l.y], 0.9, metal, 'Landing railing'));
        colliders.push({ a: pa, b: pb, y0: y0 + l.y - 0.3, y1: y0 + l.y + 1.2 });
      };
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const p = [a[0] + (b[0] - a[0]) * t + out[0] * 0.03, a[1] + (b[1] - a[1]) * t + out[1] * 0.03];
        const open = others.some((r) => inRect(p, r));
        if (!open && runStart === null) runStart = i / steps;
        if (open) flush(i / steps);
      }
      flush(1);
    }
  });
  for (const l of L.landings) {
    const m = mesh(new THREE.BoxGeometry(l.size[0], 0.12, l.size[1]), wood, 'Landing');
    place(m, l.center[0], l.y - 0.06, l.center[1]);
    m.userData.walkable = true;
    walkables.push(m);
    g.add(m);
    // Solid support under the landing
    const sup = mesh(new THREE.BoxGeometry(l.size[0], l.y - 0.12, l.size[1]), white, 'Landing support');
    place(sup, l.center[0], (l.y - 0.12) / 2, l.center[1]);
    g.add(sup);
  }
  g.userData.layout = L;
  return g;
}

// ---------- whole house ----------

/**
 * Build every floor. Returns { group, floors: [{ id, index, y0, group, walls, walkables,
 * colliders, footprint, wallMesh }] }. Object names form a clean hierarchy for export:
 * House › Floor › Slab / Walls / Rooms / Openings / Stairs / Furniture.
 */
export function buildHouse(design, { roof = false } = {}) {
  const ys = elevations(design);
  const root = new THREE.Group();
  root.name = design.name || 'House';
  const wallMat = new THREE.MeshStandardMaterial({ color: design.wallColor || '#efebe4', roughness: 0.95, map: textures.plaster(), name: 'Wall plaster' });
  const slabMat = new THREE.MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.9, map: textures.concrete(), name: 'Slab' });
  const floors = [];

  design.floors.forEach((floor, i) => {
    const y0 = ys[i];
    const fg = new THREE.Group();
    fg.name = floor.name;
    fg.userData.floorId = floor.id;
    const walkables = [];
    const colliders = [];

    // Stairwell holes: stairs on the floor below cut through this floor's slab and rooms.
    const holes = i > 0 ? design.floors[i - 1].stairs.map((s) => [ring(stairwellPolygon(s, y0 - ys[i - 1]))]) : [];
    const foot = footprint(floor);
    const slabPoly = holes.length && foot.length ? polygonClipping.difference(foot, ...holes) : foot;

    // Slab (under this floor's finished level)
    if (slabPoly.length) {
      const geo = boxUV(extrudePlan(slabPoly, y0 - floor.slab, y0 - 0.001), 2);
      const slab = mesh(geo, slabMat, 'Slab');
      slab.userData.walkable = true;
      walkables.push(slab);
      fg.add(slab);
    }

    // Room floors with finishes
    const roomsG = new THREE.Group();
    roomsG.name = 'Rooms';
    for (const r of floor.rooms) {
      const poly = holes.length ? polygonClipping.difference([ring(r.points)], ...holes) : [[ring(r.points)]];
      const kind = r.floorKind || 'wood';
      const geo = flatPlan(poly, y0 + 0.002, kind === 'tiles' ? 1.2 : kind === 'carpet' ? 1 : 1.8);
      if (!geo) continue;
      const m = mesh(geo, floorMaterial(r.floorColor || '#c49a6c', kind), r.name || 'Room', { cast: false });
      m.material.name = `${r.name || 'Room'} floor`;
      m.userData.room = r.id;
      m.userData.walkable = true;
      walkables.push(m);
      roomsG.add(m);
    }
    fg.add(roomsG);

    // Walls: union → extrude → subtract openings
    const union = wallUnion(floor);
    let wallMesh = null;
    const openingsG = new THREE.Group();
    openingsG.name = 'Openings';
    if (union.length) {
      let geo = extrudePlan(union, y0, y0 + floor.height);
      const cutters = [];
      for (const o of floor.openings) {
        const pl = openingPlacement(floor, o);
        if (!pl) continue;
        const width = pl.u1 - pl.u0, height = Math.min(pl.v1, floor.height - 0.02) - pl.v0;
        const c = new THREE.BoxGeometry(width, height, pl.w.thickness + 0.2);
        const m = new THREE.Matrix4().makeRotationY(Math.atan2(-pl.dir[1], pl.dir[0]));
        const cu = (pl.u0 + pl.u1) / 2;
        m.setPosition(pl.w.a[0] + pl.dir[0] * cu, y0 + pl.v0 + height / 2 + (o.type === 'window' ? 0 : -0.001), pl.w.a[1] + pl.dir[1] * cu);
        c.applyMatrix4(m);
        cutters.push(flat(c));
        openingDressing(o, pl, y0, openingsG);
      }
      if (cutters.length) {
        const a = new Brush(geo);
        const b = new Brush(mergeGeometries(cutters.map((c) => { c.deleteAttribute('uv'); c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2)); return c; })));
        a.updateMatrixWorld();
        b.updateMatrixWorld();
        geo = evaluator.evaluate(a, b, SUBTRACTION).geometry;
      }
      wallMesh = mesh(boxUV(geo, 1.5), wallMat, 'Walls');
      wallMesh.userData.floorId = floor.id;
      fg.add(wallMesh);
    }
    fg.add(openingsG);

    // 2D colliders for walking: wall sides minus doorways.
    for (const w of floor.walls) {
      const { len, dir, normal } = wallFrame(w);
      const gaps = floor.openings.filter((o) => o.wall === w.id && o.type !== 'window').map((o) => [o.offset, o.offset + o.width]).sort((a, b) => a[0] - b[0]);
      let u = -w.thickness / 2;
      const solid = [];
      for (const [g0, g1] of gaps) {
        if (g0 > u) solid.push([u, g0]);
        u = Math.max(u, g1);
      }
      if (u < len + w.thickness / 2) solid.push([u, len + w.thickness / 2]);
      for (const [s0, s1] of solid) {
        for (const side of [-1, 1]) {
          const off = [normal[0] * side * w.thickness / 2, normal[1] * side * w.thickness / 2];
          colliders.push({ a: [w.a[0] + dir[0] * s0 + off[0], w.a[1] + dir[1] * s0 + off[1]], b: [w.a[0] + dir[0] * s1 + off[0], w.a[1] + dir[1] * s1 + off[1]], y0, y1: y0 + floor.height });
        }
      }
    }

    // Stairs up to the next floor
    const stairsG = new THREE.Group();
    stairsG.name = 'Stairs';
    if (i < design.floors.length - 1) {
      for (const s of floor.stairs) stairsG.add(buildStairs(s, y0, ys[i + 1] - y0, { walkables, colliders }));
    }
    fg.add(stairsG);

    // Balustrade around stairwell holes in this floor (open on the side where the stairs arrive).
    if (i > 0) {
      const metal = makeMaterial('#2b2b2b', { kind: 'metal' });
      metal.name = 'Railing';
      design.floors[i - 1].stairs.forEach((s) => {
        const poly = stairwellPolygon(s, y0 - ys[i - 1]);
        const L = stairLayout(s, y0 - ys[i - 1]);
        const last = L.flights.at(-1);
        const endLocal = [last.start[0] + last.dir[0] * last.count * L.going, last.start[1] + last.dir[1] * last.count * L.going];
        const arrive = toPlan(s, endLocal);
        for (let k = 0; k < 4; k++) {
          const a = poly[k], b = poly[(k + 1) % 4];
          const c = closestOnSegment(arrive, a, b);
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          // Leave a gap only where the top flight arrives; rail the rest of that edge.
          const parts = c.dist < 0.3 ? [[0, c.t - L.width / 2 / len], [c.t + L.width / 2 / len, 1]] : [[0, 1]];
          for (const [t0, t1] of parts) {
            if ((t1 - t0) * len < 0.1) continue;
            const pa = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
            const pb = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
            fg.add(railing([pa, pb], [y0, y0], 0.95, metal, 'Stairwell railing'));
            colliders.push({ a: pa, b: pb, y0, y1: y0 + 1.2 });
          }
        }
      });
    }

    const furniture = new THREE.Group();
    furniture.name = 'Furniture';
    fg.add(furniture);

    root.add(fg);
    floors.push({ id: floor.id, index: i, y0, height: floor.height, group: fg, wallMesh, walkables, colliders, footprint: foot, furniture, rooms: roomsG });
  });

  // Flat roof over the top floor (shown when walking through, hidden in the dollhouse view).
  const top = floors.at(-1);
  if (top?.footprint.length) {
    const tf = design.floors.at(-1);
    const r = mesh(boxUV(extrudePlan(top.footprint, top.y0 + tf.height, top.y0 + tf.height + 0.2), 2), slabMat, 'Roof');
    r.visible = roof;
    r.userData.roof = true;
    root.add(r);
  }
  return { group: root, floors, elevations: ys };
}
