import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, NodeIO } from '@gltf-transform/core';
import { shrinkGLB, inspectGLB } from '../lib/shrink.mjs';

async function bloatedGLB(n = 60) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  // A dense grid (many triangles) repeated as 20 separate meshes with duplicate data, plus big extras
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) pos.push(i / n, Math.sin(i / 7) * 0.05, j / n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j;
      idx.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
    }
  const mat = doc.createMaterial('Fabric').setBaseColorFactor([0.6, 0.6, 0.5, 1]);
  for (let k = 0; k < 20; k++) {
    const p = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))
      .setMaterial(mat);
    const mesh = doc.createMesh(`part ${k}`).addPrimitive(p);
    scene.addChild(doc.createNode(`part ${k}`).setMesh(mesh).setTranslation([k, 0, 0]).setExtras({ junk: new Array(20000).fill(k) }));
  }
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

test('store models are cleaned and compressed under the budget; junk extras removed', async () => {
  const raw = await bloatedGLB();
  const r = await shrinkGLB(raw);
  assert.ok(r.after < raw.length / 3, `${raw.length} → ${r.after}`);
  assert.ok(r.after <= 5 * 1024 * 1024);
  const info = await inspectGLB(r.buf);
  assert.equal(info.triangles, 20 * 60 * 60 * 2); // 144k, under the triangle budget: nothing simplified
  assert.ok(!r.buf.toString('latin1').includes('junk'));
});

test('too many triangles get simplified down to the budget', async () => {
  const r = await shrinkGLB(await bloatedGLB(120), { budget: 5 * 1024 * 1024 }); // 576k triangles
  assert.ok(r.triangles <= 200000);
  const tight = await shrinkGLB(await bloatedGLB(), { budget: 150 * 1024 }).catch((e) => e);
  assert.ok(tight instanceof Error ? /write_model_component/.test(tight.message) : tight.after <= 150 * 1024);
});
