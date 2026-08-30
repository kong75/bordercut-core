# Changelog

All notable changes to BorderCut are documented here. The project follows Semantic Versioning while recognizing that pre-1.0 APIs may change between minor releases.

## Unreleased

### Added

- Release-readiness validation, package-consumer smoke testing, governance documents, and contribution templates.
- Runtime validation for images, options, and correction guidance.
- Expanded portable fixtures covering gradients, enclosed holes, correction markers, lower-edge subjects, pale-subject recovery, and exterior openings.
- Smart, bounded local, color- and edge-aware remove/keep stroke guidance in the core package, portable fixtures, and reference example, with brush sizing, undo, and clear controls.

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
