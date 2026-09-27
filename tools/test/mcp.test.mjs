// End-to-end test: spawns the MCP server over stdio and drives it like an agent would.
// Uses a local product page, so it needs no internet. Restores data/project.json afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROJECT = path.join(ROOT, 'data', 'project.json');
const RENDERS = path.join(ROOT, '.roomcraft', 'renders.json');

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
  const proc = spawn(process.execPath, [path.join(ROOT, 'tools', 'mcp-server.mjs')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
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

test('MCP server: read link, add model with renders, enforced visual verification', { timeout: 180000 }, async () => {
  const backup = fs.readFileSync(PROJECT);
  const rendersBackup = fs.existsSync(RENDERS) ? fs.readFileSync(RENDERS) : null;
  const shop = await productServer();
  const c = client();
  try {
    const init = await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'roomcraft');
    const { tools } = (await c.call('tools/list', {})).result;
    assert.deepEqual(tools.map((t) => t.name).sort(), ['add_item', 'list_items', 'read_link', 'render_item', 'render_room', 'save_model_file', 'update_item', 'verify_item']);

    const url = `http://127.0.0.1:${shop.address().port}/marlow`;
    const read = await c.tool('read_link', { url });
    const info = JSON.parse(read.content[0].text);
    assert.equal(info.category, 'sofa');
    assert.deepEqual(info.dims_cm, { width: 214, depth: 93, height: 85 });
    assert.ok(read.content.some((x) => x.type === 'image'), 'product photo returned as image');

    const added = await c.tool('add_item', { from_url: url, id: 'i-test-marlow' });
    assert.ok(!added.isError, JSON.stringify(added.content[0]));
    const images = added.content.filter((x) => x.type === 'image');
    assert.equal(images.length, 2, 'two renders returned');
    assert.ok(Buffer.from(images[0].data, 'base64').length > 5000, 'render is a real image');
    let item = JSON.parse(fs.readFileSync(PROJECT)).inventory.find((i) => i.id === 'i-test-marlow');
    assert.equal(item.verified, false);
    assert.deepEqual(item.colors.map((x) => x.name), ['Sage green', 'Charcoal']);

    // Change the file behind the agent's back: verification must be refused until it renders again.
    const p = JSON.parse(fs.readFileSync(PROJECT));
    p.inventory.find((i) => i.id === 'i-test-marlow').dims.w = 3;
    fs.writeFileSync(PROJECT, JSON.stringify(p));
    const refused = await c.tool('verify_item', { id: 'i-test-marlow', matches: true, notes: 'Looks like a three-seat sofa in sage.' });
    assert.ok(refused.isError && /not been rendered/.test(refused.content[0].text));

    const rendered = await c.tool('render_item', { id: 'i-test-marlow', views: ['front'] });
    assert.equal(rendered.content.filter((x) => x.type === 'image').length, 1);
    const ok = await c.tool('verify_item', { id: 'i-test-marlow', matches: true, notes: 'Three-seat sofa, sage fabric, proportions match 300x93x85.' });
    assert.ok(!ok.isError, ok.content[0].text);
    item = JSON.parse(fs.readFileSync(PROJECT)).inventory.find((i) => i.id === 'i-test-marlow');
    assert.equal(item.verified, true);

    const room = await c.tool('render_room', { views: ['3d'] });
    assert.equal(room.content.filter((x) => x.type === 'image').length, 1);
  } finally {
    c.close();
    shop.close();
    fs.writeFileSync(PROJECT, backup);
    if (rendersBackup) fs.writeFileSync(RENDERS, rendersBackup);
    else fs.rmSync(RENDERS, { force: true });
  }
});
