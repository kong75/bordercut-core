import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'packages/typescript/dist');

for (const [source, output] of [['index.js', 'core.min.js'], ['browser.js', 'browser.min.js']]) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [resolve(dist, source)],
    outfile: resolve(dist, output),
    bundle: true,
    minify: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    sourcemap: false,
    legalComments: 'none',
    metafile: true,
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const path = relative(dist, resolve(root, input));
    assert(!path.startsWith('..'), `The standalone bundle must contain only core package code: ${input}`);
  }
  for (const artifact of Object.values(result.metafile.outputs)) {
    assert.equal(artifact.imports.length, 0, 'Standalone modules must not load other modules.');
  }
}
