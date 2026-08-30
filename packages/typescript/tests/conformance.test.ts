import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import fixtures from '../../../fixtures/v1/cases.json';
import fixtureSchema from '../../../spec/fixture.schema.json';
import optionsSchema from '../../../spec/options.schema.json';
import { describe, expect, it } from 'vitest';
import { ALGORITHM_VERSION, removeBackground } from '../src/index';
import type { BrushStroke, PixelImage, RemovalOptions, SamplePoint } from '../src/index';

type Rgba = [number, number, number, number];

interface FixtureGradient {
  type: 'linear-gradient';
  axis: 'x' | 'y';
  from: Rgba;
  to: Rgba;
}

interface FixtureRectRegion {
  shape: 'rect';
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  color: Rgba;
}

interface FixtureEllipseRegion {
  shape: 'ellipse';
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  color: Rgba;
}

type FixtureRegion = FixtureRectRegion | FixtureEllipseRegion;

interface FixtureAssertion {
  x: number;
  y: number;
  alphaMin?: number;
  alphaMax?: number;
}

interface FixtureDiagnostics {
  mode?: 'solid' | 'multi-color' | 'gradient';
  subjectRecoveryApplied?: boolean;
  removedFractionMin?: number;
  removedFractionMax?: number;
  recoveredFractionMin?: number;
}

interface FixtureCase {
  id: string;
  referenceAlphaSha256?: string;
  width: number;
  height: number;
  background: Rgba | FixtureGradient;
  regions: FixtureRegion[];
  samples?: SamplePoint[];
  strokes?: BrushStroke[];
  options: RemovalOptions;
  assertions: FixtureAssertion[];
  diagnostics?: FixtureDiagnostics;
}

const paint = (
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: readonly number[],
): void => {
  const offset = (y * width + x) * 4;
  data[offset] = color[0] ?? 0;
  data[offset + 1] = color[1] ?? 0;
  data[offset + 2] = color[2] ?? 0;
  data[offset + 3] = color[3] ?? 255;
};

const backgroundAt = (fixture: FixtureCase, x: number, y: number): Rgba => {
  if (Array.isArray(fixture.background)) return fixture.background;
  const gradient = fixture.background;
  const span = gradient.axis === 'x' ? fixture.width - 1 : fixture.height - 1;
  const position = gradient.axis === 'x' ? x : y;
  const progress = span === 0 ? 0 : position / span;
  return gradient.from.map((channel, index) =>
    Math.round(channel + ((gradient.to[index] ?? channel) - channel) * progress),
  ) as Rgba;
};

const contains = (region: FixtureRegion, x: number, y: number): boolean => {
  if (region.shape === 'rect') {
    return x >= region.xMin && x <= region.xMax && y >= region.yMin && y <= region.yMax;
  }
  const dx = (x - region.centerX) / region.radiusX;
  const dy = (y - region.centerY) / region.radiusY;
  return dx * dx + dy * dy <= 1;
};

const makeFixtureImage = (fixture: FixtureCase): PixelImage => {
  const data = new Uint8ClampedArray(fixture.width * fixture.height * 4);
  for (let y = 0; y < fixture.height; y += 1) {
    for (let x = 0; x < fixture.width; x += 1) {
      paint(data, fixture.width, x, y, backgroundAt(fixture, x, y));
    }
  }
  for (const region of fixture.regions) {
    for (let y = 0; y < fixture.height; y += 1) {
      for (let x = 0; x < fixture.width; x += 1) {
        if (contains(region, x, y)) paint(data, fixture.width, x, y, region.color);
      }
    }
  }
  return { width: fixture.width, height: fixture.height, data };
};

describe('algorithm v1 shared fixtures', () => {
  it('matches the published fixture and option schemas', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    ajv.addSchema(optionsSchema);
    const validate = ajv.compile(fixtureSchema);
    const valid = validate(fixtures);

    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  expect(fixtures.algorithmVersion).toBe(ALGORITHM_VERSION);

  for (const rawFixture of fixtures.cases) {
    const fixture = rawFixture as FixtureCase;
    it(fixture.id, () => {
      const result = removeBackground(
        makeFixtureImage(fixture),
        fixture.options,
        { samples: fixture.samples, strokes: fixture.strokes },
      );

      expect(result.diagnostics.algorithmVersion).toBe(ALGORITHM_VERSION);
      if (fixture.referenceAlphaSha256 !== undefined) {
        const alphaSha256 = createHash('sha256').update(result.alpha).digest('hex');
        expect(alphaSha256).toBe(fixture.referenceAlphaSha256);
      }
      for (const assertion of fixture.assertions) {
        const alpha = result.alpha[assertion.y * fixture.width + assertion.x] ?? 0;
        if (assertion.alphaMin !== undefined) {
          expect(alpha, `${assertion.x},${assertion.y}`).toBeGreaterThanOrEqual(
            assertion.alphaMin,
          );
        }
        if (assertion.alphaMax !== undefined) {
          expect(alpha, `${assertion.x},${assertion.y}`).toBeLessThanOrEqual(
            assertion.alphaMax,
          );
        }
      }

      const expected = fixture.diagnostics;
      if (!expected) return;
      if (expected.mode !== undefined) expect(result.diagnostics.mode).toBe(expected.mode);
      if (expected.subjectRecoveryApplied !== undefined) {
        expect(result.diagnostics.subjectRecoveryApplied).toBe(
          expected.subjectRecoveryApplied,
        );
      }
      if (expected.removedFractionMin !== undefined) {
        expect(result.diagnostics.removedFraction).toBeGreaterThanOrEqual(
          expected.removedFractionMin,
        );
      }
      if (expected.removedFractionMax !== undefined) {
        expect(result.diagnostics.removedFraction).toBeLessThanOrEqual(
          expected.removedFractionMax,
        );
      }
      if (expected.recoveredFractionMin !== undefined) {
        expect(result.diagnostics.recoveredFraction).toBeGreaterThanOrEqual(
          expected.recoveredFractionMin,
        );
      }
    });
  }
});
