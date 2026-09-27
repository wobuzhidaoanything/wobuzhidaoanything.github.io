// Reads .glb files for reports (triangle count). Store models are saved exactly as the shop
// provides them: nothing is compressed, simplified or resized.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

export const TRIANGLE_BUDGET = 200000; // what the app handles smoothly per item

export function countTriangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      if (p.getMode() === 4) n += (idx ? idx.getCount() : pos?.getCount() || 0) / 3;
    }
  return Math.round(n);
}

/** Triangle count, size and texture count of a .glb (shop files may use meshopt or Draco). */
export async function inspectGLB(input) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(input));
  return { triangles: countTriangles(doc), bytes: input.length, textures: doc.getRoot().listTextures().length };
}
