# @bordercut/core

The dependency-free TypeScript reference implementation of BorderCut's language-neutral background-removal algorithm. It accepts decoded RGBA bytes and performs no file, codec, UI, account, telemetry, or network operations.

Status: pre-1.0 alpha, algorithm contract v1. The package is ESM-only and supports Node.js 20.19 or newer and modern browsers with ES2022 support.

## Installation

Once the package is published by a maintainer:

```bash
npm install @bordercut/core
```

For repository development, use `npm ci` at the workspace root.

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

The npm tarball includes TypeScript sources so its JavaScript and declaration source maps resolve correctly. The portable specification and cross-language fixtures live in the source repository; its canonical hosting URL will be added to package metadata before the first hosted release.

## License

MIT
