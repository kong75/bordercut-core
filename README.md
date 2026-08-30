# BorderCut

BorderCut is a small, deterministic background-removal algorithm for images with a visually separable boundary. It uses classical image analysis—no model weights, network requests, accounts, or uploads.

The project is organized as a language-neutral specification with a TypeScript reference implementation. Dart/Flutter and Go ports have reserved package homes and will share the same options, fixtures, and result contract.

The project is currently **pre-1.0 alpha software**. The algorithm contract is versioned, but package APIs may still change between minor releases.

## Status

| Target | Status |
| --- | --- |
| TypeScript | Reference implementation, algorithm v1 |
| Minimal web example | Working reference integration |
| Dart / Flutter | Planned; contract documented |
| Go | Planned; contract documented |

## Repository layout

```text
bordercut/
  spec/                    Language-neutral algorithm and schemas
  fixtures/v1/             Shared cross-language conformance cases
  packages/
    typescript/            Publishable @bordercut/core package
    dart/                  Reserved pure-Dart/Flutter port
    go/                    Reserved Go port
  examples/
    minimal-web/           Unbranded browser integration example
```

The core packages accept decoded RGBA bytes. Image codecs, resizing, UI, files, and networking stay in adapters and applications.

## Run locally

Node.js 20.19 or newer and npm are required.

```bash
npm ci
npm run check
npm run dev
```

The example is served locally by Vite. Its production build is written to `examples/minimal-web/dist/`; the TypeScript library is written to `packages/typescript/dist/`.

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

The package has no runtime dependencies. It does not decode or encode image files.

Inputs are validated at runtime. Width and height must be positive safe integers, RGBA data must be a sufficiently large `Uint8ClampedArray`, numeric options must be finite and within their documented ranges, and correction samples and strokes must fall inside the image.

The optional third argument accepts `{ samples, strokes }`. Samples influence classification and connected-region decisions within an engine-derived area. Brush strokes seed smart, color- and edge-aware local region guidance: `background` guides removal and `foreground` guides subject retention. Their effect may extend beyond the painted line, but bounded reach prevents a stroke from following matching colors across the image. Strokes run in array order after the global baseline is stable: a new Remove stroke can only lower alpha, while a new Keep stroke can only raise it. Stroke radius and points use image-pixel coordinates, and later strokes override earlier grown corrections where they reach. Passing a sample array directly remains supported for compatibility.

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

The TypeScript implementation is the numerical reference until another port reaches fixture compatibility.

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
