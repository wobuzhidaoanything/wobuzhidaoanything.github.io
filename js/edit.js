// Structure editing operations for one floor (pure JS, shared by the app and tools).
// All functions mutate the floor they're given and keep it consistent: openings stay on
// their walls and inside them, junctions stay connected, rooms follow the walls.
import { wallFrame, closestOnSegment, area, pointInPolygon } from './design.js';
import { detectRooms, footprint, polygonClipping, ring } from './plan.js';

const EPS = 0.01; // points closer than 1 cm are the same corner
const MIN_WALL = 0.05;
const GAP = 0.05; // minimum space between openings and wall ends / each other
const rid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
const same = (p, q, e = EPS) => Math.hypot(p[0] - q[0], p[1] - q[1]) < e;
const round = (p) => [+p[0].toFixed(4), +p[1].toFixed(4)];
const len = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** Walls with an endpoint at `p` (excluding `skip`), as [{wall, end}]. */
export function wallsAt(floor, p, skip) {
  const out = [];
  for (const w of floor.walls) {
    if (w.id === skip) continue;
    if (same(w.a, p)) out.push({ wall: w, end: 'a' });
    if (same(w.b, p)) out.push({ wall: w, end: 'b' });
  }
  return out;
}

/** Shift finish spans on a wall by `du` along it, optionally keeping only [lo, hi]. */
function shiftFinishes(w, du, lo = -Infinity, hi = Infinity) {
  if (!w.finishes) return;
  const next = {};
  for (const [side, f] of Object.entries(w.finishes)) {
    if (!Array.isArray(f)) {
      next[side] = f;
      continue;
    }
    const spans = f
      .map((s) => ({ ...s, from: Math.max(lo, s.from) + du, to: Math.min(hi, s.to) + du }))
      .filter((s) => s.to - s.from > 0.01)
      .map((s) => ({ ...s, from: +s.from.toFixed(3), to: +s.to.toFixed(3) }));
    if (spans.length) next[side] = spans;
  }
  w.finishes = next;
}

/** Move one end of a wall, keeping its openings (and finish spans) where they are in the world. */
function moveEnd(floor, w, end, to) {
  if (end === 'a') {
    const { dir } = wallFrame(w);
    const shift = dot([to[0] - w.a[0], to[1] - w.a[1]], dir);
    for (const o of floor.openings) if (o.wall === w.id) o.offset -= shift;
    shiftFinishes(w, -shift);
  }
  w[end] = round(to);
}

/** Wall ends lying on the middle of `w` (T-junctions), as [{wall, end}]. */
function tJoins(floor, w) {
  const out = [];
  for (const o of floor.walls) {
    if (o === w) continue;
    for (const k of ['a', 'b']) {
      const c = closestOnSegment(o[k], w.a, w.b);
      if (c.dist < w.thickness / 2 + EPS && c.t > 0.001 && c.t < 0.999) out.push({ wall: o, end: k });
    }
  }
  return out;
}

/**
 * Move a corner (every wall end at `from`) to `to`. Walls that T into a moved wall stay
 * joined to it: they extend or shorten along their own direction to meet it.
 * Returns the moved wall ends.
 */
export function moveCorner(floor, from, to) {
  const ends = wallsAt(floor, from);
  const tees = ends.flatMap(({ wall }) => tJoins(floor, wall).map((t) => ({ ...t, host: wall })));
  for (const { wall, end } of ends) moveEnd(floor, wall, end, to);
  for (const { wall, end, host } of tees) {
    if (ends.some((e) => e.wall === wall)) continue;
    const other = wall[end === 'a' ? 'b' : 'a'];
    const p = wall[end];
    // Where the T wall's own line meets the moved host wall
    const d = [p[0] - other[0], p[1] - other[1]];
    const h = [host.b[0] - host.a[0], host.b[1] - host.a[1]];
    const den = d[0] * h[1] - d[1] * h[0];
    let q = null;
    if (Math.abs(den) > 1e-9) {
      const s = ((host.a[0] - other[0]) * h[1] - (host.a[1] - other[1]) * h[0]) / den;
      const t = ((host.a[0] - other[0]) * d[1] - (host.a[1] - other[1]) * d[0]) / den;
      if (s > 0.05 && t > 0.001 && t < 0.999) q = [other[0] + d[0] * s, other[1] + d[1] * s];
    }
    // Otherwise (parallel, or the line misses the moved wall) snap to the nearest point on it
    moveEnd(floor, wall, end, q || closestOnSegment(p, host.a, host.b).q);
  }
  return ends;
}

