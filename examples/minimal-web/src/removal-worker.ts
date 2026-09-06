import { removeBackground } from '@bordercut/core';
import type { BrushStroke, PixelImage, RemovalResult } from '@bordercut/core';

interface WorkerRequest {
  image: PixelImage;
  strokes: BrushStroke[];
}

type WorkerResponse =
  | { ok: true; result: RemovalResult }
  | { ok: false; error: string };

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  close(): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  try {
    const result = removeBackground(event.data.image, {}, { strokes: event.data.strokes });
    scope.postMessage(
      { ok: true, result },
      [
        result.image.data.buffer as ArrayBuffer,
        result.mask.data.buffer as ArrayBuffer,
        result.alpha.buffer as ArrayBuffer,
      ],
    );
  } catch (error) {
    scope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Background removal failed.',
    });
  } finally {
    scope.close();
  }
});
