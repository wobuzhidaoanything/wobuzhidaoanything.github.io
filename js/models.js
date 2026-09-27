// Parametric furniture generators. Each builds a detailed model from real
// dimensions (metres) and colours. Convention: origin at floor centre, width
// along X, depth along Z, front faces +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeMaterial } from './materials.js';
import { materialKind } from '../shared/colors.js';

export const CATEGORY_LABELS = {
  sofa: 'Sofa', armchair: 'Armchair', chair: 'Chair', stool: 'Stool', ottoman: 'Ottoman / pouf',
  bed: 'Bed', wardrobe: 'Wardrobe', bookshelf: 'Bookshelf', dresser: 'Dresser / drawers',
  nightstand: 'Nightstand', sideboard: 'Sideboard / cabinet', tvstand: 'TV stand', desk: 'Desk',
  table: 'Dining table', coffeetable: 'Coffee table', sidetable: 'Side table', floorlamp: 'Floor lamp',
  lamp: 'Table lamp', rug: 'Rug', plant: 'Plant', tv: 'TV', mirror: 'Mirror', curtain: 'Curtain', box: 'Generic box',
};

// Typical sizes (m) used when a link has no dimensions.
export const DEFAULT_DIMS = {
  sofa: [2.1, 0.92, 0.84], armchair: [0.82, 0.85, 0.85], chair: [0.46, 0.52, 0.82], stool: [0.4, 0.4, 0.65],
  ottoman: [0.5, 0.5, 0.42], bed: [1.6, 2.1, 1.0], wardrobe: [1.5, 0.6, 2.0], bookshelf: [0.8, 0.3, 1.8],
  dresser: [1.0, 0.48, 0.8], nightstand: [0.45, 0.4, 0.55], sideboard: [1.6, 0.45, 0.8], tvstand: [1.6, 0.4, 0.5],
  desk: [1.2, 0.6, 0.75], table: [1.8, 0.9, 0.75], coffeetable: [1.1, 0.6, 0.42], sidetable: [0.5, 0.5, 0.55],
  floorlamp: [0.4, 0.4, 1.6], lamp: [0.3, 0.3, 0.5], rug: [2.0, 3.0, 0.01], plant: [0.5, 0.5, 1.2],
  tv: [1.45, 0.25, 0.9], mirror: [0.6, 0.05, 1.7], curtain: [1.4, 0.1, 2.5], box: [0.6, 0.6, 0.6],
};

function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  s ||= 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Builder {
  constructor() {
    this.group = new THREE.Group();
  }
  add(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
  // Box by size with its *bottom* at y, centred at x/z.
  box(w, h, d, mat, x = 0, y = 0, z = 0, radius = 0.01) {
    const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const geo = r > 0.002 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
    const m = this.add(new THREE.Mesh(geo, mat));
    m.position.set(x, y + h / 2, z);
    return m;
  }
  cyl(rTop, rBot, h, mat, x = 0, y = 0, z = 0, seg = 24, open = false) {
    const m = this.add(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat));
    m.position.set(x, y + h / 2, z);
    return m;
  }
  sphere(r, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
    const m = this.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  }
  legs(w, d, h, mat, { inset = 0.04, size = 0.04, round = false, taper = 0.7 } = {}) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - inset - size / 2);
        const z = sz * (d / 2 - inset - size / 2);
        if (round) this.cyl((size / 2) * 1, (size / 2) * taper, h, mat, x, 0, z, 12);
        else this.box(size, h, size, mat, x, 0, z, 0.004);
      }
  }
}

// ---------- seating ----------

