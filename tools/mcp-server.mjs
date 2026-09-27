#!/usr/bin/env node
// Roomcraft MCP server (stdio). Lets any MCP-capable agent read product links,
// add/update three.js furniture models in data/project.json, and see renders.
// Start: `node tools/mcp-server.mjs` (agents launch it for you; see docs/MCP.md).
import readline from 'node:readline';
import {
  readLink, listModels, addItem, updateItem, verifyItem, renderItemImages, saveModelFile, CATEGORIES,
  listDesigns, getDesign, writeDesign, renderDesignImages, exportGLB, stairInfo, placeItem, writeModelComponent, readModelComponent
} from './lib/agent.mjs';
import { recordConnection } from './lib/agents.mjs';
import { TRIANGLE_BUDGET } from './lib/shrink.mjs';

const SERVER = { name: 'roomcraft', version: '1.0.0' };

const colorSchema = {
  type: 'array',
  description: 'Colour/finish options the product comes in, with realistic hex values. Name wood finishes with a wood word (oak, walnut…).',
  items: { type: 'object', properties: { name: { type: 'string' }, hex: { type: 'string', description: '#rrggbb' } }, required: ['name', 'hex'] },
};
const accentSchema = { type: 'object', description: 'Optional legs/frame colour', properties: { name: { type: 'string' }, hex: { type: 'string' } }, required: ['hex'] };

const VISION_RULE =
  'Every model you add or change starts as unverified. You MUST look at the returned render images, compare them with the product photo (from read_link), and then call verify_item. Fix mismatches with update_item and look again.';

const DESIGN_FORMAT = `Design format (metres, see AGENTS.md): { name, wallColor, floors: [ { name, height (floor→ceiling), slab (thickness under this floor),
walls: [{id, a:[x,z], b:[x,z], thickness, exterior?}], openings: [{id, type:"door"|"window"|"opening", wall:<wall id>, offset (m from wall.a to the opening's near edge), width, height, sill (windows)}],
rooms: [{id, name, points:[[x,z]...], floorKind:"wood"|"tiles"|"carpet"|"concrete", floorColor}], stairs: [{id, shape:"straight"|"L"|"U", turn:"left"|"right", x, z, rot, width}] (stairs go up to the next floor; origin = bottom-centre of the first step, rot 0 climbs toward −z),
placed: [{id, itemId, x, z, rot, color, y?}] } ] }. x runs right, z runs down the plan (toward the viewer). Walls are centre lines; connect them end to end at corners.`;

