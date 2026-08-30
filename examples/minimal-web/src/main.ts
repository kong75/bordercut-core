import './styles.css';
import { removeBackground } from '@bordercut/core';
import type { BrushStroke, PixelImage, SampleKind, StrokePoint } from '@bordercut/core';

const element = <T extends Element>(selector: string): T => {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing element: ${selector}`);
  return value;
};

const fileInput = element<HTMLInputElement>('#file');
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

const updateButtons = (): void => {
  undoButton.disabled = strokes.length === 0;
  clearButton.disabled = strokes.length === 0;
  downloadButton.disabled = !source;
};

const clearGuide = (): void => {
  guideContext.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
};

const process = (): void => {
  if (!source) return;
  const started = performance.now();
  const result = removeBackground(source, {}, { strokes });
  resultContext.putImageData(
    new ImageData(new Uint8ClampedArray(result.image.data), result.image.width, result.image.height),
    0,
    0,
  );
  clearGuide();
  status.textContent = `Applied ${strokes.length} correction${strokes.length === 1 ? '' : 's'} in ${Math.round(performance.now() - started)} ms.`;
  updateButtons();
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
  source = { width: imageData.width, height: imageData.height, data: imageData.data };
  sourceName = file.name.replace(/\.[^.]+$/, '') || 'bordercut-result';
  strokes = [];
  resultCanvas.width = source.width;
  resultCanvas.height = source.height;
  guideCanvas.width = source.width;
  guideCanvas.height = source.height;
  stage.hidden = false;
  process();
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