/**
 * Push/pull a wall by `dn` metres along its normal (SketchUp-style):
 * - perpendicular neighbours at its ends stretch to follow;
 * - collinear or angled neighbours stay put and a new connecting wall is added (a jog),
 *   which is how recesses and bays are made;
 * - walls T-joined onto it follow their junction.
 * Openings stay on the moved wall. Works from a snapshot so it can be called every frame.
 */
export function pushWall(floor, wallId, dn) {
  const w = floor.walls.find((x) => x.id === wallId);
  if (!w || !dn) return floor;
  const { dir, normal, len: L } = wallFrame(w);
  const move = [normal[0] * dn, normal[1] * dn];
  const oldA = w.a.slice(), oldB = w.b.slice();
  const newA = [oldA[0] + move[0], oldA[1] + move[1]];
  const newB = [oldB[0] + move[0], oldB[1] + move[1]];
  // T-junctions: walls ending on the middle of this wall follow it.
  for (const o of floor.walls) {
    if (o === w) continue;
    for (const k of ['a', 'b']) {
      const c = closestOnSegment(o[k], oldA, oldB);
      if (c.dist < w.thickness / 2 + EPS && c.t > 0.001 && c.t < 0.999) moveEnd(floor, o, k, [o[k][0] + move[0], o[k][1] + move[1]]);
    }
  }
  for (const [old, nu] of [[oldA, newA], [oldB, newB]]) {
    const nbs = wallsAt(floor, old, w.id);
    let jog = false;
    for (const { wall: nb, end } of nbs) {
      const nd = wallFrame(nb).dir;
      if (Math.abs(dot(nd, dir)) < 0.08) moveEnd(floor, nb, end, nu); // perpendicular: stretch
      else jog = true; // collinear or angled: keep it, connect with a new wall
    }
    if (jog) floor.walls.push({ id: rid('w'), a: round(old), b: round(nu), thickness: w.thickness, ...(w.exterior ? { exterior: true } : {}) });
  }
  w.a = round(newA);
  w.b = round(newB);
  void L;
  return floor;
}

/** Split a wall at distance `at` (m from its start). Never cuts through an opening. Returns the new wall. */
export function splitWall(floor, wallId, at) {
  const w = floor.walls.find((x) => x.id === wallId);
  if (!w) return null;
  const L = len(w);
  // Move the split point out of any opening, to its nearer edge.
  for (const o of floor.openings) {
    if (o.wall !== w.id || at <= o.offset || at >= o.offset + o.width) continue;
    at = at - o.offset < o.offset + o.width - at ? o.offset - 0.001 : o.offset + o.width + 0.001;
  }
  if (at < MIN_WALL || at > L - MIN_WALL) return null;
  const { dir } = wallFrame(w);
  const p = round([w.a[0] + dir[0] * at, w.a[1] + dir[1] * at]);
  const nw = { ...w, id: rid('w'), a: p, b: w.b.slice(), finishes: w.finishes && structuredClone(w.finishes) };
  w.b = p.slice();
  floor.walls.push(nw);
  // Finish spans: the first part keeps [.., at], the new wall gets the rest (re-measured from its start)
  shiftFinishes(w, 0, -Infinity, at + w.thickness);
  shiftFinishes(nw, -at, at - nw.thickness, Infinity);
  for (const o of floor.openings) if (o.wall === w.id && o.offset >= at) (o.wall = nw.id), (o.offset -= at);
  return nw;
}

/** If `p` lies on the middle of a wall (a T-junction), split that wall there so the junction is real. */
export function connectT(floor, p, skipIds = []) {
  for (const w of [...floor.walls]) {
    if (skipIds.includes(w.id) || same(w.a, p) || same(w.b, p)) continue;
    const c = closestOnSegment(p, w.a, w.b);
    if (c.dist < 0.02 && c.t > 0.001 && c.t < 0.999) return splitWall(floor, w.id, c.t * len(w));
  }
  return null;
}

/** Which side of a wall faces into the building (+1 = along its normal, −1 = against). */
export function insideSign(floor, w) {
  const { normal } = wallFrame(w);
  const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
  const probe = (s) => [mid[0] + normal[0] * s * (w.thickness / 2 + 0.3), mid[1] + normal[1] * s * (w.thickness / 2 + 0.3)];
  const polys = footprint(floor).map((p) => p[0].slice(0, -1));
  const inside = (q) => polys.some((r) => pointInPolygon(q[0], q[1], r));
  if (inside(probe(1)) && !inside(probe(-1))) return 1;
  if (inside(probe(-1)) && !inside(probe(1))) return -1;
  return 1;
}

/**
 * Make a recess (depth > 0, into the building) or a bay (depth < 0, outward) in a wall:
 * the wall is split at `start` and `start + width` (m from its start) and the middle part pushed.
 * Returns the id of the pushed segment.
 */
