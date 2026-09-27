import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHouse } from '../../js/design.js';
import { splitWall, moveCorner } from '../../js/edit.js';
import { finishAt, paintSpan, sideBreaks } from '../../js/house.js';

const house = () => newHouse({ width: 10, depth: 8, floors: 1 }).floors[0];
const back = (f) => f.walls.find((w) => w.a[1] === 0 && w.b[1] === 0);

test('one wall side can carry different finishes in different stretches', () => {
  const f = house();
  const w = back(f);
  paintSpan(w, 'l', { from: 0, to: 6, kind: 'wallpaper', color: '#d9cbb3' });
  paintSpan(w, 'l', { from: 6, to: 10, kind: 'tiles', color: '#7fa9b8' });
  assert.equal(finishAt(w, 'l', 3).kind, 'wallpaper');
  assert.equal(finishAt(w, 'l', 8).kind, 'tiles');
  assert.equal(finishAt(w, 'r', 8), null);
  // Painting over part of a span trims it
  paintSpan(w, 'l', { from: 2, to: 4, kind: 'paint', color: '#ffffff' });
  assert.deepEqual(w.finishes.l.map((s) => s.kind), ['wallpaper', 'paint', 'wallpaper', 'tiles']);
});

test('a T-junction splits a side into separately paintable stretches, only on its own side', () => {
  const f = house();
  f.walls.push({ id: 'i', a: [6, 0], b: [6, 8], thickness: 0.12 });
  const w = back(f);
  const side = (w.b[0] > w.a[0]) === true ? 'l' : 'r'; // the side facing +z (into the house)
  assert.ok(sideBreaks(f, w, 'l').includes(6) !== sideBreaks(f, w, 'r').includes(6));
  void side;
});

test('finish spans follow wall edits: split and moving the start corner', () => {
  const f = house();
  const w = back(f);
  paintSpan(w, 'l', { from: 6, to: 10, kind: 'tiles', color: '#7fa9b8' });
  const nw = splitWall(f, w.id, 5);
  assert.equal(finishAt(w, 'l', 2), null);
  assert.equal(finishAt(nw, 'l', 3).kind, 'tiles'); // world x = 8
  assert.equal(finishAt(nw, 'l', 0.5), null); // world x = 5.5
  moveCorner(f, [0, 0], [-1, 0]); // back wall start moves 1 m left: its spans shift by +1
  const w2 = f.walls.find((x) => x.id === w.id);
  assert.equal(w2.finishes.l, undefined);
});
