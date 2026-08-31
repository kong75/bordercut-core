import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this smoke test through npm so the npm CLI can be located.');

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result.stdout.trim();
};

const temporaryRoot = await mkdtemp(join(tmpdir(), 'bordercut-package-'));

const runNpm = (args, cwd) => run(process.execPath, [npmCli, ...args], cwd);

try {
  const packOutput = runNpm(
    [
      'pack',
      '--workspace',
      '@bordercut/core',
      '--pack-destination',
      temporaryRoot,
      '--json',
      '--silent',
    ],
    workspaceRoot,
  );
  const [manifest] = JSON.parse(packOutput);
  assert(manifest, 'npm pack did not return a package manifest.');

  const packagedFiles = new Set(manifest.files.map((entry) => entry.path));
  for (const requiredPath of [
    'LICENSE',
    'README.md',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/browser.js',
    'dist/browser.d.ts',
    'src/index.ts',
    'src/browser.ts',
    'package.json',
  ]) {
    assert(packagedFiles.has(requiredPath), `Package is missing ${requiredPath}.`);
  }

  const tarballPath = join(temporaryRoot, manifest.filename);
  const consumerRoot = join(temporaryRoot, 'consumer');
  await mkdir(consumerRoot);
  await writeFile(
    join(consumerRoot, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }, null, 2),
  );
  runNpm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', tarballPath],
    consumerRoot,
  );

  const smokeSource = `
import assert from 'node:assert/strict';
import { ALGORITHM_VERSION, DEFAULT_OPTIONS, removeBackground } from '@bordercut/core';
import { decodeImageBlob, encodePngBlob, removeBackgroundFromBlob } from '@bordercut/core/browser';

assert.equal(ALGORITHM_VERSION, 1);
assert.equal(DEFAULT_OPTIONS.tolerance, 46);
assert.equal(typeof decodeImageBlob, 'function');
assert.equal(typeof encodePngBlob, 'function');
assert.equal(typeof removeBackgroundFromBlob, 'function');
const width = 4;
const height = 4;
const data = new Uint8ClampedArray(width * height * 4);
for (let index = 0; index < data.length; index += 4) {
  data[index] = 245;
  data[index + 1] = 243;
  data[index + 2] = 238;
  data[index + 3] = 255;
}
const result = removeBackground({ width, height, data });
assert.equal(result.alpha.length, width * height);
assert.equal(result.image.data.length, width * height * 4);
assert.equal(result.diagnostics.algorithmVersion, ALGORITHM_VERSION);
const guided = removeBackground(
  { width, height, data },
  { feather: 0 },
  { strokes: [{ kind: 'foreground', radius: 1, points: [{ x: 1, y: 1 }] }] },
);
assert.equal(guided.alpha[width + 1], 255);
`;
  await writeFile(join(consumerRoot, 'smoke.mjs'), smokeSource);
  await writeFile(
    join(consumerRoot, 'smoke.ts'),
    `import { removeBackground, type BrushStroke, type PixelImage } from '@bordercut/core';\n` +
      `import { removeBackgroundFromBlob, type BrowserRemovalResult } from '@bordercut/core/browser';\n` +
      `const image: PixelImage = { width: 1, height: 1, data: new Uint8ClampedArray(4) };\n` +
      `const stroke: BrushStroke = { kind: 'background', radius: 1, points: [{ x: 0, y: 0 }] };\n` +
      `removeBackground(image, {}, { strokes: [stroke] }).alpha satisfies Uint8ClampedArray;\n` +
      `removeBackgroundFromBlob(new Blob()).then((result: BrowserRemovalResult) => result.blob);\n`,
  );

  run(process.execPath, ['smoke.mjs'], consumerRoot);
  const typescriptBin = join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  await readFile(typescriptBin);
  run(
    process.execPath,
    [
      typescriptBin,
      'smoke.ts',
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--skipLibCheck',
    ],
    consumerRoot,
  );

  process.stdout.write(
    `Verified ${manifest.name}@${manifest.version}: ${manifest.entryCount} packaged files, runtime import, and TypeScript declarations.\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
