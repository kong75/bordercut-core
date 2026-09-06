# BorderCut

BorderCut is a small, deterministic background-removal algorithm for images with a visually separable boundary. It uses classical image analysis—no model weights, network requests, accounts, or uploads.

The project is organized as a language-neutral specification with native TypeScript and Dart implementations. Both implementations share the same options, fixtures, result contract, and byte-exact algorithm-v1 alpha output. Flutter codecs and isolate processing live in a separate adapter package; Go remains planned.

The project is currently **pre-1.0 alpha software**. The algorithm contract is versioned, but package APIs may still change between minor releases.

Development currently happens in this private repository. The core retains its MIT license for a future public release; package publication is not enabled during private iteration. The product web app lives separately in [kong75/bordercut](https://github.com/kong75/bordercut).

## Before and after

<!-- showcase:start -->
| Example | Before | After |
| --- | --- | --- |
| Product photo · white background | ![Photograph before removal](docs/showcase/generated/apple-before.png) | ![Actual BorderCut output over a checkerboard](docs/showcase/generated/apple-after.png) |
| Controlled illustration · gradient background | ![Original SVG illustration before removal](docs/showcase/generated/bottle-before.png) | ![Actual BorderCut output over a checkerboard](docs/showcase/generated/bottle-after.png) |
| Controlled illustration · enclosed handle opening | ![Original SVG illustration before removal](docs/showcase/generated/mug-before.png) | ![Actual BorderCut output over a checkerboard](docs/showcase/generated/mug-after.png) |

These are actual algorithm outputs, without manual retouching or correction strokes. The checkerboard only displays transparency. The apple and bottle use default options; the mug enables `interiorBackground` to clear its handle opening. Processing uses images up to 1024 pixels on the longest edge; previews are reduced for the README.

The apple is a photograph; its output retains part of the contact shadow. The bottle and mug are controlled SVG illustrations, not evidence of photographic accuracy. These examples demonstrate favorable conditions rather than a general segmentation benchmark. See [source credits, exact inputs, and regeneration instructions](docs/showcase/README.md).
<!-- showcase:end -->

## Performance

<!-- benchmark:start -->
Measured 2026-09-06 with Node v24.11.1 on Intel(R) Core(TM) Ultra 9 275HX, win32 x64. Algorithm v1.

| Input | Pixels | Median | p95 |
| --- | --- | ---: | ---: |
| apple | 512 × 422 | 45.6 ms | 56.6 ms |
| apple | 1024 × 844 | 145.4 ms | 204.6 ms |
| apple | 2011 × 1657 | 556.8 ms | 599.7 ms |
| bottle | 512 × 512 | 46.7 ms | 66.8 ms |
| bottle | 1024 × 1024 | 197.9 ms | 225.3 ms |
| bottle | 2048 × 2048 | 914.1 ms | 972.8 ms |
| mug | 512 × 512 | 42.1 ms | 54.3 ms |
| mug | 1024 × 1024 | 186.7 ms | 200.4 ms |
| mug | 2048 × 2048 | 825.8 ms | 877.6 ms |

5 warm-up calls and 20 timed calls per row. Times cover the synchronous TypeScript algorithm and its allocations; they exclude decoding, resizing, PNG encoding, file I/O, and worker overhead. p95 uses nearest rank. Inputs and options match the showcase cases; photos are never enlarged.

These are measurements on one development machine, not latency guarantees or Dart/Flutter/browser measurements. Content, settings, runtime, hardware, and background activity affect timings. [Raw samples, source hashes, and environment](docs/benchmarks/latest.json) are retained so results can be compared honestly.

Reproduce with `npm ci && npm run benchmark`. Regenerate previews separately with `npm run docs:showcase`.
<!-- benchmark:end -->

## Status

| Target | Status |
| --- | --- |
| TypeScript | Reference implementation, algorithm v1 |
| Minimal web example | Working reference integration |
| Node + sharp example | Working file-to-PNG integration |
| Dart | Native implementation, algorithm v1, fixture-compatible |
| Flutter | Native codec and isolate adapter |
| Go | Planned; contract documented |

## Repository layout

```text
bordercut/
  spec/                    Language-neutral algorithm and schemas
  fixtures/v1/             Shared cross-language conformance cases
  packages/
    typescript/            Publishable @bordercut/core package
    dart/                  Pure-Dart algorithm-v1 package
    flutter/               Flutter codecs and isolate adapter
    go/                    Reserved Go port
  examples/
    minimal-web/           Unbranded Web Worker integration example
    node-sharp/            Runnable Node file adapter example
```

The core packages accept decoded RGBA bytes. Image codecs, resizing, UI, files, and networking stay in adapters and applications.

## Run locally

For TypeScript, Node.js 20.19 or newer and npm are required.

```bash
npm ci
npm run check
npm run dev
```

The example is served locally by Vite. Its production build is written to `examples/minimal-web/dist/`; the TypeScript library is written to `packages/typescript/dist/`.

For Dart and Flutter workspace development, use Flutter 3.41.7, matching CI.
Run these commands from the repository root:

```bash
flutter pub get
dart analyze packages/dart
dart test packages/dart
flutter analyze packages/flutter
flutter test packages/flutter
```

## TypeScript API

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
    strokes: [
      {
        kind: 'background', // remove this painted line
        radius: 8,
        points: [{ x: 24, y: 30 }, { x: 80, y: 42 }],
      },
    ],
  },
);

