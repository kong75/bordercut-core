import 'dart:math' as math;
import 'dart:typed_data';

import 'types.dart';

/// The portable algorithm contract implemented by this package.
const int algorithmVersion = 1;

/// Default algorithm-v1 controls.
const BorderCutOptions defaultOptions = BorderCutOptions();

double _clamp(double value, double minimum, double maximum) =>
    math.min(maximum, math.max(minimum, value));

int _clampInt(int value, int minimum, int maximum) =>
    math.min(maximum, math.max(minimum, value));

final class _ColorSample {
  _ColorSample({
    required this.r,
    required this.g,
    required this.b,
    required this.x,
    required this.y,
    required this.corner,
  });

  final double r;
  final double g;
  final double b;
  final double x;
  final double y;
  final int corner;
  int assignment = 0;
}

final class _Cluster {
  _Cluster({
    required this.id,
    required this.r,
    required this.g,
    required this.b,
  });

  final int id;
  double r;
  double g;
  double b;
  int count = 0;
  double share = 0;
  double spread = 0;
  double reliability = 0;
  int cornerHits = 0;
  int topCornerHits = 0;
  int bottomCornerHits = 0;
  int trustedBorderHits = 0;
  double trustedShare = 0;
}

final class _Plane {
  _Plane({
    required this.r,
    required this.g,
    required this.b,
  });

  List<double> r;
  List<double> g;
  List<double> b;
  double rmse = 255;
  bool enabled = false;
}

final class _BackgroundModel {
  const _BackgroundModel({
    required this.clusters,
    required this.plane,
    required this.noise,
  });

  final List<_Cluster> clusters;
  final _Plane plane;
  final double noise;
}

final class _SubjectRecoveryResult {
  const _SubjectRecoveryResult({
    required this.background,
    required this.applied,
    required this.recoveredPixels,
  });

  final Uint8List background;
  final bool applied;
  final int recoveredPixels;
}

final class _StrokeBounds {
  const _StrokeBounds({
    required this.minX,
    required this.maxX,
    required this.minY,
    required this.maxY,
  });

  final int minX;
  final int maxX;
  final int minY;
  final int maxY;
}

final class _StrokeRegionWorkspace {
  _StrokeRegionWorkspace(int pixelCount)
      : strokeMarks = Uint32List(pixelCount),
        processedSeedMarks = Uint32List(pixelCount),
        floodMarks = Uint32List(pixelCount),
        floodDistances = Uint32List(pixelCount),
        queue = Uint32List(pixelCount);

  final Uint32List strokeMarks;
  final Uint32List processedSeedMarks;
  final Uint32List floodMarks;
  final Uint32List floodDistances;
  final Uint32List queue;
  int operationId = 0;
  int componentId = 0;
}

void _validateImage(PixelImage image) {
  if (image.width < 1 || image.height < 1) {
    throw RangeError('Image width and height must be positive integers.');
  }
  final requiredLength = image.width * image.height * 4;
  if (image.data.length < requiredLength) {
    throw ArgumentError(
      'Image data must contain at least $requiredLength RGBA bytes.',
    );
  }
}

void _validateOptions(BorderCutOptions options) {
  void number(String name, double value, double minimum, double maximum) {
    if (!value.isFinite || value < minimum || value > maximum) {
      throw RangeError(
        'Removal option "$name" must be a finite number from $minimum through $maximum.',
      );
    }
  }

  number('tolerance', options.tolerance, 0, 100);
  number('edgeProtection', options.edgeProtection, 0, 100);
  number('feather', options.feather.toDouble(), 0, 12);
  number('cleanup', options.cleanup.toDouble(), 0, 3);
}

void _validateGuidance(RemovalGuidance guidance, int width, int height) {
  for (var index = 0; index < guidance.samples.length; index += 1) {
    final sample = guidance.samples[index];
    if (!sample.x.isFinite ||
        !sample.y.isFinite ||
        sample.x < 0 ||
        sample.y < 0 ||
        sample.x > width - 1 ||
        sample.y > height - 1) {
      throw RangeError('Correction sample $index is outside the image bounds.');
    }
  }
  for (var strokeIndex = 0;
      strokeIndex < guidance.strokes.length;
      strokeIndex += 1) {
    final stroke = guidance.strokes[strokeIndex];
    if (!stroke.radius.isFinite ||
        stroke.radius <= 0 ||
        stroke.radius > math.max(width, height)) {
      throw RangeError(
        'Correction stroke $strokeIndex radius must be greater than 0 and no larger than the image.',
      );
    }
    if (stroke.points.isEmpty) {
      throw ArgumentError(
        'Correction stroke $strokeIndex must contain at least one point.',
      );
    }
    for (var pointIndex = 0;
        pointIndex < stroke.points.length;
        pointIndex += 1) {
      final point = stroke.points[pointIndex];
      if (!point.x.isFinite ||
          !point.y.isFinite ||
          point.x < 0 ||
          point.y < 0 ||
          point.x > width - 1 ||
          point.y > height - 1) {
        throw RangeError(
          'Correction stroke $strokeIndex point $pointIndex is outside the image bounds.',
        );
      }
    }
  }
}