function sofa(b, { w, d, h }, P, S, opts = {}) {
  const legH = clamp(h * 0.12, 0.04, 0.14);
  const seatTop = clamp(h * 0.52, 0.36, 0.48);
  const cushH = clamp(seatTop * 0.28, 0.08, 0.15);
  const armW = opts.single ? clamp(w * 0.14, 0.08, 0.2) : clamp(w * 0.07, 0.1, 0.24);
  const armTop = clamp(seatTop + 0.2, seatTop + 0.1, h - 0.05);
  const backT = clamp(d * 0.18, 0.12, 0.22);
  // Deep sofas (> 1.25 m) are treated as having a chaise on the right.
  const chaise = !opts.single && d > 1.25 && w > 1.6;
  const mainD = chaise ? clamp(d * 0.55, 0.85, 1.05) : d;
  const zMain = -d / 2 + mainD / 2;

  b.legs(w, mainD, legH, S, { inset: 0.05, size: 0.035, round: true });
  b.group.children.slice(-4).forEach((m) => (m.position.z += zMain));
  const baseH = seatTop - cushH - legH;
  b.box(w, baseH, mainD, P, 0, legH, zMain, 0.03);
  b.box(armW, armTop - legH, mainD, P, -w / 2 + armW / 2, legH, zMain, 0.05);
  if (!chaise) b.box(armW, armTop - legH, mainD, P, w / 2 - armW / 2, legH, zMain, 0.05);
  b.box(w - (chaise ? armW : 2 * armW), h - legH - 0.02, backT, P, chaise ? armW / 2 : 0, legH, -d / 2 + backT / 2, 0.05);

  const innerW = w - (chaise ? armW : 2 * armW);
  const x0 = -w / 2 + armW;
  const n = opts.single ? 1 : innerW > 1.9 ? 3 : innerW > 1.1 ? 2 : 1;
  const cw = innerW / n;
  const seatD = mainD - backT - 0.02;
  for (let i = 0; i < n; i++) {
    const cx = x0 + cw * (i + 0.5);
    const isChaise = chaise && i === n - 1;
    const sd = isChaise ? d - backT - 0.02 : seatD;
    b.box(cw - 0.012, cushH, sd, P, cx, seatTop - cushH, -d / 2 + backT + sd / 2 + 0.01, 0.045);
    const backH = clamp(h - seatTop - 0.03, 0.2, 0.55);
    const bc = b.box(cw - 0.02, backH, 0.17, P, cx, seatTop - 0.01, -d / 2 + backT + 0.07, 0.06);
    bc.rotation.x = -0.12;
  }
  if (chaise) {
    // Chaise extension base
    const extD = d - mainD;
    b.box(cw, baseH, extD, P, x0 + cw * (n - 0.5), legH, d / 2 - extD / 2, 0.03);
    b.legs(cw, extD, legH, S, { inset: 0.05, size: 0.035, round: true });
    b.group.children.slice(-4).forEach((m) => {
      m.position.x += x0 + cw * (n - 0.5);
      m.position.z += d / 2 - extD / 2;
    });
  }
  // Throw pillows
  if (!opts.single && w > 1.4) {
    for (const sx of [-1, 1]) {
      const p = b.box(0.42, 0.4, 0.12, P.userData.accent || P, sx * (w / 2 - armW - 0.28), seatTop - 0.02, -d / 2 + backT + 0.2, 0.06);
      p.rotation.set(-0.25, sx * -0.25, sx * 0.08);
    }
  }
}

function chair(b, { w, d, h }, P, S, name) {
  const office = /office|desk chair|gaming|task/i.test(name);
  if (office) {
    const seatH = clamp(h * 0.45, 0.42, 0.52);
    const r = Math.min(w, d) / 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = b.box(0.035, 0.03, r, S, Math.sin(a) * r * 0.5, 0.05, Math.cos(a) * r * 0.5, 0.01);
      leg.rotation.y = a;
      b.sphere(0.03, S, Math.sin(a) * r * 0.95, 0.03, Math.cos(a) * r * 0.95);
    }
    b.cyl(0.025, 0.025, seatH - 0.14, S, 0, 0.07, 0);
    b.box(w * 0.9, 0.08, d * 0.85, P, 0, seatH - 0.08, 0.02, 0.035);
    const back = b.box(w * 0.85, h - seatH - 0.05, 0.07, P, 0, seatH + 0.05, -d * 0.4, 0.035);
    back.rotation.x = -0.1;
    b.box(0.04, 0.2, 0.04, S, 0, seatH - 0.02, -d * 0.4);
    for (const sx of [-1, 1]) b.box(0.05, 0.03, d * 0.45, S, sx * w * 0.45, seatH + 0.18, 0, 0.01);
    return;
  }
  const seatH = clamp(h * 0.55, 0.4, 0.48);
  const seatT = 0.045;
  b.legs(w, d, seatH - seatT, S, { inset: 0.02, size: 0.032, round: true, taper: 0.6 });
  const upholstered = materialKind(P.name) === 'fabric';
  b.box(w, seatT + (upholstered ? 0.03 : 0), d, P, 0, seatH - seatT, 0, 0.02);
  for (const sx of [-1, 1]) b.box(0.03, h - seatH, 0.03, S, sx * (w / 2 - 0.035), seatH, -d / 2 + 0.035, 0.005);
  const backH = clamp((h - seatH) * 0.55, 0.12, 0.4);
  const back = b.box(w - 0.02, backH, 0.03 + (upholstered ? 0.03 : 0), P, 0, h - backH, -d / 2 + 0.04, 0.015);
  back.rotation.x = -0.08;
}

