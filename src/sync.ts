export type SlideTiming = {
  from: number;
  duration: number;
};

export type MusicSyncInfo = {
  enabled: boolean;
  mode: "beats" | "bpm" | "duration";
  audioDurationSeconds: number;
  bpm: number | null;
  beatsPerSlide: number;
  framesPerBeat: number | null;
  beatCount?: number;
  confidence?: number;
  beatTimesSeconds?: number[];
  accentCount?: number;
  analyzer?: "essentia" | "legacy";
  cutTimesSeconds?: number[];
  slideTransitionDurations?: number[];
  animationPhases?: import("./slideAnimation").AnimationPhases;
};

import { buildAnimationPhases } from "./slideAnimation";
import {
  pickBangStrengthForAccent,
  pickTransitionDurationForAccent,
  pickTransitionForAccent,
} from "./accentDriven";
import type { TransitionType } from "./transitions";

export const guessBeatsPerSlide = (prompt: string): number => {
  const p = prompt.toLowerCase();
  if (/szybk|dynamicz|reel|tiktok|fast|aggressive|drop/.test(p)) {
    return 8;
  }
  if (/spokoj|wolno|slow|cinematic|delikat|soft/.test(p)) {
    return 24;
  }
  return 16;
};

const VARIED_BEAT_PATTERNS: number[][] = [
  [8, 16, 24, 12, 20, 32, 10, 18],
  [24, 8, 16, 28, 12, 20, 8, 32],
  [12, 20, 8, 24, 16, 8, 28, 12],
  [16, 8, 32, 12, 24, 8, 20, 16],
  [20, 12, 8, 24, 16, 32, 8, 12],
];

/** Zróżnicowany rytm slajdów wokół bazowej wartości (np. 16 taktów). */
export const assignVariedBeats = (
  slideCount: number,
  baseBeats: number,
): number[] => {
  if (slideCount <= 0) return [];
  const scale = baseBeats / 16;
  const pattern = VARIED_BEAT_PATTERNS[slideCount % VARIED_BEAT_PATTERNS.length];
  return Array.from({ length: slideCount }, (_, i) => {
    const raw = pattern[i % pattern.length];
    return Math.max(4, Math.min(48, Math.round(raw * scale)));
  });
};

export const computeMusicSync = (params: {
  slideCount: number;
  fps: number;
  audioDurationSeconds: number;
  bpm: number | null;
  beatsPerSlide: number;
}): {
  slideTimings: SlideTiming[];
  transitionDuration: number;
  slideDuration: number;
  totalDurationFrames: number;
  sync: MusicSyncInfo;
} => {
  const totalFrames = Math.round(params.audioDurationSeconds * params.fps);
  const slideCount = params.slideCount;

  if (slideCount <= 0) {
    return {
      slideTimings: [],
      transitionDuration: 20,
      slideDuration: 90,
      totalDurationFrames: 0,
      sync: {
        enabled: false,
        mode: "duration",
        audioDurationSeconds: params.audioDurationSeconds,
        bpm: null,
        beatsPerSlide: params.beatsPerSlide,
        framesPerBeat: null,
      },
    };
  }

  if (slideCount === 1) {
    return {
      slideTimings: [{ from: 0, duration: totalFrames }],
      transitionDuration: 0,
      slideDuration: totalFrames,
      totalDurationFrames: totalFrames,
      sync: {
        enabled: true,
        mode: params.bpm ? "bpm" : "duration",
        audioDurationSeconds: params.audioDurationSeconds,
        bpm: params.bpm,
        beatsPerSlide: params.beatsPerSlide,
        framesPerBeat: params.bpm
          ? Math.round((60 / params.bpm) * params.fps)
          : null,
      },
    };
  }

  if (params.bpm && params.bpm > 0) {
    const framesPerBeat = Math.round((60 / params.bpm) * params.fps);
    let beatsPerSlide = Math.max(1, params.beatsPerSlide);
    const transitionDuration = Math.max(
      6,
      Math.min(Math.round(0.5 * framesPerBeat), 24),
    );

    const totalForBeats = (beats: number) => {
      const segment = beats * framesPerBeat;
      return (slideCount - 1) * (segment - transitionDuration) + segment;
    };

    while (beatsPerSlide > 1 && totalForBeats(beatsPerSlide) > totalFrames) {
      beatsPerSlide--;
    }
    while (
      beatsPerSlide < 32 &&
      totalForBeats(beatsPerSlide + 1) <= totalFrames
    ) {
      beatsPerSlide++;
    }

    const segment = beatsPerSlide * framesPerBeat;
    const slideTimings: SlideTiming[] = [];

    for (let i = 0; i < slideCount; i++) {
      const from =
        i === 0
          ? 0
          : slideTimings[i - 1].from +
            slideTimings[i - 1].duration -
            transitionDuration;
      const duration = i === slideCount - 1 ? totalFrames - from : segment;
      slideTimings.push({ from, duration });
    }

    return {
      slideTimings,
      transitionDuration,
      slideDuration: segment,
      totalDurationFrames: totalFrames,
      sync: {
        enabled: true,
        mode: "bpm",
        audioDurationSeconds: params.audioDurationSeconds,
        bpm: params.bpm,
        beatsPerSlide,
        framesPerBeat,
      },
    };
  }

  const transitionDuration = Math.max(
    8,
    Math.min(Math.round(totalFrames / slideCount / 7), 28),
  );
  const slideDuration = Math.round(
    (totalFrames + (slideCount - 1) * transitionDuration) / slideCount,
  );

  const slideTimings: SlideTiming[] = [];
  for (let i = 0; i < slideCount; i++) {
    const from =
      i === 0
        ? 0
        : slideTimings[i - 1].from +
          slideTimings[i - 1].duration -
          transitionDuration;
    const duration = i === slideCount - 1 ? totalFrames - from : slideDuration;
    slideTimings.push({ from, duration });
  }

  return {
    slideTimings,
    transitionDuration,
    slideDuration,
    totalDurationFrames: totalFrames,
    sync: {
      enabled: true,
      mode: "duration",
      audioDurationSeconds: params.audioDurationSeconds,
      bpm: null,
      beatsPerSlide: params.beatsPerSlide,
      framesPerBeat: null,
    },
  };
};

