import 'dart:typed_data';

import 'package:bordercut/bordercut.dart';
import 'package:test/test.dart';

PixelImage _solidImage(int width, int height) {
  final data = Uint8ClampedList(width * height * 4);
  for (var index = 0; index < width * height; index += 1) {
    final offset = index * 4;
    data[offset] = 245;
    data[offset + 1] = 245;
    data[offset + 2] = 245;
    data[offset + 3] = 255;
  }
  return PixelImage(width: width, height: height, data: data);
}

void main() {
  test('is deterministic and does not mutate input pixels', () {
    final image = _solidImage(32, 32);
    final before = Uint8ClampedList.fromList(image.data);
    final first = removeBackground(image);
    final second = removeBackground(image);

    expect(first.alpha, second.alpha);
    expect(first.image.data, second.image.data);
    expect(image.data, before);
  });

  test('validates RGBA length and option ranges', () {
    expect(
      () => removeBackground(
          PixelImage(width: 2, height: 2, data: Uint8ClampedList(15))),
      throwsArgumentError,
    );
    expect(
      () => removeBackground(
        _solidImage(8, 8),
        options: const BorderCutOptions(tolerance: double.nan),
      ),
      throwsRangeError,
    );
    expect(
      () => removeBackground(
        _solidImage(8, 8),
        options: const BorderCutOptions(feather: 13),
      ),
      throwsRangeError,
    );
  });

  test('validates samples, strokes, and stroke points', () {
    final image = _solidImage(8, 8);
    expect(
      () => removeBackground(
        image,
        guidance: const RemovalGuidance(
          samples: [SamplePoint(x: 8, y: 0, kind: SampleKind.background)],
        ),
      ),
      throwsRangeError,
    );
    expect(
      () => removeBackground(
        image,
        guidance: const RemovalGuidance(
          strokes: [
            BrushStroke(kind: SampleKind.background, radius: 1, points: [])
          ],
        ),
      ),
      throwsArgumentError,
    );
    expect(
      () => removeBackground(
        image,
        guidance: const RemovalGuidance(
          strokes: [
            BrushStroke(
              kind: SampleKind.foreground,
              radius: 1,
              points: [StrokePoint(x: -1, y: 0)],
            ),
          ],
        ),
      ),
      throwsRangeError,
    );
  });

  test('rejects unknown JSON options', () {
    expect(
      () => BorderCutOptions.fromJson(<String, Object?>{'unknown': true}),
      throwsArgumentError,
    );
  });
}
