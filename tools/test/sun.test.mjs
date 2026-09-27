import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunPosition, sunTimes, sunVector } from '../../js/sun.js';

const deg = (r) => (r * 180) / Math.PI;

test('sun position matches known values (London, June solstice)', () => {
  const noon = sunPosition(new Date('2026-06-21T12:02:00Z'), 51.5, -0.12);
  assert.ok(Math.abs(deg(noon.altitude) - 62) < 0.5, deg(noon.altitude));
  assert.ok(Math.abs(deg(noon.bearing) - 180) < 2, deg(noon.bearing)); // due south
  const evening = sunPosition(new Date('2026-06-21T17:00:00Z'), 51.5, -0.12);
  assert.ok(deg(evening.bearing) > 240 && deg(evening.bearing) < 300); // west
  const t = sunTimes(new Date('2026-06-21T12:00:00Z'), 51.5, -0.12);
  assert.ok(t.rise && t.set && t.set - t.rise > 16 * 3600e3); // ~16.5 h of daylight
});

test('the sun vector turns with north: south is down the plan when north is up', () => {
  const v = sunVector({ altitude: 0.5, bearing: Math.PI }, 0);
  assert.ok(v[2] > 0.8 && Math.abs(v[0]) < 1e-9);
  const w = sunVector({ altitude: 0.5, bearing: Math.PI }, 90); // north points right → south points left
  assert.ok(w[0] < -0.8);
});
