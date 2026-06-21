import type { ProjectManifest } from "../src/projectTypes";
import {
  assignVariedBeats,
  computeAccentSync,
  computeMusicSync,
  guessBeatsPerSlide,
} from "../src/sync";
import { analyzeAudioFromPublic } from "./analyzeAudio";
import { getAudioMetaFromPublic } from "./audio";

export type SyncMode = "beats" | "bpm" | "duration";

export type ContentMode = "manual" | "fromText";

export type GenerateInput = {
  prompt: string;
  contentMode?: ContentMode;
  infoText?: string | null;
  useAllPublicImages?: boolean;
  slides: ProjectManifest["slides"];
  audio: string | null;
  bpm?: number | null;
  beatsPerSlide?: number;
  audioDurationSeconds?: number | null;
  syncToMusic?: boolean;
  syncMode?: SyncMode;
};

const resolveSlideBeats = (
  slides: ProjectManifest["slides"],
  defaultBeats: number,
): number[] => {
  const hasCustom = slides.some((s) => s.beats != null && s.beats > 0);
  if (!hasCustom) {
    return assignVariedBeats(slides.length, defaultBeats);
  }
  return slides.map((s) => s.beats ?? defaultBeats);
};

export const applyMusicSync = async (
  manifest: ProjectManifest,
  input: GenerateInput,
  root: string,
): Promise<ProjectManifest> => {
  if (!input.audio || input.syncToMusic === false) {
    return {
      ...manifest,
      sync: {
        enabled: false,
        mode: "duration",
        audioDurationSeconds: 0,
        bpm: null,
        beatsPerSlide: input.beatsPerSlide ?? 4,
        framesPerBeat: null,
      },
      totalDurationFrames:
        manifest.totalDurationFrames ??
        (manifest.slides.length > 0
          ? (manifest.slides.length - 1) *
              (manifest.slideDuration - manifest.transitionDuration) +
            manifest.slideDuration
          : 0),
    };
  }

  const syncMode: SyncMode = input.syncMode ?? "beats";
  const defaultBeats =
    input.beatsPerSlide ?? guessBeatsPerSlide(input.prompt);
  const slideBeats = resolveSlideBeats(manifest.slides, defaultBeats);

  let audioDurationSeconds = input.audioDurationSeconds ?? null;
  let tagBpm: number | null = null;

  try {
    const meta = await getAudioMetaFromPublic(root, input.audio);
    audioDurationSeconds = audioDurationSeconds ?? meta.durationSeconds;
    tagBpm = meta.bpm;
  } catch {
    return manifest;
  }

  if (!audioDurationSeconds || audioDurationSeconds <= 0) {
    return manifest;
  }

  if (syncMode === "beats") {
    try {
      const analysis = await analyzeAudioFromPublic(root, input.audio);
      const syncResult = computeAccentSync({
        slideCount: manifest.slides.length,
        fps: manifest.fps,
        audioDurationSeconds,
        beatTimesSeconds: analysis.beatTimesSeconds,
        beatStrengths: analysis.beatStrengths,
        slideBeats,
        bpm: input.bpm ?? analysis.bpm,
        analyzer: analysis.analyzer,
        confidence: analysis.confidence,
      });

      return {
        ...manifest,
        slides: manifest.slides.map((slide, index) => ({
          ...slide,
          beats: slideBeats[index],
          accentStrength: syncResult.slideAccentStrengths[index],
          transition:
            index === 0
              ? undefined
              : (syncResult.slideTransitions[index] ?? slide.transition),
        })),
        slideDuration: syncResult.slideDuration,
        transitionDuration: syncResult.transitionDuration,
        slideTimings: syncResult.slideTimings,
        totalDurationFrames: syncResult.totalDurationFrames,
        sync: {
          ...syncResult.sync,
          slideTransitionDurations: syncResult.slideTransitionDurations,
        },
      };
    } catch (error) {
      console.warn(
        "Accent sync failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const bpm = input.bpm ?? tagBpm ?? null;
  const syncResult = computeMusicSync({
    slideCount: manifest.slides.length,
    fps: manifest.fps,
    audioDurationSeconds,
    bpm: syncMode === "duration" ? null : bpm,
    beatsPerSlide: Math.round(
      slideBeats.reduce((sum, b) => sum + b, 0) / Math.max(slideBeats.length, 1),
    ),
  });

  return {
    ...manifest,
    slides: manifest.slides.map((slide, index) => ({
      ...slide,
      beats: slideBeats[index],
    })),
    slideDuration: syncResult.slideDuration,
    transitionDuration: syncResult.transitionDuration,
    slideTimings: syncResult.slideTimings,
    totalDurationFrames: syncResult.totalDurationFrames,
    sync: syncResult.sync,
  };
};