function stool(b, { w, d, h }, P, S) {
  const r = Math.min(w, d) / 2;
  b.cyl(r, r * 0.95, 0.05, P, 0, h - 0.05, 0, 32);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = b.cyl(0.015, 0.013, h - 0.04, S, Math.sin(a) * r * 0.75, 0, Math.cos(a) * r * 0.75, 10);
    leg.rotation.set(Math.cos(a) * -0.06, 0, Math.sin(a) * 0.06);
  }
  if (h > 0.55) {
    const ring = b.add(new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, 0.01, 8, 32), S));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h * 0.32;
  }
}

function ottoman(b, { w, d, h }, P, S, name) {
  const round = /pouf|pouffe|round/i.test(name) || Math.abs(w - d) < 0.05;
  if (round) {
    // Soft drum: a squashed sphere capped by a flat top.
    const m = b.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), P));
    m.scale.set(w, h * 1.12, d);
    m.position.y = h / 2;
    b.cyl(w * 0.42, w * 0.42, 0.02, P, 0, h - 0.02, 0, 32);
    return;
  }
  const legH = clamp(h * 0.18, 0.03, 0.1);
  b.legs(w, d, legH, S, { inset: 0.04, size: 0.03, round: true });
  b.box(w, h - legH, d, P, 0, legH, 0, 0.05);
}

// ---------- beds ----------

function bed(b, { w, d, h }, P, S, name, rand) {
  const legH = 0.1;
  const frameH = 0.22;
  const upholstered = materialKind(P.name) === 'fabric';
  const headT = 0.08;
  b.legs(w, d, legH, S, { inset: 0.05, size: 0.05 });
  b.box(w, frameH, d - headT, P, 0, legH, headT / 2, 0.02);
  b.box(w, clamp(h, 0.5, 1.6), headT, P, 0, 0, -d / 2 + headT / 2, upholstered ? 0.03 : 0.01);
  if (upholstered) {
    const panels = Math.max(2, Math.round(w / 0.4));
    for (let i = 0; i < panels; i++) {
      const pw = (w - 0.08) / panels;
      b.box(pw - 0.015, clamp(h, 0.5, 1.6) - legH - frameH - 0.12, 0.04, P, -w / 2 + 0.04 + pw * (i + 0.5), legH + frameH + 0.05, -d / 2 + headT + 0.01, 0.02);
    }
  }
  const matT = 0.22;
  const top = legH + frameH;
  const white = makeMaterial('#f2efe9', { kind: 'fabric' });
  b.box(w - 0.05, matT, d - headT - 0.05, white, 0, top - 0.05, headT / 2, 0.06);
  const mTop = top - 0.05 + matT;
  const duvetMat = makeMaterial(rand() > 0.5 ? '#e9e5dc' : '#d9dde0', { kind: 'fabric' });
  const duvetD = (d - headT) * 0.68;
  b.box(w + 0.02, 0.07, duvetD, duvetMat, 0, mTop - 0.03, d / 2 - duvetD / 2, 0.035);
  b.box(w + 0.03, 0.26, 0.04, duvetMat, 0, mTop - 0.25, d / 2 + 0.005, 0.02);
  const throwMat = makeMaterial(P.color.getHexString() === 'f2efe9' ? '#9aa08f' : '#' + P.color.clone().multiplyScalar(0.8).getHexString(), { kind: 'fabric' });
  b.box(w + 0.04, 0.02, 0.4, throwMat, 0, mTop + 0.04, d / 2 - 0.35, 0.01);
  const nP = w > 1.2 ? 2 : 1;
  for (let i = 0; i < nP; i++) {
    const px = nP === 1 ? 0 : (i - 0.5) * (w / 2);
    const p = b.box(Math.min(0.62, w / nP - 0.08), 0.14, 0.4, white, px, mTop - 0.02, -d / 2 + headT + 0.28, 0.07);
    p.rotation.x = -0.35;
  }
}

