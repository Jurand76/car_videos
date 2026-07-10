// @ts-ignore - essentia.js nie ma typów
import { EssentiaWASM, Essentia } from "essentia.js";
import {
  accentStrengthNear,
  buildBeatStrengthsFromAccents,
  detectAccentsFromSamples,
  type AccentPoint,
} from "./accentDetect";
import { decodeAudioToMono } from "./beatDetect";
import { analyzeDynamics, type DynamicFeatures } from "./dynamicAnalysis";

const ESSENTIA_SAMPLE_RATE = 44100;

export type { AccentPoint };
export type { DynamicFeatures } from "./dynamicAnalysis";

export type BeatAnalysis = {
  bpm: number;
  beatTimesSeconds: number[];
  beatStrengths: number[];
  accentPoints: AccentPoint[];
  onsetTimesSeconds: number[];
  confidence: number;
  analyzer: "essentia" | "legacy";
  /** Rozszerzona analiza dynamiki */
  dynamics?: DynamicFeatures;
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

const extractSuperFluxOnsets = (
  essentia: Essentia,
  vector: ReturnType<Essentia["arrayToVector"]>,
  sampleRate: number,
  durationSeconds: number,
): number[] => {
  try {
    const result = essentia.SuperFluxExtractor(vector, sampleRate);
    return vectorToArray(result.onsets).filter(
      (time) => time >= 0 && time <= durationSeconds + 0.05,
    );
  } catch {
    return [];
  }
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

  const bpm = Number(rhythm.bpm) || 120;
  const confidence = Math.min(
    1,
    Number(Number(rhythm.confidence ?? 0).toFixed(2)) / 4,
  );

  const superFluxOnsets = extractSuperFluxOnsets(
    essentia,
    vector,
    ESSENTIA_SAMPLE_RATE,
    durationSeconds,
  );

  const { accentPoints, onsetTimesSeconds } = detectAccentsFromSamples(
    samples,
    ESSENTIA_SAMPLE_RATE,
    durationSeconds,
    [],
    superFluxOnsets,
  );

  const beatStrengths = buildBeatStrengthsFromAccents(
    beats,
    accentPoints,
    samples,
    ESSENTIA_SAMPLE_RATE,
  );

  const beatsWithAccentBias = beatStrengths.map((baseStrength, index) => {
    const accent = accentStrengthNear(accentPoints, beats[index], 0.1);
    return Math.min(1, Math.max(baseStrength, accent * 0.95));
  });

  // Analiza dynamiki utworu
  let dynamics: DynamicFeatures | undefined;
  try {
    dynamics = await analyzeDynamics(filePath, durationSeconds);
  } catch (error) {
    console.warn("Dynamic analysis failed:", error instanceof Error ? error.message : error);
  }

  return {
    bpm: Math.round(bpm),
    beatTimesSeconds: beats,
    beatStrengths: beatsWithAccentBias,
    accentPoints,
    onsetTimesSeconds,
    confidence,
    analyzer: "essentia",
    dynamics,
  };
};
