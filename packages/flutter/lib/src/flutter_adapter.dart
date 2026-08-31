import 'dart:isolate';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:bordercut/bordercut.dart';

/// A core removal result plus its encoded transparent PNG.
final class FlutterRemovalResult {
  const FlutterRemovalResult({required this.result, required this.png});

  final RemovalResult result;
  final Uint8List png;
}

/// Runs the CPU-intensive core algorithm outside Flutter's UI isolate.
Future<RemovalResult> removeBackgroundInIsolate(
  PixelImage image, {
  BorderCutOptions options = defaultOptions,
  RemovalGuidance guidance = const RemovalGuidance(),
}) =>
    Isolate.run(
      () => removeBackground(image, options: options, guidance: guidance),
      debugName: 'BorderCut',
    );

/// Decodes any image format supported by the current Flutter engine to RGBA.
Future<PixelImage> decodeImageBytes(Uint8List encoded) async {
  final buffer = await ui.ImmutableBuffer.fromUint8List(encoded);
  final descriptor = await ui.ImageDescriptor.encoded(buffer);
  final codec = await descriptor.instantiateCodec();
  try {
    final frame = await codec.getNextFrame();
    try {
      final bytes =
          await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (bytes == null) {
        throw StateError('Flutter could not decode the image to RGBA pixels.');
      }
      return PixelImage(
        width: frame.image.width,
        height: frame.image.height,
        data: Uint8ClampedList.fromList(
            bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes)),
      );
    } finally {
      frame.image.dispose();
    }
  } finally {
    codec.dispose();
    descriptor.dispose();
    buffer.dispose();
  }
}

/// Encodes an RGBA image as a transparent PNG using Flutter's native codec.
Future<Uint8List> encodePng(PixelImage image) async {
  final rgba = image.data.buffer.asUint8List(
    image.data.offsetInBytes,
    image.data.lengthInBytes,
  );
  final buffer = await ui.ImmutableBuffer.fromUint8List(rgba);
  final descriptor = ui.ImageDescriptor.raw(
    buffer,
    width: image.width,
    height: image.height,
    rowBytes: image.width * 4,
    pixelFormat: ui.PixelFormat.rgba8888,
  );
  final codec = await descriptor.instantiateCodec();
  try {
    final frame = await codec.getNextFrame();
    try {
      final bytes =
          await frame.image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null) {
        throw StateError('Flutter could not encode the image as PNG.');
      }
      return Uint8List.fromList(
          bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes));
    } finally {
      frame.image.dispose();
    }
  } finally {
    codec.dispose();
    descriptor.dispose();
    buffer.dispose();
  }
}

/// Decodes, removes the background in an isolate, and returns a transparent PNG.
Future<FlutterRemovalResult> removeBackgroundFromBytes(
  Uint8List encoded, {
  BorderCutOptions options = defaultOptions,
  RemovalGuidance guidance = const RemovalGuidance(),
}) async {
  final image = await decodeImageBytes(encoded);
  final result = await removeBackgroundInIsolate(image,
      options: options, guidance: guidance);
  return FlutterRemovalResult(
      result: result, png: await encodePng(result.image));
}
