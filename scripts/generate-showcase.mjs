import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { removeBackground } from '@bordercut/core';
import { cases, loadPixels, showcaseRoot, updateReadme } from './showcase-utils.mjs';

const outputRoot = resolve(showcaseRoot, 'generated');
await mkdir(outputRoot, { recursive: true });
const checkerboard = (width, height) => {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const color = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 ? 219 : 241;
      data.fill(color, offset, offset + 3);
      data[offset + 3] = 255;
    }
  }
  return { input: data, raw: { width, height, channels: 4 } };
};
const rows = [];
const manifest = [];
for (const example of cases) {
  const input = await loadPixels(example, 1024);
  const result = removeBackground(input, example.options);
  const raw = { width: input.width, height: input.height, channels: 4 };
  await sharp(Buffer.from(input.data), { raw }).resize({ width: 640 }).png()
    .toFile(resolve(outputRoot, `${example.id}-before.png`));
  const transparent = await sharp(Buffer.from(result.image.data), { raw }).png().toBuffer();
  await writeFile(resolve(outputRoot, `${example.id}-transparent.png`), transparent);
  const checker = checkerboard(input.width, input.height);
  const preview = await sharp(checker.input, { raw: checker.raw })
    .composite([{ input: transparent }]).png().toBuffer();
  await sharp(preview).resize({ width: 640 }).png()
    .toFile(resolve(outputRoot, `${example.id}-after.png`));
  rows.push(`| ${example.title} | ![${example.kind} before removal](docs/showcase/generated/${example.id}-before.png) | ![Actual BorderCut output over a checkerboard](docs/showcase/generated/${example.id}-after.png) |`);
  manifest.push({ id: example.id, width: input.width, height: input.height, options: example.options,
    removedFraction: result.diagnostics.removedFraction, mode: result.diagnostics.mode });
  process.stdout.write(`Generated ${example.id}: ${input.width} × ${input.height}.\n`);
}
await writeFile(resolve(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await updateReadme('showcase', [
  '| Example | Before | After |', '| --- | --- | --- |', ...rows,
  '', 'These are actual algorithm outputs, without manual retouching or correction strokes. The checkerboard only displays transparency. The apple and bottle use default options; the mug enables `interiorBackground` to clear its handle opening. Processing uses images up to 1024 pixels on the longest edge; previews are reduced for the README.',
  '', 'The apple is a photograph; its output retains part of the contact shadow. The bottle and mug are controlled SVG illustrations, not evidence of photographic accuracy. These examples demonstrate favorable conditions rather than a general segmentation benchmark. See [source credits, exact inputs, and regeneration instructions](docs/showcase/README.md).',
].join('\n'));
