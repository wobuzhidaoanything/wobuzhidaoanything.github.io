// Drawing annotations on the floor of the active level: dimension lines (like an architect's
// plan: one chain for every outside face, one overall chain per side) and an adaptive grid.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { footprint } from './plan.js';
import { area } from './design.js';

const INK = 0x4a4f57;
export const fmtM = (m) => `${m.toFixed(2)} m`;

function text(str, cls = 'dim-text') {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = str;
  const o = new CSS2DObject(el);
  o.center.set(0.5, 0.5);
  return o;
}

/**
 * One dimension: extension lines from `a`/`b` out to the dimension line at `off` metres along
 * the outward normal `n`, 45° ticks at both ends, and the length as text.
 */
function dimension(pts, labels, a, b, n, off, y, value = Math.hypot(b[0] - a[0], b[1] - a[1])) {
  const A = [a[0] + n[0] * off, a[1] + n[1] * off];
  const B = [b[0] + n[0] * off, b[1] + n[1] * off];
  const gap = 0.08, over = 0.1;
  const push = (p, q) => pts.push(p[0], y, p[1], q[0], y, q[1]);
  // extension lines (leave a small gap at the wall, run a little past the dimension line)
  push([a[0] + n[0] * gap, a[1] + n[1] * gap], [A[0] + n[0] * over, A[1] + n[1] * over]);
  push([b[0] + n[0] * gap, b[1] + n[1] * gap], [B[0] + n[0] * over, B[1] + n[1] * over]);
  push(A, B);
  // ticks
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  const t = [(d[0] + n[0]) * 0.09, (d[1] + n[1]) * 0.09];
  for (const P of [A, B]) push([P[0] - t[0], P[1] - t[1]], [P[0] + t[0], P[1] + t[1]]);
  const l = text(fmtM(value));
  l.position.set((A[0] + B[0]) / 2 + n[0] * 0.02, y, (A[1] + B[1]) / 2 + n[1] * 0.02);
  labels.push(l);
}

/**
 * Dimension chains for a floor as data: every outside face (offset 0.45 m) plus, for outlines
 * that aren't a plain rectangle, the overall width and depth (offset 1.05 m).
 * [{ a, b, n (outward unit normal), off, value }]
 */
export function dimensionData(floor) {
  const out = [];
  const polys = footprint(floor);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let corners = 0;
  for (const poly of polys) {
    corners += poly[0].length - 1;
    const ring = poly[0].slice(0, -1);
    const ccw = area(ring) > 0; // plan x right, z down
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      minX = Math.min(minX, a[0]), maxX = Math.max(maxX, a[0]), minZ = Math.min(minZ, a[1]), maxZ = Math.max(maxZ, a[1]);
      if (L < 0.3) continue; // too short to label cleanly
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      out.push({ a, b, n: ccw ? [d[1], -d[0]] : [-d[1], d[0]], off: 0.45, value: L });
    }
  }
  if (Number.isFinite(minX) && (corners > 4 || polys.length > 1)) {
    // Overall chain on the top and left sides (a plain rectangle doesn't need it)
    out.push({ a: [minX, minZ], b: [maxX, minZ], n: [0, -1], off: 1.05, value: maxX - minX });
    out.push({ a: [minX, maxZ], b: [minX, minZ], n: [-1, 0], off: 1.05, value: maxZ - minZ });
  }
  return out;
}

/** Dimension lines for a floor, drawn on the ground. */
export function buildDimensions(floor, y) {
  const g = new THREE.Group();
  g.name = 'Dimensions';
  g.userData.helper = true;
  const pts = [];
  const labels = [];
  for (const d of dimensionData(floor)) dimension(pts, labels, d.a, d.b, d.n, d.off, y, d.value);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.85, depthTest: false }));
  lines.renderOrder = 12;
  lines.userData.helper = true;
  g.add(lines, ...labels);
  return g;
}

/** Width × depth for rooms that are rectangles; null otherwise. */
export function roomSize(points) {
  if (points.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(dot) > 1e-3) return null;
  }
  const s1 = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
  const s2 = Math.hypot(points[2][0] - points[1][0], points[2][1] - points[1][1]);
  const horizontal = Math.abs(points[1][0] - points[0][0]) > Math.abs(points[1][1] - points[0][1]);
  return horizontal ? [s1, s2] : [s2, s1]; // [along x, along z]
}

/**
 * Floor grid that adapts to zoom: 1 m lines always, 10 cm lines fade in when they're far
 * enough apart on screen, everything fades out in the distance.
 */
export function buildGrid() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x2a2f36) }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vP;
      float grid(vec2 p, float step) {
        vec2 c = p / step;
        vec2 f = abs(fract(c - 0.5) - 0.5) / fwidth(c);
        return 1.0 - min(min(f.x, f.y), 1.0);
      }
      void main() {
        float px = max(fwidth(vP.x), fwidth(vP.y)); // metres per pixel here
        float minor = grid(vP, 0.1) * (1.0 - smoothstep(0.1 / 14.0, 0.1 / 6.0, px));
        float major = grid(vP, 1.0) * (1.0 - smoothstep(1.0 / 10.0, 1.0 / 3.0, px));
        float a = max(major * 0.32, minor * 0.13) * uOpacity;
        if (a < 0.005) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.name = 'Grid';
  m.renderOrder = 1;
  m.userData.helper = true;
  m.raycast = () => {}; // never picked
  return m;
}