const TOOLS = [
  {
    name: 'read_link',
    description: 'Read a product page (IKEA, Amazon, Wayfair, Shopify stores, most shops). Returns name, dimensions (cm), colour options, category, description, 3D model URL if any, and the product photos (up to 6) as images so you can see the real product from several angles.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'Product page URL' } }, required: ['url'] },
  },
  { name: 'list_models', description: 'List the furniture model library (ids, sizes, colours, verified status).', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'add_item',
    description: `Add a furniture model to the library. Give real product dimensions in cm. Pass from_url to prefill from a product link; explicit fields override it. Returns renders of the new model. ${VISION_RULE}`,
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
    name: 'write_model_component',
    description: `Build a model's 3D shape as a React Three Fiber component when the generated shape for its category can't match the product (unusual shapes, curves, details) and there's no store 3D file. Pass the full JSX source; it's saved as userdata/models/<id>.jsx and replaces the generated shape. Rules: \`export default function Model({ width, depth, height, color, colorName, accent })\` (metres, colours as #hex); build at that real size with the bottom at y = 0, centred on x/z, front facing +z; imports only from react, three, @react-three/fiber and @react-three/drei (e.g. RoundedBox, Cylinder, Torus, Extrude/Lathe via three); use meshStandardMaterial / meshPhysicalMaterial with the given colours; no textures from the internet, no animation. Returns renders. ${VISION_RULE} See docs/R3F-MODELS.md in the repo for examples.`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Existing library model id (create it first with add_item)' }, code: { type: 'string', description: 'Complete .jsx source' } },
      required: ['id', 'code'],
    },
  },
  {
    name: 'get_model_component',
    description: "Read the current React Three Fiber component source of a model (if it has one), to improve it with write_model_component.",
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'render_item',
    description: 'Render a library model as images (views: three-quarter, front, side, top; grid squares are 1 m). Look at the result before verifying.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, color: { type: 'string', description: 'Colour option name to show' }, views: { type: 'array', items: { type: 'string', enum: ['three-quarter', 'front', 'side', 'top'] } } },
      required: ['id'],
    },
  },
  {
    name: 'verify_item',
    description: 'Record your visual check of a model after looking at its latest renders. Refused unless the current version has been rendered. matches=false if it does not look like the product (then fix it with update_item).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, matches: { type: 'boolean' }, notes: { type: 'string', description: 'What you compared: shape, proportions, colours, size vs. the product photo' } }, required: ['id', 'matches', 'notes'] },
  },
  {
    name: 'save_model_file',
    description: "Download a store .glb 3D model into userdata/models/ on this computer, compressed to the 5 MB budget (textures ≤1024 px, simplified only if needed) and use it for a model (keeps a permanent copy). Returns renders to check.",
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, url: { type: 'string' } }, required: ['id', 'url'] },
  },
  { name: 'list_designs', description: 'List the house designs saved on this device, and which one is open in the app (active).', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'get_design',
    description: 'Get a design (default: the active one): a floor-by-floor summary, any problems, and the full JSON to edit. ' + DESIGN_FORMAT,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
  },
  {
    name: 'write_design',
    description: `Save a whole house design (create or replace; include "id" to replace). Use this to trace a floor plan: one floor per storey, exterior and interior walls as centre lines, doors/windows on walls, stairs, rooms (auto-detected if omitted). The app updates live. Returns problems and renders of every floor. You MUST look at the renders and compare them with the floor plan you were given; fix and write again until they match. ${DESIGN_FORMAT}`,
    inputSchema: {
      type: 'object',
      properties: { design: { type: 'object', description: 'The design JSON' }, detect_rooms: { type: 'boolean', description: 'Create rooms from enclosed walls on floors with none (default true)' } },
      required: ['design'],
    },
  },
  {
    name: 'render_design',
    description: 'Render a design (default: active). views per floor: "plan" (top-down, cut at 1.25 m like an architectural plan) and/or "3d" (dollhouse). exterior=true adds a view of the whole house from outside.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, floors: { type: 'array', items: { type: 'integer' }, description: 'Floor indexes (default all)' }, views: { type: 'array', items: { type: 'string', enum: ['plan', '3d'] } }, exterior: { type: 'boolean' } },
    },
  },
  {
    name: 'stair_info',
    description: 'Real-world stair numbers for a floor of a design: step count, riser and tread (mm), and the footprint needed, so you can leave the right stairwell space.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, floor: { type: 'integer' }, shape: { type: 'string', enum: ['straight', 'L', 'U'] }, width_cm: { type: 'number' } } },
  },
  {
    name: 'place_item',
    description: 'Place a library model in a design at x/z (cm, centre of the item) on a floor, facing rot degrees (0 = front faces +z). Returns a render of that floor to check.',
    inputSchema: {
      type: 'object',
      properties: { design: { type: 'string' }, floor: { type: 'integer' }, item: { type: 'string' }, x_cm: { type: 'number' }, z_cm: { type: 'number' }, rot: { type: 'number' }, color: { type: 'string' }, lift_cm: { type: 'number' } },
      required: ['item', 'x_cm', 'z_cm'],
    },
  },
  {
    name: 'export_glb',
    description: 'Export a design (default: active) as one .glb for Blender (File → Import → glTF 2.0), organised by floor, room, walls, openings, stairs and furniture. Saves into userdata/exports/ and returns the path.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, file: { type: 'string', description: 'Optional output path' } } },
  },
];

const text = (t) => ({ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) });
const image = (buf, mimeType = 'image/png') => ({ type: 'image', data: Buffer.from(buf).toString('base64'), mimeType });

async function withRenders(summary, id) {
  try {
    const { shots, stats } = await renderItemImages(id);
    const size = stats ? `Model: ${stats.source}, ${stats.triangles.toLocaleString('en')} triangles in ${stats.meshes} meshes (budget ${TRIANGLE_BUDGET.toLocaleString('en')}).${stats.triangles > TRIANGLE_BUDGET ? ' OVER BUDGET: reduce segments/detail.' : ''}` : '';
    return [
      text(summary),
      ...(size ? [text(size)] : []),
      ...shots.flatMap((s) => [text(`Render: ${s.view} view`), image(s.png)]),
      text('Now look at these renders. Compare shape, proportions and colours with the real product (read_link shows its photo), then call verify_item.'),
    ];
  } catch (err) {
    return [text(summary), text(`Could not render (${err.message}). Fix that and call render_item before verify_item.`)];
  }
}

