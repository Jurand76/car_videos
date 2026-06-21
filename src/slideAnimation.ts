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
  introBeats: 4,
  exitBang: true,
  bangStrength: 0.14,
};

export const buildAnimationPhases = (beatsPerSlide: number): AnimationPhases => ({
  introBeats: Math.max(2, Math.min(8, Math.floor(beatsPerSlide * 0.35))),
  exitBang: true,
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

/** Zoom in → zoom out → dopiero potem cięcie slajdu. */
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
  introBeats: number,
  transitionDuration: number,
  framesPerBeat: number,
): number => {
  if (localBeats.length > introBeats) {
    return localBeats[introBeats];
  }
  return transitionDuration + introBeats * framesPerBeat;
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
