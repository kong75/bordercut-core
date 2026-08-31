# BorderCut for Dart

Native, dependency-free background removal for decoded RGBA pixels. This is a
faithful Dart implementation of BorderCut algorithm v1, including smart local
Remove and Keep strokes. It performs no network requests and ships no model
weights.

```dart
import 'dart:typed_data';

import 'package:bordercut/bordercut.dart';

final result = removeBackground(
  PixelImage(
    width: width,
    height: height,
    data: Uint8ClampedList.fromList(rgbaBytes),
  ),
  guidance: const RemovalGuidance(
    strokes: [
      BrushStroke(
        kind: SampleKind.background,
        radius: 8,
        points: [
          StrokePoint(x: 24, y: 30),
          StrokePoint(x: 80, y: 42),
        ],
      ),
    ],
  ),
);

// result.image.data: transparent RGBA pixels
// result.alpha: one byte per pixel
// result.mask.data: grayscale RGBA preview mask
```

The core accepts pixels rather than image files so it stays usable in Dart
servers, command-line programs, and Flutter. Image decoding and encoding belong
in adapters. Flutter applications can use the sibling `bordercut_flutter`
package for codecs and isolate-backed processing.

Options match the language-neutral contract in `../../spec/options.schema.json`.
Samples and stroke points use image-pixel coordinates. Remove strokes can only
add nearby background; Keep strokes can only restore nearby foreground. Growth
is bounded and constrained by color continuity and edges.

## Development

```bash
dart pub get
dart analyze
dart test
dart pub publish --dry-run --ignore-warnings
```

The tests run the shared cross-language fixtures and require byte-for-byte alpha
compatibility with the TypeScript reference implementation.

The dry run currently ignores the expected missing-repository warning. Add the
canonical hosted URL and run without `--ignore-warnings` before publication.

MIT licensed. BorderCut is pre-1.0 alpha software.