// ---------- storage ----------

function handle(b, mat, x, y, z, vertical, len = 0.12) {
  const m = b.box(vertical ? 0.014 : len, vertical ? len : 0.014, 0.022, mat, x, y - (vertical ? len / 2 : 0.007), z + 0.011, 0.006);
  return m;
}

function wardrobe(b, { w, d, h }, P, S) {
  const plinth = 0.06;
  const metal = makeMaterial('#b9bcbe', { kind: 'metal' });
  b.box(w, plinth, d - 0.04, S, 0, 0, -0.02, 0.005);
  b.box(w, h - plinth, d - 0.02, P, 0, plinth, -0.01, 0.006);
  const n = w > 1.6 ? 3 : w > 0.8 ? 2 : 1;
  const dw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    b.box(dw - 0.006, h - plinth - 0.01, 0.02, P, x, plinth + 0.005, d / 2 - 0.01, 0.004);
    const side = i < n / 2 ? 1 : -1;
    handle(b, metal, x + side * (dw / 2 - 0.05), plinth + (h - plinth) * 0.55, d / 2, true, 0.3);
  }
}

function books(b, rand, x0, x1, y, depth, maxH) {
  let x = x0 + 0.02;
  const palette = ['#7b2d26', '#1f3b57', '#c9a54c', '#e6e1d6', '#2f4a35', '#aa6b39', '#333', '#b56576', '#6d597a'];
  while (x < x1 - 0.05) {
    if (rand() < 0.25) {
      x += 0.05 + rand() * 0.15;
      continue;
    }
    const run = 3 + Math.floor(rand() * 8);
    for (let i = 0; i < run && x < x1 - 0.04; i++) {
      const bw = 0.02 + rand() * 0.025;
      const bh = Math.min(maxH - 0.02, 0.16 + rand() * 0.12);
      const mat = makeMaterial(palette[Math.floor(rand() * palette.length)], { kind: 'matte' });
      const bk = b.box(bw, bh, depth * (0.7 + rand() * 0.2), mat, x + bw / 2, y, 0, 0.003);
      if (i === run - 1 && rand() < 0.3) {
        bk.rotation.z = -0.25;
        bk.position.x += 0.02;
      }
      x += bw + 0.002;
    }
    x += 0.04 + rand() * 0.1;
  }
}

function bookshelf(b, { w, d, h }, P, S, name, rand) {
  const t = 0.02;
  b.box(t, h, d, P, -w / 2 + t / 2, 0, 0, 0.003);
  b.box(t, h, d, P, w / 2 - t / 2, 0, 0, 0.003);
  b.box(w, t, d, P, 0, h - t, 0, 0.003);
  b.box(w, 0.06, d, P, 0, 0, 0, 0.003);
  b.box(w - 2 * t, h - 0.06, 0.008, P, 0, 0.06, -d / 2 + 0.004, 0);
  const cube = /kallax|cube/i.test(name);
  const rows = Math.max(1, Math.round((h - 0.08) / (cube ? 0.34 : 0.36)));
  const gap = (h - 0.06 - t) / rows;
  const cols = cube ? Math.max(1, Math.round(w / 0.34)) : w > 1.2 ? 2 : 1;
  for (let c = 1; c < cols; c++) b.box(t, h - 0.06 - t, d, P, -w / 2 + (w / cols) * c, 0.06, 0, 0.002);
  for (let r = 0; r <= rows; r++) {
    const y = 0.06 + gap * r;
    if (r > 0 && r < rows) b.box(w - 2 * t, t, d - 0.01, P, 0, y - t / 2, 0.005, 0.002);
    if (r < rows) {
      for (let c = 0; c < cols; c++) {
        const cx0 = -w / 2 + t + (w / cols) * c;
        const cx1 = -w / 2 + (w / cols) * (c + 1) - t;
        if (rand() < 0.8) books(b, rand, cx0, cx1, y + t / 2, d, gap - t);
        else {
          const pot = makeMaterial('#e8e4dc', { kind: 'gloss' });
          b.cyl(0.05, 0.04, 0.1, pot, (cx0 + cx1) / 2, y + t / 2, 0, 16);
          b.sphere(0.08, makeMaterial('#4d7050', { kind: 'matte' }), (cx0 + cx1) / 2, y + 0.17, 0, 1, 0.8, 1);
        }
      }
    }
  }
}

