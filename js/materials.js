// Procedural textures (drawn on canvas at startup, no downloads) and a material
// factory. Textures are greyscale so the chosen colour simply tints them.
import * as THREE from 'three';
import { materialKind } from '../shared/colors.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function noise(ctx, size, amount, r) {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const cache = {};
const tex = (key, make) => (cache[key] ||= make());

export const textures = {
  fabric: () =>
    tex('fabric', () =>
      canvasTexture(256, (ctx, s) => {
        const r = rng(7);
        ctx.fillStyle = '#e6e6e6';
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 2) {
          ctx.fillStyle = `rgba(0,0,0,${0.035 + r() * 0.03})`;
          ctx.fillRect(0, y, s, 1);
        }
        for (let x = 0; x < s; x += 2) {
          ctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.03})`;
          ctx.fillRect(x, 0, 1, s);
        }
        noise(ctx, s, 22, r);
      }, 4)
    ),
  wood: () =>
    tex('wood', () =>
      canvasTexture(512, (ctx, s) => {
        const r = rng(11);
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 90; i++) {
          const y0 = r() * s;
          ctx.strokeStyle = `rgba(60,40,20,${0.05 + r() * 0.12})`;
          ctx.lineWidth = 0.6 + r() * 2.2;
          ctx.beginPath();
          for (let x = 0; x <= s; x += 8) {
            const y = y0 + Math.sin(x / (40 + r() * 5) + i) * 3 + Math.sin(x / 130 + i * 0.7) * 6;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        noise(ctx, s, 14, r);
      }, 1)
    ),
  planks: () =>
    tex('planks', () =>
      canvasTexture(1024, (ctx, s) => {
        const r = rng(23);
        const rows = 8;
        const h = s / rows;
        for (let row = 0; row < rows; row++) {
          let x = -r() * s * 0.5;
          while (x < s) {
            const len = s * (0.35 + r() * 0.4);
            const shade = 205 + Math.floor(r() * 45);
            ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
            ctx.fillRect(x, row * h, len, h);
            for (let g = 0; g < 10; g++) {
              ctx.strokeStyle = `rgba(70,45,25,${0.04 + r() * 0.08})`;
              ctx.lineWidth = 0.5 + r() * 1.5;
              const gy = row * h + r() * h;
              ctx.beginPath();
              ctx.moveTo(x, gy);
              ctx.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 6, x + len * 0.6, gy + (r() - 0.5) * 6, x + len, gy);
              ctx.stroke();
            }
            ctx.fillStyle = 'rgba(40,25,15,0.35)';
            ctx.fillRect(x, row * h, 2, h);
            x += len;
          }
          ctx.fillStyle = 'rgba(40,25,15,0.4)';
          ctx.fillRect(0, row * h, s, 2);
        }
        noise(ctx, s, 10, r);
      }, 1)
    ),
  tiles: () =>
    tex('tiles', () =>
      canvasTexture(512, (ctx, s) => {
        const r = rng(5);
        const n = 4;
        const t = s / n;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const v = 225 + Math.floor(r() * 25);
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(i * t, j * t, t, t);
          }
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 3;
        for (let i = 0; i <= n; i++) {
          ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(s, i * t); ctx.stroke();
        }
        noise(ctx, s, 10, r);
      }, 1)
    ),
  carpet: () =>
    tex('carpet', () =>
      canvasTexture(256, (ctx, s) => {
        const r = rng(3);
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 55, r);
      }, 6)
    ),
  concrete: () =>
    tex('concrete', () =>
      canvasTexture(512, (ctx, s) => {
        const r = rng(9);
        ctx.fillStyle = '#d8d8d8';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 400; i++) {
          ctx.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
          ctx.beginPath();
          ctx.arc(r() * s, r() * s, 4 + r() * 40, 0, Math.PI * 2);
          ctx.fill();
        }
        noise(ctx, s, 18, r);
      }, 1)
    ),
  // Wall finishes (walls are UV-mapped at 1.5 m per texture repeat)
  wallpaper: () =>
    tex('wallpaper', () =>
      canvasTexture(512, (ctx, s) => {
        const r = rng(17);
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(0, 0, s, s);
        // Soft vertical stripes with a small repeating motif
        const n = 8, w = s / n;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.35)';
          ctx.fillRect(i * w, 0, w, s);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.09)';
        for (let i = 0; i < n; i += 2)
          for (let j = 0; j < 12; j++) {
            ctx.beginPath();
            ctx.ellipse(i * w + w / 2, (j + (i % 4 ? 0.5 : 0)) * (s / 12), w * 0.14, w * 0.24, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        noise(ctx, s, 6, r);
      }, 1)
    ),
  brick: () =>
    tex('brick', () =>
      canvasTexture(512, (ctx, s) => {
        const r = rng(21);
        ctx.fillStyle = '#b8b8b8'; // mortar
        ctx.fillRect(0, 0, s, s);
        const rows = 20, cols = 7, h = s / rows, w = s / cols;
        for (let j = 0; j < rows; j++)
          for (let i = -1; i < cols; i++) {
            const v = 150 + Math.floor(r() * 70);
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            const x = i * w + (j % 2 ? w / 2 : 0);
            ctx.fillRect(x + 2, j * h + 2, w - 4, h - 4);
          }
        noise(ctx, s, 14, r);
      }, 1)
    ),
  plaster: () =>
    tex('plaster', () =>
      canvasTexture(256, (ctx, s) => {
        const r = rng(13);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 8, r);
      }, 1)
    ),
};

/**
 * Material for a colour. `kind` may be forced ('fabric','wood','metal','glass','stone',
 * 'leather','plastic','matte','gloss','emissive'); otherwise it is guessed from the colour name.
 */
export function makeMaterial(hex, { kind, name, repeat = 1 } = {}) {
  kind = kind || materialKind(name);
  const color = new THREE.Color(hex || '#cccccc');
  switch (kind) {
    case 'wood': {
      const map = textures.wood().clone();
      map.repeat.set(repeat, repeat);
      map.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ color, map, roughness: 0.55 });
    }
    case 'metal':
      return new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.28 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, transmission: 0.85, thickness: 0.02, transparent: true, opacity: 0.45 });
    case 'stone':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.25, map: textures.concrete() });
    case 'leather':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.45, map: textures.fabric() });
    case 'plastic':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    case 'gloss':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.2 });
    case 'matte':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    case 'emissive':
      return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.8, side: THREE.DoubleSide });
    default:
      return new THREE.MeshStandardMaterial({ color, roughness: 0.92, map: textures.fabric() });
  }
}

export function floorMaterial(hex, kind = 'wood') {
  const map = ({ wood: textures.planks, tiles: textures.tiles, carpet: textures.carpet, concrete: textures.concrete }[kind] || textures.planks)();
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    map,
    roughness: kind === 'tiles' ? 0.3 : kind === 'carpet' ? 1 : kind === 'concrete' ? 0.7 : 0.55,
  });
}

/** Surface finishes for walls, floors and ceilings (the Paint tool). */
export const FINISHES = [
  { kind: 'paint', name: 'Paint', color: '#efebe4' },
  { kind: 'wallpaper', name: 'Wallpaper', color: '#d9cbb3' },
  { kind: 'tiles', name: 'Tiles', color: '#f2f2ef' },
  { kind: 'wood', name: 'Wood', color: '#b98a5a' },
  { kind: 'brick', name: 'Brick', color: '#b5654a' },
  { kind: 'stone', name: 'Stone', color: '#c9c4bb' },
  { kind: 'concrete', name: 'Concrete', color: '#b9b7b2' },
  { kind: 'carpet', name: 'Carpet', color: '#9c948a' },
];
export const FINISH_NAMES = Object.fromEntries(FINISHES.map((f) => [f.kind, f.name]));

const finishCache = new Map();
/** Shared material for a finish { kind, color }. */
export function finishMaterial(finish) {
  const kind = finish?.kind || 'paint';
  const color = finish?.color || '#efebe4';
  const key = `${kind}:${color}`;
  if (finishCache.has(key)) return finishCache.get(key);
  const c = new THREE.Color(color);
  const map = { paint: textures.plaster, wallpaper: textures.wallpaper, tiles: textures.tiles, wood: textures.planks, brick: textures.brick, stone: textures.concrete, concrete: textures.concrete, carpet: textures.carpet }[kind]?.();
  const rough = { paint: 0.95, wallpaper: 0.85, tiles: 0.25, wood: 0.6, brick: 0.9, stone: 0.5, concrete: 0.85, carpet: 1 }[kind] ?? 0.9;
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, map: map || null });
  m.name = `${FINISH_NAMES[kind] || kind} ${color}`;
  finishCache.set(key, m);
  return m;
}
