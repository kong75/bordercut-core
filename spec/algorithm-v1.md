# BorderCut algorithm v1

## Scope

BorderCut removes a visually separable background from an RGBA raster without machine-learning models or network access. It is designed for portraits, product images, chroma-key images, icons, screenshots, and illustrations with a reasonably observable image boundary.

The core owns pixel classification only. File decoding, resizing, display, and encoding belong to host applications.

## Input contract

- Pixels are row-major, top-to-bottom, left-to-right.
- Each pixel is four unsigned bytes in straight-alpha RGBA order.
- Width and height are positive integers.
- The buffer contains at least `width * height * 4` bytes.
- Sample and stroke points use pixel coordinates with origin `(0, 0)` at the top-left.
- A correction stroke contains a kind, a positive brush radius in image pixels, and one or more ordered points. The radius must not exceed the image's largest dimension.
- Implementations must not mutate the caller's input buffer.
- Extra input bytes after the declared image are ignored; returned image and mask buffers describe exactly `width * height` pixels.
- Invalid dimensions, undersized buffers, invalid option values, malformed guidance, and out-of-bounds correction coordinates are rejected before processing.

The guidance object may contain both `samples` and `strokes`. Samples influence classification and connected-region decisions. Strokes provide labeled seed bands for smart region guidance: `background` guides removal and `foreground` guides subject retention. A one-point stroke seeds the closed disc whose center is that point; a multi-point stroke seeds every pixel center within the radius of any straight polyline segment. Strokes are applied in array order after global classification is complete. The current stroke replaces earlier seed labels in its painted band before its regional effect is grown.

Stroke seeds are not exact alpha overrides. For each connected seed component of the current stroke, implementations sample representative seed colors and grow through four-connected pixels whose color remains sufficiently close to both the component palette and the preceding pixel. Growth is limited to `max(24, floor(min(width, height) * 0.18 + 0.5))` steps along the shortest accepted four-connected path from the nearest seed pixel in that component. Edge protection limits boundary crossings. Opposite-labeled stroke seeds accumulated from earlier strokes are barriers unless the current painted band replaces them. Consequently, a stroke may change nearby pixels beyond its painted band while stopping at a visually distinct boundary or the bounded local reach.

Stroke effects are directional and cumulative. A `background` stroke only changes foreground decisions to background decisions; a `foreground` stroke only changes background decisions to foreground decisions. With the image, options, samples, and existing stroke prefix unchanged, appending a `background` stroke must not increase any output alpha byte, and appending a `foreground` stroke must not decrease any output alpha byte. Later strokes therefore override earlier grown corrections wherever the later growth reaches, without changing unrelated pixels in the opposite direction.

## Output contract

Every implementation returns:

- a transparent RGBA image at the input dimensions;
- a grayscale RGBA mask at the input dimensions;
- one unsigned alpha byte per pixel;
- diagnostics containing `algorithmVersion`, background mode, learned colors, elapsed time when available, removed fraction, background noise, recovered fraction, whether pale-subject recovery changed the result, and the derived threshold.

Transparent output pixels should have RGB set to zero. Partially transparent edge pixels may be decontaminated against the learned background color.

## Required stages

Implementations follow these stages in order:

1. Sample the perimeter, including explicit corner samples.
2. Cluster samples into up to three background colors and reject weak clusters.
3. Fit a robust spatial color plane when the perimeter supports a smooth gradient.
4. Score each pixel from background color distance, local edge strength, center protection, and optional user samples.
5. Flood-fill background from trusted corners, top and side borders, safe bottom corners, and explicit background samples.
6. Optionally recover pale foreground on sufficiently regular backgrounds:
   - blur distance from the learned local background;
   - grow candidates only from foreground already established by the strict pass;
   - restore extremely background-like regions connected to an exterior edge;
   - seal only narrow, low-contrast channels bounded by foreground;
   - reclaim regions enclosed by a sealed false channel;
   - reject recovery when it changes an implausibly large share of the image.
7. Recover large, confidently background-colored islands according to the engine's interior-background rules, including local floods seeded by explicit background samples.
8. Apply optional interior-background classification and bounded majority cleanup to finish the global baseline.
9. Apply strokes sequentially. Rasterize the current seed band into the accumulated label mask, grow its bounded local region while respecting edges and opposite labels, then change decisions only in the stroke's direction.
10. Reapply the engine-defined foreground-sample protection area.
11. Build and feather the alpha mask.
12. Multiply by the source alpha, composite original RGB through the mask, and decontaminate semi-transparent edges. Source alpha remains an upper bound even under foreground guidance.

## Compatibility levels

- **API compatible:** uses the option and result contract but may use different heuristics.
- **Fixture compatible:** passes every assertion in `fixtures/v1/cases.json`.
- **Reference compatible:** matches the TypeScript implementation's alpha output within an agreed tolerance on the full golden corpus.

The initial Dart and Go packages should target fixture compatibility. Exact floating-point parity is not required across runtimes unless a fixture explicitly requires it.

## Determinism

Given the same bytes, dimensions, options, and correction guidance, an implementation must return the same alpha mask on repeated runs. Implementations may report different `elapsedMs` values.

## Conformance fixtures

Fixture v1 recipes use solid or axis-aligned linear-gradient RGBA backgrounds, ordered rectangles and ellipses, and optional foreground/background correction samples and strokes. Implementations render these recipes without image codecs, run the algorithm, and check alpha and diagnostic assertions. The fixture schema is authoritative for recipe validation.

`referenceAlphaSha256` fingerprints the complete TypeScript reference alpha buffer. Fixture-compatible ports need only satisfy the portable assertions. A port claiming reference compatibility must also match the fingerprint for every case that provides one.
