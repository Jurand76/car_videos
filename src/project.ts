import projectJson from "../generated/project.json";
import type { ProjectManifest, ProjectSlide } from "./projectTypes";
import { getColorFadeTransitionFrames, isColorFadeEffect } from "./effects/ColorFadeTransition";
import { getBlockTransitionFrames, isBlockEffect } from "./effects/BlockReveal";
import { getMosaicTransitionFrames, isMosaicEffect } from "./effects/MosaicTransition";
import { getStripTransitionFrames, isStripEffect } from "./effects/StripReveal";
import { getTilesInTransitionFrames } from "./effects/TileCompose";
import { DEFAULT_ANIMATION_PHASES, type AnimationPhases } from "./slideAnimation";
import { getLastSlideTailFrames, getOutroDurationFrames } from "./sync";
import type { TransitionType } from "./transitions";

const defaultSync: ProjectManifest["sync"] = {
  enabled: false,
  mode: "duration",
  audioDurationSeconds: 0,
  bpm: null,
  beatsPerSlide: 16,
  framesPerBeat: null,
  textEnterDelayBeats: 0,
  animationPhases: DEFAULT_ANIMATION_PHASES,
};

const normalizeSync = (sync: ProjectManifest["sync"] | undefined): ProjectManifest["sync"] => {
  if (!sync) return defaultSync;

  const legacy = sync.animationPhases as AnimationPhases & {
    pulseZoom?: boolean;
    pulseStrength?: number;
  };

  return {
    ...sync,
    animationPhases: legacy
      ? {
          introBeats: legacy.introBeats ?? DEFAULT_ANIMATION_PHASES.introBeats,
          exitBang: legacy.exitBang ?? legacy.pulseZoom ?? false,
          bangStrength:
            legacy.bangStrength ?? legacy.pulseStrength ?? 0.14,
        }
      : DEFAULT_ANIMATION_PHASES,
  };
};

export const PROJECT = {
  ...projectJson,
  sync: normalizeSync((projectJson as unknown as ProjectManifest).sync),
} as ProjectManifest;

export const SLIDES: ProjectSlide[] = PROJECT.slides;
export const ALLOWED_TEXT_EFFECTS =
  PROJECT.allowedTextEffects?.length
    ? PROJECT.allowedTextEffects
    : undefined;
export const SLIDE_DURATION = PROJECT.slideDuration;
export const TRANSITION_DURATION = PROJECT.transitionDuration;
export const FPS = PROJECT.fps;
export const WIDTH = PROJECT.width;
export const HEIGHT = PROJECT.height;

export const getSlideStart = (index: number) => {
  if (PROJECT.slideTimings?.[index]) {
    return PROJECT.slideTimings[index].from;
  }
  return index * (SLIDE_DURATION - TRANSITION_DURATION);
};

export const getSlideSequenceDuration = (index: number) => {
  if (PROJECT.slideTimings?.[index]) {
    return PROJECT.slideTimings[index].duration;
  }
  return SLIDE_DURATION;
};

/** Rzeczywiste nachodzenie dwóch slajdów (z manifestu lub domyślne). */
export const getSlideTransitionOverlap = (transitionIndex: number): number => {
  const nextIndex = transitionIndex + 1;
  if (
    PROJECT.slideTimings?.[transitionIndex] &&
    PROJECT.slideTimings?.[nextIndex]
  ) {
    const prev = PROJECT.slideTimings[transitionIndex];
    const next = PROJECT.slideTimings[nextIndex];
    return Math.max(1, prev.from + prev.duration - next.from);
  }
  return (
    PROJECT.sync.slideTransitionDurations?.[transitionIndex] ??
    TRANSITION_DURATION
  );
};

