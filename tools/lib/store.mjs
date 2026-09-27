// Device storage for designs and the furniture model library, in userdata/ (git-ignored;
// see paths.mjs): pulling the repo updates the software, never your designs.
//   userdata/designs/<id>.json   one house design (format 2, see js/design.js)
//   userdata/library.json        furniture models shared by all designs
//   userdata/.state/active       id of the design open in the app (agents edit this one by default)
// assets/library.json and assets/sample-house.json ship with the software and seed a new device.
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS, DESIGNS, LIBRARY, STATE, migrateLayout } from './paths.mjs';
import { migrate, normalize, validate } from '../../js/design.js';

export const DIR = DESIGNS;
const LIB = LIBRARY;
const ACTIVE = path.join(STATE, 'active');
const SHIPPED_LIB = path.join(ASSETS, 'library.json');
const SAMPLE = path.join(ASSETS, 'sample-house.json');

const safeId = (id) => {
  if (!/^[\w-]{1,64}$/.test(String(id))) throw new Error(`Invalid design id "${id}"`);
  return id;
};
const file = (id) => path.join(DIR, `${safeId(id)}.json`);
const readJSON = (f, d = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
// Write via a temp file so a crash never leaves half a design behind.
function writeJSON(f, v) {
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n');
  fs.renameSync(tmp, f);
}

/** Create userdata/ on first run: shipped models + the sample house. New shipped models merge in on later runs. */
export function ensureStore() {
  migrateLayout();
  fs.mkdirSync(DIR, { recursive: true });
  const shipped = readJSON(SHIPPED_LIB, { items: [] }).items || [];
  const lib = readJSON(LIB);
  if (!lib) writeJSON(LIB, { items: shipped });
  else {
    const ids = new Set(lib.items.map((i) => i.id));
    const add = shipped.filter((i) => !ids.has(i.id) && !(lib.removed || []).includes(i.id));
    if (add.length) writeJSON(LIB, { ...lib, items: [...lib.items, ...add] });
  }
  if (!listDesigns().length) {
    const sample = readJSON(SAMPLE);
    if (sample) {
      const d = normalize(sample);
      saveDesign(d, { by: 'setup' });
      setActive(d.id);
    }
  }
}

export function listDesigns() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const d = readJSON(path.join(DIR, f));
      return d && { id: d.id || f.slice(0, -5), name: d.name, updatedAt: d.updatedAt, floors: d.floors?.length || 0, updatedBy: d.updatedBy };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getDesign(id) {
  const d = readJSON(file(id));
  if (!d) throw new Error(`No design "${id}"`);
  return migrate(d);
}

export function saveDesign(d, { by = 'app' } = {}) {
  d = normalize(d);
  safeId(d.id);
  delete d.inventory; // models live in the shared library
  d.updatedAt = new Date().toISOString();
  d.updatedBy = by;
  writeJSON(file(d.id), d);
  return d;
}

export function deleteDesign(id) {
  fs.rmSync(file(id), { force: true });
  if (getActive() === id) fs.rmSync(ACTIVE, { force: true });
}

export function getActive() {
  try {
    const id = fs.readFileSync(ACTIVE, 'utf8').trim();
    if (id && fs.existsSync(file(id))) return id;
  } catch {}
  return listDesigns()[0]?.id || null;
}

export function setActive(id) {
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(ACTIVE, safeId(id));
}

export function getLibrary() {
  return readJSON(LIB, { items: [] });
}

export function saveLibrary(lib) {
  fs.mkdirSync(path.dirname(LIB), { recursive: true });
  writeJSON(LIB, { ...lib, updatedAt: new Date().toISOString() });
}

export { validate };
