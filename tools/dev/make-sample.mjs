// Regenerates data/sample-house.json (the house new devices start with) and
// data/library.json (shipped furniture models). Run: node tools/dev/make-sample.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/paths.mjs';
import { newHouse, normalize, validate, elevations } from '../../js/design.js';
import { detectRooms } from '../../js/plan.js';

const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'library.json'), 'utf8'));
const items = old.items;

const d = newHouse({ name: 'Sample house', width: 10, depth: 8, floors: 2, floorHeight: 2.7 });
d.id = 'sample-house';
const [g, f1] = d.floors;
// U-turn stairs in the hall: 95 cm clear in front of the first step, arriving back at the front upstairs.
g.stairs = [{ id: 's-main', shape: 'U', turn: 'left', x: 9.355, z: 6.9, rot: 0, width: 1.0 }];
const ext = (f) => f.walls.map((w) => w.id); // [back, right, front, left]

// ----- Ground floor: living room (left), kitchen-dining (right back), hall + stairs (right front)
{
  const [back, right, front, left] = ext(g);
  g.walls.push({ id: 'g-mid', a: [6, 0], b: [6, 8], thickness: 0.12 });
  g.walls.push({ id: 'g-kit', a: [6, 3.2], b: [10, 3.2], thickness: 0.12 });
  g.openings = [
    { id: 'g-front-door', type: 'door', wall: front, offset: 1.6, width: 1.0, height: 2.1, open: false },
    { id: 'g-living-door', type: 'opening', wall: 'g-mid', offset: 5.2, width: 1.2, height: 2.1 },
    { id: 'g-kitchen-door', type: 'door', wall: 'g-kit', offset: 0.5, width: 0.9, height: 2.1, open: true },
    { id: 'g-win-back', type: 'window', wall: back, offset: 1.4, width: 2.4, height: 1.4, sill: 0.8 },
    { id: 'g-win-kitchen', type: 'window', wall: back, offset: 7.2, width: 1.6, height: 1.2, sill: 1.0 },
    { id: 'g-win-left', type: 'window', wall: left, offset: 2.4, width: 1.6, height: 1.4, sill: 0.8 },
    { id: 'g-win-front', type: 'window', wall: front, offset: 5.6, width: 2.2, height: 1.4, sill: 0.8 },
  ];
  const rooms = detectRooms(g);
  const name = (x, z) => (x < 6 ? 'Living room' : z < 3.2 ? 'Kitchen & dining' : 'Hall');
  g.rooms = rooms.map((pts, i) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const n = name(cx, cz);
    return { id: `g-room-${i}`, name: n, points: pts, floorKind: n === 'Kitchen & dining' ? 'tiles' : 'wood', floorColor: n === 'Kitchen & dining' ? '#e8e4dc' : '#c49a6c' };
  });
  g.placed = [
    { id: 'p-rug', itemId: 'i-rug', x: 3, z: 3.6, rot: 90, color: 'Cream' },
    { id: 'p-sofa', itemId: 'i-sofa', x: 3, z: 0.6, rot: 0, color: 'Sage green', y: 0.012 },
    { id: 'p-coffee', itemId: 'i-coffee', x: 3, z: 2.2, rot: 0, y: 0.012, color: 'Walnut' },
    { id: 'p-arm', itemId: 'i-armchair', x: 1.0, z: 3.3, rot: 90, y: 0.012, color: 'Cognac leather' },
    { id: 'p-tvstand', itemId: 'i-tvstand', x: 3, z: 7.66, rot: 180, color: 'Oak' },
    { id: 'p-tv', itemId: 'i-tv', x: 3, z: 7.66, rot: 180, y: 0.5, color: 'Black' },
    { id: 'p-lamp', itemId: 'i-lamp', x: 0.5, z: 0.5, rot: 0, color: 'Linen white' },
    { id: 'p-plant', itemId: 'i-plant', x: 5.5, z: 0.5, rot: 0, color: 'Terracotta pot' },
    { id: 'p-shelf', itemId: 'i-shelf', x: 5.8, z: 3.0, rot: 270, color: 'Oak' },
    { id: 'p-dining', itemId: 'i-dining', x: 7.6, z: 1.7, rot: 0, color: 'Oak' },
    { id: 'p-ch1', itemId: 'i-chair', x: 7.1, z: 0.95, rot: 0, color: 'Black' },
    { id: 'p-ch2', itemId: 'i-chair', x: 8.1, z: 0.95, rot: 0, color: 'Black' },
    { id: 'p-ch3', itemId: 'i-chair', x: 7.1, z: 2.45, rot: 180, color: 'Black' },
    { id: 'p-ch4', itemId: 'i-chair', x: 8.1, z: 2.45, rot: 180, color: 'Black' },
    { id: 'p-side', itemId: 'i-side', x: 9.6, z: 2.8, rot: 0, color: 'Walnut' },
  ];
}

