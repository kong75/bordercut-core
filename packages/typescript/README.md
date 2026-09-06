# @bordercut/core

**Local background removal in about 8 kB minified + gzipped. Zero runtime dependencies.**

Run BorderCut inside a browser, Web Worker, or Node.js application. The core accepts decoded RGBA pixels and processes them on the same device. No uploads, API keys, model downloads, or GPU are required; processing works offline once the code is available. It is designed for images with a visually separable background.

Status: pre-1.0 alpha, algorithm contract v1. The package is ESM-only and supports Node.js 20.19 or newer and modern browsers with ES2022 support.

## Size

<!-- size:start -->
| Standalone module | Minified | Minified + gzip | Minified + Brotli |
| --- | ---: | ---: | ---: |
| `core.min.js` | 20.6 kB | 7.9 kB | 6.9 kB |
| `browser.min.js` | 22.7 kB | 8.7 kB | 7.7 kB |
<!-- size:end -->

The browser module includes the core plus native Blob decoding and PNG encoding.
These are complete ES2022 bundles, with no external imports. Sizes use esbuild
minification, gzip level 9, and Brotli quality 11; 1 kB = 1,000 bytes. Compression
depends on the serving application. This measures JavaScript transfer size, not
the npm tarball, runtime memory, or application assets.

Run `npm run size` from the source repository to check the 8,000-byte core and
9,000-byte browser gzip budgets. Exact measurements and hashes are in the
[repository size report](https://github.com/kong75/bordercut/blob/main/docs/size/latest.json).

## Installation

Once the package is published by a maintainer:

```bash
npm install @bordercut/core
```

For repository development, use `npm ci` at the workspace root.

### Direct browser module

For a site without a bundler, copy `dist/browser.min.js` from the package into
your site and import it from a `<script type="module">`:

```js
import { removeBackgroundFromBlob } from './browser.min.js';

const { blob } = await removeBackgroundFromBlob(file);
```

The file is self-contained. Use `dist/core.min.js` and its `removeBackground`
export when you already have RGBA pixels. Both modules can be served by your
application and cached for offline use. While the package is unpublished, build
them with `npm run build --workspace @bordercut/core` at the repository root;
they are written to `packages/typescript/dist/`.

## Usage

```ts
import { removeBackground } from '@bordercut/core';

const result = removeBackground(
  { width, height, data: rgba },
  {
    tolerance: 46,
    edgeProtection: 58,
    feather: 2,
    cleanup: 1,
    protectCenter: true,
    recoverPaleSubject: true,
    interiorBackground: false,
  },
  {
    samples: [{ x: 20, y: 12, kind: 'foreground' }],
    strokes: [
      {
        kind: 'background',
        radius: 6,
        points: [
          { x: 48, y: 30 },
          { x: 72, y: 44 },
        ],
      },
    ],
  },
);

// result.image: transparent RGBA output
// result.mask: grayscale RGBA mask
// result.alpha: one alpha byte per pixel
// result.diagnostics: algorithm version and processing details
```

### Browser Blob convenience API

Applications that do not already have decoded pixels can use the optional browser entry point:

```ts
import { removeBackgroundFromBlob } from '@bordercut/core/browser';

const result = await removeBackgroundFromBlob(file, { feather: 2 });
const transparentPng: Blob = result.blob;
```

The browser adapter accepts a `Blob` or `File`, decodes it with browser canvas APIs, invokes the same deterministic core, and returns the complete result plus an encoded transparent PNG. It also exports `decodeImageBlob` and `encodePngBlob` for applications that need the individual steps.

Importing `@bordercut/core` does not include the adapter. The raw core remains free of codecs and browser globals. For responsive interfaces, call the core or browser adapter inside a Web Worker; see `examples/minimal-web/src/removal-worker.ts`.

### Node file example

The runnable `examples/node-sharp` workspace demonstrates JPEG/PNG decoding, core processing, and transparent PNG encoding with `sharp` as an application dependency:

```bash
npm run build
npm start --workspace @bordercut/node-sharp-example -- input.jpg output.png
```

The input buffer is not mutated. Extra bytes after `width * height * 4` are ignored, and output buffers are sized exactly to the image dimensions.

## Input contract

- `width` and `height` are positive safe integers.
- `data` is a `Uint8ClampedArray` containing at least `width * height * 4` straight-alpha, row-major RGBA bytes.
- Correction-sample and stroke-point coordinates are finite and fall within the image.
- A stroke has at least one point and a finite radius greater than zero and no larger than the image's largest dimension.
- Unknown options, non-finite numbers, out-of-range values, and invalid types throw an error.

## Correction guidance

The optional third argument accepts `{ samples, strokes }`. Point samples influence classification and connected-region decisions within an engine-derived area. Strokes provide richer smart guidance: `background` seeds removal and `foreground` seeds subject retention. After the global baseline is stable, the engine applies strokes in array order and grows each one through nearby connected, color-similar pixels while using visible edges, a bounded local reach, and opposite guidance as boundaries.

Each stroke rasterizes a round seed band with `radius` measured in image pixels along the straight segments between its ordered points; a one-point stroke seeds a dot. The effect can extend beyond that band within a bounded local reach and is intentionally not an exact alpha brush. Distant matching areas are not selected unless another stroke seeds them. Later strokes override earlier grown corrections where they reach; earlier opposite seed bands remain barriers unless repainted. With the source, options, samples, and earlier strokes unchanged, appending a `background` stroke cannot increase any output alpha value, and appending a `foreground` stroke cannot decrease one. The source image's alpha remains an upper bound: keep guidance cannot make an originally transparent pixel opaque. Existing callers may continue to pass a `SamplePoint[]` directly as the third argument.

## Options

| Option | Type | Range | Default | Purpose |
| --- | --- | --- | --- | --- |
| `tolerance` | number | 0–100 | 46 | Broadens or narrows accepted background colors. |
| `edgeProtection` | number | 0–100 | 58 | Makes visible transitions harder to cross. |
| `feather` | integer | 0–12 | 2 | Softens the final alpha edge in pixels. |
| `cleanup` | integer | 0–3 | 1 | Applies bounded majority cleanup. |
| `protectCenter` | boolean | — | true | Adds a weak centered-subject prior. |
| `recoverPaleSubject` | boolean | — | true | Recovers pale foreground against regular backgrounds. |
| `interiorBackground` | boolean | — | false | Opens confident enclosed background regions. |

Partial option objects are accepted; omitted values use the defaults exported as `DEFAULT_OPTIONS`.

## Exports

- `removeBackground`
- `DEFAULT_OPTIONS`
- `ALGORITHM_VERSION`
- `PixelImage`, `RemovalOptions`, `RemovalResult`, `RemovalDiagnostics`, `RemovalGuidance`, `RemovalGuidanceInput`, `SamplePoint`, `BrushStroke`, `StrokePoint`, `SampleKind`, and `BackgroundColor` types

The `@bordercut/core/browser` subpath exports `removeBackgroundFromBlob`, `decodeImageBlob`, `encodePngBlob`, and the `BrowserRemovalResult` type.

The npm tarball includes TypeScript sources so its JavaScript and declaration source maps resolve correctly, along with the standalone minified browser modules. The portable specification and cross-language fixtures live in the [source repository](https://github.com/kong75/bordercut).

## License

MIT
