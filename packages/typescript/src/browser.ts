import { removeBackground } from './engine.js';
import type {
  PixelImage,
  RemovalGuidanceInput,
  RemovalOptions,
  RemovalResult,
} from './types.js';

type CanvasSurface = OffscreenCanvas | HTMLCanvasElement;
type CanvasContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface BrowserRemovalResult extends RemovalResult {
  /** Transparent PNG encoded by the browser. */
  blob: Blob;
}

const createCanvas = (width: number, height: number): CanvasSurface => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('Image decoding requires OffscreenCanvas or an HTML canvas environment.');
};

const getContext = (canvas: CanvasSurface, readFrequently = false): CanvasContext => {
  const context = canvas.getContext('2d', { willReadFrequently: readFrequently }) as CanvasContext | null;
  if (!context) throw new Error('A two-dimensional canvas context is unavailable.');
  return context;
};

const loadImageElement = async (blob: Blob): Promise<HTMLImageElement> => {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new Error('This browser cannot decode image blobs.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => reject(new Error('The image blob could not be decoded.')), {
        once: true,
      });
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Decode a browser image Blob into BorderCut's dependency-free RGBA contract. */
export const decodeImageBlob = async (blob: Blob): Promise<PixelImage> => {
  if (typeof Blob === 'undefined' || !(blob instanceof Blob)) {
    throw new TypeError('The browser adapter expects an image Blob or File.');
  }

  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let close: (() => void) | undefined;

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    close = () => bitmap.close();
  } else {
    const image = await loadImageElement(blob);
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
  }

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    close?.();
    throw new RangeError('The decoded image has invalid dimensions.');
  }

  try {
    const canvas = createCanvas(width, height);
    const context = getContext(canvas, true);
    context.drawImage(source, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);
    return {
      width,
      height,
      data: new Uint8ClampedArray(imageData.data),
    };
  } finally {
    close?.();
  }
};

/** Encode a BorderCut RGBA image as a transparent PNG using browser canvas APIs. */
export const encodePngBlob = async (image: PixelImage): Promise<Blob> => {
  if (
    !image ||
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    !(image.data instanceof Uint8ClampedArray) ||
    image.data.length < image.width * image.height * 4
  ) {
    throw new TypeError('PNG encoding expects a valid RGBA PixelImage.');
  }

  const canvas = createCanvas(image.width, image.height);
  const context = getContext(canvas);
  const imageData = context.createImageData(image.width, image.height);
  imageData.data.set(image.data.subarray(0, image.width * image.height * 4));
  context.putImageData(imageData, 0, 0);

  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob: Blob | null) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser failed to encode the transparent PNG.'));
    }, 'image/png');
  });
};

/** Decode, remove the background, and encode a transparent PNG entirely in the browser. */
export const removeBackgroundFromBlob = async (
  blob: Blob,
  options: Partial<RemovalOptions> = {},
  guidance: RemovalGuidanceInput = [],
): Promise<BrowserRemovalResult> => {
  const source = await decodeImageBlob(blob);
  const result = removeBackground(source, options, guidance);
  const output = await encodePngBlob(result.image);
  return { ...result, blob: output };
};
