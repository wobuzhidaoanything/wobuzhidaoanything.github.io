// Render page used by agent tools (tools/lib/render.mjs) through a headless browser.
//   preview.html?item=<itemId>&color=<name>      one furniture model, studio lighting
//   preview.html?design=<id>                     a house design (views: 3d:<floor>, plan:<floor>, exterior)
// Exposes window.preview = { ready, error, show(view), exportGLB() }.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildParametric, tintModel, DEFAULT_DIMS, CATEGORY_LABELS } from './models.js';
import { Viewer, fitModel } from './viewer.js';
import { migrate } from './design.js';

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const proxy = (u) => (/^https?:/i.test(u) && !u.startsWith(location.origin) ? `${location.origin}/asset?url=${encodeURIComponent(u)}` : u);
const api = (window.preview = { ready: false, error: null });
const get = async (url) => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};

async function itemMode(itemId) {
  const library = await get('api/library');
  const item = library.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No model "${itemId}" in the library`);
  const def = DEFAULT_DIMS[item.category] || [0.6, 0.6, 0.6];
  const dims = { w: item.dims?.w || def[0], d: item.dims?.d || def[1], h: item.dims?.h || def[2] };
  const color = item.colors?.find((c) => c.name === params.get('color')) || item.colors?.[0];

  const stage = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eceae6');
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a58a, 0.9));
  const span = Math.max(dims.w, dims.d, dims.h);
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
  sun.position.set(span * 1.2, span * 2.5 + 1, span * 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -span * 2, right: span * 2, top: span * 2, bottom: -span * 2 });
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(span * 4, 64), new THREE.MeshStandardMaterial({ color: 0xdedad3, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(span * 6, Math.round(span * 6), 0xb5b0a6, 0xcfcac2);
  grid.position.y = 0.001;
  scene.add(grid);

  let model = buildParametric({ category: item.category, dims, color, accent: item.accent, name: item.name, seed: item.id });
  let source = 'generated';
  if (item.modelUrl && item.useModel !== false) {
    try {
      const gltf = await new GLTFLoader().loadAsync(proxy(item.modelUrl));
      fitModel(gltf.scene, dims);
      tintModel(gltf.scene, item.colors?.length > 1 ? color?.hex : null);
      model = gltf.scene;
      source = 'store 3D model';
    } catch (err) {
      source = `generated (3D model failed to load: ${err.message || err})`;
    }
  }
  model.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  scene.add(model);

  const tag = document.getElementById('tag');
  tag.hidden = false;
  tag.innerHTML = `<b>${esc(item.name)}</b>
    <div class="row">${esc(CATEGORY_LABELS[item.category] || item.category)} · ${Math.round(dims.w * 100)} W × ${Math.round(dims.d * 100)} D × ${Math.round(dims.h * 100)} H cm</div>
    <div class="row"><span class="dot" style="background:${esc(color?.hex || '#ccc')}"></span>${esc(color?.name || 'Default')} · ${esc(source)}</div>`;

  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
  const dist = span * 2.6 + 0.4;
  const target = new THREE.Vector3(0, dims.h * 0.45, 0);
  const VIEWS = {
    'three-quarter': [dist * 0.7, dims.h * 0.9 + span * 0.6, dist * 0.8],
    front: [0, dims.h * 0.55, dist],
    side: [dist, dims.h * 0.55, 0],
    top: [0.001, dist * 1.2, 0.001],
  };
  api.show = async (view) => {
    camera.position.set(...(VIEWS[view] || VIEWS['three-quarter']));
    camera.lookAt(target);
    document.getElementById('viewName').textContent = `${view} view · grid = 1 m`;
    renderer.render(scene, camera);
  };
}

async function designMode(id) {
  const [design, library] = await Promise.all([get(`api/designs/${encodeURIComponent(id)}`).then(migrate), get('api/library')]);
  const viewer = new Viewer(document.getElementById('stage'), {});
  viewer.library = library.items;
  viewer.setAssetProxy(proxy);
  viewer.setDesign(design, { refit: true });
  for (let i = 0; i < 100 && [...viewer.items.values()].some((r) => r.loading); i++) await new Promise((r) => setTimeout(r, 100));
  const tag = document.getElementById('tag');
  api.show = async (spec) => {
    // spec: "3d:<floor>", "plan:<floor>" or "exterior"
    const [view, f] = spec.split(':');
    const floor = Math.max(0, Math.min(design.floors.length - 1, +(f ?? 0) || 0));
    if (view === 'exterior') {
      viewer.setView('3d');
      viewer.setWallMode('up');
      viewer.setActiveFloor(design.floors.length - 1, { animate: false });
      viewer.frameHouse(false);
    } else {
      viewer.setView(view === 'plan' ? 'plan' : '3d');
      viewer.setWallMode('cut');
      viewer.setActiveFloor(floor, { animate: false });
      viewer.frameHouse(false);
    }
    viewer.orbit.update(1);
    viewer.plan.update(1);
    tag.hidden = false;
    tag.innerHTML = `<b>${esc(design.name)}</b><div class="row">${view === 'exterior' ? 'Whole house, outside' : `${esc(design.floors[floor].name)} · ${view === 'plan' ? 'floor plan, walls cut at 1.25 m' : '3D, walls cut at 1.25 m'}`}</div>`;
    document.getElementById('viewName').textContent = spec;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  api.exportGLB = async () => {
    const { exportGLB } = await import('./export.js');
    const blob = await exportGLB(viewer);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  api.floors = design.floors.map((f) => f.name);
}

try {
  if (params.get('item')) await itemMode(params.get('item'));
  else await designMode(params.get('design'));
  api.ready = true;
} catch (err) {
  api.error = err.message || String(err);
  document.body.insertAdjacentHTML('beforeend', `<div class="tag">${esc(api.error)}</div>`);
}
