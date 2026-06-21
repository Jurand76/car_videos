import { Easing, interpolate, spring } from "remotion";

export type TextEffect =
  | "slideUp"
  | "slideLeft"
  | "scaleIn"
  | "blurIn"
  | "boomIn"
  | "mosaicIn"
  | "shatterIn"
  | "glitchIn"
  | "popIn"
  | "waveIn"
  | "stampIn"
  | "elasticIn";

export const TEXT_EFFECTS: TextEffect[] = [
  "boomIn",
  "mosaicIn",
  "shatterIn",
  "glitchIn",
  "popIn",
  "waveIn",
  "stampIn",
  "elasticIn",
  "slideUp",
  "scaleIn",
  "blurIn",
  "slideLeft",
];

export const getTextEffect = (
  index: number,
  pool: readonly TextEffect[] = TEXT_EFFECTS,
): TextEffect => {
  const effects = pool.length ? pool : TEXT_EFFECTS;
  return effects[index % effects.length];
};

export const hashUnit = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const getShatterOffset = (
  index: number,
  slideIndex: number,
  spread = 140,
) => {
  const seed = index + slideIndex * 17;
  const angle = hashUnit(seed) * Math.PI * 2;
  const dist = (0.35 + hashUnit(seed + 1) * 0.65) * spread;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    rotate: (hashUnit(seed + 2) - 0.5) * 80,
  };
};

export const getEnterProgress = (
  localFrame: number,
  fps: number,
  effect: TextEffect,
): number => {
  if (localFrame < 0) return 0;

  const duration =
    effect === "boomIn" || effect === "popIn" || effect === "stampIn"
      ? Math.round(fps * 0.3)
      : effect === "elasticIn"
        ? Math.round(fps * 0.42)
      : effect === "mosaicIn" || effect === "shatterIn"
        ? Math.round(fps * 0.45)
        : Math.round(fps * 0.35);

  const t = Math.min(1, localFrame / Math.max(1, duration));
  return Easing.out(Easing.cubic)(t);
};

export const getBoomSpring = (localFrame: number, fps: number) =>
  spring({
    frame: localFrame,
    fps,
    config: { damping: 11, stiffness: 220, mass: 0.7 },
  });

export const getPopSpring = (localFrame: number, fps: number) =>
  spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 180 },
  });

export const getElasticSpring = (localFrame: number, fps: number) =>
  spring({
    frame: localFrame,
    fps,
    config: { damping: 8, stiffness: 160, mass: 0.9 },
  });

export const getStampSpring = (
  localFrame: number,
  fps: number,
  charIndex: number,
) =>
  spring({
    frame: localFrame - charIndex * 3,
    fps,
    config: { damping: 12, stiffness: 260, mass: 0.55 },
  });

export const getWaveSpring = (
  localFrame: number,
  fps: number,
  charIndex: number,
) =>
  spring({
    frame: localFrame - charIndex * 2,
    fps,
    config: { damping: 16, stiffness: 140 },
  });

export const getShatterOutProgress = (
  localFrame: number,
  hideStartFrame: number,
  fps: number,
): number => {
  const start = hideStartFrame - Math.round(fps * 0.35);
  if (localFrame < start) return 0;
  const t = (localFrame - start) / Math.max(1, Math.round(fps * 0.28));
  return Easing.in(Easing.cubic)(Math.min(1, Math.max(0, t)));
};

export const supportsShatterOut = (effect: TextEffect) =>
  effect === "boomIn" ||
  effect === "shatterIn" ||
  effect === "popIn" ||
  effect === "glitchIn";

export const getClassicEntrance = (
  effect: TextEffect,
  progress: number,
): { transform: string; filter: string } => {
  switch (effect) {
    case "slideUp":
      return {
        transform: `translateY(${(1 - progress) * 60}px)`,
        filter: "none",
      };
    case "slideLeft":
      return {
        transform: `translateX(${(1 - progress) * -80}px)`,
        filter: "none",
      };
    case "scaleIn":
      return {
        transform: `scale(${0.72 + progress * 0.28})`,
        filter: "none",
      };
    case "blurIn":
      return {
        transform: `translateY(${(1 - progress) * 24}px)`,
        filter: `blur(${(1 - progress) * 14}px)`,
      };
    default:
      return { transform: "none", filter: "none" };
  }
};

export const getGlitchJitter = (
  localFrame: number,
  progress: number,
  seed: number,
) => {
  if (progress >= 1) return { x: 0, y: 0, skew: 0, blur: 0 };
  const flicker = localFrame % 3 === 0 ? 1 : 0.4;
  const settle = 1 - progress;
  return {
    x: (hashUnit(seed + localFrame) - 0.5) * 18 * settle * flicker,
    y: (hashUnit(seed + localFrame + 9) - 0.5) * 10 * settle * flicker,
    skew: (hashUnit(seed + 3) - 0.5) * 12 * settle,
    blur: settle * 6,
  };
};

/** Drgania tylko przy wychodzeniu slajdu (outProgress rośnie od 0 do 1). */
export const getGlitchOutJitter = (
  localFrame: number,
  outProgress: number,
  seed: number,
) => {
  if (outProgress <= 0) return { x: 0, y: 0, skew: 0, blur: 0 };
  const flicker = localFrame % 3 === 0 ? 1 : 0.4;
  return {
    x: (hashUnit(seed + localFrame) - 0.5) * 18 * outProgress * flicker,
    y: (hashUnit(seed + localFrame + 9) - 0.5) * 10 * outProgress * flicker,
    skew: (hashUnit(seed + 3) - 0.5) * 12 * outProgress,
    blur: outProgress * 6,
  };
};

export const mosaicCellProgress = (
  progress: number,
  col: number,
  row: number,
  cols: number,
  rows: number,
) => {
  const stagger = (col + row) / (cols + rows);
  return interpolate(progress, [stagger * 0.45, stagger * 0.45 + 0.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};
