import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

const SAMPLE_RATE = 22050;
const HOP_SIZE = 512;
const FRAME_SIZE = 2048;

export type AccentPoint = {
  timeSeconds: number;
  strength: number;
};

export type BeatAnalysis = {
  bpm: number;
  beatTimesSeconds: number[];
  beatStrengths: number[];
  accentPoints: AccentPoint[];
  onsetTimesSeconds: number[];
  confidence: number;
  analyzer: "essentia" | "legacy";
};

const mean = (values: Float32Array | number[]) => {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export const decodeAudioToMono = async (
  filePath: string,
  sampleRate = SAMPLE_RATE,
): Promise<Float32Array> => {
  if (!ffmpegStatic) {
    throw new Error("ffmpeg-static niedostępny");
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const ffmpeg = spawn(
      ffmpegStatic,
      [
        "-i",
        filePath,
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", () => {
      // ffmpeg loguje na stderr — ignorujemy
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg zakończył się kodem ${code}`));
        return;
      }
      const buffer = Buffer.concat(chunks);
      resolve(
        new Float32Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength / 4,
        ),
      );
    });
  });
};

const computeOnsetStrength = (samples: Float32Array): Float32Array => {
  const frameCount = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE);
  const energy = new Float32Array(frameCount);
  const strength = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    const start = i * HOP_SIZE;
    let sum = 0;
    for (let j = 0; j < FRAME_SIZE; j++) {
      const sample = samples[start + j];
      sum += sample * sample;
    }
    energy[i] = Math.sqrt(sum / FRAME_SIZE);
  }

  for (let i = 1; i < frameCount; i++) {
    const diff = energy[i] - energy[i - 1];
    strength[i] = diff > 0 ? diff : 0;
  }

  return strength;
};

const pickOnsetPeaks = (strength: Float32Array): number[] => {
  const minDistance = Math.round(0.22 / (HOP_SIZE / SAMPLE_RATE));
  const threshold = mean(strength) * 1.35 + median([...strength]) * 0.45;
  const peaks: number[] = [];

  for (let i = 2; i < strength.length - 2; i++) {
    const value = strength[i];
    if (value < threshold) continue;
    if (
      value >= strength[i - 1] &&
      value >= strength[i - 2] &&
      value >= strength[i + 1] &&
      value >= strength[i + 2]
    ) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
        peaks.push(i);
      }
    }
  }

  return peaks;
};

const frameToSeconds = (frame: number) => (frame * HOP_SIZE) / SAMPLE_RATE;

const estimateBpmFromPeaks = (peakFrames: number[]): number => {
  const intervals: number[] = [];
  for (let i = 1; i < peakFrames.length; i++) {
    const dt = frameToSeconds(peakFrames[i] - peakFrames[i - 1]);
    if (dt >= 0.28 && dt <= 1.2) {
      intervals.push(dt);
    }
  }

  if (intervals.length < 4) {
    return 120;
  }

  const buckets = new Map<number, number>();
  for (const dt of intervals) {
    let bpm = Math.round(60 / dt);
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm = Math.round(bpm / 2);
    const key = Math.round(bpm / 2) * 2;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  let bestBpm = 120;
  let bestScore = -1;
  for (const [bpm, score] of buckets.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  return bestBpm;
};

const buildBeatGrid = (
  durationSeconds: number,
  bpm: number,
  onsetSeconds: number[],
): number[] => {
  const interval = 60 / bpm;
  let bestOffset = 0;
  let bestScore = -1;

  for (let step = 0; step < 48; step++) {
    const offset = (step / 48) * interval;
    let score = 0;
    for (const onset of onsetSeconds) {
      const phase = (onset - offset + interval * 10) % interval;
      const dist = Math.min(phase, interval - phase);
      if (dist < interval * 0.12) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  const beats: number[] = [];
  for (let t = bestOffset; t <= durationSeconds + 0.001; t += interval) {
    if (t <= durationSeconds) {
      beats.push(Number(t.toFixed(4)));
    }
  }

  if (beats.length === 0 || beats[0] > 0.05) {
    beats.unshift(0);
  }

  return beats;
};

const scoreBeatGrid = (
  beats: number[],
  onsetSeconds: number[],
  bpm: number,
): number => {
  if (beats.length < 2 || onsetSeconds.length === 0) return 0;
  const interval = 60 / bpm;
  let hits = 0;
  for (const onset of onsetSeconds.slice(0, 120)) {
    const nearest = beats.reduce((best, beat) => {
      const dist = Math.abs(beat - onset);
      return dist < best ? dist : best;
    }, Number.POSITIVE_INFINITY);
    if (nearest < interval * 0.15) hits++;
  }
  return hits / Math.min(onsetSeconds.length, 120);
};

export const detectBeatsFromSamples = (
  samples: Float32Array,
  durationSeconds: number,
): BeatAnalysis => {
  const strength = computeOnsetStrength(samples);
  const peaks = pickOnsetPeaks(strength);
  const onsetSeconds = peaks.map(frameToSeconds);

  if (onsetSeconds.length < 8) {
    const fallbackBpm = 120;
    const beats = buildBeatGrid(durationSeconds, fallbackBpm, onsetSeconds);
    const beatStrengths = beats.map(() => 0.35);
    return {
      bpm: fallbackBpm,
      beatTimesSeconds: beats,
      beatStrengths,
      accentPoints: beats.map((time, index) => ({
        timeSeconds: time,
        strength: beatStrengths[index],
      })),
      onsetTimesSeconds: onsetSeconds,
      confidence: 0.2,
      analyzer: "legacy",
    };
  }

  const bpm = estimateBpmFromPeaks(peaks);
  const beats = buildBeatGrid(durationSeconds, bpm, onsetSeconds);
  const confidence = scoreBeatGrid(beats, onsetSeconds, bpm);
  const beatStrengths = beats.map((time) => {
    const hit = onsetSeconds.some((o) => Math.abs(o - time) < 0.08);
    return hit ? 0.65 : 0.35;
  });

  return {
    bpm,
    beatTimesSeconds: beats,
    beatStrengths,
    accentPoints: beats.map((time, index) => ({
      timeSeconds: time,
      strength: beatStrengths[index],
    })),
    onsetTimesSeconds: onsetSeconds,
    confidence: Number(Math.min(1, confidence * 2).toFixed(2)),
    analyzer: "legacy",
  };
};

export const detectBeatsFromFile = async (
  filePath: string,
  durationSeconds: number,
): Promise<BeatAnalysis> => {
  const samples = await decodeAudioToMono(filePath);
  return detectBeatsFromSamples(samples, durationSeconds);
};
