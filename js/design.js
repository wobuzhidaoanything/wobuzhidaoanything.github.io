// House design data model (format 2). Pure JS, no three.js, so the Node tools
// (MCP server, CLI) share exactly the same rules as the browser.
//
// Units: metres. Plan coordinates [x, z]: x to the right, z "down" the plan
// (toward the default camera). Rotation in degrees; 0 = front faces +z.

export const FORMAT = 2;

export const DEFAULTS = {
  floorHeight: 2.7, // finished floor to ceiling
  slab: 0.2, // floor slab thickness (between floors)
  groundSlab: 0.15,
  exteriorWall: 0.25,
  interiorWall: 0.12,
  stairWidth: 1.0,
  maxRiser: 0.18, // building-code style limits (most codes: 150–190 mm)
  targetGoing: 0.28, // tread depth; 2R + G ≈ 630 mm (Blondel's rule)
};

const rid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const pt = (p) => [+(+p[0]).toFixed(4), +(+p[1]).toFixed(4)];

// ---------- creation & migration ----------

export function newFloor(i, opts = {}) {
  return {
    id: opts.id || rid('f'),
    name: opts.name || (i === 0 ? 'Ground floor' : `Floor ${i}`),
    height: opts.height ?? DEFAULTS.floorHeight,
    slab: opts.slab ?? (i === 0 ? DEFAULTS.groundSlab : DEFAULTS.slab),
    walls: [],
    openings: [],
    rooms: [],
    stairs: [],
    placed: [],
  };
}

/** Rectangle of exterior walls, clockwise from top-left, walls centred on the lines. */
export function rectWalls(x0, z0, w, d, thickness = DEFAULTS.exteriorWall) {
  const p = [[x0, z0], [x0 + w, z0], [x0 + w, z0 + d], [x0, z0 + d]];
  return p.map((a, i) => ({ id: rid('w'), a: pt(a), b: pt(p[(i + 1) % 4]), thickness, exterior: true }));
}

/** A new empty house: `floors` storeys of width × depth with exterior walls and a straight stair. */
export function newHouse({ name = 'My house', width = 10, depth = 8, floors = 2, floorHeight = DEFAULTS.floorHeight } = {}) {
  const design = { format: FORMAT, id: rid('d'), name, floors: [], inventory: [], updatedAt: new Date().toISOString() };
  for (let i = 0; i < floors; i++) {
    const f = newFloor(i, { height: floorHeight });
    f.walls = rectWalls(0, 0, width, depth);
    const t = DEFAULTS.exteriorWall / 2;
    f.rooms = [{ id: rid('r'), name: i === 0 ? 'Living' : 'Room', points: [[t, t], [width - t, t], [width - t, depth - t], [t, depth - t]], floorKind: 'wood', floorColor: '#c49a6c' }];
    design.floors.push(f);
  }
  // One stair per level against the right-hand exterior wall, with ~1 m of clear floor
  // at the bottom and top (real stairs need landing space). Straight if it fits, else U-turn.
  const t = DEFAULTS.exteriorWall / 2;
  const W = DEFAULTS.stairWidth;
  const clear = 0.95;
  for (let i = 0; i < floors - 1; i++) {
    const H = floorHeight + design.floors[i + 1].slab;
    const run = (shape) => { const L = stairLayout({ shape, width: W, turn: 'left' }, H); return L.box.maxZ - L.box.minZ; };
    const shape = run('straight') + 2 * clear <= depth - 2 * t ? 'straight' : 'U';
    const L = stairLayout({ shape, width: W, turn: 'left' }, H);
    // rot 0 climbs toward −z (the back wall); the first step starts `clear` in front of the front wall.
    design.floors[i].stairs.push({ id: rid('s'), shape, turn: 'left', x: +(width - t - 0.02 - L.box.maxX).toFixed(3), z: +(depth - t - clear).toFixed(3), rot: 0, width: W });
  }
  return design;
}

