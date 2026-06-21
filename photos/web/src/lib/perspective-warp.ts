/** Perspektywa + pochylenie — paski poziome (stabilny podgląd, bez trójkątów). */

export type WarpResult = {
  canvas: HTMLCanvasElement;
  /** Dolna kotwica w poziomie, 0–1 względem szerokości canvasa. */
  anchorX: number;
};

const STRIPS = 64;
const PREVIEW_MAX_WIDTH = 960;

type ImageSource = HTMLImageElement | HTMLCanvasElement;

function sourceSize(source: ImageSource) {
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth, h: source.naturalHeight };
  }
  return { w: source.width, h: source.height };
}

function downscaleForPreview(source: ImageSource): HTMLCanvasElement {
  const { w, h } = sourceSize(source);
  const scale = w > PREVIEW_MAX_WIDTH ? PREVIEW_MAX_WIDTH / w : 1;
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, tw, th);
  return canvas;
}

export function warpCarCanvas(
  image: HTMLImageElement,
  perspective: number,
  skew: number,
): WarpResult {
  const source = downscaleForPreview(image);
  const w = source.width;
  const h = source.height;
  const p = Math.max(-0.5, Math.min(0.5, perspective));
  const s = Math.max(-0.35, Math.min(0.35, skew));

  if (Math.abs(p) < 0.01 && Math.abs(s) < 0.01) {
    return { canvas: source, anchorX: 0.5 };
  }

  const topScale = 1 - p * 0.55;
  const topInset = ((1 - topScale) * w) / 2;
  const skewPx = s * h * 0.5;
  const topLeft = topInset + skewPx;
  const topRight = w - topInset + skewPx;

  const minX = Math.min(0, topLeft, topRight);
  const maxX = Math.max(w, topLeft, topRight);
  const outW = Math.max(1, Math.ceil(maxX - minX));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, outW, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let i = 0; i < STRIPS; i++) {
    const sy0 = (i / STRIPS) * h;
    const sy1 = ((i + 1) / STRIPS) * h;
    const sh = sy1 - sy0;
    const t = (sy0 + sy1) * 0.5 / h;

    const left = topLeft * (1 - t);
    const right = topRight * (1 - t) + w * t;
    const dstX = left - minX;
    const dstW = right - left;

    if (dstW > 0.5 && sh > 0) {
      ctx.drawImage(source, 0, sy0, w, sh, dstX, sy0, dstW, sh);
    }
  }

  return { canvas, anchorX: (w / 2 - minX) / outW };
}
