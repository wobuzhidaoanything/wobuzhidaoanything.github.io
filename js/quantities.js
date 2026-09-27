// Quantities (a "schedule" in architecture software): per room floor area, wall area to paint
// or cover (minus doors and windows), skirting length, ceiling area, and the furniture with
// prices. Pure plan maths, shared by the app and tests.
import { wallFrame, area, pointInPolygon } from './design.js';
import { finishAt } from './house.js';

const WASTE = 0.1; // order 10% extra flooring / wall covering for cuts

/**
 * The stretches of wall sides facing into a room: [{ wall, side, from, to }] (u along the wall).
 * Each edge of the room outline lies on one wall's face.
 */
export function roomSides(floor, room) {
  const out = [];
  const pts = room.points;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let best = null;
    for (const w of floor.walls) {
      const { dir, normal, len } = wallFrame(w);
      const d = (m) => (m[0] - w.a[0]) * normal[0] + (m[1] - w.a[1]) * normal[1];
      const u = (m) => (m[0] - w.a[0]) * dir[0] + (m[1] - w.a[1]) * dir[1];
      const err = Math.abs(Math.abs(d(mid)) - w.thickness / 2);
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const parallel = Math.abs(((q[0] - p[0]) * dir[0] + (q[1] - p[1]) * dir[1]) / L);
      if (err > 0.03 || parallel < 0.99 || u(mid) < -w.thickness || u(mid) > len + w.thickness) continue;
      if (!best || err < best.err) best = { wall: w, side: d(mid) > 0 ? 'l' : 'r', from: Math.min(u(p), u(q)), to: Math.max(u(p), u(q)), err };
    }
    if (best) out.push(best);
  }
  return out;
}

const finishKey = (f) => (f ? `${f.kind}|${f.color}` : 'paint|house');

/**
 * Quantities for one floor. `itemById(id)` → library item (for names and prices).
 * Returns { rooms: [...], finishes: {key: m²}, furniture: [...], totals }.
 */
export function floorQuantities(floor, { itemById = () => null, wallColor = '#efebe4' } = {}) {
  const rooms = floor.rooms.map((r) => {
    const floorArea = Math.abs(area(r.points));
    let perimeter = 0;
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i], q = r.points[(i + 1) % r.points.length];
      perimeter += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    const walls = {}; // finish key -> { finish, area }
    let wallArea = 0, openingArea = 0, doorWidth = 0;
    for (const s of roomSides(floor, r)) {
      const len = s.to - s.from;
      let a = len * floor.height;
      for (const o of floor.openings.filter((x) => x.wall === s.wall.id)) {
        const o0 = Math.max(s.from, o.offset), o1 = Math.min(s.to, o.offset + o.width);
        if (o1 <= o0) continue;
        const cut = (o1 - o0) * Math.min(o.height, floor.height - (o.type === 'window' ? o.sill : 0));
        a -= cut;
        openingArea += cut;
        if (o.type !== 'window') doorWidth += o1 - o0;
      }
      wallArea += a;
      const fin = finishAt(s.wall, s.side, (s.from + s.to) / 2);
      const key = finishKey(fin);
      walls[key] ||= { finish: fin || { kind: 'paint', color: wallColor }, area: 0 };
      walls[key].area += a;
    }
    const items = floor.placed
      .filter((p) => pointInPolygon(p.x, p.z, r.points))
      .map((p) => ({ placed: p, item: itemById(p.itemId) }))
      .filter((x) => x.item);
    return {
      room: r,
      name: r.name || 'Room',
      floorArea,
      flooring: { kind: r.floorKind || 'wood', color: r.floorColor, order: floorArea * (1 + WASTE) },
      ceilingArea: floorArea,
      perimeter,
      skirting: Math.max(0, perimeter - doorWidth),
      wallArea,
      openingArea,
      walls: Object.values(walls),
      items,
    };
  });
  const finishes = {};
  for (const r of rooms)
    for (const w of r.walls) {
      const k = finishKey(w.finish);
      finishes[k] ||= { finish: w.finish, area: 0 };
      finishes[k].area += w.area;
    }
  const furniture = floor.placed.map((p) => ({ placed: p, item: itemById(p.itemId) })).filter((x) => x.item);
  const cost = {};
  for (const { item } of furniture) {
    const v = parseFloat(String(item.price || '').replace(/[^\d.]/g, ''));
    if (Number.isFinite(v)) cost[item.currency || ''] = (cost[item.currency || ''] || 0) + v;
  }
  return {
    rooms,
    finishes: Object.values(finishes),
    furniture,
    totals: {
      floorArea: rooms.reduce((s, r) => s + r.floorArea, 0),
      wallArea: rooms.reduce((s, r) => s + r.wallArea, 0),
      skirting: rooms.reduce((s, r) => s + r.skirting, 0),
      cost,
    },
  };
}

/** CSV (Excel-friendly) of a whole design's quantities. */
export function quantitiesCSV(design, opts) {
  const rows = [['Floor', 'Room', 'What', 'Quantity', 'Unit', 'Notes']];
  const n = (v, d = 2) => v.toFixed(d);
  for (const f of design.floors) {
    const q = floorQuantities(f, { ...opts, wallColor: design.wallColor });
    for (const r of q.rooms) {
      rows.push([f.name, r.name, 'Floor area', n(r.floorArea), 'm²', '']);
      rows.push([f.name, r.name, `Flooring (${r.flooring.kind})`, n(r.flooring.order), 'm²', `includes ${WASTE * 100}% for cuts`]);
      for (const w of r.walls) rows.push([f.name, r.name, `Walls: ${w.finish.kind} ${w.finish.color}`, n(w.area), 'm²', 'doors and windows taken off']);
      rows.push([f.name, r.name, 'Ceiling', n(r.ceilingArea), 'm²', '']);
      rows.push([f.name, r.name, 'Skirting', n(r.skirting), 'm', 'door openings taken off']);
      for (const { item, placed } of r.items) rows.push([f.name, r.name, item.name, '1', 'pc', [item.price && `${item.currency || ''} ${item.price}`.trim(), placed.color, item.url].filter(Boolean).join(' · ')]);
    }
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n') + '\r\n';
}
