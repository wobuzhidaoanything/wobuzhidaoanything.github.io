// Three.js (WebGL) viewer for a multi-floor house: rendering, floors, camera
// modes, selection, furniture dragging/rotating/stacking and structure dragging.
// Wall drawing and other editing tools live in tools.js; walking in walk.js.
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { buildParametric, tintModel, DEFAULT_DIMS } from './models.js';
import { buildHouse, wallUnion } from './house.js';
import { elevations, wallFrame, wallRect, pointInPolygon, closestOnSegment, area } from './design.js';
import { pushWall, moveCorner, moveOpening, openingGaps, wallsAt } from './edit.js';
import { buildDimensions, buildGrid, roomSize, fmtM } from './annotate.js';

// Fast raycasting everywhere (picking, walking) via bounding volume hierarchies.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

CameraControls.install({
  THREE: {
    Vector2: THREE.Vector2, Vector3: THREE.Vector3, Vector4: THREE.Vector4, Quaternion: THREE.Quaternion,
    Matrix4: THREE.Matrix4, Spherical: THREE.Spherical, Box3: THREE.Box3, Sphere: THREE.Sphere,
    Raycaster: THREE.Raycaster,
  },
});

const DEG = Math.PI / 180;
const CUT_HEIGHT = 1.25; // like an architectural plan cut
const STACK_BASES = new Set(['table', 'desk', 'coffeetable', 'sidetable', 'nightstand', 'dresser', 'sideboard', 'tvstand', 'bookshelf', 'rug', 'wardrobe']);
const BIG = new Set(['sofa', 'bed', 'wardrobe', 'table', 'desk', 'chair', 'armchair', 'dresser', 'sideboard', 'bookshelf']);

/** 'webgl2', 'webgl' or null: what this browser can render with. */
export function webglSupport() {
  try {
    const c = document.createElement('canvas');
    if (c.getContext('webgl2')) return 'webgl2';
    if (c.getContext('webgl') || c.getContext('experimental-webgl')) return 'webgl';
  } catch {}
  return null;
}