export function makeRecess(floor, wallId, { start, width, depth }) {
  const w = floor.walls.find((x) => x.id === wallId);
  if (!w) throw new Error('No such wall');
  const L = len(w);
  if (width < 0.2 || start < 0 || start + width > L + 1e-6) throw new Error(`The recess must fit on the wall (${L.toFixed(2)} m)`);
  const sign = insideSign(floor, w);
  let mid = w;
  if (start > MIN_WALL) mid = splitWall(floor, w.id, start) || w;
  if (start + width < L - MIN_WALL) splitWall(floor, mid.id, width);
  // Openings that end up on the pushed part stay on it; those that were cut are kept whole by splitWall.
  pushWall(floor, mid.id, sign * depth);
  return mid.id;
}

/**
 * Move an opening so its centre is nearest `p`: it can hop to another wall within `reach`,
 * never overlaps other openings, and stays inside its wall. Returns false if it can't fit.
 */
export function moveOpening(floor, id, p, { reach = 0.6, snap = 0.05 } = {}) {
  const o = floor.openings.find((x) => x.id === id);
  if (!o) return false;
  let best = null;
  for (const w of floor.walls) {
    const c = closestOnSegment(p, w.a, w.b);
    if (c.dist > reach) continue;
    if (len(w) < o.width + 2 * GAP) continue;
    if (!best || c.dist < best.c.dist - (w.id === o.wall ? -0.05 : 0)) best = { w, c };
  }
  if (!best) return false;
  const L = len(best.w);
  let off = best.c.t * L - o.width / 2;
  if (snap) off = Math.round(off / snap) * snap;
  const others = floor.openings.filter((x) => x !== o && x.wall === best.w.id).sort((a, b) => a.offset - b.offset);
  // Free intervals on the wall, then the closest position within one.
  const free = [];
  let s = GAP;
  for (const x of others) {
    free.push([s, x.offset - GAP]);
    s = x.offset + x.width + GAP;
  }
  free.push([s, L - GAP]);
  let pos = null;
  for (const [f0, f1] of free) {
    if (f1 - f0 < o.width - 1e-9) continue;
    const q = Math.max(f0, Math.min(f1 - o.width, off));
    if (pos === null || Math.abs(q - off) < Math.abs(pos - off)) pos = q;
  }
  if (pos === null) return false;
  o.wall = best.w.id;
  o.offset = +pos.toFixed(3);
  return true;
}

/** Distances (m) from an opening to the nearest obstacle on each side (wall end or opening). */
export function openingGaps(floor, id) {
  const o = floor.openings.find((x) => x.id === id);
  const w = o && floor.walls.find((x) => x.id === o.wall);
  if (!w) return null;
  const L = len(w);
  let left = o.offset, right = L - o.offset - o.width;
  for (const x of floor.openings) {
    if (x === o || x.wall !== o.wall) continue;
    if (x.offset + x.width <= o.offset) left = Math.min(left, o.offset - x.offset - x.width);
    if (x.offset >= o.offset + o.width) right = Math.min(right, x.offset - o.offset - o.width);
  }
  return { left, right, wallLength: L };
}

/**
 * Tidy a floor after edits: drop zero-length and duplicate walls, merge straight runs split
 * earlier, keep openings inside their walls without overlaps. Returns what changed.
 */
