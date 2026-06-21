import type { ProjectManifest } from "../src/projectTypes";
import type { TransitionType } from "../src/transitions";
import type { TextEffect } from "../src/effects/textEffects";
import {
  computeAccentSync,
  computeMusicSync,
  getLastSlideTailFrames,
  getOutroDurationFrames,
  getTempoProfile,
  guessBeatsPerSlide,
  resolveSlideBeats,
} from "../src/sync";
import { analyzeAudioFromPublic } from "./analyzeAudio";
import { getAudioMetaFromPublic } from "./audio";
import { clampTextEnterDelayBeats } from "../src/slideAnimation";
import type { MusicSyncInfo } from "../src/sync";

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
  textEnterDelayBeats?: number;
  audioDurationSeconds?: number | null;
  syncToMusic?: boolean;
  syncMode?: SyncMode;
  /** Flow animacji — nie nadpisuj title/subtitle/sceneLabel. */
  preserveSlideCopy?: boolean;
  allowedTransitions?: TransitionType[];
  allowedTextEffects?: TextEffect[];
};

export const resolveBaseBeats = (input: GenerateInput): number =>
  input.beatsPerSlide ?? guessBeatsPerSlide(input.prompt);

const withTextEnterDelay = (
  sync: MusicSyncInfo,
  input: GenerateInput,
  manifest: ProjectManifest,
): MusicSyncInfo => ({
  ...sync,
  textEnterDelayBeats: clampTextEnterDelayBeats(
    input.textEnterDelayBeats ?? manifest.sync?.textEnterDelayBeats ?? 0,
  ),
});

export const applyMusicSync = async (
  manifest: ProjectManifest,
  input: GenerateInput,
  root: string,
): Promise<ProjectManifest> => {
  if (!input.audio || input.syncToMusic === false) {
    return {
      ...manifest,
      sync: withTextEnterDelay(
        {
          enabled: false,
          mode: "duration",
          audioDurationSeconds: 0,
          bpm: null,
          beatsPerSlide: input.beatsPerSlide ?? 4,
          framesPerBeat: null,
        },
        input,
        manifest,
      ),
      totalDurationFrames:
        manifest.totalDurationFrames ??
        ((manifest.slides.length > 0
          ? (manifest.slides.length - 1) *
              (manifest.slideDuration - manifest.transitionDuration) +
            manifest.slideDuration
          : 0) +
          getLastSlideTailFrames(manifest.fps) +
          getOutroDurationFrames(manifest.fps)),
    };
  }

  const syncMode: SyncMode = input.syncMode ?? "beats";
  const defaultBeats = resolveBaseBeats(input);
  const tempo = getTempoProfile(defaultBeats);
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
        allowedTransitions:
          manifest.allowedTransitions ?? input.allowedTransitions,
      });

      return {
        ...manifest,
        kenBurns: tempo.kenBurns,
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
        sync: withTextEnterDelay(
          {
            ...syncResult.sync,
            slideTransitionDurations: syncResult.slideTransitionDurations,
          },
          input,
          manifest,
        ),
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
    kenBurns: tempo.kenBurns,
    slides: manifest.slides.map((slide, index) => ({
      ...slide,
      beats: slideBeats[index],
    })),
    slideDuration: syncResult.slideDuration,
    transitionDuration: syncResult.transitionDuration,
    slideTimings: syncResult.slideTimings,
    totalDurationFrames: syncResult.totalDurationFrames,
    sync: withTextEnterDelay(syncResult.sync, input, manifest),
  };
};
