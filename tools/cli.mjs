#!/usr/bin/env node
// Roomcraft CLI: the same operations as the MCP server, for scripts, pipes and agents without MCP.
//
//   node tools/cli.mjs read <url...>            product info as JSON (use "-" to read URLs from stdin)
//   node tools/cli.mjs add '<json>'              add a model (fields as in the MCP add_item tool)
//   node tools/cli.mjs update '<json>'           update a model ({"id": ..., ...})
//   node tools/cli.mjs list                      inventory + placed items
//   node tools/cli.mjs render <itemId> [--color <name>] [--views three-quarter,front] [--out dir]
//   node tools/cli.mjs render-room [--views 3d,plan] [--out dir]
//   node tools/cli.mjs verify <itemId> --notes "<what you compared>" [--mismatch]
//   node tools/cli.mjs save-model <itemId> <glb-url>
//
// Renders are written as PNG files; open them with your image/vision tool before verifying.
import fs from 'node:fs';
import path from 'node:path';
import { readLink, listItems, addItem, updateItem, verifyItem, renderItemImages, renderRoomImages, saveModelFile } from './lib/agent.mjs';
import { ROOT } from './lib/server.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : def;
};
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--') && !['--mismatch', '--photo'].includes(rest[i - 1])));
const out = (v) => process.stdout.write(JSON.stringify(v, null, 2) + '\n');

async function readStdin() {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

function writeShots(shots, prefix) {
  const dir = path.resolve(flag('out', path.join(ROOT, '.roomcraft', 'renders')));
  fs.mkdirSync(dir, { recursive: true });
  return shots.map((s) => {
    const f = path.join(dir, `${prefix}-${s.view}.png`);
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
          const { product, image } = await readLink(url);
          if (image && rest.includes('--photo')) {
            const f = writeShots([{ view: 'photo', png: image.data }], product.name?.replace(/[^\w]+/g, '-').slice(0, 40) || 'product');
            product.photoFile = f[0];
          }
          out(product);
        } catch (err) {
          out({ url, error: err.message });
        }
      }
      break;
    }
    case 'list':
      out(listItems());
      break;
    case 'add':
    case 'update': {
      const json = positional[0] && positional[0] !== '-' ? positional[0] : await readStdin();
      const args = JSON.parse(json);
      const { item, version } = cmd === 'add' ? await addItem(args) : updateItem(args);
      const files = writeShots((await renderItemImages(item.id)).shots, item.id);
      out({ item, version, renders: files, next: 'Open the render images, compare with the product photo, then run: verify ' + item.id + ' --notes "..."' });
      break;
    }
    case 'render': {
      const id = positional[0];
      const views = flag('views')?.split(',');
      const { shots } = await renderItemImages(id, { color: flag('color'), views });
      out({ renders: writeShots(shots, id) });
      break;
    }
    case 'render-room': {
      const shots = await renderRoomImages({ views: flag('views')?.split(',') });
      out({ renders: writeShots(shots, 'room') });
      break;
    }
    case 'verify':
      out(verifyItem({ id: positional[0], matches: !rest.includes('--mismatch'), notes: flag('notes') }).item);
      break;
    case 'save-model': {
      const r = await saveModelFile({ id: positional[0], url: positional[1] });
      out({ ...r, renders: writeShots((await renderItemImages(r.item.id)).shots, r.item.id) });
      break;
    }
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
