import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (the folder with index.html). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