function label(className, text = '') {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

const planOf = (v) => [v.x, v.z];

export class Viewer {
  constructor(container, cb = {}) {
    this.container = container;
    this.cb = cb;
    this.design = null;
    this.house = null;
    this.activeFloor = 0;
    this.view = '3d';
    this.wallMode = 'cut';
    this.items = new Map(); // placedId → rec
    this.sel = null; // { type, id }
    this.modelCache = new Map();
    this.assetProxy = null;
    this.tool = null; // set by tools.js
    this.editMode = false;
    this.showAll = false;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#e9e6e1');
    this.pmrem = new THREE.PMREMGenerator(r);
    scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb9a58a, 0.9);
    this.hemi.name = 'Sky light';
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff3e0, 2.2));
    sun.name = 'Sun';
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    // Ground around the house
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: '#dcd8cf', roughness: 1 }));
    this.ground.name = 'Ground';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.2;
    this.ground.receiveShadow = true;
    this.ground.userData.helper = true;
    scene.add(this.ground);

    this.persp = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
    this.ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 400);
    this.camera = this.persp;
    this.orbit = new CameraControls(this.persp, r.domElement);
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.03;
    this.orbit.minDistance = 0.6;
    this.orbit.maxDistance = 120;
    this.orbit.dollyToCursor = true;
    this.orbit.smoothTime = 0.2;
    this.plan = new CameraControls(this.ortho, r.domElement);
    this.plan.enabled = false;
    this.plan.mouseButtons.left = CameraControls.ACTION.TRUCK;
    this.plan.mouseButtons.right = CameraControls.ACTION.TRUCK;
    this.plan.mouseButtons.wheel = CameraControls.ACTION.ZOOM;
    this.plan.touches.one = CameraControls.ACTION.TOUCH_TRUCK;
    this.plan.touches.two = CameraControls.ACTION.TOUCH_ZOOM_TRUCK;
    this.plan.minPolarAngle = this.plan.maxPolarAngle = 0.0001;
    this.plan.minAzimuthAngle = this.plan.maxAzimuthAngle = 0;
    this.plan.dollyToCursor = true;
    // Wall elevation: straight-on orthographic view of one wall (see setElevation)
    this.elevCam = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 100);
    this.elevControls = new CameraControls(this.elevCam, r.domElement);
    this.elevControls.enabled = false;
    this.elevControls.mouseButtons.left = CameraControls.ACTION.TRUCK;
    this.elevControls.mouseButtons.right = CameraControls.ACTION.TRUCK;
    this.elevControls.mouseButtons.wheel = CameraControls.ACTION.ZOOM;
    this.elevControls.dollyToCursor = true;
    this.elevControls.minZoom = 0.3;
    this.elevControls.maxZoom = 12;
    this.plan.minZoom = 0.2;
    this.plan.maxZoom = 12;
    this.controls = this.orbit;

    this.houseGroup = new THREE.Group();
    this.overlay = new THREE.Group();
    this.overlay.userData.helper = true;
    scene.add(this.houseGroup, this.overlay);

    // Selection visuals
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0x2f6fed);
    this.selBox.visible = false;
    this.selBox.userData.helper = true;
    this.overlay.add(this.selBox);
    const blue = { color: 0x2f6fed, transparent: true, opacity: 0.9, depthTest: false };
    this.rotRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), new THREE.MeshBasicMaterial({ ...blue, side: THREE.DoubleSide }));
    this.rotRing.rotation.x = -Math.PI / 2;
    this.rotKnob = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial(blue));
    this.rotGroup = new THREE.Group();
    this.rotGroup.add(this.rotRing, this.rotKnob);
    this.rotGroup.renderOrder = 20;
    this.rotRing.renderOrder = this.rotKnob.renderOrder = 20;
    this.rotGroup.visible = false;
    this.overlay.add(this.rotGroup);
    this.wallHighlight = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x2f6fed, transparent: true, opacity: 0.35, depthTest: false }));
    this.wallHighlight.renderOrder = 15;
    this.wallHighlight.visible = false;
    this.overlay.add(this.wallHighlight);
    this.handles = new THREE.Group();
    this.overlay.add(this.handles);
    this.multiBoxes = new THREE.Group();
    this.overlay.add(this.multiBoxes);
    // Box-select rectangle
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'box-select';
    container.appendChild(this.boxEl);
    this.pickBoxes = new THREE.Group();
    this.overlay.add(this.pickBoxes);
    this.wallLabels = new THREE.Group();
    scene.add(this.wallLabels);
    this.selLabel = label('dim-label');
    this.selLabel.visible = false;
    scene.add(this.selLabel);
    this.roomLabels = new THREE.Group();
    scene.add(this.roomLabels);
    // Display options (the View menu): dimension lines, room areas, grid, snapping
    this.display = { dims: false, areas: true, grid: true, snap: true, clear: true };
    this.clearGroup = new THREE.Group();
    this.clearGroup.userData.helper = true;
    scene.add(this.clearGroup);
    this.annot = new THREE.Group();
    this.annot.userData.helper = true;
    this.gridMesh = buildGrid();
    this.dimGroup = new THREE.Group();
    this.annot.add(this.gridMesh, this.dimGroup);
    scene.add(this.annot);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = false;
    this.pointer = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const el = r.domElement;
    this.listeners = [
      // Capture phase on the container: runs before the camera controls see the press, so a drag
      // on a wall, door or item never also pans or orbits the view.
      [container, 'pointerdown', (e) => (e.target === el || e.target.dataset?.pane) && this.onDown(e), true],
      [container, 'pointermove', (e) => (e.target === el || e.target.dataset?.pane) && this.onMove(e)],
      [window, 'pointerup', (e) => this.onUp(e)],
      [container, 'dblclick', (e) => (e.target === el || e.target.dataset?.pane) && this.onDblClick(e)],
      [el, 'contextmenu', (e) => e.preventDefault()],
    ];
    for (const [t, n, f, c] of this.listeners) t.addEventListener(n, f, !!c);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.timer = new THREE.Timer();
    this.frameHooks = new Set();
    r.setAnimationLoop((t) => this.frame(t));
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    for (const [t, n, f, c] of this.listeners) t.removeEventListener(n, f, !!c);
    this.resizeObserver.disconnect();
    this.orbit.dispose();
    this.plan.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  resize() {
    const W = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(W, h);
    // Split view: plan on the left half, 3D on the right half
    const w = this.split ? Math.floor(W / 2) : W;
    this.labels.setSize(w, h);
    this.persp.aspect = (this.split ? W - w : W) / h;
    this.persp.updateProjectionMatrix();
    const span = this.span || 12;
    const s = Math.max(span / w, span / h) * 1.15;
    Object.assign(this.ortho, { left: (-w * s) / 2, right: (w * s) / 2, top: (h * s) / 2, bottom: (-h * s) / 2 });
    this.ortho.updateProjectionMatrix();
    if (this.view === 'elevation') this.fitElevation();
    this.composer?.setSize(w, h);
  }

  setAssetProxy(fn) {
    this.assetProxy = fn;
  }

  // ---------- design ----------

  get floorY() {
    return this.house?.elevations[this.activeFloor] ?? 0;
  }

  get activeFloorData() {
    return this.design?.floors[this.activeFloor];
  }

  /** Rebuild the house when structure changed; always resync furniture. */
  setDesign(design, { refit = false, force = false } = {}) {
    const first = !this.design;
    this.design = design;
    this.activeFloor = Math.min(this.activeFloor, design.floors.length - 1);
    const sig = JSON.stringify([design.wallColor, design.floors.map((f) => [f.height, f.slab, f.walls, f.openings, f.rooms, f.stairs])]);
    if (force || sig !== this.houseSig) {
      this.houseSig = sig;
      this.rebuildHouse();
    }
    this.syncFurniture();
    if (first || refit) this.frameHouse(false);
  }

  rebuildHouse() {
    for (const rec of this.items.values()) rec.group.removeFromParent();
    this.houseGroup.traverse((o) => {
      if (o.isMesh && !o.userData.keep) {
        o.geometry.disposeBoundsTree?.();
        o.geometry.dispose();
      }
    });
    this.houseGroup.clear();
    this.house = buildHouse(this.design, { roof: this.view === 'walk' });
    this.houseGroup.add(this.house.group);
    // Per-floor material copies so each floor can be cut away independently.
    for (const f of this.house.floors) {
      const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), f.y0 + CUT_HEIGHT);
      f.clipPlane = plane;
      const clones = new Map();
      f.group.traverse((o) => {
        if (!o.isMesh || f.furniture === o || isInside(o, f.furniture)) return;
        const one = (m) => {
          if (!clones.has(m)) {
            const c = m.clone();
            c.clippingPlanes = [];
            clones.set(m, c);
          }
          return clones.get(m);
        };
        o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
      });
      f.clipMaterials = [...clones.values()];
      for (const w of f.walkables) w.geometry.computeBoundsTree?.();
      f.wallMesh?.geometry.computeBoundsTree?.();
      // Cap covering the cut wall tops so cut walls read as solid
      const u = wallUnion(this.design.floors[f.index]);
      if (u.length) {
        const shapes = u.map((poly) => {
          const s = new THREE.Shape(poly[0].slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z)));
          for (const h of poly.slice(1)) s.holes.push(new THREE.Path(h.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z))));
          return s;
        });
        const cap = new THREE.Mesh(new THREE.ShapeGeometry(shapes), new THREE.MeshBasicMaterial({ color: '#4a4d52' }));
        cap.rotation.x = -Math.PI / 2;
        cap.position.y = f.y0 + CUT_HEIGHT;
        cap.name = 'Wall cut';
        cap.userData.helper = true;
        f.cap = cap;
        f.group.add(cap);
      }
    }
    // Frame shadows and orthographic plan to the house size.
    const box = new THREE.Box3().setFromObject(this.house.group);
    if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(8, 3, 8));
    this.bounds = box;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    this.span = Math.max(size.x, size.z, 4);
    const sc = this.sun.shadow.camera;
    Object.assign(sc, { left: -this.span, right: this.span, top: this.span, bottom: -this.span, near: 0.5, far: size.y + this.span * 4 + 20 });
    sc.updateProjectionMatrix();
    this.sun.position.set(c.x + this.span * 0.6, box.max.y + this.span * 1.2 + 4, c.z + this.span * 0.9);
    this.sun.target.position.set(c.x, 0, c.z);
    this.ground.position.set(c.x, (this.house.elevations[0] ?? 0) - (this.design.floors[0]?.slab ?? 0.15) - 0.002, c.z);
    this.resize();
    this.applyFloorVisibility();
    this.refreshRoomLabels();
    this.refreshEditOverlay();
    this.updateSelection();
  }

  frameHouse(animate = true) {
    const box = this.bounds;
    if (!box) return;
    const c = box.getCenter(new THREE.Vector3());
    const y = this.floorY;
    // Narrow views (split view) step back so the whole house still fits
    const s = this.span * Math.max(1, 1 / Math.sqrt(this.persp.aspect || 1));
    this.orbit.setLookAt(c.x + s * 0.55, y + s * 0.95 + 2, c.z + s * 1.2, c.x, y + 0.8, c.z, animate);
    this.plan.setLookAt(c.x, y + 50, c.z, c.x, y, c.z, animate);
    this.plan.zoomTo(1, animate);
  }

  setActiveFloor(i, { animate = true } = {}) {
    if (!this.design) return;
    i = Math.max(0, Math.min(this.design.floors.length - 1, i));
    const dy = (this.house.elevations[i] ?? 0) - this.floorY;
    this.activeFloor = i;
    if (this.sel?.type !== 'item' || this.items.get(this.sel.id)?.floorIndex !== i) this.select(null);
    this.applyFloorVisibility();
    this.refreshRoomLabels();
    this.refreshEditOverlay();
    if (this.view === 'walk') return;
    for (const c of [this.orbit, this.plan]) {
      const pos = c.getPosition(new THREE.Vector3());
      const tgt = c.getTarget(new THREE.Vector3());
      c.setLookAt(pos.x, pos.y + dy, pos.z, tgt.x, tgt.y + dy, tgt.z, animate);
    }
  }

  setWallMode(mode) {
    this.wallMode = mode;
    this.applyFloorVisibility();
    this.refreshEditOverlay();
    this.updateSelection();
  }

  /** Floors above the active one are hidden; the active floor is cut at plan height (or full). */
  applyFloorVisibility() {
    if (!this.house) return;
    const walk = this.view === 'walk';
    const all = this.showAll && !walk;
    for (const f of this.house.floors) {
      const above = f.index > this.activeFloor;
      f.group.visible = walk || all || !above;
      const cut = !walk && !all && f.index === this.activeFloor && (this.view === 'plan' || (this.wallMode === 'cut' && this.view !== 'elevation'));
      for (const m of f.clipMaterials || []) m.clippingPlanes = cut ? [f.clipPlane] : [];
      if (f.cap) f.cap.visible = cut;
    }
    this.house.group.traverse((o) => {
      if (o.userData.roof) o.visible = walk || all;
    });
    // Door swings are drawn for the floor being edited only (lower floors show through outside the slab)
    for (const f of this.house.floors)
      f.group.traverse((o) => {
        if (o.userData.planOnly) o.visible = this.view === 'plan' && !all && f.index === this.activeFloor;
      });
  }

  setShowAll(on) {
    this.showAll = on;
    if (on) this.select(null);
    this.applyFloorVisibility();
    this.refreshRoomLabels();
    this.refreshEditOverlay();
  }

  /** Edit mode: furniture fades and can't be picked, so structure is always easy to grab. */
  setEditMode(on) {
    this.editMode = on;
    for (const rec of this.items.values()) this.ghost(rec, on);
    if (this.sel?.type === 'item' && on) this.select(null);
    this.refreshEditOverlay();
  }

  ghost(rec, on) {
    rec.group.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (on && !m.userData.ghost) {
          m.userData.ghost = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
          Object.assign(m, { transparent: true, opacity: m.opacity * 0.22, depthWrite: false });
          m.needsUpdate = true;
        } else if (!on && m.userData.ghost) {
          Object.assign(m, m.userData.ghost);
          delete m.userData.ghost;
          m.needsUpdate = true;
        }
      }
      o.castShadow = !on;
    });
  }

  /** Corner handles, wall lengths and opening pick boxes for the active floor (edit mode). */
  refreshEditOverlay() {
    this.handles.clear();
    this.pickBoxes.clear();
    this.wallLabels.clear();
    const floor = this.activeFloorData;
    if (!this.editMode || !floor || !this.house || this.view === 'walk' || this.view === 'elevation' || this.showAll) return;
    const y0 = this.floorY;
    const top = y0 + (this.view === 'plan' || this.wallMode === 'cut' ? CUT_HEIGHT : floor.height) + 0.03;
    const seen = [];
    for (const w of floor.walls) {
      for (const p of [w.a, w.b]) {
        if (seen.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01)) continue;
        seen.push(p);
        this.handles.add(this.handle(p, top, { corner: p.slice() }));
      }
      const { len, normal } = wallFrame(w);
      const l = label('wall-label');
      l.element.textContent = fmtM(len);
      const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
      l.position.set(mx + normal[0] * (w.thickness / 2 + 0.22), top, mz + normal[1] * (w.thickness / 2 + 0.22));
      this.wallLabels.add(l);
    }
    const inv = new THREE.MeshBasicMaterial({ visible: false });
    for (const o of floor.openings) {
      const w = floor.walls.find((x) => x.id === o.wall);
      if (!w) continue;
      const { dir } = wallFrame(w);
      const h = Math.min(o.height, top - y0 - (o.type === 'window' ? o.sill : 0));
      const box = new THREE.Mesh(new THREE.BoxGeometry(o.width, Math.max(0.3, h + 0.2), w.thickness + 0.14), inv);
      const u = o.offset + o.width / 2;
      box.position.set(w.a[0] + dir[0] * u, y0 + (o.type === 'window' ? o.sill : 0) + h / 2, w.a[1] + dir[1] * u);
      box.rotation.y = Math.atan2(-dir[1], dir[0]);
      box.userData.opening = o.id;
      this.pickBoxes.add(box);
    }
  }

  // ---------- furniture ----------

  dimsOf(item) {
    const def = DEFAULT_DIMS[item.category] || [0.6, 0.6, 0.6];
    return { w: item.dims?.w || def[0], d: item.dims?.d || def[1], h: item.dims?.h || def[2] };
  }

  syncFurniture() {
    const d = this.design;
    if (!d || !this.house) return;
    const byId = new Map((this.library || d.inventory || []).map((i) => [i.id, i]));
    const seen = new Set();
    d.floors.forEach((floor, fi) => {
      const hf = this.house.floors[fi];
      for (const p of floor.placed) {
        const item = byId.get(p.itemId);
        if (!item) continue;
        seen.add(p.id);
        const color = item.colors?.find((c) => c.name === p.color) || (p.color?.startsWith?.('#') ? { name: p.color, hex: p.color } : item.colors?.[0]);
        const sig = JSON.stringify([item.category, item.dims, color?.hex, item.accent, item.modelUrl, item.name, item.useModel, item.component, item.componentVersion]);
        let rec = this.items.get(p.id);
        if (!rec || rec.sig !== sig) {
          rec?.group.removeFromParent();
          rec = this.buildItem(p, item, color, sig);
          this.items.set(p.id, rec);
        }
        if (rec.group.parent !== hf.furniture) hf.furniture.add(rec.group);
        Object.assign(rec, { placed: p, item, floorIndex: fi });
        rec.group.position.set(p.x, hf.y0 + (p.y || 0), p.z);
        rec.group.rotation.y = (p.rot || 0) * DEG;
      }
    });
    for (const [id, rec] of this.items) {
      if (!seen.has(id)) {
        rec.group.removeFromParent();
        this.items.delete(id);
      }
    }
    if (this.sel?.type === 'item' && !this.items.has(this.sel.id)) this.select(null);
    if (this.sel?.type === 'items') {
      const ids = this.sel.ids.filter((id) => this.items.has(id));
      if (ids.length !== this.sel.ids.length) this.select(ids.length > 1 ? { type: 'items', ids } : ids.length ? { type: 'item', id: ids[0] } : null);
    }
    this.updateSelection();
  }

  buildItem(p, item, color, sig) {
    const group = new THREE.Group();
    group.name = item.name;
    group.userData.placedId = p.id;
    const dims = this.dimsOf(item);
    const model = buildParametric({ category: item.category, dims, color, accent: item.accent, name: item.name, seed: item.id });
    model.traverse((o) => o.isMesh && o.geometry.computeBoundsTree?.());
    group.add(model);
    const rec = { group, sig, dims, loading: false };
    if (this.editMode) queueMicrotask(() => this.ghost(rec, true));
    if (item.component && item.useModel !== false) {
      // A model written as a React Three Fiber component (userdata/models/<id>.jsx)
      rec.loading = true;
      import('./r3f-host.js')
        .then((h) => h.itemComponentModel(item, dims, color))
        .then((m) => {
          if (this.items.get(p.id) !== rec) return;
          m.traverse((o) => o.isMesh && o.geometry.computeBoundsTree?.());
          model.removeFromParent();
          group.add(m);
          if (this.editMode) this.ghost(rec, true);
          rec.loading = false;
          this.updateSelection();
        })
        .catch((err) => {
          rec.loading = false;
          console.warn('Model component failed, keeping the generated model', err);
          this.cb.onModelError?.(item, err);
        });
    } else if (item.modelUrl && item.useModel !== false) {
      rec.loading = true;
      this.loadModel(item.modelUrl)
        .then((scene) => {
          if (this.items.get(p.id) !== rec) return;
          const m = scene.clone(true);
          fitModel(m, dims);
          tintModel(m, item.colors?.length > 1 ? color?.hex : null);
          m.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = o.receiveShadow = true;
              o.geometry.computeBoundsTree?.();
            }
          });
          model.removeFromParent();
          group.add(m);
          if (this.editMode) this.ghost(rec, true);
          rec.loading = false;
          this.updateSelection();
        })
        .catch((err) => {
          rec.loading = false;
          console.warn('3D model failed, keeping the generated model', err);
          this.cb.onModelError?.(item, err);
        });
    }
    return rec;
  }

  loadModel(url) {
    if (!this.modelCache.has(url)) {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((u) => (this.assetProxy ? this.assetProxy(u) : u));
      const loader = new GLTFLoader(manager);
      // Store models are often compressed; these decoders ship with three.js.
      const draco = new DRACOLoader().setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
      loader.setDRACOLoader(draco);
      loader.setKTX2Loader(new KTX2Loader().setTranscoderPath('./vendor/three/examples/jsm/libs/basis/').detectSupport(this.renderer));
      loader.setMeshoptDecoder(MeshoptDecoder);
      this.modelCache.set(
        url,
        loader.loadAsync(url).then((g) => g.scene).catch((e) => {
          this.modelCache.delete(url);
          throw e;
        })
      );
    }
    return this.modelCache.get(url);
  }

  // ---------- selection ----------

  /** Ids of the selected furniture (one or several). */
  selectedItems() {
    return this.sel?.type === 'item' ? [this.sel.id] : this.sel?.type === 'items' ? [...this.sel.ids] : [];
  }

  select(sel) {
    this.sel = sel || null;
    this.updateSelection();
    this.cb.onSelect?.(this.sel);
  }

  updateSelection() {
    const s = this.sel;
    this.selBox.visible = this.rotGroup.visible = this.selLabel.visible = this.wallHighlight.visible = false;
    this.multiBoxes.clear();
    if (!s || !this.house) return;
    if (s.type === 'items') {
      const all = new THREE.Box3();
      for (const id of s.ids) {
        const rec = this.items.get(id);
        if (!rec) continue;
        rec.group.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(rec.group).expandByScalar(0.01);
        const h = new THREE.Box3Helper(b, rec.placed.locked ? 0x8a8f98 : 0x2f6fed);
        h.userData.helper = true;
        this.multiBoxes.add(h);
        all.union(b);
      }
      if (!all.isEmpty()) {
        const c = all.getCenter(new THREE.Vector3());
        this.selLabel.element.textContent = `${s.ids.length} items selected`;
        this.selLabel.position.set(c.x, all.max.y + 0.15, c.z);
        this.selLabel.visible = true;
      }
      return;
    }
    const floor = this.design.floors[this.activeFloor];
    const y0 = this.floorY;
    if (s.type === 'item') {
      const rec = this.items.get(s.id);
      if (!rec) return;
      rec.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rec.group);
      this.selBox.box.copy(box.expandByScalar(0.01));
      this.selBox.visible = true;
      const d = rec.dims;
      const r = Math.hypot(d.w, d.d) / 2 + 0.12;
      this.rotRing.scale.setScalar(r);
      this.rotKnob.scale.setScalar(Math.max(0.045, r * 0.06));
      const a = rec.group.rotation.y;
      this.rotKnob.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      this.rotGroup.position.set(rec.group.position.x, rec.group.position.y + 0.015, rec.group.position.z);
      this.rotGroup.visible = this.view !== 'walk' && this.view !== 'elevation';
      this.selLabel.element.textContent = `${Math.round(d.w * 100)} × ${Math.round(d.d * 100)} × ${Math.round(d.h * 100)} cm`;
      this.selLabel.position.set(rec.group.position.x, box.max.y + 0.12, rec.group.position.z);
      this.selLabel.visible = true;
    } else if (s.type === 'wall') {
      const w = floor?.walls.find((x) => x.id === s.id);
      if (!w) return;
      const rect = wallRect(w, false);
      const shape = new THREE.Shape(rect.map(([x, z]) => new THREE.Vector2(x, -z)));
      const h = this.view === 'plan' || this.wallMode === 'cut' ? CUT_HEIGHT : floor.height;
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h + 0.02, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      this.wallHighlight.geometry.dispose();
      this.wallHighlight.geometry = geo;
      this.wallHighlight.position.y = y0 - 0.01;
      this.wallHighlight.visible = true;
      const { len } = wallFrame(w);
      this.selLabel.element.textContent = `${Math.round(len * 100)} cm`;
      this.selLabel.position.set((w.a[0] + w.b[0]) / 2, y0 + h + 0.25, (w.a[1] + w.b[1]) / 2);
      this.selLabel.visible = true;
    }
    if (s.type === 'opening') {
      const g = openingGaps(floor, s.id);
      const o = floor.openings.find((x) => x.id === s.id);
      const w = o && floor.walls.find((x) => x.id === o.wall);
      if (g && w) {
        const { dir } = wallFrame(w);
        const u = o.offset + o.width / 2;
        this.selLabel.element.textContent = `◂ ${Math.round(g.left * 100)}   ·   ${Math.round(o.width * 100)} wide   ·   ${Math.round(g.right * 100)} ▸`;
        this.selLabel.position.set(w.a[0] + dir[0] * u, y0 + (this.view === 'plan' || this.wallMode === 'cut' ? CUT_HEIGHT : o.sill + o.height) + 0.3, w.a[1] + dir[1] * u);
        this.selLabel.visible = true;
      }
    }
    if (s.type === 'opening' || s.type === 'stairs') {
      let obj = null;
      this.house.floors[this.activeFloor]?.group.traverse((o) => {
        if ((s.type === 'opening' && o.userData.opening === s.id) || (s.type === 'stairs' && o.userData.stair === s.id)) obj = o;
      });
      if (!obj) return;
      this.selBox.box.setFromObject(obj).expandByScalar(0.03);
      if (this.view === 'plan' || this.wallMode === 'cut') this.selBox.box.max.y = Math.min(this.selBox.box.max.y, y0 + CUT_HEIGHT);
      this.selBox.visible = true;
      if (s.type === 'stairs') {
        const L = obj.userData.layout;
        this.selLabel.element.textContent = `${L.n} steps · ${Math.round(L.riser * 1000)} mm rise · ${Math.round(L.going * 1000)} mm tread`;
        const c = this.selBox.box.getCenter(new THREE.Vector3());
        this.selLabel.position.set(c.x, this.selBox.box.max.y + 0.2, c.z);
        this.selLabel.visible = true;
      }
    } else if (s.type === 'room') {
      const r = floor?.rooms.find((x) => x.id === s.id);
      if (!r) return;
      const pts = r.points;
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      this.wallHighlight.geometry.dispose();
      this.wallHighlight.geometry = geo;
      this.wallHighlight.position.y = y0 + 0.01;
      this.wallHighlight.visible = true;
    }
  }

  handle([x, z], y, data) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    const ring = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), new THREE.MeshBasicMaterial({ color: 0x2f6fed, depthTest: false }));
    ring.renderOrder = 21;
    m.renderOrder = 22;
    const g = new THREE.Group();
    g.add(ring, m);
    g.position.set(x, y, z);
    g.userData.handle = data;
    m.userData.handle = ring.userData.handle = data;
    return g;
  }

  /** Snap step for dragging and drawing (0 = free). Alt always drags freely. */
  snapStep(e) {
    return this.display.snap && !e?.altKey ? 0.05 : 0;
  }

  setDisplay(key, on) {
    this.display[key] = on;
    this.refreshRoomLabels();
  }

  /** Grid and dimension lines for the active floor. */
  refreshAnnotations() {
    this.dimGroup.clear();
    const show = !!this.design && !!this.house && this.view !== 'walk' && this.view !== 'elevation' && !this.showAll;
    this.annot.visible = show;
    if (!show) return;
    const y = this.floorY;
    const c = this.bounds ? this.bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const size = (this.span || 12) + 40;
    this.gridMesh.visible = this.display.grid;
    this.gridMesh.position.set(c.x, y + 0.006, c.z);
    this.gridMesh.scale.set(size, size, 1);
    if (this.display.dims) this.dimGroup.add(buildDimensions(this.activeFloorData, y + 0.012));
  }

  /**
   * Clearance overlay: `zones` (use zones of the selected/dragged items, plan polygons),
   * `swings` (door swing areas, drawn while furniture is moved) and `problems` (placed ids to outline in red).
   */
  setClearance(c) {
    this.clearGroup.clear();
    if (!c || this.view === 'walk' || this.showAll) return;
    const y = this.floorY + 0.015;
    const fill = (poly, color, opacity) => {
      const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.renderOrder = 3;
      m.raycast = () => {};
      this.clearGroup.add(m);
    };
    const outline = (poly, color) => {
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map(([x, z]) => new THREE.Vector3(x, y + 0.004, z))), new THREE.LineBasicMaterial({ color, depthTest: false }));
      l.renderOrder = 13;
      this.clearGroup.add(l);
    };
    for (const z of c.zones || []) fill(z.poly, z.bad ? 0xd14343 : 0x2f9e6b, z.bad ? 0.22 : 0.14);
    for (const sw of c.swings || []) fill(sw.poly, sw.bad ? 0xd14343 : 0x5b6068, sw.bad ? 0.25 : 0.08);
    for (const poly of c.problems || []) outline(poly, 0xd14343);
  }

  refreshRoomLabels() {
    this.roomLabels.clear();
    this.refreshAnnotations();
    if (!this.design || this.view === 'walk' || this.view === 'elevation' || this.showAll) return;
    const floor = this.design.floors[this.activeFloor];
    for (const r of floor?.rooms || []) {
      if (!r.name) continue;
      const a = Math.abs(area(r.points));
      const [cx, cz] = labelPoint(r.points);
      const l = label('room-label');
      const size = this.display.dims && roomSize(r.points);
      l.element.innerHTML = `<b>${escapeHtml(r.name)}</b>${this.display.areas ? `<span>${a.toFixed(1)} m²</span>` : ''}${size ? `<span>${size[0].toFixed(2)} × ${size[1].toFixed(2)} m</span>` : ''}`;
      l.position.set(cx, this.floorY + 0.05, cz);
      this.roomLabels.add(l);
    }
  }

  // ---------- views ----------

  /**
   * Look straight at one wall of the active floor from `side` (+1 = its normal side, -1 = the other),
   * flat (no perspective). Only what's within `depth` metres in front of the wall is drawn, so the
   * walls behind the camera don't get in the way.
   */
  setElevation(wallId, side = 1, depth = 3.2) {
    const f = this.activeFloorData;
    const w = f?.walls.find((x) => x.id === wallId);
    if (!w) return false;
    const { dir, normal, len } = wallFrame(w);
    const n = [normal[0] * side, normal[1] * side];
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    const y0 = this.floorY, H = f.height;
    const D = 40;
    this.elev = { wallId, side, n, dir, len, a: w.a, t: w.thickness, y0, H, depth };
    const cam = this.elevCam;
    cam.near = D - depth;
    cam.far = D - w.thickness / 2 + 0.03; // stop at the wall's face
    this.setView('elevation');
    this.fitElevation();
    const cy = y0 + H / 2;
    this.elevControls.setLookAt(mid[0] + n[0] * D, cy, mid[1] + n[1] * D, mid[0], cy, mid[1], false);
    this.elevControls.zoomTo(1, false);
    const az = this.elevControls.azimuthAngle, po = this.elevControls.polarAngle;
    Object.assign(this.elevControls, { minAzimuthAngle: az, maxAzimuthAngle: az, minPolarAngle: po, maxPolarAngle: po });
    this.buildElevationDims();
    return true;
  }

  fitElevation() {
    if (!this.elev) return;
    const W = this.container.clientWidth || 1, Hpx = this.container.clientHeight || 1;
    const halfW = this.elev.len / 2 + 0.9, halfH = this.elev.H / 2 + 0.7;
    const s = Math.max(halfW / (W / 2), halfH / (Hpx / 2));
    Object.assign(this.elevCam, { left: (-W / 2) * s, right: (W / 2) * s, top: (Hpx / 2) * s, bottom: (-Hpx / 2) * s });
    this.elevCam.updateProjectionMatrix();
  }

  /** Point on the wall face at (u along the wall, v above the floor), nudged towards the viewer. */
  elevPoint(u, v, out = 0.02) {
    const e = this.elev;
    return new THREE.Vector3(e.a[0] + e.dir[0] * u + e.n[0] * (e.t / 2 + out), e.y0 + v, e.a[1] + e.dir[1] * u + e.n[1] * (e.t / 2 + out));
  }

  /** Height dimensions for the elevation: ceiling, each door/window (sill and head), wall length, item heights. */
  buildElevationDims() {
    this.elevGroup ||= new THREE.Group();
    if (!this.elevGroup.parent) this.scene.add(this.elevGroup);
    this.elevGroup.clear();
    const e = this.elev;
    if (!e) return;
    const f = this.activeFloorData;
    const pts = [];
    const line = (u0, v0, u1, v1) => {
      const A = this.elevPoint(u0, v0), B = this.elevPoint(u1, v1);
      pts.push(A.x, A.y, A.z, B.x, B.y, B.z);
    };
    const text = (str, u, v, cls = 'dim-text') => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = str;
      const o = new CSS2DObject(el);
      o.position.copy(this.elevPoint(u, v));
      this.elevGroup.add(o);
    };
    // Along the wall the camera's right is +dir when looking from +normal… or −dir from the other side;
    // dimension positions are in u (wall coordinates), so they're right either way.
    const uL = -0.45;
    // Ceiling height, on the left
    line(uL, 0, uL, e.H);
    line(uL - 0.08, 0, uL + 0.08, 0);
    line(uL - 0.08, e.H, uL + 0.08, e.H);
    text(`${(e.H * 100).toFixed(0)} cm`, uL, e.H / 2);
    // Wall length, under the floor line
    line(0, -0.3, e.len, -0.3);
    line(0, -0.38, 0, -0.22);
    line(e.len, -0.38, e.len, -0.22);
    text(`${e.len.toFixed(2)} m`, e.len / 2, -0.3);
    // Openings: position along the wall, sill and head heights
    for (const o of f.openings.filter((x) => x.wall === e.wallId)) {
      const v0 = o.type === 'window' ? o.sill : 0, v1 = v0 + o.height;
      const u = o.offset + o.width + 0.12;
      line(u, 0, u, v1);
      if (v0 > 0.01) text(`sill ${(v0 * 100).toFixed(0)}`, u, v0 / 2);
      text(`${o.type === 'window' ? 'top' : 'head'} ${(v1 * 100).toFixed(0)}`, u, v1 + 0.08);
      text(`${(o.offset * 100).toFixed(0)} · ${(o.width * 100).toFixed(0)} wide`, o.offset + o.width / 2, -0.12);
    }
    // Furniture near the wall: its top height
    for (const [, rec] of this.items) {
      if (rec.floorIndex !== this.activeFloor) continue;
      const p = rec.placed;
      const rel = [p.x - e.a[0], p.z - e.a[1]];
      const dist = rel[0] * e.n[0] + rel[1] * e.n[1];
      const u = rel[0] * e.dir[0] + rel[1] * e.dir[1];
      if (dist < 0 || dist > e.depth || u < -0.2 || u > e.len + 0.2) continue;
      const top = (p.y || 0) + rec.dims.h;
      text(`${(top * 100).toFixed(0)} cm${p.y > 0.01 ? ` (from ${(p.y * 100).toFixed(0)})` : ''}`, u, top + 0.1, 'dim-text elev-item');
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x4a4f57, depthTest: false }));
    l.renderOrder = 12;
    this.elevGroup.add(l);
  }

  setView(view) {
    const prev = this.view;
    this.view = view;
    this.orbit.enabled = view === '3d';
    this.plan.enabled = view === 'plan';
    this.elevControls.enabled = view === 'elevation';
    this.controls = view === 'plan' ? this.plan : view === 'elevation' ? this.elevControls : this.orbit;
    this.camera = view === 'plan' ? this.ortho : view === 'elevation' ? this.elevCam : this.persp;
    if (view !== 'elevation') this.elevGroup?.clear();
    if (view === 'walk') this.cb.onWalk?.(true);
    else if (prev === 'walk') this.cb.onWalk?.(false);
    if (view === '3d' && prev === 'walk') this.frameHouse(true);
    this.persp.fov = view === 'walk' ? 70 : 45;
    this.persp.updateProjectionMatrix();
    this.applyFloorVisibility();
    this.refreshRoomLabels();
    this.refreshEditOverlay();
    this.updateSelection();
  }

  // ---------- pointer ----------

  setPointer(e) {
    const rect = this.paneRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Orthographic rays start behind the camera's near plane: only pick what's actually drawn
    // (matters for the wall elevation, whose near plane cuts away the rest of the house).
    if (this.camera.isOrthographicCamera) {
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      const d0 = this.raycaster.ray.origin.clone().sub(this.camera.position).dot(dir);
      this.raycaster.near = Math.max(0, this.camera.near - d0);
      this.raycaster.far = this.camera.far - d0;
    } else {
      this.raycaster.near = 0;
      this.raycaster.far = Infinity;
    }
  }

  /** Point on the horizontal plane at height y under the pointer. */
  planePoint(y = this.floorY) {
    this.plane.constant = -y;
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, p) ? p : null;
  }

  /** Plan point [x, z] on the active floor under a client position. */
  planAt(clientX, clientY) {
    this.setPointer({ clientX, clientY });
    const p = this.planePoint();
    return p ? [p.x, p.z] : null;
  }

  /**
   * What's under the pointer. Edit mode: corners › doors/windows › stairs › walls › rooms
   * (furniture is ignored). Furnishing mode: furniture first, structure only for info.
   */
  pick() {
    const hf = this.house?.floors[this.activeFloor];
    if (!hf || this.showAll) return null;
    if (this.editMode) {
      const handle = this.raycaster.intersectObjects(this.handles.children, true)[0];
      if (handle) return { type: 'handle', data: handle.object.userData.handle, point: handle.point };
      const box = this.raycaster.intersectObjects(this.pickBoxes.children, false)[0];
      if (box) return { type: 'opening', id: box.object.userData.opening, point: box.point };
    }
    const hits = this.raycaster.intersectObjects([hf.group], true).filter((h) => {
      if (h.object === hf.cap) return isVisible(h.object); // the cut face of the walls in plan
      if (h.object.userData.helper || !isVisible(h.object)) return false;
      if (this.editMode && isInside(h.object, hf.furniture)) return false;
      // Ignore geometry clipped away by the cut plane.
      if (hf.clipMaterials?.[0]?.clippingPlanes?.length && !isInside(h.object, hf.furniture) && h.point.y > hf.y0 + CUT_HEIGHT + 0.001) return false;
      return true;
    });
    for (const h of hits) {
      let o = h.object;
      while (o && o !== hf.group) {
        if (o.userData.placedId) {
          const rec = this.items.get(o.userData.placedId);
          // Prefer what's standing on a rug over the rug itself.
          if (rec?.item.category === 'rug' && hits.some((x) => x.distance - h.distance < 0.6 && this.ownerOf(x.object) && this.ownerOf(x.object) !== rec.placed.id && this.items.get(this.ownerOf(x.object))?.item.category !== 'rug')) break;
          return { type: 'item', id: o.userData.placedId, point: h.point };
        }
        if (o.userData.opening) return { type: 'opening', id: o.userData.opening, point: h.point };
        if (o.userData.stair) return { type: 'stairs', id: o.userData.stair, point: h.point };
        if (o === hf.wallMesh || o === hf.cap) return { type: 'wall', id: this.nearestWall([h.point.x, h.point.z])?.id, point: h.point };
        if (o.userData.room) return { type: 'room', id: o.userData.room, point: h.point };
        o = o.parent;
      }
    }
    return null;
  }

  ownerOf(o) {
    while (o && o.userData.placedId == null) o = o.parent;
    return o?.userData.placedId;
  }

  nearestWall(p, max = Infinity) {
    let best = null;
    for (const w of this.activeFloorData?.walls || []) {
      const c = closestOnSegment(p, w.a, w.b);
      if (c.dist < max && (!best || c.dist < best.dist)) best = { ...w, dist: c.dist, t: c.t, q: c.q };
    }
    return best;
  }

  snapshotFloor() {
    const f = this.activeFloorData;
    return JSON.parse(JSON.stringify({ walls: f.walls, openings: f.openings }));
  }

  /** Pointer position on the elevation wall as [u along the wall, v above the floor]. */
  elevAt() {
    const e = this.elev;
    if (!e) return null;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(e.n[0], 0, e.n[1]), this.elevPoint(0, 0, 0));
    const P = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!P) return null;
    return [(P.x - e.a[0]) * e.dir[0] + (P.z - e.a[1]) * e.dir[1], P.y - e.y0];
  }

  /** If the live edit moved a locked wall, undo it (back to the snapshot) and say why. */
  touchesLocked(snap) {
    const f = this.activeFloorData;
    const moved = snap.walls.some((o) => o.locked && !f.walls.some((w) => w.id === o.id && w.a[0] === o.a[0] && w.a[1] === o.a[1] && w.b[0] === o.b[0] && w.b[1] === o.b[1]));
    if (!moved) return false;
    this.restoreFloor(snap);
    this.drag.changed = false;
    this.cb.onStructureLive?.();
    this.cb.onHover?.('Blocked: that would move a locked wall');
    return true;
  }

  restoreFloor(snap) {
    const f = this.activeFloorData;
    const c = JSON.parse(JSON.stringify(snap));
    f.walls = c.walls;
    f.openings = c.openings;
    return f;
  }

  onDown(e) {
    if (this.view === 'walk' || e.button !== 0) return;
    this.setPointer(e);
    this.downAt = { x: e.clientX, y: e.clientY };
    // An active tool (drawing, measuring) gets the press; nothing is picked or dragged
    if (this.tool) return void this.tool.onDown?.(e);

    // Rotation knob of the selected item
    if (this.rotGroup.visible && this.raycaster.intersectObjects([this.rotKnob, this.rotRing], false).length && !this.items.get(this.sel?.id)?.placed.locked) {
      this.drag = { type: 'rotate', id: this.sel.id };
      this.controls.enabled = false;
      return;
    }
    const hit = this.pick();
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!hit || hit.type === 'room') {
      // Shift+drag on empty floor: box-select furniture (the camera stays put)
      if (e.shiftKey && !this.editMode) {
        this.drag = { type: 'box', x0: e.clientX, y0: e.clientY, add: e.ctrlKey || e.metaKey };
        this.controls.enabled = false;
        return;
      }
      if (!hit) {
        this.pendingDeselect = true;
        return;
      }
    }
    if (hit.type === 'handle') {
      const f = this.activeFloorData;
      if (wallsAt(f, hit.data.corner).some(({ wall }) => wall.locked)) return this.cb.onLocked?.('wall');
      this.drag = { type: 'corner', from: hit.data.corner, snap: this.snapshotFloor() };
      this.controls.enabled = false;
      return;
    }
    if (hit.type === 'item' && add) {
      // Shift/Ctrl-click adds to or removes from the selection
      const ids = this.selectedItems();
      const next = ids.includes(hit.id) ? ids.filter((x) => x !== hit.id) : [...ids, hit.id];
      this.select(next.length === 0 ? null : next.length === 1 ? { type: 'item', id: next[0] } : { type: 'items', ids: next });
      return;
    }
    if (hit.type === 'item' && this.sel?.type === 'items' && this.sel.ids.includes(hit.id)) {
      // Drag the whole selection
      const p0 = this.planePoint();
      const orig = new Map(this.sel.ids.map((id) => [id, { x: this.items.get(id)?.placed.x, z: this.items.get(id)?.placed.z }]));
      this.drag = { type: 'group', ids: this.sel.ids, start: p0 && [p0.x, p0.z], orig };
      this.controls.enabled = false;
      return;
    }
    if (hit.type === 'room') {
      this.pendingRoom = hit.id;
      return;
    }
    if (this.sel?.type !== hit.type || this.sel?.id !== hit.id) this.select({ type: hit.type, id: hit.id });
    const at = planOf(hit.point);
    if (hit.type === 'item' && this.items.get(hit.id)?.placed.locked) {
      this.cb.onLocked?.('item');
    } else if (hit.type === 'item' && this.view === 'elevation') {
      const rec = this.items.get(hit.id);
      this.drag = { type: 'elev', id: hit.id, start: this.elevAt(), orig: { x: rec.placed.x, z: rec.placed.z, y: rec.placed.y || 0 } };
    } else if (hit.type === 'item') {
      const rec = this.items.get(hit.id);
      const fp = this.planePoint(rec.group.position.y) || hit.point;
      this.drag = { type: 'item', id: hit.id, offset: [rec.group.position.x - fp.x, rec.group.position.z - fp.z] };
    } else if (this.editMode && hit.type === 'wall' && hit.id && this.activeFloorData.walls.find((w) => w.id === hit.id)?.locked) {
      this.cb.onLocked?.('wall');
    } else if (this.editMode && hit.type === 'wall' && hit.id) {
      this.drag = { type: 'wall', id: hit.id, start: at, snap: this.snapshotFloor() };
    } else if (this.editMode && hit.type === 'opening') {
      this.drag = { type: 'opening', id: hit.id };
    } else if (this.editMode && hit.type === 'stairs') {
      const s = this.activeFloorData.stairs.find((x) => x.id === hit.id);
      this.drag = { type: 'stairs', id: hit.id, offset: [s.x - at[0], s.z - at[1]] };
    }
    if (this.drag) {
      this.controls.enabled = false;
      this.renderer.domElement.style.cursor = 'grabbing';
    }
  }

  onDblClick(e) {
    if (this.tool) return this.tool.onDblClick?.(e);
    if (!this.editMode) return;
    this.setPointer(e);
    const hit = this.pick();
    if (hit?.type === 'wall' && hit.id) this.cb.onWallDblClick?.(hit.id, planOf(hit.point));
  }

  onMove(e) {
    if (this.view === 'walk') return;
    this.setPointer(e);
    const pp = this.view === 'elevation' ? null : this.planePoint();
    if (pp) this.cb.onPointer?.(pp.x, pp.z);
    else if (this.view === 'elevation') {
      const q = this.elevAt();
      if (q) this.cb.onPointer?.(q[0], q[1], 'elevation');
    }
    if (this.tool?.onMove?.(e)) return;
    const d = this.drag;
    if (!d) {
      const overKnob = this.rotGroup.visible && this.raycaster.intersectObjects([this.rotKnob, this.rotRing], false).length;
      if (overKnob) return (this.renderer.domElement.style.cursor = 'ew-resize');
      const hit = this.pick();
      const cursor = !hit ? '' : hit.type === 'handle' ? 'move' : hit.type === 'item' ? 'grab' : this.editMode && hit.type === 'wall' ? 'grab' : this.editMode && hit.type !== 'room' ? 'grab' : 'pointer';
      this.renderer.domElement.style.cursor = cursor;
      this.hoverTip(hit);
      return;
    }
    const floor = this.activeFloorData;
    if (d.type === 'rotate') {
      const rec = this.items.get(d.id);
      const p = this.planePoint(rec.group.position.y);
      if (!p) return;
      const a = Math.atan2(p.x - rec.group.position.x, p.z - rec.group.position.z);
      const step = e.shiftKey ? 1 : 15;
      const deg = (((Math.round(a / DEG / step) * step) % 360) + 360) % 360;
      rec.group.rotation.y = deg * DEG;
      Object.assign(rec.placed, { rot: deg });
      d.changed = true;
      this.updateSelection();
      this.cb.onLive?.();
      return;
    }
    if (d.type === 'box') {
      const r = this.container.getBoundingClientRect();
      Object.assign(this.boxEl.style, { display: 'block', left: `${Math.min(d.x0, e.clientX) - r.left}px`, top: `${Math.min(d.y0, e.clientY) - r.top}px`, width: `${Math.abs(e.clientX - d.x0)}px`, height: `${Math.abs(e.clientY - d.y0)}px` });
      d.x1 = e.clientX;
      d.y1 = e.clientY;
      return;
    }
    if (d.type === 'elev') {
      const q = this.elevAt();
      const rec = this.items.get(d.id);
      if (!q || !d.start || !rec) return;
      let du = q[0] - d.start[0], dv = q[1] - d.start[1];
      const st = this.snapStep(e) ? 0.01 : 0;
      if (st) (du = Math.round(du / st) * st), (dv = Math.round(dv / st) * st);
      const ed = this.elev.dir;
      Object.assign(rec.placed, { x: +(d.orig.x + ed[0] * du).toFixed(3), z: +(d.orig.z + ed[1] * du).toFixed(3), y: +Math.max(0, d.orig.y + dv).toFixed(3) });
      rec.group.position.set(rec.placed.x, this.house.floors[rec.floorIndex].y0 + rec.placed.y, rec.placed.z);
      d.changed = true;
      this.updateSelection();
      this.showDragLabel(`${Math.round(rec.placed.y * 100)} cm off the floor`, [rec.placed.x, rec.placed.z]);
      this.cb.onLive?.();
      return;
    }
    if (d.type === 'group') {
      const p = this.planePoint();
      if (!p || !d.start) return;
      let dx = p.x - d.start[0], dz = p.z - d.start[1];
      const st = this.snapStep(e);
      if (st) (dx = Math.round(dx / st) * st), (dz = Math.round(dz / st) * st);
      for (const id of d.ids) {
        const rec = this.items.get(id), o = d.orig.get(id);
        if (!rec || rec.placed.locked) continue;
        Object.assign(rec.placed, { x: +(o.x + dx).toFixed(3), z: +(o.z + dz).toFixed(3) });
        rec.group.position.x = rec.placed.x;
        rec.group.position.z = rec.placed.z;
      }
      d.changed = Math.abs(dx) + Math.abs(dz) > 0;
      this.updateSelection();
      this.showDragLabel(`${dx >= 0 ? '+' : ''}${Math.round(dx * 100)}, ${dz >= 0 ? '+' : ''}${Math.round(dz * 100)} cm`, [p.x, p.z]);
      this.cb.onLive?.();
      return;
    }
    if (d.type === 'item') {
      const rec = this.items.get(d.id);
      const p = this.planePoint(rec.group.position.y);
      if (!p) return;
      let x = p.x + d.offset[0];
      let z = p.z + d.offset[1];
      const st = this.snapStep(e);
      if (st) (x = Math.round(x / st) * st), (z = Math.round(z / st) * st);
      const res = this.constrain(rec, x, z, !e.altKey);
      if (!res) return;
      Object.assign(rec.placed, { x: res.x, z: res.z, y: res.y });
      rec.group.position.set(res.x, this.house.floors[rec.floorIndex].y0 + res.y, res.z);
      d.changed = true;
      this.updateSelection();
      this.cb.onLive?.();
      return;
    }
    const p = pp;
    if (!p) return;
    if (d.type === 'corner') {
      const f = this.restoreFloor(d.snap);
      // Snap to other corners / 5 cm grid, then square up with the walls meeting here.
      // Snap to other corners and the grid (Alt: free); Shift: don't square up with neighbours
      let at = snapPoint([p.x, p.z], { walls: f.walls.filter((w) => !wallsAt({ walls: [w] }, d.from).length) }, null, this.snapStep(e));
      if (!e.shiftKey) {
        for (const { wall, end } of wallsAt(f, d.from)) {
          const other = end === 'a' ? wall.b : wall.a;
          if (Math.abs(at[0] - other[0]) < 0.12) at = [other[0], at[1]];
          if (Math.abs(at[1] - other[1]) < 0.12) at = [at[0], other[1]];
        }
      }
      moveCorner(f, d.from, at);
      if (this.touchesLocked(d.snap)) return;
      d.to = at;
      d.changed = Math.hypot(at[0] - d.from[0], at[1] - d.from[1]) > 0.001;
      this.cb.onStructureLive?.();
      this.showDragLabel(`${(at[0]).toFixed(2)}, ${(at[1]).toFixed(2)} m`, at);
    } else if (d.type === 'wall') {
      const f = this.restoreFloor(d.snap);
      const w = f.walls.find((x) => x.id === d.id);
      const { normal } = wallFrame(w);
      let dn = (p.x - d.start[0]) * normal[0] + (p.z - d.start[1]) * normal[1];
      const st = this.snapStep(e);
      if (st) dn = Math.round(dn / st) * st;
      pushWall(f, d.id, dn);
      if (this.touchesLocked(d.snap)) return;
      d.changed = Math.abs(dn) > 0.001;
      this.cb.onStructureLive?.();
      const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
      this.showDragLabel(`${dn > 0 ? '+' : ''}${Math.round(dn * 100)} cm`, mid);
    } else if (d.type === 'opening') {
      if (moveOpening(floor, d.id, [p.x, p.z], { snap: this.snapStep(e) })) {
        d.changed = true;
        this.cb.onStructureLive?.();
      }
    } else if (d.type === 'stairs') {
      const s = floor.stairs.find((x) => x.id === d.id);
      let x = p.x + d.offset[0], z = p.z + d.offset[1];
      const st = this.snapStep(e);
      if (st) (x = Math.round(x / st) * st), (z = Math.round(z / st) * st);
      Object.assign(s, { x: +x.toFixed(3), z: +z.toFixed(3) });
      d.changed = true;
      this.cb.onStructureLive?.();
    }
  }

  showDragLabel(text, [x, z]) {
    this.selLabel.element.textContent = text;
    this.selLabel.position.set(x, this.floorY + (this.view === 'plan' || this.wallMode === 'cut' ? CUT_HEIGHT : this.activeFloorData.height) + 0.35, z);
    this.selLabel.visible = true;
  }

  hoverTip(hit) {
    const t = !hit ? '' : hit.type === 'handle' ? 'Drag to move this corner' : this.editMode && hit.type === 'wall' ? 'Drag to push or pull this wall · double-click to add a corner' : this.editMode && hit.type === 'opening' ? 'Drag along the wall, or onto another wall' : this.editMode && hit.type === 'stairs' ? 'Drag to move the stairs' : '';
    this.cb.onHover?.(t);
  }

  onUp(e) {
    if (this.tool?.onUp?.(e)) return;
    const d = this.drag;
    this.drag = null;
    this.controls.enabled = this.view !== 'walk';
    this.renderer.domElement.style.cursor = '';
    const clicked = this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 5;
    this.downAt = null;
    if (d?.type === 'box') {
      this.boxEl.style.display = 'none';
      if (d.x1 == null || Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 5) return;
      const r = this.paneRect();
      const [x0, x1] = [Math.min(d.x0, d.x1), Math.max(d.x0, d.x1)], [y0, y1] = [Math.min(d.y0, d.y1), Math.max(d.y0, d.y1)];
      const ids = [];
      for (const [id, rec] of this.items) {
        if (rec.floorIndex !== this.activeFloor) continue;
        const v = new THREE.Box3().setFromObject(rec.group).getCenter(new THREE.Vector3()).project(this.camera);
        const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ids.push(id);
      }
      const all = [...new Set([...(d.add ? this.selectedItems() : []), ...ids])];
      this.select(all.length === 0 ? null : all.length === 1 ? { type: 'item', id: all[0] } : { type: 'items', ids: all });
      return;
    }
    if (d?.changed) {
      if (d.type === 'item' || d.type === 'rotate' || d.type === 'group' || d.type === 'elev') this.cb.onCommit?.();
      if (d.type === 'elev') this.buildElevationDims();
      else this.cb.onStructureCommit?.({ type: d.type, id: d.id, corner: d.to });
      this.updateSelection();
      return;
    }
    if (d?.snap) {
      this.restoreFloor(d.snap);
      this.updateSelection();
    }
    if (this.pendingRoom && clicked) this.select({ type: 'room', id: this.pendingRoom });
    else if (this.pendingDeselect && clicked) this.select(null);
    this.pendingRoom = null;
    this.pendingDeselect = false;
  }

  /** Keep an item inside the house, flush against walls it touches, and stacked on surfaces. */
  constrain(rec, x, z, snap = true) {
    const floor = this.design.floors[rec.floorIndex];
    const hf = this.house.floors[rec.floorIndex];
    const a = rec.group.rotation.y;
    const ax = [Math.cos(a), -Math.sin(a)];
    const az = [Math.sin(a), Math.cos(a)];
    const { w, d } = rec.dims;
    const doors = floor.openings.filter((o) => o.type !== 'window');
    for (let iter = 0; iter < 3; iter++) {
      for (const wall of floor.walls) {
        const { len, dir, normal } = wallFrame(wall);
        const along = (x - wall.a[0]) * dir[0] + (z - wall.a[1]) * dir[1];
        const halfAlong = Math.abs((w / 2) * (ax[0] * dir[0] + ax[1] * dir[1])) + Math.abs((d / 2) * (az[0] * dir[0] + az[1] * dir[1]));
        if (along < -halfAlong - wall.thickness / 2 + 0.02 || along > len + halfAlong + wall.thickness / 2 - 0.02) continue;
        // Walking through a doorway is fine if the item fits within it.
        if (doors.some((o) => o.wall === wall.id && along - halfAlong >= o.offset - 0.01 && along + halfAlong <= o.offset + o.width + 0.01)) continue;
        const half = Math.abs((w / 2) * (ax[0] * normal[0] + ax[1] * normal[1])) + Math.abs((d / 2) * (az[0] * normal[0] + az[1] * normal[1])) + wall.thickness / 2;
        const dist = (x - wall.a[0]) * normal[0] + (z - wall.a[1]) * normal[1];
        const side = Math.sign(dist) || 1;
        const ad = Math.abs(dist);
        const target = snap && ad < half + 0.06 ? half : ad < half ? half : ad;
        if (target !== ad) {
          x += normal[0] * side * (target - ad);
          z += normal[1] * side * (target - ad);
        }
      }
    }
    if (hf.footprint.length && !hf.footprint.some((poly) => pointInPolygon(x, z, poly[0].slice(0, -1)))) return null;
    let y = 0;
    const cat = rec.item.category;
    if (cat !== 'rug') {
      for (const [id, other] of this.items) {
        if (id === rec.placed.id || other.floorIndex !== rec.floorIndex || !STACK_BASES.has(other.item.category)) continue;
        if (other.item.category !== 'rug' && (rec.dims.w * rec.dims.d > other.dims.w * other.dims.d * 0.8 || BIG.has(cat))) continue;
        const b = other.group.rotation.y;
        const dx = x - other.placed.x, dz = z - other.placed.z;
        const lx = dx * Math.cos(b) - dz * Math.sin(b);
        const lz = dx * Math.sin(b) + dz * Math.cos(b);
        if (Math.abs(lx) < other.dims.w / 2 && Math.abs(lz) < other.dims.d / 2) {
          y = Math.max(y, (other.placed.y || 0) + (other.item.category === 'rug' ? Math.max(other.dims.h, 0.008) : other.dims.h));
        }
      }
    }
    return { x: +x.toFixed(3), z: +z.toFixed(3), y: +y.toFixed(3) };
  }

  // ---------- frame loop ----------

  frame() {
    if (this.paused) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    for (const f of this.frameHooks) f(dt);
    if (this.split) return this.frameSplit(dt);
    if (this.view !== 'walk') this.controls.update(dt);
    if (this.composer && this.view !== 'plan') this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  /**
   * Split view: the plan (left) and the 3D view (right) of the same floor, both live.
   * Each half has its own camera controls; whichever half the pointer is over is "active" for
   * picking and dragging, so edits in either show in both.
   */
  setSplit(on) {
    if (on === !!this.split) return;
    this.split = on;
    const el = this.renderer.domElement;
    if (on) {
      this.panes = ['plan', '3d'].map((view) => {
        const d = document.createElement('div');
        d.className = `split-pane ${view}`;
        d.dataset.pane = view;
        this.container.appendChild(d);
        d.addEventListener('pointerenter', () => this.setPane(view));
        d.addEventListener('pointerdown', () => this.setPane(view), true);
        return d;
      });
      this.plan.disconnect();
      this.orbit.disconnect();
      this.plan.connect(this.panes[0]);
      this.orbit.connect(this.panes[1]);
      this.plan.enabled = this.orbit.enabled = true;
      this.labels.domElement.classList.add('split-labels');
      this.setPane('plan');
    } else {
      for (const d of this.panes || []) d.remove();
      this.panes = null;
      this.plan.disconnect();
      this.orbit.disconnect();
      this.plan.connect(el);
      this.orbit.connect(el);
      this.labels.domElement.classList.remove('split-labels');
      this.setView(this.view === 'walk' ? '3d' : this.view);
    }
    this.resize();
    this.frameHouse(false);
    this.applyFloorVisibility();
    this.refreshRoomLabels();
    this.refreshEditOverlay();
  }

  /** Which half of the split view the pointer works in. */
  setPane(view) {
    if (!this.split || (this.view === view && this.camera === (view === 'plan' ? this.ortho : this.persp))) return;
    if (this.drag) return; // never switch in the middle of a drag
    this.view = view;
    this.camera = view === 'plan' ? this.ortho : this.persp;
    this.controls = view === 'plan' ? this.plan : this.orbit;
    this.refreshEditOverlay();
    this.updateSelection();
  }

  /** Pixel rectangle of the active half (split view) or of the whole view. */
  paneRect() {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (!this.split) return r;
    const w = Math.floor(r.width / 2);
    return this.view === 'plan' ? { left: r.left, top: r.top, width: w, height: r.height } : { left: r.left + w, top: r.top, width: r.width - w, height: r.height };
  }

  frameSplit(dt) {
    this.plan.update(dt);
    this.orbit.update(dt);
    const r = this.renderer;
    const W = r.domElement.clientWidth, H = r.domElement.clientHeight, w = Math.floor(W / 2);
    const active = this.view;
    r.setScissorTest(true);
    for (const [view, x, width, cam] of [['plan', 0, w, this.ortho], ['3d', w, W - w, this.persp]]) {
      // Each half gets its own cut / plan-only symbols
      this.view = view;
      this.applyFloorVisibility();
      r.setViewport(x, 0, width, H);
      r.setScissor(x, 0, width, H);
      r.render(this.scene, cam);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    this.view = active;
    this.applyFloorVisibility();
    // Labels (room names, dimensions, lengths) belong to the plan half
    this.labels.render(this.scene, this.ortho);
  }

  /** Hide overlays for clean output (screenshots, exports). */
  withoutHelpers(fn) {
    const hidden = [];
    this.scene.traverse((o) => {
      if ((o.userData.helper || o === this.overlay || o.isCSS2DObject) && o.visible) {
        hidden.push(o);
        o.visible = false;
      }
    });
    try {
      return fn();
    } finally {
      for (const o of hidden) o.visible = true;
    }
  }

  screenshot() {
    return this.withoutHelpers(() => {
      if (this.composer && this.view !== 'plan') this.composer.render(0);
      else this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    });
  }
}

// ---------- helpers ----------

function isInside(o, ancestor) {
  for (let p = o; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** A point well inside a room for its label (centroid, or the best inside point for L/U shapes). */
function labelPoint(pts) {
  let A = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const k = x0 * z1 - x1 * z0;
    A += k;
    cx += (x0 + x1) * k;
    cz += (z0 + z1) * k;
  }
  if (Math.abs(A) > 1e-9) (cx /= 3 * A), (cz /= 3 * A);
  if (pointInPolygon(cx, cz, pts)) return [cx, cz];
  // Centroid falls outside (L/U-shaped room): scan for the inside point furthest from the edges
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  let best = pts[0], bestD = -1;
  for (let i = 1; i < 20; i++)
    for (let j = 1; j < 20; j++) {
      const x = Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 20, z = Math.min(...zs) + ((Math.max(...zs) - Math.min(...zs)) * j) / 20;
      if (!pointInPolygon(x, z, pts)) continue;
      let d = Infinity;
      for (let k = 0; k < pts.length; k++) d = Math.min(d, closestOnSegment([x, z], pts[k], pts[(k + 1) % pts.length]).dist);
      if (d > bestD) (bestD = d), (best = [x, z]);
    }
  return best;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Snap a plan point to wall ends (15 cm) or a 5 cm grid. `skip` = wall id being edited. */
export function snapPoint(p, floor, skip, step = 0.05) {
  let best = null;
  for (const w of floor?.walls || []) {
    if (w.id === skip) continue;
    for (const q of [w.a, w.b]) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < 0.15 && (!best || d < best.d)) best = { q, d };
    }
  }
  if (best) return best.q.slice();
  if (!step) return [+p[0].toFixed(3), +p[1].toFixed(3)];
  return [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step].map((v) => +v.toFixed(3));
}

/** Snap to horizontal/vertical (or 45°) relative to an anchor, like drafting tools. */
export function orthoSnap(p, anchor) {
  const dx = p[0] - anchor[0], dz = p[1] - anchor[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return p;
  const ang = Math.atan2(dz, dx);
  const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
  if (Math.abs(ang - snapped) > 0.12) return p;
  const L = Math.round(len / 0.05) * 0.05;
  return [+(anchor[0] + Math.cos(snapped) * L).toFixed(3), +(anchor[1] + Math.sin(snapped) * L).toFixed(3)];
}

/** Fit a loaded model to real dimensions (turning it if it faces sideways). */
export function fitModel(m, dims) {
  let box = new THREE.Box3().setFromObject(m);
  let size = box.getSize(new THREE.Vector3());
  const want = dims.w / dims.d;
  if (Math.abs(size.z / size.x - want) < Math.abs(size.x / size.z - want) - 0.05) {
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
}
