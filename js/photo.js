// Photoreal still of the current view with three-gpu-pathtracer (physically based
// light bounces, soft shadows, glass). Cut-away walls are cut for real with CSG,
// because path tracing can't use clipping planes.
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.attributes = ['position', 'normal', 'uv'];

/** Temporarily replace clipped meshes with really-cut copies. Returns an undo function. */
function realCut(viewer) {
  const undo = [];
  const f = viewer.house.floors[viewer.activeFloor];
  const plane = f?.clipPlane;
  if (!f || !f.clipMaterials?.[0]?.clippingPlanes?.length) return () => {};
  const cutY = plane.constant;
  const cutter = new Brush(new THREE.BoxGeometry(500, 100, 500));
  cutter.position.set(0, cutY + 50, 0);
  cutter.updateMatrixWorld();
  f.group.updateMatrixWorld(true);
  const meshes = [];
  f.group.traverse((o) => o.isMesh && o.visible && !o.userData.helper && o.material?.clippingPlanes?.length && meshes.push(o));
  for (const m of meshes) {
    const box = new THREE.Box3().setFromObject(m);
    if (box.min.y >= cutY) {
      m.visible = false;
      undo.push(() => (m.visible = true));
      continue;
    }
    if (box.max.y <= cutY) continue;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const a = new Brush(geo);
    a.updateMatrixWorld();
    let cut;
    try {
      cut = evaluator.evaluate(a, cutter, SUBTRACTION);
    } catch {
      continue;
    }
    const mat = m.material.clone();
    mat.clippingPlanes = [];
    const rep = new THREE.Mesh(cut.geometry, mat);
    viewer.scene.add(rep);
    m.visible = false;
    undo.push(() => {
      m.visible = true;
      rep.removeFromParent();
      rep.geometry.dispose();
    });
  }
  return () => undo.forEach((f) => f());
}

/** Small equirectangular sky: bright zenith, soft horizon, warm ground bounce. */
function daylightSky() {
  const w = 128, h = 64;
  const data = new Float32Array(w * h * 4);
  const zenith = [0.75, 0.85, 1.05], horizon = [1.15, 1.12, 1.05], ground = [0.42, 0.38, 0.33];
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1); // 1 = up
    const el = v * 2 - 1; // −1..1
    for (let x = 0; x < w; x++) {
      const c = el > 0 ? zenith.map((z, i) => horizon[i] + (z - horizon[i]) * Math.pow(el, 0.6)) : ground.map((g, i) => horizon[i] * 0.6 + (g - horizon[i] * 0.6) * Math.min(1, -el * 4));
      const k = (y * w + x) * 4;
      data[k] = c[0] * 1.4;
      data[k + 1] = c[1] * 1.4;
      data[k + 2] = c[2] * 1.4;
      data[k + 3] = 1;
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.flipY = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Path-trace the current view. Calls onProgress(samples, target). Resolves to a PNG data URL,
 * or null if cancelled via `signal`.
 */
export async function renderPhoto(viewer, { samples = 300, onProgress, signal } = {}) {
  const hide = [];
  viewer.scene.traverse((o) => {
    if ((o.userData.helper || o === viewer.overlay || o.isCSS2DObject) && o.visible) {
      hide.push(o);
      o.visible = false;
    }
  });
  const restoreCut = realCut(viewer);
  // The path tracer needs an equirectangular sky; use a soft daylight gradient.
  const prevEnv = viewer.scene.environment, prevBg = viewer.scene.background, prevInt = viewer.scene.environmentIntensity;
  viewer.scene.environment = daylightSky();
  viewer.scene.environmentIntensity = 1;
  viewer.paused = true;
  const tracer = new WebGLPathTracer(viewer.renderer);
  tracer.tiles.set(2, 2);
  tracer.filterGlossyFactor = 0.5;
  tracer.minSamples = 1;
  tracer.renderScale = 1;
  const camera = viewer.camera;
  try {
    tracer.setScene(viewer.scene, camera);
    while (tracer.samples < samples) {
      if (signal?.aborted) return null;
      tracer.renderSample();
      onProgress?.(Math.floor(tracer.samples), samples);
      await new Promise((r) => requestAnimationFrame(r));
    }
    tracer.renderSample();
    return viewer.renderer.domElement.toDataURL('image/png');
  } finally {
    tracer.dispose();
    viewer.scene.environment.dispose();
    viewer.scene.environment = prevEnv;
    viewer.scene.background = prevBg;
    viewer.scene.environmentIntensity = prevInt;
    restoreCut();
    for (const o of hide) o.visible = true;
    viewer.paused = false;
  }
}
