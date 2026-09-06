import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ALGORITHM_VERSION, DEFAULT_OPTIONS, removeBackground } from '@bordercut/core';
import { cases, loadPixels, root, showcaseRoot, updateReadme } from './showcase-utils.mjs';

const warmups = 5;
const iterations = 20;
const sizes = [512, 1024, 2048];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const results = [];
for (const example of cases) {
  for (const size of sizes) {
    const input = await loadPixels(example, size);
    for (let index = 0; index < warmups; index += 1) removeBackground(input, example.options);
    const samplesMs = [];
    for (let index = 0; index < iterations; index += 1) {
      const start = performance.now();
      removeBackground(input, example.options);
      samplesMs.push(performance.now() - start);
    }
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const medianMs = (sorted[iterations / 2 - 1] + sorted[iterations / 2]) / 2;
    const p95Ms = sorted[Math.ceil(iterations * 0.95) - 1];
    results.push({ id: example.id, width: input.width, height: input.height,
      options: { ...DEFAULT_OPTIONS, ...example.options },
      sourceSha256: sha256(await readFile(resolve(showcaseRoot, example.source))),
      rgbaSha256: sha256(input.data), medianMs, p95Ms, samplesMs });
    process.stdout.write(`${example.id} ${input.width} × ${input.height}: median ${medianMs.toFixed(1)} ms, p95 ${p95Ms.toFixed(1)} ms.\n`);
  }
}
const report = {
  measuredAt: new Date().toISOString(), algorithmVersion: ALGORITHM_VERSION,
  engineSha256: sha256(await readFile(resolve(root, 'packages/typescript/src/engine.ts'))),
  environment: { node: process.version, platform: process.platform, osRelease: release(),
    arch: process.arch, cpu: cpus()[0].model, logicalCpus: cpus().length },
  methodology: { warmups, iterations, sizes, timer: 'performance.now', p95: 'nearest rank',
    scope: 'Synchronous TypeScript removeBackground call, including its allocations and incidental GC. Decoding, resizing, PNG encoding, file I/O, worker startup and transfer excluded. Sequential calls, no forced GC.' },
  results,
};
await mkdir(resolve(root, 'docs/benchmarks'), { recursive: true });
await writeFile(resolve(root, 'docs/benchmarks/latest.json'), JSON.stringify(report, null, 2) + '\n');
const rows = results.map((r) => `| ${r.id} | ${r.width} × ${r.height} | ${r.medianMs.toFixed(1)} ms | ${r.p95Ms.toFixed(1)} ms |`);
await updateReadme('benchmark', [
  `Measured ${report.measuredAt.slice(0, 10)} with Node ${report.environment.node} on ${report.environment.cpu}, ${report.environment.platform} ${report.environment.arch}. Algorithm v${ALGORITHM_VERSION}.`,
  '', '| Input | Pixels | Median | p95 |', '| --- | --- | ---: | ---: |', ...rows,
  '', `${warmups} warm-up calls and ${iterations} timed calls per row. Times cover the synchronous TypeScript algorithm and its allocations; they exclude decoding, resizing, PNG encoding, file I/O, and worker overhead. p95 uses nearest rank. Inputs and options match the showcase cases; photos are never enlarged.`,
  '', 'These are measurements on one development machine, not latency guarantees or Dart/Flutter/browser measurements. Content, settings, runtime, hardware, and background activity affect timings. [Raw samples, source hashes, and environment](docs/benchmarks/latest.json) are retained so results can be compared honestly.',
  '', 'Reproduce with `npm ci && npm run benchmark`. Regenerate previews separately with `npm run docs:showcase`.',
].join('\n'));
