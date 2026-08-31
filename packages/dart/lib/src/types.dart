import 'dart:typed_data';

/// Whether correction evidence identifies background to remove or foreground
/// to retain.
enum SampleKind { background, foreground }

/// The background model selected from the image boundary.
enum BackgroundMode { solid, multiColor, gradient }

/// A single correction marker in image-pixel coordinates.
final class SamplePoint {
  const SamplePoint({required this.x, required this.y, required this.kind});

  /// Horizontal image-pixel coordinate.
  final double x;

  /// Vertical image-pixel coordinate.
  final double y;

  /// Whether this point marks background or foreground.
  final SampleKind kind;
}

/// A point along a correction stroke in image-pixel coordinates.
final class StrokePoint {
  const StrokePoint({required this.x, required this.y});

  /// Horizontal image-pixel coordinate.
  final double x;

  /// Vertical image-pixel coordinate.
  final double y;
}

/// Smart local correction evidence painted through one or more points.
final class BrushStroke {
  const BrushStroke({
    required this.kind,
    required this.radius,
    required this.points,
  });

  /// Whether the stroke removes background or retains foreground.
  final SampleKind kind;

  /// Brush radius in image pixels.
  final double radius;

  /// Ordered points joined into the painted stroke.
  final List<StrokePoint> points;
}

/// Optional point and stroke corrections applied to a removal operation.
final class RemovalGuidance {
  const RemovalGuidance({this.samples = const [], this.strokes = const []});

  /// Point markers that bias classification and connected-region decisions.
  final List<SamplePoint> samples;

  /// Ordered smart correction strokes applied after baseline segmentation.
  final List<BrushStroke> strokes;
}

/// Decoded, unpremultiplied RGBA pixels in row-major order.
final class PixelImage {
  const PixelImage({
    required this.width,
    required this.height,
    required this.data,
  });

  /// Image width in pixels.
  final int width;

  /// Image height in pixels.
  final int height;

  /// At least `width * height * 4` RGBA bytes.
  final Uint8ClampedList data;
}

/// Controls for algorithm-v1 segmentation, cleanup, and edge handling.
final class BorderCutOptions {
  const BorderCutOptions({
    this.tolerance = 46,
    this.edgeProtection = 58,
    this.feather = 2,
    this.cleanup = 1,
    this.protectCenter = true,
    this.recoverPaleSubject = true,
    this.interiorBackground = false,
  });

  /// Creates options from the portable JSON option contract.
  factory BorderCutOptions.fromJson(Map<String, Object?> json) {
    const names = {
      'tolerance',
      'edgeProtection',
      'feather',
      'cleanup',
      'protectCenter',
      'recoverPaleSubject',
      'interiorBackground',
    };
    for (final name in json.keys) {
      if (!names.contains(name)) {
        throw ArgumentError('Unknown removal option: "$name".');
      }
    }

    double number(String name, double fallback) {
      final value = json[name];
      if (value == null) return fallback;
      if (value is! num) {
        throw ArgumentError('Removal option "$name" must be a number.');
      }
      return value.toDouble();
    }

    int integer(String name, int fallback) {
      final value = json[name];
      if (value == null) return fallback;
      if (value is! int) {
        throw ArgumentError('Removal option "$name" must be an integer.');
      }
      return value;
    }

    bool boolean(String name, bool fallback) {
      final value = json[name];
      if (value == null) return fallback;
      if (value is! bool) {
        throw ArgumentError('Removal option "$name" must be a boolean.');
      }
      return value;
    }

    return BorderCutOptions(
      tolerance: number('tolerance', 46),
      edgeProtection: number('edgeProtection', 58),
      feather: integer('feather', 2),
      cleanup: integer('cleanup', 1),
      protectCenter: boolean('protectCenter', true),
      recoverPaleSubject: boolean('recoverPaleSubject', true),
      interiorBackground: boolean('interiorBackground', false),
    );
  }

  /// Background color acceptance from 0 through 100.
  final double tolerance;

  /// Edge-crossing resistance from 0 through 100.
  final double edgeProtection;

  /// Alpha blur radius from 0 through 12 pixels.
  final int feather;

  /// Majority cleanup passes from 0 through 3.
  final int cleanup;

  /// Adds a weak centered-subject prior when true.
  final bool protectCenter;

  /// Recovers pale material against sufficiently regular backgrounds.
  final bool recoverPaleSubject;

  /// Opens confident enclosed background regions when true.
  final bool interiorBackground;
}

/// One color cluster learned from plausible boundary background pixels.
final class BackgroundColor {
  const BackgroundColor({
    required this.r,
    required this.g,
    required this.b,
    required this.share,
  });

  /// Mean red channel.
  final double r;

  /// Mean green channel.
  final double g;

  /// Mean blue channel.
  final double b;

  /// Fraction of accepted boundary samples assigned to the cluster.
  final double share;
}

/// Measurements describing one completed removal operation.
final class RemovalDiagnostics {
  const RemovalDiagnostics({
    required this.algorithmVersion,
    required this.mode,
    required this.colors,
    required this.elapsedMs,
    required this.backgroundNoise,
    required this.removedFraction,
    required this.recoveredFraction,
    required this.subjectRecoveryApplied,
    required this.threshold,
  });

  /// Portable algorithm contract version used for this result.
  final int algorithmVersion;

  /// Selected solid, multi-color, or gradient background model.
  final BackgroundMode mode;

  /// Accepted boundary background clusters.
  final List<BackgroundColor> colors;

  /// Approximate processing time in milliseconds.
  final double elapsedMs;

  /// Estimated variation in the learned background.
  final double backgroundNoise;

  /// Fraction of pixels whose final alpha is below 128.
  final double removedFraction;

  /// Fraction restored by pale-subject recovery.
  final double recoveredFraction;

  /// Whether pale-subject recovery changed the result.
  final bool subjectRecoveryApplied;

  /// Classification threshold derived from [BorderCutOptions.tolerance].
  final double threshold;
}

/// Transparent RGBA output, preview mask, alpha plane, and diagnostics.
final class RemovalResult {
  const RemovalResult({
    required this.image,
    required this.mask,
    required this.alpha,
    required this.diagnostics,
  });

  /// Transparent, edge-decontaminated RGBA output.
  final PixelImage image;

  /// Grayscale RGBA visualization of [alpha].
  final PixelImage mask;

  /// One alpha byte per input pixel.
  final Uint8ClampedList alpha;

  /// Model and processing measurements.
  final RemovalDiagnostics diagnostics;
}
