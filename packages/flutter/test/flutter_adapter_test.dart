import 'dart:typed_data';

import 'package:bordercut_flutter/bordercut_flutter.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('runs the native engine in an isolate', () async {
    const width = 24;
    const height = 24;
    final data = Uint8ClampedList(width * height * 4);
    for (var index = 0; index < width * height; index += 1) {
      final offset = index * 4;
      data[offset] = 245;
      data[offset + 1] = 245;
      data[offset + 2] = 245;
      data[offset + 3] = 255;
    }
    final result = await removeBackgroundInIsolate(
      PixelImage(width: width, height: height, data: data),
      options:
          const BorderCutOptions(protectCenter: false, feather: 0, cleanup: 0),
    );
    expect(result.alpha, hasLength(width * height));
    expect(result.diagnostics.algorithmVersion, algorithmVersion);
  });

  test('PNG encoding and decoding preserve dimensions', () async {
    final image = PixelImage(
      width: 2,
      height: 1,
      data: Uint8ClampedList.fromList(<int>[255, 0, 0, 255, 0, 0, 0, 0]),
    );
    final png = await encodePng(image);
    final decoded = await decodeImageBytes(png);
    expect(decoded.width, 2);
    expect(decoded.height, 1);
    expect(decoded.data, hasLength(8));
  });
}
