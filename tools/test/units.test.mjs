import test from 'node:test';
import assert from 'node:assert/strict';
import { evalNumber, unitFromLabel } from '../../js/units.js';

test('plain numbers and decimals', () => {
  assert.equal(evalNumber('240', 'cm'), 240);
  assert.equal(evalNumber('2,4', 'm'), 2.4);
  assert.equal(evalNumber('.5'), 0.5);
  assert.equal(evalNumber(''), null);
  assert.equal(evalNumber('abc', 'cm'), null);
});

test('units convert to the field unit', () => {
  assert.equal(evalNumber('2.4 m', 'cm'), 240);
  assert.equal(evalNumber('2.4m', 'cm'), 240);
  assert.equal(evalNumber('850 mm', 'cm'), 85);
  assert.equal(evalNumber('90cm', 'm'), 0.9);
  assert.equal(evalNumber('1.2 m + 30 cm', 'cm'), 150);
});

test('arithmetic', () => {
  assert.equal(evalNumber('3 x 60', 'cm'), 180);
  assert.equal(evalNumber('3 × 60'), 180);
  assert.equal(evalNumber('(400 - 90) / 2', 'cm'), 155);
  assert.equal(evalNumber('-15'), -15);
  assert.equal(evalNumber('2 +'), null);
  assert.equal(evalNumber('(2'), null);
  assert.equal(evalNumber('1/0'), null);
});

test('unit from a label', () => {
  assert.equal(unitFromLabel('Length (cm)'), 'cm');
  assert.equal(unitFromLabel('Ceiling height (m)'), 'm');
  assert.equal(unitFromLabel('Rotate'), null);
});
