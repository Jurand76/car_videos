/** Rekurencyjne składanie 2×2 → uśrednienie koloru → połowa rozdzielczości. */

import { MOSAIC_MAX_BLOCK } from "./mosaicSchedule";

/** Najgrubszy kafelek = 128×128 px na ekranie → 7× składanie 2×2. */
export const getMosaicMaxHalvingLevel = (): number =>
  Math.log2(MOSAIC_MAX_BLOCK);

/** @deprecated Użyj blockSize z mosaicSchedule. */
export const getMosaicMaxLevel = (): number => getMosaicMaxHalvingLevel();

export const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  destWidth: number,
  destHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): void => {
  const frameRatio = destWidth / destHeight;
  const imageRatio = sourceWidth / sourceHeight;

  let cropW = sourceWidth;
  let cropH = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (imageRatio > frameRatio) {
    cropW = sourceHeight * frameRatio;
    cropX = (sourceWidth - cropW) / 2;
  } else {
    cropH = sourceWidth / frameRatio;
    cropY = (sourceHeight - cropH) / 2;
  }

  ctx.drawImage(
    source,
    cropX,
    cropY,
    cropW,
    cropH,
    0,
    0,
    destWidth,
    destHeight,
  );
};

/** Jedno złożenie: każdy piksel = średnia z bloku 2×2. */
export const halveCanvas2x2 = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const sw = source.width;
  const sh = source.height;
  const dw = Math.max(1, Math.floor(sw / 2));
  const dh = Math.max(1, Math.floor(sh / 2));

  const dest = document.createElement("canvas");
  dest.width = dw;
  dest.height = dh;

  const sctx = source.getContext("2d", { willReadFrequently: true });
  const dctx = dest.getContext("2d", { willReadFrequently: true });
  if (!sctx || !dctx) return dest;

  const src = sctx.getImageData(0, 0, sw, sh).data;
  const out = dctx.createImageData(dw, dh);

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          const sy = y * 2 + dy;
          if (sx >= sw || sy >= sh) continue;
          const i = (sy * sw + sx) * 4;
          r += src[i]!;
          g += src[i + 1]!;
          b += src[i + 2]!;
          a += src[i + 3]!;
          count++;
        }
      }

      const di = (y * dw + x) * 4;
      const n = count || 1;
      out.data[di] = r / n;
      out.data[di + 1] = g / n;
      out.data[di + 2] = b / n;
      out.data[di + 3] = a / n;
    }
  }

  dctx.putImageData(out, 0, 0);
  return dest;
};

export const buildMosaicLevelCanvases = (
  image: HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  maxLevel: number,
): HTMLCanvasElement[] => {
  const base = document.createElement("canvas");
  base.width = frameWidth;
  base.height = frameHeight;
  const baseCtx = base.getContext("2d");
  if (!baseCtx) return [base];

  baseCtx.imageSmoothingEnabled = false;
  drawImageCover(
    baseCtx,
    image,
    frameWidth,
    frameHeight,
    image.naturalWidth,
    image.naturalHeight,
  );

  const levels: HTMLCanvasElement[] = [base];
  let current = base;
  for (let level = 0; level < maxLevel; level++) {
    current = halveCanvas2x2(current);
    levels.push(current);
  }

  return levels;
};

const mosaicCache = new Map<string, HTMLCanvasElement[]>();

export const loadMosaicLevels = (
  imageSrc: string,
  frameWidth: number,
  frameHeight: number,
  maxLevel: number,
): Promise<HTMLCanvasElement[]> => {
  const key = `${imageSrc}@${frameWidth}x${frameHeight}@L${maxLevel}`;
  const cached = mosaicCache.get(key);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const levels = buildMosaicLevelCanvases(
        img,
        frameWidth,
        frameHeight,
        maxLevel,
      );
      mosaicCache.set(key, levels);
      resolve(levels);
    };
    img.onerror = () => reject(new Error(`Mosaic: nie można wczytać ${imageSrc}`));
    img.src = imageSrc;
  });
};
