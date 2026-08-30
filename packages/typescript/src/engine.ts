import type {
  BackgroundColor,
  BrushStroke,
  PixelImage,
  RemovalGuidanceInput,
  RemovalOptions,
  RemovalResult,
  SamplePoint,
} from './types.js';

export const ALGORITHM_VERSION = 1;

interface ColorSample {
  r: number;
  g: number;
  b: number;
  x: number;
  y: number;
  corner: number;
  assignment: number;
}

interface Cluster extends BackgroundColor {
  id: number;
  count: number;
  spread: number;
  reliability: number;
  cornerHits: number;
  topCornerHits: number;
  bottomCornerHits: number;
  trustedBorderHits: number;
  trustedShare: number;
}

interface Plane {
  r: [number, number, number];
  g: [number, number, number];
  b: [number, number, number];
  rmse: number;
  enabled: boolean;
}

interface BackgroundModel {
  clusters: Cluster[];
  plane: Plane;
  noise: number;
}

interface SubjectRecoveryResult {
  background: Uint8Array;
  applied: boolean;
  recoveredPixels: number;
}

interface NormalizedGuidance {
  samples: readonly SamplePoint[];
  strokes: readonly BrushStroke[];
}

interface StrokeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface StrokeRegionWorkspace {
  strokeMarks: Uint32Array;
  processedSeedMarks: Uint32Array;
  floodMarks: Uint32Array;
  floodDistances: Uint32Array;
  queue: Uint32Array;
  operationId: number;
  componentId: number;
}

export const DEFAULT_OPTIONS: Readonly<RemovalOptions> = {
  tolerance: 46,
  edgeProtection: 58,
  feather: 2,
  cleanup: 1,
  protectCenter: true,
  recoverPaleSubject: true,
  interiorBackground: false,
};

const NUMERIC_OPTION_RANGES = {
  tolerance: [0, 100],
  edgeProtection: [0, 100],
  feather: [0, 12],
  cleanup: [0, 3],
} as const satisfies Record<
  'tolerance' | 'edgeProtection' | 'feather' | 'cleanup',
  readonly [number, number]
>;

const BOOLEAN_OPTION_NAMES = [
  'protectCenter',
  'recoverPaleSubject',
  'interiorBackground',
] as const;

const OPTION_NAMES = new Set<string>([
  ...Object.keys(NUMERIC_OPTION_RANGES),
  ...BOOLEAN_OPTION_NAMES,
]);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isUint8ClampedArray = (value: unknown): value is Uint8ClampedArray =>
  value instanceof Uint8ClampedArray ||
  Object.prototype.toString.call(value) === '[object Uint8ClampedArray]';

function validateImage(image: PixelImage): { width: number; height: number; pixelCount: number } {
  if (!image || typeof image !== 'object') {
    throw new TypeError('The image must be an object containing width, height, and RGBA data.');
  }

  const { width, height, data } = image;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError('Image width and height must be positive safe integers.');
  }

  const pixelCount = width * height;
  const requiredLength = pixelCount * 4;
  if (!Number.isSafeInteger(pixelCount) || !Number.isSafeInteger(requiredLength)) {
    throw new RangeError('The image dimensions are too large to process safely.');
  }
  if (!isUint8ClampedArray(data) || data.length < requiredLength) {
    throw new TypeError(
      `Image data must be a Uint8ClampedArray containing at least ${requiredLength} RGBA bytes.`,
    );
  }

  return { width, height, pixelCount };
}

function resolveOptions(partialOptions: Partial<RemovalOptions>): RemovalOptions {
  if (!partialOptions || typeof partialOptions !== 'object' || Array.isArray(partialOptions)) {
    throw new TypeError('Removal options must be an object.');
  }

  for (const name of Object.keys(partialOptions)) {
    if (!OPTION_NAMES.has(name)) throw new TypeError(`Unknown removal option: "${name}".`);
  }

  const options: RemovalOptions = { ...DEFAULT_OPTIONS, ...partialOptions };
  for (const [name, [minimum, maximum]] of Object.entries(NUMERIC_OPTION_RANGES)) {
    const value = options[name as keyof typeof NUMERIC_OPTION_RANGES];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RangeError(
        `Removal option "${name}" must be a finite number from ${minimum} through ${maximum}.`,
      );
    }
    if ((name === 'feather' || name === 'cleanup') && !Number.isInteger(value)) {
      throw new RangeError(`Removal option "${name}" must be an integer.`);
    }
  }
  for (const name of BOOLEAN_OPTION_NAMES) {
    if (typeof options[name] !== 'boolean') {
      throw new TypeError(`Removal option "${name}" must be a boolean.`);
    }
  }

  return options;
}

function validateSamples(
  samples: readonly SamplePoint[],
  width: number,
  height: number,
): void {
  if (!Array.isArray(samples)) throw new TypeError('Correction samples must be an array.');
  for (const [index, sample] of samples.entries()) {
    if (!sample || typeof sample !== 'object') {
      throw new TypeError(`Correction sample ${index} must be an object.`);
    }
    if (sample.kind !== 'background' && sample.kind !== 'foreground') {
      throw new TypeError(
        `Correction sample ${index} must have kind "background" or "foreground".`,
      );
    }
    if (
      !Number.isFinite(sample.x) ||
      !Number.isFinite(sample.y) ||
      sample.x < 0 ||
      sample.y < 0 ||
      sample.x > width - 1 ||
      sample.y > height - 1
    ) {
      throw new RangeError(`Correction sample ${index} is outside the image bounds.`);
    }
  }
}

function validateStrokes(
  strokes: readonly BrushStroke[],
  width: number,
  height: number,
): void {
  if (!Array.isArray(strokes)) throw new TypeError('Correction strokes must be an array.');
  for (const [strokeIndex, stroke] of strokes.entries()) {
    if (!stroke || typeof stroke !== 'object') {
      throw new TypeError(`Correction stroke ${strokeIndex} must be an object.`);
    }
    if (stroke.kind !== 'background' && stroke.kind !== 'foreground') {
      throw new TypeError(
        `Correction stroke ${strokeIndex} must have kind "background" or "foreground".`,
      );
    }
    if (
      !Number.isFinite(stroke.radius) ||
      stroke.radius <= 0 ||
      stroke.radius > Math.max(width, height)
    ) {
      throw new RangeError(
        `Correction stroke ${strokeIndex} radius must be greater than 0 and no larger than the image.`,
      );
    }
    if (!Array.isArray(stroke.points) || stroke.points.length === 0) {
      throw new TypeError(`Correction stroke ${strokeIndex} must contain at least one point.`);
    }
    for (const [pointIndex, point] of stroke.points.entries()) {
      if (
        !point ||
        typeof point !== 'object' ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.y < 0 ||
        point.x > width - 1 ||
        point.y > height - 1
      ) {
        throw new RangeError(
          `Correction stroke ${strokeIndex} point ${pointIndex} is outside the image bounds.`,
        );
      }
    }
  }
}