function drawers(b, { w, d, h }, P, S, rows, cols, legH) {
  const knob = makeMaterial('#b5954a', { kind: 'metal' });
  const bodyH = h - legH;
  b.box(w, bodyH, d - 0.02, P, 0, legH, -0.01, 0.008);
  const inset = 0.015;
  const dh = (bodyH - 2 * inset) / rows;
  const dw = (w - 2 * inset) / cols;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + inset + dw * (c + 0.5);
      const y = legH + inset + dh * r;
      b.box(dw - 0.006, dh - 0.006, 0.02, P, x, y + 0.003, d / 2 - 0.01, 0.004);
      handle(b, knob, x, y + dh / 2 + 0.007, d / 2, false, Math.min(0.14, dw * 0.35));
    }
}

function dresser(b, dims, P, S) {
  const legH = 0.08;
  b.legs(dims.w, dims.d, legH, S, { inset: 0.03, size: 0.035, round: true });
  drawers(b, dims, P, S, Math.max(2, Math.round((dims.h - legH) / 0.2)), dims.w > 1 ? 2 : 1, legH);
}

function nightstand(b, dims, P, S) {
  const legH = clamp(dims.h * 0.25, 0.08, 0.2);
  b.legs(dims.w, dims.d, legH, S, { inset: 0.02, size: 0.03, round: true });
  drawers(b, dims, P, S, dims.h - legH > 0.35 ? 2 : 1, 1, legH);
}

function sideboard(b, { w, d, h }, P, S, name) {
  const legH = clamp(h * 0.18, 0.06, 0.2);
  const metal = makeMaterial('#b9bcbe', { kind: 'metal' });
  b.legs(w, d, legH, S, { inset: 0.04, size: 0.035, round: true });
  b.box(w, h - legH, d - 0.02, P, 0, legH, -0.01, 0.008);
  const n = Math.max(1, Math.round(w / 0.45));
  const dw = (w - 0.03) / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.015 + dw * (i + 0.5);
    b.box(dw - 0.006, h - legH - 0.03, 0.02, P, x, legH + 0.015, d / 2 - 0.01, 0.004);
    handle(b, metal, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.04), legH + (h - legH) * 0.62, d / 2, true, 0.1);
  }
}

function tvstand(b, { w, d, h }, P, S, name, rand) {
  const legH = clamp(h * 0.2, 0.05, 0.15);
  b.legs(w, d, legH, S, { inset: 0.04, size: 0.035, round: true });
  b.box(w, h - legH, d - 0.02, P, 0, legH, -0.01, 0.008);
  // open middle compartment
  const dark = makeMaterial('#' + P.color.clone().multiplyScalar(0.55).getHexString(), { kind: 'matte' });
  const openW = w * 0.34;
  b.box(openW, (h - legH) * 0.6, 0.02, dark, 0, legH + (h - legH) * 0.2, d / 2 - 0.02, 0.003);
  const sideW = (w - openW) / 2;
  const knob = makeMaterial('#b5954a', { kind: 'metal' });
  for (const sx of [-1, 1]) {
    const x = sx * (openW / 2 + sideW / 2);
    b.box(sideW - 0.02, h - legH - 0.03, 0.02, P, x, legH + 0.015, d / 2 - 0.01, 0.004);
    handle(b, knob, x - sx * (sideW / 2 - 0.05), legH + (h - legH) / 2, d / 2, true, 0.08);
  }
}

// ---------- tables ----------

