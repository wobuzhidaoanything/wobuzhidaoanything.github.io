import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHouse, wallFrame, area, closestOnSegment } from '../../js/design.js';
import { footprint, detectRooms } from '../../js/plan.js';
import { pushWall, makeRecess, splitWall, connectT, moveOpening, openingGaps, cleanFloor, syncRooms, moveCorner } from '../../js/edit.js';

const near = (a, b, tol = 0.011) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);
const house = () => {
  const d = newHouse({ width: 10, depth: 8, floors: 1 });
  const f = d.floors[0];
  f.rooms = [{ id: 'r1', name: 'Living', points: detectRooms(f)[0], floorKind: 'tiles', floorColor: '#eeeeee' }];
  return f;
};
const back = (f) => f.walls.find((w) => w.a[1] === 0 && w.b[1] === 0);
const footArea = (f) => footprint(f).reduce((s, p) => s + Math.abs(area(p[0].slice(0, -1))), 0);
// World position of an opening's start point
const worldStart = (f, o) => {
  const w = f.walls.find((x) => x.id === o.wall);
  const { dir } = wallFrame(w);
  return [w.a[0] + dir[0] * o.offset, w.a[1] + dir[1] * o.offset];
};

test('pushing a whole wall stretches its perpendicular neighbours (no jogs)', () => {
  const f = house();
  const w = back(f);
  pushWall(f, w.id, -1); // normal of the back wall points +z (inward), so −1 moves it out
  assert.equal(f.walls.length, 4);
  near(footArea(f), 10.25 * 9.25);
  assert.ok(f.walls.every((x) => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]) > 1));
});

test('a recess notches the wall inward with two new connecting walls, and rooms follow', () => {
  const f = house();
  const before = footArea(f);
  makeRecess(f, back(f).id, { start: 3, width: 2, depth: 0.8 });
  assert.equal(f.walls.length, 4 + 2 + 2); // back wall split in 3, plus 2 jog walls
  near(footArea(f), before - (2 - 0.25) * 0.8, 0.02); // walls are centre lines: the notch is width − thickness wide
  syncRooms(f);
  assert.equal(f.rooms.length, 1);
  assert.equal(f.rooms[0].name, 'Living'); // kept its name and finish
  assert.equal(f.rooms[0].floorKind, 'tiles');
  assert.ok(f.rooms[0].points.length >= 8, 'room outline has the notch');
});

test('a bay pushes outward and adds area', () => {
  const f = house();
  const before = footArea(f);
  makeRecess(f, back(f).id, { start: 3, width: 2, depth: -1 });
  near(footArea(f), before + (2 + 0.25) * 1, 0.02);
});

test('pushing a recess back to flush and cleaning restores the original 4 walls', () => {
  const f = house();
  const mid = makeRecess(f, back(f).id, { start: 3, width: 2, depth: 0.8 });
  const w = f.walls.find((x) => x.id === mid);
  const s = -Math.sign(wallFrame(w).normal[1]) * 0.8; // move back by the same depth
  pushWall(f, mid, s);
  const r = cleanFloor(f);
  assert.equal(f.walls.length, 4, JSON.stringify(f.walls.map((x) => [x.a, x.b])));
  assert.ok(r.removedWalls >= 2 && r.merged >= 2);
});

test('splitting never cuts through a door, and openings keep their place', () => {
  const f = house();
  const w = back(f);
  f.openings.push({ id: 'd', type: 'door', wall: w.id, offset: 4, width: 1, height: 2.1, sill: 0 });
  const before = worldStart(f, f.openings[0]);
  const nw = splitWall(f, w.id, 4.5); // inside the door → moved to its edge
  assert.ok(nw);
  const d = f.openings[0];
  assert.ok(d.offset >= 0 && d.offset + d.width <= Math.hypot(...[0, 1].map((i) => f.walls.find((x) => x.id === d.wall).b[i] - f.walls.find((x) => x.id === d.wall).a[i])) + 1e-6);
  near(worldStart(f, d)[0], before[0]);
});

test('T-junction: a wall ending on another wall splits it there', () => {
  const f = house();
  f.walls.push({ id: 'i', a: [5, 0], b: [5, 8], thickness: 0.12 });
  const nw = connectT(f, [5, 0], ['i']);
  assert.ok(nw);
  assert.equal(f.walls.length, 6);
  assert.equal(detectRooms(f).length, 2);
});

