// Where things live.
//   assets/     shipped with the software (git): sample house, default furniture, textures
//   userdata/   yours, on this device only (git-ignored): back it up by copying the folder
//     designs/<id>.json   house designs
//     library.json        furniture model library
//     models/             downloaded 3D model files (.glb), served at /models/…
//     textures/           your own finish images (wallpaper, tiles…), served at /textures/…
//     exports/            GLB / plan / quantities exports
//     .state/             app and agent state (active design, renders seen, chat, connections)
// ROOMCRAFT_USERDATA points it elsewhere (the tests use a temporary folder).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (the folder with index.html). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ASSETS = path.join(ROOT, 'assets');
export const USERDATA = path.resolve(process.env.ROOMCRAFT_USERDATA || path.join(ROOT, 'userdata'));
export const DESIGNS = path.join(USERDATA, 'designs');
export const LIBRARY = path.join(USERDATA, 'library.json');
export const MODELS = path.join(USERDATA, 'models');
export const TEXTURES = path.join(USERDATA, 'textures');
export const EXPORTS = path.join(USERDATA, 'exports');
export const STATE = path.join(USERDATA, '.state');

/**
 * Move data from the old layout (designs/, models/, exports/, .roomcraft/ at the repo root)
 * into userdata/. Only moves (never deletes or overwrites); anything already there wins.
 * Returns what moved.
 */
export function migrateLayout(root = ROOT, userdata = USERDATA) {
  const moved = [];
  const move = (from, to) => {
    if (!fs.existsSync(from) || fs.existsSync(to)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    moved.push(`${path.relative(root, from)} → ${path.relative(root, to)}`);
  };
  const oldDesigns = path.join(root, 'designs');
  if (fs.existsSync(oldDesigns) && fs.statSync(oldDesigns).isDirectory()) {
    move(path.join(oldDesigns, 'library.json'), path.join(userdata, 'library.json'));
    move(path.join(oldDesigns, '.active'), path.join(userdata, '.state', 'active'));
    for (const f of fs.readdirSync(oldDesigns)) if (f.endsWith('.json')) move(path.join(oldDesigns, f), path.join(userdata, 'designs', f));
    try {
      if (!fs.readdirSync(oldDesigns).length) fs.rmdirSync(oldDesigns);
    } catch {}
  }
  move(path.join(root, 'models'), path.join(userdata, 'models'));
  move(path.join(root, 'exports'), path.join(userdata, 'exports'));
  const oldState = path.join(root, '.roomcraft');
  if (fs.existsSync(oldState)) {
    for (const f of fs.readdirSync(oldState)) move(path.join(oldState, f), path.join(userdata, '.state', f));
    try {
      if (!fs.readdirSync(oldState).length) fs.rmdirSync(oldState);
    } catch {}
  }
  return moved;
}
