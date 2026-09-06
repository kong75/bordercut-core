# Changelog

All notable changes to BorderCut are documented here. The project follows Semantic Versioning while recognizing that pre-1.0 APIs may change between minor releases.

## Unreleased

### Fixed

- Flutter codecs now convert correctly between the core's straight RGBA and native premultiplied RGBA, validate encoding inputs, and release native resources on codec initialization failures.

### Added

- Reproducible README before/after gallery with credited source assets and a TypeScript benchmark retaining raw timing samples and environment details.
- Optional `@bordercut/core/browser` Blob-to-transparent-PNG adapter with focused tests.
- Web Worker processing in the minimal browser example, using transferable pixel buffers.
- Runnable Node + `sharp` file-to-PNG integration example and automated smoke test.
- Release-readiness validation, package-consumer smoke testing, governance documents, and contribution templates.
- Runtime validation for images, options, and correction guidance.
- Expanded portable fixtures covering gradients, enclosed holes, correction markers, lower-edge subjects, pale-subject recovery, and exterior openings.
- Smart, bounded local, color- and edge-aware remove/keep stroke guidance in the core package, portable fixtures, and reference example, with brush sizing, undo, and clear controls.
- Native pure-Dart algorithm-v1 package with byte-exact fixture compatibility.
- Separate Flutter codec and isolate adapter with transparent PNG helpers.
- Dart/Flutter analysis, tests, and dry-run archive validation in CI.

### Changed

- The npm package now builds during `prepack`, ships its TypeScript source alongside source maps, and declares its supported Node version.
- CI now uses least-privilege permissions, pinned actions, a Node support matrix, and dependency auditing.
- Correction strokes now run after global segmentation and apply sequentially, so Remove never raises alpha and Keep never lowers it.

## 0.2.0 - 2026-08-30

### Added

- Language-neutral algorithm v1 specification and JSON schemas.
- Shared cross-language conformance fixtures.
- Publishable `@bordercut/core` workspace package.
- Minimal browser integration example.
- Pale-subject recovery and background/foreground correction markers.

### Changed

- Reorganized the prototype into a package-oriented monorepo.

## 0.1.0 - 2026-08-22

### Added

- Initial TypeScript background-removal prototype and browser interface.