const isSampleArray = (guidance: RemovalGuidanceInput): guidance is readonly SamplePoint[] =>
  Array.isArray(guidance);

function resolveGuidance(
  guidance: RemovalGuidanceInput,
  width: number,
  height: number,
): NormalizedGuidance {
  if (isSampleArray(guidance)) {
    validateSamples(guidance, width, height);
    return { samples: guidance, strokes: [] };
  }
  if (!guidance || typeof guidance !== 'object') {
    throw new TypeError('Removal guidance must be a sample array or a guidance object.');
  }
  for (const name of Object.keys(guidance)) {
    if (name !== 'samples' && name !== 'strokes') {
      throw new TypeError(`Unknown removal guidance field: "${name}".`);
    }
  }

  const samples = guidance.samples ?? [];
  const strokes = guidance.strokes ?? [];
  validateSamples(samples, width, height);
  validateStrokes(strokes, width, height);
  return { samples, strokes };
}

function rasterizeStrokeIntoGuidance(
  stroke: BrushStroke,
  guidance: Uint8Array,
  strokeMarks: Uint32Array,
  operationId: number,
  width: number,
  height: number,
): StrokeBounds {
  const value = stroke.kind === 'background' ? 1 : 2;
  const first = stroke.points[0];
  const segments = stroke.points.length === 1 && first ? [[first, first] as const] : [];
  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1];
    const end = stroke.points[index];
    if (start && end) segments.push([start, end]);
  }

  const bounds: StrokeBounds = {
    minX: width - 1,
    maxX: 0,
    minY: height - 1,
    maxY: 0,
  };
  for (const [start, end] of segments) {
    const minX = Math.max(0, Math.floor(Math.min(start.x, end.x) - stroke.radius));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(start.x, end.x) + stroke.radius));
    const minY = Math.max(0, Math.floor(Math.min(start.y, end.y) - stroke.radius));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(start.y, end.y) + stroke.radius));
    bounds.minX = Math.min(bounds.minX, minX);
    bounds.maxX = Math.max(bounds.maxX, maxX);
    bounds.minY = Math.min(bounds.minY, minY);
    bounds.maxY = Math.max(bounds.maxY, maxY);
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const radiusSquared = stroke.radius * stroke.radius;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const projection =
          segmentLengthSquared === 0
            ? 0
            : clamp(
                ((x - start.x) * segmentX + (y - start.y) * segmentY) /
                  segmentLengthSquared,
                0,
                1,
              );
        const nearestX = start.x + segmentX * projection;
        const nearestY = start.y + segmentY * projection;
        const distanceX = x - nearestX;
        const distanceY = y - nearestY;
        if (distanceX * distanceX + distanceY * distanceY <= radiusSquared) {
          const pixelIndex = y * width + x;
          guidance[pixelIndex] = value;
          strokeMarks[pixelIndex] = operationId;
        }
      }
    }
  }

  return bounds;
}

const smoothstep = (value: number): number => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const now = (): number =>
  typeof performance === 'undefined' ? Date.now() : performance.now();

const colorDistance = (
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number => {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((dr * dr + dg * dg + db * db) / 3);
};

const pixelOffset = (x: number, y: number, width: number): number =>
  (y * width + x) * 4;

const readColor = (image: PixelImage, x: number, y: number): [number, number, number] => {
  const offset = pixelOffset(x, y, image.width);
  return [
    image.data[offset] ?? 0,
    image.data[offset + 1] ?? 0,
    image.data[offset + 2] ?? 0,
  ];
};

function collectSamples(image: PixelImage): ColorSample[] {
  const { width, height } = image;
  const perimeter = Math.max(1, width * 2 + height * 2 - 4);
  const step = Math.max(1, Math.ceil(perimeter / 1800));
  const samples: ColorSample[] = [];

  const push = (x: number, y: number, corner = -1): void => {
    const px = clamp(Math.round(x), 0, width - 1);
    const py = clamp(Math.round(y), 0, height - 1);
    const [r, g, b] = readColor(image, px, py);
    samples.push({
      r,
      g,
      b,
      x: width <= 1 ? 0 : px / (width - 1),
      y: height <= 1 ? 0 : py / (height - 1),
      corner,
      assignment: 0,
    });
  };

  for (let x = 0; x < width; x += step) {
    push(x, 0);
    if (height > 1) push(x, height - 1);
  }
  for (let y = step; y < height - 1; y += step) {
    push(0, y);
    if (width > 1) push(width - 1, y);
  }

  push(0, 0, 0);
  push(width - 1, 0, 1);
  push(width - 1, height - 1, 2);
  push(0, height - 1, 3);

  return samples;
}

function makeClusters(samples: ColorSample[]): Cluster[] {
  const clusterCount = Math.min(3, Math.max(1, samples.length));
  const seeds: Array<[number, number, number]> = [];
  const first = samples[0] ?? {
    r: 255,
    g: 255,
    b: 255,
  };
  seeds.push([first.r, first.g, first.b]);

  while (seeds.length < clusterCount) {
    let farthest = samples[0] ?? first;
    let farthestDistance = -1;
    for (const sample of samples) {
      let nearest = Number.POSITIVE_INFINITY;
      for (const seed of seeds) {
        nearest = Math.min(
          nearest,
          colorDistance(sample.r, sample.g, sample.b, seed[0], seed[1], seed[2]),
        );
      }
      if (nearest > farthestDistance) {
        farthestDistance = nearest;
        farthest = sample;
      }
    }
    seeds.push([farthest.r, farthest.g, farthest.b]);
  }

  for (let iteration = 0; iteration < 7; iteration += 1) {
    const sums = Array.from({ length: clusterCount }, () => [0, 0, 0, 0]);
    for (const sample of samples) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < seeds.length; index += 1) {
        const seed = seeds[index];
        if (!seed) continue;
        const distance = colorDistance(
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
      const sum = sums[nearestIndex];
      if (!sum) continue;
      sum[0] = (sum[0] ?? 0) + sample.r;
      sum[1] = (sum[1] ?? 0) + sample.g;
      sum[2] = (sum[2] ?? 0) + sample.b;
      sum[3] = (sum[3] ?? 0) + 1;
    }

    for (let index = 0; index < clusterCount; index += 1) {
      const sum = sums[index];
      const count = sum?.[3] ?? 0;
      if (!sum || count === 0) continue;
      seeds[index] = [
        (sum[0] ?? 0) / count,
        (sum[1] ?? 0) / count,
        (sum[2] ?? 0) / count,
      ];
    }
  }

  const clusters: Cluster[] = seeds.map((seed, id) => ({
    id,
    r: seed[0],
    g: seed[1],
    b: seed[2],
    count: 0,
    share: 0,
    spread: 0,
    reliability: 0,
    cornerHits: 0,
    topCornerHits: 0,
    bottomCornerHits: 0,
    trustedBorderHits: 0,
    trustedShare: 0,
  }));
  const squaredSpread = new Float64Array(clusterCount);
  const cornerMasks = new Uint8Array(clusterCount);
  let trustedBorderSamples = 0;

  for (const sample of samples) {
    const cluster = clusters[sample.assignment];
    if (!cluster) continue;
    cluster.count += 1;
    const distance = colorDistance(sample.r, sample.g, sample.b, cluster.r, cluster.g, cluster.b);
    squaredSpread[sample.assignment] =
      (squaredSpread[sample.assignment] ?? 0) + distance * distance;
    if (sample.corner >= 0) {
      cornerMasks[sample.assignment] =
        (cornerMasks[sample.assignment] ?? 0) | (1 << sample.corner);
    }
    const onTop = sample.y === 0;
    const onSide = sample.x === 0 || sample.x === 1;
    if (onTop || (onSide && sample.y < 0.75)) {
      cluster.trustedBorderHits += 1;
      trustedBorderSamples += 1;
    }
  }

  for (const cluster of clusters) {
    cluster.share = cluster.count / Math.max(1, samples.length);
    cluster.spread = Math.sqrt((squaredSpread[cluster.id] ?? 0) / Math.max(1, cluster.count));
    const mask = cornerMasks[cluster.id] ?? 0;
    cluster.cornerHits =
      (mask & 1 ? 1 : 0) +
      (mask & 2 ? 1 : 0) +
      (mask & 4 ? 1 : 0) +
      (mask & 8 ? 1 : 0);
    cluster.topCornerHits = (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0);
    cluster.bottomCornerHits = (mask & 4 ? 1 : 0) + (mask & 8 ? 1 : 0);
    cluster.trustedShare = cluster.trustedBorderHits / Math.max(1, trustedBorderSamples);
    cluster.reliability = clamp(
      cluster.share * 0.8 +
        cluster.trustedShare * 1.5 +
        cluster.topCornerHits * 0.22 +
        cluster.bottomCornerHits * 0.04,
      0,
      1,
    );
  }

  const accepted = clusters
    .filter(
      (cluster) =>
        cluster.topCornerHits > 0 ||
        (cluster.trustedShare >= 0.1 && cluster.bottomCornerHits < 2) ||
        (cluster.share >= 0.48 && cluster.bottomCornerHits < 2),
    )
    .sort((a, b) => b.reliability - a.reliability || b.count - a.count)
    .slice(0, 3);

  if (accepted.length === 0) {
    const largest = [...clusters].sort((a, b) => b.count - a.count)[0];
    if (largest) accepted.push(largest);
  }

  return accepted;
}

function solve3x3(matrix: number[][], vector: number[]): [number, number, number] | null {
  const augmented = matrix.map((row, index) => [
    row[0] ?? 0,
    row[1] ?? 0,
    row[2] ?? 0,
    vector[index] ?? 0,
  ]);

  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row]?.[column] ?? 0) > Math.abs(augmented[pivot]?.[column] ?? 0)) {
        pivot = row;
      }
    }
    const pivotRow = augmented[pivot];
    if (!pivotRow || Math.abs(pivotRow[column] ?? 0) < 1e-8) return null;
    [augmented[column], augmented[pivot]] = [pivotRow, augmented[column] ?? pivotRow];

    const row = augmented[column];
    if (!row) return null;
    const divisor = row[column] ?? 1;
    for (let index = column; index < 4; index += 1) row[index] = (row[index] ?? 0) / divisor;

    for (let other = 0; other < 3; other += 1) {
      if (other === column) continue;
      const otherRow = augmented[other];
      if (!otherRow) continue;
      const factor = otherRow[column] ?? 0;
      for (let index = column; index < 4; index += 1) {
        otherRow[index] = (otherRow[index] ?? 0) - factor * (row[index] ?? 0);
      }
    }
  }

  return [
    augmented[0]?.[3] ?? 0,
    augmented[1]?.[3] ?? 0,
    augmented[2]?.[3] ?? 0,
  ];
}

