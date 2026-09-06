import { parse, join } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { removeBackground } from '@bordercut/core';

const [inputPath, requestedOutputPath] = process.argv.slice(2);

if (!inputPath) {
  process.stderr.write('Usage: npm start --workspace @bordercut/node-sharp-example -- <input> [output.png]\n');
  process.exitCode = 1;
} else {
  const parsedInput = parse(inputPath);
  const outputPath =
    requestedOutputPath ?? join(parsedInput.dir, `${parsedInput.name}-transparent.png`);

  try {
    const { data, info } = await sharp(inputPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 4) throw new Error(`Expected four RGBA channels; received ${info.channels}.`);

    const source = new Uint8ClampedArray(data.length);
    source.set(data);
    const result = removeBackground({ width: info.width, height: info.height, data: source });

    await sharp(Buffer.from(result.image.data), {
      raw: { width: result.image.width, height: result.image.height, channels: 4 },
    })
      .png()
      .toFile(outputPath);

    process.stdout.write(
      `Wrote ${outputPath} (${Math.round(result.diagnostics.removedFraction * 100)}% removed in ${Math.round(result.diagnostics.elapsedMs)} ms).\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
