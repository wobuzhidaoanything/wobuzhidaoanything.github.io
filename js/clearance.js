// Clearances: the space furniture needs to be used, and the space doors need to open.
// Pure plan maths (metres, x right, z down), shared by the app and tests.
//   useZones(p, item)   the floor area in front of (or around) an item that should stay free
//   doorSwing(floor, o) the quarter circle a door sweeps when it opens
//   analyse(floor, itemById) → [{ placedId, kind, message }]
import { wallFrame, wallRect } from './design.js';

/** Free space each kind of furniture needs, in metres: [front, sides, back]. */
export const USE_ZONE = {
  sofa: [0.45, 0, 0], // knee room to the coffee table
  armchair: [0.45, 0, 0],
  chair: [0.6, 0, 0], // to pull it out
  stool: [0.4, 0, 0],
  bed: [0.6, 0.6, 0], // to walk round and make the bed
  wardrobe: [0.75, 0, 0], // doors and standing room
  dresser: [0.7, 0, 0], // drawers
  sideboard: [0.6, 0, 0],
  bookshelf: [0.6, 0, 0],
  desk: [0.75, 0, 0], // for the chair
  table: [0.75, 0.75, 0.75], // chairs all round
  tvstand: [0.3, 0, 0],
  nightstand: [0.3, 0, 0],
};
// Things that may sit in each other's zones on purpose
const PAIRS = [
  ['chair', 'table'], ['chair', 'desk'], ['stool', 'table'], ['stool', 'desk'], ['nightstand', 'bed'], ['ottoman', 'sofa'], ['ottoman', 'armchair'],
  ['coffeetable', 'sofa'], ['coffeetable', 'armchair'], ['sidetable', 'sofa'], ['sidetable', 'armchair'], ['sidetable', 'bed'], ['floorlamp', 'sofa'], ['floorlamp', 'armchair'], ['plant', 'sofa'],
];
const IGNORE = new Set(['rug', 'lamp', 'curtain', 'mirror', 'tv']);
const paired = (a, b) => PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const cm = (m) => Math.round(m * 100);

function rotate([x, z], a) {
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
}

/** Plan rectangle of a placed item (local x = width, local +z = its front). */
export function footprintRect(p, dims, grow = [0, 0, 0, 0]) {
  const [front, left, back, right] = grow;
  const a = ((p.rot || 0) * Math.PI) / 180;
  const w = dims.w / 2, d = dims.d / 2;
  return [
    [-w - left, -d - back], [w + right, -d - back], [w + right, d + front], [-w - left, d + front],
  ].map((q) => {
    const [x, z] = rotate(q, a);
    return [p.x + x, p.z + z];
  });
}

/** Zones in front of / around an item that should stay free (plan polygons), with how much space they ask for. */
export function useZones(p, item, dims) {
  const z = USE_ZONE[item.category];
  if (!z || (p.y || 0) > 0.05) return [];
  const [front, sides, back] = z;
  const out = [];
  const a = ((p.rot || 0) * Math.PI) / 180;
  const w = dims.w / 2, d = dims.d / 2;
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map((q) => {
    const [x, zz] = rotate(q, a);
    return [p.x + x, p.z + zz];
  });
  if (front) out.push({ poly: rect(-w, d, w, d + front), need: front, where: 'in front of' });
  if (sides) {
    // Beds: the sides from the foot up to about a third of the way (the head end has nightstands)
    const z0 = item.category === 'bed' ? -d + dims.d * 0.35 : -d;
    out.push({ poly: rect(-w - sides, z0, -w, d), need: sides, where: 'beside' });
    out.push({ poly: rect(w, z0, w + sides, d), need: sides, where: 'beside' });
  }
  if (back) out.push({ poly: rect(-w, -d - back, w, -d), need: back, where: 'behind' });
  return out;
}

/** The area a door sweeps (quarter circle as a polygon), matching the plan symbol. */
export function doorSwing(floor, o) {
  if (o.type !== 'door') return null;
  const w = floor.walls.find((x) => x.id === o.wall);
  if (!w) return null;
  const { len, dir } = wallFrame(w);
  const f = 0.05;
  const u0 = Math.max(0.02, o.offset), u1 = Math.min(len - 0.02, o.offset + o.width);
  const leaf = u1 - u0 - 2 * f;
  const atEnd = o.hinge === 'end';
  const pu = atEnd ? u1 - f : u0 + f;
  const pivot = [w.a[0] + dir[0] * pu, w.a[1] + dir[1] * pu];
  const angle = Math.atan2(-dir[1], dir[0]);
  const base = angle + (atEnd ? Math.PI : 0);
  const sw = (o.swing === 'out' ? -1 : 1) * (atEnd ? -1 : 1);
  const pts = [pivot];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2) * sw;
    const [x, z] = rotate([Math.cos(t) * leaf, -Math.sin(t) * leaf], base);
    pts.push([pivot[0] + x, pivot[1] + z]);
  }
  return pts;
}

