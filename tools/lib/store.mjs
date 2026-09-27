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

/** Thrown when a save is based on an older version than the one on disk (someone else saved). */
export class ConflictError extends Error {
  constructor(current) {
    super('This design was changed elsewhere since you opened it.');
    this.current = current;
  }
}

/**
 * Save a design. `base` = the updatedAt the change was based on: if the file on disk has moved
 * on since (an agent or another window saved), a ConflictError is thrown instead of overwriting.
 * The version being replaced is kept in the design's history.
 */
export function saveDesign(d, { by = 'app', base } = {}) {
  d = normalize(d);
  safeId(d.id);
  delete d.inventory; // models live in the shared library
  const prev = readJSON(file(d.id));
  if (prev && base && prev.updatedAt && prev.updatedAt !== base) throw new ConflictError(migrate(prev));
  if (prev) keepHistory(prev, { force: prev.updatedBy !== by });
  d.updatedAt = new Date().toISOString();
  d.updatedBy = by;
  fs.mkdirSync(DIR, { recursive: true }); // even if the folder was removed while running
  writeJSON(file(d.id), d);
  return d;
}

// ---------- version history (userdata/.state/history/<id>/<time>.json) ----------

const HISTORY = path.join(STATE, 'history');
const KEEP = 40, EVERY_MS = 120000;
const histDir = (id) => path.join(HISTORY, safeId(id));

/** Keep a copy of a design version: at most every 2 minutes, or always when `force` (e.g. a different editor). */
export function keepHistory(d, { force = false } = {}) {
  const dir = histDir(d.id);
  fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const last = files.at(-1);
  if (!force && last && Date.now() - fs.statSync(path.join(dir, last)).mtimeMs < EVERY_MS) return null;
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeJSON(path.join(dir, name), d);
  for (const f of files.slice(0, Math.max(0, files.length + 1 - KEEP))) fs.rmSync(path.join(dir, f), { force: true });
  return name;
}

export function listHistory(id) {
  const dir = histDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .map((f) => {
      const d = readJSON(path.join(dir, f));
      return d && { file: f, savedAt: d.updatedAt, by: d.updatedBy, name: d.name, floors: d.floors?.length || 0, rooms: d.floors?.reduce((s, x) => s + (x.rooms?.length || 0), 0) || 0, items: d.floors?.reduce((s, x) => s + (x.placed?.length || 0), 0) || 0 };
    })
    .filter(Boolean);
}

export function getHistory(id, name) {
  if (!/^[\w-]+\.json$/.test(name)) throw new Error('Invalid version');
  const d = readJSON(path.join(histDir(id), name));
  if (!d) throw new Error('No such version');
  return migrate(d);
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
