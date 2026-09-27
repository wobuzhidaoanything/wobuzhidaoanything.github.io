// Renders furniture model components (React Three Fiber, userdata/models/<id>.jsx) into plain
// three.js groups the rest of the app uses like any other model. One hidden R3F root holds
// every mounted component through portals; it never draws (frameloop "never"), the app's own
// renderer does. Loaded only when a component model is actually used.
import * as THREE from 'three';

let hostP = null;
function host() {
  hostP ||= (async () => {
    const [React, fiber] = await Promise.all([import('react'), import('@react-three/fiber')]);
    fiber.extend(THREE); // make every three.js class usable as a JSX element (<latheGeometry>, <meshPhysicalMaterial>…)
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const root = fiber.createRoot(canvas);
    await root.configure({ frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 }, dpr: 1, gl: { antialias: false, powerPreference: 'low-power' } });
    const portals = new Map();
    const render = () => root.render(React.createElement(React.Fragment, null, ...portals.values()));
    return { React, fiber, portals, render };
  })();
  return hostP;
}

const cache = new Map(); // url + props -> Promise<THREE.Group>

/**
 * The model component at `url`, rendered with `props`, as a three.js group
 * (kept mounted and cached; clone it for each placement).
 */
export function componentModel(url, props) {
  const key = url + JSON.stringify(props);
  if (!cache.has(key)) {
    const p = mount(url, props);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

/** Forget cached renders of a component (after the agent rewrote it). */
export function forgetComponent(urlPrefix) {
  for (const k of [...cache.keys()]) if (k.startsWith(urlPrefix)) cache.delete(k);
}

async function mount(url, props) {
  const h = await host();
  const { React } = h;
  const mod = await import(url);
  const Model = mod.default;
  if (typeof Model !== 'function') throw new Error('The model file must export default a component');
  const group = new THREE.Group();
  group.name = 'Component model';
  const key = `m${h.portals.size}-${Math.random().toString(36).slice(2, 8)}`;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The model component took too long to load')), 20000);
    const Done = () => {
      React.useLayoutEffect(() => {
        clearTimeout(timer);
        resolve();
      }, []);
      return null;
    };
    class Boundary extends React.Component {
      constructor(p) {
        super(p);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error) {
        clearTimeout(timer);
        reject(error);
      }
      render() {
        return this.state.error ? null : this.props.children;
      }
    }
    const tree = React.createElement(Boundary, null, React.createElement(React.Suspense, { fallback: null }, React.createElement(Model, props), React.createElement(Done)));
    h.portals.set(key, React.createElement(React.Fragment, { key }, h.fiber.createPortal(tree, group)));
    h.render();
  });
  group.updateMatrixWorld(true);
  return group;
}

/**
 * Place a component's output at real size: bottom on the floor, centred on its footprint,
 * scaled to the item's dimensions if it's off (components should already be built to size).
 */
export function fitComponent(obj, dims) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return obj;
  const size = box.getSize(new THREE.Vector3());
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  const s = (want, have) => (have > 1e-4 && Math.abs(want / have - 1) > 0.03 ? want / have : 1);
  inner.scale.set(s(dims.w, size.x), s(dims.h, size.y), s(dims.d, size.z));
  wrap.add(inner);
  wrap.name = obj.name;
  return wrap;
}

/** Ready-to-place copy of an item's component model at its real size. */
export async function itemComponentModel(item, dims, color) {
  const url = new URL(`r3f-model/${encodeURIComponent(item.id)}.js?v=${encodeURIComponent(item.componentVersion || '')}`, location.href).href;
  const props = { width: dims.w, depth: dims.d, height: dims.h, color: color?.hex || '#bbbbbb', colorName: color?.name || '', accent: item.accent?.hex || null };
  const g = (await componentModel(url, props)).clone(true);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return fitComponent(g, dims);
}
