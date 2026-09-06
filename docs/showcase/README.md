# Showcase sources and reproduction

The root README displays real BorderCut outputs. No output masks or pixels are
hand-edited. A checkerboard is composited beneath transparency for the preview;
the matching `generated/*-transparent.png` files retain actual alpha.

| Input | Origin | License |
| --- | --- | --- |
| `sources/apple.jpg` | [Apple-002.jpg](https://commons.wikimedia.org/wiki/File:Apple-002.jpg), photograph by Amada44; original 2011 × 1657 JPEG | Released worldwide into the public domain by its author ([source revision](https://commons.wikimedia.org/w/index.php?title=File:Apple-002.jpg&oldid=1088530240)) |
| `sources/bottle.svg` | Original BorderCut illustration of a bottle on a smooth gradient | Repository MIT license |
| `sources/mug.svg` | Original BorderCut illustration of a mug with an enclosed handle opening | Repository MIT license |

The photo is retained unmodified. Resizing and decoding happen in the generation
script. Source files are committed so regeneration needs no network access once
dependencies are installed. Credits remain with any redistributed showcase assets.

From the repository root:

```bash
npm ci
npm run docs:showcase
npm run benchmark
```

`cases.json` records each source and option overrides. All other options use the
engine defaults; no correction guidance is supplied. Previews run the algorithm
at up to 1024 pixels on the longest edge and reduce the displayed images to 640
pixels wide. SVG sources are rasterized at 144 DPI before resizing. The gallery
generator records the dimensions and removal diagnostics in `generated/manifest.json`.

The benchmark uses the same three sources at three resolutions, records every
sample plus source/engine hashes in `../benchmarks/latest.json`, and refreshes the
table in the root README. It measures only TypeScript core processing. Keep other
CPU-intensive work idle when collecting numbers. Timing fluctuations are expected;
CI does not enforce a wall-clock threshold.

These are favorable, selected examples. The two illustrations isolate gradient
and enclosed-background behavior; they do not establish performance on real
product photography, hair, motion blur, or busy scenes. Broader photographic
coverage and difficult cases can be added to `cases.json` as the project develops.