function fitPlaneChannel(samples: ColorSample[], channel: 'r' | 'g' | 'b'): [number, number, number] {
  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const vector = [0, 0, 0];

  for (const sample of samples) {
    const features = [1, sample.x, sample.y];
    const value = sample[channel];
    for (let row = 0; row < 3; row += 1) {
      vector[row] = (vector[row] ?? 0) + (features[row] ?? 0) * value;
      for (let column = 0; column < 3; column += 1) {
        const targetRow = matrix[row];
        if (!targetRow) continue;
        targetRow[column] =
          (targetRow[column] ?? 0) + (features[row] ?? 0) * (features[column] ?? 0);
      }
    }
  }

  return solve3x3(matrix, vector) ?? [0, 0, 0];
}

function planeColor(plane: Plane, x: number, y: number): [number, number, number] {
  return [
    clamp(plane.r[0] + plane.r[1] * x + plane.r[2] * y, 0, 255),
    clamp(plane.g[0] + plane.g[1] * x + plane.g[2] * y, 0, 255),
    clamp(plane.b[0] + plane.b[1] * x + plane.b[2] * y, 0, 255),
  ];
}

function fitGradientPlane(samples: ColorSample[], clusters: Cluster[]): Plane {
  const acceptedIds = new Set(clusters.map((cluster) => cluster.id));
  let selected = samples.filter((sample) => acceptedIds.has(sample.assignment));
  if (selected.length < 6) selected = samples;

  let plane: Plane = {
    r: fitPlaneChannel(selected, 'r'),
    g: fitPlaneChannel(selected, 'g'),
    b: fitPlaneChannel(selected, 'b'),
    rmse: 255,
    enabled: false,
  };

  const residuals = selected.map((sample) => {
    const predicted = planeColor(plane, sample.x, sample.y);
    return colorDistance(sample.r, sample.g, sample.b, predicted[0], predicted[1], predicted[2]);
  });
  const sorted = [...residuals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const cutoff = Math.max(12, median * 2.8);
  const inliers = selected.filter((_, index) => (residuals[index] ?? 0) <= cutoff);

  if (inliers.length >= 6 && inliers.length < selected.length) {
    selected = inliers;
    plane = {
      ...plane,
      r: fitPlaneChannel(selected, 'r'),
      g: fitPlaneChannel(selected, 'g'),
      b: fitPlaneChannel(selected, 'b'),
    };
  }

  let squaredError = 0;
  for (const sample of selected) {
    const predicted = planeColor(plane, sample.x, sample.y);
    const residual = colorDistance(
      sample.r,
      sample.g,
      sample.b,
      predicted[0],
      predicted[1],
      predicted[2],
    );
    squaredError += residual * residual;
  }
  plane.rmse = Math.sqrt(squaredError / Math.max(1, selected.length));

  const corners = [
    planeColor(plane, 0, 0),
    planeColor(plane, 1, 0),
    planeColor(plane, 1, 1),
    planeColor(plane, 0, 1),
  ];
  let range = 0;
  for (let first = 0; first < corners.length; first += 1) {
    for (let second = first + 1; second < corners.length; second += 1) {
      const a = corners[first];
      const b = corners[second];
      if (!a || !b) continue;
      range = Math.max(range, colorDistance(a[0], a[1], a[2], b[0], b[1], b[2]));
    }
  }
  const averageSpread =
    clusters.reduce((sum, cluster) => sum + cluster.spread, 0) / Math.max(1, clusters.length);
  plane.enabled = range > 9 && plane.rmse < Math.max(18, averageSpread * 1.4 + 7);
  return plane;
}

function buildBackgroundModel(image: PixelImage): BackgroundModel {
  const samples = collectSamples(image);
  const clusters = makeClusters(samples);
  const plane = fitGradientPlane(samples, clusters);
  const clusterSamples = clusters.reduce((sum, cluster) => sum + cluster.count, 0);
  const clusterNoise =
    clusters.reduce((sum, cluster) => sum + cluster.spread * cluster.count, 0) /
    Math.max(1, clusterSamples);
  return {
    clusters,
    plane,
    noise: clamp(plane.enabled ? plane.rmse : clusterNoise, 0, 32),
  };
}

function applyBackgroundMarkerFloods(
  image: PixelImage,
  background: Uint8Array,
  scores: Float32Array,
  edges: Float32Array,
  samples: readonly SamplePoint[],
  threshold: number,
  tolerance: number,
  edgeProtection: number,
): Uint8Array {
  const { width, height } = image;
  const total = width * height;
  const colorLimit = 20 + clamp(tolerance, 0, 100) * 0.38;
  const stepLimit = colorLimit * 0.82;
  const edgeGate = 13 + (100 - clamp(edgeProtection, 0, 100)) * 0.22;

  for (const sample of samples) {
    if (sample.kind !== 'background') continue;
    const startX = clamp(Math.round(sample.x), 0, width - 1);
    const startY = clamp(Math.round(sample.y), 0, height - 1);
    const startIndex = startY * width + startX;
    const startOffset = startIndex * 4;
    const seedR = image.data[startOffset] ?? 0;
    const seedG = image.data[startOffset + 1] ?? 0;
    const seedB = image.data[startOffset + 2] ?? 0;
    const visited = new Uint8Array(total);
    const queue = new Uint32Array(total);
    let head = 0;
    let tail = 0;
    visited[startIndex] = 1;
    queue[tail] = startIndex;
    tail += 1;

    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      background[index] = 1;
      scores[index] = Math.min(scores[index] ?? 255, threshold * 0.35);
      const x = index % width;
      const y = Math.floor(index / width);
      const offset = index * 4;
      const currentR = image.data[offset] ?? 0;
      const currentG = image.data[offset + 1] ?? 0;
      const currentB = image.data[offset + 2] ?? 0;

      const visit = (nextIndex: number): void => {
        if (visited[nextIndex]) return;
        visited[nextIndex] = 1;
        const nextOffset = nextIndex * 4;
        const nextR = image.data[nextOffset] ?? 0;
        const nextG = image.data[nextOffset + 1] ?? 0;
        const nextB = image.data[nextOffset + 2] ?? 0;
        const seedDistance = colorDistance(nextR, nextG, nextB, seedR, seedG, seedB);
        const stepDistance = colorDistance(
          nextR,
          nextG,
          nextB,
          currentR,
          currentG,
          currentB,
        );
        if (seedDistance > colorLimit || stepDistance > stepLimit) return;
        if (
          Math.max(edges[index] ?? 0, edges[nextIndex] ?? 0) > edgeGate &&
          seedDistance > colorLimit * 0.55
        ) {
          return;
        }
        queue[tail] = nextIndex;
        tail += 1;
      };

      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
  }

  return background;
}

function applyStrokeRegionGuidance(
  image: PixelImage,
  background: Uint8Array,
  scores: Float32Array,
  edges: Float32Array,
  guidance: Uint8Array,
  kind: SamplePoint['kind'],
  threshold: number,
  tolerance: number,
  edgeProtection: number,
  seedBounds: StrokeBounds,
  workspace: StrokeRegionWorkspace,
  operationId: number,
): Uint8Array {
  const { width, height } = image;
  const blocker = kind === 'background' ? 2 : 1;
  const colorLimit =
    kind === 'background'
      ? 20 + clamp(tolerance, 0, 100) * 0.38
      : 14 + clamp(tolerance, 0, 100) * 0.24;
  const stepLimit = colorLimit * (kind === 'background' ? 0.82 : 0.72);
  const edgeGate =
    kind === 'background'
      ? 13 + (100 - clamp(edgeProtection, 0, 100)) * 0.22
      : 5 + (100 - clamp(edgeProtection, 0, 100)) * 0.1;
  const maximumReach = Math.max(24, Math.round(Math.min(width, height) * 0.18));
  const {
    strokeMarks,
    processedSeedMarks,
    floodMarks,
    floodDistances,
    queue,
  } = workspace;

  const distanceSquaredToPalette = (
    index: number,
    palette: readonly number[],
  ): number => {
    const offset = index * 4;
    const r = image.data[offset] ?? 0;
    const g = image.data[offset + 1] ?? 0;
    const b = image.data[offset + 2] ?? 0;
    let nearest = Number.POSITIVE_INFINITY;
    for (const paletteIndex of palette) {
      const paletteOffset = paletteIndex * 4;
      const dr = r - (image.data[paletteOffset] ?? 0);
      const dg = g - (image.data[paletteOffset + 1] ?? 0);
      const db = b - (image.data[paletteOffset + 2] ?? 0);
      nearest = Math.min(nearest, (dr * dr + dg * dg + db * db) / 3);
    }
    return nearest;
  };

  for (let seedY = seedBounds.minY; seedY <= seedBounds.maxY; seedY += 1) {
    for (let seedX = seedBounds.minX; seedX <= seedBounds.maxX; seedX += 1) {
      const seedIndex = seedY * width + seedX;
      if (
        strokeMarks[seedIndex] !== operationId ||
        processedSeedMarks[seedIndex] === operationId
      ) {
        continue;
      }
      workspace.componentId = (workspace.componentId + 1) >>> 0;
      if (workspace.componentId === 0) {
        floodMarks.fill(0);
        workspace.componentId = 1;
      }
      const componentId = workspace.componentId;
      let head = 0;
      let tail = 1;
      queue[0] = seedIndex;
      processedSeedMarks[seedIndex] = operationId;

      const enqueueConnectedSeed = (index: number): void => {
        if (
          strokeMarks[index] !== operationId ||
          processedSeedMarks[index] === operationId
        ) {
          return;
        }
        processedSeedMarks[index] = operationId;
        queue[tail] = index;
        tail += 1;
      };

      while (head < tail) {
        const index = queue[head] ?? 0;
        head += 1;
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) enqueueConnectedSeed(index - 1);
        if (x + 1 < width) enqueueConnectedSeed(index + 1);
        if (y > 0) enqueueConnectedSeed(index - width);
        if (y + 1 < height) enqueueConnectedSeed(index + width);
      }

      const seedCount = tail;
      // A compact, deduplicated palette represents long or gradient strokes
      // without comparing every grown pixel to every painted seed.
      const palette: number[] = [];
      const paletteCandidates = Math.min(24, seedCount);
      for (let index = 0; index < paletteCandidates && palette.length < 12; index += 1) {
        const position =
          paletteCandidates === 1
            ? 0
            : Math.round((index * (seedCount - 1)) / (paletteCandidates - 1));
        const candidate = queue[position] ?? seedIndex;
        const candidateOffset = candidate * 4;
        const duplicate = palette.some((paletteIndex) => {
          const paletteOffset = paletteIndex * 4;
          return (
            image.data[candidateOffset] === image.data[paletteOffset] &&
            image.data[candidateOffset + 1] === image.data[paletteOffset + 1] &&
            image.data[candidateOffset + 2] === image.data[paletteOffset + 2]
          );
        });
        if (!duplicate) palette.push(candidate);
      }

      for (let index = 0; index < seedCount; index += 1) {
        const guidedIndex = queue[index] ?? seedIndex;
        floodMarks[guidedIndex] = componentId;
        floodDistances[guidedIndex] = 0;
        background[guidedIndex] = kind === 'background' ? 1 : 0;
        scores[guidedIndex] =
          kind === 'background'
            ? Math.min(scores[guidedIndex] ?? 255, threshold * 0.35)
            : Math.max(scores[guidedIndex] ?? 0, threshold * 1.5);
      }

      // Grow from the complete connected seed component. The stroke is
      // evidence for a nearby region, while bounded reach, color continuity,
      // and edges define it.
      head = 0;
      while (head < tail) {
        const index = queue[head] ?? 0;
        head += 1;
        const x = index % width;
        const y = Math.floor(index / width);
        const offset = index * 4;
        const currentR = image.data[offset] ?? 0;
        const currentG = image.data[offset + 1] ?? 0;
        const currentB = image.data[offset + 2] ?? 0;

        const visit = (nextIndex: number): void => {
          if (floodMarks[nextIndex] === componentId || guidance[nextIndex] === blocker) {
            return;
          }
          const nextDistance = (floodDistances[index] ?? 0) + 1;
          if (nextDistance > maximumReach) return;
          const nextOffset = nextIndex * 4;
          const paletteDistanceSquared = distanceSquaredToPalette(nextIndex, palette);
          if (paletteDistanceSquared > colorLimit * colorLimit) return;
          const stepDistance = colorDistance(
            image.data[nextOffset] ?? 0,
            image.data[nextOffset + 1] ?? 0,
            image.data[nextOffset + 2] ?? 0,
            currentR,
            currentG,
            currentB,
          );
          if (stepDistance > stepLimit) return;
          const crossingEdge = Math.max(edges[index] ?? 0, edges[nextIndex] ?? 0);
          if (
            crossingEdge > edgeGate &&
            (kind === 'foreground' ||
              paletteDistanceSquared > colorLimit * colorLimit * 0.55 * 0.55)
          ) {
            return;
          }

          floodMarks[nextIndex] = componentId;
          floodDistances[nextIndex] = nextDistance;
          if (strokeMarks[nextIndex] === operationId) {
            processedSeedMarks[nextIndex] = operationId;
          }
          background[nextIndex] = kind === 'background' ? 1 : 0;
          scores[nextIndex] =
            kind === 'background'
              ? Math.min(scores[nextIndex] ?? 255, threshold * 0.35)
              : Math.max(scores[nextIndex] ?? 0, threshold * 1.5);
          queue[tail] = nextIndex;
          tail += 1;
        };

        if (x > 0) visit(index - 1);
        if (x + 1 < width) visit(index + 1);
        if (y > 0) visit(index - width);
        if (y + 1 < height) visit(index + width);
      }
    }
  }

  return background;
}

