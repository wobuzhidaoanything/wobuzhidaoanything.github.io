// 2D plan operations shared by the browser and Node tools (no three.js).
import polygonClipping from 'polygon-clipping';
import { wallRect } from './design.js';

/** Closed ring from open points. */
export const ring = (pts) => [...pts.map((p) => [p[0], p[1]]), [pts[0][0], pts[0][1]]];
export const openRing = (r) => r.slice(0, -1);

/** Footprint of all walls on a floor, unioned (multipolygon, plan coords). */
export function wallUnion(floor) {
  if (!floor.walls.length) return [];
  return polygonClipping.union(...floor.walls.map((w) => [ring(wallRect(w))]));
}

/** Outer boundary of the walls (slab footprint): the union's outer rings, filled. */
export function footprint(floor) {
  const u = wallUnion(floor);
  if (!u.length) return [];
  return polygonClipping.union(...u.map((p) => [p[0]]));
}

/** Enclosed spaces between walls (candidate rooms): holes of the wall union, as open rings. */
export function detectRooms(floor) {
  const out = [];
  for (const poly of wallUnion(floor)) for (const hole of poly.slice(1)) out.push(openRing(hole).map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)]));
  return out;
}

export { polygonClipping };
