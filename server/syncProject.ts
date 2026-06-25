import type { ProjectManifest } from "../src/projectTypes";
import type { TransitionType } from "../src/transitions";
import type { TextEffect } from "../src/effects/textEffects";
import type { FlowAiConfig } from "../src/projectTypes";
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
  /** Opcjonalna analiza beatów z panelu — omija ponowne liczenie Essentia przy generate. */
  beatTimesSeconds?: number[];
  beatStrengths?: number[];
  analyzer?: "essentia" | "legacy";
  confidence?: number;
  allowedTransitions?: TransitionType[];
  allowedTextEffects?: TextEffect[];
  flowAiConfig?: FlowAiConfig;
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
      const analysis = input.beatTimesSeconds?.length
        ? {
            bpm: Math.round(input.bpm ?? tagBpm ?? 120),
            beatTimesSeconds: input.beatTimesSeconds,
            beatStrengths:
              input.beatStrengths?.length === input.beatTimesSeconds.length
                ? input.beatStrengths
                : input.beatTimesSeconds.map(() => 0.5),
            analyzer: input.analyzer ?? "legacy",
            confidence: input.confidence ?? 0.5,
          }
        : await analyzeAudioFromPublic(root, input.audio);
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

/** Przed renderem MP4 — przelicz timing do aktualnej muzyki i ustawień sync. */
export const prepareManifestForRender = async (
  manifest: ProjectManifest,
  root: string,
): Promise<ProjectManifest> => {
  if (!manifest.sync?.enabled || !manifest.audio) {
    return manifest;
  }

  const input: GenerateInput = {
    prompt: manifest.prompt,
    slides: manifest.slides,
    audio: manifest.audio,
    bpm: manifest.sync.bpm,
    beatsPerSlide: manifest.sync.beatsPerSlide,
    textEnterDelayBeats: manifest.sync.textEnterDelayBeats,
    audioDurationSeconds: manifest.sync.audioDurationSeconds,
    syncToMusic: true,
    syncMode: manifest.sync.mode ?? "beats",
    preserveSlideCopy: true,
    allowedTransitions: manifest.allowedTransitions,
    allowedTextEffects: manifest.allowedTextEffects,
    beatTimesSeconds: manifest.sync.beatTimesSeconds,
    analyzer: manifest.sync.analyzer,
    confidence: manifest.sync.confidence,
  };

  return applyMusicSync(
    {
      ...manifest,
      slideTimings: undefined,
      totalDurationFrames: undefined,
    },
    input,
    root,
  );
};