function modelDistance(
  model: BackgroundModel,
  r: number,
  g: number,
  b: number,
  nx: number,
  ny: number,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const cluster of model.clusters) {
    const distance = colorDistance(r, g, b, cluster.r, cluster.g, cluster.b);
    const adjusted =
      Math.max(0, distance - Math.min(20, cluster.spread * 0.4)) +
      (1 - cluster.reliability) * 4;
    nearest = Math.min(nearest, adjusted);
  }

  if (model.plane.enabled) {
    const predicted = planeColor(model.plane, nx, ny);
    const distance = colorDistance(r, g, b, predicted[0], predicted[1], predicted[2]);
    nearest = Math.min(nearest, Math.max(0, distance - model.plane.rmse * 0.35));
  }

  return nearest;
}

function nearestBackgroundColor(
  model: BackgroundModel,
  r: number,
  g: number,
  b: number,
  nx: number,
  ny: number,
): [number, number, number] {
  if (model.plane.enabled) return planeColor(model.plane, nx, ny);
  let selected = model.clusters[0];
  let nearest = Number.POSITIVE_INFINITY;
  for (const cluster of model.clusters) {
    const distance = colorDistance(r, g, b, cluster.r, cluster.g, cluster.b);
    if (distance < nearest) {
      nearest = distance;
      selected = cluster;
    }
  }
  return selected ? [selected.r, selected.g, selected.b] : [255, 255, 255];
}

