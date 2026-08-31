import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:bordercut/bordercut.dart';
import 'package:crypto/crypto.dart';
import 'package:test/test.dart';

typedef JsonMap = Map<String, Object?>;

List<int> _color(Object? value) => (value! as List<Object?>)
    .cast<num>()
    .map((value) => value.toInt())
    .toList();

void _paint(Uint8ClampedList data, int width, int x, int y, List<int> color) {
  final offset = (y * width + x) * 4;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = color[3];
}

List<int> _backgroundAt(JsonMap fixture, int x, int y) {
  final background = fixture['background']!;
  if (background is List<Object?>) return _color(background);
  final gradient = background as JsonMap;
  final width = (fixture['width']! as num).toInt();
  final height = (fixture['height']! as num).toInt();
  final horizontal = gradient['axis'] == 'x';
  final span = horizontal ? width - 1 : height - 1;
  final position = horizontal ? x : y;
  final progress = span == 0 ? 0.0 : position / span;
  final from = _color(gradient['from']);
  final to = _color(gradient['to']);
  return List.generate(4,
      (index) => (from[index] + (to[index] - from[index]) * progress).round());
}

bool _contains(JsonMap region, int x, int y) {
  if (region['shape'] == 'rect') {
    return x >= (region['xMin']! as num) &&
        x <= (region['xMax']! as num) &&
        y >= (region['yMin']! as num) &&
        y <= (region['yMax']! as num);
  }
  final dx = (x - (region['centerX']! as num)) / (region['radiusX']! as num);
  final dy = (y - (region['centerY']! as num)) / (region['radiusY']! as num);
  return dx * dx + dy * dy <= 1;
}

PixelImage _makeImage(JsonMap fixture) {
  final width = (fixture['width']! as num).toInt();
  final height = (fixture['height']! as num).toInt();
  final data = Uint8ClampedList(width * height * 4);
  for (var y = 0; y < height; y += 1) {
    for (var x = 0; x < width; x += 1) {
      _paint(data, width, x, y, _backgroundAt(fixture, x, y));
    }
  }
  for (final rawRegion in (fixture['regions']! as List<Object?>)) {
    final region = rawRegion! as JsonMap;
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        if (_contains(region, x, y)) {
          _paint(data, width, x, y, _color(region['color']));
        }
      }
    }
  }
  return PixelImage(width: width, height: height, data: data);
}

SampleKind _kind(Object? value) =>
    value == 'background' ? SampleKind.background : SampleKind.foreground;

RemovalGuidance _guidance(JsonMap fixture) {
  final samples = <SamplePoint>[
    for (final raw in (fixture['samples'] as List<Object?>? ?? const []))
      SamplePoint(
        x: ((raw! as JsonMap)['x']! as num).toDouble(),
        y: (raw['y']! as num).toDouble(),
        kind: _kind(raw['kind']),
      ),
  ];
  final strokes = <BrushStroke>[
    for (final raw in (fixture['strokes'] as List<Object?>? ?? const []))
      BrushStroke(
        kind: _kind((raw! as JsonMap)['kind']),
        radius: (raw['radius']! as num).toDouble(),
        points: <StrokePoint>[
          for (final point in (raw['points']! as List<Object?>))
            _strokePoint(point! as JsonMap),
        ],
      ),
  ];
  return RemovalGuidance(samples: samples, strokes: strokes);
}

StrokePoint _strokePoint(JsonMap point) => StrokePoint(
      x: (point['x']! as num).toDouble(),
      y: (point['y']! as num).toDouble(),
    );

String _mode(BackgroundMode mode) => switch (mode) {
      BackgroundMode.solid => 'solid',
      BackgroundMode.multiColor => 'multi-color',
      BackgroundMode.gradient => 'gradient',
    };

void main() {
  final fixtureFile = File('../../fixtures/v1/cases.json').existsSync()
      ? File('../../fixtures/v1/cases.json')
      : File('fixtures/v1/cases.json');
  final root = jsonDecode(fixtureFile.readAsStringSync())! as JsonMap;
  final fixtures = (root['cases']! as List<Object?>).cast<JsonMap>();

  test('shared fixtures target this algorithm version', () {
    expect(root['algorithmVersion'], algorithmVersion);
  });

  for (final fixture in fixtures) {
    test(fixture['id']! as String, () {
      final width = (fixture['width']! as num).toInt();
      final result = removeBackground(
        _makeImage(fixture),
        options: BorderCutOptions.fromJson(fixture['options']! as JsonMap),
        guidance: _guidance(fixture),
      );
      expect(result.diagnostics.algorithmVersion, algorithmVersion);
      final referenceHash = fixture['referenceAlphaSha256'];
      if (referenceHash != null) {
        expect(sha256.convert(result.alpha).toString(), referenceHash,
            reason: fixture['id']! as String);
      }
      for (final rawAssertion in (fixture['assertions']! as List<Object?>)) {
        final assertion = rawAssertion! as JsonMap;
        final x = (assertion['x']! as num).toInt();
        final y = (assertion['y']! as num).toInt();
        final alpha = result.alpha[y * width + x];
        if (assertion['alphaMin'] case final num minimum) {
          expect(alpha, greaterThanOrEqualTo(minimum), reason: '$x,$y');
        }
        if (assertion['alphaMax'] case final num maximum) {
          expect(alpha, lessThanOrEqualTo(maximum), reason: '$x,$y');
        }
      }
      final expected = fixture['diagnostics'] as JsonMap?;
      if (expected == null) return;
      if (expected['mode'] case final String mode) {
        expect(_mode(result.diagnostics.mode), mode);
      }
      if (expected['subjectRecoveryApplied'] case final bool applied) {
        expect(result.diagnostics.subjectRecoveryApplied, applied);
      }
      if (expected['removedFractionMin'] case final num minimum) {
        expect(
            result.diagnostics.removedFraction, greaterThanOrEqualTo(minimum));
      }
      if (expected['removedFractionMax'] case final num maximum) {
        expect(result.diagnostics.removedFraction, lessThanOrEqualTo(maximum));
      }
      if (expected['recoveredFractionMin'] case final num minimum) {
        expect(result.diagnostics.recoveredFraction,
            greaterThanOrEqualTo(minimum));
      }
    });
  }
}
