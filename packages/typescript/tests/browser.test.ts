import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeImageBlob,
  encodePngBlob,
  removeBackgroundFromBlob,
} from '../src/browser.js';

class FakeContext {
  readonly decoded = new Uint8ClampedArray([
    245, 243, 238, 255,
    245, 243, 238, 255,
    245, 243, 238, 255,
    245, 243, 238, 255,
  ]);

  encoded?: Uint8ClampedArray;

  drawImage(): void {}

  getImageData(): ImageData {
    return { width: 2, height: 2, colorSpace: 'srgb', data: this.decoded } as ImageData;
  }

  createImageData(width: number, height: number): ImageData {
    return {
      width,
      height,
      colorSpace: 'srgb',
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }

  putImageData(imageData: ImageData): void {
    this.encoded = new Uint8ClampedArray(imageData.data);
  }
}

class FakeOffscreenCanvas {
  static instances: FakeOffscreenCanvas[] = [];

  readonly context = new FakeContext();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    FakeOffscreenCanvas.instances.push(this);
  }

  getContext(): FakeContext {
    return this.context;
  }

  async convertToBlob(): Promise<Blob> {
    return new Blob(['png'], { type: 'image/png' });
  }
}

describe('browser adapter', () => {
  const close = vi.fn();

  beforeEach(() => {
    FakeOffscreenCanvas.instances = [];
    close.mockClear();
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2, height: 2, close })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes blobs into copied RGBA pixels', async () => {
    const image = await decodeImageBlob(new Blob(['image']));

    expect(image).toEqual({
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        245, 243, 238, 255,
        245, 243, 238, 255,
        245, 243, 238, 255,
        245, 243, 238, 255,
      ]),
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('encodes RGBA pixels as PNG', async () => {
    const data = new Uint8ClampedArray([255, 10, 20, 128]);
    const blob = await encodePngBlob({ width: 1, height: 1, data });

    expect(blob.type).toBe('image/png');
    expect(FakeOffscreenCanvas.instances.at(-1)?.context.encoded).toEqual(data);
  });

  it('provides a Blob-to-transparent-PNG convenience operation', async () => {
    const result = await removeBackgroundFromBlob(new Blob(['image']), { feather: 0 });

    expect(result.image.width).toBe(2);
    expect(result.alpha).toEqual(new Uint8ClampedArray(4));
    expect(result.blob.type).toBe('image/png');
  });

  it('rejects invalid adapter inputs', async () => {
    await expect(decodeImageBlob('not a blob' as unknown as Blob)).rejects.toThrow(TypeError);
    await expect(
      encodePngBlob({ width: 1, height: 1, data: new Uint8ClampedArray(3) }),
    ).rejects.toThrow(TypeError);
  });
});