/** Convert a format-1 single-room project into a one-floor house. */
export function migrate(p) {
  if (!p) return newHouse();
  if (p.format === FORMAT && Array.isArray(p.floors)) return normalize(p);
  const room = p.room || {};
  const pts = Array.isArray(room.points) && room.points.length >= 3 ? room.points : [[0, 0], [4, 0], [4, 3.5], [0, 3.5]];
  const f = newFloor(0, { height: room.height || DEFAULTS.floorHeight });
  // v1 walls sat outside the room outline; keep interior sizes by offsetting centre lines outward.
  const t = 0.12;
  const ccw = area(pts) > 0;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const out = ccw ? [(b[1] - a[1]) / L, -(b[0] - a[0]) / L] : [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    return { a: [a[0] + out[0] * t / 2, a[1] + out[1] * t / 2], b: [b[0] + out[0] * t / 2, b[1] + out[1] * t / 2] };
  });
  // Intersect neighbouring offset lines for clean corners.
  const corners = lines.map((l, i) => intersectLines(lines[(i - 1 + lines.length) % lines.length], l) || l.a);
  f.walls = corners.map((a, i) => ({ id: `w${i}`, a: pt(a), b: pt(corners[(i + 1) % corners.length]), thickness: t, exterior: true }));
  f.openings = (room.openings || []).map((o) => ({ ...o, wall: `w${o.wall}`, offset: o.offset + t / 2 }));
  f.rooms = [{ id: 'r-main', name: 'Room', points: pts.map(pt), floorKind: room.floorKind || 'wood', floorColor: room.floorColor || '#c49a6c' }];
  f.placed = p.placed || [];
  return normalize({ format: FORMAT, id: rid('d'), name: p.name || 'My room', wallColor: room.wallColor, floors: [f], inventory: p.inventory || [] });
}

/** Fill defaults and drop broken references so the rest of the app can trust the data. */
export function normalize(d) {
  d.format = FORMAT;
  d.id ||= rid('d');
  d.name ||= 'My house';
  d.wallColor ||= '#efebe4';
  d.inventory = Array.isArray(d.inventory) ? d.inventory : [];
  d.floors = (Array.isArray(d.floors) && d.floors.length ? d.floors : [newFloor(0)]).map((f, i) => {
    f.id ||= rid('f');
    f.name ||= i === 0 ? 'Ground floor' : `Floor ${i}`;
    f.height = num(f.height, DEFAULTS.floorHeight);
    f.slab = num(f.slab, i === 0 ? DEFAULTS.groundSlab : DEFAULTS.slab);
    f.walls = (f.walls || []).filter((w) => w?.a && w?.b).map((w) => ({ ...w, id: w.id || rid('w'), a: pt(w.a), b: pt(w.b), thickness: num(w.thickness, w.exterior ? DEFAULTS.exteriorWall : DEFAULTS.interiorWall) }));
    const wallIds = new Set(f.walls.map((w) => w.id));
    f.openings = (f.openings || []).filter((o) => wallIds.has(o.wall)).map((o) => ({ ...o, id: o.id || rid('o'), type: ['door', 'window', 'opening'].includes(o.type) ? o.type : 'window', width: num(o.width, 0.9), height: num(o.height, o.type === 'window' ? 1.3 : 2.1), sill: o.type === 'window' ? num(o.sill, 0.85) : 0, offset: num(o.offset, 0.3) }));
    f.rooms = (f.rooms || []).filter((r) => r?.points?.length >= 3).map((r) => ({ ...r, id: r.id || rid('r'), points: r.points.map(pt) }));
    f.stairs = (f.stairs || []).map((s) => ({ ...s, id: s.id || rid('s'), shape: ['straight', 'L', 'U'].includes(s.shape) ? s.shape : 'straight', width: num(s.width, DEFAULTS.stairWidth), rot: num(s.rot, 0), x: num(s.x, 1), z: num(s.z, 1), turn: s.turn === 'left' ? 'left' : 'right' }));
    f.placed = (f.placed || []).filter((p) => p?.itemId);
    return f;
  });
  // Stairs on the top floor have nowhere to go.
  d.floors.at(-1).stairs = [];
  return d;
}

// ---------- geometry helpers (plan space) ----------