export const getSlideTransitionDuration = (index: number) => {
  const overlap = getSlideTransitionOverlap(index);
  const incoming = SLIDES[index + 1];
  if (incoming?.transition === "mosaic") {
    return Math.max(overlap, getMosaicTransitionFrames());
  }
  if (incoming?.transition === "colorFade") {
    return Math.max(overlap, getColorFadeTransitionFrames());
  }
  if (incoming?.transition === "tilesIn") {
    return Math.max(overlap, getTilesInTransitionFrames());
  }
  if (incoming?.transition && isBlockEffect(incoming.transition)) {
    return Math.max(overlap, getBlockTransitionFrames());
  }
  if (incoming?.transition && isStripEffect(incoming.transition)) {
    return Math.max(overlap, getStripTransitionFrames());
  }
  return overlap;
};

/** Globalna klatka startu przejścia między slajdem `index` a `index + 1`. */
export const getTransitionStartFrame = (transitionIndex: number): number => {
  const duration = getSlideTransitionDuration(transitionIndex);
  if (PROJECT.slideTimings?.[transitionIndex]) {
    const prev = PROJECT.slideTimings[transitionIndex];
    return prev.from + prev.duration - duration;
  }
  const prevStart = getSlideStart(transitionIndex);
  const prevDuration = getSlideSequenceDuration(transitionIndex);
  return prevStart + prevDuration - duration;
};

export const usesExtendedTransitionOverlap = (
  type?: TransitionType,
): boolean =>
  isColorFadeEffect(type) ||
  isMosaicEffect(type) ||
  type === "tilesIn" ||
  isBlockEffect(type) ||
  isStripEffect(type);

/** Klatki wcześniejszego startu sekwencji slajdu (pełne przejście vs overlap z manifestu). */
export const getTransitionEarlyFrames = (
  slideIndex: number,
  enterTransition?: TransitionType,
): number => {
  if (slideIndex <= 0 || !usesExtendedTransitionOverlap(enterTransition)) {
    return 0;
  }
  return Math.max(
    0,
    getSlideStart(slideIndex) - getTransitionStartFrame(slideIndex - 1),
  );
};

export const getOutroFrames = () => getOutroDurationFrames(FPS);

export const getLastSlideTail = () =>
  SLIDES.length > 0 ? getLastSlideTailFrames(FPS) : 0;

/** Koniec ostatniego slajdu z manifestu (bez tail/outro). */
export const getLastSlideContentEndFrame = (): number => {
  if (PROJECT.slideTimings?.length) {
    const last = PROJECT.slideTimings[PROJECT.slideTimings.length - 1];
    return last.from + last.duration;
  }
  if (SLIDES.length <= 0) return 0;
  return (
    (SLIDES.length - 1) * (SLIDE_DURATION - TRANSITION_DURATION) + SLIDE_DURATION
  );
};

export type OutroRange = {
  /** Pierwsza klatka fade-outu (po tailu ostatniego slajdu). */
  start: number;
  /** Ostatnia klatka kompozycji — fade i audio kończą się tutaj. */
  end: number;
  /** Długość fade-outu w klatkach (może być krótsza niż OUTRO przy krótkim audio). */
  duration: number;
};

export const getOutroRange = (): OutroRange => {
  const tailFrames = getLastSlideTail();
  const outroFrames = getOutroFrames();
  const contentEnd = getLastSlideContentEndFrame();
  const idealStart = contentEnd + tailFrames;
  const idealEnd = idealStart + outroFrames;

  let end = idealEnd;
  let start = idealStart;

  if (PROJECT.sync.enabled && PROJECT.sync.audioDurationSeconds > 0) {
    const audioEnd = Math.round(PROJECT.sync.audioDurationSeconds * FPS);
    if (audioEnd > 0) {
      end = Math.min(idealEnd, audioEnd);
      if (end <= start) {
        start = Math.max(contentEnd, end - outroFrames);
      }
      if (start >= end) {
        start = Math.max(0, end - 1);
      }
    }
  }

  const duration = Math.max(1, end - start);
  return { start, end, duration };
};

export const getSlidesContentEndFrame = (): number => getOutroRange().start;

export const getTotalDuration = (slideCount: number) => {
  if (slideCount <= 0) return 0;
  return getOutroRange().end;
};
