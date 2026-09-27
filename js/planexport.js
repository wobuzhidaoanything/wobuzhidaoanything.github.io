// 2D floor plan drawings to scale (like the "print plan" of RoomSketcher or Floorplanner):
// walls, doors with swings, windows, stairs with an UP arrow, room names and areas, furniture
// outlines, dimension chains, a scale bar and a title block. Drawn as SVG in millimetres on
// the paper, so 1:50 means 1 m = 20 mm when printed at 100 %. Saved as PNG or PDF.
import { footprint, wallUnion } from './plan.js';
import { wallFrame, area, pointInPolygon, closestOnSegment, stairLayout, toPlan, elevations, stairwellPolygon } from './design.js';
import { dimensionData } from './annotate.js';
import { doorSwing, footprintRect } from './clearance.js';

export const PAPERS = { A4: [297, 210], A3: [420, 297] }; // landscape, mm
const MARGIN = 12, TITLE_H = 22;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Plan extents of a floor including dimension chains (m). */
function extents(floor) {
  const pts = footprint(floor).flatMap((p) => p[0]);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const pad = 1.6; // room for the dimension chains
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad };
}

/** The largest standard scale (1:20 … 1:500) at which the floor fits the paper. */
export function fitScale(floor, paper = 'A4') {
  const e = extents(floor);
  if (!e) return 100;
  const [W, H] = PAPERS[paper];
  const aw = W - 2 * MARGIN, ah = H - 2 * MARGIN - TITLE_H;
  for (const s of [20, 25, 50, 75, 100, 125, 150, 200, 250, 500]) if (((e.x1 - e.x0) * 1000) / s <= aw && ((e.z1 - e.z0) * 1000) / s <= ah) return s;
  return 500;
}

/**
 * SVG for one floor. opts: { paper: 'A4'|'A3', scale: 50|100|…, furniture, dims, areas, itemById, dimsOf, title }
 * Returns { svg, width, height (mm), fits }.
 */
