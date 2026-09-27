// React Three Fiber for furniture models written as components (userdata/models/<id>.jsx).
// The app itself is plain JS; only these model components use React/R3F.
//
// - runtime(): bundles react, react/jsx-runtime, @react-three/fiber and @react-three/drei once
//   (esbuild, code-split so they share one React) with `three` left external, so components
//   use the app's own three.js. Served at /r3f/<file>.js; the import map points the bare
//   names there.
// - compileComponent(id): compiles userdata/models/<id>.jsx to an ES module (JSX → react/jsx-runtime),
//   served at /r3f-model/<id>.js. Only react, three, @react-three/fiber and @react-three/drei
//   may be imported.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { ROOT, MODELS, STATE } from './paths.mjs';

const require = createRequire(import.meta.url);
const CACHE = path.join(STATE, 'cache', 'r3f');
export const ALLOWED_IMPORTS = ['react', 'react/jsx-runtime', 'three', '@react-three/fiber', '@react-three/drei'];

const REACT_EXPORTS = [
  'Children', 'Component', 'Fragment', 'PureComponent', 'StrictMode', 'Suspense', 'cloneElement', 'createContext', 'createElement',
  'createRef', 'forwardRef', 'isValidElement', 'lazy', 'memo', 'startTransition', 'use', 'useCallback', 'useContext', 'useDeferredValue',
  'useEffect', 'useId', 'useImperativeHandle', 'useInsertionEffect', 'useLayoutEffect', 'useMemo', 'useReducer', 'useRef', 'useState',
  'useSyncExternalStore', 'useTransition', 'version',
];

// Entry files: react is CommonJS, so its named exports are listed explicitly.
const ENTRIES = {
  react: `import * as R from 'react';\nexport default R;\nexport const { ${REACT_EXPORTS.join(', ')} } = R;\n`,
  'jsx-runtime': `import * as J from 'react/jsx-runtime';\nexport const { jsx, jsxs, Fragment } = J;\n`,
  fiber: `export * from '@react-three/fiber';\n`,
  drei: `export * from '@react-three/drei';\n`,
};

function versionKey() {
  const v = (p) => {
    try {
      return require(`${p}/package.json`).version;
    } catch {
      return '?';
    }
  };
  return crypto.createHash('sha1').update(['react', '@react-three/fiber', '@react-three/drei', 'three'].map(v).join('|') + JSON.stringify(ENTRIES)).digest('hex').slice(0, 10);
}

let building = null;
/** Build (once per package versions) and return the folder with the runtime files. */
export function runtime() {
  const dir = path.join(CACHE, versionKey());
  if (fs.existsSync(path.join(dir, 'drei.js'))) return Promise.resolve(dir);
  building ||= (async () => {
    const esbuild = await import('esbuild');
    const src = path.join(CACHE, 'src');
    fs.mkdirSync(src, { recursive: true });
    for (const [name, code] of Object.entries(ENTRIES)) fs.writeFileSync(path.join(src, `${name}.js`), code);
    await esbuild.build({
      entryPoints: Object.keys(ENTRIES).map((n) => path.join(src, `${n}.js`)),
      absWorkingDir: ROOT,
      nodePaths: [path.join(ROOT, 'node_modules')],
      bundle: true,
      splitting: true,
      format: 'esm',
      outdir: dir,
      minify: true,
      external: ['three', 'three/*'],
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      legalComments: 'none',
    });
    return dir;
  })().finally(() => (building = null));
  return building;
}

/** Path of a served runtime file, or null. */
export async function runtimeFile(name) {
  if (!/^[\w.-]+\.js$/.test(name)) return null;
  const f = path.join(await runtime(), name);
  return fs.existsSync(f) ? f : null;
}

export const componentPath = (id) => {
  if (!/^[\w-]{1,80}$/.test(id)) throw new Error(`Invalid model id "${id}"`);
  return path.join(MODELS, `${id}.jsx`);
};

/** Compile JSX source to an ES module. Throws a readable error for syntax errors or disallowed imports. */
export async function compileSource(code, name = 'model.jsx') {
  const esbuild = await import('esbuild');
  let out;
  try {
    out = await esbuild.transform(code, { loader: 'jsx', jsx: 'automatic', format: 'esm', sourcefile: name, target: 'es2022' });
  } catch (err) {
    const e = err.errors?.[0];
    throw new Error(e ? `${name}:${e.location?.line}:${e.location?.column}: ${e.text}` : err.message);
  }
  const bad = [...out.code.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => m[1] || m[2])
    .filter((s) => !ALLOWED_IMPORTS.includes(s) && !s.startsWith('three/'));
  if (bad.length) throw new Error(`Only ${ALLOWED_IMPORTS.join(', ')} can be imported (found: ${[...new Set(bad)].join(', ')}).`);
  if (!/export\s+default|export\s*\{[^}]*\bdefault\b/.test(out.code)) throw new Error('The file must `export default` a component: export default function Model({ width, depth, height, color }) { … }');
  return out.code;
}

const compiled = new Map(); // id -> { mtime, code }
/** Compiled module for userdata/models/<id>.jsx (cached until the file changes). */
export async function compileComponent(id) {
  const f = componentPath(id);
  const st = fs.statSync(f);
  const hit = compiled.get(id);
  if (hit && hit.mtime === st.mtimeMs) return hit.code;
  const code = await compileSource(fs.readFileSync(f, 'utf8'), `${id}.jsx`);
  compiled.set(id, { mtime: st.mtimeMs, code });
  return code;
}
