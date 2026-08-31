import 'dart:typed_data';

import 'package:bordercut/bordercut.dart';

void main() {
  const width = 32;
  const height = 32;
  final rgba = Uint8ClampedList(width * height * 4);
  for (var index = 0; index < width * height; index += 1) {
    final offset = index * 4;
    rgba[offset] = 245;
    rgba[offset + 1] = 245;
    rgba[offset + 2] = 245;
    rgba[offset + 3] = 255;
  }

  final result = removeBackground(
    PixelImage(width: width, height: height, data: rgba),
    options: const BorderCutOptions(protectCenter: false),
  );
  print('Removed ${(result.diagnostics.removedFraction * 100).round()}%');
}
