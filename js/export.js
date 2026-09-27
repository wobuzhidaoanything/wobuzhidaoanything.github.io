// Export the whole house as one .glb for Blender (File → Import → glTF 2.0).
// Metres, Y-up (Blender converts to Z-up on import). Objects are named and nested:
//   <House> › <Floor> › Slab, Rooms › <room floors>, Walls, Openings › Door/Window…, Stairs, Furniture › <items>
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildHouse } from './house.js';

export async function exportGLB(viewer, { roof = false } = {}) {
  const design = viewer.design;
  const { group, floors } = buildHouse(design, { roof });
  group.traverse((o) => o.userData.roof && (o.visible = roof));
  // Furniture: reuse what the viewer has built (including loaded store models), unclipped.
  for (const rec of viewer.items.values()) {
    const hf = floors[rec.floorIndex];
    if (!hf) continue;
    const copy = rec.group.clone(true);
    copy.name = uniqueName(hf.furniture, rec.item.name);
    copy.userData = { itemId: rec.item.id, placedId: rec.placed.id, color: rec.placed.color || null };
    copy.traverse((o) => {
      if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map(unclip) : unclip(o.material);
    });
    hf.furniture.add(copy);
  }
  // Lights don't transfer well to Blender; drop helper-only objects.
  const drop = [];
  group.traverse((o) => (o.isLight || o.userData.helper) && drop.push(o));
  for (const o of drop) o.removeFromParent();
  // Keep only small, useful tags as glTF "extras" (internal data such as collision lines
  // would otherwise bloat the file by megabytes)
  const KEEP = ['itemId', 'placedId', 'color', 'room', 'opening', 'stair', 'floorId', 'ceiling'];
  group.traverse((o) => {
    const u = o.userData || {};
    o.userData = Object.fromEntries(KEEP.filter((k) => u[k] != null && typeof u[k] !== 'object').map((k) => [k, u[k]]));
    if (o.geometry) o.geometry.userData = {};
    for (const m of [].concat(o.material || [])) m.userData = {};
  });
  group.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(group, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  return new Blob([glb], { type: 'model/gltf-binary' });
}

function unclip(m) {
  if (!m.clippingPlanes?.length) return m;
  const c = m.clone();
  c.clippingPlanes = [];
  return c;
}

function uniqueName(parent, name) {
  let n = name || 'Item', i = 2;
  while (parent.children.some((c) => c.name === n)) n = `${name} ${i++}`;
  return n;
}

export { THREE };