function backgroundReferenceDistance(
  model: BackgroundModel,
  r: number,
  g: number,
  b: number,
  nx: number,
  ny: number,
): number {
  if (model.plane.enabled) {
    const predicted = planeColor(model.plane, nx, ny);
    return colorDistance(r, g, b, predicted[0], predicted[1], predicted[2]);
  }

  let nearest = Number.POSITIVE_INFINITY;
  for (const cluster of model.clusters) {
    nearest = Math.min(nearest, colorDistance(r, g, b, cluster.r, cluster.g, cluster.b));
  }
  return nearest;
}

function gradientAt(image: PixelImage, x: number, y: number): number {
  const radius = Math.min(2, Math.max(image.width - 1, image.height - 1));
  const left = readColor(image, Math.max(0, x - radius), y);
  const right = readColor(image, Math.min(image.width - 1, x + radius), y);
  const top = readColor(image, x, Math.max(0, y - radius));
  const bottom = readColor(image, x, Math.min(image.height - 1, y + radius));
  const divisor = Math.max(1, radius);
  const horizontal =
    colorDistance(left[0], left[1], left[2], right[0], right[1], right[2]) / divisor;
  const vertical =
    colorDistance(top[0], top[1], top[2], bottom[0], bottom[1], bottom[2]) / divisor;
  return Math.sqrt(horizontal * horizontal + vertical * vertical);
}

function sampleInfluence(
  samples: readonly SamplePoint[],
  kind: SamplePoint['kind'],
  x: number,
  y: number,
  radius: number,
): number {
  let influence = 0;
  const radiusSquared = radius * radius;
  for (const sample of samples) {
    if (sample.kind !== kind) continue;
    const dx = x - sample.x;
    const dy = y - sample.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= radiusSquared) continue;
    const normalized = 1 - Math.sqrt(distanceSquared) / radius;
    influence = Math.max(influence, normalized * normalized);
  }
  return influence;
}

