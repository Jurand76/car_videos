export type TextEntrance =
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

export type AnimationPhases = {
  introBeats: number;
  exitBang: boolean;
  bangStrength: number;
};

export const DEFAULT_ANIMATION_PHASES: AnimationPhases = {
  introBeats: 0,
  exitBang: false,
  bangStrength: 0.14,
};

export const TEXT_ENTER_DELAY_OPTIONS = [0, 1, 2, 4, 6, 8, 10] as const;

export type TextEnterDelayBeats = (typeof TEXT_ENTER_DELAY_OPTIONS)[number];

export const clampTextEnterDelayBeats = (value: number): TextEnterDelayBeats => {
  const rounded = Math.round(value);
  if (TEXT_ENTER_DELAY_OPTIONS.includes(rounded as TextEnterDelayBeats)) {
    return rounded as TextEnterDelayBeats;
  }
  return TEXT_ENTER_DELAY_OPTIONS.reduce((best, option) =>
    Math.abs(option - rounded) < Math.abs(best - rounded) ? option : best,
  );
};

export const buildAnimationPhases = (_beatsPerSlide: number): AnimationPhases => ({
  introBeats: 0,
  exitBang: false,
  bangStrength: 0.14,
});

/** @deprecated Użyj getTextEffect z effects/textEffects */
export const getTextEntrance = (index: number): TextEntrance => {
  const styles: TextEntrance[] = [
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
  return styles[index % styles.length];
};

export const getLocalBeatFrames = (
  beatTimesSeconds: number[],
  fps: number,
  slideStartFrame: number,
  slideDuration: number,
): number[] => {
  const slideEnd = slideStartFrame + slideDuration;
  return beatTimesSeconds
    .map((t) => Math.round(t * fps))
    .filter((f) => f >= slideStartFrame && f < slideEnd)
    .map((f) => f - slideStartFrame);
};

/** @deprecated Automatyczny zoom przed cięciem — wyłączony; zoom tylko z efektów zoomIn/zoomOut. */
export const getExitBangScale = (
  frame: number,
  durationInFrames: number,
  transitionDuration: number,
  strength: number,
): number => {
  const exitStart = Math.max(0, durationInFrames - transitionDuration);
  const totalBangFrames = Math.min(
    28,
    Math.max(14, Math.round(transitionDuration * 1.4)),
  );
  const bangStart = Math.max(0, exitStart - totalBangFrames);
  const peakFrame = bangStart + Math.floor(totalBangFrames / 2);

  if (frame < bangStart || frame >= exitStart) {
    return 1;
  }

  if (frame <= peakFrame) {
    const t = (frame - bangStart) / Math.max(1, peakFrame - bangStart);
    const eased = t * t;
    return 1 + strength * eased;
  }

  const t = (frame - peakFrame) / Math.max(1, exitStart - peakFrame);
  const eased = t * t;
  return 1 + strength * (1 - eased);
};

export const getTextEnterFrame = (
  localBeats: number[],
  delayBeats: number,
  transitionDuration: number,
  framesPerBeat: number,
): number => {
  const delay = clampTextEnterDelayBeats(delayBeats);
  if (delay <= 0) return 0;
  if (localBeats.length > delay) {
    return localBeats[delay];
  }
  return transitionDuration + delay * framesPerBeat;
};

export const getTextEntranceOffset = (
  entrance: TextEntrance,
  progress: number,
): { transform: string; filter: string } => {
  switch (entrance) {
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