export function planSVG(design, fi, opts = {}) {
  const floor = design.floors[fi];
  const paper = opts.paper || 'A4';
  const [W, H] = PAPERS[paper];
  const scale = opts.scale || fitScale(floor, paper);
  const e = extents(floor) || { x0: 0, x1: 10, z0: 0, z1: 8 };
  const k = 1000 / scale; // mm on paper per metre
  const aw = W - 2 * MARGIN, ah = H - 2 * MARGIN - TITLE_H;
  const fits = (e.x1 - e.x0) * k <= aw + 0.01 && (e.z1 - e.z0) * k <= ah + 0.01;
  // Centre the drawing in the drawing area
  const ox = MARGIN + (aw - (e.x1 - e.x0) * k) / 2 - e.x0 * k;
  const oz = MARGIN + (ah - (e.z1 - e.z0) * k) / 2 - e.z0 * k;
  const X = (x) => +(ox + x * k).toFixed(2), Z = (z) => +(oz + z * k).toFixed(2);
  const P = (p) => `${X(p[0])},${Z(p[1])}`;
  const poly = (pts) => pts.map(P).join(' ');
  const out = [];
  const lw = (mm) => `stroke-width="${mm}"`;

  // Rooms: light tint, name and area
  for (const r of floor.rooms) out.push(`<polygon points="${poly(r.points)}" fill="#f7f5f1" stroke="none"/>`);
  // Furniture outlines (under the walls' ink)
  if (opts.furniture !== false && opts.itemById)
    for (const p of floor.placed) {
      const item = opts.itemById(p.itemId);
      if (!item) continue;
      const d = opts.dimsOf ? opts.dimsOf(item) : item.dims;
      out.push(`<polygon points="${poly(footprintRect(p, d))}" fill="#ffffff" stroke="#8a8f98" ${lw(0.18)}/>`);
    }
  // Stairs: treads and an UP arrow
  const ys = elevations(design);
  for (const s of floor.stairs) {
    if (fi >= design.floors.length - 1) continue;
    const L = stairLayout(s, ys[fi + 1] - ys[fi]);
    for (const rect of L.rects) out.push(`<polygon points="${poly(rect.map((q) => toPlan(s, q)))}" fill="#ffffff" stroke="#4a4f57" ${lw(0.25)}/>`);
    for (const f of L.flights) {
      const perp = [-f.dir[1], f.dir[0]];
      for (let i = 1; i < f.count; i++) {
        const c = [f.start[0] + f.dir[0] * L.going * i, f.start[1] + f.dir[1] * L.going * i];
        const a = toPlan(s, [c[0] + perp[0] * L.width / 2, c[1] + perp[1] * L.width / 2]);
        const b = toPlan(s, [c[0] - perp[0] * L.width / 2, c[1] - perp[1] * L.width / 2]);
        out.push(`<line x1="${X(a[0])}" y1="${Z(a[1])}" x2="${X(b[0])}" y2="${Z(b[1])}" stroke="#4a4f57" ${lw(0.15)}/>`);
      }
    }
    const f0 = L.flights[0];
    const a = toPlan(s, f0.start), b = toPlan(s, [f0.start[0] + f0.dir[0] * L.going * (f0.count - 0.5), f0.start[1] + f0.dir[1] * L.going * (f0.count - 0.5)]);
    out.push(`<line x1="${X(a[0])}" y1="${Z(a[1])}" x2="${X(b[0])}" y2="${Z(b[1])}" stroke="#2f6fed" ${lw(0.3)} marker-end="url(#arrow)"/>`);
    out.push(`<text x="${X(a[0])}" y="${Z(a[1]) + 3.2}" font-size="2.4" text-anchor="middle" fill="#2f6fed">UP</text>`);
  }
  // Stairwell openings from the stairs below (a dashed outline with a cross, as drawn on plans)
  if (fi > 0)
    for (const s of design.floors[fi - 1].stairs) {
      const well = stairwellPolygon(s, ys[fi] - ys[fi - 1]);
      out.push(`<polygon points="${poly(well)}" fill="#ffffff" stroke="#4a4f57" ${lw(0.2)} stroke-dasharray="1.2 0.8"/>`);
      out.push(`<line x1="${X(well[0][0])}" y1="${Z(well[0][1])}" x2="${X(well[2][0])}" y2="${Z(well[2][1])}" stroke="#8a8f98" ${lw(0.15)}/><line x1="${X(well[1][0])}" y1="${Z(well[1][1])}" x2="${X(well[3][0])}" y2="${Z(well[3][1])}" stroke="#8a8f98" ${lw(0.15)}/>`);
    }
  // Walls (solid), then openings cut out and drawn as symbols
  for (const p of wallUnion(floor)) {
    const d = p.map((ring) => 'M' + ring.map(P).join('L') + 'Z').join('');
    out.push(`<path d="${d}" fill="#2b2f35" fill-rule="evenodd" stroke="#2b2f35" ${lw(0.2)}/>`);
  }
  for (const o of floor.openings) {
    const w = floor.walls.find((x) => x.id === o.wall);
    if (!w) continue;
    const { dir, normal } = wallFrame(w);
    const t = w.thickness / 2 + 0.01;
    const at = (u, n) => [w.a[0] + dir[0] * u + normal[0] * n, w.a[1] + dir[1] * u + normal[1] * n];
    const u0 = o.offset, u1 = o.offset + o.width;
    out.push(`<polygon points="${poly([at(u0, t), at(u1, t), at(u1, -t), at(u0, -t)])}" fill="#ffffff" stroke="none"/>`);
    if (o.type === 'window') {
      for (const n of [t, -t, 0.02, -0.02]) {
        const a = at(u0, n), b = at(u1, n);
        out.push(`<line x1="${X(a[0])}" y1="${Z(a[1])}" x2="${X(b[0])}" y2="${Z(b[1])}" stroke="#2b2f35" ${lw(Math.abs(n) > 0.05 ? 0.25 : 0.15)}/>`);
      }
      for (const u of [u0, u1]) {
        const a = at(u, t), b = at(u, -t);
        out.push(`<line x1="${X(a[0])}" y1="${Z(a[1])}" x2="${X(b[0])}" y2="${Z(b[1])}" stroke="#2b2f35" ${lw(0.25)}/>`);
      }
    } else if (o.type === 'door') {
      const sw = doorSwing(floor, o);
      if (sw) {
        const [pv, ...arc] = sw;
        out.push(`<polyline points="${poly(arc)}" fill="none" stroke="#4a4f57" ${lw(0.18)}/>`);
        out.push(`<line x1="${X(pv[0])}" y1="${Z(pv[1])}" x2="${X(arc.at(-1)[0])}" y2="${Z(arc.at(-1)[1])}" stroke="#2b2f35" ${lw(0.35)}/>`);
      }
    }
  }
  // Room names and areas
  for (const r of floor.rooms) {
    const [cx, cz] = labelPoint(r.points);
    out.push(`<text x="${X(cx)}" y="${Z(cz)}" font-size="3" font-weight="600" text-anchor="middle" fill="#1f2226">${esc(r.name || '')}</text>`);
    if (opts.areas !== false) out.push(`<text x="${X(cx)}" y="${Z(cz) + 3.6}" font-size="2.4" text-anchor="middle" fill="#6d7178">${Math.abs(area(r.points)).toFixed(1)} m²</text>`);
  }
  // Dimension chains
  if (opts.dims !== false)
    for (const d of dimensionData(floor)) {
      const A = [d.a[0] + d.n[0] * d.off, d.a[1] + d.n[1] * d.off], B = [d.b[0] + d.n[0] * d.off, d.b[1] + d.n[1] * d.off];
      const ext = (p, q) => out.push(`<line x1="${X(p[0] + d.n[0] * 0.08)}" y1="${Z(p[1] + d.n[1] * 0.08)}" x2="${X(q[0] + d.n[0] * 0.1)}" y2="${Z(q[1] + d.n[1] * 0.1)}" stroke="#4a4f57" ${lw(0.13)}/>`);
      ext(d.a, A);
      ext(d.b, B);
      out.push(`<line x1="${X(A[0])}" y1="${Z(A[1])}" x2="${X(B[0])}" y2="${Z(B[1])}" stroke="#4a4f57" ${lw(0.18)}/>`);
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      const dd = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
      for (const Q of [A, B]) {
        const tk = [(dd[0] + d.n[0]) * 0.07, (dd[1] + d.n[1]) * 0.07];
        out.push(`<line x1="${X(Q[0] - tk[0])}" y1="${Z(Q[1] - tk[1])}" x2="${X(Q[0] + tk[0])}" y2="${Z(Q[1] + tk[1])}" stroke="#2b2f35" ${lw(0.3)}/>`);
      }
      const m = [(A[0] + B[0]) / 2 + d.n[0] * 0.12, (A[1] + B[1]) / 2 + d.n[1] * 0.12];
      const ang = (Math.atan2(dd[1], dd[0]) * 180) / Math.PI;
      const up = ang > 90 || ang <= -90 ? ang + 180 : ang;
      out.push(`<text x="${X(m[0])}" y="${Z(m[1])}" font-size="2.2" text-anchor="middle" dominant-baseline="middle" fill="#1f2226" transform="rotate(${up.toFixed(1)} ${X(m[0])} ${Z(m[1])})">${d.value.toFixed(2)}</text>`);
    }
  // Scale bar (5 m) and title block
  const sbY = H - MARGIN - TITLE_H + 8, sbX = MARGIN;
  const bar = [];
  for (let i = 0; i < 5; i++) bar.push(`<rect x="${sbX + i * k}" y="${sbY}" width="${k}" height="1.6" fill="${i % 2 ? '#ffffff' : '#2b2f35'}" stroke="#2b2f35" ${lw(0.15)}/>`);
  bar.push(`<text x="${sbX}" y="${sbY + 5}" font-size="2.2" fill="#1f2226">0</text><text x="${sbX + 5 * k}" y="${sbY + 5}" font-size="2.2" text-anchor="end" fill="#1f2226">5 m</text>`);
  const date = new Date().toISOString().slice(0, 10);
  // North arrow (when the design has a site with north set)
  if (design.site && Number.isFinite(design.site.north)) {
    const cx = W - MARGIN - 124, cy = H - MARGIN - TITLE_H / 2 + 1;
    bar.push(`<g transform="rotate(${design.site.north} ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="6" fill="#fff" stroke="#2b2f35" ${lw(0.25)}/><path d="M${cx} ${cy - 5} L${cx + 2.2} ${cy + 2.5} L${cx} ${cy + 1} L${cx - 2.2} ${cy + 2.5} Z" fill="#2b2f35"/></g><text x="${cx}" y="${cy - 7}" font-size="2.6" font-weight="700" text-anchor="middle" fill="#1f2226">N</text>`);
  }
  const title = `<rect x="${W - MARGIN - 110}" y="${H - MARGIN - TITLE_H + 2}" width="110" height="${TITLE_H - 2}" fill="#ffffff" stroke="#2b2f35" ${lw(0.3)}/>
    <text x="${W - MARGIN - 106}" y="${H - MARGIN - TITLE_H + 9}" font-size="4" font-weight="700" fill="#1f2226">${esc(opts.title || design.name)}</text>
    <text x="${W - MARGIN - 106}" y="${H - MARGIN - TITLE_H + 14.5}" font-size="3" fill="#1f2226">${esc(floor.name)} · ${Math.round(footprint(floor).reduce((s, p) => s + Math.abs(area(p[0].slice(0, -1))), 0) * 10) / 10} m² gross</text>
    <text x="${W - MARGIN - 106}" y="${H - MARGIN - 3}" font-size="2.4" fill="#6d7178">Scale 1:${scale} on ${paper} · ${date} · Roomcraft</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#2f6fed"/></marker></defs>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${out.join('\n  ')}
  ${bar.join('\n  ')}
  ${title}
</svg>`;
  return { svg, width: W, height: H, scale, fits };
}