function table(b, { w, d, h }, P, S, name, rand, kind) {
  const round = /round|circular|oval|pedestal|tulip/i.test(name) || (kind === 'sidetable' && Math.abs(w - d) < 0.03);
  const topT = kind === 'coffeetable' ? 0.04 : 0.035;
  if (round) {
    const top = b.cyl(0.5, 0.5, topT, P, 0, h - topT, 0, 48);
    top.scale.set(w, 1, d);
    if (kind === 'table' || /pedestal|tulip/i.test(name)) {
      b.cyl(0.05, 0.06, h - topT, S, 0, 0, 0, 20);
      const foot = b.cyl(0.5, 0.5, 0.03, S, 0, 0, 0, 32);
      foot.scale.set(Math.min(w, d) * 0.55, 1, Math.min(w, d) * 0.55);
    } else {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.cyl(0.018, 0.012, h - topT, S, Math.sin(a) * w * 0.33, 0, Math.cos(a) * d * 0.33, 10);
      }
      if (kind === 'coffeetable') {
        const shelf = b.cyl(0.5, 0.5, 0.02, P, 0, h * 0.3, 0, 40);
        shelf.scale.set(w * 0.72, 1, d * 0.72);
      }
    }
    return;
  }
  b.box(w, topT, d, P, 0, h - topT, 0, 0.008);
  const legSize = kind === 'coffeetable' ? 0.045 : 0.05;
  b.legs(w, d, h - topT, S, { inset: kind === 'table' ? 0.06 : 0.03, size: legSize });
  if (kind === 'table' || kind === 'desk') {
    // apron
    b.box(w - 0.14, 0.07, 0.02, S, 0, h - topT - 0.07, d / 2 - 0.07, 0.003);
    b.box(w - 0.14, 0.07, 0.02, S, 0, h - topT - 0.07, -d / 2 + 0.07, 0.003);
  }
  if (kind === 'coffeetable' || kind === 'sidetable') b.box(w - 0.1, 0.02, d - 0.1, P, 0, h * 0.25, 0, 0.004);
  if (kind === 'desk' && w > 1.0) {
    const knob = makeMaterial('#b9bcbe', { kind: 'metal' });
    const uw = 0.4;
    const x = w / 2 - uw / 2 - 0.08;
    b.box(uw, 0.14, d - 0.12, P, x, h - topT - 0.14, 0, 0.004);
    handle(b, knob, x, h - topT - 0.07, (d - 0.12) / 2, false, 0.12);
  }
}

// ---------- lighting & decor ----------

function floorlamp(b, { w, d, h }, P, S) {
  const shadeH = clamp(h * 0.2, 0.2, 0.4);
  const shadeR = Math.min(w, d) / 2;
  b.cyl(shadeR * 0.6, shadeR * 0.65, 0.025, S, 0, 0, 0, 32);
  b.cyl(0.012, 0.012, h - shadeH * 0.6, S, 0, 0.025, 0, 10);
  const shade = b.cyl(shadeR * 0.75, shadeR, shadeH, makeMaterial(P.color.getHex(), { kind: 'emissive' }), 0, h - shadeH, 0, 32, true);
  shade.material.emissiveIntensity = 0.35;
  shade.castShadow = false;
  const light = new THREE.PointLight(0xffd9a8, 1.2, 4, 1.5);
  light.position.set(0, h - shadeH * 0.6, 0);
  b.group.add(light);
}

function lamp(b, { w, d, h }, P, S) {
  const r = Math.min(w, d) / 2;
  const baseH = h * 0.55;
  const base = b.sphere(r * 0.45, S, 0, baseH * 0.45, 0, 1, (baseH * 0.9) / (r * 0.9), 1);
  base.material = S;
  b.cyl(0.008, 0.008, h * 0.2, makeMaterial('#b5954a', { kind: 'metal' }), 0, baseH * 0.85, 0, 8);
  const shade = b.cyl(r * 0.7, r, h * 0.4, makeMaterial(P.color.getHex(), { kind: 'emissive' }), 0, h * 0.6, 0, 32, true);
  shade.material.emissiveIntensity = 0.35;
  const light = new THREE.PointLight(0xffd9a8, 0.6, 3, 1.5);
  light.position.set(0, h * 0.75, 0);
  b.group.add(light);
}

