/** Rozmiar kafelka na ekranie (px): 1, 2, 4, … 128. */
export const MOSAIC_MAX_BLOCK = 128;

/** Klatki 2–3, 4–5, … (pierwsza klatka = 1×1 sama). */
export const MOSAIC_FRAMES_PER_STEP = 2;

export const getMosaicMaxHalvingLevel = (): number =>
  Math.log2(MOSAIC_MAX_BLOCK);

/** Klatki na połowę: 1 + 7×2 = 15. Całość = 30. */
export const getMosaicHalfDuration = (): number =>
  1 + getMosaicMaxHalvingLevel() * MOSAIC_FRAMES_PER_STEP;

export const getMosaicTransitionFrames = (): number =>
  getMosaicHalfDuration() * 2;

/** Wyjście: klatka 0 → 1×1, 1–2 → 2×2, 3–4 → 4×4 … */
export const getMosaicBlockSizeOutgoing = (frame: number): number => {
  if (frame <= 0) return 1;
  const idx = 1 + Math.floor((frame - 1) / MOSAIC_FRAMES_PER_STEP);
  return Math.min(MOSAIC_MAX_BLOCK, 2 ** idx);
};

/** Wejście: lustrzane odbicie harmonogramu wyjścia. */
export const getMosaicBlockSizeIncoming = (
  frameInHalf: number,
  half: number,
): number => {
  const outFrame = half - 1 - frameInHalf;
  if (outFrame <= 0) return 1;
  return getMosaicBlockSizeOutgoing(outFrame);
};

export type MosaicRole = "outgoing" | "incoming";

export const getMosaicBlockSizeForLocalFrame = (
  localFrame: number,
  role: MosaicRole,
): number => {
  const half = getMosaicHalfDuration();
  const f = Math.max(0, localFrame);

  if (role === "outgoing") {
    if (f >= half) return MOSAIC_MAX_BLOCK;
    return getMosaicBlockSizeOutgoing(f);
  }

  if (f < half) return MOSAIC_MAX_BLOCK;
  return getMosaicBlockSizeIncoming(f - half, half);
};

export const blockSizeToHalvingLevel = (blockSize: number): number => {
  if (blockSize <= 1) return 0;
  return Math.round(Math.log2(blockSize));
};

export const getMosaicOpacityForLocalFrame = (
  localFrame: number,
  role: MosaicRole,
): number => {
  const half = getMosaicHalfDuration();
  const f = Math.max(0, localFrame);
  if (role === "outgoing") return f < half ? 1 : 0;
  return f >= half ? 1 : 0;
};

export const isMosaicActiveLocalFrame = (localFrame: number): boolean =>
  localFrame >= 0 && localFrame < getMosaicTransitionFrames();
