import type { ProjectManifest } from "../src/projectTypes";
import {
  assignVariedBeats,
  computeAccentSync,
  computeMusicSync,
  getOutroDurationFrames,
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
  /** Flow animacji — nie nadpisuj title/subtitle/sceneLabel. */
  preserveSlideCopy?: boolean;
};

const resolveSlideBeats = (
  slides: ProjectManifest["slides"],
  defaultBeats: number,
): number[] => assignVariedBeats(slides.length, defaultBeats);

export const resolveBaseBeats = (input: GenerateInput): number =>
  input.beatsPerSlide ?? guessBeatsPerSlide(input.prompt);

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
        ((manifest.slides.length > 0
          ? (manifest.slides.length - 1) *
              (manifest.slideDuration - manifest.transitionDuration) +
            manifest.slideDuration
          : 0) + getOutroDurationFrames(manifest.fps)),
    };
  }

  const syncMode: SyncMode = input.syncMode ?? "beats";
  const defaultBeats = resolveBaseBeats(input);
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
