#!/usr/bin/env node
// Roomcraft CLI: the same operations as the MCP server, for scripts, pipes and agents without MCP.
//
//   node tools/cli.mjs read <url...>                 product info as JSON ("-" reads URLs from stdin; --photo saves the photo)
//   node tools/cli.mjs models                        list the furniture model library
//   node tools/cli.mjs add '<json>'                  add a model (fields as in the MCP add_item tool) and render it
//   node tools/cli.mjs update '<json>'               update a model ({"id": ..., ...}) and render it
//   node tools/cli.mjs render <itemId> [--color <name>] [--views three-quarter,front]
//   node tools/cli.mjs verify <itemId> --notes "<what you compared>" [--mismatch]
//   node tools/cli.mjs save-model <itemId> <glb-url>
//   node tools/cli.mjs designs                       list designs on this device
//   node tools/cli.mjs design [id]                   print a design (summary, problems, JSON)
//   node tools/cli.mjs write-design <file.json|->    save a design and render every floor
//   node tools/cli.mjs render-design [id] [--floors 0,1] [--views plan,3d] [--exterior]
//   node tools/cli.mjs stairs [id] [--floor 0] [--shape straight|L|U]
//   node tools/cli.mjs export [id] [--out house.glb] export a .glb for Blender
//
// Renders are written as PNG files to .roomcraft/renders/ (or --out <dir>); open them with your
// image/vision tool and look at them before verifying anything.
import fs from 'node:fs';
import path from 'node:path';
import * as A from './lib/agent.mjs';
import { ROOT, STATE } from './lib/paths.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const FLAGS_WITH_VALUE = new Set(['--color', '--views', '--out', '--notes', '--floors', '--floor', '--shape']);
const flag = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : def;
};
const positional = rest.filter((a, i) => !a.startsWith('--') && !FLAGS_WITH_VALUE.has(rest[i - 1]));
const out = (v) => process.stdout.write(JSON.stringify(v, null, 2) + '\n');

async function readStdin() {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

function writeShots(shots, prefix) {
  const dir = path.resolve(flag('out', path.join(STATE, 'renders')));
  fs.mkdirSync(dir, { recursive: true });
  return shots.map((s) => {
    const f = path.join(dir, `${prefix}-${s.view.replace(/[^\w-]+/g, '_')}.png`);
    fs.writeFileSync(f, s.png);
    return f;
  });
}

async function main() {
  switch (cmd) {
    case 'read': {
      let urls = positional;
      if (!urls.length || urls[0] === '-') urls = (await readStdin()).match(/https?:\/\/\S+/g) || [];
      if (!urls.length) throw new Error('Give one or more product URLs (or pipe them in).');
      for (const url of urls) {
        try {
          const { product, image } = await A.readLink(url);
          if (image && rest.includes('--photo')) product.photoFile = writeShots([{ view: 'photo', png: image.data }], (product.name || 'product').replace(/[^\w]+/g, '-').slice(0, 40))[0];
          out(product);
        } catch (err) {
          out({ url, error: err.message });
        }
      }
      break;
    }
    case 'models':
    case 'list':
      out(A.listModels());
      break;
    case 'add':
    case 'update': {
      const json = positional[0] && positional[0] !== '-' ? positional[0] : await readStdin();
      const args = JSON.parse(json);
      const { item } = cmd === 'add' ? await A.addItem(args) : A.updateItem(args);
      const files = writeShots((await A.renderItemImages(item.id)).shots, item.id);
      out({ item, renders: files, next: `Look at the render images, compare with the product photo, then run: node tools/cli.mjs verify ${item.id} --notes "..."` });
      break;
    }
    case 'render': {
      const id = positional[0];
      const { shots } = await A.renderItemImages(id, { color: flag('color'), views: flag('views')?.split(',') });
      out({ renders: writeShots(shots, id) });
      break;
    }
    case 'verify':
      out(A.verifyItem({ id: positional[0], matches: !rest.includes('--mismatch'), notes: flag('notes') }).item);
      break;
    case 'save-model': {
      const r = await A.saveModelFile({ id: positional[0], url: positional[1] });
      out({ ...r, renders: writeShots((await A.renderItemImages(r.item.id)).shots, r.item.id) });
      break;
    }
    case 'designs':
      out(A.listDesigns());
      break;
    case 'design':
      out(A.getDesign(positional[0]));
      break;
    case 'write-design': {
      const src = positional[0] && positional[0] !== '-' ? fs.readFileSync(positional[0], 'utf8') : await readStdin();
      const r = A.writeDesign(src);
      const shots = await A.renderDesignImages(r.id, { views: ['plan', '3d'] });
      out({ ...r, renders: writeShots(shots, r.id), next: 'Look at every floor render and compare with the floor plan; fix and write again if anything differs.' });
      break;
    }
    case 'render-design': {
      const shots = await A.renderDesignImages(positional[0], { floors: flag('floors')?.split(',').map(Number), views: flag('views')?.split(',') || ['plan', '3d'], exterior: rest.includes('--exterior') });
      out({ renders: writeShots(shots, positional[0] || 'design') });
      break;
    }
    case 'stairs':
      out(A.stairInfo(positional[0], +(flag('floor') || 0), flag('shape') || 'straight'));
      break;
    case 'export':
      out(await A.exportGLB(positional[0], flag('out')));
      break;
    default:
      process.stdout.write(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n') + '\n');
  }
}

main()
  .catch((err) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeRenderer } = await import('./lib/render.mjs').catch(() => ({}));
    await closeRenderer?.();
  });
