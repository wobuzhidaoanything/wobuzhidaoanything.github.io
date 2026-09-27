import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planSVG, fitScale, makePDF } from '../../js/planexport.js';
import { floorQuantities, quantitiesCSV, roomSides } from '../../js/quantities.js';

const design = JSON.parse(fs.readFileSync(new URL('../../assets/sample-house.json', import.meta.url), 'utf8'));
const lib = JSON.parse(fs.readFileSync(new URL('../../assets/library.json', import.meta.url), 'utf8')).items;
const itemById = (id) => lib.find((i) => i.id === id);

test('plan drawing: to scale, fits the paper, has walls, doors, stairs, dimensions and a title', () => {
  const s = fitScale(design.floors[0], 'A4');
  assert.ok([50, 75, 100].includes(s), `scale ${s}`);
  const r = planSVG(design, 0, { paper: 'A4', scale: 100, itemById });
  assert.ok(r.fits);
  assert.match(r.svg, /<svg[^>]+width="297mm" height="210mm"/);
  assert.match(r.svg, />UP</);
  assert.match(r.svg, />10\.25</); // overall width
  assert.match(r.svg, /Scale 1:100 on A4/);
  assert.equal(planSVG(design, 0, { paper: 'A4', scale: 20 }).fits, false);
  assert.match(planSVG(design, 1, { paper: 'A4' }).svg, /stroke-dasharray/); // stairwell opening upstairs
});

test('PDF: valid header, one page per image, xref offsets point at their objects', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = Buffer.from(makePDF([{ jpeg, widthPx: 1, heightPx: 1, widthMm: 297, heightMm: 210 }, { jpeg, widthPx: 1, heightPx: 1, widthMm: 420, heightMm: 297 }]));
  const txt = pdf.toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4'));
  assert.equal((txt.match(/\/Type \/Page /g) || []).length, 2);
  const sx = +txt.match(/startxref\n(\d+)/)[1];
  assert.equal(txt.slice(sx, sx + 4), 'xref');
  [...txt.slice(sx).matchAll(/(\d{10}) 00000 n/g)].forEach((m, i) => assert.ok(txt.slice(+m[1]).startsWith(`${i + 1} 0 obj`)));
});

test('quantities: wall area = perimeter x height minus openings; flooring +10%; CSV rows', () => {
  const f = design.floors[0];
  const q = floorQuantities(f, { itemById });
  const living = q.rooms.find((r) => r.name === 'Living room');
  assert.ok(Math.abs(living.perimeter * f.height - living.openingArea - living.wallArea) < 1e-6);
  assert.ok(Math.abs(living.flooring.order - living.floorArea * 1.1) < 1e-9);
  assert.equal(roomSides(f, living.room).length, living.room.points.length);
  const csv = quantitiesCSV(design, { itemById });
  assert.match(csv, /^Floor,Room,What,Quantity,Unit,Notes/);
  assert.match(csv, /Living room,Skirting,/);
});