export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const computeBeatSync = (params: {
  slideCount: number;
  fps: number;
  audioDurationSeconds: number;
  beatTimesSeconds: number[];
  slideBeats: number[];
  bpm: number;
}): {
  slideTimings: SlideTiming[];
  transitionDuration: number;
  slideDuration: number;
  totalDurationFrames: number;
  sync: MusicSyncInfo;
} => {
  const totalFrames = Math.round(params.audioDurationSeconds * params.fps);
  const slideCount = params.slideCount;
  const beats = params.beatTimesSeconds.filter(
    (t) => t <= params.audioDurationSeconds + 0.001,
  );

  if (slideCount <= 0) {
    return {
      slideTimings: [],
      transitionDuration: 20,
      slideDuration: 90,
      totalDurationFrames: 0,
      sync: {
        enabled: false,
        mode: "beats",
        audioDurationSeconds: params.audioDurationSeconds,
        bpm: params.bpm,
        beatsPerSlide: params.slideBeats[0] ?? 16,
        framesPerBeat: null,
        beatCount: 0,
      },
    };
  }

  if (slideCount === 1) {
    return {
      slideTimings: [{ from: 0, duration: totalFrames }],
      transitionDuration: 0,
      slideDuration: totalFrames,
      totalDurationFrames: totalFrames,
      sync: {
        enabled: true,
        mode: "beats",
        audioDurationSeconds: params.audioDurationSeconds,
        bpm: params.bpm,
        beatsPerSlide: params.slideBeats[0] ?? 16,
        framesPerBeat:
          beats.length > 1
            ? Math.round((beats[1] - beats[0]) * params.fps)
            : Math.round((60 / params.bpm) * params.fps),
        beatCount: beats.length,
      },
    };
  }

  const beatIntervalSeconds =
    beats.length > 1 ? beats[1] - beats[0] : 60 / params.bpm;
  const transitionDuration = Math.max(
    6,
    Math.min(Math.round(0.45 * beatIntervalSeconds * params.fps), 22),
  );

  const getBeatTime = (beatIndex: number) => {
    if (beatIndex < beats.length) {
      return beats[beatIndex];
    }
    const lastBeat = beats[beats.length - 1] ?? 0;
    return lastBeat + (beatIndex - beats.length + 1) * beatIntervalSeconds;
  };

  let slideBeats = params.slideBeats.map((b) => Math.max(4, Math.round(b)));
  if (slideBeats.length < slideCount) {
    const fallback = Math.round(
      slideBeats.reduce((sum, b) => sum + b, 0) / Math.max(slideBeats.length, 1),
    ) || 16;
    while (slideBeats.length < slideCount) {
      slideBeats.push(fallback);
    }
  }

  slideBeats = slideBeats.slice(0, slideCount);

  const targetBeats = Math.floor(beats.length * 0.92);
  const rawTotal = slideBeats.reduce((sum, b) => sum + b, 0);

  if (targetBeats > slideCount * 4 && rawTotal > 0) {
    const maxBeatsPerSlide = Math.max(
      48,
      Math.ceil(targetBeats / slideCount) + 4,
    );
    const scale = targetBeats / rawTotal;
    slideBeats = slideBeats.map((b) =>
      Math.max(4, Math.min(maxBeatsPerSlide, Math.round(b * scale))),
    );

    let adjustedTotal = slideBeats.reduce((sum, b) => sum + b, 0);
    let guard = 0;
    while (adjustedTotal < targetBeats && guard < targetBeats * 2) {
      const idx = guard % slideCount;
      if (slideBeats[idx] < maxBeatsPerSlide) {
        slideBeats[idx]++;
        adjustedTotal++;
      }
      guard++;
    }
  } else {
    slideBeats = slideBeats.map((b) => Math.max(4, Math.min(48, b)));
  }

  const cutTimes: number[] = [0];
  let beatCursor = 0;
  for (let i = 0; i < slideCount - 1; i++) {
    beatCursor += slideBeats[i];
    cutTimes.push(getBeatTime(beatCursor));
  }

  const avgBeats = Math.round(
    slideBeats.reduce((sum, b) => sum + b, 0) / slideCount,
  );

  const slideTimings: SlideTiming[] = [];
  for (let i = 0; i < slideCount; i++) {
    const from =
      i === 0
        ? 0
        : Math.max(
            0,
            Math.round(cutTimes[i] * params.fps) - transitionDuration,
          );
    const endFrame =
      i === slideCount - 1
        ? totalFrames
        : Math.round(cutTimes[i + 1] * params.fps);
    slideTimings.push({
      from,
      duration: Math.max(endFrame - from, transitionDuration + 1),
    });
  }

  const avgDuration = Math.round(
    slideTimings.reduce((sum, t) => sum + t.duration, 0) / slideCount,
  );

  return {
    slideTimings,
    transitionDuration,
    slideDuration: avgDuration,
    totalDurationFrames: totalFrames,
      sync: {
        enabled: true,
        mode: "beats",
        audioDurationSeconds: params.audioDurationSeconds,
        bpm: params.bpm,
        beatsPerSlide: avgBeats,
        framesPerBeat: Math.round(beatIntervalSeconds * params.fps),
        beatCount: beats.length,
        beatTimesSeconds: beats,
        animationPhases: buildAnimationPhases(avgBeats),
      },
  };
};

