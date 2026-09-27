import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.ROOMCRAFT_USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'roomcraft-store-'));
const store = await import('../lib/store.mjs');
const { newHouse } = await import('../../js/design.js');

test('a save based on an old version is refused (no silent overwrite); versions go to History', () => {
  const d = newHouse({ name: 'Conflict test' });
  const v1 = store.saveDesign(d, { by: 'app' }).updatedAt;
  // An agent saves a change
  const agent = store.getDesign(d.id);
  agent.name = 'Changed by agent';
  store.saveDesign(agent, { by: 'agent' });
  // The app saves based on v1: refused, with the current version attached
  const mine = store.getDesign(d.id);
  mine.name = 'My change';
  assert.throws(() => store.saveDesign(mine, { by: 'app', base: v1 }), (e) => e instanceof store.ConflictError && e.current.name === 'Changed by agent');
  // History kept the version the agent replaced (different editor → always kept)
  const h = store.listHistory(d.id);
  assert.ok(h.length >= 1);
  assert.equal(store.getHistory(d.id, h[0].file).name, 'Conflict test');
  // Keeping your side explicitly
  store.keepHistory({ ...mine }, { force: true });
  assert.ok(store.listHistory(d.id).some((v) => v.name === 'My change'));
  assert.throws(() => store.getHistory(d.id, '../../etc/passwd'), /Invalid/);
  fs.rmSync(process.env.ROOMCRAFT_USERDATA, { recursive: true, force: true });
});
