import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

export const root = resolve(import.meta.dirname, '..');
export const showcaseRoot = resolve(root, 'docs/showcase');
export const cases = JSON.parse(await readFile(resolve(showcaseRoot, 'cases.json'), 'utf8'));

export async function loadPixels(example, maxDimension) {
  const input = resolve(showcaseRoot, example.source);
  const { data, info } = await sharp(input, { density: example.source.endsWith('.svg') ? 144 : 72 })
    .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

export async function updateReadme(section, content) {
  const path = resolve(root, 'README.md');
  const readme = await readFile(path, 'utf8');
  const start = `<!-- ${section}:start -->`;
  const end = `<!-- ${section}:end -->`;
  const from = readme.indexOf(start);
  const to = readme.indexOf(end, from);
  assert(from >= 0 && to > from, `README is missing ${section} markers.`);
  await writeFile(path, readme.slice(0, from + start.length) + '\n' + content + '\n' + readme.slice(to));
}
