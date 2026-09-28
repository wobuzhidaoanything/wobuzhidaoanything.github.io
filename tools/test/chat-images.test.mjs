import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.ROOMCRAFT_USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-uploads-'));
const { saveUpload, readUpload } = await import('../lib/uploads.mjs');
const { chatPrompt } = await import('../lib/runner.mjs');

// 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('pasted pictures are saved and read back; only images, only safe names', () => {
  const name = saveUpload(PNG);
  assert.match(name, /^\d{4}-\d\d-\d\d-[0-9a-f]{10}\.png$/);
  const u = readUpload(name);
  assert.equal(u.mimeType, 'image/png');
  assert.ok(u.data.length > 20);
  assert.throws(() => saveUpload('data:text/html;base64,PGI+'), /PNG, JPEG/);
  assert.equal(readUpload('../chat.json'), null);
  assert.equal(readUpload('nope.png'), null);
});

test('chat prompt: pictures + size become a modelling request at that size', () => {
  const p = chatPrompt({ text: 'this armchair, 82 x 85 x 90 cm', images: ['2026-01-01-aaaaaaaaaa.jpg'], context: 'design "Home"' });
  assert.match(p, /\[App context: design "Home"\]/);
  assert.match(p, /view_images/);
  assert.match(p, /width 82 cm × depth 85 cm × height 90 cm\. Use it exactly/);
  assert.match(p, /photo_upload/);
  const noSize = chatPrompt({ text: '', images: ['2026-01-01-aaaaaaaaaa.jpg'] });
  assert.match(noSize, /No size was given/);
});

test('chat prompt: a size typed without pictures is pointed out; plain chat is unchanged', () => {
  assert.match(chatPrompt({ text: 'desk W 140 x D 70 x H 75 cm' }), /Size found in the message: width 140 cm × depth 70 cm × height 75 cm/);
  assert.equal(chatPrompt({ text: 'make the hall brighter' }), 'make the hall brighter');
});
