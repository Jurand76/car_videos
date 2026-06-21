import type { TransitionType } from "./transitions";

const STRONG_TRANSITIONS: TransitionType[] = [
  "flash",
  "shockwave",
  "strobeCut",
  "glitch",
  "shatter",
  "zoomSpin",
  "mosaic",
  "tilesRadial",
];

const MEDIUM_TRANSITIONS: TransitionType[] = [
  "pushLeft",
  "wipeLeft",
  "zoomIn",
  "tilesIn",
  "rgbSplit",
  "spinIn",
  "stripsHorizontal",
  "stripsVertical",
  "flip",
];

const SOFT_TRANSITIONS: TransitionType[] = [
  "fade",
  "blur",
  "slideUp",
  "zoomOut",
  "wipeUp",
  "rotateCcw",
];

export const pickTransitionForAccent = (
  strength: number,
  index: number,
): TransitionType => {
  const pool =
    strength >= 0.72
      ? STRONG_TRANSITIONS
      : strength >= 0.45
        ? MEDIUM_TRANSITIONS
        : SOFT_TRANSITIONS;
  return pool[index % pool.length];
};

export const pickBangStrengthForAccent = (
  strength: number,
  base = 0.14,
): number => {
  const boosted = 0.05 + strength * 0.23;
  return Math.min(0.3, Math.max(base * 0.65, boosted));
};

export const pickTransitionDurationForAccent = (
  strength: number,
  framesPerBeat: number,
): number => {
  const base = Math.round(0.45 * framesPerBeat);
  const strong = Math.round(0.55 * framesPerBeat);
  const duration = strength >= 0.65 ? strong : base;
  return Math.max(8, Math.min(28, duration));
};