function rug(b, { w, d, h }, P, S, name) {
  const t = Math.max(h, 0.008);
  if (/round|circle/i.test(name) || Math.abs(w - d) < 0.02) {
    const m = b.cyl(0.5, 0.5, t, P, 0, 0, 0, 64);
    m.scale.set(w, 1, d);
    return;
  }
  const border = makeMaterial('#' + P.color.clone().multiplyScalar(0.7).getHexString(), { kind: 'fabric' });
  b.box(w, t, d, border, 0, 0, 0, 0.002);
  b.box(w - 0.12, t + 0.001, d - 0.12, P, 0, 0, 0, 0.002);
  b.group.children.forEach((m) => (m.castShadow = false));
}

function plant(b, { w, d, h }, P, S, name, rand) {
  const potH = clamp(h * 0.28, 0.15, 0.45);
  const potR = Math.min(w, d) * 0.32;
  b.cyl(potR, potR * 0.8, potH, P.userData.forcedPot ? P : makeMaterial(P.color.getHex(), { kind: 'gloss' }), 0, 0, 0, 24);
  b.cyl(potR * 0.95, potR * 0.95, 0.01, makeMaterial('#3a2a20', { kind: 'matte' }), 0, potH - 0.02, 0, 24);
  const greens = ['#3d6b3f', '#4d7a45', '#2f5a36', '#5c8a4f'].map((c) => makeMaterial(c, { kind: 'matte' }));
  const tall = h > 1.0;
  if (tall) b.cyl(0.015, 0.02, h * 0.55, makeMaterial('#5d4030', { kind: 'matte' }), 0, potH, 0, 8);
  const leaves = tall ? 40 : 24;
  for (let i = 0; i < leaves; i++) {
    const t = rand();
    const y = tall ? potH + (h - potH) * (0.35 + t * 0.6) : potH + (h - potH) * (0.1 + t * 0.8);
    const spread = (w / 2) * (tall ? 0.9 - t * 0.3 : 0.4 + t * 0.6);
    const a = rand() * Math.PI * 2;
    const leaf = b.sphere(0.07 + rand() * 0.05, greens[i % 4], Math.sin(a) * spread * rand(), y, Math.cos(a) * spread * rand(), 1.6, 0.35, 0.8);
    leaf.rotation.set(rand() - 0.5, a, rand() - 0.5);
  }
}

function tv(b, { w, d, h }, P, S) {
  const screenH = w * 0.5625;
  const standH = Math.max(0, h - screenH - 0.02);
  const frame = makeMaterial('#1a1a1c', { kind: 'gloss' });
  b.box(w, screenH, 0.04, frame, 0, standH, 0, 0.006);
  const screen = b.box(w - 0.02, screenH - 0.02, 0.002, new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.08, metalness: 0.4 }), 0, standH + 0.01, 0.021, 0);
  screen.castShadow = false;
  if (standH > 0.01) {
    for (const sx of [-1, 1]) {
      const f = b.box(0.04, standH + 0.02, 0.03, frame, sx * w * 0.38, 0, 0, 0.005);
      f.rotation.x = 0.2;
      b.box(0.05, 0.015, d * 0.9, frame, sx * w * 0.38, 0, 0, 0.005);
    }
  }
}

function mirror(b, { w, d, h }, P, S) {
  const frameT = 0.03;
  const depth = Math.max(0.025, Math.min(d, 0.05));
  const lean = h > 1.2 ? -0.08 : 0;
  const fb = new Builder();
  fb.box(w, h, depth, P, 0, 0, 0, 0.01);
  const glass = fb.box(w - 2 * frameT, h - 2 * frameT, 0.004, new THREE.MeshStandardMaterial({ color: 0xe8eef0, metalness: 1, roughness: 0.04 }), 0, frameT, depth / 2 + 0.001, 0);
  glass.castShadow = false;
  fb.group.rotation.x = lean;
  fb.group.position.z = lean ? d / 2 - depth / 2 : 0;
  b.group.add(fb.group);
}

function curtain(b, { w, d, h }, P) {
  const geo = new THREE.PlaneGeometry(w, h, Math.max(24, Math.round(w * 40)), 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w) * Math.PI * w * 12) * 0.035);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, P.clone());
  m.material.side = THREE.DoubleSide;
  m.position.y = h / 2;
  b.add(m);
  const rod = makeMaterial('#2a2a2a', { kind: 'metal' });
  const r = b.cyl(0.012, 0.012, w + 0.2, rod, 0, 0, 0, 10);
  r.rotation.z = Math.PI / 2;
  r.position.set(0, h + 0.02, 0);
}