// ----- First floor: bedroom (left), office (right back), landing (right front)
{
  const [back, right, front, left] = ext(f1);
  f1.walls.push({ id: 'f-mid', a: [5.6, 0], b: [5.6, 8], thickness: 0.12 });
  f1.walls.push({ id: 'f-off', a: [5.6, 2.8], b: [10, 2.8], thickness: 0.12 });
  f1.openings = [
    { id: 'f-bed-door', type: 'door', wall: 'f-mid', offset: 6.3, width: 0.9, height: 2.1, open: true },
    { id: 'f-office-door', type: 'door', wall: 'f-off', offset: 0.4, width: 0.9, height: 2.1, open: true },
    { id: 'f-win-back', type: 'window', wall: back, offset: 1.6, width: 2.0, height: 1.3, sill: 0.9 },
    { id: 'f-win-office', type: 'window', wall: back, offset: 7.0, width: 1.6, height: 1.3, sill: 0.9 },
    { id: 'f-win-left', type: 'window', wall: left, offset: 2.8, width: 1.4, height: 1.3, sill: 0.9 },
    { id: 'f-win-front', type: 'window', wall: front, offset: 6.2, width: 1.6, height: 1.3, sill: 0.9 },
  ];
  const rooms = detectRooms(f1);
  f1.rooms = rooms.map((pts, i) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const n = cx < 5.6 ? 'Bedroom' : cz < 2.8 ? 'Office' : 'Landing';
    return { id: `f-room-${i}`, name: n, points: pts, floorKind: n === 'Bedroom' ? 'carpet' : 'wood', floorColor: n === 'Bedroom' ? '#cfc6b8' : '#c49a6c' };
  });
  f1.placed = [
    { id: 'p-bed', itemId: 'i-bed', x: 2.8, z: 1.2, rot: 0, color: 'Light grey' },
    { id: 'p-n1', itemId: 'i-night', x: 1.6, z: 0.35, rot: 0, color: 'Oak' },
    { id: 'p-n2', itemId: 'i-night', x: 4.0, z: 0.35, rot: 0, color: 'Oak' },
    { id: 'p-wardrobe', itemId: 'i-wardrobe', x: 2.8, z: 7.58, rot: 180, color: 'White' },
    { id: 'p-dresser', itemId: 'i-dresser', x: 0.38, z: 5.0, rot: 90, color: 'Walnut' },
    { id: 'p-mirror', itemId: 'i-mirror', x: 5.5, z: 4.2, rot: 270, color: 'Brass' },
    { id: 'p-desk', itemId: 'i-desk', x: 7.8, z: 0.45, rot: 0, color: 'Oak' },
    { id: 'p-office', itemId: 'i-office', x: 7.8, z: 1.25, rot: 180, color: 'Black' },
    { id: 'p-pouf', itemId: 'i-pouf', x: 4.4, z: 3.4, rot: 0, color: 'Mustard' },
  ];
}

const out = normalize(d);
delete out.inventory;
out.updatedAt = '2026-01-01T00:00:00.000Z';
const ids = new Set(items.map((i) => i.id));
for (const f of out.floors) for (const p of f.placed) if (!ids.has(p.itemId)) throw new Error('missing ' + p.itemId);
const problems = validate({ ...out, inventory: items });
if (problems.length) throw new Error(problems.join('\n'));
fs.writeFileSync(path.join(ROOT, 'data', 'sample-house.json'), JSON.stringify(out, null, 2) + '\n');
console.log('sample-house.json:', out.floors.map((f) => `${f.name}: ${f.walls.length} walls, ${f.rooms.map((r) => r.name).join('/')}, ${f.placed.length} items`).join(' | '), 'elev', elevations(out));
