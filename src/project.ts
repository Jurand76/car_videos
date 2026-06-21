import projectJson from "../generated/project.json";
import type { ProjectManifest, ProjectSlide } from "./projectTypes";
import { DEFAULT_ANIMATION_PHASES, type AnimationPhases } from "./slideAnimation";
import { getOutroDurationFrames } from "./sync";

const defaultSync: ProjectManifest["sync"] = {
  enabled: false,
  mode: "duration",
  audioDurationSeconds: 0,
  bpm: null,
  beatsPerSlide: 16,
  framesPerBeat: null,
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
          exitBang: legacy.exitBang ?? legacy.pulseZoom ?? true,
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

export const getSlideTransitionDuration = (index: number) =>
  PROJECT.sync.slideTransitionDurations?.[index] ?? TRANSITION_DURATION;

export const getOutroFrames = () => getOutroDurationFrames(FPS);

export const getSlidesContentEndFrame = (): number => {
  if (PROJECT.slideTimings?.length) {
    const last = PROJECT.slideTimings[PROJECT.slideTimings.length - 1];
    return last.from + last.duration;
  }
  if (SLIDES.length <= 0) return 0;
  return (
    (SLIDES.length - 1) * (SLIDE_DURATION - TRANSITION_DURATION) + SLIDE_DURATION
  );
};

export const getTotalDuration = (slideCount: number) => {
  if (PROJECT.totalDurationFrames) {
    return PROJECT.totalDurationFrames;
  }
  if (slideCount <= 0) return 0;
  return getSlidesContentEndFrame() + getOutroFrames();
};