export function cleanFloor(floor) {
  const report = { removedWalls: 0, merged: 0, droppedOpenings: [] };
  // Zero-length walls (e.g. a recess pushed back flush). Remember where they were: straight
  // runs are only re-merged there, so corners the user added on purpose are kept.
  const collapsed = [];
  for (const w of [...floor.walls]) {
    if (len(w) < MIN_WALL) {
      floor.walls = floor.walls.filter((x) => x !== w);
      collapsed.push(w.a, w.b);
      report.removedWalls++;
    }
  }
  // Duplicates (same ends either way round)
  for (let i = 0; i < floor.walls.length; i++) {
    for (let j = floor.walls.length - 1; j > i; j--) {
      const a = floor.walls[i], b = floor.walls[j];
      const dup = (same(a.a, b.a) && same(a.b, b.b)) || (same(a.a, b.b) && same(a.b, b.a));
      if (!dup) continue;
      const flip = same(a.a, b.b);
      for (const o of floor.openings) if (o.wall === b.id) (o.wall = a.id), flip && (o.offset = len(a) - o.offset - o.width);
      floor.walls.splice(j, 1);
      report.removedWalls++;
    }
  }
  // Merge collinear walls meeting end to end with nothing else at the joint.
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (const w of floor.walls) {
      for (const k of ['a', 'b']) {
        if (!collapsed.some((p) => same(p, w[k], 0.06))) continue;
        const at = wallsAt(floor, w[k], w.id);
        if (at.length !== 1) continue;
        const { wall: o, end } = at[0];
        if (o.thickness !== w.thickness || !!o.exterior !== !!w.exterior) continue;
        if (Math.abs(dot(wallFrame(o).dir, wallFrame(w).dir)) < 0.9999) continue;
        // Something else T-joins at this point? Then keep the joint.
        if (floor.walls.some((x) => x !== w && x !== o && closestOnSegment(w[k], x.a, x.b).dist < x.thickness / 2 + EPS)) continue;
        // Re-orient so the run goes w.a → joint → far end of o.
        const far = end === 'a' ? o.b : o.a;
        const start = k === 'b' ? w.a : w.b;
        const Lw = len(w), Lo = len(o);
        const nw = { ...w, a: start.slice(), b: far.slice() };
        for (const op of floor.openings) {
          if (op.wall === w.id && k === 'a') op.offset = Lw - op.offset - op.width; // w reversed
          if (op.wall === o.id) {
            const fromJoint = end === 'a' ? op.offset : Lo - op.offset - op.width;
            op.offset = Lw + fromJoint;
            op.wall = w.id;
          }
        }
        Object.assign(w, nw);
        floor.walls = floor.walls.filter((x) => x !== o);
        report.merged++;
        changed = true;
        break outer;
      }
    }
  }
  // Openings: on an existing wall, inside it, not overlapping.
  const ids = new Set(floor.walls.map((w) => w.id));
  floor.openings = floor.openings.filter((o) => ids.has(o.wall) || (report.droppedOpenings.push(o), false));
  for (const w of floor.walls) {
    const L = len(w);
    const ops = floor.openings.filter((o) => o.wall === w.id).sort((a, b) => a.offset - b.offset);
    let s = GAP;
    for (const o of ops) {
      const minW = o.type === 'door' ? 0.6 : 0.3;
      if (o.width > L - 2 * GAP) o.width = +(L - 2 * GAP).toFixed(3);
      o.offset = Math.max(o.offset, s);
      if (o.width < minW - 1e-9 || o.offset + o.width > L - GAP + 1e-9) {
        // Try pulling it back toward the start before giving up.
        o.offset = L - GAP - o.width;
        if (o.width < minW - 1e-9 || o.offset < s - 1e-9) {
          floor.openings = floor.openings.filter((x) => x !== o);
          report.droppedOpenings.push(o);
          continue;
        }
      }
      o.offset = +o.offset.toFixed(3);
      s = o.offset + o.width + GAP;
    }
    // Windows must fit the storey.
    for (const o of ops) if (o.type === 'window' && o.sill + o.height > (floor.height || 2.7) - 0.05) o.height = Math.max(0.3, (floor.height || 2.7) - 0.05 - o.sill);
  }
  return report;
}

const polyArea = (poly) => Math.abs(area(poly));
function overlap(a, b) {
  try {
    const inter = polygonClipping.intersection([ring(a)], [ring(b)]);
    return inter.reduce((s, p) => s + polyArea(p[0].slice(0, -1)) - p.slice(1).reduce((h, r) => h + polyArea(r.slice(0, -1)), 0), 0);
  } catch {
    return 0;
  }
}

/** Remove outline points that lie on a straight line between their neighbours. */
function dropCollinear(pts) {
  const out = pts.filter((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-6;
  });
  return out.length >= 3 ? out : pts;
}

/**
 * Re-detect rooms from the walls, keeping each room's name, finish and id when it still
 * covers the same space. Rooms drawn in open-plan areas (not enclosed) are kept as they are.
 */
export function syncRooms(floor) {
  const found = detectRooms(floor).map(dropCollinear);
  const old = floor.rooms || [];
  const used = new Set();
  const next = [];
  let n = old.length;
  for (const pts of found) {
    let best = null;
    for (const r of old) {
      if (used.has(r)) continue;
      const ov = overlap(pts, r.points);
      if (ov > 0.3 * Math.min(polyArea(pts), polyArea(r.points)) && (!best || ov > best.ov)) best = { r, ov };
    }
    if (best) {
      used.add(best.r);
      next.push({ ...best.r, points: pts });
    } else next.push({ id: rid('r'), name: `Room ${++n}`, points: pts, floorKind: 'wood', floorColor: '#c49a6c' });
  }
  // Keep unmatched rooms only if they don't overlap any enclosed space (hand-drawn open-plan areas).
  for (const r of old) if (!used.has(r) && !found.some((p) => overlap(p, r.points) > 0.05)) next.push(r);
  floor.rooms = next;
  return floor.rooms;
}
