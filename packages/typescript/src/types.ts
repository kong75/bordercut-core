export type SampleKind = 'background' | 'foreground';

export interface SamplePoint {
  x: number;
  y: number;
  kind: SampleKind;
}

export interface StrokePoint {
  /** Horizontal image-space coordinate in pixels. */
  x: number;
  /** Vertical image-space coordinate in pixels. */
  y: number;
}

export interface BrushStroke {
  /** `background` guides removal; `foreground` guides subject retention. */
  kind: SampleKind;
  /** Radius of the seed band in image pixels. */
  radius: number;
  /** Ordered polyline points. A single point paints a circular dot. */
  points: readonly StrokePoint[];
}

export interface RemovalGuidance {
  /** Correction markers with an engine-derived area of influence. */
  samples?: readonly SamplePoint[];
  /** Ordered, directional seeds for bounded local region guidance. */
  strokes?: readonly BrushStroke[];
}

/** A legacy sample array or the extensible samples-and-strokes guidance object. */
export type RemovalGuidanceInput = readonly SamplePoint[] | RemovalGuidance;

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface RemovalOptions {
  tolerance: number;
  edgeProtection: number;
  feather: number;
  cleanup: number;
  protectCenter: boolean;
  recoverPaleSubject: boolean;
  interiorBackground: boolean;
}

export interface BackgroundColor {
  r: number;
  g: number;
  b: number;
  share: number;
}

export interface RemovalDiagnostics {
  algorithmVersion: number;
  mode: 'solid' | 'multi-color' | 'gradient';
  colors: BackgroundColor[];
  elapsedMs: number;
  backgroundNoise: number;
  removedFraction: number;
  recoveredFraction: number;
  subjectRecoveryApplied: boolean;
  threshold: number;
}

export interface RemovalResult {
  image: PixelImage;
  mask: PixelImage;
  alpha: Uint8ClampedArray;
  diagnostics: RemovalDiagnostics;
}
