import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, NodeIO } from '@gltf-transform/core';
import { inspectGLB } from '../lib/glb.mjs';

test('counts the triangles of a .glb', async () => {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const p = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2, 1, 3, 2])).setBuffer(buffer));
  doc.createScene().addChild(doc.createNode('quad').setMesh(doc.createMesh('quad').addPrimitive(p)));
  const buf = Buffer.from(await new NodeIO().writeBinary(doc));
  const info = await inspectGLB(buf);
  assert.equal(info.triangles, 2);
  assert.equal(info.bytes, buf.length);
});
