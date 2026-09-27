import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, doorSwing, footprintRect, overlap } from '../../js/clearance.js';

const items = {
  sofa: { id: 'sofa', name: 'Sofa', category: 'sofa', dims: { w: 2.2, d: 0.9, h: 0.8 } },
  table: { id: 'table', name: 'Coffee table', category: 'coffeetable', dims: { w: 1.1, d: 0.6, h: 0.4 } },
  box: { id: 'box', name: 'Cabinet', category: 'box', dims: { w: 1.0, d: 0.5, h: 0.8 } },
  dining: { id: 'dining', name: 'Dining table', category: 'table', dims: { w: 1.6, d: 0.9, h: 0.75 } },
  chair: { id: 'chair', name: 'Chair', category: 'chair', dims: { w: 0.45, d: 0.5, h: 0.9 } },
};
const byId = (id) => items[id];
const dimsOf = (i) => i.dims;
const room = (placed, openings = []) => ({
  walls: [{ id: 'w1', a: [0, 0], b: [8, 0], thickness: 0.2 }, { id: 'w2', a: [8, 0], b: [8, 6], thickness: 0.2 }, { id: 'w3', a: [8, 6], b: [0, 6], thickness: 0.2 }, { id: 'w4', a: [0, 6], b: [0, 0], thickness: 0.2 }],
  openings,
  placed,
});

test('furniture in a door swing is flagged; moving it clear fixes it', () => {
  const door = { id: 'd', type: 'door', wall: 'w1', offset: 1, width: 0.9, height: 2.1, swing: 'out' }; // opens into the room (+z)
  const f = room([{ id: 'b', itemId: 'box', x: 1.5, z: 0.6, rot: 0 }], [door]);
  const sw = doorSwing(f, door);
  assert.ok(sw.length > 5);
  assert.equal(analyse(f, byId, dimsOf).filter((x) => x.kind === 'door').length, 1);
  f.placed[0].x = 4;
  assert.equal(analyse(f, byId, dimsOf).length, 0);
});

test('a coffee table too close to the sofa gets a use-zone warning with the real gap; pairs like chairs at a table do not', () => {
  const f = room([
    { id: 's', itemId: 'sofa', x: 4, z: 1, rot: 0 }, // front faces +z, front edge at z = 1.45
    { id: 'c', itemId: 'box', x: 4, z: 1.45 + 0.3 + 0.25, rot: 0 }, // 30 cm in front
  ]);
  const p = analyse(f, byId, dimsOf);
  assert.equal(p.length, 1);
  assert.match(p[0].message, /Only 30 cm in front of the sofa/);
  f.placed[1].itemId = 'table'; // a coffee table there is intended
  assert.equal(analyse(f, byId, dimsOf).length, 0);
  const g = room([{ id: 't', itemId: 'dining', x: 4, z: 3, rot: 0 }, { id: 'c1', itemId: 'chair', x: 4, z: 3.7, rot: 180 }]);
  assert.equal(analyse(g, byId, dimsOf).length, 0);
});

test('rotation is respected: a sofa turned to face +x has its zone on the +x side', () => {
  const r = footprintRect({ x: 2, z: 3, rot: 90 }, items.sofa.dims);
  const xs = r.map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 0.9) < 1e-9);
  const f = room([{ id: 's', itemId: 'sofa', x: 2, z: 3, rot: 90 }, { id: 'b', itemId: 'box', x: 2 + 0.45 + 0.2 + 0.25, z: 3, rot: 90 }]);
  assert.match(analyse(f, byId, dimsOf)[0].message, /20 cm in front/);
  assert.ok(overlap([[0, 0], [1, 0], [1, 1], [0, 1]], [[0.5, 0.5], [2, 0.5], [2, 2], [0.5, 2]]) > 0.4);
});
