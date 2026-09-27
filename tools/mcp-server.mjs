#!/usr/bin/env node
// Roomcraft MCP server (stdio). Lets any MCP-capable agent read product links,
// add/update three.js furniture models in data/project.json, and see renders.
// Start: `node tools/mcp-server.mjs` (agents launch it for you; see docs/MCP.md).
import readline from 'node:readline';
import {
  readLink, listItems, addItem, updateItem, verifyItem, renderItemImages, renderRoomImages, saveModelFile, CATEGORIES,
} from './lib/agent.mjs';

const SERVER = { name: 'roomcraft', version: '1.0.0' };

const colorSchema = {
  type: 'array',
  description: 'Colour/finish options the product comes in, with realistic hex values. Name wood finishes with a wood word (oak, walnut…).',
  items: { type: 'object', properties: { name: { type: 'string' }, hex: { type: 'string', description: '#rrggbb' } }, required: ['name', 'hex'] },
};
const accentSchema = { type: 'object', description: 'Optional legs/frame colour', properties: { name: { type: 'string' }, hex: { type: 'string' } }, required: ['hex'] };

const VISION_RULE =
  'Every model you add or change starts as unverified. You MUST look at the returned render images, compare them with the product photo (from read_link), and then call verify_item. Fix mismatches with update_item and look again.';

