import type { TransitionType } from "./transitions";

const STRONG_TRANSITIONS: TransitionType[] = [
  "flash",
  "shockwave",
  "strobeCut",
  "glitch",
  "shatter",
  "zoomSpin",
  "mosaic",
  "colorFade",
  "tilesRadial",
];

const MEDIUM_TRANSITIONS: TransitionType[] = [
  "slideLeft",
  "zoomIn",
  "tilesIn",
  "rgbSplit",
  "spinIn",
  "stripsHorizontal",
  "stripsVertical",
  "blocksHorizontal",
  "blocksVertical",
  "flip",
];

const SOFT_TRANSITIONS: TransitionType[] = [
  "fade",
  "blur",
  "slideUp",
  "zoomOut",
  "rotateCcw",
];

/** Przejścia specyficzne dla poszczególnych typów momentów muzycznych */
const DROP_TRANSITIONS: TransitionType[] = [
  "flash",
  "shockwave",
  "strobeCut",
  "glitch",
  "shatter",
  "zoomSpin",
];

const BUILDUP_TRANSITIONS: TransitionType[] = [
  "zoomIn",
  "tilesIn",
  "spinIn",
  "rgbSplit",
  "stripsHorizontal",
];

const BREAKDOWN_TRANSITIONS: TransitionType[] = [
  "fade",
  "blur",
  "zoomOut",
  "slideUp",
];

const CLIMAX_TRANSITIONS: TransitionType[] = [
  "flash",
  "shockwave",
  "mosaic",
  "colorFade",
  "tilesRadial",
  "shatter",
];

const filterTransitionPool = (
  pool: TransitionType[],
  allowed?: TransitionType[],
): TransitionType[] => {
  if (!allowed?.length) return pool;
  const filtered = pool.filter((t) => allowed.includes(t));
  return filtered.length ? filtered : allowed;
};

export const pickTransitionForAccent = (
  strength: number,
  index: number,
  allowed?: TransitionType[],
): TransitionType => {
  const pool = filterTransitionPool(
    strength >= 0.72
      ? STRONG_TRANSITIONS
      : strength >= 0.45
        ? MEDIUM_TRANSITIONS
        : SOFT_TRANSITIONS,
    allowed,
  );
  return pool[index % pool.length];
};

/** Wybiera przejście na podstawie typu momentu muzycznego */
export const pickTransitionForMomentType = (
  momentType: "drop" | "buildup" | "breakdown" | "climax" | "standard",
  index: number,
  allowed?: TransitionType[],
): TransitionType => {
  let pool: TransitionType[];
  
  switch (momentType) {
    case "drop":
      pool = DROP_TRANSITIONS;
      break;
    case "buildup":
      pool = BUILDUP_TRANSITIONS;
      break;
    case "breakdown":
      pool = BREAKDOWN_TRANSITIONS;
      break;
    case "climax":
      pool = CLIMAX_TRANSITIONS;
      break;
    default:
      pool = MEDIUM_TRANSITIONS;
  }
  
  const filtered = filterTransitionPool(pool, allowed);
  return filtered[index % filtered.length];
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

/** Oblicza czas trwania przejścia na podstawie typu momentu muzycznego */
export const pickTransitionDurationForMoment = (
  momentType: "drop" | "buildup" | "breakdown" | "climax" | "standard",
  framesPerBeat: number,
): number => {
  const base = Math.round(0.45 * framesPerBeat);
  
  switch (momentType) {
    case "drop":
    case "climax":
      // Szybkie, dynamiczne przejścia
      return Math.max(6, Math.min(18, Math.round(base * 0.7)));
    case "buildup":
      // Średnie, budujące napięcie
      return Math.max(10, Math.min(22, base));
    case "breakdown":
      // Dłuższe, spokojne przejścia
      return Math.max(14, Math.min(32, Math.round(base * 1.3)));
    default:
      return Math.max(8, Math.min(28, base));
  }
};

/** Typ dla sugestii przejścia z dynamiki */
export type TransitionSuggestion = {
  strength: number;
  duration: number;
  transitionType: "strong" | "medium" | "soft";
  momentType: "drop" | "buildup" | "breakdown" | "climax" | "standard";
  transition: TransitionType;
  reason: string;
};

/** Łączy różne czynniki przy wyborze przejścia */
export const computeTransitionForSlide = (
  accentStrength: number,
  momentType: "drop" | "buildup" | "breakdown" | "climax" | "standard",
  dynamicIntensity: number,
  framesPerBeat: number,
  slideIndex: number,
  allowed?: TransitionType[],
): TransitionSuggestion => {
  // Oblicz siłę na podstawie akcentu i dynamiki
  const baseStrength = (accentStrength + dynamicIntensity) / 2;
  
  // Dostosuj do typu momentu
  let strength = baseStrength;
  let transitionType: "strong" | "medium" | "soft";
  
  switch (momentType) {
    case "drop":
      strength = Math.max(strength, 0.85);
      transitionType = "strong";
      break;
    case "climax":
      strength = Math.max(strength, 0.78);
      transitionType = "strong";
      break;
    case "buildup":
      strength = Math.min(strength + 0.1, 0.8);
      transitionType = "medium";
      break;
    case "breakdown":
      strength = Math.max(strength - 0.2, 0.25);
      transitionType = "soft";
      break;
    default:
      transitionType = strength >= 0.72 ? "strong" : strength >= 0.45 ? "medium" : "soft";
  }
  
  // Wybierz przejście
  const transition = pickTransitionForMomentType(momentType, slideIndex, allowed);
  
  // Czas trwania
  const duration = pickTransitionDurationForMoment(momentType, framesPerBeat);
  
  return {
    strength: Math.min(1, Math.max(0.1, strength)),
    duration,
    transitionType,
    momentType,
    transition,
    reason: `${momentType} section, intensity ${(dynamicIntensity * 100).toFixed(0)}%`,
  };
};
