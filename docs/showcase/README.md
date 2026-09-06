# Showcase sources and reproduction

The root README displays real BorderCut outputs. No output masks or pixels are
hand-edited. A checkerboard is composited beneath transparency for the preview;
the matching `generated/*-transparent.png` files retain actual alpha.

| Input | Origin | License |
| --- | --- | --- |
| `sources/butterfly.jpg` | [Papiliorex Oberthür, 1886.JPG](https://commons.wikimedia.org/wiki/File:Papiliorex_Oberth%C3%BCr,_1886.JPG), photograph by Notafly, 2010; original 3072 × 2304 JPEG | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `sources/botanical.jpg` | [Redoute flowers01.jpg](https://commons.wikimedia.org/wiki/File:Redoute_flowers01.jpg), botanical illustration by Pierre-Joseph Redouté (1759–1840); original 944 × 1275 JPEG ([source revision](https://commons.wikimedia.org/w/index.php?title=File:Redoute_flowers01.jpg&oldid=1190719518)) | Public domain |
| `sources/flower.jpg` | [Dark purple flower (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Dark_purple_flower_(Unsplash).jpg), credited to Ameen Fahmy on Commons; embedded metadata also credits Ibrahim Shabil / ShabilPhotos; original 3343 × 4179 JPEG ([source revision](https://commons.wikimedia.org/w/index.php?title=File:Dark_purple_flower_(Unsplash).jpg&oldid=1165178294)) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), published on Unsplash in 2016 under its former CC0 license, as documented by Commons |
| `sources/apple.jpg` | [Apple-002.jpg](https://commons.wikimedia.org/wiki/File:Apple-002.jpg), photograph by Amada44; original 2011 × 1657 JPEG | Released worldwide into the public domain by its author ([source revision](https://commons.wikimedia.org/w/index.php?title=File:Apple-002.jpg&oldid=1088530240)) |

Original source files are retained unmodified. Decoding, the flower's documented
crop, and resizing happen in the generation script. Source files are committed so
regeneration needs no network access once dependencies are installed.

The butterfly source and all `generated/butterfly-*.png` derivatives are distributed
under CC BY-SA 3.0, credited to Notafly. Changes: resizing, background removal, and
checkerboard compositing for the preview. Preserve the credit, license link, and
change notice when redistributing them. These image licenses are separate from the
MIT license on the code.

From the repository root:

```bash
npm ci
npm run docs:showcase
npm run benchmark
```

`cases.json` records each source, crop, and option overrides. All other options use
the engine defaults; no correction guidance is supplied. Previews run the algorithm
at up to 1024 pixels on the longest edge and reduce the displayed images to 640
pixels wide. SVG sources are rasterized at 144 DPI before resizing. The gallery
generator records the dimensions, crop, and removal diagnostics in `generated/manifest.json`.

The benchmark uses the same four sources at three resolutions, records every
sample plus source/engine hashes in `../benchmarks/latest.json`, and refreshes the
table in the root README. It measures only TypeScript core processing. Keep other
CPU-intensive work idle when collecting numbers. Timing fluctuations are expected;
CI does not enforce a wall-clock threshold.

## What each example shows

- **Butterfly specimen:** fine antennae, patterned wings, and pale markings that
  should remain opaque. `recoverPaleSubject: false` reduces a retained pale rim;
  thin halos and imperfect antenna edges are still visible.
- **Botanical illustration:** a detailed historical print with pale flowers,
  overlapping leaves, and branching stems. Default options preserve much of the
  delicate artwork, with some pale edge halos and retained enclosed background.
- **Dark flower:** photographic petals against an almost-black background. A crop
  of `{ left: 200, top: 1300, width: 2940, height: 2500 }` removes excess empty space
  before both the before/after render and benchmarking. Default options are used.
  Very dark petal detail can merge with the backdrop; this is an example of a
  difficult boundary, not perfect matting.
- **Apple:** a conventional product photo on white, with default options. Part of
  the contact shadow remains in the output.

These are selected examples, not a representative accuracy benchmark. The bottle
and cup illustrations were retired from the gallery because they were visually
similar; gradient and enclosed-hole behavior remain covered by conformance fixtures.
