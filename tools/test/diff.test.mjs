import test from 'node:test';
import assert from 'node:assert/strict';
import { describeChange } from '../../js/diff.js';

const base = () => ({
  name: 'Home',
  floors: [{ id: 'f0', name: 'Ground floor', height: 2.7, slab: 0.15, walls: [{ id: 'w1', a: [0, 0], b: [4, 0] }], openings: [], stairs: [], rooms: [], placed: [{ id: 'p1', itemId: 'sofa', x: 1, z: 1 }] }],
});

test('describes added, moved and removed things', () => {
  const a = base();
  const b = base();
  b.floors[0].walls.push({ id: 'w2', a: [4, 0], b: [4, 3] });
  b.floors[0].placed[0].x = 2;
  b.floors[0].placed.push({ id: 'p2', itemId: 'lamp', x: 0, z: 0 });
  const names = { sofa: 'Sofa', lamp: 'Floor lamp' };
  assert.deepEqual(describeChange(a, b, (id) => names[id]), ['Ground floor: 1 wall added, Floor lamp added, Sofa moved or changed']);
});

test('floors and names', () => {
  const a = base();
  const b = base();
  b.name = 'Villa';
  b.floors.push({ ...base().floors[0], id: 'f1', name: 'Floor 1' });
  assert.deepEqual(describeChange(a, b), ['renamed to “Villa”', 'Floor 1 added']);
  assert.deepEqual(describeChange(a, base()), []);
});