function majorityCleanup(
  mask: Uint8Array,
  scores: Float32Array,
  width: number,
  height: number,
  threshold: number,
  iterations: number,
): Uint8Array {
  let current = mask;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = current.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        let backgroundNeighbors = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (current[(y + offsetY) * width + x + offsetX]) backgroundNeighbors += 1;
          }
        }
        if (current[index] && backgroundNeighbors <= 2) next[index] = 0;
        if (!current[index] && backgroundNeighbors >= 7 && (scores[index] ?? 255) < threshold) {
          next[index] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function blurAlpha(source: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  if (radius <= 0) return source;
  const horizontal = new Uint8ClampedArray(source.length);
  const output = new Uint8ClampedArray(source.length);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += source[y * width + clamp(offset, 0, width - 1)] ?? 0;
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = Math.round(sum / windowSize);
      const outgoing = clamp(x - radius, 0, width - 1);
      const incoming = clamp(x + radius + 1, 0, width - 1);
      sum +=
        (source[y * width + incoming] ?? 0) -
        (source[y * width + outgoing] ?? 0);
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += horizontal[clamp(offset, 0, height - 1) * width + x] ?? 0;
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = Math.round(sum / windowSize);
      const outgoing = clamp(y - radius, 0, height - 1);
      const incoming = clamp(y + radius + 1, 0, height - 1);
      sum +=
        (horizontal[incoming * width + x] ?? 0) -
        (horizontal[outgoing * width + x] ?? 0);
    }
  }
  return output;
}

function blurFloat(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius <= 0) return source;
  const horizontal = new Float32Array(source.length);
  const output = new Float32Array(source.length);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += source[y * width + clamp(offset, 0, width - 1)] ?? 0;
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / windowSize;
      const outgoing = clamp(x - radius, 0, width - 1);
      const incoming = clamp(x + radius + 1, 0, width - 1);
      sum +=
        (source[y * width + incoming] ?? 0) -
        (source[y * width + outgoing] ?? 0);
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += horizontal[clamp(offset, 0, height - 1) * width + x] ?? 0;
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / windowSize;
      const outgoing = clamp(y - radius, 0, height - 1);
      const incoming = clamp(y + radius + 1, 0, height - 1);
      sum +=
        (horizontal[incoming * width + x] ?? 0) -
        (horizontal[outgoing * width + x] ?? 0);
    }
  }
  return output;
}

