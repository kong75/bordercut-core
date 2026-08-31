# BorderCut for Flutter

Flutter-native codecs and isolate-backed processing for the pure Dart
`bordercut` engine.

```dart
import 'package:bordercut_flutter/bordercut_flutter.dart';

final output = await removeBackgroundFromBytes(
  encodedImageBytes,
  guidance: const RemovalGuidance(
    strokes: [
      BrushStroke(
        kind: SampleKind.background,
        radius: 8,
        points: [StrokePoint(x: 40, y: 50)],
      ),
    ],
  ),
);

// output.png is a transparent PNG.
// output.result contains RGBA pixels, alpha, mask, and diagnostics.
```

`removeBackgroundInIsolate` accepts already-decoded RGBA pixels and keeps the
CPU-intensive algorithm off the UI isolate. `decodeImageBytes` and `encodePng`
use Flutter's engine codecs. The package makes no network requests.

This adapter is intentionally separate from the pure Dart package so command
line and server applications never take a Flutter dependency.