function labelPoint(pts) {
  let A = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const c = x0 * z1 - x1 * z0;
    A += c;
    cx += (x0 + x1) * c;
    cz += (z0 + z1) * c;
  }
  if (Math.abs(A) > 1e-9) (cx /= 3 * A), (cz /= 3 * A);
  if (pointInPolygon(cx, cz, pts)) return [cx, cz];
  let best = pts[0], bestD = -1;
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  for (let i = 1; i < 16; i++)
    for (let j = 1; j < 16; j++) {
      const x = Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 16, z = Math.min(...zs) + ((Math.max(...zs) - Math.min(...zs)) * j) / 16;
      if (!pointInPolygon(x, z, pts)) continue;
      let d = Infinity;
      for (let q = 0; q < pts.length; q++) d = Math.min(d, closestOnSegment([x, z], pts[q], pts[(q + 1) % pts.length]).dist);
      if (d > bestD) (bestD = d), (best = [x, z]);
    }
  return best;
}

/** Draw an SVG to a canvas at `dpi` (browser only). */
export async function svgToCanvas(svg, widthMm, heightMm, dpi = 300) {
  const px = (mm) => Math.round((mm / 25.4) * dpi);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise((res, rej) => ((img.onload = res), (img.onerror = () => rej(new Error('Could not draw the plan'))), (img.src = url)));
    const c = document.createElement('canvas');
    c.width = px(widthMm);
    c.height = px(heightMm);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A minimal PDF: one page per JPEG, each filling a page of the given size in mm.
 * pages: [{ jpeg: Uint8Array, widthPx, heightPx, widthMm, heightMm }]
 */
export function makePDF(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const add = (x) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    chunks.push(b);
    pos += b.length;
  };
  const obj = (n, body) => {
    offsets[n] = pos;
    add(`${n} 0 obj\n`);
    for (const b of [].concat(body)) add(b);
    add('\nendobj\n');
  };
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pt = (mm) => ((mm / 25.4) * 72).toFixed(2);
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const n = 3 + i * 3;
    const [w, h] = [pt(p.widthMm), pt(p.heightMm)];
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`);
    obj(n + 1, [`<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    obj(n + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const xref = pos;
  const count = 3 + pages.length * 3;
  add(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) out.set(c, o), (o += c.length);
  return out;
}
