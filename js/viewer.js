// Three.js viewer: renders the room and items, handles selection, dragging,
// rotating, stacking, wall snapping, room-shape editing and camera modes.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildParametric, tintModel, DEFAULT_DIMS } from './models.js';
import { buildRoom, bounds, centroid, pointInPolygon, walls, closestOnSegment } from './room.js';

const STACK_BASES = new Set(['table', 'desk', 'coffeetable', 'sidetable', 'nightstand', 'dresser', 'sideboard', 'tvstand', 'bookshelf', 'rug', 'wardrobe']);
const DEG = Math.PI / 180;

/** 'webgl2', 'webgl' or null: what this browser can render with. */
export function webglSupport() {
  try {
    const c = document.createElement('canvas');
    if (c.getContext('webgl2')) return 'webgl2';
    if (c.getContext('webgl') || c.getContext('experimental-webgl')) return 'webgl';
  } catch {}
  return null;
}

function makeLabel(className) {
  const el = document.createElement('div');
  el.className = className;
  return new CSS2DObject(el);
}

export class Viewer {
  constructor(container, cb) {
    this.container = container;
    this.cb = cb;
    this.items = new Map(); // placedId → { group, sig, placed, item, half }
    this.selectedId = null;
    this.view = '3d';
    this.editRoom = false;
    this.selectedWall = null;
    this.modelCache = new Map();
    this.assetProxy = null;
    this.keys = new Set();

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#e9e6e1');
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a58a, 0.9));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff3e0, 2.2));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    this.persp = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
    this.ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    this.camera = this.persp;
    this.controls = new OrbitControls(this.persp, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.screenSpacePanning = true;

    this.roomGroup = new THREE.Group();
    this.itemsGroup = new THREE.Group();
    this.handlesGroup = new THREE.Group();
    scene.add(this.roomGroup, this.itemsGroup, this.handlesGroup);

    // Selection visuals
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0x2f6fed);
    this.selBox.visible = false;
    scene.add(this.selBox);
    this.rotRing = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0x2f6fed, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false })
    );
    this.rotRing.rotation.x = -Math.PI / 2;
    this.rotRing.renderOrder = 10;
    this.rotKnob = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0x2f6fed, depthTest: false }));
    this.rotKnob.renderOrder = 11;
    this.rotGroup = new THREE.Group();
    this.rotGroup.add(this.rotRing, this.rotKnob);
    this.rotGroup.visible = false;
    scene.add(this.rotGroup);
    this.selLabel = makeLabel('dim-label');
    this.selLabel.visible = false;
    scene.add(this.selLabel);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const el = r.domElement;
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('dblclick', (e) => this.onDblClick(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // In walk mode the wheel steps forward/back instead of zooming.
    el.addEventListener(
      'wheel',
      (e) => {
        if (this.view !== 'eye') return;
        e.preventDefault();
        this.walk(-Math.sign(e.deltaY) * 0.25);
      },
      { passive: false }
    );
    window.addEventListener('keydown', (e) => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.frame());
  }

  // ---------- setup ----------

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.fitOrtho();
  }

  fitOrtho() {
    if (!this.room) return;
    const b = bounds(this.room.points);
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const spanX = b.maxX - b.minX + 1.4;
    const spanZ = b.maxZ - b.minZ + 1.4;
    const scale = Math.max(spanX / w, spanZ / h);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    Object.assign(this.ortho, { left: (-w * scale) / 2, right: (w * scale) / 2, top: (h * scale) / 2, bottom: (-h * scale) / 2 });
    this.ortho.updateProjectionMatrix();
    if (this.view === 'plan') {
      this.ortho.position.set(cx, 20, cz);
      this.ortho.up.set(0, 0, -1);
      this.ortho.lookAt(cx, 0, cz);
      this.controls.target.set(cx, 0, cz);
    }
  }

  setAssetProxy(fn) {
    this.assetProxy = fn;
  }

  setRoom(room, { refit = false } = {}) {
    const first = !this.room;
    this.room = room;
    this.roomGroup.clear();
    const built = buildRoom(room);
    this.roomGroup.add(built.group);
    this.wallMeshes = built.wallMeshes;
    this.floorMesh = built.floor;
    const b = bounds(room.points);
    const [cx, cz] = [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    this.sun.position.set(cx + span * 0.6, room.height * 3 + 3, cz + span * 0.9);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    Object.assign(sc, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: room.height * 6 + span * 3 });
    sc.updateProjectionMatrix();
    if (first || refit) this.frameRoom();
    this.fitOrtho();
    this.refreshRoomHandles();
    this.refreshWallLabels();
  }

  frameRoom() {
    const b = bounds(this.room.points);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 3);
    this.controls.target.set(cx, 0.6, cz);
    this.persp.position.set(cx + span * 0.55, span * 1.05 + 1, cz + span * 1.25);
    this.controls.update();
  }

  setView(view) {
    this.view = view;
    const c = this.controls;
    if (view === 'plan') {
      this.camera = this.ortho;
      c.object = this.ortho;
      c.enableRotate = false;
      c.enableZoom = true;
      c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
      this.ortho.zoom = 1;
      this.fitOrtho();
    } else {
      this.camera = this.persp;
      c.object = this.persp;
      c.enableRotate = true;
      c.enableZoom = view !== 'eye';
      c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      if (view === 'eye') {
        const [cx, cz] = centroid(this.room.points);
        // Stand just inside the corner furthest from the centroid, looking across the room.
        let far = this.room.points[0];
        for (const p of this.room.points) if (Math.hypot(p[0] - cx, p[1] - cz) > Math.hypot(far[0] - cx, far[1] - cz)) far = p;
        const t = 0.35;
        let ex = far[0] + (cx - far[0]) * t, ez = far[1] + (cz - far[1]) * t;
        if (!pointInPolygon(ex, ez, this.room.points)) [ex, ez] = [cx, cz];
        this.persp.position.set(ex, 1.6, ez);
        const dx = cx - ex, dz = cz - ez;
        const L = Math.hypot(dx, dz) || 1;
        c.target.set(ex + (dx / L) * 0.4, 1.45, ez + (dz / L) * 0.4);
        this.persp.fov = 65;
        c.minDistance = 0.05;
        c.maxPolarAngle = Math.PI - 0.1;
      } else {
        this.persp.fov = 45;
        c.minDistance = 0.5;
        c.maxPolarAngle = Math.PI / 2 - 0.02;
        this.frameRoom();
      }
      this.persp.updateProjectionMatrix();
    }
    c.update();
    this.refreshWallLabels();
  }

  setEditRoom(on) {
    this.editRoom = on;
    this.selectedWall = null;
    this.selectedVertex = null;
    if (on) this.select(null);
    this.refreshRoomHandles();
    this.refreshWallLabels();
  }

  // ---------- items ----------

  sync(placedList, inventory) {
    const byId = new Map(inventory.map((i) => [i.id, i]));
    const seen = new Set();
    for (const p of placedList) {
      const item = byId.get(p.itemId);
      if (!item) continue;
      seen.add(p.id);
      const color = item.colors?.find((c) => c.name === p.color) || (p.color?.startsWith?.('#') ? { name: p.color, hex: p.color } : item.colors?.[0]);
      const sig = JSON.stringify([item.category, item.dims, color?.hex, item.accent, item.modelUrl, item.name, item.useModel]);
      let rec = this.items.get(p.id);
      if (!rec || rec.sig !== sig) {
        if (rec) this.itemsGroup.remove(rec.group);
        rec = this.buildItem(p, item, color, sig);
        this.items.set(p.id, rec);
      }
      rec.placed = p;
      rec.item = item;
      rec.group.position.set(p.x, p.y || 0, p.z);
      rec.group.rotation.y = (p.rot || 0) * DEG;
    }
    for (const [id, rec] of this.items) {
      if (!seen.has(id)) {
        this.itemsGroup.remove(rec.group);
        this.items.delete(id);
      }
    }
    if (this.selectedId && !this.items.has(this.selectedId)) this.select(null);
    this.updateSelection();
  }

  dimsOf(item) {
    const def = DEFAULT_DIMS[item.category] || [0.6, 0.6, 0.6];
    return { w: item.dims?.w || def[0], d: item.dims?.d || def[1], h: item.dims?.h || def[2] };
  }

  buildItem(p, item, color, sig) {
    const group = new THREE.Group();
    group.userData.placedId = p.id;
    const dims = this.dimsOf(item);
    const model = buildParametric({ category: item.category, dims, color, accent: item.accent, name: item.name, seed: item.id });
    group.add(model);
    this.itemsGroup.add(group);
    const rec = { group, sig, dims, loading: false };
    if (item.modelUrl && item.useModel !== false) {
      rec.loading = true;
      this.loadModel(item.modelUrl)
        .then((scene) => {
          if (this.items.get(p.id) !== rec) return;
          const m = scene.clone(true);
          this.fitModel(m, dims);
          tintModel(m, item.colors?.length > 1 ? color?.hex : null);
          m.traverse((o) => {
            if (o.isMesh) o.castShadow = o.receiveShadow = true;
          });
          group.remove(model);
          group.add(m);
          rec.loading = false;
          this.updateSelection();
        })
        .catch((err) => {
          rec.loading = false;
          console.warn('Model failed, keeping generated model', err);
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
      this.modelCache.set(
        url,
        new Promise((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej)).catch((e) => {
          this.modelCache.delete(url);
          throw e;
        })
      );
    }
    return this.modelCache.get(url);
  }

  fitModel(m, dims) {
    let box = new THREE.Box3().setFromObject(m);
    let size = box.getSize(new THREE.Vector3());
    const want = dims.w / dims.d;
    // If the model faces sideways, turn it so its width lines up with the item's width.
    if (Math.abs(size.z / size.x - want) < Math.abs(size.x / size.z - want) - 0.05) {
      m.rotation.y = Math.PI / 2;
      m.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(m);
      size = box.getSize(new THREE.Vector3());
    }
    const wrap = new THREE.Group();
    m.scale.multiply(new THREE.Vector3(dims.w / (size.x || 1), dims.h / (size.y || 1), dims.d / (size.z || 1)));
    m.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    m.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
    return wrap;
  }

  // ---------- selection ----------

  select(id) {
    this.selectedId = id;
    this.updateSelection();
    this.cb.onSelect?.(id);
  }

  updateSelection() {
    const rec = this.selectedId && this.items.get(this.selectedId);
    this.selBox.visible = this.rotGroup.visible = this.selLabel.visible = !!rec;
    if (!rec) return;
    rec.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rec.group);
    this.selBox.box.copy(box.expandByScalar(0.01));
    const d = rec.dims;
    const r = Math.hypot(d.w, d.d) / 2 + 0.12;
    this.rotRing.scale.setScalar(r);
    this.rotRing.position.set(0, 0, 0);
    this.rotKnob.scale.setScalar(Math.max(0.045, r * 0.06));
    const a = rec.group.rotation.y;
    this.rotKnob.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    this.rotGroup.position.set(rec.group.position.x, (rec.placed.y || 0) + 0.015, rec.group.position.z);
    this.selLabel.element.textContent = `${Math.round(d.w * 100)} × ${Math.round(d.d * 100)} × ${Math.round(d.h * 100)} cm`;
    this.selLabel.position.set(rec.group.position.x, box.max.y + 0.12, rec.group.position.z);
  }

  // ---------- pointer ----------

  setPointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  floorAt(clientX, clientY) {
    this.setPointer({ clientX, clientY });
    return this.floorPoint(0);
  }

  floorPoint(y = 0) {
    this.floorPlane.constant = -y;
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? p : null;
  }

  hitItem() {
    const hits = this.raycaster.intersectObjects(this.itemsGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData.placedId == null) o = o.parent;
      if (o) {
        // Prefer non-rug items when a rug is underneath something else.
        const rec = this.items.get(o.userData.placedId);
        if (rec?.item.category === 'rug' && hits.some((x) => x !== h && x.distance - h.distance < 0.5 && this.ownerId(x.object) !== o.userData.placedId && this.items.get(this.ownerId(x.object))?.item.category !== 'rug')) continue;
        return { id: o.userData.placedId, point: h.point };
      }
    }
    return null;
  }

  ownerId(o) {
    while (o && o.userData.placedId == null) o = o.parent;
    return o?.userData.placedId;
  }

  onDown(e) {
    if (e.button !== 0) return;
    this.setPointer(e);
    this.downAt = { x: e.clientX, y: e.clientY };

    if (this.editRoom) {
      const hv = this.raycaster.intersectObjects(this.handlesGroup.children, false)[0];
      if (hv) {
        this.drag = { type: 'vertex', index: hv.object.userData.index };
        this.selectedVertex = hv.object.userData.index;
        this.selectedWall = null;
        this.controls.enabled = false;
        this.cb.onRoomSelect?.({ vertex: this.selectedVertex });
        this.refreshRoomHandles();
        return;
      }
      const hw = this.raycaster.intersectObjects(this.wallMeshes.map((w) => w.mesh), false)[0];
      let wall = hw ? hw.object.userData.wall.i : null;
      if (wall == null) {
        // Cut-away walls are short, so also accept clicks on the floor next to a wall.
        const p = this.floorPoint(0);
        if (p) {
          let best = null;
          for (const w of walls(this.room.points)) {
            const c = closestOnSegment([p.x, p.z], w.a, w.b);
            if (!best || c.dist < best.dist) best = { dist: c.dist, i: w.i };
          }
          if (best && best.dist < 0.35) wall = best.i;
        }
      }
      this.pendingWall = wall;
      return;
    }

    // Rotation knob / ring
    if (this.rotGroup.visible) {
      const hr = this.raycaster.intersectObjects([this.rotKnob, this.rotRing], false)[0];
      if (hr) {
        const rec = this.items.get(this.selectedId);
        this.drag = { type: 'rotate', id: this.selectedId, start: rec.group.rotation.y };
        this.controls.enabled = false;
        return;
      }
    }
    const hit = this.hitItem();
    if (hit) {
      const rec = this.items.get(hit.id);
      if (this.selectedId !== hit.id) this.select(hit.id);
      const fp = this.floorPoint(rec.placed.y || 0) || hit.point;
      this.drag = { type: 'move', id: hit.id, offset: new THREE.Vector3().subVectors(rec.group.position, fp).setY(0), moved: false };
      this.controls.enabled = false;
      this.renderer.domElement.style.cursor = 'grabbing';
    } else {
      this.pendingDeselect = true;
    }
  }

  onMove(e) {
    this.setPointer(e);
    const d = this.drag;
    if (!d) {
      if (!this.editRoom) {
        const overKnob = this.rotGroup.visible && this.raycaster.intersectObjects([this.rotKnob, this.rotRing], false).length;
        this.renderer.domElement.style.cursor = overKnob ? 'ew-resize' : this.hitItem() ? 'grab' : '';
      } else {
        const hv = this.raycaster.intersectObjects(this.handlesGroup.children, false).length;
        this.renderer.domElement.style.cursor = hv ? 'move' : '';
      }
      return;
    }
    if (d.type === 'vertex') {
      const p = this.floorPoint(0);
      if (!p) return;
      const pts = this.room.points.map((q) => q.slice());
      let x = Math.round(p.x / 0.05) * 0.05;
      let z = Math.round(p.z / 0.05) * 0.05;
      if (!e.shiftKey) {
        // Snap to neighbours' axes to keep walls square.
        const n = pts.length;
        for (const j of [(d.index + n - 1) % n, (d.index + 1) % n]) {
          if (Math.abs(pts[j][0] - x) < 0.15) x = pts[j][0];
          if (Math.abs(pts[j][1] - z) < 0.15) z = pts[j][1];
        }
      }
      pts[d.index] = [+x.toFixed(3), +z.toFixed(3)];
      this.setRoom({ ...this.room, points: pts });
      d.changed = true;
      return;
    }
    const rec = this.items.get(d.id);
    if (!rec) return;
    if (d.type === 'rotate') {
      const p = this.floorPoint(rec.placed.y || 0);
      if (!p) return;
      let a = Math.atan2(p.x - rec.group.position.x, p.z - rec.group.position.z);
      const step = e.shiftKey ? 1 : 15;
      let deg = Math.round(a / DEG / step) * step;
      deg = ((deg % 360) + 360) % 360;
      rec.group.rotation.y = deg * DEG;
      rec.placed = { ...rec.placed, rot: deg };
      d.changed = true;
      this.updateSelection();
      this.cb.onLive?.(rec.placed);
      return;
    }
    if (d.type === 'move') {
      const p = this.floorPoint(rec.placed.y || 0);
      if (!p) return;
      let x = p.x + d.offset.x;
      let z = p.z + d.offset.z;
      if (!e.shiftKey) {
        x = Math.round(x * 100) / 100;
        z = Math.round(z * 100) / 100;
      }
      const res = this.constrain(rec, x, z, !e.altKey);
      if (!res) return;
      rec.group.position.set(res.x, res.y, res.z);
      rec.placed = { ...rec.placed, x: res.x, z: res.z, y: res.y };
      d.moved = true;
      this.updateSelection();
      this.cb.onLive?.(rec.placed);
    }
  }

  /** Keep an item inside the room, flush against walls it touches, and stacked on surfaces. */
  constrain(rec, x, z, snap = true) {
    const pts = this.room.points;
    const a = rec.group.rotation.y;
    const ax = [Math.cos(a), -Math.sin(a)]; // item local +X in world x/z
    const az = [Math.sin(a), Math.cos(a)]; // item local +Z
    const { w, d } = rec.dims;
    for (let iter = 0; iter < 3; iter++) {
      for (const wall of walls(pts)) {
        const n = wall.inward;
        const half = Math.abs((w / 2) * (ax[0] * n[0] + ax[1] * n[1])) + Math.abs((d / 2) * (az[0] * n[0] + az[1] * n[1]));
        const along = (x - wall.a[0]) * wall.dir[0] + (z - wall.a[1]) * wall.dir[1];
        const halfAlong = Math.abs((w / 2) * (ax[0] * wall.dir[0] + ax[1] * wall.dir[1])) + Math.abs((d / 2) * (az[0] * wall.dir[0] + az[1] * wall.dir[1]));
        if (along < -halfAlong + 0.02 || along > wall.len + halfAlong - 0.02) continue;
        const dist = (x - wall.a[0]) * n[0] + (z - wall.a[1]) * n[1];
        if (dist < -half - 0.2) continue; // far behind this wall (other part of a concave room)
        const target = snap && dist < half + 0.06 ? half : dist < half ? half : dist;
        if (target !== dist) {
          x += n[0] * (target - dist);
          z += n[1] * (target - dist);
        }
      }
    }
    if (!pointInPolygon(x, z, pts)) return null;
    // Stacking: sit on top of a surface under the pointer.
    let y = 0;
    const cat = rec.item.category;
    if (cat !== 'rug') {
      for (const [id, other] of this.items) {
        if (id === rec.group.userData.placedId || !STACK_BASES.has(other.item.category)) continue;
        if (other.item.category !== 'rug' && rec.dims.w * rec.dims.d > other.dims.w * other.dims.d * 0.8) continue;
        if (other.item.category !== 'rug' && ['sofa', 'bed', 'wardrobe', 'table', 'desk', 'chair', 'armchair', 'dresser', 'sideboard', 'bookshelf'].includes(cat)) continue;
        const b = other.group.rotation.y;
        const dx = x - other.group.position.x;
        const dz = z - other.group.position.z;
        const lx = dx * Math.cos(b) - dz * Math.sin(b);
        const lz = dx * Math.sin(b) + dz * Math.cos(b);
        if (Math.abs(lx) < other.dims.w / 2 && Math.abs(lz) < other.dims.d / 2) {
          const top = (other.placed.y || 0) + (other.item.category === 'rug' ? Math.max(other.dims.h, 0.008) : other.dims.h);
          y = Math.max(y, top);
        }
      }
    }
    return { x: +x.toFixed(3), z: +z.toFixed(3), y: +y.toFixed(3) };
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = '';
    const clicked = this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 5;
    if (d?.type === 'vertex') {
      if (d.changed) this.cb.onRoomChange?.(this.room);
      return;
    }
    if (d && (d.type === 'move' || d.type === 'rotate')) {
      const rec = this.items.get(d.id);
      if (rec && (d.moved || d.changed)) this.cb.onCommit?.(rec.placed);
      return;
    }
    if (this.editRoom && clicked && this.pendingWall !== undefined) {
      this.selectedWall = this.pendingWall;
      this.selectedVertex = null;
      this.cb.onRoomSelect?.({ wall: this.selectedWall });
      this.refreshRoomHandles();
      this.refreshWallLabels();
    }
    this.pendingWall = undefined;
    if (this.pendingDeselect && clicked) this.select(null);
    this.pendingDeselect = false;
  }

  onDblClick(e) {
    if (!this.editRoom) return;
    this.setPointer(e);
    const p = this.floorPoint(0);
    if (!p) return;
    // Double-click near a wall inserts a corner there.
    let best = null;
    for (const w of walls(this.room.points)) {
      const c = closestOnSegment([p.x, p.z], w.a, w.b);
      if (!best || c.dist < best.dist) best = { ...c, i: w.i };
    }
    if (best && best.dist < 0.4 && best.t > 0.02 && best.t < 0.98) this.cb.onInsertCorner?.(best.i, [+best.q[0].toFixed(2), +best.q[1].toFixed(2)]);
  }

  // ---------- room handles & labels ----------

  refreshRoomHandles() {
    this.handlesGroup.clear();
    if (!this.editRoom || !this.room) return;
    this.room.points.forEach(([x, z], i) => {
      const sel = i === this.selectedVertex;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.04, 24),
        new THREE.MeshBasicMaterial({ color: sel ? 0xe8573c : 0x2f6fed, depthTest: false })
      );
      m.renderOrder = 20;
      m.position.set(x, 0.02, z);
      m.userData.index = i;
      this.handlesGroup.add(m);
    });
    for (const wm of this.wallMeshes || []) {
      const on = wm.wall.i === this.selectedWall;
      wm.mesh.material.emissive?.set(on ? 0x2f6fed : 0x000000);
      wm.mesh.material.emissiveIntensity = on ? 0.35 : 0;
    }
  }

  refreshWallLabels() {
    for (const l of this.wallLabels || []) this.scene.remove(l);
    this.wallLabels = [];
    if (!this.room || !(this.editRoom || this.view === 'plan')) return;
    for (const w of walls(this.room.points)) {
      const l = makeLabel('wall-label' + (w.i === this.selectedWall ? ' selected' : ''));
      l.element.textContent = `${Math.round(w.len * 100)} cm`;
      const mx = (w.a[0] + w.b[0]) / 2 - w.inward[0] * 0.38;
      const mz = (w.a[1] + w.b[1]) / 2 - w.inward[1] * 0.38;
      l.position.set(mx, 0.05, mz);
      this.scene.add(l);
      this.wallLabels.push(l);
    }
  }

  walk(dist, strafe = 0) {
    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.persp.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const mv = fwd.multiplyScalar(dist).add(right.multiplyScalar(strafe));
    const next = this.persp.position.clone().add(mv);
    // Stay inside the room (with a little clearance from the walls).
    if (!pointInPolygon(next.x, next.z, this.room.points)) return;
    this.persp.position.copy(next);
    this.controls.target.add(mv);
  }

  // ---------- frame loop ----------

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.view === 'eye' && this.keys.size) {
      const k = this.keys;
      const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      if (f || s) this.walk(f * 1.6 * dt, s * 1.6 * dt);
    }
    this.controls.update();
    // Cut away walls between the camera and the room (dollhouse view).
    if (this.wallMeshes) {
      const cam = this.camera.position;
      for (const wm of this.wallMeshes) {
        const w = wm.wall;
        const inside = (cam.x - w.a[0]) * w.inward[0] + (cam.z - w.a[1]) * w.inward[1];
        const cut = this.view === '3d' && inside < 0;
        wm.group.scale.y = cut ? 0.035 : 1;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  screenshot() {
    const vis = [this.selBox.visible, this.rotGroup.visible];
    this.selBox.visible = this.rotGroup.visible = false;
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    [this.selBox.visible, this.rotGroup.visible] = vis;
    return url;
  }
}