export function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
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

export function intersectLines(l1, l2) {
  const [x1, y1] = l1.a, [x2, y2] = l1.b, [x3, y3] = l2.a, [x4, y4] = l2.b;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

export function closestOnSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  const q = [a[0] + dx * t, a[1] + dz * t];
  return { q, t, dist: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

/** Wall frame: length, unit direction, unit normal (left of a→b). */
export function wallFrame(w) {
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
  const len = Math.hypot(dx, dz) || 1e-6;
  const dir = [dx / len, dz / len];
  return { len, dir, normal: [-dir[1], dir[0]] };
}

/** Rectangle footprint of a wall, extended by half its thickness at both ends so corners overlap. */
export function wallRect(w, extend = true) {
  const { dir, normal } = wallFrame(w);
  const h = w.thickness / 2;
  const e = extend ? h : 0;
  const a = [w.a[0] - dir[0] * e, w.a[1] - dir[1] * e];
  const b = [w.b[0] + dir[0] * e, w.b[1] + dir[1] * e];
  return [
    [a[0] + normal[0] * h, a[1] + normal[1] * h],
    [b[0] + normal[0] * h, b[1] + normal[1] * h],
    [b[0] - normal[0] * h, b[1] - normal[1] * h],
    [a[0] - normal[0] * h, a[1] - normal[1] * h],
  ];
}

// ---------- floors ----------

/** Elevation (finished floor level) of each floor, stacking heights and slabs. */
export function elevations(design) {
  const out = [];
  let y = 0;
  design.floors.forEach((f, i) => {
    if (i > 0) y += design.floors[i - 1].height + f.slab;
    out.push(y);
  });
  return out;
}

export function floorIndex(design, floorId) {
  return design.floors.findIndex((f) => f.id === floorId);
}

// ---------- stairs ----------

/**
 * Real-world stair layout for a rise `H`: riser count so each step ≤ 18 cm, going from
 * Blondel's rule (2R + G ≈ 63 cm, clamped 25–30 cm). Returns flights and landings in
 * the stair's local frame: origin at the bottom-centre of the first step, climbing
 * toward local −z. `turn` (L/U) is the side the stair turns to.
 */
export function stairLayout(stair, H) {
  const W = stair.width || DEFAULTS.stairWidth;
  const n = Math.max(2, Math.ceil(H / DEFAULTS.maxRiser - 1e-9));
  const riser = H / n;
  const going = Math.min(0.3, Math.max(0.25, 0.63 - 2 * riser));
  const side = stair.turn === 'left' ? -1 : 1;
  const flights = [];
  const landings = [];
  // A flight: `count` treads starting at `start` (local xz), direction `dir`, first tread top at y0 + riser.
  if (stair.shape === 'L' || stair.shape === 'U') {
    const n1 = Math.floor((n - 1) / 2);
    // Rises: n1 treads, the landing, n2 treads, then the final step onto the upper floor.
    const n2 = n - 2 - n1;
    const len1 = n1 * going;
    flights.push({ start: [0, 0], dir: [0, -1], count: n1, y0: 0 });
    const landY = (n1 + 1) * riser;
    if (stair.shape === 'L') {
      // Square landing, then turn 90° toward `side`.
      landings.push({ center: [0, -len1 - W / 2], size: [W, W], y: landY });
      flights.push({ start: [side * W / 2, -len1 - W / 2], dir: [side, 0], count: n2, y0: landY });
    } else {
      // Half landing spanning both flights (10 cm gap between them), then return. The return
      // flight ends level with the start line so its top step meets the upper floor's edge.
      const gap = 0.1;
      const x2 = side * (W + gap);
      const start2 = -n2 * going;
      landings.push({ center: [side * (W + gap) / 2, -len1 - W / 2], size: [2 * W + gap, W], y: landY });
      if (start2 < -len1 - 1e-6 || start2 > -len1 + 1e-6) {
        // Fill between the landing and the return flight when the flights differ in length.
        const z0 = Math.min(start2, -len1), z1 = Math.max(start2, -len1);
        if (start2 > -len1) landings.push({ center: [x2, (z0 + z1) / 2], size: [W, z1 - z0], y: landY });
      }
      flights.push({ start: [x2, start2], dir: [0, 1], count: n2, y0: landY });
    }
  } else {
    flights.push({ start: [0, 0], dir: [0, -1], count: n - 1, y0: 0 });
  }
  // Footprint (local) = union of flight and landing rectangles → bounding box.
  const rects = [];
  for (const f of flights) {
    const L = f.count * going;
    const perp = [-f.dir[1], f.dir[0]];
    const a = f.start;
    const b = [a[0] + f.dir[0] * L, a[1] + f.dir[1] * L];
    rects.push([
      [a[0] + perp[0] * W / 2, a[1] + perp[1] * W / 2],
      [b[0] + perp[0] * W / 2, b[1] + perp[1] * W / 2],
      [b[0] - perp[0] * W / 2, b[1] - perp[1] * W / 2],
      [a[0] - perp[0] * W / 2, a[1] - perp[1] * W / 2],
    ]);
  }
  for (const l of landings) {
    const [cx, cz] = l.center, [sx, sz] = l.size;
    rects.push([[cx - sx / 2, cz - sz / 2], [cx + sx / 2, cz - sz / 2], [cx + sx / 2, cz + sz / 2], [cx - sx / 2, cz + sz / 2]]);
  }
  const xs = rects.flat().map((p) => p[0]);
  const zs = rects.flat().map((p) => p[1]);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  return { n, riser, going, width: W, flights, landings, rects, box, rise: H };
}

/** Local → plan transform for a stair (or any rotated object at x/z with rot degrees). */
export function toPlan(obj, [lx, lz]) {
  const a = ((obj.rot || 0) * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  // Rotation about +y: local +z maps to (sin a, cos a) like furniture.
  return [obj.x + lx * c + lz * s, obj.z - lx * s + lz * c];
}

/** Plan-space polygon of the stairwell opening a stair needs in the floor above. */
export function stairwellPolygon(stair, H) {
  const { minX, maxX, minZ, maxZ } = stairLayout(stair, H).box;
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]].map((p) => toPlan(stair, p));
}

// ---------- validation ----------

/** Human-readable problems in a design (used by agents after writing a design). */
export function validate(d) {
  const problems = [];
  if (d.format !== FORMAT) problems.push(`format must be ${FORMAT}`);
  const itemIds = new Set((d.inventory || []).map((i) => i.id));
  const ys = elevations(d);
  d.floors.forEach((f, fi) => {
    const where = `floor "${f.name}"`;
    if (!f.walls.length) problems.push(`${where} has no walls`);
    for (const w of f.walls) if (Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) < 0.05) problems.push(`${where}: wall ${w.id} is shorter than 5 cm`);
    for (const o of f.openings) {
      const w = f.walls.find((x) => x.id === o.wall);
      const { len } = wallFrame(w);
      if (o.offset < 0 || o.offset + o.width > len + 1e-6) problems.push(`${where}: ${o.type} ${o.id} doesn't fit on wall ${w.id} (wall ${len.toFixed(2)} m, opening ${o.offset.toFixed(2)}+${o.width.toFixed(2)} m)`);
      if (o.type === 'window' && o.sill + o.height > f.height) problems.push(`${where}: window ${o.id} is taller than the wall`);
      if (o.type !== 'window' && o.height > f.height) problems.push(`${where}: door ${o.id} is taller than the wall`);
    }
    for (const s of f.stairs) {
      if (fi === d.floors.length - 1) problems.push(`${where}: stairs ${s.id} lead nowhere (top floor)`);
      else {
        const H = ys[fi + 1] - ys[fi];
        const L = stairLayout(s, H);
        if (L.riser > 0.2) problems.push(`${where}: stairs ${s.id} riser ${Math.round(L.riser * 1000)} mm is steep`);
      }
    }
    for (const p of f.placed) if (!itemIds.has(p.itemId)) problems.push(`${where}: placed ${p.id} refers to missing item ${p.itemId}`);
  });
  return problems;
}
