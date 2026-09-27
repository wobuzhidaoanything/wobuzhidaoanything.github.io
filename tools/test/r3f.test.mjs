import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSource } from '../lib/r3f.mjs';

test('model components compile JSX and only allow react/three/R3F imports', async () => {
  const ok = await compileSource(`import { RoundedBox } from '@react-three/drei';\nimport * as THREE from 'three';\nexport default function Model({ width }) { return <RoundedBox args={[width, 1, 1]} />; }`);
  assert.match(ok, /from "react\/jsx-runtime"/);
  await assert.rejects(compileSource(`import fs from 'node:fs'; export default () => null;`), /can be imported/);
  await assert.rejects(compileSource(`export default () => <mesh>`), /model\.jsx:1/);
  await assert.rejects(compileSource(`export const X = 1;`), /export default/);
});
