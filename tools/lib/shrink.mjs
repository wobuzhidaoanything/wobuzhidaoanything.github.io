// Keeps 3D model files within the storage budget (realistic, but not huge).
//   1. clean up: weld, dedup, prune, merge primitives with the same material
//   2. shrink big textures (max 1024 px, JPEG/WebP) in the headless browser, since Node can't
//      decode images without native modules
//   3. simplify geometry (meshoptimizer) step by step only while the file is still too big
//   4. quantize + meshopt compression (the app has the decoder built in)
// Returns { buf, before, after, triangles, steps }.
import { Document, NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, meshopt, quantize, join, flatten, cloneDocument, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';

export const MODEL_BUDGET = 5 * 1024 * 1024; // 5 MB per model file
export const TRIANGLE_BUDGET = 200000; // what the app handles smoothly per item
const MAX_TEXTURE = 1024;

// Simplifying only rewrites indices; drop the vertices nothing uses any more
const compact = () => (doc) => {
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) if (p.getIndices()) compactPrimitive(p);
};

async function io() {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

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

/** Downscale textures over MAX_TEXTURE px using a browser page (canvas). */
async function shrinkTextures(doc, page) {
  const textures = doc.getRoot().listTextures().filter((t) => t.getImage()?.length > 150 * 1024);
  if (!textures.length || !page) return 0;
  let n = 0;
  for (const t of textures) {
    const img = t.getImage();
    const mime = t.getMimeType() || 'image/png';
    if (!/png|jpe?g|webp/.test(mime)) continue;
    const out = await page.evaluate(
      async ({ b64, mime, max }) => {
        const blob = await (await fetch(`data:${mime};base64,${b64}`)).blob();
        const bmp = await createImageBitmap(blob);
        const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * s));
        c.height = Math.max(1, Math.round(bmp.height * s));
        const g = c.getContext('2d');
        g.drawImage(bmp, 0, 0, c.width, c.height);
        // Keep transparency as PNG (webp keeps alpha and is smaller)
        const alpha = mime.includes('png') && g.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v < 250);
        const type = alpha ? 'image/webp' : 'image/jpeg';
        const url = c.toDataURL(type, 0.85);
        return { b64: url.split(',')[1], type };
      },
      { b64: Buffer.from(img).toString('base64'), mime, max: MAX_TEXTURE }
    );
    const buf = Buffer.from(out.b64, 'base64');
    if (buf.length < img.length) {
      t.setImage(new Uint8Array(buf)).setMimeType(out.type);
      if (out.type === 'image/webp') doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === 'EXT_texture_webp')).setRequired(true);
      n++;
    }
  }
  return n;
}

/**
 * Shrink a .glb to fit `budget` bytes. `page` (optional) is a Playwright page used to resize
 * textures. Throws if it can't get under the budget.
 */
export async function shrinkGLB(input, { budget = MODEL_BUDGET, page = null } = {}) {
  const nio = await io();
  const before = input.length;
  let doc = await nio.readBinary(new Uint8Array(input));
  doc.setLogger(new Logger(Logger.Verbosity.ERROR));
  const steps = [];
  // Custom data ("extras") can be megabytes of JSON the app never uses
  for (const p of [doc.getRoot(), ...doc.getRoot().listNodes(), ...doc.getRoot().listMeshes(), ...doc.getRoot().listMaterials(), ...doc.getRoot().listScenes(), ...doc.getRoot().listAccessors()]) p.setExtras({});
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setExtras({});
  await doc.transform(dedup(), flatten(), join(), weld(), compact(), prune());
  steps.push('cleaned');
  const tex = await shrinkTextures(doc, page);
  if (tex) steps.push(`${tex} texture${tex > 1 ? 's' : ''} resized to ≤${MAX_TEXTURE}px`);
  const encode = async (d) => {
    const copy = cloneDocument(d);
    await copy.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    return Buffer.from(await nio.writeBinary(copy));
  };
  let out = await encode(doc);
  let tris = countTriangles(doc);
  if (process.env.ROOMCRAFT_DEBUG) console.error('after clean + textures', out.length, tris, doc.getRoot().listTextures().map((t) => t.getImage().length));
  // Simplify only if needed, keeping as much detail as the budget allows
  for (const [ratio, error] of [[0.5, 0.002], [0.3, 0.005], [0.15, 0.01], [0.08, 0.02], [0.04, 0.04]]) {
    if (out.length <= budget && tris <= TRIANGLE_BUDGET) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }), compact(), prune());
    if (process.env.ROOMCRAFT_DEBUG) console.error('simplify', ratio, error, '→', countTriangles(doc));
    tris = countTriangles(doc);
    out = await encode(doc);
    steps.push(`simplified to ${Math.round(tris / 1000)}k triangles`);
  }
  if (out.length > budget) throw new Error(`The model is still ${(out.length / 1e6).toFixed(1)} MB after compressing (budget ${(budget / 1e6).toFixed(0)} MB). Build it with write_model_component instead.`);
  steps.push('compressed');
  return { buf: out, before, after: out.length, triangles: tris, steps };
}

/** Triangle count and size of a .glb (for reports). */
export async function inspectGLB(input) {
  const doc = await (await io()).readBinary(new Uint8Array(input));
  return { triangles: countTriangles(doc), bytes: input.length, textures: doc.getRoot().listTextures().length };
}

export { Document };
