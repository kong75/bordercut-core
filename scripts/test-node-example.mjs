import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'bordercut-node-example-'));

try {
  const input = join(temporaryRoot, 'input.png');
  const output = join(temporaryRoot, 'output.png');
  const width = 12;
  const height = 12;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 245;
    pixels[index + 1] = 243;
    pixels[index + 2] = 238;
    pixels[index + 3] = 255;
  }
  for (let y = 3; y < 9; y += 1) {
    for (let x = 3; x < 9; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = 35;
      pixels[index + 1] = 80;
      pixels[index + 2] = 150;
    }
  }

  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toFile(input);
  const command = spawnSync(
    process.execPath,
    [join(root, 'examples', 'node-sharp', 'dist', 'main.js'), input, output],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(command.status, 0, command.stderr || command.stdout);

  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, width);
  assert.equal(info.height, height);
  assert.equal(info.channels, 4);
  assert.equal(data[3], 0, 'The background corner should be transparent.');
  assert.equal(data[(6 * width + 6) * 4 + 3], 255, 'The subject center should remain opaque.');
  process.stdout.write('Verified the runnable Node + sharp file-to-PNG example.\n');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
