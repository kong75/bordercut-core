import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { version as esbuildVersion } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'packages/typescript/package.json'), 'utf8'));
for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  assert.equal(Object.keys(manifest[field] ?? {}).length, 0, `The core must stay free of runtime ${field}.`);
}

const entries = [];
for (const [file, gzipBudgetBytes] of [['core.min.js', 8000], ['browser.min.js', 9000]]) {
  const data = await readFile(resolve(root, 'packages/typescript/dist', file));
  const gzipBytes = gzipSync(data, { level: 9 }).length;
  const brotliBytes = brotliCompressSync(data, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  entries.push({ file, minifiedBytes: data.length, gzipBytes, brotliBytes, gzipBudgetBytes,
    sha256: createHash('sha256').update(data).digest('hex') });
  process.stdout.write(`${file}: ${data.length} bytes minified, ${gzipBytes} gzip, ${brotliBytes} Brotli (gzip budget ${gzipBudgetBytes}).\n`);
  assert(gzipBytes <= gzipBudgetBytes,
    `${file} exceeds its gzip budget by ${gzipBytes - gzipBudgetBytes} bytes. Review the bundle before increasing the limit.`);
}

if (process.argv.includes('--write')) {
  const report = {
    packageVersion: manifest.version,
    node: process.version,
    esbuild: esbuildVersion,
    units: 'bytes; 1 kB = 1000 bytes',
    method: 'Self-contained ES2022 ESM bundles of the compiled package entries; esbuild minification; no source maps. gzip level 9; Brotli quality 11. Includes all runtime exports of each entry.',
    entries,
  };
  await mkdir(resolve(root, 'docs/size'), { recursive: true });
  await writeFile(resolve(root, 'docs/size/latest.json'), JSON.stringify(report, null, 2) + '\n');
  const table = [
    '| Standalone module | Minified | Minified + gzip | Minified + Brotli |',
    '| --- | ---: | ---: | ---: |',
    ...entries.map((entry) => `| \`${entry.file}\` | ${(entry.minifiedBytes / 1000).toFixed(1)} kB | ${(entry.gzipBytes / 1000).toFixed(1)} kB | ${(entry.brotliBytes / 1000).toFixed(1)} kB |`),
  ].join('\n');
  for (const file of ['README.md', 'packages/typescript/README.md']) {
    const path = resolve(root, file);
    const readme = await readFile(path, 'utf8');
    const start = '<!-- size:start -->';
    const end = '<!-- size:end -->';
    const from = readme.indexOf(start);
    const to = readme.indexOf(end, from);
    assert(from >= 0 && to > from, `${file} is missing size markers.`);
    await writeFile(path, readme.slice(0, from + start.length) + '\n' + table + '\n' + readme.slice(to));
  }
}
