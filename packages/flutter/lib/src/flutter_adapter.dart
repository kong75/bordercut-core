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
  ui.ImageDescriptor? descriptor;
  ui.Codec? codec;
  try {
    descriptor = await ui.ImageDescriptor.encoded(buffer);
    codec = await descriptor.instantiateCodec();
    final frame = await codec.getNextFrame();
    try {
      final bytes = await frame.image
          .toByteData(format: ui.ImageByteFormat.rawStraightRgba);
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
    codec?.dispose();
    descriptor?.dispose();
    buffer.dispose();
  }
}

/// Encodes an RGBA image as a transparent PNG using Flutter's native codec.
Future<Uint8List> encodePng(PixelImage image) async {
  if (image.width <= 0 ||
      image.height <= 0 ||
      image.data.length < image.width * image.height * 4) {
    throw ArgumentError('PNG encoding expects a valid RGBA PixelImage.');
  }

  // Flutter's rgba8888 codec expects premultiplied channels. Keep the core's
  // straight-alpha input untouched, including any bytes beyond the image.
  final rgba = Uint8List(image.width * image.height * 4);
  for (var offset = 0; offset < rgba.length; offset += 4) {
    final alpha = image.data[offset + 3];
    for (var channel = 0; channel < 3; channel += 1) {
      rgba[offset + channel] =
          (image.data[offset + channel] * alpha + 127) ~/ 255;
    }
    rgba[offset + 3] = alpha;
  }
  final buffer = await ui.ImmutableBuffer.fromUint8List(rgba);
  ui.ImageDescriptor? descriptor;
  ui.Codec? codec;
  try {
    descriptor = ui.ImageDescriptor.raw(
      buffer,
      width: image.width,
      height: image.height,
      rowBytes: image.width * 4,
      pixelFormat: ui.PixelFormat.rgba8888,
    );
    codec = await descriptor.instantiateCodec();
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
    codec?.dispose();
    descriptor?.dispose();
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