// result.image: transparent RGBA image
// result.alpha: one-byte alpha mask
// result.diagnostics.algorithmVersion: portable algorithm contract version
```

The package has no runtime dependencies. The default core entry does not decode or encode image files.

For a one-call browser workflow, the optional `@bordercut/core/browser` subpath accepts a `Blob` or `File` and returns the complete result plus a transparent PNG `Blob`:

```ts
import { removeBackgroundFromBlob } from '@bordercut/core/browser';

const { blob, diagnostics } = await removeBackgroundFromBlob(file);
```

This adapter uses browser-native codecs and remains separate from the default entry point. Interactive applications should process pixels in a Web Worker, as demonstrated by `examples/minimal-web`. Node applications can follow the runnable `examples/node-sharp` integration.

Inputs are validated at runtime. Width and height must be positive safe integers, RGBA data must be a sufficiently large `Uint8ClampedArray`, numeric options must be finite and within their documented ranges, and correction samples and strokes must fall inside the image.

The optional third argument accepts `{ samples, strokes }`. Samples influence classification and connected-region decisions within an engine-derived area. Brush strokes seed smart, color- and edge-aware local region guidance: `background` guides removal and `foreground` guides subject retention. Their effect may extend beyond the painted line, but bounded reach prevents a stroke from following matching colors across the image. Strokes run in array order after the global baseline is stable: a new Remove stroke can only lower alpha, while a new Keep stroke can only raise it. Stroke radius and points use image-pixel coordinates, and later strokes override earlier grown corrections where they reach. Passing a sample array directly remains supported for compatibility.

## Dart and Flutter APIs

The pure Dart package exposes the same pixel-level contract without JavaScript,
FFI, network access, or runtime dependencies:

```dart
final result = removeBackground(
  PixelImage(width: width, height: height, data: rgba),
  guidance: const RemovalGuidance(
    strokes: [
      BrushStroke(
        kind: SampleKind.background,
        radius: 8,
        points: [StrokePoint(x: 24, y: 30), StrokePoint(x: 80, y: 42)],
      ),
    ],
  ),
);
```

The separate Flutter adapter keeps engine concerns out of the core package. It
can decode supported image bytes, run the algorithm outside the UI isolate, and
encode the result as a transparent PNG:

```dart
final output = await removeBackgroundFromBytes(encodedImageBytes);
final transparentPng = output.png;
```

See [`packages/dart`](packages/dart) and [`packages/flutter`](packages/flutter)
for complete package usage.

## Algorithm overview

1. Sample and cluster plausible background colors around the image perimeter.
2. Fit a spatial color plane when the boundary supports a smooth gradient.
3. Score pixels using background distance, edge strength, center protection, and optional correction markers.
4. Flood-fill only background connected to trusted exterior seeds.
5. Recover pale subject material using blurred color evidence when the learned background is sufficiently regular.
6. Seal narrow, low-contrast false cutouts while preserving wider or high-contrast openings.
7. Clean and feather the alpha mask, then decontaminate semi-transparent edge colors.

See [the algorithm v1 specification](spec/algorithm-v1.md) for the portable contract.

## Controls

- **Background reach** broadens or narrows accepted background colors.
- **Edge protection** makes visible transitions harder to cross.
- **Edge softness** feathers the alpha boundary.
- **Speck cleanup** removes isolated pixel decisions.
- **Protect the center** adds a weak centered-subject prior.
- **Recover pale subject** repairs light material that resembles a regular backdrop.
- **Open interior holes** removes confident enclosed background regions.
- **Remove brush** guides removal through nearby, visually similar background.
- **Keep brush** guides subject retention through nearby, visually similar material.
- **Brush size** controls how much evidence each correction stroke supplies.

The public example intentionally contains only the integration needed to exercise these APIs. Product UI, branding, and deployment code belong in a separate application repository that consumes the released package.

## Cross-language compatibility

Every implementation should:

- expose the option names and defaults in `spec/options.schema.json`;
- report its supported algorithm version;
- pass the shared cases in `fixtures/v1/cases.json`;
- remain deterministic for identical bytes, dimensions, options, and correction guidance.

TypeScript remains the specification reference. The Dart port is independently implemented and must retain byte-exact alpha compatibility with every published algorithm-v1 fixture.

## Known limits

No rule-based tool can infer semantics in every image. A white subject in snow, a subject covering every edge, motion blur, or highly detailed scenery may need correction strokes or a semantic model. BorderCut is strongest on product photos, portraits with separable backgrounds, chroma-key images, studio gradients, icons, screenshots, and controlled illustrations.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Behavioral changes should update tests and, when applicable, the shared portable fixtures. Community expectations, support, security reporting, governance, and release history are documented in:

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SUPPORT.md](SUPPORT.md)
- [SECURITY.md](SECURITY.md)
- [GOVERNANCE.md](GOVERNANCE.md)
- [CHANGELOG.md](CHANGELOG.md)

The local release checklist is in [RELEASING.md](RELEASING.md). Public hosting and package publication remain manual maintainer decisions.

## License

MIT
