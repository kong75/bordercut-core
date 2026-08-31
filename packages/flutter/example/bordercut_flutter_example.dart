import 'dart:typed_data';

import 'package:bordercut_flutter/bordercut_flutter.dart';
import 'package:flutter/widgets.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final source = PixelImage(
    width: 1,
    height: 1,
    data: Uint8ClampedList.fromList(<int>[245, 245, 245, 255]),
  );
  final encoded = await encodePng(source);
  final output = await removeBackgroundFromBytes(
    encoded,
    options: const BorderCutOptions(protectCenter: false),
  );
  debugPrint('Transparent PNG bytes: ${output.png.length}');
}
