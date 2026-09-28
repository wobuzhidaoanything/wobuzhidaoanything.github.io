// Pictures pasted or dropped into the Assistant chat (product photos, sketches, screenshots of
// a size chart). Kept on this computer in userdata/.state/uploads/ so the agent can look at them
// with the view_images tool, and so the chat can show them again.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STATE } from './paths.mjs';

export const UPLOADS = path.join(STATE, 'uploads');
export const MAX_IMAGE = 8 * 1024 * 1024; // per picture
export const MAX_IMAGES = 6; // per message
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME = Object.fromEntries(Object.entries(TYPES).map(([m, e]) => [e, m]));
const NAME = /^[\w-]{1,80}\.(png|jpg|webp|gif)$/;

/** Save a data: URL image. Returns its file name. */
export function saveUpload(dataUrl) {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !TYPES[m[1]]) throw new Error('Only PNG, JPEG, WebP or GIF pictures can be attached.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMAGE) throw new Error(`That picture is over ${MAX_IMAGE / 1024 / 1024} MB.`);
  fs.mkdirSync(UPLOADS, { recursive: true });
  const name = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(5).toString('hex')}.${TYPES[m[1]]}`;
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  prune();
  return name;
}

/** A saved picture: { data, mimeType }, or null. */
export function readUpload(name) {
  if (!NAME.test(String(name || ''))) return null;
  const f = path.join(UPLOADS, name);
  if (!fs.existsSync(f)) return null;
  return { data: fs.readFileSync(f), mimeType: MIME[name.split('.').pop()] };
}

/** Keep the newest 300 pictures. */
function prune() {
  const files = fs.readdirSync(UPLOADS).filter((f) => NAME.test(f)).map((f) => ({ f, t: fs.statSync(path.join(UPLOADS, f)).mtimeMs }));
  if (files.length <= 300) return;
  files.sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(300)) fs.rmSync(path.join(UPLOADS, f), { force: true });
}