test('doors slide along walls, never overlap, and hop to another wall', () => {
  const f = house();
  const w = back(f);
  f.openings.push({ id: 'a', type: 'door', wall: w.id, offset: 2, width: 1, height: 2.1, sill: 0 });
  f.openings.push({ id: 'b', type: 'window', wall: w.id, offset: 5, width: 1.5, height: 1.3, sill: 0.9 });
  // Drag the door onto the window: it stops next to it instead of overlapping.
  assert.ok(moveOpening(f, 'a', [5.7, 0]));
  const a = f.openings.find((o) => o.id === 'a'), b = f.openings.find((o) => o.id === 'b');
  assert.ok(a.offset + a.width <= b.offset - 0.049 || a.offset >= b.offset + b.width + 0.049, JSON.stringify([a.offset, b.offset]));
  // Drag toward the right-hand wall: hops over.
  const right = f.walls.find((x) => x.a[0] === 10 && x.b[0] === 10);
  assert.ok(moveOpening(f, 'a', [10.1, 4]));
  assert.equal(a.wall, right.id);
  const g = openingGaps(f, 'a');
  near(g.left + g.right + a.width, g.wallLength);
  // Near a wall end it stays inside the wall.
  moveOpening(f, 'a', [10, -3], { reach: 5 });
  assert.ok(a.offset >= 0.05 - 1e-9);
});

test('shrinking a wall clamps its openings, or drops ones that no longer fit', () => {
  const f = house();
  const w = back(f);
  f.openings.push({ id: 'x', type: 'window', wall: w.id, offset: 7, width: 2, height: 1.3, sill: 0.9 });
  moveCorner(f, [10, 0], [6, 0]); // back wall now 6 m; the window was at 7–9 m
  let r = cleanFloor(f);
  const x = f.openings.find((o) => o.id === 'x');
  assert.ok(x && x.offset + x.width <= 6 - 0.049, JSON.stringify(x));
  assert.equal(r.droppedOpenings.length, 0);
  moveCorner(f, [6, 0], [0.3, 0]); // 30 cm wall: nothing fits
  r = cleanFloor(f);
  assert.equal(f.openings.length, 0);
  assert.equal(r.droppedOpenings.length, 1);
});

test('deleting a dividing wall merges rooms and keeps one name', () => {
  const f = house();
  f.walls.push({ id: 'i', a: [5, 0], b: [5, 8], thickness: 0.12 });
  syncRooms(f);
  assert.equal(f.rooms.length, 2);
  const names = f.rooms.map((r) => r.name);
  f.walls = f.walls.filter((w) => w.id !== 'i');
  syncRooms(f);
  assert.equal(f.rooms.length, 1);
  assert.ok(names.includes(f.rooms[0].name));
});

test('hand-drawn open-plan rooms survive when walls change elsewhere', () => {
  const f = house();
  f.walls = f.walls.slice(0, 3); // open on one side: nothing enclosed
  f.rooms = [{ id: 'o', name: 'Patio', points: [[0, 0], [3, 0], [3, 3], [0, 3]] }];
  syncRooms(f);
  assert.equal(f.rooms.length, 1);
  assert.equal(f.rooms[0].name, 'Patio');
});

test('a corner added on purpose (split) is kept by cleanup', () => {
  const f = house();
  splitWall(f, back(f).id, 4);
  cleanFloor(f);
  assert.equal(f.walls.length, 5);
});

test('moving a corner keeps walls that T into the moved walls attached', () => {
  const f = house();
  f.walls.push({ id: 'k', a: [6, 3], b: [10, 3], thickness: 0.12 }); // ends on the right wall
  f.walls.push({ id: 'i', a: [6, 0], b: [6, 8], thickness: 0.12 });
  const before = detectRooms(f).length;
  moveCorner(f, [10, 0], [11, -0.5]); // right wall now slants
  const k = f.walls.find((w) => w.id === 'k');
  const right = f.walls.find((w) => [w.a, w.b].some((p) => p[0] === 11) && [w.a, w.b].some((p) => p[0] === 10 && p[1] === 8));
  near(closestOnSegment(k.b, right.a, right.b).dist, 0);
  near(k.b[1], 3); // extended along its own direction
  assert.equal(detectRooms(f).length, before);
});

test('a recess whose edge lands on an interior T-junction keeps both rooms', () => {
  const f = house();
  f.walls.push({ id: 'i', a: [6, 0], b: [6, 8], thickness: 0.12 });
  syncRooms(f);
  makeRecess(f, back(f).id, { start: 4, width: 2, depth: 0.6 });
  cleanFloor(f);
  syncRooms(f);
  assert.equal(f.rooms.length, 2);
  assert.ok(f.rooms.every((r) => r.points.every((p, i, a) => { const q = a[(i + 1) % a.length], o = a[(i + a.length - 1) % a.length]; return Math.abs((p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])) > 1e-6; })), 'no collinear points');
});