export const computeAccentSync = (params: {
  slideCount: number;
  fps: number;
  audioDurationSeconds: number;
  beatTimesSeconds: number[];
  beatStrengths: number[];
  slideBeats: number[];
  bpm: number;
  analyzer?: "essentia" | "legacy";
  confidence?: number;
}): {
  slideTimings: SlideTiming[];
  transitionDuration: number;
  slideDuration: number;
  totalDurationFrames: number;
  slideAccentStrengths: number[];
  slideTransitions: (TransitionType | undefined)[];
  slideTransitionDurations: number[];
  sync: MusicSyncInfo;
} => {
  const totalFrames = Math.round(params.audioDurationSeconds * params.fps);
  const slideCount = params.slideCount;
  const beats = params.beatTimesSeconds.filter(
    (t) => t >= 0 && t <= params.audioDurationSeconds + 0.05,
  );
  const strengths =
    params.beatStrengths.length === beats.length
      ? params.beatStrengths
      : beats.map(() => 0.4);

  if (slideCount <= 0) {
    return {
      slideTimings: [],
      transitionDuration: 20,
      slideDuration: 90,
      totalDurationFrames: 0,
      slideAccentStrengths: [],
      slideTransitions: [],
      slideTransitionDurations: [],
      sync: {
        enabled: false,
        mode: "beats",
        audioDurationSeconds: params.audioDurationSeconds,
        bpm: params.bpm,
        beatsPerSlide: params.slideBeats[0] ?? 16,
        framesPerBeat: null,
        beatCount: 0,
        analyzer: params.analyzer,
      },
    };
  }

  if (slideCount === 1) {
    return {
      slideTimings: [{ from: 0, duration: totalFrames }],
      transitionDuration: 0,
      slideDuration: totalFrames,
      totalDurationFrames: totalFrames,
      slideAccentStrengths: [strengths[0] ?? 0.4],
      slideTransitions: [undefined],
      slideTransitionDurations: [0],
      sync: {
        enabled: true,
        mode: "beats",
        audioDurationSeconds: params.audioDurationSeconds,
        bpm: params.bpm,
        beatsPerSlide: params.slideBeats[0] ?? 16,
        framesPerBeat:
          beats.length > 1
            ? Math.round((beats[1] - beats[0]) * params.fps)
            : Math.round((60 / params.bpm) * params.fps),
        beatCount: beats.length,
        beatTimesSeconds: beats,
        accentCount: strengths.filter((s) => s >= 0.55).length,
        analyzer: params.analyzer,
        confidence: params.confidence,
      },
    };
  }

  const beatIntervalSeconds =
    beats.length > 1 ? beats[1] - beats[0] : 60 / params.bpm;
  const defaultTransitionDuration = Math.max(
    8,
    Math.min(Math.round(0.45 * beatIntervalSeconds * params.fps), 24),
  );

  let slideBeats = params.slideBeats.map((b) => Math.max(4, Math.round(b)));
  while (slideBeats.length < slideCount) {
    slideBeats.push(slideBeats[slideBeats.length - 1] ?? 16);
  }
  slideBeats = slideBeats.slice(0, slideCount);

  const targetBeats = Math.floor(beats.length * 0.92);
  const rawTotal = slideBeats.reduce((sum, b) => sum + b, 0);
  if (targetBeats > slideCount * 4 && rawTotal > 0) {
    const scale = targetBeats / rawTotal;
    slideBeats = slideBeats.map((b) =>
      Math.max(4, Math.min(48, Math.round(b * scale))),
    );
  }

  const cutTimes: number[] = [0];
  const cutBeatIndices: number[] = [0];
  let beatCursor = 0;

  for (let slideIndex = 0; slideIndex < slideCount - 1; slideIndex++) {
    const minBeat = beatCursor + Math.max(4, slideBeats[slideIndex] - 3);
    const maxBeat = Math.min(
      beats.length - 1,
      beatCursor + slideBeats[slideIndex] + 4,
    );

    let bestBeat = Math.min(minBeat, maxBeat);
    let bestScore = -1;
    for (let beatIndex = minBeat; beatIndex <= maxBeat; beatIndex++) {
      const progressBias = (beatIndex - minBeat) * 0.015;
      const score = strengths[beatIndex] + progressBias;
      if (score > bestScore) {
        bestScore = score;
        bestBeat = beatIndex;
      }
    }

    beatCursor = bestBeat;
    cutTimes.push(beats[bestBeat]);
    cutBeatIndices.push(bestBeat);
  }

  const slideAccentStrengths: number[] = [];
  const slideTransitions: (TransitionType | undefined)[] = [];
  const slideTransitionDurations: number[] = [];
  const slideTimings: SlideTiming[] = [];

  for (let i = 0; i < slideCount; i++) {
    const enterStrength =
      i === 0 ? 0.4 : strengths[cutBeatIndices[i]] ?? 0.45;
    const exitStrength =
      i < slideCount - 1
        ? strengths[cutBeatIndices[i + 1]] ?? 0.45
        : enterStrength;
    slideAccentStrengths.push(exitStrength);

    const framesPerBeat = Math.round(beatIntervalSeconds * params.fps);
    const transitionDuration =
      i === slideCount - 1
        ? 0
        : pickTransitionDurationForAccent(exitStrength, framesPerBeat);
    slideTransitionDurations.push(transitionDuration);

    slideTransitions.push(
      i === 0 ? undefined : pickTransitionForAccent(enterStrength, i - 1),
    );

    const enterOverlap =
      i === 0 ? 0 : slideTransitionDurations[i - 1] ?? transitionDuration;
    const from =
      i === 0
        ? 0
        : Math.max(0, Math.round(cutTimes[i] * params.fps) - enterOverlap);
    const endFrame =
      i === slideCount - 1
        ? totalFrames
        : Math.round(cutTimes[i + 1] * params.fps);
    slideTimings.push({
      from,
      duration: Math.max(endFrame - from, enterOverlap + 1),
    });
  }

  const avgBeats = Math.round(
    slideBeats.reduce((sum, b) => sum + b, 0) / slideCount,
  );
  const avgDuration = Math.round(
    slideTimings.reduce((sum, t) => sum + t.duration, 0) / slideCount,
  );
  const durations = slideTransitionDurations.filter((value) => value > 0);
  const avgTransition = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : defaultTransitionDuration;

  return {
    slideTimings,
    transitionDuration: avgTransition,
    slideDuration: avgDuration,
    totalDurationFrames: totalFrames,
    slideAccentStrengths,
    slideTransitions,
    slideTransitionDurations,
    sync: {
      enabled: true,
      mode: "beats",
      audioDurationSeconds: params.audioDurationSeconds,
      bpm: params.bpm,
      beatsPerSlide: avgBeats,
      framesPerBeat: Math.round(beatIntervalSeconds * params.fps),
      beatCount: beats.length,
      beatTimesSeconds: beats,
      accentCount: strengths.filter((s) => s >= 0.55).length,
      analyzer: params.analyzer ?? "essentia",
      confidence: params.confidence,
      cutTimesSeconds: cutTimes,
      animationPhases: {
        ...buildAnimationPhases(avgBeats),
        bangStrength: pickBangStrengthForAccent(
          slideAccentStrengths.reduce((max, s) => Math.max(max, s), 0.4),
        ),
      },
    },
  };
};