function genericBox(b, { w, d, h }, P) {
  b.box(w, h, d, P, 0, 0, 0, Math.min(0.03, Math.min(w, d, h) * 0.1));
}

const GENERATORS = {
  sofa: (b, dims, P, S) => sofa(b, dims, P, S),
  armchair: (b, dims, P, S) => sofa(b, dims, P, S, { single: true }),
  chair, stool, ottoman, bed, wardrobe, bookshelf, dresser, nightstand, sideboard, tvstand,
  desk: (b, dims, P, S, n, r) => table(b, dims, P, S, n, r, 'desk'),
  table: (b, dims, P, S, n, r) => table(b, dims, P, S, n, r, 'table'),
  coffeetable: (b, dims, P, S, n, r) => table(b, dims, P, S, n, r, 'coffeetable'),
  sidetable: (b, dims, P, S, n, r) => table(b, dims, P, S, n, r, 'sidetable'),
  floorlamp, lamp, rug, plant, tv, mirror, curtain, box: genericBox,
};

// Secondary (legs/frame) material defaults per category.
function secondaryFor(category, primaryHex, primaryName, accent) {
  if (accent) return makeMaterial(accent.hex, { name: accent.name || accent.hex });
  const kind = materialKind(primaryName);
  if (['table', 'desk', 'coffeetable', 'sidetable', 'bookshelf', 'wardrobe', 'dresser', 'nightstand', 'sideboard', 'tvstand'].includes(category) && kind === 'wood')
    return makeMaterial(primaryHex, { kind: 'wood' });
  if (['floorlamp', 'lamp', 'stool'].includes(category)) return makeMaterial('#2b2b2b', { kind: 'metal' });
  if (category === 'plant') return makeMaterial('#e8e4dc', { kind: 'gloss' });
  return makeMaterial('#4a3426', { kind: 'wood' });
}

/**
 * Build a model. `color` = {name, hex}; `accent` optional {name, hex} for legs/frame.
 */
export function buildParametric({ category = 'box', dims, color, accent, name = '', seed = 'x' }) {
  const d = {
    w: Math.max(0.02, dims?.w || DEFAULT_DIMS[category]?.[0] || 0.6),
    d: Math.max(0.005, dims?.d || DEFAULT_DIMS[category]?.[1] || 0.6),
    h: Math.max(0.005, dims?.h || DEFAULT_DIMS[category]?.[2] || 0.6),
  };
  const hex = color?.hex || '#b8b2a7';
  const cname = color?.name || '';
  let kind = materialKind(cname);
  if (kind === 'fabric' && ['table', 'desk', 'coffeetable', 'sidetable', 'bookshelf', 'wardrobe', 'dresser', 'nightstand', 'sideboard', 'tvstand'].includes(category))
    kind = /white|black|grey|gray|anthracite|gloss/i.test(cname) ? 'plastic' : 'wood';
  if (/leather/i.test(cname) || /leather/i.test(name)) kind = 'leather';
  if (/velvet/i.test(cname) || /velvet/i.test(name)) kind = 'fabric';
  if (category === 'mirror' && kind === 'fabric') kind = 'wood';
  const P = makeMaterial(hex, { kind });
  P.name = cname;
  P.userData.accent = makeMaterial('#' + new THREE.Color(hex).offsetHSL(0, -0.05, 0.12).getHexString(), { kind: kind === 'leather' ? 'fabric' : kind });
  const S = secondaryFor(category, hex, cname, accent);
  const b = new Builder();
  (GENERATORS[category] || genericBox)(b, d, P, S, name, rng(seed));
  b.group.userData.dims = d;
  return b.group;
}

/** Recolour the dominant material of a loaded GLB (keeps its texture, tints it). */
export function tintModel(root, hex) {
  if (!hex) return;
  const areas = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) {
      const tri = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      areas.set(m, (areas.get(m) || 0) + tri);
    }
  });
  const sorted = [...areas.entries()].filter(([m]) => m.metalness < 0.5).sort((a, b) => b[1] - a[1]);
  const target = sorted[0]?.[0];
  if (!target) return;
  const key = target.userData.origName ?? (target.userData.origName = target.name);
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) if (m === target || (key && m.name === key)) m.color.set(hex);
  });
}