async function designRenders(id, floors, note) {
  try {
    const shots = await renderDesignImages(id, { floors, views: ['plan', '3d'] });
    return [...shots.flatMap((s) => [text(`Render: ${s.view}`), image(s.png)]), text(note)];
  } catch (err) {
    return [text(`Could not render (${err.message}). Fix that and call render_design to check the result.`)];
  }
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'read_link': {
      const { product, images } = await readLink(args.url);
      const cm = (m) => (m ? Math.round(m * 1000) / 10 : null);
      const out = [text({ ...product, dims_cm: { width: cm(product.dims.w), depth: cm(product.dims.d), height: cm(product.dims.h) }, dims: undefined })];
      images.forEach((p, i) => out.push(text(`Product photo ${i + 1} of ${images.length}${i === 0 ? ' (main)' : ''}: ${p.url}`), image(p.data, p.mimeType)));
      if (!images.length) out.push(text('No product photo could be fetched.'));
      out.push(text('To add it: add_item with from_url (override any wrong or missing fields), then check the renders.'));
      return out;
    }
    case 'list_models':
      return [text(listModels())];
    case 'add_item': {
      const { item } = await addItem(args);
      return withRenders(`Added "${item.name}" as ${item.id} (${item.category}, ${Math.round(item.dims.w * 100)}×${Math.round(item.dims.d * 100)}×${Math.round(item.dims.h * 100)} cm, colours: ${item.colors.map((c) => c.name).join(', ')}). Status: UNVERIFIED.`, item.id);
    }
    case 'update_item': {
      const { item } = updateItem(args);
      return withRenders(`Updated ${item.id}. Status: UNVERIFIED until you check the renders.`, item.id);
    }
    case 'write_model_component': {
      const { item } = await writeModelComponent(args);
      return withRenders(`Saved the component for ${item.id} (userdata/models/${item.id}.jsx); it now replaces the generated shape. Status: UNVERIFIED until you check the renders. If a render says the component failed, fix the error and write it again.`, item.id);
    }
    case 'get_model_component': {
      const code = await readModelComponent(args.id);
      return [text(code ?? `${args.id} has no component yet (it uses the generated shape${'' }). Write one with write_model_component.`)];
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
      return withRenders(`Saved ${r.file}: ${(r.before / 1e6).toFixed(1)} MB → ${(r.bytes / 1e6).toFixed(2)} MB (${r.steps.join(', ')}; ${r.triangles.toLocaleString('en')} triangles), set as the model for ${r.item.id}. Status: UNVERIFIED.`, r.item.id);
    }
    case 'list_designs':
      return [text(listDesigns())];
    case 'get_design':
      return [text(getDesign(args.id))];
    case 'write_design': {
      const r = writeDesign(args.design, { detect_rooms: args.detect_rooms !== false });
      return [
        text({ saved: r.id, floors: r.floors, problems: r.problems.length ? r.problems : 'none' }),
        ...(await designRenders(r.id, null, 'Compare these renders with the floor plan you were given (walls, rooms, doors, windows, stairs, proportions). If anything differs, fix the JSON and call write_design again.')),
      ];
    }
    case 'render_design': {
      const shots = await renderDesignImages(args.id, { floors: args.floors, views: args.views?.length ? args.views : ['plan', '3d'], exterior: !!args.exterior });
      return shots.flatMap((s) => [text(s.view), image(s.png)]);
    }
    case 'stair_info':
      return [text(stairInfo(args.id, args.floor || 0, args.shape || 'straight', args.width_cm || 100))];
    case 'place_item': {
      const { placed } = placeItem(args);
      return [text({ placed }), ...(await designRenders(args.design, [args.floor || 0], 'Check the item sits where you intended, inside the room and clear of walls and other furniture.'))];
    }
    case 'export_glb': {
      const r = await exportGLB(args.id, args.file);
      return [text(`Exported ${r.file} (${(r.bytes / 1e6).toFixed(1)} MB). Open it in Blender with File → Import → glTF 2.0 (.glb/.gltf).`)];
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
      try {
        recordConnection(params?.clientInfo);
      } catch {}
      return reply({
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: `Roomcraft: a 3D house planner running on this computer. Designs (multi-floor houses) and the furniture model library live in the repo's userdata/ folder; the open app updates live when you change them. Read AGENTS.md in the repo for the format and workflows. ${VISION_RULE} After layout changes, look at the floor renders and compare them with what was asked (or the floor plan given).`,
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
