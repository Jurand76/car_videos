import { EssentiaWASM, Essentia } from "essentia.js";
import { decodeAudioToMono } from "./beatDetect";

const ESSENTIA_SAMPLE_RATE = 44100;

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

let essentiaInstance: Essentia | null = null;

const getEssentia = () => {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM);
  }
  return essentiaInstance;
};

const vectorToArray = (vector: { size: () => number; get: (i: number) => number }) => {
  const values: number[] = [];
  for (let i = 0; i < vector.size(); i++) {
    values.push(vector.get(i));
  }
  return values;
};

const rmsAt = (
  samples: Float32Array,
  sampleRate: number,
  timeSeconds: number,
  windowSeconds: number,
) => {
  const center = Math.round(timeSeconds * sampleRate);
  const half = Math.round((windowSeconds * sampleRate) / 2);
  const start = Math.max(0, center - half);
  const end = Math.min(samples.length, center + half);
  if (end <= start) return 0;

  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / (end - start));
};

const normalizeStrengths = (values: number[]) => {
  if (values.length === 0) return values;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-6);
  return values.map((v) => Math.min(1, Math.max(0, (v - min) / span)));
};

const scoreOnsetAt = (onsets: number[], timeSeconds: number, window = 0.07) => {
  let best = 0;
  for (const onset of onsets) {
    const dist = Math.abs(onset - timeSeconds);
    if (dist <= window) {
      best = Math.max(best, 1 - dist / window);
    }
  }
  return best;
};

const buildBeatStrengths = (
  beats: number[],
  onsets: number[],
  samples: Float32Array,
  sampleRate: number,
) => {
  const rmsValues = beats.map((time) => rmsAt(samples, sampleRate, time, 0.09));
  const rmsNorm = normalizeStrengths(rmsValues);

  return beats.map((time, index) => {
    const onsetHit = scoreOnsetAt(onsets, time);
    const downbeat = index % 4 === 0 ? 0.12 : 0;
    const raw = rmsNorm[index] * 0.55 + onsetHit * 0.35 + downbeat;
    return Math.min(1, Math.max(0.08, raw));
  });
};

const buildAccentPoints = (
  beats: number[],
  beatStrengths: number[],
  onsets: number[],
  samples: Float32Array,
  sampleRate: number,
): AccentPoint[] => {
  const points: AccentPoint[] = beats.map((time, index) => ({
    timeSeconds: time,
    strength: beatStrengths[index],
  }));

  for (const onset of onsets) {
    const tooClose = points.some((p) => Math.abs(p.timeSeconds - onset) < 0.06);
    if (tooClose) continue;
    const loudness = rmsAt(samples, sampleRate, onset, 0.06);
    points.push({
      timeSeconds: onset,
      strength: Math.min(1, loudness * 8),
    });
  }

  points.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const accentStrengths = normalizeStrengths(points.map((p) => p.strength));
  return points.map((point, index) => ({
    ...point,
    strength: accentStrengths[index],
  }));
};

export const analyzeWithEssentia = async (
  filePath: string,
  durationSeconds: number,
): Promise<BeatAnalysis> => {
  const samples = await decodeAudioToMono(filePath, ESSENTIA_SAMPLE_RATE);
  const essentia = getEssentia();
  const vector = essentia.arrayToVector(samples);

  const rhythm = essentia.RhythmExtractor2013(vector);
  const beats = vectorToArray(rhythm.ticks).filter(
    (time) => time >= 0 && time <= durationSeconds + 0.05,
  );

  const onsetResult = essentia.OnsetRate(vector);
  const onsets = vectorToArray(onsetResult.onsets).filter(
    (time) => time >= 0 && time <= durationSeconds + 0.05,
  );

  const bpm = Number(rhythm.bpm) || 120;
  const confidence = Math.min(
    1,
    Number(Number(rhythm.confidence ?? 0).toFixed(2)) / 4,
  );

  const beatStrengths = buildBeatStrengths(beats, onsets, samples, ESSENTIA_SAMPLE_RATE);
  const accentPoints = buildAccentPoints(
    beats,
    beatStrengths,
    onsets,
    samples,
    ESSENTIA_SAMPLE_RATE,
  );

  return {
    bpm: Math.round(bpm),
    beatTimesSeconds: beats,
    beatStrengths,
    accentPoints,
    onsetTimesSeconds: onsets,
    confidence,
    analyzer: "essentia",
  };
};
