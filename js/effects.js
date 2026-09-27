// Rendering quality: "high" adds N8AO ambient occlusion (soft contact shadows in
// corners and under furniture) and larger shadow maps; "low" is plain and fast.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';

export function setQuality(viewer, quality) {
  viewer.composer?.dispose?.();
  viewer.composer = null;
  const r = viewer.renderer;
  viewer.sun.shadow.mapSize.set(quality === 'high' ? 4096 : 1024, quality === 'high' ? 4096 : 1024);
  viewer.sun.shadow.map?.dispose();
  viewer.sun.shadow.map = null;
  r.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1));
  if (quality !== 'high') return viewer.resize();
  const w = viewer.container.clientWidth || 1, h = viewer.container.clientHeight || 1;
  const composer = new EffectComposer(r);
  const ao = new N8AOPass(viewer.scene, viewer.camera, w, h);
  ao.configuration.aoRadius = 0.9;
  ao.configuration.distanceFalloff = 0.35;
  ao.configuration.intensity = 2.2;
  ao.configuration.halfRes = true;
  ao.configuration.gammaCorrection = false;
  ao.setQualityMode('Medium');
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  // Follow camera switches (3D ↔ walk share the perspective camera).
  const render = composer.render.bind(composer);
  composer.render = (dt) => {
    ao.camera = viewer.camera;
    render(dt);
  };
  viewer.composer = composer;
  viewer.aoPass = ao;
  viewer.resize();
}
