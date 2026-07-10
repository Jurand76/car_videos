import {EssentiaWASM, Essentia} from "essentia.js";
import {
  accentStrengthNear,
  buildBeatStrengthsFromAccents,
  detectAccentsFromSamples,
  type AccentPoint,
} from "./accentDetect";
import {decodeAudioToMono} from "./beatDetect";

const ESSENTIA_SAMPLE_RATE = 44100;
const DEFAULT_METHOD = "degara";

export type {AccentPoint};

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

const vectorToArray = (vector: {
  size: () => number;
  get: (i: number) => number;
}) => {
  const values: number[] = [];
  for (let i = 0; i < vector.size(); i++) {
    values.push(vector.get(i));
  }
  return values;
};

const resolveMethod = () => {
  const configured = String(
    process.env.ESSENTIA_RHYTHM_METHOD ?? DEFAULT_METHOD,
  ).toLowerCase();

  return configured === "multifeature" ? "multifeature" : "degara";
};

const resolveTempo = (
  name: "ESSENTIA_MIN_TEMPO" | "ESSENTIA_MAX_TEMPO",
  fallback: number,
) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};

const estimateGridConfidence = (beats: number[]): number => {
  if (beats.length < 4) return 0.15;

  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const interval = beats[i] - beats[i - 1];
    if (interval > 0.15 && interval < 2) {
      intervals.push(interval);
    }
  }

  if (intervals.length < 3) return 0.2;

  const mean =
    intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const variance =
    intervals.reduce(
      (sum, value) => sum + (value - mean) * (value - mean),
      0,
    ) / intervals.length;
  const coefficientOfVariation =
    mean > 1e-6 ? Math.sqrt(variance) / mean : 1;

  return Number(
    Math.max(0.15, Math.min(0.95, 1 - coefficientOfVariation * 4)).toFixed(2),
  );
};

const extractSuperFluxOnsets = (
  essentia: Essentia,
  vector: ReturnType<Essentia["arrayToVector"]>,
  sampleRate: number,
  durationSeconds: number,
): number[] => {
  if (process.env.ESSENTIA_SUPERFLUX !== "1") {
    return [];
  }

  try {
    const startedAt = Date.now();
    const result = essentia.SuperFluxExtractor(vector, sampleRate);
    const onsets = vectorToArray(result.onsets).filter(
      (time) => time >= 0 && time <= durationSeconds + 0.05,
    );

    console.info(
      `[audio] Essentia SuperFlux completed in ${Date.now() - startedAt}ms; ` +
        `onsets=${onsets.length}`,
    );

    return onsets;
  } catch (error) {
    console.warn(
      "[audio] Essentia SuperFlux failed; continuing without it:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
};

export const analyzeWithEssentia = async (
  filePath: string,
  durationSeconds: number,
): Promise<BeatAnalysis> => {
  const totalStartedAt = Date.now();

  const decodeStartedAt = Date.now();
  const samples = await decodeAudioToMono(
    filePath,
    ESSENTIA_SAMPLE_RATE,
  );
  console.info(
    `[audio] ffmpeg decode completed in ${Date.now() - decodeStartedAt}ms; ` +
      `samples=${samples.length}`,
  );

  const essentia = getEssentia();
  const vector = essentia.arrayToVector(samples);
  const method = resolveMethod();
  const minTempo = resolveTempo("ESSENTIA_MIN_TEMPO", 60);
  const maxTempo = resolveTempo("ESSENTIA_MAX_TEMPO", 200);

  const rhythmStartedAt = Date.now();
  let rhythm: ReturnType<Essentia["RhythmExtractor2013"]>;

  try {
    // Signature in essentia.js:
    // RhythmExtractor2013(signal, maxTempo, method, minTempo)
    rhythm = essentia.RhythmExtractor2013(
      vector,
      maxTempo,
      method,
      minTempo,
    );
  } finally {
    console.info(
      `[audio] Essentia RhythmExtractor2013 (${method}) completed in ` +
        `${Date.now() - rhythmStartedAt}ms`,
    );
  }

  const beats = vectorToArray(rhythm.ticks)
    .filter((time) => time >= 0 && time <= durationSeconds + 0.05)
    .map((time) => Number(time.toFixed(4)));

  if (beats.length < 2) {
    throw new Error(
      `Essentia returned too few beats (${beats.length}) for this track.`,
    );
  }

  const bpm = Number(rhythm.bpm) || 120;
  const rawConfidence = Number(rhythm.confidence ?? 0);

  // Degara intentionally reports confidence=0 in Essentia, so calculate a
  // useful regularity score for the UI. Multifeature keeps its native score.
  const confidence =
    method === "degara"
      ? estimateGridConfidence(beats)
      : Number(Math.min(1, Math.max(0, rawConfidence / 4)).toFixed(2));

  const superFluxOnsets = extractSuperFluxOnsets(
    essentia,
    vector,
    ESSENTIA_SAMPLE_RATE,
    durationSeconds,
  );

  const {accentPoints, onsetTimesSeconds} = detectAccentsFromSamples(
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

  const beatsWithAccentBias = beatStrengths.map(
    (baseStrength, index) => {
      const accent = accentStrengthNear(
        accentPoints,
        beats[index],
        0.1,
      );
      return Math.min(1, Math.max(baseStrength, accent * 0.95));
    },
  );

  // Release the WASM-side input vector as soon as possible. Some builds expose
  // delete(), while others rely on the wrapper's lifetime management.
  const deletableVector = vector as {delete?: () => void};
  deletableVector.delete?.();

  console.info(
    `[audio] complete Essentia analysis finished in ` +
      `${Date.now() - totalStartedAt}ms; bpm=${Math.round(bpm)}; ` +
      `beats=${beats.length}; accents=${accentPoints.length}`,
  );

  return {
    bpm: Math.round(bpm),
    beatTimesSeconds: beats,
    beatStrengths: beatsWithAccentBias,
    accentPoints,
    onsetTimesSeconds,
    confidence,
    analyzer: "essentia",
  };
};