const TOOLS = [
  {
    name: 'read_link',
    description: 'Read a product page (IKEA, Amazon, Wayfair, Shopify stores, most shops). Returns name, dimensions (cm), colour options, category, 3D model URL if any, and the product photo as an image so you can see the real product.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'Product page URL' } }, required: ['url'] },
  },
  {
    name: 'list_items',
    description: 'List the model inventory (ids, sizes, colours, verified status) and what is placed in the room.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_item',
    description: `Add a furniture model to the inventory (data/project.json). Give real product dimensions in cm. Pass from_url to prefill from a product link; explicit fields override it. Returns renders of the new model. ${VISION_RULE}`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', enum: CATEGORIES, description: 'Decides how the 3D model is generated' },
        width_cm: { type: 'number', description: 'Side to side, facing the item' },
        depth_cm: { type: 'number', description: 'Front to back' },
        height_cm: { type: 'number', description: 'Overall height (incl. backrest/headboard)' },
        colors: colorSchema,
        accent: accentSchema,
        url: { type: 'string', description: 'Product page' },
        image: { type: 'string', description: 'Product photo URL' },
        model_url: { type: 'string', description: 'A .glb/.gltf 3D model URL, if the store has one' },
        from_url: { type: 'string', description: 'Product link to read first' },
      },
    },
  },
  {
    name: 'update_item',
    description: `Correct an existing model (any subset of fields; sizes in cm). Returns fresh renders. ${VISION_RULE}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }, name: { type: 'string' }, category: { type: 'string', enum: CATEGORIES },
        width_cm: { type: 'number' }, depth_cm: { type: 'number' }, height_cm: { type: 'number' },
        colors: colorSchema, accent: accentSchema, model_url: { type: 'string', description: 'Empty string removes it' },
        image: { type: 'string' }, url: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'render_item',
    description: 'Render an inventory model as images (views: three-quarter, front, side, top; grid squares are 1 m). Use this to look at a model before verifying it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        color: { type: 'string', description: 'Colour option name to show' },
        views: { type: 'array', items: { type: 'string', enum: ['three-quarter', 'front', 'side', 'top'] } },
      },
      required: ['id'],
    },
  },
  {
    name: 'verify_item',
    description: 'Record your visual check of a model after looking at its latest renders. Refused unless the current version has been rendered. Set matches=false if it does not look like the product (then fix it with update_item).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        matches: { type: 'boolean' },
        notes: { type: 'string', description: 'What you compared: shape, proportions, colours, size vs. the product photo' },
      },
      required: ['id', 'matches', 'notes'],
    },
  },
  {
    name: 'save_model_file',
    description: "Download a .glb 3D model into the repo's models/ folder and use it for an item (keeps a permanent copy). Returns renders to check.",
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, url: { type: 'string' } }, required: ['id', 'url'] },
  },
  {
    name: 'render_room',
    description: 'Render the whole room from data/project.json (views: 3d, plan, eye). Use it to check layout edits visually.',
    inputSchema: { type: 'object', properties: { views: { type: 'array', items: { type: 'string', enum: ['3d', 'plan', 'eye'] } } } },
  },
];

const text = (t) => ({ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) });
const image = (buf, mimeType = 'image/png') => ({ type: 'image', data: Buffer.from(buf).toString('base64'), mimeType });

async function withRenders(summary, id) {
  try {
    const { shots } = await renderItemImages(id);
    return [
      text(summary),
      ...shots.flatMap((s) => [text(`Render: ${s.view} view`), image(s.png)]),
      text('Now look at these renders. Compare shape, proportions and colours with the real product (read_link shows its photo), then call verify_item.'),
    ];
  } catch (err) {
    return [text(summary), text(`Could not render (${err.message}). Fix that and call render_item before verify_item.`)];
  }
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'read_link': {
      const { product, image: photo } = await readLink(args.url);
      const cm = (m) => (m ? Math.round(m * 1000) / 10 : null);
      const out = [text({ ...product, dims_cm: { width: cm(product.dims.w), depth: cm(product.dims.d), height: cm(product.dims.h) }, dims: undefined })];
      if (photo) out.push(text('Product photo:'), image(photo.data, photo.mimeType));
      else out.push(text('No product photo could be fetched.'));
      out.push(text('To add it: add_item with from_url (override any wrong or missing fields), then check the renders.'));
      return out;
    }
    case 'list_items':
      return [text(listItems())];
    case 'add_item': {
      const { item, version } = await addItem(args);
      return withRenders(`Added "${item.name}" as ${item.id} (${item.category}, ${Math.round(item.dims.w * 100)}×${Math.round(item.dims.d * 100)}×${Math.round(item.dims.h * 100)} cm, colours: ${item.colors.map((c) => c.name).join(', ')}). Project version ${version}. Status: UNVERIFIED.`, item.id);
    }
    case 'update_item': {
      const { item, version } = updateItem(args);
      return withRenders(`Updated ${item.id}. Project version ${version}. Status: UNVERIFIED until you check the renders.`, item.id);
    }
    case 'render_item': {
      const { shots } = await renderItemImages(args.id, { color: args.color, views: args.views?.length ? args.views : undefined });
      return shots.flatMap((s) => [text(`${s.view} view`), image(s.png)]);
    }
    case 'verify_item': {
      const { item } = verifyItem(args);
      return [text(item.verified ? `${item.id} verified.` : `${item.id} marked as not matching. Fix it with update_item, look at the new renders, then verify again.`)];
    }
    case 'save_model_file': {
      const r = await saveModelFile(args);
      return withRenders(`Saved ${r.file} (${Math.round(r.bytes / 1024)} KB) and set it as the model for ${r.item.id}. Status: UNVERIFIED.`, r.item.id);
    }
    case 'render_room': {
      const shots = await renderRoomImages({ views: args.views?.length ? args.views : undefined });
      return shots.flatMap((s) => [text(`${s.view} view`), image(s.png)]);
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// ---------- JSON-RPC over stdio ----------

const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => id !== undefined && write({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && write({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: `Roomcraft: 3D room planner. data/project.json holds the house layout and the furniture model inventory (see AGENTS.md). ${VISION_RULE}`,
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call':
      try {
        return reply({ content: await callTool(params?.name, params?.arguments || {}) });
      } catch (err) {
        return reply({ content: [text(`Error: ${err.message}`)], isError: true });
      }
    case 'resources/list':
      return reply({ resources: [] });
    case 'prompts/list':
      return reply({ prompts: [] });
    default:
      if (method?.startsWith('notifications/')) return;
      return fail(-32601, `Method not found: ${method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  handle(msg).catch((err) => log('roomcraft mcp error:', err.stack || err));
});
rl.on('close', async () => {
  const { closeRenderer } = await import('./lib/render.mjs').catch(() => ({}));
  await closeRenderer?.();
  process.exit(0);
});