function recoverPaleForeground(
  background: Uint8Array,
  evidence: Float32Array,
  width: number,
  height: number,
  threshold: number,
  modelNoise: number,
): SubjectRecoveryResult {
  const total = width * height;
  const noiseLimit = Math.max(9, threshold * 0.24);
  if (modelNoise > noiseLimit) {
    return { background, applied: false, recoveredPixels: 0 };
  }

  const original = background.slice();
  const radius = Math.max(1, Math.round(Math.min(width, height) / 85));
  const smoothed = blurFloat(evidence, width, height, radius);
  const certainBackground = clamp(2.5 + modelNoise * 1.25, 2.5, 8);
  const supportMinimum = clamp(6 + modelNoise * 1.4, 6, 16);
  const candidate = new Uint8Array(total);
  const recovered = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;

  for (let index = 0; index < total; index += 1) {
    const knownSubject = !background[index];
    if (
      knownSubject ||
      ((evidence[index] ?? 0) >= certainBackground &&
        (smoothed[index] ?? 0) >= supportMinimum)
    ) {
      candidate[index] = 1;
    }
    if (knownSubject) {
      recovered[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  }

  const visit = (index: number): void => {
    if (!candidate[index] || recovered[index]) return;
    recovered[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }

  for (let index = 0; index < total; index += 1) {
    if (recovered[index]) background[index] = 0;
  }

  // Restore extremely background-like pixels connected to any image edge.
  // The original flood-fill distrusts the lower center to protect portraits;
  // this stricter evidence pass can safely reopen genuine arches and gaps.
  const exterior = new Uint8Array(total);
  head = 0;
  tail = 0;
  const restore = (index: number): void => {
    if (
      exterior[index] ||
      (evidence[index] ?? 255) >= certainBackground
    ) {
      return;
    }
    exterior[index] = 1;
    background[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    restore(x);
    if (height > 1) restore((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    restore(y * width);
    if (width > 1) restore(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) restore(index - 1);
    if (x + 1 < width) restore(index + 1);
    if (y > 0) restore(index - width);
    if (y + 1 < height) restore(index + width);
  }

  // Pale material can form a slim channel to the lower image boundary. Fill
  // only low-contrast runs bounded by subject on both sides. Stronger local
  // contrast and wider openings, such as arches or chair legs, remain open.
  const maximumWidth = Math.max(2, Math.ceil(Math.min(width, height) / 24));
  const startY = Math.round(height * 0.58);
  const minimumRunEvidence = Math.max(1.4, certainBackground * 0.55);
  const minimumRunSupport = Math.max(3, certainBackground * 1.2);
  const maximumRunSupport = clamp(8.5 + modelNoise * 1.8, 8.5, 24);

  for (let y = startY; y < height; y += 1) {
    let x = 1;
    while (x < width - 1) {
      if (!background[y * width + x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < width - 1 && background[y * width + x]) x += 1;
      const runWidth = x - start;
      const boundedBySubject =
        !background[y * width + start - 1] &&
        x < width &&
        !background[y * width + x];
      if (!boundedBySubject || runWidth > maximumWidth) continue;

      let evidenceSum = 0;
      let supportSum = 0;
      for (let sampleX = start; sampleX < x; sampleX += 1) {
        const index = y * width + sampleX;
        evidenceSum += evidence[index] ?? 0;
        supportSum += smoothed[index] ?? 0;
      }
      const meanEvidence = evidenceSum / runWidth;
      const meanSupport = supportSum / runWidth;
      if (
        meanEvidence >= minimumRunEvidence &&
        meanSupport >= minimumRunSupport &&
        meanSupport <= maximumRunSupport
      ) {
        for (let fillX = start; fillX < x; fillX += 1) {
          background[y * width + fillX] = 0;
        }
      }
    }
  }

  // Once a false channel is sealed, any background trapped behind it belongs
  // to the recovered subject. This runs before the engine's intentional
  // large-background-island pass, so handles and user-selected holes retain
  // their existing behavior.
  const connectedExterior = new Uint8Array(total);
  head = 0;
  tail = 0;
  const markExterior = (index: number): void => {
    if (!background[index] || connectedExterior[index]) return;
    connectedExterior[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    markExterior(x);
    if (height > 1) markExterior((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    markExterior(y * width);
    if (width > 1) markExterior(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) markExterior(index - 1);
    if (x + 1 < width) markExterior(index + 1);
    if (y > 0) markExterior(index - width);
    if (y + 1 < height) markExterior(index + width);
  }
  for (let index = 0; index < total; index += 1) {
    if (background[index] && !connectedExterior[index]) background[index] = 0;
  }

  let recoveredPixels = 0;
  for (let index = 0; index < total; index += 1) {
    if (original[index] && !background[index]) recoveredPixels += 1;
  }

  // A recovery pass should repair ambiguous material, not invert a scene. If
  // it grows implausibly large, keep the conservative boundary result.
  if (recoveredPixels > total * 0.32) {
    return { background: original, applied: false, recoveredPixels: 0 };
  }
  return {
    background,
    applied: recoveredPixels > 0,
    recoveredPixels,
  };
}

function markConnectedBackground(
  image: PixelImage,
  scores: Float32Array,
  edges: Float32Array,
  threshold: number,
  samples: readonly SamplePoint[],
  edgeProtection: number,
): Uint8Array {
  const { width, height } = image;
  const total = width * height;
  const background = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;
  const acceptance = threshold * 1.26;
  const localLimit = threshold * 0.62;
  const edgeGate = 7 + (100 - clamp(edgeProtection, 0, 100)) * 0.14;

  const enqueueSeed = (x: number, y: number, force = false, limitFactor = 1.08): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (background[index]) return;
    if (!force && (scores[index] ?? 255) > threshold * limitFactor) return;
    background[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  // Trust compact corner neighborhoods instead of every matching border pixel.
  // Subjects commonly touch the lower edge, making shirt/background colors an
  // unsafe seed even when their RGB values are nearly identical.
  const spanX = Math.max(1, Math.min(14, Math.round(width * 0.03)));
  const spanY = Math.max(1, Math.min(14, Math.round(height * 0.03)));
  for (let x = 0; x <= spanX; x += 1) {
    enqueueSeed(x, 0);
    enqueueSeed(width - 1 - x, 0);
    enqueueSeed(x, height - 1);
    enqueueSeed(width - 1 - x, height - 1);
  }
  for (let y = 1; y <= spanY; y += 1) {
    enqueueSeed(0, y);
    enqueueSeed(width - 1, y);
    enqueueSeed(0, height - 1 - y);
    enqueueSeed(width - 1, height - 1 - y);
  }

  // High-confidence side and top-edge pixels can seed separate backdrop
  // panels divided by decorative lines. The middle of the bottom edge stays
  // excluded because portraits and product photos commonly touch it.
  for (let x = 0; x < width; x += 1) enqueueSeed(x, 0, false, 0.72);
  for (let y = 1; y < height; y += 1) {
    enqueueSeed(0, y, false, 0.72);
    enqueueSeed(width - 1, y, false, 0.72);
  }
  const safeBottomWidth = Math.floor(width * 0.18);
  for (let x = 0; x < safeBottomWidth; x += 1) {
    enqueueSeed(x, height - 1, false, 0.72);
    enqueueSeed(width - 1 - x, height - 1, false, 0.72);
  }
  for (const sample of samples) {
    if (sample.kind === 'background') enqueueSeed(Math.round(sample.x), Math.round(sample.y), true);
  }

  if (tail === 0) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    const consider = (x: number, y: number): void => {
      const index = y * width + x;
      const score = scores[index] ?? 255;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    };
    for (let x = 0; x < width; x += 1) {
      consider(x, 0);
      consider(x, height - 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
      consider(0, y);
      consider(width - 1, y);
    }
    enqueueSeed(bestIndex % width, Math.floor(bestIndex / width), true);
  }

  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const currentOffset = index * 4;
    const currentR = image.data[currentOffset] ?? 0;
    const currentG = image.data[currentOffset + 1] ?? 0;
    const currentB = image.data[currentOffset + 2] ?? 0;

    const visit = (nextIndex: number): void => {
      if (background[nextIndex]) return;
      const score = scores[nextIndex] ?? 255;
      if (score > acceptance) return;
      const nextOffset = nextIndex * 4;
      const stepDistance = colorDistance(
        currentR,
        currentG,
        currentB,
        image.data[nextOffset] ?? 0,
        image.data[nextOffset + 1] ?? 0,
        image.data[nextOffset + 2] ?? 0,
      );
      const crossingEdge = Math.max(edges[index] ?? 0, edges[nextIndex] ?? 0);
      if (crossingEdge > edgeGate && score > threshold * 0.18) return;
      if (stepDistance > localLimit && score > threshold * 0.3) return;
      background[nextIndex] = 1;
      queue[tail] = nextIndex;
      tail += 1;
    };

    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }

  return background;
}

function recoverLargeBackgroundIslands(
  background: Uint8Array,
  scores: Float32Array,
  colorCosts: Float32Array,
  width: number,
  height: number,
  threshold: number,
): Uint8Array {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Uint32Array(total);
  const strictColorLimit = Math.max(4, Math.min(8, threshold * 0.14));
  const scoreLimit = threshold * 0.58;
  const minimumArea = Math.max(64, Math.round(total * 0.05));

  const isCandidate = (index: number): boolean =>
    !background[index] &&
    !visited[index] &&
    (colorCosts[index] ?? 255) <= strictColorLimit &&
    (scores[index] ?? 255) <= scoreLimit;

  for (let start = 0; start < total; start += 1) {
    if (!isCandidate(start)) continue;
    let head = 0;
    let tail = 0;
    let touchesUnsafeBottom = false;
    visited[start] = 1;
    queue[tail] = start;
    tail += 1;

    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (y === height - 1 && x > width * 0.18 && x < width * 0.82) {
        touchesUnsafeBottom = true;
      }

      const visit = (nextIndex: number): void => {
        if (!isCandidate(nextIndex)) return;
        visited[nextIndex] = 1;
        queue[tail] = nextIndex;
        tail += 1;
      };
      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }

    if (tail < minimumArea || touchesUnsafeBottom) continue;
    for (let position = 0; position < tail; position += 1) {
      const index = queue[position] ?? 0;
      background[index] = 1;
      scores[index] = Math.min(scores[index] ?? 255, threshold * 0.4);
    }
  }

  return background;
}

export function removeBackground(
  image: PixelImage,
  partialOptions: Partial<RemovalOptions> = {},
  guidanceInput: RemovalGuidanceInput = [],
): RemovalResult {
  const startedAt = now();
  const { width, height, pixelCount } = validateImage(image);
  const options = resolveOptions(partialOptions);
  const { samples, strokes } = resolveGuidance(guidanceInput, width, height);

  const model = buildBackgroundModel(image);
  const threshold = 12 + clamp(options.tolerance, 0, 100) * 0.72;
  const scores = new Float32Array(pixelCount);
  const edges = new Float32Array(pixelCount);
  const colorCosts = new Float32Array(pixelCount);
  const backgroundEvidence = new Float32Array(pixelCount);
  const markerRadius = Math.max(12, Math.min(width, height) * 0.09);

  for (let y = 0; y < height; y += 1) {
    const ny = height <= 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = width <= 1 ? 0 : x / (width - 1);
      const index = y * width + x;
      const offset = index * 4;
      const alpha = image.data[offset + 3] ?? 255;
      if (alpha < 8) {
        scores[index] = 0;
        continue;
      }

      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;
      let score = modelDistance(model, r, g, b, nx, ny);
      colorCosts[index] = score;
      backgroundEvidence[index] = backgroundReferenceDistance(
        model,
        r,
        g,
        b,
        nx,
        ny,
      );
      const edgeStrength = gradientAt(image, x, y);
      edges[index] = edgeStrength;
      score += edgeStrength * (clamp(options.edgeProtection, 0, 100) / 100) * 0.78;

      if (options.protectCenter) {
        const dx = (nx - 0.5) / 0.5;
        const dy = (ny - 0.5) / 0.5;
        const centerWeight = Math.exp(-(dx * dx + dy * dy) * 3.2);
        score += threshold * 0.52 * centerWeight;
      }

      score +=
        threshold *
        2.4 *
        sampleInfluence(samples, 'foreground', x, y, markerRadius);
      score -=
        threshold *
        0.65 *
        sampleInfluence(samples, 'background', x, y, markerRadius);
      scores[index] = Math.max(0, score);
    }
  }

  let background = markConnectedBackground(
    image,
    scores,
    edges,
    threshold,
    samples,
    options.edgeProtection,
  );
  let subjectRecoveryApplied = false;
  let recoveredPixels = 0;
  if (options.recoverPaleSubject) {
    const recovery = recoverPaleForeground(
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
  background = recoverLargeBackgroundIslands(
    background,
    scores,
    colorCosts,
    width,
    height,
    threshold,
  );
  background = applyBackgroundMarkerFloods(
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
    for (let index = 0; index < background.length; index += 1) {
      if ((scores[index] ?? 255) < threshold * 0.48) background[index] = 1;
    }
  }

  background = majorityCleanup(
    background,
    scores,
    width,
    height,
    threshold,
    Math.round(clamp(options.cleanup, 0, 3)),
  );

  if (strokes.length > 0) {
    const guidance = new Uint8Array(pixelCount);
    const workspace: StrokeRegionWorkspace = {
      strokeMarks: new Uint32Array(pixelCount),
      processedSeedMarks: new Uint32Array(pixelCount),
      floodMarks: new Uint32Array(pixelCount),
      floodDistances: new Uint32Array(pixelCount),
      queue: new Uint32Array(pixelCount),
      operationId: 0,
      componentId: 0,
    };

    // Corrections run after the global baseline is stable. Applying strokes
    // in array order makes each action directional: Remove can only add
    // background, while Keep can only restore foreground.
    for (const stroke of strokes) {
      workspace.operationId = (workspace.operationId + 1) >>> 0;
      if (workspace.operationId === 0) {
        workspace.strokeMarks.fill(0);
        workspace.processedSeedMarks.fill(0);
        workspace.operationId = 1;
      }
      const seedBounds = rasterizeStrokeIntoGuidance(
        stroke,
        guidance,
        workspace.strokeMarks,
        workspace.operationId,
        width,
        height,
      );
      background = applyStrokeRegionGuidance(
        image,
        background,
        scores,
        edges,
        guidance,
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

  for (const sample of samples) {
    if (sample.kind !== 'foreground') continue;
    const radius = markerRadius * 0.55;
    const minX = Math.max(0, Math.floor(sample.x - radius));
    const maxX = Math.min(width - 1, Math.ceil(sample.x + radius));
    const minY = Math.max(0, Math.floor(sample.y - radius));
    const maxY = Math.min(height - 1, Math.ceil(sample.y + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - sample.x;
        const dy = y - sample.y;
        if (dx * dx + dy * dy <= radius * radius) background[y * width + x] = 0;
      }
    }
  }

  const rawAlpha = new Uint8ClampedArray(pixelCount);
  for (let index = 0; index < rawAlpha.length; index += 1) {
    if (!background[index]) {
      rawAlpha[index] = 255;
      continue;
    }
    const transition = ((scores[index] ?? 0) - threshold * 0.68) / (threshold * 0.64);
    rawAlpha[index] = Math.round(smoothstep(transition) * 255);
  }
  const alpha = blurAlpha(
    rawAlpha,
    width,
    height,
    Math.round(clamp(options.feather, 0, 12)),
  );

  const output = new Uint8ClampedArray(pixelCount * 4);
  const mask = new Uint8ClampedArray(pixelCount * 4);
  let removed = 0;

  for (let y = 0; y < height; y += 1) {
    const ny = height <= 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = width <= 1 ? 0 : x / (width - 1);
      const index = y * width + x;
      const offset = index * 4;
      const sourceAlpha = (image.data[offset + 3] ?? 255) / 255;
      const finalAlpha = Math.round((alpha[index] ?? 255) * sourceAlpha);
      alpha[index] = finalAlpha;
      if (finalAlpha < 128) removed += 1;

      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;
      let outputR = r;
      let outputG = g;
      let outputB = b;
      const normalizedAlpha = finalAlpha / 255;

      if (normalizedAlpha > 0.06 && normalizedAlpha < 0.98) {
        const bg = nearestBackgroundColor(model, r, g, b, nx, ny);
        const safeAlpha = Math.max(0.22, normalizedAlpha);
        const correctedR = clamp((r - (1 - safeAlpha) * bg[0]) / safeAlpha, 0, 255);
        const correctedG = clamp((g - (1 - safeAlpha) * bg[1]) / safeAlpha, 0, 255);
        const correctedB = clamp((b - (1 - safeAlpha) * bg[2]) / safeAlpha, 0, 255);
        const mix = (1 - normalizedAlpha) * 0.72;
        outputR = r + (correctedR - r) * mix;
        outputG = g + (correctedG - g) * mix;
        outputB = b + (correctedB - b) * mix;
      }

      output[offset] = finalAlpha === 0 ? 0 : Math.round(outputR);
      output[offset + 1] = finalAlpha === 0 ? 0 : Math.round(outputG);
      output[offset + 2] = finalAlpha === 0 ? 0 : Math.round(outputB);
      output[offset + 3] = finalAlpha;

      mask[offset] = finalAlpha;
      mask[offset + 1] = finalAlpha;
      mask[offset + 2] = finalAlpha;
      mask[offset + 3] = 255;
    }
  }

  return {
    image: { width, height, data: output },
    mask: { width, height, data: mask },
    alpha,
    diagnostics: {
      algorithmVersion: ALGORITHM_VERSION,
      mode: model.plane.enabled
        ? 'gradient'
        : model.clusters.length > 1
          ? 'multi-color'
          : 'solid',
      colors: model.clusters.map(({ r, g, b, share }) => ({ r, g, b, share })),
      elapsedMs: now() - startedAt,
      backgroundNoise: model.noise,
      removedFraction: removed / pixelCount,
      recoveredFraction: recoveredPixels / pixelCount,
      subjectRecoveryApplied,
      threshold,
    },
  };
}
