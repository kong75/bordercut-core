import { describe, expect, it } from 'vitest';
import { removeBackground } from '../src/index';
import type { BrushStroke, PixelImage, RemovalOptions } from '../src/index';

const makeImage = (
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number, number?],
): PixelImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = colorAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return { width, height, data };
};

const alphaAt = (alpha: Uint8ClampedArray, width: number, x: number, y: number): number =>
  alpha[y * width + x] ?? 0;

describe('removeBackground', () => {
  it('separates a strongly colored subject from a flat background', () => {
    const image = makeImage(64, 64, (x, y) =>
      x >= 19 && x <= 44 && y >= 14 && y <= 50
        ? [34, 94, 210]
        : [244, 242, 237],
    );
    const result = removeBackground(image, {
      tolerance: 46,
      edgeProtection: 58,
      feather: 0,
      cleanup: 0,
      protectCenter: false,
      interiorBackground: true,
    });

    expect(alphaAt(result.alpha, 64, 0, 0)).toBeLessThan(10);
    expect(alphaAt(result.alpha, 64, 32, 32)).toBeGreaterThan(245);
    expect(result.diagnostics.removedFraction).toBeGreaterThan(0.6);
  });

  it('fits and removes a smooth background gradient', () => {
    const image = makeImage(80, 56, (x, y) => {
      if (x >= 26 && x <= 55 && y >= 13 && y <= 45) return [204, 68, 47];
      const t = x / 79;
      return [
        Math.round(230 - t * 28),
        Math.round(237 + t * 10),
        Math.round(252 - t * 18),
      ];
    });
    const result = removeBackground(image, {
      tolerance: 42,
      edgeProtection: 62,
      feather: 0,
      cleanup: 0,
      protectCenter: false,
      interiorBackground: true,
    });

    expect(result.diagnostics.mode).toBe('gradient');
    expect(alphaAt(result.alpha, 80, 8, 28)).toBeLessThan(15);
    expect(alphaAt(result.alpha, 80, 40, 28)).toBeGreaterThan(240);
  });

  it('can preserve or open an enclosed background-colored hole', () => {
    const image = makeImage(64, 64, (x, y) => {
      const inOuter = x >= 12 && x <= 51 && y >= 12 && y <= 51;
      const inHole = x >= 25 && x <= 38 && y >= 25 && y <= 38;
      return inOuter && !inHole ? [166, 54, 66] : [248, 248, 246];
    });
    const closed = removeBackground(image, {
      feather: 0,
      cleanup: 0,
      protectCenter: false,
      interiorBackground: false,
    });
    const opened = removeBackground(image, {
      feather: 0,
      cleanup: 0,
      protectCenter: false,
      interiorBackground: true,
    });

    expect(alphaAt(closed.alpha, 64, 31, 31)).toBeGreaterThan(245);
    expect(alphaAt(opened.alpha, 64, 31, 31)).toBeLessThan(10);
  });

  it('uses a foreground marker to protect an otherwise ambiguous region', () => {
    const image = makeImage(64, 64, () => [245, 245, 245]);
    const result = removeBackground(
      image,
      {
        feather: 0,
        cleanup: 0,
        protectCenter: false,
        interiorBackground: true,
      },
      [{ x: 32, y: 32, kind: 'foreground' }],
    );

    expect(alphaAt(result.alpha, 64, 32, 32)).toBe(255);
    expect(alphaAt(result.alpha, 64, 0, 0)).toBeLessThan(10);
  });

  it('uses a background marker to remove a locally enclosed color region', () => {
    const image = makeImage(64, 64, (x, y) => {
      const border = x >= 20 && x <= 43 && y >= 20 && y <= 43;
      const inside = x >= 23 && x <= 40 && y >= 23 && y <= 40;
      if (inside) return [181, 195, 205];
      if (border) return [35, 42, 52];
      return [245, 242, 235];
    });
    const withoutMarker = removeBackground(image, {
      feather: 0,
      cleanup: 0,
      protectCenter: false,
      interiorBackground: false,
    });
    const withMarker = removeBackground(
      image,
      {
        feather: 0,
        cleanup: 0,
        protectCenter: false,
        interiorBackground: false,
      },
      [{ x: 31, y: 31, kind: 'background' }],
    );

    expect(alphaAt(withoutMarker.alpha, 64, 31, 31)).toBeGreaterThan(245);
    expect(alphaAt(withMarker.alpha, 64, 31, 31)).toBeLessThan(10);
  });

  it('does not seed a light subject that touches the middle of the bottom edge', () => {
    const image = makeImage(96, 96, (x, y) => {
      const face = (x - 48) ** 2 / 17 ** 2 + (y - 34) ** 2 / 24 ** 2 <= 1;
      const shirt = x >= 38 && x <= 58 && y >= 53;
      const jacket = y >= 52 && (x < 38 || x > 58);
      const flower = x >= 73 && x <= 79 && y >= 68 && y <= 76;
      if (face) return [224, 178, 150];
      if (shirt) return [248, 246, 240];
      if (flower) return [252, 251, 247];
      if (jacket) return [24, 25, 29];
      return [242, 238, 230];
    });
    const result = removeBackground(image, {
      tolerance: 46,
      edgeProtection: 58,
      feather: 0,
      cleanup: 0,
      protectCenter: true,
      interiorBackground: false,
    });

    expect(alphaAt(result.alpha, 96, 48, 34)).toBeGreaterThan(245);
    expect(alphaAt(result.alpha, 96, 48, 90)).toBeGreaterThan(245);
    expect(alphaAt(result.alpha, 96, 10, 90)).toBeGreaterThan(245);
    expect(alphaAt(result.alpha, 96, 76, 72)).toBeGreaterThan(245);
    expect(alphaAt(result.alpha, 96, 4, 4)).toBeLessThan(10);
  });

  it('recovers a large enclosed panel that closely matches the background', () => {
    const image = makeImage(96, 72, (x, y) => {
      const border = x >= 12 && x <= 52 && y >= 14 && y <= 55;
      const inside = x >= 15 && x <= 49 && y >= 17 && y <= 52;
      if (inside) return [242, 238, 230];
      if (border) return [142, 126, 108];
      return [242, 238, 230];
    });
    const result = removeBackground(image, {
      tolerance: 46,
      edgeProtection: 76,
      feather: 0,
      cleanup: 0,
      protectCenter: false,
      interiorBackground: false,
    });

    expect(alphaAt(result.alpha, 96, 30, 34)).toBeLessThan(10);
  });

  it('recovers pale subject material connected to the lower background', () => {
    const image = makeImage(128, 128, (x, y) => {
      const subject = x >= 12 && x <= 115 && y >= 12 && y <= 111;
      const paleChannel = x >= 61 && x <= 66 && y >= 70 && y <= 111;
      if (paleChannel) return [239, 236, 228];
      if (subject) return [180, 170, 158];
      return [243, 240, 232];
    });
    const withoutRecovery = removeBackground(image, {
      tolerance: 46,
      edgeProtection: 58,
      feather: 0,
      cleanup: 0,
      protectCenter: true,
      recoverPaleSubject: false,
      interiorBackground: false,
    });
    const withRecovery = removeBackground(image, {
      tolerance: 46,
      edgeProtection: 58,
      feather: 0,
      cleanup: 0,
      protectCenter: true,
      recoverPaleSubject: true,
      interiorBackground: false,
    });

    expect(alphaAt(withoutRecovery.alpha, 128, 63, 92)).toBeLessThan(10);
    expect(alphaAt(withRecovery.alpha, 128, 63, 92)).toBeGreaterThan(245);
    expect(alphaAt(withRecovery.alpha, 128, 63, 120)).toBeLessThan(10);
    expect(withRecovery.diagnostics.recoveredFraction).toBeGreaterThan(0);
    expect(withRecovery.diagnostics.subjectRecoveryApplied).toBe(true);
  });

  it('keeps a genuine high-contrast opening connected to the outside', () => {
    const image = makeImage(128, 128, (x, y) => {
      const subject = x >= 12 && x <= 115 && y >= 12;
      const opening = x >= 54 && x <= 73 && y >= 55;
      return subject && !opening ? [72, 82, 94] : [243, 240, 232];
    });
    const result = removeBackground(image, {
      tolerance: 46,
      edgeProtection: 58,
      feather: 0,
      cleanup: 0,
      protectCenter: true,
      recoverPaleSubject: true,
      interiorBackground: false,
    });

    expect(alphaAt(result.alpha, 128, 40, 86)).toBeGreaterThan(245);
    expect(alphaAt(result.alpha, 128, 63, 96)).toBeLessThan(10);
  });

  it('rejects invalid image dimensions and buffers at the public boundary', () => {
    const data = new Uint8ClampedArray(16);
    for (const width of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => removeBackground({ width, height: 1, data })).toThrow(
        'positive safe integers',
      );
    }

    expect(() =>
      removeBackground({ width: 2, height: 2, data: new Uint8ClampedArray(15) }),
    ).toThrow('at least 16 RGBA bytes');
    expect(() =>
      removeBackground(
        { width: 1, height: 1, data: new Uint8Array(4) } as unknown as PixelImage,
      ),
    ).toThrow('Uint8ClampedArray');
  });

  it('rejects invalid options, unknown options, and out-of-bounds correction samples', () => {
    const image = makeImage(8, 8, () => [240, 240, 240]);

    expect(() => removeBackground(image, { tolerance: Number.NaN })).toThrow(
      'finite number',
    );
    expect(() => removeBackground(image, { feather: 13 })).toThrow('from 0 through 12');
    expect(() => removeBackground(image, { cleanup: 1.5 })).toThrow('must be an integer');
    expect(() =>
      removeBackground(image, { unsupported: true } as Partial<RemovalOptions>),
    ).toThrow('Unknown removal option');
    expect(() =>
      removeBackground(image, {}, [{ x: 8, y: 4, kind: 'foreground' }]),
    ).toThrow('outside the image bounds');
  });

  it('is deterministic, does not mutate the input, and ignores trailing input bytes', () => {
    const base = makeImage(24, 20, (x, y) =>
      x >= 7 && x <= 16 && y >= 4 && y <= 15 ? [50, 90, 190] : [245, 243, 238],
    );
    const data = new Uint8ClampedArray(base.data.length + 8);
    data.set(base.data);
    data.fill(173, base.data.length);
    const image = { ...base, data };
    const before = new Uint8ClampedArray(data);

    const first = removeBackground(image);
    const second = removeBackground(image);

    expect(data).toEqual(before);
    expect(first.alpha).toEqual(second.alpha);
    expect(first.image.data).toEqual(second.image.data);
    expect(first.image.data).toHaveLength(base.width * base.height * 4);
    expect(first.mask.data).toHaveLength(base.width * base.height * 4);
  });

  it('grows background guidance through a connected, color-similar region', () => {
    const image = makeImage(48, 32, (x, y) => {
      if (x >= 12 && x <= 35 && y >= 10 && y <= 21) return [120, 190, 120];
      if (x >= 5 && x <= 42 && y >= 4 && y <= 27) return [35, 65, 150];
      return [246, 243, 236];
    });
    const stroke: BrushStroke = {
      kind: 'background',
      radius: 1,
      points: [
        { x: 16, y: 15 },
        { x: 20, y: 15 },
      ],
    };
    const result = removeBackground(
      image,
      { feather: 0, cleanup: 0, protectCenter: false },
      { strokes: [stroke] },
    );

    expect(alphaAt(result.alpha, 48, 32, 18)).toBe(0);
    expect(alphaAt(result.alpha, 48, 8, 15)).toBe(255);
    expect(alphaAt(result.alpha, 48, 0, 0)).toBeLessThan(10);
  });

  it('limits smart guidance to a nearby region even across a matching-color bridge', () => {
    const image = makeImage(160, 60, (x, y) => {
      const nearPatch = x >= 15 && x <= 45 && y >= 18 && y <= 42;
      const farPatch = x >= 115 && x <= 145 && y >= 18 && y <= 42;
      const matchingBridge = x > 45 && x < 115 && y === 30;
      if (nearPatch || farPatch || matchingBridge) return [82, 174, 112];
      if (x >= 5 && x <= 154 && y >= 5 && y <= 54) return [38, 57, 104];
      return [246, 243, 236];
    });
    const result = removeBackground(
      image,
      { feather: 0, cleanup: 0, protectCenter: false },
      {
        strokes: [
          {
            kind: 'background',
            radius: 1,
            points: [
              { x: 25, y: 30 },
              { x: 30, y: 30 },
            ],
          },
        ],
      },
    );

    expect(alphaAt(result.alpha, 160, 40, 30)).toBe(0);
    expect(alphaAt(result.alpha, 160, 130, 30)).toBe(255);
  });

  it('never raises alpha when another remove stroke is appended', () => {
    const regions: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      color: [number, number, number];
    }> = [
      { x: 49, y: 28, width: 6, height: 24, color: [188, 26, 96] },
      { x: 50, y: 36, width: 20, height: 7, color: [215, 218, 223] },
      { x: 5, y: 44, width: 19, height: 11, color: [134, 131, 94] },
      { x: 15, y: 34, width: 8, height: 8, color: [208, 208, 214] },
      { x: 57, y: 17, width: 8, height: 18, color: [171, 172, 180] },
      { x: 22, y: 3, width: 13, height: 13, color: [203, 211, 213] },
      { x: 16, y: 27, width: 16, height: 18, color: [206, 201, 229] },
    ];
    const image = makeImage(72, 64, (x, y) => {
      const progress = x / 71;
      let color: [number, number, number] = [
        Math.round(225 - progress),
        Math.round(225 + progress * 5),
        Math.round(240 - progress * 9),
      ];
      for (const region of regions) {
        if (
          x >= region.x &&
          x < region.x + region.width &&
          y >= region.y &&
          y < region.y + region.height
        ) {
          color = region.color;
        }
      }
      return color;
    });
    const first: BrushStroke = {
      kind: 'background',
      radius: 2,
      points: [{ x: 52, y: 40 }],
    };
    const second: BrushStroke = {
      kind: 'background',
      radius: 2,
      points: [{ x: 60, y: 39 }],
    };
    const options: RemovalOptions = {
      tolerance: 46,
      edgeProtection: 58,
      feather: 2,
      cleanup: 1,
      protectCenter: true,
      recoverPaleSubject: true,
      interiorBackground: false,
    };
    const before = removeBackground(image, options, { strokes: [first] });
    const after = removeBackground(image, options, { strokes: [first, second] });
    const increases: Array<{ index: number; before: number; after: number }> = [];

    for (let index = 0; index < before.alpha.length; index += 1) {
      const beforeAlpha = before.alpha[index] ?? 0;
      const afterAlpha = after.alpha[index] ?? 0;
      if (afterAlpha > beforeAlpha && increases.length < 10) {
        increases.push({ index, before: beforeAlpha, after: afterAlpha });
      }
    }

    expect(increases).toEqual([]);
  });

  it('never lowers alpha when a keep stroke is appended', () => {
    const image = makeImage(72, 64, () => [246, 243, 236]);
    const remove: BrushStroke = {
      kind: 'background',
      radius: 2,
      points: [{ x: 58, y: 36 }],
    };
    const keep: BrushStroke = {
      kind: 'foreground',
      radius: 2,
      points: [{ x: 18, y: 28 }],
    };
    const options: Partial<RemovalOptions> = {
      feather: 2,
      cleanup: 1,
      protectCenter: false,
      recoverPaleSubject: false,
    };
    const before = removeBackground(image, options, { strokes: [remove] });
    const after = removeBackground(image, options, { strokes: [remove, keep] });
    const decreases: Array<{ index: number; before: number; after: number }> = [];
    let increased = 0;

    for (let index = 0; index < before.alpha.length; index += 1) {
      const beforeAlpha = before.alpha[index] ?? 0;
      const afterAlpha = after.alpha[index] ?? 0;
      if (afterAlpha < beforeAlpha && decreases.length < 10) {
        decreases.push({ index, before: beforeAlpha, after: afterAlpha });
      }
      if (afterAlpha > beforeAlpha) increased += 1;
    }

    expect(decreases).toEqual([]);
    expect(increased).toBeGreaterThan(0);
  });

  it('grows foreground guidance through a connected, color-similar region', () => {
    const image = makeImage(48, 32, (x, y) =>
      x >= 10 && x <= 37 && y >= 7 && y <= 24
        ? [225, 220, 210]
        : [246, 243, 236],
    );
    const result = removeBackground(
      image,
      {
        feather: 0,
        cleanup: 0,
        protectCenter: false,
        recoverPaleSubject: false,
        interiorBackground: false,
      },
      {
        strokes: [
          {
            kind: 'foreground',
            radius: 1,
            points: [
              { x: 19, y: 15 },
              { x: 23, y: 15 },
            ],
          },
        ],
      },
    );

    expect(alphaAt(result.alpha, 48, 34, 20)).toBe(255);
    expect(alphaAt(result.alpha, 48, 5, 15)).toBe(0);

    const transparent = makeImage(8, 8, () => [246, 243, 236, 0]);
    const transparentResult = removeBackground(
      transparent,
      { feather: 0 },
      {
        strokes: [
          { kind: 'foreground', radius: 2, points: [{ x: 4, y: 4 }] },
        ],
      },
    );
    expect(alphaAt(transparentResult.alpha, 8, 4, 4)).toBe(0);
  });

  it('respects remove and keep guidance where strokes overlap', () => {
    const image = makeImage(32, 24, (x, y) =>
      x >= 4 && x <= 27 && y >= 4 && y <= 19 ? [42, 82, 176] : [246, 243, 236],
    );
    const keepLast = removeBackground(
      image,
      { feather: 0, cleanup: 0, protectCenter: false },
      {
        strokes: [
          {
            kind: 'background',
            radius: 2,
            points: [
              { x: 7, y: 12 },
              { x: 24, y: 12 },
            ],
          },
          {
            kind: 'foreground',
            radius: 2,
            points: [{ x: 16, y: 12 }],
          },
        ],
      },
    );

    expect(alphaAt(keepLast.alpha, 32, 9, 12)).toBe(0);
    expect(alphaAt(keepLast.alpha, 32, 16, 12)).toBe(255);

    const removeLast = removeBackground(
      image,
      { feather: 0, cleanup: 0, protectCenter: false },
      {
        strokes: [
          {
            kind: 'foreground',
            radius: 2,
            points: [{ x: 16, y: 12 }],
          },
          {
            kind: 'background',
            radius: 2,
            points: [{ x: 16, y: 12 }],
          },
        ],
      },
    );

    expect(alphaAt(removeLast.alpha, 32, 16, 12)).toBe(0);
  });

  it('validates brush stroke shape, radius, points, and guidance fields', () => {
    const image = makeImage(16, 12, () => [246, 243, 236]);

    expect(() =>
      removeBackground(image, {}, {
        strokes: [{ kind: 'background', radius: 0, points: [{ x: 4, y: 4 }] }],
      }),
    ).toThrow('radius must be greater than 0');
    expect(() =>
      removeBackground(image, {}, {
        strokes: [{ kind: 'background', radius: 2, points: [] }],
      }),
    ).toThrow('at least one point');
    expect(() =>
      removeBackground(image, {}, {
        strokes: [{ kind: 'foreground', radius: 2, points: [{ x: 16, y: 6 }] }],
      }),
    ).toThrow('outside the image bounds');
    expect(() =>
      removeBackground(
        image,
        {},
        { unsupported: [] } as unknown as { strokes: BrushStroke[] },
      ),
    ).toThrow('Unknown removal guidance field');
  });
});
