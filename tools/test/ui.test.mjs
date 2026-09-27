import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileUI } from '../lib/r3f.mjs';
import { ROOT } from '../lib/paths.mjs';

test('every React panel compiles', async () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'js', 'ui')).filter((x) => x.endsWith('.jsx'))) {
    const code = await compileUI(f.replace(/\.jsx$/, ''));
    assert.ok(code && /react\/jsx-runtime|from "react"/.test(code), f);
  }
  assert.match(await compileUI('main'), /mountUI/);
});

test('only files in js/ui can be served', async () => {
  assert.equal(await compileUI('../app'), null);
  assert.equal(await compileUI('nope'), null);
});
