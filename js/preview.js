// Render page used by agents (via tools/lib/render.mjs) to see a model or the room.
//   preview.html?item=<itemId>&color=<name>   one inventory item, studio lighting
//   preview.html?room=1                       the whole room from data/project.json
// The page exposes window.preview.show(view) and sets window.preview.ready.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildParametric, tintModel, DEFAULT_DIMS, CATEGORY_LABELS } from './models.js';
import { Viewer } from './viewer.js';

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const proxy = (u) => (/^https?:/i.test(u) && !u.startsWith(location.origin) ? `${location.origin}/asset?url=${encodeURIComponent(u)}` : u);
const api = (window.preview = { ready: false, error: null, views: [] });

const project = await fetch('data/project.json', { cache: 'no-store' }).then((r) => r.json());

async function itemMode(itemId) {
  const item = project.inventory.find((i) => i.id === itemId);
  if (!item) throw new Error(`No inventory item "${itemId}"`);
  const def = DEFAULT_DIMS[item.category] || [0.6, 0.6, 0.6];
  const dims = { w: item.dims?.w || def[0], d: item.dims?.d || def[1], h: item.dims?.h || def[2] };
  const color = item.colors?.find((c) => c.name === params.get('color')) || item.colors?.[0];

  const stage = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  // 1 m grid so scale is readable in the render
  const grid = new THREE.GridHelper(span * 6, Math.round(span * 6), 0xb5b0a6, 0xcfcac2);
  grid.position.y = 0.001;
  scene.add(grid);

  let model = buildParametric({ category: item.category, dims, color, accent: item.accent, name: item.name, seed: item.id });
  let source = 'generated';
  if (item.modelUrl && item.useModel !== false) {
    try {
      const gltf = await new GLTFLoader().loadAsync(proxy(item.modelUrl));
      const m = gltf.scene;
      let box = new THREE.Box3().setFromObject(m);
      let size = box.getSize(new THREE.Vector3());
      if (Math.abs(size.z / size.x - dims.w / dims.d) < Math.abs(size.x / size.z - dims.w / dims.d) - 0.05) {
        m.rotation.y = Math.PI / 2;
        m.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(m);
        size = box.getSize(new THREE.Vector3());
      }
      m.scale.multiply(new THREE.Vector3(dims.w / (size.x || 1), dims.h / (size.y || 1), dims.d / (size.z || 1)));
      m.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(m);
      const c = box.getCenter(new THREE.Vector3());
      m.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
      tintModel(m, item.colors?.length > 1 ? color?.hex : null);
      model = m;
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
  api.views = Object.keys(VIEWS);
  api.show = async (view) => {
    const p = VIEWS[view] || VIEWS['three-quarter'];
    camera.position.set(...p);
    camera.lookAt(target);
    document.getElementById('viewName').textContent = `${view} view · grid = 1 m`;
    renderer.render(scene, camera);
  };
}

async function roomMode() {
  const stage = document.getElementById('stage');
  const viewer = new Viewer(stage, {});
  viewer.setAssetProxy(proxy);
  const room = project.room;
  viewer.setRoom({ ...room, openings: room.openings || [] });
  viewer.sync(project.placed || [], project.inventory || []);
  // Wait for store 3D models to finish loading.
  for (let i = 0; i < 100 && [...viewer.items.values()].some((r) => r.loading); i++) await new Promise((r) => setTimeout(r, 100));
  api.views = ['3d', 'plan', 'eye'];
  api.show = async (view) => {
    viewer.setView(view);
    document.getElementById('viewName').textContent = `${view} view`;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
}

try {
  if (params.get('item')) await itemMode(params.get('item'));
  else await roomMode();
  api.ready = true;
} catch (err) {
  api.error = err.message || String(err);
  document.body.insertAdjacentHTML('beforeend', `<div class="tag">${esc(api.error)}</div>`);
}
