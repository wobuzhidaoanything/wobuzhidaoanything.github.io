// End-to-end test: spawns the MCP server over stdio and drives it like an agent would.
// Uses a local product page, so it needs no internet, and a temporary userdata folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'roomcraft-test-'));

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function productServer() {
  const s = http.createServer((req, res) => {
    if (req.url.startsWith('/photo.png')) return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<html><head>
      <meta property="og:title" content="MARLOW 3-seat sofa, Sage green - Test Store">
      <meta property="og:image" content="http://127.0.0.1:${s.address().port}/photo.png"></head><body>
      <a class="swatch" aria-label="Sage green"></a><a class="swatch" aria-label="Charcoal"></a>
      <h2>Dimensions</h2><p>Width: 214 cm</p><p>Depth: 93 cm</p><p>Height: 85 cm</p></body></html>`);
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

function client() {
  const proc = spawn(process.execPath, [path.join(ROOT, 'tools', 'mcp-server.mjs')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ROOMCRAFT_USERDATA: USERDATA } });
  let buf = '';
  const waiting = new Map();
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      waiting.get(msg.id)?.(msg);
    }
  });
  let n = 0;
  const call = (method, params) =>
    new Promise((resolve) => {
      const id = ++n;
      waiting.set(id, resolve);
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  return { call, tool: async (name, args) => (await call('tools/call', { name, arguments: args })).result, close: () => proc.stdin.end() };
}

test('old layout (designs/, models/, .roomcraft/) moves into userdata/ without losing anything', async () => {
  const { migrateLayout } = await import('../lib/paths.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roomcraft-old-'));
  const ud = path.join(root, 'userdata');
  fs.mkdirSync(path.join(root, 'designs'));
  fs.writeFileSync(path.join(root, 'designs', 'house.json'), '{"id":"house"}');
  fs.writeFileSync(path.join(root, 'designs', 'library.json'), '{"items":[]}');
  fs.writeFileSync(path.join(root, 'designs', '.active'), 'house');
  fs.mkdirSync(path.join(root, 'models'));
  fs.writeFileSync(path.join(root, 'models', 'a.glb'), 'glTF');
  fs.mkdirSync(path.join(root, '.roomcraft'));
  fs.writeFileSync(path.join(root, '.roomcraft', 'renders.json'), '{}');
  const moved = migrateLayout(root, ud);
  assert.ok(moved.length >= 5, moved.join('\n'));
  assert.equal(fs.readFileSync(path.join(ud, 'designs', 'house.json'), 'utf8'), '{"id":"house"}');
  assert.ok(fs.existsSync(path.join(ud, 'library.json')) && fs.existsSync(path.join(ud, '.state', 'active')) && fs.existsSync(path.join(ud, 'models', 'a.glb')) && fs.existsSync(path.join(ud, '.state', 'renders.json')));
  assert.ok(!fs.existsSync(path.join(root, 'designs')));
  // Running again is harmless
  assert.equal(migrateLayout(root, ud).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('MCP server: link → model with renders, enforced vision check, floor plan → design, export', { timeout: 300000 }, async () => {
  const conns = path.join(USERDATA, '.state', 'connections.json');
  const shop = await productServer();
  const c = client();
  try {
    const init = await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '9.9' } });
    assert.equal(init.result.serverInfo.name, 'roomcraft');
    assert.ok(JSON.parse(fs.readFileSync(conns, 'utf8'))['claude-code'], 'connection recorded');
    const { tools } = (await c.call('tools/list', {})).result;
    for (const t of ['read_link', 'add_item', 'verify_item', 'write_design', 'render_design', 'export_glb']) assert.ok(tools.some((x) => x.name === t), t);

    const url = `http://127.0.0.1:${shop.address().port}/marlow`;
    const read = await c.tool('read_link', { url });
    const info = JSON.parse(read.content[0].text);
    assert.equal(info.category, 'sofa');
    assert.deepEqual(info.dims_cm, { width: 214, depth: 93, height: 85 });
    assert.ok(read.content.some((x) => x.type === 'image'), 'product photo returned as image');

    const added = await c.tool('add_item', { from_url: url, id: 'i-test-marlow' });
    assert.ok(!added.isError, JSON.stringify(added.content[0]));
    assert.equal(added.content.filter((x) => x.type === 'image').length, 2, 'two renders returned');

    // Change the model behind the agent's back: verification is refused until it looks again.
    const libFile = path.join(USERDATA, 'library.json');
    const lib = JSON.parse(fs.readFileSync(libFile));
    lib.items.find((i) => i.id === 'i-test-marlow').dims.w = 3;
    fs.writeFileSync(libFile, JSON.stringify(lib));
    const refused = await c.tool('verify_item', { id: 'i-test-marlow', matches: true, notes: 'Looks like a three-seat sofa in sage.' });
    assert.ok(refused.isError && /not been rendered/.test(refused.content[0].text));
    await c.tool('render_item', { id: 'i-test-marlow', views: ['front'] });
    const ok = await c.tool('verify_item', { id: 'i-test-marlow', matches: true, notes: 'Three-seat sofa, sage fabric, proportions match 300x93x85.' });
    assert.ok(!ok.isError, ok.content[0].text);

    // Trace a two-storey floor plan.
    const ext = (p) => [[0, 0], [9, 0], [9, 7], [0, 7]].map((a, i, all) => ({ id: `${p}${i}`, a, b: all[(i + 1) % 4], thickness: 0.25, exterior: true }));
    const design = {
      id: 'test-traced', name: 'Traced plan',
      floors: [
        { name: 'Ground floor', height: 2.7, walls: [...ext('g'), { id: 'gi', a: [5, 0], b: [5, 7], thickness: 0.12 }],
          openings: [{ id: 'd1', type: 'door', wall: 'gi', offset: 3, width: 0.9, height: 2.1 }, { id: 'w1', type: 'window', wall: 'g0', offset: 1, width: 1.6, height: 1.3, sill: 0.9 }],
          stairs: [{ id: 's1', shape: 'straight', x: 8.3, z: 6.0, rot: 0, width: 1 }] },
        { name: 'First floor', height: 2.6, walls: ext('f') },
      ],
    };
    const wrote = await c.tool('write_design', { design });
    assert.ok(!wrote.isError, JSON.stringify(wrote.content[0]));
    const summary = JSON.parse(wrote.content[0].text);
    assert.equal(summary.saved, 'test-traced');
    assert.equal(summary.problems, 'none');
    assert.match(summary.floors[0], /2 rooms/);
    assert.equal(wrote.content.filter((x) => x.type === 'image').length, 4, 'plan + 3d for each of 2 floors');

    const placed = await c.tool('place_item', { design: 'test-traced', floor: 0, item: 'i-test-marlow', x_cm: 250, z_cm: 60, rot: 0 });
    assert.ok(!placed.isError, placed.content[0].text);

    const exported = await c.tool('export_glb', { id: 'test-traced', file: path.join(USERDATA, 'test.glb') });
    assert.ok(!exported.isError, exported.content[0].text);
    const glb = fs.readFileSync(path.join(USERDATA, 'test.glb'));
    assert.equal(glb.subarray(0, 4).toString(), 'glTF');
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
    assert.ok(json.nodes.some((n) => n.name === 'First floor') && json.nodes.some((n) => n.name?.startsWith('MARLOW 3-seat sofa')));
  } finally {
    c.close();
    shop.close();
    fs.rmSync(USERDATA, { recursive: true, force: true });
  }
});