// ---------- convex polygon helpers (all shapes here are convex) ----------

function axes(poly) {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const e = [q[0] - p[0], q[1] - p[1]];
    const l = Math.hypot(...e) || 1;
    return [-e[1] / l, e[0] / l];
  });
}

/** Overlap depth of two convex polygons (0 if they don't overlap). */
export function overlap(A, B) {
  let min = Infinity;
  for (const ax of [...axes(A), ...axes(B)]) {
    const proj = (P) => P.map((p) => p[0] * ax[0] + p[1] * ax[1]);
    const a = proj(A), b = proj(B);
    const o = Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b));
    if (o <= 1e-4) return 0;
    min = Math.min(min, o);
  }
  return min;
}

/** Shortest distance between two convex polygons (0 if they overlap). */
function gap(A, B) {
  if (overlap(A, B) > 0) return 0;
  let d = Infinity;
  const seg = (p, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
  };
  for (const [P, Q] of [[A, B], [B, A]]) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, seg(p, Q[i], Q[(i + 1) % Q.length]));
  return d;
}

/**
 * Clearance problems on a floor. `itemById(id)` gives a library item, `dimsOf(item)` its size.
 * Returns [{ placedId, kind: 'door' | 'zone', message, other }].
 */
function things(floor, itemById, dimsOf) {
  return floor.placed
    .map((p) => {
      const item = itemById(p.itemId);
      if (!item || IGNORE.has(item.category) || (p.y || 0) > 0.05) return null;
      const dims = dimsOf(item);
      return { p, item, dims, rect: footprintRect(p, dims) };
    })
    .filter(Boolean);
}
const nameOf = (t) => t.item.name || t.item.category;

/** What's in a use zone (the biggest intrusion by furniture or a wall), or null if it's free. */
function intruder(zone, t, all, walls) {
  let worst = null;
  for (const u of all) {
    if (u === t || paired(u.item.category, t.item.category)) continue;
    const o = overlap(zone.poly, u.rect);
    if (o > 0.02 && (!worst || o > worst.o)) worst = { o, what: nameOf(u), rect: u.rect };
  }
  for (const w of walls) {
    const o = overlap(zone.poly, w.rect);
    if (o > 0.02 && (!worst || o > worst.o)) worst = { o, what: 'a wall', rect: w.rect };
  }
  return worst;
}

/** Use zones of one placed item with whether each is blocked (for drawing). */
export function zoneStatus(floor, placedId, itemById, dimsOf) {
  const all = things(floor, itemById, dimsOf);
  const t = all.find((x) => x.p.id === placedId);
  if (!t) return [];
  const walls = floor.walls.map((w) => ({ wall: w, rect: wallRect(w, false) }));
  return useZones(t.p, t.item, t.dims).map((z) => ({ poly: z.poly, bad: !!intruder(z, t, all, walls) }));
}

export function analyse(floor, itemById, dimsOf) {
  const out = [];
  const all = things(floor, itemById, dimsOf);
  const name = nameOf;
  // Doors that can't open
  for (const o of floor.openings) {
    const sw = doorSwing(floor, o);
    if (!sw) continue;
    for (const t of all)
      if (overlap(sw, t.rect) > 0.02) out.push({ placedId: t.p.id, kind: 'door', door: o.id, message: `${name(t)} blocks a door from opening` });
  }
  // Use zones with something (furniture or a wall) in them
  const walls = floor.walls.map((w) => ({ wall: w, rect: wallRect(w, false) }));
  for (const t of all) {
    for (const z of useZones(t.p, t.item, t.dims)) {
      const worst = intruder(z, t, all, walls);
      if (worst) {
        const left = gap(t.rect, worst.rect);
        out.push({ placedId: t.p.id, kind: 'zone', message: `Only ${cm(left)} cm ${z.where} the ${name(t).toLowerCase()} (${worst.what} is in the way; about ${cm(z.need)} cm is comfortable)` });
      }
    }
  }
  return out;
}
