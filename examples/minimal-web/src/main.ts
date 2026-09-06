import './styles.css';
import type {
  BrushStroke,
  PixelImage,
  RemovalResult,
  SampleKind,
  StrokePoint,
} from '@bordercut/core';

type WorkerResponse =
  | { ok: true; result: RemovalResult }
  | { ok: false; error: string };

const element = <T extends Element>(selector: string): T => {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing element: ${selector}`);
  return value;
};

const fileInput = element<HTMLInputElement>('#file');
const sampleButton = element<HTMLButtonElement>('#sample');
const toolInput = element<HTMLSelectElement>('#tool');
const radiusInput = element<HTMLInputElement>('#radius');
const radiusValue = element<HTMLOutputElement>('#radiusValue');
const undoButton = element<HTMLButtonElement>('#undo');
const clearButton = element<HTMLButtonElement>('#clear');
const downloadButton = element<HTMLButtonElement>('#download');
const status = element<HTMLElement>('#status');
const stage = element<HTMLElement>('#stage');
const resultCanvas = element<HTMLCanvasElement>('#result');
const guideCanvas = element<HTMLCanvasElement>('#guide');
const resultContext = resultCanvas.getContext('2d');
const guideContext = guideCanvas.getContext('2d');

if (!resultContext || !guideContext) throw new Error('Canvas is unavailable.');

let source: PixelImage | undefined;
let sourceName = 'bordercut-result';
let strokes: BrushStroke[] = [];
let activePoints: StrokePoint[] | undefined;
let activePointer: number | undefined;
let activeWorker: Worker | undefined;
let isProcessing = false;

const updateButtons = (): void => {
  undoButton.disabled = strokes.length === 0;
  clearButton.disabled = strokes.length === 0;
  downloadButton.disabled = !source || isProcessing;
};

const clearGuide = (): void => {
  guideContext.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
};

const process = (): void => {
  if (!source) return;
  activeWorker?.terminate();
  const worker = new Worker(new URL('./removal-worker.ts', import.meta.url), { type: 'module' });
  activeWorker = worker;
  isProcessing = true;
  status.textContent = 'Processing in a Web Worker…';
  updateButtons();

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    if (worker !== activeWorker) return;
    activeWorker = undefined;
    isProcessing = false;
    worker.terminate();

    if (!event.data.ok) {
      status.textContent = event.data.error;
      updateButtons();
      return;
    }

    const { result } = event.data;
    resultContext.putImageData(
      new ImageData(
        new Uint8ClampedArray(result.image.data),
        result.image.width,
        result.image.height,
      ),
      0,
      0,
    );
    clearGuide();
    status.textContent = `Applied ${strokes.length} correction${strokes.length === 1 ? '' : 's'} in ${Math.round(result.diagnostics.elapsedMs)} ms without blocking the page.`;
    updateButtons();
  });

  worker.addEventListener('error', (event) => {
    if (worker !== activeWorker) return;
    activeWorker = undefined;
    isProcessing = false;
    worker.terminate();
    status.textContent = event.message || 'Background removal failed in the Web Worker.';
    updateButtons();
  });

  const workerImage: PixelImage = {
    width: source.width,
    height: source.height,
    data: new Uint8ClampedArray(source.data),
  };
  worker.postMessage(
    { image: workerImage, strokes },
    [workerImage.data.buffer as ArrayBuffer],
  );
};

const pointFromEvent = (event: PointerEvent): StrokePoint => {
  const bounds = guideCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(guideCanvas.width - 1, ((event.clientX - bounds.left) / bounds.width) * guideCanvas.width)),
    y: Math.max(0, Math.min(guideCanvas.height - 1, ((event.clientY - bounds.top) / bounds.height) * guideCanvas.height)),
  };
};

const drawActiveGuide = (): void => {
  clearGuide();
  const first = activePoints?.[0];
  if (!first || !activePoints) return;
  guideContext.beginPath();
  guideContext.moveTo(first.x, first.y);
  for (const point of activePoints.slice(1)) guideContext.lineTo(point.x, point.y);
  guideContext.lineCap = 'round';
  guideContext.lineJoin = 'round';
  guideContext.lineWidth = Number(radiusInput.value) * 2;
  guideContext.strokeStyle = toolInput.value === 'background' ? '#7c3aedcc' : '#059669cc';
  if (activePoints.length === 1) guideContext.lineTo(first.x + 0.01, first.y);
  guideContext.stroke();
};

const loadSource = (image: PixelImage, name: string): void => {
  source = image;
  sourceName = name;
  strokes = [];
  resultCanvas.width = source.width;
  resultCanvas.height = source.height;
  guideCanvas.width = source.width;
  guideCanvas.height = source.height;
  stage.hidden = false;
  process();
};

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const bitmap = await createImageBitmap(file);
  const decodeCanvas = document.createElement('canvas');
  decodeCanvas.width = bitmap.width;
  decodeCanvas.height = bitmap.height;
  const decodeContext = decodeCanvas.getContext('2d', { willReadFrequently: true });
  if (!decodeContext) throw new Error('Canvas is unavailable.');
  decodeContext.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = decodeContext.getImageData(0, 0, decodeCanvas.width, decodeCanvas.height);
  loadSource(
    { width: imageData.width, height: imageData.height, data: imageData.data },
    file.name.replace(/\.[^.]+$/, '') || 'bordercut-result',
  );
});

sampleButton.addEventListener('click', () => {
  const width = 240;
  const height = 180;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = 246 - Math.round((x / width) * 8);
      data[index + 1] = 243 - Math.round((y / height) * 6);
      data[index + 2] = 237 + Math.round((x / width) * 5);
      data[index + 3] = 255;

      const normalizedX = (x - width / 2) / 58;
      const normalizedY = (y - height / 2) / 68;
      if (normalizedX * normalizedX + normalizedY * normalizedY <= 1) {
        data[index] = 31;
        data[index + 1] = 78 + Math.round((y / height) * 24);
        data[index + 2] = 148 + Math.round((x / width) * 30);
      }
    }
  }
  loadSource({ width, height, data }, 'bordercut-sample');
});

guideCanvas.addEventListener('pointerdown', (event) => {
  if (!source || activePointer !== undefined) return;
  activePointer = event.pointerId;
  activePoints = [pointFromEvent(event)];
  guideCanvas.setPointerCapture(event.pointerId);
  drawActiveGuide();
});

guideCanvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer || !activePoints) return;
  const next = pointFromEvent(event);
  const previous = activePoints.at(-1);
  if (!previous || Math.hypot(next.x - previous.x, next.y - previous.y) >= 1) {
    activePoints.push(next);
    drawActiveGuide();
  }
});

const finishStroke = (event: PointerEvent): void => {
  if (event.pointerId !== activePointer || !activePoints) return;
  strokes.push({
    kind: toolInput.value as SampleKind,
    radius: Number(radiusInput.value),
    points: activePoints,
  });
  activePoints = undefined;
  activePointer = undefined;
  process();
};

guideCanvas.addEventListener('pointerup', finishStroke);
guideCanvas.addEventListener('pointercancel', (event) => {
  if (event.pointerId !== activePointer) return;
  activePoints = undefined;
  activePointer = undefined;
  clearGuide();
});

radiusInput.addEventListener('input', () => {
  radiusValue.value = `${radiusInput.value} px`;
});

undoButton.addEventListener('click', () => {
  strokes.pop();
  process();
});

clearButton.addEventListener('click', () => {
  strokes = [];
  process();
});

downloadButton.addEventListener('click', () => {
  resultCanvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    link.download = `${sourceName}-transparent.png`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, 'image/png');
});

updateButtons();
