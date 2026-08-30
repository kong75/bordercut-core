# BorderCut for Dart and Flutter

Status: planned.

This directory is reserved for the pure-Dart port of algorithm v1. The core package will operate on typed RGBA buffers and must not depend on Flutter. A small optional Flutter adapter may handle `ui.Image`, isolates, and PNG encoding.

Target API shape:

```dart
BorderCutResult removeBackground(
  PixelImage image, {
  BorderCutOptions options = const BorderCutOptions(),
  List<SamplePoint> samples = const [],
});
```

Implementation requirements:

- follow `spec/algorithm-v1.md`;
- use the defaults in `spec/options.schema.json`;
- run the shared cases in `fixtures/v1/cases.json`;
- keep decoding, encoding, and Flutter UI outside the core library.