double _smoothstep(double value) {
  final t = _clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

double _colorDistance(
  double r1,
  double g1,
  double b1,
  double r2,
  double g2,
  double b2,
) {
  final dr = r1 - r2;
  final dg = g1 - g2;
  final db = b1 - b2;
  return math.sqrt((dr * dr + dg * dg + db * db) / 3);
}

int _pixelOffset(int x, int y, int width) => (y * width + x) * 4;

List<double> _readColor(PixelImage image, int x, int y) {
  final offset = _pixelOffset(x, y, image.width);
  return <double>[
    image.data[offset].toDouble(),
    image.data[offset + 1].toDouble(),
    image.data[offset + 2].toDouble(),
  ];
}

List<_ColorSample> _collectSamples(PixelImage image) {
  final width = image.width;
  final height = image.height;
  final perimeter = math.max(1, width * 2 + height * 2 - 4);
  final step = math.max(1, (perimeter / 1800).ceil());
  final samples = <_ColorSample>[];

  void push(num x, num y, [int corner = -1]) {
    final px = _clampInt(x.round(), 0, width - 1);
    final py = _clampInt(y.round(), 0, height - 1);
    final color = _readColor(image, px, py);
    samples.add(
      _ColorSample(
        r: color[0],
        g: color[1],
        b: color[2],
        x: width <= 1 ? 0 : px / (width - 1),
        y: height <= 1 ? 0 : py / (height - 1),
        corner: corner,
      ),
    );
  }

  for (var x = 0; x < width; x += step) {
    push(x, 0);
    if (height > 1) push(x, height - 1);
  }
  for (var y = step; y < height - 1; y += step) {
    push(0, y);
    if (width > 1) push(width - 1, y);
  }
  push(0, 0, 0);
  push(width - 1, 0, 1);
  push(width - 1, height - 1, 2);
  push(0, height - 1, 3);
  return samples;
}

List<_Cluster> _makeClusters(List<_ColorSample> samples) {
  final clusterCount = math.min(3, math.max(1, samples.length));
  final first = samples.isEmpty
      ? _ColorSample(r: 255, g: 255, b: 255, x: 0, y: 0, corner: -1)
      : samples.first;
  final seeds = <List<double>>[
    <double>[first.r, first.g, first.b],
  ];

  while (seeds.length < clusterCount) {
    var farthest = first;
    var farthestDistance = -1.0;
    for (final sample in samples) {
      var nearest = double.infinity;
      for (final seed in seeds) {
        nearest = math.min(
          nearest,
          _colorDistance(
            sample.r,
            sample.g,
            sample.b,
            seed[0],
            seed[1],
            seed[2],
          ),
        );
      }
      if (nearest > farthestDistance) {
        farthestDistance = nearest;
        farthest = sample;
      }
    }
    seeds.add(<double>[farthest.r, farthest.g, farthest.b]);
  }

  for (var iteration = 0; iteration < 7; iteration += 1) {
    final sums = List.generate(clusterCount, (_) => <double>[0, 0, 0, 0]);
    for (final sample in samples) {
      var nearestIndex = 0;
      var nearestDistance = double.infinity;
      for (var index = 0; index < seeds.length; index += 1) {
        final seed = seeds[index];
        final distance = _colorDistance(
          sample.r,
          sample.g,
          sample.b,
          seed[0],
          seed[1],
          seed[2],
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
      sample.assignment = nearestIndex;
      final sum = sums[nearestIndex];
      sum[0] += sample.r;
      sum[1] += sample.g;
      sum[2] += sample.b;
      sum[3] += 1;
    }
    for (var index = 0; index < clusterCount; index += 1) {
      final sum = sums[index];
      final count = sum[3];
      if (count == 0) continue;
      seeds[index] = <double>[sum[0] / count, sum[1] / count, sum[2] / count];
    }
  }

  final clusters = <_Cluster>[
    for (var id = 0; id < seeds.length; id += 1)
      _Cluster(id: id, r: seeds[id][0], g: seeds[id][1], b: seeds[id][2]),
  ];
  final squaredSpread = Float64List(clusterCount);
  final cornerMasks = Uint8List(clusterCount);
  var trustedBorderSamples = 0;
  for (final sample in samples) {
    final cluster = clusters[sample.assignment];
    cluster.count += 1;
    final distance = _colorDistance(
      sample.r,
      sample.g,
      sample.b,
      cluster.r,
      cluster.g,
      cluster.b,
    );
    squaredSpread[sample.assignment] += distance * distance;
    if (sample.corner >= 0) {
      cornerMasks[sample.assignment] |= 1 << sample.corner;
    }
    final onTop = sample.y == 0;
    final onSide = sample.x == 0 || sample.x == 1;
    if (onTop || (onSide && sample.y < 0.75)) {
      cluster.trustedBorderHits += 1;
      trustedBorderSamples += 1;
    }
  }
  for (final cluster in clusters) {
    cluster.share = cluster.count / math.max(1, samples.length);
    cluster.spread = math.sqrt(
      squaredSpread[cluster.id] / math.max(1, cluster.count),
    );
    final mask = cornerMasks[cluster.id];
    cluster.cornerHits = ((mask & 1) != 0 ? 1 : 0) +
        ((mask & 2) != 0 ? 1 : 0) +
        ((mask & 4) != 0 ? 1 : 0) +
        ((mask & 8) != 0 ? 1 : 0);
    cluster.topCornerHits =
        ((mask & 1) != 0 ? 1 : 0) + ((mask & 2) != 0 ? 1 : 0);
    cluster.bottomCornerHits =
        ((mask & 4) != 0 ? 1 : 0) + ((mask & 8) != 0 ? 1 : 0);
    cluster.trustedShare =
        cluster.trustedBorderHits / math.max(1, trustedBorderSamples);
    cluster.reliability = _clamp(
      cluster.share * 0.8 +
          cluster.trustedShare * 1.5 +
          cluster.topCornerHits * 0.22 +
          cluster.bottomCornerHits * 0.04,
      0,
      1,
    );
  }
  final accepted = clusters
      .where(
        (cluster) =>
            cluster.topCornerHits > 0 ||
            (cluster.trustedShare >= 0.1 && cluster.bottomCornerHits < 2) ||
            (cluster.share >= 0.48 && cluster.bottomCornerHits < 2),
      )
      .toList()
    ..sort((a, b) {
      final reliability = b.reliability.compareTo(a.reliability);
      if (reliability != 0) return reliability;
      final count = b.count.compareTo(a.count);
      return count != 0 ? count : a.id.compareTo(b.id);
    });
  if (accepted.length > 3) accepted.removeRange(3, accepted.length);
  if (accepted.isEmpty) {
    final bySize = List<_Cluster>.from(clusters)
      ..sort((a, b) {
        final count = b.count.compareTo(a.count);
        return count != 0 ? count : a.id.compareTo(b.id);
      });
    accepted.add(bySize.first);
  }
  return accepted;
}

List<double>? _solve3x3(List<List<double>> matrix, List<double> vector) {
  final augmented = <List<double>>[
    for (var index = 0; index < matrix.length; index += 1)
      <double>[
        matrix[index][0],
        matrix[index][1],
        matrix[index][2],
        vector[index],
      ],
  ];
  for (var column = 0; column < 3; column += 1) {
    var pivot = column;
    for (var row = column + 1; row < 3; row += 1) {
      if (augmented[row][column].abs() > augmented[pivot][column].abs()) {
        pivot = row;
      }
    }
    if (augmented[pivot][column].abs() < 1e-8) return null;
    final swap = augmented[column];
    augmented[column] = augmented[pivot];
    augmented[pivot] = swap;
    final active = augmented[column];
    final divisor = active[column];
    for (var index = column; index < 4; index += 1) {
      active[index] /= divisor;
    }
    for (var other = 0; other < 3; other += 1) {
      if (other == column) continue;
      final otherRow = augmented[other];
      final factor = otherRow[column];
      for (var index = column; index < 4; index += 1) {
        otherRow[index] -= factor * active[index];
      }
    }
  }
  return <double>[augmented[0][3], augmented[1][3], augmented[2][3]];
}

List<double> _fitPlaneChannel(List<_ColorSample> samples, int channel) {
  final matrix = List.generate(3, (_) => <double>[0, 0, 0]);
  final vector = <double>[0, 0, 0];
  for (final sample in samples) {
    final features = <double>[1, sample.x, sample.y];
    final value =
        channel == 0 ? sample.r : (channel == 1 ? sample.g : sample.b);
    for (var row = 0; row < 3; row += 1) {
      vector[row] += features[row] * value;
      for (var column = 0; column < 3; column += 1) {
        matrix[row][column] += features[row] * features[column];
      }
    }
  }
  return _solve3x3(matrix, vector) ?? <double>[0, 0, 0];
}

List<double> _planeColor(_Plane plane, double x, double y) => <double>[
      _clamp(plane.r[0] + plane.r[1] * x + plane.r[2] * y, 0, 255),
      _clamp(plane.g[0] + plane.g[1] * x + plane.g[2] * y, 0, 255),
      _clamp(plane.b[0] + plane.b[1] * x + plane.b[2] * y, 0, 255),
    ];

_Plane _fitGradientPlane(List<_ColorSample> samples, List<_Cluster> clusters) {
  final acceptedIds = clusters.map((cluster) => cluster.id).toSet();
  var selected = samples
      .where((sample) => acceptedIds.contains(sample.assignment))
      .toList();
  if (selected.length < 6) selected = List<_ColorSample>.from(samples);
  var plane = _Plane(
    r: _fitPlaneChannel(selected, 0),
    g: _fitPlaneChannel(selected, 1),
    b: _fitPlaneChannel(selected, 2),
  );
  final residuals = <double>[
    for (final sample in selected)
      (() {
        final predicted = _planeColor(plane, sample.x, sample.y);
        return _colorDistance(
          sample.r,
          sample.g,
          sample.b,
          predicted[0],
          predicted[1],
          predicted[2],
        );
      })(),
  ];
  final sorted = List<double>.from(residuals)..sort();
  final median = sorted.isEmpty ? 0.0 : sorted[sorted.length ~/ 2];
  final cutoff = math.max(12.0, median * 2.8);
  final inliers = <_ColorSample>[
    for (var index = 0; index < selected.length; index += 1)
      if (residuals[index] <= cutoff) selected[index],
  ];
  if (inliers.length >= 6 && inliers.length < selected.length) {
    selected = inliers;
    plane = _Plane(
      r: _fitPlaneChannel(selected, 0),
      g: _fitPlaneChannel(selected, 1),
      b: _fitPlaneChannel(selected, 2),
    );
  }
  var squaredError = 0.0;
  for (final sample in selected) {
    final predicted = _planeColor(plane, sample.x, sample.y);
    final residual = _colorDistance(
      sample.r,
      sample.g,
      sample.b,
      predicted[0],
      predicted[1],
      predicted[2],
    );
    squaredError += residual * residual;
  }
  plane.rmse = math.sqrt(squaredError / math.max(1, selected.length));
  final corners = <List<double>>[
    _planeColor(plane, 0, 0),
    _planeColor(plane, 1, 0),
    _planeColor(plane, 1, 1),
    _planeColor(plane, 0, 1),
  ];
  var range = 0.0;
  for (var first = 0; first < corners.length; first += 1) {
    for (var second = first + 1; second < corners.length; second += 1) {
      final a = corners[first];
      final b = corners[second];
      range = math.max(
        range,
        _colorDistance(a[0], a[1], a[2], b[0], b[1], b[2]),
      );
    }
  }
  final averageSpread =
      clusters.fold<double>(0, (sum, cluster) => sum + cluster.spread) /
          math.max(1, clusters.length);
  plane.enabled =
      range > 9 && plane.rmse < math.max(18, averageSpread * 1.4 + 7);
  return plane;
}

_BackgroundModel _buildBackgroundModel(PixelImage image) {
  final samples = _collectSamples(image);
  final clusters = _makeClusters(samples);
  final plane = _fitGradientPlane(samples, clusters);
  final clusterSamples = clusters.fold<int>(
    0,
    (sum, cluster) => sum + cluster.count,
  );
  final clusterNoise = clusters.fold<double>(
        0,
        (sum, cluster) => sum + cluster.spread * cluster.count,
      ) /
      math.max(1, clusterSamples);
  return _BackgroundModel(
    clusters: clusters,
    plane: plane,
    noise: _clamp(plane.enabled ? plane.rmse : clusterNoise, 0, 32),
  );
}

Uint8List _applyBackgroundMarkerFloods(
  PixelImage image,
  Uint8List background,
  Float32List scores,
  Float32List edges,
  List<SamplePoint> samples,
  double threshold,
  double tolerance,
  double edgeProtection,
) {
  final width = image.width;
  final height = image.height;
  final total = width * height;
  final colorLimit = 20 + _clamp(tolerance, 0, 100) * 0.38;
  final stepLimit = colorLimit * 0.82;
  final edgeGate = 13 + (100 - _clamp(edgeProtection, 0, 100)) * 0.22;
  for (final sample in samples) {
    if (sample.kind != SampleKind.background) continue;
    final startX = _clampInt(sample.x.round(), 0, width - 1);
    final startY = _clampInt(sample.y.round(), 0, height - 1);
    final startIndex = startY * width + startX;
    final startOffset = startIndex * 4;
    final seedR = image.data[startOffset].toDouble();
    final seedG = image.data[startOffset + 1].toDouble();
    final seedB = image.data[startOffset + 2].toDouble();
    final visited = Uint8List(total);
    final queue = Uint32List(total);
    var head = 0;
    var tail = 1;
    visited[startIndex] = 1;
    queue[0] = startIndex;
    while (head < tail) {
      final index = queue[head++];
      background[index] = 1;
      scores[index] = math.min(scores[index], threshold * 0.35);
      final x = index % width;
      final y = index ~/ width;
      final offset = index * 4;
      final currentR = image.data[offset].toDouble();
      final currentG = image.data[offset + 1].toDouble();
      final currentB = image.data[offset + 2].toDouble();
      void visit(int nextIndex) {
        if (visited[nextIndex] != 0) return;
        visited[nextIndex] = 1;
        final nextOffset = nextIndex * 4;
        final nextR = image.data[nextOffset].toDouble();
        final nextG = image.data[nextOffset + 1].toDouble();
        final nextB = image.data[nextOffset + 2].toDouble();
        final seedDistance = _colorDistance(
          nextR,
          nextG,
          nextB,
          seedR,
          seedG,
          seedB,
        );
        final stepDistance = _colorDistance(
          nextR,
          nextG,
          nextB,
          currentR,
          currentG,
          currentB,
        );
        if (seedDistance > colorLimit || stepDistance > stepLimit) return;
        if (math.max(edges[index], edges[nextIndex]) > edgeGate &&
            seedDistance > colorLimit * 0.55) {
          return;
        }
        queue[tail++] = nextIndex;
      }

      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
  }
  return background;
}

_StrokeBounds _rasterizeStrokeIntoGuidance(
  BrushStroke stroke,
  Uint8List guidance,
  Uint32List strokeMarks,
  int operationId,
  int width,
  int height,
) {
  final value = stroke.kind == SampleKind.background ? 1 : 2;
  final segments = <(StrokePoint, StrokePoint)>[];
  if (stroke.points.length == 1) {
    segments.add((stroke.points.first, stroke.points.first));
  }
  for (var index = 1; index < stroke.points.length; index += 1) {
    segments.add((stroke.points[index - 1], stroke.points[index]));
  }
  var boundsMinX = width - 1;
  var boundsMaxX = 0;
  var boundsMinY = height - 1;
  var boundsMaxY = 0;
  for (final segment in segments) {
    final start = segment.$1;
    final end = segment.$2;
    final minX = math.max(
      0,
      (math.min(start.x, end.x) - stroke.radius).floor(),
    );
    final maxX = math.min(
      width - 1,
      (math.max(start.x, end.x) + stroke.radius).ceil(),
    );
    final minY = math.max(
      0,
      (math.min(start.y, end.y) - stroke.radius).floor(),
    );
    final maxY = math.min(
      height - 1,
      (math.max(start.y, end.y) + stroke.radius).ceil(),
    );
    boundsMinX = math.min(boundsMinX, minX);
    boundsMaxX = math.max(boundsMaxX, maxX);
    boundsMinY = math.min(boundsMinY, minY);
    boundsMaxY = math.max(boundsMaxY, maxY);
    final segmentX = end.x - start.x;
    final segmentY = end.y - start.y;
    final lengthSquared = segmentX * segmentX + segmentY * segmentY;
    final radiusSquared = stroke.radius * stroke.radius;
    for (var y = minY; y <= maxY; y += 1) {
      for (var x = minX; x <= maxX; x += 1) {
        final projection = lengthSquared == 0
            ? 0.0
            : _clamp(
                ((x - start.x) * segmentX + (y - start.y) * segmentY) /
                    lengthSquared,
                0,
                1,
              );
        final distanceX = x - (start.x + segmentX * projection);
        final distanceY = y - (start.y + segmentY * projection);
        if (distanceX * distanceX + distanceY * distanceY <= radiusSquared) {
          final pixelIndex = y * width + x;
          guidance[pixelIndex] = value;
          strokeMarks[pixelIndex] = operationId;
        }
      }
    }
  }
  return _StrokeBounds(
    minX: boundsMinX,
    maxX: boundsMaxX,
    minY: boundsMinY,
    maxY: boundsMaxY,
  );
}

Uint8List _applyStrokeRegionGuidance(
  PixelImage image,
  Uint8List background,
  Float32List scores,
  Float32List edges,
  Uint8List guidance,
  SampleKind kind,
  double threshold,
  double tolerance,
  double edgeProtection,
  _StrokeBounds seedBounds,
  _StrokeRegionWorkspace workspace,
  int operationId,
) {
  final width = image.width;
  final height = image.height;
  final blocker = kind == SampleKind.background ? 2 : 1;
  final colorLimit = kind == SampleKind.background
      ? 20 + _clamp(tolerance, 0, 100) * 0.38
      : 14 + _clamp(tolerance, 0, 100) * 0.24;
  final stepLimit = colorLimit * (kind == SampleKind.background ? 0.82 : 0.72);
  final edgeGate = kind == SampleKind.background
      ? 13 + (100 - _clamp(edgeProtection, 0, 100)) * 0.22
      : 5 + (100 - _clamp(edgeProtection, 0, 100)) * 0.1;
  final maximumReach = math.max(24, (math.min(width, height) * 0.18).round());
  final strokeMarks = workspace.strokeMarks;
  final processedSeedMarks = workspace.processedSeedMarks;
  final floodMarks = workspace.floodMarks;
  final floodDistances = workspace.floodDistances;
  final queue = workspace.queue;

  double distanceSquaredToPalette(int index, List<int> palette) {
    final offset = index * 4;
    final r = image.data[offset];
    final g = image.data[offset + 1];
    final b = image.data[offset + 2];
    var nearest = double.infinity;
    for (final paletteIndex in palette) {
      final paletteOffset = paletteIndex * 4;
      final dr = r - image.data[paletteOffset];
      final dg = g - image.data[paletteOffset + 1];
      final db = b - image.data[paletteOffset + 2];
      nearest = math.min(nearest, (dr * dr + dg * dg + db * db) / 3);
    }
    return nearest;
  }

  for (var seedY = seedBounds.minY; seedY <= seedBounds.maxY; seedY += 1) {
    for (var seedX = seedBounds.minX; seedX <= seedBounds.maxX; seedX += 1) {
      final seedIndex = seedY * width + seedX;
      if (strokeMarks[seedIndex] != operationId ||
          processedSeedMarks[seedIndex] == operationId) {
        continue;
      }
      workspace.componentId = (workspace.componentId + 1) & 0xffffffff;
      if (workspace.componentId == 0) {
        floodMarks.fillRange(0, floodMarks.length, 0);
        workspace.componentId = 1;
      }
      final componentId = workspace.componentId;
      var head = 0;
      var tail = 1;
      queue[0] = seedIndex;
      processedSeedMarks[seedIndex] = operationId;
      void enqueueConnectedSeed(int index) {
        if (strokeMarks[index] != operationId ||
            processedSeedMarks[index] == operationId) {
          return;
        }
        processedSeedMarks[index] = operationId;
        queue[tail++] = index;
      }

      while (head < tail) {
        final index = queue[head++];
        final x = index % width;
        final y = index ~/ width;
        if (x > 0) enqueueConnectedSeed(index - 1);
        if (x + 1 < width) enqueueConnectedSeed(index + 1);
        if (y > 0) enqueueConnectedSeed(index - width);
        if (y + 1 < height) enqueueConnectedSeed(index + width);
      }
      final seedCount = tail;
      final palette = <int>[];
      final paletteCandidates = math.min(24, seedCount);
      for (var index = 0;
          index < paletteCandidates && palette.length < 12;
          index += 1) {
        final position = paletteCandidates == 1
            ? 0
            : (index * (seedCount - 1) / (paletteCandidates - 1)).round();
        final candidate = queue[position];
        final candidateOffset = candidate * 4;
        final duplicate = palette.any((paletteIndex) {
          final paletteOffset = paletteIndex * 4;
          return image.data[candidateOffset] == image.data[paletteOffset] &&
              image.data[candidateOffset + 1] ==
                  image.data[paletteOffset + 1] &&
              image.data[candidateOffset + 2] == image.data[paletteOffset + 2];
        });
        if (!duplicate) palette.add(candidate);
      }
      for (var index = 0; index < seedCount; index += 1) {
        final guidedIndex = queue[index];
        floodMarks[guidedIndex] = componentId;
        floodDistances[guidedIndex] = 0;
        background[guidedIndex] = kind == SampleKind.background ? 1 : 0;
        scores[guidedIndex] = kind == SampleKind.background
            ? math.min(scores[guidedIndex], threshold * 0.35)
            : math.max(scores[guidedIndex], threshold * 1.5);
      }
      head = 0;
      while (head < tail) {
        final index = queue[head++];
        final x = index % width;
        final y = index ~/ width;
        final offset = index * 4;
        final currentR = image.data[offset].toDouble();
        final currentG = image.data[offset + 1].toDouble();
        final currentB = image.data[offset + 2].toDouble();
        void visit(int nextIndex) {
          if (floodMarks[nextIndex] == componentId ||
              guidance[nextIndex] == blocker) {
            return;
          }
          final nextDistance = floodDistances[index] + 1;
          if (nextDistance > maximumReach) return;
          final nextOffset = nextIndex * 4;
          final paletteDistanceSquared = distanceSquaredToPalette(
            nextIndex,
            palette,
          );
          if (paletteDistanceSquared > colorLimit * colorLimit) return;
          final stepDistance = _colorDistance(
            image.data[nextOffset].toDouble(),
            image.data[nextOffset + 1].toDouble(),
            image.data[nextOffset + 2].toDouble(),
            currentR,
            currentG,
            currentB,
          );
          if (stepDistance > stepLimit) return;
          final crossingEdge = math.max(edges[index], edges[nextIndex]);
          if (crossingEdge > edgeGate &&
              (kind == SampleKind.foreground ||
                  paletteDistanceSquared >
                      colorLimit * colorLimit * 0.55 * 0.55)) {
            return;
          }
          floodMarks[nextIndex] = componentId;
          floodDistances[nextIndex] = nextDistance;
          if (strokeMarks[nextIndex] == operationId) {
            processedSeedMarks[nextIndex] = operationId;
          }
          background[nextIndex] = kind == SampleKind.background ? 1 : 0;
          scores[nextIndex] = kind == SampleKind.background
              ? math.min(scores[nextIndex], threshold * 0.35)
              : math.max(scores[nextIndex], threshold * 1.5);
          queue[tail++] = nextIndex;
        }

        if (x > 0) visit(index - 1);
        if (x + 1 < width) visit(index + 1);
        if (y > 0) visit(index - width);
        if (y + 1 < height) visit(index + width);
      }
    }
  }
  return background;
}

double _modelDistance(
  _BackgroundModel model,
  double r,
  double g,
  double b,
  double nx,
  double ny,
) {
  var nearest = double.infinity;
  for (final cluster in model.clusters) {
    final distance = _colorDistance(r, g, b, cluster.r, cluster.g, cluster.b);
    final adjusted =
        math.max(0, distance - math.min(20, cluster.spread * 0.4)) +
            (1 - cluster.reliability) * 4;
    nearest = math.min(nearest, adjusted);
  }
  if (model.plane.enabled) {
    final predicted = _planeColor(model.plane, nx, ny);
    final distance = _colorDistance(
      r,
      g,
      b,
      predicted[0],
      predicted[1],
      predicted[2],
    );
    nearest = math.min(
      nearest,
      math.max(0, distance - model.plane.rmse * 0.35),
    );
  }
  return nearest;
}

List<double> _nearestBackgroundColor(
  _BackgroundModel model,
  double r,
  double g,
  double b,
  double nx,
  double ny,
) {
  if (model.plane.enabled) return _planeColor(model.plane, nx, ny);
  var selected = model.clusters.firstOrNull;
  var nearest = double.infinity;
  for (final cluster in model.clusters) {
    final distance = _colorDistance(r, g, b, cluster.r, cluster.g, cluster.b);
    if (distance < nearest) {
      nearest = distance;
      selected = cluster;
    }
  }
  return selected == null
      ? <double>[255, 255, 255]
      : <double>[selected.r, selected.g, selected.b];
}

double _backgroundReferenceDistance(
  _BackgroundModel model,
  double r,
  double g,
  double b,
  double nx,
  double ny,
) {
  if (model.plane.enabled) {
    final predicted = _planeColor(model.plane, nx, ny);
    return _colorDistance(r, g, b, predicted[0], predicted[1], predicted[2]);
  }
  var nearest = double.infinity;
  for (final cluster in model.clusters) {
    nearest = math.min(
      nearest,
      _colorDistance(r, g, b, cluster.r, cluster.g, cluster.b),
    );
  }
  return nearest;
}

double _gradientAt(PixelImage image, int x, int y) {
  final radius = math.min(2, math.max(image.width - 1, image.height - 1));
  final left = _readColor(image, math.max(0, x - radius), y);
  final right = _readColor(image, math.min(image.width - 1, x + radius), y);
  final top = _readColor(image, x, math.max(0, y - radius));
  final bottom = _readColor(image, x, math.min(image.height - 1, y + radius));
  final divisor = math.max(1, radius);
  final horizontal =
      _colorDistance(left[0], left[1], left[2], right[0], right[1], right[2]) /
          divisor;
  final vertical =
      _colorDistance(top[0], top[1], top[2], bottom[0], bottom[1], bottom[2]) /
          divisor;
  return math.sqrt(horizontal * horizontal + vertical * vertical);
}

double _sampleInfluence(
  List<SamplePoint> samples,
  SampleKind kind,
  int x,
  int y,
  double radius,
) {
  var influence = 0.0;
  final radiusSquared = radius * radius;
  for (final sample in samples) {
    if (sample.kind != kind) continue;
    final dx = x - sample.x;
    final dy = y - sample.y;
    final distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= radiusSquared) continue;
    final normalized = 1 - math.sqrt(distanceSquared) / radius;
    influence = math.max(influence, normalized * normalized);
  }
  return influence;
}

Uint8List _majorityCleanup(
  Uint8List mask,
  Float32List scores,
  int width,
  int height,
  double threshold,
  int iterations,
) {
  var current = mask;
  for (var iteration = 0; iteration < iterations; iteration += 1) {
    final next = Uint8List.fromList(current);
    for (var y = 1; y < height - 1; y += 1) {
      for (var x = 1; x < width - 1; x += 1) {
        final index = y * width + x;
        var backgroundNeighbors = 0;
        for (var offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (var offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (current[(y + offsetY) * width + x + offsetX] != 0) {
              backgroundNeighbors += 1;
            }
          }
        }
        if (current[index] != 0 && backgroundNeighbors <= 2) next[index] = 0;
        if (current[index] == 0 &&
            backgroundNeighbors >= 7 &&
            scores[index] < threshold) {
          next[index] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

Uint8ClampedList _blurAlpha(
  Uint8ClampedList source,
  int width,
  int height,
  int radius,
) {
  if (radius <= 0) return source;
  final horizontal = Uint8ClampedList(source.length);
  final output = Uint8ClampedList(source.length);
  final windowSize = radius * 2 + 1;
  for (var y = 0; y < height; y += 1) {
    var sum = 0;
    for (var offset = -radius; offset <= radius; offset += 1) {
      sum += source[y * width + _clampInt(offset, 0, width - 1)];
    }
    for (var x = 0; x < width; x += 1) {
      horizontal[y * width + x] = (sum / windowSize).round();
      final outgoing = _clampInt(x - radius, 0, width - 1);
      final incoming = _clampInt(x + radius + 1, 0, width - 1);
      sum += source[y * width + incoming] - source[y * width + outgoing];
    }
  }
  for (var x = 0; x < width; x += 1) {
    var sum = 0;
    for (var offset = -radius; offset <= radius; offset += 1) {
      sum += horizontal[_clampInt(offset, 0, height - 1) * width + x];
    }
    for (var y = 0; y < height; y += 1) {
      output[y * width + x] = (sum / windowSize).round();
      final outgoing = _clampInt(y - radius, 0, height - 1);
      final incoming = _clampInt(y + radius + 1, 0, height - 1);
      sum +=
          horizontal[incoming * width + x] - horizontal[outgoing * width + x];
    }
  }
  return output;
}

Float32List _blurFloat(Float32List source, int width, int height, int radius) {
  if (radius <= 0) return source;
  final horizontal = Float32List(source.length);
  final output = Float32List(source.length);
  final windowSize = radius * 2 + 1;
  for (var y = 0; y < height; y += 1) {
    var sum = 0.0;
    for (var offset = -radius; offset <= radius; offset += 1) {
      sum += source[y * width + _clampInt(offset, 0, width - 1)];
    }
    for (var x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / windowSize;
      final outgoing = _clampInt(x - radius, 0, width - 1);
      final incoming = _clampInt(x + radius + 1, 0, width - 1);
      sum += source[y * width + incoming] - source[y * width + outgoing];
    }
  }
  for (var x = 0; x < width; x += 1) {
    var sum = 0.0;
    for (var offset = -radius; offset <= radius; offset += 1) {
      sum += horizontal[_clampInt(offset, 0, height - 1) * width + x];
    }
    for (var y = 0; y < height; y += 1) {
      output[y * width + x] = sum / windowSize;
      final outgoing = _clampInt(y - radius, 0, height - 1);
      final incoming = _clampInt(y + radius + 1, 0, height - 1);
      sum +=
          horizontal[incoming * width + x] - horizontal[outgoing * width + x];
    }
  }
  return output;
}

_SubjectRecoveryResult _recoverPaleForeground(
  Uint8List background,
  Float32List evidence,
  int width,
  int height,
  double threshold,
  double modelNoise,
) {
  final total = width * height;
  final noiseLimit = math.max(9, threshold * 0.24);
  if (modelNoise > noiseLimit) {
    return _SubjectRecoveryResult(
      background: background,
      applied: false,
      recoveredPixels: 0,
    );
  }
  final original = Uint8List.fromList(background);
  final radius = math.max(1, (math.min(width, height) / 85).round());
  final smoothed = _blurFloat(evidence, width, height, radius);
  final certainBackground = _clamp(2.5 + modelNoise * 1.25, 2.5, 8);
  final supportMinimum = _clamp(6 + modelNoise * 1.4, 6, 16);
  final candidate = Uint8List(total);
  final recovered = Uint8List(total);
  final queue = Uint32List(total);
  var head = 0;
  var tail = 0;
  for (var index = 0; index < total; index += 1) {
    final knownSubject = background[index] == 0;
    if (knownSubject ||
        (evidence[index] >= certainBackground &&
            smoothed[index] >= supportMinimum)) {
      candidate[index] = 1;
    }
    if (knownSubject) {
      recovered[index] = 1;
      queue[tail++] = index;
    }
  }
  void visit(int index) {
    if (candidate[index] == 0 || recovered[index] != 0) return;
    recovered[index] = 1;
    queue[tail++] = index;
  }

  while (head < tail) {
    final index = queue[head++];
    final x = index % width;
    final y = index ~/ width;
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  for (var index = 0; index < total; index += 1) {
    if (recovered[index] != 0) background[index] = 0;
  }

  final exterior = Uint8List(total);
  head = 0;
  tail = 0;
  void restore(int index) {
    if (exterior[index] != 0 || evidence[index] >= certainBackground) return;
    exterior[index] = 1;
    background[index] = 1;
    queue[tail++] = index;
  }

  for (var x = 0; x < width; x += 1) {
    restore(x);
    if (height > 1) restore((height - 1) * width + x);
  }
  for (var y = 1; y < height - 1; y += 1) {
    restore(y * width);
    if (width > 1) restore(y * width + width - 1);
  }
  while (head < tail) {
    final index = queue[head++];
    final x = index % width;
    final y = index ~/ width;
    if (x > 0) restore(index - 1);
    if (x + 1 < width) restore(index + 1);
    if (y > 0) restore(index - width);
    if (y + 1 < height) restore(index + width);
  }

  final maximumWidth = math.max(2, (math.min(width, height) / 24).ceil());
  final startY = (height * 0.58).round();
  final minimumRunEvidence = math.max(1.4, certainBackground * 0.55);
  final minimumRunSupport = math.max(3, certainBackground * 1.2);
  final maximumRunSupport = _clamp(8.5 + modelNoise * 1.8, 8.5, 24);
  for (var y = startY; y < height; y += 1) {
    var x = 1;
    while (x < width - 1) {
      if (background[y * width + x] == 0) {
        x += 1;
        continue;
      }
      final start = x;
      while (x < width - 1 && background[y * width + x] != 0) {
        x += 1;
      }
      final runWidth = x - start;
      final boundedBySubject = background[y * width + start - 1] == 0 &&
          x < width &&
          background[y * width + x] == 0;
      if (!boundedBySubject || runWidth > maximumWidth) continue;
      var evidenceSum = 0.0;
      var supportSum = 0.0;
      for (var sampleX = start; sampleX < x; sampleX += 1) {
        final index = y * width + sampleX;
        evidenceSum += evidence[index];
        supportSum += smoothed[index];
      }
      final meanEvidence = evidenceSum / runWidth;
      final meanSupport = supportSum / runWidth;
      if (meanEvidence >= minimumRunEvidence &&
          meanSupport >= minimumRunSupport &&
          meanSupport <= maximumRunSupport) {
        for (var fillX = start; fillX < x; fillX += 1) {
          background[y * width + fillX] = 0;
        }
      }
    }
  }

  final connectedExterior = Uint8List(total);
  head = 0;
  tail = 0;
  void markExterior(int index) {
    if (background[index] == 0 || connectedExterior[index] != 0) return;
    connectedExterior[index] = 1;
    queue[tail++] = index;
  }

  for (var x = 0; x < width; x += 1) {
    markExterior(x);
    if (height > 1) markExterior((height - 1) * width + x);
  }
  for (var y = 1; y < height - 1; y += 1) {
    markExterior(y * width);
    if (width > 1) markExterior(y * width + width - 1);
  }
  while (head < tail) {
    final index = queue[head++];
    final x = index % width;
    final y = index ~/ width;
    if (x > 0) markExterior(index - 1);
    if (x + 1 < width) markExterior(index + 1);
    if (y > 0) markExterior(index - width);
    if (y + 1 < height) markExterior(index + width);
  }
  for (var index = 0; index < total; index += 1) {
    if (background[index] != 0 && connectedExterior[index] == 0) {
      background[index] = 0;
    }
  }
  var recoveredPixels = 0;
  for (var index = 0; index < total; index += 1) {
    if (original[index] != 0 && background[index] == 0) recoveredPixels += 1;
  }
  if (recoveredPixels > total * 0.32) {
    return _SubjectRecoveryResult(
      background: original,
      applied: false,
      recoveredPixels: 0,
    );
  }
  return _SubjectRecoveryResult(
    background: background,
    applied: recoveredPixels > 0,
    recoveredPixels: recoveredPixels,
  );
}

Uint8List _markConnectedBackground(
  PixelImage image,
  Float32List scores,
  Float32List edges,
  double threshold,
  List<SamplePoint> samples,
  double edgeProtection,
) {
  final width = image.width;
  final height = image.height;
  final total = width * height;
  final background = Uint8List(total);
  final queue = Uint32List(total);
  var head = 0;
  var tail = 0;
  final acceptance = threshold * 1.26;
  final localLimit = threshold * 0.62;
  final edgeGate = 7 + (100 - _clamp(edgeProtection, 0, 100)) * 0.14;
  void enqueueSeed(
    int x,
    int y, {
    bool force = false,
    double limitFactor = 1.08,
  }) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    final index = y * width + x;
    if (background[index] != 0) return;
    if (!force && scores[index] > threshold * limitFactor) return;
    background[index] = 1;
    queue[tail++] = index;
  }

  final spanX = math.max(1, math.min(14, (width * 0.03).round()));
  final spanY = math.max(1, math.min(14, (height * 0.03).round()));
  for (var x = 0; x <= spanX; x += 1) {
    enqueueSeed(x, 0);
    enqueueSeed(width - 1 - x, 0);
    enqueueSeed(x, height - 1);
    enqueueSeed(width - 1 - x, height - 1);
  }
  for (var y = 1; y <= spanY; y += 1) {
    enqueueSeed(0, y);
    enqueueSeed(width - 1, y);
    enqueueSeed(0, height - 1 - y);
    enqueueSeed(width - 1, height - 1 - y);
  }
  for (var x = 0; x < width; x += 1) {
    enqueueSeed(x, 0, limitFactor: 0.72);
  }
  for (var y = 1; y < height; y += 1) {
    enqueueSeed(0, y, limitFactor: 0.72);
    enqueueSeed(width - 1, y, limitFactor: 0.72);
  }
  final safeBottomWidth = (width * 0.18).floor();
  for (var x = 0; x < safeBottomWidth; x += 1) {
    enqueueSeed(x, height - 1, limitFactor: 0.72);
    enqueueSeed(width - 1 - x, height - 1, limitFactor: 0.72);
  }
  for (final sample in samples) {
    if (sample.kind == SampleKind.background) {
      enqueueSeed(sample.x.round(), sample.y.round(), force: true);
    }
  }
  if (tail == 0) {
    var bestIndex = 0;
    var bestScore = double.infinity;
    void consider(int x, int y) {
      final index = y * width + x;
      final score = scores[index];
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    for (var x = 0; x < width; x += 1) {
      consider(x, 0);
      consider(x, height - 1);
    }
    for (var y = 1; y < height - 1; y += 1) {
      consider(0, y);
      consider(width - 1, y);
    }
    enqueueSeed(bestIndex % width, bestIndex ~/ width, force: true);
  }
  while (head < tail) {
    final index = queue[head++];
    final x = index % width;
    final y = index ~/ width;
    final currentOffset = index * 4;
    final currentR = image.data[currentOffset].toDouble();
    final currentG = image.data[currentOffset + 1].toDouble();
    final currentB = image.data[currentOffset + 2].toDouble();
    void visit(int nextIndex) {
      if (background[nextIndex] != 0) return;
      final score = scores[nextIndex];
      if (score > acceptance) return;
      final nextOffset = nextIndex * 4;
      final stepDistance = _colorDistance(
        currentR,
        currentG,
        currentB,
        image.data[nextOffset].toDouble(),
        image.data[nextOffset + 1].toDouble(),
        image.data[nextOffset + 2].toDouble(),
      );
      final crossingEdge = math.max(edges[index], edges[nextIndex]);
      if (crossingEdge > edgeGate && score > threshold * 0.18) return;
      if (stepDistance > localLimit && score > threshold * 0.3) return;
      background[nextIndex] = 1;
      queue[tail++] = nextIndex;
    }

    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  return background;
}

Uint8List _recoverLargeBackgroundIslands(
  Uint8List background,
  Float32List scores,
  Float32List colorCosts,
  int width,
  int height,
  double threshold,
) {
  final total = width * height;
  final visited = Uint8List(total);
  final queue = Uint32List(total);
  final strictColorLimit = math.max(4, math.min(8, threshold * 0.14));
  final scoreLimit = threshold * 0.58;
  final minimumArea = math.max(64, (total * 0.05).round());
  bool isCandidate(int index) =>
      background[index] == 0 &&
      visited[index] == 0 &&
      colorCosts[index] <= strictColorLimit &&
      scores[index] <= scoreLimit;

  for (var start = 0; start < total; start += 1) {
    if (!isCandidate(start)) continue;
    var head = 0;
    var tail = 0;
    var touchesUnsafeBottom = false;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      final index = queue[head++];
      final x = index % width;
      final y = index ~/ width;
      if (y == height - 1 && x > width * 0.18 && x < width * 0.82) {
        touchesUnsafeBottom = true;
      }
      void visit(int nextIndex) {
        if (!isCandidate(nextIndex)) return;
        visited[nextIndex] = 1;
        queue[tail++] = nextIndex;
      }

      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
    if (tail < minimumArea || touchesUnsafeBottom) continue;
    for (var position = 0; position < tail; position += 1) {
      final index = queue[position];
      background[index] = 1;
      scores[index] = math.min(scores[index], threshold * 0.4);
    }
  }
  return background;
}

/// Removes a visually separable background from decoded RGBA [image] pixels.
///
/// The operation is synchronous and deterministic. Flutter applications should
/// call it outside the UI isolate for full-size images. [guidance] is applied
/// in array order after baseline segmentation; background strokes only remove
/// nearby pixels, while foreground strokes only restore nearby pixels.
RemovalResult removeBackground(
  PixelImage image, {
  BorderCutOptions options = defaultOptions,
  RemovalGuidance guidance = const RemovalGuidance(),
}) {
  final stopwatch = Stopwatch()..start();
  _validateImage(image);
  _validateOptions(options);
  _validateGuidance(guidance, image.width, image.height);
  final width = image.width;
  final height = image.height;
  final pixelCount = width * height;
  final samples = guidance.samples;
  final strokes = guidance.strokes;
  final model = _buildBackgroundModel(image);
  final threshold = 12 + _clamp(options.tolerance, 0, 100) * 0.72;
  final scores = Float32List(pixelCount);
  final edges = Float32List(pixelCount);
  final colorCosts = Float32List(pixelCount);
  final backgroundEvidence = Float32List(pixelCount);
  final markerRadius = math.max(12.0, math.min(width, height) * 0.09);
  for (var y = 0; y < height; y += 1) {
    final ny = height <= 1 ? 0.0 : y / (height - 1);
    for (var x = 0; x < width; x += 1) {
      final nx = width <= 1 ? 0.0 : x / (width - 1);
      final index = y * width + x;
      final offset = index * 4;
      final alpha = image.data[offset + 3];
      if (alpha < 8) {
        scores[index] = 0;
        continue;
      }
      final r = image.data[offset].toDouble();
      final g = image.data[offset + 1].toDouble();
      final b = image.data[offset + 2].toDouble();
      var score = _modelDistance(model, r, g, b, nx, ny);
      colorCosts[index] = score;
      backgroundEvidence[index] = _backgroundReferenceDistance(
        model,
        r,
        g,
        b,
        nx,
        ny,
      );
      final edgeStrength = _gradientAt(image, x, y);
      edges[index] = edgeStrength;
      score +=
          edgeStrength * (_clamp(options.edgeProtection, 0, 100) / 100) * 0.78;
      if (options.protectCenter) {
        final dx = (nx - 0.5) / 0.5;
        final dy = (ny - 0.5) / 0.5;
        final centerWeight = math.exp(-(dx * dx + dy * dy) * 3.2);
        score += threshold * 0.52 * centerWeight;
      }
      score += threshold *
          2.4 *
          _sampleInfluence(samples, SampleKind.foreground, x, y, markerRadius);
      score -= threshold *
          0.65 *
          _sampleInfluence(samples, SampleKind.background, x, y, markerRadius);
      scores[index] = math.max(0, score);
    }
  }
  var background = _markConnectedBackground(
    image,
    scores,
    edges,
    threshold,
    samples,
    options.edgeProtection,
  );
  var subjectRecoveryApplied = false;
  var recoveredPixels = 0;
  if (options.recoverPaleSubject) {
    final recovery = _recoverPaleForeground(
      background,
      backgroundEvidence,
      width,
      height,
      threshold,
      model.noise,
    );
    background = recovery.background;
    subjectRecoveryApplied = recovery.applied;
    recoveredPixels = recovery.recoveredPixels;
  }
  background = _recoverLargeBackgroundIslands(
    background,
    scores,
    colorCosts,
    width,
    height,
    threshold,
  );
  background = _applyBackgroundMarkerFloods(
    image,
    background,
    scores,
    edges,
    samples,
    threshold,
    options.tolerance,
    options.edgeProtection,
  );
  if (options.interiorBackground) {
    for (var index = 0; index < background.length; index += 1) {
      if (scores[index] < threshold * 0.48) background[index] = 1;
    }
  }
  background = _majorityCleanup(
    background,
    scores,
    width,
    height,
    threshold,
    options.cleanup,
  );
  if (strokes.isNotEmpty) {
    final strokeGuidance = Uint8List(pixelCount);
    final workspace = _StrokeRegionWorkspace(pixelCount);
    for (final stroke in strokes) {
      workspace.operationId = (workspace.operationId + 1) & 0xffffffff;
      if (workspace.operationId == 0) {
        workspace.strokeMarks.fillRange(0, workspace.strokeMarks.length, 0);
        workspace.processedSeedMarks.fillRange(
          0,
          workspace.processedSeedMarks.length,
          0,
        );
        workspace.operationId = 1;
      }
      final seedBounds = _rasterizeStrokeIntoGuidance(
        stroke,
        strokeGuidance,
        workspace.strokeMarks,
        workspace.operationId,
        width,
        height,
      );
      background = _applyStrokeRegionGuidance(
        image,
        background,
        scores,
        edges,
        strokeGuidance,
        stroke.kind,
        threshold,
        options.tolerance,
        options.edgeProtection,
        seedBounds,
        workspace,
        workspace.operationId,
      );
    }
  }
  for (final sample in samples) {
    if (sample.kind != SampleKind.foreground) continue;
    final radius = markerRadius * 0.55;
    final minX = math.max(0, (sample.x - radius).floor());
    final maxX = math.min(width - 1, (sample.x + radius).ceil());
    final minY = math.max(0, (sample.y - radius).floor());
    final maxY = math.min(height - 1, (sample.y + radius).ceil());
    for (var y = minY; y <= maxY; y += 1) {
      for (var x = minX; x <= maxX; x += 1) {
        final dx = x - sample.x;
        final dy = y - sample.y;
        if (dx * dx + dy * dy <= radius * radius) background[y * width + x] = 0;
      }
    }
  }
  final rawAlpha = Uint8ClampedList(pixelCount);
  for (var index = 0; index < rawAlpha.length; index += 1) {
    if (background[index] == 0) {
      rawAlpha[index] = 255;
      continue;
    }
    final transition = (scores[index] - threshold * 0.68) / (threshold * 0.64);
    rawAlpha[index] = (_smoothstep(transition) * 255).round();
  }
  final alpha = _blurAlpha(rawAlpha, width, height, options.feather);
  final output = Uint8ClampedList(pixelCount * 4);
  final mask = Uint8ClampedList(pixelCount * 4);
  var removed = 0;
  for (var y = 0; y < height; y += 1) {
    final ny = height <= 1 ? 0.0 : y / (height - 1);
    for (var x = 0; x < width; x += 1) {
      final nx = width <= 1 ? 0.0 : x / (width - 1);
      final index = y * width + x;
      final offset = index * 4;
      final sourceAlpha = image.data[offset + 3] / 255;
      final finalAlpha = (alpha[index] * sourceAlpha).round();
      alpha[index] = finalAlpha;
      if (finalAlpha < 128) removed += 1;
      final r = image.data[offset].toDouble();
      final g = image.data[offset + 1].toDouble();
      final b = image.data[offset + 2].toDouble();
      var outputR = r;
      var outputG = g;
      var outputB = b;
      final normalizedAlpha = finalAlpha / 255;
      if (normalizedAlpha > 0.06 && normalizedAlpha < 0.98) {
        final bg = _nearestBackgroundColor(model, r, g, b, nx, ny);
        final safeAlpha = math.max(0.22, normalizedAlpha);
        final correctedR = _clamp(
          (r - (1 - safeAlpha) * bg[0]) / safeAlpha,
          0,
          255,
        );
        final correctedG = _clamp(
          (g - (1 - safeAlpha) * bg[1]) / safeAlpha,
          0,
          255,
        );
        final correctedB = _clamp(
          (b - (1 - safeAlpha) * bg[2]) / safeAlpha,
          0,
          255,
        );
        final mix = (1 - normalizedAlpha) * 0.72;
        outputR = r + (correctedR - r) * mix;
        outputG = g + (correctedG - g) * mix;
        outputB = b + (correctedB - b) * mix;
      }
      output[offset] = finalAlpha == 0 ? 0 : outputR.round();
      output[offset + 1] = finalAlpha == 0 ? 0 : outputG.round();
      output[offset + 2] = finalAlpha == 0 ? 0 : outputB.round();
      output[offset + 3] = finalAlpha;
      mask[offset] = finalAlpha;
      mask[offset + 1] = finalAlpha;
      mask[offset + 2] = finalAlpha;
      mask[offset + 3] = 255;
    }
  }
  stopwatch.stop();
  final mode = model.plane.enabled
      ? BackgroundMode.gradient
      : (model.clusters.length > 1
          ? BackgroundMode.multiColor
          : BackgroundMode.solid);
  return RemovalResult(
    image: PixelImage(width: width, height: height, data: output),
    mask: PixelImage(width: width, height: height, data: mask),
    alpha: alpha,
    diagnostics: RemovalDiagnostics(
      algorithmVersion: algorithmVersion,
      mode: mode,
      colors: <BackgroundColor>[
        for (final cluster in model.clusters)
          BackgroundColor(
            r: cluster.r,
            g: cluster.g,
            b: cluster.b,
            share: cluster.share,
          ),
      ],
      elapsedMs: stopwatch.elapsedMicroseconds / 1000,
      backgroundNoise: model.noise,
      removedFraction: removed / pixelCount,
      recoveredFraction: recoveredPixels / pixelCount,
      subjectRecoveryApplied: subjectRecoveryApplied,
      threshold: threshold,
    ),
  );
}
