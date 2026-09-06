import 'dart:typed_data';
import 'dart:ui' as ui;

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

  test('decodes translucent PNG colors as straight RGBA', () async {
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawColor(const ui.Color.fromARGB(128, 255, 0, 0), ui.BlendMode.src);
    final picture = recorder.endRecording();
    final image = await picture.toImage(1, 1);
    try {
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final decoded = await decodeImageBytes(png!.buffer.asUint8List());
      expect(decoded.data, <int>[255, 0, 0, 128]);
    } finally {
      image.dispose();
      picture.dispose();
    }
  });

  test('encodes straight RGBA without changing translucent colors or input',
      () async {
    final pixels = Uint8ClampedList.fromList(<int>[128, 64, 32, 128]);
    final png = await encodePng(PixelImage(width: 1, height: 1, data: pixels));
    final codec = await ui.instantiateImageCodec(png);
    try {
      final frame = await codec.getNextFrame();
      try {
        final bytes = await frame.image
            .toByteData(format: ui.ImageByteFormat.rawStraightRgba);
        final decoded =
            bytes!.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes);
        // The native codec can round when converting 8-bit premultiplied pixels.
        for (var channel = 0; channel < 3; channel += 1) {
          expect(decoded[channel], closeTo(pixels[channel], 1));
        }
        expect(decoded[3], 128);
        expect(pixels, <int>[128, 64, 32, 128]);
      } finally {
        frame.image.dispose();
      }
    } finally {
      codec.dispose();
    }
  });

  test('rejects invalid pixel dimensions and buffers before encoding',
      () async {
    for (final image in <PixelImage>[
      PixelImage(width: 0, height: 1, data: Uint8ClampedList(4)),
      PixelImage(width: 1, height: -1, data: Uint8ClampedList(4)),
      PixelImage(width: 2, height: 1, data: Uint8ClampedList(7)),
    ]) {
      await expectLater(encodePng(image), throwsArgumentError);
    }
  });
}
